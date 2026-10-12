import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CalendarDays, PartyPopper, Moon, Plus, TreePalm, House, Hourglass, CalendarCheck2 } from '@/lib/lucide-shim';
import type { Snapshot } from '../../lib/peopleDesk';
import { monthGrid, shiftMonth, awayOn, dayKind, todayOf, type DayAway } from '../../lib/peopleView';
import { CountUp } from '../ui/HudBits';
import { IconTile, initials, Tilt, EASE } from './PeopleBits';

/*
  THE TEAM CALENDAR: who is away or working from home, studio holidays and
  off days. A month turns over like a page; its days ripple in; each day
  shows faces, with a palm for leave and a house for home. Never why.
*/

const btnSm = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50';
const niceDay = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const Face: React.FC<{ p: DayAway; size?: 'sm' | 'md' }> = ({ p, size = 'sm' }) => (
  <span title={`${p.name}: ${p.mode === 'WFH' ? 'from home' : 'away'}${p.pending ? ' (asked)' : ''}`}
    className={`relative ${size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-9 h-9 text-xs'} rounded-full grid place-items-center font-black ring-2 ring-white ${p.mode === 'WFH' ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-amber-100 text-amber-700'} ${p.pending ? 'outline-dashed outline-1 outline-offset-1 outline-current' : ''}`}>
    {initials(p.name)}
  </span>
);

