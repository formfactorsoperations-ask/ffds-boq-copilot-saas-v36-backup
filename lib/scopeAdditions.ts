import { Item } from "../types";

/**
 * SCOPE ADDITIONS, AS MONEY.
 *
 * A scope addition is work the client asked for after the BOQ was frozen. It is
 * priced, invoiced and built like the original contract -- and until now it was
 * visible only on its own screen. The Money tab, the project's contracted value
 * and the studio's Reports all stopped at the frozen BOQ, so a project could
 * carry 71,980 of supplementary invoices and show none of it.
 *
 * TWO TIERS, because an addition is not one thing:
 *
 *   RAISED     -- a supplementary invoice has gone to the client. Real work has
 *                 been quoted and may already be under way, but the client has
 *                 not settled it, so it is not contract value yet.
 *   AUTHORISED -- `paymentGate.workAuthorized`, which this app sets only once
 *                 the addition is fully paid (execution alone for TYPE_A, design
 *                 AND execution for everything else). That makes "authorised"
 *                 and "paid" the same event here, so an authorised addition adds
 *                 to contracted value and to collections at the same moment.
 *
 * The revised contract counts AUTHORISED only. Raised-but-unsettled sits beside
 * it as its own figure rather than being folded in, because booking revenue the
 * client has not agreed to is how a studio ends up unwinding numbers it has
 * already acted on.
 *
 * Partial payment is real and is counted as it falls: the design fee and the
 * execution amount are separate gates, so a half-paid addition contributes its
 * paid half to collections while staying out of the revised contract.
 */

export interface ScopeAdditionRecord {
  /** Firestore document id. */
  docId: string;
  /** Human reference, e.g. "SA-001". */
  ref: string;
  type: string;
  clientRequest: string;
  createdAt: number | null;

  executionValue: number;      // base cost, ex-margin, ex-GST
  executionSubtotal: number;   // base + margin, ex-GST
  executionMargin: number;
  executionGst: number;
  executionTotal: number;

  designFeeBase: number;
  designFeeGst: number;
  designFeeTotal: number;

  grandTotal: number;

  invoiceStatus: string;
  designFeePaid: boolean;
  executionPaid: boolean;
  workAuthorized: boolean;

  miniBoq: any[];
  newDrawingsRequired: string[];
  rateSnapshotDate: number | null;
}

const ts = (v: any): number | null => {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  const d = new Date(v).getTime();
  return Number.isFinite(d) ? d : null;
};

const num = (v: any): number => Number(v ?? 0) || 0;

/** Firestore document -> a shape the rest of the app can rely on. */
export function normaliseAddition(docId: string, d: any): ScopeAdditionRecord {
  const gate = d?.paymentGate || {};
  return {
    docId,
    ref: d?.id || docId,
    type: d?.type || "TYPE_B",
    clientRequest: d?.clientRequest || "",
    createdAt: ts(d?.createdAt),

    executionValue: num(d?.executionValue),
    executionSubtotal: num(d?.executionSubtotal),
    executionMargin: num(d?.executionMargin),
    executionGst: num(d?.executionGst),
    executionTotal: num(d?.executionTotal),

    designFeeBase: num(d?.designFeeBase),
    designFeeGst: num(d?.designFeeGst),
    designFeeTotal: num(d?.designFeeTotal),

    grandTotal: num(d?.grandTotal),

    invoiceStatus: d?.invoiceStatus || "draft",
    designFeePaid: !!gate.designFeePaid,
    executionPaid: !!gate.executionPaid,
    workAuthorized: !!gate.workAuthorized,

    miniBoq: Array.isArray(d?.miniBoq) ? d.miniBoq : [],
    newDrawingsRequired: Array.isArray(d?.newDrawingsRequired) ? d.newDrawingsRequired : [],
    rateSnapshotDate: ts(d?.rateSnapshotDate),
  };
}

/** A cancelled addition is not money. Everything else has been put to the client. */
const isLive = (a: ScopeAdditionRecord) =>
  a.invoiceStatus !== "cancelled" && a.invoiceStatus !== "void" && a.invoiceStatus !== "draft";

export interface AdditionMargin {
  ref: string;
  /** Margin on this addition, over its ex-GST sell. */
  pct: number;
  rupees: number;
  /** True when it is priced thinner than the contract it is being added to. */
  thinnerThanBase: boolean;
}

export interface RateDriftRow {
  ref: string;
  description: string;
  /** What the addition charged, per unit, as base cost. */
  chargedRate: number;
  /** What the rate bank says that item costs today. */
  currentRate: number;
  /** currentRate - chargedRate. Positive means the addition under-priced it. */
  gap: number;
  gapPct: number;
  qty: number;
  /** Rupees of exposure across the quantity. */
  exposure: number;
}

export interface ScopeAdditionSummary {
  all: ScopeAdditionRecord[];
  live: ScopeAdditionRecord[];

  /** Invoiced to the client, not yet settled. Not contract value. */
  raised: ScopeAdditionRecord[];
  raisedTotal: number;

  /** Fully paid and released for work. This IS contract value. */
  authorised: ScopeAdditionRecord[];
  authorisedTotal: number;

  /** Money actually in, counting each gate separately so half-paid counts half. */
  collected: number;
  /** Raised value still owed. */
  outstanding: number;

  /** Additions as a share of the frozen contract. */
  creepPct: number;
  /** Authorised additions as a share of the frozen contract. */
  authorisedCreepPct: number;

