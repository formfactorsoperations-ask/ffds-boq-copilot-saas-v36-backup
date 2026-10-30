import { Item } from '../types';
import { cleanSpec } from './specText';
import { isPlaceholderText } from './detailedBoq';

/**
 * ITEM BANK SPECIFICATIONS — one spec per item, written once, used by every project.
 *
 * The bank is the studio's source of truth: a line added from it carries its
 * spec into the BOQ, and a frozen BOQ falls back to it for any line without one
 * of its own (lib/detailedBoq.ts clientDescription). With 400+ items, writing
 * specs one card at a time is not realistic, so the studio exports a sheet,
 * fills the Specification column in Excel and imports it back.
 *
 * The import only ever writes `specs`. It never touches a rate, a margin, the
 * internal specs or anything else on the item, and it never adds an item.
 *
 * The whole bank is ONE Firestore document (master_data/{studio}_item_bank),
 * which stops at 1 MiB, and a save that fails is only logged — so an import
 * that would push the bank past a safe size is refused before anything is set.
 */

export interface SpecSheetRow {
  /** 1-based row in the sheet, for "row 12" in the preview. */
  row: number;
  id?: string;
  name: string;
  spec: string;
}

export interface ParsedSpecSheet {
  rows: SpecSheetRow[];
  /** The headers read as the item, the specification and the item ID, so the studio can see them. */
  columns?: { name: string; spec: string; id?: string };
  /** Why nothing could be read, when nothing could. */
  error?: string;
}

/** A saved bank larger than this is refused: Firestore stops at 1,048,576 bytes. */
export const BANK_BYTES_LIMIT = 900_000;

export const bankBytes = (bank: Item[]): number => new TextEncoder().encode(JSON.stringify(bank)).length;

/** "T.V. UNIT(DRAWER)" and "TV unit (drawer)" are the same item. */
export const normName = (s: unknown): string =>
  String(s ?? '')
    .split(/\r?\n/)[0]
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const text = (v: unknown) => String(v ?? '').trim();

/**
 * Read a spec sheet: the bank export, or any client sheet with an Item and a
 * Specification column. Rows with no specification are left out — an empty
 * cell never clears a spec the bank already has.
 */
export function parseSpecSheet(rows: any[][]): ParsedSpecSheet {
  let at = -1;
  let col = { id: -1, name: -1, spec: -1 };
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h = (rows[i] || []).map(c => text(c).toLowerCase());
    const id = h.findIndex(c => /^(item\s*)?id$/.test(c));
    /* A review sheet can carry several "spec" columns ("Spec source",
       "Spec status", "Specification"). The specification is the one with the
       words in it: of the columns whose header says spec, the one holding the
       most text below the header. */
    const specCols = h.map((c, j) => (j !== id && /spec/.test(c) ? j : -1)).filter(j => j >= 0);
    const textIn = (j: number) => rows.slice(i + 1).reduce((n, r) => n + cleanSpec((r || [])[j]).length, 0);
    const spec = specCols.sort((a, b) => textIn(b) - textIn(a) || a - b)[0] ?? -1;
    /* The item column: a plain "Item" / "Particulars" header first, so "Bank
       item" or "Item status" beside it is not taken for the name. */
    const nameCols = h.map((c, j) => (j !== spec && j !== id && !/spec/.test(c) && /item|particular|description/.test(c) ? j : -1)).filter(j => j >= 0);
    const name = nameCols.find(j => /^(items?|item name|item description|particulars?|description)$/.test(h[j])) ?? nameCols[0] ?? -1;
    if (spec >= 0 && name >= 0) {
      at = i;
      col = { id, name, spec };
      break;
    }
  }
  if (at < 0) return { rows: [], error: 'No header row with an Item column and a Specification column was found.' };

  const out: SpecSheetRow[] = [];
  for (let i = at + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = text(r[col.name]).split(/\r?\n/)[0].trim();
    if (/^total/i.test(text(r[0])) || /^total/i.test(name)) break;
    const spec = cleanSpec(r[col.spec]);
    if (!name || !spec || isPlaceholderText(spec)) continue;
    const id = col.id >= 0 ? text(r[col.id]) : '';
    out.push({ row: i + 1, ...(id ? { id } : {}), name, spec });
  }
  const header = rows[at] || [];
  return {
    rows: out,
    columns: { name: text(header[col.name]), spec: text(header[col.spec]), ...(col.id >= 0 ? { id: text(header[col.id]) } : {}) },
  };
}

