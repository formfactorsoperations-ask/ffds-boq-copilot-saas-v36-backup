/*
  HOME WIDGETS: what each widget on Home shows, worked out from data the app
  already has, so the widgets stay simple and the rules can be tested.

    mySheets      Design Desk, for the person: sheets sent back to fix, drafts
                  to send, and theirs waiting for review.
    reviewInbox   Design Desk, for those who review: what waits, how long,
                  what is overdue, client changes, and approvals this week.
    upcoming      meetings, site visits and measurements booked with clients
                  (Ops Desk), soonest first.
    teamToday     People: who is away or working from home today (never why,
                  never who is in; that stays with managers), and the next
                  studio holiday.
*/
import { stateOf } from './drawingReview';
import { dueOf, dueRank, needsMe, reviewQueue, statsOf, type DeskRow, type Stats, type Viewer } from './designDesk';
import type { VisitRequest } from './clientCare';
import type { Snapshot } from './peopleDesk';
import { addDays } from './peopleDesk';
import { awayOn, todayOf, type DayAway } from './peopleView';

const DAY = 86_400_000;

/* ── Design Desk: mine ───────────────────────────────────────────────────── */

export interface MySheets {
  /** Sent back with changes: theirs to fix. */
  fix: DeskRow[];
  /** Theirs, not yet sent for review. */
  drafts: DeskRow[];
  /** Theirs, with the reviewer. */
  waiting: DeskRow[];
  /** What to show first: fixes, then drafts, the most urgent first. */
  top: DeskRow[];
}
export function mySheets(rows: DeskRow[], viewer: Viewer, now = new Date()): MySheets {
  const own = rows.filter((d) => !!viewer.email && d.review?.designer?.email === viewer.email);
  const by = (s: string) => own.filter((d) => stateOf(d.review) === s);
  const urgent = (a: DeskRow, b: DeskRow) => dueRank(a, now) - dueRank(b, now) || (a.review?.updatedAt || 0) - (b.review?.updatedAt || 0);
  const fix = by('CHANGES_REQUESTED').sort(urgent);
  const drafts = by('DRAFT').sort(urgent);
  return { fix, drafts, waiting: by('IN_REVIEW').sort(urgent), top: [...fix, ...drafts].slice(0, 3) };
}

/* ── Design Desk: the review inbox ───────────────────────────────────────── */

export interface ReviewInbox {
  waiting: DeskRow[];
  overdue: number;
  /** Days the longest-waiting sheet has waited. */
  oldestDays: number | null;
  /** Approved sheets with a client's changes waiting for the reviewer. */
  clientChanges: number;
  /** Approvals on each of the last 7 days, oldest first. */
  approvedByDay: number[];
  approvedWeek: number;
  /** Everything needing the reviewer: waiting plus client changes. */
  needs: number;
  stats: Stats;
}
export function reviewInbox(rows: DeskRow[], viewer: Viewer, now = new Date()): ReviewInbox {
  const waiting = reviewQueue(rows, null, now);
  const submitted = waiting.map((d) => d.review?.submittedAt || 0).filter(Boolean);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const approvedByDay = Array.from({ length: 7 }, (_, i) => {
    const from = startOfToday - (6 - i) * DAY;
    return rows.filter((d) => stateOf(d.review) === 'APPROVED' && (d.review?.decidedAt || 0) >= from && (d.review?.decidedAt || 0) < from + DAY).length;
  });
  return {
    waiting,
    overdue: waiting.filter((d) => dueOf(d.targetDate, now)?.tone === 'late').length,
    oldestDays: submitted.length ? Math.max(0, Math.floor((now.getTime() - Math.min(...submitted)) / DAY)) : null,
    clientChanges: rows.filter((d) => stateOf(d.review) === 'APPROVED' && d.review?.clientChanges?.pending).length,
    approvedByDay,
    approvedWeek: approvedByDay.reduce((n, x) => n + x, 0),
    needs: rows.filter((d) => needsMe(d, viewer)).length,
    stats: statsOf(rows),
  };
}

/* ── Meetings and visits booked with clients ─────────────────────────────── */

export interface Upcoming { visit: VisitRequest; date: string; time: string; daysAway: number }
/** Requested, confirmed or moved, from today to `days` ahead, soonest first. */
export function upcoming(visits: VisitRequest[], today: string, days = 14): Upcoming[] {
  const last = addDays(today, days);
  return visits
    .filter((v) => ['requested', 'confirmed', 'rescheduled'].includes(v.status) && v.slot?.date && v.slot.date >= today && v.slot.date <= last)
    .map((v) => ({ visit: v, date: v.slot!.date, time: v.slot!.time || '', daysAway: Math.round((Date.parse(`${v.slot!.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}
export const whenLabel = (u: Pick<Upcoming, 'daysAway' | 'date'>) =>
  u.daysAway === 0 ? 'Today' : u.daysAway === 1 ? 'Tomorrow'
    : new Date(`${u.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/* ── People: the team today ──────────────────────────────────────────────── */

export interface TeamToday {
  today: string;
  /** On leave today (approved). */
  away: DayAway[];
  /** Working from home today (approved). */
  home: DayAway[];
  /** Asked for today, not yet approved. */
  asked: DayAway[];
  /** Everyone on attendance. */
  team: number;
  nextHoliday: { date: string; name: string; days: number } | null;
}
export function teamToday(s: Snapshot): TeamToday {
  const today = todayOf(s);
  const list = awayOn(s, today);
  const next = s.policy.holidays.find((d) => d >= today) || null;
  return {
    today,
    away: list.filter((a) => a.mode === 'Away' && !a.pending),
    home: list.filter((a) => a.mode === 'WFH' && !a.pending),
    asked: list.filter((a) => a.pending),
    team: s.people.filter((p) => p.active).length,
    nextHoliday: next ? { date: next, name: s.policy.holidayNames?.[next] || 'Holiday', days: Math.round((Date.parse(`${next}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY) } : null,
  };
}
