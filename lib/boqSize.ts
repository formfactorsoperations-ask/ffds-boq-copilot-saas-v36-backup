import { BoqItem } from '../types';

/**
 * BOQ SIZE — what a piece measures, and the quantity that follows from it.
 *
 * A wardrobe is quoted per sq ft, a loft per sq ft, a counter per running
 * foot. The studio knows the piece as "7 ft by 8 ft" or "2100 × 2400" off the
 * drawing, and until now had to multiply that out by hand and type the answer
 * into Qty — in a different unit, in a different view, every time it changed.
 *
 * So a line can carry its size, and the quantity is worked out from it in the
 * item's own unit:
 *
 *   area   (sq ft, sqm)   width × height × nos
 *   length (rft, rmt)     length × nos
 *   count  (nos, set)     nos — the size is kept as a record of the piece
 *   lump   (lumpsum)      quantity stays as it is; the size is a record
 *
 * Stored on the existing fields so every older line still reads:
 *   calcLength = first dimension, calcWidth = second, calcMultiplier = nos,
 *   sizeUnit   = the unit the dimensions were typed in.
 *
 * Lines written before `sizeUnit` existed typed their dimensions in the item's
 * own unit (feet for sq ft, metres for sqm), so that is what a missing unit
 * means — their quantities do not move.
 */

export type SizeUnit = 'ft' | 'in' | 'mm' | 'cm' | 'm';
export type QtyBasis = 'area' | 'length' | 'count' | 'lump';

export const SIZE_UNITS: SizeUnit[] = ['ft', 'in', 'mm', 'cm', 'm'];

/** Feet per one of each unit. */
const FT_PER: Record<SizeUnit, number> = {
  ft: 1,
  in: 1 / 12,
  mm: 1 / 304.8,
  cm: 1 / 30.48,
  m: 1 / 0.3048,
};

export function convertLength(value: number, from: SizeUnit, to: SizeUnit): number {
  return (value * FT_PER[from]) / FT_PER[to];
}

const norm = (unit?: string) => (unit || '').toLowerCase().replace(/[\s._-]/g, '');

/** How an item's unit is measured, or null when the unit says nothing. */
export function basisOfUnit(unit?: string): QtyBasis | null {
  const u = norm(unit);
  if (!u) return null;
  if (/^(lumpsum|lump|ls|job|lot)$/.test(u)) return 'lump';
  if (/^(sqft|sft|sqfeet|sqfoot|sqf|ft2|ft²|sqm|sqmt|sqmtr|sqmeter|sqmetre|m2|m²|sqyd)$/.test(u) || u.startsWith('sq')) return 'area';
  if (/^(rft|rf|runningft|runningfeet|rmt|rm|runningm|runningmeter|runningmetre|lm|lmt|ft|feet|m|mtr|meter|metre)$/.test(u)) return 'length';
  if (/^(nos|no|number|numbers|pcs|pc|piece|pieces|unit|units|set|sets|each|ea|pair|pairs|point|points|pts|pt)$/.test(u)) return 'count';
  return null;
}

/** The linear unit an item's quantity is counted in: metres for sqm/rmt, else feet. */
export function linearUnitOf(unit?: string): SizeUnit {
  const u = norm(unit);
  return /^(sqm|sqmt|sqmtr|sqmeter|sqmetre|m2|m²|rmt|rm|runningm|runningmeter|runningmetre|lm|lmt|m|mtr|meter|metre)$/.test(u) ? 'm' : 'ft';
}

export interface LineSize {
  /** Width, or length for a running item. */
  a?: number;
  /** Height (or depth). Unused for running and counted items. */
  b?: number;
  /** How many identical pieces. Defaults to 1. */
  nos?: number;
  unit: SizeUnit;
}

const pos = (n: unknown): number | undefined => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : undefined;
};

/** The size a line carries, or null when it has none. */
export function readSize(line: Partial<BoqItem> & { unit?: string }): LineSize | null {
  const a = pos(line.calcLength);
  const b = pos(line.calcWidth);
  const nos = pos(line.calcMultiplier);
  if (!a && !b) return null;
  const unit = (line.sizeUnit && SIZE_UNITS.includes(line.sizeUnit as SizeUnit))
    ? (line.sizeUnit as SizeUnit)
    : linearUnitOf(line.unit);
  return { a, b, nos, unit };
}

