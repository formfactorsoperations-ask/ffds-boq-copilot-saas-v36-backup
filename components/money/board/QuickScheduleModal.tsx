import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Plus, Minus, Lock, PenTool, HardHat, Trash2, SlidersHorizontal, Repeat, Infinity as Always, MousePointerClick, TrendingDown, Equal } from '@/lib/lucide-shim';
import { Button, Chip, LABEL, INPUT } from '../../ui/kit';
import { IconTile } from '../../people/PeopleBits';
import { CountUp } from '../../ui/HudBits';
import { formatCurrency, id as newId } from '../../../lib/utils';
import type { PaymentMilestone } from '../../../types';
import type { ScheduleResult } from '../../../lib/paymentSchedule';
import { scheduleChanges, type Track } from '../../../lib/moneyBoard';
import {
  ringOf, movable, moveBoundary, nudge as nudgeRing, partnerOf, splitStage, removeStage, reshape, drawnWidths, milestonesFromRings, kindOf,
  STAGE_LIBRARY, RING_MIN, RING_MIN_DRAWN, type RingSeg, type Shape,
} from '../../../lib/quickSchedule';
import { KIND_ICON } from './TrackColumn';
import type { StudioStages } from './EditMilestonesModal';
import '../../projectHeader/projectHeader.css';
import './moneyBoardStyles';

/*
  Quick schedule (DESIGN.md → "Money motion", "Quick schedule").

  Each track is a ring of its milestones, so it always adds up to 100%. The
  studio chooses instead of typing: drag a handle between two stages (it snaps
  to 5s; pull the pointer out past the ring and it moves four times finer),
  tap a stage for − / + in the middle, add a stage by splitting one, or start
  from the studio default, front-loaded or even. A small stage is drawn wider
  than its share, hatched, so it can still be grabbed; its number is exact.
  Paid and invoiced milestones are locked in grey. Approve saves through the
  same path as Edit milestones; Fine-tune first opens the draft there.
*/

const money = (v: number) => formatCurrency(Math.round(v));
const lakh = (v: number) => `₹${(v / 1e5).toFixed(2)}L`;
const cleared = (m: PaymentMilestone) => m.status === 'paid' || m.status === 'invoiced';
const ALPHA = [1, 0.8, 0.62, 0.47, 0.34, 0.24, 0.17];
const C = 160, RO = 140, RI = 92, RM = (RO + RI) / 2, FINE = RO + 42;
const pt = (p: number, r: number) => { const a = p / 100 * Math.PI * 2 - Math.PI / 2; return [C + Math.cos(a) * r, C + Math.sin(a) * r]; };
const arc = (p0: number, p1: number, ro: number, ri: number) => {
  const g = 0.45, a = p0 + g, b = Math.max(a + 0.01, p1 - g), big = b - a > 50 ? 1 : 0;
  const [x0, y0] = pt(a, ro), [x1, y1] = pt(b, ro), [x2, y2] = pt(b, ri), [x3, y3] = pt(a, ri);
  return `M${x0} ${y0} A${ro} ${ro} 0 ${big} 1 ${x1} ${y1} L${x2} ${y2} A${ri} ${ri} 0 ${big} 0 ${x3} ${y3} Z`;
};
const cumOf = (vals: number[]) => vals.reduce<number[]>((acc, v) => [...acc, acc[acc.length - 1] + v], [0]);
const pctLabel = (v: number) => `${Math.round(v * 10) / 10}%`;

/* Eases every share to its new value on the same curve, so the ring adds up to 100% all the way through. */
function useTween(segs: RingSeg[], instant: boolean) {
  const [shown, setShown] = useState<Record<string, number>>(() => Object.fromEntries(segs.map(s => [s.id, s.pct])));
  const from = useRef(shown); from.current = shown;
  const key = segs.map(s => `${s.id}:${s.pct}`).join('|');
  useEffect(() => {
    const target = Object.fromEntries(segs.map(s => [s.id, s.pct]));
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (instant || still || typeof requestAnimationFrame === 'undefined') { setShown(target); return; }
    const start = { ...from.current }, t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 480), e = 1 - Math.pow(1 - t, 3);
      setShown(Object.fromEntries(segs.map(s => [s.id, (start[s.id] ?? 0) + (s.pct - (start[s.id] ?? 0)) * e])));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, instant]); // eslint-disable-line react-hooks/exhaustive-deps
  return segs.map(s => shown[s.id] ?? s.pct);
}

