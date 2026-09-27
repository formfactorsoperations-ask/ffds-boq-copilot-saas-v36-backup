import { Item } from '../types';
import { resolveBoqLine, isBillable } from './boqPricing';
import { displayName, normaliseUnit } from './detailedBoq';

/**
 * SCOPE REVISION — how a revised BOQ becomes the client's scope.
 *
 * The old path compared an imported sheet against the approved tier, let the
 * studio approve its own result, and rewrote the payment calculator — the
 * client was never asked. It also compared the Excel's LIST rates with the
 * app's NET rates, which on Unique Vistas overstated the change by ~₹88k, and
 * it matched lines greedily across rooms, so two bedrooms with the same
 * furniture traded wardrobes.
 *
 * Here the revision is a draft record until the client signs it:
 *
 *   parse    the client sheet of the revised Excel (never the internal one)
 *   basis    detect the signed commercial basis and carry it, line by line
 *   rooms    the studio confirms which revised room each signed room became
 *   match    lines are paired inside their room only; unpaired lines are new
 *            or removed; a renamed pair is a redesign
 *   bridge   the change, split six ways, adding up to v2 - v1 exactly
 *
 * Everything in this file is pure. The wizard holds the settings; `computeRevision`
 * turns settings + inputs into the result every screen and document reads.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One priced row of the revised sheet, as the client sheet states it. */
export interface ImportedLine {
  id: string;
  section: string;
  name: string;
  unit: string;
  qty: number;
  /** The sheet's own rate — list basis, before the project's terms. */
  listRate: number;
  note?: string;
  /** Specifications the sheet wrote under the name, in the same cell. */
  description?: string;
  /** Per-unit cost to the studio, read from a costing sheet only. */
  unitCost?: number;
  /**
   * In the sheet but outside its price: the amount sits in a "Removed from
   * scope", "To be confirmed" or "As actuals" column instead of the client
   * total, or the sheet prices it at nothing. Listed, never priced.
   */
  heldOut?: 'removed' | 'tbc' | 'as_actuals' | 'unpriced';
}

export const HELD_REASON: Record<NonNullable<ImportedLine['heldOut']>, string> = {
  removed: 'Removed from scope',
  tbc: 'To be confirmed',
  as_actuals: 'As actuals, paid directly',
  unpriced: 'Not priced in the revision',
};

/** A revised line that counts towards the price. */
export const isPricedLine = (l: ImportedLine): boolean => l.qty > 0 && !l.heldOut;

export interface ParsedSheet {
  sheetName: string;
  lines: ImportedLine[];
  sections: string[];
  /** Σ qty × rate as the sheet states it. */
  listTotal: number;
  /** The sheet's own grand total, from its TOTAL row, when it has one. */
  statedTotal: number | null;
  /** Looks like a costing sheet — margins, vendor costs. Never import it. */
  internal: boolean;
  warnings: string[];
}

/** A line of the signed version, as the engine needs it. */
export interface SignedLine {
  lineId: string;
  bankId?: string;
  room: string;
  name: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
}

export type LineKind = 'same' | 'qty' | 'rate' | 'qty_rate' | 'redesign' | 'new' | 'removed';

export interface RevisionLine {
  id: string;
  kind: LineKind;
  signed?: SignedLine;
  imported?: ImportedLine;
  /** Revised figures, on the signed basis. Absent for a removed line. */
  qty2: number;
  rate2: number;
  amount2: number;
  /** The multiplier applied to the sheet's rate for this line. */
  basis: number;
  /** How confident the pairing was, 0–1. Manual pairs are 1. */
  score: number;
  manual?: boolean;
}

export interface RevisionRoom {
  /** Name in the revised version, as the client will read it. */
  name: string;
  /** The sheet's own heading for it. */
  section: string | null;
  signedRoom: string | null;
  compareAsSection: boolean;
  before: number;
  after: number;
  lines: RevisionLine[];
  note?: string;
}

export interface Bridge {
  new: number;
  qty: number;
  redesign: number;
  section: number;
  removed: number;
  rate: number;
}

export interface RevisionResult {
  basis: number;
  v1Total: number;
  v2Total: number;
  change: number;
  bridge: Bridge;
  /** Σ bridge - change. Must be ~0; the wizard refuses to issue otherwise. */
  bridgeGap: number;
  rooms: RevisionRoom[];
  /** Revised lines at zero quantity: listed, not priced. */
  zeroImported: ImportedLine[];
  counts: Record<LineKind, number>;
}

