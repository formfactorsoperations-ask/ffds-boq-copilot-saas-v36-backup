import React, { useState } from 'react';
import { STAGE, type FolderStage } from '../../../lib/projectFolders';
import { CLOSED, FLOW, type JourneyRow, type StageFilter } from '../../../lib/projectsJourney';
import { Face, NextStepButton, ProjectPhoto, Stickers } from './parts';

/*
  Board (DESIGN.md "Projects: journey, needs you, one list"): one glass lane per
  stage plus Closed, each tinted with its stage colour. A card has the photo,
  the stickers, the name, the client and the next-step button. Drag a card to
  another lane to change its stage: the drop opens the status window set to
  that stage, so the checks it makes, and a termination when a signed project
  is closed, still happen.
*/

type Lane = FolderStage | 'closed';

const laneOf = (s: FolderStage): Lane => (CLOSED.includes(s) ? 'closed' : s);
const CLOSED_COLOUR = '#64748b';

export default function ProjectBoard({ rows, stage, nameOf, onOpen, onDo, onMove, onTag }: {
  rows: JourneyRow[];
  /** The stage picked on the journey strip: only its lane is shown. */
  stage: StageFilter;
  nameOf: (email: string) => string;
  onOpen: (r: JourneyRow) => void;
  onDo: (r: JourneyRow) => void;
  onMove: (r: JourneyRow, to: Lane) => void;
  onTag: (r: JourneyRow, isDummy: boolean) => void;
}) {
  const [over, setOver] = useState<Lane | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const lanes: Lane[] = stage === 'all' ? [...FLOW, 'closed'] : [stage as Lane];

  return (
    <div>
      <div className="pj-lanes pj-noscroll">
        {lanes.map((k, li) => {
          const items = rows.filter((r) => laneOf(r.stage) === k);
          const c = k === 'closed' ? CLOSED_COLOUR : STAGE[k].color;
          return (
            <section
              key={k}
              aria-label={k === 'closed' ? 'Closed' : STAGE[k].label}
              data-testid={`lane-${k}`}
              className={`pj-lane hud-panel-in${over === k ? ' over' : ''}`}
              style={{ ['--c' as any]: c, animationDelay: `${li * 50}ms` }}
              onDragOver={(e) => { e.preventDefault(); if (over !== k) setOver(k); }}
              onDragLeave={() => setOver((o) => (o === k ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData('text/plain') || dragging;
                const r = rows.find((x) => x.id === id);
                if (r && laneOf(r.stage) !== k) onMove(r, k);
              }}
            >
              <div className="flex items-center gap-2 px-1.5 pt-1.5 pb-3 text-sm font-bold text-slate-800">
                <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                {k === 'closed' ? 'Closed' : STAGE[k].label}
                <span className="ml-auto text-xs font-bold text-slate-500 bg-white rounded-full px-2.5 py-px tabular-nums">{items.length}</span>
              </div>
              {items.map((r) => (
                <article
                  key={r.id}
                  draggable
                  data-testid={`card-${r.id}`}
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; setDragging(r.id); }}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => onOpen(r)}
                  className={`pj-lcard bg-white rounded-2xl border border-slate-200 overflow-hidden mb-2.5${dragging === r.id ? ' drag' : ''}`}
                >
                  <ProjectPhoto row={r} className="h-[110px]" />
                  <div className="p-3">
                    <div className="mb-2"><Stickers kind={r.kind} boq={r.boq} onTag={(d) => onTag(r, d)} /></div>
                    <p className="text-base font-bold text-slate-900 tracking-tight truncate">{r.name}</p>
                    <p className="text-[11px] text-slate-500 mb-2.5 truncate">{[r.client, (r.project.context as any)?.config].filter(Boolean).join(' · ')}</p>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0"><NextStepButton row={r} onDo={onDo} /></div>
                      <span className="ml-auto" />
                      {r.designers[0] && <Face email={r.designers[0]} name={nameOf(r.designers[0])} />}
                    </div>
                  </div>
                </article>
              ))}
              {items.length === 0 && <p className="text-[11px] text-slate-500 p-2.5">Drop a project here</p>}
            </section>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Drag a card to another lane to change its stage.</p>
    </div>
  );
}
