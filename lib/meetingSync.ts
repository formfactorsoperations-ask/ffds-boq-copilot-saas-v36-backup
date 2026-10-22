/*
  ONE MEETING, TWO SCREENS: the Ops Desk and the project's meeting log.

  A meeting or visit is booked in one of two places:
    - on the project (its timeline, SiteVisitLogModal): organizations/{studio}/projects/{id}/siteVisits
    - on the Ops Desk (lib/clientCare.ts): projects/{id}/visitRequests

  The desk reads the project's log directly (services/opsDeskService), so a
  meeting logged there shows on the desk as it is. The other way, the server
  (functions/src/meetingSync.ts) keeps a copy of each desk booking in the
  project's log, under the id `desk-{request id}`, once a time is agreed: so
  it is on the project's timeline, its meetings history and its schedule, and
  minutes written for it are tied to it like any other meeting.

  What each side owns:
    - The desk owns the booking: what, when, how, and its status. Every change
      on the desk is copied to the project's log.
    - The project owns what is done to the meeting there: notes, minutes, and
      a calendar invite sent from there. Deleting or cancelling it on the
      project cancels the desk booking; minutes written for it mark it done.

  These are the pure rules of that; the server applies them.
*/
import type { VisitRequest, VisitKind } from './clientCare';

export const DESK_PREFIX = 'desk-';
export const mirrorIdOf = (requestId: string) => `${DESK_PREFIX}${requestId}`;
/** The desk booking a project meeting was copied from, or null for one logged on the project. */
export const requestIdOfMirror = (siteVisit: { id?: string; visitRequestId?: string | null } | null | undefined): string | null => {
  if (!siteVisit) return null;
  if (siteVisit.visitRequestId) return String(siteVisit.visitRequestId);
  const id = String(siteVisit.id || '');
  return id.startsWith(DESK_PREFIX) ? id.slice(DESK_PREFIX.length) : null;
};

const SITE_TYPE: Record<VisitKind, string> = { meeting: 'client_meeting', site_visit: 'site_visit', measurement: 'measurement_survey' };
export const siteVisitTypeOf = (k: VisitKind) => SITE_TYPE[k] || 'client_meeting';

const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
/** The day as the project's log stores it: midnight UTC of that date, as `new Date('YYYY-MM-DD')` gives. */
export const logDayMillis = (day: string) => Date.parse(`${day}T00:00:00Z`);
const millisOf = (d: any): number | null => {
  if (d == null) return null;
  if (typeof d === 'number') return d;
  if (typeof d.toMillis === 'function') return d.toMillis();
  if (typeof d.seconds === 'number') return d.seconds * 1000;
  if (typeof d === 'string') { const t = Date.parse(d); return Number.isNaN(t) ? null : t; }
  return null;
};

const LIVE = ['confirmed', 'rescheduled', 'done'];
const OPEN = ['requested', 'confirmed', 'rescheduled'];
const lastNote = (r: VisitRequest) => String([...(r.history || [])].reverse().find((h) => h.note)?.note || '');

/**
 * The fields the desk owns on the project's copy, as they should be now, or
 * null when the booking has no copy (no time agreed yet, or cancelled before
 * it had one). `date` is milliseconds; the server stores it as a Timestamp.
 */
export function mirrorFields(r: VisitRequest): Record<string, any> | null {
  const slot = r.slot && isDay(r.slot.date) && isTime(r.slot.time) ? r.slot : null;
  if (!slot || !(LIVE.includes(r.status) || r.status === 'cancelled')) return null;
  const video = r.mode === 'video';
  const meet = !!r.meetUrl && /^https:\/\/meet\.google\.com\//.test(r.meetUrl);
  const out: Record<string, any> = {
    type: siteVisitTypeOf(r.kind),
    title: String(r.purpose || '').slice(0, 300) || (r.kind === 'site_visit' ? 'Site visit' : r.kind === 'measurement' ? 'Measurement' : 'Meeting'),
    date: logDayMillis(slot.date),
    startTime: slot.time,
    isVirtual: r.mode !== 'in_person',
    meetingMode: video ? (r.meetUrl && !meet ? 'link' : 'google_meet') : r.mode === 'call' ? 'phone' : 'in_person',
    meetingLink: video && r.meetUrl && !meet ? r.meetUrl : null,
    location: video ? (meet || !r.meetUrl ? 'Google Meet' : 'Video call') : r.mode === 'call' ? 'Phone call' : r.kind === 'meeting' ? 'Studio' : 'Site',
    visitRequestId: r.id,
    source: 'ops_desk',
  };
  if (r.calendarEventId) {
    out.googleCalendarEventId = r.calendarEventId;
    out.googleMeetUrl = r.meetUrl || null;
    out.calendarSynced = true;
    out.calendarSyncError = null;
  }
  return out;
}

