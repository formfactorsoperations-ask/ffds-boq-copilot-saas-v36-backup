/**
 * CLIENT PORTAL ENGINE
 *
 * Turns raw project context into everything the client portal shows:
 * where the project actually is, what the client must do, what the studio owes
 * them next, and where the paperwork has fallen behind the site.
 *
 * Design rules this engine follows:
 *
 *  1. EVIDENCE OVER DECLARATION. `lifecycle.stage` is an internal field that
 *     drifts. The stage shown to a client is derived from things that actually
 *     happened (signatures, payments, drawings, site logs) and a declared stage
 *     can only ever raise it — never hide a gate that was skipped.
 *
 *  2. AN ITEM IS ONLY "CLIENT ACTION" IF THE CLIENT CAN ACT ON IT. Material
 *     selections sitting at the vendor, invoices not yet raised and unreleased
 *     dockets belong to the studio. They appear as "with the studio", never as
 *     a task on the client's list.
 *
 *  3. UNSIGNED PAPERWORK IS ALWAYS VISIBLE. An agreement the studio has
 *     released is actionable regardless of which stage the project claims to
 *     be at, and is escalated to critical once the project passes its gate.
 */

import { ProjectContext, FullProjectData, PaymentMilestone } from '../types';
import { formatINR } from '../lib/utils';
import {
  resolveApprovals,
  ApprovalSnapshot,
  AgreementStatus,
  AgreementKind
} from './clientApprovalEngine';
import { getQueries } from './documentQueryEngine';
import { agreementKindFor } from './documentIssueEngine';

export type { AgreementStatus, AgreementKind, ApprovalSnapshot } from './clientApprovalEngine';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface ClientLifecycleStage {
  id: number;
  stageNumber: number;
  name: string;
  title: string;
  shortName: string;
  subtitle: string;
  description: string;
  status: 'completed' | 'active' | 'pending';
  isCurrent: boolean;
  completedAt?: string | null;
  deliverables: string[];
  clientDeliverable: string;
  clientCheckpoints: string[];
  gateRequirement: string;
  progressPercent: number;
  /** True when the project moved past this stage without its gate being signed. */
  gateBreached: boolean;
  /** Plain-English note shown under a breached or active stage. */
  gateNote?: string | null;
  /** What the client can point at as proof this stage happened. */
  evidence: string[];
}

export type ActionOwner = 'client' | 'studio';

export interface ClientActionItem {
  id: string;
  category: 'agreement' | 'payment' | 'material' | 'decision' | 'variation';
  severity: 'critical' | 'high' | 'medium';
  /** Whose court the ball is in. Only `client` items are tasks for the client. */
  owner: ActionOwner;
  title: string;
  subtitle: string;
  description: string;
  amount?: number;
  targetTab: 'overview' | 'approvals' | 'decisions' | 'designs' | 'materials' | 'scope' | 'financials' | 'feed' | 'roadmap';
  actionLabel: string;
  actionType:
    | 'sign_terms'
    | 'sign_contract'
    | 'sign_handover'
    | 'pay_milestone'
    | 'approve_material'
    | 'confirm_decision'
    | 'review_variation';
  actionPayload?: any;
  date?: string | number;
  statusBadge: string;
  /** Why this matters — what it unblocks downstream. */
  consequence?: string;
  /** Set on studio-owned items: what the client is waiting for. */
  waitingOn?: string;
}

export interface UpcomingStepItem {
  id: string;
  phaseId: number;
  title: string;
  description: string;
  owner: string;
  responsible?: string;
  iconType: 'design' | 'site' | 'procurement' | 'quality' | 'document';
  estimatedTimeline?: string;
  expectedTimeframe?: string;
  /** True when this step is blocked by an open client action. */
  blocked?: boolean;
  blockedBy?: string;
}

export interface ClientLifecycleSummary {
  stages: ClientLifecycleStage[];
  currentStageNumber: number;
  currentStageName: string;
  currentStageSubtitle: string;
  overallProgressPercent: number;
  /** Stage the project context claims to be at, before evidence correction. */
  declaredStageNumber: number;
  /** True when the declared stage ran ahead of the signed paperwork. */
  hasGateBreach: boolean;
  approvals: ApprovalSnapshot;
  termsDocketSigned: boolean;
  contractSigned: boolean;
  handoverSigned: boolean;
  /** One-line status sentence suitable for the portal header. */
  headline: string;
}

export interface ClientActionSummary {
  allActions: ClientActionItem[];
  /** Items the client must act on. This is the number that belongs on a badge. */
  clientActions: ClientActionItem[];
  /** Items sitting with the studio, shown to the client as visibility, not tasks. */
  studioActions: ClientActionItem[];
  criticalActions: ClientActionItem[];
  agreementsPending: ClientActionItem[];
  paymentsPending: ClientActionItem[];
  materialsPending: ClientActionItem[];
  decisionsPending: ClientActionItem[];
  variationsPending: ClientActionItem[];
  totalAmountDue: number;
}

// ---------------------------------------------------------------------------
// STAGE DERIVATION
// ---------------------------------------------------------------------------

interface StageEvidence {
  stage: number;
  evidence: string[];
}

const isTruthyDate = (v: any) => v !== undefined && v !== null && v !== '' && v !== 0;

/**
 * Derives the stage from things that verifiably happened, and collects the
 * evidence string for each stage so the portal can show the client *why* it
 * says what it says.
 */
