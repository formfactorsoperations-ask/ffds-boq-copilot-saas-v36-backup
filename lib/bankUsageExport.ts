import { Item, FullProjectData } from '../types';
import { boqTotal, buildBankMap, resolveBoqLine } from './boqPricing';

/**
 * ITEM BANK USAGE EXPORT — which project line uses which bank item, at what price.
 *
 * The bank holds several copies of one item ("KING SIZE BED WITH STORAGE" four
 * times, each at its own rate). Before any copy is merged or hidden, the studio
 * has to know which projects point at it and what each line is actually priced
 * at. This builds that picture from the bank and the projects already loaded.
 *
 * It only reads. It carries the project's name, status and dates, and each
 * line's item, quantity and rate fields; it leaves out the client's name, phone,
 * address, documents and everything else in the project.
 *
 * Every line is priced through `resolveBoqLine`, the same reading the BOQ
 * screens use, so the totals here are the "before" figures any later change to
 * the bank can be checked against.
 */

export const BANK_USAGE_KIND = 'ffds-bank-usage';
export const BANK_USAGE_VERSION = 1;

export interface UsageLine {
  id: string;
  bankId: string | null;
  /** Where the item was found: the project's own items win over the bank, as they do when pricing. */
  source: 'own' | 'bank' | 'none';
  name: string;
  unit: string | null;
  qty: number;
  /** Sell rate per unit and rate × qty, as the BOQ shows them. */
  rate: number;
  total: number;
  billable: boolean;
  asActuals: boolean;
  status: string | null;
  /** What the line itself holds. null: not set, so the figure follows the item. */
  baseRate: number | null;
  labor: number | null;
  marginOverride: number | null;
  materials: number | null;
  selectedRate: number | null;
  ownName: string | null;
  rateSnapshotAt: number | null;
  /** The figures that still follow the item rather than the line. Empty: the line is fixed. */
  follows: Array<'materials' | 'labor' | 'margin'>;
}

export interface UsageTier {
  id: string;
  name: string;
  timestamp: number | null;
  lifecycleTag: string | null;
  approvedAt: number | null;
  parentTierId: string | null;
  boqFormat: string | null;
  /** The scope value FFDS invoices: billable lines, as-actuals left out. */
  total: number;
  lines: UsageLine[];
}

export interface UsageProject {
  id: string;
  name: string;
  status: string | null;
  lastModified: number | null;
  activeTierId: string | null;
  /** The option being executed, and how that execution stands. */
  executionTierId: string | null;
  executionStatus: string | null;
  /** The project's own items (adHocItems). A line whose item is here does not read the bank. */
  ownItems: Item[];
  tiers: UsageTier[];
  /** The approved baseline, when the project has one. */
  baseline: { version: number | null; approvedAt: number | null; lines: Array<{ bankId: string | null; name: string; unit: string | null; qty: number; materials: number | null; labor: number | null; margin: number | null }> } | null;
  /** Bank ids found anywhere else in the project (revisions, kits…), so no reference is missed. */
  otherRefs: Array<{ path: string; bankId: string }>;
}

export interface BankUsageExport {
  kind: typeof BANK_USAGE_KIND;
  version: number;
  exportedAt: number;
  studio: string;
  /** True when the bank shown was the draft bank, not the live one. */
  draftBank: boolean;
  bank: Item[];
  projects: UsageProject[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const stamp = (v: any): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  if (v && typeof v.seconds === 'number') return v.seconds * 1000;
  return null;
};

/** One line, as it is priced today and what it carries of its own. */
export function usageLine(b: any, bankMap: Map<string, Item>, own: Set<string>): UsageLine {
  const r = resolveBoqLine(b, bankMap);
  const bankId = str(b?.bankId);
  const found = bankId ? bankMap.has(bankId) : false;
  const follows: UsageLine['follows'] = [];
  if (found) {
    if (b.baseRate === undefined) follows.push('materials');
    if (b.labor === undefined) follows.push('labor');
    if (b.marginOverride === undefined || b.marginOverride === null) follows.push('margin');
  }
  return {
    id: String(b?.id ?? ''),
    bankId,
    source: !found ? 'none' : own.has(bankId as string) ? 'own' : 'bank',
    name: r.name,
    unit: r.unit ?? null,
    qty: r.qty,
    rate: r.rate,
    total: r.total,
    billable: r.billable,
    asActuals: r.asActuals,
    status: str(b?.boqStatus),
    baseRate: num(b?.baseRate),
    labor: num(b?.labor),
    marginOverride: num(b?.marginOverride),
    materials: num(b?.materials),
    selectedRate: num(b?.selectedRate),
    ownName: str(b?.name),
    rateSnapshotAt: stamp(b?.rateSnapshotAt),
    follows,
  };
}

const MAX_OTHER_REFS = 2000;

/** Every `bankId` in the project outside its options and baseline, with where it sits. */
function otherRefs(project: any): UsageProject['otherRefs'] {
  const out: UsageProject['otherRefs'] = [];
  const seen = new Set<string>();
  const walk = (node: any, path: string, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 12 || out.length >= MAX_OTHER_REFS) return;
    if (Array.isArray(node)) { node.forEach(n => walk(n, `${path}[]`, depth + 1)); return; }
    const id = str((node as any).bankId);
    if (id) {
      const key = `${path}|${id}`;
      if (!seen.has(key)) { seen.add(key); out.push({ path, bankId: id }); }
    }
    Object.keys(node).forEach(k => walk((node as any)[k], path ? `${path}.${k}` : k, depth + 1));
  };
  Object.keys(project || {}).forEach(k => {
    if (k === 'tiers') return;
    if (k === 'canonical') { Object.keys(project.canonical || {}).forEach(c => { if (c !== 'boq') walk(project.canonical[c], `canonical.${c}`, 0); }); return; }
    walk(project[k], k, 0);
  });
  return out;
}

