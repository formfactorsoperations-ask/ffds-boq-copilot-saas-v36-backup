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

/** The handover date as both copies print it: `3/10/2026`, or today until one is set. */
export function handoverDisplayDate(handoverDate: unknown, now: number = Date.now()): string {
  const at = handoverDate ? new Date(handoverDate as any) : new Date(now);
  return at.toLocaleDateString('en-IN');
}

/** How many drawings the Design Closeout says were issued in the final set. */
export function drawingsIssuedOf(ctx: object | null | undefined): number {
  return Object.values((ctx as any)?.drawingTracker || {}).length;
}
