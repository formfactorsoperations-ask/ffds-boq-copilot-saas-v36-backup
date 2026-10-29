import { describe, it, expect } from 'vitest';
import {
  periodWindow, projectFact, bookedIn, cashIn, overdueAt, marginOf, winRateIn, handoversIn, pipelineOf,
  furthestStage, scorecard, headline, actionsOf, salesReport, moneyReport, deliveryReport, lateSites, inr, clientRelationsReport,
  type OwnerReportInput,
} from '../../lib/ownerReports';
import { DEFAULT_TARGETS, targetsOf, storedTargets, overheadsMonthly } from '../../lib/reportTargets';
import { calculateProjectFinancials } from '../../lib/financialsUtils';
import type { Lead } from '../../lib/leads';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const NOW = at(2026, 10, 29);

/* A ₹10L execution, ₹1L design contract quoted at ₹7.7L cost, GST at 18%. */
const project = (id: string, over: any = {}, ctx: any = {}) => ({
  id,
  activeTierId: 't1',
  tiers: [{ id: 't1', name: 'Option', summary: { totalSell: 1000000, designFee: 100000, totalCost: 770000 } }],
  ...over,
  context: {
    name: `Project ${id}`, clientName: `Client ${id}`, status: 'execution', gstRate: 18, area: 1000,
    financials: { billablePercent: 100, executionGstEnabled: true, initiationFeePaid: 0, discounts: [] },
    paymentMilestones: [],
    lifecycle: { gates: { proposalAccepted: { done: true, at: at(2026, 10, 5), reference: null } } },
    ...ctx,
  },
});
const ms = (id: string, over: any = {}) => ({ id, type: 'execution', name: `Milestone ${id}`, percentage: 10, description: '', ...over });

const lead = (id: string, over: Partial<Lead> = {}): Lead => ({
  id, tenantId: 's', createdAt: at(2026, 10, 2), createdBy: '', createdByName: '', ownerEmail: '', ownerName: '',
  people: [{ id: 'p', name: `Lead ${id}`, role: '', phone: '', email: '', main: true }],
  home: { where: '', type: '', area: null, scope: [], possession: '', budget: '' },
  source: 'instagram', sourceNote: '', enquiry: '', stage: 'new', lostReason: null,
  know: { decides: '', style: '', seenWork: false }, next: null, touches: [],
  firstTouchAt: null, lastTouchAt: null, openRequest: null, projectId: null,
  updatedAt: at(2026, 10, 3), updatedBy: '', ...over,
});

const input = (facts: any[], over: Partial<OwnerReportInput> = {}): OwnerReportInput => ({
  facts, leads: [], headcount: 10, targets: DEFAULT_TARGETS, lateAfterDays: 7, period: 'month', now: NOW, ...over,
});

describe('periods', () => {
  it('compares a month with the month before, and counts the days left', () => {
    const w = periodWindow('month', NOW);
    expect(w.label).toBe('October');
    expect(w.compareLabel).toBe('with September');
    expect(w.cur.start).toBe(new Date(2026, 9, 1).getTime());
    expect(w.prev.start).toBe(new Date(2026, 8, 1).getTime());
    expect(w.prev.end).toBe(w.cur.start);
    expect(w.daysLeft).toBe(2);
    expect(w.months).toBe(1);
  });
  it('compares the last three months with the three before', () => {
    const w = periodWindow('quarter', NOW);
    expect(w.cur.start).toBe(new Date(2026, 7, 1).getTime());
    expect(w.prev.start).toBe(new Date(2026, 4, 1).getTime());
    expect(w.compareLabel).toBe('with May to July');
    expect(w.monthKeys).toEqual(['2026-08', '2026-09', '2026-10']);
  });
  it('runs the financial year from 1 April, against the same months last year', () => {
    const w = periodWindow('fy', NOW);
    expect(w.label).toBe('FY 26–27 so far');
    expect(w.cur.start).toBe(new Date(2026, 3, 1).getTime());
    expect(w.prev.start).toBe(new Date(2025, 3, 1).getTime());
    expect(new Date(w.prev.end).getFullYear()).toBe(2025);
    expect(w.months).toBe(7);
    /* In February the year began the April before. */
    expect(periodWindow('fy', at(2027, 2, 10)).cur.start).toBe(new Date(2026, 3, 1).getTime());
  });
});

