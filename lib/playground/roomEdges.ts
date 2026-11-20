/**
 * BOQ Playground PR 5 — room sizes by handle.
 *
 * Pulling one wall of a room on the plan moves that wall: the room takes its
 * new size (and with it every measured line: painting, ceilings, floors), the
 * room on the other side of a shared wall gives or takes the same, so walls
 * stay shared, and the pieces standing against the wall move with it. A room
 * whose wall runs on past this one (a living room beside a kitchen and a
 * bedroom) stays put, and the wall cannot be pulled into it, so no gap or
 * overlap opens elsewhere. A room never goes under 3 ft a side. Typed
 * quantities do not move.
 *
 * Pure.
 */
import type { BoqItem, Item, Room } from '../../types';
import { roundTo3in, round2, pieceBox } from './geometry';
import { drawOf, footprintOf, pieceSize, pieceItemOf } from './pieces';
import { withRect } from './planSheet';

export type RoomEdge = 'left' | 'right' | 'top' | 'bottom';
/** The smallest a room is pulled to, each way, ft. */
export const MIN_ROOM_FT = 3;
const NEAR = 0.05;
/** A piece this close to the wall moves with it, ft. */
const HUG_FT = 0.5;

const OPPOSITE: Record<RoomEdge, RoomEdge> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
const horiz = (e: RoomEdge) => e === 'left' || e === 'right';

/** Where an edge of a rectangle is: x for left/right, y for top/bottom. */
export function edgeAt(p: { x: number; y: number; w: number; h: number }, e: RoomEdge): number {
  return e === 'left' ? p.x : e === 'right' ? p.x + p.w : e === 'top' ? p.y : p.y + p.h;
}

/** The rectangle with one edge moved to `to`. */
function moved(p: { x: number; y: number; w: number; h: number }, e: RoomEdge, to: number) {
  if (e === 'left') return { ...p, x: to, w: round2(p.x + p.w - to) };
  if (e === 'right') return { ...p, w: round2(to - p.x) };
  if (e === 'top') return { ...p, y: to, h: round2(p.y + p.h - to) };
  return { ...p, h: round2(to - p.y) };
}

export interface RoomResize {
  rooms: Room[];
  boq: BoqItem[];
  /** The rooms whose size changed: the pulled one first, then its neighbours. */
  changed: string[];
}

/**
 * The plan with one wall of a room pulled to `to` (ft, on the 3″ grid). Null
 * when the room is not on the plan or the wall does not move.
 */
export function resizeRoom(args: {
  rooms: Room[];
  boq: BoqItem[];
  bankMap: Map<string, Item>;
  name: string;
  edge: RoomEdge;
  to: number;
}): RoomResize | null {
  const { rooms, boq, bankMap, name, edge } = args;
  const room = rooms.find(r => r.name === name);
  const p = room?.plan;
  if (!p) return null;
  const from = edgeAt(p, edge);
  const opp = OPPOSITE[edge];
  // The rooms across the wall: their opposite edge on it, and some of the wall in common.
  const span = (q: typeof p) => (horiz(edge) ? [q.y, q.y + q.h] : [q.x, q.x + q.w]);
  const [a0, a1] = span(p);
  const across = rooms.filter(r => r.name !== name && r.plan && Math.abs(edgeAt(r.plan, opp) - from) < NEAR && (() => {
    const [b0, b1] = span(r.plan!);
    return Math.min(a1, b1) - Math.max(a0, b0) > NEAR;
  })());
  // A room whose whole wall is this one moves with it; one whose wall runs on past it stays, and the wall cannot be pulled into it.
  const inside = (r: Room) => { const [b0, b1] = span(r.plan!); return b0 >= a0 - NEAR && b1 <= a1 + NEAR; };
  const followers = across.filter(inside);
  const blockers = across.filter(r => !inside(r));
  // How far the wall may go: every room it touches keeps 3 ft.
  let lo = -Infinity, hi = Infinity;
  if (blockers.length) { if (edge === 'left' || edge === 'top') lo = from; else hi = from; }
  const limit = (q: typeof p, e: RoomEdge) => {
    if (e === 'left') hi = Math.min(hi, q.x + q.w - MIN_ROOM_FT);
    if (e === 'right') lo = Math.max(lo, q.x + MIN_ROOM_FT);
    if (e === 'top') hi = Math.min(hi, q.y + q.h - MIN_ROOM_FT);
    if (e === 'bottom') lo = Math.max(lo, q.y + MIN_ROOM_FT);
  };
  limit(p, edge);
  followers.forEach(r => limit(r.plan!, opp));
  const to = roundTo3in(Math.max(lo, Math.min(hi, args.to)));
  if (Math.abs(to - from) < 0.01) return null;
  const delta = to - from;

  const changes = new Map<string, RoomEdge>([[name, edge], ...followers.map(r => [r.name, opp] as [string, RoomEdge])]);
  const nextRooms = rooms.map(r => {
    const e = changes.get(r.name);
    return e && r.plan ? withRect(r, moved(r.plan, e, to)) : r;
  });

  // Pieces standing against the wall move with it.
  const nextBoq = boq.map(l => {
    const e = l.roomId ? changes.get(l.roomId) : undefined;
    if (!e || !l.place) return l;
    const item = pieceItemOf(l, bankMap);
    const draw = drawOf(item);
    if (!draw) return l;
    const box = pieceBox(footprintOf(pieceSize(l, item, draw)), l.place);
    if (Math.abs(edgeAt(box, e) - from) > HUG_FT) return l;
    return { ...l, place: { ...l.place, x: round2(l.place.x + (horiz(e) ? delta : 0)), y: round2(l.place.y + (horiz(e) ? 0 : delta)) } };
  });
  return { rooms: nextRooms, boq: nextBoq, changed: [...changes.keys()] };
}
