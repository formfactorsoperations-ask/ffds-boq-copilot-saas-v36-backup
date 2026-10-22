/*
  "New for you" in the client portal, in the local emulators: when the studio
  releases something (portalView/current is rebuilt), the project's clients
  get a note in portalInbox/{uid}; the first release is one "ready" note; a
  rebuild that adds nothing tells nobody; and a phone token that cannot be
  reached never stops the note.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore --project demo-pn "npx vitest run portalNotify.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const P = 'proj_pn';

const view = (context: any) => ({ v: 1, builtAt: new Date().toISOString(), projectId: P, context: { name: 'Harmony 704', portalStudio: { name: 'FormFactors' }, ...context } });
const write = (context: any) => env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `projects/${P}/portalView/current`), view(context)); });
const notes = async (uid: string) => {
  let out: any[] = [];
  await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDocs(collection(ctx.firestore(), `portalInbox/${uid}/notes`))).docs.map((d) => d.data()); });
  return out;
};
async function until<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 30000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (ok(v)) return v;
    if (Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-pn',
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/client_a'), { email: 'naik@home.in', role: 'Client', tenantId: 'studio_p', projectIds: [P] });
    await setDoc(doc(db, 'users/client_b'), { email: 'other@home.in', role: 'Client', tenantId: 'studio_p', projectIds: ['someone_else'] });
    await setDoc(doc(db, 'users/staff_a'), { email: 'riya@ff.in', role: 'Client Relations', tenantId: 'studio_p', projectIds: [P] });
    await setDoc(doc(db, 'organizations/studio_p'), { team: [{ email: 'meera@ff.in', role: 'Ops Director' }, { email: 'Anish@ff.in', role: 'Ops Director', roles: ['Admin'] }] });
    await setDoc(doc(db, `projects/${P}`), { tenantId: 'studio_p', isCompressed: true, compressedData: 'x' });
    await setDoc(doc(db, `projects/${P}/decisions/d1`), { status: 'drawing_sent', title: 'Kitchen Decision', roomName: 'Kitchen', projectName: 'Harmony 704', clientName: 'Mr Prasad Naik', studioId: 'demo-tenant-01' });
    /* A phone that has gone away: sending to it fails, and the note is written all the same. */
    await setDoc(doc(db, 'portalInbox/client_a/devices/d1'), { token: 'not-a-real-token', platform: 'Android · Chrome', at: 1 });
  });
}, 60000);
afterAll(async () => { await env?.cleanup(); });

describe('New for you', () => {
  it('the first release is one note that the portal is ready, for this project\'s client only', async () => {
    await write({ documents: { issues: [] } });
    const got = await until(() => notes('client_a'), (n) => n.length >= 1);
    expect(got.map((n) => n.kind)).toEqual(['portal.ready']);
    expect(got[0].tenantId).toBe('studio_p');
    expect(await notes('client_b')).toEqual([]);
    expect(await notes('staff_a')).toEqual([]);
  }, 40000);

  it('a document to approve and an answer about a finish each become a note that needs them', async () => {
    await write({
      documents: { issues: [{ id: 'i1', kind: 'scope_revision', version: 2 }] },
      materialSelections: [],
    });
    await write({
      documents: { issues: [{ id: 'i1', kind: 'scope_revision', version: 2 }] },
      materialSelections: [{ id: 'm1', itemName: 'Kitchen shutters', clientConfirmedAt: '2026-10-01', studioReply: 'Walnut veneer, matt.' }],
    });
    const got = await until(() => notes('client_a'), (n) => n.length >= 3);
    const kinds = got.map((n) => n.kind).sort();
    expect(kinds).toEqual(['portal.answer', 'portal.document', 'portal.ready']);
    const docNote = got.find((n) => n.kind === 'portal.document');
    expect(docNote.title).toBe('New for you: a scope revision (version 2)');
    expect(docNote.level).toBe('needs');
    expect(docNote.actor).toBe('FormFactors');
  }, 40000);

  it('a rebuild that adds nothing tells nobody', async () => {
    await write({
      documents: { issues: [{ id: 'i1', kind: 'scope_revision', version: 2 }] },
      materialSelections: [{ id: 'm1', itemName: 'Kitchen shutters', clientConfirmedAt: '2026-10-01', studioReply: 'Walnut veneer, matt.' }],
    });
    await new Promise((r) => setTimeout(r, 4000));
    expect((await notes('client_a')).length).toBe(3);
  }, 20000);

  it('a client approving a decision tells the studio, by its project\'s studio, not the decision\'s old default', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `projects/${P}/decisions/d1`), { status: 'signed', title: 'Kitchen Decision', roomName: 'Kitchen', projectName: 'Harmony 704', studioId: 'demo-tenant-01', signoff: { type: 'approved', clientNameEntered: 'Mr Prasad Naik' } }, { merge: true });
    });
    const inbox = async (email: string) => {
      let out: any[] = [];
      await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDocs(collection(ctx.firestore(), `inbox/${email}/notes`))).docs.map((d) => d.data()); });
      return out;
    };
    const got = await until(() => inbox('meera@ff.in'), (n) => n.length >= 1);
    expect(got.map((n) => n.title)).toEqual(['Mr Prasad Naik approved a decision: Kitchen Decision']);
    expect(got[0]).toMatchObject({ tenantId: 'studio_p', route: 'record-decision', projectId: P });
    expect((await inbox('anish@ff.in')).length).toBe(1);
  }, 40000);
});
