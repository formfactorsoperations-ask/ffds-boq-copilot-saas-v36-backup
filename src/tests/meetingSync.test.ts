import { describe, it, expect } from 'vitest';
import {
  mirrorIdOf, requestIdOfMirror, mirrorFields, mirrorWrite, deskPatchFromMirror, deskPatchFromMinutes, mirrorVisitOf, logDayMillis,
  designCopyIdOf, designCopyWrite, isPlaceholderMeetingId, minutesMeetingFields, logTypeOf, minutedIds,
} from '../../lib/meetingSync';
import { leadMeeting, type Lead } from '../../lib/leads';
import { fromSiteVisit, type VisitRequest } from '../../lib/clientCare';

const NOW = new Date('2026-10-22T10:00:00+05:30').getTime();
const req = (over: Partial<VisitRequest> = {}): VisitRequest => ({
  id: 'v1', tenantId: 's', projectId: 'p1', projectName: 'Unique Vistas', kind: 'meeting', mode: 'video', purpose: 'BOQ discussion',
  requestedBy: 'client', status: 'confirmed', slot: { date: '2026-10-24', time: '16:30' }, reschedules: 0,
  history: [{ at: 1, by: 'riya@s.in', byName: 'Riya', status: 'confirmed', slot: { date: '2026-10-24', time: '16:30' }, note: '' }],
  createdAt: 1, createdBy: 'riya@s.in', createdByName: 'Riya', updatedAt: 1, updatedBy: 'riya@s.in', ...over,
});
/* The copy as the server stores it, its date a Timestamp. */
const stored = (data: Record<string, any>) => ({ ...data, date: { toMillis: () => data.date } });

describe('a desk booking in the project\'s meeting log', () => {
  it('is copied once a time is agreed, under the booking\'s id', () => {
    expect(mirrorIdOf('v1')).toBe('desk-v1');
    expect(requestIdOfMirror({ id: 'desk-v1' })).toBe('v1');
    expect(requestIdOfMirror({ id: 'abc', visitRequestId: 'v2' })).toBe('v2');
    expect(requestIdOfMirror({ id: 'abc' })).toBeNull();
    expect(mirrorWrite(req({ status: 'requested', slot: null }), null, NOW)).toBeNull();
    expect(mirrorWrite(req({ status: 'requested' }), null, NOW)).toBeNull();
    const w = mirrorWrite(req(), null, NOW)!;
    expect(w.kind).toBe('create');
    expect(w.data).toMatchObject({
      type: 'client_meeting', title: 'BOQ discussion', date: logDayMillis('2026-10-24'), startTime: '16:30', durationMinutes: 60,
      isVirtual: true, meetingMode: 'google_meet', location: 'Google Meet', status: 'active', visitRequestId: 'v1', source: 'ops_desk',
      calendarSynced: false, googleCalendarEventId: null, loggedBy: 'riya@s.in',
    });
  });

  it('reads back on the desk as the same meeting, on the same day and time', () => {
    const w = mirrorWrite(req(), null, NOW)!;
    const back = fromSiteVisit({ id: 'desk-v1', ...stored(w.data) }, { id: 'p1', name: 'Unique Vistas' }, 's', NOW)!;
    expect(back.slot).toEqual({ date: '2026-10-24', time: '16:30' });
    expect(back.kind).toBe('meeting');
    expect(back.mode).toBe('video');
  });

  it('follows a new time, a Meet link and a cancellation, writing only what changed', () => {
    const copy = stored(mirrorWrite(req(), null, NOW)!.data);
    expect(mirrorWrite(req(), copy, NOW)).toBeNull();
    expect(mirrorWrite(req({ status: 'rescheduled', slot: { date: '2026-10-25', time: '11:00' } }), copy, NOW)).toEqual({
      kind: 'update', data: { date: logDayMillis('2026-10-25'), startTime: '11:00' },
    });
    expect(mirrorWrite(req({ meetUrl: 'https://meet.google.com/abc', calendarEventId: 'e1', calendarAccount: 'studio@gmail.com' }), copy, NOW)!.data).toEqual({
      googleCalendarEventId: 'e1', googleMeetUrl: 'https://meet.google.com/abc', calendarSynced: true,
    });
    const cancelled = req({ status: 'cancelled', history: [...req().history, { at: 2, by: 'riya@s.in', byName: 'Riya', status: 'cancelled', slot: null, note: 'Client travelling' }] });
    expect(mirrorWrite(cancelled, copy, NOW)!.data).toMatchObject({ status: 'cancelled', cancelReason: 'Client travelling', cancelledAt: NOW });
    /* Once cancelled, left alone; and a booking cancelled before it had a copy gets none. */
    expect(mirrorWrite(cancelled, { ...copy, status: 'cancelled' }, NOW)).toBeNull();
    expect(mirrorWrite(cancelled, null, NOW)).toBeNull();
  });

  it('keeps a calendar invite sent from the project, and the notes written there', () => {
    const copy = { ...stored(mirrorWrite(req(), null, NOW)!.data), googleCalendarEventId: 'p-ev', googleMeetUrl: 'https://meet.google.com/xyz', calendarSynced: true, notes: 'Bring samples' };
    expect(mirrorWrite(req(), copy, NOW)).toBeNull();
  });

  it('marks in-person, phone and pasted-link meetings the way the project does', () => {
    expect(mirrorFields(req({ mode: 'in_person', kind: 'site_visit' }))).toMatchObject({ type: 'site_visit', isVirtual: false, meetingMode: 'in_person', location: 'Site' });
    expect(mirrorFields(req({ mode: 'call', kind: 'measurement' }))).toMatchObject({ type: 'measurement_survey', isVirtual: true, meetingMode: 'phone', location: 'Phone call' });
    expect(mirrorFields(req({ meetUrl: 'https://zoom.us/j/1' }))).toMatchObject({ meetingMode: 'link', meetingLink: 'https://zoom.us/j/1' });
  });
});

