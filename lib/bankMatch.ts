import { Item } from '../types';
import { normName } from './bankSpecs';
import { normaliseUnit } from './detailedBoq';

/**
 * ONE ITEM PER NAME — how the Item Bank is matched, and how a copy is kept out of sight.
 *
 * The bank grew several copies of one item ("KING SIZE BED WITH STORAGE" four
 * times): every import and every revision that met an item it already had
 * added it again, to hold that project's price. A price belongs on the
 * project's line. The item is the thing itself, and there is one of it.
 *
 * Two items are the same thing when their names read the same (capitals, dots
 * and punctuation aside) AND they are measured the same way. "TILES (AS
 * ACTUALS)" per sq ft and as a lump sum are two items, on purpose.
 *
 * A copy is not deleted: lines in old projects point at it, and the client's
 * BOQ looks it up in the bank. It is marked `mergedInto` the item it copies
 * and left out of the bank list, the pickers and matching (`pickable`).
 */

/** How a name reads: "T.V. Unit (Drawer)" and "TV UNIT(DRAWER)" are one. */
export const bankNameKey = (name: unknown): string => normName(name);

const unitKey = (unit: unknown): string => normaliseUnit(unit);

/** What makes two items the same thing: name and unit. */
export const sameThingKey = (item: { name?: unknown; unit?: unknown } | null | undefined): string =>
  `${bankNameKey(item?.name)}|${unitKey(item?.unit)}`;

export const isMergedCopy = (item: Item | null | undefined): boolean => !!item && typeof (item as any).mergedInto === 'string' && !!(item as any).mergedInto;

/** The items new work is made from: every named item that is not a copy of another. */
export function pickable(bank: Item[] | null | undefined): Item[] {
  return (bank || []).filter(i => i && i.id && !isMergedCopy(i) && bankNameKey(i.name));
}

/**
 * Of the pickable items that are the same thing, the one to use. The bank may
 * still hold several until the studio has settled them: the studio's own item
 * comes before one a project made, and the bank's order settles the rest.
 */
export function canonicalOf(copies: Item[]): Item | null {
  const rank = (i: Item) => (/^ADHOC_/i.test(String(i.id)) ? 1 : 0);
  return copies.reduce<Item | null>((best, i) => (!best || rank(i) < rank(best) ? i : best), null);
}

/** The item in the bank that `item` is the same thing as, if there is one that is not `item` itself. */
export function masterFor(item: { id?: string; name?: unknown; unit?: unknown }, bank: Item[] | null | undefined): Item | null {
  const key = sameThingKey(item);
  if (!bankNameKey(item?.name)) return null;
  return canonicalOf(pickable(bank).filter(i => i.id !== item.id && sameThingKey(i) === key));
}

/**
 * Add items to the bank the one safe way. An id the bank already holds is left
 * as it is. An item that is the same thing as one in the bank goes in marked
 * as its copy, so it resolves wherever a line points at it but never shows as
 * a second item. Items in one batch that are the same thing: the first is the
 * item, the rest its copies.
 */
export function addToBank(bank: Item[], items: Item[], where: 'start' | 'end' = 'end'): Item[] {
  const have = new Set((bank || []).map(i => i.id));
  const fresh: Item[] = [];
  (items || []).forEach(raw => {
    if (!raw || !raw.id || have.has(raw.id)) return;
    have.add(raw.id);
    const master = isMergedCopy(raw) ? null : masterFor(raw, [...(bank || []), ...fresh]);
    fresh.push(master ? { ...raw, mergedInto: master.id } : raw);
  });
  if (!fresh.length) return bank;
  return where === 'start' ? [...fresh, ...(bank || [])] : [...(bank || []), ...fresh];
}

/**
 * Revision Studio's "Approve & Sync" items, into the bank.
 *
 * It makes an item for each added or replaced line to carry the revised rate
 * (split 70/30, at no margin) and used to write each over whatever the bank
 * held under that id. An item the bank holds is now refreshed only when it is a
 * revision's own (its id begins ADHOC_): a standard item keeps its rate, and
 * the project prices from its own copy as it always did. A new one goes in
 * through addToBank, as a copy when the bank has that item by name.
 */
export function syncRevisionItems(bank: Item[], items: Item[]): Item[] {
  const byId = new Map((items || []).filter(i => i && i.id).map(i => [i.id, i]));
  if (!byId.size) return bank;
  let changed = false;
  const refreshed = (bank || []).map(i => {
    const next = byId.get(i.id);
    if (!next || !/^ADHOC_/.test(String(i.id))) return i;
    changed = true;
    return { ...i, ...next };
  });
  return addToBank(changed ? refreshed : bank, [...byId.values()]);
}