function deriveStageFromEvidence(context: ProjectContext, approvals: ApprovalSnapshot): StageEvidence {
  const ctx = context as any;
  const evidence: string[] = [];
  let stage = 1;

  const status = String(context.status || '').toLowerCase();
  const milestones = context.paymentMilestones || [];
  const paidDesign = milestones.filter(m => m.type === 'design' && m.status === 'paid');
  const paidExecution = milestones.filter(m => m.type === 'execution' && m.status === 'paid');

  // Stage 1 — always reached.
  evidence.push('Project brief opened');

  // Stage 2 — Scope & Terms: paperwork is actively awaiting client or has been signed, or brief was frozen
  if (
    approvals.terms.state === 'awaiting_client' ||
    approvals.terms.state === 'signed' ||
    isTruthyDate(ctx.onboardingSentAt) ||
    isTruthyDate(context.briefFrozenAt)
  ) {
    stage = 2;
    if (isTruthyDate(context.briefFrozenAt)) evidence.push('Brief frozen');
    if (approvals.terms.state === 'awaiting_client' || approvals.terms.state === 'signed') {
      evidence.push('Terms docket issued');
    }
  }

  // Stage 3 — Design development: terms signed or design fee received
  if (approvals.terms.state === 'signed' || paidDesign.length > 0) {
    stage = Math.max(stage, 3);
    if (approvals.terms.state === 'signed') evidence.push('Terms of Engagement signed');
    if (paidDesign.length > 0) evidence.push(`${paidDesign.length} design milestone(s) cleared`);
  }

  // Stage 4 — Scope freeze & contract: design approved or execution contract released/signed
  if (
    isTruthyDate(context.designApprovedAt) ||
    approvals.contract.state === 'awaiting_client' ||
    approvals.contract.state === 'signed'
  ) {
    stage = Math.max(stage, 4);
    if (isTruthyDate(context.designApprovedAt)) evidence.push('Design approved');
    if (approvals.contract.state === 'awaiting_client') evidence.push('Execution agreement released');
    if (approvals.contract.state === 'signed') evidence.push('Execution agreement signed');
  }

  // Stage 5 — Site execution: contract signed and in execution status, or execution advance paid
  if (
    status === 'execution' ||
    (approvals.contract.state === 'signed' && (paidExecution.length > 0 || (context.siteUpdates?.length || 0) > 0)) ||
    (paidExecution.length > 0 && status !== 'lead' && status !== 'draft' && status !== 'new_lead')
  ) {
    stage = Math.max(stage, 5);
    if (approvals.contract.state === 'signed') evidence.push('Execution agreement signed');
    if (paidExecution.length > 0) evidence.push(`${paidExecution.length} execution advance(s) received`);
    if (status === 'execution') evidence.push('Site execution active');
  }

  // Stage 6 — Handover: project completed or handover document signed
  const handoverAdvancePaid = milestones.some(m => (m as any).isHandoverAdvance && m.status === 'paid');
  if (
    approvals.handover.state === 'signed' ||
    approvals.handover.state === 'awaiting_client' ||
    isTruthyDate(context.handoverDate) ||
    status === 'completed' ||
    (status === 'execution' && handoverAdvancePaid)
  ) {
    stage = Math.max(stage, 6);
    if (approvals.handover.state === 'signed') evidence.push('Handover document signed');
    if (handoverAdvancePaid) evidence.push('Handover advance received');
    if (isTruthyDate(context.handoverDate)) evidence.push('Handover completed');
  }

  return { stage, evidence };
}

/** The stage the project context *claims*, from either lifecycle model. */
function declaredStage(context: ProjectContext): number {
  const lifecycleStage = context.lifecycle?.stage;
  if (typeof lifecycleStage === 'number' && lifecycleStage >= 1 && lifecycleStage <= 6) {
    return lifecycleStage;
  }

  const status = String(context.status || '').toLowerCase();
  if (status === 'completed') return 6;
  if (status === 'execution' || status === 'work_paused') return 5;
  if (status === 'won') return 4;
  if (status === 'proposal_sent' || status === 'negotiation') return 3;
  if (status === 'lead' || status === 'new_lead' || status === 'draft') return 1;

  if ((context as any).currentStage) {
    return Math.min(6, Math.max(1, (context as any).currentStage));
  }
  return 1;
}

/**
 * The stage number the client is shown. Evidence and declaration are reconciled.
 */
export function getAccurateStageNumber(context: ProjectContext): number {
  if (!context) return 1;
  const approvals = resolveApprovals(context, 1);
  const derived = deriveStageFromEvidence(context, approvals);
  const declared = declaredStage(context);
  
  const status = String(context.status || '').toLowerCase();
  if (status === 'lead' || status === 'new_lead' || status === 'draft') {
    return Math.min(2, Math.max(1, declared));
  }
  
  if (context.lifecycle?.stage) {
    return Math.min(6, Math.max(1, context.lifecycle.stage));
  }
  
  return Math.max(derived.stage, declared);
}

// ---------------------------------------------------------------------------
// STAGE DEFINITIONS
// ---------------------------------------------------------------------------

interface StageDefinition {
  id: number;
  name: string;
  shortName: string;
  subtitle: string;
  description: string;
  deliverables: string[];
  clientDeliverable: string;
  clientCheckpoints: string[];
  gateRequirement: string;
  /** Agreement that must be executed to legitimately leave this stage. */
  exitGate?: AgreementKind;
}

