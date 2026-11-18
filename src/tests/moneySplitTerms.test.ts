import { describe, it, expect } from 'vitest';
import { computeSchedule, resolveFinancials, gstOn, gstNoteFor, gstTermsOf } from '../../lib/paymentSchedule';

/*
  Palacia – 3BHK, as the Money screen shows it: a design fee of ₹1,69,733 and
  execution of ₹14,14,441 less a ₹70,000 discount, billed 50% with GST.
  Sign-up & Concept is paid; everything else is to come.
*/
const ctx = (fin: any = {}, ms?: any[]): any => ({
  name: 'Palacia',
  approvedTierId: 't1',
  gstRate: 18,
  financials: {
    approvedExecutionValue: 1414441,
    approvedDesignValue: 169733,
    billablePercent: 50,
    executionGstEnabled: true,
    designGstEnabled: true,
    initiationFeePaid: 0,
    discounts: [{ id: 'd', name: 'Discount', type: 'fixed', value: 70000, target: 'execution' }],
    ...fin,
  },
  paymentMilestones: ms || [
    { id: 'd1', name: 'Sign-up & Concept', type: 'design', percentage: 25, status: 'paid', lockedTaxableBase: 169733 },
    { id: 'd2', name: 'Design Development', type: 'design', percentage: 34, status: 'pending' },
    { id: 'd3', name: 'Final Drawings', type: 'design', percentage: 41, status: 'pending' },
    { id: 'e1', name: 'Material Order Advance', type: 'execution', percentage: 37, status: 'pending' },
    { id: 'e2', name: 'Handover', type: 'execution', percentage: 63, status: 'pending' },
  ],
});

describe('the design fee can be part billed without GST', () => {
  it('an older record with no design share bills all of it with GST, as before', () => {
    expect(resolveFinancials({ billablePercent: 50 }).designBillablePercent).toBe(100);
    const s = computeSchedule({ context: ctx() });
    expect(Math.round(s.totals.gstOnDesign)).toBe(30552);
    expect(Math.abs(s.totals.grossProjectValue - 1665725)).toBeLessThanOrEqual(1);
    expect(s.byId.d2.cash).toBe(0);
  });

  it('a 70% design share splits the unpaid design milestones into GST and cash', () => {
    const s = computeSchedule({ context: ctx({ designBillablePercent: 70 }) });
    const d2 = s.byId.d2;
    expect(d2.billable + d2.cash).toBe(d2.base);
    expect(d2.billable).toBe(Math.round(d2.base * 0.7));
    expect(d2.gst).toBe(Math.round(d2.billable * 0.18));
    expect(d2.owed).toBe(d2.invoiceTotal + d2.cash);
    expect(Math.round(s.totals.gstOnDesign)).toBe(Math.round(169733 * 0.7 * 0.18));
  });

  it('the documents\' GST and note follow the design share', () => {
    const terms = gstTermsOf(ctx({ designBillablePercent: 60 }));
    expect(terms.designBillablePercent).toBe(60);
    expect(Math.round(gstOn(0, 100000, terms).design)).toBe(10800);
    expect(gstNoteFor(terms)).toContain('60% of Professional/Design Fees');
    expect(gstNoteFor(gstTermsOf(ctx()))).toContain('on Professional/Design Fees and');
  });
});

describe('an invoice keeps the split it went out at', () => {
  const lockedMs = [
    { id: 'e1', name: 'Material Order Advance', type: 'execution', percentage: 40, status: 'invoiced', lockedTaxableBase: 1344441, lockedBillablePercent: 50, lockedGstRate: 18 },
    { id: 'e2', name: 'Carcass', type: 'execution', percentage: 60, status: 'pending' },
  ];

  it('moving the split to 100% leaves the invoiced milestone alone and re-prices the rest', () => {
    const before = computeSchedule({ context: ctx({}, lockedMs) });
    const after = computeSchedule({ context: ctx({ billablePercent: 100 }, lockedMs) });
    expect(after.byId.e1.gst).toBe(before.byId.e1.gst);
    expect(after.byId.e1.cash).toBe(before.byId.e1.cash);
    expect(after.byId.e1.owed).toBe(before.byId.e1.owed);
    expect(after.byId.e2.cash).toBe(0);
    expect(after.byId.e2.gst).toBeGreaterThan(before.byId.e2.gst);
  });

  it('turning GST off leaves the GST on an invoice already raised', () => {
    const after = computeSchedule({ context: ctx({ executionGstEnabled: false }, lockedMs) });
    expect(after.byId.e1.gst).toBeGreaterThan(0);
    expect(after.byId.e2.gst).toBe(0);
  });

  it('an invoice raised before the split was recorded still follows the current terms', () => {
    const legacy = lockedMs.map(m => ({ ...m, lockedBillablePercent: undefined, lockedGstRate: undefined }));
    const after = computeSchedule({ context: ctx({ billablePercent: 100 }, legacy) });
    expect(after.byId.e1.cash).toBe(0);
  });
});

describe('a fixed amount comes first and the % milestones share the rest', () => {
  it('keeps the track whole', () => {
    const ms = [
      { id: 'e1', name: 'Advance', type: 'execution', percentage: 50, status: 'pending' },
      { id: 'e2', name: 'Carcass', type: 'execution', percentage: 50, status: 'pending' },
      { id: 'e3', name: 'Handover', type: 'execution', percentage: 7, status: 'pending', isFixedAmount: true, fixedAmount: 100000 },
    ];
    const s = computeSchedule({ context: ctx({}, ms) });
    expect(s.byId.e3.base).toBe(100000);
    const base = s.byId.e1.base + s.byId.e2.base + s.byId.e3.base;
    expect(Math.abs(base - 1344441)).toBeLessThanOrEqual(1);
  });
});
