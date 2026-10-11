/*
  Client Relations, Site Supervisor and Vendor: assigned projects only, and
  only the copy the server makes for each, proven against the rules.

    firebase emulators:exec --only firestore --project demo-security "npx vitest run teamAccess.security.test.ts"
*/
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, collectionGroup, query, where } from 'firebase/firestore';

let env: RulesTestEnvironment;
const STUDIO = 'studio_a';
const OTHER = 'studio_b';

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
    await setDoc(doc(db, 'users/member'), { email: 'm@a.com', tenantId: STUDIO, role: 'Admin' });
    await setDoc(doc(db, 'users/cr'), { email: 'cr@a.com', tenantId: STUDIO, role: 'Client Relations' });
    await setDoc(doc(db, 'users/sup'), { email: 's@a.com', tenantId: STUDIO, role: 'Site Supervisor' });
    await setDoc(doc(db, 'users/vendor'), { email: 'v@a.com', tenantId: STUDIO, role: 'Vendor' });
    await setDoc(doc(db, 'users/head'), { email: 'h@a.com', tenantId: STUDIO, role: 'Design Head' });
    await setDoc(doc(db, 'users/crOther'), { email: 'cr@b.com', tenantId: OTHER, role: 'Client Relations' });

    await setDoc(doc(db, `organizations/${STUDIO}`), { orgName: 'Studio A', team: [] });
    await setDoc(doc(db, `organizations/${STUDIO}/settings/general`), { theme: 'x' });
    for (const p of ['p1', 'p2']) {
      await setDoc(doc(db, `projects/${p}`), { tenantId: STUDIO, context: { name: p, margin: 0.3 } });
      await setDoc(doc(db, `organizations/${STUDIO}/projects/${p}`), { tenantId: STUDIO });
      await setDoc(doc(db, `projects/${p}/communicationLog/c1`), { note: 'Called client' });
      await setDoc(doc(db, `projects/${p}/timelinePhases/t1`), { name: 'Carpentry' });
      await setDoc(doc(db, `projects/${p}/tierBoq/t1`), { boq: [{ rate: 1200 }] });
      await setDoc(doc(db, `projects/${p}/engagement/current`), { engagement: { fee: 1 } });
      await setDoc(doc(db, `projects/${p}/paymentRequests/r1`), { amount: 50000 });
      await setDoc(doc(db, `projects/${p}/marginAnalytics/a1`), { margin: 0.3 });
      await setDoc(doc(db, `organizations/${STUDIO}/projects/${p}/drawingTracker/dw1`), { name: 'Kitchen' });
      await setDoc(doc(db, `organizations/${STUDIO}/projects/${p}/boqItems/i1`), { rate: 1200 });
      await setDoc(doc(db, `organizations/${STUDIO}/projects/${p}/moms/m1`), { status: 'shared', meetingType: 'client_meeting' });
    }
    // Assigned to p1 only, each in the copy of their own kind.
    await setDoc(doc(db, 'projects/p1/teamView/ops'), { tenantId: STUDIO, kind: 'ops', members: ['cr@a.com', 's@a.com'], compressedData: 'x' });
    await setDoc(doc(db, 'projects/p1/teamView/site'), { tenantId: STUDIO, kind: 'site', members: ['s@a.com', 'cr@a.com'], compressedData: 'x' });
    await setDoc(doc(db, 'projects/p2/teamView/ops'), { tenantId: STUDIO, kind: 'ops', members: [], compressedData: 'x' });
    await setDoc(doc(db, 'projects/p2/teamView/site'), { tenantId: STUDIO, kind: 'site', members: [], compressedData: 'x' });
    await setDoc(doc(db, `master_data/item_bank_${STUDIO}`), { items: [{ rate: 1200 }] });
  });
});

const as = (uid: string, email: string) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const cr = () => as('cr', 'cr@a.com');
const sup = () => as('sup', 's@a.com');
const vendor = () => as('vendor', 'v@a.com');
const head = () => as('head', 'h@a.com');
const member = () => as('member', 'm@a.com');

