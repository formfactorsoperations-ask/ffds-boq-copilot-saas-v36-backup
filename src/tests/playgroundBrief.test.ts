import { describe, it, expect } from 'vitest';
import {
  proposalTimeline, addWorkingDays, siteDaysByConfig, civilDaysOf, answersTo, briefHome, othersDecide, roomIncludes, DEFAULT_CIVIL_DAYS,
} from '../../lib/playground/brief';
import { annexOf } from '../../lib/playground/proposal';

const I = (id: string, name: string, cat: string, unit: string): any => ({ id, name, cat, unit, materials: 1000, labor: 200, margin: 25, specs: '' });
const bank: any[] = [
  I('w', 'Sliding wardrobe', 'Carpentry', 'sq ft'), I('loft', 'Loft storage', 'Carpentry', 'sq ft'), I('base', 'Base units', 'Modular kitchen', 'r ft'),
  I('bunk', 'Bunk bed with storage', 'Carpentry', 'nos'), I('wp', 'Waterproofing, floor and upstand', 'Civil', 'sq ft'), I('tile', 'Floor tiles, laid', 'Flooring', 'sq ft'),
];
const bankMap = new Map(bank.map(b => [b.id, b]));
const rooms: any[] = [
  { name: 'Master Bedroom', size: 156, unit: 'sq ft', plan: { x: 0, y: 0, w: 12, h: 13 } },
  { name: 'Kids Room', size: 91, unit: 'sq ft', plan: { x: 12, y: 0, w: 7, h: 13 } },
  { name: 'Kitchen', size: 72, unit: 'sq ft', plan: { x: 19, y: 0, w: 9, h: 8 } },
  { name: 'Master Bathroom', size: 28, unit: 'sq ft', plan: { x: 19, y: 8, w: 4, h: 7 } },
  { name: 'Living', size: 182, unit: 'sq ft', plan: { x: 0, y: 13, w: 13, h: 14 } },
];
const boq: any[] = [
  { id: 'a', bankId: 'w', qty: 42, roomId: 'Master Bedroom' },
  { id: 'b', bankId: 'loft', qty: 18, roomId: 'Kids Room' },
  { id: 'c', bankId: 'bunk', qty: 1, roomId: 'Kids Room' },
  { id: 'd', bankId: 'base', qty: 8, roomId: 'Kitchen' },
  { id: 'e', bankId: 'wp', qty: 40, roomId: 'Master Bathroom', civil: { type: 'waterproof' } },
  { id: 'f', bankId: 'tile', qty: 182, roomId: 'Living', civil: { type: 'floor' } },
];

describe('the timeline to handover', () => {
  it('counts working days, Sundays off', () => {
    // Fri 20 Nov 2026 + 2 working days: Sat 21, (Sun 22 off), Mon 23.
    expect(addWorkingDays(new Date(2026, 10, 20), 2).getDate()).toBe(23);
  });

  it('without a Timeline: the booklet’s days by configuration, plus the studio’s civil days', () => {
    expect(siteDaysByConfig('3-BHK')).toBe(75);
    expect(siteDaysByConfig('2 BHK')).toBe(60);
    expect(civilDaysOf(null)).toBe(DEFAULT_CIVIL_DAYS);
    expect(civilDaysOf({ civilWorkingDays: 9 } as any)).toBe(9);
    const t = proposalTimeline({ start: new Date(2026, 11, 3), config: '3-BHK', civil: true, civilDays: 12, target: '2027-04-15' });
    expect(t.rows.map(r => [r.name, r.days])).toEqual([['Site measurement', 6], ['Layout and design', 14], ['Detailed BOQ and agreement', 6], ['Civil first, then interiors', 87]]);
    expect(t.total).toBe(113);
    expect(t.fromTimeline).toBe(false);
    expect(t.rows[1].start).toEqual(t.rows[0].end);
    expect(t.handover).toEqual(t.rows[3].end);
    expect(t.weeksLate).toBe(Math.round((t.handover.getTime() - new Date('2027-04-15').getTime()) / (7 * 864e5)));
  });

  it('with the project Timeline: its design and site days, civil work already in them', () => {
    const t = proposalTimeline({ start: new Date(2026, 11, 3), programme: { designWorkDays: 20, siteWorkDays: 70 }, config: '3-BHK', civil: true, civilDays: 12 });
    expect(t.rows.map(r => r.days)).toEqual([6, 20, 6, 70]);
    expect(t.fromTimeline).toBe(true);
    expect(t.target).toBeNull();
    expect(t.weeksLate).toBeNull();
  });

  it('clause 8 states the same days', () => {
    const a = annexOf({ terms: null, studioName: 'S', gstRate: 18, after: 1, fee: 1, gst: 1, total: 3, initiationFee: 0, boq, bankMap, validDays: 15, issued: new Date(), programme: { siteDays: 87, designDays: 14, civilDays: 12 } });
    expect(a.find(s => s.n === 8)!.text).toMatch(/^The site programme is 87 working days, including 12 for civil work\. Design runs for about 14 working days/);
  });
});