describe('money', () => {
  it('takes each milestone amount from the financials, initiation fee offset included', () => {
    const ctx = { financials: { billablePercent: 100, executionGstEnabled: true, initiationFeePaid: 10000, discounts: [] },
      paymentMilestones: [ms('d1', { type: 'design', percentage: 50, status: 'paid' }), ms('e1', { status: 'invoiced' })] };
    const fin: any = calculateProjectFinancials({ ...project('a').context, ...ctx }, project('a').tiers[0]);
    expect(fin.milestoneAmounts.d1).toBe(59000 - 10000);
    expect(fin.milestoneAmounts.e1).toBe(118000);
    expect(fin.totalPaid).toBe(10000 + 49000);
    const f = projectFact(project('a', {}, ctx));
    expect(f.milestones.map((m) => m.amount)).toEqual([49000, 118000]);
  });

  it('books contracts by their accepted date, before GST, with authorised additions', () => {
    const a = projectFact(project('a'), { additionsByProject: { a: [
      { createdAt: at(2026, 10, 20), exGst: 50000, authorised: true, live: true, collected: 0 },
      { createdAt: at(2026, 10, 21), exGst: 90000, authorised: false, live: true, collected: 0 },
    ] } });
    const old = projectFact(project('b', {}, { lifecycle: { gates: { proposalAccepted: { at: at(2026, 9, 10) } } } }));
    const lead = projectFact(project('c', {}, { status: 'proposal_sent' }));
    const w = periodWindow('month', NOW);
    const b = bookedIn([a, old, lead], w.cur);
    expect(b.count).toBe(1);
    expect(b.value).toBe(1100000 + 50000);
    expect(b.perSqft).toBe(1100);
    expect(bookedIn([a, old, lead], w.prev).value).toBe(1100000);
  });

  it('counts cash on the day it was marked received, falling back to the invoice date', () => {
    const f = projectFact(project('a', {}, { paymentMilestones: [
      ms('1', { status: 'paid', invoiceDate: iso(2026, 9, 20), paidDate: iso(2026, 10, 4) }),
      ms('2', { status: 'paid', invoiceDate: iso(2026, 10, 10) }),
      ms('3', { status: 'paid' }),
      ms('4', { status: 'invoiced', invoiceDate: iso(2026, 10, 12) }),
    ] }));
    const c = cashIn([f], periodWindow('month', NOW).cur);
    expect(c.value).toBe(118000 * 2);
    expect(c.count).toBe(2);
    expect(c.undated).toBe(1);
  });

  it('reads overdue at any day, from invoice and received dates', () => {
    const f = projectFact(project('a', {}, { paymentMilestones: [
      ms('1', { status: 'invoiced', invoiceDate: iso(2026, 9, 1) }),
      ms('2', { status: 'invoiced', invoiceDate: iso(2026, 10, 25) }),
      ms('3', { status: 'paid', invoiceDate: iso(2026, 9, 1), paidDate: iso(2026, 10, 20) }),
    ] }));
    const now = overdueAt([f], NOW, 7);
    expect(now.value).toBe(118000);
    expect(now.invoices).toBe(1);
    expect(now.unpaid).toBe(236000);
    /* On 1 October the third had not been paid yet either. */
    expect(overdueAt([f], at(2026, 10, 1), 7).value).toBe(236000);
  });

  it('measures margin only where purchase orders exist, and says what was quoted elsewhere', () => {
    const measured = projectFact(project('a'), { posByProject: { a: [{ status: 'issued', total: 880000 }, { status: 'cancelled', total: 999999 }] } });
    const quoted = projectFact(project('b'));
    const m = marginOf([measured, quoted]);
    expect(m.measured).toBe(1);
    expect(m.quotedPct).toBeCloseTo(30, 5);
    expect(m.actualPct).toBeCloseTo(20, 5);
    expect(m.rows[0].leak).toBe(110000);
    expect(marginOf([quoted]).actualPct).toBeNull();
  });
});

describe('leads', () => {
  it('finds the furthest step a lost lead reached from its stage changes', () => {
    const l = lead('a', { stage: 'lost', touches: [
      { id: '1', at: 1, by: '', byName: '', kind: 'stage', text: 'Moved to Talking' },
      { id: '2', at: 2, by: '', byName: '', kind: 'stage', text: 'Moved to Site measured' },
      { id: '3', at: 3, by: '', byName: '', kind: 'stage', text: 'Lost: Budget' },
    ] });
    expect(furthestStage(l)).toBe(3);
    expect(furthestStage(lead('b', { stage: 'won' }))).toBe(5);
    expect(furthestStage(lead('c', { stage: 'meeting' }))).toBe(2);
  });
  it('counts the win rate over decided leads only', () => {
    const leads = [lead('a', { stage: 'won' }), lead('b', { stage: 'lost' }), lead('c', { stage: 'lost' }), lead('d', { stage: 'talking' })];
    const w = winRateIn(leads, periodWindow('month', NOW).cur);
    expect(w).toEqual({ won: 1, lost: 2, decided: 3, rate: (1 / 3) * 100 });
  });
});

