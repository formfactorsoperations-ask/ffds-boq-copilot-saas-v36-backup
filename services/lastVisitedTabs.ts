import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebaseClient";

/**
 * WHERE EACH PERSON LEFT OFF, PER PROJECT.
 *
 * "Continue where you left off" used to open every project on its dashboard,
 * which is where you start, not where you stopped. The plumbing was already
 * there -- handleOpenProject takes an optional target tab, and the worklist
 * passes one -- but nothing anywhere recorded which tab a person was last on.
 *
 * Stored on the user's own document rather than on the project, deliberately:
 * a project-level field would be shared by the whole studio, so "where YOU
 * left off" would silently mean "wherever the last person to touch this left
 * off". On the user record it follows the person to any device they sign in
 * on, which is the behaviour the phrase promises.
 *
 * firestore.rules restricts what a user may change on their own document to a
 * named list of keys; `lastProjectTabs` is on that list. Without it the write
 * is rejected, so the rules must be deployed alongside this.
 *
 * Every call is best-effort. Failing to remember a tab is not worth an error
 * in front of anyone -- the fallback is the dashboard, which is exactly the
 * behaviour that existed before.
 */

export type LastTabs = Record<string, string>;

export async function readLastTabs(uid?: string | null): Promise<LastTabs> {
  if (!uid || !db) return {};
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const map = snap.exists() ? (snap.data() as any)?.lastProjectTabs : null;
    return map && typeof map === "object" ? (map as LastTabs) : {};
  } catch {
    return {};
  }
}

export async function recordLastTab(
  uid: string | null | undefined,
  projectId: string | null | undefined,
  tab: string | null | undefined
): Promise<void> {
  if (!uid || !projectId || !tab || !db) return;
  try {
    /* Merged, so this writes one key inside the map and leaves every other
       project's entry alone. updatedAt is already an allowed key. */
    await setDoc(
      doc(db, "users", uid),
      { lastProjectTabs: { [projectId]: tab }, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    /* Silent by design -- see the note above. */
  }
}
