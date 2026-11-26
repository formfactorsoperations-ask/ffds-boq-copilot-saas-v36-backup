// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import WeeklyPulseDashboard from '../../components/ops/WeeklyPulseDashboard';
import { paymentsReceivedIn } from '../../lib/paymentsReceived';
import { computeSchedule } from '../../lib/paymentSchedule';
import { formatINR } from '../../lib/utils';

/*
  The pulse found payments by `paymentSchedules[].advances[].receivedAt`, which
  every generator writes as null, so it never showed one. It reads the
  milestones now: paid, on `paidDate` (or the invoice date for older ones),
  priced by computeSchedule as Money prices them.
*/

const tierSummary = { totalSell: 1000000, designFee: 100000 };

const context: any = {
  name: 'Pulse Test',
  gstRate: 18,
  financials: {
    initiationFeePaid: 0,
    billablePercent: 100,
    designBillablePercent: 100,
    executionGstEnabled: true,
    designGstEnabled: true,
    taxLimitYearly: 0,
    discounts: [],
  },
  /*
    A schedule the old code read: its received date is null, as every
    generator writes it. Nothing from here may show.
  */
  paymentSchedules: [{ advances: [{ advanceCode: 'A1', label: 'Old advance', amount: 1, percentage: 1, receivedAt: null }] }],
  paymentMilestones: [
    { id: 'd1', type: 'design', name: 'Design booking', percentage: 50, description: '', status: 'paid', invoiceDate: '2026-11-10', paidDate: '2026-11-24' },
    { id: 'd2', type: 'design', name: 'Design drawings', percentage: 50, description: '', status: 'paid', invoiceDate: '2026-11-25' },
    { id: 'e1', type: 'execution', name: 'Execution mobilisation', percentage: 40, description: '', status: 'paid', invoiceDate: '2026-10-01', paidDate: '2026-11-03' },
    { id: 'e2', type: 'execution', name: 'Execution midway', percentage: 30, description: '', status: 'invoiced', invoiceDate: '2026-11-24' },
    { id: 'e3', type: 'execution', name: 'Execution handover', percentage: 30, description: '', status: 'pending' },
  ],
};

/* Thursday 26 November 2026: the week runs Monday 23 to Sunday 29. */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-26T11:00:00'));
});
afterAll(() => { vi.useRealTimers(); });
afterEach(cleanup);

const owed = (id: string) => computeSchedule({ context, tierSummary }).byId[id].owed;

describe('payments received in a week', () => {
  const start = new Date('2026-11-23T00:00:00');
  const end = new Date('2026-11-29T23:59:59.999');

  it('takes paid milestones by their received date, at the amount Money shows', () => {
    const got = paymentsReceivedIn(context, start, end, tierSummary);
    const d1 = got.find((p) => p.id === 'd1');
    expect(d1).toBeTruthy();
    expect(d1!.amount).toBe(owed('d1'));
    /* Half the 1,00,000 design fee, with 18% GST. */
    expect(d1!.amount).toBe(59000);
    expect(d1!.fromInvoiceDate).toBe(false);
  });

  it('falls back to the invoice date for a payment with no received date, as Reports does', () => {
    const d2 = paymentsReceivedIn(context, start, end, tierSummary).find((p) => p.id === 'd2');
    expect(d2).toBeTruthy();
    expect(d2!.fromInvoiceDate).toBe(true);
  });

  it('leaves out payments received in another week and invoices not yet paid', () => {
    const ids = paymentsReceivedIn(context, start, end, tierSummary).map((p) => p.id);
    expect(ids).not.toContain('e1');
    expect(ids).not.toContain('e2');
    expect(ids).not.toContain('e3');
  });
});

describe('the weekly pulse', () => {
  it('shows a milestone paid in the selected week, with its amount', () => {
    render(<WeeklyPulseDashboard projectContext={context} tierSummary={tierSummary} />);
    expect(screen.getByText('Payment Cleared: Design booking')).toBeTruthy();
    expect(screen.getByText(`Received ${formatINR(owed('d1'))}.`)).toBeTruthy();
    expect(screen.getByText(`Received ${formatINR(59000)}.`)).toBeTruthy();
  });

  it('does not show a payment received in another week, or the empty schedule advance', () => {
    render(<WeeklyPulseDashboard projectContext={context} tierSummary={tierSummary} />);
    expect(screen.queryByText(/Execution mobilisation/)).toBeNull();
    expect(screen.queryByText(/Old advance/)).toBeNull();
  });
});
