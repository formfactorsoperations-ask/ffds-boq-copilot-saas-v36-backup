/*
  Design Review records and files: only the drawingReview function writes them.
  Proven against firestore.rules and storage.rules in the local emulators, on a
  throwaway "demo-" project; no live data:

    firebase emulators:exec --only firestore,storage --project demo-security "npx vitest run drawingReview.security.test.ts --environment node"
*/
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, collectionGroup, query, where } from 'firebase/firestore';
import { ref, uploadString, getBytes } from 'firebase/storage';

let env: RulesTestEnvironment;
const STUDIO = 'studio_a';
const OTHER = 'studio_b';
const DT = `organizations/${STUDIO}/projects/p1/drawingTracker`;
const FILES = `drawingReview/${STUDIO}/p1/d1`;

const people: Record<string, any> = {
  admin: { email: 'admin@a.com', tenantId: STUDIO, role: 'Admin' },
  head: { email: 'mayuri@a.com', tenantId: STUDIO, role: 'Design Head' },
  viewer: { email: 'viewer@a.com', tenantId: STUDIO, role: 'Viewer' },
  designer: { email: 'd@a.com', tenantId: STUDIO, role: 'Designer' },
  stranger_designer: { email: 'd2@a.com', tenantId: STUDIO, role: 'Designer' },
  client: { email: 'c@x.com', tenantId: STUDIO, role: 'Client', projectIds: ['p1'] },
  other: { email: 'o@b.com', tenantId: OTHER, role: 'Admin' },
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-security',
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8') },
    storage: { rules: readFileSync(resolve(__dirname, 'storage.rules'), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, p] of Object.entries(people)) await setDoc(doc(db, `users/${uid}`), p);
    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO });
    await setDoc(doc(db, 'projects/p1/designView/current'), { tenantId: STUDIO, designers: ['d@a.com'] });
    await setDoc(doc(db, `${DT}/d1`), { id: 'd1', name: 'Kitchen Elevation', review: { orgId: STUDIO, projectId: 'p1', drawingId: 'd1', state: 'IN_REVIEW', rev: 3 } });
    await setDoc(doc(db, `${DT}/d2`), { id: 'd2', name: 'Wardrobe Elevation' });
    await setDoc(doc(db, `${DT}/d1/reviewMarks/m1`), { versionId: 'v1', n: 1, text: 'Hob on the window centre line', status: 'OPEN' });
    await setDoc(doc(db, `${DT}/d1/reviewVersions/v1`), { n: 1, pdfPath: `${FILES}/versions/v1.pdf` });
    await setDoc(doc(db, `organizations/${OTHER}/projects/q1/drawingTracker/x1`), { name: 'Theirs', review: { orgId: OTHER, state: 'IN_REVIEW' } });
    const st = ctx.storage();
    await uploadString(ref(st, `${FILES}/versions/v1.pdf`), '%PDF-1.4 x', 'raw', { contentType: 'application/pdf' });
    await uploadString(ref(st, `studios/${STUDIO}/plans/a.png`), 'x');
  });
});
afterAll(async () => { await env.cleanup(); });

const token = (uid: string) => ({ email: people[uid]?.email });
const fs = (uid: string) => env.authenticatedContext(uid, token(uid)).firestore();
const st = (uid: string) => env.authenticatedContext(uid, token(uid)).storage();

describe('the review summary on a drawing', () => {
  it('cannot be written by any browser, studio staff included', async () => {
    for (const uid of ['admin', 'head', 'designer']) {
      await assertFails(updateDoc(doc(fs(uid), `${DT}/d1`), { 'review.state': 'APPROVED' }));
      await assertFails(updateDoc(doc(fs(uid), `${DT}/d2`), { review: { orgId: STUDIO, state: 'APPROVED' } }));
    }
    await assertFails(setDoc(doc(fs('admin'), `${DT}/d9`), { name: 'New', review: { orgId: STUDIO, state: 'APPROVED' } }));
  });
  it('leaves the rest of the drawing as it was: the studio and its Designer still edit their fields', async () => {
    await assertSucceeds(updateDoc(doc(fs('admin'), `${DT}/d1`), { targetDate: '2026-10-20' }));
    await assertSucceeds(updateDoc(doc(fs('head'), `${DT}/d2`), { priority: 'high' }));
    await assertSucceeds(updateDoc(doc(fs('designer'), `${DT}/d1`), { driveUrl: 'https://example.com/x' }));
    await assertSucceeds(setDoc(doc(fs('admin'), `${DT}/d8`), { id: 'd8', name: 'Added by the studio' }));
    await assertSucceeds(setDoc(doc(fs('admin'), `${DT}/d1/revisions/r1`), { roundNumber: 2 }));
  });
  it('is read by the studio, the Design Head and the assigned Designer, and nobody else', async () => {
    await assertSucceeds(getDoc(doc(fs('admin'), `${DT}/d1`)));
    await assertSucceeds(getDoc(doc(fs('head'), `${DT}/d1`)));
    await assertSucceeds(getDoc(doc(fs('designer'), `${DT}/d1`)));
    for (const uid of ['stranger_designer', 'client', 'other']) await assertFails(getDoc(doc(fs(uid), `${DT}/d1`)));
  });
});

