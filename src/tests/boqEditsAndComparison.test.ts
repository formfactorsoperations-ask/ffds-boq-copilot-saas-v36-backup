import { describe, it, expect } from 'vitest';
import { removeLines, restoreLines } from '../../lib/boqEdits';
import { compareTiers, optionPrice } from '../../lib/tierComparison';
import { boqTotal, buildBankMap } from '../../lib/boqPricing';
import { calculateSellPrice } from '../../lib/utils';

describe('removeLines / restoreLines', () => {
  const boq = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('removes the lines asked for and remembers where they were', () => {
    const { boq: kept, removed } = removeLines(boq, ['b', 'd']);
    expect(kept.map(l => l.id)).toEqual(['a', 'c']);
    expect(removed).toEqual([{ line: { id: 'b' }, index: 1 }, { line: { id: 'd' }, index: 3 }]);
  });

  it('puts them back in their old places', () => {
    const { boq: kept, removed } = removeLines(boq, ['a', 'c']);
    expect(restoreLines(kept, removed).map(l => l.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps lines added since the delete, and never duplicates', () => {
    const { boq: kept, removed } = removeLines(boq, ['b']);
    const later = [...kept, { id: 'e' }];
    expect(restoreLines(later, removed).map(l => l.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(restoreLines(restoreLines(later, removed), removed)).toHaveLength(5);
  });

  it('ignores ids that are not there', () => {
    expect(removeLines(boq, ['zz']).removed).toEqual([]);
  });
});

/*
  The Pricing & Tiers mismatch, as a fixture.

  App computes each tier's summary with this rule (tiersWithCalculatedSummaries):
  frozen baseRate over the bank's materials, the line's labour over the bank's,
  margin override over the bank's, and only billable lines counted. The
  comparison used to price differently, so its cards disagreed with the sidebar.
*/
const bank = [
  { id: 'wardrobe', name: 'Wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1000, labor: 400, margin: 20 },
  { id: 'paint', name: 'Wall paint', cat: 'Painting', unit: 'sq ft', specs: '', materials: 20, labor: 10, margin: 25 },
  { id: 'kitchen', name: 'Kitchen base unit', cat: 'Modular Kitchen', unit: 'sq ft', specs: '', materials: 2400, labor: 800, margin: 10 },
];
const adHoc = [{ id: 'adhoc-mirror', name: 'Custom mirror', cat: 'Glass & Mirror', unit: 'nos', specs: '', materials: 5000, labor: 500, margin: 15 }];

const essential: any = {
  id: 'ess', name: 'Essential', timestamp: 1,
  boq: [
    { id: 'e1', bankId: 'wardrobe', qty: 40, baseRate: 900, rationale: 'Base spec: 0.8mm laminate' },
    { id: 'e2', bankId: 'paint', qty: 800, rationale: 'Base spec: 0.8mm laminate' },
    // A deleted line is in the BOQ but not in the price.
    { id: 'e3', bankId: 'kitchen', qty: 30, boqStatus: 'deleted' },
  ],
};
const comfort: any = {
  id: 'com', name: 'Comfort', timestamp: 2,
  boq: [
    // The line's own labour, not the bank's.
    { id: 'c1', bankId: 'wardrobe', qty: 40, baseRate: 1100, labor: 450, rationale: 'Mid spec: 1mm laminate' },
    { id: 'c2', bankId: 'paint', qty: 800, marginOverride: 30, rationale: 'Mid spec: 1mm laminate' },
    { id: 'c3', bankId: 'kitchen', qty: 30, selectedRate: 1, rationale: 'Mid spec: 1mm laminate' },
    { id: 'c4', bankId: 'adhoc-mirror', qty: 2, rationale: 'Added via Focus Studio Workspace' },
    { id: 'c5', bankId: 'paint', qty: 100, boqStatus: 'substituted' },
  ],
};

const bankMap = buildBankMap(bank as any, adHoc as any);

describe('compareTiers', () => {
  const cmp = compareTiers([essential, comfort], bankMap);

  it('prices each option exactly as the tier summary does', () => {
    expect(cmp.totals.ess).toBeCloseTo(boqTotal(essential.boq, bankMap), 6);
    expect(cmp.totals.com).toBeCloseTo(boqTotal(comfort.boq, bankMap), 6);
    // Spelled out for Essential: (900+400)×1.2×40 + (20+10)×1.25×800
    expect(cmp.totals.ess).toBeCloseTo(62400 + 30000, 6);
  });

  it('uses the line labour override, not the bank labour', () => {
    const row = cmp.all.find(r => r.bankId === 'wardrobe')!;
    expect(row.cells.com.rate).toBeCloseTo(calculateSellPrice(1100, 450, 20));
  });

  it('does not let a stale selectedRate replace the frozen cost', () => {
    const row = cmp.all.find(r => r.bankId === 'kitchen')!;
    expect(row.cells.com.rate).toBeCloseTo(calculateSellPrice(2400, 800, 10));
  });

  it('leaves deleted and substituted lines out', () => {
    const kitchen = cmp.all.find(r => r.bankId === 'kitchen')!;
    expect(kitchen.cells.ess).toBeUndefined();
    const paint = cmp.all.find(r => r.bankId === 'paint')!;
    expect(paint.cells.com.qty).toBe(800);
  });

  it('keeps ad-hoc items, which the bank alone does not have', () => {
    const mirror = cmp.all.find(r => r.bankId === 'adhoc-mirror')!;
    expect(mirror.cat).toBe('Glass & Mirror');
    expect(mirror.cells.com.value).toBeCloseTo(calculateSellPrice(5000, 500, 15) * 2);
  });

  it('coverage adds up to the option total', () => {
    const sum = (id: string) => cmp.coverage.reduce((s, c) => s + (c.cells[id]?.value || 0), 0);
    expect(sum('ess')).toBeCloseTo(cmp.totals.ess, 6);
    expect(sum('com')).toBeCloseTo(cmp.totals.com, 6);
  });

  it('sorts rows into only / extent / spec', () => {
    expect(cmp.only.map(r => r.bankId).sort()).toEqual(['adhoc-mirror', 'kitchen']);
    expect(cmp.spec.map(r => r.bankId).sort()).toEqual(['paint', 'wardrobe']);
  });

  it('reads the spec line off the generator, not a hand-add note', () => {
    expect(cmp.specLabel.ess).toBe('Base spec: 0.8mm laminate');
    expect(cmp.specLabel.com).toBe('Mid spec: 1mm laminate');
  });
});

describe('optionPrice', () => {
  it('is the quoted price, design fee included', () => {
    const p = optionPrice({ summary: { totalSell: 778086, designFee: 77809, totalRevenue: 855895 } as any });
    expect(p).toEqual({ work: 778086, designFee: 77809, total: 855895 });
  });

  it('adds the fee when the summary has no revenue figure', () => {
    expect(optionPrice({ summary: { totalSell: 100, designFee: 10 } as any }).total).toBe(110);
    expect(optionPrice({ summary: undefined as any })).toEqual({ work: 0, designFee: 0, total: 0 });
  });
});
