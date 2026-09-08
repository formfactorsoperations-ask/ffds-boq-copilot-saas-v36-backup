/**
 * DOCUMENT RELEASE ENGINE
 *
 * How a document actually gets to the client.
 *
 * Until now the portal could only ever show the Terms Docket, because the only
 * frozen snapshot in the system was the one `engagement.lockedSnapshot` happened
 * to leave behind. Nothing called `issueDocument`. This module supplies the
 * missing half: for each document kind it knows how to assemble the payload the
 * renderer needs, whether the project is ready to release it, and what happens
 * on release.
 *
 * Release is deliberately explicit. A document appears in the client's vault
 * because someone at the studio decided to send it — never as a side effect of
 * some other field changing.
 */

import {
  ProjectContext,
  ClientDocumentKind,
  DocumentState,
  DocumentIssue,
  MaterialSection,
  TermsSettings,
  FullProjectData
} from '../types';
import {
  issueDocument,
  getCurrentIssue,
  deriveMaterialSections,
  hashSnapshot
} from './documentIssueEngine';
import { resolveApprovals } from './clientApprovalEngine';

// ---------------------------------------------------------------------------
// CATALOGUE
// ---------------------------------------------------------------------------

/**
 * What the document asks of the client.
 *
 *  signature  — legally binding. Full reading ceremony, evidence recorded,
 *               material terms acknowledged individually before the pen unlocks.
 *  acknowledge— the client confirms they have seen it. One tick, no ceremony.
 *               Nothing here binds them beyond what they signed elsewhere.
 *  review     — informational. Nothing to confirm; sending it is the point.
 *
 * Getting this wrong in either direction is costly. Asking for a signature on a
 * status report trains people to sign without reading; accepting a tick on a
 * liability clause leaves you with nothing to stand on.
 */
export type SignatureMode = 'signature' | 'acknowledge' | 'review';

export interface ReleasableDocument {
  kind: ClientDocumentKind;
  title: string;
  /** What the client is being asked to do with it. */
  purpose: string;
  /** What the client must do — see SignatureMode. */
  mode: SignatureMode;
  /** True when the client must sign it, not merely read it. */
  signable: boolean;
  /** Documents that are always sent together. */
  packWith?: ClientDocumentKind[];
  /** Why it carries the mode it does. Shown to the studio on release. */
  modeReason: string;
}

export const RELEASABLE_DOCUMENTS: ReleasableDocument[] = [
  {
    kind: 'terms_docket',
    title: 'Terms of Engagement Docket',
    purpose: 'Sets the scope, fee structure, payment stages and cancellation terms.',
    mode: 'signature',
    signable: true,
    packWith: ['payment_schedule'],
    modeReason: 'Binds fees, cancellation and liability. Must be signed.'
  },
  {
    kind: 'payment_schedule',
    title: 'Payment Schedule',
    purpose: 'The advance schedule, what each one unlocks, and when it falls due.',
    mode: 'acknowledge',
    signable: false,
    modeReason:
      'The payment terms themselves are already bound by the Terms Docket. This is the working schedule — the client confirms they have it.'
  },
  {
    kind: 'onboarding_kit',
    title: 'Onboarding Kit',
    purpose: 'Who does what, how to reach the team, and what happens next.',
    /* 'review' recorded nothing at all — the client read it and the project
       had no way of knowing. Acknowledgement leaves a receipt. */
    mode: 'acknowledge',
    signable: false,
    modeReason: 'Informational, but the studio needs a receipt that the client has it.'
  },
  {
    kind: 'execution_agreement',
    title: 'Master Execution Agreement',
    purpose: 'Locks the frozen BOQ, the site programme and the defect liability terms.',
    mode: 'signature',
    signable: true,
    modeReason: 'Binds scope, programme and defect liability. Must be signed.'
  },
  {
    kind: 'handover_docket',
    title: 'Handover & Acceptance Docket',
    purpose: 'Records snag closure, key handover and warranty activation.',
    mode: 'signature',
    signable: true,
    modeReason: 'Transfers possession and starts the warranty clock. Must be signed.'
  },
  {
    kind: 'snag_list',
    title: 'Snag List & Defect Report',
    purpose: 'Every defect raised on site, and how each one was closed.',
    mode: 'signature',
    signable: true,
    modeReason: 'Handover depends on it. Signing is the client agreeing the list is complete and closed.'
  }
];

