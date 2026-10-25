import { FullBoqItem, Item, ProjectContext, PurchaseOrder, ProcurementMode } from '../types';
import { buildEnvelopes, buildRoomMargins, effectiveMaterials, envelopeKey, Envelope, RoomMargin } from './procurement';
import { calculateProjectFinancials } from './financialsUtils';
import { isBillable } from './boqPricing';
import { calculateSellPrice } from './utils';

// ============================================================================
// PROJECT P&L — did this job make money?
//
// The pieces have all existed for a while and never met: `buildEnvelopes`
// knows what was budgeted and committed, `buildRoomMargins` knows quoted sell
// per room, and `calculateProjectFinancials` knows what the client owes and
// has paid. Nothing added them up, so the only honest answer a studio owner
// could give about a finished project was "I think that one went fine".
//
// Two correctness rules this file exists to hold:
//
//   1. REVENUE IS COMPARED EX-GST. `currentProjectValue` includes tax; BOQ
//      cost does not. Comparing them overstates margin by the whole GST rate,
//      which on an 18% rate turns a bad job into a good-looking one. Margin
//      here uses `taxableExecution` only.
//
//   2. DESIGN FEE IS MARGIN. It has no cost line — the studio's own time is
//      overhead, not a project cost — so every rupee of it drops through to
//      the bottom. Project margin is therefore the design fee PLUS whatever
//      the execution work makes over its material and labour cost. An earlier
//      version of this file excluded the fee and understated margin badly:
//      on a real project it read 9.3% when the true figure was 19.0%.
//
//   3. POTENTIAL MARGIN COMES FROM THE BOQ'S OWN MARGIN %. Cost used to be
//      every BOQ line at cost, against the contract. That read 7% on real
//      projects for three reasons: lines that are not in the scope (deleted,
//      excluded, client-procured) were costed; lines imported with a sell rate
//      and no cost behind it are stored at 0% margin, so they counted their
//      whole price as cost; and the BOQ in use was not always the one the
//      contract was priced from. Now the margin % of the billable lines that
//      carry a cost is applied to what was sold, before discounts, and the
//      discount comes off margin in full. Lines with no cost take the BOQ's
//      margin %; the card says how many there are.
//
//   4. ACTUAL MARGIN COMES FROM VENDOR BILLS AND ORDERS. Where a package has
//      purchase orders, its cost is the greater of what was ordered and what
//      was billed; where it has none yet, it is still its share of the
//      potential cost. So the actual figure firms up bill by bill.
//
// No I/O, no React. Purely a function of the data it is handed.
// ============================================================================

export type CostConfidence = 'plan-only' | 'partly-committed' | 'mostly-committed' | 'closed-out';

/**
 * Where the BOQ's cost is known. 'boq': some billable lines carry a cost, so the
 * BOQ has a margin %. 'no-costs': every line is a sell rate with no cost behind
 * it, so no margin can be read. 'empty': no billable lines at all.
 */
export type MarginBasis = 'boq' | 'assumed' | 'no-costs' | 'empty';

/**
 * Where an assumed margin % comes from, when the BOQ carries no costs at all
 * (a BOQ imported as sell rates only, which is how most legacy projects are):
 *   'project' -- the owner set this project's margin on the P&L card;
 *   'options' -- this project's other BOQ options that do carry costs;
 *   'bank'    -- the studio's usual margin, the item bank's average.
 */
export type MarginSource = 'project' | 'options' | 'bank';
export interface MarginAssumption { pct: number; source: MarginSource }

export const MARGIN_SOURCE_LABEL: Record<MarginSource, string> = {
  project: 'set for this project',
  options: "from this project's other BOQ options",
  bank: "the studio's usual margin, from the item bank",
};

/** The margin % the owner set for this project, if any. */
export const projectMarginPct = (context: any): number | null => {
  const v = Number(context?.financials?.expectedMarginPct);
  return Number.isFinite(v) && v > 0 && v < 100 ? v : null;
};

/**
 * What margin to assume when the BOQ in use has no costs: the project's own
 * figure, else the margin on the project's other options that carry costs,
 * else the item bank's average. Null when none of them says anything.
 */
