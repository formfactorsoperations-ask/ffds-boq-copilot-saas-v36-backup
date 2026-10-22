import { describe, it, expect } from 'vitest';
import {
  trackerPatch, isApprovedSheet, finalApprovalAt, strayApprovalPatch,
  type ReviewSummary, type ReviewState, type TrackerFields, type ClientAgreement,
} from '../../lib/drawingReview';
import { agreementsFrom } from '../../lib/designMeeting';

/*
  The Drawings table follows the Design Desk, and approved means approved by
  whoever has the last word: the Design Head for a studio-only drawing, the
  client at a design meeting for one the client sees.
*/

const NOW = new Date('2026-10-22T10:00:00').getTime();
const DECIDED = NOW - 1000;
const riya = { uid: 'riya', email: 'riya@studio.in', name: 'Riya' };

const review = (state: ReviewState, o: Partial<ReviewSummary> = {}): Partial<ReviewSummary> => ({
  state, audience: 'client', versionNo: 2, submittedAt: NOW - 5000, decidedAt: state === 'APPROVED' ? DECIDED : null, designer: riya, ...o,
});
const studio = (state: ReviewState, o: Partial<ReviewSummary> = {}) => review(state, { audience: 'studio', ...o });
const agreed = (versionNo = 2, at = NOW - 500): ClientAgreement => ({ meetingId: 'm1', at, versionNo });
const round = (roundNumber: number, status: string, o: object = {}) => ({ roundNumber, issuedAt: null, issuedBy: null, clientFeedbackSubmittedAt: null, status, ...o });

describe('finalApprovalAt', () => {
  it('a studio-only drawing is approved when the Design Head approves it', () => {
    expect(finalApprovalAt(studio('APPROVED'))).toBe(DECIDED);
  });

  it('a client drawing the Design Head approved waits for the client', () => {
    expect(finalApprovalAt(review('APPROVED'))).toBeNull();
    expect(finalApprovalAt(review('APPROVED'), agreed())).toBe(NOW - 500);
  });

  it('an agreement on an earlier version does not carry to a new one', () => {
    expect(finalApprovalAt(review('APPROVED', { versionNo: 3 }), agreed(2))).toBeNull();
  });

  it('client changes waiting on the sheet, or a sheet back in work, is not approved', () => {
    expect(finalApprovalAt(review('APPROVED', { clientChanges: { meetingId: 'm2', at: 1, count: 1, pending: true, by: riya } }), agreed())).toBeNull();
    expect(finalApprovalAt(studio('CHANGES_REQUESTED'))).toBeNull();
    expect(finalApprovalAt(undefined)).toBeNull();
  });
});

describe('trackerPatch', () => {
  it('approves a studio-only drawing on round one, with no client answer', () => {
    const p = trackerPatch({ currentRound: 0, approvedAt: null, rounds: [] }, studio('APPROVED'), null, NOW)!;
    expect(p.approvedAt).toBe(DECIDED);
    expect(p.currentRound).toBe(1);
    expect(p.rounds).toEqual([round(1, 'approved')]);
  });

  it('leaves a client drawing alone until the client agrees', () => {
    expect(trackerPatch({ currentRound: 1, approvedAt: null, rounds: [round(1, 'not_started')] }, review('APPROVED'), null, NOW)).toBeNull();
  });

  it('approves a client drawing on its current round once the client agrees, dated by the meeting', () => {
    const d: TrackerFields = { currentRound: 2, approvedAt: null, rounds: [round(1, 'approved'), round(2, 'not_started')] };
    const p = trackerPatch(d, review('APPROVED'), agreed(), NOW)!;
    expect(p.approvedAt).toBe(NOW - 500);
    expect(p.rounds![1]).toMatchObject({ status: 'approved', clientFeedbackSubmittedAt: NOW - 500 });
  });

  it('writes nothing once the table agrees, and keeps an approval date it already had', () => {
    expect(trackerPatch({ currentRound: 1, approvedAt: DECIDED, rounds: [round(1, 'approved')] }, studio('APPROVED'), null, NOW)).toBeNull();
    expect(trackerPatch({ currentRound: 1, approvedAt: 123, rounds: [round(1, 'in_review')] }, studio('APPROVED'), null, NOW)!.approvedAt).toBe(123);
  });

  it('keeps an approval the studio set by hand while the client is still to see the sheet', () => {
    expect(trackerPatch({ currentRound: 1, approvedAt: 123, rounds: [round(1, 'approved')] }, review('APPROVED'), null, NOW)).toBeNull();
  });

  it('un-approves a sheet back in work, and supersedes a released GFC', () => {
    const d: TrackerFields = { currentRound: 1, approvedAt: 100, rounds: [round(1, 'approved')], gfc: { status: 'issued', issuedAt: 200 } };
    for (const state of ['CHANGES_REQUESTED', 'DRAFT', 'IN_REVIEW'] as ReviewState[]) {
      const p = trackerPatch(d, review(state), null, NOW)!;
      expect(p.approvedAt).toBeNull();
      expect(p.rounds![0].status).toBe('in_review');
      expect(p.gfc).toEqual({ status: 'superseded', issuedAt: 200 });
    }
  });

  it('leaves an unapproved sheet alone while it moves through the Desk, and one never on the Desk', () => {
    const d: TrackerFields = { currentRound: 1, approvedAt: null, rounds: [round(1, 'not_started')] };
    expect(trackerPatch(d, review('IN_REVIEW'), null, NOW)).toBeNull();
    expect(trackerPatch({ currentRound: 1, approvedAt: 100, rounds: [round(1, 'approved')] }, undefined, null, NOW)).toBeNull();
  });
});