const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    id: 1,
    name: 'Initial Consultation & Brief',
    shortName: '1. Brief & Discovery',
    subtitle: 'Space planning, brief capture & budget alignment',
    description: 'Space planning, lifestyle brief capture & preliminary budget alignment.',
    deliverables: ['Client brief questionnaire', 'Site carpet measurement', 'Preliminary scope range'],
    clientDeliverable: 'Client brief questionnaire & laser site measurements',
    clientCheckpoints: ['Brief sign-off', 'Site survey access'],
    gateRequirement: 'Brief Sign-off Gate'
  },
  {
    id: 2,
    name: 'Scope & Design Strategy',
    shortName: '2. Scope & Terms',
    subtitle: '2D layout planning & engagement terms acknowledgement',
    description: '2D furniture layout planning, engagement terms docket & design fee sign-up.',
    deliverables: ['Optimized furniture layouts', 'Engagement Terms Docket', 'Design fee milestone plan'],
    clientDeliverable: 'Optimized 2D furniture layouts & Terms Docket',
    clientCheckpoints: ['Terms Docket signature', 'D1 Design Advance'],
    gateRequirement: 'Terms of Engagement Sign-off',
    exitGate: 'terms'
  },
  {
    id: 3,
    name: 'Proposal & 3D Concepts',
    shortName: '3. 3D & Selections',
    subtitle: 'Photorealistic 3D renders & material moodboards',
    description: 'Photorealistic 3D perspectives, finish selections & preliminary BOQ.',
    deliverables: ['3D Views per room', 'Material finish specifications', 'Itemized preliminary BOQ'],
    clientDeliverable: 'Photorealistic 3D renders & material moodboards',
    clientCheckpoints: ['3D view approvals', 'Finish palette lock', 'D2 Fee clearance'],
    gateRequirement: 'Design Concept Approval'
  },
  {
    id: 4,
    name: 'Agreement & Design Complete',
    shortName: '4. Scope Freeze & Contract',
    subtitle: 'BOQ scope freeze, Master Execution Agreement & procurement lock',
    description: 'Atomic Design Complete Gate: frozen BOQ, Master Execution Agreement & E1 advance.',
    deliverables: ['Final Frozen BOQ', 'Master Execution Agreement', 'Gantt execution schedule'],
    clientDeliverable: 'Final Frozen BOQ & Master Execution Agreement',
    clientCheckpoints: ['Execution Contract signature', 'E1 Material Advance'],
    gateRequirement: 'Master Execution Contract Gate',
    exitGate: 'contract'
  },
  {
    id: 5,
    name: 'Site Execution & Fit-Out',
    shortName: '5. Site Execution',
    subtitle: 'Civil, MEP, modular joinery, false ceiling & finishes',
    description: 'Active turnkey execution: civil, MEP, factory modular assembly, painting & QA checks.',
    deliverables: ['Weekly site photo logs', 'MOM audit records', 'Quality assurance checks'],
    clientDeliverable: 'Weekly site photo updates & quality milestone logs',
    clientCheckpoints: ['E2/E3 Progress advances', 'On-site finish approvals'],
    gateRequirement: 'Execution Milestones'
  },
  {
    id: 6,
    name: 'Handover & Closeout',
    shortName: '6. Handover & Snag',
    subtitle: 'Joint snag list resolution, warranty docket & key handover',
    description: 'Joint snag resolution, key handover, warranty certificate & final closeout.',
    deliverables: ['Final inspection report', 'Warranty certificate dossier', 'As-built documentation'],
    clientDeliverable: 'Warranty Certificate Dossier & Key Handover',
    clientCheckpoints: ['Final snag walk-through', 'Handover Docket signature', 'Final settlement'],
    gateRequirement: 'Handover & Warranty Gate',
    exitGate: 'handover'
  }
];

// ---------------------------------------------------------------------------
// LIFECYCLE PIPELINE
// ---------------------------------------------------------------------------

