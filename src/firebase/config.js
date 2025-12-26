// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDQrAKVY0MIQXh_jYwfS5QsoiPNojtB_fg",
  authDomain: "quilliant-ai.firebaseapp.com",
  projectId: "quilliant-ai",
  storageBucket: "quilliant-ai.firebasestorage.app",
  messagingSenderId: "299278908642",
  appId: "1:299278908642:web:f9c60b06d8f048c039b2bb",
  measurementId: "G-GRS0F2LZDV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (only in browser environment)
let analytics;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

// Initialize Firestore
const db = getFirestore(app);

// Initialize Authentication
const auth = getAuth(app);

// Initialize Storage
const storage = getStorage(app);

export { app, analytics, db, auth, storage };

