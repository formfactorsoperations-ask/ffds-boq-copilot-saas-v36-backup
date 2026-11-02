import React, { useMemo, useState } from 'react';
import { LayoutGrid, Plus, Sparkles, RotateCcw } from '@/lib/lucide-shim';
import { inr } from '../../../lib/ownerReports';
import { shortDate, type Play } from '../../../lib/founderGoals';
import {
  simulate, bestMove, easiest, realityChecks, firstNewMonth, cardOf, USUAL_PACE, TERMS,
  type Card, type WhatIfInput, type MonthRow,
} from '../../../lib/whatIf';
import { Panel, Chip, Eyebrow, SmallButton, Empty, BRAND, TONE_HEX } from './ReportBits';
import { useFounderPlan, useGoalsReport } from './useFounderGoals';
import { SavedNote, FoundersOnly, PlanState, type FoundersTabProps } from './FoundersGoalsTab';
import '../../projectHeader/projectHeader.css';

/*
  WHAT IF: the founders' planning board (lib/whatIf has the arithmetic). From
  the mockup approved on 2 Nov 2026: one answer, three goals, a calendar (or a
  timeline) of the next twelve months, and cards to drag onto it: the real
  proposals in the pipeline, and new projects of each size. Tapping a card and
  then a month does the same on a phone. What is placed is saved with the
  founders' plan, for both of them, and never changes a project.
*/

const DRAG = 'application/x-ffds-whatif';
type Pick = { kind: 'pipe' | 'new'; ref: string } | { move: number };

const tileTone = (m: MonthRow, buffer: number) =>
  m.cash < 0 ? { box: 'bg-rose-50 border-rose-200', fig: 'text-rose-700', bar: TONE_HEX.bad }
    : m.cash >= buffer ? { box: 'bg-emerald-50 border-emerald-200', fig: 'text-emerald-700', bar: TONE_HEX.ok }
    : { box: 'bg-amber-50 border-amber-200', fig: 'text-amber-700', bar: TONE_HEX.warn };

