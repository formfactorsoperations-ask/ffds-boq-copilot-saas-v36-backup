import type { MarkShape } from './drawingReview';

/*
  DESIGN DESK 2.0, the two AI features the owner kept (24 Nov 2026):

    1. CHANGES FOUND FOR YOU. The desk already outlines where a new revision
       differs from the last one (lib/sheetDiff.ts). Here each outlined area
       gets a short name, and each note from the last revision gets a hint:
       it looks fixed, it looks the same, or the desk cannot tell.
    3. REPEAT-MISTAKE ALERTS. When the Design Head keeps writing the same
       note on one designer's drawings, the desk says so while the next one
       is being checked.

  Both ask Gemini (services/deskAiService.ts). This file is the part that can
  be tested without it: what is asked, and what is believed of the answer.
  The model's answer is never trusted for a number or an id. Names are
  clipped, verdicts must be one of three words, a note or change it mentions
  must be one that was sent, and how often a mistake came back is counted
  here from the notes themselves, not read from the answer. Nothing here
  approves, sends back or changes a drawing: these are hints beside the
  Design Head's own check.
*/

/* ------------------------------------------------------------ 1. changes found for you */

export type Verdict = 'fixed' | 'same' | 'unsure';

export interface ChangeNames {
  /** A short name for each outlined change, by its number on the page (1, 2, 3...). */
  names: Record<number, string>;
  /** A hint for each note of the last revision that was sent, by the note's id. */
  notes: Record<string, { verdict: Verdict; why: string }>;
}

/** At most this many outlined changes and notes are sent for one page, to keep the request small. */
export const MAX_AI_CHANGES = 6;
export const MAX_AI_NOTES = 8;
/** Only the first pages of a drawing are named by themselves. */
export const MAX_AI_PAGES = 3;

/** A part of a page, as fractions of the page as it is stored. */
export interface Region { x: number; y: number; w: number; h: number }

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A region grown a little on every side so its surroundings can be seen, kept inside the page. */
export function padRegion(r: Region, pad = 0.04): Region {
  const x = clamp01(r.x - pad), y = clamp01(r.y - pad);
  return { x, y, w: Math.max(0.02, clamp01(r.x + r.w + pad) - x), h: Math.max(0.02, clamp01(r.y + r.h + pad) - y) };
}

