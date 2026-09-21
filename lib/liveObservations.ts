import { Observation, PurchaseOrder, CostType, FullProjectData } from "../types";
import { calculateProjectFinancials } from "./financialsUtils";
import { classifyProject } from "./projectClassification";

/**
 * THE STUDIO'S OWN BOOKS, AS THEY ARE WRITTEN.
 *
 * Studio Memory was imported once from Zoho Books -- seven completed projects,
 * exported 2 Aug 2026, frozen. Every month the OS runs, that export is a month
 * more out of date, and a benchmark nobody can move is a benchmark nobody
 * trusts.
 *
 * Procurement already records what the studio actually spends: a purchase order
 * carries the vendor, the scope, the category and a line-by-line rate, and a
 * bill against it is the confirmed number. That is the same shape as a Zoho
 * transaction, so it converts directly into the `Observation` the memory
 * library already consumes -- which is why `Observation` carries
 * `source: 'historical' | 'live'` and why `mergeObservations` exists.
 *
 * Derived on read, not written to a collection. The benchmark is therefore
 * always exactly what procurement says: correct a PO and the number corrects
 * itself, with no ledger to migrate, no write rules, and no second copy of the
 * truth to drift. The cost is that a rate which was later edited leaves no
 * trace -- worth revisiting once there is enough history for that to matter.
 *
 * Two rules, both about not inventing a benchmark:
 *
 *   - Only TAGGED-ACTUAL and UNTAGGED projects contribute. A test project's
 *     purchase orders are not the studio's spending history.
 *   - A project reports a realised margin only when there is procurement to
 *     compute the cost from. With no POs the actual cost is unknown, not zero,
 *     and emitting it would publish a triumphant 100% margin on every job.
 */

/** Procurement's scope is the same distinction the cost mix is drawn from. */
const COST_TYPE_OF: Record<string, CostType> = {
  material: "material",
  labour: "labour",
  turnkey: "subcontract",
};

/** A cancelled or still-draft PO is not spending that happened. */
const COUNTS = ["issued", "received", "closed"];

const liveOrders = (pos: PurchaseOrder[] | undefined): PurchaseOrder[] =>
  (pos || []).filter((po) => po && po.status !== "cancelled" && COUNTS.includes(po.status as string));

const whenOf = (po: PurchaseOrder): number => {
  const d = po.billDate ? new Date(po.billDate).getTime() : NaN;
  if (Number.isFinite(d)) return d;
  return po.issuedAt || po.receivedAt || 0;
};

/**
 * One observation per purchase-order line: what the studio paid, to whom, for
 * what kind of work.
 *
 * `measured` only once the vendor has billed. Until then the PO is an intent at
 * an agreed rate, which is worth recording but is not yet the books -- and the
 * memory library already weights the two differently.
 */
export function rateObservationsFromPOs(
  project: FullProjectData,
  pos: PurchaseOrder[] | undefined
): Observation[] {
  const out: Observation[] = [];
  const name = project.context?.name || project.context?.clientName || "Untitled";

  for (const po of liveOrders(pos)) {
    const at = whenOf(po);
    const billed = po.billAmount != null && po.billAmount > 0;
    const costType = COST_TYPE_OF[po.scope as string] || "uncategorised";

    for (const line of po.lines || []) {
      const amount = Number(line.amount ?? (line.qty || 0) * (line.rate || 0)) || 0;
      if (amount <= 0) continue;
      out.push({
        id: `live-r-${po.id}-${line.id}`,
        type: "rate_actual",
        at,
        source: "live",
        confidence: billed ? "measured" : "recalled",
        projectId: project.id,
        projectName: name,
        dims: {
          vendorId: po.vendorId,
          vendorName: po.vendorName,
          category: po.category || line.description || "Uncategorised",
          costType,
          roomId: po.roomId,
          clientName: project.context?.clientName,
          city: project.context?.location,
          config: project.context?.config,
        },
        actual: amount,
        unit: line.unit,
        note: po.poNumber,
      });
    }
  }
  return out;
}

