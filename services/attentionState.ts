import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebaseClient";

/**
 * SNOOZED AND DISMISSED ITEMS, PER PERSON.
 *
 * "Needs your attention" is derived from project state, which means it can only
 * ever be cleared by doing the work. That is right for correctness and wrong
 * for use: some things genuinely are not today's problem, and a list you cannot
 * affect stops being a queue and becomes a feed you scroll past.
 *
 * Two different gestures, because they mean different things:
 *
 *   - SNOOZE hides an item until a chosen time. It comes back on its own.
 *   - DISMISS hides it until the project is touched again -- the item returns
 *     the moment `lastModified` moves past the dismissal. So "I have dealt with
 *     this" self-corrects if it turns out you had not, rather than hiding a
 *     blocked payment forever because somebody clicked it once.
 *
 * Stored per user, like the last-tab map, because whether something is your
 * problem today is not a property of the project.
 *
 * `attentionState` must be on the self-update allowlist in firestore.rules or
 * every write here is rejected.
 */

export interface AttentionEntry {
  /** epoch ms; hidden while now < snoozedUntil */
  snoozedUntil?: number;
  /** epoch ms; hidden while the project has not been modified since */
  dismissedAt?: number;
}

export type AttentionState = Record<string, AttentionEntry>;

export async function readAttentionState(uid?: string | null): Promise<AttentionState> {
  if (!uid || !db) return {};
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const map = snap.exists() ? (snap.data() as any)?.attentionState : null;
    return map && typeof map === "object" ? (map as AttentionState) : {};
  } catch {
    return {};
  }
}

export async function writeAttentionEntry(
  uid: string | null | undefined,
  projectId: string,
  entry: AttentionEntry
): Promise<void> {
  if (!uid || !projectId || !db) return;
  try {
    await setDoc(
      doc(db, "users", uid),
      { attentionState: { [projectId]: entry }, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    /* Best effort. Losing a snooze shows the item again, which is the safe
       direction to fail in. */
  }
}

/** True when this project should be hidden from the list right now. */
export function isHidden(
  entry: AttentionEntry | undefined,
  projectLastModified?: number
): boolean {
  if (!entry) return false;
  const now = Date.now();
  if (entry.snoozedUntil && now < entry.snoozedUntil) return true;
  if (entry.dismissedAt) {
    /* Returns as soon as the project moves. No lastModified means we cannot
       tell it has moved, so the dismissal stands. */
    if (!projectLastModified || projectLastModified <= entry.dismissedAt) return true;
  }
  return false;
}

export const TOMORROW_9AM = (): number => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
};

export const NEXT_WEEK = (): number => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
};
