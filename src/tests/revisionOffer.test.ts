import { describe, it, expect } from 'vitest';
import {
  revisionOfferAmount, frozenRevisionDiscount, describeRevisionOffer, heldDiscounts, discountsAfterRevision,
  draftRevision, withRevisionOffer,
} from '../../lib/revisionOffer';
import { clientTotals, defaultTotalsOptions, netExecution, totalsNote } from '../../lib/scopeTotals';
import { staleOffer } from '../../lib/offers';
import { appliedContext } from '../../lib/scopeApply';
import { pendingRevision, previewRevisionMoney } from '../../lib/revisionMoneyPreview';

/*
  Palacia 3BHK: the client paid D1 on Comfort Upgrade at ₹14,14,441 with a
  flat ₹70,000 off. After the first design workshop they add items, and the
  studio gives a discount on what was added. The ₹70,000 must stay what was
  agreed; the revision's discount comes off the revised side only; the payment
  schedule takes both off.
*/

const V1 = 1414441;
const ADDED = 150000;
const V2 = V1 + ADDED;
const FEE = 169900;

const ctx = (over: any = {}): any => ({
  name: 'Palacia 3BHK',
  approvedTierId: 'tier-v1',
  gstRate: 18,
  financials: {
    approvedExecutionValue: V1,
    approvedDesignValue: FEE,
    billablePercent: 100,
    executionGstEnabled: true,
    designGstEnabled: true,
    initiationFeePaid: 0,
    discounts: [{ id: 'd1', name: 'Special Discount', type: 'fixed', value: 70000, target: 'execution' }],
  },
  paymentMilestones: [
    { id: 'm1', name: 'Sign-up & Concept', type: 'design', percentage: 30, status: 'paid', lockedTaxableBase: FEE },
    { id: 'm2', name: 'Design Completion', type: 'design', percentage: 70, status: 'pending' },
    { id: 'm3', name: 'Material Order Advance', type: 'execution', percentage: 40, status: 'pending' },
    { id: 'm4', name: 'Structure & First-Fix', type: 'execution', percentage: 40, status: 'pending' },
    { id: 'm5', name: 'Completion & Handover', type: 'execution', percentage: 20, status: 'pending' },
  ],
  ...over,
});

describe('a revision discount, worked out', () => {
  it('is a percentage of the new items by default, or of the whole revised BOQ', () => {
    const b = { added: ADDED, whole: V2 };
    expect(revisionOfferAmount({ name: 'R', on: 'added', type: 'percentage', value: 5 }, b)).toBe(7500);
    expect(revisionOfferAmount({ name: 'R', on: 'whole', type: 'percentage', value: 1 }, b)).toBe(Math.round(V2 * 0.01));
    expect(revisionOfferAmount({ name: 'R', on: 'added', type: 'fixed', value: 10000 }, b)).toBe(10000);
  });

  it('never takes more than what it is worked out on, and nothing for nothing', () => {
    expect(revisionOfferAmount({ name: 'R', on: 'added', type: 'fixed', value: 500000 }, { added: ADDED, whole: V2 })).toBe(ADDED);
    expect(revisionOfferAmount({ name: 'R', on: 'added', type: 'percentage', value: 250 }, { added: ADDED, whole: V2 })).toBe(ADDED);
    expect(revisionOfferAmount({ name: 'R', on: 'added', type: 'percentage', value: 5 }, { added: 0, whole: V2 })).toBe(0);
    expect(frozenRevisionDiscount({ name: 'R', on: 'added', type: 'percentage', value: 0 }, { added: ADDED, whole: V2 })).toBeNull();
    expect(frozenRevisionDiscount(null, { added: ADDED, whole: V2 })).toBeNull();
  });

  it('says what it is in words', () => {
    expect(describeRevisionOffer({ on: 'added', type: 'percentage', value: 5 })).toBe('5% on the new items');
    expect(describeRevisionOffer({ on: 'whole', type: 'fixed', value: 25000 })).toBe('₹25,000 off the whole revised BOQ');
    expect(frozenRevisionDiscount({ name: '  ', on: 'added', type: 'fixed', value: 1 }, { added: ADDED, whole: V2 })!.name).toBe('Revision discount');
  });
});

