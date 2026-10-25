/*
  Leads and each person's desk, proven against the rules (lib/leads.ts,
  lib/opsTeam.ts): who reads and changes a lead, the per-person desk record,
  the day-end notes, and moving a next step to another day.

    firebase emulators:exec --only firestore --project demo-security "npx vitest run leads.security.test.ts"
*/
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';

let env: RulesTestEnvironment;
const STUDIO = 'studio_a';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-security',
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8') },
  });
});
afterAll(async () => { await env.cleanup(); });

const lead = (owner: string, over: any = {}) => ({
  tenantId: STUDIO, createdAt: 1, createdBy: owner, createdByName: 'X', ownerEmail: owner, ownerName: 'X',
  people: [{ id: 'a', name: 'Rohan Mehta', role: 'Main contact', phone: '+91 98330 12345', email: '', main: true }],
  home: { where: 'Powai', type: '3 BHK', area: 1150, scope: [], possession: '', budget: '₹25–30 L' }, source: 'instagram', sourceNote: '',
  enquiry: 'Need interiors', stage: 'new', lostReason: null, know: { decides: '', style: '', seenWork: false }, next: null, touches: [],
  firstTouchAt: null, lastTouchAt: null, openRequest: null, projectId: null, updatedAt: 1, updatedBy: owner, ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/admin'), { email: 'admin@a.com', tenantId: STUDIO, role: 'Admin' });
    await setDoc(doc(db, 'users/head'), { email: 'head@a.com', tenantId: STUDIO, role: 'Design Head' });
    await setDoc(doc(db, 'users/cr'), { email: 'cr@a.com', tenantId: STUDIO, role: 'Client Relations' });
    await setDoc(doc(db, 'users/cr2'), { email: 'cr2@a.com', tenantId: STUDIO, role: 'Client Relations' });
    await setDoc(doc(db, 'users/other'), { email: 'cr@b.com', tenantId: 'studio_b', role: 'Client Relations' });
    await setDoc(doc(db, 'leads/mine'), lead('cr@a.com'));
    await setDoc(doc(db, 'leads/theirs'), lead('cr2@a.com'));
    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO, context: { name: 'p1' } });
    await setDoc(doc(db, 'projects/p1/teamView/ops'), { tenantId: STUDIO, kind: 'ops', members: ['cr@a.com'], compressedData: 'x' });
    await setDoc(doc(db, 'projects/p1/followUps/f1'), {
      tenantId: STUDIO, projectId: 'p1', projectName: 'P', at: 1, by: 'cr@a.com', byName: 'R', channel: 'call', note: 'x', subject: null,
      outcome: 'info', next: { text: 'Call again', ownerEmail: 'cr@a.com', ownerName: 'R', due: '2026-10-19' }, nextDone: false, manual: true,
    });
    await setDoc(doc(db, `opsDays/${STUDIO}__cr2@a.com__2026-10-19`), { tenantId: STUDIO, email: 'cr2@a.com', name: 'P', day: '2026-10-19', closed: [], rolled: [], note: 'x', at: 1, readBy: [] });
  });
});

const as = (uid: string, email: string) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const cr = () => as('cr', 'cr@a.com');
const admin = () => as('admin', 'admin@a.com');
const head = () => as('head', 'head@a.com');
const other = () => as('other', 'cr@b.com');

describe('leads', () => {
  it('Client Relations reads their own, never another person’s', async () => {
    await assertSucceeds(getDoc(doc(cr(), 'leads/mine')));
    await assertFails(getDoc(doc(cr(), 'leads/theirs')));
    await assertSucceeds(getDocs(query(collection(cr(), 'leads'), where('tenantId', '==', STUDIO), where('ownerEmail', '==', 'cr@a.com'))));
    await assertFails(getDocs(query(collection(cr(), 'leads'), where('tenantId', '==', STUDIO))));
  });
  it('a lead reads the studio’s; other roles and studios read none', async () => {
    await assertSucceeds(getDocs(query(collection(admin(), 'leads'), where('tenantId', '==', STUDIO))));
    await assertFails(getDoc(doc(head(), 'leads/mine')));
    await assertFails(getDoc(doc(other(), 'leads/mine')));
  });
  it('Client Relations adds one only in their own name', async () => {
    await assertSucceeds(setDoc(doc(cr(), 'leads/new1'), lead('cr@a.com')));
    await assertFails(setDoc(doc(cr(), 'leads/new2'), lead('cr2@a.com', { createdBy: 'cr@a.com', updatedBy: 'cr@a.com' })));
    await assertFails(setDoc(doc(cr(), 'leads/new3'), lead('cr@a.com', { stage: 'won' })));
    await assertFails(setDoc(doc(cr(), 'leads/new4'), lead('cr@a.com', { extra: 1 })));
    await assertFails(setDoc(doc(other(), 'leads/new5'), lead('cr@b.com')));
  });
  it('Client Relations works their lead but cannot hand it on, open the project or delete it', async () => {
    await assertSucceeds(updateDoc(doc(cr(), 'leads/mine'), { stage: 'measured', openRequest: { at: 2, by: 'cr@a.com', byName: 'R' }, updatedAt: 2 }));
    await assertFails(updateDoc(doc(cr(), 'leads/mine'), { ownerEmail: 'cr2@a.com' }));
    await assertFails(updateDoc(doc(cr(), 'leads/mine'), { stage: 'won', projectId: 'p9' }));
    await assertFails(updateDoc(doc(cr(), 'leads/theirs'), { stage: 'lost', updatedBy: 'cr@a.com' }));
    await assertFails(deleteDoc(doc(cr(), 'leads/mine')));
  });
  it('a lead hands it on, opens the project and deletes it', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'leads/mine'), { ownerEmail: 'cr2@a.com', updatedBy: 'admin@a.com' }));
    await assertSucceeds(updateDoc(doc(admin(), 'leads/theirs'), { stage: 'won', projectId: 'p9', updatedBy: 'admin@a.com' }));
    await assertFails(updateDoc(doc(admin(), 'leads/theirs'), { createdBy: 'admin@a.com', updatedBy: 'admin@a.com' }));
    await assertSucceeds(deleteDoc(doc(admin(), 'leads/mine')));
  });
  it('keeps notes and closed-out meetings, as lists of a bounded size', async () => {
    const note = { id: 'n1', at: 2, by: 'cr@a.com', byName: 'R', text: 'Prefers calls after 7 pm', pinned: true, editedAt: null };
    const met = { id: 'm1', date: '2026-10-20', time: '11:00', mode: 'in_person', purpose: 'Studio meeting', status: 'done', outcome: '', at: 2, by: 'cr@a.com', byName: 'R' };
    await assertSucceeds(updateDoc(doc(cr(), 'leads/mine'), { notes: [note], meetings: [met], updatedAt: 2 }));
    await assertFails(updateDoc(doc(cr(), 'leads/mine'), { notes: 'not a list', updatedAt: 3 }));
    await assertFails(updateDoc(doc(cr(), 'leads/mine'), { notes: Array.from({ length: 201 }, (_, i) => ({ ...note, id: `n${i}` })), updatedAt: 3 }));
  });
});