const where = (svg: SVGSVGElement, e: { clientX: number; clientY: number }) => {
  const r = svg.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * 320 - C, y = (e.clientY - r.top) / r.height * 320 - C;
  return { p: ((Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 100, d: Math.hypot(x, y), bx: e.clientX - r.left, by: e.clientY - r.top };
};

type Drag = { i: number; last: number; acc: number; start: number; rate: number };

const Ring: React.FC<{
  t: Track; segs: RingSeg[]; owed: (id: string) => number; sel: string | null; setSel: (id: string | null) => void;
  onMove: (i: number, at: number) => void; onNudge: (i: number, d: number, partner?: number) => void;
}> = ({ t, segs, owed, sel, setSel, onMove, onNudge }) => {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; fine: boolean; snap: boolean } | null>(null);
  const shown = useTween(segs, drag !== null);
  const drawn = cumOf(drawnWidths(shown));
  const begin = (i: number, e: React.PointerEvent) => {
    e.preventDefault();
    const w = drawnWidths(segs.map(s => s.pct)), c = cumOf(segs.map(s => s.pct));
    /* The drag works in shares, not in drawn angle: sweeping across both slices as drawn covers both shares exactly. */
    setDrag({ i, last: where(svg.current!, e).p, acc: 0, start: c[i], rate: (segs[i - 1].pct + segs[i].pct) / (w[i - 1] + w[i]) });
    setSel(null);
  };
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const a = where(svg.current!, e);
      let dp = a.p - drag.last; if (dp > 50) dp -= 100; if (dp < -50) dp += 100;
      const fine = a.d > FINE;
      const acc = drag.acc + dp * drag.rate * (fine ? 0.25 : 1);
      let v = drag.start + acc;
      const five = Math.round(v / 5) * 5, snap = !fine && Math.abs(v - five) < 1.1;
      v = snap ? five : Math.round(v);
      setDrag({ ...drag, last: a.p, acc });
      setTip({ x: a.bx, y: a.by, fine, snap });
      onMove(drag.i, v);
    };
    const up = () => { setDrag(null); setTip(null); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag, onMove]);

  const selI = segs.findIndex(s => s.id === sel), selSeg = segs[selI];
  const pair = drag ? [segs[drag.i - 1], segs[drag.i]] : null;
  const total = segs.reduce((s, x) => s + owed(x.id), 0);
  const SelIcon = selSeg ? (selSeg.locked ? Lock : KIND_ICON[kindOf(selSeg.name, t)]) : t === 'design' ? PenTool : HardHat;
  let unlockedK = -1;
  return (
    <div className="relative w-full max-w-[300px] mx-auto">
      <svg ref={svg} viewBox="0 0 320 320" className="w-full aspect-square select-none touch-none overflow-visible" role="group" aria-label={`${t === 'design' ? 'Design' : 'Execution'} ring`}>
        <defs><pattern id={`qs-hatch-${t}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,0.5)" strokeWidth="2" /></pattern></defs>
        <circle cx={C} cy={C} r={RM} fill="none" stroke="#F1F5F9" strokeWidth={RO - RI + 4} />
        {segs.map((s, i) => {
          if (!s.locked) unlockedK++;
          const p0 = drawn[i], p1 = drawn[i + 1], mid = (p0 + p1) / 2, on = s.id === sel, tiny = s.pct < RING_MIN_DRAWN;
          const live = !!drag && (i === drag.i - 1 || i === drag.i);
          const [dx, dy] = pt(mid, 7).map(v => v - C);
          const a = ALPHA[unlockedK % ALPHA.length], dark = s.locked || a > 0.5 || on;
          const fill = s.locked ? 'rgba(100,116,139,0.55)' : on ? '#3D52A0' : `rgba(61,82,160,${a})`;
          const [lx, ly] = pt(mid, RM), I = s.locked ? Lock : KIND_ICON[kindOf(s.name, t)];
          return (
            <g key={s.id} onClick={() => setSel(on ? null : s.id)} className="cursor-pointer" aria-label={`${s.name} ${pctLabel(s.pct)}`}
              style={{ transform: on ? `translate(${dx}px, ${dy}px)` : 'none', transition: 'transform 260ms cubic-bezier(0.22,1,0.36,1)' }}>
              <path d={arc(p0, p1, on || live ? RO + 5 : RO, RI)} fill={fill} style={{ transition: 'fill 200ms', filter: on ? 'drop-shadow(0 6px 10px rgba(61,82,160,0.35))' : 'none' }} />
              {tiny && <path d={arc(p0, p1, on || live ? RO + 5 : RO, RI)} fill={`url(#qs-hatch-${t})`} pointerEvents="none" />}
              <g transform={`translate(${lx - 8} ${ly - (tiny ? 7 : 17)})`} pointerEvents="none">
                {!tiny && <I width={16} height={16} color={dark ? '#fff' : '#3D52A0'} strokeWidth={2.2} />}
                <text x={8} y={tiny ? 12 : 31} textAnchor="middle" fontSize={tiny ? 12 : 13} fontWeight="900" fill={dark ? '#fff' : '#3D52A0'}>{Math.round(s.pct)}%</text>
              </g>
            </g>
          );
        })}
        {drawn.slice(1, -1).map((b, j) => {
          if (!movable(segs, j + 1)) return null;
          const [hx, hy] = pt(b, RO + 14), [ix, iy] = pt(b, RI - 2), on = drag?.i === j + 1;
          return (
            <g key={segs[j].id + segs[j + 1].id} tabIndex={0} role="slider" aria-label={`Between ${segs[j].name} and ${segs[j + 1].name}`}
              aria-valuemin={RING_MIN} aria-valuemax={100} aria-valuenow={Math.round(segs[j].pct)}
              onPointerDown={e => begin(j + 1, e)} className="outline-none"
              onKeyDown={e => { const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0; if (d) { e.preventDefault(); onNudge(j, d * (e.shiftKey ? 5 : 1), j + 1); } }}
              style={{ cursor: on ? 'grabbing' : 'grab' }}>
              <line x1={ix} y1={iy} x2={hx} y2={hy} stroke={on ? '#3D52A0' : '#CBD5E1'} strokeWidth={2} />
              <circle cx={hx} cy={hy} r={on ? 11 : 8.5} fill="#fff" stroke="#3D52A0" strokeWidth={on ? 3 : 2.2} />
              {on && tip?.snap && <circle cx={hx} cy={hy} r={11} fill="none" stroke="#3D52A0" strokeWidth={2} className="mb-snap" />}
              <circle cx={hx} cy={hy} r={20} fill="transparent" />
            </g>
          );
        })}
        {drag && <circle cx={C} cy={C} r={FINE} fill="none" stroke={tip?.fine ? '#3D52A0' : '#E2E8F0'} strokeDasharray="3 5" strokeWidth={tip?.fine ? 1.6 : 1} pointerEvents="none" />}
      </svg>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[46%] text-center pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div key={pair ? 'drag' : sel || 'total'} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ duration: 0.16 }} className="flex flex-col items-center">
            {pair ? (
              <>
                <p className="text-[11px] font-bold text-slate-500 leading-tight truncate max-w-full">{pair[0].name}</p>
                <p className="text-xl font-black text-slate-800 tabular-nums leading-tight">{Math.round(pair[0].pct)}% <span className="text-slate-300">|</span> {Math.round(pair[1].pct)}%</p>
                <p className="text-[11px] font-bold text-slate-500 leading-tight truncate max-w-full">{pair[1].name}</p>
              </>
            ) : (
              <>
                <SelIcon className="w-5 h-5 text-[#3D52A0]" />
                <p className="mt-0.5 text-[11px] font-bold text-slate-500 leading-tight line-clamp-2">{selSeg ? selSeg.name : t === 'design' ? 'Design' : 'Execution'}</p>
                {selSeg && !selSeg.locked ? (
                  <span className="pointer-events-auto flex items-center gap-1.5">
                    <button type="button" aria-label={`Less for ${selSeg.name}`} onClick={() => onNudge(selI, -1)} className="w-7 h-7 grid place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-[#3D52A0] hover:text-white"><Minus className="w-3.5 h-3.5" /></button>
                    <motion.b key={selSeg.pct} initial={{ y: -6, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} className="text-2xl font-black text-slate-800 tabular-nums w-14">{pctLabel(selSeg.pct)}</motion.b>
                    <button type="button" aria-label={`More for ${selSeg.name}`} onClick={() => onNudge(selI, 1)} className="w-7 h-7 grid place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-[#3D52A0] hover:text-white"><Plus className="w-3.5 h-3.5" /></button>
                  </span>
                ) : (
                  <p className="text-2xl font-black text-slate-800 tabular-nums leading-tight">{selSeg ? pctLabel(selSeg.pct) : '100%'}</p>
                )}
                <p className="text-[11px] text-slate-500 tabular-nums">{selSeg?.locked ? 'Billed, locked' : lakh(selSeg ? owed(selSeg.id) : total)}</p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>{drag && tip && pair && (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ left: tip.x + 18, top: tip.y - 44 }}
          className="absolute z-20 pointer-events-none whitespace-nowrap rounded-xl bg-[#12182F] text-white px-2.5 py-1.5 text-[11px] shadow-xl">
          <b className="tabular-nums">{Math.round(pair[0].pct)}% · {Math.round(pair[1].pct)}%</b>
          <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tip.fine ? 'bg-amber-400 text-slate-900' : tip.snap ? 'bg-emerald-400 text-slate-900' : 'bg-white/15'}`}>{tip.fine ? 'Fine · 0.25×' : tip.snap ? 'Snapped' : 'Pull out for fine'}</span>
        </motion.div>)}
      </AnimatePresence>
    </div>
  );
};

const TrackPanel: React.FC<{ t: Track; segs: RingSeg[]; set: (s: RingSeg[]) => void; owed: (id: string) => number; taxable: number }> = ({ t, segs, set, owed, taxable }) => {
  const [sel, setSel] = useState<string | null>(null);
  const selI = segs.findIndex(s => s.id === sel);
  const onMove = React.useCallback((i: number, at: number) => set(moveBoundary(segs, i, at)), [segs, set]);
  const onNudge = (i: number, d: number, partner?: number) => set(nudgeRing(segs, i, d, partner ?? partnerOf(segs, i)));
  const add = (name: string) => { const id = newId(); set(splitStage(segs, name, id, selI >= 0 ? selI : undefined)); setSel(id); };
  const lib = STAGE_LIBRARY[t].filter(n => !segs.some(s => s.name.trim().toLowerCase() === n.toLowerCase()));
  const canAdd = segs.some(s => !s.locked && s.pct >= RING_MIN * 2) || !segs.some(s => !s.locked);
  let unlockedK = -1;
  return (
    <div className="rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row gap-4 items-stretch hud-panel-in">
      <div className="md:w-[300px] shrink-0">
        <p className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-1"><IconTile icon={t === 'design' ? PenTool : HardHat} size="sm" />{t === 'design' ? 'Design' : 'Execution'}<span className="text-[11px] font-semibold text-slate-500 tabular-nums">· taxable {money(taxable)}</span></p>
        {segs.length ? <Ring t={t} segs={segs} owed={owed} sel={sel} setSel={setSel} onMove={onMove} onNudge={onNudge} />
          : <div className="mx-auto my-6 w-48 h-48 rounded-full border-[22px] border-dashed border-slate-200 grid place-items-center text-xs text-slate-500 text-center px-2">Add a stage below</div>}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="grid grid-cols-[minmax(0,1fr)_100px_80px_24px] gap-2 px-2"><span className={LABEL}>Stage</span><span className={`${LABEL} text-center`}>Share</span><span className={`${LABEL} text-right`}>Client pays</span><span /></div>
        <AnimatePresence initial={false}>
          {segs.map((s, i) => {
            if (!s.locked) unlockedK++;
            const I = s.locked ? Lock : KIND_ICON[kindOf(s.name, t)], on = s.id === sel;
            return (
              <motion.div layout key={s.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                onClick={() => setSel(on ? null : s.id)}
                className={`grid grid-cols-[minmax(0,1fr)_100px_80px_24px] gap-2 items-center rounded-xl px-2 py-1.5 cursor-pointer transition-colors ${on ? 'bg-[#3D52A0]/10 ring-1 ring-[#3D52A0]/30' : 'hover:bg-slate-50'}`}>
                <span className="flex items-center gap-2 min-w-0 text-xs font-semibold text-slate-800">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.locked ? 'rgba(100,116,139,0.55)' : `rgba(61,82,160,${ALPHA[unlockedK % ALPHA.length]})` }} />
                  <I className={`w-3.5 h-3.5 shrink-0 ${s.locked ? 'text-slate-500' : 'text-[#3D52A0]'}`} /><span className="truncate">{s.name}</span>
                </span>
                {s.locked ? <span className="text-center text-xs font-bold text-slate-500 tabular-nums">{pctLabel(s.pct)}</span> : (
                  <span className="flex items-center justify-between rounded-lg bg-white border border-slate-200" onClick={e => e.stopPropagation()}>
                    <button type="button" aria-label={`Less for ${s.name}`} onClick={() => onNudge(i, -1)} className="w-7 h-7 grid place-items-center text-slate-500 hover:text-[#3D52A0]"><Minus className="w-3 h-3" /></button>
                    <b className="text-xs font-black tabular-nums" data-testid={`share-${s.name}`}>{pctLabel(s.pct)}</b>
                    <button type="button" aria-label={`More for ${s.name}`} onClick={() => onNudge(i, 1)} className="w-7 h-7 grid place-items-center text-slate-500 hover:text-[#3D52A0]"><Plus className="w-3 h-3" /></button>
                  </span>
                )}
                <b className="text-right text-xs tabular-nums text-slate-800"><CountUp value={Math.round(owed(s.id))} format={money} /></b>
                {on && !s.locked && segs.filter(x => !x.locked).length > 1
                  ? <button type="button" aria-label={`Remove ${s.name}`} onClick={e => { e.stopPropagation(); set(removeStage(segs, s.id)); setSel(null); }} className="text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  : <span />}
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div className="flex flex-wrap items-center gap-1.5 pt-2 px-2">
          <span className={LABEL}>{selI >= 0 && !segs[selI].locked ? `Split ${segs[selI].name} with` : 'Add a stage'}</span>
          {lib.map(n => (
            <motion.button key={n} layout type="button" whileTap={{ scale: 0.9 }} disabled={!canAdd} onClick={() => add(n)} aria-label={`Add ${n}`}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-[#3D52A0] hover:text-[#3D52A0] disabled:opacity-40">
              <Plus className="w-3 h-3" />{n}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const QuickScheduleModal: React.FC<{
  milestones: PaymentMilestone[];
  feeOnly: boolean;
  taxable: { design: number; execution: number };
  price: (draft: PaymentMilestone[]) => ScheduleResult;
  studio?: StudioStages | null;
  onClose: () => void;
  onApprove: (draft: PaymentMilestone[], reason: string, changes: string[]) => void;
  onFineTune: (draft: PaymentMilestone[]) => void;
}> = ({ milestones, feeOnly, taxable, price, studio, onClose, onApprove, onFineTune }) => {
  const tracks: Track[] = feeOnly ? ['design'] : ['design', 'execution'];
  const [rings, setRings] = useState<Record<Track, RingSeg[]>>(() => ({ design: ringOf(milestones, 'design', taxable.design), execution: ringOf(milestones, 'execution', taxable.execution) }));
  const [shape, setShape] = useState<Shape | null>(null);
  const [reason, setReason] = useState('');
  const subIds = useRef(0);
  const draft = useMemo(() => milestonesFromRings(feeOnly ? { design: rings.design } : rings, milestones, taxable, () => `st-${subIds.current++}`), [rings, milestones, taxable, feeOnly]);
  const priced = useMemo(() => price(draft), [draft, price]);
  const changes = useMemo(() => scheduleChanges(milestones, draft), [milestones, draft]);
  const owed = (id: string) => priced.byId[id]?.owed || 0;
  const anyBilled = milestones.some(cleared);
  const empty = tracks.some(t => !rings[t].length);
  const ok = changes.length > 0 && !empty && (!anyBilled || reason.trim().length > 2);
  const setTrack = (t: Track) => (s: RingSeg[]) => { setRings(r => ({ ...r, [t]: s })); setShape(null); };
  const apply = (s: Shape) => {
    setRings(r => ({ ...r, ...Object.fromEntries(tracks.map(t => [t, reshape(r[t], s, studio?.[t], newId)])) }));
    setShape(s);
  };
  const clientPays = draft.reduce((s, m) => s + owed(m.id), 0);
  const firstExec = rings.execution.find(s => !s.locked) || rings.execution[0];
  const beforeSite = rings.design.reduce((s, x) => s + owed(x.id), 0) + (firstExec ? owed(firstExec.id) : 0);
  const SHAPES: { id: Shape; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'studio', label: 'Studio default', icon: Repeat },
    { id: 'front', label: 'Front-loaded', icon: TrendingDown },
    { id: 'even', label: 'Even', icon: Equal },
  ];

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 phd-scrim bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Quick schedule" className="relative phd-pop w-full max-w-5xl max-h-[92vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex flex-wrap items-start gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-slate-100">
          <div className="flex-1 min-w-[240px]">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Payment schedule</p>
            <h3 className="text-xl font-bold text-slate-800 mt-0.5 flex flex-wrap items-center gap-2">Quick schedule <Chip tone="good"><Always className="w-3 h-3" />Always 100%</Chip></h3>
            <p className="sm:hidden text-xs text-slate-500 mt-1">Drag the ring, tap a stage for − / +, or pick a start.</p>
            <p className="hidden sm:flex text-xs text-slate-500 mt-1 max-w-3xl flex-wrap gap-x-3">
              <span className="inline-flex items-center gap-1"><MousePointerClick className="w-3.5 h-3.5" />Drag a handle: it snaps to 5s, and pulling outward makes it 4× finer.</span>
              <span>Tap a stage for − / + in the middle.</span>
              <span>Hatched slices are drawn wider than their share so you can grab them.</span>
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto px-4 sm:px-6 py-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={LABEL}>Start from</span>
            <div className="relative flex flex-wrap p-1 rounded-xl bg-slate-100">
              {SHAPES.map(s => (
                <button key={s.id} type="button" onClick={() => apply(s.id)} disabled={s.id === 'studio' && !studio}
                  className={`relative px-3 py-1.5 text-xs font-bold rounded-lg disabled:opacity-40 ${shape === s.id ? 'text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                  {shape === s.id && <motion.span layoutId="qs-shape" className="absolute inset-0 rounded-lg bg-[#3D52A0]" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                  <span className="relative inline-flex items-center gap-1.5"><s.icon className="w-3.5 h-3.5" />{s.label}</span>
                </button>
              ))}
            </div>
            {anyBilled && <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Lock className="w-3.5 h-3.5" />Paid and invoiced stages are locked and keep their share.</span>}
          </div>
          {tracks.map(t => <TrackPanel key={t} t={t} segs={rings[t]} set={setTrack(t)} owed={owed} taxable={taxable[t]} />)}
        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 border-t border-slate-100 space-y-2.5">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <span className="shrink-0"><span className={LABEL}>{feeOnly ? 'Client pays' : 'In hand before site work'}</span>
              <b className="block text-lg sm:text-xl font-black text-slate-800 tabular-nums"><CountUp value={Math.round(feeOnly ? clientPays : beforeSite)} format={lakh} /></b></span>
            {anyBilled && (
              <label className="basis-full sm:basis-auto sm:flex-1 sm:min-w-[220px]"><span className={LABEL}>Why is the schedule changing?</span>
                <input className={`${INPUT} mt-1`} value={reason} onChange={e => setReason(e.target.value)} placeholder="For example: client agreed more up front" /></label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 min-w-[200px] text-[11px] text-slate-500">
              {empty ? 'Each track needs at least one stage.'
                : !changes.length ? 'Drag a handle, tap a stage or pick a starting split to change the schedule.'
                  : anyBilled && reason.trim().length < 3 ? 'Add a reason to approve.' : `Looks right? Approve it: ${draft.length} milestones, client pays ${money(clientPays)}.`}
            </p>
            <span className="ml-auto flex flex-wrap justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button variant="secondary" size="sm" icon={SlidersHorizontal} disabled={empty} onClick={() => onFineTune(draft)}>Fine-tune first</Button>
              <Button variant="primary" size="sm" icon={Check} className="pp-press" disabled={!ok} onClick={() => onApprove(draft, reason.trim(), changes)}>Approve as payment schedule</Button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