/** The fields a new copy starts with, beyond those the desk owns. */
export function mirrorCreateFields(r: VisitRequest, now: number): Record<string, any> {
  return {
    durationMinutes: 60,
    phaseStepNumber: 0,
    phaseTitle: '',
    attendees: [],
    attendeeEmails: [],
    notes: `Booked on the Ops Desk by ${r.createdByName || r.createdBy || 'Client Relations'}.`,
    loggedBy: r.createdBy || '',
    loggedAt: now,
    googleCalendarEventId: null,
    googleMeetUrl: null,
    calendarSynced: false,
    calendarSyncError: null,
    linkedSofItemIds: [],
    linkedDecisionIds: [],
    momData: null,
    status: 'active',
  };
}

const same = (a: any, b: any) => (a == null && b == null) || a === b;

/**
 * What to write to the project's copy for a desk booking: the whole copy when
 * there is none yet, only what changed otherwise, or nothing. Once the copy is
 * cancelled it is left as it is, so a cancellation never bounces back and forth.
 */
export function mirrorWrite(r: VisitRequest | null, existing: Record<string, any> | null, now: number):
  { kind: 'create'; data: Record<string, any> } | { kind: 'update'; data: Record<string, any> } | null {
  if (!r) return existing && existing.status !== 'cancelled'
    ? { kind: 'update', data: { status: 'cancelled', cancelledAt: now, cancelReason: 'The Ops Desk booking was removed.' } } : null;
  const want = mirrorFields(r);
  if (!want) return null;
  const cancel = r.status === 'cancelled';
  if (!existing) {
    if (cancel) return null;
    return { kind: 'create', data: { ...mirrorCreateFields(r, now), ...want } };
  }
  if (existing.status === 'cancelled') return null;
  const diff: Record<string, any> = {};
  for (const [k, v] of Object.entries(want)) {
    const have = k === 'date' ? millisOf(existing.date) : existing[k];
    if (!same(have, v)) diff[k] = v;
  }
  if (cancel) Object.assign(diff, { status: 'cancelled', cancelledAt: now, cancelReason: lastNote(r) || 'Cancelled on the Ops Desk.' });
  return Object.keys(diff).length ? { kind: 'update', data: diff } : null;
}

export interface DeskEvent { at: number; by: string; byName: string; status: VisitRequest['status']; slot: VisitRequest['slot']; note: string }

/**
 * What the project's copy changing means for the desk booking: cancelled when
 * the copy was deleted or cancelled on the project, and a calendar invite sent
 * from the project shown on the desk. Null when there is nothing to change.
 */
export function deskPatchFromMirror(r: VisitRequest, mirror: Record<string, any> | null, now: number): Record<string, any> | null {
  const open = OPEN.includes(r.status);
  if (open && (!mirror || mirror.status === 'cancelled')) {
    const note = !mirror ? 'Deleted from the project\'s meeting log.' : `Cancelled on the project${mirror.cancelReason ? `: ${String(mirror.cancelReason).slice(0, 200)}` : '.'}`;
    const ev: DeskEvent = { at: now, by: '', byName: 'The project', status: 'cancelled', slot: r.slot || null, note };
    return { status: 'cancelled', history: [...(r.history || []), ev], updatedAt: now, updatedBy: '' };
  }
  if (mirror && mirror.status !== 'cancelled' && mirror.googleCalendarEventId && !r.calendarEventId) {
    return { calendarEventId: String(mirror.googleCalendarEventId), meetUrl: mirror.googleMeetUrl || r.meetUrl || null, updatedAt: now, updatedBy: '' };
  }
  return null;
}

