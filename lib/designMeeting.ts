import { hasRole, type RoleSet } from './roles';
import { stateOf, guessAudience, cleanShape, cleanText, type MarkShape, type ReviewPerson, type ReviewSummary, type ClientAgreement } from './drawingReview';

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
  /** The client's written approval of the rooms they agreed, asked for by email after the meeting. */
  approval?: ClientApproval | null;
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
  /** The approved client sheets in the room: the ones a meeting shows. */
  sheets: RoomDrawing[];
  /** The room's other client sheets, not approved yet: left out of a meeting until they are. */
  later: RoomDrawing[];
}

export const roomOf = (d: { roomName?: string | null }) => d.roomName || GENERAL_ROOM;
/** A drawing the client is shown (studio-only sheets never are). */
export const isClientSheet = (d: RoomDrawing) => (d.review?.audience || guessAudience(d.name)) === 'client';
const forClient = isClientSheet;
const approved = (d: RoomDrawing) => stateOf(d.review as ReviewSummary) === 'APPROVED' && !!d.review?.versionId;

/** A client sheet's state, in a line, for a room that cannot be presented yet. */
function notReady(d: RoomDrawing): string {
  const s = stateOf(d.review as ReviewSummary);
  return d.review?.clientChanges?.pending ? `${d.name} has client changes waiting for the Design Head`
    : s === 'NONE' || !d.review?.versionId ? `${d.name} has no PDF yet`
    : s === 'IN_REVIEW' ? `${d.name} is with the Design Head`
    : s === 'CHANGES_REQUESTED' ? `${d.name} is back with the designer`
    : `${d.name} is not sent for review yet`;
}

/** The Designer may present this sheet: the Design Head put their email on it. */
export const mayPresent = (d: { review?: Partial<ReviewSummary> | null }, email: string | null | undefined) =>
  !!email && (d.review?.presenters || []).map((e) => String(e).toLowerCase()).includes(email.toLowerCase());

/**
 * Every room with client sheets, and whether it can be presented: at least
 * one client sheet approved by the Design Head, and none of them waiting on
 * client changes from an earlier meeting. A meeting shows the approved
 * sheets; the rest (not started, or still with the designer or the Design
 * Head) wait for a later meeting, so a sheet nobody has drawn yet does not
 * hold back the ones that are signed off. Studio-only sheets are never shown.
 *
 * For a Designer presenting (`presenter`, their email), only the approved
 * sheets the Design Head assigned to them count; the room's other approved
 * sheets wait for a meeting the Design Head runs.
 */
export function presentableRooms(drawings: RoomDrawing[], presenter?: string | null): PresentableRoom[] {
  const by = new Map<string, RoomDrawing[]>();
  drawings.forEach((d) => by.set(roomOf(d), [...(by.get(roomOf(d)) || []), d]));
  const out: PresentableRoom[] = [];
  by.forEach((list, room) => {
    const client = list.filter(forClient).sort((a, b) => a.name.localeCompare(b.name));
    if (!client.length) return;
    const pending = client.find((d) => d.review?.clientChanges?.pending);
    const signedOff = pending ? [] : client.filter(approved);
    const sheets = presenter ? signedOff.filter((d) => mayPresent(d, presenter)) : signedOff;
    const later = client.filter((d) => !sheets.includes(d));
    const ready = sheets.length > 0;
    const why = ready ? ''
      : signedOff.length ? 'The Design Head has not given you a drawing here to present'
      : notReady(pending || later[0]);
    out.push({ room, ready, why, sheets, later });
  });
  return out.sort((a, b) => Number(b.ready) - Number(a.ready) || (a.room === GENERAL_ROOM ? 1 : b.room === GENERAL_ROOM ? -1 : a.room.localeCompare(b.room)));
}

/** Emails the Design Head may let present a sheet: the project's own Designers, at most 10. */
export function cleanPresenters(raw: unknown, allowed: string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const ok = new Set(allowed.map((e) => String(e).trim().toLowerCase()));
  return [...new Set(raw.map((e) => String(e ?? '').trim().toLowerCase()))].filter((e) => ok.has(e)).slice(0, 10);
}