/** Real completion of the active stage, measured against its own deliverables. */
function activeStageProgress(
  stageId: number,
  context: ProjectContext,
  approvals: ApprovalSnapshot
): number {
  const ctx = context as any;
  const milestones = context.paymentMilestones || [];

  // Check if journey phase progress from the ops checklist is available
  const phase = context.journeySummary?.phaseProgress?.[stageId - 1];
  if (phase && phase.total > 0) {
    const pct = typeof (phase as any).pct === 'number' ? (phase as any).pct : Math.round((phase.done / phase.total) * 100);
    return Math.min(100, Math.max(0, pct));
  }

  switch (stageId) {
    case 1: {
      let score = 0;
      if (context.name && context.name !== 'New Project') score += 25;
      if ((context.rooms?.length || 0) > 0) score += 25;
      if (isTruthyDate(context.briefFrozenAt)) score += 25;
      if (approvals.terms.state !== 'not_started') score += 25;
      return Math.min(100, Math.max(0, score));
    }
    case 2: {
      let score = 0;
      if (approvals.terms.state !== 'not_started') score += 25;
      if (approvals.terms.state === 'awaiting_client') score += 25;
      if (approvals.terms.state === 'signed') score += 30;
      if (milestones.some(m => m.type === 'design' && m.status === 'paid')) score += 20;
      return Math.min(100, Math.max(0, score));
    }
    case 3: {
      const designDocs = context.designDocuments?.length || 0;
      const selections = context.materialSelections?.length || 0;
      const lockedSelections = (context.materialSelections || []).filter(
        m => m.status === 'locked' || m.status === 'approved' || m.status === 'ordered'
      ).length;
      let score = 0;
      if (designDocs > 0) score += 30;
      if (selections > 0) score += 20;
      if (selections > 0 && lockedSelections > 0) score += Math.round((lockedSelections / selections) * 25);
      if (isTruthyDate(context.designApprovedAt)) score += 25;
      return Math.min(100, Math.max(0, score));
    }
    case 4: {
      let score = 0;
      if (context.boqFrozen || context.operativeBoqVersion) score += 30;
      if (approvals.contract.state === 'awaiting_client') score += 30;
      if (approvals.contract.state === 'signed') score += 25;
      if (milestones.some(m => m.type === 'execution' && m.status === 'paid')) score += 15;
      return Math.min(100, Math.max(0, score));
    }
    case 5: {
      const roomProgress = context.weeklyRoomProgress || {};
      const values: number[] = [];
      Object.values(roomProgress).forEach(stages => {
        Object.values(stages || {}).forEach((s: any) => {
          if (typeof s?.progress === 'number' && s.progress > 0) values.push(s.progress);
        });
      });
      if (values.length > 0) {
        return Math.min(100, Math.max(0, Math.round(values.reduce((a, b) => a + b, 0) / values.length)));
      }
      const logs = (context.siteUpdates?.length || 0) + (context.projectUpdates?.length || 0);
      return Math.min(100, Math.max(0, logs > 0 ? Math.min(90, logs * 10) : 0));
    }
    case 6: {
      const snags = ctx.snagList || [];
      const closed = snags.filter((s: any) => s.status === 'closed' || s.status === 'resolved').length;
      let score = 0;
      if (snags.length > 0) score += Math.round((closed / snags.length) * 40);
      if (approvals.handover.state === 'awaiting_client') score += 30;
      if (approvals.handover.state === 'signed') return 100;
      if (isTruthyDate(context.handoverDate)) score += 30;
      return Math.min(100, Math.max(0, score));
    }
    default:
      return 0;
  }
}

export function calculateClientLifecycleStages(context: ProjectContext): ClientLifecycleSummary {
  const safeContext = context || ({} as ProjectContext);

  const currentStage = getAccurateStageNumber(safeContext);
  const declared = declaredStage(safeContext);
  const derived = deriveStageFromEvidence(safeContext, resolveApprovals(safeContext, 1));

  const approvals = resolveApprovals(safeContext, currentStage);

  const termsDocketSigned = approvals.terms.state === 'signed';
  const contractSigned = approvals.contract.state === 'signed';
  const handoverSigned = approvals.handover.state === 'signed';

  const stages: ClientLifecycleStage[] = STAGE_DEFINITIONS.map(def => {
    let status: 'completed' | 'active' | 'pending' = 'pending';
    let progressPercent = 0;

    if (def.id < currentStage) {
      status = 'completed';
      progressPercent = 100;
    } else if (def.id === currentStage) {
      status = 'active';
      progressPercent = activeStageProgress(def.id, safeContext, approvals);
      if (def.id === 6 && handoverSigned) progressPercent = 100;
    }

    // A stage is breached when the project has moved past it but the agreement
    // that gates it was never executed.
    const gate = def.exitGate ? approvals[def.exitGate] : null;
    const gateBreached = !!gate && gate.state !== 'signed' && def.id < currentStage;

    // A passed stage whose gate was never executed is not fully complete.
    if (gateBreached) progressPercent = 85;

    let gateNote: string | null = null;
    if (gate) {
      if (gate.state === 'signed') {
        gateNote = null;
      } else if (gateBreached) {
        gateNote = `${gate.title} is still unsigned — this stage advanced without its sign-off.`;
      } else if (status === 'active' && gate.state === 'awaiting_client') {
        gateNote = `${gate.title} is ready for your signature.`;
      } else if (status === 'active' && gate.blockedReason) {
        gateNote = gate.blockedReason;
      }
    }

    return {
      id: def.id,
      stageNumber: def.id,
      name: def.name,
      title: def.name,
      shortName: def.shortName,
      subtitle: def.subtitle,
      description: def.description,
      status,
      isCurrent: def.id === currentStage,
      deliverables: def.deliverables,
      clientDeliverable: def.clientDeliverable,
      clientCheckpoints: def.clientCheckpoints,
      gateRequirement: def.gateRequirement,
      progressPercent,
      gateBreached,
      gateNote,
      evidence: def.id <= currentStage ? derived.evidence : []
    };
  });

  const completedCount = stages.filter(s => s.status === 'completed').length;
  const activeStage = stages.find(s => s.status === 'active');
  const perStage = 100 / STAGE_DEFINITIONS.length;
  const calculatedProgress = Math.min(
    100,
    Math.round(completedCount * perStage + ((activeStage?.progressPercent || 0) / 100) * perStage)
  );

  const journeyPct = safeContext.journeySummary?.pct;
  const overallProgressPercent = (typeof journeyPct === 'number' && journeyPct > 0 && journeyPct <= 100)
    ? journeyPct
    : calculatedProgress;

  const current = stages.find(s => s.isCurrent) || stages[0];
  const hasGateBreach = stages.some(s => s.gateBreached);

  let headline: string;
  if (handoverSigned) {
    headline = 'Project handed over and in warranty.';
  } else if (approvals.actionable.length > 0) {
    headline = `${approvals.actionable[0].title} is awaiting your signature.`;
  } else if (hasGateBreach) {
    const breach = approvals.breaches[0];
    headline = breach
      ? `Site work is progressing, but ${breach.title} has not been signed yet.`
      : `Stage ${currentStage}: ${current.name}.`;
  } else {
    headline = `Stage ${currentStage} of 6 — ${current.name}.`;
  }

  return {
    stages,
    currentStageNumber: currentStage,
    currentStageName: current.name,
    currentStageSubtitle: current.subtitle,
    overallProgressPercent,
    declaredStageNumber: declared,
    hasGateBreach,
    approvals,
    termsDocketSigned,
    contractSigned,
    handoverSigned,
    headline
  };
}

