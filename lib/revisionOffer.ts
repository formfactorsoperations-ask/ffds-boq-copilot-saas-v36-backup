import type { ProjectContext, ProjectDiscount } from '../types';
import { nameSimilarity, norm, type RevisionResult, type SignedLine } from './scopeRevision';
import { designFeeFor } from './boqPricing';
import { engagementOf, isFeeOnly } from './engagement';
import { discountOn, discountsOf, type ClientTotalsOptions } from './scopeTotals';

/*
  A DISCOUNT GIVEN IN A SCOPE REVISION, KEPT APART FROM THE PROPOSAL'S.

  The owner's rule (Palacia, Nov 2026): a discount given at the proposal stays
  what the client agreed to; a revision can carry a discount of its own; the
  payment schedule takes all of them off.

  Before this, every offer was one project-wide list. A revision document took
  that list off both its "Signed" and "Revised" columns, so a discount added
  for the revision lowered the figure the client had already agreed, never
  showed in "Change", and a percentage proposal discount grew with every item
  the revision added (5% of ₹14.0L became 5% of ₹14.1L).

  Now:
  - The revision record holds its own offer (`ScopeRevisionRecord.offer`): a
    percentage or an amount, on the new items it adds (the default) or on the
    whole revised BOQ. Revision Studio and Money & Offers both edit it while
    the revision is a draft.
  - On issue the rupee amount is frozen into the document's client totals
    (`revisionDiscount`), and the proposal's discounts are held at what they
    were on the signed BOQ (`proposalHeld`), on both sides.
  - On apply the proposal's percentage discounts become the fixed amounts the
    client signed, and the revision's offer joins the project's discounts as a
    fixed amount: Money, the deal and the payment schedule take them all off,
    and nothing re-prices them against a later version.
*/

/**
 * What a revision's offer is worked out on:
 * - 'added': the new items the revision adds (the default);
 * - 'whole': the whole revised BOQ;
 * - 'topup': brings the total discount to a percentage of the revised BOQ. It
 *   takes off what is still needed on top of the discounts already given
 *   (Palacia: 5% of ₹16,22,600 is ₹81,130; less the ₹70,000 agreed, ₹11,130).
 *   Always a percentage.
 */
export type RevisionOfferOn = 'added' | 'whole' | 'topup';

export interface RevisionOffer {
  /** What the client reads, e.g. "Revision discount". */
  name: string;
  /** What it is worked out on: the new items the revision adds, or the whole revised BOQ. */
  on: RevisionOfferOn;
  type: 'percentage' | 'fixed';
  value: number;
}

/** What a revision's offer can be worked out on, in rupees. */
export interface RevisionOfferBases {
  /** The new items the revision adds: new lines, and new items inside rooms compared as a whole (addedByRevision). */
  added: number;
  /** Of `added`, what is new inside rooms compared as a whole: shown so the figure can be checked. */
  inWholeRooms?: number;
  /** The discounts already given off the work, as they stand on the revised side: what a top-up is on top of. */
  given?: number;
  /** The whole revised BOQ. */
  whole: number;
}

/** The offer as frozen into an issued Scope Revision's client totals. */
export interface RevisionDiscount {
  name: string;
  /** Rupees off execution, as issued. */
  amount: number;
  on: RevisionOfferOn;
  type: 'percentage' | 'fixed';
  value: number;
  /** What it was worked out on, as issued. */
  base: number;
}

export const DEFAULT_REVISION_OFFER_NAME = 'Revision discount';

export function revisionOfferBase(o: Pick<RevisionOffer, 'on'>, b: RevisionOfferBases): number {
  return Math.max(0, Number(o.on === 'added' ? b.added : b.whole) || 0);
}

