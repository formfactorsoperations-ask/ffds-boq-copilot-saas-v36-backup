import { describe, it, expect } from 'vitest';
import { scheduleDiffers, acceptedLatest, clientCopiesBehind, nextInvoiceSeq } from '../../lib/scheduleImpact';
import { restoreSchedule, milestonesFromIssued } from '../../lib/moneyBoard';

const ms: any[] = [
  { id: 'd1', type: 'design', name: 'Sign-up', percentage: 25, trigger: 'On signing', unlocks: 'Brief' },
  { id: 'e1', type: 'execution', name: 'Handover', percentage: 0, isFixedAmount: true, fixedAmount: 100000, unlocks: 'Keys' },
];
const issued = { version: 2, issuedAt: 1000, advances: [
  { milestoneId: 'd1', phase: 'design', label: 'Sign-up', percentage: 25, dueCondition: 'On signing', unlocks: 'Brief' },
  { milestoneId: 'e1', phase: 'execution', label: 'Handover', percentage: 0, isFixedAmount: true, fixedAmount: 100000, unlocks: 'Keys' },
] };

describe('is the issued schedule behind the milestones?', () => {
  it('no, when nothing it prints has moved', () => expect(scheduleDiffers(ms, issued)).toBe(false));
  it('yes, for a fixed amount, a trigger, a track or a new stage', () => {
    expect(scheduleDiffers([ms[0], { ...ms[1], fixedAmount: 120000 }], issued)).toBe(true);
    expect(scheduleDiffers([{ ...ms[0], trigger: 'On booking' }, ms[1]], issued)).toBe(true);
    expect(scheduleDiffers([{ ...ms[0], type: 'execution' }, ms[1]], issued)).toBe(true);
    expect(scheduleDiffers([...ms, { id: 'x', type: 'execution', name: 'New', percentage: 0 }], issued)).toBe(true);
  });
});

describe('accepted means the latest version', () => {
  it('not when the terms were acknowledged before the latest schedule was generated', () => {
    expect(acceptedLatest({ status: 'acknowledged', acknowledgedAt: 500 }, issued)).toBe(false);
    expect(acceptedLatest({ status: 'acknowledged', acknowledgedAt: 1500 }, issued)).toBe(true);
    expect(acceptedLatest({ status: 'draft' }, issued)).toBe(false);
  });
});

describe("what the client holds that is behind", () => {
  const ctx = (over: any = {}) => ({
    paymentSchedules: [issued],
    financials: { scheduleChanges: [{ kind: 'schedule', date: new Date(5000).toISOString() }] },
    documents: { issues: [
      { kind: 'payment_schedule', version: 1, issuedAt: 1200 },
      { kind: 'execution_agreement', version: 1, issuedAt: 1200, signedAt: 1300 },
    ] },
    ...over,
  });
  it('lists the steps in order after a change', () => {
    const steps = clientCopiesBehind(ctx(), [{ ...ms[0], percentage: 30 }, ms[1]]);
    expect(steps.map(s => s.key)).toEqual(['generate', 'reissue-schedule', 'reissue-agreement', 'portal']);
    expect(steps[2].why).toMatch(/signed that version/);
  });
  it('asks for nothing when everything the client holds is current', () => {
    expect(clientCopiesBehind(ctx({ financials: { scheduleChanges: [] } }), ms)).toEqual([]);
  });
  it('asks for a re-issue when a newer version was generated than the one issued', () => {
    const steps = clientCopiesBehind(ctx({ financials: {}, documents: { issues: [{ kind: 'payment_schedule', version: 1, issuedAt: 900 }] } }), ms);
    expect(steps.map(s => s.key)).toEqual(['reissue-schedule', 'portal']);
  });
});

describe('invoice numbers never repeat', () => {
  it('takes one past the highest used, wherever the stage sits', () => {
    expect(nextInvoiceSeq([], 3)).toBe('01');
    expect(nextInvoiceSeq([{ invoiceNumber: 'INV-026-PAL-01' }, { invoiceNumber: 'INV-026-PAL-04' }] as any, 1)).toBe('05');
  });
});

describe('restoring an issued schedule keeps today\'s milestones', () => {
  it('matches rows by track and name, so ids and dates hold', () => {
    const now: any[] = [{ id: 'd1', type: 'design', name: 'Sign-up', percentage: 100, status: 'pending', date: '2026-12-01' }];
    const { draft } = restoreSchedule(milestonesFromIssued([{ phase: 'design', label: 'Sign-up', percentage: 100 }]), now, { design: 1, execution: 1 });
    expect(draft[0]).toMatchObject({ id: 'd1', date: '2026-12-01', percentage: 100 });
  });
});