// ---------------------------------------------------------------------------
// ACTION ITEMS
// ---------------------------------------------------------------------------

/** Material statuses that genuinely sit in the client's court. */
const CLIENT_PENDING_MATERIAL_STATUSES = new Set([
  'sent_for_approval',
  'pending_approval',
  'change_requested'
]);

/** Material statuses that mean the selection is settled. */
const SETTLED_MATERIAL_STATUSES = new Set(['locked', 'approved', 'ordered']);

const AGREEMENT_ACTION_TYPE: Record<AgreementKind, ClientActionItem['actionType']> = {
  terms: 'sign_terms',
  contract: 'sign_contract',
  handover: 'sign_handover'
};

const AGREEMENT_CONSEQUENCE: Record<AgreementKind, string> = {
  terms: 'Unblocks the design phase, your design fee schedule and studio resource allocation.',
  contract: 'Releases material procurement, factory slots and the confirmed site start date.',
  handover: 'Activates your warranty cover and closes the project formally.'
};

function agreementActions(approvals: ApprovalSnapshot): ClientActionItem[] {
  const items: ClientActionItem[] = [];

  approvals.all.forEach(agreement => {
    // Signed — nothing to do.
    if (agreement.state === 'signed') return;

    const isClientTurn = agreement.needsClientAction;

    // Documents the studio has not started are not action items at all — the
    // Agreement Ledger already shows the client the full sequence and where
    // each document sits. Listing them here would inflate the counts with
    // paperwork nobody can act on yet.
    if (!isClientTurn && agreement.state !== 'drafting') return;

    items.push({
      id: `action-agreement-${agreement.kind}`,
      category: 'agreement',
      severity: agreement.isOverdue || isClientTurn ? 'critical' : 'medium',
      owner: isClientTurn ? 'client' : 'studio',
      title: isClientTurn ? `Sign ${agreement.title}` : agreement.title,
      subtitle: isClientTurn ? 'Digital signature required' : 'Being prepared by your studio',
      description: isClientTurn ? agreement.purpose : agreement.blockedReason || agreement.purpose,
      targetTab: 'approvals',
      actionLabel: isClientTurn ? 'Review & Sign' : 'View Document Status',
      actionType: AGREEMENT_ACTION_TYPE[agreement.kind],
      actionPayload: { kind: agreement.kind },
      date: agreement.issuedAt || undefined,
      statusBadge: isClientTurn
        ? agreement.isOverdue
          ? 'Overdue — signature outstanding'
          : 'Awaiting your signature'
        : agreement.isOverdue
          ? 'Overdue — with the studio'
          : 'Being drafted',
      consequence: AGREEMENT_CONSEQUENCE[agreement.kind],
      waitingOn: isClientTurn ? undefined : 'Studio to release the document'
    });
  });

  return items;
}

function paymentActions(
  context: ProjectContext,
  milestoneTotals?: { [milestoneId: string]: number }
): ClientActionItem[] {
  const items: ClientActionItem[] = [];
  const milestones = context.paymentMilestones || [];

  milestones.forEach(m => {
    if (!m || m.status !== 'invoiced') return;

    const amount = milestoneTotals?.[m.id] ?? (m as any).amount ?? 0;
    const isFirstOfPhase = m.id === 'd1' || m.id === 'e1';

    items.push({
      id: `action-payment-${m.id}`,
      category: 'payment',
      severity: isFirstOfPhase ? 'critical' : 'high',
      owner: 'client',
      title: `Clear invoice — ${m.name}`,
      subtitle: m.invoiceNumber
        ? `Invoice ${m.invoiceNumber} • ${m.percentage}% of ${m.type} value`
        : `${m.percentage}% of ${m.type} value`,
      description:
        m.trigger
          ? `Raised against: ${m.trigger}.`
          : `Milestone invoice raised for ${m.name}.`,
      amount,
      targetTab: 'financials',
      actionLabel: 'View invoice & bank details',
      actionType: 'pay_milestone',
      actionPayload: m,
      date: m.invoiceDate || m.date,
      statusBadge: amount > 0 ? `Due: ${formatINR(amount)}` : 'Invoice raised',
      consequence: m.unlocks || undefined
    });
  });

  return items;
}

