/*
  A project's cover photo (DESIGN.md "Projects: journey, needs you, one list",
  Cover photos; Phase 2).

  In order:
    1. the photo set as the cover: uploaded in the project's Details, or a
       render picked with "Set as cover" under Drawings → Renders;
    2. else the latest render the client approved: the image of a design
       decision the client confirmed;
    3. else the latest render, by its thumbnail link or its own link, with
       Google Drive links turned into images;
    4. else a default picture (lib/defaultPhotos; owner, 25 Nov 2026): the
       studio's own default photo, else an interior photo by project type,
       marked "No render yet" on the screen;
    5. else, when no picture loads at all, the stage-tinted "No render yet" tile.

  Everything here is pure: the Projects screen, the Details drawer and the
  renders list all ask the same question and get the same answer.
*/
import type { CoverPhoto, DesignDocument, ProjectContext } from '../types';
import { typePhotoOf } from './defaultPhotos';

/* ── Google Drive links as images ───────────────────────────────────────── */

const DRIVE_HOST = /^https?:\/\/(?:drive|docs)\.google\.com\//i;
const DRIVE_ID = /^[\w-]{10,}$/;

/** The file id of a Google Drive file link, or null when the link is not one (a folder is not a file). */
export function driveFileId(link?: string | null): string | null {
  const url = String(link || '').trim();
  if (!DRIVE_HOST.test(url)) return null;
  const path = url.match(/\/(?:file\/d|document\/d|presentation\/d|spreadsheets\/d)\/([\w-]+)/i)?.[1];
  if (path && DRIVE_ID.test(path)) return path;
  if (/\/drive\/(?:u\/\d+\/)?folders\//i.test(url)) return null;
  const q = url.match(/[?&]id=([\w-]+)/i)?.[1];
  return q && DRIVE_ID.test(q) ? q : null;
}

/**
 * A link that a browser can draw as an image: a Drive file link becomes
 * Drive's thumbnail address (it serves files shared with "anyone with the
 * link"; one that is not shared fails to load, and the screen falls back to
 * the next photo). Any other link is returned as it was.
 */
export function driveImageUrl(link?: string | null, width = 1600): string | null {
  const url = String(link || '').trim();
  if (!url) return null;
  const id = driveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${width}` : url;
}

/** A link that ends in a picture's extension. */
export const isPicture = (url?: string | null) => !!url && /\.(png|jpe?g|webp|avif|gif)(\?|#|$)/i.test(url);

/* ── Renders ────────────────────────────────────────────────────────────── */

type Doc = DesignDocument & { docType?: string; thumbnailUrl?: string; date?: string; issuedAt?: string };

/** A render: a 3D render, or a file with no type (renders came first and were never typed). */
export const isRender = (d: Doc) => !d.docType || d.docType === '3d_render';

/** When a file was added, whatever it was stored as (an ISO string, a number of milliseconds, or nothing). */
export function addedAtOf(d: { addedAt?: unknown; date?: unknown; issuedAt?: unknown }): number {
  const v = (d.addedAt ?? d.date ?? d.issuedAt) as unknown;
  if (typeof v === 'number') return v;
  const t = Date.parse(String(v ?? ''));
  return Number.isFinite(t) ? t : 0;
}

/** The image a file can be drawn as: its thumbnail link, else its own link when that is a picture or a Drive file. */
export function imageOfDoc(d: Doc, width = 1600): string | null {
  if (d.thumbnailUrl) return driveImageUrl(d.thumbnailUrl, width);
  if (isPicture(d.url)) return d.url;
  if (driveFileId(d.url)) return driveImageUrl(d.url, width);
  return null;
}

/** A render that can be set as the cover: it is a render and has an image. */
export const canBeCover = (d: Doc) => isRender(d) && !!imageOfDoc(d);

/* ── The cover ──────────────────────────────────────────────────────────── */

export type CoverSource = 'cover' | 'approved' | 'render' | 'studio' | 'type' | 'none';

/** A default picture: the studio's own default photo, or the one by project type. Marked "No render yet". */
export const isDefaultSource = (s: CoverSource) => s === 'studio' || s === 'type';

/** What a project's default picture is made from: the studio's default photo, and the project for its type photo. */
export interface CoverDefaults {
  /** organizations/{tenant}.defaultProjectPhoto.url */
  studioPhoto?: string | null;
  project?: { id?: string; context?: any } | null;
}

export interface Cover {
  url: string | null;
  source: CoverSource;
  /** The render a "Set as cover" points at, when it is one. */
  docId?: string;
}

type Ctx = Pick<ProjectContext, 'designDocuments' | 'projectDecisions'> & { coverPhoto?: CoverPhoto | null };

/**
 * Every photo the project could show, best first. The screen tries them in
 * order and moves on when one fails to load (a Drive file that is not
 * shared, a link that has gone).
 */
export function coverCandidates(ctx: Ctx | null | undefined, width = 1600, defaults?: CoverDefaults): Cover[] {
  const c = ctx || {};
  const docs = ((c.designDocuments || []) as Doc[]);
  const out: Cover[] = [];

  /* 1. Set as the cover. A cover that was a render the studio has since removed no longer counts. */
  const cover = c.coverPhoto;
  if (cover?.url) {
    const gone = cover.source === 'render' && cover.docId && !docs.some((d) => d.id === cover.docId);
    if (!gone) out.push({ url: driveImageUrl(cover.url, width), source: 'cover', docId: cover.docId });
  }

  /* 2. The latest render the client approved: the image of a design decision they confirmed. */
  const approved = (c.projectDecisions || [])
    .filter((d) => d.decisionNature === 'design' && d.status === 'confirmed' && (isPicture(d.photoUrl) || driveFileId(d.photoUrl)))
    .sort((a, b) => (Date.parse(b.clientConfirmedAt || b.date || '') || 0) - (Date.parse(a.clientConfirmedAt || a.date || '') || 0));
  for (const d of approved) out.push({ url: driveImageUrl(d.photoUrl, width), source: 'approved' });

  /* 3. The latest render that has an image, newest first (list order breaks a tie: later in the list is newer). */
  const renders = docs
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => canBeCover(d))
    .sort((a, b) => addedAtOf(b.d) - addedAtOf(a.d) || b.i - a.i);
  for (const { d } of renders) out.push({ url: imageOfDoc(d, width), source: 'render', docId: d.id });

  /* 4. A default picture: the studio's own, else one by the project's type. */
  if (defaults) {
    if (defaults.studioPhoto) out.push({ url: driveImageUrl(defaults.studioPhoto, width), source: 'studio' });
    if (defaults.project) out.push({ url: typePhotoOf(defaults.project, Math.min(width, 1600)), source: 'type' });
  }

  /* The same picture twice is tried once. */
  const seen = new Set<string>();
  return out.filter((x) => !!x.url && !seen.has(x.url) && !!seen.add(x.url));
}

/** The project's cover: the best of its candidates, or none. */
export function coverOf(ctx: Ctx | null | undefined, width = 1600, defaults?: CoverDefaults): Cover {
  return coverCandidates(ctx, width, defaults)[0] || { url: null, source: 'none' };
}

/** "Set as cover" on a render. */
export function coverFromRender(d: Doc, by?: string | null): CoverPhoto {
  return { url: d.thumbnailUrl || d.url, source: 'render', docId: d.id, setAt: Date.now(), ...(by ? { setBy: by } : {}) };
}

/** Is this render the project's cover? */
export const isCoverDoc = (ctx: Ctx | null | undefined, d: Pick<Doc, 'id'>) => ctx?.coverPhoto?.source === 'render' && ctx.coverPhoto.docId === d.id;

export const COVER_SOURCE_WORDS: Record<CoverSource, string> = {
  cover: 'The cover set for this project.',
  approved: 'The latest render the client approved, until a cover is set.',
  render: 'The latest render, until a cover is set.',
  studio: "The studio's default photo, until a render or a cover is added.",
  type: 'A default photo for this kind of project, until a render or a cover is added.',
  none: 'No render yet.',
};
