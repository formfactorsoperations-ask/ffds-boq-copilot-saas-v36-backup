import { describe, it, expect } from 'vitest';
import {
  applyTermination, computeSettlement, defaultDraft, isTerminated, needsSettlement, reinstateProject,
  reviseSettlement, settleTermination, settlementInputs, settlementLine, settlementRow, terminatedValue,
  type SettlementInputs,
} from '../../lib/termination';
import { computeSchedule } from '../../lib/paymentSchedule';
import { projectFact, bookedIn, cashIn, overdueAt, marginOf } from '../../lib/ownerReports';
import { getSingleProjectValue } from '../../lib/financialsUtils';
import { folderFiles, stageOfProject } from '../../lib/projectFolders';

/* A design fee of 2,00,000 and execution of 10,00,000, both with 18% GST. */
const inputs: SettlementInputs = {
  designGross: 236000, executionGross: 1180000, designTaxable: 200000, executionTaxable: 1000000,
  collected: 118000, invoicedUnpaid: 0, suggestedDesignPct: 50, suggestedExecutionPct: 0,
};

describe('termination settlement', () => {
  it('opens pro-rata on the share already billed', () => {
    expect(defaultDraft(inputs)).toMatchObject({ basis: 'prorata', designDonePct: 50, executionDonePct: 0, charges: 0 });
  });

  it('pro-rata: keeps the share of each fee that was done, and refunds the rest', () => {
    const s = computeSettlement(inputs, { basis: 'prorata', designDonePct: 25, executionDonePct: 0, charges: 0 });
    expect(s.designKept).toBe(59000);
    expect(s.entitled).toBe(59000);
    expect(s.net).toBe(-59000);
    expect(s.status).toBe('open');
    expect(s.keptExGst).toEqual({ design: 50000, execution: 0 });
    expect(settlementLine(s)).toMatchObject({ kind: 'refund', amount: 59000 });
  });

  it('pro-rata: more work done than paid for leaves a balance due, charges included', () => {
    const s = computeSettlement(inputs, { basis: 'prorata', designDonePct: 75, executionDonePct: 0, charges: 5000, chargesNote: 'Site survey' });
    expect(s.entitled).toBe(177000 + 5000);
    expect(s.net).toBe(64000);
    expect(settlementLine(s)).toMatchObject({ kind: 'balance', amount: 64000 });
  });

  it('keep what is paid: nothing moves, so it is settled at once', () => {
    const s = computeSettlement(inputs, { basis: 'keep_paid', designDonePct: 0, executionDonePct: 0, charges: 999 });
    expect(s.entitled).toBe(118000);
    expect(s.net).toBe(0);
    expect(s.status).toBe('settled');
    expect(s.charges).toBe(0);
    expect(settlementLine(s).kind).toBe('even');
  });

  it('refund in full and a set amount', () => {
    expect(computeSettlement(inputs, { basis: 'refund_all', designDonePct: 100, executionDonePct: 100, charges: 0 }).net).toBe(-118000);
    const custom = computeSettlement(inputs, { basis: 'custom', designDonePct: 0, executionDonePct: 0, charges: 0, customAmount: 30000 });
    expect(custom.entitled).toBe(30000);
    expect(custom.net).toBe(-88000);
  });

  it('clamps shares and never keeps a negative amount', () => {
    const s = computeSettlement(inputs, { basis: 'prorata', designDonePct: 140, executionDonePct: -5, charges: -100 });
    expect(s.designDonePct).toBe(100);
    expect(s.executionDonePct).toBe(0);
    expect(s.charges).toBe(0);
    expect(computeSettlement(inputs, { basis: 'custom', designDonePct: 0, executionDonePct: 0, charges: 0, customAmount: -5 }).entitled).toBe(0);
  });
});

/* A won project: design 2,00,000 fixed, half of it paid. */
const ctx = (over: any = {}) => ({
  name: 'Sea View', clientName: 'Asha', clientEmail: 'asha@example.com', status: 'won', gstRate: 18, approvedTierId: 't1',
  bookedOn: '2026-09-01',
  lifecycle: { stage: 4, gates: {} },
  financials: { initiationFeePaid: 0, billablePercent: 100, designBillablePercent: 100, executionGstEnabled: true, designGstEnabled: true, discounts: [], approvedDesignValue: 200000, approvedExecutionValue: 1000000 },
  clientPortal: { 'asha@example.com': { issuedAt: 1 } },
  paymentMilestones: [
    { id: 'd1', type: 'design', name: 'Design 1', percentage: 50, status: 'paid', invoiceDate: '2026-09-05', paidDate: '2026-09-10' },
    { id: 'd2', type: 'design', name: 'Design 2', percentage: 50, status: 'invoiced', invoiceDate: '2026-10-05' },
    { id: 'e1', type: 'execution', name: 'Execution 1', percentage: 100, status: 'pending' },
  ],
  ...over,
});
const tier = { id: 't1', summary: { totalCost: 700000, totalSell: 1000000, designFee: 200000 } };
const project = (c: any) => ({ id: 'p1', context: c, tiers: [tier], activeTierId: 't1' });

