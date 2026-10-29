/*
  REPORT TARGETS: what the owner measures the studio against.

  Kept apart from the studio record, which every member reads, because the
  monthly overheads are close to the salary bill. They live in
  organizations/{id}/ownerReports/targets, which only the Owner, Admin and Ops
  Director may read or write (firestore.rules).

  Money targets start empty: a target the owner never set is not shown as one.
  The rate targets start at sensible defaults the owner can change.
*/

export interface ReportTargets {
  /** Sales booked a month, before GST. */
  bookingsMonthly: number | null;
  /** Cash received a month. */
  collectionsMonthly: number | null;
  /** Booked a month per person on the team. */
  perPersonMonthly: number | null;
  winRatePct: number;
  onTimePct: number;
  /** Months of bookings target the weighted pipeline should cover. */
  pipelineMonths: number;
  /** The studio's monthly running cost, by line. */
  overheads: { salaries: number; rent: number; other: number };
  /** Live projects one Designer carries well. */
  projectsPerDesigner: number;
  /** Live sites one Site Supervisor carries well. */
  sitesPerSupervisor: number;
  /** Open leads one Client Relations person carries well. They coordinate every project, so leads are their load. */
  leadsPerClientRelations: number;
  updatedAt?: number;
  updatedBy?: string;
}

export const DEFAULT_TARGETS: ReportTargets = {
  bookingsMonthly: null,
  collectionsMonthly: null,
  perPersonMonthly: null,
  winRatePct: 35,
  onTimePct: 90,
  pipelineMonths: 3,
  overheads: { salaries: 0, rent: 0, other: 0 },
  projectsPerDesigner: 4,
  sitesPerSupervisor: 3,
  leadsPerClientRelations: 25,
};

const money = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const clamp = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const rupees = (v: unknown): number => money(v) ?? 0;

/** A stored record, or nothing, as a complete set of targets. */
export function targetsOf(raw: any): ReportTargets {
  const d = DEFAULT_TARGETS;
  const o = raw?.overheads || {};
  return {
    bookingsMonthly: money(raw?.bookingsMonthly),
    collectionsMonthly: money(raw?.collectionsMonthly),
    perPersonMonthly: money(raw?.perPersonMonthly),
    winRatePct: clamp(raw?.winRatePct, 1, 100, d.winRatePct),
    onTimePct: clamp(raw?.onTimePct, 1, 100, d.onTimePct),
    pipelineMonths: clamp(raw?.pipelineMonths, 0.5, 24, d.pipelineMonths),
    overheads: { salaries: rupees(o.salaries), rent: rupees(o.rent), other: rupees(o.other) },
    projectsPerDesigner: Math.round(clamp(raw?.projectsPerDesigner, 1, 30, d.projectsPerDesigner)),
    sitesPerSupervisor: Math.round(clamp(raw?.sitesPerSupervisor, 1, 30, d.sitesPerSupervisor)),
    leadsPerClientRelations: Math.round(clamp(raw?.leadsPerClientRelations, 1, 500, d.leadsPerClientRelations)),
    ...(raw?.updatedAt ? { updatedAt: Number(raw.updatedAt) } : {}),
    ...(raw?.updatedBy ? { updatedBy: String(raw.updatedBy) } : {}),
  };
}

export const overheadsMonthly = (t: ReportTargets): number =>
  t.overheads.salaries + t.overheads.rent + t.overheads.other;

/** What is stored: exactly the keys the rules allow. */
export function storedTargets(t: ReportTargets, by: string, at: number) {
  const clean = targetsOf(t);
  return {
    bookingsMonthly: clean.bookingsMonthly,
    collectionsMonthly: clean.collectionsMonthly,
    perPersonMonthly: clean.perPersonMonthly,
    winRatePct: clean.winRatePct,
    onTimePct: clean.onTimePct,
    pipelineMonths: clean.pipelineMonths,
    overheads: clean.overheads,
    projectsPerDesigner: clean.projectsPerDesigner,
    sitesPerSupervisor: clean.sitesPerSupervisor,
    leadsPerClientRelations: clean.leadsPerClientRelations,
    updatedAt: at,
    updatedBy: by,
  };
}
