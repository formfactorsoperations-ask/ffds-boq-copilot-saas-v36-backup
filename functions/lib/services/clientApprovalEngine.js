"use strict";
/**
 * CLIENT APPROVAL ENGINE — canonical, two-way source of truth for every
 * client-facing sign-off in the project lifecycle.
 *
 * WHY THIS EXISTS
 * ---------------
 * Sign-off state had drifted across five competing field families that were
 * written by different surfaces and read by others:
 *
 *   Terms     : engagement.status | termsDockets[].status | designAgreementSignoff
 *               | termsSignoff | proposalSignoff | lifecycle.gates.proposalAccepted
 *   Contract  : executionSignoff (written by ExecutionAgreementPage)
 *               | contractSignoff | executionAgreementSignoff (read by the portal)
 *               | lifecycle.gates.contractSigned
 *   Handover  : handoverSignoff | handoverDocketSignoff
 *               | lifecycle.gates.handoverComplete | handoverDate
 *
 * The studio wrote one key, the client portal read another, so a document
 * signed on one side stayed "pending" on the other. Everything in this module
 * READS every alias and WRITES every alias, so studio and portal converge no
 * matter which surface performs the action.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDisputePatch = exports.buildSignoffPatch = exports.isSigned = exports.resolveApprovals = void 0;
// ---------------------------------------------------------------------------
// READ SIDE — resolve one truth from every legacy alias
// ---------------------------------------------------------------------------
const asRecord = (v) => v && typeof v === 'object' && typeof v.status === 'string' ? v : null;
/** Picks the most advanced record among aliases: signed > sent > pending. */
function bestRecord(...candidates) {
    const rank = { pending: 1, disputed: 1, sent: 2, signed: 3 };
    let best = null;
    for (const c of candidates) {
        const rec = asRecord(c);
        if (!rec)
            continue;
        if (!best || (rank[rec.status] || 0) > (rank[best.status] || 0))
            best = rec;
    }
    return best;
}
/** Offline-record provenance carried on the winning signoff record. */
function offlineMeta(record) {
    var _a;
    const meta = (_a = record === null || record === void 0 ? void 0 : record.docket) === null || _a === void 0 ? void 0 : _a.manualOverride;
    if (!(meta === null || meta === void 0 ? void 0 : meta.isOverride)) {
        return {
            recordedOffline: false,
            recordedBy: null,
            recordedAt: null,
            approvalMedium: null,
            evidenceUrl: null
        };
    }
    return {
        recordedOffline: true,
        recordedBy: meta.recordedBy || null,
        recordedAt: meta.recordedAt || null,
        approvalMedium: meta.approvalMedium || null,
        evidenceUrl: meta.attachmentUrl || null
    };
}
/** Client-raised dispute state, read off the same record. */
function disputeMeta(record) {
    const disputed = (record === null || record === void 0 ? void 0 : record.status) === 'disputed';
    return {
        disputed,
        disputeReason: disputed ? ((record === null || record === void 0 ? void 0 : record.disputeReason) || null) : null,
        disputedAt: disputed ? ((record === null || record === void 0 ? void 0 : record.disputedAt) || null) : null
    };
}
/**
 * Evidence from the document-issue record.
 *
 * Releasing a document writes an issue but no legacy signoff record, so an
 * agreement the studio has genuinely sent would otherwise still resolve as
 * "not started" — and the client would be shown nothing to do. The issue
 * record is read directly rather than through documentIssueEngine, which
 * imports this module.
 */
const AGREEMENT_DOCUMENT_KIND = {
    terms: 'terms_docket',
    contract: 'execution_agreement',
    handover: 'handover_docket'
};
const NO_ISSUE = {
    released: false, signed: false, issuedAt: null,
    signedAt: null, signedBy: null, reference: null
};
function issueEvidence(context, kind) {
    var _a;
    const issues = (((_a = context === null || context === void 0 ? void 0 : context.documents) === null || _a === void 0 ? void 0 : _a.issues) || []);
    const docKind = AGREEMENT_DOCUMENT_KIND[kind];
    // Withdrawn issues were retired without being signed, and an addendum is a
    // separate instrument — neither speaks for the agreement itself.
    const current = issues
        .filter(i => i && i.kind === docKind && !i.withdrawnAt && !i.addendumTo)
        .sort((a, b) => (b.version || 0) - (a.version || 0))[0];
    if (!current)
        return NO_ISSUE;
    const sig = current.clientSignature;
    return {
        released: true,
        signed: !!sig,
        issuedAt: current.issuedAt ? new Date(current.issuedAt).toISOString() : null,
        signedAt: (sig === null || sig === void 0 ? void 0 : sig.signedAt) || null,
        signedBy: (sig === null || sig === void 0 ? void 0 : sig.signatoryName) || null,
        reference: current.reference || null
    };
}
/** A terms docket counts as executed only when the CLIENT acknowledged it.
 *  `issued` means the studio released it — that is the opposite of signed. */
