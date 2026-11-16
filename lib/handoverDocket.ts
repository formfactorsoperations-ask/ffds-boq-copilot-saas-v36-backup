/*
  What the Handover Docket prints, worked out once for both copies of it.

  The studio's page (components/client/HandoverDocketPage.tsx) and the client's
  frozen copy (the `handover_docket` snapshot in services/documentReleaseEngine.ts,
  drawn by components/documents/HandoverDocketSheet.tsx) used to work these out
  separately, and disagreed: the page had a date picker of its own that was never
  saved, so the studio could download a PDF dated one day while the client's copy
  said another.

  The date is the project's handover date, set by "Mark handover" or by the
  client's sign-off. Until one is set, both copies say today.
*/

import { engagementOf } from './engagement';

/*
  On a design-only project the handover docket is the Design Closeout: the
  client signs off the final drawing set and the design engagement closes. The
  document says so, and so must everything in the portal that names it or says
  what it is for. Those places used to call it the "Handover & Acceptance
  Docket" and promise a snag walk-through and warranty cover.

  A released docket decides by its own frozen snapshot, so its name always
  matches what the client reads. One released before the engagement was frozen
  into the snapshot is a turnkey docket in content, and keeps the turnkey name.
  With nothing released yet, the project's engagement decides.
*/

/** The newest handover docket issued on the project: not withdrawn, not an addendum. */
function currentHandoverIssue(context: unknown): any | null {
  const issues = (((context as any)?.documents?.issues) || []) as any[];
  return issues
    .filter(i => i && i.kind === 'handover_docket' && !i.withdrawnAt && !i.addendumTo)
    .sort((a, b) => (b.version || 0) - (a.version || 0))[0] || null;
}

/**
 * Whether the client's handover document is the Design Closeout.
 * Pass `issue` when a specific issue is open; otherwise the newest one decides.
 */
export function isDesignCloseout(context: unknown, issue?: { snapshot?: unknown } | null): boolean {
  const snapshot = (issue || currentHandoverIssue(context))?.snapshot;
  return engagementOf((snapshot ?? context) as any) === 'design_only';
}

/** What the portal says about the Design Closeout where it would describe a handover. */
export const DESIGN_CLOSEOUT = {
  title: 'Design Closeout',
  /** The project timeline's label, in its sentence case. */
  timelineLabel: 'Design closeout',
  purpose: 'Records the final drawing set issued to you and closes the design engagement.',
  notReleased: 'Issued once the final drawing set has been handed over to you.',
  drafting: 'Your studio is preparing the final drawing set for your sign-off.',
  consequence: 'Closes the design engagement formally.',
  signed: 'Design Closeout signed. The design engagement is now closed.',
} as const;

/** The handover date as both copies print it: `3/10/2026`, or today until one is set. */
export function handoverDisplayDate(handoverDate: unknown, now: number = Date.now()): string {
  const at = handoverDate ? new Date(handoverDate as any) : new Date(now);
  return at.toLocaleDateString('en-IN');
}

/** How many drawings the Design Closeout says were issued in the final set. */
export function drawingsIssuedOf(ctx: object | null | undefined): number {
  return Object.values((ctx as any)?.drawingTracker || {}).length;
}
