import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, ChevronLeft, X } from 'lucide-react';
import { stepSub, type JourneyRow } from '../../../lib/projectsJourney';
import { Button, Chip } from '../../ui/kit';
import { JourneyBar, ProjectPhoto, StageChip } from './parts';
import '../../projectHeader/projectHeader.css';

/*
  "Go through them" (DESIGN.md "Projects: journey, needs you, one list"): the
  needs-you steps as a deck, one card at a time, in a modal on the
  AssignProjectsModal pattern. Drag the card or press ← →: right does the step
  (it opens the screen the step lives on), left snoozes it to tomorrow. "n of
  N" counts through, and an "All clear" tick ends it.
*/

const FLING = 110;

export default function TriageDeck({ rows, onDo, onSnooze, onOpen, onRestart, onClose }: {
  rows: JourneyRow[];
  /** Right: open the step's screen. */
  onDo: (r: JourneyRow) => void;
  /** Left: snooze the step to tomorrow. */
  onSnooze: (r: JourneyRow) => void;
  /** The middle button: the project's preview. */
  onOpen: (r: JourneyRow) => void;
  /** "Start again" after the deck is through: the snoozes made here are lifted. */
  onRestart: () => void;
  onClose: () => void;
}) {
  /* The deck is fixed when it opens; snoozing takes a card off the top. */
  const [deck] = useState(rows);
  const [done, setDone] = useState(0);
  const [leaving, setLeaving] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  const total = deck.length;
  const queue = deck.slice(done);
  const top = queue[0];

  const fling = useCallback((dir: 1 | -1) => {
    if (!top || leaving) return;
    setLeaving({ id: top.id, dir });
    setDx(0);
    setTimeout(() => {
      setLeaving(null);
      if (dir > 0) { onDo(top); return; }
      onSnooze(top);
      setDone((n) => n + 1);
    }, 320);
  }, [top, leaving, onDo, onSnooze]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); fling(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); fling(-1); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [fling, onClose]);

  const restart = () => { onRestart(); setDone(0); };

  const card = (r: JourneyRow, i: number) => {
    const front = i === 0;
    const out = leaving?.id === r.id ? leaving.dir : 0;
    const moving = front && !out ? dx : 0;
    const transform = out
      ? `translateX(${out * 700}px) rotate(${out * 24}deg)`
      : front
        ? `translateX(${moving}px) rotate(${moving / 18}deg)`
        : `translateY(${i * 14}px) scale(${1 - i * 0.045})`;
    const tone = r.next!.tone;
    return (
      <div
        key={r.id}
        data-testid={front ? 'triage-front' : undefined}
        className={`pj-tc bg-white rounded-3xl border border-slate-200 shadow-2xl${front ? ' front' : ''}`}
        style={{ zIndex: 10 - i, transform, opacity: out ? 0 : i > 2 ? 0 : 1, transition: front && start.current !== null ? 'none' : undefined }}
        onPointerDown={front ? (e) => { start.current = e.clientX; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } : undefined}
        onPointerMove={front ? (e) => { if (start.current !== null) setDx(e.clientX - start.current); } : undefined}
        onPointerUp={front ? () => { if (start.current === null) return; start.current = null; if (Math.abs(dx) > FLING) fling(dx > 0 ? 1 : -1); else setDx(0); } : undefined}
      >
        <span className="pj-stamp yes" style={{ opacity: out === 1 ? 1 : Math.max(0, moving / 120) }}>DO IT</span>
        <span className="pj-stamp no" style={{ opacity: out === -1 ? 1 : Math.max(0, -moving / 120) }}>LATER</span>
        <ProjectPhoto row={r} className="h-[250px]" eager />
        <div className="px-5 py-4">
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            <StageChip stage={r.stage} />
            <Chip tone={tone === 'red' ? 'bad' : tone === 'gold' ? 'warn' : 'brand'}>{tone === 'red' ? 'Blocking' : tone === 'gold' ? 'Due' : 'Next'}</Chip>
          </div>
          <p className="text-xl font-bold text-slate-900 tracking-tight leading-snug">{r.action?.title || r.next!.label}</p>
          <p className="text-xs text-slate-500 mt-1 mb-3">{r.name} · {r.client}</p>
          <JourneyBar stage={r.stage} />
          <p className="text-[11px] text-slate-500 mt-2">{stepSub(r).replace(`${r.name} · `, '')}{r.action?.why ? ` · ${r.action.why}` : ''}</p>
        </div>
      </div>
    );
  };

  return createPortal(
    <div className="pj-overlay fixed inset-0 z-[300] flex items-start justify-center px-4 pt-[7vh] pb-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Go through what needs you">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-[460px]">
        <div className="flex items-center text-white font-bold mb-3">
          {top ? <span>Needs you · <span className="tabular-nums">{done + 1}</span> of <span className="tabular-nums">{total}</span></span> : <span>All clear</span>}
          <button type="button" onClick={onClose} className="ml-auto flex items-center gap-1 text-sm text-white/90 hover:text-white"><X className="w-4 h-4" /> Close</button>
        </div>

        {top ? (
          <>
            <div className="pj-deck">{queue.slice(0, 4).map(card).reverse()}</div>
            <div className="flex justify-center gap-3 mt-4">
              <button type="button" className="pj-dbtn bg-white border border-slate-200 shadow-lg text-slate-600" title="Later (←)" aria-label="Later, snooze to tomorrow" onClick={() => fling(-1)}><ChevronLeft className="w-6 h-6" /></button>
              <button type="button" className="pj-dbtn !w-[66px] !h-[66px] bg-[#3D52A0] text-white shadow-lg" title="Open the project" aria-label="Open the project" onClick={() => onOpen(top)}><ArrowRight className="w-6 h-6" /></button>
              <button type="button" className="pj-dbtn bg-white border border-slate-200 shadow-lg text-emerald-700" title="Do it (→)" aria-label="Do it" onClick={() => fling(1)}><Check className="w-6 h-6" strokeWidth={2.6} /></button>
            </div>
            <p className="text-center mt-2.5 text-[11px] text-slate-200">Drag the card, or press ← →</p>
          </>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl px-6 py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center mx-auto mb-3"><Check className="w-7 h-7" strokeWidth={3} /></div>
            <p className="font-bold text-slate-800">You went through <span className="tabular-nums">{total}</span> next step{total === 1 ? '' : 's'}</p>
            <p className="text-xs text-slate-500 mt-1">The ones you put off come back tomorrow.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button onClick={restart}>Start again</Button>
              <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
