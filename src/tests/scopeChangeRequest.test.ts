import { describe, it, expect } from 'vitest';
import {
  requestChangesPatch, ChangeRequestRefused, isSentBack, sentBackBlock, previousSentBack, sentBackHistory,
} from '../../lib/scopeChangeRequest';
import { mergeClientOwned } from '../../lib/clientOwned';
import { recordAgreement } from '../../lib/scopeAgreement';
import { resolveDocumentState } from '../../services/documentIssueEngine';
import { documentStatusLabel } from '../../services/documentReleaseEngine';
import { findPortalDrift } from '../../lib/portalReconcile';

/*
  A client sending a Scope Revision back for changes, as Unique Vistas would:
  Scope Revision 2 (v2 ₹24,30,121 → v3 ₹25,46,282) is in their portal, and
  they do not agree with it. Nothing in force may move, the version may not be
  approved afterwards, and the studio's auto-save may not erase the request.
*/

const revision = (over: any = {}): any => ({
  id: 'iss-sr2',
  kind: 'scope_revision',
  version: 2,
  reference: 'DOC-BQ-2026-UV-v2-REV-02',
  issuedAt: Date.parse('2026-10-18T10:00:00Z'),
  issuedBy: 'Anish K',
  contentHash: 'hash-v3',
  materialSections: [],
  clientVisibility: { state: 'published' },
  snapshot: { number: 2, v1: { total: 2430121, reference: 'DOC-BQ-2026-UV-v2' }, v2: { total: 2546282, version: 3 } },
  ...over,
});

const project = (issue: any = revision()): any => ({
  name: 'Unique Vistas',
  approvedTierId: 'tier-v2',
  financials: { approvedExecutionValue: 2430121, approvedDesignValue: 250000 },
  paymentSchedules: [{ id: 'ps1', executionValue: 2430121 }],
  scopeRevisions: [{ id: 'srev-2', number: 2, status: 'issued', issueId: issue.id }],
  documents: { issues: [issue], queries: [], lastViewedAt: {} },
  clientMessages: [],
});

const at = () => new Date('2026-10-21T10:42:00Z');
const ask = (over: any = {}) => ({
  name: 'Mr Prasad Naik',
  message: 'Please keep the master bedroom wardrobe as in v2 and recheck the living room ceiling area.',
  topics: ['quantities', 'specification', 'not-a-topic'],
  contentHash: 'hash-v3',
  ...over,
});
const meta = { email: 'naikprasadu@gmail.com', ip: '203.0.113.9', userAgent: 'Chrome', via: 'portal' as const };

const refusal = (fn: () => any) => {
  try { fn(); } catch (e) { return e as ChangeRequestRefused; }
  throw new Error('expected a refusal');
};

describe('sending a scope revision back for changes', () => {
  it('records the request on the issue, with who, when and what they read', () => {
    const next = requestChangesPatch('iss-sr2', ask(), meta, at)(project());
    const req = next.documents.issues[0].changesRequested;
    expect(req).toMatchObject({
      name: 'Mr Prasad Naik',
      email: 'naikprasadu@gmail.com',
      at: '2026-10-21T10:42:00.000Z',
      ip: '203.0.113.9',
      contentHash: 'hash-v3',
      reference: 'DOC-BQ-2026-UV-v2-REV-02',
      via: 'portal',
    });
    /* Only the closed set of topics survives. */
    expect(req.topics).toEqual(['quantities', 'specification']);
    expect(isSentBack(next.documents.issues[0])).toBe(true);
  });

  it('changes nothing in force: scope, financials, payment schedule and the revision record stay as they were', () => {
    const before = project();
    const next = requestChangesPatch('iss-sr2', ask(), meta, at)(before);
    expect(next.approvedTierId).toBe(before.approvedTierId);
    expect(next.financials).toBe(before.financials);
    expect(next.paymentSchedules).toBe(before.paymentSchedules);
    expect(next.scopeRevisions).toBe(before.scopeRevisions);
    const issue = next.documents.issues[0];
    expect(issue.clientSignature).toBeUndefined();
    expect(issue.recordedApproval).toBeUndefined();
    expect(issue.snapshot).toBe(before.documents.issues[0].snapshot);
  });

  it('tells the studio in Client Comms, as an unanswered message', () => {
    const next = requestChangesPatch('iss-sr2', ask(), meta, at)(project());
    expect(next.clientMessages).toHaveLength(1);
    expect(next.clientMessages[0]).toMatchObject({ aboutKind: 'document', aboutId: 'iss-sr2', readAt: null, sentBy: 'Mr Prasad Naik' });
    expect(next.clientMessages[0].text).toContain('Scope Revision 2');
    expect(next.clientMessages[0].text).toContain('master bedroom wardrobe');
  });

  it('needs a real note and a name', () => {
    expect(refusal(() => requestChangesPatch('iss-sr2', ask({ message: 'no' }), meta, at)).code).toBe('invalid-argument');
    expect(refusal(() => requestChangesPatch('iss-sr2', ask({ name: ' ' }), meta, at)).code).toBe('invalid-argument');
  });

  it('can be done once per version', () => {
    const once = requestChangesPatch('iss-sr2', ask(), meta, at)(project());
    expect(refusal(() => requestChangesPatch('iss-sr2', ask(), meta, at)(once)).code).toBe('already-exists');
  });

  it('is refused on an approved, withdrawn, unpublished, changed or non-revision document', () => {
    const run = (issue: any, input: any = ask()) => refusal(() => requestChangesPatch(issue.id, input, meta, at)(project(issue))).code;
    expect(run(revision({ clientSignature: { signatoryName: 'X' } }))).toBe('already-exists');
    expect(run(revision({ recordedApproval: { approvedAt: 1 } }))).toBe('already-exists');
    expect(run(revision({ withdrawnAt: 1 }))).toBe('failed-precondition');
    expect(run(revision({ clientVisibility: { state: 'draft' } }))).toBe('failed-precondition');
    expect(run(revision(), ask({ contentHash: 'an-older-hash' }))).toBe('failed-precondition');
    expect(run(revision({ kind: 'detailed_boq' }))).toBe('failed-precondition');
    expect(refusal(() => requestChangesPatch('missing', ask(), meta, at)(project())).code).toBe('not-found');
  });
});

