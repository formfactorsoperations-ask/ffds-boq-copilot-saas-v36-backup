import { FullProjectData } from "../types";
import { calculateProjectFinancials, getSingleProjectValue } from "./financialsUtils";

/* Classification lives on its own, because "is this real work" is asked by the
   deck and by the Memory page, not only by this file. */
export { classifyProject, isEmptyShell, inScope, countClasses, SCOPE_LABEL } from "./projectClassification";
export type { ProjectClass, ReportScope, ClassCounts } from "./projectClassification";

/**
 * STUDIO ANALYTICS.
 *
 * One derivation for the Reports screen, answering the four questions a studio
 * owner actually plans against: can I take more work, when does money land,
 * where is margin leaking, and what converts.
 *
 * Three rules throughout.
 *
 * MONEY IS NEVER RE-DERIVED HERE. Every rupee comes out of
 * `calculateProjectFinancials`, the same function the project screens and the
 * margin panel use. An earlier draft of this file computed milestone amounts as
 * `percentage x project value` and reported collections of 51.5L against the old
 * screen's 23.6L -- because a milestone's percentage applies to its own bucket
 * (taxable execution OR taxable design), not to the whole project, and because
 * the real calculation also carries GST, the billable/cash split, discounts and
 * the initiation-fee offset. Two implementations of the same money question will
 * always drift; there is only one here, and it is not this file's.
 *
 * Every figure names its own confidence. Where the data to answer a question
 * does not exist, the answer is a `coverage` number and a `blind` flag rather
 * than a zero that reads like a fact. A chart drawn over absent data is worse
 * than no chart, because it is believed.
 *
 * Nothing is invented to fill a series. Months with no activity are absent from
 * the arrays rather than interpolated to zero -- a studio that booked nothing in
 * June should see a gap, not a line dipping to the floor.
 */

/** The statuses that mean real money. Same list the margin panel filters on. */
const MONEY_STATUSES = ["won", "execution", "work_paused", "completed"];
const ON_SITE = ["execution", "work_paused"];
const PIPELINE = ["lead", "draft", "proposal_sent", "negotiation"];
const LOST = ["lost", "archived"];

/**
 * Same resolution order as `getSingleProjectValue`, so the tier this file reads
 * costs and revenue from is the tier every other screen is quoting from.
 */
const resolveTier = (p: any) => {
  const id = p.activeTierId || p.context?.approvedTierId;
  return (
    p.tiers?.find((t: any) => t.id === id) ||
    p.tiers?.find((t: any) => t.name === "Comfort Upgrade") ||
    p.tiers?.[0]
  );
};

const monthKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

export interface MonthPoint {
  month: string;
  label: string;
  value: number;
  count: number;
}

export interface MarginRow {
  id: string;
  name: string;
  client: string;
  contracted: number;
  plannedCost: number;
  committed: number;
  quotedMargin: number;
  currentMargin: number;
  quotedPct: number;
  currentPct: number;
  /** Margin readings only mean something once procurement is committed. */
  hasProcurement: boolean;
}

export interface StudioAnalytics {
  capacity: {
    activeSites: number;
    sqftOnSite: number;
    avgValuePerActive: number;
    /** Contracted projects by the month their proposal was accepted. */
    wonByMonth: MonthPoint[];
    /** Of the contracted projects, how many carry that date. */
    datedWins: number;
    /** Total contracted projects, so the series can state its own coverage. */
    contractedCount: number;
    /** Share of the portfolio's value that is live work rather than pipeline. */
    loadPct: number;
  };
  cash: {
    contracted: number;
    /** Raised but not yet received. */
    pending: number;
    collected: number;
    /** Contracted work still to be invoiced or collected. */
    outstanding: number;
    /** Collected as a share of everything contracted. */
    collectionRate: number;
    /** Collections by month, from invoice dates on paid milestones. */
    collectedByMonth: MonthPoint[];
    /** Of `collected`, how much carries a date and so appears in the series. */
    datedCollected: number;
    datedMilestones: number;
    paidMilestones: number;
  };
  margin: {
    contracted: number;
    plannedCost: number;
    committed: number;
    quotedMargin: number;
    currentMargin: number;
    quotedPct: number;
    currentPct: number;
    drift: number;
    rows: MarginRow[];
    /** Projects with any purchase order raised. */
    withProcurement: number;
    /** Committed as a share of planned cost. Near zero means margin is unmeasured. */
    procurementCoverage: number;
    /** True when there is too little procurement for drift to mean anything. */
    blind: boolean;
  };
  pipeline: {
    winRate: number;
    wonCount: number;
    lostCount: number;
    openCount: number;
    pipelineValue: number;
    wonValue: number;
    lostValue: number;
    byStage: { key: string; label: string; count: number; value: number }[];
  };
}

