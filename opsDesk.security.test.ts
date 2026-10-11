/*
  The Ops Desk's records, proven against the rules: the follow-up log,
  escalations, and the minutes review step for Client Relations.

    firebase emulators:exec --only firestore --project demo-security "npx vitest run opsDesk.security.test.ts"
*/
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where } from 'firebase/firestore';

let env: RulesTestEnvironment;
const STUDIO = 'studio_a';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-security',
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8') },
  });
});
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/admin'), { email: 'admin@a.com', tenantId: STUDIO, role: 'Admin' });
    await setDoc(doc(db, 'users/head'), { email: 'head@a.com', tenantId: STUDIO, role: 'Design Head' });
    await setDoc(doc(db, 'users/viewer'), { email: 'viewer@a.com', tenantId: STUDIO, role: 'Viewer' });
    await setDoc(doc(db, 'users/designer'), { email: 'd@a.com', tenantId: STUDIO, role: 'Designer' });
    await setDoc(doc(db, 'users/cr'), { email: 'cr@a.com', tenantId: STUDIO, role: 'Client Relations' });
    for (const p of ['p1', 'p2']) {
      await setDoc(doc(db, `projects/${p}`), { tenantId: STUDIO, context: { name: p } });
      await setDoc(doc(db, `organizations/${STUDIO}/projects/${p}`), { tenantId: STUDIO });
    }
    await setDoc(doc(db, 'projects/p1/teamView/ops'), { tenantId: STUDIO, kind: 'ops', members: ['cr@a.com'], compressedData: 'x' });
    await setDoc(doc(db, 'projects/p2/teamView/ops'), { tenantId: STUDIO, kind: 'ops', members: [], compressedData: 'x' });
    await setDoc(doc(db, 'projects/p1/followUps/f0'), line('cr@a.com'));
    await setDoc(doc(db, 'projects/p2/followUps/f0'), line('admin@a.com', 'p2'));
    await setDoc(doc(db, 'projects/p1/escalations/open'), esc('cr@a.com'));
    await setDoc(doc(db, 'projects/p1/escalations/decided'), { ...esc('cr@a.com'), status: 'decided', decision: 'Send a quote' });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1/moms/review`), { status: 'pending_review', reviewTenantId: STUDIO, meetingTitle: 'Site visit' });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1/moms/final`), { status: 'finalised' });
  });
});

const as = (uid: string, email: string) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const cr = () => as('cr', 'cr@a.com');
const admin = () => as('admin', 'admin@a.com');
const head = () => as('head', 'head@a.com');
const viewer = () => as('viewer', 'viewer@a.com');
const designer = () => as('designer', 'd@a.com');

function line(by: string, projectId = 'p1', over: any = {}) {
  return {
    tenantId: STUDIO, projectId, projectName: 'Kapoor Villa', at: 1, by, byName: 'Riya', channel: 'call', note: 'Called about payment 2',
    subject: { kind: 'payment', key: 'pay:m2', label: 'Carpentry' }, outcome: 'reminded',
    next: { text: 'Call again', ownerEmail: by, ownerName: 'Riya', due: '2026-10-14' }, nextDone: false, manual: true, ...over,
  };
}
function esc(by: string, projectId = 'p1', over: any = {}) {
  return {
    tenantId: STUDIO, projectId, projectName: 'Kapoor Villa', title: 'Payment 2 late', detail: 'Two reminders, no reply',
    category: 'payment', subjectKey: 'pay:m2', raisedBy: by, raisedByName: 'Riya', raisedAt: 1, auto: false, status: 'open', ...over,
  };
}

describe('the follow-up log', () => {
  it('takes a line from Client Relations on an assigned project, in their own name, written by hand', async () => {
    await assertSucceeds(setDoc(doc(cr(), 'projects/p1/followUps/f1'), line('cr@a.com')));
    await assertFails(setDoc(doc(cr(), 'projects/p1/followUps/f2'), line('admin@a.com')));
    await assertFails(setDoc(doc(cr(), 'projects/p2/followUps/f3'), line('cr@a.com', 'p2')));
    await assertFails(setDoc(doc(cr(), 'projects/p1/followUps/f4'), line('cr@a.com', 'p1', { manual: false })));
    await assertFails(setDoc(doc(cr(), 'projects/p1/followUps/f5'), line('cr@a.com', 'p1', { margin: 0.3 })));
    await assertFails(setDoc(doc(cr(), 'projects/p1/followUps/f6'), line('cr@a.com', 'p1', { tenantId: 'studio_b' })));
  });

  it('takes lines from studio staff, not a Viewer or a Designer', async () => {
    await assertSucceeds(setDoc(doc(head(), 'projects/p2/followUps/h1'), line('head@a.com', 'p2')));
    await assertFails(setDoc(doc(viewer(), 'projects/p1/followUps/v1'), line('viewer@a.com')));
    await assertFails(setDoc(doc(designer(), 'projects/p1/followUps/d1'), line('d@a.com')));
  });

  it('lets a next step be ticked off, and nothing else changed or deleted', async () => {
    await assertSucceeds(updateDoc(doc(cr(), 'projects/p1/followUps/f0'), { nextDone: true, nextDoneAt: 2, nextDoneBy: 'cr@a.com' }));
    await assertFails(updateDoc(doc(cr(), 'projects/p1/followUps/f0'), { note: 'rewritten' }));
    await assertFails(updateDoc(doc(admin(), 'projects/p1/followUps/f0'), { outcome: 'replied' }));
    await assertFails(deleteDoc(doc(admin(), 'projects/p1/followUps/f0')));
  });

  it('is read by Client Relations on assigned projects only, and by the studio across projects', async () => {
    await assertSucceeds(getDocs(collection(cr(), 'projects/p1/followUps')));
    await assertFails(getDocs(collection(cr(), 'projects/p2/followUps')));
    await assertSucceeds(getDocs(query(collectionGroup(admin(), 'followUps'), where('tenantId', '==', STUDIO))));
    await assertFails(getDocs(query(collectionGroup(cr(), 'followUps'), where('tenantId', '==', STUDIO))));
  });
});

