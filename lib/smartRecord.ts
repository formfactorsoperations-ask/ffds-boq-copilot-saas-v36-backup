import type { Item, SnagItem } from '../types';
import { addDays } from './opsDesk';
import { matchBank } from './bankMatch';
import { calculateSellPrice } from './utils';

/*
  SMART RECORD (smart workspace, PR 3, ideas G and H; owner, 27 Nov 2026: "AI
  on project notes: yes", nothing outside the app).

  After a site visit, a meeting or a call, a person types, pastes or speaks
  rough notes once. The AI (services/opsAssistService readNotes, the same
  server-side proxy every AI call uses) sorts them into the kinds below, the
  Ops Desk's capture with two more: a decision and a snag. Nothing is filed
  until the person ticks it, and each kind goes where the studio already keeps
  it:

    decision       a draft on Record Decision (services/decisionsService), to
                   be sent to the client for sign-off from there;
    snag           the project's snag list (context.snagList), as Site Quality
                   writes it;
    our_promise, client_promise, date, open_question
                   a line in the follow-up log with its own next step, as the
                   Ops Desk's capture writes them (lib/opsAssist);
    extra_work     the scope-creep catcher: is it already in the BOQ, and what
                   the Item bank would price it at, then a scope addition to
                   draft on Scope Additions, or, for a role that does not price,
                   an escalation for the leads (as the Ops Desk does).

  Nothing goes to the client from here. Pure, so the tests run it.
*/

export type RecordKind = 'decision' | 'snag' | 'extra_work' | 'client_promise' | 'our_promise' | 'date' | 'open_question';

export const RECORD_GROUPS: { kind: RecordKind; label: string; becomes: string }[] = [
  { kind: 'decision', label: 'Decisions', becomes: 'A draft on Record Decision, to send for sign-off' },
  { kind: 'snag', label: 'Snags', becomes: 'On the snag list' },
  { kind: 'extra_work', label: 'Possible extra work', becomes: 'Checked against the BOQ and the Item bank' },
  { kind: 'client_promise', label: 'The client promised', becomes: 'A check on your desk' },
  { kind: 'our_promise', label: 'We promised', becomes: 'A next step on your desk' },
  { kind: 'date', label: 'Dates to remember', becomes: 'A reminder on your desk' },
  { kind: 'open_question', label: 'Questions to answer', becomes: 'A next step on your desk' },
];

export type RecordSource = 'site_visit' | 'meeting' | 'call';
export const SOURCE_LABEL: Record<RecordSource, string> = { site_visit: 'Site visit', meeting: 'Meeting', call: 'Call' };

export type DecisionCategory = 'Site Condition' | 'Client Request' | 'Design Upgrade' | 'Value Engineering';
const CATEGORIES: DecisionCategory[] = ['Site Condition', 'Client Request', 'Design Upgrade', 'Value Engineering'];

export interface RecordItem {
  id: string;
  kind: RecordKind;
  text: string;
  /** The room it is about, when the notes say so. */
  room: string | null;
  due: string | null;
  /** Decisions only. */
  category: DecisionCategory | null;
  /** Snags only. */
  severity: SnagItem['severity'] | null;
  selected: boolean;
}

export interface NotesRead { summary: string; items: RecordItem[] }

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const isDay = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) && !Number.isNaN(Date.parse(s.slice(0, 10)));

/** Whatever the AI answered, made safe to show and file: known kinds, real dates, known rooms, bounded lengths. */
export function normaliseNotes(raw: any, rooms: string[] = []): NotesRead {
  const kinds = new Set(RECORD_GROUPS.map((g) => g.kind));
  const roomOf = (r: unknown) => {
    const t = clip(r, 80).toLowerCase();
    if (!t) return null;
    return rooms.find((x) => x.toLowerCase() === t) || rooms.find((x) => x.toLowerCase().includes(t) || t.includes(x.toLowerCase())) || clip(r, 80);
  };
  const items: RecordItem[] = (Array.isArray(raw?.items) ? raw.items : [])
    .filter((x: any) => kinds.has(x?.kind) && clip(x?.text, 300))
    .slice(0, 25)
    .map((x: any, i: number) => ({
      id: `n${i}`,
      kind: x.kind as RecordKind,
      text: clip(x.text, 300),
      room: roomOf(x.room),
      due: isDay(x?.due) ? String(x.due).slice(0, 10) : null,
      category: x.kind === 'decision' ? (CATEGORIES.includes(x?.category) ? x.category : 'Client Request') : null,
      severity: x.kind === 'snag' ? (['low', 'medium', 'high'].includes(x?.severity) ? x.severity : 'medium') : null,
      selected: true,
    }));
  return { summary: clip(raw?.summary, 600), items };
}

/* ───────────── what filing writes ───────────── */

export interface FollowUpPlan { note: string; outcome: 'info' | 'promised'; next: { text: string; due: string } | null }
export interface DecisionPlan { title: string; decisionText: string; roomName: string; category: DecisionCategory; presentees: string; boqImpact: 'none' | 'new_item' }
export interface FilingPlan {
  /** One line for the visit itself, then one per promise, date or question. */
  followUps: FollowUpPlan[];
  decisions: DecisionPlan[];
  snags: Omit<SnagItem, 'id' | 'raisedAt'>[];
  /** Extra work, for the scope-creep catcher. */
  extras: RecordItem[];
}

