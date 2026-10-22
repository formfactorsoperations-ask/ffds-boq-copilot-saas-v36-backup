import { describe, it, expect } from 'vitest';
import { trackerPatch, isApprovedSheet, type ReviewSummary, type ReviewState, type TrackerFields } from '../../lib/drawingReview';

/*
  The Drawings table follows the Design Desk: a sheet signed off on the Desk
  reads Approved in the table, and one moved off approved stops reading so.
*/

const NOW = new Date('2026-10-22T10:00:00').getTime();
const riya = { uid: 'riya', email: 'riya@studio.in', name: 'Riya' };

const review = (state: ReviewState, o: Partial<ReviewSummary> = {}): Partial<ReviewSummary> => ({
  state, versionNo: 2, submittedAt: NOW - 5000, decidedAt: state === 'APPROVED' ? NOW - 1000 : null, designer: riya, ...o,
});
const round = (roundNumber: number, status: string) => ({ roundNumber, issuedAt: null, issuedBy: null, clientFeedbackSubmittedAt: null, status });

describe('trackerPatch', () => {
  it('approves a sheet the table had as not started, on round one', () => {
    const d: TrackerFields = { currentRound: 0, approvedAt: null, rounds: [] };
    const p = trackerPatch(d, review('APPROVED'), NOW)!;
    expect(p.approvedAt).toBe(NOW - 1000);
    expect(p.currentRound).toBe(1);
    expect(p.rounds).toEqual([{ roundNumber: 1, issuedAt: NOW - 5000, issuedBy: 'Riya', clientFeedbackSubmittedAt: NOW - 1000, status: 'approved' }]);
  });

  it('approves the current round and keeps the others', () => {
    const d: TrackerFields = { currentRound: 2, approvedAt: null, rounds: [round(1, 'approved'), round(2, 'not_started')] };
    const p = trackerPatch(d, review('APPROVED'), NOW)!;
    expect(p.rounds!.map((r) => r.status)).toEqual(['approved', 'approved']);
    expect(p.currentRound).toBe(2);
  });

  it('writes nothing once the table agrees', () => {
    const d: TrackerFields = { currentRound: 1, approvedAt: NOW - 1000, rounds: [round(1, 'approved')] };
    expect(trackerPatch(d, review('APPROVED'), NOW)).toBeNull();
  });

  it('keeps an approval date the table already had', () => {
    const d: TrackerFields = { currentRound: 1, approvedAt: 123, rounds: [round(1, 'in_review')] };
    expect(trackerPatch(d, review('APPROVED'), NOW)!.approvedAt).toBe(123);
  });

  it('un-approves a sheet sent back, and supersedes a released GFC', () => {
    const d: TrackerFields = { currentRound: 1, approvedAt: 100, rounds: [round(1, 'approved')], gfc: { status: 'issued', issuedAt: 200 } };
    for (const state of ['CHANGES_REQUESTED', 'DRAFT', 'IN_REVIEW'] as ReviewState[]) {
      const p = trackerPatch(d, review(state), NOW)!;
      expect(p.approvedAt).toBeNull();
      expect(p.rounds![0].status).toBe('in_review');
      expect(p.gfc).toEqual({ status: 'superseded', issuedAt: 200 });
    }
  });

  it('leaves an unapproved sheet alone while it moves through the Desk', () => {
    const d: TrackerFields = { currentRound: 1, approvedAt: null, rounds: [round(1, 'not_started')] };
    expect(trackerPatch(d, review('IN_REVIEW'), NOW)).toBeNull();
    expect(trackerPatch(d, review('CHANGES_REQUESTED'), NOW)).toBeNull();
  });

  it('does nothing for a drawing that has never been on the Desk', () => {
    const d: TrackerFields = { currentRound: 1, approvedAt: 100, rounds: [round(1, 'approved')] };
    expect(trackerPatch(d, undefined, NOW)).toBeNull();
    expect(trackerPatch(d, { audience: 'client' }, NOW)).toBeNull();
  });
});

describe('isApprovedSheet', () => {
  it('reads either side', () => {
    expect(isApprovedSheet({ approvedAt: 1 })).toBe(true);
    expect(isApprovedSheet({ approvedAt: null, review: review('APPROVED') })).toBe(true);
    expect(isApprovedSheet({ approvedAt: null, review: review('CHANGES_REQUESTED') })).toBe(false);
    expect(isApprovedSheet({ approvedAt: null })).toBe(false);
  });
});
