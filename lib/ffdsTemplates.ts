export const FFDS_TEMPLATES: Record<string, { subject: string, emailBody: string, whatsappBody: string }> = {
  "proposal_sent": {
    subject: "Design Proposal | {projectName}",
    emailBody: "Dear {clientName},\n\nWe are pleased to share the initial design proposal for {projectName}.\n\nPlease review it to see our approach to your space, estimated timeline, and next steps. We look forward to your feedback.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, we've just emailed you the design proposal for {projectName}. Please review it and let {designerName} know your thoughts. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "contract_sent": {
    subject: "Design Agreement — {projectName} | Form Factors Design Studio",
    emailBody: "Dear {clientName},\n\nWelcome aboard! We are thrilled to officially kick off the design journey for {projectName}.\n\nPlease find the attached design agreement detailing the scope and our professional fees of {amount}. Kindly review and sign the agreement to formally initiate the project.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Welcome to Form Factors Design Studio, {clientName}! 🚀 The design agreement for {projectName} covering our fees of {amount} has been emailed to you. Please review and let us know. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "onboarding_kit_sent": {
    subject: "Your Onboarding Kit — {projectName} | Form Factors Design Studio",
    emailBody: "Dear {clientName},\n\nTo ensure a seamless project execution, we have prepared an onboarding kit for {projectName}.\n\nThis document outlines our standard operating procedures, escalation matrix, and communication protocols. Please take a moment to read through it so you know exactly what to expect in the coming weeks.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, we've shared an onboarding kit for {projectName} via email. This covers how we'll work together. Let {designerName} know if you have any questions. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "brief_freeze_confirmation": {
    subject: "Design Brief Confirmed — {projectName} | Form Factors Design Studio",
    emailBody: "Dear {clientName},\n\nThis is to officially confirm that the design brief for {projectName} has been frozen as of {date}.\n\nFrom here onward, our team will proceed with space planning based solely on these locked requirements. Any subsequent changes may impact project timelines and incur additional revisions.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, confirming that the design requirements for {projectName} have been locked in as of {date}. We are now proceeding with formal space planning. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "space_planning_review": {
    subject: "Space Planning — Ready for Your Review | {projectName}",
    emailBody: "Dear {clientName},\n\nWe have completed the space planning and preliminary layouts for {projectName}.\n\nPlease review the attached plans by {date} so we can incorporate any critical feedback and progress to the 3D visualization phase seamlessly.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, space layouts for {projectName} are ready for your review! Please take a look by {date}. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "3d_visuals_review": {
    subject: "3D Design Visuals — Ready for Review | {projectName}",
    emailBody: "Dear {clientName},\n\nExciting news! The 3D design visuals for {projectName} are now ready for your review.\n\nPlease take a look and share your thoughts by {date}. {designerName} will be organizing a detailed walk-through meeting shortly to discuss the concepts in depth.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, the 3D views for {projectName} are ready! Have a look before {date}. We'll schedule a call to walk you through them. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "revision_acknowledged": {
    subject: "Revision Feedback Received — {projectName} | Form Factors Design Studio",
    emailBody: "Dear {clientName},\n\nWe have successfully received your revision notes for {projectName} as of {date}.\n\nOur team is currently evaluating your inputs and will incorporate these updates. We will share the revised designs with you shortly.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, we've noted your revision requests for {projectName} on {date}. We're working on them now. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "design_approval_boq": {
    subject: "Design Approved — Bill of Quantities for Review | {projectName}",
    emailBody: "Dear {clientName},\n\nGreat news! The design phase for {projectName} is officially approved as of {date}.\n\nWe have attached the detailed Bill of Quantities (BOQ) with an estimated execution cost of {amount}. Please review the document carefully with {designerName}.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, the design for {projectName} is approved! We've emailed the BOQ estimating {amount} as of {date}. Let's chat soon. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "revision_round_2": {
    subject: "Revision Round 2 — Inputs Received | {projectName}",
    emailBody: "Dear {clientName},\n\nWe acknowledge receipt of your notes for the second round of revisions on {projectName} as of {date}.\n\nPlease keep in mind this may incur an additional cost of {amount}. {designerName} is currently reviewing the implications and will update you shortly.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, round 2 revision notes received for {projectName} on {date}. This might incur an additional cost of {amount}. We'll keep you updated. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "portal_access_shared": {
    subject: "Your Project Portal is Now Active | {projectName}",
    emailBody: "Dear {clientName},\n\nYour dedicated project portal for {projectName} operations is now active.\n\nYou can track execution progress, essential documents, and critical communications here: {portalLink}\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}! Your project portal for {projectName} is live. Access it here: {portalLink} \n\nWarm regards,\nForm Factors Design Studio"
  },
  "work_order_confirmation": {
    subject: "Work Order Confirmed + Invoice {invoiceRef} | {projectName}",
    emailBody: "Dear {clientName},\n\nThe work order for {projectName} stands officially confirmed as of {date}.\n\nAttached is invoice {invoiceRef} for {amount} to initiate the execution phase. Please process this advance payment by {dueDate}.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, the work order for {projectName} is confirmed as of {date}! We've emailed invoice {invoiceRef} for {amount}. Please process by {dueDate}. Let's get building! \n\nWarm regards,\nForm Factors Design Studio"
  },
  "execution_start": {
    subject: "Execution Commenced — {projectName} | Form Factors Design Studio",
    emailBody: "Dear {clientName},\n\nWe are delighted to announce that on-site execution for {projectName} officially commenced on {date}.\n\n{designerName} and the site operations team will keep you apprised of significant progress updates.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, great news! On-site work for {projectName} has officially started on {date}. We'll keep you updated. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "civil_completion_payment": {
    subject: "Civil Work Complete + Invoice {invoiceRef} | {projectName}",
    emailBody: "Dear {clientName},\n\nThe foundational civil work phase for {projectName} has been successfully completed.\n\nPlease find attached invoice {invoiceRef} for {amount}, falling due by {dueDate}.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, civil work for {projectName} is complete! We've emailed you invoice {invoiceRef} for {amount}, due by {dueDate}. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "material_selections_reminder": {
    subject: "Action Required — Material Selections Pending | {projectName}",
    emailBody: "Dear {clientName},\n\nThis is a gentle reminder that your final material selections for {projectName} remain pending. Kindly finalize these by {dueDate} to ensure our execution remains on schedule.\n\nPlease review these outstanding items with {designerName} at your earliest convenience.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, just a reminder to finalize your material selections for {projectName} by {dueDate} to keep our execution strictly on track. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "painting_stage_start": {
    subject: "Painting & Installation Phase Underway | {projectName}",
    emailBody: "Dear {clientName},\n\nWe are excited to share that {projectName} is moving into the final finishing phases. Painting and major installations are officially underway as of {date}.\n\n{designerName} will share detailed progress pictures with you shortly.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, painting and installations for {projectName} started on {date}! The space is really coming together now. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "painting_stage_invoice": {
    subject: "Invoice {invoiceRef} — Painting & Installation Milestone | {projectName}",
    emailBody: "Dear {clientName},\n\nAs we have reached the painting and installation milestone for {projectName}, we are sharing invoice {invoiceRef} for {amount}.\n\nPlease process this payment by {dueDate} as per the standard schedule.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, we've emailed invoice {invoiceRef} for {amount} as the painting stage for {projectName} is well underway. Please clear by {dueDate}. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "pre_handover_walkthrough": {
    subject: "Pre-Handover Walkthrough Invitation | {projectName}",
    emailBody: "Dear {clientName},\n\nWe are approaching the finish line for {projectName}! We cordially invite you for a comprehensive pre-handover walkthrough on {date}.\n\n{designerName} will guide you through the completed space to note any granular touch-ups required before final handover.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, we're almost done with {projectName}! Let's do a pre-handover walkthrough on {date}. Let {designerName} know if that works. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "final_payment_request": {
    subject: "Final Invoice {invoiceRef} — Project Completion | {projectName}",
    emailBody: "Dear {clientName},\n\nCongratulations on reaching the final milestone of {projectName}!\n\nPlease find the final closure invoice {invoiceRef} for {amount}. Kindly clear this operational invoice by {dueDate} to finalize our handover processes.\n\nWarm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Dear {clientName}, we've shared the final closure invoice {invoiceRef} for {amount} for {projectName}. Please clear by {dueDate}. We can't wait to hand over your space! \n\nWarm regards,\nForm Factors Design Studio"
  },
  "handover_warranty": {
    subject: "Project Completion & Handover | {projectName}",
    emailBody: "Dear {clientName},\n\nIt is official! {projectName} has been successfully completed and handed over to you.\n\nAttached is your comprehensive warranty document and material care guide. For any future assistance or requirements, please reach out directly at {studioEmail} or {studioPhone}.\n\nIt was a professional privilege to work with you on realizing your vision.\n\nWith warm regards,\n{designerName}\n{designerTitle} | Form Factors Design Studio\nForm Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone} | {studioEmail}",
    whatsappBody: "Congratulations {clientName}! 🏡 {projectName} is officially handed over. We've emailed your warranty doc. Reach us at {studioPhone} for anything. Enjoy your new space! \n\nWarm regards,\nForm Factors Design Studio"
  },
  "decision_notification": {
    subject: "Design Decision Formulated — {roomName} | {projectName}",
    emailBody: "Dear {clientName},\n\nFollowing our collaborative on-site review today ({date}), we have officially noted the following design adjustment for {roomName}:\n\n\"{decisionText}\"\n\nRoom/Zone: {roomName}\nClassification: {category}\nPresent on site: {presentees}\n\nOur design and engineering team is updating the active execution blueprints to reflect this alignment. Updated technical drawings will be submitted for your formal digital signoff shortly.\n\nShould there be any variance in your recollection or additional inputs, please notify us before active site drawing locking.\n\nWith warm regards,\nTeam Form Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone}",
    whatsappBody: "Dear {clientName}, following today's site visit ({date}), a design alignment for {roomName} has been recorded: \"{decisionText}\". Technical drawings are being synchronized. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "drawing_signoff_request": {
    subject: "Action Required: Review Updated Blueprints — {roomName} | {projectName}",
    emailBody: "Dear {clientName},\n\nIn line with our on-site discussions on {date}, the execution drawings for {roomName} have been finalized and updated successfully:\n\n\"{decisionText}\"\n\nThese drawings are now ready for your final design review and signoff. You can access the blueprints through our design portal below:\n\n👉 Access Digital Blueprints: {drawingURL}\n\nTo lock this space into execution and prevent procurement delay, kindly review and sign off or request adjustments using the secure portal link below:\n\nReview & Digital Signoff: {signoffUrl}\n\nIf you have any queries about the specifications or visual layout, please reply directly before {expiryDate}.\n\nWith warm regards,\nTeam Form Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone}",
    whatsappBody: "Dear {clientName}, the updated execution drawings for {roomName} are ready for review: {drawingURL}. Please sign off or add reviews here: {signoffUrl}. \n\nWarm regards,\nForm Factors Design Studio"
  },
  "execution_agreement_request": {
    subject: "Action Required: Execution Agreement Signoff | {projectName}",
    emailBody: "Dear {clientName},\n\nWe are excited to lock in the execution phase of your interior design journey for {projectName}.\n\nPlease find the detailed Execution Agreement covering all material schedules, schedule of finishes (SOF), and payment schedules attached to this email.\n\nThe final execution contract value stands at {amount} inclusive of professional site supervisions.\n\nTo initiate civil works on-site, please digitally review and sign the execution agreement via our secure link below. No login required:\n\nReview & Sign Execution Agreement: {signoffUrl}\n\nShould you need any clarifications on the clauses or payment schedules, please call us immediately.\n\nWith warm regards,\nTeam Form Factors Design Studio\nMinimal Design. Maximum Impact.\n{studioPhone}",
    whatsappBody: "Dear {clientName}, your Execution Agreement ({amount}) for {projectName} is ready for review and digital signatures: {signoffUrl}. \n\nWarm regards,\nForm Factors Design Studio"
  }
};
