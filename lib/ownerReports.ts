/*
  OWNER REPORTS: the numbers a studio owner runs the business by.

  Approved as mockups on 29 Oct 2026: a scorecard of eight figures, each against
  its target and the period before, then Sales, Money, and Delivery and team.
  This file works every figure out; the screens in components/reports only
  draw them.

  The rules it keeps:
    - Money comes from calculateProjectFinancials, never re-derived here. A
      milestone's amount is the one that function reports for it
      (milestoneAmounts), initiation-fee offset included.
    - Sales booked is before GST: the contract's taxable execution and design,
      plus scope additions the client authorised. Cash is what the client paid.
    - A figure with nothing behind it is null, not zero, and says what is
      missing. A zero reads as a fact.
    - Every period has a period before it to compare with: the month before,
      the three months before, or the same months of the last financial year
      (India's, from 1 April).

  Pure, and shared by the screens and the tests.
*/
import { calculateProjectFinancials } from './financialsUtils';
import { LOST_REASONS, LEAD_SOURCES, LEAD_STAGES, BOARD_STAGES, type Lead, type LeadSource, type LeadStage } from './leads';
import type { ReportTargets } from './reportTargets';
import { overheadsMonthly } from './reportTargets';

const DAY = 86400000;

/* ── Formatting ─────────────────────────────────────────────────────────── */

/** "₹42.6L", "₹2.64Cr", "₹8,400". */
export function inr(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '₹0';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  /* "₹50L", not "₹50.0L". */
  const trim = (s: string) => s.replace(/\.0+$/, '');
  if (a >= 1e7) return `${sign}₹${trim((a / 1e7).toFixed(2))}Cr`;
  if (a >= 1e5) return `${sign}₹${trim((a / 1e5).toFixed(1))}L`;
  return `${sign}₹${Math.round(a).toLocaleString('en-IN')}`;
}
export const pctText = (v: number) => `${v.toFixed(v >= 10 || Number.isInteger(v) ? 0 : 1)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ── Periods ────────────────────────────────────────────────────────────── */

export type ReportPeriod = 'month' | 'quarter' | 'fy';
export interface Range { start: number; end: number }
export interface PeriodWindow {
  period: ReportPeriod;
  cur: Range;
  prev: Range;
  /** "October", "Last 3 months", "FY 26–27 so far". */
  label: string;
  /** "with September". */
  compareLabel: string;
  /** Calendar months the period spans, the current one included. */
  months: number;
  /** Days left in the month, for the month view. */
  daysLeft: number | null;
  /** The months inside the period, oldest first, as YYYY-MM. */
  monthKeys: string[];
  now: number;
}

const monthStart = (y: number, m: number) => new Date(y, m, 1).getTime();
const MONTH = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'long' });
const MON = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'short' });
export const monthKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const monthShort = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return MON(y, m - 1);
};
const keysBetween = (start: number, end: number): string[] => {
  const out: string[] = [];
  const d = new Date(start);
  let y = d.getFullYear(), m = d.getMonth();
  while (monthStart(y, m) < end) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
};

export function periodWindow(period: ReportPeriod, now: number): PeriodWindow {
  const d = new Date(now);
  const y = d.getFullYear(), m = d.getMonth();
  if (period === 'month') {
    const start = monthStart(y, m);
    const prevStart = monthStart(y, m - 1);
    const pm = new Date(prevStart);
    const end = monthStart(y, m + 1);
    return {
      period, now, months: 1,
      cur: { start, end: now }, prev: { start: prevStart, end: start },
      label: MONTH(y, m), compareLabel: `with ${MONTH(pm.getFullYear(), pm.getMonth())}`,
      daysLeft: Math.max(0, Math.ceil((end - now) / DAY) - 1),
      monthKeys: keysBetween(start, now + 1),
    };
  }
  if (period === 'quarter') {
    const start = monthStart(y, m - 2);
    const prevStart = monthStart(y, m - 5);
    const a = new Date(prevStart), b = new Date(monthStart(y, m - 3));
    return {
      period, now, months: 3,
      cur: { start, end: now }, prev: { start: prevStart, end: start },
      label: 'Last 3 months',
      compareLabel: `with ${MONTH(a.getFullYear(), a.getMonth())} to ${MONTH(b.getFullYear(), b.getMonth())}`,
      daysLeft: null,
      monthKeys: keysBetween(start, now + 1),
    };
  }
  /* India's financial year runs from 1 April. */
  const fyYear = m >= 3 ? y : y - 1;
  const start = monthStart(fyYear, 3);
  const lastYearNow = new Date(now); lastYearNow.setFullYear(lastYearNow.getFullYear() - 1);
  const yy = (n: number) => String(n % 100).padStart(2, '0');
  return {
    period, now,
    months: (y - fyYear) * 12 + m - 3 + 1,
    cur: { start, end: now }, prev: { start: monthStart(fyYear - 1, 3), end: lastYearNow.getTime() },
    label: `FY ${yy(fyYear)}–${yy(fyYear + 1)} so far`,
    compareLabel: `with April to ${MONTH(y, m)} last year`,
    daysLeft: null,
    monthKeys: keysBetween(start, now + 1),
  };
}

const inRange = (t: number | null | undefined, r: Range) => t != null && t >= r.start && t < r.end;

/** The six calendar months up to now, as ranges, for the trend lines. */
export function lastSixMonths(now: number): { key: string; range: Range }[] {
  const d = new Date(now);
  const out: { key: string; range: Range }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = monthStart(d.getFullYear(), d.getMonth() - i);
    const next = monthStart(d.getFullYear(), d.getMonth() - i + 1);
    out.push({ key: monthKey(start), range: { start, end: Math.min(next, now + 1) } });
  }
  return out;
}

/* ── What a project tells the reports ───────────────────────────────────── */

export const MONEY_STATUSES = ['won', 'execution', 'work_paused', 'completed'];
export const LIVE_STATUSES = ['execution', 'work_paused'];
export const PIPELINE_STATUSES = ['lead', 'draft', 'proposal_sent', 'negotiation'];

/** The share of a project at each pipeline status that usually signs. */
export const STAGE_CHANCE: Record<string, number> = { lead: 0.1, draft: 0.15, proposal_sent: 0.4, negotiation: 0.6 };
export const STAGE_LABEL: Record<string, string> = { lead: 'Lead', draft: 'Drafting the proposal', proposal_sent: 'Proposal sent', negotiation: 'Negotiating' };

export interface MilestoneFact {
  id: string;
  name: string;
  type: string;
  status: 'pending' | 'invoiced' | 'paid';
  amount: number;
  invoicedAt: number | null;
  /** When it was marked received; null on payments marked before that was kept. */
  paidAt: number | null;
  /** The date planned for it on the schedule, if any. */
  dueAt: number | null;
}

export interface AdditionFact {
  createdAt: number | null;
  /** Sell before GST. */
  exGst: number;
  authorised: boolean;
  /** Put to the client (not a draft, not cancelled). */
  live: boolean;
  collected: number;
}

export interface DecisionFact { title: string; waiting: boolean; since: number | null }
export interface ScheduleFact { finishAt: number | null; targetAt: number | null; holdReason: string | null }

export interface ProjectFact {
  id: string;
  name: string;
  client: string;
  status: string;
  area: number;
  bookedAt: number | null;
  /** Taxable execution and design, before GST. */
  execution: number;
  design: number;
  plannedCost: number;
  committed: number;
  milestones: MilestoneFact[];
  additions: AdditionFact[];
  targetHandoverAt: number | null;
  handedOverAt: number | null;
  snags: { raisedAt: number; resolvedAt: number | null; open: boolean; severity: string }[];
  decisions: DecisionFact[];
  schedule: ScheduleFact | null;
  designers: string[];
  supervisors: string[];
}

const dateOf = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof (v as any)?.toMillis === 'function') return (v as any).toMillis();
  if (typeof (v as any)?.seconds === 'number') return (v as any).seconds * 1000;
  const s = String(v);
  /* A bare day is the studio's day, not midnight in London. */
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`).getTime() : new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
};
export { dateOf };

