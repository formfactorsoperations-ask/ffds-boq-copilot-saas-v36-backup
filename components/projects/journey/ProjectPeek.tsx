import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X } from 'lucide-react';
import { STAGE } from '../../../lib/projectFolders';
import { STEP_WORDS, dueLabel, stepSub, type JourneyRow } from '../../../lib/projectsJourney';
import { Button, LABEL } from '../../ui/kit';
import { NextStepButton, ProjectPhoto, StageChip, Stickers } from './parts';
import { ago } from './ProjectList';
import '../../projectHeader/projectHeader.css';

/*
  The project's preview (the approved mockup's one-click peek): its photo with
  its name, stage and stickers over it; the journey in five steps; the next
  step with its button; the screens inside it; and Open project, Change stage,
  Clone as template along the foot. On the AssignProjectsModal pattern.
*/

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export default function ProjectPeek({ row, nameOf, now = Date.now(), onClose, onOpenProject, onFile, onDo, onChangeStage, onClone, onTag }: {
  row: JourneyRow;
  nameOf: (email: string) => string;
  now?: number;
  onClose: () => void;
  onOpenProject: (r: JourneyRow) => void;
  onFile: (r: JourneyRow, route: string) => void;
  onDo: (r: JourneyRow) => void;
  onChangeStage: (r: JourneyRow) => void;
  onClone: (r: JourneyRow) => void;
  onTag: (r: JourneyRow, isDummy: boolean) => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const def = STAGE[row.stage];
  const tone = row.next?.tone;
  const who = row.designers.map(nameOf).join(', ');

  return createPortal(
    <div className="pj-overlay fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={row.name}>
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-[860px] max-h-[90vh] overflow-y-auto bg-white rounded-3xl border border-slate-200 shadow-2xl">
        <button type="button" aria-label="Close" onClick={onClose}
          className="absolute right-3.5 top-3.5 z-10 w-[34px] h-[34px] rounded-xl grid place-items-center bg-white/80 backdrop-blur border border-white/70 shadow-sm text-slate-700 hover:bg-white">
          <X className="w-4 h-4" />
        </button>
        <div className="relative">
          <ProjectPhoto row={row} className="h-[240px] rounded-t-3xl" eager mark="none" />
          <div className="absolute inset-0 rounded-t-3xl bg-gradient-to-b from-transparent via-transparent to-slate-900/70 pointer-events-none" />
          <div className="absolute left-6 right-6 bottom-5 text-white">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <StageChip stage={row.stage} />
              {row.photo && row.defaultPhotos?.includes(row.photo) && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/90 text-slate-600 text-[10px] font-bold uppercase tracking-wider">No render yet</span>
              )}
              <Stickers kind={row.kind} boq={row.boq} onTag={(d) => onTag(row, d)} />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">{row.name}</h2>
            <p className="text-sm text-white/90">{[row.client, row.meta].filter(Boolean).join(' · ')}</p>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className={cx(LABEL, 'mb-2')}>Journey</p>
          <div className="grid grid-cols-5 gap-1.5 mb-5">
            {STEP_WORDS.map((w, i) => (
              <div key={w} className={cx('text-[11px] font-bold', def.step >= i ? 'text-slate-700' : 'text-slate-400')} style={def.step === i ? { color: def.color } : undefined}>
                <i className="block h-1.5 rounded-full mb-1.5" style={{ background: def.step >= i ? def.color : '#e2e8f0' }} />
                {w}{def.step === i ? ' · now' : ''}
              </div>
            ))}
          </div>
          {def.step < 0 && <p className="-mt-2 mb-4 text-xs font-semibold text-slate-600">Closed as {def.label}</p>}

          {row.next && (
            <div className={cx('flex flex-wrap items-center gap-3 px-4 py-3.5 rounded-2xl border mb-5',
              tone === 'red' ? 'border-rose-200 bg-rose-50' : tone === 'gold' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50')}>
              <div className="flex-1 min-w-[200px]">
                <p className={LABEL}>Next step</p>
                <p className="font-bold text-slate-800">{row.action?.title || row.next.label}</p>
                <p className="text-[11px] text-slate-500">
                  {[row.due ? (dueLabel(row.due.day, now) === 'Overdue' ? 'Overdue' : `Due ${dueLabel(row.due.day, now) === 'Today' ? 'today' : dueLabel(row.due.day, now)}`) : null, stepSub(row).replace(`${row.name} · `, ''), who ? `designer ${who}` : null, row.updated ? `updated ${ago(row.updated).toLowerCase()}` : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <NextStepButton row={row} onDo={onDo} size="md" />
            </div>
          )}

          {row.files.length > 0 && (
            <>
              <p className={LABEL}>Inside this project</p>
              <div className="grid gap-2.5 mt-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {row.files.map((f, i) => (
                  <button key={f.name} type="button" onClick={() => onFile(row, f.route)}
                    className="hud-row-in flex items-center gap-2.5 text-left p-3 rounded-2xl border border-slate-200 transition hover:border-[#3D52A0] hover:-translate-y-0.5 hover:shadow-md"
                    style={{ animationDelay: `${i * 30}ms` }}>
                    <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><FileText className="w-4 h-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 truncate">{f.name}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{f.meta}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 px-6 py-3.5 bg-slate-50 border-t border-slate-100">
          <Button variant="primary" onClick={() => onOpenProject(row)}>Open project</Button>
          <Button onClick={() => onChangeStage(row)}>Change stage</Button>
          <Button onClick={() => onClone(row)}>Clone as template</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
