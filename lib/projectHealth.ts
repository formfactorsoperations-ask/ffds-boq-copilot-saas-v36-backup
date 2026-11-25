/*
  A project's health (DESIGN.md "Projects: journey, needs you, one list";
  Phase 3): the three rings on a List row.
    - Journey: the five steps, filled to where the project is.
    - Drawings issued: of the drawings on its tracker, how many have gone to
      the client (a round issued, in review or approved, or the GFC issued).
    - Snags closed: of its snags, how many are resolved or verified.

  The drawing tracker lives beside each project
  (organizations/{orgId}/projects/{id}/drawingTracker), which the Projects list
  does not load. So a Cloud Function (functions/src/projectHealth.ts) counts it
  on every change and keeps one small summary per project at
  organizations/{orgId}/projectHealth/{projectId}, which the screen reads with
  one listener. The counting is here, shared by the function and the screen.
  Snags are on the project already (context.snagList).
*/

export interface DrawingCounts { total: number; issued: number }
export interface SnagCounts { total: number; closed: number }

/** The summary the function keeps for a project. */
export interface ProjectHealthDoc {
  projectId: string;
  drawings: DrawingCounts;
  updatedAt: number;
}

const ISSUED_ROUND = new Set(['issued', 'in_review', 'approved', 'site_hold']);

/** A drawing that has gone to the client: a round issued (or since reviewed, approved or held on site), the GFC issued, or approved. */
export function isIssued(d: any): boolean {
  if (!d) return false;
  if (d.gfc?.status === 'issued' || d.approvedAt) return true;
  return Array.isArray(d.rounds) && d.rounds.some((r: any) => ISSUED_ROUND.has(String(r?.status || '')));
}

export function drawingCounts(items: any[] | null | undefined): DrawingCounts {
  const list = (items || []).filter(Boolean);
  return { total: list.length, issued: list.filter(isIssued).length };
}

const CLOSED_SNAG = new Set(['resolved', 'verified']);

/** The project's snags: how many, and how many are resolved or verified. */
export function snagCounts(ctx: any): SnagCounts {
  const list = Array.isArray(ctx?.snagList) ? ctx.snagList.filter(Boolean) : [];
  return { total: list.length, closed: list.filter((s: any) => CLOSED_SNAG.has(String(s?.status || ''))).length };
}

export interface Health {
  /** 0 to 1, or null when the project is closed (lost or terminated). */
  journey: number | null;
  /** Null until the function has counted the project's drawings. */
  drawings: DrawingCounts | null;
  snags: SnagCounts;
}

/** The three rings for a project at a step of the five (-1 when closed). */
export function healthOf(step: number, drawings: DrawingCounts | null | undefined, ctx: any): Health {
  return {
    journey: step >= 0 ? (step + 1) / 5 : null,
    drawings: drawings || null,
    snags: snagCounts(ctx),
  };
}

/** A ring's fill, 0 to 1: nothing to count is an empty ring. */
export const share = (n: number, of: number) => (of > 0 ? Math.max(0, Math.min(1, n / of)) : 0);
