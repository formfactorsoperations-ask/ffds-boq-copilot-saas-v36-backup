/**
 * BOQ Playground — what needs a look on a line.
 *
 *   overlap   the piece collides with another, or runs past its room's walls
 *   nospec    the line has no specification words (or only an import stub)
 *   lowmk     the line is priced under the studio's margin floor for its category
 *   stale     a part of the line is on an older version of its material (S2)
 *
 * "Newer material spec out" joins these with the Material specs bank (PR S2).
 *
 * The margin floor is a MARGIN (profit ÷ price), as Studio settings
 * `marginFloors` holds it; a line's `marginOverride` / item `margin` is a MARKUP
 * (lib/utils.ts calculateSellPrice). A 15% margin floor is a 17.65% markup.
 */
import type { Item, BoqItem } from '../../types';
import { isBillable, isAsActuals } from '../boqPricing';
import type { MaterialSpecsBank } from '../materialSpecs';
import { staleParts } from '../lineSpecs';
import { overlaps, runsPastWall, type PlanRoom } from './placing';
import type { BoardPiece } from './pieces';

export type IssueKind = 'stale' | 'overlap' | 'nospec' | 'lowmk';

export const ISSUE_LABEL: Record<IssueKind, string> = {
  stale: 'Newer material spec out',
  overlap: 'Overlaps or runs past a wall',
  nospec: 'No spec words',
  lowmk: 'Under your floor',
};

/** Studio settings `marginFloors`: a margin % by category, with a default. */
export interface MarginFloors { default?: number; byCategory?: Record<string, number> }

export const DEFAULT_MARGIN_FLOOR = 15;

/** The margin floor for a category, as a percentage of the price. */
export function marginFloorFor(cat: string | undefined, floors?: MarginFloors | null): number {
  const byCat = floors?.byCategory?.[cat || ''];
  if (typeof byCat === 'number') return byCat;
  return typeof floors?.default === 'number' ? floors.default : DEFAULT_MARGIN_FLOOR;
}

/** A margin (of price) as the markup (on cost) that gives it. */
export const markupForMargin = (marginPct: number) => (marginPct >= 100 ? Infinity : (marginPct / (100 - marginPct)) * 100);

/** The markup the line is priced at. */
export const markupOf = (line: Pick<BoqItem, 'marginOverride'>, item: Pick<Item, 'margin'> | null | undefined) =>
  Number(line.marginOverride ?? item?.margin ?? 0) || 0;

const STUB_SPECS = /imported via excel/i;

/** The words the client reads for the line. */
export const specWordsOf = (line: Pick<BoqItem, 'specs'>, item: Pick<Item, 'specs'> | null | undefined) =>
  String(line.specs ?? item?.specs ?? '').trim();

export interface IssueContext {
  bankMap: Map<string, Item>;
  floors?: MarginFloors | null;
  /** The drawn pieces and the plan's rooms, for the overlap check. */
  pieces?: BoardPiece[];
  rooms?: PlanRoom[];
  /** The Material specs bank, for parts on an older version (S2). Only given where the option may take updates. */
  specBank?: MaterialSpecsBank | null;
}

/** What needs a look on one line, in a fixed order. */
export function lineIssues(line: BoqItem, ctx: IssueContext): IssueKind[] {
  const item = ctx.bankMap.get(line.bankId);
  const out: IssueKind[] = [];

  if (ctx.specBank && staleParts(ctx.specBank, line).length) out.push('stale');

  const piece = ctx.pieces?.find(p => p.id === line.id);
  if (piece) {
    const room = ctx.rooms?.find(r => r.name === piece.room);
    if (overlaps(piece, ctx.pieces || []).length > 0 || runsPastWall(piece, room)) out.push('overlap');
  }

  const words = specWordsOf(line, item);
  if (!words || STUB_SPECS.test(words)) out.push('nospec');

  const name = item?.name || line.name;
  // Lines the client buys, or pays the vendor for at actuals, carry no studio margin.
  if (isBillable(line) && !isAsActuals(line, name)) {
    const floor = markupForMargin(marginFloorFor(item?.cat, ctx.floors));
    if (markupOf(line, item) < floor - 1e-6) out.push('lowmk');
  }
  return out;
}

/** Every line with something to look at, with what it is. */
export function boqIssues(boq: BoqItem[], ctx: IssueContext): { line: BoqItem; issues: IssueKind[] }[] {
  return (boq || [])
    .map(line => ({ line, issues: lineIssues(line, ctx) }))
    .filter(x => x.issues.length > 0);
}
