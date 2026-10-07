import { collection, collectionGroup, doc, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { ref, uploadBytesResumable, getBlob } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from './firebaseClient';
import { uploadPrefix, readShape, type ReviewSummary, type ReviewVersion, type ReviewMark, type ReviewRound, type ReviewEvent, type MarkShape } from '../lib/drawingReview';

/*
  The browser's side of Design Review: it listens, uploads into its own
  folder, and asks the drawingReview function to do everything else. Nothing
  here writes review state -- the rules would refuse it if it tried.
*/

export interface ReviewDrawing {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  roomName?: string | null;
  priority?: 'high' | 'normal' | 'low';
  targetDate?: string;
  companionOf?: string | null;
  boqTriggers?: string[];
  review?: ReviewSummary;
}

const trackerPath = (orgId: string, projectId: string) => `organizations/${orgId}/projects/${projectId}/drawingTracker`;
const drawingPath = (orgId: string, projectId: string, drawingId: string) => `${trackerPath(orgId, projectId)}/${drawingId}`;

const toDrawing = (orgId: string, projectId: string, id: string, data: any): ReviewDrawing => ({
  id, orgId, projectId,
  name: String(data?.name || 'Drawing'),
  roomName: data?.roomName || null,
  priority: data?.priority,
  targetDate: data?.targetDate,
  companionOf: data?.companionOf || null,
  boqTriggers: data?.boqTriggers || [],
  review: data?.review,
});

/** Every drawing of one project, live. */
export function watchProjectDrawings(orgId: string, projectId: string, onChange: (list: ReviewDrawing[]) => void, onError?: (e: any) => void) {
  if (!db) return () => undefined;
  return onSnapshot(collection(db, trackerPath(orgId, projectId)),
    (snap) => onChange(snap.docs.map((d) => toDrawing(orgId, projectId, d.id, d.data()))),
    (e) => onError?.(e));
}

/**
 * The studio's drawings that have a review, across every project: the Design
 * Head's inbox. One query that names the studio, as the rules require.
 */
export function watchStudioReviews(orgId: string, onChange: (list: ReviewDrawing[]) => void, onError?: (e: any) => void) {
  if (!db) return () => undefined;
  const q = query(collectionGroup(db, 'drawingTracker'), where('review.orgId', '==', orgId), where('review.state', 'in', ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED']));
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => {
    const data: any = d.data();
    return toDrawing(orgId, data.review?.projectId, d.id, data);
  })), (e) => onError?.(e));
}

/** One drawing, live: the sheet screen follows it while it is open. */
export function watchDrawing(orgId: string, projectId: string, drawingId: string, onChange: (d: ReviewDrawing | null) => void) {
  if (!db) return () => undefined;
  return onSnapshot(doc(db, drawingPath(orgId, projectId, drawingId)),
    (snap) => onChange(snap.exists() ? toDrawing(orgId, projectId, snap.id, snap.data()) : null),
    () => onChange(null));
}

function watchSub<T>(orgId: string, projectId: string, drawingId: string, sub: string, order: string | null, onChange: (rows: T[]) => void) {
  if (!db) return () => undefined;
  const c = collection(db, `${drawingPath(orgId, projectId, drawingId)}/${sub}`);
  return onSnapshot(order ? query(c, orderBy(order)) : c, (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as T)), () => onChange([]));
}
export const watchVersions = (o: string, p: string, d: string, cb: (v: ReviewVersion[]) => void) => watchSub<ReviewVersion>(o, p, d, 'reviewVersions', 'n', cb);
/* A sketch's points come back from storage flattened; turn them into pairs for drawing. */
export const watchMarks = (o: string, p: string, d: string, cb: (v: ReviewMark[]) => void) =>
  watchSub<ReviewMark>(o, p, d, 'reviewMarks', 'n', (rows) => cb(rows.map((m) => ({ ...m, shape: readShape(m.shape) }))));
export const watchRounds = (o: string, p: string, d: string, cb: (v: ReviewRound[]) => void) => watchSub<ReviewRound>(o, p, d, 'reviewRounds', 'attempt', cb);
export const watchEvents = (o: string, p: string, d: string, cb: (v: ReviewEvent[]) => void) => watchSub<ReviewEvent>(o, p, d, 'reviewEvents', 'at', cb);

/* ------------------------------------------------------------- actions */

export class ReviewError extends Error {
  constructor(message: string, public code: string) { super(message); }
}

async function call(data: Record<string, any>): Promise<any> {
  if (!functions) throw new ReviewError('Not connected to the studio.', 'unavailable');
  try {
    const res = await httpsCallable(functions, 'drawingReview', { timeout: 120000 })(data);
    return res.data;
  } catch (e: any) {
    const code = String(e?.code || '').replace('functions/', '');
    throw new ReviewError(e?.message && code !== 'internal' ? e.message : 'Something went wrong on our side. Try again in a moment.', code);
  }
}

type Target = { orgId: string; projectId: string; drawingId: string };

