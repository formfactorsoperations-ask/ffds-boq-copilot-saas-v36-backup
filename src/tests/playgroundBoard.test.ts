import { describe, it, expect } from 'vitest';
import type { Item, BoqItem } from '../../types';
import { buildBankMap } from '../../lib/boqPricing';
import {
  newPieceLine, movedLine, turnedLine, nudgedLine, resizedFromEdge, resizedTo, needsPlace, drawableItems,
  pushHistory, undoHistory, redoHistory, screenToPlan, HISTORY_LIMIT,
} from '../../lib/playground/board';
import { pieceSize, drawOf } from '../../lib/playground/pieces';

const item = (o: Partial<Item> & Pick<Item, 'id' | 'name'>): Item =>
  ({ cat: 'Carpentry', specs: 'x', unit: 'sq ft', materials: 1500, labor: 400, margin: 25, ...o });
const WARD = item({ id: 'w', name: 'Sliding wardrobe' });
const BASE = item({ id: 'b', name: 'Base units', cat: 'Modular kitchen', unit: 'r ft', materials: 9000 });
const BED = item({ id: 'bed', name: 'Queen bed with storage', cat: 'Furniture', unit: 'nos', materials: 38000, labor: 0 });
const PAINT = item({ id: 'p', name: 'Wall painting', cat: 'Painting' });
const bankMap = buildBankMap([WARD, BASE, BED, PAINT]);

describe('dropping an item on the plan', () => {
  it('writes a placed line, sized at the item’s draw size, with its quantity', () => {
    const l = newPieceLine(WARD, 'Master Bedroom', { x: 3.12, y: 1.12, rot: 0 }, 'n1')!;
    expect(l).toMatchObject({ id: 'n1', bankId: 'w', roomId: 'Master Bedroom', baseRate: 1500, qty: 42, calcLength: 6, calcWidth: 7, sizeUnit: 'ft' });
    expect(l.place).toEqual({ x: 3.12, y: 1.12, rot: 0, depthFt: 2 });
  });

  it('counts a counted piece, and runs a running one by its length', () => {
    expect(newPieceLine(BED, 'Bedroom', { x: 5, y: 5, rot: 90 }, 'n2')).toMatchObject({ qty: 1, place: { rot: 90, depthFt: 6.5 } });
    expect(newPieceLine(BASE, 'Kitchen', { x: 4, y: 1, rot: 0 }, 'n3')).toMatchObject({ qty: 6, calcLength: 6 });
  });

  it('refuses an item that does not draw', () => {
    expect(newPieceLine(PAINT, 'Bedroom', { x: 1, y: 1, rot: 0 }, 'n4')).toBeNull();
    expect(drawableItems([WARD, PAINT, BED]).map(x => x.item.id)).toEqual(['bed', 'w']);
  });
});

describe('moving, turning and nudging', () => {
  const l = newPieceLine(WARD, 'Master Bedroom', { x: 3.12, y: 1.12, rot: 0 }, 'n1')!;
  it('a drag writes place, and the room it lands in', () => {
    const m = movedLine(l, { x: 15.004, y: 2, rot: 0 }, 'Living Room');
    expect(m.place).toEqual({ x: 15, y: 2, rot: 0, depthFt: 2 });
    expect(m.roomId).toBe('Living Room');
    expect(movedLine(l, { x: 1, y: 1, rot: 0 }, null).roomId).toBe('Master Bedroom');
    // Nothing else moves: quantity and size stay.
    expect(m.qty).toBe(42);
    expect(m.calcLength).toBe(6);
  });
  it('turns by quarters and nudges by feet', () => {
    expect(turnedLine(l).place!.rot).toBe(90);
    expect(turnedLine(turnedLine(turnedLine(turnedLine(l)))).place!.rot).toBe(0);
    expect(turnedLine(l, -90).place!.rot).toBe(270);
    expect(nudgedLine(l, 0.25, -1).place).toMatchObject({ x: 3.37, y: 0.12 });
  });
  it('leaves a line with no place alone', () => {
    const off: BoqItem = { id: 'z', bankId: 'w', qty: 1 };
    expect(movedLine(off, { x: 1, y: 1, rot: 0 }, 'A')).toBe(off);
    expect(turnedLine(off)).toBe(off);
  });
});

