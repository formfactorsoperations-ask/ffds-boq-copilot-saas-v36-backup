import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebaseClient';
import { getAi } from './aiClient';
import { Type } from './aiSchema';
import { FLASH_MODEL } from '../constants/aiModels';
import { fileBlob, type ReviewDrawing } from './drawingReviewService';
import { loadPdf, renderPage } from '../lib/pdfRender';
import type { ChangeBox } from '../lib/sheetDiff';
import type { ReviewMark } from '../lib/drawingReview';
import {
  MAX_AI_CHANGES, MAX_AI_NOTES, REPEAT_KEEP_MS, changePrompt, noteKey, noteRegion, notesToAsk, padRegion, parseChangeNames, parseRepeats, repeatPrompt,
  type ChangeNames, type PastNote, type Region, type Repeat, type RepeatMemo,
} from '../lib/deskAi';

/*
  The Design Desk's two AI features, on the browser's side (rules and the
  checks on the answer: lib/deskAi.ts). Both go through the studio's own
  Gemini key by the aiGenerate function (services/aiClient.ts), which is for
  studio staff only and is rate limited. Nothing here writes to a drawing.
*/

/* ------------------------------------------------------------ 1. changes found for you */

const PAGE_WIDTH = 1500;
const CROP_SIDE = 640;

async function pageCanvas(path: string, page: number): Promise<HTMLCanvasElement | null> {
  const doc = await loadPdf(path, async () => (await fileBlob(path)).arrayBuffer());
  if (page >= doc.numPages) return null;
  const canvas = document.createElement('canvas');
  await renderPage(doc, page, canvas, PAGE_WIDTH, 0);
  return canvas;
}

/** One part of a page as a JPEG, base64 without its header. */
function crop(src: HTMLCanvasElement, r: Region): string | null {
  const sx = Math.round(r.x * src.width), sy = Math.round(r.y * src.height);
  const sw = Math.max(8, Math.round(r.w * src.width)), sh = Math.max(8, Math.round(r.h * src.height));
  const k = Math.min(1, CROP_SIDE / Math.max(sw, sh));
  const out = document.createElement('canvas');
  out.width = Math.max(8, Math.round(sw * k)); out.height = Math.max(8, Math.round(sh * k));
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', 0.82).split(',')[1] || null;
}

const picture = (data: string) => ({ inlineData: { mimeType: 'image/jpeg', data } });

const CHANGE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    changes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { n: { type: Type.NUMBER }, name: { type: Type.STRING } } } },
    notes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { key: { type: Type.STRING }, verdict: { type: Type.STRING }, why: { type: Type.STRING } } } },
  },
};

export interface NameChangesInput {
  currentPath: string;
  previousPath: string;
  page: number;
  /** Where the page changed, as the desk outlines it (numbered in this order). */
  boxes: ChangeBox[];
  /** The last revision's notes on this page. */
  notes: Pick<ReviewMark, 'id' | 'shape' | 'text'>[];
}

/**
 * Names each outlined change on one page and gives a hint for each of the
 * last revision's notes. Sends a before and an after picture of each area,
 * never the whole drawing.
 */
export async function nameChanges({ currentPath, previousPath, page, boxes, notes }: NameChangesInput): Promise<ChangeNames> {
  const some = boxes.slice(0, MAX_AI_CHANGES);
  const asked = notes.slice(0, MAX_AI_NOTES);
  if (!some.length && !asked.length) return { names: {}, notes: {} };
  const [after, before] = await Promise.all([pageCanvas(currentPath, page), pageCanvas(previousPath, page)]);
  if (!after || !before) return { names: {}, notes: {} };

  const parts: any[] = [{ text: changePrompt(some.length, asked.map((n, i) => ({ key: noteKey(i), text: n.text }))) }];
  const pair = (label: string, r: Region) => {
    const a = crop(before, r), b = crop(after, r);
    if (!a || !b) return;
    parts.push({ text: `${label} BEFORE:` }, picture(a), { text: `${label} AFTER:` }, picture(b));
  };
  some.forEach((b, i) => pair(`CHANGED AREA ${i + 1}`, padRegion(b)));
  asked.forEach((n, i) => pair(`NOTE ${noteKey(i)}`, noteRegion(n.shape)));

  const res = await getAi().models.generateContent({
    model: FLASH_MODEL,
    contents: [{ role: 'user', parts }],
    config: { responseMimeType: 'application/json', responseSchema: CHANGE_SCHEMA, temperature: 0.1 },
  });
  return parseChangeNames(res?.text || '', some.length, asked.map((n) => n.id));
}

