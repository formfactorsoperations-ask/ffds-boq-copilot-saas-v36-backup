/*
  FOUNDERS' GOALS: what the studio has to earn to pay for itself and for the
  founders' homes, and what that means in projects, leads and runway.

  Approved as a mockup on 30 Oct 2026, from the founders' own sheet: a plan of
  projects by size, each with a margin that lands month by month across its
  run, set against studio and household costs. The sheet's numbers become the
  assumptions at the bottom of the tab; everything above them is worked out
  here.

  The rules it keeps:
    - Only projects tagged Actual are counted (the screen passes nothing else),
      and leads tied to a Dummy project are left out.
    - A project's margin is its contract before GST less its planned cost.
      Where the planned cost is missing, its band's margin stands in, and the
      figure is marked estimated.
    - Margin lands evenly from the day the project is booked to the day it is
      handed over (or forecast to be, or promised to be). Where none of those
      is known, the band's typical run stands in.
    - Quarters are India's financial-year quarters: Q1 is April to June.
    - Cash is the one figure the app cannot see. The founders enter it; until
      they do, runway says so instead of guessing.

  Pure, and shared by the screen and the tests.
*/
import { BOARD_STAGES, type Lead } from './leads';
import { furthestStage, inr, STAGE_CHANCE, type ProjectFact } from './ownerReports';

const DAY = 86400000;
/** An average month, for spreading margin and measuring runs. */
export const MONTH = 30.44 * DAY;

export const FOUNDER_EMAILS = ['formfactors.operations@gmail.com', 'formfactorsdesignstudio@gmail.com'];
export const isFounder = (email: string | null | undefined) => FOUNDER_EMAILS.includes(String(email || '').trim().toLowerCase());

/* ── The founders' assumptions ──────────────────────────────────────────── */

/** One size band: a typical project in it, in rupees, its margin %, its run in months, and its share of signings %. */
export interface Band { value: number; margin: number; months: number; mix: number }
export const BANDS: { label: string; max: number }[] = [
  { label: 'Up to ₹5L', max: 5e5 },
  { label: '₹5–12L', max: 12e5 },
  { label: '₹12–20L', max: 20e5 },
  { label: '₹20–35L', max: 35e5 },
  { label: 'Above ₹35L', max: Infinity },
];
export const bandIndex = (value: number) => Math.max(0, BANDS.findIndex((b) => value < b.max));
/** The founders' sheet, for bands the app has no projects in yet. */
export const SHEET_BANDS: Band[] = [
  { value: 3e5, margin: 25, months: 2.5, mix: 40 },
  { value: 10e5, margin: 25, months: 3, mix: 30 },
  { value: 15e5, margin: 25, months: 3, mix: 15 },
  { value: 25e5, margin: 25, months: 6, mix: 10 },
  { value: 50e5, margin: 20, months: 6, mix: 5 },
];

export interface CostLine { name: string; amount: number }

/** How leads turn into projects: leads a month, then % reaching a meeting, % of those getting a proposal, % of proposals won, days from lead to signing, % from referrals. */
export interface Funnel { leads: number; meet: number; prop: number; win: number; cycle: number; referral: number }
export const SHEET_FUNNEL: Funnel = { leads: 0, meet: 55, prop: 60, win: 35, cycle: 42, referral: 45 };

export type Tier = 'survive' | 'sustain' | 'grow';
export const TIERS: { key: Tier; name: string; line: string }[] = [
  { key: 'survive', name: 'Break even', line: 'Studio and household costs, nothing more' },
  { key: 'sustain', name: 'Sustain', line: 'Break even, and rebuild the safety buffer' },
  { key: 'grow', name: 'Grow', line: 'Sustain, plus profit to save or reinvest' },
];

export interface FounderPlan {
  /** Null: the app's figures from the last 12 months. */
  bands: Band[] | null;
  /** The founders' what-ifs over the app's rates; a missing key is the app's. */
  funnel: Partial<Funnel> | null;
  /** Null: the overheads in Set targets. */
  studio: CostLine[] | null;
  home: CostLine[];
  /** Cash the studio can spend, in rupees; null until entered. */
  cash: number | null;
  cashAt: number | null;
  /** Safety buffer, in months of costs. */
  buffer: number;
  /** Quarters to rebuild the buffer over. */
  rebuild: number;
  /** Profit on top of costs for Grow, % of costs. */
  growth: number;
  /** Null: the recommended level. */
  tier: Tier | null;
}

