import { describe, it, expect } from 'vitest';
import { boqMarginBasis, buildProjectPnl, marginAssumption } from '../../lib/projectPnl';

/* A line as the project's BOQ hands it over: materials, labour and a margin %, sell = cost × (1 + margin). */
const line = (over: Record<string, any>) => ({
  id: Math.random().toString(36).slice(2), bankId: 'b', name: 'Item', specs: '', unit: 'nos', cat: 'Carpentry',
  roomId: 'Living', qty: 1, materials: 0, labor: 0, margin: 25, ...over,
}) as any;

const tier = (totalSell: number, designFee = 0) => ({ summary: { totalSell, designFee } });
const ctx = (discounts: any[] = []) => ({ financials: { billablePercent: 100, executionGstEnabled: true, discounts } });

describe('potential margin from the BOQ', () => {
  it('reads the margin % from lines that carry a cost, ignoring lines out of the scope', () => {
    const b = boqMarginBasis([
      line({ materials: 80000, labor: 20000, margin: 25 }),                     // sell 1,25,000, cost 1,00,000
      line({ materials: 50000, margin: 25, boqStatus: 'client_procured' }),     // not ours to buy
      line({ materials: 40000, margin: 25, boqStatus: 'deleted' }),
    ]);
    expect(b.basis).toBe('boq');
    expect(b.sell).toBe(125000);
    expect(b.marginPct).toBeCloseTo(20, 5);
    expect(b.uncostedLines).toBe(0);
  });

  it('treats a 0% line as a sell rate with no cost, and gives it the BOQ margin', () => {
    const b = boqMarginBasis([
      line({ materials: 100000, margin: 25 }),            // sell 1,25,000, cost 1,00,000 → 20%
      line({ materials: 50000, margin: 0, cat: 'Civil' }), // imported rate, no cost
    ]);
    expect(b.uncostedLines).toBe(1);
    expect(b.marginPct).toBeCloseTo(20, 5);
    expect(b.estimatedCost).toBeCloseTo(100000 + 50000 * 0.8, 5);
  });

  it('says so when no line carries a cost', () => {
    const b = boqMarginBasis([line({ materials: 50000, margin: 0 })]);
    expect(b.basis).toBe('no-costs');
    expect(b.marginPct).toBeNull();
  });

  it('applies the BOQ margin to the contract and takes the discount off margin in full', () => {
    const boq = [line({ materials: 80000, labor: 20000, margin: 25 }), line({ materials: 100000, margin: 0, cat: 'Civil' })];
    // BOQ margin 20%. Contract sold at 10,00,000 (not the BOQ's own total), 50,000 off, design fee 1,00,000.
    const pnl = buildProjectPnl(ctx([{ target: 'execution', type: 'fixed', value: 50000 }]) as any, boq, [], tier(1000000, 100000));
    expect(pnl.plannedCost).toBeCloseTo(800000, 0);
    expect(pnl.contractedTotal).toBe(950000 + 100000);
    expect(pnl.quotedMargin).toBeCloseTo(1050000 - 800000, 0);
    expect(pnl.hasProcurement).toBe(false);
    expect(pnl.currentMargin).toBeCloseTo(pnl.quotedMargin, 0);
  });

  it('firms up the actual margin package by package as orders and bills come in', () => {
    const boq = [
      line({ materials: 100000, margin: 25, cat: 'Carpentry' }), // cost 1,00,000
      line({ materials: 100000, margin: 25, cat: 'Civil' }),     // cost 1,00,000
    ];
    const po = { id: 'po1', roomId: 'Living', category: 'Carpentry', status: 'issued', scope: 'material', total: 110000, billAmount: 120000, payments: [] } as any;
    const pnl = buildProjectPnl(ctx() as any, boq, [po], tier(250000));
    expect(pnl.plannedCost).toBeCloseTo(200000, 0);
    // Carpentry is billed at 1,20,000; Civil still its potential 1,00,000.
    expect(pnl.effectiveCost).toBeCloseTo(220000, 0);
    expect(pnl.currentMargin).toBeCloseTo(30000, 0);
    expect(pnl.hasBills).toBe(true);
  });
});

describe('a BOQ with no costs', () => {
  // Imported as sell rates only: every line at 0% margin, as a legacy BOQ is stored.
  const imported = [line({ materials: 1500000, margin: 0, cat: 'Civil' }), line({ materials: 500000, margin: 0 })];
  const bank = [
    { id: 'b1', name: 'Wardrobe', cat: 'Carpentry', specs: '', unit: 'sqft', materials: 1000, labor: 200, margin: 30 },
    { id: 'b2', name: 'Paint', cat: 'Paint', specs: '', unit: 'sqft', materials: 20, labor: 10, margin: 40 },
    { id: 'b3', name: 'Unpriced', cat: 'Other', specs: '', unit: 'nos', materials: 0, labor: 0, margin: 25 },
  ] as any[];

  it("assumes the project's own margin first, then its other costed options, then the item bank", () => {
    expect(marginAssumption({ financials: { expectedMarginPct: 25 } }, [], bank)).toEqual({ pct: 25, source: 'project' });
    const costedOption = { boq: [{ bankId: 'b1', qty: 10, marginOverride: 25 }] };
    expect(marginAssumption({}, [{ boq: [] }, costedOption], bank)).toEqual({ pct: 20, source: 'options' });
    // Markup 30% and 40% on cost are 23.1% and 28.6% of the price.
    expect(marginAssumption({}, [], bank)).toEqual({ pct: 25.8, source: 'bank' });
    expect(marginAssumption({}, [], [])).toBeNull();
  });

  it('takes the assumed margin on execution, plus the design fee, less the discount', () => {
    const pnl = buildProjectPnl(ctx([{ target: 'execution', type: 'fixed', value: 50000 }]) as any, imported, [], tier(2000000, 150000), {}, { pct: 25, source: 'project' });
    expect(pnl.marginBasis).toBe('assumed');
    expect(pnl.plannedCost).toBeCloseTo(1500000, 0);
    expect(pnl.quotedMargin).toBeCloseTo(2000000 * 0.25 + 150000 - 50000, 0);
    expect(pnl.assumedMargin).toEqual({ pct: 25, source: 'project' });
  });

  it("keeps the BOQ's own margin when any line carries a cost", () => {
    const pnl = buildProjectPnl(ctx() as any, [...imported, line({ materials: 100000, margin: 25 })], [], tier(2125000), {}, { pct: 40, source: 'bank' });
    expect(pnl.marginBasis).toBe('boq');
    expect(pnl.boqMarginPct).toBeCloseTo(20, 5);
    expect(pnl.assumedMargin).toBeNull();
  });
});
