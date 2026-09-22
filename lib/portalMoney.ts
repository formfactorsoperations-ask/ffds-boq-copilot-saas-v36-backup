/**
 * The client's money, worked out once.
 *
 * The portal used to compute this itself, from a context it does not have. In a
 * client session there are no tiers — the projection deliberately withholds
 * them — so the design fee base resolved to 0 and every design milestone
 * rendered as `0 × 25%`. The execution side only looked right because it is
 * rebuilt from the projected BOQ.
 *
 * Worse, `context.financials` does not cross either, and the portal fell back to
 * a hard-coded object: a ₹4,999 retainer, 100% billable, execution GST on. Every
 * client on every project was shown that ₹4,999 as cleared whether or not they
 * had paid it, and any project billing a cash split or without execution GST had
 * its figures quietly wrong on the client's own screen.
 *
 * So the studio computes, where the real inputs are, and the result is stored in
 * the projection. Both sides call the functions here, which is what stops the
 * preview and the client's actual portal from disagreeing — the failure this
 * codebase keeps rediscovering.
 *
 * Nothing studio-internal crosses. What lands in the projection is the rupee
 * figures the client is already quoted on their own invoices; the billable/cash
 * split, the discount structure and the tier summaries stay here.
 */

export interface MoneyDiscount {
  target: 'execution' | 'design';
  type: string;
  value: number;
}

export interface PortalMoneyInput {
  /** Design fee before discounts, ex-GST. */
  rawDesignFee: number;
  /** Execution value before discounts, ex-GST. */
  rawExecutionTotal: number;
  discounts: MoneyDiscount[];
  gstRate: number;
  billablePercent: number;
  executionGstEnabled: boolean;
  /** The retainer already collected, which comes off the first design invoice. */
  retainerPaid: number;
  milestones: any[];
}

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

/**
 * Turn a project context and its live tier into the inputs above.
 *
 * Kept beside the computation rather than at each call site, because the rule
 * for which execution figure is operative — revised scope, approved value, or
 * the tier's own total — is the sort of thing that drifts the moment it is
 * written down twice.
 */
export function resolveMoneyInputs(args: {
  context: any;
  tierSummary?: { totalSell?: number; designFee?: number };
  /** Sum of the BOQ as the client sees it. */
  scopeTotal: number;
  hasActiveBoqRevisions: boolean;
}): PortalMoneyInput {
  const { context: ctx, tierSummary, scopeTotal, hasActiveBoqRevisions } = args;
  const financials = ctx?.financials || {};

  const originalExecutionTotal = tierSummary?.totalSell || 0;
  const originalDesignFee = tierSummary?.designFee || 0;

  const effectiveExecutionValue = (hasActiveBoqRevisions && scopeTotal > 0)
    ? scopeTotal
    : (financials.approvedExecutionValue ?? (scopeTotal > 0 ? scopeTotal : originalExecutionTotal));

  return {
    rawExecutionTotal: effectiveExecutionValue,
    rawDesignFee: financials.approvedDesignValue ?? originalDesignFee,
    discounts: financials.discounts || [],
    gstRate: ctx?.gstRate || 18,
    billablePercent: financials.billablePercent ?? 100,
    executionGstEnabled: financials.executionGstEnabled ?? true,
    retainerPaid: Number(financials.initiationFeePaid) || 0,
    milestones: ctx?.paymentMilestones || [],
  };
}

function deduction(base: number, target: 'execution' | 'design', discounts: MoneyDiscount[]): number {
  return (discounts || [])
    .filter(d => d.target === target)
    .reduce((sum, d) => sum + (d.type === 'percentage' ? base * (d.value / 100) : d.value), 0);
}

export function computePortalMoney(i: PortalMoneyInput): PortalMoney {
  const gstRate = i.gstRate;
  const billablePercent = i.billablePercent;

  const taxableExecution = Math.max(0, i.rawExecutionTotal - deduction(i.rawExecutionTotal, 'execution', i.discounts));
  const taxableDesign = Math.max(0, i.rawDesignFee - deduction(i.rawDesignFee, 'design', i.discounts));

  const executionBillable = taxableExecution * (billablePercent / 100);
  const executionCash = taxableExecution * ((100 - billablePercent) / 100);
  const gstOnExecution = i.executionGstEnabled ? executionBillable * (gstRate / 100) : 0;
  const gstOnDesign = taxableDesign * (gstRate / 100);

  const milestones = i.milestones || [];
  const firstDesignId = milestones.find((m: any) => m?.type === 'design')?.id;

  /*
    What one milestone is worth to the client.

    This has to agree with the studio's Money tab to the rupee, so the rounding
    mirrors PaymentCalculatorTab step for step — including the retainer coming
    off the first design invoice. Computing in full precision here and rounding
    at the end produced a portal quoting ₹2,45,708 against a Money tab showing
    ₹2,44,571, and two screens disagreeing about one invoice is worse than
    either being slightly off.
  */
  const amountOf = (m: any): number => {
    let baseAmount = m?.type === 'design' ? taxableDesign : taxableExecution;
    if (m?.lockedTaxableBase !== undefined) baseAmount = m.lockedTaxableBase;

    const rowBaseOriginal = Math.round(
      m?.isFixedAmount && m?.fixedAmount !== undefined
        ? m.fixedAmount
        : baseAmount * ((Number(m?.percentage) || 0) / 100),
    );

    if (m?.type === 'execution') {
      const rowBillable = Math.round(rowBaseOriginal * (billablePercent / 100));
      const rowCash = Math.round(rowBaseOriginal * ((100 - billablePercent) / 100));
      const rate = i.executionGstEnabled ? gstRate : 0;
      const rowGST = Math.round(rowBillable * (rate / 100));
      return Math.round(rowBillable + rowGST) + rowCash;
    }

    const rowGST = Math.round(rowBaseOriginal * (gstRate / 100));
    const rowInvoiceTotal = Math.round(rowBaseOriginal + rowGST);

    return m?.id === firstDesignId && i.retainerPaid > 0
      ? Math.max(0, rowInvoiceTotal - i.retainerPaid)
      : rowInvoiceTotal;
  };

  const milestoneAmounts: Record<string, number> = {};
  milestones.forEach((m: any) => { if (m?.id) milestoneAmounts[m.id] = amountOf(m); });

  let totalPaid = i.retainerPaid;
  let designPaid = i.retainerPaid;
  let executionPaid = 0;
  milestones.forEach((m: any) => {
    if (m?.status !== 'paid') return;
    const amount = amountOf(m);
    totalPaid += amount;
    if (m.type === 'design') designPaid += amount;
    else if (m.type === 'execution') executionPaid += amount;
  });

  const designTotal = taxableDesign + gstOnDesign;
  const executionTotal = executionBillable + executionCash + gstOnExecution;
  const projectValue = executionBillable + executionCash + taxableDesign + gstOnExecution + gstOnDesign;

  const pct = (part: number, whole: number) =>
    whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;

  return {
    v: 1,
    gstRate,
    retainerPaid: i.retainerPaid,

    designBase: taxableDesign,
    designGst: gstOnDesign,
    designTotal,
    designPaid,
    designPct: pct(designPaid, designTotal),

    executionBase: executionBillable + executionCash,
    executionGst: gstOnExecution,
    executionTotal,
    executionPaid,
    executionPct: pct(executionPaid, executionTotal),

    projectValue,
    totalPaid,
    balanceDue: Math.max(0, projectValue - totalPaid),

    milestoneAmounts,
  };
}
