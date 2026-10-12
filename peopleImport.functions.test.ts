/*
  The People Hub import on the server, in the local emulators: only those
  who run People may import; every record is checked; StudioDesk's own days
  and changes win; sending twice does nothing twice; undo removes only what
  nobody has touched; and the monthly report can reach an imported month.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore,auth --project demo-pi "npx vitest run peopleImport.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { DEFAULT_POLICY, businessDate, peopleOf, policyOf } from './lib/peopleDesk';
import { newBatchId, planImport, stamp, type Workbook } from './lib/peopleImport';

const PROJECT = 'demo-pi';
const STUDIO = 'studio_i';
let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
const call: Record<string, { imp: (d: any) => Promise<any>; snap: (d?: any) => Promise<any>; cmd: (c: any) => Promise<any> }> = {};
const code = async (p: Promise<any>) => { try { await p; return 'ok'; } catch (e: any) { return String(e.code || e.message); } };
const ORG = {
  orgName: 'Studio I',
  team: [
    { id: 'tm-anish', name: 'Anish', email: 'anish@i.in', role: 'Owner' },
    { id: 'tm-mayuri', name: 'Mayuri', email: 'mayuri@i.in', role: 'Design Head' },
    { id: 'tm-tanvi', name: 'Tanvi', email: 'tanvi@i.in', role: 'Designer' },
  ],
  peopleDesk: { policy: { requireLocation: false }, members: { 'tm-tanvi': { managerId: 'tm-mayuri' } } },
};
const today = businessDate(new Date());

async function makeUser(key: string, email: string, profile: any) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, key);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const cred = await createUserWithEmailAndPassword(auth, email, 'password-123');
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `users/${cred.user.uid}`), { email, ...profile }); });
  const imp = httpsCallable(fns, 'peopleImport', { timeout: 60000 });
  const snap = httpsCallable(fns, 'peopleSnapshot', { timeout: 60000 });
  const cmd = httpsCallable(fns, 'peopleCommand', { timeout: 60000 });
  call[key] = {
    imp: async (d) => (await imp(d)).data,
    snap: async (d = {}) => ((await snap(d)).data as any).snapshot,
    cmd: async (command) => (await cmd({ command })).data,
  };
}

const book = (): Workbook => ({
  Team: [['Name', 'Email', 'Role', 'Squad', 'Active', 'isAdmin'], ['Tanvi', 'tanvi@i.in', 'Designer', 'Design', 'Y', 'N']],
  Attendance: [
    ['Date', 'Email', 'Name', 'Mode', 'CheckIn', 'CheckOut', 'Late', 'Notes', 'Hours'],
    ['2026-03-10', 'tanvi@i.in', 'Tanvi', 'Office', '10:30', '18:30', 'N', '', 8],
    ['2026-03-11', 'tanvi@i.in', 'Tanvi', 'WFH', '10:40', '', 'N', '', ''],
    [today, 'tanvi@i.in', 'Tanvi', 'Office', '09:00', '', 'N', '', ''],
  ],
  Leaves: [
    ['CreatedAt', 'ReqID', 'Name', 'Start', 'End', 'Type', 'Half', 'Reason', 'Status', 'ApprovedBy', 'ApprovedAt'],
    [new Date().toISOString(), 'R1', 'Tanvi', '2026-03-12', '2026-03-12', 'PL', 'N', 'Family', 'approved', 'mayuri@i.in', new Date().toISOString()],
  ],
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `organizations/${STUDIO}`), ORG); });
  await makeUser('anish', 'anish@i.in', { tenantId: STUDIO, role: 'Owner' });
  await makeUser('tanvi', 'tanvi@i.in', { tenantId: STUDIO, role: 'Designer' });
  /* An Admin account whose Team & roles entry says only Design Head. */
  await makeUser('mayuri', 'mayuri@i.in', { tenantId: STUDIO, role: 'Admin' });
}, 120000);
afterAll(async () => { await Promise.all(apps.map((a) => deleteApp(a))); await env.cleanup(); });

