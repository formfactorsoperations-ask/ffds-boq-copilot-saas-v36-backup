import { stateOf, guessAudience, type ReviewState, type ReviewSummary } from './drawingReview';

/*
  DESIGN DESK: what each person should look at first.

  Pure functions over the drawings the desk already has (the studio's
  reviewed sheets, plus the open project's whole tracker), so the screens
  stay simple and the rules can be tested without Firebase. Nothing here
  decides anything about a sheet: lib/drawingReview.ts and the function do.
*/

export interface DeskRow {
  id: string;
  projectId: string;
  name: string;
  roomName?: string | null;
  targetDate?: string;
  review?: ReviewSummary;
}

export interface Viewer {
  reviewer: boolean;
  email: string;
}

export type DeskState = ReviewState | 'NONE';

/* ------------------------------------------------------------ due dates */

/*
  How close a drawing is to its target date. `rank` sorts the urgent first:
  0 overdue, 1 due within 3 days, 2 within a week, 3 later, 4 no date.
*/
export type Due = { rank: number; label: string; tone: 'late' | 'soon' | 'week' | 'later' } | null;
export function dueOf(targetDate?: string | null, now = new Date()): Due {
  if (!targetDate) return null;
  const t = new Date(targetDate);
  if (Number.isNaN(t.getTime())) return null;
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((day(t) - day(now)) / 86_400_000);
  const date = t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (days < 0) return { rank: 0, tone: 'late', label: `Overdue ${-days} d` };
  if (days === 0) return { rank: 1, tone: 'soon', label: 'Due today' };
  if (days === 1) return { rank: 1, tone: 'soon', label: 'Due tomorrow' };
  if (days <= 3) return { rank: 1, tone: 'soon', label: `Due ${t.toLocaleDateString('en-IN', { weekday: 'short' })}` };
  if (days <= 7) return { rank: 2, tone: 'week', label: `Due ${t.toLocaleDateString('en-IN', { weekday: 'short' })} ${date}` };
  return { rank: 3, tone: 'later', label: `Due ${date}` };
}
export const dueRank = (d: { targetDate?: string }, now?: Date) => dueOf(d.targetDate, now)?.rank ?? 4;

/*
  REVISION WATCH. Each send to the Design Head opens a review round; the
  studio's terms include two, so a sheet on its third round or later is
  flagged before the extra rounds turn into chargeable revisions. A sheet
  that came back is about to start its next round, so it counts that one.
*/
export const INCLUDED_ROUNDS = 2;
export function roundWarn(r?: ReviewSummary | null): number {
  if (!r || r.state === 'APPROVED') return 0;
  const round = (r.attempts || 0) + (r.state === 'CHANGES_REQUESTED' ? 1 : 0);
  return round > INCLUDED_ROUNDS ? round : 0;
}

/* ------------------------------------------------------------ who needs what */

const mine = (d: DeskRow, v: Viewer) => !!v.email && d.review?.designer?.email === v.email;

/** Something this person should act on now. */
export function needsMe(d: DeskRow, v: Viewer): boolean {
  const s = stateOf(d.review);
  if (v.reviewer && s === 'IN_REVIEW') return true;
  /* The client's changes from a design meeting wait for the Design Head before they go to the designer. */
  if (v.reviewer && s === 'APPROVED' && d.review?.clientChanges?.pending) return true;
  return mine(d, v) && (s === 'CHANGES_REQUESTED' || s === 'DRAFT');
}

export const attention = (rows: DeskRow[], v: Viewer) => rows.filter((d) => needsMe(d, v)).length;

/** Sheets waiting for review, the overdue first and then the oldest. */
export function reviewQueue(rows: DeskRow[], projectId: string | null = null, now?: Date): DeskRow[] {
  return rows
    .filter((d) => stateOf(d.review) === 'IN_REVIEW' && (!projectId || d.projectId === projectId))
    .sort((a, b) => Math.min(dueRank(a, now), 1) - Math.min(dueRank(b, now), 1) || (a.review?.submittedAt || 0) - (b.review?.submittedAt || 0));
}

export interface Stats { total: number; approved: number; review: number; changes: number; draft: number; none: number }
export function statsOf(rows: DeskRow[]): Stats {
  const s: Stats = { total: rows.length, approved: 0, review: 0, changes: 0, draft: 0, none: 0 };
  rows.forEach((d) => {
    const k = stateOf(d.review);
    if (k === 'APPROVED') s.approved++;
    else if (k === 'IN_REVIEW') s.review++;
    else if (k === 'CHANGES_REQUESTED') s.changes++;
    else if (k === 'DRAFT') s.draft++;
    else s.none++;
  });
  return s;
}

/* ------------------------------------------------------------ rooms */

export const GENERAL_ROOM = 'General / Project-Wide';
export const roomOf = (d: DeskRow) => d.roomName || GENERAL_ROOM;

