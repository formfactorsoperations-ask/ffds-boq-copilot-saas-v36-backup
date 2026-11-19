import { describe, it, expect } from 'vitest';
import type { Item, BoqItem, Room } from '../../types';
import { boqTotal, asActualsTotal, buildBankMap, designFeeFor } from '../../lib/boqPricing';
import {
  ceilTo, clientAmount, lineAmount, lineAmountsByRoom, playgroundTotals, designFeeForTier,
  isPlaygroundTier, pricingRulesOf, PLAYGROUND_PRICING, lineCost,
} from '../../lib/playground/pricing';

const item = (o: Partial<Item> & Pick<Item, 'id' | 'name'>): Item =>
  ({ cat: 'Carpentry', specs: '', unit: 'sq ft', materials: 0, labor: 0, margin: 25, ...o });

const BANK: Item[] = [
  item({ id: 'w', name: 'Sliding wardrobe', materials: 1500, labor: 400 }),            // rate 2375
  item({ id: 'p', name: 'Wall painting, two coats', cat: 'Painting', materials: 18, labor: 6 }), // rate 30
  item({ id: 'e', name: 'Electrical points', cat: 'Electrical', unit: 'nos', materials: 500, labor: 100 }), // rate 750
  item({ id: 'lf', name: 'Light fittings', cat: 'Electrical', unit: 'lot', materials: 45000, margin: 0 }),
  item({ id: 'hob', name: 'Hob and chimney', cat: 'Appliances', unit: 'nos', materials: 38000, margin: 0 }),
  item({ id: 'tv', name: 'TV unit', materials: 1333.33, labor: 0, margin: 22 }),
];
const bankMap = buildBankMap(BANK);
const PG = PLAYGROUND_PRICING;

const BOQ: BoqItem[] = [
  { id: 'l1', bankId: 'w', qty: 42, roomId: 'Master Bedroom' },                      // 99,750
  { id: 'l2', bankId: 'tv', qty: 11.25, roomId: 'Living Rm.' },                      // 18,299.95…
  { id: 'l3', bankId: 'e', qty: 26, roomId: 'Whole flat' },                          // 19,500
  { id: 'l4', bankId: 'lf', qty: 1, roomId: 'Whole flat', boqStatus: 'as_actuals' }, // 45,000 estimate
  { id: 'l5', bankId: 'hob', qty: 1, roomId: 'Kitchen', boqStatus: 'client_procured' },
  { id: 'l6', bankId: 'w', qty: 10, roomId: 'Bedroom 2', boqStatus: 'excluded' },
  { id: 'l7', bankId: 'w', qty: 20, roomId: 'Bedroom 2', baseRate: 1600, marginOverride: 30 }, // (1600+400)×1.3 = 2600 → 52,000
];

describe('ceilTo: CEILING.MATH(amount, 100)', () => {
  it('rounds up to the next ₹100 and leaves exact hundreds alone', () => {
    expect(ceilTo(99750)).toBe(99800);
    expect(ceilTo(30000)).toBe(30000);
    expect(ceilTo(30000.01)).toBe(30100);
    expect(ceilTo(1)).toBe(100);
  });

  it('ignores floating-point dust below a paisa', () => {
    expect(ceilTo(30000.000000004)).toBe(30000);
    expect(ceilTo(0.1 * 3 * 100000)).toBe(30000);
  });

  it('leaves zero and credits as they are', () => {
    expect(ceilTo(0)).toBe(0);
    expect(ceilTo(-500)).toBe(-500);
  });

  it('applies only when the tier has rules', () => {
    expect(clientAmount(99750, PG)).toBe(99800);
    expect(clientAmount(99750, null)).toBe(99750);
  });
});