describe('versions, rounds, notes and history', () => {
  it('cannot be written by any browser', async () => {
    for (const uid of ['admin', 'head', 'designer']) {
      for (const sub of ['reviewMarks', 'reviewVersions', 'reviewRounds', 'reviewEvents']) {
        await assertFails(setDoc(doc(fs(uid), `${DT}/d1/${sub}/forged`), { status: 'APPROVED' }));
      }
      await assertFails(updateDoc(doc(fs(uid), `${DT}/d1/reviewMarks/m1`), { status: 'FIXED' }));
    }
  });
  it('are read by the studio and the assigned Designer only', async () => {
    await assertSucceeds(getDocs(collection(fs('admin'), `${DT}/d1/reviewMarks`)));
    await assertSucceeds(getDocs(collection(fs('head'), `${DT}/d1/reviewVersions`)));
    await assertSucceeds(getDocs(collection(fs('designer'), `${DT}/d1/reviewMarks`)));
    for (const uid of ['stranger_designer', 'client', 'other']) await assertFails(getDocs(collection(fs(uid), `${DT}/d1/reviewMarks`)));
  });
});

describe("the Design Head's inbox across projects", () => {
  it('lists her own studio by name', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(fs('head'), 'drawingTracker'), where('review.orgId', '==', STUDIO), where('review.state', '==', 'IN_REVIEW'))));
  });
  it('refuses another studio, a client and an open query', async () => {
    await assertFails(getDocs(query(collectionGroup(fs('other'), 'drawingTracker'), where('review.orgId', '==', STUDIO))));
    await assertFails(getDocs(query(collectionGroup(fs('client'), 'drawingTracker'), where('review.orgId', '==', STUDIO))));
    await assertFails(getDocs(collectionGroup(fs('head'), 'drawingTracker')));
  });
});

describe('drawing files', () => {
  const pdf = { contentType: 'application/pdf' };
  it('are uploaded by the assigned Designer and studio staff, each into their own folder', async () => {
    await assertSucceeds(uploadString(ref(st('designer'), `${FILES}/uploads/designer/a.pdf`), '%PDF-1.4', 'raw', pdf));
    await assertSucceeds(uploadString(ref(st('head'), `${FILES}/uploads/head/b.pdf`), '%PDF-1.4', 'raw', pdf));
    await assertSucceeds(uploadString(ref(st('designer'), `${FILES}/uploads/designer/a.png`), 'png', 'raw', { contentType: 'image/png' }));
  });
  it("refuse someone else's folder, the wrong kind of file, a Viewer, an unassigned Designer, a client and another studio", async () => {
    await assertFails(uploadString(ref(st('designer'), `${FILES}/uploads/admin/a.pdf`), '%PDF', 'raw', pdf));
    await assertFails(uploadString(ref(st('designer'), `${FILES}/uploads/designer/a.html`), '<x>', 'raw', { contentType: 'text/html' }));
    for (const uid of ['viewer', 'stranger_designer', 'client', 'other']) {
      await assertFails(uploadString(ref(st(uid), `${FILES}/uploads/${uid}/a.pdf`), '%PDF', 'raw', pdf));
    }
  });
  it('once finalised, cannot be written by any browser', async () => {
    for (const uid of ['admin', 'head', 'designer']) {
      await assertFails(uploadString(ref(st(uid), `${FILES}/versions/v1.pdf`), '%PDF swapped', 'raw', pdf));
      await assertFails(uploadString(ref(st(uid), `${FILES}/versions/v2.pdf`), '%PDF new', 'raw', pdf));
    }
  });
  it('are read by the studio, the Design Head and the assigned Designer, and nobody else', async () => {
    await assertSucceeds(getBytes(ref(st('admin'), `${FILES}/versions/v1.pdf`)));
    await assertSucceeds(getBytes(ref(st('head'), `${FILES}/versions/v1.pdf`)));
    await assertSucceeds(getBytes(ref(st('designer'), `${FILES}/versions/v1.pdf`)));
    for (const uid of ['stranger_designer', 'client', 'other']) await assertFails(getBytes(ref(st(uid), `${FILES}/versions/v1.pdf`)));
  });
  it('the Design Head is studio staff for the studio files too', async () => {
    await assertSucceeds(getBytes(ref(st('head'), `studios/${STUDIO}/plans/a.png`)));
  });
});