/** Same resolution order as getSingleProjectValue, so every screen quotes one tier. */
const tierOf = (p: any) => {
  const id = p.activeTierId || p.context?.approvedTierId;
  return p.tiers?.find((t: any) => t.id === id) || p.tiers?.find((t: any) => t.name === 'Comfort Upgrade') || p.tiers?.[0];
};

const WAITING = ['notified', 'drawing_pending', 'drawing_sent', 'disputed'];

export interface FactSources {
  posByProject?: Record<string, any[]>;
  additionsByProject?: Record<string, AdditionFact[]>;
  decisionsByProject?: Record<string, any[]>;
  schedulesByProject?: Record<string, ScheduleFact | null>;
  designersByProject?: Record<string, string[]>;
}

/** One project, reduced to what the reports read. */
export function projectFact(p: any, src: FactSources = {}): ProjectFact {
  const ctx = p.context || {};
  const status = ctx.status || 'draft';
  let fin: any = null;
  try { fin = calculateProjectFinancials(ctx, tierOf(p)); } catch { fin = null; }
  const gates = ctx.lifecycle?.gates || {};
  const pos = (src.posByProject?.[p.id] || []).filter((po: any) => po && ['issued', 'received', 'closed'].includes(po.status));
  const committed = pos.reduce((s: number, po: any) => s + Math.max(Number(po.total) || 0, Number(po.billAmount) || 0), 0);
  const milestones: MilestoneFact[] = ((ctx.paymentMilestones || []) as any[]).map((m) => {
    const st = String(m.status || 'pending').toLowerCase();
    return {
      id: String(m.id || ''),
      name: String(m.name || 'Payment'),
      type: m.type === 'design' ? 'design' : 'execution',
      status: st === 'paid' ? 'paid' : st === 'invoiced' || st === 'advance_requested' ? 'invoiced' : 'pending',
      amount: Number(fin?.milestoneAmounts?.[m.id] ?? (fin?.calculateMilestoneTotal ? fin.calculateMilestoneTotal(m) : 0)) || 0,
      invoicedAt: dateOf(m.invoiceDate),
      paidAt: dateOf(m.paidDate),
      dueAt: dateOf(m.date),
    };
  });
  const decisions: DecisionFact[] = (src.decisionsByProject?.[p.id] || []).map((d: any) => ({
    title: String(d.title || d.decisionText || 'A decision'),
    waiting: WAITING.includes(String(d.status || '')),
    since: dateOf(d.signoffRequestSentAt) ?? dateOf(d.notifiedAt) ?? dateOf(d.createdAt),
  }));
  return {
    id: p.id,
    name: ctx.name || ctx.clientName || 'Untitled',
    client: ctx.clientName || ctx.name || '',
    status,
    area: Number(ctx.area) || 0,
    bookedAt: MONEY_STATUSES.includes(status) ? (dateOf(gates.proposalAccepted?.at) ?? dateOf(gates.contractSigned?.at)) : null,
    execution: Number(fin?.taxableExecution) || 0,
    design: Number(fin?.taxableDesign) || 0,
    plannedCost: Number(tierOf(p)?.summary?.totalCost) || 0,
    committed,
    milestones,
    additions: src.additionsByProject?.[p.id] || [],
    targetHandoverAt: dateOf(ctx.targetHandoverDate) ?? src.schedulesByProject?.[p.id]?.targetAt ?? null,
    handedOverAt: dateOf(gates.handoverComplete?.at) ?? dateOf(ctx.handoverDate),
    snags: ((ctx.snagList || []) as any[]).filter(Boolean).map((s) => ({
      raisedAt: dateOf(s.raisedAt) || 0,
      resolvedAt: dateOf(s.resolvedAt),
      open: s.status !== 'resolved' && s.status !== 'verified',
      severity: String(s.severity || 'medium'),
    })),
    decisions,
    schedule: src.schedulesByProject?.[p.id] ?? null,
    designers: src.designersByProject?.[p.id] || [],
    supervisors: ((ctx.assignedSupervisors || []) as any[]).map((x) => String(x).toLowerCase()).filter(Boolean),
  };
}

const contract = (f: ProjectFact) => f.execution + f.design;
const authorisedAdds = (f: ProjectFact) => f.additions.filter((a) => a.live && a.authorised);

/* ── Inputs and outputs ─────────────────────────────────────────────────── */

export interface OwnerReportInput {
  facts: ProjectFact[];
  /** Null when the leads could not be read: the lead figures then say so. */
  leads: Lead[] | null;
  /** People on the team; null when People could not be read. */
  headcount: number | null;
  /** Email to name, and email to role, for the team table. */
  names?: Record<string, string>;
  roles?: Record<string, string>;
  /** The studio's team list (Studio settings → Team): who the team table is made of. */
  roster?: { email: string; name: string; role: string }[];
  targets: ReportTargets;
  /** Ops Desk: a payment is late this many days after its invoice. */
  lateAfterDays: number;
  period: ReportPeriod;
  now: number;
}

export type Tone = 'ok' | 'warn' | 'bad' | 'none';
export interface Delta { text: string; dir: 'up' | 'down' | 'flat'; good: boolean }
export interface Kpi {
  key: 'booked' | 'cash' | 'margin' | 'overdue' | 'winRate' | 'pipeline' | 'onTime' | 'perPerson';
  label: string;
  value: number | null;
  format: 'inr' | 'pct';
  line: string;
  delta: Delta | null;
  state: Tone;
  bar: { pct: number; text: string } | null;
  spark: number[];
  how: string;
  section: 'sales' | 'money' | 'delivery';
}

/* ── Money in a range ───────────────────────────────────────────────────── */

const money = (facts: ProjectFact[]) => facts.filter((f) => MONEY_STATUSES.includes(f.status));

