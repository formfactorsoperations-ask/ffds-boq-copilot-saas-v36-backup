import { describe, it, expect } from 'vitest';
import { tradeFinder, tradeFromName, tradeChoices } from '../../lib/revisionTrades';
import { buildBankMap } from '../../lib/boqPricing';
import { signedLinesFrom } from '../../lib/scopeRevision';
import { startDraft, addCustom, buildBoqFromDraft } from '../../lib/scopeDraft';
import { scopeSplit } from '../../lib/offers';

/*
  Palacia: the revision came from an Excel with most rooms "Compared as a whole".
  Every such line had no item and no category, and "Where the money goes" filed
  ₹9.88L of beds, wardrobes and tiling under Others → Other.
*/

const item = (id: string, name: string, cat: string, materials: number) => ({ id, name, cat, unit: 'sqft', materials, labor: 0, margin: 0 }) as any;
const BANK = [item('w', 'Wardrobe', 'Carpentry', 1000), item('t', 'Wall tiles', 'Civil', 300), item('pb', 'Platform bed with storage', 'Carpentry', 2000)];
const map = buildBankMap(BANK);
const boq = [
  { id: 'a', bankId: 'w', qty: 10, roomId: 'Master Bedroom' },
  { id: 'b', bankId: 't', qty: 100, roomId: 'Master Bathroom' },
  { id: 'c', bankId: 'SRX', name: 'Electrical (labor cost / point)', cat: 'Electrical', qty: 10, selectedRate: 900, roomId: 'Others' },
];
const signed = signedLinesFrom(boq, map, null);

describe('the trade of a revision line', () => {
  const find = tradeFinder({ signed, signedBoq: boq, bankMap: map });

  it('is what the studio set, first', () => {
    expect(find({ name: 'Wardrobe', cat: 'Civil' })).toEqual({ cat: 'Civil', from: 'set' });
  });

  it('follows the signed line it revises, or one of the same name anywhere', () => {
    expect(find({ name: 'Something else', signedLineId: 'a' })).toEqual({ cat: 'Carpentry', from: 'signed' });
    expect(find({ name: 'WARDROBE' })).toEqual({ cat: 'Carpentry', from: 'same name' });
    expect(find({ name: 'Electrical (Labor cost / point)' })).toEqual({ cat: 'Electrical', from: 'same name' });
  });

  it('then a bank item of the same name, then a guess from the name', () => {
    expect(find({ name: 'PLATFORM BED WITH STORAGE' })).toEqual({ cat: 'Carpentry', from: 'bank' });
    expect(find({ name: 'Book storage' })).toEqual({ cat: 'Carpentry', from: 'guess' });
    expect(find({ name: 'Demolish and install - flooring tiles' })).toEqual({ cat: 'Civil', from: 'guess' });
    expect(find({ name: 'Floor protection' })).toEqual({ cat: 'Site services', from: 'guess' });
    expect(find({ name: 'Glass partition (half)' })).toEqual({ cat: 'Glass & mirrors', from: 'guess' });
    expect(find({ name: 'Xyz' })).toEqual({ cat: '', from: 'none' });
    expect(tradeFromName('False ceiling')).toBe('False ceiling');
  });

  it('offers the common trades and the bank’s own, once each', () => {
    const t = tradeChoices(map);
    expect(t.slice(0, 2)).toEqual(['Carpentry', 'False ceiling']);
    expect(t.filter(x => x === 'Civil')).toHaveLength(1);
  });
});

describe('the revised BOQ splits into parts as the signed one does', () => {
  it('files a whole-section room’s Excel lines under their trades, not Other', () => {
    let draft = startDraft(signed, boq, map);
    draft = addCustom(draft, 'Sons Bedroom', { name: 'PLATFORM BED WITH STORAGE', unit: 'sq ft', qty: 40.5, rate: 2252 });
    draft = addCustom(draft, 'Master Bathroom', { name: 'Demolish and install - wall tiles', unit: 'sq ft', qty: 180, rate: 315 });
    draft = addCustom(draft, 'Study', { name: 'Mystery item', unit: 'nos', qty: 1, rate: 1000 });
    draft = { ...draft, lines: draft.lines.map(l => (l.name === 'Mystery item' ? { ...l, cat: 'Carpentry' } : l)) };
    const revised = buildBoqFromDraft(boq, signed, draft, map, 1, 5);
    const split = scopeSplit({ boq: revised } as any, map, null);
    const carpentry = split.parts.carpentry.lines.map(l => l.name);
    expect(carpentry).toEqual(expect.arrayContaining(['PLATFORM BED WITH STORAGE', 'Mystery item']));
    expect(split.parts.civil.lines.map(l => l.name)).toContain('Demolish and install - wall tiles');
    expect(split.parts.others.lines.filter(l => l.trade === 'Other')).toHaveLength(0);
  });
});