export const documentMode = (kind: ClientDocumentKind): SignatureMode =>
  RELEASABLE_DOCUMENTS.find(d => d.kind === kind)?.mode || 'review';

export const documentTitle = (kind: ClientDocumentKind): string =>
  RELEASABLE_DOCUMENTS.find(d => d.kind === kind)?.title || 'Document';

// ---------------------------------------------------------------------------
// READINESS
// ---------------------------------------------------------------------------

export interface ReleaseReadiness {
  ready: boolean;
  /** What is missing, phrased so the studio can go and fix it. */
  blockers: string[];
  /** Non-blocking things worth knowing before sending. */
  warnings: string[];
}

/**
 * Whether this document can honestly be sent yet.
 *
 * Releasing a half-built document is worse than not sending one: the client
 * reads it, signs it, and the studio is bound to whatever was on the page.
 */
export function getReleaseReadiness(
  kind: ClientDocumentKind,
  context: ProjectContext,
  projectData?: FullProjectData
): ReleaseReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const ctx = context as any;

  if (!context.clientName) blockers.push('Client name is not set on the project.');
  if (!context.clientEmail) warnings.push('No client email on file — you can only share the portal link.');

  switch (kind) {
    case 'terms_docket': {
      const settings: TermsSettings | null =
        ctx.engagement?.lockedSnapshot?.termsSettings ||
        (context.termsDockets || []).slice(-1)[0]?.snapshotTermsConfig ||
        null;
      if (!settings) blockers.push('No Terms configuration found. Set it up in Studio Settings first.');
      else if (!settings.sections?.length) blockers.push('The Terms configuration has no sections.');
      if (settings && !settings.disputeJurisdiction) {
        warnings.push('Dispute jurisdiction is blank — it will read as unset in the docket.');
      }
      break;
    }
    case 'payment_schedule': {
      const schedules = (context as any).paymentSchedules || [];
      const latest = schedules.length
        ? schedules.reduce((a: any, b: any) => (a.version > b.version ? a : b))
        : null;
      const advances =
        latest?.advances || ctx.engagement?.lockedSnapshot?.advances || context.paymentMilestones || [];
      if (!advances.length) blockers.push('No payment milestones configured for this project.');
      if (latest?.status === 'draft') {
        warnings.push(
          `Releasing draft ${latest.versionLabel}. Anything you change on the Payment Schedule page after this will need a re-issue.`
        );
      }
      if (!ctx.engagement?.designFee && !context.financials?.approvedDesignValue) {
        warnings.push('Design fee is not set, so amounts may show as zero.');
      }
      break;
    }
    case 'execution_agreement': {
      const boq = projectData?.tiers?.find(t => t.id === context.approvedTierId) || projectData?.tiers?.[0];
      if (!context.boqFrozen && !context.operativeBoqVersion) {
        blockers.push('The BOQ is not frozen. Freeze it before sending an execution agreement.');
      }
      if (!boq) warnings.push('No approved tier found — the scope table will be empty.');
      const approvals = resolveApprovals(context, 1);
      if (approvals.terms.state !== 'signed') {
        warnings.push('Terms of Engagement is not signed yet. Normally that comes first.');
      }
      break;
    }
    case 'snag_list': {
      const snags = (ctx.snagList || []) as any[];
      if (!snags.length) {
        blockers.push('No snags have been recorded, so there is nothing for the client to sign off.');
      }
      const stillOpen = snags.filter(sn => sn.status !== 'resolved' && sn.status !== 'verified').length;
      if (stillOpen > 0) {
        /* A warning, not a blocker: a client may reasonably accept possession
           with items outstanding, but the studio should be sending it knowingly. */
        warnings.push(`${stillOpen} item${stillOpen === 1 ? ' is' : 's are'} still open. The client will be signing a list that is not fully closed.`);
      }
      break;
    }

    case 'handover_docket': {
      if (!(ctx.snagList || []).length) {
        warnings.push('No snag items recorded. The docket will state that none were found.');
      }
      break;
    }
    default:
      break;
  }

  return { ready: blockers.length === 0, blockers, warnings };
}

// ---------------------------------------------------------------------------
// SNAPSHOT BUILDERS
// ---------------------------------------------------------------------------

const clientBlock = (context: ProjectContext) => ({
  clientName: context.clientName || 'Client',
  projectName: context.name,
  location: context.location
});

