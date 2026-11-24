import { addDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebaseClient';
import { cleanMessage, type MessagePerson, type RoomMessage } from '../lib/roomMessages';

/*
  Room messages in the browser (lib/roomMessages.ts): listen to a project's
  messages and add one. The security rules decide who may do either
  (firestore.rules, projects/{projectId}/roomMessages). A message is written
  once and never changed; the onRoomMessageCreated function tells the people
  on the project.
*/

const path = (projectId: string) => `projects/${projectId}/roomMessages`;

/**
 * Every message of one project, live. One query that names the studio, as the
 * rules require; the rooms are split on the screen, so no index is needed.
 */
export function watchProjectMessages(orgId: string, projectId: string, onChange: (list: RoomMessage[]) => void, onError?: (e: any) => void) {
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, path(projectId)), where('tenantId', '==', orgId)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as RoomMessage)),
    (e) => onError?.(e));
}

/** Write a message in a room. Throws with plain words when it cannot be sent. */
export async function postRoomMessage(m: { orgId: string; projectId: string; room: string; text: string; by: MessagePerson }): Promise<void> {
  const text = cleanMessage(m.text);
  if (!text) throw new Error('Write a message first.');
  if (!db) throw new Error('Not connected to the studio.');
  try {
    await addDoc(collection(db, path(m.projectId)), {
      tenantId: m.orgId, projectId: m.projectId, room: m.room, text,
      by: { uid: m.by.uid, email: m.by.email.toLowerCase(), name: m.by.name },
      at: Date.now(),
    });
  } catch (e: any) {
    throw new Error(e?.code === 'permission-denied'
      ? 'You cannot write in this room. Messages are for the design leads and the people assigned to this project.'
      : 'The message was not sent. Check the connection and try again.');
  }
}
