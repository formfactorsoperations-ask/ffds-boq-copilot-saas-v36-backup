/*
  Each person's notifications, proven against the rules (lib/notify.ts,
  functions/src/notify.ts): a person reads only their own inbox, by verified
  email; may mark a note read, done or snoozed; and may not write, rewrite or
  delete a note, which only the server does.

    firebase emulators:exec --only firestore --project demo-security "npx vitest run inbox.security.test.ts"
*/
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, orderBy, limit } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-security',
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8') },
  });
});
afterAll(async () => { await env.cleanup(); });

const note = (over: any = {}) => ({
  kind: 'client.message', area: 'clients', level: 'needs', title: 'Mr Prasad Naik sent you a message', line: '“Walnut, not oak.”',
  projectId: 'p1', projectName: 'Harmony 704', route: 'comms-tracker', action: 'Reply', actor: 'Mr Prasad Naik', initials: 'PN',
  group: null, at: 1000, readAt: null, doneAt: null, snoozedUntil: null, tenantId: 'studio_a', ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'inbox/riya@ff.in/notes/n1'), note());
    await setDoc(doc(db, 'inbox/meera@ff.in/notes/n2'), note());
  });
});

const as = (uid: string, email: string, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore();

describe('a person\'s inbox', () => {
  it('reads and lists their own notes, whatever the case of their address', async () => {
    const db = as('riya', 'Riya@FF.in');
    await assertSucceeds(getDoc(doc(db, 'inbox/riya@ff.in/notes/n1')));
    await assertSucceeds(getDocs(query(collection(db, 'inbox/riya@ff.in/notes'), orderBy('at', 'desc'), limit(80))));
  });

  it('cannot read anybody else\'s', async () => {
    const db = as('riya', 'riya@ff.in');
    await assertFails(getDoc(doc(db, 'inbox/meera@ff.in/notes/n2')));
    await assertFails(getDocs(collection(db, 'inbox/meera@ff.in/notes')));
  });

  it('cannot be read with an address that is not verified, or signed out', async () => {
    await assertFails(getDoc(doc(as('x', 'riya@ff.in', false), 'inbox/riya@ff.in/notes/n1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'inbox/riya@ff.in/notes/n1')));
  });

  it('may mark a note read, done or snoozed', async () => {
    const db = as('riya', 'riya@ff.in');
    await assertSucceeds(updateDoc(doc(db, 'inbox/riya@ff.in/notes/n1'), { readAt: 2000 }));
    await assertSucceeds(updateDoc(doc(db, 'inbox/riya@ff.in/notes/n1'), { doneAt: 3000, snoozedUntil: null }));
    await assertSucceeds(updateDoc(doc(db, 'inbox/riya@ff.in/notes/n1'), { snoozedUntil: 9000, doneAt: null }));
  });

  it('may not change what a note says or where it leads, or stamp it with anything but a time', async () => {
    const db = as('riya', 'riya@ff.in');
    await assertFails(updateDoc(doc(db, 'inbox/riya@ff.in/notes/n1'), { title: 'Something else' }));
    await assertFails(updateDoc(doc(db, 'inbox/riya@ff.in/notes/n1'), { route: 'payment-calc' }));
    await assertFails(updateDoc(doc(db, 'inbox/riya@ff.in/notes/n1'), { readAt: 'yesterday' }));
    await assertFails(updateDoc(doc(as('meera', 'meera@ff.in'), 'inbox/riya@ff.in/notes/n1'), { readAt: 2000 }));
  });

  it('may not write or delete a note: only the server does', async () => {
    const db = as('riya', 'riya@ff.in');
    await assertFails(setDoc(doc(db, 'inbox/riya@ff.in/notes/mine'), note()));
    await assertFails(setDoc(doc(db, 'inbox/meera@ff.in/notes/forged'), note({ title: 'Approve this' })));
    await assertFails(deleteDoc(doc(db, 'inbox/riya@ff.in/notes/n1')));
  });
});
