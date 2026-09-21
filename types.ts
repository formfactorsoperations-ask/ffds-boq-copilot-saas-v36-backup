
export interface OrganizationContext {
    tenantId: string;
    orgName: string;
    orgLogo?: string;
    contactEmail: string;
    contactPhone?: string;
    officeAddress?: string;
    cityState?: string;
    gstin?: string;
    legalName?: string;
    signatoryName?: string;
    signatoryTitle?: string;
    isSetupComplete?: boolean;
    tagline?: string;
    /*
      Client portal footer. `tagline` is a strapline; `about` is the paragraph
      that says what the studio actually does — the footer used to print the
      tagline in both places, so a client read the same half-sentence twice.
    */
    website?: string;
    instagramUrl?: string;
    /** Image URL or data URI for the Instagram QR shown in the portal footer. */
    instagramQr?: string;
    about?: string;
    /** "Mon-Sat, 10am-7pm" */
    businessHours?: string;
    /** "Visits every Tue & Fri" */
    siteVisitPolicy?: string;
    /** Who a client escalates to, and how fast. "Ops director, 48h" */
    escalationPolicy?: string;
    /** "GST registered", "7 years", "40+ homes delivered", "1-year warranty" */
    credentials?: string[];
    /** "replies within one working day" */
    pmResponseTime?: string;
    accentColor?: string;
    designFeePercentage?: number;
    defaultGstRate?: number;
    themeColor?: string;
    team?: TeamMember[];
    defaultTimelinePhases?: TimelinePhase[];
    bankDetails?: {
        accountName: string;
        bankName: string;
        accountNumber: string;
        ifscCode: string;
        upiId?: string;
        qrCodeImage?: string;
    };
    defaultContractWordings?: {
        forceMajeureText?: string;
        revisionsText?: string;
        paymentTermsText?: string;
        clientObsText?: string;
    };
    defaultPaymentSchedules?: { title: string; percentage: number }[];
    procurementLeadTimeWeeks?: number;
    poApprovalThreshold?: number;
}

export type UserRole = 'Super Admin' | 'Admin' | 'Ops Director' | 'Site Supervisor' | 'Vendor';

export interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    status: 'Active' | 'Pending';
    /**
     * What this person is called on a document — "Principal Architect", not
     * their access level. Email drafts already read it (`team[uid].title`) and
     * fall back to "Architect" for everyone, because nothing ever set it.
     */
    title?: string;
    /** Firebase Auth uid, when this member has actually signed in. */
    uid?: string;
}

export type AIStrategy = 'balanced' | 'conservative' | 'aggressive';

export type AIStatus = 'checking' | 'online' | 'error' | 'unavailable';

export type DesignFeeType = 'percentage' | 'fixed_sqft' | 'fixed_lumpsum';

export type PropertyStatus = 'raw_shell' | 'semi_finished' | 'finished';

/**
 * What the site actually needs doing, beyond the typology template.
 *
 * `propertyStatus` has been on the form since the beginning and was read in
 * exactly one place in the app — a portal message — so a raw shell and a
 * finished refit generated identical bills. These switches are what the BOQ
 * generator reads; the site state supplies their defaults. See lib/civilScope.
 */
export interface CivilScope {
    /** Lift and relay floors, or lay them for the first time. */
    flooring?: boolean;
    /** Full wet-area overhaul: BBC, waterproofing, tiling, counter, sanitary. */
    bathrooms?: boolean;
    /** Kitchen dado and plumbing point shifts. */
    kitchenCivil?: boolean;
    rewiring?: boolean;
    plumbing?: boolean;
    falseCeiling?: boolean;
    painting?: boolean;
}

export type ProposalType = 'TURNKEY' | 'DESIGN_ONLY';

export type ProjectStatus = 'lead' | 'draft' | 'proposal_sent' | 'negotiation' | 'won' | 'execution' | 'work_paused' | 'completed' | 'lost';

export type ProposalLevel = 'LEVEL_1' | 'LEVEL_1_5' | 'LEVEL_2' | 'LEVEL_3';

export interface Room {
    id?: string;
    name: string;
    size: number;
    unit: 'sq ft';
    length?: number;
    width?: number;
    height?: number;
    notes?: string;

    /* ── plan takeoff ────────────────────────────────────────────────────────
       Populated when a floor plan is read. length/width already existed but were
       never filled; quantities derive from them, so they are the important half. */
    kind?: import('./lib/takeoff').RoomKind;
    doors?: number;
    windows?: number;
    ceiling?: import('./lib/takeoff').CeilingDesign;
    dimSource?: import('./lib/takeoff').DimSource;
    rawDimension?: string;
    irregular?: boolean;
}

export interface DesignScope {
    has3DRenders: boolean;
    has2DDrawings: boolean;
    hasFurnitureSelection: boolean;
    hasSiteVisits: boolean;
    visitCount: number;
    hasVrWalkthrough: boolean;
}

export interface ProposalDecisionOption {
    id: string;
    title: string;
    blurb: string;
}

export interface ProposalDecision {
    enabled: boolean;
    options: ProposalDecisionOption[];
    selected?: string;
}

export interface OnboardingData {
    accountName: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    amount: number;
    gstNote: string;
    qrCodeImage?: string;
}

export interface OnboardingSection {
    id: string;
    title: string;
    text: string;
    subSections?: { id: string; title: string; text: string }[];
}

export interface OnboardingContent {
    welcomeTitle: string;
    welcomeMessage: string;
    governanceTitle: string;
    communicationTitle: string;
    communicationItems: { label: string; text: string; color: string }[];
    hoursTitle: string;
    hoursItems: { label: string; value: string }[];
    timelineTitle: string;
    timelineSteps: { day: string; label: string; sub: string }[];
    checklistTitle: string;
    checklistItems: string[];
    bankingTitle: string;
    bankingSubtitle: string;
    paymentTermsTitle?: string;
    paymentTermsItems?: { title: string; text: string; percentage?: string; }[];
    howItWorksItems?: { letter: string; title: string; text: string; }[];
    clientExpectations?: string[];
    ffdsExpectations?: string[];
    footerTitle: string;
    footerSubtitle: string;
    customSections?: OnboardingSection[];
}

export interface ContractSubClause {
    id: string;
    title: string;
    text: string;
}

export interface ContractClause {
    id: string;
    title: string;
    text: string;
    subClauses?: ContractSubClause[];
}

export interface ContractContent {
    titleLine1: string;
    titleLine2: string;
    subTitle: string;
    overviewTitle: string;
    overviewText: string;
    scopeTitle: string;
    scopeNote: string;
    boqTitle: string;
    boqNote: string;
    deliverablesTitle: string;
    deliverablesText: string;
    revisionsText: string;
    paymentTitle: string;
    paymentNote: string;
    changeTitle: string;
    changeText: string;
    responsibilitiesTitle: string;
    clientObsText: string;
    ffdsObsText: string;
    protocolsTitle: string;
    commProtocolText: string;
    forceMajeureText: string;
    signoffTitle: string;
    footerText: string;
    durationText?: string;
    customClauses?: ContractClause[];
    scopeOverrides?: Record<string, { included?: string; excluded?: string }>;
    boqItemSpecOverrides?: Record<string, string>;
    boqPresentationMode?: 'summary' | 'detailed';
    additionalScopes?: { id: string; title: string; included: string; excluded: string }[];
}

export interface ProposalContent {
    cover?: { title: string; text: string };
    snapshot?: { title: string; subtitle: string; engagementModel: string };
    options?: { title: string; subtitle: string };
    process?: { title: string; subtitle: string; steps: { id: number; title: string; desc: string; tags: string[] }[] };
    fees?: { title: string; subtitle: string; card1: { label: string; value: string; desc: string }; card2: { label: string; items: string[] }; practicalView: string };
    timeline?: { title: string; subtitle: string };
    payments?: { title: string; subtitle: string };
    cta?: { title: string; subtitle: string; nextStepsTitle: string; steps: string[] };
    footer?: { orgName: string; tagline: string; contactInfo: string; phoneNumber: string };
    visibleSections?: Record<string, boolean>;
    materials?: { overrides?: Record<string, Record<string, string>> };
    /* Free-text overrides for the booklet's own prose, keyed by a hash of the
       shipped default. A key falls out of use when the default text is edited
       in source, which is the wanted behaviour: a reworded clause should not
       silently keep a studio override written against the old wording. */
    blocks?: Record<string, string>;
    /* Studio-customised clause lists in the annexure, keyed the same way as
       `blocks`. Absent means "use the list the booklet ships with", so a list
       is only frozen once someone actually restructures it. */
    lists?: Record<string, Array<string | { title: string; desc?: string; meta?: string }>>;
    l2_cover?: { title: string; text: string };
    l2_snapshot?: { title: string; subtitle: string };
    l2_fees?: { title: string; subtitle: string };
    l2_scope?: { title: string; subtitle: string };
    l2_risk?: { title: string; subtitle: string; items: { title: string; desc: string }[] };
    l2_finishes?: { title: string; subtitle: string };
    l2_timeline?: { title: string; subtitle: string };
}