export type SpecMatchStatus = 'update' | 'same' | 'unmatched' | 'ambiguous' | 'conflict' | 'skipped';

export interface SpecMatch {
  /** Stable key for the row: its sheet row number. */
  key: string;
  row: SpecSheetRow;
  /** The bank item the row writes to, once there is exactly one. */
  itemId: string | null;
  how: 'id' | 'name' | 'picked' | null;
  /** Items it could be: every item of that name, or the nearest names. */
  candidates: string[];
  status: SpecMatchStatus;
  /** For a conflict: the row whose spec is used for the same item. */
  conflictWith?: string;
}

/** Word overlap between two names, 0–1, for suggesting an item a name nearly matches. */
const similarity = (a: string, b: string): number => {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let common = 0;
  A.forEach(w => { if (B.has(w)) common++; });
  return (2 * common) / (A.size + B.size);
};

/**
 * Tie each sheet row to one bank item: by item ID, then by name. `picks` are
 * the studio's own choices in the preview (an item id, or 'skip'), and win.
 * Two rows writing different specs to one item: the first is used, the second
 * is a conflict until the studio picks.
 */
export function matchSpecRows(rows: SpecSheetRow[], bank: Item[], picks: Record<string, string> = {}): SpecMatch[] {
  const byId = new Map(bank.map(i => [i.id, i]));
  const byName = new Map<string, Item[]>();
  bank.forEach(i => {
    const n = normName(i.name);
    if (!n) return;
    byName.set(n, [...(byName.get(n) || []), i]);
  });
  const names = Array.from(byName.keys());

  const used = new Map<string, { key: string; spec: string }>();
  return rows.map(row => {
    const key = String(row.row);
    const pick = picks[key];
    const base = { key, row, candidates: [] as string[] };
    if (pick === 'skip') return { ...base, itemId: null, how: null, status: 'skipped' as const };

    let itemId: string | null = null;
    let how: SpecMatch['how'] = null;
    let candidates: string[] = [];
    if (pick && byId.has(pick)) {
      itemId = pick;
      how = 'picked';
    } else if (row.id && byId.has(row.id)) {
      itemId = row.id;
      how = 'id';
    } else {
      const same = byName.get(normName(row.name)) || [];
      if (same.length === 1) {
        itemId = same[0].id;
        how = 'name';
      } else if (same.length > 1) {
        candidates = same.map(i => i.id);
      } else {
        const n = normName(row.name);
        candidates = names
          .map(x => ({ x, s: similarity(n, x) }))
          .filter(c => c.s >= 0.4)
          .sort((a, b) => b.s - a.s)
          .slice(0, 3)
          .flatMap(c => (byName.get(c.x) || []).map(i => i.id));
      }
    }

    if (!itemId) return { ...base, candidates, itemId: null, how: null, status: candidates.length && byName.get(normName(row.name))?.length ? 'ambiguous' as const : 'unmatched' as const };

    const first = used.get(itemId);
    if (first && first.spec !== row.spec) return { ...base, itemId, how, status: 'conflict' as const, conflictWith: first.key };
    if (!first) used.set(itemId, { key, spec: row.spec });
    const current = cleanSpec(byId.get(itemId)!.specs);
    return { ...base, itemId, how, status: first || current === row.spec ? 'same' as const : 'update' as const };
  });
}

/** The specs to write: item id -> spec, from the rows that update an item. */
export function specUpdates(matches: SpecMatch[]): Map<string, string> {
  const out = new Map<string, string>();
  matches.forEach(m => { if (m.status === 'update' && m.itemId) out.set(m.itemId, m.row.spec); });
  return out;
}

/** The bank with those specs written in. Nothing else on any item changes. */
export function applySpecs(bank: Item[], updates: Map<string, string>): Item[] {
  if (!updates.size) return bank;
  return bank.map(i => (updates.has(i.id) ? { ...i, specs: updates.get(i.id)! } : i));
}

