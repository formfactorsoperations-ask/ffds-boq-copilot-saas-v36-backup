import { describe, it, expect } from 'vitest';
import type { Item, BoqItem, Room } from '../../types';
import { buildBankMap } from '../../lib/boqPricing';
import { DEFAULT_CONVENTIONS } from '../../lib/takeoff';
import {
  ftin, roundTo3in, normRot, pieceBox, rectsOverlap, pastWalls, roomAt, roomRect, inPolygon,
  localToPlan, wallsByDistance, boundsOf,
} from '../../lib/playground/geometry';
import {
  drawOf, pieceSize, qtyFromPiece, resizeUpdates, boardPieces, wallCovers, isHigh, newPlace,
} from '../../lib/playground/pieces';
import { autoPlace, placeAt, softSnap, overlaps, runsPastWall, turned, type PlacedPiece } from '../../lib/playground/placing';
import {
  measureRoom, planVsRule, measureShare, shareOnByDefault, roomShares, byRoomQty, withByRoomQty, storedShares,
} from '../../lib/playground/rooms';

const MASTER: Room = { name: 'Master Bedroom', size: 156, unit: 'sq ft', plan: { x: 0, y: 0, w: 12, h: 13 }, height: 10, doors: 1, windows: 1 };
const LIVING: Room = { name: 'Living Rm.', size: 182, unit: 'sq ft', plan: { x: 0, y: 13, w: 13, h: 14 }, height: 10, doors: 2, windows: 2 };
const BATH: Room = { name: 'Master Bathroom', size: 28, unit: 'sq ft', plan: { x: 12, y: 0, w: 4, h: 7 }, height: 9 };

/* ───────────────────────────── geometry ───────────────────────────── */

describe('geometry', () => {
  it('writes feet and inches', () => {
    expect(ftin(7.5)).toBe('7′6″');
    expect(ftin(12)).toBe('12′');
    expect(ftin(11.999)).toBe('12′');
    expect(ftin(0.25)).toBe('0′3″');
    expect(ftin(null)).toBe('');
  });

  it('rounds to 3″ and normalises angles', () => {
    expect(roundTo3in(7.13)).toBe(7.25);
    expect(roundTo3in(7.1)).toBe(7);
    expect(normRot(-90)).toBe(270);
    expect(normRot(450)).toBe(90);
  });

  it('boxes a piece by its turn', () => {
    expect(pieceBox({ w: 6, d: 2 }, { x: 5, y: 5, rot: 0 })).toEqual({ x: 2, y: 4, w: 6, h: 2 });
    const b90 = pieceBox({ w: 6, d: 2 }, { x: 5, y: 5, rot: 90 });
    expect(b90.w).toBeCloseTo(2, 9);
    expect(b90.h).toBeCloseTo(6, 9);
    const b45 = pieceBox({ w: 6, d: 2 }, { x: 0, y: 0, rot: 45 });
    expect(b45.w).toBeCloseTo(8 * Math.SQRT1_2, 9);
    // A glass partition is still hit-tested at a minimum depth.
    expect(pieceBox({ w: 3, d: 0 }, { x: 0, y: 0, rot: 0 }).h).toBe(0.12);
  });

  it('treats touching pieces as flush, not overlapping', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 6, h: 2 }, { x: 6, y: 0, w: 4, h: 2 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, w: 6, h: 2 }, { x: 5.9, y: 0, w: 4, h: 2 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 6, h: 2 }, { x: 5.97, y: 0, w: 4, h: 2 })).toBe(false);
  });

  it('finds rooms and walls', () => {
    expect(roomAt([MASTER, LIVING], 3, 20)?.name).toBe('Living Rm.');
    expect(roomAt([MASTER, LIVING], 30, 30)).toBeUndefined();
    expect(roomRect({ plan: { x: 0, y: 0, w: 0, h: 5 } })).toBeNull();
    expect(roomRect({})).toBeNull();
    expect(wallsByDistance(MASTER.plan!, 6, 1)[0]).toEqual({ wall: 'top', dist: 1 });
    expect(pastWalls({ x: -0.5, y: 1, w: 6, h: 2 }, MASTER.plan!)).toBe(true);
    expect(pastWalls({ x: -0.04, y: 1, w: 6, h: 2 }, MASTER.plan!)).toBe(false);
    expect(boundsOf([MASTER.plan!, LIVING.plan!, BATH.plan!])).toEqual({ x: 0, y: 0, w: 16, h: 27 });
  });

  it('turns local points onto the plan and tests polygons', () => {
    const [x, y] = localToPlan({ x: 10, y: 10, rot: 90 }, 1, 0);
    expect(x).toBeCloseTo(10, 9);
    expect(y).toBeCloseTo(11, 9);
    expect(inPolygon([1, 1], [[0, 0], [4, 0], [4, 4], [0, 4]])).toBe(true);
    expect(inPolygon([5, 1], [[0, 0], [4, 0], [4, 4], [0, 4]])).toBe(false);
  });
});

