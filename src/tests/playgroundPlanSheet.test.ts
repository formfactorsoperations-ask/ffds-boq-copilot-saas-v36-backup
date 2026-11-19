import { describe, it, expect } from 'vitest';
import type { Item, BoqItem, Room, PlanSheet } from '../../types';
import { buildBankMap } from '../../lib/boqPricing';
import {
  scaleFromTwoPoints, withScale, pxToFt, ftToPx, rectToPx, traceRect, rescaleRooms,
  scaleFromBoxes, rectsFromBoxes, roomKey, matchRooms, placeRooms, blocksLayout,
  replacePlan, replanPreview, withHistory, sheetOf, dataUrlOf, isPdfSheet, MAX_PLAN_HISTORY, type PlanBox,
} from '../../lib/playground/planSheet';
import { PLAYGROUND_PRICING } from '../../lib/playground/pricing';
import { pieceBox, pastWalls } from '../../lib/playground/geometry';

/* A fixture plan: 1000 × 700 px at 0.04 ft a pixel, so the drawing is 40′ × 28′. */
const IMG = { w: 1000, h: 700 };
const K = 0.04;
const BOXES: PlanBox[] = [
  { name: 'Living Rm.', box: { x: 0, y: 0, w: 0.325, h: 0.5 }, lengthFt: 14, widthFt: 13, dimensionPrinted: true },      // 13 × 14
  { name: 'Kitchen', box: { x: 0.325, y: 0, w: 0.225, h: 0.2857142857 }, lengthFt: 9, widthFt: 8, dimensionPrinted: true }, // 9 × 8
  { name: 'M. Bed', box: { x: 0, y: 0.5, w: 0.3, h: 0.4642857143 }, lengthFt: 13, widthFt: 12, dimensionPrinted: true },    // 12 × 13
  { name: 'Toilet', box: { x: 0.3, y: 0.5, w: 0.1, h: 0.25 }, lengthFt: 7, widthFt: 4, dimensionPrinted: false },            // 4 × 7
  { name: 'Ghost', box: { x: 0.9, y: 0.9, w: 0.3, h: 0.3 } },                                                             // off the image
];

describe('plan sheet maths', () => {
  it('sets the scale from one measured wall', () => {
    expect(scaleFromTwoPoints([100, 100], [400, 100], 12)).toBe(0.04);
    expect(scaleFromTwoPoints([100, 100], [100, 101], 12)).toBeNull();
    expect(scaleFromTwoPoints([0, 0], [300, 0], 0)).toBeNull();
    const s = withScale({ source: 'upload', imageUrl: 'x.png' }, [0, 0], [300, 400], 20)!;
    expect(s.ftPerPx).toBe(0.04);
    expect(s.calibration).toEqual({ a: [0, 0], b: [300, 400], feet: 20 });
  });

  it('turns pixels into feet and back, from the origin', () => {
    const s: PlanSheet = { source: 'upload', ftPerPx: K, origin: { x: 50, y: 20 } };
    expect(pxToFt(s, [350, 320])).toEqual([12, 12]);
    expect(ftToPx(s, [12, 12])).toEqual([350, 320]);
    expect(pxToFt({ source: 'upload' }, [1, 1])).toBeNull();
    expect(rectToPx(s, { x: 4, y: 2, w: 8, h: 4 })).toEqual({ x: 150, y: 70, w: 200, h: 100 });
  });

  it('traces a room by dragging, either way, rounded to 3″', () => {
    const s: PlanSheet = { source: 'upload', ftPerPx: K };
    // Dragged from bottom-right to top-left: the same rectangle.
    expect(traceRect(s, [328, 352], [3, 2])).toEqual({ x: 0, y: 0, w: 13, h: 14 });
    expect(traceRect(s, [0, 0], [10, 10])).toBeNull(); // under a foot: a stray click
    expect(traceRect({ source: 'upload' }, [0, 0], [300, 300])).toBeNull();
  });

  it('round-trips a manual trace through feet and back to the drawing', () => {
    const s: PlanSheet = { source: 'upload', ftPerPx: K, origin: { x: 10, y: 10 } };
    const r = traceRect(s, [10, 10], [335, 360])!;
    expect(r).toEqual({ x: 0, y: 0, w: 13, h: 14 });
    expect(rectToPx(s, r)).toEqual({ x: 10, y: 10, w: 325, h: 350 });
  });

  it('keeps traced rooms on the drawing when the scale is set again', () => {
    const before: PlanSheet = { source: 'upload', ftPerPx: K };
    const after: PlanSheet = { source: 'upload', ftPerPx: K * 1.5 };
    const [r] = rescaleRooms([{ plan: { x: 4, y: 2, w: 8, h: 4 } }], before, after);
    expect(r.plan).toEqual({ x: 6, y: 3, w: 12, h: 6 });
    expect(rectToPx(after, r.plan!)).toEqual(rectToPx(before, { x: 4, y: 2, w: 8, h: 4 }));
  });
});

