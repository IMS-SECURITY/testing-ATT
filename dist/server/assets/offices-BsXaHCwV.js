import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { b as app, d as db } from "./router-B753KT4Y.js";
import { getDocs, collection, deleteDoc, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
async function createAuthUser(email, password) {
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
async function loadAllOffices() {
  const snap = await getDocs(collection(db, "offices"));
  return snap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data };
  });
}
async function createOffice(input) {
  const ref = await addDoc(collection(db, "offices"), {
    projectId: input.projectId,
    name: input.name.trim(),
    lat: input.lat,
    lng: input.lng,
    createdAt: serverTimestamp()
  });
  return ref.id;
}
async function updateOffice(id, input) {
  await updateDoc(doc(db, "offices", id), {
    name: input.name.trim(),
    lat: input.lat,
    lng: input.lng
  });
}
async function deleteOffice(id) {
  await deleteDoc(doc(db, "offices", id));
}
export {
  createAuthUser as a,
  createOffice as c,
  deleteOffice as d,
  loadAllOffices as l,
  updateOffice as u
};
