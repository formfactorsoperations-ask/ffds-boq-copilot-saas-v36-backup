
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
}

export type UserRole = 'Super Admin' | 'Admin' | 'Ops Director' | 'Site Supervisor' | 'Vendor';

export interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    status: 'Active' | 'Pending';
}

export type AIStrategy = 'balanced' | 'conservative' | 'aggressive';

export type AIStatus = 'checking' | 'online' | 'error' | 'unavailable';

export type DesignFeeType = 'percentage' | 'fixed_sqft' | 'fixed_lumpsum';

export type PropertyStatus = 'raw_shell' | 'semi_finished' | 'finished';

export type ProposalType = 'TURNKEY' | 'DESIGN_ONLY';

export type ProjectStatus = 'lead' | 'draft' | 'proposal_sent' | 'negotiation' | 'won' | 'execution' | 'work_paused' | 'completed' | 'lost';

export type ProposalLevel = 'LEVEL_1' | 'LEVEL_1_5' | 'LEVEL_2' | 'LEVEL_3';

export interface Room {
    name: string;
    size: number;
    unit: 'sq ft';
    length?: number;
    width?: number;
    height?: number;
    notes?: string;
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
    needsSignoffRouting?: boolean;

    changeRequestedAt?: string | null;
    changeReason?: string | null;
    changeRequestedBy?: string | null;
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

export interface ProjectDecisionRecord {
    id: string;
    date: string;
    title: string;
    roomId?: string; // Newly added
    photoUrl?: string; // Newly added
    status: 'pending' | 'confirmed' | 'changed' | 'proposed' | 'revoked' | 'rejected';
    
    // Legacy fields (kept for backward compatibility if needed)
    description?: string;
    requestedBy?: 'client' | 'ffds';
    confirmingParty?: string;
    impactSchedule?: string;
    impactCost?: string;
    proofText?: string;
}

export interface ProjectLifecycle {
    stage: 'pre_sales' | 'design' | 'execution' | 'handover' | 'completed';
    subState?: string;
    gate?: {
        done: number;
        total: number;
    };
    updatedAt: string;
    updatedBy?: string;
}


export interface ReportCorrection {
    id: string;
    fieldPath: string; // e.g. 'paymentPlan[0].status' or 'healthLabel'
    originalValue: any;
    correctedValue: any;
    reason: string;
    correctedBy: string;
    correctedAt: number;
    mismatchTaskId?: string;
    state: 'active' | 'retired';
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

export interface WeeklyPulseReport {
  photos?: string[];
  corrections?: ReportCorrection[];
  id: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  publishedAt?: string;
  executiveBriefing: string;
  nextWeekPlan?: string;
  manualActions?: { id: string; text: string; assignee: 'client'|'studio' }[];
  roomProgress?: Record<string, number>;
  revisions?: { id: string; drawing: string; change: string; category: string; charge: string }[];
  selections?: { id: string; category: string; selectedCount: number; totalCount: number; pendingText: string }[];
  status?: 'building' | 'published';
  syncCount?: number;
  syncedAt?: number;
  paymentPlan?: any[];
  avgClearanceDays?: number;
  healthLabel?: 'On Track' | 'At Risk' | 'Delayed';
  deltas?: Record<string, number>;
  activities?: { date: string, text: string }[];
  velocity?: { clientAvgHours?: number; studioAvgHours?: number; coveragePercent: number; };
  categoryProgress?: { category: string; percentage: number; roomsCovered: number; totalRooms: number; }[];
  openItems?: { client: { text: string; date?: string; type: string }[]; studio: { text: string; date?: string; type: string }[]; };
  revisionLedger?: { clientRequested: number; siteCondition: number; internalRefinement: number; unclassified: number; chargeableSummary: string[]; };
  sectionVisibility: {
    weekAtGlance: boolean;
    governance: boolean;
    designProgress: boolean;
    revisions: boolean;
    financials: boolean;
    siteProgress: boolean;
    selections: boolean;
    upcomingPlan: boolean;
    actionRequired: boolean;
  };
  studioNotes: Record<string, string>;
}

export interface ProjectContext {
    name: string;
    location: string;
    area: number;
    config: string;
    rooms: Room[];
    adHocItems?: Item[];
    ceilingHeight?: number;
    designFee?: number;
    designFeeType?: DesignFeeType;
    designScope?: DesignScope;
    propertyStatus?: PropertyStatus;
    proposalType?: ProposalType;
    gstRate?: number;
    theme?: string; // e.g., 'Modern Minimalist', 'Japandi'
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    coverStyle?: 'minimal' | 'bold' | 'photo'; // Newly added property
    logoImage?: string;
    logoHeight?: number;
    approvedTierId?: string;
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
    contractSignoff?: {
        status: 'pending' | 'sent' | 'signed' | 'disputed';
        token?: string;
        sentAt?: any;
        signedAt?: any;
        clientName?: string;
        ipAddress?: string;
        refId?: string;
    };
    handoverSignoff?: {
        status: 'pending' | 'sent' | 'signed' | 'disputed';
        token?: string;
        sentAt?: any;
        signedAt?: any;
        clientName?: string;
        ipAddress?: string;
        refId?: string;
    };
    designAgreementSignoff?: {
        status: 'pending' | 'sent' | 'signed' | 'disputed';
        token?: string;
        sentAt?: any;
        signedAt?: any;
        clientName?: string;
        ipAddress?: string;
        refId?: string;
    };
    floorplanImage?: string;
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
        phaseProgress: { done: number; total: number }[];
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
    paintPalettes?: PaintPalette[];
    designDocuments?: DesignDocument[]; // URLs for approved design PDFs
    projectDecisions?: ProjectDecisionRecord[];
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
    engagement?: ProjectEngagement;
    weeklyReportCommentaries?: Record<string, string>;
    weeklyPulseReports?: WeeklyPulseReport[];
    weeklyRoomProgress?: Record<string, Record<string, { progress: number; stage: string }>>;
    weeklyDrawingProgress?: Record<string, Record<string, string>>;
    executionApprovedByFFDS?: boolean;
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
}

export interface FullBoqItem extends Item, BoqItem {
    // Merged properties from Item and BoqItem
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
    gfc?: {
        status: "pending" | "issued" | "superseded";
        issuedAt: number | null;
        issuedBy: string | null;
        boqVersionRef: string | null;
        clientApprovalRef: any | null;
    };
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

export interface FullProjectData {
    id: string;
    tenantId?: string; // Multi-tenant isolation
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
}

export interface ChatMessage {
    role: 'user' | 'ai';
    text: string;
    timestamp: number;
}

export type SiteVisitType = "site_visit" | "client_meeting";

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
    status: 'done' | 'pending';
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
