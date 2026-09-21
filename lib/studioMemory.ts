import { Observation, ObservationDims, ObservationType, CostType } from '../types';
import { formatCompactINR } from './utils';

// ============================================================================
// studioMemory — pure queries over the observation ledger. No I/O, no React.
// Every number the brain shows is produced here, always with its evidence.
// ============================================================================

/** Below this many distinct PROJECTS, we say nothing at all. */
export const MIN_PROJECTS_TO_SPEAK = 2;
/** At or above this, we present a benchmark without hedging. */
export const MIN_PROJECTS_CONFIDENT = 4;

export type BenchmarkConfidence = 'none' | 'weak' | 'usable';

const confidenceFor = (n: number): BenchmarkConfidence =>
  n >= MIN_PROJECTS_CONFIDENT ? 'usable' : n >= MIN_PROJECTS_TO_SPEAK ? 'weak' : 'none';

export const COST_TYPE_LABEL: Record<CostType, string> = {
  subcontract: 'Subcontractor',
  material: 'Materials',
  labour: 'Labour',
  uncategorised: 'Uncategorised',
};

// ---------------------------------------------------------------------------
// Realised margin, per project
// ---------------------------------------------------------------------------
export interface MarginRecord {
  projectId: string;
  projectName: string;
  revenue: number;
  cost: number;
  marginPct: number;
}

export function realisedMargins(obs: Observation[]): MarginRecord[] {
  return (obs || [])
    .filter(o => o.type === 'margin_realised' && o.quoted != null && o.actual != null && o.quoted > 0)
    .map(o => ({
      projectId: o.projectId,
      projectName: o.projectName || o.projectId,
      revenue: o.quoted!,
      cost: o.actual!,
      /* Margin OVER REVENUE, which is what the rest of the OS means by margin
         (lib/procurement.ts:184, the project P&L card, the Reports deck). This
         divided by COST, making it a markup: the page read "historical margin
         46.2%" where studioSeed's own header states 31.6%, and
         ProjectReportsTab subtracted a project's over-revenue margin from that
         over-cost figure to show a comparison that could not mean anything. */
      marginPct: o.quoted! > 0 ? ((o.quoted! - o.actual!) / o.quoted!) * 100 : 0,
    }))
    .sort((a, b) => b.marginPct - a.marginPct);
}

export function blendedMargin(obs: Observation[]) {
  const rows = realisedMargins(obs);
  if (!rows.length) return null;
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  return {
    revenue, cost, n: rows.length,
    marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
    best: rows[0],
    worst: rows[rows.length - 1],
  };
}

// ---------------------------------------------------------------------------
// Cost mix — how the studio's money is actually spent
// ---------------------------------------------------------------------------
export interface CostMix {
  subcontract: number; material: number; labour: number; uncategorised: number;
  total: number;
  subcontractPct: number; materialPct: number; labourPct: number;
  projects: number;
}

const spendRows = (obs: Observation[]) =>
  (obs || []).filter(o => o.actual != null && o.actual > 0 && o.dims?.costType);

export function costMix(obs: Observation[]): CostMix {
  const rows = spendRows(obs);
  const sum = (t: CostType) =>
    rows.filter(o => o.dims!.costType === t).reduce((s, o) => s + (o.actual || 0), 0);

  const subcontract = sum('subcontract');
  const material = sum('material');
  const labour = sum('labour');
  const uncategorised = sum('uncategorised');
  const total = subcontract + material + labour + uncategorised;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return {
    subcontract, material, labour, uncategorised, total,
    subcontractPct: pct(subcontract), materialPct: pct(material), labourPct: pct(labour),
    projects: new Set(rows.map(o => o.projectId)).size,
  };
}

// ---------------------------------------------------------------------------
// Vendors — spend, reach, and the margin of the jobs they work on
// ---------------------------------------------------------------------------
export interface VendorRecord {
  vendorName: string;
  costType: CostType;
  total: number;
  transactions: number;
  projects: number;
  sharePct: number;
  /** Spend-weighted average margin of the projects this vendor worked on. */
  weightedMarginPct: number | null;
  bestMarginPct: number | null;
  worstMarginPct: number | null;
}

