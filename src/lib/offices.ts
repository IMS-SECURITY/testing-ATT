import {
  addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "./firebase";

export interface Office {
  id: string;
  projectId: string;
  name: string;
  lat: number;
  lng: number;
}

export interface OfficeInput {
  projectId: string;
  name: string;
  lat: number;
  lng: number;
}

export async function loadAllOffices(): Promise<Office[]> {
  const snap = await getDocs(collection(db, "offices"));
  return snap.docs.map((d) => {
    const data = d.data() as Omit<Office, "id">;
    return { id: d.id, ...data };
  });
}

export async function loadOfficesForProject(projectId: string): Promise<Office[]> {
  const snap = await getDocs(query(collection(db, "offices"), where("projectId", "==", projectId)));
  return snap.docs.map((d) => {
    const data = d.data() as Omit<Office, "id">;
    return { id: d.id, ...data };
  });
}

export async function createOffice(input: OfficeInput): Promise<string> {
  const ref = await addDoc(collection(db, "offices"), {
    projectId: input.projectId,
    name: input.name.trim(),
    lat: input.lat,
    lng: input.lng,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateOffice(id: string, input: Omit<OfficeInput, "projectId">): Promise<void> {
  await updateDoc(doc(db, "offices", id), {
    name: input.name.trim(),
    lat: input.lat,
    lng: input.lng,
  });
}

export async function deleteOffice(id: string): Promise<void> {
  await deleteDoc(doc(db, "offices", id));
}

export function officesByProject(offices: Office[]): Map<string, Office[]> {
  const map = new Map<string, Office[]>();
  for (const o of offices) {
    const list = map.get(o.projectId) ?? [];
    list.push(o);
    map.set(o.projectId, list);
  }
  return map;
}
