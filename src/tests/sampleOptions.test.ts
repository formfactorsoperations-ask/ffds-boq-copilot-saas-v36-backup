/*
  Sample options: the three options for a typical home, for a first meeting.
  Each a range from the owner's rates per sq ft; what each includes from the
  studio's Standard templates.
*/
import { describe, it, expect } from 'vitest';
import { INITIAL_BANK } from '../../constants';
import { INITIAL_TEMPLATES } from '../../lib/standardPackages';
import {
  sampleOptions, sampleRatesOf, DEFAULT_SAMPLE_RATES, typologyFor, typicalCarpetOf, usualAreasOf, inLakhs, rangeText, itemLabel,
} from '../../lib/sampleOptions';
import { mayOpenStudioTab, STUDIO_TABS, limitedMayOpen } from '../../lib/roleAccess';
import type { Item } from '../../types';

const bank = INITIAL_BANK as Item[];
const book = sampleOptions({ size: '2-BHK', carpet: 850, bank, templates: INITIAL_TEMPLATES });

describe('the rates', () => {
  it('open at the owner’s figures', () => {
    expect(DEFAULT_SAMPLE_RATES).toEqual({ E: [1600, 1800], C: [2200, 2400], P: [2600, 2800] });
    expect(sampleRatesOf(undefined)).toEqual(DEFAULT_SAMPLE_RATES);
  });

  it('take the studio’s own, low first, and the owner’s for anything not a number', () => {
    expect(sampleRatesOf({ E: [1900, 1700], C: ['x', 2], P: [3000, 3400] })).toEqual({ E: [1700, 1900], C: [2200, 2400], P: [3000, 3400] });
    expect(sampleRatesOf({ E: [5, 999999] }).E).toEqual([100, 50000]);
  });
});

describe('a sample 2-BHK of 850 sq ft', () => {
  it('is the carpet area times each option’s rates, to ₹10,000', () => {
    expect(book.options.map(o => [o.grade, o.low, o.high])).toEqual([
      ['E', 1360000, 1530000],
      ['C', 1870000, 2040000],
      ['P', 2210000, 2380000],
    ]);
    expect(rangeText(book.options[1].low, book.options[1].high)).toBe('₹18.7 – 20.4 L');
  });

  it('follows the studio’s saved rates and the area', () => {
    const own = sampleOptions({ size: '2-BHK', carpet: 1000, rates: { ...DEFAULT_SAMPLE_RATES, P: [3000, 3500] } });
    expect(own.options[2]).toMatchObject({ low: 3000000, high: 3500000, rate: [3000, 3500] });
    expect(own.options[0]).toMatchObject({ low: 1600000, high: 1800000 });
  });

  it('says what each option adds to the one before it, from the template', () => {
    expect(book.options[0].adds).toEqual([]);
    expect(book.options[1].adds).toContain('Dressing mirror');
    expect(book.options[2].adds).toEqual(expect.arrayContaining(['Wall panelling', 'Wallpaper', 'Curtains & blinds']));
    expect(book.options[1].finish).toMatch(/laminate/);
  });

  it('lists what each option includes, rooms first, in the client’s words', () => {
    const labels = book.rooms.map(r => r.label);
    expect(labels.slice(0, 6)).toEqual(['Living & Dining', 'Master Bedroom', 'Guest Bedroom', 'Kitchen', 'Master Bathroom', 'Common Bathroom']);
    expect(labels).toContain('Across the home');
    expect(labels).not.toContain('Functional');
    const bedroom = book.rooms.find(r => r.label === 'Master Bedroom')!;
    expect(bedroom.lines.find(l => l.name === 'Dressing mirror')?.in).toEqual(['C', 'P']);
    expect(bedroom.lines[0].in).toEqual(['E', 'C', 'P']);
  });

  it('never carries a cost or a margin, nor an amount per room', () => {
    expect(JSON.stringify(book)).not.toMatch(/cost|margin|amount/i);
  });
});

describe('without a template for the size', () => {
  it('still gives the ranges, with nothing listed', () => {
    expect(typologyFor('4-BHK', INITIAL_TEMPLATES)).toBeNull();
    expect(typologyFor('2-BHK', { '2 bhk': {} } as any)).toBe('2 bhk');
    const four = sampleOptions({ size: '4-BHK', carpet: 1800, bank, templates: INITIAL_TEMPLATES });
    expect(four.rooms).toEqual([]);
    expect(four.options.map(o => o.name)).toEqual(['Essential Elegance', 'Comfort Upgrade', 'Complete Harmony']);
    expect(four.options[0]).toMatchObject({ low: 2880000, high: 3240000, finish: '' });
    expect(sampleOptions({ size: '2-BHK', carpet: 850 }).options[0].low).toBe(1360000);
  });
});

describe('the home', () => {
  it('opens at a usual carpet area, with three to pick from', () => {
    expect(typicalCarpetOf('2-BHK')).toBe(850);
    expect(usualAreasOf('2-BHK')).toEqual([700, 850, 1000]);
  });
});

describe('money as the client reads it', () => {
  it('is in lakhs and crores', () => {
    expect(inLakhs(740000)).toBe('₹7.4 L');
    expect(inLakhs(700000)).toBe('₹7 L');
    expect(inLakhs(12500000)).toBe('₹1.25 Cr');
    expect(inLakhs(85400)).toBe('₹85,000');
    expect(rangeText(90000, 120000)).toBe('₹90,000 – ₹1.2 L');
  });

  it('names items in sentence case when the bank keeps them in capitals', () => {
    expect(itemLabel('WARDROBE WITH LOFT')).toBe('Wardrobe with loft');
    expect(itemLabel('TV unit')).toBe('TV unit');
  });
});

describe('who opens it', () => {
  it('is a studio screen for the leads and the Design Head, and not for the limited roles', () => {
    expect(STUDIO_TABS.has('sample-options')).toBe(true);
    expect(mayOpenStudioTab('sample-options', 'Owner')).toBe(true);
    expect(mayOpenStudioTab('sample-options', 'Design Head')).toBe(true);
    expect(mayOpenStudioTab('sample-options', 'Site Supervisor')).toBe(false);
    expect(limitedMayOpen('Designer', 'sample-options')).toBe(false);
    expect(limitedMayOpen('Client Relations', 'sample-options')).toBe(false);
  });
});
