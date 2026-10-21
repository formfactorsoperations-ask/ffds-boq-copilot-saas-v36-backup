/*
  THE OPS DESK FOR A TEAM.

  The desk was built for one Client Relations executive. This is what it
  needs to work for several (mockups OD1 to OD6, approved 19 Oct 2026):

  - the studio's real work apart from its dummy projects (DeskScope);
  - every row able to say why it is there, what to do and what happens if it
    waits, with the playbook the leads wrote for that kind of work;
  - a first-week guide on a new joiner's real clients;
  - closing the day: what was closed, what rolls to tomorrow, a note for the lead;
  - the lead's view of each person's desk.

  Pure, and shared by the screens and the tests.
*/
import { classifyProject } from './projectClassification';
import {
  buildQueue, dayKey, daysBetween, addDays,
  type Escalation, type FollowUp, type OpsSettings, type QueueItem, type QueueKind, type WaitingItem,
} from './opsDesk';
import { leadQueue, type Lead } from './leads';

/* ── Actual and dummy projects ──────────────────────────────────────────── */

/**
 * Which projects the desk works on. A project is what its tag says
 * (lib/projectClassification): Actual, Dummy, or not tagged yet.
 */
export type DeskScope = 'all' | 'actual' | 'dummy' | 'untagged';
export const DESK_SCOPES: { id: DeskScope; label: string }[] = [
  { id: 'actual', label: 'Actual' }, { id: 'dummy', label: 'Dummy' }, { id: 'untagged', label: 'Untagged' }, { id: 'all', label: 'All' },
];

export function inDeskScope(project: any, scope: DeskScope): boolean {
  if (scope === 'all') return true;
  const k = classifyProject(project);
  return scope === 'dummy' ? k === 'test' : k === scope;
}

export function scopeCounts(projects: any[]): Record<DeskScope, number> {
  const out: Record<DeskScope, number> = { all: 0, actual: 0, dummy: 0, untagged: 0 };
  for (const p of projects || []) {
    out.all++;
    const k = classifyProject(p);
    out[k === 'test' ? 'dummy' : k]++;
  }
  return out;
}

/* ── The kinds of work, for the Today filter ────────────────────────────── */

export type WorkFilter = 'all' | 'calls' | 'meetings' | 'paperwork';
export const WORK_FILTERS: { id: WorkFilter; label: string }[] = [
  { id: 'all', label: 'Everything' }, { id: 'calls', label: 'Calls' }, { id: 'meetings', label: 'Meetings' }, { id: 'paperwork', label: 'Paperwork' },
];
const WORK: Record<QueueKind, WorkFilter> = {
  next: 'calls', payment: 'calls', decision: 'calls', ask: 'calls', lead: 'calls', escalation_decided: 'calls',
  visit: 'meetings', mom_review: 'meetings',
  documents: 'paperwork', checklist: 'paperwork', escalation_open: 'paperwork', lead_open: 'paperwork',
};
export const matchesWork = (q: Pick<QueueItem, 'kind'>, f: WorkFilter) => f === 'all' || WORK[q.kind] === f;

/* ── Playbooks: the "?" on every row ─────────────────────────────────────── */

export type PlaybookKind = 'payment' | 'decision' | 'next' | 'lead' | 'minutes' | 'escalation' | 'visit' | 'documents' | 'ask';
export const PLAYBOOK_OF: Record<QueueKind, PlaybookKind> = {
  payment: 'payment', decision: 'decision', next: 'next', lead: 'lead', lead_open: 'lead', mom_review: 'minutes',
  escalation_open: 'escalation', escalation_decided: 'escalation', visit: 'visit', documents: 'documents', checklist: 'documents', ask: 'ask',
};

export interface Playbook { title: string; steps: string[]; dont: string }

