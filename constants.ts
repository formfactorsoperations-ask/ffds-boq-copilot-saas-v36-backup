
import { Item, ProposalContent, CommunicationTemplateItem } from './types';

export const COMMUNICATION_TEMPLATE_DEFAULT: CommunicationTemplateItem[] = [
  { key: "terms_docket_sent", phase: "design", category: "Onboarding & Acquisition", title: "Terms of Engagement Docket Sent", trigger: "First contact — send before Discovery Workshop or proposal", isRequired: true, linkedFeature: "terms_docket", defaultOrder: 0, description: "" },
  { key: "payment_schedule_sent", phase: "design", category: "Onboarding & Acquisition", title: "Advance Payment Schedule Sent", trigger: "Sent alongside or immediately after Design Agreement signing", isRequired: true, linkedFeature: "payment_schedule", defaultOrder: 0.5, description: "" },
  { key: "discovery_call_confirmation", phase: "design", category: "Onboarding & Acquisition", title: "Initial Discovery Call Confirmation", trigger: "Project created / first client contact made", isRequired: true, linkedFeature: null, defaultOrder: 1, description: "" },
  { key: "proposal_sent", phase: "design", category: "Onboarding & Acquisition", title: "Proposal Sent Notification", trigger: "Client Proposal exported or shared via Client Portal", isRequired: true, linkedFeature: "client_proposal", defaultOrder: 2, description: "" },
  { key: "contract_sent", phase: "design", category: "Onboarding & Acquisition", title: "Project Won — Contract Sent", trigger: "Project status set to Won / Contract generated", isRequired: true, linkedFeature: "contract", defaultOrder: 3, description: "" },
  { key: "onboarding_kit_sent", phase: "design", category: "Onboarding & Acquisition", title: "Onboarding Kit Sent", trigger: "Onboarding Kit exported", isRequired: true, linkedFeature: "onboarding_kit", defaultOrder: 4, description: "" },
  { key: "brief_freeze_confirmation", phase: "design", category: "Design Progress", title: "Design Brief Freeze Confirmation", trigger: "Client confirms requirements locked \u2014 no changes", isRequired: true, linkedFeature: null, defaultOrder: 5, description: "" },
  { key: "space_planning_review", phase: "design", category: "Design Progress", title: "Space Planning Ready for Review", trigger: "Floor plans and layouts shared with client", isRequired: true, linkedFeature: null, defaultOrder: 6, description: "" },
  { key: "3d_visuals_review", phase: "design", category: "Design Progress", title: "3D Visuals Ready \u2014 Review Request", trigger: "3D renders completed and sent for sign-off", isRequired: true, linkedFeature: null, defaultOrder: 7, description: "" },
  { key: "revision_acknowledged", phase: "design", category: "Design Progress", title: "Design Revision Round Acknowledged", trigger: "Client requests revisions \u2014 confirm receipt + timeline", isRequired: false, linkedFeature: null, defaultOrder: 8, description: "" },
  { key: "design_approval_boq", phase: "design", category: "Closure & Payment", title: "Design Approval + BOQ Shared", trigger: "Client approves design \u2014 BOQ sent for review", isRequired: true, linkedFeature: null, defaultOrder: 9, description: "" },
  { key: "design_fee_payment", phase: "design", category: "Closure & Payment", title: "Design Fee Payment Request", trigger: "Design milestone raised in Payment Calc", isRequired: true, linkedFeature: "payment_calc", defaultOrder: 10, description: "" },
  { key: "revision_round_2", phase: "design", category: "Closure & Payment", title: "Revision Round 2 Acknowledgement", trigger: "Only if a second revision round happens", isRequired: false, linkedFeature: null, defaultOrder: 11, description: "" },
  { key: "portal_access_shared", phase: "design", category: "Closure & Payment", title: "Client Portal Access Link Shared", trigger: "Client portal activated and link sent", isRequired: false, linkedFeature: null, defaultOrder: 12, description: "" },
  { key: "work_order_confirmation", phase: "execution", category: "Kickoff & Civil", title: "Work Order Confirmation + 30% Payment Request", trigger: "Payment Calc \u2014 Work Order Confirmation milestone raised", isRequired: true, linkedFeature: "payment_calc", defaultOrder: 13, description: "" },
  { key: "execution_start", phase: "execution", category: "Kickoff & Civil", title: "Execution Start Notification", trigger: "Work begins on site", isRequired: true, linkedFeature: null, defaultOrder: 14, description: "" },
  { key: "civil_completion_payment", phase: "execution", category: "Kickoff & Civil", title: "Civil Work Completion + 30% Payment Request", trigger: "Payment Calc \u2014 Civil Work Completion milestone raised", isRequired: true, linkedFeature: "payment_calc", defaultOrder: 15, description: "" },
  { key: "material_selections_reminder", phase: "execution", category: "Progress", title: "Material Selections Deadline Reminder", trigger: "SOF has items in \"To Select\" and execution is progressing", isRequired: false, linkedFeature: null, defaultOrder: 16, description: "" },
  { key: "painting_stage_start", phase: "execution", category: "Progress", title: "Painting & Installation Stage Started", trigger: "Painting phase begins on site", isRequired: false, linkedFeature: null, defaultOrder: 17, description: "" },
  { key: "painting_stage_invoice", phase: "execution", category: "Progress", title: "Painting & Installation Stage Invoice Raised", trigger: "Payment Calc \u2014 Painting & Installation milestone raised", isRequired: true, linkedFeature: "payment_calc", defaultOrder: 18, description: "" },
  { key: "pre_handover_walkthrough", phase: "execution", category: "Handover", title: "Pre-Handover Walkthrough Invitation", trigger: "Project near completion \u2014 invite client for walkthrough", isRequired: true, linkedFeature: null, defaultOrder: 19, description: "" },
  { key: "final_payment_request", phase: "execution", category: "Handover", title: "Final 10% Payment Request \u2014 Completion & Handover", trigger: "Payment Calc \u2014 Completion and Handover milestone \"Raise Invoice\"", isRequired: true, linkedFeature: "payment_calc", defaultOrder: 20, description: "" },
  { key: "handover_warranty", phase: "execution", category: "Handover", title: "Project Handover + Warranty Information", trigger: "Final payment received \u2014 send warranty doc and confirmation", isRequired: true, linkedFeature: null, defaultOrder: 21, description: "" }
];

