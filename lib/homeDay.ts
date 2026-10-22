/*
  HOME: "Your day, in order". The widgets pinned along a path, the one that
  saves the most time first (DESIGN.md → "Your day, in order").

    checkin    My day: check in and out (People)
    sheets     Design Desk, for you: fixes and drafts
    reviews    the review inbox (those who review)
    attention  projects blocked or due (the studio's worklist)
    meetings   meetings and visits booked with clients, and the week ahead
    team       the team today, and the next holiday

  A pin's weight says how much it asks of the person today. My day is always
  pin 01: checking in starts the day, and checking out ends it (it counts as
  something to do only until the person is in). Then a meeting today: it
  cannot move. Then work late or
  blocking others, then work ready to go, then what is only worth knowing.
  Equal weights keep the order above, so the board does not shuffle for
  nothing.
*/
import { dueOf, type DeskRow, type Viewer } from './designDesk';
import { mySheets, reviewInbox, type TeamToday, type Upcoming } from './homeWidgets';
import { clock12, isOff, type Snapshot } from './peopleDesk';
import { myDay } from './peopleView';

export type PinKind = 'checkin' | 'sheets' | 'reviews' | 'attention' | 'meetings' | 'team';
const ORDER: PinKind[] = ['checkin', 'sheets', 'reviews', 'attention', 'meetings', 'team'];

/** Where this person's working day stands: not in yet, in, done, or a day off. */
export interface CheckIn { state: 'out' | 'in' | 'done' | 'off'; since?: string }
export function checkInOf(s: Snapshot): CheckIn {
  const { today, session } = myDay(s);
  if (session?.checkOut) return { state: 'done' };
  if (session) return { state: 'in', since: clock12(session.checkIn, s.policy.timezone) };
  if (s.policy.holidays.includes(today) || isOff(today, s.policy)) return { state: 'off' };
  const away = s.availability.find((a) => a.employeeId === s.me.id && a.start <= today && a.end >= today && a.status !== 'Pending' && a.mode !== 'WFH');
  return { state: away ? 'off' : 'out' };
}

/** At or above this weight a pin is something to do today, not only to know. */
export const TO_DO = 45;

export interface DayInput {
  /** Each pin shown; null while its data loads, left out when the person may not see it. */
  rows?: DeskRow[] | null;
  reviewer?: boolean;
  viewer?: Viewer;
  visits?: Upcoming[] | null;
  team?: TeamToday | null;
  checkin?: CheckIn | null;
  /** Projects in the worklist: how many are blocked, how many have something due. */
  attention?: { blocked: number; due: number } | null;
  now?: Date;
}

export interface DayPin {
  kind: PinKind;
  weight: number;
  /** Why it sits where it does, in a word or two; empty while it loads. */
  why: string;
}

export function pinWeight(kind: PinKind, i: DayInput): number {
  const now = i.now || new Date();
  if (kind === 'checkin') return 200;
  if (kind === 'attention') {
    if (!i.attention) return 0;
    return i.attention.blocked ? 80 : i.attention.due ? 55 : 0;
  }
  if (kind === 'sheets') {
    if (!i.rows || !i.viewer) return 0;
    const m = mySheets(i.rows, i.viewer, now);
    if (m.fix.some((d) => dueOf(d.targetDate, now)?.tone === 'late')) return 90;
    if (m.fix.length) return 70;
    if (m.drafts.length) return 50;
    return 0;
  }
  if (kind === 'reviews') {
    if (!i.rows || !i.viewer) return 0;
    const r = reviewInbox(i.rows, i.viewer, now);
    if (r.overdue) return 85;
    if (r.waiting.length || r.clientChanges) return 60;
    return 0;
  }
  if (kind === 'meetings') {
    if (!i.visits) return 0;
    if (i.visits.some((u) => u.daysAway === 0)) return 100;
    if (i.visits.some((u) => u.daysAway === 1)) return 46;
    return i.visits.length ? 15 : 0;
  }
  if (!i.team) return 0;
  if (i.team.asked.length) return 48;
  return i.team.away.length + i.team.home.length ? 10 : 0;
}

const WHY: Record<PinKind, Record<number, string>> = {
  checkin: { 200: 'Start here' },
  attention: { 80: 'Blocked', 55: 'Next up', 0: 'All clear' },
  sheets: { 90: 'Late', 70: 'Sent back to fix', 50: 'Ready to send', 0: 'All caught up' },
  reviews: { 85: 'Overdue', 60: 'Waiting on you', 0: 'All clear' },
  meetings: { 100: 'Today', 46: 'Tomorrow', 15: 'Next two weeks', 0: 'Nothing booked' },
  team: { 48: 'Asked off today', 10: 'Worth knowing', 0: 'Everyone in' },
};
const loading = (kind: PinKind, i: DayInput) =>
  kind === 'meetings' ? !i.visits : kind === 'team' ? !i.team : kind === 'checkin' ? !i.checkin
    : kind === 'attention' ? !i.attention : !i.rows || !i.viewer;
const DONE: Record<string, string> = { done: 'Day done', off: 'Day off' };

/**
 * The pins this person sees, heaviest first; equal weights keep the usual order.
 * `ready` once no pin is still loading, so the order will not shift as data lands.
 */
export function dayOrder(i: DayInput): { pins: DayPin[]; toDo: number; ready: boolean } {
  const shown = ORDER.filter((k) =>
    k === 'sheets' ? i.rows !== undefined
      : k === 'reviews' ? i.rows !== undefined && !!i.reviewer
      : k === 'meetings' ? i.visits !== undefined
      : k === 'checkin' ? i.checkin !== undefined
      : k === 'attention' ? i.attention !== undefined
      : i.team !== undefined);
  const pins = shown.map((kind) => {
    const weight = pinWeight(kind, i);
    /* A reviewer's "for you" also lists the review queue, which has its own pin: say only that their own work is clear. */
    const why = kind === 'sheets' && !weight && i.reviewer ? 'Yours: all clear'
      : kind === 'checkin' && i.checkin && i.checkin.state !== 'out' ? (i.checkin.since ? `In since ${i.checkin.since}` : DONE[i.checkin.state])
      : WHY[kind][weight] || '';
    return { kind, weight, why: loading(kind, i) ? '' : why };
  })
    .sort((a, b) => b.weight - a.weight || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const todo = (p: DayPin) => p.weight >= TO_DO && (p.kind !== 'checkin' || i.checkin?.state === 'out');
  return { pins, toDo: pins.filter(todo).length, ready: shown.every((k) => !loading(k, i)) };
}

const WORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
/** The board's heading. */
export function dayTitle(toDo: number): string {
  if (toDo === 0) return 'Nothing pressing today. Here is what is around you';
  if (toDo === 1) return 'One thing first, then the rest';
  return `${WORD[toDo] || toDo} things, in the order that saves you time`;
}
