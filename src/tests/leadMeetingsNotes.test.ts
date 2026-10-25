import { describe, it, expect } from 'vitest';
import {
  leadMeetingRows, closeLeadMeeting, addNote, editNote, removeNote, sortedNotes, leadToProject, conversionLines, type Lead,
} from '../../lib/leads';

const NOW = new Date('2026-10-25T13:00:00+05:30').getTime();
const me = { email: 'Anushka@s.in', name: 'Anushka' };
const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'l1', tenantId: 's', createdAt: NOW - 5 * 86400000, createdBy: 'anushka@s.in', createdByName: 'Anushka', ownerEmail: 'anushka@s.in', ownerName: 'Anushka',
  people: [{ id: 'a', name: 'Mr Dhaval', role: 'Main contact', phone: '8879850606', email: '', main: true }],
  home: { where: 'Kharghar', type: '3 BHK', area: null, scope: ['Living'], possession: '', budget: '' },
  source: 'referral', sourceNote: '', enquiry: '', stage: 'talking', lostReason: null,
  know: { decides: '', style: '', seenWork: false }, next: null, touches: [], firstTouchAt: NOW - 86400000, lastTouchAt: NOW - 86400000,
  openRequest: null, projectId: null, updatedAt: NOW, updatedBy: 'anushka@s.in', ...over,
});
const meeting = (due: string, time: string | null = '16:00') => ({ text: 'Meeting at his home', due, kind: 'meeting' as const, time, mode: 'in_person' as const, meetUrl: null });

describe('meetings with leads', () => {
  it('lists the one booked, coming up or past, and asks for a time when it has none', () => {
    expect(leadMeetingRows([lead({ next: meeting('2026-10-27') })], NOW)[0]).toMatchObject({ status: 'upcoming', leadName: 'Mr Dhaval', time: '16:00', projectId: null });
    expect(leadMeetingRows([lead({ next: meeting('2026-10-27', null) })], NOW)[0].status).toBe('needs_time');
    expect(leadMeetingRows([lead({ next: meeting('2026-10-20') })], NOW)[0].status).toBe('to_close');
    expect(leadMeetingRows([lead({ next: { text: 'Call back', due: '2026-10-27', kind: 'call' } })], NOW)).toHaveLength(0);
  });

  it('keeps a meeting once it is closed out, and counts it once', () => {
    const closed = closeLeadMeeting(lead({ next: meeting('2026-10-24') }), 'done', 'Liked the samples', me, NOW);
    expect(closed.next).toBeNull();
    expect(closed.stage).toBe('meeting');
    expect(closed.lastTouchAt).toBe(NOW);
    expect(closed.touches.at(-1)).toMatchObject({ kind: 'meeting', text: 'Meeting at his home: Liked the samples' });
    const rows = leadMeetingRows([closed], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'done', outcome: 'Liked the samples', date: '2026-10-24' });
  });

  it('a meeting that did not happen is not contact', () => {
    const missed = closeLeadMeeting(lead({ next: meeting('2026-10-24') }), 'missed', '', me, NOW);
    expect(missed.lastTouchAt).toBe(NOW - 86400000);
    expect(missed.touches.at(-1)?.kind).toBe('note');
    expect(leadMeetingRows([missed], NOW)[0].status).toBe('missed');
  });

  it('includes meetings logged as a touch, and won leads, booked first then newest', () => {
    const logged = lead({ id: 'l2', stage: 'won', projectId: 'p1', touches: [{ id: 't1', at: NOW - 2 * 86400000, by: 'x', byName: 'X', kind: 'meeting', text: 'Studio walkthrough' }] });
    const rows = leadMeetingRows([logged, lead({ next: meeting('2026-10-28') })], NOW);
    expect(rows.map((r) => r.status)).toEqual(['upcoming', 'done']);
    expect(rows[1]).toMatchObject({ projectId: 'p1', purpose: 'Studio walkthrough' });
  });
});

describe('notes on a lead', () => {
  it('adds, pins, edits and removes, pinned first', () => {
    let l = addNote(lead(), '  Wife decides on the kitchen  ', me, NOW - 1000);
    l = addNote(l, 'Call after 7 pm', me, NOW, false);
    l = addNote(l, '   ', me, NOW);
    expect(l.notes).toHaveLength(2);
    expect(l.notes![0]).toMatchObject({ text: 'Wife decides on the kitchen', by: 'anushka@s.in', pinned: false });
    const first = l.notes![0].id;
    l = editNote(l, first, { pinned: true }, NOW);
    expect(sortedNotes(l.notes).map((n) => n.text)).toEqual(['Wife decides on the kitchen', 'Call after 7 pm']);
    l = editNote(l, first, { text: 'Wife decides on the kitchen and the colours' }, NOW + 1);
    expect(l.notes!.find((n) => n.id === first)).toMatchObject({ editedAt: NOW + 1 });
    expect(removeNote(l, first).notes).toHaveLength(1);
  });

  it('pinned notes go into the project brief', () => {
    const l = editNote(addNote(lead(), 'Wants Italian marble', me, NOW), '', {}, NOW);
    const pinned = { ...l, notes: l.notes!.map((n) => ({ ...n, pinned: true })) };
    expect(leadToProject(pinned).clientBrief).toContain('Notes: Wants Italian marble');
    expect(leadToProject(l).clientBrief).not.toContain('Notes:');
    expect(conversionLines(pinned).at(-1)).toEqual(['Notes', '1 note kept with the lead; the 1 pinned go into the brief']);
  });
});
