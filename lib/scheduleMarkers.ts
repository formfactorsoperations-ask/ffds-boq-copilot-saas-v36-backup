import { ScheduleMarker, MOM, SiteVisit } from '../types';
import { toISO } from './schedule';

// ============================================================================
// scheduleMarkers — meetings and site visits, placed on the schedule.
//
// They already exist in two collections the Timeline has never read:
//   organizations/{studio}/projects/{id}/siteVisits   — SiteVisit, `date`
//   organizations/{studio}/projects/{id}/moms         — MOM, `meetingDate`
//
// They are not tasks: no duration, nothing depends on them. They are the record
// of when someone was on site and what was agreed — which is usually the answer
// to "why did this bar move".
//
// Pure mapping. The component owns the subscriptions.
// ============================================================================

const MS_DAY = 86400000;

/**
 * Firestore Timestamps, epoch numbers, Date objects and ISO strings all arrive
 * here depending on how the record was written. Anything unreadable returns
 * null and is dropped rather than landing on 1 Jan 1970.
 */
export function markerDateISO(v: any): string | null {
  if (v == null) return null;
  let ms: number | null = null;

  if (typeof v === 'number') ms = v;
  else if (v instanceof Date) ms = v.getTime();
  else if (typeof v === 'object') {
    if (typeof v.toMillis === 'function') { try { ms = v.toMillis(); } catch { /* ignore */ } }
    else if (typeof v.toDate === 'function') { try { ms = v.toDate().getTime(); } catch { /* ignore */ } }
    else if (typeof v.seconds === 'number') ms = v.seconds * 1000;
  } else {
    const parsed = Date.parse(String(v));
    if (!Number.isNaN(parsed)) ms = parsed;
  }

  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  return toISO(Math.floor(ms / MS_DAY));
}

export function siteVisitMarkers(visits: SiteVisit[] = []): ScheduleMarker[] {
  return visits.reduce<ScheduleMarker[]>((acc, v) => {
    const atISO = markerDateISO(v.date);
    if (!atISO) return acc;
    const people = (v.attendees || []).length;
    acc.push({
      id: `visit-${v.id}`,
      atISO,
      kind: v.type === 'client_meeting' ? 'client_meeting' : 'site_visit',
      title: v.title || (v.type === 'client_meeting' ? 'Client meeting' : 'Site visit'),
      detail: [
        people ? `${people} attendee${people === 1 ? '' : 's'}` : null,
        v.durationMinutes ? `${v.durationMinutes} min` : null,
        v.location || null,
      ].filter(Boolean).join(' · ') || undefined,
      ref: v.phaseTitle || undefined,
    });
    return acc;
  }, []);
}

export function momMarkers(moms: MOM[] = []): ScheduleMarker[] {
  return moms.reduce<ScheduleMarker[]>((acc, m) => {
    if (m.status === 'draft') return acc;              // not shared, not a record yet
    const atISO = markerDateISO(m.meetingDate) || markerDateISO(m.createdAt);
    if (!atISO) return acc;
    const open = (m.actionItems || []).filter(a => a.status === 'open').length;
    acc.push({
      id: `mom-${m.id}`,
      atISO,
      kind: 'mom',
      title: m.meetingTitle || m.momRef || 'Meeting minutes',
      detail: [
        (m.attendees || []).length ? `${m.attendees.length} attendees` : null,
        (m.decisions || []).length ? `${m.decisions.length} decisions` : null,
        open ? `${open} open action${open === 1 ? '' : 's'}` : null,
      ].filter(Boolean).join(' · ') || undefined,
      ref: m.momRef,
      openActions: open,
    });
    return acc;
  }, []);
}

/** Everything on one axis, oldest first, de-duplicated by id. */
export function buildMarkers(visits: SiteVisit[] = [], moms: MOM[] = []): ScheduleMarker[] {
  const all = [...siteVisitMarkers(visits), ...momMarkers(moms)];
  const seen = new Set<string>();
  return all
    .filter(m => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .sort((a, b) => a.atISO.localeCompare(b.atISO));
}

/** Group markers landing on the same day, so pins never stack illegibly. */
export function markersByDay(markers: ScheduleMarker[] = []): Map<string, ScheduleMarker[]> {
  const m = new Map<string, ScheduleMarker[]>();
  markers.forEach(k => {
    if (!m.has(k.atISO)) m.set(k.atISO, []);
    m.get(k.atISO)!.push(k);
  });
  return m;
}

export const MARKER_LABEL: Record<ScheduleMarker['kind'], string> = {
  site_visit: 'Site visit',
  client_meeting: 'Client meeting',
  mom: 'Meeting minutes',
  decision: 'Decision',
};
