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

import { ProjectContext, SignoffRecord, DigitalSignatureDocket, TermsDocket } from '../types';

// ---------------------------------------------------------------------------
// MODEL
// ---------------------------------------------------------------------------

export type AgreementKind = 'terms' | 'contract' | 'handover';

/**
 * Lifecycle of a single client-facing agreement, from the client's point of view.
 * `awaiting_client` is the only state that puts a task in the client's court.
 */
export type AgreementState =
  | 'not_started'      // studio has not prepared this document yet
  | 'drafting'         // a draft exists internally, not released to the client
  | 'awaiting_client'  // released to the client — CLIENT ACTION REQUIRED
  | 'signed'           // client executed it
  | 'superseded';      // a newer revision was issued after signature

export interface AgreementStatus {
  kind: AgreementKind;
  /** Client-facing document name. */
  title: string;
  /** One-line explanation of what the client is agreeing to. */
  purpose: string;
  state: AgreementState;
  /** True only when the client themselves must act. */
  needsClientAction: boolean;
  /** True when this document should already have been signed at the current stage. */
  isOverdue: boolean;
  /** Lifecycle stage at which this document is normally executed. */
  gateStage: number;
  signedAt?: string | number | null;
  signedBy?: string | null;
  issuedAt?: string | number | null;
  reference?: string | null;
  /** Set when the studio recorded the acceptance out-of-band (WhatsApp/email/manual). */
  acceptedOffline?: boolean;
  acceptedVia?: string | null;

  // ── Offline record provenance ────────────────────────────────────────────
  // A signature taken on paper and typed in by staff is not the same thing as
  // one the client made themselves. The portal must be able to say so plainly
  // rather than dressing it up as a cryptographic seal.
  /** True when a staff member recorded this signature on the client's behalf. */
  recordedOffline?: boolean;
  recordedBy?: string | null;
  recordedAt?: string | null;
  approvalMedium?: string | null;
  /** Scan or screenshot proving the offline signature. */
  evidenceUrl?: string | null;

  /** The client has contested this record. Treated as unsigned for gates. */
  disputed?: boolean;
  disputeReason?: string | null;
  disputedAt?: string | null;
  /** The resolved record, whichever alias it came from. */
  record?: SignoffRecord | null;
  /** Human-readable reason the client cannot act yet, when state is not awaiting_client. */
  blockedReason?: string | null;
}

export interface ApprovalSnapshot {
  terms: AgreementStatus;
  contract: AgreementStatus;
  handover: AgreementStatus;
  all: AgreementStatus[];
  /** Agreements the client must sign right now. */
  actionable: AgreementStatus[];
  /** Agreements that are past their gate and still unsigned. */
  breaches: AgreementStatus[];
}

// ---------------------------------------------------------------------------
// READ SIDE — resolve one truth from every legacy alias
// ---------------------------------------------------------------------------

const asRecord = (v: any): SignoffRecord | null =>
  v && typeof v === 'object' && typeof v.status === 'string' ? (v as SignoffRecord) : null;

/** Picks the most advanced record among aliases: signed > sent > pending. */
function bestRecord(...candidates: any[]): SignoffRecord | null {
  const rank: Record<string, number> = { pending: 1, disputed: 1, sent: 2, signed: 3 };
  let best: SignoffRecord | null = null;
  for (const c of candidates) {
    const rec = asRecord(c);
    if (!rec) continue;
    if (!best || (rank[rec.status] || 0) > (rank[best.status] || 0)) best = rec;
  }
  return best;
}

