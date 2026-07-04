import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { TermsSettings, PaymentStructure, ProjectEngagement } from '../types';

export const FFDS_TERMS_DEFAULTS: TermsSettings = {
    docketRefPrefix: "FFDS-TD",
    studioFoundedYear: 2018,
    includedRevisionRounds: 2,
    changeRequestResponseDays: 5,
    paymentOverdueGraceDays: 7,
    resumeAfterPaymentDays: 2,
    gstRate: 18,
    paymentMethods: ["NEFT", "RTGS", "UPI"],
    snagCategories: [ { label: "A", resolveDays: 7 }, { label: "B", resolveDays: 21 } ],
    warrantyPeriods: [ { trade: "Civil work and carpentry", months: 12 }, { trade: "Painting and electrical", months: 6 } ],
    disputeMediationDays: 30,
    disputeJurisdiction: "Thane, Maharashtra",
    signatory: { name: "Ar. Mayuri Kaulgud", title: "Principal Architect" },
    preamble: "This document establishes the framework governing all projects undertaken by Form Factors Design Studio. It is to be read and acknowledged before any design work, proposal, or Discovery Workshop commences. Specific project scope and the advance payment schedule are covered in separate documents.",
    sections: [
        { n: 1, title: "About Form Factors Design Studio", blocks: [
            { type: "clause", ref: "1.1", text: "Form Factors Design Studio (\"FFDS\" or \"the Studio\") is a design-led practice founded in 2018, providing end-to-end architectural design, interior design, and turnkey execution services. Every project is approached with clarity, care, and purposeful intent — from the first conversation to the final handover." },
            { type: "clause", ref: "1.2", text: "The Studio acts as the client's single point of contact for the entire project duration, coordinating design development, contractor management, material procurement guidance, and site oversight. All project instructions, approvals, and communications must flow through the Studio." }
        ]},
        { n: 2, title: "The Design Process", blocks: [
            { type: "clause", ref: "2.1", text: "FFDS follows a structured process for every project. The specific phases applicable to a given project are defined in the Design Agreement. The standard phases are: Discovery Workshop — Space Planning — Concept Development & Visualisation — Working Drawings & BOQ — Execution — Handover. Not all phases apply to every project type." },
            { type: "clause", ref: "2.2", text: "The client agrees to provide timely feedback, approvals, and inputs at each stage. Project delays caused by late client feedback or approvals do not constitute delays attributable to the Studio and may impact the project timeline at no liability to FFDS." },
            { type: "clause", ref: "2.3", text: "Once the Design Brief is formally frozen at the conclusion of the Discovery phase, any changes to agreed scope, room requirements, or design direction must be submitted as a formal Change Request. The Studio will communicate cost and timeline impact within 5 working days of receiving a Change Request." },
            { type: "clause", ref: "2.4", text: "The Design Agreement includes a defined number of design revision rounds within the Concept Development phase. This number is specified in the Design Agreement. Additional revision rounds beyond the included scope are charged at the rate stated in the Design Agreement." }
        ]},
        { n: 3, title: "Advance Payment Framework", blocks: [
            { type: "clause", ref: "3.1", text: "All payments in FFDS projects are structured as advance payments. Each payment is made before the corresponding phase of work commences, not after. The specific advance schedule, amounts, and unlock conditions for each project are set out in the Payment Schedule document, which is issued alongside the Design Agreement." },
            { type: "callout", style: "principle", label: "The Advance Payment Principle", text: "No phase of work commences until the advance payment for that phase has been received and cleared. This applies to every milestone in the Payment Schedule — including design phases, execution phases, and the final handover. The Payment Schedule issued with the Design Agreement specifies exactly what each advance unlocks." },
            { type: "clause", ref: "3.2", text: "The final advance in the Payment Schedule is tied to the formal project handover. It unlocks the Project Handover Dossier, all keys and access cards, and the Warranty Certificate. This advance is due upon completion of all installation and finishing work, irrespective of any snag items." },
            { type: "clause", ref: "3.3", text: "The Studio reserves the right to pause all site activity and design work if any advance payment remains unpaid more than 7 days beyond its due date, without liability for any project delay arising thereof. Activity resumes within 2 working days of payment clearance." },
            { type: "clause", ref: "3.4", text: "All payments are to be made via NEFT / RTGS / UPI to the bank account specified on the invoice. Payment is considered received only upon clearance into the Studio's designated account. GST at 18% applies to all amounts unless otherwise specified in the Design Agreement." },
            { type: "clause", ref: "3.5", text: "If the Payment Schedule is revised due to scope changes, the revised Payment Schedule supersedes the previous version for outstanding advances only. Advances already received are not affected by a Payment Schedule revision." }
        ]},
        { n: 4, title: "Execution & Site Protocol", blocks: [
            { type: "clause", ref: "4.1", text: "Unobstructed site access must be provided to the Studio's team and contractors during agreed execution hours. Delays caused by restricted site access are not attributable to the Studio." },
            { type: "clause", ref: "4.2", text: "All client site visits during the execution phase must be coordinated in advance with the Studio's site supervisor. Unannounced visits during active construction phases are strongly discouraged for safety reasons." },
            { type: "clause", ref: "4.3", text: "The client agrees not to issue instructions directly to contractors. All instructions regarding execution must flow through the Studio's project team. Verbal instructions given directly to contractors without the Studio's authorisation will not be treated as binding and may result in additional rectification costs." },
            { type: "clause", ref: "4.4", text: "Materials or fittings procured independently by the client outside the Studio's guidance are not covered by the Studio's workmanship warranty. The Studio will endeavour to accommodate client-supplied materials but accepts no responsibility for their quality or compatibility with the design." }
        ]},
        { n: 5, title: "Change Requests & Scope Additions", blocks: [
            { type: "clause", ref: "5.1", text: "Any change to agreed scope — addition, deletion, or modification — requires a formal Change Request. The Studio will assess and communicate cost and timeline impact within 5 working days." },
            { type: "clause", ref: "5.2", text: "No Change Request will be executed until approved in writing by the client and the corresponding additional advance has been invoiced and received. WhatsApp or email confirmation constitutes valid written approval for Change Requests." },
            { type: "clause", ref: "5.3", text: "Approved Change Requests that affect the project cost will result in a revised Payment Schedule being issued. The framework governing advance payments applies to the revised schedule without requiring a new Terms of Engagement acknowledgement." }
        ]},
        { n: 6, title: "Pre-Handover Inspection, Snag Policy & Final Advance", blocks: [
            { type: "clause", ref: "6.1", text: "Upon completion of all installation and finishing work, the Studio will conduct a formal Pre-Handover Walkthrough with the client. Observations will be documented in a Snag List." },
            { type: "clause", ref: "6.2", text: "A snag is a minor defect in workmanship or finish that does not impair the functional use of the space. A snag does not include design preferences differing from approved visuals, items outside agreed scope, normal material tolerances, or third-party product defects covered by manufacturer warranty." },
            { type: "clause", ref: "6.3", text: "Snag items are addressed within the warranty period. Category A snags are addressed within 7 working days; Category B snags within 21 days. The Studio's commitment to resolving legitimate snag items exists independently of payment status." },
            { type: "callout", style: "highlight", label: "Clause 6.4 — Final Advance & Handover", text: "The final advance payment in the Payment Schedule is due upon completion of all installation and finishing work. This is the advance that releases the Project Handover Dossier, all keys and access cards, and the Warranty Certificate. This advance is not conditional upon the clearance of snag items.\n\nSnag items are post-completion rectifications falling within warranty coverage. They do not constitute grounds to withhold the final advance. The Studio commits to addressing all legitimate snags documented in the Snag List. Withholding the final advance against pending snag items constitutes a breach of payment terms." }
        ]},
        { n: 7, title: "Warranty", blocks: [
            { type: "clause", ref: "7.1", text: "FFDS provides workmanship warranty on completed execution work from the date of formal handover. Warranty periods by trade are specified in the Design Agreement and vary by project scope." },
            { type: "table", ref: "7.2", intro: "Standard warranty coverage:", source: "warrantyPeriods", note: "These periods may be adjusted in the Design Agreement for specific project types." },
            { type: "clause", ref: "7.3", text: "Warranty covers workmanship defects under normal usage. It excludes damage from misuse, negligence, post-handover modifications, building-level water ingress, or normal wear and tear. Warranty is valid only when all outstanding advances have been cleared in full." },
            { type: "clause", ref: "7.4", text: "Warranty claims must be submitted in writing. Site assessment within 7 working days of a reported claim." }
        ]},
        { n: 8, title: "Intellectual Property", blocks: [
            { type: "clause", ref: "8.1", text: "All design drawings, 3D visualisations, material specifications, and documentation created by FFDS remain the intellectual property of Form Factors Design Studio. Upon receipt of all due payments in full, the client receives a non-exclusive licence to use the design for the agreed project site only." }
        ]},
        { n: 9, title: "Communication Protocol", blocks: [
            { type: "clause", ref: "9.1", text: "All project approvals, scope sign-offs, Change Request authorisations, and formal decisions must be confirmed in writing via email or WhatsApp message to be valid. Verbal confirmations in person or over a call do not constitute authorisation and will not be treated as binding." },
            { type: "clause", ref: "9.2", text: "The Studio maintains a record of all approvals, milestones, and communications. The client is encouraged to retain all project-related correspondence." }
        ]},
        { n: 10, title: "Dispute Resolution", blocks: [
            { type: "clause", ref: "10.1", text: "Disputes are first to be resolved through good-faith mediation. If unresolved within 30 days, disputes are subject to the exclusive jurisdiction of the courts in Thane, Maharashtra." }
        ]},
        { n: 11, title: "Termination & Refund", recommended: true, blocks: [
            { type: "clause", ref: "11.1", text: "Either party may terminate the engagement by written notice. On termination, the Studio will hand over all deliverables completed up to and including the most recent fully paid phase." },
            { type: "clause", ref: "11.2", text: "Because every payment is an advance against a phase about to commence, advances corresponding to a phase that has begun are non-refundable. Any advance received for a phase not yet commenced will be refunded after deduction of costs already committed by the Studio for that phase." },
            { type: "clause", ref: "11.3", text: "The design licence under Section 8 passes to the client only upon clearance of all advances due for delivered work. Work product for unpaid or uncommenced phases is not released on termination." }
        ]},
        { n: 12, title: "Limitation of Liability", recommended: true, blocks: [
            { type: "clause", ref: "12.1", text: "The Studio's aggregate liability arising out of or in connection with the engagement shall not exceed the total design fees paid to the Studio for the project." },
            { type: "clause", ref: "12.2", text: "The Studio shall not be liable for indirect, incidental, or consequential losses, nor for defects in client-supplied materials or in third-party products covered by a manufacturer's warranty." }
        ]},
        { n: 13, title: "Force Majeure", recommended: true, blocks: [
            { type: "clause", ref: "13.1", text: "Neither party shall be liable for any delay or failure to perform arising from events beyond its reasonable control, including natural events, government action, civil disruption, strikes, or material supply disruption. Affected timelines extend by the period of the event." }
        ]},
        { n: 14, title: "Confidentiality", recommended: true, blocks: [
            { type: "clause", ref: "14.1", text: "Each party shall keep confidential the other's non-public information shared during the engagement and shall use it only for the purposes of the project." }
        ]}
    ]
};

