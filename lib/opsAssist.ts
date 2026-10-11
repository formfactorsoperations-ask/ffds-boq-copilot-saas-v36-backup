/*
  SMART ASSIST FOR THE OPS DESK (Phase 2).

  Four helps for whoever looks after the studio's clients, each built on the
  records the desk already reads (lib/opsDesk.ts):

    - a project brief: everything about one project a client might ask
      after, in one place, for "Ask the project" and the meeting prep;
    - meeting prep: what is open on both sides, what the studio is waiting
      for, the money, and a suggested agenda;
    - capture: what a pasted WhatsApp chat or a voice note said, turned into
      follow-up lines and escalations the executive ticks before saving;
    - delay to handover: how long each wait can hold the handover up.

  The brief is built from the copy of a project without the studio's side of
  the money (functions/src/teamViewStrip opsViewOf), so nothing here -- and
  nothing sent to the AI -- can carry a margin, a cost or a rate. Pure, so the
  tests run it.
*/
import type { ClientMoney, ClientMilestone } from './clientMoney';
import { addDays, dayKey, toMs, type Escalation, type FollowUp, type WaitingItem, type Channel, type EscalationCategory } from './opsDesk';

const DAY = 86400000;

/* ── Delay to handover ───────────────────────────────────────────────────── */

/** Days a client may sit on a decision before the work after it starts to slip. */
export const DECISION_GRACE_DAYS = 3;

export interface Slip {
  /** How many days this wait can move handover by, as an estimate. */
  days: number;
  /** The planned handover, and where it lands if the wait holds it up. */
  handoverKey: string | null;
  newHandoverKey: string | null;
}

const isDayKey = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);

/**
 * An estimate, and said to be one: a late payment holds the next stage by the
 * days it is late; a decision, by the days past a short grace period.
 */
export function handoverSlip(w: WaitingItem, targetHandover?: string | null): Slip {
  const days = w.kind === 'payment' ? Math.max(0, w.overdueDays || 0) : Math.max(0, w.days - DECISION_GRACE_DAYS);
  const handoverKey = isDayKey(targetHandover) ? String(targetHandover).slice(0, 10) : null;
  return { days, handoverKey, newHandoverKey: handoverKey && days ? addDays(handoverKey, days) : null };
}

/** Waits on one project run side by side, so the project slips by the longest of them, not their sum. */
export const projectSlipDays = (slips: Slip[]) => slips.reduce((m, s) => Math.max(m, s.days), 0);

/* ── The project brief ───────────────────────────────────────────────────── */

export interface BriefAction { text: string; side: 'studio' | 'client' | 'other'; ownerName: string | null; due: string | null; from: string | null }
export interface ProjectBrief {
  id: string;
  name: string;
  clientName: string;
  status: string;
  location: string | null;
  targetHandover: string | null;
  timeline: { phase: string; startDay: number; days: number }[];
  money: { projectValue: number; totalPaid: number; balanceDue: number; milestones: Pick<ClientMilestone, 'name' | 'status' | 'owed' | 'invoiceNumber' | 'invoiceDate' | 'date'>[] } | null;
  waiting: { label: string; kind: 'payment' | 'decision'; days: number; overdueDays: number; amount: number | null; reminders: number; slipDays: number }[];
  decisions: { text: string; status: string; room: string | null }[];
  actions: BriefAction[];
  lastMeeting: { title: string; date: string | null; ref: string | null; summary: string | null } | null;
  followUps: { when: string; by: string; channel: Channel; outcome: string; note: string; next: string | null }[];
  escalations: { title: string; status: string; decision: string | null }[];
}

export interface BriefInputs {
  followUps: FollowUp[];
  escalations: Escalation[];
  decisions: any[];
  moms: { id: string; status: string; meetingTitle?: string; momRef?: string; meetingDate?: number; raw: any }[];
}

const SIDE = (owner: unknown): BriefAction['side'] => {
  const o = String(owner || '').toLowerCase();
  if (o === 'client') return 'client';
  if (o === 'ffds' || o === 'studio' || o === 'designer' || o === 'ops') return 'studio';
  return 'other';
};
const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * One project, as far as its clients go. `view` must be the copy without the
 * studio's money (a Client Relations copy, or opsViewOf of a full project).
 */