export const DEFAULT_PLAYBOOKS: Record<PlaybookKind, Playbook> = {
  payment: {
    title: 'Waiting on client: a payment',
    steps: [
      'Remind on the day it falls due, in the client’s channel (WhatsApp for most), with the milestone and the invoice number.',
      'If there is no reply in three days, call. Log the call even when nobody answers.',
      'After the unanswered reminders the studio set, the daily check escalates it to a lead. You do not need to ask.',
      'When the client names a date, log it as “promised” with a next step on that date.',
    ],
    dont: 'Do not discuss amounts, discounts or the schedule. Say you will check with a lead and log it as a next step.',
  },
  decision: {
    title: 'Waiting on client: a decision',
    steps: [
      'Remind on the day it is due, in the client’s channel (WhatsApp for most).',
      'Second reminder after three days, with a call if you can.',
      'After two reminders and seven days the daily check escalates it. You do not need to ask.',
      'When they decide, record it on the decision. Never only in WhatsApp.',
    ],
    dont: 'Do not promise dates or prices for the studio. Say you will check with a lead or the designer and log it as a next step.',
  },
  next: {
    title: 'A next step',
    steps: [
      'Do it today, or move it to the day you will.',
      'After a call or a message, log it: what was said and the next step with its date.',
      'Tick it done here once it is done. A step for someone else goes on their desk.',
    ],
    dont: 'Do not leave it overdue without a word: move it, or raise an escalation if it is stuck.',
  },
  lead: {
    title: 'A new enquiry',
    steps: [
      'Call within the hour. If nobody answers, send our introduction on WhatsApp and log both.',
      'On the first call, ask who decides, possession, the rooms, the style and what they want to spend.',
      'Book a studio meeting or a site visit before you end the call.',
      'Once the site is measured, ask a lead to open the project.',
    ],
    dont: 'Do not quote prices or rates. The proposal does that, after the site is measured.',
  },
  minutes: {
    title: 'Minutes',
    steps: [
      'Write them the same day as the meeting, from your notes.',
      'Send them for approval. A lead approves or returns them with notes on the lines.',
      'Once approved, send them to the client, who confirms or marks the line that is wrong.',
    ],
    dont: 'Do not send minutes to the client before they are approved.',
  },
  escalation: {
    title: 'An escalation',
    steps: [
      'Raise one when something is stuck and only a lead can unblock it: say what, since when, and what you have tried.',
      'The lead decides on the desk; the decision comes back to you.',
      'Act on the decision, tell the client, then close it.',
    ],
    dont: 'Do not tell the client a lead has decided before the decision is here.',
  },
  visit: {
    title: 'A meeting or site visit',
    steps: [
      'Agree a time with the client and confirm it here, so it is on everyone’s week.',
      'The day before, check the designer or supervisor can make it.',
      'After it, mark it done and write the minutes.',
    ],
    dont: 'Do not confirm a time with the client before the studio’s side can make it.',
  },
  documents: {
    title: 'Documents and checklists',
    steps: [
      'Ask for what is missing in one message, as a list.',
      'Tick each item as it arrives. A lead marks the checklist complete.',
      'Chase again after three days.',
    ],
    dont: 'Do not take documents only on WhatsApp: upload them to the project.',
  },
  ask: {
    title: 'A review or a referral',
    steps: [
      'Ask only a client who is happy: after praise, a milestone well done, or handover.',
      'Use the message here; it carries the studio’s review link.',
      'Log it, and thank them when they do.',
    ],
    dont: 'Do not ask while a payment is late or an escalation is open.',
  },
};

/** The studio's playbook for a kind of work: what a lead wrote, else the desk's own. */
export function playbookOf(kind: PlaybookKind, settings: Pick<OpsSettings, 'playbooks'> | null | undefined): Playbook & { custom: boolean } {
  const base = DEFAULT_PLAYBOOKS[kind];
  const mine = settings?.playbooks?.[kind];
  if (!mine) return { ...base, custom: false };
  return { title: base.title, steps: mine.steps.length ? mine.steps : base.steps, dont: mine.dont || base.dont, custom: true };
}

/* ── Why each row is here ───────────────────────────────────────────────── */

