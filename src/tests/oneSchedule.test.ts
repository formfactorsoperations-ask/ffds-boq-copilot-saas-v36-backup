import { describe, it, expect } from 'vitest';
import {
  scheduleFor, milestonesFromStructure, computeSchedule, FFDS_PAYMENT_STRUCTURE, scheduleSourceLabel,
} from '../../lib/paymentSchedule';
import type { PaymentStructure } from '../../types';

/* Figures chosen so that every stage rounds: 25/40/35 of 1,23,457 and 40/30/20/10 of 12,34,567. */
const OPTION = { totalSell: 1234567, designFee: 123457 };
const R = Math.round;

const STUDIO: PaymentStructure = {
  designStages: [
    { code: 'D1', name: 'Booking', pct: 30, trigger: 'On signing', unlocks: 'Concept' },
    { code: 'D2', name: 'Layouts', pct: 70, trigger: 'On layouts', unlocks: 'Drawings' },
  ],
  executionStages: [
    { code: 'E1', name: 'Mobilise', pct: 50, trigger: 'Before orders', unlocks: 'Orders' },
    { code: 'E2', name: 'Handover', pct: 50, trigger: 'On completion', unlocks: 'Keys' },
  ],
  handoverClause: '',
  validation: { designSumMustEqual: 100, executionSumMustEqual: 100 },
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('scheduleFor: where the stages come from', () => {
  it('takes Money’s saved schedule first', () => {
    const ctx = { paymentMilestones: milestonesFromStructure(STUDIO).map(m => (m.id === 'e1' ? { ...m, percentage: 60 } : m.id === 'e2' ? { ...m, percentage: 40 } : m)) };
    const s = scheduleFor(ctx, { tierSummary: OPTION }, { paymentStructure: FFDS_PAYMENT_STRUCTURE });
    expect(s.source).toBe('money');
    expect(s.execution.stages.map(x => x.pct)).toEqual([60, 40]);
  });

  it('then the studio’s stages from Terms & Payment', () => {
    const s = scheduleFor({}, { tierSummary: OPTION }, { paymentStructure: STUDIO });
    expect(s.source).toBe('studio');
    expect(s.design.stages.map(x => [x.code, x.name, x.pct, x.trigger])).toEqual([
      ['D1', 'Booking', 30, 'On signing'], ['D2', 'Layouts', 70, 'On layouts'],
    ]);
    expect(s.execution.stages.map(x => x.code)).toEqual(['E1', 'E2']);
  });

  it('then FFDS’s standard stages', () => {
    const s = scheduleFor({}, { tierSummary: OPTION }, { paymentStructure: null });
    expect(s.source).toBe('defaults');
    expect(s.design.stages.map(x => x.pct)).toEqual([25, 40, 35]);
    expect(s.execution.stages.map(x => x.pct)).toEqual([40, 30, 20, 10]);
    // An empty structure is not a structure.
    expect(scheduleFor({}, { tierSummary: OPTION }, { paymentStructure: { ...STUDIO, designStages: [] } }).source).toBe('defaults');
    expect(scheduleSourceLabel('money')).toMatch(/Money/);
  });
});

describe('scheduleFor: the stages add up', () => {
  const s = scheduleFor({ gstRate: 18 }, { tierSummary: OPTION });

  it('to the taxable value of each track', () => {
    expect(sum(s.design.stages.map(x => x.base))).toBe(R(OPTION.designFee));
    expect(sum(s.execution.stages.map(x => x.base))).toBe(R(OPTION.totalSell));
  });

  it('and, with GST, to the total of each track', () => {
    expect(s.design.total).toBe(R(OPTION.designFee * 1.18));
    expect(s.execution.total).toBe(R(OPTION.totalSell * 1.18));
    expect(s.total).toBe(s.design.total + s.execution.total);
  });

  it('with the first stage carrying the rounding', () => {
    // 25% of 1,23,457 is 30,864.25; the others round on their own, D1 takes the remainder.
    expect(s.design.stages[1].base).toBe(R(OPTION.designFee * 0.40));
    expect(s.design.stages[2].base).toBe(R(OPTION.designFee * 0.35));
    expect(s.design.stages[0].base).toBe(R(OPTION.designFee) - R(OPTION.designFee * 0.40) - R(OPTION.designFee * 0.35));
  });

  it('follows the GST Money bills: the billable share only', () => {
    const cashSplit = scheduleFor({ financials: { billablePercent: 30, executionGstEnabled: true, designGstEnabled: true } }, { tierSummary: OPTION });
    expect(cashSplit.execution.total).toBe(R(OPTION.totalSell * (1 + 0.3 * 0.18)));
    const noGst = scheduleFor({ financials: { executionGstEnabled: false, designGstEnabled: false } }, { tierSummary: OPTION });
    expect(noGst.total).toBe(R(OPTION.totalSell) + R(OPTION.designFee));
  });

  it('takes discounts off before splitting', () => {
    const d = scheduleFor({ financials: { executionGstEnabled: true, discounts: [{ type: 'fixed', value: 34567, target: 'execution' }] } }, { tierSummary: OPTION });
    expect(sum(d.execution.stages.map(x => x.base))).toBe(1200000);
  });
});

describe('scheduleFor: booking and engagement', () => {
  it('books at D1 with GST, less the Project Initiation Fee', () => {
    const s = scheduleFor({ financials: { initiationFeePaid: 4999, executionGstEnabled: true } }, { tierSummary: OPTION });
    expect(s.initiationFee).toBe(4999);
    expect(s.booking).toBe(s.design.stages[0].amount - 4999);
    const none = scheduleFor({}, { tierSummary: OPTION });
    expect(none.booking).toBe(none.design.stages[0].amount);
  });

  it('gives a design-only project no execution stages', () => {
    const s = scheduleFor({ engagementType: 'design_only', designFeeType: 'fixed_lumpsum', designFee: 150000 }, { tierSummary: OPTION });
    expect(s.execution.stages).toEqual([]);
    expect(s.execution.total).toBe(0);
    expect(s.design.stages.length).toBe(3);
    expect(sum(s.design.stages.map(x => x.base))).toBe(150000);
  });

  it('shows Money’s own amounts, stage for stage', () => {
    const ctx = { paymentMilestones: milestonesFromStructure(FFDS_PAYMENT_STRUCTURE), financials: { initiationFeePaid: 4999, billablePercent: 60, executionGstEnabled: true } };
    const money = computeSchedule({ context: ctx, tierSummary: OPTION });
    const s = scheduleFor(ctx, { tierSummary: OPTION });
    [...s.design.stages, ...s.execution.stages].forEach(st => {
      const m = money.byId[st.id];
      expect(st.base).toBe(m.base);
      expect(st.gst).toBe(m.gst);
      // What the client pays at the stage: Money's invoice, its cash share and the retainer it deducted.
      expect(st.amount).toBe(m.invoiceTotal + m.cash + m.retainerDeducted);
    });
  });

  it('leaves invoiced and paid stages as they were billed', () => {
    const ms = milestonesFromStructure(FFDS_PAYMENT_STRUCTURE).map(m =>
      m.id === 'd1' ? { ...m, status: 'paid' as const, lockedTaxableBase: 100000 } : m);
    const s = scheduleFor({ paymentMilestones: ms }, { tierSummary: OPTION });
    expect(s.design.stages[0].base).toBe(25000);
    expect(s.design.stages[0].cleared).toBe(true);
    // The rest of the fee is shared over D2 and D3, and the first unpaid stage carries the rounding.
    expect(s.design.stages[1].base + s.design.stages[2].base).toBe(R(OPTION.designFee - 25000));
  });
});

describe('milestonesFromStructure', () => {
  it('maps the studio’s stages as Money stores them', () => {
    const ms = milestonesFromStructure(STUDIO);
    expect(ms.map(m => [m.id, m.type, m.percentage, m.description])).toEqual([
      ['d1', 'design', 30, 'D1'], ['d2', 'design', 70, 'D2'], ['e1', 'execution', 50, 'E1'], ['e2', 'execution', 50, 'E2'],
    ]);
    expect((ms[3] as any).isHandoverAdvance).toBe(true);
    expect(milestonesFromStructure(STUDIO, true).every(m => m.type === 'design')).toBe(true);
    expect(milestonesFromStructure(null).length).toBe(7);
  });
});
