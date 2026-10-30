import { describe, it, expect } from 'vitest';
import { clientTotals, defaultTotalsOptions, discountsOf, netExecution, totalsNote } from '../../lib/scopeTotals';
import { pendingRevision, previewRevisionMoney } from '../../lib/revisionMoneyPreview';
import { computeSchedule } from '../../lib/paymentSchedule';

/*
  Unique Vistas, Scope Revision 2: the BOQ goes from ₹24,30,120.55 to
  ₹20,72,353.70, and the Money tab carries a ₹1,00,000 discount on execution.
  The revision's documents showed the BOQ with no discount, and the Money tab
  could not show what the revision does to the milestones until it was applied.
*/

const V1 = 2430120.55;
const V2 = 2072353.7;
const FEE = 169492;

const ctx = (over: any = {}): any => ({
  name: 'Unique Vistas',
  approvedTierId: 'tier-v2',
  gstRate: 18,
  financials: {
    approvedExecutionValue: V1,
    approvedDesignValue: FEE,
    billablePercent: 100,
    executionGstEnabled: false,
    designGstEnabled: true,
    initiationFeePaid: 0,
    discounts: [{ id: 'd1', name: 'Founder discount', type: 'fixed', value: 100000, target: 'execution' }],
  },
  paymentMilestones: [
    { id: 'm1', name: 'Design advance', type: 'design', percentage: 50, status: 'paid', lockedTaxableBase: FEE },
    { id: 'm2', name: 'Design completion', type: 'design', percentage: 50, status: 'pending' },
    { id: 'm3', name: 'Booking advance', type: 'execution', percentage: 40, status: 'paid', lockedTaxableBase: V1 - 100000 },
    { id: 'm4', name: 'Carpentry start', type: 'execution', percentage: 40, status: 'pending' },
    { id: 'm5', name: 'Handover', type: 'execution', percentage: 20, status: 'pending' },
  ],
  ...over,
});

describe('a revision shows the project discount', () => {
  it('takes the fixed discount off both sides and totals after it', () => {
    const o = { ...defaultTotalsOptions(ctx()), designFee: true };
    const rows = clientTotals(V1, V2, o);
    expect(rows.map(r => r.key)).toEqual(['execution', 'execDiscount', 'designFee', 'total']);
    const d = rows.find(r => r.key === 'execDiscount')!;
    expect(d).toMatchObject({ label: 'Less: discount (Founder discount)', before: -100000, after: -100000, change: 0 });
    const total = rows.find(r => r.key === 'total')!;
    expect(total.before).toBeCloseTo(V1 - 100000 + FEE, 2);
    expect(total.after).toBeCloseTo(V2 - 100000 + FEE, 2);
    expect(netExecution(rows)).toEqual({ before: 2330120.55, after: 1972353.7, discounted: true });
  });

  it('scales a percentage discount with the BOQ, and charges GST on what is left', () => {
    const c = ctx();
    c.financials.discounts = [{ name: 'Loyalty', type: 'percentage', value: 5, target: 'execution' }];
    const rows = clientTotals(1000000, 800000, { ...defaultTotalsOptions(c), execGst: true });
    expect(rows.find(r => r.key === 'execDiscount')).toMatchObject({ before: -50000, after: -40000, change: 10000 });
    expect(rows.find(r => r.key === 'execGst')).toMatchObject({ before: 171000, after: 136800 });
  });

  it('takes a design discount off the fee, before its GST', () => {
    const c = ctx();
    c.financials.discounts = [{ name: 'Fee waiver', type: 'fixed', value: 19492, target: 'design' }];
    const rows = clientTotals(V1, V2, { ...defaultTotalsOptions(c), designFee: true, designGst: true });
    expect(rows.find(r => r.key === 'designDiscount')).toMatchObject({ before: -19492, after: -19492 });
    expect(rows.find(r => r.key === 'designGst')!.after).toBeCloseTo(150000 * 0.18, 2);
    expect(rows.some(r => r.key === 'execDiscount')).toBe(false);
  });

  it('never lets a discount take a side below zero, and drops empty ones', () => {
    const c = ctx();
    c.financials.discounts = [{ name: 'Big', type: 'fixed', value: 5000000, target: 'execution' }, { name: 'Nil', type: 'fixed', value: 0, target: 'execution' }];
    expect(discountsOf(c)).toHaveLength(1);
    const rows = clientTotals(V1, V2, defaultTotalsOptions(c));
    expect(netExecution(rows)).toMatchObject({ before: 0, after: 0 });
  });

  it('leaves documents issued before discounts were frozen exactly as they were', () => {
    const legacy = { execGst: false, designFee: true, designGst: false, gstRate: 18, billablePercent: 100, designFeeValue: FEE };
    const rows = clientTotals(V1, V2, legacy);
    expect(rows.map(r => r.key)).toEqual(['execution', 'designFee', 'total']);
    expect(totalsNote(legacy)).not.toContain('discount');
    expect(totalsNote(defaultTotalsOptions(ctx()))).toContain('Your discount comes off before GST.');
  });
});