/**
 * Who may carry on a meeting (mark rooms, finish, cancel, take the client's
 * signature): whoever started it, and the Design Head or a lead on any.
 */
export const mayRunThis = (m: Pick<DesignMeeting, 'startedBy'>, who: { uid: string; lead: boolean }) =>
  who.lead || (!!who.uid && m.startedBy?.uid === who.uid);

/* ------------------------------------------------------------ the client's written approval */

/*
  AGREED IN THE MEETING IS NOT APPROVED.

  The client nods a room through at the design meeting; the studio then asks
  for their approval in writing, by email, and the drawings are approved only
  when it comes back. So a held meeting with agreed rooms waits for that
  answer:

    awaiting   the meeting is held; the approval email goes out next, then
               reminders on working days 3 and 5 after it was sent;
    approved   the client replied "Approved" (recorded by the studio, with
               their reply), or signed the record on the studio's screen or
               in the portal;
    deemed     no answer by the date in the email (5 working days), and the
               Design Head chose to take the drawings as approved, as the
               email said the studio would;
    changes    the client wrote back asking for changes.

  Only approved and deemed approve the drawings in the Drawings table, and
  only on the versions the client was shown (lib/drawingReview:
  finalApprovalAt). Written by the designMeeting function only.
*/

export type ApprovalStatus = 'awaiting' | 'approved' | 'deemed' | 'changes';
export type ApprovalVia = 'email' | 'signature' | 'portal' | 'deemed';

export interface ClientApproval {
  status: ApprovalStatus;
  /** When the approval email went, to whom, and the Drive folder it pointed at. */
  sentAt: number | null;
  sentBy: ReviewPerson | null;
  sentTo: string[];
  /** Copied on the email and the reminders: the sender, and anyone they added. */
  cc?: string[];
  /** How the email greeted the client, and the studio's name it signed with; the reminders say the same. */
  clientName?: string | null;
  studioName?: string | null;
  driveLink: string | null;
  /** The date given in the email: the end of the 5th working day after it was sent. */
  dueAt: number | null;
  /** When each reminder went (working days 3 and 5). */
  reminders: number[];
  /** When the client answered (the date on their reply), and how. */
  answeredAt: number | null;
  via: ApprovalVia | null;
  /** The client's reply, as pasted by the studio. */
  note: string | null;
  recordedBy: ReviewPerson | null;
  recordedAt: number | null;
}

/** Working days the client has to answer, and the working days the reminders go on. */
export const APPROVAL_WORKING_DAYS = 5;
export const REMINDER_WORKING_DAYS = [3, 5] as const;

/*
  Working days are Monday to Saturday, counted in India's time (the studio's
  week): a meeting emailed on Saturday has its first working day on Monday.
*/
const IST = 330 * 60_000;
const DAY = 86_400_000;
const istDay = (t: number) => Math.floor((t + IST) / DAY);
const isSunday = (day: number) => new Date(day * DAY).getUTCDay() === 0;

/** The end (23:59:59.999 in India) of the nth working day after `from`. */
export function addWorkingDays(from: number, n: number): number {
  let day = istDay(from);
  let left = n;
  while (left > 0) { day += 1; if (!isSunday(day)) left -= 1; }
  return (day + 1) * DAY - IST - 1;
}

/** Working days gone since `from`, not counting the day it happened. */
export function workingDaysSince(from: number, now: number): number {
  let n = 0;
  for (let day = istDay(from) + 1; day <= istDay(now); day++) if (!isSunday(day)) n++;
  return n;
}

/**
 * Who sends the approval email and records the client's answer, besides the
 * Design Head and whoever presented the meeting: operations. Client Relations
 * on the projects assigned to them (the Ops Desk), the Ops Director on any.
 */
export const APPROVAL_SENDER_ROLES = new Set(['Ops Director', 'Client Relations']);
export const sendsApprovals = (roles?: RoleSet) => hasRole(roles, APPROVAL_SENDER_ROLES);

