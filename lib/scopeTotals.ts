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
*/

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
}

export interface ClientTotalsRow {
  key: 'execution' | 'execGst' | 'designFee' | 'designGst' | 'total';
  label: string;
  before: number;
  after: number;
  change: number;
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
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

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
  if (o.execGst) {
    const share = (o.billablePercent / 100) * g;
    const b = r2(before * share);
    const a = r2(after * share);
    rows.push({ key: 'execGst', label: execGstLabel(o), before: b, after: a, change: a - b });
  }
  if (o.designFee && o.designFeeValue > 0) {
    rows.push({ key: 'designFee', label: 'Design fee', before: o.designFeeValue, after: o.designFeeValue, change: 0 });
    if (o.designGst) {
      const f = r2(o.designFeeValue * g);
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

/** One line under the totals, saying what is and is not in them. */
export function totalsNote(o?: ClientTotalsOptions | null, revision = true): string {
  if (!o) return 'Amounts are before design fee and GST, which apply as per your agreement.';
  const parts: string[] = [];
  if (!o.execGst) parts.push('GST on execution');
  if (!o.designFee) parts.push('the design fee');
  else if (!o.designGst) parts.push('GST on the design fee');
  const fee = o.designFee && revision ? ' The design fee is not revised by a scope revision.' : '';
  return parts.length
    ? `Not included above: ${parts.join(' and ')}, which ${parts.length > 1 ? 'apply' : 'applies'} as per your agreement.${fee}`
    : `All amounts include GST as shown.${fee}`;
}
