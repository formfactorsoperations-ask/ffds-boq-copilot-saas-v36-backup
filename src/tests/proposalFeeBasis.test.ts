/*
  The proposal's "What it comes to": how the design fee is applied, as the Brief
  sets it (lib/playground/pricing feeBasisWords), and GST on the work and on the
  fee apart (lib/offers dealFor).
*/
import { describe, it, expect } from 'vitest';
import { feeBasisWords } from '../../lib/playground/pricing';
import { dealFor } from '../../lib/offers';

const R = { roundUpTo: 100, feeOnActuals: false } as any;

describe('how the design fee is applied', () => {
  it('a percentage of the work, rounded up on a Playground version', () => {
    expect(feeBasisWords({ designFeeType: 'percentage', designFee: 12 }, { work: 874900, rules: R })).toBe('12% of the work, ₹8,74,900, rounded up to the next ₹100.');
    expect(feeBasisWords({ designFeeType: 'percentage', designFee: 12 }, { work: 875000, rules: R })).toBe('12% of the work, ₹8,75,000.');
  });

  it('before offers; with the items at actuals when the rules say so', () => {
    expect(feeBasisWords({ designFeeType: 'percentage', designFee: 10 }, { work: 500000, offers: true, rules: R })).toBe('10% of the work before offers, ₹5,00,000.');
    expect(feeBasisWords({ designFeeType: 'percentage', designFee: 10 }, { work: 500000, asActuals: 20000, rules: { ...R, feeOnActuals: true } })).toBe('10% of the work, ₹5,00,000 and the items at actuals, ₹20,000.');
    expect(feeBasisWords({ designFeeType: 'percentage', designFee: 10 }, { work: 500000, asActuals: 20000, rules: R })).toBe('10% of the work, ₹5,00,000.');
  });

  it('a rate on the carpet area, or a fixed fee', () => {
    expect(feeBasisWords({ designFeeType: 'fixed_sqft', designFee: 150, area: 695 }, { work: 1, rules: R })).toBe('₹150 per sq ft on 695 sq ft of carpet area, rounded up to the next ₹100.');
    expect(feeBasisWords({ designFeeType: 'fixed_lumpsum', designFee: 100000 }, { work: 1, rules: R })).toBe('A fixed fee for the design.');
  });
});

describe('GST on the work and on the fee, apart', () => {
  it('adds up to the GST and to what the client pays', () => {
    const d = dealFor({ totalSell: 874900, designFee: 105000 }, [], { rate: 18, billablePercent: 100, executionGst: true, designGst: true });
    expect(d.gstExec).toBeCloseTo(157482);
    expect(d.gstDesign).toBeCloseTo(18900);
    expect(d.gstExec + d.gstDesign).toBeCloseTo(d.gst);
    expect(Math.round(d.clientPays)).toBe(1156282);
  });
});
