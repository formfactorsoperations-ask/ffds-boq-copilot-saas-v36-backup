import { describe, it, expect } from 'vitest';
import { addToBank, bankNameKey, canonicalOf, duplicateGroups, isMergedCopy, masterFor, matchBank, pickable, sameThingKey, syncRevisionItems } from '../../lib/bankMatch';

/*
  The Item Bank held "KING SIZE BED WITH STORAGE" four times: each import and
  each revision that met it added it again to carry a project's price. These
  are the rules that stop that: what counts as the same item, which copy is
  used, how a name from a sheet finds its item, and how a copy is kept without
  being seen.
*/

const item = (id: string, name: string, over: any = {}): any => ({
  id, name, cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1260, labor: 540, margin: 15, ...over,
});

const bank = () => [
  item('gen-015', 'KING SIZE BED WITH STORAGE'),
  item('ADHOC_a1', 'KING SIZE BED WITH STORAGE', { unit: 'SQFT.', materials: 1596, labor: 684, margin: 0 }),
  item('gen-005', 'T.V. UNIT(DRAWER)'),
  item('gen-014', 'WARDOBE WITH LOFT'),
  item('gen-040', 'WARDOBE WITH LOFT (LESS DEPTH)'),
  item('gen-030', 'TILES (AS ACTUALS)', { unit: 'lumpsum', materials: 11000, labor: 0, margin: 0 }),
  item('x-1', 'TILES (AS ACTUALS)', { unit: 'SQFT.', materials: 86, labor: 0, margin: 0 }),
  item('gen-011', 'CABINETS BELOW COUNTER (TANDEM)'),
  item('gen-038', 'CABINETS BELOW COUNTER (SS)'),
  item('gen-050', 'KITCHEN SLIDING DOOR'),
  item('blank', '   '),
];

describe('what counts as the same item', () => {
  it('reads a name without its capitals, dots and punctuation', () => {
    expect(bankNameKey('T.V. Unit (Drawer)')).toBe(bankNameKey('TV UNIT(DRAWER)'));
    expect(bankNameKey('POP FALSE CEILING (Living Room)')).toBe(bankNameKey('pop false ceiling - living room'));
    expect(bankNameKey('  King size bed  with storage ')).toBe('king size bed with storage');
  });

  it('needs the unit to agree too, however it is spelled', () => {
    expect(sameThingKey({ name: 'Headboard', unit: 'SQFT.' })).toBe(sameThingKey({ name: 'HEADBOARD', unit: 'sq ft' }));
    expect(sameThingKey({ name: 'Tiles (as actuals)', unit: 'lumpsum' })).not.toBe(sameThingKey({ name: 'Tiles (as actuals)', unit: 'sqft' }));
    expect(sameThingKey({ name: 'Electrical', unit: "NO's" })).toBe(sameThingKey({ name: 'Electrical', unit: 'nos' }));
  });

  it('finds the groups the bank still has to settle', () => {
    expect(duplicateGroups(bank()).map(g => g.map(i => i.id))).toEqual([['gen-015', 'ADHOC_a1']]);
  });
});

describe('which copy is used', () => {
  it('the studio\'s own item before one a project made, then the bank\'s order', () => {
    expect(canonicalOf([item('ADHOC_x', 'A'), item('gen-1', 'A')])?.id).toBe('gen-1');
    expect(canonicalOf([item('m1', 'A'), item('m2', 'A')])?.id).toBe('m1');
    expect(canonicalOf([])).toBeNull();
  });

  it('never a copy that has been merged into another', () => {
    const b = [item('old', 'HEADBOARD', { mergedInto: 'new' }), item('new', 'HEADBOARD')];
    expect(pickable(b).map(i => i.id)).toEqual(['new']);
    expect(isMergedCopy(b[0])).toBe(true);
    expect(masterFor({ id: 'p1', name: 'Headboard', unit: 'sqft' }, b)?.id).toBe('new');
  });

  it('an item is not a copy of itself, and a nameless item is a copy of nothing', () => {
    expect(masterFor(bank()[2], bank())).toBeNull();
    expect(masterFor({ id: 'n', name: '', unit: 'nos' }, bank())).toBeNull();
    expect(masterFor(bank()[1], bank())?.id).toBe('gen-015');
  });
});

