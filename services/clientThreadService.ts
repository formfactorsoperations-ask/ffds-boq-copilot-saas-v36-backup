/*
  What one client's thread is built from (lib/clientThread), read once when
  the client is opened on the Clients screen: one batch per opened client,
  never one per row of the list.

  For each of the client's projects, in parallel:
    - its follow-up log (projects/{id}/followUps, the latest 200);
    - meetings and visits booked on the desk (projects/{id}/visitRequests);
    - meetings and visits logged on the project, and its minutes
      (organizations/{tenant}/projects/{id}/siteVisits and /moms);
    - its Design Desk meetings (organizations/{tenant}/projects/{id}/designMeetings);
    - and, for those who may read leads (Owner, Admin, Ops Director), when
      the lead it was opened from came in (leads/{leadId}).

  A record this person may not read is left out quietly: the thread shows
  what there is. Nothing here writes.
*/
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from './firebaseClient';
import type { FollowUp } from '../lib/opsDesk';
import { fromSiteVisit, type VisitRequest } from '../lib/clientCare';
import { minutedIds, requestIdOfMirror } from '../lib/meetingSync';
import { isClientFacingMeeting } from '../lib/meetingTypes';
import type { ThreadRecords } from '../lib/clientThread';

const rows = (snap: any) => snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
const quiet = <T,>(p: Promise<T>, fallback: T, what: string): Promise<T> =>
  p.catch((e) => { console.warn(`Clients thread: ${what}`, e?.code || e); return fallback; });

export async function loadClientRecords(
  tenantId: string,
  projects: Array<{ id: string; name: string; leadId?: string | null }>,
  opts: { leads: boolean },
): Promise<ThreadRecords> {
  const out: ThreadRecords = { followUps: [], visits: [], moms: [], meetings: [], leadCreatedAt: {} };
  if (!db) return out;
  const now = Date.now();
  await Promise.all(projects.map(async (p) => {
    const org = `organizations/${tenantId}/projects/${p.id}`;
    const [followUps, requests, logged, moms, meetings, lead] = await Promise.all([
      quiet(getDocs(query(collection(db!, `projects/${p.id}/followUps`), orderBy('at', 'desc'), limit(200))).then(rows), [], 'follow-ups'),
      quiet(getDocs(collection(db!, `projects/${p.id}/visitRequests`)).then(rows), [], 'visit requests'),
      tenantId ? quiet(getDocs(collection(db!, `${org}/siteVisits`)).then(rows), [], 'site visits') : Promise.resolve([]),
      tenantId ? quiet(getDocs(collection(db!, `${org}/moms`)).then(rows), [], 'minutes') : Promise.resolve([]),
      tenantId ? quiet(getDocs(collection(db!, `${org}/designMeetings`)).then(rows), [], 'design meetings') : Promise.resolve([]),
      opts.leads && p.leadId ? quiet(getDoc(doc(db!, 'leads', p.leadId)).then((s) => (s.exists() ? s.data() : null)), null, 'lead') : Promise.resolve(null),
    ]);
    out.followUps.push(...(followUps as FollowUp[]));
    out.visits.push(...(requests as VisitRequest[]));
    const minuted = minutedIds(moms as any[]);
    for (const r of logged as any[]) {
      /* A desk booking's copy is already here as the booking itself; internal and vendor meetings are not the client's. */
      if (requestIdOfMirror(r) || !isClientFacingMeeting(r.type)) continue;
      const v = fromSiteVisit(r, p, tenantId, now, minuted.has(String(r.id)));
      if (v) out.visits.push(v);
    }
    out.moms.push(...(moms as any[]).map((m) => ({ ...m, projectId: p.id })));
    out.meetings.push(...(meetings as any[]).map((m) => ({ ...m, projectId: m.projectId || p.id })));
    const created = Number((lead as any)?.createdAt);
    if (Number.isFinite(created) && created > 0) out.leadCreatedAt[p.id] = created;
  }));
  return out;
}
