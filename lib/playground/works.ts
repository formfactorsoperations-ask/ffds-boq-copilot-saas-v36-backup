/**
 * BOQ Playground — a work added to a room, measured from that room.
 *
 * A work is an Item Bank item that is not drawn on the plan: tiling, plumbing,
 * waterproofing, painting, a false ceiling. Dropped on a room (or added to the
 * room in hand) its quantity is worked out from that room, and the line says
 * how, so the designer sees the sum and can correct it:
 *
 *   wall tiles, dado     the room's walls to 7′, less 21 sq ft a door
 *   a floor laid / out   the room's floor
 *   waterproofing        the floor and a 1′ upstand round the walls
 *   wall painting        the walls to the ceiling, less 21 sq ft a door
 *   ceiling painting,
 *   false ceiling        the room's ceiling
 *   skirting             round the walls, less 3′ a door
 *   anything else        by area, the floor; by length, round the walls
 *   counted, lump sum    one
 *
 * The first three are the Civil layer's own lines (lib/playground/civil): they
 * carry `civil`, so the quantity follows the plan when the room is resized and
 * the Civil layer draws them. A room takes each of them once.
 *
 * Pure.
 */
import type { BoqCivil, BoqItem, Item, Room } from '../../types';
import { basisOfUnit } from '../boqSize';
import { ftin, round2 } from './geometry';
import { civilDims, civilQty, civilDerivation, civilTypeOf, civilLine, DOOR_SQFT } from './civil';

/** Marks a library drag as a work, so the plan lights the room it is over. */
export const WORK_TYPE = 'application/x-ffds-work';

export interface WorkMeasure {
  qty: number;
  /** How the quantity was worked out, in words. */
  how: string;
  /** Set when the work is one of the Civil layer's own. */
  civil?: BoqCivil;
}

const doors = (n: number) => `${n} door${n > 1 ? 's' : ''}`;

/** What a work comes to in a room, and how. Null when the room has no size to measure. */
export function measureWork(item: Pick<Item, 'name' | 'cat' | 'unit'>, room: Room | undefined): WorkMeasure | null {
  const basis = basisOfUnit(item.unit);
  if (basis !== 'area' && basis !== 'length') return { qty: 1, how: basis === 'lump' ? 'a lump sum' : 'counted: one, change the number on the line' };
  const d = civilDims(room);
  if (!d) return null;
  const type = civilTypeOf(item);
  if (type) {
    const civil: BoqCivil = { type };
    const qty = civilQty(civil, room, item.unit);
    if (qty != null) return { qty, how: civilDerivation(civil, room), civil };
  }
  const n = `${item.name} ${item.cat || ''}`.toLowerCase();
  const ceiling = `the ceiling, ${ftin(d.w)} × ${ftin(d.h)}`;
  if (/false\s*ceiling|pop\s*ceiling|gypsum/.test(n)) return { qty: round2(basis === 'length' ? d.per : d.area), how: basis === 'length' ? `round the ceiling, ${ftin(d.per)}` : ceiling };
  if (/paint|putty|primer|emulsion/.test(n)) {
    if (/ceiling/.test(n)) return { qty: round2(d.area), how: ceiling };
    if (basis === 'area') return { qty: round2(Math.max(0, d.per * d.height - d.doors * DOOR_SQFT)), how: `${ftin(d.per)} of wall × ${ftin(d.height)}, less ${doors(d.doors)}` };
  }
  if (/skirting/.test(n) && basis === 'length') return { qty: round2(Math.max(0, d.per - d.doors * 3)), how: `round the walls, ${ftin(d.per)}, less ${doors(d.doors)}` };
  return basis === 'length'
    ? { qty: round2(d.per), how: `round the walls, ${ftin(d.per)}` }
    : { qty: round2(d.area), how: `the floor, ${ftin(d.w)} × ${ftin(d.h)}` };
}

export type WorkResult =
  | { line: BoqItem; how: string }
  | { problem: string; existing?: string };

/** The line a work makes in a room, or why it cannot be added. */
export function workLine(item: Item, room: Room | undefined, boq: BoqItem[], newId: () => string): WorkResult {
  if (!room) return { problem: 'Drop it inside a room.' };
  const m = measureWork(item, room);
  if (!m) return { problem: `${room.name} has no size yet, so ${item.name} cannot be measured there.` };
  if (m.civil) {
    const has = boq.find(l => l.roomId === room.name && l.civil?.type === m.civil!.type && l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted');
    if (has) return { problem: `${room.name} already has this work. Its quantity follows the room.`, existing: String(has.id) };
    return { line: civilLine(m.civil.type, room, item, newId), how: m.how };
  }
  return { line: { id: newId(), bankId: item.id, qty: m.qty, roomId: room.name, baseRate: item.materials }, how: m.how };
}