describe('Client Relations', () => {
  it('reads its own copy of an assigned project, and not the project', async () => {
    await assertSucceeds(getDoc(doc(cr(), 'projects/p1/teamView/ops')));
    await assertFails(getDoc(doc(cr(), 'projects/p1/teamView/site')));
    await assertFails(getDoc(doc(cr(), 'projects/p2/teamView/ops')));
    await assertFails(getDoc(doc(cr(), 'projects/p1')));
    await assertFails(getDoc(doc(cr(), `organizations/${STUDIO}/projects/p1`)));
    await assertFails(getDocs(collection(cr(), 'projects')));
  });

  it('lists exactly its own copies', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(cr(), 'teamView'),
      where('tenantId', '==', STUDIO), where('kind', '==', 'ops'), where('members', 'array-contains', 'cr@a.com'))));
    await assertFails(getDocs(query(collectionGroup(cr(), 'teamView'), where('tenantId', '==', STUDIO))));
    await assertFails(getDocs(query(collectionGroup(as('crOther', 'cr@b.com'), 'teamView'),
      where('tenantId', '==', STUDIO), where('kind', '==', 'ops'), where('members', 'array-contains', 'cr@b.com'))));
  });

  it('reads the client records of an assigned project, under either parent', async () => {
    await assertSucceeds(getDoc(doc(cr(), 'projects/p1/communicationLog/c1')));
    await assertSucceeds(getDoc(doc(cr(), 'projects/p1/timelinePhases/t1')));
    await assertSucceeds(getDoc(doc(cr(), `organizations/${STUDIO}/projects/p1/drawingTracker/dw1`)));
    await assertSucceeds(getDoc(doc(cr(), `organizations/${STUDIO}/projects/p1/moms/m1`)));
    await assertFails(getDoc(doc(cr(), 'projects/p2/communicationLog/c1')));
    await assertFails(getDoc(doc(cr(), `organizations/${STUDIO}/projects/p2/drawingTracker/dw1`)));
  });

  it('never reads the money behind a project', async () => {
    for (const path of ['projects/p1/tierBoq/t1', 'projects/p1/engagement/current', 'projects/p1/paymentRequests/r1',
      'projects/p1/marginAnalytics/a1', `organizations/${STUDIO}/projects/p1/boqItems/i1`, `master_data/item_bank_${STUDIO}`]) {
      await assertFails(getDoc(doc(cr(), path)));
    }
  });

  it('writes nothing yet: not the project, its records or its copy', async () => {
    await assertFails(updateDoc(doc(cr(), 'projects/p1'), { 'context.name': 'x' }));
    await assertFails(setDoc(doc(cr(), 'projects/p1/communicationLog/c2'), { note: 'x' }));
    await assertFails(setDoc(doc(cr(), 'projects/p1/teamView/ops'), { tenantId: STUDIO, members: ['cr@a.com'] }));
    await assertFails(setDoc(doc(cr(), 'projects/p9'), { tenantId: STUDIO }));
  });

  it('reads the studio profile and settings, and cannot change the team', async () => {
    await assertSucceeds(getDoc(doc(cr(), `organizations/${STUDIO}`)));
    await assertSucceeds(getDoc(doc(cr(), `organizations/${STUDIO}/settings/general`)));
    await assertFails(updateDoc(doc(cr(), `organizations/${STUDIO}`), { projectDesigners: { p2: ['cr@a.com'] } }));
  });
});

describe('Site Supervisor', () => {
  it('reads its site copy of an assigned project, and nothing with money', async () => {
    await assertSucceeds(getDoc(doc(sup(), 'projects/p1/teamView/site')));
    await assertFails(getDoc(doc(sup(), 'projects/p1/teamView/ops')));
    await assertFails(getDoc(doc(sup(), 'projects/p2/teamView/site')));
    await assertFails(getDoc(doc(sup(), 'projects/p1')));
    await assertSucceeds(getDoc(doc(sup(), 'projects/p1/timelinePhases/t1')));
    await assertSucceeds(getDoc(doc(sup(), `organizations/${STUDIO}/projects/p1/drawingTracker/dw1`)));
    await assertFails(getDoc(doc(sup(), 'projects/p1/communicationLog/c1')));
    await assertFails(getDoc(doc(sup(), 'projects/p1/tierBoq/t1')));
  });

  it('cannot save the project from the browser any more', async () => {
    await assertFails(updateDoc(doc(sup(), 'projects/p1'), { 'activeProject.status': 'x' }));
    await assertFails(setDoc(doc(sup(), `organizations/${STUDIO}/projects/p1`), { tenantId: STUDIO }));
  });
});

describe('Vendor', () => {
  it('reads no project at all', async () => {
    await assertFails(getDoc(doc(vendor(), 'projects/p1')));
    await assertFails(getDoc(doc(vendor(), 'projects/p1/teamView/ops')));
    await assertFails(getDoc(doc(vendor(), 'projects/p1/communicationLog/c1')));
    await assertFails(getDoc(doc(vendor(), `organizations/${STUDIO}/projects/p1/boqItems/i1`)));
    await assertFails(getDoc(doc(vendor(), `master_data/item_bank_${STUDIO}`)));
  });
});

describe('the broad roles are unchanged', () => {
  it('an Admin and a Design Head still read and save projects', async () => {
    await assertSucceeds(getDoc(doc(member(), 'projects/p1')));
    await assertSucceeds(getDoc(doc(head(), 'projects/p2')));
    await assertSucceeds(getDoc(doc(head(), 'projects/p1/teamView/ops')));
    await assertSucceeds(updateDoc(doc(member(), 'projects/p1'), { 'context.name': 'P1b', tenantId: STUDIO }));
    await assertSucceeds(getDoc(doc(member(), 'projects/p1/tierBoq/t1')));
  });
});