export const DEFAULT_PLAN: FounderPlan = { bands: null, funnel: null, studio: null, home: [], cash: null, cashAt: null, buffer: 6, rebuild: 4, growth: 15, tier: null };

const n = (v: unknown, lo = 0, hi = Infinity): number => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo;
};
const lines = (v: unknown): CostLine[] =>
  (Array.isArray(v) ? v : []).slice(0, 30).map((c: any) => ({ name: String(c?.name ?? '').slice(0, 60), amount: Math.round(n(c?.amount, 0, 1e8)) }));

/** A stored plan, cleaned: anything missing or out of range becomes the default. */
export function planOf(raw: any): FounderPlan {
  const r = raw || {};
  const bands = Array.isArray(r.bands) && r.bands.length === BANDS.length
    ? r.bands.map((b: any) => ({ value: Math.round(n(b?.value, 0, 1e9)), margin: n(b?.margin, 0, 100), months: n(b?.months, 0.5, 36), mix: n(b?.mix, 0, 100) }))
    : null;
  const f = r.funnel && typeof r.funnel === 'object' ? r.funnel : null;
  const funnel: Partial<Funnel> | null = f ? {} : null;
  if (f && funnel) {
    const caps: Record<keyof Funnel, number> = { leads: 1000, meet: 100, prop: 100, win: 100, cycle: 730, referral: 100 };
    for (const k of Object.keys(caps) as (keyof Funnel)[]) if (f[k] != null && f[k] !== '') funnel[k] = n(f[k], 0, caps[k]);
  }
  return {
    bands,
    funnel: funnel && Object.keys(funnel).length ? funnel : null,
    studio: Array.isArray(r.studio) ? lines(r.studio) : null,
    home: lines(r.home),
    cash: r.cash == null || r.cash === '' ? null : Math.round(n(r.cash, -1e10, 1e10)),
    cashAt: typeof r.cashAt === 'number' ? r.cashAt : null,
    buffer: r.buffer == null ? DEFAULT_PLAN.buffer : n(r.buffer, 0, 36),
    rebuild: r.rebuild == null ? DEFAULT_PLAN.rebuild : Math.max(1, n(r.rebuild, 1, 20)),
    growth: r.growth == null ? DEFAULT_PLAN.growth : n(r.growth, 0, 200),
    tier: r.tier === 'survive' || r.tier === 'sustain' || r.tier === 'grow' ? r.tier : null,
  };
}

/** What is written to Firestore: the clean plan, and who saved it when. */
export function storedPlan(p: FounderPlan, by: string, at: number) {
  return { ...planOf(p), updatedAt: at, updatedBy: by };
}

/** The studio's cost lines when the founders have not listed their own: Set targets' overheads. */
export function overheadLines(o: { salaries: number; rent: number; other: number }): CostLine[] {
  return [
    { name: 'Salaries', amount: o.salaries || 0 },
    { name: 'Rent', amount: o.rent || 0 },
    { name: 'Software and other', amount: o.other || 0 },
  ];
}
/** The founders' studio lines folded back into Set targets' three overheads. */
export function linesToOverheads(ls: CostLine[]) {
  const sum = (re: RegExp, keep: boolean) => ls.filter((l) => re.test(l.name) === keep).reduce((s, l) => s + l.amount, 0);
  const salaries = sum(/salar|wage|stipend/i, true);
  const rent = ls.filter((l) => !/salar|wage|stipend/i.test(l.name) && /rent|lease/i.test(l.name)).reduce((s, l) => s + l.amount, 0);
  return { salaries, rent, other: sum(/salar|wage|stipend|rent|lease/i, false) };
}

/* ── The financial year ─────────────────────────────────────────────────── */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const yy = (y: number) => String(y % 100).padStart(2, '0');
export const monthName = (t: number) => { const d = new Date(t); return `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`; };
export const shortDate = (t: number) => { const d = new Date(t); return `${d.getDate()} ${MON[d.getMonth()]}`; };

