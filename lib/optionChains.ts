import { ProposalTier } from '../types';

// ============================================================================
// Options and their versions.
//
// `tiers` holds both the packages offered side by side (Essential, Comfort,
// Harmony) and the versions each one goes through: a copy made with "New
// version", a revision after design. A version points at the one it came from
// through `parentTierId`. Pricing & Tiers shows one column per OPTION -- the
// root of a chain -- and the versions as steps inside that column, so a
// client's change never turns into a fourth column.
//
// This is the grouping the old Options & Versions rail drew as a tree, so
// projects saved before keep the same shape: a copy that sat under its
// original there is a version of it here. "Make it its own option" detaches
// one that was really meant as a separate package.
// ============================================================================

export interface OptionChain {
  /** The option the chain starts from. */
  root: ProposalTier;
  /** Every version of it, oldest first: the root, then its copies and theirs. */
  versions: ProposalTier[];
}

const at = (t: ProposalTier) => t.timestamp || 0;

/** One chain per option, in the order the options were added. */
export function optionChains(tiers: ProposalTier[]): OptionChain[] {
  const list = (tiers || []).filter(Boolean);
  const ids = new Set(list.map((t) => t.id));
  // A copy whose original was deleted before copies were re-attached is an option of its own.
  const roots = list.filter((t) => !t.parentTierId || !ids.has(t.parentTierId));
  const seen = new Set<string>();
  return roots.map((root) => {
    const versions: ProposalTier[] = [];
    const walk = (t: ProposalTier) => {
      if (seen.has(t.id)) return;
      seen.add(t.id);
      versions.push(t);
      list.filter((c) => c.parentTierId === t.id).forEach(walk);
    };
    walk(root);
    versions.sort((a, b) => at(a) - at(b) || (a === root ? -1 : b === root ? 1 : 0));
    return { root, versions };
  });
}

/** The chain a version belongs to. */
export function chainOf(chains: OptionChain[], tierId: string | null | undefined): OptionChain | undefined {
  return tierId ? chains.find((c) => c.versions.some((v) => v.id === tierId)) : undefined;
}

/** The newest version: the one being worked on, and the one the proposal will carry. */
export const latestOf = (chain: OptionChain): ProposalTier => chain.versions[chain.versions.length - 1];

/** "v2": a version's place in its chain. */
export function versionNo(chain: OptionChain, tierId: string): number {
  return chain.versions.findIndex((v) => v.id === tierId) + 1;
}

/** The version a column shows: the one picked in it, else the newest. */
export function shownVersion(chain: OptionChain, picked?: string | null): ProposalTier {
  return (picked && chain.versions.find((v) => v.id === picked)) || latestOf(chain);
}

/** The version this one was made from, when it is in the same chain. */
export function previousVersion(chain: OptionChain, tier: ProposalTier): ProposalTier | undefined {
  if (!tier.parentTierId) return undefined;
  return chain.versions.find((v) => v.id === tier.parentTierId);
}

/** True when two tiers are versions of the same option. */
export function sameOption(chains: OptionChain[], a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const c = chainOf(chains, a);
  return !!c && c.versions.some((v) => v.id === b);
}