/** The export: what each item is and its spec, never its price. */
export function specSheetRows(bank: Item[]): { id: string; name: string; cat: string; unit: string; spec: string }[] {
  return [...bank]
    .sort((a, b) => String(a.cat || '').localeCompare(String(b.cat || '')) || String(a.name || '').localeCompare(String(b.name || '')))
    .map(i => ({
      id: i.id,
      name: String(i.name || ''),
      cat: String(i.cat || ''),
      unit: String(i.unit || ''),
      spec: isPlaceholderText(i.specs) ? '' : cleanSpec(i.specs),
    }));
}

const SPEC_GUIDE = [
  'Write each specification in this shape. The first line is the summary the client sees under the item name;',
  'the sections open when they ask for the full specification. Use only the sections the item needs.',
  '',
  '35 mm laminated safety door · MS grill · BWP frame cladding · Enox/Godrej lock',
  '',
  'SCOPE: New safety door in laminate finish',
  'MATERIAL:',
  '• Door frame cladding: BWP plywood',
  '• Safety door: 35 mm thick · MS grill, powder-coated',
  'FINISH: 1 mm laminate both faces, to the approved design',
  'HARDWARE:',
  '• Lock set: Enox/Godrej · allowance ₹3,000',
  'LAMINATE: Allowance ₹1,800 per sheet',
  'INCLUDES:',
  '• …',
  'EXCLUDES:',
  '• Video door phone, digital / smart lock',
  'NOTE: A selection above any allowance is charged at the difference',
  '',
  'Keep it true for every project: no room names or quantities. A project can still say more on its own BOQ.',
  'Leave the Item ID column as it is: it is how the import finds the item. An empty Specification cell changes nothing.',
];

/** The spec sheet to fill in Excel. */
export async function buildSpecSheetWorkbook(bank: Item[], studioName: string): Promise<ArrayBuffer> {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = studioName;
  const ws = wb.addWorksheet('Item specs', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Item ID', key: 'id', width: 16 },
    { header: 'Item', key: 'name', width: 40 },
    { header: 'Category', key: 'cat', width: 18 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Specification', key: 'spec', width: 90 },
  ];
  const head = ws.getRow(1);
  head.height = 20;
  head.eachCell((c: any) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D52A0' } };
    c.alignment = { vertical: 'middle' };
  });
  specSheetRows(bank).forEach(r => {
    const row = ws.addRow(r);
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell(1).font = { size: 9, color: { argb: 'FF8A90A8' } };
    const lines = r.spec ? r.spec.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 100)), 0) : 1;
    row.height = Math.min(409, Math.max(15, Math.ceil(lines * 11.5 + 6)));
  });
  const guide = wb.addWorksheet('How to write a spec');
  guide.getColumn(1).width = 110;
  SPEC_GUIDE.forEach(l => guide.addRow([l]));
  return wb.xlsx.writeBuffer();
}

export const specSheetName = (studioName: string, at = new Date()): string =>
  `${studioName.replace(/[\\/:*?"<>|]+/g, ' ').trim()} - Item specs ${at.toISOString().slice(0, 10)}.xlsx`;

/**
 * The bank item a BOQ line stands for: its own bank id, else the one bank item
 * with the same name. Lines imported from a sheet often carry an id the bank
 * never had, and they printed "Details missing from bank" although the bank
 * holds the item under the same name.
 */
export function bankItemForLine(
  line: { bankId?: string; name?: string; item?: string } | null | undefined,
  bankMap: Map<string, Item>,
  bank: Item[],
): Item | undefined {
  const own = line?.bankId ? bankMap.get(line.bankId) : undefined;
  if (own) return own;
  const n = normName(line?.name || line?.item);
  if (!n) return undefined;
  const same = (bank || []).filter(i => normName(i.name) === n);
  return same.length === 1 ? same[0] : undefined;
}

/** The bank's specification for a BOQ line, or '' when the bank has none worth printing. */
export function bankSpecForLine(
  line: { bankId?: string; name?: string; item?: string } | null | undefined,
  bankMap: Map<string, Item>,
  bank: Item[],
): string {
  const spec = cleanSpec(bankItemForLine(line, bankMap, bank)?.specs);
  return isPlaceholderText(spec) ? '' : spec;
}