/** A held meeting's approval as operations sees it on the Ops Desk: no billing, no pins, no files. */
export interface ApprovalItem {
  meetingId: string;
  projectId: string;
  projectName: string;
  closedAt: number;
  presentedBy: string;
  sheets: { room: string; name: string; drawingId: string; versionNo: number }[];
  approval: ClientApproval | null;
  confirmation: Pick<MeetingConfirmation, 'via' | 'name' | 'at'> | null;
  contact: { name: string; email: string; studio: string };
}

export const blankApproval = (): ClientApproval => ({
  status: 'awaiting', sentAt: null, sentBy: null, sentTo: [], driveLink: null, dueAt: null,
  reminders: [], answeredAt: null, via: null, note: null, recordedBy: null, recordedAt: null,
});

/** Whether a meeting asks for the client's approval at all: it is held and the client agreed at least one room. */
export const needsApproval = (m: Pick<DesignMeeting, 'state' | 'rooms'>) => m.state === 'CLOSED' && m.rooms.some((r) => r.outcome === 'agreed');

/**
 * When the client approved the meeting's agreed rooms, or null. A signature
 * on the record (in the studio or the portal) is an approval in writing too.
 */
export function approvalAt(m: Pick<DesignMeeting, 'approval' | 'confirmation'>): number | null {
  const a = m.approval;
  if (a && (a.status === 'approved' || a.status === 'deemed')) return a.answeredAt || a.recordedAt || null;
  if (a?.status === 'changes') return null;
  return m.confirmation?.at || null;
}

export type ApprovalStage = 'presented' | 'sent' | 'overdue' | 'approved' | 'changes';

/** Where a held meeting's approval stands, for the studio's screens. */
export function approvalStage(m: Pick<DesignMeeting, 'approval' | 'confirmation'>, now = Date.now()): ApprovalStage {
  if (approvalAt(m) != null) return 'approved';
  const a = m.approval;
  if (a?.status === 'changes') return 'changes';
  if (!a?.sentAt) return 'presented';
  return a.dueAt && now > a.dueAt ? 'overdue' : 'sent';
}

/** Which reminder is due now (0 for the first, 1 for the second), or null. One at a time, never twice. */
export function reminderDue(a: ClientApproval | null | undefined, now = Date.now()): number | null {
  if (!a || a.status !== 'awaiting' || !a.sentAt) return null;
  const sent = a.reminders?.length || 0;
  if (sent >= REMINDER_WORKING_DAYS.length) return null;
  return workingDaysSince(a.sentAt, now) >= REMINDER_WORKING_DAYS[sent] ? sent : null;
}

/** May the Design Head take the drawings as approved: the date in the email has passed with no answer. */
export const mayDeem = (a: ClientApproval | null | undefined, now = Date.now()) =>
  !!a && a.status === 'awaiting' && !!a.dueAt && now > a.dueAt;

/**
 * Each sheet the client approved in writing, on the version they were shown:
 * the latest approval per drawing. The Drawings table reads it to count a
 * client drawing as approved (lib/drawingReview: finalApprovalAt). Agreeing
 * at the meeting alone is not enough.
 */
export function agreementsFrom(meetings: Pick<DesignMeeting, 'state' | 'rooms' | 'id' | 'closedAt' | 'approval' | 'confirmation'>[]): Record<string, ClientAgreement> {
  const out: Record<string, ClientAgreement> = {};
  meetings.forEach((m) => {
    if (m.state !== 'CLOSED' || !m.closedAt) return;
    const at = approvalAt(m);
    if (at == null) return;
    m.rooms.forEach((r) => {
      if (r.outcome !== 'agreed') return;
      r.sheets.forEach((sh) => {
        if (!out[sh.drawingId] || out[sh.drawingId].at < at) out[sh.drawingId] = { meetingId: m.id, at, versionNo: sh.versionNo };
      });
    });
  });
  return out;
}