/* ───────────────────────────── matching a typed or imported name ───────────────────────────── */

/* Two-letter words stay: "SS" and "TV" are what tell two items apart. */
const STOP = new Set(['the', 'and', 'with', 'for', 'over', 'from', 'nos', 'feet', 'inch', 'per', 'all', 'of', 'in', 'on', 'at', 'to', 'by', 'ft']);
/** A size written into a name ("Pooja unit 3 x 4 ft") is not part of what the item is. */
const withoutSize = (name: string) => name.replace(/,?\s*\(?\d+(?:\.\d+)?\s*(?:'|ft|feet)?\s*(?:x|×|\*|by)\s*\d+(?:\.\d+)?\s*(?:'|ft|feet)?\)?/i, ' ');
const words = (name: unknown): string[] => bankNameKey(withoutSize(String(name ?? ''))).split(' ').filter(w => w.length > 1 && !STOP.has(w));

export interface BankMatch {
  /** exact: the same name (and unit, when one was given). close: near enough to offer. none: nothing like it. */
  kind: 'exact' | 'close' | 'none';
  /** The item to use, or to offer first. Null when `kind` is none. */
  item: Item | null;
  /** Every item worth offering, best first, `item` included. */
  candidates: Item[];
}

/**
 * The bank item a name means.
 *
 * Exact is the name read the same way; with a unit given, the unit must agree
 * too, or it is only close (the same words measured differently is a question
 * for a person). Close is most of the words shared (three in five of all the
 * words in either name), with no other item just as near. Only pickable items
 * are matched, one per name.
 */
export function matchBank(name: unknown, bank: Item[] | null | undefined, opts: { unit?: unknown; max?: number } = {}): BankMatch {
  const key = bankNameKey(name);
  const none: BankMatch = { kind: 'none', item: null, candidates: [] };
  if (!key) return none;
  const items = pickable(bank);
  const wantUnit = opts.unit !== undefined && opts.unit !== null && String(opts.unit).trim() ? unitKey(opts.unit) : null;

  const sameName = items.filter(i => bankNameKey(i.name) === key);
  const sameUnit = wantUnit ? sameName.filter(i => unitKey(i.unit) === wantUnit) : sameName;
  const exact = canonicalOf(sameUnit);

  const ws = new Set(words(name));
  const scored: Array<{ item: Item; score: number }> = [];
  const seen = new Set<string>();
  if (exact) seen.add(sameThingKey(exact));
  // Same name, another unit: offered first among the close ones.
  sameName.forEach(i => { if (!seen.has(sameThingKey(i))) { seen.add(sameThingKey(i)); scored.push({ item: i, score: 2 }); } });
  if (ws.size) {
    items.forEach(i => {
      const k = sameThingKey(i);
      if (seen.has(k)) return;
      const bw = words(i.name);
      if (!bw.length) return;
      const shared = bw.filter(w => ws.has(w)).length;
      if (!shared) return;
      const jaccard = shared / new Set([...bw, ...ws]).size;
      // "Sofa cum bed" holds every word of "Sofa" and is not a sofa: worth offering, never the match.
      const score = shared === bw.length ? Math.max(jaccard, 0.5) : jaccard;
      if (score < 0.34) return;
      seen.add(k);
      scored.push({ item: i, score });
    });
  }
  scored.sort((a, b) => b.score - a.score || String(a.item.name).length - String(b.item.name).length);
  const close = scored.slice(0, opts.max ?? 5);

  if (exact) return { kind: 'exact', item: exact, candidates: [exact, ...close.map(c => c.item)] };
  // One clear nearest item is offered as the match. Two equally near ("… (TANDEM)" and "… (SS)") are a choice for a person.
  const clear = close.length > 0 && close[0].score >= 0.6 && (close.length === 1 || close[1].score < close[0].score);
  if (clear) return { kind: 'close', item: close[0].item, candidates: close.map(c => c.item) };
  return { kind: 'none', item: null, candidates: close.map(c => c.item) };
}

/** Groups of pickable items that are the same thing, most copies first. For the bank's own review of what it holds. */
export function duplicateGroups(bank: Item[] | null | undefined): Item[][] {
  const groups = new Map<string, Item[]>();
  pickable(bank).forEach(i => { const k = sameThingKey(i); groups.set(k, [...(groups.get(k) || []), i]); });
  return [...groups.values()].filter(g => g.length > 1).sort((a, b) => b.length - a.length);
}