describe('delivery', () => {
  it('judges handovers against their target date, and leaves undated ones out', () => {
    const onTime = projectFact(project('a', {}, { status: 'completed', targetHandoverDate: iso(2026, 10, 15), lifecycle: { gates: { handoverComplete: { at: at(2026, 10, 15, 18) } } } }));
    const late = projectFact(project('b', {}, { status: 'completed', targetHandoverDate: iso(2026, 10, 1), handoverDate: at(2026, 10, 11) }));
    const undated = projectFact(project('c', {}, { status: 'completed', handoverDate: at(2026, 10, 11) }));
    const h = handoversIn([onTime, late, undated], periodWindow('month', NOW).cur);
    expect(h.onTime).toBe(1);
    expect(h.late).toBe(1);
    expect(h.rate).toBe(50);
    expect(h.avgDelay).toBe(10);
    expect(h.undated).toBe(1);
  });
  it('flags live sites heading past their date, with the reason holding them', () => {
    const f = projectFact(project('a', {}, { targetHandoverDate: iso(2026, 11, 15) }), {
      schedulesByProject: { a: { finishAt: at(2026, 12, 3), targetAt: null, holdReason: null } },
      decisionsByProject: { a: [{ status: 'drawing_sent', title: 'Kitchen shutter finish', signoffRequestSentAt: at(2026, 10, 8) }] },
    });
    const ok = projectFact(project('b', {}, { targetHandoverDate: iso(2026, 12, 30) }));
    const rows = lateSites([f, ok], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].daysLate).toBe(18);
    expect(rows[0].reason).toBe('Waiting on the client for kitchen shutter finish (21 days)');
  });
});

describe('the scorecard', () => {
  const facts = [
    projectFact(project('a', {}, { paymentMilestones: [
      ms('1', { status: 'paid', invoiceDate: iso(2026, 10, 1), paidDate: iso(2026, 10, 6) }),
      ms('2', { status: 'invoiced', invoiceDate: iso(2026, 9, 1) }),
    ] }), { posByProject: { a: [{ status: 'issued', total: 880000 }] } }),
    projectFact(project('p', {}, { status: 'proposal_sent', lifecycle: { gates: {} } })),
  ];

  it('gives eight figures, each with what it counts', () => {
    const k = scorecard(input(facts, { targets: { ...DEFAULT_TARGETS, bookingsMonthly: 2200000 } }));
    expect(k.map((x) => x.key)).toEqual(['booked', 'cash', 'margin', 'overdue', 'winRate', 'pipeline', 'onTime', 'perPerson']);
    const by = Object.fromEntries(k.map((x) => [x.key, x]));
    expect(by.booked.value).toBe(1100000);
    expect(by.booked.bar?.pct).toBe(50);
    expect(by.booked.state).toBe('bad');
    expect(by.cash.value).toBe(118000);
    expect(by.margin.value).toBeCloseTo(20, 5);
    expect(by.margin.state).toBe('bad');
    expect(by.overdue.value).toBe(118000);
    expect(by.pipeline.value).toBeCloseTo(1100000 * 0.4, 5);
    expect(by.perPerson.value).toBe(110000);
    for (const x of k) expect(x.how.length).toBeGreaterThan(20);
  });

  it('shows no target where the owner set none, and no figure where nothing was read', () => {
    const k = scorecard(input(facts, { leads: null, headcount: null }));
    const by = Object.fromEntries(k.map((x) => [x.key, x]));
    expect(by.booked.bar).toBeNull();
    expect(by.booked.state).toBe('none');
    expect(by.winRate.value).toBeNull();
    expect(by.winRate.line).toBe('The leads could not be read');
    expect(by.perPerson.value).toBeNull();
  });

  it('leads with the worst news, and suggests the largest money first', () => {
    const i = input(facts);
    const h = headline(i, scorecard(i));
    expect(h.tone).toBe('warn');
    expect(h.text).toContain('₹1.2L is more than 7 days overdue');
    const a = actionsOf(i);
    expect(a[0].title).toBe('Chase Project a: ₹1.2L, 58 days overdue');
    expect(a[0].go).toEqual({ section: 'money', projectId: 'a', tab: 'payment-calc' });
    expect(a[1].title).toContain('under its quoted margin');
  });
});