/** The offer in rupees, to the rupee, never more than what it is worked out on. */
export function revisionOfferAmount(o: RevisionOffer | null | undefined, b: RevisionOfferBases): number {
  if (!o) return 0;
  const value = Math.max(0, Number(o.value) || 0);
  if (!value) return 0;
  const base = revisionOfferBase(o, b);
  if (o.on === 'topup') {
    /* The total off the work, at this percentage of the revised BOQ, less what is already given. */
    const target = base * (Math.min(100, value) / 100);
    const given = Math.max(0, Number(b.given) || 0);
    return Math.round(Math.max(0, Math.min(base - given, target - given)));
  }
  const raw = o.type === 'percentage' ? base * (Math.min(100, value) / 100) : value;
  return Math.round(Math.min(base, raw));
}

/** "5% on the new items" / "₹50,000 off the whole revised BOQ". */
export function describeRevisionOffer(o: Pick<RevisionOffer, 'on' | 'type' | 'value'>): string {
  if (o.on === 'topup') return `brings the total discount to ${+(+o.value).toFixed(2)}% of the revised BOQ`;
  const what = o.on === 'whole' ? 'the whole revised BOQ' : 'the new items';
  return o.type === 'percentage'
    ? `${+(+o.value).toFixed(2)}% on ${what}`
    : `₹${Math.round(Number(o.value) || 0).toLocaleString('en-IN')} off ${what}`;
}

