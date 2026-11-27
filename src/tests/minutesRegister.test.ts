import { describe, it, expect } from 'vitest';
import { pileOf, registerRow, buildRegister, registerCounts, meetingMs } from '../../lib/minutesRegister';

const at = (iso: string) => new Date(`${iso}T11:00:00+05:30`).getTime();
const mom = (over: any) => ({
  id: over.id, momRef: over.momRef || over.id, meetingTitle: 'Design review', meetingType: 'design_review',
  meetingDate: at('2026-11-06'), format: 2, status: 'draft', decisions: [], actionItems: [], attendees: [], ...over,
});

describe('minutes register', () => {
  it('puts each minutes in the pile it stands in', () => {
    expect(pileOf({ status: 'draft' })).toBe('draft');
    expect(pileOf({ status: 'pending_review' })).toBe('studio');
    expect(pileOf({ status: 'finalised', meetingType: 'design_review' })).toBe('studio');
    expect(pileOf({ status: 'finalised', meetingType: 'internal' })).toBe('settled');
    expect(pileOf({ status: 'shared' })).toBe('client');
    expect(pileOf({ status: 'correction_requested' })).toBe('client');
    expect(pileOf({ status: 'acknowledged' })).toBe('settled');
    expect(pileOf({ status: 'acknowledged', revisionStage: 'draft' })).toBe('draft');
    expect(pileOf({ status: 'shared', revisionStage: 'pending_review' })).toBe('studio');
  });

  it('counts decisions, live actions and open ones, leaving cancelled actions out', () => {
    const r = registerRow(mom({
      id: 'a', decisions: [{ id: 'd1', text: 'Oak veneer' }, { id: 'd2', text: 'No false ceiling' }],
      actionItems: [{ status: 'done', text: 'x' }, { status: 'open', text: 'y' }, { status: 'cancelled', text: 'z' }],
      attendees: [{}, {}, {}],
    }));
    expect([r.decisions, r.actions, r.open, r.attendees]).toEqual([2, 2, 1, 3]);
  });

  it('falls back to when the minutes were started when the meeting has no date', () => {
    expect(meetingMs({ meetingDate: 0, createdAt: 42 })).toBe(42);
    expect(meetingMs({ meetingDate: { toMillis: () => 7 } })).toBe(7);
  });

  it('groups by month, newest first, and filters by pile, kind and search', () => {
    const rows = [
      mom({ id: 'n6', meetingDate: at('2026-11-06'), status: 'shared' }),
      mom({ id: 'n4', meetingDate: at('2026-11-04'), status: 'acknowledged', decisions: [{ text: 'Walnut wardrobe shutters' }] }),
      mom({ id: 'o30', meetingDate: at('2026-10-30'), status: 'draft', meetingType: 'internal', meetingTitle: 'BOQ Discussion' }),
    ].map(registerRow);
    const base = { pile: 'all' as const, audience: 'all' as const, search: '', newestFirst: true };

    const all = buildRegister(rows, base);
    expect(all.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['November 2026', ['n6', 'n4']],
      ['October 2026', ['o30']],
    ]);
    expect(buildRegister(rows, { ...base, newestFirst: false })[0].rows.map((r) => r.id)).toEqual(['o30']);
    expect(buildRegister(rows, { ...base, pile: 'client' }).flatMap((g) => g.rows.map((r) => r.id))).toEqual(['n6']);
    expect(buildRegister(rows, { ...base, audience: 'internal' }).flatMap((g) => g.rows.map((r) => r.id))).toEqual(['o30']);
    expect(buildRegister(rows, { ...base, search: 'walnut' }).flatMap((g) => g.rows.map((r) => r.id))).toEqual(['n4']);
    expect(buildRegister(rows, { ...base, search: 'boq' }).flatMap((g) => g.rows.map((r) => r.id))).toEqual(['o30']);

    const c = registerCounts(rows);
    expect(c.total).toBe(3);
    expect(c.pile).toEqual({ draft: 1, studio: 0, client: 1, settled: 1 });
    expect(c.audience).toEqual({ client: 2, internal: 1, vendor: 0 });
  });
});
