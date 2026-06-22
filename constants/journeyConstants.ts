export const PHASES = [
  { id: 0, name: "Acquisition", color: "#1a3a6e", emoji: "🤝", desc: "Securing the lead" },
  { id: 1, name: "Design", color: "#1e5232", emoji: "🎨", desc: "Vision & detailing" },
  { id: 2, name: "Contracting", color: "#6b3810", emoji: "📝", desc: "Agreements & advances" },
  { id: 3, name: "Pre-Execution", color: "#4a1e78", emoji: "🏗️", desc: "Site setup" },
  { id: 4, name: "Execution", color: "#7a1818", emoji: "🔨", desc: "Core works" },
  { id: 5, name: "Handover", color: "#0a5248", emoji: "🔑", desc: "Completion & warranty" },
];

export interface JourneyStepDef {
  id: string;
  n: number;
  phase: number;
  title: string;
  description: string;
  illustration: string;
  statusSource: 'auto' | 'manual';
  autoRule: string | null;
  linkedFeature: string | null;
  linkedTab: string | null;
  prerequisiteIds: string[];
}

export const JOURNEY_STEPS: JourneyStepDef[] = [
  // PHASE 1 — ACQUISITION
  {
    id: "terms_docket_acknowledged", n: 1, phase: 0, title: "Terms Docket Acknowledged",
    description: "Client has viewed and acknowledged the Terms of Engagement Docket.",
    illustration: "terms_docket_acknowledged", statusSource: "auto",
    autoRule: 'termsDocket.status === "acknowledged"', linkedFeature: "Studio → Terms Docket", linkedTab: "terms-docket", prerequisiteIds: []
  },
  {
    id: "discovery_scheduled", n: 2, phase: 0, title: "Discovery Scheduled",
    description: "Initial site visit or office meeting scheduled with the client.",
    illustration: "discovery_scheduled", statusSource: "manual",
    autoRule: null, linkedFeature: "Dashboard", linkedTab: "dashboard", prerequisiteIds: ["terms_docket_acknowledged"]
  },
  {
    id: "discovery_completed", n: 3, phase: 0, title: "Discovery Completed",
    description: "Initial meeting concluded. Ready to begin design ideation.",
    illustration: "discovery_completed", statusSource: "manual",
    autoRule: null, linkedFeature: "Vision Board", linkedTab: "vision", prerequisiteIds: ["discovery_scheduled"]
  },

  // PHASE 2 — DESIGN
  {
    id: "brief_frozen", n: 4, phase: 1, title: "Brief Frozen",
    description: "Client requirements, theme, and scope of work frozen.",
    illustration: "brief_frozen", statusSource: "auto",
    autoRule: "project.briefFrozenAt exists", linkedFeature: "Project Setup", linkedTab: "dashboard", prerequisiteIds: ["discovery_completed"]
  },
  {
    id: "space_planning_presented", n: 5, phase: 1, title: "Space Planning Presented",
    description: "2D layouts and structural changes presented to client.",
    illustration: "space_planning_presented", statusSource: "auto",
    autoRule: 'communicationLog["space_planning_review"].status === "sent"', linkedFeature: "Communication → Space Plan", linkedTab: "comms-tracker", prerequisiteIds: ["brief_frozen"]
  },
  {
    id: "space_planning_approved", n: 6, phase: 1, title: "Space Planning Approved",
    description: "Client has signed off on the 2D layout.",
    illustration: "space_planning_approved", statusSource: "manual",
    autoRule: null, linkedFeature: "Vision Board", linkedTab: "vision", prerequisiteIds: ["space_planning_presented"]
  },
  {
    id: "visuals_3d_developed", n: 7, phase: 1, title: "3D Visuals Developed",
    description: "Renders or visual concept boards prepared internally.",
    illustration: "visuals_3d_developed", statusSource: "manual",
    autoRule: null, linkedFeature: "Revision Studio", linkedTab: "revision-studio", prerequisiteIds: ["space_planning_approved"]
  },
  {
    id: "visuals_3d_shared", n: 8, phase: 1, title: "3D Visuals Shared",
    description: "Renders shared with client for review.",
    illustration: "visuals_3d_shared", statusSource: "auto",
    autoRule: 'communicationLog["3d_visuals_review"].status === "sent"', linkedFeature: "Communication → 3D Visuals", linkedTab: "comms-tracker", prerequisiteIds: ["visuals_3d_developed"]
  },
  {
    id: "revisions_incorporated", n: 9, phase: 1, title: "Revisions Incorporated",
    description: "Feedback integrated. Tracked via revisions list or comms log.",
    illustration: "revisions_incorporated", statusSource: "auto",
    autoRule: 'revisions collection has ≥1 doc OR communicationLog["revision_acknowledged"].status === "sent"', linkedFeature: "Revision Studio", linkedTab: "revision-studio", prerequisiteIds: ["visuals_3d_shared"]
  },
  {
    id: "design_approved", n: 10, phase: 1, title: "Design Approved",
    description: "Final client sign-off on 3D visuals and spatial design.",
    illustration: "design_approved", statusSource: "auto",
    autoRule: "project.designApprovedAt exists", linkedFeature: "Signoffs", linkedTab: "dashboard", prerequisiteIds: ["revisions_incorporated"]
  },
  {
    id: "boq_shared", n: 11, phase: 1, title: "BOQ Shared",
    description: "Final formal costing document shared with client.",
    illustration: "boq_shared", statusSource: "auto",
    autoRule: 'communicationLog["design_approval_boq"].status === "sent" AND project.boqTotalValue > 0', linkedFeature: "Communication → BOQ", linkedTab: "comms-tracker", prerequisiteIds: ["design_approved"]
  },

  // PHASE 3 — CONTRACTING
  {
    id: "payment_schedule_sent", n: 12, phase: 2, title: "Payment Schedule Sent",
    description: "Schedule of advances generated and issued to client.",
    illustration: "payment_schedule_sent", statusSource: "auto",
    autoRule: 'communicationLog["payment_schedule_sent"].status === "sent"', linkedFeature: "Client Portal → Payment Schedule", linkedTab: "payment-schedule", prerequisiteIds: ["boq_shared"]
  },
  {
    id: "agreement_signed", n: 13, phase: 2, title: "Agreement Signed",
    description: "Main execution contract shared and signed.",
    illustration: "agreement_signed", statusSource: "auto",
    autoRule: 'communicationLog["contract_sent"].status === "sent"', linkedFeature: "Contracts", linkedTab: "contract", prerequisiteIds: ["payment_schedule_sent"]
  },
  {
    id: "design_fee_received", n: 14, phase: 2, title: "Design Fee Received",
    description: "Design-phase payment milestone marked as received.",
    illustration: "design_fee_received", statusSource: "auto",
    autoRule: 'paymentMilestones: any milestone where phase === "design" AND status === "PAID"', linkedFeature: "Payment Calc", linkedTab: "payment-calc", prerequisiteIds: ["agreement_signed"]
  },
  {
    id: "onboarding_kit_sent", n: 15, phase: 2, title: "Onboarding Kit Sent",
    description: "Welcome dossier, timelines, and next steps shared.",
    illustration: "onboarding_kit_sent", statusSource: "auto",
    autoRule: 'communicationLog["onboarding_kit_sent"].status === "sent"', linkedFeature: "Communication → Onboarding", linkedTab: "comms-tracker", prerequisiteIds: ["agreement_signed"]
  },
  {
    id: "working_drawings_done", n: 16, phase: 2, title: "Working Drawings Done",
    description: "Good-for-construction (GFC) drawings ready for site.",
    illustration: "working_drawings_done", statusSource: "manual",
    autoRule: null, linkedFeature: "Site Ops", linkedTab: "site-ops", prerequisiteIds: ["agreement_signed"]
  },

  // PHASE 4 — PRE-EXECUTION
  {
    id: "exec_advance_1_received", n: 17, phase: 3, title: "Advance 1 Received",
    description: "First execution mobilization payment logged.",
    illustration: "exec_advance_1_received", statusSource: "auto",
    autoRule: 'paymentMilestones: first execution milestone status === "PAID"', linkedFeature: "Payment Calc", linkedTab: "payment-calc", prerequisiteIds: ["working_drawings_done"]
  },
  {
    id: "contractor_mobilised", n: 18, phase: 3, title: "Contractor Mobilised",
    description: "Teams mapped, materials ordered, site access granted.",
    illustration: "contractor_mobilised", statusSource: "manual",
    autoRule: null, linkedFeature: "Site Ops", linkedTab: "site-ops", prerequisiteIds: ["exec_advance_1_received"]
  },
  {
    id: "baseline_inspection_done", n: 19, phase: 3, title: "Baseline Inspection Done",
    description: "Initial site conditions documented before major works start.",
    illustration: "baseline_inspection_done", statusSource: "manual",
    autoRule: null, linkedFeature: "Site Ops", linkedTab: "site-ops", prerequisiteIds: ["contractor_mobilised"]
  },
  {
    id: "exec_start_notified", n: 20, phase: 3, title: "Execution Start Notified",
    description: "Client officially informed that site work has commenced.",
    illustration: "exec_start_notified", statusSource: "auto",
    autoRule: 'communicationLog["execution_start"].status === "sent"', linkedFeature: "Communication", linkedTab: "comms-tracker", prerequisiteIds: ["baseline_inspection_done"]
  },

  // PHASE 5 — EXECUTION
  {
    id: "phase1_work_complete", n: 21, phase: 4, title: "Phase 1 Complete",
    description: "Initial execution bundle (e.g. dismantling, basic civil) finished.",
    illustration: "phase1_work_complete", statusSource: "manual",
    autoRule: null, linkedFeature: "Site Ops", linkedTab: "site-ops", prerequisiteIds: ["exec_start_notified"]
  },
  {
    id: "exec_advance_2_received", n: 22, phase: 4, title: "Advance 2 Received",
    description: "Second execution payment logged.",
    illustration: "exec_advance_2_received", statusSource: "auto",
    autoRule: 'paymentMilestones: second execution milestone status === "PAID"', linkedFeature: "Payment Calc", linkedTab: "payment-calc", prerequisiteIds: ["phase1_work_complete"]
  },
  {
    id: "phase2_work_complete", n: 23, phase: 4, title: "Phase 2 Complete",
    description: "Mid-stage execution (e.g. MEP, flooring) finished.",
    illustration: "phase2_work_complete", statusSource: "manual",
    autoRule: null, linkedFeature: "Site Ops", linkedTab: "site-ops", prerequisiteIds: ["exec_advance_2_received"]
  },
  {
    id: "selections_locked", n: 24, phase: 4, title: "Selections Locked",
    description: "All required physical materials/finishes approved by client.",
    illustration: "selections_locked", statusSource: "auto",
    autoRule: 'sofItems: all required status === "approved"', linkedFeature: "Execute → SOF", linkedTab: "materials", prerequisiteIds: ["phase2_work_complete"]
  },
  {
    id: "exec_advance_3_requested", n: 25, phase: 4, title: "Advance 3 Requested",
    description: "Final core-work payment requested.",
    illustration: "exec_advance_3_requested", statusSource: "auto",
    autoRule: 'paymentMilestones: third execution milestone status === "invoiced" OR "paid"', linkedFeature: "Payment Calc", linkedTab: "payment-calc", prerequisiteIds: ["selections_locked"]
  },
  {
    id: "phase3_underway", n: 26, phase: 4, title: "Phase 3 Underway",
    description: "Finishing works (e.g. painting, carpentry installation).",
    illustration: "phase3_underway", statusSource: "manual",
    autoRule: null, linkedFeature: "Site Ops", linkedTab: "site-ops", prerequisiteIds: ["exec_advance_3_requested"]
  },
  {
    id: "phase3_work_complete", n: 27, phase: 4, title: "Phase 3 Complete",
    description: "Core execution finishes out. Moving to pre-handover.",
    illustration: "phase3_work_complete", statusSource: "manual",
    autoRule: null, linkedFeature: "Site Ops", linkedTab: "site-ops", prerequisiteIds: ["phase3_underway"]
  },
  {
    id: "site_update_shared", n: 28, phase: 4, title: "Site Update Shared",
    description: "Major milestone photos shared with client.",
    illustration: "site_update_shared", statusSource: "auto",
    autoRule: 'communicationLog["painting_stage_start"].status === "sent"', linkedFeature: "Communication → Painting", linkedTab: "comms-tracker", prerequisiteIds: ["phase3_work_complete"]
  },

  // PHASE 6 — HANDOVER
  {
    id: "prehandover_walkthrough", n: 29, phase: 5, title: "Pre-handover Walkthrough",
    description: "Internal check for defects before client invite.",
    illustration: "prehandover_walkthrough", statusSource: "manual",
    autoRule: null, linkedFeature: "Site Ops", linkedTab: "site-ops", prerequisiteIds: ["site_update_shared"]
  },
  {
    id: "snag_list_shared", n: 30, phase: 5, title: "Snag List Shared",
    description: "Recorded snags compiled and sent to teams.",
    illustration: "snag_list_shared", statusSource: "manual",
    autoRule: null, linkedFeature: "Site Ops", linkedTab: "site-ops", prerequisiteIds: ["prehandover_walkthrough"]
  },
  {
    id: "handover_advance_received", n: 31, phase: 5, title: "Handover Advance Received",
    description: "Final outstanding balances cleared by client.",
    illustration: "handover_advance_received", statusSource: "auto",
    autoRule: 'paymentMilestones: milestone where isHandoverAdvance===true AND status === "PAID"', linkedFeature: "Payment Calc", linkedTab: "payment-calc", prerequisiteIds: ["snag_list_shared"]
  },
  {
    id: "handover_dossier_sent", n: 32, phase: 5, title: "Handover Dossier Sent",
    description: "Project documentation, care guides, and contacts sent.",
    illustration: "handover_dossier_sent", statusSource: "auto",
    autoRule: 'communicationLog["handover_warranty"].status === "sent"', linkedFeature: "Communication → Dossier", linkedTab: "comms-tracker", prerequisiteIds: ["handover_advance_received"]
  },
  {
    id: "keys_handed_over", n: 33, phase: 5, title: "Keys Handed Over",
    description: "Physical possession transferred to client.",
    illustration: "keys_handed_over", statusSource: "manual",
    autoRule: null, linkedFeature: "Dashboard", linkedTab: "dashboard", prerequisiteIds: ["handover_dossier_sent"]
  },
  {
    id: "warranty_activated", n: 34, phase: 5, title: "Warranty Activated",
    description: "Project reaches formal closed status and enters warranty period.",
    illustration: "warranty_activated", statusSource: "auto",
    autoRule: "project.handoverDate exists AND all paymentMilestones status === 'PAID'", linkedFeature: "Project Settings", linkedTab: "dashboard", prerequisiteIds: ["keys_handed_over"]
  }
];