/** The offer frozen for an issued document; null when there is nothing to take off. */
export function frozenRevisionDiscount(o: RevisionOffer | null | undefined, b: RevisionOfferBases): RevisionDiscount | null {
  const amount = revisionOfferAmount(o, b);
  if (!o || amount <= 0) return null;
  return {
    name: (o.name || '').trim() || DEFAULT_REVISION_OFFER_NAME,
    amount,
    on: o.on,
    type: o.type,
    value: Math.max(0, Number(o.value) || 0),
    base: Math.round(revisionOfferBase(o, b) * 100) / 100,
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What a revision adds: the items that were not in the signed BOQ.
 *
 * Rooms compared line by line say so themselves (the bridge's "New items").
 * A room compared as a whole does not: its whole difference is one "Sections"
 * figure, which also carries rate tweaks and items moved between rooms (on
 * Palacia, electrical and ceiling painting moved from Others into Functional:
 * +₹1.69L in one, −₹1.69L in the other). So inside those rooms each revised
 * line is matched by name against the signed lines of all of them together,
 * the same name first and then a close one, each signed line used once; a
 * line with no match is new, at its revised amount.
 */
export function addedByRevision(result: Pick<RevisionResult, 'rooms' | 'bridge'>, signed: SignedLine[]): { newLines: number; inWholeRooms: number; total: number } {
  const newLines = Math.max(0, Number(result.bridge?.new) || 0);
  const whole = (result.rooms || []).filter(r => r.compareAsSection && r.signedRoom);
  if (!whole.length) return { newLines: r2(newLines), inWholeRooms: 0, total: r2(newLines) };
  const rooms = new Set(whole.map(r => r.signedRoom));
  const pool = (signed || []).filter(s => rooms.has(s.room));
  const used = new Set<string>();
  const revised = whole.flatMap(r => r.lines).filter(l => l.imported && (l.amount2 || 0) > 0);
  const matched = new Set<string>();
  const pass = (fits: (a: string, b: string) => boolean) => revised.forEach(l => {
    if (matched.has(l.id)) return;
    const s = pool.find(x => !used.has(x.lineId) && fits(x.name, l.imported!.name));
    if (s) { used.add(s.lineId); matched.add(l.id); }
  });
  pass((a, b) => norm(a) === norm(b));
  pass((a, b) => nameSimilarity(a, b) >= 0.8);
  const inWholeRooms = revised.filter(l => !matched.has(l.id)).reduce((t, l) => t + (l.amount2 || 0), 0);
  return { newLines: r2(newLines), inWholeRooms: r2(inWholeRooms), total: r2(newLines + inWholeRooms) };
}

/** The bases a revision's offer is worked out on. */
export function offerBasesFor(result: Pick<RevisionResult, 'rooms' | 'bridge' | 'v2Total'>, signed: SignedLine[], given = 0): RevisionOfferBases {
  const a = addedByRevision(result, signed);
  return { added: a.total, inWholeRooms: a.inWholeRooms, whole: result.v2Total, given: Math.max(0, given) };
}

/**
 * The discounts already given off the work, held as signed: what a top-up is
 * on top of. Worked out on the signed BOQ, as the revision document holds them
 * (lib/scopeTotals, proposalHeld), never more than the revised BOQ.
 */
export function givenOffWork(ctx: any, v1Work: number, v2Work: number): number {
  return Math.min(Math.max(0, v2Work), discountOn(v1Work, discountsOf(ctx), 'execution'));
}

/**
 * The project's discounts held at what they were on the signed BOQ: a
 * percentage off execution becomes the fixed amount it came to, and every
 * offer is marked as held, so Money and the Playground stop re-pricing it.
 * A percentage off the design fee is held the same way when the signed fee
 * is given (the fee can follow the revised BOQ); otherwise it is left as it is.
 */
export function heldDiscounts<T extends ProjectDiscount>(discounts: T[] | undefined, signedExecution: number, reference: string, signedDesign?: number): T[] {
  return (discounts || []).map(d => {
    if (d.heldAt) return d;
    if (d.target === 'execution' && d.type === 'percentage') {
      return { ...d, type: 'fixed', value: r2(Math.max(0, signedExecution) * ((Number(d.value) || 0) / 100)), heldFromPercent: Number(d.value) || 0, heldAt: reference };
    }
    /* The fee can follow the revised BOQ now, so a percentage off it is held too, when the signed fee is known. */
    if (d.target === 'design' && d.type === 'percentage' && typeof signedDesign === 'number') {
      return { ...d, type: 'fixed', value: r2(Math.max(0, signedDesign) * ((Number(d.value) || 0) / 100)), heldFromPercent: Number(d.value) || 0, heldAt: reference };
    }
    return { ...d, heldAt: reference };
  });
}

/**
 * The project's discounts once a revision is applied: the proposal's held as
 * signed, and the revision's own offer added as a fixed amount.
 */
export function discountsAfterRevision<T extends ProjectDiscount>(
  discounts: T[] | undefined,
  a: { signedExecution: number; signedDesign?: number; reference: string; number: number; discount?: RevisionDiscount | null; proposalHeld?: boolean; id: string },
): ProjectDiscount[] {
  const kept: ProjectDiscount[] = a.proposalHeld ? heldDiscounts(discounts, a.signedExecution, a.reference, a.signedDesign) : [...(discounts || [])];
  if (!a.discount || !(a.discount.amount > 0)) return kept;
  return [...kept, {
    id: a.id,
    name: a.discount.name,
    type: 'fixed',
    value: a.discount.amount,
    target: 'execution',
    revision: a.number,
    heldAt: a.reference,
    ...(a.discount.type === 'percentage' ? { heldFromPercent: a.discount.value } : {}),
  }];
}

/** The open revision a studio can still write an offer on: a draft. */
export function draftRevision(ctx: ProjectContext | null | undefined) {
  return (ctx?.scopeRevisions || [])
    .filter(r => r.status === 'draft')
    .sort((a, b) => b.number - a.number)[0] || null;
}

/** The project with this revision's offer set (null takes it off). Only a draft takes one. */
export const withRevisionOffer = (revisionId: string, offer: RevisionOffer | null) => (prev: ProjectContext): ProjectContext => ({
  ...prev,
  scopeRevisions: (prev.scopeRevisions || []).map(r => (r.id === revisionId && r.status === 'draft'
    ? { ...r, offer, updatedAt: Date.now() }
    : r)),
});

/**
 * The design fee once the scope is revised.
 *
 * A percentage fee is charged on the work before offers, so when the work
 * grows the fee grows with it, and the discounts come off afterwards (Palacia:
 * 12% of ₹14,14,441 = ₹1,69,733 signed; 12% of ₹16,22,600 = ₹1,94,712
 * revised). A fixed sum or a rate per square foot does not move, nor does the
 * fee on a design-only project.
 *
 * When the agreed fee is the project's percentage of the signed work (to the
 * rupee, or to the rounding step), the revised fee is that percentage of the
 * revised work. When the studio agreed a different figure, the same ratio is
 * kept: the agreed fee times revised over signed work.
 */
export function revisedDesignFee(
  ctx: any,
  a: {
    before: number;
    v1Work: number;
    v2Work: number;
    asActuals?: { before: number; after: number } | null;
    rules?: { roundUpTo?: number; feeOnActuals?: boolean } | null;
  },
): number {
  const c: any = ctx || {};
  const before = Math.max(0, Number(a.before) || 0);
  if (c.designFeeType === 'fixed_lumpsum' || c.designFeeType === 'fixed_sqft') return before;
  if (isFeeOnly(engagementOf(c))) return before;
  const step = Number(a.rules?.roundUpTo) > 0 ? Number(a.rules!.roundUpTo) : 0;
  const onActuals = !a.rules || a.rules.feeOnActuals !== false;
  const actualsBefore = onActuals ? Number(a.asActuals?.before) || 0 : 0;
  const actualsAfter = onActuals ? Number(a.asActuals?.after) || 0 : 0;
  const baseBefore = (Number(a.v1Work) || 0) + actualsBefore;
  const baseAfter = (Number(a.v2Work) || 0) + actualsAfter;
  if (!(before > 0) || !(baseBefore > 0) || baseAfter < 0) return before;
  const up = (n: number) => (step ? Math.ceil(n / step - 1e-9) * step : n);
  const formulaBefore = up(designFeeFor(c, a.v1Work, actualsBefore));
  if (Math.abs(formulaBefore - before) <= Math.max(1, step)) return r2(up(designFeeFor(c, a.v2Work, actualsAfter)));
  return r2(up(before * (baseAfter / baseBefore)));
}

/**
 * A revision's client totals, as issued: the project's discounts as they are
 * now, held at the signed figure; the revision's own discount; and the design
 * fee on the revised BOQ. Revision Studio and the Playground issue through here.
 */
export function revisionTotals(
  ctx: any,
  o: ClientTotalsOptions,
  a: {
    result: Pick<RevisionResult, 'rooms' | 'bridge' | 'v1Total' | 'v2Total' | 'asActuals'>;
    signed: SignedLine[];
    offer?: RevisionOffer | null;
    rules?: { roundUpTo?: number; feeOnActuals?: boolean } | null;
  },
): ClientTotalsOptions {
  return {
    ...o,
    discounts: discountsOf(ctx),
    proposalHeld: true,
    revisionDiscount: frozenRevisionDiscount(a.offer, offerBasesFor(a.result, a.signed, givenOffWork(ctx, a.result.v1Total, a.result.v2Total))),
    designFeeAfter: revisedDesignFee(ctx, { before: o.designFeeValue, v1Work: a.result.v1Total, v2Work: a.result.v2Total, asActuals: a.result.asActuals, rules: a.rules }),
  };
}

/** The issued revision's note on the design fee, when the fee follows the revised BOQ. */
export function withFeeNote<T extends { designFeeNote?: string }>(snapshot: T, o: ClientTotalsOptions): T {
  const after = o.designFeeAfter;
  if (typeof after !== 'number' || Math.abs(after - o.designFeeValue) < 0.5) return snapshot;
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  return { ...snapshot, designFeeNote: `The design fee is a percentage of the work before discounts, so it follows the revised BOQ: ${inr(o.designFeeValue)} to ${inr(after)}.` };
}
