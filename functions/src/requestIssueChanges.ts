import { HttpsError } from "firebase-functions/v2/https";
import { requestChangesPatch, ChangeRequestRefused } from "../../lib/scopeChangeRequest";
import type { ApproverMeta } from "./approveIssue";

/**
 * Sending a Scope Revision back for changes from the portal.
 *
 * Like an approval, the server makes the record: the name and note the client
 * typed, the login it arrived with, the server's clock, the address and browser
 * of the request, and the fingerprint of the issue as stored. The rules
 * (nothing in force changes, once per version, never on an approved one) are in
 * lib/scopeChangeRequest.ts, shared with the studio's preview.
 */

const asHttps = (e: unknown): never => {
    if (e instanceof ChangeRequestRefused) throw new HttpsError(e.code, e.message);
    throw e;
};

export function requestChangesPatchForServer(action: any, meta: ApproverMeta): (prev: any) => any {
    let patch: (prev: any) => any;
    try {
        patch = requestChangesPatch(
            String(action?.issueId || ""),
            { name: action?.name, message: action?.message, topics: action?.topics, contentHash: action?.contentHash },
            { email: meta.email, ip: meta.ip, userAgent: meta.userAgent, via: "portal" },
        );
    } catch (e) {
        return asHttps(e);
    }
    return (prev: any) => {
        try {
            return patch(prev);
        } catch (e) {
            return asHttps(e);
        }
    };
}
