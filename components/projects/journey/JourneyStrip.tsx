import React, { useEffect, useState } from 'react';
import { STAGE } from '../../../lib/projectFolders';
import { FLOW, type StageFilter, type StripStage } from '../../../lib/projectsJourney';
import { ProjectPhoto } from './parts';

/*
  The journey strip (DESIGN.md "Projects: journey, needs you, one list"). It
  replaces the stage tabs: the five stages on one line, each with its count,
  its blocked count in rose and a stack of its projects' photos, then a dashed
  "Closed · n". A click filters everything below; a second click shows all.

  It is always in motion (owner, 25 Nov 2026): an arc circles each ring at the
  stage's own speed, a stage with a blocker pulses rose, the connectors' dashes
  flow towards handover with a dot travelling along, the photos bob, each
  stack cycles through every project at that stage every 2.6 s, and the
  selected stage carries a slow sheen. All of it is CSS (projectsJourney.css)
  and stops under reduced motion; the cycling stops with it.
*/

const CYCLE_MS = 2600;
const SHOWN = 3;

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function JourneyStrip({ stages, closed, selected, onSelect }: {
  stages: StripStage[];
  closed: number;
  selected: StageFilter;
  onSelect: (s: StageFilter) => void;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduced()) return;
    const t = setInterval(() => setTick((n) => n + 1), CYCLE_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <nav aria-label="Stages" className="pj-strip pj-noscroll bg-white rounded-2xl border border-slate-200 shadow-sm hud-panel-in">
      {stages.map((s, i) => {
        const def = STAGE[s.stage];
        const n = s.rows.length;
        const off = n > SHOWN ? tick % n : 0;
        const stack = [...s.rows.slice(off), ...s.rows.slice(0, off)].slice(0, SHOWN);
        const next = FLOW[i + 1];
        return (
          <React.Fragment key={s.stage}>
            <button
              type="button"
              aria-pressed={selected === s.stage}
              onClick={() => onSelect(s.stage)}
              className={`pj-st${selected === s.stage ? ' on' : ''}${s.blocked ? ' blk' : ''}`}
              style={{ ['--c' as any]: def.color, ['--sp' as any]: `${2.2 + i * 0.5}s` }}
            >
              <span className="pj-ring" aria-hidden />
              <span className="flex flex-col min-w-0 shrink">
                <b className="text-sm font-bold text-slate-800 whitespace-nowrap">{def.label}</b>
                <span className="text-[11px] text-slate-500 leading-snug">
                  <span className="tabular-nums">{n}</span> project{n === 1 ? '' : 's'}
                  {s.blocked > 0 && <> · <span className="font-bold text-rose-700"><span className="tabular-nums">{s.blocked}</span> blocked</span></>}
                </span>
              </span>
              {n > 0 && (
                <span className="pj-toks" aria-hidden>
                  {stack.map((r, j) => (
                    <span key={r.id} className="pj-tok-in" style={{ animationDelay: `${j * 60}ms` }}>
                      <span className="pj-tok block" title={r.name} style={{ animationDelay: `${-j * 0.7}s` }}>
                        <ProjectPhoto row={r} label={false} />
                      </span>
                    </span>
                  ))}
                  {n > SHOWN && <span className="ml-1 text-[11px] font-bold text-slate-500 tabular-nums">+{n - SHOWN}</span>}
                </span>
              )}
            </button>
            {next && (
              <span className="pj-line" aria-hidden
                style={{ ['--a' as any]: def.color, ['--b' as any]: STAGE[next].color, ['--d' as any]: `${i * 0.45}s` }}>
                <i />
              </span>
            )}
          </React.Fragment>
        );
      })}
      <button type="button" aria-pressed={selected === 'closed'} onClick={() => onSelect('closed')}
        className={`pj-closed text-xs font-bold text-slate-600${selected === 'closed' ? ' on' : ''}`}>
        Closed · <span className="tabular-nums">{closed}</span>
      </button>
    </nav>
  );
}