/** A sheet agreed at a meeting whose written approval has not come back. */
export interface AwaitingClient {
  meetingId: string;
  versionNo: number;
  stage: Exclude<ApprovalStage, 'approved'>;
  sentAt: number | null;
  dueAt: number | null;
  /** Working days since the email went. */
  days: number;
}

/** Per drawing, the latest held meeting that agreed it and is still waiting for the client's approval. */
export function awaitingFrom(meetings: Pick<DesignMeeting, 'state' | 'rooms' | 'id' | 'closedAt' | 'approval' | 'confirmation'>[], now = Date.now()): Record<string, AwaitingClient> {
  const latest: Record<string, { at: number; m: typeof meetings[number]; versionNo: number }> = {};
  meetings.forEach((m) => {
    if (m.state !== 'CLOSED' || !m.closedAt) return;
    m.rooms.forEach((r) => {
      if (r.outcome !== 'agreed') return;
      r.sheets.forEach((sh) => {
        if (!latest[sh.drawingId] || latest[sh.drawingId].at < m.closedAt!) latest[sh.drawingId] = { at: m.closedAt!, m, versionNo: sh.versionNo };
      });
    });
  });
  const out: Record<string, AwaitingClient> = {};
  Object.entries(latest).forEach(([id, { m, versionNo }]) => {
    const stage = approvalStage(m, now);
    if (stage === 'approved') return;
    const a = m.approval;
    out[id] = { meetingId: m.id, versionNo, stage, sentAt: a?.sentAt || null, dueAt: a?.dueAt || null, days: a?.sentAt ? workingDaysSince(a.sentAt, now) : 0 };
  });
  return out;
}

/* ------------------------------------------------------------ the approval email */

/** The drawings a meeting asks the client to approve: the agreed rooms' sheets, in the meeting's order. */
export function approvalSheets(m: Pick<DesignMeeting, 'rooms'>): { room: string; name: string; drawingId: string; versionNo: number }[] {
  return m.rooms.filter((r) => r.outcome === 'agreed')
    .flatMap((r) => r.sheets.map((sh) => ({ room: r.room, name: sh.name, drawingId: sh.drawingId, versionNo: sh.versionNo })));
}

/** "Master Bedroom – Wardrobe detail": the room first, unless the drawing's name already says it. */
export function sheetLine(room: string, name: string): string {
  if (room === GENERAL_ROOM || name.toLowerCase().includes(room.toLowerCase())) return name;
  return `${room} – ${name}`;
}