export type PaymentStatus = 'pending' | 'invoiced' | 'paid';

export interface PaymentMilestone {
    id: string;
    type: 'design' | 'execution';
    name: string;
    percentage: number;
    description: string;
    date?: string; // ISO YYYY-MM-DD
    isCustom?: boolean; // If true, auto-calc skips this
    
    // Fixed Amount Feature
    isFixedAmount?: boolean;
    fixedAmount?: number;
    
    // Invoicing & Ops
    status?: PaymentStatus;
    invoiceNumber?: string;
    invoiceDate?: string;
    lockedTaxableBase?: number; // The taxable base amount at the time of invoicing
    trigger?: string;
    subSteps?: { id: string; label: string; isDone: boolean }[];
    unlocks?: string;
    isHandoverAdvance?: boolean;
}

export interface ProjectDiscount {
    id: string;
    name: string;
    type: 'percentage' | 'fixed';
    value: number;
    target: 'execution' | 'design'; // Target component
}

export interface PaymentRevision {
    id: string;
    date: string;
    previousExecutionValue?: number;
    newExecutionValue?: number;
    previousDesignValue?: number;
    newDesignValue?: number;
    reason?: string;
}

export interface PaymentSnapshot {
    tierId: string;
    tierName: string;
    timestamp: number;
    approvedExecutionValue: number;
    approvedDesignValue: number;
    milestones: PaymentMilestone[];
    billablePercent?: number;
    executionGstEnabled?: boolean;
}

export interface FinancialConfig {
    initiationFeePaid: number;
    billablePercent: number; // 0 to 100
    executionGstEnabled: boolean; // Toggle for GST on execution
    projectedCashValue: number; // Saved value for global tracking
    taxLimitYearly: number; // 20L default
    goodwillDiscount: number; // Legacy flat discount field (kept for backward compat)
    discounts?: ProjectDiscount[]; // New granular discounts list
    approvedExecutionValue?: number; // Revised/approved execution value
    approvedDesignValue?: number; // Revised/approved design fee
    designFeePercentage?: number; // Persist design fee percentage for revisions
    paymentRevisions?: PaymentRevision[];
    paymentSnapshots?: PaymentSnapshot[];
}

export type ActionType = 'ADD' | 'REMOVE' | 'REPLACE' | 'REVISE_QTY' | 'REVISE_RATE' | 'MARK_VENDOR' | 'MARK_PENDING' | 'APPROVE_PENDING';

export interface RevisionAction {
  id: string;
  type: ActionType;
  targetId?: string;
  section: string;
  item: string;
  oldValue?: any;
  newValue?: any;
  reasonCategory: string;
  note?: string;
  timestamp: number;
}

export interface ProjectUpdateChange {
    boqItemId: string;
    itemName: string;
    changeType: 'upgrade' | 'addition' | 'removal' | 'fix';
    oldValue: number;
    newValue: number;
    delta: number;
    rationale: string;
    goodwillApplied?: number;
    proofUrl?: string;
}

export interface ProjectUpdateOption {
    id: string;
    title: string;
    description: string;
    costImpact: number;
    selected?: boolean;
}

export interface ProjectUpdateRecord {
    id: string;
    date: string;
    title: string;
    type: 'client_upgrade' | 'hidden_site_issue' | 'design_change' | 'goodwill';
    status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
    changes: ProjectUpdateChange[];
    netImpact: number;
    options?: ProjectUpdateOption[];
}

export const SELECTION_STATUS = {
  TO_SELECT: 'to_select',
  AT_SHOP: 'at_shop',
  SENT_FOR_APPROVAL: 'sent_for_approval',
  LOCKED: 'locked',
  ORDERED: 'ordered',
  DELAYED: 'delayed',
  CHANGE_REQUESTED: 'change_requested'
} as const;

export type MaterialSelectionStatus = typeof SELECTION_STATUS[keyof typeof SELECTION_STATUS] | 'pending_selection' | 'pending_approval' | 'approved';

export interface MaterialSelection {
    id: string;
    roomId: string;
    itemName: string;
    category: string;
    vendor?: string; // Shop/Vendor name
    finishCode: string; // Used as Model No. / Finish Code
    brand?: string;
    wattage?: string;
    colorTemp?: string;
    dimensions?: string;
    status: MaterialSelectionStatus;
    leadTimeDays: number;
    notes?: string;
    photos?: string[]; // Multiple photos (item, label, context)
    quotedPrice?: number | null;
    priceUnit?: string;
    estimatedQty?: number | null;
    estimatedTotal?: number | null;
    allowancePrice?: number | null;
    clientConfirmedAt?: string | null;
    clientConfirmMethod?: string | null;
    confirmationSentAt?: string | null;
    confirmationToken?: string;
    
    // Change Request & Impact Fields
    itemType?: 'observation' | 'selection' | 'change_request';
    costDelta?: number;
    timelineDeltaDays?: number;
    affectedBoqItemId?: string;
    affectedPhaseStr?: string;
    requiresClientSignoff?: boolean;
    clientSignoffStatus?: 'not_required' | 'pending' | 'approved' | 'rejected';
    boqAbsorbed?: boolean;
    timelineApplied?: boolean;
    /** Set when the change needs the client's agreement but has not reached the ledger yet. */
    needsSignoffRouting?: boolean;
    /**
     * The decision in projects/{id}/decisions that carries this change to the
     * client. Written once the variation has been routed; it is what lets the
     * client's answer find its way back to the selection.
     */
    signoffDecisionId?: string | null;

    changeRequestedAt?: string | null;
    changeReason?: string | null;
    changeRequestedBy?: string | null;

    /*
      The studio's answer to a client's question, and the act of putting the
      finish back to them.

      A client could raise a question on a selection -- it landed, and the card
      showed CHANGE REQUESTED -- but there was nowhere to answer it and no way
      to reopen the approval, so the finish stopped dead: no confirm button for
      the client, no action for the studio.
    */
    studioReply?: string | null;
    studioReplyAt?: string | null;
    studioReplyBy?: string | null;
    previousSelectionSnapshot?: any | null;
}

export interface PaintColor {
    name: string;
    code: string;
    hex: string;
}

export interface PaintCombination {
    id: string;
    name: string;
    isRecommended: boolean;
    image?: string;
    color1: PaintColor;
    color2?: PaintColor;
}

export interface PaintPalette {
    id: string;
    roomId: string;
    title: string;
    description: string;
    combinations: PaintCombination[];
}

export interface DesignDocument {
    id: string;
    roomName: string;
    title: string;
    url: string;
    addedAt: string;
}

/**
 * A decision as the client portal sees it.
 *
 * This is a *read model*, projected from the decision ledger in Firestore
 * (projects/{id}/decisions) by DecisionTracker. The ledger is the source of
 * truth: portal actions write back to it and the projection follows. Do not
 * treat a change made only to this record as saved.
 */
export interface ProjectDecisionRecord {
    id: string;
    date: string;
    title: string;
    roomId?: string; // Newly added
    /** Design decision or site decision. Absent on older records. */
    decisionNature?: 'design' | 'site';
    /** The studio's reason category, e.g. 'Site Condition'. */
    category?: string;
    photoUrl?: string; // Newly added
    /** The technical drawing the client is being asked to approve against. */
    drawingUrl?: string;
    /** The question the client asked, if they asked one. Latest only. */
    clientQuery?: string;
    /** The studio's answer to that question. Latest only. */
    studioReply?: string;
    /** The whole exchange, oldest first. Survives more than one round. */
    discussion?: { from: 'client' | 'studio'; text: string; at?: string; author?: string }[];
    status: 'pending' | 'confirmed' | 'changed' | 'proposed' | 'revoked' | 'rejected';
    selectedOption?: string;
    /** Token that lets an unauthenticated client sign off against the ledger. */
    signoffToken?: string;
    /** When the studio released this to the client. ISO string. */
    notifiedAt?: string;
    /** When the client responded. ISO string — mirrors signoff.respondedAt. */
    clientConfirmedAt?: string;
    
    // Legacy fields (kept for backward compatibility if needed)
    description?: string;
    requestedBy?: 'client' | 'ffds';
    confirmingParty?: string;
    impactSchedule?: string;
    impactCost?: string;
    proofText?: string;
}

