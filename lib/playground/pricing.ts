/**
 * BOQ Playground — client amounts under a version's pricing rules.
 *
 * A Playground version carries `pricingRules` ({ roundUpTo: 100, feeOnActuals:
 * false }). Every client amount is then rounded up to the nearest ₹100 line by
 * line, as CEILING.MATH(rate × qty, 100). A whole-flat line rounds each room's
 * share, so the rooms add up to the line. The unit rate is shown as it is, and
 * cost is never touched, so rounding only ever adds margin.
 *
 * A tier without `pricingRules` is Classic: exact amounts, and today's design-fee
 * rule. Its totals here are exactly lib/boqPricing.ts's `boqTotal`, which is what
 * App's tier summary computes; the rate itself always comes from resolveBoqLine,
 * so there is still one reading of what a line is worth.
 */
import type { Item, BoqItem, ProposalTier, PricingRules, Room } from '../../types';
import { resolveBoqLine, designFeeFor } from '../boqPricing';
import { calculateCostFromSell } from '../utils';
import { roomShares, storedShares, withByRoomQty, type MeasureContext } from './rooms';
import { withCivilQty } from './civil';
import { boardPieces, wallCovers } from './pieces';
import { realRooms } from '../scopeBuckets';

/** The rules a new Playground version is made with. */
export const PLAYGROUND_PRICING: PricingRules = { roundUpTo: 100, feeOnActuals: false };

export const isPlaygroundTier = (tier: Pick<ProposalTier, 'boqFormat' | 'pricingRules'> | null | undefined) =>
  tier?.boqFormat === 'playground' || !!tier?.pricingRules;

/** The tier's pricing rules, or null for a Classic tier. */
export const pricingRulesOf = (tier: Pick<ProposalTier, 'pricingRules'> | null | undefined): PricingRules | null =>
  tier?.pricingRules && tier.pricingRules.roundUpTo > 0 ? tier.pricingRules : null;

/**
 * CEILING.MATH(v, step): v rounded up to the next multiple of step. The amount is
 * first taken to the paisa, so floating-point dust (30000.000000004) does not
 * push an exact ₹30,000 up to ₹30,100. Zero and credits are left as they are.
 */
export function ceilTo(v: number, step = 100): number {
  if (!(v > 0) || !(step > 0)) return v;
  const paise = Math.round(v * 100) / 100;
  return Math.ceil(paise / step - 1e-9) * step;
}

/** Applies the rules to one amount: rounded up for a Playground tier, exact for Classic. */
export const clientAmount = (v: number, rules: PricingRules | null | undefined) =>
  rules ? ceilTo(v, rules.roundUpTo) : v;

/** What the line costs the studio: materials and labour × qty, exactly as App's tier summary. */
export function lineCost(b: BoqItem | any, bankMap: Map<string, Item>): number {
  const item = bankMap.get(b.bankId);
  const qty = Number(b.qty) || 0;
  if (item) {
    const m = b.baseRate !== undefined ? b.baseRate : item.materials;
    const l = b.labor !== undefined ? b.labor : item.labor;
    return ((Number(m) || 0) + (Number(l) || 0)) * qty;
  }
  const margin = b.marginOverride ?? 0;
  const m = b.materials !== undefined ? b.materials : (b.baseRate !== undefined ? b.baseRate : 0);
  const l = b.labor !== undefined ? b.labor : 0;
  if (m > 0 || l > 0) return ((Number(m) || 0) + (Number(l) || 0)) * qty;
  if (b.selectedRate) return calculateCostFromSell((Number(b.selectedRate) || 0) * qty, margin);
  return 0;
}

export interface LineAmountOptions {
  rules?: PricingRules | null;
  /** The plan's rooms, to measure a whole-flat line's shares. Without them, its typed shares are used. */
  rooms?: Room[];
  measure?: MeasureContext;
}

/** A whole-flat line's shares, by room name: measured from the rooms when given, else as typed. */
export function sharesOf(b: BoqItem, opts: LineAmountOptions = {}): Map<string, number> | null {
  if (!b.byRoom) return null;
  const m = opts.rooms?.length ? roomShares(b.byRoom, opts.rooms, opts.measure) : storedShares(b.byRoom);
  let any = false;
  m.forEach(v => { if (v > 0) any = true; });
  return any ? m : null;
}

