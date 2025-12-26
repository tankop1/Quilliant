import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import "../App.css";

function Write() {
  const [expandedApp, setExpandedApp] = useState(null);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [saving, setSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [currentAppId, setCurrentAppId] = useState(null);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [hasWordMin, setHasWordMin] = useState(false);
  const [wordMin, setWordMin] = useState("");
  const [hasWordMax, setHasWordMax] = useState(false);
  const [wordMax, setWordMax] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();

  const fetchApplications = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "applications"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const apps = [];
      for (const doc of querySnapshot.docs) {
        const appData = { id: doc.id, ...doc.data() };
        // Fetch questions for each application
        const questionsQuery = query(
          collection(db, "applications", doc.id, "questions"),
          orderBy("order", "asc")
        );
        const questionsSnapshot = await getDocs(questionsQuery);
        const questions = [];
        questionsSnapshot.forEach((qDoc) => {
          questions.push({ id: qDoc.id, ...qDoc.data() });
        });
        appData.questions = questions;
        apps.push(appData);
      }
      setApplications(apps);
    } catch (error) {
      console.error("Error fetching applications:", error);
      // Fallback if orderBy fails
      try {
        const q = query(
          collection(db, "applications"),
          where("userId", "==", user.uid)
        );
        const querySnapshot = await getDocs(q);
        const apps = [];
        for (const doc of querySnapshot.docs) {
          const appData = { id: doc.id, ...doc.data() };
          const questionsQuery = query(
            collection(db, "applications", doc.id, "questions"),
            orderBy("order", "asc")
          );
          const questionsSnapshot = await getDocs(questionsQuery);
          const questions = [];
          questionsSnapshot.forEach((qDoc) => {
            questions.push({ id: qDoc.id, ...qDoc.data() });
          });
          appData.questions = questions;
          apps.push(appData);
        }
        // Sort manually
        apps.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        });
        setApplications(apps);
      } catch (fallbackError) {
        console.error("Error fetching applications (fallback):", fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      setLoading(true);
      fetchApplications();
    } else {
      setLoading(false);
    }
  }, [user]);

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    const diffInWeeks = Math.floor(diffInDays / 7);

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60)
      return `${diffInMinutes} minute${diffInMinutes > 1 ? "s" : ""} ago`;
    if (diffInHours < 24)
      return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`;
    if (diffInDays < 7)
      return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;
    if (diffInWeeks < 4)
      return `${diffInWeeks} week${diffInWeeks > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  };

  const getApplicationIcon = (type) => {
    switch (type) {
      case "incubator":
        return "fa fa-building";
      case "competition":
        return "fa fa-trophy";
      case "accelerator":
        return "fa fa-rocket";
      case "pitch":
        return "fa fa-microphone";
      default:
        return "fa fa-file-lines";
    }
  };

  const handleAddApplication = async () => {
    if (!newAppName.trim() || !user) return;

    setSaving(true);
    try {
      await addDoc(collection(db, "applications"), {
        userId: user.uid,
        name: newAppName.trim(),
        type: "competition", // Default type
        createdAt: serverTimestamp(),
      });

      // Close modal and reset
      setShowAddModal(false);
      setNewAppName("");

      // Wait a moment for Firestore to process
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Refresh applications
      await fetchApplications();
    } catch (error) {
      console.error("Error creating application:", error);
      alert(`Failed to create application: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddClick = () => {
    setShowAddModal(true);
    setNewAppName("");
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewAppName("");
  };

  const handleAddQuestionClick = (appId, e) => {
    e.stopPropagation();
    setCurrentAppId(appId);
    setNewQuestionText("");
    setHasWordMin(false);
    setWordMin("");
    setHasWordMax(false);
    setWordMax("");
    setShowAddQuestionModal(true);
  };

  const handleAddQuestion = async () => {
    if (!newQuestionText.trim() || !currentAppId || savingQuestion) return;

    setSavingQuestion(true);
    try {
      // Get the current application to find the next order number
      const app = applications.find((a) => a.id === currentAppId);
      const nextOrder = app && app.questions ? app.questions.length : 0;

      // Prepare question data
      const questionData = {
        text: newQuestionText.trim(),
        order: nextOrder,
        createdAt: serverTimestamp(),
      };

      // Add word constraints if specified
      if (hasWordMin && wordMin.trim()) {
        questionData.wordMin = parseInt(wordMin.trim());
      }
      if (hasWordMax && wordMax.trim()) {
        questionData.wordMax = parseInt(wordMax.trim());
      }

      // Add the question to Firestore
      const questionRef = await addDoc(
        collection(db, "applications", currentAppId, "questions"),
        questionData
      );

      // Wait a moment for Firestore to process
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Fetch the updated questions for this application to find the index
      const questionsQuery = query(
        collection(db, "applications", currentAppId, "questions"),
        orderBy("order", "asc")
      );
      const questionsSnapshot = await getDocs(questionsQuery);
      const questions = [];
      questionsSnapshot.forEach((qDoc) => {
        questions.push({ id: qDoc.id, ...qDoc.data() });
      });

      // Find the index of the newly created question
      const questionIndex = questions.findIndex((q) => q.id === questionRef.id);

      // Refresh applications list
      await fetchApplications(false);

      // Navigate to the question page
      if (questionIndex !== -1) {
        navigate(`/write/${currentAppId}/${questionIndex}`);
      } else {
        // Fallback: navigate to the last question (should be the one we just added)
        navigate(`/write/${currentAppId}/${questions.length - 1}`);
      }

      // Close modal and reset form
      setShowAddQuestionModal(false);
      setNewQuestionText("");
      setHasWordMin(false);
      setWordMin("");
      setHasWordMax(false);
      setWordMax("");
      setCurrentAppId(null);
    } catch (error) {
      console.error("Error creating question:", error);
      alert(`Failed to create question: ${error.message}`);
    } finally {
      setSavingQuestion(false);
    }
  };

  const closeAddQuestionModal = () => {
    setShowAddQuestionModal(false);
    setNewQuestionText("");
    setHasWordMin(false);
    setWordMin("");
    setHasWordMax(false);
    setWordMax("");
    setCurrentAppId(null);
  };

  const handleDelete = async (appId) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this application? This will also delete all associated questions."
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, "applications", appId));
      // Refresh applications
      await fetchApplications();
      setOpenMenuId(null);
    } catch (error) {
      console.error("Error deleting application:", error);
      alert("Failed to delete application. Please try again.");
    }
  };

  const handleMenuToggle = (appId, e) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === appId ? null : appId);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        !event.target.closest(".dropdown-menu") &&
        !event.target.closest(".application-actions")
      ) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuId]);

  return (
    <div className="write-page">
      <main className="main-content">
        <div className="write-container">
          <div className="write-header">
            <h1 className="write-title">Your Applications</h1>
            <p className="write-description">
              Manage and work on applications for pitch competitions,
              incubators, and accelerators.
            </p>
          </div>

          {user ? (
            loading ? (
              <div className="loading-message">
                <p>Loading...</p>
              </div>
            ) : applications.length > 0 ? (
              <div className="applications-section">
                <div className="applications-header">
                  <h2 className="applications-title">Application Library</h2>
                  <button className="add-button" onClick={handleAddClick}>
                    <i className="far fa-plus"></i>
                    <span>New Application</span>
                  </button>
                </div>

                <div className="applications-list">
                  {applications.map((app) => (
                    <div key={app.id} className="application-wrapper">
                      <div
                        className="application-item"
                        onClick={() =>
                          setExpandedApp(expandedApp === app.id ? null : app.id)
                        }
                      >
                        <div className="application-icon">
                          <i className={getApplicationIcon(app.type)}></i>
                        </div>
                        <div className="application-info">
                          <div className="application-name">{app.name}</div>
                          <div className="application-question">
                            {app.questions && app.questions.length > 0
                              ? app.questions[0].text
                              : "No questions yet"}
                          </div>
                          <div className="application-date">
                            {formatDate(app.createdAt)}
                          </div>
                        </div>
                        <div className="application-expand">
                          <i
                            className={`fa fa-chevron-${
                              expandedApp === app.id ? "up" : "down"
                            }`}
                          ></i>
                        </div>
                        <div className="application-actions-wrapper">
                          <button
                            className="application-actions"
                            onClick={(e) => handleMenuToggle(app.id, e)}
                          >
                            <i className="fa fa-ellipsis-vertical"></i>
                          </button>
                          {openMenuId === app.id && (
                            <div className="dropdown-menu">
                              <button
                                className="dropdown-item delete"
                                onClick={() => handleDelete(app.id)}
                              >
                                <i className="far fa-trash-can"></i>
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {expandedApp === app.id && (
                        <div className="questions-section">
                          <div className="questions-header">
                            <h3 className="questions-title">Questions</h3>
                            <button
                              className="add-question-button"
                              onClick={(e) => handleAddQuestionClick(app.id, e)}
                            >
                              <i className="far fa-plus"></i>
                              <span>Add Question</span>
                            </button>
                          </div>
                          <div className="questions-list">
                            {app.questions && app.questions.length > 0 ? (
                              app.questions.map((question, index) => (
                                <div
                                  key={question.id || index}
                                  className="question-item"
                                  onClick={() =>
                                    navigate(`/write/${app.id}/${index}`)
                                  }
                                >
                                  <div className="question-number">
                                    {index + 1}
                                  </div>
                                  <div className="question-text">
                                    {question.text}
                                  </div>
                                  <button
                                    className="question-actions"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    }}
                                  >
                                    <i className="fa fa-ellipsis-vertical"></i>
                                  </button>
                                </div>
                              ))
                            ) : (
                              <div className="empty-questions">
                                <p>No questions yet. Add one to get started.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p className="empty-state-text">
                  You haven't created any applications yet. Create one to begin
                  working on your applications.
                </p>
                <button
                  className="add-button empty-state-button"
                  onClick={handleAddClick}
                >
                  <i className="far fa-plus"></i>
                  <span>New Application</span>
                </button>
              </div>
            )
          ) : (
            <div className="login-message">
              <p className="login-message-text">
                Please log in to view or create any applications.
              </p>
            </div>
          )}
        </div>
      </main>

      {showAddModal && (
        <div className="modal-overlay" onClick={closeAddModal}>
          <div
            className="modal-content add-app-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={closeAddModal}>
              <i className="fa fa-times"></i>
            </button>
            <h2 className="modal-title">New Application</h2>
            <p className="modal-subtitle">Enter a name for your application</p>
            <input
              type="text"
              className="modal-input"
              placeholder="Application name"
              value={newAppName}
              onChange={(e) => setNewAppName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newAppName.trim() && !saving) {
                  handleAddApplication();
                }
              }}
              autoFocus
            />
            <div className="modal-actions">
              <button
                className="modal-button-secondary"
                onClick={closeAddModal}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="modal-button-primary"
                onClick={handleAddApplication}
                disabled={!newAppName.trim() || saving}
              >
                {saving ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddQuestionModal && (
        <div className="modal-overlay" onClick={closeAddQuestionModal}>
          <div
            className="modal-content add-question-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={closeAddQuestionModal}>
              <i className="fa fa-times"></i>
            </button>
            <h2 className="modal-title">New Question</h2>
            <p className="modal-subtitle">Enter the question text</p>
            <textarea
              className="modal-textarea"
              placeholder="What is your question?"
              value={newQuestionText}
              onChange={(e) => setNewQuestionText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  e.ctrlKey &&
                  newQuestionText.trim() &&
                  !savingQuestion
                ) {
                  e.preventDefault();
                  handleAddQuestion();
                }
              }}
              rows={4}
              autoFocus
            />

            <div className="word-constraints-section">
              <div className="word-constraint-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasWordMin}
                    onChange={(e) => setHasWordMin(e.target.checked)}
                  />
                  <span>Word Minimum</span>
                </label>
                {hasWordMin && (
                  <input
                    type="number"
                    className="word-constraint-input"
                    placeholder="Min words"
                    value={wordMin}
                    onChange={(e) => setWordMin(e.target.value)}
                    min="1"
                  />
                )}
              </div>

              <div className="word-constraint-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasWordMax}
                    onChange={(e) => setHasWordMax(e.target.checked)}
                  />
                  <span>Word Maximum</span>
                </label>
                {hasWordMax && (
                  <input
                    type="number"
                    className="word-constraint-input"
                    placeholder="Max words"
                    value={wordMax}
                    onChange={(e) => setWordMax(e.target.value)}
                    min="1"
                  />
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="modal-button-secondary"
                onClick={closeAddQuestionModal}
                disabled={savingQuestion}
              >
                Cancel
              </button>
              <button
                className="modal-button-primary"
                onClick={handleAddQuestion}
                disabled={!newQuestionText.trim() || savingQuestion}
              >
                {savingQuestion ? "Adding..." : "Add Question"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Write;
