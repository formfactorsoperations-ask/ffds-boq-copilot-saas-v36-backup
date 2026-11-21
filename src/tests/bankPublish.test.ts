import { describe, it, expect } from 'vitest';
import { NOTHING_TO_PUBLISH, planPublish, publishQuestion } from '../../lib/bankPublish';
import { mergeCopies, withStandardRate, withPreviousRate, bankSell } from '../../lib/bankDuplicates';
import { pickable } from '../../lib/bankMatch';
import { buildBankMap, resolveBoqLine } from '../../lib/boqPricing';

/*
  "Publish draft to live" used to set the live bank to the draft, whole. A
  draft copied before work was done on the live bank undid that work: items
  made since were dropped, hidden copies came back as second items, and
  standard rates went back. Publishing now puts the draft's edits into the live
  bank and leaves the rest of it alone.
*/

const item = (id: string, name: string, over: any = {}): any => ({
  id, name, cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1260, labor: 540, margin: 15, ...over,
});

const start = () => [
  item('gen-015', 'KING SIZE BED WITH STORAGE'),
  item('ADHOC_a1', 'KING SIZE BED WITH STORAGE', { unit: 'SQFT.', materials: 1596, labor: 684, margin: 0 }),
  item('gen-014', 'WARDOBE WITH LOFT', { materials: 1295, labor: 555 }),
  item('gen-005', 'TV UNIT', { materials: 1400, labor: 600 }),
];
const byId = (bank: any[], id: string) => bank.find(i => i.id === id);