/**
 * The line with the quantity the plan gives it: a whole-flat line's from its
 * rooms, a civil line's from its room. Other lines, and lines with no rooms to
 * hand, keep their own.
 */
export function withPlanQty(line: BoqItem, bankMap: Map<string, Item>, opts: LineAmountOptions = {}): BoqItem {
  if (!opts.rooms?.length) return line;
  if (line.byRoom) return withByRoomQty(line, opts.rooms, opts.measure);
  if (line.civil) return withCivilQty(line, opts.rooms, bankMap);
  return line;
}

/**
 * What the client is charged for the line. Classic: rate × qty, exact. Playground:
 * rounded up to ₹100; a whole-flat line rounds each room's share and adds them.
 */
export function lineAmount(line: BoqItem, bankMap: Map<string, Item>, opts: LineAmountOptions = {}): number {
  const b = line.civil ? withPlanQty(line, bankMap, opts) : line;
  const r = resolveBoqLine(b, bankMap);
  const rules = opts.rules || null;
  if (!rules) return r.total;
  const shares = sharesOf(b, opts);
  if (shares) {
    let sum = 0;
    shares.forEach(q => { sum += ceilTo(r.rate * q, rules.roundUpTo); });
    return sum;
  }
  return ceilTo(r.total, rules.roundUpTo);
}

/** Each room's amount for one line: a room line's whole amount, or a whole-flat line's shares. */
export function lineAmountsByRoom(b: BoqItem, bankMap: Map<string, Item>, opts: LineAmountOptions = {}): Map<string, number> {
  const r = resolveBoqLine(b, bankMap);
  const shares = sharesOf(b, opts);
  const out = new Map<string, number>();
  if (shares) {
    shares.forEach((q, room) => out.set(room, clientAmount(r.rate * q, opts.rules)));
    return out;
  }
  out.set(r.room, lineAmount(b, bankMap, opts));
  return out;
}

export interface PlaygroundTotals {
  /** What the studio invoices for the work: billable lines, as-actuals left out. */
  sell: number;
  cost: number;
  /** The as-actuals estimate, kept beside the total. */
  asActuals: number;
  /** Billable lines, as-actuals included (App's activeItemCount). */
  itemCount: number;
  /** The work by room name (whole-flat lines shared in). */
  byRoom: Map<string, number>;
}

/**
 * The version's totals. With no rules this is boqTotal / asActualsTotal to the
 * rupee and App's totalCost; with rules every line is rounded as above.
 */
export function playgroundTotals(boq: BoqItem[], bankMap: Map<string, Item>, opts: LineAmountOptions = {}): PlaygroundTotals {
  let sell = 0, cost = 0, asActuals = 0, itemCount = 0;
  const byRoom = new Map<string, number>();
  (boq || []).forEach(line => {
    // A whole-flat line's quantity follows its rooms, and a civil line's its room (PR C), so cost and amount agree.
    const b = withPlanQty(line, bankMap, opts);
    const r = resolveBoqLine(b, bankMap);
    if (!r.billable) return;
    itemCount++;
    const amount = lineAmount(b, bankMap, opts);
    if (r.asActuals) { asActuals += amount; return; }
    sell += amount;
    cost += lineCost(b, bankMap);
    lineAmountsByRoom(b, bankMap, opts).forEach((v, room) => byRoom.set(room, (byRoom.get(room) || 0) + v));
  });
  return { sell, cost, asActuals, itemCount, byRoom };
}

/**
 * The design fee on a version. Classic keeps today's rule (a percentage fee is
 * charged on the as-actuals estimate too, at its exact figure); a Playground
 * version charges it on the work only, unless the studio's rules say
 * feeOnActuals, and rounds it up to ₹100 as it rounds every BOQ line
 * (CEILING.MATH(fee, 100)). A lump sum already round stays as it is.
 */
export function designFeeForTier(
  ctx: { designFeeType?: string; designFee?: number; area?: number } | null | undefined,
  work: number,
  asActuals: number,
  rules: PricingRules | null | undefined,
): number {
  const onActuals = !rules || rules.feeOnActuals;
  const fee = designFeeFor(ctx, work, onActuals ? asActuals : 0);
  return rules ? ceilTo(fee, rules.roundUpTo) : fee;
}

