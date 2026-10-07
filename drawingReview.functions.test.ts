/*
  The drawingReview Cloud Function, end to end, in the local emulators: real
  sign-ins, real uploads, the real callable and the real rules. A throwaway
  "demo-" project; nothing touches the live studio.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore,storage,auth --project demo-dr "npx vitest run drawingReview.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getMetadata } from 'firebase/storage';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';

const PROJECT = 'demo-dr';
const BUCKET = `${PROJECT}.appspot.com`;
const STUDIO = 'studio_a';
const DT = `organizations/${STUDIO}/projects/p1/drawingTracker`;

let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
type User = { uid: string; call: (data: any) => Promise<any>; upload: (path: string, bytes: Uint8Array, type: string) => Promise<void> };
const users: Record<string, User> = {};

/* A real two-page PDF, small enough to read at a glance. */
function pdf(label: string): Uint8Array {
  const page = (n: number) => `${n} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] >> endobj\n`;
  const body = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj\n${page(3)}${page(4)}% ${label}\ntrailer << /Root 1 0 R >>\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

async function makeUser(key: string, email: string, profile: any) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, storageBucket: BUCKET }, key);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const st = getStorage(app);
  connectStorageEmulator(st, '127.0.0.1', 9199);
  const cred = await createUserWithEmailAndPassword(auth, email, 'password-123');
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `users/${cred.user.uid}`), { email, ...profile }); });
  const callable = httpsCallable(fns, 'drawingReview', { timeout: 60000 });
  users[key] = {
    uid: cred.user.uid,
    call: async (data) => (await callable({ orgId: STUDIO, projectId: 'p1', ...data })).data,
    upload: async (path, bytes, type) => { await uploadBytes(ref(st, path), bytes, { contentType: type }); },
  };
}

