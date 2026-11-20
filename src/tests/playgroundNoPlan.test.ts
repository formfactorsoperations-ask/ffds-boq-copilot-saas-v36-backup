import { describe, it, expect } from 'vitest';
import { tidySketch, sketchName, sketchRects, withNewPlan, type SketchRoom } from '../../lib/playground/sketch';
import { quickRooms, packRooms, sizeOf, standardLines, standardRooms, itemForStandard, quickBuild } from '../../lib/playground/quickBuild';
import { resizeRoom } from '../../lib/playground/roomEdges';
import { placeRooms } from '../../lib/playground/planSheet';
import { drawOf } from '../../lib/playground/pieces';

const area = (rs: { w: number; h: number }[]) => rs.reduce((a, r) => a + r.w * r.h, 0);
const onGrid = (v: number) => Math.abs(v * 4 - Math.round(v * 4)) < 1e-6;
const noOverlaps = (rs: { x: number; y: number; w: number; h: number }[]) => {
  for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) {
    const A = rs[a], B = rs[b];
    const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
    const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
    if (ox > 0.01 && oy > 0.01) return false;
  }
  return true;
};

/* The mockup's rough 2BHK sketch (Joshi – 2BHK, 650 sq ft). */
const SKETCH: SketchRoom[] = [
  { id: 's1', name: 'Living', x: 0.3, y: 0.2, w: 13.4, h: 13.6 },
  { id: 's2', name: 'Kitchen', x: 14.1, y: 0.6, w: 8.6, h: 7.7 },
  { id: 's3', name: 'Dining', x: 13.5, y: 8.6, w: 9.4, h: 6 },
  { id: 's4', name: 'Bedroom', x: 0, y: 14.5, w: 12.6, h: 12.4 },
  { id: 's5', name: 'Bathroom', x: 12.9, y: 14.2, w: 4.3, h: 6.6 },
  { id: 's6', name: 'Bedroom 2', x: 17.6, y: 14.9, w: 9.6, h: 12.2 },
];

describe('tidying a sketch', () => {
  const t = tidySketch(SKETCH, 650);
  const by = (n: string) => t.rooms.find(r => r.name === n)!;

  it('has shared walls, no overlaps, and rooms summing to the carpet area within 1%', () => {
    expect(noOverlaps(t.rooms)).toBe(true);
    expect(Math.abs(area(t.rooms) - 650) / 650).toBeLessThan(0.01);
    // Living's right wall is the kitchen's and the dining room's left wall.
    expect(by('Living').x + by('Living').w).toBe(by('Kitchen').x);
    expect(by('Kitchen').x).toBe(by('Dining').x);
    // The kitchen's floor is the dining room's ceiling; the bedrooms line up under the living room.
    expect(by('Kitchen').y + by('Kitchen').h).toBe(by('Dining').y);
    expect(by('Living').y + by('Living').h).toBe(by('Bedroom').y);
  });

  it('rounds every size to 3″ and says what it did', () => {
    t.rooms.forEach(r => [r.x, r.y, r.x + r.w, r.y + r.h].forEach(v => expect(onGrid(v)).toBe(true)));
    expect(t.lined).toBeGreaterThan(0);
    expect(t.notes[0]).toMatch(/edges lined up, so rooms share their walls/);
    expect(t.notes[2]).toMatch(/so the rooms add up to 650 sq ft, the carpet area in the brief/);
    expect(t.notes[3]).toBe('Every size rounded to 3″');
  });

  it('removes overlaps: the smaller room gives way', () => {
    const r = tidySketch([
      { id: 'a', name: 'Bedroom', x: 0, y: 0, w: 12, h: 12 },
      { id: 'b', name: 'Bathroom', x: 9, y: 2, w: 7, h: 6 },
    ], 200);
    expect(r.overlaps).toBe(1);
    expect(noOverlaps(r.rooms)).toBe(true);
    expect(r.notes[1]).toBe('1 overlap removed');
  });

  it('a room drawn inside another cuts the larger one', () => {
    const r = tidySketch([
      { id: 'a', name: 'Bedroom', x: 0, y: 0, w: 14, h: 12 },
      { id: 'b', name: 'Bathroom', x: 9, y: 0, w: 5, h: 6 },
    ], 168);
    expect(noOverlaps(r.rooms)).toBe(true);
    expect(r.rooms.every(x => x.w >= 2 && x.h >= 2)).toBe(true);
  });

  it('names boxes Bedroom, Bedroom 2; unnamed boxes become Room', () => {
    expect(sketchName('Bedroom', [{ id: 'a', name: 'Bedroom' }], 'b')).toBe('Bedroom 2');
    expect(sketchName('Kitchen', [{ id: 'a', name: 'Bedroom' }], 'b')).toBe('Kitchen');
    expect(sketchRects([{ id: 'a', name: '', x: 0, y: 0, w: 5, h: 5 }, { id: 'b', name: '', x: 5, y: 0, w: 5, h: 5 }]).map(r => r.name)).toEqual(['Room', 'Room 2']);
  });
});