const isDocketAcknowledged = (d) => !!d && (d.status === 'acknowledged' || d.status === 'signed');
const isDocketReleased = (d) => !!d && (d.status === 'sent' || d.status === 'issued' || d.status === 'acknowledged' || d.status === 'signed');
function resolveTerms(context, currentStage) {
    const ctx = context;
    const engagement = ctx.engagement;
    const dockets = context.termsDockets || [];
    const record = bestRecord(ctx.termsSignoff, context.designAgreementSignoff, ctx.proposalSignoff);
    const issue = issueEvidence(context, 'terms');
    const docketAcked = dockets.some(isDocketAcknowledged);
    const engagementAcked = (engagement === null || engagement === void 0 ? void 0 : engagement.status) === 'acknowledged';
    // A record the client has contested does not count as executed, whatever
    // the other aliases say.
    const isDisputed = (record === null || record === void 0 ? void 0 : record.status) === 'disputed';
    /*
      `lifecycle.gates.proposalAccepted.done` was an alias here and is gone.
  
      Accepting a proposal and signing the Terms of Engagement are two different
      acts on two different documents, and this treated the first as proof of the
      second. On a live project that produced a Terms docket reading "Signed"
      whose own status was still `draft`, which had never been sent, and which
      carried no signature record of any kind — the studio believed it held an
      executed agreement it had never issued.
  
      A signature has to come from a signature: an explicit signoff record, an
      acknowledged docket or engagement, or a signed document issue. The proposal
      gate still drives stage progression, which is what it is for.
  
      Note the contrast with resolveContract and resolveHandover below, which do
      read their gates: `contractSigned` and `handoverComplete` are named for the
      signature itself, so there the gate and the agreement are the same event.
    */
    const signed = !isDisputed && ((record === null || record === void 0 ? void 0 : record.status) === 'signed' || docketAcked || engagementAcked || issue.signed);
    const released = (record === null || record === void 0 ? void 0 : record.status) === 'sent' ||
        (engagement === null || engagement === void 0 ? void 0 : engagement.status) === 'issued' ||
        dockets.some(isDocketReleased) ||
        !!ctx.onboardingSentAt ||
        issue.released;
    const hasDraft = dockets.length > 0 || (engagement === null || engagement === void 0 ? void 0 : engagement.status) === 'draft';
    let state = 'not_started';
    let blockedReason = 'Your studio is preparing the Terms of Engagement Docket.';
    if (signed) {
        state = 'signed';
        blockedReason = null;
        // A fresh docket issued after acknowledgement means an amendment is pending.
        const latest = dockets[dockets.length - 1];
        if (latest && !isDocketAcknowledged(latest) && isDocketReleased(latest) && dockets.length > 1) {
            state = 'superseded';
            blockedReason = null;
        }
    }
    else if (released) {
        state = 'awaiting_client';
        blockedReason = null;
    }
    else if (hasDraft) {
        state = 'drafting';
        blockedReason = 'The docket is being finalised by your studio and will be released for signature shortly.';
    }
    const latestDocket = dockets[dockets.length - 1];
    return Object.assign(Object.assign(Object.assign({ kind: 'terms', title: 'Terms of Engagement Docket', purpose: 'Confirms the design scope, fee structure, payment stages and cancellation terms of your engagement.', state, needsClientAction: state === 'awaiting_client' || state === 'superseded', 
        // Overdue only once the project has moved PAST the stage this document
        // gates. Sitting at Stage 2 with unsigned terms is the normal case, not a
        // breach — Stage 3 onwards is.
        isOverdue: !signed && currentStage > 2, gateStage: 2, signedAt: (record === null || record === void 0 ? void 0 : record.signedAt) || issue.signedAt || (engagement === null || engagement === void 0 ? void 0 : engagement.acknowledgedAt) || (latestDocket === null || latestDocket === void 0 ? void 0 : latestDocket.acknowledgedAt) || null, signedBy: (record === null || record === void 0 ? void 0 : record.signedBy) || (record === null || record === void 0 ? void 0 : record.clientName) || issue.signedBy || context.clientName || null, issuedAt: (record === null || record === void 0 ? void 0 : record.sentAt) || (engagement === null || engagement === void 0 ? void 0 : engagement.issuedAt) || (latestDocket === null || latestDocket === void 0 ? void 0 : latestDocket.sentAt) || (latestDocket === null || latestDocket === void 0 ? void 0 : latestDocket.generatedAt) || issue.issuedAt || null, reference: (engagement === null || engagement === void 0 ? void 0 : engagement.docketRef) || (latestDocket === null || latestDocket === void 0 ? void 0 : latestDocket.docketRef) || (record === null || record === void 0 ? void 0 : record.refId) || issue.reference || null, acceptedOffline: !record && (engagementAcked || docketAcked), acceptedVia: (engagement === null || engagement === void 0 ? void 0 : engagement.acknowledgedVia) || null }, offlineMeta(record)), disputeMeta(record)), { record,
        blockedReason });
}
function resolveContract(context, currentStage) {
    var _a, _b, _c, _d, _e, _f;
    const ctx = context;
    const record = bestRecord(ctx.executionSignoff, ctx.executionAgreementSignoff, ctx.contractSignoff);
    const issue = issueEvidence(context, 'contract');
    const gateDone = !!((_c = (_b = (_a = context.lifecycle) === null || _a === void 0 ? void 0 : _a.gates) === null || _b === void 0 ? void 0 : _b.contractSigned) === null || _c === void 0 ? void 0 : _c.done);
    const executed = ctx.contractStatus === 'executed';
    const isDisputed = (record === null || record === void 0 ? void 0 : record.status) === 'disputed';
    const signed = !isDisputed && ((record === null || record === void 0 ? void 0 : record.status) === 'signed' || gateDone || executed || issue.signed);
    const released = (record === null || record === void 0 ? void 0 : record.status) === 'sent' || issue.released;
    const hasDraft = !!context.contractContent || !!context.approvedTierId || !!context.operativeBoqVersion;
    let state = 'not_started';
    let blockedReason = 'The Master Execution Agreement is drawn up once your design and BOQ are approved and frozen.';
    if (signed) {
        state = 'signed';
        blockedReason = null;
    }
    else if (released) {
        state = 'awaiting_client';
        blockedReason = null;
    }
    else if (hasDraft) {
        state = 'drafting';
        blockedReason = 'Your studio is finalising the frozen BOQ and contract schedule before release.';
    }
    return Object.assign(Object.assign(Object.assign({ kind: 'contract', title: 'Master Execution Agreement', purpose: 'Locks the frozen BOQ, site programme, defect liability period and on-site execution protocols.', state, needsClientAction: state === 'awaiting_client', 
        // Stage 5 means site work has started without an executed contract.
        isOverdue: !signed && currentStage > 4, gateStage: 4, signedAt: (record === null || record === void 0 ? void 0 : record.signedAt) || issue.signedAt || ((_f = (_e = (_d = context.lifecycle) === null || _d === void 0 ? void 0 : _d.gates) === null || _e === void 0 ? void 0 : _e.contractSigned) === null || _f === void 0 ? void 0 : _f.at) || null, signedBy: (record === null || record === void 0 ? void 0 : record.signedBy) || (record === null || record === void 0 ? void 0 : record.clientName) || issue.signedBy || context.clientName || null, issuedAt: (record === null || record === void 0 ? void 0 : record.sentAt) || issue.issuedAt || null, reference: (record === null || record === void 0 ? void 0 : record.refId) || issue.reference || null, acceptedOffline: !record && (gateDone || executed), acceptedVia: null }, offlineMeta(record)), disputeMeta(record)), { record,
        blockedReason });
}
function resolveHandover(context, currentStage) {
    var _a, _b, _c;
    const ctx = context;
    const record = bestRecord(ctx.handoverSignoff, ctx.handoverDocketSignoff);
    const issue = issueEvidence(context, 'handover');
    const gateDone = !!((_c = (_b = (_a = context.lifecycle) === null || _a === void 0 ? void 0 : _a.gates) === null || _b === void 0 ? void 0 : _b.handoverComplete) === null || _c === void 0 ? void 0 : _c.done);
    const isDisputed = (record === null || record === void 0 ? void 0 : record.status) === 'disputed';
    const signed = !isDisputed && ((record === null || record === void 0 ? void 0 : record.status) === 'signed' || gateDone || !!context.handoverDate || issue.signed);
    const released = (record === null || record === void 0 ? void 0 : record.status) === 'sent' || issue.released;
    let state = 'not_started';
    let blockedReason = 'Issued after the joint snag walk-through, once all finishing works are signed off on site.';
    if (signed) {
        state = 'signed';
        blockedReason = null;
    }
    else if (released) {
        state = 'awaiting_client';
        blockedReason = null;
    }
    else if (currentStage >= 6) {
        state = 'drafting';
        blockedReason = 'Your studio is compiling the snag closure report and warranty dossier.';
    }
    return Object.assign(Object.assign(Object.assign({ kind: 'handover', title: 'Handover & Acceptance Docket', purpose: 'Records snag closure, key handover, warranty activation and final project acceptance.', state, needsClientAction: state === 'awaiting_client', isOverdue: false, gateStage: 6, signedAt: (record === null || record === void 0 ? void 0 : record.signedAt) || issue.signedAt || context.handoverDate || null, signedBy: (record === null || record === void 0 ? void 0 : record.signedBy) || (record === null || record === void 0 ? void 0 : record.clientName) || issue.signedBy || context.clientName || null, issuedAt: (record === null || record === void 0 ? void 0 : record.sentAt) || issue.issuedAt || null, reference: (record === null || record === void 0 ? void 0 : record.refId) || issue.reference || null, acceptedOffline: !record && (gateDone || !!context.handoverDate), acceptedVia: null }, offlineMeta(record)), disputeMeta(record)), { record,
        blockedReason });
}
/**
 * Resolves every client agreement from the project context.
 * `currentStage` is used only to decide whether an unsigned document is overdue.
 */
