import { collection, doc, limit, onSnapshot, orderBy, query, where, writeBatch } from 'firebase/firestore';
import { db, functions } from './firebaseClient';
import { type Stored } from '../lib/notify';

/*
  A PERSON'S INBOX (lib/notify.ts says what a note is).

  One live listener per open StudioDesk, on {box}/notes, where the box is
  inbox/{email} for a studio member and portalInbox/{uid} for a client
  (lib/notify.ts staffBox, clientBox). The server writes a note in the same
  call that saves the change it describes (functions/src/notify.ts), so it
  reaches this listener about as soon as the change is saved: no refresh, no
  polling.

  The person may change three things on their own notes, and the rules allow
  nothing else (firestore.rules): readAt, doneAt and snoozedUntil. Reading it
  here is reading it everywhere, because the stamp lives on the note.

  Two listeners feed the one list. The newest notes of any kind, and every
  note still waiting on the person however old: a lead gets a check-in and a
  check-out note for each person each day, and with the newest alone a
  client's message from last week dropped off the end while it still waited.
  The second asks only with "equals", so it needs no index of its own.
*/

const NEWEST = 120;
const WAITING = 200;

export function listenInbox(box: string | null | undefined, onNotes: (notes: Stored[]) => void, onError?: (e: Error) => void): () => void {
  if (!db || !box) { onNotes([]); return () => {}; }
  const notes = collection(db, box, 'notes');
  let newest: Stored[] | null = null, waiting: Stored[] = [];
  const read = (snap: any): Stored[] => snap.docs.map((d: any) => ({ ...(d.data() as any), id: d.id }) as Stored);
  const tell = () => {
    if (!newest) return;
    const seen = new Set(newest.map((n) => n.id));
    onNotes([...newest, ...waiting.filter((n) => !seen.has(n.id))].sort((a, b) => b.at - a.at));
  };
  const stopNewest = onSnapshot(query(notes, orderBy('at', 'desc'), limit(NEWEST)), (snap) => { newest = read(snap); tell(); }, (e) => { if (onError) onError(e); });
  /* If this one fails the newest still show, as before. */
  const stopWaiting = onSnapshot(query(notes, where('level', '==', 'needs'), where('doneAt', '==', null), limit(WAITING)), (snap) => { waiting = read(snap); tell(); }, () => {});
  return () => { stopNewest(); stopWaiting(); };
}

/**
 * Something on a project was dealt with in the browser, with no server call of
 * its own: every unanswered client message, or a client's question about a
 * finish. The server marks the notes about it done for everyone who was asked
 * (functions/src/notify.ts settleNotes). Best effort: the notes can always be
 * marked done by hand.
 */
export async function settleNotes(projectId: string | null | undefined, what: 'messages' | 'finish', id?: string): Promise<void> {
  if (!functions || !projectId) return;
  try {
    const { httpsCallable } = await import('firebase/functions');
    await httpsCallable(functions, 'settleNotes', { timeout: 20000 })({ projectId, what, id: id || '' });
  } catch { /* the notes stay until someone marks them done */ }
}

type Stamp = Partial<Record<'readAt' | 'doneAt' | 'snoozedUntil', number | null>>;

async function stampAll(box: string | null | undefined, ids: string[], s: Stamp): Promise<void> {
  if (!db || !box || !ids.length) return;
  /* Firestore takes 500 writes a batch; a person's inbox holds far fewer. */
  for (let i = 0; i < ids.length; i += 400) {
    const b = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => b.update(doc(db, box, 'notes', id), s));
    await b.commit();
  }
}

export const markRead = (box: string | null | undefined, ids: string[]) => stampAll(box, ids, { readAt: Date.now() });
export const markDone = (box: string | null | undefined, ids: string[]) => stampAll(box, ids, { doneAt: Date.now(), readAt: Date.now() });
export const undoDone = (box: string | null | undefined, ids: string[]) => stampAll(box, ids, { doneAt: null, snoozedUntil: null });
export const snooze = (box: string | null | undefined, ids: string[], until: number) => stampAll(box, ids, { snoozedUntil: until, readAt: Date.now() });
