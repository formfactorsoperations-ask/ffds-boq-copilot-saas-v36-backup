import { describe, it, expect } from 'vitest';
import {
  BANK_BYTES_LIMIT, applySpecs, bankBytes, buildSpecSheetWorkbook, matchSpecRows, normName, parseSpecSheet, specSheetRows, specUpdates,
} from '../../lib/bankSpecs';
import { buildDetailedBoqSnapshot } from '../../lib/detailedBoq';

/*
  The Item Bank is the studio's source of truth for specifications: written
  once per item, used by every project. These follow a spec sheet from the
  bank export, through Excel, back into the bank — touching nothing but specs.
*/

const item = (id: string, name: string, over: any = {}): any => ({
  id, name, cat: 'Carpentry', unit: 'sq ft', specs: '', internalSpecs: 'Vendor: Sharma ply', materials: 1800, labor: 400, margin: 25, ...over,
});

const DOOR_SPEC = '35 mm laminated safety door · MS grill\n\nMATERIAL:\n• Door frame cladding: BWP plywood\nEXCLUDES:\n• Video door phone';

const bank = () => [
  item('b1', 'NEW SECURITY DOOR (LAMINATE)', { cat: 'Doors' }),
  item('b2', 'T.V. UNIT(DRAWER)', { specs: 'TV base unit · MR ply' }),
  item('b3', 'Storage unit'),
  item('b4', 'Storage Unit', { cat: 'Loose' }),
  item('b5', 'Wardrobe with loft'),
];

describe('reading a spec sheet', () => {
  it('reads the bank export: item id, name and specification', () => {
    const p = parseSpecSheet([
      ['Item ID', 'Item', 'Category', 'Unit', 'Specification'],
      ['b1', 'NEW SECURITY DOOR (LAMINATE)', 'Doors', 'sq ft', DOOR_SPEC],
      ['b2', 'T.V. UNIT(DRAWER)', 'Carpentry', 'sq ft', ''],
    ]);
    expect(p.error).toBeUndefined();
    // An empty cell never clears a spec: the TV unit row is left out.
    expect(p.rows).toEqual([{ row: 2, id: 'b1', name: 'NEW SECURITY DOOR (LAMINATE)', spec: DOOR_SPEC }]);
  });

  it('reads a client BOQ with a Specifications column, skipping room rows and stopping at the total', () => {
    const p = parseSpecSheet([
      ['SR NO', 'ITEM', 'UNIT OF MEASUREMENT', 'QUANTITY', 'UNIT COST', 'TOTAL COST TO CLIENT', 'SPECIFICATIONS', 'Notes'],
      ['ENTRANCE', null, null, null, null, 60937.5],
      [1, 'NEW SECURITY DOOR (LAMINATE)', 'SQFT.', 24.375, 2500, 60937.5, DOOR_SPEC],
      ['TOTAL COST', null, null, null, null, 60937.5],
      [null, 'LIVING ROOM PARTITION', 'SQFT.', 10, 650, 6500, 'Roller blinds'],
    ]);
    expect(p.rows.map(r => r.name)).toEqual(['NEW SECURITY DOOR (LAMINATE)']);
    expect(p.rows[0].id).toBeUndefined();
  });

  it('reads the specification, not a status column beside it, in a review sheet', () => {
    // A review sheet: a status column ("Spec source") ahead of the real one, and a "Bank item" column.
    const p = parseSpecSheet([
      ['SR NO', 'Bank item', 'ITEM', 'Spec source', 'UNIT', 'SPECIFICATIONS'],
      [1, 'Yes', 'EXISTING DOOR SHIFTING CHARGES', 'Project-specific (new)', 'LUMPSUM', 'Existing main door shifted · removal, re-fixing and alignment\n\nSCOPE: Removing the existing main door'],
      [2, 'Yes', 'NEW SECURITY DOOR (LAMINATE)', 'Bank', 'SQFT.', DOOR_SPEC],
    ]);
    expect(p.columns).toEqual({ name: 'ITEM', spec: 'SPECIFICATIONS' });
    expect(p.rows.map(r => [r.name, r.spec.split('\n')[0]])).toEqual([
      ['EXISTING DOOR SHIFTING CHARGES', 'Existing main door shifted · removal, re-fixing and alignment'],
      ['NEW SECURITY DOOR (LAMINATE)', '35 mm laminated safety door · MS grill'],
    ]);
  });

  it('says so when the sheet has no Specification column', () => {
    expect(parseSpecSheet([['Item', 'Qty']]).error).toMatch(/Specification column/);
  });
});