describe('the Money tab previews an open revision', () => {
  const issued = (over: any = {}) => ctx({
    scopeRevisions: [{ id: 'srev-2', number: 2, status: 'issued', baseTierId: 'tier-v2', issueId: 'iss-sr2', reference: 'DOC-BQ-2026-UV-v2-REV-02' }],
    documents: { issues: [{ id: 'iss-sr2', kind: 'scope_revision', reference: 'DOC-BQ-2026-UV-v2-REV-02', snapshot: { number: 2, v1: { total: V1 }, v2: { total: V2 } }, ...over }] },
  });

  it('finds the issued revision and says where it stands', () => {
    expect(pendingRevision(issued(), [], [])).toMatchObject({ number: 2, state: 'with_client', v1Total: V1, v2Total: V2 });
    expect(pendingRevision(issued({ changesRequested: { at: '2026-10-21T10:00:00Z' } }), [], [])!.state).toBe('sent_back');
    expect(pendingRevision(issued({ clientSignature: { signatoryName: 'X' } }), [], [])!.state).toBe('approved');
    const applied = issued();
    applied.scopeRevisions[0].status = 'applied';
    expect(pendingRevision(applied, [], [])).toBeNull();
    expect(pendingRevision(ctx(), [], [])).toBeNull();
  });

  it('prices a draft from the BOQ as it is being edited', () => {
    const boq = [{ id: 'l1', roomId: 'Living Room', name: 'TV unit', qty: 1, unit: 'nos', selectedRate: 100000 }];
    const c = ctx({ scopeRevisions: [{ id: 'srev-3', number: 3, status: 'draft', baseTierId: 'tier-v2', imported: [], settings: {} }] });
    const rev = pendingRevision(c, [{ id: 'tier-v2', name: 'v2', boq, summary: {} } as any], []);
    expect(rev).toMatchObject({ state: 'draft', number: 3, v1Total: 100000, v2Total: 100000 });
  });

  it('moves only the milestones still to come, on the revised value less the discount', () => {
    const c = issued();
    const args = {
      context: c,
      tierSummary: { totalSell: V1, designFee: FEE },
      overrides: { approvedExecutionValue: V1, approvedDesignValue: FEE },
    };
    const p = previewRevisionMoney(args, V2);
    expect(p.taxableNow).toBeCloseTo(V1 - 100000, 2);
    expect(p.taxableRevised).toBeCloseTo(V2 - 100000, 2);
    const by = Object.fromEntries(p.rows.map(r => [r.id, r]));
    /* Paid stays as billed; the design track does not move at all. */
    expect(by.m3.change).toBe(0);
    expect(by.m1.change).toBe(0);
    expect(by.m2.change).toBe(0);
    /* The two execution stages to come share the rest, 40:20. */
    const rest = (V2 - 100000) - 0.4 * (V1 - 100000);
    expect(by.m4.revised).toBe(Math.round(rest * (40 / 60)));
    expect(by.m5.revised).toBe(Math.round(rest * (20 / 60)));
    expect(p.unscheduled).toBe(0);
    /* And the "now" side is exactly what the Money tab shows today. */
    expect(p.rows.map(r => r.now)).toEqual(computeSchedule(args).amounts.map(a => a.owed));
  });

  it('changes nothing it is given', () => {
    const c = issued();
    const before = JSON.stringify(c);
    previewRevisionMoney({ context: c, tierSummary: { totalSell: V1, designFee: FEE } }, V2);
    pendingRevision(c, [], []);
    expect(JSON.stringify(c)).toBe(before);
  });

  it('says when billed execution is more than the revised value', () => {
    const c = issued();
    c.paymentMilestones = c.paymentMilestones.map((m: any) => (m.type === 'execution' ? { ...m, status: 'paid', lockedTaxableBase: V1 - 100000 } : m));
    const p = previewRevisionMoney({ context: c, tierSummary: { totalSell: V1, designFee: FEE }, overrides: { approvedExecutionValue: V1 } }, V2);
    expect(p.revised.overBilled.find(o => o.track === 'execution')?.overBy).toBe(Math.round(V1 - V2));
  });
});
