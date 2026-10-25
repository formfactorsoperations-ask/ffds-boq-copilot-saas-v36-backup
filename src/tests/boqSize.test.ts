import { describe, it, expect } from 'vitest';
import {
  basisOfUnit, linearUnitOf, convertLength, parseSize, qtyFromSize, readSize,
  sizeUpdates, formatSize, qtyOverridden,
} from '../../lib/boqSize';

describe('basisOfUnit', () => {
  it('reads the units the bank actually uses', () => {
    expect(basisOfUnit('sq ft')).toBe('area');
    expect(basisOfUnit('Sq.Ft')).toBe('area');
    expect(basisOfUnit('sft')).toBe('area');
    expect(basisOfUnit('sqm')).toBe('area');
    expect(basisOfUnit('rft')).toBe('length');
    expect(basisOfUnit('Running ft')).toBe('length');
    expect(basisOfUnit('rmt')).toBe('length');
    expect(basisOfUnit('nos')).toBe('count');
    expect(basisOfUnit('Set')).toBe('count');
    expect(basisOfUnit('lumpsum')).toBe('lump');
    expect(basisOfUnit('LS')).toBe('lump');
    expect(basisOfUnit('')).toBeNull();
    expect(basisOfUnit('bag')).toBeNull();
  });

  it('counts metric units in metres', () => {
    expect(linearUnitOf('sqm')).toBe('m');
    expect(linearUnitOf('rmt')).toBe('m');
    expect(linearUnitOf('sq ft')).toBe('ft');
    expect(linearUnitOf('nos')).toBe('ft');
  });
});

describe('convertLength', () => {
  it('converts between the units a drawing uses', () => {
    expect(convertLength(12, 'in', 'ft')).toBeCloseTo(1);
    expect(convertLength(304.8, 'mm', 'ft')).toBeCloseTo(1);
    expect(convertLength(1, 'm', 'mm')).toBeCloseTo(1000);
    expect(convertLength(30.48, 'cm', 'ft')).toBeCloseTo(1);
  });
});

describe('qtyFromSize', () => {
  it('a 7 × 8 ft wardrobe is 56 sq ft', () => {
    const r = qtyFromSize({ a: 7, b: 8, unit: 'ft' }, 'sq ft');
    expect(r).toMatchObject({ ok: true, qty: 56, basis: 'area' });
  });

  it('millimetres off the drawing come out in sq ft', () => {
    // 2100 × 2400 mm = 6.89 × 7.87 ft = 54.25 sq ft
    const r = qtyFromSize({ a: 2100, b: 2400, unit: 'mm' }, 'sq ft');
    expect(r.ok && r.qty).toBeCloseTo(54.25, 2);
  });

  it('pieces multiply', () => {
    const r = qtyFromSize({ a: 2, b: 3, nos: 2, unit: 'ft' }, 'sq ft');
    expect(r.ok && r.qty).toBe(12);
  });

  it('a sqm item is counted in square metres', () => {
    const r = qtyFromSize({ a: 2000, b: 1500, unit: 'mm' }, 'sqm');
    expect(r.ok && r.qty).toBe(3);
  });

  it('a running item takes the length only', () => {
    const r = qtyFromSize({ a: 3000, b: 600, unit: 'mm' }, 'rft');
    expect(r.ok && r.qty).toBeCloseTo(9.84, 2);
  });

  it('a counted item takes the pieces, not the area', () => {
    expect(qtyFromSize({ a: 6, b: 6.5, nos: 2, unit: 'ft' }, 'nos')).toMatchObject({ ok: true, qty: 2 });
    expect(qtyFromSize({ a: 6, b: 6.5, unit: 'ft' }, 'nos')).toMatchObject({ ok: true, qty: 1 });
  });

  it('an area item needs both dimensions', () => {
    expect(qtyFromSize({ a: 7, unit: 'ft' }, 'sq ft')).toMatchObject({ ok: false });
  });

  it('a lump sum keeps its quantity', () => {
    expect(qtyFromSize({ a: 7, b: 8, unit: 'ft' }, 'lumpsum').ok).toBe(false);
  });

  it('an unknown unit falls back to area or length', () => {
    expect(qtyFromSize({ a: 2, b: 3, unit: 'ft' }, 'bag')).toMatchObject({ ok: true, qty: 6 });
    expect(qtyFromSize({ a: 4, unit: 'ft' }, 'bag')).toMatchObject({ ok: true, qty: 4 });
  });

  it('says how it got there', () => {
    const r = qtyFromSize({ a: 7, b: 8, nos: 2, unit: 'ft' }, 'sq ft');
    expect(r.ok && r.working).toBe('7 × 8 ft × 2 = 112 sq ft');
  });
});