/**
 * Assembles the frozen payload for a document kind.
 *
 * Everything the renderer will ever need must be copied in here. A snapshot that
 * reaches back into live context defeats the point — the client would be signing
 * something that can silently change afterwards.
 */
export function buildSnapshot(
  kind: ClientDocumentKind,
  context: ProjectContext,
  projectData?: FullProjectData,
  /** Studio letterhead, frozen into the snapshot so it never drifts. */
  opts?: { orgName?: string; officeAddress?: string; contactEmail?: string }
): any {
  const ctx = context as any;
  const base = clientBlock(context);

  const termsSettings: TermsSettings | null =
    ctx.engagement?.lockedSnapshot?.termsSettings ||
    (context.termsDockets || []).slice(-1)[0]?.snapshotTermsConfig ||
    null;

  switch (kind) {
    case 'terms_docket': {
      // Freeze the authored docket exactly as the studio page renders it, so
      // the portal can hand it to the same TermsDocketSheet component.
      const dockets = context.termsDockets || [];
      const latestDocket = dockets.length ? dockets[dockets.length - 1] : null;
      return {
        ...base,
        termsSettings,
        latestDocket: latestDocket
          ? { docketRef: latestDocket.docketRef, status: latestDocket.status }
          : { docketRef: ctx.engagement?.docketRef || '____', status: 'issued' },
        snapshotClientData: latestDocket?.snapshotClientData || {
          clientName: context.clientName,
          projectName: context.name,
          date: new Date().toLocaleDateString('en-IN')
        },
        org: {
          orgName: opts?.orgName || null,
          officeAddress: opts?.officeAddress || null,
          contactEmail: opts?.contactEmail || null,
          signatoryName: termsSettings?.signatory?.name || null,
          signatoryTitle: termsSettings?.signatory?.title || null
        },
        issuedOn: new Date().toISOString()
      };
    }

    case 'payment_schedule': {
      // Freeze the studio's REAL versioned schedule document, whole.
      //
      // The Payment Schedule page maintains its own versioned document under
      // `paymentSchedules[]` — that is what the studio actually drafts, and what
      // the client must be shown. The portal renders it with the very same
      // PaymentScheduleSheet component the studio page uses, so the branding,
      // the GST columns and the figures are identical on both sides.
      const schedules = (context as any).paymentSchedules || [];
      const latestSchedule = schedules.length
        ? schedules.reduce((a: any, b: any) => (a.version > b.version ? a : b))
        : null;

      // Fee bases are resolved here and frozen onto the schedule, so the sheet
      // renders real figures from the snapshot even when the live project moves on.
      const designFee =
        latestSchedule?.snapshotEngagement?.designFee ??
        ctx.engagement?.designFee ??
        context.financials?.approvedDesignValue ??
        null;
      const executionValue =
        latestSchedule?.snapshotEngagement?.executionValue ??
        ctx.engagement?.executionValue ??
        context.financials?.approvedExecutionValue ??
        null;

      const frozenSchedule = latestSchedule
        ? {
            ...JSON.parse(JSON.stringify(latestSchedule)),
            snapshotEngagement: {
              ...(latestSchedule.snapshotEngagement || {}),
              designFee,
              executionValue
            },
            docketRef:
              latestSchedule.docketRef && latestSchedule.docketRef !== '____'
                ? latestSchedule.docketRef
                : ctx.engagement?.docketRef || latestSchedule.docketRef
          }
        : null;

      return {
        ...base,
        schedule: frozenSchedule,
        // Studio identity as it stood at issue, so the letterhead is stable.
        org: {
          orgName: opts?.orgName || null,
          officeAddress: opts?.officeAddress || null,
          contactEmail: opts?.contactEmail || null,
          signatoryName: latestSchedule?.snapshotTermsConfig?.signatory?.name || null,
          signatoryTitle: latestSchedule?.snapshotTermsConfig?.signatory?.title || null
        },
        financials: {
          approvedDesignValue: designFee,
          approvedExecutionValue: executionValue
        },
        engagementDocketRef: ctx.engagement?.docketRef || null,
        gstRate: context.gstRate ?? 18,
        scheduleVersion: latestSchedule?.versionLabel || null,
        revisionNote: latestSchedule?.revisionNote || null
      };
    }

    case 'execution_agreement': {
      // Everything the shared ExecutionAgreementSheet needs, frozen — so the
      // client's copy renders the studio's real agreement, not a summary.
      const tier =
        projectData?.tiers?.find(t => t.id === context.approvedTierId) || projectData?.tiers?.[0];
      const boq: any[] = (tier as any)?.fullBoq || (tier as any)?.boq || [];

      const groupedBoq: Record<string, any[]> = {};
      boq.forEach((item: any) => {
        const room = item.roomId || item.room || item.cat || 'General Scope';
        (groupedBoq[room] = groupedBoq[room] || []).push(item);
      });

      const overrides = (context as any).executionAgreementOverrides || {};
      const designFee = ctx.engagement?.designFee ?? context.financials?.approvedDesignValue ?? 0;
      const executionTotal =
        ctx.engagement?.executionValue ??
        context.financials?.approvedExecutionValue ??
        boq.reduce((acc: number, i: any) => acc + (Number(i.total) || 0), 0);
      const gstRate = context.gstRate ?? 18;
      const gstAmount = Math.round((designFee + executionTotal) * (gstRate / 100));

      return {
        ...base,
        termsSettings,
        boq: JSON.parse(JSON.stringify(boq)),
        groupedBoq,
        boqItemSpecOverrides: (context as any).boqItemSpecOverrides || {},
        overrides,
        milestonesList: JSON.parse(JSON.stringify(context.paymentMilestones || [])),
        allAdvances: ctx.engagement?.lockedSnapshot?.advances || [],
        designFee,
        executionTotal,
        gstAmount,
        gstRate,
        grandTotal: designFee + executionTotal + gstAmount,
        agreementDate: overrides.agreementDate || null,
        dateStr:
          overrides.agreementDate ||
          new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        commencementTrigger: overrides.commencementTrigger || null,
        estimatedDuration: overrides.estimatedDuration || null,
        clientAddress: (context as any).clientAddress || null,
        clientEmail: context.clientEmail || null,
        clientPhone: context.clientPhone || null,
        org: {
          orgName: opts?.orgName || null,
          officeAddress: opts?.officeAddress || null,
          contactEmail: opts?.contactEmail || null,
          signatoryName: termsSettings?.signatory?.name || null,
          signatoryTitle: termsSettings?.signatory?.title || null
        },
        boqVersion: context.operativeBoqVersion || null,
        frozenAt: context.designApprovedAt || Date.now()
      };
    }

    case 'handover_docket': {
      const warranty = termsSettings?.warrantyPeriods || [];
      return {
        ...base,
        snagList: (ctx.snagList || []).map((sn: any) => ({
          roomId: sn.roomId || sn.location,
          title: sn.title || sn.description,
          status: sn.status
        })),
        warrantyPeriods: warranty,
        defaultWarrantyPeriod: warranty[0]?.months || 12,
        displayDate: context.handoverDate
          ? new Date(context.handoverDate).toLocaleDateString('en-IN')
          : new Date().toLocaleDateString('en-IN'),
        handoverDate: context.handoverDate || null,
        org: {
          orgName: opts?.orgName || null,
          orgLogo: (opts as any)?.orgLogo || null,
          officeAddress: opts?.officeAddress || null,
          contactEmail: opts?.contactEmail || null,
          contactPhone: (opts as any)?.contactPhone || null
        }
      };
    }

    case 'snag_list': {
      /*
        Frozen at release, like every other snapshot: the client signs the list
        as it stood, not as it looks after someone edits a row next week.
      */
      const snags = (ctx.snagList || []) as any[];
      const closed = (sn: any) => sn.status === 'resolved' || sn.status === 'verified';
      return {
        ...base,
        snags: snags.map(sn => ({
          roomName: sn.roomName || sn.roomId || 'Unassigned',
          description: sn.description || sn.title || 'Item',
          severity: sn.severity || 'medium',
          status: sn.status,
          raisedAt: sn.raisedAt || null,
          resolvedAt: sn.resolvedAt || null,
          notes: sn.notes || null,
        })),
        totalCount: snags.length,
        closedCount: snags.filter(closed).length,
        openCount: snags.filter(sn => !closed(sn)).length,
        displayDate: new Date().toLocaleDateString('en-IN'),
        org: {
          orgName: opts?.orgName || null,
          orgLogo: (opts as any)?.orgLogo || null,
          officeAddress: opts?.officeAddress || null,
          contactEmail: opts?.contactEmail || null,
        }
      };
    }

    case 'onboarding_kit': {
      const milestones = context.paymentMilestones || [];
      const designFee = ctx.engagement?.designFee ?? context.financials?.approvedDesignValue ?? 0;
      const d1 = milestones.find((m: any) => m.type === 'design');
      return {
        ...base,
        designFee,
        executionValue: ctx.engagement?.executionValue ?? context.financials?.approvedExecutionValue ?? 0,
        d1Amount: d1 ? Math.round((d1.percentage / 100) * designFee) : 0,
        docketRef: ctx.engagement?.docketRef || null,
        area: context.area || null,
        content: ctx.onboardingContent || null,
        org: {
          orgName: opts?.orgName || null,
          officeAddress: opts?.officeAddress || null,
          contactEmail: opts?.contactEmail || null
        }
      };
    }

    default:
      return { ...base };
  }
}

