import { Item, FullProjectData } from '../types';
import { asActualsTotal, boqTotal, buildBankMap, resolveBoqLine } from './boqPricing';
import { isPlaygroundTier } from './playground/pricing';
import { playgroundTierSummary } from './playground/versions';
import { hasRole, type RoleSet } from './roles';

/**
 * PRICE LOCK — a project's lines keep their own price.
 *
 * A BOQ line holds a link to its Item Bank item and only some of its price.
 * Whatever it does not hold (materials, labour, margin) is read from the bank
 * every time the BOQ is drawn, so editing the bank re-prices projects that were
 * signed and built long ago. On 20 Nov 2026 not one line of the studio's five
 * completed projects held its whole price.
 *
 * Locking copies the figures a line borrows today onto the line, into the
 * fields every pricing path already reads first (`baseRate`, `labor`,
 * `marginOverride`). The line then prices from the same three numbers as
 * before, so its rate and the option's total cannot move.
 *
 * That claim is checked, not assumed: `planPriceLock` prices every option
 * before and after, and a project is only safe to save when every line rate,
 * every cost and every total is exactly the same.
 *
 * It follows `freezeBoqLines` (lib/detailedBoq.ts), with two differences: a
 * line whose item holds no figure the app can read is left alone and reported
 * (see `figure`), and what was added to each line is recorded so it can be undone.
 */

export const PRICE_LOCK_KIND = 'ffds-price-lock';
export const PRICE_LOCK_VERSION = 1;

/** Who may lock prices: it writes to every project it is pointed at. */
export const canLockPrices = (role?: RoleSet): boolean => hasRole(role, ['Super Admin', 'Owner']);

type Field = 'baseRate' | 'labor' | 'marginOverride';
const FIELDS: Field[] = ['baseRate', 'labor', 'marginOverride'];

export interface LockedLine {
  id: string;
  /** The figures written onto the line. */
  added: Partial<Record<Field, number>>;
  /** `rateSnapshotAt` was written too. */
  stamped?: number;
  /** The margin was stored as null (empty) before, not missing: the undo puts null back. */
  wasNull?: boolean;
}

export interface OptionCheck {
  tierId: string;
  tierName: string;
  lines: number;
  /** Lines that change, and the figures written or removed on them. */
  changed: number;
  fields: number;
  /** Lines left alone because the bank item's rate is not a number. */
  skipped: number;
  /** The scope value FFDS invoices, before and after. */
  before: number;
  after: number;
  /** Every line rate, every cost and every total is exactly the same. */
  same: boolean;
}

