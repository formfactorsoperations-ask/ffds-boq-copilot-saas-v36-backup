import { describe, it, expect } from 'vitest';
import { fitToNumber, scaledMarkups, workTotal, floorMarkupOf, tunable } from '../../lib/playground/tune';
import { PLAYGROUND_PRICING } from '../../lib/playground/pricing';
import { markupOf, markupForMargin } from '../../lib/playground/issues';

const bank: any[] = [
  { id: 'w', name: 'Sliding wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1500, labor: 400, margin: 30 },
  { id: 'k', name: 'Base units', cat: 'Modular Kitchen', unit: 'r ft', specs: '', materials: 7500, labor: 2000, margin: 25 },
  { id: 'p', name: 'Wall painting', cat: 'Painting', unit: 'sq ft', specs: '', materials: 20, labor: 10, margin: 12 },
  { id: 'b', name: 'Queen bed', cat: 'Furniture', unit: 'nos', specs: '', materials: 38000, labor: 0, margin: 20 },
];
const bankMap = new Map(bank.map(b => [b.id, b]));
const floors = { default: 15, byCategory: { 'Modular Kitchen': 18 } };
const ctx = { bankMap, rules: PLAYGROUND_PRICING, floors };
/* A Comfort Upgrade-sized BOQ: wardrobes, a kitchen, painting, and a bed the client buys. */
const boq: any[] = [
  { id: 'a', bankId: 'w', qty: 42, roomId: 'Master Bedroom' },
  { id: 'c', bankId: 'w', qty: 42, roomId: 'Bedroom 2' },
  { id: 'd', bankId: 'k', qty: 14, roomId: 'Kitchen' },
  { id: 'e', bankId: 'p', qty: 2600, roomId: 'Whole flat' },
  { id: 'f', bankId: 'b', qty: 1, roomId: 'Master Bedroom', boqStatus: 'client_procured' },
];
const mk = (l: any) => markupOf(l, bankMap.get(l.bankId));

describe('the client’s number', () => {
  const now = workTotal(boq, ctx);

  it('meets a number a little under the work, moving every markup by one factor', () => {
    const target = Math.round(now * 0.95);
    const r = fitToNumber(boq, target, ctx);
    expect(r.met).toBe(true);
    expect(r.total).toBeLessThanOrEqual(target);
    expect(target - r.total).toBeLessThan(1000);
    expect(r.lines.find(l => l.id === 'd')!.marginOverride).toBeLessThan(25);
  });

  it('never takes a line under its category’s floor, and says the gap when the floors stop it', () => {
    const r = fitToNumber(boq, Math.round(now * 0.6), ctx);
    expect(r.met).toBe(false);
    expect(r.gap).toBeGreaterThan(0);
    expect(r.total).toBe(r.floorTotal);
    r.lines.forEach(l => {
      if (!tunable(l, bankMap)) return;
      const before = mk(boq.find(b => b.id === l.id));
      expect(mk(l)).toBeGreaterThanOrEqual(Math.min(before, floorMarkupOf(l, bankMap, floors)) - 1e-6);
    });
    // The kitchen's own floor: an 18% margin is a 21.95% markup.
    expect(mk(r.lines.find(l => l.id === 'd'))).toBeCloseTo(markupForMargin(18), 1);
  });

  it('a line already under its floor is not pulled down further, nor raised by a cut', () => {
    const r = fitToNumber(boq, Math.round(now * 0.9), ctx);
    expect(mk(r.lines.find(l => l.id === 'e'))).toBe(12);
  });

  it('raises the markups to meet a number above the work', () => {
    const target = Math.round(now * 1.05);
    const r = fitToNumber(boq, target, ctx);
    expect(r.met).toBe(true);
    expect(r.total).toBeLessThanOrEqual(target);
    expect(r.factor).toBeGreaterThan(1);
  });

  it('leaves lines the client buys alone', () => {
    const r = fitToNumber(boq, Math.round(now * 0.9), ctx);
    expect(r.lines.find(l => l.id === 'f')).toBe(boq[4]);
  });
});

describe('scaling markups', () => {
  it('keeps the spread: every markup moves by the same factor', () => {
    const s = scaledMarkups(boq, 1.2, ctx);
    expect(s.find(l => l.id === 'a')!.marginOverride).toBe(36);
    expect(s.find(l => l.id === 'd')!.marginOverride).toBe(30);
  });
});