export default function PeopleCalendar({ s, onLeave }: { s: Snapshot; onLeave: (start?: string) => void }) {
  const today = todayOf(s);
  const still = useReducedMotion();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dir, setDir] = useState(1);
  const [picked, setPicked] = useState<string>(today);
  const weeks = monthGrid(month);
  const go = (n: number) => { setDir(n); setMonth(shiftMonth(month, n)); };
  const label = new Date(`${month}-15T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long' });
  const year = month.slice(0, 4);

  /* The month in numbers: holidays, leave days and home days among working days. */
  const stats = useMemo(() => {
    let holidays = 0, leave = 0, home = 0;
    for (const d of weeks.flat().filter((d) => d.slice(0, 7) === month)) {
      const k = dayKind(s.policy, d);
      if (k === 'holiday') holidays++;
      if (k !== 'work') continue;
      for (const a of awayOn(s, d)) { if (a.pending) continue; if (a.mode === 'WFH') home++; else leave += a.portion === 'Full day' ? 1 : 0.5; }
    }
    return { holidays, leave, home };
  }, [s, month]);

  const kind = dayKind(s.policy, picked);
  const pickedAway = awayOn(s, picked);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in">
      <div className="flex flex-wrap items-start gap-3 mb-5">
        <IconTile icon={CalendarDays} />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-800">Team calendar</h2>
          <p className="text-xs text-slate-500 mt-0.5">Who is away or working from home, studio holidays and offs. A dashed face is asked for, not yet approved.</p>
        </div>
        <div className="flex items-center gap-1.5">
          {month !== today.slice(0, 7) && <button type="button" className={btnSm} onClick={() => { setDir(today.slice(0, 7) > month ? 1 : -1); setMonth(today.slice(0, 7)); setPicked(today); }}>Today</button>}
          <button type="button" className={btnSm} aria-label="Previous month" onClick={() => go(-1)}><ChevronLeft className="w-3.5 h-3.5" /></button>
          <button type="button" className={btnSm} aria-label="Next month" onClick={() => go(1)}><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* The month's title and its numbers */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={month} initial={{ opacity: 0, y: dir * 14, rotateX: -60 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: -dir * 14, rotateX: 60 }}
            transition={{ duration: 0.35, ease: EASE }} style={{ transformPerspective: 600 }} className="text-2xl font-bold text-slate-800 tracking-tight">
            {label} <span className="text-slate-400 font-semibold">{year}</span>
          </motion.p>
        </AnimatePresence>
        <div className="flex flex-wrap gap-2">
          {([[PartyPopper, 'Holidays', stats.holidays, 'ok'], [TreePalm, 'Leave days', stats.leave, 'warn'], [House, 'Home days', stats.home, 'brand']] as const).map(([Icon, k, v, tone]) => (
            <span key={k} className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 pl-1.5 pr-3 py-1.5">
              <IconTile icon={Icon} tone={tone} size="sm" />
              <span className="leading-tight"><span className="block text-sm font-black text-slate-800 tabular-nums"><CountUp value={v} /></span><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{k}</span></span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center mb-2">
        {WEEK.map((d) => <span key={d} className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{d}</span>)}
      </div>

      {/* The page: turns over in 3D when the month changes. */}
      <div className="pp-3d">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={month} custom={dir}
            initial={still ? { opacity: 0 } : { opacity: 0, rotateY: dir * 28, x: dir * 40 }}
            animate={{ opacity: 1, rotateY: 0, x: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, rotateY: -dir * 28, x: -dir * 40 }}
            transition={{ duration: 0.38, ease: EASE }} style={{ transformOrigin: dir > 0 ? 'left center' : 'right center' }}
            className="grid grid-cols-7 gap-1 sm:gap-2">
            {weeks.flatMap((week, r) => week.map((d, c) => {
              const k = dayKind(s.policy, d);
              const people = k === 'work' ? awayOn(s, d) : [];
              const inMonth = d.slice(0, 7) === month;
              const isToday = d === today;
              const on = picked === d;
              return (
                <motion.button key={d} type="button" onClick={() => setPicked(d)} aria-pressed={on} aria-label={`${niceDay(d)}${k === 'holiday' ? `, ${s.policy.holidayNames?.[d] || 'holiday'}` : k === 'off' ? ', off' : people.length ? `, ${people.length} away or at home` : ''}`}
                  initial={still ? false : { opacity: 0, rotateX: -75, y: 8 }} animate={{ opacity: inMonth ? 1 : 0.38, rotateX: 0, y: 0 }}
                  transition={{ delay: still ? 0 : 0.04 + (r + c) * 0.022, duration: 0.45, ease: EASE }}
                  whileHover={still ? undefined : { y: -3, scale: 1.03, transition: { duration: 0.18 } }}
                  style={{ transformPerspective: 700 }}
                  className={`relative min-h-[64px] sm:min-h-[86px] rounded-xl sm:rounded-2xl border p-1.5 sm:p-2 text-left flex flex-col gap-1 transition-[border-color,box-shadow] ${isToday ? 'pp-today' : ''}
                    ${on ? 'border-[#3D52A0] shadow-[0_12px_28px_-16px_rgba(61,82,160,0.7)]' : 'border-slate-200 hover:border-slate-300 hover:shadow-[0_10px_24px_-18px_rgba(61,82,160,0.6)]'}
                    ${k === 'holiday' ? 'bg-emerald-50' : k === 'off' ? 'bg-slate-50 pp-hatch' : 'bg-white'}`}>
                  <span className="flex items-center justify-between">
                    <span className={`text-xs font-black tabular-nums ${isToday ? 'w-6 h-6 rounded-full bg-[#3D52A0] text-white grid place-items-center shadow-sm' : k === 'work' ? 'text-slate-700' : 'text-slate-400'}`}>{Number(d.slice(8))}</span>
                    {k === 'holiday' && <PartyPopper className="w-3.5 h-3.5 text-emerald-600" />}
                    {k === 'off' && <Moon className="w-3 h-3 text-slate-300" />}
                  </span>
                  {k === 'holiday' && <span className="hidden sm:block text-[10px] font-semibold text-emerald-700 leading-tight line-clamp-2">{s.policy.holidayNames?.[d] || 'Holiday'}</span>}
                  {k === 'off' && <span className="text-[10px] text-slate-400">Off</span>}
                  {people.length > 0 && (
                    <span className="mt-auto flex items-center">
                      <span className="flex -space-x-1.5">{people.slice(0, 3).map((p) => <Face key={p.personId} p={p} />)}</span>
                      {people.length > 3 && <span className="ml-1 text-[10px] font-bold text-slate-500">+{people.length - 3}</span>}
                    </span>
                  )}
                </motion.button>
              );
            }))}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-100 ring-1 ring-amber-300" />Away</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#3D52A0]/10 ring-1 ring-[#3D52A0]/40" />From home</span>
        <span className="inline-flex items-center gap-1.5"><Hourglass className="w-3 h-3" />Dashed: asked for</span>
        <span className="inline-flex items-center gap-1.5"><PartyPopper className="w-3 h-3 text-emerald-600" />Holiday</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100 pp-hatch ring-1 ring-slate-200" />Studio off</span>
      </div>

      {/* The day picked */}
      <AnimatePresence mode="wait">
        <motion.div key={picked} initial={{ opacity: 0, y: 10, rotateX: -12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }}
          style={{ transformPerspective: 900 }} className="mt-4">
          <Tilt max={3} className="rounded-2xl">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 flex flex-wrap items-center gap-4">
              <span className="pp-tile w-14 h-14 rounded-2xl bg-[#3D52A0] text-white grid place-items-center text-center leading-none">
                <span><span className="block text-[10px] font-bold uppercase tracking-wider opacity-80">{new Date(`${picked}T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'short' })}</span><span className="block text-xl font-black tabular-nums">{Number(picked.slice(8))}</span></span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800">{niceDay(picked)}</p>
                <p className="text-xs text-slate-500">
                  {kind === 'holiday' ? s.policy.holidayNames?.[picked] || 'Studio holiday' : kind === 'off' ? 'Studio off day' : pickedAway.length ? `${pickedAway.length} away or at home` : 'Everyone in.'}
                </p>
                {kind === 'work' && pickedAway.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {pickedAway.map((a, i) => (
                      <motion.span key={a.personId} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white pl-1 pr-3 py-1">
                        <Face p={a} />
                        <span className="text-xs font-semibold text-slate-800">{a.name}</span>
                        {a.mode === 'WFH' ? <House className="w-3.5 h-3.5 text-[#3D52A0]" /> : <TreePalm className="w-3.5 h-3.5 text-amber-600" />}
                        <span className="text-[11px] text-slate-500">{a.mode === 'WFH' ? 'from home' : a.portion === 'Full day' ? 'away' : a.portion.toLowerCase()}{a.pending ? ', asked' : ''}</span>
                      </motion.span>
                    ))}
                  </div>
                )}
              </div>
              {kind === 'work' && picked >= today
                ? <button type="button" className={btnSm} onClick={() => onLeave(picked)}><Plus className="w-3.5 h-3.5" />Take this day off</button>
                : kind === 'work' && <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><CalendarCheck2 className="w-3.5 h-3.5" />Past</span>}
            </div>
          </Tilt>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