export const UOM_OPTIONS = ['sq ft', 'rft', 'nos', 'lumpsum', 'kg', 'lot', 'points'];

export const AI_STRATEGIES = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Standard market calculation. Adds 5-10% wastage buffer.',
    icon: '⚖️'
  },
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Safety first. Adds 15-20% buffer to quantities to avoid shortages.',
    icon: '🛡️'
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Lean & competitive. Exact net quantities with minimal buffer.',
    icon: '🚀'
  },
];

export const INITIAL_BANK: Item[] = [
  // Carpentry - Entrance & Foyer
  { id: 'gen-001', name: 'SECURITY DOOR LAMINATE FINISH', cat: 'Carpentry', specs: 'Custom fabrication and installation of Security door laminate finish, including carcass, shutters/panels, basic hardware and laminate/paint finish as per approved drawings.', unit: 'sq ft', materials: 1330, labor: 570, margin: 15 },
  { id: 'gen-002', name: 'WALL PANELLING', cat: 'Carpentry', specs: 'Execution of Wall panelling including required materials, labour, installation and finishing as per approved drawings and site conditions.', unit: 'sq ft', materials: 735, labor: 315, margin: 15 },
  { id: 'gen-003', name: 'SHOE CABINET', cat: 'Carpentry', specs: 'Custom fabrication and installation of Shoe cabinet, including carcass, shutters/panels, basic hardware and laminate/paint finish as per approved drawings.', unit: 'sq ft', materials: 1015, labor: 435, margin: 20 },
  { id: 'gen-004', name: 'MAIN DOOR RELAMINATE / CHANGE', cat: 'Carpentry', specs: 'Custom fabrication and installation of Main door relaminate / change, including carcass, shutters/panels, basic hardware and laminate/paint finish as per approved drawings.', unit: 'lumpsum', materials: 7500, labor: 7500, margin: 20 },
  
  // Carpentry - Living Room
  { id: 'gen-005', name: 'T.V. UNIT(DRAWER)', cat: 'Carpentry', specs: 'Custom fabrication and installation of T.v. unit(drawer), including carcass, shutters/panels, basic hardware and laminate/paint finish as per approved drawings.', unit: 'sq ft', materials: 1260, labor: 540, margin: 15 },
  { id: 'gen-006', name: 'TV WALL PANELLING', cat: 'Carpentry', specs: 'Custom fabrication and installation of Tv wall panelling, including carcass, shutters/panels, basic hardware and laminate/paint finish as per approved drawings.', unit: 'sq ft', materials: 735, labor: 315, margin: 15 },
  { id: 'gen-007', name: 'MANDIR - LAMINATE FINISH', cat: 'Carpentry', specs: 'Custom fabrication and installation of Mandir - laminate finish, including carcass, shutters/panels, basic hardware and laminate/paint finish as per approved drawings.', unit: 'sq ft', materials: 1470, labor: 630, margin: 15 },
  { id: 'gen-008', name: 'SHOWCASE UNIT', cat: 'Carpentry', specs: 'Execution of Showcase unit including required materials, labour, installation and finishing as per approved drawings and site conditions.', unit: 'sq ft', materials: 1260, labor: 540, margin: 15 },
  { id: 'gen-009', name: 'CROCKERY UNIT', cat: 'Carpentry', specs: 'Custom fabrication and installation of Crockery unit, including carcass, shutters/panels, basic hardware and laminate/paint finish as per approved drawings.', unit: 'sq ft', materials: 1470, labor: 630, margin: 15 },
  
  // Modular Kitchen
  { id: 'gen-010', name: 'CABINETS BELOW COUNTER (TANDEM)', cat: 'Modular Kitchen', specs: 'Storage with shutter & Tandem Box. Custom fabrication, carcass, shutters/panels, basic hardware, laminate/paint finish.', unit: 'sq ft', materials: 2400, labor: 800, margin: 10 },
  { id: 'gen-011', name: 'WALL CABINETS MODULAR (TANDEM)', cat: 'Modular Kitchen', specs: 'Wall cabinets modular - tandem box, including carcass, shutters/panels, basic hardware and laminate/paint finish.', unit: 'sq ft', materials: 2025, labor: 675, margin: 10 },
  { id: 'gen-012', name: 'LOFT CABINETS MODULAR', cat: 'Modular Kitchen', specs: 'Custom fabrication of Loft cabinets modular, including carcass, shutters/panels, basic hardware and laminate/paint finish.', unit: 'sq ft', materials: 1260, labor: 540, margin: 10 },
  { id: 'gen-037', name: 'CABINETS BELOW COUNTER (SS)', cat: 'Modular Kitchen', specs: 'Storage with shutter - SS. Custom fabrication including carcass, shutters/panels, basic hardware and laminate/paint finish.', unit: 'sq ft', materials: 1610, labor: 690, margin: 10 },
  { id: 'gen-038', name: 'WALL CABINETS MODULAR (SS)', cat: 'Modular Kitchen', specs: 'Wall cabinets modular - ss, including carcass, shutters/panels, basic hardware and laminate/paint finish.', unit: 'sq ft', materials: 1470, labor: 630, margin: 10 },

  // Carpentry - Bedrooms
  { id: 'gen-013', name: 'WARDOBE WITH LOFT (LESS DEPTH)', cat: 'Carpentry', specs: 'Custom fabrication of Wardobe with loft(less depth), carcass, shutters/panels, basic hardware and laminate/paint finish.', unit: 'sq ft', materials: 1190, labor: 510, margin: 15 },
  { id: 'gen-014', name: 'WARDOBE WITH LOFT', cat: 'Carpentry', specs: 'Custom fabrication of Wardobe with loft, including carcass, shutters/panels, basic hardware and laminate/paint finish.', unit: 'sq ft', materials: 1295, labor: 555, margin: 15 },
  { id: 'gen-015', name: 'KING SIZE BED WITH STORAGE', cat: 'Carpentry', specs: 'Fabrication or supply of King size bed with storage, including basic upholstery/finish and placement.', unit: 'sq ft', materials: 1260, labor: 540, margin: 15 },
  { id: 'gen-016', name: 'HEADBOARD', cat: 'Carpentry', specs: 'Custom fabrication of Headboard, including carcass, shutters/panels, basic hardware and laminate/paint finish.', unit: 'sq ft', materials: 600, labor: 400, margin: 15 },
  { id: 'gen-018', name: 'QUEEN SIZE BED WITH STORAGE', cat: 'Carpentry', specs: 'Fabrication or supply of Queen size bed with storage, including basic upholstery/finish and placement.', unit: 'sq ft', materials: 1260, labor: 540, margin: 15 },
  { id: 'gen-019', name: 'STUDY UNIT WITH SHELFS', cat: 'Carpentry', specs: 'Custom fabrication of Study unit with shelfs, including carcass, shutters/panels, basic hardware and laminate/paint finish.', unit: 'sq ft', materials: 910, labor: 390, margin: 15 },
  { id: 'gen-020', name: 'BATHROOM VANITY', cat: 'Carpentry', specs: 'Custom fabrication of Bathroom vanity, including carcass, shutters/panels, basic hardware and laminate/paint finish.', unit: 'sq ft', materials: 1470, labor: 630, margin: 20 },
  
  // Glass & Mirror
  { id: 'gen-017', name: 'DRESSING MIRROR', cat: 'Glass & Mirror', specs: 'Providing and fixing Dressing mirror without storage with polished edges and necessary supports/fixtures.', unit: 'sq ft', materials: 700, labor: 300, margin: 15 },
  { id: 'gen-029', name: 'BATHROOM MIRRORS', cat: 'Glass & Mirror', specs: 'Supply and placement of Bathroom mirrors as loose furniture/fitting.', unit: 'lumpsum', materials: 4000, labor: 0, margin: 10 },

  // Civil & False Ceiling
  { id: 'gen-021', name: 'POP FALSE CEILING (Standard)', cat: 'Civil', specs: 'Providing and fixing Pop false ceiling with framing, boarding, jointing and smooth finish, cut-outs for lights.', unit: 'sq ft', materials: 57, labor: 38, margin: 20 },
  { id: 'gen-034', name: 'POP FALSE CEILING (Living Room)', cat: 'Civil', specs: 'Providing and fixing Pop false ceiling - living room only with framing, boarding, jointing and smooth finish.', unit: 'sq ft', materials: 57, labor: 38, margin: 20 },
  
  // Painting
  { id: 'gen-022', name: 'INTERIOR PAINTING (Standard)', cat: 'Painting', specs: 'Surface preparation, primer and Interior painting, including putty touch-up and two coats of paint.', unit: 'sq ft', materials: 27, labor: 18, margin: 20 },
  { id: 'gen-023', name: 'INTERIOR CEILING PAINTING', cat: 'Painting', specs: 'Surface preparation, primer and Interior ceiling painting, including putty touch-up and two coats of paint.', unit: 'sq ft', materials: 27, labor: 18, margin: 20 },
  { id: 'gen-035', name: 'INTERIOR PAINTING (Living Room)', cat: 'Painting', specs: 'Surface preparation, primer and Interior painting - living room only.', unit: 'sq ft', materials: 27, labor: 18, margin: 20 },
  { id: 'gen-036', name: 'INTERIOR CEILING PAINTING (Living)', cat: 'Painting', specs: 'Surface preparation, primer and Interior ceiling painting - living room only.', unit: 'sq ft', materials: 27, labor: 18, margin: 20 },

  // Electrical
  { id: 'gen-024', name: 'ELECTRICAL (LABOR / POINT)', cat: 'Electrical', specs: 'Labour for wiring, conduit, fixing and testing per point for electrical work. Materials charged separately.', unit: 'nos', materials: 0, labor: 826, margin: 18 },
  { id: 'gen-025', name: 'ELECTRICAL FITTINGS (ACTUALS)', cat: 'Electrical', specs: 'Supply and installation of electrical fittings as per final selection, including fixing, connections and testing.', unit: 'lumpsum', materials: 25000, labor: 0, margin: 15 },
  { id: 'gen-046', name: 'PROFILE LIGHT (STRIP + CHANNEL)', cat: 'Electrical', specs: 'Supply and installation of LED profile light with strip, driver, and aluminum channel.', unit: 'rft', materials: 350, labor: 150, margin: 20 },

  // Plumbing (New)
  { id: 'gen-039', name: 'PLUMBING POINT (NEW/SHIFT)', cat: 'Plumbing', specs: 'Chasing, laying of CPVC/UPVC pipes for new or shifted water inlet/outlet point.', unit: 'nos', materials: 800, labor: 1200, margin: 20 },
  { id: 'gen-040', name: 'INSTALLATION OF SANITARY WARE', cat: 'Plumbing', specs: 'Installation of WC, Washbasin, and CP fittings. Excludes material cost.', unit: 'lumpsum', materials: 0, labor: 3500, margin: 15 },

  // Flooring & Tiling (New)
  { id: 'gen-042', name: 'ANTI-SKID FLOOR TILES', cat: 'Civil', specs: 'Supply and laying of anti-skid floor tiles for wet areas.', unit: 'sq ft', materials: 85, labor: 45, margin: 15 },
  { id: 'gen-043', name: 'WOODEN LAMINATE FLOORING', cat: 'Civil', specs: 'Supply and installation of AC4 wooden laminate flooring with skirting and underlay.', unit: 'sq ft', materials: 110, labor: 25, margin: 15 },

  // Decor (New)
  { id: 'gen-044', name: 'WALLPAPER', cat: 'Decor', specs: 'Supply and application of premium wallpaper.', unit: 'sq ft', materials: 80, labor: 20, margin: 20 },
  { id: 'gen-045', name: 'CURTAINS & BLINDS', cat: 'Decor', specs: 'Fabrication and installation of window treatments.', unit: 'sq ft', materials: 200, labor: 50, margin: 20 },

  // HVAC (New)
  { id: 'gen-047', name: 'SPLIT AC INSTALLATION', cat: 'HVAC', specs: 'Standard installation of Split AC unit.', unit: 'nos', materials: 1500, labor: 2000, margin: 10 },
  { id: 'gen-048', name: 'AC COPPER PIPING', cat: 'HVAC', specs: 'Laying of copper refrigerant piping with insulation and cabling.', unit: 'rft', materials: 280, labor: 120, margin: 15 },

  // Bathroom Custom Bundle (User Requested)
  { id: 'gen-060', name: 'BATHROOM BBC- PLUMBING - WATERPROOFING', cat: 'Civil', specs: 'Base Build (BBC), Plumbing lines, and Waterproofing execution.', unit: 'lumpsum', materials: 12000, labor: 10000, margin: 15 },
  { id: 'gen-061', name: 'DEMOLISH AND INSTALL - FLOORING TILES', cat: 'Civil', specs: 'Removal of existing floor tiles and installation of new anti-skid tiles.', unit: 'sq ft', materials: 100, labor: 200, margin: 15 },
  { id: 'gen-062', name: 'DEMOLISH AND INSTALL - WALL TILES', cat: 'Civil', specs: 'Removal of existing wall dado tiles and installation of new tiles.', unit: 'sq ft', materials: 100, labor: 200, margin: 15 },
  { id: 'gen-063', name: 'DOOR FRAME', cat: 'Carpentry', specs: 'Granite or Wood frame fabrication and fixing.', unit: 'lumpsum', materials: 4500, labor: 2000, margin: 15 },
  { id: 'gen-064', name: 'DOOR - NEW', cat: 'Carpentry', specs: 'New laminated flush door with basic hardware.', unit: 'lumpsum', materials: 7000, labor: 3000, margin: 15 },
  { id: 'gen-065', name: 'NEW WALL NICHES', cat: 'Civil', specs: 'Creation of recessed wall niches for storage.', unit: 'lumpsum', materials: 600, labor: 2000, margin: 15 },
  { id: 'gen-066', name: 'WASHBASIN COUNTER', cat: 'Civil', specs: 'Granite/Composite counter fabrication.', unit: 'lumpsum', materials: 6000, labor: 4000, margin: 15 },
  { id: 'gen-067', name: 'TILES (WALL & FLOORING) (AS ACTUALS)', cat: 'Civil', specs: 'Material budget for tiles (Purchase at actuals).', unit: 'lumpsum', materials: 10000, labor: 0, margin: 10 },
  { id: 'gen-068', name: 'SANITARY FITTINGS (WASHBASIN & WC) (AS ACTUALS)', cat: 'Plumbing', specs: 'Material budget for WC and Basin (Purchase at actuals).', unit: 'lumpsum', materials: 12000, labor: 0, margin: 10 },
  { id: 'gen-069', name: 'CP FITTINGS (SHOWER, TAPS) (AS ACTUALS)', cat: 'Plumbing', specs: 'Material budget for Taps and Mixers (Purchase at actuals).', unit: 'lumpsum', materials: 7500, labor: 0, margin: 10 },

  // Misc / Site Services
  { id: 'gen-026', name: 'DEBRIS REMOVAL', cat: 'Site Services', specs: 'Collection, loading, transport and disposal of debris generated from interior works as per site norms.', unit: 'nos', materials: 0, labor: 6000, margin: 15 },
  { id: 'gen-027', name: 'FLOOR PROTECTION', cat: 'Site Services', specs: 'Providing and laying temporary floor protection with reusable sheets/tapes for the duration of interior works.', unit: 'nos', materials: 5000, labor: 5000, margin: 15 },

  // Loose Furniture
  { id: 'gen-028', name: 'SOFA', cat: 'Loose Furniture', specs: 'Supply and placement of Sofa as loose furniture, including basic assembly and positioning.', unit: 'lumpsum', materials: 50000, labor: 0, margin: 10 },
  { id: 'gen-030', name: 'MATTRESS', cat: 'Loose Furniture', specs: 'Supply and placement of Mattress as loose furniture.', unit: 'lumpsum', materials: 15000, labor: 0, margin: 10 },
  { id: 'gen-031', name: 'SIDE TABLES', cat: 'Loose Furniture', specs: 'Supply and placement of Side tables as loose furniture.', unit: 'lumpsum', materials: 11000, labor: 0, margin: 10 },
  { id: 'gen-032', name: 'DINING TABLE WITH CHAIRS', cat: 'Loose Furniture', specs: 'Supply and placement of Dining table with chairs as loose furniture.', unit: 'lumpsum', materials: 58000, labor: 0, margin: 10 },
  { id: 'gen-033', name: 'RECLINER CHAIRS', cat: 'Loose Furniture', specs: 'Supply and placement of Recliner chairs as loose furniture.', unit: 'lumpsum', materials: 28000, labor: 0, margin: 10 },
];

