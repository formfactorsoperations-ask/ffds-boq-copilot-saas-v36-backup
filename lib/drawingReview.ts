/**
 * DESIGN REVIEW: THE WORKFLOW A DRAWING GOES THROUGH INSIDE THE STUDIO.
 *
 * A designer drops a PDF on a drawing that already exists in the tracker,
 * sends it to the Design Head, and gets it back approved or with numbered
 * notes pinned to the sheet. Nothing here reaches a client: client meetings
 * and sign-off are the next phase, and they start from APPROVED.
 *
 * Shared by the browser (what to show, which button to offer) and by the
 * drawingReview Cloud Function, which is the only writer. The browser asks;
 * the function decides with these same rules and the caller's own profile.
 *
 * Where it lives:
 *   organizations/{org}/projects/{p}/drawingTracker/{d}.review   the summary below
 *     .../reviewVersions/{versionId}   one per uploaded PDF, never changed
 *     .../reviewRounds/{roundId}       one per time a version is sent for review
 *     .../reviewMarks/{markId}         the Design Head's notes, pinned to a version
 *     .../reviewEvents/{eventId}       what happened, for the tracker's history
 *   Storage: drawingReview/{org}/{p}/{d}/uploads/{uid}/...   the designer's upload
 *            drawingReview/{org}/{p}/{d}/versions/...        finalised by the function
 */

import { hasRole, type RoleSet } from './roles';

export type ReviewState = 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED';

/** Who a drawing is for: the client sees room designs; carpentry details and services stay in the studio. */
export type ReviewAudience = 'client' | 'studio';

export interface ReviewPerson {
  uid: string;
  email: string;
  name: string;
}

/** Kept on the drawing itself, so lists and the tracker read one document. */
export interface ReviewSummary {
  schema: 1;
  orgId: string;
  projectId: string;
  drawingId: string;
  /** The project's name when the sheet last moved, so lists can show it without loading the project. */
  projectName?: string | null;
  state: ReviewState;
  /** Goes up by one with every state change, so a stale screen cannot approve what it did not see. */
  rev: number;
  audience: ReviewAudience;
  versionId: string | null;
  versionNo: number;
  pdfPath: string | null;
  thumbPath: string | null;
  pageCount: number | null;
  openRoundId: string | null;
  attempts: number;
  designer: ReviewPerson | null;
  submittedAt: number | null;
  decidedBy: ReviewPerson | null;
  decidedAt: number | null;
  reason: string | null;
  selfApproved: boolean;
  /** Notes on the current version: all, and those not yet marked fixed. */
  marksTotal: number;
  marksOpen: number;
  marksSeq: number;
  /**
   * The client asked for changes at a design meeting. They wait on the
   * approved sheet for the Design Head, who edits them and sends the sheet
   * back to the designer, or keeps it approved.
   */
  clientChanges?: ClientChanges | null;
  updatedAt: number;
}

export interface ClientChanges {
  meetingId: string;
  at: number;
  count: number;
  pending: boolean;
  by: ReviewPerson;
}

export interface ReviewVersion {
  id: string;
  n: number;
  pdfPath: string;
  thumbPath: string | null;
  fileName: string;
  size: number;
  sha256: string;
  pageCount: number | null;
  note: string;
  by: ReviewPerson;
  at: number;
  /** The staging path it came from; a retried finalise finds its version by this. */
  source: string;
}

export type RoundStatus = 'OPEN' | 'APPROVED' | 'CHANGES_REQUESTED' | 'WITHDRAWN';

export interface ReviewRound {
  id: string;
  attempt: number;
  versionId: string;
  versionNo: number;
  submittedBy: ReviewPerson;
  submittedAt: number;
  status: RoundStatus;
  decidedBy?: ReviewPerson | null;
  decidedAt?: number | null;
  reason?: string | null;
  selfApproved?: boolean;
}

export type MarkShape =
  | { t: 'pin'; x: number; y: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number }
  | { t: 'arrow'; x: number; y: number; x2: number; y2: number }
  | { t: 'pen'; pts: [number, number][] };

/**
 * A note pinned to a sheet. Coordinates are fractions of the page (0 to 1,
 * top-left origin, the page as it is displayed), so a mark stays on the same
 * spot at any zoom and on any screen.
 */
