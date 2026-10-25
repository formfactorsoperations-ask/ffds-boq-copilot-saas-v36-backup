import { describe, it, expect } from 'vitest';
import { cleanSpec, parseSpec, specLabel } from '../../lib/specText';
import { parseRevisionSheet } from '../../lib/scopeRevision';
import { buildDetailedBoqSnapshot, clientNote } from '../../lib/detailedBoq';
import { mergeExcel, startDraft } from '../../lib/scopeDraft';
import { computeRevision, defaultSettings } from '../../lib/scopeRevision';
import { buildDetailedBoqWorkbook } from '../../lib/scopeWorkbook';
import { readSpec } from '../../components/client/PortalLineSpec';

/*
  Unique Vistas would not sign a BOQ that did not say what each line includes,
  excludes and is made of. The studio wrote the specifications into the client
  sheet's Specifications column; these follow them from that sheet to the
  client's portal, document and Excel without losing a line.
*/

const SAFETY_DOOR = [
  '35 mm laminated safety door · MS grill · BWP frame cladding · Enox/Godrej lock',
  '',
  'SCOPE: New safety door at the main entrance, in laminate finish',
  'MATERIAL:',
  '• Door frame cladding: BWP plywood',
  '• Safety door: 35 mm thick · MS grill, powder-coated (colour of your choice)',
  'FINISH: 1 mm laminate both faces, to the approved design',
  'HARDWARE:',
  '• Lock set: Enox/Godrej · allowance ₹3,000',
  '• Handle set: any brand · allowance ₹2,000',
  'LAMINATE: Allowance ₹1,800 per sheet',
  'EXCLUDES:',
  '• Shifting of the existing main door (separate item)',
  '• Video door phone, digital / smart lock',
  'NOTE: A selection above any allowance is charged at the difference',
].join('\n');

describe('reading a specification', () => {
  it('splits the summary from its labelled sections', () => {
    const s = parseSpec(SAFETY_DOOR);
    expect(s.summary).toBe('35 mm laminated safety door · MS grill · BWP frame cladding · Enox/Godrej lock');
    expect(s.sections.map(x => x.label)).toEqual(['SCOPE', 'MATERIAL', 'FINISH', 'HARDWARE', 'LAMINATE', 'EXCLUDES', 'NOTE']);
    expect(s.sections[1].items).toEqual([
      'Door frame cladding: BWP plywood',
      'Safety door: 35 mm thick · MS grill, powder-coated (colour of your choice)',
    ]);
    expect(s.sections[0].items).toEqual(['New safety door at the main entrance, in laminate finish']);
    expect(specLabel('EXCLUDES')).toBe('Excludes');
  });

  it('does not read a sentence or a bullet with a colon as a section', () => {
    const s = parseSpec('Panelling\n\nMATERIAL: Frame: 18 mm plywood · facing: 8 mm plywood\n• Door frame: BWP');
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0]).toEqual({ label: 'MATERIAL', items: ['Frame: 18 mm plywood · facing: 8 mm plywood', 'Door frame: BWP'] });
  });

  it('tidies the slips a spreadsheet collects without changing the words', () => {
    const raw = 'shoe cabinet · MR ply · 1 mm laminate · \r\n\r\n\r\nEXCLUDES:\n• Concealed wiring and points          • Concealed wiring and points\n•  Mirror';
    expect(cleanSpec(raw)).toBe('Shoe cabinet · MR ply · 1 mm laminate\n\nEXCLUDES:\n• Concealed wiring and points\n• Mirror');
  });

  it('reads text in no particular shape as a summary and one section', () => {
    expect(parseSpec('Glass partition with door')).toEqual({ summary: 'Glass partition with door', sections: [] });
    const s = parseSpec('Glass partition\n10 mm toughened glass\nSS patch fittings');
    expect(s.sections).toEqual([{ label: '', items: ['10 mm toughened glass', 'SS patch fittings'] }]);
  });

  it('shows nothing for an empty cell or an import placeholder', () => {
    expect(readSpec('')).toBeNull();
    expect(readSpec(undefined)).toBeNull();
    expect(readSpec('Imported via Excel')).toBeNull();
    expect(readSpec('Standard commercial specification')).toBeNull();
    expect(readSpec(SAFETY_DOOR)?.sections).toHaveLength(7);
  });
});

