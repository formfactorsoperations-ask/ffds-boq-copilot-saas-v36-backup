/*
  The smart workspace, PR 1 (owner, 27 Nov 2026): what is wrong in each
  conversation (lib/projectSignals), the Money card, the ripple, and "Since you
  were here" (lib/projectCatchUp).
*/
import { describe, it, expect } from 'vitest';
import { projectSignals, signalOf, moneyPicture, rippleSteps, rippleRoute } from '../../lib/projectSignals';
import { catchUp, sinceLabel } from '../../lib/projectCatchUp';
import type { ClientMoney } from '../../lib/clientMoney';
import type { HubAlert } from '../../lib/hubAlerts';
import type { StoryItem } from '../../lib/projectThread';

const NOW = Date.parse('2026-11-27T10:00:00');
const DAY = 86400000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);

const MILESTONES = [
  { id: 'm1', type: 'design', name: 'Sign-up & Concept', percentage: 40, description: '', status: 'invoiced', invoiceDate: iso(20), invoiceNumber: 'FF-01' },
  { id: 'm2', type: 'design', name: 'Design Development', percentage: 55, description: '', status: 'pending', date: iso(3) },
];

const money = (over: Partial<ClientMoney> = {}): ClientMoney => ({
  projectValue: 888186, totalPaid: 0, balanceDue: 888186,
  milestones: [
    { id: 'm1', type: 'design', name: 'Sign-up & Concept', percentage: 40, status: 'invoiced', owed: 10590, invoiceNumber: 'FF-01', invoiceDate: iso(20), date: null },
    { id: 'm2', type: 'design', name: 'Design Development', percentage: 55, status: 'pending', owed: 124000, invoiceNumber: null, invoiceDate: null, date: iso(3) },
  ],
  ...over,
});

const ctx = (over: any = {}) => ({ status: 'proposal_sent', currentStage: 3, paymentMilestones: MILESTONES, ...over });

describe('moneyPicture: the Money card', () => {
  it('says what is unpaid, with days, and what is earned but not invoiced', () => {
    const mp = moneyPicture(ctx(), money(), { now: NOW })!;
    expect(mp.unpaid).toEqual([{ id: 'm1', name: 'Sign-up & Concept', amount: 10590, days: 20, level: 2 }]);
    expect(mp.unpaidTotal).toBe(10590);
    expect(mp.earned.map((e) => e.name)).toEqual(['Design Development']);
    expect(mp.earnedTotal).toBe(124000);
    expect(mp.nextToBill).toBeNull();
  });

  it('catches stages that no longer add up to 100%', () => {
    expect(moneyPicture(ctx(), money(), { now: NOW })!.drift).toEqual({ design: 95, execution: null });
  });

  it('shows no amounts where they are hidden, but still the stages and days', () => {
    const hidden = money({ amountsHidden: true, projectValue: null, totalPaid: null, balanceDue: null, milestones: money().milestones.map((m) => ({ ...m, owed: null })) });
    const mp = moneyPicture(ctx(), hidden, { now: NOW })!;
    expect(mp.hidden).toBe(true);
    expect(mp.unpaid[0]).toMatchObject({ name: 'Sign-up & Concept', amount: null, days: 20 });
    expect(mp.unpaidTotal).toBeNull();
    expect(mp.earnedTotal).toBeNull();
  });

  it('leaves a disputed invoice off the chase', () => {
    const m = money();
    m.milestones[0].disputed = true;
    expect(moneyPicture(ctx(), m, { now: NOW })!.unpaid).toEqual([]);
  });

  it('measures how this client pays only from two paid stages or more', () => {
    const paid = [
      { id: 'a', type: 'design', name: 'A', percentage: 50, description: '', status: 'paid', invoiceDate: iso(40), paidDate: iso(30) },
      { id: 'b', type: 'design', name: 'B', percentage: 50, description: '', status: 'paid', invoiceDate: iso(20), paidDate: iso(12) },
    ];
    const m: ClientMoney = { ...money(), milestones: [] };
    expect(moneyPicture(ctx({ paymentMilestones: paid }), m, { now: NOW })!.pays).toEqual({ meanDays: 9, settled: 2 });
    expect(moneyPicture(ctx({ paymentMilestones: paid.slice(0, 1) }), m, { now: NOW })!.pays).toBeNull();
  });

  it('is nothing without a schedule', () => {
    expect(moneyPicture(ctx({ paymentMilestones: [] }), money(), { now: NOW })).toBeNull();
    expect(moneyPicture(ctx(), null, { now: NOW })).toBeNull();
  });
});

