import { HttpsError } from "firebase-functions/v2/https";

/*
  THE TRAIL OF A SCOPE DOCUMENT SENT TO A CLIENT: each time the client
  downloaded its Excel from their portal, recorded on the issue next to its
  approval, where the Scope workspace reads it. Arrives as a client action from
  the client's own signed-in portal.
*/

const SCOPE_KINDS = new Set(["scope_revision", "detailed_boq"]);

const onIssue = (prev: any, issueId: string, fn: (issue: any) => any) => {
  const issues = prev?.documents?.issues || [];
  if (!issues.some((i: any) => i.id === issueId)) return prev;
  return {
    ...prev,
    documents: { ...prev.documents, issues: issues.map((i: any) => (i.id === issueId ? fn(i) : i)) },
  };
};

/** The client downloaded the Excel from their portal. */
export function downloadPatch(issueId: string, format: unknown, at: number = Date.now()): (prev: any) => any {
  const f = format === "excel" ? "excel" : format === "record" ? "record" : null;
  if (!f) throw new HttpsError("invalid-argument", "Unknown download.");
  return (prev: any) => {
    const issue = (prev?.documents?.issues || []).find((i: any) => i.id === issueId);
    if (!issue) throw new HttpsError("not-found", "This document is no longer available.");
    if (!SCOPE_KINDS.has(issue.kind) || issue.clientVisibility?.state !== "published") {
      throw new HttpsError("failed-precondition", "This document is not one the client can download.");
    }
    return onIssue(prev, issueId, (i) => ({
      ...i,
      // The last 30 are plenty to answer "did they open it, and how often".
      clientDownloads: [...(i.clientDownloads || []), { at, format: f }].slice(-30),
    }));
  };
}