/** Rooms where every client sheet is approved: ready to show in the design meeting. */
export function readyRooms(rows: DeskRow[]): { projectId: string; room: string }[] {
  const groups = new Map<string, DeskRow[]>();
  rows.forEach((d) => { const k = `${d.projectId}\u0000${roomOf(d)}`; groups.set(k, [...(groups.get(k) || []), d]); });
  const out: { projectId: string; room: string }[] = [];
  groups.forEach((list, k) => {
    const client = list.filter((d) => (d.review?.audience || guessAudience(d.name)) === 'client');
    if (client.length && client.every((d) => stateOf(d.review) === 'APPROVED')) {
      const [projectId, room] = k.split('\u0000');
      out.push({ projectId, room });
    }
  });
  return out;
}

/* ------------------------------------------------------------ search */

export function matchesQuery(d: DeskRow, q: string, projectName = ''): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const hay = `${d.name} ${d.roomName || ''} ${d.review?.designer?.name || ''} ${projectName}`.toLowerCase();
  return t.split(/\s+/).every((w) => hay.includes(w));
}

/* ------------------------------------------------------------ projects */

const PALETTE: [string, string][] = [
  ['#0F5F73', '#E4F0F3'], ['#7A3E8F', '#F3EAF6'], ['#1D63A8', '#E6EFF8'], ['#3B7A35', '#E9F3E7'],
  ['#A8406A', '#F8E9EF'], ['#8A5A1F', '#F5EDE2'], ['#475467', '#ECEEF1'], ['#B04A22', '#F8EBE5'],
];

/** A steady colour and two-letter mark per project, so it is recognisable everywhere it appears. */
export function projectLook(id: string, name: string): { code: string; color: string; soft: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const [color, soft] = PALETTE[h % PALETTE.length];
  const words = name.replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const code = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
  return { code, color, soft };
}

/**
 * The switcher's order: pinned first, then the projects waiting on this
 * person (busiest first), then the rest by when they were last opened.
 */
export function switcherGroups(ids: string[], opts: { pinned: string[]; recent: string[]; need: (id: string) => number }) {
  const rank = (id: string) => { const i = opts.recent.indexOf(id); return i < 0 ? 999 : i; };
  const pinned = ids.filter((id) => opts.pinned.includes(id));
  const needs = ids.filter((id) => !pinned.includes(id) && opts.need(id) > 0).sort((a, b) => opts.need(b) - opts.need(a) || rank(a) - rank(b));
  const rest = ids.filter((id) => !pinned.includes(id) && !needs.includes(id)).sort((a, b) => rank(a) - rank(b));
  return { pinned, needs, rest };
}

export const pushRecent = (recent: string[], id: string, keep = 8) => [id, ...recent.filter((x) => x !== id)].slice(0, keep);

/* ------------------------------------------------------------ suggestions */

export type SuggestionKind = 'overdue' | 'round' | 'stale' | 'notStarted' | 'present' | 'openNotes' | 'readyDue' | 'waitingLate' | 'elsewhere';

export interface Suggestion {
  /** Changes when the underlying sheet moves, so a dismissed card comes back only when there is something new. */
  key: string;
  kind: SuggestionKind;
  tone: 'red' | 'amber' | 'indigo' | 'green' | 'grey';
  title: string;
  sub: string;
  row?: DeskRow;
  projectId?: string;
  room?: string;
}

const STALE_DAYS = 3;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const lower = (s: string) => s.replace(/^\w/, (c) => c.toLowerCase());
const first = (n?: string | null) => String(n || '').split(/[\s@]/)[0] || 'the designer';

/**
 * "Worth a look": up to `limit` short cards, picked from deadlines, review
 * rounds and rooms. `scope` is the rows of the project being looked at (or
 * every project); `all` is everything the desk knows, for "elsewhere".
 */
