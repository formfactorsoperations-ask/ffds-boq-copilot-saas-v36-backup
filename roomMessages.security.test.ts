/*
  Room messages (lib/roomMessages.ts): who may read and write them.
  Proven against firestore.rules in the local emulator, on a throwaway
  "demo-" project; no live data:

    firebase emulators:exec --only firestore --project demo-security "npx vitest run roomMessages.security.test.ts --environment node"
*/
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

let env: RulesTestEnvironment;
const STUDIO = 'studio_a';
const OTHER = 'studio_b';
const MSGS = 'projects/p1/roomMessages';

const people: Record<string, any> = {
  owner: { email: 'owner@a.com', tenantId: STUDIO, role: 'Owner' },
  admin: { email: 'admin@a.com', tenantId: STUDIO, role: 'Admin' },
  ops_director: { email: 'ops@a.com', tenantId: STUDIO, role: 'Ops Director' },
  head: { email: 'mayuri@a.com', tenantId: STUDIO, role: 'Design Head' },
  viewer: { email: 'viewer@a.com', tenantId: STUDIO, role: 'Viewer' },
  designer: { email: 'd@a.com', tenantId: STUDIO, role: 'Designer' },
  stranger_designer: { email: 'd2@a.com', tenantId: STUDIO, role: 'Designer' },
  relations: { email: 'cr@a.com', tenantId: STUDIO, role: 'Client Relations' },
  stranger_relations: { email: 'cr2@a.com', tenantId: STUDIO, role: 'Client Relations' },
  supervisor: { email: 'site@a.com', tenantId: STUDIO, role: 'Site Supervisor' },
  stranger_supervisor: { email: 'site2@a.com', tenantId: STUDIO, role: 'Site Supervisor' },
  vendor: { email: 'v@x.com', tenantId: STUDIO, role: 'Vendor' },
  client: { email: 'c@x.com', tenantId: STUDIO, role: 'Client', projectIds: ['p1'] },
  other: { email: 'o@b.com', tenantId: OTHER, role: 'Admin' },
};
const READERS = ['owner', 'admin', 'ops_director', 'head', 'designer', 'relations', 'supervisor'];
const OUTSIDERS = ['viewer', 'stranger_designer', 'stranger_relations', 'stranger_supervisor', 'vendor', 'client', 'other'];

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-security',
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, p] of Object.entries(people)) await setDoc(doc(db, `users/${uid}`), p);
    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO });
    await setDoc(doc(db, 'projects/p1/designView/current'), { tenantId: STUDIO, designers: ['d@a.com'] });
    await setDoc(doc(db, 'projects/p1/teamView/ops'), { tenantId: STUDIO, members: ['cr@a.com'] });
    await setDoc(doc(db, 'projects/p1/teamView/site'), { tenantId: STUDIO, members: ['site@a.com'] });
    await setDoc(doc(db, `${MSGS}/m1`), { tenantId: STUDIO, projectId: 'p1', room: 'Kitchen', text: 'Hob moves 300 left', by: { uid: 'head', email: 'mayuri@a.com', name: 'Mayuri' }, at: Date.now() });
    /* The other studio's project, and a project of this studio with no server copy yet. */
    await setDoc(doc(db, 'projects/q1'), { tenantId: OTHER });
    await setDoc(doc(db, 'projects/q1/designView/current'), { tenantId: OTHER, designers: [] });
    await setDoc(doc(db, 'projects/q1/roomMessages/x1'), { tenantId: OTHER, projectId: 'q1', room: 'Kitchen', text: 'Theirs', by: { uid: 'other', email: 'o@b.com', name: 'O' }, at: Date.now() });
    await setDoc(doc(db, 'projects/p9'), { tenantId: STUDIO });
  });
});
afterAll(async () => { await env.cleanup(); });

const fs = (uid: string) => env.authenticatedContext(uid, { email: people[uid]?.email }).firestore();
const msg = (uid: string, extra: any = {}) => ({
  tenantId: STUDIO, projectId: 'p1', room: 'Kitchen', text: 'Tall unit 600 deep',
  by: { uid, email: people[uid].email, name: uid }, at: Date.now(), ...extra,
});
const list = (uid: string, project = 'p1', tenant = STUDIO) => getDocs(query(collection(fs(uid), `projects/${project}/roomMessages`), where('tenantId', '==', tenant)));

