/*
  The studio-wide duplicate check, end to end, in
  the local emulators (functions/src/leads.ts). A throwaway "demo-" project.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore,auth --project demo-ld "npx vitest run leads.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';

const PROJECT = 'demo-ld';
const STUDIO = 'studio_l';
let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];

function fnsFor(name: string) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, name);
  apps.push(app);
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  return { app, fns };
}
async function signedIn(key: string, email: string, profile: any) {
  const { app, fns } = fnsFor(key);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const cred = await createUserWithEmailAndPassword(auth, email, 'password-123');
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `users/${cred.user.uid}`), { email, ...profile }); });
  return httpsCallable(fns, 'leadMatches', { timeout: 60000 });
}
const leadsOf = async () => {
  let out: any[] = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = (await getDocs(query(collection(ctx.firestore(), 'leads'), where('tenantId', '==', STUDIO)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  return out;
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${STUDIO}`), {
      orgName: 'Studio L',
      team: [{ email: 'lead@l.com', name: 'Anish', role: 'Ops Director' }, { email: 'cr@l.com', name: 'Anushka', role: 'Client Relations' }, { email: 'cr2@l.com', name: 'Priya', role: 'Client Relations' }],
      projectDesigners: { p1: ['cr2@l.com'] },
    });
    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO, context: { name: 'Sea Breeze', clientName: 'Mrs Shah', clientPhone: '+91 90000 11111', clientEmail: 'shah@x.in', status: 'execution' } });
    await setDoc(doc(db, 'leads/old'), {
      tenantId: STUDIO, createdAt: Date.now() - 5 * 86400000, createdBy: 'cr2@l.com', ownerEmail: 'cr2@l.com', ownerName: 'Priya', stage: 'talking',
      people: [{ id: 'a', name: 'Dr Kulkarni', phone: '+91 99200 00000', email: '', main: true }], home: { where: 'Thane', type: 'Clinic' }, source: 'website', touches: [],
    });
  });
}, 120000);

afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env?.cleanup();
});

describe('the duplicate check across the studio', () => {
  it('finds another person’s lead and a client, by name and owner only', async () => {
    const check = await signedIn('cr', 'cr@l.com', { tenantId: STUDIO, role: 'Client Relations' });
    const r: any = (await check({ people: [{ phone: '99200 00000', email: '' }, { phone: '', email: 'SHAH@x.in' }] })).data;
    const lead = r.matches.find((m: any) => m.kind === 'lead');
    const client = r.matches.find((m: any) => m.kind === 'client');
    expect(lead).toMatchObject({ id: 'old', mine: false, ownerName: 'Priya', by: 'phone' });
    expect(client).toMatchObject({ id: 'p1', mine: false, name: 'Mrs Shah', by: 'email' });
    expect(JSON.stringify(r)).not.toMatch(/budget|₹/);
  }, 60000);

  it('is not open to other roles', async () => {
    const check = await signedIn('des', 'des@l.com', { tenantId: STUDIO, role: 'Designer' });
    await expect(check({ people: [{ phone: '99200 00000', email: '' }] })).rejects.toMatchObject({ code: 'functions/permission-denied' });
  }, 60000);
});
