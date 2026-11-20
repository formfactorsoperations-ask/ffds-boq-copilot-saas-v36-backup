/**
 * BOQ Playground PR R — what changed between two versions, and by how much.
 *
 * Each line of the newer version is set against the same line (by id) in the
 * older one and tagged, as in the mockup:
 *
 *   NEW          added, or brought back into the price
 *   REMOVED      taken out, or out of the price now
 *   REDESIGNED   another item in its place
 *   SIZE         a quantity or size change (a room's share included)
 *   RATE         a rate, finish, cost or markup change
 *   SIZE + RATE  both
 *   SPEC         only the client's words changed
 *   MOVED        only its place on the plan: not a scope change
 *
 * The change in price is split into five parts (new, size and quantity, rate
 * and finish, redesigned, removed) worked out on the same rounded amounts the
 * client sees, so they always add up exactly to the difference.
 *
 * Pure.
 */
import type { BoqItem, Item } from '../../types';
import { resolveBoqLine } from '../boqPricing';
import { lineAmount, withPlanQty, sharesOf, type LineAmountOptions } from './pricing';
import { ftin, round2 } from './geometry';
import { markupOf } from './issues';
import { unitCostOf } from './excel';

export type ChangeTag = 'NEW' | 'REMOVED' | 'SIZE' | 'RATE' | 'SIZE + RATE' | 'REDESIGNED' | 'SPEC' | 'MOVED';

export interface LineChange {
  tag: ChangeTag;
  /** The change in the client's amount. */
  d: number;
  /** The client's words changed. */
  spec: boolean;
  /** Moved on the plan. */
  moved: boolean;
  /** The line as it was; absent for a new line. */
  was?: BoqItem;
  /** Not in the newer version at all. */
  gone?: boolean;
}

export interface ChangeParts { new: number; qty: number; rate: number; redesign: number; removed: number }

export interface Changes {
  /** By line id: every line that changed (moves included). */
  out: Map<string, LineChange>;
  parts: ChangeParts;
  /** The older version's price, and the newer one's. */
  before: number;
  after: number;
}

/** A tag's chip tone and drawing colour (the mockup's). */
export const TAG_TONE: Record<ChangeTag, 'good' | 'bad' | 'warn' | 'brand' | 'slate'> = {
  NEW: 'good', REMOVED: 'bad', SIZE: 'warn', RATE: 'warn', 'SIZE + RATE': 'warn', REDESIGNED: 'brand', SPEC: 'slate', MOVED: 'slate',
};
export const TAG_COLOUR: Record<ChangeTag, string> = {
  NEW: '#059669', REMOVED: '#e11d48', SIZE: '#d97706', RATE: '#d97706', 'SIZE + RATE': '#d97706', REDESIGNED: '#3D52A0', SPEC: '#64748b', MOVED: '#94a3b8',
};

/** The parts, in words and order, as the Changes panel lists them. */
export const PART_LABELS: [keyof ChangeParts, string][] = [
  ['new', 'New'], ['qty', 'Size and quantity'], ['rate', 'Rate and finish'], ['redesign', 'Redesigned'], ['removed', 'Removed'],
];

/** What decides a line's rate: carried from the older line to price "the new quantity at the old rate". */
const RATE_KEYS = ['baseRate', 'labor', 'marginOverride', 'materials', 'selectedRate'] as const;

const live = (l: BoqItem) => l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted';

/** The amount a line adds to the price: billable and not at actuals, else nothing. */
function amountOf(l: BoqItem, bankMap: Map<string, Item>, opts: LineAmountOptions): number {
  const b = withPlanQty(l, bankMap, opts);
  const r = resolveBoqLine(b, bankMap);
  if (!r.billable || r.asActuals) return 0;
  return lineAmount(b, bankMap, opts);
}
const priced = (l: BoqItem, bankMap: Map<string, Item>) => { const r = resolveBoqLine(l, bankMap); return r.billable && !r.asActuals; };
const nameOf = (l: BoqItem, bankMap: Map<string, Item>) => resolveBoqLine(l, bankMap).name;

/**
 * The changes from `base` to `cur`. Each side is priced with its own options
 * (its rooms, and the walls its pieces cover), so a line's share of painting
 * moves when a wardrobe does.
 */