export interface LockPlan {
  projectId: string;
  name: string;
  status: string | null;
  options: OptionCheck[];
  changed: number;
  fields: number;
  skipped: number;
  /** True when every option is unchanged to the paisa. Only then may `project` be saved. */
  same: boolean;
  /** The project with the change applied. Identical to the input when `changed` is 0. */
  project: FullProjectData;
  /** What was added (lock) or removed (undo), option by option. */
  record: Array<{ tierId: string; lines: LockedLine[] }>;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A figure as the app reads it. Some items made by Revision Studio hold a list
 * where a number belongs: `[1440]` for materials, `[]` for labour. Pricing puts
 * every figure through Number(), which reads those as 1440 and 0, so that is
 * what a line was priced at and what locking writes. Anything else (a longer
 * list, text, nothing) has no figure: null.
 */
function figure(v: unknown): { n: number; exact: boolean } | null {
  if (isNum(v)) return { n: v, exact: true };
  if (Array.isArray(v) && v.length === 0) return { n: 0, exact: false };
  if (Array.isArray(v) && v.length === 1 && isNum(v[0])) return { n: v[0], exact: false };
  return null;
}

/** The item's three figures. `exact` is false when any of them was read out of a list. */
function ratesOf(item: Item | undefined): { materials: number; labor: number; margin: number; exact: boolean } | null {
  if (!item) return null;
  const m = figure((item as any).materials), l = figure((item as any).labor), g = figure((item as any).margin);
  return m && l && g ? { materials: m.n, labor: l.n, margin: g.n, exact: m.exact && l.exact && g.exact } : null;
}

/** What the studio sees for one line: its rate, total, cost and margin. */
function lineFingerprint(b: any, bankMap: Map<string, Item>): unknown[] {
  const r = resolveBoqLine(b, bankMap);
  const item = bankMap.get(b.bankId);
  // The cost, as App's tier summary adds it up.
  const cost = item
    ? ((b.baseRate !== undefined ? b.baseRate : item.materials) + (b.labor !== undefined ? b.labor : item.labor)) * b.qty
    : null;
  return [r.rate, r.total, String(cost), String(b.marginOverride ?? item?.margin ?? null)];
}

/** What the studio sees for an option: every line's rate, total and cost, and the option's totals. */
function fingerprint(tier: any, boq: any[], bankMap: Map<string, Item>, ctx: any): string {
  const lines = boq.map(b => lineFingerprint(b, bankMap));
  const playground = isPlaygroundTier(tier) ? playgroundTierSummary({ ...tier, boq }, bankMap, ctx) : null;
  return JSON.stringify({ lines, total: boqTotal(boq, bankMap), asActuals: asActualsTotal(boq, bankMap), playground });
}

function plan(
  project: FullProjectData,
  bank: Item[],
  change: (line: any, bankMap: Map<string, Item>, tierId: string) => { line: any; rec?: LockedLine; skipped?: boolean },
): LockPlan {
  const ctx: any = project.context || {};
  const bankMap = buildBankMap(bank || [], Array.isArray(ctx.adHocItems) ? ctx.adHocItems : []);
  const options: OptionCheck[] = [];
  const record: LockPlan['record'] = [];
  const tiers = (Array.isArray(project.tiers) ? project.tiers : []).map((tier: any) => {
    const boq: any[] = Array.isArray(tier?.boq) ? tier.boq : [];
    const recs: LockedLine[] = [];
    let skipped = 0;
    const next = boq.map(b => {
      const c = change(b, bankMap, String(tier?.id ?? ''));
      if (c.skipped) skipped++;
      if (c.rec) recs.push(c.rec);
      return c.line;
    });
    const before = fingerprint(tier, boq, bankMap, ctx);
    const after = recs.length ? fingerprint(tier, next, bankMap, ctx) : before;
    options.push({
      tierId: String(tier?.id ?? ''),
      tierName: String(tier?.name ?? ''),
      lines: boq.length,
      changed: recs.length,
      fields: recs.reduce((n, r) => n + Object.keys(r.added).length, 0),
      skipped,
      before: boqTotal(boq, bankMap),
      after: recs.length ? boqTotal(next, bankMap) : boqTotal(boq, bankMap),
      same: before === after,
    });
    if (recs.length) record.push({ tierId: String(tier?.id ?? ''), lines: recs });
    return recs.length ? { ...tier, boq: next } : tier;
  });
  const changed = options.reduce((n, o) => n + o.changed, 0);
  return {
    projectId: String(project.id ?? ''),
    name: String(ctx.name ?? '') || 'Untitled project',
    status: typeof ctx.status === 'string' ? ctx.status : null,
    options,
    changed,
    fields: options.reduce((n, o) => n + o.fields, 0),
    skipped: options.reduce((n, o) => n + o.skipped, 0),
    same: options.every(o => o.same),
    project: changed ? { ...project, tiers } : project,
    record,
  };
}

/**
 * Why a project must not be saved from this copy, or null when it is whole.
 * A copy that failed to load, a Designer's partial copy, or one whose options
 * still wait for their lines would overwrite real data with less of it.
 */
export function lockBlocker(project: FullProjectData | undefined | null): string | null {
  const p: any = project;
  if (!p || !p.id) return 'It could not be found.';
  if (p._failedHydration) return 'It could not be read, so it was left alone.';
  if (p._designView || p._teamView) return 'Only part of it is visible to this sign-in.';
  if ((Array.isArray(p.tiers) ? p.tiers : []).some((t: any) => t?.boqTrimmed === true)) return 'Some of its options could not be loaded in full.';
  return null;
}

/**
 * What locking would do to a project, with the before-and-after check done.
 * Nothing is saved here; the caller saves `plan.project` only when `plan.same`.
 */
export function planPriceLock(project: FullProjectData, bank: Item[], at = Date.now()): LockPlan {
  return plan(project, bank, (b, bankMap) => {
    const item = bankMap.get(b?.bankId);
    if (!item) return { line: b };
    const missing = FIELDS.filter(f => (f === 'marginOverride' ? b[f] === undefined || b[f] === null : b[f] === undefined));
    if (!missing.length) return { line: b };
    const rates = ratesOf(item);
    if (!rates) return { line: b, skipped: true };
    const from: Record<Field, number> = { baseRate: rates.materials, labor: rates.labor, marginOverride: rates.margin };
    const added: LockedLine['added'] = {};
    missing.forEach(f => { added[f] = from[f]; });
    const stamp = b.rateSnapshotAt ? undefined : at;
    const line = { ...b, ...added, ...(stamp !== undefined && { rateSnapshotAt: stamp }) };
    // A figure read out of a list: only if this line prices exactly as it did. Otherwise it is left as it is.
    if (!rates.exact && JSON.stringify(lineFingerprint(b, bankMap)) !== JSON.stringify(lineFingerprint(line, bankMap))) return { line: b, skipped: true };
    return {
      line,
      rec: { id: String(b.id ?? ''), added, ...(stamp !== undefined && { stamped: stamp }), ...(b.marginOverride === null && { wasNull: true }) },
    };
  });
}

/**
 * Take a lock back off: remove exactly what `record` says was added, and only
 * where the line still holds that same figure, so a price edited since is kept.
 * The same check applies: if the bank has moved since, the totals would move
 * with it and `same` is false.
 */
export function planPriceUnlock(project: FullProjectData, bank: Item[], record: LockPlan['record']): LockPlan {
  const byTier = new Map<string, Map<string, LockedLine>>(
    (record || []).map(t => [t.tierId, new Map((t.lines || []).map(l => [l.id, l]))]),
  );
  return plan(project, bank, (b, _bankMap, tierId) => {
    const rec = byTier.get(tierId)?.get(String(b?.id ?? ''));
    if (!rec) return { line: b };
    const removed: LockedLine['added'] = {};
    const line = { ...b };
    FIELDS.forEach(f => {
      if (rec.added?.[f] === undefined || b[f] !== rec.added[f]) return;
      removed[f] = rec.added[f];
      if (f === 'marginOverride' && rec.wasNull) line[f] = null; else delete line[f];
    });
    if (!Object.keys(removed).length) return { line: b };
    const stamped = rec.stamped !== undefined && b.rateSnapshotAt === rec.stamped && Object.keys(removed).length === Object.keys(rec.added || {}).length;
    if (stamped) delete line.rateSnapshotAt;
    return { line, rec: { id: rec.id, added: removed, ...(stamped && { stamped: rec.stamped }) } };
  });
}

export interface PriceLockFile {
  kind: typeof PRICE_LOCK_KIND;
  version: number;
  at: number;
  studio: string;
  projects: Array<{
    id: string;
    name: string;
    /** What was added to each line: the undo reads this. */
    record: LockPlan['record'];
    /** Every option's lines exactly as they were before the lock. */
    before: Array<{ tierId: string; tierName: string; total: number; boq: any[] }>;
  }>;
}

/** The file saved before a lock is written: what will be added, and the lines as they are now. */
export function buildPriceLockFile(plans: LockPlan[], originals: FullProjectData[], meta: { studio?: string; at?: number } = {}): PriceLockFile {
  const byId = new Map((originals || []).map(p => [String(p.id), p]));
  return {
    kind: PRICE_LOCK_KIND,
    version: PRICE_LOCK_VERSION,
    at: meta.at ?? Date.now(),
    studio: meta.studio || 'Studio',
    projects: plans.map(p => ({
      id: p.projectId,
      name: p.name,
      record: p.record,
      before: (byId.get(p.projectId)?.tiers || []).map((t: any) => ({
        tierId: String(t?.id ?? ''),
        tierName: String(t?.name ?? ''),
        total: p.options.find(o => o.tierId === String(t?.id ?? ''))?.before ?? 0,
        boq: Array.isArray(t?.boq) ? t.boq : [],
      })),
    })),
  };
}

/** A lock file read back, or null when the file is something else. */
export function readPriceLockFile(text: string): PriceLockFile | null {
  try {
    const f = JSON.parse(text);
    return f && f.kind === PRICE_LOCK_KIND && Array.isArray(f.projects) ? (f as PriceLockFile) : null;
  } catch {
    return null;
  }
}

export function priceLockFileName(studio: string, at = Date.now()): string {
  const d = new Date(at);
  const time = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `${(studio || 'Studio').replace(/\s+/g, '_')}_Price_Lock_${d.toISOString().split('T')[0]}_${time}.json`;
}

/**
 * After saving: is the stored project the one that was planned? Its lines hold
 * the planned figures and each option still totals what it did before.
 */
export function lockWasSaved(stored: FullProjectData | undefined, planned: LockPlan, bank: Item[]): boolean {
  if (!stored) return false;
  const bankMap = buildBankMap(bank || [], Array.isArray((stored.context as any)?.adHocItems) ? (stored.context as any).adHocItems : []);
  return planned.options.every(o => {
    const tier: any = (stored.tiers || []).find((t: any) => String(t?.id ?? '') === o.tierId);
    if (!tier) return false;
    const want: any = (planned.project.tiers || []).find((t: any) => String(t?.id ?? '') === o.tierId);
    const boq: any[] = Array.isArray(tier.boq) ? tier.boq : [];
    const wantBoq: any[] = Array.isArray(want?.boq) ? want.boq : [];
    if (boq.length !== wantBoq.length) return false;
    const linesMatch = wantBoq.every((w, i) => FIELDS.every(f => (boq[i]?.[f] ?? null) === (w?.[f] ?? null)));
    return linesMatch && boqTotal(boq, bankMap) === o.before;
  });
}