describe('projectSignals: one reason per conversation', () => {
  const alerts: HubAlert[] = [
    { id: 'money-drift', kind: 'portal', label: 'Client portal', severity: 0, title: '2 figures on their portal are out of date', detail: 'contract total ₹8,00,000 → ₹8,88,186', when: 'sent 2 days ago', goTo: 'client-portal', cta: 'Check' },
    { id: 'ask-s1', kind: 'client', label: 'From the client', severity: 0, title: 'Your client asked about Kitchen shutters', detail: '“Can we do matte?” — still unanswered.', goTo: 'materials', cta: 'Reply' },
    { id: 'invoiced', kind: 'money', label: 'Money', severity: 2, title: '1 invoice raised and unpaid', detail: '', goTo: 'payment-calc', cta: 'Open Money' },
  ];
  const drawings: any[] = [
    { id: 'd1', name: 'Kitchen elevations', targetDate: iso(4), status: 'in_progress' },
    { id: 'd2', name: 'Living room plan', targetDate: iso(-30), status: 'in_progress' },
  ];
  const decisions = [{ id: 'q1', status: 'pending', notifiedAt: NOW - 16 * DAY }];
  const all = () => projectSignals({ context: ctx({ projectDecisions: decisions }), money: money(), alerts, drawings, now: NOW });

  it('places each signal in the conversation that owns its screen', () => {
    const s = all();
    expect(signalOf(s, 'money')).toMatchObject({ id: 'money-unpaid', tone: 'late', line: 'Sign-up & Concept unpaid 20 days' });
    expect(signalOf(s, 'chat')).toMatchObject({ id: 'alert-money-drift', tone: 'turn' });
    expect(signalOf(s, 'design')).toMatchObject({ id: 'drawings-overdue', tone: 'late', line: '1 drawing past the target date' });
    expect(signalOf(s, 'plan')).toMatchObject({ id: 'risk-decision-latency', tone: 'late' });
  });

  it('never puts an amount on a list line', () => {
    for (const s of all()) expect(s.line).not.toMatch(/₹/);
  });

  it('says unpaid invoices once, with their days, not the Hub alert too', () => {
    const ids = all().map((s) => s.id);
    expect(ids).toContain('money-unpaid');
    expect(ids).not.toContain('alert-invoiced');
  });

  it('sorts late before your turn, then by weight', () => {
    const tones = all().map((s) => s.tone);
    expect(tones.indexOf('turn')).toBeGreaterThan(tones.lastIndexOf('late'));
    const late = all().filter((s) => s.tone === 'late').map((s) => s.weight);
    expect(late).toEqual([...late].sort((a, b) => b - a));
  });

  it('gives Whole project no signal of its own', () => {
    expect(signalOf(all(), 'whole')).toBeNull();
  });

  it('says nothing on a quiet project', () => {
    expect(projectSignals({ context: { status: 'proposal_sent', currentStage: 2 }, money: null, alerts: [], drawings: [], now: NOW })).toEqual([]);
  });

  it('calls an invoice inside its terms nobody’s turn yet', () => {
    const m = money();
    m.milestones[0].invoiceDate = iso(3);
    const c = ctx({ paymentMilestones: [{ ...MILESTONES[0], invoiceDate: iso(3) }] });
    expect(projectSignals({ context: c, money: m, alerts: [], drawings: null, now: NOW }).find((s) => s.id === 'money-unpaid')).toBeUndefined();
  });
});

describe('rippleSteps: what the client holds that is older than the schedule', () => {
  it('lists the steps in order, each opening its screen', () => {
    const c = ctx({
      paymentSchedules: [{ version: 1, issuedAt: NOW - 10 * DAY, advances: [{ milestoneId: 'm1', phase: 'design', label: 'Sign-up & Concept', percentage: 40 }] }],
      documents: { issues: [{ kind: 'payment_schedule', version: 1, issuedAt: NOW - 9 * DAY }] },
    });
    const steps = rippleSteps(c);
    expect(steps.map((s) => s.key)).toEqual(['generate', 'reissue-schedule', 'portal']);
    expect(steps.map(rippleRoute)).toEqual(['payment-calc', 'docs', 'client-portal']);
    expect(projectSignals({ context: c, money: null, alerts: [], drawings: null, now: NOW }).map((s) => s.id)).toContain('ripple');
  });

  it('is empty when nothing was ever issued', () => {
    expect(rippleSteps(ctx())).toEqual([]);
  });
});

describe('catchUp: since you were here', () => {
  const item = (id: string, hoursAgo: number, over: Partial<StoryItem> = {}): StoryItem => ({
    id, at: NOW - hoursAgo * 3600000, kind: 'event', side: 'studio', text: id, projectId: 'p1', convs: ['plan'], route: null, ...over,
  });
  const story = [
    item('old', 100),
    item('note', 5),
    item('paid', 4, { source: 'payments', convs: ['money'], route: 'payment-calc' }),
    item('approved', 3, { side: 'client', convs: ['design'] }),
    item('signed', 2, { kind: 'sticker', convs: ['docs'] }),
    item('site', 1, { source: 'site', convs: ['site'] }),
  ];

  it('puts the client first, then milestones, then payments, then the rest', () => {
    const c = catchUp(story, NOW - 48 * 3600000, 4)!;
    expect(c.lines.map((l) => l.id)).toEqual(['approved', 'signed', 'paid', 'site']);
    expect(c.more).toBe(1);
    expect(catchUp(story, NOW - 48 * 3600000)!.lines).toHaveLength(3);
    expect(c.lines[0].conv).toBe('design');
  });

  it('leaves out a sticker that only says where things stand (unpaid, no reply)', () => {
    const c = catchUp([...story, item('unpaid', 0, { kind: 'sticker', tone: 'bad', convs: ['money'] })], NOW - 48 * 3600000, 9)!;
    expect(c.lines.map((l) => l.id)).not.toContain('unpaid');
  });

  it('says nothing on a first visit or when nothing moved', () => {
    expect(catchUp(story, null)).toBeNull();
    expect(catchUp(story, NOW)).toBeNull();
  });

  it('words the last visit plainly', () => {
    expect(sinceLabel(NOW - DAY, NOW)).toBe('yesterday');
    expect(sinceLabel(NOW - 3 * DAY, NOW)).toMatch(/24 Nov/);
  });
});