export interface ProjectLifecycle {
    stage: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    subState: string;
    enteredStageAt: number;
    gates: {
        proposalAccepted: { done: boolean; at: number | null; reference: string | null };
        contractSigned: { done: boolean; at: number | null; reference: string | null };
        designGateActive: { done: boolean; at: number | null; reference: string | null };
        handoverComplete: { done: boolean; at: number | null; reference: string | null };
    };
    updatedAt: number;
    updatedBy?: string;
}



export interface MismatchTask {
    id: string;
    type: 'report_source_mismatch' | string;
    module: string;
    instruction: string;
    raisedByReport?: string;
    correctionId?: string;
    status: 'open' | 'resolved';
    createdAt: number;
    createdBy: string;
}


// ---------------------------------------------------------------------------
// STUDIO MEMORY — an append-only ledger of what actually happened, across every
// project. Benchmarks are computed from it; nothing here is ever edited in place.
// ---------------------------------------------------------------------------
export type ObservationType =
    | 'rate_actual'       // real spend, optionally against a quote
    | 'margin_realised'   // a whole project's revenue vs actual cost
    | 'payment_cycle'
    | 'stage_duration'
    | 'vendor_delivery';

/** measured = taken from the books. recalled = a human typed it from memory. */
export type ObservationConfidence = 'measured' | 'recalled';

/** How the money was bought. Mirrors POScope in the procurement spec. */
export type CostType = 'subcontract' | 'material' | 'labour' | 'uncategorised';

export interface ObservationDims {
    category?: string;
    roomId?: string;
    bankId?: string;
    costType?: CostType;
    vendorId?: string;
    vendorName?: string;
    config?: string;
    city?: string;
    clientName?: string;
}

export interface Observation {
    id: string;
    type: ObservationType;
    at: number;
    source: 'historical' | 'live';
    confidence: ObservationConfidence;
    projectId: string;
    projectName?: string;
    dims: ObservationDims;
    quoted?: number;
    actual?: number;
    days?: number;
    unit?: string;
    note?: string;
}


export type HistoryCategory = 'stage' | 'money' | 'design' | 'docs' | 'scope';

export interface HistoryEvent {
    id: string;
    at: number;
    actor: string;
    category: HistoryCategory;
    summary: string;
    detail?: string | null;
}

export interface ManualOverrideMeta {
    isOverride: boolean;
    recordedBy: string;
    recordedAt: string;
    overrideReason: string;
    approvalMedium: 'paper_wet_ink' | 'email_confirmation' | 'whatsapp_approval' | 'in_person_verbal';
    attachmentUrl?: string;
}

export interface DigitalSignatureDocket {
    signatoryName: string;
    signatoryEmail?: string;
    signatoryPhone?: string;
    signatoryRole?: string;
    signedAt: string; // ISO
    signatureType: 'draw' | 'type' | 'upload' | 'manual_override';
    signatureDataUrl?: string; // canvas png or svg string
    typedFont?: string;
    ipAddress: string;
    userAgent?: string;
    docketHash: string; // Verification hash
    verified: boolean;
    legalAffirmation: boolean;
    manualOverride?: ManualOverrideMeta;
    /** The DocumentIssue this signature was taken against. */
    issueId?: string;
    /** Hash of the exact content shown at signing time. */
    contentHash?: string;
    /** How the signatory engaged with the record before signing. */
    readingEvidence?: import('./types').ReadingEvidence;
    /** Staff member present when signed on a studio device, in person. */
    witnessedBy?: string;
}

export interface SignoffRecord {
    status: 'pending' | 'sent' | 'signed' | 'disputed';
    token?: string;
    sentAt?: any;
    signedAt?: any;
    signedBy?: string;
    tcAcknowledgedAt?: number;
    tcRef?: string;
    clientName?: string;
    clientEmail?: string;
    ipAddress?: string;
    refId?: string;
    signatureType?: 'draw' | 'type' | 'upload' | 'manual_override';
    signatureDataUrl?: string;
    docket?: DigitalSignatureDocket;
    manualOverride?: ManualOverrideMeta;
}

export interface ProjectContext {
    name: string;
    location: string;
    area: number;
    config: string;
    rooms: Room[];
    adHocItems?: Item[];
    ceilingHeight?: number;
    takeoff?: {
        defaultHeightFt?: number;
        statedCarpetSft?: number;
        conventions?: Partial<import('./lib/takeoff').TakeoffConventions>;
        computedAt?: number;
    };
    designFee?: number;
    designFeeType?: DesignFeeType;
    designScope?: DesignScope;
    propertyStatus?: PropertyStatus;
    /**
     * Set once the studio has touched the Civil & Site Scope block. Absent
     * means "never reviewed", which reads the defaults off propertyStatus —
     * so a correction survives the next regeneration and a project that has
     * never been reviewed still gets a sensible scope.
     */
    civilScope?: CivilScope;
    /**
     * The requirement in the client's own words.
     *
     * One field the studio was already going to type somewhere, read by
     * `suggestScopeFromBrief` to propose the civil scope. It suggests; nothing
     * is applied without a click — a bill that changed because a regex fired is
     * worse than one nobody configured.
     */
    clientBrief?: string;
    proposalType?: ProposalType;
    proposalMode?: 'single' | 'tiered';
    gstRate?: number;
    theme?: string; // e.g., 'Modern Minimalist', 'Japandi'
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    activeProposalFormat?: 'classic' | 'booklet';
    showScopePricing?: boolean;
    coverStyle?: 'minimal' | 'bold' | 'photo'; // Newly added property
    logoImage?: string;
    logoHeight?: number;
    approvedTierId?: string;

    /**
     * The client's acceptance of the commercial proposal.
     *
     * A distinct commercial event, and previously not recordable anywhere: the
     * `proposalAccepted` gate was inferred from discovery being completed, so
     * it turned true weeks before a proposal existed. `approvedTierId` is the
     * studio's own baseline, not the client's word.
     *
     * Acceptance names WHAT was accepted — the tier and the figure. Without
     * that, "accepted" stops meaning anything the moment the scope is revised.
     */
    proposalAcceptance?: {
        accepted: boolean;
        at: number | null;
        /** A proposal is often accepted on a call; the channel is the evidence. */
        via: 'portal' | 'email' | 'verbal' | 'written' | null;
        /** The person at the client who accepted. */
        acceptedBy: string | null;
        /** The tier accepted, so acceptance points at specific commercials. */
        tierId: string | null;
        tierName: string | null;
        amount: number | null;
        /** Email subject, call note or docket reference. */
        reference: string | null;
        recordedBy: string | null;
        recordedAt: number | null;
    };
    status?: ProjectStatus;
    proposalContent?: ProposalContent;
    proposalContentByMode?: Record<string, ProposalContent>;
    designFeeConfig?: {
        baseFee?: number;
        multiplier?: number;
        includePmc?: boolean;
        pmcRate?: number;
    };
    onboardingData?: OnboardingData;
    onboardingContent?: OnboardingContent;
    proposalDecision?: ProposalDecision;
    contractContent?: ContractContent;
    contractSignoff?: SignoffRecord;
    executionSignoff?: SignoffRecord;
    handoverSignoff?: SignoffRecord;
    designAgreementSignoff?: SignoffRecord;
    proposalSignoff?: SignoffRecord;
    termsSignoff?: SignoffRecord;
    /**
     * Legacy: the plan as base64, stored in the document.
     *
     * At 200-270KB it was the largest single field on several projects, against
     * Firestore's 1 MiB document limit. New uploads go to Storage and set
     * `floorplanImageUrl` instead; this stays readable so existing projects keep
     * showing their plan until they are repaired.
     */
    floorplanImage?: string;
    /** Storage URL of the floor plan. Roughly a hundred bytes in the document. */
    floorplanImageUrl?: string;
    paymentMilestones?: PaymentMilestone[];
    designPaymentStages?: {
        stage1?: any;
        stage2?: any;
        stage3?: {
            amount: number;
            invoiceGeneratedAt?: any;
            status?: string;
        };
    };
    boqRevisions?: RevisionAction[];
    projectUpdates?: ProjectUpdateRecord[];
    activeProposalLevel?: ProposalLevel;
    activeProposalMode?: ProposalType;
    electricalPointsPlan?: { id: string; roomId: string; roomName: string; item: string; qty: number; notes: string }[];
    assignedSupervisors?: string[]; // Array of team member IDs or emails
    qualityChecklist?: QualityChecklistState;
    
    // Project tagging & classification
    isDummy?: boolean; // If true, explicitly marked as dummy/sample/demo project. If false, explicitly marked as actual client project.
    projectCategory?: 'actual' | 'dummy'; // Explicit project category classification

