/*
  THE OPS DESK: one working list for whoever looks after the studio's clients.

  Nothing here is stored twice. The desk is worked out from records the studio
  already keeps -- payment milestones, client decisions, minutes -- plus two
  that are new: the follow-up log (projects/{id}/followUps), a hand-written
  line for every call, WhatsApp and email, with the next step and its date;
  and escalations (projects/{id}/escalations), which put something stuck in
  front of a named lead.

  Pure, and shared by the app and the Cloud Functions (the daily sweep that
  raises an escalation by itself uses dueForEscalation below).
*/
import type { ClientMoney } from './clientMoney';

export type Channel = 'call' | 'whatsapp' | 'email' | 'meeting' | 'other';
/* What came of it. A reply or a promise resets the count of unanswered reminders. */
export type Outcome = 'reminded' | 'no_answer' | 'replied' | 'promised' | 'info';
export type SubjectKind = 'payment' | 'decision' | 'general';
export type Tone = 'gentle' | 'clear' | 'firm';

export const CHANNELS: { id: Channel; label: string }[] = [
  { id: 'call', label: 'Call' }, { id: 'whatsapp', label: 'WhatsApp' }, { id: 'email', label: 'Email' },
  { id: 'meeting', label: 'In person' }, { id: 'other', label: 'Other' },
];
export const OUTCOMES: { id: Outcome; label: string }[] = [
  { id: 'reminded', label: 'Reminded, no reply yet' }, { id: 'no_answer', label: 'No answer' },
  { id: 'replied', label: 'Client replied' }, { id: 'promised', label: 'Client promised a date' },
  { id: 'info', label: 'Update only' },
];

/** What a follow-up is about, so the reminders for one payment or decision can be counted together. */
export interface Subject { kind: SubjectKind; key: string; label: string }

export interface NextStep { text: string; ownerEmail: string; ownerName: string; due: string /* YYYY-MM-DD */ }

export interface FollowUp {
  id: string;
  tenantId: string;
  projectId: string;
  projectName: string;
  at: number;
  by: string;
  byName: string;
  channel: Channel;
  note: string;
  subject: Subject | null;
  outcome: Outcome;
  next: NextStep | null;
  nextDone: boolean;
  nextDoneAt?: number | null;
  /** Always true: it was written by a person, not read from WhatsApp or a mailbox. */
  manual: true;
}

export type EscalationCategory = 'payment' | 'scope' | 'deadline' | 'complaint' | 'design' | 'other';
export const ESCALATION_CATEGORIES: { id: EscalationCategory; label: string }[] = [
  { id: 'payment', label: 'Payment' }, { id: 'scope', label: 'Scope change' }, { id: 'deadline', label: 'Revised deadline' },
  { id: 'complaint', label: 'Complaint' }, { id: 'design', label: 'Design' }, { id: 'other', label: 'Other' },
];

export interface Escalation {
  id: string;
  tenantId: string;
  projectId: string;
  projectName: string;
  title: string;
  detail: string;
  category: EscalationCategory;
  subjectKey: string | null;
  raisedBy: string;
  raisedByName: string;
  raisedAt: number;
  /** Raised by the daily check rather than a person. */
  auto: boolean;
  status: 'open' | 'decided' | 'closed';
  decision?: string | null;
  decidedBy?: string | null;
  decidedByName?: string | null;
  decidedAt?: number | null;
  closedAt?: number | null;
}

/* ── The studio's settings for the desk ─────────────────────────────────── */

export interface OpsSettings {
  /** Days after an invoice before its payment counts as late. */
  paymentDueDays: number;
  /** Unanswered reminders on one payment or decision before it escalates by itself. */
  escalateAfterReminders: number;
  /** ...and how many days since the first of them. */
  escalateAfterDays: number;
  /** Who is told of an escalation. Empty means the studio's Owners and Admins. */
  escalationRecipients: string[];
}

export const DEFAULT_OPS_SETTINGS: OpsSettings = {
  paymentDueDays: 7, escalateAfterReminders: 2, escalateAfterDays: 7, escalationRecipients: [],
};

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
};