/* ───────────────────────────── pieces ───────────────────────────── */

const item = (o: Partial<Item> & Pick<Item, 'id' | 'name'>): Item =>
  ({ cat: 'Carpentry', specs: '', unit: 'sq ft', materials: 1500, labor: 400, margin: 25, ...o });

describe('drawOf: draw defaults', () => {
  it('infers a piece from the item’s name', () => {
    expect(drawOf(item({ id: 'a', name: 'Sliding wardrobe' }))).toEqual({ kind: 'wardrobe', w: 6, h: 7, d: 2, mount: 'wall' });
    expect(drawOf(item({ id: 'a', name: 'Overhead cabinets', unit: 'r ft' }))).toMatchObject({ kind: 'wallunit', mount: 'high' });
    expect(drawOf(item({ id: 'a', name: 'Base units', unit: 'r ft' }))).toMatchObject({ kind: 'base', w: 6 });
    expect(drawOf(item({ id: 'a', name: 'Kitchen tall unit' }))).toMatchObject({ kind: 'cabinet', w: 2, h: 7 });
    expect(drawOf(item({ id: 'a', name: 'Loft unit' }))).toMatchObject({ kind: 'loft', mount: 'high' });
    expect(drawOf(item({ id: 'a', name: 'TV unit with drawers' }))).toMatchObject({ kind: 'tv', w: 5 });
    expect(drawOf(item({ id: 'a', name: 'Bed back panel' }))).toMatchObject({ kind: 'panel', d: 0.33 });
    expect(drawOf(item({ id: 'a', name: 'Queen bed with storage', cat: 'Furniture', unit: 'nos' }))).toMatchObject({ kind: 'bed', w: 5 });
    expect(drawOf(item({ id: 'a', name: 'Bedside table', cat: 'Furniture', unit: 'nos' }))).toMatchObject({ kind: 'cabinet', w: 1.5 });
    expect(drawOf(item({ id: 'a', name: 'Three-seater sofa, loose', cat: 'Furniture', unit: 'nos' }))).toMatchObject({ kind: 'sofa', mount: 'floor' });
    expect(drawOf(item({ id: 'a', name: 'Shower partition', cat: 'Glass & mirror' }))).toMatchObject({ kind: 'glass' });
  });

  it('never draws measured work', () => {
    expect(drawOf(item({ id: 'a', name: 'Wall painting, two coats', cat: 'Painting' }))).toBeNull();
    expect(drawOf(item({ id: 'a', name: 'False ceiling with cove', cat: 'Ceiling' }))).toBeNull();
    expect(drawOf(item({ id: 'a', name: 'Electrical points and fittings', cat: 'Electrical' }))).toBeNull();
    expect(drawOf(item({ id: 'a', name: 'Wall tiles to 7 ft, laid', cat: 'Tiling' }))).toBeNull();
    expect(drawOf(item({ id: 'a', name: 'Something new' }))).toBeNull();
    expect(drawOf(undefined)).toBeNull();
  });

  it('uses the item’s own draw first', () => {
    const own = { kind: 'cabinet' as const, w: 4, h: 3, d: 1.5, mount: 'wall' as const };
    expect(drawOf(item({ id: 'a', name: 'Sliding wardrobe', draw: own }))).toBe(own);
  });
});