export function marginAssumption(context: any, tiers: any[] | null | undefined, bank: Item[] | null | undefined): MarginAssumption | null {
  const own = projectMarginPct(context);
  if (own != null) return { pct: own, source: 'project' };

  const bankMap = new Map<string, Item>((bank || []).map(i => [i.id, i]));
  (context?.adHocItems || []).forEach((i: Item) => bankMap.set(i.id, i));
  let sell = 0, cost = 0;
  (tiers || []).forEach(t => (t?.boq || []).forEach((b: any) => {
    if (!b || !isBillable(b)) return;
    const qty = Number(b.qty) || 0;
    if (qty <= 0) return;
    const item = bankMap.get(b.bankId);
    const mat = Number(b.baseRate !== undefined ? b.baseRate : item ? item.materials : b.materials) || 0;
    const lab = Number(b.labor !== undefined ? b.labor : item ? item.labor : 0) || 0;
    const margin = Number(b.marginOverride ?? item?.margin ?? 0) || 0;
    const c = (mat + lab) * qty;
    if (margin === 0 || c <= 0) return;
    cost += c;
    sell += calculateSellPrice(mat, lab, margin) * qty;
  }));
  if (sell > 0) return { pct: Math.round(((sell - cost) / sell) * 1000) / 10, source: 'options' };

  /* The bank stores markup on cost; as a share of sell that is m / (100 + m). */
  const shares = (bank || [])
    .filter(i => (Number(i.margin) || 0) > 0 && ((Number(i.materials) || 0) + (Number(i.labor) || 0)) > 0)
    .map(i => (Number(i.margin) / (100 + Number(i.margin))) * 100);
  if (shares.length) return { pct: Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * 10) / 10, source: 'bank' };
  return null;
}

export interface BoqMarginBasis {
  basis: MarginBasis;
  /** Sell value of the billable lines, margin applied. */
  sell: number;
  /** Sell and cost of the billable lines that carry a cost. */
  costedSell: number;
  costedCost: number;
  /** Margin as a share of sell, over the lines that carry a cost. Null when none do. */
  marginPct: number | null;
  /** Billable lines priced with no cost behind them (0% margin): legacy and imported lines. */
  uncostedLines: number;
  uncostedSell: number;
  /** Cost per package: the line's cost where known, else its sell less the BOQ's margin %. */
  estimateByEnvelope: Map<string, number>;
  estimatedCost: number;
}

/**
 * The BOQ's own margin: billable lines only, and only the lines that carry a
 * cost decide the %. A line at 0% margin is how an imported sell rate with no
 * cost is stored (lib/scopeDraft), so it is read as "cost not known", not as
 * "sold at cost".
 */
export function boqMarginBasis(boq: FullBoqItem[]): BoqMarginBasis {
  let sell = 0, costedSell = 0, costedCost = 0, uncostedSell = 0, uncostedLines = 0;
  const lines: { key: string; sell: number; cost: number | null }[] = [];
  (boq || []).forEach(i => {
    if (!i || !isBillable(i as any)) return;
    const qty = Number(i.qty) || 0;
    if (qty <= 0) return;
    const mat = Number(effectiveMaterials(i)) || 0;
    const lab = Number(i.labor) || 0;
    const margin = Number((i as any).marginOverride ?? i.margin ?? 0) || 0;
    const lineSell = calculateSellPrice(mat, lab, margin) * qty;
    const lineCost = (mat + lab) * qty;
    if (lineSell <= 0) return;
    sell += lineSell;
    const key = envelopeKey(i.roomId || 'Unassigned', i.cat || 'Other');
    if (margin !== 0 && lineCost > 0) {
      costedSell += lineSell;
      costedCost += lineCost;
      lines.push({ key, sell: lineSell, cost: lineCost });
    } else {
      uncostedSell += lineSell;
      uncostedLines += 1;
      lines.push({ key, sell: lineSell, cost: null });
    }
  });
  const marginPct = costedSell > 0 ? ((costedSell - costedCost) / costedSell) * 100 : null;
  const estimateByEnvelope = new Map<string, number>();
  let estimatedCost = 0;
  lines.forEach(l => {
    const c = l.cost != null ? l.cost : l.sell * (1 - (marginPct ?? 0) / 100);
    estimateByEnvelope.set(l.key, (estimateByEnvelope.get(l.key) || 0) + c);
    estimatedCost += c;
  });
  return {
    basis: sell <= 0 ? 'empty' : marginPct == null ? 'no-costs' : 'boq',
    sell, costedSell, costedCost, marginPct, uncostedLines, uncostedSell, estimateByEnvelope, estimatedCost,
  };
}

export interface ProjectPnl {
  /** True once anything has actually been ordered. Below this, "current" is still the plan. */
  hasProcurement: boolean;
  poCount: number;

