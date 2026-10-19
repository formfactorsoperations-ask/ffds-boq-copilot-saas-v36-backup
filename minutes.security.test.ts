/*
  The new minutes flow (lib/minutes.ts), proven against the rules: Client
  Relations writes, sends for approval, sends approved minutes and answers a
  correction with a revision; only a lead approves; the client confirms or
  marks the lines that are wrong.

    firebase emulators:exec --only firestore --project demo-security "npx vitest run minutes.security.test.ts"
*/
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, getDocs, setDoc, updateDoc, collectionGroup, query, where } from 'firebase/firestore';

let env: RulesTestEnvironment;
const STUDIO = 'studio_a';
const M = (id: string) => `organizations/${STUDIO}/projects/p1/moms/${id}`;
const step = (s: string, at = 1) => ({ step: s, at, by: 'cr@a.com', byName: 'Anushka', note: null });
const topics = [{ id: 't1', title: 'Kitchen', lines: [{ id: 'd1', kind: 'decision', text: 'L-shaped kitchen.' }] }];
const base = (over: any = {}) => ({
  format: 2, momRef: 'MOM-2026-001', meetingType: 'client_meeting', meetingTitle: 'Design review', meetingDate: 1,
  status: 'draft', topics, decisions: [{ id: 'd1', text: 'Kitchen: L-shaped kitchen.' }], actionItems: [], notes: [],
  trail: [step('written')], ...over,
});
const approvedBy = { email: 'od@a.com', name: 'Anish K', role: 'Ops Director', at: 5 };

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
    await setDoc(doc(db, 'users/od'), { email: 'od@a.com', tenantId: STUDIO, role: 'Ops Director' });
    await setDoc(doc(db, 'users/admin'), { email: 'admin@a.com', tenantId: STUDIO, role: 'Admin' });
    await setDoc(doc(db, 'users/head'), { email: 'head@a.com', tenantId: STUDIO, role: 'Design Head' });
    await setDoc(doc(db, 'users/cr'), { email: 'cr@a.com', tenantId: STUDIO, role: 'Client Relations' });
    await setDoc(doc(db, 'users/client'), { email: 'naik@x.in', tenantId: STUDIO, role: 'Client', projectIds: ['p1'] });
    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO, context: { name: 'p1' } });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1`), { tenantId: STUDIO });
    await setDoc(doc(db, 'projects/p1/teamView/ops'), { tenantId: STUDIO, kind: 'ops', members: ['cr@a.com'], compressedData: 'x' });
    await setDoc(doc(db, M('draft')), base());
    await setDoc(doc(db, M('waiting')), base({ status: 'pending_review', reviewTenantId: STUDIO }));
    await setDoc(doc(db, M('approved')), base({ status: 'finalised', approvedBy, trail: [step('written'), step('approved', 5)] }));
    await setDoc(doc(db, M('sent')), base({ status: 'shared', approvedBy, sentAt: 6, trail: [step('written'), step('approved', 5), step('sent', 6)] }));
    await setDoc(doc(db, M('fix')), base({ status: 'correction_requested', approvedBy, correctionRequest: { text: 'D1: no', by: 'Mr Naik', at: 7 } }));
    await setDoc(doc(db, M('fixWaiting')), base({ status: 'correction_requested', approvedBy, revisionStage: 'pending_review', reviewTenantId: STUDIO, pendingRevision: { topics } }));
    await setDoc(doc(db, M('legacyWaiting')), { status: 'pending_review', meetingType: 'client_meeting', decisions: [] });
    await setDoc(doc(db, M('legacyFinal')), { status: 'finalised', meetingType: 'client_meeting', decisions: [] });
  });
});

const as = (uid: string, email: string) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const cr = () => as('cr', 'cr@a.com');
const od = () => as('od', 'od@a.com');
const admin = () => as('admin', 'admin@a.com');
const head = () => as('head', 'head@a.com');
const client = () => as('client', 'naik@x.in');

describe('Client Relations writes and sends for approval', () => {
  it('starts minutes, but never already approved', async () => {
    await assertSucceeds(setDoc(doc(cr(), M('new')), base()));
    await assertFails(setDoc(doc(cr(), M('new2')), base({ approvedBy })));
  });
  it('sends them for approval, and cannot approve them', async () => {
    await assertSucceeds(updateDoc(doc(cr(), M('draft')), { status: 'pending_review', reviewTenantId: STUDIO, trail: [step('written'), step('sent_for_approval')] }));
    await assertFails(updateDoc(doc(cr(), M('waiting')), { status: 'finalised' }));
    await assertFails(updateDoc(doc(cr(), M('draft')), { approvedBy }));
  });
});

describe('only a lead approves', () => {
  it('an Ops Director or Admin approves', async () => {
    await assertSucceeds(updateDoc(doc(od(), M('waiting')), { status: 'finalised', approvedBy }));
    await assertSucceeds(updateDoc(doc(admin(), M('draft')), { status: 'finalised', approvedBy: { ...approvedBy, email: 'admin@a.com' } }));
  });
  it('a Design Head cannot approve new minutes, or sign for someone', async () => {
    await assertFails(updateDoc(doc(head(), M('waiting')), { status: 'finalised' }));
    await assertFails(updateDoc(doc(head(), M('draft')), { approvedBy }));
  });
  it('a Design Head still edits new minutes, and sends approved ones', async () => {
    await assertSucceeds(updateDoc(doc(head(), M('draft')), { summary: 'Agreed the kitchen.' }));
    await assertSucceeds(updateDoc(doc(head(), M('approved')), { status: 'shared', sentAt: 9 }));
  });
  it('older minutes work as before', async () => {
    await assertSucceeds(updateDoc(doc(head(), M('legacyWaiting')), { status: 'finalised' }));
  });
});

describe('Client Relations sends approved minutes', () => {
  const send = { status: 'shared', sharedAt: 9, sentAt: 9, sentBy: { email: 'cr@a.com', name: 'Anushka', at: 9 }, emailedTo: ['naik@x.in'], emailedAt: 9, updatedAt: 9 };
  it('sends, and sends again', async () => {
    await assertSucceeds(updateDoc(doc(cr(), M('approved')), { ...send, trail: [step('written'), step('approved', 5), step('sent', 9)] }));
    await assertSucceeds(updateDoc(doc(cr(), M('sent')), { ...send, trail: [step('written'), step('approved', 5), step('sent', 6), step('sent', 9)] }));
  });
  it('changes nothing else on the way', async () => {
    await assertFails(updateDoc(doc(cr(), M('approved')), { ...send, summary: 'Rewritten after approval' }));
    await assertFails(updateDoc(doc(cr(), M('approved')), { ...send, trail: [] }));
    await assertFails(updateDoc(doc(cr(), M('approved')), { status: 'acknowledged' }));
  });
  it('not older minutes, which a lead still shares', async () => {
    await assertFails(updateDoc(doc(cr(), M('legacyFinal')), { status: 'shared', sharedAt: 9 }));
  });
});

describe('a correction is answered with a revision', () => {
  it('Client Relations starts, saves and sends a revision for approval', async () => {
    await assertSucceeds(updateDoc(doc(cr(), M('fix')), { pendingRevision: { topics }, revisionStage: 'draft', trail: [step('written'), step('revision_started')] }));
    await assertSucceeds(updateDoc(doc(cr(), M('fix')), { pendingRevision: { topics, revisionNote: 'D1 corrected' }, updatedAt: 2 }));
    await assertSucceeds(updateDoc(doc(cr(), M('fix')), {
      pendingRevision: { topics }, revisionStage: 'pending_review', reviewTenantId: STUDIO, reviewProjectId: 'p1',
      reviewRequestedBy: 'cr@a.com', reviewRequestedAt: 3, trail: [step('written'), step('sent_for_approval')],
    }));
  });
  it('without touching what the client has', async () => {
    await assertFails(updateDoc(doc(cr(), M('fix')), { topics: [], revisionStage: 'draft' }));
    await assertFails(updateDoc(doc(cr(), M('fix')), { status: 'finalised', revisionStage: 'draft' }));
    await assertFails(updateDoc(doc(cr(), M('fix')), { revisionStage: 'approved' }));
  });
  it('and not while the revision is with the lead', async () => {
    await assertFails(updateDoc(doc(cr(), M('fixWaiting')), { pendingRevision: { topics: [] } }));
  });
  it('the lead sees revisions waiting in their list; Client Relations does not list the studio', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(od(), 'moms'), where('reviewTenantId', '==', STUDIO), where('revisionStage', '==', 'pending_review'))));
    await assertFails(getDocs(query(collectionGroup(cr(), 'moms'), where('reviewTenantId', '==', STUDIO), where('revisionStage', '==', 'pending_review'))));
  });
});

describe('the client confirms, or marks the lines that are wrong', () => {
  it('reads issued minutes, never a draft or minutes waiting for approval', async () => {
    await assertSucceeds(getDoc(doc(client(), M('sent'))));
    await assertFails(getDoc(doc(client(), M('draft'))));
    await assertFails(getDoc(doc(client(), M('waiting'))));
  });
  it('confirms', async () => {
    await assertSucceeds(updateDoc(doc(client(), M('sent')), { status: 'acknowledged', acknowledgedBy: 'Mr Naik', acknowledgedAt: 10, ackChannel: 'client_portal' }));
  });
  it('marks lines', async () => {
    await assertSucceeds(updateDoc(doc(client(), M('sent')), {
      status: 'correction_requested',
      correctionRequest: { text: 'D1: U-shaped, not L.', by: 'Mr Naik', at: 10, lines: [{ lineId: 'd1', ref: 'D1', text: 'U-shaped, not L.' }] },
    }));
  });
  it('within limits, and nothing else', async () => {
    const lines = Array.from({ length: 51 }, (_, i) => ({ lineId: `l${i}`, ref: '', text: 'x' }));
    await assertFails(updateDoc(doc(client(), M('sent')), { status: 'correction_requested', correctionRequest: { text: 'x', by: 'N', at: 1, lines } }));
    await assertFails(updateDoc(doc(client(), M('sent')), { status: 'correction_requested', correctionRequest: { text: 'x', by: 'N', at: 1, lines: 'D1' } }));
    await assertFails(updateDoc(doc(client(), M('sent')), { status: 'correction_requested', correctionRequest: { text: 'x', by: 'N', at: 1, note: 'extra' } }));
    await assertFails(updateDoc(doc(client(), M('sent')), { approvedBy: { name: 'Me' } }));
  });
});
