import { heldInDispute } from "../../lib/disputes";
import { DEFAULT_ESCALATION } from "../../lib/moneyIntel";

/*
  THE PAYMENT STAGES A WEEKLY REPORT READS, AND WHEN ONE IS OVERDUE.

  compileWeeklyReports read a `paymentMilestones` subcollection under the
  project. Nothing has ever written one: Money keeps a project's milestones as
  the `paymentMilestones` array on the project's context, the same `context`
  the report already reads the contract sign-off from. So the stages were
  always empty and the invoice-overdue flag never fired.

  Kept free of firebase-admin so the rule can be tested on its own.
*/

const DAY = 24 * 60 * 60 * 1000;

/** The project's milestones, as Money saved them. Each keeps its own shape. */
export function weeklyReportPaymentStages(projectData: any): any[] {
  const list = projectData?.context?.paymentMilestones;
  return Array.isArray(list) ? list.filter((m: any) => m && m.id != null) : [];
}

/** How many days after the invoice a stage counts as late: the studio's reminder threshold in Money. */
export function overdueAfterDays(studioSettings: any): number {
  const d = Number(studioSettings?.paymentMilestones?.escalation?.reminderDays);
  return d > 0 ? d : DEFAULT_ESCALATION.reminderDays;
}

const invoicedAt = (iso: unknown): number => {
  if (!iso) return 0;
  const t = new Date(String(iso)).getTime();
  return isNaN(t) ? 0 : t;
};

/**
 * Whether one stage is overdue, as Money's collections chase has it
 * (lib/moneyIntel.ts `collections`, fed by lib/paymentSchedule.ts
 * `outstandingInvoices`): invoiced, not paid, not held in a payment dispute,
 * and at least `days` whole days past its invoice date.
 */
export function stageOverdue(ctx: any, m: any, days: number, now: number = Date.now()): boolean {
  if (!m || m.status !== "invoiced") return false;
  if (heldInDispute(ctx, m, now)) return false;
  const since = invoicedAt(m.invoiceDate);
  if (!since) return false;
  return Math.floor((now - since) / DAY) >= days;
}

/** Whether any stage on the project is overdue. */
export function hasInvoiceOverdue(projectData: any, days: number, now: number = Date.now()): boolean {
  const ctx = projectData?.context || {};
  return weeklyReportPaymentStages(projectData).some((m) => stageOverdue(ctx, m, days, now));
}

export type WeeklyHealthLabel = "on_track" | "attention" | "at_risk";

/**
 * The health label on a weekly report.
 *
 *   at_risk:   an invoice is overdue, or the design gate has sat unactivated
 *              for more than 14 days since it was last assessed;
 *   attention: a drawing round issued to the client more than 7 days ago is
 *              still waiting, or a drawing is flagged for a companion gap.
 */
export function weeklyHealthLabel(input: {
  projectData: any;
  designGate: any;
  drawings: any[];
  overdueDays: number;
  now?: number;
}): WeeklyHealthLabel {
  const now = input.now ?? Date.now();
  const SEVEN_DAYS = 7 * DAY;
  const FOURTEEN_DAYS = 14 * DAY;
  const designGate = input.designGate;

  const invoiceOverdue = hasInvoiceOverdue(input.projectData, input.overdueDays, now);
  const gateBlocked = !!(designGate && !designGate.gateActivated && designGate.lastAssessedAt
    && (now - designGate.lastAssessedAt.toMillis() > FOURTEEN_DAYS));

  let clientOverdue = false;
  let companionGap = false;
  (input.drawings || []).forEach((d: any) => {
    if (d.isGapFlagged) companionGap = true;
    if (d.rounds?.length > 0) {
      const cur = d.rounds[d.currentRound - 1];
      if (cur && cur.status === "issued" && cur.issuedAt && (now - cur.issuedAt > SEVEN_DAYS)) clientOverdue = true;
    }
  });

  if (invoiceOverdue || gateBlocked) return "at_risk";
  if (clientOverdue || companionGap) return "attention";
  return "on_track";
}
