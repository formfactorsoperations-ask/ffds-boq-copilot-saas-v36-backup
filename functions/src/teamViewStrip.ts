/*
  What Client Relations and a Site Supervisor may see of a project: the pure
  part of teamView.ts, with no Firebase imports, so the tests can run it.

  Both start from the Designer's copy (designViewOf), which has already taken
  out everything that is money: the commercial sections by name, and any
  price, rate, cost, margin or token by key wherever it turns up. Each then
  adds back only what its own work needs.
*/
import { designViewOf, scrub } from "./designViewStrip";
import { clientMoneyOf, withoutAmounts } from "../../lib/clientMoney";

export { clientMoneyOf };

/**
 * What Client Relations may see: the Designer's copy, plus the client's
 * payment milestones by name, status and invoice, so they can chase them, with
 * no amounts (the owner, 21 Oct 2026: no financials for the ops team).
 * Contacts, timeline, decisions and drawings are in the copy already.
 */
export function opsViewOf(project: any): any {
  return { ...designViewOf(project), clientMoney: withoutAmounts(clientMoneyOf(project)) };
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
