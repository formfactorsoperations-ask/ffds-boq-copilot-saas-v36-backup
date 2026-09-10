import { FullProjectData, ProjectContext, ProposalTier } from '../types';

// ============================================================================
// CLONE A PROJECT AS A TEMPLATE
//
// Start the next 2BHK from the last 2BHK rather than from nothing. The rate
// bank already helps with items; nothing helped with structure.
//
// THIS IS AN ALLOWLIST, AND DELIBERATELY SO.
//
// `ProjectContext` has ~145 fields and grows. A blocklist ("copy everything
// except these") silently leaks the next field anyone adds, and the fields at
// risk are the worst ones to leak: the client's name and phone number, signed
// agreements, payment milestones with money already received against them, and
// the portal access token. So the clone starts from a known-clean context and
// copies ONLY what is listed below. A field added to ProjectContext tomorrow is
// excluded by default, which is the failure direction we want.
//
// TIERS CARRY A SECOND COPY OF THE CONTEXT. `ProposalTier.projectContext` is a
// full embedded ProjectContext, so copying tiers verbatim smuggles the source
// client's details back in through the side door even after the top-level
// context is clean. Each tier is rebuilt against the sanitised context.
//
// What comes across is the SHAPE of the job: rooms, the priced BOQ, the tiers,
// the fee structure, tax and proposal settings, procurement modes. What never
// comes across is anything about the client, the money, or the history.
// ============================================================================

/** The shape of a job. Everything not named here is left at its default. */
const STRUCTURAL_FIELDS = [
  // Physical scope
  'area', 'config', 'rooms', 'adHocItems', 'ceilingHeight', 'defaultHeightFt',
  'statedCarpetSft', 'conventions', 'takeoff',
  // Commercial structure (rates and rules, never amounts owed or received)
  'designFee', 'designFeeType', 'designScope', 'designFeeConfig',
  'gstRate', 'paymentScheduleConfig',
  // How the studio presents and runs this kind of job
  'proposalType', 'proposalMode', 'activeProposalFormat', 'activeProposalLevel',
  'activeProposalMode', 'showScopePricing', 'coverStyle', 'logoImage',
  'logoHeight', 'theme', 'propertyStatus', 'civilScope', 'clientBrief',
  'procurementModes', 'tradeSequence', 'procurementLeadTimeWeeks',
  // A clone of a demo stays a demo; a clone of a real job stays real.
  'isDummy', 'projectCategory',
] as const;

export interface CloneOptions {
  /** Name for the new project. Falls back to "<source> (Template)". */
  name?: string;
  /** Carry the priced BOQ and tiers across. Off = structure only. */
  includePricing?: boolean;
  /** Keep the source's location, which is often the same building. */
  keepLocation?: boolean;
  newId: string;
  newTierId: (index: number) => string;
}

export interface CloneResult {
  project: FullProjectData;
  /** For the confirmation UI: what actually came across. */
  summary: {
    rooms: number;
    boqItems: number;
    tiers: number;
    /** Named so the studio can see the clone is clean before saving. */
    dropped: string[];
  };
}

/** Fields the user should be told are intentionally NOT carried over. */
const DROPPED_FOR_HUMANS = [
  'Client name and contact',
  'Signed agreements and sign-offs',
  'Payments, invoices and milestones',
  'Decisions, snags and site updates',
  'Journey progress and history',
  'Client portal access',
];

const DEFAULT_CLONE_CONTEXT: ProjectContext = {
  name: 'New Project',
  location: 'Mumbai',
  area: 0,
  config: '2-BHK',
  rooms: [],
};

/** Deep copy without dragging references back to the source project. */
const detach = <T,>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));

export function buildProjectTemplate(
  source: FullProjectData,
  opts: CloneOptions,
): CloneResult {
  const src: any = source?.context || {};
  const includePricing = opts.includePricing !== false;

  // Start clean, then layer on only what the allowlist names.
  const context: any = { ...DEFAULT_CLONE_CONTEXT };
  for (const field of STRUCTURAL_FIELDS) {
    const value = (src as any)[field];
    if (value !== undefined) context[field] = detach(value);
  }

  context.name = opts.name?.trim() || `${src.name || 'Project'} (Template)`;
  if (opts.keepLocation && src.location) context.location = src.location;

  /* A template is a fresh lead: no stage, no freeze, no gate. Set explicitly
     rather than relying on absence, so the new project reads as deliberate. */
  context.status = 'lead';
  context.currentStage = 1;
  context.boqFrozen = false;

  // Tiers keep their priced scope but get the sanitised context.
  const tiers: ProposalTier[] = includePricing
    ? (source.tiers || []).map((t, i) => ({
        ...detach(t),
        id: opts.newTierId(i),
        projectContext: detach(context),
        timestamp: Date.now(),
        lifecycleTag: 'Draft' as const,
        parentTierId: undefined,
      }))
    : [];

  const boqItems = tiers.reduce((n, t) => n + (t.boq?.length || 0), 0);

  const project: FullProjectData = {
    id: opts.newId,
    tenantId: source.tenantId,
    architecture: source.architecture || 'canonical',
    lastModified: Date.now(),
    context: context as ProjectContext,
    tiers,
    /* Point at the first tier so the BOQ editor opens with the template's scope
       in it. This is only "which tier am I editing" -- the agreement marker is
       `approvedTierId` on the context, which the allowlist drops. Leaving this
       null met the letter of the safety rule and hid the entire point of the
       feature behind "Please select a proposal tier." */
    activeTierId: tiers.length ? tiers[0].id : null,
    // Execution belongs to the job that was actually built.
    activeProject: null,
    materials: [],
    timeline: [],
    leadProfile: detach(source.leadProfile) || ({} as any),
    decisionBrainOutput: null,
    renders: [],
    totalChangeRequestCost: 0,
  };

  return {
    project,
    summary: {
      rooms: context.rooms?.length || 0,
      boqItems,
      tiers: tiers.length,
      dropped: DROPPED_FOR_HUMANS,
    },
  };
}

/** Exported for the test that proves the allowlist holds. */
export const __STRUCTURAL_FIELDS = STRUCTURAL_FIELDS;
