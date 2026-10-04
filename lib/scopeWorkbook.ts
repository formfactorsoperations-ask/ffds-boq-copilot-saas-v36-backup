import type { ScopeRevisionSnapshot } from './scopeDocuments';
import type { DetailedBoqSnapshot } from './detailedBoq';
import { clientTotals, totalsNote, ClientTotalsOptions } from './scopeTotals';

/*
  THE EXCEL THE CLIENT REVIEWS.

  The signed Scope Revision PDF read like a contract: four numbered sections of
  text with the BOQ attached behind them. Clients asked for the Excel. This is
  now the main document of a Scope Revision (and of the first Detailed BOQ):

    Summary       the totals before and after, what moved them, the fingerprint
    What changed  every changed line, before and now
    Revised BOQ   the whole BOQ, every line with its specification, real formulas
    Not included  what is outside this price, and why

  Built in the browser from the frozen issued snapshot, so the studio's
  download, the email attachment and the client's portal download are the same
  document. The sheets are protected: it can be read, filtered and copied, not
  edited. No cost, margin or internal note is ever in it.
*/

const FONT = 'Plus Jakarta Sans';
const INK = 'FF141A33';
const MUTED = 'FF5B6382';
const BLUE = 'FF3D52A0';
const ROOM = 'FFE9EEF9';
const CHANGED = 'FFFFF4DE';
const NEW = 'FFE3F5EE';
const GRID = 'FFD5DBE8';
const UP = 'FFB4232F';
const DOWN = 'FF0F7A55';
const NUM = '#,##0';
const NUM_SIGNED = '+#,##0;-#,##0;0';

type Cell = any;
type Sheet = any;