export const FFDS_PAYMENT_STRUCTURE_DEFAULTS: PaymentStructure = {
  designStages: [
    { code: "D1", name: "Sign-up & Concept",  pct: 25, trigger: "On signing", unlocks: "Begins site study, brief freeze, concept direction" },
    { code: "D2", name: "Design Development", pct: 40, trigger: "On presentation of layouts & 3D for approval", unlocks: "Detailed design + material direction" },
    { code: "D3", name: "Design Completion",  pct: 35, trigger: "On release of GFC drawings + final BOQ", unlocks: "Construction-ready package; execution may begin" }
  ],
  executionStages: [
    { code: "E1", name: "Material Order Advance", pct: 40, trigger: "Before any vendor orders are placed", unlocks: "Funds procurement, mobilisation, first-fix" },
    { code: "E2", name: "Structure & First-Fix",  pct: 30, trigger: "Civil, MEP, false-ceiling framework & carcasses in place", unlocks: "Unlocks second-fix & finishing prep" },
    { code: "E3", name: "Finishing Advance",      pct: 20, trigger: "Before final finishes begin", unlocks: "Laminates, shutters, polish, paint, hardware" },
    { code: "E4", name: "Completion & Handover",  pct: 10, trigger: "On completion of all work", unlocks: "Releases keys, dossier, warranty certificate" }
  ],
  handoverClause: "The Completion & Handover Advance unlocks the formal handover package — keys, dossier and warranty certificate. It is due upon completion of all installation and finishing work and is not conditional upon snag clearance. Snag items are addressed under warranty as per Clause 6.4 of the Terms of Engagement Governing Docket.",
  validation: { designSumMustEqual: 100, executionSumMustEqual: 100 }
};

