/**
 * What every milestone on a project is worth, worked out once.
 *
 * There were seven implementations of this, in two families that disagreed:
 *
 *   A  the Money tab's table and the generated Payment Schedule -- unpaid rows
 *      re-based onto the contract REMAINING after cleared milestones and fixed
 *      amounts, so the schedule always sums to the contract
 *   B  totalPaid, the collections chase list, and the client portal -- a flat
 *      percentage of the original net base
 *
 * They agree only while nothing has been invoiced and no milestone carries a
 * fixed amount. On five of twenty-five live projects they did not: Test Project
 * for T&C's Design Completion read 93,797 on the studio's screen and 86,579 on
 * the client's portal, for the same invoice.
 *
 * A is the rule, because it is the one that collects the whole contract. When a
 * value is revised after some milestones have been billed, the balance has to
 * carry the difference; spreading a flat percentage over the new value leaves a
 * gap nobody ever bills -- 18,828 rupees of it on Icon Dhokali.
 *
 * Rounding mirrors what the Money tab already did, step for step, because two
 * screens quoting different figures for one invoice is worse than either being
 * a rupee out.
 */

export interface ScheduleFinancials {
  initiationFeePaid: number;
  billablePercent: number;
  executionGstEnabled: boolean;
  /** The design fee is invoiced officially unless this says otherwise. */
  designGstEnabled: boolean;
  projectedCashValue: number;
  taxLimitYearly: number;
  goodwillDiscount: number;
  discounts: { id?: string; name?: string; type: string; value: number; target: 'execution' | 'design' }[];
  approvedExecutionValue?: number;
  approvedDesignValue?: number;
  /* Everything else the record carries -- payment snapshots, revision history.
     Resolving the money fields must not quietly drop the rest of it. */
  [key: string]: any;
}

/*
  The initiation retainer defaults to nothing, because it is optional.

  It used to default to 4999 here and in two other default objects, and was
  read back elsewhere through `|| 4999`, so an explicit zero was overridden by
  the very default it was meant to replace. Seventeen projects carried the
  figure without anyone having chosen it, and every one of them had it deducted
  from the first design invoice.
*/
export const DEFAULT_FINANCIALS: ScheduleFinancials = {
  initiationFeePaid: 0,
  billablePercent: 100,
  executionGstEnabled: true,
  designGstEnabled: true,
  projectedCashValue: 0,
  taxLimitYearly: 2000000,
  goodwillDiscount: 0,
  discounts: [],
};

/**
 * A complete financials record, whatever the project actually stored.
 *
 * The old `projectContext.financials || DEFAULTS` only fired when the whole
 * object was missing. Four live projects stored a partial one, so
 * `executionGstEnabled` came back undefined, read as false, and the execution
 * GST was dropped without a word -- Runwal Eirene's contract showed 9,76,872
 * where it should have read 11,30,900. `taxLimitYearly` undefined put a literal
 * "NaN% of limit" on the screen.
 *
 * Field by field, so a partial record can no longer behave like a decision.
 */
export function resolveFinancials(raw: any): ScheduleFinancials {
  /*
    Whether the project has a financials record at all is the deciding fact.

    A project with NO record has never been costed, and the studio's documented
    defaults apply -- which is what the old `financials || DEFAULTS` did.

    A project WITH a record has been costed, and a field missing from it means
    nobody switched that thing on. Execution GST is the one that matters: most
    of the studio's real jobs are billed without it, and the old code read the
    missing flag as false. Defaulting it to true here would have raised a
    completed job's contract by 1,54,027 without anyone asking for it.

    So the absent flag keeps meaning off, and only the fields that were
    producing NaN -- the billable split and the cash limit -- get a number.
  */
  const hasRecord = !!raw && typeof raw === 'object';
  const f = raw || {};
  const num = (v: any, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback);
  return {
    ...f,
    initiationFeePaid: num(f.initiationFeePaid, DEFAULT_FINANCIALS.initiationFeePaid),
    billablePercent: num(f.billablePercent, DEFAULT_FINANCIALS.billablePercent),
    executionGstEnabled: typeof f.executionGstEnabled === 'boolean'
      ? f.executionGstEnabled
      : (hasRecord ? false : DEFAULT_FINANCIALS.executionGstEnabled),
    /*
      Absent means ON, which is the opposite of the execution flag above -- and
      deliberately so. Each preserves what the app did before it existed: the
      execution GST was read off a flag that defaulted to false, while the
      design fee's GST was hard-wired and had no flag at all. Neither default
      may change a contract that is already on the books.
    */
    designGstEnabled: typeof f.designGstEnabled === 'boolean'
      ? f.designGstEnabled : DEFAULT_FINANCIALS.designGstEnabled,
    projectedCashValue: num(f.projectedCashValue, DEFAULT_FINANCIALS.projectedCashValue),
    taxLimitYearly: num(f.taxLimitYearly, DEFAULT_FINANCIALS.taxLimitYearly),
    goodwillDiscount: num(f.goodwillDiscount, DEFAULT_FINANCIALS.goodwillDiscount),
    discounts: Array.isArray(f.discounts) ? f.discounts : [],
    approvedExecutionValue: typeof f.approvedExecutionValue === 'number' ? f.approvedExecutionValue : undefined,
    approvedDesignValue: typeof f.approvedDesignValue === 'number' ? f.approvedDesignValue : undefined,
  };
}