/** Minutes written for a desk booking's meeting: it was held, so the booking is done. */
export function deskPatchFromMinutes(r: VisitRequest, mom: { momRef?: string; meetingTitle?: string }, now: number): Record<string, any> | null {
  if (r.status !== 'confirmed' && r.status !== 'rescheduled') return null;
  const ev: DeskEvent = { at: now, by: '', byName: 'Minutes', status: 'done', slot: r.slot || null, note: `Minutes ${mom.momRef || ''} written for it.`.replace('  ', ' ') };
  return { status: 'done', history: [...(r.history || []), ev], updatedAt: now, updatedBy: '' };
}

/** The meeting the minutes of a desk booking start from (components/ops/MomCaptureModal). */
export function mirrorVisitOf(r: Pick<VisitRequest, 'id' | 'kind' | 'purpose' | 'slot' | 'mode'>) {
  return {
    id: mirrorIdOf(r.id),
    type: siteVisitTypeOf(r.kind),
    title: r.purpose || 'Meeting',
    date: r.slot?.date || Date.now(),
    startTime: r.slot?.time || '',
    isVirtual: r.mode !== 'in_person',
    attendees: [] as string[],
    phaseStepNumber: 0,
  };
}

/* ── Meetings held elsewhere, in the project's log ───────────────────────── */

/*
  Two more kinds of meeting used to be missing from the project's log, and so
  from the Ops Desk:
    - a design review held on the Design Desk (designMeetings), and
    - minutes written for a meeting nobody logged (from Meeting prep, the
      Minutes tab or the action tracker), whose meetingId is a placeholder
      "ops-{time}" that pointed at nothing.
  The server adds each to the log once (functions/src/meetingSync.ts) and
  marks its source `meetingLogged`, so a copy deleted on the project stays
  deleted. The copy's id is the one the minutes already use, so the two pair.
*/

export const designCopyIdOf = (designMeetingId: string) => `ops-design-${designMeetingId}`;
/** A placeholder meeting id that minutes were started with, with no meeting behind it. */
export const isPlaceholderMeetingId = (id: unknown) => /^ops-/.test(String(id || '')) && !/^ops-design-/.test(String(id || ''));

const istParts = (ms: number) => {
  const iso = new Date(ms + 5.5 * 3600000).toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
};

/** The log's type for a meeting type the minutes carry. */
export function logTypeOf(meetingType: unknown): string {
  const t = String(meetingType || '').toLowerCase();
  if (t === 'internal_meeting' || t === 'internal' || t === 'internal_review') return 'internal_meeting';
  if (t === 'vendor_meeting' || t === 'vendor' || t === 'contractor_meeting') return 'vendor_meeting';
  if (t === 'site_visit' || t === 'site_coordination') return 'site_visit';
  if (t === 'measurement_survey') return 'measurement_survey';
  return 'client_meeting';
}

/** A design review on the Design Desk, as the project's log keeps it. Null when it should not be there. */
export function designCopyFields(m: any): Record<string, any> | null {
  if (!m?.id || !Number(m.startedAt) || !['OPEN', 'CLOSED', 'CANCELLED'].includes(String(m.state))) return null;
  const { day, time } = istParts(Number(m.startedAt));
  const rooms = (Array.isArray(m.rooms) ? m.rooms : []).map((r: any) => String(r?.room || '')).filter(Boolean);
  const minutes = m.closedAt && Number(m.closedAt) > Number(m.startedAt) ? Math.max(15, Math.round((Number(m.closedAt) - Number(m.startedAt)) / 60000)) : 60;
  return {
    type: 'client_meeting',
    title: `Design review${rooms.length ? `: ${rooms.slice(0, 4).join(', ')}${rooms.length > 4 ? ` and ${rooms.length - 4} more` : ''}` : ''}`.slice(0, 300),
    date: logDayMillis(day),
    startTime: time,
    durationMinutes: minutes,
    status: m.state === 'CANCELLED' ? 'cancelled' : 'active',
    designMeetingId: String(m.id),
    source: 'design_desk',
  };
}

