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
type User = { uid: string; email: string; review: (data: any) => Promise<any>; meet: (data: any) => Promise<any>; upload: (path: string, bytes: Uint8Array) => Promise<void> };
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
  users[key] = {
    uid: cred.user.uid, email,
    review: async (data) => (await review({ orgId: STUDIO, projectId: 'p1', ...data })).data,
    meet: async (data) => (await meet({ orgId: STUDIO, projectId: 'p1', ...data })).data,
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
    await setDoc(doc(db, `${DT}/k1`), { id: 'k1', name: 'Kitchen Elevation A', roomName: 'Kitchen' });
    await setDoc(doc(db, `${DT}/k2`), { id: 'k2', name: 'Kitchen Layout', roomName: 'Kitchen' });
    await setDoc(doc(db, `${DT}/k3`), { id: 'k3', name: 'Kitchen Carpentry Details', roomName: 'Kitchen' });
    await setDoc(doc(db, `${DT}/l1`), { id: 'l1', name: 'Living Room Layout', roomName: 'Living Room' });
  });
  await makeUser('designer', 'riya@m.com', { tenantId: STUDIO, role: 'Designer', displayName: 'Riya' });
  await makeUser('head', 'mayuri@m.com', { tenantId: STUDIO, role: 'Design Head', displayName: 'Mayuri' });
  await makeUser('ops', 'neha@m.com', { tenantId: STUDIO, role: 'Ops Director', displayName: 'Neha' });
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
});