export function bookedIn(facts: ProjectFact[], r: Range) {
  let value = 0, execution = 0, design = 0, additions = 0, count = 0, area = 0, areaValue = 0;
  const rows: ProjectFact[] = [];
  for (const f of money(facts)) {
    if (inRange(f.bookedAt, r)) {
      count++; rows.push(f);
      execution += f.execution; design += f.design;
      if (f.area > 0) { area += f.area; areaValue += contract(f); }
    }
    for (const a of authorisedAdds(f)) if (inRange(a.createdAt, r)) additions += a.exGst;
  }
  value = execution + design + additions;
  return { value, execution, design, additions, count, rows, perSqft: area > 0 ? areaValue / area : null };
}

/** When a payment landed: the day it was marked received, else its invoice date. */
const landedAt = (m: MilestoneFact) => m.paidAt ?? m.invoicedAt;

export function cashIn(facts: ProjectFact[], r: Range) {
  let value = 0, count = 0, undated = 0;
  const clients = new Set<string>();
  for (const f of money(facts)) {
    for (const m of f.milestones) {
      if (m.status !== 'paid') continue;
      const t = landedAt(m);
      if (t == null) { undated++; continue; }
      if (!inRange(t, r)) continue;
      value += m.amount; count++; clients.add(f.id);
    }
  }
  return { value, count, clients: clients.size, undated };
}

export function billedIn(facts: ProjectFact[], r: Range) {
  let value = 0, count = 0;
  for (const f of money(facts)) for (const m of f.milestones) {
    if (m.status !== 'pending' && inRange(m.invoicedAt, r)) { value += m.amount; count++; }
  }
  return { value, count };
}

/**
 * Invoices more than `lateDays` old and unpaid at time `t`. A payment marked
 * received without a date is taken to have been paid by then, which is the
 * kinder reading and the only one available.
 */
export function overdueAt(facts: ProjectFact[], t: number, lateDays: number) {
  let value = 0, invoices = 0, unpaid = 0;
  const clients = new Set<string>();
  for (const f of money(facts)) for (const m of f.milestones) {
    if (m.status === 'pending' || m.invoicedAt == null || m.invoicedAt > t) continue;
    const stillOpen = m.status === 'invoiced' || (m.paidAt != null && m.paidAt > t);
    if (!stillOpen) continue;
    unpaid += m.amount;
    if (t - m.invoicedAt > lateDays * DAY) { value += m.amount; invoices++; clients.add(f.id); }
  }
  return { value, invoices, clients: clients.size, unpaid };
}

export interface MarginRow {
  id: string; name: string; contracted: number; quotedPct: number; actualPct: number; leak: number;
}
export function marginOf(facts: ProjectFact[]) {
  const rows = money(facts).filter((f) => contract(f) > 0);
  const total = rows.reduce((s, f) => s + contract(f), 0);
  const planned = rows.reduce((s, f) => s + f.plannedCost, 0);
  const measured = rows.filter((f) => f.committed > 0);
  const mContract = measured.reduce((s, f) => s + contract(f), 0);
  const mPlanned = measured.reduce((s, f) => s + f.plannedCost, 0);
  const mCommitted = measured.reduce((s, f) => s + f.committed, 0);
  const list: MarginRow[] = measured.map((f) => {
    const c = contract(f);
    return {
      id: f.id, name: f.name, contracted: c,
      quotedPct: ((c - f.plannedCost) / c) * 100,
      actualPct: ((c - f.committed) / c) * 100,
      leak: f.committed - f.plannedCost,
    };
  }).sort((a, b) => b.leak - a.leak);
  return {
    quotedPct: total > 0 ? ((total - planned) / total) * 100 : null,
    measuredQuotedPct: mContract > 0 ? ((mContract - mPlanned) / mContract) * 100 : null,
    actualPct: mContract > 0 ? ((mContract - mCommitted) / mContract) * 100 : null,
    leak: mCommitted - mPlanned,
    measured: measured.length,
    contracted: rows.length,
    rows: list,
  };
}

/* ── Leads in a range ───────────────────────────────────────────────────── */

/** The furthest board stage a lead reached, from its stage and its stage changes. */
export function furthestStage(l: Lead): number {
  if (l.stage === 'won') return BOARD_STAGES.length;
  let best = BOARD_STAGES.indexOf(l.stage as LeadStage);
  for (const t of l.touches || []) {
    if (t.kind !== 'stage') continue;
    const i = BOARD_STAGES.findIndex((s) => t.text === `Moved to ${LEAD_STAGES.find((x) => x.id === s)?.label}`);
    if (i > best) best = i;
  }
  return Math.max(0, best);
}

export function winRateIn(leads: Lead[], r: Range) {
  const decided = leads.filter((l) => (l.stage === 'won' || l.stage === 'lost') && inRange(l.updatedAt, r));
  const won = decided.filter((l) => l.stage === 'won').length;
  return { won, lost: decided.length - won, decided: decided.length, rate: decided.length ? (won / decided.length) * 100 : null };
}

export function pipelineOf(facts: ProjectFact[]) {
  const stages = PIPELINE_STATUSES.map((s) => {
    const rows = facts.filter((f) => f.status === s);
    const value = rows.reduce((t, f) => t + contract(f), 0);
    return { key: s, label: STAGE_LABEL[s], count: rows.length, value, chance: STAGE_CHANCE[s], expected: value * STAGE_CHANCE[s] };
  });
  return { stages, expected: stages.reduce((s, x) => s + x.expected, 0), open: stages.reduce((s, x) => s + x.count, 0) };
}

/* ── Handovers in a range ───────────────────────────────────────────────── */

const endOfDay = (t: number) => { const d = new Date(t); d.setHours(23, 59, 59, 999); return d.getTime(); };

export function handoversIn(facts: ProjectFact[], r: Range) {
  const done = facts.filter((f) => inRange(f.handedOverAt, r));
  const judged = done.filter((f) => f.targetHandoverAt != null);
  const late = judged.filter((f) => (f.handedOverAt as number) > endOfDay(f.targetHandoverAt as number));
  /* Calendar days past the promised day, as lateSites counts them. */
  const delays = late.map((f) => Math.floor(((f.handedOverAt as number) - endOfDay(f.targetHandoverAt as number)) / DAY) + 1);
  return {
    done, judged: judged.length, onTime: judged.length - late.length, late: late.length,
    rate: judged.length ? ((judged.length - late.length) / judged.length) * 100 : null,
    avgDelay: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
    undated: done.length - judged.length,
  };
}

/* ── The scorecard ──────────────────────────────────────────────────────── */

