import React, { useEffect, useRef, useState } from 'react';
import { AttachmentKind, SpinePhase } from './spineModel';

/**
 * The vertical spine: the project running down the page, one node per stage,
 * with everything that belongs to a stage attached to it.
 *
 * This is the shape the studio approved, and it replaces a six-bar horizontal
 * strip that could show a stage's name and nothing else. The difference is not
 * decorative — a horizontal strip has room for a label, so documents, decisions
 * and payments had to live on separate screens, and the client had to assemble
 * the stage in their head. Attaching them to the node is the whole point.
 *
 * The rail fills to the current stage on mount, so the first thing that moves
 * on the page is the answer to "how far along are we".
 */

const ICON: Record<AttachmentKind, string> = {
  decisions: '◆',
  doc: '▤',
  photo: '◧',
  payments: '₹',
  design: '◨',
  material: '◍',
};

interface Props {
  phases: SpinePhase[];
  currentStage: number;
  /** Active lens filter; 'all' shows everything. */
  filter: AttachmentKind | 'all';
}

export default function PortalSpine({ phases, currentStage, filter }: Props) {
  const [open, setOpen] = useState<number[]>([currentStage]);
  const [fill, setFill] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);

  // Fill the rail to the current stage once, after paint, so it animates from
  // zero rather than appearing already drawn.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const total = phases.length || 1;
      const done = phases.filter(p => p.status === 'completed').length;
      const active = phases.some(p => p.status === 'active') ? 0.5 : 0;
      setFill(Math.min(100, ((done + active) / total) * 100));
    });
    return () => cancelAnimationFrame(id);
  }, [phases]);

  const toggle = (n: number) =>
    setOpen(o => (o.includes(n) ? o.filter(x => x !== n) : [...o, n]));

  const visibleOf = (p: SpinePhase) =>
    filter === 'all' ? p.attachments : p.attachments.filter(a => a.kind === filter);

  return (
    <div className="relative" ref={railRef}>
      {/* One continuous rail behind every node, drawn once rather than per
          phase — segment-per-phase leaves hairline gaps at each boundary. */}
      {/* 64px "when" column + half the 24px node column, less half the rail's
          own 2px width — so the line runs dead through the node centres. */}
      <div className="absolute left-[75px] sm:left-[95px] top-6 bottom-6 w-0.5 bg-slate-100 rounded-full" aria-hidden="true">
        <div
          className="w-0.5 rounded-full bg-gradient-to-b from-[#0066CC] to-sky-200 transition-[height] duration-[1200ms] ease-out"
          style={{ height: `${fill}%` }}
        />
      </div>

      {phases.map(p => {
        const items = visibleOf(p);
        const isOpen = open.includes(p.stageNumber);
        const needs = items.filter(a => a.needsClient).length;
        const now = p.status === 'active';
        const done = p.status === 'completed';

        return (
          <div key={p.stageNumber} className="grid grid-cols-[64px_24px_minmax(0,1fr)] sm:grid-cols-[84px_24px_minmax(0,1fr)]">
            {/* When. Two stages inside one month both printed "Aug 2026",
                which reads as a stuck value rather than as two short stages —
                so a stage sharing its month with a neighbour shows the day. */}
            <div className="pr-3 py-[18px] text-right text-[10px] font-semibold leading-snug text-slate-400">
              {p.when && (
                <span className={`block tabular-nums ${p.whenIsEstimate ? 'text-slate-400 italic' : 'text-slate-500'}`}>
                  {p.when}
                </span>
              )}
              {/* An interpolated month is marked as such. The stage sits where
                  a reader would put it, but the studio has not set a date for
                  it — saying so is what keeps the rest of the column credible. */}
              {p.whenIsEstimate ? <span className="text-slate-300">expected</span>
                : p.whenNote ? <span>{p.whenNote}</span> : null}
            </div>

            {/* Node */}
            <div className="relative flex justify-center">
              <span
                className={`relative z-10 mt-[18px] w-3 h-3 rounded-full border-2 bg-white shrink-0 transition-colors ${
                  now ? 'border-[#0066CC] ring-4 ring-sky-50'
                      : done ? 'border-[#0066CC] bg-[#0066CC]'
                      : 'border-slate-200'
                }`}
              >
                {now && (
                  <span className="absolute -inset-1.5 rounded-full border-2 border-[#0066CC] portal-ping" aria-hidden="true" />
                )}
              </span>
            </div>

            {/* Body */}
            <div className="py-3 pl-1 min-w-0">
              <button
                onClick={() => toggle(p.stageNumber)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-2.5 flex-wrap text-left rounded-md cursor-pointer group"
              >
                <span
                  className={`text-slate-300 text-lg leading-none transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                >
                  ›
                </span>
                <span className={`text-[15px] tracking-tight ${
                  now || done ? 'font-bold text-slate-900' : 'font-semibold text-slate-400'
                }`}>
                  {p.name}
                </span>
                {needs > 0 && (
                  <span className="text-[10px] font-bold text-amber-700 border border-amber-200 bg-amber-50 rounded-md px-1.5 py-0.5">
                    {needs === 1 ? '1 needs you' : `${needs} need you`}
                  </span>
                )}
                <span className="text-[11px] text-slate-400 font-medium ml-auto">{p.eventNote}</span>
              </button>

              <div className={`grid transition-all duration-500 ease-out ${
                isOpen ? 'grid-rows-[1fr] opacity-100 mt-2.5' : 'grid-rows-[0fr] opacity-0'
              }`}>
                <div className="overflow-hidden">
                  <div className="flex flex-col gap-1.5">
                    {p.impact && filter === 'all' && (
                      <div className={`text-[11px] rounded-xl px-3 py-2.5 flex gap-2 items-start font-medium border ${
                        p.impact.tone === 'warn'
                          ? 'text-amber-800 bg-amber-50 border-amber-200'
                          : 'text-slate-500 bg-slate-50 border-slate-200'
                      }`}>
                        <span aria-hidden="true">{p.impact.tone === 'warn' ? '◆' : '◇'}</span>
                        <span>{p.impact.text}</span>
                      </div>
                    )}

                    {/* Sub-spine: the dated points inside this stage. The
                        stage itself carries only a month, because a stage is a
                        span; a milestone is the one thing in the programme that
                        genuinely happens on a day, so it gets the date. */}
                    {p.milestones.length > 0 && filter === 'all' && (
                      <ol className="relative ml-1.5 pl-4 border-l border-dashed border-slate-200 py-1 space-y-2">
                        {p.milestones.map(m => (
                          <li key={m.id} className="relative flex items-baseline gap-2.5">
                            <span
                              className={`absolute -left-[21px] top-1.5 w-1.5 h-1.5 rotate-45 ${
                                m.done ? 'bg-[#0066CC]' : 'bg-slate-300'
                              }`}
                              aria-hidden="true"
                            />
                            <span className="text-[10px] font-bold tabular-nums text-slate-500 w-14 shrink-0">
                              {m.date}
                            </span>
                            <span className={`text-[11px] font-semibold ${
                              m.done ? 'text-slate-800' : 'text-slate-500'
                            }`}>
                              {m.label}
                            </span>
                            {m.done && <span className="text-[10px] font-bold text-emerald-700">reached</span>}
                          </li>
                        ))}
                      </ol>
                    )}

                    {items.length === 0 && (
                      <p className="text-[11px] text-slate-400 font-medium px-1 py-1">
                        {filter === 'all'
                          ? 'Nothing filed against this stage yet.'
                          : 'Nothing of this kind at this stage.'}
                      </p>
                    )}

                    {items.map(a => (
                      <div
                        key={a.id}
                        className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border bg-white transition-all duration-200 hover:translate-x-1 ${
                          a.needsClient
                            ? 'border-amber-200 bg-amber-50/70 hover:shadow-[0_2px_10px_rgba(180,83,9,.08)]'
                            : 'border-slate-200 hover:border-sky-200 hover:shadow-[0_2px_10px_rgba(0,102,204,.06)]'
                        }`}
                      >
                        <span
                          className={`w-[26px] h-[26px] rounded-lg grid place-items-center text-[11px] shrink-0 ${
                            a.needsClient ? 'bg-white text-amber-700' : 'bg-slate-100 text-slate-500'
                          }`}
                          aria-hidden="true"
                        >
                          {ICON[a.kind]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-bold text-slate-900 truncate">{a.title}</p>
                          <p className="text-[11px] text-slate-500 font-medium mt-px">{a.subtitle}</p>
                        </div>
                        <div className="ml-auto flex gap-1.5 items-center shrink-0">
                          {a.doneNote && (
                            <span className="text-[11px] font-bold text-emerald-700">{a.doneNote}</span>
                          )}
                          {a.secondaryAction && (
                            <button
                              onClick={a.secondaryAction.run}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:border-sky-300 hover:text-[#0055B3] transition-colors cursor-pointer"
                            >
                              {a.secondaryAction.label}
                            </button>
                          )}
                          {a.action && (
                            <button
                              onClick={a.action.run}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                                a.needsClient
                                  ? 'bg-[#0066CC] text-white hover:bg-[#0055B3]'
                                  : 'border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-[#0055B3]'
                              }`}
                            >
                              {a.action.label}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
