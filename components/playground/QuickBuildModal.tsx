import React, { useMemo, useState } from 'react';
import { Zap, X, Check, MapPin, Info } from 'lucide-react';
import { Button, Segmented, Chip, LABEL } from '../ui/kit';
import type { Item, BoqItem, Room } from '../../types';
import type { Grade } from '../../lib/materialSpecs';
import { ftin, boundsOf } from '../../lib/playground/geometry';
import { drawOf, pieceSize } from '../../lib/playground/pieces';
import { quickBuild, QUICK_SIZES, type QuickSize, type RoomStandards } from '../../lib/playground/quickBuild';
import { PieceArt } from './pieceArt';

/*
  The quick build (BOQ Playground PR 5): no plan, and a BOQ in one step.

  The flat's size, its carpet area and the finish make the rooms, a working
  plan of them as blocks, and each room's standard pieces from Studio settings
  (room standards), placed along a free wall or waiting under Needs a place.
  The same dialog as Sketch a rough plan: the picture on the left, the steps on
  the right, and what it adds said before anything is built.
*/

const FINISH: { id: Grade; label: string }[] = [{ id: 'E', label: 'Essential' }, { id: 'C', label: 'Comfort' }, { id: 'P', label: 'Premium' }];

export interface QuickBuildChoice { size: QuickSize; carpet: number; grade: Grade }

