# BOQ Copilot: Weekly Pulse Report (v3) Audit & Pre-Contract

## 1. PROJECT PAYMENT PLAN
- **Storage Strategy**: Per-project (isolated). 
- **Exact Path**: `organizations/{orgId}/projects/{projectId}/paymentGates`
- **Shape**:
  - `gate_name`: `string`
  - `type`: `'design' | 'execution' | 'handover'` (or similar)
  - `status`: `'pending' | 'invoice_raised' | 'paid'`
  - `invoice_raised_date`: `string` (ISO date)
  - `paid_date`: `string` (ISO date)
- **Variation**: Yes, two projects can carry entirely different stage names/counts/percentages because gates are discrete documents in the project's subcollection.

## 2. LIVE FEED
- **Storage Strategy**: Event-sourcing model, per-project subcollection.
- **Exact Path**: `organizations/{orgId}/projects/{projectId}/liveFeed`
- **Shape**:
  - Stable IDs: Yes, generated via Firestore `doc()`.
  - `type`: `'milestone' | 'scope_addition' | 'finance'`
  - `text`: `string`
  - `timestamp`: `serverTimestamp` (Firestore timestamp)
- **Queryability**: Yes, since they contain `timestamp`, they can be queried by project + date range (although indices might be required if querying with limits).

## 3. DRAWING TIMESTAMPS
- **Shape in `types.ts`**:
  - `rounds[].issuedAt`: `number | null`
  - `rounds[].clientFeedbackSubmittedAt`: `number | null`
  - `approvedAt`: `number | null`
- **Actual Population**:
  - `issuedAt`: Populated correctly with `Date.now()` when a revision is issued (`DrawingTrackerModule.tsx`).
  - `clientFeedbackSubmittedAt`: **Strictly `null`** across the entire codebase. This feature is unutilized and will not yield velocity metrics.
  - `approvedAt`: Populated correctly with `Date.now()` when drawing is approved (`handleApprove`).

## 4. BOQ STRUCTURE
- **Base Category**: Stored as `cat` (string) on the base `Item` interface.
- **Rooms**: Stored as `roomId` (string) on the `BoqItem` interface, which maps to the literal name of the room (e.g., "Living Room") derived from `ProjectContext.rooms`.
- **Derivability**: The category -> rooms join is derivable in memory by aggregating `BoqItem` arrays (grouping by `roomId` and then `cat`), but there are no strict relational IDs (just string labels).

## 5. DECISION TRACKER
- **Interface**: `DecisionData`
- **Storage**: `projects/{projectId}/decisions`
- **Shape & Fields**:
  - `decisionText`: `string`
  - `roomName`: `string`
  - `category`: `'Site Condition' | 'Client Request' | 'Design Upgrade' | 'Value Engineering'`
  - `boqImpact`: `'none' | 'rate_change' | 'new_item'`
  - `status`: `'draft' | 'notified' | 'drawing_pending' | 'drawing_sent' | 'signed' | 'disputed'`
  - **Dates** (all Firestore `Timestamp` objects): `notifiedAt`, `drawingUploadedAt`, `signoffRequestSentAt`, `tokenExpiresAt`, `respondedAt` (inside nested `SignoffData`).

## 6. TASKS
- **Status**: **ABSENT**
- **Details**: There is no general, project-level persistent task collection or todo mechanism that a generic manual task system could write to.
  - `ProjectTask`: Exists strictly as a deterministically generated timeline array (Gantt schedule).
  - `ExecutionAction`: Exists in `ActiveProject.executionData` but is highly specific to blockers/procurement.
  - `MOMActionItem`: Exists strictly within Minutes of Meetings documents.
  - `WeeklyPulseReport.manualActions`: Stored inside the weekly report itself, but not in a unified task database.

## 7. EXISTING WEEKLY REPORT
- **Stored Shape**: `WeeklyPulseReport` interface.
  - `weekNumber`, `startDate`, `endDate`, `publishedAt`
  - `executiveBriefing`, `nextWeekPlan`
  - `manualActions`, `roomProgress`, `revisions`, `selections`
  - `sectionVisibility`
- **Sync/Compile Path**:
  - The UI updates local React state `projectContext.weeklyPulseReports`.
  - **Critical Bug**: `WeeklyProgressReportTab` bypasses `dbService.saveProject` and calls `setDoc(projRef, { weeklyPulseReports: reports }, { merge: true })` directly on `projects/{projectId}`. This saves the array to the **root** of the `FullProjectData` document in Firestore, rather than inside the `context` object where the TypeScript interfaces expect it (`types.ts: 581`). Consequently, the cloud sync path is fundamentally flawed.

---

## PREREQUISITES (Blocking Severity)

1. **CRITICAL - Weekly Report Storage Path Fix**:
   - `WeeklyPulseReport` array writes must be routed through `services/dbService.saveProject(projectData)` to ensure it safely lands in `context.weeklyPulseReports` and respects the compression pipeline, or it must be isolated into a subcollection (`organizations/{orgId}/projects/{projectId}/weeklyReports`).

2. **HIGH - Task Engine Unification**:
   - If Phase 3 requires tracking "mismatch tasks" or manual actions across the project, a dedicated `tasks` subcollection or an extension to `ExecutionAction` must be established. Relying on `manualActions` isolated inside previous weekly reports creates fragmented debt.

3. **MODERATE - Client Feedback Velocity**:
   - `clientFeedbackSubmittedAt` is currently dead code (always `null`). Any velocity metrics regarding client response times cannot be computed until a feedback trigger is implemented in the Client Portal.
