import { PaymentSchedule, ProjectContext } from '../types';

/**
 * THE PAYMENT SCHEDULE AFTER A SCOPE REVISION.
 *
 * Applying a signed Scope Revision changes the execution value. The schedule
 * the client holds was issued on the old value, so the studio owes them a new
 * version to confirm — and used to have to remember to make one.
 *
 * The rules are the Payment Calculator's own ("Generate schedule",
 * components/PaymentCalculatorTab.tsx), repeated here rather than moved, so
 * the live calculator is not touched while a real project runs on it:
 *
 *   - the base is the approved value less the project's pre-tax discounts;
 *   - a stage already invoiced or paid keeps the amount it was billed at
 *     (its locked base × its percentage, or its fixed amount);
 *   - the stages still to come share what remains, in proportion to their
 *     percentages, after any fixed amounts among them.
 *
 * The result is a DRAFT version. It reaches the client the way every schedule
 * does: released from the Documents board and acknowledged by them.
 */

type Money = { taxableExecution: number; taxableDesign: number };

function discount(base: number, discounts: any[] | undefined, target: 'execution' | 'design'): number {
  return (discounts || [])
    .filter(d => d.target === target)
    .reduce((sum, d) => sum + (d.type === 'percentage' ? base * (Number(d.value) || 0) / 100 : Number(d.value) || 0), 0);
}

export function taxableBases(ctx: ProjectContext, executionValue: number, designValue: number): Money {
  const fin: any = ctx.financials || {};
  return {
    taxableExecution: Math.max(0, executionValue - discount(executionValue, fin.discounts, 'execution')),
    taxableDesign: Math.max(0, designValue - discount(designValue, fin.discounts, 'design')),
  };
}

const cleared = (m: any) => m.status === 'paid' || m.status === 'invoiced';

/** Advances re-based on new values, by the calculator's rules. */
export function rebaseAdvances(milestones: any[], money: Money): any[] {
  const { taxableExecution, taxableDesign } = money;
  const group = (type: 'execution' | 'design') => {
    const base = type === 'execution' ? taxableExecution : taxableDesign;
    const rows = milestones.filter(m => (type === 'execution' ? m.type === 'execution' : m.type === 'design'));
    const locked = rows.filter(cleared).reduce((sum, m) =>
      sum + (m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || base) * (m.percentage / 100)), 0);
    return { base, unpaid: rows.filter(m => !cleared(m)), remaining: base - locked };
  };
  const exec = group('execution');
  const design = group('design');

  let d = 0;
  let e = 0;
  const rows = milestones.map(m => {
    const g = m.type === 'execution' ? exec : design;
    let amount: number;
    if (cleared(m)) {
      amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || g.base) * (m.percentage / 100);
    } else if (m.isFixedAmount && m.fixedAmount !== undefined) {
      amount = m.fixedAmount;
    } else {
      const fixedPending = g.unpaid.filter(x => x.isFixedAmount).reduce((s, x) => s + (x.fixedAmount || 0), 0);
      const pool = Math.max(0, g.remaining - fixedPending);
      const pct = g.unpaid.filter(x => !x.isFixedAmount).reduce((s, x) => s + x.percentage, 0);
      amount = pct > 0 ? pool * (m.percentage / pct) : 0;
    }
    const label = (m.name || '').replace(' (Gross)', '');
    return {
      advanceCode: m.type === 'design' ? `D${++d}` : `E${++e}`,
      label,
      phase: m.type,
      percentage: m.percentage,
      isFixedAmount: m.isFixedAmount,
      fixedAmount: m.fixedAmount,
      amount: Math.round(amount),
      dueCondition: m.trigger || (m.type === 'execution' ? `Advance before ${label.toLowerCase()}` : `On completion of ${label}`),
      unlocks: m.unlocks || '',
      status: m.status === 'invoiced' ? 'advance_requested' : m.status === 'paid' ? 'received' : 'pending',
      invoiceRef: m.invoiceNumber || null,
      receivedAt: null,
      isHandoverAdvance: m.isHandoverAdvance || label.toLowerCase().includes('handover') || false,
    };
  });

  /* On a project already paid up, no stage is left to carry the change, and
     the stages would add up to the old value. The difference gets a stage of
     its own: a balance the client owes, or a credit the studio owes them. */
  ([['execution', exec, () => `E${++e}`], ['design', design, () => `D${++d}`]] as const).forEach(([phase, g, code]) => {
    const sum = rows.filter(r => r.phase === phase).reduce((s, r) => s + r.amount, 0);
    const gap = Math.round(g.base - sum);
    /* Each stage is rounded to the rupee, so a few rupees of drift is rounding,
       not a balance anyone owes. */
    if (Math.abs(gap) <= 10 || !rows.some(r => r.phase === phase)) return;
    const owed = gap > 0;
    rows.push({
      advanceCode: code(),
      label: owed ? 'Scope revision — balance' : 'Scope revision — credit to you',
      phase,
      percentage: 0,
      isFixedAmount: true,
      fixedAmount: gap,
      amount: gap,
      dueCondition: owed ? 'On signing the scope revision' : 'Adjusted against the next invoice, or refunded',
      unlocks: '',
      status: 'pending',
      invoiceRef: null,
      receivedAt: null,
      isHandoverAdvance: false,
    } as any);
  });
  return rows;
}

/**
 * The next schedule version, as a draft, on the revised execution value.
 * Returns null where the project has no milestones to schedule.
 */
/** The project's schedules with this draft in place: other drafts dropped, the version it replaces marked. */
export function withRevisedSchedule(ctx: ProjectContext, next: { schedule: PaymentSchedule; supersedes: string | null }): PaymentSchedule[] {
  return (ctx.paymentSchedules || [])
    .filter(s => s.status !== 'draft')
    .map(s => (s.id === next.supersedes ? { ...s, supersededBy: next.schedule.id } : s))
    .concat(next.schedule);
}

export function scheduleForRevision(
  ctx: ProjectContext,
  opts: { executionValue: number; designValue: number; note: string; issuedBy: string; id: string; at?: number },
): { schedule: PaymentSchedule; supersedes: string | null } | null {
  const milestones = ctx.paymentMilestones || [];
  if (!milestones.length) return null;
  /* An unsent draft is replaced, not stacked on — the Payment Schedule page
     does the same when it regenerates. The version it replaces is the latest
     one that actually went out. */
  const schedules = (ctx.paymentSchedules || []).filter(s => s.status !== 'draft');
  const latest = schedules.length ? schedules.reduce((a, b) => (a.version > b.version ? a : b)) : null;
  const money = taxableBases(ctx, opts.executionValue, opts.designValue);
  const version = latest ? latest.version + 1 : 1;
  const schedule: PaymentSchedule = {
    id: opts.id,
    version,
    versionLabel: `v${version}.0`,
    status: 'draft',
    docketRef: latest?.docketRef || (ctx as any).engagement?.docketRef || 'WILL_BIND_LATER',
    issuedAt: opts.at || Date.now(),
    issuedBy: opts.issuedBy,
    contractValue: money.taxableExecution + money.taxableDesign,
    advances: rebaseAdvances(milestones, money) as any,
    revisionNote: opts.note,
    supersededBy: null,
    snapshotEngagement: { designFee: money.taxableDesign, executionValue: money.taxableExecution } as any,
    ...(latest?.snapshotPaymentStructure ? { snapshotPaymentStructure: latest.snapshotPaymentStructure } : {}),
    ...(latest?.snapshotTermsConfig ? { snapshotTermsConfig: latest.snapshotTermsConfig } : {}),
  };
  return { schedule, supersedes: latest?.id || null };
}
