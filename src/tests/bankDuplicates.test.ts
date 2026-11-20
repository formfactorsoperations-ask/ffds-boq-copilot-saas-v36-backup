import { describe, it, expect } from 'vitest';
import { bankCounts, bankSell, bankUse, mergeCopies, originOf, repeatedGroups, separateCopy, settledGroups, suggestMaster } from '../../lib/bankDuplicates';
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