/** Material sections for a kind — only signable documents gate on them. */
export function buildMaterialSections(
  kind: ClientDocumentKind,
  snapshot: any
): MaterialSection[] {
  const settings: TermsSettings | null = snapshot?.termsSettings || null;

  if (kind === 'terms_docket') {
    // The docket's own clause numbering, which TermsDocketSheet anchors on.
    return deriveMaterialSections(settings?.sections);
  }

  // The agreement is its own instrument with its own articles — it does NOT
  // share the docket's clause numbering, so it cannot share its sections.
  // These refs are the article numbers ExecutionAgreementSheet renders.
  if (kind === 'execution_agreement') {
    return [
      {
        ref: '2',
        title: 'Scope of Work, BOQ, Exclusions and As-Actuals',
        plainSummary:
          'The frozen BOQ is the scope. Anything not in it is excluded, and as-actual items are measured on site and billed at the agreed rate.',
        minDwellSeconds: 10
      },
      {
        ref: '3',
        title: 'Design Deliverables, Approvals, Revisions and Change Requests',
        plainSummary:
          'What you receive, how many revisions are included, and how a change to approved scope becomes a priced change request.',
        minDwellSeconds: 8
      },
      {
        ref: '4',
        title: 'Payments, Taxes, Pause Rights and Material Ownership',
        plainSummary:
          'Every milestone is paid in advance. Unpaid milestones pause the site, and materials remain ours until paid for.',
        minDwellSeconds: 10
      },
      {
        ref: '5',
        title: 'Execution, Site Protocol, Timeline and Client Responsibilities',
        plainSummary:
          'When we start, what you must provide for us to keep working, and which delays extend the timeline.',
        minDwellSeconds: 8
      },
      {
        ref: '7',
        title: 'Completion, Handover, Snag Closure and Warranty',
        plainSummary:
          'How completion is declared, how snags are closed, and what the warranty does and does not cover.',
        minDwellSeconds: 8
      },
      {
        ref: '9',
        title: 'Termination, Liability, Indemnity, Force Majeure and Dispute Resolution',
        plainSummary:
          'What happens if either side walks away, the cap on our liability, and where a dispute is settled.',
        minDwellSeconds: 10
      }
    ];
  }

  // Sections 1-3 of HandoverDocketSheet, by their printed numbers.
  if (kind === 'handover_docket') {
    return [
      {
        ref: '1',
        title: 'Practical Completion',
        plainSummary:
          'The works are complete and accepted, subject to the snags recorded below. Signing does not waive any snag listed here.',
        minDwellSeconds: 6
      },
      {
        ref: '2',
        title: 'Closure Checklist',
        plainSummary:
          'Final settlement, defect rectification, site clearance and handover of access — confirm each one has happened.',
        minDwellSeconds: 6
      },
      {
        ref: '3',
        title: 'Warranty Certificate',
        plainSummary:
          'What the warranty covers, what it excludes, and how third-party products and appliances are handled.',
        minDwellSeconds: 8
      }
    ];
  }

  // payment_schedule and onboarding_kit are acknowledge / review documents.
  // They get no ticking ceremony, so they need no material sections — and
  // inventing one would put a reference in the rail that the sheet never
  // renders, which is exactly the "Read this section" that scrolls nowhere.
  return [];
}

