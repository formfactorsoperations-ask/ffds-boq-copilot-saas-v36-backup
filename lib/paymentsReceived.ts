import { computeSchedule } from './paymentSchedule';
import { dateOf } from './ownerReports';

/** One milestone payment that came in, priced the way Money prices it. */
export interface PaymentReceived {
  id: string;
  name: string;
  type: 'design' | 'execution';
  /** What the client paid at this milestone: Money's `owed`, the figure its "paid" total adds up. */
  amount: number;
  /** The day it landed, local midnight. */
  at: number;
  /** True when no received date was recorded and the invoice date stands in for it. */
  fromInvoiceDate: boolean;
}

/*
  Milestone payments that landed between `start` and `end`, inclusive.

  The record of a payment is on the milestone: `status: 'paid'` and the day in
  `paidDate`. Older payments have no `paidDate`, and like Reports
  (lib/ownerReports `landedAt`) the invoice date stands in for them. A paid
  milestone with neither date cannot be placed in a week and is left out.

  The amounts come from lib/paymentSchedule `computeSchedule`, so a payment
  reads here as it does on Money. A milestone the schedule does not price
  (the execution track of a fee-only project) is not counted, as Money does
  not count it.

  `paymentSchedules[].advances[].receivedAt` is not read: every generator
  writes it as null and nothing sets it later.
*/
export function paymentsReceivedIn(
  context: any,
  start: Date | number,
  end: Date | number,
  tierSummary?: { totalSell?: number; designFee?: number },
): PaymentReceived[] {
  const milestones: any[] = Array.isArray(context?.paymentMilestones) ? context.paymentMilestones : [];
  const paid = milestones.filter((m) => m && String(m.status || '').toLowerCase() === 'paid');
  if (!paid.length) return [];
  let byId: Record<string, { owed: number }> = {};
  try {
    byId = computeSchedule({ context, tierSummary }).byId;
  } catch {
    return [];
  }
  const from = +start;
  const to = +end;
  const out: PaymentReceived[] = [];
  for (const m of paid) {
    const priced = byId[m.id];
    if (!priced) continue;
    const paidAt = dateOf(m.paidDate);
    const at = paidAt ?? dateOf(m.invoiceDate);
    if (at == null || at < from || at > to) continue;
    out.push({
      id: String(m.id),
      name: String(m.name || 'Payment'),
      type: m.type === 'design' ? 'design' : 'execution',
      amount: priced.owed,
      at,
      fromInvoiceDate: paidAt == null,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}
