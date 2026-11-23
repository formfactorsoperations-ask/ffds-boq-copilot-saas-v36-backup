import { describe, it, expect } from 'vitest';
import {
  addPosition, allocateConcession, concessionFor, daysOpen, disputesOf, inDispute, issuesTotal, latestOffer, openDispute,
  outstandingByTrack, raiseDispute, reopenDispute, settleDispute, withdrawDispute, editDispute,
} from '../../lib/disputes';
import { computeSchedule } from '../../lib/paymentSchedule';
import { folderFiles, stageOfProject } from '../../lib/projectFolders';

/*
  The figures of the dispute this was modelled on: a handed-over 2BHK, the
  final execution bill of 3,75,308 and design bill of 1,02,422 held back, five
  BOQ lines contested, settled 38 days later at 2,00,000 and 77,459.
*/
const schedule: any = {
  byId: {
    e3: { owed: 500000, invoiceTotal: 500000 },
    e4: { owed: 375308, invoiceTotal: 375308 },
    d4: { owed: 102422, invoiceTotal: 102422 },
  },
};
const ctx = () => ({
  name: 'Siesta 2BHK', status: 'completed',
  paymentMilestones: [
    { id: 'e3', type: 'execution', name: 'Mid execution', percentage: 40, status: 'paid' },
    { id: 'e4', type: 'execution', name: 'Completion', percentage: 10, status: 'invoiced' },
    { id: 'd4', type: 'design', name: 'Design final', percentage: 10, status: 'invoiced' },
  ],
});
const draft = () => ({
  title: 'Kitchen and wardrobe not built to the drawings', summary: 'Client has moved in.', raisedBy: 'client' as const, openedOn: '2026-05-15',
  claimed: { execution: 375308, design: 102422 }, workStopped: true,
  issues: [
    { id: 'a', title: 'Shoe cabinet', ref: '1', billed: 27720, claimed: 12720 },
    { id: 'b', title: 'Crockery unit', ref: '7', billed: 72197, claimed: 22197 },
    { id: 'c', title: 'Kitchen cabinet below counter', ref: '11', billed: 158400, claimed: 58400 },
    { id: 'd', title: 'Kitchen loft', ref: '12', billed: 89100, claimed: 64100 },
    { id: 'e', title: 'Cupboard', ref: '2', billed: 38943, claimed: 18943 },
    { id: 'f', title: '   ', billed: 0, claimed: 0 },
  ],
});