export interface Quarter { index: number; label: string; span: string; start: number; end: number }
export interface FinancialYear { label: string; start: number; end: number; quarters: Quarter[]; current: number }

/** India's financial year around `now`, from 1 April, in four quarters. */
export function fyOf(now: number): FinancialYear {
  const d = new Date(now);
  const fy = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const quarters = [0, 1, 2, 3].map((i) => {
    const start = new Date(fy, 3 + i * 3, 1).getTime();
    const end = new Date(fy, 6 + i * 3, 1).getTime();
    const a = new Date(start), b = new Date(end - DAY);
    return { index: i, label: `Q${i + 1}`, span: `${MON[a.getMonth()]}–${MON[b.getMonth()]}`, start, end };
  });
  return {
    label: `FY ${yy(fy)}–${yy(fy + 1)}`,
    start: quarters[0].start, end: quarters[3].end, quarters,
    current: quarters.findIndex((q) => now >= q.start && now < q.end),
  };
}

/* ── Signed work, and when its margin lands ─────────────────────────────── */

export interface SignedWork {
  id: string;
  name: string;
  value: number;
  margin: number;
  /** Margin from the band, the planned cost being missing. */
  marginEstimated: boolean;
  start: number;
  end: number;
  /** Run from the band, no handover date being known. */
  runEstimated: boolean;
  band: number;
}

const SIGNED = ['won', 'execution', 'work_paused', 'completed'];
const contractOf = (f: ProjectFact) => f.execution + f.design;

/** Every signed actual project, with its margin and the run it lands over. */
export function signedWork(facts: ProjectFact[], bands: Band[]): SignedWork[] {
  return facts.filter((f) => SIGNED.includes(f.status) && f.bookedAt != null && contractOf(f) > 0).map((f) => {
    const value = contractOf(f);
    const band = bandIndex(value);
    const b = bands[band];
    const quoted = f.plannedCost > 0 && f.plannedCost < value;
    const start = f.bookedAt as number;
    const known = f.handedOverAt ?? f.schedule?.finishAt ?? f.targetHandoverAt;
    const runKnown = known != null && known > start;
    return {
      id: f.id, name: f.name, value, band,
      margin: quoted ? value - f.plannedCost : value * b.margin / 100,
      marginEstimated: !quoted,
      start, end: runKnown ? (known as number) : start + Math.max(0.5, b.months) * MONTH,
      runEstimated: !runKnown,
    };
  });
}

/** Margin that lands between two moments, spread evenly over each project's run. */
export function landedIn(work: SignedWork[], from: number, to: number): number {
  if (to <= from) return 0;
  return work.reduce((s, w) => {
    const overlap = Math.min(to, w.end) - Math.max(from, w.start);
    return overlap > 0 ? s + w.margin * overlap / (w.end - w.start) : s;
  }, 0);
}

/* ── What the app knows ─────────────────────────────────────────────────── */

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (v: number) => Math.round(v * 10) / 10;

/** The bands from the studio's own signings in the last 12 months; the sheet's where a band has none. */
export function appBands(facts: ProjectFact[], now: number): { bands: Band[]; basedOn: number } {
  const all = signedWork(facts, SHEET_BANDS);
  const year = all.filter((w) => w.start >= now - 365 * DAY && w.start <= now);
  const rows = year.length >= 3 ? year : all;
  const bands = SHEET_BANDS.map((sheet, i) => {
    const mine = rows.filter((w) => w.band === i);
    const margins = mine.filter((w) => !w.marginEstimated).map((w) => w.margin / w.value * 100);
    const runs = mine.filter((w) => !w.runEstimated).map((w) => (w.end - w.start) / MONTH);
    return {
      value: mine.length ? Math.round(mine.reduce((s, w) => s + w.value, 0) / mine.length / 10000) * 10000 : sheet.value,
      margin: margins.length ? round1(median(margins) as number) : sheet.margin,
      months: runs.length ? Math.max(0.5, Math.round((runs.reduce((s, r) => s + r, 0) / runs.length) * 2) / 2) : sheet.months,
      mix: sheet.mix,
    };
  });
  if (rows.length >= 3) {
    for (let i = 0; i < bands.length; i++) bands[i].mix = Math.round(rows.filter((w) => w.band === i).length / rows.length * 100);
    /* Rounding can leave the shares at 99 or 101: the biggest band takes the difference. */
    const top = bands.reduce((b, x, k) => (x.mix > bands[b].mix ? k : b), 0);
    bands[top].mix += 100 - bands.reduce((s, b) => s + b.mix, 0);
  }
  return { bands, basedOn: rows.length };
}

