import { ProjectContext, ProposalTier } from '../types';

/**
 * Making an option the commercial baseline — one rule for "Approve Option"
 * and "Sync to Payments & Revisions".
 *
 * The two buttons did the same job differently. Approve kept a snapshot of the
 * contract it replaced (its value, milestones and GST setting) so the payment
 * history could still show what was booked; Sync switched the baseline without
 * one, so syncing a different option erased the booked value from the record.
 * Neither said who approved or when: the banner printed "by Anish" for every
 * studio and the option's creation date as the approval date.
 *
 * Now both go through here: the replaced baseline is snapshotted once, the
 * approval records who and when, and re-syncing the option that is already the
 * baseline refreshes its values without pretending it was approved again.
 */

export interface TierApproval {
  /** When the option became the baseline (ms). */
  at: number;
  /** Who did it, as the studio knows them. */
  by: string;
}

const DEFAULT_FINANCIALS = {
  initiationFeePaid: 0,
  billablePercent: 100,
  executionGstEnabled: true,
  projectedCashValue: 0,
  taxLimitYearly: 2000000,
  goodwillDiscount: 0,
  discounts: [],
  paymentRevisions: [],
};

/** The project context once `tier` is the baseline. */
export function contextWithApproved(prev: ProjectContext, tier: ProposalTier, tiers: ProposalTier[], now: number): ProjectContext {
  const prevFinancials: any = prev.financials || DEFAULT_FINANCIALS;
  const snapshots = [...(prevFinancials.paymentSnapshots || [])];

  // Keep a record of the contract being replaced — once, and never of the
  // option being re-synced over itself.
  if (prev.approvedTierId && prev.approvedTierId !== tier.id && !snapshots.some((s: any) => s.tierId === prev.approvedTierId)) {
    const previous = tiers.find(t => t.id === prev.approvedTierId);
    snapshots.push({
      tierId: prev.approvedTierId,
      tierName: previous?.name || 'Previous Version',
      timestamp: now,
      approvedExecutionValue: prevFinancials.approvedExecutionValue ?? 0,
      approvedDesignValue: prevFinancials.approvedDesignValue ?? 0,
      milestones: prev.paymentMilestones || [],
      billablePercent: prevFinancials.billablePercent,
      executionGstEnabled: prevFinancials.executionGstEnabled,
    });
  }

  const executionValue = tier.summary?.totalSell || 0;
  const designValue = tier.summary?.designFee || 0;

  return {
    ...prev,
    approvedTierId: tier.id,
    financials: {
      ...prevFinancials,
      approvedExecutionValue: executionValue,
      approvedDesignValue: designValue,
      paymentSnapshots: snapshots,
    },
    engagement: prev.engagement ? { ...prev.engagement, executionValue, designFee: designValue } : prev.engagement,
  };
}

/** The options once `tierId` is the baseline: tagged, the old one superseded, the approval recorded. */
export function tiersWithApproved(tiers: ProposalTier[], tierId: string, previousApprovedId: string | undefined, approval: TierApproval): ProposalTier[] {
  return tiers.map(t => {
    if (t.id === tierId) {
      // Re-syncing the baseline keeps the approval it already has.
      const keep = previousApprovedId === tierId && t.approval;
      return { ...t, lifecycleTag: 'Current contract', approval: keep ? t.approval : approval };
    }
    if (t.id === previousApprovedId) return { ...t, lifecycleTag: 'Superseded' };
    return t;
  });
}

/** "approved by Priya on 25 Oct 2026", or a plain "approved" for options approved before this was recorded. */
export function describeApproval(tier: Pick<ProposalTier, 'approval'>): string {
  const a = tier.approval;
  if (!a?.at) return 'approved';
  const date = new Date(a.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return a.by ? `approved by ${a.by} on ${date}` : `approved on ${date}`;
}
