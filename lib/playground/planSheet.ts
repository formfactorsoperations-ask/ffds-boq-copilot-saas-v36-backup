/**
 * BOQ Playground — the plan under the BOQ.
 *
 * A plan comes from one of three places: the plan the client gave with the
 * brief (the project's floor plan, page 1 if it is a PDF), one uploaded here, or
 * blocks — the rooms laid out from their sizes when there is no drawing at all.
 *
 * An image is in pixels; the BOQ is in feet. `ftPerPx` turns one into the other,
 * set by measuring one wall the studio knows ("this wall is 12′"). Every pixel
 * position is in the image's natural size, so zooming the screen never moves a
 * room. Rooms are rectangles in feet from the plan's top-left (Room.plan).
 *
 * Rooms get onto the plan by being read (`analyze-floorplan` returns a box for
 * each room as a share of the image) or traced (dragged by hand). A plan can be
 * replaced later: rooms are matched by name, pieces move with their room, each
 * room's price change is shown first, and the old plan goes into history.
 *
 * Pure: no screen, no Firestore.
 */
import type { Room, RoomPlanRect, PlanSheet, PlanHistoryEntry, BoqItem, Item, PricingRules } from '../../types';
import { classifyRoom } from '../takeoff';
import { roundTo3in, round2, pieceBox, pastWalls, type Point } from './geometry';
import { drawOf, pieceSize, footprintOf } from './pieces';
import { playgroundTotals } from './pricing';

/* ───────────────────────────── scale ───────────────────────────── */

const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Feet per pixel from one measured wall, or null when the points are on top of each other or the length is not positive. */
export function scaleFromTwoPoints(a: Point, b: Point, feet: number): number | null {
  const d = dist(a, b);
  if (!(d > 2) || !(feet > 0)) return null;
  return feet / d;
}

/** The sheet with its scale set from a measured wall. */
export function withScale(sheet: PlanSheet, a: Point, b: Point, feet: number): PlanSheet | null {
  const k = scaleFromTwoPoints(a, b, feet);
  if (k == null) return null;
  return { ...sheet, ftPerPx: k, calibration: { a, b, feet } };
}

const originOf = (s: PlanSheet) => s.origin || { x: 0, y: 0 };

/** An image pixel as feet on the plan, or null before the scale is set. */
export function pxToFt(sheet: PlanSheet, p: Point): Point | null {
  if (!(Number(sheet.ftPerPx) > 0)) return null;
  const o = originOf(sheet);
  return [(p[0] - o.x) * sheet.ftPerPx!, (p[1] - o.y) * sheet.ftPerPx!];
}

/** A point in feet as an image pixel, or null before the scale is set. */
export function ftToPx(sheet: PlanSheet, p: Point): Point | null {
  if (!(Number(sheet.ftPerPx) > 0)) return null;
  const o = originOf(sheet);
  return [p[0] / sheet.ftPerPx! + o.x, p[1] / sheet.ftPerPx! + o.y];
}

/** A room's rectangle in image pixels, for drawing it over the plan. */
export function rectToPx(sheet: PlanSheet, r: RoomPlanRect): { x: number; y: number; w: number; h: number } | null {
  const tl = ftToPx(sheet, [r.x, r.y]);
  if (!tl) return null;
  return { x: tl[0], y: tl[1], w: r.w / sheet.ftPerPx!, h: r.h / sheet.ftPerPx! };
}

/** A rectangle dragged on the image, in feet, rounded to 3″. Null before the scale is set, or for a drag too small to be a room. */
export function traceRect(sheet: PlanSheet, p1: Point, p2: Point): RoomPlanRect | null {
  const a = pxToFt(sheet, p1);
  const b = pxToFt(sheet, p2);
  if (!a || !b) return null;
  const x = roundTo3in(Math.min(a[0], b[0]));
  const y = roundTo3in(Math.min(a[1], b[1]));
  const w = roundTo3in(Math.abs(b[0] - a[0]));
  const h = roundTo3in(Math.abs(b[1] - a[1]));
  return w >= 1 && h >= 1 ? { x, y, w, h } : null;
}

/**
 * Setting the scale again moves no room on the drawing: each traced rectangle
 * keeps its pixels and is re-measured in feet at the new scale.
 */
export function rescaleRooms<R extends Pick<Room, 'plan'>>(rooms: R[], before: PlanSheet, after: PlanSheet): R[] {
  if (!(Number(before.ftPerPx) > 0) || !(Number(after.ftPerPx) > 0)) return rooms;
  return rooms.map(r => {
    if (!r.plan) return r;
    const px = rectToPx(before, r.plan)!;
    const tl = pxToFt(after, [px.x, px.y])!;
    return {
      ...r,
      plan: {
        x: roundTo3in(tl[0]), y: roundTo3in(tl[1]),
        w: roundTo3in(px.w * after.ftPerPx!), h: roundTo3in(px.h * after.ftPerPx!),
      },
    };
  });
}