describe('rooms read off a plan', () => {
  it('finds the scale from the printed sizes', () => {
    expect(scaleFromBoxes(BOXES, IMG)).toBeCloseTo(K, 6);
    expect(scaleFromBoxes([{ name: 'A', box: { x: 0, y: 0, w: 0.5, h: 0.5 } }], IMG)).toBeNull();
  });

  it('puts each box on the plan in feet, dropping boxes off the image', () => {
    const rects = rectsFromBoxes(BOXES, IMG, K);
    expect(rects.map(r => r.name)).toEqual(['Living Rm.', 'Kitchen', 'M. Bed', 'Toilet']);
    expect(rects[0].plan).toEqual({ x: 0, y: 0, w: 13, h: 14 });
    expect(rects[1].plan).toEqual({ x: 13, y: 0, w: 9, h: 8 });
    expect(rects[2].plan).toEqual({ x: 0, y: 14, w: 12, h: 13 });
    expect(rects[3].plan).toEqual({ x: 12, y: 14, w: 4, h: 7 });
  });

  it('matches the project’s rooms by name, then by kind in order', () => {
    expect(roomKey('Master Bed Rm.')).toBe(roomKey('master bedroom'));
    expect(roomKey('Common Bath')).toBe(roomKey('Common Bathroom'));
    expect(roomKey('Toilet')).toBe('bathroom');
    const m = matchRooms(
      ['Living Room', 'Master Bedroom', 'Bedroom 2', 'Common Bathroom', 'Study'],
      ['Living Rm.', 'M. Bed', 'Bed 2', 'Common Bath', 'Balcony'],
    );
    expect(m.get('Living Room')).toBe('Living Rm.');
    expect(m.get('Common Bathroom')).toBe('Common Bath');
    expect(m.get('Bedroom 2')).toBe('Bed 2');
    expect(m.get('Master Bedroom')).toBe('M. Bed'); // by kind: the bedroom left over
    expect(m.has('Study')).toBe(false);
  });

  it('places the rooms, adds the plan’s new rooms and lists the ones it lacks', () => {
    const rooms: Room[] = [
      { name: 'Living Room', size: 180, unit: 'sq ft' },
      { name: 'Kitchen', size: 70, unit: 'sq ft' },
      { name: 'Study', size: 80, unit: 'sq ft' },
    ];
    const r = placeRooms(rooms, rectsFromBoxes(BOXES, IMG, K));
    const living = r.rooms.find(x => x.name === 'Living Room')!;
    expect(living.plan).toEqual({ x: 0, y: 0, w: 13, h: 14 });
    expect(living.size).toBe(182);
    expect([living.length, living.width]).toEqual([14, 13]);
    expect(r.added).toEqual(['M. Bed', 'Toilet']);
    expect(r.missing).toEqual(['Study']);
    expect(r.rooms.find(x => x.name === 'Study')!.plan).toBeUndefined();
    expect(r.rooms.find(x => x.name === 'Toilet')!.kind).toBe('toilet');
  });
});

describe('blocks: a plan with no drawing', () => {
  it('lays every room out at its size, without overlaps', () => {
    const rooms: Room[] = [
      { name: 'Living', size: 182, unit: 'sq ft', length: 14, width: 13 },
      { name: 'Bedroom', size: 156, unit: 'sq ft', length: 13, width: 12 },
      { name: 'Kitchen', size: 72, unit: 'sq ft' },
      { name: 'Bath', size: 28, unit: 'sq ft', length: 7, width: 4 },
      { name: 'Nothing', size: 0, unit: 'sq ft' },
    ];
    const out = blocksLayout(rooms);
    const placed = out.filter(r => r.plan);
    expect(placed.length).toBe(4);
    expect(out.find(r => r.name === 'Nothing')!.plan).toBeUndefined();
    expect(out[0].plan).toMatchObject({ w: 14, h: 13 });
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i].plan!, b = placed[j].plan!;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      expect(ox > 0.01 && oy > 0.01).toBe(false);
    }
  });
});

