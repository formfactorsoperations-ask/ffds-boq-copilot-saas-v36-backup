import { Item, ProposalTier } from '../types';
import { resolveBoqLine } from './boqPricing';

/**
 * What separates the options — as scope, not as a price list.
 *
 * Moved out of TierManager so it can be tested, and rebuilt on the one
 * pricing rule the app has (lib/boqPricing.ts). The first version priced each
 * line its own way: `selectedRate` ahead of the frozen cost, the bank's labour
 * instead of the line's, deleted and excluded lines summed in, and ad-hoc
 * items dropped. Its totals were then printed as the option's price beside a
 * sidebar and header that showed the tier summary — with the design fee — so
 * the same option read ₹7,78,086 in one place and ₹8,55,895 in another.
 *
 * `totals` here is the work value of each option, line for line what App's
 * tier summary calls `totalSell`. The screen adds the design fee to it from
 * the summary, so every figure on Pricing & Tiers reconciles.
 *
 * The model answers the question a client actually asks, in four parts:
 *
 *   coverage    what trades each option covers, and for how much
 *   only        items in some options and not others — the visible choice
 *   extent      the same item, a different amount of it
 *   spec        the same item and amount, built to a different grade
 *
 * Everything left over is identical everywhere and is stated as a count.
 */

export interface ComparisonCell { qty: number; value: number; rate: number }

export interface ComparisonRow {
  bankId: string;
  name: string;
  cat: string;
  unit: string;
  cells: Record<string, ComparisonCell>;
}

export interface CoverageRow {
  cat: string;
  cells: Record<string, { value: number; lines: number; share: number }>;
}

export interface TierComparison {
  all: ComparisonRow[];
  only: ComparisonRow[];
  extent: ComparisonRow[];
  spec: ComparisonRow[];
  same: ComparisonRow[];
  coverage: CoverageRow[];
  /** Work value per option: billable lines only, priced as the tier summary prices them. */
  totals: Record<string, number>;
  specLabel: Record<string, string>;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** `bankMap` must include the project's ad-hoc items (buildBankMap), or their lines drop out. */
export function compareTiers(tiers: ProposalTier[], bankMap: Map<string, Item>): TierComparison {
  const rows = new Map<string, ComparisonRow>();

  tiers.forEach(tier => {
    (tier.boq || []).forEach(line => {
      const priced = resolveBoqLine(line, bankMap);
      // Deleted, substituted, excluded and client-procured lines are not part
      // of what an option costs, so they are not part of how options differ.
      if (!priced.billable) return;
      const item = bankMap.get(line.bankId);
      const key = priced.key;
      if (!rows.has(key)) {
        rows.set(key, {
          bankId: line.bankId || key,
          name: priced.name,
          cat: item?.cat || (line as any).cat || 'Other',
          unit: priced.unit || '',
          cells: {},
        });
      }
      const row = rows.get(key)!;
      const cell = row.cells[tier.id] || { qty: 0, value: 0, rate: 0 };
      // The same item priced in three bedrooms is three BOQ lines and one row here.
      cell.qty += priced.qty;
      cell.value += priced.total;
      cell.rate = priced.rate;
      row.cells[tier.id] = cell;
    });
  });

  const all = Array.from(rows.values());
  const ids = tiers.map(t => t.id);

  const only: ComparisonRow[] = [];
  const extent: ComparisonRow[] = [];
  const spec: ComparisonRow[] = [];
  const same: ComparisonRow[] = [];

  all.forEach(r => {
    const cells = ids.map(id => r.cells[id]);
    if (cells.some(c => !c)) { only.push(r); return; }
    if (new Set(cells.map(c => round(c!.qty))).size > 1) { extent.push(r); return; }
    if (new Set(cells.map(c => Math.round(c!.rate))).size > 1) { spec.push(r); return; }
    same.push(r);
  });

  const byName = (a: ComparisonRow, z: ComparisonRow) => a.cat.localeCompare(z.cat) || a.name.localeCompare(z.name);
  [only, extent, spec, same].forEach(g => g.sort(byName));

  // Coverage: what each option spends per trade. The bar is share of that
  // option's own total, so a narrow bar means "a small part of this option",
  // not "less than the option beside it".
  const cats = Array.from(new Set(all.map(r => r.cat))).sort();
  const totals: Record<string, number> = {};
  ids.forEach(id => { totals[id] = all.reduce((sum, r) => sum + (r.cells[id]?.value || 0), 0); });

  const coverage = cats.map(cat => ({
    cat,
    cells: Object.fromEntries(ids.map(id => {
      const rowsIn = all.filter(r => r.cat === cat && r.cells[id]);
      const value = rowsIn.reduce((sum, r) => sum + r.cells[id]!.value, 0);
      return [id, { value, lines: rowsIn.length, share: totals[id] > 0 ? value / totals[id] : 0 }];
    })),
  })).filter(c => Object.values(c.cells).some(v => v.lines > 0));

  /* The tier's own specification, read back off the rationale its generator
     wrote — the studio never types this, and it is the sentence that explains
     why two identical items are priced differently. Lines added by hand carry
     a note about where they came from, not a spec, and are not counted. */
  const specLabel: Record<string, string> = {};
  tiers.forEach(t => {
    const counts = new Map<string, number>();
    (t.boq || []).forEach(l => {
      const head = (l.rationale || '').split(' · ')[0].trim();
      if (head && !/^(added (via|from)|imported)/i.test(head)) counts.set(head, (counts.get(head) || 0) + 1);
    });
    const best = Array.from(counts.entries()).sort((a, z) => z[1] - a[1])[0];
    specLabel[t.id] = best ? best[0] : '';
  });

  return { all, only, extent, spec, same, coverage, totals, specLabel };
}

/** The price an option is quoted at: the tier summary's, design fee included. */
export function optionPrice(tier: Pick<ProposalTier, 'summary'>): { work: number; designFee: number; total: number } {
  const s: any = tier.summary || {};
  const work = Number(s.totalSell) || 0;
  const designFee = Number(s.designFee) || 0;
  const total = Number(s.totalRevenue) || work + designFee;
  return { work, designFee, total };
}