export interface ReviewMark {
  id: string;
  versionId: string;
  n: number;
  page: number;
  shape: MarkShape;
  text: string;
  blocking: boolean;
  status: 'OPEN' | 'FIXED';
  by: ReviewPerson;
  at: number;
  updatedAt: number;
  fixedBy?: ReviewPerson | null;
  fixedAt?: number | null;
  /** Set when the next version arrives: the version that carries the fix. */
  fixedInVersionNo?: number;
  /** A change the client asked for at a design meeting, rather than the Design Head's own note. */
  source?: 'client';
  meetingId?: string;
}

export interface ReviewEvent {
  type: 'uploaded' | 'submitted' | 'withdrawn' | 'returned' | 'approved' | 'audience' | 'removed' | 'client' | 'clientKept';
  at: number;
  by: ReviewPerson;
  versionNo?: number;
  roundId?: string;
  text?: string;
}

/* ------------------------------------------------------------------ roles */

/**
 * Who decides. The Design Head first; the studio's Owner and Admin as well,
 * so a review never waits on one person's holiday. The Design Head may approve
 * her own sheets (she is the principal architect); the record says so.
 */
export const REVIEWER_ROLES = new Set(['Design Head', 'Owner', 'Admin', 'Super Admin']);

/** Who may upload a PDF and send it for review. */
export const UPLOADER_ROLES = new Set(['Designer', 'Design Head', 'Owner', 'Admin', 'Ops Director', 'Super Admin']);

/** Who may say whether a drawing is for the client or stays in the studio. */
export const AUDIENCE_ROLES = new Set(['Design Head', 'Owner', 'Admin', 'Ops Director', 'Super Admin']);

/* Each takes one role or all of a person's roles (lib/roles): any one of them is enough. */
export const canReview = (role?: RoleSet) => hasRole(role, REVIEWER_ROLES);
export const canUpload = (role?: RoleSet) => hasRole(role, UPLOADER_ROLES);
export const canSetAudience = (role?: RoleSet) => hasRole(role, AUDIENCE_ROLES);
/** Who presents to the client and records what they agreed: the Design Head, or the studio's Owner and Admins. */
export const canRunMeeting = canReview;

/* ------------------------------------------------------------ transitions */

export type ReviewAction = 'finalize' | 'submit' | 'withdraw' | 'approve' | 'return' | 'mark' | 'fix' | 'remove' | 'clientReturn' | 'clientKeep';

/**
 * Which states each action may start from.
 *
 * A new PDF can land on an approved drawing: that is a revision, and it goes
 * back to DRAFT for a fresh review. It cannot land while the Design Head is
 * looking at the last one; the designer pulls that back first (withdraw), so
 * nobody approves a file that changed under them.
 */
const FROM: Record<Exclude<ReviewAction, 'mark' | 'fix'>, (ReviewState | 'NONE')[]> = {
  finalize: ['NONE', 'DRAFT', 'CHANGES_REQUESTED', 'APPROVED'],
  /* Taking back a wrong PDF: only while nobody has reviewed it (see the function for the rest). */
  remove: ['DRAFT'],
  submit: ['DRAFT'],
  withdraw: ['IN_REVIEW'],
  approve: ['IN_REVIEW'],
  return: ['IN_REVIEW'],
  /* The client's changes from a design meeting, waiting on an approved sheet. */
  clientReturn: ['APPROVED'],
  clientKeep: ['APPROVED'],
};

/** The client's changes from a meeting are waiting for the Design Head on this sheet. */
export const clientPending = (summary?: Partial<ReviewSummary> | null) => stateOf(summary) === 'APPROVED' && !!summary?.clientChanges?.pending;

export const stateOf = (summary?: Partial<ReviewSummary> | null): ReviewState | 'NONE' =>
  (summary?.state as ReviewState) || 'NONE';

export function allowed(action: Exclude<ReviewAction, 'mark' | 'fix'>, summary?: Partial<ReviewSummary> | null): boolean {
  if (action === 'clientReturn' || action === 'clientKeep') return clientPending(summary);
  /* A new PDF waits until the Design Head has dealt with the client's changes. */
  if (action === 'finalize' && clientPending(summary)) return false;
  return FROM[action].includes(stateOf(summary));
}