// ---------------------------------------------------------------------------
// RELEASE
// ---------------------------------------------------------------------------

export interface ReleaseOptions {
  issuedBy: string;
  /** Studio letterhead, frozen into the snapshot so it never drifts. */
  org?: { orgName?: string; officeAddress?: string; contactEmail?: string };
  reference?: string;
  via?: ('portal' | 'email' | 'whatsapp')[];
  note?: string;
}

const makeReference = (kind: ClientDocumentKind, context: ProjectContext, version: number) => {
  const ctx = context as any;
  const configured =
    ctx.engagement?.lockedSnapshot?.termsSettings?.docketRefPrefix ||
    (context.termsDockets || []).slice(-1)[0]?.snapshotTermsConfig?.docketRefPrefix ||
    'FFDS';
  // The configured prefix is usually already document-specific ("FFDS-TD").
  // Strip that tail so a payment schedule does not come out as FFDS-TD-PS.
  const prefix = configured.replace(/-(TD|PS|EA|OK|HD|VO)$/i, '');
  const code: Record<string, string> = {
    terms_docket: 'TD',
    payment_schedule: 'PS',
    execution_agreement: 'EA',
    onboarding_kit: 'OK',
    handover_docket: 'HD',
    snag_list: 'SNAG'
  };
  const year = new Date().getFullYear();
  return `${prefix}-${code[kind] || 'DOC'}-${year}-${String(version).padStart(2, '0')}`;
};

