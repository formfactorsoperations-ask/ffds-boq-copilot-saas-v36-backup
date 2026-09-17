import React, { useMemo, useState } from 'react';
import MilestoneIcon from '../MilestoneIcon';
import { ChevronDown } from 'lucide-react';
import { PaymentMilestone, ProjectDecisionRecord } from '../../types';
import { formatINR } from '../../lib/utils';
import { toDayNum, toISO } from '../../lib/schedule';
import { Programme } from './programme';
import { milestonePlacement, RETENTION_DAYS_AFTER_HANDOVER } from './spineModel';

/**
 * One timeline, three tracks: studio work, the client's decisions, the client's
 * payments — all on the same real calendar.
 *
 * Two things were wrong here and both came from the same cause. The bars were
 * labelled "stage 1..6" over an axis of six equal blocks, and the markers were
 * spread by array index — seven milestones became seven equally spaced diamonds
 * that looked like a schedule and were not one. Both happened because this read
 * `projectData.timeline`, the legacy relative-day array, which is empty on any
 * project using the real scheduler.
 *
 * It now takes the same computed programme the spine uses, so a bar sits where
 * the studio's own Timeline says it sits, and a payment lands on the date its
 * trigger actually falls. Where the schedule has no dates the chart says so
 * rather than drawing a calendar nobody committed to.
 */

interface Props {
  programme: Programme;
  milestones: PaymentMilestone[];
  decisions: ProjectDecisionRecord[];
  milestoneAmount: (m: PaymentMilestone) => number;
  /** Stage a milestone belongs to, shared with the spine so the two agree. */
  stageOfMilestone: (m: PaymentMilestone, index: number) => number;
}

interface Mark {
  key: string;
  day: number;
  label: string;
  detail: string;
  done: boolean;
  /** True when the position came from the item's own date, not its stage. */
  exact: boolean;
  /** Payments only — lets a cluster show what it is worth. */
  amount?: number;
  /** The trigger in the studio's own words, for the roll-up. */
  note?: string;
}

const dayOf = (v?: string | null): number | null => {
  if (!v) return null;
  const iso = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = toDayNum(iso);
  return Number.isFinite(d) ? d : null;
};

