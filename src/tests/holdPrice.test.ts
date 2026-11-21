import { describe, it, expect } from 'vitest';
import { boqTotal, buildBankMap, holdPrice, holdPrices, isUnpriced, lineSellRate, resolveBoqLine } from '../../lib/boqPricing';
import { generateStandardPackages } from '../../lib/standardPackages';
import { INITIAL_BANK } from '../../constants';
import { INITIAL_TEMPLATES } from '../../lib/standardPackages';
import { rateEffects, withStandardRate } from '../../lib/bankDuplicates';

/*
  A new line holds its item's price from the moment it is added. Before, a line
  took what it did not hold from the bank each time it was drawn, so a bank edit
  re-priced every project using the item, and a project had to be locked again
  after every line added to it.
*/

const item = (id: string, name: string, over: any = {}): any => ({
  id, name, cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1260, labor: 540, margin: 15, ...over,
});

describe('holdPrice', () => {
  const bed = item('gen-015', 'KING SIZE BED WITH STORAGE');

  it('writes the three figures the line would borrow, and sells at the same rate', () => {
    const line = { id: 'l', bankId: 'gen-015', qty: 40 };
    const held = holdPrice(line, bed);
    expect(held).toEqual({ id: 'l', bankId: 'gen-015', qty: 40, baseRate: 1260, labor: 540, marginOverride: 15 });
    expect(lineSellRate(held, bed)).toBe(lineSellRate(line, bed));
    expect(line).toEqual({ id: 'l', bankId: 'gen-015', qty: 40 });
  });

  it('keeps every figure the line already holds', () => {
    expect(holdPrice({ id: 'l', bankId: 'gen-015', qty: 1, baseRate: 1500, marginOverride: 0 }, bed)).toMatchObject({ baseRate: 1500, labor: 540, marginOverride: 0 });
    expect(holdPrice({ id: 'l', bankId: 'gen-015', qty: 1, labor: 0 }, bed)).toMatchObject({ baseRate: 1260, labor: 0, marginOverride: 15 });
    expect(holdPrice({ id: 'l', bankId: 'gen-015', qty: 1, marginOverride: null }, bed).marginOverride).toBe(15);
    const whole = { id: 'l', bankId: 'gen-015', qty: 1, baseRate: 1, labor: 2, marginOverride: 3 };
    expect(holdPrice(whole, bed)).toBe(whole);
  });

  it('then does not move when the bank does', () => {
    const held = holdPrice({ id: 'l', bankId: 'gen-015', qty: 40 }, bed);
    const dearer = { ...bed, materials: 1500, labor: 700, margin: 30 };
    expect(lineSellRate(held, dearer)).toBe(2070);
    expect(lineSellRate({ id: 'l', bankId: 'gen-015', qty: 40 }, dearer)).not.toBe(2070);
  });

  it('leaves a line to follow an item that has no cost yet, so pricing it in the bank reaches the line', () => {
    const unpriced = item('calc-1', 'CORE CUTTING', { materials: 0, labor: 0, margin: 0 });
    const line = { id: 'l', bankId: 'calc-1', qty: 3 };
    expect(holdPrice(line, unpriced)).toBe(line);
    expect(lineSellRate(line, { ...unpriced, materials: 800, labor: 200, margin: 20 })).toBe(1200);
  });

  it('tells an item with no price from a priced one, so the add-item picker writes no ₹0 materials onto its line', () => {
    const unpriced: any = { materials: 0, labor: 0, margin: 15 };
    expect(isUnpriced(unpriced)).toBe(true);
    expect(isUnpriced({ materials: 1260, labor: 540 } as any)).toBe(false);
    expect(isUnpriced({ materials: 0, labor: 540 } as any)).toBe(false);
    // Figures that are not plain numbers are not "unpriced": they are left as they were.
    expect(isUnpriced({ materials: [1440], labor: [] } as any)).toBe(false);
    expect(isUnpriced(null)).toBe(false);
    // The picker's line, as components/StudioDashboard.tsx builds it.
    const picked = (item: any) => holdPrice({ id: 'l', bankId: 'x', qty: 1, ...(isUnpriced(item) ? {} : { baseRate: item.materials }) }, item);
    const line = picked(unpriced);
    expect(line).not.toHaveProperty('baseRate');
    // Priced in the bank afterwards: the line reads the new price whole.
    expect(lineSellRate(line, { materials: 1000, labor: 0, margin: 15 })).toBeCloseTo(1150, 5);
    // The old line (materials ₹0 written on it) never saw the materials figure.
    expect(lineSellRate({ ...line, baseRate: 0 }, { materials: 1000, labor: 0, margin: 15 })).toBe(0);
  });

  it('leaves alone an item whose figures are not plain numbers, and a line with no item', () => {
    const line = { id: 'l', bankId: 'x', qty: 1 };
    expect(holdPrice(line, item('x', 'PANEL', { materials: [1440], labor: [], margin: 0 }))).toBe(line);
    expect(holdPrice(line, item('x', 'PANEL', { materials: '1440' }))).toBe(line);
    expect(holdPrice(line, undefined)).toBe(line);
    expect(holdPrice(line, null)).toBe(line);
  });

  it('holds every line of an option from the item each points at, and moves no total', () => {
    const bank = [bed, item('gen-014', 'WARDOBE WITH LOFT', { materials: 1295, labor: 555 })];
    const map = buildBankMap(bank, []);
    const boq = [{ id: 'a', bankId: 'gen-015', qty: 40 }, { id: 'b', bankId: 'gen-014', qty: 60, baseRate: 1400 }, { id: 'c', bankId: 'gone', qty: 1, name: 'Old shelf', baseRate: 900 }];
    const held = holdPrices(boq, map);
    expect(boqTotal(held, map)).toBe(boqTotal(boq, map));
    held.forEach((l, n) => expect(resolveBoqLine(l, map)).toEqual(resolveBoqLine(boq[n], map)));
    expect(held[2]).toBe(boq[2]);
  });
});

describe('a new project\'s packages hold their prices', () => {
  const ctx: any = { name: 'Lodha Amara', config: '2BHK', area: 850, designFee: 10, rooms: [
    { id: 'r1', name: 'Living Room', size: 220 }, { id: 'r2', name: 'Master Bedroom', size: 150 }, { id: 'r3', name: 'Kitchen', size: 90 },
  ] };
  const tiers = generateStandardPackages(ctx, INITIAL_BANK, INITIAL_TEMPLATES, 'tiered');
  const map = buildBankMap(INITIAL_BANK, []);

  it('every priced line carries its whole price', () => {
    const lines = tiers.flatMap(t => t.boq);
    expect(lines.length).toBeGreaterThan(10);
    lines.forEach(l => {
      const it = map.get(l.bankId)!;
      if (it.materials + it.labor <= 0) return;
      expect(typeof l.baseRate).toBe('number');
      expect(typeof (l as any).labor).toBe('number');
      expect(typeof l.marginOverride).toBe('number');
    });
  });

  it('so the standard rate of an item they use can be changed without re-pricing them', () => {
    const used = map.get(tiers[0].boq[0].bankId)!;
    const project: any = { id: 'p', context: ctx, tiers };
    expect(rateEffects(INITIAL_BANK, withStandardRate(used, Math.round(lineSellRate({}, used) * 1.1)), [project])).toEqual([]);
  });
});
