/* Generated options and waiting lines, put on the plan in their rooms (lib/playground/placeAll). */
import { describe, it, expect } from 'vitest';
import { placeWaitingLines } from '../../lib/playground/placeAll';

const bank: any[] = [
  { id: 'wardrobe', name: 'Wardrobe', cat: 'Bedroom', unit: 'sq ft', materials: 1000, labor: 0, margin: 20 },
  { id: 'paint', name: 'Wall paint', cat: 'Painting', unit: 'sq ft', materials: 20, labor: 10, margin: 25 },
];
const bankMap = new Map(bank.map(i => [i.id, i]));
const rooms: any[] = [
  { name: 'Bedroom', size: 120, plan: { x: 0, y: 0, w: 12, h: 10 } },
  { name: 'Study', size: 80 },
];

describe('placing the waiting lines', () => {
  it('puts each drawing line in its own room on the plan, and leaves the rest', () => {
    const boq: any[] = [
      { id: 'a', bankId: 'wardrobe', qty: 42, roomId: 'Bedroom', calcLength: 6, calcWidth: 7, sizeUnit: 'ft' },
      { id: 'b', bankId: 'wardrobe', qty: 42, roomId: 'Study', calcLength: 6, calcWidth: 7, sizeUnit: 'ft' },
      { id: 'c', bankId: 'paint', qty: 300, roomId: 'Bedroom' },
    ];
    const r = placeWaitingLines(boq, rooms, bankMap);
    expect(r.placed).toBe(1);
    expect(r.waiting).toBe(1);
    const a = r.boq.find(l => l.id === 'a')!;
    expect(a.place).toBeTruthy();
    expect(a.place!.x).toBeGreaterThanOrEqual(0);
    expect(a.place!.x).toBeLessThanOrEqual(12);
    expect(r.boq.find(l => l.id === 'b')!.place).toBeUndefined();
    expect(r.boq.find(l => l.id === 'c')).toEqual(boq[2]);
  });

  it('does not move a piece already placed, and changes nothing with no room on the plan', () => {
    const placedLine: any = { id: 'a', bankId: 'wardrobe', qty: 42, roomId: 'Bedroom', calcLength: 6, calcWidth: 7, sizeUnit: 'ft', place: { x: 4, y: 1.2, rot: 0, depthFt: 2 } };
    expect(placeWaitingLines([placedLine], rooms, bankMap).boq[0]).toBe(placedLine);
    const boq: any[] = [{ id: 'z', bankId: 'wardrobe', qty: 42, roomId: 'Bedroom', calcLength: 6, calcWidth: 7, sizeUnit: 'ft' }];
    const none = placeWaitingLines(boq, [{ name: 'Bedroom', size: 120 } as any], bankMap);
    expect(none.boq).toBe(boq);
    expect(none.placed).toBe(0);
  });
});