export interface RevisionSettings {
  /** Detected basis: signed rate / sheet rate on unchanged items. */
  basisDetected: number;
  /** Basis applied to new lines and to rate changes. */
  basisForNew: number;
  /** sheet section -> signed room, or null for a room new in this revision. */
  roomMap: Record<string, string | null>;
  /** sheet section -> the name the client reads. */
  roomNames: Record<string, string>;
  /** Signed rooms compared as a whole rather than line by line. */
  sectionCompare: string[];
  /** Pairs the studio made by hand: imported id -> signed line id. */
  manualPairs: Record<string, string>;
  /** Imported ids the studio unpaired, so they count as new. */
  unpaired: string[];
  /** Client descriptions the studio wrote, by imported id. */
  descriptions: Record<string, string>;
  /** One line per room, by revised room name. */
  roomNotes: Record<string, string>;
  /** The paragraph at the top of the statement. */
  summary: string;
}

export type ScopeRevisionStatus = 'draft' | 'issued' | 'signed' | 'applied' | 'withdrawn';

/** Stored on the project. Holds the client sheet only — no costs, no margins. */
export interface ScopeRevisionRecord {
  id: string;
  number: number;
  status: ScopeRevisionStatus;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  /** The tier this revises — the signed scope at the time. */
  baseTierId: string;
  source: { fileName: string; sheetName: string; importedAt: number; lineCount: number; listTotal: number; statedTotal?: number | null; costSheet?: string | null };
  /**
   * The studio's cost per unit, by imported line id, from the workbook's
   * costing sheet. Studio-only: the portal projection never carries
   * `scopeRevisions`, and no client document reads this.
   */
  internalCosts?: Record<string, number>;
  imported: ImportedLine[];
  settings: RevisionSettings;
  /**
   * The working copy of the signed BOQ this revision edits — by hand, from an
   * Excel, or both. Records made by the first flow have none and read from
   * `imported` and `settings` instead.
   */
  draft?: import('./scopeDraft').ScopeDraft;
  /** Filled on issue. */
  issueId?: string | null;
  reference?: string | null;
  v2Reference?: string | null;
  v2Total?: number | null;
  /** The tier id the revised BOQ will take when applied, fixed at issue so
      the signed document and the tier it becomes point at each other. */
  v2TierId?: string | null;
  /** Filled on apply. */
  appliedAt?: number | null;
  appliedBy?: string | null;
  appliedTierId?: string | null;
  detailedIssueId?: string | null;
  withdrawnAt?: number | null;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export const norm = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[’']s\b/g, 's')
    // Dotted initials are one word: "T.V. unit" and "TV unit" are the same item.
    .replace(/\b([a-z])\.(?=[a-z]\b)/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Common misspellings and synonyms in studio sheets, folded before comparing. */
const FOLD: Record<string, string> = {
  wardobe: 'wardrobe', wardrob: 'wardrobe', shelfs: 'shelves', paneling: 'panelling',
  panneling: 'panelling', tv: 'tv', t: '', v: '', mirrror: 'mirror', headbord: 'headboard',
};
const STOP = new Set(['with', 'and', 'the', 'for', 'per', 'as', 'of', 'in', 'all', 'unit', 'type']);

function tokens(s: string): string[] {
  return norm(s)
    .split(' ')
    .map(w => (w in FOLD ? FOLD[w] : w))
    .map(w => w.replace(/s$/, ''))
    .filter(w => w.length > 1 && !STOP.has(w));
}

/** Dice coefficient over folded word tokens. 1 = same item name. */
export function nameSimilarity(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  ta.forEach(w => { if (tb.has(w)) hit++; });
  const dice = (2 * hit) / (ta.size + tb.size);
  if (dice === 1) return 0.97;
  return dice;
}

const near = (a: number, b: number, tol = 0.005) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * tol);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // Only a cell that IS a number: "Bathroom 3" is a heading, not the number 3.
  const raw = String(v).trim();
  if (!/^[₹rs.\s]*-?[\d,]*\.?\d+\s*$/i.test(raw)) return null;
  const s = raw.replace(/[^\d.\-]/g, '');
  if (!s || s === '-' || s === '.') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const INTERNAL_HEADER = /margin|profit|vendor|cost to me|discount %|updated unit cost/i;

/**
 * Read one sheet of a revised BOQ.
 *
 * Handles the studio's own layout — a header row, room headings as rows with
 * the room in the first column and nothing priced, items numbered beneath,
 * and a "TOTAL" row that ends the table — and the usual variations of it.
 */
export function parseRevisionSheet(rows: any[][], sheetName: string): ParsedSheet {
  const warnings: string[] = [];
  const text = (v: any) => String(v ?? '').trim();

  let headerAt = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = (rows[i] || []).map(c => text(c).toLowerCase());
    if (cells.some(c => /item|description|particular/.test(c)) && cells.some(c => /qty|quantity/.test(c))) {
      headerAt = i;
      break;
    }
  }
  if (headerAt < 0) {
    return { sheetName, lines: [], sections: [], listTotal: 0, statedTotal: null, internal: false, warnings: ['No header row with Item and Quantity columns was found.'] };
  }
  const header = (rows[headerAt] || []).map(c => text(c).toLowerCase());
  const find = (re: RegExp, not?: RegExp) => header.findIndex(h => re.test(h) && !(not && not.test(h)));
  const col = {
    sr: find(/^sr|^s\.?\s?no|^#|^no\.?$/),
    name: find(/item|description|particular/),
    unit: find(/unit of|^unit$|uom|measure/, /cost|rate|price/),
    qty: find(/qty|quantity/),
    rate: find(/unit cost|rate|unit price|price/, /total|margin|vendor|updated|%/),
    amount: find(/total cost to client|total|amount/, /profit|to me|margin/),
    note: find(/note|remark/),
    /* A costing sheet's per-unit vendor cost. "UNIT COST" there is the cost;
       on a client sheet the same header is the client's rate. */
    cost: (() => {
      const afterDiscount = find(/vendor cost after discount|cost after discount/);
      return afterDiscount >= 0 ? afterDiscount : find(/cost price|unit cost/, /total|profit|updated|margin|to client/);
    })(),
    /* Where the studio's sheets park a line outside the price. */
    removed: find(/removed from (the )?scope|^removed$/),
    tbc: find(/to be confirmed|^tbc$/),
    actuals: find(/^as[\s-]*actuals?\b/),
    /* A decision or status column, when the sheet has one. */
    status: find(/decision stat|commercial.*stat|^status$/),
  };
  const internal = header.some(h => INTERNAL_HEADER.test(h));

  /* The TOTAL row: its label says whether an as-actuals section is inside the
     total ("TOTAL COST (EXCLD LOOSE FURNITURE)" says it is not), and its figure
     is what the import is checked against. */
  let totalLabel = '';
  let statedTotal: number | null = null;
  for (let i = headerAt + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const lab = [text(r[0]), col.name >= 0 ? text(r[col.name]) : ''].find(x => /^total/i.test(x));
    if (!lab) continue;
    totalLabel = lab;
    statedTotal = col.amount >= 0 ? num(r[col.amount]) : null;
    break;
  }
  const actualsOutside = /excl|exclud|without/i.test(totalLabel);

  const lines: ImportedLine[] = [];
  const sections: string[] = [];
  let section = 'General';
  const rawIds = new Map<string, number>();

  for (let i = headerAt + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const first = text(r[0]);
    const cellText = col.name >= 0 ? String(r[col.name] ?? '').trim() : '';
    /* Newer sheets put the specification in the item cell, under the name
       ("... BAITHAK\n\nSpecs: ...\nFinish: ..."). The first line is the item;
       the rest is its description. Comparing the whole cell made an unchanged
       item read as redesigned the moment its specs were written in. */
    const [firstLine, ...specLines] = cellText.split(/\r?\n/);
    const rawName = (firstLine || '').trim();
    const cellSpecs = specLines.map(x => x.trim()).filter(Boolean).join(' · ');
    // A formula that returns 0 in the Item column is an empty cell, not an item called "0".
    const name = num(rawName) !== null ? '' : rawName;
    const qty = col.qty >= 0 ? num(r[col.qty]) : null;
    const rate = col.rate >= 0 ? num(r[col.rate]) : null;

    if (/^total/i.test(first) || /^total/i.test(name)) break;

    // A room heading: a label and nothing priced against it. A negative amount
    // with no quantity or rate is a credit ("Resale of old furniture"), never a
    // heading — headings carry the room's subtotal, which is never below zero.
    const amountHere = col.amount >= 0 ? num(r[col.amount]) : null;
    const credit = !internal && !!name && !qty && !rate && amountHere !== null && amountHere < 0;
    const label = credit ? '' : name && !qty && !rate ? name : !name && first && num(first) === null ? first : '';
    if (label && !qty && !rate) {
      section = label;
      if (!sections.includes(section)) sections.push(section);
      continue;
    }
    if (!name) continue;
    const statedHere = col.amount >= 0 ? num(r[col.amount]) : null;
    /* A priced line needs a quantity or a rate — except a credit or lump sum
       the sheet states only as an amount ("Resale of old furniture −6,000"),
       which its total includes. */
    if (qty === null && rate === null && !(statedHere && !internal)) continue;

    const base = norm(`${section}|${name}`).slice(0, 60) || `row-${i}`;
    const seen = rawIds.get(base) || 0;
    rawIds.set(base, seen + 1);
    let q = qty ?? 0;
    let listRate = rate ?? 0;
    const stated = col.amount >= 0 ? num(r[col.amount]) : null;
    const flag = (c: number) => c >= 0 && (num(r[c]) ?? 0) !== 0;
    let heldOut: ImportedLine['heldOut'];
    /* A whole room priced "as actuals" — "LOOSE FURNITURE (AS ACTUALS)" — sits
       outside the studio's total ("TOTAL COST (EXCLD LOOSE FURNITURE)"). One
       line marked as-actuals inside a priced room stays in the price. */
    if (!internal && actualsOutside && /as\s*actuals?|loose furniture/i.test(section)) heldOut = 'as_actuals';
    const said = col.status >= 0 ? text(r[col.status]).toLowerCase() : '';
    /* Older sheets record a removal as a negative amount with the status
       "Removed from scope"; the room subtotal leaves it out. A negative amount
       marked otherwise is a genuine credit and stays. */
    if (!internal && !heldOut && stated !== null && stated < 0 && /removed/.test(said)) heldOut = 'removed';
    if (!internal && !stated && !heldOut) {
      if (flag(col.removed) || /removed/.test(said)) heldOut = 'removed';
      else if (flag(col.tbc) || /to be confirmed|\btbc\b/.test(said)) heldOut = 'tbc';
      else if (flag(col.actuals) || /as actual/.test(said)) heldOut = 'as_actuals';
      else if (stated === 0 && q * listRate > 0) heldOut = 'unpriced';
    }
    /* On a client sheet the stated amount is what the total adds up, and so
       what the client agreed. Where it is not quantity × rate, it wins and the
       rate is worked back from it. (On a costing sheet that column is the
       client price, not the cost, so it is left alone.) */
    if (!internal && !heldOut && stated !== null && stated !== 0) {
      if (q > 0 && Math.abs(stated - q * listRate) > 1) {
        warnings.push(`${displayName(name)}: the sheet states ${stated.toLocaleString('en-IN')} where quantity × rate is ${(q * listRate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}. The stated amount is used.`);
        listRate = stated / q;
      } else if (!(q > 0)) {
        q = 1;
        listRate = stated;
      }
    }
    if (!sections.includes(section)) sections.push(section);
    lines.push({
      id: seen ? `${base}#${seen + 1}` : base,
      section,
      name,
      unit: normaliseUnit(col.unit >= 0 ? r[col.unit] : ''),
      qty: q,
      listRate,
      note: col.note >= 0 && text(r[col.note]) ? text(r[col.note]) : undefined,
      ...(cellSpecs ? { description: cellSpecs } : {}),
      unitCost: internal && col.cost >= 0 ? (num(r[col.cost]) ?? undefined) : undefined,
      ...(heldOut ? { heldOut } : {}),
    });
  }

  if (internal) warnings.unshift('This sheet has cost and margin columns. Import the client sheet instead.');
  const listTotal = lines.filter(l => !l.heldOut).reduce((s, l) => s + l.qty * l.listRate, 0);
  /* The safety net for any layout this reader does not know: if what was read
     does not add up to the sheet's own total, say so before anything is built on it. */
  if (!internal && statedTotal !== null && Math.abs(statedTotal - listTotal) > 1) {
    warnings.unshift(`The sheet's own total is ${Math.round(statedTotal).toLocaleString('en-IN')}, but the lines read add up to ${Math.round(listTotal).toLocaleString('en-IN')} (a difference of ${Math.round(listTotal - statedTotal).toLocaleString('en-IN')}). Check the sheet before going on.`);
  }
  return {
    sheetName,
    lines,
    sections,
    statedTotal,
    listTotal,
    internal,
    warnings,
  };
}

/** The sheet to import: the client sheet, never a costing sheet. */
export function pickClientSheet(parsed: ParsedSheet[]): ParsedSheet | null {
  const usable = parsed.filter(p => p.lines.length && !p.internal);
  return (
    usable.find(p => /client/i.test(p.sheetName)) ||
    usable.sort((a, b) => b.lines.length - a.lines.length)[0] ||
    null
  );
}

/**
 * Per-unit costs from the workbook's costing sheet, keyed to the client sheet.
 *
 * The two sheets carry the same rows under the same room headings, so a line
 * is matched by room, name and occurrence — the same key its id is built from.
 * A line whose costing row is missing simply has no cost; nothing is guessed.
 */
export function internalCostsFor(client: ParsedSheet, costing: ParsedSheet | null | undefined): Record<string, number> {
  if (!costing || !costing.internal) return {};
  const byId = new Map(costing.lines.map(l => [l.id, l]));
  const out: Record<string, number> = {};
  client.lines.forEach(l => {
    const c = byId.get(l.id);
    const cost = c?.unitCost ?? (c ? c.listRate : undefined);
    if (cost !== undefined && cost > 0) out[l.id] = cost;
  });
  return out;
}

// ---------------------------------------------------------------------------
// The signed side
// ---------------------------------------------------------------------------

/** The signed tier as lines, priced by the app's own pricing. Zero-qty lines are not scope. */
export function signedLinesFrom(boq: any[], bankMap: Map<string, Item>): SignedLine[] {
  return (boq || [])
    .map((b: any, i: number) => ({ b, r: resolveBoqLine(b, bankMap), i }))
    .filter(({ b, r }) => isBillable(b) && r.qty > 0)
    .map(({ b, r, i }) => ({
      lineId: String(b.id || `line-${i}`),
      bankId: b.bankId,
      room: r.room,
      name: r.name,
      unit: normaliseUnit(r.unit),
      qty: r.qty,
      rate: r.rate,
      amount: r.total,
    }));
}

// ---------------------------------------------------------------------------
// Proposals the studio confirms
// ---------------------------------------------------------------------------

/**
 * The commercial basis the signed version was priced on.
 *
 * For every item whose name and quantity are unchanged, signed rate ÷ sheet
 * rate is the discount the project carries. The most common ratio wins, so a
 * line or two genuinely re-priced cannot move it.
 */
export function detectBasis(signed: SignedLine[], imported: ImportedLine[]): { basis: number; support: number; exact: number } {
  const counts = new Map<number, number>();
  let exact = 0;
  imported.forEach(im => {
    if (!(im.listRate > 0) || im.heldOut) return;
    const s = signed.find(x => nameSimilarity(x.name, im.name) >= 0.97 && Math.abs(x.qty - im.qty) < 0.001);
    if (!s || !(s.rate > 0)) return;
    const ratio = Math.round((s.rate / im.listRate) * 200) / 200; // nearest 0.5%
    if (ratio < 0.5 || ratio > 1.0001) return;
    if (ratio === 1) exact++;
    counts.set(ratio, (counts.get(ratio) || 0) + 1);
  });
  let basis = 1;
  let support = 0;
  counts.forEach((n, r) => {
    if (n > support || (n === support && r < basis)) {
      basis = r;
      support = n;
    }
  });
  // A single coincidence is not a basis.
  if (support < 2) return { basis: 1, support, exact };
  return { basis, support, exact };
}

/** Title case a sheet heading for the client: "DAUGHTERS BEDROOM 1" -> "Daughter's bedroom 1". */
export function roomDisplayName(section: string): string {
  const s = displayName(section)
    .replace(/\bdaughters\b/i, m => (m[0] === 'D' ? "Daughter's" : "daughter's"))
    .replace(/\bparents\b/i, m => (m[0] === 'P' ? "Parents'" : "parents'"))
    .replace(/\bsons\b/i, m => (m[0] === 'S' ? "Son's" : "son's"))
    .replace(/\bstudyroom\b/i, 'study room');
  return s;
}

/**
 * Which revised room each signed room became.
 *
 * Same name is certain. Otherwise rooms are compared by what is in them — two
 * rooms sharing most of their item names are probably one room renamed. Two
 * bedrooms with identical furniture cannot be told apart that way, and are
 * left for the studio rather than guessed.
 */
export function proposeRoomMap(signed: SignedLine[], imported: ImportedLine[], sections: string[]): {
  map: Record<string, string | null>;
  uncertain: string[];
} {
  const signedRooms = Array.from(new Set(signed.map(s => s.room)));
  const map: Record<string, string | null> = {};
  const taken = new Set<string>();
  const uncertain: string[] = [];

  sections.forEach(sec => {
    const hit = signedRooms.find(r => !taken.has(r) && norm(r) === norm(sec));
    if (hit) {
      map[sec] = hit;
      taken.add(hit);
    }
  });

  const contentScore = (sec: string, room: string) => {
    const a = imported.filter(l => l.section === sec).map(l => l.name);
    const b = signed.filter(l => l.room === room).map(l => l.name);
    if (!a.length || !b.length) return 0;
    let hits = 0;
    // A looser likeness than line pairing: "Headboard" and "Headboard with foaming"
    // are evidence the room is the same room, even if they are not the same line.
    a.forEach(n => { if (b.some(m => nameSimilarity(n, m) >= 0.5)) hits++; });
    return Math.min(1, hits / Math.min(a.length, b.length));
  };

  sections.forEach(sec => {
    if (sec in map) return;
    const scored = signedRooms
      .filter(r => !taken.has(r))
      .map(r => ({ r, s: contentScore(sec, r) }))
      .sort((x, y) => y.s - x.s);
    const best = scored[0];
    if (!best || best.s < 0.34) {
      map[sec] = null;
      return;
    }
    const tied = scored.filter(x => Math.abs(x.s - best.s) < 0.05);
    map[sec] = best.r;
    taken.add(best.r);
    if (tied.length > 1) uncertain.push(sec);
  });

  return { map, uncertain };
}

export function defaultSettings(signed: SignedLine[], parsed: ParsedSheet): RevisionSettings {
  const { basis } = detectBasis(signed, parsed.lines);
  const { map } = proposeRoomMap(signed, parsed.lines, parsed.sections);
  const roomNames: Record<string, string> = {};
  parsed.sections.forEach(sec => {
    // Keep the app's name where the room is simply the same room.
    roomNames[sec] = map[sec] && norm(map[sec]!) === norm(sec) ? map[sec]! : roomDisplayName(sec);
  });
  return {
    basisDetected: basis,
    basisForNew: basis,
    roomMap: map,
    roomNames,
    sectionCompare: [],
    manualPairs: {},
    unpaired: [],
    descriptions: {},
    roomNotes: {},
    summary: '',
  };
}

// ---------------------------------------------------------------------------
// Computing
// ---------------------------------------------------------------------------

const EMPTY_COUNTS = (): Record<LineKind, number> => ({ same: 0, qty: 0, rate: 0, qty_rate: 0, redesign: 0, new: 0, removed: 0 });

/**
 * The basis for one paired line.
 *
 * The line keeps the basis it was signed on: a line signed at list rate (debris
 * removal on Unique Vistas) stays at list rate. When the sheet's rate has
 * genuinely moved the old basis cannot be read off it, and the project's basis
 * applies.
 */
function lineBasis(signedRate: number, listRate: number, projectBasis: number): number {
  if (listRate > 0 && near(signedRate, listRate)) return 1;
  return projectBasis;
}

export function computeRevision(signed: SignedLine[], imported: ImportedLine[], settings: RevisionSettings): RevisionResult {
  const B = settings.basisForNew || 1;
  const priced = imported.filter(isPricedLine);
  const zeroImported = imported.filter(l => !isPricedLine(l));
  const zeroIds = new Set(zeroImported.map(l => l.id));
  const counts = EMPTY_COUNTS();
  const bridge: Bridge = { new: 0, qty: 0, redesign: 0, section: 0, removed: 0, rate: 0 };

  const sections = Array.from(new Set(imported.map(l => l.section)));
  const usedSigned = new Set<string>();
  const rooms: RevisionRoom[] = [];
  const signedById = new Map(signed.map(s => [s.lineId, s]));

  const make = (kind: LineKind, s: SignedLine | undefined, im: ImportedLine | undefined, basis: number, score: number, manual = false): RevisionLine => {
    const qty2 = im ? im.qty : 0;
    const rate2 = im ? im.listRate * basis : 0;
    return { id: im?.id || `removed:${s!.lineId}`, kind, signed: s, imported: im, qty2, rate2, amount2: qty2 * rate2, basis, score, manual };
  };

  const classify = (s: SignedLine, im: ImportedLine, score: number, manual: boolean): RevisionLine => {
    if (!isPricedLine(im)) return make('removed', s, undefined, 0, score, manual);
    const basis = lineBasis(s.rate, im.listRate, B);
    // Renamed means the names differ, however the pair was made.
    const renamed = nameSimilarity(s.name, im.name) < 0.8;
    const line = make('same', s, im, basis, score, manual);
    const qtyMoved = Math.abs(s.qty - im.qty) > 0.0001;
    const rateMoved = !near(line.rate2, s.rate, 0.0005);
    line.kind = renamed ? 'redesign' : qtyMoved && rateMoved ? 'qty_rate' : qtyMoved ? 'qty' : rateMoved ? 'rate' : 'same';
    return line;
  };

  sections.forEach(sec => {
    const signedRoom = settings.roomMap[sec] ?? null;
    const name = settings.roomNames[sec] || roomDisplayName(sec);
    const inRoom = imported.filter(l => l.section === sec);
    const room: RevisionRoom = {
      name,
      section: sec,
      signedRoom,
      compareAsSection: !!signedRoom && settings.sectionCompare.includes(signedRoom),
      before: 0,
      after: 0,
      lines: [],
      note: settings.roomNotes[name] || undefined,
    };
    const pool = signedRoom ? signed.filter(s => s.room === signedRoom && !usedSigned.has(s.lineId)) : [];

    if (room.compareAsSection) {
      pool.forEach(s => usedSigned.add(s.lineId));
      room.before = pool.reduce((t, s) => t + s.amount, 0);
      room.lines = inRoom.filter(isPricedLine).map(im => make('new', undefined, im, B, 0));
      room.after = room.lines.reduce((t, l) => t + l.amount2, 0);
      bridge.section += room.after - room.before;
      rooms.push(room);
      return;
    }

    const lines: RevisionLine[] = [];
    const open = new Set(inRoom.map(l => l.id));

    // 1. The studio's own pairings.
    inRoom.forEach(im => {
      const sid = settings.manualPairs[im.id];
      const s = sid ? signedById.get(sid) : undefined;
      if (!s || usedSigned.has(s.lineId)) return;
      usedSigned.add(s.lineId);
      open.delete(im.id);
      lines.push(classify(s, im, 1, true));
    });

    // 2. Best name match inside the room, strongest first.
    const unpaired = new Set(settings.unpaired);
    const candidates: { im: ImportedLine; s: SignedLine; score: number }[] = [];
    inRoom.forEach(im => {
      if (!open.has(im.id) || unpaired.has(im.id)) return;
      pool.forEach(s => {
        if (usedSigned.has(s.lineId)) return;
        let score = nameSimilarity(s.name, im.name);
        if (score >= 0.5 && s.unit === im.unit) score += 0.01;
        if (score >= 0.5) candidates.push({ im, s, score });
      });
    });
    candidates.sort((a, b) => b.score - a.score || Math.abs(a.s.qty - a.im.qty) - Math.abs(b.s.qty - b.im.qty));
    candidates.forEach(({ im, s, score }) => {
      if (!open.has(im.id) || usedSigned.has(s.lineId)) return;
      usedSigned.add(s.lineId);
      open.delete(im.id);
      lines.push(classify(s, im, Math.min(1, score), false));
    });

    // 3. What is left is new (at a quantity) or listed at zero.
    inRoom.forEach(im => {
      if (!open.has(im.id) || zeroIds.has(im.id)) return;
      lines.push(make('new', undefined, im, B, 0));
    });

    // 4. Signed lines in this room nobody claimed: removed.
    pool.forEach(s => {
      if (usedSigned.has(s.lineId)) return;
      usedSigned.add(s.lineId);
      lines.push(make('removed', s, undefined, 0, 0));
    });

    // Keep the sheet's order, removed lines at the end of their room.
    const order = new Map(inRoom.map((l, i) => [l.id, i]));
    lines.sort((a, b) => (order.get(a.imported?.id || '') ?? 1e6) - (order.get(b.imported?.id || '') ?? 1e6));
    room.lines = lines;
    room.before = lines.reduce((t, l) => t + (l.signed?.amount || 0), 0);
    room.after = lines.reduce((t, l) => t + l.amount2, 0);
    rooms.push(room);
  });

  // Signed rooms no revised room claimed: every line in them is removed.
  const orphanRooms = Array.from(new Set(signed.filter(s => !usedSigned.has(s.lineId)).map(s => s.room)));
  orphanRooms.forEach(roomName => {
    const lines = signed
      .filter(s => s.room === roomName && !usedSigned.has(s.lineId))
      .map(s => {
        usedSigned.add(s.lineId);
        return make('removed', s, undefined, 0, 0);
      });
    rooms.push({
      name: roomName,
      section: null,
      signedRoom: roomName,
      compareAsSection: false,
      before: lines.reduce((t, l) => t + (l.signed?.amount || 0), 0),
      after: 0,
      lines,
      note: settings.roomNotes[roomName] || undefined,
    });
  });

  // The bridge, line by line. Quantity effect at the old rate, rate effect at
  // the new quantity — together exactly new − old for every same-item line.
  rooms.forEach(room => {
    if (room.compareAsSection) return;
    room.lines.forEach(l => {
      counts[l.kind]++;
      const a1 = l.signed?.amount || 0;
      switch (l.kind) {
        case 'new': bridge.new += l.amount2; break;
        case 'removed': bridge.removed -= a1; break;
        case 'redesign': bridge.redesign += l.amount2 - a1; break;
        default: {
          const s = l.signed!;
          bridge.qty += (l.qty2 - s.qty) * s.rate;
          bridge.rate += (l.rate2 - s.rate) * l.qty2;
        }
      }
    });
  });
  const v1Total = signed.reduce((t, s) => t + s.amount, 0);
  const v2Total = rooms.reduce((t, r) => t + r.after, 0);
  const change = v2Total - v1Total;
  const sum = bridge.new + bridge.qty + bridge.redesign + bridge.section + bridge.removed + bridge.rate;
  return {
    basis: B,
    v1Total,
    v2Total,
    change,
    bridge,
    bridgeGap: sum - change,
    rooms,
    zeroImported,
    counts,
  };
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface ReadinessItem {
  level: 'block' | 'warn' | 'ok';
  text: string;
}

export function revisionReadiness(result: RevisionResult, parsed: { internal?: boolean } | null, settings: RevisionSettings, uncertainRooms: string[] = [], source?: ScopeRevisionRecord['source']): ReadinessItem[] {
  const out: ReadinessItem[] = [];
  if (source && source.statedTotal != null && Math.abs(source.statedTotal - source.listTotal) > 1) {
    out.push({ level: 'warn', text: `The Excel's own total is ₹${Math.round(source.statedTotal).toLocaleString('en-IN')}, but its lines add up to ₹${Math.round(source.listTotal).toLocaleString('en-IN')}. Check the sheet for lines its total leaves out.` });
  }
  if (parsed?.internal) out.push({ level: 'block', text: 'The imported sheet has cost and margin columns. Import the client sheet.' });
  if (Math.abs(result.bridgeGap) > 0.01) {
    out.push({ level: 'block', text: `The six parts do not add up to the change (off by ${result.bridgeGap.toFixed(2)}).` });
  } else {
    out.push({ level: 'ok', text: 'The six parts add up to the change exactly.' });
  }
  uncertainRooms.forEach(sec => {
    if (!settings.roomMap[sec]) return;
    out.push({ level: 'warn', text: `“${settings.roomNames[sec] || sec}” was matched by contents that look like another room's. Check it.` });
  });
  const lowScore = result.rooms.flatMap(r => r.lines).filter(l => l.kind === 'redesign' && !l.manual && l.score < 0.6);
  if (lowScore.length) out.push({ level: 'warn', text: `${lowScore.length} redesign pair${lowScore.length === 1 ? ' was' : 's were'} matched on a weak name likeness. Check them in step 4.` });
  if (result.zeroImported.length) out.push({ level: 'ok', text: `${result.zeroImported.length} revised line${result.zeroImported.length === 1 ? ' is' : 's are'} at zero, removed, to be confirmed or as-actuals in the sheet, and will be listed as not in scope.` });
  if (!settings.summary.trim()) out.push({ level: 'warn', text: 'There is no summary for the client yet (step 6).' });
  return out;
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

/**
 * The revised BOQ, as tier lines, from a computed revision.
 *
 * A line that is the same item keeps its identity — same line id, same bank
 * item — so the next comparison sees one line that moved, not one removed and
 * one added. Its frozen materials and labour are scaled by the rate change;
 * `calculateSellPrice` is linear in cost, so the sell rate lands exactly on the
 * revised rate and the line keeps its margin.
 *
 * New and redesigned lines are not in the bank. They carry their rate as their
 * own materials figure at 0% margin, which every pricing path in the app reads
 * the same way (and `selectedRate` for the ones that prefer it).
 */
export function buildRevisedBoq(
  result: RevisionResult,
  signedBoq: any[],
  bankMap: Map<string, Item>,
  settings: RevisionSettings,
  revisionNumber: number,
  at = Date.now(),
  /** Per-unit studio costs by imported id, for margin on lines outside the bank. */
  internalCosts: Record<string, number> = {},
): any[] {
  const byId = new Map((signedBoq || []).map((b: any, i: number) => [String(b.id || `line-${i}`), b]));
  const out: any[] = [];
  let seq = 0;
  const adHoc = (im: ImportedLine, room: string, rate: number, qty: number, from?: SignedLine) => {
    seq++;
    /* With the studio's cost known, the line carries it and the margin that
       reaches exactly this rate — cost × (1 + m/100) is the sell rate — so
       margin reports are real. Without it, the rate stands in as its own cost
       at 0%, which every pricing path reads the same way. */
    const cost = internalCosts[im.id];
    const hasCost = cost !== undefined && cost > 0 && rate > 0;
    const line: any = {
      id: `sr${revisionNumber}-${seq}-${norm(im.name).replace(/ /g, '-').slice(0, 24)}`,
      bankId: `SR${revisionNumber}_${seq}`,
      name: displayName(im.name),
      unit: im.unit,
      qty,
      roomId: room,
      baseRate: hasCost ? cost : rate,
      labor: 0,
      marginOverride: hasCost ? (rate / cost - 1) * 100 : 0,
      selectedRate: rate,
      rateSnapshotAt: at,
    };
    const desc = settings.descriptions[im.id] || im.description;
    if (desc && desc.trim()) line.description = desc.trim();
    if (im.note) line.commercialNote = im.note;
    if (from) line.revisedFrom = from.lineId;
    if (/as\s*actuals?/i.test(im.name)) line.boqStatus = 'as_actuals';
    return line;
  };

  result.rooms.forEach(room => {
    room.lines.forEach(l => {
      if (l.kind === 'removed') return;
      const im = l.imported!;
      if (l.kind === 'new' || l.kind === 'redesign' || room.compareAsSection) {
        out.push(adHoc(im, room.name, l.rate2, l.qty2, l.signed));
        return;
      }
      const s = l.signed!;
      const original = byId.get(s.lineId);
      if (!original) {
        out.push(adHoc(im, room.name, l.rate2, l.qty2, s));
        return;
      }
      const k = s.rate > 0 ? l.rate2 / s.rate : 1;
      const item = bankMap.get(original.bankId);
      const line: any = { ...original, qty: l.qty2, roomId: room.name, rateSnapshotAt: at };
      if (item) {
        const materials = original.baseRate !== undefined ? original.baseRate : item.materials;
        const labour = original.labor !== undefined ? original.labor : item.labor;
        line.baseRate = materials * k;
        line.labor = labour * k;
        line.marginOverride = original.marginOverride ?? item.margin;
      } else if ((original.materials ?? original.baseRate ?? 0) > 0 || (original.labor ?? 0) > 0) {
        if (original.materials !== undefined) line.materials = original.materials * k;
        if (original.baseRate !== undefined) line.baseRate = original.baseRate * k;
        if (original.labor !== undefined) line.labor = original.labor * k;
        if (original.selectedRate) line.selectedRate = l.rate2;
      } else {
        line.selectedRate = l.rate2;
      }
      const desc = settings.descriptions[im.id] || im.description;
      if (desc && desc.trim()) line.description = desc.trim();
      out.push(line);
    });
  });

  // Revised lines at zero: held in the BOQ, shown as not in scope.
  result.zeroImported.forEach(im => {
    const room = settings.roomNames[im.section] || roomDisplayName(im.section);
    const line = adHoc(im, room, im.listRate * (settings.basisForNew || 1), 0);
    if (im.heldOut) line.heldReason = HELD_REASON[im.heldOut];
    out.push(line);
  });

  return out;
}