const deltaPct = (cur: number, prev: number, upIsGood = true): Delta | null => {
  if (!(prev > 0)) return null;
  const p = ((cur - prev) / prev) * 100;
  if (Math.abs(p) < 0.5) return { text: '0%', dir: 'flat', good: true };
  const dir = p > 0 ? 'up' : 'down';
  /* Against a thin month a percentage says nothing ("3070%"); a multiple does. */
  const text = p >= 200 ? `${(cur / prev).toFixed(cur / prev >= 10 ? 0 : 1)}×` : `${Math.round(Math.abs(p))}%`;
  return { text, dir, good: (dir === 'up') === upIsGood };
};
const deltaPts = (cur: number | null, prev: number | null, upIsGood = true): Delta | null => {
  if (cur == null || prev == null) return null;
  const p = cur - prev;
  if (Math.abs(p) < 0.5) return { text: '0 pts', dir: 'flat', good: true };
  const dir = p > 0 ? 'up' : 'down';
  return { text: `${Math.abs(p).toFixed(Math.abs(p) >= 10 ? 0 : 1)} pts`, dir, good: (dir === 'up') === upIsGood };
};
const deltaInr = (cur: number, prev: number, upIsGood: boolean): Delta | null => {
  const p = cur - prev;
  if (Math.abs(p) < 1) return null;
  const dir = p > 0 ? 'up' : 'down';
  return { text: inr(Math.abs(p)), dir, good: (dir === 'up') === upIsGood };
};
/** On track at 95% of the target, worth watching from 75%, below that act. */
const toneFor = (share: number | null): Tone => share == null ? 'none' : share >= 0.95 ? 'ok' : share >= 0.75 ? 'warn' : 'bad';
const bar = (value: number, target: number | null) => target && target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : null;

export function scorecard(i: OwnerReportInput): Kpi[] {
  const w = periodWindow(i.period, i.now);
  const t = i.targets;
  const six = lastSixMonths(i.now);
  const facts = i.facts;

  /* 1. Sales booked. */
  const b = bookedIn(facts, w.cur), bp = bookedIn(facts, w.prev);
  const bTarget = t.bookingsMonthly ? t.bookingsMonthly * w.months : null;
  const bShare = bTarget ? b.value / bTarget : null;
  const booked: Kpi = {
    key: 'booked', label: 'Sales booked', section: 'sales', format: 'inr', value: b.value,
    line: b.count ? `${plural(b.count, 'contract')} signed` : 'No contracts signed yet',
    delta: deltaPct(b.value, bp.value), state: toneFor(bShare),
    bar: bTarget ? { pct: bar(b.value, bTarget) as number, text: `${Math.round((bShare as number) * 100)}% of the ${inr(bTarget)} target${w.daysLeft != null ? `, ${plural(w.daysLeft, 'day')} left` : ''}` } : null,
    spark: six.map((m) => bookedIn(facts, m.range).value),
    how: 'Value of proposals accepted in the period, before GST, plus scope additions the client authorised.',
  };

  /* 2. Cash received. */
  const c = cashIn(facts, w.cur), cp = cashIn(facts, w.prev);
  const cTarget = t.collectionsMonthly ? t.collectionsMonthly * w.months : null;
  const cShare = cTarget ? c.value / cTarget : null;
  const cash: Kpi = {
    key: 'cash', label: 'Cash received', section: 'money', format: 'inr', value: c.value,
    line: c.count ? `${plural(c.count, 'payment')} from ${plural(c.clients, 'client')}` : 'No payments received yet',
    delta: deltaPct(c.value, cp.value), state: toneFor(cShare),
    bar: cTarget ? { pct: bar(c.value, cTarget) as number, text: `${Math.round((cShare as number) * 100)}% of the ${inr(cTarget)} target` } : null,
    spark: six.map((m) => cashIn(facts, m.range).value),
    how: 'Payments marked received, by the day they were marked. Older payments without that day count on their invoice date.',
  };

  /* 3. Gross margin: real where purchase orders exist, quoted otherwise. */
  const mg = marginOf(facts);
  const gap = mg.actualPct != null && mg.measuredQuotedPct != null ? mg.measuredQuotedPct - mg.actualPct : null;
  const margin: Kpi = {
    key: 'margin', label: 'Gross margin', section: 'money', format: 'pct',
    value: mg.actualPct ?? mg.quotedPct,
    line: mg.measured ? `Measured on ${plural(mg.measured, 'project')} with purchase orders` : mg.contracted ? 'As quoted: no purchase orders raised yet' : 'No contracted work yet',
    delta: gap != null ? { text: `${Math.abs(gap).toFixed(1)} pts`, dir: gap > 0.05 ? 'down' : gap < -0.05 ? 'up' : 'flat', good: gap <= 0.05 } : null,
    state: gap == null ? (mg.quotedPct == null ? 'none' : 'warn') : gap >= 3 ? 'bad' : gap >= 1 ? 'warn' : 'ok',
    bar: gap != null && mg.measuredQuotedPct ? {
      pct: Math.max(0, Math.min(100, ((mg.actualPct as number) / mg.measuredQuotedPct) * 100)),
      text: gap > 0.05 ? `Quoted at ${pctText(mg.measuredQuotedPct)}, so ${gap.toFixed(1)} points are leaking` : `Quoted at ${pctText(mg.measuredQuotedPct)} and holding`,
    } : null,
    spark: [],
    how: 'Contract value less purchase-order cost, on projects with POs. Where none are raised the margin is as quoted.',
  };

  /* 4. Owed and overdue, as of now against the start of the period. */
  const od = overdueAt(facts, i.now, i.lateAfterDays), odp = overdueAt(facts, w.cur.start, i.lateAfterDays);
  const overdue: Kpi = {
    key: 'overdue', label: 'Owed and overdue', section: 'money', format: 'inr', value: od.value,
    line: od.invoices ? `${plural(od.invoices, 'invoice')} past ${plural(i.lateAfterDays, 'day')}, with ${plural(od.clients, 'client')}` : 'Nothing is overdue',
    delta: deltaInr(od.value, odp.value, false),
    state: od.value <= 0 ? 'ok' : od.unpaid > 0 && od.value / od.unpaid >= 0.4 ? 'bad' : 'warn',
    bar: od.unpaid > 0 ? { pct: (od.value / od.unpaid) * 100, text: `${Math.round((od.value / od.unpaid) * 100)}% of everything invoiced and unpaid` } : null,
    spark: six.map((m) => overdueAt(facts, m.range.end - 1, i.lateAfterDays).value),
    how: `Invoices still unpaid ${plural(i.lateAfterDays, 'day')} after the invoice date (the Ops Desk's late-payment rule). Read as of today, against the start of the period.`,
  };

  /* 5. Win rate. */
  let winRate: Kpi;
  if (i.leads) {
    const wr = winRateIn(i.leads, w.cur), wp = winRateIn(i.leads, w.prev);
    winRate = {
      key: 'winRate', label: 'Win rate', section: 'sales', format: 'pct', value: wr.rate,
      line: wr.decided ? `${wr.won} won of ${plural(wr.decided, 'lead')} decided` : 'No leads won or lost yet',
      delta: deltaPts(wr.rate, wp.rate), state: wr.rate == null ? 'none' : toneFor(wr.rate / t.winRatePct),
      bar: wr.rate != null ? { pct: bar(wr.rate, t.winRatePct) as number, text: `Target ${t.winRatePct}%` } : null,
      spark: six.map((m) => winRateIn(i.leads as Lead[], m.range).rate ?? 0),
      how: 'Leads won divided by leads won or lost in the period. Leads still open are left out.',
    };
  } else {
    winRate = {
      key: 'winRate', label: 'Win rate', section: 'sales', format: 'pct', value: null,
      line: 'The leads could not be read', delta: null, state: 'none', bar: null, spark: [],
      how: 'Leads won divided by leads won or lost in the period, from the Ops Desk.',
    };
  }

  /* 6. Weighted pipeline, as of now. */
  const pl = pipelineOf(facts);
  const monthlyRef = t.bookingsMonthly || (six.reduce((s, m) => s + bookedIn(facts, m.range).value, 0) / 6) || 0;
  const cover = monthlyRef > 0 ? pl.expected / monthlyRef : null;
  const pipeline: Kpi = {
    key: 'pipeline', label: 'Pipeline, weighted', section: 'sales', format: 'inr', value: pl.expected,
    line: pl.open ? `${plural(pl.open, 'open project')} not yet signed` : 'Nothing open in the pipeline',
    delta: null, state: cover == null ? 'none' : toneFor(cover / t.pipelineMonths),
    bar: cover != null ? { pct: Math.min(100, (cover / t.pipelineMonths) * 100), text: `Covers ${cover.toFixed(1)} months of ${t.bookingsMonthly ? 'target' : 'recent bookings'}. Aim for ${t.pipelineMonths}.` } : null,
    spark: [],
    how: 'Each open project\'s value times the chance its stage usually signs: lead 10%, drafting 15%, proposal sent 40%, negotiating 60%.',
  };

  /* 7. On-time handovers. */
  const h = handoversIn(facts, w.cur), hp = handoversIn(facts, w.prev);
  const onTime: Kpi = {
    key: 'onTime', label: 'On-time handovers', section: 'delivery', format: 'pct', value: h.rate,
    line: h.judged ? `${h.onTime} of ${plural(h.judged, 'handover')} on time${h.avgDelay != null ? `, late ones ${plural(h.avgDelay, 'day')} over on average` : ''}` : h.done.length ? 'Handovers here carry no target date' : 'No handovers in this period',
    delta: deltaPts(h.rate, hp.rate), state: h.rate == null ? 'none' : toneFor(h.rate / t.onTimePct),
    bar: h.rate != null ? { pct: bar(h.rate, t.onTimePct) as number, text: `Target ${t.onTimePct}%` } : null,
    spark: six.map((m) => handoversIn(facts, m.range).rate ?? 0),
    how: 'Handovers signed on or before the target handover date set on the project.',
  };

  /* 8. Booked per person a month. */
  const per = i.headcount && i.headcount > 0 ? b.value / w.months / i.headcount : null;
  const perPrev = i.headcount && i.headcount > 0 ? bp.value / w.months / i.headcount : 0;
  const perPerson: Kpi = {
    key: 'perPerson', label: 'Booked per person', section: 'delivery', format: 'inr', value: per,
    line: per != null ? `${inr(b.value)} across ${plural(i.headcount as number, 'person', 'people')}${w.months > 1 ? `, per month` : ''}` : 'People could not be read',
    delta: per != null ? deltaPct(per, perPrev) : null,
    state: per == null || !t.perPersonMonthly ? 'none' : toneFor(per / t.perPersonMonthly),
    bar: per != null && t.perPersonMonthly ? { pct: bar(per, t.perPersonMonthly) as number, text: `Target ${inr(t.perPersonMonthly)} per person a month` } : null,
    spark: i.headcount ? six.map((m) => bookedIn(facts, m.range).value / (i.headcount as number)) : [],
    how: 'Sales booked a month divided by the people on the team in People. A rough read of productivity.',
  };

  return [booked, cash, margin, overdue, winRate, pipeline, onTime, perPerson];
}

