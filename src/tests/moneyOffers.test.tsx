/*
  Money & Offers (replaced Health Check & Audit): what an option is made of,
  offers against one part of it, and what the client pays.
*/
import React, { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { buildBankMap } from '../../lib/boqPricing';
import { partOfLine, tradeOfLine, scopeSplit, offerValue, offerDiscount, staleOffer, marginWith, discountTotal, offerName } from '../../lib/offers';
import MoneyOffersTab from '../../components/money/MoneyOffersTab';
import { ALWAYS_ON_BAND, NAV_CONFIG } from '../../components/navConfig';

afterEach(cleanup);

const item = (id: string, name: string, cat: string, materials: number) => ({ id, name, cat, unit: 'sqft', materials, labor: 0, margin: 0 }) as any;
const BANK = [
  item('wardrobe', 'Wardrobe with loft', 'Carpentry', 1000),
  item('tv', 'TV unit', 'Carpentry', 500),
  item('ceiling', 'False ceiling', 'Ceiling', 200),
  item('paint', 'Wall paint', 'Painting', 100),
  item('tiling', 'Floor tiling', 'Civil', 300),
  item('mirror', 'Mirror', 'Glass & Mirror', 50),
];
const line = (id: string, bankId: string, qty: number, roomId: string) => ({ id, bankId, qty, roomId });
const BOQ = [
  line('l1', 'wardrobe', 10, 'Master Bedroom'), // 10,000 carpentry
  line('l2', 'tv', 4, 'Living'),                // 2,000 carpentry
  line('l3', 'ceiling', 10, 'Living'),          // 2,000 functional (false ceiling by name)
  line('l4', 'paint', 10, 'Functional'),        // 1,000 functional (scope room)
  line('l5', 'tiling', 5, 'Civil'),             // 1,500 civil
  line('l6', 'mirror', 10, 'Bath'),             // 500 others
];
const tier = (id: string, name: string, boq: any[], sell: number, cost: number) =>
  ({ id, name, timestamp: 1, boq, summary: { totalSell: sell, totalCost: cost, totalGm: sell - cost, itemCount: boq.length, totalRevenue: sell + 1000, designFee: 1000, blendedGm: 0 } }) as any;
const map = buildBankMap(BANK);

describe('What an option is made of', () => {
  it('splits the work into carpentry, functional, civil and others', () => {
    const s = scopeSplit({ boq: BOQ } as any, map);
    expect(s.total).toBe(17000);
    expect(s.parts.carpentry.value).toBe(12000);
    expect(s.parts.functional.value).toBe(3000);
    expect(s.parts.civil.value).toBe(1500);
    expect(s.parts.others.value).toBe(500);
    expect(s.parts.carpentry.lines[0].name).toBe('Wardrobe with loft');
  });

  it('goes by the item, not the scope room the generator filed it in', () => {
    // POP false ceiling is a Civil item in the bank, filed under Functional by the generator.
    expect(tradeOfLine('Functional', { cat: 'Civil', name: 'POP FALSE CEILING (Standard)' })).toEqual({ part: 'functional', trade: 'False ceiling' });
    expect(partOfLine('Civil', { cat: 'Plumbing', name: 'PLUMBING POINT (NEW/SHIFT)' })).toBe('functional');
    expect(partOfLine('Functional', { cat: 'Plumbing', name: 'PLUMBING POINT (NEW/SHIFT)' })).toBe('functional');
    expect(partOfLine('Functional', { cat: 'Civil', name: 'Floor tiling' })).toBe('civil');
    expect(partOfLine('Civil', { cat: 'Carpentry', name: 'x' })).toBe('carpentry');
    expect(partOfLine('Kitchen', { cat: 'Modular Kitchen', name: 'x' })).toBe('carpentry');
    expect(partOfLine('Others', { cat: 'Site Services', name: 'Debris removal' })).toBe('others');
    expect(partOfLine('Living', { cat: 'Decor', name: 'Wall art' })).toBe('others');
    // Only a line whose item is not in the bank falls back to its scope room.
    expect(partOfLine('Civil', undefined)).toBe('civil');
  });

  it('adds up trade by trade inside each part', () => {
    const s = scopeSplit({ boq: BOQ } as any, map);
    expect(s.parts.carpentry.trades).toEqual([{ trade: 'Carpentry', value: 12000, lines: 2 }]);
    expect(s.parts.functional.trades.map((t) => t.trade)).toEqual(['False ceiling', 'Painting']);
    const sum = Object.values(s.parts).reduce((a, p) => a + p.trades.reduce((b, t) => b + t.value, 0), 0);
    expect(sum).toBe(s.total);
  });

  it('leaves out lines that are not billed, or paid to vendors directly', () => {
    const s = scopeSplit({ boq: [...BOQ, { ...line('x', 'wardrobe', 5, 'Bed 2'), asActuals: true }] } as any, map);
    expect(s.total).toBe(17000);
    expect(s.asActuals).toBe(5000); // shown apart, never in the price
  });
});

describe('Offers', () => {
  const s = scopeSplit({ boq: BOQ } as any, map);

  it('prices a percent off one part, and complimentary lines', () => {
    expect(offerValue({ kind: 'part-percent', part: 'carpentry', percent: 5, tierId: 't' }, s)).toBe(600);
    const comp = { kind: 'complimentary' as const, part: 'functional' as const, lines: [{ key: 'l3', name: 'False ceiling' }], tierId: 't' };
    expect(offerValue(comp, s)).toBe(2000);
    expect(offerName(comp)).toBe('Complimentary: False ceiling');
  });

  it('is saved as a fixed execution discount Money and the documents already apply', () => {
    const d = offerDiscount('o1', { kind: 'part-percent', part: 'carpentry', percent: 5, tierId: 't' }, s);
    expect(d).toMatchObject({ name: '5% off carpentry', type: 'fixed', target: 'execution', value: 600 });
    expect(discountTotal(17000, [d], 'execution')).toBe(600);
  });

  it('says when the BOQ has moved since', () => {
    const d = offerDiscount('o1', { kind: 'part-percent', part: 'carpentry', percent: 5, tierId: 't' }, s);
    const grown = scopeSplit({ boq: [...BOQ, line('l7', 'tv', 2, 'Bed 2')] } as any, map);
    expect(staleOffer(d, 't', s)).toBeNull();
    expect(staleOffer(d, 't', grown)).toBe(650);
    expect(staleOffer(d, 'other-option', grown)).toBeNull();
  });

  it('works out the margin after it', () => {
    const m = marginWith(10000, 8000, 500);
    expect(m.before).toBeCloseTo(20);
    expect(m.after).toBeCloseTo(15.79, 1);
  });
});

describe('Money & Offers screen', () => {
  const TIERS = [tier('ess', 'Essential', BOQ, 17000, 13600), tier('com', 'Comfort', BOQ.slice(0, 3), 14000, 11000)];
  function Harness({ readOnly = false, initial = {} }: { readOnly?: boolean; initial?: any }) {
    const [ctx, setCtx] = useState<any>({ name: 'Harmony 704', gstRate: 18, ...initial, financials: { executionGstEnabled: true, designGstEnabled: true, billablePercent: 100, discounts: [], ...(initial.financials || {}) } });
    return (
      <>
        <MoneyOffersTab tiers={TIERS} bank={BANK} projectContext={ctx} setProjectContext={setCtx} activeTierId="ess" readOnly={readOnly} />
        <output data-testid="discounts">{JSON.stringify(ctx.financials.discounts)}</output>
      </>
    );
  }
  const saved = () => JSON.parse(screen.getByTestId('discounts').textContent || '[]');

  it('shows the option part by part, and the deal', () => {
    render(<Harness />);
    const parts = screen.getByRole('region', { name: 'Where the money goes' });
    expect(within(parts).getByText('Carpentry')).toBeTruthy();
    expect(within(parts).getByText('₹12,000')).toBeTruthy();
    expect(within(parts).getByText('₹17,000')).toBeTruthy();
    const deal = screen.getByRole('region', { name: 'The deal' });
    // 17,000 + 1,000 fee + 18% GST on both = 21,240
    expect(within(deal).getByText('₹21,240')).toBeTruthy();
  });

  it('adds 5% off carpentry, and the client pays less', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an offer' }));
    fireEvent.change(screen.getByLabelText('Percent off'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add the offer' }));
    expect(saved()).toMatchObject([{ name: '5% off carpentry', type: 'fixed', target: 'execution', value: 600, basis: { kind: 'part-percent', part: 'carpentry', percent: 5, tierId: 'ess' } }]);
    const deal = screen.getByRole('region', { name: 'The deal' });
    expect(within(deal).getByText('− ₹600')).toBeTruthy();
    expect(within(deal).getByText('₹20,532')).toBeTruthy(); // (16,400 + 1,000) × 1.18
  });

  it('gives chosen lines away free', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an offer' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Complimentary' }));
    fireEvent.change(screen.getByLabelText('Part of the job'), { target: { value: 'functional' } });
    fireEvent.click(screen.getByLabelText(/False ceiling/));
    fireEvent.click(screen.getByRole('button', { name: 'Add the offer' }));
    expect(saved()[0]).toMatchObject({ name: 'Complimentary: False ceiling', value: 2000 });
  });

  it('keeps the old kind of discount, on execution or the design fee', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an offer' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Other discount' }));
    fireEvent.change(screen.getByLabelText('What it is'), { target: { value: 'Goodwill' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Percent or rupees'), { target: { value: 'percentage' } });
    fireEvent.change(screen.getByLabelText('Comes off'), { target: { value: 'design' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add the offer' }));
    expect(saved()[0]).toMatchObject({ name: 'Goodwill', type: 'percentage', value: 10, target: 'design' });
  });

  it('offers to update an offer when the BOQ has moved, and to remove it', () => {
    const old = { id: 'o1', name: '5% off carpentry', type: 'fixed', target: 'execution', value: 500, basis: { kind: 'part-percent', part: 'carpentry', percent: 5, tierId: 'ess' } };
    render(<Harness initial={{ financials: { discounts: [old] } }} />);
    expect(screen.getByText(/The BOQ changed: on it today this is ₹600/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(saved()[0].value).toBe(600);
    fireEvent.click(screen.getByRole('button', { name: 'Remove 5% off carpentry' }));
    expect(saved()).toEqual([]);
  });

  it('lists each option once, at its newest version, and moves an offer from v1 onto v2', () => {
    const v2 = { ...tier('ess2', 'Essential', [...BOQ, line('l7', 'wardrobe', 2, 'Study')], 19000, 15000), parentTierId: 'ess', timestamp: 2 };
    const onV1 = { id: 'o1', name: '5% off carpentry', type: 'fixed', target: 'execution', value: 600, basis: { kind: 'part-percent', part: 'carpentry', percent: 5, tierId: 'ess' } };
    function Versions() {
      const [ctx, setCtx] = useState<any>({ name: 'Harmony 704', financials: { executionGstEnabled: true, designGstEnabled: true, billablePercent: 100, discounts: [onV1] } });
      return (
        <>
          <MoneyOffersTab tiers={[...TIERS, v2]} bank={BANK} projectContext={ctx} setProjectContext={setCtx} activeTierId="ess" />
          <output data-testid="discounts">{JSON.stringify(ctx.financials.discounts)}</output>
        </>
      );
    }
    render(<Versions />);
    const picker = screen.getByRole('tablist', { name: 'Option' });
    expect(within(picker).getAllByRole('tab').map((t) => t.textContent)).toEqual([expect.stringMatching(/^Essential/), expect.stringMatching(/^Comfort/)]);
    expect(within(picker).getByRole('tab', { selected: true }).textContent).toContain('19,000');
    expect(screen.getByText(/Priced on v1\. On v2 it is ₹700\./)).toBeTruthy(); // 5% of 14,000 carpentry
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(saved()[0]).toMatchObject({ value: 700, basis: { tierId: 'ess2' } });
  });

  it('is read-only for those who do not hold the money', () => {
    render(<Harness readOnly />);
    expect(screen.queryByRole('button', { name: 'Add an offer' })).toBeNull();
  });
});

describe('Health Check & Audit is retired', () => {
  it('stage 2 now reads Pricing & Tiers, BOQ Editor, Money & Offers', () => {
    const stage2 = NAV_CONFIG.find((s) => s.stage === 2)!;
    expect(stage2.items.map((i) => i.label)).toEqual(['Pricing & Tiers', 'BOQ Editor', 'Money & Offers']);
    expect(stage2.items[2]).toMatchObject({ route: 'analytics', money: true });
    expect(ALWAYS_ON_BAND.some((i) => /Health/.test(i.label))).toBe(false);
  });

  it('warns when an offer would make the option a loss', () => {
    const TIERS2 = [tier('ess', 'Essential', BOQ, 17000, 16500)];
    const Lossy = () => {
      const [ctx, setCtx] = useState<any>({ gstRate: 18, financials: { discounts: [] } });
      return <MoneyOffersTab tiers={TIERS2} bank={BANK} projectContext={ctx} setProjectContext={setCtx} />;
    };
    render(<Lossy />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an offer' }));
    fireEvent.change(screen.getByLabelText('Percent off'), { target: { value: '10' } });
    expect(screen.getByText(/this option would make a loss/)).toBeTruthy();
  });
});
