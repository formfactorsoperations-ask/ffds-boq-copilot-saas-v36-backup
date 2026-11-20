/**
 * BOQ Playground PR 5 — no plan yet: sketch a rough plan and tidy it.
 *
 * The designer drags rough boxes for the rooms and names them. Tidy turns the
 * sketch into a plan in one step:
 *
 *   1. edges within 1′6″ of each other are lined up, so rooms share walls
 *   2. overlaps are removed: the smaller room gives way along its shorter cut
 *      (a room drawn wholly inside another cuts the larger one instead)
 *   3. the whole is scaled so the rooms add up to the brief's carpet area
 *   4. every edge is rounded to 3″ (shared edges round together, so walls stay
 *      shared), the scale nudged so the total stays within 1% of the carpet area
 *
 * Tidy cannot know a room drawn far off its real size: the designer checks the
 * tidied plan, and site measurement replaces it later.
 *
 * Applying a new plan (a tidied sketch, or a quick build) goes through
 * `withNewPlan`: rooms matched by name, pieces move with their room, the old
 * plan kept in history, a signed option's lines left as they are.
 *
 * Pure.
 */
import type { Item, PlanSheet, PlanHistoryEntry, ProjectContext, ProposalTier, Room, RoomPlanRect } from '../../types';
import type { RoomKind } from '../takeoff';
import { roundTo3in, round2 } from './geometry';
import { replacePlan, withHistory } from './planSheet';

export interface SketchRoom {
  id: string;
  /** Empty until the designer names it. */
  name: string;
  /** Set when the room was named from a kind ("Kids room" is a bedroom). */
  kind?: RoomKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TidyResult {
  rooms: SketchRoom[];
  /** What Tidy did, in words, one per step. */
  notes: string[];
  /** Edges moved to line up with a neighbour. */
  lined: number;
  /** Overlaps removed. */
  overlaps: number;
  /** The scale the sketch was multiplied by. */
  factor: number;
  /** The tidied rooms' area, sq ft. */
  area: number;
}

/** Edges this close are taken to be one wall. */
export const TIDY_TOLERANCE_FT = 1.5;
/** The smallest box worth calling a room, each way, ft. */
export const MIN_SKETCH_FT = 2;

/** The kinds a sketched box is named from (the mockup's chips), and what each is as a room. */
export const SKETCH_KINDS: { name: string; kind: RoomKind }[] = [
  { name: 'Living', kind: 'living' },
  { name: 'Dining', kind: 'dining' },
  { name: 'Kitchen', kind: 'kitchen' },
  { name: 'Bedroom', kind: 'bedroom' },
  { name: 'Bathroom', kind: 'toilet' },
  { name: 'Kids room', kind: 'bedroom' },
  { name: 'Store', kind: 'utility' },
  { name: 'Balcony', kind: 'balcony' },
  { name: 'Passage', kind: 'passage' },
];

/** The name a box takes from a kind: "Bedroom", then "Bedroom 2", "Bedroom 3". */
export function sketchName(kind: string, rooms: Pick<SketchRoom, 'id' | 'name'>[], self?: string): string {
  const same = rooms.filter(r => r.id !== self && r.name && r.name.replace(/ \d+$/, '') === kind).length;
  return same ? `${kind} ${same + 1}` : kind;
}

const areaOf = (rs: Pick<SketchRoom, 'w' | 'h'>[]) => rs.reduce((a, r) => a + r.w * r.h, 0);

/** Every edge within the tolerance of another moved to their mean: one wall. Exported for the plan read off a drawing (planFromDrawing). */
export function lineUp(out: Pick<SketchRoom, 'x' | 'y' | 'w' | 'h'>[], axis: 'x' | 'y', tolerance = TIDY_TOLERANCE_FT): number {
  const size = axis === 'x' ? 'w' : 'h';
  const vals: { v: number; i: number; far: boolean }[] = [];
  out.forEach((r, i) => { vals.push({ v: r[axis], i, far: false }, { v: r[axis] + r[size], i, far: true }); });
  vals.sort((a, b) => a.v - b.v);
  let moved = 0;
  let group: typeof vals = [];
  const flush = () => {
    if (!group.length) return;
    const m = group.reduce((a, x) => a + x.v, 0) / group.length;
    group.forEach(x => {
      if (Math.abs(x.v - m) > 0.05) moved++;
      const r = out[x.i];
      if (x.far) r[size] = m - r[axis];
      else { const end = r[axis] + r[size]; r[axis] = m; r[size] = end - m; }
    });
    group = [];
  };
  vals.forEach(x => { if (group.length && x.v - group[0].v > tolerance) flush(); group.push(x); });
  flush();
  return moved;
}

/** One pass of overlap removal; the number removed. Exported for planFromDrawing. */
export function removeOverlaps(out: Pick<SketchRoom, 'x' | 'y' | 'w' | 'h'>[]): number {
  let n = 0;
  for (let a = 0; a < out.length; a++) {
    for (let b = a + 1; b < out.length; b++) {
      const A = out[a], B = out[b];
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (!(ox > 0.05 && oy > 0.05)) continue;
      n++;
      const small = A.w * A.h <= B.w * B.h ? A : B;
      const big = small === A ? B : A;
      const inside = ox >= small.w - 0.05 && oy >= small.h - 0.05;
      if (inside) {
        // A room drawn inside another (a bath in a bedroom's corner): the larger one is cut at the smaller one's far side, on the side that loses least.
        const cuts = [
          { side: 'left', keep: big.x + big.w - (small.x + small.w), lose: (small.x + small.w - big.x) * big.h },
          { side: 'right', keep: small.x - big.x, lose: (big.x + big.w - small.x) * big.h },
          { side: 'top', keep: big.y + big.h - (small.y + small.h), lose: (small.y + small.h - big.y) * big.w },
          { side: 'bottom', keep: small.y - big.y, lose: (big.y + big.h - small.y) * big.w },
        ].filter(c => c.keep >= MIN_SKETCH_FT).sort((p, q) => p.lose - q.lose);
        const c = cuts[0];
        if (!c) continue;
        if (c.side === 'left') { const end = big.x + big.w; big.x = small.x + small.w; big.w = end - big.x; }
        else if (c.side === 'right') big.w = small.x - big.x;
        else if (c.side === 'top') { const end = big.y + big.h; big.y = small.y + small.h; big.h = end - big.y; }
        else big.h = small.y - big.y;
        continue;
      }
      if (ox < oy) {
        if (small.x < big.x) small.w -= ox; else { small.x += ox; small.w -= ox; }
      } else if (small.y < big.y) small.h -= oy; else { small.y += oy; small.h -= oy; }
    }
  }
  return n;
}

/** The rooms scaled by k about the sketch's corner, every edge on the 3″ grid. */
function scaled(rs: SketchRoom[], k: number): SketchRoom[] {
  const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y));
  return rs.map(r => {
    const L = roundTo3in((r.x - x0) * k), T = roundTo3in((r.y - y0) * k);
    const R = roundTo3in((r.x + r.w - x0) * k), B = roundTo3in((r.y + r.h - y0) * k);
    return { ...r, x: L, y: T, w: round2(Math.max(0.25, R - L)), h: round2(Math.max(0.25, B - T)) };
  });
}