/** ₹2,45,708 → ₹2.46L. A chart wants a magnitude, not an exact rupee. */
const short = (n: number): string => {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n % 1e7 === 0 ? 0 : 2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(n % 1e5 === 0 ? 0 : 2)}L`;
  if (n >= 1e3) return `₹${Math.round(n / 1e3)}k`;
  return `₹${n}`;
};

/**
 * Markers that land within a hair of each other on the axis, gathered up.
 *
 * Five of this project's nine payments trigger "around 5 Aug", so as separate
 * lanes they became five rows of prose running off both edges of the chart —
 * every trigger sentence printed in full, overlapping, unreadable. A cluster is
 * one chip carrying the count and the total; the detail belongs in the roll-up
 * underneath, where there is room for it.
 */
interface Cluster { key: string; day: number; items: Mark[]; total: number }

const clusterMarks = (marks: Mark[], span: number): Cluster[] => {
  const sorted = [...marks].sort((a, b) => a.day - b.day);
  const gap = Math.max(6, span * 0.035);
  const out: Cluster[] = [];
  sorted.forEach(m => {
    const last = out[out.length - 1];
    if (last && m.day - last.items[last.items.length - 1].day <= gap) {
      last.items.push(m);
      last.day = Math.round(last.items.reduce((t, i) => t + i.day, 0) / last.items.length);
      last.total += m.amount || 0;
    } else {
      out.push({ key: m.key, day: m.day, items: [m], total: m.amount || 0 });
    }
  });
  return out;
};

const fmt = (day: number) =>
  new Date(day * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "14 Sept" — a day on the chart, where the year is already obvious. */
const dayShort = (day: number) =>
  new Date(day * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function PortalTimeline({
  programme, milestones, decisions, milestoneAmount, stageOfMilestone,
}: Props) {
  const [focus, setFocus] = useState<{ key: string; title: string; detail: string } | null>(null);
  /** Which cluster has been dropped open. One at a time — this is a chart. */
  const [openCluster, setOpenCluster] = useState<string | null>(null);

  /**
   * The axis spans the programme *and* everything real that sits outside it.
   *
   * A decision raised on 27 July fell off the chart entirely, because the
   * derived programme only reaches back as far as the current stage. Dropping a
   * record for being early is worse than widening the axis by a month: the
   * client knows the decision exists, and a timeline that quietly omits it
   * reads as broken.
   */
  const axis = useMemo(() => {
    const days: number[] = [programme.startDay, programme.endDay];
    decisions.forEach(d => {
      const v = dayOf(d.clientConfirmedAt) ?? dayOf(d.date);
      if (v !== null) days.push(v);
    });
    milestones.forEach(m => {
      const v = dayOf(m.invoiceDate) ?? dayOf(m.date);
      if (v !== null) days.push(v);
    });
    // Snap out to whole months. Starting the axis on the earliest record put
    // the 1st-of-month gridlines for that month behind the left edge, so Jul
    // and Aug were squeezed into a few pixels while later months were full
    // width — the axis was linear, the columns just had nowhere to begin.
    const min = Math.min(...days);
    const max = Math.max(...days);
    const startOfMonth = (d: number) => {
      const dt = new Date(toISO(d) + 'T00:00:00Z');
      return toDayNum(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1)).toISOString().slice(0, 10));
    };
    const endOfMonth = (d: number) => {
      const dt = new Date(toISO(d) + 'T00:00:00Z');
      return toDayNum(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).toISOString().slice(0, 10));
    };
    return { start: startOfMonth(min), end: endOfMonth(max) };
  }, [programme, decisions, milestones]);

  const span = Math.max(1, axis.end - axis.start);
  const pct = (day: number) => Math.max(0, Math.min(100, ((day - axis.start) / span) * 100));

  /** Month ticks across the widened axis, not the programme's own span. */
  const months = useMemo(() => {
    const out: { label: string; day: number }[] = [];
    const first = new Date(toISO(axis.start) + 'T00:00:00Z');
    const cur = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    while (toDayNum(cur.toISOString().slice(0, 10)) <= axis.end && out.length < 36) {
      const iso = cur.toISOString().slice(0, 10);
      out.push({
        label: new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
        day: toDayNum(iso),
      });
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return out;
  }, [axis]);

  /**
   * Where an undated milestone sits inside the stage that owns it.
   *
   * Every one of them used to be pinned to the stage's START date, so the five
   * execution milestones of a six-month build all landed on the same day. They
   * are now spread through the stage window by their cumulative share of that
   * stage's value — which is what a payment schedule actually describes: money
   * released as the work progresses, not all of it on day one.
   */
  const placeInStage = (n: number, share: number) => {
    const st = programme.stages.find(x => x.stageNumber === n);
    if (!st) return programme.startDay;
    const width = Math.max(0, st.endDay - st.startDay);
    return Math.round(st.startDay + width * Math.min(1, Math.max(0, share)));
  };

  /* A decision sits on the day it was raised. Where that is missing it falls
     to the start of the stage that owns it, and the tooltip says "in" rather
     than naming a date the record does not have. */
  const decisionMarks: Mark[] = useMemo(() => {
    if (!programme.dated) return [];
    return decisions.map(d => {
      const own = dayOf(d.clientConfirmedAt) ?? dayOf(d.date);
      return {
        key: `dec-${d.id}`,
        day: own ?? programme.stages.find(s => s.status === 'active')?.startDay ?? programme.startDay,
        label: d.title,
        detail: d.status === 'confirmed'
          ? `Approved${d.clientConfirmedAt ? ` ${fmt(dayOf(d.clientConfirmedAt)!)}` : ''}`
          : own ? `Waiting on you · raised ${fmt(own)}` : 'Waiting on you',
        done: d.status === 'confirmed',
        exact: own !== null,
      };
    });
  }, [decisions, programme]);

  const paymentMarks: Mark[] = useMemo(() => {
    if (!programme.dated) return [];

    // Cumulative share within each stage, so the nth milestone of a stage sits
    // n-of-total of the way through it rather than on its first day.
    const perStage = new Map<number, PaymentMilestone[]>();
    milestones.forEach((m, i) => {
      const st = stageOfMilestone(m, i);
      if (!perStage.has(st)) perStage.set(st, []);
      perStage.get(st)!.push(m);
    });

    return milestones.map((m, i) => {
      const own = dayOf(m.invoiceDate) ?? dayOf(m.date);
      const st = stageOfMilestone(m, i);
      const place = milestonePlacement(m);
      // -1 means "position me among my peers"; anything else is a fixed point
      // in the stage — a design fee at its start, retention past its end.
      const peers = perStage.get(st) || [m];
      const at = peers.indexOf(m);
      const seqShare = peers.length <= 1 ? 0.5 : (at + 0.5) / peers.length;
      const share = place.share >= 0 ? place.share : seqShare;
      const day = own ?? (placeInStage(st, share) + place.offsetDays);
      return {
        key: `pay-${m.id}`,
        day,
        label: m.name,
        detail: `${formatINR(milestoneAmount(m))} · ${
          m.status === 'paid' ? `cleared${own ? ` ${fmt(own)}` : ''}`
          : m.status === 'invoiced' ? `invoiced${own ? ` ${fmt(own)}` : ''} — due`
          : `${m.trigger || 'not yet due'}${own ? ` · ${fmt(own)}` : ` · around ${fmt(day)}`}`
        }`,
        done: m.status === 'paid',
        exact: own !== null,
        amount: milestoneAmount(m),
        note: m.trigger || undefined,
      };
    });
  }, [milestones, programme, milestoneAmount, stageOfMilestone]);

  const decisionClusters = useMemo(() => clusterMarks(decisionMarks, span), [decisionMarks, span]);
  const paymentClusters = useMemo(() => clusterMarks(paymentMarks, span), [paymentMarks, span]);

  const dim = (key: string) => (focus && focus.key !== key ? 'opacity-20 saturate-50' : '');

  if (!programme.dated) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center">
        <p className="text-sm font-bold text-slate-800">No dated programme yet</p>
        <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
          Your studio has not published a schedule for this project. As soon as it does, this
          becomes a live calendar showing the work, the decisions we need from you and when each
          payment falls — all on one axis.
        </p>
      </div>
    );
  }

  const Track: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex border-b border-slate-100 last:border-b-0">
      <div className="w-[110px] shrink-0 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 bg-white border-r border-slate-100">
        {label}
      </div>
      <div className="flex-1 relative py-2 min-w-0">
        {/* Positioned by date, not by equal shares. Rendering the months as
            flex-1 columns put February's boundary at the same width as
            January's while the bars used a real day scale — so every gridline
            was a little to the left or right of the month it claimed. */}
        <div className="absolute inset-0 pointer-events-none">
          {months.map(m => (
            <span
              key={m.day}
              className="absolute top-0 bottom-0 border-l border-slate-100"
              style={{ left: `${pct(m.day)}%` }}
            />
          ))}
        </div>
        {children}
      </div>
    </div>
  );

  /*
    The key dates, flattened out of the stages that carry them.

    `ProgrammeStage.milestones` has been computed since the programme view was
    written and rendered nowhere, so the client never saw their own Design Gate
    or Handover — the two dates in the whole schedule they are most likely to be
    looking for. They do not belong inside a 38px stage row next to its date
    label; they are points, and they get their own lane.

    `row` is a two-level collision pass: two flags closer together than a tenth
    of the axis would print their labels on top of each other, so the later one
    drops a line. Beyond two, they stack again from the top — three key dates in
    one week is not a programme anyone is reading off a chart.
  */
  /* Plain, not memoised: this sits below the "no dated programme" early
     return, and a hook here would be a conditional hook. It is two array
     passes over a handful of milestones. */
  const keyDates = (() => {
    const all = programme.stages
      .filter(s => s.hasSchedule)
      .flatMap(s => s.milestones)
      .filter(m => m.day >= axis.start && m.day <= axis.end)
      .sort((a, b) => a.day - b.day);
    let lastLeft = -Infinity;
    let row = 0;
    return all.map(m => {
      const left = pct(m.day);
      if (left - lastLeft < 10) row = (row + 1) % 2; else row = 0;
      lastLeft = left;
      return { ...m, left, row };
    });
  })();

  /* The next one still ahead — the single date worth answering "when" with. */
  const nextKeyDate = keyDates.find(m => !m.done && m.day >= programme.todayDay);

  const daysAway = (day: number) => Math.round(day - programme.todayDay);

  const todayPct = pct(programme.todayDay);
  const todayInRange = programme.todayDay >= axis.start && programme.todayDay <= axis.end;

  return (
    <div className="space-y-3">
      <div className="flex gap-4 flex-wrap text-[11px] font-semibold text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-1.5 rounded bg-[#3D52A0] inline-block" />Studio work</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Your decisions</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rotate-45 bg-violet-500 inline-block" />Your payments</span>
        {keyDates.length > 0 && (
          <span className="inline-flex items-center gap-1.5"><span className="ff-flag text-green-500" />Key dates</span>
        )}
        {/* The one line most clients open this page to read. */}
        {nextKeyDate && (
          <span className="inline-flex items-center gap-1.5 text-green-700">
            Next: <b className="font-black">{nextKeyDate.label}</b>
            <span className="font-medium text-slate-400">
              {fmt(nextKeyDate.day)}
              {daysAway(nextKeyDate.day) === 0
                ? ' · today'
                : ` · in ${daysAway(nextKeyDate.day)} day${daysAway(nextKeyDate.day) === 1 ? '' : 's'}`}
            </span>
          </span>
        )}
      </div>

      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[720px] relative">
            {/* Month header, from the schedule's own span. */}
            <div className="flex border-b border-slate-100 bg-slate-50/70">
              <div className="w-[110px] shrink-0 px-3 py-2 text-[10px] font-bold text-slate-500 border-r border-slate-100">
                {programme.published ? 'Programme' : 'Indicative'}
              </div>
              <div className="flex-1 relative py-2 h-[30px]">
                {months.map(m => (
                  <div
                    key={m.day}
                    className="absolute top-0 bottom-0 pl-1.5 flex items-center border-l border-slate-100 text-[10px] font-bold text-slate-400 whitespace-nowrap"
                    style={{ left: `${pct(m.day)}%` }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Today, drawn over every track rather than inside one. */}
            {todayInRange && (
              <div
                className="absolute top-8 bottom-0 w-0.5 bg-amber-400/70 z-20 pointer-events-none"
                style={{ left: `calc(110px + (100% - 110px) * ${todayPct / 100})` }}
              >
                <span className="absolute -top-1 left-1.5 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 whitespace-nowrap">
                  Today
                </span>
              </div>
            )}

            <Track label="Work">
              {programme.stages.map((s, i) => {
                const left = pct(s.startDay);
                const width = Math.max(1.5, pct(s.endDay) - left);
                // A one-week stage on a six-month axis is ~4% wide, which fits
                // no label at all — the names were being clipped mid-word
                // ("2. Scope & Ter"). Below the threshold the bar keeps its
                // position and the name sits beside it.
                const inside = width >= 14;
                /*
                  Where the stage stands, in the client's language.

                  The bar already says this in colour, which is a legend the
                  reader has to hold in their head. The word costs nothing and
                  removes the guess.
                */
                const standing = s.status === 'completed'
                  ? 'Completed'
                  : s.status === 'active' ? 'In progress' : 'Not started';

                /*
                  A stage still open past the date it was meant to end has
                  already pushed the dates below it, so the client is looking at
                  a later handover than they were last month. Saying which stage
                  did it is the difference between a programme that moved and a
                  programme that explains itself. No day count — the dates on the
                  chart are the answer, and a number here reads as a bill.
                */
                const detail = s.hasSchedule
                  ? `${standing} · ${fmt(s.startDay)} → ${fmt(s.endDay)}${s.runningLate ? ' · running later than planned' : ''}`
                  : `expected around ${fmt(s.startDay)} — not scheduled yet`;
                const on = () => setFocus({ key: `st-${s.stageNumber}`, title: s.name, detail });
                const off = () => setFocus(null);
                const short = (d: number) =>
                  new Date(d * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
                return (
                  <div key={s.stageNumber} className="relative h-[38px]">
                    <button
                      onMouseEnter={on} onMouseLeave={off} onFocus={on} onBlur={off}
                      aria-label={`${s.name} — ${detail}`}
                      style={{ left: `${left}%`, width: `${width}%`, animationDelay: `${Math.min(i, 8) * 70}ms` }}
                      /*
                        Stages arrive in order, a beat apart.

                        The programme is a sequence, and having it draw itself
                        left to right says so before a single date is read. The
                        delay is capped so a long project does not keep the
                        client waiting on an animation.
                      */
                      className={`pt-stage absolute top-1.5 h-5 rounded-md flex items-center transition-all cursor-default ${
                        inside ? 'px-2' : ''
                      } ${
                        s.runningLate ? 'ring-1 ring-amber-400/70 ring-offset-1 ring-offset-white ' : ''
                      }${
                        // Dashed and hollow: placed in the gap between scheduled
                        // stages, not a duration the studio has committed to.
                        !s.hasSchedule
                          ? 'bg-transparent border border-dashed border-sky-300'
                          : s.status === 'pending'
                            ? 'bg-sky-100 border border-sky-200'
                            : s.status === 'completed'
                              ? 'bg-[#3D52A0]/45'
                              : 'bg-[#3D52A0]'
                      } ${dim(`st-${s.stageNumber}`)}`}
                    >
                      {inside && (
                        <span className={`text-[10px] font-bold truncate ${
                          s.status === 'pending' ? 'text-[#334486]' : 'text-white'
                        }`}>
                          {s.name}
                        </span>
                      )}
                    </button>
                    {!inside && (
                      <span
                        style={{ left: `calc(${left + width}% + 6px)` }}
                        className={`absolute top-1.5 h-5 flex items-center text-[10px] font-bold whitespace-nowrap pointer-events-none ${
                          s.status === 'pending' ? 'text-slate-400' : 'text-slate-600'
                        } ${dim(`st-${s.stageNumber}`)}`}
                      >
                        {s.name}
                      </span>
                    )}

                    {/* The dates, on the chart.
                        Every date used to live in the hover strip, so a client
                        reading their own programme learned nothing without a
                        mouse — and nothing at all on a phone. */}
                    <span
                      style={{
                        left: `${left}%`,
                        color: s.runningLate ? '#d97706' : s.hasSchedule ? '#3D52A0' : '#cbd5e1',
                        /* Offset per stage so the column breathes instead of
                           pulsing in unison. */
                        ['--ff-delay' as string]: `-${(i * 430) % 5200}ms`,
                      } as React.CSSProperties}
                      className={`ff-banner-wrap absolute top-[25px] pointer-events-none ${dim(`st-${s.stageNumber}`)}`}
                    >
                      <span className="ff-banner-pole" />
                      <span className={`ff-banner text-[10px] font-semibold tabular-nums whitespace-nowrap ${
                        s.runningLate
                          ? 'bg-amber-50 text-amber-800'
                          : s.hasSchedule ? 'bg-slate-100 text-slate-500' : 'bg-slate-50 text-slate-300 italic'
                      }`}>
                        {s.hasSchedule ? `${short(s.startDay)} – ${short(s.endDay)}` : `~ ${short(s.startDay)}`}
                        {s.hasSchedule && (
                          <span className={s.status === 'completed' ? 'text-emerald-600' : ''}>
                            · {standing}
                          </span>
                        )}
                        {s.runningLate && <span className="font-bold">· running later than planned</span>}
                      </span>
                    </span>
                  </div>
                );
              })}
            </Track>

            {/* Key dates.

                A flag rather than a diamond, because a flag is planted at a
                point — which is what a zero-duration milestone is — and because
                one that moves picks itself out of a static chart without
                needing a colour nobody has been taught. The pole sits exactly
                on the date; the label leans away from whichever edge is
                nearer, so nothing runs off the chart. */}
            {keyDates.length > 0 && (
              <Track label="Key dates">
                <div className="relative h-11">
                  {keyDates.map(m => {
                    const away = daysAway(m.day);
                    const detail = m.done
                      ? `Reached ${fmt(m.day)}`
                      : `${fmt(m.day)}${away === 0 ? ' · today' : away > 0
                          ? ` · in ${away} day${away === 1 ? '' : 's'}`
                          : ` · ${-away} day${away === -1 ? '' : 's'} ago, not yet marked complete`}`;
                    const flip = m.left > 78;
                    /*
                      Grey for what is behind us, light green for what is ahead,
                      amber for a date that has passed without being marked
                      reached. Three states a client can read without being
                      taught a legend, and a green light enough that a programme
                      of nothing but future dates stays calm.
                    */
                    const tone = m.done
                      ? { pole: '#94a3b8', ink: 'text-slate-400', name: 'text-slate-500' }
                      : away < 0
                        ? { pole: '#d97706', ink: 'text-amber-700', name: 'text-amber-900' }
                        : { pole: '#22c55e', ink: 'text-green-700', name: 'text-green-900' };
                    const on = () => setFocus({ key: `ms-${m.id}`, title: m.label, detail });
                    const off = () => setFocus(null);
                    return (
                      <button
                        key={m.id}
                        onMouseEnter={on} onMouseLeave={off} onFocus={on} onBlur={off}
                        aria-label={`${m.label} — ${detail}`}
                        style={{ left: `${m.left}%`, top: m.row === 0 ? 2 : 22, color: tone.pole }}
                        className={`absolute z-10 flex items-start gap-1 cursor-default ${
                          flip ? 'flex-row-reverse -translate-x-full' : ''
                        } ${dim(`ms-${m.id}`)}`}
                      >
                        <span className={`ff-flag${m.id === nextKeyDate?.id ? ' ff-flag--next' : ''}`} />
                        <span className="flex flex-col items-start leading-tight -mt-0.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold whitespace-nowrap ${tone.name}`}>
                            {/* Which date, not just that there is one. */}
                            <MilestoneIcon label={m.label} className="w-3 h-3 shrink-0" />
                            {m.label}
                          </span>
                          <span className={`text-[9px] font-semibold tabular-nums whitespace-nowrap ${tone.ink}`}>
                            {dayShort(m.day)}
                            {m.done ? ' · reached' : away === 0 ? ' · today' : away > 0 ? ` · in ${away}d` : ' · overdue'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Track>
            )}

            {/* Decisions and payments as clustered chips.

                One lane per item put every trigger sentence on the chart in
                full — five payments all triggering "around 5 Aug" became five
                overlapping rows of prose running off both edges. A chip states
                the magnitude; the roll-up below carries the words. */}
            {([
              { label: 'Your decisions', clusters: decisionClusters, kind: 'decision' as const,
                empty: 'None raised with you yet' },
              { label: 'Your payments', clusters: paymentClusters, kind: 'payment' as const,
                empty: 'No milestones set' },
            ]).map(track => (
              <Track key={track.label} label={track.label}>
                <div className="relative h-11">
                  {track.clusters.length === 0 && (
                    <span className="absolute left-2 top-3 text-[11px] text-slate-400 font-medium">{track.empty}</span>
                  )}
                  {track.clusters.map(c => {
                    const left = pct(c.day);
                    const many = c.items.length > 1;
                    const open = openCluster === c.key;
                    const allDone = c.items.every(i => i.done);
                    const label = track.kind === 'payment'
                      ? (many ? `${short(c.total)} · ${c.items.length}` : short(c.total))
                      : (many ? `${c.items.length} decisions` : c.items[0].label);
                    return (
                      <button
                        key={c.key}
                        onClick={() => setOpenCluster(open ? null : c.key)}
                        aria-expanded={open}
                        style={{ left: `${left}%` }}
                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5
                                    rounded-full pl-1.5 pr-2.5 py-1 text-[10px] font-bold whitespace-nowrap
                                    border transition-all cursor-pointer hover:shadow-md hover:-translate-y-[calc(50%+1px)] ${
                          open ? 'ring-2 ring-offset-1 ring-[#3D52A0] ' : ''
                        }${
                          allDone
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : track.kind === 'payment'
                              ? 'bg-violet-50 border-violet-200 text-violet-900'
                              : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        <span className={`w-2 h-2 shrink-0 ${
                          track.kind === 'payment' ? 'rotate-45' : 'rounded-full'
                        } ${allDone ? 'bg-emerald-600' : track.kind === 'payment' ? 'bg-violet-500' : 'bg-amber-500'}`} />
                        {label}
                        {many && <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />}
                      </button>
                    );
                  })}
                </div>
              </Track>
            ))}
          </div>
        </div>
      </div>

      {/* The roll-up.

          The chart gives magnitude and position; this gives the words. Opening
          a chip drops its contents here rather than printing a paragraph on the
          axis, which is what made the payments track unreadable. */}
      {openCluster && (() => {
        const c = [...decisionClusters, ...paymentClusters].find(x => x.key === openCluster);
        if (!c) return null;
        const isPayment = paymentClusters.some(x => x.key === openCluster);
        return (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-slate-50 border-b border-slate-100">
              <p className="text-[11px] font-bold text-slate-700">
                {fmt(c.day)}
                {c.items.length > 1 && <span className="text-slate-400 font-semibold"> · {c.items.length} items</span>}
                {isPayment && c.total > 0 && (
                  <span className="text-slate-400 font-semibold"> · {formatINR(c.total)} in total</span>
                )}
              </p>
              <button
                onClick={() => setOpenCluster(null)}
                className="text-[11px] font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                Close
              </button>
            </div>
            <ul className="divide-y divide-slate-50">
              {c.items.map(i => (
                <li key={i.key} className="px-3.5 py-2.5 flex items-start gap-3">
                  <span className={`mt-1 w-2 h-2 shrink-0 ${isPayment ? 'rotate-45' : 'rounded-full'} ${
                    i.done ? 'bg-emerald-600' : isPayment ? 'bg-violet-500' : 'bg-amber-500'
                  }`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900">{i.label}</span>
                    {i.note && <span className="block text-[11px] text-slate-500 leading-relaxed mt-0.5">{i.note}</span>}
                    <span className="block text-[10px] text-slate-400 font-semibold mt-0.5">
                      {i.exact ? fmt(i.day) : `around ${fmt(i.day)}`}
                      {i.done ? ' · cleared' : ''}
                    </span>
                  </span>
                  {typeof i.amount === 'number' && i.amount > 0 && (
                    <span className="text-xs font-extrabold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatINR(i.amount)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {!openCluster && (
        <p className="text-[11px] text-slate-400 font-medium">
          Select any marker to see what it covers.
        </p>
      )}

      {/* What the client needs told about every date on this chart.

          A programme is a plan, and a plan that reads as a promise is how a
          client ends up feeling misled by a schedule that moved for ordinary
          reasons. Said once, plainly, at the foot of the chart. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
        <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
          <b className="text-slate-700 font-bold">These dates are indicative and will move.</b>{' '}
          {!programme.published && (
            <>Your studio has not fixed a dated programme yet, so this shows the standard sequence
            measured from today.{' '}</>
          )}
          A programme depends on site conditions, material and factory lead times, society and
          statutory permissions, and how quickly decisions and payments come back to us. We update
          this page as each stage firms up, and we will always tell you before a date that affects
          you changes.
          {paymentMarks.some(m => !m.exact) && (
            <> Payments shown without a fixed date are tied to a stage rather than a day.</>
          )}
          {milestones.some(m => /retainer|retention/i.test(`${m.trigger || ''} ${m.name || ''}`)) && (
            <> Retention is shown {RETENTION_DAYS_AFTER_HANDOVER} days after handover, per the
            usual terms — your agreement is the authority on the exact period.</>
          )}
        </p>
      </div>

    </div>
  );
}
