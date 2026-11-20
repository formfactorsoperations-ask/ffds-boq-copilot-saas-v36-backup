/* Brief & Site, read first (lib/briefRead): what is missing, and how the brief was read. */
import { describe, it, expect } from 'vitest';
import { briefGaps, briefCompleteness, clientPlanOf, readScope, roomsArea } from '../../lib/briefRead';

const whole: any = {
  name: 'Priya Rao · Powai', clientName: 'Priya Rao', clientPhone: '+91 98765 11111', clientEmail: 'p@example.com',
  location: 'Powai', area: 1100, config: '3-BHK', theme: 'modern', propertyStatus: 'semi_finished',
  clientBrief: 'New flooring in the living room. Redo the two bathrooms. No electrical work.',
  floorplanImageUrl: 'https://x/o/studios%2Ft%2Fplans%2F1.jpg?alt=media',
  rooms: [{ name: 'Living', size: 220 }, { name: 'Bedroom', size: 140 }, { name: 'Civil', size: 0 }],
  isDummy: false, projectCategory: 'actual',
};

describe('what the brief is missing', () => {
  it('puts the floor plan first, and calls it required', () => {
    const gaps = briefGaps({ ...whole, floorplanImageUrl: undefined, clientEmail: '' });
    expect(gaps[0]).toMatchObject({ key: 'plan', part: 'plan', required: true });
    expect(gaps.map(g => g.key)).toEqual(['plan', 'clientEmail']);
  });

  it('counts a complete brief as whole, and an empty one as nothing', () => {
    expect(briefGaps(whole)).toEqual([]);
    expect(briefCompleteness(whole)).toEqual({ done: 12, total: 12, pct: 100 });
    expect(briefCompleteness({}).done).toBe(0);
  });

  it('takes a plan uploaded under the BOQ when the brief had none', () => {
    const ctx: any = { planSheet: { source: 'upload', imageUrl: 'https://x/o/p.pdf?alt=media' } };
    expect(clientPlanOf(ctx)).toEqual({ url: 'https://x/o/p.pdf?alt=media', pdf: true, from: 'boq' });
    expect(clientPlanOf({ planSheet: { source: 'sketch' } } as any)).toBeNull();
  });
});

describe('how the brief was read', () => {
  it('gives each civil switch its reason: the brief’s words, else the site state', () => {
    const rows = readScope({ ...whole, civilScope: { flooring: true, bathrooms: true, kitchenCivil: false, rewiring: false, plumbing: false, falseCeiling: true, painting: true } });
    const by = (k: string) => rows.find(r => r.key === k)!;
    expect(by('flooring')).toMatchObject({ on: true, why: { kind: 'brief', quote: 'New flooring in the living room' } });
    expect(by('rewiring')).toMatchObject({ on: false, why: { kind: 'brief' } });
    expect(by('painting')).toMatchObject({ on: true, why: { kind: 'site' } });
  });

  it('flags a switch the brief contradicts', () => {
    const rows = readScope({ ...whole, civilScope: undefined });
    expect(rows.find(r => r.key === 'flooring')!.briefDisagrees).toBe('New flooring in the living room');
  });

  it('adds up the rooms, leaving out the flat-wide scopes', () => {
    expect(roomsArea(whole)).toEqual({ count: 2, sqft: 360, area: 1100 });
  });
});