  // ── Execution: the part with both a price and a cost ─────────────────────
  /** Contracted execution value, ex-GST, after discounts and any approved revision. */
  contractedExecution: number;
  /**
   * Potential cost, ex-GST: what was sold before discounts, less the BOQ's
   * margin % (`boqMarginPct`). Falls back to the BOQ's own cost when there is
   * no contract yet.
   */
  plannedCost: number;
  /** Issued purchase orders. Drafts and cancellations excluded. */
  committedCost: number;
  /** Vendor bills actually entered. */
  billedCost: number;
  /** Cash paid out to vendors. */
  paidCost: number;
  /**
   * Best current estimate of the final cost. Decided per envelope, not once
   * for the project: an envelope with orders uses the greater of committed and
   * billed; an envelope with nothing ordered still uses its budget. A project
   * half-ordered is therefore half plan and half reality, which is the truth.
   */
  effectiveCost: number;

  /** Execution + design fee, ex-GST. The revenue margin is measured against. */
  contractedTotal: number;
  /** What the execution work alone makes over its cost. */
  executionMarginQuoted: number;
  executionMarginCurrent: number;

  /** Potential margin: the BOQ's margin % on what was sold, less discounts, plus the design fee. */
  quotedMargin: number;
  quotedMarginPct: number;
  /** Actual margin: vendor bills and orders where there are any, the potential cost elsewhere. */
  currentMargin: number;
  currentMarginPct: number;
  /** Where the potential margin's cost comes from (see MarginBasis). */
  marginBasis: MarginBasis;
  /** The margin % assumed because the BOQ has no costs, and where it came from. Null otherwise. */
  assumedMargin: MarginAssumption | null;
  /** The BOQ's margin as a share of its sell value, over lines that carry a cost. */
  boqMarginPct: number | null;
  /** Billable lines with no cost behind them, which take the BOQ's margin %. */
  uncostedLines: number;
  /** Share of the BOQ's sell value on those lines. */
  uncostedSharePct: number;
  /** True once a vendor has billed anything. */
  hasBills: boolean;
  /** Negative means this job is worse than quoted. This is the number that matters. */
  marginMovement: number;
  marginMovementPct: number;

  /** Share of planned cost that has been committed — how far to trust `currentMargin`. */
  coveragePct: number;
  confidence: CostConfidence;

  /** Committed above budget, summed per envelope so overs are not netted off by unders. */
  overspend: number;
  overspentEnvelopes: Envelope[];

  /** Design fee, ex-GST. No cost line, so it is margin in full. */
  contractedDesign: number;

  /**
   * Whether GST is charged on execution for THIS project. It is a per-project
   * toggle and is genuinely off on some jobs, so the card states it rather
   * than letting the reader assume. Margin is ex-GST either way; this only
   * changes the cash figures.
   */
  gstOnExecution: boolean;
  gstRate: number;

  // ── Cash, which is a different question from profit ──────────────────────
  /** Received from the client, including GST — this is real money in. */
  receivedFromClient: number;
  /**
   * Invoiced and not yet paid, including GST. NOT the whole uncollected
   * contract — `calculateProjectFinancials.pendingAmt` only counts milestones
   * whose status is 'invoiced' or 'advance_requested'. Labelling this "still
   * to collect" reads as "the client owes nothing" on a project where nothing
   * has been invoiced yet, which is the opposite of the truth.
   */
  awaitingPayment: number;
  /** Whole contract not yet received, including GST. The real exposure. */
  uncollected: number;
  /** Received from client minus paid to vendors. Not profit; cash in hand. */
  cashPosition: number;

