/*
  MINUTES, THE NEW WAY (the MoM overhaul, part 1).

  Client Relations writes the minutes, the Ops Director approves them (or
  returns them with notes on the exact lines), Client Relations sends them, and
  the client confirms in one tap or marks the line that is wrong. Every step
  records a name and a time.

  Minutes written this way are the same `moms` documents as before, marked
  `format: 2`. They hold topics, each a list of short lines; every line is a
  decision, an action, a note or an open question. On every save the lines are
  also written out as the older decisions / actionItems / notes, so the action
  tracker, the scope queue, the Ops Desk and anything else that reads minutes
  keeps working unchanged.

  The stored status keeps its old values, so the database rules and the client
  portal read new minutes exactly as they read older ones:

    draft            Being written (or returned with notes: `reviewNotes`)
    pending_review   With the Ops Director
    finalised        Approved, not yet sent
    shared           Sent, waiting for the client
    acknowledged     Confirmed by the client
    correction_requested  The client asked to correct a line

  A correction is answered with a revision. While it is being written and
  approved the client keeps reading the minutes they have; the working copy
  sits in `pendingRevision`, its step in `revisionStage`.

  Pure functions, no imports from the app: shared by the screens and tests.
*/

import { clientEmails } from './clientContacts';

/* ── The shape ───────────────────────────────────────────────────────────── */

export type LineKind =
  | 'decision' | 'action' | 'note' | 'question'
  /* Part 2: each goes somewhere once the minutes are approved (ROUTE_LABEL). */
  | 'design_change' | 'selection' | 'requirement' | 'studio_only';
export type OwnerSide = 'client' | 'ffds' | 'vendor';

export interface LineOwner {
  side: OwnerSide;
  name: string;
  email?: string | null;
}

export interface MinutesLine {
  id: string;
  kind: LineKind;
  text: string;
  /** Actions and open questions: who does it. */
  owner?: LineOwner | null;
  /** Actions and open questions: by when (ms, 6 PM India time on the day). */
  due?: number | null;
  flags?: { scope?: boolean; drawing?: boolean; cost?: boolean; siteCondition?: boolean };
  /** Added from pasted notes or speech, and not yet opened by a person. */
  fromNotes?: boolean;
  /** Done, for an action; carried into the older actionItems. */
  status?: 'open' | 'done' | 'cancelled';
  /** A cost or scope action on its way into a Scope Revision (hooks/useMomScopeQueue). */
  scopeRequest?: any;
  /**
   * What a requirement, selection or design change is about: the room, the
   * item chosen (a selection), how much it matters (a requirement), where a
   * selection stands, the sheet a change is on.
   */
  meta?: {
    room?: string | null;
    item?: string | null;
    priority?: 'must' | 'nice' | null;
    choice?: 'approved' | 'on_hold' | 'client_to_pick' | null;
    sheet?: string | null;
  } | null;
}

export interface MinutesTopic {
  id: string;
  title: string;
  lines: MinutesLine[];
}

/** An open action from earlier minutes, and what happened to it since. */
export interface CarriedAction {
  momId: string;
  ref: string;
  actionId: string;
  text: string;
  ownerName: string;
  due?: number | null;
  outcome: 'done' | 'open' | 'drop' | null;
}

export type TrailStep =
  | 'written' | 'sent_for_approval' | 'returned' | 'approved' | 'sent'
  | 'confirmed' | 'correction_asked' | 'revision_started' | 'logged';

export interface TrailEntry {
  step: TrailStep;
  at: number;
  by: string;
  byName: string;
  /** "after 1 change", "Portal · WhatsApp · email", the return note… */
  note?: string | null;
}

/** The Ops Director's note on one line (or on the minutes, lineId null). */
export interface ReviewNote {
  id: string;
  lineId: string | null;
  text: string;
  by: string;
  byName: string;
  at: number;
}

export interface Signed {
  email: string;
  name: string;
  role?: string | null;
  at: number;
}

/** What the client marked as wrong, line by line. */
export interface CorrectionLine {
  lineId: string;
  ref: string;
  text: string;
}

export type MinutesStatus = 'draft' | 'pending_review' | 'finalised' | 'shared' | 'acknowledged' | 'correction_requested';

/** The content a revision replaces; what `pendingRevision` holds. */
export interface MinutesContent {
  topics: MinutesTopic[];
  summary?: string | null;
  carried?: CarriedAction[];
  nextMeeting?: { date?: string; time?: string; purpose?: string } | null;
  attendees?: { name: string; side: string; role?: string; present?: boolean }[];
  revisionNote?: string | null;
}

/** The fields minutes in the new format carry, on top of the older MOM. */
export interface MinutesV2 extends MinutesContent {
  id: string;
  momRef: string;
  format: 2;
  status: MinutesStatus;
  meetingTitle?: string;
  meetingType?: string;
  meetingDate: number;
  meetingEnd?: number | null;
  venue?: string | null;
  trail?: TrailEntry[];
  reviewNotes?: ReviewNote[];
  /** The topics as the reviewer last saw them, for "Changes only". */
  reviewedTopics?: MinutesTopic[] | null;
  preparedBy?: Signed | null;
  approvedBy?: Signed | null;
  sentBy?: Signed | null;
  sentAt?: number | null;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  correctionRequest?: { text: string; by: string; at: number; lines?: CorrectionLine[] } | null;
  rev?: number;
  pendingRevision?: (MinutesContent & { revisionNote?: string | null }) | null;
  revisionStage?: 'draft' | 'pending_review' | null;
  previousRevisions?: any[];
}

