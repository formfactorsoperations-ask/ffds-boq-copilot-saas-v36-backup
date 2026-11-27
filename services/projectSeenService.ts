import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';

/*
  WHEN A PERSON LAST OPENED A PROJECT (lib/projectCatchUp, "Since you were
  here").

  One small document per project under the person's own inbox:
  inbox/{email}/seen/{projectId} = { at }. Only they can read or write it
  (firestore.rules), so an owner opening a project on the laptop and then on
  the phone sees one "since". A copy is kept in this browser for when Firestore
  cannot be reached.
*/

const key = (email: string, projectId: string) => `studiodesk.seen.${email.toLowerCase()}.${projectId}`;
const pathOf = (email: string, projectId: string) => `inbox/${email.toLowerCase()}/seen/${projectId}`;

const local = (email: string, projectId: string): number | null => {
  try { const v = Number(window.localStorage.getItem(key(email, projectId))); return v > 0 ? v : null; } catch { return null; }
};

/** When this person last opened this project, or null for a first visit. */
export async function readSeen(email: string | null | undefined, projectId: string): Promise<number | null> {
  if (!email || !projectId) return null;
  if (!db) return local(email, projectId);
  try {
    const snap = await getDoc(doc(db, pathOf(email, projectId)));
    const at = snap.exists() ? Number((snap.data() as any)?.at) : NaN;
    return at > 0 ? Math.max(at, local(email, projectId) || 0) : local(email, projectId);
  } catch {
    return local(email, projectId);
  }
}

/** Mark the project opened now. A failure is quiet: the next visit simply says a little more. */
export async function markSeen(email: string | null | undefined, projectId: string, at = Date.now()): Promise<void> {
  if (!email || !projectId) return;
  try { window.localStorage.setItem(key(email, projectId), String(at)); } catch { /* private window */ }
  if (!db) return;
  try { await setDoc(doc(db, pathOf(email, projectId)), { at: Math.round(at) }); } catch { /* offline or rules not yet deployed */ }
}
