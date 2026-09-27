import { Item } from '../types';
import { resolveBoqLine, isBillable } from './boqPricing';
import { calculateSellPrice } from './utils';
import { displayName, normaliseUnit } from './detailedBoq';
import type { ScopeRevisionRecord } from './scopeRevision';
import {
  SignedLine, ImportedLine, ParsedSheet, RevisionSettings, RevisionResult, RevisionRoom, RevisionLine, LineKind, Bridge,
  computeRevision, nameSimilarity, roomDisplayName, HELD_REASON, isPricedLine,
} from './scopeRevision';

/**
 * THE REVISION DRAFT — one working copy of the signed BOQ, changed however suits.
 *
 * The Workbench edited the approved tier line by line and synced it on its
 * own; the first Scope Revision flow compared an Excel with the signed BOQ.
 * Two tools for one job. Here a revision is a draft of the signed BOQ in which
 * every line remembers the signed line it came from, and changes arrive by
 * either route — edited by hand, or merged in from an Excel — into the same
 * draft. Because the link is kept on the line, the comparison never has to
 * guess what became what: a hand edit is already paired, and an Excel import
 * is paired once, when it is merged, where the studio can see and correct it.
 *
 * `revisionFromDraft` turns the draft into the same `RevisionResult` the
 * documents, the portal and Apply already read, so everything downstream is
 * unchanged.
 */

export type DraftSource = 'signed' | 'excel' | 'edit';

export interface DraftLine {
  id: string;
  /** The signed line this is, or replaces. Absent for a line new in the revision. */
  signedLineId?: string | null;
  /** Revised room, as the client will read it. */
  room: string;
  name: string;
  unit: string;
  qty: number;
  /** Net sell rate per unit. */
  rate: number;
  source: DraftSource;
  /** Taken out of the scope in this revision. */
  removed?: boolean;
  /** In the Excel but outside its price — removed there, to be confirmed, as actuals. */
  heldReason?: string | null;
  /** A rate-bank item, when the line was added or replaced from the bank. */
  bankId?: string | null;
  /** Per-unit cost to the studio. Studio only — never in a document. */
  cost?: number | null;
  description?: string | null;
  /** For an Excel line: the sheet's own rate, and whether the basis may move it. */
  listRate?: number | null;
  basisLocked?: boolean;
  excelId?: string | null;
  /** The sheet's note on the line ("Client to supply"), carried to the BOQ. */
  note?: string | null;
  /** What the studio did, in a few words: "Re-measured on site", "Added from the bank". */
  editNote?: string | null;
}

export interface ScopeDraft {
  lines: DraftLine[];
  /** Signed room -> the room's name in the revision. */
  roomOf: Record<string, string>;
  /** Revised rooms compared as a whole, not line by line. */
  sectionCompare: string[];
  /** Basis applied to Excel lines the matcher could not tie to a signed rate. */
  basis: number;
  /** The Excel this draft last merged, if any. */
  excel?: {
    fileName: string;
    sheetName: string;
    costSheet?: string | null;
    importedAt: number;
    lineCount: number;
    listTotal: number;
    statedTotal?: number | null;
    basisDetected: number;
    net: number;
    list: number;
  } | null;
  summary: string;
  roomNotes: Record<string, string>;
}

let seq = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const near = (a: number, b: number, tol = 0.0005) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * tol);

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

/** Per-unit cost of a signed line, from its frozen fields — for margins only. */
function signedCost(b: any, bankMap: Map<string, Item>): number | null {
  const item = bankMap.get(b?.bankId);
  if (item) {
    const m = b.baseRate !== undefined ? b.baseRate : item.materials;
    const l = b.labor !== undefined ? b.labor : item.labor;
    return (Number(m) || 0) + (Number(l) || 0);
  }
  const own = (Number(b?.materials ?? b?.baseRate) || 0) + (Number(b?.labor) || 0);
  return own > 0 ? own : null;
}