/** Plain words for why an action is not possible right now. */
export function refusal(action: Exclude<ReviewAction, 'mark' | 'fix'>, summary?: Partial<ReviewSummary> | null): string {
  const s = stateOf(summary);
  if (action === 'finalize' && s === 'IN_REVIEW') return 'This sheet is with the Design Head. Pull it back first, then upload the new PDF.';
  if (action === 'finalize' && clientPending(summary)) return 'The client asked for changes at the design meeting. The Design Head sends them to you first.';
  if (action === 'clientReturn' || action === 'clientKeep') return 'There are no client changes waiting on this sheet. Refresh to see where it is.';
  if (action === 'submit' && s === 'NONE') return 'Upload a PDF first.';
  if (action === 'submit' && s !== 'DRAFT') return `This sheet is ${STATE_LABEL[s as ReviewState]?.toLowerCase() || 'not ready'}. Upload a new PDF to send it again.`;
  if (['approve', 'return', 'withdraw'].includes(action)) return 'This sheet is no longer waiting for review. Refresh to see where it is.';
  return 'That is not possible right now.';
}

export const STATE_LABEL: Record<ReviewState, string> = {
  DRAFT: 'Ready to send',
  IN_REVIEW: 'With the Design Head',
  CHANGES_REQUESTED: 'Returned with notes',
  APPROVED: 'Approved',
};

/** The board's lanes, from the designer's side. */
export type DeskLane = 'desk' | 'review' | 'approved';

export function laneOf(summary?: Partial<ReviewSummary> | null): DeskLane {
  const s = stateOf(summary);
  if (s === 'IN_REVIEW') return 'review';
  if (s === 'APPROVED') return 'approved';
  return 'desk';
}

/* ------------------------------------------------------------- validation */

const clamp01 = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= -0.05 && n <= 1.05;

/*
  Firestore cannot hold a list inside a list, so a freehand sketch is stored
  with its points flattened (`xy: [x0, y0, x1, y1, ...]`) and turned back into
  pairs when read. Every other shape is stored as it is.
*/
export type StoredShape = Exclude<MarkShape, { t: 'pen' }> | { t: 'pen'; xy: number[] };

export function storeShape(s: MarkShape): StoredShape {
  return s.t === 'pen' ? { t: 'pen', xy: s.pts.flatMap(([x, y]) => [x, y]) } : s;
}

export function readShape(raw: any): MarkShape {
  if (raw && raw.t === 'pen' && Array.isArray(raw.xy) && !Array.isArray(raw.pts)) {
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < raw.xy.length; i += 2) pts.push([Number(raw.xy[i]), Number(raw.xy[i + 1])]);
    return { t: 'pen', pts };
  }
  return raw as MarkShape;
}