const thin = { style: 'thin', color: { argb: GRID } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

const fmtDay = (t?: number | null) =>
  t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const randomPassword = () => {
  const a = new Uint8Array(12);
  (globalThis.crypto || (window as any).crypto).getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};

async function newWorkbook(title: string, studio: string) {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = studio;
  wb.lastModifiedBy = studio;
  wb.created = new Date();
  wb.title = title;
  wb.company = studio;
  return wb;
}

function addSheet(wb: any, name: string, landscape = true): Sheet {
  return wb.addWorksheet(name, {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: BLUE } },
    pageSetup: { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
}

/** Plus Jakarta Sans everywhere, keeping each cell's size, weight and colour. */
function applyFont(ws: Sheet) {
  ws.eachRow({ includeEmpty: true }, (row: any) => {
    row.eachCell({ includeEmpty: true }, (cell: Cell) => {
      const f = cell.font || {};
      cell.font = { name: FONT, size: f.size || 10, bold: !!f.bold, italic: !!f.italic, color: f.color || { argb: INK } };
    });
  });
}

function title(ws: Sheet, text: string, sub: string, cols: number) {
  const r1 = ws.addRow([text]);
  r1.height = 24;
  r1.getCell(1).font = { size: 15, bold: true, color: { argb: INK } };
  ws.mergeCells(r1.number, 1, r1.number, cols);
  const r2 = ws.addRow([sub]);
  r2.getCell(1).font = { size: 10, color: { argb: MUTED } };
  ws.mergeCells(r2.number, 1, r2.number, cols);
  ws.addRow([]);
}

function header(ws: Sheet, labels: string[], rightFrom = 99) {
  const r = ws.addRow(labels);
  r.height = 20;
  r.eachCell((c: Cell, i: number) => {
    c.fill = fill(BLUE);
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { vertical: 'middle', horizontal: i >= rightFrom ? 'right' : 'left', wrapText: true };
    c.border = box;
  });
  return r;
}

const money = (c: Cell, signed = false) => {
  c.numFmt = signed ? NUM_SIGNED : NUM;
  c.alignment = { ...(c.alignment || {}), horizontal: 'right', vertical: 'top' };
};

const tone = (c: Cell, v: number) => {
  if (Math.abs(v) < 0.5) return;
  c.font = { ...(c.font || {}), bold: true, color: { argb: v > 0 ? UP : DOWN } };
};

const specOf = (l: { description?: string; inclusions?: string[]; exclusions?: string[] }) =>
  [
    l.description || '',
    l.inclusions?.length ? `Includes: ${l.inclusions.join('; ')}` : '',
    l.exclusions?.length ? `Excludes: ${l.exclusions.join('; ')}` : '',
  ].filter(Boolean).join('\n');

/**
 * The full BOQ sheet. Returns the row holding the grand total, so the Summary
 * can point at it with a formula.
 */
function boqSheet(wb: any, name: string, boq: DetailedBoqSnapshot, heading: string, sub: string, marks?: Map<string, 'new' | 'changed'>): number {
  const ws = addSheet(wb, name);
  ws.columns = [
    { width: 7 }, { width: 34 }, { width: 58 }, { width: 9 }, { width: 9 }, { width: 13 }, { width: 15 }, ...(marks ? [{ width: 12 }] : []),
  ];
  const cols = marks ? 8 : 7;
  title(ws, heading, sub, cols);
  const h = header(ws, ['No.', 'Item', 'Specification', 'Unit', 'Qty', 'Rate (₹)', 'Amount (₹)', ...(marks ? ['vs signed'] : [])], 5);
  ws.views = [{ state: 'frozen', ySplit: h.number, showGridLines: false }];

  const roomTotalCells: string[] = [];
  boq.rooms.forEach((room, ri) => {
    const rr = ws.addRow([String(ri + 1), (room.name || '').toUpperCase() + (room.formerly ? `  (formerly ${room.formerly})` : '')]);
    ws.mergeCells(rr.number, 2, rr.number, 6);
    rr.eachCell({ includeEmpty: true }, (c: Cell) => { c.fill = fill(ROOM); c.font = { bold: true }; c.border = box; });
    const first = rr.number + 1;
    room.lines.forEach((l, li) => {
      const row = ws.addRow([
        `${ri + 1}.${li + 1}`,
        l.name,
        [specOf(l), l.asActuals ? 'Billed as actuals.' : ''].filter(Boolean).join('\n'),
        l.unit,
        l.qty,
        l.rate,
        null,
        ...(marks ? [marks.get(l.id) === 'new' ? 'New' : marks.get(l.id) === 'changed' ? 'Changed' : ''] : []),
      ]);
      row.getCell(7).value = { formula: `E${row.number}*F${row.number}`, result: l.amount };
      row.eachCell({ includeEmpty: true }, (c: Cell) => { c.border = box; c.alignment = { vertical: 'top', wrapText: true }; });
      row.getCell(3).font = { size: 9, color: { argb: MUTED } };
      row.getCell(5).numFmt = '#,##0.##';
      row.getCell(5).alignment = { horizontal: 'right', vertical: 'top' };
      money(row.getCell(6));
      money(row.getCell(7));
      const mark = marks?.get(l.id);
      if (mark) row.eachCell({ includeEmpty: true }, (c: Cell) => { c.fill = fill(mark === 'new' ? NEW : CHANGED); });
    });
    const last = ws.lastRow.number;
    const totalCell = rr.getCell(7);
    totalCell.value = room.lines.length
      ? { formula: `SUM(G${first}:G${last})`, result: room.total }
      : room.total;
    money(totalCell);
    totalCell.font = { bold: true };
    roomTotalCells.push(`G${rr.number}`);
  });

  ws.addRow([]);
  const t = ws.addRow(['', 'Total execution scope (before design fee and GST)']);
  ws.mergeCells(t.number, 2, t.number, 6);
  t.getCell(7).value = roomTotalCells.length ? { formula: roomTotalCells.join('+'), result: boq.total } : boq.total;
  money(t.getCell(7));
  t.eachCell({ includeEmpty: true }, (c: Cell) => { c.font = { bold: true, size: 11 }; c.border = { top: { style: 'medium', color: { argb: INK } } }; });
  ws.addRow([]);
  const n = ws.addRow(['', 'Anything not listed on this sheet is outside this scope. Items on the "Not included" sheet are not part of this price.']);
  ws.mergeCells(n.number, 2, n.number, cols);
  n.getCell(2).font = { size: 9, color: { argb: MUTED } };
  applyFont(ws);
  return t.number;
}

function notIncludedSheet(wb: any, items: { room: string; name: string; reason?: string }[], sub: string) {
  const ws = addSheet(wb, 'Not included', false);
  ws.columns = [{ width: 24 }, { width: 46 }, { width: 56 }];
  title(ws, 'Not included in this price', sub, 3);
  header(ws, ['Room', 'Item', 'Why it is not in this price']);
  if (!items.length) {
    const r = ws.addRow(['Nothing is held outside this price.']);
    ws.mergeCells(r.number, 1, r.number, 3);
    r.getCell(1).font = { color: { argb: MUTED } };
  }
  items.forEach((i) => {
    const r = ws.addRow([i.room, i.name, i.reason || 'Not part of this scope']);
    r.eachCell({ includeEmpty: true }, (c: Cell) => { c.border = box; c.alignment = { vertical: 'top', wrapText: true }; });
  });
  ws.addRow([]);
  const n = ws.addRow(['Anything not listed on the BOQ sheet is outside this scope.']);
  ws.mergeCells(n.number, 1, n.number, 3);
  n.getCell(1).font = { size: 9, color: { argb: MUTED } };
  applyFont(ws);
}

async function finish(wb: any): Promise<ArrayBuffer> {
  const pw = randomPassword();
  for (const ws of wb.worksheets) {
    await ws.protect(pw, {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatColumns: true,
      formatRows: true,
      autoFilter: true,
      sort: false,
    });
  }
  return wb.xlsx.writeBuffer();
}

export interface WorkbookMeta {
  studioName: string;
  /** The issue's contentHash: what the client approves. */
  fingerprint?: string | null;
  issuedOn?: number | null;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const who = (s: { clientName?: string; projectName?: string }) =>
  s.clientName && s.clientName.trim() && s.clientName !== 'Client' ? s.clientName : s.projectName || 'Project';

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

export function revisionWorkbookName(s: ScopeRevisionSnapshot): string {
  return `${safe(who(s))} - Revised BOQ v${s.v2.version}.xlsx`;
}
export function detailedBoqWorkbookName(s: DetailedBoqSnapshot): string {
  return `${safe(who(s))} - BOQ v${s.version}.xlsx`;
}

/** Summary rows for the totals; returns nothing, writes rows with formulas. */
function totalsBlock(ws: Sheet, before: number | null, after: number, revisedRef: string, signedValue: number | null, o?: ClientTotalsOptions | null) {
  const rows = clientTotals(before ?? after, after, o);
  const revision = before !== null;
  header(ws, revision ? ['', 'Signed (₹)', 'Revised (₹)', 'Change (₹)'] : ['', 'Amount (₹)'], 2);
  const at: Record<string, number> = {};
  rows.forEach((r) => {
    const isTotal = r.key === 'total';
    const vals = revision ? [r.label, r2(r.before), r2(r.after), r2(r.change)] : [r.label, r2(r.after)];
    const row = ws.addRow(vals);
    at[r.key] = row.number;
    const n = row.number;
    const g = o ? o.gstRate / 100 : 0;
    const share = o ? (o.billablePercent / 100) * g : 0;
    const colAfter = revision ? 'C' : 'B';
    if (r.key === 'execution') {
      row.getCell(revision ? 3 : 2).value = { formula: revisedRef, result: r.after };
      if (revision && signedValue !== null) row.getCell(2).value = r2(signedValue);
    } else if (r.key === 'execGst') {
      if (revision) row.getCell(2).value = { formula: `B${at.execution}*${+share.toFixed(6)}`, result: r.before };
      row.getCell(revision ? 3 : 2).value = { formula: `${colAfter}${at.execution}*${+share.toFixed(6)}`, result: r.after };
    } else if (r.key === 'designGst') {
      if (revision) row.getCell(2).value = { formula: `B${at.designFee}*${g}`, result: r.before };
      row.getCell(revision ? 3 : 2).value = { formula: `${colAfter}${at.designFee}*${g}`, result: r.after };
    } else if (isTotal) {
      const first = at.execution;
      if (revision) row.getCell(2).value = { formula: `SUM(B${first}:B${n - 1})`, result: r.before };
      row.getCell(revision ? 3 : 2).value = { formula: `SUM(${colAfter}${first}:${colAfter}${n - 1})`, result: r.after };
    }
    if (revision) row.getCell(4).value = { formula: `C${n}-B${n}`, result: r.change };
    row.eachCell({ includeEmpty: true }, (c: Cell, i: number) => {
      c.border = box;
      if (i >= 2) money(c, revision && i === 4);
      if (isTotal) c.font = { bold: true, size: 11 };
    });
    if (revision) tone(row.getCell(4), r.change);
  });
}

export async function buildRevisionWorkbook(s: ScopeRevisionSnapshot, meta: WorkbookMeta): Promise<ArrayBuffer> {
  const wb = await newWorkbook(`Scope Revision ${s.number} · ${s.projectName}`, meta.studioName);
  const issued = fmtDay(meta.issuedOn || s.issuedOn);
  const sub = `${meta.studioName}${s.location ? ` · ${s.location}` : ''} · ${s.reference}${issued ? ` · issued ${issued}` : ''} · replaces ${s.v1.reference}`;

  // Which BOQ lines are new or changed, to mark them on the full BOQ.
  const marks = new Map<string, 'new' | 'changed'>();
  const changedNames = new Map<string, 'new' | 'changed'>();
  s.rooms.forEach((r) => r.lines.forEach((l) => {
    if (l.tag === 'REMOVED') return;
    changedNames.set(`${r.name}|${l.now || l.name}`, l.tag === 'NEW' ? 'new' : 'changed');
  }));
  s.v2.rooms.forEach((r) => r.lines.forEach((l) => {
    const m = changedNames.get(`${r.name}|${l.name}`);
    if (m) marks.set(l.id, m);
  }));

  // Summary first, so the file opens on it; the BOQ sheet is filled in after.
  const summary = addSheet(wb, 'Summary', false);
  summary.columns = [{ width: 46 }, { width: 18 }, { width: 18 }, { width: 18 }];
  const changes = addSheet(wb, 'What changed');
  const totalRow = boqSheet(wb, 'Revised BOQ', s.v2, `Revised BOQ v${s.v2.version} · ${s.projectName}`, sub, marks);

  title(summary, `Scope Revision ${s.number} · ${s.projectName}`, sub, 4);
  totalsBlock(summary, s.v1.total, s.v2.total, `'Revised BOQ'!G${totalRow}`, s.v1.total, (s as any).clientTotals);
  const note = summary.addRow([totalsNote((s as any).clientTotals)]);
  summary.mergeCells(note.number, 1, note.number, 4);
  note.getCell(1).font = { size: 9, color: { argb: MUTED } };
  note.getCell(1).alignment = { wrapText: true };
  note.height = 26;
  summary.addRow([]);

  if (s.bridge.length) {
    header(summary, ['What moved the total', '', '', 'Change (₹)'], 4);
    s.bridge.forEach((p) => {
      const r = summary.addRow([p.label, '', '', p.value]);
      r.eachCell({ includeEmpty: true }, (c: Cell) => { c.border = box; });
      money(r.getCell(4), true);
      tone(r.getCell(4), p.value);
    });
    summary.addRow([]);
  }
  if (s.summary) {
    const h = summary.addRow(['A note from the studio']);
    h.getCell(1).font = { bold: true };
    const r = summary.addRow([s.summary]);
    summary.mergeCells(r.number, 1, r.number, 4);
    r.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    r.height = Math.min(160, 16 * Math.ceil(s.summary.length / 90) + 4);
    summary.addRow([]);
  }
  const how = summary.addRow(['To approve, open your project portal and press Approve. This file is the document you approve.']);
  summary.mergeCells(how.number, 1, how.number, 4);
  how.getCell(1).font = { color: { argb: MUTED } };
  if (meta.fingerprint) {
    const fp = summary.addRow([`Document fingerprint: ${meta.fingerprint}`]);
    summary.mergeCells(fp.number, 1, fp.number, 4);
    fp.getCell(1).font = { size: 8, color: { argb: MUTED } };
  }
  applyFont(summary);

  // What changed
  changes.columns = [{ width: 20 }, { width: 34 }, { width: 13 }, { width: 22 }, { width: 22 }, { width: 14 }, { width: 40 }];
  title(changes, 'What changed', sub, 7);
  const ch = header(changes, ['Room', 'Item', 'Change', 'Before', 'Now', 'Change (₹)', 'Note'], 6);
  changes.views = [{ state: 'frozen', ySplit: ch.number, showGridLines: false }];
  const firstChange = ch.number + 1;
  const q = (n?: number, unit?: string) => (n === undefined || n === null ? '' : `${+n.toFixed(2)} ${unit || ''}`.trim());
  const TAGS: Record<string, string> = { NEW: 'New', SIZE: 'Quantity', RATE: 'Rate', 'SIZE + RATE': 'Quantity and rate', REDESIGNED: 'Redesigned', REMOVED: 'Removed' };
  s.rooms.forEach((r) => {
    if (r.asSection) {
      const row = changes.addRow([r.name, `Whole room compared${r.formerly ? ` (formerly ${r.formerly})` : ''}`, 'Section', `₹${Math.round(r.v1).toLocaleString('en-IN')}`, `₹${Math.round(r.v2).toLocaleString('en-IN')}`, r.change, r.asSection.caveat]);
      row.eachCell({ includeEmpty: true }, (c: Cell) => { c.border = box; c.alignment = { vertical: 'top', wrapText: true }; });
      money(row.getCell(6), true);
      tone(row.getCell(6), r.change);
      return;
    }
    r.lines.forEach((l, i) => {
      const before = l.tag === 'NEW' ? '—' : `${q(l.q1, l.unit)} · ₹${Math.round(l.a1).toLocaleString('en-IN')}`;
      const now = l.tag === 'REMOVED' ? '—' : `${q(l.q2, l.unit)} · ₹${Math.round(l.a2).toLocaleString('en-IN')}`;
      const name = l.was && l.now ? `${l.now} (was ${l.was})` : l.name;
      const row = changes.addRow([r.name, name, TAGS[l.tag] || l.tag, before, now, l.change, i === 0 ? (r.note || '') : '']);
      row.eachCell({ includeEmpty: true }, (c: Cell) => { c.border = box; c.alignment = { vertical: 'top', wrapText: true }; });
      row.getCell(5).fill = fill(l.tag === 'NEW' ? NEW : l.tag === 'REMOVED' ? 'FFFCE9EA' : CHANGED);
      money(row.getCell(6), true);
      tone(row.getCell(6), l.change);
    });
  });
  const lastChange = changes.lastRow.number;
  const net = changes.addRow(['', 'Net change', '', '', '', null, '']);
  net.getCell(6).value = lastChange >= firstChange ? { formula: `SUM(F${firstChange}:F${lastChange})`, result: s.change } : s.change;
  net.eachCell({ includeEmpty: true }, (c: Cell) => { c.font = { bold: true, size: 11 }; c.border = { top: { style: 'medium', color: { argb: INK } } }; });
  money(net.getCell(6), true);
  tone(net.getCell(6), s.change);
  applyFont(changes);

  // Not included
  const out = new Map<string, { room: string; name: string; reason?: string }>();
  [...(s.atZero || []), ...(s.v2.notInScope || [])].forEach((i) => out.set(`${i.room}|${i.name}`, i));
  notIncludedSheet(wb, [...out.values()], sub);

  return finish(wb);
}

export async function buildDetailedBoqWorkbook(s: DetailedBoqSnapshot, meta: WorkbookMeta): Promise<ArrayBuffer> {
  const wb = await newWorkbook(`Detailed BOQ v${s.version} · ${s.projectName}`, meta.studioName);
  const issued = fmtDay(meta.issuedOn || s.issuedOn);
  const sub = `${meta.studioName}${s.location ? ` · ${s.location}` : ''} · ${s.reference}${issued ? ` · issued ${issued}` : ''}`;
  const summary = addSheet(wb, 'Summary', false);
  summary.columns = [{ width: 46 }, { width: 18 }];
  const totalRow = boqSheet(wb, 'BOQ', s, `Detailed BOQ v${s.version} · ${s.projectName}`, sub);

  title(summary, `Detailed BOQ v${s.version} · ${s.projectName}`, sub, 2);
  totalsBlock(summary, null, s.total, `'BOQ'!G${totalRow}`, null, (s as any).clientTotals);
  const note = summary.addRow([totalsNote((s as any).clientTotals, false)]);
  summary.mergeCells(note.number, 1, note.number, 2);
  note.getCell(1).font = { size: 9, color: { argb: MUTED } };
  note.getCell(1).alignment = { wrapText: true };
  note.height = 26;
  summary.addRow([]);
  const facts = [
    ['Rooms', String(s.rooms.length)],
    ['Items', String(s.lineCount)],
  ];
  facts.forEach(([k, v]) => {
    const r = summary.addRow([k, v]);
    r.getCell(2).alignment = { horizontal: 'right' };
  });
  summary.addRow([]);
  const how = summary.addRow(['To approve, open your project portal and press Approve. This file is the document you approve.']);
  summary.mergeCells(how.number, 1, how.number, 2);
  how.getCell(1).font = { color: { argb: MUTED } };
  how.getCell(1).alignment = { wrapText: true };
  how.height = 28;
  if (meta.fingerprint) {
    const fp = summary.addRow([`Document fingerprint: ${meta.fingerprint}`]);
    summary.mergeCells(fp.number, 1, fp.number, 2);
    fp.getCell(1).font = { size: 8, color: { argb: MUTED } };
  }
  applyFont(summary);
  notIncludedSheet(wb, s.notInScope || [], sub);
  return finish(wb);
}

/** The workbook as base64, for an email attachment. */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function downloadWorkbook(buf: ArrayBuffer, filename: string) {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** The workbook for an issued Scope Revision or Detailed BOQ, as the client gets it. */
export async function workbookForIssue(
  issue: { kind: string; snapshot: any; contentHash?: string | null; issuedAt?: string | number | null },
  studioName: string,
): Promise<{ buf: ArrayBuffer; filename: string }> {
  const meta: WorkbookMeta = {
    studioName,
    fingerprint: issue.contentHash || null,
    issuedOn: issue.issuedAt ? new Date(issue.issuedAt).getTime() : null,
  };
  if (issue.kind === 'scope_revision') {
    return { buf: await buildRevisionWorkbook(issue.snapshot, meta), filename: revisionWorkbookName(issue.snapshot) };
  }
  return { buf: await buildDetailedBoqWorkbook(issue.snapshot, meta), filename: detailedBoqWorkbookName(issue.snapshot) };
}
