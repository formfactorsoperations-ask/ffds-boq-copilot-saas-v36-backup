import { Item, ProposalTier, ProjectDiscount } from '../types';
import { resolveBoqLine } from './boqPricing';
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
  { id: 'functional', label: 'Functional', detail: 'Painting, false ceiling, electrical' },
  { id: 'civil', label: 'Civil', detail: 'Civil, demolition, tiling and plumbing' },
  { id: 'others', label: 'Others', detail: 'Decor, glass, loose items and site services' },
];

export const partLabel = (p: ScopePart) => SCOPE_PARTS.find((x) => x.id === p)?.label || p;

const CARPENTRY = /carpentry|woodwork|modular|kitchen|wardrobe|furniture|joinery/i;

/**
 * Which part of the job a BOQ line belongs to.
 *
 * The BOQ's own scope rooms come first: a line in Civil or Functional is that,
 * whatever its category. Otherwise woodwork is Carpentry, and the rest follows
 * the studio's scope classifier (lib/scopeBuckets bucketForItem), so this split
 * agrees with the Civil and Functional groups the BOQ already shows.
 */
export function partOfLine(room: string | undefined, item: Pick<Item, 'cat' | 'name'> | undefined): ScopePart {
  const bucket = asScopeBucket(room);
  if (bucket === 'Civil') return 'civil';
  if (bucket === 'Functional') return 'functional';
  if (CARPENTRY.test(item?.cat || '')) return 'carpentry';
  const b = bucketForItem(item);
  return b === 'Civil' ? 'civil' : b === 'Functional' ? 'functional' : 'others';
}

export interface SplitLine { key: string; name: string; room: string; total: number }
export interface ScopeSplit {
  /** The option's work value: billable lines, as-actuals left out (lib/boqPricing boqTotal). */
  total: number;
  parts: Record<ScopePart, { value: number; lines: SplitLine[] }>;
}

/** An option's work value, part by part, priced line for line as its summary is. */
export function scopeSplit(tier: Pick<ProposalTier, 'boq'> | undefined, bankMap: Map<string, Item>): ScopeSplit {
  const parts = Object.fromEntries(SCOPE_PARTS.map((p) => [p.id, { value: 0, lines: [] as SplitLine[] }])) as ScopeSplit['parts'];
  let total = 0;
  (tier?.boq || []).forEach((line: any, i: number) => {
    const priced = resolveBoqLine(line, bankMap);
    if (!priced.billable || priced.asActuals) return;
    const part = partOfLine(line.roomId || priced.room, bankMap.get(line.bankId));
    const key = String(line.id || `${priced.key}#${i}`);
    parts[part].value += priced.total;
    parts[part].lines.push({ key, name: priced.name, room: priced.room, total: priced.total });
    total += priced.total;
  });
  SCOPE_PARTS.forEach((p) => parts[p.id].lines.sort((a, b) => b.total - a.total));
  return { total, parts };
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
 */
export function staleOffer(d: OfferDiscount, tierId: string, split: ScopeSplit): number | null {
  if (!d.basis || d.basis.tierId !== tierId) return null;
  const now = offerValue(d.basis, split);
  return now !== Math.round(d.value) ? now : null;
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
