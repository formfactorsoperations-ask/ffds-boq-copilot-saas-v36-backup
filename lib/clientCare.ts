/*
  CLIENT CARE FOR THE OPS DESK (Phase 3).

  The rest of a client's journey, on top of the desk's own records
  (lib/opsDesk.ts):

    - the client pulse: a 0-100 read of how the relationship stands, with
      every point it gained or lost and how sure it can be;
    - checklists: onboarding and handover, worked by Client Relations and
      marked complete by a lead, and the documents the studio needs from
      the client;
    - meeting and site visit requests: requested, confirmed, rescheduled,
      done or cancelled, with the message to send at each step;
    - review and referral prompts, after handover or praise, never while
      the client is waiting on the studio or upset.

  Pure, so the tests run it. Nothing here reads the studio's side of the
  money: payments come from the client's side (lib/clientMoney).
*/
import type { ClientMoney } from './clientMoney';
import {
  addDays, dayKey, daysBetween, type Escalation, type FollowUp, type QueueItem, type WaitingItem,
} from './opsDesk';
import { handoverSlip, projectSlipDays } from './opsAssist';

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const niceDay = (key?: string | null) =>
  key ? new Date(`${key}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '';
const isDayKey = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/* ── What a follow-up says about the client ──────────────────────────────── */

const POSITIVE = /\b(happy|pleased|delighted|thrilled|love[sd]?|lovely|impressed|satisfied|excited|grateful|appreciat\w*|praise\w*|compliment\w*|great|amazing|beautiful|relieved)\b/i;
const NEGATIVE = /\b(anxious|worried|upset|angry|annoyed|frustrat\w*|unhappy|disappoint\w*|irritat\w*|impatient|concerned|stressed|furious|complain\w*|confused)\b/i;

/** The mood a captured chat or call noted ("Mood: Anxious about delays"), if any. */
export function moodOf(note: string): string | null {
  const m = /Mood:\s*([^.(]+?)\s*(?:\(|\.|$)/.exec(String(note || ''));
  return m ? clip(m[1], 80) : null;
}
export type Tone = 'positive' | 'negative' | 'neutral';
export function toneOf(text: string | null | undefined): Tone {
  const t = String(text || '');
  if (NEGATIVE.test(t)) return 'negative';
  if (POSITIVE.test(t)) return 'positive';
  return 'neutral';
}

/** A line that records the client speaking to the studio: a reply, a promise, a meeting, or a captured chat or call. */
export const heardFromClient = (f: Pick<FollowUp, 'outcome' | 'channel' | 'note'>) =>
  f.outcome === 'replied' || f.outcome === 'promised' || f.channel === 'meeting' || /^(WhatsApp chat|Call):/.test(String(f.note || ''));

/** Praise: a captured mood that is plainly positive, or a line logged as praise. */
export const isPraise = (f: Pick<FollowUp, 'note'>) => {
  const mood = moodOf(f.note);
  return mood ? toneOf(mood) === 'positive' : /\b(praised|compliment\w*|loved the|very happy|thrilled)\b/i.test(String(f.note || ''));
};

/* ── The client pulse ────────────────────────────────────────────────────── */

export interface PulseReason { label: string; points: number }
export type PulseBand = 'good' | 'watch' | 'at_risk';
export interface Pulse {
  score: number;
  band: PulseBand;
  /** How much of the picture the log gives: few lines logged means an early read. */
  confidence: 'low' | 'medium' | 'high';
  reasons: PulseReason[];
  lastHeardAt: number | null;
}

export interface PulseInputs {
  /** This project's records only. */
  waiting: WaitingItem[];
  followUps: FollowUp[];
  escalations: Escalation[];
  moms: { status: string }[];
  visits: Pick<VisitRequest, 'reschedules' | 'status'>[];
  money: ClientMoney | null;
  targetHandover: string | null;
  now: number;
}

export const PULSE_START = 80;
export const bandOf = (score: number): PulseBand => (score >= 70 ? 'good' : score >= 45 ? 'watch' : 'at_risk');
export const BAND_LABEL: Record<PulseBand, string> = { good: 'Good', watch: 'Watch', at_risk: 'At risk' };

/**
 * Starts at 80 and moves with what the records show. Each rule is capped, so
 * one thing going wrong cannot sink a client on its own, and every point is
 * given a reason the executive can read and act on.
 */
export function clientPulse(i: PulseInputs): Pulse {
  const reasons: PulseReason[] = [];
  const add = (label: string, points: number) => { if (points) reasons.push({ label, points: Math.round(points) }); };
  const today = dayKey(i.now);

  /* Money */
  const late = i.waiting.filter((w) => w.kind === 'payment' && (w.overdueDays || 0) > 0);
  let latePts = 0;
  for (const w of late) latePts += 5 + Math.min(10, Math.floor((w.overdueDays || 0) / 3));
  if (late.length) add(late.length === 1 ? `Payment ${plural(late[0].overdueDays || 0, 'day')} late: ${late[0].label}` : `${late.length} payments late`, -Math.min(25, latePts));
  const paidSome = (i.money?.milestones || []).some((m) => m.status === 'paid');
  if (!late.length && paidSome) add('Payments on time', 5);

  /* Decisions */
  const stuck = i.waiting.filter((w) => w.kind === 'decision' && w.days >= 7);
  if (stuck.length) {
    const pts = stuck.reduce((s, w) => s + (w.days >= 14 ? 8 : 4), 0);
    add(stuck.length === 1 ? `Decision waiting ${plural(stuck[0].days, 'day')}: ${stuck[0].label}` : `${stuck.length} decisions waiting over a week`, -Math.min(16, pts));
  }

  /* Reminders nobody answered */
  const ignored = i.waiting.filter((w) => w.reminders >= 2);
  if (ignored.length) add(`${plural(ignored.reduce((s, w) => s + w.reminders, 0), 'reminder')} unanswered`, -Math.min(10, ignored.length * 5));

  /* Hearing from them */
  const heard = i.followUps.filter(heardFromClient).map((f) => f.at);
  const lastHeardAt = heard.length ? Math.max(...heard) : null;
  if (lastHeardAt != null) {
    const d = daysBetween(lastHeardAt, i.now);
    if (d > 30) add(`Not heard from them in ${d} days`, -15);
    else if (d > 14) add(`Not heard from them in ${d} days`, -8);
    else if (d <= 7) add(d === 0 ? 'Heard from them today' : `Heard from them ${plural(d, 'day')} ago`, 5);
  } else if (i.followUps.length) {
    add('No reply from them logged yet', -8);
  }

  /* Our own promises */
  const ours = i.followUps.filter((f) => f.next && !f.nextDone && f.next.due < today);
  if (ours.length) add(`${plural(ours.length, 'next step')} of ours overdue`, -Math.min(12, ours.length * 4));

  /* Escalations */
  const open = i.escalations.filter((e) => e.status === 'open');
  if (open.length) add(open.length === 1 ? `Escalation open: ${clip(open[0].title, 60)}` : `${open.length} escalations open`, -Math.min(16, open.length * 8));

  /* How they sounded, most recently */
  const moods = i.followUps
    .filter((f) => daysBetween(f.at, i.now) <= 45)
    .map((f) => ({ at: f.at, mood: moodOf(f.note) }))
    .filter((x): x is { at: number; mood: string } => !!x.mood)
    .sort((a, b) => b.at - a.at);
  if (moods.length) {
    const t = toneOf(moods[0].mood);
    if (t === 'negative') add(`Sounded ${moods[0].mood.toLowerCase()} on ${niceDay(dayKey(moods[0].at))}`, -10);
    if (t === 'positive') add(`Sounded ${moods[0].mood.toLowerCase()} on ${niceDay(dayKey(moods[0].at))}`, 5);
  }

  /* Minutes they disputed, visits that keep moving */
  const corrections = i.moms.filter((m) => m.status === 'correction_requested').length;
  if (corrections) add(`Asked for ${corrections === 1 ? 'a correction' : `${corrections} corrections`} to the minutes`, -5);
  const moved = i.visits.filter((v) => v.status !== 'cancelled' && (v.reschedules || 0) >= 2).length;
  if (moved) add(`${moved === 1 ? 'A visit' : `${moved} visits`} rescheduled twice or more`, -5);

  /* Handover */
  const slip = projectSlipDays(i.waiting.map((w) => handoverSlip(w, i.targetHandover)));
  if (slip > 14) add(`Handover may slip by about ${slip} days`, -5);

  const score = Math.max(0, Math.min(100, PULSE_START + reasons.reduce((s, r) => s + r.points, 0)));
  const recent = i.followUps.filter((f) => daysBetween(f.at, i.now) <= 60).length;
  return {
    score,
    band: bandOf(score),
    confidence: recent < 3 ? 'low' : recent < 8 ? 'medium' : 'high',
    reasons: reasons.sort((a, b) => a.points - b.points || a.label.localeCompare(b.label)),
    lastHeardAt,
  };
}

/* ── Checklists ──────────────────────────────────────────────────────────── */

export type ChecklistKind = 'onboarding' | 'handover' | 'documents';
export type ItemState = 'open' | 'done' | 'missing' | 'requested' | 'received' | 'na';

export interface ChecklistItem {
  id: string;
  label: string;
  state: ItemState;
  /** Who last changed it, and when. */
  at: number | null;
  by: string | null;
  byName: string | null;
  note: string;
  /** Added on this project, not from the studio's list. */
  custom: boolean;
}
export interface Checklist {
  kind: ChecklistKind;
  items: ChecklistItem[];
  /** Marked complete by a lead. */
  completedAt: number | null;
  completedBy: string | null;
  completedByName: string | null;
}

export const CHECKLIST_META: Record<ChecklistKind, { label: string; blurb: string; states: ItemState[] }> = {
  onboarding: { label: 'Onboarding', blurb: 'The first weeks after the client signs: everything set up, so nothing is chased later.', states: ['open', 'done', 'na'] },
  documents: { label: 'Documents', blurb: 'What the studio needs from the client, and what has been asked for.', states: ['missing', 'requested', 'received', 'na'] },
  handover: { label: 'Handover', blurb: 'The last two weeks: a clean finish the client remembers.', states: ['open', 'done', 'na'] },
};
export const STATE_LABEL: Record<ItemState, string> = {
  open: 'To do', done: 'Done', missing: 'Missing', requested: 'Asked for', received: 'Received', na: 'Not needed',
};

export const CHECKLIST_TEMPLATES: Record<ChecklistKind, { id: string; label: string }[]> = {
  onboarding: [
    { id: 'welcome', label: 'Welcome message sent, with who to contact for what' },
    { id: 'group', label: 'Project WhatsApp group made' },
    { id: 'portal', label: 'Client portal login shared' },
    { id: 'agreement', label: 'Agreement signed' },
    { id: 'design_advance', label: 'Design advance received' },
    { id: 'kickoff', label: 'Kick-off meeting held' },
    { id: 'contacts', label: 'Who decides, and who pays, noted' },
    { id: 'site_access', label: 'Site access, keys and society rules noted' },
    { id: 'timeline', label: 'Timeline shared with the client' },
  ],
  documents: [
    { id: 'floor_plan', label: 'Floor plan or builder drawings' },
    { id: 'billing', label: 'Billing name, address, GST and PAN for invoices' },
    { id: 'agreement_copy', label: 'Signed agreement copy' },
    { id: 'society_noc', label: 'Society NOC for interior work' },
    { id: 'society_rules', label: 'Society rules and permitted work timings' },
    { id: 'services', label: 'Existing electrical and plumbing layouts' },
    { id: 'appliances', label: 'Appliance models and sizes (kitchen cut-outs)' },
    { id: 'references', label: 'Reference images or Pinterest boards' },
  ],
  handover: [
    { id: 'snags', label: 'Snag list walked and closed' },
    { id: 'cleaning', label: 'Deep cleaning done' },
    { id: 'walkthrough', label: 'Final walkthrough with the client' },
    { id: 'final_payment', label: 'Final payment received' },
    { id: 'keys', label: 'Keys and access cards handed over' },
    { id: 'manuals', label: 'Manuals, warranties and bills handed over' },
    { id: 'care_guide', label: 'Care and maintenance guide shared' },
    { id: 'photos', label: 'Handover photos taken' },
    { id: 'signoff', label: 'Handover note signed by the client' },
  ],
};

const firstState = (kind: ChecklistKind): ItemState => (kind === 'documents' ? 'missing' : 'open');

/** The studio's list for this kind, with what was saved on the project laid over it, and the project's own extra items after. */
export function materialise(kind: ChecklistKind, saved: Partial<Checklist> | null | undefined): Checklist {
  const savedItems = Array.isArray(saved?.items) ? saved!.items : [];
  const byId = new Map(savedItems.map((x) => [String(x?.id), x]));
  const okStates = new Set(CHECKLIST_META[kind].states);
  const norm = (base: { id: string; label: string }, s: any, custom: boolean): ChecklistItem => ({
    id: base.id,
    label: clip(custom ? s?.label : base.label, 160),
    state: okStates.has(s?.state) ? s.state : firstState(kind),
    at: typeof s?.at === 'number' ? s.at : null,
    by: s?.by ? String(s.by) : null,
    byName: s?.byName ? String(s.byName) : null,
    note: clip(s?.note, 300),
    custom,
  });
  const items = CHECKLIST_TEMPLATES[kind].map((t) => norm(t, byId.get(t.id), false));
  const known = new Set(CHECKLIST_TEMPLATES[kind].map((t) => t.id));
  for (const s of savedItems) {
    if (!s?.id || known.has(String(s.id)) || !clip(s.label, 160)) continue;
    items.push(norm({ id: String(s.id), label: '' }, s, true));
  }
  return {
    kind, items,
    completedAt: typeof saved?.completedAt === 'number' ? saved.completedAt : null,
    completedBy: saved?.completedBy || null,
    completedByName: saved?.completedByName || null,
  };
}

const settled = (s: ItemState) => s === 'done' || s === 'received' || s === 'na';

export interface Progress { done: number; total: number; settled: boolean; outstanding: ChecklistItem[] }
export function progressOf(c: Checklist): Progress {
  const live = c.items.filter((x) => x.state !== 'na');
  const done = live.filter((x) => settled(x.state)).length;
  return { done, total: live.length, settled: c.items.every((x) => settled(x.state)), outstanding: c.items.filter((x) => !settled(x.state)) };
}

/** One item moved to a new state, in this person's name. */
export function setItem(c: Checklist, id: string, patch: Partial<Pick<ChecklistItem, 'state' | 'note'>>, who: { email: string; name: string }, now: number): Checklist {
  return {
    ...c,
    items: c.items.map((x) => (x.id === id ? { ...x, ...patch, note: clip(patch.note ?? x.note, 300), at: now, by: who.email.toLowerCase(), byName: who.name } : x)),
  };
}
export function addItem(c: Checklist, label: string, who: { email: string; name: string }, now: number): Checklist {
  const text = clip(label, 160);
  if (!text) return c;
  return { ...c, items: [...c.items, { id: `x${now.toString(36)}`, label: text, state: firstState(c.kind), at: now, by: who.email.toLowerCase(), byName: who.name, note: '', custom: true }] };
}

/** What the records already say about an item, as a hint to tick it. Never ticks anything by itself. */
export function checklistHints(kind: ChecklistKind, money: ClientMoney | null): Record<string, string> {
  const out: Record<string, string> = {};
  const ms = money?.milestones || [];
  if (kind === 'onboarding') {
    const d = ms.find((m) => m.type === 'design');
    if (d?.status === 'paid') out.design_advance = `${d.name} shows as paid`;
  }
  if (kind === 'handover' && ms.length) {
    const unpaid = ms.filter((m) => m.status !== 'paid');
    out.final_payment = unpaid.length ? `${plural(unpaid.length, 'milestone')} still unpaid` : 'Every milestone shows as paid';
  }
  return out;
}

/** The copy-and-send message asking for the documents still missing or asked for. */
export function documentsMessage(c: Checklist, ctx: { clientName: string; projectName: string; senderName: string; studioName: string }): string {
  const list = c.items.filter((x) => x.state === 'missing' || x.state === 'requested');
  return `Hi ${ctx.clientName || 'there'},\n\nTo keep ${ctx.projectName} moving, could you share the following when you get a moment?\n\n${list.map((x, n) => `${n + 1}. ${x.label}`).join('\n')}\n\nPhotos or PDFs on WhatsApp are fine.\n\nRegards,\n${ctx.senderName}${ctx.studioName ? `\n${ctx.studioName}` : ''}`;
}

/* ── Meeting and site visit requests ─────────────────────────────────────── */

export type VisitKind = 'meeting' | 'site_visit' | 'measurement';
export type VisitMode = 'in_person' | 'video' | 'call';
export type VisitStatus = 'requested' | 'confirmed' | 'rescheduled' | 'done' | 'cancelled';
export interface Slot { date: string; time: string }
export interface VisitEvent { at: number; by: string; byName: string; status: VisitStatus; slot: Slot | null; note: string }
export interface VisitRequest {
  id: string;
  tenantId: string;
  projectId: string;
  projectName: string;
  kind: VisitKind;
  mode: VisitMode;
  purpose: string;
  requestedBy: 'client' | 'studio';
  status: VisitStatus;
  /** The time asked for, proposed or agreed. */
  slot: Slot | null;
  reschedules: number;
  history: VisitEvent[];
  createdAt: number;
  createdBy: string;
  createdByName: string;
  updatedAt: number;
  updatedBy: string;
}

export const VISIT_KINDS: { id: VisitKind; label: string }[] = [
  { id: 'meeting', label: 'Meeting' }, { id: 'site_visit', label: 'Site visit' }, { id: 'measurement', label: 'Measurement' },
];
export const VISIT_MODES: { id: VisitMode; label: string }[] = [
  { id: 'in_person', label: 'In person' }, { id: 'video', label: 'Video call' }, { id: 'call', label: 'Phone call' },
];
export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  requested: 'Requested', confirmed: 'Confirmed', rescheduled: 'Rescheduled', done: 'Done', cancelled: 'Cancelled',
};
export const visitLabel = (k: VisitKind) => VISIT_KINDS.find((x) => x.id === k)?.label || 'Meeting';

/**
 * Where a request may go next. "Rescheduled" is a new time put to the client,
 * waiting for their yes; confirming it makes it "confirmed" again.
 */
export const VISIT_MOVES: Record<VisitStatus, VisitStatus[]> = {
  requested: ['requested', 'confirmed', 'cancelled'],
  confirmed: ['rescheduled', 'done', 'cancelled'],
  rescheduled: ['rescheduled', 'confirmed', 'cancelled'],
  done: [],
  cancelled: [],
};
export const isOpenVisit = (v: Pick<VisitRequest, 'status'>) => v.status !== 'done' && v.status !== 'cancelled';
export const validSlot = (s: Slot | null | undefined): s is Slot => !!s && isDayKey(s.date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time);

/** The fields a move writes, or an error to show. The history only grows. */
export function moveVisit(v: VisitRequest, to: VisitStatus, opts: { slot?: Slot | null; note?: string }, who: { email: string; name: string }, now: number):
  { ok: true; patch: Pick<VisitRequest, 'status' | 'slot' | 'reschedules' | 'history' | 'updatedAt' | 'updatedBy'> } | { ok: false; error: string } {
  if (!VISIT_MOVES[v.status].includes(to)) return { ok: false, error: `A ${VISIT_STATUS_LABEL[v.status].toLowerCase()} request cannot be marked ${VISIT_STATUS_LABEL[to].toLowerCase()}.` };
  const slot = opts.slot === undefined ? v.slot : opts.slot;
  if ((to === 'confirmed' || to === 'rescheduled') && !validSlot(slot)) return { ok: false, error: 'Choose a date and a time first.' };
  if (to === 'rescheduled' && v.slot && slot && v.slot.date === slot.date && v.slot.time === slot.time) return { ok: false, error: 'Choose a different time to reschedule.' };
  const event: VisitEvent = { at: now, by: who.email.toLowerCase(), byName: who.name, status: to, slot: slot || null, note: clip(opts.note, 300) };
  return {
    ok: true,
    patch: {
      status: to, slot: slot || null,
      reschedules: (v.reschedules || 0) + (to === 'rescheduled' ? 1 : 0),
      history: [...(v.history || []), event],
      updatedAt: now, updatedBy: who.email.toLowerCase(),
    },
  };
}

const niceTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
};
export const slotText = (s: Slot | null | undefined) => (validSlot(s) ? `${niceDay(s.date)}, ${niceTime(s.time)}` : 'time to be agreed');

/** The message to send at each step: proposing or confirming a time, a new time, or the day-before reminder. */
export function visitMessage(kind: 'confirm' | 'reschedule' | 'reminder', v: Pick<VisitRequest, 'kind' | 'mode' | 'purpose' | 'slot'>, ctx: { clientName: string; projectName: string; senderName: string; studioName: string; place?: string }): string {
  const what = visitLabel(v.kind).toLowerCase();
  const how = v.mode === 'video' ? ' on a video call (we will share the link)' : v.mode === 'call' ? ' on a phone call' : ctx.place ? ` at ${ctx.place}` : v.kind === 'meeting' ? ' at our studio' : ' at the site';
  const purpose = v.purpose ? ` to ${v.purpose.replace(/^to\s+/i, '').replace(/\.$/, '')}` : '';
  const sign = `\n\nRegards,\n${ctx.senderName}${ctx.studioName ? `\n${ctx.studioName}` : ''}`;
  const hi = `Hi ${ctx.clientName || 'there'},`;
  if (kind === 'confirm') return `${hi}\n\nConfirming our ${what} for ${ctx.projectName} on ${slotText(v.slot)}${how}${purpose}. Do let me know if that time stops working for you.${sign}`;
  if (kind === 'reschedule') return `${hi}\n\nWe need to move our ${what} for ${ctx.projectName}. Would ${slotText(v.slot)}${how} work for you instead? Sorry for the change.${sign}`;
  return `${hi}\n\nA reminder of our ${what} for ${ctx.projectName} tomorrow, ${slotText(v.slot)}${how}${purpose}. See you then.${sign}`;
}

/* ── Reviews and referrals ───────────────────────────────────────────────── */

export type AskKind = 'review' | 'referral';
export const ASK_SUBJECT: Record<AskKind, { key: string; label: string }> = {
  review: { key: 'ask:review', label: 'Google review' },
  referral: { key: 'ask:referral', label: 'Referral' },
};
/** Days between two asks of the same kind, and how many asks in all. */
export const ASK_REST_DAYS = 30;
export const ASK_MAX = 2;

export interface AskPrompt { kind: AskKind; reason: string; asks: number }
export interface AskState { asks: number; lastAskAt: number | null; done: boolean }

export function askState(followUps: FollowUp[], kind: AskKind): AskState {
  const mine = followUps.filter((f) => f.subject?.key === ASK_SUBJECT[kind].key);
  const asks = mine.filter((f) => f.outcome === 'reminded' || f.outcome === 'no_answer');
  return {
    asks: asks.length,
    lastAskAt: asks.length ? Math.max(...asks.map((f) => f.at)) : null,
    done: mine.some((f) => f.outcome === 'replied' || f.outcome === 'promised'),
  };
}

/**
 * When to ask for a review or a referral: after handover, or within a month
 * of the client praising the work. Never while a payment is late, an
 * escalation is open or the pulse is below good; never twice within a
 * month, more than twice, or once they have done it.
 */
export function askPrompts(i: { followUps: FollowUp[]; handedOver: boolean; pulse: Pulse; latePayment: boolean; openEscalation: boolean; now: number }): AskPrompt[] {
  if (i.latePayment || i.openEscalation || i.pulse.band !== 'good') return [];
  const praise = i.followUps.filter((f) => isPraise(f) && daysBetween(f.at, i.now) <= 30).sort((a, b) => b.at - a.at)[0];
  const reason = i.handedOver ? 'Handed over' : praise ? `Praised the work on ${niceDay(dayKey(praise.at))}` : null;
  if (!reason) return [];
  const out: AskPrompt[] = [];
  for (const kind of ['review', 'referral'] as AskKind[]) {
    const s = askState(i.followUps, kind);
    if (s.done || s.asks >= ASK_MAX) continue;
    if (s.lastAskAt != null && daysBetween(s.lastAskAt, i.now) < ASK_REST_DAYS) continue;
    out.push({ kind, reason, asks: s.asks });
  }
  return out;
}

export function askMessage(kind: AskKind, ctx: { clientName: string; projectName: string; senderName: string; studioName: string; reviewLink?: string }): string {
  const hi = `Hi ${ctx.clientName || 'there'},`;
  const sign = `\n\nWarm regards,\n${ctx.senderName}${ctx.studioName ? `\n${ctx.studioName}` : ''}`;
  if (kind === 'review') {
    return `${hi}\n\nIt has been a real pleasure working with you on ${ctx.projectName}. If you have a minute, a short Google review would mean a lot to our team and helps other families find us.${ctx.reviewLink ? `\n\n${ctx.reviewLink}` : ''}\n\nThank you!${sign}`;
  }
  return `${hi}\n\nThank you for trusting us with ${ctx.projectName}. Most of our work comes from people our clients know, so if a friend or family member is planning their home, we would be grateful for an introduction. We will take the same care with them.${sign}`;
}

/* ── On the desk ─────────────────────────────────────────────────────────── */

export const HANDOVER_WINDOW_DAYS = 14;
export const DOCS_REST_DAYS = 3;
export const DOCS_SUBJECT = { key: 'docs', label: 'Documents' };

export interface CareProject {
  id: string;
  name: string;
  status: string;
  targetHandover: string | null;
  checklists: Partial<Record<ChecklistKind, Checklist>>;
  visits: VisitRequest[];
  prompts: AskPrompt[];
}

/**
 * What client care adds to the Ops Desk queue: visits to confirm, remind or
 * close, documents to chase, a handover drawing near, review and referral
 * asks, and for a lead, checklists ready to be marked complete.
 */
export function careQueue(projects: CareProject[], followUps: FollowUp[], isLead: boolean, now: number): QueueItem[] {
  const today = dayKey(now);
  const tomorrow = addDays(today, 1);
  const out: QueueItem[] = [];
  for (const p of projects) {
    for (const v of p.visits.filter(isOpenVisit)) {
      const what = `${visitLabel(v.kind)}${v.purpose ? ` · ${clip(v.purpose, 60)}` : ''}`;
      if (v.status === 'requested' || v.status === 'rescheduled') {
        const waiting = daysBetween(v.updatedAt || v.createdAt, now);
        out.push({
          id: `visit:${v.id}`, group: waiting >= 2 ? 'overdue' : 'today', kind: 'visit', projectId: p.id, projectName: p.name,
          title: v.status === 'requested' ? `Agree a time: ${what}` : `Get a yes on the new time: ${what}`,
          detail: `${v.status === 'requested' ? `Asked for by the ${v.requestedBy}` : 'Moved'}${v.slot ? ` · ${slotText(v.slot)}` : ''}${waiting ? ` · ${plural(waiting, 'day')} ago` : ''}`,
          due: today, ref: v.id,
        });
      } else if (v.slot && v.slot.date < today) {
        out.push({ id: `visit:${v.id}`, group: 'overdue', kind: 'visit', projectId: p.id, projectName: p.name, title: `Close out: ${what}`, detail: `Was ${slotText(v.slot)} · mark it done, or reschedule`, due: v.slot.date, ref: v.id });
      } else if (v.slot && (v.slot.date === today || v.slot.date === tomorrow)) {
        out.push({
          id: `visit:${v.id}`, group: 'today', kind: 'visit', projectId: p.id, projectName: p.name,
          title: `${v.slot.date === today ? 'Today' : 'Tomorrow'}: ${what}`, detail: `${slotText(v.slot)}${v.slot.date === today ? '' : ' · send the client a reminder'}`, due: today, ref: v.id,
        });
      }
    }

    const docs = p.checklists.documents;
    const asked = docs?.items.filter((x) => x.state === 'requested') || [];
    if (docs && asked.length) {
      const chases = followUps.filter((f) => f.projectId === p.id && f.subject?.key === DOCS_SUBJECT.key).map((f) => f.at);
      const last = Math.max(...asked.map((x) => x.at || 0), ...chases);
      if (daysBetween(last, now) >= DOCS_REST_DAYS) {
        out.push({ id: `docs:${p.id}`, group: 'today', kind: 'documents', projectId: p.id, projectName: p.name, title: `Chase ${plural(asked.length, 'document')}`, detail: asked.slice(0, 3).map((x) => x.label).join(' · '), due: today, ref: 'documents' });
      }
    }

    const hand = p.checklists.handover;
    if (p.targetHandover && p.status !== 'completed' && !hand?.completedAt) {
      const left = daysBetween(new Date(`${today}T00:00:00+05:30`).getTime(), new Date(`${p.targetHandover}T00:00:00+05:30`).getTime());
      if (left >= 0 && left <= HANDOVER_WINDOW_DAYS) {
        const pr = hand ? progressOf(hand) : null;
        out.push({ id: `hand:${p.id}`, group: 'week', kind: 'checklist', projectId: p.id, projectName: p.name, title: `Handover in ${plural(left, 'day')}`, detail: pr ? `${pr.done} of ${pr.total} on the handover list done` : 'Handover list not started', due: p.targetHandover, ref: 'handover' });
      }
    }

    if (isLead) {
      for (const kind of ['onboarding', 'handover'] as ChecklistKind[]) {
        const c = p.checklists[kind];
        if (c && !c.completedAt && progressOf(c).settled && c.items.some((x) => x.at)) {
          out.push({ id: `done:${p.id}:${kind}`, group: 'today', kind: 'checklist', projectId: p.id, projectName: p.name, title: `Mark ${CHECKLIST_META[kind].label.toLowerCase()} complete`, detail: 'Every item is done or not needed', due: today, ref: kind });
        }
      }
    }

    for (const a of p.prompts) {
      out.push({ id: `ask:${p.id}:${a.kind}`, group: 'week', kind: 'ask', projectId: p.id, projectName: p.name, title: a.kind === 'review' ? 'Ask for a Google review' : 'Ask for a referral', detail: `${a.reason}${a.asks ? ` · asked once before` : ''}`, due: null, ref: a.kind });
    }
  }
  return out;
}
