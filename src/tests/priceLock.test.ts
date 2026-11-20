import { describe, it, expect } from 'vitest';
import {
  PRICE_LOCK_KIND, buildPriceLockFile, canLockPrices, lockBlocker, lockWasSaved, planPriceLock, planPriceUnlock, priceLockFileName, readPriceLockFile,
} from '../../lib/priceLock';
import { freezeBoqLines, isFrozen } from '../../lib/detailedBoq';
import { boqTotal, buildBankMap } from '../../lib/boqPricing';

/*
  A BOQ line borrows whatever price it does not hold from the Item Bank, so a
  bank edit re-prices finished projects. Locking writes the borrowed figures
  onto the line. The one promise: no rate and no total moves, and nothing is
  safe to save unless that has been checked.
*/

const item = (id: string, name: string, over: any = {}): any => ({
  id, name, cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1295, labor: 555, margin: 15, ...over,
});

const bank = () => [
  item('gen-014', 'WARDOBE WITH LOFT'),
  item('gen-015', 'KING SIZE BED WITH STORAGE', { materials: 1260, labor: 540 }),
  item('ADHOC_a1', 'PANELING AROUND HEADBOARD', { materials: [1440], labor: [], margin: 0 }),
  item('gen-030', 'TILES (AS ACTUALS)', { unit: 'lumpsum', materials: 11000, labor: 0, margin: 0 }),
];

const project = (over: any = {}): any => ({
  id: 'p1',
  lastModified: 1750000000000,
  context: { name: 'Runwal Eirene - 2BHK', clientName: 'Asha Menon', status: 'completed', designFee: 10, adHocItems: [item('own-1', 'POOJA UNIT', { materials: 900, labor: 300, margin: 20 })] },
  tiers: [{
    id: 't1', name: 'Comfort Upgrade', timestamp: 1740000000000,
    boq: [
      { id: 'l1', bankId: 'gen-014', qty: 45, marginOverride: 15 },                                  // borrows materials and labour
      { id: 'l2', bankId: 'gen-015', qty: 36 },                                                      // borrows all three
      { id: 'l3', bankId: 'gen-014', qty: 10, baseRate: 1400, labor: 500, marginOverride: 25 },      // already holds its price
      { id: 'l4', bankId: 'own-1', qty: 12, baseRate: 950 },                                         // the project's own item
      { id: 'l5', bankId: 'gone', qty: 2, name: 'Old shelf', baseRate: 900, marginOverride: 10 },    // not in the bank
      { id: 'l6', bankId: 'ADHOC_a1', qty: 20 },                                                     // the bank item is not numbers
      { id: 'l7', bankId: 'gen-030', qty: 1, marginOverride: null },                                 // as actuals, margin stored as null
      { id: 'l8', bankId: 'gen-015', qty: 5, boqStatus: 'deleted' },
    ],
  }, {
    id: 't2', name: 'Essential Elegance', timestamp: 1739000000000,
    boq: [{ id: 'm1', bankId: 'gen-014', qty: 40, baseRate: 1295, labor: 555, marginOverride: 15 }],
  }],
  ...over,
});