describe('the sections', () => {
  it('Sales: the funnel, the sources and the reasons lost', () => {
    const won = projectFact(project('w'));
    const leads = [
      lead('1', { stage: 'won', source: 'referral', projectId: 'w', firstTouchAt: at(2026, 10, 2) + 5 * 60000 }),
      lead('2', { stage: 'lost', lostReason: 'Budget', source: 'instagram', touches: [{ id: 't', at: 1, by: '', byName: '', kind: 'stage', text: 'Moved to Talking' }] }),
      lead('3', { stage: 'proposal', source: 'instagram', lastTouchAt: at(2026, 10, 10) }),
    ];
    const s = salesReport(input([won], { leads }));
    expect(s.enquiries).toBe(3);
    expect(s.funnel.map((x) => x.count)).toEqual([3, 3, 2, 2, 2, 1]);
    expect(s.sources[0]).toMatchObject({ source: 'referral', leads: 1, won: 1, value: 1100000 });
    expect(s.reasons).toEqual([{ reason: 'Budget', count: 1 }]);
    expect(s.quiet.map((q) => q.days)).toEqual([19]);
    expect(s.speed[0]).toMatchObject({ leads: 1, signed: 100 });
    expect(s.firstReplyMin).toBe(5);
  });

  it('Money: ageing, debtors, break-even', () => {
    const f = projectFact(project('a', {}, { paymentMilestones: [
      ms('1', { status: 'invoiced', invoiceDate: iso(2026, 10, 20) }),
      ms('2', { status: 'invoiced', invoiceDate: iso(2026, 8, 1) }),
      ms('3', { status: 'pending', date: iso(2026, 11, 20) }),
      ms('4', { status: 'pending' }),
      ms('5', { status: 'paid', invoiceDate: iso(2026, 10, 1), paidDate: iso(2026, 10, 11) }),
    ] }));
    const m = moneyReport(input([f], { targets: targetsOf({ overheads: { salaries: 200000, rent: 50000, other: 50000 } }) }));
    expect(m.ageing.map((b) => b.count)).toEqual([1, 0, 1, 0]);
    /* Nine days is past the seven-day rule, so both invoices are overdue. */
    expect(m.debtors[0]).toMatchObject({ id: 'a', overdue: 236000, invoices: 2, oldestDays: 89 });
    expect(m.due.map((d) => d.value)).toEqual([0, 118000, 0]);
    expect(m.datedCount).toBe(1);
    expect(m.pendingCount).toBe(2);
    expect(m.daysToPaid).toBe(10);
    expect(m.breakEven.overheads).toBe(300000);
    expect(m.breakEven.bookings).toBeCloseTo(300000 / 0.3, 0);
    expect(m.breakEven.profit).toBeCloseTo(1100000 * 0.3 - 300000, 0);
  });

  it('Delivery: change orders and who carries how much', () => {
    const f = projectFact(project('a'), {
      designersByProject: { a: ['meera@s.in'] },
      additionsByProject: { a: [{ createdAt: at(2026, 10, 9), exGst: 110000, authorised: true, live: true, collected: 50000 }] },
    });
    const d = deliveryReport(input([f], { names: { 'meera@s.in': 'Meera N.' } }));
    expect(d.additions.authorised).toBe(110000);
    expect(d.additions.share).toBeCloseTo(10, 5);
    expect(d.team).toEqual([{ email: 'meera@s.in', name: 'Meera N.', role: 'Designer', kind: 'design', live: 1, capacity: 4, booked: 1100000 }]);
    expect(d.room).toBe(3);
  });

  it('Delivery: lists the team once each, and sets apart addresses that are not on it', () => {
    const f = projectFact(project('a'), { designersByProject: { a: ['tanvi@studio.in', 'tanvi.old@gmail.com', 'anushka@studio.in'] } });
    const roster = [
      { email: 'Tanvi@studio.in', name: 'Tanvi', role: 'Designer' },
      { email: 'meera@studio.in', name: 'Meera', role: 'Designer' },
      { email: 'sana@studio.in', name: 'Sana', role: 'Site Supervisor' },
      { email: 'acc@studio.in', name: 'Accounts', role: 'Admin' },
      { email: 'anushka@studio.in', name: 'Anushka', role: 'Client Relations' },
    ];
    const d = deliveryReport(input([f], { roster }));
    expect(d.team.map((r) => [r.name, r.live])).toEqual([['Tanvi', 1], ['Meera', 0], ['Sana', 0]]);
    expect(d.notOnTeam).toEqual(['tanvi.old@gmail.com']);
    /* Client Relations coordinate every project: not in this table, and not an unknown address either. */
    expect(d.room).toBe(3 + 4);
  });

  it('Client Relations: judged on the leads they own, and what they chase for the studio', () => {
    const f = projectFact(project('a', {}, { paymentMilestones: [ms('1', { status: 'invoiced', invoiceDate: iso(2026, 9, 1) })] }), {
      decisionsByProject: { a: [{ status: 'notified', title: 'Mandir layout', notifiedAt: at(2026, 9, 3) }] },
    });
    const roster = [{ email: 'anushka@studio.in', name: 'Anushka', role: 'Client Relations' }, { email: 'riya@studio.in', name: 'Riya', role: 'Client Relations' }];
    const mine = (o: Partial<Lead>) => lead(Math.random().toString(36).slice(2), { ownerEmail: 'anushka@studio.in', ...o });
    const leads = [
      mine({ stage: 'new', createdAt: NOW - 3 * 3600000, firstTouchAt: null, lastTouchAt: null }),
      mine({ stage: 'talking', createdAt: at(2026, 10, 1), firstTouchAt: at(2026, 10, 1) + 20 * 60000, lastTouchAt: at(2026, 10, 20) }),
      mine({ stage: 'won', createdAt: at(2026, 10, 2), firstTouchAt: at(2026, 10, 2) + 10 * 60000, updatedAt: at(2026, 10, 15),
        meetings: [{ id: 'm', date: iso(2026, 10, 8), time: null, mode: null, purpose: '', status: 'done', outcome: '', at: 1, by: '', byName: '' }] }),
      mine({ stage: 'proposal', createdAt: at(2026, 9, 1), firstTouchAt: at(2026, 9, 1), lastTouchAt: at(2026, 10, 1) }),
      lead('o', { ownerEmail: 'owner@studio.in', ownerName: 'Owner', stage: 'talking', firstTouchAt: NOW, lastTouchAt: NOW }),
    ];
    const r = clientRelationsReport(input([f], { roster, leads }));
    const a = r.rows.find((x) => x.email === 'anushka@studio.in')!;
    expect(a).toMatchObject({ open: 3, capacity: 25, notCalled: 1, quiet: 2, firstReplyMin: 15, meetings: 1, won: 1, decided: 1, state: 'behind' });
    expect(r.rows.find((x) => x.email === 'riya@studio.in')).toMatchObject({ open: 0, state: 'ok' });
    expect(r.rows.find((x) => x.email === 'owner@studio.in')).toMatchObject({ open: 1, role: 'Lead owner' });
    expect(r.chase).toMatchObject({ overdue: 118000, overdueInvoices: 1, waiting: 1, quietProposals: 1, liveClients: 1 });
    expect(r.chase.longestWait).toEqual({ project: 'Project a', title: 'Mandir layout', days: 56 });
  });
});

