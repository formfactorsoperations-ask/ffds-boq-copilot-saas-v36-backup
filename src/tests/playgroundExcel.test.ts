import { describe, it, expect } from 'vitest';
import {
  studioRows, clientGroups, readStudio, studioDiff, applyStudio, readVendor, importPlan, importLines,
  sizeFromName, nameWithoutSize, matchBankItem, roomFor, fingerprintOf, lineIdAt, type Grid,
} from '../../lib/playground/excel';
import { buildStudioBook, buildClientBook, readBook } from '../../lib/playground/excelBook';
import { PLAYGROUND_PRICING } from '../../lib/playground/pricing';
import { studioStandard } from '../../lib/materialSpecs';
import { withRecipeSpecs } from '../../lib/lineSpecs';

const I = (id: string, name: string, cat: string, unit: string, materials: number, labor: number, margin = 25): any => ({ id, name, cat, unit, materials, labor, margin, specs: '' });
const bank: any[] = [
  I('w', 'Sliding wardrobe', 'Carpentry', 'sq ft', 1500, 400), I('p', 'Wall painting, two coats', 'Painting', 'sq ft', 20, 10, 12),
  I('b3', 'Loft', 'Carpentry', 'sq ft', 900, 300), I('b4', 'Pooja unit', 'Carpentry', 'sq ft', 1600, 400),
];
const bankMap = new Map(bank.map(b => [b.id, b]));
const rooms: any[] = [
  { name: 'Master Bedroom', size: 156, unit: 'sq ft', plan: { x: 0, y: 0, w: 12, h: 13 } },
  { name: 'Living Room', size: 182, unit: 'sq ft', plan: { x: 12, y: 0, w: 14, h: 13 } },
  { name: 'Store', size: 40, unit: 'sq ft', plan: { x: 26, y: 0, w: 5, h: 8 } },
];
const spec = studioStandard();
const boq: any[] = [
  withRecipeSpecs({ id: 'a', bankId: 'w', qty: 42, roomId: 'Master Bedroom', baseRate: 1500, calcLength: 6, calcWidth: 7, sizeUnit: 'ft' } as any, bank[0], spec, 'C'),
  { id: 'b', bankId: 'p', qty: 400, roomId: 'Living Room' },
  { id: 'c', bankId: 'w', qty: 30, roomId: 'Living Room', boqStatus: 'deleted' },
];
const ctx = { bankMap, rules: PLAYGROUND_PRICING, rooms, specBank: spec };
const meta = { studio: 'Form Factors Design Studio', project: 'Palacia – 3BHK', option: 'Comfort Upgrade', tierId: 't1', roundTo100: true, at: Date.UTC(2026, 10, 19) };
let n = 0;
const newId = () => `n${++n}`;

describe('the studio copy, out', () => {
  it('has every live line with its Line ID, words, materials with versions, size, cost, markup, rate and rounded amount', () => {
    const rows = studioRows(boq, ctx);
    expect(rows.map(r => r.lineId)).toEqual(['L-0001', 'L-0002']);
    expect(rows[0]).toMatchObject({ key: 'a', room: 'Master Bedroom', item: 'Sliding wardrobe', w: 6, h: 7, qty: 42, unit: 'sq ft', cost: 1900, markup: 25, rate: 2375, amount: 99800 });
    expect(rows[0].materials).toContain('Outer finish: Designer laminate, 1 mm v2');
    expect(rows[0].words).toMatch(/^18 mm BWR-grade plywood carcass/);
    expect(rows[1]).toMatchObject({ cost: 30, markup: 12, amount: 13500 });
    expect(lineIdAt(41)).toBe('L-0042');
  });

  it('the client copy groups billable lines by room, with no cost', () => {
    const c = clientGroups(boq, ctx);
    expect(c.groups.map(g => g.room)).toEqual(['Master Bedroom', 'Living Room']);
    expect(c.total).toBe(99800 + 13500);
    expect(Object.keys(c.groups[0].rows[0])).not.toContain('cost');
  });
});

