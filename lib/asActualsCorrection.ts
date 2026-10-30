import type { ProjectContext, ProposalTier } from '../types';
import { contractInForce } from './paymentSchedule';
import { scheduleForRevision, withRevisedSchedule } from './paymentScheduleRevision';

/*
  TAKING AS ACTUALS OUT OF A CONTRACT ALREADY IN FORCE.

  As actuals are paid by the client to the vendor, so they are no longer in
  FFDS's total (lib/boqPricing). A project approved before that rule still bills
  an approved value that includes them -- Unique Vistas: ₹24,30,121, of which
  ₹1,45,000 is tiles and electrical fittings bought as actuals.

  This finds that case exactly (the stored value equals the approved option's
  work plus its as-actuals, to the rupee) and corrects it on the studio's click:
  the approved execution value drops by the as-actuals, the change is logged in
  the payment revisions, and the next Payment Schedule version is staged as a
  draft for the client to confirm, as a scope revision's is. Milestones already
  invoiced or paid keep what they were billed at; the change falls on the ones
  still to come. A percentage design fee is charged on the as-actuals as well,
  so the design value does not move.
*/

export interface AsActualsInContract {
  /** The as-actuals estimate in the approved option. */
  asActuals: number;
  /** The approved execution value now, and after the correction. */
  from: number;
  to: number;
  tierId: string;
  tierName: string;
}

export function asActualsInContract(ctx: ProjectContext, tiers: ProposalTier[]): AsActualsInContract | null {
  if (!ctx || !contractInForce(ctx)) return null;
  const tier = tiers.find(t => t.id === ctx.approvedTierId);
  const aa = Number(tier?.summary?.asActualsTotal) || 0;
  if (!tier || aa < 1) return null;
  const from = Number((ctx.financials as any)?.approvedExecutionValue);
  const to = Number(tier.summary.totalSell) || 0;
  if (!Number.isFinite(from) || Math.abs(from - (to + aa)) > 1) return null;
  return { asActuals: aa, from, to, tierId: tier.id, tierName: tier.name };
}

export function takeAsActualsOut(c: AsActualsInContract, by: string, at = Date.now()) {
  return (prev: ProjectContext): ProjectContext => {
    const fin: any = prev.financials || {};
    /* Only if nothing moved since the studio looked at it. */
    if (Math.abs((Number(fin.approvedExecutionValue) || 0) - c.from) > 1) return prev;
    const designValue = fin.approvedDesignValue ?? (prev as any).engagement?.designFee ?? 0;
    const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
    const reason = `As actuals taken out of FFDS's total: ${inr(c.asActuals)} the client pays vendors directly (${c.tierName}).`;
    const next = scheduleForRevision(prev, {
      executionValue: c.to,
      designValue,
      note: `Re-issued without the as-actuals: execution ${inr(c.from)} → ${inr(c.to)}. ${inr(c.asActuals)} of as-actuals is paid by the client to vendors directly.`,
      issuedBy: by,
      id: `ps_aa_${at.toString(36)}`,
      at,
    });
    return {
      ...prev,
      ...(next ? { paymentSchedules: withRevisedSchedule(prev, next) } : {}),
      financials: {
        ...fin,
        approvedExecutionValue: c.to,
        paymentRevisions: [...(fin.paymentRevisions || []), {
          id: `aa-${at}`,
          date: new Date(at).toISOString(),
          previousExecutionValue: c.from,
          newExecutionValue: c.to,
          previousDesignValue: designValue,
          newDesignValue: designValue,
          reason,
        }],
      },
    };
  };
}
