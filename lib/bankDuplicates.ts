import { Item, FullProjectData } from '../types';
import { buildBankMap, resolveBoqLine } from './boqPricing';
import { calculateSellPrice } from './utils';
import { duplicateGroups, isMergedCopy, pickable, sameThingKey } from './bankMatch';

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
