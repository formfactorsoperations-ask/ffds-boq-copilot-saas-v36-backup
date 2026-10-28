/*
  Which figures Money bills, and copies that outlive the option they came from.

  On 1-BHK Kalpataru Expansia the approval had been taken back, so nothing was
  approved, but an approved execution value of ₹10,15,536 was still stored.
  Money's header showed the selected option at ₹9,79,383 while its schedule and
  breakdown billed the leftover ₹10,15,536.
*/
import React, { useMemo, useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

const headerVitals: { current: any[] } = { current: [] };
vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'test-tenant' }, currentRole: 'Super Admin', currentRoles: ['Super Admin'], currentUserAuth: { displayName: 'Priya Shah' } }),
}));
vi.mock('../../contexts/PageHeaderContext', () => ({ usePageHeader: (h: any) => { headerVitals.current = h?.vitals || []; } }));
vi.mock('../../hooks/useStudioSettings', () => ({ useStudioSettings: () => ({ settings: {}, loading: false, updateSettings: vi.fn() }) }));
vi.mock('../../hooks/useZohoBooks', () => ({ useZohoBooks: () => ({ status: null, connected: false, unknown: false, loading: false, refresh: vi.fn(), setStatus: vi.fn(), tenantId: null }) }));
vi.mock('../../services/firebaseClient', () => ({ db: null, functions: null, auth: null, storage: null }));
// Every read the screen makes of the project store answers "nothing".
vi.mock('../../services/dbService', () => ({ db: new Proxy({}, { get: () => async () => [] }) }));
vi.mock('../../services/engagementService', async (orig) => ({ ...(await orig() as any), getPaymentStructure: vi.fn(async () => null), setPaymentStructure: vi.fn() }));
vi.mock('../../components/SuccessWithNextToast', () => ({ showSuccessWithNext: vi.fn() }));

import PaymentCalculatorTab from '../../components/PaymentCalculatorTab';
import TierManager from '../../components/TierManager';
import { billingBase, computeSchedule, contractInForce } from '../../lib/paymentSchedule';
import { calculateProjectFinancials } from '../../lib/financialsUtils';
import { contextWithApproved, contextWithoutApproved } from '../../lib/tierApproval';
import { builtInSpecsFor } from '../../lib/comparison';
import { formatINR } from '../../lib/utils';

afterEach(cleanup);

const option = (id: string, name: string, totalSell: number, designFee: number, extra: any = {}): any => ({
  id, name, timestamp: 1, boq: [],
  summary: { totalSell, designFee, totalRevenue: totalSell + designFee, totalCost: 0, totalGm: 0, itemCount: 25, blendedGm: 25 },
  ...extra,
});
const optimized = option('opt', 'Comfort Upgrade - Optimized', 979383, 97938, { parentTierId: 'com' });
const stale = { approvedExecutionValue: 1015536, approvedDesignValue: 101554 };

describe('billingBase: the contract while one is in force, else the selected option', () => {
  it('nothing approved: the option, whatever is stored', () => {
    expect(billingBase({}, optimized.summary, stale)).toEqual({ execution: 979383, design: 97938, contract: false });
  });
  it('an approved option, a recorded acceptance: the stored contract', () => {
    expect(billingBase({ approvedTierId: 'com' }, optimized.summary, stale)).toEqual({ execution: 1015536, design: 101554, contract: true });
    expect(contractInForce({ proposalAcceptance: { accepted: true } })).toBe(true);
    expect(contractInForce({ proposalAcceptance: { accepted: false } })).toBe(false);
  });
  it('approved but nothing stored yet: the option', () => {
    expect(billingBase({ approvedTierId: 'opt' }, optimized.summary, {})).toMatchObject({ execution: 979383, design: 97938 });
  });
  it('no option to bill: what is stored', () => {
    expect(billingBase({}, undefined, stale)).toMatchObject({ execution: 1015536, design: 101554 });
  });
  it('the schedule and the dashboards follow it', () => {
    const ctx = { financials: stale, paymentMilestones: [{ id: 'e1', type: 'execution', name: 'Advance', percentage: 100 }] };
    const open = computeSchedule({ context: ctx, tierSummary: optimized.summary }).byId.e1.owed;
    const contracted = computeSchedule({ context: { ...ctx, approvedTierId: 'com' }, tierSummary: optimized.summary }).byId.e1.owed;
    expect(open / contracted).toBeCloseTo(979383 / 1015536, 6);
    expect((calculateProjectFinancials({ financials: stale }, optimized) as any).grossExecution).toBe(979383);
    expect((calculateProjectFinancials({ financials: stale, approvedTierId: 'com' }, optimized) as any).grossExecution).toBe(1015536);
  });
});

