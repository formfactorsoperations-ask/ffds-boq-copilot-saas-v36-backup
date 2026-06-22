import { CommunicationTemplateItem } from '../types';

export const EMAIL_TEMPLATE_LIBRARY: CommunicationTemplateItem[] = [
  {
    key: "discovery_call_confirmation",
    phase: "design",
    category: "Onboarding & Acquisition",
    title: "Initial Discovery Call Confirmation",
    isRequired: true,
    email: {
      subject: "Your Interior Design Journey Begins — Discovery Call Confirmed | {studioName}",
      body: "Hi {clientName},\n\nYour discovery call with {studioName} has been confirmed for {date}.\n\nOur lead designer, {designerName}, will be speaking with you to understand your vision, requirements, and budget expectations.\n\nShould you need to reschedule, please contact us at {studioPhone}.\n\nBest,\nThe {studioName} Team"
    },
    whatsapp: {
      body: "Hi {clientName}, your discovery call with {studioName} is set for {date} with {designerName}. Let us know if you need to reschedule at {studioPhone}. Talk soon!"
    },
    variables: ["clientName", "studioName", "designerName", "date", "studioPhone"],
    isCustomised: false
  },
  {
    key: "proposal_sent",
    phase: "design",
    category: "Onboarding & Acquisition",
    title: "Proposal Sent Notification",
    isRequired: true,
    email: {
      subject: "Design Proposal for {projectName} | {studioName}",
      body: "Hi {clientName},\n\nWe are pleased to share the initial design proposal for {projectName}.\n\nPlease review it to see our approach to your space, estimated timeline, and next steps.\n\nLooking forward to your feedback.\n\nBest,\n{designerName}\n{studioName} / {studioPhone}"
    },
    whatsapp: {
      body: "Hi {clientName}, we've just emailed you the design proposal for {projectName}. Please review it and let {designerName} know your thoughts. Thanks! — {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "contract_sent",
    phase: "design",
    category: "Onboarding & Acquisition",
    title: "Project Won — Contract Sent",
    isRequired: true,
    email: {
      subject: "Welcome to {studioName} — Design Agreement for {projectName}",
      body: "Hi {clientName},\n\nWelcome aboard! We are thrilled to kick off the design journey for {projectName}.\n\nPlease find the attached design agreement covering the scope and fees of {amount}.\n\nKindly review and let {designerName} know if you have any questions.\n\nBest,\nThe {studioName} Team\n{studioPhone}"
    },
    whatsapp: {
      body: "Welcome to {studioName}, {clientName}! 🚀 The design agreement for {projectName} for {amount} has been emailed to you. Please review and let us know. — {designerName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "amount", "studioPhone"],
    isCustomised: false
  },
  {
    key: "onboarding_kit_sent",
    phase: "design",
    category: "Onboarding & Acquisition",
    title: "Onboarding Kit Sent",
    isRequired: true,
    email: {
      subject: "Your Project Onboarding Kit — {projectName} | {studioName}",
      body: "Hi {clientName},\n\nTo ensure a smooth project execution, we have prepared an onboarding kit for {projectName}.\n\nThis includes our standard processes, escalation matrix, and communication protocols.\n\nPlease take a moment to read through it.\n\nBest,\n{designerName}\n{studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Hi {clientName}, we've shared an onboarding kit for {projectName} over email. This covers how we'll work together. Let {designerName} know if you have any questions. — {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "brief_freeze_confirmation",
    phase: "design",
    category: "Design Progress",
    title: "Design Brief Freeze Confirmation",
    isRequired: true,
    email: {
      subject: "Design Brief Confirmed & Frozen — {projectName} | {studioName}",
      body: "Hi {clientName},\n\nThis is to confirm that the design brief for {projectName} is now frozen as of {date}.\n\nFrom this point forward, our team, led by {designerName}, will proceed with space planning based solely on these locked requirements.\n\nBest,\nThe {studioName} Team"
    },
    whatsapp: {
      body: "Hi {clientName}, confirming that the design requirements for {projectName} have been locked in as of {date}. We are now proceeding with space planning. — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "date"],
    isCustomised: false
  },
  {
    key: "space_planning_review",
    phase: "design",
    category: "Design Progress",
    title: "Space Planning Ready for Review",
    isRequired: true,
    email: {
      subject: "Space Planning Layouts Ready for Your Review — {projectName}",
      body: "Hi {clientName},\n\nWe have completed the space planning and layouts for {projectName}.\n\nPlease review these by {date} so we can incorporate any feedback and move to the 3D visualization phase.\n\nBest,\n{designerName}\n{studioName}"
    },
    whatsapp: {
      body: "Hi {clientName}, space layouts for {projectName} are ready for your review! Please take a look by {date}. — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "date"],
    isCustomised: false
  },
  {
    key: "3d_visuals_review",
    phase: "design",
    category: "Design Progress",
    title: "3D Visuals Ready — Review Request",
    isRequired: true,
    email: {
      subject: "Your 3D Design Visuals Are Ready — {projectName} | {studioName}",
      body: "Hi {clientName},\n\nExciting news! The 3D visuals for {projectName} are ready for your review.\n\nPlease take a look and share your thoughts by {date}. {designerName} will be organizing a walk-through meeting shortly.\n\nBest,\nThe {studioName} Team"
    },
    whatsapp: {
      body: "Hi {clientName}, the 3D views for {projectName} are ready! Have a look before {date}. We'll schedule a call to walk you through them. — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "date"],
    isCustomised: false
  },
  {
    key: "revision_acknowledged",
    phase: "design",
    category: "Design Progress",
    title: "Design Revision Round Acknowledged",
    isRequired: false,
    email: {
      subject: "Revision Notes Received — {projectName} | {studioName}",
      body: "Hi {clientName},\n\nWe have received your revision notes for {projectName} as of {date}.\n\n{designerName} and the team are working on incorporating these updates and will share the revised designs shortly.\n\nBest,\nThe {studioName} Team"
    },
    whatsapp: {
      body: "Hi {clientName}, we've noted your revision requests for {projectName} on {date}. We're working on them now. — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "date"],
    isCustomised: false
  },
  {
    key: "design_approval_boq",
    phase: "design",
    category: "Closure & Payment",
    title: "Design Approval + BOQ Shared",
    isRequired: true,
    email: {
      subject: "Design Approved — BOQ & Execution Cost Estimate for {projectName}",
      body: "Hi {clientName},\n\nGreat news! The design phase for {projectName} is approved as of {date}.\n\nWe have attached the detailed Bill of Quantities (BOQ) with an estimated execution cost of {amount}.\n\nPlease review it with {designerName}.\n\nBest,\nThe {studioName} Team"
    },
    whatsapp: {
      body: "Hi {clientName}, the design for {projectName} is approved! We've emailed the BOQ estimating {amount} as of {date}. Let's chat soon. — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "amount", "date"],
    isCustomised: false
  },
  {
    key: "design_fee_payment",
    phase: "design",
    category: "Closure & Payment",
    title: "Design Fee Payment Request",
    isRequired: true,
    email: {
      subject: "Design Fee Invoice — {invoiceRef} | {projectName}",
      body: "Hi {clientName},\n\nPlease find attached the design fee invoice {invoiceRef} for {projectName}.\n\nThe amount of {amount} is due by {dueDate}.\n\nThank you for working with {studioName}.\n\nBest,\n{designerName}"
    },
    whatsapp: {
      body: "Hi {clientName}, we've emailed invoice {invoiceRef} for the design fee ({amount}). Kindly process by {dueDate}. Thanks! — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "invoiceRef", "amount", "dueDate"],
    isCustomised: false
  },
  {
    key: "revision_round_2",
    phase: "design",
    category: "Closure & Payment",
    title: "Revision Round 2 Acknowledgement",
    isRequired: false,
    email: {
      subject: "Revision Round 2 Notes Received — {projectName}",
      body: "Hi {clientName},\n\nWe've received your notes for the second round of revisions on {projectName} as of {date}.\n\nPlease note this may incur an additional cost of {amount}. {designerName} is reviewing this and will update you shortly.\n\nBest,\n{studioName}"
    },
    whatsapp: {
      body: "Hi {clientName}, round 2 revision notes received for {projectName} on {date}. This might incur an additional cost of {amount}. We'll keep you updated. — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "amount", "date"],
    isCustomised: false
  },
  {
    key: "portal_access_shared",
    phase: "design",
    category: "Closure & Payment",
    title: "Client Portal Access Link Shared",
    isRequired: false,
    email: {
      subject: "Your Project Portal is Live — {projectName} | {studioName}",
      body: "Hi {clientName},\n\nYour dedicated project portal for {projectName} is now live!\n\nYou can track progress, documents, and communications here: {portalLink}\n\nBest,\n{designerName}\n{studioName}"
    },
    whatsapp: {
      body: "Hi {clientName}! Your project portal for {projectName} is live. Access it here: {portalLink} — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "portalLink"],
    isCustomised: false
  },
  {
    key: "work_order_confirmation",
    phase: "execution",
    category: "Kickoff & Civil",
    title: "Work Order Confirmation + 30% Payment Request",
    isRequired: true,
    email: {
      subject: "Work Order Confirmed + Invoice {invoiceRef} — {projectName}",
      body: "Hi {clientName},\n\nThe work order for {projectName} is confirmed as of {date}.\n\nAttached is invoice {invoiceRef} for {amount} to kick off execution. Please process this by {dueDate}.\n\nBest,\n{designerName}\n{studioName}"
    },
    whatsapp: {
      body: "Hi {clientName}, the work order for {projectName} is confirmed as of {date}! We've emailed invoice {invoiceRef} for {amount}. Please process by {dueDate}. Let's get building! — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "invoiceRef", "amount", "dueDate", "date"],
    isCustomised: false
  },
  {
    key: "execution_start",
    phase: "execution",
    category: "Kickoff & Civil",
    title: "Execution Start Notification",
    isRequired: true,
    email: {
      subject: "Work Has Begun — {projectName} | {studioName}",
      body: "Hi {clientName},\n\nWe are excited to announce that on-site execution for {projectName} officially kicked off on {date}!\n\n{designerName} will keep you posted on the progress.\n\nBest,\nThe {studioName} Team"
    },
    whatsapp: {
      body: "Hi {clientName}, great news! On-site work for {projectName} has officially started on {date}. We'll keep you updated. — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "date"],
    isCustomised: false
  },
  {
    key: "civil_completion_payment",
    phase: "execution",
    category: "Kickoff & Civil",
    title: "Civil Work Completion + 30% Payment Request",
    isRequired: true,
    email: {
      subject: "Civil Work Complete + Invoice {invoiceRef} — {projectName}",
      body: "Hi {clientName},\n\nThe civil work phase for {projectName} has been successfully completed.\n\nPlease find attached invoice {invoiceRef} for {amount}, due by {dueDate}.\n\nBest,\n{designerName}\n{studioName}"
    },
    whatsapp: {
      body: "Hi {clientName}, civil work for {projectName} is complete! We've emailed you invoice {invoiceRef} for {amount}, due by {dueDate}. Thanks! — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "invoiceRef", "amount", "dueDate"],
    isCustomised: false
  },
  {
    key: "material_selections_reminder",
    phase: "execution",
    category: "Progress",
    title: "Material Selections Deadline Reminder",
    isRequired: false,
    email: {
      subject: "Action Required — Material Selections Needed by {dueDate} | {projectName}",
      body: "Hi {clientName},\n\nA quick reminder that we need your material selections for {projectName} by {dueDate} to stay on schedule.\n\nPlease review the pending items with {designerName} at your earliest convenience.\n\nBest,\nThe {studioName} Team"
    },
    whatsapp: {
      body: "Hi {clientName}, just a reminder to finalize your material selections for {projectName} by {dueDate} to keep our execution on track. — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "dueDate"],
    isCustomised: false
  },
  {
    key: "painting_stage_start",
    phase: "execution",
    category: "Progress",
    title: "Painting & Installation Stage Started",
    isRequired: false,
    email: {
      subject: "Painting & Installation Phase Underway — {projectName} | {studioName}",
      body: "Hi {clientName},\n\nWe are now moving into the final finishings for {projectName}. Painting and installations have begun as of {date}!\n\n{designerName} will share some site pictures soon.\n\nBest,\nThe {studioName} Team"
    },
    whatsapp: {
      body: "Hi {clientName}, painting and installations for {projectName} started on {date}! The space is really coming together now. — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "date"],
    isCustomised: false
  },
  {
    key: "painting_stage_invoice",
    phase: "execution",
    category: "Progress",
    title: "Painting & Installation Stage Invoice Raised",
    isRequired: true,
    email: {
      subject: "Invoice {invoiceRef} — Painting & Installation Stage | {projectName}",
      body: "Hi {clientName},\n\nAs we hit the painting and installation milestone for {projectName}, we are sharing invoice {invoiceRef} for {amount}.\n\nPlease process this payment by {dueDate}.\n\nBest,\n{designerName}\n{studioName}"
    },
    whatsapp: {
      body: "Hi {clientName}, we've emailed invoice {invoiceRef} for {amount} as the painting stage for {projectName} is underway. Please clear by {dueDate}. Thanks! — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "invoiceRef", "amount", "dueDate"],
    isCustomised: false
  },
  {
    key: "pre_handover_walkthrough",
    phase: "execution",
    category: "Handover",
    title: "Pre-Handover Walkthrough Invitation",
    isRequired: true,
    email: {
      subject: "Invitation: Pre-Handover Walkthrough — {projectName} | {studioName}",
      body: "Hi {clientName},\n\nWe are almost at the finish line for {projectName}! We'd like to invite you for a pre-handover walkthrough on {date}.\n\n{designerName} will guide you through the completed space to note any final touch-ups.\n\nBest,\nThe {studioName} Team"
    },
    whatsapp: {
      body: "Hi {clientName}, we're almost done with {projectName}! Let's do a pre-handover walkthrough on {date}. Let {designerName} know if that works. — {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "date"],
    isCustomised: false
  },
  {
    key: "final_payment_request",
    phase: "execution",
    category: "Handover",
    title: "Final 10% Payment Request — Completion & Handover",
    isRequired: true,
    email: {
      subject: "Final Invoice {invoiceRef} — Project Completion | {projectName}",
      body: "Hi {clientName},\n\nCongratulations on reaching the final stage of {projectName}!\n\nPlease find the final closure invoice {invoiceRef} for {amount}. Kindly clear this by {dueDate} to finalize the handover.\n\nBest,\n{designerName}\n{studioName}"
    },
    whatsapp: {
      body: "Hi {clientName}, we've shared the final closure invoice {invoiceRef} for {amount} for {projectName}. Please clear by {dueDate}. We can't wait to hand over your space! — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "invoiceRef", "amount", "dueDate"],
    isCustomised: false
  },
  {
    key: "handover_warranty",
    phase: "execution",
    category: "Handover",
    title: "Project Handover + Warranty Information",
    isRequired: true,
    email: {
      subject: "Your Home is Officially Handed Over — Warranty & Closure | {projectName}",
      body: "Hi {clientName},\n\nIt's official! {projectName} has been successfully handed over to you.\n\nAttached is your warranty document and care guide. For any future assistance, reach out to {studioEmail} or {studioPhone}.\n\nIt was a pleasure working with you.\n\nBest,\n{designerName}\nThe {studioName} Team"
    },
    whatsapp: {
      body: "Congratulations {clientName}! 🏡 {projectName} is officially handed over. We've emailed your warranty doc. Reach us at {studioPhone} for anything. Enjoy your new space! — {designerName}, {studioName}"
    },
    variables: ["clientName", "projectName", "studioName", "designerName", "studioPhone", "studioEmail"],
    isCustomised: false
  },
  {
    key: "decision_notification",
    phase: "execution",
    category: "Design Decisions",
    title: "Design Update Recorded (Site Decision)",
    isRequired: true,
    email: {
      subject: "Design update noted — {roomName}, {projectName}",
      body: "Dear {clientName},\n\nFollowing our site visit today ({date}), we have recorded the following design decision:\n\n{decisionText}\n\nRoom: {roomName}\nReason: {category}\nDiscussed with: {presentees}\n\nWe are updating the drawings to reflect this change and will share the updated drawing with you shortly for your review and approval.\n\nIf you recall this discussion differently or have any concerns, please reply to this email before the drawing is finalised.\n\nWarm regards,\nTeam {studioName}"
    },
    whatsapp: {
      body: "Dear {clientName}, following our site visit today ({date}) standard design update for {roomName} has been noted: \"{decisionText}\". We'll share drawings shortly. — {studioName}"
    },
    variables: ["clientName", "projectName", "roomName", "date", "decisionText", "category", "presentees", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "drawing_signoff_request",
    phase: "execution",
    category: "Design Drawings",
    title: "Action Required: Review Drawing",
    isRequired: true,
    email: {
      subject: "Action Required: Review drawing — {roomName}, {projectName}",
      body: "Dear {clientName},\n\nAs discussed on {date}, we have updated the drawing for {roomName}:\n\n\"{decisionText}\"\n\nThe updated drawing is now ready for your review. You can view the attached/linked drawing directly below, and then click the button to approve or send it back overlaying direct remarks.\n\n👉 Drawing Access: {drawingURL}\n\nOnce reviewed, please click the button below to provide your decision. No login required — the link opens directly.\n\nReview & Sign Link: {signoffUrl}\n\nAlternative: If you are unable to open the link, simply reply directly to this email with \"APPROVE\" or \"SEND BACK\" along with your comments, and we will update it for you.\n\nThis link is valid for 30 days (until {expiryDate}).\n\nIf you have questions, reply to this email or call us at {studioPhone}.\n\nWarm regards,\nTeam {studioName}"
    },
    whatsapp: {
      body: "Dear {clientName}, the updated drawing for {roomName} is ready for review: {drawingURL}. Please approve or send back at: {signoffUrl} — {studioName}"
    },
    variables: ["clientName", "projectName", "roomName", "date", "decisionText", "drawingURL", "signoffUrl", "expiryDate", "studioPhone", "studioName"],
    isCustomised: false
  },
  {
    key: "execution_agreement_request",
    phase: "execution",
    category: "Execution Agreements",
    title: "Action Required: Execution Agreement Signoff",
    isRequired: true,
    email: {
      subject: "Action Required: Execution Agreement for {projectName}",
      body: "Dear {clientName},\n\nPlease review and sign the Execution Agreement for your project {projectName}.\n\nThe contract value stands at {amount}.\n\nPlease find the PDF copy of the Execution Agreement and Terms & Conditions attached to this email.\n\nYou can review the full terms, inclusions, and payment schedules online and sign digitally by clicking the link below. No login required.\n\nReview & Sign Link: {signoffUrl}\n\nIf you have questions, reply to this email or call us at {studioPhone}.\n\nWarm regards,\nTeam {studioName}"
    },
    whatsapp: {
      body: "Dear {clientName}, please review and sign the Execution Agreement for {projectName} ({amount}) here: {signoffUrl} — {studioName}"
    },
    variables: ["clientName", "projectName", "amount", "signoffUrl", "studioPhone", "studioName"],
    isCustomised: false
  }
];

export function resolveTemplate(templateBody: string, variables: Record<string, string | null | undefined>): string {
  if (!templateBody) return "";
  
  return templateBody.replace(/\{(\w+)\}/g, (match, param) => {
    const val = variables[param];
    if (val === undefined || val === null || val === "") {
      return "[TBD]";
    }
    return val;
  });
}

// Strip HTML for whatsapp/clipboard copying
export function stripHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || "";
}
