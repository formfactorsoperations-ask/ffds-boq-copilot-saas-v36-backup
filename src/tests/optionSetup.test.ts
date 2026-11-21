/*
  Option setup: what separates the three options, as figures the owner sets.

  The generator had them written in: materials 0.88 / 1.00 / 1.35, margin
  0.85 / 1.00 / 1.25, false ceiling 35% / 60% / 85%. They are now saved with the
  Standard templates; the standard figures give exactly what was given before.
*/
import { describe, it, expect } from 'vitest';
import { INITIAL_BANK } from '../../constants';
import { generateStandardPackages, INITIAL_TEMPLATES, resolveActiveTemplate } from '../../lib/standardPackages';
import { SETUP_KEY, STANDARD_SETUP, optionSetupOf, withOptionSetup, typologiesOf, isStandardSetup, cleanSetup } from '../../lib/optionSetup';
import { quickBuild } from '../../lib/playground/quickBuild';
import type { Item } from '../../types';

const bank = INITIAL_BANK as Item[];
let n = 0;
const rooms = quickBuild({ size: '3-BHK', carpet: 1050, bank, newId: () => `r${++n}` }).rooms;
const ctx: any = { name: 'Dummy', type: 'TURNKEY', area: 1050, config: '3-BHK', rooms, ceilingHeight: 9.5 };
const gen = (templates: any) => generateStandardPackages(ctx, bank, templates, 'tiered');
const shape = (tiers: any[]) => tiers.map(t => t.boq.map((l: any) => `${l.bankId}@${l.roomId}:${l.qty}:${l.baseRate}:${l.marginOverride}`).sort());
const line = (t: any, name: RegExp) => t.boq.find((l: any) => name.test(bank.find(i => i.id === l.bankId)?.name || ''));

describe('the setup a studio starts from', () => {
  it('is the figures the generator had, and saves nothing', () => {
    expect(optionSetupOf(INITIAL_TEMPLATES)).toEqual(STANDARD_SETUP);
    expect(isStandardSetup(optionSetupOf(INITIAL_TEMPLATES))).toBe(true);
    expect(SETUP_KEY in withOptionSetup(INITIAL_TEMPLATES, STANDARD_SETUP)).toBe(false);
  });

  it('gives every option exactly what it got before', () => {
    const explicit = withOptionSetup(INITIAL_TEMPLATES, cleanSetup({ P: { material: 1.35 } }));
    expect(shape(gen(explicit))).toEqual(shape(gen(INITIAL_TEMPLATES)));
  });
});

describe('a studio’s own setup', () => {
  const own = withOptionSetup(INITIAL_TEMPLATES, cleanSetup({ E: { material: 0.8, ceiling: 0 }, P: { material: 1.5, margin: 1, ceiling: 1 } }));

  it('is saved beside the typologies and read back', () => {
    expect(own[SETUP_KEY].P).toEqual(['material=1.5', 'margin=1', 'ceiling=1']);
    expect(optionSetupOf(own).E).toEqual({ material: 0.8, margin: 0.85, ceiling: 0 });
    expect(optionSetupOf(own).P).toEqual({ material: 1.5, margin: 1, ceiling: 1 });
  });

  it('is never read as a typology', () => {
    expect(Object.keys(typologiesOf(own))).toEqual(Object.keys(INITIAL_TEMPLATES));
    expect(resolveActiveTemplate(own, 'setup').configKey).not.toBe(SETUP_KEY);
    expect(resolveActiveTemplate(own, '').configKey).not.toBe(SETUP_KEY);
    const only = { [SETUP_KEY]: own[SETUP_KEY] } as any;
    expect(resolveActiveTemplate(only, '3-BHK').configKey).not.toBe(SETUP_KEY);
  });

  it('moves the materials rate of Essential and Harmony, and leaves Comfort at the Item Bank’s', () => {
    const [e, c, p] = gen(own);
    const item = bank.find(i => /WARDOBE WITH LOFT$/.test(i.name))!;
    expect(line(e, /WARDOBE WITH LOFT$/).baseRate).toBeCloseTo(item.materials * 0.8, 2);
    expect(line(c, /WARDOBE WITH LOFT$/).baseRate).toBe(item.materials);
    expect(line(p, /WARDOBE WITH LOFT$/).baseRate).toBeCloseTo(item.materials * 1.5, 2);
  });

  it('holds the same margin in Harmony as in Comfort when its margin is 100%', () => {
    const [, c, p] = gen(own);
    expect(line(p, /WARDOBE WITH LOFT$/).marginOverride).toBe(line(c, /WARDOBE WITH LOFT$/).marginOverride);
  });

  it('sets how far the false ceiling goes: none in Essential, all of it in Harmony', () => {
    const [e, c, p] = gen(own);
    const std = gen(INITIAL_TEMPLATES);
    expect(line(e, /FALSE CEILING/)).toBeUndefined();
    expect(line(c, /FALSE CEILING/).qty).toBe(line(std[1], /FALSE CEILING/).qty);
    expect(line(p, /FALSE CEILING/).qty).toBeCloseTo(line(std[2], /FALSE CEILING/).qty / 0.85, 0);
  });
});

describe('figures out of range', () => {
  it('are kept within their limits, and Comfort stays the baseline', () => {
    const s = cleanSetup({ E: { material: 0.1, ceiling: -1 }, C: { material: 2, margin: 3, ceiling: 0.5 }, P: { material: 9, margin: 9, ceiling: 4 } });
    expect(s.E).toMatchObject({ material: 0.5, ceiling: 0 });
    expect(s.C).toEqual({ material: 1, margin: 1, ceiling: 0.5 });
    expect(s.P).toEqual({ material: 2.5, margin: 2, ceiling: 1 });
  });

  it('a damaged saved entry falls back to the standard figure', () => {
    const t = { ...INITIAL_TEMPLATES, [SETUP_KEY]: { E: ['material=abc', 'margin=0.9'], P: [] as string[] } } as any;
    expect(optionSetupOf(t).E).toEqual({ material: 0.88, margin: 0.9, ceiling: 0.35 });
    expect(optionSetupOf(t).P).toEqual(STANDARD_SETUP.P);
  });
});
