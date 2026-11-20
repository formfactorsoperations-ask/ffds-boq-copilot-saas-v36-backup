import { describe, it, expect } from 'vitest';
import { supplyOf, withSupply, lineSupply, supplyLine, separateOf, suppliedItems, unitEstimate, SUPPLY_STATUS } from '../../lib/playground/supply';
import { playgroundTotals, PLAYGROUND_PRICING, designFeeForTier } from '../../lib/playground/pricing';
import { playgroundTierSummary } from '../../lib/playground/versions';
import { dealFor } from '../../lib/offers';
import { scheduleFor } from '../../lib/paymentSchedule';
import { clientGroups } from '../../lib/playground/excel';
import { approvedOption } from '../../lib/executionAgreement';
import { kitFromBundle, kitApply } from '../../lib/playground/kits';

const I = (id: string, name: string, cat: string, unit: string, materials: number, labor: number, margin = 25, extra: any = {}): any => ({ id, name, cat, unit, materials, labor, margin, specs: `${name} words`, ...extra });
/* The mockup's: a wardrobe the studio makes; light fittings at actuals; a hob and a sofa the client buys. */
const bank: any[] = [
  I('w', 'Sliding wardrobe', 'Carpentry', 'sq ft', 1500, 400),
  I('b57', 'Light fittings', 'Electrical', 'lot', 45000, 0, 0, { supply: 'actuals' }),
  I('b58', 'Hob and chimney', 'Appliances', 'nos', 38000, 0, 0, { supply: 'client' }),
  I('b28', 'Three-seater sofa, loose', 'Furniture', 'nos', 55000, 0, 0, { supply: 'client' }),
];
const bankMap = new Map(bank.map(b => [b.id, b]));
const rooms: any[] = [
  { name: 'Living', size: 182, unit: 'sq ft', plan: { x: 0, y: 0, w: 13, h: 14 } },
  { name: 'Kitchen', size: 72, unit: 'sq ft', plan: { x: 13, y: 0, w: 9, h: 8 } },
];
const work: any[] = [{ id: 'l1', bankId: 'w', qty: 42, roomId: 'Living' }];
let n = 0;
const newId = () => `s${++n}`;

describe('how an item is supplied', () => {
  it('reads the item, sets a new line’s status, and reads it back from the line', () => {
    expect(bank.map(supplyOf)).toEqual([null, 'actuals', 'client', 'client']);
    expect(withSupply({ id: 'a', bankId: 'b58', qty: 1 }, bankMap.get('b58')).boqStatus).toBe('client_procured');
    expect(withSupply({ id: 'a', bankId: 'b57', qty: 1 }, bankMap.get('b57')).boqStatus).toBe('as_actuals');
    expect(withSupply({ id: 'a', bankId: 'w', qty: 1 }, bankMap.get('w')).boqStatus).toBeUndefined();
    // A line that already says how it is handled keeps it.
    expect(withSupply({ id: 'a', bankId: 'b58', qty: 1, boqStatus: 'excluded' }, bankMap.get('b58')).boqStatus).toBe('excluded');
    expect(lineSupply({ id: 'a', bankId: 'b58', qty: 1, boqStatus: 'client_procured' }, bankMap)).toBe('client');
    expect(lineSupply({ id: 'a', bankId: 'x', qty: 1, name: 'Tiles (as actuals)' } as any, bankMap)).toBe('actuals');
    expect(lineSupply(work[0], bankMap)).toBeNull();
    expect(SUPPLY_STATUS).toEqual({ client: 'client_procured', actuals: 'as_actuals' });
  });

  it('the library lists the supplied items in the bank’s order, each with its estimate', () => {
    expect(suppliedItems(bank).map(i => i.id)).toEqual(['b57', 'b58', 'b28']);
    expect(suppliedItems([bank[3], bank[1]]).map(i => i.id)).toEqual(['b28', 'b57']);
    expect(unitEstimate(bank[1])).toBe(45000);
  });

  it('a supplied piece is drawn along a free wall in its room; anything else is a line, qty 1', () => {
    const sofa = supplyLine({ item: bankMap.get('b28'), room: 'Living', rooms, boq: work, bankMap, newId });
    expect(sofa.placed).toBe(true);
    expect(sofa.line).toMatchObject({ bankId: 'b28', roomId: 'Living', qty: 1, boqStatus: 'client_procured' });
    expect(sofa.line.place).toBeTruthy();
    const lights = supplyLine({ item: bankMap.get('b57'), room: 'Whole flat', rooms, boq: work, bankMap, newId });
    expect(lights).toMatchObject({ placed: false, line: { bankId: 'b57', roomId: 'Whole flat', qty: 1, boqStatus: 'as_actuals' } });
  });
});

