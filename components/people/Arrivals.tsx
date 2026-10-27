import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DoorOpen, Moon, TreePalm, House, Sparkles, X } from '@/lib/lucide-shim';
import { clock12, isLate, type Attendance, type Person, type Snapshot } from '../../lib/peopleDesk';
import { awayOn, todayOf } from '../../lib/peopleView';
import { CountUp, Dot } from '../ui/HudBits';
import { Avatar, Coin, Confetti, IconTile, MODE_ICON, Ring, initials, EASE } from './PeopleBits';

/*
  WHO'S IN (for those who approve: managers, Ops and admins).

  Today's arrivals among the people they look after: a ring of faces
  orbiting the count, a coin for each person that flips over when they check
  in, and a note that swings in, door first, whenever someone new arrives
  while People is open. Built from the snapshot alone; People refreshes it
  every minute while it is open.
*/

export interface Arrival { person: Person; session: Attendance; late: boolean }
interface Today {
  today: string;
  scope: Person[];
  arrivals: Arrival[];
  away: Map<string, { mode: 'Away' | 'WFH'; pending: boolean }>;
}

/** The people this approver looks after (and themself), and who of them is in today. */
export function useToday(s: Snapshot): Today {
  return useMemo(() => {
    const today = todayOf(s);
    const everyone = s.me.accessRole === 'admin' || s.me.accessRole === 'ops';
    const others = s.people.filter((p) => p.active && p.id !== s.me.id && (everyone || p.managerId === s.me.id));
    const scope = [s.me, ...others.sort((a, b) => a.name.localeCompare(b.name))];
    const ids = new Set(scope.map((p) => p.id));
    const arrivals = s.attendance
      .filter((a) => a.date === today && ids.has(a.employeeId))
      .map((a) => ({ person: scope.find((p) => p.id === a.employeeId)!, session: a, late: isLate(a, s.policy) }))
      .sort((a, b) => a.session.checkIn.localeCompare(b.session.checkIn));
    const away = new Map(awayOn(s, today).map((a) => [a.personId, { mode: a.mode, pending: a.pending }]));
    return { today, scope, arrivals, away };
  }, [s]);
}

const firstName = (name: string) => name.split(/\s+/)[0];

/* ── The board on Today ──────────────────────────────────────────────────── */