  margins: AdditionMargin[];
  /** Weighted margin across live additions, over ex-GST sell. */
  blendedMarginPct: number | null;
  /** Additions priced thinner than the base contract's own margin. */
  thinCount: number;

  drift: RateDriftRow[];
  /** Total rupees the additions under-priced against today's rate bank. */
  driftExposure: number;
  /**
   * Lines that could actually be compared: they carry a bankId, the item still
   * exists, and both rates are real. Deliberately separate from `drift.length`
   * -- "checked and the rate has not moved" and "could not be checked at all"
   * are opposite findings, and reporting one number for both would let a screen
   * claim a clean bill of health it never took.
   */
  driftComparable: number;
  /** Every line across every live addition. */
  driftTotalLines: number;
}

/**
 * @param additions normalised records for one project
 * @param contractedExGst the frozen BOQ's ex-GST value, for the creep and margin
 *   comparisons. Pass the same figure Money shows as the contract.
 * @param baseMarginPct the contract's own margin, so an addition can be called
 *   thin against the job it belongs to rather than an arbitrary threshold.
 * @param bank the rate bank, for drift. Omit to skip that section.
 */
export function summariseScopeAdditions(
  additions: ScopeAdditionRecord[],
  contractedExGst: number,
  baseMarginPct: number | null,
  bank?: Item[]
): ScopeAdditionSummary {
  const all = additions || [];
  const live = all.filter(isLive);

  const authorised = live.filter((a) => a.workAuthorized);
  const raised = live.filter((a) => !a.workAuthorized);

  const sum = (rows: ScopeAdditionRecord[]) => rows.reduce((s, a) => s + a.grandTotal, 0);
  const authorisedTotal = sum(authorised);
  const raisedTotal = sum(raised);

  /* Each gate counted on its own, so an addition whose design fee is settled but
     whose execution is not contributes exactly the design fee. */
  const collected = live.reduce(
    (s, a) => s + (a.designFeePaid ? a.designFeeTotal : 0) + (a.executionPaid ? a.executionTotal : 0),
    0
  );
  const outstanding = Math.max(0, raisedTotal - raised.reduce(
    (s, a) => s + (a.designFeePaid ? a.designFeeTotal : 0) + (a.executionPaid ? a.executionTotal : 0),
    0
  ));

  /* ── margin per addition ───────────────────────────────────────────── */
  const margins: AdditionMargin[] = live
    .filter((a) => a.executionSubtotal > 0)
    .map((a) => {
      const pct = (a.executionMargin / a.executionSubtotal) * 100;
      return {
        ref: a.ref,
        pct,
        rupees: a.executionMargin,
        thinnerThanBase: baseMarginPct != null && pct < baseMarginPct,
      };
    });

  const marginBase = live.reduce((s, a) => s + a.executionSubtotal, 0);
  const marginRupees = live.reduce((s, a) => s + a.executionMargin, 0);
  const blendedMarginPct = marginBase > 0 ? (marginRupees / marginBase) * 100 : null;

  /* ── rate drift ────────────────────────────────────────────────────── */
  /* An addition is priced at the rates of the day it was raised. The bank moves.
     Comparing the two says whether work already committed is being delivered on
     rates that no longer cover it -- and only lines carrying a bankId can be
     compared at all, which is why the count of what was checked travels with
     the answer. */
  const byId = new Map((bank || []).map((i) => [i.id, i]));
  const drift: RateDriftRow[] = [];
  let driftTotalLines = 0;
  let driftComparable = 0;

  for (const a of live) {
    for (const line of a.miniBoq) {
      driftTotalLines++;
      const item = line?.bankId ? byId.get(line.bankId) : undefined;
      if (!item) continue;
      const currentRate = num(item.materials) + num(item.labor);
      const chargedRate = num(line.estimatedUnitRate) || num(line.baseCost);
      if (currentRate <= 0 || chargedRate <= 0) continue;
      driftComparable++;
      const gap = currentRate - chargedRate;
      /* Rounding noise is not drift. */
      if (Math.abs(gap) < 0.5) continue;
      const qty = num(line.qty) || 1;
      drift.push({
        ref: a.ref,
        description: line.description || item.name || "Item",
        chargedRate,
        currentRate,
        gap,
        gapPct: (gap / chargedRate) * 100,
        qty,
        exposure: gap * qty,
      });
    }
  }
  drift.sort((x, y) => y.exposure - x.exposure);

  const liveTotal = authorisedTotal + raisedTotal;

  return {
    all,
    live,
    raised,
    raisedTotal,
    authorised,
    authorisedTotal,
    collected,
    outstanding,
    creepPct: contractedExGst > 0 ? (liveTotal / contractedExGst) * 100 : 0,
    authorisedCreepPct: contractedExGst > 0 ? (authorisedTotal / contractedExGst) * 100 : 0,
    margins,
    blendedMarginPct,
    thinCount: margins.filter((m) => m.thinnerThanBase).length,
    drift,
    driftExposure: drift.reduce((s, d) => s + Math.max(0, d.exposure), 0),
    driftComparable,
    driftTotalLines,
  };
}

/** The Firestore path additions live at, in one place so nothing guesses it. */
export const scopeAdditionsPath = (orgId: string, projectId: string) =>
  `organizations/${orgId}/projects/${projectId}/scopeAdditions`;