function materialActions(context: ProjectContext): ClientActionItem[] {
  const items: ClientActionItem[] = [];
  const selections = context.materialSelections || [];

  selections.forEach(mat => {
    const status = String(mat.status || '');
    if (SETTLED_MATERIAL_STATUSES.has(status)) return;

    const isClientTurn = CLIENT_PENDING_MATERIAL_STATUSES.has(status);

    // Selections still at the shop or awaiting procurement are studio-side and
    // are surfaced for visibility, not as a task.
    items.push({
      id: `action-material-${mat.id}`,
      category: 'material',
      severity: isClientTurn ? 'high' : 'medium',
      owner: isClientTurn ? 'client' : 'studio',
      title: isClientTurn ? `Approve finish — ${mat.itemName}` : mat.itemName,
      subtitle: [mat.category, mat.roomId, mat.finishCode && `Code ${mat.finishCode}`]
        .filter(Boolean)
        .join(' • '),
      description: isClientTurn
        ? `Confirm ${mat.brand ? `${mat.brand} ` : ''}${mat.itemName}${
            mat.finishCode ? ` in finish ${mat.finishCode}` : ''
          }${mat.vendor ? `, sourced from ${mat.vendor}` : ''}.`
        : status === 'delayed'
          ? 'This selection is delayed at the vendor. Your studio is chasing it.'
          : 'Your studio is sourcing options for your review.',
      targetTab: 'materials',
      actionLabel: isClientTurn ? 'Confirm selection' : 'View selection',
      actionType: 'approve_material',
      actionPayload: mat,
      statusBadge: isClientTurn
        ? status === 'change_requested'
          ? 'Change requested — re-confirm'
          : 'Awaiting your approval'
        : status === 'delayed'
          ? 'Delayed at vendor'
          : 'With the studio',
      consequence:
        isClientTurn && mat.leadTimeDays
          ? `${mat.leadTimeDays}-day lead time starts once confirmed.`
          : undefined,
      waitingOn: isClientTurn ? undefined : 'Studio / vendor'
    });
  });

  return items;
}

/**
 * Whether a decision is a design decision or a site decision.
 *
 * Read from the record when the studio has said so, and otherwise from where
 * the project actually is: nothing can be held up on site before execution has
 * started. The consequence line was hardcoded to "Site work on this item is
 * held until confirmed" for every decision, so a client in stage 2 — months
 * from a site being handed over — was told site work was waiting on them.
 */
export function decisionNature(
  dec: { category?: string; decisionNature?: string },
  currentStageNumber: number,
): 'design' | 'site' {
  const explicit = (dec as any).decisionNature;
  if (explicit === 'design' || explicit === 'site') return explicit;
  // 'Site Condition' is the only category that is inherently about the site.
  if (dec.category === 'Site Condition' && currentStageNumber >= 5) return 'site';
  return currentStageNumber >= 5 ? 'site' : 'design';
}

function decisionActions(context: ProjectContext, currentStageNumber: number): ClientActionItem[] {
  const decisions = context.projectDecisions || [];

  return decisions
    .filter(d => d.status === 'pending' || d.status === 'proposed')
    .map(dec => ({
      id: `action-decision-${dec.id}`,
      category: 'decision' as const,
      severity: 'high' as const,
      owner: 'client' as ActionOwner,
      title: dec.title,
      subtitle: (() => {
        const nature = decisionNature(dec as any, currentStageNumber);
        const label = nature === 'site' ? 'Site decision' : 'Design decision';
        return dec.roomId ? `${label} • ${dec.roomId}` : label;
      })(),
      description: dec.description || 'A design choice is waiting on your confirmation.',
      targetTab: 'decisions' as const,
      actionLabel: 'Review and decide',
      actionType: 'confirm_decision' as const,
      actionPayload: dec,
      date: dec.date,
      statusBadge: 'Awaiting your choice',
      consequence: dec.impactSchedule
        ? `Schedule impact: ${dec.impactSchedule}.`
        : decisionNature(dec as any, currentStageNumber) === 'site'
          ? 'Site work on this item is held until confirmed.'
          : 'Drawings for this item are held until confirmed.'
    }));
}

function variationActions(context: ProjectContext): ClientActionItem[] {
  // Client-facing variations live on projectUpdates. `boqRevisions` is the
  // studio's internal edit log and carries no client approval state.
  const updates = context.projectUpdates || [];

  return updates
    .filter(u => u.status === 'pending_approval')
    .map(update => {
      const impact = Number(update.netImpact) || 0;
      return {
        id: `action-variation-${update.id}`,
        category: 'variation' as const,
        severity: 'high' as const,
        owner: 'client' as ActionOwner,
        title: update.title,
        subtitle:
          update.type === 'hidden_site_issue'
            ? 'Site condition variation'
            : update.type === 'client_upgrade'
              ? 'Requested upgrade'
              : update.type === 'goodwill'
                ? 'Studio goodwill adjustment'
                : 'Design change',
        description:
          update.changes?.length
            ? `${update.changes.length} scope line(s) affected: ${update.changes
                .slice(0, 3)
                .map(c => c.itemName)
                .join(', ')}${update.changes.length > 3 ? '…' : ''}`
            : 'Scope variation submitted for your approval.',
        amount: impact,
        targetTab: 'scope' as const,
        actionLabel: 'Review variation',
        actionType: 'review_variation' as const,
        actionPayload: update,
        statusBadge:
          impact > 0
            ? `Adds ${formatINR(impact)}`
            : impact < 0
              ? `Credits ${formatINR(Math.abs(impact))}`
              : 'No cost impact',
        consequence: 'Related site work is on hold until this variation is settled.'
      };
    });
}

/**
 * A clause the client has questioned.
 *
 * This is deliberately studio-owned: the client has done their part by asking.
 * Leaving it on their task list would nag them for something they are waiting
 * on, which is exactly the confusion this feature exists to remove.
 */
function queryActions(context: ProjectContext): ClientActionItem[] {
  return getQueries(context)
    .filter(q => q.status === 'open')
    .map(q => ({
      id: `action-query-${q.id}`,
      category: 'agreement' as const,
      severity: 'high' as const,
      owner: 'studio' as ActionOwner,
      title: `Your question about clause ${q.clauseRef}`,
      subtitle: 'Awaiting a reply from your studio',
      description: q.question,
      targetTab: 'approvals' as const,
      actionLabel: 'View the thread',
      actionType: 'sign_terms' as const,
      actionPayload: { queryId: q.id, documentKind: q.documentKind },
      date: q.raisedAt,
      statusBadge: 'With your studio',
      waitingOn: 'Studio to answer or amend the clause'
    }));
}

