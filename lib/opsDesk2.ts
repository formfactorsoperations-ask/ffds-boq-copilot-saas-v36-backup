/*
  OPS DESK 2.1 (mockup approved by the studio owner, 11 Nov 2026).

  The new screens read the records the desk already keeps; nothing here is
  stored. Each helper places an existing record on the new look: a client's
  pulse band becomes a health tone, a project's status and journey become a
  phase on the proposal-to-handover strip, a waiting payment lands in its
  ageing column, today's meetings and visits fall on one line with "now",
  a drawing sent for approval counts down its five working days, and closed
  days make the streak. Every status the app stores today has a place, so an
  old project, lead or approval shows up in the right column on its own.
*/
import { dayKey, addDays, type WaitingItem } from './opsDesk';
import { REMINDER_WORKING_DAYS, workingDaysSince, type ApprovalStage } from './designMeeting';
import type { PulseBand, VisitRequest } from './clientCare';

/* ── Health: the client pulse as a tone ──────────────────────────────────── */

export type Health = 'good' | 'warn' | 'bad';
export const healthOf = (band: PulseBand | string | null | undefined): Health =>
  band === 'at_risk' ? 'bad' : band === 'watch' ? 'warn' : 'good';
export const HEALTH_LABEL: Record<Health, string> = { good: 'Happy', warn: 'Watching', bad: 'At risk' };
/** The wall's pill: shorter. */
export const HEALTH_PILL: Record<Health, string> = { good: 'On track', warn: 'Watch', bad: 'At risk' };

/* ── Where the project stands: proposal to handover ──────────────────────── */

export const PHASES = ['Proposal', 'Design', 'Approvals', 'Execution', 'Handover'] as const;
export type PhaseName = typeof PHASES[number];

export interface Phase {
  /** 0 Proposal … 4 Handover. */
  index: number;
  name: PhaseName;
  /** Handed over: every step is done. */
  complete: boolean;
  /** The words under the project's name, e.g. "Execution · paused". */
  line: string;
}

/**
 * Every project status the app stores, on the five-step strip:
 * lead, draft, proposal sent and negotiation are the proposal; won is design,
 * and approvals once the design is approved; execution and a paused job are
 * execution, and handover once its checklist has started or the handover is
 * a fortnight away; completed is handed over. An unknown status is read as
 * the proposal, so nothing is ever dropped.
 */