describe('resizing an edge', () => {
  const l = newPieceLine(WARD, 'Master Bedroom', { x: 3, y: 1, rot: 0 }, 'n1')!;
  it('writes the size and the quantity follows, the far edge staying put', () => {
    const r = resizedFromEdge(l, WARD, 'right', 1.5);
    expect(r).toMatchObject({ calcLength: 7.5, calcWidth: 7, qty: 52.5 });
    // The left edge was at 0; it still is.
    expect(r.place!.x - 7.5 / 2).toBeCloseTo(0, 6);
    const left = resizedFromEdge(l, WARD, 'left', 1);
    expect(left).toMatchObject({ calcLength: 5, qty: 35 });
    expect(left.place!.x + 5 / 2).toBeCloseTo(6, 6);
  });
  it('works on a turned piece, in its own direction', () => {
    const turned = { ...l, place: { ...l.place!, rot: 90 } };
    const r = resizedFromEdge(turned, WARD, 'right', 1);
    expect(r.calcLength).toBe(7);
    expect(r.place!.x).toBeCloseTo(3, 6);
    expect(r.place!.y).toBeCloseTo(1.5, 6);
  });
  it('changes only the depth from the front or back', () => {
    const r = resizedFromEdge(l, WARD, 'front', 0.5);
    expect(r.place!.depthFt).toBe(2.5);
    expect(r.qty).toBe(42);
    expect(r.place!.y).toBeCloseTo(1.25, 6);
  });
  it('keeps a counted piece’s quantity, and remembers its width', () => {
    const bed = newPieceLine(BED, 'Bedroom', { x: 5, y: 5, rot: 0 }, 'n2')!;
    const r = resizedFromEdge(bed, BED, 'right', 1);
    expect(r.qty).toBe(1);
    expect(pieceSize(r, BED, drawOf(BED)!).w).toBe(6);
  });
  it('snaps to 3″ and never goes under 6″', () => {
    expect(resizedFromEdge(l, WARD, 'right', 0.3).calcLength).toBe(6.25);
    expect(resizedFromEdge(l, WARD, 'left', 10).calcLength).toBe(0.5);
  });
  it('takes a typed size from the inspector', () => {
    expect(resizedTo(l, WARD, 8, 8, 2.25)).toMatchObject({ calcLength: 8, calcWidth: 8, qty: 64, place: { x: 3, depthFt: 2.25 } });
  });
});

describe('Needs a place', () => {
  it('lists lines that draw but are not on the plan', () => {
    const boq: BoqItem[] = [
      { id: 'a', bankId: 'w', qty: 1 },
      { id: 'b', bankId: 'w', qty: 1, place: { x: 1, y: 1, rot: 0, depthFt: 2 } },
      { id: 'c', bankId: 'p', qty: 100 },
      { id: 'd', bankId: 'w', qty: 1, boqStatus: 'deleted' },
    ];
    expect(needsPlace(boq, bankMap).map(l => l.id)).toEqual(['a']);
  });
});

describe('undo', () => {
  it('one gesture is one undo, and redo comes back', () => {
    let h = { past: [] as number[], future: [] as number[] };
    h = pushHistory(h, 1);
    h = pushHistory(h, 2);
    const u = undoHistory(h, 3)!;
    expect(u.state).toBe(2);
    const r = redoHistory(u.h, 2)!;
    expect(r.state).toBe(3);
    // A new gesture clears redo.
    expect(pushHistory(u.h, 2).future).toEqual([]);
    expect(undoHistory({ past: [], future: [] }, 1)).toBeNull();
    let big = { past: [] as number[], future: [] as number[] };
    for (let i = 0; i < 100; i++) big = pushHistory(big, i);
    expect(big.past.length).toBe(HISTORY_LIMIT);
  });
});

describe('pointer to plan', () => {
  it('maps a screen point through the view box', () => {
    expect(screenToPlan(150, 120, { left: 100, top: 100, width: 400, height: 200 }, { x: -1, y: -1, w: 40, h: 20 })).toEqual([4, 1]);
  });
});
