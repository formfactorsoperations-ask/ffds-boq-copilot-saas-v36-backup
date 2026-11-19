/**
 * BOQ Playground — plan geometry.
 *
 * Everything on the plan is in feet, measured from the plan's top-left corner,
 * with y running down the page. Rooms are rectangles (an L-shaped room is two
 * rooms). A piece is a rectangle of width × depth around its centre, turned by
 * a whole number of degrees; for collision and wall checks it is reduced to the
 * axis-aligned box that contains it.
 *
 * Pure arithmetic: nothing here reads the BOQ, the bank or the screen.
 */
import type { Room, RoomPlanRect, PiecePlace } from '../../types';

export interface Rect { x: number; y: number; w: number; h: number }
export type Point = [number, number];

/** A piece thinner than this (a glass partition, a panel) is still drawn and hit-tested this deep. */
export const MIN_DEPTH_FT = 0.12;
/** The gap left between a wall-backed piece and the wall: the skirting and plaster. */
export const WALL_GAP_FT = 0.12;
/** Two boxes touching by less than this are not overlapping: pieces sit flush. */
const TOUCH_FT = 0.06;
/** A piece may run this far past a wall before it is flagged: drawing slack. */
const WALL_SLACK_FT = 0.05;

const D2R = Math.PI / 180;

export const round2 = (v: number) => Math.round(v * 100) / 100;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Rounds to the nearest 3″ (a quarter of a foot): the plan's working precision. */
export const roundTo3in = (ft: number) => Math.round(ft * 4) / 4;

/** Turns any angle into 0–359. */
export const normRot = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

/** 7′6″, 12′, 0′9″. */
export function ftin(ft: number | null | undefined): string {
  if (ft == null || !Number.isFinite(ft)) return '';
  let f = Math.floor(ft + 1e-9);
  let i = Math.round((ft - f) * 12);
  if (i === 12) { f++; i = 0; }
  return i ? `${f}′${i}″` : `${f}′`;
}

export const areaOf = (r: Rect) => r.w * r.h;
export const perimeterOf = (r: Rect) => 2 * (r.w + r.h);

/** True when the point is inside the rectangle, edges included. */
export const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** True when two boxes overlap by more than a touch. */
export const rectsOverlap = (a: Rect, b: Rect, touch = TOUCH_FT) =>
  a.x < b.x + b.w - touch && b.x < a.x + a.w - touch &&
  a.y < b.y + b.h - touch && b.y < a.y + a.h - touch;

/** How far two rectangles overlap on each axis (negative: a gap). */
export function overlapOf(a: Rect, b: Rect): { ox: number; oy: number } {
  return {
    ox: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    oy: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  };
}

/** The room's rectangle on the plan, or null when the room is not on a plan. */
export function roomRect(room: Pick<Room, 'plan'> | null | undefined): RoomPlanRect | null {
  const p = room?.plan;
  if (!p) return null;
  const ok = [p.x, p.y, p.w, p.h].every(Number.isFinite) && p.w > 0 && p.h > 0;
  return ok ? p : null;
}

/** The first room on the plan that contains the point. */
export function roomAt<R extends Pick<Room, 'plan'>>(rooms: R[], x: number, y: number): R | undefined {
  return (rooms || []).find(r => {
    const rr = roomRect(r);
    return !!rr && contains(rr, x, y);
  });
}

/** A piece's footprint: width along its back, depth away from it. */
export interface Footprint { w: number; d: number }

/**
 * The axis-aligned box that holds a piece at a place. A piece at 0° or 180° is
 * width across and depth down; at 90° or 270° the two swap; anything else is the
 * box around the turned rectangle.
 */
export function pieceBox(fp: Footprint, at: Pick<PiecePlace, 'x' | 'y' | 'rot'>): Rect {
  const W = fp.w;
  const D = Math.max(fp.d, MIN_DEPTH_FT);
  const a = (at.rot || 0) * D2R;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hw = (W * c + D * s) / 2;
  const hh = (W * s + D * c) / 2;
  return { x: at.x - hw, y: at.y - hh, w: hw * 2, h: hh * 2 };
}

/** True when the box runs past the room's walls by more than drawing slack. */
export function pastWalls(box: Rect, room: Rect, slack = WALL_SLACK_FT): boolean {
  return box.x < room.x - slack || box.y < room.y - slack ||
    box.x + box.w > room.x + room.w + slack || box.y + box.h > room.y + room.h + slack;
}

/** A point in the piece's own frame (x along its back, y away from it) on the plan. */
export function localToPlan(at: Pick<PiecePlace, 'x' | 'y' | 'rot'>, lx: number, ly: number): Point {
  const a = (at.rot || 0) * D2R;
  return [at.x + lx * Math.cos(a) - ly * Math.sin(a), at.y + lx * Math.sin(a) + ly * Math.cos(a)];
}

/** Even-odd test: is the point inside the polygon? */
export function inPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export type Wall = 'top' | 'right' | 'bottom' | 'left';

/** The rotation that backs a piece onto each wall: its back to the wall, facing in. */
export const WALL_ROT: Record<Wall, number> = { top: 0, right: 90, bottom: 180, left: 270 };

/** The room's walls by distance from a point, nearest first. */
export function wallsByDistance(room: Rect, x: number, y: number): { wall: Wall; dist: number }[] {
  const out: { wall: Wall; dist: number }[] = [
    { wall: 'top', dist: y - room.y },
    { wall: 'right', dist: room.x + room.w - x },
    { wall: 'bottom', dist: room.y + room.h - y },
    { wall: 'left', dist: x - room.x },
  ];
  return out.sort((a, b) => a.dist - b.dist);
}

/** The bounding box of several rectangles, or null for none. */
export function boundsOf(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x0 = Math.min(...rects.map(r => r.x));
  const y0 = Math.min(...rects.map(r => r.y));
  const x1 = Math.max(...rects.map(r => r.x + r.w));
  const y1 = Math.max(...rects.map(r => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
