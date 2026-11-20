/*
  The client's plan as a clean plan: rooms that share their walls, with their
  doors and windows (owner, 20 Nov 2026: "a solid logic … even when a drawing
  is uploaded and/or a line drawing is uploaded").

  The AI reads the rooms, their printed sizes and a rough box for each. Taken
  as they come, the boxes overlap and leave gaps, and the line plan drawn from
  them is broken. So, from the drawing:

    1. the scale, from the rooms whose size is printed (scaleFromBoxes)
    2. each box's edges snapped onto the walls found in the drawing
       (lib/playground/walls: snapToWalls), when the walls were found
    3. tidied as a sketch is (lib/playground/sketch): edges within a foot of
       each other become one wall, overlaps removed; no rescaling, the scale is
       the drawing's
    4. every edge on the 3″ grid, shared edges together
    5. a room you walk through (a passage, a lobby, the living room) whose
       side has no wall in the drawing is grown across the empty floor to the
       next room: the AI often stops a passage short, which left a walled hole
    6. the gaps in each room's walls, from the drawing: a door where another
       room is on the other side (once, on the room it opens into), a window on
       an outside wall

  Without the drawing's walls (no mask) steps 2 and 5 are skipped and the
  tidy alone still gives rooms that share walls.

  Pure.
*/
import type { RoomOpening, RoomPlanRect } from '../../types';
import { scaleFromBoxes, type PlanBox } from './planSheet';
import { lineUp, removeOverlaps } from './sketch';
import { snapToWalls, gapsOf, sideCover, type Mask, type Side } from './walls';
import { roundTo3in, round2 } from './geometry';
import { classifyRoom } from '../takeoff';

/** Edges this close, in feet, are one wall: a 9″ wall's two faces and then some. */
export const DRAWING_TIDY_FT = 1;
/** How far a walk-through room may grow across empty floor to the next room, ft. */
export const GROW_FT = 8;
/** How far an edge may move to reach its wall, ft. */
export const SNAP_FT = 2;
/** A gap this wide is a door or a window; narrower is a crack, wider is an opening or a wall not found. */
export const OPENING_FT = { min: 1.75, max: 6.5 };

export interface DrawnRoom {
  /** The label on the plan, as the AI read it. */
  name: string;
  plan: RoomPlanRect;
  openings: RoomOpening[];
}

export interface PlanFromDrawing {
  ftPerPx: number;
  rooms: DrawnRoom[];
  /** Room edges moved onto a wall found in the drawing. */
  snapped: number;
  /** Edges lined up into shared walls by the tidy. */
  lined: number;
  overlaps: number;
}