/* ── Who may do what ─────────────────────────────────────────────────────── */

/** Approve minutes, and write and send them in one step when Client Relations is away. */
export const MINUTES_LEADS = ['Super Admin', 'Owner', 'Admin', 'Ops Director'];

export function isMinutesLead(roles: string | readonly string[] | null | undefined): boolean {
  const list = Array.isArray(roles) ? roles : roles ? [roles] : [];
  return list.some((r) => MINUTES_LEADS.includes(String(r)));
}

/** Whether minutes are in the new format. */
export const isNewMinutes = (m: any): boolean => !!m && m.format === 2;

/* ── Building blocks ─────────────────────────────────────────────────────── */

let seq = 0;
/** An id unique within a document: time plus a counter, no randomness needed. */
export function newId(prefix: string, now: number = Date.now()): string {
  seq = (seq + 1) % 1e6;
  return `${prefix}-${now.toString(36)}-${seq.toString(36)}`;
}

export const KIND_LABEL: Record<LineKind, string> = {
  decision: 'Decision', action: 'Action', note: 'Note', question: 'Open question',
  design_change: 'Design change', selection: 'Selection', requirement: 'Requirement', studio_only: 'Studio only',
};

/** Every kind, in the order they are offered. */
export const ALL_KINDS: LineKind[] = ['decision', 'action', 'note', 'question', 'requirement', 'selection', 'design_change', 'studio_only'];

/** Where each kind of line goes once the minutes are approved (mockup 7). */
export const ROUTE_LABEL: Record<LineKind, string> = {
  decision: 'Decisions in the minutes',
  action: 'Action list',
  design_change: 'Design changes list',
  selection: 'Materials, once added',
  requirement: 'Project brief, once added',
  question: 'Next meeting',
  note: 'Stays in the minutes',
  studio_only: 'Never printed or shared',
};

/** Lines the client never sees, in any form. */
export const isStudioOnly = (l: Pick<MinutesLine, 'kind'>) => l.kind === 'studio_only';

export const needsOwner = (k: LineKind) => k === 'action' || k === 'question';

export function emptyTopic(title = '', now?: number): MinutesTopic {
  return { id: newId('t', now), title, lines: [] };
}

export function newLine(kind: LineKind, text = '', now?: number): MinutesLine {
  return { id: newId('l', now), kind, text, ...(needsOwner(kind) ? { owner: null, due: null } : {}) };
}

/** Every line, in reading order, with its topic. */
export function allLines(topics: MinutesTopic[] | undefined): { line: MinutesLine; topic: MinutesTopic }[] {
  return (topics || []).flatMap((topic) => (topic.lines || []).map((line) => ({ line, topic })));
}

/*
  "Client to send tile choice by Friday" → an action. A typed point is sorted
  by its words; the writer can change the kind with one tap.
*/
export function guessKind(text: string): LineKind {
  const s = text.trim().toLowerCase();
  if (!s) return 'note';
  if (s.endsWith('?') || /^(can|could|should|will|is|are|does|do|why|how|what|where|when|who)\b/.test(s)) return 'question';
  if (/\b(to (send|share|check|confirm|pick|select|provide|arrange|get|revise|update|book|visit|call|finali[sz]e)|will (send|share|check|confirm|pick|revise)|by (mon|tue|wed|thu|fri|sat|sun|tomorrow|next|end|\d))/.test(s)) return 'action';
  if (/\b(approved|agreed|final(i[sz]ed)?|confirmed|chosen|decided|go ahead|ok(ay)?ed|instead of)\b/.test(s)) return 'decision';
  return 'note';
}

/* ── References: D1, A1 ──────────────────────────────────────────────────── */

/**
 * The reference each line goes by on the PDF and in the portal: decisions D1,
 * D2…; actions and open questions with an owner A1, A2…, in reading order.
 * Notes and unowned questions carry none.
 */