/* ─────────────────────── rooms read off the plan ─────────────────────── */

/** One room as analyze-floorplan reads it: its box as a share of the image (0–1), and its printed size. */
export interface PlanBox {
  name: string;
  box: { x: number; y: number; w: number; h: number };
  lengthFt?: number;
  widthFt?: number;
  dimensionPrinted?: boolean;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const validBox = (b: PlanBox['box'] | undefined) =>
  !!b && [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0 && b.x >= -0.01 && b.y >= -0.01 && b.x + b.w <= 1.01 && b.y + b.h <= 1.01;

/**
 * The plan's scale from the rooms whose size is printed: each one's long side
 * against its box's long side, and short against short; the median of them, so
 * one misread room does not set the scale. Null when no room has a printed size.
 */
export function scaleFromBoxes(boxes: PlanBox[], imagePx: { w: number; h: number }): number | null {
  const ks: number[] = [];
  boxes.forEach(b => {
    if (!validBox(b.box) || !b.dimensionPrinted) return;
    const L = Number(b.lengthFt), W = Number(b.widthFt);
    if (!(L > 0 && W > 0)) return;
    const bw = b.box.w * imagePx.w, bh = b.box.h * imagePx.h;
    ks.push((Math.max(L, W) / Math.max(bw, bh) + Math.min(L, W) / Math.min(bw, bh)) / 2);
  });
  return median(ks);
}

/** Each box as a rectangle in feet on the plan, rounded to 3″. Boxes the model returned out of the image are dropped. */
export function rectsFromBoxes(boxes: PlanBox[], imagePx: { w: number; h: number }, ftPerPx: number): { name: string; plan: RoomPlanRect }[] {
  return boxes.filter(b => validBox(b.box)).map(b => ({
    name: String(b.name || 'Room').trim() || 'Room',
    plan: {
      x: roundTo3in(Math.max(0, b.box.x) * imagePx.w * ftPerPx),
      y: roundTo3in(Math.max(0, b.box.y) * imagePx.h * ftPerPx),
      w: roundTo3in(b.box.w * imagePx.w * ftPerPx),
      h: roundTo3in(b.box.h * imagePx.h * ftPerPx),
    },
  })).filter(r => r.plan.w >= 1 && r.plan.h >= 1);
}

/* ─────────────────────────── matching rooms ─────────────────────────── */

/** A room's name reduced to what identifies it: "Master Bed Rm." and "master bedroom" are the same room. */
export function roomKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\brm\b\.?/g, 'room')
    .replace(/\bbed\b(?!\s*room)/g, 'bedroom')
    .replace(/\b(toilet|wc|washroom)\b/g, 'bathroom')
    .replace(/\bbath\b(?!\s*room)/g, 'bathroom')
    .replace(/\bbed\s+room\b/g, 'bedroom')
    .replace(/\bbath\s+room\b/g, 'bathroom')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Which room on the new list each existing room is. By name first; then, for
 * what is left, by kind in order (the second bedroom left over is the second
 * bedroom on the new plan). Returns existing name → new name.
 */
export function matchRooms(existing: string[], incoming: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  const keyed = new Map<string, string[]>();
  incoming.forEach(n => { const k = roomKey(n); keyed.set(k, [...(keyed.get(k) || []), n]); });
  existing.forEach(n => {
    const cands = (keyed.get(roomKey(n)) || []).filter(c => !taken.has(c));
    if (cands.length) { out.set(n, cands[0]); taken.add(cands[0]); }
  });
  const leftOld = existing.filter(n => !out.has(n));
  const leftNew = incoming.filter(n => !taken.has(n));
  const byKind = (names: string[]) => {
    const m = new Map<string, string[]>();
    names.forEach(n => { const k = classifyRoom(n); m.set(k, [...(m.get(k) || []), n]); });
    return m;
  };
  const newByKind = byKind(leftNew);
  byKind(leftOld).forEach((olds, kind) => {
    if (kind === 'other') return;
    const news = newByKind.get(kind) || [];
    olds.forEach((o, i) => { if (news[i]) out.set(o, news[i]); });
  });
  return out;
}

export interface PlacedRooms<R> {
  rooms: R[];
  /** Rooms on the plan that the project did not have; added, empty. */
  added: string[];
  /** Project rooms the plan does not show; they keep no rectangle. */
  missing: string[];
}

/**
 * Puts rectangles on the project's rooms, matched by name. A rectangle with no
 * room is added as a room of that size; a room with no rectangle keeps its size
 * and stays off the plan.
 */
export function placeRooms(rooms: Room[], rects: { name: string; plan: RoomPlanRect }[]): PlacedRooms<Room> {
  const match = matchRooms(rooms.map(r => r.name), rects.map(r => r.name));
  const byName = new Map(rects.map(r => [r.name, r.plan]));
  const used = new Set<string>();
  const next = rooms.map(r => {
    const m = match.get(r.name);
    if (!m) return r;
    used.add(m);
    return withRect(r, byName.get(m)!);
  });
  const added: string[] = [];
  rects.forEach(rc => {
    if (used.has(rc.name)) return;
    const name = uniqueName(rc.name, next.map(r => r.name));
    added.push(name);
    next.push(withRect({ name, size: 0, unit: 'sq ft', kind: classifyRoom(rc.name) }, rc.plan));
  });
  const missing = rooms.filter(r => !match.has(r.name)).map(r => r.name);
  return { rooms: next, added, missing };
}

/** The room with its rectangle, its length, width and area following it. */
export function withRect(room: Room, plan: RoomPlanRect): Room {
  return {
    ...room,
    plan,
    length: round2(Math.max(plan.w, plan.h)),
    width: round2(Math.min(plan.w, plan.h)),
    size: round2(plan.w * plan.h),
    dimSource: room.dimSource === 'confirmed' ? 'confirmed' : 'calculated',
  };
}

function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  for (let i = 2; ; i++) if (!taken.includes(`${name} ${i}`)) return `${name} ${i}`;
}