// --- PROPOSAL TEMPLATES ---

export const TEMPLATE_TURNKEY: ProposalContent = {
    cover: {
        title: "Executive Summary",
        text: "Thank you for inviting us to envision your new home. This proposal outlines a turnkey execution plan tailored for your specific requirements. We have structured this document to give you clarity on the investment required to achieve your desired aesthetic."
    },
    snapshot: {
        title: "Project Snapshot",
        subtitle: "This snapshot helps you quickly decide if the direction and investment feel broadly aligned before going into details.",
        engagementModel: "Design-led Turnkey Execution"
    },
    options: {
        title: "Options Overview",
        subtitle: "Each option changes finish level, detailing, and civil scope. Core functionality remains intact."
    },
    process: {
        title: "How FFDS takes you from ideas to a locked plan (before execution)",
        subtitle: "This is the part that protects your budget and timeline. We resolve decisions on paper first, then move to site. You will always know what is next, what is pending, and what is being executed.",
        steps: [
            { id: 1, title: "Discovery & Brief Freeze", desc: "Site measure check, lifestyle needs, storage priorities, budget comfort, and must-haves. We freeze the brief so scope does not drift later.", tags: ["Kick-off call", "Site verification", "Requirements sheet"] },
            { id: 2, title: "Space Planning & Layout Options", desc: "Furniture layout, storage logic, and circulation. We align room-by-room functionality before any finish decisions.", tags: ["Layout iterations", "Electrical intent", "Storage zoning"] },
            { id: 3, title: "3D Visuals & Material Direction", desc: "We develop the look and feel with realistic views and a clear material direction. Final brands/shades are confirmed through samples.", tags: ["3D views", "Sample shortlist", "Finish coordination"] },
            { id: 4, title: "Budget Lock & GFC Drawings", desc: "We freeze scope, confirm selections, and prepare detailed working drawings (GFC) for execution teams. This is where costs become predictable.", tags: ["BOQ freeze", "GFC set", "Execution schedule"] }
        ]
    },
    fees: {
        title: "How Design & Execution Fees Work",
        subtitle: "At FFDS, design is not treated as an add-on. It is the framework that controls scope, cost overruns, and execution quality.",
        card1: { 
            label: "DESIGN FEE", 
            value: "8-10% of final execution value", 
            desc: "Depends on project scope and complexity. Covers the complete design + coordination lifecycle." 
        },
        card2: { 
            label: "WHAT IT COVERS", 
            items: [
                "Space planning, layouts, and design direction", 
                "3D visualization and technical drawings", 
                "Material and finish selection guidance", 
                "Vendor coordination and site involvement"
            ] 
        },
        practicalView: "Practical view: Most clients recover the design fee many times over by avoiding rework, scope creep, and on-site trial-and-error. A detailed stage-wise breakup is shared once layouts and scope are finalized."
    },
    timeline: {
        title: "Indicative Timeline",
        subtitle: "Timeline can shift based on approvals, site conditions, and selection cycles. This keeps expectations realistic."
    },
    payments: {
        title: "Payment Milestones",
        subtitle: "Payments are tied to clear progress. Detailed invoices are shared at each milestone."
    },
    cta: {
        title: "What we are deciding right now",
        subtitle: "At this stage, you are not locking final materials, exact quantities, or final vendor selections. The decision required now is whether FFDS should proceed with design development and detailed planning, after which scope and final costing are frozen transparently.",
        nextStepsTitle: "Next 3 steps",
        steps: [
            "Confirm intent to proceed",
            "Design retainer invoice shared",
            "Kick-off scheduled within 3–5 working days"
        ]
    },
    footer: {
        orgName: "Interior Execution OS",
        tagline: "Minimal Design. Maximum Impact.",
        contactInfo: "Office: Lodha Signet A, Kolshet Road, Thane • Call: +91 9137673996",
        phoneNumber: "+919137673996"
    },
    
    // Level 2 Defaults (Standard) - UPDATED TO "CLASSY" TONE
    l2_cover: { 
        title: "Project Blueprint & Scope Lock", 
        text: "We have translated your vision into a definitive execution roadmap. This document serves as the single source of truth for the project, locking in the scope, material specifications, and commercial value.\n\nApproving this plan transitions us from 'Design' to 'Production', allowing us to release technical drawings and initiate procurement with complete clarity." 
    },
    l2_snapshot: { 
        title: "Investment Summary", 
        subtitle: "A consolidated commercial view of the approved scope for the [Tier Name] package." 
    },
    l2_fees: { 
        title: "Commercial Terms", 
        subtitle: "Adjustments for retainers paid and applicable statutory taxes." 
    },
    l2_scope: { 
        title: "Detailed Scope of Works", 
        subtitle: "The definitive list of inclusions that form the basis of this contract." 
    },
    l2_risk: { 
        title: "Execution Readiness", 
        subtitle: "Protocols to ensure a seamless build.", 
        items: [{ title: "Decisions First", desc: "No material is ordered until drawings and specs are frozen." }, { title: "Stage-wise Approvals", desc: "Sign-offs required at key milestones (Design, Civil, Finishing)." }, { title: "Change Management", desc: "Scope changes are documented in a Change Note with cost impact." }] 
    },
    l2_finishes: { 
        title: "Finish Direction", 
        subtitle: "The defined visual language and material palette." 
    },
    l2_timeline: { 
        title: "Execution Schedule", 
        subtitle: "From Design Freeze to Handover" 
    }
};

