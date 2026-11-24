import React, { useEffect, useState } from 'react';
import { Ruler, Trash2 } from 'lucide-react';
import { turnShape, type Turn } from '../../lib/drawingReview';
import { QUICK_SCALES, cleanScale, measureLabel, scaleFromKnown, type Span } from '../../lib/measure';
import { cx } from './parts';

/*
  MEASURE on the drawing screen (Design Desk 2.0, Phase 3A; rules in
  lib/measure.ts). With the tool in hand, a drag between two points draws a
  line and says how long it is, from the drawing's scale. The scale is set
  once by hand: typed from the title block, or worked out from a dimension
  written on the drawing. Measurements are for looking; they are not saved
  and are not notes.
*/

export interface Measure extends Span { id: number; page: number; /** Its length on paper, in millimetres. */ paper: number }

/** One page's measured lines, drawn over it: the line, its two ends and its length. */
export const MeasureLayer: React.FC<{ list: Measure[]; turn: Turn; scale: number | null }> = ({ list, turn, scale }) => {
  if (!list.length) return null;
  const view = list.map((m) => ({ m, s: turnShape({ t: 'arrow', x: m.x, y: m.y, x2: m.x2, y2: m.y2 }, turn, 'view') as { x: number; y: number; x2: number; y2: number } }));
  return (
    <div className="pointer-events-none absolute inset-0 z-[3]" aria-label="Measurements">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {view.map(({ m, s }) => <line key={m.id} x1={s.x * 100} y1={s.y * 100} x2={s.x2 * 100} y2={s.y2 * 100} stroke="#3D52A0" strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
      </svg>
      {view.map(({ m, s }) => (
        <React.Fragment key={m.id}>
          {[[s.x, s.y], [s.x2, s.y2]].map(([x, y], i) => <span key={i} className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#3D52A0] shadow" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />)}
          <span className="hud-panel-in absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#3D52A0] px-2.5 py-1 text-xs font-bold text-white shadow-lg"
            style={{ left: `${((s.x + s.x2) / 2) * 100}%`, top: `${((s.y + s.y2) / 2) * 100}%` }}>{measureLabel(m.paper, scale)}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

interface BarProps {
  scale: number | null;
  /** The line drawn last, to set the scale from. */
  last: Measure | null;
  count: number;
  onScale: (n: number | null) => void;
  onClear: () => void;
}

/** The strip above the tool bar while Measure is in hand: the scale, and what the last line reads. */
export const MeasureBar: React.FC<BarProps> = ({ scale, last, count, onScale, onClear }) => {
  const [typed, setTyped] = useState(scale ? String(scale) : '');
  useEffect(() => { setTyped(scale ? String(scale) : ''); }, [scale]);
  const [known, setKnown] = useState('');
  const [asking, setAsking] = useState(false);
  const commit = () => { const n = typed.trim() ? cleanScale(typed) : null; if (n !== scale && (n || !typed.trim())) onScale(n); else setTyped(scale ? String(scale) : ''); };
  const fromKnown = () => {
    const n = last ? scaleFromKnown(last.paper, Number(known)) : null;
    if (n) { onScale(n); setAsking(false); setKnown(''); }
  };
  const chip = 'min-h-[36px] rounded-full px-2.5 text-xs font-bold transition-colors';
  return (
    <div className="hud-panel-in pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-lg" role="group" aria-label="Measure">
      <span className="inline-flex items-center gap-1.5 font-bold text-[#3D52A0]"><Ruler size={16} aria-hidden />Measure</span>
      <label className="inline-flex items-center gap-1.5 font-bold">Scale 1 :
        <input value={typed} onChange={(e) => setTyped(e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          inputMode="decimal" placeholder="?" aria-label="The drawing's scale, 1 to" className="h-9 w-16 rounded-lg border border-slate-300 px-2 text-center text-sm font-bold outline-none focus:border-[#3D52A0]" />
      </label>
      <span className="flex flex-wrap gap-1" role="group" aria-label="Usual scales">
        {QUICK_SCALES.map((n) => <button key={n} type="button" onClick={() => onScale(n)} aria-pressed={scale === n} className={cx(chip, scale === n ? 'bg-[#3D52A0] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}>1:{n}</button>)}
      </span>
      {asking && last ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <label className="inline-flex items-center gap-1.5 font-bold">The last line is really
            <input autoFocus value={known} onChange={(e) => setKnown(e.target.value.replace(/[^0-9.]/g, '').slice(0, 7))} onKeyDown={(e) => { if (e.key === 'Enter') fromKnown(); if (e.key === 'Escape') { e.stopPropagation(); setAsking(false); } }}
              inputMode="decimal" placeholder="2400" aria-label="The real length of the last line, in millimetres" className="h-9 w-20 rounded-lg border border-slate-300 px-2 text-center text-sm font-bold outline-none focus:border-[#3D52A0]" /> mm
          </label>
          <button type="button" onClick={fromKnown} disabled={!(Number(known) > 0)} className={cx(chip, 'bg-[#3D52A0] text-white disabled:opacity-40')}>Set the scale</button>
          <button type="button" onClick={() => setAsking(false)} className={cx(chip, 'text-slate-600 hover:bg-slate-100')}>Cancel</button>
        </span>
      ) : (
        <>
          <span className="min-w-0 text-slate-600" role="status">
            {last ? <b className="text-slate-800">{measureLabel(last.paper, scale)}</b> : scale ? 'Drag between two points on the drawing.' : 'Type the scale from the title block, or drag along a dimension you know.'}
          </span>
          {last && <button type="button" onClick={() => setAsking(true)} className={cx(chip, 'text-[#3D52A0] hover:bg-slate-100')} title="Draw along a dimension written on the drawing, then type what it says">Set the scale from this line</button>}
          {count > 0 && <button type="button" onClick={onClear} aria-label="Clear the measurements" title="Clear the measurements" className={cx(chip, 'inline-flex items-center gap-1 text-slate-600 hover:bg-slate-100')}><Trash2 size={14} aria-hidden />Clear</button>}
        </>
      )}
    </div>
  );
};
