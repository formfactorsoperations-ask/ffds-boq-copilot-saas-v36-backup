/*
  Sample options: the three options for a typical home, for a first meeting,
  priced by the generator a new project uses, as ranges a client can read.
*/
import { describe, it, expect } from 'vitest';
import { INITIAL_BANK } from '../../constants';
import { INITIAL_TEMPLATES, generateStandardPackages } from '../../lib/standardPackages';
import { withOptionSetup, cleanSetup } from '../../lib/optionSetup';
import {
  sampleOptions, sampleSizesOf, defaultSampleSize, typicalCarpetOf, usualAreasOf, bandOf, inLakhs, rangeText, itemLabel,
} from '../../lib/sampleOptions';
import { mayOpenStudioTab, STUDIO_TABS, limitedMayOpen } from '../../lib/roleAccess';
import type { Item } from '../../types';

const bank = INITIAL_BANK as Item[];
const book = sampleOptions({ size: '2-BHK', carpet: 850, bank, templates: INITIAL_TEMPLATES })!;

describe('the sizes on offer', () => {
  it('are the studio’s BHK typologies, smallest first, opening at 2-BHK', () => {
    expect(sampleSizesOf(INITIAL_TEMPLATES)).toEqual(['1-BHK', '2-BHK', '3-BHK']);
    expect(defaultSampleSize(sampleSizesOf(INITIAL_TEMPLATES))).toBe('2-BHK');
    expect(sampleSizesOf({ '3-BHK': {}, 'Bathroom-Remodel': {}, __setup: {} } as any)).toEqual(['3-BHK']);
    expect(defaultSampleSize(['3-BHK'])).toBe('3-BHK');
    expect(defaultSampleSize([])).toBeNull();
  });

  it('open at a usual carpet area, with three to pick from', () => {
    expect(typicalCarpetOf('2-BHK')).toBe(850);
    expect(usualAreasOf('2-BHK')).toEqual([700, 850, 1000]);
    expect(bandOf(850)).toEqual([765, 935]);
  });
});

describe('a sample 2-BHK', () => {
  it('has the three options, in price order, each a range around its own figure', () => {
    expect(book.options.map(o => o.grade)).toEqual(['E', 'C', 'P']);
    book.options.forEach(o => {
      expect(o.low).toBeLessThanOrEqual(o.mid);
      expect(o.mid).toBeLessThanOrEqual(o.high);
      expect(o.low).toBeLessThan(o.high);
      [o.low, o.mid, o.high].forEach(v => expect(v % 10000).toBe(0));
      expect(o.perSqft % 50).toBe(0);
    });
    const mids = book.options.map(o => o.mid);
    expect(mids[0]).toBeLessThan(mids[1]);
    expect(mids[1]).toBeLessThan(mids[2]);
  });

  it('is priced by the same generator, and the room amounts add up to it', () => {
    const tiers = generateStandardPackages({ name: 'x', type: 'TURNKEY', area: 850, ceilingHeight: 9.5, config: '2-BHK', rooms: [] } as any, bank, INITIAL_TEMPLATES, 'tiered');
    book.options.forEach((o, i) => {
      expect(Math.abs(o.mid - tiers[i].summary.totalSell)).toBeLessThanOrEqual(5000);
      const rooms = book.rooms.reduce((s, r) => s + (r.amounts[o.grade] || 0), 0);
      expect(Math.abs(rooms - o.mid)).toBeLessThanOrEqual(5000 * book.rooms.length);
    });
  });

  it('says what each option adds to the one before it', () => {
    expect(book.options[0].adds).toEqual([]);
    expect(book.options[1].adds).toContain('Dressing mirror');
    expect(book.options[2].adds).toEqual(expect.arrayContaining(['Wall panelling', 'Wallpaper', 'Curtains & blinds']));
    expect(book.options[0].finish).toMatch(/laminate/);
  });

  it('lists the rooms first and the work across the home after them, in the client’s words', () => {
    const labels = book.rooms.map(r => r.label);
    expect(labels.slice(0, 6)).toEqual(['Living & Dining', 'Master Bedroom', 'Guest Bedroom', 'Kitchen', 'Master Bathroom', 'Common Bathroom']);
    expect(labels).toContain('Across the home');
    expect(labels).not.toContain('Functional');
    expect(book.rooms[0].area).toBeGreaterThan(0);
    const bedroom = book.rooms.find(r => r.label === 'Master Bedroom')!;
    expect(bedroom.lines.find(l => l.name === 'Dressing mirror')?.in).toEqual(['C', 'P']);
    expect(bedroom.lines[0].in).toEqual(['E', 'C', 'P']);
  });

  it('never carries a cost or a margin', () => {
    const keys = JSON.stringify(book);
    expect(keys).not.toMatch(/cost|margin|gm/i);
  });

  it('follows the owner’s Option setup', () => {
    const richer = sampleOptions({ size: '2-BHK', carpet: 850, bank, templates: withOptionSetup(INITIAL_TEMPLATES, cleanSetup({ P: { material: 2 } })) })!;
    expect(richer.options[2].mid).toBeGreaterThan(book.options[2].mid);
    expect(richer.options[0].mid).toBe(book.options[0].mid);
  });

  it('is null when nothing can be priced', () => {
    expect(sampleOptions({ size: '2-BHK', carpet: 850, bank: [], templates: INITIAL_TEMPLATES })).toBeNull();
  });
});

describe('money as the client reads it', () => {
  it('is in lakhs and crores', () => {
    expect(inLakhs(740000)).toBe('₹7.4 L');
    expect(inLakhs(700000)).toBe('₹7 L');
    expect(inLakhs(12500000)).toBe('₹1.25 Cr');
    expect(inLakhs(85400)).toBe('₹85,000');
    expect(rangeText(680000, 760000)).toBe('₹6.8 – 7.6 L');
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