describe('replacing the plan', () => {
  const bank: Item[] = [
    { id: 'w', name: 'Sliding wardrobe', cat: 'Carpentry', specs: 'x', unit: 'sq ft', materials: 1500, labor: 400, margin: 25 },
    { id: 'p', name: 'Wall painting, two coats', cat: 'Painting', specs: 'x', unit: 'sq ft', materials: 18, labor: 6, margin: 25 },
  ];
  const bankMap = buildBankMap(bank);
  const rooms: Room[] = [
    { name: 'Master Bedroom', size: 156, unit: 'sq ft', plan: { x: 0, y: 0, w: 12, h: 13 }, kind: 'bedroom' },
    { name: 'Living Room', size: 182, unit: 'sq ft', plan: { x: 12, y: 0, w: 13, h: 14 }, kind: 'living' },
  ];
  const boq: BoqItem[] = [
    { id: 'a', bankId: 'w', qty: 42, roomId: 'Master Bedroom', place: { x: 3.12, y: 1.12, rot: 0, depthFt: 2 } },
    { id: 'b', bankId: 'w', qty: 42, roomId: 'Living Room', place: { x: 22, y: 1.12, rot: 0, depthFt: 2 } },
    { id: 'c', bankId: 'w', qty: 42, roomId: 'Living Room' },
    { id: 'pt', bankId: 'p', qty: 0, roomId: 'Whole flat', byRoom: { basis: 'wallPaint', client: 'flat', rooms: {} } },
  ];
  // The revised plan: the bedroom moved and grew, the living room shrank to 10′ wide.
  const rects = [
    { name: 'M. Bed', plan: { x: 2, y: 20, w: 12.5, h: 13 } },
    { name: 'Living Rm.', plan: { x: 20, y: 0, w: 10, h: 14 } },
  ];
  const out = replacePlan({ rooms, boq, bankMap, oldSheet: { source: 'brief', imageUrl: 'old.png', ftPerPx: K }, rects, at: 1000, by: 'Anish K.' });

  it('moves every piece with its room and keeps it inside', () => {
    const a = out.boq.find(l => l.id === 'a')!;
    expect(a.place).toMatchObject({ x: 5.12, y: 21.12, rot: 0 });
    out.boq.filter(l => l.place).forEach(l => {
      const room = out.rooms.find(r => r.name === l.roomId)!;
      const box = pieceBox({ w: 6, d: 2 }, l.place!);
      expect(pastWalls(box, room.plan!)).toBe(false);
    });
  });

  it('sends a piece that no longer fits to Needs a place, and keeps its line', () => {
    // b sat 10′ into a 13′ room; in a 10′ room it runs past the wall.
    expect(out.needsPlace).toEqual(['b']);
    const b = out.boq.find(l => l.id === 'b')!;
    expect(b.place).toBeUndefined();
    expect(b.qty).toBe(42);
    expect(out.boq.length).toBe(boq.length);
  });

  it('keeps the old plan in history', () => {
    expect(out.history).toEqual({
      sheet: { source: 'brief', imageUrl: 'old.png', ftPerPx: K },
      rooms: [{ name: 'Master Bedroom', plan: rooms[0].plan }, { name: 'Living Room', plan: rooms[1].plan }],
      replacedAt: 1000, by: 'Anish K.',
    });
    const many = Array.from({ length: 12 }, (_, i) => ({ ...out.history, replacedAt: i }));
    expect(many.reduce((h, e) => withHistory(h, e), [] as any[]).length).toBe(MAX_PLAN_HISTORY);
  });

  it('previews each room’s price change before it is applied', () => {
    const p = replanPreview({ before: { rooms, boq }, after: { rooms: out.rooms, boq: out.boq }, bankMap, rules: PLAYGROUND_PRICING });
    const bed = p.rows.find(r => r.room === 'Master Bedroom')!;
    const living = p.rows.find(r => r.room === 'Living Room')!;
    expect(bed.change).toBeGreaterThan(0);   // a larger room: more wall to paint
    expect(living.change).toBeLessThan(0);   // a smaller one: less
    expect(p.total).toBe(p.rows.reduce((a, r) => a + r.change, 0));
    expect(bed.now).toEqual({ x: 2, y: 20, w: 12.5, h: 13 });
  });
});

describe('which plan a project shows', () => {
  it('uses its plan sheet, else the brief’s plan', () => {
    expect(sheetOf({ planSheet: { source: 'upload', imageUrl: 'u.png' }, floorplanImageUrl: 'b.png' })!.imageUrl).toBe('u.png');
    expect(sheetOf({ floorplanImageUrl: 'b.pdf' })).toEqual({ source: 'brief', imageUrl: 'b.pdf', page: 1 });
    expect(sheetOf({ floorplanImage: 'JVBERi0xLjQ' })!.imageUrl).toBe('data:application/pdf;base64,JVBERi0xLjQ');
    expect(sheetOf({})).toBeNull();
    expect(dataUrlOf('/9j/abc')).toBe('data:image/jpeg;base64,/9j/abc');
  });

  it('knows a PDF from its URL', () => {
    expect(isPdfSheet({ source: 'brief', imageUrl: 'https://x/o/studios%2Ft%2Fplans%2F1.pdf?alt=media&token=t' })).toBe(true);
    expect(isPdfSheet({ source: 'brief', imageUrl: 'data:application/pdf;base64,JVB' })).toBe(true);
    expect(isPdfSheet({ source: 'brief', imageUrl: 'https://x/o/1.jpg?alt=media' })).toBe(false);
    expect(isPdfSheet({ source: 'blocks' })).toBe(false);
  });
});

import { parseFeet } from '../../lib/playground/planSheet';

describe('typing a wall length', () => {
  it('reads feet and inches, and metric', () => {
    expect(parseFeet('12')).toBe(12);
    expect(parseFeet('12.5')).toBe(12.5);
    expect(parseFeet(`12'6"`)).toBe(12.5);
    expect(parseFeet('12′ 6″')).toBe(12.5);
    expect(parseFeet('12 ft 6 in')).toBe(12.5);
    expect(parseFeet('3.6 m')).toBe(11.81);
    expect(parseFeet('3600mm')).toBe(11.81);
    expect(parseFeet('360 cm')).toBe(11.81);
    expect(parseFeet('')).toBeNull();
    expect(parseFeet('long')).toBeNull();
    expect(parseFeet('0')).toBeNull();
  });
});