    // Execution Intelligence Fields
    sofFreezeDate?: string;
    targetHandoverDate?: string;
    currentExecutionBundle?: string;
    procurementLeadTimeWeeks?: number;
    briefFrozenAt?: number;
    designApprovedAt?: number;
    handoverDate?: number;
    paymentScheduleConfig?: {
        signupDate?: string;
        possessionDate?: string;
    };
    boqFrozen?: boolean;
    scopeAdditionsEnabled?: boolean;
    currentStage?: number;
    designPhaseClosedAt?: any;
    journeySummary?: {
        done: number;
        total: number;
        pct: number;
        active: number;
        phaseProgress: { done: number; total: number; pct?: number }[];
    };
    
    // Status-Driven BOQ Totals (Calculated by Cloud Function)
    grandTotal?: number;
    firmTotal?: number;
    estimateExposure?: number;
    excludedValue?: number;
    statusCounts?: Record<string, number>;
    operativeBoqVersion?: string;
    baselineCreatedAt?: any;

    // New Financial Persistence
    financials?: FinancialConfig;
    designSummary?: DesignSummaryData;
    siteUpdates?: SiteUpdateRecord[];
    materialSelections?: MaterialSelection[];
    /** Inbound notes from the client. See ClientMessage. */
    clientMessages?: ClientMessage[];
    paintPalettes?: PaintPalette[];
    designDocuments?: DesignDocument[]; // URLs for approved design PDFs
    /**
     * The site progress photo album, held in the studio's Google Drive.
     *
     * The portal used to carry a "Site feed" lens that filtered the spine down
     * to site updates. It could only ever subtract from a page the client had
     * already scrolled, and photographs — dozens a week, full resolution — were
     * never something this app should be storing or paginating.
     *
     * One link, set by the studio, shown on Design & Scope. Drive already does
     * albums, ordering, download and sharing properly.
     */
    sitePhotosLink?: {
        url: string;
        /** Optional label, e.g. "Weeks 1-6 · Civil & carpentry". */
        label?: string;
        updatedAt?: string;
        updatedBy?: string;
    };
    projectDecisions?: ProjectDecisionRecord[];
    /**
     * The client's portal credential. The portal has no password — this token,
     * delivered by email, is what grants access. Reissuing invalidates the old
     * link, so it doubles as revoke. See services/portalAccessService.ts.
     */
    portalAccess?: {
        token: string;
        expiresAt: string;
        issuedAt: string;
        issuedTo?: string;
        firstUsedAt?: string;
    };
    tradeSequence?: string[];
    delayedTrades?: { trade: string; delayDays: number; markedAt: number }[];
    // Communication Tracker (Project-Level Summary)
    commsHealth?: number;
    commsSentCount?: number;
    commsPendingCount?: number;
    commsOverdueCount?: number;
    commsLastUpdatedAt?: any; // Timestamp
    termsDockets?: TermsDocket[];
    paymentSchedules?: PaymentSchedule[];
    lifecycle?: ProjectLifecycle;
    /** Issued documents, clause queries and view stamps. See documentIssueEngine. */
    documents?: ProjectDocumentState;
    engagement?: ProjectEngagement;
    weeklyReportCommentaries?: Record<string, string>;
    weeklyRoomProgress?: Record<string, Record<string, { progress: number; stage: string }>>;
    weeklyDrawingProgress?: Record<string, Record<string, string>>;
    itemExecutionStatuses?: Record<string, 'pending' | 'in_progress' | 'completed'>;
    executionApprovedByFFDS?: boolean;
    autoStageCompletion?: boolean;
    /** Design → Execution handoff checkpoint (soft gate). Single source of truth. */
    designGate?: DesignGateState;
    /** Human-readable audit trail of meaningful project changes (capped ring buffer). */
    history?: HistoryEvent[];
    procurementModes?: Record<string, ProcurementMode>;
    weeklyReports?: WeeklyReport[];
    snagList?: SnagItem[];
    learnedSnags?: Array<{ text: string; severity: 'low' | 'medium' | 'high'; count: number }>;
}

export interface QualityChecklistState {
    checkedState: Record<string, Record<string, boolean>>; // roomId -> checkId -> checked (boolean)
    elecVerified: Record<string, boolean>; // roomId -> checked (boolean)
    customChecks?: Array<{ id: string; roomId: string; label: string; checked: boolean }>;
    notesState?: Record<string, string>; // roomId -> note text
    naState?: Record<string, Record<string, boolean>>; // roomId -> checkId -> isNA (boolean)
}

export interface SnagItem {
    id: string;
    roomId: string;
    roomName: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    status: 'open' | 'in_progress' | 'resolved' | 'verified';
    raisedBy: 'designer' | 'site_supervisor' | 'client' | 'owner';
    raisedAt: number;
    resolvedAt?: number;
    resolvedBy?: string;
    notes?: string;
    image?: string;
    assignedTo?: string;
}

export interface SiteUpdateRecord {
    id: string;
    date: string; // ISO string
    title: string;
    description: string;
    type?: 'site' | 'design'; // Support for Design Meetings vs Site Updates
    images?: string[];
    tags?: string[];
    author?: string;
}

export interface DesignSummaryView {
    id: string;
    title: string;
    date: string;
    status: string;
    stage: string;
    intent: string;
    purpose: string;
    discussion: string;
    image: string | null;
    isKey: boolean;
    isComparison: boolean;
}

export interface DesignSummaryRoom {
    id: string;
    name: string;
    views: DesignSummaryView[];
}

export interface DesignSummaryData {
    meta: {
        projectName: string;
        clientName: string;
        date: string;
        coverTitle: string;
        purpose1: string;
        purpose2: string;
        processTitle: string;
        processIntro: string;
        finalTitle: string;
        finalText: string;
        finalBullets: string[];
    };
    rooms: DesignSummaryRoom[];
}

export interface Item {
    id: string;
    name: string;
    cat: string;
    specs: string; // Public/High-level Specs mapped to L1/L2
    internalSpecs?: string; // Execution/L3 granular specs restricted to converted projects
    unit: string;
    materials: number;
    labor: number;
    margin: number;
    // Optional derived properties if used in certain contexts
    totalCost?: number;
    areaMultiplierCoefficient?: number;
}

export interface LumpsumBreakdownItem {
    id: string;
    description: string;
    estimatedValue?: number;
}

export interface BoqVersion {
    id: string; // The version number (1.0, 1.1) is often the document ID or we'll store it explicitly
    versionNumber: string;
    isBaseline: boolean;
    issuedAt: any; // Timestamp
    issuedBy: string; // userId
    revisionSummary: string;
    changeOrderRef: string | null;
    approvedBy: string | null;
    approvedAt: any | null; // Timestamp
    approvalEvidence: string;
    itemsSnapshot: any[]; // Full copy of all boqItems
    totalsSnapshot: {
        grandTotal: number;
        firmTotal: number;
        estimateExposure: number;
        excludedValue: number;
    };
    itemCount: number;
    contentHash: string;
}

export interface BoqStatusHistoryEntry {
    from: string | null;
    to: string;
    changedBy: string;
    changedAt: any; // Timestamp
    changeOrderRef: string | null;
    reason: string;
}

export interface BoqItem {
    id: string;
    bankId: string;
    qty: number;
    marginOverride?: number;
    roomId?: string;
    rationale?: string;
    optional?: boolean;
    asActuals?: boolean;
    calcLength?: number;
    calcWidth?: number;
    calcMultiplier?: number;
    // Trust-First Revision System Fields
    baseRate?: number;
    baseLabor?: number;
    selectedRate?: number;
    inclusions?: string[];
    exclusions?: string[];
    assumptionTag?: string;
    lumpsumBreakdown?: LumpsumBreakdownItem[];

    // BOQ Copilot v36.1 — Contractual BOQ Format Fields
    boqStatus?: "included_ffds_scope" | "excluded" | "client_procured" | "as_actuals" | "provisional_sum" | "pending_finalisation" | "deleted" | "substituted" | "on_hold" | "approved_variation";
    linkage?: {
        type: "drawing" | "selection_sheet" | "site_instruction" | "change_order" | "direct_execution" | "vendor_spec";
        refId: string | null;
        label: string;
    };
    changeOrderRef?: string | null;
    statusHistory?: BoqStatusHistoryEntry[];
    rateSnapshotAt?: any | null; // Timestamp
    commercialNote?: string;
    successorItemId?: string | null;

    // Custom Overrides & Smart Multipliers
    name?: string;
    specs?: string;
    materials?: number;
    labor?: number;
    areaMultiplierCoefficient?: number;
}