describe('piece size and quantity', () => {
  const ward = item({ id: 'w', name: 'Sliding wardrobe' });
  const draw = drawOf(ward)!;

  it('takes the line’s typed size first, in feet', () => {
    expect(pieceSize({ calcLength: 7, calcWidth: 8, sizeUnit: 'ft' }, ward, draw)).toEqual({ w: 7, h: 8, d: 2 });
    expect(pieceSize({ calcLength: 2100, calcWidth: 2400, sizeUnit: 'mm' }, ward, draw)).toEqual({ w: 6.89, h: 7.87, d: 2 });
    expect(pieceSize({ place: { x: 0, y: 0, rot: 0, depthFt: 2.5, widthFt: 5 } }, ward, draw)).toEqual({ w: 5, h: 7, d: 2.5 });
    expect(pieceSize({}, ward, draw)).toEqual({ w: 6, h: 7, d: 2 });
  });

  it('keeps a running item’s height from its draw', () => {
    const base = item({ id: 'b', name: 'Base units', unit: 'r ft' });
    expect(pieceSize({ calcLength: 9, sizeUnit: 'ft' }, base, drawOf(base)!)).toEqual({ w: 9, h: 2.83, d: 2 });
  });

  it('gives the quantity in the item’s unit', () => {
    expect(qtyFromPiece({ w: 6, h: 7 }, 'sq ft')).toBe(42);
    expect(qtyFromPiece({ w: 6, h: 7 }, 'r ft')).toBe(6);
    expect(qtyFromPiece({ w: 6, h: 7 }, 'sqm')).toBe(3.9);
    expect(qtyFromPiece({ w: 6, h: 7 }, 'nos')).toBeNull();
  });

  it('writes a resize to the size fields, and the quantity follows', () => {
    expect(resizeUpdates({}, 'sq ft', { w: 7, h: 8 })).toEqual({ calcLength: 7, calcWidth: 8, calcMultiplier: 1, sizeUnit: 'ft', qty: 56 });
    expect(resizeUpdates({}, 'r ft', { w: 9.5, h: 2.83 })).toMatchObject({ calcLength: 9.5, qty: 9.5 });
    expect(resizeUpdates({ calcMultiplier: 2 }, 'sq ft', { w: 3, h: 7 })).toMatchObject({ qty: 42 });
    // A counted piece keeps its quantity; its size lives on its place.
    const place = { x: 1, y: 1, rot: 0, depthFt: 6.5 };
    expect(resizeUpdates({ place, qty: 1 }, 'nos', { w: 6, h: 1.8 })).toEqual({ place: { ...place, widthFt: 6, heightFt: 1.8 } });
    expect(resizeUpdates({ qty: 1 }, 'nos', { w: 6, h: 1.8 })).toEqual({});
  });

  it('lists the drawn lines, and the carpentry that hides a wall', () => {
    const bank = buildBankMap([ward, item({ id: 'p', name: 'Wall painting', cat: 'Painting' }), item({ id: 'ov', name: 'Overhead cabinets', unit: 'r ft' })]);
    const boq: BoqItem[] = [
      { id: 'l1', bankId: 'w', qty: 42, roomId: 'Master Bedroom', place: newPlace(draw, 3.12, 1.12) },
      { id: 'l2', bankId: 'w', qty: 42, roomId: 'Master Bedroom' },                                        // not placed
      { id: 'l3', bankId: 'p', qty: 400, roomId: 'Master Bedroom', place: { x: 1, y: 1, rot: 0, depthFt: 1 } }, // never drawn
      { id: 'l4', bankId: 'ov', qty: 6, roomId: 'Kitchen', place: { x: 1, y: 1, rot: 0, depthFt: 1.17 } },
    ];
    const pieces = boardPieces(boq, bank);
    expect(pieces.map(p => p.id)).toEqual(['l1', 'l4']);
    expect(isHigh(pieces[1].draw)).toBe(true);
    expect(wallCovers(pieces)).toEqual([{ room: 'Master Bedroom', widthFt: 6, heightFt: 7 }]);
  });
});