/**
 * A finished project's revenue against what it actually cost.
 *
 * Revenue is the ex-GST contracted value, taken from the shared financial
 * calculation so it matches every other screen. Cost is what procurement
 * recorded -- the bill where one exists, the order where it does not.
 *
 * Returns null when there is no procurement at all, because the honest answer
 * then is "unknown", and a margin panel that quietly reads unknown as zero cost
 * is worse than one that has nothing to say.
 */
export function marginObservationFromProject(
  project: FullProjectData,
  pos: PurchaseOrder[] | undefined
): Observation | null {
  if ((project.context?.status || "") !== "completed") return null;

  const orders = liveOrders(pos);
  if (orders.length === 0) return null;

  const tier =
    project.tiers?.find((t: any) => t.id === (project.activeTierId || project.context?.approvedTierId)) ||
    project.tiers?.find((t: any) => t.name === "Comfort Upgrade") ||
    project.tiers?.[0];

  let fin: any;
  try {
    fin = calculateProjectFinancials(project.context, tier);
  } catch {
    return null;
  }

  const quoted = (fin.taxableExecution || 0) + (fin.taxableDesign || 0);
  if (quoted <= 0) return null;

  const cost = orders.reduce(
    (sum, po) => sum + (po.billAmount != null && po.billAmount > 0 ? po.billAmount : po.total || 0),
    0
  );
  if (cost <= 0) return null;

  const at = orders.reduce((latest, po) => Math.max(latest, whenOf(po)), 0);

  return {
    id: `live-m-${project.id}`,
    type: "margin_realised",
    at,
    source: "live",
    /* Measured only when every order has been billed. One unbilled PO means the
       final cost can still move, and the benchmark should know that. */
    confidence: orders.every((po) => po.billAmount != null && po.billAmount > 0) ? "measured" : "recalled",
    projectId: project.id,
    projectName: project.context?.name || project.context?.clientName || "Untitled",
    dims: {
      clientName: project.context?.clientName,
      city: project.context?.location,
      config: project.context?.config,
    },
    /* On a margin_realised observation `quoted` is REVENUE and `actual` is
       COST -- not the margin. realisedMargins() subtracts them itself. */
    quoted,
    actual: cost,
  };
}

export interface LiveObservationResult {
  observations: Observation[];
  /** Projects that contributed any spending at all. */
  projectsWithProcurement: number;
  /** Completed projects that could report a realised margin. */
  marginsMeasured: number;
  /** Completed projects that could not, for want of purchase orders. */
  marginsUnmeasurable: number;
  /** Projects considered, after test records were excluded. */
  projectsConsidered: number;
}

/**
 * Everything the OS currently knows about its own spending.
 *
 * @param posByProject purchase orders keyed by project id, fetched by the caller.
 */
export function buildLiveObservations(
  projects: FullProjectData[],
  posByProject: Record<string, PurchaseOrder[]>
): LiveObservationResult {
  const observations: Observation[] = [];
  let projectsWithProcurement = 0;
  let marginsMeasured = 0;
  let marginsUnmeasurable = 0;
  let projectsConsidered = 0;

  for (const p of projects || []) {
    /* A test project's purchase orders are not the studio's history. Untagged
       still counts: the alternative is a benchmark that ignores real spending
       because nobody has pressed a toggle yet. */
    if (classifyProject(p) === "test") continue;
    projectsConsidered++;

    const pos = posByProject[p.id];
    const orders = liveOrders(pos);
    if (orders.length > 0) projectsWithProcurement++;

    observations.push(...rateObservationsFromPOs(p, pos));

    if ((p.context?.status || "") === "completed") {
      const m = marginObservationFromProject(p, pos);
      if (m) {
        observations.push(m);
        marginsMeasured++;
      } else {
        marginsUnmeasurable++;
      }
    }
  }

  return {
    observations,
    projectsWithProcurement,
    marginsMeasured,
    marginsUnmeasurable,
    projectsConsidered,
  };
}
