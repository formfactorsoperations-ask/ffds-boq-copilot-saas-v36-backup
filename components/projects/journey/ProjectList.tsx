import React from 'react';
import { FileText, MoreHorizontal } from 'lucide-react';
import { STAGE } from '../../../lib/projectFolders';
import { STEP_WORDS, type JourneyRow, type RowGroup } from '../../../lib/projectsJourney';
import { timeAgo } from '../../../lib/utils';
import { LABEL, Panel } from '../../ui/kit';
import { Face, JourneyBar, NextStepButton, ProjectPhoto, Stickers } from './parts';

/*
  List (DESIGN.md "Projects: journey, needs you, one list"): one Panel of rows,
  grouped by stage or by designer (with each designer's live count). A row has
  the photo, the project's name at 16px bold turning brand on hover, client ·
  type · area · place, the two stickers; the journey bar and step; the
  next-step button; and ···. Hovering a row slides out its files (the screens
  that matter at its stage), one click each.

  The health rings (journey, drawings issued, snags closed) wait for drawing
  counts (Phase 3), and the step's day for due dates.
*/

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export function ago(ms: number) {
  if (!ms) return '';
  const d = Date.now() - ms;
  if (d < 86_400_000 && new Date(ms).toDateString() === new Date().toDateString()) return 'Today';
  return timeAgo(ms).replace(' ago', '');
}

export default function ProjectList({ groups, by, selected, nameOf, onOpen, onDo, onFile, onMenu, onTag }: {
  groups: RowGroup[];
  by: 'stage' | 'designer';
  selected: Set<string>;
  nameOf: (email: string) => string;
  onOpen: (r: JourneyRow) => void;
  onDo: (r: JourneyRow) => void;
  onFile: (r: JourneyRow, route: string) => void;
  onMenu: (r: JourneyRow, anchor: DOMRect) => void;
  onTag: (r: JourneyRow, isDummy: boolean) => void;
}) {
  let n = 0;
  return (
    <Panel flush>
      <div className="pj-cols pj-head px-5 py-3 border-b border-slate-100">
        <span className={LABEL}>Project</span>
        <span className={cx(LABEL, 'pj-c2')}>Journey</span>
        <span className={cx(LABEL, 'pj-c3')}>Next step</span>
        <span />
      </div>
      {groups.map((g) => (
        <div key={g.key} role="group" aria-label={g.label}>
          <div className="flex items-center gap-2 px-5 pt-3.5 pb-2 text-xs font-bold text-slate-600">
            {by === 'stage'
              ? <span className="w-2 h-2 rounded-full" style={{ background: g.color }} />
              : g.email ? <Face email={g.email} name={g.label} size={22} /> : <span className="w-2 h-2 rounded-full bg-slate-300" />}
            {g.label}
            <span className="text-slate-400 tabular-nums">{g.rows.length}</span>
            {by === 'designer' && <span className="ml-1.5 text-[11px] font-semibold text-slate-500"><span className="tabular-nums">{g.live}</span> live</span>}
          </div>
          {g.rows.map((r) => {
            const def = STAGE[r.stage];
            const i = n++;
            const who = r.designers[0];
            return (
              <div
                key={`${g.key}:${r.id}`}
                role="button"
                tabIndex={0}
                data-testid={`journey-row-${r.id}`}
                aria-label={`${r.name}, ${def.label}`}
                onClick={() => onOpen(r)}
                onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(r); }}
                className={cx('pj-row pj-cols group px-5 py-3 border-t border-slate-100 hud-row-in outline-none focus-visible:bg-slate-50', selected.has(r.id) && '!bg-[#3D52A0]/5')}
                style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <ProjectPhoto row={r} className="w-[76px] h-[56px] rounded-[14px]" label={false} />
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-900 tracking-tight truncate transition-colors group-hover:text-[#3D52A0]">{r.name}</p>
                    <p className="text-xs text-slate-500 truncate">{[r.client, r.meta].filter(Boolean).join(' · ')}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Stickers kind={r.kind} boq={r.boq} onTag={(d) => onTag(r, d)} />
                    </div>
                    {r.files.length > 0 && (
                      <div className="pj-files">
                        {r.files.map((f) => (
                          <button key={f.name} type="button" onClick={(e) => { e.stopPropagation(); onFile(r, f.route); }}
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-0.5 whitespace-nowrap hover:border-[#3D52A0] hover:text-[#3D52A0] transition-colors">
                            <FileText className="w-3 h-3 text-slate-400" aria-hidden />{f.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="pj-c2 min-w-0">
                  <JourneyBar stage={r.stage} />
                  <p className="text-[11px] text-slate-500 mt-1.5 truncate">
                    {[def.step >= 0 ? STEP_WORDS[def.step] : def.label, ago(r.updated), by === 'stage' && who ? nameOf(who).split(' ')[0] : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="pj-c3 min-w-0 flex flex-col items-start gap-1">
                  <NextStepButton row={r} onDo={onDo} />
                </div>
                <div className="flex justify-end">
                  <button type="button" aria-label={`More for ${r.name}`} aria-haspopup="menu"
                    onClick={(e) => { e.stopPropagation(); onMenu(r, (e.currentTarget as HTMLElement).getBoundingClientRect()); }}
                    className="w-[30px] h-[30px] rounded-[10px] grid place-items-center text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                    <MoreHorizontal className="w-[18px] h-[18px]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </Panel>
  );
}
