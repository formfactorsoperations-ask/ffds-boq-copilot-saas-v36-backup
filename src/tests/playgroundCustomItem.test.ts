/*
  A custom item, added straight to the BOQ (lib/playground/custom.ts): what the
  Item Bank does not have, priced from its cost and margin, or from the rate
  the client pays with the trade's usual margin behind it.
*/
import { describe, it, expect } from 'vitest';
import { customItem, customDefaults, measureRoom, suggestMeasure, measuresFor } from '../../lib/playground/custom';
import { calculateSellPrice } from '../../lib/utils';

const bank: any[] = [
  { id: 'w', name: 'Wardrobe', cat: 'Carpentry', unit: 'sq ft', materials: 1000, labor: 400, margin: 20 },
  { id: 't', name: 'TV unit', cat: 'Carpentry', unit: 'sq ft', materials: 900, labor: 300, margin: 30 },
  { id: 'p', name: 'Wall paint', cat: 'Painting', unit: 'sq ft', materials: 20, labor: 10, margin: 25 },
];
const base = { name: 'Fluted feature wall', room: 'Living', cat: 'Carpentry', unit: 'sq ft', qty: 40, specs: ' Walnut veneer, brass inlay ', rate: 0, materials: 0, labor: 0, margin: 25 };
const newId = () => 'x1';

describe('a custom item', () => {
  it('the trades and units the bank uses, most used first, and each trade’s usual margin', () => {
    const d = customDefaults(bank);
    expect(d.cats).toEqual(['Carpentry', 'Painting', 'Others']);
    expect(d.units.slice(0, 3)).toEqual(['sq ft', 'nos', 'r ft']);
    expect(d.marginFor('Carpentry')).toBe(25);
    expect(d.marginFor('Glass')).toBe(25);
  });

  it('from its cost and margin (the finance roles)', () => {
    const r = customItem({ ...base, materials: 1500, labor: 500, margin: 22 }, 'cost', newId);
    expect(r).toEqual({ ok: true, item: { id: 'custom-x1', name: 'Fluted feature wall', cat: 'Carpentry', unit: 'sq ft', specs: 'Walnut veneer, brass inlay', materials: 1500, labor: 500, margin: 22 } });
  });

  it('from the rate the client pays (everyone else): the trade’s margin stands behind it, and the rate is kept', () => {
    const r = customItem({ ...base, rate: 2500, margin: 25 }, 'rate', newId);
    if (!r.ok) throw new Error('expected an item');
    expect(r.item).toMatchObject({ materials: 2000, labor: 0, margin: 25 });
    expect(calculateSellPrice(r.item.materials, r.item.labor, r.item.margin)).toBe(2500);
  });

  it('says what is missing', () => {
    expect(customItem({ ...base, name: ' ' }, 'rate', newId)).toEqual({ ok: false, problem: 'Give it a name.' });
    expect(customItem({ ...base, qty: 0, rate: 10 }, 'rate', newId)).toEqual({ ok: false, problem: 'Give it a quantity.' });
    expect(customItem(base, 'rate', newId)).toEqual({ ok: false, problem: 'Give it a rate.' });
    expect(customItem(base, 'cost', newId)).toEqual({ ok: false, problem: 'Give it a cost.' });
  });
});

describe('a custom work, measured from its room', () => {
  const room: any = { name: 'Bedroom', size: 120, unit: 'sq ft', plan: { x: 0, y: 0, w: 12, h: 10 }, height: 10, doors: 1 };
  it('the floor, the walls, the ceiling, or round the walls, as the Works tab measures', () => {
    expect(measureRoom('floor', room)).toEqual({ qty: 120, how: 'the floor, 12′ × 10′' });
    expect(measureRoom('walls', room)).toEqual({ qty: 419, how: '44′ of wall × 10′, less 1 door' });
    expect(measureRoom('walls7', room)).toEqual({ qty: 287, how: '44′ of wall × 7′, less 1 door' });
    expect(measureRoom('ceiling', room)!.qty).toBe(120);
    expect(measureRoom('perimeter', room)).toEqual({ qty: 44, how: 'round the walls, 44′' });
    expect(measureRoom('skirting', room)!.qty).toBe(41);
    expect(measureRoom('floor', { name: 'Store', unit: 'sq ft' } as any)).toBeNull();
  });
  it('what its name and unit suggest: wooden flooring by the floor, skirting round the walls, a count not measured', () => {
    expect(suggestMeasure('Wooden flooring replacement', 'sq ft')).toBe('floor');
    expect(suggestMeasure('Texture paint, feature wall', 'sq ft')).toBe('walls');
    expect(suggestMeasure('Dado tiles', 'sq ft')).toBe('walls7');
    expect(suggestMeasure('Cove lighting ceiling', 'sq ft')).toBe('ceiling');
    expect(suggestMeasure('Wooden skirting', 'r ft')).toBe('skirting');
    expect(suggestMeasure('Door closer', 'nos')).toBeNull();
    expect(measuresFor('nos')).toEqual([]);
    expect(measuresFor('r ft').map(m => m.id)).toEqual(['perimeter', 'skirting']);
  });
});
