/*
  The security lockdown, proven against the rules themselves.

  Runs in the local Firestore emulator against a throwaway "demo-" project, so
  it never touches live data:

    firebase emulators:exec --only firestore --project demo-security "npx vitest run firestore.security.test.ts"

  Each block is one hole that used to be open. The personas mirror the real
  ones: a stranger who signed in with Google and has no profile, a studio
  member, a studio Designer, a portal client, and the platform owner.
*/
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, collectionGroup, query, where, Timestamp } from 'firebase/firestore';

let env: RulesTestEnvironment;

const STUDIO = 'studio_a';
const OTHER = 'studio_b';
const OWNER_EMAIL = 'formfactors.operations@gmail.com';

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
    await setDoc(doc(db, 'users/designer'), { email: 'd@a.com', tenantId: STUDIO, role: 'Designer' });
    await setDoc(doc(db, 'users/client'), { email: 'c@x.com', tenantId: STUDIO, role: 'Client', projectIds: ['p1'] });
    await setDoc(doc(db, 'users/owner'), { email: OWNER_EMAIL, tenantId: STUDIO, role: 'Ops Director' });

    await setDoc(doc(db, 'projects/p1'), { tenantId: STUDIO, context: { name: 'P1', margin: 0.3 } });
    await setDoc(doc(db, 'projects/p2'), { tenantId: STUDIO, context: { name: 'P2' } });
    await setDoc(doc(db, 'projects/q1'), { tenantId: OTHER, context: { name: 'Q1' } });
    await setDoc(doc(db, 'projects/p1/portalView/current'), { context: { name: 'P1' } });

    await setDoc(doc(db, `organizations/${STUDIO}`), { orgName: 'Studio A', team: [{ email: 'm@a.com', role: 'Admin' }] });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1`), { tenantId: STUDIO });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1/siteVisits/v1`), { title: 'Visit', type: 'client_meeting' });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1/siteVisits/v2`), { title: 'Studio sync', type: 'internal_meeting' });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1/siteVisits/v3`), { title: 'Carpenter', type: 'vendor_meeting' });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1/moms/m1`), { status: 'shared', meetingType: 'client_meeting' });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1/moms/m3`), { status: 'shared', meetingType: 'internal_meeting' });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1/moms/m4`), { status: 'shared', meetingType: 'internal' });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p2/moms/m2`), { status: 'shared', meetingType: 'client_meeting' });
    await setDoc(doc(db, `master_data/item_bank_${STUDIO}`), { items: [{ rate: 1200 }] });

    const nextYear = Timestamp.fromDate(new Date(Date.now() + 365 * 86400000));
    await setDoc(doc(db, 'projects/p1/decisions/d1'), { status: 'drawing_sent', signoffToken: 'p1_d1_tok', tokenExpiresAt: nextYear });
    await setDoc(doc(db, 'projects/p2/decisions/d2'), { status: 'drawing_sent', signoffToken: 'p2_d2_tok', tokenExpiresAt: nextYear });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1/bookingPacks/b1`), { status: 'sent' });

    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1/drawingTracker/dw1`), {
      name: 'Kitchen Elevation', rounds: [], currentRound: 0, approvedAt: null, isMandatory: true,
    });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p1/boqItems/i1`), { rate: 1200 });
    await setDoc(doc(db, 'projects/p1/tierBoq/t1'), { boq: [{ rate: 1200 }] });
    await setDoc(doc(db, 'projects/p1/communicationLog/c1'), { note: 'Called client' });

    // The Designer's copies: assigned to p1, not to p2.
    await setDoc(doc(db, 'projects/p1/designView/current'), { tenantId: STUDIO, designers: ['d@a.com'], compressedData: 'x' });
    await setDoc(doc(db, 'projects/p2/designView/current'), { tenantId: STUDIO, designers: [], compressedData: 'x' });
    await setDoc(doc(db, 'projects/p1/designGate/g1'), { stage: 'concept' });
    await setDoc(doc(db, 'projects/p2/designGate/g2'), { stage: 'concept' });
    await setDoc(doc(db, `organizations/${STUDIO}/projects/p2/drawingTracker/dw9`), { name: 'Bedroom', rounds: [] });

    await setDoc(doc(db, 'users/otheradmin'), { email: 'o@b.com', tenantId: OTHER, role: 'Admin' });
    await setDoc(doc(db, `organizations/${STUDIO}/weeklyReports/w1`), { tenantId: STUDIO, status: 'published' });
    await setDoc(doc(db, `studioSettings/${STUDIO}`), { bankDetails: { accountNumber: '1' } });
    await setDoc(doc(db, 'publicProposals/tok1'), { total: 100 });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const stranger = () => env.authenticatedContext('stranger', { email: 's@evil.com', email_verified: true }).firestore();
const member = () => env.authenticatedContext('member', { email: 'm@a.com', email_verified: true }).firestore();
const designer = () => env.authenticatedContext('designer', { email: 'd@a.com', email_verified: true }).firestore();
const client = () => env.authenticatedContext('client', { email: 'c@x.com', email_verified: true }).firestore();
const otherAdmin = () => env.authenticatedContext('otheradmin', { email: 'o@b.com', email_verified: true }).firestore();
const owner = (verified = true) => env.authenticatedContext('owner', { email: OWNER_EMAIL, email_verified: verified }).firestore();

describe('projects are no longer public', () => {
  it('refuses a visitor who is not signed in', async () => {
    await assertFails(getDoc(doc(anon(), 'projects/p1')));
    await assertFails(getDocs(collection(anon(), 'projects')));
  });
  it('refuses a stranger signed in with Google', async () => {
    await assertFails(getDoc(doc(stranger(), 'projects/p1')));
  });
  it('refuses a portal client, who reads portalView instead', async () => {
    await assertFails(getDoc(doc(client(), 'projects/p1')));
    await assertSucceeds(getDoc(doc(client(), 'projects/p1/portalView/current')));
    await assertFails(getDoc(doc(client(), 'projects/p2/portalView/current')));
  });
  it('lets a studio read its own projects, and only its own', async () => {
    await assertSucceeds(getDoc(doc(member(), 'projects/p1')));
    await assertFails(getDoc(doc(member(), 'projects/q1')));
    await assertSucceeds(getDocs(query(collection(member(), 'projects'), where('tenantId', '==', STUDIO))));
    await assertFails(getDocs(collection(member(), 'projects')));
  });
  it('lets the verified platform owner read any project', async () => {
    await assertSucceeds(getDoc(doc(owner(), 'projects/q1')));
  });
  it('does not accept the owner address unverified', async () => {
    await assertFails(getDoc(doc(owner(false), 'projects/q1')));
  });
});

describe('nobody grants themselves a role', () => {
  it('lets a newcomer start a profile with no privilege', async () => {
    await assertSucceeds(setDoc(doc(stranger(), 'users/stranger'), { email: 's@evil.com', lastSeenAt: 1 }));
  });
  it('refuses a newcomer who names a studio or a role', async () => {
    await assertFails(setDoc(doc(stranger(), 'users/stranger'), { email: 's@evil.com', tenantId: STUDIO, role: 'Admin' }));
    await assertFails(setDoc(doc(stranger(), 'users/stranger'), { role: 'Super Admin' }));
  });
  it('refuses a studio member raising their own role', async () => {
    await assertFails(updateDoc(doc(designer(), 'users/designer'), { role: 'Super Admin' }));
    await assertFails(updateDoc(doc(designer(), 'users/designer'), { tenantId: OTHER }));
  });
  it('still lets a member change their own display fields', async () => {
    await assertSucceeds(updateDoc(doc(designer(), 'users/designer'), { displayName: 'D', lastSeenAt: 2 }));
  });
  it('refuses a client adding a project to their own list', async () => {
    await assertFails(updateDoc(doc(client(), 'users/client'), { projectIds: ['p1', 'p2'] }));
  });
});

describe('clients stay inside their own project', () => {
  it('refuses the studio copy of projects and the item bank', async () => {
    await assertFails(getDoc(doc(client(), `organizations/${STUDIO}/projects/p1`)));
    await assertFails(getDocs(collection(client(), `organizations/${STUDIO}/projects`)));
    await assertFails(getDoc(doc(client(), `master_data/item_bank_${STUDIO}`)));
  });
  it('reads site visits and minutes for their project only', async () => {
    const VISIT_TYPES = ['client_meeting', 'site_visit', 'measurement_survey'];
    const MOM_TYPES = ['client_meeting', 'site_visit', 'measurement_survey', 'client'];
    await assertSucceeds(getDocs(query(collection(client(), `organizations/${STUDIO}/projects/p1/siteVisits`), where('type', 'in', VISIT_TYPES))));
    await assertSucceeds(getDocs(query(collection(client(), `organizations/${STUDIO}/projects/p1/moms`), where('meetingType', 'in', MOM_TYPES))));
    await assertFails(getDocs(query(collection(client(), `organizations/${STUDIO}/projects/p2/moms`), where('meetingType', 'in', MOM_TYPES))));
  });
  it('never reads internal or vendor meetings, or their minutes', async () => {
    await assertSucceeds(getDoc(doc(client(), `organizations/${STUDIO}/projects/p1/siteVisits/v1`)));
    await assertFails(getDoc(doc(client(), `organizations/${STUDIO}/projects/p1/siteVisits/v2`)));
    await assertFails(getDoc(doc(client(), `organizations/${STUDIO}/projects/p1/siteVisits/v3`)));
    await assertFails(getDoc(doc(client(), `organizations/${STUDIO}/projects/p1/moms/m3`)));
    await assertFails(getDoc(doc(client(), `organizations/${STUDIO}/projects/p1/moms/m4`)));
    // An open query would include them, so it is refused as a whole.
    await assertFails(getDocs(collection(client(), `organizations/${STUDIO}/projects/p1/siteVisits`)));
    await assertFails(getDocs(collection(client(), `organizations/${STUDIO}/projects/p1/moms`)));
    // Nor can they acknowledge an internal MoM.
    await assertFails(updateDoc(doc(client(), `organizations/${STUDIO}/projects/p1/moms/m3`), {
      status: 'acknowledged', acknowledgedBy: 'C', acknowledgedAt: 3, ackChannel: 'client_portal',
    }));
  });
  it('the studio still reads its internal meetings', async () => {
    await assertSucceeds(getDoc(doc(member(), `organizations/${STUDIO}/projects/p1/siteVisits/v2`)));
    await assertSucceeds(getDoc(doc(member(), `organizations/${STUDIO}/projects/p1/moms/m3`)));
  });
  it('acknowledges minutes, and changes nothing else', async () => {
    await assertSucceeds(updateDoc(doc(client(), `organizations/${STUDIO}/projects/p1/moms/m1`), {
      status: 'acknowledged', acknowledgedBy: 'C', acknowledgedAt: 3, ackChannel: 'client_portal',
    }));
    await assertFails(updateDoc(doc(client(), `organizations/${STUDIO}/projects/p1/moms/m1`), { summary: 'rewritten' }));
  });
  it('asks for a correction, and changes nothing else', async () => {
    const m1 = `organizations/${STUDIO}/projects/p1/moms/m1`;
    // Not with an empty request, not alongside other fields, not with another status.
    await assertFails(updateDoc(doc(client(), m1), { status: 'correction_requested', correctionRequest: { text: '', by: 'C', at: 1 } }));
    await assertFails(updateDoc(doc(client(), m1), { status: 'correction_requested', correctionRequest: { text: 'Fix it', by: 'C', at: 1 }, summary: 'mine' }));
    await assertFails(updateDoc(doc(client(), m1), { status: 'draft', correctionRequest: { text: 'Fix it', by: 'C', at: 1 } }));
    await assertSucceeds(updateDoc(doc(client(), m1), { status: 'correction_requested', correctionRequest: { text: 'Handle finish was black, not brass', by: 'C', at: 1 } }));
    // While it is open they cannot acknowledge, or pile on another request.
    await assertFails(updateDoc(doc(client(), m1), { status: 'acknowledged', acknowledgedBy: 'C', acknowledgedAt: 3, ackChannel: 'client_portal' }));
    await assertFails(updateDoc(doc(client(), m1), { status: 'correction_requested', correctionRequest: { text: 'Again', by: 'C', at: 2 } }));
    // Nor on an internal meeting's minutes.
    await assertFails(updateDoc(doc(client(), `organizations/${STUDIO}/projects/p1/moms/m3`), { status: 'correction_requested', correctionRequest: { text: 'x', by: 'C', at: 1 } }));
  });
  it('cannot acknowledge a draft, or set any other status', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `organizations/${STUDIO}/projects/p1/moms/m5`), { status: 'draft', meetingType: 'client_meeting' });
    });
    await assertFails(updateDoc(doc(client(), `organizations/${STUDIO}/projects/p1/moms/m5`), { status: 'acknowledged', acknowledgedBy: 'C', acknowledgedAt: 3, ackChannel: 'client_portal' }));
    await assertFails(updateDoc(doc(client(), `organizations/${STUDIO}/projects/p1/moms/m1`), { status: 'finalised', acknowledgedBy: 'C', acknowledgedAt: 3, ackChannel: 'client_portal' }));
  });
  it('the studio itself still reads everything of its own', async () => {
    await assertSucceeds(getDoc(doc(member(), `organizations/${STUDIO}/projects/p1`)));
    await assertSucceeds(getDoc(doc(member(), `master_data/item_bank_${STUDIO}`)));
  });
});

describe('studio profiles and team lists', () => {
  it('are not readable by the public or by other studios', async () => {
    await assertFails(getDoc(doc(anon(), `organizations/${STUDIO}`)));
    await assertFails(getDoc(doc(stranger(), `organizations/${STUDIO}`)));
    await assertSucceeds(getDoc(doc(member(), `organizations/${STUDIO}`)));
  });
  it('are not readable by the studio\'s clients (the team list is on it)', async () => {
    await assertFails(getDoc(doc(client(), `organizations/${STUDIO}`)));
  });
  it('cannot be created by anyone but the platform owner', async () => {
    await assertFails(setDoc(doc(stranger(), 'organizations/new_tenant'), { orgName: 'Mine', team: [] }));
    await assertSucceeds(setDoc(doc(owner(), 'organizations/new_tenant'), { orgName: 'New' }));
  });
  it('let only senior roles change who is on the team', async () => {
    await assertFails(updateDoc(doc(designer(), `organizations/${STUDIO}`), { team: [{ email: 'friend@x.com', role: 'Owner' }] }));
    // A Designer is view-only on the studio profile altogether.
    await assertFails(updateDoc(doc(designer(), `organizations/${STUDIO}`), { contactPhone: '123' }));
    await assertSucceeds(updateDoc(doc(member(), `organizations/${STUDIO}`), { team: [{ email: 'new@a.com', role: 'Designer' }] }));
  });
  it('let only senior roles assign Designers to projects', async () => {
    await assertFails(updateDoc(doc(designer(), `organizations/${STUDIO}`), { projectDesigners: { p1: ['d@a.com'] } }));
    await assertSucceeds(updateDoc(doc(member(), `organizations/${STUDIO}`), { projectDesigners: { p1: ['d@a.com'] } }));
  });
});

describe('decisions: the portal keeps working, the public listing is gone', () => {
  it('lets a client read and answer a decision on their own project', async () => {
    await assertSucceeds(getDoc(doc(client(), 'projects/p1/decisions/d1')));
    await assertSucceeds(updateDoc(doc(client(), 'projects/p1/decisions/d1'), {
      status: 'signed', signoff: { type: 'approved', clientNameEntered: 'C' },
    }));
  });
  it('refuses a client on another project, or touching other fields', async () => {
    await assertFails(getDoc(doc(client(), 'projects/p2/decisions/d2')));
    await assertFails(updateDoc(doc(client(), 'projects/p1/decisions/d1'), { status: 'signed', cost: 0 }));
    await assertFails(updateDoc(doc(client(), 'projects/p1/decisions/d1'), { status: 'approved_by_studio' }));
  });
  it('refuses listing every open decision without signing in', async () => {
    await assertFails(getDocs(query(collectionGroup(anon(), 'decisions'), where('tokenExpiresAt', '>', Timestamp.now()))));
    await assertFails(getDocs(query(collectionGroup(stranger(), 'decisions'), where('tokenExpiresAt', '>', Timestamp.now()))));
  });
});

describe('a Designer reads their own projects, without the money, and changes only drawings', () => {
  const dt = (db: any) => doc(db, `organizations/${STUDIO}/projects/p1/drawingTracker/dw1`);
  it('reads the design copy of an assigned project, one or as a list of their own', async () => {
    await assertSucceeds(getDoc(doc(designer(), 'projects/p1/designView/current')));
    await assertSucceeds(getDocs(query(collectionGroup(designer(), 'designView'),
      where('tenantId', '==', STUDIO), where('designers', 'array-contains', 'd@a.com'))));
    await assertSucceeds(getDoc(doc(designer(), 'projects/p1/designGate/g1')));
    await assertSucceeds(getDoc(dt(designer())));
  });
  it('does not read a project they are not assigned to', async () => {
    await assertFails(getDoc(doc(designer(), 'projects/p2/designView/current')));
    await assertFails(getDoc(doc(designer(), 'projects/p2/designGate/g2')));
    await assertFails(getDoc(doc(designer(), `organizations/${STUDIO}/projects/p2/drawingTracker/dw9`)));
    await assertFails(getDocs(query(collectionGroup(designer(), 'designView'), where('tenantId', '==', STUDIO))));
  });
  it('does not read the project itself, its money, the studio copy or the item bank', async () => {
    await assertFails(getDoc(doc(designer(), 'projects/p1')));
    await assertFails(getDocs(query(collection(designer(), 'projects'), where('tenantId', '==', STUDIO))));
    await assertFails(getDoc(doc(designer(), `organizations/${STUDIO}/projects/p1`)));
    await assertFails(getDoc(doc(designer(), 'projects/p1/tierBoq/t1')));
    await assertFails(getDoc(doc(designer(), 'projects/p1/portalView/current')));
    await assertFails(getDoc(doc(designer(), 'projects/p1/communicationLog/c1')));
    await assertFails(getDoc(doc(designer(), `organizations/${STUDIO}/projects/p1/boqItems/i1`)));
    await assertFails(getDoc(doc(designer(), `master_data/item_bank_${STUDIO}`)));
    await assertFails(getDoc(doc(designer(), 'projects/q1')));
  });
  it('cannot write the design copy -- nobody can but the server', async () => {
    await assertFails(setDoc(doc(designer(), 'projects/p1/designView/current'), { designers: ['d@a.com'] }));
    await assertFails(setDoc(doc(member(), 'projects/p2/designView/current'), { designers: ['d@a.com'] }));
    await assertSucceeds(getDoc(doc(member(), 'projects/p2/designView/current')));
  });
  it('cannot change the project, its records or the studio', async () => {
    await assertFails(updateDoc(doc(designer(), 'projects/p1'), { context: { name: 'Renamed' } }));
    await assertFails(updateDoc(doc(designer(), `organizations/${STUDIO}/projects/p1`), { note: 'x' }));
    await assertFails(setDoc(doc(designer(), 'projects/p1/communicationLog/c2'), { note: 'x' }));
    await assertFails(updateDoc(doc(designer(), `organizations/${STUDIO}`), { contactPhone: '1' }));
  });
  it('works a drawing on an assigned project: submits for review, logs a round, attaches a link', async () => {
    await assertSucceeds(updateDoc(dt(designer()), { pendingReview: { roundNumber: 1, submittedAt: 1, submittedBy: 'D' } }));
    await assertSucceeds(updateDoc(dt(designer()), { driveUrl: 'https://drive/x', rounds: [{ roundNumber: 1, status: 'not_started' }] }));
    await assertSucceeds(setDoc(doc(designer(), `organizations/${STUDIO}/projects/p1/drawingTracker/dw1/revisions/r1`), { note: 'x' }));
    await assertFails(updateDoc(doc(designer(), `organizations/${STUDIO}/projects/p2/drawingTracker/dw9`), { driveUrl: 'x' }));
  });
  it('cannot approve, release GFC, redefine or add drawings', async () => {
    await assertFails(updateDoc(dt(designer()), { approvedAt: 123 }));
    await assertFails(updateDoc(dt(designer()), { gfc: { status: 'issued' } }));
    await assertFails(updateDoc(dt(designer()), { name: 'Renamed' }));
    await assertFails(setDoc(doc(designer(), `organizations/${STUDIO}/projects/p1/drawingTracker/dw2`), { name: 'New' }));
  });
  it('the studio still approves', async () => {
    await assertSucceeds(updateDoc(dt(member()), { approvedAt: 123 }));
  });
});

describe("another studio cannot take over a project", () => {
  it('refuses rewriting a project of another studio, even naming itself as the owner', async () => {
    await assertFails(updateDoc(doc(otherAdmin(), 'projects/p1'), { tenantId: OTHER, context: { name: 'Mine' } }));
    await assertFails(setDoc(doc(otherAdmin(), 'projects/p1'), { tenantId: OTHER }));
  });
  it('still lets a studio save its own', async () => {
    await assertSucceeds(updateDoc(doc(otherAdmin(), 'projects/q1'), { context: { name: 'Q1 renamed' } }));
    await assertSucceeds(updateDoc(doc(member(), 'projects/p1'), { context: { name: 'P1 renamed' } }));
  });
});

describe('nothing left readable without signing in', () => {
  it('published weekly reports, studio settings, public proposals', async () => {
    await assertFails(getDoc(doc(anon(), `organizations/${STUDIO}/weeklyReports/w1`)));
    await assertFails(getDoc(doc(stranger(), `organizations/${STUDIO}/weeklyReports/w1`)));
    await assertFails(getDoc(doc(anon(), `studioSettings/${STUDIO}`)));
    await assertFails(getDoc(doc(client(), `studioSettings/${STUDIO}`)));
    await assertFails(getDoc(doc(anon(), 'publicProposals/tok1')));
    await assertSucceeds(getDoc(doc(member(), `organizations/${STUDIO}/weeklyReports/w1`)));
    await assertSucceeds(getDoc(doc(member(), `studioSettings/${STUDIO}`)));
  });
});

describe('booking packs are studio-only', () => {
  it('refuses the public, and lets the studio in', async () => {
    await assertFails(getDoc(doc(anon(), `organizations/${STUDIO}/projects/p1/bookingPacks/b1`)));
    await assertFails(updateDoc(doc(anon(), `organizations/${STUDIO}/projects/p1/bookingPacks/b1`), { status: 'approved' }));
    await assertSucceeds(getDoc(doc(member(), `organizations/${STUDIO}/projects/p1/bookingPacks/b1`)));
  });
});

describe('Zoho Books credentials are server-only', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `zohoBooksConnections/${STUDIO}`), { clientSecret: 'secret', refreshToken: 'token' });
      await setDoc(doc(db, `zohoInvoiceLinks/${STUDIO}__p1__m1`), { invoiceId: 'I1' });
    });
  });

  it('refuses everyone, including the studio that owns the connection', async () => {
    for (const db of [anon(), stranger(), client(), designer(), member(), otherAdmin(), owner()]) {
      await assertFails(getDoc(doc(db, `zohoBooksConnections/${STUDIO}`)));
      await assertFails(getDoc(doc(db, `zohoInvoiceLinks/${STUDIO}__p1__m1`)));
    }
  });

  it('refuses a write, so a studio cannot point the add-in at someone else\'s books', async () => {
    await assertFails(setDoc(doc(member(), `zohoBooksConnections/${STUDIO}`), { refreshToken: 'mine' }));
    await assertFails(setDoc(doc(owner(), `zohoBooksConnections/${OTHER}`), { refreshToken: 'mine' }));
    await assertFails(setDoc(doc(member(), `zohoInvoiceLinks/${STUDIO}__p1__m9`), { invoiceId: 'X' }));
  });
});
