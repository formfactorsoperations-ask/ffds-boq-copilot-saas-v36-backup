/*
  People on the server, in the local emulators: check-in with a location,
  leave decided by the right people only, retries that do nothing twice, and
  what each person may see.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore,auth --project demo-pd "npx vitest run peopleDesk.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';

const PROJECT = 'demo-pd';
const STUDIO = 'studio_p';
const OFFICE = { lat: 19.2183, lng: 72.9781, radiusM: 150 };
const NEAR = { lat: 19.2185, lng: 72.9782, accuracyM: 20 };
let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
type U = { fs: any; snap: () => Promise<any>; cmd: (c: any) => Promise<any> };
const u: Record<string, U> = {};

async function makeUser(key: string, email: string, profile: any) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, key);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const fs = getFirestore(app);
  connectFirestoreEmulator(fs, '127.0.0.1', 8080);
  const cred = await createUserWithEmailAndPassword(auth, email, 'password-123');
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `users/${cred.user.uid}`), { email, ...profile }); });
  const snap = httpsCallable(fns, 'peopleSnapshot', { timeout: 60000 });
  const cmd = httpsCallable(fns, 'peopleCommand', { timeout: 60000 });
  u[key] = { fs, snap: async () => ((await snap({})).data as any).snapshot, cmd: async (command) => (await cmd({ command })).data };
}
const code = async (p: Promise<any>) => { try { await p; return 'ok'; } catch (e: any) { return String(e.code || e.message); } };
let n = 0;
const cid = () => `cmd_${Date.now()}_${++n}`;
/* A working Tuesday in the next financial year, well clear of weekly offs and today. */
const DAY = '2027-01-12';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `organizations/${STUDIO}`), {
      orgName: 'Studio P',
      team: [
        { id: 'tm-anish', name: 'Anish', email: 'anish@p.in', role: 'Owner' },
        { id: 'tm-mayuri', name: 'Mayuri', email: 'mayuri@p.in', role: 'Design Head', roles: ['Admin'] },
        { id: 'tm-tanvi', name: 'Tanvi', email: 'tanvi@p.in', role: 'Designer' },
        { id: 'tm-riya', name: 'Riya', email: 'riya@p.in', role: 'Client Relations' },
        { id: 'tm-client', name: 'Mrs Kapoor', email: 'kapoor@x.in', role: 'Client' },
      ],
      peopleDesk: {
        policy: { office: OFFICE, requireLocation: true },
        members: { 'tm-tanvi': { managerId: 'tm-mayuri' }, 'tm-riya': { managerId: 'tm-anish' } },
      },
    });
  });
  await makeUser('anish', 'anish@p.in', { tenantId: STUDIO, role: 'Owner' });
  await makeUser('mayuri', 'mayuri@p.in', { tenantId: STUDIO, role: 'Admin' });
  await makeUser('tanvi', 'tanvi@p.in', { tenantId: STUDIO, role: 'Designer' });
  await makeUser('riya', 'riya@p.in', { tenantId: STUDIO, role: 'Client Relations' });
  await makeUser('client', 'kapoor@x.in', { tenantId: STUDIO, role: 'Client' });
}, 120000);
afterAll(async () => { await Promise.all(apps.map((a) => deleteApp(a))); await env.cleanup(); });

describe('attendance', () => {
  it('checks in once a day at the office, with where, timed by the server', async () => {
    expect(await code(u.tanvi.cmd({ id: cid(), action: 'checkin', data: { mode: 'Office' } }))).toBe('functions/invalid-argument');
    const id = cid();
    const res = await u.tanvi.cmd({ id, action: 'checkin', data: { mode: 'Office', location: NEAR } });
    const s = res.snapshot.attendance.find((a: any) => a.employeeId === 'tm-tanvi');
    expect(s.checkInLocation).toMatchObject({ atOffice: true });
    expect(Math.abs(Date.parse(s.checkIn) - Date.now())).toBeLessThan(60000);
    const again = await u.tanvi.cmd({ id, action: 'checkin', data: { mode: 'Office', location: NEAR } });
    expect(again.replay).toBe(true);
    expect(again.snapshot.attendance.filter((a: any) => a.employeeId === 'tm-tanvi')).toHaveLength(1);
    expect(await code(u.tanvi.cmd({ id: cid(), action: 'checkin', data: { mode: 'Office', location: NEAR } }))).toBe('functions/failed-precondition');
  }, 60000);

  it('checks out the open session', async () => {
    const mine = (await u.tanvi.snap()).attendance.find((a: any) => a.employeeId === 'tm-tanvi');
    await new Promise((r) => setTimeout(r, 1100));
    const res = await u.tanvi.cmd({ id: cid(), action: 'checkout', data: { sessionId: mine.id, version: mine.version } });
    expect(res.snapshot.attendance.find((a: any) => a.id === mine.id).checkOut).toBeTruthy();
  }, 60000);
});

