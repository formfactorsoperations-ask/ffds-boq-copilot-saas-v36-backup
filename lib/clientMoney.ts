/*
  THE CLIENT'S SIDE OF A PROJECT'S MONEY.

  What the client was quoted, has paid and still owes, milestone by milestone,
  worked out the way their portal is. Client Relations chases payments with
  it, so it is carried in their copy of a project (functions/src/teamView.ts)
  and worked out the same way on the studio's own screens. Nothing of the
  studio's side -- costs, margins, the billable split -- is in it.

  Shared by the app and the Cloud Functions.
*/
import { computeSchedule } from "./paymentSchedule";
import { buildPortalMoney } from "./portalMoney";

/** One payment milestone, as the client is quoted it. */
export interface ClientMilestone {
  id: string;
  type: "design" | "execution";
  name: string;
  percentage: number | null;
  status: string;
  /** What the client owes at this milestone, to the rupee, as their portal shows it. Null where amounts are hidden. */
  owed: number | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  /** The planned date, when the studio set one. */
  date: string | null;
}

/** The client's side of the money: what they were quoted, have paid and still owe. Nothing of the studio's side. */
export interface ClientMoney {
  /** Null, with the three below, where amounts are hidden (withoutAmounts). */
  projectValue: number | null;
  totalPaid: number | null;
  balanceDue: number | null;
  milestones: ClientMilestone[];
  /** True when the figures were taken out: the milestones are there to chase by name and invoice. */
  amountsHidden?: boolean;
}

const num = (v: any) => (typeof v === "number" && isFinite(v) ? v : 0);

/*
  Worked out the way the client's portal is: lib/paymentSchedule over the
  saved context and the active version's summary, reduced by lib/portalMoney
  to the figures a client is shown. The billable and cash split, the discount
  structure and the version totals stay behind.
*/
export function clientMoneyOf(project: any): ClientMoney | null {
  const ctx = project?.context || {};
  const milestones: any[] = Array.isArray(ctx.paymentMilestones) ? ctx.paymentMilestones : [];
  if (!milestones.length) return null;
  try {
    const tier = (project?.tiers || []).find((t: any) => t?.id === project?.activeTierId) || null;
    const schedule = computeSchedule({ context: ctx, tierSummary: tier?.summary });
    const money = buildPortalMoney(schedule);
    return {
      projectValue: num(money.projectValue),
      totalPaid: num(money.totalPaid),
      balanceDue: num(money.balanceDue),
      milestones: milestones.map((m: any) => ({
        id: String(m.id),
        type: m.type === "execution" ? "execution" : "design",
        name: String(m.name || ""),
        percentage: typeof m.percentage === "number" ? m.percentage : null,
        status: String(m.status || "pending"),
        owed: num(money.milestoneAmounts?.[m.id]),
        invoiceNumber: m.invoiceNumber ? String(m.invoiceNumber) : null,
        invoiceDate: m.invoiceDate ? String(m.invoiceDate) : null,
        date: m.date ? String(m.date) : null,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * The same milestones with every figure taken out: what Client Relations
 * chases a payment with. The name, status, invoice number and dates stay.
 */
export function withoutAmounts(money: ClientMoney | null | undefined): ClientMoney | null {
  if (!money) return null;
  return {
    projectValue: null,
    totalPaid: null,
    balanceDue: null,
    amountsHidden: true,
    milestones: money.milestones.map((m) => ({ ...m, owed: null, percentage: null })),
  };
}
