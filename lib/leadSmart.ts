/*
  WHAT THE DESK WORKS OUT ABOUT LEADS (lib/leads.ts has what a lead is).

  Read from what is already on each lead, never asked for twice:
  - how warm it is (leadHeat): hot, warm or cold, and why;
  - how long it has sat in its stage, and whether that is too long (stageAge);
  - the one thing to do next, with the reason (nextBestAction);
  - ready WhatsApp messages in the studio's voice (templateText);
  - where leads come from and where they are lost (leadInsights);
  - what falls on which day, for the calendar (calendarItems, monthGrid).

  Pure, and shared by the screens and the tests.
*/
import { addDays, dayKey, daysBetween } from './opsDesk';
import { BOARD_STAGES, LEAD_SOURCES, LEAD_STAGES, QUIET_DAYS, isOpen, leadName, mainPerson, sourceLabel, type Lead, type LeadSource, type LeadStage } from './leads';

const DAY = 86400000;
const stageLabel = (s: LeadStage) => LEAD_STAGES.find((x) => x.id === s)?.label || (s === 'lost' ? 'Lost' : s);

/* ── How long in this stage ──────────────────────────────────────────────── */

/** A touch that records the lead changing stage, as the board, the lead page and closing a lead write them. */
const STAGE_CHANGE = /^(Moved to |Lost|Won|Opened again)/;

/** When the lead came into the stage it is in now. */
export function stageSince(l: Lead): number {
  if (l.stage === 'new') return l.createdAt;
  if ((l.stage === 'won' || l.stage === 'lost') && l.closedAt) return l.closedAt;
  const changes = (l.touches || []).filter((t) => t.kind === 'stage' && STAGE_CHANGE.test(t.text));
  if (changes.length) return changes[changes.length - 1].at;
  return (l.stage === 'talking' ? l.firstTouchAt : l.lastTouchAt) ?? l.createdAt;
}

/** Days a lead may sit in a stage before the desk calls it stuck. */
export const STUCK_DAYS: Record<LeadStage, number> = { new: 1, talking: 7, meeting: 7, measured: 5, proposal: 10, won: Infinity, lost: Infinity };

export function stageAge(l: Lead, now: number): { days: number; stuck: boolean; label: string } {
  const days = Math.max(0, daysBetween(stageSince(l), now));
  return { days, stuck: isOpen(l) && days >= STUCK_DAYS[l.stage], label: days === 0 ? 'In stage since today' : `${days} d in stage` };
}

/* ── How warm it is ──────────────────────────────────────────────────────── */

export type Heat = 'hot' | 'warm' | 'cold';
export const HEAT_LABEL: Record<Heat, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Months from now until possession, from what the client said ("Jan 2027",
 * "March", "ready now", "2026"), or null when it does not say.
 */
export function monthsToPossession(text: string | null | undefined, now: number): number | null {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  if (/\b(ready|now|immediate|already|got the keys|possession done)\b/.test(t)) return 0;
  const today = new Date(now + 5.5 * 3600000);
  const y0 = today.getUTCFullYear();
  const m0 = today.getUTCMonth();
  const mi = MONTHS.findIndex((m) => new RegExp(`\\b${m}`).test(t));
  const ym = /\b(20\d{2})\b/.exec(t);
  if (mi < 0 && !ym) return null;
  const year = ym ? Number(ym[1]) : (mi >= m0 ? y0 : y0 + 1);
  const month = mi >= 0 ? mi : 5;
  return (year - y0) * 12 + (month - m0);
}

/**
 * Hot, warm or cold, out of 100, and the reasons, from the lead itself: how
 * far along it is, where it came from, how soon they get the keys, what we
 * know, how lately we spoke and whether they answer. Null once it is closed.
 */
