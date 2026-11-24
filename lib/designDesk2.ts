import { clientPending, stateOf } from './drawingReview';
import { dueRank, needsMe, type DeskRow, type Viewer } from './designDesk';

/*
  DESIGN DESK 2.0: the plain words on the new desk.

  The new desk says where a drawing is in one sentence, shows it as a short
  row of numbered steps, and offers one main button. These are pure functions
  over the same rows today's desk reads, so the wording can be tested without
  Firebase. Nothing here decides anything about a drawing: lib/drawingReview.ts
  and the drawingReview function do.
*/

/** A desk row with the two tracker facts the steps need (services/drawingReviewService: toDrawing). */
export interface FlowRow extends DeskRow {
  /** When the drawing was finally approved (the client's agreement for a client drawing). */
  approvedAt?: number | null;
  /** 'issued' once the drawing is released for site from the project's Drawings tab. */
  gfcStatus?: string | null;
}

const first = (n?: string | null) => String(n || '').split(/[\s@]/)[0] || 'The designer';
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const isMine = (d: DeskRow, v: Viewer) => !!v.email && d.review?.designer?.email === v.email;
const studioOnly = (d: DeskRow) => d.review?.audience === 'studio';
const issued = (d: FlowRow) => d.gfcStatus === 'issued';

/* ------------------------------------------------------------ steps */

const CLIENT_STEPS = ['Upload the drawing', 'Design Head checks', 'Client approves', 'Sent to site'];
const STUDIO_STEPS = ['Upload the drawing', 'Design Head checks', 'Sent to site'];

export interface Steps {
  labels: string[];
  /** The step the drawing is on now, counted from 0. Equal to labels.length when every step is done. */
  current: number;
}

/**
 * The numbered steps of one drawing. A drawing kept inside the studio has no
 * client step. A drawing sent back for changes is on step one again.
 */
export function stepsOf(d: FlowRow): Steps {
  const labels = studioOnly(d) ? STUDIO_STEPS : CLIENT_STEPS;
  const s = stateOf(d.review);
  if (s === 'NONE' || s === 'DRAFT' || s === 'CHANGES_REQUESTED') return { labels, current: 0 };
  if (s === 'IN_REVIEW' || clientPending(d.review)) return { labels, current: 1 };
  if (issued(d)) return { labels, current: labels.length };
  if (studioOnly(d)) return { labels, current: 2 };
  return { labels, current: d.approvedAt != null ? 3 : 2 };
}

/* ------------------------------------------------------------ where it is, in a sentence */

/** One plain sentence: where the drawing is now and, when it is the viewer's turn, what to do. */
export function whereLine(d: FlowRow, v: Viewer): string {
  const r = d.review;
  const s = stateOf(r);
  const mine = isMine(d, v);
  const who = first(r?.designer?.name);
  if (s === 'NONE') return 'Nobody has uploaded this drawing yet.';
  if (s === 'DRAFT') return mine ? 'You uploaded it. Send it to the Design Head.' : `${who} uploaded it and has not sent it yet.`;
  if (s === 'IN_REVIEW') {
    if (v.reviewer) return mine ? 'Your own drawing is waiting for your check.' : `${who} sent this for you to check.`;
    return 'The Design Head is checking it.';
  }
  if (s === 'CHANGES_REQUESTED') {
    const n = r?.marksOpen || 0;
    if (mine) return n ? `The Design Head asked for ${plural(n, 'change')}. Make them and upload it again.` : 'The Design Head sent it back. Read the message and upload it again.';
    return n ? `${who} is making ${plural(n, 'change')}.` : `${who} is working on it again.`;
  }
  if (clientPending(r)) {
    const n = r?.clientChanges?.count || 0;
    return v.reviewer
      ? `The client asked for ${n ? plural(n, 'change') : 'changes'} at the meeting. Decide what goes to ${mine ? 'you' : who}.`
      : 'The client asked for changes. The Design Head looks at them first.';
  }
  if (issued(d)) return 'Sent to site.';
  if (studioOnly(d)) return 'Approved. It stays inside the studio and can go to site.';
  return d.approvedAt != null ? 'The client approved it. It can go to site.' : 'Approved in the studio. Show it to the client at the next meeting.';
}

/** Who has the drawing now: 'You', a first name, 'Design Head', 'Client', 'Ready for site', 'Sent to site', or null when nobody has started. */
export function holderOf(d: FlowRow, v: Viewer): string | null {
  const s = stateOf(d.review);
  if (s === 'NONE') return null;
  if (needsMe(d, v)) return 'You';
  if (s === 'DRAFT' || s === 'CHANGES_REQUESTED') return first(d.review?.designer?.name);
  if (s === 'IN_REVIEW' || clientPending(d.review)) return 'Design Head';
  if (issued(d)) return 'Sent to site';
  if (studioOnly(d) || d.approvedAt != null) return 'Ready for site';
  return 'Client';
}

/* ------------------------------------------------------------ the one main button */

export type MainKind = 'check' | 'client' | 'fix' | 'send' | 'upload' | 'open';
export interface MainAction { kind: MainKind; label: string; primary: boolean }

/** The one button a drawing shows. `uploader` is whether this person may upload at all. */
export function mainAction(d: FlowRow, v: Viewer, uploader: boolean): MainAction {
  const s = stateOf(d.review);
  if (v.reviewer && s === 'IN_REVIEW') return { kind: 'check', label: 'Check this drawing', primary: true };
  if (v.reviewer && clientPending(d.review)) return { kind: 'client', label: "See the client's changes", primary: true };
  if (isMine(d, v) && s === 'CHANGES_REQUESTED') return { kind: 'fix', label: 'Fix and upload again', primary: true };
  if (isMine(d, v) && s === 'DRAFT') return { kind: 'send', label: 'Send to the Design Head', primary: true };
  if (s === 'NONE' && uploader) return { kind: 'upload', label: 'Upload the drawing', primary: false };
  return { kind: 'open', label: 'Open', primary: false };
}

/* ------------------------------------------------------------ Home */

const byUrgency = (a: FlowRow, b: FlowRow) => dueRank(a) - dueRank(b) || (a.review?.submittedAt || a.review?.updatedAt || 0) - (b.review?.submittedAt || b.review?.updatedAt || 0);

export interface HomeLists<T extends FlowRow> {
  /** The first thing to do, the most urgent of `todo`. */
  start: T | null;
  /** Everything else waiting on this person. */
  todo: T[];
  /** Drawings moving without this person: who has them is in holderOf. */
  waiting: T[];
}

/**
 * Home's three lists. "Waiting for someone else" is what this person cares
 * about but cannot move: for the Design Head, drawings back with designers or
 * with the client; for a designer, their own drawings with the Design Head or
 * the client.
 */
export function homeLists<T extends FlowRow>(rows: T[], v: Viewer, limit = 6): HomeLists<T> {
  const mineNow = rows.filter((d) => needsMe(d, v)).sort(byUrgency);
  const waiting = rows.filter((d) => {
    if (needsMe(d, v)) return false;
    const s = stateOf(d.review);
    if (s === 'NONE' || issued(d)) return false;
    const withClient = s === 'APPROVED' && !studioOnly(d) && d.approvedAt == null && !clientPending(d.review);
    if (v.reviewer) return s === 'CHANGES_REQUESTED' || s === 'DRAFT' || withClient;
    return isMine(d, v) && (s === 'IN_REVIEW' || withClient || clientPending(d.review));
  }).sort(byUrgency).slice(0, limit);
  return { start: mineNow[0] || null, todo: mineNow.slice(1), waiting };
}

/** "Good morning", by the clock on this device. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
