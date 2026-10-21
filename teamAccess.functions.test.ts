/*
  The limited roles' copies and the Site Supervisor's actions, end to end, in
  the local emulators. A throwaway "demo-" project; nothing touches the live studio.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore,auth --project demo-ta "npx vitest run teamAccess.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import * as pako from 'pako';

const PROJECT = 'demo-ta';
const STUDIO = 'studio_t';
let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
type User = { uid: string; site: (projectId: string, action: any) => Promise<any>; clientLogin: (data: any) => Promise<any> };
const users: Record<string, User> = {};

async function makeUser(key: string, email: string, profile: any) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, key);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const cred = await createUserWithEmailAndPassword(auth, email, 'password-123');
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `users/${cred.user.uid}`), { email, ...profile }); });
  const site = httpsCallable(fns, 'siteAction', { timeout: 60000 });
  const login = httpsCallable(fns, 'createClientLogin', { timeout: 60000 });
  users[key] = {
    uid: cred.user.uid,
    site: async (projectId, action) => (await site({ projectId, action })).data,
    clientLogin: async (data) => (await login({ tenantId: STUDIO, ...data })).data,
  };
}

const code = async (p: Promise<any>) => { try { await p; return 'ok'; } catch (e: any) { return String(e.code || e.message); } };
const read = async (path: string) => { let out: any; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDoc(doc(ctx.firestore(), path))).data(); }); return out; };
const inflate = (b64: string) => JSON.parse(new TextDecoder().decode(pako.inflate(Uint8Array.from(Buffer.from(b64, 'base64')))));

/* The copies are made by a trigger, so wait for them. */
async function waitFor<T>(fn: () => Promise<T | undefined | null>, ms = 30000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 500));
  }
}

const project = (name: string, supervisors: string[]) => ({
  tenantId: STUDIO,
  activeTierId: 't1',
  tiers: [{ id: 't1', name: 'v1', summary: { totalSell: 1000000, designFee: 100000 }, boq: [{ id: 'l1', qty: 2, baseRate: 900 }] }],
  context: {
    name, clientName: 'Mrs Kapoor', status: 'execution', assignedSupervisors: supervisors,
    financials: { approvedExecutionValue: 1000000, billablePercent: 60, discounts: [] },
    paymentMilestones: [{ id: 'e1', type: 'execution', name: 'Carpentry stage', percentage: 40, status: 'invoiced', invoiceNumber: 'FF-114' }],
  },
  activeProject: {
    tierId: 't1', status: 'active', budget: 640000,
    executionData: {
      bundles: [{ id: 'b1', name: 'Kitchen', status: 'active', completionPercentage: 40, cost: 180000 }],
      sofItems: [], blockers: [], updates: [], actions: [], decisions: [], procurement: [{ rate: 72 }],
    },
  },
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${STUDIO}`), {
      orgName: 'Studio T',
      team: [{ id: 'm7', email: 'sup@t.com', role: 'Site Supervisor' }, { id: 'm8', email: 'cr@t.com', role: 'Client Relations' }],
      projectDesigners: { p1: ['cr@t.com'] },
    });
  });
  await makeUser('admin', 'admin@t.com', { tenantId: STUDIO, role: 'Admin' });
  await makeUser('head', 'head@t.com', { tenantId: STUDIO, role: 'Design Head' });
  await makeUser('designer', 'des@t.com', { tenantId: STUDIO, role: 'Designer' });
  await makeUser('sup', 'sup@t.com', { tenantId: STUDIO, role: 'Site Supervisor', displayName: 'Suresh' });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'projects/p1'), project('Kapoor Villa', ['m7']));
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1`), project('Kapoor Villa', ['m7']));
    await setDoc(doc(db, 'projects/p2'), project('Shah Apartment', []));
  });
}, 120000);

afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env?.cleanup();
});

describe('the copies the server makes', () => {
  it('gives Client Relations the payment milestones without amounts, and no costs', async () => {
    const ops = await waitFor(() => read('projects/p1/teamView/ops'));
    expect(ops.members).toEqual(['cr@t.com']);
    const view = inflate(ops.compressedData);
    expect(view.clientMoney.milestones[0]).toMatchObject({ id: 'e1', status: 'invoiced', invoiceNumber: 'FF-114' });
    expect(view.clientMoney.milestones[0].owed).toBeNull();
    expect(view.clientMoney.balanceDue).toBeNull();
    const json = JSON.stringify(view);
    for (const w of ['baseRate', 'billablePercent', 'procurement', 'budget']) expect(json, w).not.toContain(w);
  }, 60000);

  it('gives the Site Supervisor the site work and no money', async () => {
    const site = await waitFor(() => read('projects/p1/teamView/site'));
    expect(site.members.sort()).toEqual(['cr@t.com', 'sup@t.com']);
    const view = inflate(site.compressedData);
    expect(view.activeProject.executionData.bundles[0]).toMatchObject({ id: 'b1', completionPercentage: 40 });
    const json = JSON.stringify(view);
    for (const w of ['cost', 'clientMoney', 'paymentMilestones', 'budget', 'procurement']) expect(json, w).not.toContain(w);
  }, 60000);
});

describe("a Site Supervisor's actions", () => {
  it('are applied to the stored project, both copies', async () => {
    expect(await users.sup.site('p1', { type: 'bundle', bundleId: 'b1', status: 'completed', completionPercentage: 100 })).toEqual({ ok: true });
    expect(await users.sup.site('p1', { type: 'update', text: 'Carcass fixed' })).toEqual({ ok: true });
    const p = await read('projects/p1');
    expect(p.activeProject.executionData.bundles[0]).toMatchObject({ status: 'completed', completionPercentage: 100, cost: 180000 });
    expect(p.activeProject.executionData.updates[0]).toMatchObject({ text: 'Carcass fixed', author: 'Suresh' });
    expect(p.activeProject.budget).toBe(640000);
    const org = await read(`organizations/${STUDIO}/projects/p1`);
    expect(org.activeProject.executionData.updates[0].text).toBe('Carcass fixed');
  }, 60000);

  it('are refused on a site they are not assigned to, for other roles, and when they are not site actions', async () => {
    await waitFor(() => read('projects/p2/teamView/site'));
    expect(await code(users.sup.site('p2', { type: 'update', text: 'x' }))).toBe('functions/permission-denied');
    expect(await code(users.head.site('p1', { type: 'update', text: 'x' }))).toBe('functions/permission-denied');
    expect(await code(users.designer.site('p1', { type: 'update', text: 'x' }))).toBe('functions/permission-denied');
    expect(await code(users.sup.site('p1', { type: 'setBudget', value: 1 }))).toBe('functions/invalid-argument');
    expect(await code(users.admin.site('p1', { type: 'blocker', text: 'Tiles pending' }))).toBe('ok');
  }, 60000);
});

describe('client logins', () => {
  it('are issued by the leads only', async () => {
    expect(await code(users.designer.clientLogin({ email: 'c1@x.com', projectId: 'p1' }))).toBe('functions/permission-denied');
    expect(await code(users.head.clientLogin({ email: 'c1@x.com', projectId: 'p1' }))).toBe('functions/permission-denied');
    expect(await code(users.sup.clientLogin({ email: 'c1@x.com', projectId: 'p1' }))).toBe('functions/permission-denied');
    expect(await code(users.admin.clientLogin({ email: 'c1@x.com', projectId: 'p1', clientName: 'C' }))).toBe('ok');
  }, 60000);
});
