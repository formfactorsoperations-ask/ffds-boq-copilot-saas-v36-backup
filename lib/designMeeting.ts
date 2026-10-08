import { stateOf, guessAudience, cleanShape, cleanText, type MarkShape, type ReviewPerson, type ReviewSummary } from './drawingReview';

/*
  DESIGN MEETINGS: presenting approved rooms to the client.

  Phase 1 ends when the Design Head approves a room's sheets. A meeting takes
  those rooms to the client, one at a time, on the exact versions approved,
  and records for each whether the client agreed or wants changes. Changes go
  to the Design Head first (as notes on the sheet), then back to the designer.

  Each meeting in which the client asks for changes on a room is one revision
  round for that room. The studio's terms include a number of rounds
  (includedRevisionRounds); a round past that is chargeable, unless the
  studio waives it. Chargeable rounds wait in a billing list with a fee.

  Shared by the browser and the designMeeting Cloud Function, which is the
  only writer:
    organizations/{org}/projects/{p}/designMeetings/{meetingId}
*/

export const GENERAL_ROOM = 'General / Project-Wide';
export const DEFAULT_INCLUDED_ROUNDS = 2;
export const MAX_CHANGES_PER_ROOM = 40;

export type MeetingState = 'OPEN' | 'CLOSED' | 'CANCELLED';
export type RoomOutcome = 'agreed' | 'changes';

/** A sheet as it was shown: the version is fixed at the start of the meeting. */
export interface MeetingSheet {
  drawingId: string;
  name: string;
  versionId: string;
  versionNo: number;
  pdfPath: string | null;
  thumbPath: string | null;
  pageCount: number | null;
}

/** One thing the client asked to change, pinned on a sheet (fractions of the unturned page). */
export interface MeetingChange {
  n: number;
  drawingId: string;
  page: number;
  shape: MarkShape;
  text: string;
}

export type ChargeStatus = 'to_bill' | 'billed' | 'waived';

/** A revision round past the included ones: billed with a fee, or waived. */
export interface RoomCharge {
  status: ChargeStatus;
  /** The fee before GST, in rupees, once someone sets it. */
  fee: number | null;
  note: string | null;
  /** The invoice or reference it was billed on. */
  ref: string | null;
  decidedBy: ReviewPerson;
  decidedAt: number;
  updatedBy: ReviewPerson;
  updatedAt: number;
}

export interface MeetingRoom {
  room: string;
  sheets: MeetingSheet[];
  outcome: RoomOutcome | null;
  changes: MeetingChange[];
  /** Set when the meeting closes with changes on this room: its client revision round. */
  round: number;
  charge: RoomCharge | null;
}

export interface DesignMeeting {
  id: string;
  orgId: string;
  projectId: string;
  projectName: string | null;
  state: MeetingState;
  rev: number;
  attendees: string;
  includedRounds: number;
  rooms: MeetingRoom[];
  startedAt: number;
  startedBy: ReviewPerson;
  closedAt: number | null;
  closedBy: ReviewPerson | null;
}

/* ------------------------------------------------------------ rooms ready to present */

export interface RoomDrawing {
  id: string;
  name: string;
  roomName?: string | null;
  review?: Partial<ReviewSummary> | null;
}

export interface PresentableRoom {
  room: string;
  ready: boolean;
  /** Why not, in a line, when it is not ready. */
  why: string;
  /** The client's sheets in the room: the ones a meeting shows. */
  sheets: RoomDrawing[];
}

export const roomOf = (d: { roomName?: string | null }) => d.roomName || GENERAL_ROOM;
const forClient = (d: RoomDrawing) => (d.review?.audience || guessAudience(d.name)) === 'client';

/**
 * Every room with client sheets, and whether it can be presented: all its
 * client sheets approved by the Design Head, and none of them waiting on
 * client changes from an earlier meeting. Studio-only sheets are never shown.
 */
