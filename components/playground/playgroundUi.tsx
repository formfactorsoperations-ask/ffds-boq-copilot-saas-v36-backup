import React, { useEffect, useRef, useState } from 'react';
import type { BoqItem, Item, PieceDraw, PricingRules, Room } from '../../types';
import { formatINR } from '../../lib/utils';
import { resolveBoqLine, isAsActuals } from '../../lib/boqPricing';
import { drawOf, pieceSize, pieceItemOf, type PieceSize } from '../../lib/playground/pieces';
import { lineAmount, lineCost, withPlanQty } from '../../lib/playground/pricing';
import { markupOf, specWordsOf, DEFAULT_MARGIN_FLOOR } from '../../lib/playground/issues';
import type { MeasureContext } from '../../lib/playground/rooms';
import type { MaterialSpecsBank } from '../../lib/materialSpecs';
import { staleParts, shadeHexOf } from '../../lib/lineSpecs';
import { artOfSpecs } from './pieceArt';
import { basisOfUnit, readSize, formatSize } from '../../lib/boqSize';
import { ftin } from '../../lib/playground/geometry';
import type { Fresh } from '../../lib/playground/motion';

/*
  The small parts the BOQ Playground screen is built from (the approved
  mockup's helpers): money as the mockup writes it, the margin ring, the
  drag-sideways number, and one reading of every line.
*/

/** ₹13,28,700 */
export const inr = (n: number) => formatINR(n);
/** ₹1.32 L above a lakh, else in full. */
export const lakh = (n: number) => (Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : inr(n));

/** The margin colour against the floor: rose under it, amber within 5 points, emerald above. */
export const marginTone = (m: number, floor = DEFAULT_MARGIN_FLOOR) =>
  m < floor ? 'text-rose-600' : m < floor + 5 ? 'text-amber-600' : 'text-emerald-600';

/** The margin ring beside the client's figure. */
export function Ring({ margin, floor = DEFAULT_MARGIN_FLOOR }: { margin: number; floor?: number }) {
  const C = 2 * Math.PI * 15;
  const p = Math.max(0, Math.min(1, margin / 40));
  const col = margin < floor ? '#e11d48' : margin < floor + 4 ? '#d97706' : '#059669';
  return (
    <svg viewBox="0 0 38 38" className="w-9 h-9 -rotate-90 shrink-0" aria-hidden focusable="false">
      <circle cx="19" cy="19" r="15" fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle cx="19" cy="19" r="15" fill="none" stroke={col} strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - p)} />
    </svg>
  );
}

/**
 * A number changed by dragging sideways (the mockup's scrub), or by typing:
 * a click without a drag opens it for typing, and the arrow keys step it.
 * The BOQ is written once, when the drag ends.
 */