export function lineRefs(topics: MinutesTopic[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  let d = 0;
  let a = 0;
  let s = 0;
  let r = 0;
  let c = 0;
  for (const { line } of allLines(topics)) {
    if (line.kind === 'decision') out[line.id] = `D${++d}`;
    else if (line.kind === 'action' || (line.kind === 'question' && line.owner?.name)) out[line.id] = `A${++a}`;
    else if (line.kind === 'selection') out[line.id] = `S${++s}`;
    else if (line.kind === 'requirement') out[line.id] = `R${++r}`;
    else if (line.kind === 'design_change') out[line.id] = `C${++c}`;
  }
  return out;
}

/* ── Older readers keep working ──────────────────────────────────────────── */

/**
 * The lines as the older decisions / actionItems / notes, written beside the
 * topics on every save. An action keeps its line's id, so the tracker and the
 * scope queue find the same item from either side.
 */
export function toLegacy(topics: MinutesTopic[] | undefined, carried: CarriedAction[] = []) {
  const decisions: { id: string; text: string }[] = [];
  const actionItems: any[] = [];
  const notes: { id: string; text: string }[] = [];
  for (const { line, topic } of allLines(topics)) {
    const text = line.text.trim();
    if (!text) continue;
    const label = topic.title.trim() ? `${topic.title.trim()}: ` : '';
    if (isStudioOnly(line)) continue;
    if (line.kind === 'selection') { decisions.push({ id: line.id, text: `${label}Selected: ${selectionText(line)}` }); continue; }
    if (line.kind === 'design_change') { decisions.push({ id: line.id, text: `${label}Design change: ${text}` }); continue; }
    if (line.kind === 'requirement') { notes.push({ id: line.id, text: `${label}Requirement: ${text}` }); continue; }
    if (line.kind === 'decision') decisions.push({ id: line.id, text: `${label}${text}` });
    else if (line.kind === 'note') notes.push({ id: line.id, text: `${label}${text}` });
    else if (line.kind === 'question' && !line.owner?.name) notes.push({ id: line.id, text: `${label}Open question: ${text}` });
    else {
      actionItems.push({
        id: line.id,
        text: line.kind === 'question' ? `Open question: ${text}` : text,
        owner: line.owner?.side || 'ffds',
        ownerName: line.owner?.name || null,
        dueDate: line.due ?? null,
        status: line.status || 'open',
        flags: {
          scope: !!line.flags?.scope, drawing: !!line.flags?.drawing,
          siteCondition: !!line.flags?.siteCondition, cost: !!line.flags?.cost,
        },
        ...(line.scopeRequest ? { scopeRequest: line.scopeRequest } : {}),
      });
    }
  }
  const carriedForward = carried
    .filter((c) => c.outcome === 'open')
    .map((c) => ({ text: c.text, ref: c.ref, owner: c.ownerName || null }));
  return { decisions, actionItems, notes, carriedForward };
}

/** "Countertop: Caesarstone Frosty Carrina, 20 mm (approved)". */
export function selectionText(l: MinutesLine): string {
  const item = l.meta?.item?.trim();
  const st = l.meta?.choice === 'on_hold' ? ' (on hold)' : l.meta?.choice === 'client_to_pick' ? ' (client to pick)' : '';
  return `${item ? `${item}: ` : ''}${l.text.trim()}${st}`;
}

/**
 * Older minutes as topics: decisions, actions and notes become lines under one
 * topic, "Discussion", worded exactly as they were.
 */
export function fromLegacy(mom: any): MinutesTopic[] {
  const lines: MinutesLine[] = [];
  for (const d of mom?.decisions || []) if (d?.text) lines.push({ id: String(d.id || newId('l')), kind: 'decision', text: String(d.text) });
  for (const a of mom?.actionItems || []) {
    if (!a?.text) continue;
    const side: OwnerSide = a.owner === 'client' || a.owner === 'vendor' ? a.owner : 'ffds';
    lines.push({
      id: String(a.id || newId('l')), kind: 'action', text: String(a.text),
      owner: a.ownerName || a.owner ? { side, name: String(a.ownerName || (side === 'client' ? 'Client' : side === 'vendor' ? 'Vendor' : 'Studio')) } : null,
      due: typeof a.dueDate === 'number' ? a.dueDate : null,
      flags: a.flags || {},
      status: a.status === 'done' || a.status === 'cancelled' ? a.status : 'open',
    });
  }
  for (const n of mom?.notes || []) if (n?.text) lines.push({ id: String(n.id || newId('l')), kind: 'note', text: String(n.text) });
  return lines.length ? [{ id: 'discussion', title: 'Discussion', lines }] : [];
}

/**
 * Pasted notes, as the structurer read them, turned into lines under one
 * topic. Every line is marked "from notes" until a person opens it.
 */
export function fromStructured(data: any, anchorTitle = 'From your notes', now?: number): MinutesTopic[] {
  const topics: MinutesTopic[] = [];
  const named: any[] = Array.isArray(data?.topics) ? data.topics : [];
  const side = (o: any): OwnerSide => (o === 'client' || o === 'vendor' ? o : 'ffds');
  const toLine = (x: any): MinutesLine | null => {
    const text = String(x?.text || '').trim();
    if (!text) return null;
    /* Never "studio_only" from notes: a person decides what the client must not see. */
    const kind: LineKind = ['decision', 'action', 'note', 'question', 'requirement', 'selection', 'design_change'].includes(x?.kind) ? x.kind : 'note';
    const line: MinutesLine = { ...newLine(kind, text, now), fromNotes: true };
    if (kind === 'requirement' || kind === 'selection' || kind === 'design_change') {
      const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null);
      line.meta = {
        room: str(x?.room), item: kind === 'selection' ? str(x?.item) : null, sheet: kind === 'design_change' ? str(x?.sheet) : null,
        priority: kind === 'requirement' && (x?.priority === 'must' || x?.priority === 'nice') ? x.priority : null,
        choice: kind === 'selection' && ['approved', 'on_hold', 'client_to_pick'].includes(x?.choice) ? x.choice : null,
      };
    }
    if (needsOwner(kind)) {
      const name = String(x?.ownerName || '').trim();
      line.owner = name ? { side: side(x?.owner), name } : null;
      line.due = typeof x?.due === 'number' ? x.due : null;
    }
    if (x?.flags) line.flags = { scope: !!x.flags.scope, drawing: !!x.flags.drawing, cost: !!x.flags.cost, siteCondition: !!x.flags.siteCondition };
    return line;
  };
  for (const t of named) {
    const lines = (Array.isArray(t?.lines) ? t.lines : []).map(toLine).filter(Boolean) as MinutesLine[];
    if (lines.length) topics.push({ id: newId('t', now), title: String(t?.title || '').trim() || anchorTitle, lines });
  }
  if (topics.length) return topics;
  // The older shape: decisions, actionItems, notes.
  const flat = [
    ...(data?.decisions || []).map((d: any) => ({ kind: 'decision', text: d?.text })),
    ...(data?.actionItems || []).map((a: any) => ({ kind: 'action', text: a?.text, owner: a?.owner, ownerName: a?.ownerName, due: a?.due, flags: a?.flags })),
    ...(data?.notes || []).map((n: any) => ({ kind: 'note', text: n?.text })),
  ].map(toLine).filter(Boolean) as MinutesLine[];
  return flat.length ? [{ id: newId('t', now), title: anchorTitle, lines: flat }] : [];
}

