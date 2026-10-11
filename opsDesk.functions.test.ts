/*
  The Ops Desk's server side in the local emulators: an escalation emails the
  studio's leads, and the daily check raises one by itself. Without a Resend
  key the email is recorded as simulated, which is what is checked here.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore,auth --project demo-od "npx vitest run opsDesk.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc } from 'firebase/firestore';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { getDoc } from 'firebase/firestore';

const PROJECT = 'demo-od';
const STUDIO = 'studio_o';
const DAY = 86400000;
let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
const users: Record<string, { fs: any; check: () => Promise<any> }> = {};

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
  const check = httpsCallable(fns, 'opsDeskCheckNow', { timeout: 60000 });
  users[key] = { fs, check: async () => (await check({})).data };
}

const read = async (path: string) => { let out: any; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDoc(doc(ctx.firestore(), path))).data(); }); return out; };
async function waitFor<T>(fn: () => Promise<T | undefined | null>, ms = 30000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 500));
  }
}
const code = async (p: Promise<any>) => { try { await p; return 'ok'; } catch (e: any) { return String(e.code || e.message); } };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${STUDIO}`), {
      orgName: 'Studio O',
      projectDesigners: { p1: ['riya@o.in'] },
      team: [{ email: 'anish@o.in', role: 'Owner' }, { email: 'mayuri@o.in', role: 'Design Head', roles: ['Admin'] }, { email: 'riya@o.in', role: 'Client Relations' }],
    });
    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO, context: { name: 'Kapoor Villa' } });
    await setDoc(doc(db, 'projects/p1/teamView/ops'), { tenantId: STUDIO, kind: 'ops', members: ['riya@o.in'], compressedData: 'x' });
    const now = Date.now();
    const line = (at: number, outcome: string) => ({
      tenantId: STUDIO, projectId: 'p1', projectName: 'Kapoor Villa', at, by: 'riya@o.in', byName: 'Riya', channel: 'call', note: '',
      subject: { kind: 'payment', key: 'pay:m2', label: 'Carpentry stage' }, outcome, next: null, nextDone: false, manual: true,
    });
    await setDoc(doc(db, 'projects/p1/followUps/a'), line(now - 9 * DAY, 'reminded'));
    await setDoc(doc(db, 'projects/p1/followUps/b'), line(now - 3 * DAY, 'no_answer'));
  });
  await makeUser('riya', 'riya@o.in', { tenantId: STUDIO, role: 'Client Relations' });
  await makeUser('anish', 'anish@o.in', { tenantId: STUDIO, role: 'Owner' });
}, 120000);

afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env?.cleanup();
});

describe('escalations', () => {
  it('raised by Client Relations reach the Owners and Admins, and their decision comes back', async () => {
    await setDoc(doc(users.riya.fs, 'projects/p1/escalations/e1'), {
      tenantId: STUDIO, projectId: 'p1', projectName: 'Kapoor Villa', title: 'Extra wardrobe asked for', detail: 'Client wants a quote',
      category: 'scope', subjectKey: null, raisedBy: 'riya@o.in', raisedByName: 'Riya', raisedAt: Date.now(), auto: false, status: 'open',
    });
    const e = await waitFor(async () => { const d = await read('projects/p1/escalations/e1'); return d?.notifiedAt ? d : null; });
    expect(e.notifiedTo).toEqual(['anish@o.in', 'mayuri@o.in']);
    expect(e.notifySandbox).toBe(true);
    expect(await code(updateDoc(doc(users.anish.fs, 'projects/p1/escalations/e1'), { status: 'decided', decision: 'Send a revised quote', decidedBy: 'anish@o.in', decidedByName: 'Anish', decidedAt: Date.now() }))).toBe('ok');
    expect(await code(updateDoc(doc(users.riya.fs, 'projects/p1/escalations/e1'), { status: 'closed', closedAt: Date.now() }))).toBe('ok');
    expect((await read('projects/p1/escalations/e1')).status).toBe('closed');
  }, 60000);
});

describe('the daily check', () => {
  it('raises an escalation for a payment unanswered for a week, once, and only a lead may run it', async () => {
    expect(await code(users.riya.check())).toBe('functions/permission-denied');
    expect(await users.anish.check()).toEqual({ raised: 1 });
    expect(await users.anish.check()).toEqual({ raised: 0 });
    const ids = await new Promise<any[]>((res) => env.withSecurityRulesDisabled(async (ctx) => {
      const { getDocs, collection } = await import('firebase/firestore');
      res((await getDocs(collection(ctx.firestore(), 'projects/p1/escalations'))).docs.map((d) => ({ id: d.id, ...d.data() })));
    }));
    const auto = ids.find((d) => d.auto);
    expect(auto).toMatchObject({ status: 'open', subjectKey: 'pay:m2', category: 'payment', raisedByName: 'The daily check' });
    expect(auto.detail).toMatch(/2 reminders over 9 days/);
    await waitFor(async () => (await read(`projects/p1/escalations/${auto.id}`))?.notifiedAt);
  }, 60000);
});