export function presentableRooms(drawings: RoomDrawing[]): PresentableRoom[] {
  const by = new Map<string, RoomDrawing[]>();
  drawings.forEach((d) => by.set(roomOf(d), [...(by.get(roomOf(d)) || []), d]));
  const out: PresentableRoom[] = [];
  by.forEach((list, room) => {
    const sheets = list.filter(forClient).sort((a, b) => a.name.localeCompare(b.name));
    if (!sheets.length) return;
    const blocker = sheets.find((d) => stateOf(d.review as ReviewSummary) !== 'APPROVED' || !d.review?.versionId || d.review?.clientChanges?.pending);
    let why = '';
    if (blocker) {
      const s = stateOf(blocker.review as ReviewSummary);
      why = blocker.review?.clientChanges?.pending ? `${blocker.name} has client changes waiting for the Design Head`
        : s === 'NONE' || !blocker.review?.versionId ? `${blocker.name} has no PDF yet`
        : s === 'IN_REVIEW' ? `${blocker.name} is with the Design Head`
        : s === 'CHANGES_REQUESTED' ? `${blocker.name} is back with the designer`
        : `${blocker.name} is not sent for review yet`;
    }
    out.push({ room, ready: !blocker, why, sheets });
  });
  return out.sort((a, b) => Number(b.ready) - Number(a.ready) || (a.room === GENERAL_ROOM ? 1 : b.room === GENERAL_ROOM ? -1 : a.room.localeCompare(b.room)));
}

/* ------------------------------------------------------------ revision rounds per room */

/** Client revision rounds already used per room: closed meetings where the client asked for changes. */
export function clientRoundsByRoom(meetings: Pick<DesignMeeting, 'state' | 'rooms' | 'id'>[], exceptMeetingId?: string): Record<string, number> {
  const out: Record<string, number> = {};
  meetings.forEach((m) => {
    if (m.state !== 'CLOSED' || m.id === exceptMeetingId) return;
    m.rooms.forEach((r) => { if (r.outcome === 'changes') out[r.room] = (out[r.room] || 0) + 1; });
  });
  return out;
}

/** Rounds the client's terms include: the project's signed terms first, then the studio's, then 2. */
export function includedRoundsFrom(projectDoc?: any, studioTerms?: any): number {
  const pick = [projectDoc?.engagement?.lockedSnapshot?.termsSettings?.includedRevisionRounds, projectDoc?.lockedSnapshot?.termsSettings?.includedRevisionRounds, studioTerms?.includedRevisionRounds]
    .map((v) => Number(v)).find((v) => Number.isFinite(v) && v >= 0);
  return pick === undefined ? DEFAULT_INCLUDED_ROUNDS : Math.min(20, Math.floor(pick));
}

/** A room whose changes start a round past the included ones needs a decision: bill it, or waive it. */
export const isOverIncluded = (round: number, included: number) => round > included;

/* ------------------------------------------------------------ input checks (the function uses these) */

/** The client's changes for one room, checked and numbered; anything not on one of the room's sheets is dropped. */
export function cleanChanges(raw: unknown, sheets: Pick<MeetingSheet, 'drawingId'>[]): MeetingChange[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set(sheets.map((s) => s.drawingId));
  const out: MeetingChange[] = [];
  for (const c of raw.slice(0, MAX_CHANGES_PER_ROOM)) {
    if (!c || typeof c !== 'object' || !ids.has(String((c as any).drawingId))) continue;
    const shape = cleanShape((c as any).shape);
    const text = cleanText((c as any).text, 500);
    /* Pins, boxes and arrows: what a meeting records. A sketch's points cannot be stored inside a meeting. */
    if (!shape || shape.t === 'pen' || !text) continue;
    out.push({ n: out.length + 1, drawingId: String((c as any).drawingId), page: Math.max(0, Math.min(500, Math.floor(Number((c as any).page) || 0))), shape, text });
  }
  return out;
}

export const cleanFee = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? Math.round(n) : null;
};

/* ------------------------------------------------------------ words */

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function meetingSummary(m: Pick<DesignMeeting, 'rooms'>): string {
  const agreed = m.rooms.filter((r) => r.outcome === 'agreed').length;
  const changes = m.rooms.filter((r) => r.outcome === 'changes').length;
  const parts = [agreed ? `${plural(agreed, 'room')} agreed` : '', changes ? `${plural(changes, 'room')} with changes` : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Nothing decided';
}

/** Every chargeable round across a project's meetings, newest first, for the billing list. */
export function revisionCharges(meetings: DesignMeeting[]): { meeting: DesignMeeting; room: MeetingRoom }[] {
  return meetings
    .filter((m) => m.state === 'CLOSED')
    .flatMap((m) => m.rooms.filter((r) => r.charge).map((room) => ({ meeting: m, room })))
    .sort((a, b) => (b.meeting.closedAt || 0) - (a.meeting.closedAt || 0));
}
