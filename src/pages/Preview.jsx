import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { cloudinaryConfig, cloudinaryUploadUrl } from "../config/cloudinary";
import "../App.css";

function Preview() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [chapters, setChapters] = useState([]);
  const [coverImage, setCoverImage] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [bookTitle, setBookTitle] = useState("My Book");
  const fileInputRef = useRef(null);

  // Fetch all chapters
  const fetchChapters = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "applications"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const allChapters = [];
      
      for (const docSnapshot of querySnapshot.docs) {
        const appData = { id: docSnapshot.id, ...docSnapshot.data() };
        
        // Fetch chapters for this book
        try {
          const questionsQuery = query(
            collection(db, "applications", docSnapshot.id, "questions"),
            orderBy("order", "asc")
          );
          const questionsSnapshot = await getDocs(questionsQuery);
          questionsSnapshot.forEach((qDoc) => {
            allChapters.push({ id: qDoc.id, ...qDoc.data() });
          });
        } catch (questionsError) {
          console.error("Error fetching questions for app:", questionsError);
          // Fallback: try without orderBy
          try {
            const questionsQuery = query(
              collection(db, "applications", docSnapshot.id, "questions")
            );
            const questionsSnapshot = await getDocs(questionsQuery);
            const questions = [];
            questionsSnapshot.forEach((qDoc) => {
              questions.push({ id: qDoc.id, ...qDoc.data() });
            });
            // Sort manually by order if available
            questions.sort((a, b) => {
              const orderA = a.order !== undefined ? a.order : 999;
              const orderB = b.order !== undefined ? b.order : 999;
              return orderA - orderB;
            });
            questions.forEach((q) => {
              allChapters.push(q);
            });
          } catch (fallbackError) {
            console.error("Error fetching questions (fallback):", fallbackError);
          }
        }
      }
      
      console.log("Fetched chapters:", allChapters.length, allChapters);
      setChapters(allChapters);
    } catch (error) {
      console.error("Error fetching chapters:", error);
      // Fallback if orderBy fails
      try {
        const q = query(
          collection(db, "applications"),
          where("userId", "==", user.uid)
        );
        const querySnapshot = await getDocs(q);
        const allChapters = [];
        
        for (const docSnapshot of querySnapshot.docs) {
          const appData = { id: docSnapshot.id, ...docSnapshot.data() };
          
          // Fetch chapters for this book
          try {
            const questionsQuery = query(
              collection(db, "applications", docSnapshot.id, "questions"),
              orderBy("order", "asc")
            );
            const questionsSnapshot = await getDocs(questionsQuery);
            questionsSnapshot.forEach((qDoc) => {
              allChapters.push({ id: qDoc.id, ...qDoc.data() });
            });
          } catch (questionsError) {
            // Fallback: try without orderBy
            const questionsQuery = query(
              collection(db, "applications", docSnapshot.id, "questions")
            );
            const questionsSnapshot = await getDocs(questionsQuery);
            const questions = [];
            questionsSnapshot.forEach((qDoc) => {
              questions.push({ id: qDoc.id, ...qDoc.data() });
            });
            // Sort manually by order if available
            questions.sort((a, b) => {
              const orderA = a.order !== undefined ? a.order : 999;
              const orderB = b.order !== undefined ? b.order : 999;
              return orderA - orderB;
            });
            questions.forEach((q) => {
              allChapters.push(q);
            });
          }
        }
        
        setChapters(allChapters);
      } catch (fallbackError) {
        console.error("Error fetching chapters (fallback):", fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch book metadata (cover, title)
  const fetchBookMetadata = async () => {
    if (!user) return;
    try {
      const bookDocRef = doc(db, "bookMetadata", user.uid);
      const bookDoc = await getDoc(bookDocRef);
      if (bookDoc.exists()) {
        const data = bookDoc.data();
        if (data.coverImage) setCoverImage(data.coverImage);
        if (data.title) setBookTitle(data.title);
      }
    } catch (error) {
      console.error("Error fetching book metadata:", error);
    }
  };

  useEffect(() => {
    if (user) {
      setLoading(true);
      fetchChapters();
      fetchBookMetadata();
    } else {
      setLoading(false);
    }
  }, [user]);

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingCover(true);
    try {
      // Upload to Cloudinary
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", cloudinaryConfig.uploadPreset);
      formData.append("folder", `quilliant/${user.uid}/cover`);

      const uploadResponse = await fetch(cloudinaryUploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload cover: ${uploadResponse.statusText}`);
      }

      const uploadData = await uploadResponse.json();
      const imageUrl = uploadData.secure_url || uploadData.url;

      // Save to Firestore
      const bookDocRef = doc(db, "bookMetadata", user.uid);
      await setDoc(
        bookDocRef,
        {
          coverImage: imageUrl,
          title: bookTitle,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      setCoverImage(imageUrl);
    } catch (error) {
      console.error("Error uploading cover:", error);
      alert(`Failed to upload cover: ${error.message}`);
    } finally {
      setUploadingCover(false);
    }
  };

  const handleTitleChange = async (newTitle) => {
    setBookTitle(newTitle);
    if (!user) return;
    try {
      const bookDocRef = doc(db, "bookMetadata", user.uid);
      await setDoc(
        bookDocRef,
        {
          title: newTitle,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Error updating title:", error);
    }
  };

  // Split text into pages (approximately 300 words per page for Kindle-like reading)
  const WORDS_PER_PAGE = 300;
  const CHARS_PER_PAGE = 1800; // Approximate characters per page

  const splitTextIntoPages = (text) => {
    if (!text || !text.trim()) return [];
    
    const paragraphs = text.split('\n').filter(p => p.trim());
    const pages = [];
    let currentPage = '';
    let currentCharCount = 0;

    paragraphs.forEach((paragraph) => {
      const paraLength = paragraph.length;
      
      // If adding this paragraph would exceed page limit, start new page
      if (currentCharCount + paraLength > CHARS_PER_PAGE && currentPage) {
        pages.push(currentPage.trim());
        currentPage = paragraph + '\n\n';
        currentCharCount = paraLength + 2;
      } else {
        currentPage += paragraph + '\n\n';
        currentCharCount += paraLength + 2;
      }
    });

    // Add the last page if there's content
    if (currentPage.trim()) {
      pages.push(currentPage.trim());
    }

    return pages.length > 0 ? pages : [text];
  };

  // Calculate page numbers for navigation
  const buildBookPages = () => {
    const pages = [];
    let currentPageNum = 1;
    const tocEntries = [];

    // Page 1: Cover (image only)
    pages.push({
      type: 'cover',
      pageNumber: currentPageNum++,
      coverImage,
    });

    // Page 2: Title Page
    pages.push({
      type: 'title-page',
      pageNumber: currentPageNum++,
      bookTitle,
    });

    // Page 3: Table of Contents (only if there are chapters)
    if (chapters && chapters.length > 0) {
      // TOC is page 3
      const tocPageNumber = currentPageNum++;
      
      // First pass: Calculate where each chapter starts
      let chapterStartPage = currentPageNum;
      chapters.forEach((chapter, index) => {
        if (chapter.text) {
          tocEntries.push({
            title: chapter.text,
            pageNumber: chapterStartPage,
            chapterIndex: index,
          });
          // Each chapter gets a title page + content pages
          chapterStartPage += 1; // Title page
          if (chapter.answer) {
            const contentPages = splitTextIntoPages(chapter.answer);
            chapterStartPage += contentPages.length;
          } else {
            chapterStartPage += 1; // Empty chapter still takes one page
          }
        }
      });

      // Add TOC page
      pages.push({
        type: 'toc',
        pageNumber: tocPageNumber,
        entries: tocEntries,
      });

      // Second pass: Build chapter pages
      chapters.forEach((chapter, index) => {
        if (chapter.text) {
          // Chapter title page
          pages.push({
            type: 'chapter-title',
            pageNumber: currentPageNum++,
            chapterTitle: chapter.text,
            chapterDescription: chapter.description || '',
            chapterIndex: index,
          });

          // Chapter content pages
          if (chapter.answer) {
            const contentPages = splitTextIntoPages(chapter.answer);
            contentPages.forEach((pageContent, pageIndex) => {
              pages.push({
                type: 'chapter-content',
                pageNumber: currentPageNum++,
                content: pageContent,
                chapterTitle: chapter.text,
                chapterIndex: index,
                isFirstPage: pageIndex === 0,
              });
            });
          } else {
            // Empty chapter
            pages.push({
              type: 'chapter-content',
              pageNumber: currentPageNum++,
              content: null,
              chapterTitle: chapter.text,
              chapterIndex: index,
              isFirstPage: true,
            });
          }
        }
      });
    }

    return pages;
  };

  const scrollToPage = (pageNumber) => {
    const element = document.getElementById(`page-${pageNumber}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loading) {
    return (
      <div className="preview-page">
        <main className="main-content">
          <div className="preview-container">
            <div className="loading-message">
              <p>Loading...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="preview-page">
      <main className="main-content">
        <div className="preview-container">
          {user ? (
            <div className="kindle-book">
              {(() => {
                const bookPages = buildBookPages();
                if (bookPages.length === 0) {
                  return (
                    <div className="empty-chapters-message">
                      <p>No chapters yet. Start writing to see your book preview.</p>
                    </div>
                  );
                }
                return bookPages.map((page) => {
                  if (page.type === 'cover') {
                    return (
                      <div key={page.pageNumber} id={`page-${page.pageNumber}`} className="kindle-page kindle-cover-page">
                        {page.coverImage ? (
                          <div className="cover-page-image-full">
                            <img src={page.coverImage} alt="Book Cover" />
                            <button
                              className="cover-edit-button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadingCover}
                            >
                              <i className="far fa-image"></i>
                              <span>Change Cover</span>
                            </button>
                          </div>
                        ) : (
                          <div
                            className="cover-upload-placeholder-full"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <i className="far fa-image"></i>
                            <p>Upload Book Cover</p>
                            {uploadingCover && <p className="uploading-text">Uploading...</p>}
                          </div>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleCoverUpload}
                          style={{ display: "none" }}
                        />
                      </div>
                    );
                  } else if (page.type === 'title-page') {
                    return (
                      <div key={page.pageNumber} id={`page-${page.pageNumber}`} className="kindle-page kindle-title-page">
                        <div className="title-page-content">
                          <input
                            type="text"
                            className="title-page-input"
                            value={page.bookTitle}
                            onChange={(e) => handleTitleChange(e.target.value)}
                            placeholder="Book Title"
                          />
                        </div>
                        <div className="page-footer">
                          <span className="page-num">{page.pageNumber}</span>
                        </div>
                      </div>
                    );
                  } else if (page.type === 'toc') {
                    return (
                      <div key={page.pageNumber} id={`page-${page.pageNumber}`} className="kindle-page kindle-toc-page">
                        <div className="toc-content">
                          <h1 className="toc-title">Table of Contents</h1>
                          <div className="toc-entries">
                            {page.entries.map((entry, idx) => (
                              <div
                                key={idx}
                                className="toc-entry"
                                onClick={() => scrollToPage(entry.pageNumber)}
                              >
                                <span className="toc-entry-title">{entry.title}</span>
                                <span className="toc-entry-page">{entry.pageNumber}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="page-footer">
                          <span className="page-num">{page.pageNumber}</span>
                        </div>
                      </div>
                    );
                  } else if (page.type === 'chapter-title') {
                    return (
                      <div key={page.pageNumber} id={`page-${page.pageNumber}`} className="kindle-page kindle-chapter-title-page">
                        <div className="chapter-title-content">
                          <div className="chapter-title-number">Chapter {page.chapterIndex + 1}</div>
                          <h1 className="chapter-title-text">{page.chapterTitle}</h1>
                        </div>
                        <div className="page-footer">
                          <span className="page-num">{page.pageNumber}</span>
                        </div>
                      </div>
                    );
                  } else if (page.type === 'chapter-content') {
                    return (
                      <div key={page.pageNumber} id={`page-${page.pageNumber}`} className="kindle-page kindle-content-page">
                        {page.isFirstPage && (
                          <div className="chapter-header">
                            <h2 className="chapter-header-title">{page.chapterTitle}</h2>
                          </div>
                        )}
                        <div className="page-body">
                          {page.content ? (
                            <div className="chapter-content">
                              {page.content.split('\n').map((paragraph, pIdx) => (
                                paragraph.trim() && (
                                  <p key={pIdx} className="chapter-paragraph">
                                    {paragraph}
                                  </p>
                                )
                              ))}
                            </div>
                          ) : (
                            <div className="chapter-empty">
                              <p>This chapter hasn't been written yet.</p>
                            </div>
                          )}
                        </div>
                        <div className="page-footer">
                          <span className="page-num">{page.pageNumber}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                });
              })()}
            </div>
          ) : (
            <div className="login-message">
              <p className="login-message-text">
                Please log in to preview your book.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Preview;