export interface FullBoqItem extends Omit<Item, 'name' | 'specs' | 'materials' | 'labor'>, Omit<BoqItem, 'name' | 'specs' | 'materials' | 'labor'> {
    // Merged properties with resolved conflicts
    name: string;
    specs: string;
    materials: number;
    labor: number;
    category?: string;
}

export interface ProjectTask {
    id: string;
    title: string;
    phase: string;
    trade: string;
    status: 'pending' | 'in_progress' | 'completed' | 'delayed';
    duration: number;
    startDay: number;
    dependencies: string[];
    linkedMaterialIds: string[];
    description?: string;
    room?: string;
}

// ---------------------------------------------------------------------------
// SCHEDULE — one dependency graph across the whole project lifecycle.
//
// Replaces three parallel models: TimelinePhase (AI-generated, startDay-based),
// TimelinePhaseData (Firestore design steps) and ProjectTask (rich, but never
// called by anything). Durations are WORKING days; the calendar decides what
// that means in real dates, per Execution Agreement clause 5.4.2.
// ---------------------------------------------------------------------------
export type ScheduleTaskKind = 'design' | 'procurement' | 'execution' | 'milestone';
export type ScheduleGate = 'sof' | 'gfc' | 'payment' | 'site';
export type ScheduleStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

/** Non-working days. Sundays and 2nd Saturdays are the Indian site norm. */
export interface WorkCalendar {
    /** Mon..Sun — true = a working day. */
    workWeek: boolean[];
    observeSecondSaturday: boolean;
    holidays: { fromISO: string; days: number; label: string }[];
}

export interface ScheduleTask {
    id: string;
    title: string;
    kind: ScheduleTaskKind;
    trade?: string;
    room?: string;
    /** Links an execution task to the bundle whose gates control it. */
    bundleId?: string;
    dependencies: string[];
    /** Duration in WORKING days. Milestones use 0. */
    workDays: number;
    /** Earliest the task may start regardless of dependencies (ISO date). */
    notBeforeISO?: string;
    /** Frozen when the Design Gate closes; absent until then. */
    baselineStartISO?: string;
    baselineWorkDays?: number;
    actualStartISO?: string;
    actualEndISO?: string;
    status: ScheduleStatus;
    /** Gate state for execution tasks. A false gate blocks the start. */
    gates?: Partial<Record<ScheduleGate, boolean>>;
    /** Procurement: order-by is derived by pulling this back from the start. */
    leadTimeDays?: number;
    /** A date promised to a client or vendor — recompute reports, never moves. */
    pinned?: boolean;
    milestoneLabel?: string;
    note?: string;
}

/** A recorded disruption. Scope is per trade or the whole site. */
export interface ScheduleHold {
    id: string;
    scope: 'site' | 'trade';
    /** Trade name when scope is 'trade'. */
    target?: string;
    fromISO: string;
    /** Working days lost. */
    workDays: number;
    reason: string;
    note?: string;
    by?: string;
    at: number;
    liftedAt?: number;
}

/**
 * A point-in-time event drawn on the schedule — a meeting, a site visit, a
 * signed decision. Not a task: it has no duration and nothing depends on it,
 * but it explains *why* a bar moved when you look back at the project.
 */
export interface ScheduleMarker {
    id: string;
    atISO: string;
    kind: 'site_visit' | 'client_meeting' | 'mom' | 'decision';
    title: string;
    detail?: string;
    /** MOM-004, or the visit's phase title. */
    ref?: string;
    /** Open action items carried by the meeting. */
    openActions?: number;
}

export interface ProjectSchedule {
    tasks: ScheduleTask[];
    holds: ScheduleHold[];
    calendar: WorkCalendar;
    /** Frozen at Design Gate close; null means no baseline yet. */
    baselineAt: number | null;
    targetHandoverISO?: string;
    projectStartISO?: string;
    /** Meetings and visits, loaded from their own collections. Read-only here. */
    markers?: ScheduleMarker[];
}

export interface MarginSuggestion {
    itemId: string;
    itemName: string;
    currentMargin: number;
    newMargin: number;
    rationale: string;
}

export interface CommandAction {
    action: 'delete' | 'update';
    filters: {
        roomIds?: string[];
        categories?: string[];
        itemIds?: string[];
    };
    changes: {
        margin?: { type: 'absolute' | 'relative'; value: number };
        qty?: { type: 'absolute' | 'relative'; value: number };
    };
}

export interface DrawingRevision {
    id: string; // Document ID of revision
    roundNumber: number;
    requestedAt: number; // using timestamp integer or string, typically timestamp
    requestDescription: string;
    cause: "CLIENT_REVISION" | "FFDS_DESIGN_MISS" | "SITE_CONDITION";
    chargeable: boolean;
    roundAdvances: boolean;
    chargeInvoiceId: string | null;
    classifiedBy: "system_ai" | string;
    classificationConfidence: number;
    classifiedAt: number;
}

export interface DrawingRound {
    roundNumber: number;
    issuedAt: number | null;
    issuedBy: string | null;
    clientFeedbackSubmittedAt: number | null;
    status: "not_issued" | "not_started" | "issued" | "in_review" | "approved" | "site_hold";
}

export interface DrawingComment {
    id: string;
    text: string;
    author: string;
    at: number;
    kind?: 'note' | 'client';
}

export interface DrawingTrackerItem {
    id: string;
    name: string;
    boqTriggers: string[];
    companionOf: string | null;
    isMandatory: boolean;
    isGapFlagged: boolean;
    currentRound: number;
    approvedAt: number | null;
    rounds: DrawingRound[];
    roomName?: string; // Optional room contextualization based on triggers
    driveUrl?: string; // AutoCAD, PDF or Google Drive URL link
    targetDate?: string; // Target Release Date (YYYY-MM-DD)
    priority?: 'high' | 'normal' | 'low';
    gfc?: {
        status: "pending" | "issued" | "superseded";
        issuedAt: number | null;
        issuedBy: string | null;
        boqVersionRef: string | null;
        clientApprovalRef: any | null;
    };
    comments?: DrawingComment[];
}

export interface AggregatedCategory {
    cost: number;
    sell: number;
    profit: number;
    items: FullBoqItem[];
}

export interface QuantitySuggestion {
    qty: number;
    rationale: string;
}

export interface ProposalTier {
    id: string;
    name: string;
    timestamp: number;
    boq: BoqItem[];
    projectContext: ProjectContext;
    summary: {
        totalSell: number;
        totalCost: number; // Added for precise cost tracking
        totalGm: number;
        itemCount: number;
        totalRevenue: number;
        designFee: number;
        blendedGm: number;
    };
    fullBoq?: FullBoqItem[]; // Optional extended prop for views
    executionTotal?: number; // Optional extended prop for views
    groupedBoq?: { [key: string]: FullBoqItem[] }; // Optional extended prop for views
    parentTierId?: string; // Links this tier to its parent for diffs
    lifecycleTag?: 'Draft' | 'Approved while booking' | 'Revised after design' | 'Superseded' | 'Current contract'; 
    assumedMargin?: number; // Used for What-if scenarios and discount headroom
}

export interface ComparisonRow {
    feature: string;
    [tierName: string]: string;
}

export interface AIGeneratedBoqItem {
    id: string;
    qty: number;
    margin: number;
    roomId?: string;
    rationale?: string;
    optional?: boolean;
}

export interface VisionAnalysisResult {
    roomType: string;
    observations: string[];
    suggestedItems: {
        name: string;
        category: string;
        qty: number;
        unit: string;
        rationale: string;
    }[];
}

export interface TimelinePhase {
    phaseName: string;
    description: string;
    startDay: number;
    durationDays: number;
    displayTime?: string;
}

export interface MaterialSuggestion {
    roomName: string;
    colorPalette: { name: string; hex: string }[];
    materials: { name: string; description: string }[];
}

export interface AiComparisonResult {
    materialMatrix: ComparisonRow[];
    scopeMatrix: ComparisonRow[];
    tierSummaries: { tierName: string; summary: string }[];
}

export interface LeadProfile {
    projectBrief?: string;
    iterationsToClose: '1' | '2' | '3+';
    hiddenDecisionMakers: 'None' | 'Spouse' | 'Parents' | 'Consultant';
    primaryFrictionPoint: 'Overall Budget' | 'Itemized Costs' | 'Timeline' | 'Design Details' | 'Trust';
    communicationPreference: 'Calls' | 'WhatsApp' | 'Emails';
}

export interface DecisionBrainOutput {
    recommended_proposal_depth: 'LEAN_SNAPSHOT' | 'STANDARD' | 'DETAILED';
    designer_avoidance_index: number;
    commitment_score: number;
    recommended_tiers: string[];
    margin_strategy: string;
    proposal_tone: string;
    followup_style: string;
    scope_bias: Record<string, boolean>;
    rationale_summary: string[];
    execution_risks: string[]; // Added this based on interactions
    flags: {
        discovery_required_before_proposal: boolean;
        proposal_should_wait_due_to_silence: boolean;
        high_flight_risk: boolean;
    };
}

