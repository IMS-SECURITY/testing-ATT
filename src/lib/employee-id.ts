import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const COUNTER_REF = doc(db, "meta", "employeeCounter");

/** Atomically reserves the next employee ID (EMP001, EMP002, …). */
export async function nextEmployeeId(): Promise<string> {
  const id = await runTransaction(db, async (tx) => {
    const snap = await tx.get(COUNTER_REF);
    const next = snap.exists() ? (snap.data().next as number) : 1;
    tx.set(COUNTER_REF, { next: next + 1, updatedAt: serverTimestamp() }, { merge: true });
    return `EMP${String(next).padStart(3, "0")}`;
  });
  return id;
}