describe('how the proposal answers the brief', () => {
  it('only what the brief speaks of, in its order, answered from the BOQ', () => {
    const a = answersTo('We want lots of closed storage. The kids’ room should grow with them. Both bathrooms are original, and one leaks.', boq, bankMap, rooms);
    expect(a.map(x => x.topic)).toEqual(['Closed storage', 'A kids’ room that grows', 'The bathrooms']);
    expect(a[0].text).toBe('2 storage units with about 60 sq ft of shutters, plus 8 ft of kitchen cabinets.');
    expect(a[1].text).toBe('Loft storage, Bunk bed with storage.');
    expect(a[2].text).toMatch(/^Rebuilt: waterproofing/);
    expect(answersTo('New floors in the living room please', boq, bankMap, rooms)[0]).toEqual({ topic: 'The floors', text: 'New flooring in Living.' });
    expect(answersTo('', boq, bankMap, rooms)).toEqual([]);
    expect(answersTo('The bathrooms need work', boq.filter(l => !l.civil), bankMap, rooms)[0].text).toMatch(/^Fittings only/);
  });
});

describe('the home, the style, what design includes', () => {
  it('from the project: its size, its state, the civil scope, the style and the design deliverables', () => {
    const h = briefHome({ name: 'P', config: '3BHK', area: 936.63, ceilingHeight: 10, propertyStatus: 'finished', rooms, theme: 'Modern',
      designScope: { has3DRenders: true, has2DDrawings: true, hasFurnitureSelection: true, hasSiteVisits: true, visitCount: 6, hasVrWalkthrough: false } } as any);
    expect(h.line).toBe('3BHK · 936.63 sq ft · 10 ft ceilings');
    expect(h.status).toMatch(/renovation/);
    expect(h.scope.map(s => s.label)).toEqual(['Bathrooms', 'Flooring', 'Kitchen civil', 'Rewiring', 'Plumbing', 'False ceiling', 'Painting']);
    expect(h.style).toBe('Modern');
    expect(h.deliver.map(d => [d.label, d.on])).toEqual([['3D views of every room', true], ['2D working drawings', true], ['Furniture and décor selection', true], ['6 site visits during the work', true], ['VR walkthrough', false]]);
    expect(briefHome({ name: 'P', rooms: [] } as any).deliver).toEqual([]);
  });

  it('the one-page summary only when others decide too', () => {
    expect(othersDecide('None')).toBe(false);
    expect(othersDecide(undefined)).toBe(false);
    expect(othersDecide('Spouse')).toBe(true);
    expect(roomIncludes(boq, bankMap, 'Kids Room')).toBe('Loft storage, Bunk bed with storage');
    expect(roomIncludes(boq, bankMap, 'Store')).toBe('Painting, ceiling and electrical');
  });
});
