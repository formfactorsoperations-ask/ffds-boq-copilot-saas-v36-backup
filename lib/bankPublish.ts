import { Item } from '../types';
import { addToBank } from './bankMatch';
import { bankSell } from './bankDuplicates';

/**
 * PUBLISH DRAFT TO LIVE — the draft's edits go into the live bank; the live
 * bank is not replaced by the draft.
 *
 * The button used to set the live bank to the draft, whole. A draft copied
 * before work was done on the live bank then undid that work: items made
 * since were dropped (and every project line pointing at one lost its name and
 * its price), copies hidden by Repeated items came back as second items, and
 * standard rates went back to what the draft still held.
 *
 * Publishing now merges:
 *
 * - An item in both takes the draft's details and figures. That is what the
 *   sandbox is for.
 * - An item only in the live bank stays. Publishing never deletes an item; an
 *   item is deleted in the live bank, on purpose.
 * - An item only in the draft is added the way everything is (`addToBank`): as
 *   a hidden copy when the bank already has that item by name and unit.
 * - Which items are hidden copies (`mergedInto`) and the record of a standard
 *   rate (`rateHistory`) are only ever set in the live bank, so the live bank's
 *   are kept whatever the draft says.
 * - A standard rate set in the live bank is kept when the draft still holds
 *   the figures the item had before it: the draft is older there, not edited.
 *
 * It reads; the caller saves `bank`.
 */

export interface PublishPlan {
  /** The live bank after publishing. */
  bank: Item[];
  /** Live items the draft changes, as they will be. */
  changed: Item[];
  /** Those of `changed` whose sell rate moves. */
  rates: Array<{ id: string; name: string; from: number; to: number }>;
  /** Draft items the live bank does not have, added as items. */
  added: Item[];
  /** Draft items the live bank does not have, added as hidden copies of an item it has. */
  addedAsCopies: Item[];
  /** Live items the draft does not have. They stay. */
  kept: Item[];
  /** Items whose hidden-copy label the draft disagreed with. The live bank's is kept. */
  labelsKept: Item[];
  /** Standard rates set in the live bank that the draft's older figures would have undone. */
  ratesKept: Item[];
  /** True when publishing would change nothing in the live bank. */
  nothing: boolean;
}

/* Compared whatever order the fields were written in: an item rebuilt with the same contents is the same item. */
const sorted = (v: any): any => Array.isArray(v) ? v.map(sorted)
  : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o: any, k) => { if (v[k] !== undefined) o[k] = sorted(v[k]); return o; }, {})
  : v;
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a ?? null)) === JSON.stringify(sorted(b ?? null));
const figures = (i: any) => ({ materials: i?.materials, labor: i?.labor, margin: i?.margin });
const label = (i: any): string | null => (typeof i?.mergedInto === 'string' && i.mergedInto ? i.mergedInto : null);
const history = (i: any): any[] => (Array.isArray(i?.rateHistory) ? i.rateHistory : []);

/** The draft's item with the two things only the live bank decides put back on it. */
function withLiveRecord(draft: Item, live: Item): Item {
  const { mergedInto: _m, rateHistory: _h, ...rest } = draft as any;
  return {
    ...rest,
    ...(label(live) && { mergedInto: label(live) }),
    ...(history(live).length > 0 && { rateHistory: (live as any).rateHistory }),
  } as Item;
}

export function planPublish(live: Item[] | null | undefined, draft: Item[] | null | undefined): PublishPlan {
  const liveItems = (live || []).filter(i => i && i.id);
  const draftItems = (draft || []).filter(i => i && i.id);
  const draftById = new Map(draftItems.map(i => [i.id, i]));
  const liveIds = new Set(liveItems.map(i => i.id));

  const changed: Item[] = [], kept: Item[] = [], labelsKept: Item[] = [], ratesKept: Item[] = [];
  const rates: PublishPlan['rates'] = [];

  // The live bank's own order is kept; a new item goes at the end.
  const merged = liveItems.map(l => {
    const d = draftById.get(l.id);
    if (!d) { kept.push(l); return l; }
    let next = withLiveRecord(d, l);
    if (label(d) !== label(l)) labelsKept.push(l);
    // The draft still holds what the item held before its standard rate was set: the draft is older, not edited.
    const stale = !same(figures(d), figures(l)) && history(l).some(h => same(figures(h), figures(d)));
    if (stale) { next = { ...next, ...figures(l) } as Item; ratesKept.push(l); }
    if (same(next, l)) return l;
    changed.push(next);
    const from = Math.round(bankSell(l)), to = Math.round(bankSell(next));
    if (from !== to) rates.push({ id: l.id, name: String(l.name ?? ''), from, to });
    return next;
  });

  // A hidden-copy label on an item new to the live bank is the draft's own guess: addToBank decides it afresh.
  const fresh = draftItems.filter(i => !liveIds.has(i.id)).map(i => {
    const { mergedInto: _m, rateHistory: _h, ...rest } = i as any;
    return rest as Item;
  });
  const bank = addToBank(merged, fresh);
  const arrived = bank.slice(merged.length);
  const added = arrived.filter(i => !label(i));
  const addedAsCopies = arrived.filter(i => !!label(i));

  return { bank, changed, rates, added, addedAsCopies, kept, labelsKept, ratesKept, nothing: !changed.length && !arrived.length };
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const SHOWN = 6;

export const NOTHING_TO_PUBLISH = 'The draft sandbox has nothing the live bank does not already have. Nothing was published.';

/** What publishing will do, in the owner's words, for the confirmation. */
export function publishQuestion(plan: PublishPlan): string {
  const lines: string[] = ['Publish the draft sandbox to the live Item Bank?', ''];
  if (plan.changed.length) {
    lines.push(`• ${count(plan.changed.length, 'item changes', 'items change')}${plan.rates.length ? `, ${plan.rates.length} in its rate:` : ' (details only, no rate).'}`);
    plan.rates.slice(0, SHOWN).forEach(r => lines.push(`     ${r.name}: ${inr(r.from)} → ${inr(r.to)}`));
    if (plan.rates.length > SHOWN) lines.push(`     and ${plan.rates.length - SHOWN} more`);
  }
  if (plan.added.length) lines.push(`• ${count(plan.added.length, 'new item is', 'new items are')} added.`);
  if (plan.addedAsCopies.length) lines.push(`• ${count(plan.addedAsCopies.length, 'new item goes', 'new items go')} in as a hidden copy, because the bank already has that item by name and unit.`);
  if (plan.kept.length) lines.push(`• ${count(plan.kept.length, 'item', 'items')} the draft does not have ${plan.kept.length === 1 ? 'stays' : 'stay'} in the live bank. Publishing never deletes an item.`);
  if (plan.ratesKept.length) lines.push(`• ${count(plan.ratesKept.length, 'standard rate', 'standard rates')} set in the live bank ${plan.ratesKept.length === 1 ? 'is' : 'are'} kept: the draft is older there.`);
  if (plan.labelsKept.length) lines.push(`• Repeated items stay as you settled them in the live bank (${count(plan.labelsKept.length, 'item', 'items')} the draft showed differently).`);
  lines.push('', 'Project lines that hold their own price are not affected. Lines that still follow the bank take the new rates.');
  return lines.join('\n');
}
