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
  it('works out the stages from typed milestones and saves them when approved', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick schedule' }));
    const dialog = screen.getByRole('dialog', { name: 'Quick schedule' });
    fireEvent.change(within(dialog).getByLabelText('Your milestones'), { target: { value: 'Design: 3D & layouts, GFC drawings\nExecution: Material advance 40%, Civil & carcass, Finishing, Handover' } });
    expect(within(dialog).getByText('GFC drawings')).toBeTruthy();
    // Sign-up & Concept is paid: it stays, and the reason is asked for.
    expect(within(dialog).getByText('Paid, kept')).toBeTruthy();
    const approve = within(dialog).getByRole('button', { name: /Approve as payment schedule/ });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByPlaceholderText(/For example/), { target: { value: 'New stages agreed' } });
    fireEvent.click(approve);
    const names = latest.paymentMilestones.map((m: any) => m.name);
    expect(names).toEqual(['Sign-up & Concept', '3D & layouts', 'GFC drawings', 'Material advance', 'Civil & carcass', 'Finishing', 'Handover']);
    const design = latest.paymentMilestones.filter((m: any) => m.type === 'design');
    expect(design.reduce((s: number, m: any) => s + m.percentage, 0)).toBe(100);
    expect(latest.paymentMilestones.find((m: any) => m.name === 'Handover').subSteps.length).toBeGreaterThan(0);
    expect(latest.financials.scheduleChanges.at(-1).reason).toBe('New stages agreed');
    expect(screen.queryByRole('dialog', { name: 'Quick schedule' })).toBeNull();
  });

  it('hands the draft to Edit milestones to fine-tune first', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick schedule' }));
    const dialog = screen.getByRole('dialog', { name: 'Quick schedule' });
    fireEvent.change(within(dialog).getByLabelText('Your milestones'), { target: { value: 'Execution: Material, Woodwork, Handover' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Fine-tune first/ }));
    const editor = screen.getByRole('dialog', { name: 'Edit milestones' });
    expect(within(editor).getByDisplayValue('Woodwork')).toBeTruthy();
    expect(within(editor).getByDisplayValue('Design Development')).toBeTruthy();
  });
});