/** Which fields a stored record is missing, for the repair sweep to report. */
export function missingFinancialFields(raw: any): string[] {
  if (!raw) return [];               // absent entirely is a different case
  const keys = ['initiationFeePaid', 'billablePercent', 'executionGstEnabled', 'taxLimitYearly'];
  return keys.filter((k) => raw[k] === undefined || raw[k] === null);
}

export interface MilestoneAmount {
  id: string;
  name: string;
  type: 'design' | 'execution';
  /** Ex-GST value of this milestone. */
  base: number;
  billable: number;
  cash: number;
  gst: number;
  /** What the invoice reads, retainer already deducted where it applies. */
  invoiceTotal: number;
  /** Invoice plus any cash side -- the whole sum owed at this milestone. */
  owed: number;
  retainerDeducted: number;
  /** The base to freeze onto the milestone when it is invoiced. */
  taxableBaseForLocking: number;
  cleared: boolean;
  /** Carried so callers can split paid from merely invoiced. */
  status: string;
}

export interface ScheduleTotals {
  taxableExecution: number;
  taxableDesign: number;
  originalNetExecution: number;
  originalNetDesign: number;
  gstOnExecution: number;
  gstOnDesign: number;
  grossProjectValue: number;
  totalPaid: number;
  remainingBalance: number;
}

export interface ScheduleResult {
  amounts: MilestoneAmount[];
  byId: Record<string, MilestoneAmount>;
  totals: ScheduleTotals;
  financials: ScheduleFinancials;
  gstRate: number;
}

const R = Math.round;
const isCleared = (m: any) => m?.status === 'paid' || m?.status === 'invoiced';

function deduction(base: number, target: 'execution' | 'design', discounts: any[]): number {
  return (discounts || [])
    .filter((d) => d.target === target)
    .reduce((sum, d) => sum + (d.type === 'percentage' ? base * (d.value / 100) : d.value), 0);
}