describe('a new plan, applied', () => {
  const bank: any[] = [{ id: 'w', name: 'Sliding wardrobe', cat: 'Carpentry', unit: 'sq ft', materials: 1500, labor: 400, margin: 25 }];
  const bankMap = new Map(bank.map(b => [b.id, b]));
  const rooms: any[] = [{ name: 'Bedroom', size: 100, unit: 'sq ft', plan: { x: 0, y: 0, w: 10, h: 10 } }, { name: 'Whole flat', size: 0, unit: 'sq ft' }];
  const piece = { id: 'p', bankId: 'w', qty: 42, roomId: 'Bedroom', calcLength: 6, calcWidth: 7, sizeUnit: 'ft', place: { x: 3.5, y: 1.1, rot: 0, depthFt: 2 } };
  const tiers: any[] = [{ id: 't1', boq: [piece] }, { id: 'signed', boq: [piece] }];

  it('rooms matched by name take their rectangles, pieces move with them, the signed option stays, the old plan is kept', () => {
    const out = withNewPlan({
      ctx: { rooms, planSheet: { source: 'blocks' } }, tiers, activeTierId: 't1', lockedTierId: 'signed', bankMap,
      rects: sketchRects([{ id: 'a', name: 'Bedroom', x: 20, y: 5, w: 12, h: 11 }, { id: 'b', name: 'Kids room', kind: 'bedroom', x: 32, y: 5, w: 10, h: 11 }]),
      sheet: { source: 'sketch' }, at: 5, by: 'Priya D.',
    });
    expect(out.planSheet.source).toBe('sketch');
    expect(out.rooms.find(r => r.name === 'Bedroom')!.plan).toEqual({ x: 20, y: 5, w: 12, h: 11 });
    expect(out.rooms.find(r => r.name === 'Bedroom')!.size).toBe(132);
    expect(out.rooms.find(r => r.name === 'Kids room')!.kind).toBe('bedroom');
    expect(out.rooms.some(r => r.name === 'Whole flat')).toBe(true);
    expect(out.tiers[0].boq![0].place).toMatchObject({ x: 23.5, y: 6.1 });
    expect(out.tiers[1]).toBe(tiers[1]);
    expect(out.planHistory![0]).toMatchObject({ sheet: { source: 'blocks' }, replacedAt: 5, by: 'Priya D.' });
  });

  it('a project with no plan before keeps no history', () => {
    const out = withNewPlan({ ctx: { rooms: [] }, tiers: [{ id: 't', boq: [] }] as any, bankMap, rects: [{ name: 'Living', plan: { x: 0, y: 0, w: 12, h: 14 } }], sheet: { source: 'sketch' }, at: 1 });
    expect(out.planHistory).toBeUndefined();
    expect(out.added).toEqual(['Living']);
  });
});