function resolveApprovals(context, currentStage) {
    const terms = resolveTerms(context, currentStage);
    const contract = resolveContract(context, currentStage);
    const handover = resolveHandover(context, currentStage);
    const all = [terms, contract, handover];
    return {
        terms,
        contract,
        handover,
        all,
        actionable: all.filter(a => a.needsClientAction),
        breaches: all.filter(a => a.isOverdue && a.state !== 'signed')
    };
}
exports.resolveApprovals = resolveApprovals;
/** Convenience booleans for callers that only need the headline. */
function isSigned(context, kind) {
    const snap = resolveApprovals(context, 1);
    return snap[kind].state === 'signed';
}
exports.isSigned = isSigned;
/**
 * Builds a context patch that records a signature across EVERY field family the
 * app reads, so the studio workspace and the client portal can never disagree.
 *
 * Returns a function so callers can use it inside a functional setState and
 * merge against the freshest context rather than a captured stale one.
 */
function buildSignoffPatch(kind, docket, origin = { surface: 'client_portal' }) {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const record = {
        status: 'signed',
        signedAt: docket.signedAt || nowIso,
        signedBy: docket.signatoryName,
        clientName: docket.signatoryName,
        clientEmail: docket.signatoryEmail,
        ipAddress: docket.ipAddress,
        refId: docket.docketHash,
        signatureType: docket.signatureType,
        signatureDataUrl: docket.signatureDataUrl,
        docket
    };
    return (prev) => {
        var _a;
        const base = prev || {};
        const prevAny = base;
        const lifecycle = base.lifecycle || {};
        const gates = lifecycle.gates || {};
        if (kind === 'terms') {
            const existing = base.termsDockets || [];
            // Acknowledge the newest released docket; create one if the studio never
            // generated it (e.g. an offline engagement being formalised in-portal).
            let updatedDockets;
            if (existing.length > 0) {
                const lastIdx = existing.length - 1;
                updatedDockets = existing.map((d, i) => i === lastIdx
                    ? Object.assign(Object.assign({}, d), { status: 'acknowledged', acknowledgedAt: nowMs, docket })
                    : d);
            }
            else {
                updatedDockets = [
                    {
                        id: `td-${nowMs}`,
                        docketRef: ((_a = prevAny.engagement) === null || _a === void 0 ? void 0 : _a.docketRef) || `FFDS-TD-${new Date().getFullYear()}-${String(nowMs).slice(-3)}`,
                        status: 'acknowledged',
                        generatedAt: nowMs,
                        sentAt: nowMs,
                        sentBy: 'Client Portal',
                        acknowledgedAt: nowMs,
                        snapshotTermsConfig: prevAny.termsConfig || null,
                        snapshotClientData: {
                            clientName: docket.signatoryName || base.clientName || 'Client',
                            projectName: base.name,
                            date: new Date().toLocaleDateString('en-IN')
                        },
                        docket
                    }
                ];
            }
            return Object.assign(Object.assign({}, base), { 
                // every alias the codebase reads
                termsSignoff: record, designAgreementSignoff: record, proposalSignoff: prevAny.proposalSignoff || record, termsDockets: updatedDockets, 
                // the studio-side engagement record — this is what unlocks the
                // Payment Calculator and the Engagement Lifecycle widget
                engagement: Object.assign(Object.assign({}, (prevAny.engagement || {
                    designFee: null,
                    executionValue: null,
                    docketRef: null,
                    termsVersion: null,
                    paymentScheduleVersion: null,
                    lockedSnapshot: null
                })), { status: 'acknowledged', acknowledgedAt: nowMs, acknowledgedVia: origin.via || (origin.surface === 'client_portal' ? 'email' : null) }), lifecycle: Object.assign(Object.assign({}, lifecycle), { gates: Object.assign(Object.assign({}, gates), { proposalAccepted: { done: true, at: nowMs, reference: docket.docketHash } }) }) });
        }
        if (kind === 'contract') {
            return Object.assign(Object.assign({}, base), { executionSignoff: record, executionAgreementSignoff: record, contractSignoff: record, contractStatus: 'executed', lifecycle: Object.assign(Object.assign({}, lifecycle), { gates: Object.assign(Object.assign({}, gates), { contractSigned: { done: true, at: nowMs, reference: docket.docketHash } }) }) });
        }
        // handover
        return Object.assign(Object.assign({}, base), { handoverSignoff: record, handoverDocketSignoff: record, status: 'completed', handoverDate: nowMs, lifecycle: Object.assign(Object.assign({}, lifecycle), { stage: Math.max(6, lifecycle.stage || 0), gates: Object.assign(Object.assign({}, gates), { handoverComplete: { done: true, at: nowMs, reference: docket.docketHash } }) }) });
    };
}
exports.buildSignoffPatch = buildSignoffPatch;
/**
 * The client contests a sign-off recorded on their behalf.
 *
 * This is the control that makes manual override safe to offer at all. Studio
 * staff can mark a client's agreement as signed; without a client-side way to
 * say "that isn't right", the feature is an integrity hole. With one, the
 * record is stronger than a paper file — the client has seen it, and their
 * silence is itself evidence.
 */