const terminate = (c: any, draft: any) => {
  const schedule = computeSchedule({ context: c, tierSummary: tier.summary });
  const i = settlementInputs(c, schedule);
  return {
    i,
    out: applyTermination(c, {
      reason: 'client_request', note: 'Moving abroad', effectiveOn: '2026-11-20', actor: 'Owner',
      settlement: computeSettlement(i, draft), portalEmails: ['Asha@Example.com'], now: Date.parse('2026-11-20T10:00:00'),
    }),
  };
};

describe('terminating a project', () => {
  it('reads the money off the one payment schedule', () => {
    const c = ctx();
    const schedule = computeSchedule({ context: c, tierSummary: tier.summary });
    const i = settlementInputs(c, schedule);
    expect(i.collected).toBe(schedule.totals.totalPaid);
    expect(i.collected).toBeGreaterThan(0);
    expect(i.invoicedUnpaid).toBe(schedule.byId.d2.owed);
    expect(i.suggestedDesignPct).toBe(100);
    /* Not on site yet: no execution is taken to be done, whatever was billed. */
    expect(i.suggestedExecutionPct).toBe(0);
    expect(needsSettlement(c, schedule)).toBe(true);
    expect(needsSettlement({ status: 'lead', paymentMilestones: [] }, null)).toBe(false);
    expect(needsSettlement({ status: 'draft', financials: { initiationFeePaid: 5000 } }, null)).toBe(true);
  });

  it('files the project as closed, keeps the record and history, and marks portal access revoked', () => {
    const { out } = terminate(ctx(), { basis: 'keep_paid', designDonePct: 0, executionDonePct: 0, charges: 0 });
    expect(out.status).toBe('lost');
    expect(out.statusPin.status).toBe('lost');
    expect(isTerminated(out)).toBe(true);
    expect(out.termination).toMatchObject({ reason: 'client_request', initiatedBy: 'client', prevStatus: 'won', prevStage: 4, effectiveOn: '2026-11-20' });
    expect(out.clientPortal['asha@example.com'].revokedAt).toBeGreaterThan(1);
    expect(out.history[0].summary).toMatch(/Project terminated/);
    /* The schedule is left as it was: the record is the truth from here. */
    expect(out.paymentMilestones).toHaveLength(3);
  });

  it('a lost lead with no record is not a termination', () => {
    expect(isTerminated({ status: 'lost' })).toBe(false);
    expect(terminatedValue({ status: 'lost' })).toBeNull();
    expect(settlementRow({ status: 'lost' })).toBeNull();
  });

  it('records the refund paid, can undo it, and reopening puts the project back', () => {
    const { out } = terminate(ctx(), { basis: 'refund_all', designDonePct: 0, executionDonePct: 0, charges: 0 });
    expect(settlementRow(out)).toBeNull(); // a refund still owed has moved no money
    const paid = settleTermination(out, { status: 'settled', on: '2026-11-25', note: 'NEFT', actor: 'Owner' });
    expect(paid.termination.settlement).toMatchObject({ status: 'settled', settledOn: '2026-11-25', settledNote: 'NEFT' });
    expect(settlementRow(paid)).toMatchObject({ status: 'paid', amount: out.termination.settlement.net });
    expect(settleTermination(paid, { status: 'open', actor: 'Owner' }).termination.settlement.settledOn).toBeNull();
    expect(settlementRow(settleTermination(out, { status: 'waived', actor: 'Owner' }))).toBeNull();

    const back = reinstateProject(paid, 'Owner');
    expect(back.status).toBe('won');
    expect(back.termination).toBeUndefined();
    expect(isTerminated(back)).toBe(false);
  });

  it('changing the settlement reopens it when the amount to move changes', () => {
    const { i, out } = terminate(ctx(), { basis: 'refund_all', designDonePct: 0, executionDonePct: 0, charges: 0 });
    const paid = settleTermination(out, { status: 'settled', on: '2026-11-25', actor: 'Owner' });
    const same = reviseSettlement(paid, computeSettlement(i, { basis: 'custom', designDonePct: 0, executionDonePct: 0, charges: 0, customAmount: 0 }), 'Owner');
    expect(same.termination.settlement.status).toBe('settled');
    const changed = reviseSettlement(paid, computeSettlement(i, { basis: 'custom', designDonePct: 0, executionDonePct: 0, charges: 0, customAmount: 10000 }), 'Owner');
    expect(changed.termination.settlement.status).toBe('open');
  });
});