describe('the quick build', () => {
  it('reads the size from the configuration', () => {
    expect(sizeOf('3BHK')).toBe('3-BHK');
    expect(sizeOf('2 bhk')).toBe('2-BHK');
    expect(sizeOf('Villa')).toBe('2-BHK');
    expect(standardRooms('4-BHK').filter(r => /Bathroom/.test(r.name))).toHaveLength(3);
  });

  it('quick-build room areas sum to the carpet area within 1%, packed with shared walls and no overlaps', () => {
    for (const size of ['1-BHK', '2-BHK', '3-BHK', '4-BHK'] as const) {
      for (const carpet of [450, 650, 937, 1240, 1800]) {
        const { rooms } = quickRooms(size, carpet);
        expect(Math.abs(rooms.reduce((a, r) => a + r.area, 0) - carpet)).toBeLessThan(0.01);
        const rects = packRooms(rooms).map(r => r.plan);
        expect(rects).toHaveLength(rooms.length);
        expect(noOverlaps(rects)).toBe(true);
        expect(Math.abs(area(rects) - carpet) / carpet).toBeLessThan(0.01);
        rects.forEach(r => [r.x, r.y, r.x + r.w, r.y + r.h].forEach(v => expect(onGrid(v)).toBe(true)));
        // No room comes out as a strip: none longer than three times its width.
        rects.forEach(r => expect(Math.max(r.w / r.h, r.h / r.w)).toBeLessThanOrEqual(3));
      }
    }
  });

  it('uses the project’s own rooms when it has their sizes', () => {
    const own: any[] = [{ name: 'Living', size: 300 }, { name: 'Bedroom', size: 150 }, { name: 'Store', size: 0 }];
    const q = quickRooms('2-BHK', 900, own);
    expect(q.from).toBe('project');
    expect(q.rooms.map(r => [r.name, r.area])).toEqual([['Living', 600], ['Bedroom', 300]]);
  });
});

describe('room standards', () => {
  const I = (id: string, name: string, cat: string, unit: string) => ({ id, name, cat, unit, materials: 1000, labor: 200, margin: 25, specs: '' });
  const bank: any[] = [
    I('w', 'Sliding wardrobe', 'Carpentry', 'sq ft'), I('b', 'Queen bed with storage', 'Furniture', 'nos'), I('tv', 'TV unit with drawers', 'Carpentry', 'sq ft'),
    I('k', 'Base units', 'Modular kitchen', 'r ft'), I('o', 'Overhead cabinets', 'Modular kitchen', 'r ft'), I('v', 'Vanity unit with mirror', 'Carpentry', 'nos'),
    I('d', 'Study table with shelf', 'Carpentry', 'sq ft'),
  ];
  let n = 0;
  const newId = () => `n${++n}`;
  const { rooms: qr } = quickRooms('3-BHK', 1240);
  const placed = placeRooms(qr.map(r => ({ name: r.name, size: r.area, unit: 'sq ft' as const, kind: r.kind })), packRooms(qr)).rooms;

  it('every standard lands or waits under Needs a place; one with no item is named', () => {
    const out = standardLines({ rooms: placed, bank, newId });
    expect(out.lines.length).toBe(out.placed + out.waiting.length);
    expect(out.lines.length).toBeGreaterThanOrEqual(10);
    out.lines.forEach(l => expect(!!drawOf(bank.find(b => b.id === l.bankId))).toBe(true));
    expect(out.missing).toEqual([]);
    const dining = standardLines({ rooms: [{ name: 'Dining', size: 100, unit: 'sq ft', plan: { x: 0, y: 0, w: 10, h: 10 } }] as any, bank, newId });
    expect(dining.missing).toEqual(['Crockery unit']);
    // Three bedrooms: a wardrobe and a bed each; the kids' room a study table too.
    expect(out.lines.filter(l => l.bankId === 'w')).toHaveLength(3);
    expect(out.lines.filter(l => l.bankId === 'd').map(l => l.roomId)).toEqual(['Kids Bedroom']);
    // A wardrobe at its standard size: 6′ × 7′ = 42 sq ft.
    expect(out.lines.find(l => l.bankId === 'w')!.qty).toBe(42);
    // The kitchen counter runs along the longer wall.
    expect(out.lines.find(l => l.bankId === 'k')!.qty).toBeGreaterThanOrEqual(6);
  });

  it('a piece with no free wall waits, keeping its size; a room that has one is not given another', () => {
    const tiny: any[] = [{ name: 'Bedroom', size: 16, unit: 'sq ft', plan: { x: 0, y: 0, w: 4, h: 4 } }];
    const out = standardLines({ rooms: tiny, bank, newId });
    expect(out.waiting).toEqual(['Sliding wardrobe in Bedroom', 'Queen bed with storage in Bedroom']);
    expect(out.lines.every(l => !l.place)).toBe(true);
    expect(out.lines[0].qty).toBe(42);
    const again = standardLines({ rooms: tiny, bank, boq: out.lines, newId });
    expect(again.lines).toEqual([]);
  });

  it('a 3BHK BOQ is built with no plan well inside 10 seconds', () => {
    const t0 = performance.now();
    const qb = quickBuild({ size: '3-BHK', carpet: 1240, bank, newId });
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(qb.rects).toHaveLength(8);
    expect(qb.standard.lines.length).toBe(qb.standard.placed + qb.standard.waiting.length);
  });

  it('the studio’s standards replace the defaults for a kind', () => {
    const out = standardLines({ rooms: [{ name: 'Living', size: 200, unit: 'sq ft', plan: { x: 0, y: 0, w: 16, h: 13 } }] as any, bank, newId, standards: { living: [{ kind: 'wardrobe', w: 4, h: 7, label: 'Coat cupboard' }] } });
    expect(out.lines.map(l => l.bankId)).toEqual(['w']);
    expect(itemForStandard({ kind: 'cabinet', name: 'crockery', label: 'x' }, bank)).toBeUndefined();
  });
});

