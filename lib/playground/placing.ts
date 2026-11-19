/**
 * BOQ Playground — placing pieces on the plan.
 *
 *   autoPlace   finds a free spot along a room's walls, then anywhere on the floor
 *               (for free-standing pieces), for a piece added from the Rooms lens
 *               or a room kit.
 *   placeAt     where a piece dropped or dragged at a point lands: backed onto the
 *               nearest wall when it is close, and kept inside the room.
 *   softSnap    the magnets: a dragged piece's edges and centre pull onto the
 *               room's walls and its neighbours' edges and centres.
 *   overlaps    which pieces a piece collides with. A wall-hung piece only meets
 *               other wall-hung pieces; it floats over floor pieces.
 *
 * Every function returns a new place; nothing is mutated.
 */
import type { PiecePlace } from '../../types';
import {
  type Rect, type Footprint, type Wall, MIN_DEPTH_FT, WALL_GAP_FT, WALL_ROT,
  pieceBox, rectsOverlap, pastWalls, clamp, round2, roomAt, roomRect, wallsByDistance,
} from './geometry';

/** A piece already on the plan, as the placing functions see it. */
export interface PlacedPiece {
  id: string;
  /** The room it belongs to (by name, as roomId holds it). */
  room?: string;
  fp: Footprint;
  place: Pick<PiecePlace, 'x' | 'y' | 'rot'>;
  /** Wall-hung above the floor. */
  high?: boolean;
  /** Backs onto a wall (wardrobes, TV units) rather than standing free (sofas, tables). */
  wallBacked?: boolean;
}

export interface PlanRoom { name: string; plan?: Rect }

export const boxOf = (p: Pick<PlacedPiece, 'fp' | 'place'>) => pieceBox(p.fp, p.place);

/** The pieces this one would collide with at a place (its own place by default). */
export function overlaps(piece: PlacedPiece, others: PlacedPiece[], at?: PlacedPiece['place']): PlacedPiece[] {
  const box = pieceBox(piece.fp, at || piece.place);
  return (others || []).filter(o =>
    o.id !== piece.id && !!o.high === !!piece.high && rectsOverlap(box, boxOf(o)));
}

/** True when the piece runs past its room's walls. */
export function runsPastWall(piece: PlacedPiece, room: PlanRoom | undefined): boolean {
  const r = roomRect(room);
  return !!r && pastWalls(boxOf(piece), r);
}

const fits = (box: Rect, r: Rect, pad: number) =>
  box.x >= r.x + pad - 0.01 && box.y >= r.y + pad - 0.01 &&
  box.x + box.w <= r.x + r.w - pad + 0.01 && box.y + box.h <= r.y + r.h - pad + 0.01;

/** The centre of a piece backed onto a wall, t feet along it. */
function onWall(r: Rect, wall: Wall, t: number, depth: number, pad: number): { x: number; y: number } {
  switch (wall) {
    case 'top': return { x: r.x + t, y: r.y + pad + depth / 2 };
    case 'bottom': return { x: r.x + t, y: r.y + r.h - pad - depth / 2 };
    case 'right': return { x: r.x + r.w - pad - depth / 2, y: r.y + t };
    case 'left': return { x: r.x + pad + depth / 2, y: r.y + t };
  }
}

/**
 * A free spot for the piece in the room, or null when there is none. Walls are
 * tried in the order top, left, bottom, right, sliding along each in 3″ steps;
 * a free-standing piece then tries the open floor in 6″ steps.
 */
export function autoPlace(piece: PlacedPiece, room: PlanRoom, others: PlacedPiece[]): PlacedPiece['place'] | null {
  const r = roomRect(room);
  if (!r) return null;
  const W = piece.fp.w;
  const Dp = Math.max(piece.fp.d, MIN_DEPTH_FT);
  const pad = WALL_GAP_FT;
  const sameRoom = others.filter(o => o.id !== piece.id);
  const free = (at: PlacedPiece['place']) =>
    fits(pieceBox(piece.fp, at), r, pad) && overlaps(piece, sameRoom, at).length === 0;

  for (const wall of ['top', 'left', 'bottom', 'right'] as Wall[]) {
    const rot = WALL_ROT[wall];
    const along = wall === 'top' || wall === 'bottom' ? r.w : r.h;
    if (W > along - 2 * pad + 0.01) continue;
    for (let t = pad + W / 2; t <= along - pad - W / 2 + 0.001; t += 0.25) {
      const c = onWall(r, wall, t, Dp, pad);
      const at = { x: round2(c.x), y: round2(c.y), rot };
      if (free(at)) return at;
    }
  }
  if (piece.wallBacked) return null;
  for (let y = r.y + Dp / 2 + 1; y < r.y + r.h - Dp / 2 - 0.5; y += 0.5) {
    for (let x = r.x + W / 2 + 1; x < r.x + r.w - W / 2 - 0.5; x += 0.5) {
      const at = { x: round2(x), y: round2(y), rot: 0 };
      if (free(at)) return at;
    }
  }
  return null;
}

export interface PlaceAtResult {
  place: PlacedPiece['place'];
  /** The room the point fell in, if any. */
  room: string | null;
  /** The wall it was backed onto, if any. */
  wall: Wall | null;
}

