/*
  HOME: "Your day, in order". The widgets pinned along a path, the one that
  saves the most time first (DESIGN.md → "Your day, in order").

    sheets     Design Desk, for you: fixes and drafts
    reviews    the review inbox (those who review)
    meetings   meetings and visits booked with clients
    team       the team today, and the next holiday

  A pin's weight says how much it asks of the person today. A meeting today
  comes first: it cannot move. Then work late or blocking others, then work
  ready to go, then what is only worth knowing. Equal weights keep the order
  above, so the board does not shuffle for nothing.
*/
import { dueOf, type DeskRow, type Viewer } from './designDesk';
import { mySheets, reviewInbox, type TeamToday, type Upcoming } from './homeWidgets';

export type PinKind = 'sheets' | 'reviews' | 'meetings' | 'team';
const ORDER: PinKind[] = ['sheets', 'reviews', 'meetings', 'team'];

/** At or above this weight a pin is something to do today, not only to know. */
export const TO_DO = 45;

export interface DayInput {
  /** Each pin shown; null while its data loads, left out when the person may not see it. */
  rows?: DeskRow[] | null;
  reviewer?: boolean;
  viewer?: Viewer;
  visits?: Upcoming[] | null;
  team?: TeamToday | null;
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
  sheets: { 90: 'Late', 70: 'Sent back to fix', 50: 'Ready to send', 0: 'All caught up' },
  reviews: { 85: 'Overdue', 60: 'Waiting on you', 0: 'All clear' },
  meetings: { 100: 'Today', 46: 'Tomorrow', 15: 'Next two weeks', 0: 'Nothing booked' },
  team: { 48: 'Asked off today', 10: 'Worth knowing', 0: 'Everyone in' },
};
const loading = (kind: PinKind, i: DayInput) =>
  kind === 'meetings' ? !i.visits : kind === 'team' ? !i.team : !i.rows || !i.viewer;

/** The pins this person sees, heaviest first; equal weights keep the usual order. */
export function dayOrder(i: DayInput): { pins: DayPin[]; toDo: number } {
  const shown = ORDER.filter((k) =>
    k === 'sheets' ? i.rows !== undefined
      : k === 'reviews' ? i.rows !== undefined && !!i.reviewer
      : k === 'meetings' ? i.visits !== undefined
      : i.team !== undefined);
  const pins = shown.map((kind) => {
    const weight = pinWeight(kind, i);
    /* A reviewer's "for you" also lists the review queue, which has its own pin: say only that their own work is clear. */
    const why = kind === 'sheets' && !weight && i.reviewer ? 'Yours: all clear' : WHY[kind][weight] || '';
    return { kind, weight, why: loading(kind, i) ? '' : why };
  })
    .sort((a, b) => b.weight - a.weight || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return { pins, toDo: pins.filter((p) => p.weight >= TO_DO).length };
}

const WORD = ['No', 'One', 'Two', 'Three', 'Four'];
/** The board's heading. */
export function dayTitle(toDo: number): string {
  if (toDo === 0) return 'Nothing pressing today. Here is what is around you';
  if (toDo === 1) return 'One thing first, then the rest';
  return `${WORD[toDo] || toDo} things, in the order that saves you time`;
}