/** The sketch tidied into a plan of `carpet` sq ft. */
export function tidySketch(rooms: SketchRoom[], carpet: number): TidyResult {
  const out = rooms.filter(r => r.w > 0 && r.h > 0).map(r => ({ ...r }));
  if (!out.length) return { rooms: [], notes: [], lined: 0, overlaps: 0, factor: 1, area: 0 };
  const lined = lineUp(out, 'x') + lineUp(out, 'y');
  let overlaps = 0;
  for (let pass = 0; pass < 12; pass++) {
    const n = removeOverlaps(out);
    overlaps += n;
    if (!n) break;
  }
  const target = Number(carpet) > 0 ? Number(carpet) : areaOf(out);
  const k0 = Math.sqrt(target / Math.max(areaOf(out), 0.01));
  // Rounding to 3″ moves the total a little: of the scales near k0, take the one closest to the carpet area.
  let best = scaled(out, k0), bestK = k0, bestErr = Math.abs(areaOf(best) - target);
  for (let i = -40; i <= 40 && bestErr > 0.25; i++) {
    const k = k0 * (1 + i * 0.0025);
    const rs = scaled(out, k);
    const err = Math.abs(areaOf(rs) - target);
    if (err < bestErr) { best = rs; bestK = k; bestErr = err; }
  }
  const area = round2(areaOf(best));
  return {
    rooms: best,
    lined,
    overlaps,
    factor: bestK,
    area,
    notes: [
      `${lined} edges lined up, so rooms share their walls`,
      overlaps ? `${overlaps} overlap${overlaps > 1 ? 's' : ''} removed` : 'No overlaps to remove',
      `Scaled ×${bestK.toFixed(2)} so the rooms add up to ${Math.round(target).toLocaleString('en-IN')} sq ft, the carpet area in the brief`,
      'Every size rounded to 3″',
    ],
  };
}