/* ── The line at the top, and what to do this week ──────────────────────── */

export function headline(i: OwnerReportInput, kpis: Kpi[]): { tone: Tone; text: string } {
  const w = periodWindow(i.period, i.now);
  const k = Object.fromEntries(kpis.map((x) => [x.key, x])) as Record<Kpi['key'], Kpi>;
  const bookedTarget = i.targets.bookingsMonthly ? i.targets.bookingsMonthly * w.months : null;
  const first = bookedTarget
    ? `${w.label} has booked ${inr(k.booked.value || 0)} of its ${inr(bookedTarget)} target`
    : `${w.label} has booked ${inr(k.booked.value || 0)}${k.booked.delta && k.booked.delta.dir !== 'flat' ? `, ${k.booked.delta.text} ${k.booked.delta.dir} ${w.compareLabel.replace(/^with /, 'on ')}` : ''}`;
  const debtors = debtorsOf(i.facts, i.now, i.lateAfterDays);
  const problems: string[] = [];
  if ((k.overdue.value || 0) > 0) {
    const top = debtors.slice(0, 2);
    const topSum = top.reduce((s, d) => s + d.overdue, 0);
    problems.push(`${inr(k.overdue.value as number)} is more than ${plural(i.lateAfterDays, 'day')} overdue${top.length === 2 ? `, ${inr(topSum)} of it with two clients` : ''}`);
  }
  if (k.margin.state === 'bad' && k.margin.delta) problems.push(`margin is leaking ${k.margin.delta.text}`);
  if (k.onTime.state === 'bad' && k.onTime.value != null) problems.push(`only ${pctText(k.onTime.value)} of handovers were on time`);
  if (k.winRate.state === 'bad' && k.winRate.value != null) problems.push(`the win rate is ${pctText(k.winRate.value)} against a ${i.targets.winRatePct}% target`);
  if (!problems.length) return { tone: 'ok', text: `${first}. Nothing on the scorecard needs action today.` };
  return { tone: 'warn', text: `${first}, but ${problems.slice(0, 2).join(' and ')}.` };
}

export interface Action { tone: Tone; title: string; detail: string; stake: number | null; chip: string; go: { section: 'sales' | 'money' | 'delivery'; projectId?: string; tab?: string } }

