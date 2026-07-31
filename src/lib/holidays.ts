import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export interface Holiday {
  id: string; // YYYY-MM-DD
  date: string; // YYYY-MM-DD
  name: string;
  type: "national" | "optional" | "office"; // national = gazetted, optional = optional, office = custom
  isRecurring?: boolean; // true = repeats every year (e.g. Independence Day)
  updatedBy?: string;
  updatedAt?: Date;
}

const COL = "holidays";

/**
 * Load all holidays for a given year.
 * We fetch the whole collection and filter client-side to avoid needing
 * a Firestore composite index (which would require the Firebase Console to create it).
 */
export async function loadHolidaysForYear(year: number): Promise<Holiday[]> {
  const snap = await getDocs(collection(db, COL));
  const yearStr = String(year);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Holiday, "id">) }))
    .filter((h) => h.date?.startsWith(yearStr))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Load all holidays (for super admin management). */
export async function loadAllHolidays(): Promise<Holiday[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Holiday, "id">) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Upsert a holiday. The doc ID is the date string "YYYY-MM-DD". */
export async function upsertHoliday(
  holiday: Omit<Holiday, "id" | "updatedAt">,
  updatedByName: string,
): Promise<void> {
  await setDoc(doc(db, COL, holiday.date), {
    ...holiday,
    updatedBy: updatedByName,
    updatedAt: serverTimestamp(),
  });
}

/** Delete a holiday by date ID. */
export async function deleteHoliday(dateId: string): Promise<void> {
  await deleteDoc(doc(db, COL, dateId));
}