/**
 * How the design fee is applied, in the client's words, as the Brief sets it
 * (Engagement & fees: % of cost, ₹/sq ft or a fixed sum) and as
 * designFeeForTier works it out: a percentage of the work before offers (with
 * the items at actuals when the rules say so), a rate on the carpet area, or a
 * fixed sum; on a Playground version, rounded up like every line.
 */
export function feeBasisWords(
  ctx: { designFeeType?: string; designFee?: number; area?: number } | null | undefined,
  a: { work: number; asActuals?: number; rules?: PricingRules | null; offers?: boolean },
): string {
  const c: any = ctx || {};
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const rules = a.rules && Number(a.rules.roundUpTo) > 0 ? a.rules : null;
  const raw = designFeeFor(c, a.work, !rules || rules.feeOnActuals ? (a.asActuals || 0) : 0);
  const rounded = rules && ceilTo(raw, rules.roundUpTo) !== Math.round(raw) ? `, rounded up to the next ${inr(rules.roundUpTo)}` : '';
  if (c.designFeeType === 'fixed_lumpsum') return 'A fixed fee for the design.';
  if (c.designFeeType === 'fixed_sqft') {
    const area = Number(c.area) || 0;
    return `${inr(Number(c.designFee) || 0)} per sq ft on ${area.toLocaleString('en-IN')} sq ft of carpet area${rounded}.`;
  }
  const pct = Number(c.designFee) || 10;
  const actuals = (!rules || rules.feeOnActuals) && (a.asActuals || 0) > 0 ? ` and the items at actuals, ${inr(a.asActuals!)}` : '';
  return `${pct}% of the work${a.offers ? ' before offers' : ''}, ${inr(a.work)}${actuals}${rounded}.`;
}

/* ───────────────────────────── documents (PR R) ───────────────────────────── */

/**
 * How a tier's documents (the Detailed BOQ, a Scope Revision) price its lines:
 * a Playground version by its rules and the project's rooms, exactly as Money
 * reads it (`playgroundTierSummary`), so the document, Money and a revision
 * agree to the rupee. Null for a Classic version: exact amounts, as today.
 */
export function docPricingOf(
  tier: { pricingRules?: PricingRules | null; boq?: BoqItem[] } | null | undefined,
  rooms: Room[] | undefined,
  bankMap?: Map<string, Item>,
): LineAmountOptions | null {
  const rules = tier?.pricingRules && Number(tier.pricingRules.roundUpTo) > 0 ? tier.pricingRules : null;
  return rules ? planPricing(rules, tier?.boq, rooms, bankMap) : null;
}

/**
 * What the plan tells a BOQ's measured lines: the carpentry drawn against the
 * walls, so the wall painting behind it is left out, exactly as the Playground
 * measures it on screen.
 */
export const measureOfBoq = (boq: BoqItem[] | undefined, bankMap: Map<string, Item>): MeasureContext =>
  ({ covers: wallCovers(boardPieces(boq || [], bankMap)) });

/**
 * A Playground BOQ priced as the Playground shows it: its rules, the project's
 * rooms (the scope buckets are not rooms, lib/scopeBuckets realRooms), and the
 * plan's measurements of this BOQ. Money's summary, the documents, offers and
 * the Playground all price through this, so they agree to the rupee.
 */
export function planPricing(rules: PricingRules, boq: BoqItem[] | undefined, rooms: Room[] | undefined, bankMap?: Map<string, Item>): LineAmountOptions {
  return { rules, rooms: realRooms(rooms || []), ...(bankMap ? { measure: measureOfBoq(boq, bankMap) } : {}) };
}

/**
 * A line as a document reads it: its quantity (from the plan for a line shared
 * into rooms or measured as civil work), its unit rate as it is, and its
 * amount (rounded up for a Playground version; rate × qty otherwise).
 */
export function docLine(b: BoqItem, bankMap: Map<string, Item>, pricing: LineAmountOptions | null) {
  if (!pricing) { const r = resolveBoqLine(b, bankMap); return { r, qty: r.qty, amount: r.total }; }
  const p = withPlanQty(b, bankMap, pricing);
  const r = resolveBoqLine(p, bankMap);
  return { r, qty: r.qty, amount: lineAmount(p, bankMap, pricing) };
}
