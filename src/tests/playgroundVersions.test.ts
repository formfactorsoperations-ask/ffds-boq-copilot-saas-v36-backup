import { describe, it, expect } from 'vitest';
import type { Item, BoqItem, ProposalTier, Room } from '../../types';
import { buildBankMap, boqTotal } from '../../lib/boqPricing';
import {
  boqFormatOf, makePlaygroundVersion, shareBasisFor, isWholeFlatLine, wholeFlatCandidates, shareIntoRooms, unshare,
  paintingFromPlan, syncedWholeFlat, playgroundTierSummary,
} from '../../lib/playground/versions';
import { PLAYGROUND_PRICING, ceilTo } from '../../lib/playground/pricing';

const item = (o: Partial<Item> & Pick<Item, 'id' | 'name'>): Item =>
  ({ cat: 'Carpentry', specs: 'x', unit: 'sq ft', materials: 1000, labor: 400, margin: 20, ...o });

const BANK: Item[] = [
  item({ id: 'w', name: 'Wardrobe', materials: 1333.33 }),
  item({ id: 'pw', name: 'Wall painting, two coats', cat: 'Painting', materials: 18, labor: 6, margin: 25 }),
  item({ id: 'pc', name: 'Ceiling painting, two coats', cat: 'Painting', materials: 16, labor: 4, margin: 25 }),
  item({ id: 'fc', name: 'False ceiling with cove', cat: 'Ceiling', materials: 70, labor: 25, margin: 25 }),
  item({ id: 'el', name: 'Electrical points and fittings', cat: 'Electrical', unit: 'nos', materials: 500, labor: 100, margin: 25 }),
  item({ id: 'lf', name: 'Light fittings', cat: 'Electrical', unit: 'lot', materials: 45000, labor: 0, margin: 0 }),
];
const bankMap = buildBankMap(BANK);

const ROOMS: Room[] = [
  { name: 'Living Room', size: 182, unit: 'sq ft', plan: { x: 0, y: 0, w: 13, h: 14 }, kind: 'living' },
  { name: 'Master Bedroom', size: 156, unit: 'sq ft', plan: { x: 0, y: 14, w: 12, h: 13 }, kind: 'bedroom', windows: 1 },
  { name: 'Master Bathroom', size: 28, unit: 'sq ft', plan: { x: 12, y: 14, w: 4, h: 7 }, kind: 'toilet' },
];

const classic: ProposalTier = {
  id: 't1', name: 'Comfort Upgrade', timestamp: 1, projectContext: {} as any,
  summary: { totalSell: 0, totalCost: 0, totalGm: 0, itemCount: 0, totalRevenue: 0, designFee: 0, blendedGm: 0 },
  approval: { at: 1, by: 'Anish' },
  boq: [
    { id: 'l1', bankId: 'w', qty: 42, roomId: 'Master Bedroom' },
    { id: 'l2', bankId: 'w', qty: 20, roomId: 'Living Room', baseRate: 900, marginOverride: 30 },
    { id: 'l3', bankId: 'el', qty: 26, roomId: 'Functional' },
  ],
};

describe('Classic and Playground versions', () => {
  it('reads an option’s format', () => {
    expect(boqFormatOf(classic)).toBe('classic');
    expect(boqFormatOf({ boqFormat: 'playground' })).toBe('playground');
  });

  it('makes the next version a Playground BOQ, priced as the original was', () => {
    const v2 = makePlaygroundVersion(classic, 't2', 50, bankMap);
    expect(v2).toMatchObject({ id: 't2', parentTierId: 't1', name: 'Comfort Upgrade', boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING, lifecycleTag: 'Draft', timestamp: 50 });
    expect((v2 as any).approval).toBeUndefined();
    // Line ids, quantities, rooms and markups are kept; the bank rate is frozen on.
    expect(v2.boq.map(l => [l.id, l.qty, l.roomId, l.baseRate, l.marginOverride])).toEqual([
      ['l1', 42, 'Master Bedroom', 1333.33, undefined], ['l2', 20, 'Living Room', 900, 30], ['l3', 26, 'Functional', 500, undefined],
    ]);
    // The original is untouched.
    expect(classic.boq[0].baseRate).toBeUndefined();
    expect(boqFormatOf(classic)).toBe('classic');
    // Exact before, rounded line by line after; the rounding only ever adds.
    const exact = boqTotal(classic.boq, bankMap);
    const after = playgroundTierSummary(v2, bankMap, { designFee: 10, rooms: ROOMS });
    expect(after.totalSell).toBe(classic.boq.reduce((a, l) => a + ceilTo(boqTotal([l], bankMap)), 0));
    expect(after.totalSell).toBeGreaterThanOrEqual(exact);
  });
});