export interface ProposalWriterOutput {
    // ... not strictly defined in errors but good to have if used
}

export interface AuditResult {
    score: number;
    warnings: string[];
    missingItems: string[];
    suggestions: string[];
}

export interface ValueEngineeringSuggestion {
    originalItemId: string;
    originalItemName: string;
    originalCost: number;
    alternativeName: string;
    alternativeSpecs: string;
    projectedSavings: number;
    impactAnalysis: string;
}

export interface ProfitabilityHotspot {
    itemId: string;
    itemName: string;
    totalProfit: number;
    profitMargin: number;
    rationale: string;
}

export interface TileConfig {
    lengthInches: number;
    widthInches: number;
    groutMm: number;
    tilesPerBox: number;
    wastagePercent: number;
}

export interface TileResult {
    totalAreaSqFt: number;
    effectiveAreaSqFt: number;
    tilesNeeded: number;
    boxesNeeded: number;
    adhesiveBags: number;
    groutKg: number;
}

export interface Expense {
    id: string;
    date: string;
    description: string;
    category: string;
    amount: number;
}

export type ExecutionBundleStatus = 'locked' | 'active' | 'ready' | 'completed' | 'blocked';

export interface DesignGateChecklistItem {
    done: boolean;
    confirmedBy?: string | null;
    confirmedAt?: any;
    autoChecked?: boolean;
    autoTriggered?: boolean;
    ownerOnly?: boolean;
    signOffReference?: string | null;
}

export interface DesignGateDoc {
    checklist: {
        item_1: DesignGateChecklistItem;
        item_2: DesignGateChecklistItem;
        item_3: DesignGateChecklistItem;
        item_4: DesignGateChecklistItem;
        item_5: DesignGateChecklistItem;
        item_6: DesignGateChecklistItem;
    };
    gateActivated: boolean;
    activatedAt?: any;
    activatedBy?: string | null;
    stage3InvoiceId?: string | null;
    readinessScore: number;
    lastAssessedAt?: any;
    override?: {
        approvedBy: string;
        reason: string;
        approvedAt: number;
    } | null;
}

// ---------------------------------------------------------------------------
// Design Gate — the Design → Execution handoff checkpoint. Soft-gate model:
// the checklist is advisory (never hard-locks Execution); the only hard lock
// is on BOQ rates after an explicit freeze. Stored on ProjectContext.designGate
// and persisted through dbService, so it works in Local and Cloud alike.
// ---------------------------------------------------------------------------
export interface DesignGateItem {
    key: string;
    /** Whether the studio has confirmed this item manually. */
    done: boolean;
    confirmedAt?: number | null;
    confirmedBy?: string | null;
    /** Optional supporting reference — e.g. client sign-off email/WhatsApp link. */
    reference?: string | null;
    /** Manual override state if user explicitly forced checked or unchecked */
    manualOverride?: 'checked' | 'unchecked' | null;
}

export interface DesignGateState {
    items: DesignGateItem[];
    activated: boolean;
    activatedAt?: number | null;
    activatedBy?: string | null;
    stage3InvoiceId?: string | null;
    /** Recorded when the user activates with items still outstanding (soft-override). */
    proceedAnyway?: { reason: string; by: string; at: number } | null;
    /** Audit trail of design-phase reopens after a premature freeze. */
    reopened?: { reason: string; by: string; at: number }[];
}

export interface ExecutionBundleGate {
    requiresGfc: boolean;
    status: 'blocked' | 'ready' | 'in_progress';
    blockedReason?: string;
    unblocksValue: number;
    overrideAudit?: {
        by: string;
        at: number;
        reason: string;
    } | null;
}

export interface ExecutionBundle {
    id: string;
    code: string;
    name: string;
    trade: string;
    itemIds: string[];
    totalValue: number;
    status: ExecutionBundleStatus;
    gate: string | ExecutionBundleGate;
    completionPercentage: number;
    startDate?: string;
    endDate?: string;
    actToday?: string;
    breaksTomorrow?: string;
    isOverridden?: boolean;
    gatekeepers?: { sof: boolean; payment: boolean; site: boolean };
    derivedFrom?: string[];
}

export interface SOFItem {
    id: string;
    name: string;
    category: string;
    location: string;
    linkedBundleId: string;
    specifications: { brand: string; code: string; finish: string };
    status: 'pending' | 'draft' | 'frozen' | 'ordered' | 'delivered';
    leadTimeDays?: number;
}

export interface Blocker {
    id: string;
    type: 'payment' | 'decision' | 'vendor' | 'procurement';
    description: string;
    impactLevel: 'critical' | 'high' | 'medium' | 'low';
    blockedBundleIds: string[];
    owner: 'client' | 'ops' | 'vendor';
    financialImpact: number;
    daysDelayed: number;
    resolved: boolean;
    impactsBundleId?: string;
    criticalDate?: string;
    severity?: 'high' | 'medium' | 'low';
}

export type OwnerType = 'client' | 'ops' | 'vendor';

export interface ExecutionAction {
    id: string;
    title: string;
    type: 'unblock' | 'verify' | 'procure';
    linkedBlockerId?: string;
    value: number;
    owner: OwnerType;
    status: 'pending' | 'done';
}

export interface DecisionDebt {
    id: string;
    itemCategory: string;
    daysPending: number;
    impact: string;
    resolved: boolean;
    financialImpact: number;
}

export interface ProcurementBatch {
    id: string;
    name: string;
    itemsCount: number;
    totalCost: number;
    orderBy: string;
    requiredBy: string;
    status: 'pending' | 'ordered' | 'delivered';
    risk: 'none' | 'low' | 'high';
}

export interface ExecutionUpdate {
    id: string;
    timestamp: number;
    text: string;
    type: 'general' | 'material' | 'progress';
    author: string;
    images?: string[];
}

export interface ActiveProject {
    drawingTracker?: any[];
    paymentGates?: any[];
    tasks?: any[];
    tierId: string;
    budget: number;
    startDate: string;
    expenses: Expense[];
    status: 'active' | 'completed' | 'paused' | 'work_paused';
    work_paused_reason?: string;
    executionData?: {
        bundles: ExecutionBundle[];
        sofItems: SOFItem[];
        blockers: Blocker[];
        actions: ExecutionAction[];
        decisions: DecisionDebt[];
        procurement: ProcurementBatch[];
        updates?: ExecutionUpdate[];
        lastUpdated: number;
    };
}

export interface GeneratedRender {
    id: string;
    timestamp: number;
    imageUrl: string;
    prompt: string;
    roomName: string;
    style: string;
}

export interface CanonicalProjectRecord {
    version: number;
    approvedAt: number;
    approvedBy?: string;
    projectContext: ProjectContext; // The official snapshot of project details
}

export interface CanonicalBOQ {
    version: number;
    approvedAt: number;
    approvedBy?: string;
    items: FullBoqItem[]; // The officially approved BOQ baseline
    totalValue: number;
}

export interface CanonicalPaymentLedger {
    milestones: PaymentMilestone[];
    paymentsReceived: { id: string; amount: number; date: string; reference?: string }[];
    totalPaid: number;
    totalDue: number;
}

export interface CanonicalStatus {
    stage: 'lead' | 'design' | 'execution' | 'handover' | 'completed' | 'paused' | 'lost';
    subState?: string;
    lastUpdatedAt: number;
}

export interface FullProjectData {
    id: string;
    tenantId?: string; // Multi-tenant isolation
    architecture?: 'legacy' | 'canonical'; // For differentiating old/new implementations
    lastModified: number;
    context: ProjectContext;
    tiers: ProposalTier[];
    activeTierId: string | null;
    activeProject: ActiveProject | null;
    materials: MaterialSuggestion[];
    timeline: TimelinePhase[];
    leadProfile: LeadProfile;
    decisionBrainOutput: DecisionBrainOutput | null;
    renders?: GeneratedRender[];
    totalChangeRequestCost?: number;
    
    // Canonical Data Models
    canonical?: {
        projectRecord?: CanonicalProjectRecord;
        boq?: CanonicalBOQ;
        paymentLedger?: CanonicalPaymentLedger;
        status?: CanonicalStatus;
    };
}

export interface ChatMessage {
    role: 'user' | 'ai';
    text: string;
    timestamp: number;
}

export type SiteVisitType = "site_visit" | "client_meeting" | "internal_meeting" | "vendor_meeting" | "measurement_survey";

export interface MOMAttendee {
    name: string;
    side: "client"|"ffds"|"vendor"|"unknown";
    role?: string;
}

