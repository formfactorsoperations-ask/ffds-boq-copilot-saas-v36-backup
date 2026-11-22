/*
  One edit, every option (lib/playground/allOptions.ts): what is in the flat
  reaches every option; finish, rate and margin stay in the option edited.
*/
import { describe, it, expect } from 'vitest';
import { scopeEdit, applyScopeEdit, isEmptyEdit, lineKeys, namesOf } from '../../lib/playground/allOptions';
import { priceForOption } from '../../lib/standardPackages';
import { STANDARD_SETUP } from '../../lib/optionSetup';

const L = (id: string, bankId: string, roomId: string, extra: any = {}): any => ({ id, bankId, roomId, qty: 10, ...extra });
let n = 0;
const newId = () => `new${++n}`;
const tag = (opt: string) => (l: any) => ({ ...l, pricedFor: opt });

/* Comfort, and Complete with its own rates, an extra and the lines in another order. */
const comfort = () => [L('c1', 'w', 'Bedroom', { baseRate: 1000, marginOverride: 24 }), L('c2', 'paint', 'Bedroom'), L('c3', 'w', 'Kids', { baseRate: 1000 })];
const complete = () => [L('p3', 'w', 'Kids', { baseRate: 1350 }), L('p1', 'w', 'Bedroom', { baseRate: 1350, marginOverride: 30, materialSpecs: { a: 1 } }), L('p2', 'paint', 'Bedroom'), L('p9', 'curtain', 'Bedroom')];

describe('one edit, every option', () => {
  it('a resize or a move reaches the same line in the other option; its rate, margin and specs stay its own', () => {
    const before = comfort();
    const after = before.map(l => (l.id === 'c1' ? { ...l, qty: 14, calcLength: 7, place: { x: 1, y: 2, rot: 0, depthFt: 2 }, marginOverride: 28 } : l.id === 'c3' ? { ...l, roomId: 'Study' } : l));
    const e = scopeEdit(before, after);
    expect(e.changed.map(c => c.key)).toEqual(['w|Bedroom|#0', 'w|Kids|#0']);
    // The margin is not scope: it is not carried.
    expect(e.changed[0].patch).toEqual({ qty: 14, calcLength: 7, place: { x: 1, y: 2, rot: 0, depthFt: 2 } });
    const r = applyScopeEdit(e, complete(), tag('P'), newId);
    const p1 = r.boq.find(l => l.id === 'p1')!;
    expect(p1).toMatchObject({ qty: 14, calcLength: 7, baseRate: 1350, marginOverride: 30, materialSpecs: { a: 1 } });
    expect(r.boq.find(l => l.id === 'p3')!.roomId).toBe('Study');
    expect([r.applied, r.missed]).toEqual([2, 0]);
  });

  it('a finish, rate or margin change alone is not a scope edit', () => {
    const before = comfort();
    expect(isEmptyEdit(scopeEdit(before, before.map(l => (l.id === 'c1' ? { ...l, baseRate: 1200, marginOverride: 30, materialSpecs: { x: 2 }, specs: 'Acrylic' } : l))))).toBe(true);
  });

  it('a deletion removes the same line; one the other option does not have is counted, not guessed', () => {
    const before = comfort();
    const r = applyScopeEdit(scopeEdit(before, before.filter(l => l.id !== 'c2')), complete(), tag('P'), newId);
    expect(r.boq.map(l => l.id)).toEqual(['p3', 'p1', 'p9']);
    const lean = [L('e1', 'w', 'Bedroom')];
    expect(applyScopeEdit(scopeEdit(before, before.filter(l => l.id !== 'c3')), lean, tag('E'), newId)).toMatchObject({ applied: 0, missed: 1 });
  });

  it('an added line is made in the other option with its scope, priced there; its own extras are untouched', () => {
    const before = comfort();
    const added = L('c4', 'tv', 'Living', { qty: 12, calcLength: 6, calcWidth: 2, place: { x: 3, y: 3, rot: 90, depthFt: 1.5 }, baseRate: 999, marginOverride: 24, materialSpecs: { comfort: 1 } });
    const r = applyScopeEdit(scopeEdit(before, [...before, added]), complete(), tag('P'), newId);
    const made = r.boq.find(l => l.bankId === 'tv')!;
    expect(made).toEqual({ id: expect.stringMatching(/^new/), bankId: 'tv', roomId: 'Living', qty: 12, calcLength: 6, calcWidth: 2, place: { x: 3, y: 3, rot: 90, depthFt: 1.5 }, pricedFor: 'P' });
    expect(r.boq.find(l => l.id === 'p9')).toBeTruthy();
  });

  it('an option that already has a line of that kind is not given more than the edited option has (debris, once)', () => {
    const before = comfort();
    const debris = L('c5', 'debris', 'Whole flat', { qty: 1 });
    const target = [...complete(), L('p5', 'debris', 'Whole flat', { qty: 1 })];
    const r = applyScopeEdit(scopeEdit(before, [...before, debris]), target, tag('P'), newId);
    expect(r.boq.filter(l => l.bankId === 'debris')).toHaveLength(1);
    // Two of the same in a room are matched in order.
    expect(lineKeys([L('a', 'w', 'Bed'), L('b', 'w', 'Bed')])).toEqual(new Map([['a', 'w|Bed|#0'], ['b', 'w|Bed|#1']]));
  });

  it('an item is priced for each option as the generator prices it', () => {
    const wardrobe: any = { id: 'w', cat: 'Carpentry', materials: 1000, labor: 400, margin: 20 };
    const paint: any = { id: 'p', cat: 'Painting', materials: 20, labor: 10, margin: 25 };
    expect(priceForOption(wardrobe, STANDARD_SETUP.E)).toEqual({ marginOverride: 17, baseRate: 880 });
    expect(priceForOption(wardrobe, STANDARD_SETUP.C)).toEqual({ marginOverride: 20 });
    expect(priceForOption(wardrobe, STANDARD_SETUP.P)).toEqual({ marginOverride: 25, baseRate: 1350 });
    // Painting has no grades: its rate stays, its margin follows the option.
    expect(priceForOption(paint, STANDARD_SETUP.P)).toEqual({ marginOverride: 31.3 });
    expect(namesOf(['Essential Elegance', 'Complete Harmony'])).toBe('Essential Elegance and Complete Harmony');
  });
});
