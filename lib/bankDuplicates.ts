import { Item, FullProjectData } from '../types';
import { boqTotal, buildBankMap, resolveBoqLine } from './boqPricing';
import { calculateSellPrice } from './utils';
import { duplicateGroups, isMergedCopy, pickable, sameThingKey } from './bankMatch';
import { optionFingerprint } from './priceLock';

/**
 * SETTLING THE REPEATED ITEMS — one item kept per name, the rest hidden as its copies.
 *
 * lib/bankMatch.ts stops a second item of a name from coming in. This is for
 * the ones already there: 86 names held 136 extra copies on 20 Nov 2026. The
 * studio picks which one is the item; the others are marked `mergedInto` it.
 *
 * Nothing about any item's rate, name or unit is touched, and no copy is
 * deleted, so a line that points at a copy reads exactly what it read before.
 * The only thing that changes is what is offered: the bank list, the pickers
 * and import matching show the one item. A copy can be made an item again.
 */

export interface CopyUse {
  /** Projects and BOQ lines that point at this item by its id. */
  projects: number;
  lines: number;
  /** The most recent option that used it: when, at what sell rate, in which project. */
  lastAt: number | null;
  lastRate: number | null;
  lastProject: string | null;
  /** Whether that project was won (won, running or completed) rather than only quoted. A won one is preferred. */
  lastSold: boolean;
}

const NO_USE: CopyUse = { projects: 0, lines: 0, lastAt: null, lastRate: null, lastProject: null, lastSold: false };
const SOLD = new Set(['won', 'execution', 'work_paused', 'completed']);

/** Which bank items the studio's projects use, how much, and at what rate most recently. */
export function bankUse(bank: Item[], projects: FullProjectData[] | null | undefined): Map<string, CopyUse> {
  const out = new Map<string, CopyUse & { seen: Set<string> }>();
  (projects || []).forEach(p => {
    if (!p || !p.id) return;
    const ctx: any = p.context || {};
    const bankMap = buildBankMap(bank || [], Array.isArray(ctx.adHocItems) ? ctx.adHocItems : []);
    (Array.isArray(p.tiers) ? p.tiers : []).forEach((t: any) => {
      const at = Number(t?.timestamp) || Number(p.lastModified) || 0;
      (Array.isArray(t?.boq) ? t.boq : []).forEach((b: any) => {
        const id = typeof b?.bankId === 'string' ? b.bankId : '';
        if (!id || !bankMap.has(id)) return;
        const u = out.get(id) || { ...NO_USE, seen: new Set<string>() };
        u.lines++;
        u.seen.add(String(p.id));
        u.projects = u.seen.size;
        const rate = resolveBoqLine(b, bankMap).rate;
        const sold = SOLD.has(String(ctx.status || ''));
        // A rate a client agreed to says more than a later one that was only quoted.
        const newer = u.lastAt === null || (sold !== u.lastSold ? sold : at >= u.lastAt);
        if (rate > 0 && newer) { u.lastAt = at; u.lastRate = rate; u.lastProject = String(ctx.name || 'Untitled project'); u.lastSold = sold; }
        out.set(id, u);
      });
    });
  });
  return new Map([...out].map(([id, { seen: _seen, ...u }]) => [id, u]));
}

/** An item's sell rate as the bank shows it. A list where a number belongs is read as pricing reads it. */
export const bankSell = (i: Item): number => calculateSellPrice(Number(i.materials) || 0, Number(i.labor) || 0, Number(i.margin) || 0);

/** Where an item came from, as far as its id and words say. */
export function originOf(i: Item): string {
  const id = String(i.id || '');
  if (/^gen-/.test(id)) return 'Original';
  if (/^ADHOC_IMP_/.test(id)) return 'Revision Excel import';
  if (/^ADHOC_/.test(id)) return 'Revision Studio';
  if (String(i.specs || '').trim() === 'Imported via Excel') return 'Excel import';
  return 'Added in the bank';
}

/**
 * Of a name's copies, the one to keep as the item: the studio's original when
 * there is one, else the one projects use most, else the one with a
 * specification written, else the first in the bank.
 */
