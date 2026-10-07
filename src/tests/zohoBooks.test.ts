import { describe, it, expect } from 'vitest';
import {
  buildInvoicePayload,
  expectedInvoiceTotal,
  financialYear,
  gstSplit,
  isValidGstin,
  nextInvoiceNumber,
  pickTaxId,
  resolveState,
  stateFromGstin,
  validateNumberTemplate,
  isoDateIst,
  ZOHO_SCOPES,
} from '../../lib/zohoBooks';

const MH = resolveState('MH')!;
const KA = resolveState('Karnataka')!;

describe('financial year', () => {
  it('runs 1 April to 31 March', () => {
    expect(financialYear(new Date('2026-04-01T06:00:00Z'))).toBe('2026-27');
    expect(financialYear(new Date('2026-10-07T06:00:00Z'))).toBe('2026-27');
    expect(financialYear(new Date('2027-03-31T06:00:00Z'))).toBe('2026-27');
    expect(financialYear(new Date('2027-04-01T06:00:00Z'))).toBe('2027-28');
  });

  it('reads the date in India, not UTC', () => {
    // 31 March 20:00 UTC is already 1 April, 01:30 in India.
    expect(financialYear(new Date('2027-03-31T20:00:00Z'))).toBe('2027-28');
    expect(isoDateIst(new Date('2027-03-31T20:00:00Z'))).toBe('2027-04-01');
  });

  it('rolls the century cleanly', () => {
    expect(financialYear(new Date('2099-06-01T00:00:00Z'))).toBe('2099-00');
  });
});

describe('invoice numbers', () => {
  const now = new Date('2026-10-07T06:00:00Z');

  it('starts a financial year at 001', () => {
    expect(nextInvoiceNumber('FFDS/{FY}/', now, [])).toBe('FFDS/2026-27/001');
  });

  it('continues from the highest sequence, not the count', () => {
    const existing = ['FFDS/2026-27/001', 'FFDS/2026-27/007', 'FFDS/2026-27/003'];
    expect(nextInvoiceNumber('FFDS/{FY}/', now, existing)).toBe('FFDS/2026-27/008');
  });

  it('ignores other years and numbers outside the series', () => {
    const existing = ['FFDS/2025-26/120', 'INV-026-HAR-02', 'FFDS/2026-27/ABC', 'FFDS/2026-27/002'];
    expect(nextInvoiceNumber('FFDS/{FY}/', now, existing)).toBe('FFDS/2026-27/003');
  });

  it('keeps growing past three digits', () => {
    expect(nextInvoiceNumber('FFDS/{FY}/', now, ['FFDS/2026-27/999'])).toBe('FFDS/2026-27/1000');
  });

  it('accepts only safe templates with {FY} as the one placeholder', () => {
    expect(validateNumberTemplate('FFDS/{FY}/')).toBeNull();
    expect(validateNumberTemplate('INV-')).toBeNull();
    expect(validateNumberTemplate('')).not.toBeNull();
    expect(validateNumberTemplate('FFDS/{YEAR}/')).not.toBeNull();
    expect(validateNumberTemplate('FFDS/<script>')).not.toBeNull();
    expect(validateNumberTemplate('x'.repeat(41))).not.toBeNull();
  });
});

describe('place of supply and the GST split', () => {
  it('reads the state off a GSTIN', () => {
    expect(stateFromGstin('27ABCDE1234F1Z5')?.name).toBe('Maharashtra');
    expect(stateFromGstin('29abcde1234f1z5')?.zoho).toBe('KA');
    expect(stateFromGstin('00ABCDE1234F1Z5')).toBeNull();
    expect(stateFromGstin('')).toBeNull();
  });

  it('validates GSTIN shape', () => {
    expect(isValidGstin('27ABCDE1234F1Z5')).toBe(true);
    expect(isValidGstin(' 27abcde1234f1z5 ')).toBe(true);
    expect(isValidGstin('27ABCDE1234F1X5')).toBe(false);
    expect(isValidGstin('nonsense')).toBe(false);
  });

  it('splits CGST+SGST inside the studio state and IGST outside it', () => {
    expect(gstSplit(MH, MH, 18)).toEqual({ kind: 'intra', label: 'CGST 9% + SGST 9%' });
    expect(gstSplit(MH, KA, 18)).toEqual({ kind: 'inter', label: 'IGST 18%' });
  });

  it('never guesses when a state is missing', () => {
    expect(gstSplit(MH, null, 18).kind).toBe('unknown');
    expect(gstSplit(null, MH, 18).kind).toBe('unknown');
  });

  it('has no split on a zero-rated invoice', () => {
    expect(gstSplit(MH, KA, 0).label).toBe('No GST');
  });
});