export function opsSettingsOf(org: any): OpsSettings {
  const s = org?.opsDesk || {};
  return {
    paymentDueDays: clampInt(s.paymentDueDays, 0, 90, DEFAULT_OPS_SETTINGS.paymentDueDays),
    escalateAfterReminders: clampInt(s.escalateAfterReminders, 1, 10, DEFAULT_OPS_SETTINGS.escalateAfterReminders),
    escalateAfterDays: clampInt(s.escalateAfterDays, 1, 60, DEFAULT_OPS_SETTINGS.escalateAfterDays),
    escalationRecipients: (Array.isArray(s.escalationRecipients) ? s.escalationRecipients : [])
      .map((e: any) => String(e || '').trim().toLowerCase()).filter(Boolean),
  };
}

/**
 * Who hears of an escalation: the studio's chosen people, else everyone on the
 * team who is an Owner or an Admin (with any other role alongside).
 */
export function escalationRecipientsOf(org: any): string[] {
  const chosen = opsSettingsOf(org).escalationRecipients;
  if (chosen.length) return chosen;
  const team: any[] = Array.isArray(org?.team) ? org.team : [];
  const leads = team.filter((m) => {
    const roles = [m?.role, ...(Array.isArray(m?.roles) ? m.roles : [])].map(String);
    return roles.some((r) => r === 'Owner' || r === 'Admin');
  });
  return [...new Set(leads.map((m) => String(m?.email || '').trim().toLowerCase()).filter(Boolean))];
}

/* ── Dates ───────────────────────────────────────────────────────────────── */

const DAY = 86400000;

/** Milliseconds from a number, an ISO date, a Date or a Firestore Timestamp. */
export function toMs(v: any): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/** The calendar day, YYYY-MM-DD, in India's time. */
export function dayKey(ms: number): string {
  return new Date(ms + 5.5 * 3600000).toISOString().slice(0, 10);
}
const dayStart = (key: string) => new Date(`${key}T00:00:00+05:30`).getTime();
export const daysBetween = (fromMs: number, toMsValue: number) => Math.floor((toMsValue - fromMs) / DAY);
export const addDays = (key: string, n: number) => dayKey(dayStart(key) + n * DAY);

/* ── What the studio is waiting on the client for ────────────────────────── */

export const paymentKey = (milestoneId: string) => `pay:${milestoneId}`;
export const decisionKey = (decisionId: string) => `dec:${decisionId}`;

export interface WaitingItem {
  key: string;
  kind: 'payment' | 'decision';
  projectId: string;
  projectName: string;
  label: string;
  /** When the client was asked: the invoice date, or when the decision went to them. */
  since: number;
  days: number;
  /** Payments only: what the client owes, and when it fell due. */
  amount?: number;
  dueKey?: string;
  overdueDays?: number;
  /** From the follow-up log. */
  reminders: number;
  lastChaseAt: number | null;
}

/** Invoiced and unpaid milestones, from the client's side of the money. */
export function paymentWaiting(project: { id: string; name: string }, money: ClientMoney | null | undefined, settings: OpsSettings, now: number): WaitingItem[] {
  if (!money) return [];
  const out: WaitingItem[] = [];
  for (const m of money.milestones) {
    if (m.status !== 'invoiced') continue;
    const since = toMs(m.invoiceDate) ?? toMs(m.date);
    if (since == null) continue;
    const dueKey = addDays(dayKey(since), settings.paymentDueDays);
    const overdueDays = Math.max(0, daysBetween(dayStart(dueKey), now));
    out.push({
      key: paymentKey(m.id), kind: 'payment', projectId: project.id, projectName: project.name,
      label: m.invoiceNumber ? `${m.name} (${m.invoiceNumber})` : m.name,
      since, days: Math.max(0, daysBetween(since, now)), amount: m.owed, dueKey, overdueDays, reminders: 0, lastChaseAt: null,
    });
  }
  return out;
}

const WAITING_DECISION = new Set(['notified', 'drawing_pending', 'drawing_sent']);

