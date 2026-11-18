import { Item, ProposalTier, ProjectDiscount } from '../types';
import { resolveBoqLine } from './boqPricing';
import { gstOn, type GstTerms } from './paymentSchedule';
import { asScopeBucket, bucketForItem } from './scopeBuckets';

// ============================================================================
// Offers: what an option is made of, and what the studio gives away on it.
//
// The owner wanted to know an option's carpentry-only, civil-only and
// functional-only cost, so a discount or a complimentary item can be offered
// against one part of the job ("5% off the woodwork", "the false ceiling is on
// us") rather than as a blind cut to the total.
//
// An offer is stored as an ordinary project discount (financials.discounts):
// a FIXED amount off execution. Money, the proposal, the agreement and every
// issued document already apply those, unchanged. It also carries its `basis`
// -- the part and percent, or the lines given free, and the option it was
// priced on -- so Money & Offers can say when the BOQ has moved and the
// amount should be brought up to date.
// ============================================================================

export type ScopePart = 'carpentry' | 'functional' | 'civil' | 'others';

export const SCOPE_PARTS: { id: ScopePart; label: string; detail: string }[] = [
  { id: 'carpentry', label: 'Carpentry', detail: 'Wardrobes, kitchen, TV units, panelling: the woodwork' },
  { id: 'functional', label: 'Functional', detail: 'Painting, false ceiling, electrical and plumbing' },
  { id: 'civil', label: 'Civil', detail: 'Flooring, tiling, waterproofing and demolition' },
  { id: 'others', label: 'Others', detail: 'Decor, glass, loose items and site services' },
];

export const partLabel = (p: ScopePart) => SCOPE_PARTS.find((x) => x.id === p)?.label || p;

const CARPENTRY = /carpentry|woodwork|modular|kitchen|wardrobe|furniture|joinery/i;
const CEILING = /false ceiling|\bpop\b|gypsum ceiling|ceiling board|grid ceiling/i;
const CIVIL = /civil|tiling|tile|flooring|floor|waterproof|demolition|masonry|stone|marble|granite|plaster/i;

/** The trade a line is: the part of the job it belongs to, and what to call it inside that part. */
export interface Trade { part: ScopePart; trade: string }

/**
 * Which part of the job a BOQ line belongs to, from the item itself.
 *
 * The owner found the split disagreeing with the BOQ: it went by the scope
 * room a line was filed in first, and the generator files lines by a rule of
 * its own. POP false ceiling is a Civil item in the bank but filed under
 * Functional, so it showed as Civil in one view and Functional in another;
 * plumbing is filed under Functional in one place and Civil in another. The
 * item decides now, by the studio's own definitions (lib/scopeBuckets
 * SCOPE_BUCKET_META): painting, false ceiling, electrical and plumbing are
 * Functional; flooring, tiling, waterproofing and demolition are Civil; the
 * woodwork is Carpentry; the rest is Others. The room is only a fallback, for
 * a line whose item is not in the bank.
 */
export function tradeOfLine(room: string | undefined, item: Pick<Item, 'cat' | 'name'> | undefined): Trade {
  const cat = (item?.cat || '').trim();
  const name = item?.name || '';
  if (!item) {
    const bucket = asScopeBucket(room);
    return { part: bucket === 'Civil' ? 'civil' : bucket === 'Functional' ? 'functional' : 'others', trade: 'Other' };
  }
  if (CEILING.test(name) || /ceiling/i.test(cat)) return { part: 'functional', trade: 'False ceiling' };
  if (CARPENTRY.test(cat)) return { part: 'carpentry', trade: cat };
  if (/paint/i.test(cat)) return { part: 'functional', trade: 'Painting' };
  if (/electric|lighting/i.test(cat)) return { part: 'functional', trade: 'Electrical' };
  if (/plumb|sanitary/i.test(cat)) return { part: 'functional', trade: 'Plumbing' };
  if (/hvac|air.?con/i.test(cat)) return { part: 'functional', trade: 'HVAC' };
  if (/site service/i.test(cat) || /debris|protection|cleaning|disposal|scaffold/i.test(name)) return { part: 'others', trade: 'Site services' };
  if (CIVIL.test(cat)) return { part: 'civil', trade: cat };
  const named = asScopeBucket(cat);
  if (named) return { part: named === 'Civil' ? 'civil' : named === 'Functional' ? 'functional' : 'others', trade: cat };
  const b = bucketForItem(item);
  return { part: b === 'Civil' ? 'civil' : b === 'Functional' ? 'functional' : 'others', trade: cat || 'Other' };
}