/* The Unique Vistas client sheet, as SheetJS hands it over. */
const HEADER = ['SR NO', 'ITEM', 'UNIT OF MEASUREMENT', 'QUANTITY', 'UNIT COST', 'TOTAL COST TO CLIENT', 'SPECIFICATIONS', 'Notes'];
const sheet = (): any[][] => [
  HEADER,
  ['ENTRANCE', null, null, null, null, 87437.5],
  [1, 'NEW SECURITY DOOR (LAMINATE)', 'SQFT.', 24.375, 2500, 60937.5, SAFETY_DOOR],
  [2, 'EXISTING DOOR SHIFTING CHARGES', 'LUMPSUM', 1, 7500, 7500, 'Existing main door shifted · removal, re-fixing and alignment\n\nSCOPE: Removing the existing main door'],
  [3, 'PANELLING', 'SQFT.', 15, 1440, 21600, ''],
  ['CIVIL WORKS', null, null, null, null, 30000],
  [27, 'TILES (AS ACTUALS)', 'LUMPSUM', 1, 30000, 30000, 'Material budget at actuals · tiles', 'As actual to be paid directly to vendor'],
  [28, 'OLD PLUMBING REMOVE AND CONCEAL - COMMON BATHROOM', 'LUMPSUM', 0, 0, 0, '', 'As per client request not removing existing plumbing'],
  ['TOTAL COST (EXCLD LOOSE FURNITURE)', null, null, null, null, 120037.5],
  ['SR NO', 'ITEM', 'UNIT OF MEASUREMENT', 'QUANTITY', 'UNIT COST', 'TOTAL COST TO CLIENT', 'SPECIFICATIONS', 'Notes'],
  [null, 'LIVING ROOM PARTITION - ROLLER BLINDS', 'SQFT.', 156.75, 650, 101887.5, 'Roller blinds', 'Option 2 - not added'],
];