describe('the revision document', () => {
  const offer = frozenRevisionDiscount({ name: 'Workshop discount', on: 'added', type: 'percentage', value: 5 }, { added: ADDED, whole: V2 })!;
  const opts = (c = ctx()) => ({ ...defaultTotalsOptions(c), execGst: true, proposalHeld: true, revisionDiscount: offer });

  it('keeps the proposal discount as agreed and shows the revision one as the change', () => {
    const rows = clientTotals(V1, V2, opts());
    expect(rows.map(r => r.key)).toEqual(['execution', 'execDiscount', 'revisionDiscount', 'execGst', 'total']);
    expect(rows.find(r => r.key === 'execDiscount')).toMatchObject({ before: -70000, after: -70000, change: 0 });
    expect(rows.find(r => r.key === 'revisionDiscount')).toMatchObject({ label: 'Less: Workshop discount (5% on the new items)', before: 0, after: -7500, change: -7500 });
    /* GST on what is left after both. */
    expect(rows.find(r => r.key === 'execGst')!.after).toBeCloseTo((V2 - 70000 - 7500) * 0.18, 2);
    expect(rows.find(r => r.key === 'execGst')!.before).toBeCloseTo((V1 - 70000) * 0.18, 2);
    expect(netExecution(rows)).toEqual({ before: V1 - 70000, after: V2 - 77500, discounted: true });
  });

  it('holds a percentage proposal discount at what it came to on the signed BOQ', () => {
    const c = ctx();
    c.financials.discounts = [{ name: 'Proposal 5%', type: 'percentage', value: 5, target: 'execution' }];
    const rows = clientTotals(V1, V2, { ...defaultTotalsOptions(c), proposalHeld: true });
    const d = rows.find(r => r.key === 'execDiscount')!;
    expect(d.before).toBeCloseTo(-V1 * 0.05, 2);
    expect(d.after).toBe(d.before);
    expect(totalsNote({ ...defaultTotalsOptions(c), proposalHeld: true })).toContain('The discount you agreed stays as agreed.');
  });

  it('reads a document issued before this exactly as it did', () => {
    const c = ctx();
    c.financials.discounts = [{ name: 'Proposal 5%', type: 'percentage', value: 5, target: 'execution' }];
    const rows = clientTotals(V1, V2, defaultTotalsOptions(c));
    expect(rows.find(r => r.key === 'execDiscount')!.after).toBeCloseTo(-V2 * 0.05, 2);
    expect(rows.some(r => r.key === 'revisionDiscount')).toBe(false);
  });

  it('a revision discount alone still reads as a discount', () => {
    const rows = clientTotals(V1, V2, { ...defaultTotalsOptions(ctx({ financials: { discounts: [] } })), proposalHeld: true, revisionDiscount: offer });
    expect(netExecution(rows)).toMatchObject({ before: V1, after: V2 - 7500, discounted: true });
  });
});

describe('the project discounts once applied', () => {
  it('turns a percentage off the work into the fixed amount the client signed, and holds every offer', () => {
    const held = heldDiscounts([
      { id: 'a', name: 'Proposal 5%', type: 'percentage', value: 5, target: 'execution' },
      { id: 'b', name: 'Fee', type: 'percentage', value: 10, target: 'design' },
    ] as any, V1, 'REV-01');
    expect(held[0]).toMatchObject({ type: 'fixed', value: Math.round(V1 * 5) / 100, heldFromPercent: 5, heldAt: 'REV-01' });
    expect(held[1]).toMatchObject({ type: 'percentage', value: 10, heldAt: 'REV-01' });
  });

  it('adds the revision discount as a fixed amount, given in that revision', () => {
    const offer = frozenRevisionDiscount({ name: 'Workshop discount', on: 'added', type: 'percentage', value: 5 }, { added: ADDED, whole: V2 });
    const out = discountsAfterRevision(ctx().financials.discounts, { signedExecution: V1, reference: 'REV-01', number: 1, discount: offer, proposalHeld: true, id: 'x' });
    expect(out).toEqual([
      { id: 'd1', name: 'Special Discount', type: 'fixed', value: 70000, target: 'execution', heldAt: 'REV-01' },
      { id: 'x', name: 'Workshop discount', type: 'fixed', value: 7500, target: 'execution', revision: 1, heldAt: 'REV-01', heldFromPercent: 5 },
    ]);
  });

  it('stops Money re-pricing a held offer against a later version', () => {
    const d: any = { id: 'p', name: '5% off carpentry', type: 'fixed', value: 20000, target: 'execution', basis: { kind: 'part-percent', part: 'carpentry', percent: 5, tierId: 't1' } };
    const split: any = { total: 600000, parts: { carpentry: { value: 600000, lines: [], trades: [] }, functional: { value: 0 }, civil: { value: 0 }, others: { value: 0 } } };
    expect(staleOffer(d, 't1', split)).toBe(30000);
    expect(staleOffer({ ...d, heldAt: 'REV-01' }, 't1', split)).toBeNull();
  });
});

