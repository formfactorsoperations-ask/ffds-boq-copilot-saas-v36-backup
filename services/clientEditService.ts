/*
  Whether a project's save reached the database (Edit client, lib/clientEdit).

  db.saveProject keeps going when the cloud write fails (it backs up locally
  and logs), so the Clients screen reads back the project's lastModified to
  tell "Saved" from a project that needs another try. One read per project,
  only when a client is edited.
*/
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseClient';

export async function savedAt(projectId: string): Promise<number | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'projects', projectId));
  const t = Number(snap.exists() ? (snap.data() as any)?.lastModified : NaN);
  return Number.isFinite(t) ? t : null;
}