export const GENERIC_TERMS_DEFAULTS: TermsSettings = {
    docketRefPrefix: "DOC",
    studioFoundedYear: new Date().getFullYear(),
    includedRevisionRounds: 1,
    changeRequestResponseDays: 5,
    paymentOverdueGraceDays: 7,
    resumeAfterPaymentDays: 2,
    gstRate: 18,
    paymentMethods: ["Bank Transfer"],
    snagCategories: [{ label: "Standard", resolveDays: 14 }],
    warrantyPeriods: [{ trade: "All work", months: 6 }],
    disputeMediationDays: 30,
    disputeJurisdiction: "Local Jurisdiction",
    signatory: { name: "[Principal Name]", title: "[Principal Title]" },
    preamble: "This document establishes the framework governing all projects. It is to be read and acknowledged before any design work or proposal commences.",
    sections: []
};

export const GENERIC_PAYMENT_STRUCTURE_DEFAULTS: PaymentStructure = {
    designStages: [
        { code: "D1", name: "Advance", pct: 50, trigger: "On signing", unlocks: "Design phase" },
        { code: "D2", name: "Completion", pct: 50, trigger: "On final drawings", unlocks: "Execution phase" }
    ],
    executionStages: [
        { code: "E1", name: "Advance", pct: 50, trigger: "Before work starts", unlocks: "Material procurement" },
        { code: "E2", name: "Completion", pct: 50, trigger: "On completion", unlocks: "Handover" }
    ],
    handoverClause: "",
    validation: { designSumMustEqual: 100, executionSumMustEqual: 100 }
};