/* "Master bath tiles", or "Tiles (Master bath)" when the room is not already in the words. */
function decisionLabel(d: any): string {
  const text = String(d?.decisionText || d?.title || 'Decision').trim().slice(0, 140);
  const room = String(d?.roomName || '').trim();
  return room && !text.toLowerCase().includes(room.toLowerCase()) ? `${text} (${room})` : text;
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Decisions sent to the client and not yet signed or disputed. */
export function decisionWaiting(project: { id: string; name: string }, decisions: any[], now: number): WaitingItem[] {
  const out: WaitingItem[] = [];
  for (const d of decisions || []) {
    if (!WAITING_DECISION.has(String(d?.status))) continue;
    const since = toMs(d.signoffRequestSentAt) ?? toMs(d.notifiedAt) ?? toMs(d.drawingUploadedAt) ?? toMs(d.createdAt);
    if (since == null) continue;
    out.push({
      key: decisionKey(String(d.id)), kind: 'decision', projectId: project.id, projectName: project.name,
      label: decisionLabel(d),
      since, days: Math.max(0, daysBetween(since, now)), reminders: 0, lastChaseAt: null,
    });
  }
  return out;
}

/* ── Reminders, counted per subject ──────────────────────────────────────── */

export interface ChaseState { reminders: number; firstReminderAt: number | null; lastAt: number | null; lastReplyAt: number | null }

/** The reminders sent since the client last replied or promised, for one subject. */
export function chaseState(entries: Pick<FollowUp, 'at' | 'outcome' | 'subject'>[], key: string): ChaseState {
  const mine = entries.filter((e) => e.subject?.key === key).sort((a, b) => a.at - b.at);
  let reminders = 0;
  let firstReminderAt: number | null = null;
  let lastReplyAt: number | null = null;
  for (const e of mine) {
    if (e.outcome === 'replied' || e.outcome === 'promised') {
      reminders = 0; firstReminderAt = null; lastReplyAt = e.at;
    } else if (e.outcome === 'reminded' || e.outcome === 'no_answer') {
      reminders += 1;
      if (firstReminderAt == null) firstReminderAt = e.at;
    }
  }
  return { reminders, firstReminderAt, lastAt: mine.length ? mine[mine.length - 1].at : null, lastReplyAt };
}

/** Whether a subject has gone unanswered long enough to escalate by itself. */
export function dueForEscalation(state: ChaseState, settings: OpsSettings, now: number): boolean {
  return state.reminders >= settings.escalateAfterReminders
    && state.firstReminderAt != null
    && now - state.firstReminderAt >= settings.escalateAfterDays * DAY;
}

/** The waiting list with each item's reminders filled in from the log. */
export function withChases(items: WaitingItem[], followUps: FollowUp[]): WaitingItem[] {
  return items.map((it) => {
    const st = chaseState(followUps.filter((f) => f.projectId === it.projectId), it.key);
    return { ...it, reminders: st.reminders, lastChaseAt: st.lastAt };
  });
}

/* ── The queue ───────────────────────────────────────────────────────────── */

export type QueueGroup = 'overdue' | 'today' | 'week' | 'later';
export type QueueKind = 'next' | 'payment' | 'decision' | 'mom_review' | 'escalation_open' | 'escalation_decided';

export interface QueueItem {
  id: string;
  group: QueueGroup;
  kind: QueueKind;
  projectId: string;
  projectName: string;
  title: string;
  detail: string;
  /** The day it is due, when it has one. */
  due: string | null;
  /** The record behind it: a follow-up, a waiting item's key, a MoM or an escalation id. */
  ref: string;
}

const groupFor = (due: string, today: string): QueueGroup =>
  due < today ? 'overdue' : due === today ? 'today' : due <= addDays(today, 7) ? 'week' : 'later';

/** How long a chased item rests before it comes back onto the desk. */
export const CHASE_REST_DAYS = 3;

export interface QueueInput {
  now: number;
  me: string;
  /** A lead (Owner, Admin, Ops Director): decides escalations and approves minutes. */
  isLead: boolean;
  followUps: FollowUp[];
  waiting: WaitingItem[];
  moms: { id: string; projectId: string; projectName: string; status: string; meetingTitle?: string; momRef?: string }[];
  escalations: Escalation[];
}

/**
 * Everything that needs this person, overdue first. A next step is theirs when
 * they own it; a payment or decision when it is late and has not been chased
 * in the last few days; minutes and escalations by role.
 */
export function buildQueue(input: QueueInput): QueueItem[] {
  const { now, isLead } = input;
  const me = String(input.me || '').toLowerCase();
  const today = dayKey(now);
  const items: QueueItem[] = [];

  for (const f of input.followUps) {
    if (!f.next || f.nextDone) continue;
    if (String(f.next.ownerEmail || '').toLowerCase() !== me) continue;
    items.push({
      id: `next:${f.id}`, group: groupFor(f.next.due, today), kind: 'next', projectId: f.projectId, projectName: f.projectName,
      title: f.next.text, detail: f.note ? `From ${f.byName || f.by}: ${f.note}` : `Logged by ${f.byName || f.by}`, due: f.next.due, ref: f.id,
    });
  }

  for (const w of input.waiting) {
    const rested = w.lastChaseAt != null && daysBetween(w.lastChaseAt, now) < CHASE_REST_DAYS;
    if (rested) continue;
    if (w.kind === 'payment') {
      if (!w.overdueDays) continue;
      items.push({
        id: `pay:${w.projectId}:${w.key}`, group: 'overdue', kind: 'payment', projectId: w.projectId, projectName: w.projectName,
        title: `Chase payment: ${w.label}`, detail: `${w.overdueDays} day${w.overdueDays === 1 ? '' : 's'} late${w.reminders ? ` · ${w.reminders} reminder${w.reminders === 1 ? '' : 's'} so far` : ' · not chased yet'}`,
        due: w.dueKey || null, ref: w.key,
      });
    } else if (w.days >= CHASE_REST_DAYS) {
      items.push({
        id: `dec:${w.projectId}:${w.key}`, group: 'today', kind: 'decision', projectId: w.projectId, projectName: w.projectName,
        title: `Chase decision: ${w.label}`, detail: `Waiting ${plural(w.days, 'day')}${w.reminders ? ` · ${plural(w.reminders, 'reminder')}` : ''}`,
        due: today, ref: w.key,
      });
    }
  }

  if (isLead) {
    for (const m of input.moms) {
      if (m.status !== 'pending_review') continue;
      items.push({
        id: `mom:${m.id}`, group: 'today', kind: 'mom_review', projectId: m.projectId, projectName: m.projectName,
        title: `Approve minutes: ${m.meetingTitle || m.momRef || 'Meeting'}`, detail: 'Sent for your approval before they go to the client', due: today, ref: m.id,
      });
    }
  }

  for (const e of input.escalations) {
    if (isLead && e.status === 'open') {
      items.push({
        id: `esc:${e.id}`, group: 'today', kind: 'escalation_open', projectId: e.projectId, projectName: e.projectName,
        title: `Decide: ${e.title}`, detail: `${e.auto ? 'Raised automatically' : `Raised by ${e.raisedByName || e.raisedBy}`} · ${daysBetween(e.raisedAt, now) ? `${plural(daysBetween(e.raisedAt, now), 'day')} ago` : 'today'}`, due: today, ref: e.id,
      });
    }
    /* A decision goes back to whoever raised it; one the daily check raised, to Client Relations. */
    if (e.status === 'decided' && (String(e.raisedBy || '').toLowerCase() === me || (e.auto && !isLead))) {
      items.push({
        id: `escd:${e.id}`, group: 'today', kind: 'escalation_decided', projectId: e.projectId, projectName: e.projectName,
        title: `Decision back: ${e.title}`, detail: `${e.decidedByName || e.decidedBy}: ${e.decision || ''}`.slice(0, 200), due: today, ref: e.id,
      });
    }
  }

  const order: Record<QueueGroup, number> = { overdue: 0, today: 1, week: 2, later: 3 };
  /* Within a day: what needs a decision, then money, then the rest. */
  const weight: Record<QueueKind, number> = { escalation_open: 0, escalation_decided: 1, payment: 2, decision: 3, mom_review: 4, next: 5 };
  return items.sort((a, b) => order[a.group] - order[b.group] || String(a.due || '').localeCompare(String(b.due || ''))
    || weight[a.kind] - weight[b.kind] || a.title.localeCompare(b.title));
}

/* ── Copy-and-send messages ──────────────────────────────────────────────── */

export const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.round(n || 0));