describe('the client sheet with a Specifications column', () => {
  const parsed = parseRevisionSheet(sheet(), 'Client-BOQ');
  const byName = (n: string) => parsed.lines.find(l => l.name === n)!;

  it('reads every line and still adds up to the sheet total', () => {
    expect(parsed.internal).toBe(false);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.listTotal).toBeCloseTo(120037.5, 2);
    // Nothing after the TOTAL row is in the scope: the option below it stays out.
    expect(parsed.lines.map(l => l.name)).not.toContain('LIVING ROOM PARTITION - ROLLER BLINDS');
  });

  it('keeps each specification whole, line breaks and all', () => {
    expect(byName('NEW SECURITY DOOR (LAMINATE)').description).toBe(SAFETY_DOOR);
    expect(byName('EXISTING DOOR SHIFTING CHARGES').description).toContain('\n\nSCOPE: Removing');
    expect(byName('PANELLING').description).toBeUndefined();
  });

  it('keeps the Notes column as the note, not the specification', () => {
    const tiles = byName('TILES (AS ACTUALS)');
    expect(tiles.description).toBe('Material budget at actuals · tiles');
    expect(tiles.note).toBe('As actual to be paid directly to vendor');
    expect(byName('OLD PLUMBING REMOVE AND CONCEAL - COMMON BATHROOM').note).toBe('As per client request not removing existing plumbing');
  });

  it('reads an item held at 0 × 0 as a line, never as a room heading', () => {
    const p = parseRevisionSheet([
      HEADER,
      ['LIVING ROOM', null, null, null, null, 35100],
      [5, 'T.V. UNIT(DRAWER)', 'SQFT.', 8.25, 2280, 18810],
      [6, 'T.V. UNIT (TALL STORAGE + DISPLAY)', 'SQFT.', 0, 0, 0],
      [7, 'T.V. PANELING', 'SQFT.', 12, 1440, 17280],
      ['TOTAL', null, null, null, null, 36090],
    ], 'Client-BOQ');
    expect(p.sections).toEqual(['LIVING ROOM']);
    expect(p.lines.map(l => [l.section, l.name, l.qty])).toEqual([
      ['LIVING ROOM', 'T.V. UNIT(DRAWER)', 8.25],
      ['LIVING ROOM', 'T.V. UNIT (TALL STORAGE + DISPLAY)', 0],
      ['LIVING ROOM', 'T.V. PANELING', 12],
    ]);
    expect(p.warnings).toEqual([]);
  });

  it('still reads the studio\'s own export, room rows numbered and unpriced, as rooms', () => {
    const p = parseRevisionSheet([
      ['No.', 'Item', 'Specification', 'Unit', 'Qty', 'Rate (₹)', 'Amount (₹)'],
      ['1', 'ENTRANCE', '', '', '', '', 7500],
      ['1.1', 'Existing door shifting charges', '', 'lump sum', 1, 7500, 7500],
      ['', 'Total execution scope (before design fee and GST)', '', '', '', '', 7500],
    ], 'Revised BOQ');
    expect(p.sections).toEqual(['ENTRANCE']);
    expect(p.lines).toHaveLength(1);
  });

  it('reads older sheets, with specs under the name in the item cell, as before', () => {
    const old = parseRevisionSheet([
      ['SR NO', 'ITEM', 'UNIT', 'QTY', 'RATE', 'AMOUNT'],
      ['LIVING', null, null, null, null, null],
      [1, 'BAITHAK\n\nSpecs: 18 mm ply\nFinish: laminate', 'SQFT', 10, 100, 1000],
    ], 'Client');
    expect(old.lines[0].name).toBe('BAITHAK');
    expect(old.lines[0].description).toBe('Specs: 18 mm ply · Finish: laminate');
  });

  it('never takes the item column for the specification', () => {
    const p = parseRevisionSheet([
      ['NO', 'ITEM SPECIFICATION', 'UNIT', 'QTY', 'RATE', 'AMOUNT'],
      ['HALL', null, null, null, null, null],
      [1, 'Sofa', 'NOS', 1, 100, 100],
    ], 'Client');
    expect(p.lines[0].name).toBe('Sofa');
    expect(p.lines[0].description).toBeUndefined();
  });
});

describe('from the sheet to the revised scope', () => {
  const signed = [
    { lineId: 'l1', bankId: 'b1', room: 'Entrance', name: 'New security door (laminate)', unit: 'sq ft', qty: 24.375, rate: 2500, amount: 60937.5 },
    { lineId: 'l2', bankId: 'b2', room: 'Entrance', name: 'Existing door shifting charges', unit: 'lump sum', qty: 1, rate: 7500, amount: 7500 },
  ];
  const signedBoq = [
    { id: 'l1', bankId: 'b1', roomId: 'Entrance', qty: 24.375, name: 'New security door (laminate)', materials: 2000, labor: 500 },
    { id: 'l2', bankId: 'b2', roomId: 'Entrance', qty: 1, name: 'Existing door shifting charges', commercialNote: 'Added after sundays discussion', materials: 7000, labor: 500 },
  ];
  const sheetLines = parseRevisionSheet([
    HEADER,
    ['ENTRANCE', null, null, null, null, 68437.5],
    [1, 'NEW SECURITY DOOR (LAMINATE)', 'SQFT.', 24.375, 2500, 60937.5, SAFETY_DOOR],
    [2, 'EXISTING DOOR SHIFTING CHARGES', 'LUMPSUM', 1, 7500, 7500, 'Existing main door shifted · removal, re-fixing and alignment', 'Added after sundays discussion'],
    ['TOTAL', null, null, null, null, 68437.5],
  ], 'Client-BOQ');

  it('carries the specification onto every merged line, an edited one included', () => {
    const settings = { ...defaultSettings(signed as any, sheetLines), roomMap: { ENTRANCE: 'Entrance' }, roomNames: { ENTRANCE: 'Entrance' } };
    let draft = startDraft(signed as any, signedBoq, new Map());
    // The studio had already re-measured the door by hand.
    draft = { ...draft, lines: draft.lines.map(l => (l.signedLineId === 'l1' ? { ...l, qty: 25, source: 'edit' as const } : l)) };
    const merged = mergeExcel(draft, signed as any, sheetLines, {}, null, settings as any, 'uv.xlsx');
    const door = merged.lines.find(l => l.signedLineId === 'l1')!;
    expect(door.qty).toBe(25); // the edit stands
    expect(door.description).toBe(SAFETY_DOOR);
    const shifting = merged.lines.find(l => l.signedLineId === 'l2')!;
    expect(shifting.description).toBe('Existing main door shifted · removal, re-fixing and alignment');
    expect(shifting.note).toBe('Added after sundays discussion');
    expect(computeRevision(signed as any, sheetLines.lines, settings as any).rooms[0].lines.every(l => l.kind === 'same')).toBe(true);
  });
});