describe('targets', () => {
  it('fills in defaults, keeps money targets empty until set, and stores only known keys', () => {
    const t = targetsOf({ bookingsMonthly: '5000000', winRatePct: 400, overheads: { salaries: 680000, rent: -1 }, extra: 'x' });
    expect(t.bookingsMonthly).toBe(5000000);
    expect(t.collectionsMonthly).toBeNull();
    expect(t.winRatePct).toBe(100);
    expect(t.overheads).toEqual({ salaries: 680000, rent: 0, other: 0 });
    expect(overheadsMonthly(t)).toBe(680000);
    expect(Object.keys(storedTargets(t, 'o@s.in', 1)).sort()).toEqual(['bookingsMonthly', 'collectionsMonthly', 'leadsPerClientRelations', 'onTimePct', 'overheads', 'perPersonMonthly', 'pipelineMonths', 'projectsPerDesigner', 'sitesPerSupervisor', 'updatedAt', 'updatedBy', 'winRatePct']);
  });
  it('formats money the way the studio reads it', () => {
    expect(inr(4260000)).toBe('₹42.6L');
    expect(inr(26400000)).toBe('₹2.64Cr');
    expect(inr(8400)).toBe('₹8,400');
    expect(inr(5000000)).toBe('₹50L');
    expect(inr(10000000)).toBe('₹1Cr');
  });
});