describe('a name from a sheet finds its item', () => {
  it('exactly, by how the name reads', () => {
    const m = matchBank('king size bed with storage', bank(), { unit: 'SQFT' });
    expect(m.kind).toBe('exact');
    expect(m.item?.id).toBe('gen-015');
    expect(matchBank('TV UNIT (DRAWER)', bank()).item?.id).toBe('gen-005');
  });

  it('the same words measured another way are only close, and offered first', () => {
    const m = matchBank('King size bed with storage', bank(), { unit: 'nos' });
    expect(m.kind).toBe('close');
    expect(m.item?.id).toBe('gen-015');
    // Two real items share a name: the unit picks between them.
    expect(matchBank('Tiles (as actuals)', bank(), { unit: 'LUMPSUM' }).item?.id).toBe('gen-030');
    expect(matchBank('Tiles (as actuals)', bank(), { unit: 'sq ft' }).item?.id).toBe('x-1');
  });

  it('closely, when a note or a size was added to the name', () => {
    const custom = matchBank('KING SIZE BED WITH STORAGE (CUSTOM)', bank(), { unit: 'sqft' });
    expect(custom.kind).toBe('close');
    expect(custom.item?.id).toBe('gen-015');
    expect(matchBank('Kitchen sliding door 7 x 4 ft', bank()).item?.id).toBe('gen-050');
    expect(matchBank('KITCHEN SLIDING DOOR (PVC)', bank()).kind).toBe('close');
  });

  it('does not take a longer thing for the shorter item inside its name', () => {
    const b = [...bank(), item('s1', 'SOFA', { unit: 'nos' }), item('w1', 'WORK UNIT')];
    expect(matchBank('SOFA CUM BED', b)).toMatchObject({ kind: 'none', item: null });
    expect(matchBank('SOFA CUM BED', b).candidates.map(i => i.id)).toEqual(['s1']);
    expect(matchBank('WORK UNIT + SOFT BOARD', b).kind).toBe('none');
  });

  it('offers the variants, best first, and never picks between them silently', () => {
    const m = matchBank('Cabinets below counter', bank());
    expect(m.kind).toBe('none');
    expect(m.candidates.map(i => i.id).sort()).toEqual(['gen-011', 'gen-038']);
    const loft = matchBank('WARDOBE WITH LOFT', bank());
    expect(loft.kind).toBe('exact');
    expect(loft.candidates.map(i => i.id)).toEqual(['gen-014', 'gen-040']);
  });

  it('says none for something the bank does not have', () => {
    expect(matchBank('Aquarium stand', bank())).toMatchObject({ kind: 'none', item: null, candidates: [] });
    expect(matchBank('', bank()).kind).toBe('none');
    expect(matchBank('Headboard', []).kind).toBe('none');
  });

  it('offers one item per name, not each of its copies', () => {
    const m = matchBank('King size bed', bank());
    expect(m.candidates.filter(i => bankNameKey(i.name) === 'king size bed with storage')).toHaveLength(1);
  });
});

describe('adding to the bank', () => {
  it('a new thing goes in as an item', () => {
    const out = addToBank(bank(), [item('n1', 'AQUARIUM STAND')]);
    expect(out[out.length - 1]).toMatchObject({ id: 'n1' });
    expect(isMergedCopy(out[out.length - 1])).toBe(false);
  });

  it('something the bank has goes in as its copy: found by its id, not seen as an item', () => {
    const before = bank();
    const out = addToBank(before, [item('ADHOC_z9', 'King Size Bed with Storage', { unit: 'sqft', materials: 1663, labor: 713, margin: 0 })]);
    const added = out.find(i => i.id === 'ADHOC_z9')!;
    expect(added.mergedInto).toBe('gen-015');
    expect(added.materials).toBe(1663);
    expect(pickable(out).map(i => i.id)).toEqual(pickable(before).map(i => i.id));
    expect(duplicateGroups(out)).toHaveLength(duplicateGroups(before).length);
  });

  it('the same thing measured another way is a new item', () => {
    const out = addToBank(bank(), [item('n2', 'KING SIZE BED WITH STORAGE', { unit: 'nos' })]);
    expect(isMergedCopy(out.find(i => i.id === 'n2'))).toBe(false);
  });

  it('two of one new thing in a batch: the first is the item, the second its copy', () => {
    const out = addToBank(bank(), [item('n3', 'POOJA UNIT'), item('n4', 'Pooja Unit')]);
    expect(out.find(i => i.id === 'n3')!.mergedInto).toBeUndefined();
    expect(out.find(i => i.id === 'n4')!.mergedInto).toBe('n3');
  });

  it('leaves an id the bank holds exactly as it is, and gives the same bank back when nothing is new', () => {
    const b = bank();
    expect(addToBank(b, [item('gen-015', 'KING SIZE BED WITH STORAGE', { materials: 1 })])).toBe(b);
    expect(addToBank(b, [])).toBe(b);
    expect(addToBank(b, [null as any, { name: 'no id' } as any])).toBe(b);
  });

  it('puts new items first when asked, as the bank screen does', () => {
    expect(addToBank(bank(), [item('n5', 'AQUARIUM STAND')], 'start')[0].id).toBe('n5');
  });
});

describe('Revision Studio\'s Approve & Sync, into the bank', () => {
  const revised = (id: string, name: string, rate: number, over: any = {}) => item(id, name, { unit: 'SQFT.', materials: Math.round(rate * 0.7), labor: Math.round(rate * 0.3), margin: 0, specs: '', ...over });

  it('never writes a project\'s rate over a standard bank item', () => {
    const b = bank();
    const out = syncRevisionItems(b, [revised('gen-015', 'KING SIZE BED WITH STORAGE', 2376)]);
    expect(out).toBe(b);
    expect(out.find(i => i.id === 'gen-015')).toMatchObject({ materials: 1260, labor: 540, margin: 15 });
  });

  it('refreshes a revision\'s own item, and keeps it a copy if it was one', () => {
    const b = [...bank().slice(0, 1), { ...bank()[1], mergedInto: 'gen-015' }];
    const out = syncRevisionItems(b, [revised('ADHOC_a1', 'KING SIZE BED WITH STORAGE', 2500)]);
    expect(out.find(i => i.id === 'ADHOC_a1')).toMatchObject({ materials: 1750, labor: 750, mergedInto: 'gen-015' });
  });

  it('adds a new one as a copy when the bank has that item, and as an item when it does not', () => {
    const before = bank();
    const out = syncRevisionItems(before, [revised('ADHOC_n1', 'Wardobe with Loft', 2640), revised('ADHOC_n2', 'PANELING AROUND HEADBOARD', 1440)]);
    expect(out.find(i => i.id === 'ADHOC_n1')!.mergedInto).toBe('gen-014');
    expect(isMergedCopy(out.find(i => i.id === 'ADHOC_n2'))).toBe(false);
    expect(pickable(out)).toHaveLength(pickable(before).length + 1);
    expect(syncRevisionItems(before, [])).toBe(before);
  });
});