export interface LeadFlow {
  funnel: Funnel;
  /** Leads the rates come from; under 5 and the sheet's rates stand in. */
  basedOn: number;
  /** The last three months, a month on average. */
  actual: { leads: number; meetings: number; proposals: number; signed: number };
}

const MEETING = BOARD_STAGES.indexOf('meeting');
const PROPOSAL = BOARD_STAGES.indexOf('proposal');

/** The studio's own rates from the last 12 months of leads, and its last three months, a month on average. */
export function appFunnel(leads: Lead[], facts: ProjectFact[], now: number): LeadFlow {
  const year = leads.filter((l) => l.createdAt >= now - 365 * DAY && l.createdAt <= now);
  const recent = leads.filter((l) => l.createdAt >= now - 90 * DAY && l.createdAt <= now);
  const reach = (ls: Lead[], i: number) => ls.filter((l) => furthestStage(l) >= i).length;
  const met = reach(year, MEETING);
  const proposed = year.filter((l) => furthestStage(l) >= PROPOSAL);
  const decided = proposed.filter((l) => l.stage === 'won' || l.stage === 'lost');
  const byId = new Map(facts.map((f) => [f.id, f]));
  const cycles = year.filter((l) => l.stage === 'won').map((l) => (((l.projectId ? byId.get(l.projectId)?.bookedAt : null) ?? l.updatedAt) - l.createdAt) / DAY).filter((d) => d >= 0);
  const enough = year.length >= 5;
  const funnel: Funnel = {
    leads: round1(recent.length / 3),
    meet: enough ? Math.round(met / year.length * 100) : SHEET_FUNNEL.meet,
    prop: enough && met ? Math.round(proposed.length / met * 100) : SHEET_FUNNEL.prop,
    win: decided.length >= 3 ? Math.round(decided.filter((l) => l.stage === 'won').length / decided.length * 100) : SHEET_FUNNEL.win,
    cycle: cycles.length >= 2 ? Math.round(median(cycles) as number) : SHEET_FUNNEL.cycle,
    referral: enough ? Math.round(year.filter((l) => l.source === 'referral' || l.source === 'repeat').length / year.length * 100) : SHEET_FUNNEL.referral,
  };
  const signed = facts.filter((f) => SIGNED.includes(f.status) && f.bookedAt != null && (f.bookedAt as number) >= now - 90 * DAY && (f.bookedAt as number) <= now).length;
  return {
    funnel,
    basedOn: year.length,
    actual: { leads: round1(recent.length / 3), meetings: round1(reach(recent, MEETING) / 3), proposals: round1(reach(recent, PROPOSAL) / 3), signed: round1(signed / 3) },
  };
}

/** Leads tied to a project the studio tagged Dummy are left out; every other lead counts. */
export function actualLeads(leads: Lead[], testProjectIds: Set<string>): Lead[] {
  return leads.filter((l) => !(l.projectId && testProjectIds.has(l.projectId)));
}

/* ── The report ─────────────────────────────────────────────────────────── */

export type Tone = 'ok' | 'warn' | 'bad' | 'none' | 'brand';

export interface GoalsInput {
  /** Actual projects only. */
  facts: ProjectFact[];
  /** Actual leads; null when they could not be read. */
  leads: Lead[] | null;
  plan: FounderPlan;
  overheads: { salaries: number; rent: number; other: number };
  team: { designers: number; supervisors: number; perDesigner: number; perSupervisor: number };
  now: number;
}

export interface RunPoint { at: number; none: number; pace: number; goal: number }
export interface PipeRow { id: string; name: string; stage: string; value: number; count: number; odds: number; signsBy: number; land: number; weighted: number }
export interface Lever { title: string; worth: number; line: string }
export interface Move { title: string; line: string; tone: Tone; tag: string }
export interface QuarterRow extends Quarter { earned: number; expected: number; booked: number; signed: number; now: boolean; past: boolean }

