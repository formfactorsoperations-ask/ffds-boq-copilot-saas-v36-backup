/**
 * BOQ Playground — pieces: items that draw on the plan.
 *
 * An Item Bank item draws when it has `draw` ({ kind, w, h, d, mount }), or when
 * its name says what it is (a wardrobe, a TV unit, a vanity…): `drawOf` infers a
 * default so the existing bank works before anyone sets the field. Painting,
 * electrical, civil work and services never draw; they are measured instead.
 *
 * A piece's size is the line's own size where it has one (calcLength × calcWidth,
 * lib/boqSize.ts), else the place's override, else the item's draw size. The
 * quantity follows from the size in the item's own unit, exactly as a typed size
 * does today: sq ft is width × height, r ft is the width, nos is counted.
 */
import type { Item, BoqItem, PieceDraw, PieceKind, PieceMount, PiecePlace } from '../../types';
import { readSize, convertLength, sizeUpdates, basisOfUnit, type QtyBasis } from '../boqSize';
import { round2, type Footprint } from './geometry';
import type { PlacedPiece } from './placing';
import type { WallCover } from './rooms';

/** How each kind sits: against a wall or free, and how high a wall-hung piece starts (ft). */
export const PIECE_KINDS: Record<PieceKind, { mount: PieceMount; elevationFt?: number }> = {
  wardrobe: { mount: 'wall' },
  cabinet: { mount: 'wall' },
  tv: { mount: 'wall' },
  panel: { mount: 'wall' },
  base: { mount: 'wall' },
  wallunit: { mount: 'high', elevationFt: 4.6 },
  loft: { mount: 'high', elevationFt: 7 },
  vanity: { mount: 'wall' },
  desk: { mount: 'wall' },
  bed: { mount: 'wall' },
  glass: { mount: 'floor' },
  sofa: { mount: 'floor' },
  dtable: { mount: 'floor' },
  generic: { mount: 'floor' },
};

const D = (kind: PieceKind, w: number, h: number, d: number, mount?: PieceMount): PieceDraw =>
  ({ kind, w, h, d, mount: mount ?? PIECE_KINDS[kind].mount });

/*
  Default sizes, from the studio's working sizes (feet: width × height × depth).
  Tested in order, so the specific names come before the general ones: "kitchen
  tall unit" before "unit", "overhead" before "cabinet".
*/
const DEFAULTS: [RegExp, PieceDraw][] = [
  [/\b(loft)\b/i, D('loft', 6, 2, 2)],
  [/\b(overhead|wall\s*unit|upper\s*cabinet|wall\s*cabinet)/i, D('wallunit', 6, 2.5, 1.17)],
  [/\b(base\s*unit|base\s*cabinet|kitchen\s*base|lower\s*cabinet)/i, D('base', 6, 2.83, 2)],
  [/\b(tall\s*unit|pantry)/i, D('cabinet', 2, 7, 2)],
  [/\bwardrobe/i, D('wardrobe', 6, 7, 2)],
  [/\b(tv\s*unit|tv\s*console|entertainment\s*unit|media\s*unit)/i, D('tv', 5, 2.25, 1.5)],
  [/\b(vanity)/i, D('vanity', 2.5, 2.75, 1.75)],
  [/\b(shower\s*partition|shower\s*glass|glass\s*partition)/i, D('glass', 3, 7, 0.12)],
  [/\b(bed\s*back|headboard\s*panel|back\s*panel)/i, D('panel', 6, 4, 0.33)],
  [/\b(panell?ing|wall\s*panel|fluted)/i, D('panel', 8, 9, 0.25)],
  [/\b(side\s*table|bed\s*side|bedside)/i, D('cabinet', 1.5, 1.75, 1.5)],
  [/\b(king\s*bed)/i, D('bed', 6, 1.8, 6.5)],
  [/\b(queen\s*bed|double\s*bed|\bbed\b(?!\s*back))/i, D('bed', 5, 1.8, 6.5)],
  [/\b(sofa|couch)/i, D('sofa', 7, 2.6, 3)],
  [/\b(dining\s*table)/i, D('dtable', 5, 2.5, 3)],
  [/\b(study\s*table|desk|work\s*station|workstation)/i, D('desk', 4, 2.5, 2)],
  [/\b(shoe\s*rack|shoe\s*cabinet)/i, D('cabinet', 3, 3.5, 1.25)],
  [/\b(crockery)/i, D('cabinet', 4, 7, 1.5)],
  [/\b(showcase|display\s*unit)/i, D('cabinet', 3, 2.75, 1.25)],
  [/\b(bar\s*unit)/i, D('cabinet', 4, 3, 1.5)],
  [/\b(pooja|mandir|temple)/i, D('cabinet', 3, 4, 1.25)],
  [/\b(dresser|dressing)/i, D('cabinet', 3, 6, 1.5)],
  [/\b(book\s*shelf|bookshelf|book\s*case|bookcase)/i, D('cabinet', 5, 6, 1)],
];

/** Lines that are measured, never drawn, whatever their name says. */
const NEVER_DRAWN = /\b(paint|putty|primer|false\s*ceiling|gypsum|pop\s*ceiling|electrical|wiring|plumbing|tiles?|flooring|demolition|debris|waterproof|civil|cleaning|light\s*fitting)/i;
const NEVER_DRAWN_CATS = /^(painting|electrical|plumbing|civil|flooring|tiling|ceiling|services)$/i;