/**
 * Freezes and releases one document to the client.
 *
 * Returns a context updater, so it composes with the other engines and can be
 * used inside a functional setState.
 */
export function releaseDocument(
  kind: ClientDocumentKind,
  context: ProjectContext,
  projectData: FullProjectData | undefined,
  opts: ReleaseOptions
): (prev: ProjectContext) => ProjectContext {
  const snapshot = buildSnapshot(kind, context, projectData, opts.org);
  const materialSections = buildMaterialSections(kind, snapshot);
  // Count only STORED issues, matching issueDocument. getCurrentIssue can return
  // a synthesised legacy issue, which would put the reference a version ahead of
  // the record it names.
  const stored = (context.documents?.issues || []).filter(i => i.kind === kind && !i.addendumTo);
  const nextVersion = stored.reduce((m, i) => Math.max(m, i.version), 0) + 1;
  const reference = opts.reference || makeReference(kind, context, nextVersion);

  return (prev: ProjectContext): ProjectContext => {
    const withIssue = issueDocument(kind, snapshot, {
      issuedBy: opts.issuedBy,
      reference,
      materialSections
    })(prev);

    // Stamp the delivery record onto the issue we just created.
    const state = withIssue.documents!;
    const issues = state.issues.map((i, idx) =>
      idx === state.issues.length - 1
        ? { ...i, releasedVia: opts.via || ['portal'], releaseNote: opts.note || null, reminders: [] }
        : i
    );

    return { ...withIssue, documents: { ...state, issues } };
  };
}

/** Releases several documents in one action — Terms and Payment Schedule always travel together. */
export function releasePack(
  kinds: ClientDocumentKind[],
  context: ProjectContext,
  projectData: FullProjectData | undefined,
  opts: ReleaseOptions
): (prev: ProjectContext) => ProjectContext {
  return (prev: ProjectContext): ProjectContext =>
    kinds.reduce((acc, kind) => releaseDocument(kind, acc, projectData, opts)(acc), prev);
}

/** Records a nudge against the current issue. */
export function recordReminder(
  kind: ClientDocumentKind,
  by: string,
  via: string
): (prev: ProjectContext) => ProjectContext {
  const now = Date.now();
  return (prev: ProjectContext): ProjectContext => {
    const state = prev.documents;
    if (!state) return prev;
    const current = getCurrentIssue(prev, kind);
    if (!current) return prev;
    return {
      ...prev,
      documents: {
        ...state,
        issues: state.issues.map(i =>
          i.id === current.id ? { ...i, reminders: [...(i.reminders || []), { at: now, by, via }] } : i
        )
      }
    };
  };
}

// ---------------------------------------------------------------------------
// ADDENDA — the only correct way to vary a signed document
// ---------------------------------------------------------------------------

/**
 * Issues an addendum against a SIGNED document.
 *
 * A signed document is never reopened. Its content hash, its signature and its
 * reading evidence are the record of what was agreed, and editing any of them
 * would make the whole chain worthless. An addendum is a separate, separately
 * signed instrument that names the clauses it varies — which is exactly how a
 * contract variation works on paper, and keeps both sides able to see what was
 * agreed originally and what changed since.
 */