/** A mark's shape, checked and rounded; null when it is not a shape we draw. */
export function cleanShape(input: any): MarkShape | null {
  const raw = readShape(input);
  if (!raw || typeof raw !== 'object') return null;
  const r = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
  switch (raw.t) {
    case 'pin':
      return clamp01(raw.x) && clamp01(raw.y) ? { t: 'pin', x: r(raw.x), y: r(raw.y) } : null;
    case 'rect':
      return [raw.x, raw.y, raw.w, raw.h].every(clamp01) && raw.w > 0.002 && raw.h > 0.002
        ? { t: 'rect', x: r(raw.x), y: r(raw.y), w: r(raw.w), h: r(raw.h) } : null;
    case 'arrow':
      return [raw.x, raw.y, raw.x2, raw.y2].every(clamp01)
        ? { t: 'arrow', x: r(raw.x), y: r(raw.y), x2: r(raw.x2), y2: r(raw.y2) } : null;
    case 'pen': {
      if (!Array.isArray(raw.pts) || raw.pts.length < 2 || raw.pts.length > 600) return null;
      const pts = raw.pts.filter((p: any) => Array.isArray(p) && clamp01(p[0]) && clamp01(p[1])).map((p: any) => [r(p[0]), r(p[1])] as [number, number]);
      return pts.length >= 2 ? { t: 'pen', pts } : null;
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------ rotation */

/**
 * The sheet can be turned on screen 90° at a time. Marks are always stored
 * against the unturned page, so they land in the same place for everybody,
 * however each person has the sheet turned. These move a point (as fractions
 * of the page) between the stored page and the turned view.
 */
export type Turn = 0 | 90 | 180 | 270;

export function toView([x, y]: [number, number], turn: Turn): [number, number] {
  if (turn === 90) return [1 - y, x];
  if (turn === 180) return [1 - x, 1 - y];
  if (turn === 270) return [y, 1 - x];
  return [x, y];
}

export function toPage([x, y]: [number, number], turn: Turn): [number, number] {
  if (turn === 90) return [y, 1 - x];
  if (turn === 180) return [1 - x, 1 - y];
  if (turn === 270) return [1 - y, x];
  return [x, y];
}

/** A whole mark, turned with the sheet (`toView`) or back to the stored page (`toPage`). */
export function turnShape(s: MarkShape, turn: Turn, dir: 'view' | 'page'): MarkShape {
  if (!turn) return s;
  const f = dir === 'view' ? toView : toPage;
  switch (s.t) {
    case 'pin': { const [x, y] = f([s.x, s.y], turn); return { t: 'pin', x, y }; }
    case 'arrow': { const [x, y] = f([s.x, s.y], turn); const [x2, y2] = f([s.x2, s.y2], turn); return { t: 'arrow', x, y, x2, y2 }; }
    case 'pen': return { t: 'pen', pts: s.pts.map((p) => f(p, turn)) };
    case 'rect': {
      const [ax, ay] = f([s.x, s.y], turn);
      const [bx, by] = f([s.x + s.w, s.y + s.h], turn);
      return { t: 'rect', x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
    }
  }
}

export const cleanText = (raw: unknown, max = 1000) =>
  String(raw ?? '').replace(/\r\n/g, '\n').replace(/[<>]/g, '').trim().slice(0, max);

/** Where the browser may upload for this drawing, and the only place the function will take a file from. */
export const uploadPrefix = (orgId: string, projectId: string, drawingId: string, uid: string) =>
  `drawingReview/${orgId}/${projectId}/${drawingId}/uploads/${uid}/`;

export const versionsPrefix = (orgId: string, projectId: string, drawingId: string) =>
  `drawingReview/${orgId}/${projectId}/${drawingId}/versions/`;

/** Ids are path segments; anything that could climb out of its folder is refused. */
export const safeId = (s: unknown) => typeof s === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(s) && !s.includes('..');

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_THUMB_BYTES = 2 * 1024 * 1024;

/* ---------------------------------------------------------- file matching */

export interface MatchableDrawing {
  id: string;
  name: string;
  roomName?: string | null;
}

export type FileMatch =
  | { kind: 'exact'; id: string; why: string }
  | { kind: 'choose'; options: string[]; why: string }
  | { kind: 'refused'; why: string };

const words = (s: string) =>
  s.toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !/^(rev|r\d+|v\d+|final|new|drawing|dwg|pdf|copy)$/.test(w));

/**
 * Which drawing a dropped file is.
 *
 * Suggestions only, inside one project: an upload never creates a drawing and
 * never lands on one the designer has not confirmed when the name is unclear.
 * A DWG is refused on its own: the review is of a PDF everybody can open.
 */
export function matchFile(fileName: string, drawings: MatchableDrawing[]): FileMatch {
  const lower = fileName.toLowerCase();
  if (/\.dwg$|\.dxf$/.test(lower)) return { kind: 'refused', why: 'A CAD file on its own cannot be reviewed. Export the PDF and drop that.' };
  if (!/\.pdf$/.test(lower)) return { kind: 'refused', why: 'Only PDFs can be reviewed.' };
  if (!drawings.length) return { kind: 'refused', why: 'This project has no drawings in its tracker yet. Add them there first.' };

  const fw = new Set(words(fileName));
  const scored = drawings
    .map((d) => {
      const nw = words(d.name);
      const rw = words(d.roomName || '');
      const hitName = nw.filter((w) => fw.has(w)).length;
      const hitRoom = rw.filter((w) => fw.has(w)).length;
      const full = nw.length > 0 && hitName === nw.length;
      return { d, score: hitName * 2 + hitRoom + (full ? 3 : 0), full };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { kind: 'choose', options: drawings.map((d) => d.id), why: 'No drawing matches this name. Pick the one it is.' };
  const [top, next] = scored;
  if (top.full && (!next || next.score < top.score)) return { kind: 'exact', id: top.d.id, why: 'Matched on the drawing name' };
  return { kind: 'choose', options: scored.slice(0, 4).map((x) => x.d.id), why: 'More than one drawing fits this name. Pick the right one.' };
}

/* ------------------------------------------------------------- audience */

/**
 * A first guess at who a drawing is for, from its name. Carpentry and
 * services sheets are the studio's; room elevations and layouts are shown to
 * the client. The Design Head can change it on any drawing.
 */
export function guessAudience(name: string): ReviewAudience {
  return /carpentry|detail|section|electrical|plumbing|services|hvac|working|joinery|cutting|gfc/i.test(name) ? 'studio' : 'client';
}