export function computeSchedule(args: {
  context: any;
  /** The active tier's summary, which carries the contract before any revision. */
  tierSummary?: { totalSell?: number; designFee?: number };
  /** Overrides for the Money tab's unsaved local edits. */
  overrides?: Partial<ScheduleFinancials> & { gstRate?: number };
}): ScheduleResult {
  const ctx = args.context || {};
  const financials = { ...resolveFinancials(ctx.financials), ...(args.overrides || {}) } as ScheduleFinancials;
  const gstRate = args.overrides?.gstRate ?? (ctx.gstRate || 18);
  const milestones: any[] = ctx.paymentMilestones || [];

  const origExec = args.tierSummary?.totalSell || 0;
  const origDes = args.tierSummary?.designFee || 0;
  const rawExec = financials.approvedExecutionValue ?? origExec;
  const rawDes = financials.approvedDesignValue ?? origDes;
  const ds = financials.discounts;

  const originalNetExecution = Math.max(0, origExec - deduction(origExec, 'execution', ds));
  const originalNetDesign = Math.max(0, origDes - deduction(origDes, 'design', ds));
  const taxableExecution = Math.max(0, rawExec - deduction(rawExec, 'execution', ds));
  const taxableDesign = Math.max(0, rawDes - deduction(rawDes, 'design', ds));

  const bp = financials.billablePercent;
  const amounts: MilestoneAmount[] = [];

  (['design', 'execution'] as const).forEach((type) => {
    const isExec = type === 'execution';
    const items = milestones.filter((m) => m.type === type);
    const originalBase = isExec ? originalNetExecution : originalNetDesign;
    const taxableBase = isExec ? taxableExecution : taxableDesign;

    const cleared = items.filter(isCleared);
    const unpaid = items.filter((m) => !isCleared(m));

    /*
      What the cleared milestones have already taken out of the contract. A
      milestone invoiced before a revision keeps the base it was billed at --
      that is what `lockedTaxableBase` is for -- so the balance is measured
      against what it actually cost, not what it would cost today.
    */
    let lockedBase = 0;
    cleared.forEach((m) => {
      lockedBase += (m.isFixedAmount && m.fixedAmount !== undefined)
        ? m.fixedAmount
        : (m.lockedTaxableBase ?? originalBase) * (m.percentage / 100);
    });

    /*
      Floored at zero. A milestone locked at a base LARGER than the current
      contract -- a revision downward after invoicing -- drove this negative,
      and Harmony 704 rendered both remaining design rows as a flat zero owed.
      Zero is still wrong there, but it is the honest end of the clamp; the
      repair is to re-issue the schedule, which the caller is told to do.
    */
    const remaining = Math.max(0, taxableBase - lockedBase);
    const fixedPending = unpaid
      .filter((m) => m.isFixedAmount && m.fixedAmount !== undefined)
      .reduce((s, m) => s + (m.fixedAmount || 0), 0);
    const remainingForPct = Math.max(0, remaining - fixedPending);
    const unpaidPct = unpaid
      .filter((m) => !m.isFixedAmount)
      .reduce((s, m) => s + (Number(m.percentage) || 0), 0);

    items.forEach((m, i) => {
      const clearedRow = isCleared(m);
      let base: number;
      let lockBase: number;

      if (clearedRow) {
        base = (m.isFixedAmount && m.fixedAmount !== undefined)
          ? m.fixedAmount
          : (m.lockedTaxableBase ?? originalBase) * (m.percentage / 100);
        lockBase = m.lockedTaxableBase ?? originalBase;
      } else if (m.isFixedAmount && m.fixedAmount !== undefined) {
        base = m.fixedAmount;
        lockBase = taxableBase;
      } else {
        base = remainingForPct * (unpaidPct > 0 ? (Number(m.percentage) || 0) / unpaidPct : 0);
        lockBase = m.percentage > 0 ? base / (m.percentage / 100) : taxableBase;
      }

      base = R(base);
      const billable = R(isExec ? base * (bp / 100) : base);
      const cash = R(isExec ? base * ((100 - bp) / 100) : 0);
      const rate = isExec
        ? (financials.executionGstEnabled ? gstRate : 0)
        : (financials.designGstEnabled ? gstRate : 0);
      const gst = R(billable * (rate / 100));
      let invoiceTotal = R(billable + gst);

      /* The retainer already collected comes off the first design invoice. */
      let retainerDeducted = 0;
      if (!isExec && i === 0 && financials.initiationFeePaid > 0) {
        retainerDeducted = Math.min(invoiceTotal, financials.initiationFeePaid);
        invoiceTotal = Math.max(0, invoiceTotal - financials.initiationFeePaid);
      }

      amounts.push({
        id: m.id, name: m.name, type,
        base, billable, cash, gst, invoiceTotal,
        owed: invoiceTotal + cash,
        retainerDeducted,
        taxableBaseForLocking: lockBase,
        cleared: clearedRow,
        status: m.status || 'pending',
      });
    });
  });

  const executionBillable = taxableExecution * (bp / 100);
  const executionCash = taxableExecution * ((100 - bp) / 100);
  const gstOnExecution = financials.executionGstEnabled ? executionBillable * (gstRate / 100) : 0;
  const gstOnDesign = financials.designGstEnabled ? taxableDesign * (gstRate / 100) : 0;
  const grossProjectValue = taxableExecution + taxableDesign + gstOnExecution + gstOnDesign;

  const byId: Record<string, MilestoneAmount> = {};
  amounts.forEach((a) => { byId[a.id] = a; });

  /*
    Paid starts at the retainer because it is money already in, and the first
    design invoice has had it deducted -- counting it here and deducting it
    there is one payment recorded once.
  */
  let totalPaid = financials.initiationFeePaid;
  milestones.forEach((m) => {
    if (m.status === 'paid' && byId[m.id]) totalPaid += byId[m.id].owed;
  });

  return {
    amounts, byId,
    totals: {
      taxableExecution, taxableDesign, originalNetExecution, originalNetDesign,
      gstOnExecution, gstOnDesign, grossProjectValue,
      totalPaid, remainingBalance: grossProjectValue - totalPaid,
    },
    financials, gstRate,
  };
}

/**
 * Whether two financials records say the same thing.
 *
 * The Money tab compared them with `JSON.stringify`, which is key-order
 * sensitive: a stored record and a freshly built one carry the same fields in
 * different orders, so two identical records almost never compared equal and
 * the tab rewrote the project every time it was opened.
 */
export function sameFinancials(a: any, b: any): boolean {
  if (!a || !b) return false;
  const scalars = ['initiationFeePaid', 'billablePercent', 'executionGstEnabled', 'designGstEnabled',
                   'projectedCashValue', 'taxLimitYearly', 'goodwillDiscount',
                   'approvedExecutionValue', 'approvedDesignValue'];
  for (const k of scalars) {
    const x = a[k] === null ? undefined : a[k];
    const y = b[k] === null ? undefined : b[k];
    if (typeof x === 'number' && typeof y === 'number') {
      /* Derived figures carry float dust; a rupee apart is the same record. */
      if (Math.abs(x - y) > 0.5) return false;
    } else if (x !== y) {
      return false;
    }
  }
  const da = a.discounts || [], db = b.discounts || [];
  if (da.length !== db.length) return false;
  return da.every((d: any, i: number) =>
    d?.target === db[i]?.target && d?.type === db[i]?.type && d?.value === db[i]?.value);
}

/** The milestones raised and not yet settled, for the collections chase. */
export function outstandingInvoices(result: ScheduleResult, context: any) {
  const milestones: any[] = context?.paymentMilestones || [];
  return milestones
    .filter((m) => m.status === 'invoiced' && result.byId[m.id])
    .map((m) => ({
      id: m.id,
      name: m.name,
      amount: result.byId[m.id].owed,
      invoicedAt: m.invoiceDate || null,
      invoiceNumber: m.invoiceNumber || null,
    }));
}