/** The draw an item uses: its own, else one inferred from its name, else null (not drawable). */
export function drawOf(item: Pick<Item, 'name' | 'cat' | 'draw'> | null | undefined): PieceDraw | null {
  if (!item) return null;
  if (item.draw && item.draw.w > 0) return item.draw;
  const name = item.name || '';
  if (NEVER_DRAWN_CATS.test((item.cat || '').trim()) || NEVER_DRAWN.test(name)) return null;
  for (const [re, d] of DEFAULTS) if (re.test(name)) return { ...d };
  return null;
}

/** True when a piece is wall-hung above the floor: it never collides with floor pieces. */
export const isHigh = (d: Pick<PieceDraw, 'mount'> | null | undefined) => d?.mount === 'high';
/** True when a piece backs onto a wall (standing or hung). */
export const isWallBacked = (d: Pick<PieceDraw, 'mount'> | null | undefined) => d?.mount === 'wall' || d?.mount === 'high';

export interface PieceSize { w: number; h: number; d: number }

/**
 * A piece's size in feet. The line's typed size wins (it is what the quantity
 * came from), then the place's override, then the draw's default.
 */
export function pieceSize(line: Partial<BoqItem>, item: Pick<Item, 'unit'> | null | undefined, draw: PieceDraw): PieceSize {
  const typed = readSize({ ...line, unit: item?.unit });
  const toFt = (v: number | undefined) => (v && typed ? convertLength(v, typed.unit, 'ft') : undefined);
  const basis = basisOfUnit(item?.unit);
  const typedW = toFt(typed?.a);
  // A running item's size is its length only; its height stays the draw's.
  const typedH = basis === 'length' ? undefined : toFt(typed?.b);
  const p = line.place;
  return {
    w: round2(typedW ?? p?.widthFt ?? draw.w),
    h: round2(typedH ?? p?.heightFt ?? draw.h),
    d: round2(p?.depthFt ?? draw.d),
  };
}

export const footprintOf = (s: PieceSize): Footprint => ({ w: s.w, d: s.d });

/** How the quantity follows from a piece's size, by the item's unit. */
export function sizeBasis(unit?: string): QtyBasis {
  return basisOfUnit(unit) ?? 'count';
}

/** The quantity a piece of this size gives in the item's unit, or null when it is counted or a lump. */
export function qtyFromPiece(size: Pick<PieceSize, 'w' | 'h'>, unit?: string, nos = 1): number | null {
  const basis = sizeBasis(unit);
  if (basis === 'area' || basis === 'length') {
    const r = sizeUpdates({ a: size.w, b: basis === 'area' ? size.h : undefined, nos, unit: 'ft' }, unit);
    return typeof r.qty === 'number' ? r.qty : null;
  }
  return null;
}

/**
 * The fields to write when a piece is resized on the plan. A measured item (sq ft,
 * r ft) writes its size to calcLength/calcWidth in feet, and the quantity follows;
 * a counted item keeps its quantity and remembers the size on its place.
 */
export function resizeUpdates(line: Partial<BoqItem>, unit: string | undefined, size: Pick<PieceSize, 'w' | 'h'>): Partial<BoqItem> {
  const basis = sizeBasis(unit);
  const w = round2(Math.max(0.5, size.w));
  const h = round2(Math.max(0.5, size.h));
  if (basis === 'area' || basis === 'length') {
    const nos = Number(line.calcMultiplier) > 0 ? Number(line.calcMultiplier) : 1;
    return sizeUpdates({ a: w, b: basis === 'area' ? h : undefined, nos, unit: 'ft' }, unit);
  }
  if (!line.place) return {};
  const place: PiecePlace = { ...line.place, widthFt: w, heightFt: h };
  return { place };
}

/** The place a line gets when it first lands on the plan: centred at x, y, unturned. */
export function newPlace(draw: PieceDraw, x: number, y: number, rot = 0): PiecePlace {
  return { x: round2(x), y: round2(y), rot, depthFt: draw.d };
}

/** A BOQ line that is drawn on the plan, with what the placing functions need. */
export interface BoardPiece extends PlacedPiece {
  line: BoqItem;
  item: Item | undefined;
  draw: PieceDraw;
  size: PieceSize;
}

/** The lines that are drawn: they have a place and their item draws. */
export function boardPieces(boq: BoqItem[], bankMap: Map<string, Item>): BoardPiece[] {
  const out: BoardPiece[] = [];
  (boq || []).forEach(line => {
    if (!line.place) return;
    const item = bankMap.get(line.bankId);
    const draw = drawOf(item);
    if (!draw) return;
    const size = pieceSize(line, item, draw);
    out.push({
      id: line.id,
      room: line.roomId,
      fp: footprintOf(size),
      place: line.place,
      high: isHigh(draw),
      wallBacked: isWallBacked(draw),
      line, item, draw, size,
    });
  });
  return out;
}

/** Carpentry drawn against a wall at floor level: the wall it hides is not painted. */
export function wallCovers(pieces: BoardPiece[]): WallCover[] {
  return pieces
    .filter(p => p.draw.mount === 'wall' && p.draw.kind !== 'bed' && p.draw.kind !== 'desk' && basisOfUnit(p.item?.unit) === 'area' && p.room)
    .map(p => ({ room: p.room as string, widthFt: p.size.w, heightFt: p.size.h }));
}