/* ───────────────────────────── placing ───────────────────────────── */

const wardrobe = (id: string, place = { x: 0, y: 0, rot: 0 }): PlacedPiece =>
  ({ id, room: 'Master Bedroom', fp: { w: 6, d: 2 }, place, wallBacked: true });

describe('placing', () => {
  it('auto-places along the top wall first, then the next free wall', () => {
    const first = autoPlace(wardrobe('a'), MASTER, []);
    expect(first).toEqual({ x: 3.12, y: 1.12, rot: 0 });
    const second = autoPlace(wardrobe('b'), MASTER, [wardrobe('a', first!)]);
    expect(second).toEqual({ x: 1.12, y: 5.12, rot: 270 });
  });

  it('returns null when nothing fits', () => {
    const tiny: Room = { name: 'Store', size: 9, unit: 'sq ft', plan: { x: 0, y: 0, w: 3, h: 3 } };
    expect(autoPlace(wardrobe('a'), tiny, [])).toBeNull();
    expect(autoPlace(wardrobe('a'), { name: 'Off plan' }, [])).toBeNull();
  });

  it('places a free-standing piece on the open floor when the walls are taken', () => {
    const sofa: PlacedPiece = { id: 's', fp: { w: 7, d: 3 }, place: { x: 0, y: 0, rot: 0 } };
    const room: Room = { name: 'Living Rm.', size: 144, unit: 'sq ft', plan: { x: 0, y: 0, w: 12, h: 12 } };
    const walls: PlacedPiece[] = [
      { id: 'w1', fp: { w: 11.76, d: 2 }, place: { x: 6, y: 1.12, rot: 0 } },
      { id: 'w2', fp: { w: 11.76, d: 2 }, place: { x: 6, y: 10.88, rot: 180 } },
      { id: 'w3', fp: { w: 2, d: 2 }, place: { x: 1.12, y: 6, rot: 270 } },
      { id: 'w4', fp: { w: 2, d: 2 }, place: { x: 10.88, y: 6, rot: 90 } },
    ];
    const at = autoPlace(sofa, room, walls);
    expect(at).not.toBeNull();
    expect(overlaps({ ...sofa, place: at! }, walls)).toEqual([]);
    expect(autoPlace({ ...sofa, wallBacked: true }, room, walls)).toBeNull();
  });

  it('backs a dropped piece onto the nearest wall and keeps it in the room', () => {
    const r = placeAt(wardrobe('a'), 6, 1.5, [MASTER, LIVING]);
    expect(r).toEqual({ place: { x: 6, y: 1.12, rot: 0 }, room: 'Master Bedroom', wall: 'top' });
    const left = placeAt(wardrobe('a'), 1, 6.5, [MASTER]);
    expect(left.wall).toBe('left');
    expect(left.place).toEqual({ x: 1.12, y: 6.5, rot: 270 });
    // Too far from every wall: stays where it was dropped, unturned, clamped inside.
    expect(placeAt(wardrobe('a'), 6, 6.5, [MASTER])).toEqual({ place: { x: 6, y: 6.5, rot: 0 }, room: 'Master Bedroom', wall: null });
    expect(placeAt(wardrobe('a'), 11.5, 6.5, [MASTER]).place).toEqual({ x: 10.88, y: 6.5, rot: 90 });
    const sofa: PlacedPiece = { id: 's', fp: { w: 7, d: 3 }, place: { x: 0, y: 0, rot: 0 } };
    expect(placeAt(sofa, 11.5, 6.5, [MASTER])).toEqual({ place: { x: 8.38, y: 6.5, rot: 0 }, room: 'Master Bedroom', wall: null });
  });

  it('places freely with Alt held, and outside every room', () => {
    expect(placeAt(wardrobe('a'), 6, 1.5, [MASTER], { free: true }).place).toEqual({ x: 6, y: 1.5, rot: 0 });
    expect(placeAt(wardrobe('a'), 40, 40, [MASTER])).toEqual({ place: { x: 40, y: 40, rot: 0 }, room: null, wall: null });
  });

  it('snaps edges onto a neighbour and the walls', () => {
    const a = wardrobe('a', { x: 3.12, y: 1.12, rot: 0 });
    const b = wardrobe('b', { x: 9.3, y: 1.12, rot: 0 });
    const s = softSnap(b, 9.3, 1.3, [MASTER], [a, b], { thresholdFt: 0.5 });
    expect(s.x).toBeCloseTo(9.12, 9); // left edge onto a's right edge
    expect(s.y).toBeCloseTo(1.12, 9); // top edge onto the wall
    expect(s.guides).toHaveLength(2);
    const alone = softSnap(b, 9.3, 1.3, [MASTER], [b], { thresholdFt: 0.5 });
    expect(alone.y).toBeCloseTo(1.12, 9);
    // Alone in the room, the right edge (12.3) and the top edge both pull onto walls.
    expect(alone.x).toBeCloseTo(8.88, 9);
    expect(alone.guides.map(g => g.wall)).toEqual([true, true]);
    expect(softSnap(b, 9.3, 1.3, [MASTER], [a, b], { thresholdFt: 0.5, free: true })).toEqual({ x: 9.3, y: 1.3, guides: [] });
    const skew = { ...b, place: { ...b.place, rot: 30 } };
    expect(softSnap(skew, 9.3, 1.3, [MASTER], [a], { thresholdFt: 0.5 }).guides).toEqual([]);
  });

  it('finds overlaps between pieces at the same level only', () => {
    const base: PlacedPiece = { id: 'base', fp: { w: 6, d: 2 }, place: { x: 3, y: 1, rot: 0 } };
    const wall: PlacedPiece = { id: 'wall', fp: { w: 6, d: 1.17 }, place: { x: 3, y: 0.7, rot: 0 }, high: true };
    const base2: PlacedPiece = { id: 'base2', fp: { w: 6, d: 2 }, place: { x: 5, y: 1, rot: 0 } };
    expect(overlaps(base, [base, wall])).toEqual([]);
    expect(overlaps(base, [base, wall, base2]).map(o => o.id)).toEqual(['base2']);
    expect(runsPastWall(wardrobe('x', { x: 2, y: 1.12, rot: 0 }), MASTER)).toBe(true);
    expect(runsPastWall(wardrobe('x', { x: 3.12, y: 1.12, rot: 0 }), MASTER)).toBe(false);
    expect(turned({ x: 1, y: 1, rot: 270 })).toEqual({ x: 1, y: 1, rot: 0 });
  });
});

