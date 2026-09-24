import { ProjectContext, ProjectSchedule } from '../types';
import { isVisibleToClient } from './clientVisibility';
import { ClientBoqRow } from './clientBoq';
import { PortalMoney } from './portalMoney';

/**
 * The published-only view of a project, as the client receives it.
 *
 * ── Why a projection and not the project ────────────────────────────────────
 * The client used to be handed the whole project document. That document holds
 * item rates, margins, internal notes, every unpublished draft and the portal
 * access token itself. Filtering it in the browser is not security: whatever
 * reaches the client's machine, the client has, regardless of what the UI draws.
 *
 * So the studio writes this projection to projects/{id}/portalView/current, and
 * Firestore rules let a portal client read *only* that. Anything absent here is
 * not merely hidden — it was never sent.
 *
 * Build it with `buildPortalView`. Do not hand-assemble a client payload.
 */

/**
 * The projection is deliberately shaped like a ProjectContext.
 *
 * The portal renders from a context today. Emitting the same shape means the
 * client build needs no separate rendering path — and, more importantly, the
 * object it receives simply does not contain rates, margins, cost breakdowns or
 * the access token. It cannot leak what it was never given, whatever the UI does.
 */
export interface PortalView {
  /** Schema version, so a stale cached view can be spotted and refreshed. */
  v: 1;
  builtAt: string;
  projectId: string;
  /** Published-only, client-safe. Shaped like ProjectContext on purpose. */
  context: Record<string, any>;
  /** Work added after the BOQ was frozen. Absent when there is none. */
  scopeAdditions?: PortalScopeAddition[];
}

/**
 * A scope addition as the CLIENT sees it.
 *
 * What they asked for, what it costs them, and whether it is settled. What does
 * NOT cross: the base cost, the margin, the markup percentage and the internal
 * type code -- the studio's cost structure is not the client's business, and
 * "TYPE_C" means nothing to them. The nature of the change travels as the words
 * the picker uses.
 */
export interface PortalScopeAddition {
  ref: string;
  /** The request in the client's own words, as it appears on the invoice. */
  request: string;
  nature: string;
  issuedAt: string | null;
  designFeeTotal: number;
  executionTotal: number;
  grandTotal: number;
  /*
    The tax breakdown, so the portal can show the client the same invoice they
    were sent rather than a total on a screen. Every one of these figures is
    already printed on that document -- nothing here is studio-internal.
  */
  designFeeBase?: number;
  designFeeGst?: number;
  executionSubtotal?: number;
  executionGst?: number;
  /** True once the whole invoice is settled and the work is released to site. */
  released: boolean;
  designFeePaid: boolean;
  executionPaid: boolean;
  /**
   * What the money buys.
   *
   * The first version of this carried totals only, so the portal asked a client
   * for a six-figure sum while showing them a reference number. These are the
   * same lines printed on their invoice -- description, quantity, unit and the
   * amount. The base cost, the margin and the markup do not cross: what a line
   * costs the studio to deliver is not part of what the client is agreeing to.
   */
  lines?: { description: string; qty: number; unit: string; amount: number }[];
}

/** Keep only published items, and only the fields a client has business seeing. */
function published<T extends Record<string, any>>(items: T[] | undefined, pick: (i: T) => any): any[] {
  return (items || []).filter(isVisibleToClient).map(pick);
}

/**
 * Studio details a client legitimately needs: who to pay, and who to call.
 *
 * Carried here rather than read from studioSettings, because that document also
 * holds team emails, GSTIN and internal configuration, and is not world-readable.
 * Only these fields cross to the client.
 */
export interface PortalStudio {
  name?: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  address?: string;
  /*
    Identity a tax invoice must carry. These appear on every invoice the studio
    has already sent this client, so carrying them lets the portal render that
    same document instead of reproducing its numbers without its letterhead.
  */
  cityState?: string;
  gstin?: string;
  legalName?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  bankDetails?: {
    accountName?: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    upiId?: string;
    qrCodeImage?: string;
  };
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
function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(pruneUndefined) as unknown as T;

  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(value as Record<string, any>)) {
        if (v === undefined) continue;
        out[k] = pruneUndefined(v);
      }
      return out as T;
    }
  }

  return value;
}

