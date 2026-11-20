/**
 * BOQ Playground PR X — bought by the client, and at actuals.
 *
 * An Item Bank item says how it is supplied (`Item.supply`): bought by the
 * client, or paid to the vendor at actual cost. A line of it takes boqStatus
 * client_procured or as_actuals, so it sits on its own list ("Separate · not
 * in the price") and changes no figure: not the price, offers, the design fee
 * on a Playground version, GST or any payment stage. Items at actuals carry an
 * estimate for the client; items the client buys carry none.
 *
 * Pure.
 */
import type { BoqItem, Item, ItemSupply, Room } from '../../types';
import { resolveBoqLine, isAsActuals } from '../boqPricing';
import { drawOf, footprintOf, pieceSize, isHigh, isWallBacked, pieceItemOf } from './pieces';
import { newPieceLine } from './board';
import { autoPlace, type PlacedPiece } from './placing';
import { FLAT_ROOM } from './civil';
import { calculateSellPrice } from '../utils';

export type { ItemSupply };

/** The line status each supply takes. */
export const SUPPLY_STATUS: Record<ItemSupply, NonNullable<BoqItem['boqStatus']>> = { client: 'client_procured', actuals: 'as_actuals' };
/** The chip on an Item Bank card and in the library. */
export const SUPPLY_LABEL: Record<ItemSupply, string> = { client: 'Bought by client', actuals: 'At actuals' };
/** How it is supplied, in the words of a toast or a list. */
export const SUPPLY_WORDS: Record<ItemSupply, string> = { client: 'bought by the client', actuals: 'at actuals' };

/** How an item is supplied, if not by the studio. */
export const supplyOf = (item: Pick<Item, 'supply'> | null | undefined): ItemSupply | null =>
  item?.supply === 'client' || item?.supply === 'actuals' ? item.supply : null;

/** How a line is supplied, from its status (or, as before, an "(actuals)" name). */
export function lineSupply(line: BoqItem, bankMap: Map<string, Item>): ItemSupply | null {
  if (line.boqStatus === 'client_procured') return 'client';
  const name = bankMap.get(line.bankId)?.name || (line as { name?: string }).name;
  return isAsActuals(line, name) ? 'actuals' : null;
}

/**
 * A new line from an item that is supplied apart takes its status, so it never
 * reaches the price, whichever way it was added (library, kit, import). A line
 * that already says how it is handled keeps that.
 */
export function withSupply(line: BoqItem, item: Pick<Item, 'supply'> | null | undefined): BoqItem {
  const s = supplyOf(item);
  if (!s || (line.boqStatus && line.boqStatus !== 'included_ffds_scope')) return line;
  return { ...line, boqStatus: SUPPLY_STATUS[s] };
}

const live = (l: BoqItem) => l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted';

/**
 * A supplied item added to a room (or the whole flat): drawn along a free wall
 * when it draws and the room is on the plan, else a line in the room, qty 1.
 */
export function supplyLine(args: { item: Item; room: string; rooms: Room[]; boq: BoqItem[]; bankMap: Map<string, Item>; newId: () => string }): { line: BoqItem; placed: boolean } {
  const { item, room, rooms, boq, bankMap, newId } = args;
  const plan = rooms.find(r => r.name === room && r.plan)?.plan;
  const draw = drawOf(item);
  if (plan && draw) {
    const made = newPieceLine(item, room, { x: 0, y: 0, rot: 0 }, newId());
    if (made?.place) {
      const probe: PlacedPiece = { id: made.id, room, fp: footprintOf(pieceSize(made, item, draw)), place: made.place, high: isHigh(draw), wallBacked: isWallBacked(draw) };
      const others = boq.filter(l => live(l) && l.roomId === room && l.place).map((l): PlacedPiece | null => {
        const it = pieceItemOf(l, bankMap);
        const d = drawOf(it);
        return d ? { id: l.id, room, fp: footprintOf(pieceSize(l, it, d)), place: l.place!, high: isHigh(d), wallBacked: isWallBacked(d) } : null;
      }).filter((p): p is PlacedPiece => !!p);
      const at = autoPlace(probe, { name: room, plan }, others);
      if (at) return { line: withSupply({ ...made, place: { ...made.place, x: at.x, y: at.y, rot: at.rot } }, item), placed: true };
    }
  }
  return { line: withSupply({ id: newId(), bankId: item.id, qty: 1, roomId: room || FLAT_ROOM, baseRate: item.materials }, item), placed: false };
}

export interface SeparateRow {
  line: BoqItem;
  name: string;
  room: string;
  /** The item's words for the client. */
  words: string;
  supply: ItemSupply;
  /** Items at actuals: rate × qty, an estimate. Items the client buys: none. */
  estimate: number | null;
}

/** The lines kept apart from the price: at actuals first, then those the client buys; with the actuals' estimate. */
export function separateOf(boq: BoqItem[], bankMap: Map<string, Item>): { actuals: SeparateRow[]; client: SeparateRow[]; estimate: number } {
  const rows = (boq || []).filter(live).map(l => {
    const supply = lineSupply(l, bankMap);
    if (!supply) return null;
    const r = resolveBoqLine(l, bankMap);
    if (supply === 'actuals' && !r.billable) return null;
    const item = bankMap.get(l.bankId);
    return { line: l, name: r.name, room: l.roomId || FLAT_ROOM, words: String(l.specs || item?.specs || ''), supply, estimate: supply === 'actuals' ? Math.round(r.total) : null } as SeparateRow;
  }).filter((r): r is SeparateRow => !!r);
  const actuals = rows.filter(r => r.supply === 'actuals');
  return { actuals, client: rows.filter(r => r.supply === 'client'), estimate: actuals.reduce((a, r) => a + (r.estimate || 0), 0) };
}

/** The supplied items in the Item Bank, in its order, for the library's By client tab. */
export const suppliedItems = (bank: Item[]) => bank.filter(i => supplyOf(i));

/** An item's estimate per unit at actuals, as the library shows it: cost with its markup. */
export const unitEstimate = (item: Item) => Math.round(calculateSellPrice(Number(item.materials) || 0, Number(item.labor) || 0, Number(item.margin) || 0));
