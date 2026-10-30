import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { asActualsTotal, boqTotal, buildBankMap, designFeeFor, isAsActuals } from '../../lib/boqPricing';
import { buildDetailedBoqSnapshot } from '../../lib/detailedBoq';
import { signedLinesFrom } from '../../lib/scopeRevision';
import { buildBoqFromDraft, revisionFromDraft, startDraft, updateLine } from '../../lib/scopeDraft';
import { asActualsInContract, takeAsActualsOut } from '../../lib/asActualsCorrection';
import { buildDetailedBoqWorkbook } from '../../lib/scopeWorkbook';

/*
  Unique Vistas: ₹24,30,121 of BOQ, of which TILES (AS ACTUALS) ₹30,000 and
  ELECTRICAL FITTINGS (AS ACTUALS) ₹1,15,000 are paid by the client to the
  vendors. FFDS's own work is ₹22,85,121, and only that is invoiced.
*/

const boq = (): any[] => [
  { id: 'w1', roomId: 'Daughter’s bedroom 1', name: 'WARDOBE WITH LOFT', qty: 1, unit: 'nos', selectedRate: 2140121 },
  { id: 'c1', roomId: 'Common bathroom', name: 'DEMOLISH FULL L WALL', qty: 1, unit: 'lump sum', selectedRate: 145000 },
  { id: 't1', roomId: 'Common bathroom', name: 'TILES (AS ACTUALS)', qty: 1, unit: 'lump sum', selectedRate: 30000 },
  { id: 'e1', roomId: 'Functional', name: 'ELECTRICAL FITTINGS', boqStatus: 'as_actuals', qty: 1, unit: 'lump sum', selectedRate: 115000 },
  { id: 'x1', roomId: 'Functional', name: 'Old sofa', boqStatus: 'excluded', qty: 1, unit: 'nos', selectedRate: 9999 },
];
const bank = buildBankMap([], []);