describe('leave', () => {
  let rid = '';
  it('is requested, reserving balance', async () => {
    const res = await u.tanvi.cmd({ id: cid(), action: 'request', data: { type: 'PL', start: DAY, end: DAY, portion: 'Full day', reason: 'Family function' } });
    const r = res.snapshot.requests.find((x: any) => x.employeeId === 'tm-tanvi' && x.kind === 'leave');
    rid = r.id;
    expect(r.status).toBe('Pending');
    expect(res.snapshot.balances['2026'].PL).toMatchObject({ reserved: 1, available: 11 });
  }, 60000);

  it('is decided by her manager or an admin, never by herself or a colleague', async () => {
    expect(await code(u.tanvi.cmd({ id: cid(), action: 'decide', data: { requestId: rid, version: 1, decision: 'approve' } }))).toBe('functions/permission-denied');
    expect(await code(u.riya.cmd({ id: cid(), action: 'decide', data: { requestId: rid, version: 1, decision: 'approve' } }))).toBe('functions/permission-denied');
    const ok = await u.mayuri.cmd({ id: cid(), action: 'decide', data: { requestId: rid, version: 1, decision: 'approve' } });
    expect(ok.snapshot.requests.find((x: any) => x.id === rid).status).toBe('Approved');
    expect(await code(u.anish.cmd({ id: cid(), action: 'decide', data: { requestId: rid, version: 1, decision: 'reject', note: 'clash' } }))).toBe('functions/failed-precondition');
    expect((await u.tanvi.snap()).balances['2026'].PL).toMatchObject({ used: 1, available: 11 });
  }, 60000);

  it('shows a colleague only availability, never the reason or the attendance', async () => {
    const riya = await u.riya.snap();
    expect(riya.requests.some((x: any) => x.employeeId === 'tm-tanvi')).toBe(false);
    expect(riya.attendance.some((x: any) => x.employeeId === 'tm-tanvi')).toBe(false);
    expect(riya.availability.find((x: any) => x.employeeId === 'tm-tanvi')).toMatchObject({ start: DAY, mode: 'Away' });
    expect(JSON.stringify(riya)).not.toContain('Family function');
    expect(JSON.stringify(riya)).not.toContain('@p.in');
    const mayuri = await u.mayuri.snap();
    expect(mayuri.requests.find((x: any) => x.id === rid).reason).toBe('Family function');
    expect(mayuri.attendance.find((x: any) => x.employeeId === 'tm-tanvi').checkInLocation).toBeTruthy();
  }, 60000);
});

describe('access', () => {
  it('turns away a client, and anyone reading or writing the records directly', async () => {
    expect(await code(u.client.snap())).toBe('functions/permission-denied');
    expect(await code(getDoc(doc(u.tanvi.fs, `peopleDesk/${STUDIO}/members/tm-tanvi`)))).toBe('permission-denied');
    expect(await code(setDoc(doc(u.anish.fs, `peopleDesk/${STUDIO}/attendance/x`), { employeeId: 'tm-tanvi' }))).toBe('permission-denied');
  }, 60000);

  it('lets only a lead change the People settings', async () => {
    expect(await code(updateDoc(doc(u.tanvi.fs, `organizations/${STUDIO}`), { 'peopleDesk.members.tm-tanvi.excluded': true }))).toBe('permission-denied');
    expect(await code(updateDoc(doc(u.mayuri.fs, `organizations/${STUDIO}`), { 'peopleDesk.policy.lateAfter': '11:15' }))).toBe('ok');
  }, 60000);
});