describe('matching rows to bank items', () => {
  it('matches by id first, then by name however the name is punctuated', () => {
    expect(normName('T.V. UNIT(DRAWER)')).toBe(normName('TV unit (drawer)'));
    const m = matchSpecRows([
      { row: 2, id: 'b1', name: 'Renamed in Excel', spec: DOOR_SPEC },
      { row: 3, name: 'TV unit (drawer)', spec: 'TV base unit · MR ply · 3 drawers' },
    ], bank());
    expect(m.map(x => [x.itemId, x.how, x.status])).toEqual([['b1', 'id', 'update'], ['b2', 'name', 'update']]);
  });

  it('asks the studio to pick when two items share the name, and suggests the nearest when none matches', () => {
    const m = matchSpecRows([
      { row: 2, name: 'STORAGE UNIT', spec: 'Storage unit · MR ply' },
      { row: 3, name: 'Wardobe with loft', spec: 'Sliding wardrobe' },
    ], bank());
    expect(m[0].status).toBe('ambiguous');
    expect(m[0].candidates.sort()).toEqual(['b3', 'b4']);
    expect(m[1].status).toBe('unmatched');
    // "Wardobe" (the sheet's spelling) still shares "with loft" with the bank's wardrobe.
    expect(m[1].candidates).toContain('b5');
  });

  it("takes the studio's pick, and a skip", () => {
    const rows = [
      { row: 2, name: 'STORAGE UNIT', spec: 'Storage unit · MR ply' },
      { row: 3, name: 'Wardobe with loft', spec: 'Sliding wardrobe' },
    ];
    const m = matchSpecRows(rows, bank(), { 2: 'b3', 3: 'skip' });
    expect(m.map(x => [x.itemId, x.how, x.status])).toEqual([['b3', 'picked', 'update'], [null, null, 'skipped']]);
  });

  it('uses the first of two rows that give one item different specs, until the studio picks', () => {
    const rows = [
      { row: 5, name: 'Wardrobe with loft', spec: 'Sliding wardrobe — daughters' },
      { row: 9, name: 'Wardrobe with loft', spec: 'Sliding wardrobe — master' },
    ];
    let m = matchSpecRows(rows, bank());
    expect(m.map(x => x.status)).toEqual(['update', 'conflict']);
    expect(m[1].conflictWith).toBe('5');
    expect(specUpdates(m).get('b5')).toBe('Sliding wardrobe — daughters');
    m = matchSpecRows(rows, bank(), { 5: 'skip' });
    expect(specUpdates(m).get('b5')).toBe('Sliding wardrobe — master');
  });

  it('counts a spec the bank already has as unchanged', () => {
    const m = matchSpecRows([{ row: 2, name: 'T.V. UNIT(DRAWER)', spec: 'TV base unit · MR ply' }], bank());
    expect(m[0].status).toBe('same');
    expect(specUpdates(m).size).toBe(0);
  });
});

describe('writing specs into the bank', () => {
  it('changes the specification and nothing else on the item', () => {
    const before = bank();
    const after = applySpecs(before, new Map([['b1', DOOR_SPEC]]));
    expect(after[0]).toEqual({ ...before[0], specs: DOOR_SPEC });
    expect(after.slice(1)).toEqual(before.slice(1));
    expect(after).toHaveLength(before.length);
  });

  it('knows how large the saved bank would be', () => {
    const big = Array.from({ length: 400 }, (_, i) => item(`x${i}`, `Item ${i}`, { specs: 'x'.repeat(2500) }));
    expect(bankBytes(big)).toBeGreaterThan(BANK_BYTES_LIMIT);
    expect(bankBytes(bank())).toBeLessThan(BANK_BYTES_LIMIT);
  });

  it('exports what each item is and its spec, never its price or internal notes', async () => {
    const rows = specSheetRows(bank());
    expect(Object.keys(rows[0]).sort()).toEqual(['cat', 'id', 'name', 'spec', 'unit']);
    const ExcelJS: any = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildSpecSheetWorkbook(applySpecs(bank(), new Map([['b1', DOOR_SPEC]])), 'Form Factors'));
    const ws = wb.getWorksheet('Item specs');
    expect(ws.getRow(1).values.slice(1)).toEqual(['Item ID', 'Item', 'Category', 'Unit', 'Specification']);
    const all = JSON.stringify(ws.getSheetValues());
    expect(all).not.toContain('Sharma');
    expect(all).not.toContain('1800');
    // And it reads straight back in.
    const back = parseSpecSheet(ws.getSheetValues().slice(1).map((r: any) => (r || []).slice(1)));
    expect(back.rows.find(r => r.id === 'b1')?.spec).toBe(DOOR_SPEC);
  });
});

describe('every project reads the spec from the bank', () => {
  it('a BOQ line with no spec of its own shows the bank item\'s spec', () => {
    const b = applySpecs(bank(), new Map([['b1', DOOR_SPEC]]));
    const snap = buildDetailedBoqSnapshot({
      context: { name: 'Any project' } as any,
      tier: { id: 't', boq: [
        { id: 'l1', bankId: 'b1', roomId: 'Entrance', qty: 1 },
        { id: 'l2', bankId: 'b1', roomId: 'Hall', qty: 1, specs: 'Imported via revised BOQ Excel' },
        { id: 'l3', bankId: 'b1', roomId: 'Bedroom', qty: 1, description: 'Safety door with video phone provision' },
      ] },
      bankMap: new Map(b.map(i => [i.id, i])),
      version: 1,
      reference: 'X',
      approval: { mode: 'signature' } as any,
    });
    const d = (id: string) => snap.rooms.flatMap(r => r.lines).find(l => l.id === id)!.description;
    expect(d('l1')).toBe(DOOR_SPEC);
    // Import filler on the line does not hide the bank's spec.
    expect(d('l2')).toBe(DOOR_SPEC);
    // A project may still say more on its own line.
    expect(d('l3')).toBe('Safety door with video phone provision');
  });
});