describe('locking a project\'s prices', () => {
  const p = project();
  const plan = planPriceLock(p, bank(), 1763000000000);
  const map = buildBankMap(bank(), p.context.adHocItems);
  const line = (id: string) => (plan.project.tiers[0].boq as any[]).find(l => l.id === id);

  it('moves no rate and no total', () => {
    expect(plan.same).toBe(true);
    plan.options.forEach(o => { expect(o.after).toBe(o.before); expect(o.same).toBe(true); });
    expect(boqTotal(plan.project.tiers[0].boq, map)).toBe(boqTotal(p.tiers[0].boq, map));
  });

  it('writes only the figures a line was borrowing', () => {
    expect(line('l1')).toMatchObject({ baseRate: 1295, labor: 555, marginOverride: 15, rateSnapshotAt: 1763000000000 });
    expect(line('l2')).toMatchObject({ baseRate: 1260, labor: 540, marginOverride: 15 });
    expect(line('l3')).toBe(p.tiers[0].boq[2]);
    // The project's own copy of the item is the one read, as it is when pricing.
    expect(line('l4')).toMatchObject({ baseRate: 950, labor: 300, marginOverride: 20 });
    expect(line('l7')).toMatchObject({ baseRate: 11000, labor: 0, marginOverride: 0 });
    expect(line('l8')).toMatchObject({ baseRate: 1260, labor: 540, marginOverride: 15, boqStatus: 'deleted' });
  });

  it('leaves alone a line that is not in the bank, and one whose bank item is not numbers', () => {
    expect(line('l5')).toBe(p.tiers[0].boq[4]);
    expect(line('l6')).toBe(p.tiers[0].boq[5]);
    expect(plan.skipped).toBe(1);
  });

  it('counts what it does and records it line by line', () => {
    expect(plan.changed).toBe(5);
    expect(plan.fields).toBe(2 + 3 + 2 + 3 + 3);
    expect(plan.options[1]).toMatchObject({ tierName: 'Essential Elegance', changed: 0, same: true });
    expect(plan.record).toEqual([{ tierId: 't1', lines: expect.arrayContaining([{ id: 'l1', added: { baseRate: 1295, labor: 555 }, stamped: 1763000000000 }]) }]);
    // An option with nothing to lock keeps the very same object.
    expect(plan.project.tiers[1]).toBe(p.tiers[1]);
  });

  it('gives each line the price freezeBoqLines would', () => {
    const frozen = freezeBoqLines(p.tiers[0].boq, map, 1763000000000);
    ['l1', 'l2', 'l3', 'l4', 'l7', 'l8'].forEach(id => {
      const f = frozen.find((x: any) => x.id === id);
      expect({ b: line(id).baseRate, l: line(id).labor, m: line(id).marginOverride }).toEqual({ b: f.baseRate, l: f.labor, m: f.marginOverride });
    });
    expect(isFrozen(plan.project.tiers[0].boq.filter((l: any) => l.id !== 'l6'), map)).toBe(true);
  });

  it('holds once the bank moves: the locked project keeps its totals, the unlocked one does not', () => {
    const dearer = bank().map(i => (i.id === 'gen-014' ? { ...i, labor: 700, margin: 30 } : i));
    const moved = buildBankMap(dearer, p.context.adHocItems);
    expect(boqTotal(p.tiers[0].boq, moved)).not.toBe(boqTotal(p.tiers[0].boq, map));
    expect(boqTotal(plan.project.tiers[0].boq, moved)).toBe(boqTotal(p.tiers[0].boq, map));
  });

  it('changes nothing it was given, and nothing at all on a second run', () => {
    const fresh = project();
    const before = JSON.stringify(fresh);
    planPriceLock(fresh, bank());
    expect(JSON.stringify(fresh)).toBe(before);
    const again = planPriceLock(plan.project, bank());
    expect(again.changed).toBe(0);
    expect(again.project).toBe(plan.project);
  });

  it('checks a Playground option by its own rounding too', () => {
    const pg = project({ tiers: [{ id: 'v1', name: 'Option A', boqFormat: 'playground', pricingRules: { roundUpTo: 100, feeOnActuals: false }, boq: [{ id: 'a1', bankId: 'gen-015', qty: 33.5 }] }] });
    const pl = planPriceLock(pg, bank());
    expect(pl.same).toBe(true);
    expect(pl.changed).toBe(1);
  });

  it('survives a project with nothing in it', () => {
    expect(planPriceLock({ id: 'x' } as any, bank())).toMatchObject({ changed: 0, same: true, name: 'Untitled project' });
    expect(planPriceLock({ id: 'y', context: {}, tiers: [{ id: 't', boq: null }] } as any, bank()).same).toBe(true);
  });
});

