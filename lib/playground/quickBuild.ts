/**
 * BOQ Playground PR 5 — no plan yet: the quick build.
 *
 * From the flat's size (1–4 BHK), its carpet area and the finish, in one step:
 *
 *   rooms     the project's own rooms when it has their sizes, else the size's
 *             standard rooms (lib/standardPackages ROOM_DISTRIBUTIONS), scaled
 *             so they add up to the carpet area
 *   a plan    the rooms packed as blocks into one rectangle (rows of rooms that
 *             share their walls, every edge on the 3″ grid), within 1% of the
 *             carpet area. A working plan: the brief's plan, an upload or a
 *             sketch replaces it later
 *   lines     the studio's room standards (Studio settings `roomStandards`, else
 *             DEFAULT_ROOM_STANDARDS): each room kind's pieces, at their
 *             standard sizes, placed along a free wall. A piece that finds no
 *             free wall waits under Needs a place; a standard with no item in
 *             the Item Bank is named, not guessed
 *
 * Pure.
 */
import type { BoqItem, Item, PieceKind, Room, RoomPlanRect } from '../../types';
import { ROOM_DISTRIBUTIONS } from '../standardPackages';
import { classifyRoom, type RoomKind } from '../takeoff';
import { roundTo3in, round2 } from './geometry';
import { drawOf, footprintOf, isHigh, isWallBacked, pieceSize } from './pieces';
import { autoPlace, type PlacedPiece } from './placing';
import { newPieceLine, resizedTo } from './board';
import { kindOf } from './rooms';

/* ─────────────────────────── rooms from the size ─────────────────────────── */

export const QUICK_SIZES = ['1-BHK', '2-BHK', '3-BHK', '4-BHK'] as const;
export type QuickSize = typeof QUICK_SIZES[number];

/** "3BHK", "3 bhk", "3-BHK" → "3-BHK"; anything else → 2-BHK. */
export function sizeOf(config: string | null | undefined): QuickSize {
  const m = String(config || '').match(/(\d)\s*-?\s*bhk/i);
  const n = m ? Math.max(1, Math.min(4, Number(m[1]))) : 2;
  return `${n}-BHK` as QuickSize;
}

/** The size's standard rooms, each with its share of the carpet area. */
export function standardRooms(size: QuickSize): { name: string; ratio: number }[] {
  const list = ROOM_DISTRIBUTIONS[size] || ROOM_DISTRIBUTIONS['2-BHK'];
  // The 4-BHK row keeps its bathrooms as one share; on a plan they are three rooms.
  return list.flatMap(r => (/aggregated/i.test(r.name)
    ? ['Master Bathroom', 'Common Bathroom', 'Guest Bathroom'].map(name => ({ name, ratio: r.ratio / 3 }))
    : [r]));
}

export interface QuickRoom { name: string; area: number; kind: RoomKind }

/**
 * The rooms to build: the project's own when two or more have a size, else the
 * size's standard rooms; either way scaled to the carpet area.
 */
export function quickRooms(size: QuickSize, carpet: number, own: Room[] = []): { rooms: QuickRoom[]; from: 'project' | 'size' } {
  const sized = own.filter(r => Number(r.size) > 0);
  const from = sized.length >= 2 ? 'project' : 'size';
  const base = from === 'project'
    ? sized.map(r => ({ name: r.name, w: Number(r.size), kind: kindOf(r) }))
    : standardRooms(size).map(r => ({ name: r.name, w: r.ratio, kind: classifyRoom(r.name) }));
  const total = base.reduce((a, r) => a + r.w, 0) || 1;
  const area = Number(carpet) > 0 ? Number(carpet) : from === 'project' ? total : 0;
  return { from, rooms: base.map(r => ({ name: r.name, kind: r.kind, area: (r.w / total) * area })) };
}

/**
 * The rooms packed into one rectangle about 1.3 : 1, as a squarified layout:
 * largest first, each strip laid along the shorter side of the space left,
 * a room joining the strip while that keeps the strip's rooms closer to
 * square. Every edge is on the 3″ grid and shared edges round together, so
 * rooms that touch share their wall and the whole stays within 1% of the area
 * asked for.
 */
