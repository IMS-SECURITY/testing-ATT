import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBgJiz1G6YReokfrWOTEPfpfz0LoNwwsuw",
  authDomain: "attendance-management-f3b85.firebaseapp.com",
  projectId: "attendance-management-f3b85",
  storageBucket: "attendance-management-f3b85.firebasestorage.app",
  messagingSenderId: "290989855696",
  appId: "1:290989855696:web:48666bd856a7169cee5fd5",
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Seed admin (first user with this email auto-becomes admin)
export const SEED_ADMIN_EMAIL = "mohanrammurugesan1@gmail.com";

// Connect to emulators when running on localhost with VITE_USE_FIREBASE_EMULATOR=true
if (
  typeof window !== "undefined" &&
  import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true"
) {
  // @ts-expect-error guard against double-connect on HMR
  if (!globalThis.__FIREBASE_EMULATORS_CONNECTED__) {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    // @ts-expect-error mark
    globalThis.__FIREBASE_EMULATORS_CONNECTED__ = true;
  }
}
