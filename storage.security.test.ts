/*
  Who may read and upload the studio's files, proven against storage.rules in
  the local emulators (a throwaway "demo-" project; no live data):

    firebase emulators:exec --only firestore,storage --project demo-security "npx vitest run storage.security.test.ts --environment node"
*/
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadString, getBytes, deleteObject } from 'firebase/storage';

let env: RulesTestEnvironment;
const STUDIO = 'studio_a';
const OTHER = 'studio_b';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-security',
    firestore: { rules: 'rules_version = "2"; service cloud.firestore { match /{d=**} { allow read, write: if false; } }' },
    storage: { rules: readFileSync(resolve(__dirname, 'storage.rules'), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/member'), { tenantId: STUDIO, role: 'Admin' });
    await setDoc(doc(db, 'users/designer'), { tenantId: STUDIO, role: 'Designer' });
    await setDoc(doc(db, 'users/viewer'), { tenantId: STUDIO, role: 'Viewer' });
    await setDoc(doc(db, 'users/client'), { tenantId: STUDIO, role: 'Client', projectIds: ['p1'] });
    await setDoc(doc(db, 'users/other'), { tenantId: OTHER, role: 'Admin' });
    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO });
    const st = ctx.storage();
    await uploadString(ref(st, `studios/${STUDIO}/plans/a.png`), 'x');
    await uploadString(ref(st, 'projects/p1/decisions/d1/drawing.pdf'), 'x');
    await uploadString(ref(st, 'decisions/p1/d1/site-photo.jpg'), 'x');
  });
});
afterAll(async () => { await env.cleanup(); });

const as = (uid: string | null, token: any = {}) =>
  (uid ? env.authenticatedContext(uid, token) : env.unauthenticatedContext()).storage();
const stranger = () => as('stranger', { email: 's@evil.com', email_verified: true });

describe('studio files', () => {
  it('are refused to the public, a stranger with Google, a client and another studio', async () => {
    for (const st of [as(null), stranger(), as('client'), as('other')]) {
      await assertFails(getBytes(ref(st, `studios/${STUDIO}/plans/a.png`)));
      await assertFails(getBytes(ref(st, 'projects/p1/decisions/d1/drawing.pdf')));
      await assertFails(getBytes(ref(st, 'decisions/p1/d1/site-photo.jpg')));
      await assertFails(uploadString(ref(st, `studios/${STUDIO}/plans/b.png`), 'x'));
      await assertFails(uploadString(ref(st, 'projects/p1/decisions/d1/evil.pdf'), 'x'));
    }
  });
  it('are read and uploaded by the studio, including a Designer', async () => {
    await assertSucceeds(getBytes(ref(as('member'), `studios/${STUDIO}/plans/a.png`)));
    await assertSucceeds(uploadString(ref(as('member'), 'projects/p1/decisions/d1/new.pdf'), 'x'));
    await assertSucceeds(uploadString(ref(as('designer'), 'decisions/p1/d2/site-photo.jpg'), 'x'));
  });
  it('are read but not changed by a Viewer', async () => {
    await assertSucceeds(getBytes(ref(as('viewer'), 'projects/p1/decisions/d1/drawing.pdf')));
    await assertFails(uploadString(ref(as('viewer'), 'projects/p1/decisions/d1/v.pdf'), 'x'));
    await assertFails(deleteObject(ref(as('viewer'), 'projects/p1/decisions/d1/drawing.pdf')));
  });
  it('lets the verified platform owner in', async () => {
    await assertSucceeds(getBytes(ref(as('owner', { email: 'formfactors.operations@gmail.com', email_verified: true }), `studios/${STUDIO}/plans/a.png`)));
  });
  it('holds an upload to 25 MB', async () => {
    const big = 'x'.repeat(26 * 1024 * 1024);
    await assertFails(uploadString(ref(as('member'), `studios/${STUDIO}/plans/huge.png`), big));
  });
  it('refuses every other path', async () => {
    await assertFails(uploadString(ref(as('member'), 'anything/else.txt'), 'x'));
  });
});