describe('picking the tax', () => {
  const taxes = [
    { tax_id: '1', tax_name: 'CGST9', tax_percentage: 9 },
    { tax_id: '2', tax_name: 'GST18', tax_percentage: 18 },
    { tax_id: '3', tax_name: 'IGST18', tax_percentage: 18 },
    { tax_id: '4', tax_name: 'GST12', tax_percentage: 12 },
  ];

  it('uses the GST group inside the state and IGST outside', () => {
    expect(pickTaxId(taxes, 'intra', 18)).toBe('2');
    expect(pickTaxId(taxes, 'inter', 18)).toBe('3');
  });

  it('does not mistake IGST for the intra-state group', () => {
    expect(pickTaxId([{ tax_id: '3', tax_name: 'IGST18', tax_percentage: 18 }], 'intra', 18)).toBeNull();
  });

  it('reads Zoho India\'s own markers, as they come back from a real org', () => {
    const real = [
      { tax_id: 'a', tax_name: 'Discounted Tax', tax_percentage: 9, tax_type: 'tax', tax_specification: 'intra' },
      { tax_id: 'b', tax_name: 'GST18', tax_percentage: 18, tax_type: 'tax_group', tax_specification: 'intra' },
      { tax_id: 'c', tax_name: 'IGST18', tax_percentage: 18, tax_type: 'tax', tax_specification: 'inter' },
      { tax_id: 'd', tax_name: 'GST5', tax_percentage: 5, tax_type: 'tax_group', tax_specification: 'intra' },
    ];
    expect(pickTaxId(real, 'intra', 18)).toBe('b');
    expect(pickTaxId(real, 'inter', 18)).toBe('c');
    expect(pickTaxId(real, 'intra', 9)).toBeNull(); // a lone CGST is not a line's tax
  });

  it('follows the specification over the name when they differ', () => {
    const renamed = [{ tax_id: 'x', tax_name: 'Out of state 18', tax_percentage: 18, tax_type: 'tax', tax_specification: 'inter' }];
    expect(pickTaxId(renamed, 'inter', 18)).toBe('x');
  });

  it('returns null rather than a wrong rate', () => {
    expect(pickTaxId(taxes, 'intra', 5)).toBeNull();
    expect(pickTaxId(taxes, 'unknown', 18)).toBeNull();
  });
});

describe('the draft invoice', () => {
  const base = {
    customerId: 'C1',
    date: '2026-10-07',
    projectName: 'Harmony 704',
    milestoneName: 'Design Advance 1',
    taxableAmount: 100000,
    gstRatePct: 18,
    hsnOrSac: '998391',
    itemId: 'ITEM1',
    taxId: 'TAX18',
    placeOfSupply: 'MH',
  };

  it('is a one-line service invoice with HSN and tax on the line', () => {
    const { body, query } = buildInvoicePayload(base);
    expect(body.customer_id).toBe('C1');
    expect(body.place_of_supply).toBe('MH');
    expect(body.line_items).toEqual([
      expect.objectContaining({
        item_id: 'ITEM1', rate: 100000, quantity: 1, hsn_or_sac: '998391', tax_id: 'TAX18',
        description: 'Harmony 704 — Design Advance 1',
      }),
    ]);
    expect(query).toEqual({});
    expect(body.invoice_number).toBeUndefined();
  });

  it('can never be sent: no send flag in the body or the query', () => {
    const { body, query } = buildInvoicePayload({ ...base, invoiceNumber: 'FFDS/2026-27/001', retainerDeducted: 5000 });
    expect(JSON.stringify(body)).not.toMatch(/"send"/);
    expect(Object.keys(query)).not.toContain('send');
  });

  it('asks Zoho to accept our number only when we supply one', () => {
    const { body, query } = buildInvoicePayload({ ...base, invoiceNumber: 'FFDS/2026-27/001' });
    expect(body.invoice_number).toBe('FFDS/2026-27/001');
    expect(query.ignore_auto_number_generation).toBe('true');
  });

  it('marks a GSTIN-holding client as GST-registered and others as consumers', () => {
    expect(buildInvoicePayload({ ...base, gstin: '27ABCDE1234F1Z5' }).body).toMatchObject({
      gst_treatment: 'business_gst', gst_no: '27ABCDE1234F1Z5',
    });
    const consumer = buildInvoicePayload(base).body;
    expect(consumer.gst_treatment).toBe('consumer');
    expect(consumer.gst_no).toBeUndefined();
  });

  it('carries the retainer and any concession as one negative adjustment', () => {
    const { body } = buildInvoicePayload({
      ...base, retainerDeducted: 4999, discountApplied: 1000, discountReason: 'goodwill',
    });
    expect(body.adjustment).toBe(-5999);
    expect(body.adjustment_description).toBe('Less: initiation retainer already paid; Less: concession — goodwill');
  });

  it('has no adjustment when nothing is deducted', () => {
    const { body } = buildInvoicePayload(base);
    expect(body.adjustment).toBeUndefined();
  });

  it('leaves the tax off a line that carries no GST', () => {
    const line = (buildInvoicePayload({ ...base, gstRatePct: 0, taxId: null }).body.line_items as any[])[0];
    expect(line.tax_id).toBeUndefined();
  });

  it('rounds the rate to whole rupees, as the schedule does', () => {
    const line = (buildInvoicePayload({ ...base, taxableAmount: 100000.4 }).body.line_items as any[])[0];
    expect(line.rate).toBe(100000);
  });

  it('computes the total the studio expects Zoho to show', () => {
    expect(expectedInvoiceTotal(100000, 18000, 4999, 1000)).toBe(112001);
    expect(expectedInvoiceTotal(1000, 180, 5000, 0)).toBe(0);
  });
});

describe('the OAuth grant', () => {
  it('asks for no update or delete scope', () => {
    expect(ZOHO_SCOPES).not.toMatch(/UPDATE|DELETE|ALL/);
    expect(ZOHO_SCOPES).toContain('ZohoBooks.invoices.CREATE');
  });
});
