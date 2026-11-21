/*
  Which projects use a bank item.

  The Item bank asked this once per item by walking every BOQ line of every
  project: 320 items against a few thousand lines, again on every keystroke,
  because typing in any field makes a new bank. That walk was most of what made
  typing in the bank feel heavy. The lines are walked once here, when the
  projects change, into two lookups; an item is then two map reads.

  A line uses an item when it carries the item's id, or has its name (trimmed,
  any case). This is the rule the bank screens have always used.
*/

interface UsageLine { bankId?: string | null; name?: string | null }
interface UsageProject {
  id: string;
  tiers?: Array<{ boq?: UsageLine[] | null }> | null;
  canonical?: { boq?: { items?: UsageLine[] | null } | null } | null;
}

export interface BankUsageIndex {
  byId: Map<string, Set<string>>;
  byName: Map<string, Set<string>>;
}

const nameKey = (name: unknown) => String(name || '').trim().toLowerCase();

export function bankUsageIndex(projects: ReadonlyArray<UsageProject> | null | undefined): BankUsageIndex {
  const byId = new Map<string, Set<string>>();
  const byName = new Map<string, Set<string>>();
  const note = (map: Map<string, Set<string>>, key: string, projectId: string) => {
    if (!key) return;
    const set = map.get(key);
    if (set) set.add(projectId);
    else map.set(key, new Set([projectId]));
  };
  for (const proj of projects || []) {
    const line = (l: UsageLine | null | undefined) => {
      if (!l) return;
      if (l.bankId) note(byId, l.bankId, proj.id);
      if (l.name) note(byName, nameKey(l.name), proj.id);
    };
    for (const tier of proj.tiers || []) for (const l of tier?.boq || []) line(l);
    for (const l of proj.canonical?.boq?.items || []) line(l);
  }
  return { byId, byName };
}

const NONE: ReadonlySet<string> = new Set<string>();

/** The ids of the projects that use this item. */
export function projectsUsingItem(index: BankUsageIndex, item: { id: string; name?: string | null }): ReadonlySet<string> {
  const a = index.byId.get(item.id);
  const key = nameKey(item.name);
  const b = key ? index.byName.get(key) : undefined;
  if (!a) return b || NONE;
  if (!b) return a;
  const both = new Set(a);
  b.forEach((id) => both.add(id));
  return both;
}