const niceDate = (key?: string | null) =>
  key ? new Date(`${key}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '';

export interface DraftContext {
  clientName: string;
  projectName: string;
  label: string;
  amount?: number;
  dueKey?: string | null;
  days?: number;
  senderName: string;
  studioName: string;
}

/**
 * A message to copy into WhatsApp or an email. Plain, polite and specific:
 * the amount and its date for a payment, what is pending for a decision. The
 * firmer tones say what waiting is holding up, never threaten.
 */
export function draftMessage(kind: SubjectKind, tone: Tone, c: DraftContext): string {
  const hi = `Hi ${c.clientName || 'there'},`;
  const sign = `\n\nRegards,\n${c.senderName}${c.studioName ? `\n${c.studioName}` : ''}`;
  if (kind === 'payment') {
    const amt = c.amount ? ` of ${inr(c.amount)}` : '';
    const due = c.dueKey ? ` (due ${niceDate(c.dueKey)})` : '';
    if (tone === 'gentle') return `${hi}\n\nA gentle reminder about the payment${amt} for ${c.label}${due} on ${c.projectName}. Please let us know once it is done, or if you need the invoice again.${sign}`;
    if (tone === 'clear') return `${hi}\n\nThe payment${amt} for ${c.label} on ${c.projectName} was due${c.dueKey ? ` on ${niceDate(c.dueKey)}` : ''} and is still pending. Could you share when we can expect it? The next stage of work is planned around it.${sign}`;
    return `${hi}\n\nThe payment${amt} for ${c.label} on ${c.projectName} has been pending for ${c.days ?? 'several'} days${c.dueKey ? ` since it fell due on ${niceDate(c.dueKey)}` : ''}. We will need it cleared to keep the next stage on schedule. Please confirm a date for the transfer this week.${sign}`;
  }
  if (kind === 'decision') {
    if (tone === 'gentle') return `${hi}\n\nJust checking in on ${c.label} for ${c.projectName}. Whenever you are ready, please share your go-ahead, or tell us if you would like to go over it once more.${sign}`;
    if (tone === 'clear') return `${hi}\n\nWe are waiting for your approval on ${c.label} for ${c.projectName}${c.days ? ` (sent ${c.days} days ago)` : ''}. The next steps on site depend on it. Could you confirm, or let us know what you would like changed?${sign}`;
    return `${hi}\n\n${c.label} for ${c.projectName} has been waiting for your approval for ${c.days ?? 'several'} days, and the work that follows it is now on hold. Please confirm this week so we can keep to the dates agreed.${sign}`;
  }
  if (tone === 'gentle') return `${hi}\n\nHope you are doing well. A quick update from us on ${c.projectName}: ${c.label}. Do let us know if you have any questions.${sign}`;
  if (tone === 'clear') return `${hi}\n\nAbout ${c.projectName}: ${c.label}. Could you get back to us on this when you can?${sign}`;
  return `${hi}\n\nAbout ${c.projectName}: ${c.label}. We need your reply this week to keep things on schedule.${sign}`;
}

/* ── The daily check ─────────────────────────────────────────────────────── */

export interface SweepCandidate {
  projectId: string;
  projectName: string;
  subject: Subject;
  state: ChaseState;
  /** Stable per episode of chasing, so the check raises each one once. */
  escalationId: string;
}

/**
 * The payments and decisions that have gone unanswered long enough to put in
 * front of a lead, from a studio's recent follow-up log. Each episode of
 * chasing -- from the first unanswered reminder -- escalates once.
 */
export function sweepCandidates(followUps: FollowUp[], settings: OpsSettings, now: number): SweepCandidate[] {
  const bySubject = new Map<string, FollowUp[]>();
  for (const f of followUps) {
    if (!f.subject?.key || f.subject.kind === 'general') continue;
    const k = `${f.projectId}|${f.subject.key}`;
    bySubject.set(k, [...(bySubject.get(k) || []), f]);
  }
  const out: SweepCandidate[] = [];
  for (const [k, entries] of bySubject) {
    const [projectId, key] = k.split('|');
    const state = chaseState(entries, key);
    if (!dueForEscalation(state, settings, now)) continue;
    const latest = entries.reduce((a, b) => (b.at > a.at ? b : a));
    out.push({
      projectId, projectName: latest.projectName, subject: latest.subject as Subject, state,
      escalationId: `auto_${key.replace(/[^A-Za-z0-9_-]/g, '_')}_${state.firstReminderAt}`,
    });
  }
  return out;
}
