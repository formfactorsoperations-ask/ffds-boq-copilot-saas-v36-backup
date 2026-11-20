import { describe, it, expect } from 'vitest';
import { journeyOf, finishChoice, askedLine, askDelta, withAsks, chaptersOf, piecesIn } from '../../lib/playground/meeting';
import { studioStandard } from '../../lib/materialSpecs';
import { withRecipeSpecs } from '../../lib/lineSpecs';
import { PLAYGROUND_PRICING, lineAmount } from '../../lib/playground/pricing';

const bank = studioStandard();
const items: any[] = [
  { id: 'w', name: 'Sliding wardrobe', cat: 'Carpentry', unit: 'sq ft', materials: 1500, labor: 400, margin: 25, specs: '' },
  { id: 'paint', name: 'Wall painting', cat: 'Painting', unit: 'sq ft', materials: 18, labor: 9, margin: 25, specs: 'Emulsion' },
];
const bankMap = new Map(items.map(i => [i.id, i]));
const wardrobe = withRecipeSpecs({ id: 'a', bankId: 'w', qty: 42, roomId: 'Bedroom', calcLength: 6, calcWidth: 7, sizeUnit: 'ft', place: { x: 3, y: 1.2, rot: 0 } } as any, items[0], bank, 'C');
const paint: any = { id: 'p', bankId: 'paint', qty: 300, roomId: 'Living' };
const rooms: any[] = [
  { name: 'Living', size: 182, unit: 'sq ft', plan: { x: 12, y: 0, w: 13, h: 14 } },
  { name: 'Bedroom', size: 120, unit: 'sq ft', plan: { x: 0, y: 0, w: 12, h: 10 } },
  { name: 'Store', size: 40, unit: 'sq ft', plan: { x: 25, y: 0, w: 5, h: 8 } },
];
const pricing = { rules: PLAYGROUND_PRICING, rooms };

describe('where the client is', () => {
  it('the layout approved and booked, from the journey', () => {
    expect(journeyOf(null)).toEqual({ booked: false, layoutApproved: false });
    expect(journeyOf([{ id: 'design_fee_received', status: 'done' }])).toEqual({ booked: true, layoutApproved: false });
    expect(journeyOf([{ id: 'space_planning_approved', status: 'done' }])).toEqual({ booked: true, layoutApproved: true });
    expect(journeyOf([{ id: 'space_planning_approved', status: 'active' }])).toEqual({ booked: false, layoutApproved: false });
  });
});

describe('a finish the client asks for', () => {
  it('offers the other finishes of the family, and prices the ask as the line is priced', () => {
    const c = finishChoice(bank, wardrobe, items[0])!;
    expect(c.options.length).toBeGreaterThan(1);
    expect(c.options.map(o => o.id)).toContain(c.current);
    expect(finishChoice(bank, paint, items[1])).toBeNull();
    const dearer = c.options.map(o => o.id).find(id => id !== c.current && askDelta([wardrobe], { a: id }, bank, bankMap, pricing) > 0)!;
    const asked = askedLine(bank, wardrobe, items[0], { a: dearer });
    expect(asked.materialSpecs![c.part].id).toBe(dearer);
    expect(asked.specs).not.toBe(wardrobe.specs);
    const d = askDelta([wardrobe, paint], { a: dearer }, bank, bankMap, pricing);
    expect(d).toBe(lineAmount(asked, bankMap, pricing) - lineAmount(wardrobe, bankMap, pricing));
    expect(d % 100).toBe(0);
    // Asking for what it already has is no change.
    expect(askDelta([wardrobe], { a: c.current }, bank, bankMap, pricing)).toBe(0);
    const next = withAsks([wardrobe, paint], { a: dearer }, bank, bankMap);
    expect(next[0].materialSpecs![c.part].id).toBe(dearer);
    expect(next[1]).toBe(paint);
  });
});

describe('the chapters', () => {
  it('welcome, home, each room with something in it, materials, the options when there are more than one, investment, next step', () => {
    expect(chaptersOf(rooms, [wardrobe, paint], 1).map(c => c.title)).toEqual(['Welcome', 'Your home', 'Living', 'Bedroom', 'Materials', 'Investment', 'Next step']);
    expect(chaptersOf(rooms, [wardrobe], 3).map(c => c.key)).toContain('options');
    expect(piecesIn([wardrobe, paint], bankMap, 'Bedroom').map(p => p.id)).toEqual(['a']);
    expect(piecesIn([wardrobe, paint], bankMap, 'Living')).toEqual([]);
  });
});