describe('a terminated project in the studio figures', () => {
  const all = { start: 0, end: Date.parse('2027-01-01') };

  it('a plain lost project is not money, a terminated one is', () => {
    const lost = projectFact(project(ctx({ status: 'lost' })));
    expect(cashIn([lost], all).value).toBe(0);
    expect(bookedIn([lost], all).value).toBe(0);
  });

  it('keeps the cash collected, books only what the studio keeps, and drops unpaid invoices', () => {
    const c = ctx();
    const live = projectFact(project(c));
    const { out } = terminate(c, { basis: 'keep_paid', designDonePct: 0, executionDonePct: 0, charges: 0 });
    const fact = projectFact(project(out));
    expect(fact.terminated).toBe(true);
    expect(cashIn([fact], all).value).toBe(cashIn([live], all).value);
    expect(cashIn([fact], all).value).toBeGreaterThan(0);
    expect(bookedIn([fact], all).value).toBeLessThan(bookedIn([live], all).value);
    expect(fact.design + fact.execution).toBe(out.termination.settlement.keptExGst.design + out.termination.settlement.keptExGst.execution);
    expect(overdueAt([live], Date.parse('2026-12-20'), 7).value).toBeGreaterThan(0);
    expect(overdueAt([fact], Date.parse('2026-12-20'), 7).value).toBe(0);
    expect(marginOf([fact]).contracted).toBe(0);
  });

  it('a refund is cash out on the day it is paid; a balance due is owed until it comes in', () => {
    const c = ctx();
    const refund = terminate(c, { basis: 'refund_all', designDonePct: 0, executionDonePct: 0, charges: 0 }).out;
    const collected = refund.termination.settlement.collected;
    expect(cashIn([projectFact(project(refund))], all).value).toBe(collected);
    const paid = settleTermination(refund, { status: 'settled', on: '2026-11-25', actor: 'Owner' });
    expect(cashIn([projectFact(project(paid))], all).value).toBe(0);

    const owing = terminate(c, { basis: 'custom', designDonePct: 0, executionDonePct: 0, charges: 0, customAmount: collected + 20000 }).out;
    expect(overdueAt([projectFact(project(owing))], Date.parse('2026-12-20'), 7).value).toBe(20000);
    const received = settleTermination(owing, { status: 'settled', on: '2026-12-01', actor: 'Owner' });
    expect(cashIn([projectFact(project(received))], all).value).toBe(collected + 20000);
  });

  it('the project is worth what the studio keeps, and its folder leads with the settlement', () => {
    const { out } = terminate(ctx(), { basis: 'custom', designDonePct: 0, executionDonePct: 0, charges: 0, customAmount: 40000 });
    expect(getSingleProjectValue(project(out))).toBe(40000);
    expect(folderFiles(project(out))[0]).toMatchObject({ name: 'Termination settlement', route: 'payment-calc' });
    /* Its own group on Projects, apart from leads that never signed. */
    expect(stageOfProject(project(out))).toBe('terminated');
    expect(stageOfProject(project(ctx({ status: 'lost' })))).toBe('lost');
  });
});

import { cardStates } from '../../lib/moneyBoard';

describe('milestone statuses on a terminated project', () => {
  const milestones: any[] = [
    { id: 'd1', type: 'design', status: 'paid' },
    { id: 'd2', type: 'design', status: 'invoiced' },
    { id: 'd3', type: 'design' },
    { id: 'e1', type: 'execution', status: 'pending' },
  ];

  it('a live project has an up-next and a later on each track', () => {
    expect(cardStates(milestones, new Set())).toEqual({ d1: 'paid', d2: 'invoiced', d3: 'next', e1: 'next' });
  });

  it('terminated: paid stays paid, an unpaid invoice is cancelled, the rest is not billed, even if it was earned', () => {
    expect(cardStates(milestones, new Set(['d3']), true)).toEqual({ d1: 'paid', d2: 'void', d3: 'dropped', e1: 'dropped' });
  });
});
