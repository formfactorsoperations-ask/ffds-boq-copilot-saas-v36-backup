import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { STAGE } from '../../../lib/projectFolders';
import type { JourneyRow } from '../../../lib/projectsJourney';
import { Button, Chip, StateDot } from '../../ui/kit';
import { NextStepButton, ProjectPhoto } from './parts';

/*
  Needs you (DESIGN.md "Projects: journey, needs you, one list"): a carousel of
  the projects with a next step, blockers first, then due, then the rest. No
  scrollbar; arrows on the right. A card carries the project's photo, a left
  edge in rose (blocking), gold (due) or brand (next), the chip, the project's
  name with its client, the step, and one button that does it. "Go through
  them" opens the triage deck.

  The day a step is due (Overdue / Today / a day) comes with due dates on
  next steps (Phase 3); until then the card shows the stage there.
*/

const EDGE = { red: '#e11d48', gold: '#B8923A', brand: '#3D52A0' } as const;

export default function NeedsYou({ rows, onOpen, onDo, onTriage }: {
  rows: JourneyRow[];
  onOpen: (r: JourneyRow) => void;
  onDo: (r: JourneyRow) => void;
  onTriage: () => void;
}) {
  const track = useRef<HTMLDivElement | null>(null);
  const page = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * 624, behavior: 'smooth' });

  if (!rows.length) {
    return (
      <div className="flex items-center gap-2.5 bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3.5 hud-panel-in">
        <StateDot tone="good" />
        <p className="text-sm font-semibold text-slate-800">Nothing needs you in this view.</p>
        <p className="text-[11px] text-slate-500">Every project here is on track.</p>
      </div>
    );
  }

  return (
    <section aria-label="Needs you">
      <div className="flex items-center gap-2.5 mb-2.5">
        <StateDot tone="bad" />
        <h3 className="font-bold text-slate-800 whitespace-nowrap">Needs you</h3>
        <span className="hidden sm:inline text-[11px] text-slate-500"><span className="tabular-nums">{rows.length}</span> · blockers first</span>
        <Button size="sm" className="sm:ml-2 whitespace-nowrap" onClick={onTriage}>Go through them</Button>
        <div className="ml-auto flex gap-1.5">
          <button type="button" aria-label="Back" onClick={() => page(-1)} className="w-8 h-8 rounded-full border border-slate-200 bg-white grid place-items-center text-slate-600 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
          <button type="button" aria-label="More" onClick={() => page(1)} className="w-8 h-8 rounded-full border border-slate-200 bg-white grid place-items-center text-slate-600 hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
      <div ref={track} className="pj-nc pj-noscroll">
        {rows.map((r, i) => {
          const tone = r.next!.tone;
          return (
            <article
              key={r.id}
              role="button"
              tabIndex={0}
              aria-label={`${r.name}: ${r.next!.label}`}
              onClick={() => onOpen(r)}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r); }}
              className="pj-ncard bg-white rounded-2xl border border-slate-200 shadow-sm hud-panel-in"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <span className="pj-edge" style={{ background: EDGE[tone] }} />
              <ProjectPhoto row={r} className="h-[132px]" />
              <div className="px-3.5 pt-3 pb-3.5">
                <div className="flex items-center gap-1.5">
                  <Chip tone={tone === 'red' ? 'bad' : tone === 'gold' ? 'warn' : 'brand'}>{tone === 'red' ? 'Blocking' : tone === 'gold' ? 'Due' : 'Next'}</Chip>
                  <span className="ml-auto text-[11px] text-slate-500">{STAGE[r.stage].label}</span>
                </div>
                <p className="mt-2 mb-0.5 flex items-baseline gap-2 min-w-0 whitespace-nowrap">
                  <span className="text-base font-bold text-slate-900 tracking-tight truncate">{r.name}</span>
                  <span className="text-[11px] text-slate-500 truncate">· {r.client}</span>
                </p>
                <p className="text-sm font-semibold text-slate-700 mb-2.5 truncate">{r.action?.title || r.next!.label}</p>
                <NextStepButton row={r} label={tone === 'red' ? 'Fix it' : 'Do it'} onDo={onDo} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
