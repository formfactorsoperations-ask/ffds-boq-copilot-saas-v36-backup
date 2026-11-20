/**
 * BOQ Playground PR 6 — the Excel files themselves.
 *
 *   studio copy   BOQ (Line IDs, live formulas, blue cells to edit), Rooms,
 *                 Material specs and Read me sheets. Not locked: it is for
 *                 editing and comes back in by its Line IDs
 *   client copy   BOQ by room and the material specifications, locked, with no
 *                 cost, markup or Line ID
 *
 * Written with exceljs (as lib/scopeWorkbook writes the scope workbooks) and
 * read with SheetJS (as today's Excel import reads), in the browser.
 */
import type { BoqItem, Room } from '../../types';
import { rangeLabel } from '../materialSpecs';
import { separateOf } from './supply';
import {
  STUDIO_MARK, studioRows, clientGroups, fingerprintOf, type ExcelContext, type Grid,
} from './excel';

const FONT = 'Plus Jakarta Sans';
const INK = 'FF141A33';
const MUTED = 'FF5B6382';
const BLUE = 'FF3D52A0';
const EDIT = 'FFEEF2FB';
const ROOM = 'FFE9EEF9';
const GRID = 'FFD5DBE8';
const NUM = '#,##0';
const NUM2 = '#,##0.00';
const thin = { style: 'thin', color: { argb: GRID } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

export interface BookMeta {
  studio: string;
  project: string;
  option: string;
  tierId: string;
  /** Playground rounding: every amount up to ₹100. */
  roundTo100: boolean;
  at?: number;
}

async function newBook(meta: BookMeta, title: string) {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.studio;
  wb.lastModifiedBy = meta.studio;
  wb.created = new Date(meta.at || Date.now());
  wb.title = title;
  return wb;
}

function sheetOf(wb: any, name: string) {
  return wb.addWorksheet(name, {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: BLUE } },
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
}

function font(ws: any) {
  ws.eachRow({ includeEmpty: true }, (row: any) => row.eachCell({ includeEmpty: true }, (c: any) => {
    const f = c.font || {};
    c.font = { name: FONT, size: f.size || 10, bold: !!f.bold, italic: !!f.italic, color: f.color || { argb: INK } };
  }));
}

function head(ws: any, cells: string[]) {
  const r = ws.addRow(cells);
  r.eachCell((c: any) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(BLUE); c.border = box; c.alignment = { vertical: 'middle', wrapText: true }; });
  r.height = 22;
  return r;
}

const randomPassword = () => {
  const a = new Uint8Array(12);
  (globalThis.crypto || (window as any).crypto).getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
};

/** The materials the lines use, at their versions, once each. */
function materialsUsed(boq: BoqItem[], ctx: ExcelContext) {
  const bank = ctx.specBank;
  if (!bank) return [];
  const seen = new Map<string, { part: string; id: string; v: number }>();
  boq.forEach(l => Object.entries(l.materialSpecs || {}).forEach(([part, s]) => { const k = `${s.id}@${s.v}`; if (!seen.has(k)) seen.set(k, { part, id: s.id, v: s.v }); }));
  return [...seen.values()].map(({ part, id, v }) => {
    const m = bank.materials.find(x => x.id === id);
    const h = bank.versions.find(x => x.mat === id && x.v === v);
    const fam = bank.families.find(f => f.id === m?.fam);
    return { family: fam?.name || part, name: m?.name || id, v, words: h?.words || '', brand: h?.brand || '', range: h?.range ? rangeLabel(h.range) : '' };
  });
}