describe('the project\'s copy, back on the desk', () => {
  const copy = stored(mirrorWrite(req(), null, NOW)!.data);

  it('cancels the booking when the copy is deleted or cancelled on the project', () => {
    const gone = deskPatchFromMirror(req(), null, NOW)!;
    expect(gone.status).toBe('cancelled');
    expect(gone.history.at(-1)).toMatchObject({ byName: 'The project', status: 'cancelled', note: "Deleted from the project's meeting log." });
    expect(deskPatchFromMirror(req(), { ...copy, status: 'cancelled', cancelReason: 'Moved to next week' }, NOW)!.history.at(-1).note).toBe('Cancelled on the project: Moved to next week');
    /* A booking already done or cancelled stays as it is. */
    expect(deskPatchFromMirror(req({ status: 'done' }), null, NOW)).toBeNull();
    expect(deskPatchFromMirror(req({ status: 'cancelled' }), null, NOW)).toBeNull();
  });

  it('shows a calendar invite sent from the project, and is otherwise left alone', () => {
    expect(deskPatchFromMirror(req(), copy, NOW)).toBeNull();
    expect(deskPatchFromMirror(req(), { ...copy, googleCalendarEventId: 'p-ev', googleMeetUrl: 'https://meet.google.com/xyz' }, NOW))
      .toMatchObject({ calendarEventId: 'p-ev', meetUrl: 'https://meet.google.com/xyz' });
    expect(deskPatchFromMirror(req({ calendarEventId: 'e1' }), { ...copy, googleCalendarEventId: 'p-ev' }, NOW)).toBeNull();
  });

  it('settles: what the desk writes back changes nothing more on the project', () => {
    const back = deskPatchFromMirror(req(), { ...copy, googleCalendarEventId: 'p-ev', googleMeetUrl: 'https://meet.google.com/xyz', calendarSynced: true, calendarSyncError: null }, NOW)!;
    const after = req({ ...back } as any);
    expect(mirrorWrite(after, { ...copy, googleCalendarEventId: 'p-ev', googleMeetUrl: 'https://meet.google.com/xyz', calendarSynced: true, calendarSyncError: null }, NOW)).toBeNull();
    const cancelled = req({ ...deskPatchFromMirror(req(), null, NOW) } as any);
    expect(mirrorWrite(cancelled, null, NOW)).toBeNull();
  });

  it('marks the booking done when minutes are written for its meeting', () => {
    const p = deskPatchFromMinutes(req(), { momRef: 'MOM-2026-034' }, NOW)!;
    expect(p.status).toBe('done');
    expect(p.history.at(-1)).toMatchObject({ byName: 'Minutes', status: 'done', note: 'Minutes MOM-2026-034 written for it.' });
    expect(deskPatchFromMinutes(req({ status: 'cancelled' }), {}, NOW)).toBeNull();
    expect(deskPatchFromMinutes(req({ status: 'done' }), {}, NOW)).toBeNull();
  });

  it('starts the minutes from the copy, so they are tied to the meeting', () => {
    expect(mirrorVisitOf(req())).toMatchObject({ id: 'desk-v1', type: 'client_meeting', title: 'BOQ discussion', date: '2026-10-24', startTime: '16:30' });
  });
});