export function calculateClientActionItems(
  context: ProjectContext,
  _projectData: FullProjectData,
  milestoneTotals?: { [milestoneId: string]: number }
): ClientActionSummary {
  const safeContext = context || ({} as ProjectContext);
  const lifecycle = calculateClientLifecycleStages(safeContext);

  // Documents with an open query are waiting on the studio, not the client, so
  // the "sign this" prompt is replaced by the query thread.
  const queriedKinds = new Set(
    getQueries(safeContext)
      .filter(q => q.status === 'open')
      .map(q => agreementKindFor(q.documentKind))
      .filter(Boolean) as AgreementKind[]
  );

  const allActions: ClientActionItem[] = [
    ...agreementActions(lifecycle.approvals).filter(
      a => !queriedKinds.has(a.actionPayload?.kind)
    ),
    ...queryActions(safeContext),
    ...paymentActions(safeContext, milestoneTotals),
    ...variationActions(safeContext),
    ...decisionActions(safeContext, lifecycle.currentStageNumber),
    ...materialActions(safeContext)
  ];

  const severityRank = { critical: 0, high: 1, medium: 2 };
  allActions.sort((a, b) => {
    if (a.owner !== b.owner) return a.owner === 'client' ? -1 : 1;
    return severityRank[a.severity] - severityRank[b.severity];
  });

  const clientActions = allActions.filter(a => a.owner === 'client');
  const studioActions = allActions.filter(a => a.owner === 'studio');

  return {
    allActions,
    clientActions,
    studioActions,
    criticalActions: clientActions.filter(a => a.severity === 'critical'),
    agreementsPending: allActions.filter(a => a.category === 'agreement'),
    paymentsPending: allActions.filter(a => a.category === 'payment'),
    materialsPending: allActions.filter(a => a.category === 'material'),
    decisionsPending: allActions.filter(a => a.category === 'decision'),
    variationsPending: allActions.filter(a => a.category === 'variation'),
    totalAmountDue: allActions
      .filter(a => a.category === 'payment')
      .reduce((sum, a) => sum + (a.amount || 0), 0)
  };
}

// ---------------------------------------------------------------------------
// UPCOMING STUDIO STEPS
// ---------------------------------------------------------------------------

interface StepDefinition extends Omit<UpcomingStepItem, 'blocked' | 'blockedBy'> {
  /** Returns true when this step has demonstrably already happened. */
  isDone?: (context: ProjectContext) => boolean;
  /** Agreement that must be signed before this step can start. */
  requiresGate?: AgreementKind;
}