describe('Money on a project with nothing approved', () => {
  it('bills the selected option, in the header and the breakdown alike', () => {
    render(<PaymentCalculatorTab projectContext={{ name: 'Kalpataru', financials: stale } as any} setProjectContext={vi.fn() as any}
      activeTier={optimized} tiers={[optimized]} projectId="p1" />);
    const exec = headerVitals.current.find((v: any) => v.label === 'EXECUTION');
    expect(exec.value).toBe(formatINR(979383));
    expect(screen.queryAllByText(/10,15,536/)).toHaveLength(0);
  });

  it('with an option approved, bills the contract in the header too', () => {
    render(<PaymentCalculatorTab projectContext={{ name: 'Kalpataru', approvedTierId: 'opt', financials: stale } as any} setProjectContext={vi.fn() as any}
      activeTier={optimized} tiers={[optimized]} projectId="p1" />);
    expect(headerVitals.current.find((v: any) => v.label === 'EXECUTION').value).toBe(formatINR(1015536));
  });
});

describe('taking back the only approval clears the approved values', () => {
  it('so nothing is left behind to bill', () => {
    const a = option('a', 'A', 500000, 50000);
    const booked = contextWithApproved({ name: 'Flat', financials: { billablePercent: 100, discounts: [] } } as any, a, [a], 1);
    const undone: any = contextWithoutApproved(booked, [a]);
    expect(undone.financials).not.toHaveProperty('approvedExecutionValue');
    expect(undone.financials).not.toHaveProperty('approvedDesignValue');
    expect(undone.financials.billablePercent).toBe(100);
  });
});

/* Copies after the option they were copied from is deleted. */
function Tiers({ initial, probe }: { initial: any[]; probe?: (t: any[]) => void }) {
  const [tiers, setTiers] = useState<any[]>(initial);
  const [ctx, setCtx] = useState<any>({ name: 'Flat', area: 465 });
  const [active, setActive] = useState<string | null>(initial[0].id);
  probe?.(tiers);
  return <TierManager tiers={tiers} setTiers={setTiers as any} activeTierId={active} setActiveTierId={setActive}
    projectContext={ctx} setProjectContext={setCtx} bank={[]} setActiveTab={() => undefined} />;
}

/* The option names listed in the Options & Versions rail. */
const railNames = () => Array.from(document.querySelectorAll('p[title="Double-click to rename"]')).map(p => p.textContent);

describe('deleting the option a copy was made from', () => {
  const com = option('com', 'Comfort Upgrade', 907236, 90724);
  const copy = option('copy', 'Comfort Upgrade - Optimized', 979383, 97938, { parentTierId: 'com' });
  const grandchild = option('gc', 'Comfort Upgrade - Optimized (Copy)', 979383, 97938, { parentTierId: 'copy' });

  it('keeps the copy in the rail, as an option of its own, with the original\'s built-in specs', () => {
    let tiers: any[] = [];
    render(<Tiers initial={[com, copy, grandchild]} probe={t => { tiers = t; }} />);
    expect(railNames()).toEqual(['Comfort Upgrade', 'Comfort Upgrade - Optimized', 'Comfort Upgrade - Optimized (Copy)']);
    fireEvent.click(screen.getByTitle('Delete Option'));
    expect(railNames()).toEqual(['Comfort Upgrade - Optimized', 'Comfort Upgrade - Optimized (Copy)']);
    const kept = tiers.find(t => t.id === 'copy');
    expect(kept).not.toHaveProperty('parentTierId');
    expect(kept.specsFrom).toBe('Comfort Upgrade');
    expect(tiers.find(t => t.id === 'gc').parentTierId).toBe('copy');
    expect(builtInSpecsFor(kept, tiers)).toBe(builtInSpecsFor(com, [com]));
  });

  it('re-attaches a copy of a copy to the deleted option\'s own parent', () => {
    let tiers: any[] = [];
    render(<Tiers initial={[copy, com, grandchild]} probe={t => { tiers = t; }} />);
    fireEvent.click(screen.getByTitle('Delete Option'));
    expect(tiers.find(t => t.id === 'gc').parentTierId).toBe('com');
    expect(railNames()).toEqual(['Comfort Upgrade', 'Comfort Upgrade - Optimized (Copy)']);
  });

  it('shows copies whose original was deleted before this fix', () => {
    render(<Tiers initial={[option('x', 'Orphan', 1, 0, { parentTierId: 'gone' }), com]} />);
    expect(railNames()).toEqual(['Orphan', 'Comfort Upgrade']);
  });
});
