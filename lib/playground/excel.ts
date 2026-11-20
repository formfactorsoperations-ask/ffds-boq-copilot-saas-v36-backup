/**
 * BOQ Playground PR 6 — Excel out, and Excel onto the plan.
 *
 * Out:
 *   studio copy   every line with its Line ID, room, item, words, materials
 *                 (with their versions), size, qty, cost, markup and live
 *                 formulas for the rate and the amount. Blue cells edit; the
 *                 sheet comes back in by its Line IDs
 *   client copy   item, specification, qty, unit, rate and amount by room,
 *                 locked, with no cost or markup
 *
 * In, two kinds of sheet (the approved mockup's Import Excel):
 *   a studio copy   read by its Line IDs: each row updates its own line, a row
 *                   with no Line ID is a new line, a line missing from the
 *                   sheet is offered for deletion but never deleted on its own.
 *                   Every change is shown, priced, before anything is saved
 *   any other sheet an old BOQ, a vendor quote, a client's list: columns
 *                   matched as today, sizes read from the item name ("6 x 2
 *                   ft"), the rate met by the markup on the bank's cost; each
 *                   row placed in its room, on a free wall when it draws. A row
 *                   not in the Item Bank is flagged, and is added to the bank
 *                   only when the Owner ticks it
 *
 * Nothing is written until Import. Pure: the workbook files are made and read
 * in lib/playground/excelBook.ts.
 */
import type { BoqItem, Item, PricingRules, Room } from '../../types';
import type { MaterialSpecsBank } from '../materialSpecs';
import { versionAt } from '../materialSpecs';
import { resolveBoqLine } from '../boqPricing';
import { readSize, sizeUpdates, convertLength } from '../boqSize';
import { lineAmount, lineCost } from './pricing';
import { markupOf, marginFloorFor, specWordsOf, type MarginFloors } from './issues';
import type { MeasureContext } from './rooms';
import { drawOf, footprintOf, isHigh, isWallBacked, pieceSize } from './pieces';
import { autoPlace, type PlacedPiece } from './placing';
import { newPieceLine, resizedTo } from './board';
import { matchRooms, roomKey } from './planSheet';
import { round2, ftin } from './geometry';

export interface ExcelContext {
  bankMap: Map<string, Item>;
  rules?: PricingRules | null;
  rooms?: Room[];
  measure?: MeasureContext;
  specBank?: MaterialSpecsBank | null;
}

/** Marks a workbook as a studio copy of a Playground BOQ (in its Read me). */
export const STUDIO_MARK = 'BOQ Playground studio copy';
/** The room a line with none belongs to. */
const FLAT = 'Whole flat';

/** "L-0007": the line's place in the BOQ, as the sheet and the import show it. */
export const lineIdAt = (i: number) => `L-${String(i + 1).padStart(4, '0')}`;

