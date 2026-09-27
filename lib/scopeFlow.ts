import { DocumentIssue, FullProjectData, ProjectContext } from '../types';

/**
 * The signed-scope flow, per project, and the things around it that are not
 * the engine itself: which Detailed BOQ is in force, and the rehearsal copy.
 */

export const isScopeFlowOn = (ctx: ProjectContext | null | undefined): boolean => !!ctx?.scopeFlow?.enabled;

const approved = (i: DocumentIssue) => !!(i.clientSignature || i.recordedApproval || i.signedVia);

/** Every Detailed BOQ issue, newest first, withdrawn ones left out. */
export function detailedBoqIssues(ctx: ProjectContext): DocumentIssue[] {
  return (ctx.documents?.issues || [])
    .filter(i => i.kind === 'detailed_boq' && !i.withdrawnAt)
    .sort((a, b) => b.version - a.version);
}

/** The Detailed BOQ the client has approved most recently: the scope in force. */
export function scopeInForce(ctx: ProjectContext): DocumentIssue | null {
  return detailedBoqIssues(ctx).find(approved) || null;
}

/** The Detailed BOQ for one tier, approved or not. */
export function detailedBoqForTier(ctx: ProjectContext, tierId: string | undefined | null): DocumentIssue | null {
  if (!tierId) return null;
  return detailedBoqIssues(ctx).find(i => i.snapshot?.tierId === tierId) || null;
}

export const isApprovedIssue = approved;

/**
 * A copy of a live project to rehearse on.
 *
 * Unlike "clone as template", which keeps only the shape of a job, this keeps
 * the commercial history — tiers, approvals, documents, payments — because the
 * rehearsal is of exactly those things. What it drops is everything that could
 * reach the real client: their email and phone, the portal credential, and the
 * published state of every document, so nothing in the copy is visible in any
 * portal. It is marked as a dummy project and says what it is a copy of.
 */
export function buildRehearsalCopy(project: FullProjectData, newId: string, at = Date.now(), label = 'Rehearsal'): FullProjectData {
  const copy: FullProjectData = JSON.parse(JSON.stringify(project));
  const ctx: any = copy.context;
  const sourceName = ctx.name || 'Project';

  copy.id = newId;
  copy.lastModified = at;
  delete (copy as any).tenantId;

  ctx.name = `${sourceName} · ${label}`;
  ctx.isDummy = true;
  ctx.projectCategory = 'dummy';
  ctx.rehearsalOf = { projectId: project.id, projectName: sourceName, copiedAt: at };
  delete ctx.clientEmail;
  delete ctx.clientPhone;
  delete ctx.portalAccess;
  delete ctx.clientUserIds;
  delete ctx.clientUid;

  // Nothing in a rehearsal is published to anybody.
  const unpublish = (list: any[] | undefined) =>
    (list || []).map((item: any) =>
      item && typeof item === 'object' && item.clientVisibility
        ? { ...item, clientVisibility: { state: 'draft' } }
        : item
    );
  if (ctx.documents?.issues) ctx.documents.issues = unpublish(ctx.documents.issues);
  ['siteUpdates', 'projectUpdates', 'siteVisits', 'momHistory', 'materialSelections', 'designDocuments'].forEach(k => {
    if (Array.isArray(ctx[k])) ctx[k] = unpublish(ctx[k]);
  });

  return copy;
}

/**
 * The version the client has signed, or is being asked to sign, when signed
 * scope is on. It is read-only everywhere: the BOQ Editor shows it but cannot
 * change it, and Versions offers no sync or approval on it. The only way it
 * changes is a Scope Revision the client signs.
 */
export function lockedTierId(ctx: ProjectContext | null | undefined): string | null {
  if (!ctx || !isScopeFlowOn(ctx)) return null;
  return scopeInForce(ctx)?.snapshot?.tierId || detailedBoqForTier(ctx, ctx.approvedTierId)?.snapshot?.tierId || null;
}

/**
 * A tier update with the locked version's lines put back. Every BOQ Editor
 * path goes through `setTiers`, so guarding it there covers the grid, the
 * interactive editor, bulk commands and imports alike.
 */
export function keepLockedTier<T extends { id: string; boq: any[] }>(prev: T[], next: T[], locked: string | null): T[] {
  if (!locked) return next;
  const original = prev.find(t => t.id === locked);
  if (!original) return next;
  const kept = next.map(t => (t.id === locked && t.boq !== original.boq ? { ...t, boq: original.boq } : t));
  return kept.some(t => t.id === locked) ? kept : [...kept, original];
}

/**
 * A Detailed BOQ's own version — the one printed on it and in its reference.
 * The issue record's counter usually agrees, but it counts every detailed_boq
 * issue ever made, so it can run ahead of the document; the document wins.
 */
export const detailedBoqVersion = (issue: DocumentIssue | null | undefined): number =>
  Number(issue?.snapshot?.version) || issue?.version || 0;