export function changesBetween(
  base: BoqItem[], cur: BoqItem[], bankMap: Map<string, Item>,
  opts: { base: LineAmountOptions; cur: LineAmountOptions },
): Changes {
  const parts: ChangeParts = { new: 0, qty: 0, rate: 0, redesign: 0, removed: 0 };
  const out = new Map<string, LineChange>();
  const B = (base || []).filter(live);
  const C = (cur || []).filter(live);
  const bm = new Map(B.map(l => [l.id, l]));
  const A1 = (l: BoqItem) => amountOf(l, bankMap, opts.base);
  const A2 = (l: BoqItem) => amountOf(l, bankMap, opts.cur);
  let before = 0, after = 0;
  B.forEach(l => { before += A1(l); });
  C.forEach(l => {
    const a2 = A2(l);
    after += a2;
    const b = bm.get(l.id);
    if (!b) {
      parts.new += a2;
      out.set(l.id, { tag: 'NEW', d: a2, spec: false, moved: false });
      return;
    }
    const a1 = A1(b);
    let tag: ChangeTag | null = null;
    const p1 = priced(b, bankMap), p2 = priced(l, bankMap);
    if (b.bankId !== l.bankId && nameOf(b, bankMap) !== nameOf(l, bankMap)) {
      tag = 'REDESIGNED';
      parts.redesign += a2 - a1;
    } else if (p1 !== p2) {
      tag = p2 ? 'NEW' : 'REMOVED';
      if (p2) parts.new += a2 - a1; else parts.removed += a2 - a1;
    } else if (p2) {
      // The new quantity at the old rate: the size part; the rest is the rate part. They add up to a2 − a1.
      const hybrid: BoqItem = { ...l };
      RATE_KEYS.forEach(k => { if ((b as any)[k] === undefined) delete (hybrid as any)[k]; else (hybrid as any)[k] = (b as any)[k]; });
      const aH = A2(hybrid);
      const dq = aH - a1, dr = a2 - aH;
      parts.qty += dq;
      parts.rate += dr;
      const q1 = resolveBoqLine(withPlanQty(b, bankMap, opts.base), bankMap).qty, q2 = resolveBoqLine(withPlanQty(l, bankMap, opts.cur), bankMap).qty;
      const r1 = resolveBoqLine(b, bankMap).rate, r2 = resolveBoqLine(l, bankMap).rate;
      const sized = Math.abs(dq) >= 0.5 || Math.abs(q2 - q1) > 1e-6 || JSON.stringify(b.byRoom || null) !== JSON.stringify(l.byRoom || null);
      const rated = Math.abs(dr) >= 0.5 || Math.abs(r2 - r1) > 0.005;
      tag = sized && rated ? 'SIZE + RATE' : sized ? 'SIZE' : rated ? 'RATE' : null;
    }
    const spec = (b.specs || '') !== (l.specs || '') || JSON.stringify(b.materialSpecs || null) !== JSON.stringify(l.materialSpecs || null);
    const moved = !!(b.place && l.place && (Math.abs(b.place.x - l.place.x) > 0.01 || Math.abs(b.place.y - l.place.y) > 0.01 || (b.place.rot || 0) !== (l.place.rot || 0)));
    if (tag || spec || moved) out.set(l.id, { tag: tag || (spec ? 'SPEC' : 'MOVED'), d: a2 - a1, spec, moved, was: b });
  });
  const ids = new Set(C.map(l => l.id));
  B.forEach(b => {
    if (ids.has(b.id)) return;
    const a1 = A1(b);
    parts.removed -= a1;
    out.set(b.id, { tag: 'REMOVED', d: -a1, spec: false, moved: false, was: b, gone: true });
  });
  return { out, parts, before, after };
}

/** The scope changes: every change but a move. */
export const scopeChanges = (c: Changes) => [...c.out.entries()].filter(([, e]) => e.tag !== 'MOVED');

/** What a room's lines changed by, for the Rooms lens: a removed line counts in the room it was in. */
export function roomDelta(c: Changes, room: string, cur: BoqItem[]): number {
  const byId = new Map(cur.map(l => [l.id, l]));
  let s = 0;
  c.out.forEach((e, id) => { const l = e.gone ? e.was : byId.get(id); if (l && (l.roomId || 'Whole flat') === room) s += e.d; });
  return s;
}

