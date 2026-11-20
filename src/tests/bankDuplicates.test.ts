import { describe, it, expect } from 'vitest';
import {
  bankCounts, bankSell, bankUse, mergeCopies, originOf, previousRate, rateChoices, rateEffects, repeatedGroups, separateCopy, settledGroups, suggestMaster,
  withPreviousRate, withStandardRate,
} from '../../lib/bankDuplicates';
import { planPriceLock } from '../../lib/priceLock';
import { matchBank, pickable } from '../../lib/bankMatch';
import { boqTotal, buildBankMap, resolveBoqLine } from '../../lib/boqPricing';

/*
  The bank already held 136 extra copies under 86 names. Settling them keeps
  one item per name and hides the rest as its copies. The promise: no rate, no
  name and no project line reads differently afterwards, and it can be undone.
*/

const item = (id: string, name: string, over: any = {}): any => ({
  id, name, cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1260, labor: 540, margin: 15, ...over,
});

const bank = () => [
  item('gen-015', 'KING SIZE BED WITH STORAGE', { specs: 'Fabrication or supply of King size bed with storage.' }),
  item('ADHOC_a1', 'KING SIZE BED WITH STORAGE', { unit: 'SQFT.', materials: 1596, labor: 684, margin: 0 }),
  item('ADHOC_a2', 'King size bed with storage', { unit: 'SQFT.', materials: 1663, labor: 713, margin: 0 }),
  item('x1', 'PANELLING', { unit: 'SQFT.', materials: 800, labor: 300, margin: 5, specs: 'Imported via Excel' }),
  item('ADHOC_IMP_b1', 'PANELLING', { unit: 'SQFT.', materials: 1008, labor: 432, margin: 0 }),
  item('gen-014', 'WARDOBE WITH LOFT'),
  item('t1', 'TILES (AS ACTUALS)', { unit: 'lumpsum', materials: 30000, labor: 0, margin: 0 }),
  item('t2', 'TILES (AS ACTUALS)', { unit: 'SQFT.', materials: 86, labor: 0, margin: 0 }),
];

const projects = (): any[] => [
  { id: 'p1', lastModified: 100, context: { name: 'Unique Vistas', status: 'won' }, tiers: [
    { id: 't1', name: 'Comfort', timestamp: 50, boq: [{ id: 'l1', bankId: 'ADHOC_a1', qty: 10 }, { id: 'l2', bankId: 'x1', qty: 20, baseRate: 900, labor: 300, marginOverride: 20 }] },
    { id: 't2', name: 'Revised', timestamp: 90, boq: [{ id: 'l3', bankId: 'ADHOC_IMP_b1', qty: 20 }] },
  ] },
  { id: 'p2', lastModified: 200, context: { name: 'Pali Hills', status: 'completed' }, tiers: [
    { id: 't3', name: 'Comfort', timestamp: 70, boq: [{ id: 'l4', bankId: 'gen-015', qty: 40 }, { id: 'l5', bankId: 'ADHOC_IMP_b1', qty: 5 }, { id: 'l6', bankId: 'gone', qty: 1 }] },
  ] },
];

describe('which projects use which copy', () => {
  const use = bankUse(bank(), projects());

  it('counts projects and lines by the item a line points at', () => {
    expect(use.get('gen-015')).toMatchObject({ projects: 1, lines: 1, lastProject: 'Pali Hills' });
    expect(use.get('ADHOC_IMP_b1')).toMatchObject({ projects: 2, lines: 2 });
    expect(use.has('ADHOC_a2')).toBe(false);
    expect(use.has('gone')).toBe(false);
  });

  it('gives the rate it was last used at, as the BOQ prices the line', () => {
    expect(use.get('x1')!.lastRate).toBeCloseTo((900 + 300) * 1.2, 5);
    expect(use.get('ADHOC_IMP_b1')).toMatchObject({ lastAt: 90, lastRate: 1440, lastProject: 'Unique Vistas' });
  });

  it('prefers the rate of a project that was won over a later one that was only quoted', () => {
    const quoted = { id: 'p3', lastModified: 900, context: { name: 'New Project', status: 'proposal_sent' }, tiers: [{ id: 'q', timestamp: 900, boq: [{ id: 'q1', bankId: 'gen-015', qty: 1, marginOverride: 30 }] }] };
    const u = bankUse(bank(), [...projects(), quoted]).get('gen-015')!;
    expect(u).toMatchObject({ projects: 2, lastProject: 'Pali Hills', lastSold: true });
    expect(bankUse(bank(), [quoted]).get('gen-015')).toMatchObject({ lastProject: 'New Project', lastSold: false });
  });
});

