/**
 * The client's budget, and fitting an option to it.
 *
 * The budget is one number on the project (`clientBudget`), compared with what
 * an option is quoted at (work and design fee, before GST: lib/tierComparison
 * optionPrice). Pricing & Tiers says by how much each option is over or under
 * it and marks the one that fits it best.
 *
 * An option over the budget is brought down by taking out extras, never by
 * touching its must-haves: the designer ticks which, with the amount each
 * frees and the gap that remains, and the result is a new version, so the
 * option as it was is kept. What is left after the extras is for Tune's
 * markups, down to the studio's floors, and is said, not hidden.
 *
 * An extra is a line the studio's Standard template marks for fewer than all
 * three options (lib/templateOptions), one of the items a higher option adds
 * by the built-in rule, a false ceiling, or a line marked optional.
 *
 * Pure.
 */
import type { BoqItem, Item, ProposalTier, Room } from '../types';
import { resolveBoqLine } from './boqPricing';
import { lineAmount, docPricingOf } from './playground/pricing';
import { BUILT_IN_EXTRAS, resolveActiveTemplate, type TemplateData } from './standardPackages';
import { optionMarks } from './templateOptions';
import { GRADES } from './materialSpecs';

export interface BudgetGap {
  /** Rupees over the budget; negative when under. */
  over: number;
  /** Over, as a share of the budget. */
  share: number;
}

/** An option's price against the budget, or null when there is no budget or no price. */
export function budgetGap(total: number, budget: number | null | undefined): BudgetGap | null {
  const b = Number(budget) || 0;
  if (!(b > 0) || !(total > 0)) return null;
  return { over: Math.round(total - b), share: (total - b) / b };
}

/** The option that fits the budget best: the dearest one within it. None when every option is over. */
export function bestFit<T extends { id: string; total: number }>(options: T[], budget: number | null | undefined): string | null {
  const b = Number(budget) || 0;
  if (!(b > 0)) return null;
  const within = options.filter(o => o.total > 0 && o.total <= b).sort((a, z) => z.total - a.total);
  return within[0]?.id || null;
}

export interface ExtraLine {
  id: string;
  name: string;
  room: string;
  /** What the client pays for the line. */
  amount: number;
}

const FALSE_CEILING = /false\s*ceiling|pop\s*ceiling|gypsum\s*ceiling/i;

/** The option's lines that can come out to meet a budget, dearest first. */
export function extrasOf(
  tier: Pick<ProposalTier, 'boq' | 'pricingRules'>,
  args: { bankMap: Map<string, Item>; rooms?: Room[]; templates?: TemplateData | null; config?: string | null },
): ExtraLine[] {
  const { bankMap } = args;
  const marked = new Set<string>();
  if (args.templates) {
    const { activeTemplate } = resolveActiveTemplate(args.templates, args.config || '');
    optionMarks(activeTemplate).forEach((grades, key) => { if (grades.length < GRADES.length) marked.add(key.slice(key.indexOf('|') + 1)); });
  }
  const pricing = docPricingOf(tier, args.rooms, bankMap) || {};
  const out: ExtraLine[] = [];
  (tier.boq || []).forEach((line: BoqItem) => {
    const r = resolveBoqLine(line, bankMap);
    if (!r.billable || r.asActuals) return;
    const item = bankMap.get(line.bankId);
    const name = item?.name || (line as any).name || 'Item';
    const extra = !!line.optional || marked.has(line.bankId) || BUILT_IN_EXTRAS.has(line.bankId) || FALSE_CEILING.test(name);
    if (!extra) return;
    const amount = Math.round(lineAmount(line, bankMap, pricing));
    if (amount > 0) out.push({ id: String(line.id), name, room: line.roomId || '', amount });
  });
  return out.sort((a, z) => z.amount - a.amount);
}

export interface FitResult {
  /** What taking the ticked extras out takes off the price, design fee included. */
  freed: number;
  /** The option's price without them. */
  total: number;
  /** Still over the budget by this much; 0 when it fits. */
  remaining: number;
}

/** The design fee on a value of work; none when the project charges none. */
export type FeeOn = (work: number) => number;
const NO_FEE: FeeOn = () => 0;

/**
 * The option's price with these extras taken out, against the budget. `work` is
 * the option's work; a percentage design fee comes down with it, so `fee` gives
 * the fee on what is left.
 */
export function fitWithout(work: number, budget: number, extras: ExtraLine[], out: Iterable<string>, fee: FeeOn = NO_FEE): FitResult {
  const ids = new Set(out);
  const left = work - extras.filter(e => ids.has(e.id)).reduce((a, e) => a + e.amount, 0);
  const before = work + fee(work);
  const total = Math.round(left + fee(left));
  return { freed: Math.round(before - total), total, remaining: Math.max(0, Math.round(total - budget)) };
}

/** The fewest extras, dearest first, that bring the option within the budget; all of them when that is not enough. */
export function suggestedOut(work: number, budget: number, extras: ExtraLine[], fee: FeeOn = NO_FEE): string[] {
  const out: string[] = [];
  for (const e of extras) {
    if (fitWithout(work, budget, extras, out, fee).remaining <= 0) break;
    out.push(e.id);
  }
  return out;
}