/**
 * What a BOQ line is, as the BOQ Editor shows it: a category written on the
 * line itself wins over its bank item's. The name stays the bank's when there
 * is one (it is what names a false ceiling); a line with no bank item goes by
 * its own.
 *
 * The owner found "Where the money goes" not following BOQ edits. The editor
 * lets a line's category be changed (Design Category), and an imported sheet
 * writes its category onto lines that have no bank item; the split read only
 * the bank item, so a recategorised line stayed in its old part and an imported
 * one was filed by its room. Undefined when there is nothing to go by, so the
 * room decides (tradeOfLine).
 */
export function lineLook(line: any, item: Pick<Item, 'cat' | 'name'> | undefined): Pick<Item, 'cat' | 'name'> | undefined {
  const own = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const cat = own(line?.cat);
  if (!item && !cat) return undefined;
  return { cat: cat || item?.cat || '', name: item?.name || own(line?.name) };
}

/** The part alone (see tradeOfLine). */
export function partOfLine(room: string | undefined, item: Pick<Item, 'cat' | 'name'> | undefined): ScopePart {
  return tradeOfLine(room, item).part;
}

export interface SplitLine { key: string; name: string; room: string; trade: string; total: number; qty?: number; unit?: string }
export interface ScopeSplit {
  /** The option's work value: billable lines, as-actuals left out (lib/boqPricing boqTotal). */
  total: number;
  parts: Record<ScopePart, { value: number; lines: SplitLine[]; trades: { trade: string; value: number; lines: number }[] }>;
  /** Lines the client pays vendors for directly: shown, never in the price. */
  asActuals: number;
}

/** An option's work value, part by part and trade by trade, priced line for line as its summary is. */
export function scopeSplit(tier: Pick<ProposalTier, 'boq'> | undefined, bankMap: Map<string, Item>): ScopeSplit {
  const parts = Object.fromEntries(SCOPE_PARTS.map((p) => [p.id, { value: 0, lines: [] as SplitLine[], trades: [] as { trade: string; value: number; lines: number }[] }])) as ScopeSplit['parts'];
  let total = 0;
  let asActuals = 0;
  (tier?.boq || []).forEach((line: any, i: number) => {
    const priced = resolveBoqLine(line, bankMap);
    if (!priced.billable) return;
    if (priced.asActuals) { asActuals += priced.total; return; }
    const item = bankMap.get(line.bankId);
    const room = line.roomId || priced.room;
    let { part, trade } = tradeOfLine(room, lineLook(line, item));
    /* A line with no bank item whose category says nothing of its part keeps the part its room gives it. */
    if (!item && part === 'others') part = tradeOfLine(room, undefined).part;
    const key = String(line.id || `${priced.key}#${i}`);
    parts[part].value += priced.total;
    parts[part].lines.push({ key, name: priced.name, room: priced.room, trade, total: priced.total, qty: priced.qty, unit: priced.unit });
    total += priced.total;
  });
  SCOPE_PARTS.forEach((p) => {
    const part = parts[p.id];
    part.lines.sort((a, b) => b.total - a.total);
    const byTrade = new Map<string, { trade: string; value: number; lines: number }>();
    part.lines.forEach((l) => {
      const t = byTrade.get(l.trade) || { trade: l.trade, value: 0, lines: 0 };
      t.value += l.total; t.lines += 1;
      byTrade.set(l.trade, t);
    });
    part.trades = Array.from(byTrade.values()).sort((a, b) => b.value - a.value);
  });
  return { total, parts, asActuals };
}

/** How an offer was worked out, kept on its discount. */
export type OfferBasis =
  | { kind: 'part-percent'; part: ScopePart; percent: number; tierId: string }
  | { kind: 'complimentary'; part: ScopePart; lines: { key: string; name: string }[]; tierId: string };

export type OfferDiscount = ProjectDiscount & { basis?: OfferBasis };

/** What the offer is worth on this option's BOQ as it now stands. */
export function offerValue(basis: OfferBasis, split: ScopeSplit): number {
  const part = split.parts[basis.part];
  if (basis.kind === 'part-percent') return Math.round(part.value * (basis.percent / 100));
  const keys = new Set(basis.lines.map((l) => l.key));
  return Math.round(part.lines.filter((l) => keys.has(l.key)).reduce((s, l) => s + l.total, 0));
}

