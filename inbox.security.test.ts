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
    await setDoc(doc(db, 'users/riya'), { email: 'riya@ff.in', tenantId: 'studio_a', role: 'Client Relations' });
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

describe('a person\'s settings and devices', () => {
  const prefs = { bar: { clients: true, team: false }, desktop: { clients: true }, phone: { clients: true }, sound: true, quiet: 'night', checkins: 'exceptions' };

  it('are theirs to save beside their inbox, with their time zone', async () => {
    await assertSucceeds(setDoc(doc(as('riya', 'riya@ff.in'), 'inbox/riya@ff.in'), { prefs, tz: 'Asia/Kolkata', updatedAt: 1 }, { merge: true }));
    await assertSucceeds(getDoc(doc(as('riya', 'riya@ff.in'), 'inbox/riya@ff.in')));
  });

  it('cannot be saved or read for somebody else, or carry anything but settings', async () => {
    await assertFails(setDoc(doc(as('meera', 'meera@ff.in'), 'inbox/riya@ff.in'), { prefs }));
    await assertFails(getDoc(doc(as('meera', 'meera@ff.in'), 'inbox/riya@ff.in')));
    await assertFails(setDoc(doc(as('riya', 'riya@ff.in'), 'inbox/riya@ff.in'), { prefs, role: 'Admin' }));
    await assertFails(setDoc(doc(as('riya', 'riya@ff.in'), 'inbox/riya@ff.in'), { prefs: 'everything' }));
    await assertFails(updateDoc(doc(as('riya', 'riya@ff.in'), 'users/riya'), { notifyPrefs: prefs }));
  });

  it('a device for phone notifications is theirs to add and remove, and nobody else\'s', async () => {
    const mine = doc(as('riya', 'riya@ff.in'), 'inbox/riya@ff.in/devices/d1');
    await assertSucceeds(setDoc(mine, { token: 'fcm-token-abc', platform: 'Android · Chrome', at: 1 }));
    await assertSucceeds(deleteDoc(mine));
    await assertFails(setDoc(doc(as('meera', 'meera@ff.in'), 'inbox/riya@ff.in/devices/d2'), { token: 'x', platform: '', at: 1 }));
    await assertFails(setDoc(doc(as('riya', 'riya@ff.in'), 'inbox/riya@ff.in/devices/d3'), { token: 'x', at: 1, email: 'other@x.com' }));
    await assertFails(getDocs(collection(as('meera', 'meera@ff.in'), 'inbox/riya@ff.in/devices')));
  });
});

describe('a client\'s "New for you"', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'portalInbox/client1/notes/c1'), note({ kind: 'portal.document', title: 'New for you: a scope revision', route: 'documents' }));
    });
  });
  /* Client logins are password accounts: their address is not verified, and their sign-in is what identifies them. */
  const client = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@home.in`, email_verified: false }).firestore();

  it('is read and marked by that client only', async () => {
    await assertSucceeds(getDocs(collection(client('client1'), 'portalInbox/client1/notes')));
    await assertSucceeds(updateDoc(doc(client('client1'), 'portalInbox/client1/notes/c1'), { readAt: 5, doneAt: 6 }));
    await assertFails(getDocs(collection(client('client2'), 'portalInbox/client1/notes')));
    await assertFails(updateDoc(doc(client('client1'), 'portalInbox/client1/notes/c1'), { title: 'Pay now' }));
  });

  it('keeps that client\'s own settings and phones, and nobody else\'s', async () => {
    await assertSucceeds(setDoc(doc(client('client1'), 'portalInbox/client1'), { prefs: { phone: { clients: true } }, tz: 'Asia/Kolkata', updatedAt: 1 }, { merge: true }));
    await assertSucceeds(setDoc(doc(client('client1'), 'portalInbox/client1/devices/d1'), { token: 'fcm-token', platform: 'iPhone · Safari', at: 1 }));
    await assertFails(setDoc(doc(client('client2'), 'portalInbox/client1/devices/d2'), { token: 'x', platform: '', at: 1 }));
    await assertFails(setDoc(doc(client('client1'), 'portalInbox/client1'), { prefs: {}, projectIds: ['p9'] }));
  });

  it('is never written by a browser', async () => {
    await assertFails(setDoc(doc(client('client1'), 'portalInbox/client1/notes/x'), note()));
    await assertFails(deleteDoc(doc(client('client1'), 'portalInbox/client1/notes/c1')));
  });
});
