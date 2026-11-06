/*
  THE STUDIO'S PREVIEW OF THE CLIENT PORTAL, KEPT IDENTICAL TO THE CLIENT'S.

  The Client portal tab used to draw the portal from the whole project, while a
  client draws it from their stored copy (lib/portalProjection). Two sources
  meant two screens: Unique Vistas' designer screenshotted 8 drawings in the
  preview and the client signed in to far fewer, because the copy had dropped
  each drawing's room and title.

  The preview now draws from the client's copy, built by the same code a send
  uses. Two things follow, and both live here.

  1. Edits made in the preview (an approval taken in the office, a query
     answered, an update added) are made to that copy, not to the project. The
     copy leaves out costs, vendors, notes and drafts, so saving it back whole
     would erase them. applyPreviewEdit takes what the edit changed -- and only
     that -- and applies it to the project, matching list items by id.

  2. Whether the client is actually looking at what the preview shows. The
     stored copy is compared with the preview in full, not by section counts:
     counts cannot see a drawing that lost its room, a changed amount, or a
     re-issued document with the same number of entries.
*/

type Json = any;

const isPlainObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/* Firestore hands back Timestamps for Dates; the comparison is on the instant. */
function normalise(v: Json): Json {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== 'object') return typeof v === 'number' && Number.isNaN(v) ? null : v;
  if (v instanceof Date) return v.getTime();
  if (typeof (v as any).toMillis === 'function') return (v as any).toMillis();
  if (typeof (v as any).seconds === 'number' && typeof (v as any).nanoseconds === 'number' && Object.keys(v).length === 2) {
    return (v as any).seconds * 1000 + Math.floor((v as any).nanoseconds / 1e6);
  }
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : normalise(x)));
  const out: Record<string, any> = {};
  for (const k of Object.keys(v).sort()) {
    const n = normalise((v as any)[k]);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

export function sameJson(a: Json, b: Json): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

const hasIds = (list: any[]) =>
  list.every((x) => isPlainObject(x) && (typeof x.id === 'string' || typeof x.id === 'number') && x.id !== '');

/**
 * Apply an edit made to the client's copy (`before` -> `after`) to the live
 * project value `live`. Everything the edit did not change is left exactly as
 * it is in `live`, including every field the copy never carried.
 */
export function applyPreviewEdit<T>(live: T, before: Json, after: Json): T {
  if (sameJson(before, after)) return live;

  if (isPlainObject(before) && isPlainObject(after)) {
    const base: Record<string, any> = isPlainObject(live) ? { ...(live as any) } : {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
      const b = before[k];
      const a = after[k];
      if (sameJson(b, a)) continue;
      if (a === undefined) { delete base[k]; continue; }
      if (b === undefined || base[k] === undefined) { base[k] = a; continue; }
      base[k] = applyPreviewEdit(base[k], b, a);
    }
    return base as T;
  }

  if (Array.isArray(before) && Array.isArray(after) && Array.isArray(live)) {
    /* Lists of records: matched by id, because the copy leaves drafts out and
       the positions in it are not positions in the project. */
    if (hasIds(before) && hasIds(after)) {
      const beforeById = new Map(before.map((x: any) => [String(x.id), x]));
      const afterById = new Map(after.map((x: any) => [String(x.id), x]));
      const out: any[] = [];
      for (const item of live as any[]) {
        const id = isPlainObject(item) && item.id != null ? String(item.id) : null;
        if (id && beforeById.has(id) && !afterById.has(id)) continue; // removed by the edit
        if (id && beforeById.has(id) && afterById.has(id)) {
          out.push(applyPreviewEdit(item, beforeById.get(id), afterById.get(id)));
          continue;
        }
        if (id && !beforeById.has(id) && afterById.has(id)) {
          // In the project but not in the copy (a draft), and the edit wrote it: keep its own fields.
          out.push({ ...item, ...afterById.get(id) });
          afterById.delete(id);
          continue;
        }
        out.push(item);
      }
      const liveIds = new Set((live as any[]).map((x: any) => (isPlainObject(x) && x.id != null ? String(x.id) : '')));
      for (const item of after as any[]) {
        const id = String(item.id);
        if (!beforeById.has(id) && !liveIds.has(id)) out.push(item); // added by the edit
      }
      return out as any;
    }
    /* Lists the copy carries whole and in order (rooms, milestones): by position. */
    if (before.length === (live as any[]).length && after.length === before.length) {
      return (live as any[]).map((item, i) => applyPreviewEdit(item, before[i], after[i])) as any;
    }
  }

  return after as T;
}

/* Written by every build; not part of what the client sees. */
const IGNORED_TOP = new Set(['builtAt']);
/*
  Carried in the copy but never drawn: the scope the "New" and "Revised"
  markers were measured against, kept so the studio can measure the next ones.
  The markers themselves are on the scope rows, which are compared. App derives
  this baseline afresh when a copy was sent without one, so comparing it made
  a just-opened project read "behind in scope" with nothing on screen changed.
*/
const IGNORED_CONTEXT = new Set(['clientBoqBaseline']);

/** Sections of the client's copy that differ between two views, by key. */
export function viewDifferences(sent: Json, preview: Json): string[] {
  if (!sent || !preview) return ['everything'];
  const diffs: string[] = [];
  const keys = new Set([...Object.keys(sent), ...Object.keys(preview)]);
  for (const k of keys) {
    if (IGNORED_TOP.has(k)) continue;
    if (k === 'context' && isPlainObject(sent.context) && isPlainObject(preview.context)) {
      const ck = new Set([...Object.keys(sent.context), ...Object.keys(preview.context)]);
      for (const c of ck) if (!IGNORED_CONTEXT.has(c) && !sameJson(sent.context[c], preview.context[c])) diffs.push(c);
      continue;
    }
    if (!sameJson(sent[k], preview[k])) diffs.push(k);
  }
  return diffs.sort();
}

/** Plain names for the parts of the copy, for telling the studio what is out of date. */
const SECTION_LABEL: Record<string, string> = {
  designDocuments: 'drawings',
  siteUpdates: 'site updates',
  projectUpdates: 'updates',
  siteVisits: 'site visits',
  momHistory: 'minutes',
  materialSelections: 'finish selections',
  boqRevisions: 'scope revisions',
  projectDecisions: 'decisions',
  paymentMilestones: 'payments',
  portalMoney: 'payment amounts',
  clientBoq: 'scope',
  clientSchedule: 'programme',
  documents: 'documents',
  termsDockets: 'terms',
  scopeAdditions: 'scope additions',
  designRecord: 'design record',
  portalStudio: 'studio details',
  rooms: 'rooms',
};

export function differenceLabels(keys: string[]): string[] {
  return [...new Set(keys.map((k) => SECTION_LABEL[k] || 'project details'))];
}