export function packRooms(rooms: { name: string; area: number }[], aspect = 1.3): { name: string; plan: RoomPlanRect }[] {
  const items = rooms.map((r, i) => ({ ...r, i })).filter(r => r.area > 0).sort((a, b) => b.area - a.area || a.i - b.i);
  const total = items.reduce((a, r) => a + r.area, 0);
  if (!total) return [];
  const W = Math.sqrt(total * aspect), H = total / W;
  const raw: { i: number; name: string; L: number; T: number; R: number; B: number }[] = [];
  let space = { x: 0, y: 0, w: W, h: H };
  const worst = (row: typeof items, side: number) => {
    const s = row.reduce((a, r) => a + r.area, 0);
    const t = s / side;
    return Math.max(...row.map(r => { const l = r.area / t; return Math.max(l / t, t / l); }));
  };
  let k = 0;
  while (k < items.length) {
    const side = Math.min(space.w, space.h);
    const row = [items[k++]];
    while (k < items.length && worst([...row, items[k]], side) <= worst(row, side)) row.push(items[k++]);
    const s = row.reduce((a, r) => a + r.area, 0);
    const last = k >= items.length;
    if (space.w >= space.h) {
      // A column on the left, as tall as the space.
      const t = last ? space.w : s / space.h;
      let y = space.y;
      row.forEach((r, j) => {
        const y2 = j === row.length - 1 ? space.y + space.h : y + r.area / t;
        raw.push({ i: r.i, name: r.name, L: space.x, T: y, R: space.x + t, B: y2 });
        y = y2;
      });
      space = { x: space.x + t, y: space.y, w: space.w - t, h: space.h };
    } else {
      // A row along the top, as wide as the space.
      const t = last ? space.h : s / space.w;
      let x = space.x;
      row.forEach((r, j) => {
        const x2 = j === row.length - 1 ? space.x + space.w : x + r.area / t;
        raw.push({ i: r.i, name: r.name, L: x, T: space.y, R: x2, B: space.y + t });
        x = x2;
      });
      space = { x: space.x, y: space.y + t, w: space.w, h: space.h - t };
    }
  }
  return raw.sort((a, b) => a.i - b.i).map(r => {
    const L = roundTo3in(r.L), T = roundTo3in(r.T), R = roundTo3in(r.R), B = roundTo3in(r.B);
    return { name: r.name, plan: { x: L, y: T, w: round2(R - L), h: round2(B - T) } };
  });
}

/* ─────────────────────────── room standards ─────────────────────────── */

/** One standard piece of a room kind: what it is, and its standard size. */
export interface RoomStandard {
  /** The kind of piece, as the Item Bank draws it. */
  kind: PieceKind;
  /** Narrows the Item Bank item by name ("crockery" for a cabinet). */
  name?: string;
  /** An exact Item Bank item, when the studio names one. */
  item?: string;
  /** Only in rooms whose name has this ("kid"). */
  room?: string;
  /** Width, ft; 'wall' runs along the room's longer wall (a kitchen counter). */
  w?: number | 'wall';
  /** Height, ft, for a piece measured on its face (a wardrobe). */
  h?: number;
  /** Depth, ft. */
  d?: number;
  /** What to call it when the Item Bank has no such item. */
  label: string;
}

/** Studio settings `roomStandards`: room kind → its standard pieces. */
export type RoomStandards = Partial<Record<RoomKind, RoomStandard[]>>;

/** The standards the Playground starts from, before a studio sets its own. */
export const DEFAULT_ROOM_STANDARDS: RoomStandards = {
  living: [{ kind: 'tv', w: 6, label: 'TV unit' }],
  dining: [{ kind: 'cabinet', name: 'crockery', w: 4, label: 'Crockery unit' }],
  kitchen: [{ kind: 'base', w: 'wall', label: 'Base units' }, { kind: 'wallunit', w: 'wall', label: 'Overhead cabinets' }],
  bedroom: [
    { kind: 'wardrobe', w: 6, h: 7, label: 'Wardrobe' },
    { kind: 'bed', label: 'Bed' },
    { kind: 'desk', room: 'kid', w: 4, label: 'Study table' },
  ],
  toilet: [{ kind: 'vanity', w: 3, label: 'Vanity' }],
  foyer: [{ kind: 'cabinet', name: 'shoe', w: 4, label: 'Shoe cabinet' }],
};

/** The studio's standards: its own for a kind it has set, the defaults for the rest. */
export const standardsOf = (studio?: RoomStandards | null): RoomStandards => ({ ...DEFAULT_ROOM_STANDARDS, ...(studio || {}) });

/** The Item Bank item a standard stands for, or undefined. */
export function itemForStandard(std: RoomStandard, bank: Item[]): Item | undefined {
  if (std.item) return bank.find(i => i.id === std.item);
  const name = std.name?.toLowerCase();
  return bank
    .filter(i => drawOf(i)?.kind === std.kind && (!name || i.name.toLowerCase().includes(name)))
    .sort((a, b) => a.name.localeCompare(b.name))[0];
}

export interface QuickLines {
  lines: BoqItem[];
  /** Lines placed on the plan. */
  placed: number;
  /** Lines with no free wall: waiting under Needs a place, as "Wardrobe in Bedroom 2". */
  waiting: string[];
  /** Standards with no item in the Item Bank, by label, once each. */
  missing: string[];
}