describe('meetings held elsewhere, in the project\'s log', () => {
  const started = new Date('2026-10-20T15:00:00+05:30').getTime();
  const design = (over: any = {}) => ({
    id: 'dm1', state: 'OPEN', startedAt: started, closedAt: null, attendees: 'Mr Rao, Mrs Rao', startedBy: { name: 'Kabir', email: 'kabir@s.in' },
    rooms: [{ room: 'Living' }, { room: 'Kitchen' }], ...over,
  });

  it('logs a Design Desk review under the id its minutes use, and follows it to its close', () => {
    expect(designCopyIdOf('dm1')).toBe('ops-design-dm1');
    const w = designCopyWrite(design(), null, NOW)!;
    expect(w.kind).toBe('create');
    expect(w.data).toMatchObject({
      type: 'client_meeting', title: 'Design review: Living, Kitchen', date: logDayMillis('2026-10-20'), startTime: '15:00',
      durationMinutes: 60, status: 'active', source: 'design_desk', designMeetingId: 'dm1', location: 'Design Desk', attendees: ['Mr Rao', 'Mrs Rao'],
    });
    const copy = stored(w.data);
    expect(designCopyWrite(design({ state: 'CLOSED', closedAt: started + 95 * 60000 }), copy, NOW)).toEqual({ kind: 'update', data: { durationMinutes: 95 } });
    expect(designCopyWrite(design({ state: 'CANCELLED' }), copy, NOW)!.data).toMatchObject({ status: 'cancelled', cancelReason: 'Cancelled on the Design Desk.' });
    /* Logged once: a copy deleted on the project is not put back, and a review cancelled before it was logged is not logged. */
    expect(designCopyWrite(design({ meetingLogged: true }), null, NOW)).toBeNull();
    expect(designCopyWrite(design({ state: 'CANCELLED' }), null, NOW)).toBeNull();
  });

  it('logs the meeting minutes were written for when nobody logged it, once', () => {
    expect(isPlaceholderMeetingId('ops-1729')).toBe(true);
    expect(isPlaceholderMeetingId('ops-design-dm1')).toBe(false);
    expect(isPlaceholderMeetingId('desk-v1')).toBe(false);
    expect(isPlaceholderMeetingId('abc')).toBe(false);
    const at = new Date('2026-10-21T11:30:00+05:30').getTime();
    const f = minutesMeetingFields({ meetingId: 'ops-1729', meetingType: 'internal', meetingTitle: 'Weekly sync', meetingDate: at, meetingEnd: at + 45 * 60000, momRef: 'MOM-2026-041', venue: 'Studio', attendees: [{ name: 'Riya' }, 'Kabir'] }, NOW)!;
    expect(f).toMatchObject({ type: 'internal_meeting', title: 'Weekly sync', date: logDayMillis('2026-10-21'), startTime: '11:30', durationMinutes: 45, location: 'Studio', attendees: ['Riya', 'Kabir'], source: 'minutes', status: 'active' });
    expect(minutesMeetingFields({ meetingId: 'ops-1729', meetingLogged: true }, NOW)).toBeNull();
    expect(minutesMeetingFields({ meetingId: 'sv-real' }, NOW)).toBeNull();
    expect(logTypeOf('client')).toBe('client_meeting');
    expect(logTypeOf('measurement_survey')).toBe('measurement_survey');
  });

  it('knows which meetings have minutes, a design review\'s included', () => {
    const ids = minutedIds([{ meetingId: 'sv1' }, { meetingId: 'sv2', designReview: { meetingId: 'dm1' } }, {}]);
    expect([...ids].sort()).toEqual(['ops-design-dm1', 'sv1', 'sv2']);
  });
});

describe('a meeting booked with a lead', () => {
  const lead = (next: any, over: any = {}): Lead => ({
    id: 'l1', tenantId: 's', createdAt: 1, createdBy: 'riya@s.in', createdByName: 'Riya', ownerEmail: 'riya@s.in', ownerName: 'Riya',
    people: [{ id: 'p', name: 'Anil Mehta', role: '', phone: '', email: 'anil@x.in', main: true }], home: { type: '', where: '', possession: '', budget: '', scope: [] } as any,
    source: 'website' as any, sourceNote: '', enquiry: '', stage: 'meeting', lostReason: null, know: {} as any, next, touches: [], firstTouchAt: null, lastTouchAt: null,
    openRequest: null, projectId: null, updatedAt: 5, updatedBy: 'riya@s.in', ...over,
  });

  it('is on Meetings & visits, opened on the lead, with its Meet link', () => {
    const v = leadMeeting(lead({ kind: 'meeting', text: 'Studio meeting', due: '2026-10-24', time: '11:00', mode: 'video', meetUrl: 'https://meet.google.com/a', calendarEventId: 'e', calendarAccount: 'x@g.com' }))!;
    expect(v).toMatchObject({ id: 'lead:l1', projectId: '', projectName: 'Lead · Anil Mehta', status: 'confirmed', slot: { date: '2026-10-24', time: '11:00' }, mode: 'video', meetUrl: 'https://meet.google.com/a', source: 'lead', leadId: 'l1' });
    expect(leadMeeting(lead({ kind: 'meeting', text: 'Studio meeting', due: '2026-10-24' }))).toMatchObject({ status: 'requested', slot: null, mode: 'in_person' });
    expect(leadMeeting(lead({ kind: 'call', text: 'Call', due: '2026-10-24' }))).toBeNull();
    expect(leadMeeting(lead(null))).toBeNull();
    expect(leadMeeting(lead({ kind: 'meeting', text: 'x', due: '2026-10-24', time: '11:00' }, { stage: 'lost' }))).toBeNull();
  });
});
