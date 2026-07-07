import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyC2Wt_fjzJwApYTBCIeObz1-EhVYvwE3V0",
  authDomain: "testing-att.firebaseapp.com",
  projectId: "testing-att",
  storageBucket: "testing-att.firebasestorage.app",
  messagingSenderId: "774101216919",
  appId: "1:774101216919:web:7fd8303c281304490dc3d2"
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Initialize Analytics (only in browser)
export let analytics: ReturnType<typeof getAnalytics> | null = null;
if (typeof window !== "undefined") {
  try {
    analytics = getAnalytics(app);
  } catch (e) {
    console.warn("Analytics initialization failed:", e);
  }
}

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
