/**
 * BOQ Playground PR K — room kits.
 *
 * A kit is an Item Bank bundle (the studio's "Room Bundles & Kits", and the
 * standard add-on bundles) dropped on a room. Every line is sized from the room
 * it lands in, by how its item fits:
 *
 *   piece        drawn, at the item's own size, placed along a free wall
 *   floor, floorRemove, walls7, waterproof
 *                civil work measured from the room's floor and walls (PR C)
 *   fixed        a quantity: the kit's own, else the Item Bank's rule for a room
 *                of that size (a count stays 1)
 *
 * A bundle saved before kits (`itemIds` only) reads each item as a piece when
 * it draws, else fixed. Debris in a kit is not a room's line: it comes in once,
 * across the flat, as civil work does.
 *
 * The preview lists each room's lines, a line already in the room unticked;
 * applying adds what is ticked in one step (one undo). A room on the plan can
 * be saved back as a kit, each line with how it is sized.
 *
 * Pure.
 */
import type { BoqItem, Item, KitFit, KitItem, Room } from '../../types';
import type { RoomKind } from '../takeoff';
import { calculateQuantity } from '../standardPackages';
import { drawOf, footprintOf, pieceSize, isHigh, isWallBacked, pieceItemOf } from './pieces';
import { newPieceLine } from './board';
import { autoPlace, type PlacedPiece } from './placing';
import { kindOf } from './rooms';
import { ftin, round2 } from './geometry';
import { civilLine, civilDims, civilDerivation, debrisLine, civilItems, FLAT_ROOM, type CivilType } from './civil';

export type { KitFit, KitItem };

/** Where a kit comes from in the Item Bank, as the preview's eyebrow says it. */
export type KitSource = 'Add-on bundles' | 'Room Bundles & Kits';

export interface Kit {
  id: string;
  name: string;
  description?: string;
  source: KitSource;
  /** The kinds of room it is for; empty means any room. */
  kinds: RoomKind[];
  items: KitItem[];
}

/** A bundle as stored: the studio's custom bundles and the standard add-ons share it. */
export interface BundleLike {
  id: string;
  name: string;
  description?: string;
  itemIds?: string[];
  items?: unknown[];
  kinds?: string[];
}

const FITS: KitFit[] = ['piece', 'floor', 'floorRemove', 'walls7', 'waterproof', 'fixed'];
const CIVIL_FITS: KitFit[] = ['floor', 'floorRemove', 'walls7', 'waterproof'];
export const isCivilFit = (f: KitFit) => CIVIL_FITS.includes(f);
const KINDS: RoomKind[] = ['living', 'dining', 'bedroom', 'kitchen', 'toilet', 'utility', 'foyer', 'passage', 'balcony', 'other'];

/** A debris item: in a kit it means "debris once, across the flat". */
const isDebris = (item: Pick<Item, 'name'> | undefined) => !!item && /\bdebris\b/i.test(item.name || '');

/**
 * How an item in a kit is sized: its own fit, else (a bundle saved before
 * kits) a piece when it draws, fixed when it does not.
 */
export function fitOf(k: Pick<KitItem, 'fit'>, item: Item | undefined): KitFit {
  if (k.fit && FITS.includes(k.fit)) return k.fit === 'piece' && !drawOf(item) ? 'fixed' : k.fit;
  return drawOf(item) ? 'piece' : 'fixed';
}

/**
 * A stored bundle as a kit. `items` written by kits ({ itemId, fit, qty }) are
 * read as they are, kept in step with `itemIds` (what the Item Bank's bundle
 * editor changes); anything else in `items` (an older shape) is passed over.
 */
