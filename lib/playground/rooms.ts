/**
 * BOQ Playground — what a room measures, and whole-flat services shared into rooms.
 *
 * A room on the plan has a size; lib/takeoff.ts already turns a size into wall,
 * ceiling, false-ceiling and floor quantities with the studio's conventions, so
 * this file reuses it rather than keeping a second set of rules. The one thing
 * the plan adds is the carpentry actually drawn: a wardrobe backed onto a wall
 * hides that wall, so it is not painted (unless the studio paints behind
 * carpentry). Kitchens, utilities and toilets keep takeoff's own allowances.
 *
 * Whole-flat services (painting, false ceiling, electrical) are one BOQ line
 * each, carrying `byRoom`: each room takes a share, measured from the plan or
 * typed, and the shares add up to the line. A typed flat total (`keep`) scales
 * the shares to meet it; electrical points stay whole numbers.
 *
 * Painting is measured from the plan. The old carpet-area rule (walls 2.7×,
 * ceiling 1.3× the floor) is worked out beside it, and a line can choose it.
 */
import type { Room, BoqItem, ByRoomSplit, ShareBasis } from '../../types';
import {
  type RoomGeometry, type RoomKind, type CeilingDesign, type TakeoffConventions,
  DEFAULT_CONVENTIONS, classifyRoom, defaultCeiling, computeRoom,
} from '../takeoff';
import { roomRect, round2 } from './geometry';

/** The room height when a room has none on file. */
export const DEFAULT_HEIGHT_FT = 10;

/** The carpet-area rule of thumb, shown beside the plan's measure. */
export const RULE_WALL = 2.7;
export const RULE_CEILING = 1.3;

/** Electrical points per room by kind; Studio settings `pointsByRoomKind` overrides it. */
export const DEFAULT_POINTS_BY_KIND: Record<RoomKind, number> = {
  living: 12, dining: 6, kitchen: 10, bedroom: 8, toilet: 4,
  utility: 2, foyer: 2, passage: 2, balcony: 2, other: 4,
};

/** Wall-backed carpentry drawn in a room: what hides the wall from paint. */
export interface WallCover { room: string; widthFt: number; heightFt: number }

export interface MeasureContext {
  conventions?: TakeoffConventions;
  pointsByKind?: Partial<Record<RoomKind, number>>;
  /** Carpentry drawn against the walls, from the placed pieces. */
  covers?: WallCover[];
}

export const kindOf = (room: Pick<Room, 'name' | 'kind'>): RoomKind => room.kind || classifyRoom(room.name);

/** The room's length and width: from the plan, else from the room's own fields, else none. */
function dims(room: Room): { l: number; w: number } | null {
  const r = roomRect(room);
  if (r) return { l: r.w, w: r.h };
  const l = Number(room.length), w = Number(room.width);
  if (l > 0 && w > 0) return { l, w };
  return null;
}

/** The room as lib/takeoff reads it, or null when there is no size to measure. */
export function roomGeometry(room: Room): RoomGeometry | null {
  const d = dims(room);
  if (!d) return null;
  const kind = kindOf(room);
  return {
    id: room.id || room.name,
    name: room.name,
    kind,
    lengthFt: d.l,
    widthFt: d.w,
    heightFt: Number(room.height) > 0 ? Number(room.height) : DEFAULT_HEIGHT_FT,
    doors: room.doors ?? 1,
    windows: room.windows ?? 0,
    ceiling: (room.ceiling as CeilingDesign) || defaultCeiling(kind),
    source: room.dimSource || 'assumed',
  };
}

/** The floor area: the plan's, else the room's size field. */
export function floorArea(room: Room): number {
  const d = dims(room);
  return d ? d.l * d.w : Number(room.size) || 0;
}

export interface RoomMeasure {
  area: number;
  /** Walls to paint, after doors, windows, tiling and drawn carpentry. */
  wall: number;
  /** The slab, or the false-ceiling surface where there is one. */
  ceiling: number;
  falseCeiling: number;
  /** Wall hidden by carpentry drawn on the plan. */
  carpentry: number;
  /** The working, in words. */
  derivation: string;
}

/** What one room measures. A room without dimensions falls back to the carpet-area rule. */
export function measureRoom(room: Room, ctx: MeasureContext = {}): RoomMeasure {
  const conv = ctx.conventions || DEFAULT_CONVENTIONS;
  const g = roomGeometry(room);
  const kind = kindOf(room);
  if (!g) {
    const area = floorArea(room);
    const wet = kind === 'toilet';
    return {
      area,
      wall: wet ? 0 : round2(area * RULE_WALL),
      ceiling: wet ? 0 : round2(area * RULE_CEILING),
      falseCeiling: 0,
      carpentry: 0,
      derivation: area ? `No size on the plan: ${Math.round(area)} sq ft × ${RULE_WALL} for walls, × ${RULE_CEILING} for the ceiling` : 'No size on file',
    };
  }
  const t = computeRoom(g, conv);
  const ownAllowance = kind === 'toilet' || kind === 'kitchen' || kind === 'utility';
  const carpentry = ownAllowance || conv.paintBehindCarpentry ? 0 : (ctx.covers || [])
    .filter(c => c.room === room.name)
    .reduce((s, c) => s + c.widthFt * Math.min(c.heightFt, g.heightFt), 0);
  const wall = Math.max(0, t.wallPaintSft - carpentry);
  const derivation = kind === 'toilet'
    ? 'Tiled full height: out of the painting scope'
    : `Walls ${Math.round(t.grossWallSft)} − ${Math.round(t.openingsSft)} doors and windows` +
      (t.cladSft ? ` − ${Math.round(t.cladSft)} tiled` : '') +
      (carpentry ? ` − ${Math.round(carpentry)} behind carpentry` : '') +
      ` = ${Math.round(wall)}; ceiling ${Math.round(t.ceilingPaintSft)}`;
  return { area: t.areaSft, wall, ceiling: t.ceilingPaintSft, falseCeiling: t.falseCeilingSft, carpentry, derivation };
}

