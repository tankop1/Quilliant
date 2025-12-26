import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  getDocs,
  where,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import "../App.css";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";
const GEMINI_FILES_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/files";
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
  console.error("VITE_GEMINI_API_KEY is not set. Please create a .env file with your Gemini API key.");
}

function Question() {
  const { appId, questionIndex } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [chatInput, setChatInput] = useState("");
  const [app, setApp] = useState(null);
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentEditDescription, setCurrentEditDescription] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const hasAttemptedGeneration = useRef(false);
  const answerTextareaRef = useRef(null);
  const chatMessagesRef = useRef(null);

  // Fetch personalizations and extract text content
  const fetchPersonalizations = async () => {
    if (!user) return [];

    try {
      const q = query(
        collection(db, "personalizations"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const personalizations = [];
      querySnapshot.forEach((doc) => {
        personalizations.push({ id: doc.id, ...doc.data() });
      });
      return personalizations;
    } catch (error) {
      console.error("Error fetching personalizations:", error);
      // Fallback without orderBy
      try {
        const q = query(
          collection(db, "personalizations"),
          where("userId", "==", user.uid)
        );
        const querySnapshot = await getDocs(q);
        const personalizations = [];
        querySnapshot.forEach((doc) => {
          personalizations.push({ id: doc.id, ...doc.data() });
        });
        return personalizations;
      } catch (fallbackError) {
        console.error(
          "Error fetching personalizations (fallback):",
          fallbackError
        );
        return [];
      }
    }
  };

  // Extract constraints from question text and question data (page/character limits)
  // Convert pages to words (approximately 250 words per page)
  const WORDS_PER_PAGE = 250;
  
  const extractConstraints = (questionText, questionData = null) => {
    const constraints = {};
    
    // First, check if question has stored pageMin/pageMax from Firestore
    if (questionData) {
      if (questionData.pageMin) {
        constraints.minWords = questionData.pageMin * WORDS_PER_PAGE;
        constraints.pageMin = questionData.pageMin;
      }
      if (questionData.pageMax) {
        constraints.maxWords = questionData.pageMax * WORDS_PER_PAGE;
        constraints.pageMax = questionData.pageMax;
      }
      // Legacy support for wordMin/wordMax (convert to pages for display)
      if (questionData.wordMin) {
        constraints.minWords = questionData.wordMin;
        constraints.pageMin = Math.ceil(questionData.wordMin / WORDS_PER_PAGE);
      }
      if (questionData.wordMax) {
        constraints.maxWords = questionData.wordMax;
        constraints.pageMax = Math.ceil(questionData.wordMax / WORDS_PER_PAGE);
      }
    }
    
    // Then, check question text for constraints (these override stored values if present)
    const wordMatch = questionText.match(/(\d+)\s*words?/i);
    const pageMatch = questionText.match(/(\d+)\s*pages?/i);
    const charMatch = questionText.match(/(\d+)\s*characters?/i);
    const charLimitMatch = questionText.match(/(\d+)\s*char\s*limit/i);

    if (pageMatch && !constraints.maxWords) {
      const pages = parseInt(pageMatch[1]);
      constraints.maxWords = pages * WORDS_PER_PAGE;
      constraints.pageMax = pages;
    } else if (wordMatch && !constraints.maxWords) {
      constraints.maxWords = parseInt(wordMatch[1]);
    }
    if (charMatch || charLimitMatch) {
      constraints.maxChars = parseInt((charMatch || charLimitMatch)[1]);
    }

    return constraints;
  };

  // Upload PDF to Gemini's file API and get file URI
  // Using a completely different approach: direct file URI or proper multipart upload
  const uploadPdfToGemini = async (pdfUrl, fileName, cloudinaryPublicId) => {
    try {
      console.log("Processing PDF for Gemini:", fileName);

      const cloudName = "dxqpoivvx";

      // Get the working Cloudinary URL
      let workingUrl =
        pdfUrl && !pdfUrl.startsWith("http") ? `https://${pdfUrl}` : pdfUrl;

      if (cloudinaryPublicId) {
        workingUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${cloudinaryPublicId}`;
      } else if (workingUrl && workingUrl.includes("/raw/upload/")) {
        workingUrl = workingUrl.replace("/raw/upload/", "/image/upload/");
      }

      console.log("PDF URL:", workingUrl);

      // NEW APPROACH: Try using the public URL directly as fileUri first
      // Gemini can fetch publicly accessible files directly
      console.log("Attempting to use PDF URL directly as fileUri...");

      // Test if the URL is accessible
      try {
        const testResponse = await fetch(workingUrl, {
          method: "HEAD",
          mode: "cors",
        });

        if (testResponse.ok) {
          const contentType = testResponse.headers.get("content-type");
          if (contentType && contentType.includes("application/pdf")) {
            console.log(
              "✓ PDF URL is publicly accessible, using directly as fileUri"
            );
            // Return the URL as fileUri - Gemini can fetch it directly
            return {
              fileUri: workingUrl,
              mimeType: "application/pdf",
            };
          }
        }
      } catch (testError) {
        console.log(
          "URL not directly accessible, will upload to Gemini Files API"
        );
      }

      // FALLBACK: Upload to Gemini Files API using proper multipart format
      console.log("Uploading PDF to Gemini Files API...");

      // Fetch the PDF as blob
      const response = await fetch(workingUrl, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
      });

      if (!response.ok) {
        console.error(
          `Failed to fetch PDF: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/pdf")) {
        console.error(`URL returned non-PDF content type: ${contentType}`);
        return null;
      }

      const blob = await response.blob();
      console.log(`✓ Successfully fetched PDF, size: ${blob.size} bytes`);

      // Helper function to poll for file status
      const pollFileStatus = async (fileUri) => {
        console.log("Polling for file status:", fileUri);
        let fileReady = false;
        let attempts = 0;
        const maxAttempts = 30;

        // Extract file ID (remove 'files/' prefix if present for API call)
        const fileId = fileUri.startsWith("files/")
          ? fileUri.substring(6)
          : fileUri;
        console.log("File ID for status check:", fileId);

        while (!fileReady && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          attempts++;

          try {
            const statusResponse = await fetch(
              `${GEMINI_FILES_API_URL}/${fileId}?key=${API_KEY}`
            );
            console.log(
              `Status check attempt ${attempts}, response status:`,
              statusResponse.status
            );

            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              console.log("File status data:", statusData);
              const fileState = statusData.file?.state || statusData.state;
              console.log(`File state (attempt ${attempts}):`, fileState);

              if (
                fileState === "ACTIVE" ||
                fileState === "PROCESSING_COMPLETE"
              ) {
                fileReady = true;
                // Ensure fileUri has 'files/' prefix for Gemini API
                const finalUri = fileUri.startsWith("files/")
                  ? fileUri
                  : `files/${fileUri}`;
                console.log("File is ready, using file URI:", finalUri);
                return finalUri;
              } else if (
                fileState === "FAILED" ||
                fileState === "PROCESSING_FAILED"
              ) {
                console.error("File processing failed");
                return null;
              }
            } else {
              const errorText = await statusResponse.text();
              console.warn(
                "Failed to check file status:",
                statusResponse.status,
                errorText
              );
            }
          } catch (statusError) {
            console.warn("Error checking file status:", statusError);
          }
        }

        if (!fileReady) {
          console.warn(
            "File processing timeout, but returning file URI anyway"
          );
          const finalUri = fileUri.startsWith("files/")
            ? fileUri
            : `files/${fileUri}`;
          return finalUri;
        }
        return null;
      };

      // Create proper multipart/form-data with explicit boundaries
      // Using a different approach: create multipart manually or use FormData correctly
      const formData = new FormData();

      // Append file with explicit filename
      const file = new File([blob], fileName || "document.pdf", {
        type: "application/pdf",
      });
      formData.append("file", file);

      console.log("Uploading PDF blob to Gemini Files API...");
      console.log("Blob size:", blob.size, "bytes");
      console.log("Blob type:", blob.type);
      console.log("File name:", fileName);

      // Try upload with explicit headers
      const uploadResponse = await fetch(
        `${GEMINI_FILES_API_URL}?key=${API_KEY}`,
        {
          method: "POST",
          body: formData,
          // Don't set Content-Type header - let browser set it with boundary
        }
      );

      console.log("Upload response status:", uploadResponse.status);
      console.log(
        "Upload response headers:",
        Object.fromEntries(uploadResponse.headers.entries())
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(
          "Failed to upload PDF to Gemini:",
          uploadResponse.status,
          errorText
        );
        return null;
      }

      // Get response text
      const responseText = await uploadResponse.text();
      console.log("Raw response text:", responseText);
      console.log("Response text length:", responseText.length);

      // Check headers for file location
      const locationHeader = uploadResponse.headers.get("location");
      const contentLocationHeader =
        uploadResponse.headers.get("content-location");
      console.log("Location header:", locationHeader);
      console.log("Content-Location header:", contentLocationHeader);

      // Try to extract file name from headers
      let extractedName = null;
      if (locationHeader) {
        const locationMatch = locationHeader.match(/files\/([^\/\?]+)/);
        if (locationMatch) {
          extractedName = `files/${locationMatch[1]}`;
          console.log(
            "Extracted file name from location header:",
            extractedName
          );
        }
      }
      if (!extractedName && contentLocationHeader) {
        const contentLocationMatch =
          contentLocationHeader.match(/files\/([^\/\?]+)/);
        if (contentLocationMatch) {
          extractedName = `files/${contentLocationMatch[1]}`;
          console.log(
            "Extracted file name from content-location header:",
            extractedName
          );
        }
      }

      // Parse JSON response if not empty
      let uploadData = null;
      if (
        responseText &&
        responseText.trim() !== "" &&
        responseText.trim() !== "{}"
      ) {
        try {
          uploadData = JSON.parse(responseText);
          console.log("PDF uploaded to Gemini, parsed response:", uploadData);
        } catch (parseError) {
          console.error("Failed to parse response as JSON:", parseError);
        }
      }

      // Get file name from response or headers
      let fileUri = null;
      if (uploadData) {
        const fileInfo = uploadData.file || uploadData;
        const fileNameFromResponse = fileInfo?.name || uploadData?.name;
        if (fileNameFromResponse) {
          fileUri = fileNameFromResponse.startsWith("files/")
            ? fileNameFromResponse
            : `files/${fileNameFromResponse}`;
          console.log("File name from Gemini response:", fileUri);
        }
      }

      // Use header-extracted name if response didn't have it
      if (!fileUri && extractedName) {
        fileUri = extractedName;
        console.log("Using file name from headers:", fileUri);
      }

      // If we have a file URI, poll for status
      if (fileUri) {
        const result = await pollFileStatus(fileUri);
        return result;
      }

      // Last resort: list files to find the uploaded one
      console.log("No file URI found, listing recent files...");
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait longer

      try {
        const listResponse = await fetch(
          `${GEMINI_FILES_API_URL}?key=${API_KEY}&pageSize=10`
        );
        console.log("List files response status:", listResponse.status);

        if (listResponse.ok) {
          const listData = await listResponse.json();
          console.log(
            "Recent files response:",
            JSON.stringify(listData, null, 2)
          );

          if (listData.files && listData.files.length > 0) {
            // Sort by createTime (most recent first)
            const sortedFiles = listData.files.sort((a, b) => {
              const timeA = new Date(
                a.createTime || a.file?.createTime || 0
              ).getTime();
              const timeB = new Date(
                b.createTime || b.file?.createTime || 0
              ).getTime();
              return timeB - timeA;
            });

            const mostRecent = sortedFiles[0];
            console.log("Most recent file from list:", mostRecent);

            const fileNameFromList = mostRecent.name || mostRecent.file?.name;
            if (fileNameFromList) {
              const finalUri = fileNameFromList.startsWith("files/")
                ? fileNameFromList
                : `files/${fileNameFromList}`;
              console.log("Found most recent file:", finalUri);
              const result = await pollFileStatus(finalUri);
              return result;
            }
          } else {
            console.error("No files in list response:", listData);
          }
        } else {
          const errorText = await listResponse.text();
          console.error(
            "Failed to list files:",
            listResponse.status,
            errorText
          );
        }
      } catch (listError) {
        console.error("Failed to list files:", listError);
      }

      console.error("Could not determine file URI from upload");
      return null;
    } catch (error) {
      console.error("Error uploading PDF to Gemini:", error);
      console.error("Error details:", error.message, error.stack);
      return null;
    }
  };

  // Generate answer using Gemini API
  const generateAnswer = async (questionText, personalizations, questionId) => {
    // Prevent duplicate calls
    if (hasAttemptedGeneration.current || generating) {
      return;
    }

    hasAttemptedGeneration.current = true;
    setGenerating(true);

    try {
      // Build context from personalizations with actual content
      let contextText = "";
      const fileParts = []; // For multimodal content (PDFs, images)

      if (personalizations && personalizations.length > 0) {
        contextText = "Here is information about the book:\n\n";

        for (const personalization of personalizations) {
          if (personalization.type === "text" && personalization.content) {
            contextText += `Text Information:\n${personalization.content}\n\n`;
          } else if (
            personalization.type === "pdf" &&
            personalization.downloadURL
          ) {
            // Upload PDF to Gemini and use it as file_data
            console.log(`\n=== Processing PDF: ${personalization.name} ===`);
            const fileUri = await uploadPdfToGemini(
              personalization.downloadURL,
              personalization.name || "document.pdf",
              personalization.cloudinaryPublicId
            );

            if (fileUri) {
              console.log(
                `✓ Successfully processed PDF for Gemini: ${fileUri}`
              );

              // Handle different return types: string (file URI) or object {fileUri, mimeType}
              let finalFileUri = fileUri;
              let mimeType = "application/pdf";

              if (typeof fileUri === "object" && fileUri.fileUri) {
                // It's an object with fileUri and mimeType
                finalFileUri = fileUri.fileUri;
                mimeType = fileUri.mimeType || "application/pdf";
              } else if (typeof fileUri === "string") {
                // It's a string (either direct URL or Gemini file URI)
                finalFileUri = fileUri;
              }

              // Add PDF as file_data - Gemini API format
              fileParts.push({
                fileData: {
                  fileUri: finalFileUri,
                  mimeType: mimeType,
                },
              });

              // Update context to explicitly mention the PDF content
              contextText += `\n=== IMPORTANT: PDF Document "${
                personalization.name || "Document"
              }" ===\n`;
              contextText += `The attached PDF file contains detailed information about the book. `;
              contextText += `Please read and analyze the entire PDF content carefully and use it to write the chapter. `;
              contextText += `The PDF is available as file data in this request.\n\n`;
            } else {
              console.warn(
                `✗ Failed to upload PDF to Gemini: ${personalization.name}`
              );
              contextText += `Document: ${
                personalization.name || "Document"
              } (unable to process - will try to use filename only)\n`;
            }
          } else if (
            personalization.type === "document" &&
            personalization.downloadURL
          ) {
            // For other documents, try to note them (could extend to upload other formats)
            contextText += `Document: ${personalization.name || "Document"}\n`;
          } else if (
            personalization.type === "image" &&
            personalization.downloadURL
          ) {
            // For images, include them as file_data in the API call
            // Gemini supports fileUri for publicly accessible URLs
            fileParts.push({
              fileData: {
                fileUri: personalization.downloadURL,
              },
            });
            contextText += `Image: ${
              personalization.name || "Image"
            } (see attached image for visual information)\n`;
          }
        }
      } else {
        contextText =
          "No specific book context has been provided yet.\n\n";
      }

      // Extract constraints from question
      const constraints = extractConstraints(questionText, question);
      let constraintInstructions = "";
      if (constraints.pageMin && constraints.pageMax) {
        constraintInstructions = ` IMPORTANT: Your response must be between ${constraints.pageMin} and ${constraints.pageMax} pages (approximately ${constraints.minWords} to ${constraints.maxWords} words, assuming 250 words per page).`;
      } else if (constraints.pageMin) {
        constraintInstructions = ` IMPORTANT: Your response must be at least ${constraints.pageMin} pages (approximately ${constraints.minWords} words, assuming 250 words per page).`;
      } else if (constraints.pageMax) {
        constraintInstructions = ` IMPORTANT: Your response must be ${constraints.pageMax} pages or less (approximately ${constraints.maxWords} words or less, assuming 250 words per page).`;
      } else if (constraints.minWords && constraints.maxWords) {
        constraintInstructions = ` IMPORTANT: Your response must be between ${constraints.minWords} and ${constraints.maxWords} words.`;
      } else if (constraints.minWords) {
        constraintInstructions = ` IMPORTANT: Your response must be at least ${constraints.minWords} words.`;
      } else if (constraints.maxWords) {
        constraintInstructions = ` IMPORTANT: Your response must be exactly ${constraints.maxWords} words or less.`;
      }
      if (constraints.maxChars) {
        constraintInstructions += ` IMPORTANT: Your response must be exactly ${constraints.maxChars} characters or less.`;
      }

      // Build the prompt - make it explicit about using file content
      let promptInstructions = "";
      if (fileParts.length > 0) {
        promptInstructions = `\n\nIMPORTANT: This request includes ${fileParts.length} attached file(s) (PDFs and/or images). `;
        promptInstructions += `You MUST read and analyze the content of ALL attached files carefully. `;
        promptInstructions += `Use the information from these files as the primary source of book context. `;
        promptInstructions += `The files contain detailed information about the book that you should incorporate into your chapter.\n`;
      }

      const prompt = `You are helping to write a book chapter. Use the following book context to write the chapter in the appropriate voice and style.

${contextText}${promptInstructions}

Chapter Topic: ${questionText}${constraintInstructions}

IMPORTANT: Do NOT include a chapter title or heading at the beginning of your response. The chapter already has a name, so start directly with the chapter content. Provide only the chapter text itself, beginning with the first paragraph.`;

      // Log the full context for debugging
      console.log("\n=== FULL CONTEXT BEING SENT TO AI ===");
      console.log("Context length:", contextText.length, "characters");
      console.log(
        "Context preview (first 2000 chars):",
        contextText.substring(0, 2000)
      );
      console.log("Full prompt length:", prompt.length, "characters");
      console.log("=====================================\n");

      // Build the API request parts
      const parts = [{ text: prompt }];

      // Add file parts (PDFs and images) if any
      if (fileParts.length > 0) {
        console.log(
          `Adding ${fileParts.length} file(s) to API request:`,
          fileParts
        );
        parts.push(...fileParts);
      }

      // Log the full request being sent
      console.log("\n=== API REQUEST BEING SENT ===");
      console.log("Parts:", JSON.stringify(parts, null, 2));
      console.log("================================\n");

      // Call Gemini API
      console.log(
        "Calling Gemini API with prompt length:",
        prompt.length,
        "characters and",
        fileParts.length,
        "file(s)"
      );
      const response = await fetch(`${GEMINI_API_URL}?key=${API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: parts,
            },
          ],
        }),
      });

      console.log("API Response status:", response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        console.error("Gemini API Error:", errorData);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("Gemini API Response:", data);

      const generatedText =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!generatedText) {
        console.error("No text in response:", data);
        throw new Error("No text generated from API response");
      }

      console.log("Generated text:", generatedText);

      // Remove any chapter title/heading that might have been generated
      let cleanedText = generatedText.trim();
      // Remove common patterns like "Chapter X:" or "# Chapter Name" at the start
      cleanedText = cleanedText.replace(/^(Chapter\s+\d+[:\-]?\s*)/i, '');
      cleanedText = cleanedText.replace(/^#+\s*.+\n\n?/i, '');
      // Remove standalone chapter titles on first line followed by blank line
      const lines = cleanedText.split('\n');
      if (lines.length > 2 && lines[0].trim() && lines[1].trim() === '') {
        // Check if first line looks like a title (short, no punctuation at end, or ends with colon)
        const firstLine = lines[0].trim();
        if (firstLine.length < 100 && (firstLine.endsWith(':') || !firstLine.match(/[.!?]$/))) {
          cleanedText = lines.slice(2).join('\n').trim();
        }
      }

      // Apply constraints if needed
      let finalAnswer = cleanedText;
      const words = finalAnswer.split(/\s+/);
      
      // Apply word constraints
      if (constraints.maxWords && words.length > constraints.maxWords) {
        finalAnswer = words.slice(0, constraints.maxWords).join(" ");
      }
      if (constraints.minWords && words.length < constraints.minWords) {
        // If answer is too short, we can't fix it automatically, but we'll note it
        console.warn(`Answer has ${words.length} words, but minimum is ${constraints.minWords}`);
      }
      
      // Apply character constraints
      if (constraints.maxChars && finalAnswer.length > constraints.maxChars) {
        finalAnswer = finalAnswer.substring(0, constraints.maxChars);
      }

      console.log("Final chapter:", finalAnswer);
      setAnswer(finalAnswer);
      
      // Resize textarea after setting answer
      setTimeout(() => {
        const textarea = answerTextareaRef.current;
        if (textarea) {
          textarea.style.height = "auto";
          textarea.style.height = `${textarea.scrollHeight}px`;
        }
      }, 0);

      // Save chapter to Firestore
      if (questionId) {
        await updateDoc(
          doc(db, "applications", appId, "questions", questionId),
          {
            answer: finalAnswer,
            answerGeneratedAt: new Date(),
          }
        );
        console.log("Chapter saved to Firestore");
      }

      setHasGenerated(true);
    } catch (error) {
      console.error("Error generating answer:", error);
      console.error("Error details:", error.message);
      // Show error message to user
      setAnswer(
        `Error: ${error.message}. Please try again or use the chatbot below to generate a chapter.`
      );
      setHasGenerated(false);
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset generation flag when question changes
    hasAttemptedGeneration.current = false;

    const fetchData = async () => {
      if (!appId || !user) {
        setLoading(false);
        return;
      }

      try {
        // Fetch application
        const appDoc = await getDoc(doc(db, "applications", appId));
        if (appDoc.exists()) {
          const appData = { id: appDoc.id, ...appDoc.data() };
          setApp(appData);

          // Fetch questions for this application
          const questionsQuery = query(
            collection(db, "applications", appId, "questions"),
            orderBy("order", "asc")
          );
          const questionsSnapshot = await getDocs(questionsQuery);
          const questions = [];
          questionsSnapshot.forEach((qDoc) => {
            questions.push({ id: qDoc.id, ...qDoc.data() });
          });

          // Get the question at the specified index
          const index = parseInt(questionIndex);
          if (questions[index]) {
            const questionData = questions[index];
            setQuestion(questionData);

            // Load chat messages if they exist
            if (questionData.chatMessages && Array.isArray(questionData.chatMessages)) {
              setChatMessages(questionData.chatMessages);
            }

            // If question has an answer, load it
            if (questionData.answer) {
              setAnswer(questionData.answer);
              setHasGenerated(true);
              setLoading(false);
              // Resize textarea after setting answer
              setTimeout(() => {
                const textarea = answerTextareaRef.current;
                if (textarea) {
                  textarea.style.height = "auto";
                  textarea.style.height = `${textarea.scrollHeight}px`;
                }
              }, 0);
            } else {
              // Auto-generate chapter if no chapter exists
              const personalizations = await fetchPersonalizations();
              console.log("Personalizations fetched:", personalizations.length);
              // Use description if available, otherwise use text (chapter name)
              const chapterTopic = questionData.description || questionData.text;
              if (chapterTopic) {
                console.log(
                  "Starting chapter generation for topic:",
                  chapterTopic
                );
                await generateAnswer(
                  chapterTopic,
                  personalizations,
                  questionData.id
                );
              } else {
                console.log("No chapter topic, skipping generation");
                setLoading(false);
              }
            }
          } else {
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching question data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, [appId, questionIndex, user]);

  const questionText = question?.text || "Chapter topic not found";
  const chapterDescription = question?.description || "";

  // Handle chatbot submission - edit the current answer using AI
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const editRequest = chatInput.trim();
    
    // Add user message to chat history
    const updatedMessages = [...chatMessages, { type: "user", text: editRequest }];
    setChatMessages(updatedMessages);
    
    // Save chat messages to Firestore
    if (question?.id) {
      updateDoc(
        doc(db, "applications", appId, "questions", question.id),
        { chatMessages: updatedMessages }
      ).catch((error) => {
        console.error("Error saving chat messages:", error);
      });
    }
    
    // Generate a description of what we're doing
    const editDescription = `Editing chapter based on: "${editRequest.substring(0, 50)}${editRequest.length > 50 ? '...' : ''}"`;
    setCurrentEditDescription(editDescription);
    
    setChatInput("");
    setGenerating(true);

    try {
      // Fetch personalizations for context
      const personalizations = await fetchPersonalizations();
      console.log("Personalizations fetched for editing:", personalizations.length);

      // Build context from personalizations (same as generateAnswer)
      let contextText = "";
      const fileParts = [];

      if (personalizations && personalizations.length > 0) {
        contextText = "Here is information about the book:\n\n";

        for (const personalization of personalizations) {
          if (personalization.type === "text" && personalization.content) {
            contextText += `Text Information:\n${personalization.content}\n\n`;
          } else if (
            personalization.type === "pdf" &&
            personalization.downloadURL
          ) {
            // Upload PDF to Gemini and use it as file_data
            console.log(`\n=== Processing PDF for editing: ${personalization.name} ===`);
            const fileUri = await uploadPdfToGemini(
              personalization.downloadURL,
              personalization.name || "document.pdf",
              personalization.cloudinaryPublicId
            );

            if (fileUri) {
              console.log(
                `✓ Successfully processed PDF for Gemini: ${fileUri}`
              );

              // Handle different return types: string (file URI) or object {fileUri, mimeType}
              let finalFileUri = fileUri;
              let mimeType = "application/pdf";

              if (typeof fileUri === "object" && fileUri.fileUri) {
                finalFileUri = fileUri.fileUri;
                mimeType = fileUri.mimeType || "application/pdf";
              } else if (typeof fileUri === "string") {
                finalFileUri = fileUri;
              }

              fileParts.push({
                fileData: {
                  fileUri: finalFileUri,
                  mimeType: mimeType,
                },
              });

              contextText += `\n=== IMPORTANT: PDF Document "${
                personalization.name || "Document"
              }" ===\n`;
              contextText += `The attached PDF file contains detailed information about the book. `;
              contextText += `Please read and analyze the entire PDF content carefully and use it to write the chapter. `;
              contextText += `The PDF is available as file data in this request.\n\n`;
            }
          } else if (
            personalization.type === "image" &&
            personalization.downloadURL
          ) {
            fileParts.push({
              fileData: {
                fileUri: personalization.downloadURL,
              },
            });
            contextText += `Image: ${
              personalization.name || "Image"
            } (see attached image for visual information)\n`;
          }
        }
      } else {
        contextText =
          "No specific book context has been provided yet.\n\n";
      }

      // Extract constraints from question
      const constraints = extractConstraints(questionText, question);
      let constraintInstructions = "";
      if (constraints.pageMin && constraints.pageMax) {
        constraintInstructions = ` IMPORTANT: Your response must be between ${constraints.pageMin} and ${constraints.pageMax} pages (approximately ${constraints.minWords} to ${constraints.maxWords} words, assuming 250 words per page).`;
      } else if (constraints.pageMin) {
        constraintInstructions = ` IMPORTANT: Your response must be at least ${constraints.pageMin} pages (approximately ${constraints.minWords} words, assuming 250 words per page).`;
      } else if (constraints.pageMax) {
        constraintInstructions = ` IMPORTANT: Your response must be ${constraints.pageMax} pages or less (approximately ${constraints.maxWords} words or less, assuming 250 words per page).`;
      } else if (constraints.minWords && constraints.maxWords) {
        constraintInstructions = ` IMPORTANT: Your response must be between ${constraints.minWords} and ${constraints.maxWords} words.`;
      } else if (constraints.minWords) {
        constraintInstructions = ` IMPORTANT: Your response must be at least ${constraints.minWords} words.`;
      } else if (constraints.maxWords) {
        constraintInstructions = ` IMPORTANT: Your response must be exactly ${constraints.maxWords} words or less.`;
      }
      if (constraints.maxChars) {
        constraintInstructions += ` IMPORTANT: Your response must be exactly ${constraints.maxChars} characters or less.`;
      }

      // Build prompt for editing
      const prompt = `${contextText}Here is the current chapter about "${questionText}":\n\n${answer || "(No chapter yet)"}\n\nUser wants to make the following change: ${editRequest}\n\nPlease edit the chapter according to the user's request, while maintaining the same tone and style.${constraintInstructions}\n\nIMPORTANT: Do NOT include a chapter title or heading. Return only the chapter text itself, starting with the first paragraph.`;

      console.log("\n=== EDITING CHAPTER WITH AI ===");
      console.log("Edit request:", editRequest);
      console.log("Current chapter length:", answer?.length || 0);
      console.log("Context length:", contextText.length);
      console.log("File parts:", fileParts.length);
      console.log("=====================================\n");

      // Build the API request parts
      const parts = [{ text: prompt }];

      // Add file parts (PDFs and images) if any
      if (fileParts.length > 0) {
        console.log(
          `Adding ${fileParts.length} file(s) to API request:`,
          fileParts
        );
        parts.push(...fileParts);
      }

      // Call Gemini API
      console.log(
        "Calling Gemini API for editing with prompt length:",
        prompt.length,
        "characters and",
        fileParts.length,
        "file(s)"
      );
      const response = await fetch(`${GEMINI_API_URL}?key=${API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: parts,
            },
          ],
        }),
      });

      console.log("API Response status:", response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        console.error("Gemini API Error:", errorData);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("Gemini API Response:", data);

      const generatedText =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!generatedText) {
        throw new Error("No text generated in response");
      }

      // Remove any chapter title/heading that might have been generated
      let cleanedText = generatedText.trim();
      // Remove common patterns like "Chapter X:" or "# Chapter Name" at the start
      cleanedText = cleanedText.replace(/^(Chapter\s+\d+[:\-]?\s*)/i, '');
      cleanedText = cleanedText.replace(/^#+\s*.+\n\n?/i, '');
      // Remove standalone chapter titles on first line followed by blank line
      const lines = cleanedText.split('\n');
      if (lines.length > 2 && lines[0].trim() && lines[1].trim() === '') {
        // Check if first line looks like a title (short, no punctuation at end, or ends with colon)
        const firstLine = lines[0].trim();
        if (firstLine.length < 100 && (firstLine.endsWith(':') || !firstLine.match(/[.!?]$/))) {
          cleanedText = lines.slice(2).join('\n').trim();
        }
      }

      // Apply constraints if needed
      let finalAnswer = cleanedText;
      const words = finalAnswer.split(/\s+/);
      
      // Apply word constraints
      if (constraints.maxWords && words.length > constraints.maxWords) {
        finalAnswer = words.slice(0, constraints.maxWords).join(" ");
      }
      if (constraints.minWords && words.length < constraints.minWords) {
        // If answer is too short, we can't fix it automatically, but we'll note it
        console.warn(`Answer has ${words.length} words, but minimum is ${constraints.minWords}`);
      }
      
      // Apply character constraints
      if (constraints.maxChars && finalAnswer.length > constraints.maxChars) {
        finalAnswer = finalAnswer.substring(0, constraints.maxChars);
      }

      console.log("Edited chapter:", finalAnswer);
      setAnswer(finalAnswer);
      
      // Add success message to chat
      const updatedMessages = [...chatMessages, { 
        type: "assistant", 
        text: "Chapter updated successfully." 
      }];
      setChatMessages(updatedMessages);
      
      // Save chat messages to Firestore
      if (question?.id) {
        updateDoc(
          doc(db, "applications", appId, "questions", question.id),
          { chatMessages: updatedMessages }
        ).catch((error) => {
          console.error("Error saving chat messages:", error);
        });
      }
      
      // Resize textarea after setting answer
      setTimeout(() => {
        const textarea = answerTextareaRef.current;
        if (textarea) {
          textarea.style.height = "auto";
          textarea.style.height = `${textarea.scrollHeight}px`;
        }
      }, 0);

      // Save edited chapter to Firestore
      if (question?.id) {
        await updateDoc(
          doc(db, "applications", appId, "questions", question.id),
          {
            answer: finalAnswer,
            answerGeneratedAt: new Date(),
          }
        );
        console.log("Edited chapter saved to Firestore");
      }
    } catch (error) {
      console.error("Error editing answer with AI:", error);
      console.error("Error details:", error.message);
      // Add error message to chat
      const updatedMessages = [...chatMessages, { 
        type: "error", 
        text: `Error: ${error.message}` 
      }];
      setChatMessages(updatedMessages);
      
      // Save chat messages to Firestore
      if (question?.id) {
        updateDoc(
          doc(db, "applications", appId, "questions", question.id),
          { chatMessages: updatedMessages }
        ).catch((error) => {
          console.error("Error saving chat messages:", error);
        });
      }
    } finally {
      setGenerating(false);
      setCurrentEditDescription("");
    }
  };

  // Scroll chat messages to bottom when new messages are added
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages, generating, currentEditDescription]);

  // Ensure textarea height matches content
  useEffect(() => {
    const resizeTextarea = () => {
      const textarea = answerTextareaRef.current;
      if (textarea && answer) {
        // Reset height to auto to get accurate scrollHeight
        textarea.style.height = "auto";
        // Set height to scrollHeight to fit all content
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    };

    // Resize immediately and after a short delay to handle any rendering delays
    resizeTextarea();
    const timeoutId = setTimeout(resizeTextarea, 100);
    const timeoutId2 = setTimeout(resizeTextarea, 500);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
    };
  }, [answer, loading, generating]);

  return (
    <div className="question-page">
      <main className="main-content question-main-layout">
        <div className="question-container">
          <button className="back-button" onClick={() => navigate("/write")}>
            <i className="fa fa-chevron-left"></i>
            <span>Back to Chapters</span>
          </button>

          <div className="question-header">
            <h1 className="question-title">{questionText}</h1>
            {chapterDescription && (
              <div className="notes-section">
                <button 
                  className="notes-toggle-button"
                  onClick={() => setShowNotes(!showNotes)}
                >
                  <span>{showNotes ? "Hide Notes" : "Show Notes"}</span>
                  <i className={`fa fa-chevron-${showNotes ? "up" : "down"}`}></i>
                </button>
                {showNotes && (
                  <div className="notes-content">
                    <p className="question-description">{chapterDescription}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="answer-section">
            <div className="answer-editor">
              {loading || generating ? (
                <div className="answer-skeleton">
                  <div className="skeleton-line"></div>
                  <div className="skeleton-line"></div>
                  <div className="skeleton-line"></div>
                  <div className="skeleton-line skeleton-line-short"></div>
                  <div className="skeleton-line"></div>
                  <div className="skeleton-line"></div>
                  <div className="skeleton-line skeleton-line-short"></div>
                </div>
              ) : (
                <>
                  <textarea
                    ref={answerTextareaRef}
                    className="answer-textarea"
                    placeholder="Your chapter will appear here. Use the AI panel on the right to generate or refine your chapter."
                    value={answer}
                    onChange={(e) => {
                      setAnswer(e.target.value);
                      
                      // Save chapter to Firestore on change
                      if (question?.id) {
                        updateDoc(
                          doc(db, "applications", appId, "questions", question.id),
                          {
                            answer: e.target.value,
                          }
                        ).catch((error) => {
                          console.error("Error saving chapter:", error);
                        });
                      }
                    }}
                  ></textarea>
                  <div className="answer-counter">
                    <span className="counter-item">
                      {answer.trim() ? answer.trim().split(/\s+/).length : 0} words
                    </span>
                    <span className="counter-item">
                      {answer.length} characters
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="ai-panel">
          <div className="ai-panel-messages" ref={chatMessagesRef}>
            {chatMessages.map((message, index) => (
              <div key={index} className={`ai-message ai-message-${message.type || 'user'}`}>
                <div className="ai-message-content">{message.text}</div>
              </div>
            ))}
            {generating && (
              <div className="ai-message ai-message-loading">
                <div className="ai-loading-indicator">
                  <i className="fa fa-spinner fa-spin ai-loading-spinner-icon"></i>
                  <span className="ai-loading-text">{currentEditDescription || "Processing your request..."}</span>
                </div>
              </div>
            )}
          </div>
          <div className="ai-panel-input">
            <form className="ai-input-form" onSubmit={handleSubmit}>
              <textarea
                className="ai-input"
                placeholder="Describe how you'd like to edit the chapter..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !generating) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                disabled={generating}
                rows={4}
              />
              <button type="submit" className="ai-send-button" disabled={!chatInput.trim() || generating}>
                <i className="fa fa-arrow-up"></i>
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Question;
