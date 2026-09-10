/*
  Does this client actually have the access the app assumes?

  Written the day thirteen project subcollections turned out to have no
  security rule at all. Firestore rules do not cascade, so
  `match /projects/{projectId}` granting read did nothing for the collections
  beneath it — and because the app's listeners passed no error callback, the
  denial surfaced as a screen that said "Loading..." for ever. Nothing in the
  product said which collection was refused, or that anything was refused.

  This asks each path directly and reports the answer. It runs in the browser
  on purpose: the question is not "can the server read this" but "can the
  signed-in user", which is exactly what a Cloud Function cannot tell you.
*/

export type ProbeStatus = 'ok' | 'denied' | 'error' | 'skipped';

export interface ProbeResult {
  path: string;
  label: string;
  status: ProbeStatus;
  detail?: string;
  docs?: number;
  ms: number;
}

/**
 * The collections the app reads, and what breaks when one is refused.
 * Paths take `{projectId}` where a live project id is substituted in.
 */
export const PROBE_PATHS: { path: string; label: string }[] = [
  { path: 'organizations', label: 'Organizations' },
  { path: 'users', label: 'Users' },
  { path: 'projects', label: 'Projects' },
  { path: 'projects/{projectId}/communicationLog', label: 'Client comms tracker' },
  { path: 'projects/{projectId}/deliverables', label: 'Deliverables' },
  { path: 'projects/{projectId}/designGate', label: 'Design gate' },
  { path: 'projects/{projectId}/journeySteps', label: 'Project journey' },
  { path: 'projects/{projectId}/liveFeed', label: 'Live feed' },
  { path: 'projects/{projectId}/marginAnalytics', label: 'Margin analytics' },
  { path: 'projects/{projectId}/moms', label: 'Minutes of meeting' },
  { path: 'projects/{projectId}/paymentRequests', label: 'Payment requests' },
  { path: 'projects/{projectId}/scopeAdditions', label: 'Scope additions' },
  { path: 'projects/{projectId}/siteVisits', label: 'Site visits' },
  { path: 'projects/{projectId}/stepProgress', label: 'Step progress' },
  { path: 'projects/{projectId}/tasks', label: 'Tasks' },
  { path: 'projects/{projectId}/timelinePhases', label: 'Timeline phases' },
  { path: 'projects/{projectId}/tierBoq', label: 'Tier BOQ' },
  { path: 'projects/{projectId}/portalView', label: 'Client portal view' },
  { path: 'projects/{projectId}/decisions', label: 'Decisions' },
];

/** Firestore functions this needs, passed in so the module stays testable. */
export interface ProbeDeps {
  db: any;
  collection: (db: any, path: string) => any;
  getDocs: (ref: any) => Promise<{ size: number }>;
  /** Read no more than this many documents per path. */
  limitTo?: (ref: any, n: number) => any;
}

/**
 * Read one page from every path and report what came back.
 *
 * A denial is the interesting answer, so it is reported rather than thrown —
 * one refused collection must not stop the sweep, or the report would only
 * ever show the first problem.
 */
export const runPermissionProbe = async (
  deps: ProbeDeps,
  projectId: string | null,
  /*
    Called as each path answers, so the console can show the sweep happening
    rather than freezing for a few seconds and then printing a finished table.
    On a healthy platform this is cosmetic; on a broken one it tells you which
    collection it is stuck on.
  */
  onResult?: (result: ProbeResult, index: number, total: number) => void,
): Promise<ProbeResult[]> => {
  const out: ProbeResult[] = [];
  const total = PROBE_PATHS.length;
  const emit = (r: ProbeResult) => { out.push(r); onResult?.(r, out.length, total); };

  for (const entry of PROBE_PATHS) {
    const needsProject = entry.path.includes('{projectId}');
    if (needsProject && !projectId) {
      emit({
        path: entry.path,
        label: entry.label,
        status: 'skipped',
        detail: 'No project available to probe against',
        ms: 0,
      });
      continue;
    }

    const path = entry.path.replace('{projectId}', projectId || '');
    const started = Date.now();
    try {
      let ref = deps.collection(deps.db, path);
      if (deps.limitTo) ref = deps.limitTo(ref, 1);
      const snap = await deps.getDocs(ref);
      emit({
        path,
        label: entry.label,
        status: 'ok',
        docs: snap.size,
        ms: Date.now() - started,
      });
    } catch (e: any) {
      const code = e?.code || '';
      emit({
        path,
        label: entry.label,
        status: code === 'permission-denied' ? 'denied' : 'error',
        detail: code || String(e?.message || e).slice(0, 140),
        ms: Date.now() - started,
      });
    }
  }

  return out;
};

export const summariseProbe = (results: ProbeResult[]) => ({
  total: results.length,
  ok: results.filter((r) => r.status === 'ok').length,
  denied: results.filter((r) => r.status === 'denied').length,
  errored: results.filter((r) => r.status === 'error').length,
  skipped: results.filter((r) => r.status === 'skipped').length,
  healthy: results.every((r) => r.status === 'ok' || r.status === 'skipped'),
});