describe('room sizes by handle', () => {
  const bank: any[] = [{ id: 'w', name: 'Sliding wardrobe', cat: 'Carpentry', unit: 'sq ft', materials: 1500, labor: 400, margin: 25 }];
  const bankMap = new Map(bank.map(b => [b.id, b]));
  const rooms: any[] = [
    { name: 'Bedroom', size: 120, unit: 'sq ft', plan: { x: 0, y: 0, w: 12, h: 10 } },
    { name: 'Bath', size: 50, unit: 'sq ft', plan: { x: 12, y: 0, w: 5, h: 10 } },
    { name: 'Living', size: 170, unit: 'sq ft', plan: { x: 0, y: 10, w: 17, h: 10 } },
  ];
  // A wardrobe against the bedroom's right wall, turned to face into the room.
  const boq: any[] = [{ id: 'p', bankId: 'w', qty: 42, roomId: 'Bedroom', calcLength: 6, calcWidth: 7, sizeUnit: 'ft', place: { x: 10.88, y: 5, rot: 90, depthFt: 2 } }];

  it('pulling a shared wall moves it for both rooms, and the pieces against it', () => {
    const r = resizeRoom({ rooms, boq, bankMap, name: 'Bedroom', edge: 'right', to: 13.1 })!;
    expect(r.changed).toEqual(['Bedroom', 'Bath']);
    expect(r.rooms[0].plan).toEqual({ x: 0, y: 0, w: 13, h: 10 });
    expect(r.rooms[0].size).toBe(130);
    expect(r.rooms[1].plan).toEqual({ x: 13, y: 0, w: 4, h: 10 });
    expect(r.rooms[2]).toBe(rooms[2]);
    expect(r.boq[0].place.x).toBeCloseTo(11.88);
  });

  it('a room whose wall runs on past the pulled one stays put, and the wall cannot be pulled into it', () => {
    // Living's top wall is under both the bedroom and the bath.
    const grow = resizeRoom({ rooms, boq, bankMap, name: 'Bath', edge: 'bottom', to: 12 });
    expect(grow).toBeNull();
    const shrink = resizeRoom({ rooms, boq, bankMap, name: 'Bath', edge: 'bottom', to: 8 })!;
    expect(shrink.changed).toEqual(['Bath']);
    expect(shrink.rooms[2]).toBe(rooms[2]);
    expect(shrink.rooms[1].plan).toEqual({ x: 12, y: 0, w: 5, h: 8 });
  });

  it('never takes a room under 3 ft', () => {
    const r = resizeRoom({ rooms, boq, bankMap, name: 'Bedroom', edge: 'right', to: 20 })!;
    expect(r.rooms[1].plan!.w).toBe(3);
    expect(resizeRoom({ rooms, boq, bankMap, name: 'Bedroom', edge: 'left', to: 0.1 })).toBeNull();
  });
});
