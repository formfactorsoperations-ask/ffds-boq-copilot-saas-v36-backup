import { describe, it, expect } from 'vitest';
import type { Item, BoqItem } from '../../types';
import { buildBankMap, resolveBoqLine } from '../../lib/boqPricing';
import {
  finishApplies, finishUpdates, clearFinishUpdates, refreshFromBankUpdates, finishFactorOf, finishBaseOf,
} from '../../lib/playground/finishes';
import {
  lineIssues, boqIssues, marginFloorFor, markupForMargin, ISSUE_LABEL,
} from '../../lib/playground/issues';
import { boardPieces, newPlace, drawOf } from '../../lib/playground/pieces';

const item = (o: Partial<Item> & Pick<Item, 'id' | 'name'>): Item =>
  ({ cat: 'Carpentry', specs: 'BWR plywood carcass, laminate outside.', unit: 'sq ft', materials: 1500, labor: 400, margin: 25, ...o });

const WARD = item({ id: 'w', name: 'Sliding wardrobe' });
const ELEC = item({ id: 'e', name: 'Electrical points', cat: 'Electrical', unit: 'nos', materials: 500, labor: 100 });

describe('finishes write baseRate', () => {
  it('prices a finish as base × factor, on materials only', () => {
    const line: BoqItem = { id: 'l', bankId: 'w', qty: 42 };
    const ash = finishUpdates(line, WARD, 0.85)!;
    expect(ash).toEqual({ finishBase: 1500, baseRate: 1275 });
    // The rate every reader computes follows, labour untouched: (1275 + 400) × 1.25.
    expect(resolveBoqLine({ ...line, ...ash }, buildBankMap([WARD])).rate).toBe(2093.75);
  });

  it('never stacks finishes', () => {
    const ash = { id: 'l', bankId: 'w', qty: 42, ...finishUpdates({}, WARD, 0.85)! };
    const walnut = finishUpdates(ash, WARD, 1.3)!;
    expect(walnut).toEqual({ finishBase: 1500, baseRate: 1950 });
    expect(finishFactorOf({ ...ash, ...walnut }, WARD)).toBe(1.3);
  });

  it('starts from a quoted line’s frozen rate, not the bank’s', () => {
    expect(finishUpdates({ baseRate: 1400 }, WARD, 1.3)).toEqual({ finishBase: 1400, baseRate: 1820 });
    expect(finishBaseOf({ baseRate: 1400 }, WARD)).toBe(1400);
  });

  it('a factor of 1 keeps the base for the next finish', () => {
    expect(finishUpdates({}, WARD, 1)).toEqual({ finishBase: 1500, baseRate: 1500 });
    expect(finishUpdates({}, WARD, null)).toEqual({ finishBase: 1500, baseRate: 1500 });
    expect(finishFactorOf({}, WARD)).toBe(1);
  });

  it('takes the finish off', () => {
    expect(clearFinishUpdates({ finishBase: 1500, baseRate: 1950 }, WARD)).toEqual({ baseRate: 1500, finishBase: null });
  });

  it('refreshes from the Item Bank and keeps the finish', () => {
    const bankNow = { ...WARD, materials: 1600 };
    expect(refreshFromBankUpdates({ finishBase: 1400, baseRate: 1820 }, bankNow)).toEqual({ finishBase: 1600, baseRate: 2080 });
    expect(refreshFromBankUpdates({ finishBase: 1400, baseRate: 1820 }, bankNow, 0.85)).toEqual({ finishBase: 1600, baseRate: 1360 });
    expect(refreshFromBankUpdates({ baseRate: 450 }, ELEC)).toEqual({ baseRate: 500, finishBase: null });
  });

  it('leaves items without an outer finish alone', () => {
    expect(finishApplies(ELEC)).toBe(false);
    expect(finishApplies(WARD)).toBe(true);
    expect(finishUpdates({}, ELEC, 1.3)).toBeNull();
  });
});

