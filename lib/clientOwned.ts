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
  clientMessages?: any[];
}

/** Keys a client can change, and therefore keys a studio save must not blindly overwrite. */
export const CLIENT_OWNED_KEYS = [
  'documents',
  'materialSelections',
  'designAgreementSignoff',
  'executionSignoff',
  'handoverSignoff',
  /* Notes the client sent. Append-only and written only by them, so without
     this a message that arrived while the studio had the project open was
     erased by the next auto-save -- the same way a question on a finish was. */
  'clientMessages',
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
  const at = (v: any) => Date.parse(String(v || '')) || 0;
  const byId = new Map<string, any>(theirs.map((m: any) => [m.id, m]));

  return mine.map((m: any) => {
    const other = byId.get(m.id);
    if (!other) return m;
    let next = m;

    // A confirmation is the client's to give and is not taken back by a save
    // from a session that never saw it.
    if (other.clientConfirmedAt && !m.clientConfirmedAt) {
      next = { ...next, status: other.status, clientConfirmedAt: other.clientConfirmedAt };
    }

    /*
      A question the client raised is theirs too, and was being thrown away.

      This carried the confirmation and nothing else, so when a client asked
      about a finish while the studio had the project open, the sequence was:
      the callable wrote the question onto the project, the snapshot arrived
      here, this merge ignored it because it was not a confirmation, and the
      next auto-save wrote the studio's in-memory context back over it. The
      question survived only in the portal projection -- which the auto-save
      does not touch -- so the client could see their question on their own
      screen while it no longer existed on the project. One asked before the
      session loaded survived; one asked during it did not.

      Taken only when theirs is NEWER than what this session holds, so a studio
      reply already given is not undone by an older copy of the question.
    */
    if (other.changeReason && at(other.changeRequestedAt) > at(next.changeRequestedAt)) {
      next = {
        ...next,
        status: 'change_requested',
        changeReason: other.changeReason,
        changeRequestedAt: other.changeRequestedAt,
        changeRequestedBy: other.changeRequestedBy,
        /* A new question supersedes the answer to the last one. */
        studioReply: null,
        studioReplyAt: null,
      };
    }

    return next;
  });
}

/**
 * Messages are append-only and only the client writes them, so the union wins.
 * A read stamp is the studio's, and moves forward only.
 */
function mergeMessages(mine: any[] | undefined, theirs: any[] | undefined): any[] | undefined {
  if (!theirs?.length) return mine;
  if (!mine?.length) return theirs;
  const byId = new Map<string, any>(mine.map((m: any) => [m.id, m]));
  theirs.forEach((t: any) => {
    const existing = byId.get(t.id);
    if (!existing) byId.set(t.id, t);
    else if (!existing.readAt && t.readAt) byId.set(t.id, { ...existing, readAt: t.readAt, readBy: t.readBy });
  });
  return [...byId.values()].sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)));
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
    clientMessages: mergeMessages(mine.clientMessages, theirs.clientMessages),
  };

  const changed = CLIENT_OWNED_KEYS.filter(
    (k) => next[k] !== undefined && JSON.stringify(next[k]) !== JSON.stringify(mine[k]),
  );
  if (!changed.length) return mine;

  const merged = { ...mine } as Record<string, any>;
  changed.forEach((k) => { merged[k] = next[k]; });
  return merged as T;
}