export function phaseOf(ctx: any, o: { handoverStarted?: boolean; now?: number } = {}): Phase {
  const status = String(ctx?.status || '');
  const now = o.now ?? Date.now();
  const at = (index: number, line: string, complete = false): Phase => ({ index, name: PHASES[index], complete, line });
  switch (status) {
    case 'completed':
      return at(4, 'Handed over', true);
    case 'execution':
    case 'work_paused': {
      const days = daysUntil(ctx?.targetHandoverDate || null, now);
      const near = o.handoverStarted || (days != null && days <= 14);
      const paused = status === 'work_paused';
      return at(near ? 4 : 3, `${near ? 'Handover' : 'Execution'}${paused ? ' · paused' : ''}`);
    }
    case 'won':
      return ctx?.designApprovedAt || ctx?.designPhaseClosedAt ? at(2, 'Approvals') : at(1, 'Design');
    case 'proposal_sent':
      return at(0, 'Proposal sent');
    case 'negotiation':
      return at(0, 'Negotiation');
    case 'lead':
    case 'draft':
      return at(0, 'Proposal in the works');
    default:
      return at(0, status ? status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Proposal');
  }
}

/** How far along, out of 100: the journey's own figure when it has one, else a step's worth. */
export function progressOf(ctx: any, phase: Phase): number {
  const pct = Number(ctx?.journeySummary?.pct);
  if (Number.isFinite(pct) && pct >= 0) return Math.max(0, Math.min(100, Math.round(pct)));
  if (phase.complete) return 100;
  return [8, 22, 38, 60, 92][phase.index] ?? 0;
}

/** Whole days from today (India) to a day key; negative once it has passed; null without a date. */
export function daysUntil(key: string | null | undefined, now: number): number | null {
  if (!key || !/^\d{4}-\d{2}-\d{2}/.test(String(key))) return null;
  const a = new Date(`${String(key).slice(0, 10)}T00:00:00+05:30`).getTime();
  const b = new Date(`${dayKey(now)}T00:00:00+05:30`).getTime();
  return Math.round((a - b) / 86400000);
}

/** "3 Dec", or "Mar 2027" when it is past this year. */
export function shortDate(key: string | null | undefined, now: number): string {
  if (!key) return '—';
  const d = new Date(`${String(key).slice(0, 10)}T12:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return '—';
  const sameYear = dayKey(now).slice(0, 4) === String(key).slice(0, 4);
  return d.toLocaleDateString('en-IN', sameYear ? { day: 'numeric', month: 'short' } : { month: 'short', year: 'numeric' });
}

/* ── Clients: the wall's filters ─────────────────────────────────────────── */

export type ClientFilter = 'all' | 'attention' | 'handover' | 'design' | 'site';
export interface ClientLike { health: Health; phase: Phase; progress: number }
export function matchesClient(c: ClientLike, f: ClientFilter): boolean {
  switch (f) {
    case 'attention': return c.health !== 'good';
    case 'handover': return !c.phase.complete && (c.phase.index === 4 || c.progress >= 60);
    case 'design': return c.phase.index <= 2;
    case 'site': return c.phase.index >= 3 && !c.phase.complete;
    default: return true;
  }
}

/* ── Payments: how late each one is ──────────────────────────────────────── */

export type PayState = 'late' | 'due';
/** A waiting payment as the chase list shows it: days late, or days to go (0 when undated). */
export function payState(w: WaitingItem, now: number): { state: PayState; days: number } {
  if ((w.overdueDays || 0) > 0) return { state: 'late', days: w.overdueDays || 0 };
  const left = daysUntil(w.dueKey || null, now);
  return { state: 'due', days: left == null ? 0 : Math.max(0, left) };
}

/** The three ageing columns: due (not late yet), 1 to 7 days late, 8 or more. */
export function payAgeing(items: WaitingItem[]): { due: WaitingItem[]; late1to7: WaitingItem[]; late8: WaitingItem[] } {
  const pays = items.filter((w) => w.kind === 'payment');
  return {
    due: pays.filter((w) => !(w.overdueDays || 0)),
    late1to7: pays.filter((w) => (w.overdueDays || 0) >= 1 && (w.overdueDays || 0) <= 7),
    late8: pays.filter((w) => (w.overdueDays || 0) >= 8),
  };
}

/** Oldest first: the latest first, then those due soonest. */
export const byLateness = (now: number) => (a: WaitingItem, b: WaitingItem) => {
  const pa = payState(a, now), pb = payState(b, now);
  if (pa.state !== pb.state) return pa.state === 'late' ? -1 : 1;
  return pa.state === 'late' ? pb.days - pa.days : pa.days - pb.days;
};

/* ── Today: meetings and visits on one line ──────────────────────────────── */

/** Minutes since midnight in India. */
export const minutesIST = (ms: number) => {
  const d = new Date(ms + 5.5 * 3600000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const toMinutes = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export interface TimelineRow { visit: VisitRequest; at: number; past: boolean }
/**
 * Today's confirmed or asked-for meetings and visits that have a time, in
 * order. A row is past half an hour after it starts. `nextIn` is the minutes
 * to the next one, or null when nothing is left today.
 */
export function todayTimeline(visits: VisitRequest[], now: number): { rows: TimelineRow[]; nowAt: number; nextIn: number | null } {
  const today = dayKey(now);
  const nowAt = minutesIST(now);
  const rows = visits
    .filter((v) => v.slot?.date === today && v.status !== 'cancelled' && toMinutes(v.slot.time) != null)
    .map((v) => {
      const at = toMinutes(v.slot!.time)!;
      return { visit: v, at, past: v.status === 'done' || at + 30 <= nowAt };
    })
    .sort((a, b) => a.at - b.at);
  const next = rows.find((r) => r.at > nowAt && r.visit.status !== 'done');
  return { rows, nowAt, nextIn: next ? next.at - nowAt : null };
}

export const clockLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`;
};
export const inLabel = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);

/* ── Drawings for approval: the five-day runway ──────────────────────────── */

export const RUNWAY_DAYS = 5;
/**
 * Where a drawing sent for approval stands: working day n of five since it
 * was emailed, how many are left, and how many of the two reminders went.
 * Null for drawings not with the client.
 */
export function runwayOf(stage: ApprovalStage, a: { sentAt?: number | null; reminders?: unknown[] | null } | null | undefined, now: number) {
  if ((stage !== 'sent' && stage !== 'overdue') || !a?.sentAt) return null;
  const day = Math.max(0, workingDaysSince(a.sentAt, now));
  return {
    day,
    left: Math.max(0, RUNWAY_DAYS - day),
    overdue: stage === 'overdue',
    reminders: Math.min(REMINDER_WORKING_DAYS.length, a.reminders?.length || 0),
    of: REMINDER_WORKING_DAYS.length,
  };
}

/** The lanes and filters of Drawings for approval, in the words of the mockup. */
export const APPROVAL_LABEL: Record<ApprovalStage, string> = {
  presented: 'To send', sent: 'With the client', overdue: 'Overdue', changes: 'Changes asked', approved: 'Approved',
};

/* ── Closing the day: the streak ─────────────────────────────────────────── */

/** Working days are Monday to Saturday, as the studio's week. */
const isSunday = (key: string) => new Date(`${key}T12:00:00+05:30`).getUTCDay() === 0;
const prevWorkday = (key: string) => {
  let k = addDays(key, -1);
  while (isSunday(k)) k = addDays(k, -1);
  return k;
};

/**
 * Working days closed in a row: today if it is closed, else counting back
 * from the last working day. A Sunday never breaks it.
 */
export function streakOf(closed: Iterable<string>, now: number): number {
  const set = new Set(closed);
  let k = dayKey(now);
  if (isSunday(k) || !set.has(k)) k = prevWorkday(k);
  let n = 0;
  while (set.has(k) && n < 400) { n++; k = prevWorkday(k); }
  return n;
}

/** This week, Monday to Saturday: each day closed, today, or not. */
export function weekStrip(closed: Iterable<string>, now: number): { key: string; letter: string; done: boolean; today: boolean; future: boolean }[] {
  const set = new Set(closed);
  const today = dayKey(now);
  const dow = new Date(`${today}T12:00:00+05:30`).getUTCDay(); // 0 Sunday
  const monday = addDays(today, dow === 0 ? -6 : 1 - dow);
  return ['M', 'T', 'W', 'T', 'F', 'S'].map((letter, i) => {
    const key = addDays(monday, i);
    return { key, letter, done: set.has(key), today: key === today, future: key > today };
  });
}

/** The keys of the last n days, today first, for loading the closed days. */
export const lastDays = (now: number, n: number) => Array.from({ length: n }, (_, i) => addDays(dayKey(now), -i));

/* ── The greeting ────────────────────────────────────────────────────────── */

export const greeting = (now: number) => {
  const h = Math.floor(minutesIST(now) / 60);
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
export const countWord = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));

