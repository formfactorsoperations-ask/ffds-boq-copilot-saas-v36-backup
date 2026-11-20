import React, { useMemo, useRef, useState } from 'react';
import { PenLine, X, Check, Sparkles } from 'lucide-react';
import { Button, Segmented, LABEL } from '../ui/kit';
import { ftin } from '../../lib/playground/geometry';
import {
  tidySketch, sketchName, bigEnough, SKETCH_KINDS, MIN_SKETCH_FT, type SketchRoom, type TidyResult,
} from '../../lib/playground/sketch';

/*
  Sketch a rough plan (BOQ Playground PR 5, the approved mockup's dialog).

  No plan yet: the designer drags rough boxes on a 1 ft grid, names each from
  the room kinds, types the carpet area from the brief, and presses Tidy. Tidy
  lines up edges that nearly meet, removes overlaps, scales the sketch to the
  carpet area and rounds sizes to 3″. "Your sketch" and "Tidied plan" switch
  between the two; Use as the plan puts the tidied rooms under the BOQ.
*/

const BRAND = '#3D52A0';

export default function SketchModal({ project, initial, carpet: carpet0, onUse, onClose }: {
  /** The project's name, for the kicker. */
  project: string;
  /** Boxes to start from: the project's rooms on its plan, or none. */
  initial: SketchRoom[];
  /** The carpet area from the brief, sq ft. */
  carpet: number;
  onUse: (t: TidyResult) => void;
  onClose: () => void;
}) {
  const [rooms, setRooms] = useState<SketchRoom[]>(initial);
  const [carpet, setCarpet] = useState<number>(Math.round(carpet0) || 0);
  const [carpetText, setCarpetText] = useState<string>(String(Math.round(carpet0) || ''));
  const [tidy, setTidy] = useState<TidyResult | null>(null);
  const [show, setShow] = useState<'before' | 'after'>('before');
  const [pick, setPick] = useState<string | null>(null);
  const [say, setSay] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nid = useRef(initial.length);

  const after = show === 'after' && !!tidy;
  const shown = after ? tidy!.rooms : rooms;
  /* The grid: 40 × 30 ft, or larger when the rooms need it. */
  const W = Math.max(40, Math.ceil(Math.max(0, ...shown.map(r => r.x + r.w))) + 2);
  const H = Math.max(30, Math.ceil(Math.max(0, ...shown.map(r => r.y + r.h))) + 2);
  const pend = pick ? rooms.find(r => r.id === pick) : undefined;

  const grid = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let i = 0; i <= W; i++) out.push(<line key={`x${i}`} x1={i} y1={0} x2={i} y2={H} stroke={i % 5 ? '#eef1f6' : '#dfe4ec'} strokeWidth={0.05} />);
    for (let j = 0; j <= H; j++) out.push(<line key={`y${j}`} x1={0} y1={j} x2={W} y2={j} stroke={j % 5 ? '#eef1f6' : '#dfe4ec'} strokeWidth={0.05} />);
    return out;
  }, [W, H]);

  const ptOf = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    return [-1 + ((e.clientX - r.left) / r.width) * (W + 2), -1 + ((e.clientY - r.top) / r.height) * (H + 2)];
  };
  const retidy = (rs: SketchRoom[], c = carpet) => { if (tidy) setTidy(tidySketch(rs, c)); };

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (after) { setSay('Switch to Your sketch to draw.'); return; }
    const p = ptOf(e);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDraft({ a: p, b: p });
    setSay(null);
    e.preventDefault();
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => { if (draft) setDraft({ ...draft, b: ptOf(e) }); };
  const up = () => {
    const d = draft;
    setDraft(null);
    if (!d) return;
    const x = Math.min(d.a[0], d.b[0]), y = Math.min(d.a[1], d.b[1]);
    const w = Math.abs(d.b[0] - d.a[0]), h = Math.abs(d.b[1] - d.a[1]);
    if (w < 0.3 && h < 0.3) {
      // A click: pick the box under it, to name or remove it.
      const hit = [...rooms].reverse().find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      setPick(hit ? hit.id : null);
      return;
    }
    if (!bigEnough(w, h)) { setSay(`Drag a bigger box: at least ${MIN_SKETCH_FT} ft each way.`); return; }
    const id = `s${++nid.current}`;
    const next = [...rooms, { id, name: '', x, y, w, h }];
    setRooms(next); setTidy(null); setShow('before'); setPick(id);
  };

  const name = (kind: { name: string; kind: SketchRoom['kind'] }) => {
    if (!pend) return;
    const next = rooms.map(r => (r.id === pend.id ? { ...r, name: sketchName(kind.name, rooms, r.id), kind: kind.kind } : r));
    setRooms(next); setPick(null); retidy(next);
  };
  const removeBox = () => {
    if (!pend) return;
    setRooms(rooms.filter(r => r.id !== pend.id)); setPick(null); setTidy(null); setShow('before');
  };
  const runTidy = () => {
    if (!rooms.length) { setSay('Draw the rooms first.'); return; }
    setTidy(tidySketch(rooms, carpet)); setShow('after'); setPick(null); setSay(null);
  };
  const setCarpetFrom = (v: string) => {
    setCarpetText(v);
    const n = Math.max(100, Math.round(Number(v.replace(/[,\s]/g, '')) || 0));
    if (Number(v.replace(/[,\s]/g, '')) > 0) { setCarpet(n); retidy(rooms, n); }
  };

  const shapes = shown.map(r => {
    const label = r.name || (after ? 'Room' : 'Name it');
    const fs = Math.min(0.85, r.w / (label.length * 0.62));
    return after ? (
      <g key={r.id}>
        <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#fff" stroke="#1e293b" strokeWidth={0.25} />
        <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 0.2} fontSize={fs} fontWeight={700} fill="#334155" textAnchor="middle">{label}</text>
        <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 0.9} fontSize={Math.min(0.7, r.w / 8)} fill="#64748b" textAnchor="middle">{ftin(r.w)} × {ftin(r.h)}</text>
      </g>
    ) : (
      <g key={r.id}>
        <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={0.3} fill={BRAND} fillOpacity={r.id === pick ? 0.16 : 0.07} stroke={BRAND} strokeWidth={0.12} strokeDasharray=".5 .3" />
        <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 0.3} fontSize={fs} fontWeight={700} fill={r.name ? BRAND : '#e11d48'} textAnchor="middle">{label}</text>
      </g>
    );
  });

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center p-4 phd-scrim" style={{ background: 'rgba(15,23,42,.45)' }} role="dialog" aria-modal="true" aria-label="Sketch a rough plan"
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="phd-pop w-full max-w-[1080px] max-h-[92vh] flex flex-col rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><PenLine className="w-4 h-4" aria-hidden /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">No plan yet · {project}</div>
            <h2 className="text-lg font-bold text-slate-800">Sketch a rough plan</h2>
            <p className="text-xs text-slate-500">No design skills needed. Drag rough boxes for the rooms, name them, and the app turns the sketch into a clean plan.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto grid gap-4 p-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Segmented size="sm" label="Show" value={after ? 'after' : 'before'}
                options={[{ id: 'before', label: 'Your sketch' }, { id: 'after', label: 'Tidied plan' }]}
                onChange={v => { if (v === 'after' && !tidy) return; setShow(v); }} />
              <span className="text-[11px] text-slate-500">{after ? 'Rooms share walls, sizes in 3″ steps' : 'Drag on the grid to add a room. One square is 1 ft.'}</span>
            </div>
            <svg ref={svgRef} viewBox={`-1 -1 ${W + 2} ${H + 2}`} className={`w-full rounded-2xl border border-slate-200 bg-white ${after ? '' : 'cursor-crosshair'}`}
              style={{ aspectRatio: `${W + 2} / ${H + 2}`, touchAction: 'none' }} role="application" aria-label="Sketch area"
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDraft(null)}>
              {grid}
              {shapes}
              {draft && (
                <rect x={Math.min(draft.a[0], draft.b[0])} y={Math.min(draft.a[1], draft.b[1])} width={Math.abs(draft.b[0] - draft.a[0])} height={Math.abs(draft.b[1] - draft.a[1])}
                  fill={BRAND} fillOpacity={0.12} stroke={BRAND} strokeWidth={0.12} />
              )}
            </svg>
            {say && <p role="status" className="text-xs text-amber-700 mt-2">{say}</p>}
          </div>

          <div className="space-y-3">
            {pend && (
              <div className="rounded-xl border border-[#3D52A0]/30 bg-[#3D52A0]/[0.04] p-3 hud-panel-in">
                <div className="text-xs font-bold text-slate-800">What is this room?</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SKETCH_KINDS.map(k => (
                    <button key={k.name} type="button" onClick={() => name(k)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 bg-white text-slate-700 hover:border-[#3D52A0]/40">{k.name}</button>
                  ))}
                </div>
                <button type="button" onClick={removeBox} className="mt-2 text-[11px] font-bold text-rose-600 hover:underline">Remove this box</button>
              </div>
            )}
            <div className="rounded-xl border border-slate-200 p-3">
              <div className={LABEL}>1 · Draw</div>
              <p className="text-xs text-slate-600 mt-1">{rooms.length} rooms. Rough is fine: gaps, overlaps and crooked sizes are tidied for you.</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className={LABEL}>2 · Carpet area</div>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <input value={carpetText} onChange={e => setCarpetFrom(e.target.value)} inputMode="numeric" aria-label="Carpet area in sq ft"
                  className="w-20 px-2 py-1 rounded-lg border border-slate-300 font-bold text-right tabular-nums" />
                <span className="text-slate-500">sq ft, from the brief</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">The sketch is scaled so the rooms add up to this.</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className={LABEL}>3 · Tidy into a plan</div>
              {tidy ? (
                <ul className="mt-1.5 space-y-1 text-xs text-slate-700">
                  {tidy.notes.map(n => <li key={n} className="flex gap-1.5"><span className="text-emerald-600"><Check className="w-3.5 h-3.5" aria-hidden /></span><span>{n}</span></li>)}
                </ul>
              ) : <p className="text-xs text-slate-600 mt-1">Lines up edges that nearly meet, removes overlaps, scales to the carpet area and rounds sizes to 3″.</p>}
              <div className="mt-2"><Button size="sm" variant={tidy ? 'secondary' : 'primary'} icon={Sparkles} onClick={runTidy}>{tidy ? 'Tidy again' : 'Tidy into a plan'}</Button></div>
            </div>
            <p className="text-[11px] text-slate-500">Site measurement replaces these sizes later, and the client never sees this plan before layout approval.</p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-500 flex-1">{tidy ? 'Ready to use as the project’s plan.' : 'Tidy it first.'}</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!tidy} onClick={() => tidy && onUse(tidy)}>Use as the plan</Button>
        </div>
      </div>
    </div>
  );
}