describe('written in Money & Offers or Revision Studio', () => {
  it('sets the offer on the draft only', () => {
    const c = ctx({ scopeRevisions: [
      { id: 'r1', number: 1, status: 'applied' },
      { id: 'r2', number: 2, status: 'draft' },
    ] });
    expect(draftRevision(c)!.id).toBe('r2');
    const o = { name: 'R', on: 'added' as const, type: 'fixed' as const, value: 5000 };
    const next = withRevisionOffer('r2', o)(c);
    expect(next.scopeRevisions![1].offer).toEqual(o);
    expect(withRevisionOffer('r1', o)(c).scopeRevisions![0].offer).toBeUndefined();
    expect(withRevisionOffer('r2', null)(next).scopeRevisions![1].offer).toBeNull();
  });
});

describe('the payment schedule', () => {
  const offer = frozenRevisionDiscount({ name: 'Workshop discount', on: 'added', type: 'percentage', value: 5 }, { added: ADDED, whole: V2 })!;
  const signedIssue = (c: any) => ({
    id: 'iss-sr1', kind: 'scope_revision', reference: 'PAL-REV-01', clientSignature: { name: 'Client', signedAt: 5 },
    snapshot: {
      v1: { total: V1 },
      v2: { total: V2, reference: 'PAL-BQ-v2', version: 2, tierId: 'tier-v2' },
      clientTotals: { ...defaultTotalsOptions(c), proposalHeld: true, revisionDiscount: offer },
    },
  });

  it('applied, takes both discounts off and keeps what was paid', () => {
    const c = ctx({ scopeRevisions: [{ id: 'r1', number: 1, status: 'signed', baseTierId: 'tier-v1', issueId: 'iss-sr1' }] });
    const issue: any = signedIssue(c);
    const out = appliedContext({
      rec: c.scopeRevisions[0], issue, base: { id: 'tier-v1', name: 'Comfort Upgrade', boq: [], summary: {} } as any,
      revisedBoq: [], priced: V2, v1Total: V1, ctx: c, by: 'Anish', at: 100, tierId: 'tier-v2',
    })(c);
    expect(out.financials!.discounts).toHaveLength(2);
    expect(out.financials!.discounts![1]).toMatchObject({ value: 7500, revision: 1 });
    const draft = out.paymentSchedules!.find(s => s.status === 'draft')!;
    const exec = draft.advances.filter((a: any) => a.phase === 'execution');
    expect(exec.reduce((t: number, a: any) => t + a.amount, 0)).toBeCloseTo(V2 - 70000 - 7500, -1);
    /* D1, paid, keeps what it was billed at. */
    expect(draft.advances.find((a: any) => a.advanceCode === 'D1')!.amount).toBe(Math.round(FEE * 0.3));
  });

  it('is previewed in Money with the revision discount before it is applied', () => {
    const c = ctx({
      scopeRevisions: [{ id: 'r1', number: 1, status: 'issued', baseTierId: 'tier-v1', issueId: 'iss-sr1', reference: 'PAL-REV-01' }],
    });
    c.documents = { issues: [{ ...signedIssue(c), clientSignature: undefined }] };
    const rev = pendingRevision(c, [], [])!;
    expect(rev.offer).toMatchObject({ amount: 7500 });
    const p = previewRevisionMoney({ context: c, tierSummary: { totalSell: V1, designFee: FEE }, overrides: { approvedExecutionValue: V1, approvedDesignValue: FEE } }, rev.v2Total, rev.discounts);
    expect(p.taxableNow).toBeCloseTo(V1 - 70000, 2);
    expect(p.taxableRevised).toBeCloseTo(V2 - 77500, 2);
  });
});
