"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.portalViewSummary = exports.buildPortalView = void 0;
const clientVisibility_1 = require("./clientVisibility");
/** Keep only published items, and only the fields a client has business seeing. */
function published(items, pick) {
    return (items || []).filter(clientVisibility_1.isVisibleToClient).map(pick);
}
/**
 * Drop keys whose value is `undefined`, all the way down.
 *
 * Firestore refuses a write containing `undefined` anywhere in the document and
 * names only the first offender, so the projection failed on
 * `context.clientEmail` for a project with no client email recorded — and would
 * have failed again on the next absent field, one at a time.
 *
 * The projection is built by copying named fields off the project context, and
 * a field the studio has not filled in is simply absent there. Absent has to
 * mean absent in the stored document too, not an error.
 *
 * Only plain objects and arrays are walked. Anything else — a Firestore
 * Timestamp, a Date — is passed through untouched, since rebuilding those from
 * their entries would corrupt them.
 */
function pruneUndefined(value) {
    if (Array.isArray(value))
        return value.map(pruneUndefined);
    if (value && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        if (proto === Object.prototype || proto === null) {
            const out = {};
            for (const [k, v] of Object.entries(value)) {
                if (v === undefined)
                    continue;
                out[k] = pruneUndefined(v);
            }
            return out;
        }
    }
    return value;
}
function buildPortalView(projectId, ctx, studio, 
/*
  The scope, already reduced to client-safe rows by lib/clientBoq.

  Passed in rather than derived here because the BOQ is not on the project
  context — it is assembled from the active tier and the item bank, neither of
  which this function has. Omitted, the stored view simply carries no scope,
  which is what every view written before this existed looks like.
*/
clientBoq, 
/*
  The rows the markers were measured against, stored so they survive.

  They were derived from the tier chain, and that chain does not last: a
  project's `tiers` array has been observed going from four entries to one,
  leaving `parentTierId` pointing at a version that no longer exists. Once
  that happens there is nothing left to compare against and every marker
  disappears — including on lines the client had already been told changed.

  Keeping the baseline in the projection makes it independent of whatever
  happens to the tier list.
*/
clientBoqBaseline) {
    const c = ctx;
    return pruneUndefined({
        v: 1,
        builtAt: new Date().toISOString(),
        projectId,
        context: {
            // Identity the portal header needs.
            name: ctx.name,
            clientName: c.clientName,
            clientEmail: c.clientEmail,
            status: c.status,
            area: ctx.area,
            config: ctx.config,
            rooms: (ctx.rooms || []).map((r) => ({ id: r.id, name: r.name, size: r.size, unit: r.unit })),
            // Money the client is entitled to: what is owed and when. No
            // lockedTaxableBase, no cost split, no margin.
            paymentMilestones: (ctx.paymentMilestones || []).map((m) => ({
                id: m.id, type: m.type, name: m.name, description: m.description,
                trigger: m.trigger, date: m.date, status: m.status,
                percentage: m.percentage, fixedAmount: m.fixedAmount, isFixedAmount: m.isFixedAmount,
                invoiceNumber: m.invoiceNumber, invoiceDate: m.invoiceDate
            })),
            siteUpdates: published(c.siteUpdates, (i) => ({
                id: i.id, title: i.title, note: i.note || i.caption, date: i.date,
                photos: i.photos || i.images, clientVisibility: i.clientVisibility
            })),
            projectUpdates: published(c.projectUpdates, (i) => ({
                id: i.id, title: i.title, summary: i.summary, date: i.date, type: i.type,
                clientVisibility: i.clientVisibility
            })),
            siteVisits: published(c.siteVisits, (i) => ({
                id: i.id, title: i.title || i.purpose, type: i.type, date: i.date || i.visitDate,
                notes: i.clientNotes, clientVisibility: i.clientVisibility
            })),
            momHistory: published(c.momHistory, (i) => ({
                id: i.id, title: i.title || i.subject, date: i.date || i.meetingDate,
                decisions: i.decisions, meetingType: i.meetingType, clientVisibility: i.clientVisibility
            })),
            materialSelections: published(c.materialSelections, (i) => ({
                id: i.id, itemName: i.itemName, roomId: i.roomId, category: i.category,
                brand: i.brand, finishCode: i.finishCode, status: i.status, photos: i.photos,
                clientConfirmedAt: i.clientConfirmedAt, clientVisibility: i.clientVisibility
            })),
            designDocuments: published(c.designDocuments, (i) => ({
                id: i.id, name: i.name || i.title, url: i.url, date: i.date || i.issuedAt,
                kind: i.kind, clientVisibility: i.clientVisibility
            })),
            boqRevisions: published(c.boqRevisions, (i) => ({
                id: i.id, title: i.title || i.reason, date: i.date, status: i.status,
                amount: i.amount, clientVisibility: i.clientVisibility
            })),
            // Decisions are already a projection of the ledger; drafts never
            // reach it, so anything present here was released to the client.
            projectDecisions: (c.projectDecisions || []).map((d) => ({
                id: d.id, title: d.title, description: d.description, roomId: d.roomId,
                status: d.status, date: d.date, selectedOption: d.selectedOption,
                clientConfirmedAt: d.clientConfirmedAt, confirmingParty: d.confirmingParty,
                signoffToken: d.signoffToken,
                // Carried so a published portal can say whether a drawing or site work
                // is being held, show the drawing being approved, and state the impact.
                // Without these the snapshot could only ever render a bare title.
                decisionNature: d.decisionNature, category: d.category,
                photoUrl: d.photoUrl, drawingUrl: d.drawingUrl,
                clientQuery: d.clientQuery, studioReply: d.studioReply, discussion: d.discussion,
                impactCost: d.impactCost, impactSchedule: d.impactSchedule,
                notifiedAt: d.notifiedAt
            })),
            // Sign-off state the portal reads to show what is agreed.
            // Payment and contact details, so the client never reads studioSettings.
            portalStudio: studio ? {
                name: studio.name,
                logoUrl: studio.logoUrl,
                phone: studio.phone,
                email: studio.email,
                address: studio.address,
                bankDetails: studio.bankDetails
            } : undefined,
            // The scope, sell rates only. See lib/clientBoq for what is stripped.
            clientBoq: clientBoq && clientBoq.length ? clientBoq : undefined,
            clientBoqBaseline: clientBoqBaseline && clientBoqBaseline.length ? clientBoqBaseline : undefined,
            /*
              What a legacy document is synthesised from.
      
              Not every document exists as a DocumentIssue. `getCurrentIssue` falls
              back to building the Terms of Engagement and the Payment Schedule out of
              the engagement record and the last terms docket, for projects that
              predate the issue model — and the client portal calls exactly the same
              function.
      
              Without these two fields that fallback finds nothing on the client's
              side, so a Terms Docket the studio can see as "v1 · DOC-TD-2026-682 ·
              issued 29 Jul" reads as "Signed · Not yet issued" in the portal: the
              client is told they signed something the portal cannot show them.
      
              Trimmed to what the two fallbacks read. `engagement` is otherwise the
              largest thing on a project — 359KB on one here — and most of it is the
              studio's own working record. `snapshotTermsConfig` is the terms text
              itself, which is the document the client signed and is theirs to read.
            */
            engagement: c.engagement ? {
                docketRef: c.engagement.docketRef,
                issuedAt: c.engagement.issuedAt,
                paymentScheduleVersion: c.engagement.paymentScheduleVersion,
                designFee: c.engagement.designFee,
                executionValue: c.engagement.executionValue,
                lockedSnapshot: c.engagement.lockedSnapshot ? {
                    termsSettings: c.engagement.lockedSnapshot.termsSettings,
                    advances: c.engagement.lockedSnapshot.advances,
                    paymentStructure: c.engagement.lockedSnapshot.paymentStructure,
                } : undefined,
            } : undefined,
            termsDockets: (c.termsDockets || []).map((d) => ({
                id: d.id,
                docketRef: d.docketRef,
                status: d.status,
                sentAt: d.sentAt,
                sentBy: d.sentBy,
                generatedAt: d.generatedAt,
                acknowledgedAt: d.acknowledgedAt,
                snapshotTermsConfig: d.snapshotTermsConfig,
                snapshotClientData: d.snapshotClientData,
            })),
            /*
              The documents the studio has issued.
      
              This was missing entirely, and it is the whole of the client's Documents
              tab — every issue, the version they hold, their own questions, and when
              they last opened one. Without it the portal could only ever render the
              gates ("Shared once you have accepted the proposal") and statuses
              derived from the signoff records, never an actual document. A studio
              could issue version 2 of the Onboarding Kit, see it in their preview,
              and the client would go on being told nothing had been issued at all.
      
              Filtered by the same visibility rule as everything else, so a staged
              re-issue stays invisible until it is published — which is the point of
              staging it. `snapshot` is the document's own frozen content and is what
              the reader renders, so it travels; there is nothing behind it that the
              client is not meant to read.
            */
            documents: c.documents ? {
                issues: published(c.documents.issues, (i) => i),
                queries: c.documents.queries || [],
                lastViewedAt: c.documents.lastViewedAt || {},
            } : undefined,
            designAgreementSignoff: c.designAgreementSignoff,
            executionSignoff: c.executionSignoff,
            handoverSignoff: c.handoverSignoff,
            weeklyRoomProgress: c.weeklyRoomProgress
        }
    });
}
exports.buildPortalView = buildPortalView;
/** What ops sees before releasing: how much of the project reaches the client. */
function portalViewSummary(view) {
    var _a;
    const c = view.context;
    return [
        { section: 'Site updates', count: (c.siteUpdates || []).length },
        { section: 'Client updates', count: (c.projectUpdates || []).length },
        { section: 'Site visits', count: (c.siteVisits || []).length },
        { section: 'Meeting notes', count: (c.momHistory || []).length },
        { section: 'Materials', count: (c.materialSelections || []).length },
        { section: 'Drawings', count: (c.designDocuments || []).length },
        { section: 'Variations', count: (c.boqRevisions || []).length },
        { section: 'Decisions', count: (c.projectDecisions || []).length },
        { section: 'Payment milestones', count: (c.paymentMilestones || []).length },
        { section: 'Scope lines', count: (c.clientBoq || []).length },
        /* Counted so that issuing a document marks the client's copy as behind.
           It did not, so a re-issued document could sit unsent with the panel
           reporting everything current. */
        { section: 'Documents', count: (((_a = c.documents) === null || _a === void 0 ? void 0 : _a.issues) || []).length }
    ];
}
exports.portalViewSummary = portalViewSummary;
//# sourceMappingURL=portalProjection.js.map