export function StudioPulse({ s }: { s: Snapshot }) {
  const { scope, arrivals, away } = useToday(s);
  const tz = s.policy.timezone;
  const now = Date.parse(s.serverTime);
  const here = new Map(arrivals.map((a) => [a.person.id, a]));
  const onTime = arrivals.filter((a) => !a.late && a.session.mode !== 'WFH').length;
  const late = arrivals.filter((a) => a.late).length;
  const home = arrivals.filter((a) => a.session.mode === 'WFH').length;
  const awayN = scope.filter((p) => !here.has(p.id) && away.get(p.id)?.mode === 'Away' && !away.get(p.id)?.pending).length;
  const R = 100;
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in overflow-hidden">
      <div className="flex flex-wrap items-start gap-3 mb-5">
        <IconTile icon={DoorOpen} />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">Who's in today <Dot tone="ok" live /></h2>
          <p className="text-xs text-slate-500 mt-0.5">{s.me.accessRole === 'manager' ? 'You and the people who report to you.' : 'Everyone in the studio.'} Each face turns over as they check in.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([['On time', onTime, 'bg-emerald-100 text-emerald-700'], ['Late', late, 'bg-amber-100 text-amber-700'], ['From home', home, 'bg-[#3D52A0]/10 text-[#3D52A0]'], ['Away', awayN, 'bg-slate-100 text-slate-600']] as [string, number, string][])
            .map(([k, n, tint]) => <span key={k} className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${tint}`}>{k} {n}</span>)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[256px_1fr] gap-6 items-center">
        {/* The orbit: everyone in, circling the count. */}
        <div className="relative mx-auto w-[236px] h-[236px] pp-3d" aria-hidden>
          <div className="pp-orbit">
            <div className="pp-orbit-track" style={{ left: 118 - R, top: 118 - R, right: 'auto', bottom: 'auto', width: 2 * R, height: 2 * R }} />
            {arrivals.map((a, i) => {
              const ang = (i / Math.max(1, arrivals.length)) * Math.PI * 2;
              return (
                <div key={a.person.id} className="pp-orbit-slot" style={{ transform: `translate(${Math.cos(ang) * R - 16}px, ${Math.sin(ang) * R - 16}px)` }}>
                  <div className="pp-orbit-face">
                    <span className={`w-8 h-8 rounded-full grid place-items-center text-[10px] font-black text-white shadow-md ${a.late ? 'bg-amber-500' : a.session.mode === 'WFH' ? 'bg-[#3D52A0]' : 'bg-emerald-500'}`}>{initials(a.person.name)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="absolute inset-0 grid place-items-center">
            <Ring value={scope.length ? arrivals.length / scope.length : 0} size={112} stroke={9} tone={arrivals.length ? 'ok' : 'slate'} label={`${arrivals.length} of ${scope.length} in`}>
              <p className="text-2xl font-black text-slate-800 tabular-nums leading-none"><CountUp value={arrivals.length} /><span className="text-sm text-slate-400">/{scope.length}</span></p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">in</p>
            </Ring>
          </div>
        </div>

        {/* A coin for each person: their face once in, a quiet back until then. */}
        <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-4">
          {scope.map((p, i) => {
            const a = here.get(p.id);
            const off = away.get(p.id);
            const fresh = a && now - Date.parse(a.session.checkIn) < 15 * 60000;
            const ModeIcon = a ? MODE_ICON[a.session.mode] : null;
            const tone = a ? (a.late ? 'ring-amber-400' : a.session.mode === 'WFH' ? 'ring-[#3D52A0]' : 'ring-emerald-400') : 'ring-slate-200';
            return (
              <div key={p.id} className="relative flex flex-col items-center gap-1.5 text-center">
                {fresh && <Confetti pieces={14} spread={52} />}
                <Coin shown={!!a} delay={0.15 + Math.min(i, 8) * 0.07} size={56}
                  front={
                    <span className={`relative w-full h-full rounded-full bg-gradient-to-br from-white to-slate-100 ring-4 ${tone} grid place-items-center text-sm font-black text-slate-800 shadow-[0_10px_20px_-12px_rgba(61,82,160,0.6)]`}>
                      {initials(p.name)}
                      {ModeIcon && <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border border-slate-200 grid place-items-center text-[#3D52A0] shadow-sm"><ModeIcon className="w-3.5 h-3.5" /></span>}
                    </span>
                  }
                  back={
                    <span className="w-full h-full rounded-full bg-slate-100 border border-slate-200 grid place-items-center text-slate-400">
                      {off?.mode === 'Away' ? <TreePalm className="w-5 h-5" /> : off?.mode === 'WFH' ? <House className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </span>
                  } />
                <p className="text-xs font-semibold text-slate-800 truncate max-w-full">{p.id === s.me.id ? 'You' : firstName(p.name)}</p>
                <p className={`text-[11px] -mt-1 ${a ? (a.late ? 'text-amber-700' : 'text-slate-500') : 'text-slate-400'}`}>
                  {a ? `${clock12(a.session.checkIn, tz)}${a.late ? ' · late' : ''}` : off ? (off.mode === 'WFH' ? 'from home' : off.pending ? 'asked off' : 'away') : 'not yet'}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── The note when someone arrives ───────────────────────────────────────── */

interface Toast { id: string; title: string; sub: string; late: boolean; mode: Attendance['mode'] | null }
const seenKey = (today: string) => `pp-arrivals-${today}`;
const readSeen = (today: string): Set<string> => {
  try { return new Set(JSON.parse(window.localStorage.getItem(seenKey(today)) || '[]')); } catch { return new Set(); }
};
const writeSeen = (today: string, ids: Set<string>) => {
  try { window.localStorage.setItem(seenKey(today), JSON.stringify([...ids])); } catch { /* private window: notes may repeat */ }
};

/**
 * Whenever someone the approver looks after checks in, a note swings in at
 * the corner: the door opens, a little confetti, who and when. Several at
 * once (say, opening People at noon) become one note.
 */
export function ArrivalToasts({ s }: { s: Snapshot }) {
  const { today, arrivals } = useToday(s);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tz = s.policy.timezone;
  const first = useRef(true);
  useEffect(() => {
    const seen = readSeen(today);
    const fresh = arrivals.filter((a) => a.person.id !== s.me.id && !seen.has(a.session.id));
    if (!fresh.length) { first.current = false; return; }
    fresh.forEach((a) => seen.add(a.session.id));
    writeSeen(today, seen);
    const next: Toast[] = fresh.length > 3 || (first.current && fresh.length > 1)
      ? [{ id: `many-${Date.now()}`, title: `${fresh.length} people checked in`, sub: fresh.map((a) => `${firstName(a.person.name)} ${clock12(a.session.checkIn, tz)}`).join(' · '), late: false, mode: null }]
      : fresh.map((a) => ({
        id: a.session.id,
        title: `${a.person.name} checked in`,
        sub: `${clock12(a.session.checkIn, tz)} · ${a.session.mode === 'WFH' ? 'from home' : a.session.mode === 'Site' ? (a.session.site || 'at a site') : 'at the office'}`,
        late: a.late,
        mode: a.session.mode,
      }));
    first.current = false;
    setToasts((t) => [...t, ...next].slice(-3));
  }, [arrivals, today]);
  useEffect(() => {
    if (!toasts.length) return;
    const t = window.setTimeout(() => setToasts((x) => x.slice(1)), 6500);
    return () => window.clearTimeout(t);
  }, [toasts]);
  return (
    <div className="fixed top-20 right-4 z-[250] flex flex-col gap-2 w-[min(340px,calc(100vw-2rem))] pointer-events-none" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const ModeIcon = t.mode ? MODE_ICON[t.mode] : Sparkles;
          return (
            <motion.div key={t.id} layout initial={{ opacity: 0, x: 60, rotateY: -35, scale: 0.92 }} animate={{ opacity: 1, x: 0, rotateY: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              style={{ transformPerspective: 900 }}
              className="pointer-events-auto relative rounded-2xl pp-glass px-4 py-3 flex items-center gap-3">
              <span className="relative">
                <Confetti pieces={16} spread={60} />
                <span className="pp-door inline-flex"><IconTile icon={DoorOpen} tone={t.late ? 'warn' : 'ok'} /></span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 truncate">{t.title}</p>
                <p className="text-[11px] text-slate-500 truncate flex items-center gap-1"><ModeIcon className="w-3 h-3 shrink-0" />{t.sub}</p>
              </div>
              {t.late && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">Late</span>}
              <button type="button" aria-label="Dismiss" className="p-1 rounded-lg text-slate-400 hover:text-slate-700" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X className="w-3.5 h-3.5" /></button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** A small avatar strip of today's arrivals, for Home (compact). */
export function ArrivalStrip({ s }: { s: Snapshot }) {
  const { scope, arrivals } = useToday(s);
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {arrivals.slice(0, 6).map((a, i) => (
          <motion.span key={a.person.id} initial={{ rotateY: 180, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.08, ease: EASE, duration: 0.6 }} style={{ transformPerspective: 400 }}>
            <Avatar name={a.person.name} size="sm" ring={a.late ? 'warn' : 'ok'} />
          </motion.span>
        ))}
      </div>
      <span className="text-[11px] text-slate-500"><b className="text-slate-800 tabular-nums">{arrivals.length}</b> of {scope.length} in</span>
    </div>
  );
}