const STEP_CATALOGUE: Record<number, StepDefinition[]> = {
  1: [
    {
      id: 'step-1-1',
      phaseId: 1,
      title: 'On-site dimension verification',
      description: 'Laser measurements, beam offsets and MEP conduit routes verified by the lead architect.',
      owner: 'Site Operations & Lead Designer',
      iconType: 'site',
      estimatedTimeline: '1–2 days',
      isDone: ctx => (ctx.rooms?.length || 0) > 0
    },
    {
      id: 'step-1-2',
      phaseId: 1,
      title: '2D space planning options',
      description: 'High-efficiency functional layouts drafted for living, dining, kitchen and bedrooms.',
      owner: 'Design Studio Team',
      iconType: 'design',
      estimatedTimeline: '3–4 days',
      isDone: ctx => isTruthyDate(ctx.briefFrozenAt)
    },
    {
      id: 'step-1-3',
      phaseId: 1,
      title: 'Terms of Engagement docket issued',
      description: 'Formal engagement terms and the design fee schedule prepared for your signature.',
      owner: 'Studio Operations Manager',
      iconType: 'document',
      estimatedTimeline: 'Immediate'
    }
  ],
  2: [
    {
      id: 'step-2-1',
      phaseId: 2,
      title: 'Photorealistic 3D concept renders',
      description: '3D perspectives with accurate lighting, custom cabinetry and material textures.',
      owner: '3D Visualization Lead',
      iconType: 'design',
      estimatedTimeline: '5–7 days',
      requiresGate: 'terms',
      isDone: ctx => (ctx.designDocuments?.length || 0) > 0
    },
    {
      id: 'step-2-2',
      phaseId: 2,
      title: 'Material palette & swatch assembly',
      description: 'Veneer samples, laminate chips, hardware swatches and stone slabs curated for review.',
      owner: 'Material Specialist',
      iconType: 'design',
      estimatedTimeline: '3–5 days',
      requiresGate: 'terms',
      isDone: ctx => (ctx.materialSelections?.length || 0) > 0
    },
    {
      id: 'step-2-3',
      phaseId: 2,
      title: 'Room-wise BOQ modelling',
      description: 'Room square-footage and manufacturing specifications aligned to your target budget.',
      owner: 'Cost Estimation Team',
      iconType: 'document',
      estimatedTimeline: 'Ongoing'
    }
  ],
  3: [
    {
      id: 'step-3-1',
      phaseId: 3,
      title: 'Design presentation & refinements',
      description: 'Walkthrough of 3D perspectives and finish combinations, with detail adjustments captured.',
      owner: 'Principal Architect & Client',
      iconType: 'design',
      estimatedTimeline: 'Scheduled meeting'
    },
    {
      id: 'step-3-2',
      phaseId: 3,
      title: 'Design Complete Gate & BOQ freeze',
      description: 'Drawings frozen, final BOQ lines locked and hardware specifications fixed.',
      owner: 'Studio Principal',
      iconType: 'document',
      estimatedTimeline: 'On design approval',
      isDone: ctx => !!ctx.boqFrozen || !!ctx.operativeBoqVersion
    },
    {
      id: 'step-3-3',
      phaseId: 3,
      title: 'Master Execution Agreement drawn up',
      description: 'Execution contract and the first material advance prepared against the frozen BOQ.',
      owner: 'Finance & Contracts Lead',
      iconType: 'document',
      estimatedTimeline: '1–2 days'
    }
  ],
  4: [
    {
      id: 'step-4-1',
      phaseId: 4,
      title: 'Long-lead material procurement',
      description: 'Plywood, veneer and hardware purchase orders released; factory dispatch scheduled.',
      owner: 'Procurement Manager',
      iconType: 'procurement',
      estimatedTimeline: '3–5 days after advance',
      requiresGate: 'contract'
    },
    {
      id: 'step-4-2',
      phaseId: 4,
      title: 'Site mobilisation & first fix',
      description: 'Civil and electrical teams deployed; floor protection laid and demolition set up.',
      owner: 'Site Execution Manager',
      iconType: 'site',
      estimatedTimeline: 'Day 1 of execution',
      requiresGate: 'contract'
    },
    {
      id: 'step-4-3',
      phaseId: 4,
      title: 'Working drawing sets issued to site',
      description: 'Electrical circuit diagrams, plumbing locations and false-ceiling sections released.',
      owner: 'Technical Drafting Team',
      iconType: 'design',
      estimatedTimeline: 'Before site start'
    }
  ],
  5: [
    {
      id: 'step-5-1',
      phaseId: 5,
      title: 'First-fix quality audits',
      description: 'Weekly inspections verifying conduit runs, DB routing and gypsum framework alignment.',
      owner: 'Quality Lead & Site PM',
      iconType: 'quality',
      estimatedTimeline: 'Weekly'
    },
    {
      id: 'step-5-2',
      phaseId: 5,
      title: 'Modular delivery & joinery assembly',
      description: 'Carcass assembly, soft-close hardware fitment and stone countertop templating.',
      owner: 'Modular Assembly Team',
      iconType: 'site',
      estimatedTimeline: 'Mid execution'
    },
    {
      id: 'step-5-3',
      phaseId: 5,
      title: 'Painting, panelling & fixture installation',
      description: 'Final putty coats, PU polish, sanitaryware fitting and architectural lighting testing.',
      owner: 'Finishing Specialist',
      iconType: 'site',
      estimatedTimeline: 'Final weeks'
    }
  ],
  6: [
    {
      id: 'step-6-1',
      phaseId: 6,
      title: 'Pre-handover snag audit',
      description: '40-point quality audit across door alignment, drawer slides, paint sheen and outlets.',
      owner: 'Lead Quality Inspector',
      iconType: 'quality',
      estimatedTimeline: '1–2 days'
    },
    {
      id: 'step-6-2',
      phaseId: 6,
      title: 'Deep clean & fixture polishing',
      description: 'Post-construction deep clean of all cabinetry, glass and flooring.',
      owner: 'Site Handover Team',
      iconType: 'site',
      estimatedTimeline: '1 day'
    },
    {
      id: 'step-6-3',
      phaseId: 6,
      title: 'Handover & warranty dossier',
      description: 'Key handover, hardware warranty documents and appliance manuals issued.',
      owner: 'Studio Director & Client',
      iconType: 'document',
      estimatedTimeline: 'Handover day'
    }
  ]
};

/**
 * The studio's next moves for the client's current stage, with anything the
 * client is currently blocking clearly marked.
 *
 * Accepts either a stage number (legacy call sites) or the full context, in
 * which case completed steps are dropped and blockers are resolved.
 */
export function getUpcomingStudioSteps(
  stageOrContext: number | ProjectContext,
  maybeContext?: ProjectContext
): UpcomingStepItem[] {
  const context =
    typeof stageOrContext === 'number' ? maybeContext : (stageOrContext as ProjectContext);
  const stage =
    typeof stageOrContext === 'number'
      ? stageOrContext
      : getAccurateStageNumber(stageOrContext as ProjectContext);

  const catalogue = STEP_CATALOGUE[stage] || STEP_CATALOGUE[1];
  const approvals = context ? resolveApprovals(context, stage) : null;

  const steps = catalogue.map(def => {
    const { isDone, requiresGate, ...rest } = def;

    let blocked = false;
    let blockedBy: string | undefined;

    if (requiresGate && approvals) {
      const gate = approvals[requiresGate];
      if (gate.state !== 'signed') {
        blocked = true;
        blockedBy = `${gate.title} — awaiting signature`;
      }
    }

    return {
      ...rest,
      responsible: rest.responsible || rest.owner,
      expectedTimeframe: rest.expectedTimeframe || rest.estimatedTimeline,
      blocked,
      blockedBy
    } as UpcomingStepItem;
  });

  // Hide steps that have demonstrably already happened, but never return empty.
  if (!context) return steps;
  const remaining = steps.filter((_, i) => {
    const def = catalogue[i];
    return !(def.isDone && def.isDone(context));
  });

  return remaining.length > 0 ? remaining : steps;
}
