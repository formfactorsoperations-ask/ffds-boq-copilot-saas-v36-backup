/*
  What Client Relations and a Site Supervisor may see of a project: the pure
  part of teamView.ts, with no Firebase imports, so the tests can run it.

  Both start from the Designer's copy (designViewOf), which has already taken
  out everything that is money: the commercial sections by name, and any
  price, rate, cost, margin or token by key wherever it turns up. Each then
  adds back only what its own work needs.
*/
import { designViewOf, scrub } from "./designViewStrip";
import { computeSchedule } from "../../lib/paymentSchedule";
import { buildPortalMoney } from "../../lib/portalMoney";

/** One payment milestone, as the client is quoted it. */
export interface ClientMilestone {
  id: string;
  type: "design" | "execution";
  name: string;
  percentage: number | null;
  status: string;
  /** What the client owes at this milestone, to the rupee, as their portal shows it. */
  owed: number;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  /** The planned date, when the studio set one. */
  date: string | null;
}

/** The client's side of the money: what they were quoted, have paid and still owe. Nothing of the studio's side. */
export interface ClientMoney {
  projectValue: number;
  totalPaid: number;
  balanceDue: number;
  milestones: ClientMilestone[];
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
 * What Client Relations may see: the Designer's copy, plus the client's own
 * money. Contacts, timeline, decisions and drawings are in the copy already.
 */
export function opsViewOf(project: any): any {
  return { ...designViewOf(project), clientMoney: clientMoneyOf(project) };
}

/** The site work a Supervisor reports on. The order list and its costs are not part of it. */
const SITE_EXECUTION_KEYS = ["bundles", "sofItems", "blockers", "actions", "decisions", "updates", "lastUpdated"];

/** What a Site Supervisor may see: the Designer's copy, plus the site work, with no money in it. */
export function siteViewOf(project: any): any {
  const base = designViewOf(project);
  const ex = project?.activeProject?.executionData;
  const execution: any = {};
  if (ex && typeof ex === "object") {
    for (const k of SITE_EXECUTION_KEYS) if (k in ex) execution[k] = scrub(ex[k]);
  }
  return {
    ...base,
    activeProject: project?.activeProject
      ? {
          tierId: project.activeProject.tierId || null,
          status: project.activeProject.status || null,
          startDate: project.activeProject.startDate || null,
          executionData: execution,
        }
      : null,
  };
}