export function leadHeat(l: Lead, now: number): { heat: Heat; score: number; reasons: string[] } | null {
  if (!isOpen(l)) return null;
  let score = 40;
  const plus: [number, string][] = [];
  const add = (n: number, why: string) => { score += n; plus.push([n, why]); };

  const stageBonus: Partial<Record<LeadStage, number>> = { talking: 5, meeting: 15, measured: 25, proposal: 30 };
  if (stageBonus[l.stage]) add(stageBonus[l.stage]!, `${stageLabel(l.stage).toLowerCase()}`);
  const sourceBonus: Partial<Record<LeadSource, number>> = { referral: 10, repeat: 12, architect: 8, walkin: 6 };
  if (sourceBonus[l.source]) add(sourceBonus[l.source]!, sourceLabel(l.source).toLowerCase());

  const months = monthsToPossession(l.home.possession, now);
  if (months != null && months <= 6) add(10, months <= 0 ? 'keys now' : `keys in ${months} month${months === 1 ? '' : 's'}`);
  else if (months != null && months > 12) add(-5, 'possession over a year away');
  if (l.home.budget) add(5, 'budget said');
  if (l.know.seenWork) add(5, 'has seen our work');
  if (l.know.decides) add(3, 'we know who decides');

  const recent = (l.touches || []).filter((t) => now - t.at < 14 * DAY && ((t.kind === 'call' && t.reached) || t.kind === 'whatsapp' || t.kind === 'meeting'));
  if (recent.length) add(Math.min(12, recent.length * 4), `${recent.length} conversation${recent.length === 1 ? '' : 's'} in two weeks`);
  if (l.next?.kind === 'meeting' && l.next.due >= dayKey(now)) add(8, 'meeting booked');

  const quiet = daysBetween(l.lastTouchAt ?? l.createdAt, now);
  if (l.firstTouchAt && quiet >= 10) add(-20, `quiet for ${quiet} days`);
  else if (l.firstTouchAt && quiet >= QUIET_DAYS) add(-10, `quiet for ${quiet} days`);
  const calls = (l.touches || []).filter((t) => t.kind === 'call').slice(-3);
  if (calls.length >= 2 && calls.every((t) => t.reached === false)) add(-8, 'last calls not answered');

  score = Math.max(0, Math.min(100, Math.round(score)));
  const heat: Heat = score >= 70 ? 'hot' : score >= 45 ? 'warm' : 'cold';
  const reasons = plus.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 4).map(([n, why]) => `${n > 0 ? '+' : '−'} ${why}`);
  return { heat, score, reasons };
}

/* ── What to do next ─────────────────────────────────────────────────────── */

export type TemplateId = 'intro' | 'portfolio' | 'meeting' | 'checkin' | 'proposal' | 'revisit';
export const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: 'intro', label: 'Introduce the studio' },
  { id: 'portfolio', label: 'Share our work' },
  { id: 'meeting', label: 'Confirm the meeting' },
  { id: 'checkin', label: 'Check in' },
  { id: 'proposal', label: 'Follow up the proposal' },
  { id: 'revisit', label: 'Try again' },
];

export type SuggestionAction = 'call' | 'template' | 'book' | 'measure' | 'ask' | 'open' | 'reopen' | 'next';
export interface Suggestion {
  title: string;
  why: string;
  action: SuggestionAction;
  template?: TemplateId;
  /** For 'ask': which of the first-call questions is missing. */
  ask?: string;
}

/**
 * The one thing most worth doing on this lead now, and why. Null when there is
 * nothing to suggest (a won lead, or a lost one with no day to try again).
 */