/** "Fri, 13 Nov 2026", in India's time: the date the client answers by. */
export function approvalDate(t: number): string {
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'Asia/Kolkata' }).format(t);
  return `${part({ weekday: 'short' })}, ${part({ day: 'numeric' })} ${part({ month: 'short' })} ${part({ year: 'numeric' })}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface ApprovalEmailInput {
  kind: 'request' | 'reminder';
  /** 0 for the first reminder, 1 for the last one. */
  reminder?: number;
  clientName: string;
  projectName: string;
  sheets: { room: string; name: string }[];
  driveLink: string | null;
  dueAt: number;
  senderName: string;
  studioName: string;
}

/*
  The studio's own approval email, as the studio writes it after a design
  meeting, with the date the client has to answer by. The reminders say the
  same, shorter. Plain HTML, so it reads the same in every mail app.
*/
export function approvalEmail(i: ApprovalEmailInput): { subject: string; html: string; text: string } {
  const last = i.kind === 'reminder' && i.reminder === REMINDER_WORKING_DAYS.length - 1;
  const due = approvalDate(i.dueAt);
  const subject = i.kind === 'request'
    ? `Drawings for approval – ${i.projectName}`
    : `${last ? 'Final reminder' : 'Reminder'}: drawings for approval – ${i.projectName}`;
  const lines = i.sheets.map((s) => sheetLine(s.room, s.name));
  const intro = i.kind === 'request'
    ? ['Thank you for your time during our recent design review meeting.', 'As discussed, we request you to review the following drawings and share any feedback or revisions, if required.']
    : [last
        ? `This is a final reminder that the drawings below are awaiting your approval. We need your response by today, ${due}.`
        : `A gentle reminder that the drawings below, shared after our design review meeting, are awaiting your approval.`];
  const deadline = `If we do not hear from you by ${due}, we will take the above drawings as approved and proceed with the next design stages.`;
  const outro = [
    'If everything is in order, kindly reply to this email with “Approved” to confirm your formal sign-off on the above drawings.',
    deadline,
    'Your approval will help us proceed with the subsequent design stages as planned. Any changes requested after approval will be reviewed separately for their impact on scope, timelines and applicable revision charges.',
    'Thank you for your continued trust and cooperation.',
  ];
  const sign = [i.senderName, i.studioName].filter(Boolean);

  const p = (t: string) => `<p style="margin:0 0 14px">${esc(t)}</p>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#17191E">`
    + p(`Hi ${i.clientName},`)
    + intro.map(p).join('')
    + `<p style="margin:0 0 6px"><b>Drawings for Approval:</b></p>`
    + `<ol style="margin:0 0 14px;padding-left:28px">${lines.map((l) => `<li style="margin:0 0 6px">${esc(l)}</li>`).join('')}</ol>`
    + (i.driveLink ? `<p style="margin:0 0 14px">You can access the latest drawings here: <a href="${esc(i.driveLink)}">${esc(i.driveLink)}</a></p>` : '')
    + outro.map(p).join('')
    + (sign.length ? `<p style="margin:0">Warm regards,<br>${sign.map(esc).join('<br>')}</p>` : '')
    + `</div>`;
  /* The list and the sign-off each stay one block, so the text reads (and edits) like the email. */
  const text = [`Hi ${i.clientName},`, ...intro, ['Drawings for Approval:', ...lines.map((l, k) => `${k + 1}. ${l}`)].join('\n'),
    ...(i.driveLink ? [`You can access the latest drawings here: ${i.driveLink}`] : []), ...outro, ...(sign.length ? [['Warm regards,', ...sign].join('\n')] : [])].join('\n\n');
  return { subject, html, text };
}

/*
  THE EMAIL, AS THE STUDIO EDITED IT.

  The send form starts from approvalEmail's wording, and the sender may change
  any of it. What comes back is plain text: it is escaped here, paragraphs
  come from blank lines, line breaks are kept, and web addresses become links,
  so nothing typed can put markup into a client's inbox.
*/
export const MAX_EMAIL_SUBJECT = 200;
export const MAX_EMAIL_BODY = 8000;

export function cleanEmailText(raw: unknown, max = MAX_EMAIL_BODY): string {
  return String(raw ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}

export const cleanEmailSubject = (raw: unknown) => cleanEmailText(raw, MAX_EMAIL_SUBJECT).replace(/\s+/g, ' ');

/** Plain text to the email's HTML: escaped, paragraphs on blank lines, links made clickable. */
export function textEmailHtml(text: string): string {
  const link = (s: string) => s.replace(/https:\/\/[^\s<>"]+/g, (u) => {
    const trail = /[.,;:)]+$/.exec(u)?.[0] || '';
    const url = trail ? u.slice(0, -trail.length) : u;
    return `<a href="${url}">${url}</a>${trail}`;
  });
  const paras = cleanEmailText(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#17191E">`
    + paras.map((p) => `<p style="margin:0 0 14px">${p.split('\n').map((l) => link(esc(l))).join('<br>')}</p>`).join('')
    + `</div>`;
}

/** Up to ten valid addresses, from a list or a comma-separated line; null when one is not an address. */
export function cleanEmails(raw: unknown, max = 10): string[] | null {
  const list = (Array.isArray(raw) ? raw : String(raw ?? '').split(/[,;\s]+/)).map((e) => String(e ?? '').trim().toLowerCase()).filter(Boolean);
  const ok = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  if (list.some((e) => !ok.test(e))) return null;
  return [...new Set(list)].slice(0, max);
}

/** A link the email may carry: https only. */
export function cleanLink(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && s.length <= 500 ? u.toString() : null;
  } catch {
    return null;
  }
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
