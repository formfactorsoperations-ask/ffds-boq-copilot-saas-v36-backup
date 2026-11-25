/*
  portalPing in the local emulators (lib/portalVisits, functions/src/portalVisits.ts):
  a real client's ping on their own project writes their visit, the same tab
  again within 45 seconds writes nothing, and anyone else -- the studio's own
  staff, which is what the "See it as the client" preview runs as, a client of
  another project, a client of another studio -- gets { ok: false } and
  writes nothing.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore,auth --project demo-pv "npx vitest run portalVisits.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

const PROJECT = 'demo-pv';
const STUDIO = 'studio_v';
let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];

async function signedIn(key: string, email: string, profile: any) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, key);
  apps.push(app);
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const cred = await createUserWithEmailAndPassword(auth, email, 'password-123');
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `users/${cred.user.uid}`), { email, ...profile }); });
  return { uid: cred.user.uid, ping: httpsCallable(fns, 'portalPing', { timeout: 60000 }) };
}
const visitsOf = async (projectId: string) => {
  let out: any[] = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = (await getDocs(collection(ctx.firestore(), `projects/${projectId}/portalVisits`))).docs.map((d) => ({ id: d.id, ...d.data() }));
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
    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO, isCompressed: true, compressedData: 'x', lastModified: 5 });
    await setDoc(doc(db, 'projects/p2'), { tenantId: STUDIO, context: { name: 'Other' } });
    await setDoc(doc(db, 'projects/q1'), { tenantId: 'studio_other', context: { name: 'Q1' } });
  });
}, 60000);
afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env?.cleanup();
});

describe('portalPing', () => {
  it('records a real client on their own project, and leaves the project document alone', async () => {
    const c = await signedIn('client', 'asha@home.in', { role: 'Client', tenantId: STUDIO, projectIds: ['p1'] });
    const r: any = await c.ping({ projectId: 'p1', tab: 'financials' });
    expect(r.data).toEqual({ ok: true, written: true });
    const [v] = await visitsOf('p1');
    expect(v).toMatchObject({ id: c.uid, uid: c.uid, email: 'asha@home.in', tenantId: STUDIO, projectId: 'p1', lastTab: 'financials', sessions: 1, tabs: { financials: 1 } });

    /* The same tab within 45 seconds writes nothing; another tab does, in the same session. */
    expect(((await c.ping({ projectId: 'p1', tab: 'financials' })) as any).data).toEqual({ ok: true, written: false });
    expect(((await c.ping({ projectId: 'p1', tab: 'not-a-tab' })) as any).data).toEqual({ ok: true, written: true });
    const [w] = await visitsOf('p1');
    expect(w).toMatchObject({ sessions: 1, lastTab: 'other', tabs: { financials: 1, other: 1 } });

    let project: any = null;
    await env.withSecurityRulesDisabled(async (ctx) => { project = (await getDoc(doc(ctx.firestore(), 'projects/p1'))).data(); });
    expect(project).toEqual({ tenantId: STUDIO, isCompressed: true, compressedData: 'x', lastModified: 5 });
  }, 60000);

  it('writes nothing for the studio\'s staff, which is what the preview runs as', async () => {
    for (const [key, role] of [['owner', 'Owner'], ['ops', 'Ops Director'], ['viewer', 'Viewer']]) {
      const s = await signedIn(key, `${key}@studio.in`, { role, tenantId: STUDIO, projectIds: ['p2'] });
      expect(((await s.ping({ projectId: 'p2', tab: 'overview' })) as any).data).toEqual({ ok: false });
    }
    expect(await visitsOf('p2')).toEqual([]);
  }, 60000);

  it('writes nothing for a client of another project or of another studio', async () => {
    const a = await signedIn('client_a', 'a@home.in', { role: 'Client', tenantId: STUDIO, projectIds: ['p1'] });
    expect(((await a.ping({ projectId: 'p2', tab: 'overview' })) as any).data).toEqual({ ok: false });
    const b = await signedIn('client_b', 'b@home.in', { role: 'Client', tenantId: STUDIO, projectIds: ['q1'] });
    expect(((await b.ping({ projectId: 'q1', tab: 'overview' })) as any).data).toEqual({ ok: false });
    expect(await visitsOf('p2')).toEqual([]);
    expect(await visitsOf('q1')).toEqual([]);
  }, 60000);
});