export interface Explained { why: string; todo: string; ifWaits: string }

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmt = (key?: string | null) => (key ? new Date(`${key}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '');

/**
 * Why a row is on the desk, what to do about it and what happens if it waits,
 * in the desk's own words, from the records behind it.
 */
export function explain(q: QueueItem, x: { waiting?: WaitingItem | null; settings: Pick<OpsSettings, 'escalateAfterReminders' | 'escalateAfterDays'>; slipDays?: number; leadOwner?: string }): Explained {
  const s = x.settings;
  const w = x.waiting;
  const slip = x.slipDays && x.slipDays > 0 ? ` It can already hold the handover by about ${plural(x.slipDays, 'day')}.` : '';
  switch (q.kind) {
    case 'payment':
      return {
        why: `${w?.label || 'The milestone'} was invoiced ${w ? plural(w.days, 'day') : 'some days'} ago${w?.dueKey ? ` and fell due ${fmt(w.dueKey)}` : ''}. ${w?.reminders ? `${plural(w.reminders, 'reminder')} so far, no reply.` : 'It has not been chased yet.'}`,
        todo: w?.reminders ? 'Call the client today. Thank them, remind them of the milestone and invoice, and ask for a date.' : 'Send the reminder below on WhatsApp, then log it.',
        ifWaits: `The next stage of work is planned around it.${slip} After ${plural(s.escalateAfterReminders, 'unanswered reminder')} and ${plural(s.escalateAfterDays, 'day')}, the daily check puts it in front of a lead.`,
      };
    case 'decision':
      return {
        why: `${w?.label || 'The decision'} went to the client ${w ? plural(w.days, 'day') : 'some days'} ago and is not signed yet.${w?.reminders ? ` ${plural(w.reminders, 'reminder')} so far.` : ''}`,
        todo: 'Remind them today, and offer a short call with the designer to decide together. If they want something else, log that as the answer.',
        ifWaits: `The work that follows it waits too.${slip} After ${plural(s.escalateAfterReminders, 'reminder')} and ${plural(s.escalateAfterDays, 'day')} it goes to a lead by itself.`,
      };
    case 'next':
      return {
        why: `A next step on you${q.due ? `, due ${fmt(q.due)}` : ''}. ${q.detail}`,
        todo: 'Do it, log what happened, and tick it done. Or move it to the day you will.',
        ifWaits: 'It stays at the top of your list, and the lead sees it as overdue on the team view.',
      };
    case 'lead':
      return {
        why: q.title.startsWith('New lead') ? `A new enquiry ${q.detail}.` : q.title.startsWith('Gone quiet') || q.title.startsWith('Quiet') ? `Nobody has spoken to them: ${q.detail}.` : `The next step on this lead is due${q.due ? ` ${fmt(q.due)}` : ''}.`,
        todo: q.title.startsWith('New lead') ? 'Call now. Ask the first-call questions on the lead, and book a meeting before you hang up.' : 'Call or message them, log it, and set the next step.',
        ifWaits: 'Enquiries go cold within days, and most call the next studio on their list. After ten quiet days the lead sees it.',
      };
    case 'lead_open':
      return {
        why: `${q.detail.split(' · ')[0]} to open this lead as a project: the site is measured and the brief is ready.`,
        todo: 'Check what was collected and open the project. It goes back on their desk, assigned to them.',
        ifWaits: 'The proposal cannot start until the project exists, and the client is waiting for it.',
      };
    case 'mom_review':
      return {
        why: 'Minutes written by Client Relations are waiting for your approval.',
        todo: 'Read them, edit if needed, then approve or return them with notes on the lines.',
        ifWaits: 'The client hears nothing about what was agreed until they are approved and sent.',
      };
    case 'escalation_open':
      return {
        why: `${q.detail}. Only a lead can decide it.`,
        todo: 'Decide it here. Your decision goes back to whoever raised it.',
        ifWaits: 'Whatever is stuck stays stuck, and the client is usually waiting on it.',
      };
    case 'escalation_decided':
      return {
        why: `A lead decided: ${q.detail}`,
        todo: 'Act on it and tell the client. Then close the escalation.',
        ifWaits: 'The client is waiting for the answer the lead has already given.',
      };
    case 'visit':
      return {
        why: q.detail || 'A meeting or visit the client asked for, or the studio needs.',
        todo: 'Agree a time with the client and confirm it here, so it is on everyone’s week.',
        ifWaits: 'An unconfirmed visit is the one that gets missed.',
      };
    case 'documents':
    case 'checklist':
      return {
        why: q.detail || 'Some of the checklist is still open.',
        todo: 'Ask for everything missing in one message, then tick each item as it arrives.',
        ifWaits: q.kind === 'documents' ? 'Work that needs the document, or the handover, waits for it.' : 'The stage cannot be marked complete until it is.',
      };
    case 'ask':
    default:
      return {
        why: q.detail || 'A good moment to ask.',
        todo: 'Send the message here, then log it.',
        ifWaits: 'The moment passes. A happy client is most likely to say yes this week.',
      };
  }
}

/** One line for each kind, on the Up next card: why now, what to say, if nobody answers. */
export function upNextLines(q: QueueItem, e: Explained): [string, string][] {
  const say: Partial<Record<QueueKind, string>> = {
    payment: 'A ready message: thank, remind, give the invoice again, ask for a date.',
    decision: 'A ready message: what is pending, and an offer of a short call to decide.',
    lead: 'Introduce the studio, ask the first-call questions, book a meeting.',
  };
  return [
    ['Why now', e.ifWaits],
    ['What to say', say[q.kind] || e.todo],
    ['If no answer', q.kind === 'payment' || q.kind === 'decision' || q.kind === 'lead'
      ? 'Log it anyway. Unanswered reminders are what let the daily check escalate it for you.'
      : 'Move it to later today, or to tomorrow when you close your day.'],
  ];
}

/* ── Words on the desk ───────────────────────────────────────────────────── */

export const GLOSSARY: [string, string][] = [
  ['Waiting on client', 'A payment or decision the studio needs from the client before work can go on.'],
  ['Escalation', 'Something stuck, put in front of the Owner, Admin or Ops Director to decide.'],
  ['Client pulse', 'How each client is doing: late payments, slow replies, mood in the last chats.'],
  ['Handover +7d', 'Our estimate of how far a waiting item can push the handover.'],
  ['Minutes', 'The record of a meeting. You write them, a lead approves, the client confirms.'],
  ['Lead', 'An enquiry that is not a project yet. It becomes one when a lead opens it.'],
  ['The daily check', 'Runs at 9 every morning and escalates what has gone unanswered too long.'],
];

export const TIPS = [
  'Log a call even when nobody answers. Unanswered reminders are what let the daily check escalate a late payment for you.',
  'A next step for someone else goes on their desk. Use it instead of a WhatsApp to a colleague.',
  'Call a new enquiry within the hour. Most call the next studio on their list the same day.',
  'Record a client’s decision on the decision itself, never only in WhatsApp.',
  'Closing your day takes a minute, and your lead sees tomorrow’s list before you arrive.',
  'Any client name on the desk opens everything about that client in one place.',
  'Ask a happy client for a review the week of a milestone, not months later.',
];
export const tipOfDay = (now: number) => TIPS[Math.floor(now / 86400000) % TIPS.length];

/* ── The first week ──────────────────────────────────────────────────────── */

export type GuideStepId = 'clients' | 'today' | 'log' | 'escalate' | 'minutes' | 'lead';
export interface GuideStep { id: GuideStepId; title: string; detail: string; /** The data-tour id of the button "Show me" points at. */ target: string; tip: string }

export const GUIDE_STEPS: GuideStep[] = [
  { id: 'clients', title: 'Meet your clients', detail: 'The projects you were given, what stage each is in, who to call.', target: 'clients', tip: 'These are your clients. Tap a name to see everything about them in one place: what is open, and every call and message so far.' },
  { id: 'today', title: 'Read your Today list', detail: 'What each kind of row means and the order it is in.', target: 'today', tip: 'Overdue first, then today. Tap a row to see why it is there and what to do; the ? opens the playbook for that kind of work.' },
  { id: 'log', title: 'Log your first call', detail: 'Use Log a follow-up after any call, even unanswered.', target: 'log', tip: 'Call the client at the top of Today, then press this. Pick what came of it and the next step; that is all.' },
  { id: 'escalate', title: 'Know when to escalate', detail: 'What the daily check does for you, and when to raise one yourself.', target: 'escalate', tip: 'Raise one when only a lead can unblock something. Late payments and decisions escalate by themselves after the unanswered reminders.' },
  { id: 'minutes', title: 'Write minutes', detail: 'Write, a lead approves, you send, the client confirms.', target: 'minutes', tip: 'After a client meeting, write the minutes here the same day and send them for approval.' },
  { id: 'lead', title: 'Add a lead', detail: 'An enquiry from Instagram or a referral, from first call to a project.', target: 'lead', tip: 'A new enquiry goes here: the name and one way to reach them are enough to start.' },
];

/**
 * Which steps are done: those ticked by hand, and those the desk can see for
 * itself (a call logged, minutes written, a lead added).
 */
export function guideProgress(ticked: Partial<Record<GuideStepId, number>> | null | undefined, seen: { logged: boolean; minutes: boolean; lead: boolean; escalated: boolean }) {
  const done = new Set<GuideStepId>();
  for (const s of GUIDE_STEPS) if (ticked?.[s.id]) done.add(s.id);
  if (seen.logged) done.add('log');
  if (seen.minutes) done.add('minutes');
  if (seen.lead) done.add('lead');
  if (seen.escalated) done.add('escalate');
  const next = GUIDE_STEPS.find((s) => !done.has(s.id)) || null;
  return { done, count: done.size, total: GUIDE_STEPS.length, next };
}

/* ── The day ─────────────────────────────────────────────────────────────── */

export interface DoneToday { id: string; title: string; project: string; at: number; kind: 'logged' | 'next' }

/** What this person closed today: each line they logged and each next step they ticked. */
export function doneToday(followUps: FollowUp[], me: string, now: number): DoneToday[] {
  const mine = String(me || '').toLowerCase();
  const today = dayKey(now);
  const out: DoneToday[] = [];
  for (const f of followUps) {
    if (f.by === mine && dayKey(f.at) === today) {
      out.push({ id: `log:${f.id}`, kind: 'logged', at: f.at, project: f.projectName, title: logLine(f) });
    }
    const doneBy = String((f as any).nextDoneBy || '').toLowerCase();
    if (f.next && f.nextDone && f.nextDoneAt && dayKey(f.nextDoneAt) === today && (doneBy === mine || (!doneBy && f.next.ownerEmail === mine))) {
      out.push({ id: `next:${f.id}`, kind: 'next', at: f.nextDoneAt, project: f.projectName, title: f.next.text });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

const CHANNEL_VERB: Record<string, string> = { call: 'Called', whatsapp: 'WhatsApp', email: 'Emailed', meeting: 'Met', other: 'Logged' };
const OUTCOME_WORDS: Record<string, string> = { reminded: 'reminded', no_answer: 'no answer', replied: 'replied', promised: 'promised a date', info: '' };
/** "Called about Payment 2: no answer". */
export function logLine(f: Pick<FollowUp, 'channel' | 'subject' | 'outcome' | 'note'>): string {
  const what = f.subject?.label || String(f.note || '').split('\n')[0].slice(0, 60);
  const o = OUTCOME_WORDS[f.outcome] || '';
  const verb = f.channel === 'whatsapp' ? 'WhatsApp' : CHANNEL_VERB[f.channel] || 'Logged';
  const head = !what ? verb : f.channel === 'whatsapp' ? `WhatsApp: ${what}` : `${verb} about ${what}`;
  return `${head}${o ? `, ${o}` : ''}`.slice(0, 120);
}

/** The ring on the header: done today out of done plus what is still open for today. */
export function dayRing(open: QueueItem[], done: DoneToday[]) {
  const due = open.filter((q) => q.group === 'overdue' || q.group === 'today').length;
  const total = due + done.length;
  return { done: done.length, total, ratio: total ? done.length / total : 0 };
}

/* ── Snoozes: "Later today", and what rolls to another day ──────────────── */

/** Items moved to a later day, by queue id, until that day comes. */
export type Snoozes = Record<string, string>;

export function withSnoozes(queue: QueueItem[], snoozes: Snoozes | null | undefined, now: number): { shown: QueueItem[]; hidden: number } {
  const today = dayKey(now);
  const s = snoozes || {};
  const shown = queue.filter((q) => !(s[q.id] && s[q.id] > today));
  return { shown, hidden: queue.length - shown.length };
}

/** Snoozes that have come round, dropped so the stored record stays small. */
export function liveSnoozes(snoozes: Snoozes | null | undefined, now: number): Snoozes {
  const today = dayKey(now);
  return Object.fromEntries(Object.entries(snoozes || {}).filter(([, d]) => d > today).slice(0, 200));
}

export const tomorrowKey = (now: number) => addDays(dayKey(now), 1);

/* ── The lead's view ─────────────────────────────────────────────────────── */

export interface DeskPerson { email: string; name: string; role: string; isNew: boolean }

export interface TeamRow {
  person: DeskPerson;
  clients: number;
  done: number;
  total: number;
  overdue: number;
  overdueKinds: QueueKind[];
  leadsNew: number;
  lastLogAt: number | null;
  tone: 'ok' | 'warn' | 'bad';
}

export interface TeamInput {
  now: number;
  people: DeskPerson[];
  /** Project ids each person is assigned to (the studio's projectDesigners map). */
  projectsOf: (email: string) => string[];
  followUps: FollowUp[];
  waiting: WaitingItem[];
  moms: QueueInputMom[];
  escalations: Escalation[];
  leads: Lead[];
}
type QueueInputMom = { id: string; projectId: string; projectName: string; status: string; meetingTitle?: string; momRef?: string };

/** Each person's desk as they see it: their queue, worked out the way their own screen does. */
export function personQueue(email: string, t: Omit<TeamInput, 'people'>): QueueItem[] {
  const ids = new Set(t.projectsOf(email));
  return buildQueue({
    now: t.now, me: email, isLead: false,
    followUps: t.followUps.filter((f) => ids.has(f.projectId) || f.next?.ownerEmail === email),
    waiting: t.waiting.filter((w) => ids.has(w.projectId)),
    moms: t.moms.filter((m) => ids.has(m.projectId)),
    escalations: t.escalations.filter((e) => ids.has(e.projectId)),
    extra: leadQueue(t.leads, email, false, t.now),
  });
}

export function teamRows(t: TeamInput): TeamRow[] {
  return t.people.map((person) => {
    const q = personQueue(person.email, t);
    const open = q.filter((x) => x.group === 'overdue' || x.group === 'today');
    const overdueItems = q.filter((x) => x.group === 'overdue');
    const done = doneToday(t.followUps, person.email, t.now).length;
    const mine = t.followUps.filter((f) => f.by === person.email);
    const lastLogAt = mine.length ? Math.max(...mine.map((f) => f.at)) : null;
    const leadsNew = t.leads.filter((l) => l.ownerEmail === person.email && l.stage === 'new').length;
    const tone: TeamRow['tone'] = overdueItems.length >= 3 ? 'bad' : overdueItems.length ? 'warn' : 'ok';
    return {
      person, clients: t.projectsOf(person.email).length, done, total: done + open.length,
      overdue: overdueItems.length, overdueKinds: [...new Set(overdueItems.map((x) => x.kind))], leadsNew, lastLogAt, tone,
    };
  });
}

/** The desk's own numbers for the last seven days. */
export function weekNumbers(followUps: FollowUp[], leads: Lead[], escalations: Escalation[], now: number) {
  const since = now - 7 * 86400000;
  const week = followUps.filter((f) => f.at >= since);
  const firsts = leads.filter((l) => l.firstTouchAt && l.createdAt >= since).map((l) => Math.max(0, (l.firstTouchAt as number) - l.createdAt) / 60000);
  return {
    logged: week.length,
    calls: week.filter((f) => f.channel === 'call').length,
    paymentsChased: new Set(week.filter((f) => f.subject?.kind === 'payment').map((f) => `${f.projectId}|${f.subject?.key}`)).size,
    avgFirstCallMin: firsts.length ? Math.round(firsts.reduce((a, b) => a + b, 0) / firsts.length) : null,
    decided: escalations.filter((e) => (e.decidedAt || 0) >= since).length,
  };
}

/** Whole days since a time, for "last log" and the like. */
export const agoLabel = (ms: number | null, now: number) => {
  if (!ms) return 'Never';
  const d = daysBetween(ms, now);
  if (d <= 0) return new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).toUpperCase();
  return d === 1 ? 'Yesterday' : `${d} days ago`;
};