/** The studio copy: edit it in Excel and import it back by its Line IDs. */
export async function buildStudioBook(boq: BoqItem[], ctx: ExcelContext, meta: BookMeta): Promise<ArrayBuffer> {
  const wb = await newBook(meta, `${meta.project} · ${meta.option} · studio copy`);
  const rows = studioRows(boq, ctx);

  const ws = sheetOf(wb, 'BOQ');
  ws.addRow([`${meta.project} · ${meta.option}`]).getCell(1).font = { bold: true, size: 14 };
  ws.addRow(['Studio copy. Blue cells edit: room, specification, size, qty, cost and markup. Rate and amount are formulas. Import it back from the Playground: each row updates its own line by its Line ID.']).getCell(1).font = { color: { argb: MUTED } };
  ws.addRow([]);
  head(ws, ['Line ID', 'Room', 'Item', 'Category', 'Specification', 'Materials', 'Width ft', 'Height ft', 'Qty', 'Unit', 'Cost / unit', 'Markup %', 'Rate', 'Amount', 'Key']);
  const first = ws.rowCount + 1;
  rows.forEach(r => {
    const n = ws.rowCount + 1;
    const row = ws.addRow([
      r.lineId, r.room, r.item, r.cat, r.words, r.materials, r.w ?? null, r.h ?? null, r.qty, r.unit, r.cost, r.markup,
      { formula: `ROUND(K${n}*(1+L${n}/100),2)`, result: r.rate },
      { formula: meta.roundTo100 ? `CEILING(M${n}*I${n},100)` : `M${n}*I${n}`, result: r.amount },
      r.key,
    ]);
    row.eachCell({ includeEmpty: true }, (c: any, col: number) => {
      c.border = box;
      c.alignment = { vertical: 'top', wrapText: col === 5 || col === 6 };
      if ([2, 5, 7, 8, 9, 11, 12].includes(col)) { c.fill = fill(EDIT); c.font = { color: { argb: BLUE } }; }
      if ([7, 8, 9, 11, 12].includes(col)) c.numFmt = NUM2;
      if ([13, 14].includes(col)) c.numFmt = NUM;
    });
  });
  const last = ws.rowCount;
  const t = ws.addRow(['', '', 'Total', '', '', '', '', '', '', '', '', '', '', { formula: `SUM(N${first}:N${Math.max(first, last)})`, result: rows.reduce((a, r) => a + r.amount, 0) }]);
  t.font = { bold: true };
  t.getCell(14).numFmt = NUM;
  ws.columns.forEach((c: any, i: number) => { c.width = [9, 16, 28, 14, 48, 40, 9, 9, 9, 8, 11, 10, 11, 13, 14][i] || 12; });
  ws.getColumn(15).hidden = true;
  ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 3, showGridLines: false }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 14 } };
  font(ws);

  const rs = sheetOf(wb, 'Rooms');
  head(rs, ['Room', 'Kind', 'Length ft', 'Width ft', 'Area sq ft', 'On the plan']);
  (ctx.rooms || []).forEach((r: Room) => {
    rs.addRow([r.name, r.kind || '', r.plan ? Math.max(r.plan.w, r.plan.h) : r.length ?? null, r.plan ? Math.min(r.plan.w, r.plan.h) : r.width ?? null, r.size ?? null, r.plan ? 'Yes' : 'No'])
      .eachCell({ includeEmpty: true }, (c: any) => { c.border = box; });
  });
  rs.columns.forEach((c: any, i: number) => { c.width = [22, 12, 11, 11, 11, 12][i]; });
  font(rs);

  const ms = sheetOf(wb, 'Material specs');
  head(ms, ['Family', 'Material', 'Version', 'Words the client reads', 'Brand or equivalent', 'Range']);
  materialsUsed(boq, ctx).forEach(m => ms.addRow([m.family, m.name, `v${m.v}`, m.words, m.brand, m.range]).eachCell({ includeEmpty: true }, (c: any) => { c.border = box; c.alignment = { wrapText: true, vertical: 'top' }; }));
  ms.columns.forEach((c: any, i: number) => { c.width = [18, 28, 9, 48, 30, 16][i]; });
  font(ms);

  const rd = sheetOf(wb, 'Read me');
  [
    ['Studio copy', STUDIO_MARK],
    ['Project', meta.project],
    ['Option', meta.option],
    ['Option id', meta.tierId],
    ['Exported', new Date(meta.at || Date.now()).toISOString()],
    ['Fingerprint', fingerprintOf(boq)],
    [],
    ['How to use it', 'Edit the blue cells on the BOQ sheet: room, specification, width and height (ft), qty, cost per unit and markup. A new row with no Line ID is a new line, matched by name to the Item Bank. Delete a row to offer that line for deletion.'],
    ['', 'In the Playground: Import Excel → A studio copy, edited in Excel. Every change is shown, priced, before it is saved, and it is one undo.'],
    ['', meta.roundTo100 ? 'Amounts round up to ₹100 a line. Whole-flat lines are rounded room by room in the app, so their amount there can be a little higher.' : 'Amounts are rate × qty.'],
    ['', 'Do not change the Key column (hidden) or this sheet: they tie each row to its line.'],
  ].forEach(r => rd.addRow(r));
  rd.getColumn(1).width = 16; rd.getColumn(2).width = 110;
  rd.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  font(rd);
  rd.getColumn(1).eachCell((c: any) => { c.font = { name: FONT, bold: true, size: 10, color: { argb: INK } }; });

  return wb.xlsx.writeBuffer();
}