export const TEMPLATE_DESIGN_ONLY: ProposalContent = {
    ...TEMPLATE_TURNKEY,
    snapshot: {
        title: "Design Mandate Snapshot",
        subtitle: "This proposal focuses on providing comprehensive Design & Planning services. Execution is handled by your vendors, with our guidance.",
        engagementModel: "Design Consultancy & PMC"
    },
    fees: {
        title: "Professional Design Fees",
        subtitle: "Our fee structure covers the intellectual property, technical detailing, and creative direction required for your project. The fee is calculated based on the carpet area and the complexity of the design mandate.",
        card1: {
            label: "CONSULTANCY FEE",
            value: "Flat Fee / Sq.ft Basis",
            desc: "Based on the scope of drawings and visualization required."
        },
        card2: {
            label: "DELIVERABLES",
            items: [
                "Layouts & Space Planning",
                "3D Visualization (4 views/room)",
                "Detailed GFC Drawings (Elec, Civil, Joinery)",
                "Material Selection Assistance"
            ]
        },
        practicalView: "Practical view: Good design is an investment, not a cost. A well-detailed set of drawings saves you 15-20% in material wastage and contractor errors during execution."
    },
    options: {
        title: "Design Depth Options",
        subtitle: "Choose the level of detailing and support you need for your project."
    },
    timeline: {
        title: "Design Delivery Timeline",
        subtitle: "The timeline for delivering the complete Good for Construction (GFC) set."
    }
};
