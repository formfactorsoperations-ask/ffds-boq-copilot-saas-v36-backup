/*
  The standard size: a piece starts every BOQ at the Item Bank's size, and its
  quantity is that size.

  A generated wardrobe used to read "6′ × 2′ = 81 sq ft": the plan drew it at a
  size guessed from its name (and "Wardobe with loft" was guessed to be a loft),
  while the quantity came from a formula on the room's area, so one flat's three
  wardrobes were 81, 63 and 45 sq ft.
*/
import { describe, it, expect } from 'vitest';
import { INITIAL_BANK } from '../../constants';
import { generateStandardPackages, INITIAL_TEMPLATES } from '../../lib/standardPackages';
import { drawOf, pieceSize, standardSizeOf, withStandardSize, canHaveSize } from '../../lib/playground/pieces';
import { asNewPlaygroundOption } from '../../lib/playground/versions';
import { quickBuild } from '../../lib/playground/quickBuild';
import { buildBankMap } from '../../lib/boqPricing';
import { basisOfUnit } from '../../lib/boqSize';
import type { Item } from '../../types';

const item = (name: string, unit = 'sq ft', extra: Partial<Item> = {}): Item =>
  ({ id: name, name, cat: 'Carpentry', unit, specs: '', materials: 1000, labor: 300, margin: 15, ...extra } as Item);

describe('the size an item is drawn at', () => {
  it('reads a wardrobe with a loft as a wardrobe, however the bank spells it', () => {
    expect(drawOf(item('WARDOBE WITH LOFT'))).toMatchObject({ kind: 'wardrobe', w: 6, h: 7 });
    expect(drawOf(item('Wardrobe with loft'))).toMatchObject({ kind: 'wardrobe', w: 6, h: 7 });
    expect(drawOf(item('LOFT CABINETS MODULAR'))).toMatchObject({ kind: 'loft' });
  });

  it('uses the size the owner typed over the one its name suggests', () => {
    const typed = withStandardSize(item('WARDOBE WITH LOFT'), { w: 7, h: 8, d: 2 });
    expect(typed.draw).toMatchObject({ kind: 'wardrobe', w: 7, h: 8, d: 2, mount: 'wall' });
    expect(standardSizeOf(typed)).toMatchObject({ qty: 56, calcLength: 7, calcWidth: 8, sizeUnit: 'ft' });
  });

  it('gives an item its name does not describe a size, once the owner sets one', () => {
    const headboard = item('HEADBOARD');
    expect(drawOf(headboard)).toBeNull();
    expect(standardSizeOf(headboard)).toBeNull();
    expect(standardSizeOf(withStandardSize(headboard, { w: 6, h: 4, d: 0.33, kind: 'panel' }))).toMatchObject({ qty: 24 });
  });

  it('has no standard size for what is counted or a lump sum', () => {
    expect(standardSizeOf(item('Queen bed', 'nos'))).toBeNull();
    expect(standardSizeOf(item('Sofa', 'lumpsum'))).toBeNull();
  });

  it('sizes a running item by its width alone', () => {
    expect(standardSizeOf(item('Kitchen base unit', 'rft'))).toMatchObject({ qty: 6 });
  });
});

describe('a generated BOQ', () => {
  const bank = INITIAL_BANK as Item[];
  const bankMap = buildBankMap(bank, []);
  let n = 0;
  const rooms = quickBuild({ size: '3-BHK', carpet: 1050, bank, newId: () => `q${++n}` }).rooms;
  const ctx: any = { name: 'Dummy', type: 'TURNKEY', area: 1050, config: '3-BHK', rooms, ceilingHeight: 9.5 };
  const tiers = generateStandardPackages(ctx, bank, INITIAL_TEMPLATES, 'tiered').map(t => asNewPlaygroundOption(t, bankMap, rooms));
  const isWardrobe = (id: string) => /wardr?obe/i.test(bankMap.get(id)?.name || '');

  it('starts every wardrobe at the same size, whatever the bedroom', () => {
    tiers.forEach(t => {
      const wardrobes = t.boq.filter(l => isWardrobe(l.bankId));
      expect(wardrobes).toHaveLength(3);
      expect(new Set(wardrobes.map(l => l.qty))).toEqual(new Set([42]));
    });
  });

  it('gives every drawn, measured line the quantity its size makes', () => {
    tiers.forEach(t => t.boq.forEach(l => {
      const it0 = bankMap.get(l.bankId);
      const draw = drawOf(it0);
      const basis = basisOfUnit(it0?.unit);
      if (!draw || (basis !== 'area' && basis !== 'length')) return;
      const s = pieceSize(l, it0, draw);
      const fromSize = basis === 'area' ? s.w * s.h : s.w;
      expect(l.qty, `${it0?.name} in ${l.roomId}`).toBeCloseTo(fromSize, 1);
    }));
  });

  it('gives two flats of different sizes the same pieces', () => {
    let m = 0;
    const big = quickBuild({ size: '3-BHK', carpet: 1600, bank, newId: () => `b${++m}` }).rooms;
    const other = generateStandardPackages({ ...ctx, area: 1600, rooms: big }, bank, INITIAL_TEMPLATES, 'tiered');
    const pieces = (boq: any[]) => boq.filter(l => standardSizeOf(bankMap.get(l.bankId))).map(l => `${l.bankId}:${l.qty}`).sort();
    expect(pieces(other[1].boq)).toEqual(pieces(tiers[1].boq));
  });

  it('still measures painting from the flat', () => {
    const paint = (t: any) => t.boq.find((l: any) => /INTERIOR PAINTING/i.test(bankMap.get(l.bankId)?.name || ''))?.qty;
    let m = 0;
    const big = quickBuild({ size: '3-BHK', carpet: 1600, bank, newId: () => `c${++m}` }).rooms;
    const other = generateStandardPackages({ ...ctx, area: 1600, rooms: big }, bank, INITIAL_TEMPLATES, 'tiered');
    expect(paint(other[1])).toBeGreaterThan(paint(tiers[1]));
  });
});

describe('names the studio’s bank uses', () => {
  it('reads "T.V. unit" as a TV unit', () => {
    expect(drawOf(item('T.V. UNIT(DRAWER)'))).toMatchObject({ kind: 'tv' });
    expect(drawOf(item('TV unit'))).toMatchObject({ kind: 'tv' });
  });

  it('asks no size of pipework, ducting or an HVAC line', () => {
    expect(canHaveSize(item('AC COPPER PIPING', 'rft', { cat: 'HVAC' }))).toBe(false);
    expect(canHaveSize(item('Copper piping', 'rft', { cat: 'Functional' }))).toBe(false);
    expect(canHaveSize(item('HEADBOARD'))).toBe(true);
  });
});