describe('People Hub import', () => {
  const people = peopleOf(ORG);
  const policy = { ...policyOf(ORG), timezone: DEFAULT_POLICY.timezone };
  const batch = newBatchId();
  const plan = planImport(book(), people, policy, {}, batch);
  const { attendance, requests } = stamp(plan, batch);

  it('is for those who run People only', async () => {
    expect(await code(call.tanvi.imp({ action: 'begin', batch }))).toBe('functions/permission-denied');
    expect(await code(call.tanvi.imp({ action: 'list' }))).toBe('functions/permission-denied');
    /* Their account's own role counts, not only the role on Team & roles. */
    expect(await code(call.mayuri.imp({ action: 'list' }))).toBe('ok');
    expect((await call.mayuri.snap()).me.accessRole).toBe('admin');
  }, 30000);

  it('saves checked records; StudioDesk\'s own day wins; sending twice does nothing twice', async () => {
    /* Tanvi checked in today on StudioDesk; the workbook also has today. */
    await call.tanvi.cmd({ id: `cmd_${Date.now()}_live`, action: 'checkin', data: { mode: 'WFH' } });
    expect((await call.anish.imp({ action: 'begin', batch, meta: { fileName: 'People Hub.xlsx', counts: { attendanceRows: 3 } } })).ok).toBe(true);
    expect((await call.anish.imp({ action: 'archive', batch, tab: 'Attendance', part: 0, rows: JSON.stringify(book().Attendance) })).ok).toBe(true);
    const first = await call.anish.imp({ action: 'records', batch, attendance, requests });
    expect(first.written).toBe(3);
    expect(first.skipped).toEqual([{ id: `ph_at_tm-tanvi_${today}`, why: 'Already checked in on StudioDesk that day' }]);
    const again = await call.anish.imp({ action: 'records', batch, attendance, requests });
    expect(again.written).toBe(3);
    const done = await call.anish.imp({ action: 'finish', batch });
    expect(done.import).toMatchObject({ status: 'done', fileName: 'People Hub.xlsx', written: 6, by: 'tm-anish' });
    const listed = await call.anish.imp({ action: 'list' });
    expect(listed.imports[0].id).toBe(batch);
  });

  it('refuses a record an import would not make', async () => {
    const b2 = newBatchId();
    await call.anish.imp({ action: 'begin', batch: b2 });
    const forged = { ...JSON.parse(JSON.stringify(attendance[0])), checkInLocation: { lat: 1, lng: 1 } };
    expect(await code(call.anish.imp({ action: 'records', batch: b2, attendance: [forged] }))).toBe('functions/invalid-argument');
    expect(await code(call.anish.imp({ action: 'records', batch: 'bad', attendance: [] }))).toBe('functions/invalid-argument');
  });

  it('shows imported leave in balances, and an imported month to the report', async () => {
    const tanvi = await call.tanvi.snap();
    expect(tanvi.requests.map((r: any) => r.id)).toContain('ph_rq_R1');
    expect(tanvi.balances['2025'].PL.used).toBe(1);
    expect(tanvi.attendance.some((a: any) => a.date === '2026-03-10')).toBe(false);
    const march = await call.tanvi.snap({ month: '2026-03' });
    expect(march.attendance.filter((a: any) => a.date.startsWith('2026-03')).map((a: any) => a.date).sort()).toEqual(['2026-03-10', '2026-03-11']);
    /* The day with no check-out is history: Tanvi's own check-in today went through above. */
    expect(march.attendance.find((a: any) => a.date === '2026-03-11').imported.flags).toContain('No check-out was recorded');
  });

  it('undo removes what nobody touched, and keeps what changed', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `peopleDesk/${STUDIO}/attendance/ph_at_tm-tanvi_2026-03-10`), { version: 2 });
    });
    const r = await call.anish.imp({ action: 'undo', batch });
    expect([r.removed, r.kept]).toEqual([2, 1]);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      expect((await getDoc(doc(fs, `peopleDesk/${STUDIO}/attendance/ph_at_tm-tanvi_2026-03-10`))).exists()).toBe(true);
      expect((await getDoc(doc(fs, `peopleDesk/${STUDIO}/attendance/ph_at_tm-tanvi_2026-03-11`))).exists()).toBe(false);
      expect((await getDoc(doc(fs, `peopleDesk/${STUDIO}/requests/ph_rq_R1`))).exists()).toBe(false);
      expect((await getDoc(doc(fs, `peopleDesk/${STUDIO}/imports/${batch}`))).data()).toMatchObject({ status: 'undone', removed: 2, kept: 1 });
    });
    /* A closed import takes no more records. */
    expect(await code(call.anish.imp({ action: 'records', batch, attendance: [], requests: [] }))).toBe('functions/failed-precondition');
  });
});