describe('each person’s desk', () => {
  const rec = (email: string, over: any = {}) => ({ tenantId: STUDIO, email, name: 'R', startedAt: 1, guide: {}, guideHiddenUntil: '', snoozes: {}, updatedAt: 1, ...over });
  it('is written by its person only, and read by them and the leads', async () => {
    await assertSucceeds(getDoc(doc(cr(), `opsPeople/${STUDIO}__cr@a.com`)));
    await assertSucceeds(setDoc(doc(cr(), `opsPeople/${STUDIO}__cr@a.com`), rec('cr@a.com', { guide: { log: 2 } })));
    await assertFails(setDoc(doc(cr(), `opsPeople/${STUDIO}__cr2@a.com`), rec('cr2@a.com')));
    await assertFails(setDoc(doc(head(), `opsPeople/${STUDIO}__head@a.com`), rec('head@a.com')));
    await assertFails(getDoc(doc(cr(), `opsPeople/${STUDIO}__cr2@a.com`)));
    await assertSucceeds(getDocs(query(collection(admin(), 'opsPeople'), where('tenantId', '==', STUDIO))));
  });
  it('day-end notes are the writer’s; a lead reads them and marks them read', async () => {
    const day = (email: string) => ({ tenantId: STUDIO, email, name: 'R', day: '2026-10-19', closed: ['Called'], rolled: [{ title: 'x', to: '2026-10-20' }], note: 'For Anish', at: 1, readBy: [] });
    await assertSucceeds(setDoc(doc(cr(), `opsDays/${STUDIO}__cr@a.com__2026-10-19`), day('cr@a.com')));
    await assertFails(setDoc(doc(cr(), `opsDays/${STUDIO}__cr2@a.com__2026-10-19`), day('cr2@a.com')));
    await assertFails(getDoc(doc(cr(), `opsDays/${STUDIO}__cr2@a.com__2026-10-19`)));
    await assertSucceeds(getDocs(query(collection(admin(), 'opsDays'), where('tenantId', '==', STUDIO), where('day', '>=', '2026-10-12'))));
    await assertSucceeds(updateDoc(doc(admin(), `opsDays/${STUDIO}__cr2@a.com__2026-10-19`), { readBy: ['admin@a.com'] }));
    await assertFails(updateDoc(doc(admin(), `opsDays/${STUDIO}__cr2@a.com__2026-10-19`), { note: 'changed' }));
  });
});

describe('moving a next step', () => {
  it('changes only its date, in the mover’s name', async () => {
    const ref = () => doc(cr(), 'projects/p1/followUps/f1');
    const next = { text: 'Call again', ownerEmail: 'cr@a.com', ownerName: 'R' };
    await assertSucceeds(updateDoc(ref(), { next: { ...next, due: '2026-10-20' }, nextMovedAt: 2, nextMovedBy: 'cr@a.com' }));
    await assertFails(updateDoc(ref(), { next: { ...next, text: 'Something else', due: '2026-10-21' }, nextMovedAt: 3, nextMovedBy: 'cr@a.com' }));
    await assertFails(updateDoc(ref(), { next: { ...next, due: 'soon' }, nextMovedAt: 3, nextMovedBy: 'cr@a.com' }));
    await assertFails(updateDoc(ref(), { next: { ...next, due: '2026-10-22' }, nextMovedAt: 3, nextMovedBy: 'admin@a.com' }));
  });
});