export type SizeResult =
  | { ok: true; qty: number; basis: QtyBasis; working: string }
  | { ok: false; reason: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => String(round2(n));

/** The quantity a size gives, in the item's own unit. */
export function qtyFromSize(size: LineSize | null, itemUnit?: string): SizeResult {
  if (!size || (!pos(size.a) && !pos(size.b))) return { ok: false, reason: 'Enter a size' };
  const nos = pos(size.nos) ?? 1;
  const target = linearUnitOf(itemUnit);
  const a = pos(size.a);
  const b = pos(size.b);
  const unitLabel = itemUnit || (target === 'm' ? 'sqm' : 'sq ft');
  const times = nos !== 1 ? ` × ${fmt(nos)}` : '';

  let basis = basisOfUnit(itemUnit);
  if (!basis) basis = a && b ? 'area' : 'length';

  if (basis === 'area') {
    if (!a || !b) return { ok: false, reason: 'Enter width and height' };
    const qty = round2(convertLength(a, size.unit, target) * convertLength(b, size.unit, target) * nos);
    return { ok: true, qty, basis, working: `${fmt(a)} × ${fmt(b)} ${size.unit}${times} = ${fmt(qty)} ${unitLabel}` };
  }
  if (basis === 'length') {
    const run = a || b!;
    const qty = round2(convertLength(run, size.unit, target) * nos);
    return { ok: true, qty, basis, working: `${fmt(run)} ${size.unit}${times} = ${fmt(qty)} ${itemUnit || target}` };
  }
  if (basis === 'count') {
    return { ok: true, qty: round2(nos), basis, working: `${fmt(nos)} ${itemUnit || 'nos'}` };
  }
  return { ok: false, reason: 'Lump-sum item: the size is noted, the quantity stays as it is' };
}

/** The fields to write when a line's size changes: the size, and the quantity it gives. */
export function sizeUpdates(size: LineSize, itemUnit?: string): Partial<BoqItem> {
  const updates: Partial<BoqItem> = {
    calcLength: pos(size.a) ?? 0,
    calcWidth: pos(size.b) ?? 0,
    calcMultiplier: pos(size.nos) ?? 1,
    sizeUnit: size.unit,
  };
  const r = qtyFromSize(size, itemUnit);
  if (r.ok) updates.qty = r.qty;
  return updates;
}

/** Clearing the size leaves the quantity alone. */
export const CLEAR_SIZE: Partial<BoqItem> = { calcLength: 0, calcWidth: 0, calcMultiplier: 1, sizeUnit: undefined };

/** True when the quantity on the line is not the one its size gives — it was typed over. */
export function qtyOverridden(line: Partial<BoqItem> & { unit?: string }): boolean {
  const r = qtyFromSize(readSize(line), line.unit);
  return r.ok && Math.abs(r.qty - (Number(line.qty) || 0)) > 0.01;
}

/** "7 × 8 ft", "2100 × 2400 mm × 2", "12 ft". */
export function formatSize(size: LineSize | null): string {
  if (!size) return '';
  const dims = [pos(size.a), pos(size.b)].filter((d): d is number => d !== undefined).map(fmt);
  if (!dims.length) return '';
  const nos = pos(size.nos);
  return `${dims.join(' × ')} ${size.unit}${nos && nos !== 1 ? ` × ${fmt(nos)}` : ''}`;
}

const UNIT_WORDS: Record<string, SizeUnit> = {
  ft: 'ft', feet: 'ft', foot: 'ft', "'": 'ft', '′': 'ft',
  in: 'in', inch: 'in', inches: 'in', '"': 'in', '″': 'in',
  mm: 'mm', cm: 'cm', m: 'm', mtr: 'm', meter: 'm', metre: 'm', meters: 'm', metres: 'm',
};

/**
 * Reads a size typed as text, the way it is written on a drawing or a site
 * note: `7 x 8`, `7x8 ft`, `2100 × 2400 mm`, `7'6" x 8'`, `2.1m x 600mm`,
 * `7 x 8 x 2` (two pieces), `12 ft` (a run). Returns null when it cannot.
 *
 * A dimension written with ' or " is in feet and inches whatever the default.
 * A plain number takes the unit written after the last dimension, else the
 * default. Mixed units are all converted to the first unit named.
 */
export function parseSize(text: string, defaultUnit: SizeUnit = 'ft'): LineSize | null {
  const src = (text || '').trim().toLowerCase().replace(/\s+by\s+/g, ' x ').replace(/[×*]/g, ' x ');
  if (!src) return null;

  // A trailing piece count: "x 2 nos", "(2 nos)", "2 pcs" at the end.
  let nos: number | undefined;
  let body = src.replace(/[()]/g, ' ');
  const nosMatch = body.match(/(?:\bx\s*)?(\d+(?:\.\d+)?)\s*(nos|no|pcs|pc|pieces|piece|units|unit|sets|set)\.?\s*$/);
  if (nosMatch) {
    nos = Number(nosMatch[1]);
    body = body.slice(0, nosMatch.index).trim();
  }

  const parts = body.split(/\s*x\s*/).map(p => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > 3) return null;

  interface Dim { value: number; unit?: SizeUnit }
  const dims: Dim[] = [];
  for (const raw of parts) {
    // Feet and inches: 7'6", 7' 6, 7', 6", 7ft 6in
    const fi = raw.match(/^(\d+(?:\.\d+)?)\s*(?:'|′|ft|feet|foot)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|″|in|inch|inches)?)?$/);
    if (fi) { dims.push({ value: Number(fi[1]) + (fi[2] ? Number(fi[2]) / 12 : 0), unit: 'ft' }); continue; }
    const inch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:"|″|in|inch|inches)$/);
    if (inch) { dims.push({ value: Number(inch[1]), unit: 'in' }); continue; }
    const plain = raw.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/);
    if (!plain) return null;
    const word = plain[2];
    if (word && !UNIT_WORDS[word]) return null;
    dims.push({ value: Number(plain[1]), unit: word ? UNIT_WORDS[word] : undefined });
  }

  // A third plain number is a piece count, as in L × W × M.
  if (dims.length === 3) {
    if (nos !== undefined || dims[2].unit) return null;
    nos = dims[2].value;
    dims.pop();
  }

  const named = dims.map(d => d.unit).filter((u): u is SizeUnit => !!u);
  const trailing = dims[dims.length - 1].unit;
  const fallback = trailing || defaultUnit;
  const unit: SizeUnit = named[0] || fallback;
  const values = dims.map(d => convertLength(d.value, d.unit || fallback, unit));
  if (values.some(v => !(v > 0))) return null;

  return { a: round2Precise(values[0]), b: values[1] !== undefined ? round2Precise(values[1]) : undefined, nos, unit };
}

/** Keeps a converted dimension readable without losing the inches in 7'6". */
const round2Precise = (n: number) => Math.round(n * 10000) / 10000;
