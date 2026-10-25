import { FullProjectData, ProposalTier } from '../types';

/**
 * Benchmarks for Pricing & Tiers, read from the studio's own projects.
 *
 * The screen used to print "median 22.75%" whatever the studio had quoted, and
 * when there was nothing to compare against it listed two projects that do not
 * exist ("Majiwada 2-BHK", "Hiranandani One") as "comparable past projects".
 * A project with no priced option was given a 22.1% GM to compare with.
 *
 * Every figure here is now the studio's own, and when there is nothing to
 * measure against the answer is "nothing yet", not a plausible number.
 */

export interface ProjectBenchmark {
  id: string;
  name: string;
  /** Quoted value, design fee included. */
  value: number;
  /** Blended gross margin, %. */
  gm: number;
  itemsCount: number;
  area: number;
}

/** The option a project is measured by: the approved one, else the active one. */
function benchmarkTier(p: FullProjectData): ProposalTier | undefined {
  const tiers = p.tiers || [];
  const approvedId = (p.context as any)?.approvedTierId;
  return tiers.find(t => t.id === approvedId)
    || tiers.find(t => t.id === p.activeTierId)
    || tiers[0];
}

/** A project's benchmark, or null when it has no priced option to measure. */
export function projectBenchmark(p: FullProjectData): ProjectBenchmark | null {
  const tier = benchmarkTier(p);
  const s: any = tier?.summary;
  if (!tier || !s) return null;
  const value = Number(s.totalRevenue || s.totalSell) || 0;
  const gmRaw = s.blendedGm ?? s.totalGm;
  if (!(value > 0) || gmRaw === undefined || gmRaw === null || !Number.isFinite(Number(gmRaw))) return null;
  return {
    id: p.id,
    name: p.context?.name || 'Untitled project',
    value,
    gm: Number(gmRaw),
    itemsCount: Number(s.itemCount ?? tier.boq?.length) || 0,
    area: Number(p.context?.area) || 0,
  };
}

/** Every other project the studio has priced. */
export function otherBenchmarks(projects: FullProjectData[] | undefined, current: { id?: string; name?: string }): ProjectBenchmark[] {
  return (projects || [])
    .filter(p => (current.id ? p.id !== current.id : true) && (current.name ? p.context?.name !== current.name : true))
    .map(projectBenchmark)
    .filter((b): b is ProjectBenchmark => b !== null);
}

/** The median blended GM of those projects, or null when there are none. */
export function medianGm(benchmarks: ProjectBenchmark[]): number | null {
  if (!benchmarks.length) return null;
  const gms = benchmarks.map(b => b.gm).sort((a, z) => a - z);
  const mid = Math.floor(gms.length / 2);
  return gms.length % 2 ? gms[mid] : (gms[mid - 1] + gms[mid]) / 2;
}

/** The projects closest in size, nearest first. Projects with no area go last. */
export function closestInSize(benchmarks: ProjectBenchmark[], area: number, n = 2): ProjectBenchmark[] {
  const distance = (b: ProjectBenchmark) => (b.area > 0 && area > 0 ? Math.abs(b.area - area) : Number.POSITIVE_INFINITY);
  return [...benchmarks].sort((a, z) => distance(a) - distance(z)).slice(0, n);
}
