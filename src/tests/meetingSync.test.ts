import { describe, it, expect } from 'vitest';
import {
  mirrorIdOf, requestIdOfMirror, mirrorFields, mirrorWrite, deskPatchFromMirror, deskPatchFromMinutes, mirrorVisitOf, logDayMillis,
} from '../../lib/meetingSync';
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