function buildDisputePatch(kind, reason, raisedBy) {
    const nowIso = new Date().toISOString();
    const disputeOn = (existing) => (Object.assign(Object.assign({}, (existing || {})), { status: 'disputed', disputeReason: reason, disputedAt: nowIso, disputedBy: raisedBy }));
    return (prev) => {
        const base = prev || {};
        const prevAny = base;
        const lifecycle = base.lifecycle || {};
        const gates = lifecycle.gates || {};
        if (kind === 'terms') {
            return Object.assign(Object.assign({}, base), { termsSignoff: disputeOn(prevAny.termsSignoff || base.designAgreementSignoff), designAgreementSignoff: disputeOn(base.designAgreementSignoff || prevAny.termsSignoff), engagement: prevAny.engagement
                    ? Object.assign(Object.assign({}, prevAny.engagement), { status: 'issued', acknowledgedAt: null, acknowledgedVia: null }) : prevAny.engagement, termsDockets: (base.termsDockets || []).map((d, i, arr) => i === arr.length - 1 ? Object.assign(Object.assign({}, d), { status: 'sent', acknowledgedAt: null }) : d), lifecycle: Object.assign(Object.assign({}, lifecycle), { gates: Object.assign(Object.assign({}, gates), { proposalAccepted: { done: false, at: null, reference: null } }) }) });
        }
        if (kind === 'contract') {
            return Object.assign(Object.assign({}, base), { executionSignoff: disputeOn(prevAny.executionSignoff), executionAgreementSignoff: disputeOn(prevAny.executionAgreementSignoff), contractSignoff: disputeOn(base.contractSignoff), contractStatus: 'disputed', lifecycle: Object.assign(Object.assign({}, lifecycle), { gates: Object.assign(Object.assign({}, gates), { contractSigned: { done: false, at: null, reference: null } }) }) });
        }
        return Object.assign(Object.assign({}, base), { handoverSignoff: disputeOn(prevAny.handoverSignoff), handoverDocketSignoff: disputeOn(prevAny.handoverDocketSignoff), handoverDate: undefined, lifecycle: Object.assign(Object.assign({}, lifecycle), { gates: Object.assign(Object.assign({}, gates), { handoverComplete: { done: false, at: null, reference: null } }) }) });
    };
}
exports.buildDisputePatch = buildDisputePatch;
//# sourceMappingURL=clientApprovalEngine.js.map