export function vendorRecords(obs: Observation[]): VendorRecord[] {
  const rows = spendRows(obs).filter(o => o.dims?.vendorName);
  const grand = rows.reduce((s, o) => s + (o.actual || 0), 0);
  const marginBy = new Map(realisedMargins(obs).map(m => [m.projectId, m.marginPct]));

  const byVendor = new Map<string, Observation[]>();
  rows.forEach(o => {
    const k = o.dims!.vendorName!;
    if (!byVendor.has(k)) byVendor.set(k, []);
    byVendor.get(k)!.push(o);
  });

  return [...byVendor.entries()].map(([vendorName, list]) => {
    const total = list.reduce((s, o) => s + (o.actual || 0), 0);
    const projIds = [...new Set(list.map(o => o.projectId))];
    const withMargin = list.filter(o => marginBy.has(o.projectId));
    const wSum = withMargin.reduce((s, o) => s + (o.actual || 0), 0);
    const weighted = wSum > 0
      ? withMargin.reduce((s, o) => s + marginBy.get(o.projectId)! * (o.actual || 0), 0) / wSum
      : null;
    const gms = projIds.map(p => marginBy.get(p)).filter((x): x is number => x != null);

    return {
      vendorName,
      costType: (list[0].dims!.costType || 'uncategorised') as CostType,
      total,
      transactions: list.length,
      projects: projIds.length,
      sharePct: grand > 0 ? (total / grand) * 100 : 0,
      weightedMarginPct: weighted,
      bestMarginPct: gms.length ? Math.max(...gms) : null,
      worstMarginPct: gms.length ? Math.min(...gms) : null,
    };
  }).sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// Concentration — the strongest signal in the seed data (r = -0.84 over 7 jobs)
// ---------------------------------------------------------------------------
export interface Concentration {
  projectId: string;
  projectName: string;
  cost: number;
  marginPct: number | null;
  topVendor: string;
  topSharePct: number;
  top3SharePct: number;
  vendorCount: number;
}

export function concentration(obs: Observation[]): Concentration[] {
  const rows = spendRows(obs).filter(o => o.dims?.vendorName);
  const marginBy = new Map(realisedMargins(obs).map(m => [m.projectId, m.marginPct]));
  const nameBy = new Map(rows.map(o => [o.projectId, o.projectName || o.projectId]));

  const byProject = new Map<string, Map<string, number>>();
  rows.forEach(o => {
    const p = o.projectId;
    if (!byProject.has(p)) byProject.set(p, new Map());
    const m = byProject.get(p)!;
    const v = o.dims!.vendorName!;
    m.set(v, (m.get(v) || 0) + (o.actual || 0));
  });

  return [...byProject.entries()].map(([projectId, vendors]) => {
    const sorted = [...vendors.entries()].sort((a, b) => b[1] - a[1]);
    const cost = sorted.reduce((s, [, v]) => s + v, 0);
    const share = (n: number) => (cost > 0 ? (n / cost) * 100 : 0);
    return {
      projectId,
      projectName: nameBy.get(projectId) || projectId,
      cost,
      marginPct: marginBy.get(projectId) ?? null,
      topVendor: sorted[0]?.[0] || '—',
      topSharePct: share(sorted[0]?.[1] || 0),
      top3SharePct: share(sorted.slice(0, 3).reduce((s, [, v]) => s + v, 0)),
      vendorCount: sorted.length,
    };
  }).sort((a, b) => (b.marginPct ?? -999) - (a.marginPct ?? -999));
}

/**
 * Historic evidence for "one vendor is taking too much of this job".
 * Returns null unless there are enough past projects above the threshold to speak.
 */
export function concentrationRisk(obs: Observation[], thresholdPct = 55) {
  const rows = concentration(obs).filter(c => c.marginPct != null);
  const heavy = rows.filter(c => c.topSharePct >= thresholdPct);
  const light = rows.filter(c => c.topSharePct < thresholdPct);
  if (heavy.length < MIN_PROJECTS_TO_SPEAK || !light.length) return null;
  const avg = (a: Concentration[]) => a.reduce((s, c) => s + (c.marginPct || 0), 0) / a.length;
  return {
    thresholdPct,
    heavyCount: heavy.length,
    lightCount: light.length,
    heavyAvgMargin: avg(heavy),
    lightAvgMargin: avg(light),
    gap: avg(light) - avg(heavy),
    examples: heavy.map(c => ({ name: c.projectName, share: c.topSharePct, margin: c.marginPct! })),
    confidence: confidenceFor(heavy.length),
  };
}

// ---------------------------------------------------------------------------
// Rate drift — needs BOTH a quote and an actual, so it stays quiet until the
// studio supplies quoted-by-category data. Silence is correct here, not a bug.
// ---------------------------------------------------------------------------
export interface Benchmark {
  key: string;
  n: number;
  observations: number;
  quotedTotal: number;
  actualTotal: number;
  driftPct: number;
  confidence: BenchmarkConfidence;
  projectNames: string[];
}

export function benchmarkBy(
  obs: Observation[],
  dim: keyof ObservationDims,
  type: ObservationType = 'rate_actual',
): Benchmark[] {
  const groups = new Map<string, Observation[]>();
  (obs || []).forEach(o => {
    if (o.type !== type) return;
    if (o.quoted == null || o.actual == null || !(o.quoted > 0)) return;
    const k = (o.dims?.[dim] as string) || '';
    if (!k) return;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(o);
  });

  return [...groups.entries()].map(([key, list]) => {
    const n = new Set(list.map(o => o.projectId)).size;
    const quotedTotal = list.reduce((s, o) => s + (o.quoted || 0), 0);
    const actualTotal = list.reduce((s, o) => s + (o.actual || 0), 0);
    return {
      key, n, observations: list.length, quotedTotal, actualTotal,
      driftPct: quotedTotal > 0 ? ((actualTotal - quotedTotal) / quotedTotal) * 100 : 0,
      confidence: confidenceFor(n),
      projectNames: [...new Set(list.map(o => o.projectName || o.projectId))],
    };
  }).sort((a, b) => b.quotedTotal - a.quotedTotal);
}

export function categoryDrift(obs: Observation[], category: string): Benchmark | null {
  if (!category) return null;
  const b = benchmarkBy(obs, 'category').find(x => x.key === category);
  return !b || b.confidence === 'none' ? null : b;
}

export function driftSentence(b: Benchmark | null): string | null {
  if (!b || b.confidence === 'none') return null;
  const dir = b.driftPct >= 0 ? 'over' : 'under';
  const hedge = b.confidence === 'weak' ? ` (only ${b.n} projects — treat as a hint)` : '';
  return `${b.key} has run ${Math.abs(b.driftPct).toFixed(1)}% ${dir} estimate across ${b.n} project${b.n === 1 ? '' : 's'}${hedge}.`;
}

// ===========================================================================
// DIRECTOR-LEVEL CUTS
//
// Everything below answers a question a studio director asks about the
// business rather than about a project: where did the profit actually come
// from, what is it costing to be slow, who could we not survive losing, and
// when does the money leave. Same rules as above — count projects, never rows,
// and say nothing when the evidence is too thin.
// ===========================================================================

/** Pearson r. Returns null when the sample is degenerate rather than NaN. */
export function correlate(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  const r = num / Math.sqrt(dx * dy);
  return Number.isFinite(r) ? r : null;
}

/** Plain-English strength, so the UI never has to explain what r means. */
export const strengthOf = (r: number): 'strong' | 'moderate' | 'weak' | 'none' => {
  const a = Math.abs(r);
  return a >= 0.7 ? 'strong' : a >= 0.45 ? 'moderate' : a >= 0.3 ? 'weak' : 'none';
};

// ---------------------------------------------------------------------------
// Where the profit actually came from
// ---------------------------------------------------------------------------
export interface ProfitShare {
  projectId: string;
  projectName: string;
  revenue: number;
  profit: number;
  marginPct: number;
  profitSharePct: number;
  revenueSharePct: number;
  cumulativePct: number;
}

export function profitConcentration(obs: Observation[]) {
  const rows = realisedMargins(obs)
    .map(m => ({ ...m, profit: m.revenue - m.cost }))
    .sort((a, b) => b.profit - a.profit);
  if (!rows.length) return null;

  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  if (totalProfit <= 0) return null;

  let run = 0;
  const shares: ProfitShare[] = rows.map(r => {
    run += r.profit;
    return {
      projectId: r.projectId,
      projectName: r.projectName,
      revenue: r.revenue,
      profit: r.profit,
      marginPct: r.marginPct,
      profitSharePct: (r.profit / totalProfit) * 100,
      revenueSharePct: (r.revenue / totalRevenue) * 100,
      cumulativePct: (run / totalProfit) * 100,
    };
  });

  // How few projects carry half the profit — the number that tells a director
  // how exposed the studio is to one job going wrong.
  const halfAt = shares.findIndex(s => s.cumulativePct >= 50) + 1;
  const topThirdCount = Math.max(1, Math.round(shares.length / 3));

  return {
    shares,
    totalProfit,
    totalRevenue,
    n: shares.length,
    projectsForHalfTheProfit: halfAt || shares.length,
    topThirdSharePct: shares.slice(0, topThirdCount).reduce((s, r) => s + r.profitSharePct, 0),
    topThirdCount,
    weakest: shares[shares.length - 1],
  };
}

// ---------------------------------------------------------------------------
// What the below-average projects cost the studio
// ---------------------------------------------------------------------------
export interface UpliftRow {
  projectId: string;
  projectName: string;
  marginPct: number;
  cost: number;
  costAtAverage: number;
  gap: number;
}

/**
 * If every project had held the studio's own blended margin, how much more
 * profit would there be? Deliberately measured against the studio's own
 * average, not an invented target — this is a gap it has already proved it
 * can close, on its own work.
 */
export function marginUplift(obs: Observation[]) {
  const b = blendedMargin(obs);
  if (!b || b.n < MIN_PROJECTS_TO_SPEAK) return null;

  const rows: UpliftRow[] = realisedMargins(obs)
    .filter(m => m.marginPct < b.marginPct)
    .map(m => {
      /* Cost that would have produced the studio's average MARGIN on this
         revenue. Was revenue / (1 + pct/100), the inverse of a markup -- wrong
         once marginPct is measured over revenue. */
      const costAtAverage = m.revenue * (1 - b.marginPct / 100);
      return {
        projectId: m.projectId,
        projectName: m.projectName,
        marginPct: m.marginPct,
        cost: m.cost,
        costAtAverage,
        gap: m.cost - costAtAverage,
      };
    })
    .sort((a, b2) => b2.gap - a.gap);

  const total = rows.reduce((s, r) => s + r.gap, 0);
  const profit = b.revenue - b.cost;
  return {
    rows,
    total,
    n: b.n,
    targetPct: b.marginPct,
    upliftPct: profit > 0 ? (total / profit) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// Delivery speed — measured from the bills, the only dates the books carry
// ---------------------------------------------------------------------------
export interface DurationRecord {
  projectId: string;
  projectName: string;
  months: number;
  transactions: number;
  marginPct: number;
  revenue: number;
  /** Revenue earned per month on site. */
  revenuePerMonth: number;
}

export function projectDurations(obs: Observation[]): DurationRecord[] {
  const margins = realisedMargins(obs);
  const spend = spendRows(obs);
  return margins.map(m => {
    const dates = spend
      .filter(o => o.projectId === m.projectId && o.at > 0)
      .map(o => o.at)
      .sort((a, b) => a - b);
    const months = dates.length > 1
      ? (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24 * 30.44)
      : 0;
    return {
      projectId: m.projectId,
      projectName: m.projectName,
      months,
      transactions: dates.length,
      marginPct: m.marginPct,
      revenue: m.revenue,
      revenuePerMonth: months > 0 ? m.revenue / months : 0,
    };
  }).sort((a, b) => a.months - b.months);
}

/**
 * Does taking longer cost margin? Reported with its correlation *and* the
 * fast-half / slow-half averages, because a director can act on the second
 * without trusting the first.
 */
export function speedVsMargin(obs: Observation[]) {
  const rows = projectDurations(obs).filter(d => d.months > 0);
  if (rows.length < MIN_PROJECTS_CONFIDENT) return null;

  const sorted = [...rows].sort((a, b) => a.months - b.months);
  const half = Math.floor(sorted.length / 2);
  const fast = sorted.slice(0, half);
  const slow = sorted.slice(sorted.length - half);
  const avg = (a: DurationRecord[]) => a.reduce((s, d) => s + d.marginPct, 0) / a.length;

  const r = correlate(rows.map(d => d.months), rows.map(d => d.marginPct));
  if (r == null) return null;

  return {
    r,
    strength: strengthOf(r),
    n: rows.length,
    fastAvgMonths: fast.reduce((s, d) => s + d.months, 0) / fast.length,
    slowAvgMonths: slow.reduce((s, d) => s + d.months, 0) / slow.length,
    fastAvgMargin: avg(fast),
    slowAvgMargin: avg(slow),
    gap: avg(fast) - avg(slow),
    median: sorted[Math.floor(sorted.length / 2)].months,
    longest: sorted[sorted.length - 1],
    confidence: confidenceFor(rows.length),
  };
}

// ---------------------------------------------------------------------------
// Vendor dependency — who the studio could not currently replace
// ---------------------------------------------------------------------------
export interface VendorReach {
  vendorName: string;
  costType: CostType;
  projects: number;
  reachPct: number;
  total: number;
  /** Share of all studio spend that would need re-sourcing if they left. */
  spendSharePct: number;
}

export function vendorReach(obs: Observation[], minProjects = 2): VendorReach[] {
  const totalProjects = new Set(spendRows(obs).map(o => o.projectId)).size;
  if (!totalProjects) return [];
  return vendorRecords(obs)
    .filter(v => v.projects >= minProjects)
    .map(v => ({
      vendorName: v.vendorName,
      costType: v.costType,
      projects: v.projects,
      reachPct: (v.projects / totalProjects) * 100,
      total: v.total,
      spendSharePct: v.sharePct,
    }))
    .sort((a, b) => b.reachPct - a.reachPct || b.total - a.total);
}

/** Vendors on every single project — a walk-out stops the whole studio. */
export function criticalVendors(obs: Observation[]): VendorReach[] {
  return vendorReach(obs).filter(v => v.reachPct >= 100);
}

// ---------------------------------------------------------------------------
// Spend rhythm — when money actually leaves, for cash planning
// ---------------------------------------------------------------------------
export interface MonthSpend { month: string; label: string; total: number; transactions: number; }

export function spendByMonth(obs: Observation[]) {
  const rows = spendRows(obs).filter(o => o.at > 0);
  if (!rows.length) return null;

  const byMonth = new Map<string, { total: number; transactions: number }>();
  rows.forEach(o => {
    const d = new Date(o.at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cur = byMonth.get(key) || { total: 0, transactions: 0 };
    cur.total += o.actual || 0;
    cur.transactions++;
    byMonth.set(key, cur);
  });

  const months: MonthSpend[] = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => {
      const [y, m] = month.split('-');
      const label = new Date(Number(y), Number(m) - 1, 1)
        .toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      return { month, label, total: v.total, transactions: v.transactions };
    });

  const totals = months.map(m => m.total).sort((a, b) => a - b);
  const median = totals[Math.floor(totals.length / 2)];
  const peak = months.reduce((a, b) => (b.total > a.total ? b : a));

  return {
    months,
    median,
    peak,
    /** How much bigger the worst month was than a typical one. */
    peakMultiple: median > 0 ? peak.total / median : 0,
    activeMonths: months.length,
  };
}

// ---------------------------------------------------------------------------
// Admin load — how much paperwork a project actually generates
// ---------------------------------------------------------------------------
export function transactionProfile(obs: Observation[]) {
  const rows = spendRows(obs);
  if (!rows.length) return null;
  const amounts = rows.map(o => o.actual || 0).sort((a, b) => a - b);
  const projects = new Set(rows.map(o => o.projectId)).size;
  return {
    transactions: rows.length,
    projects,
    perProject: rows.length / projects,
    median: amounts[Math.floor(amounts.length / 2)],
    mean: amounts.reduce((a, b) => a + b, 0) / amounts.length,
    largest: amounts[amounts.length - 1],
    /** Bills under ₹10k — high count, low value, pure admin drag. */
    smallBills: amounts.filter(a => a < 10000).length,
  };
}

// ---------------------------------------------------------------------------
// Cost mix per project — the shape of a job, not just its total
// ---------------------------------------------------------------------------
export interface ProjectMix {
  projectId: string;
  projectName: string;
  marginPct: number;
  cost: number;
  subcontractPct: number;
  materialPct: number;
  labourPct: number;
}

export function projectMixes(obs: Observation[]): ProjectMix[] {
  const margins = realisedMargins(obs);
  const spend = spendRows(obs);
  return margins.map(m => {
    const rows = spend.filter(o => o.projectId === m.projectId);
    const total = rows.reduce((s, o) => s + (o.actual || 0), 0);
    const share = (ct: CostType) =>
      total > 0 ? (rows.filter(o => o.dims!.costType === ct).reduce((s, o) => s + (o.actual || 0), 0) / total) * 100 : 0;
    return {
      projectId: m.projectId,
      projectName: m.projectName,
      marginPct: m.marginPct,
      cost: total,
      subcontractPct: share('subcontract'),
      materialPct: share('material'),
      labourPct: share('labour'),
    };
  }).sort((a, b) => b.marginPct - a.marginPct);
}

/** Does buying work in rather than running it yourself cost margin? */
export function outsourcingEffect(obs: Observation[]) {
  const rows = projectMixes(obs).filter(p => p.cost > 0);
  if (rows.length < MIN_PROJECTS_CONFIDENT) return null;
  const r = correlate(rows.map(p => p.subcontractPct), rows.map(p => p.marginPct));
  if (r == null) return null;

  const heavy = rows.filter(p => p.subcontractPct >= 60);
  const light = rows.filter(p => p.subcontractPct < 60);
  const avg = (a: ProjectMix[]) => (a.length ? a.reduce((s, p) => s + p.marginPct, 0) / a.length : 0);

  return {
    r,
    strength: strengthOf(r),
    n: rows.length,
    heavyCount: heavy.length,
    lightCount: light.length,
    heavyAvgMargin: avg(heavy),
    lightAvgMargin: avg(light),
    gap: avg(light) - avg(heavy),
    confidence: confidenceFor(rows.length),
  };
}

/** Does a bigger job earn a better one? Often assumed, rarely checked. */
export function sizeEffect(obs: Observation[]) {
  const rows = realisedMargins(obs);
  if (rows.length < MIN_PROJECTS_CONFIDENT) return null;
  const r = correlate(rows.map(m => m.revenue), rows.map(m => m.marginPct));
  if (r == null) return null;
  return { r, strength: strengthOf(r), n: rows.length };
}

// ---------------------------------------------------------------------------
// The briefing — findings ranked by what they are worth, each with evidence
// ---------------------------------------------------------------------------
export type FindingTone = 'risk' | 'opportunity' | 'neutral';

export interface Finding {
  id: string;
  tone: FindingTone;
  /** The claim, in one line. */
  headline: string;
  /** Why it is true, in the studio's own numbers. */
  detail: string;
  /** What the director could do about it. Omitted when there is no clean move. */
  action?: string;
  evidence: string;
  confidence: BenchmarkConfidence;
  /** Rupees at stake, when the finding can be priced. Drives the ordering. */
  valueAtStake?: number;
}

/**
 * The whole ledger, read as a short briefing. Findings only appear when their
 * own threshold is met, so this list shrinks to nothing on a thin ledger
 * rather than padding itself with noise.
 */
export function directorFindings(obs: Observation[]): Finding[] {
  const out: Finding[] = [];
  const b = blendedMargin(obs);
  if (!b || b.n < MIN_PROJECTS_TO_SPEAK) return out;

  const hedge = (c: BenchmarkConfidence) =>
    c === 'weak' ? ' Small sample — treat as a hint.' : '';

  // 1. Money left on the table
  const uplift = marginUplift(obs);
  if (uplift && uplift.rows.length && uplift.total > 0) {
    out.push({
      id: 'uplift',
      tone: 'opportunity',
      headline: `${formatShort(uplift.total)} was left on the table`,
      detail: `${uplift.rows.length} of ${uplift.n} projects came in under your own ${uplift.targetPct.toFixed(1)}% average. Holding that line on all of them would have added ${formatShort(uplift.total)} — ${uplift.upliftPct.toFixed(0)}% more profit, on the same revenue.`,
      action: `Worst offender: ${shortName(uplift.rows[0].projectName)}, ${formatShort(uplift.rows[0].gap)} over what your average would have cost.`,
      evidence: `${uplift.n} completed projects`,
      confidence: confidenceFor(uplift.n),
      valueAtStake: uplift.total,
    });
  }

  // 2. One vendor taking too much of a job
  const risk = concentrationRisk(obs);
  if (risk) {
    out.push({
      id: 'concentration',
      tone: 'risk',
      headline: `Jobs leaning on one vendor earn ${risk.gap.toFixed(1)} points less`,
      detail: `When a single vendor took ${risk.thresholdPct}%+ of a project's cost you kept ${risk.heavyAvgMargin.toFixed(1)}% (${risk.heavyCount} projects). When no one did, you kept ${risk.lightAvgMargin.toFixed(1)}% (${risk.lightCount}).${hedge(risk.confidence)}`,
      action: 'Split the largest package on the next job and quote it twice.',
      evidence: risk.examples.map(e => `${shortName(e.name)} ${e.share.toFixed(0)}% → ${e.margin.toFixed(1)}%`).join(' · '),
      confidence: risk.confidence,
      valueAtStake: (risk.gap / 100) * (b.revenue / b.n),
    });
  }

  // 3. Vendors you could not survive losing. Needs a real spread of projects:
  //    on a two-job ledger "worked on every project" is close to meaningless.
  const critical = b.n >= MIN_PROJECTS_CONFIDENT ? criticalVendors(obs) : [];
  if (critical.length) {
    const spendShare = critical.reduce((s, v) => s + v.spendSharePct, 0);
    out.push({
      id: 'critical-vendors',
      tone: 'risk',
      headline: `${critical.length} vendor${critical.length === 1 ? '' : 's'} worked on every single project`,
      detail: `${critical.map(v => v.vendorName).join(' and ')} appear${critical.length === 1 ? 's' : ''} on all ${b.n} jobs, together carrying ${spendShare.toFixed(0)}% of your spend. There is no second name on file for that work.`,
      action: 'Trial a second source on the next project, before you need one.',
      evidence: critical.map(v => `${v.vendorName} — ${formatShort(v.total)} across ${v.projects}`).join(' · '),
      confidence: confidenceFor(b.n),
    });
  }

  // 4. Slow jobs
  const speed = speedVsMargin(obs);
  if (speed && speed.strength !== 'none' && speed.gap > 0) {
    out.push({
      id: 'speed',
      tone: 'risk',
      headline: `Your slower half earned ${speed.gap.toFixed(1)} points less`,
      detail: `Projects billing over roughly ${speed.slowAvgMonths.toFixed(1)} months averaged ${speed.slowAvgMargin.toFixed(1)}%, against ${speed.fastAvgMargin.toFixed(1)}% for those wrapped in about ${speed.fastAvgMonths.toFixed(1)}. Median run is ${speed.median.toFixed(1)} months.${hedge(speed.confidence)}`,
      action: `Longest run: ${shortName(speed.longest.projectName)} at ${speed.longest.months.toFixed(1)} months and ${speed.longest.marginPct.toFixed(1)}%.`,
      evidence: `${speed.n} projects, measured first bill to last`,
      confidence: speed.confidence,
    });
  }

  // 5. Outsourcing
  const outsource = outsourcingEffect(obs);
  if (outsource && outsource.strength !== 'none' && outsource.gap > 0 && outsource.heavyCount) {
    out.push({
      id: 'outsourcing',
      tone: 'neutral',
      headline: `Heavily subcontracted jobs ran ${outsource.gap.toFixed(1)} points thinner`,
      detail: `${outsource.heavyCount} project${outsource.heavyCount === 1 ? '' : 's'} bought in 60%+ of cost and averaged ${outsource.heavyAvgMargin.toFixed(1)}%, against ${outsource.lightAvgMargin.toFixed(1)}% on the ${outsource.lightCount} you ran more directly.${hedge(outsource.confidence)}`,
      evidence: `${outsource.n} projects`,
      confidence: outsource.confidence,
    });
  }

  // 6. Profit concentration
  const pc = profitConcentration(obs);
  if (pc && pc.n >= MIN_PROJECTS_CONFIDENT && pc.projectsForHalfTheProfit <= Math.ceil(pc.n / 2)) {
    out.push({
      id: 'profit-concentration',
      tone: 'risk',
      headline: `${pc.projectsForHalfTheProfit} of ${pc.n} projects made half your profit`,
      detail: `Your weakest job, ${shortName(pc.weakest.projectName)}, took ${pc.weakest.revenueSharePct.toFixed(1)}% of revenue and returned ${pc.weakest.profitSharePct.toFixed(1)}% of profit. Revenue is spread far more evenly than earnings.`,
      evidence: `${formatShort(pc.totalProfit)} total profit across ${pc.n} projects`,
      confidence: confidenceFor(pc.n),
    });
  }

  // 7. A cash month worth planning for
  const rhythm = spendByMonth(obs);
  if (rhythm && rhythm.peakMultiple >= 2 && rhythm.activeMonths >= 6) {
    out.push({
      id: 'cash-peak',
      tone: 'neutral',
      headline: `Your heaviest month ran ${rhythm.peakMultiple.toFixed(1)}× a normal one`,
      detail: `${rhythm.peak.label} took ${formatShort(rhythm.peak.total)} out across ${rhythm.peak.transactions} bills, against a typical ${formatShort(rhythm.median)}. Outflow is lumpy, so a month like that needs planning for, not reacting to.`,
      evidence: `${rhythm.activeMonths} months of billing`,
      confidence: 'usable',
    });
  }

  // 8. The assumption that turned out to be false — worth stating plainly,
  //    because an untested belief drives pricing just as hard as a real one.
  const size = sizeEffect(obs);
  if (size && size.strength === 'none') {
    out.push({
      id: 'size-no-effect',
      tone: 'neutral',
      headline: 'Bigger projects did not earn better margins',
      detail: `Across ${size.n} projects there is no meaningful relationship between contract value and margin. Your best job was one of your smallest, and your worst was the smallest of all. Chasing size alone will not fix margin.`,
      evidence: `${size.n} projects`,
      confidence: confidenceFor(size.n),
    });
  }

  // Things that cost money first, context afterwards; within a tone, the
  // better-evidenced and more expensive finding leads.
  const toneRank: Record<FindingTone, number> = { opportunity: 0, risk: 0, neutral: 1 };
  return out.sort((a, b2) => {
    if (toneRank[a.tone] !== toneRank[b2.tone]) return toneRank[a.tone] - toneRank[b2.tone];
    const conf = (f: Finding) => (f.confidence === 'usable' ? 0 : 1);
    if (conf(a) !== conf(b2)) return conf(a) - conf(b2);
    return (b2.valueAtStake || 0) - (a.valueAtStake || 0);
  });
}

const shortName = (s: string) => s.split(' - ')[0].slice(0, 26);
const formatShort = formatCompactINR;

// ---------------------------------------------------------------------------
// Merge — importing the same data twice must not double-count
// ---------------------------------------------------------------------------
export function mergeObservations(existing: Observation[], incoming: Observation[]): Observation[] {
  const sig = (o: Observation) =>
    [o.type, o.projectId, o.dims?.vendorName || '', o.dims?.category || '',
     o.dims?.costType || '', o.quoted ?? '', o.actual ?? '', o.at].join('|');
  const seen = new Set((existing || []).map(sig));
  return [...(existing || []), ...(incoming || []).filter(o => !seen.has(sig(o)))];
}
