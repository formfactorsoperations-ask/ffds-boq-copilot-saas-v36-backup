/*
  Room messages, end to end in the local emulators: a message written by a
  browser under the real rules, and the onRoomMessageCreated function telling
  the people on the project. A throwaway "demo-" project; no live data.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore --project demo-rm "npx vitest run roomMessages.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDocs, setDoc } from 'firebase/firestore';

const PROJECT = 'demo-rm';
const STUDIO = 'studio_r';
let env: RulesTestEnvironment;

const people: Record<string, any> = {
  owner: { email: 'owner@r.in', tenantId: STUDIO, role: 'Owner', name: 'Owner' },
  head: { email: 'head@r.in', tenantId: STUDIO, role: 'Design Head', name: 'Mayuri' },
  ops_director: { email: 'opsd@r.in', tenantId: STUDIO, role: 'Ops Director', name: 'Ops' },
  riya: { email: 'riya@r.in', tenantId: STUDIO, role: 'Designer', name: 'Riya' },
  kabir: { email: 'kabir@r.in', tenantId: STUDIO, role: 'Designer', name: 'Kabir' },
  stranger: { email: 'stranger@r.in', tenantId: STUDIO, role: 'Designer', name: 'Stranger' },
  relations: { email: 'cr@r.in', tenantId: STUDIO, role: 'Client Relations', name: 'Relations' },
  supervisor: { email: 'site@r.in', tenantId: STUDIO, role: 'Site Supervisor', name: 'Site' },
  viewer: { email: 'viewer@r.in', tenantId: STUDIO, role: 'Viewer', name: 'Viewer' },
  client: { email: 'client@x.com', tenantId: STUDIO, role: 'Client', name: 'Client', projectIds: ['p1'] },
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, p] of Object.entries(people)) await setDoc(doc(db, `users/${uid}`), p);
    await setDoc(doc(db, `organizations/${STUDIO}`), {
      orgName: 'Studio R', tenantId: STUDIO,
      team: Object.entries(people).map(([id, p]) => ({ id, email: p.email, name: p.name, role: p.role })),
    });
    /* The server's copies of the project, as designView.ts and teamView.ts write them. */
    await setDoc(doc(db, 'projects/p1/designView/current'), { tenantId: STUDIO, designers: ['riya@r.in', 'kabir@r.in'], name: 'Harmony 704' });
    await setDoc(doc(db, 'projects/p1/teamView/ops'), { tenantId: STUDIO, members: ['cr@r.in'] });
    await setDoc(doc(db, 'projects/p1/teamView/site'), { tenantId: STUDIO, members: ['site@r.in'] });
  });
}, 60_000);
afterAll(async () => { await env?.cleanup(); });

const fs = (uid: string) => env.authenticatedContext(uid, { email: people[uid].email }).firestore();
async function notesOf(uid: string): Promise<any[]> {
  let out: any[] = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = (await getDocs(collection(ctx.firestore(), `inbox/${people[uid].email}/notes`))).docs.map((d) => d.data()).filter((n: any) => n.kind === 'design.roomMessage');
  });
  return out;
}
async function until(check: () => Promise<boolean>, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return true; await new Promise((r) => setTimeout(r, 400)); }
  return false;
}

describe('a room message', () => {
  it('tells the leads and the people on the project, and nobody else', async () => {
    await addDoc(collection(fs('riya'), 'projects/p1/roomMessages'), {
      tenantId: STUDIO, projectId: 'p1', room: 'Kitchen', text: 'Hob moves 300 left. See pin 4.',
      by: { uid: 'riya', email: 'riya@r.in', name: 'Riya' }, at: Date.now(),
    });
    expect(await until(async () => (await notesOf('head')).length === 1)).toBe(true);
    for (const uid of ['head', 'owner', 'ops_director', 'kabir', 'relations', 'supervisor']) {
      expect(await until(async () => (await notesOf(uid)).length === 1), uid).toBe(true);
    }
    const note = (await notesOf('relations'))[0];
    expect(note.title).toBe('Riya wrote in Kitchen');
    expect(note.line).toBe('“Hob moves 300 left. See pin 4.”');
    expect(note.projectId).toBe('p1');
    expect(note.projectName).toBe('Harmony 704');
    expect(note.route).toBe('drawing-tracker');
    expect(note.tenantId).toBe(STUDIO);
    /* Not the writer, a Designer who is not on the project, another role, or the client. */
    for (const uid of ['riya', 'stranger', 'viewer', 'client']) expect((await notesOf(uid)).length, uid).toBe(0);
  }, 90_000);
});
