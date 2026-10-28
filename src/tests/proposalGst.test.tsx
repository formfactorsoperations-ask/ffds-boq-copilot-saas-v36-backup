/*
  GST on the proposal, as Money bills it.

  Lodha Splendora bills 30% of execution officially ("30% GST / 70% Cash").
  Money charged ₹56,176 of GST on execution; the proposal charged ₹1,87,255 —
  18% on all of it — because it worked GST out on its own.
*/
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 't', orgName: 'Test Studio' }, currentRole: 'Super Admin', currentRoles: ['Super Admin'], currentUserAuth: { displayName: 'Anish K' } }),
}));

import ClientSnapshot, { ledgerFor } from '../../components/client/ClientSnapshot';
import { ClientBookletProposal } from '../../components/client/ClientBookletProposal';
import { computeSchedule, gstTermsOf, gstOn, gstNoteFor, executionGstLabel } from '../../lib/paymentSchedule';
import { formatCurrency, formatINR } from '../../lib/utils';

afterEach(cleanup);

// Lodha Splendora - 2.5 BHK, Comfort Upgrade.
const EXEC = 1040306;
const DESIGN = 124837;
const lodha = (over: any = {}) => ({
  name: 'Lodha Splendora - 2.5 BHK', gstRate: 18,
  financials: { billablePercent: 30, executionGstEnabled: true, designGstEnabled: true, discounts: [], ...over },
});

describe('gstOn: execution GST on the billable share only', () => {
  it('30% billable: 18% on 30% of execution, design fee in full', () => {
    const g = gstOn(EXEC, DESIGN, gstTermsOf(lodha()));
    expect(g.execution).toBeCloseTo(EXEC * 0.3 * 0.18, 6);
    expect(g.design).toBeCloseTo(DESIGN * 0.18, 6);
    expect(g.potentialExecution).toBeCloseTo(EXEC * 0.18, 6);
    expect(g.executionWaived).toBe(false);
  });

  it('switched off, or all cash: nothing on execution, shown as waived', () => {
    expect(gstOn(EXEC, DESIGN, gstTermsOf(lodha({ executionGstEnabled: false })))).toMatchObject({ execution: 0, executionWaived: true });
    expect(gstOn(EXEC, DESIGN, gstTermsOf(lodha({ billablePercent: 0 })))).toMatchObject({ execution: 0, executionWaived: true });
  });

  it('design GST off is honoured', () => {
    expect(gstOn(EXEC, DESIGN, gstTermsOf(lodha({ designGstEnabled: false }))).design).toBe(0);
  });

  it('reads the switches the way Money does: a stored record without the execution flag is off', () => {
    expect(gstTermsOf({ financials: { billablePercent: 100 } }).executionGst).toBe(false);
    expect(gstTermsOf({}).executionGst).toBe(true);
  });

  it('is exactly what the payment schedule bills', () => {
    const ctx = { ...lodha(), paymentMilestones: [{ id: 'e1', type: 'execution', name: 'Advance', percentage: 100 }] };
    const schedule = computeSchedule({ context: ctx, tierSummary: { totalSell: EXEC, designFee: DESIGN } });
    const ledger = ledgerFor(EXEC, DESIGN, [], gstTermsOf(ctx));
    expect(ledger.chargedGstOnExecution).toBeCloseTo(schedule.totals.gstOnExecution, 6);
    expect(ledger.gstOnDesign).toBeCloseTo(schedule.totals.gstOnDesign, 6);
  });
});

describe('the proposal shows it', () => {
  it('Investment Summary: GST on execution at 18% of the billable 30%, and a total to match', () => {
    render(<ClientSnapshot level="LEVEL_2" investmentMin={EXEC} investmentMax={EXEC} timelinePhases={[]}
      designFee={DESIGN} executionTotal={EXEC} projectContext={lodha() as any} option={{ label: 'Option A', name: 'Comfort Upgrade' }} />);
    const execGst = EXEC * 0.3 * 0.18;
    expect(screen.getByText('4. GST on Execution (18% on the billable 30%)')).toBeTruthy();
    expect(screen.getAllByText(formatCurrency(execGst)).length).toBeGreaterThan(0);
    expect(screen.queryByText(formatCurrency(EXEC * 0.18))).toBeNull();
  });

  it('Luxe Booklet: the commercial summary\'s GST is the same', () => {
    const tier: any = { id: 'com', name: 'Comfort Upgrade', timestamp: 1, boq: [], fullBoq: [], summary: { totalSell: EXEC, designFee: DESIGN, totalRevenue: EXEC + DESIGN } };
    render(<ClientBookletProposal termsOnly tiers={[tier]} projectContext={lodha() as any} timelinePhases={[]} paymentMilestones={[]} level="LEVEL_1" settings={{ companyName: 'Test Studio' }} isClientViewOnly />);
    const gstRow = screen.getByText('Applicable GST').closest('tr')!;
    expect(gstRow.textContent).toContain(formatINR(EXEC * 0.3 * 0.18 + DESIGN * 0.18));
  });

  it('the GST note says what is invoiced', () => {
    expect(gstNoteFor(gstTermsOf(lodha()))).toBe('GST @ 18% applicable on Professional/Design Fees and on the 30% of execution invoiced; the remaining 70% is billed net of taxes (Vendor Direct / Cash).');
    expect(gstNoteFor(gstTermsOf(lodha({ billablePercent: 100 })))).toBe('GST @ 18% applicable on all invoices.');
    expect(gstNoteFor(gstTermsOf(lodha({ executionGstEnabled: false })))).toContain('only on Professional/Design Fees');
    expect(executionGstLabel(gstTermsOf(lodha({ billablePercent: 100 })))).toBe('GST on Execution (18%)');
  });
});
