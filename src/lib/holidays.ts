import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
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

/** Load all holidays for a given year. */
export async function loadHolidaysForYear(year: number): Promise<Holiday[]> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const snap = await getDocs(
    query(
      collection(db, COL),
      where("date", ">=", start),
      where("date", "<=", end),
      orderBy("date", "asc"),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Holiday, "id">) }));
}

/** Load all holidays (for super admin management). */
export async function loadAllHolidays(): Promise<Holiday[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("date", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Holiday, "id">) }));
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