describe('strayApprovalPatch', () => {
  /* What the first version wrote: approved, with a client answer, at the Design Head's decision time. */
  const stray = (rounds: any[]): TrackerFields => ({ currentRound: 1, approvedAt: DECIDED, rounds });

  it('removes a round it added', () => {
    const d = stray([round(1, 'approved', { issuedAt: NOW - 5000, issuedBy: 'Riya', clientFeedbackSubmittedAt: DECIDED })]);
    expect(strayApprovalPatch(d, review('APPROVED'))).toEqual({ approvedAt: null, rounds: [], currentRound: 0 });
  });

  it('gives a round that was already there its status back', () => {
    const d = stray([round(1, 'approved', { clientFeedbackSubmittedAt: DECIDED })]);
    expect(strayApprovalPatch(d, review('APPROVED'))).toEqual({ approvedAt: null, rounds: [round(1, 'not_started')] });
  });

  it('then the right approval follows: a studio-only sheet stays approved, without a client answer', () => {
    const d = stray([round(1, 'approved', { issuedAt: NOW - 5000, issuedBy: 'Riya', clientFeedbackSubmittedAt: DECIDED })]);
    const back = { ...d, ...strayApprovalPatch(d, studio('APPROVED')) };
    const p = trackerPatch(back, studio('APPROVED'), null, NOW)!;
    expect(p).toEqual({ approvedAt: DECIDED, currentRound: 1, rounds: [round(1, 'approved')] });
    expect(strayApprovalPatch({ ...back, ...p }, studio('APPROVED'))).toBeNull();
  });

  it('leaves an approval set by hand, or by the client, alone', () => {
    expect(strayApprovalPatch({ currentRound: 1, approvedAt: NOW - 77, rounds: [round(1, 'approved', { clientFeedbackSubmittedAt: NOW - 77 })] }, review('APPROVED'))).toBeNull();
    expect(strayApprovalPatch({ currentRound: 1, approvedAt: NOW - 500, rounds: [round(1, 'approved', { clientFeedbackSubmittedAt: NOW - 500 })] }, review('APPROVED'))).toBeNull();
  });
});

describe('agreementsFrom', () => {
  const sheet = (drawingId: string, versionNo: number) => ({ drawingId, name: drawingId, versionId: `v${versionNo}`, versionNo, pdfPath: null, thumbPath: null, pageCount: 1 });
  const room = (outcome: 'agreed' | 'changes' | null, sheets: any[]) => ({ room: 'Kitchen', sheets, outcome, changes: [], round: 0, charge: null });

  it('takes the latest agreed version per drawing from held meetings only', () => {
    const out = agreementsFrom([
      { id: 'a', state: 'CLOSED', closedAt: 10, rooms: [room('agreed', [sheet('k1', 1), sheet('k2', 1)])] },
      { id: 'b', state: 'CLOSED', closedAt: 20, rooms: [room('agreed', [sheet('k1', 2)])] },
      { id: 'c', state: 'CLOSED', closedAt: 30, rooms: [room('changes', [sheet('k2', 2)])] },
      { id: 'd', state: 'OPEN', closedAt: null, rooms: [room('agreed', [sheet('k3', 1)])] },
    ] as any);
    expect(out).toEqual({ k1: { meetingId: 'b', at: 20, versionNo: 2 }, k2: { meetingId: 'a', at: 10, versionNo: 1 } });
  });
});

describe('isApprovedSheet', () => {
  it('reads the table, or the final approval', () => {
    expect(isApprovedSheet({ approvedAt: 1 })).toBe(true);
    expect(isApprovedSheet({ approvedAt: null, review: studio('APPROVED') })).toBe(true);
    expect(isApprovedSheet({ approvedAt: null, review: review('APPROVED') })).toBe(false);
    expect(isApprovedSheet({ approvedAt: null, review: review('APPROVED') }, agreed())).toBe(true);
  });
});