describe('lineAmount', () => {
  it('rounds each Playground line up to ₹100', () => {
    expect(lineAmount(BOQ[0], bankMap, { rules: PG })).toBe(99800);
    expect(lineAmount(BOQ[1], bankMap, { rules: PG })).toBe(18300);
    expect(lineAmount(BOQ[2], bankMap, { rules: PG })).toBe(19500);
    expect(lineAmount(BOQ[6], bankMap, { rules: PG })).toBe(52000);
  });

  it('keeps a Classic line exact', () => {
    expect(lineAmount(BOQ[0], bankMap)).toBe(99750);
    expect(lineAmount(BOQ[1], bankMap)).toBeCloseTo(1333.33 * 1.22 * 11.25, 6);
  });

  it('rounds a whole-flat line room by room, so the rooms add up to the line', () => {
    const paint: BoqItem = {
      id: 'pt', bankId: 'p', qty: 620, roomId: 'Whole flat',
      byRoom: { basis: 'wallPaint', client: 'flat', rooms: { 'Living Rm.': { qty: 333 }, 'Master Bedroom': { qty: 287 } } },
    };
    // 333 × 30 = 9,990 → 10,000; 287 × 30 = 8,610 → 8,700. Rounding the flat would give 18,600.
    expect(lineAmount(paint, bankMap, { rules: PG })).toBe(18700);
    const byRoom = lineAmountsByRoom(paint, bankMap, { rules: PG });
    expect(byRoom.get('Living Rm.')).toBe(10000);
    expect(byRoom.get('Master Bedroom')).toBe(8700);
    expect([...byRoom.values()].reduce((a, b) => a + b, 0)).toBe(18700);
    // Classic: exact, one figure.
    expect(lineAmount(paint, bankMap)).toBe(18600);
  });

  it('measures a whole-flat line from the plan when the rooms are given', () => {
    const rooms: Room[] = [
      { name: 'Living Rm.', size: 182, unit: 'sq ft', plan: { x: 0, y: 0, w: 13, h: 14 }, kind: 'living' },
      { name: 'Master Bedroom', size: 156, unit: 'sq ft', plan: { x: 0, y: 14, w: 12, h: 13 }, kind: 'bedroom' },
      { name: 'Master Bathroom', size: 28, unit: 'sq ft', plan: { x: 12, y: 14, w: 4, h: 7 }, kind: 'toilet' },
    ];
    const elec: BoqItem = { id: 'el', bankId: 'e', qty: 0, roomId: 'Whole flat', byRoom: { basis: 'points', client: 'rooms', rooms: {} } };
    const byRoom = lineAmountsByRoom(elec, bankMap, { rules: PG, rooms });
    expect(byRoom.get('Living Rm.')).toBe(9000);      // 12 points × 750
    expect(byRoom.get('Master Bedroom')).toBe(6000);  // 8 × 750
    expect(byRoom.get('Master Bathroom')).toBe(3000); // 4 × 750
  });
});

describe('playgroundTotals', () => {
  it('matches boqTotal and asActualsTotal to the rupee for a Classic tier', () => {
    const t = playgroundTotals(BOQ, bankMap);
    expect(t.sell).toBe(boqTotal(BOQ, bankMap));
    expect(t.asActuals).toBe(asActualsTotal(BOQ, bankMap));
    expect(t.cost).toBe(1900 * 42 + 1333.33 * 11.25 + 600 * 26 + 2000 * 20);
    expect(t.itemCount).toBe(5); // excluded and client-procured are not counted
  });

  it('rounds every line for a Playground tier, and only adds margin', () => {
    const classic = playgroundTotals(BOQ, bankMap);
    const pg = playgroundTotals(BOQ, bankMap, { rules: PG });
    expect(pg.sell).toBe(99800 + 18300 + 19500 + 52000);
    expect(pg.cost).toBe(classic.cost);
    expect(pg.sell).toBeGreaterThanOrEqual(classic.sell);
    expect(pg.sell % 100).toBe(0);
    expect(pg.asActuals).toBe(45000);
  });

  it('adds up by room, whole-flat lines included', () => {
    const pg = playgroundTotals(BOQ, bankMap, { rules: PG });
    expect(pg.byRoom.get('Master Bedroom')).toBe(99800);
    expect(pg.byRoom.get('Bedroom 2')).toBe(52000);
    expect([...pg.byRoom.values()].reduce((a, b) => a + b, 0)).toBe(pg.sell);
  });

  it('costs a line exactly as App does', () => {
    expect(lineCost(BOQ[6], bankMap)).toBe(2000 * 20);
    expect(lineCost({ id: 'x', bankId: 'gone', qty: 2, selectedRate: 1250, marginOverride: 25 }, bankMap)).toBe(2000);
  });
});

describe('design fee on a version', () => {
  const ctx = { designFeeType: 'percentage', designFee: 10 };

  it('keeps today’s rule on Classic tiers: the fee is charged on actuals too', () => {
    expect(designFeeForTier(ctx, 100000, 45000, null)).toBe(designFeeFor(ctx, 100000, 45000));
    expect(designFeeForTier(ctx, 100000, 45000, null)).toBe(14500);
  });

  it('charges a Playground version on the work only', () => {
    expect(designFeeForTier(ctx, 100000, 45000, PG)).toBe(10000);
    expect(designFeeForTier(ctx, 100000, 45000, { roundUpTo: 100, feeOnActuals: true })).toBe(14500);
  });

  it('leaves lump-sum and per-sq-ft fees alone', () => {
    expect(designFeeForTier({ designFeeType: 'fixed_lumpsum', designFee: 75000 }, 100000, 45000, PG)).toBe(75000);
    expect(designFeeForTier({ designFeeType: 'fixed_sqft', designFee: 100, area: 1200 }, 100000, 45000, PG)).toBe(120000);
  });
});

describe('which tiers are Playground', () => {
  it('reads the format and the rules', () => {
    expect(isPlaygroundTier({})).toBe(false);
    expect(isPlaygroundTier({ boqFormat: 'playground' })).toBe(true);
    expect(isPlaygroundTier({ pricingRules: PG })).toBe(true);
    expect(pricingRulesOf({})).toBeNull();
    expect(pricingRulesOf({ pricingRules: PG })).toEqual(PG);
    expect(pricingRulesOf({ pricingRules: { roundUpTo: 0, feeOnActuals: false } })).toBeNull();
  });
});