/* ───────────────────────────── rooms ───────────────────────────── */

describe('measuring a room from the plan', () => {
  it('paints the walls less doors, windows and drawn carpentry', () => {
    // 50′ perimeter × 10′ = 500; − 21 door − 16 window = 463.
    expect(measureRoom(MASTER).wall).toBe(463);
    const covered = measureRoom(MASTER, { covers: [{ room: 'Master Bedroom', widthFt: 6, heightFt: 7 }] });
    expect(covered.wall).toBe(421);
    expect(covered.carpentry).toBe(42);
    expect(covered.derivation).toContain('42 behind carpentry');
    // Painting behind carpentry: nothing is deducted.
    const behind = measureRoom(MASTER, {
      covers: [{ room: 'Master Bedroom', widthFt: 6, heightFt: 7 }],
      conventions: { ...DEFAULT_CONVENTIONS, paintBehindCarpentry: true },
    });
    expect(behind.wall).toBe(463);
  });

  it('paints the false-ceiling surface where there is one', () => {
    // A bedroom gets a cove ceiling: 156 soffit + 50 × 0.75 drop + 50 × 0.5 return.
    const m = measureRoom(MASTER);
    expect(m.falseCeiling).toBe(218.5);
    expect(m.ceiling).toBe(218.5);
    expect(measureRoom({ ...MASTER, ceiling: 'none' }).ceiling).toBe(156);
  });

  it('keeps toilets out of painting', () => {
    expect(measureRoom(BATH).wall).toBe(0);
    expect(planVsRule('wallPaint', BATH)).toEqual({ plan: 0, rule: 0 });
    expect(shareOnByDefault('paint', BATH)).toBe(false);
    expect(shareOnByDefault('points', BATH)).toBe(true);
  });

  it('shows the carpet-area rule beside the plan', () => {
    expect(planVsRule('wallPaint', MASTER)).toEqual({ plan: 463, rule: 421 });
    expect(planVsRule('ceilingPaint', MASTER)).toEqual({ plan: 219, rule: 203 });
  });

  it('falls back to the rule for a room with no size on the plan', () => {
    const m = measureRoom({ name: 'Bedroom 3', size: 100, unit: 'sq ft' });
    expect(m.wall).toBe(270);
    expect(m.ceiling).toBe(130);
    expect(m.derivation).toMatch(/No size on the plan/);
  });

  it('measures each basis', () => {
    expect(measureShare('points', LIVING)).toBe(12);
    expect(measureShare('points', MASTER, { pointsByKind: { bedroom: 10 } })).toBe(10);
    expect(measureShare('carpetArea', LIVING)).toBe(182);
    expect(measureShare('paint', MASTER)).toBe(Math.round(463 + 218.5));
    expect(measureShare('wallPaint', MASTER, {}, true)).toBe(421);
  });
});