/** Wall and ceiling painting from the plan, and by the carpet-area rule, side by side. */
export function planVsRule(basis: 'wallPaint' | 'ceilingPaint', room: Room, ctx: MeasureContext = {}): { plan: number; rule: number } {
  const m = measureRoom(room, ctx);
  const toilet = kindOf(room) === 'toilet';
  return {
    plan: Math.round(basis === 'wallPaint' ? m.wall : m.ceiling),
    rule: toilet ? 0 : Math.round(m.area * (basis === 'wallPaint' ? RULE_WALL : RULE_CEILING)),
  };
}

/** One room's measured share for a basis (before any typed share or flat total). */
export function measureShare(basis: ShareBasis, room: Room, ctx: MeasureContext = {}, useRule = false): number {
  if (basis === 'wallPaint' || basis === 'ceilingPaint') {
    const v = planVsRule(basis, room, ctx);
    return useRule ? v.rule : v.plan;
  }
  if (basis === 'points') {
    const kind = kindOf(room);
    return ctx.pointsByKind?.[kind] ?? DEFAULT_POINTS_BY_KIND[kind] ?? 4;
  }
  const m = measureRoom(room, ctx);
  if (basis === 'paint') return Math.round(m.wall + m.ceiling);
  if (basis === 'falseCeiling') return Math.round(m.falseCeiling);
  if (basis === 'carpetArea') return Math.round(m.area);
  return 0;
}

/** Whether a room takes a share by default: no painting in toilets, no ceiling where there is none. */
export function shareOnByDefault(basis: ShareBasis, room: Room): boolean {
  const kind = kindOf(room);
  if (basis === 'paint' || basis === 'wallPaint' || basis === 'ceilingPaint') return kind !== 'toilet';
  if (basis === 'falseCeiling') return ((room.ceiling as CeilingDesign) || defaultCeiling(kind)) !== 'none';
  return true;
}

/**
 * Each room's share of a whole-flat line, keyed by room name, in the rooms' order.
 * A room is on by default for its basis, unless the line says otherwise; its share
 * is the typed one, else the measured one. A typed flat total (`keep`) scales the
 * shares to meet it; points are kept whole, the remainder going to the largest
 * fractions.
 */
export function roomShares(split: ByRoomSplit, rooms: Room[], ctx: MeasureContext = {}): Map<string, number> {
  const raw = rooms.map(r => {
    const s = split.rooms?.[r.name] || {};
    const on = s.on ?? shareOnByDefault(split.basis, r);
    return on ? Math.max(0, Number(s.qty ?? measureShare(split.basis, r, ctx, !!split.rule)) || 0) : 0;
  });
  let out = raw;
  const keep = Number(split.keep);
  if (keep > 0) {
    const sum = raw.reduce((a, b) => a + b, 0);
    if (!sum) out = raw.map(() => 0);
    else if (split.basis !== 'points') out = raw.map(v => round2((v * keep) / sum));
    else {
      const exact = raw.map(v => (v * keep) / sum);
      const floors = exact.map(Math.floor);
      let rem = Math.round(keep) - floors.reduce((a, b) => a + b, 0);
      exact.map((v, i) => [v - floors[i], i] as [number, number])
        .sort((a, b) => b[0] - a[0])
        .forEach(([, i]) => { if (rem > 0) { floors[i]++; rem--; } });
      out = floors;
    }
  }
  return new Map(rooms.map((r, i) => [r.name, out[i]]));
}

/** The line's quantity: the typed flat total, else the sum of the shares. */
export function byRoomQty(split: ByRoomSplit, rooms: Room[], ctx: MeasureContext = {}): number {
  if (Number(split.keep) > 0) return Number(split.keep);
  let s = 0;
  roomShares(split, rooms, ctx).forEach(v => { s += v; });
  return round2(s);
}

/** The line with its qty brought in line with its shares, so every Classic reader sees the flat total. */
export function withByRoomQty<T extends Pick<BoqItem, 'qty' | 'byRoom'>>(line: T, rooms: Room[], ctx: MeasureContext = {}): T {
  if (!line.byRoom) return line;
  const qty = byRoomQty(line.byRoom, rooms, ctx);
  return qty === line.qty ? line : { ...line, qty };
}

/**
 * A line's shares when the plan's rooms are not to hand: the typed shares in the
 * split. Used by pricing so a whole-flat line can still be rounded room by room.
 */
export function storedShares(split: ByRoomSplit): Map<string, number> {
  const m = new Map<string, number>();
  Object.entries(split.rooms || {}).forEach(([name, s]) => {
    if (s?.on === false) return;
    const q = Number(s?.qty);
    if (q > 0) m.set(name, q);
  });
  return m;
}