export function suggestMaster(copies: Item[], use: Map<string, CopyUse>): Item {
  const score = (i: Item) => {
    const u = use.get(i.id) || NO_USE;
    return [/^gen-/.test(String(i.id)) ? 1 : 0, u.projects, u.lines, String(i.specs || '').trim().length > 20 ? 1 : 0];
  };
  return copies.reduce((best, i) => {
    const a = score(i), b = score(best);
    for (let n = 0; n < a.length; n++) { if (a[n] !== b[n]) return a[n] > b[n] ? i : best; }
    return best;
  }, copies[0]);
}

export interface RepeatedGroup {
  key: string;
  name: string;
  unit: string;
  copies: Item[];
  suggested: Item;
  /** The lowest and highest sell rate among the copies. */
  low: number;
  high: number;
  /** The most recent rate any of them was used at, and where: in a project that was won, when there is one. */
  lastRate: number | null;
  lastProject: string | null;
  lastSold: boolean;
}

/** The names the bank holds more than once, most copies first, each with the item to keep suggested. */
export function repeatedGroups(bank: Item[], use: Map<string, CopyUse>): RepeatedGroup[] {
  return duplicateGroups(bank).map(copies => {
    const suggested = suggestMaster(copies, use);
    const rates = copies.map(bankSell);
    const last = copies.map(c => use.get(c.id)).filter((u): u is CopyUse => !!u && u.lastAt !== null)
      .sort((a, b) => Number(b.lastSold) - Number(a.lastSold) || (b.lastAt as number) - (a.lastAt as number))[0];
    return {
      key: sameThingKey(copies[0]), name: String(suggested.name), unit: String(suggested.unit || ''), copies, suggested,
      low: Math.min(...rates), high: Math.max(...rates), lastRate: last?.lastRate ?? null, lastProject: last?.lastProject ?? null, lastSold: !!last?.lastSold,
    };
  });
}

/**
 * Keep `masterId` as the item and mark `copyIds` as its copies. Anything that
 * was already a copy of one of them follows it to the new item. The bank comes
 * back unchanged when the choice makes no sense: an unknown item, one that is
 * itself a copy, or copies that are not the same thing as it.
 */
export function mergeCopies(bank: Item[], masterId: string, copyIds: string[]): Item[] {
  const master = (bank || []).find(i => i.id === masterId);
  if (!master || isMergedCopy(master)) return bank;
  const key = sameThingKey(master);
  const moving = new Set((bank || []).filter(i => copyIds.includes(i.id) && i.id !== masterId && !isMergedCopy(i) && sameThingKey(i) === key).map(i => i.id));
  if (!moving.size) return bank;
  return bank.map(i => (moving.has(i.id) || (isMergedCopy(i) && moving.has(String(i.mergedInto))) ? { ...i, mergedInto: masterId } : i));
}

/** Make a copy an item in its own right again. */
export function separateCopy(bank: Item[], id: string): Item[] {
  if (!(bank || []).some(i => i.id === id && isMergedCopy(i))) return bank;
  return bank.map(i => {
    if (i.id !== id) return i;
    const { mergedInto: _gone, ...rest } = i as any;
    return rest as Item;
  });
}

/** The items that have copies, with them. A copy whose item is gone is listed under no item (`master` null). */
export function settledGroups(bank: Item[]): Array<{ master: Item | null; copies: Item[] }> {
  const byId = new Map((bank || []).map(i => [i.id, i]));
  const groups = new Map<string, Item[]>();
  (bank || []).filter(isMergedCopy).forEach(c => { const k = String(c.mergedInto); groups.set(k, [...(groups.get(k) || []), c]); });
  return [...groups].map(([id, copies]) => ({ master: byId.get(id) || null, copies }))
    .sort((a, b) => String(a.master?.name || '').localeCompare(String(b.master?.name || '')));
}

/** How many items the bank offers, and how many copies it keeps out of sight. */
export const bankCounts = (bank: Item[]) => ({ items: pickable(bank).length, copies: (bank || []).filter(isMergedCopy).length });

/* ───────────────────────────── the rate the kept item carries ───────────────────────────── */

/* Labour takes up what whole-rupee materials leave, to four places, so the item sells at the rate asked and not a few paise off it. */
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const MAX_HISTORY = 20;

/**
 * The item, selling at `sell`.
 *
 * Its margin stays, and so does the split of its cost between materials and
 * labour: the cost is scaled to what that margin needs. (A copy made by a
 * revision carries a rate split 70/30 at no margin, which is no cost at all;
 * taking its figures would lose the item's real ones.) An item with no cost
 * yet is split 65/35. Figures stored as a list come out as numbers.
 *
 * What it held before is kept in `rateHistory`, exactly as stored, so the
 * change can be put back. A rate that is already the item's changes nothing.
 */
