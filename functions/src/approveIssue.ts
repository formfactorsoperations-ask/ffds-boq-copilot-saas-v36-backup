import { HttpsError } from "firebase-functions/v2/https";
import { signIssue, hashSnapshot } from "../../services/documentIssueEngine";

/**
 * Approving a Scope Revision or a Detailed BOQ in the portal.
 *
 * "signIssue" writes whatever docket the browser sends, which suits a drawn
 * signature with its reading evidence but proves nothing about who approved or
 * when. Here the server makes the record: the name the client typed, the email
 * of the login it arrived with, the server's clock, the address and browser of
 * the request, and the fingerprint of the issue as stored -- so the approval is
 * tied to exactly what was published to them.
 */

export interface ApproverMeta {
    email?: string | null;
    ip?: string | null;
    userAgent?: string | null;
}

export function approveIssuePatch(
    issueId: string,
    rawName: unknown,
    contentHash: string | undefined,
    meta: ApproverMeta,
    now: () => Date = () => new Date(),
): (prev: any) => any {
    const name = String(rawName || "").replace(/[\r\n<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    if (name.length < 2) throw new HttpsError("invalid-argument", "Type your name to approve.");
    return (prev: any) => {
        const issue = (prev?.documents?.issues || []).find((i: any) => i.id === issueId);
        if (!issue) throw new HttpsError("not-found", "This document is no longer available.");
        if (issue.kind !== "scope_revision" && issue.kind !== "detailed_boq") {
            throw new HttpsError("failed-precondition", "This document is approved by signing it.");
        }
        if (issue.withdrawnAt) throw new HttpsError("failed-precondition", "The studio has withdrawn this document.");
        if (issue.clientSignature || issue.recordedApproval) {
            throw new HttpsError("already-exists", "This document is already approved.");
        }
        if (issue.clientVisibility?.state !== "published") {
            throw new HttpsError("failed-precondition", "This document has not been shared with you yet.");
        }
        if (contentHash && issue.contentHash && contentHash !== issue.contentHash) {
            throw new HttpsError("failed-precondition", "This document changed since you opened it. Refresh the page and review it again.");
        }
        const snap = issue.snapshot || {};
        const record: any = {
            signatoryName: name,
            signatoryEmail: meta.email || null,
            signatoryRole: "Client",
            signedAt: now().toISOString(),
            signatureType: "portal_approval",
            ipAddress: meta.ip || "unknown",
            userAgent: String(meta.userAgent || "").slice(0, 300),
            issueId: issue.id,
            contentHash: issue.contentHash || null,
            approvedTotals: {
                before: snap.v1?.total ?? null,
                after: snap.v2?.total ?? snap.total ?? null,
            },
            legalAffirmation: true,
            verified: true,
        };
        record.docketHash = hashSnapshot(record);
        return signIssue(issue.id, record)(prev);
    };
}
