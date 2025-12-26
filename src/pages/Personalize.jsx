import { useState, useEffect, useRef } from "react";
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
import { cloudinaryConfig, cloudinaryUploadUrl } from "../config/cloudinary";
import "../App.css";

function Personalize() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState("type"); // "type", "file", or "text"
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [textContent, setTextContent] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [pdfPages, setPdfPages] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const fileInputRef = useRef(null);
  const pdfContainerRef = useRef(null);

  const fetchDocuments = async (setLoadingState = true) => {
    if (!user) return;
    if (setLoadingState) setLoading(true);
    try {
      const q = query(
        collection(db, "personalizations"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const docs = [];
      querySnapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      setDocuments(docs);
    } catch (error) {
      console.error("Error fetching documents:", error);
      // If orderBy fails (no index), try without it
      try {
        const q = query(
          collection(db, "personalizations"),
          where("userId", "==", user.uid)
        );
        const querySnapshot = await getDocs(q);
        const docs = [];
        querySnapshot.forEach((doc) => {
          docs.push({ id: doc.id, ...doc.data() });
        });
        // Sort manually by createdAt if available
        docs.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        });
        setDocuments(docs);
      } catch (fallbackError) {
        console.error("Error fetching documents (fallback):", fallbackError);
      }
    } finally {
      if (setLoadingState) setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      setLoading(true);
      fetchDocuments();
    } else {
      setLoading(false);
    }
  }, [user]);

  const formatDate = (timestamp) => {
    if (!timestamp) return "Just now";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
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
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Just now";
    }
  };

  const getFileIcon = (type) => {
    switch (type) {
      case "pdf":
        return "far fa-file-pdf";
      case "image":
        return "far fa-image";
      case "document":
        return "far fa-file-lines";
      case "text":
        return "far fa-file-lines";
      default:
        return "far fa-file";
    }
  };

  const handleAddClick = () => {
    setShowModal(true);
    setModalStep("type");
    setSelectedFiles([]);
    setTextContent("");
  };

  const handleTypeSelect = (type) => {
    setModalStep(type);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getFileType = (fileName) => {
    const ext = fileName.split(".").pop().toLowerCase();
    if (ext === "pdf") return "pdf";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext))
      return "image";
    return "document";
  };

  const handleSave = async () => {
    if (modalStep === "file" && selectedFiles.length === 0) return;
    if (modalStep === "text" && !textContent.trim()) return;
    if (!user) return;

    setSaving(true);
    try {
      if (modalStep === "file") {
        // Upload files to Cloudinary and save metadata to Firestore
        const savePromises = selectedFiles.map(async (file) => {
          const fileType = getFileType(file.name);

          // Upload file to Cloudinary
          const formData = new FormData();
          formData.append("file", file);
          formData.append("upload_preset", cloudinaryConfig.uploadPreset);
          formData.append("folder", `quilliant/${user.uid}`); // Organize by user

          // For PDFs, use raw resource type instead of image
          if (fileType === "pdf") {
            formData.append("resource_type", "raw");
          }

          const uploadResponse = await fetch(cloudinaryUploadUrl, {
            method: "POST",
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error(
              `Failed to upload file: ${uploadResponse.statusText}`
            );
          }

          const uploadData = await uploadResponse.json();
          // For raw files, use secure_url or construct the URL properly
          let downloadURL = uploadData.secure_url || uploadData.url;

          // If it's a PDF and the URL uses /image/upload/, convert it to /raw/upload/
          if (fileType === "pdf" && downloadURL.includes("/image/upload/")) {
            downloadURL = downloadURL.replace("/image/upload/", "/raw/upload/");
          }

          // Save metadata to Firestore
          return addDoc(collection(db, "personalizations"), {
            userId: user.uid,
            name: file.name,
            type: fileType,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            downloadURL: downloadURL,
            cloudinaryPublicId: uploadData.public_id, // Store for potential deletion
            createdAt: serverTimestamp(),
          });
        });
        const results = await Promise.all(savePromises);
        console.log("Saved files:", results);
      } else if (modalStep === "text") {
        const result = await addDoc(collection(db, "personalizations"), {
          userId: user.uid,
          name: "Text Context",
          type: "text",
          content: textContent,
          createdAt: serverTimestamp(),
        });
        console.log("Saved text:", result.id);
      }

      // Close modal first
      setShowModal(false);
      setModalStep("type");
      setSelectedFiles([]);
      setTextContent("");

      // Wait a moment for Firestore to process
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Refresh documents
      await fetchDocuments(false);

      console.log("Documents refreshed");
    } catch (error) {
      console.error("Error saving personalization:", error);
      alert(`Failed to save context: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setModalStep("type");
    setSelectedFiles([]);
    setTextContent("");
  };

  const handleDelete = async (docId) => {
    if (!window.confirm("Are you sure you want to delete this context item?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "personalizations", docId));
      // Refresh documents
      await fetchDocuments(false);
      setOpenMenuId(null);
    } catch (error) {
      console.error("Error deleting personalization:", error);
      alert("Failed to delete context item. Please try again.");
    }
  };

  const handleMenuToggle = (docId, e) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === docId ? null : docId);
  };

  // Load PDF using PDF.js - Simplified and robust approach
  useEffect(() => {
    const loadPDF = async () => {
      if (
        !previewItem ||
        previewItem.type !== "pdf" ||
        !previewItem.downloadURL
      ) {
        return;
      }

      setPdfLoading(true);
      setPdfError(null);
      setPdfPages([]);

      try {
        // Check if pdfjsLib is available
        if (typeof window.pdfjsLib === "undefined") {
          throw new Error(
            "PDF.js library not loaded. Please refresh the page."
          );
        }

        // Set worker source
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const originalUrl = previewItem.downloadURL;
        const cloudName = cloudinaryConfig.cloudName;

        // Build URLs to try - prioritize the original URL first
        const urlsToTry = [originalUrl];

        // If we have a public_id, construct URLs using it
        if (previewItem.cloudinaryPublicId) {
          const publicId = previewItem.cloudinaryPublicId;

          // For raw resource type (new uploads)
          urlsToTry.push(
            `https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}`
          );

          // For image resource type (old uploads) - try both with and without version
          urlsToTry.push(
            `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`
          );

          // Try with version number (common format)
          const versionMatch = originalUrl.match(/\/v\d+\//);
          if (versionMatch) {
            const version = versionMatch[0];
            urlsToTry.push(
              `https://res.cloudinary.com/${cloudName}/raw/upload${version}${publicId}`
            );
            urlsToTry.push(
              `https://res.cloudinary.com/${cloudName}/image/upload${version}${publicId}`
            );
          }
        }

        // If original URL uses /image/upload/, also try /raw/upload/ version
        if (originalUrl.includes("/image/upload/")) {
          const rawUrl = originalUrl.replace("/image/upload/", "/raw/upload/");
          if (!urlsToTry.includes(rawUrl)) {
            urlsToTry.push(rawUrl);
          }
        }

        // Remove duplicates while preserving order
        const uniqueUrls = Array.from(new Set(urlsToTry));

        // Try fetching from each URL
        let arrayBuffer = null;
        let lastError = null;

        for (const url of uniqueUrls) {
          try {
            const response = await fetch(url, {
              method: "GET",
              mode: "cors",
              credentials: "omit",
            });

            if (response.ok) {
              // Check if response is actually a PDF
              const contentType = response.headers.get("content-type");
              if (contentType && contentType.includes("application/pdf")) {
                arrayBuffer = await response.arrayBuffer();
                console.log("Successfully loaded PDF from:", url);
                break;
              } else {
                // Not a PDF, try next URL
                console.warn(
                  `URL returned non-PDF content type: ${contentType}`
                );
                lastError = new Error(
                  `URL returned ${contentType} instead of PDF`
                );
              }
            } else {
              lastError = new Error(
                `HTTP ${response.status}: ${response.statusText}`
              );
            }
          } catch (fetchError) {
            lastError = fetchError;
          }
        }

        if (!arrayBuffer) {
          throw new Error(
            `Unable to load PDF. The file may have been deleted or the URL is invalid. ` +
              `Please try re-uploading the PDF file. ` +
              `(Error: ${lastError?.message || "Unknown error"})`
          );
        }

        // Load the PDF from arrayBuffer
        const loadingTask = window.pdfjsLib.getDocument({
          data: arrayBuffer,
        });

        const pdf = await loadingTask.promise;
        const pages = [];

        // Render all pages
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          canvas.style.maxWidth = "100%";
          canvas.style.height = "auto";
          canvas.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
          canvas.style.borderRadius = "4px";

          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;

          pages.push({
            pageNum,
            canvas,
            height: viewport.height,
            width: viewport.width,
          });
        }

        setPdfPages(pages);
      } catch (error) {
        console.error("Error loading PDF:", error);
        setPdfError(error.message);
      } finally {
        setPdfLoading(false);
      }
    };

    loadPDF();
  }, [previewItem]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        !event.target.closest(".dropdown-menu") &&
        !event.target.closest(".document-actions") &&
        !event.target.closest(".text-item-actions")
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
    <div className="personalize-page">
      <main className="main-content">
        <div className="personalize-container">
          <div className="personalize-header">
            <h1 className="personalize-title">Book Context</h1>
            <p className="personalize-description">
              Add documents, images, and information about your book to help AI
              generate chapters.
            </p>
          </div>

          {user ? (
            loading ? (
              <div className="loading-message">
                <p>Loading...</p>
              </div>
            ) : documents.length > 0 ? (
              <div className="documents-section">
                <div className="documents-header">
                  <h2 className="documents-title">Your Context</h2>
                  <button className="add-button" onClick={handleAddClick}>
                    <i className="far fa-plus"></i>
                    <span>Add Context</span>
                  </button>
                </div>

                <div className="documents-list">
                  {documents.map((doc) =>
                    doc.type === "text" ? (
                      <div key={doc.id} className="text-item">
                        <div className="text-item-content">
                          <div className="text-item-text">
                            {doc.content || ""}
                          </div>
                          <div className="text-item-date">
                            {formatDate(doc.createdAt)}
                          </div>
                        </div>
                        <div className="text-item-actions-wrapper">
                          <button
                            className="text-item-actions"
                            onClick={(e) => handleMenuToggle(doc.id, e)}
                          >
                            <i className="fa fa-ellipsis-vertical"></i>
                          </button>
                          {openMenuId === doc.id && (
                            <div className="dropdown-menu">
                              <button
                                className="dropdown-item delete"
                                onClick={() => handleDelete(doc.id)}
                              >
                                <i className="far fa-trash-can"></i>
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        key={doc.id}
                        className="document-item"
                        onClick={() => {
                          if (doc.type === "image" || doc.type === "pdf") {
                            setPreviewItem(doc);
                          }
                        }}
                        style={{
                          cursor:
                            doc.type === "image" || doc.type === "pdf"
                              ? "pointer"
                              : "default",
                        }}
                      >
                        <div className="document-icon">
                          <i className={getFileIcon(doc.type)}></i>
                        </div>
                        <div className="document-info">
                          <div className="document-name">{doc.name}</div>
                          <div className="document-date">
                            {formatDate(doc.createdAt)}
                          </div>
                        </div>
                        <div className="document-actions-wrapper">
                          <button
                            className="document-actions"
                            onClick={(e) => handleMenuToggle(doc.id, e)}
                          >
                            <i className="fa fa-ellipsis-vertical"></i>
                          </button>
                          {openMenuId === doc.id && (
                            <div className="dropdown-menu">
                              <button
                                className="dropdown-item delete"
                                onClick={() => handleDelete(doc.id)}
                              >
                                <i className="far fa-trash-can"></i>
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p className="empty-state-text">
                  You haven't added any context yet. Add one to begin building
                  your book.
                </p>
                <button
                  className="add-button empty-state-button"
                  onClick={handleAddClick}
                >
                  <i className="far fa-plus"></i>
                  <span>Add Context</span>
                </button>
              </div>
            )
          ) : (
            <div className="login-message">
              <p className="login-message-text">
                You are not logged in. Please log in to start building your
                book.
              </p>
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>
              <i className="fa fa-times"></i>
            </button>

            {modalStep === "type" && (
              <div className="modal-type-selection">
                <h2 className="modal-title">Add Context</h2>
                <p className="modal-subtitle">Choose how you want to add</p>
                <div className="type-options">
                  <button
                    className="type-option"
                    onClick={() => handleTypeSelect("file")}
                  >
                    <i className="far fa-file"></i>
                    <span>File</span>
                  </button>
                  <button
                    className="type-option"
                    onClick={() => handleTypeSelect("text")}
                  >
                    <i className="far fa-file-lines"></i>
                    <span>Text</span>
                  </button>
                </div>
              </div>
            )}

            {modalStep === "file" && (
              <div className="modal-file-upload">
                <h2 className="modal-title">Upload Files</h2>
                <div
                  className={`file-drop-zone ${isDragging ? "dragging" : ""}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <i className="fa fa-cloud-arrow-up"></i>
                  <p>Drag files here or click to select</p>
                  <p className="file-drop-hint">
                    You can select multiple files
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: "none" }}
                  />
                </div>

                {selectedFiles.length > 0 && (
                  <div className="selected-files">
                    <h3>Selected Files:</h3>
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="selected-file-item">
                        <i className="far fa-file"></i>
                        <span className="file-name">{file.name}</span>
                        <button
                          className="remove-file"
                          onClick={() => removeFile(index)}
                        >
                          <i className="fa fa-times"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="modal-actions">
                  <button
                    className="modal-button-secondary"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>
                  <button
                    className="modal-button-primary"
                    onClick={handleSave}
                    disabled={selectedFiles.length === 0 || saving}
                  >
                    {saving ? "Adding..." : "Add"}
                  </button>
                </div>
              </div>
            )}

            {modalStep === "text" && (
              <div className="modal-text-input">
                <h2 className="modal-title">Add Text</h2>
                <textarea
                  className="modal-textarea"
                  placeholder="Enter your book context here..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  rows={10}
                />
                <div className="modal-actions">
                  <button
                    className="modal-button-secondary"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>
                  <button
                    className="modal-button-primary"
                    onClick={handleSave}
                    disabled={!textContent.trim() || saving}
                  >
                    {saving ? "Adding..." : "Add"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {previewItem && (
        <div className="modal-overlay" onClick={() => setPreviewItem(null)}>
          <div
            className="preview-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setPreviewItem(null)}
            >
              <i className="fa fa-times"></i>
            </button>
            {previewItem.type === "image" && previewItem.downloadURL && (
              <div className="preview-image-container">
                <img
                  src={previewItem.downloadURL}
                  alt={previewItem.name}
                  className="preview-image"
                />
              </div>
            )}
            {previewItem.type === "pdf" && previewItem.downloadURL && (
              <div className="preview-pdf-container">
                <div className="preview-pdf-content">
                  {pdfLoading && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        padding: "40px",
                        textAlign: "center",
                      }}
                    >
                      <i
                        className="fa fa-spinner fa-spin"
                        style={{
                          fontSize: "48px",
                          color: "#0066cc",
                          marginBottom: "20px",
                        }}
                      ></i>
                      <p style={{ color: "#666", fontSize: "14px" }}>
                        Loading PDF...
                      </p>
                    </div>
                  )}
                  {pdfError && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        padding: "40px",
                        textAlign: "center",
                      }}
                    >
                      <i
                        className="far fa-file-pdf"
                        style={{
                          fontSize: "64px",
                          color: "#dc3545",
                          marginBottom: "20px",
                        }}
                      ></i>
                      <h3
                        style={{
                          marginBottom: "10px",
                          color: "#000",
                          fontSize: "20px",
                          fontWeight: "600",
                        }}
                      >
                        {previewItem.name || "PDF Document"}
                      </h3>
                      <p
                        style={{
                          marginBottom: "30px",
                          color: "#666",
                          fontSize: "14px",
                        }}
                      >
                        Unable to load PDF preview: {pdfError}
                      </p>
                      <a
                        href={previewItem.downloadURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-block",
                          padding: "12px 24px",
                          backgroundColor: "#0066cc",
                          color: "#ffffff",
                          textDecoration: "none",
                          borderRadius: "8px",
                          fontSize: "16px",
                          fontWeight: "500",
                          transition: "background-color 0.2s ease",
                        }}
                        onMouseOver={(e) =>
                          (e.target.style.backgroundColor = "#0052a3")
                        }
                        onMouseOut={(e) =>
                          (e.target.style.backgroundColor = "#0066cc")
                        }
                      >
                        <i
                          className="far fa-external-link"
                          style={{ marginRight: "8px" }}
                        ></i>
                        Open PDF in New Tab
                      </a>
                    </div>
                  )}
                  {!pdfLoading && !pdfError && pdfPages.length > 0 && (
                    <div className="preview-pdf-pages" ref={pdfContainerRef}>
                      {pdfPages.map((page) => (
                        <div
                          key={page.pageNum}
                          className="preview-pdf-page"
                          style={{
                            marginBottom: "20px",
                            display: "flex",
                            justifyContent: "center",
                          }}
                          ref={(el) => {
                            if (
                              el &&
                              page.canvas &&
                              !el.querySelector("canvas")
                            ) {
                              // Append the canvas directly (don't clone - cloning loses the image data)
                              el.appendChild(page.canvas);
                            }
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Personalize;