export interface MOMDecision {
    id: string;
    text: string;
    linkedDecisionId?: string;
}

export interface MOMActionItem {
    id: string;
    text: string;
    owner: "client"|"ffds"|"vendor"|string;
    ownerName?: string;
    dueDate?: number; // timestamp
    status: "open"|"done"|"cancelled";
    flags: {
        scope?: boolean;
        drawing?: boolean;
        siteCondition?: boolean;
        cost?: boolean;
    };
    linkedScopeAdditionId?: string;
    linkedDrawingId?: string;
    linkedDecisionId?: string;
}

export interface MOMNote {
    id: string;
    text: string;
}

export interface MOM {
    id: string;
    momRef: string;
    meetingId: string;
    meetingType: SiteVisitType | "internal" | "vendor";
    meetingTitle?: string;
    meetingDate: number; // timestamp
    createdBy: string;
    createdAt: number;
    status: "draft" | "finalised" | "shared" | "acknowledged";
    attendees: MOMAttendee[];
    rawNotes: string;
    decisions: MOMDecision[];
    actionItems: MOMActionItem[];
    notes: MOMNote[];
    scopeFlagSummary?: string | null;
    aiGenerated: boolean;
    aiModel?: string;
    aiConfidence?: number;
    sharedAt?: number;
    shareToken?: string;
    acknowledgedBy?: string;
    acknowledgedAt?: number;
    ackChannel?: "link"|"whatsapp";
    pdfPath?: string;
}

export interface SiteVisit {
    id: string; // generated
    type: SiteVisitType;
    title: string;
    date: any; // Timestamp
    startTime: string; // "HH:MM"
    durationMinutes: number;
    phaseStepNumber: number;
    phaseTitle: string;
    attendees: string[];
    attendeeEmails: string[];
    notes: string;
    location: string;
    isVirtual: boolean;
    googleCalendarEventId: string | null;
    googleMeetUrl: string | null;
    calendarSynced: boolean;
    calendarSyncError: string | null;
    loggedBy: string;
    loggedAt: any; // Timestamp
    linkedSofItemIds: string[];
    linkedDecisionIds: string[];
    status?: "active" | "cancelled";
    cancelledAt?: any;
    cancelReason?: string;
    momData?: any;
}

export interface MaterialLogItem {
    description?: string;
    category?: string;
    specs?: string;
}

export interface CommunicationTemplateItem {
  key: string;
  phase: "design" | "execution";
  category: string;
  title: string;
  description?: string;
  trigger?: string;
  isRequired: boolean;
  linkedFeature?: string | null;
  defaultOrder?: number;
  email?: {
    subject: string;
    body: string;
  };
  whatsapp?: {
    body: string;
  };
  variables?: string[];
  isCustomised?: boolean;
  lastEditedAt?: any;
}

/**
 * Something the client sent the studio.
 *
 * The portal had a "Send Note to Studio Manager" box whose handler cleared the
 * textarea, closed the modal and told the client their message had been
 * dispatched. Nothing was written anywhere. Every message any client ever sent
 * through it was discarded, and they were told otherwise.
 *
 * Stored on the project so it reaches the studio through the same projection
 * and rules as every other client action.
 */
export interface ClientMessage {
  id: string;
  /** What they wrote, verbatim. */
  text: string;
  sentAt: string;
  sentBy: string;
  /** Set when a studio member marks it dealt with. */
  readAt?: string | null;
  readBy?: string | null;
  /** The finish or document it was sent from, when it came from one. */
  aboutKind?: 'selection' | 'document' | 'general';
  aboutId?: string | null;
  aboutLabel?: string | null;
}

export interface CommunicationLogItem {
  key: string;
  status: "pending" | "sent" | "not_applicable";
  sentAt: any | null; // Timestamp
  sentBy: string | null;
  sentByName: string | null;
  sentVia: "email" | "whatsapp" | "both" | null;
  invoiceRef: string | null;
  notes: string;
  lastUpdatedAt: any; // Timestamp
  
  // Appended in the hook for UI state
  needsAttention?: boolean;
}



export interface ManualJourneyStep {
    stepId: string;
    /* Absent on a record written purely to timestamp an auto-completion. */
    status?: 'done' | 'pending';
    /**
     * When the engine first observed a self-validating step as done.
     *
     * Not the same claim as `completedAt`: it is the first time the app
     * noticed, which for anything completed before this field existed is
     * simply unknown. Stored separately so the auto rule stays the authority
     * on status — a record carrying only this must not make a step stick.
     */
    firstDoneAt?: any | null;
    /** True only if the app watched this step turn from open to done. */
    firstDoneObserved?: boolean;
    completedAt: any | null; // Timestamp
    completedBy: string | null;
    completedByName: string | null;
    note?: string;
}

export interface TermsDocket {
  id?: string;
  projectId?: string;
  docketRef: string;
  status: "draft" | "sent" | "acknowledged" | "issued";
  generatedAt: number;
  sentAt: number | null;
  sentBy: string;
  acknowledgedAt: number | null;
  snapshotTermsConfig: TermsSettings;
  snapshotClientData: {
    clientName: string;
    projectName: string;
    date: string;
  };
}

export interface PaymentAdvance {
  advanceCode: string;
  label: string;
  phase: "design" | "execution" | "handover";
  percentage: number;
  isFixedAmount?: boolean;
  fixedAmount?: number;
  amount: number;
  dueCondition: string;
  unlocks: string;
  status: "pending" | "advance_requested" | "received";
  invoiceRef: string | null;
  receivedAt: number | null;
  isHandoverAdvance: boolean;
}

export interface PaymentSchedule {
  id?: string;
  projectId?: string;
  version: number;
  versionLabel: string;
  status: "draft" | "sent" | "superseded" | "issued" | "acknowledged";
  docketRef: string;
  issuedAt: number;
  issuedBy: string;
  contractValue: number;
  advances: PaymentAdvance[]; // keeping for backwards compatibility, or we can replace it
  snapshotPaymentStructure?: PaymentStructure;
  snapshotEngagement?: ProjectEngagement;
  snapshotTermsConfig?: TermsSettings;
  revisionNote: string;
  supersededBy: string | null;
}

export interface TermsSectionBlock {
  type: "clause" | "callout" | "table";
  ref?: string;
  text?: string;
  style?: "principle" | "highlight";
  label?: string;
  intro?: string;
  source?: "warrantyPeriods" | "snagCategories";
  note?: string;
}

export interface TermsSection {
  n: number;
  title: string;
  recommended?: boolean;
  blocks: TermsSectionBlock[];
}

export interface TermsSettings {
  docketRefPrefix: string;
  studioFoundedYear: number;
  includedRevisionRounds: number;
  changeRequestResponseDays: number;
  paymentOverdueGraceDays: number;
  resumeAfterPaymentDays: number;
  gstRate: number;
  paymentMethods: string[];
  snagCategories: { label: string; resolveDays: number }[];
  warrantyPeriods: { trade: string; months: number }[];
  disputeMediationDays: number;
  disputeJurisdiction: string;
  signatory: { name: string; title: string };
  preamble: string;
  sections: TermsSection[];
}

export interface PaymentStructureStage {
  code: string;
  name: string;
  pct: number;
  trigger: string;
  unlocks: string;
}

export interface PaymentStructure {
  designStages: PaymentStructureStage[];
  executionStages: PaymentStructureStage[];
  handoverClause: string;
  validation: {
    designSumMustEqual: number;
    executionSumMustEqual: number;
  };
}

export interface ProjectEngagement {
  designFee: number | null;
  executionValue: number | null;
  docketRef: string | null;
  termsVersion: number | null;
  paymentScheduleVersion: number | null;
  status: "draft" | "issued" | "acknowledged";
  issuedAt: number | null;
  acknowledgedAt: number | null;
  acknowledgedVia: "WhatsApp" | "email" | null;
  lockedSnapshot: any | null;
  history?: any[];
}

// ---------------------------------------------------------------------------
// PROCUREMENT — purchase orders raised against BOQ-derived budget envelopes.
// An "envelope" is a room × category budget computed from the BOQ; POs are
// tagged to one. Nothing here stores a budget or a sell price.
// ---------------------------------------------------------------------------

/** How a package is bought. Split = separate material and labour vendors.
 *  Turnkey = one subcontractor covers material, hardware and labour. */
export type ProcurementMode = 'split' | 'turnkey';

/** What a given purchase order covers. */
export type POScope = 'material' | 'labour' | 'turnkey';

export type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'issued'
  | 'received'
  | 'closed'
  | 'cancelled';

export type POPaymentType = 'advance' | 'part' | 'final';

