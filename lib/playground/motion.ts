/*
  What an edit in the BOQ Playground should show (PR 7, DESIGN.md "BOQ
  Playground motion"), worked out from the BOQ before and after it, as the
  approved mockup shows it:

    flash  the lines it added print into the Live BOQ, the Sheet and the Rooms
    drop   the pieces it added to the plan drop into place, one after another
    glow   the room the first of them landed in (or a piece was moved to) glows once
    pop    one piece added, resized or given another finish: what it did to the
           price floats up from it

  Undo is not an edit: it shows nothing.
*/
import type { BoqItem } from '../../types';

export interface Fresh {
  flash: Set<string>;
  /** Piece id → its place in the stagger (110 ms each). */
  drop: Map<string, number>;
  glow: string | null;
  /** The piece the price change floats from. */
  pop: string | null;
}

const sizeKey = (l: BoqItem) => [l.qty, l.calcLength, l.calcWidth, l.sizeUnit, l.place?.depthFt].join('|');
const finishKey = (l: BoqItem) => JSON.stringify([l.materialSpecs || null, l.specs || null]);

export function freshOf(before: BoqItem[], after: BoqItem[]): Fresh {
  const was = new Map(before.map(l => [l.id, l]));
  const added = after.filter(l => !was.has(l.id));
  const changed = after.filter(l => was.has(l.id) && was.get(l.id) !== l);

  const placed = added.filter(l => l.place);
  const drop = new Map(placed.map((l, i) => [l.id, i]));
  const movedRoom = changed.find(l => l.place && was.get(l.id)!.roomId !== l.roomId);
  const glow = String(placed[0]?.roomId || movedRoom?.roomId || '') || null;

  let pop: string | null = null;
  if (added.length === 1 && placed.length === 1) pop = placed[0].id;
  else if (!added.length && changed.length === 1 && changed[0].place) {
    const a = was.get(changed[0].id)!, b = changed[0];
    if (sizeKey(a) !== sizeKey(b) || finishKey(a) !== finishKey(b)) pop = b.id;
  }
  return { flash: new Set(added.map(l => l.id)), drop, glow, pop };
}

/** Under a rupee, nothing floats: a move or a turn does not change the price. */
export const popWorth = (d: number) => Math.abs(d) >= 1;

/** "+₹12,400" / "−₹3,000", as the mockup writes it. */
export const popText = (d: number) => `${d > 0 ? '+' : '−'}₹${Math.round(Math.abs(d)).toLocaleString('en-IN')}`;