/**
 * Cost and scope lines go to the Scope Revision queue as the minutes are
 * approved, as the older minutes did when finalised (hooks/useMomScopeQueue).
 */
export function queueScopeLines(topics: MinutesTopic[], by: string | null, now: number = Date.now()): MinutesTopic[] {
  return topics.map((t) => ({
    ...t,
    lines: t.lines.map((l) => (l.kind === 'action' || l.kind === 'question') && (l.flags?.scope || l.flags?.cost) && !l.scopeRequest && l.text.trim()
      ? { ...l, scopeRequest: { status: 'queued', queuedAt: now, queuedBy: by } }
      : l),
  }));
}

/** Where the queue has moved an action on since (added, dismissed), back onto its line. */
export function withQueueState(topics: MinutesTopic[], actionItems: any[] | undefined): MinutesTopic[] {
  const byId = new Map((actionItems || []).filter((a) => a?.scopeRequest).map((a) => [String(a.id), a.scopeRequest]));
  return topics.map((t) => ({ ...t, lines: t.lines.map((l) => (byId.has(l.id) ? { ...l, scopeRequest: byId.get(l.id) } : l)) }));
}

/* ── Studio-only lines stay with the studio ────────────────────────────── */

/*
  A studio-only line ("client hinted at a tighter budget") is never printed,
  never sent and never shown in the portal -- and is never stored on the
  minutes document, which the client's login can read once they are issued.
  It is kept in a private document beside the minutes
  (moms/{id}/private/studio), with where it sat, and put back when the
  studio reads or edits the minutes. A topic with only studio-only lines goes
  there whole, title and all.
*/
export interface PrivatePart {
  lines: { topicId: string; index: number; line: MinutesLine }[];
  topics: { index: number; topic: MinutesTopic }[];
}

export const emptyPrivate = (): PrivatePart => ({ lines: [], topics: [] });

/** The topics as stored on the minutes, and the studio's own part. */
export function splitPrivate(topics: MinutesTopic[] | undefined): { shared: MinutesTopic[]; priv: PrivatePart } {
  const shared: MinutesTopic[] = [];
  const priv = emptyPrivate();
  (topics || []).forEach((t, ti) => {
    const lines = t.lines || [];
    if (lines.length && lines.every(isStudioOnly)) {
      priv.topics.push({ index: ti, topic: t });
      return;
    }
    lines.forEach((l, li) => { if (isStudioOnly(l)) priv.lines.push({ topicId: t.id, index: li, line: l }); });
    shared.push({ ...t, lines: lines.filter((l) => !isStudioOnly(l)) });
  });
  return { shared, priv };
}

/** The whole minutes again, each studio-only line back where it was. */
export function mergePrivate(shared: MinutesTopic[] | undefined, priv: PrivatePart | null | undefined): MinutesTopic[] {
  const out = (shared || []).map((t) => ({ ...t, lines: [...(t.lines || [])] }));
  if (!priv) return out;
  const known = new Set(allLines(out).map(({ line }) => line.id));
  for (const p of [...(priv.lines || [])].sort((a, b) => a.index - b.index)) {
    if (known.has(p.line.id)) continue;
    const t = out.find((x) => x.id === p.topicId);
    if (t) t.lines.splice(Math.min(p.index, t.lines.length), 0, p.line);
    else out.push({ id: p.topicId, title: 'Studio only', lines: [p.line] });
  }
  for (const p of [...(priv.topics || [])].sort((a, b) => a.index - b.index)) {
    if (out.some((t) => t.id === p.topic.id)) continue;
    out.splice(Math.min(p.index, out.length), 0, p.topic);
  }
  return out;
}

/* ── Meetings across the whole project (mockups 7 and 8) ─────────────────── */

export interface MeetingTemplate {
  id: string;
  name: string;
  /** 1–6, the project stage it belongs to; 0 for any stage. */
  stage: number;
  /** The meeting type it saves as (lib/meetingTypes). */
  meetingType: string;
  /** Client meetings go through approval; internal and vendor ones save to the log. */
  client: boolean;
  /** Proposal and negotiation talk money: only an Owner, Admin or Ops Director writes them. */
  leadOnly?: boolean;
  /** The line kinds this meeting mostly uses, offered first. */
  kinds: LineKind[];
  /** The topics it starts with. */
  topics: string[];
  /** What its lines feed, in a few words. */
  feeds: string;
}