export default function WhatIfTab(props: FoundersTabProps) {
  const { tenantId, me, all, facts, leads, leadsRead, targets, roster, canSetTargets, saveTargets, onGoals } = props;
  const { plan, set, status } = useFounderPlan(tenantId, me, targets, canSetTargets, saveTargets);
  const [now] = useState(() => Date.now());
  const { counted, report: r } = useGoalsReport({ all, facts, leads, leadsRead, targets, roster, plan, now });
  const [late, setLate] = useState(false);
  const [view, setView] = useState<'calendar' | 'timeline'>('calendar');
  const [picked, setPicked] = useState<Pick | null>(null);
  const [dragging, setDragging] = useState(false);

  const input: WhatIfInput | null = useMemo(() => (r && plan && plan.cash != null ? {
    now, cash: plan.cash, monthly: r.monthly, buffer: r.bufferTarget, goal: r.goal, facts: counted, bands: r.bands,
    pipeline: r.pipe.filter((p) => p.count === 1).map((p) => ({ id: p.id, name: p.name, value: p.value, margin: p.margin, odds: p.odds, stage: p.stage, signsBy: p.signsBy })),
    conv: r.conv, leadsPerMonth: r.leadsHave, cycleDays: r.funnel.cycle,
    capacity: Math.max(1, r.team.designers) * r.team.perDesigner,
  } : null), [r, plan, counted, now]);

  const plays = plan?.plays || [];
  const sim = useMemo(() => (input ? simulate(input, plays, late) : null), [input, plays, late]);
  const base = useMemo(() => (input ? simulate(input, [], late) : null), [input, late]);
  const checks = useMemo(() => (input && sim ? realityChecks(input, plays, sim, late) : []), [input, plays, sim, late]);
  const next = useMemo(() => (input ? bestMove(input, plays, late) : null), [input, plays, late]);

  if (!plan || !r) return <PlanState plan={plan} />;
  if (!input || !sim || !base) {
    return (
      <Panel icon={LayoutGrid} lift={false} title="What if needs one figure first" blurb="The cash the studio can spend today. The app cannot see the bank; enter it once in Founders' goals, and update it once a month.">
        <Empty>Cash is the starting point for every month on this board.{onGoals && <> <button type="button" className="font-bold text-[#3D52A0] hover:underline" onClick={onGoals}>Enter it in Founders' goals</button>.</>}</Empty>
      </Panel>
    );
  }

  const months = sim.months;
  const setPlays = (next: Play[]) => set({ plays: next });
  const placeAt = (k: number, what: Pick | null) => {
    if (!what) return;
    const key = months[k].key;
    if ('move' in what) setPlays(plays.map((p, j) => (j === what.move ? { ...p, month: key } : p)));
    else setPlays([...plays, { kind: what.kind, ref: what.ref, month: key }]);
    /* A proposal goes on the board once; a size card stays picked to place again. */
    if ('move' in what || what.kind === 'pipe') setPicked(null);
  };
  const drop = (k: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    try { placeAt(k, JSON.parse(e.dataTransfer.getData(DRAG))); } catch { /* not one of ours */ }
  };
  const dragStart = (what: Pick) => (e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG, JSON.stringify(what));
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  };
  const armed = !!picked || dragging;
  const used = new Set(plays.filter((p) => p.kind === 'pipe').map((p) => p.ref));
  const isPicked = (c: Card) => !!picked && !('move' in picked) && picked.kind === c.kind && picked.ref === c.ref;

  /* The answer. */
  const answer = sim.lasts ? 'Cash lasts the whole year' : `Cash runs short in ${months[sim.out as number].long}`;
  const gained = sim.reach - base.reach;
  const recovery = sim.out != null && sim.up != null ? `Back above zero in ${months[sim.up].label}${sim.again != null ? `, short again from ${months[sim.again].label}` : ''}. ` : '';
  const vsBase = plays.length
    ? (gained > 0 ? `${gained} ${gained === 1 ? 'month' : 'months'} longer than signed work alone${base.out != null ? ` (${months[base.out].long})` : ''}. ` : sim.reach === base.reach && !sim.lasts ? 'No better than signed work alone. ' : '')
    : 'Signed work alone. Drag a card onto a month to see what it does. ';
  const nq = sim.nextQuarter;
  const nqEndLabel = months[Math.min(sim.nqEnd, months.length - 1)].label;
  const badges = [
    { done: sim.lasts, title: 'Cash lasts the year', line: sim.lasts ? `Done: above zero to ${months[months.length - 1].label}` : `Short from ${months[sim.out as number].long}` },
    { done: sim.bufferOk, title: `Buffer back by ${nqEndLabel}`, line: sim.bufferOk ? `Done: over ${inr(r.bufferTarget)} by ${months[sim.back as number].label}` : sim.back != null ? `Only by ${months[sim.back].label}` : 'Not within the year' },
    { done: sim.goalOk, title: `${nq.label} goal met`, line: sim.goalOk ? `Done: ${inr(sim.nqMargin)} of margin` : `${inr(sim.nqMargin)} of ${inr(r.goal)}` },
  ];

  const nextLine = next
    ? `${next.play.kind === 'pipe' ? `Close ${cardOf(sim.cards, next.play)?.name}` : `Find a ${cardOf(sim.cards, next.play)?.label}`} to sign in ${months.find((m) => m.key === next.play.month)?.label}. ${next.win > 0 ? 'It ticks off another goal.' : next.reach > 0 ? (next.sim.lasts ? 'Cash then lasts the year.' : `Cash then holds until ${months[next.sim.out as number].long}.`) : `It adds ${inr(next.cash)} by the end of ${nq.label}.`}`
    : 'Every goal is ticked. Anything more is profit.';

  return (
    <div className="flex flex-col gap-4">
      <div className="pt-1 pb-3 border-b border-slate-200/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-bold text-slate-800">What if</span>
          <span className="text-xs text-slate-500">The next 12 months from {shortDate(now)} · a plan, not a report</span>
          <SavedNote status={status} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip tone="ok">Starting from {counted.length} counted {counted.length === 1 ? 'project' : 'projects'}, {inr(input.cash)} cash</Chip>
          <FoundersOnly />
        </div>
      </div>

      {/* The answer */}
      <section className="rp-frame bg-white rounded-2xl border border-slate-200 shadow-sm hud-panel-in px-6 py-5">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <Eyebrow>{plays.length === 1 ? 'If we sign this project' : plays.length ? `If we sign these ${plays.length} projects` : 'If we sign nothing new'}{late ? ', and clients pay a month late' : ''}</Eyebrow>
            <div key={answer} className={`hud-swap mt-2 text-3xl sm:text-4xl font-black tracking-tight ${sim.lasts ? (sim.bufferOk ? 'text-emerald-700' : 'text-slate-800') : 'text-rose-700'}`}>{answer}</div>
            <p className="text-sm text-slate-500 mt-1.5">{recovery}{vsBase}Cash at the end of {nq.label}: {inr(sim.cashAtNqEnd)}.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" role="switch" aria-checked={late} onClick={() => setLate((v) => !v)}
              className={`inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${late ? 'border-amber-500 text-amber-700' : 'border-slate-300 text-slate-700'}`}>
              <span className={`relative w-7 h-4 rounded-full transition-colors ${late ? 'bg-amber-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${late ? 'translate-x-3' : ''}`} />
              </span>
              Clients pay a month late
            </button>
            <SmallButton onClick={() => { setPlays([]); setPicked(null); }} disabled={!plays.length}><RotateCcw className="w-3 h-3 inline-block mr-1 -mt-px" />Start again</SmallButton>
            <button type="button" onClick={() => { setPlays(easiest(input, late)); setPicked(null); }}
              className="px-3 py-1.5 rounded-xl bg-[#3D52A0] text-white text-xs font-bold hover:bg-[#334486] whitespace-nowrap">
              <Sparkles className="w-3 h-3 inline-block mr-1 -mt-px" />Show me the easiest way
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {badges.map((b, k) => (
            <div key={b.title} className={`hud-row-in flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${b.done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-dashed border-slate-300 text-slate-500'}`} style={{ animationDelay: `${80 + k * 40}ms` }}>
              <span key={String(b.done)} className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${b.done ? 'phd-pop bg-emerald-600 text-white' : 'bg-slate-100'}`}>{b.done ? '✓' : '○'}</span>
              <div className="min-w-0"><div className="text-sm font-bold">{b.title}</div><div className="text-xs opacity-90">{b.line}</div></div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        {/* Calendar or timeline */}
        <section className="rp-frame bg-white rounded-2xl border border-slate-200 shadow-sm hud-panel-in p-5 sm:p-6" style={{ animationDelay: '60ms' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-bold text-slate-800">{view === 'timeline' ? 'Timeline' : 'Your next 12 months'}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {view === 'timeline' ? 'Every project running, signed and planned, with cash under them.'
                  : picked ? 'Now tap the month it signs.' : 'Drag a card from the right onto a month, or tap a card and then a month. Drag a placed card to move it.'}
              </p>
            </div>
            <div role="group" aria-label="View" className="inline-flex p-1 rounded-xl bg-slate-100">
              {(['calendar', 'timeline'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${view === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{v === 'calendar' ? 'Calendar' : 'Timeline'}</button>
              ))}
            </div>
          </div>

          {view === 'calendar' ? (
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5">
              {months.map((m, k) => {
                const t = tileTone(m, r.bufferTarget);
                const here = plays.map((p, j) => ({ p, j, c: cardOf(sim.cards, p) })).filter((x) => x.p.month === m.key && x.c);
                const flags: [string, 'bad' | 'warn' | 'none'][] = [];
                if (sim.out === k) flags.push(['Cash runs out', 'bad']);
                if (m.live > input.capacity) flags.push([`Team over: ${m.live} live`, 'warn']);
                if (m.signings > USUAL_PACE) flags.push([`${m.signings} signings: a stretch`, 'warn']);
                for (const h of m.handovers) if (flags.length < 2) flags.push([`${h} hands over`, 'none']);
                return (
                  <div key={m.key} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={drop(k)}
                    onClick={() => picked && placeAt(k, picked)}
                    className={`hud-row-in min-w-0 rounded-xl border p-2.5 sm:p-3 min-h-[120px] sm:min-h-[140px] transition-shadow ${t.box} ${armed ? 'cursor-pointer ring-1 ring-[#3D52A0]/30 hover:ring-2 hover:ring-[#3D52A0]' : ''}`}
                    style={{ animationDelay: `${Math.min(k, 11) * 25}ms` }}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-slate-800">{m.short}</span>
                      <span className={`text-sm font-black tabular-nums ${t.fig}`}>{inr(m.cash)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">In {inr(m.inSigned + m.inNew)} · out {inr(m.cost + m.fixed)}</div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {here.map(({ p, j, c }) => (
                        <div key={j} draggable onDragStart={dragStart({ move: j })} onDragEnd={() => setDragging(false)}
                          className={`phd-pop flex items-center justify-between gap-1.5 rounded-lg border bg-white pl-2.5 pr-1 py-1 text-xs font-bold cursor-grab ${c!.kind === 'pipe' ? 'border-emerald-200 text-emerald-700' : 'border-[#3D52A0]/30 text-[#3D52A0]'} ${c!.kind === 'new' && k < firstNewMonth(input) ? 'border-dashed' : ''}`}>
                          <span className="truncate">{c!.label}</span>
                          <button type="button" aria-label={`Take back ${c!.label}`} onClick={(e) => { e.stopPropagation(); setPlays(plays.filter((_, i) => i !== j)); }}
                            className="px-1.5 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50">×</button>
                        </div>
                      ))}
                      {armed && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); placeAt(k, picked); }}
                          className="rounded-lg border border-dashed border-[#3D52A0]/40 py-1 text-[11px] font-bold text-[#3D52A0]">
                          <Plus className="w-3 h-3 inline-block -mt-px" /> Drop here
                        </button>
                      )}
                    </div>
                    {flags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{flags.slice(0, 2).map(([f, tone]) => <Chip key={f} tone={tone}>{f}</Chip>)}</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <Timeline sim={sim} buffer={r.bufferTarget} />
          )}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: TONE_HEX.ok }} />Safe: over the {inr(r.bufferTarget)} buffer</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: TONE_HEX.warn }} />Under the buffer</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: TONE_HEX.bad }} />Out of cash</span>
          </div>
        </section>

        {/* The tray, and the checks */}
        <aside className="flex flex-col gap-4 order-first xl:order-none">
          <section className="rp-frame bg-white rounded-2xl border border-slate-200 shadow-sm hud-panel-in p-4" style={{ animationDelay: '100ms' }}>
            <Eyebrow>From your pipeline</Eyebrow>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-2.5">Real proposals. Drag one to the month you expect it to sign.</p>
            {sim.cards.pipe.length === 0 ? <Empty>No open proposals on counted projects.</Empty> : (
              <div className="flex flex-col gap-2">
                {sim.cards.pipe.map((c) => {
                  const on = used.has(c.ref);
                  return (
                    <button key={c.ref} type="button" draggable={!on} disabled={on} aria-pressed={isPicked(c)}
                      onDragStart={dragStart({ kind: c.kind, ref: c.ref })} onDragEnd={() => setDragging(false)}
                      onClick={() => setPicked(isPicked(c) ? null : { kind: c.kind, ref: c.ref })}
                      className={`text-left rounded-xl border px-3 py-2.5 transition-[border-color,box-shadow,transform] ${on ? 'opacity-50 cursor-default border-slate-200' : isPicked(c) ? 'border-[#3D52A0] ring-[3px] ring-[#3D52A0]/15 -translate-y-0.5 cursor-grab' : 'border-slate-200 hover:-translate-y-0.5 hover:shadow-md cursor-grab'}`}>
                      <span className="flex items-baseline justify-between gap-2"><span className="text-sm font-bold text-slate-800 truncate">{c.name}</span><span className="text-sm font-black text-slate-800 tabular-nums">{inr(c.value)}</span></span>
                      <span className="block text-[11px] text-slate-500">{c.stage} · {Math.round((c.odds || 0) * 100)}% · {on ? 'on the board' : `usually signs by ${c.signsBy ? shortDate(c.signsBy) : 'soon'}`}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-4"><Eyebrow>New projects</Eyebrow></div>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-2.5">Ones you still have to find. Drag as many as you like.</p>
            <div className="grid grid-cols-2 gap-2">
              {sim.cards.sizes.map((c) => (
                <button key={c.ref} type="button" draggable aria-pressed={isPicked(c)}
                  onDragStart={dragStart({ kind: c.kind, ref: c.ref })} onDragEnd={() => setDragging(false)}
                  onClick={() => setPicked(isPicked(c) ? null : { kind: c.kind, ref: c.ref })}
                  className={`text-left rounded-xl border px-3 py-2.5 cursor-grab transition-[border-color,box-shadow,transform] ${isPicked(c) ? 'border-[#3D52A0] ring-[3px] ring-[#3D52A0]/15 -translate-y-0.5' : 'border-slate-200 hover:-translate-y-0.5 hover:shadow-md'}`}>
                  <span className="block text-lg font-black text-slate-800 leading-tight">{inr(c.value)}</span>
                  <span className="block text-xs font-semibold text-slate-700">{c.name}</span>
                  <span className="block text-[11px] text-slate-500">{inr(c.margin)} margin · {c.months} mo</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">A new project pays {TERMS.adv}% when it signs, {TERMS.mid}% as the work goes and {TERMS.end}% at handover. Sizes, margins and runs come from Projects by size in Founders' goals.</p>
          </section>

          <section className="rp-frame bg-white rounded-2xl border border-slate-200 shadow-sm hud-panel-in p-4" style={{ animationDelay: '140ms' }}>
            <Eyebrow>Reality check</Eyebrow>
            <div className="mt-1.5">
              {checks.map((c, k) => (
                <div key={c.title} className={`hud-row-in flex gap-2.5 items-start py-2 ${k < checks.length - 1 ? 'border-b border-slate-100' : ''}`} style={{ animationDelay: `${k * 30}ms` }}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 mt-px ${c.tone === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{c.tone === 'ok' ? '✓' : '!'}</span>
                  <div className="min-w-0"><div className="text-[13px] font-bold text-slate-800">{c.title}</div><div className="text-[11px] text-slate-500">{c.line}</div></div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(61,82,160,0.06)' }}>
              <div className="text-xs font-bold text-slate-800">Next best move</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{nextLine}</div>
              {next && <SmallButton className="mt-2" onClick={() => setPlays([...plays, next.play])}>Do it</SmallButton>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Timeline({ sim, buffer }: { sim: ReturnType<typeof simulate>; buffer: number }) {
  const months = sim.months;
  const colour = { signed: 'bg-slate-200 text-slate-700', pipe: 'bg-emerald-100 text-emerald-700', new: 'text-white' } as const;
  return (
    <div className="mt-4 overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[160px_repeat(12,minmax(0,1fr))] items-center">
          <span />
          {months.map((m) => <span key={m.key} className="text-center text-[11px] font-bold text-slate-500">{m.label}</span>)}
        </div>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {sim.bars.map((b, k) => (
            <div key={`${b.name}-${k}`} className="grid grid-cols-[160px_repeat(12,minmax(0,1fr))] items-center h-6">
              <span className="text-xs font-semibold text-slate-800 truncate pr-2">{b.name}{b.odds != null ? ` (${Math.round(b.odds * 100)}%)` : ''}</span>
              <span className={`rp-hbar h-[22px] rounded-md px-2 flex items-center text-[11px] font-bold whitespace-nowrap overflow-hidden ${colour[b.kind]}`}
                style={{ gridColumn: `${b.from + 2} / ${b.to + 3}`, background: b.kind === 'new' ? BRAND : undefined, animationDelay: `${k * 30}ms` }}
                title={b.kind === 'signed' ? `${b.name}${b.handover ? ` hands over in ${months[b.to].label}` : ''}` : `${b.name}: ${inr(b.value * TERMS.adv / 100)} advance in ${months[b.from].label}`}>
                {b.to - b.from < 1 ? '' : b.kind === 'signed' ? (b.handover ? `hands over ${months[b.to].label}` : '') : `advance ${inr(b.value * TERMS.adv / 100)}`}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-[160px_repeat(12,minmax(0,1fr))] gap-[3px] items-center">
          <Eyebrow>Cash at month end</Eyebrow>
          {months.map((m) => <span key={m.key} className="h-2 rounded" title={`${m.short}: ${inr(m.cash)}`} style={{ background: m.cash < 0 ? TONE_HEX.bad : m.cash >= buffer ? TONE_HEX.ok : TONE_HEX.warn }} />)}
        </div>
      </div>
    </div>
  );
}