export function buildPortalView(
  projectId: string,
  ctx: ProjectContext,
  studio?: PortalStudio,
  /*
    The scope, already reduced to client-safe rows by lib/clientBoq.

    Passed in rather than derived here because the BOQ is not on the project
    context — it is assembled from the active tier and the item bank, neither of
    which this function has. Omitted, the stored view simply carries no scope,
    which is what every view written before this existed looks like.
  */
  clientBoq?: ClientBoqRow[],
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
  clientBoqBaseline?: ClientBoqRow[],
  /* Scope additions, already reduced to client-safe rows by the caller.
     Last, so every existing positional call keeps working. */
  scopeAdditions?: PortalScopeAddition[],
  /*
    The money, already worked out by the studio.

    Not derived here for the same reason the BOQ is not: the design fee base
    lives on the active tier and the billing rules live in `financials`, and a
    client session has neither. The portal used to recompute from what it could
    see and silently fell back to invented defaults -- a 0 design fee against
    real percentages, and a ROUNDED 4,999 retainer shown as cleared to every
    client on every project.

    Only figures the client is already quoted on their own invoices cross. The
    billable/cash split, the discount structure and the tier summaries that
    produced these numbers stay on the studio's side.

    Appended last, so every existing positional call keeps working.
  */
  money?: PortalMoney,
  /*
    The dated programme, as the studio's own Timeline draws it.

    The portal reads the schedule and the design phases straight out of
    Firestore, which works only where the studio has actually saved a schedule
    -- and on most projects it has not. A client session also runs with a blank
    `studioId`, which switches off the design-phase hook by design, so with no
    saved schedule the portal fell back to `buildScheduleFromProject` with no
    design steps and drew a programme derived from the BOQ alone.

    The studio's own preview of that screen has the design phases, so it drew a
    different programme from the same code: the preview was always the
    better-informed of the two, which is the one place a discrepancy is
    guaranteed not to be noticed.

    Sent with the projection, the client reads what was published. It is a
    fallback, not a replacement -- where the portal can still read a live saved
    schedule it prefers that, so changing dates on the Timeline continues to
    reach the client without a release.
  */
  schedule?: ProjectSchedule,
): PortalView {
  const c = ctx as any;

  return pruneUndefined({
    v: 1,
    builtAt: new Date().toISOString(),
    projectId,
    /* Absent rather than empty when there are none, so the portal can tell
       "no additions" from "this projection predates the feature". */
    scopeAdditions: scopeAdditions && scopeAdditions.length ? scopeAdditions : undefined,
    context: {
      // Identity the portal header needs.
      name: ctx.name,
      clientName: c.clientName,
      clientEmail: c.clientEmail,
      status: c.status,
      area: ctx.area,
      config: ctx.config,
      rooms: (ctx.rooms || []).map((r: any) => ({ id: r.id, name: r.name, size: r.size, unit: r.unit })),

      // Money the client is entitled to: what is owed and when. No
      // lockedTaxableBase, no cost split, no margin.
      paymentMilestones: (ctx.paymentMilestones || []).map((m: any) => ({
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
      /*
        A finish the client is being asked to confirm, with the basis to decide.

        This carried the name, room, brand, code, status and photos -- and
        nothing else. Not the price, not the allowance it is measured against,
        not the lead time. So the portal asked a client to confirm a selection
        while showing them no cost at all, and the card could only report "the
        studio has not priced this yet" about a finish the studio had priced at
        8,250. The studio's own preview reads the project directly and showed
        the real figures, so the two screens disagreed and only the client's was
        wrong.

        What crosses now is what a client needs to say yes, and all of it is
        already theirs: the price they would pay, the allowance their own
        contract carries for that item, how long it takes, and who supplies it.
        `boqAbsorbed` crosses so the card can say the studio is covering an
        overage rather than leaving them to assume they owe it.

        What still does not cross: anything about what it costs the studio.
      */
      materialSelections: published(c.materialSelections, (i) => ({
        id: i.id, itemName: i.itemName, roomId: i.roomId, category: i.category,
        brand: i.brand, finishCode: i.finishCode, status: i.status, photos: i.photos,
        clientConfirmedAt: i.clientConfirmedAt, clientVisibility: i.clientVisibility,
        vendor: i.vendor,
        notes: i.notes,
        dimensions: i.dimensions, colorTemp: i.colorTemp, wattage: i.wattage,
        quotedPrice: i.quotedPrice, priceUnit: i.priceUnit,
        estimatedQty: i.estimatedQty, estimatedTotal: i.estimatedTotal,
        allowancePrice: i.allowancePrice,
        boqAbsorbed: i.boqAbsorbed,
        leadTimeDays: i.leadTimeDays,
        /* Their own link's token, so a finish-confirmation link can land on the
           right card once they are signed in. */
        confirmationToken: i.confirmationToken,
        /* Their own question, echoed back. Without it the card forgets what they
           asked the moment the page reloads, and a client cannot tell whether it
           was ever received. */
        changeReason: i.changeReason,
        changeRequestedAt: i.changeRequestedAt,
        /* The studio's answer, so the question and the reply sit together on
           the client's card rather than the reply arriving by some other route
           while the portal still shows an unanswered question. */
        studioReply: i.studioReply,
        studioReplyAt: i.studioReplyAt,
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
      projectDecisions: (c.projectDecisions || []).map((d: any) => ({
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
        bankDetails: studio.bankDetails,
        /* Invoice letterhead. Already on every invoice this client holds. */
        cityState: studio.cityState,
        gstin: studio.gstin,
        legalName: studio.legalName,
        signatoryName: studio.signatoryName,
        signatoryTitle: studio.signatoryTitle,
      } : undefined,

      // The scope, sell rates only. See lib/clientBoq for what is stripped.
      clientBoq: clientBoq && clientBoq.length ? clientBoq : undefined,
      /* Task names, durations and dates. No rates: a ProjectSchedule has none. */
      clientSchedule: schedule && schedule.tasks?.length ? schedule : undefined,
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

      termsDockets: (c.termsDockets || []).map((d: any) => ({
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
        issues: published(c.documents.issues, (i: any) => i),
        queries: c.documents.queries || [],
        lastViewedAt: c.documents.lastViewedAt || {},
      } : undefined,

      designAgreementSignoff: c.designAgreementSignoff,
      executionSignoff: c.executionSignoff,
      handoverSignoff: c.handoverSignoff,
      weeklyRoomProgress: c.weeklyRoomProgress,

      /*
        Absent rather than zeroed when the studio has not sent it, so the portal
        can tell "nothing owed" from "this projection predates the figures" and
        say so instead of printing a confident zero.
      */
      portalMoney: money,
    }
  });
}

/** What ops sees before releasing: how much of the project reaches the client. */
export function portalViewSummary(view: PortalView): { section: string; count: number }[] {
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
    { section: 'Scope lines', count: ((c as any).clientBoq || []).length },
    { section: 'Programme tasks', count: ((c as any).clientSchedule?.tasks || []).length },
    /* Counted so that issuing a document marks the client's copy as behind.
       It did not, so a re-issued document could sit unsent with the panel
       reporting everything current. */
    { section: 'Documents', count: (((c as any).documents?.issues) || []).length }
  ];
}