/** A tidied sketch as plan rectangles, unnamed boxes named "Room", "Room 2". */
export function sketchRects(rooms: SketchRoom[]): { name: string; kind?: RoomKind; plan: RoomPlanRect }[] {
  const named: SketchRoom[] = [];
  rooms.forEach(r => { named.push(r.name ? r : { ...r, name: sketchName('Room', named) }); });
  return named.map(r => ({ name: r.name, ...(r.kind ? { kind: r.kind } : {}), plan: { x: r.x, y: r.y, w: r.w, h: r.h } }));
}

/** The project's rooms as a sketch to start from: where they are on the plan, else none. */
export function sketchFromRooms(rooms: Room[]): SketchRoom[] {
  return rooms.filter(r => r.plan).map((r, i) => ({ id: `r${i + 1}`, name: r.name, ...(r.kind ? { kind: r.kind } : {}), ...r.plan! }));
}

/* ─────────────────────────── a new plan, applied ─────────────────────────── */

/** Replaces each named room with its updated copy and appends the new ones. */
export function mergeRooms(all: Room[], next: Room[]): Room[] {
  const byName = new Map(next.map(r => [r.name, r]));
  const out = all.map(r => byName.get(r.name) || r);
  next.forEach(r => { if (!all.some(a => a.name === r.name)) out.push(r); });
  return out;
}

export interface NewPlan {
  /** The project's rooms after (scope buckets and rooms off the plan kept). */
  rooms: Room[];
  planSheet: PlanSheet;
  planHistory?: PlanHistoryEntry[];
  /** Each option's BOQ, pieces moved with their rooms; a signed option untouched. */
  tiers: ProposalTier[];
  /** Pieces that no longer fit, now waiting under Needs a place (on the active option). */
  needsPlace: number;
  added: string[];
  missing: string[];
}

/**
 * The project on a new plan (a tidied sketch or a quick build): rooms matched
 * by name take their rectangles, pieces move with their room, a piece that no
 * longer fits waits under Needs a place, and the plan it replaces is kept in
 * history. The signed option's lines are never moved.
 */
export function withNewPlan(args: {
  ctx: Pick<ProjectContext, 'rooms' | 'planSheet' | 'planHistory'>;
  tiers: ProposalTier[];
  activeTierId?: string;
  lockedTierId?: string | null;
  bankMap: Map<string, Item>;
  rects: { name: string; kind?: RoomKind; plan: RoomPlanRect }[];
  sheet: PlanSheet;
  at: number;
  by?: string;
}): NewPlan {
  const { ctx, tiers, activeTierId, lockedTierId, bankMap, rects, sheet, at, by } = args;
  const all = ctx.rooms || [];
  const rooms = all.filter(r => r?.name && !/^(functional|others|general|whole flat)$/i.test(r.name.trim()));
  const hadPlan = !!ctx.planSheet || rooms.some(r => r.plan);
  let needsPlace = 0;
  const nextTiers = tiers.map(t => {
    if (t.id === lockedTierId) return t;
    const r = replacePlan({ rooms, boq: t.boq || [], bankMap, oldSheet: ctx.planSheet, rects, at, by });
    if (t.id === activeTierId) needsPlace = r.needsPlace.length;
    return r.boq === t.boq ? t : { ...t, boq: r.boq };
  });
  const r = replacePlan({ rooms, boq: [], bankMap, oldSheet: ctx.planSheet, rects, at, by });
  const kinds = new Map(rects.filter(x => x.kind).map(x => [x.name, x.kind!]));
  const placed = r.rooms.map(x => (r.added.includes(x.name) && kinds.has(x.name) ? { ...x, kind: kinds.get(x.name) } : x));
  return {
    rooms: mergeRooms(all, placed),
    planSheet: sheet,
    ...(hadPlan ? { planHistory: withHistory(ctx.planHistory, r.history) } : ctx.planHistory ? { planHistory: ctx.planHistory } : {}),
    tiers: nextTiers,
    needsPlace,
    added: r.added,
    missing: r.missing,
  };
}

/** True when the box is big enough to be a room. */
export const bigEnough = (w: number, h: number) => w >= MIN_SKETCH_FT && h >= MIN_SKETCH_FT;