export function actionsOf(i: OwnerReportInput): Action[] {
  const out: Action[] = [];
  const debtors = debtorsOf(i.facts, i.now, i.lateAfterDays);
  if (debtors[0]) {
    const d = debtors[0], next = debtors[1];
    out.push({
      tone: 'bad', title: `Chase ${d.name}: ${inr(d.overdue)}, ${plural(d.oldestDays, 'day')} overdue`,
      detail: next ? `${d.oldestName}. With ${next.name} (${inr(next.overdue)}) that is ${Math.round(((d.overdue + next.overdue) / Math.max(1, debtors.reduce((s, x) => s + x.overdue, 0))) * 100)}% of what is overdue.` : `${d.oldestName}.`,
      stake: d.overdue + (next?.overdue || 0), chip: inr(d.overdue + (next?.overdue || 0)),
      go: { section: 'money', projectId: d.id, tab: 'payment-calc' },
    });
  }
  const mg = marginOf(i.facts).rows.find((r) => r.leak > 0 && r.quotedPct - r.actualPct >= 2);
  if (mg) out.push({
    tone: 'warn', title: `${mg.name} is ${(mg.quotedPct - mg.actualPct).toFixed(0)} points under its quoted margin`,
    detail: 'Purchase orders on it have come in above the cost in the BOQ.', stake: mg.leak, chip: inr(mg.leak),
    go: { section: 'money', projectId: mg.id, tab: 'materials' },
  });
  const late = lateSites(i.facts, i.now)[0];
  if (late) out.push({
    tone: late.daysLate >= 10 ? 'bad' : 'warn', title: `${late.name} is heading ${plural(late.daysLate, 'day')} past its handover date`,
    detail: late.reason || 'The schedule now ends after the date promised at signup.', stake: null, chip: `${late.daysLate} days`,
    go: { section: 'delivery', projectId: late.id, tab: 'timeline' },
  });
  if (i.leads) {
    const w = periodWindow('fy', i.now);
    const src = sourcesOf(i.leads, i.facts, w.cur);
    const total = src.reduce((s, x) => s + x.leads, 0), won = src.reduce((s, x) => s + x.won, 0);
    const heavy = src.find((x) => total >= 10 && won > 0 && x.leads / total >= 0.3 && x.won / won < (x.leads / total) / 2);
    const best = [...src].filter((x) => x.leads >= 3).sort((a, b) => (b.won / b.leads) - (a.won / a.leads))[0];
    if (heavy) out.push({
      tone: 'warn', title: `${heavy.label} brings ${Math.round((heavy.leads / total) * 100)}% of leads but ${Math.round((heavy.won / won) * 100)}% of wins`,
      detail: best && best.source !== heavy.source ? `${best.label} wins ${Math.round((best.won / best.leads) * 100)}% of its leads. Worth more of your time this month.` : 'Look at where the time on these leads goes.',
      stake: null, chip: 'Sales', go: { section: 'sales' },
    });
  }
  return out.sort((a, b) => (b.stake ?? -1) - (a.stake ?? -1)).slice(0, 3);
}

/* ── Sales ──────────────────────────────────────────────────────────────── */

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export interface SourceRow { source: LeadSource; label: string; leads: number; won: number; value: number }
export function sourcesOf(leads: Lead[], facts: ProjectFact[], r: Range): SourceRow[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const rows = new Map<string, SourceRow>();
  for (const l of leads) {
    if (!inRange(l.createdAt, r)) continue;
    const s = (LEAD_SOURCES.find((x) => x.id === l.source)?.id || 'other') as LeadSource;
    const row = rows.get(s) || { source: s, label: LEAD_SOURCES.find((x) => x.id === s)?.label || 'Other', leads: 0, won: 0, value: 0 };
    row.leads++;
    if (l.stage === 'won') {
      row.won++;
      const f = l.projectId ? byId.get(l.projectId) : undefined;
      if (f) row.value += contract(f);
    }
    rows.set(s, row);
  }
  return [...rows.values()].sort((a, b) => b.value - a.value || b.won - a.won || b.leads - a.leads);
}

export function salesReport(i: OwnerReportInput) {
  const w = periodWindow(i.period, i.now);
  const b = bookedIn(i.facts, w.cur);
  const leads = i.leads || [];
  const fresh = leads.filter((l) => inRange(l.createdAt, w.cur));
  const freshPrev = leads.filter((l) => inRange(l.createdAt, w.prev));
  const replies = fresh.filter((l) => l.firstTouchAt).map((l) => Math.max(0, ((l.firstTouchAt as number) - l.createdAt) / 60000));
  const byId = new Map(i.facts.map((f) => [f.id, f]));
  const won = leads.filter((l) => l.stage === 'won' && inRange(l.updatedAt, w.cur));
  const toSign = won.map((l) => {
    const f = l.projectId ? byId.get(l.projectId) : undefined;
    return ((f?.bookedAt ?? l.updatedAt) - l.createdAt) / DAY;
  }).filter((d) => d >= 0);
  const wonPrev = leads.filter((l) => l.stage === 'won' && inRange(l.updatedAt, w.prev));
  const toSignPrev = wonPrev.map((l) => ((byId.get(l.projectId || '')?.bookedAt ?? l.updatedAt) - l.createdAt) / DAY).filter((d) => d >= 0);

  /* The funnel: every lead that came in during the period, by the furthest step it reached. */
  const reach = fresh.map(furthestStage);
  const funnel = [...BOARD_STAGES.map((s, idx) => ({ key: s as string, label: LEAD_STAGES.find((x) => x.id === s)?.label || s, count: reach.filter((x) => x >= idx).length })),
    { key: 'won', label: 'Signed', count: fresh.filter((l) => l.stage === 'won').length }];

  const lost = leads.filter((l) => l.stage === 'lost' && inRange(l.updatedAt, w.cur));
  const reasons = [...LOST_REASONS].map((r) => ({ reason: r as string, count: lost.filter((l) => (l.lostReason || 'Other') === r).length }));
  const other = lost.filter((l) => !(LOST_REASONS as readonly string[]).includes(l.lostReason || 'Other')).length;
  if (other) reasons.find((r) => r.reason === 'Other')!.count += other;

  const QUIET = 14;
  const quiet = leads.filter((l) => l.stage === 'proposal' && i.now - (l.lastTouchAt ?? l.createdAt) >= QUIET * DAY)
    .map((l) => {
      const f = l.projectId ? byId.get(l.projectId) : undefined;
      return { id: l.id, name: leadDisplayName(l), projectId: l.projectId, value: f ? contract(f) : null, days: Math.floor((i.now - (l.lastTouchAt ?? l.createdAt)) / DAY) };
    }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || b.days - a.days);

  const decided = leads.filter((l) => (l.stage === 'won' || l.stage === 'lost') && inRange(l.updatedAt, w.cur) && l.firstTouchAt);
  const SPEED = [
    { label: 'Within 15 minutes', max: 15 }, { label: '15 to 60 minutes', max: 60 },
    { label: '1 to 4 hours', max: 240 }, { label: 'Later than that', max: Infinity },
  ];
  let lo = -Infinity;
  const speed = SPEED.map((s) => {
    const rows = decided.filter((l) => { const m = ((l.firstTouchAt as number) - l.createdAt) / 60000; return m > lo && m <= s.max; });
    lo = s.max;
    return { label: s.label, leads: rows.length, share: decided.length ? (rows.length / decided.length) * 100 : 0, signed: rows.length ? (rows.filter((l) => l.stage === 'won').length / rows.length) * 100 : null };
  });

  return {
    window: w,
    leadsRead: !!i.leads,
    enquiries: fresh.length,
    enquiriesDelta: fresh.length - freshPrev.length,
    hasPrev: freshPrev.length > 0,
    firstReplyMin: median(replies),
    daysToSign: median(toSign),
    daysToSignPrev: median(toSignPrev),
    avgJob: b.count ? b.value / b.count : null,
    perSqft: b.perSqft,
    winRate: winRateIn(leads, w.cur),
    funnel,
    sources: sourcesOf(leads, i.facts, w.cur),
    lost: lost.length,
    reasons: reasons.filter((r) => r.count > 0).sort((a, b) => b.count - a.count),
    quiet,
    speed,
    decidedWithReply: decided.length,
    pipeline: pipelineOf(i.facts),
    monthlyTarget: i.targets.bookingsMonthly,
  };
}

