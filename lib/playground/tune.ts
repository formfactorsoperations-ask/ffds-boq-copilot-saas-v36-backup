/**
 * BOQ Playground PR 4 — Tune: markups, and the client's number.
 *
 * A fader sets a group of lines' average markup (cost-weighted), keeping
 * their spread: every line's markup is scaled by the same factor. The client's
 * number moves every line's markup by one factor until the work comes to the
 * number, or as close under it as the ₹100 rounding allows, and never takes a
 * line under its category's margin floor (Studio settings `marginFloors`). A
 * line already under its floor is never pulled down further, nor raised by a
 * cut. When the floors stop it short, the gap is said, not hidden.
 *
 * Markups are written to `marginOverride`, as every other markup edit is.
 * Only billable lines the studio charges for move: lines bought by the client
 * or paid at actuals have no studio markup to tune.
 *
 * Pure.
 */
import type { BoqItem, Item, PricingRules, Room } from '../../types';
import { resolveBoqLine } from '../boqPricing';
import { playgroundTotals } from './pricing';
import type { MeasureContext } from './rooms';
import { marginFloorFor, markupForMargin, markupOf, type MarginFloors } from './issues';

export interface TuneContext {
  bankMap: Map<string, Item>;
  rules?: PricingRules | null;
  rooms?: Room[];
  floors?: MarginFloors | null;
  /** The plan's measurements (lib/playground/pricing measureOfBoq), so Tune's work is the screen's. */
  measure?: MeasureContext;
}

/** The highest markup Tune will set on a line, %. */
export const MAX_MARKUP = 400;

const round2 = (v: number) => Math.round(v * 100) / 100;
/* A floor is rounded up, so rounding never takes a line under it. */
const ceil2 = (v: number) => Math.ceil(v * 100 - 1e-9) / 100;

/** True for a line whose markup Tune may move: billable, charged by the studio. */
export function tunable(line: BoqItem, bankMap: Map<string, Item>): boolean {
  const r = resolveBoqLine(line, bankMap);
  return r.billable && !r.asActuals && line.boqStatus !== 'client_procured';
}

/** The lowest markup a line may take: its category's margin floor, as a markup. */
export function floorMarkupOf(line: BoqItem, bankMap: Map<string, Item>, floors?: MarginFloors | null): number {
  return markupForMargin(marginFloorFor(bankMap.get(line.bankId)?.cat, floors));
}

/**
 * Every tunable line's markup × k. Lowering (k < 1) stops at the floor, and a
 * line already under its floor keeps its markup; raising (k > 1) is capped.
 */
export function scaledMarkups(lines: BoqItem[], k: number, ctx: TuneContext): BoqItem[] {
  return lines.map(l => {
    if (!tunable(l, ctx.bankMap)) return l;
    const base = markupOf(l, ctx.bankMap.get(l.bankId));
    let next = base * k;
    const floor = ceil2(floorMarkupOf(l, ctx.bankMap, ctx.floors));
    if (k < 1) next = Math.max(next, Math.min(base, floor));
    next = Math.min(next, Math.max(base, MAX_MARKUP));
    if (next === base) return l;
    const r = round2(next);
    return { ...l, marginOverride: k < 1 && base >= floor && r < floor ? floor : r };
  });
}

/** What the client pays for the work, under the version's rules. */
export const workTotal = (lines: BoqItem[], ctx: TuneContext) =>
  playgroundTotals(lines, ctx.bankMap, { rules: ctx.rules, rooms: ctx.rooms, measure: ctx.measure }).sell;

export interface FitResult {
  lines: BoqItem[];
  /** The work after fitting. */
  total: number;
  /** The work at every floor: as low as Tune goes. */
  floorTotal: number;
  /** Reached: at the number, or under it by no more than the rounding allows. */
  met: boolean;
  /** What is left between the number and the work (positive: the work is above it). */
  gap: number;
  /** The common factor every markup moved by. */
  factor: number;
}

/**
 * The lines with their markups moved to meet `target`: the largest work at or
 * under the number. When even the floors leave the work above the number, the
 * lines go to the floors and `gap` says by how much it is still over.
 */
export function fitToNumber(lines: BoqItem[], target: number, ctx: TuneContext): FitResult {
  const now = workTotal(lines, ctx);
  const at = (k: number) => workTotal(scaledMarkups(lines, k, ctx), ctx);
  const floorTotal = at(0);
  let lo: number, hi: number;
  if (target >= now) {
    lo = 1; hi = 2;
    while (at(hi) <= target && hi < 64) { lo = hi; hi *= 2; }
  } else if (floorTotal > target) {
    const fitted = scaledMarkups(lines, 0, ctx);
    return { lines: fitted, total: floorTotal, floorTotal, met: false, gap: floorTotal - target, factor: 0 };
  } else {
    lo = 0; hi = 1;
  }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) <= target) lo = mid; else hi = mid;
  }
  const fitted = scaledMarkups(lines, lo, ctx);
  const total = workTotal(fitted, ctx);
  // Every amount rounds up to ₹100 a line, so the work moves in steps: within one step a line is met.
  const step = Math.max(100, (ctx.rules?.roundUpTo || 1) * lines.length);
  return { lines: fitted, total, floorTotal, met: target - total <= step, gap: total - target, factor: lo };
}