export function suggestions(input: {
  scope: DeskRow[];
  all: DeskRow[];
  viewer: Viewer;
  projectName: (id: string) => string;
  inScope: (d: DeskRow) => boolean;
  now?: number;
  limit?: number;
  /** Cards this person has put away; the next ones take their place. */
  isDismissed?: (key: string) => boolean;
}): Suggestion[] {
  const { scope, all, viewer, projectName, inScope } = input;
  const now = input.now ?? Date.now();
  const nowDate = new Date(now);
  const rev = (d: DeskRow) => `${d.projectId}/${d.id}:${d.review?.rev ?? 0}`;
  const out: Suggestion[] = [];

  if (viewer.reviewer) {
    const queue = reviewQueue(scope, null, nowDate);
    const late = queue.filter((d) => dueRank(d, nowDate) === 0);
    if (late[0]) {
      const d = late[0];
      out.push({ key: `overdue:${rev(d)}`, kind: 'overdue', tone: 'red', row: d,
        title: `${d.name} is ${lower(dueOf(d.targetDate, nowDate)!.label)}`,
        sub: `${first(d.review?.designer?.name)} sent it for review.${late.length > 1 ? ` ${plural(late.length - 1, 'more sheet')} also overdue.` : ' It is first in your queue.'}` });
    }
    const rd = queue.find((d) => roundWarn(d.review));
    if (rd) out.push({ key: `round:${rev(rd)}`, kind: 'round', tone: 'amber', row: rd,
      title: `${rd.name} is on round ${roundWarn(rd.review)}`,
      sub: `${INCLUDED_ROUNDS} rounds are included. A short call with ${first(rd.review?.designer?.name)} may settle it faster than another round.` });
    const stale = scope
      .filter((d) => stateOf(d.review) === 'CHANGES_REQUESTED' && (d.review?.marksOpen || 0) > 0 && d.review?.decidedAt && now - d.review.decidedAt > STALE_DAYS * 86_400_000)
      .sort((a, b) => (a.review!.decidedAt || 0) - (b.review!.decidedAt || 0))[0];
    if (stale) out.push({ key: `stale:${rev(stale)}`, kind: 'stale', tone: 'grey', row: stale,
      title: `${stale.name} has been back with ${first(stale.review?.designer?.name)} for ${Math.floor((now - stale.review!.decidedAt!) / 86_400_000)} days`,
      sub: `${plural(stale.review!.marksOpen, 'note')} still open.` });
  } else {
    const mineAll = all.filter((d) => mine(d, viewer));
    const open = mineAll.filter((d) => stateOf(d.review) === 'CHANGES_REQUESTED' && (d.review?.marksOpen || 0) > 0)
      .sort((a, b) => dueRank(a, nowDate) - dueRank(b, nowDate));
    if (open[0]) {
      const d = open[0]; const due = dueOf(d.targetDate, nowDate);
      out.push({ key: `open:${rev(d)}:${d.review!.marksOpen}`, kind: 'openNotes', tone: 'red', row: d,
        title: `${d.name}: ${plural(d.review!.marksOpen, 'note')} to fix`,
        sub: `${projectName(d.projectId)}${due ? ` · ${lower(due.label)}` : ''}. Tick each one as you fix it, then drop the new PDF.` });
    }
    const ready = mineAll.filter((d) => stateOf(d.review) === 'DRAFT' && dueRank(d, nowDate) <= 1).sort((a, b) => dueRank(a, nowDate) - dueRank(b, nowDate))[0];
    if (ready) out.push({ key: `ready:${rev(ready)}`, kind: 'readyDue', tone: 'indigo', row: ready,
      title: `${ready.name} is ready and ${lower(dueOf(ready.targetDate, nowDate)!.label)}`,
      sub: `${projectName(ready.projectId)}. Send it today so the Design Head has time to look.` });
    const waiting = mineAll.find((d) => stateOf(d.review) === 'IN_REVIEW' && dueRank(d, nowDate) === 0);
    if (waiting) out.push({ key: `waiting:${rev(waiting)}`, kind: 'waitingLate', tone: 'amber', row: waiting,
      title: `${waiting.name} is waiting on the Design Head`,
      sub: `It is ${lower(dueOf(waiting.targetDate, nowDate)!.label)}. Nothing for you to do yet.` });
    const elsewhere = mineAll.filter((d) => !inScope(d) && (stateOf(d.review) === 'CHANGES_REQUESTED' || stateOf(d.review) === 'DRAFT'));
    if (elsewhere.length) {
      const names = [...new Set(elsewhere.map((d) => projectName(d.projectId)).filter(Boolean))];
      out.push({ key: `elsewhere:${elsewhere.map(rev).sort().join(',')}`, kind: 'elsewhere', tone: 'grey',
        title: `${plural(elsewhere.length, 'sheet')} need${elsewhere.length === 1 ? 's' : ''} you in other projects`,
        sub: names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '') });
    }
  }

  const none = scope.filter((d) => stateOf(d.review) === 'NONE');
  if (none.length && viewer.reviewer) {
    const pid = none[0].projectId;
    if (none.every((d) => d.projectId === pid)) out.push({ key: `none:${pid}:${none.length}`, kind: 'notStarted', tone: 'grey', projectId: pid,
      title: `${plural(none.length, 'sheet')} not started in ${projectName(pid) || 'this project'}`,
      sub: 'No PDF has been uploaded for them yet.' });
  }
  const present = readyRooms(scope)[0];
  if (present) out.push({ key: `present:${present.projectId}:${present.room}`, kind: 'present', tone: 'green', projectId: present.projectId, room: present.room,
    title: `${present.room === GENERAL_ROOM ? 'The whole-home sheets are' : `${present.room} is`} ready to present`,
    sub: `Every client sheet${present.room === GENERAL_ROOM ? '' : ` for the ${present.room.toLowerCase()}`} in ${projectName(present.projectId) || 'this project'} is approved.` });

  return out.filter((x) => !input.isDismissed?.(x.key)).slice(0, input.limit ?? 3);
}