export function kitFromBundle(b: BundleLike, source: KitSource): Kit {
  const fromItems = (Array.isArray(b.items) ? b.items : [])
    .filter((x): x is KitItem => !!x && typeof (x as KitItem).itemId === 'string')
    .map(x => ({ itemId: x.itemId, ...(x.fit && FITS.includes(x.fit) ? { fit: x.fit } : {}), ...(Number(x.qty) > 0 ? { qty: Number(x.qty) } : {}) }));
  const ids = (b.itemIds || []).filter(id => typeof id === 'string');
  // The Item Bank's bundle editor changes `itemIds` only: an item taken out there is out of the kit, one put in there comes in as before kits.
  const items = !fromItems.length ? ids.map(itemId => ({ itemId }))
    : !ids.length ? fromItems
    : [...fromItems.filter(k => ids.includes(k.itemId)), ...ids.filter(id => !fromItems.some(k => k.itemId === id)).map(itemId => ({ itemId }))];
  const kinds = (b.kinds || []).filter((k): k is RoomKind => KINDS.includes(k as RoomKind));
  return { id: b.id, name: b.name, ...(b.description ? { description: b.description } : {}), source, kinds, items };
}

/**
 * The kits in the library: the studio's own first, then the standard add-ons.
 * Given the Item Bank, an item it no longer has is left out of its kit, and a
 * kit with none left is not offered.
 */
export function kitsOf(custom: BundleLike[] | undefined, addons: BundleLike[], bankMap?: Map<string, Item>): Kit[] {
  return [
    ...(custom || []).map(b => kitFromBundle(b, 'Room Bundles & Kits')),
    ...addons.map(b => kitFromBundle(b, 'Add-on bundles')),
  ].map(k => (bankMap ? { ...k, items: k.items.filter(i => bankMap.has(i.itemId)) } : k))
    .filter(k => k.items.length > 0);
}

/** What a kit holds, in a word for its card: civil and fittings, carpentry, or services. */
export function kitKind(kit: Kit, bankMap: Map<string, Item>): 'civil and fittings' | 'carpentry' | 'services' {
  if (kitHasCivil(kit, bankMap)) return 'civil and fittings';
  return kit.items.some(k => fitOf(k, bankMap.get(k.itemId)) === 'piece') ? 'carpentry' : 'services';
}

/** Whether a kit has civil work in it (the hard hat, "civil and fittings"). */
export const kitHasCivil = (kit: Kit, bankMap: Map<string, Item>) => kit.items.some(k => isCivilFit(fitOf(k, bankMap.get(k.itemId))));

/** Whether a kit is for a room. */
export const kitFits = (kit: Kit, room: Pick<Room, 'name' | 'kind'>) => !kit.kinds.length || kit.kinds.includes(kindOf(room));

/** The rooms a kit opens on: the room it was dropped on, else up to two of its kinds. */
export function kitStartRooms(kit: Kit, rooms: Room[], dropped?: string | null): string[] {
  if (dropped) return [dropped];
  if (!kit.kinds.length) return [];
  return rooms.filter(r => kitFits(kit, r)).slice(0, 2).map(r => r.name);
}

/** The rooms offered in the preview: those of the kit's kinds, and any already picked. */
export const kitCandidates = (kit: Kit, rooms: Room[], picked: string[]) =>
  rooms.filter(r => kitFits(kit, r) || picked.includes(r.name));

export interface KitRow {
  /** Stable for a room and the kit's item: `${room}|${index}`. */
  key: string;
  line: BoqItem;
  item: Item;
  fit: KitFit;
  qty: number;
  unit: string;
  /** The room already has it: unticked to start with. */
  dup: boolean;
  /** How it is sized, in words, or that it is already there. */
  why: string;
}

const live = (l: BoqItem) => l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted';

/**
 * A kit's lines for one room, each sized from the room. `boq` is what the
 * option already has: a line that is already in the room (the same item, or
 * the same civil work) is marked. Items no longer in the bank are left out and
 * named in `missing`; debris is left to `kitApply`.
 */
