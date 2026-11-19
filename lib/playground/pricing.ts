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
 * What the client is charged for the line. Classic: rate × qty, exact. Playground:
 * rounded up to ₹100; a whole-flat line rounds each room's share and adds them.
 */
export function lineAmount(b: BoqItem, bankMap: Map<string, Item>, opts: LineAmountOptions = {}): number {
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
    // A whole-flat line's quantity follows its rooms, so its cost and its amount agree.
    const b = opts.rooms?.length && line.byRoom ? withByRoomQty(line, opts.rooms, opts.measure) : line;
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
 * charged on the as-actuals estimate too); a Playground version charges it on
 * the work only, unless the studio's rules say feeOnActuals.
 */
export function designFeeForTier(
  ctx: { designFeeType?: string; designFee?: number; area?: number } | null | undefined,
  work: number,
  asActuals: number,
  rules: PricingRules | null | undefined,
): number {
  const onActuals = !rules || rules.feeOnActuals;
  return designFeeFor(ctx, work, onActuals ? asActuals : 0);
}