describe('a payment dispute', () => {
  it('reads what is unpaid by head, leaving out what is paid', () => {
    expect(outstandingByTrack(ctx(), schedule)).toEqual({ execution: 375308, design: 102422 });
  });

  it('is raised beside the project without changing its stage', () => {
    const c = raiseDispute(ctx(), draft(), 'Owner');
    expect(c.status).toBe('completed');
    expect(inDispute(c)).toBe(true);
    const d = openDispute(c)!;
    expect(d.stage).toBe('completed');
    expect(d.issues).toHaveLength(5); // the blank row is dropped
    expect(issuesTotal(d)).toEqual({ billed: 386360, claimed: 176360 });
    expect(c.history[0].summary).toMatch(/Dispute raised/);
    expect(c.paymentMilestones).toEqual(ctx().paymentMilestones); // invoices untouched while it is open
    /* One at a time. */
    expect(disputesOf(raiseDispute(c, draft(), 'Owner'))).toHaveLength(1);
    /* The project folder leads with it; it stays in its own stage group. */
    expect(folderFiles({ context: c, tiers: [] })[0]).toMatchObject({ name: 'Dispute', route: 'payment-calc' });
    expect(stageOfProject({ context: c })).toBe('completed');
  });

  it('keeps each side\'s positions in date order, with the last amount on the table', () => {
    let c = raiseDispute(ctx(), draft(), 'Owner');
    const id = openDispute(c)!.id;
    c = addPosition(c, id, { on: '2026-06-07', by: 'studio', note: 'Final position, pay by 12 June', amount: 477730 }, 'Owner');
    c = addPosition(c, id, { on: '2026-06-03', by: 'client', note: 'Itemised deductions on five lines', amount: 276407 }, 'Owner');
    c = addPosition(c, id, { on: '2026-06-08', by: 'client', note: 'Terms stand', amount: null }, 'Owner');
    c = addPosition(c, id, { on: '2026-06-09', by: 'client', note: '   ', amount: null }, 'Owner'); // nothing said: not logged
    const d = openDispute(c)!;
    expect(d.positions.map((p) => p.on)).toEqual(['2026-06-03', '2026-06-07', '2026-06-08']);
    expect(latestOffer(d)).toMatchObject({ by: 'studio', amount: 477730 });
    expect(daysOpen(d, Date.parse('2026-06-22T12:00:00'))).toBe(38);
  });

  it('settles by head and writes the concession onto the unpaid invoices', () => {
    let c = raiseDispute(ctx(), draft(), 'Owner');
    const id = openDispute(c)!.id;
    expect(concessionFor({ execution: 375308, design: 102422 }, { execution: 200000, design: 77459 })).toEqual({ execution: 175308, design: 24963 });
    c = settleDispute(c, id, schedule, { settled: { execution: 200000, design: 77459 }, on: '2026-06-22', reason: '', withoutAdmission: true, actor: 'Owner' });
    const d = disputesOf(c)[0];
    expect(d.status).toBe('settled');
    expect(inDispute(c)).toBe(false);
    expect(d.resolution).toMatchObject({ settled: { execution: 200000, design: 77459 }, concession: { execution: 175308, design: 24963 }, withoutAdmission: true, unallocated: 0 });
    const by = Object.fromEntries(c.paymentMilestones.map((m: any) => [m.id, m]));
    expect(by.e4.discountAmount).toBe(175308);
    expect(by.d4.discountAmount).toBe(24963);
    expect(by.e4.discountReason).toMatch(/Dispute settlement/);
    expect(by.e3.discountAmount).toBeUndefined(); // paid: never touched
    expect(daysOpen(d)).toBe(38);
    expect(c.history[0].summary).toBe('Dispute settled at ₹2,77,459');
  });

  it('a concession larger than the unpaid invoices is kept on the record, not invented on a paid one', () => {
    const out = allocateConcession(ctx(), schedule, { execution: 400000, design: 0 });
    expect(out.appliedTo).toEqual([{ milestoneId: 'e4', amount: 375308 }]);
    expect(out.unallocated).toBe(24692);
  });

  it('reopening takes the concession back off; closing with nothing conceded touches no invoice', () => {
    let c: any = { ...ctx(), paymentMilestones: ctx().paymentMilestones.map((m) => (m.id === 'e4' ? { ...m, discountAmount: 1000, discountReason: 'Goodwill' } : m)) };
    c = raiseDispute(c, draft(), 'Owner');
    const id = openDispute(c)!.id;
    c = settleDispute(c, id, schedule, { settled: { execution: 200000, design: 102422 }, on: '2026-06-22', reason: 'Closure', withoutAdmission: false, actor: 'Owner' });
    expect(c.paymentMilestones.find((m: any) => m.id === 'e4').discountAmount).toBe(176308);
    c = reopenDispute(c, id, 'Owner');
    expect(openDispute(c)?.id).toBe(id);
    expect(c.paymentMilestones.find((m: any) => m.id === 'e4').discountAmount).toBe(1000); // the earlier concession stays
    expect(c.paymentMilestones.find((m: any) => m.id === 'd4').discountAmount).toBeUndefined();

    c = withdrawDispute(c, id, { on: '2026-06-30', note: 'Client accepted the bill', actor: 'Owner' });
    expect(disputesOf(c)[0]).toMatchObject({ status: 'withdrawn', closedOn: '2026-06-30', closedNote: 'Client accepted the bill' });
    expect(c.paymentMilestones.find((m: any) => m.id === 'e4').discountAmount).toBe(1000);
  });

  it('editing corrects the record while it is open', () => {
    let c = raiseDispute(ctx(), draft(), 'Owner');
    const id = openDispute(c)!.id;
    c = editDispute(c, id, { ...draft(), title: 'Final bill', claimed: { execution: 300000, design: 0 }, issues: [{ id: 'x', title: 'Loft', billed: 1000, claimed: 5000 }] });
    expect(openDispute(c)).toMatchObject({ title: 'Final bill', claimed: { execution: 300000, design: 0 } });
    expect(openDispute(c)!.issues[0].claimed).toBe(1000); // cannot ask more off a line than it was billed
  });

  it('after settling, Money reads the settled amount as what is owed', () => {
    const real: any = {
      status: 'completed', gstRate: 18, approvedTierId: 't1',
      financials: { initiationFeePaid: 0, billablePercent: 100, designBillablePercent: 100, executionGstEnabled: true, designGstEnabled: true, discounts: [], approvedDesignValue: 200000, approvedExecutionValue: 1000000 },
      paymentMilestones: [
        { id: 'd1', type: 'design', name: 'Design', percentage: 100, status: 'paid' },
        { id: 'e1', type: 'execution', name: 'Execution 1', percentage: 80, status: 'paid' },
        { id: 'e2', type: 'execution', name: 'Completion', percentage: 20, status: 'invoiced' },
      ],
    };
    const summary = { totalSell: 1000000, designFee: 200000 };
    const before = computeSchedule({ context: real, tierSummary: summary });
    const owed = outstandingByTrack(real, before);
    expect(owed.execution).toBe(236000);
    let c = raiseDispute(real, { ...draft(), claimed: owed, issues: [] }, 'Owner');
    c = settleDispute(c, openDispute(c)!.id, before, { settled: { execution: 150000, design: 0 }, on: '2026-06-22', reason: 'Closure', withoutAdmission: true, actor: 'Owner' });
    const after = computeSchedule({ context: c, tierSummary: summary });
    expect(outstandingByTrack(c, after)).toEqual({ execution: 150000, design: 0 });
  });
});