describe('whole-flat services', () => {
  it('knows how each service is shared', () => {
    expect(shareBasisFor(BANK[1])).toBe('wallPaint');
    expect(shareBasisFor(BANK[2])).toBe('ceilingPaint');
    expect(shareBasisFor(BANK[3])).toBe('falseCeiling');
    expect(shareBasisFor(BANK[4])).toBe('points');
    expect(shareBasisFor(BANK[0])).toBeNull();
  });

  it('finds lines priced for the whole flat that could be shared', () => {
    expect(isWholeFlatLine({ roomId: 'Whole flat' })).toBe(true);
    expect(isWholeFlatLine({ roomId: 'Functional' })).toBe(true);
    expect(isWholeFlatLine({ roomId: undefined })).toBe(true);
    expect(isWholeFlatLine({ roomId: 'Kitchen' })).toBe(false);
    const boq: BoqItem[] = [
      { id: 'a', bankId: 'pw', qty: 900, roomId: 'Functional' },
      { id: 'b', bankId: 'pw', qty: 300, roomId: 'Living Room' },
      { id: 'c', bankId: 'w', qty: 40 },
      { id: 'd', bankId: 'el', qty: 26, roomId: 'Whole flat', byRoom: { basis: 'points', client: 'rooms', rooms: {} } },
    ];
    expect(wholeFlatCandidates(boq, bankMap).map(x => [x.line.id, x.basis])).toEqual([['a', 'wallPaint']]);
  });

  it('shares a line into rooms, its quantity the sum of the shares, and back', () => {
    const shared = shareIntoRooms({ id: 'e', bankId: 'el', qty: 26, roomId: 'Functional' }, 'points', ROOMS);
    expect(shared.byRoom).toEqual({ basis: 'points', rooms: {}, client: 'flat' });
    expect(shared.qty).toBe(12 + 8 + 4);
    expect(unshare(shared)).toEqual({ id: 'e', bankId: 'el', qty: 24, roomId: 'Functional' });
  });

  it('adds painting as walls and ceilings measured from the plan', () => {
    let n = 0;
    const p = paintingFromPlan(BANK, ROOMS, () => `p${++n}`)!;
    expect(p.wall.id).toBe('pw');
    expect(p.ceiling.id).toBe('pc');
    expect(p.lines.map(l => [l.id, l.bankId, l.byRoom?.basis, l.roomId])).toEqual([['p1', 'pw', 'wallPaint', 'Whole flat'], ['p2', 'pc', 'ceilingPaint', 'Whole flat']]);
    // Toilets are out of painting: the walls are the living room's and the bedroom's.
    expect(p.lines[0].qty).toBe(Math.round(54 * 10 - 21) + Math.round(50 * 10 - 21 - 16));
    // One painting item: both lines use it.
    expect(paintingFromPlan([BANK[1]], ROOMS, () => 'x')!.lines.map(l => l.bankId)).toEqual(['pw', 'pw']);
    expect(paintingFromPlan([BANK[0]], ROOMS, () => 'x')).toBeNull();
  });

  it('brings whole-flat quantities in line when the rooms change', () => {
    const shared = shareIntoRooms({ id: 'e', bankId: 'el', qty: 0, roomId: 'Whole flat' }, 'points', ROOMS);
    const fewer = syncedWholeFlat([shared, { id: 'k', bankId: 'w', qty: 5 }], ROOMS.slice(0, 1));
    expect(fewer[0].qty).toBe(12);
    expect(fewer[1]).toEqual({ id: 'k', bankId: 'w', qty: 5 });
  });
});

describe('a Playground option’s summary', () => {
  it('rounds every line, keeps cost exact and charges no fee on actuals', () => {
    const tier: ProposalTier = { ...classic, boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING, boq: [
      { id: 'l1', bankId: 'w', qty: 42, roomId: 'Master Bedroom' },
      { id: 'a', bankId: 'lf', qty: 1, roomId: 'Whole flat', boqStatus: 'as_actuals' },
    ] };
    const s = playgroundTierSummary(tier, bankMap, { designFeeType: 'percentage', designFee: 10, rooms: ROOMS });
    const exact = (1333.33 + 400) * 1.2 * 42;
    expect(s.totalSell).toBe(ceilTo(exact));
    expect(s.totalCost).toBeCloseTo(1733.33 * 42, 6);
    expect(s.asActualsTotal).toBe(45000);
    expect(s.designFee).toBe(s.totalSell * 0.1); // not on the 45,000 at actuals
    expect(s.totalRevenue).toBe(s.totalSell + s.designFee);
    expect(s.itemCount).toBe(2);
  });

  it('prices a whole-flat line from its rooms, cost and amount together', () => {
    const shared = shareIntoRooms({ id: 'e', bankId: 'el', qty: 999, roomId: 'Whole flat' }, 'points', ROOMS);
    const tier: ProposalTier = { ...classic, boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING, boq: [{ ...shared, qty: 999 }] };
    const s = playgroundTierSummary(tier, bankMap, { rooms: ROOMS });
    expect(s.totalCost).toBe(600 * 24); // the rooms' 24 points, not the stale 999
    expect(s.totalSell).toBe(9000 + 6000 + 3000);
  });
});