/*
  The three figures are carried exactly as stored. Some items hold a list where
  a number belongs ([1440]); turning those into numbers here once hid them from
  a check that then promised more than the app could do.
*/
const cleanItem = (i: any): Item => ({
  id: String(i?.id ?? ''),
  name: String(i?.name ?? ''),
  cat: String(i?.cat ?? ''),
  specs: String(i?.specs ?? ''),
  unit: String(i?.unit ?? ''),
  materials: i?.materials ?? 0,
  labor: i?.labor ?? 0,
  margin: i?.margin ?? 0,
});

export function usageProject(project: FullProjectData, bank: Item[]): UsageProject {
  const ctx: any = project.context || {};
  const ownItems: Item[] = Array.isArray(ctx.adHocItems) ? ctx.adHocItems.filter((i: any) => i && i.id).map(cleanItem) : [];
  const own = new Set(ownItems.map(i => i.id));
  const bankMap = buildBankMap(bank, Array.isArray(ctx.adHocItems) ? ctx.adHocItems : []);
  const tiers: UsageTier[] = (Array.isArray(project.tiers) ? project.tiers : []).map((t: any) => {
    const boq = Array.isArray(t?.boq) ? t.boq : [];
    return {
      id: String(t?.id ?? ''),
      name: String(t?.name ?? ''),
      timestamp: stamp(t?.timestamp),
      lifecycleTag: str(t?.lifecycleTag),
      approvedAt: stamp(t?.approval?.at),
      parentTierId: str(t?.parentTierId),
      boqFormat: str(t?.boqFormat),
      total: boqTotal(boq, bankMap),
      lines: boq.map((b: any) => usageLine(b, bankMap, own)),
    };
  });
  const base: any = project.canonical?.boq;
  return {
    id: String(project.id ?? ''),
    name: String(ctx.name ?? ''),
    status: str(ctx.status),
    lastModified: stamp(project.lastModified),
    activeTierId: str(project.activeTierId),
    executionTierId: str(project.activeProject?.tierId),
    executionStatus: str(project.activeProject?.status),
    ownItems,
    tiers,
    baseline: base && Array.isArray(base.items) ? {
      version: num(base.version),
      approvedAt: stamp(base.approvedAt),
      lines: base.items.map((c: any) => ({
        bankId: str(c?.bankId), name: String(c?.name ?? ''), unit: str(c?.unit), qty: Number(c?.qty) || 0,
        materials: num(c?.materials), labor: num(c?.labor), margin: num(c?.margin),
      })),
    } : null,
    otherRefs: otherRefs(project),
  };
}

export function buildBankUsageExport(bank: Item[], projects: FullProjectData[], meta: { studio?: string; draftBank?: boolean; at?: number } = {}): BankUsageExport {
  return {
    kind: BANK_USAGE_KIND,
    version: BANK_USAGE_VERSION,
    exportedAt: meta.at ?? Date.now(),
    studio: meta.studio || 'Studio',
    draftBank: !!meta.draftBank,
    bank: bank || [],
    projects: (projects || []).filter(p => p && p.id).map(p => usageProject(p, bank || [])),
  };
}

export function bankUsageFileName(studio: string, at = Date.now()): string {
  return `${(studio || 'Studio').replace(/\s+/g, '_')}_Item_Bank_Usage_${new Date(at).toISOString().split('T')[0]}.json`;
}