describe('as actuals are scope, not FFDS’s total', () => {
  it('knows an as-actuals line by its status, its flag or its name', () => {
    expect(isAsActuals({ boqStatus: 'as_actuals' })).toBe(true);
    expect(isAsActuals({ asActuals: true })).toBe(true);
    expect(isAsActuals({}, 'TILES (AS ACTUALS)')).toBe(true);
    expect(isAsActuals({}, 'Loose furniture as-actual')).toBe(true);
    expect(isAsActuals({}, 'Actual size mirror')).toBe(false);
    expect(isAsActuals({ boqStatus: 'provisional_sum' }, 'POP false ceiling')).toBe(false);
  });

  it('leaves them out of the total and keeps their estimate beside it', () => {
    expect(boqTotal(boq(), bank)).toBe(2285121);
    expect(asActualsTotal(boq(), bank)).toBe(145000);
  });

  it('charges a percentage design fee on the as-actuals too, and nothing else on a fixed fee', () => {
    expect(designFeeFor({ designFeeType: 'percentage', designFee: 10 }, 2285121, 145000)).toBeCloseTo(243012.1, 2);
    expect(designFeeFor({ designFeeType: 'fixed_lumpsum', designFee: 169492 }, 2285121, 145000)).toBe(169492);
    expect(designFeeFor({ designFeeType: 'fixed_sqft', designFee: 100, area: 950 }, 2285121, 145000)).toBe(95000);
  });

  it('lists them on the Detailed BOQ at their estimate, outside the total', () => {
    const s = buildDetailedBoqSnapshot({ context: { name: 'Unique Vistas' } as any, tier: { id: 't', boq: boq() }, bankMap: bank, version: 3, reference: 'V3', approval: { mode: 'for_signature' } });
    expect(s.total).toBe(2285121);
    expect(s.asActualsTotal).toBe(145000);
    const bath = s.rooms.find(r => r.name === 'Common bathroom')!;
    expect(bath.total).toBe(145000);
    expect(bath.lines.find(l => /tiles/i.test(l.name))!.asActuals).toBe(true);
  });

  it('keeps them out of the Excel’s room totals and lists them under the total', async () => {
    const s = buildDetailedBoqSnapshot({ context: { name: 'Unique Vistas' } as any, tier: { id: 't', boq: boq() }, bankMap: bank, version: 3, reference: 'V3', approval: { mode: 'for_signature' } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildDetailedBoqWorkbook(s, { studioName: 'FF' } as any) as any);
    const ws = wb.getWorksheet('BOQ')!;
    const cells: { text: string; g: any }[] = [];
    ws.eachRow(r => cells.push({ text: String((r.values as any[])[2] ?? ''), g: r.getCell(7).value }));
    const room = cells.find(c => c.text.startsWith('COMMON BATHROOM'))!;
    expect(String(room.g.formula)).toMatch(/^SUM\(G\d+:G\d+\)-G\d+$/);
    expect(room.g.result).toBe(145000);
    const total = cells.find(c => c.text.startsWith('Total execution scope'))!;
    expect(total.g.result).toBe(2285121);
    const aa = cells.find(c => c.text.startsWith('As actuals'))!;
    expect(aa.g.result).toBe(145000);
  });
});

describe('a scope revision prices FFDS’s work only', () => {
  const signed = signedLinesFrom(boq(), bank);

  it('starts from the signed scope without the as-actuals', () => {
    const r = revisionFromDraft(signed, startDraft(signed, boq(), bank));
    expect(r.v1Total).toBe(2285121);
    expect(r.v2Total).toBe(2285121);
    expect(r.change).toBe(0);
    expect(r.asActuals).toEqual({ before: 145000, after: 145000 });
  });

  it('does not move the totals when an as-actuals estimate changes', () => {
    const d0 = startDraft(signed, boq(), bank);
    const tiles = d0.lines.find(l => l.name.includes('TILES'))!;
    const r = revisionFromDraft(signed, updateLine(d0, tiles.id, { rate: 60000 } as any));
    expect(r.change).toBe(0);
    expect(Math.abs(r.bridgeGap)).toBeLessThan(0.01);
    expect(r.asActuals).toEqual({ before: 145000, after: 175000 });
  });

  it('counts a priced line that becomes as actuals as leaving FFDS’s price', () => {
    const d0 = startDraft(signed, boq(), bank);
    const demo = d0.lines.find(l => l.name.includes('DEMOLISH'))!;
    const d1 = { ...d0, lines: d0.lines.map(l => (l.id === demo.id ? { ...l, name: 'DEMOLISH FULL L WALL (AS ACTUALS)', source: 'edit' as const } : l)) };
    const r = revisionFromDraft(signed, d1);
    expect(r.v2Total).toBe(2140121);
    expect(r.change).toBe(-145000);
    expect(r.bridge.removed).toBe(-145000);
    expect(Math.abs(r.bridgeGap)).toBeLessThan(0.01);
  });

  it('builds the revised BOQ with the as-actuals still in it, priced the same way', () => {
    const d0 = startDraft(signed, boq(), bank);
    const wardrobe = d0.lines.find(l => l.name.includes('WARDOBE'))!;
    const draft = updateLine(d0, wardrobe.id, { qty: 0.9 } as any);
    const r = revisionFromDraft(signed, draft);
    const revised = buildBoqFromDraft(boq(), signed, draft, bank, 2);
    expect(revised.some(b => isAsActuals(b, b.name) && /TILES/.test(b.name))).toBe(true);
    expect(revised.some(b => b.boqStatus === 'as_actuals' && /ELECTRICAL/.test(b.name))).toBe(true);
    expect(boqTotal(revised, bank)).toBeCloseTo(r.v2Total, 2);
    expect(asActualsTotal(revised, bank)).toBe(145000);
  });
});

describe('a contract already in force', () => {
  const ctx = (over: any = {}): any => ({
    approvedTierId: 'tier-v2',
    financials: { approvedExecutionValue: 2430121, approvedDesignValue: 169492, paymentRevisions: [] },
    paymentMilestones: [{ id: 'm1', type: 'execution', name: 'Advance', percentage: 100, status: 'pending' }],
    paymentSchedules: [{ id: 'ps1', version: 1, status: 'acknowledged', advances: [] }],
    ...over,
  });
  const tiers: any[] = [{ id: 'tier-v2', name: 'Detailed BOQ v2 · Scope Revision 1', boq: [], summary: { totalSell: 2285121, asActualsTotal: 145000, designFee: 169492 } }];

  it('is found when its approved value still counts the as-actuals', () => {
    expect(asActualsInContract(ctx(), tiers)).toMatchObject({ asActuals: 145000, from: 2430121, to: 2285121 });
  });

  it('is left alone once corrected, or when the value was set some other way', () => {
    expect(asActualsInContract(ctx({ financials: { approvedExecutionValue: 2285121 } }), tiers)).toBeNull();
    expect(asActualsInContract(ctx({ financials: { approvedExecutionValue: 2500000 } }), tiers)).toBeNull();
    expect(asActualsInContract(ctx({ approvedTierId: undefined }), tiers)).toBeNull();
  });

  it('takes them out on a click: the value, a logged revision, and a draft schedule for the client', () => {
    const c = asActualsInContract(ctx(), tiers)!;
    const next = takeAsActualsOut(c, 'Anish K', Date.parse('2026-10-30T12:00:00Z'))(ctx());
    expect(next.financials!.approvedExecutionValue).toBe(2285121);
    expect(next.financials!.approvedDesignValue).toBe(169492);
    expect(next.financials!.paymentRevisions!.slice(-1)[0]).toMatchObject({ previousExecutionValue: 2430121, newExecutionValue: 2285121 });
    const draft = next.paymentSchedules!.find(s => s.status === 'draft')!;
    expect(draft.version).toBe(2);
    /* Twice is once: the second click finds nothing to do. */
    expect(takeAsActualsOut(c, 'Anish K')(next)).toBe(next);
  });
});