describe('readSize', () => {
  it('older lines with no unit keep the quantity they had', () => {
    // An older line: L × W × M typed in feet for a sq ft item gave qty 24.
    const line = { calcLength: 4, calcWidth: 6, calcMultiplier: 1, qty: 24, unit: 'sq ft' };
    const size = readSize(line)!;
    expect(size.unit).toBe('ft');
    expect(qtyFromSize(size, line.unit)).toMatchObject({ ok: true, qty: 24 });
    expect(qtyOverridden(line)).toBe(false);
  });

  it('older metric lines read in metres', () => {
    const size = readSize({ calcLength: 2, calcWidth: 3, unit: 'sqm' })!;
    expect(size.unit).toBe('m');
    expect(qtyFromSize(size, 'sqm')).toMatchObject({ ok: true, qty: 6 });
  });

  it('a line with no size has none', () => {
    expect(readSize({ qty: 3 })).toBeNull();
    expect(readSize({ calcLength: 0, calcWidth: 0, calcMultiplier: 1 })).toBeNull();
  });
});

describe('sizeUpdates', () => {
  it('writes the size and the quantity together', () => {
    expect(sizeUpdates({ a: 7, b: 8, unit: 'ft' }, 'sq ft')).toEqual({
      calcLength: 7, calcWidth: 8, calcMultiplier: 1, sizeUnit: 'ft', qty: 56,
    });
  });

  it('leaves the quantity alone when the size cannot give one', () => {
    const u = sizeUpdates({ a: 7, unit: 'ft' }, 'sq ft');
    expect(u.qty).toBeUndefined();
    expect(u.calcLength).toBe(7);
  });

  it('knows when the quantity was typed over', () => {
    expect(qtyOverridden({ calcLength: 7, calcWidth: 8, sizeUnit: 'ft', qty: 60, unit: 'sq ft' })).toBe(true);
    expect(qtyOverridden({ calcLength: 7, calcWidth: 8, sizeUnit: 'ft', qty: 56, unit: 'sq ft' })).toBe(false);
  });
});

describe('parseSize', () => {
  it('reads the usual ways a size is written', () => {
    expect(parseSize('7 x 8')).toEqual({ a: 7, b: 8, nos: undefined, unit: 'ft' });
    expect(parseSize('7x8 ft')).toMatchObject({ a: 7, b: 8, unit: 'ft' });
    expect(parseSize('2100 × 2400 mm')).toMatchObject({ a: 2100, b: 2400, unit: 'mm' });
    expect(parseSize('2100*600', 'mm')).toMatchObject({ a: 2100, b: 600, unit: 'mm' });
    expect(parseSize('7 by 8')).toMatchObject({ a: 7, b: 8 });
    expect(parseSize('12 ft')).toMatchObject({ a: 12, b: undefined, unit: 'ft' });
  });

  it('reads feet and inches', () => {
    expect(parseSize(`7'6" x 8'`)).toMatchObject({ a: 7.5, b: 8, unit: 'ft' });
    expect(parseSize(`7' 6 x 8'`)).toMatchObject({ a: 7.5, b: 8, unit: 'ft' });
    expect(parseSize('7ft 6in x 8ft')).toMatchObject({ a: 7.5, b: 8, unit: 'ft' });
    // Feet-and-inches wins over a millimetre default.
    expect(parseSize(`7' x 8'`, 'mm')).toMatchObject({ a: 7, b: 8, unit: 'ft' });
  });

  it('reads pieces', () => {
    expect(parseSize('7 x 8 x 2')).toMatchObject({ a: 7, b: 8, nos: 2 });
    expect(parseSize('2x3 ft x 4 nos')).toMatchObject({ a: 2, b: 3, nos: 4, unit: 'ft' });
    expect(parseSize('600 x 600 mm (4 nos)')).toMatchObject({ a: 600, b: 600, nos: 4, unit: 'mm' });
  });

  it('converts mixed units to the first one named', () => {
    const s = parseSize('2.1m x 600mm')!;
    expect(s.unit).toBe('m');
    expect(s.a).toBeCloseTo(2.1);
    expect(s.b).toBeCloseTo(0.6);
  });

  it('uses the default unit for plain numbers', () => {
    expect(parseSize('2100 x 2400', 'mm')).toMatchObject({ unit: 'mm' });
  });

  it('refuses what it cannot read', () => {
    expect(parseSize('')).toBeNull();
    expect(parseSize('big')).toBeNull();
    expect(parseSize('7 x 8 x 9 x 10')).toBeNull();
    expect(parseSize('7 x 0')).toBeNull();
    expect(parseSize('7 bags x 8')).toBeNull();
  });

  it('round-trips through formatSize', () => {
    expect(formatSize(parseSize('7 x 8 x 2'))).toBe('7 × 8 ft × 2');
    expect(formatSize(parseSize('2100 × 2400 mm'))).toBe('2100 × 2400 mm');
    expect(formatSize(null)).toBe('');
  });

  it('a parsed size gives the right quantity end to end', () => {
    const r = qtyFromSize(parseSize(`7'6" x 8'`), 'sq ft');
    expect(r).toMatchObject({ ok: true, qty: 60 });
  });
});