describe('taking a lock back off', () => {
  const p = project();
  const plan = planPriceLock(p, bank(), 1763000000000);

  it('returns every line to what it was', () => {
    const undo = planPriceUnlock(plan.project, bank(), plan.record);
    expect(undo.same).toBe(true);
    expect(undo.changed).toBe(5);
    expect(undo.project.tiers).toEqual(p.tiers);
    // A margin stored as null goes back to null, not to missing.
    expect((undo.project.tiers[0].boq as any[]).find(l => l.id === 'l7').marginOverride).toBeNull();
  });

  it('keeps a price that was edited after the lock', () => {
    const edited = { ...plan.project, tiers: plan.project.tiers.map((t: any) => ({ ...t, boq: t.boq.map((l: any) => (l.id === 'l1' ? { ...l, labor: 600 } : l)) })) };
    const undo = planPriceUnlock(edited as any, bank(), plan.record);
    const l1 = (undo.project.tiers[0].boq as any[]).find(l => l.id === 'l1');
    expect(l1.labor).toBe(600);
    expect(l1.baseRate).toBeUndefined();
    // The edited figure stays, the rest reads the bank again at the same figures: no total moves.
    expect(undo.same).toBe(true);
    expect(undo.changed).toBe(5);
  });

  it('says the totals would move when the bank has changed since', () => {
    const dearer = bank().map(i => (i.id === 'gen-015' ? { ...i, margin: 30 } : i));
    expect(planPriceUnlock(plan.project, dearer, plan.record).same).toBe(false);
  });
});

describe('the lock file and the check after saving', () => {
  const p = project();
  const plan = planPriceLock(p, bank(), 1763000000000);

  it('holds what was added and the lines as they were', () => {
    const file = buildPriceLockFile([plan], [p], { studio: 'Form Factors', at: 1763000000000 });
    expect(file.kind).toBe(PRICE_LOCK_KIND);
    expect(file.projects[0].before[0].boq).toEqual(p.tiers[0].boq);
    expect(file.projects[0].before[0].total).toBe(plan.options[0].before);
    expect(file.projects[0].record).toEqual(plan.record);
    expect(JSON.stringify(file)).not.toContain('Asha Menon');
    expect(readPriceLockFile(JSON.stringify(file))?.projects).toHaveLength(1);
    expect(readPriceLockFile('{"kind":"something-else"}')).toBeNull();
    expect(readPriceLockFile('not json')).toBeNull();
    expect(priceLockFileName('Form Factors', new Date(2026, 10, 20, 9, 5).getTime())).toMatch(/^Form_Factors_Price_Lock_2026-11-\d\d_0905\.json$/);
  });

  it('accepts the stored project only when it is the one planned', () => {
    const stored = JSON.parse(JSON.stringify(plan.project));
    expect(lockWasSaved(stored, plan, bank())).toBe(true);
    expect(lockWasSaved(JSON.parse(JSON.stringify(p)), plan, bank())).toBe(false);
    expect(lockWasSaved(undefined, plan, bank())).toBe(false);
    expect(lockWasSaved({ ...stored, tiers: [] }, plan, bank())).toBe(false);
  });

  it('refuses a copy that is not the whole project', () => {
    expect(lockBlocker(p)).toBeNull();
    expect(lockBlocker({ id: 'x', _failedHydration: true } as any)).toMatch(/could not be read/);
    expect(lockBlocker({ id: 'x', _designView: true, tiers: [] } as any)).toMatch(/part of it/);
    // An option whose lines are stored aside and not yet loaded: saving it would write an empty option.
    expect(lockBlocker({ ...p, tiers: [...p.tiers, { id: 't9', boq: [], boqTrimmed: true }] })).toMatch(/could not be loaded/);
    expect(lockBlocker({ ...p, tiers: [{ id: 't9', boq: [{ id: 'l' }], boqTrimmed: false }] })).toBeNull();
    expect(lockBlocker(undefined)).toMatch(/could not be found/);
  });

  it('is for the owner', () => {
    expect(canLockPrices('Super Admin')).toBe(true);
    expect(canLockPrices(['Designer', 'Owner'])).toBe(true);
    expect(canLockPrices('Admin')).toBe(false);
    expect(canLockPrices('Designer')).toBe(false);
    expect(canLockPrices(undefined)).toBe(false);
  });
});