export function issueAddendum(
  parentIssue: DocumentIssue,
  args: {
    amendsClauses: string[];
    amendmentSummary: string;
    /** The replacement wording, keyed by clause ref. */
    revisedClauses: { ref: string; title: string; before: string; after: string }[];
    issuedBy: string;
  }
): (prev: ProjectContext) => ProjectContext {
  const now = Date.now();

  const snapshot = {
    ...(parentIssue.snapshot || {}),
    addendum: {
      parentReference: parentIssue.reference,
      parentVersion: parentIssue.version,
      parentHash: parentIssue.contentHash,
      summary: args.amendmentSummary,
      revisedClauses: args.revisedClauses
    }
  };

  const materialSections: MaterialSection[] = args.revisedClauses.map(c => ({
    ref: c.ref,
    title: c.title,
    plainSummary: c.after.slice(0, 220),
    minDwellSeconds: 6
  }));

  return (prev: ProjectContext): ProjectContext => {
    const state = prev.documents || { issues: [], queries: [], lastViewedAt: {} };
    const siblings = state.issues.filter(i => i.addendumTo === parentIssue.id);

    const issue: DocumentIssue = {
      id: `di-addendum-${now}`,
      kind: parentIssue.kind,
      version: siblings.length + 1,
      reference: `${parentIssue.reference}-ADD-${String(siblings.length + 1).padStart(2, '0')}`,
      issuedAt: now,
      issuedBy: args.issuedBy,
      snapshot,
      contentHash: hashSnapshot(snapshot),
      materialSections,
      // Deliberately NOT `supersedes` — the parent stays live and signed.
      supersedes: null,
      supersededAt: null,
      addendumTo: parentIssue.id,
      amendsClauses: args.amendsClauses,
      amendmentSummary: args.amendmentSummary,
      clientSignature: null,
      counterSignature: null,
      releasedVia: ['portal'],
      reminders: []
    };

    return { ...prev, documents: { ...state, issues: [...state.issues, issue] } };
  };
}

/** Addenda hanging off a given issue, oldest first. */
export function getAddenda(context: ProjectContext, parentIssueId: string): DocumentIssue[] {
  return (context?.documents?.issues || [])
    .filter(i => i.addendumTo === parentIssueId)
    .sort((a, b) => a.issuedAt - b.issuedAt);
}

/** True when a signed document has an addendum the client has not signed. */
export function hasUnsignedAddendum(context: ProjectContext, kind: ClientDocumentKind): boolean {
  const current = getCurrentIssue(context, kind);
  if (!current) return false;
  return getAddenda(context, current.id).some(a => !a.clientSignature);
}

// ---------------------------------------------------------------------------
// ONE VOCABULARY
// ---------------------------------------------------------------------------

/**
 * What to call a document's state, in words that match what it asked for.
 *
 * The same acknowledged Payment Schedule read "Signed" in the client portal,
 * "CONFIRMED" on the studio board and "ACKNOWLEDGED BY CLIENT" on its own page.
 * Three surfaces, three vocabularies, one fact — and "Signed" was simply wrong,
 * because nobody signs an acknowledgement.
 *
 * Every surface takes its wording from here, so a state cannot be described one
 * way in the studio and another way to the client.
 */
export function documentStatusLabel(
  state: DocumentState | null | undefined,
  kind: ClientDocumentKind,
  audience: 'studio' | 'client' = 'studio',
): string {
  const mode = documentMode(kind);
  const done = mode === 'signature' ? 'Signed' : 'Acknowledged';
  const asks = mode === 'signature' ? 'sign' : 'confirm';

  switch (state) {
    case 'signed':
      return audience === 'client' ? done : `${done} by client`;
    case 'executed':
      return 'Fully executed';
    case 'queried':
      return audience === 'client' ? 'Your question is with the studio' : 'Question open';
    case 'amended':
      return audience === 'client' ? 'Updated — please review' : 'Re-issued';
    case 'viewed':
      return audience === 'client' ? 'In progress' : 'Opened, not yet ' + (mode === 'signature' ? 'signed' : 'confirmed');
    case 'issued':
      return audience === 'client' ? `Ready to read & ${asks}` : 'Sent to client';
    case 'draft':
    default:
      return audience === 'client' ? 'Not yet released' : 'Draft';
  }
}
