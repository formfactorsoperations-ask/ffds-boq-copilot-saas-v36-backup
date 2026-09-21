/**
 * The sweep that puts lost client actions back onto the projects.
 *
 * Reads every project the signed-in studio can see, compares each against its
 * own portal projection, and reports what the projection holds that the project
 * does not. Applying is a separate call, because this rewrites live project
 * documents and a sweep that repaired as it scanned would leave nobody a chance
 * to look first.
 */

import { FullProjectData } from '../types';
import { db } from './dbService';
import { readPortalView } from './portalViewService';
import { findPortalDrift, ReconcileFinding } from '../lib/portalReconcile';

export interface ProjectReconcileResult {
  projectId: string;
  projectName: string;
  findings: ReconcileFinding[];
  /** Absent when there is nothing to restore, or when the project was skipped. */
  merged?: any;
  /** Set when the project was not examined, and why. */
  skipped?: string;
}

export interface ReconcileScan {
  examined: number;
  totalProjects: number;
  withoutProjection: number;
  results: ProjectReconcileResult[];
}

/**
 * Firestore rejects a write containing `undefined`, and a merged record can
 * carry one: the projection does not publish every field the project holds, so
 * a field restored from it comes back absent rather than empty. A round trip
 * through JSON drops exactly those and leaves nulls — which are storable —
 * alone.
 */
function storable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const nameOf = (p: any): string =>
  p?.context?.name || p?.name || p?.id || 'Untitled project';

export async function scanPortalDrift(
  onProgress?: (done: number, total: number) => void,
): Promise<ReconcileScan> {
  const projects: FullProjectData[] = await db.getProjects();
  const results: ProjectReconcileResult[] = [];
  let examined = 0;
  let withoutProjection = 0;

  for (let i = 0; i < projects.length; i++) {
    const p: any = projects[i];
    onProgress?.(i, projects.length);

    /*
      A project that failed to hydrate is a placeholder standing in for one that
      could not be read. Saving it would replace a real project with the shell,
      so it is never a candidate however much the projection has to offer.
    */
    if (p?._failedHydration || !p?.context || !p?.id) {
      results.push({
        projectId: p?.id || '(unknown)',
        projectName: nameOf(p),
        findings: [],
        skipped: 'could not be read — left untouched',
      });
      continue;
    }

    const view = await readPortalView(p.id);
    if (!view || !(view as any).context) {
      withoutProjection++;
      continue;
    }

    examined++;
    const drift = findPortalDrift(p.context, (view as any).context);
    if (!drift) continue;

    results.push({
      projectId: p.id,
      projectName: nameOf(p),
      findings: drift.findings,
      merged: drift.merged,
    });
  }

  onProgress?.(projects.length, projects.length);
  return { examined, totalProjects: projects.length, withoutProjection, results };
}

export interface ReconcileOutcome {
  restored: number;
  /** Drift the scan saw that had already resolved by the time Apply ran. */
  alreadyResolved: number;
  failed: { projectId: string; projectName: string; error: string }[];
}

/**
 * Write the merged contexts back.
 *
 * Through db.saveProject rather than a targeted update: a project over the size
 * threshold is stored as a deflated blob, so writing a nested field beside it
 * would leave a stray key next to a stale copy of everything else. saveProject
 * is also what fans the project out to both stored copies, which is the whole
 * reason these went missing.
 */
export async function applyPortalDrift(scan: ReconcileScan): Promise<ReconcileOutcome> {
  const projects: FullProjectData[] = await db.getProjects();
  const byId = new Map<string, any>(projects.map((p: any) => [p.id, p]));

  const outcome: ReconcileOutcome = { restored: 0, alreadyResolved: 0, failed: [] };

  for (const r of scan.results) {
    if (!r.merged || r.skipped) continue;
    const project = byId.get(r.projectId);
    if (!project) {
      outcome.failed.push({ projectId: r.projectId, projectName: r.projectName, error: 'no longer in the library' });
      continue;
    }

    try {
      /*
        Merged again here, against the project as it stands now, rather than
        storing the copy the scan produced.

        Minutes can pass between looking and deciding, and the studio is still
        working in the meantime. Writing the scan's copy would carry the project
        back to how it looked when the sweep ran and undo whatever was done
        since — a repair that destroys is worse than the fault it fixes.
      */
      const view = await readPortalView(r.projectId);
      const drift = view && (view as any).context
        ? findPortalDrift(project.context, (view as any).context)
        : null;

      if (!drift) {
        outcome.alreadyResolved++;
        continue;
      }

      await db.saveProject(storable({
        ...project,
        context: drift.merged,
        lastModified: Date.now(),
      }));
      outcome.restored++;
    } catch (e: any) {
      outcome.failed.push({
        projectId: r.projectId,
        projectName: r.projectName,
        error: e?.message || String(e),
      });
    }
  }

  return outcome;
}
