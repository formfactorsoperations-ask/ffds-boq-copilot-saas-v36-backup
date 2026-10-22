import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { cleanPrefs, DEFAULT_PREFS, type NotifyPrefs } from '../lib/notify';

/*
  WHAT INTERRUPTS EACH PERSON (lib/notify.ts NotifyPrefs).

  Kept on their own profile, users/{uid}.notifyPrefs, so a choice made on the
  laptop holds on the phone. `notifyPrefs` is on the rules' self-update list
  (firestore.rules), like attentionState. A copy is kept in this browser so
  the settings apply from the first second, before Firestore answers.
*/

const local = (uid: string) => `studiodesk.notifyPrefs.${uid}`;

export function cachedPrefs(uid: string | null | undefined): NotifyPrefs {
  if (!uid) return DEFAULT_PREFS;
  try { return cleanPrefs(JSON.parse(window.localStorage.getItem(local(uid)) || 'null')); } catch { return DEFAULT_PREFS; }
}

export async function readPrefs(uid: string | null | undefined): Promise<NotifyPrefs> {
  if (!uid || !db) return cachedPrefs(uid);
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const prefs = cleanPrefs(snap.exists() ? (snap.data() as any)?.notifyPrefs : null);
    try { window.localStorage.setItem(local(uid), JSON.stringify(prefs)); } catch { /* private window */ }
    return prefs;
  } catch {
    return cachedPrefs(uid);
  }
}

export async function savePrefs(uid: string | null | undefined, prefs: NotifyPrefs): Promise<void> {
  if (!uid) return;
  try { window.localStorage.setItem(local(uid), JSON.stringify(prefs)); } catch { /* private window */ }
  if (!db) return;
  await setDoc(doc(db, 'users', uid), { notifyPrefs: prefs, updatedAt: serverTimestamp() }, { merge: true });
}