/* What was found for a pair of revisions is kept on the device, so opening the drawing again asks nothing. */
const NAMES_KEY = 'ffds_dd2_changes_v1';
const MAX_KEPT = 60;

export function keptChangeNames(key: string): ChangeNames | null {
  try { return (JSON.parse(localStorage.getItem(NAMES_KEY) || '{}') as Record<string, ChangeNames>)[key] || null; } catch { return null; }
}
export function keepChangeNames(key: string, value: ChangeNames): void {
  try {
    const all = JSON.parse(localStorage.getItem(NAMES_KEY) || '{}') as Record<string, ChangeNames>;
    delete all[key];
    all[key] = value;
    const keys = Object.keys(all);
    keys.slice(0, Math.max(0, keys.length - MAX_KEPT)).forEach((k) => { delete all[k]; });
    localStorage.setItem(NAMES_KEY, JSON.stringify(all));
  } catch { /* storage off or full: it is asked again next time */ }
}

/* ------------------------------------------------------------ 3. repeat-mistake alerts */

/** The Design Head's notes on these drawings (the client's changes from a meeting are not the designer's mistakes, so they are left out). */
export async function loadPastNotes(orgId: string, drawings: Pick<ReviewDrawing, 'id' | 'projectId' | 'name'>[]): Promise<PastNote[]> {
  if (!db) return [];
  const lists = await Promise.all(drawings.map(async (d) => {
    try {
      const snap = await getDocs(collection(db!, `organizations/${orgId}/projects/${d.projectId}/drawingTracker/${d.id}/reviewMarks`));
      return snap.docs.map((x) => ({ id: x.id, ...(x.data() as any) }))
        .filter((m: any) => m.source !== 'client' && typeof m.text === 'string')
        .map((m: any): PastNote => ({ id: `${d.projectId}/${d.id}/${m.id}`, drawingId: `${d.projectId}/${d.id}`, drawing: d.name, text: m.text, at: Number(m.at) || 0 }));
    } catch { return [] as PastNote[]; }
  }));
  return lists.flat();
}

const REPEAT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    repeats: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, note: { type: Type.STRING }, ids: { type: Type.ARRAY, items: { type: Type.NUMBER } } } } },
  },
};

/** The mistakes that keep coming back in these notes. Asks nothing when there are too few notes for anything to repeat. */
export async function findRepeats(notes: PastNote[], now = Date.now()): Promise<Repeat[]> {
  const asked = notesToAsk(notes, now);
  if (new Set(asked.map((n) => n.drawingId)).size < 3) return [];
  const res = await getAi().models.generateContent({
    model: FLASH_MODEL,
    contents: repeatPrompt(asked),
    config: { responseMimeType: 'application/json', responseSchema: REPEAT_SCHEMA, temperature: 0.1 },
  });
  return parseRepeats(res?.text || '', asked);
}

/* What was found about each designer, kept on the device for a day: Home shows it without asking again. */
const REPEATS_KEY = (orgId: string) => `ffds_dd2_repeats_v1_${orgId}`;

export function keptRepeats(orgId: string): RepeatMemo[] {
  try { const v = JSON.parse(localStorage.getItem(REPEATS_KEY(orgId)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function keepRepeats(orgId: string, memo: RepeatMemo): void {
  try {
    const rest = keptRepeats(orgId).filter((m) => m.email !== memo.email).slice(-30);
    localStorage.setItem(REPEATS_KEY(orgId), JSON.stringify([...rest, memo]));
  } catch { /* storage off */ }
}
/** What is remembered about one designer, if it was looked up within the last day. */
export function freshMemo(orgId: string, email: string, now = Date.now()): RepeatMemo | null {
  const m = keptRepeats(orgId).find((x) => x.email === email.toLowerCase());
  return m && now - m.at < REPEAT_KEEP_MS ? m : null;
}
