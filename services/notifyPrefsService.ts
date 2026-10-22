import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { cleanPrefs, DEFAULT_PREFS, type NotifyPrefs } from '../lib/notify';

/*
  WHAT INTERRUPTS EACH PERSON (lib/notify.ts NotifyPrefs).

  Kept on their inbox's own document (inbox/{email}, or portalInbox/{uid}
  for a client) beside their time zone, so a choice made on the laptop holds
  on the phone, and the server can read both to decide a phone notification
  in the person's own night (functions/src/notify.ts). The rules let the
  person write prefs, tz and updatedAt there, and nothing else. A copy is
  kept in this browser so the settings apply from the first second, before
  Firestore answers.
*/

const local = (box: string) => `studiodesk.notifyPrefs.${box}`;

/** This browser's time zone, e.g. "Asia/Kolkata". */
export const localZone = (): string | null => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
};

export function cachedPrefs(box: string | null | undefined): NotifyPrefs {
  if (!box) return DEFAULT_PREFS;
  try { return cleanPrefs(JSON.parse(window.localStorage.getItem(local(box)) || 'null')); } catch { return DEFAULT_PREFS; }
}

export async function readPrefs(box: string | null | undefined): Promise<NotifyPrefs> {
  if (!box || !db) return cachedPrefs(box);
  try {
    const snap = await getDoc(doc(db, box));
    const data = snap.exists() ? (snap.data() as any) : null;
    const prefs = cleanPrefs(data?.prefs);
    try { window.localStorage.setItem(local(box), JSON.stringify(prefs)); } catch { /* private window */ }
    /* Keep the time zone current, so quiet hours on the phone follow a person who travels. */
    const tz = localZone();
    if (tz && data?.tz !== tz) setDoc(doc(db, box), { tz, updatedAt: Date.now() }, { merge: true }).catch(() => {});
    return prefs;
  } catch {
    return cachedPrefs(box);
  }
}

export async function savePrefs(box: string | null | undefined, prefs: NotifyPrefs): Promise<void> {
  if (!box) return;
  try { window.localStorage.setItem(local(box), JSON.stringify(prefs)); } catch { /* private window */ }
  if (!db) return;
  const tz = localZone();
  await setDoc(doc(db, box), { prefs, ...(tz ? { tz } : {}), updatedAt: Date.now() }, { merge: true });
}
