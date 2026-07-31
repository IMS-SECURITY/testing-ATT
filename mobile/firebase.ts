import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