describe('issues', () => {
  const bankMap = buildBankMap([
    WARD, ELEC,
    item({ id: 'x', name: 'Plumbing and CP fittings', cat: 'Plumbing', unit: 'lot', specs: 'Imported via Excel' }),
    item({ id: 'lf', name: 'Light fittings', cat: 'Electrical', unit: 'lot', margin: 0, specs: 'At actual cost.' }),
  ]);

  it('reads the margin floor as a margin, and compares it with the markup', () => {
    expect(marginFloorFor('Carpentry', null)).toBe(15);
    expect(marginFloorFor('Carpentry', { default: 18, byCategory: { Carpentry: 20 } })).toBe(20);
    expect(marginFloorFor('Civil', { default: 18, byCategory: { Carpentry: 20 } })).toBe(18);
    expect(markupForMargin(15)).toBeCloseTo(17.647, 3);
    expect(markupForMargin(20)).toBe(25);
  });

  it('flags a line under the floor', () => {
    expect(lineIssues({ id: 'a', bankId: 'w', qty: 1, marginOverride: 15 }, { bankMap })).toEqual(['lowmk']);
    expect(lineIssues({ id: 'a', bankId: 'w', qty: 1, marginOverride: 17.65 }, { bankMap })).toEqual([]);
    expect(lineIssues({ id: 'a', bankId: 'w', qty: 1 }, { bankMap })).toEqual([]);
    expect(lineIssues({ id: 'a', bankId: 'w', qty: 1 }, { bankMap, floors: { byCategory: { Carpentry: 22 } } })).toEqual(['lowmk']);
  });

  it('does not ask for margin on lines the studio does not invoice', () => {
    expect(lineIssues({ id: 'a', bankId: 'lf', qty: 1, boqStatus: 'as_actuals' }, { bankMap })).toEqual([]);
    expect(lineIssues({ id: 'a', bankId: 'w', qty: 1, marginOverride: 0, boqStatus: 'client_procured' }, { bankMap })).toEqual([]);
  });

  it('flags lines without spec words', () => {
    expect(lineIssues({ id: 'a', bankId: 'x', qty: 1 }, { bankMap })).toEqual(['nospec']);
    expect(lineIssues({ id: 'a', bankId: 'w', qty: 1, specs: '  ' }, { bankMap })).toEqual(['nospec']);
    expect(lineIssues({ id: 'a', bankId: 'x', qty: 1, specs: 'CP fittings, Jaquar Florentine.' }, { bankMap })).toEqual([]);
  });

  it('flags pieces that overlap or run past a wall', () => {
    const draw = drawOf(WARD)!;
    const boq: BoqItem[] = [
      { id: 'a', bankId: 'w', qty: 42, roomId: 'Master Bedroom', place: newPlace(draw, 3.12, 1.12) },
      { id: 'b', bankId: 'w', qty: 42, roomId: 'Master Bedroom', place: newPlace(draw, 5, 1.12) },
      { id: 'c', bankId: 'w', qty: 42, roomId: 'Master Bedroom', place: newPlace(draw, 1.12, 9.5, 270) },
      { id: 'd', bankId: 'w', qty: 42, roomId: 'Master Bedroom', place: newPlace(draw, 9, 12.5) },
    ];
    const rooms = [{ name: 'Master Bedroom', plan: { x: 0, y: 0, w: 12, h: 13 } }];
    const ctx = { bankMap, pieces: boardPieces(boq, bankMap), rooms };
    expect(lineIssues(boq[0], ctx)).toEqual(['overlap']);
    expect(lineIssues(boq[1], ctx)).toEqual(['overlap']);
    expect(lineIssues(boq[2], ctx)).toEqual([]);
    expect(lineIssues(boq[3], ctx)).toEqual(['overlap']); // past the bottom wall
    expect(boqIssues(boq, ctx).map(x => x.line.id)).toEqual(['a', 'b', 'd']);
    expect(ISSUE_LABEL.overlap).toBe('Overlaps or runs past a wall');
  });
});