export function kitRows(kit: Kit, room: Room, ctx: { boq: BoqItem[]; bankMap: Map<string, Item>; newId: () => string; ceilingHeight?: number }): { rows: KitRow[]; missing: string[] } {
  const { boq, bankMap, newId } = ctx;
  const inRoom = boq.filter(l => live(l) && l.roomId === room.name);
  const dims = civilDims(room);
  const area = dims?.area || Number(room.size) || 0;
  const rows: KitRow[] = [];
  const missing: string[] = [];
  kit.items.forEach((k, i) => {
    const item = bankMap.get(k.itemId);
    if (!item) { missing.push(k.itemId); return; }
    if (isDebris(item)) return;
    const fit = fitOf(k, item);
    let line: BoqItem | null = null;
    let why = '';
    if (isCivilFit(fit)) {
      line = civilLine(fit as CivilType, room, item, newId);
      why = civilDerivation(line.civil!, room);
    } else if (fit === 'piece') {
      line = newPieceLine(item, room.name, { x: 0, y: 0, rot: 0 }, newId());
      const draw = drawOf(item)!;
      why = `Placed on a free wall, ${ftin(draw.w)} wide`;
    }
    if (!line) {
      const q = Number(k.qty) > 0 ? Number(k.qty) : (area > 0 ? calculateQuantity(item, area, ctx.ceilingHeight || dims?.height || 9.5) : 1);
      line = { id: newId(), bankId: item.id, qty: round2(q > 0 ? q : 1), roomId: room.name, baseRate: item.materials };
      why = Number(k.qty) > 0 || line.qty === 1 ? 'As in the Item Bank' : `From the room’s ${Math.round(area)} sq ft`;
    }
    const dup = inRoom.some(l => (l.bankId === item.id && (!l.civil || !line!.civil || l.civil.type === line!.civil.type))
      || (!!line!.civil && !!l.civil && l.civil.type === line!.civil.type));
    rows.push({ key: `${room.name}|${i}`, line, item, fit, qty: Number(line.qty) || 0, unit: String(item.unit || ''), dup, why: dup ? 'Already in this room' : why });
  });
  return { rows, missing };
}

/** Whether a row is ticked: by the user's choice, else not when the room already has it. */
export const rowOn = (r: KitRow, off: Record<string, boolean>) => (off[r.key] === undefined ? !r.dup : !off[r.key]);

/** Whether applying the kit brings in debris removal, once across the flat. */
export function kitAddsDebris(kit: Kit, boq: BoqItem[], bank: Item[], bankMap: Map<string, Item>): boolean {
  const civil = kitHasCivil(kit, bankMap) || kit.items.some(k => isDebris(bankMap.get(k.itemId)));
  if (!civil) return false;
  return !!debrisLine(boq, { bank, bankMap, rooms: [], newId: () => '' });
}

export interface KitApplied {
  boq: BoqItem[];
  added: BoqItem[];
  /** Pieces with no free wall: waiting under Needs a place. */
  waiting: number;
  message: string;
}

/**
 * The ticked lines of a kit added to its rooms: pieces placed along a free
 * wall (one after another, so they do not land on each other), civil measured,
 * debris once. `prepare` gives each new line its words (the option's recipe).
 */
export function kitApply(args: {
  kit: Kit;
  rooms: Room[];
  picked: string[];
  off: Record<string, boolean>;
  boq: BoqItem[];
  bank: Item[];
  bankMap: Map<string, Item>;
  newId: () => string;
  prepare?: (l: BoqItem) => BoqItem;
  ceilingHeight?: number;
}): KitApplied | null {
  const { kit, rooms, picked, off, boq, bank, bankMap, newId } = args;
  const prepare = args.prepare || (l => l);
  const added: BoqItem[] = [];
  let waiting = 0;
  const targets = picked.map(n => rooms.find(r => r.name === n)).filter((r): r is Room => !!r);
  const placedOf = (l: BoqItem): PlacedPiece | null => {
    const item = pieceItemOf(l, bankMap);
    const draw = drawOf(item);
    if (!draw || !l.place) return null;
    return { id: l.id, room: l.roomId, fp: footprintOf(pieceSize(l, item, draw)), place: l.place, high: isHigh(draw), wallBacked: isWallBacked(draw) };
  };
  targets.forEach(room => {
    const { rows } = kitRows(kit, room, { boq, bankMap, newId, ceilingHeight: args.ceilingHeight });
    rows.filter(r => rowOn(r, off)).forEach(r => {
      let line = r.line;
      if (r.fit === 'piece' && line.place) {
        const draw = drawOf(r.item)!;
        const probe: PlacedPiece = { id: line.id, room: room.name, fp: footprintOf(pieceSize(line, r.item, draw)), place: line.place, high: isHigh(draw), wallBacked: isWallBacked(draw) };
        const others = [...boq, ...added].filter(l => live(l) && l.roomId === room.name).map(placedOf).filter((p): p is PlacedPiece => !!p);
        const at = room.plan ? autoPlace(probe, { name: room.name, plan: room.plan }, others) : null;
        if (at) line = { ...line, place: { ...line.place, x: at.x, y: at.y, rot: at.rot } };
        else { const { place: _p, ...rest } = line; line = rest as BoqItem; waiting++; }
      }
      added.push(prepare(line));
    });
  });
  if (!added.length) return null;
  const debris = kitAddsDebris(kit, boq, bank, bankMap) ? debrisLine(boq, { bank, bankMap, rooms, newId }) : null;
  const all = debris ? [...added, debris] : added;
  const names = targets.filter(r => added.some(l => l.roomId === r.name)).map(r => r.name);
  const where = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return {
    boq: [...boq, ...all],
    added: all,
    waiting,
    message: `${kit.name}: ${added.length} line${added.length === 1 ? '' : 's'} in ${where}, sized from ${names.length > 1 ? 'each room' : 'the room'}.${debris ? ' Debris removal added once, across the flat.' : ''}`,
  };
}