describe('reading room messages', () => {
  it('is for the design leads and the Designers, Client Relations and Site Supervisors on the project', async () => {
    for (const uid of READERS) {
      await assertSucceeds(getDoc(doc(fs(uid), `${MSGS}/m1`)));
      await assertSucceeds(list(uid));
    }
  });
  it('is refused to everyone else: other roles, people not on the project, a vendor, the client, another studio', async () => {
    for (const uid of OUTSIDERS) {
      await assertFails(getDoc(doc(fs(uid), `${MSGS}/m1`)));
      await assertFails(list(uid));
    }
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${MSGS}/m1`)));
  });
  it('needs a list to name the studio, and never crosses studios', async () => {
    await assertFails(getDocs(collection(fs('admin'), MSGS)));
    await assertFails(list('admin', 'q1', OTHER));
    await assertFails(getDoc(doc(fs('admin'), 'projects/q1/roomMessages/x1')));
    await assertSucceeds(list('other', 'q1', OTHER));
  });
});

describe('writing a room message', () => {
  it('is open to the same people, under their own name', async () => {
    for (const uid of READERS) await assertSucceeds(addDoc(collection(fs(uid), MSGS), msg(uid)));
  });
  it('is refused to everyone else', async () => {
    for (const uid of OUTSIDERS) await assertFails(addDoc(collection(fs(uid), MSGS), msg(uid, uid === 'other' ? { tenantId: OTHER } : {})));
  });
  it("cannot be signed as someone else, or filed under another studio or project", async () => {
    await assertFails(addDoc(collection(fs('designer'), MSGS), msg('designer', { by: { uid: 'head', email: 'mayuri@a.com', name: 'Mayuri' } })));
    await assertFails(addDoc(collection(fs('designer'), MSGS), msg('designer', { by: { uid: 'designer', email: 'mayuri@a.com', name: 'd' } })));
    await assertFails(addDoc(collection(fs('admin'), MSGS), msg('admin', { projectId: 'q1' })));
    await assertFails(addDoc(collection(fs('admin'), MSGS), msg('admin', { tenantId: OTHER })));
    /* A lead of this studio writing beneath the other studio's project, under their own studio's name. */
    await assertFails(addDoc(collection(fs('admin'), 'projects/q1/roomMessages'), msg('admin', { projectId: 'q1' })));
    /* A project the server has not made its copy of yet. */
    await assertFails(addDoc(collection(fs('admin'), 'projects/p9/roomMessages'), msg('admin', { projectId: 'p9' })));
  });
  it('keeps to its shape: a room, some words within the limit, the time now, nothing extra', async () => {
    const bad = [
      { text: '' }, { text: 'x'.repeat(2001) }, { text: 42 }, { room: '' }, { room: 'x'.repeat(121) },
      { at: Date.now() - 3_600_000 }, { at: 'now' }, { pinned: true }, { by: { uid: 'head', email: 'mayuri@a.com', name: 'M', role: 'Owner' } },
    ];
    for (const extra of bad) await assertFails(addDoc(collection(fs('head'), MSGS), msg('head', extra)));
    const { at, ...noTime } = msg('head');
    await assertFails(addDoc(collection(fs('head'), MSGS), noTime));
    await assertSucceeds(addDoc(collection(fs('head'), MSGS), msg('head', { text: 'x'.repeat(2000) })));
  });
  it('is written once: nobody edits or deletes a message, its writer and the owner included', async () => {
    for (const uid of ['head', 'owner', 'admin']) {
      await assertFails(updateDoc(doc(fs(uid), `${MSGS}/m1`), { text: 'Changed' }));
      await assertFails(deleteDoc(doc(fs(uid), `${MSGS}/m1`)));
    }
    await assertFails(setDoc(doc(fs('head'), `${MSGS}/m1`), msg('head')));
  });
});
