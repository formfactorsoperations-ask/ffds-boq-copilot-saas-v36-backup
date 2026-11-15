/*
  Pricing & Tiers, side by side: every option's price, margin, parts, offers,
  milestones and thin lines in one row, with Edit BOQ and Offers on each.
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { buildBankMap } from '../../lib/boqPricing';
import { dealFor, lowMarginLines } from '../../lib/offers';
import OptionColumns from '../../components/pricing/OptionColumns';
import BoqSlideOver from '../../components/pricing/BoqSlideOver';

afterEach(cleanup);

const item = (id: string, name: string, cat: string, materials: number, margin: number) => ({ id, name, cat, unit: 'sqft', materials, labor: 0, margin }) as any;
const BANK = [item('w', 'Wardrobe', 'Carpentry', 1000, 0), item('p', 'Wall paint', 'Painting', 100, 0), item('t', 'Tiling', 'Civil', 300, 20)];
const line = (id: string, bankId: string, qty: number, roomId: string, extra: any = {}) => ({ id, bankId, qty, roomId, ...extra });
const tier = (id: string, name: string, boq: any[], sell: number, fee: number, cost: number) =>
  ({ id, name, timestamp: 1, boq, summary: { totalSell: sell, totalCost: cost, totalGm: 0, itemCount: boq.length, totalRevenue: sell + fee, designFee: fee, blendedGm: ((sell - cost) / sell) * 100 } }) as any;

const TIERS = [
  tier('ess', 'Essential', [line('1', 'w', 10, 'Bed'), line('2', 'p', 10, 'Functional')], 11000, 1000, 9000),
  tier('com', 'Comfort', [line('3', 'w', 12, 'Bed'), line('4', 'p', 10, 'Functional'), line('5', 't', 5, 'Civil')], 14800, 1200, 11500),
];
const CTX: any = {
  area: 500, approvedTierId: null,
  financials: { executionGstEnabled: true, designGstEnabled: true, billablePercent: 100, discounts: [
    { id: 'o1', name: '5% off carpentry', type: 'fixed', target: 'execution', value: 600, basis: { kind: 'part-percent', part: 'carpentry', percent: 5, tierId: 'com' } },
  ] },
  paymentMilestones: [{ id: 'm1', name: 'Booking', type: 'design', percentage: 100 }, { id: 'm2', name: 'Material advance', type: 'execution', percentage: 100 }],
};

describe('Shared figures', () => {
  it('works out the deal the same way Money & Offers does', () => {
    const d = dealFor({ totalSell: 10000, designFee: 1000, totalCost: 8000 }, [{ id: 'x', name: 'x', type: 'fixed', value: 1000, target: 'execution' }], { rate: 18, billablePercent: 100, executionGst: true, designGst: true });
    expect(d.clientPays).toBe(11800); // (9,000 + 1,000) × 1.18
    expect(d.margin.after).toBeCloseTo(11.11, 1);
  });
  it('counts lines priced under 15% margin', () => {
    expect(lowMarginLines(TIERS[1], buildBankMap(BANK))).toBe(2);
    expect(lowMarginLines({ boq: [line('x', 't', 1, 'Civil')] } as any, buildBankMap(BANK))).toBe(0);
  });
});

describe('Options side by side', () => {
  const setup = () => {
    const setActive = vi.fn(); const onEditBoq = vi.fn(); const onOffers = vi.fn();
    render(<OptionColumns tiers={TIERS} bank={BANK} projectContext={CTX} activeTierId="com" setActiveTierId={setActive} onEditBoq={onEditBoq} onOffers={onOffers} />);
    return { setActive, onEditBoq, onOffers };
  };

  it('shows a column per option, with its price, split, offers and milestones', () => {
    setup();
    const com = screen.getByRole('article', { name: 'Comfort' });
    expect(within(com).getByText('₹ 16,000')).toBeTruthy();          // 14,800 work + 1,200 fee
    expect(within(com).getByTestId('option-split').textContent).toContain('work ₹ 14,800');
    expect(within(com).getByText('Carpentry')).toBeTruthy();
    expect(within(com).getByText('5% off carpentry')).toBeTruthy();
    expect(within(com).getByText('Material advance')).toBeTruthy();
    expect(within(com).getByText(/2 lines under 15% margin/)).toBeTruthy();
    expect(within(com).getByText('Selected')).toBeTruthy();
    // An offer priced on Comfort is not shown on Essential.
    expect(within(screen.getByRole('article', { name: 'Essential' })).queryByText('5% off carpentry')).toBeNull();
  });

  it('edits an option’s BOQ, opens its offers, and selects it', () => {
    const { setActive, onEditBoq, onOffers } = setup();
    const ess = screen.getByRole('article', { name: 'Essential' });
    fireEvent.click(within(ess).getByRole('button', { name: /Edit BOQ/ }));
    expect(onEditBoq).toHaveBeenCalledWith('ess');
    fireEvent.click(within(ess).getByRole('button', { name: /Offers/ }));
    expect(onOffers).toHaveBeenCalledWith('ess');
    fireEvent.click(within(ess).getByRole('button', { name: 'Essential' }));
    expect(setActive).toHaveBeenCalledWith('ess');
  });

  it('hides milestones once a contract is signed', () => {
    render(<OptionColumns tiers={TIERS} bank={BANK} projectContext={{ ...CTX, approvedTierId: 'ess' }} activeTierId="ess" setActiveTierId={() => undefined} />);
    expect(screen.queryByText('Material advance')).toBeNull();
    expect(within(screen.getByRole('article', { name: 'Essential' })).getByText('Approved')).toBeTruthy();
  });
});

describe('BOQ slide-over', () => {
  it('shows the option’s editor over the screen and closes with Done or Esc', () => {
    const onClose = vi.fn();
    render(<BoqSlideOver title="Comfort" onClose={onClose}><p>the editor</p></BoqSlideOver>);
    expect(screen.getByRole('dialog', { name: 'Edit BOQ: Comfort' })).toBeTruthy();
    expect(screen.getByText('the editor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
