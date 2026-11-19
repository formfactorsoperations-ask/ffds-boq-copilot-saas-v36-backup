/**
 * BOQ Playground — pricing a finish.
 *
 * Only the outer finish changes what a piece costs, as a cost factor per range
 * (a designer laminate at 1.0, a standard one at 0.85, a veneer at 1.3). The
 * factor is written to the line's `baseRate` (its frozen materials rate), so
 * every existing reader of the BOQ prices the finish without knowing about it.
 *
 * `finishBase` keeps the materials rate before any finish, so finishes never
 * stack: walnut after ash is base × 1.3, not base × 0.85 × 1.3. Labour is not a
 * material and does not move with the finish.
 *
 * "Refresh from Item Bank" takes the bank's current materials rate as the new
 * base and applies the line's finish to it again.
 */
import type { Item, BoqItem } from '../../types';
import { round2 } from './geometry';

/** Categories priced the same whatever the finish: no outer finish to choose. */
const NO_FINISH_CATS = /^(electrical|furniture|plumbing|appliances|civil|painting|soft furnishing)$/i;

/** True when an item's price moves with its outer finish. */
export function finishApplies(item: Pick<Item, 'cat'> | null | undefined): boolean {
  return !!item && !NO_FINISH_CATS.test((item.cat || '').trim());
}

/** The materials rate the line is priced on today: its frozen rate, else the bank's. */
export function materialsRate(line: Pick<BoqItem, 'baseRate'>, item: Pick<Item, 'materials'> | null | undefined): number {
  return line.baseRate !== undefined ? Number(line.baseRate) || 0 : Number(item?.materials) || 0;
}

/** The materials rate before any finish: what a finish factor multiplies. */
export function finishBaseOf(line: Pick<BoqItem, 'baseRate' | 'finishBase'>, item: Pick<Item, 'materials'> | null | undefined): number {
  return line.finishBase != null ? Number(line.finishBase) || 0 : materialsRate(line, item);
}

/** The factor currently on the line (1 when no finish is priced in). */
export function finishFactorOf(line: Pick<BoqItem, 'baseRate' | 'finishBase'>, item: Pick<Item, 'materials'> | null | undefined): number {
  const base = finishBaseOf(line, item);
  return base > 0 && line.finishBase != null ? round2(materialsRate(line, item) / base) : 1;
}

/**
 * The fields to write when a finish with this cost factor is chosen: the base is
 * kept, and baseRate becomes base × factor. A factor of 1 (or none) still keeps
 * the base, so the next finish starts from it.
 */
export function finishUpdates(
  line: Pick<BoqItem, 'baseRate' | 'finishBase'>,
  item: Pick<Item, 'materials' | 'cat'> | null | undefined,
  factor: number | null | undefined,
): Pick<BoqItem, 'baseRate' | 'finishBase'> | null {
  if (!finishApplies(item)) return null;
  const base = finishBaseOf(line, item);
  const f = Number(factor) > 0 ? Number(factor) : 1;
  return { finishBase: base, baseRate: round2(base * f) };
}

/** The fields to write when the finish is taken off: back to the base. */
export function clearFinishUpdates(line: Pick<BoqItem, 'baseRate' | 'finishBase'>, item: Pick<Item, 'materials'> | null | undefined): Pick<BoqItem, 'baseRate' | 'finishBase'> {
  return { baseRate: finishBaseOf(line, item), finishBase: null };
}

/**
 * Refresh from Item Bank: the bank's current materials rate becomes the base, and
 * the line's finish (its current factor, unless one is given) is applied again.
 */
export function refreshFromBankUpdates(
  line: Pick<BoqItem, 'baseRate' | 'finishBase'>,
  item: Pick<Item, 'materials' | 'cat'>,
  factor?: number,
): Pick<BoqItem, 'baseRate' | 'finishBase'> {
  const f = factor ?? finishFactorOf(line, item);
  const base = Number(item.materials) || 0;
  if (!finishApplies(item)) return { baseRate: base, finishBase: null };
  return { finishBase: base, baseRate: round2(base * f) };
}
