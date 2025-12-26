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
  const [openChapterMenuId, setOpenChapterMenuId] = useState(null);
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newChapterName, setNewChapterName] = useState("");
  const [newChapterDescription, setNewChapterDescription] = useState("");
  const [currentAppId, setCurrentAppId] = useState(null);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [hasPageMin, setHasPageMin] = useState(false);
  const [pageMin, setPageMin] = useState("");
  const [hasPageMax, setHasPageMax] = useState(false);
  const [pageMax, setPageMax] = useState("");
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
    if ((!newChapterName.trim() && !newChapterDescription.trim()) || !user)
      return;

    setSaving(true);
    try {
      // Get or create a single book for the user
      let bookId = null;
      if (applications.length > 0) {
        bookId = applications[0].id;
      } else {
        // Create a default book if none exists
        const bookDoc = await addDoc(collection(db, "applications"), {
          userId: user.uid,
          name: "My Book",
          type: "competition",
          createdAt: serverTimestamp(),
        });
        bookId = bookDoc.id;
      }

      // Now add the chapter to the book
      const app = applications.find((a) => a.id === bookId) || {
        questions: [],
      };
      const nextOrder = app.questions ? app.questions.length : 0;

      const questionData = {
        text: newChapterName.trim() || "Untitled Chapter",
        description: newChapterDescription.trim() || "",
        order: nextOrder,
        createdAt: serverTimestamp(),
      };

      const questionRef = await addDoc(
        collection(db, "applications", bookId, "questions"),
        questionData
      );

      // Wait a moment for Firestore to process
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Refresh applications
      await fetchApplications();

      // Fetch the updated questions to find the index
      const questionsQuery = query(
        collection(db, "applications", bookId, "questions"),
        orderBy("order", "asc")
      );
      const questionsSnapshot = await getDocs(questionsQuery);
      const questions = [];
      questionsSnapshot.forEach((qDoc) => {
        questions.push({ id: qDoc.id, ...qDoc.data() });
      });

      const questionIndex = questions.findIndex((q) => q.id === questionRef.id);

      // Close modal and reset
      setShowAddModal(false);
      setNewAppName("");
      setNewChapterName("");
      setNewChapterDescription("");

      // Navigate to the new chapter
      if (questionIndex !== -1) {
        navigate(`/write/${bookId}/${questionIndex}`);
      } else {
        navigate(`/write/${bookId}/${questions.length - 1}`);
      }
    } catch (error) {
      console.error("Error creating chapter:", error);
      alert(`Failed to create chapter: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddClick = () => {
    // If no book exists, we need to create one first, but for now just show the chapter modal
    // The handleAddApplication will handle creating a book if needed
    setShowAddModal(true);
    setNewAppName("");
    setNewChapterName("");
    setNewChapterDescription("");
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewAppName("");
    setNewChapterName("");
    setNewChapterDescription("");
  };

  const handleAddQuestionClick = (appId, e) => {
    e.stopPropagation();
    setCurrentAppId(appId);
    setNewQuestionText("");
    setNewChapterName("");
    setNewChapterDescription("");
    setHasPageMin(false);
    setPageMin("");
    setHasPageMax(false);
    setPageMax("");
    setShowAddQuestionModal(true);
  };

  const handleAddQuestion = async () => {
    if (
      (!newChapterName.trim() && !newChapterDescription.trim()) ||
      !currentAppId ||
      savingQuestion
    )
      return;

    setSavingQuestion(true);
    try {
      // Get the current application to find the next order number
      const app = applications.find((a) => a.id === currentAppId);
      const nextOrder = app && app.questions ? app.questions.length : 0;

      // Prepare question data
      const questionData = {
        text: newChapterName.trim() || "Untitled Chapter",
        description: newChapterDescription.trim() || "",
        order: nextOrder,
        createdAt: serverTimestamp(),
      };

      // Add page constraints if specified
      if (hasPageMin && pageMin.trim()) {
        questionData.pageMin = parseInt(pageMin.trim());
      }
      if (hasPageMax && pageMax.trim()) {
        questionData.pageMax = parseInt(pageMax.trim());
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
      setNewChapterName("");
      setNewChapterDescription("");
      setHasPageMin(false);
      setPageMin("");
      setHasPageMax(false);
      setPageMax("");
      setCurrentAppId(null);
    } catch (error) {
      console.error("Error creating question:", error);
      alert(`Failed to create chapter: ${error.message}`);
    } finally {
      setSavingQuestion(false);
    }
  };

  const closeAddQuestionModal = () => {
    setShowAddQuestionModal(false);
    setNewQuestionText("");
    setNewChapterName("");
    setNewChapterDescription("");
    setHasPageMin(false);
    setPageMin("");
    setHasPageMax(false);
    setPageMax("");
    setCurrentAppId(null);
  };

  const handleDelete = async (appId) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this book? This will also delete all associated chapters."
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
      alert("Failed to delete book. Please try again.");
    }
  };

  const handleMenuToggle = (appId, e) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === appId ? null : appId);
  };

  const handleChapterMenuToggle = (chapterId, e) => {
    e.stopPropagation();
    setOpenChapterMenuId(openChapterMenuId === chapterId ? null : chapterId);
  };

  const handleDeleteChapter = async (chapterId, appId) => {
    if (!window.confirm("Are you sure you want to delete this chapter?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "applications", appId, "questions", chapterId));
      // Refresh applications
      await fetchApplications();
      setOpenChapterMenuId(null);
    } catch (error) {
      console.error("Error deleting chapter:", error);
      alert("Failed to delete chapter. Please try again.");
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        !event.target.closest(".dropdown-menu") &&
        !event.target.closest(".application-actions") &&
        !event.target.closest(".question-actions")
      ) {
        setOpenMenuId(null);
        setOpenChapterMenuId(null);
      }
    };

    if (openMenuId || openChapterMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuId, openChapterMenuId]);

  return (
    <div className="write-page">
      <main className="main-content">
        <div className="write-container">
          <div className="write-header">
            <h1 className="write-title">Your Chapters</h1>
            <p className="write-description">
              Manage and work on your book chapters.
            </p>
          </div>

          {user ? (
            loading ? (
              <div className="loading-message">
                <p>Loading...</p>
              </div>
            ) : (
              (() => {
                // Flatten all chapters from all books into a single list
                const allChapters = [];
                let globalIndex = 0;
                applications.forEach((app) => {
                  if (app.questions && app.questions.length > 0) {
                    app.questions.forEach((question, localIndex) => {
                      allChapters.push({
                        ...question,
                        appId: app.id,
                        globalIndex: globalIndex++,
                        localIndex: localIndex,
                      });
                    });
                  }
                });

                if (allChapters.length > 0 || applications.length > 0) {
                  return (
                    <div className="applications-section">
                      <div className="applications-header">
                        <h2 className="applications-title">Chapters</h2>
                        <button
                          className="add-button"
                          onClick={() => {
                            // Use the first book, or create one if none exists
                            if (applications.length > 0) {
                              handleAddQuestionClick(applications[0].id, {
                                stopPropagation: () => {},
                              });
                            } else {
                              // Need to create a book first, then add chapter
                              handleAddClick();
                            }
                          }}
                        >
                          <i className="far fa-plus"></i>
                          <span>New Chapter</span>
                        </button>
                      </div>

                      <div className="questions-list">
                        {allChapters.length > 0 ? (
                          allChapters.map((chapter) => (
                            <div
                              key={chapter.id || chapter.globalIndex}
                              className="question-item"
                              onClick={() =>
                                navigate(
                                  `/write/${chapter.appId}/${chapter.localIndex}`
                                )
                              }
                            >
                              <div className="question-number">
                                {chapter.globalIndex + 1}
                              </div>
                              <div className="question-text">
                                {chapter.text}
                              </div>
                              <div className="question-actions-wrapper">
                                <button
                                  className="question-actions"
                                  onClick={(e) =>
                                    handleChapterMenuToggle(chapter.id, e)
                                  }
                                >
                                  <i className="fa fa-ellipsis-vertical"></i>
                                </button>
                                {openChapterMenuId === chapter.id && (
                                  <div className="dropdown-menu">
                                    <button
                                      className="dropdown-item delete"
                                      onClick={() =>
                                        handleDeleteChapter(
                                          chapter.id,
                                          chapter.appId
                                        )
                                      }
                                    >
                                      <i className="far fa-trash-can"></i>
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="empty-questions">
                            <p>No chapters yet. Add one to get started.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="empty-state">
                      <p className="empty-state-text">
                        You haven't created any chapters yet. Add your first
                        chapter to begin writing your book.
                      </p>
                      <button
                        className="add-button empty-state-button"
                        onClick={handleAddClick}
                      >
                        <i className="far fa-plus"></i>
                        <span>New Chapter</span>
                      </button>
                    </div>
                  );
                }
              })()
            )
          ) : (
            <div className="login-message">
              <p className="login-message-text">
                Please log in to view or create any chapters.
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
            <h2 className="modal-title">New Chapter</h2>
            <p className="modal-subtitle">
              Enter a name and description for your chapter
            </p>
            <input
              type="text"
              className="modal-input"
              placeholder="Chapter name"
              value={newChapterName}
              onChange={(e) => setNewChapterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  document.querySelector(".modal-textarea")?.focus();
                }
              }}
              autoFocus
            />
            <textarea
              className="modal-textarea"
              placeholder="Chapter description (what should this chapter be about?)"
              value={newChapterDescription}
              onChange={(e) => setNewChapterDescription(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  e.ctrlKey &&
                  (newChapterName.trim() || newChapterDescription.trim()) &&
                  !saving
                ) {
                  e.preventDefault();
                  handleAddApplication();
                }
              }}
              rows={4}
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
                disabled={
                  (!newChapterName.trim() && !newChapterDescription.trim()) ||
                  saving
                }
              >
                {saving ? "Creating..." : "Create Chapter"}
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
            <h2 className="modal-title">New Chapter</h2>
            <p className="modal-subtitle">
              Enter a name and description for your chapter
            </p>
            <input
              type="text"
              className="modal-input"
              placeholder="Chapter name"
              value={newChapterName}
              onChange={(e) => setNewChapterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  document
                    .querySelector(".add-question-modal .modal-textarea")
                    ?.focus();
                }
              }}
              autoFocus
            />
            <textarea
              className="modal-textarea"
              placeholder="Chapter description (what should this chapter be about?)"
              value={newChapterDescription}
              onChange={(e) => setNewChapterDescription(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  e.ctrlKey &&
                  (newChapterName.trim() || newChapterDescription.trim()) &&
                  !savingQuestion
                ) {
                  e.preventDefault();
                  handleAddQuestion();
                }
              }}
              rows={4}
            />

            <div className="word-constraints-section">
              <div className="word-constraint-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasPageMin}
                    onChange={(e) => setHasPageMin(e.target.checked)}
                  />
                  <span>Page Minimum</span>
                </label>
                {hasPageMin && (
                  <input
                    type="number"
                    className="word-constraint-input"
                    placeholder="Min pages"
                    value={pageMin}
                    onChange={(e) => setPageMin(e.target.value)}
                    min="1"
                  />
                )}
              </div>

              <div className="word-constraint-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasPageMax}
                    onChange={(e) => setHasPageMax(e.target.checked)}
                  />
                  <span>Page Maximum</span>
                </label>
                {hasPageMax && (
                  <input
                    type="number"
                    className="word-constraint-input"
                    placeholder="Max pages"
                    value={pageMax}
                    onChange={(e) => setPageMax(e.target.value)}
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
                disabled={
                  (!newChapterName.trim() && !newChapterDescription.trim()) ||
                  savingQuestion
                }
              >
                {savingQuestion ? "Adding..." : "Add Chapter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Write;