/* ─────────────────────────── blocks: no drawing ─────────────────────────── */

/**
 * Lays the rooms out as blocks when there is no drawing: each at its own size
 * (length × width, or a 1.2 : 1 rectangle of its area), in rows about as wide
 * as a square of the flat, largest first, touching. A working plan to draw on,
 * not the flat's layout; the sketch and tidy route (PR 5) replaces it.
 */
export function blocksLayout(rooms: Room[]): Room[] {
  const sized = rooms.map((r, i) => {
    const L = Number(r.length) > 0 && Number(r.width) > 0 ? Number(r.length) : Math.sqrt(Math.max(0, Number(r.size) || 0) * 1.2);
    const W = Number(r.length) > 0 && Number(r.width) > 0 ? Number(r.width) : (Number(r.size) || 0) / Math.max(L, 0.01);
    return { i, w: roundTo3in(Math.max(L, W)), h: roundTo3in(Math.min(L, W)) };
  }).filter(s => s.w >= 1 && s.h >= 1);
  const total = sized.reduce((a, s) => a + s.w * s.h, 0);
  const rowW = Math.max(...sized.map(s => s.w), Math.sqrt(total) * 1.3);
  const order = [...sized].sort((a, b) => b.w * b.h - a.w * a.h);
  const rects = new Map<number, RoomPlanRect>();
  let x = 0, y = 0, rowH = 0;
  order.forEach(s => {
    if (x > 0 && x + s.w > rowW + 0.01) { x = 0; y += rowH; rowH = 0; }
    rects.set(s.i, { x: roundTo3in(x), y: roundTo3in(y), w: s.w, h: s.h });
    x += s.w; rowH = Math.max(rowH, s.h);
  });
  return rooms.map((r, i) => (rects.has(i) ? { ...r, plan: rects.get(i)! } : r));
}

/* ─────────────────────────── replacing the plan ─────────────────────────── */

export interface ReplanResult {
  rooms: Room[];
  boq: BoqItem[];
  /** Lines whose piece no longer fits its room: off the plan, waiting under Needs a place. */
  needsPlace: string[];
  added: string[];
  missing: string[];
  history: PlanHistoryEntry;
}

/**
 * The project on a new plan. Rooms are matched by name and take their new
 * rectangle; each piece moves with its room (keeping its offset from the
 * room's corner and its size); a piece that no longer fits leaves the plan and
 * waits under Needs a place. Lines and quantities are otherwise untouched.
 * The old plan, with where each room was on it, becomes a history entry.
 */