export const STAGES = ['Any stage', 'Initial Consultation', 'Scope & Strategy', 'Proposal & Revisions', 'Agreement & Design', 'Execution & Site', 'Handover & Closeout'];

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  { id: 'discovery', name: 'Discovery meeting', stage: 1, meetingType: 'client_meeting', client: true, kinds: ['requirement', 'note', 'question', 'studio_only'], topics: ['The family and how they live', 'Rooms and what they want', 'Timeline and possession'], feeds: 'Requirements → project brief' },
  { id: 'measurement', name: 'Measurement survey', stage: 1, meetingType: 'measurement_survey', client: true, kinds: ['note', 'action', 'question'], topics: ['Site conditions', 'Services: electrical, plumbing, AC'], feeds: 'Site notes → brief' },
  { id: 'scope_walkthrough', name: 'Scope walkthrough', stage: 2, meetingType: 'client_meeting', client: true, kinds: ['decision', 'requirement', 'question'], topics: ['Rooms in scope', 'Rooms out of scope'], feeds: 'Rooms in / out → scope' },
  { id: 'internal_scope', name: 'Internal scope review', stage: 2, meetingType: 'internal_meeting', client: false, kinds: ['note', 'action', 'studio_only'], topics: ['Scope review'], feeds: 'Studio notes only' },
  { id: 'proposal', name: 'Proposal presentation', stage: 3, meetingType: 'client_meeting', client: true, leadOnly: true, kinds: ['decision', 'question', 'action', 'studio_only'], topics: ['Options presented', 'What the client chose'], feeds: 'Option chosen → proposal' },
  { id: 'negotiation', name: 'Negotiation call', stage: 3, meetingType: 'client_meeting', client: true, leadOnly: true, kinds: ['decision', 'action', 'studio_only'], topics: ['Revisions asked'], feeds: 'Revisions asked → proposal' },
  { id: 'design_review', name: 'Design review', stage: 4, meetingType: 'client_meeting', client: true, kinds: ['decision', 'design_change', 'action', 'selection'], topics: ['Drawings reviewed'], feeds: 'Changes → design changes list' },
  { id: 'material_selection', name: 'Material selection', stage: 4, meetingType: 'client_meeting', client: true, kinds: ['selection', 'decision', 'action'], topics: ['Kitchen', 'Wardrobes', 'Bathrooms'], feeds: 'Selections → Materials' },
  { id: 'site_visit', name: 'Site visit', stage: 5, meetingType: 'site_visit', client: true, kinds: ['action', 'decision', 'question'], topics: ['Progress seen', 'Issues at site'], feeds: 'Actions → action list' },
  { id: 'vendor_coordination', name: 'Vendor coordination', stage: 5, meetingType: 'vendor_meeting', client: false, kinds: ['action', 'note', 'studio_only'], topics: ['Work this week'], feeds: 'Studio notes only' },
  { id: 'snag_walk', name: 'Snag walk', stage: 6, meetingType: 'site_visit', client: true, kinds: ['action', 'note'], topics: ['Snags by room'], feeds: 'Snags → action list' },
  { id: 'handover', name: 'Handover meeting', stage: 6, meetingType: 'client_meeting', client: true, kinds: ['decision', 'action', 'note'], topics: ['Handed over', 'Still to finish'], feeds: 'Items → handover' },
  { id: 'internal', name: 'Internal meeting', stage: 0, meetingType: 'internal_meeting', client: false, kinds: ['note', 'action', 'decision', 'studio_only'], topics: ['Discussion'], feeds: 'Studio notes only' },
  { id: 'call', name: 'Call or chat', stage: 0, meetingType: 'client_meeting', client: true, kinds: ['decision', 'action', 'note', 'question'], topics: ['Discussion'], feeds: 'Lines as usual' },
];

export const templateById = (id: string | null | undefined) => MEETING_TEMPLATES.find((t) => t.id === id) || null;

/** Templates for the picker: this stage's first, then the rest in stage order; the lead-only ones only for leads. */
export function templatesFor(stage: number | null | undefined, lead: boolean): (MeetingTemplate & { now: boolean })[] {
  const st = Number(stage) || 0;
  return MEETING_TEMPLATES
    .filter((t) => lead || !t.leadOnly)
    .map((t) => ({ ...t, now: !!st && t.stage === st }))
    .sort((a, b) => Number(b.now) - Number(a.now) || (a.stage || 9) - (b.stage || 9));
}

/** The template a meeting starts from when nobody chose one: by its type and the project's stage. */
export function defaultTemplate(meetingType: string, stage: number | null | undefined, title?: string | null): MeetingTemplate {
  const t = String(meetingType || '');
  const st = Number(stage) || 0;
  /* The meeting's own title says most: "Material selection with the Naiks". */
  const words = String(title || '').toLowerCase();
  const byTitle: [RegExp, string][] = [
    [/material|selection|laminate|finish/, 'material_selection'], [/design review|drawing/, 'design_review'], [/snag/, 'snag_walk'],
    [/handover/, 'handover'], [/discovery|first meeting/, 'discovery'], [/measure/, 'measurement'], [/scope/, 'scope_walkthrough'],
    [/vendor|carpenter|contractor/, 'vendor_coordination'],
  ];
  for (const [rx, id] of byTitle) if (rx.test(words) && !/internal|vendor/.test(t)) return templateById(id)!;
  if (/internal/.test(t)) return templateById('internal')!;
  if (/vendor/.test(t)) return templateById('vendor_coordination')!;
  if (/measurement/.test(t)) return templateById('measurement')!;
  if (/site/.test(t)) return templateById(st >= 6 ? 'snag_walk' : 'site_visit')!;
  if (st === 1) return templateById('discovery')!;
  if (st === 2) return templateById('scope_walkthrough')!;
  if (st === 4) return templateById('design_review')!;
  if (st === 6) return templateById('handover')!;
  return templateById('call')!;
}

/** The empty topics a template starts with. */
export const templateTopics = (t: MeetingTemplate, now?: number): MinutesTopic[] => t.topics.map((title) => emptyTopic(title, now));

/** Internal and vendor meetings: saved to the project log, never sent to the client. */
export const isLogOnly = (meetingType: unknown) => /internal|vendor/.test(String(meetingType || ''));

/* ── Where lines go once approved ────────────────────────────────────────── */