/** The client copy: locked; item, specification, qty, unit, rate and amount by room; the material specifications. */
export async function buildClientBook(boq: BoqItem[], ctx: ExcelContext, meta: BookMeta): Promise<ArrayBuffer> {
  const wb = await newBook(meta, `${meta.project} · ${meta.option} · BOQ`);
  const { groups, total } = clientGroups(boq, ctx);
  const ws = sheetOf(wb, 'BOQ');
  ws.addRow([meta.studio]).getCell(1).font = { bold: true, size: 14, color: { argb: BLUE } };
  ws.addRow([`${meta.project} · ${meta.option}`]).getCell(1).font = { bold: true, size: 12 };
  ws.addRow([`Bill of quantities · ${new Date(meta.at || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`]).getCell(1).font = { color: { argb: MUTED } };
  ws.addRow([]);
  head(ws, ['#', 'Item', 'Specification', 'Qty', 'Unit', 'Rate', 'Amount']);
  groups.forEach(g => {
    const gr = ws.addRow([g.room]);
    ws.mergeCells(gr.number, 1, gr.number, 7);
    gr.getCell(1).font = { bold: true };
    gr.getCell(1).fill = fill(ROOM);
    g.rows.forEach(r => {
      ws.addRow([r.n, r.item, r.words, r.qty, r.unit, r.rate, r.amount]).eachCell({ includeEmpty: true }, (c: any, col: number) => {
        c.border = box;
        c.alignment = { vertical: 'top', wrapText: col === 3 };
        if (col === 4) c.numFmt = NUM2;
        if (col >= 6) c.numFmt = NUM;
      });
    });
    const st = ws.addRow(['', `${g.room} total`, '', '', '', '', g.total]);
    st.font = { bold: true };
    st.getCell(7).numFmt = NUM;
  });
  ws.addRow([]);
  const tr = ws.addRow(['', 'Total for the work', '', '', '', '', total]);
  tr.font = { bold: true, size: 12 };
  tr.getCell(7).numFmt = NUM;
  ws.addRow([meta.roundTo100 ? 'Each amount is rounded up to the nearest ₹100. Taxes as applicable.' : 'Taxes as applicable.']).getCell(1).font = { color: { argb: MUTED } };
  const sep = separateOf(boq, ctx.bankMap);
  if (sep.actuals.length || sep.client.length) ws.addRow(['Items bought by you, and items at actuals, are on their own sheet and not in this total.']).getCell(1).font = { color: { argb: MUTED } };
  ws.columns.forEach((c: any, i: number) => { c.width = [5, 30, 60, 9, 8, 12, 14][i]; });
  font(ws);
  await ws.protect(randomPassword(), { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, autoFilter: true });

  /* Bought by you, and at actuals (PR X): their own sheet, not in the total. */
  if (sep.actuals.length || sep.client.length) {
    const xs = sheetOf(wb, 'Bought by you, and at actuals');
    xs.addRow(['Bought by you, and at actuals']).getCell(1).font = { bold: true, size: 14, color: { argb: BLUE } };
    xs.addRow(['These are part of the design: we plan the space, points and fixings for them. They are not in your investment, the offers, GST or the payment schedule.']).getCell(1).font = { color: { argb: MUTED } };
    const table = (title: string, words: string, rows: typeof sep.actuals, last: string) => {
      xs.addRow([]);
      xs.addRow([title]).getCell(1).font = { bold: true, size: 12 };
      xs.addRow([words]).getCell(1).font = { color: { argb: MUTED } };
      head(xs, ['Item', 'Specification', 'Room', last]);
      rows.forEach(r => xs.addRow([r.name, r.words, r.room, r.estimate ?? 'Your choice']).eachCell({ includeEmpty: true }, (c: any, col: number) => {
        c.border = box;
        c.alignment = { vertical: 'top', wrapText: col === 2 };
        if (col === 4 && typeof c.value === 'number') c.numFmt = NUM;
      }));
    };
    if (sep.actuals.length) {
      table('At actuals', 'We choose them with you and manage the vendor; you pay the vendor directly at actual cost. The figures are estimates.', sep.actuals, 'Estimate');
      const er = xs.addRow(['', '', 'Estimated', sep.estimate]);
      er.font = { bold: true };
      er.getCell(4).numFmt = NUM;
    }
    if (sep.client.length) table('Bought by you', 'You choose and buy these; we help you pick and plan around them.', sep.client, '');
    xs.columns.forEach((c: any, i: number) => { c.width = [32, 60, 20, 14][i]; });
    font(xs);
    await xs.protect(randomPassword(), { selectLockedCells: true, selectUnlockedCells: true });
  }

  const ms = sheetOf(wb, 'Material specifications');
  head(ms, ['Family', 'Material', 'What it is', 'Brand or equivalent', 'Range']);
  materialsUsed(boq, ctx).forEach(m => ms.addRow([m.family, m.name, m.words, m.brand, m.range]).eachCell({ includeEmpty: true }, (c: any) => { c.border = box; c.alignment = { wrapText: true, vertical: 'top' }; }));
  ms.columns.forEach((c: any, i: number) => { c.width = [18, 28, 50, 30, 16][i]; });
  font(ms);
  await ms.protect(randomPassword(), { selectLockedCells: true, selectUnlockedCells: true });

  return wb.xlsx.writeBuffer();
}

/** A workbook's sheets as rows of cells (values; a formula reads as its last result). */
export async function readBook(buf: ArrayBuffer): Promise<Record<string, Grid>> {
  const XLSX: any = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  const out: Record<string, Grid> = {};
  wb.SheetNames.forEach((n: string) => { out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }); });
  return out;
}

/** The file name for a copy: "Palacia_3BHK – Comfort Upgrade – studio copy.xlsx". */
export const bookName = (meta: Pick<BookMeta, 'project' | 'option'>, kind: 'studio' | 'client') =>
  `${(meta.project || 'Project').replace(/[\\/:*?"<>|]+/g, ' ').trim()} – ${meta.option} – ${kind === 'studio' ? 'studio copy' : 'BOQ'}.xlsx`;