/* ───────────────────────────── a room saved as a kit ───────────────────────────── */

export interface SavedKit {
  /** As stored in the studio's settings, beside the bundles saved before kits. */
  bundle: { id: string; name: string; description: string; itemIds: string[]; items: KitItem[]; kinds: string[] };
  /** Lines of the room's own (not in the Item Bank): a kit holds Item Bank items only. */
  skipped: number;
}

/**
 * A room's lines as a kit: each with how it is sized (a piece on a free wall,
 * the floor, walls to 7′…), a fixed line with its quantity. Lines not in the
 * Item Bank, whole-flat shares and debris are left out. Null when nothing is
 * left.
 */
export function roomAsKit(args: { room: Room; boq: BoqItem[]; bankMap: Map<string, Item>; project?: string; existing?: { name: string }[]; id: string }): SavedKit | null {
  const { room, boq, bankMap } = args;
  const lines = boq.filter(l => live(l) && l.roomId === room.name && l.roomId !== FLAT_ROOM && !l.byRoom);
  const items: KitItem[] = [];
  let skipped = 0;
  lines.forEach(l => {
    const item = bankMap.get(l.bankId);
    if (!item) { skipped++; return; }
    if (isDebris(item)) return;
    if (l.civil) {
      // A break or a new wall is drawn where it is: it does not carry to another room.
      if (l.civil.type === 'break' || l.civil.type === 'build') { skipped++; return; }
      items.push({ itemId: item.id, fit: l.civil.type });
      return;
    }
    if (drawOf(item)) { items.push({ itemId: item.id, fit: 'piece' }); return; }
    items.push({ itemId: item.id, fit: 'fixed', qty: round2(Number(l.qty) || 1) });
  });
  if (!items.length) return null;
  const project = String(args.project || '').split(/\s+[–—-]\s+/)[0].trim();
  const base = project ? `${room.name}, ${project}` : room.name;
  const taken = new Set((args.existing || []).map(b => b.name));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} (${n})`;
  return {
    bundle: {
      id: args.id, name,
      description: `Saved from ${room.name}${project ? ` in ${project}` : ''}: each item with how it is sized in the room it lands in.`,
      itemIds: [...new Set(items.map(i => i.itemId))],
      items,
      kinds: [kindOf(room)],
    },
    skipped,
  };
}

/** What the kit's card estimates for one room, at the line amounts (all ticked). */
export function kitEstimate(kit: Kit, room: Room | undefined, ctx: { bankMap: Map<string, Item>; amount: (l: BoqItem) => number }): number {
  if (!room) return 0;
  const { rows } = kitRows(kit, room, { boq: [], bankMap: ctx.bankMap, newId: () => 'est' });
  return rows.reduce((a, r) => a + ctx.amount(r.line), 0);
}

/** The kit's item names, once each, for its card. */
export const kitItemNames = (kit: Kit, bankMap: Map<string, Item>) =>
  [...new Set(kit.items.map(k => bankMap.get(k.itemId)?.name).filter((n): n is string => !!n))];

/** The bank's own debris item, for a test or a hint. */
export const debrisItemOf = (bank: Item[]) => civilItems(bank).items.debris;
