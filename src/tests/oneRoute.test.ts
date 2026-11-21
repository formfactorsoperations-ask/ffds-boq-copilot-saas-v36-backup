/*
  One route writes a BOQ: the studio's Standard templates.

  The setup wizard and Regenerate used them; the BOQ Playground's quick build
  kept a list of its own, so one 3-BHK got 33 lines from the wizard and 8 from
  the quick build. The quick build now asks the same generator.
*/
import { describe, it, expect } from 'vitest';
import { INITIAL_BANK } from '../../constants';
import { generateStandardPackages, INITIAL_TEMPLATES } from '../../lib/standardPackages';
import { templateLines } from '../../lib/playground/templateBuild';
import { quickBuild } from '../../lib/playground/quickBuild';
import { gradeOf } from '../../lib/lineSpecs';
import { drawOf } from '../../lib/playground/pieces';
import { buildBankMap } from '../../lib/boqPricing';
import type { Item } from '../../types';

const bank = INITIAL_BANK as Item[];
const bankMap = buildBankMap(bank, []);
const ids = () => { let n = 0; return () => `x${++n}`; };
const rooms = quickBuild({ size: '3-BHK', carpet: 1050, bank, newId: ids() }).rooms;
const ctx: any = { name: 'Dummy', type: 'TURNKEY', area: 1050, config: '3-BHK', rooms, ceilingHeight: 9.5 };
const key = (l: any) => `${l.bankId}@${l.roomId}:${l.qty}`;

describe('an option made from the Standard templates', () => {
  const tiers = generateStandardPackages(ctx, bank, INITIAL_TEMPLATES, 'tiered');

  it('saves its grade, so renaming it does not change its materials', () => {
    expect(tiers.map(t => t.specGrade)).toEqual(['E', 'C', 'P']);
    expect(gradeOf({ ...tiers[0], name: 'Budget Option' })).toBe('E');
    expect(gradeOf({ ...tiers[2], name: 'Signature' })).toBe('P');
  });

  it('a single option is Comfort', () => {
    expect(generateStandardPackages(ctx, bank, INITIAL_TEMPLATES, 'single').map(t => t.specGrade)).toEqual(['C']);
  });
});

describe('the quick build, filled from the Standard templates', () => {
  const wizard = generateStandardPackages(ctx, bank, INITIAL_TEMPLATES, 'tiered');

  it('gives the lines the setup wizard gives, at each grade', () => {
    (['E', 'C', 'P'] as const).forEach((g, i) => {
      const quick = templateLines({ ctx, rooms, bank, templates: INITIAL_TEMPLATES, grade: g, newId: ids() })!;
      expect(quick.lines.map(key).sort()).toEqual(wizard[i].boq.map(key).sort());
    });
  });

  it('puts every piece on the plan or under Needs a place', () => {
    const quick = templateLines({ ctx, rooms, bank, templates: INITIAL_TEMPLATES, grade: 'C', newId: ids() })!;
    const pieces = quick.lines.filter(l => drawOf(bankMap.get(l.bankId)));
    expect(pieces.length).toBeGreaterThan(8);
    expect(quick.placed + quick.waiting.length).toBe(pieces.length);
    expect(quick.placed).toBe(pieces.filter(l => l.place).length);
  });

  it('does not give a room an item it already has', () => {
    const first = templateLines({ ctx, rooms, bank, templates: INITIAL_TEMPLATES, grade: 'C', newId: ids() })!;
    expect(templateLines({ ctx, rooms, bank, templates: INITIAL_TEMPLATES, grade: 'C', boq: first.lines, newId: ids() })).toBeNull();
    const without = first.lines.filter(l => !/wardr?obe/i.test(bankMap.get(l.bankId)?.name || ''));
    const again = templateLines({ ctx, rooms, bank, templates: INITIAL_TEMPLATES, grade: 'C', boq: without, newId: ids() })!;
    expect(again.lines).toHaveLength(3);
    expect(again.lines.every(l => /wardr?obe/i.test(bankMap.get(l.bankId)?.name || ''))).toBe(true);
  });

  it('gives nothing when the templates name no item in the Item Bank, so the caller can fall back', () => {
    const other = [{ id: 'wardrobe', name: 'Sliding wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1000, labor: 400, margin: 20 }] as Item[];
    expect(templateLines({ ctx, rooms, bank: other, templates: INITIAL_TEMPLATES, grade: 'C', newId: ids() })).toBeNull();
    expect(templateLines({ ctx, rooms, bank, templates: null, grade: 'C', newId: ids() })).toBeNull();
  });
});