export interface Vendor {
    id: string;
    name: string;
    /** A vendor may supply more than one thing. */
    supplies: POScope[];
    categories?: string[];        // matches Item.cat, e.g. 'Carpentry'
    phone?: string;
    email?: string;
    gstin?: string;
    paymentTerms?: string;        // free text, e.g. "50% advance"
    defaultLeadDays?: number;
    notes?: string;
    active: boolean;
    createdAt: number;
}

export interface POLine {
    id: string;
    description: string;
    unit?: string;
    qty: number;
    rate: number;
    amount: number;               // qty × rate, stored so a PO prints identically forever
    materialSelectionId?: string; // optional link back to a MaterialSelection
}

export interface POPayment {
    id: string;
    type: POPaymentType;
    amount: number;
    paidOn: string;               // ISO date
    mode?: string;                // 'bank' | 'upi' | 'cash' | 'cheque'
    reference?: string;
    note?: string;
}

export interface PurchaseOrder {
    id: string;
    poNumber: string;
    projectId: string;
    vendorId: string;
    vendorName: string;           // denormalised so a printed PO never changes
    scope: POScope;
    status: POStatus;

    /** Envelope tag — roomId is the room NAME, matching BoqItem.roomId convention. */
    roomId: string;
    category: string;

    lines: POLine[];
    subtotal: number;
    taxRate: number;              // percent, e.g. 18
    total: number;                // subtotal + tax, stored

    expectedDelivery?: string;    // ISO date
    terms?: string;
    notes?: string;
    issuedAt?: number | null;

    // Lightweight receipt — deliberately not a GRN document
    receivedAt?: number | null;
    receivedNote?: string | null;

    // The vendor's actual bill. A bill is fields on the PO, not its own object.
    billNumber?: string | null;
    billAmount?: number | null;
    billDate?: string | null;

    /** Payments attach to the PO, so an advance can exist before any bill. */
    payments: POPayment[];

    createdBy?: string;
    approvedBy?: string | null;
    createdAt: number;
    updatedAt: number;
}

export interface WeeklyReport {
    id: string;
    weekOf: string;             // ISO date of the Monday
    weekNumber: number;
    thisWeek: string;           // narrative
    nextWeek: string;
    roomProgress?: Record<string, { progress: number; stage: string }>;
    drawingProgress?: any;
    photos: string[];           // data URLs or storage refs
    asks: { kind: 'decision' | 'payment'; label: string; detail: string }[];
    publishedAt?: number | null;
    sharedVia?: string[];
}


// ---------------------------------------------------------------------------
// CLIENT DOCUMENTS — the record a client is actually shown and asked to sign.
//
// A signature is worth exactly as much as the evidence that the signer read the
// record. Everything below exists to produce that evidence: an immutable, hashed
// snapshot of what was released, proof of how it was read, and a channel for the
// client to question a clause rather than simply go quiet.
// ---------------------------------------------------------------------------

/** Every client-facing document in the engagement. */
export type ClientDocumentKind =
  | 'terms_docket'
  | 'payment_schedule'
  | 'execution_agreement'
  | 'onboarding_kit'
  | 'handover_docket'
  /* The snag list is a pre-requisite for handover, so the client signs it:
     it is the record that every defect raised was closed or accepted before
     possession changed hands. */
  | 'snag_list';

/** Lifecycle of one document, from the client's point of view. */
export type DocumentState =
  | 'draft'      // studio is still editing; not in the client's vault
  | 'issued'     // released, never opened
  | 'viewed'     // client has opened the current issue
  | 'queried'    // client asked about a clause — ball is with the studio
  | 'amended'    // re-issued after the client last read it
  | 'signed'     // client executed
  | 'executed';  // studio counter-signed

/**
 * A section the client must acknowledge individually before the signature pad
 * unlocks. Keep this list short — six is a sensible ceiling. Ticking through
 * fifteen boxes of boilerplate trains people to click without reading, which
 * destroys the very evidence this exists to create.
 */
export interface MaterialSection {
    /** Matches TermsSection.n or a clause ref such as "4.2". */
    ref: string;
    title: string;
    /** Plain-English restatement shown beside the tick box. */
    plainSummary: string;
    /** Seconds the section must be on screen before the box enables. Default 4. */
    minDwellSeconds?: number;
}

/**
 * An immutable release. The client reads and signs THIS — never a live render
 * that would silently change when Studio Settings are edited next month.
 */
export interface DocumentIssue {
    id: string;
    kind: ClientDocumentKind;
    /** Increments on every re-issue. */
    version: number;
    /** Human reference, e.g. FFDS-TD-2026-418. */
    reference: string;
    issuedAt: number;
    issuedBy: string;
    /** Frozen payload the renderer consumes. Shape depends on `kind`. */
    snapshot: any;
    /** Deterministic hash of `snapshot`. Printed on the signature certificate. */
    contentHash: string;
    materialSections: MaterialSection[];
    /**
     * Whether the client may see THIS issue yet.
     *
     * Releasing a document used to reach the client the instant the studio
     * clicked it, so a re-issue silently replaced whatever the client was
     * reading — including a version they had already signed. A new issue is
     * now staged as a draft and becomes visible when ops publishes it, the
     * same gate every other client-facing record goes through.
     *
     * Absent means visible: issues released before this existed stay where
     * they are rather than disappearing from the client's portal.
     */
    clientVisibility?: import('./lib/clientVisibility').ClientVisibility;
    /** Set when this issue replaces an earlier one — drives the redline. */
    supersedes?: string | null;
    supersededAt?: number | null;

    /**
     * The client's signature on THIS issue.
     *
     * A signed document is never edited in place — that would destroy the
     * evidence chain the whole reading-room design exists to create. Every
     * issue therefore carries its own signature, which is what lets an
     * addendum be signed separately without disturbing the agreement it varies.
     */
    clientSignature?: DigitalSignatureDocket | null;
    /** Studio-side execution. An agreement signed by one party is a request. */
    counterSignature?: DigitalSignatureDocket | null;

    // ── Addendum chain ────────────────────────────────────────────────────
    /**
     * Issue id of the SIGNED document this one varies. Unlike `supersedes`,
     * the parent stays live and signed — an addendum sits alongside it,
     * exactly as a contract variation does on paper.
     */
    addendumTo?: string | null;
    /** Clause refs in the parent that this addendum changes. */
    amendsClauses?: string[];
    /** Plain-English statement of what is changing, and why. */
    amendmentSummary?: string | null;

    // ── Delivery ──────────────────────────────────────────────────────────
    /** How the studio sent it, for the audit trail. */
    releasedVia?: ('portal' | 'email' | 'whatsapp')[];
    releaseNote?: string | null;
    /** Nudges the studio has sent since release. */
    reminders?: { at: number; by: string; via: string }[];

    /**
     * Set when an issue is retired without being signed — currently used to
     * retire snapshots built by the old rebuilt-document renderers. The issue
     * stays in history so the trail still shows what the client was sent.
     */
    withdrawnAt?: number | null;
    withdrawnReason?: string | null;
}

/** Proof the signatory actually engaged with the record. */
export interface ReadingEvidence {
    issueId: string;
    contentHash: string;
    openedAt: number;
    signedAt: number;
    totalDwellSeconds: number;
    maxScrollPercent: number;
    sectionsAcknowledged: {
        ref: string;
        acknowledgedAt: number;
        dwellSeconds: number;
    }[];
    documentDownloaded: boolean;
    device: string;
    viewport: string;
}

/**
 * A question against one clause. The alternative to a client silently not
 * signing — which tells the studio nothing about why.
 */
export interface ClauseQuery {
    id: string;
    issueId: string;
    documentKind: ClientDocumentKind;
    clauseRef: string;
    /** Verbatim, so the studio sees the exact words the client was reading. */
    clauseExcerpt: string;
    raisedBy: string;
    raisedAt: number;
    question: string;
    status: 'open' | 'answered' | 'amended' | 'withdrawn';
    replies: {
        at: number;
        by: string;
        side: 'studio' | 'client';
        text: string;
    }[];
    /** Set when the studio resolved it by re-issuing the document. */
    resolvedByIssueId?: string | null;
}

/** Hangs off ProjectContext under `documents`. */
export interface ProjectDocumentState {
    issues: DocumentIssue[];
    queries: ClauseQuery[];
    /** kind → last time the client opened the current issue. */
    lastViewedAt?: Partial<Record<ClientDocumentKind, number>>;
}

/** One field-level difference between two issues, for the redline. */
export interface IssueDiffEntry {
    path: string;
    /** Client-readable, e.g. "Clause 4.2 — payment grace period". */
    label: string;
    before: string;
    after: string;
    changeType: 'added' | 'removed' | 'changed';
}