export function withStandardRate(item: Item, sell: number, at = Date.now()): Item {
  if (!(sell > 0) || !Number.isFinite(sell) || Math.round(bankSell(item)) === Math.round(sell)) return item;
  const m = Number(item.materials) || 0, l = Number(item.labor) || 0, g = Number(item.margin) || 0;
  const cost = sell / (1 + g / 100);
  const share = m + l > 0 ? m / (m + l) : 0.65;
  const materials = Math.min(Math.round(cost * share), Math.floor(cost));
  const history = Array.isArray(item.rateHistory) ? item.rateHistory : [];
  return {
    ...item,
    materials,
    labor: round4(cost - materials),
    margin: g,
    rateHistory: [...history, { at, materials: item.materials, labor: item.labor, margin: item.margin }].slice(-MAX_HISTORY),
  };
}

/** The sell rate the item had before its standard rate was last set, or null when it never was. */
export function previousRate(item: Item): number | null {
  const last = Array.isArray(item.rateHistory) ? item.rateHistory[item.rateHistory.length - 1] : null;
  return last ? calculateSellPrice(Number(last.materials) || 0, Number(last.labor) || 0, Number(last.margin) || 0) : null;
}

/** The item with the figures it held before its standard rate was last set, exactly as they were. */
export function withPreviousRate(item: Item): Item {
  const history = Array.isArray(item.rateHistory) ? item.rateHistory : [];
  const last = history[history.length - 1];
  if (!last) return item;
  const { rateHistory: _h, ...rest } = item as any;
  return { ...rest, materials: last.materials, labor: last.labor, margin: last.margin, ...(history.length > 1 && { rateHistory: history.slice(0, -1) }) } as Item;
}

export interface RateEffect { project: string; option: string; before: number; after: number }

/**
 * The options that would price differently if `next` replaced the item of the
 * same id in the bank: every line rate, cost and total is compared, as Lock
 * prices compares them. Empty means no project reads this item's rate any more,
 * so it is safe to change. A line that still follows the bank shows up here.
 */
export function rateEffects(bank: Item[], next: Item, projects: FullProjectData[] | null | undefined): RateEffect[] {
  const out: RateEffect[] = [];
  const nextBank = (bank || []).map(i => (i.id === next.id ? next : i));
  (projects || []).forEach(p => {
    if (!p || !p.id) return;
    const ctx: any = p.context || {};
    const own = Array.isArray(ctx.adHocItems) ? ctx.adHocItems : [];
    // The project's own copy of the item is the one it reads: the bank's does not reach it.
    if (own.some((i: any) => i?.id === next.id)) return;
    const tiers = (Array.isArray(p.tiers) ? p.tiers : []).filter((t: any) => Array.isArray(t?.boq) && t.boq.some((b: any) => b?.bankId === next.id));
    if (!tiers.length) return;
    const was = buildBankMap(bank || [], own), now = buildBankMap(nextBank, own);
    tiers.forEach((t: any) => {
      if (optionFingerprint(t, t.boq, was, ctx) === optionFingerprint(t, t.boq, now, ctx)) return;
      out.push({ project: String(ctx.name || 'Untitled project'), option: String(t.name || 'Option'), before: boqTotal(t.boq, was), after: boqTotal(t.boq, now) });
    });
  });
  return out;
}

/** The rates worth offering for a name: what its copies hold and what it was last sold at, without the kept item's own. */
export function rateChoices(kept: Item, copies: Item[], lastRate: number | null, lastSold: boolean): Array<{ rate: number; label: string }> {
  const own = Math.round(bankSell(kept));
  const seen = new Set<number>([own]);
  const out: Array<{ rate: number; label: string }> = [];
  const add = (rate: number | null, label: string) => {
    if (rate === null || !(rate > 0)) return;
    const r = Math.round(rate);
    if (seen.has(r)) return;
    seen.add(r);
    out.push({ rate: r, label });
  };
  add(lastRate, lastSold ? 'last sold' : 'last quoted');
  [...copies].filter(c => c.id !== kept.id).map(bankSell).sort((a, b) => b - a).forEach(r => add(r, 'a copy'));
  return out.slice(0, 4);
}