describe('the names to settle', () => {
  const use = bankUse(bank(), projects());
  const groups = repeatedGroups(bank(), use);

  it('lists each repeated name once, most copies first, and leaves real variants alone', () => {
    expect(groups.map(g => [g.name, g.copies.length])).toEqual([['KING SIZE BED WITH STORAGE', 3], ['PANELLING', 2]]);
    // Tiles per sq ft and as a lump sum are two items.
    expect(groups.some(g => /tiles/i.test(g.name))).toBe(false);
  });

  it('suggests the studio\'s original, else the copy projects use most', () => {
    expect(groups[0].suggested.id).toBe('gen-015');
    expect(groups[1].suggested.id).toBe('ADHOC_IMP_b1');
    expect(suggestMaster([item('a', 'X'), item('b', 'X', { specs: 'A specification of more than twenty letters' })], new Map()).id).toBe('b');
  });

  it('shows the spread of rates and the last one used', () => {
    expect([groups[0].low, groups[0].high]).toEqual([2070, 2376]);
    expect(groups[1]).toMatchObject({ lastRate: 1440, lastProject: 'Unique Vistas' });
    expect(bankSell(item('l', 'L', { materials: [1440], labor: [], margin: 0 }))).toBe(1440);
    expect([originOf(bank()[0]), originOf(bank()[1]), originOf(bank()[3]), originOf(bank()[4]), originOf(bank()[5])]).toEqual(['Original', 'Revision Studio', 'Excel import', 'Revision Excel import', 'Original']);
  });
});

describe('keeping one item per name', () => {
  const before = bank();
  const after = mergeCopies(before, 'gen-015', ['ADHOC_a1', 'ADHOC_a2']);

  it('marks the copies, and touches nothing else about any item', () => {
    expect(after.filter(i => i.mergedInto).map(i => [i.id, i.mergedInto])).toEqual([['ADHOC_a1', 'gen-015'], ['ADHOC_a2', 'gen-015']]);
    after.forEach((i, n) => {
      const { mergedInto: _m, ...rest } = i as any;
      expect(rest).toEqual(before[n]);
    });
    expect(after.length).toBe(before.length);
    expect(bankCounts(after)).toEqual({ items: 6, copies: 2 });
  });

  it('prices every project line exactly as before', () => {
    projects().forEach(p => p.tiers.forEach((t: any) => {
      const was = buildBankMap(before, []), now = buildBankMap(after, []);
      expect(boqTotal(t.boq, now)).toBe(boqTotal(t.boq, was));
      t.boq.forEach((b: any) => expect(resolveBoqLine(b, now)).toEqual(resolveBoqLine(b, was)));
    }));
  });

  it('then offers the one item, to the picker and to an import', () => {
    expect(pickable(after).filter(i => /king size/i.test(i.name)).map(i => i.id)).toEqual(['gen-015']);
    expect(matchBank('King Size Bed with Storage', after, { unit: 'sqft' }).item?.id).toBe('gen-015');
    expect(repeatedGroups(after, new Map()).map(g => g.name)).toEqual(['PANELLING']);
  });

  it('refuses a choice that makes no sense, giving the same bank back', () => {
    expect(mergeCopies(before, 'nope', ['ADHOC_a1'])).toBe(before);
    expect(mergeCopies(before, 'gen-015', ['gen-015'])).toBe(before);
    // Not the same thing: another name, or the same name measured another way.
    expect(mergeCopies(before, 'gen-015', ['gen-014'])).toBe(before);
    expect(mergeCopies(before, 't1', ['t2'])).toBe(before);
    // A copy cannot be the item kept.
    expect(mergeCopies(after, 'ADHOC_a1', ['gen-015'])).toBe(after);
  });

  it('moves a copy\'s own copies along when its item is merged in turn', () => {
    const step1 = mergeCopies(before, 'ADHOC_a1', ['ADHOC_a2']);
    const step2 = mergeCopies(step1, 'gen-015', ['ADHOC_a1']);
    expect(step2.find(i => i.id === 'ADHOC_a2')!.mergedInto).toBe('gen-015');
    expect(step2.find(i => i.id === 'ADHOC_a1')!.mergedInto).toBe('gen-015');
  });

  it('can be undone, copy by copy', () => {
    const back = separateCopy(separateCopy(after, 'ADHOC_a1'), 'ADHOC_a2');
    expect(back).toEqual(before);
    expect('mergedInto' in back[1]).toBe(false);
    expect(separateCopy(before, 'gen-015')).toBe(before);
  });

  it('lists what has been settled, item by item', () => {
    expect(settledGroups(after).map(g => [g.master?.id, g.copies.map(c => c.id)])).toEqual([['gen-015', ['ADHOC_a1', 'ADHOC_a2']]]);
    const orphan = [...before, item('o1', 'LOST', { mergedInto: 'deleted-item' })];
    expect(settledGroups(orphan)[0]).toMatchObject({ master: null });
  });
});