  rooms: RoomMargin[];
  envelopes: Envelope[];
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

export function buildProjectPnl(
  context: ProjectContext | null | undefined,
  boq: FullBoqItem[],
  pos: PurchaseOrder[],
  activeTier?: any,
  modes: Record<string, ProcurementMode> = {},
  /** Used only when no BOQ line carries a cost (marginAssumption). */
  assumption: MarginAssumption | null = null,
): ProjectPnl {
  const envelopes = buildEnvelopes(boq || [], pos || [], modes);
  const rooms = buildRoomMargins(boq || [], pos || [], modes);
  const fin = calculateProjectFinancials(context, activeTier) as any;

  const raw = boqMarginBasis(boq || []);
  /*
    A BOQ with no costs at all takes an assumed margin (the project's own
    figure, its other options, or the studio's usual margin), so a legacy
    project imported as sell rates still shows a real potential margin rather
    than the design fee alone. A BOQ with some costs keeps its own %.
  */
  const assumed = raw.basis !== 'boq' && assumption && assumption.pct > 0 && assumption.pct < 100 ? assumption : null;
  const basis: BoqMarginBasis = assumed
    ? (() => {
        const estimateByEnvelope = new Map<string, number>();
        raw.estimateByEnvelope.forEach((v, k) => estimateByEnvelope.set(k, v * (1 - assumed.pct / 100)));
        return { ...raw, basis: 'assumed' as MarginBasis, marginPct: assumed.pct, estimateByEnvelope, estimatedCost: raw.estimatedCost * (1 - assumed.pct / 100) };
      })()
    : raw;
  const committedCost = envelopes.reduce((s, e) => s + e.committedTotal, 0);
  const billedCost    = envelopes.reduce((s, e) => s + e.billedTotal, 0);
  const paidCost      = envelopes.reduce((s, e) => s + e.paidTotal, 0);
  const poCount       = envelopes.reduce((s, e) => s + e.poCount, 0);

  const overspentEnvelopes = envelopes.filter(e => e.overBy > 0);
  const overspend = overspentEnvelopes.reduce((s, e) => s + e.overBy, 0);

  const contractedExecution = fin.taxableExecution || 0;
  const contractedDesign    = fin.taxableDesign || 0;
  const grossExecution      = fin.grossExecution ?? contractedExecution;

  /*
    Potential cost: the BOQ's margin % applied to what was sold before any
    discount. When the contract figure is not the BOQ's own total (an approved
    value typed in, a later option), the BOQ still says what share of it is
    cost. With no contract yet, the BOQ's own cost estimate stands.
  */
  const plannedCost = grossExecution <= 0 ? basis.estimatedCost
    : basis.marginPct != null ? grossExecution * (1 - basis.marginPct / 100)
    /* No line carries a cost, so no margin can be read: cost is taken as what was sold. */
    : grossExecution;

  // Per-envelope, so an unordered package still contributes its share of the potential cost.
  const scale = basis.estimatedCost > 0 ? plannedCost / basis.estimatedCost : 0;
  const effectiveCost = envelopes.reduce(
    (s, e) => s + (e.committedTotal > 0
      ? Math.max(e.committedTotal, e.billedTotal)
      : (basis.estimateByEnvelope.get(e.key) || 0) * scale),
    0,
  );

  /* Design fee carries no cost, so it is margin in full and simply adds. */
  const contractedTotal = contractedExecution + contractedDesign;
  const quotedMargin    = contractedTotal - plannedCost;
  const currentMargin   = contractedTotal - effectiveCost;

  const coveragePct = pct(committedCost, plannedCost);
  const confidence: CostConfidence =
    committedCost <= 0        ? 'plan-only'
    : billedCost >= committedCost * 0.95 && coveragePct >= 90 ? 'closed-out'
    : coveragePct >= 60       ? 'mostly-committed'
    : 'partly-committed';

  return {
    hasProcurement: committedCost > 0,
    poCount,

    contractedExecution,
    plannedCost,
    committedCost,
    billedCost,
    paidCost,
    effectiveCost,

    contractedTotal,
    executionMarginQuoted:  contractedExecution - plannedCost,
    executionMarginCurrent: contractedExecution - effectiveCost,

    quotedMargin,
    quotedMarginPct:  pct(quotedMargin, contractedTotal),
    currentMargin,
    currentMarginPct: pct(currentMargin, contractedTotal),
    marginMovement:   currentMargin - quotedMargin,
    marginMovementPct: pct(currentMargin - quotedMargin, contractedTotal),
    marginBasis: basis.basis,
    assumedMargin: assumed,
    boqMarginPct: basis.marginPct,
    uncostedLines: basis.uncostedLines,
    uncostedSharePct: pct(basis.uncostedSell, basis.sell),
    hasBills: billedCost > 0,

    coveragePct,
    confidence,
    overspend,
    overspentEnvelopes,

    contractedDesign,
    gstOnExecution: (context as any)?.financials?.executionGstEnabled !== false,
    gstRate: (context as any)?.gstRate || 18,

    receivedFromClient: fin.totalPaid || 0,
    awaitingPayment:    fin.pendingAmt || 0,
    uncollected:        Math.max(0, (fin.currentProjectValue || 0) - (fin.totalPaid || 0)),
    cashPosition:       (fin.totalPaid || 0) - paidCost,

    rooms,
    envelopes,
  };
}

export const CONFIDENCE_LABEL: Record<CostConfidence, string> = {
  'plan-only':         'Nothing ordered yet',
  'partly-committed':  'Partly ordered',
  'mostly-committed':  'Mostly ordered',
  'closed-out':        'Ordered and billed',
};

export const CONFIDENCE_NOTE: Record<CostConfidence, string> = {
  'plan-only':
    'No purchase orders or vendor bills yet, so this is the potential margin from the BOQ. Add POs and bills to see the actual margin.',
  'partly-committed':
    'Only part of the cost is ordered or billed. The rest is still the BOQ estimate and can move.',
  'mostly-committed':
    'Most of the cost is committed, so this figure is close to what the job will actually make.',
  'closed-out':
    'Ordered and billed. Barring late variations, this is the final margin.',
};