describe('escalations', () => {
  it('are raised open, by hand, in the raiser’s name', async () => {
    await assertSucceeds(setDoc(doc(cr(), 'projects/p1/escalations/e1'), esc('cr@a.com')));
    await assertFails(setDoc(doc(cr(), 'projects/p1/escalations/e2'), esc('cr@a.com', 'p1', { auto: true })));
    await assertFails(setDoc(doc(cr(), 'projects/p1/escalations/e3'), esc('cr@a.com', 'p1', { status: 'decided' })));
    await assertFails(setDoc(doc(cr(), 'projects/p2/escalations/e4'), esc('cr@a.com', 'p2')));
    await assertFails(setDoc(doc(viewer(), 'projects/p1/escalations/e5'), esc('viewer@a.com')));
  });

  it('are decided by a lead only', async () => {
    const decide = { status: 'decided', decision: 'Send a revised quote', decidedBy: 'admin@a.com', decidedByName: 'Anish', decidedAt: 2 };
    await assertFails(updateDoc(doc(cr(), 'projects/p1/escalations/open'), { ...decide, decidedBy: 'cr@a.com' }));
    await assertFails(updateDoc(doc(head(), 'projects/p1/escalations/open'), { ...decide, decidedBy: 'head@a.com' }));
    await assertFails(updateDoc(doc(admin(), 'projects/p1/escalations/open'), { ...decide, decidedBy: 'someone@a.com' }));
    await assertSucceeds(updateDoc(doc(admin(), 'projects/p1/escalations/open'), decide));
  });

  it('are closed by whoever raised them once decided, and not before', async () => {
    await assertFails(updateDoc(doc(cr(), 'projects/p1/escalations/open'), { status: 'closed', closedAt: 3 }));
    await assertSucceeds(updateDoc(doc(cr(), 'projects/p1/escalations/decided'), { status: 'closed', closedAt: 3 }));
  });

  it('are listed across projects for the studio, by studio', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(admin(), 'escalations'), where('tenantId', '==', STUDIO), where('status', '==', 'open'))));
    await assertFails(getDocs(query(collectionGroup(cr(), 'escalations'), where('tenantId', '==', STUDIO))));
    await assertSucceeds(getDocs(collection(cr(), 'projects/p1/escalations')));
  });
});

describe('minutes written by Client Relations', () => {
  const M = `organizations/${STUDIO}/projects`;
  it('are drafted and sent for approval, never finalised or shared by them', async () => {
    await assertSucceeds(setDoc(doc(cr(), `${M}/p1/moms/new`), { status: 'draft', meetingTitle: 'Call' }));
    await assertSucceeds(updateDoc(doc(cr(), `${M}/p1/moms/new`), { status: 'pending_review', reviewTenantId: STUDIO }));
    await assertFails(updateDoc(doc(cr(), `${M}/p1/moms/review`), { status: 'finalised' }));
    await assertFails(setDoc(doc(cr(), `${M}/p1/moms/x`), { status: 'shared' }));
    await assertFails(updateDoc(doc(cr(), `${M}/p1/moms/final`), { status: 'draft' }));
    await assertFails(setDoc(doc(cr(), `${M}/p2/moms/y`), { status: 'draft' }));
    await assertSucceeds(setDoc(doc(cr(), `organizations/${STUDIO}/sequences/moms`), { current: 4 }));
  });

  it('are approved by the studio, and listed for it while they wait', async () => {
    await assertSucceeds(updateDoc(doc(admin(), `${M}/p1/moms/review`), { status: 'finalised' }));
    await assertSucceeds(getDocs(query(collectionGroup(head(), 'moms'), where('reviewTenantId', '==', STUDIO), where('status', '==', 'pending_review'))));
    await assertFails(getDocs(query(collectionGroup(cr(), 'moms'), where('reviewTenantId', '==', STUDIO), where('status', '==', 'pending_review'))));
  });
});

describe('the Ops Desk settings', () => {
  it('are changed by a lead only', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `organizations/${STUDIO}`), { orgName: 'A', team: [] }); });
    await assertFails(updateDoc(doc(head(), `organizations/${STUDIO}`), { opsDesk: { escalationRecipients: ['head@a.com'] } }));
    await assertFails(updateDoc(doc(cr(), `organizations/${STUDIO}`), { opsDesk: { paymentDueDays: 60 } }));
    await assertSucceeds(updateDoc(doc(admin(), `organizations/${STUDIO}`), { opsDesk: { paymentDueDays: 10 } }));
    await assertSucceeds(getDoc(doc(cr(), `organizations/${STUDIO}`)));
  });
});