const PIPE_STAGES = ['lead', 'draft', 'proposal_sent', 'negotiation'];
const PIPE_LABEL: Record<string, string> = { lead: 'Lead', draft: 'Drafting the proposal', proposal_sent: 'Proposal sent', negotiation: 'Negotiating' };
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export function goalsReport(i: GoalsInput) {
  const { plan, now } = i;
  const fy = fyOf(now);
  const q = fy.quarters[fy.current];
  const app = appBands(i.facts, now);
  const bands = plan.bands || app.bands;
  const flow = appFunnel(i.leads || [], i.facts, now);
  const f: Funnel = { ...flow.funnel, ...(plan.funnel || {}) };

  /* Costs. */
  const studio = plan.studio || overheadLines(i.overheads).filter((l) => l.amount > 0);
  const studioTotal = studio.reduce((s, l) => s + l.amount, 0);
  const homeTotal = plan.home.reduce((s, l) => s + l.amount, 0);
  const monthly = studioTotal + homeTotal;
  const qCosts = monthly * 3;

  /* A typical project, from the mix of sizes the studio signs. */
  const mixSum = bands.reduce((s, b) => s + b.mix, 0);
  const weights = bands.map((b, k) => (mixSum > 0 ? b.mix / mixSum : SHEET_BANDS[k].mix / 100));
  const marginEach = (b: Band) => b.value * b.margin / 100;
  const avgMargin = bands.reduce((s, b, k) => s + weights[k] * marginEach(b), 0);
  const avgMonths = Math.max(0.5, bands.reduce((s, b, k) => s + weights[k] * b.months, 0));
  const avgValue = bands.reduce((s, b, k) => s + weights[k] * b.value, 0);
  const perAvg = (v: number) => (avgMargin > 0 ? Math.ceil(v / avgMargin) : 0);

  /* The goal. */
  const cash = plan.cash;
  const bufferTarget = plan.buffer * monthly;
  const bufferGap = cash == null ? 0 : Math.max(0, bufferTarget - cash);
  const rebuildQ = bufferGap / Math.max(1, plan.rebuild);
  const growthQ = plan.growth / 100 * qCosts;
  const tierVal: Record<Tier, number> = { survive: qCosts, sustain: qCosts + rebuildQ, grow: qCosts + rebuildQ + growthQ };
  const recommended: Tier = cash != null && cash >= bufferTarget ? 'grow' : 'sustain';
  const tier = plan.tier || recommended;
  const goal = tierVal[tier];

  /* This quarter, from signed work. */
  const work = signedWork(i.facts, bands);
  const earned = landedIn(work, q.start, now);
  const expected = landedIn(work, now, q.end);
  const projected = earned + expected;
  const gap = goal - projected;
  const gapBreakEven = qCosts - projected;

  /* Projects to sign. */
  const perQ = { survive: perAvg(tierVal.survive), sustain: perAvg(tierVal.sustain), grow: perAvg(tierVal.grow) };
  const perYear = { survive: perAvg(tierVal.survive * 4), sustain: perAvg(tierVal.sustain * 4), grow: perAvg(tierVal.grow * 4) };
  const perQGoal = perQ[tier];
  const signMonth = perQGoal / 3;
  const monthsLeft = (q.end - now) / MONTH;
  /* Signed in about a fortnight, a typical project lands this much before the quarter ends. */
  const landsNow = avgMargin * Math.max(0, Math.min(monthsLeft - 0.5, avgMonths)) / avgMonths;
  const crackNow = gap > 0 && landsNow > 0 ? Math.ceil(gap / landsNow) : 0;
  const alone = bands.map((b, k) => ({ label: BANDS[k].label, n: marginEach(b) > 0 ? Math.ceil(goal / marginEach(b)) : 0 }));

  /* Leads, worked backwards. */
  const conv = (f.meet / 100) * (f.prop / 100) * (f.win / 100);
  const need = {
    signed: signMonth,
    proposals: f.win ? signMonth / (f.win / 100) : 0,
    meetings: f.win && f.prop ? signMonth / (f.win / 100) / (f.prop / 100) : 0,
    leads: conv ? signMonth / conv : 0,
  };
  const leadsNeed = Math.ceil(need.leads - 1e-9);
  const leadsHave = f.leads;
  const pacePerQ = leadsHave * 3 * conv;
  const marketing = studio.filter((l) => /market|advert|promot/i.test(l.name)).reduce((s, l) => s + l.amount, 0);
  const paidLeads = leadsHave * (1 - f.referral / 100);
  const perPaidLead = paidLeads > 0 && marketing > 0 ? marketing / paidLeads : null;
  const extraLeads = Math.max(0, Math.ceil(leadsNeed - leadsHave));
  const cutoff = q.end - DAY - f.cycle * DAY;

  /* Runway: cash at the end of each month for the next year, at three paces of signing. */
  const steps: number[] = [now];
  for (let k = 1; k <= 12; k++) { const d = new Date(now); steps.push(new Date(d.getFullYear(), d.getMonth() + k, 1).getTime() - 1); }
  const fresh = (perMonth: number, a: number, b: number) => {
    const mid = ((a + b) / 2 - now) / MONTH;
    return perMonth * avgMargin / avgMonths * Math.min(Math.max(0, mid), avgMonths) * (b - a) / MONTH;
  };
  const run = (perMonth: number) => {
    if (cash == null) return null;
    const out = [cash];
    for (let k = 1; k < steps.length; k++) {
      const a = steps[k - 1], b = steps[k];
      out.push(out[k - 1] + landedIn(work, a, b) + fresh(perMonth, a, b) - monthly * (b - a) / MONTH);
    }
    return out;
  };
  const lines = { none: run(0), pace: run(pacePerQ / 3), goal: run(signMonth) };
  const runway: RunPoint[] | null = lines.none && lines.pace && lines.goal
    ? steps.map((at, k) => ({ at, none: lines.none![k], pace: lines.pace![k], goal: lines.goal![k] }))
    : null;
  const outAt = (line: number[] | null) => {
    if (!line) return null;
    for (let k = 1; k < line.length; k++) if (line[k] < 0) return steps[k - 1] + (steps[k] - steps[k - 1]) * line[k - 1] / (line[k - 1] - line[k]);
    return null;
  };
  const reachAt = (line: number[] | null) => {
    if (!line || cash == null || cash >= bufferTarget) return null;
    for (let k = 1; k < line.length; k++) if (line[k] >= bufferTarget) return steps[k];
    return null;
  };
  const runwayOut = { none: outAt(lines.none), pace: outAt(lines.pace), goal: outAt(lines.goal) };
  const bufferBy = { pace: reachAt(lines.pace), goal: reachAt(lines.goal) };
  const signedEnds = work.reduce((m, w) => Math.max(m, w.end), 0) || null;

  /* Capacity. */
  const live = i.facts.filter((x) => ['won', 'execution', 'work_paused'].includes(x.status)).length;
  const sites = i.facts.filter((x) => ['execution', 'work_paused'].includes(x.status)).length;
  const liveAtGoal = signMonth * avgMonths;
  const needDesigners = Math.ceil(Math.max(live, liveAtGoal) / Math.max(1, i.team.perDesigner));
  const needSupervisors = Math.ceil(Math.max(sites, liveAtGoal) / Math.max(1, i.team.perSupervisor));
  const salaries = studio.filter((l) => /salar|wage|stipend/i.test(l.name)).reduce((s, l) => s + l.amount, 0);
  const staff = i.team.designers + i.team.supervisors;
  const hireCost = staff > 0 && salaries > 0 ? salaries / staff : null;

  /* The pipeline: projects proposed but not signed, and leads past a first meeting with no project yet. */
  const oddsOf = (status: string) => status === 'negotiation' ? Math.max(STAGE_CHANCE.negotiation, f.win / 100)
    : status === 'proposal_sent' ? f.win / 100
    : status === 'draft' ? (f.prop / 100) * (f.win / 100)
    : conv;
  const signDays: Record<string, number> = { negotiation: 14, proposal_sent: 30, draft: Math.max(30, f.cycle / 2), lead: f.cycle };
  const landBy = (value: number, margin: number, signsBy: number) => {
    const b = bands[bandIndex(value)];
    const months = Math.max(0.5, b.months);
    return margin * Math.max(0, Math.min(q.end - signsBy, months * MONTH)) / (months * MONTH);
  };
  const pipe: PipeRow[] = i.facts.filter((x) => PIPE_STAGES.includes(x.status) && contractOf(x) > 0).map((x) => {
    const value = contractOf(x);
    const b = bands[bandIndex(value)];
    const margin = x.plannedCost > 0 && x.plannedCost < value ? value - x.plannedCost : value * b.margin / 100;
    const signsBy = now + signDays[x.status] * DAY;
    const odds = oddsOf(x.status);
    const land = landBy(value, margin, signsBy);
    return { id: x.id, name: x.name, stage: PIPE_LABEL[x.status], value, count: 1, odds, signsBy, land, weighted: land * odds };
  });
  const openLeads = (i.leads || []).filter((l) => !l.projectId && l.stage !== 'won' && l.stage !== 'lost' && furthestStage(l) >= MEETING);
  if (openLeads.length && avgValue > 0) {
    const signsBy = now + f.cycle / 2 * DAY;
    const odds = (f.prop / 100) * (f.win / 100);
    const land = landBy(avgValue, avgMargin, signsBy) * openLeads.length;
    pipe.push({ id: 'leads', name: `${plural(openLeads.length, 'lead')} past a first meeting`, stage: 'Met, no proposal yet', value: avgValue, count: openLeads.length, odds, signsBy, land, weighted: land * odds });
  }
  pipe.sort((a, b) => b.weighted - a.weighted || b.value - a.value);
  const pipeWeighted = pipe.reduce((s, p) => s + p.weighted, 0);

  /* Levers: what each change is worth a quarter, at the goal's pace. */
  const swap = bands[2] && bands[0] ? marginEach(bands[2]) - marginEach(bands[0]) : 0;
  const levers: Lever[] = [
    { title: 'Price 3 points more margin into every new project', worth: perQGoal * avgValue * 0.03, line: `On ${plural(perQGoal, 'project')} a quarter of about ${inr(avgValue)} each` },
    { title: 'Win 5 more proposals in every 100', worth: leadsHave * 3 * (f.meet / 100) * (f.prop / 100) * 0.05 * avgMargin, line: `At today's ${round1(leadsHave)} leads a month, without one extra lead` },
    perPaidLead
      ? { title: 'Spend ₹10,000 more a month on marketing', worth: (10000 / perPaidLead) * 3 * conv * avgMargin - 30000, line: `About ${round1(10000 / perPaidLead)} more leads a month at ${inr(perPaidLead)} a lead, after the spend` }
      : { title: 'Spend ₹10,000 more a month on marketing', worth: 0, line: 'Add a studio cost named Marketing to work this out' },
    { title: `Swap one small job a quarter for a ${BANDS[2].label} one`, worth: swap, line: `${inr(marginEach(bands[2]))} margin instead of ${inr(marginEach(bands[0]))}, for one more proposal of that size` },
    { title: 'Trim household costs by 10%', worth: homeTotal * 0.3, line: `${inr(homeTotal * 0.1)} a month less to earn, and a longer runway` },
  ].sort((a, b) => b.worth - a.worth);

  /* The year, quarter by quarter. */
  const quarters: QuarterRow[] = fy.quarters.map((x) => {
    const booked = work.filter((w) => w.start >= x.start && w.start < x.end);
    return {
      ...x,
      earned: landedIn(work, x.start, Math.min(x.end, now)),
      expected: x.end > now ? landedIn(work, Math.max(x.start, now), x.end) : 0,
      booked: booked.reduce((s, w) => s + w.value, 0),
      signed: booked.length,
      now: x.index === fy.current,
      past: x.end <= now,
    };
  });
  const fyHave = quarters.reduce((s, x) => s + x.earned + x.expected, 0);
  const fyGoal = goal * 4;
  const fyLeft = Math.max(0, fyGoal - fyHave);
  const fySigned = quarters.reduce((s, x) => s + x.signed, 0);
  const fyDue = Math.round(perYear[tier] * Math.min(1, (now - fy.start) / (fy.end - fy.start)));
  /* A typical project signed by this day still finishes by 31 March. */
  const lastStart = fy.end - DAY - avgMonths * MONTH;

  /* What to do this week. */
  const moves: Move[] = [];
  const tierName = TIERS.find((t) => t.key === tier)!.name;
  const top = pipe.find((p) => p.count === 1 && p.land > 0);
  if (cash == null) moves.push({ title: 'Enter the cash the studio can spend', line: 'Runway and the safety buffer need it. The app cannot see the bank; one figure, once a month, is enough.', tone: 'bad', tag: 'Cash' });
  if (gap > 0 && top) moves.push({ title: `Close ${top.name} by ${shortDate(top.signsBy)}`, line: `${inr(top.value)}, ${top.stage.toLowerCase()}. It lands ${inr(top.land)} before ${shortDate(q.end - DAY)}${gapBreakEven > 0 && top.land >= gapBreakEven ? ', enough to break even this quarter' : ''}.`, tone: 'bad', tag: 'This quarter' });
  if (extraLeads > 0) moves.push({ title: `Find ${plural(extraLeads, 'more lead')} a month`, line: `The ${tierName} goal needs ${leadsNeed} a month and the last three months averaged ${round1(leadsHave)}.${perPaidLead ? ` At ${inr(perPaidLead)} a lead that is about ${inr(extraLeads * perPaidLead)} more marketing a month.` : ''}`, tone: 'warn', tag: 'Sales' });
  if (cutoff > now) moves.push({ title: `Leads after ${shortDate(cutoff)} will sign next quarter`, line: `Lead to signing takes ${Math.round(f.cycle)} days. This quarter's gap closes from proposals already out, so follow them up this week.`, tone: 'brand', tag: 'Timing' });
  if (needSupervisors > i.team.supervisors) moves.push({ title: i.team.supervisors ? 'Plan another Site Supervisor' : 'Plan a Site Supervisor', line: `${plural(sites, 'live site')} on ${plural(i.team.supervisors, 'Site Supervisor')}, who carry ${i.team.perSupervisor} each. The goal's pace needs ${needSupervisors}.`, tone: 'warn', tag: 'Team' });
  else if (needDesigners > i.team.designers) moves.push({ title: 'Plan another Designer', line: `${plural(live, 'live project')} on ${plural(i.team.designers, 'Designer')}, who carry ${i.team.perDesigner} each. The goal's pace needs ${needDesigners}.`, tone: 'warn', tag: 'Team' });
  if (cash != null && cash < bufferTarget) moves.push({ title: `Rebuild the safety buffer: ${inr(bufferGap)} to go`, line: `Cash covers ${round1(monthly ? cash / monthly : 0)} months of costs and the buffer is ${plan.buffer}. The ${tierName} goal sets aside ${inr(tier === 'survive' ? 0 : rebuildQ)} a quarter for it.`, tone: 'warn', tag: 'Cash' });

  return {
    fy, quarter: q, quarters, now,
    bands, appBands: app.bands, bandsFromApp: !plan.bands, bandsBasedOn: app.basedOn,
    funnel: f, appFunnel: flow.funnel, funnelBasedOn: flow.basedOn, actual: flow.actual,
    studio, studioFromTargets: !plan.studio, studioTotal, homeTotal, monthly, qCosts,
    mixSum, avgMargin, avgMonths, avgValue, marginEach,
    cash, bufferTarget, bufferGap, rebuildQ, growthQ, tierVal, recommended, tier, tierName, goal,
    work, earned, expected, projected, gap, gapBreakEven,
    perQ, perYear, perQGoal, signMonth, landsNow, crackNow, alone, monthsLeft,
    conv, need, leadsNeed, leadsHave, pacePerQ, marketing, perPaidLead, extraLeads, cutoff,
    runway, runwayOut, bufferBy, signedEnds,
    live, sites, liveAtGoal, needDesigners, needSupervisors, hireCost, team: i.team,
    pipe, pipeWeighted,
    levers,
    fyHave, fyGoal, fyLeft, fySigned, fyDue, lastStart,
    moves,
  };
}

export type GoalsReport = ReturnType<typeof goalsReport>;
