// Create new Firebase Auth users from the admin UI without signing the admin out
// by initializing a secondary Firebase app instance just for the create call.
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { app } from "./firebase";

export async function createAuthUser(email: string, password: string): Promise<string> {
  const secondary = initializeApp(app.options, `secondary-${Date.now()}`);
  try {
    const secAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    const uid = cred.user.uid;
    await signOut(secAuth);
    return uid;
  } finally {
    await deleteApp(secondary);
  }
}
