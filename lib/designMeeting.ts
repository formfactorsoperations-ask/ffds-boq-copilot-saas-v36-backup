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
  /** The client's confirmation of the record, once given. */
  confirmation?: MeetingConfirmation | null;
  /** The approved layout plan shown alongside each room, fixed at the start. */
  layout?: MeetingLayout | null;
  /** When the client opened the meeting's drawings in their portal (server time). */
  views?: { at: number; uid: string }[];
}

/* ------------------------------------------------------------ the layout plan */

/** A room's area on the layout plan, as fractions of the unturned page. */
export interface PlanBox { page: number; x: number; y: number; w: number; h: number }

/** The layout plan a meeting shows beside every room, on the version approved when it started. */
export interface MeetingLayout {
  drawingId: string;
  name: string;
  versionId: string;
  versionNo: number;
  pdfPath: string | null;
  pageCount: number | null;
  /** Where each room is on it, marked once per project. */
  rooms: Record<string, PlanBox>;
}

/** The project's marked rooms: organizations/{org}/projects/{p}/designLayout/current. */
export interface LayoutSetup {
  drawingId: string;
  rooms: Record<string, PlanBox>;
  updatedAt: number;
  updatedBy: ReviewPerson;
}

export const MAX_LAYOUT_ROOMS = 60;

const unit = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 10000) / 10000)) : NaN; };

/** A box that can be drawn: on the page, and big enough to see. */
export function cleanBox(raw: any): PlanBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const x = unit(raw.x), y = unit(raw.y), w = unit(raw.w), h = unit(raw.h);
  const page = Math.floor(Number(raw.page) || 0);
  if ([x, y, w, h].some(Number.isNaN) || w < 0.005 || h < 0.005 || page < 0 || page > 500) return null;
  return { page, x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
}

/** Rooms and their boxes, as the studio marked them; anything unreadable is left out. */
export function cleanRoomBoxes(raw: unknown): Record<string, PlanBox> {
  const out: Record<string, PlanBox> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [name, box] of Object.entries(raw as Record<string, unknown>)) {
    const room = cleanText(name, 80);
    const b = cleanBox(box);
    if (room && b && Object.keys(out).length < MAX_LAYOUT_ROOMS) out[room] = b;
  }
  return out;
}

/** The sheet most likely to be the layout plan, for the picker's first choice. */
export function guessLayout<T extends { name: string; roomName?: string | null }>(sheets: T[]): T | null {
  const score = (d: T) => (/furniture\s*layout|layout\s*plan/i.test(d.name) ? 3 : /layout/i.test(d.name) ? 2 : /\bplan\b/i.test(d.name) && (!d.roomName || /general|project/i.test(d.roomName)) ? 1 : 0);
  const best = [...sheets].sort((a, b) => score(b) - score(a))[0];
  return best && score(best) > 0 ? best : null;
}

/*
  The client confirms what the meeting recorded: in their portal (signed in,
  so the login is the proof), or by signing on the studio's screen. The time,
  and for the portal the address it came from, are the server's.
*/
export interface MeetingConfirmation {
  via: 'portal' | 'studio';
  /** The name the client gave, as they typed it. */
  name: string;
  email: string | null;
  uid: string | null;
  at: number;
  ip?: string | null;
  userAgent?: string | null;
  /** A PNG data URL; only for a signature taken in the studio. */
  signature?: string | null;
  /** Who held the screen for a studio signature. */
  recordedBy?: ReviewPerson | null;
}

export const isConfirmed = (m: Pick<DesignMeeting, 'confirmation'>) => !!m.confirmation?.at;

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

/* ------------------------------------------------------------ confirmation */

/** A typed name, as the client would sign it: 2 to 80 characters, no markup. */
export function cleanSignerName(raw: unknown): string | null {
  const name = String(raw ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return name.length >= 2 && name.length <= 80 ? name : null;
}

export const MAX_SIGNATURE_CHARS = 400_000;

/** A drawn signature: a PNG data URL of a sensible size, or nothing. */
export function cleanSignature(raw: unknown): string | null {
  const s = String(raw ?? '');
  return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length > 200 && s.length <= MAX_SIGNATURE_CHARS ? s : null;
}

/* ------------------------------------------------------------ the client's record */

/*
  A held meeting as the client sees it in the portal: the rooms, the versions
  shown, what they agreed and what they asked to change, and whether they have
  confirmed it. Nothing about billing, the drawings' storage, or who in the
  studio did what beyond the presenter's name crosses.
*/
export interface PortalDesignMeeting {
  id: string;
  heldAt: number;
  attendees: string;
  presentedBy: string;
  rooms: {
    room: string;
    outcome: RoomOutcome;
    sheets: { drawingId: string; name: string; versionNo: number; pageCount: number | null }[];
    changes: string[];
    /** The client's changes where they asked for them, to pin on the drawing. */
    pins: { n: number; drawingId: string; page: number; shape: MarkShape }[];
    /** Where the room is on the layout plan, when it was marked. */
    box: PlanBox | null;
  }[];
  layout: { drawingId: string; name: string; versionNo: number } | null;
  confirmation: { via: 'portal' | 'studio'; name: string; at: number } | null;
}

export const MAX_PORTAL_MEETINGS = 40;

/** Closed meetings, newest first, reduced to what the client may see. */
export function portalDesignRecord(meetings: DesignMeeting[]): PortalDesignMeeting[] {
  return meetings
    .filter((m) => m.state === 'CLOSED')
    .sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
    .slice(0, MAX_PORTAL_MEETINGS)
    .map((m) => ({
      id: m.id,
      heldAt: m.closedAt || m.startedAt,
      attendees: m.attendees || '',
      presentedBy: m.startedBy?.name || '',
      rooms: m.rooms.filter((r) => r.outcome).map((r) => ({
        room: r.room,
        outcome: r.outcome as RoomOutcome,
        sheets: r.sheets.map((s) => ({ drawingId: s.drawingId, name: s.name, versionNo: s.versionNo, pageCount: s.pageCount ?? null })),
        changes: r.outcome === 'changes' ? r.changes.map((c) => c.text) : [],
        pins: r.outcome === 'changes' ? r.changes.map((c) => ({ n: c.n, drawingId: c.drawingId, page: c.page, shape: c.shape })) : [],
        box: m.layout?.rooms?.[r.room] || null,
      })),
      layout: m.layout ? { drawingId: m.layout.drawingId, name: m.layout.name, versionNo: m.layout.versionNo } : null,
      confirmation: m.confirmation?.at ? { via: m.confirmation.via, name: m.confirmation.name, at: m.confirmation.at } : null,
    }));
}

/** How a meeting's confirmation reads in the studio. */
export function confirmationLine(c: MeetingConfirmation | PortalDesignMeeting['confirmation'] | null | undefined, when: (t: number) => string): string {
  if (!c?.at) return 'Waiting for the client to confirm';
  return c.via === 'portal' ? `Confirmed by ${c.name} in the portal, ${when(c.at)}` : `Signed by ${c.name} in the studio, ${when(c.at)}`;
}