/** What filing the ticked items writes, kind by kind. `raisedBy` is who logs the snags. */
export function filingPlan(r: NotesRead, source: RecordSource, today: string, raisedBy: SnagItem['raisedBy'], presentees = ''): FilingPlan {
  const picked = r.items.filter((i) => i.selected);
  const label = SOURCE_LABEL[source];
  const followUps: FollowUpPlan[] = [{
    note: `${label}: ${r.summary || 'Notes recorded'}`.slice(0, 2000),
    outcome: picked.some((i) => i.kind === 'client_promise') ? 'promised' : 'info',
    next: null,
  }];
  const decisions: DecisionPlan[] = [];
  const snags: FilingPlan['snags'] = [];
  const extras: RecordItem[] = [];
  for (const i of picked) {
    if (i.kind === 'decision') {
      decisions.push({
        title: i.text.slice(0, 120), decisionText: `${i.text}\n\nRecorded from the ${label.toLowerCase()} notes.`.slice(0, 2000),
        roomName: i.room || 'General / Project-Wide', category: i.category || 'Client Request', presentees, boqImpact: 'none',
      });
    } else if (i.kind === 'snag') {
      snags.push({ roomId: '', roomName: i.room || 'General', description: i.text, severity: i.severity || 'medium', status: 'open', raisedBy, notes: `From the ${label.toLowerCase()} notes` });
    } else if (i.kind === 'extra_work') {
      extras.push(i);
    } else {
      const lead = { our_promise: 'We promised', client_promise: 'Client promised', date: 'Date to remember', open_question: 'Client asked' }[i.kind];
      const next = { our_promise: i.text, client_promise: `Check: ${i.text}`, date: `Remember: ${i.text}`, open_question: `Answer: ${i.text}` }[i.kind];
      followUps.push({ note: `${lead}: ${i.text}`, outcome: i.kind === 'client_promise' ? 'promised' : 'info', next: { text: next.slice(0, 300), due: i.due || addDays(today, i.kind === 'client_promise' ? 3 : 2) } });
    }
  }
  return { followUps, decisions, snags, extras };
}

/* ───────────── the scope-creep catcher ───────────── */

export interface ScopeCheck {
  /** The BOQ line it already reads as, by name (lib/bankMatch), or null when none does. */
  inBoq: { name: string } | null;
  /** The nearest Item bank items, best first, with the rate the studio sells each at, per its unit. */
  bank: Array<{ id: string; name: string; unit: string; rate: number }>;
}

/**
 * Is this extra work already in the BOQ, and what would the Item bank price it
 * at? Both are matched by name the way the bank matches everything
 * (lib/bankMatch matchBank): the same words, not a guess. A rate is per the
 * item's unit; the quantity is for the person to decide on Scope Additions.
 */
export function scopeCheck(text: string, boq: Array<{ id?: string; name?: string; unit?: string }>, bank: Item[]): ScopeCheck {
  const lines = (boq || []).filter((l) => l && l.name).map((l, i) => ({ ...l, id: String(l.id || `boq${i}`) })) as any[];
  const inLine = matchBank(text, lines, { max: 3 });
  const found = inLine.kind === 'exact' || inLine.kind === 'close' ? inLine.item : null;
  const m = matchBank(text, bank || [], { max: 3 });
  const pool = (m.item ? [m.item, ...m.candidates.filter((c) => c !== m.item)] : m.candidates).slice(0, 3);
  return {
    inBoq: found ? { name: String(found.name) } : null,
    bank: pool.map((it) => ({ id: it.id, name: String(it.name), unit: String(it.unit || ''), rate: Math.round(calculateSellPrice(it.materials || 0, it.labor || 0, it.margin || 0)) })),
  };
}

/* ───────────── handing a request to Scope Additions ───────────── */

const SCOPE_KEY = 'ffds_scope_addition_draft';

/** Ask the Scope Additions screen to open its form with this request written in. */
export function askScopeAddition(projectId: string, request: string): void {
  try { sessionStorage.setItem(SCOPE_KEY, JSON.stringify({ projectId, request: clip(request, 600) })); } catch { /* private mode: the form opens empty */ }
}

/** The request for this project, read once; null when there is none or it is for another project. */
export function takeScopeAddition(projectId: string): string | null {
  try {
    const raw = sessionStorage.getItem(SCOPE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v?.projectId !== projectId) return null;
    sessionStorage.removeItem(SCOPE_KEY);
    return clip(v.request, 600) || null;
  } catch { return null; }
}

/* ───────────── the prompt ───────────── */

export const NOTES_INSTRUCTIONS = `You read rough notes an interior design studio wrote, or a voice note it recorded, after a site visit, a meeting or a call about one project.
Return JSON with:
- summary: two sentences, plain English, what happened and what was agreed.
- items: each thing worth acting on, with kind one of:
  decision (something the client chose or agreed, e.g. a finish, a layout, a colour),
  snag (a defect or something wrong on site to fix, e.g. a level off, a crack, a wrong fitting),
  extra_work (work the client asked for that may be outside the agreed scope, e.g. a new unit or a room not in the plan),
  client_promise (something the client said they will do, e.g. pay, choose, send),
  our_promise (something the studio said it will do),
  date (a date that matters, e.g. a family visit or a delivery),
  open_question (something the client asked that still needs an answer).
  text: one short line in plain English.
  room: the room it is about, using the project's room names when one fits, else "".
  due: YYYY-MM-DD if a date is stated or clearly implied, else "".
  category (decisions only): one of "Site Condition", "Client Request", "Design Upgrade", "Value Engineering".
  severity (snags only): "low", "medium" or "high".
Use only what the notes say. Do not invent amounts, dates, names or rooms. Never put a price on extra work.`;
