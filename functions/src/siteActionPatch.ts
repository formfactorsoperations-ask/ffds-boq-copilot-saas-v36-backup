/*
  WHAT A SITE SUPERVISOR MAY CHANGE.

  Their app used to save the whole project, which meant their browser held the
  whole project: every rate, margin and payment. They now read a copy without
  the money (teamView.ts), and the six things they do on site come here as
  actions, each changing one part of the site record and nothing else. Pure,
  so the tests run it without Firebase.
*/

export type SiteAction =
  | { type: "update"; text: string }
  | { type: "material"; text: string }
  | { type: "blocker"; text: string }
  | { type: "bundle"; bundleId: string; status: string; completionPercentage: number }
  | { type: "sof"; itemId: string; status: string }
  | { type: "resolveBlocker"; blockerId: string };

/* The values types.ts gives a work package (ExecutionBundleStatus) and a selection (SOFItem). */
const BUNDLE_STATUSES = new Set(["locked", "active", "ready", "completed", "blocked"]);
const SOF_STATUSES = new Set(["pending", "draft", "frozen", "ordered", "delivered"]);

export class SiteActionError extends Error {}

const text = (v: unknown) => {
  const t = String(v ?? "").trim();
  if (!t) throw new SiteActionError("Write something first.");
  if (t.length > 2000) throw new SiteActionError("That is too long. Keep it under 2,000 characters.");
  return t;
};
const id = (v: unknown) => {
  const s = String(v ?? "");
  if (!s || s.length > 100) throw new SiteActionError("That item could not be found.");
  return s;
};
const newId = () => Math.random().toString(36).slice(2, 11);

/** Apply one action to a project, returning the changed project. Throws SiteActionError when it does not apply. */
export function applySiteAction(project: any, action: SiteAction, author: string, now = Date.now()): any {
  const next = JSON.parse(JSON.stringify(project || {}));
  if (!next.activeProject) {
    next.activeProject = { tierId: next.activeTierId || "", budget: 0, startDate: new Date(now).toISOString(), expenses: [], status: "active" };
  }
  const ex = (next.activeProject.executionData = next.activeProject.executionData || {});
  for (const k of ["bundles", "sofItems", "blockers", "actions", "decisions", "procurement", "updates"]) {
    if (!Array.isArray(ex[k])) ex[k] = [];
  }

  switch (action?.type) {
    case "update":
    case "material": {
      const body = text(action.text);
      ex.updates.unshift({
        id: newId(),
        timestamp: now,
        text: action.type === "material" ? `[Material Selection] ${body}` : body,
        type: action.type === "material" ? "material" : "general",
        author,
      });
      break;
    }
    case "blocker":
      ex.blockers.unshift({
        id: newId(), type: "decision", description: text(action.text), impactLevel: "medium",
        blockedBundleIds: [], owner: "ops", financialImpact: 0, daysDelayed: 0, resolved: false,
        raisedBy: author, raisedAt: now,
      });
      break;
    case "bundle": {
      const b = ex.bundles.find((x: any) => x?.id === id(action.bundleId));
      if (!b) throw new SiteActionError("That work package could not be found.");
      if (!BUNDLE_STATUSES.has(String(action.status))) throw new SiteActionError("That status is not one the site can set.");
      const pct = Number(action.completionPercentage);
      if (!isFinite(pct) || pct < 0 || pct > 100) throw new SiteActionError("Progress must be between 0 and 100.");
      b.status = action.status;
      b.completionPercentage = Math.round(pct);
      break;
    }
    case "sof": {
      const item = ex.sofItems.find((x: any) => x?.id === id(action.itemId));
      if (!item) throw new SiteActionError("That item could not be found.");
      if (!SOF_STATUSES.has(String(action.status))) throw new SiteActionError("That status is not one the site can set.");
      item.status = action.status;
      break;
    }
    case "resolveBlocker": {
      const b = ex.blockers.find((x: any) => x?.id === id(action.blockerId));
      if (!b) throw new SiteActionError("That blocker could not be found.");
      b.resolved = true;
      b.resolvedBy = author;
      b.resolvedAt = now;
      break;
    }
    default:
      throw new SiteActionError("That action is not one the site app can take.");
  }
  ex.lastUpdated = now;
  return next;
}
