import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { buildBankMap, lineSellRate, resolveBoqLine } from '../../lib/boqPricing';
import { generateLocalComparison } from '../../lib/comparison';
import { planPriceLock } from '../../lib/priceLock';

/*
  One reading of what a line sells at.

  Revision Studio and the proposal's options comparison priced a line with the
  bank's labour (and, in the comparison, its materials) whatever the line held.
  They showed a rate the BOQ did not, and a line whose price had been locked
  still moved there when the bank did.
*/

const item = (id: string, name: string, over: any = {}): any => ({
  id, name, cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1260, labor: 540, margin: 15, ...over,
});

describe('lineSellRate', () => {
  const bank = [item('gen-016', 'TV WALL PANELLING', { materials: 900, labor: 395, margin: 25 })];
  const map = buildBankMap(bank, []);

  it('takes each figure from the line first, then the item', () => {
    expect(lineSellRate({}, bank[0])).toBeCloseTo((900 + 395) * 1.25, 6);
    expect(lineSellRate({ baseRate: 1000 }, bank[0])).toBeCloseTo((1000 + 395) * 1.25, 6);
    expect(lineSellRate({ baseRate: 1000, labor: 400, marginOverride: 25 }, bank[0])).toBe(1750);
    expect(lineSellRate({ labor: 0, marginOverride: 0 }, bank[0])).toBe(900);
  });

  it('is what the BOQ prices the line at', () => {
    [{}, { baseRate: 1000 }, { labor: 400 }, { marginOverride: 10 }, { baseRate: 1000, labor: 400, marginOverride: 25 }, { marginOverride: null }, { labor: null }].forEach(over => {
      const line = { id: 'l', bankId: 'gen-016', qty: 21, ...over };
      expect(lineSellRate(line, bank[0])).toBe(resolveBoqLine(line, map).rate);
    });
  });

  it('holds a locked line still when the bank moves', () => {
    const project: any = { id: 'p', context: { name: 'Lodha Splendora' }, tiers: [{ id: 't', name: 'Comfort Upgrade', boq: [{ id: 'l', bankId: 'gen-016', qty: 21, baseRate: 1000, marginOverride: 25 }] }] };
    const locked = planPriceLock(project, bank).project.tiers[0].boq[0];
    const dearer = { ...bank[0], materials: 1200, labor: 700, margin: 40 };
    expect(lineSellRate(locked, dearer)).toBe(lineSellRate(locked, bank[0]));
    expect(lineSellRate(project.tiers[0].boq[0], dearer)).not.toBe(lineSellRate(project.tiers[0].boq[0], bank[0]));
  });
});

describe('the proposal\'s options comparison', () => {
  const bank = [item('p1', 'INTERIOR PAINTING (Standard)', { cat: 'Painting', materials: 30, labor: 15, margin: 20 })];
  const tier = (name: string, line: any): any => ({ id: name, name, timestamp: 1, boq: [{ id: 'l1', bankId: 'p1', qty: 1800, roomId: 'Living Room', ...line }], summary: {} });
  const paint = (tiers: any[]) => generateLocalComparison(tiers, bank).materialMatrix.find((r: any) => r.feature === 'Paint Finish') as any;

  it('prints the rate this option\'s line sells at, not the bank\'s', () => {
    const row = paint([tier('Bank rate', {}), tier('Project rate', { baseRate: 35, labor: 19, marginOverride: 20 })]);
    expect(row['Bank rate']).toContain('₹ 54/sq ft');
    expect(row['Project rate']).toContain('₹ 65/sq ft');
  });

  it('gives the range of its lines\' own rates', () => {
    const two: any = { id: 'x', name: 'Two rooms', timestamp: 1, summary: {}, boq: [
      { id: 'a', bankId: 'p1', qty: 10, roomId: 'Living Room', baseRate: 35, labor: 19, marginOverride: 20 },
      { id: 'b', bankId: 'p1', qty: 10, roomId: 'Kitchen', baseRate: 30, labor: 15, marginOverride: 0 },
    ] };
    expect(paint([two])['Two rooms']).toContain('₹ 45-₹ 65/sq ft');
  });
});

describe('no screen prices a line with the bank\'s figures alone', () => {
  const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), 'utf8');
  /* A call that hands a bank item's labour or materials straight to the price sum, skipping the line. */
  const BANK_ONLY = /calculateSellPrice\(\s*(?:[^()]|\([^()]*\))*?\b(?:bankItem|initialBankItem)\??\.(?:labor|materials)\b/;

  it.each([
    'components/RevisionStudio.tsx',
    'components/client/ClientTab.tsx',
    'components/InternalComparisonTable.tsx',
    'lib/comparison.ts',
  ])('%s', (file) => {
    expect(BANK_ONLY.test(read(file))).toBe(false);
  });

  it('and the check does catch the reading it replaces', () => {
    expect(BANK_ONLY.test('rate = calculateSellPrice(\n  boqItem.baseRate !== undefined ? boqItem.baseRate : bankItem.materials,\n  bankItem.labor,\n  m);')).toBe(true);
    expect(BANK_ONLY.test('const rate = calculateSellPrice(bankItem.materials, bankItem.labor, effectiveMargin);')).toBe(true);
    expect(BANK_ONLY.test('rate = lineSellRate(boqItem, bankItem);')).toBe(false);
  });
});