export interface Outbox {
  requirements: { lineId: string; text: string; room?: string | null; priority?: string | null }[];
  selections: { lineId: string; text: string; item?: string | null; room?: string | null; choice?: string | null }[];
  designChanges: { lineId: string; text: string; room?: string | null; sheet?: string | null }[];
}

/**
 * Requirements, selections and design changes, as they wait to be added to
 * the brief, Materials and the design changes list. Kept on the minutes when
 * they are approved; each screen offers to add them, and marks each one added.
 */
export function outboxOf(topics: MinutesTopic[] | undefined): Outbox {
  const out: Outbox = { requirements: [], selections: [], designChanges: [] };
  for (const { line, topic } of allLines(topics)) {
    const text = line.text.trim();
    if (!text) continue;
    const room = line.meta?.room?.trim() || topic.title.trim() || null;
    if (line.kind === 'requirement') out.requirements.push({ lineId: line.id, text, room, priority: line.meta?.priority || null });
    else if (line.kind === 'selection') out.selections.push({ lineId: line.id, text, item: line.meta?.item || null, room, choice: line.meta?.choice || null });
    else if (line.kind === 'design_change') out.designChanges.push({ lineId: line.id, text, room, sheet: line.meta?.sheet || null });
  }
  return out;
}

/** What waits to be added from issued minutes, across a project. */
export function waitingFromMinutes(moms: any[], kind: keyof Outbox): { momId: string; ref: string; meeting: string; item: any }[] {
  const out: { momId: string; ref: string; meeting: string; item: any }[] = [];
  for (const m of moms || []) {
    if (m?.format !== 2 || !ISSUED.includes(String(m.status))) continue;
    const filed = m.filed || {};
    for (const item of m.outbox?.[kind] || []) {
      if (!filed[item.lineId]) out.push({ momId: String(m.id), ref: String(m.momRef || ''), meeting: String(m.meetingTitle || ''), item });
    }
  }
  return out;
}

/* ── From the last meeting ───────────────────────────────────────────────── */

const ISSUED: string[] = ['finalised', 'shared', 'acknowledged', 'correction_requested'];

/**
 * Open actions from the project's earlier issued minutes, newest minutes
 * first, each once. Minutes being written (this one) are left out.
 */
export function openFromEarlier(moms: any[], exceptId?: string): CarriedAction[] {
  const out: CarriedAction[] = [];
  const seen = new Set<string>();
  const issued = (moms || [])
    .filter((m) => m && m.id !== exceptId && ISSUED.includes(String(m.status)))
    .sort((a, b) => (Number(b.meetingDate) || 0) - (Number(a.meetingDate) || 0));
  for (const m of issued) {
    /* Open questions without an owner go to the next meeting too (format 2 minutes only). */
    for (const { line } of allLines(m.format === 2 ? m.topics : [])) {
      if (line.kind !== 'question' || line.owner?.name || line.status === 'done' || line.status === 'cancelled' || !line.text.trim()) continue;
      const key = line.text.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ momId: String(m.id), ref: String(m.momRef || ''), actionId: line.id, text: `Open question: ${line.text.trim()}`, ownerName: 'To answer', due: null, outcome: null });
    }
    for (const a of m.actionItems || []) {
      if (!a?.text || (a.status && a.status !== 'open')) continue;
      const key = String(a.text).trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        momId: String(m.id), ref: String(m.momRef || ''), actionId: String(a.id || ''), text: String(a.text),
        ownerName: String(a.ownerName || (a.owner === 'client' ? 'Client' : a.owner === 'vendor' ? 'Vendor' : 'Studio')),
        due: typeof a.dueDate === 'number' ? a.dueDate : null, outcome: null,
      });
    }
  }
  return out;
}

/* ── Before you send ─────────────────────────────────────────────────────── */

export interface SendCheck {
  ok: boolean;
  text: string;
  /** Stops the minutes going for approval until it is fixed. */
  blocking: boolean;
}

/** What the "Before you send" list says, as the minutes are written. */
export function checksOf(m: Pick<MinutesV2, 'topics' | 'summary' | 'carried' | 'nextMeeting' | 'attendees'>): SendCheck[] {
  const lines = allLines(m.topics).map((x) => x.line).filter((l) => l.text.trim());
  const owned = lines.filter((l) => l.kind === 'action');
  const noOwner = owned.filter((l) => !l.owner?.name?.trim()).length;
  const noDue = owned.filter((l) => !l.due).length;
  const unchecked = lines.filter((l) => l.fromNotes).length;
  const unmarked = (m.carried || []).filter((c) => !c.outcome).length;
  const people = (m.attendees || []).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const out: SendCheck[] = [
    lines.length
      ? { ok: true, text: `${plural(lines.length, 'point', 'points')} written`, blocking: true }
      : { ok: false, text: 'No points written yet', blocking: true },
    people
      ? { ok: true, text: `${plural(people, 'person', 'people')} marked present or away`, blocking: false }
      : { ok: false, text: 'Nobody marked as present', blocking: false },
    noOwner
      ? { ok: false, text: `${plural(noOwner, 'action has', 'actions have')} no owner`, blocking: true }
      : { ok: true, text: 'Every action has an owner', blocking: true },
    noDue
      ? { ok: false, text: `${plural(noDue, 'action has', 'actions have')} no due date`, blocking: true }
      : { ok: true, text: 'Every action has a date', blocking: true },
    unchecked
      ? { ok: false, text: `${plural(unchecked, 'point', 'points')} from notes not checked yet`, blocking: true }
      : { ok: true, text: 'No points left unchecked from notes', blocking: true },
  ];
  if ((m.carried || []).length) {
    out.push(unmarked
      ? { ok: false, text: `${plural(unmarked, 'action', 'actions')} from the last meeting not marked`, blocking: true }
      : { ok: true, text: 'Last meeting\'s actions marked', blocking: true });
  }
  out.push(m.summary?.trim()
    ? { ok: true, text: '"In brief" written', blocking: false }
    : { ok: false, text: '"In brief" is empty', blocking: false });
  out.push(m.nextMeeting?.date
    ? { ok: true, text: `Next meeting: ${m.nextMeeting.date}${m.nextMeeting.time ? `, ${m.nextMeeting.time}` : ''}`, blocking: false }
    : { ok: false, text: 'No next meeting set', blocking: false });
  return out;
}

