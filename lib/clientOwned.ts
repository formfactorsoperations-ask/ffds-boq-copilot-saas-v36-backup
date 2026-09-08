/**
 * Reconciling what the studio holds with what a client has done.
 *
 * Both write the same project. The studio issues documents and edits the job;
 * the client signs, queries and confirms. Until now whichever wrote last won
 * outright, so a client's acknowledgement recorded at 23:16 was gone by 23:17,
 * replaced by a studio session that had loaded before it arrived.
 *
 * Neither side can simply take the other's copy. Replacing the studio's
 * `documents` with the client's drops a version the studio has just issued;
 * replacing the client's with the studio's drops the signature. So the two are
 * merged by who owns which part:
 *
 *   - the list of issues belongs to the studio — they decide what exists
 *   - a signature on an issue belongs to the client, and once made it stands
 *   - queries are append-only; neither side deletes them
 *   - a view stamp only ever moves forward
 */

export interface ClientOwned {
  documents?: any;
  materialSelections?: any[];
  designAgreementSignoff?: any;
  executionSignoff?: any;
  handoverSignoff?: any;
}

/** Keys a client can change, and therefore keys a studio save must not blindly overwrite. */
export const CLIENT_OWNED_KEYS = [
  'documents',
  'materialSelections',
  'designAgreementSignoff',
  'executionSignoff',
  'handoverSignoff',
] as const;

function mergeDocuments(mine: any, theirs: any): any {
  if (!theirs) return mine;
  if (!mine) return theirs;

  const theirIssues = new Map<string, any>((theirs.issues || []).map((i: any) => [i.id, i]));

  /*
    The studio's list decides what exists — a version they have just issued must
    survive — but a signature the client has already given is theirs and is
    carried across onto it.
  */
  const issues = (mine.issues || []).map((issue: any) => {
    const other = theirIssues.get(issue.id);
    if (!other) return issue;
    if (issue.clientSignature || !other.clientSignature) return issue;
    return { ...issue, clientSignature: other.clientSignature };
  });

  // An issue the studio's copy has never seen — it can only have come from
  // elsewhere, so it is kept rather than dropped.
  const mineIds = new Set(issues.map((i: any) => i.id));
  (theirs.issues || []).forEach((i: any) => { if (!mineIds.has(i.id)) issues.push(i); });

  const queries = [...(mine.queries || [])];
  const seen = new Set(queries.map((q: any) => q.id));
  (theirs.queries || []).forEach((q: any) => { if (!seen.has(q.id)) queries.push(q); });

  const lastViewedAt: Record<string, number> = { ...(theirs.lastViewedAt || {}) };
  Object.entries(mine.lastViewedAt || {}).forEach(([k, v]) => {
    lastViewedAt[k] = Math.max(Number(v) || 0, Number(lastViewedAt[k]) || 0);
  });

  return { ...mine, issues, queries, lastViewedAt };
}

function mergeSelections(mine: any[] | undefined, theirs: any[] | undefined): any[] | undefined {
  if (!theirs?.length) return mine;
  if (!mine?.length) return theirs;
  const byId = new Map<string, any>(theirs.map((m: any) => [m.id, m]));
  return mine.map((m: any) => {
    const other = byId.get(m.id);
    // A confirmation is the client's to give and is not taken back by a save
    // from a session that never saw it.
    if (other?.clientConfirmedAt && !m.clientConfirmedAt) {
      return { ...m, status: other.status, clientConfirmedAt: other.clientConfirmedAt };
    }
    return m;
  });
}

/** A signature already given survives a copy that does not have one. */
function mergeSignoff(mine: any, theirs: any): any {
  if (!theirs) return mine;
  if (!mine) return theirs;
  if (theirs.status && theirs.status !== 'pending' && (!mine.status || mine.status === 'pending')) return theirs;
  return mine;
}

/**
 * Fold anything a client has done in `theirs` into `mine`, without giving up
 * what `mine` knows. Returns the original object when nothing changed, so
 * callers can compare by identity and avoid a pointless write or re-render.
 */
export function mergeClientOwned<T extends Record<string, any>>(mine: T, theirs: any): T {
  if (!mine || !theirs) return mine;

  const next: Record<string, any> = {
    documents: mergeDocuments(mine.documents, theirs.documents),
    materialSelections: mergeSelections(mine.materialSelections, theirs.materialSelections),
    designAgreementSignoff: mergeSignoff(mine.designAgreementSignoff, theirs.designAgreementSignoff),
    executionSignoff: mergeSignoff(mine.executionSignoff, theirs.executionSignoff),
    handoverSignoff: mergeSignoff(mine.handoverSignoff, theirs.handoverSignoff),
  };

  const changed = CLIENT_OWNED_KEYS.filter(
    (k) => next[k] !== undefined && JSON.stringify(next[k]) !== JSON.stringify(mine[k]),
  );
  if (!changed.length) return mine;

  const merged = { ...mine } as Record<string, any>;
  changed.forEach((k) => { merged[k] = next[k]; });
  return merged as T;
}