/** The part of the page a note is about: around a pin, or the box, arrow or sketch itself with some room. */
export function noteRegion(shape: MarkShape, around = 0.12): Region {
  if (shape.t === 'pin') return padRegion({ x: shape.x, y: shape.y, w: 0, h: 0 }, around);
  if (shape.t === 'rect') return padRegion({ x: shape.x, y: shape.y, w: shape.w, h: shape.h }, 0.05);
  if (shape.t === 'arrow') {
    /* An arrow points at the thing: its head is (x2, y2). */
    return padRegion({ x: Math.min(shape.x, shape.x2), y: Math.min(shape.y, shape.y2), w: Math.abs(shape.x2 - shape.x), h: Math.abs(shape.y2 - shape.y) }, 0.07);
  }
  const xs = shape.pts.map((p) => p[0]), ys = shape.pts.map((p) => p[1]);
  if (!xs.length) return { x: 0, y: 0, w: 1, h: 1 };
  return padRegion({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, 0.06);
}

/** Notes are named A, B, C... in the request, so the model never sees or returns a real id. */
export const noteKey = (i: number) => String.fromCharCode(65 + i);

/** What is asked about one page: the outlined changes and the last revision's notes, each as a before and an after picture. */
export function changePrompt(changes: number, notes: { key: string; text: string }[]): string {
  return [
    'You are helping an interior design studio check a revised drawing against the revision before it.',
    'Each item below has two pictures of the same part of the sheet: BEFORE (the earlier revision) and AFTER (the new one).',
    '',
    changes ? `There are ${changes} CHANGED AREAS, numbered from 1. For each, say what changed in at most six plain words, for example "Tall unit moved left", "Dimension changed to 600", "Note added", "Shutter split in two". If you cannot see what changed, say "Small change".` : 'There are no changed areas to name.',
    notes.length ? `There are ${notes.length} NOTES from the earlier revision, lettered from A. Each note asked for something to be changed at that spot. For each, compare BEFORE and AFTER and answer with exactly one verdict: "fixed" if AFTER shows what the note asked for, "same" if that spot looks unchanged, "unsure" if you cannot tell. Give the reason in at most twelve plain words. Prefer "unsure" to a guess.` : 'There are no notes to check.',
    '',
    ...notes.map((n) => `NOTE ${n.key} asked: ${n.text.replace(/\s+/g, ' ').slice(0, 240)}`),
    '',
    'Answer in JSON only: {"changes":[{"n":1,"name":"..."}],"notes":[{"key":"A","verdict":"fixed","why":"..."}]}',
  ].join('\n');
}

const clean = (raw: unknown, max: number) => String(raw ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const json = (text: string): any => {
  try { return JSON.parse(String(text || '').replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim()); } catch { return null; }
};

/**
 * What is kept of the model's answer for one page. A change number outside
 * the ones sent, a note that was not sent, a verdict that is not one of the
 * three, and empty names are all dropped.
 */
export function parseChangeNames(text: string, changes: number, noteIds: string[]): ChangeNames {
  const out: ChangeNames = { names: {}, notes: {} };
  const data = json(text);
  if (!data || typeof data !== 'object') return out;
  (Array.isArray(data.changes) ? data.changes : []).forEach((c: any) => {
    const n = Math.floor(Number(c?.n));
    const name = clean(c?.name, 60).replace(/[.;,]+$/, '');
    if (n >= 1 && n <= changes && name && !out.names[n]) out.names[n] = name.charAt(0).toUpperCase() + name.slice(1);
  });
  (Array.isArray(data.notes) ? data.notes : []).forEach((x: any) => {
    const i = String(x?.key || '').trim().toUpperCase().charCodeAt(0) - 65;
    const id = noteIds[i];
    const verdict = x?.verdict === 'fixed' || x?.verdict === 'same' || x?.verdict === 'unsure' ? (x.verdict as Verdict) : null;
    if (id && verdict && !out.notes[id]) out.notes[id] = { verdict, why: clean(x?.why, 140) };
  });
  return out;
}

/** The words beside a note for each verdict; nothing is shown for "unsure". */
export const VERDICT_LABEL: Record<Verdict, string> = { fixed: 'AI: looks fixed', same: 'AI: looks the same', unsure: '' };

/* ------------------------------------------------------------ 3. repeat-mistake alerts */

/** A note the Design Head wrote on one of a designer's drawings. */
export interface PastNote { id: string; drawingId: string; drawing: string; text: string; at: number }

/** A mistake that keeps coming back. */
export interface Repeat {
  /** What keeps being asked for, in a few words: "Skirting height not marked". */
  title: string;
  /** How many different drawings it was noted on, counted here from the notes. */
  drawings: number;
  /** How many notes in all. */
  notes: number;
  /** Up to three of the drawings, newest first. */
  examples: string[];
  /** A note the Design Head could add to the drawing in hand. */
  suggestion: string;
  /** When it was last noted. */
  latestAt: number;
}

export const REPEAT_WINDOW_DAYS = 60;
/** It is a repeat once it has been noted on this many different drawings. */
export const REPEAT_MIN_DRAWINGS = 3;
export const REPEAT_MAX_DRAWINGS = 12;
export const REPEAT_MAX_NOTES = 120;
/** What was found is kept this long on the device before the designer's notes are read again. */
export const REPEAT_KEEP_MS = 24 * 3_600_000;

const DAY = 86_400_000;

interface RowLike { id: string; projectId: string; name: string; review?: { designer?: { email?: string | null } | null; marksTotal?: number; updatedAt?: number } | null }

/**
 * The designer's recent drawings that have notes on them, newest first: the
 * ones whose notes are read. The drawing being checked is left out, since its
 * notes are being written now.
 */
export function recentDrawingsOf<T extends RowLike>(rows: T[], email: string | null | undefined, now = Date.now(), except?: { projectId: string; id: string }): T[] {
  const who = String(email || '').toLowerCase();
  if (!who) return [];
  return rows
    .filter((d) => String(d.review?.designer?.email || '').toLowerCase() === who && (d.review?.marksTotal || 0) > 0
      && (d.review?.updatedAt || 0) >= now - REPEAT_WINDOW_DAYS * DAY && !(except && d.projectId === except.projectId && d.id === except.id))
    .sort((a, b) => (b.review?.updatedAt || 0) - (a.review?.updatedAt || 0))
    .slice(0, REPEAT_MAX_DRAWINGS);
}

/** The notes that are sent: inside the window, newest first, numbered from 1 in the request. */
export function notesToAsk(notes: PastNote[], now = Date.now()): PastNote[] {
  return notes.filter((n) => n.text.trim() && n.at >= now - REPEAT_WINDOW_DAYS * DAY).sort((a, b) => b.at - a.at).slice(0, REPEAT_MAX_NOTES);
}

/** What is asked: group the notes that ask for the same thing. `asked` is the list from notesToAsk. */
export function repeatPrompt(asked: PastNote[]): string {
  return [
    'These are notes a Design Head wrote on one designer\'s interior drawings, one per line as "number | drawing | note".',
    'Find the mistakes that keep coming back: groups of notes that ask for the same kind of correction on DIFFERENT drawings (for example a missing dimension of the same kind, an unmarked height, a hinge side not shown).',
    'Do not group notes that are only about the same room or the same drawing. Leave out anything that appears on fewer than three different drawings. If nothing repeats, return an empty list.',
    'For each group give: "title", the mistake in at most six plain words; "note", one short sentence the Design Head could write on the next drawing, starting with a verb; "ids", the numbers of every note in the group.',
    '',
    ...asked.map((n, i) => `${i + 1} | ${n.drawing.replace(/[|\n]/g, ' ').slice(0, 60)} | ${n.text.replace(/\s+/g, ' ').slice(0, 220)}`),
    '',
    'Answer in JSON only: {"repeats":[{"title":"...","note":"...","ids":[1,2,3]}]}',
  ].join('\n');
}

/**
 * What is kept of the answer. Every number must be one of the notes sent;
 * how many drawings a mistake appeared on is counted from those notes, and a
 * group on fewer than three different drawings is dropped whatever the model
 * said. The most widespread first, three at most.
 */
export function parseRepeats(text: string, asked: PastNote[]): Repeat[] {
  const data = json(text);
  const groups: any[] = Array.isArray(data?.repeats) ? data.repeats : [];
  const used = new Set<number>();
  const out: Repeat[] = [];
  groups.forEach((g) => {
    const title = clean(g?.title, 60).replace(/[.;,]+$/, '');
    const ids = [...new Set((Array.isArray(g?.ids) ? g.ids : []).map((n: unknown) => Math.floor(Number(n))))] as number[];
    /* A note belongs to one group only: the first that claims it. */
    const mine = ids.filter((n) => n >= 1 && n <= asked.length && !used.has(n));
    const notes = mine.map((n) => asked[n - 1]).sort((a, b) => b.at - a.at);
    const byDrawing = new Map<string, PastNote>();
    notes.forEach((n) => { if (!byDrawing.has(n.drawingId)) byDrawing.set(n.drawingId, n); });
    if (!title || byDrawing.size < REPEAT_MIN_DRAWINGS) return;
    mine.forEach((n) => used.add(n));
    out.push({
      title: title.charAt(0).toUpperCase() + title.slice(1), drawings: byDrawing.size, notes: notes.length,
      examples: [...byDrawing.values()].slice(0, 3).map((n) => n.drawing), suggestion: clean(g?.note, 160), latestAt: notes[0]?.at || 0,
    });
  });
  return out.sort((a, b) => b.drawings - a.drawings || b.latestAt - a.latestAt).slice(0, 3);
}

const first = (n?: string | null) => String(n || '').split(/[\s@]/)[0] || 'This designer';

/** The sentence under a repeat, while a drawing is being checked. */
export function repeatLine(designerName: string | null | undefined, r: Repeat): string {
  return `${first(designerName)} has had this note on ${r.drawings} drawings in the last ${REPEAT_WINDOW_DAYS} days (${r.examples.join(', ')}${r.drawings > r.examples.length ? ' and more' : ''}). Check it on this one.`;
}

/** What the device remembers about one designer, so Home can show it without asking again. */
export interface RepeatMemo { email: string; name: string; at: number; repeats: Repeat[] }

/** The memos still fresh enough to show, each with something to say, the most widespread first. */
export function freshRepeats(memos: RepeatMemo[], now = Date.now()): RepeatMemo[] {
  return memos.filter((m) => m.repeats.length > 0 && now - m.at < 7 * DAY).sort((a, b) => (b.repeats[0]?.drawings || 0) - (a.repeats[0]?.drawings || 0));
}