/** Ready to go for approval: nothing blocking is left. */
export const readyToSend = (checks: SendCheck[]): boolean => checks.every((c) => c.ok || !c.blocking);

/** Lines flagged for scope or cost: Anish sees these first. */
export const flaggedCount = (topics: MinutesTopic[] | undefined) =>
  allLines(topics).filter(({ line }) => line.flags?.scope || line.flags?.cost).length;

/* ── Where the minutes are ───────────────────────────────────────────────── */

export type FlowStep = 0 | 1 | 2 | 3 | 4;
export const FLOW_STEPS = ['Write', 'Review', 'Send', 'Confirmed'] as const;

/** The step the minutes are at: 0 write, 1 review, 2 send, 3 waiting for the client, 4 confirmed. */
export function flowStep(m: Pick<MinutesV2, 'status' | 'revisionStage'> & { meetingType?: string }): FlowStep {
  if (m.status === 'finalised' && isLogOnly(m.meetingType)) return 4;
  if (m.revisionStage === 'pending_review') return 1;
  if (m.revisionStage === 'draft') return 0;
  switch (m.status) {
    case 'pending_review': return 1;
    case 'finalised': return 2;
    case 'shared': return 3;
    case 'acknowledged': return 4;
    case 'correction_requested': return 0;
    default: return 0;
  }
}

export type ChipTone = 'slate' | 'amber' | 'brand' | 'emerald' | 'rose';

/** The status chip: "Draft", "With Anish", "Waiting for client"… */
export function statusChip(m: Pick<MinutesV2, 'status' | 'revisionStage' | 'reviewNotes'> & { trail?: TrailEntry[]; meetingType?: string }, reviewerName = 'the Ops Director'): { label: string; tone: ChipTone } {
  if (m.status === 'finalised' && isLogOnly(m.meetingType)) return { label: 'In the project log', tone: 'emerald' };
  if (m.revisionStage === 'pending_review') return { label: `Revision with ${reviewerName}`, tone: 'amber' };
  if (m.revisionStage === 'draft') return { label: 'Revision being written', tone: 'slate' };
  const last = (m.trail || [])[(m.trail || []).length - 1];
  switch (m.status) {
    case 'pending_review': return { label: `With ${reviewerName}`, tone: 'amber' };
    case 'finalised': return { label: 'Approved', tone: 'brand' };
    case 'shared': return { label: 'Waiting for client', tone: 'brand' };
    case 'acknowledged': return { label: 'Confirmed', tone: 'emerald' };
    case 'correction_requested': return { label: 'Correction asked', tone: 'rose' };
    default:
      return last?.step === 'returned' ? { label: 'Returned with notes', tone: 'amber' } : { label: 'Draft', tone: 'slate' };
  }
}

/** Add a step to the record. The record only ever grows. */
export function withStep(trail: TrailEntry[] | undefined, entry: TrailEntry): TrailEntry[] {
  return [...(trail || []), entry];
}

/**
 * The record as people read it: the steps the studio took, with the client's
 * confirmation or correction added from the fields the portal writes (the
 * client may not write the record itself).
 */
