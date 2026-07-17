# WEEKLY-REPORT-DATA-CONTRACT

## 1. Drawing Tracker
- **EXISTS**
- **Path**: `types.ts`
- **Shape**:
  - `DrawingTrackerItem` (lines 821-839): `id`, `name`, `boqTriggers`, `companionOf` (`string | null`), `isMandatory`, `isGapFlagged`, `currentRound`, `approvedAt` (`number | null`), `rounds` (`DrawingRound[]`), `gfc` object.
  - `DrawingRound` (lines 813-819): `roundNumber`, `issuedAt`, `issuedBy`, `clientFeedbackSubmittedAt`, `status`.
  - `DrawingRevision` (lines 799-811): `id`, `roundNumber`, `requestedAt`, `requestDescription`, `cause`, `chargeable`, `roundAdvances`, `chargeInvoiceId`, `classifiedBy`, `classificationConfidence`, `classifiedAt`.

## 2. Design Complete Gate
- **EXISTS**
- **Path**: `types.ts`
- **Shape**:
  - `DesignGateDoc` (lines 1011-1026): contains `checklist` (with `item_1` to `item_6` of type `DesignGateChecklistItem`), `gateActivated` (`boolean`), `activatedAt`, `activatedBy`, `stage3InvoiceId`, `readinessScore`, `lastAssessedAt`.
- **Override Mechanism**: No specific override field exists in the document model. However, an override is enforced via UI logic (`item.ownerOnly && !isOwner`) in `components/ops/DesignCompleteGate.tsx` which allows owners to check locked items.

## 3. Payment Data
- **EXISTS**
- **Path**: `types.ts` & `lib/utils.ts`
- **Shape**:
  - `PaymentStructure` (lines 1420-1428) contains `designStages` and `executionStages` of type `PaymentStructureStage[]`.
  - `PaymentMilestone` (lines 205-235) with `type: 'design' | 'execution'`.
  - `PaymentAdvance` (lines 1342-1356).
- **Currency Formatting**: 
  - `formatINR(value: any)` exists in `lib/utils.ts`.
  - **Ad-Hoc Usage**: There are widespread ad-hoc formatting instances using `.toLocaleString('en-IN')` with a hardcoded `₹` prefix throughout `components/ClientPortal.tsx`, `components/client/PaymentSchedulePage.tsx`, `hooks/useEscalationProtocol.ts`, and `lib/comparison.ts`.

## 4. Contract Module
- **EXISTS**
- **Path**: `types.ts`
- **Shape**: 
  - `ProjectContext.contractSignoff` (lines 521-529): contains `status`, `token`, `sentAt`, `signedAt`, `clientName`, `ipAddress`, `refId`.
  - T&C acknowledgment exists within `ProjectEngagement` (lines 1430-1440): features `acknowledgedAt: number | null` and `acknowledgedVia: "WhatsApp" | "email" | null`.

## 5. Scope Additions
- **PARTIAL**
- **Path**: `types.ts`
- **Shape**: Represented by `ProjectUpdateRecord` (lines 296-305). Includes `type` (`'client_upgrade' | 'hidden_site_issue' | 'design_change' | 'goodwill'`) and `status` (`'draft' | 'pending_approval' | 'approved' | 'rejected'`).
- **Missing**: `invoiceStatus` and `paymentGate` are **ABSENT** from the `ProjectUpdateRecord` shape.

## 6. SOF & Selections
- **EXISTS**
- **Path**: `types.ts`
- **Shape**: 
  - `SOFItem` (lines 1059-1068): `status` values are `'pending' | 'draft' | 'frozen' | 'ordered' | 'delivered'`.
  - `MaterialSelection` (lines 319-355): uses `SELECTION_STATUS` (lines 307-311) containing `'to_select' | 'at_shop' | 'sent_for_approval' | 'locked'`.

## 7. Client Portal
- **EXISTS**
- **Path**: `App.tsx` and `components/ClientPortal.tsx`
- **Shape**: Served as a React component `<ClientPortal>` when `appMode === "client"`. 
- **Data Reaches It**: Fetches project data from `projectLibrary` based on the URL parameter `?portal=project_id` matching an existing project `id`. State is saved to `localStorage`.

## 8. Studio Settings
- **EXISTS**
- **Path**: `hooks/useStudioSettings.ts` and `types.ts`
- **Shape**: 
  - `StudioSettings` in `hooks/useStudioSettings.ts` holds process, fee, terms, onboarding, email, and calendar configurations.
  - Actual branding and contact fields (`orgName`, `orgLogo`, `contactEmail`, `contactPhone`, `officeAddress`, `bankDetails` like `accountName`, `bankName`, `accountNumber`) are located in `OrganizationContext` inside `types.ts` (lines 2-33).

## 9. RBAC
- **EXISTS**
- **Path**: `components/client/PaymentSchedulePage.tsx`, `components/StudioExcelGrid.tsx`, `components/StudioDashboard.tsx`, etc.
- **Shape**: Owner visibility is calculated via an `isOwner` boolean: `['Super Admin', 'Admin', 'Ops Director'].includes(currentRole)`.
- **Financial Filtering**: When `!isOwner`, financial values are masked (e.g., yielding `'[HIDDEN]'` or `'--'`). The "Designer" role falls outside the owner check and therefore lacks visibility into these fields.

## 10. Report/PDF Generation Utilities
- **EXISTS**
- **Path**: Used dynamically across various components (e.g., `components/client/HandoverDocketPage.tsx`, `ExecutionAgreementPage.tsx`, `MomAcknowledgePage.tsx`).
- **Shape**: Relies on asynchronous imports of `html2pdf.js` (`await import('html2pdf.js')`) which hooks into a DOM element reference to generate and save PDF blobs or data URIs.

---

## RISKS
- **Scope Additions Missing Fields**: The Weekly Report plan assumes `invoiceStatus` and `paymentGate` exist for Scope Additions, but they are completely absent from `ProjectUpdateRecord`.
- **Scattered Contract Data**: `contract.signedAt` and `tcAcknowledgedAt` assumptions don't map to a singular structure. They exist separately as `ProjectContext.contractSignoff.signedAt` and `ProjectEngagement.acknowledgedAt`.
- **No Explicit Gate Override**: There is no data-level override mechanism or flag (e.g., `gateOverride`) inside `DesignGateDoc`. The bypass strictly happens at the UI level based on the `isOwner` flag.
- **Inconsistent Currency Formatting**: While `formatINR` exists, the codebase currently relies heavily on ad-hoc formatting (`₹${value.toLocaleString('en-IN')}`) directly in TSX, making unified currency manipulation brittle.