const validBox = (b: PlanBox['box'] | undefined) =>
  !!b && [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0 && b.x >= -0.01 && b.y >= -0.01 && b.x + b.w <= 1.01 && b.y + b.h <= 1.01;

/** Rooms you walk through into others: a door between one of them and a room belongs to the room. */
const THROUGH = new Set(['passage', 'living', 'dining', 'foyer', 'lobby']);
const isThrough = (name: string) => THROUGH.has(String(classifyRoom(name))) || /passage|lobby|foyer|corridor|living|dining|hall/i.test(name);

/**
 * `ftPerPx` overrides the scale read from the printed sizes (a scale the
 * studio set by measuring a wall). `wallPx` is the drawing's wall thickness
 * in the mask's pixels (walls.wallThicknessPx).
 */
export function planFromDrawing(boxes: PlanBox[], imagePx: { w: number; h: number }, mask?: Mask | null, wallPx = 0, ftPerPx?: number | null): PlanFromDrawing | null {
  const k = Number(ftPerPx) > 0 ? Number(ftPerPx) : scaleFromBoxes(boxes, imagePx);
  if (!k) return null;
  const valid = boxes.filter(b => validBox(b.box));

  // 2. Onto the walls, in pixels.
  let snapped = 0;
  const px = valid.map(b => {
    const r = { x: Math.max(0, b.box.x) * imagePx.w, y: Math.max(0, b.box.y) * imagePx.h, w: b.box.w * imagePx.w, h: b.box.h * imagePx.h };
    if (!mask) return r;
    // The mask may be read at another size than the image the boxes are fractions of.
    const sx = mask.w / imagePx.w, sy = mask.h / imagePx.h;
    const s = snapToWalls({ x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy }, mask, (SNAP_FT / k) * sx);
    snapped += s.snapped;
    return { x: s.x / sx, y: s.y / sy, w: s.w / sx, h: s.h / sy };
  });

  // 3. In feet, tidied: shared walls, no overlaps.
  const ft = px.map(r => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }));
  const lined = lineUp(ft, 'x', DRAWING_TIDY_FT) + lineUp(ft, 'y', DRAWING_TIDY_FT);
  let overlaps = 0;
  for (let pass = 0; pass < 12; pass++) {
    const n = removeOverlaps(ft);
    overlaps += n;
    if (!n) break;
  }

  // 4. On the 3″ grid, each edge rounded once so shared edges stay shared.
  const rects: RoomPlanRect[] = ft.map(r => {
    const L = roundTo3in(r.x), T = roundTo3in(r.y), R = roundTo3in(r.x + r.w), B = roundTo3in(r.y + r.h);
    return { x: L, y: T, w: round2(Math.max(0.25, R - L)), h: round2(Math.max(0.25, B - T)) };
  });

  // 5. A walk-through room grown across empty floor where its side has no wall.
  if (mask) {
    const sx = mask.w / imagePx.w, sy = mask.h / imagePx.h;
    const band = Math.max(2, Math.round(wallPx / 2) + 1);
    const toMask = (r: RoomPlanRect) => ({ x: (r.x / k) * sx, y: (r.y / k) * sy, w: (r.w / k) * sx, h: (r.h / k) * sy });
    rects.forEach((r, i) => {
      if (!isThrough(valid[i].name)) return;
      (['left', 'right', 'top', 'bottom'] as Side[]).forEach(side => {
        if (sideCover(toMask(r), side, mask, band) >= 0.2) return;
        const to = growLimit(r, side, rects.filter((_, j) => j !== i));
        if (to === null) return;
        if (side === 'left') { const end = r.x + r.w; r.x = to; r.w = round2(end - to); }
        else if (side === 'right') r.w = round2(to - r.x);
        else if (side === 'top') { const end = r.y + r.h; r.y = to; r.h = round2(end - to); }
        else r.h = round2(to - r.y);
      });
    });
  }

  // 6. Doors and windows, from the gaps in the drawing's walls.
  const openings: RoomOpening[][] = rects.map(() => []);
  if (mask) {
    const sx = mask.w / imagePx.w, sy = mask.h / imagePx.h;
    const toMask = (r: RoomPlanRect) => ({ x: (r.x / k) * sx, y: (r.y / k) * sy, w: (r.w / k) * sx, h: (r.h / k) * sy });
    const band = Math.max(2, Math.round(wallPx / 2) + 1);
    const ftPerMaskPx = k / sx;
    const doorsSeen: { line: number; vertical: boolean; from: number; to: number }[] = [];
    rects.forEach((r, i) => {
      gapsOf(toMask(r), mask, band, OPENING_FT.min / ftPerMaskPx, OPENING_FT.max / ftPerMaskPx).forEach(g => {
        const at = round2(g.from * ftPerMaskPx), w = round2((g.to - g.from) * ftPerMaskPx);
        const vertical = g.side === 'left' || g.side === 'right';
        const line = g.side === 'left' ? r.x : g.side === 'right' ? r.x + r.w : g.side === 'top' ? r.y : r.y + r.h;
        const start = (vertical ? r.y : r.x) + at, end = start + w;
        // Another room across this wall, over the gap: a door between them.
        const across = rects.findIndex((o, j) => j !== i && sharesSpan(o, g.side, line, start, end));
        if (across < 0) { openings[i].push({ kind: 'window', side: g.side, at, w }); return; }
        if (doorsSeen.some(d => d.vertical === vertical && Math.abs(d.line - line) < 0.5 && d.from < end && start < d.to)) return;
        doorsSeen.push({ line, vertical, from: start, to: end });
        // It opens into the room, not into the passage it is reached from.
        const into = isThrough(valid[i].name) && !isThrough(valid[across].name) ? across : i;
        const o = rects[into];
        const side = into === i ? g.side : OPPOSITE[g.side];
        const along = (side === 'left' || side === 'right' ? o.y : o.x);
        openings[into].push({ kind: 'door', side, at: round2(start - along), w });
      });
    });
  }

  return {
    ftPerPx: k,
    rooms: valid.map((b, i) => ({ name: String(b.name || 'Room').trim() || 'Room', plan: rects[i], openings: openings[i] })),
    snapped, lined, overlaps,
  };
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** Whether room `o` has a side on the same wall line, facing, and covering [from, to] there. */
function sharesSpan(o: RoomPlanRect, side: Side, line: number, from: number, to: number): boolean {
  const near = (v: number) => Math.abs(v - line) < 0.6;
  const mid = (from + to) / 2;
  switch (side) {
    case 'top': return near(o.y + o.h) && o.x < mid && mid < o.x + o.w;
    case 'bottom': return near(o.y) && o.x < mid && mid < o.x + o.w;
    case 'left': return near(o.x + o.w) && o.y < mid && mid < o.y + o.h;
    case 'right': return near(o.x) && o.y < mid && mid < o.y + o.h;
  }
}

/**
 * Where a side of room `r` can grow to: the nearest facing edge of a room
 * beside it, within GROW_FT, the strip between them clear of every room. Null
 * when nothing is near (that side is the flat's outside) or the strip is not clear.
 */
function growLimit(r: RoomPlanRect, side: Side, others: RoomPlanRect[]): number | null {
  const horiz = side === 'left' || side === 'right';
  const lo = horiz ? r.y : r.x, hi = horiz ? r.y + r.h : r.x + r.w;
  const across = (o: RoomPlanRect) => (horiz ? o.y < hi - 0.25 && lo + 0.25 < o.y + o.h : o.x < hi - 0.25 && lo + 0.25 < o.x + o.w);
  let best: number | null = null;
  others.filter(across).forEach(o => {
    const face = side === 'left' ? o.x + o.w : side === 'right' ? o.x : side === 'top' ? o.y + o.h : o.y;
    const gap = side === 'left' || side === 'top' ? (horiz ? r.x : r.y) - face : face - (horiz ? r.x + r.w : r.y + r.h);
    if (gap < 0.25 || gap > GROW_FT) return;
    if (best === null || (side === 'left' || side === 'top' ? face > best : face < best)) best = face;
  });
  if (best === null) return null;
  const strip: RoomPlanRect = side === 'left' ? { x: best, y: r.y, w: r.x - best, h: r.h }
    : side === 'right' ? { x: r.x + r.w, y: r.y, w: best - (r.x + r.w), h: r.h }
    : side === 'top' ? { x: r.x, y: best, w: r.w, h: r.y - best }
    : { x: r.x, y: r.y + r.h, w: r.w, h: best - (r.y + r.h) };
  const clear = others.every(o => !(o.x < strip.x + strip.w - 0.05 && strip.x + 0.05 < o.x + o.w && o.y < strip.y + strip.h - 0.05 && strip.y + 0.05 < o.y + o.h));
  return clear ? best : null;
}