export function designCopyCreateFields(m: any, now: number): Record<string, any> {
  const names = String(m?.attendees || '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
  return {
    phaseStepNumber: 0, phaseTitle: '', attendees: names, attendeeEmails: names.map(() => ''),
    notes: `Held on the Design Desk${m?.startedBy?.name ? ` by ${m.startedBy.name}` : ''}.`,
    location: 'Design Desk', isVirtual: false, meetingMode: 'in_person', meetingLink: null,
    loggedBy: String(m?.startedBy?.email || ''), loggedAt: now,
    googleCalendarEventId: null, googleMeetUrl: null, calendarSynced: false, calendarSyncError: null,
    linkedSofItemIds: [], linkedDecisionIds: [], momData: null,
  };
}

/** What to write to a design review's copy: the whole copy once, then only what changed. */
export function designCopyWrite(m: any, existing: Record<string, any> | null, now: number):
  { kind: 'create'; data: Record<string, any> } | { kind: 'update'; data: Record<string, any> } | null {
  const want = designCopyFields(m);
  if (!want) return null;
  if (!existing) {
    if (m.meetingLogged || want.status === 'cancelled') return null;
    return { kind: 'create', data: { ...designCopyCreateFields(m, now), ...want } };
  }
  const diff: Record<string, any> = {};
  for (const [k, v] of Object.entries(want)) {
    const have = k === 'date' ? millisOf(existing.date) : existing[k];
    if (!same(have, v)) diff[k] = v;
  }
  if (diff.status === 'cancelled') Object.assign(diff, { cancelledAt: now, cancelReason: 'Cancelled on the Design Desk.' });
  return Object.keys(diff).length ? { kind: 'update', data: diff } : null;
}

/** The meeting minutes were written for, when nobody logged it. Null when they need none. */
export function minutesMeetingFields(mom: any, now: number): Record<string, any> | null {
  if (!mom || mom.meetingLogged || !isPlaceholderMeetingId(mom.meetingId)) return null;
  const at = Number(mom.meetingDate) || Number(mom.createdAt) || now;
  const { day, time } = istParts(at);
  const end = Number(mom.meetingEnd);
  const people = (Array.isArray(mom.attendees) ? mom.attendees : []).map((a: any) => (typeof a === 'string' ? a : String(a?.name || ''))).filter(Boolean).slice(0, 30);
  return {
    type: logTypeOf(mom.meetingType),
    title: String(mom.meetingTitle || 'Meeting').slice(0, 300),
    date: logDayMillis(day),
    startTime: time,
    durationMinutes: end > at ? Math.round((end - at) / 60000) : 60,
    phaseStepNumber: Number(mom.stage) || 0,
    phaseTitle: '',
    attendees: people,
    attendeeEmails: people.map(() => ''),
    notes: `Logged from its minutes${mom.momRef ? ` (${mom.momRef})` : ''}.`,
    location: String(mom.venue || ''),
    isVirtual: false,
    meetingMode: 'in_person',
    meetingLink: null,
    loggedBy: String(mom.preparedBy?.email || mom.createdBy || ''),
    loggedAt: now,
    googleCalendarEventId: null, googleMeetUrl: null, calendarSynced: false, calendarSyncError: null,
    linkedSofItemIds: [], linkedDecisionIds: [], momData: null,
    status: 'active',
    source: 'minutes',
  };
}

/** The log ids a project's minutes stand for: their meeting, and a design review they came from. */
export function minutedIds(moms: any[]): Set<string> {
  const out = new Set<string>();
  for (const m of moms || []) {
    if (m?.meetingId) out.add(String(m.meetingId));
    if (m?.designReview?.meetingId) out.add(designCopyIdOf(String(m.designReview.meetingId)));
  }
  return out;
}