export function leadDisplayName(l: Pick<Lead, 'people'>): string {
  const main = (l.people || []).find((p) => p.main && p.name.trim()) || (l.people || []).find((p) => p.name.trim());
  return main ? main.name.trim() : 'New lead';
}

/* ── Money ──────────────────────────────────────────────────────────────── */

export interface Debtor { id: string; name: string; overdue: number; invoices: number; oldestDays: number; oldestName: string }
export function debtorsOf(facts: ProjectFact[], now: number, lateDays: number): Debtor[] {
  const out: Debtor[] = [];
  for (const f of money(facts)) {
    let overdue = 0, invoices = 0, oldest = 0, oldestName = '';
    for (const m of f.milestones) {
      if (m.status !== 'invoiced' || m.invoicedAt == null) continue;
      const age = Math.floor((now - m.invoicedAt) / DAY);
      if (age <= lateDays) continue;
      overdue += m.amount; invoices++;
      if (age > oldest) { oldest = age; oldestName = m.name; }
    }
    if (overdue > 0) out.push({ id: f.id, name: f.name, overdue, invoices, oldestDays: oldest, oldestName });
  }
  return out.sort((a, b) => b.overdue - a.overdue);
}

export function moneyReport(i: OwnerReportInput) {
  const w = periodWindow(i.period, i.now);
  const facts = money(i.facts);
  const billed = billedIn(facts, w.cur);
  const cash = cashIn(facts, w.cur), cashPrev = cashIn(facts, w.prev);
  const od = overdueAt(facts, i.now, i.lateAfterDays);

  /* Days to get paid: only payments carrying both days can say. */
  const paid = facts.flatMap((f) => f.milestones).filter((m) => m.status === 'paid' && m.paidAt != null && m.invoicedAt != null && inRange(m.paidAt, w.cur));
  const waits = paid.map((m) => Math.max(0, ((m.paidAt as number) - (m.invoicedAt as number)) / DAY));
  const paidPrev = facts.flatMap((f) => f.milestones).filter((m) => m.status === 'paid' && m.paidAt != null && m.invoicedAt != null && inRange(m.paidAt, w.prev));
  const waitsPrev = paidPrev.map((m) => Math.max(0, ((m.paidAt as number) - (m.invoicedAt as number)) / DAY));
  const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

  /* Age of everything invoiced and unpaid today. */
  const BANDS = [{ label: 'Up to 30 days', max: 30 }, { label: '31 to 60', max: 60 }, { label: '61 to 90', max: 90 }, { label: 'Over 90', max: Infinity }];
  const open = facts.flatMap((f) => f.milestones).filter((m) => m.status === 'invoiced' && m.invoicedAt != null);
  let lo = -Infinity;
  const ageing = BANDS.map((b) => {
    const rows = open.filter((m) => { const d = (i.now - (m.invoicedAt as number)) / DAY; return d > lo && d <= b.max; });
    lo = b.max;
    return { label: b.label, value: rows.reduce((s, m) => s + m.amount, 0), count: rows.length };
  });

  /* Cash due: milestones not yet invoiced that carry a planned date in the next 90 days. */
  const pending = facts.flatMap((f) => f.milestones).filter((m) => m.status === 'pending');
  const dated = pending.filter((m) => m.dueAt != null);
  const due = [0, 1, 2].map((k) => {
    const d = new Date(i.now);
    const start = monthStart(d.getFullYear(), d.getMonth() + k);
    /* This month counts from today: what fell due earlier is already late. */
    const s = k === 0 ? i.now : start;
    const e = monthStart(d.getFullYear(), d.getMonth() + k + 1);
    const rows = dated.filter((m) => (m.dueAt as number) >= s && (m.dueAt as number) < e);
    return { key: monthKey(start), value: rows.reduce((t, m) => t + m.amount, 0), count: rows.length };
  });

  const b = bookedIn(facts, w.cur);
  const mg = marginOf(facts);
  const oh = overheadsMonthly(i.targets);
  const quoted = mg.quotedPct;
  const breakEven = oh > 0 && quoted && quoted > 0 ? oh / (quoted / 100) : null;
  const profit = oh > 0 && quoted != null ? b.value * (quoted / 100) - oh * w.months : null;

  const adds = facts.flatMap((f) => f.additions.filter((a) => a.live));

  return {
    window: w,
    billed, cash, cashPrev, overdue: od,
    daysToPaid: avg(waits), daysToPaidPrev: avg(waitsPrev),
    paidOnTimePct: waits.length ? (waits.filter((d) => d <= i.lateAfterDays).length / waits.length) * 100 : null,
    paidWithDates: waits.length,
    lateAfterDays: i.lateAfterDays,
    ageing, unpaid: open.reduce((s, m) => s + m.amount, 0),
    debtors: debtorsOf(facts, i.now, i.lateAfterDays),
    due, pendingCount: pending.length, datedCount: dated.length,
    mix: { execution: b.execution, design: b.design, additions: b.additions, total: b.value },
    margin: mg,
    breakEven: { overheads: oh, quotedPct: quoted, bookings: breakEven, profit, booked: b.value, months: w.months, target: i.targets.bookingsMonthly },
    additionsPaid: adds.reduce((s, a) => s + a.collected, 0),
  };
}

/* ── Delivery and team ──────────────────────────────────────────────────── */

export interface LateSite { id: string; name: string; targetAt: number; forecastAt: number; daysLate: number; reason: string }

/** Live projects whose schedule now ends after the promised date, or that are past it and not handed over. */
export function lateSites(facts: ProjectFact[], now: number): LateSite[] {
  const out: LateSite[] = [];
  for (const f of facts) {
    if (!LIVE_STATUSES.includes(f.status) || f.handedOverAt != null || f.targetHandoverAt == null) continue;
    const forecast = Math.max(f.schedule?.finishAt ?? 0, now);
    const days = Math.floor((forecast - endOfDay(f.targetHandoverAt)) / DAY) + 1;
    if (days <= 0) continue;
    const waiting = f.decisions.filter((d) => d.waiting && d.since != null).sort((a, b) => (a.since as number) - (b.since as number))[0];
    const reason = f.schedule?.holdReason
      ? `On hold: ${f.schedule.holdReason}`
      : waiting ? `Waiting on the client for ${waiting.title.toLowerCase()} (${plural(Math.floor((now - (waiting.since as number)) / DAY), 'day')})`
      : (f.schedule?.finishAt ?? 0) > now ? 'The schedule now ends after the date promised at signup' : 'Past its handover date and not yet handed over';
    out.push({ id: f.id, name: f.name, targetAt: f.targetHandoverAt, forecastAt: forecast, daysLate: days, reason });
  }
  return out.sort((a, b) => b.daysLate - a.daysLate);
}