/** A short fingerprint of a BOQ, so an import can say whether it changed since the export. */
export function fingerprintOf(boq: BoqItem[]): string {
  const s = JSON.stringify((boq || []).map(l => [l.id, l.qty, l.baseRate, l.marginOverride, l.roomId, l.specs, l.calcLength, l.calcWidth]));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const live = (l: BoqItem) => l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted';
const num = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[₹,\s%]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const text = (v: unknown) => (v == null ? '' : String(v).trim());

/** The line's cost for one unit: materials and labour. */
export const unitCostOf = (l: BoqItem, bankMap: Map<string, Item>) => round2(lineCost({ ...l, qty: 1 }, bankMap));
/** The line's labour for one unit (it stays when the cost is edited: materials move). */
const laborOf = (l: BoqItem, bankMap: Map<string, Item>) => {
  const item = bankMap.get(l.bankId);
  return Number(l.labor !== undefined ? l.labor : item ? item.labor : 0) || 0;
};

/* ───────────────────────────── out ───────────────────────────── */

export interface StudioRow {
  lineId: string;
  /** The line's own id: the sheet's hidden Key column. */
  key: string;
  room: string;
  item: string;
  cat: string;
  words: string;
  /** "Carcass: BWR plywood, 18 mm v1; Outer finish: Designer laminate, 1 mm v2 (Smoked oak)". */
  materials: string;
  /** Size in feet, when the line has one. */
  w?: number;
  h?: number;
  qty: number;
  unit: string;
  cost: number;
  markup: number;
  rate: number;
  amount: number;
}

/** The materials of a line, in words, with their versions. */
export function materialsText(l: BoqItem, specBank?: MaterialSpecsBank | null): string {
  if (!l.materialSpecs || !specBank) return '';
  return Object.entries(l.materialSpecs).map(([part, s]) => {
    const m = specBank.materials.find(x => x.id === s.id);
    const v = versionAt(specBank, s.id, s.v);
    return `${part}: ${m?.name || s.id} v${v?.v ?? s.v}${s.shade ? ` (${s.shade})` : ''}`;
  }).join('; ');
}

/** The size of a line in feet, when it has one. */
export function sizeFt(l: BoqItem, unit?: string): { w?: number; h?: number } {
  const s = readSize({ ...l, unit });
  if (!s) return {};
  return {
    ...(s.a ? { w: round2(convertLength(s.a, s.unit, 'ft')) } : {}),
    ...(s.b ? { h: round2(convertLength(s.b, s.unit, 'ft')) } : {}),
  };
}

/** Every live line of the BOQ as a row of the studio copy, in BOQ order. */
export function studioRows(boq: BoqItem[], ctx: ExcelContext): StudioRow[] {
  const { bankMap } = ctx;
  return (boq || []).filter(live).map((l, i) => {
    const item = bankMap.get(l.bankId);
    const r = resolveBoqLine(l, bankMap);
    return {
      lineId: lineIdAt(i),
      key: l.id,
      room: l.roomId || FLAT,
      item: r.name,
      cat: item?.cat || (l as any).cat || '',
      words: specWordsOf(l, item),
      materials: materialsText(l, ctx.specBank),
      ...sizeFt(l, r.unit),
      qty: round2(Number(l.qty) || 0),
      unit: r.unit || '',
      cost: unitCostOf(l, bankMap),
      markup: round2(markupOf(l, item)),
      rate: round2(r.rate),
      amount: lineAmount(l, bankMap, { rules: ctx.rules, rooms: ctx.rooms, measure: ctx.measure }),
    };
  });
}

export interface ClientRow { n: number; item: string; words: string; qty: number; unit: string; rate: number; amount: number }
export interface ClientGroup { room: string; rows: ClientRow[]; total: number }

/** The client copy: billable lines by room, no costs, with each room's total and the work total. */
export function clientGroups(boq: BoqItem[], ctx: ExcelContext): { groups: ClientGroup[]; total: number } {
  const rows = studioRows((boq || []).filter(l => resolveBoqLine(l, ctx.bankMap).billable), ctx);
  const order = [...(ctx.rooms || []).map(r => r.name), ...rows.map(r => r.room)].filter((n, i, a) => a.indexOf(n) === i);
  let n = 0;
  const groups = order.map(room => {
    const rs = rows.filter(r => r.room === room).map(r => ({ n: ++n, item: r.item, words: r.words, qty: r.qty, unit: r.unit, rate: r.rate, amount: r.amount }));
    return { room, rows: rs, total: rs.reduce((a, r) => a + r.amount, 0) };
  }).filter(g => g.rows.length);
  return { groups, total: groups.reduce((a, g) => a + g.total, 0) };
}

/* ───────────────────────────── in: a studio copy ───────────────────────────── */

/** A sheet as rows of cells. */
export type Grid = unknown[][];

export interface StudioMeta { project?: string; option?: string; tierId?: string; exportedAt?: string; fingerprint?: string }
export interface SheetRow { at: number; lineId: string; key: string; room: string; item: string; words: string; w?: number; h?: number; qty?: number; unit: string; cost?: number; markup?: number }

const HEAD: Record<string, keyof SheetRow> = {
  'line id': 'lineId', key: 'key', room: 'room', item: 'item', specification: 'words',
  'width ft': 'w', 'height ft': 'h', qty: 'qty', unit: 'unit', 'cost / unit': 'cost', 'markup %': 'markup',
};

/** The workbook as a studio copy, or null when it is not one. */
export function readStudio(sheets: Record<string, Grid>): { meta: StudioMeta; rows: SheetRow[] } | null {
  const readme = sheets['Read me'];
  const boq = sheets.BOQ;
  if (!readme || !boq || !readme.some(r => r.some(c => text(c) === STUDIO_MARK))) return null;
  const kv = new Map(readme.map(r => [text(r[0]).toLowerCase(), text(r[1])]));
  const meta: StudioMeta = {
    project: kv.get('project'), option: kv.get('option'), tierId: kv.get('option id'),
    exportedAt: kv.get('exported'), fingerprint: kv.get('fingerprint'),
  };
  const h = boq.findIndex(r => r.some(c => text(c).toLowerCase() === 'line id'));
  if (h < 0) return null;
  const cols = boq[h].map(c => HEAD[text(c).toLowerCase()]);
  const rows: SheetRow[] = [];
  boq.slice(h + 1).forEach((r, j) => {
    const o: any = { at: h + j + 2 };
    cols.forEach((k, ci) => { if (k) o[k] = r[ci]; });
    const row: SheetRow = {
      at: o.at, lineId: text(o.lineId), key: text(o.key), room: text(o.room), item: text(o.item), words: text(o.words),
      w: num(o.w), h: num(o.h), qty: num(o.qty), unit: text(o.unit), cost: num(o.cost), markup: num(o.markup),
    };
    // The sheet's own Total row is not a line.
    if (!row.key && !row.lineId && /^(sub\s*)?total$/i.test(row.item)) return;
    if (row.item || row.key) rows.push(row);
  });
  return { meta, rows };
}

export type ChangeKind = 'chg' | 'new' | 'del';
export interface StudioChange {
  kind: ChangeKind;
  /** The line it changes (chg, del). */
  id?: string;
  name: string;
  room: string;
  /** What changed, in words: "Qty 40 → 42 · Markup 25% → 22%". */
  what: string;
  /** The line after (chg, new). */
  after?: BoqItem;
  /** What the client's amount moves by. */
  delta: number;
}

/** The Item Bank item a name stands for: every word of the bank's name in it, or most words shared. */
export function matchBankItem(name: string, bank: Item[]): Item | undefined {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  const ws = new Set(words(nameWithoutSize(name)));
  if (!ws.size) return undefined;
  let best: { item: Item; score: number; len: number } | null = null;
  bank.forEach(item => {
    const bw = words(item.name);
    if (!bw.length) return;
    const shared = bw.filter(w => ws.has(w)).length;
    const all = shared === bw.length;
    const jac = shared / new Set([...bw, ...ws]).size;
    const score = all ? 1 + shared / 100 : jac >= 0.6 ? jac : 0;
    if (score > 0 && (!best || score > best.score || (score === best.score && bw.length > best.len))) best = { item, score, len: bw.length };
  });
  return (best as { item: Item } | null)?.item;
}
const STOP = new Set(['the', 'and', 'with', 'for', 'over', 'from', 'nos', 'feet', 'inch', 'per']);

/** The room a typed name means, among the project's rooms: by name, then by a name that contains it ("master"). */
export function roomFor(name: string, rooms: string[]): string | null {
  const t = text(name);
  if (!t) return null;
  const m = matchRooms([t], rooms).get(t);
  if (m) return m;
  const k = roomKey(t);
  return rooms.find(r => roomKey(r).split(' ').includes(k) || roomKey(r).includes(k)) || null;
}

const describe = (before: BoqItem, after: BoqItem, bankMap: Map<string, Item>, unit: string): string[] => {
  const out: string[] = [];
  const b = (n: number) => Number(round2(n)).toLocaleString('en-IN');
  if ((before.roomId || FLAT) !== (after.roomId || FLAT)) out.push(`Moved to ${after.roomId || FLAT}`);
  const s0 = sizeFt(before, unit), s1 = sizeFt(after, unit);
  const ft = (v?: number) => (v ? ftin(v) : '–');
  if (s0.w !== s1.w && s0.h === s1.h) out.push(`Width ${ft(s0.w)} → ${ft(s1.w)}`);
  else if (s0.h !== s1.h && s0.w === s1.w) out.push(`Height ${ft(s0.h)} → ${ft(s1.h)}`);
  else if (s0.w !== s1.w || s0.h !== s1.h) out.push(`Size ${ft(s0.w)} × ${ft(s0.h)} → ${ft(s1.w)} × ${ft(s1.h)}`);
  const sized = s0.w !== s1.w || s0.h !== s1.h;
  if (!sized && round2(Number(before.qty) || 0) !== round2(Number(after.qty) || 0)) out.push(`Qty ${b(Number(before.qty) || 0)} → ${b(Number(after.qty) || 0)}`);
  const c0 = unitCostOf(before, bankMap), c1 = unitCostOf(after, bankMap);
  if (c0 !== c1) out.push(`Cost ₹${b(c0)} → ₹${b(c1)}`);
  const item = bankMap.get(before.bankId);
  const m0 = round2(markupOf(before, item)), m1 = round2(markupOf(after, item));
  if (m0 !== m1) out.push(`Markup ${m0.toFixed(1)}% → ${m1.toFixed(1)}%`);
  if ((before.specs || '') !== (after.specs || '') && after.specsOwn) out.push('Client words typed over in Excel: they stop following the material specs');
  return out;
};

/**
 * What a studio copy changes against today's BOQ: each row by its Key (the
 * line's id), a row with none is new, a line not in the sheet is offered for
 * deletion. Unchanged rows are counted and left alone.
 */
export function studioDiff(
  sheet: { meta: StudioMeta; rows: SheetRow[] },
  boq: BoqItem[],
  ctx: ExcelContext & { bank: Item[]; newId: () => string },
): { changes: StudioChange[]; unchanged: number; changedSince: boolean } {
  const { bankMap } = ctx;
  const opts = { rules: ctx.rules, rooms: ctx.rooms, measure: ctx.measure };
  const amount = (l: BoqItem) => lineAmount(l, bankMap, opts);
  const roomNames = (ctx.rooms || []).map(r => r.name);
  const byId = new Map(boq.map(l => [l.id, l]));
  const seen = new Set<string>();
  const changes: StudioChange[] = [];
  let unchanged = 0;

  sheet.rows.forEach(row => {
    const line = row.key ? byId.get(row.key) : undefined;
    if (line && live(line)) {
      seen.add(line.id);
      const item = bankMap.get(line.bankId);
      const unit = resolveBoqLine(line, bankMap).unit || '';
      let next: BoqItem = { ...line };
      const room = row.room && row.room !== FLAT ? (roomFor(row.room, roomNames) || row.room) : undefined;
      if ((room || undefined) !== (line.roomId || undefined) && !(row.room === FLAT && !line.roomId)) {
        next = { ...next, ...(room ? { roomId: room } : {}) };
        if (!room) delete (next as any).roomId;
        if (next.place) delete (next as any).place; // a piece moved on the sheet waits under Needs a place in its new room
      }
      const s0 = sizeFt(line, unit);
      const sizeChanged = (row.w !== undefined || row.h !== undefined) && (round2(row.w ?? 0) !== round2(s0.w ?? 0) || round2(row.h ?? 0) !== round2(s0.h ?? 0));
      if (sizeChanged) next = { ...next, ...sizeUpdates({ a: row.w, b: row.h, nos: Number(line.calcMultiplier) || 1, unit: 'ft' }, unit) };
      else if (row.qty !== undefined && round2(row.qty) !== round2(Number(line.qty) || 0)) next = { ...next, qty: round2(row.qty) };
      if (row.cost !== undefined && round2(row.cost) !== unitCostOf(line, bankMap)) {
        next = { ...next, baseRate: Math.max(0, round2(row.cost - laborOf(line, bankMap))) };
      }
      if (row.markup !== undefined && round2(row.markup) !== round2(markupOf(line, item))) next = { ...next, marginOverride: round2(row.markup) };
      if (row.words && row.words !== specWordsOf(line, item)) next = { ...next, specs: row.words, specsOwn: true };
      const what = describe(line, next, bankMap, unit);
      if (!what.length) { unchanged++; return; }
      changes.push({ kind: 'chg', id: line.id, name: resolveBoqLine(line, bankMap).name, room: next.roomId || FLAT, what: what.join(' · '), after: next, delta: amount(next) - amount(line) });
      return;
    }
    if (row.key && line) return; // a deleted line's row: leave it
    if (!row.item) return;
    const made = newLineFor({ name: row.item, room: row.room && row.room !== FLAT ? (roomFor(row.room, roomNames) || row.room) : null, qty: row.qty, unit: row.unit, w: row.w, h: row.h, cost: row.cost, markup: row.markup, words: row.words }, ctx);
    changes.push({ kind: 'new', name: resolveBoqLine(made, bankMap).name, room: made.roomId || FLAT, what: made.bankId && bankMap.has(made.bankId) ? `No Line ID · matched to the Item Bank${made.roomId ? ` · in ${made.roomId}` : ''}` : 'No Line ID · not in the Item Bank', after: made, delta: amount(made) });
  });

  boq.filter(l => live(l) && !seen.has(l.id)).forEach(l => {
    changes.push({ kind: 'del', id: l.id, name: resolveBoqLine(l, bankMap).name, room: l.roomId || FLAT, what: 'Row deleted in the sheet', delta: -amount(l) });
  });
  return { changes, unchanged, changedSince: !!sheet.meta.fingerprint && sheet.meta.fingerprint !== fingerprintOf(boq) };
}

/** A new line from a row: the bank's item when the name matches one, else a line of its own. */
function newLineFor(
  r: { name: string; room: string | null; qty?: number; unit?: string; w?: number; h?: number; cost?: number; markup?: number; rate?: number; words?: string },
  ctx: { bank: Item[]; bankMap: Map<string, Item>; newId: () => string },
): BoqItem {
  const item = matchBankItem(r.name, ctx.bank);
  if (item) {
    let l: BoqItem = { id: ctx.newId(), bankId: item.id, qty: r.qty ?? 1, ...(r.room ? { roomId: r.room } : {}), baseRate: item.materials };
    if (r.w || r.h) l = { ...l, ...sizeUpdates({ a: r.w, b: r.h, unit: 'ft' }, item.unit) };
    if (r.cost !== undefined) l = { ...l, baseRate: Math.max(0, round2(r.cost - (Number(item.labor) || 0))) };
    const cost = unitCostOf(l, ctx.bankMap);
    if (r.markup !== undefined) l = { ...l, marginOverride: round2(r.markup) };
    else if (r.rate && cost > 0) l = { ...l, marginOverride: round2((r.rate / cost - 1) * 100) };
    return l;
  }
  const cost = r.cost ?? (r.rate ? Math.round(r.rate * 0.8) : 0);
  const markup = r.markup ?? (r.rate && cost > 0 ? round2((r.rate / cost - 1) * 100) : 0);
  return {
    id: ctx.newId(), name: nameWithoutSize(r.name), cat: 'Imported', unit: r.unit || 'nos', qty: r.qty ?? 1,
    ...(r.room ? { roomId: r.room } : {}), baseRate: cost, marginOverride: markup, specs: r.words || nameWithoutSize(r.name),
  } as unknown as BoqItem;
}

/** The BOQ with the picked changes made: one write, so one undo. */
export function applyStudio(boq: BoqItem[], changes: StudioChange[], picked: Set<number>): BoqItem[] {
  const del = new Set<string>(), upd = new Map<string, BoqItem>(), add: BoqItem[] = [];
  changes.forEach((c, i) => {
    if (!picked.has(i)) return;
    if (c.kind === 'del' && c.id) del.add(c.id);
    if (c.kind === 'chg' && c.id && c.after) upd.set(c.id, c.after);
    if (c.kind === 'new' && c.after) add.push(c.after);
  });
  return [...boq.filter(l => !del.has(l.id)).map(l => upd.get(l.id) || l), ...add];
}

/* ───────────────────────────── in: any other sheet ───────────────────────────── */

/** A size written in an item's name: "Loft 6 x 2 ft" → 6 × 2. */
export function sizeFromName(name: string): { w: number; h: number } | null {
  const m = String(name || '').match(/(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?\s*(?:x|×|\*|by)\s*(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?/i);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}
/** The name with any size and trailing punctuation taken off. */
export function nameWithoutSize(name: string): string {
  return String(name || '').replace(/,?\s*\(?\d+(?:\.\d+)?\s*(?:'|ft|feet)?\s*(?:x|×|\*|by)\s*\d+(?:\.\d+)?\s*(?:'|ft|feet)?\)?/i, '').replace(/[,\s]+$/, '').trim();
}

export interface VendorRow { at: number; sheet: string; room: string; qty?: number; unit: string; rate?: number; cost?: number; words: string; size: { w: number; h: number } | null }

const VENDOR_COLS: [keyof VendorRow | 'amount', RegExp][] = [
  ['sheet', /^(item|items|item name|description of work|particulars?|name|item description|work)$|item|particular/i],
  ['room', /room|location|area|space|zone/i],
  ['qty', /^(qty|quantity|quantities|nos|no\.?)$|qty|quant/i],
  ['unit', /^(unit|uom|units)$|unit|uom/i],
  ['rate', /rate|price|unit sell/i],
  ['cost', /cost/i],
  ['amount', /amount|total/i],
  ['words', /spec|description|remarks?|notes?/i],
];

/**
 * A sheet read as today's Excel import reads it: the first row naming an item
 * column is the header; each column is matched by its heading. Returns the rows
 * and, in words, which column became what.
 */
export function readVendor(grid: Grid): { rows: VendorRow[]; matched: [string, string][] } {
  const h = grid.slice(0, 15).findIndex(r => r.filter(c => VENDOR_COLS.some(([, re]) => re.test(text(c)))).length >= 2 && r.some(c => VENDOR_COLS[0][1].test(text(c))));
  if (h < 0) return { rows: [], matched: [] };
  const heads = grid[h].map(text);
  const col = new Map<string, number>();
  VENDOR_COLS.forEach(([k, re]) => {
    const i = heads.findIndex((t, j) => t && re.test(t) && ![...col.values()].includes(j));
    if (i >= 0) col.set(k, i);
  });
  const LABEL: Record<string, string> = { sheet: 'item', room: 'room', qty: 'Qty', unit: 'Unit', rate: 'client rate', cost: 'cost', amount: 'amount', words: 'specification' };
  const matched = [...col.entries()].sort((a, b) => a[1] - b[1]).map(([k, i]) => [heads[i], LABEL[k]] as [string, string]);
  const get = (r: unknown[], k: string) => (col.has(k) ? r[col.get(k)!] : undefined);
  const rows: VendorRow[] = [];
  grid.slice(h + 1).forEach((r, j) => {
    const sheet = text(get(r, 'sheet'));
    if (!sheet || /^(sub\s*)?total|grand total/i.test(sheet)) return;
    const qty = num(get(r, 'qty'));
    let rate = num(get(r, 'rate'));
    const amount = num(get(r, 'amount'));
    if (rate === undefined && amount !== undefined && qty) rate = round2(amount / qty);
    const words = col.has('words') && col.get('words') !== col.get('sheet') ? text(get(r, 'words')) : '';
    rows.push({ at: h + j + 2, sheet, room: text(get(r, 'room')), qty, unit: text(get(r, 'unit')), rate, cost: num(get(r, 'cost')), words, size: sizeFromName(sheet) });
  });
  return { rows, matched };
}

export type Lands = 'plan' | 'waits' | 'list' | 'room';
export interface ImportRow {
  row: VendorRow;
  /** The Item Bank item it matched, if any. */
  item?: Item;
  /** The line it becomes. */
  line: BoqItem;
  /** The room it lands in; null when the sheet names none the project has. */
  room: string | null;
  /** Where it lands: on the plan, waiting under Needs a place, on the room list, or needing a room. */
  lands: Lands;
  cost: number;
  markup: number;
  /** The margin the sheet's rate makes, %. */
  margin: number;
  underFloor: boolean;
}

/**
 * Where each row of another sheet lands and how it is priced (the mockup's
 * import table). A row whose room the project lacks takes `fallbackRoom` and
 * says it needs a room. `costs` holds a cost typed for a row not in the bank.
 */
export function importPlan(rows: VendorRow[], ctx: {
  bank: Item[];
  bankMap: Map<string, Item>;
  rooms: Room[];
  boq: BoqItem[];
  newId: () => string;
  floors?: MarginFloors | null;
  fallbackRoom?: string | null;
  costs?: Record<number, number>;
}): ImportRow[] {
  const { bank, bankMap } = ctx;
  const names = ctx.rooms.map(r => r.name);
  const placedSoFar: BoqItem[] = [];
  const asPlaced = (l: BoqItem): PlacedPiece | null => {
    const item = bankMap.get(l.bankId);
    const draw = drawOf(item);
    if (!draw || !l.place) return null;
    return { id: l.id, room: l.roomId, fp: footprintOf(pieceSize(l, item, draw)), place: l.place, high: isHigh(draw), wallBacked: isWallBacked(draw) };
  };
  return rows.map((row, i) => {
    const named = roomFor(row.room, names);
    const room = named || ctx.fallbackRoom || null;
    const item = matchBankItem(row.sheet, bank);
    let line: BoqItem;
    let lands: Lands;
    let cost: number;
    let markup: number;
    if (item) {
      const draw = drawOf(item);
      const planRoom = ctx.rooms.find(r => r.name === room && r.plan);
      if (draw) {
        const made = newPieceLine(item, room, { x: 0, y: 0, rot: 0 }, ctx.newId())!;
        line = row.size ? resizedTo(made, item, row.size.w, row.size.h) : made;
        if (!row.size && row.qty) line = { ...line, qty: row.qty };
        const fp = footprintOf(pieceSize(line, item, draw));
        const others = [...ctx.boq, ...placedSoFar].filter(l => l.roomId === room).map(asPlaced).filter((p): p is PlacedPiece => !!p);
        const at = planRoom ? autoPlace({ id: line.id, room: room || undefined, fp, place: line.place!, high: isHigh(draw), wallBacked: isWallBacked(draw) }, { name: planRoom.name, plan: planRoom.plan }, others) : null;
        if (at) { line = { ...line, place: { ...line.place!, x: at.x, y: at.y, rot: at.rot } }; lands = 'plan'; placedSoFar.push(line); }
        else { const { place: _p, ...rest } = line; line = rest as BoqItem; lands = 'waits'; }
      } else {
        line = { id: ctx.newId(), bankId: item.id, qty: row.qty ?? 1, ...(room ? { roomId: room } : {}), baseRate: item.materials };
        if (row.size) line = { ...line, ...sizeUpdates({ a: row.size.w, b: row.size.h, unit: 'ft' }, item.unit) };
        lands = 'list';
      }
      if (row.cost !== undefined) line = { ...line, baseRate: Math.max(0, round2(row.cost - (Number(item.labor) || 0))) };
      cost = unitCostOf(line, bankMap);
      markup = row.rate && cost > 0 ? round2((row.rate / cost - 1) * 100) : round2(markupOf(line, item));
      line = { ...line, marginOverride: markup };
    } else {
      cost = ctx.costs?.[i] ?? row.cost ?? (row.rate ? Math.round(row.rate * 0.8) : 0);
      markup = row.rate && cost > 0 ? round2((row.rate / cost - 1) * 100) : 0;
      const qty = row.qty ?? 1;
      line = {
        id: ctx.newId(), name: nameWithoutSize(row.sheet), cat: 'Imported', unit: row.unit || 'nos', qty,
        ...(room ? { roomId: room } : {}), baseRate: cost, marginOverride: markup, specs: row.words || nameWithoutSize(row.sheet),
      } as unknown as BoqItem;
      lands = 'list';
    }
    if (!named) lands = 'room';
    const rate = cost * (1 + markup / 100);
    const margin = rate > 0 ? ((rate - cost) / rate) * 100 : 0;
    return { row, item, line, room, lands, cost, markup, margin, underFloor: margin < marginFloorFor(item?.cat || 'Imported', ctx.floors) - 1e-6 };
  });
}

/**
 * The lines to add, and the Item Bank items the Owner ticked: a row not in
 * the bank becomes an item of its own, and its line points at it.
 */
export function importLines(plan: ImportRow[], toBank: Set<number>, newId: () => string): { lines: BoqItem[]; items: Item[] } {
  const items: Item[] = [];
  const lines = plan.map((p, i) => {
    if (p.item || !toBank.has(i)) return p.line;
    const item: Item = {
      id: newId(), name: p.line.name || nameWithoutSize(p.row.sheet), cat: 'Imported', unit: (p.line as any).unit || 'nos',
      specs: p.line.specs || '', materials: p.cost, labor: 0, margin: p.markup,
    } as Item;
    items.push(item);
    return { ...p.line, bankId: item.id };
  });
  return { lines, items };
}
