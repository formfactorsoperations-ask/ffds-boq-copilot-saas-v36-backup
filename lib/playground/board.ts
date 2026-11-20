/**
 * BOQ Playground — drawing on the plan (PR 3b).
 *
 * A piece on the plan is a BOQ line with a `place`. Everything here turns a
 * gesture into the line it writes, so the plan, the Rooms lens and the Sheet
 * are always the same BOQ:
 *
 *   dropping an item   a new line in the room it lands in, placed, sized at the
 *                      item's draw size, its quantity worked out from the size
 *   moving             `place` (and the room, when it crosses into another)
 *   resizing an edge   the size (calcLength / calcWidth, in feet) and the
 *                      quantity that follows, through lib/boqSize, exactly as a
 *                      size typed in the Sheet does; the far edge stays put
 *   turning, nudging   `place`
 *
 * Undo keeps the BOQ as it was before each gesture: one drag is one undo.
 * Pure: no screen.
 */
import type { Item, BoqItem, PieceDraw, PiecePlace } from '../../types';
import { drawOf, pieceSize, resizeUpdates, qtyFromPiece, newPlace, pieceItemOf } from './pieces';
import { localToPlan, normRot, roundTo3in, round2, type Point } from './geometry';

/** The new line for an item dropped on the plan. */
export function newPieceLine(item: Item, roomName: string | null, place: Pick<PiecePlace, 'x' | 'y' | 'rot'>, id: string): BoqItem | null {
  const draw = drawOf(item);
  if (!draw) return null;
  const base: BoqItem = {
    id,
    bankId: item.id,
    qty: 1,
    ...(roomName ? { roomId: roomName } : {}),
    baseRate: item.materials,
    place: { ...newPlace(draw, place.x, place.y, normRot(place.rot)) },
  };
  const measured = qtyFromPiece({ w: draw.w, h: draw.h }, item.unit);
  return measured != null ? { ...base, ...resizeUpdates(base, item.unit, { w: draw.w, h: draw.h }) } : base;
}

/** The line moved to a new place; it joins the room it now sits in, if any. */
export function movedLine(line: BoqItem, at: Pick<PiecePlace, 'x' | 'y' | 'rot'>, room: string | null): BoqItem {
  if (!line.place) return line;
  return {
    ...line,
    place: { ...line.place, x: round2(at.x), y: round2(at.y), rot: normRot(at.rot) },
    ...(room ? { roomId: room } : {}),
  };
}

/** The line turned by a quarter (or `by` degrees). */
export function turnedLine(line: BoqItem, by = 90): BoqItem {
  if (!line.place) return line;
  return { ...line, place: { ...line.place, rot: normRot(line.place.rot + by) } };
}

/** The line nudged by dx, dy feet (arrow keys: 3″, with Shift 1′). */
export function nudgedLine(line: BoqItem, dx: number, dy: number): BoqItem {
  if (!line.place) return line;
  return { ...line, place: { ...line.place, x: round2(line.place.x + dx), y: round2(line.place.y + dy) } };
}

export type Edge = 'left' | 'right' | 'front' | 'back';

/**
 * The piece's width (along its back) or depth after dragging one edge by
 * `d` feet in the piece's own direction, the opposite edge staying where it
 * is. Width changes the size (and so the quantity); depth only the place.
 * Sizes snap to 3″ and are at least 6″.
 */
export function resizedFromEdge(
  line: BoqItem,
  item: Pick<Item, 'unit' | 'name' | 'cat' | 'draw'> | undefined,
  edge: Edge,
  d: number,
): BoqItem {
  const draw = drawOf(item as Item);
  if (!draw || !line.place) return line;
  const size = pieceSize(line, item as Item, draw);
  const along = edge === 'left' || edge === 'right';
  const sign = edge === 'right' || edge === 'front' ? 1 : -1;
  const before = along ? size.w : size.d;
  const after = Math.max(0.5, roundTo3in(before + sign * d));
  const grew = after - before;
  // The centre moves half the growth towards the dragged edge, in the piece's own frame.
  const [cx, cy] = along
    ? localToPlan(line.place, sign * grew / 2, 0)
    : localToPlan(line.place, 0, sign * grew / 2);
  const place: PiecePlace = { ...line.place, x: round2(cx), y: round2(cy) };
  if (!along) return { ...line, place: { ...place, depthFt: after } };
  const updates = resizeUpdates({ ...line, place }, item?.unit, { w: after, h: size.h });
  // A measured item writes its size (and quantity); a counted one keeps its width on its place.
  return { ...line, ...updates, place: (updates.place as PiecePlace) || place };
}

/** The line resized by typed width and height (the inspector), centre kept. */
export function resizedTo(line: BoqItem, item: Pick<Item, 'unit' | 'name' | 'cat' | 'draw'> | undefined, w: number, h: number, depth?: number): BoqItem {
  const draw = drawOf(item as Item);
  if (!draw || !line.place) return line;
  const W = Math.max(0.5, roundTo3in(w));
  const H = Math.max(0.5, roundTo3in(h));
  const place = depth && depth > 0 ? { ...line.place, depthFt: Math.max(0.12, round2(depth)) } : line.place;
  const updates = resizeUpdates({ ...line, place }, item?.unit, { w: W, h: H });
  return { ...line, ...updates, place: (updates.place as PiecePlace) || place };
}

/** Lines whose item draws but that are not on the plan yet: Needs a place. */
export function needsPlace(boq: BoqItem[], bankMap: Map<string, Item>): BoqItem[] {
  return (boq || []).filter(l => !l.place && !!drawOf(pieceItemOf(l, bankMap)) && l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted');
}

/** The bank items that can be drawn, in name order. */
export function drawableItems(bank: Item[]): { item: Item; draw: PieceDraw }[] {
  return (bank || [])
    .map(item => ({ item, draw: drawOf(item) }))
    .filter((x): x is { item: Item; draw: PieceDraw } => !!x.draw)
    .sort((a, b) => a.item.name.localeCompare(b.item.name));
}

/* ─────────────────────────────── undo ─────────────────────────────── */

export interface History<T> { past: T[]; future: T[] }
export const HISTORY_LIMIT = 80;

/** Records the state before a gesture; a new gesture clears redo. */
export function pushHistory<T>(h: History<T>, before: T): History<T> {
  return { past: [...h.past, before].slice(-HISTORY_LIMIT), future: [] };
}

/** Undo: the last state before, with the present kept for redo. */
export function undoHistory<T>(h: History<T>, present: T): { h: History<T>; state: T } | null {
  if (!h.past.length) return null;
  return { h: { past: h.past.slice(0, -1), future: [...h.future, present] }, state: h.past[h.past.length - 1] };
}

export function redoHistory<T>(h: History<T>, present: T): { h: History<T>; state: T } | null {
  if (!h.future.length) return null;
  return { h: { past: [...h.past, present], future: h.future.slice(0, -1) }, state: h.future[h.future.length - 1] };
}

/** A pointer position in plan feet, from screen pixels and the board's view box. */
export function screenToPlan(
  clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  view: { x: number; y: number; w: number; h: number },
): Point {
  return [view.x + ((clientX - rect.left) / rect.width) * view.w, view.y + ((clientY - rect.top) / rect.height) * view.h];
}
