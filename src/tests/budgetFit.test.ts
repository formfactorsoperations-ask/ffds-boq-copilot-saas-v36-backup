/*
  The client's budget, and fitting an option to it.

  Pricing & Tiers says how far each option is over or under the budget and
  which fits it best. An option over it comes down by taking out extras the
  designer ticks; must-haves are never offered, and what the extras cannot
  reach is said.
*/
import { describe, it, expect } from 'vitest';
import { INITIAL_BANK } from '../../constants';
import { generateStandardPackages, INITIAL_TEMPLATES } from '../../lib/standardPackages';
import { asNewPlaygroundOption } from '../../lib/playground/versions';
import { playgroundTotals, PLAYGROUND_PRICING } from '../../lib/playground/pricing';
import { quickBuild } from '../../lib/playground/quickBuild';
import { buildBankMap } from '../../lib/boqPricing';
import { withGrades } from '../../lib/templateOptions';
import { budgetGap, bestFit, extrasOf, fitWithout, suggestedOut } from '../../lib/budgetFit';
import type { Item } from '../../types';

const bank = INITIAL_BANK as Item[];
const bankMap = buildBankMap(bank, []);
let n = 0;
const rooms = quickBuild({ size: '3-BHK', carpet: 1050, bank, newId: () => `r${++n}` }).rooms;
const ctx: any = { name: 'Dummy', type: 'TURNKEY', area: 1050, config: '3-BHK', rooms, ceilingHeight: 9.5 };
const tiers = generateStandardPackages(ctx, bank, INITIAL_TEMPLATES, 'tiered').map(t => asNewPlaygroundOption(t, bankMap, rooms));
const total = (boq: any[]) => playgroundTotals(boq, bankMap, { rules: PLAYGROUND_PRICING, rooms } as any).sell;
const nameOf = (id: string, t: any) => bankMap.get(t.boq.find((l: any) => String(l.id) === id)?.bankId)?.name || '';

describe('an option against the budget', () => {
  it('says how far over or under, and nothing without a budget', () => {
    expect(budgetGap(1650000, 1500000)).toMatchObject({ over: 150000 });
    expect(budgetGap(1400000, 1500000)!.over).toBe(-100000);
    expect(budgetGap(1400000, 0)).toBeNull();
    expect(budgetGap(0, 1500000)).toBeNull();
  });

  it('the best fit is the dearest option within the budget', () => {
    const opts = [{ id: 'e', total: 1200000 }, { id: 'c', total: 1450000 }, { id: 'h', total: 2100000 }];
    expect(bestFit(opts, 1500000)).toBe('c');
    expect(bestFit(opts, 1300000)).toBe('e');
    expect(bestFit(opts, 1000000)).toBeNull();
    expect(bestFit(opts, undefined)).toBeNull();
  });
});

describe('the extras that can come out', () => {
  const harmony = tiers[2];
  const args = { bankMap, rooms, templates: INITIAL_TEMPLATES, config: '3-BHK' };

  it('are the built-in extras and the false ceiling, never a must-have', () => {
    const names = new Set(extrasOf(harmony, args).map(e => nameOf(e.id, harmony)));
    expect([...names].sort()).toEqual(['CURTAINS & BLINDS', 'DRESSING MIRROR', 'POP FALSE CEILING (Standard)', 'WALL PANELLING', 'WALLPAPER']);
    expect(names.has('WARDOBE WITH LOFT')).toBe(false);
  });

  it('include what the studio marked as an extra on its template', () => {
    const marked = { ...INITIAL_TEMPLATES, '3-BHK': withGrades(INITIAL_TEMPLATES['3-BHK'], 'bedroom', 'gen-016', ['C', 'P']) };
    const names = extrasOf(harmony, { ...args, templates: marked }).map(e => nameOf(e.id, harmony));
    expect(names.filter(x => x === 'HEADBOARD')).toHaveLength(3);
  });

  it('carry what the client pays for each, dearest first, and add up', () => {
    const extras = extrasOf(harmony, args);
    expect(extras.map(e => e.amount)).toEqual([...extras.map(e => e.amount)].sort((a, z) => z - a));
    const out = new Set(extras.map(e => e.id));
    const without = harmony.boq.filter(l => !out.has(String(l.id)));
    expect(total(harmony.boq) - total(without)).toBe(extras.reduce((a, e) => a + e.amount, 0));
  });
});

describe('fitting to the budget', () => {
  const harmony = tiers[2];
  const extras = extrasOf(harmony, { bankMap, rooms, templates: INITIAL_TEMPLATES, config: '3-BHK' });
  const price = total(harmony.boq);

  it('suggests the fewest extras, dearest first, that bring it within the budget', () => {
    const budget = price - extras[0].amount + 1000;
    const out = suggestedOut(price, budget, extras);
    expect(out).toEqual([extras[0].id]);
    expect(fitWithout(price, budget, extras, out)).toMatchObject({ freed: extras[0].amount, remaining: 0 });
  });

  it('suggests nothing for an option already within the budget', () => {
    expect(suggestedOut(price, price + 1, extras)).toEqual([]);
  });

  it('says what is left when every extra is not enough', () => {
    const all = extras.reduce((a, e) => a + e.amount, 0);
    const budget = price - all - 50000;
    const out = suggestedOut(price, budget, extras);
    expect(out).toHaveLength(extras.length);
    expect(fitWithout(price, budget, extras, out)).toMatchObject({ freed: all, total: price - all, remaining: 50000 });
  });

  it('brings a percentage design fee down with the work', () => {
    const fee = (work: number) => work * 0.1;
    const one = [extras[0].id];
    const r = fitWithout(price, 0, extras, one, fee);
    expect(r.total).toBe(Math.round((price - extras[0].amount) * 1.1));
    expect(r.freed).toBe(Math.round(extras[0].amount * 1.1));
    // The fee makes each extra worth more, so fewer are needed than without it.
    const budget = Math.round(price * 1.1) - Math.round(extras[0].amount * 1.1) + 500;
    expect(suggestedOut(price, budget, extras, fee)).toEqual(one);
  });
});
