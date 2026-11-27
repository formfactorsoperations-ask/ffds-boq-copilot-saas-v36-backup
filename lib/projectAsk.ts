import type { ProjectBrief, BriefAction } from './opsAssist';
import type { FollowUp } from './opsDesk';
import type { StoryItem } from './projectThread';

/*
  ASK THIS PROJECT, AND ITS PROMISES (smart workspace, PR 4, ideas F and N;
  owner, 27 Nov 2026: mainly for owners and project leads, AI on project notes
  yes, nothing outside the app).

  Ask: the list's search box also takes a question. It is answered from one
  record of this project only: the Ops Desk's project brief (lib/opsAssist
  buildProjectBrief, built from the copy of the project without the studio's
  costs and margins), the workspace's story (lib/projectThread) and its open
  snags. The answer names the parts of the record it used and the screens to
  open; when the record does not say, it says so. It never writes a message to
  the client (owner: that is the Messages screen's and Clients' job).

  Promises: what the studio promised the client and what the client promised,
  still open: next steps in the follow-up log (from the Ops Desk's capture,
  Smart Record and notes) and open action items in shared minutes. Late ones
  first. A follow-up's next step can be marked done from here.

  Pure, so the tests run it.
*/

/* ───────────── ask ───────────── */

export interface AskScreen { route: string; name: string }

export interface AskRecord {
  brief: ProjectBrief;
  /** The project's story, newest last, as the workspace tells it. */
  story: Array<{ day: string; text: string; detail?: string; by?: string; side: string }>;
  snags: Array<{ room: string; text: string; severity: string; status: string; raised: string | null }>;
  /** The screens this person may open, for the answer to point at. */
  screens: AskScreen[];
}

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The record the AI reads, capped so a long project still fits. */
export function askRecord(i: { brief: ProjectBrief; story: StoryItem[]; snags: any[]; screens: AskScreen[] }): AskRecord {
  return {
    brief: i.brief,
    story: (i.story || []).slice(-80).map((s) => ({
      day: day(s.at), text: clip(s.text, 200), ...(s.detail ? { detail: clip(s.detail, 160) } : {}), ...(s.meta ? { by: clip(s.meta, 80) } : {}), side: s.side,
    })),
    snags: (i.snags || []).filter((s) => s && s.status !== 'verified').slice(0, 40).map((s) => ({
      room: clip(s.roomName, 60), text: clip(s.description, 200), severity: String(s.severity || ''), status: String(s.status || ''),
      raised: typeof s.raisedAt === 'number' ? day(s.raisedAt) : null,
    })),
    screens: i.screens,
  };
}

export interface ProjectAnswer { answer: string; sources: string[]; routes: string[] }

/** Whatever the AI answered, made safe: bounded text, and only screens this person may open. */
export function normaliseAnswer(raw: any, screens: AskScreen[]): ProjectAnswer {
  const known = new Set(screens.map((s) => s.route));
  return {
    answer: clip(raw?.answer, 1500) || "The records here don't say.",
    sources: (Array.isArray(raw?.sources) ? raw.sources : []).map((s: any) => clip(s, 60)).filter(Boolean).slice(0, 6),
    routes: [...new Set((Array.isArray(raw?.routes) ? raw.routes : []).map((r: any) => String(r)).filter((r: string) => known.has(r)))].slice(0, 3) as string[],
  };
}

const ASKING = /^(what|who|whom|whose|when|where|why|how|which|did|do|does|is|are|was|were|has|have|had|can|could|should|will|would|any|tell|show|list)\b/i;

/** Whether a search reads as a question rather than a screen's name. */
export function looksLikeQuestion(q: string): boolean {
  const t = q.trim();
  if (t.length < 8) return false;
  return t.endsWith('?') || ASKING.test(t) || t.split(/\s+/).length >= 5;
}

export const PROJECT_ASK_INSTRUCTIONS = `You answer a question about one interior design project for the studio's owner or project lead, using only the JSON record given.
The record has: brief (the project, its client-side money, what the client is waiting on, decisions, open actions from minutes, recent follow-ups, open escalations), story (what happened, by day), snags (open defects) and screens (the project's screens this person may open).
Rules:
- Answer in two to four plain sentences. Name dates, rooms and amounts exactly as the record has them.
- If the record does not say, answer "The records here don't say." and say which screen would have it, if one would.
- The record has no costs, margins or vendor rates. If asked about them, say they are not part of this record.
- When brief.money.amountsHidden is true there are no amounts: never state or guess a figure.
- Never write a message to the client.
- sources: the parts of the record you used, as short labels (e.g. "Decision: Kitchen shutters", "Story 18 Nov", "Snag: Hall", "Payments").
- routes: up to three screens to open, using only route values from screens.`;

/* ───────────── promises ───────────── */

export interface PromiseLine {
  id: string;
  text: string;
  /** YYYY-MM-DD, when one was set. */
  due: string | null;
  late: boolean;
  /** Where it came from: a follow-up (can be marked done here) or minutes. */
  from: { kind: 'follow-up'; followUpId: string; by: string } | { kind: 'minutes'; ref: string | null };
  /** Who is to do it, when the record names someone. */
  owner: string | null;
}

export interface Promises { ours: PromiseLine[]; theirs: PromiseLine[]; late: number }

const THEIRS = /^(check:|client promised)/i;
const NOT_PROMISE = /^remember:/i;

/**
 * What is promised and still open, each side, late first then soonest. A
 * follow-up's next step counts unless it is only a date to remember; "Check:"
 * next steps and "Client promised" lines are the client's.
 */
export function promisesOf(i: { followUps: FollowUp[]; actions: BriefAction[]; today: string }): Promises {
  const ours: PromiseLine[] = [];
  const theirs: PromiseLine[] = [];
  for (const f of i.followUps || []) {
    if (!f?.next || f.nextDone || NOT_PROMISE.test(f.next.text || '')) continue;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(f.next.due || '')) ? f.next.due : null;
    const line: PromiseLine = {
      id: `f:${f.id}`, text: clip(String(f.next.text || '').replace(/^check:\s*/i, ''), 200), due, late: !!due && due < i.today,
      from: { kind: 'follow-up', followUpId: f.id, by: clip(f.byName || f.by, 60) }, owner: f.next.ownerName ? clip(f.next.ownerName, 60) : null,
    };
    (THEIRS.test(f.next.text || '') || THEIRS.test(f.note || '') ? theirs : ours).push(line);
  }
  (i.actions || []).forEach((a, n) => {
    if (a.side === 'other') return;
    const line: PromiseLine = {
      id: `m:${n}:${a.text}`, text: a.text, due: a.due, late: !!a.due && a.due < i.today,
      from: { kind: 'minutes', ref: a.from }, owner: a.ownerName,
    };
    (a.side === 'client' ? theirs : ours).push(line);
  });
  const order = (a: PromiseLine, b: PromiseLine) => (Number(b.late) - Number(a.late)) || String(a.due || '9999').localeCompare(String(b.due || '9999'));
  ours.sort(order); theirs.sort(order);
  return { ours, theirs, late: ours.filter((x) => x.late).length + theirs.filter((x) => x.late).length };
}