export const restoreFFDSDefaults = async (orgId: string): Promise<void> => {
    await setTermsSettings(orgId, FFDS_TERMS_DEFAULTS);
    await setPaymentStructure(orgId, FFDS_PAYMENT_STRUCTURE_DEFAULTS);
};

export const seedEngagementDefaults = async (orgId: string): Promise<void> => {
    const isFFDS = orgId === 'demo-tenant-01';
    
    // Check if terms exist
    const existingTerms = await getTermsSettings(orgId);
    if (!existingTerms) {
        await setTermsSettings(orgId, isFFDS ? FFDS_TERMS_DEFAULTS : GENERIC_TERMS_DEFAULTS);
    }
    
    // Check if payment structure exists
    const existingPayment = await getPaymentStructure(orgId);
    if (!existingPayment) {
        await setPaymentStructure(orgId, isFFDS ? FFDS_PAYMENT_STRUCTURE_DEFAULTS : GENERIC_PAYMENT_STRUCTURE_DEFAULTS);
    }
};

export const getTermsSettings = async (orgId: string): Promise<TermsSettings | null> => {
    const docRef = doc(db, `organizations/${orgId}/settings/terms`);
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() as TermsSettings : null;
};

export const setTermsSettings = async (orgId: string, data: TermsSettings): Promise<void> => {
    const docRef = doc(db, `organizations/${orgId}/settings/terms`);
    await setDoc(docRef, data, { merge: true });
};

export const getPaymentStructure = async (orgId: string): Promise<PaymentStructure | null> => {
    const docRef = doc(db, `organizations/${orgId}/settings/paymentStructure`);
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() as PaymentStructure : null;
};

export const setPaymentStructure = async (orgId: string, data: PaymentStructure): Promise<void> => {
    // Validate percentages
    const designSum = data.designStages.reduce((acc, curr) => acc + curr.pct, 0);
    const executionSum = data.executionStages.reduce((acc, curr) => acc + curr.pct, 0);
    
    const requiredDesign = data.validation?.designSumMustEqual || 100;
    const requiredExecution = data.validation?.executionSumMustEqual || 100;

    if (designSum !== requiredDesign) {
        throw new Error(`Validation Error: Design stages sum is ${designSum}%, expected ${requiredDesign}%`);
    }
    
    if (executionSum !== requiredExecution) {
        throw new Error(`Validation Error: Execution stages sum is ${executionSum}%, expected ${requiredExecution}%`);
    }

    const docRef = doc(db, `organizations/${orgId}/settings/paymentStructure`);
    await setDoc(docRef, data, { merge: true });
};

export const getProjectEngagement = async (orgId: string, projectId: string): Promise<ProjectEngagement | null> => {
    const docRef = doc(db, `organizations/${orgId}/projects/${projectId}`);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return (data.engagement as ProjectEngagement) || null;
};

export const setProjectEngagement = async (orgId: string, projectId: string, data: Partial<ProjectEngagement>): Promise<void> => {
    const docRef = doc(db, `organizations/${orgId}/projects/${projectId}`);
    await setDoc(docRef, { engagement: data }, { merge: true });
};