export function fullTrail(m: { trail?: TrailEntry[]; acknowledgedAt?: number; acknowledgedBy?: string; correctionRequest?: { by?: string; at?: number } | null }): TrailEntry[] {
  const out = [...(m.trail || [])];
  if (m.correctionRequest?.at && !out.some((e) => e.step === 'correction_asked' && e.at === m.correctionRequest!.at)) {
    out.push({ step: 'correction_asked', at: m.correctionRequest.at, by: m.correctionRequest.by || '', byName: m.correctionRequest.by || 'the client' });
  }
  if (m.acknowledgedAt && !out.some((e) => e.step === 'confirmed')) {
    out.push({ step: 'confirmed', at: m.acknowledgedAt, by: m.acknowledgedBy || '', byName: m.acknowledgedBy || 'the client', note: 'In the client portal' });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The step's words on the record: "Approved by Anish K". */
export function stepLabel(e: TrailEntry): string {
  const who = e.byName || e.by;
  switch (e.step) {
    case 'written': return `Written by ${who}`;
    case 'sent_for_approval': return `Sent for approval by ${who}`;
    case 'returned': return `Returned with notes by ${who}`;
    case 'approved': return `Approved by ${who}`;
    case 'sent': return `Sent by ${who}`;
    case 'confirmed': return `Confirmed by ${who}`;
    case 'correction_asked': return `Correction asked by ${who}`;
    case 'revision_started': return `Revision started by ${who}`;
    case 'logged': return `Saved to the project log by ${who}`;
    default: return who;
  }
}

/* ── Changes only ────────────────────────────────────────────────────────── */

export interface TopicDiff {
  /** Lines that are new, or whose words, kind, owner or date changed. */
  changed: Set<string>;
  /** Lines that were there before and are gone. */
  removed: { line: MinutesLine; topicTitle: string }[];
}

const sig = (l: MinutesLine) => JSON.stringify([l.kind, l.text.trim(), l.owner?.name || '', l.owner?.side || '', l.due || 0]);

/** What changed between the version the reviewer saw and this one. */
export function diffTopics(before: MinutesTopic[] | null | undefined, after: MinutesTopic[] | undefined): TopicDiff {
  const was = new Map(allLines(before || []).map(({ line, topic }) => [line.id, { line, topicTitle: topic.title }]));
  const changed = new Set<string>();
  for (const { line } of allLines(after)) {
    const prior = was.get(line.id);
    if (!prior || sig(prior.line) !== sig(line)) changed.add(line.id);
    was.delete(line.id);
  }
  return { changed, removed: [...was.values()] };
}

/* ── What the client reads ───────────────────────────────────────────────── */

export interface ClientLine {
  lineId: string;
  ref: string;
  text: string;
  topic: string;
  /** "You · by Sat 17 Oct" or "Form Factors · by Thu 15 Oct". */
  owner?: string;
}

/**
 * The client's view: what was agreed and the next steps, numbered as on the
 * PDF. A vendor's action reads as the studio's; a vendor's name never shows.
 */
export function clientView(topics: MinutesTopic[] | undefined, studioName: string, fmtDue: (ms: number) => string) {
  const refs = lineRefs(topics);
  const agreed: ClientLine[] = [];
  const next: ClientLine[] = [];
  const notes: ClientLine[] = [];
  for (const { line, topic } of allLines(topics)) {
    const text = line.text.trim();
    if (!text) continue;
    if (isStudioOnly(line)) continue;
    const base = { lineId: line.id, ref: refs[line.id] || '', text, topic: topic.title };
    if (line.kind === 'selection') agreed.push({ ...base, text: selectionText(line) });
    else if (line.kind === 'design_change') agreed.push({ ...base, text: `Change: ${text}${line.meta?.sheet ? ` (${line.meta.sheet})` : ''}` });
    else if (line.kind === 'requirement') notes.push({ ...base, text: `${text}${line.meta?.priority === 'must' ? ' (must have)' : line.meta?.priority === 'nice' ? ' (nice to have)' : ''}` });
    else if (line.kind === 'decision') agreed.push(base);
    else if (refs[line.id]) {
      const who = line.owner?.side === 'client' ? 'You' : studioName;
      next.push({ ...base, text: line.kind === 'question' ? `${text}` : text, owner: `${who}${line.due ? ` · by ${fmtDue(line.due)}` : ''}` });
    } else notes.push(base);
  }
  return { agreed, next, notes };
}

/** A correction the client typed, checked before it is saved. */
export function cleanCorrections(lines: CorrectionLine[], topics: MinutesTopic[] | undefined): CorrectionLine[] {
  const known = new Set(allLines(topics).map(({ line }) => line.id));
  return (lines || [])
    .filter((c) => c && known.has(c.lineId) && String(c.text || '').trim())
    .slice(0, 50)
    .map((c) => ({ lineId: c.lineId, ref: String(c.ref || '').slice(0, 8), text: String(c.text).trim().slice(0, 1000) }));
}

/** The one-paragraph correction stored beside the lines, for screens that read only `text`. */
export const correctionText = (lines: CorrectionLine[]) =>
  lines.map((c) => `${c.ref ? `${c.ref}: ` : ''}${c.text}`).join('\n').slice(0, 2000);

/* ── The client ──────────────────────────────────────────────────────── */

/**
 * The project's client, for sending minutes: their name, every email on the
 * project (the email field may hold several, separated by commas) and phone.
 */
export function clientContactOf(ctx: any): { name: string; emails: string[]; phone: string | null } {
  /* Everyone on the client's side gets the minutes by email (lib/clientContacts.ts); WhatsApp goes to the main contact. */
  return { name: String(ctx?.clientName || '').trim(), emails: clientEmails(ctx), phone: String(ctx?.clientPhone || '').trim() || null };
}

/* ── Dates ───────────────────────────────────────────────────────────────── */

/** "Thu 15 Oct". */
export const fmtShortDay = (ms: number) =>
  new Date(ms).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** A due date from a YYYY-MM-DD, at 6 PM India time. */
export const dueFromKey = (key: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const t = new Date(`${key}T18:00:00+05:30`).getTime();
  return Number.isFinite(t) ? t : null;
};

/** The YYYY-MM-DD a due date falls on, in India. */
export const keyOfDue = (ms: number | null | undefined): string => {
  if (!ms) return '';
  return new Date(ms + 5.5 * 3600000).toISOString().slice(0, 10);
};

/** Quick due dates from the meeting day: tomorrow, this Friday, a week on. */
export function quickDues(fromMs: number): { label: string; at: number }[] {
  const DAY = 86400000;
  const key = keyOfDue(fromMs) || keyOfDue(Date.now());
  const base = dueFromKey(key)!;
  const dow = new Date(base + 5.5 * 3600000).getUTCDay();
  const toFri = ((5 - dow + 7) % 7) || 7;
  return [
    { label: 'Tomorrow', at: base + DAY },
    { label: 'Fri', at: base + toFri * DAY },
    { label: 'Next week', at: base + 7 * DAY },
  ];
}