/** ₹48.7k, ₹1.2L: a tag on the plan. */
export function shortInr(n: number): string {
  const a = Math.abs(n);
  return a >= 1e5 ? `${(a / 1e5).toFixed(2).replace(/\.?0+$/, '')}L` : a >= 1e3 ? `${(a / 1e3).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(a));
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const pct = (n: number) => `${round2(n).toFixed(1)}%`;

/** A line's size or quantity in words: "6′ × 7′ = 42 sq ft", else "42 sq ft". */
function dims(l: BoqItem, bankMap: Map<string, Item>, opts: LineAmountOptions): string {
  const b = withPlanQty(l, bankMap, opts);
  const r = resolveBoqLine(b, bankMap);
  const q = `${round2(r.qty).toLocaleString('en-IN')} ${r.unit || ''}`.trim();
  return Number(l.calcLength) > 0 && Number(l.calcWidth) > 0 ? `${ftin(Number(l.calcLength))} × ${ftin(Number(l.calcWidth))} = ${q}` : q;
}

const STATUS_WORDS: Record<string, string> = {
  client_procured: 'Bought by you', as_actuals: 'At actuals', excluded: 'Excluded', provisional_sum: 'Provisional sum', on_hold: 'On hold',
  approved_variation: 'Approved variation', pending_finalisation: 'Pending', included_ffds_scope: 'Included',
};
const statusWords = (l: BoqItem) => STATUS_WORDS[String(l.boqStatus || 'included_ffds_scope')] || 'Included';

/**
 * Why a line changed, in a few words, as the Changes panel says it: "Was
 * Sliding wardrobe", "6′ × 7′ = 42 sq ft → 8′ × 7′ = 56 sq ft", "Finish
 * designer laminate → natural veneer", "Markup 28.0% → 25.0%". `materialName`
 * names a material from its id (the Material specs bank), for the finish.
 */
export function changeWhy(
  e: LineChange, l: BoqItem, bankMap: Map<string, Item>,
  opts: { base: LineAmountOptions; cur: LineAmountOptions; materialName?: (id: string) => string | undefined; studio?: boolean },
): string {
  if (e.gone) return 'Taken out';
  const w = e.was;
  if (!w) return 'Added';
  const bits: string[] = [];
  if (e.tag === 'REDESIGNED') bits.push(`Was ${nameOf(w, bankMap)}`);
  const s1 = w.byRoom ? sharesOf(withPlanQty(w, bankMap, opts.base), opts.base) : null;
  const s2 = l.byRoom ? sharesOf(withPlanQty(l, bankMap, opts.cur), opts.cur) : null;
  const unit = resolveBoqLine(l, bankMap).unit || '';
  if (s1 && s2) {
    const rd = [...new Set([...s2.keys(), ...s1.keys()])].map(r => [r, (s2.get(r) || 0) - (s1.get(r) || 0)] as [string, number]).filter(([, d]) => Math.abs(d) > 0.01);
    if (rd.length) bits.push(rd.slice(0, 3).map(([r, d]) => `${r} ${d > 0 ? '+' : '−'}${round2(Math.abs(d))} ${unit}`).join(', ') + (rd.length > 3 ? ` and ${rd.length - 3} more rooms` : ''));
  } else {
    const d1 = dims(w, bankMap, opts.base), d2 = dims(l, bankMap, opts.cur);
    if (d1 !== d2) bits.push(`${d1} → ${d2}`);
  }
  const fin = (x: BoqItem) => {
    const ms = x.materialSpecs || {};
    const part = Object.keys(ms).find(k => /finish|outer|shutter|laminate|veneer/i.test(k)) || '';
    return part ? ms[part]?.id : undefined;
  };
  const f1 = fin(w), f2 = fin(l);
  const finishChanged = !!(f1 && f2 && f1 !== f2);
  if (finishChanged) {
    const n = (id: string) => String(opts.materialName?.(id) || id).split(',')[0].toLowerCase();
    bits.push(`Finish ${n(f1!)} → ${n(f2!)}`);
  }
  if (opts.studio !== false) {
    const item = bankMap.get(l.bankId);
    const m1 = markupOf(w, bankMap.get(w.bankId)), m2 = markupOf(l, item);
    if (Math.abs(m1 - m2) > 0.01) bits.push(`Markup ${pct(m1)} → ${pct(m2)}`);
    const c1 = unitCostOf(w, bankMap), c2 = unitCostOf(l, bankMap);
    if (Math.abs(c1 - c2) > 0.005 && e.tag !== 'REDESIGNED') bits.push(`Cost ${inr(c1)} → ${inr(c2)}`);
  }
  if (priced(w, bankMap) !== priced(l, bankMap)) bits.push(`${statusWords(w)} → ${statusWords(l)}`);
  if (e.spec && !finishChanged) bits.push('Client words changed');
  if (e.moved && !bits.length) bits.push('Moved, same price');
  return bits.join(' · ') || (opts.studio === false ? 'Rate revised' : 'Changed');
}