describe('adding one changes no figure', () => {
  const ctx: any = { designFeeType: 'percentage', designFee: 10, rooms };
  const terms = { rate: 18, billablePercent: 100 };
  const offers: any[] = [{ id: 'o', label: 'Festive', type: 'percentage', value: 5, appliesTo: 'execution' }];
  const tier = (boq: any[]) => ({ id: 't', name: 'Comfort', boq, pricingRules: PLAYGROUND_PRICING } as any);

  it('light fittings at actuals and a client-bought hob: price, offers, fee, GST and every payment stage stay the same', () => {
    const before = playgroundTierSummary(tier(work), bankMap, ctx);
    const lights = supplyLine({ item: bankMap.get('b57'), room: 'Whole flat', rooms, boq: work, bankMap, newId }).line;
    const hob = supplyLine({ item: bankMap.get('b58'), room: 'Kitchen', rooms, boq: work, bankMap, newId }).line;
    const boq = [...work, lights, hob];
    const after = playgroundTierSummary(tier(boq), bankMap, ctx);
    expect(after.totalSell).toBe(before.totalSell);
    expect(after.designFee).toBe(before.designFee);
    expect(after.totalRevenue).toBe(before.totalRevenue);
    expect(playgroundTotals(boq, bankMap, { rules: PLAYGROUND_PRICING, rooms }).byRoom).toEqual(playgroundTotals(work, bankMap, { rules: PLAYGROUND_PRICING, rooms }).byRoom);
    expect(dealFor(after, offers, terms)).toEqual(dealFor(before, offers, terms));
    const s0 = scheduleFor(ctx, { tierSummary: before });
    const s1 = scheduleFor(ctx, { tierSummary: after });
    expect(s1.total).toBe(s0.total);
    expect(s1.execution.stages.map(s => s.amount)).toEqual(s0.execution.stages.map(s => s.amount));
    expect(s1.design.stages.map(s => s.amount)).toEqual(s0.design.stages.map(s => s.amount));
    // The agreement's fallback reads the same rule.
    expect(approvedOption({ approvedTierId: 't' }, [tier(boq)], bank)!.design).toBe(approvedOption({ approvedTierId: 't' }, [tier(work)], bank)!.design);
  });

  it('a Classic version keeps today’s rule: a percentage fee on the actuals too; a studio may ask for it back', () => {
    expect(designFeeForTier(ctx, 100000, 45000, null)).toBe(14500);
    expect(designFeeForTier(ctx, 100000, 45000, PLAYGROUND_PRICING)).toBe(10000);
    expect(designFeeForTier(ctx, 100000, 45000, { ...PLAYGROUND_PRICING, feeOnActuals: true })).toBe(14500);
  });

  it('their own list: at actuals with an estimate, then what the client buys; the client copy leaves both out of its total', () => {
    const lights = supplyLine({ item: bankMap.get('b57'), room: 'Whole flat', rooms, boq: work, bankMap, newId }).line;
    const hob = supplyLine({ item: bankMap.get('b58'), room: 'Kitchen', rooms, boq: work, bankMap, newId }).line;
    const boq = [...work, lights, hob];
    const sep = separateOf(boq, bankMap);
    expect(sep.actuals.map(r => [r.name, r.room, r.estimate])).toEqual([['Light fittings', 'Whole flat', 45000]]);
    expect(sep.client.map(r => [r.name, r.room, r.estimate, r.words])).toEqual([['Hob and chimney', 'Kitchen', null, 'Hob and chimney words']]);
    expect(sep.estimate).toBe(45000);
    const c0 = clientGroups(work, { bankMap, rules: PLAYGROUND_PRICING, rooms } as any);
    const c1 = clientGroups(boq, { bankMap, rules: PLAYGROUND_PRICING, rooms } as any);
    expect(c1.total).toBe(c0.total);
    expect(c1.groups.flatMap(g => g.rows.map(r => r.item))).toEqual(['Sliding wardrobe']);
  });

  it('a supplied item in a kit comes in as supplied', () => {
    const kit = kitFromBundle({ id: 'k', name: 'Kitchen', itemIds: ['b58'] }, 'Room Bundles & Kits');
    const r = kitApply({ kit, rooms, picked: ['Kitchen'], off: {}, boq: [], bank, bankMap, newId, prepare: l => withSupply(l, bankMap.get(l.bankId)) });
    expect(r!.added.map(l => l.boqStatus)).toEqual(['client_procured']);
  });
});