export function buildProjectBrief(view: any, inputs: BriefInputs, waiting: WaitingItem[], now: number): ProjectBrief {
  const ctx = view?.context || {};
  const money: ClientMoney | null = view?.clientMoney || null;
  const target = ctx.targetHandoverDate || null;

  const shared = (inputs.moms || []).filter((m) => ['finalised', 'shared', 'acknowledged', 'correction_requested'].includes(String(m.status)));
  const latest = [...shared].sort((a, b) => (b.meetingDate || 0) - (a.meetingDate || 0))[0] || null;
  const actions: BriefAction[] = [];
  for (const m of shared) {
    for (const a of (m.raw?.actionItems || [])) {
      if (a?.status !== 'open') continue;
      actions.push({ text: clip(a.text, 200), side: SIDE(a.owner), ownerName: a.ownerName ? clip(a.ownerName, 60) : null, due: toMs(a.dueDate) ? dayKey(toMs(a.dueDate)!) : null, from: m.momRef || m.meetingTitle || null });
    }
  }

  return {
    id: String(view?.id || ''),
    name: clip(ctx.name || 'Project', 120),
    clientName: clip(ctx.clientName || ctx.client?.name || '', 80),
    status: clip(ctx.status || '', 40),
    location: ctx.location ? clip(ctx.location, 80) : null,
    targetHandover: isDayKey(target) ? String(target).slice(0, 10) : null,
    timeline: (Array.isArray(view?.timeline) ? view.timeline : []).slice(0, 20).map((t: any) => ({
      phase: clip(t?.phaseName || t?.phase || '', 60), startDay: Number(t?.startDay) || 0, days: Number(t?.durationDays) || 0,
    })),
    money: money ? {
      projectValue: money.projectValue, totalPaid: money.totalPaid, balanceDue: money.balanceDue,
      milestones: money.milestones.map((m) => ({ name: m.name, status: m.status, owed: m.owed, invoiceNumber: m.invoiceNumber, invoiceDate: m.invoiceDate, date: m.date })),
    } : null,
    waiting: waiting.filter((w) => w.projectId === String(view?.id || '')).map((w) => ({
      label: w.label, kind: w.kind, days: w.days, overdueDays: w.overdueDays || 0, amount: w.amount ?? null, reminders: w.reminders,
      slipDays: handoverSlip(w, target).days,
    })),
    decisions: (inputs.decisions || []).slice(0, 30).map((d: any) => ({ text: clip(d.decisionText || d.title, 160), status: String(d.status || ''), room: d.roomName ? clip(d.roomName, 60) : null })),
    actions: actions.slice(0, 30),
    lastMeeting: latest ? {
      title: clip(latest.meetingTitle || 'Meeting', 100), date: latest.meetingDate ? dayKey(latest.meetingDate) : null,
      ref: latest.momRef || null, summary: latest.raw?.summary ? clip(latest.raw.summary, 500) : null,
    } : null,
    followUps: [...(inputs.followUps || [])].sort((a, b) => b.at - a.at).slice(0, 12).map((f) => ({
      when: dayKey(f.at), by: clip(f.byName || f.by, 60), channel: f.channel, outcome: f.outcome, note: clip(f.note, 300),
      next: f.next && !f.nextDone ? `${clip(f.next.text, 120)} (${f.next.ownerName}, ${f.next.due})` : null,
    })),
    escalations: (inputs.escalations || []).filter((e) => e.status !== 'closed').map((e) => ({ title: clip(e.title, 160), status: e.status, decision: e.decision ? clip(e.decision, 300) : null })),
  };
}

/* ── Meeting prep ────────────────────────────────────────────────────────── */

export interface MeetingPrep {
  ours: BriefAction[];
  theirs: BriefAction[];
  waiting: ProjectBrief['waiting'];
  moneyLine: string | null;
  lastMeeting: ProjectBrief['lastMeeting'];
  recent: ProjectBrief['followUps'];
  escalations: ProjectBrief['escalations'];
  /** Suggested order for the meeting; the AI may refine it. */
  agenda: string[];
}

