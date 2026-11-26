/*
  The Money board on the real Money screen (components/PaymentCalculatorTab):
  design and execution side by side, a tax change previewed before it is
  applied, and the milestone editor saving a fixed amount.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'test-tenant' }, currentRole: 'Super Admin', currentRoles: ['Super Admin'], currentUserAuth: { displayName: 'Test' } }),
}));
vi.mock('../../contexts/PageHeaderContext', () => ({ usePageHeader: () => undefined }));
vi.mock('../../hooks/useStudioSettings', () => ({ useStudioSettings: () => ({ settings: {}, loading: false, updateSettings: vi.fn() }) }));
vi.mock('../../hooks/useZohoBooks', () => ({ useZohoBooks: () => ({ status: null, connected: false, unknown: false, loading: false, refresh: vi.fn(), setStatus: vi.fn(), tenantId: null }) }));
vi.mock('../../services/firebaseClient', () => ({ db: null, functions: null, auth: null, storage: null }));
vi.mock('../../services/dbService', () => ({ db: new Proxy({}, { get: () => async () => [] }) }));
vi.mock('../../services/engagementService', async (orig) => ({ ...(await orig() as any), getPaymentStructure: vi.fn(async () => null), setPaymentStructure: vi.fn() }));
vi.mock('../../components/SuccessWithNextToast', () => ({ showSuccessWithNext: vi.fn() }));

import PaymentCalculatorTab from '../../components/PaymentCalculatorTab';

afterEach(cleanup);

const tier: any = { id: 't1', name: 'Comfort Upgrade', timestamp: 1, boq: [], summary: { totalSell: 1414441, designFee: 169733, totalRevenue: 1584174, totalCost: 0, totalGm: 0, itemCount: 10, blendedGm: 25 } };
const start: any = {
  name: 'Palacia', approvedTierId: 't1', gstRate: 18,
  financials: {
    approvedExecutionValue: 1414441, approvedDesignValue: 169733, billablePercent: 50,
    executionGstEnabled: true, designGstEnabled: true, initiationFeePaid: 0, taxLimitYearly: 2000000,
    discounts: [{ id: 'd', name: 'Discount', type: 'fixed', value: 70000, target: 'execution' }],
    paymentRevisions: [{ id: 'r0', date: '2026-11-01', reason: 'Kept on save' }],
  },
  paymentMilestones: [
    { id: 'd1', type: 'design', name: 'Sign-up & Concept', percentage: 25, status: 'paid', lockedTaxableBase: 169733 },
    { id: 'd2', type: 'design', name: 'Design Development', percentage: 34, status: 'pending' },
    { id: 'd3', type: 'design', name: 'Final Drawings', percentage: 41, status: 'pending' },
    { id: 'e1', type: 'execution', name: 'Material Order Advance', percentage: 37, status: 'pending' },
    { id: 'e2', type: 'execution', name: 'Carcass & False Ceiling', percentage: 30, status: 'pending' },
    { id: 'e3', type: 'execution', name: 'Finishes & Fittings', percentage: 25, status: 'pending' },
    { id: 'e4', type: 'execution', name: 'Handover', percentage: 8, status: 'pending' },
  ],
};

let latest: any = null;
function Host() {
  const [ctx, setCtx] = useState<any>(start);
  latest = ctx;
  return <PaymentCalculatorTab projectContext={ctx} setProjectContext={setCtx as any} activeTier={tier} tiers={[tier]} projectId="p1" />;
}

describe('Money opens on the milestones, side by side', () => {
  it('shows both tracks, each with its tax plate', () => {
    render(<Host />);
    expect(screen.getByRole('heading', { name: 'Design' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Execution' })).toBeTruthy();
    expect(screen.getAllByText('Taxable share')).toHaveLength(2);
    expect(screen.getAllByText('Material Order Advance')).toHaveLength(2); // its summary row and its card
    expect(screen.getByText('Contract breakdown and tax tools')).toBeTruthy();
    // The milestones at a glance, one table per track, above the cards.
    const design = screen.getByRole('heading', { name: 'Design milestones' }).closest('section')!;
    expect(within(design).getAllByRole('row')).toHaveLength(5); // header, 3 milestones, total
    expect(within(design).getByText('Sign-up & Concept')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Execution milestones' })).toBeTruthy();
  });
});

describe('a tax change is previewed, then applied', () => {
  it('previews a 70% design share and keeps it in History when applied', async () => {
    vi.useFakeTimers();
    render(<Host />);
    const design = screen.getByRole('radiogroup', { name: 'Design taxable share' });
    fireEvent.click(within(design).getByRole('radio', { name: '70%' }));
    expect(screen.getByText('Previewing a change. Nothing is saved yet.')).toBeTruthy();
    // Sign-up & Concept is paid, so a reason is asked for.
    fireEvent.change(screen.getByLabelText('Why the tax terms are changing'), { target: { value: 'Client asked for part cash' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply to the schedule/ }));
    await act(async () => { vi.advanceTimersByTime(700); });
    vi.useRealTimers();
    expect(latest.financials.designBillablePercent).toBe(70);
    expect(latest.financials.scheduleChanges).toHaveLength(1);
    expect(latest.financials.scheduleChanges[0].changes).toEqual(['Design taxable share 100% → 70%']);
    // The save merges: the revision log is still there.
    expect(latest.financials.paymentRevisions).toHaveLength(1);
  });
});

describe('the milestone editor', () => {
  it('saves a fixed handover amount and keeps the track whole', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit milestones' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit milestones' });
    const rows = within(dialog).getAllByRole('radiogroup', { name: 'Bill by' });
    // The last execution row is Handover: switch it to a fixed amount.
    fireEvent.click(within(rows[rows.length - 1]).getByRole('radio', { name: '₹' }));
    const amount = within(dialog).getAllByLabelText('Amount before GST');
    fireEvent.change(amount[amount.length - 1], { target: { value: '100000' } });
    const balance = within(dialog).queryAllByRole('button', { name: /Auto-balance/ });
    balance.forEach(b => fireEvent.click(b));
    fireEvent.change(within(dialog).getByPlaceholderText(/For example/), { target: { value: 'Fixed handover payment' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Save changes/ }));
    const handover = latest.paymentMilestones.find((m: any) => m.id === 'e4');
    expect(handover.isFixedAmount).toBe(true);
    expect(handover.fixedAmount).toBe(100000);
    expect(latest.financials.scheduleChanges.at(-1).reason).toBe('Fixed handover payment');
    expect(screen.queryByRole('dialog', { name: 'Edit milestones' })).toBeNull();
  });
});

describe('quick schedule', () => {
  it('reshapes the unbilled stages around the paid one and saves them when approved', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick schedule' }));
    const dialog = screen.getByRole('dialog', { name: 'Quick schedule' });
    // Sign-up & Concept is paid: it is locked, and the reason is asked for.
    expect(within(dialog).getByText(/Paid and invoiced stages are locked/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /Even/ }));
    expect(within(dialog).getByTestId('share-Design Development').textContent).toBe('38%');
    expect(within(dialog).getByTestId('share-Final Drawings').textContent).toBe('37%');
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'More for Material Order Advance' })[0]);
    expect(within(dialog).getByTestId('share-Material Order Advance').textContent).toBe('26%');
    const approve = within(dialog).getByRole('button', { name: /Approve as payment schedule/ });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByPlaceholderText(/For example/), { target: { value: 'Even split agreed' } });
    fireEvent.click(approve);
    const byId = Object.fromEntries(latest.paymentMilestones.map((m: any) => [m.id, m]));
    expect(byId.d1.percentage).toBe(25);
    expect([byId.d2.percentage, byId.d3.percentage]).toEqual([38, 37]);
    expect([byId.e1.percentage, byId.e2.percentage, byId.e3.percentage, byId.e4.percentage]).toEqual([26, 24, 25, 25]);
    expect(latest.financials.scheduleChanges.at(-1).reason).toBe('Even split agreed');
    expect(screen.queryByRole('dialog', { name: 'Quick schedule' })).toBeNull();
  });

  it('adds a stage by splitting one, with its steps, and hands the draft to Edit milestones', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick schedule' }));
    const dialog = screen.getByRole('dialog', { name: 'Quick schedule' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add False ceiling' }));
    // The biggest execution stage (Material Order Advance, 37%) gives half.
    expect(within(dialog).getByTestId('share-Material Order Advance').textContent).toBe('19%');
    expect(within(dialog).getByTestId('share-False ceiling').textContent).toBe('18%');
    fireEvent.click(within(dialog).getByRole('button', { name: /Fine-tune first/ }));
    const editor = screen.getByRole('dialog', { name: 'Edit milestones' });
    expect(within(editor).getByDisplayValue('False ceiling')).toBeTruthy();
  });
});

describe('going back to an earlier schedule', () => {
  it('restores the schedule from before a change, shows it first, and keeps the paid stage billed', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick schedule' }));
    let dialog = screen.getByRole('dialog', { name: 'Quick schedule' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Even/ }));
    fireEvent.change(within(dialog).getByPlaceholderText(/For example/), { target: { value: 'Even split' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Approve as payment schedule/ }));
    expect(latest.paymentMilestones.find((m: any) => m.id === 'e1').percentage).toBe(25);
    expect(latest.financials.scheduleChanges.at(-1).snapshot.find((m: any) => m.id === 'e1').percentage).toBe(37);

    fireEvent.click(screen.getByRole('radio', { name: /History/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Restore the schedule from before this change/ })[0]);
    dialog = screen.getByRole('dialog', { name: 'Edit milestones' });
    expect(within(dialog).getByText(/Restoring the schedule from before the change/)).toBeTruthy();
    fireEvent.change(within(dialog).getByPlaceholderText(/For example/), { target: { value: 'Client preferred the old split' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Save changes/ }));
    const byId = Object.fromEntries(latest.paymentMilestones.map((m: any) => [m.id, m]));
    expect([byId.e1.percentage, byId.e2.percentage, byId.e3.percentage, byId.e4.percentage]).toEqual([37, 30, 25, 8]);
    expect(byId.d1.status).toBe('paid');
    const last = latest.financials.scheduleChanges.at(-1);
    expect(last.changes[0]).toMatch(/^Restored the schedule from before the change/);
    expect(last.reason).toBe('Client preferred the old split');
    // The restore itself can be undone.
    expect(last.snapshot.find((m: any) => m.id === 'e1').percentage).toBe(25);
  });
});
