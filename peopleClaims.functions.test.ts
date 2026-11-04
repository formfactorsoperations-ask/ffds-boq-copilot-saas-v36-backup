/*
  People's travel claims on the server, in the local emulators: a designer
  logs a trip (with a receipt), the founders hear of it, approve it or turn it
  down, and mark it paid back; nobody else decides, and nothing is read from
  the browser.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore,auth --project demo-pc "npx vitest run peopleClaims.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';

const PROJECT = 'demo-pc';
const STUDIO = 'studio_c';
let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
type U = { fs: any; view: () => Promise<any>; run: (action: string, data: any) => Promise<any> };
const u: Record<string, U> = {};

async function makeUser(key: string, email: string, profile: any) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, key);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const fns = getFunctions(app, 'asia-south1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const fs = getFirestore(app);
  connectFirestoreEmulator(fs, '127.0.0.1', 8080);
  const cred = await createUserWithEmailAndPassword(auth, email, 'password-123');
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `users/${cred.user.uid}`), { email, ...profile }); });
  const view = httpsCallable(fns, 'peopleClaims', { timeout: 60000 });
  const run = httpsCallable(fns, 'peopleClaimsCommand', { timeout: 60000 });
  u[key] = { fs, view: async () => ((await view({})).data as any).view, run: async (action, data) => (await run({ action, data: { id: cid(), ...data } })).data };
}
const code = async (p: Promise<any>) => { try { await p; return 'ok'; } catch (e: any) { return String(e.code || e.message); } };
let n = 0;
const cid = () => `c${Date.now()}${++n}`;
const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const trip = (over: any = {}) => ({ date: today, purpose: 'Site visit', place: 'Bandra site', from: 'Office', to: 'Bandra', mode: 'bike', km: 12, roundTrip: true, amount: 96, ...over });
const notesOf = async (email: string, kind: string) => {
  let list: any[] = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    list = (await getDocs(collection(ctx.firestore(), `inbox/${email}/notes`))).docs.map((d) => d.data()).filter((x: any) => x.kind === kind);
  });
  return list;
};
/* A tiny PNG, as a receipt. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `organizations/${STUDIO}`), {
      orgName: 'Studio C',
      team: [
        { id: 'tm-anish', name: 'Anish', email: 'anish@c.in', role: 'Owner' },
        { id: 'tm-meera', name: 'Meera', email: 'meera@c.in', role: 'Admin' },
        { id: 'tm-tanvi', name: 'Tanvi Rao', email: 'tanvi@c.in', role: 'Designer' },
      ],
      peopleDesk: { policy: { requireLocation: false } },
    });
  });
  await makeUser('anish', 'anish@c.in', { tenantId: STUDIO, role: 'Owner' });
  await makeUser('meera', 'meera@c.in', { tenantId: STUDIO, role: 'Admin' });
  await makeUser('tanvi', 'tanvi@c.in', { tenantId: STUDIO, role: 'Designer' });
}, 120000);
afterAll(async () => { await Promise.all(apps.map((a) => deleteApp(a))); await env.cleanup(); });

describe('travel claims', () => {
  let first = '';
  it('a designer logs a trip with a receipt, once; its km are kept at the studio rate, and the founders are asked', async () => {
    const same = cid();
    const r = await u.tanvi.run('log', { ...trip({ rate: 99 }), id: same, receipt: { type: 'image/png', data: PNG } });
    first = r.id;
    expect(r.view.mine[0]).toMatchObject({ amount: 96, rate: 4, status: 'Pending', receipt: true, personId: 'tm-tanvi' });
    expect(r.view.founder).toBe(false);
    expect(r.view.all).toEqual([]);
    await u.tanvi.run('log', { ...trip(), id: same });
    expect((await u.tanvi.view()).mine).toHaveLength(1);
    await new Promise((x) => setTimeout(x, 800));
    expect((await notesOf('anish@c.in', 'claims.logged')).map((x) => [x.title, x.level, x.section])).toEqual([['Tanvi Rao logged a trip: ₹96', 'needs', 'travel']]);
    expect(await notesOf('meera@c.in', 'claims.logged')).toHaveLength(1);
  }, 60000);

  it('only the founders decide, and a refusal needs a reason', async () => {
    expect(await code(u.tanvi.run('decide', { claimIds: [first], decision: 'approve' }))).toMatch(/permission-denied/);
    expect(await code(u.anish.run('decide', { claimIds: [first], decision: 'reject', note: '' }))).toMatch(/invalid-argument/);
    const v = await u.anish.view();
    expect(v.toDecide.map((c: any) => c.id)).toEqual([first]);
    const r = await u.anish.run('decide', { claimIds: [first], decision: 'approve' });
    expect(r.view.toPay.map((c: any) => c.id)).toEqual([first]);
    /* Sent again after a dropped connection: nothing changes. */
    await u.anish.run('decide', { claimIds: [first], decision: 'approve' });
    expect(await code(u.meera.run('decide', { claimIds: [first], decision: 'reject', note: 'Personal trip' }))).toMatch(/failed-precondition/);
    await new Promise((x) => setTimeout(x, 800));
    expect((await notesOf('tanvi@c.in', 'claims.decided')).map((x) => x.title)).toEqual(['Your trip claim of ₹96 was approved']);
  }, 60000);

  it('a founder’s own trip goes to the other founder', async () => {
    const r = await u.anish.run('log', trip({ mode: 'cab', amount: 420, place: 'Tile gallery', purpose: 'Selections' }));
    expect(r.view.toDecide.map((c: any) => c.id)).not.toContain(r.id);
    expect(await code(u.anish.run('decide', { claimIds: [r.id], decision: 'approve' }))).toMatch(/permission-denied/);
    expect((await u.meera.view()).toDecide.map((c: any) => c.id)).toContain(r.id);
    await u.meera.run('decide', { claimIds: [r.id], decision: 'reject', note: 'Shared cab, already paid' });
    expect((await u.anish.view()).mine.find((c: any) => c.id === r.id).status).toBe('Rejected');
  }, 60000);

  it('paid back in one go, and the person told once', async () => {
    const second = (await u.tanvi.run('log', trip({ mode: 'auto', amount: 180, place: 'Kurla vendor', purpose: 'Vendor visit' }))).id;
    await u.meera.run('decide', { claimIds: [second], decision: 'approve' });
    const r = await u.meera.run('pay', { claimIds: [first, second] });
    expect(r.view.toPay).toEqual([]);
    expect(r.view.all.filter((c: any) => c.status === 'Paid').map((c: any) => c.amount).sort()).toEqual([180, 96]);
    await new Promise((x) => setTimeout(x, 800));
    expect((await notesOf('tanvi@c.in', 'claims.paid')).map((x) => x.title)).toEqual(['₹276 paid back for 2 trips']);
  }, 60000);

  it('a trip still waiting can be taken back by its person only', async () => {
    const id = (await u.tanvi.run('log', trip({ place: 'Powai site' }))).id;
    expect(await code(u.anish.run('withdraw', { claimId: id }))).toMatch(/permission-denied/);
    const r = await u.tanvi.run('withdraw', { claimId: id });
    expect(r.view.mine.find((c: any) => c.id === id).status).toBe('Withdrawn');
  }, 60000);

  it('the receipt opens for its person and the founders only; the rates are the founders’', async () => {
    expect((await u.tanvi.run('receipt', { claimId: first })).receipt).toEqual({ type: 'image/png', data: PNG });
    expect((await u.meera.run('receipt', { claimId: first })).receipt.type).toBe('image/png');
    expect(await code(u.tanvi.run('rates', { bike: 6, car: 12 }))).toMatch(/permission-denied/);
    await u.anish.run('rates', { bike: 6, car: 12 });
    const r = await u.tanvi.run('log', trip({ place: 'Andheri site', km: 10, roundTrip: false, amount: 60 }));
    expect(r.view.mine.find((c: any) => c.id === r.id)).toMatchObject({ rate: 6, km: 10, amount: 60 });
    expect(r.view.rates).toEqual({ bike: 6, car: 12 });
    expect(await code(u.tanvi.run('log', { ...trip(), receipt: { type: 'text/html', data: 'PGh0bWw+' } }))).toMatch(/invalid-argument/);
  }, 60000);

  it('is never read from the browser', async () => {
    expect(await code(getDoc(doc(u.anish.fs, `peopleDesk/${STUDIO}/claims/${first}`)))).toMatch(/permission-denied/);
    expect(await code(getDocs(collection(u.anish.fs, `peopleDesk/${STUDIO}/claimReceipts`)))).toMatch(/permission-denied/);
  }, 60000);
});