/* ── Client moments (Ops Desk 2.1, phase 2) ──────────────────────────────── */

/*
  Small touches the desk spots from what it already knows, each with the
  message drafted for a person to check and send: the handover a week away,
  a design just approved, a month in their new home, and each year since the
  handover. Nothing new is stored about the client (no birthdays, by the
  owner's choice), and nothing is sent by itself. A moment marked done stays
  away until its window closes.
*/

export type MomentKind = 'handover_soon' | 'design_approved' | 'handover_month' | 'handover_year';
export interface Moment {
  id: string;
  kind: MomentKind;
  projectId: string;
  projectName: string;
  client: string;
  title: string;
  body: string;
  act: string;
  message: string;
  /** The last day it is worth doing; marked done, it stays away until then. */
  until: string;
}

export interface MomentProject { id: string; name: string; client: string; status: string; targetHandover: string | null; ctx: any }

const msAny = (v: any): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  const t = v ? Date.parse(String(v)) : NaN;
  return Number.isNaN(t) ? null : t;
};
const firstOf = (client: string) => String(client || '').split(/\s*(?:&|,| and )\s*/)[0].trim() || 'there';

export function clientMoments(projects: MomentProject[], now: number, x: { me: string; studio: string }): Moment[] {
  const today = dayKey(now);
  const sign = `${x.me ? firstName2(x.me) : ''}${x.studio ? `, ${x.studio}` : ''}`.replace(/^, /, '');
  const out: Moment[] = [];
  for (const p of projects) {
    const hi = `Hi ${firstOf(p.client)},`;
    const handedOver = p.status === 'completed';
    const handoverAt = msAny(p.ctx?.handoverDate) ?? (p.targetHandover ? new Date(`${p.targetHandover}T12:00:00+05:30`).getTime() : null);
    if (!handedOver && p.targetHandover) {
      const d = daysUntil(p.targetHandover, now);
      if (d != null && d >= 0 && d <= 7) out.push({
        id: `handover_soon:${p.id}:${p.targetHandover}`, kind: 'handover_soon', projectId: p.id, projectName: p.name, client: p.client,
        title: `Handover in ${d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'}`} · ${p.name}`.replace('in today', 'today'),
        body: 'Send the handover checklist and the care guide, and confirm the walk-through.', act: 'Send checklist',
        message: `${hi} your home is almost ready. Before the handover on ${shortDate(p.targetHandover, now)}, here is what we will walk through together, and a short guide to caring for the finishes. Do tell me a time that suits you for the walk-through.\n\n${sign}`,
        until: p.targetHandover,
      });
    }
    const approved = msAny(p.ctx?.designApprovedAt);
    if (!handedOver && approved && now - approved >= 0 && now - approved <= 7 * 86400000) out.push({
      id: `design_approved:${p.id}:${dayKey(approved)}`, kind: 'design_approved', projectId: p.id, projectName: p.name, client: p.client,
      title: `Design approved · ${p.name}`, body: 'Thank them, and tell them what happens next and when.', act: 'Send a thank-you',
      message: `${hi} thank you for approving the design. Next we prepare the drawings for site and plan the work; I will share the dates with you this week.\n\n${sign}`,
      until: addDays(dayKey(approved), 7),
    });
    if (handedOver && handoverAt) {
      const since = Math.floor((now - handoverAt) / 86400000);
      if (since >= 28 && since <= 35) out.push({
        id: `handover_month:${p.id}`, kind: 'handover_month', projectId: p.id, projectName: p.name, client: p.client,
        title: `A month in their home · ${p.name}`, body: 'A short check-in: is everything working as it should?', act: 'Check in',
        message: `${hi} it has been a month since the handover. How is the home treating you? If anything needs a look, a hinge, a light or a drawer, tell me and we will send someone.\n\n${sign}`,
        until: addDays(dayKey(handoverAt), 35),
      });
      const years = Math.round(since / 365.25);
      const off = since - Math.round(years * 365.25);
      if (years >= 1 && off >= -7 && off <= 7) out.push({
        id: `handover_year:${p.id}:${years}`, kind: 'handover_year', projectId: p.id, projectName: p.name, client: p.client,
        title: `${years === 1 ? 'A year' : `${years} years`} in their home · ${p.name}`, body: 'Ask for a Google review and a photo for the portfolio.', act: 'Ask for a review',
        message: `${hi} it is ${years === 1 ? 'a year' : `${years} years`} since we handed over your home. We hope you are loving it. If you have a minute, a Google review would mean a lot to the team, and we would love a photo of how you have made it yours.\n\n${sign}`,
        until: addDays(today, 7 - off),
      });
    }
  }
  return out.sort((a, b) => a.until.localeCompare(b.until));
}
const firstName2 = (n: string) => String(n || '').trim().split(/[\s@]+/)[0];
