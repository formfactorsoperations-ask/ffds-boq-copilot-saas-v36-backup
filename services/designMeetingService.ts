import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from './firebaseClient';
import { readShape } from '../lib/drawingReview';
import type { ApprovalItem, ChargeStatus, DesignMeeting, LayoutSetup, MeetingChange, PlanBox, RoomOutcome } from '../lib/designMeeting';
import { call } from './drawingReviewService';

/*
  The browser's side of design meetings: it listens, and asks the
  designMeeting function for everything else. The rules refuse a meeting to
  any browser that tries to write one.
*/

type Target = { orgId: string; projectId: string };

/* A pin or box comes back from storage as it was; a meeting never holds a sketch. */
const toMeeting = (id: string, data: any): DesignMeeting => ({
  ...data,
  id,
  rooms: (data?.rooms || []).map((r: any) => ({ ...r, changes: (r.changes || []).map((c: any) => ({ ...c, shape: readShape(c.shape) })) })),
});

/** A project's meetings, newest first, live. */
export function watchMeetings(orgId: string, projectId: string, onChange: (list: DesignMeeting[]) => void, onError?: (e: any) => void) {
  if (!db) return () => undefined;
  return onSnapshot(query(collection(db, `organizations/${orgId}/projects/${projectId}/designMeetings`), orderBy('startedAt', 'desc')),
    (snap) => onChange(snap.docs.map((d) => toMeeting(d.id, d.data()))),
    (e) => onError?.(e));
}

const meet = async (t: Target, data: Record<string, any>) => {
  const res = await call({ ...t, ...data }, 'designMeeting');
  return res?.meeting ? toMeeting(res.meeting.id, res.meeting) : null;
};

export const startMeeting = (t: Target, rooms: string[], attendees: string, layoutDrawingId?: string | null) =>
  meet(t, { action: 'start', rooms, attendees, layoutDrawingId: layoutDrawingId || null });

/** The project's layout plan and where each room is on it, live; null until someone marks it. */
export function watchLayoutSetup(orgId: string, projectId: string, onChange: (s: LayoutSetup | null) => void) {
  if (!db) return () => undefined;
  return onSnapshot(doc(db, `organizations/${orgId}/projects/${projectId}/designLayout/current`),
    (snap) => onChange(snap.exists() ? (snap.data() as LayoutSetup) : null), () => onChange(null));
}

/** Saves where each room is on the layout plan. */
export async function saveLayoutRooms(t: Target, drawingId: string, rooms: Record<string, PlanBox>) {
  return call({ ...t, action: 'layoutRooms', drawingId, rooms }, 'designMeeting');
}
export const decideRoom = (t: Target, meetingId: string, room: string, outcome: RoomOutcome | null, changes: MeetingChange[] = []) =>
  meet(t, { action: 'room', meetingId, room, outcome, changes });
export const closeMeeting = (t: Target, meetingId: string, expectedRev: number, charges: Record<string, 'to_bill' | 'waived'>) =>
  meet(t, { action: 'close', meetingId, expectedRev, charges });
export const cancelMeeting = (t: Target, meetingId: string) => meet(t, { action: 'cancel', meetingId });
/** The client signs the meeting's record on the studio's screen. */
export const signMeeting = (t: Target, meetingId: string, name: string, signature: string) => meet(t, { action: 'sign', meetingId, name, signature });
export const updateCharge = (t: Target, meetingId: string, room: string, patch: { status?: ChargeStatus; fee?: number | string | null; note?: string; ref?: string }) =>
  meet(t, { action: 'charge', meetingId, room, ...patch });

/** The Design Head chooses which Designers may present each drawing: { drawingId: emails }. */
export async function setPresenters(t: Target, drawings: Record<string, string[]>): Promise<Record<string, string[]>> {
  const res = await call({ ...t, action: 'presenters', drawings }, 'designMeeting');
  return res?.presenters || {};
}

/* ------------------------------------------------------------ the client's written approval */

/** Sends the approval email for a held meeting's agreed rooms; the meeting then waits for the client's answer. */
export const sendApproval = (t: Target, meetingId: string, p: { to: string; cc: string; clientName: string; driveLink: string; subject?: string; body?: string }) =>
  call({ ...t, action: 'sendApproval', meetingId, ...p }, 'designMeeting') as Promise<{ sandbox?: boolean }>;

/** Records the client's answer: approved (their reply), changes, or taken as approved once the date in the email passed. */
export const recordApproval = (t: Target, meetingId: string, outcome: 'approved' | 'changes' | 'deemed', note: string, answeredAt?: number) =>
  call({ ...t, action: 'recordApproval', meetingId, outcome, note, answeredAt }, 'designMeeting') as Promise<{ approved: string[]; movedOn: string[] }>;

/** Brings the project's drawings in line with the written-approval rule (designMeeting: reconcile). Writes only what is wrong. */
export const reconcileApprovals = (t: Target) => call({ ...t, action: 'reconcile' }, 'designMeeting') as Promise<{ audience: number; reclaimed: number }>;

/** A project's held meetings waiting on (or done with) the client's written approval, for the Ops Desk. */
export const listApprovals = (t: Target) =>
  call({ ...t, action: 'approvals' }, 'designMeeting').then((r: any) => (r?.items || []) as ApprovalItem[]);

/** A project's client drawings the Design Head approved and the client has not: what can be sent for approval. */
export const listApprovable = (t: Target) =>
  call({ ...t, action: 'approvable' }, 'designMeeting') as Promise<{ projectName: string | null; drawings: { drawingId: string; name: string; room: string; versionNo: number }[] }>;

/** Records drawings shown to the client outside the Studio Desk, so their approval can be asked for. */
export const recordPresentedOutside = (t: Target, drawingIds: string[], how: string, presentedOn: number) =>
  call({ ...t, action: 'presentedOutside', drawingIds, how, presentedOn }, 'designMeeting');
