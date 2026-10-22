/*
  The Ops Desk and the project's meeting log kept in step by the server
  (functions/src/meetingSync.ts), in the local emulators.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore --project demo-ms "npx vitest run meetingSync.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const STUDIO = 'studio_m';
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
const slot = { date: '2026-10-24', time: '16:30' };
const ev = (status: string, note = '') => ({ at: Date.now(), by: 'cr@m.com', byName: 'Riya', status, slot, note });
const booking = (over: any = {}) => ({
  tenantId: STUDIO, projectId: 'p1', projectName: 'Unique Vistas', kind: 'meeting', mode: 'video', purpose: 'BOQ discussion', requestedBy: 'client',
  status: 'confirmed', slot, reschedules: 0, history: [ev('confirmed')], createdAt: 1, createdBy: 'cr@m.com', createdByName: 'Riya', updatedAt: 1, updatedBy: 'cr@m.com', ...over,
});
const LOG = `organizations/${STUDIO}/projects/p1/siteVisits`;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ms',
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await write(async (db) => {
    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1`), { tenantId: STUDIO });
  });
});
afterAll(async () => { await env?.cleanup(); });

describe('a meeting booked on the Ops Desk', () => {
  it('appears in the project\'s meeting log once its time is agreed, and follows a new time', async () => {
    await write((db) => setDoc(doc(db, 'projects/p1/visitRequests/v0'), booking({ status: 'requested', slot: null, history: [ev('requested')] })));
    await write((db) => setDoc(doc(db, 'projects/p1/visitRequests/v1'), booking()));
    const copy = await waitFor(() => read(`${LOG}/desk-v1`));
    expect(copy).toMatchObject({ type: 'client_meeting', title: 'BOQ discussion', startTime: '16:30', status: 'active', visitRequestId: 'v1', source: 'ops_desk', meetingMode: 'google_meet' });
    expect(copy.date.toMillis()).toBe(Date.parse('2026-10-24T00:00:00Z'));
    expect(await read(`${LOG}/desk-v0`)).toBeNull();

    await write((db) => updateDoc(doc(db, 'projects/p1/visitRequests/v1'), { status: 'rescheduled', slot: { date: '2026-10-25', time: '11:00' }, reschedules: 1 }));
    const moved = await waitFor(async () => { const c = await read(`${LOG}/desk-v1`); return c?.startTime === '11:00' && c; });
    expect(moved.date.toMillis()).toBe(Date.parse('2026-10-25T00:00:00Z'));
  });

  it('is marked done on the desk when minutes are written for it', async () => {
    await write((db) => setDoc(doc(db, 'projects/p1/visitRequests/v2'), booking()));
    await waitFor(() => read(`${LOG}/desk-v2`));
    await write((db) => setDoc(doc(db, `organizations/${STUDIO}/projects/p1/moms/m1`), { meetingId: 'desk-v2', momRef: 'MOM-2026-040', status: 'draft' }));
    const done = await waitFor(async () => { const r = await read('projects/p1/visitRequests/v2'); return r?.status === 'done' && r; });
    expect(done.history.at(-1)).toMatchObject({ byName: 'Minutes', status: 'done' });
  });

  it('is cancelled in the log when cancelled on the desk, and on the desk when deleted from the log', async () => {
    await write((db) => setDoc(doc(db, 'projects/p1/visitRequests/v3'), booking()));
    await waitFor(() => read(`${LOG}/desk-v3`));
    await write((db) => updateDoc(doc(db, 'projects/p1/visitRequests/v3'), { status: 'cancelled', history: [ev('confirmed'), ev('cancelled', 'Client travelling')] }));
    const off = await waitFor(async () => { const c = await read(`${LOG}/desk-v3`); return c?.status === 'cancelled' && c; });
    expect(off.cancelReason).toBe('Client travelling');

    await write((db) => setDoc(doc(db, 'projects/p1/visitRequests/v4'), booking()));
    await waitFor(() => read(`${LOG}/desk-v4`));
    await write((db) => deleteDoc(doc(db, `${LOG}/desk-v4`)));
    const gone = await waitFor(async () => { const r = await read('projects/p1/visitRequests/v4'); return r?.status === 'cancelled' && r; });
    expect(gone.history.at(-1).note).toBe("Deleted from the project's meeting log.");
    /* ...and stays deleted: the desk does not put it back. */
    await new Promise((r) => setTimeout(r, 3000));
    expect(await read(`${LOG}/desk-v4`)).toBeNull();
  });

  it('takes a calendar invite sent from the project, without the two sides going back and forth', async () => {
    await write((db) => setDoc(doc(db, 'projects/p1/visitRequests/v5'), booking()));
    await waitFor(() => read(`${LOG}/desk-v5`));
    await write((db) => updateDoc(doc(db, `${LOG}/desk-v5`), { googleCalendarEventId: 'ev-p', googleMeetUrl: 'https://meet.google.com/abc-defg-hij', calendarSynced: true, notes: 'Bring samples' }));
    const r = await waitFor(async () => { const x = await read('projects/p1/visitRequests/v5'); return x?.calendarEventId && x; });
    expect(r).toMatchObject({ calendarEventId: 'ev-p', meetUrl: 'https://meet.google.com/abc-defg-hij', status: 'confirmed' });
    await new Promise((res) => setTimeout(res, 3000));
    const copy = await read(`${LOG}/desk-v5`);
    expect(copy).toMatchObject({ notes: 'Bring samples', googleCalendarEventId: 'ev-p', status: 'active' });
  });

  it('leaves meetings logged on the project alone', async () => {
    await write((db) => setDoc(doc(db, `${LOG}/own`), { type: 'client_meeting', title: 'Logged on the project', status: 'active' }));
    await write((db) => deleteDoc(doc(db, `${LOG}/own`)));
    await new Promise((r) => setTimeout(r, 2000));
    expect(await read('projects/p1/visitRequests/own')).toBeNull();
  });
});