/** The name an offer goes by on the proposal, Money and the agreement. */
export function offerName(basis: OfferBasis): string {
  if (basis.kind === 'part-percent') return `${basis.percent}% off ${partLabel(basis.part).toLowerCase()}`;
  const names = basis.lines.map((l) => l.name);
  const shown = names.slice(0, 2).join(', ') + (names.length > 2 ? ` and ${names.length - 2} more` : '');
  return `Complimentary: ${shown}`;
}

/** The discount an offer is saved as: a fixed amount off execution, with its basis. */
export function offerDiscount(id: string, basis: OfferBasis, split: ScopeSplit): OfferDiscount {
  return { id, name: offerName(basis), type: 'fixed', target: 'execution', value: offerValue(basis, split), basis };
}

/**
 * An offer whose amount no longer matches the option it was priced on: the BOQ
 * changed since. Null when it is current, or when it was priced on another
 * option (then it is reported as such, not re-priced against this one).
 *
 * `sameOption` says whether two tiers are versions of one option
 * (lib/optionChains). An offer priced on v1 then follows the option: on v2 it
 * is always reported with v2's figure, so one Update moves it onto v2.
 */
export function staleOffer(d: OfferDiscount, tierId: string, split: ScopeSplit, sameOption?: (a: string, b: string) => boolean): number | null {
  if (!d.basis) return null;
  const now = offerValue(d.basis, split);
  if (d.basis.tierId !== tierId) return sameOption?.(d.basis.tierId, tierId) ? now : null;
  return now !== Math.round(d.value) ? now : null;
}

/** The offer brought up to date on this version: its amount, its name, and the version it is priced on. */
export function refreshedOffer(d: OfferDiscount, tierId: string, value: number): OfferDiscount {
  if (!d.basis) return { ...d, value };
  const basis = { ...d.basis, tierId } as OfferBasis;
  return { ...d, value, basis, name: offerName(basis) };
}

/** Sum of the discounts on one side, as Money applies them (lib/paymentSchedule). */
export function discountTotal(base: number, discounts: ProjectDiscount[], target: 'execution' | 'design'): number {
  return (discounts || [])
    .filter((d) => d.target === target)
    .reduce((s, d) => s + (d.type === 'percentage' ? base * (d.value / 100) : d.value), 0);
}

/** Gross margin on the work, as a percentage, before and after what comes off execution. */
export function marginWith(sell: number, cost: number, offOnExecution: number): { before: number | null; after: number | null } {
  const pct = (s: number) => (s > 0 ? ((s - cost) / s) * 100 : null);
  return { before: pct(sell), after: pct(Math.max(0, sell - offOnExecution)) };
}

/** What an option comes to with the project's offers: the figures Money & Offers and Pricing both show. */
export interface Deal {
  sell: number;
  fee: number;
  execOff: number;
  designOff: number;
  gst: number;
  clientPays: number;
  margin: { before: number | null; after: number | null };
}

export function dealFor(
  summary: { totalSell?: number; designFee?: number; totalCost?: number } | undefined,
  discounts: ProjectDiscount[],
  terms: GstTerms,
): Deal {
  const sell = summary?.totalSell || 0;
  const fee = summary?.designFee || 0;
  const execOff = discountTotal(sell, discounts, 'execution');
  const designOff = discountTotal(fee, discounts, 'design');
  const taxExec = Math.max(0, sell - execOff);
  const taxDesign = Math.max(0, fee - designOff);
  const g = gstOn(taxExec, taxDesign, terms);
  return {
    sell, fee, execOff, designOff,
    gst: g.execution + g.design,
    clientPays: taxExec + taxDesign + g.execution + g.design,
    margin: marginWith(sell, summary?.totalCost || 0, execOff),
  };
}

/** Billable lines priced under this margin (%): the one finding from the retired Health Check worth keeping. */
export function lowMarginLines(tier: Pick<ProposalTier, 'boq'> | undefined, bankMap: Map<string, Item>, under = 15): number {
  return (tier?.boq || []).filter((line: any) => {
    const priced = resolveBoqLine(line, bankMap);
    if (!priced.billable || priced.asActuals || priced.total <= 0) return false;
    const margin = line.marginOverride ?? bankMap.get(line.bankId)?.margin;
    return typeof margin === 'number' && margin < under;
  }).length;
}
