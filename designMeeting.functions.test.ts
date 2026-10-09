/*
  The designMeeting Cloud Function, end to end, in the local emulators, with
  the drawingReview function it hands the client's changes to. A throwaway
  "demo-" project; nothing touches the live studio.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore,storage,auth --project demo-dm "npx vitest run designMeeting.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getStorage, connectStorageEmulator, ref, uploadBytes } from 'firebase/storage';
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc } from 'firebase/firestore';

const PROJECT = 'demo-dm';
const BUCKET = `${PROJECT}.appspot.com`;
const STUDIO = 'studio_m';
const P = `organizations/${STUDIO}/projects/p1`;
const DT = `${P}/drawingTracker`;

let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
type User = { uid: string; email: string; review: (data: any) => Promise<any>; meet: (data: any) => Promise<any>; act: (action: any) => Promise<any>; sheet: (data: any) => Promise<any>; upload: (path: string, bytes: Uint8Array) => Promise<void> };
const users: Record<string, User> = {};

function pdf(label: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] >> endobj\n% ${label}\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
}

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
  const review = httpsCallable(fns, 'drawingReview', { timeout: 60000 });
  const meet = httpsCallable(fns, 'designMeeting', { timeout: 60000 });
  const act = httpsCallable(fns, 'submitClientAction', { timeout: 60000 });
  const sheet = httpsCallable(fns, 'portalSheet', { timeout: 60000 });
  users[key] = {
    uid: cred.user.uid, email,
    review: async (data) => (await review({ orgId: STUDIO, projectId: 'p1', ...data })).data,
    meet: async (data) => (await meet({ orgId: STUDIO, projectId: 'p1', ...data })).data,
    act: async (action) => (await act({ projectId: 'p1', action })).data,
    sheet: async (data) => (await sheet({ projectId: 'p1', ...data })).data,
    upload: async (path, bytes) => { await uploadBytes(ref(st, path), bytes, { contentType: 'application/pdf' }); },
  };
}

const code = async (p: Promise<any>) => { try { await p; return 'ok'; } catch (e: any) { return String(e.code || e.message); } };
const read = async (path: string) => { let out: any; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDoc(doc(ctx.firestore(), path))).data(); }); return out; };
const list = async (path: string) => { let out: any[] = []; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDocs(collection(ctx.firestore(), path))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };

/* A sheet taken through Phase 1: uploaded, sent and approved. */
async function approved(drawingId: string, label: string) {
  const path = `drawingReview/${STUDIO}/p1/${drawingId}/uploads/${users.designer.uid}/${label}.pdf`;
  await users.designer.upload(path, pdf(label));
  await users.designer.review({ drawingId, action: 'finalize', uploadPath: path, fileName: `${label}.pdf`, submit: true });
  const d = await read(`${DT}/${drawingId}`);
  await users.head.review({ drawingId, action: 'approve', expectedRev: d.review.rev });
  return (await read(`${DT}/${drawingId}`)).review;
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8') },
    storage: { rules: readFileSync(resolve(__dirname, 'storage.rules'), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${STUDIO}`), { name: 'Studio M', projectDesigners: { p1: ['riya@m.com'] } });
    await setDoc(doc(db, `organizations/${STUDIO}/settings/terms`), { includedRevisionRounds: 0 });
    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO, context: { name: 'Harmony 704' } });
    await setDoc(doc(db, 'projects/p1/designView/current'), { tenantId: STUDIO, designers: ['riya@m.com'] });
    await setDoc(doc(db, P), { tenantId: STUDIO });
    await setDoc(doc(db, 'projects/p1/portalView/current'), { v: 1, builtAt: 'x', projectId: 'p1', context: { name: 'Harmony 704' } });
    await setDoc(doc(db, `${DT}/k1`), { id: 'k1', name: 'Kitchen Elevation A', roomName: 'Kitchen' });
    await setDoc(doc(db, `${DT}/k2`), { id: 'k2', name: 'Kitchen Layout', roomName: 'Kitchen' });
    await setDoc(doc(db, `${DT}/k3`), { id: 'k3', name: 'Kitchen Carpentry Details', roomName: 'Kitchen' });
    await setDoc(doc(db, `${DT}/l1`), { id: 'l1', name: 'Living Room Layout', roomName: 'Living Room' });
    await setDoc(doc(db, `${DT}/lp`), { id: 'lp', name: 'Furniture Layout', roomName: 'General / Project-Wide' });
    await setDoc(doc(db, `${DT}/d1`), { id: 'd1', name: 'Dining Crockery Unit', roomName: 'Dining' });
  });
  await makeUser('designer', 'riya@m.com', { tenantId: STUDIO, role: 'Designer', displayName: 'Riya' });
  await makeUser('head', 'mayuri@m.com', { tenantId: STUDIO, role: 'Design Head', displayName: 'Mayuri' });
  await makeUser('ops', 'neha@m.com', { tenantId: STUDIO, role: 'Ops Director', displayName: 'Neha' });
  await makeUser('client', 'mehta@gmail.com', { tenantId: STUDIO, role: 'Client', projectIds: ['p1'], displayName: 'Rahul Mehta' });
  await makeUser('stranger', 'shah@gmail.com', { tenantId: STUDIO, role: 'Client', projectIds: ['p2'], displayName: 'A Shah' });
  await new Promise((r) => setTimeout(r, 3000));
}, 120000);

afterAll(async () => {
  for (const a of apps) await deleteApp(a);
  await env.cleanup();
});

describe('a design meeting', { timeout: 60000 }, () => {
  let meetingId = '';
  let k1Version = '';

  it('only a room whose client sheets are all approved can be presented, and only by the Design Head or a lead', async () => {
    expect(await code(users.designer.meet({ action: 'start', rooms: ['Kitchen'] }))).toBe('functions/permission-denied');
    expect(await code(users.head.meet({ action: 'start', rooms: ['Kitchen'] }))).toBe('functions/failed-precondition');
    k1Version = (await approved('k1', 'k1')).versionId;
    await approved('k2', 'k2');
    expect(await code(users.head.meet({ action: 'start', rooms: ['Living Room'] }))).toBe('functions/failed-precondition');
  });

  it('starts on the exact versions approved, ignoring studio-only sheets, one open meeting at a time', async () => {
    const res = await users.head.meet({ action: 'start', rooms: ['Kitchen'], attendees: 'Rahul and Priya Mehta' });
    meetingId = res.meeting.id;
    expect(res.meeting.state).toBe('OPEN');
    expect(res.meeting.includedRounds).toBe(0);
    expect(res.meeting.rooms[0].sheets.map((s: any) => s.drawingId).sort()).toEqual(['k1', 'k2']);
    expect(res.meeting.rooms[0].sheets.find((s: any) => s.drawingId === 'k1').versionId).toBe(k1Version);
    expect(await code(users.head.meet({ action: 'start', rooms: ['Kitchen'] }))).toBe('functions/failed-precondition');
  });

  it('cannot be written or edited from a browser, even by the Design Head', async () => {
    const head = env.authenticatedContext(users.head.uid, { email: users.head.email }).firestore();
    await assertSucceeds(getDoc(doc(head, `${P}/designMeetings/${meetingId}`)));
    await assertFails(updateDoc(doc(head, `${P}/designMeetings/${meetingId}`), { state: 'CLOSED' }));
    await assertFails(setDoc(doc(head, `${P}/designMeetings/fake`), { state: 'CLOSED', rooms: [] }));
  });

  it('records changes pinned on the room\'s sheets, and refuses changes with nothing pinned', async () => {
    expect(await code(users.head.meet({ action: 'room', meetingId, room: 'Kitchen', outcome: 'changes', changes: [] }))).toBe('functions/invalid-argument');
    const res = await users.head.meet({ action: 'room', meetingId, room: 'Kitchen', outcome: 'changes', changes: [
      { drawingId: 'k1', page: 0, shape: { t: 'pin', x: 0.3, y: 0.4 }, text: 'Lighter shade on the upper shutters' },
      { drawingId: 'k1', page: 0, shape: { t: 'rect', x: 0.5, y: 0.5, w: 0.2, h: 0.1 }, text: 'Open shelf here instead' },
    ] });
    expect(res.meeting.rooms[0].changes).toHaveLength(2);
  });

  it('a round past the included ones must be billed or waived before the meeting closes', async () => {
    expect(await code(users.head.meet({ action: 'close', meetingId }))).toBe('functions/invalid-argument');
    expect(await code(users.head.meet({ action: 'close', meetingId, charges: { Kitchen: 'whatever' } }))).toBe('functions/invalid-argument');
  });

  it('closing turns the client\'s changes into notes for the Design Head, on the approved sheet', async () => {
    const res = await users.head.meet({ action: 'close', meetingId, charges: { Kitchen: 'to_bill' } });
    expect(res.meeting.state).toBe('CLOSED');
    const m = await read(`${P}/designMeetings/${meetingId}`);
    expect(m.rooms[0].round).toBe(1);
    expect(m.rooms[0].charge.status).toBe('to_bill');
    const k1 = await read(`${DT}/k1`);
    expect(k1.review.state).toBe('APPROVED');
    expect(k1.review.clientChanges).toMatchObject({ meetingId, count: 2, pending: true });
    expect(k1.review.marksOpen).toBe(2);
    const marks = await list(`${DT}/k1/reviewMarks`);
    expect(marks.every((x) => x.source === 'client' && x.meetingId === meetingId && x.versionId === k1Version)).toBe(true);
    const k2 = await read(`${DT}/k2`);
    expect(k2.review.clientChanges ?? null).toBeNull();
    expect((await list(`${DT}/k2/reviewEvents`)).some((e) => e.type === 'client')).toBe(true);
  });

  it('while they wait, the designer cannot upload over them, and the room cannot be presented again', async () => {
    expect(await code(users.designer.review({ drawingId: 'k1', action: 'check' }))).toBe('functions/failed-precondition');
    expect(await code(users.head.meet({ action: 'start', rooms: ['Kitchen'] }))).toBe('functions/failed-precondition');
  });

  it('the Design Head edits the client\'s notes and sends the sheet to the designer', async () => {
    const note = (await list(`${DT}/k1/reviewMarks`))[0];
    await users.head.review({ drawingId: 'k1', action: 'mark', op: 'update', markId: note.id, text: 'Upper shutters in the lighter oak', blocking: true });
    expect(await code(users.designer.review({ drawingId: 'k1', action: 'clientReturn', expectedRev: (await read(`${DT}/k1`)).review.rev }))).toBe('functions/permission-denied');
    const res = await users.head.review({ drawingId: 'k1', action: 'clientReturn', expectedRev: (await read(`${DT}/k1`)).review.rev });
    expect(res.review.state).toBe('CHANGES_REQUESTED');
    expect(res.review.clientChanges.pending).toBe(false);
    const ok = await users.designer.review({ drawingId: 'k1', action: 'mark', op: 'fix', markId: note.id });
    expect(ok.mark.status).toBe('FIXED');
  });

  it('billing: leads and Ops set the fee and mark it billed; a designer cannot', async () => {
    expect(await code(users.designer.meet({ action: 'charge', meetingId, room: 'Kitchen', fee: 1000 }))).toBe('functions/permission-denied');
    expect(await code(users.ops.meet({ action: 'charge', meetingId, room: 'Kitchen', status: 'billed' }))).toBe('functions/invalid-argument');
    const res = await users.ops.meet({ action: 'charge', meetingId, room: 'Kitchen', fee: 15000, status: 'billed', ref: 'INV-2026-041' });
    expect(res.meeting.rooms[0].charge).toMatchObject({ status: 'billed', fee: 15000, ref: 'INV-2026-041' });
  });

  it('keeping a sheet approved sets the client\'s notes aside and says so in the history', async () => {
    await approved('l1', 'l1');
    const start = await users.head.meet({ action: 'start', rooms: ['Living Room'] });
    await users.head.meet({ action: 'room', meetingId: start.meeting.id, room: 'Living Room', outcome: 'changes', changes: [{ drawingId: 'l1', page: 0, shape: { t: 'pin', x: 0.5, y: 0.5 }, text: 'Bigger sofa' }] });
    await users.head.meet({ action: 'close', meetingId: start.meeting.id, charges: { 'Living Room': 'waived' } });
    const before = await read(`${DT}/l1`);
    const res = await users.head.review({ drawingId: 'l1', action: 'clientKeep', expectedRev: before.review.rev, reason: 'Sofa size agreed on site' });
    expect(res.review.state).toBe('APPROVED');
    expect(res.review.clientChanges.pending).toBe(false);
    expect(res.review.marksOpen).toBe(0);
    expect(await list(`${DT}/l1/reviewMarks`)).toHaveLength(0);
    expect((await list(`${DT}/l1/reviewEvents`)).find((e) => e.type === 'clientKept').text).toMatch(/Bigger sofa/);
    expect((await read(`${P}/designMeetings/${start.meeting.id}`)).rooms[0].charge.status).toBe('waived');
  });

  it('an open meeting can be cancelled, and then the room can be presented again', async () => {
    const m = await users.head.meet({ action: 'start', rooms: ['Living Room'] });
    await users.head.meet({ action: 'cancel', meetingId: m.meeting.id });
    expect((await read(`${P}/designMeetings/${m.meeting.id}`)).state).toBe('CANCELLED');
    const again = await users.head.meet({ action: 'start', rooms: ['Living Room'] });
    expect(again.meeting.state).toBe('OPEN');
  });

  const SIGNATURE = `data:image/png;base64,${'iVBORw0KGgo'.padEnd(400, 'A')}`;

  it('a held meeting reaches the client\'s portal copy, room by room, without the billing', async () => {
    const view = await read('projects/p1/portalView/current');
    const mine = view.designRecord.find((m: any) => m.id === meetingId);
    expect(mine.rooms[0]).toMatchObject({ room: 'Kitchen', outcome: 'changes' });
    expect(mine.rooms[0].changes.length).toBeGreaterThan(0);
    expect(mine.confirmation).toBeNull();
    expect(JSON.stringify(view.designRecord)).not.toMatch(/charge|fee|pdfPath|INV-2026/);
  });

  it('the client confirms it in their portal: only their own project, with their name, once', async () => {
    expect(await code(users.stranger.act({ type: 'confirmMeeting', meetingId, name: 'A Shah' }))).toBe('functions/permission-denied');
    expect(await code(users.client.act({ type: 'confirmMeeting', meetingId, name: ' ' }))).toBe('functions/invalid-argument');
    expect(await code(users.client.act({ type: 'confirmMeeting', meetingId: 'nope', name: 'Rahul Mehta' }))).toBe('functions/not-found');
    const res = await users.client.act({ type: 'confirmMeeting', meetingId, name: 'Rahul Mehta' });
    expect(res.designRecord.find((m: any) => m.id === meetingId).confirmation).toMatchObject({ via: 'portal', name: 'Rahul Mehta' });
    const m = await read(`${P}/designMeetings/${meetingId}`);
    expect(m.confirmation).toMatchObject({ via: 'portal', name: 'Rahul Mehta', uid: users.client.uid, email: 'mehta@gmail.com' });
    expect((await read('projects/p1/portalView/current')).designRecord.find((x: any) => x.id === meetingId).confirmation.via).toBe('portal');
    expect(await code(users.client.act({ type: 'confirmMeeting', meetingId, name: 'Rahul Mehta' }))).toBe('functions/failed-precondition');
    expect(await code(users.head.meet({ action: 'sign', meetingId, name: 'Rahul Mehta', signature: SIGNATURE }))).toBe('functions/failed-precondition');
  });

  it('the studio can take the client\'s signature on screen instead', async () => {
    const held = (await list(`${P}/designMeetings`)).find((m) => m.state === 'CLOSED' && !m.confirmation);
    expect(held).toBeTruthy();
    expect(await code(users.designer.meet({ action: 'sign', meetingId: held.id, name: 'Rahul Mehta', signature: SIGNATURE }))).toBe('functions/permission-denied');
    expect(await code(users.head.meet({ action: 'sign', meetingId: held.id, name: 'Rahul Mehta', signature: 'data:image/png;base64,abc' }))).toBe('functions/invalid-argument');
    const res = await users.head.meet({ action: 'sign', meetingId: held.id, name: 'Rahul Mehta', signature: SIGNATURE });
    expect(res.meeting.confirmation).toMatchObject({ via: 'studio', name: 'Rahul Mehta', signature: SIGNATURE });
    const rec = (await read('projects/p1/portalView/current')).designRecord.find((m: any) => m.id === held.id);
    expect(rec.confirmation).toMatchObject({ via: 'studio', name: 'Rahul Mehta' });
    expect(JSON.stringify(rec)).not.toMatch(/base64/);
  });

  it('another client action keeps the design record in the client\'s copy', async () => {
    await users.client.act({ type: 'sendMessage', text: 'Thanks for the meeting' });
    expect((await read('projects/p1/portalView/current')).designRecord.length).toBeGreaterThan(0);
  });

  describe('the layout plan, and the drawings in the client\'s portal', () => {
    let held = '';
    it('the layout plan is an approved sheet; the rooms are marked once and travel with the meeting', async () => {
      for (const o of (await list(`${P}/designMeetings`)).filter((x) => x.state === 'OPEN')) await users.head.meet({ action: 'cancel', meetingId: o.id });
      await approved('lp', 'lp');
      await approved('d1', 'd1');
      expect(await code(users.designer.meet({ action: 'layoutRooms', drawingId: 'lp', rooms: {} }))).toBe('functions/permission-denied');
      await users.head.meet({ action: 'layoutRooms', drawingId: 'lp', rooms: { Dining: { page: 0, x: 0.6, y: 0.1, w: 0.3, h: 0.25 }, Bad: { x: 'no' } } });
      expect((await read(`${P}/designLayout/current`)).rooms).toEqual({ Dining: { page: 0, x: 0.6, y: 0.1, w: 0.3, h: 0.25 } });
      expect(await code(users.head.meet({ action: 'start', rooms: ['Dining'], layoutDrawingId: 'k3' }))).toBe('functions/failed-precondition');
      const start = await users.head.meet({ action: 'start', rooms: ['Dining'], layoutDrawingId: 'lp' });
      expect(start.meeting.layout).toMatchObject({ drawingId: 'lp', name: 'Furniture Layout', versionNo: 1, rooms: { Dining: { x: 0.6 } } });
      held = start.meeting.id;
      await users.head.meet({ action: 'room', meetingId: held, room: 'Dining', outcome: 'changes', changes: [{ drawingId: 'd1', page: 0, shape: { t: 'pin', x: 0.3, y: 0.4 }, text: 'Glass shutters' }] });
      await users.head.meet({ action: 'close', meetingId: held, charges: { Dining: 'waived' } });
      const head = env.authenticatedContext(users.head.uid).firestore();
      await assertFails(setDoc(doc(head, `${P}/designLayout/current`), { drawingId: 'lp', rooms: {} }));
    });

    it('the client\'s record carries the pins and where the room is, still without file paths', async () => {
      const rec = (await read('projects/p1/portalView/current')).designRecord.find((m: any) => m.id === held);
      expect(rec.layout).toEqual({ drawingId: 'lp', name: 'Furniture Layout', versionNo: 1 });
      expect(rec.rooms[0]).toMatchObject({ room: 'Dining', box: { x: 0.6 }, pins: [{ n: 1, drawingId: 'd1', page: 0, shape: { t: 'pin', x: 0.3, y: 0.4 } }] });
      expect(JSON.stringify(rec)).not.toMatch(/pdfPath|drawingReview\//);
    });

    it('only the project\'s client can open a meeting\'s drawings, and each opening is recorded', async () => {
      expect(await code(users.stranger.sheet({ meetingId: held, drawingId: 'd1' }))).toBe('functions/permission-denied');
      expect(await code(users.client.sheet({ meetingId: held, drawingId: 'k1' }))).toBe('functions/not-found');
      const res = await users.client.sheet({ meetingId: held, drawingId: 'd1' });
      expect(Buffer.from(res.data, 'base64').toString('latin1').startsWith('%PDF')).toBe(true);
      expect(res).toMatchObject({ name: 'Dining Crockery Unit', versionNo: 1 });
      expect(res.views).toHaveLength(1);
      const plan = await users.client.sheet({ meetingId: held, drawingId: 'lp' });
      expect(plan.name).toBe('Furniture Layout');
      expect(plan.views).toHaveLength(1);
      expect((await read(`${P}/designMeetings/${held}`)).views).toEqual([expect.objectContaining({ uid: users.client.uid })]);
    });
  });
});
