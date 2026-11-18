import { describe, it, expect } from 'vitest';
import { cardStates, milestoneKind, trackTotal, balanceTrack, fixedOverflow, termsChanges, scheduleChanges, studioCashPct, sameTerms } from '../../lib/moneyBoard';

const ms: any[] = [
  { id: 'd1', type: 'design', name: 'Sign-up & Concept', percentage: 25, status: 'paid' },
  { id: 'd2', type: 'design', name: 'Design Development', percentage: 34, status: 'pending' },
  { id: 'd3', type: 'design', name: 'Final Drawings', percentage: 41, status: 'pending' },
  { id: 'e1', type: 'execution', name: 'Material Order Advance', percentage: 37, status: 'invoiced' },
  { id: 'e2', type: 'execution', name: 'Carcass & False Ceiling', percentage: 30, status: 'pending' },
  { id: 'e3', type: 'execution', name: 'Finishes & Fittings', percentage: 25, status: 'pending' },
  { id: 'e4', type: 'execution', name: 'Handover', percentage: 8, status: 'pending' },
];

describe('each card says where its milestone stands', () => {
  it('paid, with the client, earned, up next and later', () => {
    const s = cardStates(ms, new Set(['e3']));
    expect(s).toEqual({ d1: 'paid', d2: 'next', d3: 'later', e1: 'invoiced', e2: 'next', e3: 'earned', e4: 'later' });
  });
});

describe('each milestone gets an icon from its name', () => {
  it('reads the words studios use', () => {
    expect(ms.map(m => milestoneKind(m))).toEqual(['concept', 'model', 'drawings', 'material', 'build', 'finish', 'handover']);
    expect(milestoneKind({ name: 'Completion & Handover', type: 'execution' })).toBe('handover');
    expect(milestoneKind({ name: 'Stage 3', type: 'execution' })).toBe('execution');
    expect(milestoneKind({ name: 'Stage 3', type: 'design', isHandoverAdvance: false })).toBe('design');
  });
});

describe('a track adds up to 100%', () => {
  const base = 1344441;
  const rows: any[] = [
    { id: 'a', percentage: 37, status: 'invoiced' },
    { id: 'b', percentage: 30, status: 'pending' },
    { id: 'c', percentage: 25, status: 'pending' },
    { id: 'd', percentage: 0, status: 'pending', isFixedAmount: true, fixedAmount: 100000 },
  ];
  it('counts a fixed amount at its share', () => {
    const t = trackTotal(rows, base);
    expect(t.pct).toBeCloseTo(92 + 100000 / base * 100, 5);
    expect(t.whole).toBe(false);
  });
  it('balancing puts the difference on the last % milestone still to bill', () => {
    const b = balanceTrack(rows, base);
    expect(b[2].percentage).toBeCloseTo(25 + (100 - trackTotal(rows, base).pct), 1);
    expect(b[0].percentage).toBe(37);
    expect(trackTotal(b, base).whole).toBe(true);
  });
  it('warns when fixed amounts are more than what is left', () => {
    expect(fixedOverflow(rows, base, 497443).over).toBe(false);
    expect(fixedOverflow([{ id: 'x', status: 'pending', isFixedAmount: true, fixedAmount: 900000 } as any], base, 497443).over).toBe(true);
  });
});

describe('History says what moved', () => {
  const a = { billablePercent: 50, designBillablePercent: 100, executionGstEnabled: true, designGstEnabled: true, gstRate: 18 };
  it('for the tax terms', () => {
    const b = { ...a, billablePercent: 100, designGstEnabled: false };
    expect(sameTerms(a, a)).toBe(true);
    expect(sameTerms(a, b)).toBe(false);
    expect(termsChanges(a, b)).toEqual(['Execution taxable share 50% → 100%', 'GST on design turned off']);
  });
  it('for the schedule', () => {
    const after = [
      { ...ms[4], percentage: 31 },
      { ...ms[6], isFixedAmount: true, fixedAmount: 100000 },
      { id: 'n', type: 'execution', name: 'Site visit fee', percentage: 0, isFixedAmount: true, fixedAmount: 25000 },
    ] as any[];
    expect(scheduleChanges([ms[4], ms[5], ms[6]], after)).toEqual([
      'Carcass & False Ceiling 30% → 31%',
      'Handover 8% → ₹1,00,000 fixed',
      'Site visit fee added at ₹25,000 fixed',
      'Finishes & Fittings removed',
    ]);
  });
});

describe('studio cash moves with this project', () => {
  it('swaps in the project cash part', () => {
    expect(Math.round(studioCashPct(2984353, 672220, 2000000))).toBe(183);
    expect(Math.round(studioCashPct(2984353, 0, 2000000))).toBe(149);
    expect(studioCashPct(1, 1, 0)).toBe(0);
  });
});