describe('the frozen BOQ and its Excel', () => {
  const snapshot = buildDetailedBoqSnapshot({
    context: { name: 'Unique Vistas', clientName: 'Mr Prasad & Mrs Mrunal Naik' } as any,
    tier: {
      id: 't1',
      boq: [
        { id: 'l1', roomId: 'Entrance', name: 'New security door (laminate)', unit: 'sq ft', qty: 24.375, materials: 2500, labor: 0, marginOverride: 0, description: SAFETY_DOOR },
        { id: 'l2', roomId: 'Civil works', name: 'Tiles (as actuals)', unit: 'lump sum', qty: 1, materials: 30000, labor: 0, marginOverride: 0, description: 'Material budget at actuals · tiles', commercialNote: 'As actual to be paid directly to vendor' },
        { id: 'l3', roomId: 'Civil works', name: 'Debris removal', unit: 'nos', qty: 3, materials: 7200, labor: 0, marginOverride: 0, commercialNote: 'Added after sundays discussion' },
      ],
    },
    bankMap: new Map(),
    version: 4,
    reference: 'FFDS-BQ-2026-UV-v4',
    approval: { mode: 'signature' } as any,
  });
  const line = (id: string) => snapshot.rooms.flatMap(r => r.lines).find(l => l.id === id)!;

  it('freezes the specification and the note side by side', () => {
    expect(line('l1').description).toBe(SAFETY_DOOR);
    expect(line('l2').description).toBe('Material budget at actuals · tiles');
    expect(line('l2').note).toBe('As actual to be paid directly to vendor');
  });

  it('does not print a note twice where it stands in for the description', () => {
    expect(line('l3').description).toBe('Added after sundays discussion');
    expect(line('l3').note).toBeUndefined();
    expect(clientNote({ commercialNote: 'Imported via Excel' })).toBeUndefined();
  });

  it('writes the specification in full and the note in its own column', async () => {
    const ExcelJS: any = (await import('exceljs')).default;
    const buf = await buildDetailedBoqWorkbook(snapshot, { studioName: 'Form Factors Design Studio' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets.find((w: any) => w.getColumn(3).values.some((v: any) => v === 'Specification'));
    expect(ws).toBeTruthy();
    let headerRow: any;
    ws.eachRow((r: any) => { if (r.getCell(3).value === 'Specification') headerRow = r; });
    expect(headerRow.getCell(8).value).toBe('Note');
    let door: any;
    let tiles: any;
    ws.eachRow((r: any) => {
      if (r.getCell(2).value === 'New security door (laminate)') door = r;
      if (r.getCell(2).value === 'Tiles (as actuals)') tiles = r;
    });
    expect(String(door.getCell(3).value)).toContain('HARDWARE:\n• Lock set: Enox/Godrej · allowance ₹3,000');
    expect(door.height).toBeGreaterThan(150);
    expect(tiles.getCell(8).value).toBe('As actual to be paid directly to vendor');
    // The amount is still quantity × rate in column G.
    expect(door.getCell(7).value.formula).toBe(`E${door.number}*F${door.number}`);
  });
});
