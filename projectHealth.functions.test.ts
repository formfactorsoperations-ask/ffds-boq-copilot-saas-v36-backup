/*
  The Projects screen's drawing counts, kept by the server
  (functions/src/projectHealth.ts), in the local emulators:

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore --project demo-ph "npx vitest run projectHealth.functions.test.ts --environment node"

  A drawing written beside a project updates organizations/{orgId}/projectHealth/{id};
  studio staff read it, and nobody but the function writes it.
*/
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

const STUDIO = 'studio_ph';
let env: RulesTestEnvironment;

const read = async (path: string) => { let out: any; await env.withSecurityRulesDisabled(async (ctx) => { const s = await getDoc(doc(ctx.firestore(), path)); out = s.exists() ? s.data() : null; }); return out; };
const write = async (fn: (db: any) => Promise<any>) => env.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore()); });
async function waitFor<T>(fn: () => Promise<T | undefined | null | false>, ms = 30000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() > until) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 400));
  }
}
const TRACKER = `organizations/${STUDIO}/projects/p1/drawingTracker`;
const HEALTH = `organizations/${STUDIO}/projectHealth/p1`;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ph',
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await write(async (db) => {
    await setDoc(doc(db, `organizations/${STUDIO}`), { tenantId: STUDIO, team: [] });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1`), { tenantId: STUDIO });
    await setDoc(doc(db, 'users/ops'), { tenantId: STUDIO, role: 'Ops Director', email: 'ops@ph.in' });
  });
});
afterAll(async () => { await env?.cleanup(); });

describe('drawing counts', () => {
  it('follow the drawings beside a project', async () => {
    await write((db) => setDoc(doc(db, `${TRACKER}/d1`), { name: 'Kitchen elevation', rounds: [{ status: 'issued' }] }));
    await write((db) => setDoc(doc(db, `${TRACKER}/d2`), { name: 'Wardrobe', rounds: [{ status: 'not_issued' }] }));
    const counted = await waitFor(async () => { const h = await read(HEALTH); return h?.drawings?.total === 2 && h; });
    expect(counted.drawings).toEqual({ total: 2, issued: 1 });

    await write((db) => deleteDoc(doc(db, `${TRACKER}/d2`)));
    await waitFor(async () => (await read(HEALTH))?.drawings?.total === 1);
  });

  it('studio staff read them; nobody but the function writes them', async () => {
    const ops = env.authenticatedContext('ops', { email: 'ops@ph.in', email_verified: true }).firestore();
    await assertSucceeds(getDoc(doc(ops, HEALTH)));
    await assertFails(setDoc(doc(ops, HEALTH), { drawings: { total: 99, issued: 99 } }));
  });
});