export default function QuickBuildModal({ project, size: size0, carpet: carpet0, grade: grade0, own, bank, boq, standards, paints, onBuild, onClose }: {
  project: string;
  size: QuickSize;
  carpet: number;
  grade: Grade;
  /** The project's rooms: used when they have their sizes. */
  own: Room[];
  bank: Item[];
  boq: BoqItem[];
  standards?: RoomStandards | null;
  /** Painting will be added, measured from the rooms. */
  paints: boolean;
  onBuild: (c: QuickBuildChoice) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState<QuickSize>(size0);
  const [carpet, setCarpet] = useState<number>(Math.round(carpet0) || 0);
  const [carpetText, setCarpetText] = useState<string>(String(Math.round(carpet0) || ''));
  const [grade, setGrade] = useState<Grade>(grade0);
  const bankMap = useMemo(() => new Map(bank.map(i => [i.id, i])), [bank]);
  const build = useMemo(() => {
    let n = 0;
    return carpet > 0 ? quickBuild({ size, carpet, own, bank, boq, standards, newId: () => `q${++n}` }) : null;
  }, [size, carpet, own, bank, boq, standards]);

  /* The same scale as the sketch's grid: 40 × 30 ft, or larger when the rooms need it. */
  const bb = build && boundsOf(build.rects.map(r => r.plan));
  const b = bb && { x: 0, y: 0, w: Math.max(40, Math.ceil(bb.x + bb.w) + 1), h: Math.max(26, Math.ceil(bb.y + bb.h) + 1) };
  const placed = build ? build.standard.lines.filter(l => l.place) : [];
  const pieceCount = (room: string) => build?.standard.lines.filter(l => l.roomId === room).length || 0;

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center p-4 phd-scrim" style={{ background: 'rgba(15,23,42,.45)' }} role="dialog" aria-modal="true" aria-label="Quick build"
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="phd-pop w-full max-w-[1080px] max-h-[92vh] flex flex-col rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><Zap className="w-4 h-4" aria-hidden /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">No plan yet · {project}</div>
            <h2 className="text-lg font-bold text-slate-800">Quick build</h2>
            <p className="text-xs text-slate-500">The rooms from the flat’s size and carpet area, each with the studio’s standard pieces. A working BOQ in one step; the real plan replaces the blocks later.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto grid gap-4 p-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] text-slate-500">{build ? `${build.rects.length} rooms, ${build.from === 'project' ? 'the project’s own sizes' : `a standard ${size}`}, as blocks that share their walls` : 'Type the carpet area to see the rooms.'}</span>
            </div>
            {build && b && (
              <svg viewBox={`${b.x - 1} ${b.y - 1} ${b.w + 2} ${b.h + 2}`} className="w-full rounded-2xl border border-slate-200 bg-white" style={{ aspectRatio: `${b.w + 2} / ${b.h + 2}`, maxHeight: '60vh' }}
                role="img" aria-label="The rooms as blocks, with their standard pieces">
                {build.rects.map(r => (
                  <rect key={`f-${r.name}`} x={r.plan.x} y={r.plan.y} width={r.plan.w} height={r.plan.h} fill="#f7f6f2" />
                ))}
                {placed.map(l => {
                  const item = bankMap.get(l.bankId);
                  const draw = drawOf(item);
                  if (!draw || !l.place) return null;
                  const s = pieceSize(l, item, draw);
                  return (
                    <g key={l.id} transform={`translate(${l.place.x} ${l.place.y}) rotate(${l.place.rot})`}>
                      <PieceArt kind={draw.kind} w={s.w} d={s.d} words={item?.specs} high={draw.mount === 'high'} />
                    </g>
                  );
                })}
                {build.rects.map(r => (
                  <rect key={`w-${r.name}`} x={r.plan.x} y={r.plan.y} width={r.plan.w} height={r.plan.h} fill="none" stroke="#1e293b" strokeWidth={0.25} />
                ))}
                {build.rects.map(r => {
                  const fs = Math.min(0.85, r.plan.w / (r.name.length * 0.62));
                  const cx = r.plan.x + r.plan.w / 2, cy = r.plan.y + r.plan.h / 2;
                  return (
                    <g key={`t-${r.name}`} pointerEvents="none">
                      <text x={cx} y={cy - 0.2} fontSize={fs} fontWeight={700} fill="#334155" textAnchor="middle">{r.name}</text>
                      <text x={cx} y={cy + 0.9} fontSize={Math.min(0.7, r.plan.w / 8)} fill="#64748b" textAnchor="middle">{ftin(r.plan.w)} × {ftin(r.plan.h)}</text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className={LABEL}>1 · Size</div>
              <div className="mt-1.5"><Segmented size="sm" label="Size" value={size} options={QUICK_SIZES.map(s => ({ id: s, label: s }))} onChange={setSize} /></div>
              {build?.from === 'project' && <p className="text-[11px] text-slate-500 mt-1">The project already has its rooms’ sizes, so they are used.</p>}
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className={LABEL}>2 · Carpet area</div>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <input value={carpetText} inputMode="numeric" aria-label="Carpet area in sq ft"
                  onChange={e => { setCarpetText(e.target.value); const n = Number(e.target.value.replace(/[,\s]/g, '')); if (n > 0) setCarpet(Math.max(100, Math.round(n))); }}
                  className="w-20 px-2 py-1 rounded-lg border border-slate-300 font-bold text-right tabular-nums" />
                <span className="text-slate-500">sq ft, from the brief</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">The rooms add up to this.</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className={LABEL}>3 · Finish</div>
              <div className="mt-1.5"><Segmented size="sm" label="Finish" value={grade} options={FINISH} onChange={setGrade} /></div>
              <p className="text-[11px] text-slate-500 mt-1">Each piece takes its recipe’s materials at this finish.</p>
            </div>
            {build && (
              <div className="rounded-xl border border-slate-200 p-3">
                <div className={LABEL}>What goes in</div>
                <ul className="mt-1.5 space-y-1 text-xs text-slate-700">
                  <li className="flex gap-1.5"><span className="text-emerald-600"><Check className="w-3.5 h-3.5" aria-hidden /></span><span>{build.standard.placed} pieces placed in {build.rects.filter(r => pieceCount(r.name)).length} rooms</span></li>
                  {build.standard.waiting.length > 0 && (
                    <li className="flex gap-1.5"><span className="text-amber-600"><MapPin className="w-3.5 h-3.5" aria-hidden /></span><span>{build.standard.waiting.length} wait under Needs a place: {build.standard.waiting.join(', ')}</span></li>
                  )}
                  {paints && <li className="flex gap-1.5"><span className="text-emerald-600"><Check className="w-3.5 h-3.5" aria-hidden /></span><span>Wall and ceiling painting, measured from the rooms</span></li>}
                </ul>
                {build.standard.missing.length > 0 && (
                  <p className="text-[11px] text-slate-500 mt-2 inline-flex items-start gap-1"><Info className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />Not in your Item Bank, so left out: {build.standard.missing.join(', ')}.</p>
                )}
              </div>
            )}
            <p className="text-[11px] text-slate-500">The pieces and their sizes are the room standards in Studio settings. Site measurement replaces these sizes later, and the client never sees this plan before layout approval.</p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-500 flex-1">{build ? <>{build.standard.lines.length + (paints ? 2 : 0)} lines in {build.rects.length} rooms. <Chip tone="brand">{FINISH.find(f => f.id === grade)!.label}</Chip></> : 'Type the carpet area first.'}</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!build} onClick={() => build && onBuild({ size, carpet, grade })}>Build the BOQ</Button>
        </div>
      </div>
    </div>
  );
}