export const submitSheet = (t: Target, expectedRev?: number, note?: string) => call({ ...t, action: 'submit', expectedRev, note });
export const withdrawSheet = (t: Target, expectedRev?: number) => call({ ...t, action: 'withdraw', expectedRev });
export const approveSheet = (t: Target, expectedRev: number, reason?: string) => call({ ...t, action: 'approve', expectedRev, reason });
export const returnSheet = (t: Target, expectedRev: number, reason: string) => call({ ...t, action: 'return', expectedRev, reason });
export const setAudience = (t: Target, audience: 'client' | 'studio') => call({ ...t, action: 'audience', audience });
/** Take back a PDF nobody has reviewed yet; the sheet returns to the version before it. */
export const removeVersion = (t: Target, expectedRev: number, versionId: string) => call({ ...t, action: 'remove', expectedRev, versionId });
export const createMark = (t: Target, page: number, shape: MarkShape, text: string, blocking = false) => call({ ...t, action: 'mark', op: 'create', page, shape, text, blocking });
export const updateMark = (t: Target, markId: string, patch: { text?: string; blocking?: boolean }) => call({ ...t, action: 'mark', op: 'update', markId, ...patch });
export const deleteMark = (t: Target, markId: string) => call({ ...t, action: 'mark', op: 'delete', markId });
export const fixMark = (t: Target, markId: string, fixed: boolean) => call({ ...t, action: 'mark', op: fixed ? 'fix' : 'unfix', markId });

/* ------------------------------------------------------------- uploads */

const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'drawing.pdf';

function put(path: string, data: Blob, contentType: string, onProgress?: (fraction: number) => void): Promise<void> {
  if (!storage) return Promise.reject(new ReviewError('Not connected to the studio.', 'unavailable'));
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage!, path), data, { contentType });
    task.on('state_changed',
      (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      (e) => reject(new ReviewError(e?.code === 'storage/unauthorized' ? 'You cannot upload to this drawing.' : 'The upload stopped. Check the connection and try again.', String(e?.code || 'upload'))),
      () => resolve());
  });
}

/**
 * Upload a PDF to the caller's own folder for this drawing, then ask the
 * function to check it and make it a version. `submit` sends it straight to
 * the Design Head. Reports its stages so the screen can say what is happening.
 */
export async function uploadSheet(t: Target, uid: string, file: File, opts: {
  note?: string; submit?: boolean; thumb?: Blob | null; expectedRev?: number;
  onStage?: (stage: 'uploading' | 'checking', fraction?: number) => void;
}) {
  /*
    Ask the server first. A refusal (wrong project, sheet under review) is
    explained before any bytes move, and if the drawingReview function is not
    reachable -- not deployed yet -- the screen says so instead of reporting
    a storage refusal that sounds like a permission problem.
  */
  try {
    await call({ ...t, action: 'check' });
  } catch (e: any) {
    if (e instanceof ReviewError && ['internal', 'not-found', 'unavailable'].includes(e.code) && !/drawing|project/i.test(e.message)) {
      throw new ReviewError('Could not reach Design Review on the server. If it has not been deployed yet, uploads cannot start. Nothing was uploaded.', 'not-deployed');
    }
    throw e;
  }
  const stamp = Date.now().toString(36);
  const base = `${uploadPrefix(t.orgId, t.projectId, t.drawingId, uid)}${stamp}_${safeName(file.name).replace(/\.pdf$/i, '')}`;
  opts.onStage?.('uploading', 0);
  await put(`${base}.pdf`, file, 'application/pdf', (f) => opts.onStage?.('uploading', f));
  let thumbPath: string | null = null;
  if (opts.thumb) {
    try { await put(`${base}.png`, opts.thumb, 'image/png'); thumbPath = `${base}.png`; } catch { thumbPath = null; }
  }
  opts.onStage?.('checking');
  return call({ ...t, action: 'finalize', uploadPath: `${base}.pdf`, thumbPath, fileName: file.name, note: opts.note || '', submit: !!opts.submit, expectedRev: opts.expectedRev });
}

/* ------------------------------------------------------------- reading files */

const blobs = new Map<string, Promise<Blob>>();

/** A stored file, through the rules (never a shareable link), cached for the session. */
export function fileBlob(path: string): Promise<Blob> {
  if (!storage) return Promise.reject(new ReviewError('Not connected to the studio.', 'unavailable'));
  if (!blobs.has(path)) {
    const p = getBlob(ref(storage, path));
    p.catch(() => blobs.delete(path));
    blobs.set(path, p);
  }
  return blobs.get(path)!;
}

const urls = new Map<string, string>();
export async function fileUrl(path: string): Promise<string> {
  if (urls.has(path)) return urls.get(path)!;
  const url = URL.createObjectURL(await fileBlob(path));
  urls.set(path, url);
  return url;
}

/** Hands the studio tab a drawing to open, from anywhere in the app. */
export function openInDesignReview(projectId: string, drawingId: string) {
  try { sessionStorage.setItem('ffds_design_review_open', JSON.stringify({ projectId, drawingId })); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('change-tab', { detail: 'design-review' }));
}
export function takeOpenRequest(): { projectId: string; drawingId: string } | null {
  try {
    const raw = sessionStorage.getItem('ffds_design_review_open');
    sessionStorage.removeItem('ffds_design_review_open');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
