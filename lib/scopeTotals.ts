import type { ProjectContext } from '../types';
import type { RevisionDiscount } from './revisionOffer';

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

  Since revisions could carry a discount of their own (lib/revisionOffer), a
  revision is issued with `proposalHeld`: the proposal's discounts stay at what
  they came to on the signed BOQ, on both sides, so the client's agreed figure
  never moves. The revision's own discount (`revisionDiscount`) comes off the
  revised side only, on its own line, so it is the change the client sees.
  Documents issued without these keep their old reading.
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
  /** A revision: the discounts above are held at what they were on the signed side, on both sides. */
  proposalHeld?: boolean;
  /** A revision: the discount given in it, off the revised side only. */
  revisionDiscount?: RevisionDiscount | null;
  /**
   * A revision: the design fee on the revised BOQ (lib/revisionOffer revisedDesignFee).
   * A percentage fee is charged on the work before discounts, so it follows the
   * revised BOQ. Missing on documents issued before this: the fee did not move.
   */
  designFeeAfter?: number | null;
}

export interface ClientTotalsRow {
  key: 'execution' | 'execDiscount' | 'revisionDiscount' | 'execGst' | 'designFee' | 'designDiscount' | 'designGst' | 'total';
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

function revisionDiscountLabel(d: RevisionDiscount): string {
  /* A top-up: what brings the total off the work to this percentage of the revised BOQ. */
  if (d.on === 'topup') return `Less: ${d.name || 'revision discount'} (total discount ${+(+d.value).toFixed(2)}% of the revised BOQ)`;
  const how = d.type === 'percentage'
    ? `${+(+d.value).toFixed(2)}% on ${d.on === 'whole' ? 'the revised BOQ' : 'the new items'}`
    : d.on === 'whole' ? 'on the revised BOQ' : 'on the new items';
  return `Less: ${d.name || 'revision discount'} (${how})`;
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
  /* Held: the proposal's discount is what it was on the signed BOQ, whatever the revision adds (capped at the revised BOQ). */
  const xa = o.proposalHeld ? r2(Math.min(Math.max(0, after), xb)) : discountOn(after, o.discounts, 'execution');
  if (xb > 0 || xa > 0) {
    rows.push({ key: 'execDiscount', label: discountLabel(o.discounts, 'execution'), before: -xb, after: -xa, change: xb - xa });
  }
  /* The revision's own discount: off the revised side only, never below nothing. */
  const rd = o.revisionDiscount ? r2(Math.min(Math.max(0, after - xa), Math.max(0, Number(o.revisionDiscount.amount) || 0))) : 0;
  if (rd > 0) {
    rows.push({ key: 'revisionDiscount', label: revisionDiscountLabel(o.revisionDiscount!), before: 0, after: -rd, change: -rd });
  }
  if (o.execGst) {
    const share = (o.billablePercent / 100) * g;
    const b = r2((before - xb) * share);
    const a = r2((after - xa - rd) * share);
    rows.push({ key: 'execGst', label: execGstLabel(o), before: b, after: a, change: a - b });
  }
  if (o.designFee && o.designFeeValue > 0) {
    const fb = o.designFeeValue;
    const fa = typeof o.designFeeAfter === 'number' && o.designFeeAfter >= 0 ? r2(o.designFeeAfter) : fb;
    rows.push({ key: 'designFee', label: 'Design fee', before: fb, after: fa, change: r2(fa - fb) });
    const db = discountOn(fb, o.discounts, 'design');
    const da = o.proposalHeld ? r2(Math.min(fa, db)) : discountOn(fa, o.discounts, 'design');
    if (db > 0 || da > 0) rows.push({ key: 'designDiscount', label: discountLabel(o.discounts, 'design'), before: -db, after: -da, change: r2(db - da) });
    if (o.designGst) {
      const b = r2((fb - db) * g);
      const a = r2((fa - da) * g);
      rows.push({ key: 'designGst', label: `GST on design fee (${o.gstRate}%)`, before: b, after: a, change: r2(a - b) });
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
  const rd = rows.find((r) => r.key === 'revisionDiscount');
  return {
    before: r2(ex.before + (d?.before || 0) + (rd?.before || 0)),
    after: r2(ex.after + (d?.after || 0) + (rd?.after || 0)),
    discounted: !!(d || rd),
  };
}

/** One line under the totals, saying what is and is not in them. */
export function totalsNote(o?: ClientTotalsOptions | null, revision = true): string {
  if (!o) return 'Amounts are before design fee and GST, which apply as per your agreement.';
  const parts: string[] = [];
  if (!o.execGst) parts.push('GST on execution');
  if (!o.designFee) parts.push('the design fee');
  else if (!o.designGst) parts.push('GST on the design fee');
  const feeMoves = typeof o.designFeeAfter === 'number' && Math.abs(o.designFeeAfter - o.designFeeValue) >= 0.5;
  const fee = o.designFee && revision
    ? feeMoves ? ' The design fee is a percentage of the work before discounts, so it follows the revised BOQ.' : ' The design fee is not revised by a scope revision.'
    : '';
  const any = (o.discounts || []).length || (o.revisionDiscount?.amount || 0) > 0;
  const off = any ? ' Your discount comes off before GST.' : '';
  const held = o.proposalHeld && (o.discounts || []).length ? ' The discount you agreed stays as agreed.' : '';
  return parts.length
    ? `Not included above: ${parts.join(' and ')}, which ${parts.length > 1 ? 'apply' : 'applies'} as per your agreement.${off}${held}${fee}`
    : `All amounts include GST as shown.${off}${held}${fee}`;
}