describe('a studio copy, back in by its Line IDs', () => {
  it('round-trips: the workbook reads back as the same BOQ, nothing changed', async () => {
    const book = await readBook(await buildStudioBook(boq, ctx, meta));
    expect(Object.keys(book)).toEqual(['BOQ', 'Rooms', 'Material specs', 'Read me']);
    const s = readStudio(book)!;
    expect(s.meta).toMatchObject({ project: 'Palacia – 3BHK', option: 'Comfort Upgrade', tierId: 't1', fingerprint: fingerprintOf(boq) });
    const d = studioDiff(s, boq, { ...ctx, bank, newId });
    expect(d.changes).toEqual([]);
    expect(d.unchanged).toBe(2);
    expect(d.changedSince).toBe(false);
  });

  it('a changed row updates its own line; a new row is a new line; a missing row is offered for deletion; one write', async () => {
    const book = await readBook(await buildStudioBook(boq, ctx, meta));
    const g = book.BOQ as Grid;
    const h = g.findIndex(r => r[0] === 'Line ID');
    const col = (name: string) => g[h].indexOf(name);
    const rowA = g.findIndex(r => r[0] === 'L-0001');
    g[rowA][col('Width ft')] = 7; // 7 × 7 ft
    g[rowA][col('Markup %')] = 22;
    const rowB = g.findIndex(r => r[0] === 'L-0002');
    g.splice(rowB, 1); // painting deleted in the sheet
    g.splice(rowA + 1, 0, [null, 'Store', 'Loft over store, 6 x 2 ft', '', '', '', 6, 2, null, 'sq ft', null, null, null, null, null]);
    const d = studioDiff(readStudio(book)!, boq, { ...ctx, bank, newId });
    expect(d.changes.map(c => c.kind)).toEqual(['chg', 'new', 'del']);
    expect(d.changes[0].what).toBe('Width 6′ → 7′ · Markup 25.0% → 22.0%');
    expect(d.changes[0].after).toMatchObject({ qty: 49, marginOverride: 22, calcLength: 7 });
    expect(d.changes[0].delta).toBe(Math.ceil((1900 * 1.22 * 49) / 100) * 100 - 99800);
    expect(d.changes[1].after).toMatchObject({ bankId: 'b3', roomId: 'Store', qty: 12 });
    expect(d.changes[2]).toMatchObject({ id: 'b', what: 'Row deleted in the sheet', delta: -13500 });
    // A deleted row is never removed on its own: only when ticked.
    const kept = applyStudio(boq, d.changes, new Set([0, 1]));
    expect(kept.map(l => l.id)).toEqual(['a', 'b', 'c', d.changes[1].after!.id]);
    expect(kept[0].qty).toBe(49);
    const all = applyStudio(boq, d.changes, new Set([0, 1, 2]));
    expect(all.some(l => l.id === 'b')).toBe(false);
  });

  it('says when the BOQ changed after the export', async () => {
    const s = readStudio(await readBook(await buildStudioBook(boq, ctx, meta)))!;
    const later = boq.map(l => (l.id === 'b' ? { ...l, qty: 420 } : l));
    const d = studioDiff(s, later, { ...ctx, bank, newId });
    expect(d.changedSince).toBe(true);
    expect(d.changes[0]).toMatchObject({ kind: 'chg', id: 'b', what: 'Qty 420 → 400' });
  });

  it('the client copy is locked and carries no cost, markup or Line ID', async () => {
    const book = await readBook(await buildClientBook(boq, ctx, meta));
    expect(Object.keys(book)).toEqual(['BOQ', 'Material specifications']);
    const flat = JSON.stringify(book.BOQ);
    expect(flat).toContain('Total for the work');
    expect(flat).toContain('99800');
    expect(flat).not.toMatch(/Cost|Markup|L-0001/);
  });
});

