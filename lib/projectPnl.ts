import { FullBoqItem, ProjectContext, PurchaseOrder, ProcurementMode } from '../types';
import { buildEnvelopes, buildRoomMargins, Envelope, RoomMargin } from './procurement';
import { calculateProjectFinancials } from './financialsUtils';

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
// No I/O, no React. Purely a function of the data it is handed.
// ============================================================================

export type CostConfidence = 'plan-only' | 'partly-committed' | 'mostly-committed' | 'closed-out';

export interface ProjectPnl {
  /** True once anything has actually been ordered. Below this, "current" is still the plan. */
  hasProcurement: boolean;
  poCount: number;

  // ── Execution: the part with both a price and a cost ─────────────────────
  /** Contracted execution value, ex-GST, after discounts and any approved revision. */
  contractedExecution: number;
  /** BOQ cost: materials + labour, ex-GST. */
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

  quotedMargin: number;
  quotedMarginPct: number;
  currentMargin: number;
  currentMarginPct: number;
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
): ProjectPnl {
  const envelopes = buildEnvelopes(boq || [], pos || [], modes);
  const rooms = buildRoomMargins(boq || [], pos || [], modes);
  const fin = calculateProjectFinancials(context, activeTier) as any;

  const plannedCost   = envelopes.reduce((s, e) => s + e.budgetTotal, 0);
  const committedCost = envelopes.reduce((s, e) => s + e.committedTotal, 0);
  const billedCost    = envelopes.reduce((s, e) => s + e.billedTotal, 0);
  const paidCost      = envelopes.reduce((s, e) => s + e.paidTotal, 0);
  const poCount       = envelopes.reduce((s, e) => s + e.poCount, 0);

  // Per-envelope, so an unordered category still contributes its budget.
  const effectiveCost = envelopes.reduce(
    (s, e) => s + (e.committedTotal > 0 ? Math.max(e.committedTotal, e.billedTotal) : e.budgetTotal),
    0,
  );

  const overspentEnvelopes = envelopes.filter(e => e.overBy > 0);
  const overspend = overspentEnvelopes.reduce((s, e) => s + e.overBy, 0);

  const contractedExecution = fin.taxableExecution || 0;
  const contractedDesign    = fin.taxableDesign || 0;

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
    'No purchase orders raised yet, so cost is still the BOQ estimate. Add POs to see what this job is really making.',
  'partly-committed':
    'Only part of the cost is committed. The rest is still the BOQ estimate and can move.',
  'mostly-committed':
    'Most of the cost is committed, so this figure is close to what the job will actually make.',
  'closed-out':
    'Ordered and billed. Barring late variations, this is the final margin.',
};
