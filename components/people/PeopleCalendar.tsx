import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CalendarDays, PartyPopper, Moon, Plus, TreePalm, House, Hourglass, CalendarCheck2, Building2, HardHat, UserX, DoorOpen } from '@/lib/lucide-shim';
import { clock12, type Snapshot } from '../../lib/peopleDesk';
import { monthGrid, shiftMonth, dayKind, todayOf, dayRoster, rosterScope, STATUS_ORDER, type DayEntry, type DayStatus } from '../../lib/peopleView';
import { CountUp } from '../ui/HudBits';
import { IconTile, Tilt, EASE } from './PeopleBits';

/*
  THE TEAM CALENDAR: who is in, at a site, at home or away each day, and
  studio holidays and off days. A month turns over like a page; its days
  ripple in; each day carries name tags, coloured by where the person was.
  Check-ins show only for the people this person may approve (everyone for
  admins and Ops, a manager's team, otherwise themselves); leave and home
  days show for everyone. Never why.
*/

const btnSm = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50';
const niceDay = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* How each kind of day looks: emerald for in, the brand for home, amber for away, rose for a missed day. */
const LOOK: Record<DayStatus, { label: string; icon: React.ComponentType<any>; tag: string; dot: string }> = {
  office: { label: 'In office', icon: Building2, tag: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  site: { label: 'At site', icon: HardHat, tag: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  home: { label: 'From home', icon: House, tag: 'bg-[#3D52A0]/10 text-[#3D52A0] border-[#3D52A0]/20', dot: 'bg-[#3D52A0]' },
  away: { label: 'Away', icon: TreePalm, tag: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  missing: { label: 'No check-in', icon: UserX, tag: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-400' },
};
const firstName = (name: string) => name.split(/\s+/)[0];
/* Today, someone not in yet is not a missed day: grey until the day is over. */
const lookOf = (e: DayEntry, isToday: boolean) =>
  e.status === 'missing' && isToday ? { ...LOOK.missing, label: 'Not in yet', icon: Hourglass, tag: 'bg-slate-50 text-slate-500 border-slate-200', dot: 'bg-slate-300' } : LOOK[e.status];

/** One person's tag: a coloured chip with their first name and where they were. */
const Tag: React.FC<{ e: DayEntry; isToday: boolean }> = ({ e, isToday }) => {
  const look = lookOf(e, isToday);
  const Icon = look.icon;
  return (
    <span title={`${e.name}: ${look.label.toLowerCase()}${e.pending ? ' (asked)' : ''}${e.late ? ', late' : ''}`}
      className={`relative inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-tight ${look.tag} ${e.pending ? 'border-dashed' : ''}`}>
      <Icon className="w-3 h-3 shrink-0" />
      <span className="truncate">{firstName(e.name)}</span>
      {e.late && <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />}
    </span>
  );
};

/** The detail line under a name in the day's panel. */
function detailOf(e: DayEntry, tz: string, isToday: boolean): string {
  const parts: string[] = [];
  if (e.checkIn) parts.push(clock12(e.checkIn, tz));
  if (e.late) parts.push('late');
  if (e.open) parts.push('in now');
  if (e.status === 'site' && e.note) parts.push(e.note);
  if (e.status === 'away' || (e.status === 'home' && !e.checkIn)) parts.push(e.note ? e.note.toLowerCase() : e.status === 'away' ? 'full day' : 'planned');
  if (e.status === 'missing') parts.push(isToday ? 'not in yet' : 'no check-in or leave');
  if (e.pending) parts.push('asked');
  return parts.join(' · ');
}

export default function PeopleCalendar({ s, onLeave }: { s: Snapshot; onLeave: (start?: string) => void }) {
  const today = todayOf(s);
  const still = useReducedMotion();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dir, setDir] = useState(1);
  const [picked, setPicked] = useState<string>(today);
  /* The legend filters the month: one kind of day, or everyone. */
  const [focus, setFocus] = useState<DayStatus | 'all'>('all');
  const scope = rosterScope(s);
  const tz = s.policy.timezone;
  const weeks = monthGrid(month);
  const go = (n: number) => { setDir(n); setMonth(shiftMonth(month, n)); };
  const label = new Date(`${month}-15T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long' });
  const year = month.slice(0, 4);

  /* Each day's people, worked out once per month. */
  const rosters = useMemo(() => new Map(weeks.flat().map((d) => [d, dayRoster(s, d)])), [s, month]);

  /* The month in numbers, from the same days the grid shows: holidays, check-ins, leave days and home days (approved). */
  const stats = useMemo(() => {
    let holidays = 0, checkIns = 0, leave = 0, home = 0;
    for (const d of weeks.flat().filter((d) => d.slice(0, 7) === month)) {
      if (dayKind(s.policy, d) === 'holiday') holidays++;
      for (const e of rosters.get(d) || []) {
        if (e.checkIn) checkIns++;
        if (e.pending) continue;
        if (e.status === 'home') home++;
        if (e.status === 'away') leave += e.note ? 0.5 : 1;
      }
    }
    return { holidays, checkIns, leave, home };
  }, [rosters]);
  const shown = (d: string) => (rosters.get(d) || []).filter((e) => focus === 'all' || e.status === focus);

  const kind = dayKind(s.policy, picked);
  const pickedDay = rosters.get(picked) || dayRoster(s, picked);
  const pickedIsToday = picked === today;
  const groups = STATUS_ORDER.map((st) => [st, pickedDay.filter((e) => e.status === st)] as const).filter(([, list]) => list.length > 0);
  const inCount = pickedDay.filter((e) => e.status === 'office' || e.status === 'site' || (e.status === 'home' && e.checkIn)).length;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in">
      <div className="flex flex-wrap items-start gap-3 mb-5">
        <IconTile icon={CalendarDays} />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-800">Team calendar</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Who is in, at a site, at home or away, with studio holidays and offs. {s.me.accessRole === 'admin' || s.me.accessRole === 'ops' ? 'You see everyone\'s check-ins.' : scope.length > 1 ? 'Check-ins show for your team and you; leave and home days for everyone.' : 'Your own check-ins, and everyone\'s leave and home days.'} A dashed tag is asked for, not yet approved.
          </p>
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
          {([[PartyPopper, 'Holidays', stats.holidays, 'ok'], [DoorOpen, 'Check-ins', stats.checkIns, 'ok'], [TreePalm, 'Leave days', stats.leave, 'warn'], [House, 'Home days', stats.home, 'brand']] as const).map(([Icon, k, v, tone]) => (
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
              const people = k === 'work' ? shown(d) : [];
              const inMonth = d.slice(0, 7) === month;
              const isToday = d === today;
              const on = picked === d;
              return (
                <motion.button key={d} type="button" onClick={() => setPicked(d)} aria-pressed={on} aria-label={`${niceDay(d)}${k === 'holiday' ? `, ${s.policy.holidayNames?.[d] || 'holiday'}` : k === 'off' ? ', off' : people.length ? `, ${STATUS_ORDER.map((st) => [st, people.filter((e) => e.status === st).length] as const).filter(([, n]) => n).map(([st, n]) => `${n} ${LOOK[st].label.toLowerCase()}`).join(', ')}` : ''}`}
                  initial={still ? false : { opacity: 0, rotateX: -75, y: 8 }} animate={{ opacity: inMonth ? 1 : 0.38, rotateX: 0, y: 0 }}
                  transition={{ delay: still ? 0 : 0.04 + (r + c) * 0.022, duration: 0.45, ease: EASE }}
                  whileHover={still ? undefined : { y: -3, scale: 1.03, transition: { duration: 0.18 } }}
                  style={{ transformPerspective: 700 }}
                  className={`relative min-h-[64px] sm:min-h-[104px] min-w-0 rounded-xl sm:rounded-2xl border p-1.5 sm:p-2 text-left flex flex-col gap-1 transition-[border-color,box-shadow] ${isToday ? 'pp-today' : ''}
                    ${on ? 'border-[#3D52A0] shadow-[0_12px_28px_-16px_rgba(61,82,160,0.7)]' : 'border-slate-200 hover:border-slate-300 hover:shadow-[0_10px_24px_-18px_rgba(61,82,160,0.6)]'}
                    ${k === 'holiday' ? 'bg-emerald-50' : k === 'off' ? 'bg-slate-50 pp-hatch' : 'bg-white'}`}>
                  <span className="flex items-center justify-between">
                    <span className={`text-xs font-black tabular-nums ${isToday ? 'w-6 h-6 rounded-full bg-[#3D52A0] text-white grid place-items-center shadow-sm' : k === 'work' ? 'text-slate-700' : 'text-slate-400'}`}>{Number(d.slice(8))}</span>
                    {k === 'holiday' && <PartyPopper className="w-3.5 h-3.5 text-emerald-600" />}
                    {k === 'off' && <Moon className="w-3 h-3 text-slate-300" />}
                  </span>
                  {k === 'holiday' && <span className="hidden sm:block text-[10px] font-semibold text-emerald-700 leading-tight line-clamp-2">{s.policy.holidayNames?.[d] || 'Holiday'}</span>}
                  {k === 'off' && <span className="text-[10px] text-slate-400">Off</span>}
                  {people.length > 0 && <>
                    {/* Phones: a dot per person. Wider: their name tags, three and a count. */}
                    <span className="mt-auto flex flex-wrap gap-0.5 sm:hidden">
                      {people.slice(0, 6).map((e) => <span key={e.personId} className={`w-1.5 h-1.5 rounded-full ${lookOf(e, isToday).dot}`} />)}
                    </span>
                    <span className="mt-0.5 hidden sm:flex flex-col items-start gap-0.5 min-w-0">
                      {people.slice(0, 3).map((e) => <Tag key={e.personId} e={e} isToday={isToday} />)}
                      {people.length > 3 && <span className="text-[10px] font-bold text-slate-500">+{people.length - 3} more</span>}
                    </span>
                  </>}
                </motion.button>
              );
            }))}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500">
        {/* The legend is also the filter: tap a kind of day to see only those across the month. */}
        <span className="inline-flex flex-wrap items-center gap-1.5" role="group" aria-label="Show on the calendar">
          {(['all', ...STATUS_ORDER] as const).map((st) => {
            const on = focus === st;
            const Icon = st === 'all' ? null : LOOK[st].icon;
            return (
              <button key={st} type="button" aria-pressed={on} onClick={() => setFocus(on && st !== 'all' ? 'all' : st)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors ${on ? (st === 'all' ? 'bg-[#3D52A0] text-white border-[#3D52A0]' : `${LOOK[st].tag} ring-2 ring-offset-1 ring-current`) : st === 'all' ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50' : `${LOOK[st].tag} opacity-80 hover:opacity-100`}`}>
                {Icon && <Icon className="w-3 h-3" />}{st === 'all' ? 'Everyone' : LOOK[st].label}
              </button>
            );
          })}
        </span>
        <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Late</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-dashed border-slate-400" />Dashed: asked for</span>
        <span className="inline-flex items-center gap-1.5"><PartyPopper className="w-3 h-3 text-emerald-600" />Holiday</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100 pp-hatch ring-1 ring-slate-200" />Studio off</span>
      </div>

      {/* The day picked */}
      <AnimatePresence mode="wait">
        <motion.div key={picked} initial={{ opacity: 0, y: 10, rotateX: -12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }}
          style={{ transformPerspective: 900 }} className="mt-4">
          <Tilt max={3} className="rounded-2xl">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-4">
                <span className="pp-tile w-14 h-14 rounded-2xl bg-[#3D52A0] text-white grid place-items-center text-center leading-none">
                  <span><span className="block text-[10px] font-bold uppercase tracking-wider opacity-80">{new Date(`${picked}T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'short' })}</span><span className="block text-xl font-black tabular-nums">{Number(picked.slice(8))}</span></span>
                </span>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm font-bold text-slate-800">{niceDay(picked)}</p>
                  <p className="text-xs text-slate-500">
                    {kind === 'holiday' ? s.policy.holidayNames?.[picked] || 'Studio holiday' : kind === 'off' ? 'Studio off day'
                      : picked > today ? (pickedDay.length ? `${pickedDay.length} away or at home so far` : 'Nobody away so far.')
                      : pickedDay.length ? `${inCount} in${pickedDay.length > inCount ? `, ${pickedDay.length - inCount} not in` : ''}` : 'Nobody to show for this day.'}
                  </p>
                </div>
                {kind === 'work' && picked >= today
                  ? <button type="button" className={btnSm} onClick={() => onLeave(picked)}><Plus className="w-3.5 h-3.5" />Take this day off</button>
                  : kind === 'work' && <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><CalendarCheck2 className="w-3.5 h-3.5" />Past</span>}
              </div>
              {kind === 'work' && groups.length > 0 && (
                <div className="mt-4 space-y-2.5">
                  {groups.map(([st, list], gi) => {
                    const look = lookOf(list[0], pickedIsToday);
                    const Icon = look.icon;
                    return (
                      <div key={st}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1.5"><Icon className="w-3 h-3" />{look.label} · {list.length}</p>
                        <div className="flex flex-wrap gap-2">
                          {list.map((e, i) => (
                            <motion.span key={e.personId} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: (gi * 3 + i) * 0.04 }}
                              className={`inline-flex max-w-full flex-wrap items-center gap-x-2 rounded-full border bg-white pl-2.5 pr-3 py-1 ${e.pending ? 'border-dashed border-slate-300' : 'border-slate-200'}`}>
                              <span className={`w-2 h-2 rounded-full ${look.dot}`} />
                              <span className="text-xs font-semibold text-slate-800">{e.name}</span>
                              <span className="text-[11px] text-slate-500">{detailOf(e, tz, pickedIsToday)}</span>
                            </motion.span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Tilt>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