export function Scrub({ label, value, format, onCommit, step = 1, min = 0, max = Infinity, pxPerStep = 4, disabled, variant = 'tile', className = '' }: {
  label: string;
  value: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  pxPerStep?: number;
  disabled?: boolean;
  /** tile: label above the value (the inspector); cell: the value alone, right-aligned (the Sheet). */
  variant?: 'tile' | 'cell';
  className?: string;
}) {
  const [live, setLive] = useState<number | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const start = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const snap = (v: number) => Math.round(v / step) * step;
  useEffect(() => { setLive(null); }, [value]);

  const down = (e: React.PointerEvent) => {
    if (disabled || typing != null) return;
    start.current = { x: e.clientX, v: value, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (!s.moved && Math.abs(dx) < 3) return;
    s.moved = true;
    const k = e.shiftKey ? 0.2 : 1;
    setLive(clamp(snap(s.v + (dx / pxPerStep) * step * k)));
  };
  const up = () => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (!s.moved) { setTyping(String(Math.round(value * 100) / 100)); return; }
    if (live != null && live !== value) onCommit(live);
    else setLive(null);
  };
  const key = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1;
      onCommit(clamp(snap(value + dir * step * (e.shiftKey ? 10 : 1))));
    }
  };
  const done = () => {
    const v = Number(String(typing).replace(/[₹,%\s]/g, ''));
    setTyping(null);
    if (Number.isFinite(v) && v !== value) onCommit(clamp(v));
  };

  const shown = format(live ?? value);
  if (typing != null) {
    return (
      <input autoFocus aria-label={label} inputMode="decimal" value={typing}
        onChange={e => setTyping(e.target.value)} onBlur={done}
        onKeyDown={e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') setTyping(null); }}
        className={variant === 'tile'
          ? `w-full rounded-xl border border-[#3D52A0] bg-white px-2.5 py-1.5 text-sm font-black text-slate-800 tabular-nums outline-none ring-2 ring-[#3D52A0]/20 ${className}`
          : `w-full rounded-lg border border-[#3D52A0] bg-white px-1.5 py-1 text-sm font-bold text-right tabular-nums outline-none ${className}`} />
    );
  }
  const common = {
    type: 'button' as const,
    disabled,
    onPointerDown: down, onPointerMove: move, onPointerUp: up, onKeyDown: key,
    title: disabled ? undefined : 'Drag sideways to change, or click to type',
    'aria-label': `${label}: ${shown}`,
  };
  if (variant === 'cell') {
    return (
      <button {...common} className={`w-full text-right rounded-lg px-1.5 py-1 text-sm font-bold text-slate-800 tabular-nums select-none touch-none ${disabled ? '' : 'cursor-ew-resize hover:bg-[#3D52A0]/10'} ${className}`}>
        {shown}
      </button>
    );
  }
  return (
    <button {...common} className={`group w-full text-left rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 select-none touch-none ${disabled ? '' : 'cursor-ew-resize hover:border-[#3D52A0]/40'} ${className}`}>
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-[#3D52A0]">{label}{disabled ? '' : ' ↔'}</span>
      <span className="block text-sm font-black text-slate-800 tabular-nums">{shown}</span>
    </button>
  );
}

/* ─────────────────────────── one reading of a line ─────────────────────────── */

export interface LineModel {
  line: BoqItem;
  item: Item | undefined;
  name: string;
  unit: string;
  cat: string;
  words: string;
  room: string;
  draw: PieceDraw | null;
  size: PieceSize | null;
  qty: number;
  /** Cost per unit: materials and labour. */
  cost: number;
  labor: number;
  markup: number;
  /** The unit rate the client is charged. */
  rate: number;
  /** The line's amount under the version's rules (rounded up for a Playground version). */
  amount: number;
  /** Margin on the price, %. */
  margin: number;
  billable: boolean;
  /** Bought by the client, or paid to the vendor at actuals: shown apart, not in the price. */
  separate: boolean;
  /** Parts on an older version than the bank's (only on an option that may take updates). */
  stale: string[];
  /** How it is drawn, from its materials. */
  art: { fill?: string; base?: string; top?: string };
  /** The item it is drawn as: its bank item, or the line's own name for a line not in the bank. */
  pieceItem?: Item;
}

/** The Material specs bank, and whether this option is offered newer versions. */
export interface SpecContext { bank: MaterialSpecsBank; offer: boolean }

const SEPARATE = new Set(['client_procured']);

export function lineModel(line: BoqItem, bankMap: Map<string, Item>, rules: PricingRules | null, rooms: Room[], measure?: MeasureContext, spec?: SpecContext): LineModel {
  const item = bankMap.get(line.bankId);
  const b = withPlanQty(line, bankMap, { rooms, measure });
  const r = resolveBoqLine(b, bankMap);
  /* A line of its own (imported, not in the bank) is drawn from its own name. */
  const pieceItem = pieceItemOf(line, bankMap);
  const draw = drawOf(pieceItem);
  const qty = Number(b.qty) || 0;
  const unitCost = qty ? lineCost(b, bankMap) / qty : lineCost({ ...b, qty: 1 }, bankMap);
  const labor = Number(b.labor ?? item?.labor ?? 0) || 0;
  const separate = SEPARATE.has(String(b.boqStatus)) || isAsActuals(b, r.name);
  return {
    line: b,
    item,
    name: r.name,
    unit: r.unit || item?.unit || '',
    cat: item?.cat || '',
    words: specWordsOf(b, item),
    room: r.room,
    draw,
    size: draw ? pieceSize(b, pieceItem, draw) : null,
    pieceItem,
    qty,
    cost: unitCost,
    labor,
    markup: markupOf(b, item),
    rate: r.rate,
    amount: lineAmount(b, bankMap, { rules, rooms, measure }),
    margin: r.rate > 0 ? ((r.rate - unitCost) / r.rate) * 100 : 0,
    billable: r.billable,
    separate,
    stale: spec?.offer ? staleParts(spec.bank, b) : [],
    art: spec ? artOfSpecs(b.materialSpecs, spec.bank.materials, s => shadeHexOf(spec.bank, s)) : {},
  };
}

/** The line with a new cost per unit: materials move, labour stays. */
export const withCost = (m: LineModel, cost: number): BoqItem =>
  ({ ...m.line, baseRate: Math.max(0, Math.round((cost - m.labor) * 100) / 100) });
/** The line at a markup on cost. */
export const withMarkup = (m: LineModel, markup: number): BoqItem =>
  ({ ...m.line, marginOverride: Math.round(markup * 100) / 100 });
/** The line at a unit rate: the markup that gives it. */
export const withRate = (m: LineModel, rate: number): BoqItem =>
  (m.cost > 0 ? withMarkup(m, (rate / m.cost - 1) * 100) : m.line);

/** Cost-weighted average markup of some lines. */
export function avgMarkup(ms: LineModel[]): number {
  let c = 0, s = 0;
  ms.forEach(m => { const w = m.cost * m.qty; c += w; s += w * m.markup; });
  return c ? s / c : 0;
}
/** The lines moved so their average markup is `to`, keeping their spread. */
export function setAvgMarkup(ms: LineModel[], to: number): BoqItem[] {
  const a = avgMarkup(ms);
  return ms.map(m => withMarkup(m, Math.max(0, Math.min(400, a > 0.01 ? (m.markup * to) / a : to))));
}

/**
 * A sized line's width and height in words, for the Sheet's quantity: "5′ × 6′"
 * (an area), "8′ long" (a run). Lines measured from the plan or shared into
 * rooms, and counts, have none.
 */
export function sizeWords(m: Pick<LineModel, 'line' | 'unit' | 'draw' | 'size'>): string {
  const l = m.line;
  if (l.civil || l.byRoom) return '';
  const basis = basisOfUnit(m.unit);
  if (basis !== 'area' && basis !== 'length') return '';
  if (m.draw && m.size) return basis === 'area' ? `${ftin(m.size.w)} × ${ftin(m.size.h)}` : `${ftin(m.size.w)} long`;
  const s = readSize({ ...l, unit: m.unit });
  if (!s) return '';
  const dims = [s.a, s.b].filter((d): d is number => !!d && d > 0);
  if (!dims.length) return '';
  if (s.unit === 'ft') return basis === 'length' && dims.length === 1 ? `${ftin(dims[0])} long` : dims.map(ftin).join(' × ');
  return formatSize(s);
}

/* ───────────────────────────── what an edit just did (PR 7) ───────────────────────────── */

/**
 * The last edit's motion (lib/playground/motion): lines printing in, pieces
 * dropping, a room glowing, the price change floating up. `key` changes with
 * every edit, so the glow and the tag play again.
 */
export interface FreshState extends Fresh { key: number; tag: { id: string; text: string; up: boolean } | null }
export const FreshContext = React.createContext<FreshState | null>(null);

/** ' pg-print' on a line the last edit added, for the Live BOQ, the Sheet and the Rooms. */
export function usePrinted(): (id: string) => string {
  const fresh = React.useContext(FreshContext);
  return (id: string) => (fresh?.flash.has(id) ? ' pg-print' : '');
}