const fmtInr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.round(n || 0));

export function meetingPrep(b: ProjectBrief): MeetingPrep {
  const ours = b.actions.filter((a) => a.side !== 'client');
  const theirs = b.actions.filter((a) => a.side === 'client');
  const late = b.waiting.filter((w) => w.kind === 'payment' && w.overdueDays > 0);
  const next = b.money?.milestones.find((m) => m.status === 'invoiced') || b.money?.milestones.find((m) => m.status === 'pending') || null;
  const moneyLine = late.length
    ? `${late.map((w) => `${w.label}${w.amount ? ` (${fmtInr(w.amount)})` : ''}, ${w.overdueDays} days late`).join('; ')}`
    : next ? `Next: ${next.name}${next.owed ? `, ${fmtInr(next.owed)}` : ''} (${next.status})` : null;

  const agenda: string[] = [];
  for (const w of b.waiting.filter((x) => x.kind === 'decision').slice(0, 2)) agenda.push(`Decision: ${w.label}. Get a yes, or what to change`);
  if (theirs.length) agenda.push(`Your open actions: ${theirs.slice(0, 3).map((a) => a.text).join('; ')}`);
  if (ours.length) agenda.push(`Our update: ${ours.slice(0, 3).map((a) => a.text).join('; ')}`);
  if (late.length) agenda.push(`Payment: ${late.map((w) => w.label).join(', ')}`);
  agenda.push('Next dates, and who does what');

  return { ours, theirs, waiting: b.waiting, moneyLine, lastMeeting: b.lastMeeting, recent: b.followUps.slice(0, 5), escalations: b.escalations, agenda: agenda.slice(0, 7) };
}