/** Offline-record provenance carried on the winning signoff record. */
function offlineMeta(record: SignoffRecord | null) {
  const meta = record?.docket?.manualOverride;
  if (!meta?.isOverride) {
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
function disputeMeta(record: SignoffRecord | null) {
  const disputed = record?.status === 'disputed';
  return {
    disputed,
    disputeReason: disputed ? ((record as any)?.disputeReason || null) : null,
    disputedAt: disputed ? ((record as any)?.disputedAt || null) : null
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
const AGREEMENT_DOCUMENT_KIND: Record<AgreementKind, string> = {
  terms: 'terms_docket',
  contract: 'execution_agreement',
  handover: 'handover_docket'
};

interface IssueEvidence {
  released: boolean;
  signed: boolean;
  issuedAt: string | null;
  signedAt: string | null;
  signedBy: string | null;
  reference: string | null;
}

const NO_ISSUE: IssueEvidence = {
  released: false, signed: false, issuedAt: null,
  signedAt: null, signedBy: null, reference: null
};

function issueEvidence(context: ProjectContext, kind: AgreementKind): IssueEvidence {
  const issues = ((context as any)?.documents?.issues || []) as any[];
  const docKind = AGREEMENT_DOCUMENT_KIND[kind];

  // Withdrawn issues were retired without being signed, and an addendum is a
  // separate instrument — neither speaks for the agreement itself.
  const current = issues
    .filter(i => i && i.kind === docKind && !i.withdrawnAt && !i.addendumTo)
    .sort((a, b) => (b.version || 0) - (a.version || 0))[0];

  if (!current) return NO_ISSUE;

  const sig = current.clientSignature;
  return {
    released: true,
    signed: !!sig,
    issuedAt: current.issuedAt ? new Date(current.issuedAt).toISOString() : null,
    signedAt: sig?.signedAt || null,
    signedBy: sig?.signatoryName || null,
    reference: current.reference || null
  };
}

/** A terms docket counts as executed only when the CLIENT acknowledged it.
 *  `issued` means the studio released it — that is the opposite of signed. */
const isDocketAcknowledged = (d: any) =>
  !!d && (d.status === 'acknowledged' || d.status === 'signed');

const isDocketReleased = (d: any) =>
  !!d && (d.status === 'sent' || d.status === 'issued' || d.status === 'acknowledged' || d.status === 'signed');

function resolveTerms(context: ProjectContext, currentStage: number): AgreementStatus {
  const ctx = context as any;
  const engagement = ctx.engagement;
  const dockets: TermsDocket[] = context.termsDockets || [];

  const record = bestRecord(
    ctx.termsSignoff,
    context.designAgreementSignoff,
    ctx.proposalSignoff
  );

  const issue = issueEvidence(context, 'terms');
  const docketAcked = dockets.some(isDocketAcknowledged);
  const engagementAcked = engagement?.status === 'acknowledged';

  // A record the client has contested does not count as executed, whatever
  // the other aliases say.
  const isDisputed = record?.status === 'disputed';

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

    resolveContract and resolveHandover below now follow the same rule, for the
    same reason. `contractSigned` and `handoverComplete` look like they name the
    signature itself, but journeyEngine writes them from ops journey checklist
    steps on every load, so what they actually record is that somebody ticked a
    box on the Ops Matrix. That is worth keeping -- it is what `acceptedOffline`
    carries -- but it is not the client signing.
  */
  const signed = !isDisputed && (record?.status === 'signed' || docketAcked || engagementAcked || issue.signed);

  const released =
    record?.status === 'sent' ||
    engagement?.status === 'issued' ||
    dockets.some(isDocketReleased) ||
    !!ctx.onboardingSentAt ||
    issue.released;

  const hasDraft = dockets.length > 0 || engagement?.status === 'draft';

  let state: AgreementState = 'not_started';
  let blockedReason: string | null = 'Your studio is preparing the Terms of Engagement Docket.';

  if (signed) {
    state = 'signed';
    blockedReason = null;
    // A fresh docket issued after acknowledgement means an amendment is pending.
    const latest = dockets[dockets.length - 1];
    if (latest && !isDocketAcknowledged(latest) && isDocketReleased(latest) && dockets.length > 1) {
      state = 'superseded';
      blockedReason = null;
    }
  } else if (released) {
    state = 'awaiting_client';
    blockedReason = null;
  } else if (hasDraft) {
    state = 'drafting';
    blockedReason = 'The docket is being finalised by your studio and will be released for signature shortly.';
  }

  const latestDocket = dockets[dockets.length - 1];

  return {
    kind: 'terms',
    title: 'Terms of Engagement Docket',
    purpose: 'Confirms the design scope, fee structure, payment stages and cancellation terms of your engagement.',
    state,
    needsClientAction: state === 'awaiting_client' || state === 'superseded',
    // Overdue only once the project has moved PAST the stage this document
    // gates. Sitting at Stage 2 with unsigned terms is the normal case, not a
    // breach — Stage 3 onwards is.
    isOverdue: !signed && currentStage > 2,
    gateStage: 2,
    signedAt: record?.signedAt || issue.signedAt || engagement?.acknowledgedAt || latestDocket?.acknowledgedAt || null,
    /*
      No `context.clientName` fallback.

      Falling back to it named the client as the signatory of a document that
      was never issued and never signed -- on five projects the only evidence
      was a lifecycle gate a migration had stamped `reference: "legacy"`, and
      the screen still read "Signed by Mr Prasad & Mrs Mrunal Naik". Knowing who
      the client is is not evidence that they signed anything. With no record
      and no issue this is null, and `acceptedOffline` below says why.
    */
    signedBy: record?.signedBy || record?.clientName || issue.signedBy || null,
    issuedAt: record?.sentAt || engagement?.issuedAt || latestDocket?.sentAt || latestDocket?.generatedAt || issue.issuedAt || null,
    reference: engagement?.docketRef || latestDocket?.docketRef || record?.refId || issue.reference || null,
    acceptedOffline: !record && (engagementAcked || docketAcked),
    acceptedVia: engagement?.acknowledgedVia || null,
    ...offlineMeta(record),
    ...disputeMeta(record),
    record,
    blockedReason
  };
}

function resolveContract(context: ProjectContext, currentStage: number): AgreementStatus {
  const ctx = context as any;

  const record = bestRecord(
    ctx.executionSignoff,
    ctx.executionAgreementSignoff,
    ctx.contractSignoff
  );

  const issue = issueEvidence(context, 'contract');
  const gateDone = !!context.lifecycle?.gates?.contractSigned?.done;
  const executed = ctx.contractStatus === 'executed';

  /*
    A lifecycle gate is not a signature.

    `lifecycle.gates.*` is written by journeyEngine from the ops journey
    checklist -- tick "Agreement signed" on the Ops Matrix and the gate is set,
    with `reference: "auto-sync-journey"`, on every load. Treating that as proof
    of signature made the Documents board and the client's own portal both read
    "Signed" for a document that had never been issued, never released and never
    signed by anybody. Clearing the gate did not help: the journey rewrote it
    the next time the project was opened.

    The tick still means something -- the studio considers this settled -- and
    that is what `acceptedOffline` below carries. What it cannot do is stand in
    for the client's signature.

    A real signoff record, a signature on an issued document, or an explicit
    contract status still count, because each of those is somebody asserting
    the thing itself rather than ticking a step next to it.
  */
  const isDisputed = record?.status === 'disputed';
  const signed = !isDisputed && (record?.status === 'signed' || executed || issue.signed);
  const released = record?.status === 'sent' || issue.released;
  const hasDraft = !!context.contractContent || !!context.approvedTierId || !!context.operativeBoqVersion;

  let state: AgreementState = 'not_started';
  let blockedReason: string | null =
    'The Master Execution Agreement is drawn up once your design and BOQ are approved and frozen.';

  if (signed) {
    state = 'signed';
    blockedReason = null;
  } else if (released) {
    state = 'awaiting_client';
    blockedReason = null;
  } else if (hasDraft) {
    state = 'drafting';
    blockedReason = 'Your studio is finalising the frozen BOQ and contract schedule before release.';
  }

  return {
    kind: 'contract',
    title: 'Master Execution Agreement',
    purpose: 'Locks the frozen BOQ, site programme, defect liability period and on-site execution protocols.',
    state,
    needsClientAction: state === 'awaiting_client',
    // Stage 5 means site work has started without an executed contract.
    isOverdue: !signed && currentStage > 4,
    gateStage: 4,
    signedAt: record?.signedAt || issue.signedAt || context.lifecycle?.gates?.contractSigned?.at || null,
    /*
      No `context.clientName` fallback.

      Falling back to it named the client as the signatory of a document that
      was never issued and never signed -- on five projects the only evidence
      was a lifecycle gate a migration had stamped `reference: "legacy"`, and
      the screen still read "Signed by Mr Prasad & Mrs Mrunal Naik". Knowing who
      the client is is not evidence that they signed anything. With no record
      and no issue this is null, and `acceptedOffline` below says why.
    */
    signedBy: record?.signedBy || record?.clientName || issue.signedBy || null,
    issuedAt: record?.sentAt || issue.issuedAt || null,
    reference: record?.refId || issue.reference || null,
    acceptedOffline: !record && (gateDone || executed),
    acceptedVia: null,
    ...offlineMeta(record),
    ...disputeMeta(record),
    record,
    blockedReason
  };
}

function resolveHandover(context: ProjectContext, currentStage: number): AgreementStatus {
  const ctx = context as any;

  const record = bestRecord(ctx.handoverSignoff, ctx.handoverDocketSignoff);

  const issue = issueEvidence(context, 'handover');
  const gateDone = !!context.lifecycle?.gates?.handoverComplete?.done;
  const isDisputed = record?.status === 'disputed';
  /* Same rule as the contract: the journey gate is not a signature. A recorded
     handover DATE is a fact about the job rather than a tick, so it stays. */
  const signed = !isDisputed && (record?.status === 'signed' || !!context.handoverDate || issue.signed);
  const released = record?.status === 'sent' || issue.released;

  let state: AgreementState = 'not_started';
  let blockedReason: string | null =
    'Issued after the joint snag walk-through, once all finishing works are signed off on site.';

  if (signed) {
    state = 'signed';
    blockedReason = null;
  } else if (released) {
    state = 'awaiting_client';
    blockedReason = null;
  } else if (currentStage >= 6) {
    state = 'drafting';
    blockedReason = 'Your studio is compiling the snag closure report and warranty dossier.';
  }

  return {
    kind: 'handover',
    title: 'Handover & Acceptance Docket',
    purpose: 'Records snag closure, key handover, warranty activation and final project acceptance.',
    state,
    needsClientAction: state === 'awaiting_client',
    isOverdue: false, // handover is never "late" from the client's side
    gateStage: 6,
    signedAt: record?.signedAt || issue.signedAt || context.handoverDate || null,
    /*
      No `context.clientName` fallback.

      Falling back to it named the client as the signatory of a document that
      was never issued and never signed -- on five projects the only evidence
      was a lifecycle gate a migration had stamped `reference: "legacy"`, and
      the screen still read "Signed by Mr Prasad & Mrs Mrunal Naik". Knowing who
      the client is is not evidence that they signed anything. With no record
      and no issue this is null, and `acceptedOffline` below says why.
    */
    signedBy: record?.signedBy || record?.clientName || issue.signedBy || null,
    issuedAt: record?.sentAt || issue.issuedAt || null,
    reference: record?.refId || issue.reference || null,
    acceptedOffline: !record && (gateDone || !!context.handoverDate),
    acceptedVia: null,
    ...offlineMeta(record),
    ...disputeMeta(record),
    record,
    blockedReason
  };
}

/**
 * Resolves every client agreement from the project context.
 * `currentStage` is used only to decide whether an unsigned document is overdue.
 */
export function resolveApprovals(context: ProjectContext, currentStage: number): ApprovalSnapshot {
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

/** Convenience booleans for callers that only need the headline. */
export function isSigned(context: ProjectContext, kind: AgreementKind): boolean {
  const snap = resolveApprovals(context, 1);
  return snap[kind].state === 'signed';
}

// ---------------------------------------------------------------------------
// WRITE SIDE — one signature, every alias updated
// ---------------------------------------------------------------------------

export interface SignoffOrigin {
  /** Where the signature was captured. */
  surface: 'client_portal' | 'signoff_link' | 'studio_manual';
  /** Set when the studio recorded an out-of-band acceptance. */
  via?: 'WhatsApp' | 'email' | null;
}

/**
 * Builds a context patch that records a signature across EVERY field family the
 * app reads, so the studio workspace and the client portal can never disagree.
 *
 * Returns a function so callers can use it inside a functional setState and
 * merge against the freshest context rather than a captured stale one.
 */
export function buildSignoffPatch(
  kind: AgreementKind,
  docket: DigitalSignatureDocket,
  origin: SignoffOrigin = { surface: 'client_portal' }
): (prev: ProjectContext) => ProjectContext {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const record: SignoffRecord = {
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

  return (prev: ProjectContext): ProjectContext => {
    const base = prev || ({} as ProjectContext);
    const prevAny = base as any;
    const lifecycle = base.lifecycle || ({} as any);
    const gates = lifecycle.gates || ({} as any);

    if (kind === 'terms') {
      const existing = base.termsDockets || [];
      // Acknowledge the newest released docket; create one if the studio never
      // generated it (e.g. an offline engagement being formalised in-portal).
      let updatedDockets: TermsDocket[];
      if (existing.length > 0) {
        const lastIdx = existing.length - 1;
        updatedDockets = existing.map((d, i) =>
          i === lastIdx
            ? ({ ...d, status: 'acknowledged' as const, acknowledgedAt: nowMs, docket } as any)
            : d
        );
      } else {
        updatedDockets = [
          {
            id: `td-${nowMs}`,
            docketRef: prevAny.engagement?.docketRef || `FFDS-TD-${new Date().getFullYear()}-${String(nowMs).slice(-3)}`,
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
          } as any
        ];
      }

      return {
        ...base,
        // every alias the codebase reads
        termsSignoff: record,
        designAgreementSignoff: record,
        proposalSignoff: prevAny.proposalSignoff || record,
        termsDockets: updatedDockets,
        // the studio-side engagement record — this is what unlocks the
        // Payment Calculator and the Engagement Lifecycle widget
        engagement: {
          ...(prevAny.engagement || {
            designFee: null,
            executionValue: null,
            docketRef: null,
            termsVersion: null,
            paymentScheduleVersion: null,
            lockedSnapshot: null
          }),
          status: 'acknowledged',
          acknowledgedAt: nowMs,
          acknowledgedVia: origin.via || (origin.surface === 'client_portal' ? 'email' : null)
        },
        lifecycle: {
          ...lifecycle,
          gates: {
            ...gates,
            proposalAccepted: { done: true, at: nowMs, reference: docket.docketHash }
          }
        }
      } as ProjectContext;
    }

    if (kind === 'contract') {
      return {
        ...base,
        executionSignoff: record,             // studio ExecutionAgreementPage
        executionAgreementSignoff: record,    // client portal engine
        contractSignoff: record,              // dbService / ProjectListTab
        contractStatus: 'executed',
        lifecycle: {
          ...lifecycle,
          gates: {
            ...gates,
            contractSigned: { done: true, at: nowMs, reference: docket.docketHash }
          }
        }
      } as ProjectContext;
    }

    // handover
    return {
      ...base,
      handoverSignoff: record,
      handoverDocketSignoff: record,
      status: 'completed',
      handoverDate: nowMs,
      lifecycle: {
        ...lifecycle,
        stage: Math.max(6, lifecycle.stage || 0),
        gates: {
          ...gates,
          handoverComplete: { done: true, at: nowMs, reference: docket.docketHash }
        }
      }
    } as ProjectContext;
  };
}


/**
 * The client contests a sign-off recorded on their behalf.
 *
 * This is the control that makes manual override safe to offer at all. Studio
 * staff can mark a client's agreement as signed; without a client-side way to
 * say "that isn't right", the feature is an integrity hole. With one, the
 * record is stronger than a paper file — the client has seen it, and their
 * silence is itself evidence.
 */
export function buildDisputePatch(
  kind: AgreementKind,
  reason: string,
  raisedBy: string
): (prev: ProjectContext) => ProjectContext {
  const nowIso = new Date().toISOString();

  const disputeOn = (existing: any) => ({
    ...(existing || {}),
    status: 'disputed' as const,
    disputeReason: reason,
    disputedAt: nowIso,
    disputedBy: raisedBy
  });

  return (prev: ProjectContext): ProjectContext => {
    const base = prev || ({} as ProjectContext);
    const prevAny = base as any;
    const lifecycle = base.lifecycle || ({} as any);
    const gates = lifecycle.gates || ({} as any);

    if (kind === 'terms') {
      return {
        ...base,
        termsSignoff: disputeOn(prevAny.termsSignoff || base.designAgreementSignoff),
        designAgreementSignoff: disputeOn(base.designAgreementSignoff || prevAny.termsSignoff),
        engagement: prevAny.engagement
          ? { ...prevAny.engagement, status: 'issued', acknowledgedAt: null, acknowledgedVia: null }
          : prevAny.engagement,
        termsDockets: (base.termsDockets || []).map((d, i, arr) =>
          i === arr.length - 1 ? ({ ...d, status: 'sent' as const, acknowledgedAt: null } as any) : d
        ),
        lifecycle: {
          ...lifecycle,
          gates: { ...gates, proposalAccepted: { done: false, at: null, reference: null } }
        }
      } as ProjectContext;
    }

    if (kind === 'contract') {
      return {
        ...base,
        executionSignoff: disputeOn(prevAny.executionSignoff),
        executionAgreementSignoff: disputeOn(prevAny.executionAgreementSignoff),
        contractSignoff: disputeOn(base.contractSignoff),
        contractStatus: 'disputed',
        lifecycle: {
          ...lifecycle,
          gates: { ...gates, contractSigned: { done: false, at: null, reference: null } }
        }
      } as ProjectContext;
    }

    return {
      ...base,
      handoverSignoff: disputeOn(prevAny.handoverSignoff),
      handoverDocketSignoff: disputeOn(prevAny.handoverDocketSignoff),
      handoverDate: undefined,
      lifecycle: {
        ...lifecycle,
        gates: { ...gates, handoverComplete: { done: false, at: null, reference: null } }
      }
    } as ProjectContext;
  };
}