/**
 * Where a piece dropped at (x, y) lands. A wall-backed piece within reach of a
 * wall (its depth plus 1′4″, at least 2′7″) turns to back onto it. The piece is
 * then kept inside the room where it fits. `free` (Alt held) skips both.
 */
export function placeAt(piece: PlacedPiece, x: number, y: number, rooms: PlanRoom[], opts: { free?: boolean } = {}): PlaceAtResult {
  const room = roomAt(rooms, x, y);
  const r = roomRect(room);
  const W = piece.fp.w;
  const Dp = Math.max(piece.fp.d, MIN_DEPTH_FT);
  const pad = WALL_GAP_FT;
  let rot = piece.place?.rot ?? 0;
  let wall: Wall | null = null;
  let cx = x, cy = y;

  if (r && !opts.free && piece.wallBacked) {
    const near = wallsByDistance(r, x, y)[0];
    if (near.dist < Math.max(2.6, Dp + 1.3)) {
      wall = near.wall;
      rot = WALL_ROT[wall];
      const c = onWall(r, wall, 0, Dp, pad);
      if (wall === 'top' || wall === 'bottom') cy = c.y; else cx = c.x;
    }
  }
  if (r && !opts.free) {
    const sideways = rot % 180 !== 0;
    const hw = sideways ? Dp / 2 : W / 2;
    const hh = sideways ? W / 2 : Dp / 2;
    if (hw * 2 <= r.w - 2 * pad) cx = clamp(cx, r.x + pad + hw, r.x + r.w - pad - hw);
    if (hh * 2 <= r.h - 2 * pad) cy = clamp(cy, r.y + pad + hh, r.y + r.h - pad - hh);
  }
  return { place: { x: round2(cx), y: round2(cy), rot }, room: room ? room.name : null, wall };
}

/** A guide line drawn while a magnet holds: along a wall, or a neighbour's edge. */
export interface SnapGuide { x1: number; y1: number; x2: number; y2: number; wall: boolean }

/**
 * The magnets. Pulls the dragged piece's edges onto walls and neighbours' edges,
 * and its centre onto neighbours' centres, when within `thresholdFt` (the screen
 * passes about 9 px in feet at the current zoom). Off when `free`, and for a
 * piece turned off the right angles.
 */
export function softSnap(
  piece: PlacedPiece, x: number, y: number,
  rooms: PlanRoom[], others: PlacedPiece[],
  opts: { thresholdFt: number; free?: boolean },
): { x: number; y: number; guides: SnapGuide[] } {
  const guides: SnapGuide[] = [];
  const rot = piece.place?.rot ?? 0;
  const a = ((rot % 90) + 90) % 90;
  if (opts.free || (a > 0.5 && a < 89.5)) return { x, y, guides };

  const bb = pieceBox(piece.fp, { x, y, rot });
  const room = roomAt(rooms, x, y);
  const r = roomRect(room);
  type Cand = [number, 'w' | 'e' | 'c', number, number];
  const xs: Cand[] = [];
  const ys: Cand[] = [];
  if (r) {
    xs.push([r.x + WALL_GAP_FT, 'w', r.y, r.y + r.h], [r.x + r.w - WALL_GAP_FT, 'w', r.y, r.y + r.h]);
    ys.push([r.y + WALL_GAP_FT, 'w', r.x, r.x + r.w], [r.y + r.h - WALL_GAP_FT, 'w', r.x, r.x + r.w]);
  }
  others.forEach(o => {
    if (o.id === piece.id || (room && o.room !== room.name)) return;
    const b = boxOf(o);
    xs.push([b.x, 'e', b.y, b.y + b.h], [b.x + b.w, 'e', b.y, b.y + b.h], [b.x + b.w / 2, 'c', b.y, b.y + b.h]);
    ys.push([b.y, 'e', b.x, b.x + b.w], [b.y + b.h, 'e', b.x, b.x + b.w], [b.y + b.h / 2, 'c', b.x, b.x + b.w]);
  });
  const best = (mine: [number, boolean][], cands: Cand[]) => {
    let hit: { d: number; c: Cand } | null = null;
    mine.forEach(([v, isCentre]) => cands.forEach(c => {
      if (isCentre !== (c[1] === 'c')) return;
      const d = c[0] - v;
      if (Math.abs(d) < opts.thresholdFt && (!hit || Math.abs(d) < Math.abs(hit.d))) hit = { d, c };
    }));
    return hit as { d: number; c: Cand } | null;
  };
  const bx = best([[bb.x, false], [bb.x + bb.w, false], [x, true]], xs);
  const by = best([[bb.y, false], [bb.y + bb.h, false], [y, true]], ys);
  let nx = x, ny = y;
  if (bx) {
    nx += bx.d;
    const c = bx.c;
    guides.push({ x1: c[0], y1: Math.min(c[2], bb.y), x2: c[0], y2: Math.max(c[3], bb.y + bb.h), wall: c[1] === 'w' });
  }
  if (by) {
    ny += by.d;
    const c = by.c;
    guides.push({ x1: Math.min(c[2], bb.x), y1: c[0], x2: Math.max(c[3], bb.x + bb.w), y2: c[0], wall: c[1] === 'w' });
  }
  return { x: nx, y: ny, guides };
}

/** A place turned by a quarter, keeping its centre. */
export const turned = (place: PlacedPiece['place'], by = 90): PlacedPiece['place'] =>
  ({ ...place, rot: (((place.rot + by) % 360) + 360) % 360 });