/* The mockup's other sheet: Rao inputs – carpentry list.xlsx. */
const SAMPLE: Grid = [
  ['Rao inputs – carpentry list'],
  [],
  ['Item', 'Location', 'Qty', 'Unit', 'Rate'],
  ['Loft over store shelves, 6 x 2 ft', 'Store', null, 'sq ft', 1500],
  ['Pooja unit 3 x 4 ft', 'Living', null, 'sq ft', 2600],
  ['Wallpaper on the bed wall', 'Master', 120, 'sq ft', 180],
  ['Curtain tracks, motorised', null, 4, 'nos', 9500],
  ['Total', null, null, null, 66620],
];

describe('any other sheet onto the plan (importPlan)', () => {
  const read = readVendor(SAMPLE);

  it('matches the columns as today, and reads sizes in the item name', () => {
    expect(read.matched).toEqual([['Item', 'item'], ['Location', 'room'], ['Qty', 'Qty'], ['Unit', 'Unit'], ['Rate', 'client rate']]);
    expect(read.rows).toHaveLength(4);
    expect(read.rows[0]).toMatchObject({ sheet: 'Loft over store shelves, 6 x 2 ft', room: 'Store', rate: 1500, size: { w: 6, h: 2 } });
    expect(sizeFromName('Pooja unit 3 x 4 ft')).toEqual({ w: 3, h: 4 });
    expect(nameWithoutSize('Loft over store shelves, 6 x 2 ft')).toBe('Loft over store shelves');
    expect(matchBankItem('Loft over store shelves, 6 x 2 ft', bank)!.id).toBe('b3');
    expect(matchBankItem('Wallpaper on the bed wall', bank)).toBeUndefined();
    expect(roomFor('Master', rooms.map(r => r.name))).toBe('Master Bedroom');
  });

  it('places each row in its room, prices it to the sheet, flags what is not in the Item Bank, and writes nothing', () => {
    const before = JSON.stringify(boq);
    const plan = importPlan(read.rows, { bank, bankMap, rooms, boq, newId, fallbackRoom: 'Living Room' });
    expect(JSON.stringify(boq)).toBe(before);
    const [loft, pooja, paper, curtain] = plan;
    expect(loft).toMatchObject({ room: 'Store', lands: 'plan' });
    expect(loft.item!.id).toBe('b3');
    expect(loft.line).toMatchObject({ bankId: 'b3', qty: 12, calcLength: 6, calcWidth: 2 });
    // The bank's cost of ₹1,200 a sq ft, marked up 25% to meet the sheet's ₹1,500.
    expect(loft).toMatchObject({ cost: 1200, markup: 25 });
    expect(Math.round(loft.margin)).toBe(20);
    expect(pooja).toMatchObject({ room: 'Living Room', markup: 30 });
    expect(paper.item).toBeUndefined();
    expect(paper).toMatchObject({ room: 'Master Bedroom', lands: 'list', cost: 144, markup: 25 });
    expect(paper.line).toMatchObject({ name: 'Wallpaper on the bed wall', cat: 'Imported', qty: 120, unit: 'sq ft', baseRate: 144 });
    expect(curtain).toMatchObject({ room: 'Living Room', lands: 'room' });
    // A cost typed for a row not in the bank sets its markup.
    const typed = importPlan(read.rows, { bank, bankMap, rooms, boq, newId, fallbackRoom: 'Living Room', costs: { 2: 120 } });
    expect(typed[2]).toMatchObject({ cost: 120, markup: 50 });
  });

  it('adds to the Item Bank only the rows the Owner ticks', () => {
    const plan = importPlan(read.rows, { bank, bankMap, rooms, boq, newId, fallbackRoom: 'Living Room' });
    const none = importLines(plan, new Set(), newId);
    expect(none.items).toEqual([]);
    const ticked = importLines(plan, new Set([2, 0]), newId);
    expect(ticked.items).toHaveLength(1);
    expect(ticked.items[0]).toMatchObject({ name: 'Wallpaper on the bed wall', cat: 'Imported', unit: 'sq ft', materials: 144, labor: 0, margin: 25 });
    expect(ticked.lines[2].bankId).toBe(ticked.items[0].id);
    expect(ticked.lines[0]).toBe(plan[0].line);
  });
});