describe('a version that was sent back', () => {
  const sent = () => requestChangesPatch('iss-sr2', ask(), meta, at)(project());

  it('cannot be approved', () => {
    expect(sentBackBlock(sent().documents.issues[0])).toMatch(/sent this version back/);
    expect(sentBackBlock(revision())).toBeNull();
  });

  it('cannot be recorded as agreed by the studio', () => {
    const next = recordAgreement('iss-sr2', { approvedAt: 1, recordedBy: 'Anish K', how: 'whatsapp', note: 'ok' })(sent());
    expect(next.documents!.issues[0].recordedApproval).toBeUndefined();
  });

  it('reads as with the studio, not as waiting for the client', () => {
    const ctx = sent();
    expect(resolveDocumentState(ctx, 'scope_revision')).toBe('queried');
    expect(documentStatusLabel('queried', 'scope_revision', 'client')).toBe('With the studio for changes');
    expect(documentStatusLabel('queried', 'scope_revision', 'studio')).toBe('Sent back for changes');
    expect(documentStatusLabel('queried', 'terms_docket', 'client')).toBe('Your question is with the studio');
  });

  it("survives a studio auto-save from a session that loaded before it arrived", () => {
    const studio = project();
    const merged = mergeClientOwned(studio, sent());
    expect(merged.documents.issues[0].changesRequested?.name).toBe('Mr Prasad Naik');
    expect(merged.clientMessages).toHaveLength(1);
  });

  it('stays on the issue after the studio withdraws it to revise', () => {
    const withdrawn = sent();
    withdrawn.documents.issues[0] = { ...withdrawn.documents.issues[0], withdrawnAt: 2 };
    const merged = mergeClientOwned(withdrawn, sent());
    expect(merged.documents.issues[0].withdrawnAt).toBe(2);
    expect(merged.documents.issues[0].changesRequested).toBeTruthy();
  });

  it('is found by the portal reconcile sweep when the project lost it', () => {
    const drift = findPortalDrift(project(), sent());
    expect(drift?.findings.some(f => f.detail.startsWith('sent back for changes'))).toBe(true);
  });
});

describe('the next version', () => {
  it('knows which sent-back version it answers, and the studio sees every request', () => {
    const first = requestChangesPatch('iss-sr2', ask(), meta, at)(project()).documents.issues[0];
    const resent = revision({ id: 'iss-sr2b', version: 3, issuedAt: Date.parse('2026-10-23T10:00:00Z'), contentHash: 'hash-v3b' });
    const issues = [{ ...first, withdrawnAt: 3 }, resent];
    expect(previousSentBack(issues, resent)?.id).toBe('iss-sr2');
    expect(previousSentBack(issues, first)).toBeNull();
    expect(sentBackHistory(issues, 2).map(h => h.issue.id)).toEqual(['iss-sr2']);
    expect(sentBackHistory(issues, 3)).toEqual([]);
  });
});