/*
  The rate the kept item carries. With every project's lines holding their own
  price, the bank's rate is only what a NEW line starts from, so it can be set
  to what the studio sells at now. It is checked, not assumed: a line that still
  follows the bank would be re-priced, and that name's rate is then left alone.
*/
describe('setting the standard rate', () => {
  const kept = item('gen-015', 'KING SIZE BED WITH STORAGE');   // 1260 + 540 at 15% = 2070

  it('sells at the new rate, keeps its margin and its split of cost, and remembers what it was', () => {
    const next = withStandardRate(kept, 2280, 99);
    // To the rate asked, not a few paise off it: 40 sq ft must come to 91,200.
    expect(bankSell(next)).toBeCloseTo(2280, 3);
    expect(Math.round(bankSell(next) * 40)).toBe(91200);
    expect(Number.isInteger(next.materials)).toBe(true);
    expect(next.margin).toBe(15);
    expect(next.materials / (next.materials + next.labor)).toBeCloseTo(0.7, 2);
    expect(next.rateHistory).toEqual([{ at: 99, materials: 1260, labor: 540, margin: 15 }]);
    expect(previousRate(next)).toBe(2070);
    expect([next.id, next.name, next.unit, next.specs]).toEqual([kept.id, kept.name, kept.unit, kept.specs]);
  });

  it('changes nothing for the rate it already has, or a rate that is no rate', () => {
    expect(withStandardRate(kept, 2070)).toBe(kept);
    expect(withStandardRate(kept, 2070.4)).toBe(kept);
    expect(withStandardRate(kept, 0)).toBe(kept);
    expect(withStandardRate(kept, NaN)).toBe(kept);
  });

  it('gives an item with no cost a 65/35 split, and reads figures stored in a list', () => {
    const bare = withStandardRate(item('n', 'NEW', { materials: 0, labor: 0, margin: 20 }), 1200);
    expect([bare.materials, bare.labor, bare.margin]).toEqual([650, 350, 20]);
    const listed = withStandardRate(item('l', 'PANEL', { materials: [1440], labor: [], margin: 0 }), 1500, 5);
    expect([listed.materials, listed.labor]).toEqual([1500, 0]);
    expect(listed.rateHistory![0]).toEqual({ at: 5, materials: [1440], labor: [], margin: 0 });
  });

  it('is put back exactly, one change at a time', () => {
    const twice = withStandardRate(withStandardRate(kept, 2280, 1), 2376, 2);
    expect(previousRate(twice)).toBeCloseTo(2280, 3);
    const once = withPreviousRate(twice);
    expect(Math.round(bankSell(once))).toBe(2280);
    expect(once.rateHistory).toHaveLength(1);
    const back = withPreviousRate(once);
    expect(back).toEqual(kept);
    expect('rateHistory' in back).toBe(false);
    expect(withPreviousRate(kept)).toBe(kept);
    expect(previousRate(kept)).toBeNull();
    // A list comes back as the list it was.
    const listed = item('l', 'PANEL', { materials: [1440], labor: [], margin: 0 });
    expect(withPreviousRate(withStandardRate(listed, 1500))).toEqual(listed);
  });

  it('offers the rates the name has been at, without the kept item\'s own', () => {
    const copies = [kept, bank()[1], bank()[2]];
    expect(rateChoices(kept, copies, 2280, true)).toEqual([{ rate: 2280, label: 'last sold' }, { rate: 2376, label: 'a copy' }]);
    expect(rateChoices(kept, copies, 2070, true).map(c => c.rate)).toEqual([2376, 2280]);
    expect(rateChoices(kept, [kept], null, false)).toEqual([]);
    expect(rateChoices(kept, copies, 2500, false)[0]).toEqual({ rate: 2500, label: 'last quoted' });
  });
});

describe('is it safe to change this item\'s rate?', () => {
  const b = bank();
  const next = withStandardRate(b[0], 2280);
  const follows: any = { id: 'p1', context: { name: 'New Project', status: 'lead' }, tiers: [{ id: 't1', name: 'Option 1', boq: [{ id: 'l1', bankId: 'gen-015', qty: 40, baseRate: 1260 }] }, { id: 't2', name: 'Option 2', boq: [{ id: 'l2', bankId: 'gen-014', qty: 10 }] }] };

  it('names the options a line that still follows the bank would re-price', () => {
    const fx = rateEffects(b, next, [follows]);
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({ project: 'New Project', option: 'Option 1' });
    expect(fx[0].after).not.toBe(fx[0].before);
  });

  it('finds nothing once the project\'s prices are locked', () => {
    const locked = planPriceLock(follows, b).project;
    expect(rateEffects(b, next, [locked])).toEqual([]);
  });

  it('finds nothing in a project that reads its own copy of the item, or does not use it', () => {
    const own = { ...follows, context: { ...follows.context, adHocItems: [item('gen-015', 'KING SIZE BED WITH STORAGE')] } };
    expect(rateEffects(b, next, [own])).toEqual([]);
    expect(rateEffects(b, withStandardRate(b[3], 2000), [follows])).toEqual([]);
    expect(rateEffects(b, next, [])).toEqual([]);
    expect(rateEffects(b, next, [null as any, { id: 'x' } as any])).toEqual([]);
  });

  it('catches a cost that would move even when the sell rate would not', () => {
    // Margin on the line, materials and labour from the bank: the split is the bank's.
    const marginOnly: any = { id: 'p2', context: { name: 'Draft' }, tiers: [{ id: 't', name: 'A', boq: [{ id: 'l', bankId: 'gen-015', qty: 1, marginOverride: 15 }] }] };
    expect(rateEffects(b, next, [marginOnly])).toHaveLength(1);
  });
});