describe('publishing the draft sandbox to the live bank', () => {
  it('publishes an edit made in the draft', () => {
    const live = start();
    const draft = start().map(i => i.id === 'gen-005' ? { ...i, materials: 1500, specs: 'With back panel' } : i);
    const plan = planPublish(live, draft);
    expect(byId(plan.bank, 'gen-005')).toMatchObject({ materials: 1500, labor: 600, margin: 15, specs: 'With back panel' });
    expect(plan.changed.map(i => i.id)).toEqual(['gen-005']);
    expect(plan.rates).toEqual([{ id: 'gen-005', name: 'TV UNIT', from: 2300, to: 2415 }]);
    expect(plan.nothing).toBe(false);
    // Everything else is the very same object: untouched.
    expect(byId(plan.bank, 'gen-015')).toBe(live[0]);
  });

  it('keeps an item made in the live bank after the draft was copied, so no project line loses its item', () => {
    const draft = start();
    const live = [...start(), item('new-1', 'AQUARIUM STAND', { materials: 1300, labor: 700, margin: 0 })];
    const plan = planPublish(live, draft);
    expect(plan.kept.map(i => i.id)).toEqual(['new-1']);
    expect(plan.nothing).toBe(true);
    const line = { id: 'l1', bankId: 'new-1', qty: 6 };
    expect(resolveBoqLine(line, buildBankMap(plan.bank, []))).toMatchObject({ name: 'AQUARIUM STAND', rate: 2000, total: 12000 });
    // The old publish: the item is gone and the line reads ₹0.
    expect(resolveBoqLine(line, buildBankMap(draft, [])).total).toBe(0);
  });

  it('never deletes: an item removed in the draft stays in the live bank', () => {
    const plan = planPublish(start(), start().filter(i => i.id !== 'gen-014'));
    expect(byId(plan.bank, 'gen-014')).toBeTruthy();
    expect(plan.kept.map(i => i.id)).toEqual(['gen-014']);
    expect(publishQuestion({ ...plan, changed: [byId(plan.bank, 'gen-005')] })).toContain('Publishing never deletes an item');
  });

  it('keeps copies hidden that were settled in the live bank after the draft was copied', () => {
    const draft = start();
    const live = mergeCopies(start(), 'gen-015', ['ADHOC_a1']);
    expect(pickable(live).filter(i => /KING SIZE/.test(i.name))).toHaveLength(1);
    const plan = planPublish(live, draft.map(i => i.id === 'gen-005' ? { ...i, labor: 650 } : i));
    expect(byId(plan.bank, 'ADHOC_a1').mergedInto).toBe('gen-015');
    expect(pickable(plan.bank).filter(i => /KING SIZE/.test(i.name))).toHaveLength(1);
    expect(plan.labelsKept.map(i => i.id)).toEqual(['ADHOC_a1']);
    expect(byId(plan.bank, 'gen-005').labor).toBe(650);
  });

  it('keeps an item an item when the live bank made it one again, whatever the draft says', () => {
    const draft = mergeCopies(start(), 'gen-015', ['ADHOC_a1']);
    const plan = planPublish(start(), draft);
    expect(byId(plan.bank, 'ADHOC_a1')).not.toHaveProperty('mergedInto');
    expect(plan.nothing).toBe(true);
  });

  it('keeps a standard rate set in the live bank when the draft still holds the old figures', () => {
    const draft = start();
    const live = start().map(i => i.id === 'gen-015' ? withStandardRate(i, 2280, 1000) : i);
    const plan = planPublish(live, draft);
    expect(Math.round(bankSell(byId(plan.bank, 'gen-015')))).toBe(2280);
    expect(byId(plan.bank, 'gen-015')).toBe(byId(live, 'gen-015'));
    expect(plan.ratesKept.map(i => i.id)).toEqual(['gen-015']);
    expect(plan.rates).toEqual([]);
    expect(plan.nothing).toBe(true);
    // "Put ₹2,070 back" still works afterwards.
    expect(Math.round(bankSell(withPreviousRate(byId(plan.bank, 'gen-015'))))).toBe(2070);
  });

  it('but publishes a rate the draft really changed on that item, and keeps the record so it can be put back', () => {
    const live = start().map(i => i.id === 'gen-015' ? withStandardRate(i, 2280, 1000) : i);
    const draft = start().map(i => i.id === 'gen-015' ? { ...i, materials: 1400, labor: 600 } : i);
    const plan = planPublish(live, draft);
    expect(byId(plan.bank, 'gen-015')).toMatchObject({ materials: 1400, labor: 600, margin: 15 });
    expect(byId(plan.bank, 'gen-015').rateHistory).toEqual(byId(live, 'gen-015').rateHistory);
    expect(plan.rates).toEqual([{ id: 'gen-015', name: 'KING SIZE BED WITH STORAGE', from: 2280, to: 2300 }]);
    expect(plan.ratesKept).toEqual([]);
  });

  it('adds an item made in the draft, and hides one the bank already has by name and unit', () => {
    const draft = [...start(), item('d-1', 'POOJA UNIT', { materials: 900, labor: 300 }), item('d-2', 'tv unit', { unit: 'SQFT', materials: 1000, labor: 400 })];
    const plan = planPublish(start(), draft);
    expect(plan.added.map(i => i.id)).toEqual(['d-1']);
    expect(plan.addedAsCopies.map(i => [i.id, i.mergedInto])).toEqual([['d-2', 'gen-005']]);
    expect(pickable(plan.bank).filter(i => /tv unit/i.test(i.name))).toHaveLength(1);
    expect(plan.bank).toHaveLength(6);
  });

  it('says there is nothing to publish when the draft is the live bank, an old copy of it, or empty', () => {
    expect(planPublish(start(), start()).nothing).toBe(true);
    expect(planPublish(start(), []).nothing).toBe(true);
    expect(planPublish(start(), []).bank).toHaveLength(4);
    // Fields written in another order are the same item.
    const shuffled = start().map(i => Object.fromEntries(Object.entries(i).reverse()));
    expect(planPublish(start(), shuffled as any).nothing).toBe(true);
    expect(NOTHING_TO_PUBLISH).toContain('Nothing was published');
  });

  it('carries figures stored as a list exactly as they are', () => {
    const odd = item('odd-1', 'PANELING', { materials: [1440], labor: [], margin: 0 });
    const plan = planPublish([...start(), odd], [...start(), { ...odd }]);
    expect(plan.nothing).toBe(true);
    expect(byId(plan.bank, 'odd-1')).toMatchObject({ materials: [1440], labor: [] });
  });

  it('changes neither bank it is given', () => {
    const live = mergeCopies(start(), 'gen-015', ['ADHOC_a1']);
    const draft = [...start().map(i => ({ ...i, margin: 20 })), item('d-1', 'POOJA UNIT')];
    const before = JSON.stringify({ live, draft });
    planPublish(live, draft);
    expect(JSON.stringify({ live, draft })).toBe(before);
  });

  it('tells the owner what will happen, in figures', () => {
    const live = [...mergeCopies(start(), 'gen-015', ['ADHOC_a1']), item('new-1', 'AQUARIUM STAND')];
    const draft = [...start().map(i => i.id === 'gen-005' ? { ...i, materials: 1500 } : i), item('d-1', 'POOJA UNIT')];
    const text = publishQuestion(planPublish(live, draft));
    expect(text).toContain('1 item changes, 1 in its rate');
    expect(text).toContain('TV UNIT: ₹2,300 → ₹2,415');
    expect(text).toContain('1 new item is added');
    expect(text).toContain('1 item the draft does not have stays in the live bank');
    expect(text).toContain('Repeated items stay as you settled them');
    expect(text).not.toMatch(/overwrite/i);
  });
});
