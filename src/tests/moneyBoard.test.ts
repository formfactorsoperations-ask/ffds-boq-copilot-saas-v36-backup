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

import { restoreSchedule, milestonesFromIssued, snapshotOf } from '../../lib/moneyBoard';

describe('putting back an earlier schedule', () => {
  const taxable = { design: 100000, execution: 1000000 };
  const past: any[] = [
    { id: 'd1', type: 'design', name: 'Sign-up', percentage: 25, status: 'pending' },
    { id: 'd2', type: 'design', name: 'Layouts', percentage: 75, status: 'pending', date: '2026-12-01' },
    { id: 'e1', type: 'execution', name: 'Material', percentage: 40, status: 'pending' },
    { id: 'e2', type: 'execution', name: 'Handover', percentage: 60, status: 'pending' },
  ];
  it('brings the shares back, keeping ids and dates', () => {
    const now: any[] = [
      { id: 'd1', type: 'design', name: 'Sign-up', percentage: 50, status: 'pending' },
      { id: 'd2', type: 'design', name: 'Layouts', percentage: 50, status: 'pending' },
      { id: 'e1', type: 'execution', name: 'Material', percentage: 100, status: 'pending' },
    ];
    const { draft, notes } = restoreSchedule(past, now, taxable);
    expect(draft.map(m => [m.id, m.percentage])).toEqual([['d1', 25], ['d2', 75], ['e1', 40], ['e2', 60]]);
    expect(draft[1].date).toBe('2026-12-01');
    expect(notes).toEqual([]);
  });
  it('never un-bills: what was invoiced or paid since keeps how it was billed', () => {
    const now: any[] = [
      { id: 'd1', type: 'design', name: 'Sign-up', percentage: 30, status: 'paid', invoiceNumber: 'INV-1', paidDate: '2026-11-20' },
      { id: 'd2', type: 'design', name: 'Layouts', percentage: 70, status: 'pending' },
      { id: 'eX', type: 'execution', name: 'Material', percentage: 100, status: 'invoiced', invoiceNumber: 'INV-2' },
    ];
    const { draft, notes } = restoreSchedule(past, now, taxable);
    const d1 = draft.find(m => m.id === 'd1')!;
    expect(d1).toMatchObject({ status: 'paid', invoiceNumber: 'INV-1', percentage: 30 });
    // Layouts takes the difference so design still adds up.
    expect(draft.find(m => m.id === 'd2')!.percentage).toBe(70);
    // Material was billed under another id: it is not asked for twice.
    expect(draft.filter(m => m.type === 'execution').map(m => m.id)).toEqual(['eX', 'e2']);
    expect(notes.join(' ')).toMatch(/Sign-up was billed after this version/);
  });
  it('reads an issued schedule back as milestones', () => {
    const ms = milestonesFromIssued([{ advanceCode: 'E1', label: 'Handover', phase: 'handover', percentage: 10, dueCondition: 'On completion', isHandoverAdvance: true }]);
    expect(ms[0]).toMatchObject({ type: 'execution', name: 'Handover', percentage: 10, trigger: 'On completion', isHandoverAdvance: true, status: 'pending' });
  });
  it('keeps a snapshot Firestore will take', () => {
    expect(snapshotOf([{ id: 'a', date: undefined } as any])).toEqual([{ id: 'a' }]);
  });
});