const code = async (p: Promise<any>) => { try { await p; return 'ok'; } catch (e: any) { return String(e.code || e.message); } };
const read = async (path: string) => {
  let out: any;
  await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDoc(doc(ctx.firestore(), path))).data(); });
  return out;
};
const list = async (path: string) => {
  let out: any[] = [];
  await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDocs(collection(ctx.firestore(), path))).docs.map((d) => ({ id: d.id, ...d.data() })); });
  return out;
};
const up = (who: string, drawing: string, name: string) => `drawingReview/${STUDIO}/p1/${drawing}/uploads/${users[who].uid}/${name}`;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8') },
    storage: { rules: readFileSync(resolve(__dirname, 'storage.rules'), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${STUDIO}`), { name: 'Studio A', projectDesigners: { p1: ['d@a.com'] } });
    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO, context: { name: 'Mehta Residence' } });
    await setDoc(doc(db, 'projects/p1/designView/current'), { tenantId: STUDIO, designers: ['d@a.com'] });
    await setDoc(doc(db, `${DT}/d1`), { id: 'd1', name: 'Kitchen Elevation', roomName: 'Kitchen', currentRound: 1, rounds: [] });
    await setDoc(doc(db, `${DT}/d2`), { id: 'd2', name: 'Living Feature Wall', roomName: 'Living', currentRound: 0, rounds: [] });
  });
  await makeUser('designer', 'd@a.com', { tenantId: STUDIO, role: 'Designer' });
  await makeUser('head', 'mayuri@a.com', { tenantId: STUDIO, role: 'Design Head', displayName: 'Mayuri' });
  await makeUser('stranger', 'd2@a.com', { tenantId: STUDIO, role: 'Designer' });
  await makeUser('other', 'o@b.com', { tenantId: 'studio_b', role: 'Admin' });
  /* The project trigger rebuilds designView from the studio's map; wait for it to settle. */
  await new Promise((r) => setTimeout(r, 3000));
}, 120000);

afterAll(async () => {
  for (const a of apps) await deleteApp(a);
  await env.cleanup();
});

describe('a sheet through review', () => {
  let rev = 0;

  it('a designer uploads v1 and sends it in one step', async () => {
    const path = up('designer', 'd1', 'kitchen.pdf');
    await users.designer.upload(path, pdf('v1'), 'application/pdf');
    await users.designer.upload(up('designer', 'd1', 'kitchen.png'), PNG, 'image/png');
    const res = await users.designer.call({ drawingId: 'd1', action: 'finalize', uploadPath: path, thumbPath: up('designer', 'd1', 'kitchen.png'), fileName: 'kitchen.pdf', note: 'First pass', submit: true });
    expect(res.review.state).toBe('IN_REVIEW');
    expect(res.review.versionNo).toBe(1);
    expect(res.review.pageCount).toBe(2);
    expect(res.review.thumbPath).toMatch(/versions\/.*\.png$/);
    rev = res.review.rev;
    const d = await read(`${DT}/d1`);
    expect(d.review.state).toBe('IN_REVIEW');
    expect(d.pendingReview?.submittedBy).toBeTruthy();
    const versions = await list(`${DT}/d1/reviewVersions`);
    expect(versions).toHaveLength(1);
    expect(versions[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await list(`${DT}/d1/reviewRounds`))[0].status).toBe('OPEN');
  });

  it('a retried call finds the same version instead of making another', async () => {
    const versions = await list(`${DT}/d1/reviewVersions`);
    const again = await users.designer.call({ drawingId: 'd1', action: 'finalize', uploadPath: versions[0].source, fileName: 'kitchen.pdf' });
    expect(again.repeated).toBe(true);
    expect(await list(`${DT}/d1/reviewVersions`)).toHaveLength(1);
  });

  it('a designer cannot approve, and cannot upload over a sheet being reviewed', async () => {
    expect(await code(users.designer.call({ drawingId: 'd1', action: 'approve', expectedRev: rev }))).toBe('functions/permission-denied');
    const path = up('designer', 'd1', 'early.pdf');
    await users.designer.upload(path, pdf('early'), 'application/pdf');
    expect(await code(users.designer.call({ drawingId: 'd1', action: 'finalize', uploadPath: path, fileName: 'early.pdf' }))).toBe('functions/failed-precondition');
  });

  it('the Design Head pins notes; a must-fix note blocks approval', async () => {
    await users.head.call({ drawingId: 'd1', action: 'mark', op: 'create', page: 0, shape: { t: 'pin', x: 0.5, y: 0.35 }, text: 'Hob on the window centre line' });
    await users.head.call({ drawingId: 'd1', action: 'mark', op: 'create', page: 0, shape: { t: 'rect', x: 0.4, y: 0.1, w: 0.2, h: 0.15 }, text: 'Chimney height above the counter?', blocking: true });
    await users.head.call({ drawingId: 'd1', action: 'mark', op: 'create', page: 0, shape: { t: 'pen', pts: [[0.1, 0.5], [0.15, 0.52], [0.2, 0.55], [0.25, 0.5]] }, text: 'Round off this corner' });
    const sketch = (await list(`${DT}/d1/reviewMarks`)).find((m) => m.shape.t === 'pen');
    expect(sketch.shape.xy).toHaveLength(8);
    const d = await read(`${DT}/d1`);
    expect(d.review.marksOpen).toBe(3);
    expect(await code(users.head.call({ drawingId: 'd1', action: 'approve', expectedRev: d.review.rev }))).toBe('functions/failed-precondition');
    expect(await code(users.designer.call({ drawingId: 'd1', action: 'mark', op: 'create', page: 0, shape: { t: 'pin', x: 0.1, y: 0.1 }, text: 'x' }))).toBe('functions/permission-denied');
  });

  it('a stale screen cannot decide; the current one returns the sheet', async () => {
    const d = await read(`${DT}/d1`);
    expect(await code(users.head.call({ drawingId: 'd1', action: 'return', expectedRev: d.review.rev - 1, reason: 'x' }))).toBe('functions/aborted');
    const res = await users.head.call({ drawingId: 'd1', action: 'return', expectedRev: d.review.rev, reason: 'Two things, both marked.' });
    expect(res.review.state).toBe('CHANGES_REQUESTED');
    expect((await read(`${DT}/d1`)).pendingReview).toBeNull();
  });

  it('the designer ticks the notes off and sends v2', async () => {
    const marks = await list(`${DT}/d1/reviewMarks`);
    for (const m of marks) await users.designer.call({ drawingId: 'd1', action: 'mark', op: 'fix', markId: m.id });
    expect((await read(`${DT}/d1`)).review.marksOpen).toBe(0);
    const path = up('designer', 'd1', 'kitchen-v2.pdf');
    await users.designer.upload(path, pdf('v2'), 'application/pdf');
    const v2 = await users.designer.call({ drawingId: 'd1', action: 'finalize', uploadPath: path, fileName: 'kitchen-v2.pdf' });
    expect(v2.review.state).toBe('DRAFT');
    expect(v2.review.versionNo).toBe(2);
    expect(v2.review.marksTotal).toBe(0);
    const fixed = await list(`${DT}/d1/reviewMarks`);
    expect(fixed.every((m) => m.fixedInVersionNo === 2)).toBe(true);
    const sent = await users.designer.call({ drawingId: 'd1', action: 'submit', expectedRev: v2.review.rev });
    expect(sent.review.state).toBe('IN_REVIEW');
    expect(sent.review.attempts).toBe(2);
  });

  it('the Design Head approves v2', async () => {
    const d = await read(`${DT}/d1`);
    const res = await users.head.call({ drawingId: 'd1', action: 'approve', expectedRev: d.review.rev });
    expect(res.review.state).toBe('APPROVED');
    expect(res.review.selfApproved).toBe(false);
    const rounds = await list(`${DT}/d1/reviewRounds`);
    expect(rounds.map((r) => r.status).sort()).toEqual(['APPROVED', 'CHANGES_REQUESTED']);
    const events = (await list(`${DT}/d1/reviewEvents`)).map((e) => e.type).sort();
    expect(events).toEqual(['approved', 'returned', 'submitted', 'submitted', 'uploaded', 'uploaded']);
  });

  it('the final file sits where no browser can write, and the upload is cleared away', async () => {
    const d = await read(`${DT}/d1`);
    const fns = getStorage(apps[0]);
    expect((await getMetadata(ref(fns, d.review.pdfPath))).size).toBeGreaterThan(100);
    expect(await code(getMetadata(ref(fns, up('designer', 'd1', 'kitchen-v2.pdf'))))).toBe('storage/object-not-found');
  });

  it('the Design Head may approve her own sheet, and the record says so', async () => {
    const path = up('head', 'd2', 'feature-wall.pdf');
    await users.head.upload(path, pdf('wall'), 'application/pdf');
    const sent = await users.head.call({ drawingId: 'd2', action: 'finalize', uploadPath: path, fileName: 'feature-wall.pdf', submit: true });
    const res = await users.head.call({ drawingId: 'd2', action: 'approve', expectedRev: sent.review.rev });
    expect(res.review.selfApproved).toBe(true);
  });

  it('a designer can pull a sheet back while it waits', async () => {
    const path = up('designer', 'd1', 'kitchen-v3.pdf');
    await users.designer.upload(path, pdf('v3'), 'application/pdf');
    const sent = await users.designer.call({ drawingId: 'd1', action: 'finalize', uploadPath: path, fileName: 'kitchen-v3.pdf', submit: true });
    expect(sent.review.versionNo).toBe(3);
    const back = await users.designer.call({ drawingId: 'd1', action: 'withdraw', expectedRev: sent.review.rev });
    expect(back.review.state).toBe('DRAFT');
  });

  it('a wrong PDF nobody reviewed can be taken back; the sheet returns to the approved v2', async () => {
    const d = await read(`${DT}/d1`);
    expect(d.review.versionNo).toBe(3);
    const res = await users.designer.call({ drawingId: 'd1', action: 'remove', expectedRev: d.review.rev, versionId: d.review.versionId });
    expect(res.review.versionNo).toBe(2);
    expect(res.review.state).toBe('APPROVED');
    expect((await list(`${DT}/d1/reviewVersions`)).map((v) => v.n).sort()).toEqual([1, 2]);
    expect((await list(`${DT}/d1/reviewEvents`)).some((e) => e.type === 'removed')).toBe(true);
  });

  it('a reviewed version stays: approved v2 cannot be removed', async () => {
    const d = await read(`${DT}/d1`);
    expect(await code(users.designer.call({ drawingId: 'd1', action: 'remove', expectedRev: d.review.rev, versionId: d.review.versionId }))).toBe('functions/failed-precondition');
  });
});

describe('the check before an upload', () => {
  it('lets an assigned designer start, and explains a refusal before any bytes move', async () => {
    expect((await users.designer.call({ drawingId: 'd2', action: 'check' })).ok).toBe(true);
    expect(await code(users.stranger.call({ drawingId: 'd2', action: 'check' }))).toBe('functions/permission-denied');
  });
});

describe('what the function refuses', () => {
  it('a file that is not really a PDF', async () => {
    const path = up('designer', 'd1', 'fake.pdf');
    await users.designer.upload(path, new TextEncoder().encode('<html>not a pdf</html>'), 'application/pdf');
    expect(await code(users.designer.call({ drawingId: 'd1', action: 'finalize', uploadPath: path, fileName: 'fake.pdf' }))).toBe('functions/invalid-argument');
  });
  it("a file from someone else's folder", async () => {
    expect(await code(users.head.call({ drawingId: 'd1', action: 'finalize', uploadPath: up('designer', 'd1', 'kitchen.pdf'), fileName: 'x.pdf' }))).toBe('functions/invalid-argument');
  });
  it('a Designer not on the project, and another studio', async () => {
    expect(await code(users.stranger.call({ drawingId: 'd1', action: 'submit' }))).toBe('functions/permission-denied');
    expect(await code(users.other.call({ drawingId: 'd1', action: 'submit' }))).toBe('functions/permission-denied');
  });
  it("only the studio's leads say who a drawing is for", async () => {
    expect(await code(users.designer.call({ drawingId: 'd1', action: 'audience', audience: 'studio' }))).toBe('functions/permission-denied');
    const res = await users.head.call({ drawingId: 'd1', action: 'audience', audience: 'studio' });
    expect(res.review.audience).toBe('studio');
  });
});