/**
 * Each room's standard pieces as lines, sized and placed. A room that already
 * has a piece of a kind is not given another; nothing else in the BOQ moves.
 */
export function standardLines(args: {
  rooms: Room[];
  bank: Item[];
  boq?: BoqItem[];
  standards?: RoomStandards | null;
  newId: () => string;
}): QuickLines {
  const { rooms, bank, newId } = args;
  const boq = args.boq || [];
  const stds = standardsOf(args.standards);
  const bankMap = new Map(bank.map(i => [i.id, i]));
  const asPlaced = (l: BoqItem): PlacedPiece | null => {
    const item = bankMap.get(l.bankId);
    const draw = drawOf(item);
    if (!draw || !l.place) return null;
    return { id: l.id, room: l.roomId, fp: footprintOf(pieceSize(l, item, draw)), place: l.place, high: isHigh(draw), wallBacked: isWallBacked(draw) };
  };
  const lines: BoqItem[] = [];
  const waiting: string[] = [];
  const missing: string[] = [];
  let placed = 0;
  rooms.forEach(room => {
    const list = (stds[kindOf(room)] || []).filter(s => !s.room || room.name.toLowerCase().includes(s.room.toLowerCase()));
    list.forEach(std => {
      const item = itemForStandard(std, bank);
      if (!item) { if (!missing.includes(std.label)) missing.push(std.label); return; }
      const draw = drawOf(item)!;
      const has = [...boq, ...lines].some(l => l.roomId === room.name && drawOf(bankMap.get(l.bankId))?.kind === std.kind);
      if (has) return;
      const r = room.plan;
      const w = std.w === 'wall'
        ? Math.max(2, Math.min(14, Math.floor(((r ? Math.max(r.w, r.h) : draw.w + 1) - 1) * 4) / 4))
        : std.w ?? draw.w;
      const made = newPieceLine(item, room.name, { x: 0, y: 0, rot: 0 }, newId());
      if (!made) return;
      const sized = resizedTo(made, item, w, std.h ?? draw.h, std.d);
      const probe: PlacedPiece = { id: sized.id, room: room.name, fp: footprintOf(pieceSize(sized, item, draw)), place: sized.place!, high: isHigh(draw), wallBacked: isWallBacked(draw) };
      const others = [...boq, ...lines].filter(l => l.roomId === room.name).map(asPlaced).filter((p): p is PlacedPiece => !!p);
      const at = r ? autoPlace(probe, { name: room.name, plan: r }, others) : null;
      if (at) {
        lines.push({ ...sized, place: { ...sized.place!, x: at.x, y: at.y, rot: at.rot } });
        placed++;
      } else {
        // No free wall: the line keeps its size and waits under Needs a place.
        const { place: _p, ...rest } = sized;
        lines.push(rest as BoqItem);
        waiting.push(`${item.name} in ${room.name}`);
      }
    });
  });
  return { lines, placed, waiting, missing };
}

/* ─────────────────────────── the whole build ─────────────────────────── */

export interface QuickBuild {
  /** Where the rooms come from: the project's own sizes, or the size's standard rooms. */
  from: 'project' | 'size';
  /** The plan: each room's rectangle, with its kind. */
  rects: { name: string; kind: RoomKind; plan: RoomPlanRect }[];
  /** The rooms as they would be on the plan. */
  rooms: Room[];
  /** The standard pieces, placed or waiting. */
  standard: QuickLines;
}

/**
 * The quick build in one step: rooms from the size (or the project's own),
 * packed to the carpet area, and each room's standard pieces on them.
 */
export function quickBuild(args: {
  size: QuickSize;
  carpet: number;
  own?: Room[];
  bank: Item[];
  boq?: BoqItem[];
  standards?: RoomStandards | null;
  newId: () => string;
}): QuickBuild {
  const q = quickRooms(args.size, args.carpet, args.own);
  const packed = packRooms(q.rooms);
  const kind = new Map(q.rooms.map(r => [r.name, r.kind]));
  const rects = packed.map(r => ({ ...r, kind: kind.get(r.name) || classifyRoom(r.name) }));
  const own = new Map((args.own || []).map(r => [r.name, r]));
  const rooms: Room[] = rects.map(r => {
    const base = own.get(r.name);
    return {
      ...(base || { name: r.name, unit: 'sq ft' as const }),
      kind: base?.kind || r.kind,
      plan: r.plan,
      size: round2(r.plan.w * r.plan.h),
      length: round2(Math.max(r.plan.w, r.plan.h)),
      width: round2(Math.min(r.plan.w, r.plan.h)),
    } as Room;
  });
  return { from: q.from, rects, rooms, standard: standardLines({ rooms, bank: args.bank, boq: args.boq, standards: args.standards, newId: args.newId }) };
}