export function replacePlan(args: {
  rooms: Room[];
  boq: BoqItem[];
  bankMap: Map<string, Item>;
  oldSheet: PlanSheet | undefined;
  rects: { name: string; plan: RoomPlanRect }[];
  at: number;
  by?: string;
}): ReplanResult {
  const { rooms, boq, bankMap, oldSheet, rects, at, by } = args;
  const placed = placeRooms(rooms, rects);
  const before = new Map(rooms.map(r => [r.name, r.plan]));
  const after = new Map(placed.rooms.map(r => [r.name, r.plan]));
  const needsPlace: string[] = [];

  const nextBoq = boq.map(line => {
    if (!line.place || !line.roomId) return line;
    const was = before.get(line.roomId);
    const now = after.get(line.roomId);
    if (!was || !now || placed.missing.includes(line.roomId)) return line;
    const place = { ...line.place, x: round2(line.place.x - was.x + now.x), y: round2(line.place.y - was.y + now.y) };
    const item = bankMap.get(line.bankId);
    const draw = drawOf(item);
    if (draw) {
      const box = pieceBox(footprintOf(pieceSize(line, item, draw)), place);
      if (pastWalls(box, now)) {
        needsPlace.push(line.id);
        const { place: _off, ...rest } = line;
        return rest as BoqItem;
      }
    }
    return { ...line, place };
  });

  return {
    rooms: placed.rooms,
    boq: nextBoq,
    needsPlace,
    added: placed.added,
    missing: placed.missing,
    history: {
      sheet: oldSheet || { source: 'blocks' },
      rooms: rooms.map(r => ({ name: r.name, ...(r.plan ? { plan: r.plan } : {}) })),
      replacedAt: at,
      ...(by ? { by } : {}),
    },
  };
}

export interface ReplanRow {
  room: string;
  was: RoomPlanRect | undefined;
  now: RoomPlanRect | undefined;
  /** The room's work after minus before, in rupees. */
  change: number;
}

/**
 * Each room's price change before the new plan is applied. Measured lines
 * (painting, ceilings, electrical shared into rooms) follow the room's size;
 * lines with typed quantities do not move.
 */
export function replanPreview(args: {
  before: { rooms: Room[]; boq: BoqItem[] };
  after: { rooms: Room[]; boq: BoqItem[] };
  bankMap: Map<string, Item>;
  rules?: PricingRules | null;
}): { rows: ReplanRow[]; total: number } {
  const { before, after, bankMap, rules } = args;
  const was = playgroundTotals(before.boq, bankMap, { rules, rooms: before.rooms }).byRoom;
  const now = playgroundTotals(after.boq, bankMap, { rules, rooms: after.rooms }).byRoom;
  const names = Array.from(new Set([...before.rooms.map(r => r.name), ...after.rooms.map(r => r.name)]));
  const planOf = (rs: Room[], n: string) => rs.find(r => r.name === n)?.plan;
  const rows = names.map(room => ({
    room,
    was: planOf(before.rooms, room),
    now: planOf(after.rooms, room),
    change: (now.get(room) || 0) - (was.get(room) || 0),
  }));
  return { rows, total: rows.reduce((a, r) => a + r.change, 0) };
}

/** Keeps the newest few plans: history is for going back, not an archive. */
export const MAX_PLAN_HISTORY = 10;
export const withHistory = (history: PlanHistoryEntry[] | undefined, entry: PlanHistoryEntry) =>
  [entry, ...(history || [])].slice(0, MAX_PLAN_HISTORY);

/** The plan to show for a project: its plan sheet, else the brief's plan (the project's floor plan) unscaled, else none. */
export function sheetOf(ctx: { planSheet?: PlanSheet; floorplanImageUrl?: string; floorplanImage?: string }): PlanSheet | null {
  if (ctx.planSheet) return ctx.planSheet;
  if (ctx.floorplanImageUrl) return { source: 'brief', imageUrl: ctx.floorplanImageUrl, page: 1 };
  if (ctx.floorplanImage) return { source: 'brief', imageUrl: dataUrlOf(ctx.floorplanImage), page: 1 };
  return null;
}

/** A legacy inline plan (base64) as something an <img> or the PDF reader can open. */
export function dataUrlOf(base64: string): string {
  if (/^data:/.test(base64)) return base64;
  const type = base64.startsWith('JVBERi0') ? 'application/pdf' : base64.startsWith('iVBORw0KGgo') ? 'image/png' : 'image/jpeg';
  return `data:${type};base64,${base64}`;
}

/** True when the sheet's file is a PDF (a page of it is drawn), judged by its URL. */
export const isPdfSheet = (s: PlanSheet | null | undefined) =>
  !!s?.imageUrl && (/^data:application\/pdf/i.test(s.imageUrl) || /\.pdf(\?|#|$)/i.test(s.imageUrl));

/**
 * A wall length as typed, in feet: 12, 12.5, 12'6", 12′ 6″, 12 ft 6 in,
 * 3.6 m, 360 cm, 3600 mm. Null when it is not a length.
 */
export function parseFeet(text: string): number | null {
  const t = String(text || '').trim().toLowerCase().replace(/[′’]/g, "'").replace(/[″”]/g, '"');
  if (!t) return null;
  let m = t.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)$/);
  if (m) {
    const v = Number(m[1]);
    const ft = m[2] === 'mm' ? v / 304.8 : m[2] === 'cm' ? v / 30.48 : v * 3.28084;
    return ft > 0 ? round2(ft) : null;
  }
  m = t.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/);
  if (!m) return null;
  const ft = Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0);
  return ft > 0 ? round2(ft) : null;
}