/** A draft that is exactly the signed BOQ: nothing changed yet. */
export function startDraft(signed: SignedLine[], signedBoq: any[], bankMap: Map<string, Item>): ScopeDraft {
  const byId = new Map((signedBoq || []).map((b: any, i: number) => [String(b.id || `line-${i}`), b]));
  const roomOf: Record<string, string> = {};
  signed.forEach(s => { roomOf[s.room] = s.room; });
  return {
    lines: signed.map(s => ({
      id: `d-${s.lineId}`,
      signedLineId: s.lineId,
      room: s.room,
      name: s.name,
      unit: s.unit,
      qty: s.qty,
      rate: s.rate,
      source: 'signed' as const,
      bankId: s.bankId || null,
      cost: signedCost(byId.get(s.lineId), bankMap),
      description: (byId.get(s.lineId) as any)?.description || null,
    })),
    roomOf,
    sectionCompare: [],
    basis: 1,
    excel: null,
    summary: '',
    roomNotes: {},
  };
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/** The sell rate a bank item carries today. */
export const bankSellRate = (item: Item) => calculateSellPrice(item.materials, item.labor, item.margin);

export function addFromBank(draft: ScopeDraft, room: string, item: Item, qty = 1): ScopeDraft {
  const line: DraftLine = {
    id: newId('d-bank'),
    room,
    name: displayName(item.name),
    unit: normaliseUnit(item.unit),
    qty,
    rate: bankSellRate(item),
    source: 'edit',
    bankId: item.id,
    cost: (Number(item.materials) || 0) + (Number(item.labor) || 0),
    description: item.specs || null,
    editNote: `Added from the rate bank${item.cat ? ` · ${item.cat}` : ''}`,
  };
  return { ...draft, lines: [...draft.lines, line] };
}

export function addCustom(draft: ScopeDraft, room: string, v: { name: string; unit: string; qty: number; rate: number; cost?: number | null; description?: string }): ScopeDraft {
  const line: DraftLine = {
    id: newId('d-custom'),
    room,
    name: v.name.trim(),
    unit: normaliseUnit(v.unit),
    qty: v.qty,
    rate: v.rate,
    source: 'edit',
    cost: v.cost ?? null,
    description: v.description || null,
    editNote: 'Custom item',
  };
  return { ...draft, lines: [...draft.lines, line] };
}

export function updateLine(draft: ScopeDraft, id: string, patch: Partial<DraftLine>, note?: string): ScopeDraft {
  return {
    ...draft,
    lines: draft.lines.map(l => (l.id === id ? { ...l, ...patch, source: 'edit', editNote: note ?? l.editNote ?? 'Edited by you' } : l)),
  };
}

/** Replace a line with a bank item: same place in the scope, a different design. */
export function replaceWithBank(draft: ScopeDraft, id: string, item: Item): ScopeDraft {
  return updateLine(draft, id, {
    name: displayName(item.name),
    unit: normaliseUnit(item.unit),
    rate: bankSellRate(item),
    bankId: item.id,
    cost: (Number(item.materials) || 0) + (Number(item.labor) || 0),
    description: item.specs || null,
    listRate: null,
    basisLocked: true,
  }, `Replaced with ${displayName(item.name)} from the bank`);
}

export function removeLine(draft: ScopeDraft, id: string): ScopeDraft {
  const line = draft.lines.find(l => l.id === id);
  if (!line) return draft;
  // A line new in this revision simply goes; a signed line is marked removed.
  if (!line.signedLineId) return { ...draft, lines: draft.lines.filter(l => l.id !== id) };
  return updateLine(draft, id, { removed: true }, 'Removed by you');
}

export function restoreLine(draft: ScopeDraft, id: string, signed: SignedLine[]): ScopeDraft {
  const line = draft.lines.find(l => l.id === id);
  const s = signed.find(x => x.lineId === line?.signedLineId);
  return updateLine(draft, id, { removed: false, qty: line && line.qty > 0 ? line.qty : s?.qty ?? 1 }, 'Restored by you');
}

export function renameRoom(draft: ScopeDraft, from: string, to: string): ScopeDraft {
  const name = to.trim();
  if (!name || name === from) return draft;
  const roomOf = Object.fromEntries(Object.entries(draft.roomOf).map(([k, v]) => [k, v === from ? name : v]));
  const notes = { ...draft.roomNotes };
  if (notes[from]) { notes[name] = notes[from]; delete notes[from]; }
  return {
    ...draft,
    roomOf,
    roomNotes: notes,
    sectionCompare: draft.sectionCompare.map(r => (r === from ? name : r)),
    lines: draft.lines.map(l => (l.room === from ? { ...l, room: name } : l)),
  };
}

/** Re-apply the basis to Excel lines whose rate the basis decides. */
export function setBasis(draft: ScopeDraft, basis: number): ScopeDraft {
  return {
    ...draft,
    basis,
    lines: draft.lines.map(l =>
      l.source === 'excel' && l.listRate && !l.basisLocked ? { ...l, rate: l.listRate * basis } : l
    ),
  };
}

// ---------------------------------------------------------------------------
// Merging an Excel
// ---------------------------------------------------------------------------

/**
 * Merge a revised sheet into the draft.
 *
 * The sheet is matched against the SIGNED BOQ (never against the draft, so an
 * edit cannot throw the matching off) with the rooms and basis the studio
 * confirmed. Its lines then replace the draft's — except where the studio has
 * already edited a line by hand: an edit is a decision, and a sheet exported
 * before it cannot overrule it. Lines the studio added keep their place.
 */
export function mergeExcel(
  draft: ScopeDraft,
  signed: SignedLine[],
  sheet: ParsedSheet,
  /** Studio costs by sheet line id — `internalCostsFor(sheet, costingSheet)`. */
  costs: Record<string, number>,
  costSheet: string | null,
  settings: RevisionSettings,
  fileName: string,
  at = Date.now(),
): ScopeDraft {
  const result = computeRevision(signed, sheet.lines, settings);
  const edits = draft.lines.filter(l => l.source === 'edit');
  const editedSigned = new Set(edits.map(l => l.signedLineId).filter(Boolean) as string[]);

  const lines: DraftLine[] = [];
  const fromImported = (im: ImportedLine, room: string, rate: number, basis: number, signedLineId?: string | null): DraftLine => ({
    id: `d-x-${im.id}`,
    signedLineId: signedLineId || null,
    room,
    name: im.name,
    unit: im.unit,
    qty: im.qty,
    rate,
    source: 'excel',
    cost: costs[im.id] ?? null,
    description: im.description || null,
    listRate: im.listRate,
    basisLocked: basis === 1 && settings.basisForNew !== 1,
    excelId: im.id,
    note: im.note || null,
  });

  result.rooms.forEach(room => {
    room.lines.forEach(l => {
      if (l.signed && editedSigned.has(l.signed.lineId)) return; // the edit stands
      if (l.kind === 'removed') {
        const s = l.signed!;
        lines.push({
          id: `d-${s.lineId}`, signedLineId: s.lineId, room: room.name, name: s.name, unit: s.unit,
          qty: s.qty, rate: s.rate, source: 'excel', removed: true, editNote: 'Not in the revised Excel',
        });
        return;
      }
      lines.push(fromImported(l.imported!, room.name, l.rate2, l.basis, room.compareAsSection ? null : l.signed?.lineId));
    });
  });
  // Excel lines outside the price: listed, never priced.
  result.zeroImported.forEach(im => {
    const room = settings.roomNames[im.section] || roomDisplayName(im.section);
    lines.push({ ...fromImported(im, room, im.listRate * settings.basisForNew, 1, null), qty: 0, heldReason: im.heldOut ? HELD_REASON[im.heldOut] : 'At zero quantity in the Excel' });
  });

  // Signed rooms compared as a whole: their signed lines leave the line-by-line view.
  const sectionRooms = result.rooms.filter(r => r.compareAsSection).map(r => r.name);
  const roomOf: Record<string, string> = { ...draft.roomOf };
  Object.entries(settings.roomMap).forEach(([sec, signedRoom]) => {
    if (signedRoom) roomOf[signedRoom] = settings.roomNames[sec] || roomDisplayName(sec);
  });

  const net = result.rooms.flatMap(r => r.lines).filter(l => l.signed && l.imported && l.basis === 1).length;
  const list = result.rooms.flatMap(r => r.lines).filter(l => l.signed && l.imported && l.basis !== 1).length;
  return {
    ...draft,
    lines: [...lines, ...edits],
    roomOf,
    // Which rooms compare as a whole is decided with the sheet, room by room.
    sectionCompare: sectionRooms,
    basis: settings.basisForNew,
    excel: {
      fileName,
      sheetName: sheet.sheetName,
      costSheet,
      importedAt: at,
      lineCount: sheet.lines.length,
      listTotal: sheet.listTotal,
      statedTotal: sheet.statedTotal,
      basisDetected: settings.basisDetected,
      net,
      list,
    },
  };
}

// ---------------------------------------------------------------------------
// Reading the draft as a revision
// ---------------------------------------------------------------------------

const EMPTY = (): Record<LineKind, number> => ({ same: 0, qty: 0, rate: 0, qty_rate: 0, redesign: 0, new: 0, removed: 0 });

/** How a draft line differs from what was signed. */
export function draftKind(l: DraftLine, s?: SignedLine | null): LineKind {
  if (!s) return 'new';
  if (l.removed || !(l.qty > 0) || l.heldReason) return 'removed';
  if (nameSimilarity(s.name, l.name) < 0.8) return 'redesign';
  const qm = Math.abs(l.qty - s.qty) > 1e-4;
  const rm = !near(l.rate, s.rate);
  return qm && rm ? 'qty_rate' : qm ? 'qty' : rm ? 'rate' : 'same';
}

/**
 * The draft as a `RevisionResult` — the shape the documents, the portal, the
 * bridge and Apply read. Each draft line becomes a revision line whose
 * "imported" side is the draft line itself, at a basis of 1 (draft rates are
 * already net).
 */
export function revisionFromDraft(signed: SignedLine[], draft: ScopeDraft): RevisionResult {
  const byId = new Map(signed.map(s => [s.lineId, s]));
  const counts = EMPTY();
  const bridge: Bridge = { new: 0, qty: 0, redesign: 0, section: 0, removed: 0, rate: 0 };
  const referenced = new Set(draft.lines.map(l => l.signedLineId).filter(Boolean) as string[]);
  const pseudo = (l: DraftLine): ImportedLine => ({ id: l.id, section: l.room, name: l.name, unit: l.unit, qty: l.qty, listRate: l.rate, note: undefined, description: l.description || undefined });

  // Room order: signed rooms as they were, then rooms new in the revision.
  const order: string[] = [];
  signed.forEach(s => { const r = draft.roomOf[s.room] || s.room; if (!order.includes(r)) order.push(r); });
  draft.lines.forEach(l => { if (!order.includes(l.room)) order.push(l.room); });
  const signedRoomFor = (room: string) => Object.keys(draft.roomOf).find(k => draft.roomOf[k] === room) || (signed.some(s => s.room === room && !draft.roomOf[s.room]) ? room : null);

  const rooms: RevisionRoom[] = [];
  const zero: ImportedLine[] = [];
  order.forEach(roomName => {
    const signedRoom = signedRoomFor(roomName);
    const here = draft.lines.filter(l => l.room === roomName);
    const asSection = draft.sectionCompare.includes(roomName) && !!signedRoom;
    const room: RevisionRoom = { name: roomName, section: roomName, signedRoom, compareAsSection: asSection, before: 0, after: 0, lines: [], note: draft.roomNotes[roomName] || undefined };

    if (asSection) {
      const before = signed.filter(s => s.room === signedRoom);
      room.before = before.reduce((t, s) => t + s.amount, 0);
      here.forEach(l => {
        if (l.heldReason || !(l.qty > 0) || l.removed) { if (!l.signedLineId) zero.push({ ...pseudo(l), heldOut: undefined }); return; }
        const line: RevisionLine = { id: l.id, kind: 'new', imported: pseudo(l), qty2: l.qty, rate2: l.rate, amount2: l.qty * l.rate, basis: 1, score: 0 };
        room.lines.push(line);
      });
      room.after = room.lines.reduce((t, l) => t + l.amount2, 0);
      bridge.section += room.after - room.before;
      rooms.push(room);
      return;
    }

    here.forEach(l => {
      const s = l.signedLineId ? byId.get(l.signedLineId) : undefined;
      if (!s && (l.heldReason || !(l.qty > 0))) { zero.push(pseudo(l)); return; }
      const kind = draftKind(l, s);
      const priced = kind !== 'removed';
      const line: RevisionLine = {
        id: l.id, kind, signed: s, imported: priced ? pseudo(l) : undefined,
        qty2: priced ? l.qty : 0, rate2: priced ? l.rate : 0, amount2: priced ? l.qty * l.rate : 0,
        basis: 1, score: s ? nameSimilarity(s.name, l.name) : 0, manual: l.source === 'edit',
      };
      room.lines.push(line);
      if (l.heldReason && s) zero.push(pseudo(l));
    });
    // Signed lines of this room that no draft line carries: removed.
    if (signedRoom) {
      signed.filter(s => s.room === signedRoom && !referenced.has(s.lineId)).forEach(s => {
        room.lines.push({ id: `removed:${s.lineId}`, kind: 'removed', signed: s, qty2: 0, rate2: 0, amount2: 0, basis: 1, score: 0 });
      });
    }
    room.before = room.lines.reduce((t, l) => t + (l.signed?.amount || 0), 0);
    room.after = room.lines.reduce((t, l) => t + l.amount2, 0);
    if (room.lines.length || room.before) rooms.push(room);
  });

  // Signed rooms no revised room claims.
  const claimed = new Set(rooms.map(r => r.signedRoom).filter(Boolean));
  Array.from(new Set(signed.map(s => s.room))).filter(r => !claimed.has(r) && !claimed.has(draft.roomOf[r])).forEach(r => {
    const lines = signed.filter(s => s.room === r && !referenced.has(s.lineId))
      .map(s => ({ id: `removed:${s.lineId}`, kind: 'removed' as LineKind, signed: s, qty2: 0, rate2: 0, amount2: 0, basis: 1, score: 0 }));
    if (!lines.length) return;
    rooms.push({ name: r, section: null, signedRoom: r, compareAsSection: false, before: lines.reduce((t, l) => t + l.signed.amount, 0), after: 0, lines });
  });

  rooms.forEach(room => {
    if (room.compareAsSection) return;
    room.lines.forEach(l => {
      counts[l.kind]++;
      const a1 = l.signed?.amount || 0;
      if (l.kind === 'new') bridge.new += l.amount2;
      else if (l.kind === 'removed') bridge.removed -= a1;
      else if (l.kind === 'redesign') bridge.redesign += l.amount2 - a1;
      else { bridge.qty += (l.qty2 - l.signed!.qty) * l.signed!.rate; bridge.rate += (l.rate2 - l.signed!.rate) * l.qty2; }
    });
  });

  const v1Total = signed.reduce((t, s) => t + s.amount, 0);
  const v2Total = rooms.reduce((t, r) => t + r.after, 0);
  const change = v2Total - v1Total;
  const sum = bridge.new + bridge.qty + bridge.redesign + bridge.section + bridge.removed + bridge.rate;
  return { basis: draft.basis, v1Total, v2Total, change, bridge, bridgeGap: sum - change, rooms, zeroImported: zero, counts };
}

/** The settings the documents read, from the draft. */
export function draftSettings(draft: ScopeDraft): RevisionSettings {
  const descriptions: Record<string, string> = {};
  draft.lines.forEach(l => { if (l.description) descriptions[l.id] = l.description; });
  return {
    basisDetected: draft.excel?.basisDetected ?? draft.basis,
    basisForNew: draft.basis,
    roomMap: {},
    roomNames: {},
    sectionCompare: draft.sectionCompare,
    manualPairs: {},
    unpaired: [],
    descriptions,
    roomNotes: draft.roomNotes,
    summary: draft.summary,
  };
}

// ---------------------------------------------------------------------------
// The revised BOQ
// ---------------------------------------------------------------------------

/**
 * Tier lines for the revised BOQ.
 *
 *  - a line that is the same signed item keeps its identity (id, bank item)
 *    with its frozen cost scaled to the new rate, so its margin holds;
 *  - a line from the bank is a bank line, frozen at today's bank values and
 *    scaled to the draft rate;
 *  - anything else carries its cost (margin = rate / cost − 1) or, without
 *    one, its rate at 0%.
 */
export function buildBoqFromDraft(signedBoq: any[], signed: SignedLine[], draft: ScopeDraft, bankMap: Map<string, Item>, revisionNumber: number, at = Date.now()): any[] {
  const byId = new Map((signedBoq || []).map((b: any, i: number) => [String(b.id || `line-${i}`), b]));
  const signedById = new Map(signed.map(s => [s.lineId, s]));
  const out: any[] = [];
  let n = 0;
  const section = new Set(draft.sectionCompare);

  draft.lines.forEach(l => {
    const s = l.signedLineId ? signedById.get(l.signedLineId) : undefined;
    const outOfScope = l.removed || !!l.heldReason || !(l.qty > 0);
    if (outOfScope && s) return; // removed signed line: not carried
    const base: any = { roomId: l.room, qty: outOfScope ? 0 : l.qty, rateSnapshotAt: at };
    if (l.description) base.description = l.description;
    if (l.heldReason) base.heldReason = l.heldReason;
    if (l.note) base.commercialNote = l.note;

    // 1. The same signed item.
    const original = s ? byId.get(s.lineId) : undefined;
    if (original && s && !section.has(l.room) && draftKind(l, s) !== 'redesign') {
      const sameBank = !l.bankId || l.bankId === original.bankId;
      if (sameBank) {
        const k = s.rate > 0 ? l.rate / s.rate : 1;
        const item = bankMap.get(original.bankId);
        const line: any = { ...original, ...base };
        if (item) {
          line.baseRate = (original.baseRate !== undefined ? original.baseRate : item.materials) * k;
          line.labor = (original.labor !== undefined ? original.labor : item.labor) * k;
          line.marginOverride = original.marginOverride ?? item.margin;
        } else if ((original.materials ?? original.baseRate ?? 0) > 0 || (original.labor ?? 0) > 0) {
          if (original.materials !== undefined) line.materials = original.materials * k;
          if (original.baseRate !== undefined) line.baseRate = original.baseRate * k;
          if (original.labor !== undefined) line.labor = original.labor * k;
          if (original.selectedRate) line.selectedRate = l.rate;
        } else {
          line.selectedRate = l.rate;
        }
        out.push(line);
        return;
      }
    }

    n++;
    // 2. A bank item.
    const item = l.bankId ? bankMap.get(l.bankId) : undefined;
    if (item) {
      const sell = bankSellRate(item);
      const k = sell > 0 ? l.rate / sell : 1;
      out.push({
        ...base,
        id: `sr${revisionNumber}-${n}-${l.bankId}`,
        bankId: item.id,
        baseRate: (Number(item.materials) || 0) * k,
        labor: (Number(item.labor) || 0) * k,
        marginOverride: item.margin,
        ...(s ? { revisedFrom: s.lineId } : {}),
      });
      return;
    }

    // 3. Anything else: its cost if known, else its rate at 0%.
    const hasCost = !!l.cost && l.cost > 0 && l.rate > 0 && !outOfScope;
    out.push({
      ...base,
      id: `sr${revisionNumber}-${n}`,
      bankId: `SR${revisionNumber}_${n}`,
      name: l.name,
      unit: l.unit,
      baseRate: hasCost ? l.cost : l.rate,
      labor: 0,
      marginOverride: hasCost ? (l.rate / (l.cost as number) - 1) * 100 : 0,
      selectedRate: l.rate,
      ...(s ? { revisedFrom: s.lineId } : {}),
      ...(/as\s*actuals?/i.test(l.name) ? { boqStatus: 'as_actuals' } : {}),
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Studio-only margin
// ---------------------------------------------------------------------------

/** Sell, cost and margin on the lines this revision changes or adds. */
export function draftMargin(signed: SignedLine[], draft: ScopeDraft, result?: RevisionResult): { sell: number; cost: number; margin: number; costed: number; lines: number } {
  const byId = new Map(signed.map(s => [s.lineId, s]));
  // A room compared as a whole whose total did not move has changed nothing.
  const still = new Set((result?.rooms || []).filter(r => r.compareAsSection && Math.abs(r.after - r.before) < 0.5).map(r => r.name));
  let sell = 0, cost = 0, costed = 0, lines = 0;
  draft.lines.forEach(l => {
    if (still.has(l.room)) return;
    const k = draftKind(l, l.signedLineId ? byId.get(l.signedLineId) : undefined);
    if (k === 'same' || k === 'removed' || !(l.qty > 0) || l.heldReason) return;
    lines++;
    if (l.cost && l.cost > 0) { sell += l.qty * l.rate; cost += l.qty * l.cost; costed++; }
  });
  return { sell, cost, margin: sell > 0 ? ((sell - cost) / sell) * 100 : 0, costed, lines };
}

export { isPricedLine, isBillable, resolveBoqLine };

// ---------------------------------------------------------------------------
// Records made by the first flow
// ---------------------------------------------------------------------------

/**
 * The draft of a record the seven-step wizard made, which kept only the sheet
 * and its settings. Merging that sheet into an untouched draft gives the same
 * comparison, line for line, so an older revision opens in the same screen.
 */
export function draftOfRecord(rec: ScopeRevisionRecord, signed: SignedLine[], signedBoq: any[], bankMap: Map<string, Item>): ScopeDraft {
  if (rec.draft) return rec.draft;
  const start = startDraft(signed, signedBoq, bankMap);
  if (!rec.imported?.length) return start;
  const sheet: ParsedSheet = {
    sheetName: rec.source?.sheetName || 'Sheet',
    lines: rec.imported,
    sections: Array.from(new Set(rec.imported.map(l => l.section))),
    listTotal: rec.source?.listTotal || 0,
    statedTotal: rec.source?.statedTotal ?? null,
    internal: false,
    warnings: [],
  };
  const merged = mergeExcel(start, signed, sheet, rec.internalCosts || {}, rec.source?.costSheet || null, rec.settings, rec.source?.fileName || '', rec.source?.importedAt || rec.createdAt);
  return { ...merged, summary: rec.settings.summary || '', roomNotes: rec.settings.roomNotes || {} };
}