/**
 * @param posByProject purchase orders keyed by project id. Loaded by the caller
 *   because they are a separate fetch; an empty map is honest -- it surfaces as
 *   `blind`, not as zero drift.
 */
export function buildStudioAnalytics(
  projects: FullProjectData[],
  posByProject: Record<string, any[]> = {}
): StudioAnalytics {
  let activeSites = 0;
  let sqftOnSite = 0;
  let activeValue = 0;
  let pipelineValue = 0;
  let wonValue = 0;
  let lostValue = 0;
  let deliveredValue = 0;
  let wonCount = 0;
  let lostCount = 0;
  let openCount = 0;
  let datedWins = 0;

  let contracted = 0;
  let plannedCostTotal = 0;
  let committedTotal = 0;
  let effectiveCostTotal = 0;
  let pending = 0;
  let collected = 0;
  let datedCollected = 0;
  let datedMilestones = 0;
  let paidMilestones = 0;
  let withProcurement = 0;

  const wonMap: Record<string, { value: number; count: number }> = {};
  const collectedMap: Record<string, { value: number; count: number }> = {};
  const stageMap: Record<string, { key: string; label: string; count: number; value: number }> = {
    pipeline: { key: "pipeline", label: "Leads & proposals", count: 0, value: 0 },
    won: { key: "won", label: "Contracted", count: 0, value: 0 },
    execution: { key: "execution", label: "On site", count: 0, value: 0 },
    delivered: { key: "delivered", label: "Delivered", count: 0, value: 0 },
    lost: { key: "lost", label: "Lost", count: 0, value: 0 },
  };

  const marginRows: MarginRow[] = [];

  for (const p of projects) {
    const ctx: any = p.context || {};
    const status = ctx.status || "draft";
    const value = getSingleProjectValue(p) || 0;

    /* ── portfolio shape ────────────────────────────────────────────── */
    if (status === "completed") {
      deliveredValue += value;
      wonCount++;
      stageMap.delivered.count++;
      stageMap.delivered.value += value;
    } else if (MONEY_STATUSES.includes(status)) {
      wonValue += value;
      wonCount++;
      activeValue += value;
      if (ON_SITE.includes(status)) {
        activeSites++;
        sqftOnSite += Number(ctx.area || 0) || 0;
        stageMap.execution.count++;
        stageMap.execution.value += value;
      } else {
        stageMap.won.count++;
        stageMap.won.value += value;
      }
    } else if (PIPELINE.includes(status)) {
      pipelineValue += value;
      openCount++;
      stageMap.pipeline.count++;
      stageMap.pipeline.value += value;
    } else if (LOST.includes(status)) {
      lostValue += value;
      lostCount++;
      stageMap.lost.count++;
      stageMap.lost.value += value;
    }

    /* Everything below is money, and money is only asked of projects that
       have any -- the same filter the margin panel applies. */
    if (!MONEY_STATUSES.includes(status)) continue;

    /* ── contracts by month, from the accepted gate ─────────────────── */
    /* Only for projects that actually became contracts. Twenty-two projects
       carry a proposalAccepted date, but five of them are lost and six are
       still leads -- the gate records that a proposal was accepted, not that
       the work was ever signed. Counting all of them would have shown the
       studio winning 14 jobs in July when it contracted far fewer. */
    const wonAt = ctx.lifecycle?.gates?.proposalAccepted?.at;
    if (wonAt) {
      datedWins++;
      const k = monthKey(wonAt);
      wonMap[k] = wonMap[k] || { value: 0, count: 0 };
      wonMap[k].value += value;
      wonMap[k].count++;
    }

    const tier = resolveTier(p);
    let fin: any;
    try {
      fin = calculateProjectFinancials(ctx, tier);
    } catch {
      continue;
    }

    /* ── cash, straight from the shared calculation ─────────────────── */
    collected += fin.totalPaid || 0;
    pending += fin.pendingAmt || 0;

    /* The by-month series re-uses that same calculation's own milestone
       function, so a bar can never disagree with the total above it. Only
       dated milestones can be placed, and `datedCollected` says how much of
       the total the series actually accounts for. */
    for (const m of (ctx.paymentMilestones || []) as any[]) {
      if (String(m.status || "").toLowerCase() !== "paid") continue;
      paidMilestones++;
      const when = m.invoiceDate || m.paidDate || m.date;
      if (!when) continue;
      const ts = new Date(when).getTime();
      if (!Number.isFinite(ts)) continue;
      const amount = fin.calculateMilestoneTotal ? fin.calculateMilestoneTotal(m) : 0;
      datedMilestones++;
      datedCollected += amount;
      const k = monthKey(ts);
      collectedMap[k] = collectedMap[k] || { value: 0, count: 0 };
      collectedMap[k].value += amount;
      collectedMap[k].count++;
    }

    /* ── margin, mirroring PortfolioMarginPanel exactly ─────────────── */
    const contractedValue = (fin.taxableExecution || 0) + (fin.taxableDesign || 0);
    const plannedCost = Number((tier as any)?.summary?.totalCost || 0);

    const pos = (posByProject[p.id] || []).filter(
      (po: any) => po && po.status !== "cancelled" && ["issued", "received", "closed"].includes(po.status)
    );
    const committed = pos.reduce((s: number, po: any) => s + (po.total || 0), 0);
    const billed = pos.reduce((s: number, po: any) => s + (po.billAmount != null ? po.billAmount : 0), 0);

    if (contractedValue > 0) {
      /* Real numbers where they exist, the plan where they do not -- the same
         whole-project switch the margin panel makes. */
      const effectiveCost = committed > 0 ? Math.max(committed, billed) : plannedCost;
      const quotedMargin = contractedValue - plannedCost;
      const currentMargin = contractedValue - effectiveCost;

      contracted += contractedValue;
      plannedCostTotal += plannedCost;
      committedTotal += committed;
      /* Summed per project, never switched at portfolio level. Switching on
         the TOTAL committed read 99.8% margin off this portfolio: one project
         had raised 33k of purchase orders, which made `committed > 0` true for
         all eleven and priced the other ten at zero cost. Real cost where a
         project has it, its plan where it does not -- decided per project. */
      effectiveCostTotal += effectiveCost;
      if (committed > 0) withProcurement++;

      marginRows.push({
        id: p.id,
        name: ctx.name || ctx.clientName || "Untitled",
        client: ctx.clientName || "",
        contracted: contractedValue,
        plannedCost,
        committed,
        quotedMargin,
        currentMargin,
        quotedPct: (quotedMargin / contractedValue) * 100,
        currentPct: (currentMargin / contractedValue) * 100,
        hasProcurement: committed > 0,
      });
    }
  }

  const series = (map: Record<string, { value: number; count: number }>): MonthPoint[] =>
    Object.keys(map)
      .sort()
      .map((k) => ({ month: k, label: monthLabel(k), value: map[k].value, count: map[k].count }));

  const portfolioValue = pipelineValue + wonValue + deliveredValue;
  const procurementCoverage = plannedCostTotal > 0 ? committedTotal / plannedCostTotal : 0;
  return {
    capacity: {
      activeSites,
      sqftOnSite,
      avgValuePerActive: activeSites > 0 ? activeValue / activeSites : 0,
      wonByMonth: series(wonMap),
      datedWins,
      contractedCount: wonCount,
      loadPct: portfolioValue > 0 ? (wonValue / portfolioValue) * 100 : 0,
    },
    cash: {
      contracted,
      pending,
      collected,
      outstanding: Math.max(0, contracted - collected),
      /* Collected against everything contracted -- "how much of the work we
         have won has actually been paid for". Deliberately NOT collected over
         invoiced, which flatters: it only measures how well raised invoices
         are chased, and reads near 100% on a studio that has barely billed. */
      collectionRate: contracted > 0 ? (collected / contracted) * 100 : 0,
      collectedByMonth: series(collectedMap),
      datedCollected,
      datedMilestones,
      paidMilestones,
    },
    margin: {
      contracted,
      plannedCost: plannedCostTotal,
      committed: committedTotal,
      quotedMargin: contracted - plannedCostTotal,
      currentMargin: contracted - effectiveCostTotal,
      quotedPct: contracted > 0 ? ((contracted - plannedCostTotal) / contracted) * 100 : 0,
      currentPct: contracted > 0 ? ((contracted - effectiveCostTotal) / contracted) * 100 : 0,
      drift: committedTotal > 0 ? plannedCostTotal - committedTotal : 0,
      rows: marginRows.sort((a, b) => a.currentPct - b.currentPct),
      withProcurement,
      procurementCoverage,
      /* Under a twentieth of planned cost committed means drift is noise, not
         signal. The screen says so rather than drawing a confident line. */
      blind: procurementCoverage < 0.05,
    },
    pipeline: {
      winRate: wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : 0,
      wonCount,
      lostCount,
      openCount,
      pipelineValue,
      wonValue,
      lostValue,
      byStage: Object.values(stageMap),
    },
  };
}