/** The agenda as text, to send the client or to start the minutes from. */
export function agendaText(projectName: string, agenda: string[], when?: string | null): string {
  return `Agenda: ${projectName}${when ? `, ${when}` : ''}\n\n${agenda.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
}

/* ── Capture a chat or a call ────────────────────────────────────────────── */

export type CaptureKind = 'our_promise' | 'client_promise' | 'date' | 'extra_work' | 'open_question';
export const CAPTURE_GROUPS: { kind: CaptureKind; label: string; becomes: string }[] = [
  { kind: 'our_promise', label: 'We promised', becomes: 'A next step on your desk' },
  { kind: 'client_promise', label: 'The client promised', becomes: 'A check on your desk' },
  { kind: 'date', label: 'Dates to remember', becomes: 'A reminder on your desk' },
  { kind: 'open_question', label: 'Questions to answer', becomes: 'A next step on your desk' },
  { kind: 'extra_work', label: 'Extra work asked for', becomes: 'An escalation for the leads to decide' },
];

export interface CaptureItem { id: string; kind: CaptureKind; text: string; due: string | null; selected: boolean }
export interface Capture { summary: string; mood: string; moodQuote: string; items: CaptureItem[] }

/** Whatever the AI answered, made safe to show and save: known kinds, real dates, bounded lengths. */
export function normaliseCapture(raw: any): Capture {
  const kinds = new Set(CAPTURE_GROUPS.map((g) => g.kind));
  const items: CaptureItem[] = (Array.isArray(raw?.items) ? raw.items : [])
    .filter((x: any) => kinds.has(x?.kind) && clip(x?.text, 300))
    .slice(0, 20)
    .map((x: any, i: number) => ({
      id: `c${i}`, kind: x.kind as CaptureKind, text: clip(x.text, 300),
      due: isDayKey(x?.due) && !Number.isNaN(Date.parse(String(x.due).slice(0, 10))) ? String(x.due).slice(0, 10) : null,
      selected: true,
    }));
  return { summary: clip(raw?.summary, 600), mood: clip(raw?.mood, 80), moodQuote: clip(raw?.moodQuote, 200), items };
}

export interface CaptureLine { note: string; outcome: 'info' | 'promised'; next: { text: string; due: string } | null; withSubject: boolean }
export interface CaptureEscalation { title: string; detail: string; category: EscalationCategory }

/**
 * What saving a capture writes: one line for the conversation itself, one
 * per ticked promise, date or question (each with its own next step, so it
 * lands on someone's desk), and an escalation for extra work, which the
 * executive never prices.
 */
export function captureToRecords(c: Capture, source: string, today: string): { lines: CaptureLine[]; escalations: CaptureEscalation[] } {
  const picked = c.items.filter((i) => i.selected);
  const promisedByClient = picked.some((i) => i.kind === 'client_promise');
  const lines: CaptureLine[] = [{
    note: `${source}: ${c.summary || 'Conversation captured'}${c.mood ? ` Mood: ${c.mood}${c.moodQuote ? ` ("${c.moodQuote}")` : ''}.` : ''}`.slice(0, 2000),
    outcome: promisedByClient ? 'promised' : 'info', next: null, withSubject: true,
  }];
  const escalations: CaptureEscalation[] = [];
  for (const i of picked) {
    if (i.kind === 'extra_work') {
      escalations.push({ title: `Extra work asked for: ${i.text}`.slice(0, 200), detail: `${source}. ${c.summary}`.slice(0, 2000), category: 'scope' });
      continue;
    }
    const lead = { our_promise: 'We promised', client_promise: 'Client promised', date: 'Date to remember', open_question: 'Client asked' }[i.kind];
    const next = { our_promise: i.text, client_promise: `Check: ${i.text}`, date: `Remember: ${i.text}`, open_question: `Answer: ${i.text}` }[i.kind];
    const fallback = i.kind === 'client_promise' ? 3 : 2;
    lines.push({ note: `${lead}: ${i.text}`, outcome: i.kind === 'client_promise' ? 'promised' : 'info', next: { text: next.slice(0, 300), due: i.due || addDays(today, fallback) }, withSubject: i.kind === 'client_promise' });
  }
  return { lines, escalations };
}

/* ── Prompts ─────────────────────────────────────────────────────────────── */

/** The brief as compact text, for the AI to read. */
export function briefForPrompt(b: ProjectBrief): string {
  return JSON.stringify(b, null, 0);
}

export const CAPTURE_INSTRUCTIONS = `You read a conversation between an interior design studio and its client: a pasted WhatsApp chat, or a voice note recorded after a call.
Return JSON with:
- summary: two sentences, plain English, what was discussed and decided.
- mood: a few words on how the client seems (e.g. "Anxious about delays", "Happy with progress").
- moodQuote: the client's own words that show it, or "".
- items: each thing worth acting on, with kind one of:
  our_promise (something the studio said it will do), client_promise (something the client said they will do, e.g. pay or choose),
  date (a date that matters to the client, e.g. a family visit), open_question (something the client asked that still needs an answer),
  extra_work (work the client asked for that may be outside the agreed scope).
  text: one short line in plain English. due: YYYY-MM-DD if a date is stated or clearly implied, else "".
Use only what is said. Do not invent amounts, dates or names. Never mention prices for extra work.`;

export const ASK_INSTRUCTIONS = `You answer questions about one interior design project for the studio's client relations executive, using only the JSON record given.
Rules:
- Answer in two to four plain sentences. Name dates and amounts exactly as the record has them.
- If the record does not say, answer "The records don't say." and suggest who to ask (the designer or a lead).
- The record has no costs, margins or vendor rates. If asked about them, say they are not part of this record.
- sources: the parts of the record you used, as short labels (e.g. "Payments", "Decision: Master bath tiles", "MoM-2026-014", "Follow-up 9 Oct").
- reply: a short message the executive could send the client with the answer, or "" if the answer is not for the client.`;

export const PREP_INSTRUCTIONS = `You help the studio's client relations executive prepare for a meeting with the client of one interior design project, using only the JSON record given.
Return JSON with:
- watchOuts: up to four short points to keep in mind (client worries, things promised and not done, sensitive topics, dates that matter to them).
- agenda: four to six agenda points in a sensible order, each one short line.
Use only what the record says.`;
