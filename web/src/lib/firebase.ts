import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyCNRYMNCZrSEljwbXlLikT0rm76jBIPx54",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "codered-3b3d5.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "codered-3b3d5",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "codered-3b3d5.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "958064100587",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:958064100587:web:9c2d2b17f09e4ec8332aae",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? "G-1Q4LE17EMD",
};

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

void isSupported().then((yes) => {
  if (yes) getAnalytics(app);
});
