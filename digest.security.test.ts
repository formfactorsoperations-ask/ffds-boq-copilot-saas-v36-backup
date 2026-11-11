/*
  The Friday digest's records, proven against the rules (lib/fridayDigest.ts):
  written by Client Relations on an assigned project, approved only by a
  lead, its words fixed once approved, and marked sent only after approval.

    firebase emulators:exec --only firestore --project demo-security "npx vitest run digest.security.test.ts"
*/
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const STUDIO = 'studio_a';
const WEEK = '2026-11-13';

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-security', firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8') } });
});
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/od'), { email: 'od@a.com', tenantId: STUDIO, role: 'Ops Director' });
    await setDoc(doc(db, 'users/cr'), { email: 'cr@a.com', tenantId: STUDIO, role: 'Client Relations' });
    await setDoc(doc(db, 'users/cr2'), { email: 'cr2@a.com', tenantId: STUDIO, role: 'Client Relations' });
    await setDoc(doc(db, 'users/designer'), { email: 'd@a.com', tenantId: STUDIO, role: 'Designer' });
    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO, context: { name: 'p1' } });
    await setDoc(doc(db, 'projects/p1/teamView/ops'), { tenantId: STUDIO, kind: 'ops', members: ['cr@a.com'], compressedData: 'x' });
    await setDoc(doc(db, 'projects/p1/digests/2026-11-06'), { ...dg('approved'), week: '2026-11-06' });
  });
});

const as = (uid: string, email: string) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const cr = () => as('cr', 'cr@a.com');
const cr2 = () => as('cr2', 'cr2@a.com');
const od = () => as('od', 'od@a.com');
const designer = () => as('designer', 'd@a.com');
const ref = (db: any, week = WEEK) => doc(db, `projects/p1/digests/${week}`);

function dg(status: string, over: any = {}) {
  return {
    tenantId: STUDIO, projectId: 'p1', projectName: 'Sea Breeze', week: WEEK, status, subject: 'Your update', body: 'Hi Mrs Shah, here is how your home moved.',
    photos: [], sources: ['Weekly Pulse'], preparedBy: 'cr@a.com', preparedByName: 'Anushka', preparedAt: 1,
    reviewNote: null, approvedBy: null, approvedByName: null, approvedAt: null, sentAt: null, sentBy: null, sentVia: null, updatedAt: 1, ...over,
  };
}

describe('writing and sending for approval', () => {
  it('lets Client Relations on the project write and send it for approval', async () => {
    await assertSucceeds(setDoc(ref(cr()), dg('draft')));
    await assertSucceeds(setDoc(ref(cr()), dg('pending_review')));
    await assertSucceeds(getDoc(ref(cr())));
  });

  it('keeps out anyone not on the project, and Designers', async () => {
    await assertFails(setDoc(ref(cr2()), dg('draft')));
    await assertFails(getDoc(ref(cr2())));
    await assertFails(setDoc(ref(designer()), dg('draft')));
  });

  it('never lets the writer approve it, or mark it sent, or put money keys in', async () => {
    await assertFails(setDoc(ref(cr()), dg('approved', { approvedBy: 'cr@a.com' })));
    await assertFails(setDoc(ref(cr()), dg('pending_review', { approvedBy: 'od@a.com' })));
    await assertFails(setDoc(ref(cr()), dg('sent', { sentVia: 'whatsapp', sentBy: 'cr@a.com', sentAt: 2 })));
    await assertFails(setDoc(ref(cr()), dg('draft', { amount: 5000 })));
    await assertFails(setDoc(ref(cr()), dg('draft', { week: '2026-11-20' })));
  });
});

describe('approval', () => {
  beforeEach(async () => { await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(ref(ctx.firestore()), dg('pending_review')); }); });

  it('is the lead’s, in their own name', async () => {
    await assertFails(updateDoc(ref(cr()), { status: 'approved', approvedBy: 'cr@a.com' }));
    await assertFails(updateDoc(ref(od()), { status: 'approved', approvedBy: 'someone@a.com' }));
    await assertSucceeds(updateDoc(ref(od()), { status: 'approved', approvedBy: 'od@a.com', approvedByName: 'Anish', approvedAt: 2 }));
  });

  it('can be sent back with a note', async () => {
    await assertSucceeds(updateDoc(ref(od()), { status: 'returned', reviewNote: 'Add the laminate date' }));
    await assertSucceeds(updateDoc(ref(cr()), { status: 'pending_review', body: 'Hi Mrs Shah, the laminate arrives Friday.' }));
  });
});

describe('once approved', () => {
  const approved = (db: any) => doc(db, 'projects/p1/digests/2026-11-06');

  it('its words cannot change, and it cannot go back to draft', async () => {
    await assertFails(updateDoc(approved(cr()), { body: 'Something else' }));
    await assertFails(updateDoc(approved(cr()), { status: 'draft' }));
  });

  it('can be marked sent on WhatsApp, by the person who sent it, once', async () => {
    await assertFails(updateDoc(approved(cr()), { status: 'sent', sentVia: 'whatsapp', sentBy: 'od@a.com', sentAt: 3 }));
    await assertFails(updateDoc(approved(cr()), { status: 'sent', sentVia: 'email', sentBy: 'cr@a.com', sentAt: 3 }));
    await assertSucceeds(updateDoc(approved(cr()), { status: 'sent', sentVia: 'whatsapp', sentBy: 'cr@a.com', sentAt: 3, updatedAt: 3 }));
    await assertFails(updateDoc(approved(cr()), { status: 'draft' }));
  });

  it('is never deleted', async () => {
    await assertFails(deleteDoc(approved(od())));
  });
});
