/*
  Meeting types, in one place.

  A meeting's type decides who may see it and how every screen and document
  names it. It used to be decided in several places, differently:

    - the MoM PDF checked for "client" while meetings are saved as
      "client_meeting", so every MoM printed "Site Coordination";
    - the timeline drew internal and vendor meetings as site visits;
    - the client portal hid internal meetings by guessing from the title.

  CLIENT_VISIT_TYPES and CLIENT_MOM_TYPES mirror isClientMeetingType() in
  firestore.rules exactly. The portal must ask for these types by name: the
  rule reads each document, so it refuses any query that could return one it
  would not allow.
*/

export const CLIENT_VISIT_TYPES = ['client_meeting', 'site_visit', 'measurement_survey'];
/** MoMs also carry the older "client" label. */
export const CLIENT_MOM_TYPES = ['client_meeting', 'site_visit', 'measurement_survey', 'client'];

export type MeetingKind = 'client' | 'internal' | 'vendor' | 'site' | 'survey' | 'other';

export function meetingKind(type: unknown): MeetingKind {
  const t = String(type || '').toLowerCase();
  if (t === 'client_meeting' || t === 'client') return 'client';
  if (t === 'internal_meeting' || t === 'internal' || t === 'internal_review') return 'internal';
  if (t === 'vendor_meeting' || t === 'vendor' || t === 'contractor_meeting') return 'vendor';
  if (t === 'site_visit' || t === 'site_coordination') return 'site';
  if (t === 'measurement_survey') return 'survey';
  return 'other';
}

const LABEL: Record<MeetingKind, string> = {
  client: 'Client meeting',
  internal: 'Internal meeting',
  vendor: 'Vendor meeting',
  site: 'Site visit',
  survey: 'Measurement survey',
  other: 'Meeting',
};

/** "Client meeting", "Site visit", ... */
export const meetingTypeLabel = (type: unknown): string => LABEL[meetingKind(type)];

/** Seen by the client: client meetings, site visits and surveys. */
export const isClientFacingMeeting = (type: unknown): boolean => {
  const k = meetingKind(type);
  return k === 'client' || k === 'site' || k === 'survey';
};

/** "Virtual · Google Meet", "In person · Thane", or empty. */
export function meetingModeLabel(m: { isVirtual?: boolean; location?: string; googleMeetUrl?: string | null } | null | undefined): string {
  if (!m) return '';
  if (m.isVirtual) return m.googleMeetUrl ? 'Virtual · Google Meet' : 'Virtual';
  return m.location ? `In person · ${m.location}` : 'In person';
}

/** Milliseconds from a Firestore Timestamp, Date, ISO string or number. */
export function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const n = new Date(v).getTime();
  return isNaN(n) ? 0 : n;
}