export function nextBestAction(l: Lead, now: number): Suggestion | null {
  const today = dayKey(now);
  if (l.stage === 'won') return null;
  if (l.stage === 'lost') {
    if (l.revisitOn && l.revisitOn <= today) return { title: 'Try them again', why: `You set ${l.revisitOn} to try again${l.lostReason ? `; it was lost to ${l.lostReason.toLowerCase()}` : ''}.`, action: 'template', template: 'revisit' };
    return null;
  }
  if (!l.firstTouchAt) {
    const min = Math.round((now - l.createdAt) / 60000);
    return { title: 'Call now', why: `It came in ${min < 60 ? `${min} min` : min < 2880 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} days`} ago. Most people call the next studio on their list the same day.`, action: 'call' };
  }
  if (l.next && l.next.due < today) return { title: `Overdue: ${l.next.text}`, why: `It was due ${l.next.due}. Do it, or move it to the day you will.`, action: 'next' };
  const quiet = daysBetween(l.lastTouchAt ?? l.createdAt, now);
  if (quiet >= QUIET_DAYS) return { title: 'Send a short check-in', why: `Nobody has spoken to them for ${quiet} days.`, action: 'template', template: 'checkin' };
  if (l.stage === 'talking' || l.stage === 'new') {
    if (!l.know.seenWork) return { title: 'Share our work', why: 'They have not seen the studio’s work yet; it is what makes them book a meeting.', action: 'template', template: 'portfolio' };
    const missing = !l.know.decides ? 'Who decides' : !l.home.possession ? 'Possession' : !l.home.budget ? 'Budget they said' : null;
    if (missing) return { title: `Ask: ${missing.toLowerCase()}`, why: 'One of the first-call questions is still open; the brief needs it.', action: 'ask', ask: missing };
    if (l.next?.kind !== 'meeting') return { title: 'Book a studio meeting', why: 'You know enough; a meeting is the step that turns an enquiry into a client.', action: 'book' };
  }
  if (l.stage === 'meeting') {
    if (l.next?.kind === 'meeting' && l.next.due >= today) return { title: 'Confirm the meeting', why: `It is on ${l.next.due}${l.next.time ? ` at ${l.next.time}` : ''}. A reminder the day before halves no-shows.`, action: 'template', template: 'meeting' };
    return { title: 'Book the site measurement', why: 'The meeting is done; measuring the site is the next step to a proposal.', action: 'measure' };
  }
  if (l.stage === 'measured' && !l.openRequest && !l.projectId) return { title: 'Open the project for a proposal', why: 'The site is measured, so the proposal can start once the project is open.', action: 'open' };
  if (l.stage === 'proposal') return { title: 'Follow up the proposal', why: 'A short follow-up within the week keeps the proposal moving.', action: 'template', template: 'proposal' };
  if (!l.next) return { title: 'Set a next step', why: 'Every open lead needs a next step and a date, or it slips.', action: 'next' };
  return null;
}

/* ── Messages ready to send ──────────────────────────────────────────────── */

/** "Rohan" from "Mr Rohan Mehta". */
export const firstNameOf = (name: string) => String(name || '').replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, '').trim().split(/\s+/)[0] || 'there';

export function templateText(id: TemplateId, l: Lead, x: { me: string; studio: string }): string {
  const who = firstNameOf(mainPerson(l)?.name || leadName(l));
  const studio = x.studio || 'our studio';
  const home = [l.home.type, l.home.where.split(/[·,]/)[0]?.trim()].filter(Boolean).join(' in ') || 'your home';
  const sign = `\n\n${x.me}\n${studio}`;
  switch (id) {
    case 'intro':
      return `Hi ${who}, this is ${x.me} from ${studio}. Thank you for your enquiry about ${home}. When is a good time for a short call to understand what you have in mind?${sign}`;
    case 'portfolio':
      return `Hi ${who}, sharing a few of our recent homes so you can see how we work. Happy to walk you through any of them, or show you the finishes at the studio.${sign}`;
    case 'meeting': {
      const n = l.next;
      const when = n?.kind === 'meeting' ? `${n.due}${n.time ? ` at ${n.time}` : ''}` : 'our meeting';
      return `Hi ${who}, looking forward to meeting you on ${when}.${n?.meetUrl ? ` Here is the link: ${n.meetUrl}` : ''} Please bring the floor plan if you have it. See you then!${sign}`;
    }
    case 'checkin':
      return `Hi ${who}, just checking in about ${home}. Is there anything you would like to see or discuss before the next step? Happy to help.${sign}`;
    case 'proposal':
      return `Hi ${who}, hope you had a chance to look at the proposal. Shall we set up a short call this week to go through it and answer any questions?${sign}`;
    case 'revisit':
      return `Hi ${who}, it has been a while since we spoke about ${home}. If the plans are moving again, we would love to help. Would a quick call this week work?${sign}`;
  }
}

/* ── Where leads come from, and where they are lost ──────────────────────── */

/** The furthest board stage a lead reached, from its stage and its stage moves. */
export function furthestStage(l: Lead): number {
  if (l.stage === 'won') return BOARD_STAGES.length - 1;
  let best = Math.max(0, BOARD_STAGES.indexOf(l.stage));
  for (const t of l.touches || []) {
    if (t.kind !== 'stage' || !t.text.startsWith('Moved to ')) continue;
    const ix = BOARD_STAGES.findIndex((s) => stageLabel(s) === t.text.slice(9));
    if (ix > best) best = ix;
  }
  return best;
}

export interface SourceRow { source: LeadSource; label: string; total: number; open: number; won: number; lost: number; winRate: number | null }

export function leadInsights(leads: Lead[], since: number) {
  const pool = leads.filter((l) => l.createdAt >= since);
  const reached = BOARD_STAGES.map((s, i) => ({ stage: s, label: stageLabel(s), count: pool.filter((l) => furthestStage(l) >= i).length }));
  const won = pool.filter((l) => l.stage === 'won');
  const lost = pool.filter((l) => l.stage === 'lost');
  const sources: SourceRow[] = LEAD_SOURCES.map((s) => {
    const mine = pool.filter((l) => l.source === s.id);
    const w = mine.filter((l) => l.stage === 'won').length;
    const lo = mine.filter((l) => l.stage === 'lost').length;
    return { source: s.id, label: s.label, total: mine.length, open: mine.length - w - lo, won: w, lost: lo, winRate: w + lo ? Math.round((w / (w + lo)) * 100) : null };
  }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const reasonCount = new Map<string, number>();
  for (const l of lost) reasonCount.set(l.lostReason || 'Other', (reasonCount.get(l.lostReason || 'Other') || 0) + 1);
  const reasons = [...reasonCount.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count }));
  const toWin = won.filter((l) => l.closedAt).map((l) => ((l.closedAt as number) - l.createdAt) / DAY);
  return {
    total: pool.length, won: won.length, lost: lost.length, open: pool.length - won.length - lost.length,
    winRate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
    avgDaysToWin: toWin.length ? Math.round(toWin.reduce((a, b) => a + b, 0) / toWin.length) : null,
    reached, sources, reasons,
  };
}

/* ── The calendar ────────────────────────────────────────────────────────── */

export type CalKind = 'call' | 'whatsapp' | 'meeting' | 'revisit';
export interface CalItem {
  id: string;
  leadId: string;
  date: string;
  time: string | null;
  kind: CalKind;
  title: string;
  leadName: string;
  ownerEmail: string;
  overdue: boolean;
  /** A meeting on Google Calendar is moved on the lead, so it moves there too. */
  movable: boolean;
}

/** Every open lead's next step on its day, and every lost lead's day to try again. */
export function calendarItems(leads: Lead[], now: number): CalItem[] {
  const today = dayKey(now);
  const out: CalItem[] = [];
  for (const l of leads) {
    if (isOpen(l) && l.next && /^\d{4}-\d{2}-\d{2}$/.test(l.next.due)) {
      const time = l.next.kind === 'meeting' && /^\d{2}:\d{2}$/.test(String(l.next.time || '')) ? String(l.next.time) : null;
      out.push({
        id: `next:${l.id}`, leadId: l.id, date: l.next.due, time, kind: l.next.kind, title: l.next.text, leadName: leadName(l), ownerEmail: l.ownerEmail,
        overdue: l.next.due < today, movable: !(l.next.kind === 'meeting' && l.next.calendarEventId),
      });
    }
    if (l.stage === 'lost' && l.revisitOn) {
      out.push({ id: `revisit:${l.id}`, leadId: l.id, date: l.revisitOn, time: null, kind: 'revisit', title: 'Try again', leadName: leadName(l), ownerEmail: l.ownerEmail, overdue: false, movable: true });
    }
  }
  return out.sort((a, b) => `${a.date}${a.time || '99'}`.localeCompare(`${b.date}${b.time || '99'}`));
}

/** The 42 days of a month's grid, Monday first, for "YYYY-MM". */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const dow = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -dow);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Move a lead's next step, or its day to try again, to another day. The caller saves. */
export function moveCalItem(l: Lead, item: Pick<CalItem, 'kind'>, to: string): Lead {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) return l;
  if (item.kind === 'revisit') return l.stage === 'lost' ? { ...l, revisitOn: to } : l;
  return l.next ? { ...l, next: { ...l.next, due: to } } : l;
}