export interface TeamRow { email: string; name: string; role: string; kind: 'design' | 'site'; live: number; capacity: number; booked: number }

export function deliveryReport(i: OwnerReportInput) {
  const w = periodWindow(i.period, i.now);
  const facts = i.facts;
  const h = handoversIn(facts, w.cur);
  const live = facts.filter((f) => LIVE_STATUSES.includes(f.status));
  const durations = h.done.filter((f) => f.bookedAt != null).map((f) => ((f.handedOverAt as number) - (f.bookedAt as number)) / DAY);
  const planned = h.done.filter((f) => f.bookedAt != null && f.targetHandoverAt != null).map((f) => ((f.targetHandoverAt as number) - (f.bookedAt as number)) / DAY);
  const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

  const byMonth = w.monthKeys.map((key) => {
    const [y, m] = key.split('-').map(Number);
    const r = { start: monthStart(y, m - 1), end: monthStart(y, m) };
    const x = handoversIn(facts, r);
    return { key, onTime: x.onTime, late: x.late, undated: x.undated };
  });

  const active = facts.filter((f) => ['won', ...LIVE_STATUSES].includes(f.status));
  const waiting = active.flatMap((f) => f.decisions.filter((d) => d.waiting).map((d) => ({
    projectId: f.id, project: f.name, title: d.title, days: d.since != null ? Math.floor((i.now - d.since) / DAY) : null,
  }))).sort((a, b) => (b.days ?? -1) - (a.days ?? -1));

  const moneyFacts = money(facts);
  const adds = moneyFacts.flatMap((f) => f.additions.filter((a) => a.live && inRange(a.createdAt, w.cur)));
  const authorised = adds.filter((a) => a.authorised);
  const contracted = moneyFacts.reduce((s, f) => s + contract(f), 0);

  const snagFacts = [...h.done, ...live];
  const snags = snagFacts.flatMap((f) => f.snags);
  const resolved = snags.filter((s) => s.resolvedAt != null && inRange(s.resolvedAt, w.cur));
  const quick = resolved.filter((s) => (s.resolvedAt as number) - s.raisedAt <= 7 * DAY);
  const openOld = snags.filter((s) => s.open && i.now - s.raisedAt > 7 * DAY);
  const openBySeverity = ['high', 'medium', 'low'].map((sev) => ({ severity: sev, count: snags.filter((s) => s.open && s.severity === sev).length }));

  /*
    Team load: who is on how many live projects, against what one person
    carries well.

    The rows are the studio's team, one per person, people with nothing
    assigned included (they are the room). An assignment to an address that
    is not on the team (an old address, someone who has left) is not a
    person: it is counted apart, so the list never shows anyone twice.
  */
  const load = new Map<string, TeamRow>();
  const fy = periodWindow('fy', i.now);
  const kindOf = (role: string): TeamRow['kind'] | null =>
    role === 'Designer' || role === 'Client Relations' ? 'design' : role === 'Site Supervisor' ? 'site' : null;
  const rowFor = (email: string, kind: TeamRow['kind']): TeamRow => ({
    email, kind, name: i.names?.[email] || email.split('@')[0],
    role: i.roles?.[email] || (kind === 'design' ? 'Designer' : 'Site Supervisor'),
    live: 0, capacity: kind === 'design' ? i.targets.projectsPerDesigner : i.targets.sitesPerSupervisor, booked: 0,
  });
  const roster = (i.roster || []).filter((m) => m.email && kindOf(m.role));
  for (const m of roster) {
    const email = m.email.trim().toLowerCase();
    if (!load.has(email)) load.set(email, { ...rowFor(email, kindOf(m.role) as TeamRow['kind']), name: i.names?.[email] || m.name || email.split('@')[0], role: m.role });
  }
  const fromRoster = load.size > 0;
  const unknown = new Set<string>();
  const add = (email: string, kind: TeamRow['kind'], f: ProjectFact) => {
    let row = load.get(email);
    if (!row) {
      /* Without a team list to go by, everyone assigned is shown, as before. */
      if (fromRoster) { unknown.add(email); return; }
      row = rowFor(email, kind);
      load.set(email, row);
    }
    if (['won', ...LIVE_STATUSES].includes(f.status)) row.live++;
    if (row.kind === 'design' && inRange(f.bookedAt, fy.cur)) row.booked += contract(f);
  };
  for (const f of facts) {
    /* One person once per project, whichever list names them. */
    const seen = new Set<string>();
    for (const e of f.designers) if (!seen.has(e)) { seen.add(e); add(e, 'design', f); }
    for (const e of f.supervisors) if (e.includes('@') && !seen.has(e)) { seen.add(e); add(e, 'site', f); }
  }
  const team = [...load.values()]
    .filter((r) => fromRoster || r.live > 0 || r.booked > 0)
    .sort((a, b) => (b.live / b.capacity) - (a.live / a.capacity) || a.name.localeCompare(b.name));
  const room = team.reduce((s, r) => s + Math.max(0, r.capacity - r.live), 0);

  return {
    window: w,
    handovers: h,
    liveSites: live.length,
    liveArea: live.reduce((s, f) => s + f.area, 0),
    avgDuration: avg(durations), avgPlanned: avg(planned),
    snagsPerHandover: h.done.length ? Math.round(h.done.reduce((s, f) => s + f.snags.length, 0) / h.done.length) : null,
    late: lateSites(facts, i.now),
    liveWithoutTarget: live.filter((f) => f.targetHandoverAt == null).length,
    byMonth,
    waiting, waitingMedian: median(waiting.filter((x) => x.days != null).map((x) => x.days as number)),
    additions: {
      authorised: authorised.reduce((s, a) => s + a.exGst, 0),
      authorisedCount: authorised.length,
      collected: authorised.reduce((s, a) => s + a.collected, 0),
      waiting: adds.filter((a) => !a.authorised).reduce((s, a) => s + a.exGst, 0),
      waitingCount: adds.filter((a) => !a.authorised).length,
      share: contracted > 0 ? (authorised.reduce((s, a) => s + a.exGst, 0) / contracted) * 100 : null,
    },
    snags: {
      quickPct: resolved.length ? (quick.length / resolved.length) * 100 : null,
      resolved: resolved.length,
      openOld: openOld.length,
      open: snags.filter((s) => s.open).length,
      bySeverity: openBySeverity,
    },
    team, room, notOnTeam: [...unknown],
    headcount: i.headcount,
  };
}
