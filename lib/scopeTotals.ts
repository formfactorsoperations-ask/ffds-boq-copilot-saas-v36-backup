import type { ProjectContext } from '../types';

/*
  WHAT THE CLIENT'S TOTAL INCLUDES, chosen by the studio when it issues.

  A Scope Revision changes the execution scope. Whether the client also sees
  GST on it, the design fee, and GST on the design fee is the studio's call per
  issue: some clients think in "BOQ before tax", others in "what do I pay".
  The choice is frozen into the issued document, so the Excel, the email, the
  portal and the approval record all show the same lines.

  GST on execution follows the project's billable share (financials.
  billablePercent), the same rule the payment schedule uses. A Scope Revision
  does not revise the design fee, so the fee appears unchanged on both sides.

  The project's discounts are not a choice: they are what the client was
  promised, so they are always shown, and frozen with the rest. They come off
  before GST, as the Money tab takes them (a percentage scales with the BOQ, a
  fixed amount stays the same). Documents issued before discounts were frozen
  carry none, and keep showing exactly what they showed.
*/

export interface ClientTotalsDiscount {
  name: string;
  type: 'percentage' | 'fixed';
  value: number;
  target: 'execution' | 'design';
}

export interface ClientTotalsOptions {
  execGst: boolean;
  designFee: boolean;
  designGst: boolean;
  /** Percent, e.g. 18. */
  gstRate: number;
  /** Percent of execution GST applies to, 0-100. */
  billablePercent: number;
  /** The design fee as agreed, before GST. */
  designFeeValue: number;
  /** The project's discounts (financials.discounts) when it was issued. */
  discounts?: ClientTotalsDiscount[];
}

export interface ClientTotalsRow {
  key: 'execution' | 'execDiscount' | 'execGst' | 'designFee' | 'designDiscount' | 'designGst' | 'total';
  label: string;
  before: number;
  after: number;
  change: number;
}

/** The discounts as the Money tab holds them, cleaned for a document. */
export function discountsOf(ctx: ProjectContext | null | undefined): ClientTotalsDiscount[] {
  const list: any[] = (ctx?.financials as any)?.discounts || [];
  return list
    .map((d) => ({
      name: String(d?.name || '').trim(),
      type: d?.type === 'percentage' ? 'percentage' as const : 'fixed' as const,
      value: Math.max(0, Number(d?.value) || 0),
      target: d?.target === 'design' ? 'design' as const : 'execution' as const,
    }))
    .filter((d) => d.value > 0);
}

export function defaultTotalsOptions(ctx: ProjectContext | null | undefined): ClientTotalsOptions {
  const fin: any = ctx?.financials || {};
  const fee = Number((ctx as any)?.engagement?.designFee ?? fin.approvedDesignValue ?? 0) || 0;
  const billable = Number(fin.billablePercent);
  return {
    execGst: false,
    designFee: false,
    designGst: false,
    gstRate: 18,
    billablePercent: Number.isFinite(billable) && billable >= 0 && billable <= 100 ? billable : 100,
    designFeeValue: Math.max(0, fee),
    discounts: discountsOf(ctx),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** What the discounts take off a base, capped at the base. */
export function discountOn(base: number, discounts: ClientTotalsDiscount[] | undefined, target: 'execution' | 'design'): number {
  const off = (discounts || [])
    .filter((d) => d.target === target)
    .reduce((s, d) => s + (d.type === 'percentage' ? base * (d.value / 100) : d.value), 0);
  return r2(Math.min(Math.max(0, base), off));
}

function discountLabel(discounts: ClientTotalsDiscount[] | undefined, target: 'execution' | 'design'): string {
  const mine = (discounts || []).filter((d) => d.target === target);
  const what = mine.map((d) => (d.type === 'percentage' ? `${+d.value.toFixed(2)}%` : d.name)).filter(Boolean);
  const named = mine.length === 1 && mine[0].name ? mine[0].name : what.join(', ');
  return `Less: discount${named ? ` (${named})` : ''}`;
}

export function execGstLabel(o: ClientTotalsOptions): string {
  return o.billablePercent < 100
    ? `GST on execution (${o.gstRate}% on the billable ${o.billablePercent}%)`
    : `GST on execution (${o.gstRate}%)`;
}

/** The rows to show, before and after. For a first Detailed BOQ, pass before = after. */
export function clientTotals(before: number, after: number, o?: ClientTotalsOptions | null): ClientTotalsRow[] {
  const rows: ClientTotalsRow[] = [
    { key: 'execution', label: 'Execution (your BOQ)', before, after, change: after - before },
  ];
  if (!o) return rows;
  const g = o.gstRate / 100;
  const xb = discountOn(before, o.discounts, 'execution');
  const xa = discountOn(after, o.discounts, 'execution');
  if (xb > 0 || xa > 0) {
    rows.push({ key: 'execDiscount', label: discountLabel(o.discounts, 'execution'), before: -xb, after: -xa, change: xb - xa });
  }
  if (o.execGst) {
    const share = (o.billablePercent / 100) * g;
    const b = r2((before - xb) * share);
    const a = r2((after - xa) * share);
    rows.push({ key: 'execGst', label: execGstLabel(o), before: b, after: a, change: a - b });
  }
  if (o.designFee && o.designFeeValue > 0) {
    rows.push({ key: 'designFee', label: 'Design fee', before: o.designFeeValue, after: o.designFeeValue, change: 0 });
    const dd = discountOn(o.designFeeValue, o.discounts, 'design');
    if (dd > 0) rows.push({ key: 'designDiscount', label: discountLabel(o.discounts, 'design'), before: -dd, after: -dd, change: 0 });
    if (o.designGst) {
      const f = r2((o.designFeeValue - dd) * g);
      rows.push({ key: 'designGst', label: `GST on design fee (${o.gstRate}%)`, before: f, after: f, change: 0 });
    }
  }
  if (rows.length > 1) {
    const sum = (k: 'before' | 'after') => r2(rows.reduce((s, r) => s + r[k], 0));
    const b = sum('before');
    const a = sum('after');
    rows.push({ key: 'total', label: 'Total payable', before: b, after: a, change: a - b });
  }
  return rows;
}

/** Execution after the discount, before and after: the figures to lead with when there is one. */
export function netExecution(rows: ClientTotalsRow[]): { before: number; after: number; discounted: boolean } {
  const ex = rows.find((r) => r.key === 'execution')!;
  const d = rows.find((r) => r.key === 'execDiscount');
  return { before: r2(ex.before + (d?.before || 0)), after: r2(ex.after + (d?.after || 0)), discounted: !!d };
}

/** One line under the totals, saying what is and is not in them. */
export function totalsNote(o?: ClientTotalsOptions | null, revision = true): string {
  if (!o) return 'Amounts are before design fee and GST, which apply as per your agreement.';
  const parts: string[] = [];
  if (!o.execGst) parts.push('GST on execution');
  if (!o.designFee) parts.push('the design fee');
  else if (!o.designGst) parts.push('GST on the design fee');
  const fee = o.designFee && revision ? ' The design fee is not revised by a scope revision.' : '';
  const off = (o.discounts || []).length ? ' Your discount comes off before GST.' : '';
  return parts.length
    ? `Not included above: ${parts.join(' and ')}, which ${parts.length > 1 ? 'apply' : 'applies'} as per your agreement.${off}${fee}`
    : `All amounts include GST as shown.${off}${fee}`;
}
