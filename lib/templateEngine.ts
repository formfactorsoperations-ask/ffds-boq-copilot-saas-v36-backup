import { CommunicationTemplateItem } from '../types';

export const /*
  THE STUDIO'S CLIENT CORRESPONDENCE.

  One register, applied to all twenty-eight: "Dear {clientName}", a formal
  sign-off, no exclamation marks, no emoji, and no manufactured enthusiasm.
  The previous set opened "Hi {clientName}" forty times, signed off "Best,"
  twenty-one times, and carried "Welcome aboard!", "Exciting news!" and a
  rocket emoji into correspondence about seven-figure contracts.

  Three rules hold across every template:

    - anything asking the client to act says plainly what is needed and by
      when, rather than trailing off after the news
    - money, dates and references are stated once and exactly, never softened
    - the sign-off block is identical everywhere, so a client sees one studio
      writing to them rather than several people improvising

  `variables` on each entry is derived from the placeholders the copy actually
  uses, so the chips shown in Studio Settings cannot drift from the text.
*/
EMAIL_TEMPLATE_LIBRARY: CommunicationTemplateItem[] = [
  {
    key: "discovery_call_confirmation",
    phase: "design",
    category: "Onboarding & Acquisition",
    title: "Initial Discovery Call Confirmation",
    isRequired: true,
    email: {
      subject: "Discovery Call Confirmed, {date} | {studioName}",
      body: "Dear {clientName},\n\nThank you for your interest in {studioName}. We are pleased to confirm your discovery call on {date}.\n\n{designerName} will join you to understand your requirements, how you intend to use the space, and the budget you have in mind. The conversation usually takes about forty-five minutes, and there is nothing you need to prepare in advance.\n\nIf the time no longer suits you, please call us on {studioPhone} and we will gladly rearrange.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, this is to confirm your discovery call with {studioName} on {date}. {designerName} will be joining you. Should you need to rearrange, please call {studioPhone}. — {studioName}"
    },
    variables: ["clientName", "date", "designerName", "designerTitle", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "proposal_sent",
    phase: "design",
    category: "Onboarding & Acquisition",
    title: "Proposal Sent Notification",
    isRequired: true,
    email: {
      subject: "Design Proposal — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nPlease find enclosed our design proposal for {projectName}.\n\nThe proposal sets out our understanding of your brief, the design approach we recommend, an indicative programme and our professional fees. We would suggest reading the scope section closely, as it defines what is included at each stage and what is not.\n\nShould any part of it need clarification, {designerName} would be glad to talk it through with you.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, we have emailed the design proposal for {projectName}. Please review it at your convenience and let {designerName} know your thoughts. — {studioName}"
    },
    variables: ["clientName", "designerName", "designerTitle", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "contract_sent",
    phase: "design",
    category: "Onboarding & Acquisition",
    title: "Project Won — Contract Sent",
    isRequired: true,
    email: {
      subject: "Design Agreement — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nThank you for entrusting {projectName} to us.\n\nEnclosed is the design agreement setting out the scope of work and our professional fees of {amount}. Please review it at your convenience and return a signed copy so that we may formally commence.\n\nIf you would like any clause explained before signing, {designerName} will gladly take you through it.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, the design agreement for {projectName}, covering fees of {amount}, has been emailed to you. Please review and revert at your convenience. — {studioName}"
    },
    variables: ["amount", "clientName", "designerName", "designerTitle", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "onboarding_kit_sent",
    phase: "design",
    category: "Onboarding & Acquisition",
    title: "Onboarding Kit Sent",
    isRequired: true,
    email: {
      subject: "Onboarding Kit — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nNow that {projectName} is under way, we have prepared an onboarding kit for your reference.\n\nIt sets out how the project will run: the stages ahead, who your points of contact are, how approvals are recorded, and how to raise a concern should something not proceed as expected.\n\nWe would ask you to read it once at the outset, as it answers most of the questions that tend to arise later.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, we have shared the onboarding kit for {projectName} by email. It explains how we will work together through the project. — {studioName}"
    },
    variables: ["clientName", "designerName", "designerTitle", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "brief_freeze_confirmation",
    phase: "design",
    category: "Design Progress",
    title: "Design Brief Freeze Confirmation",
    isRequired: true,
    email: {
      subject: "Design Brief Frozen — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nThis is to confirm that the design brief for {projectName} was frozen on {date}.\n\nOur team will now proceed with space planning on the basis of the requirements recorded up to that date. Should anything need to change from here, we will accommodate it wherever we can, though revisions at this stage may affect the programme and may attract an additional fee.\n\nA copy of the frozen brief is retained on file for your records.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, confirming that the design brief for {projectName} was frozen on {date}. We are proceeding with space planning on that basis. — {studioName}"
    },
    variables: ["clientName", "date", "designerName", "designerTitle", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "space_planning_review",
    phase: "design",
    category: "Design Progress",
    title: "Space Planning Ready for Review",
    isRequired: true,
    email: {
      subject: "Space Plans for Your Review — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nThe space plans and preliminary layouts for {projectName} are ready for your review.\n\nWe would be grateful for your comments by {date}, so that they can be incorporated before we move to the three-dimensional design stage. Please do mark up anything that does not sit right; it is considerably easier to resolve at this stage than once detailing is under way.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, the space plans for {projectName} are ready for your review. We would be grateful for your comments by {date}. — {studioName}"
    },
    variables: ["clientName", "date", "designerName", "designerTitle", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "3d_visuals_review",
    phase: "design",
    category: "Design Progress",
    title: "3D Visuals Ready — Review Request",
    isRequired: true,
    email: {
      subject: "3D Visuals for Your Review — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nThe three-dimensional visuals for {projectName} are now ready for your review.\n\nThese show the finishes, joinery and lighting as currently proposed. We would appreciate your comments by {date}, after which {designerName} will arrange a walkthrough to discuss anything you would like reconsidered.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, the 3D visuals for {projectName} are ready for your review. Kindly share your comments by {date}. — {studioName}"
    },
    variables: ["clientName", "date", "designerName", "designerTitle", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "revision_acknowledged",
    phase: "design",
    category: "Design Progress",
    title: "Design Revision Round Acknowledged",
    isRequired: false,
    email: {
      subject: "Revisions Received — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nThank you for your comments on the design for {projectName}. These have been recorded and passed to the design team.\n\nWe expect to share revised drawings with you by {date}. Should any of your requests affect the agreed scope or the programme, we will write to you separately before proceeding.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, we have recorded your comments on {projectName} and revised drawings are expected by {date}. — {studioName}"
    },
    variables: ["clientName", "date", "designerName", "designerTitle", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "design_approval_boq",
    phase: "design",
    category: "Closure & Payment",
    title: "Design Approval + BOQ Shared",
    isRequired: true,
    email: {
      subject: "Design Approved and Bill of Quantities — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nThank you for approving the design for {projectName} on {date}.\n\nEnclosed is the bill of quantities, which prices the approved design line by line and totals {amount}. Every item corresponds to something shown in the drawings you have signed off.\n\nPlease review it and let us know of any item you would like reconsidered before we proceed to procurement.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, thank you for approving the design for {projectName}. The bill of quantities, totalling {amount}, has been emailed for your review. — {studioName}"
    },
    variables: ["amount", "clientName", "date", "designerName", "designerTitle", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "design_fee_payment",
    phase: "design",
    category: "Closure & Payment",
    title: "Design Fee Payment Request",
    isRequired: true,
    email: {
      subject: "Invoice {invoiceRef} — Design Fee, {projectName}",
      body: "Dear {clientName},\n\nPlease find enclosed invoice {invoiceRef} for the design fee on {projectName}, amounting to {amount}.\n\nThe invoice falls due on {dueDate}. Our banking details are set out on the invoice; we would be grateful if you could quote the invoice number with your remittance so that it can be reconciled promptly.\n\nShould anything on the invoice not match your understanding, please tell us before making payment.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, invoice {invoiceRef} for {amount} towards the design fee on {projectName} has been emailed to you, due {dueDate}. — {studioName}"
    },
    variables: ["amount", "clientName", "designerName", "designerTitle", "dueDate", "invoiceRef", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "revision_round_2",
    phase: "design",
    category: "Closure & Payment",
    title: "Revision Round 2 Acknowledgement",
    isRequired: false,
    email: {
      subject: "Further Revisions — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nWe have recorded your further comments on {projectName}.\n\nThis round falls outside the revisions included in our agreement and carries an additional fee of {amount}. We will not proceed beyond preliminary drafting until you have confirmed that you are content for us to do so.\n\nOnce confirmed, revised drawings are expected by {date}.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, your further comments on {projectName} are noted. This round carries an additional fee of {amount}; kindly confirm before we proceed. — {studioName}"
    },
    variables: ["amount", "clientName", "date", "designerName", "designerTitle", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "portal_access_shared",
    phase: "design",
    category: "Closure & Payment",
    title: "Client Portal Access Link Shared",
    isRequired: false,
    email: {
      subject: "Your Client Portal — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nWe have opened your client portal for {projectName}. You may reach it here:\n\n{portalLink}\n\nThe portal holds your drawings, documents, approved scope and payment schedule, and is kept current as the project progresses. The link is unique to you, and we would ask that it not be forwarded.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, your client portal for {projectName} is now open. The link has been emailed to you and is unique to your account. — {studioName}"
    },
    variables: ["clientName", "designerName", "designerTitle", "portalLink", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "work_order_confirmation",
    phase: "execution",
    category: "Kickoff & Civil",
    title: "Work Order Confirmation + 30% Payment Request",
    isRequired: true,
    email: {
      subject: "Work Order Confirmed and Invoice {invoiceRef} — {projectName}",
      body: "Dear {clientName},\n\nWe are pleased to confirm the work order for {projectName}, with site work scheduled to commence on {date}.\n\nEnclosed is invoice {invoiceRef} for {amount}, representing the first execution instalment and due on {dueDate}. Materials are ordered against this instalment, so timely settlement helps us hold the programme.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, the work order for {projectName} is confirmed, with site work commencing {date}. Invoice {invoiceRef} for {amount} is due {dueDate}. — {studioName}"
    },
    variables: ["amount", "clientName", "date", "designerName", "designerTitle", "dueDate", "invoiceRef", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "execution_start",
    phase: "execution",
    category: "Kickoff & Civil",
    title: "Execution Start Notification",
    isRequired: true,
    email: {
      subject: "Site Work Commencing — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nWork on site at {projectName} begins on {date}.\n\nOur site team will be present through the working day, and {designerName} will visit at the agreed intervals. You will receive an update as each stage completes.\n\nWe would ask that any instruction to the site team be routed through {designerName} rather than given directly, so that it is properly recorded and priced.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, site work at {projectName} commences on {date}. Kindly route any site instruction through {designerName} so that it is recorded. — {studioName}"
    },
    variables: ["clientName", "date", "designerName", "designerTitle", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "civil_completion_payment",
    phase: "execution",
    category: "Kickoff & Civil",
    title: "Civil Work Completion + 30% Payment Request",
    isRequired: true,
    email: {
      subject: "Civil Works Complete and Invoice {invoiceRef} — {projectName}",
      body: "Dear {clientName},\n\nThe civil works at {projectName} are now complete and the site is ready for the next stage.\n\nEnclosed is invoice {invoiceRef} for {amount}, due on {dueDate}, in accordance with the agreed payment schedule.\n\nYou are most welcome to visit the site to see the work completed to date; kindly let us know a convenient time.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, civil works at {projectName} are complete. Invoice {invoiceRef} for {amount} is due {dueDate}. — {studioName}"
    },
    variables: ["amount", "clientName", "designerName", "designerTitle", "dueDate", "invoiceRef", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "material_selections_reminder",
    phase: "execution",
    category: "Progress",
    title: "Material Selections Deadline Reminder",
    isRequired: false,
    email: {
      subject: "Material Selections Awaited — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nWe are still awaiting your final material selections for {projectName}.\n\nWe would be grateful to receive these by {dueDate}. Several items carry long lead times, and selections confirmed after that date are likely to affect the completion programme.\n\nIf it would help to review the options together, {designerName} will gladly arrange a session at the studio.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, we are awaiting your material selections for {projectName}. Kindly confirm by {dueDate}, as several items carry long lead times. — {studioName}"
    },
    variables: ["clientName", "designerName", "designerTitle", "dueDate", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "painting_stage_start",
    phase: "execution",
    category: "Progress",
    title: "Painting & Installation Stage Started",
    isRequired: false,
    email: {
      subject: "Painting and Installation Commencing — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nThe painting and installation stage at {projectName} begins on {date}.\n\nThis is the stage at which the space begins to read as finished. Site access will be restricted while finishes cure, and we would ask that any visit be arranged with us in advance during this period.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, painting and installation at {projectName} begins on {date}. Kindly arrange any site visit with us in advance during this stage. — {studioName}"
    },
    variables: ["clientName", "date", "designerName", "designerTitle", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "painting_stage_invoice",
    phase: "execution",
    category: "Progress",
    title: "Painting & Installation Stage Invoice Raised",
    isRequired: true,
    email: {
      subject: "Invoice {invoiceRef} — Painting and Installation, {projectName}",
      body: "Dear {clientName},\n\nEnclosed is invoice {invoiceRef} for {amount}, raised on completion of the painting and installation stage at {projectName} and due on {dueDate}.\n\nWe would be grateful if you could quote the invoice number with your remittance.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, invoice {invoiceRef} for {amount} covering the painting and installation stage at {projectName} is due {dueDate}. — {studioName}"
    },
    variables: ["amount", "clientName", "designerName", "designerTitle", "dueDate", "invoiceRef", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "pre_handover_walkthrough",
    phase: "execution",
    category: "Handover",
    title: "Pre-Handover Walkthrough Invitation",
    isRequired: true,
    email: {
      subject: "Pre-Handover Walkthrough — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nWe should like to invite you to the pre-handover walkthrough of {projectName} on {date}.\n\nThe purpose is to walk the space together and record anything you would like corrected before handover. Please do point out every item, however small; the list we make that day is what our team works to before the project closes.\n\nKindly allow about an hour.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, we should like to invite you to the pre-handover walkthrough of {projectName} on {date}. Kindly allow about an hour. — {studioName}"
    },
    variables: ["clientName", "date", "designerName", "designerTitle", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "final_payment_request",
    phase: "execution",
    category: "Handover",
    title: "Final 10% Payment Request — Completion & Handover",
    isRequired: true,
    email: {
      subject: "Final Invoice {invoiceRef} — {projectName}",
      body: "Dear {clientName},\n\nWith the snag list at {projectName} now closed, please find enclosed the final invoice {invoiceRef} for {amount}, due on {dueDate}.\n\nOn receipt we will arrange handover of the keys, together with your warranty documentation and maintenance guidance.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, the snag list at {projectName} is closed and final invoice {invoiceRef} for {amount} is due {dueDate}. — {studioName}"
    },
    variables: ["amount", "clientName", "designerName", "designerTitle", "dueDate", "invoiceRef", "projectName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "handover_warranty",
    phase: "execution",
    category: "Handover",
    title: "Project Handover + Warranty Information",
    isRequired: true,
    email: {
      subject: "Handover and Warranty — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nIt has been a pleasure delivering {projectName}, and we are glad to hand the space over to you.\n\nEnclosed is your handover docket, recording the warranty applying to each element of the work, the maintenance we would recommend, and the contacts for any service call.\n\nShould anything require attention, please write to {studioEmail} or call {studioPhone}, and we will see to it.\n\nWe hope the space serves you well.\n\nWarm regards,\n\n{designerName}\n{designerTitle}, {studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, {projectName} is now handed over. Your warranty and maintenance docket has been emailed. For any service call, please contact {studioPhone}. — {studioName}"
    },
    variables: ["clientName", "designerName", "designerTitle", "projectName", "studioEmail", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "decision_notification",
    phase: "execution",
    category: "Design Decisions",
    title: "Design Update Recorded (Site Decision)",
    isRequired: true,
    email: {
      subject: "Site Decision Recorded — {roomName}, {projectName}",
      body: "Dear {clientName},\n\nThis is to record a decision taken on site at {projectName} on {date}.\n\nArea: {roomName}\nCategory: {category}\nDecision: {decisionText}\nPresent: {presentees}\n\nWe are proceeding on this basis. Should this not reflect your understanding, please tell us within two working days, as materials may be ordered against it.\n\nWarm regards,\n\n{studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, recording a decision taken on site at {projectName} on {date}. {roomName} — {decisionText}. Kindly revert within two working days if this does not reflect your understanding. — {studioName}"
    },
    variables: ["category", "clientName", "date", "decisionText", "presentees", "projectName", "roomName", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "drawing_signoff_request",
    phase: "execution",
    category: "Design Drawings",
    title: "Action Required: Review Drawing",
    isRequired: true,
    email: {
      subject: "Drawing for Your Approval — {roomName}, {projectName}",
      body: "Dear {clientName},\n\nA drawing for {roomName} at {projectName} is ready for your approval.\n\nDrawing: {drawingURL}\nApprove here: {signoffUrl}\n\n{decisionText}\n\nThe approval link expires on {expiryDate}. Work on this element is held until approval is received, so an early response helps us keep to programme.\n\nIf anything on the drawing needs changing, kindly call {studioPhone} rather than approving it.\n\nWarm regards,\n\n{studioName}\n{studioPhone}"
    },
    whatsapp: {
      body: "Dear {clientName}, a drawing for {roomName} at {projectName} awaits your approval: {signoffUrl}. The link expires on {expiryDate}. — {studioName}"
    },
    variables: ["clientName", "decisionText", "drawingURL", "expiryDate", "projectName", "roomName", "signoffUrl", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "execution_agreement_request",
    phase: "execution",
    category: "Execution Agreements",
    title: "Action Required: Execution Agreement Signoff",
    isRequired: true,
    email: {
      subject: "{docTitle} for Signature — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nThe execution agreement for {projectName} is ready for your signature. It governs the site works, the programme and the payment schedule.\n\nSign here: {signoffUrl}\nYour one-time PIN: {pinCode}\n\nThe document records a value of {amount}. For your records its content is fixed by reference {docketHash}; any later amendment is issued as a fresh document carrying a new reference.\n\nPlease read it in full before signing. Should any clause be unclear, write to {studioEmail} or call {studioPhone} and we will explain it before you commit.\n\nWarm regards,\n\n{studioName}\n{studioPhone} | {studioEmail}"
    },
    whatsapp: {
      body: "Dear {clientName}, the {docTitle} for {projectName} is ready for your signature: {signoffUrl} (PIN {pinCode}). Kindly read it in full before signing. — {studioName}"
    },
    variables: ["amount", "clientName", "docTitle", "docketHash", "pinCode", "projectName", "signoffUrl", "studioEmail", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "design_agreement_request",
    phase: "design",
    category: "Design Contracts",
    title: "Action Required: Design Agreement Signoff",
    isRequired: true,
    email: {
      subject: "{docTitle} for Signature — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nThe design agreement for {projectName} is ready for your signature. It sets out the design scope, the number of revisions included and our professional fees.\n\nSign here: {signoffUrl}\nYour one-time PIN: {pinCode}\n\nThe document records a value of {amount}. For your records its content is fixed by reference {docketHash}; any later amendment is issued as a fresh document carrying a new reference.\n\nPlease read it in full before signing. Should any clause be unclear, write to {studioEmail} or call {studioPhone} and we will explain it before you commit.\n\nWarm regards,\n\n{studioName}\n{studioPhone} | {studioEmail}"
    },
    whatsapp: {
      body: "Dear {clientName}, the {docTitle} for {projectName} is ready for your signature: {signoffUrl} (PIN {pinCode}). Kindly read it in full before signing. — {studioName}"
    },
    variables: ["amount", "clientName", "docTitle", "docketHash", "pinCode", "projectName", "signoffUrl", "studioEmail", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "terms_agreement_request",
    phase: "execution",
    category: "Legal & Governance",
    title: "Action Required: Terms & Conditions Authorization",
    isRequired: true,
    email: {
      subject: "{docTitle} for Signature — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nThe terms of engagement for {projectName} are ready for your signature. They govern how we work together, including approvals, variations and dispute resolution.\n\nSign here: {signoffUrl}\nYour one-time PIN: {pinCode}\n\nThe document records a value of {amount}. For your records its content is fixed by reference {docketHash}; any later amendment is issued as a fresh document carrying a new reference.\n\nPlease read it in full before signing. Should any clause be unclear, write to {studioEmail} or call {studioPhone} and we will explain it before you commit.\n\nWarm regards,\n\n{studioName}\n{studioPhone} | {studioEmail}"
    },
    whatsapp: {
      body: "Dear {clientName}, the {docTitle} for {projectName} is ready for your signature: {signoffUrl} (PIN {pinCode}). Kindly read it in full before signing. — {studioName}"
    },
    variables: ["amount", "clientName", "docTitle", "docketHash", "pinCode", "projectName", "signoffUrl", "studioEmail", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "proposal_agreement_request",
    phase: "design",
    category: "Onboarding & Acquisition",
    title: "Action Required: Commercial Proposal Authorization",
    isRequired: true,
    email: {
      subject: "{docTitle} for Signature — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nThe commercial proposal for {projectName} is ready for your authorisation. It records the scope and the commercials on which the project will proceed.\n\nSign here: {signoffUrl}\nYour one-time PIN: {pinCode}\n\nThe document records a value of {amount}. For your records its content is fixed by reference {docketHash}; any later amendment is issued as a fresh document carrying a new reference.\n\nPlease read it in full before signing. Should any clause be unclear, write to {studioEmail} or call {studioPhone} and we will explain it before you commit.\n\nWarm regards,\n\n{studioName}\n{studioPhone} | {studioEmail}"
    },
    whatsapp: {
      body: "Dear {clientName}, the {docTitle} for {projectName} is ready for your signature: {signoffUrl} (PIN {pinCode}). Kindly read it in full before signing. — {studioName}"
    },
    variables: ["amount", "clientName", "docTitle", "docketHash", "pinCode", "projectName", "signoffUrl", "studioEmail", "studioName", "studioPhone"],
    isCustomised: false
  },
  {
    key: "handover_agreement_request",
    phase: "execution",
    category: "Handover",
    title: "Action Required: Handover & Warranty Docket Signoff",
    isRequired: true,
    email: {
      subject: "{docTitle} for Signature — {projectName} | {studioName}",
      body: "Dear {clientName},\n\nThe handover and warranty docket for {projectName} is ready for your signature. It records the condition at handover and the warranty applying to each element.\n\nSign here: {signoffUrl}\nYour one-time PIN: {pinCode}\n\nThe document records a value of {amount}. For your records its content is fixed by reference {docketHash}; any later amendment is issued as a fresh document carrying a new reference.\n\nPlease read it in full before signing. Should any clause be unclear, write to {studioEmail} or call {studioPhone} and we will explain it before you commit.\n\nWarm regards,\n\n{studioName}\n{studioPhone} | {studioEmail}"
    },
    whatsapp: {
      body: "Dear {clientName}, the {docTitle} for {projectName} is ready for your signature: {signoffUrl} (PIN {pinCode}). Kindly read it in full before signing. — {studioName}"
    },
    variables: ["amount", "clientName", "docTitle", "docketHash", "pinCode", "projectName", "signoffUrl", "studioEmail", "studioName", "studioPhone"],
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
