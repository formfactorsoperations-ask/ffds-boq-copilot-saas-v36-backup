/**
 * The client's money, as the studio worked it out.
 *
 * This is a wire format, not a calculator. The portal used to derive its own
 * figures from a context it does not have -- a client session carries no tiers
 * and no `financials` -- so the design fee base resolved to zero, and a
 * hard-coded 4,999 retainer and an assumed 100% billable split were shown to
 * every client as fact. Fixing that by giving the portal a better calculator
 * only moved the problem: two calculators still drifted, and the studio's Money
 * tab quoted 93,797 for a milestone the client's portal priced at 86,579.
 *
 * So nothing is computed twice. lib/paymentSchedule works the project out once,
 * on the studio's side, where the tier and the billing rules live; this reduces
 * that result to the figures a client is allowed to see, and the portal renders
 * them. There is no fallback path in the portal, because a fallback is just a
 * second calculator waiting to disagree.
 *
 * What crosses is what the client is already quoted on their own invoices. The
 * billable/cash split, the discount structure and the tier summaries stay on
 * the studio's side.
 */

import { ScheduleResult } from './paymentSchedule';

export interface PortalMoney {
  /** Schema marker, so an older stored projection is recognisable. */
  v: 1;
  gstRate: number;
  retainerPaid: number;

  designBase: number;
  designGst: number;
  designTotal: number;
  designPaid: number;
  designPct: number;

  executionBase: number;
  executionGst: number;
  executionTotal: number;
  executionPaid: number;
  executionPct: number;

  projectValue: number;
  totalPaid: number;
  balanceDue: number;

  /** Milestone id → what the client owes at that milestone, to the rupee. */
  milestoneAmounts: Record<string, number>;
}

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;

/** Reduce a computed schedule to the client-facing figures. */
export function buildPortalMoney(schedule: ScheduleResult): PortalMoney {
  const t = schedule.totals;

  const milestoneAmounts: Record<string, number> = {};
  schedule.amounts.forEach((a) => { milestoneAmounts[a.id] = a.owed; });

  /*
    The retainer counts towards the design side, because that is where it was
    taken and where the first invoice deducts it again -- one payment, recorded
    once.
  */
  let designPaid = schedule.financials.initiationFeePaid;
  let executionPaid = 0;
  schedule.amounts.forEach((a) => {
    if (a.status !== 'paid') return;
    if (a.type === 'design') designPaid += a.owed;
    else executionPaid += a.owed;
  });

  const designTotal = t.taxableDesign + t.gstOnDesign;
  const executionTotal = t.taxableExecution + t.gstOnExecution;

  return {
    v: 1,
    gstRate: schedule.gstRate,
    retainerPaid: schedule.financials.initiationFeePaid,

    designBase: t.taxableDesign,
    designGst: t.gstOnDesign,
    designTotal,
    designPaid,
    designPct: pct(designPaid, designTotal),

    executionBase: t.taxableExecution,
    executionGst: t.gstOnExecution,
    executionTotal,
    executionPaid,
    executionPct: pct(executionPaid, executionTotal),

    projectValue: t.grossProjectValue,
    totalPaid: t.totalPaid,
    balanceDue: Math.max(0, t.grossProjectValue - t.totalPaid),

    milestoneAmounts,
  };
}
