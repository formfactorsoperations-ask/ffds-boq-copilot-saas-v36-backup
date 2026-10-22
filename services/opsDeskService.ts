/*
  Reads and writes for the Ops Desk (lib/opsDesk.ts has what it all means).

  Client Relations reads, project by project, the few projects they are
  assigned to: the database refuses them anything wider. The studio's leads
  read the follow-ups, escalations and minutes awaiting approval of the whole
  studio in one query each (collection groups, firestore.indexes.json).
*/
import { revisionsWaiting } from './minutesService';
import {
  collection, collectionGroup, doc, getDocs, limit, orderBy, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebaseClient';
import { callGoogleCalendarAPI } from './googleCalendarService';
import type { Escalation, EscalationCategory, FollowUp, NextStep, Outcome, Channel, Subject } from '../lib/opsDesk';
import { fromSiteVisit, materialise, type Checklist, type ChecklistKind, type VisitRequest } from '../lib/clientCare';

const DAY = 86400000;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface OpsMom { id: string; projectId: string; projectName: string; status: string; meetingTitle?: string; momRef?: string; meetingDate?: number; raw: any }

export interface ProjectOps {
  followUps: FollowUp[];
  escalations: Escalation[];
  decisions: any[];
  moms: OpsMom[];
  /** Client care (lib/clientCare.ts): the project's checklists, as saved, and its meeting and visit requests, with the meetings logged on the project. */
  checklists: Partial<Record<ChecklistKind, Checklist>>;
  visits: VisitRequest[];
}

const KINDS: ChecklistKind[] = ['onboarding', 'handover', 'documents'];
const careOf = (checkRows: any[], visitRows: any[]) => {
  const checklists: Partial<Record<ChecklistKind, Checklist>> = {};
  for (const r of checkRows) if (KINDS.includes(r.id)) checklists[r.id as ChecklistKind] = materialise(r.id, r);
  return { checklists, visits: visitRows as VisitRequest[] };
};

const rows = (snap: any) => snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

/*
  The meetings and visits logged on the project itself (its timeline, services/siteVisitService),
  which the desk used not to read at all: a meeting booked there never showed up here.
*/
const projectVisits = (tenantId: string, project: { id: string; name: string }) =>
  getDocs(collection(db!, `organizations/${tenantId}/projects/${project.id}/siteVisits`)).then((snap) => {
    const now = Date.now();
    return (rows(snap) as any[]).map((r) => fromSiteVisit(r, project, tenantId, now)).filter(Boolean) as VisitRequest[];
  });

/** One project's follow-ups, escalations, client decisions and minutes. */
export async function loadProjectOps(tenantId: string, project: { id: string; name: string }, decisionsOnly = false): Promise<ProjectOps> {
  if (!db) return { followUps: [], escalations: [], decisions: [], moms: [], checklists: {}, visits: [] };
  const pid = project.id;
  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch((e) => { console.warn(`Ops Desk: ${pid}`, e?.code || e); return fallback; });
  const care = Promise.all([
    safe(getDocs(collection(db, `projects/${pid}/checklists`)).then(rows), []),
    safe(getDocs(collection(db, `projects/${pid}/visitRequests`)).then(rows), []),
    safe(projectVisits(tenantId, project), []),
  ]).then(([c, v, logged]) => careOf(c, [...v, ...logged]));
  /* A lead reads the rest studio-wide (loadStudioOps); decisions and client care are per project. */
  if (decisionsOnly) {
    const [decisions, cared] = await Promise.all([safe(getDocs(collection(db, `projects/${pid}/decisions`)).then(rows), []), care]);
    return { followUps: [], escalations: [], decisions, moms: [], ...cared };
  }
  const [followUps, escalations, decisions, moms, cared] = await Promise.all([
    safe(getDocs(query(collection(db, `projects/${pid}/followUps`), orderBy('at', 'desc'), limit(200))).then(rows), []),
    safe(getDocs(collection(db, `projects/${pid}/escalations`)).then(rows), []),
    safe(getDocs(collection(db, `projects/${pid}/decisions`)).then(rows), []),
    safe(getDocs(collection(db, `organizations/${tenantId}/projects/${pid}/moms`)).then(rows), []),
    care,
  ]);
  return {
    ...cared,
    followUps: followUps as FollowUp[],
    escalations: escalations as Escalation[],
    decisions,
    moms: (moms as any[]).map((m) => ({ id: m.id, projectId: pid, projectName: project.name, status: m.status, meetingTitle: m.meetingTitle, momRef: m.momRef, meetingDate: m.meetingDate, raw: m })),
  };
}

/** The whole studio's recent follow-ups, open escalations and minutes awaiting approval: a lead's view. */
export async function loadStudioOps(tenantId: string): Promise<{ followUps: FollowUp[]; escalations: Escalation[]; moms: OpsMom[] }> {
  if (!db) return { followUps: [], escalations: [], moms: [] };
  const since = Date.now() - 120 * DAY;
  const [followUps, escalations, moms] = await Promise.all([
    getDocs(query(collectionGroup(db, 'followUps'), where('tenantId', '==', tenantId), where('at', '>=', since), orderBy('at', 'desc'), limit(1000))).then(rows).catch((e) => { console.warn('Ops Desk follow-ups', e?.code || e); return []; }),
    getDocs(query(collectionGroup(db, 'escalations'), where('tenantId', '==', tenantId), where('status', 'in', ['open', 'decided']))).then(rows).catch((e) => { console.warn('Ops Desk escalations', e?.code || e); return []; }),
    getDocs(query(collectionGroup(db, 'moms'), where('reviewTenantId', '==', tenantId), where('status', '==', 'pending_review'))).then((s) =>
      s.docs.map((d: any) => {
        const m = d.data();
        const pid = m.reviewProjectId || d.ref.parent.parent?.id || '';
        return { id: d.id, projectId: pid, projectName: m.reviewProjectName || '', status: m.status, meetingTitle: m.meetingTitle, momRef: m.momRef, meetingDate: m.meetingDate, raw: { id: d.id, ...m } };
      })).catch((e) => { console.warn('Ops Desk minutes', e?.code || e); return []; }),
  ]);
  /* Revisions answering a client's correction wait for approval too (lib/minutes.ts). */
  const revisions = await revisionsWaiting(tenantId).catch(() => [] as OpsMom[]);
  return { followUps: followUps as FollowUp[], escalations: escalations as Escalation[], moms: [...moms, ...revisions] };
}

export interface NewFollowUp {
  tenantId: string;
  projectId: string;
  projectName: string;
  me: { email: string; name: string };
  channel: Channel;
  outcome: Outcome;
  note: string;
  subject: Subject | null;
  next: NextStep | null;
}

/** Add a line to a project's follow-up log, in the writer's own name. */
export async function logFollowUp(f: NewFollowUp): Promise<FollowUp> {
  const id = newId();
  const line: Omit<FollowUp, 'id'> = {
    tenantId: f.tenantId, projectId: f.projectId, projectName: f.projectName, at: Date.now(),
    by: f.me.email.toLowerCase(), byName: f.me.name, channel: f.channel, note: f.note.slice(0, 2000),
    subject: f.subject, outcome: f.outcome, next: f.next, nextDone: false, manual: true,
  };
  await setDoc(doc(db!, `projects/${f.projectId}/followUps`, id), line);
  return { id, ...line };
}

export async function markNextDone(projectId: string, followUpId: string, me: string): Promise<void> {
  await updateDoc(doc(db!, `projects/${projectId}/followUps`, followUpId), { nextDone: true, nextDoneAt: Date.now(), nextDoneBy: me.toLowerCase() });
}

export interface NewEscalation {
  tenantId: string;
  projectId: string;
  projectName: string;
  me: { email: string; name: string };
  title: string;
  detail: string;
  category: EscalationCategory;
  subjectKey: string | null;
}

export async function raiseEscalation(e: NewEscalation): Promise<void> {
  await setDoc(doc(db!, `projects/${e.projectId}/escalations`, newId()), {
    tenantId: e.tenantId, projectId: e.projectId, projectName: e.projectName, title: e.title.slice(0, 200), detail: e.detail.slice(0, 2000),
    category: e.category, subjectKey: e.subjectKey, raisedBy: e.me.email.toLowerCase(), raisedByName: e.me.name, raisedAt: Date.now(),
    auto: false, status: 'open',
  });
}

export async function decideEscalation(projectId: string, id: string, decision: string, me: { email: string; name: string }): Promise<void> {
  await updateDoc(doc(db!, `projects/${projectId}/escalations`, id), {
    status: 'decided', decision: decision.slice(0, 2000), decidedBy: me.email.toLowerCase(), decidedByName: me.name, decidedAt: Date.now(),
  });
}

export async function closeEscalation(projectId: string, id: string): Promise<void> {
  await updateDoc(doc(db!, `projects/${projectId}/escalations`, id), { status: 'closed', closedAt: Date.now() });
}

/** Run the daily check now, for the signed-in lead's studio. */
export async function runDailyCheckNow(): Promise<number> {
  if (!functions) throw new Error('Cloud functions are not configured.');
  const res: any = await httpsCallable(functions, 'opsDeskCheckNow', { timeout: 120000 })({});
  return Number(res?.data?.raised || 0);
}

/* ── Client care (lib/clientCare.ts) ─────────────────────────────────────── */

/** Save a checklist as it now stands, in this person's name. Only a lead may change its completion (firestore.rules). */
export async function saveChecklist(tenantId: string, project: { id: string; name: string }, c: Checklist, me: { email: string }): Promise<void> {
  await setDoc(doc(db!, `projects/${project.id}/checklists`, c.kind), {
    tenantId, projectId: project.id, projectName: project.name, kind: c.kind,
    items: c.items.map((x) => ({ id: x.id, label: x.label, state: x.state, at: x.at, by: x.by, byName: x.byName, note: x.note, custom: x.custom })),
    completedAt: c.completedAt, completedBy: c.completedBy, completedByName: c.completedByName,
    updatedAt: Date.now(), updatedBy: me.email.toLowerCase(),
  });
}

export type NewVisit = Omit<VisitRequest, 'id'>;
export async function createVisit(v: NewVisit): Promise<string> {
  const id = newId();
  await setDoc(doc(db!, `projects/${v.projectId}/visitRequests`, id), v);
  return id;
}
export type VisitPatch = Partial<Pick<VisitRequest, 'status' | 'slot' | 'reschedules' | 'history' | 'updatedAt' | 'updatedBy' | 'meetUrl' | 'calendarEventId' | 'calendarAccount'>>;
export async function updateVisit(projectId: string, id: string, patch: VisitPatch): Promise<void> {
  await updateDoc(doc(db!, `projects/${projectId}/visitRequests`, id), patch);
}

/**
 * Meetings, site visits and measurements booked on these projects, for the
 * Home widget, with those logged on the project when the studio is known.
 * A project this person may not read is skipped quietly.
 */
export async function loadVisits(projectIds: string[], tenantId?: string): Promise<VisitRequest[]> {
  if (!db) return [];
  const lists = await Promise.all(projectIds.slice(0, 40).map((pid) => Promise.all([
    getDocs(collection(db!, `projects/${pid}/visitRequests`)).then((snap) => rows(snap) as VisitRequest[]).catch(() => [] as VisitRequest[]),
    tenantId ? projectVisits(tenantId, { id: pid, name: '' }).catch(() => [] as VisitRequest[]) : Promise.resolve([] as VisitRequest[]),
  ]).then(([a, b]) => [...a, ...b])));
  return lists.flat();
}

/*
  A request's Google Calendar event, in the calendar of the account it was
  booked from (services/googleCalendarService): created with a Meet link for a
  video call, moved with the request, and taken off when it is cancelled.
  Guests hear about each change from Google.
*/
export interface VisitCalendar { meetUrl: string | null; calendarEventId: string; calendarAccount: string }

const meetOf = (ev: any): string | null =>
  ev?.hangoutLink || (ev?.conferenceData?.entryPoints || []).find((e: any) => e?.entryPointType === 'video')?.uri || null;

export async function bookVisitCalendar(account: string, event: any, withGuests: boolean): Promise<VisitCalendar> {
  const send = withGuests ? 'all' : 'none';
  const made = await callGoogleCalendarAPI('POST', `/calendars/primary/events?conferenceDataVersion=1&sendUpdates=${send}`, event, account);
  let meetUrl = meetOf(made);
  /* Google can take a moment to make the Meet room. */
  if (!meetUrl && event.conferenceData) {
    await new Promise((r) => setTimeout(r, 1500));
    meetUrl = meetOf(await callGoogleCalendarAPI('GET', `/calendars/primary/events/${encodeURIComponent(made.id)}`, undefined, account).catch(() => null));
  }
  return { meetUrl, calendarEventId: String(made.id), calendarAccount: account };
}

export async function moveVisitCalendar(account: string, eventId: string, patch: any): Promise<void> {
  await callGoogleCalendarAPI('PATCH', `/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, patch, account);
}

export async function cancelVisitCalendar(account: string, eventId: string): Promise<void> {
  try {
    await callGoogleCalendarAPI('DELETE', `/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, undefined, account);
  } catch (e: any) {
    /* Already gone from the calendar: nothing left to take off. */
    if (!/API Error: (404|410)\b/.test(String(e?.message || ''))) throw e;
  }
}