describe('whole-flat lines shared into rooms', () => {
  const rooms = [LIVING, MASTER, BATH];

  it('shares by the plan, skipping rooms that take no share', () => {
    const s = roomShares({ basis: 'wallPaint', client: 'flat', rooms: {} }, rooms);
    expect(s.get('Master Bedroom')).toBe(463);
    expect(s.get('Master Bathroom')).toBe(0);
    expect(byRoomQty({ basis: 'wallPaint', client: 'flat', rooms: {} }, rooms)).toBe(s.get('Living Rm.')! + 463);
  });

  it('takes typed shares and switches', () => {
    const split = { basis: 'points' as const, client: 'rooms' as const, rooms: { 'Living Rm.': { qty: 15 }, 'Master Bathroom': { on: false } } };
    const s = roomShares(split, rooms);
    expect([...s.entries()]).toEqual([['Living Rm.', 15], ['Master Bedroom', 8], ['Master Bathroom', 0]]);
    expect(byRoomQty(split, rooms)).toBe(23);
  });

  it('scales the shares to a typed flat total, keeping points whole', () => {
    const split = { basis: 'points' as const, client: 'rooms' as const, rooms: {}, keep: 25 };
    // 12 : 8 : 4 of 25 → 12.5, 8.33, 4.17 → 12, 8, 4 and the spare point to the largest fraction.
    expect([...roomShares(split, rooms).values()]).toEqual([13, 8, 4]);
    expect(byRoomQty(split, rooms)).toBe(25);
    const area = roomShares({ basis: 'carpetArea', client: 'flat', rooms: {}, keep: 400 }, rooms);
    const sum = [...area.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(400, 1);
  });

  it('brings the line’s qty in line with its shares', () => {
    const line = { qty: 0, byRoom: { basis: 'points' as const, client: 'rooms' as const, rooms: {} } };
    expect(withByRoomQty(line, rooms).qty).toBe(24);
    const plain = { qty: 5 };
    expect(withByRoomQty(plain, rooms)).toBe(plain);
  });

  it('reads typed shares when the plan is not to hand', () => {
    const m = storedShares({ basis: 'wallPaint', client: 'flat', rooms: { A: { qty: 100 }, B: { on: false, qty: 50 }, C: {} } });
    expect([...m.entries()]).toEqual([['A', 100]]);
  });
});
