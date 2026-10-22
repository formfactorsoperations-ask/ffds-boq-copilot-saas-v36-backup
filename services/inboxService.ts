import { collection, doc, limit, onSnapshot, orderBy, query, writeBatch } from 'firebase/firestore';
import { db } from './firebaseClient';
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
*/

const NEWEST = 120;

export function listenInbox(box: string | null | undefined, onNotes: (notes: Stored[]) => void, onError?: (e: Error) => void): () => void {
  if (!db || !box) { onNotes([]); return () => {}; }
  const q = query(collection(db, box, 'notes'), orderBy('at', 'desc'), limit(NEWEST));
  return onSnapshot(q, (snap) => {
    onNotes(snap.docs.map((d) => ({ ...(d.data() as any), id: d.id }) as Stored));
  }, (e) => { if (onError) onError(e); });
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
