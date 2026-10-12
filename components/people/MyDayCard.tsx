import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, LogIn, LogOut, FolderOpen, ExternalLink, ArrowRight, Sun, CalendarDays, AlertTriangle } from '@/lib/lucide-shim';
import { clock12, isLate, isOff, type Attendance, type Mode } from '../../lib/peopleDesk';
import { myDay, minutesWorked, duration, dayProgress, whereLabel, mapLink, CHARGED, currentFy, leaveLabel } from '../../lib/peopleView';
import { usePeople, readLocation } from '../../services/peopleService';
import { Ring, Glide, DoneTick, Skeleton, Notice, Confetti, Tilt, MODE_ICON, EASE } from './PeopleBits';
import { Dot } from '../ui/HudBits';
import { ArrivalStrip, ArrivalToasts } from './Arrivals';

/*
  MY DAY: check in and out (lib/peopleDesk via services/peopleService).

  Office and Site check-ins ask the browser for a location first; WFH never
  does. The ring is the working day: how much of it has passed before
  check-in, the hours worked once in, full when the day is done. Shown on
  Home (as a pin on "Your day, in order"), at the top of People, and in the
  Site Supervisor's app.
*/

const btnPri = 'pp-press inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50';
const btnSec = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors disabled:opacity-50';
const niceDate = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

function useNow(serverTime?: string) {
  const offset = useMemo(() => (serverTime ? Date.parse(serverTime) - Date.now() : 0), [serverTime]);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(t);
  }, [offset]);
  return new Date(now).toISOString();
}

export default function MyDayCard({ sites = [], variant = 'full', onOpenPeople, onCorrect }: {
  /** Project names to pick from for a site check-in. */
  sites?: string[];
  /** full: People; compact: a wide card; pin: one narrow column inside a pin on Home's day board. */
  variant?: 'full' | 'compact' | 'pin';
  onOpenPeople?: () => void;
  onCorrect?: (a: Attendance) => void;
}) {
  const { snapshot, loading, error, run, refresh } = usePeople();
  /* On Home, those who approve hear about arrivals too: refresh every two minutes while it is on screen. */
  const watching = variant !== 'full' && !!snapshot && snapshot.me.accessRole !== 'employee';
  useEffect(() => {
    if (!watching) return;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 120000);
    return () => window.clearInterval(t);
  }, [watching]);
  const now = useNow(snapshot?.serverTime);
  const [mode, setMode] = useState<Mode>('Office');
  const [site, setSite] = useState('');
  const [phase, setPhase] = useState<'idle' | 'locating' | 'saving' | 'done' | 'update'>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);

  if (!snapshot) {
    return (
      <div className="relative overflow-hidden rounded-3xl pp-glass p-6">
        {error ? (
          <p className="text-sm text-slate-600 flex items-center gap-2"><Dot tone="warn" />{error}</p>
        ) : (
          <div className="flex items-center gap-6"><Skeleton className="w-28 h-28 rounded-full" /><div className="flex-1 space-y-3"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-10 w-40 rounded-xl" /></div></div>
        )}
      </div>
    );
  }

  const policy = snapshot.policy;
  const { today, session, stale } = myDay(snapshot);
  const holiday = policy.holidays.includes(today) ? policy.holidayNames?.[today] || 'Studio holiday' : null;
  const off = !holiday && isOff(today, policy);
  const onLeave = snapshot.availability.find((a) => a.employeeId === snapshot.me.id && a.start <= today && a.end >= today && a.status !== 'Pending');
  const open = session && !session.checkOut;
  const worked = session ? minutesWorked(session, now) : 0;
  const dayLen = (Number(policy.end.slice(0, 2)) * 60 + Number(policy.end.slice(3))) - (Number(policy.start.slice(0, 2)) * 60 + Number(policy.start.slice(3)));
  const ring = session ? Math.min(1, worked / Math.max(1, dayLen)) : dayProgress(policy, now);
  const tone = session?.checkOut ? 'ok' : open ? (isLate(session!, policy) ? 'warn' : 'brand') : 'slate';
  const late = session ? isLate(session, policy) : false;
  const busy = phase === 'locating' || phase === 'saving';
  const updateUrl = snapshot.me.dailyUpdateUrl;
  /* The time now, on the 12-hour clock: ["11", "21"] and "PM". */
  const [clock, ampm] = clock12(now, policy.timezone).split(' ');
  const hm = clock.split(':');

  const checkIn = async () => {
    setProblem(null);
    let location: { lat: number; lng: number; accuracyM: number } | null = null;
    if (mode !== 'WFH') {
      setPhase('locating');
      const { reading, why } = await readLocation();
      location = reading;
      if (!reading && policy.requireLocation) {
        setPhase('idle');
        setProblem(why === 'denied'
          ? 'Location is blocked. Allow location for StudioDesk in your browser settings, then check in again.'
          : 'Your location could not be found. Step near a window or turn on location, then try again.');
        return;
      }
    }
    setPhase('saving');
    const r = await run('checkin', { mode, site: mode === 'Site' ? site : '', ...(location ? { location } : {}) });
    if ('error' in r) { setPhase('idle'); setProblem(r.error); return; }
    setPhase('done');
    setJustDone('Checked in. Have a good day.');
    window.setTimeout(() => { setPhase('idle'); setJustDone(null); }, 2600);
  };

  const checkOut = async () => {
    if (!session) return;
    setProblem(null);
    setPhase('saving');
    const { reading } = session.mode === 'WFH' ? { reading: null } : await readLocation(6000);
    const r = await run('checkout', { sessionId: session.id, version: session.version, ...(reading ? { location: reading } : {}) });
    if ('error' in r) { setPhase('idle'); setProblem(r.error); return; }
    setPhase('done');
    setJustDone('Checked out. Enjoy your evening.');
    window.setTimeout(() => { setPhase('idle'); setJustDone(null); }, 2600);
  };

  const status = session?.checkOut ? 'Day complete' : open ? (late ? 'Checked in, late' : 'Checked in') : holiday ? holiday : off ? 'Studio off day' : onLeave ? (onLeave.mode === 'WFH' ? 'Working from home today' : 'On leave today') : 'Ready when you are';
  const statusTone: 'ok' | 'warn' | 'bad' = session?.checkOut ? 'ok' : open ? (late ? 'warn' : 'ok') : 'warn';
  const pin = variant === 'pin';
  const compact = variant !== 'full';
  const fy = currentFy(snapshot);
  const bal = snapshot.balances[fy];

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className={pin ? 'relative' : 'relative overflow-hidden rounded-3xl pp-glass'}>
      {!pin && <div className="pp-glow" />}
      <div className={`relative flex flex-col ${pin ? 'gap-4' : `${compact ? 'md:flex-row' : 'lg:flex-row'} gap-6 p-6 ${compact ? '' : 'md:p-8'}`}`}>
        {/* The day */}
        <div className="flex items-center gap-5">
          <Tilt max={10} glare={false} className="rounded-full">
          <Ring value={ring} size={pin ? 96 : compact ? 112 : 148} stroke={pin ? 8 : compact ? 9 : 11} tone={tone} label={`Working day ${Math.round(ring * 100)}%`}>
            {session ? (
              <>
                <p className={`${compact ? 'text-lg' : 'text-2xl'} font-black text-slate-800 tabular-nums leading-none`}>{duration(worked)}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">{session.checkOut ? 'worked' : 'so far'}</p>
              </>
            ) : (
              <>
                <p className={`${compact ? 'text-lg' : 'text-2xl'} font-black text-slate-800 tabular-nums leading-none`}>
                  {hm[0]}<span className="pp-tickover">:</span>{hm[1]}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">{ampm} · now</p>
              </>
            )}
          </Ring>
          </Tilt>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#3D52A0]">My day</p>
            <p className="font-bold text-slate-800 mt-0.5">{niceDate(today)}</p>
            <p className="flex items-center gap-2 text-xs text-slate-500 mt-1">
              <span className={`inline-flex rounded-full leading-none ${open ? 'pp-live' : ''}`}><Dot tone={statusTone} live={!!open} /></span>{status}
            </p>
            {session && (
              <p className="text-[11px] text-slate-500 mt-1">
                In {clock12(session.checkIn, policy.timezone)}{session.checkOut ? ` · out ${clock12(session.checkOut, policy.timezone)}` : ''} · {session.mode}{session.site ? ` · ${session.site}` : ''}
              </p>
            )}
            {session && session.mode !== 'WFH' && (
              <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {session.checkInLocation ? <a className="hover:underline" href={mapLink(session.checkInLocation)} target="_blank" rel="noreferrer">{whereLabel(session.checkInLocation, session.mode)}</a> : whereLabel(null, session.mode)}
              </p>
            )}
          </div>
        </div>

        {/* What to do */}
        <div className={`flex-1 min-w-0 flex flex-col justify-center gap-3 ${compact ? '' : 'lg:pl-6 lg:border-l lg:border-slate-200/70'}`}>
          <AnimatePresence mode="wait">
            {phase === 'done' && justDone ? (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
                <span className="relative"><Confetti pieces={22} spread={80} /><DoneTick size={44} /></span><p className="text-sm font-bold text-slate-800">{justDone}</p>
              </motion.div>
            ) : stale ? (
              <motion.div key="stale" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
                <p className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />The session from {new Date(`${stale.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} was never checked out. Ask for a correction before checking in again.
                </p>
                {onCorrect ? <button type="button" className={`${btnSec} self-start`} onClick={() => onCorrect(stale)}>Ask for a correction</button>
                  : onOpenPeople && <button type="button" className={`${btnSec} self-start`} onClick={onOpenPeople}>Open People<ArrowRight className="w-4 h-4" /></button>}
              </motion.div>
            ) : session?.checkOut ? (
              <motion.div key="complete" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-1">
                <p className="text-sm font-bold text-slate-800 flex items-center gap-2"><Sun className="w-4 h-4 text-amber-500" />That's the day. See you tomorrow.</p>
                {onCorrect && <button type="button" className="text-xs font-semibold text-[#3D52A0] hover:underline self-start" onClick={() => onCorrect(session)}>Something wrong? Ask for a correction</button>}
              </motion.div>
            ) : open ? (
              phase === 'update' && updateUrl ? (
                <motion.div key="update" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-slate-800">Before you go: your daily work update.</p>
                  <div className="flex flex-wrap gap-2">
                    <a className={btnSec} href={updateUrl} target="_blank" rel="noopener noreferrer"><FolderOpen className="w-4 h-4" />Open my update<ExternalLink className="w-3.5 h-3.5" /></a>
                    <button type="button" className={btnPri} disabled={busy} onClick={checkOut}><LogOut className="w-4 h-4" />Check out</button>
                    <button type="button" className={btnSec} onClick={() => setPhase('idle')}>Keep working</button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="out" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3">
                  <button type="button" className={btnPri} disabled={busy} onClick={() => (updateUrl ? setPhase('update') : checkOut())}>
                    <LogOut className="w-4 h-4" />{phase === 'saving' ? 'Checking out…' : 'Check out'}
                  </button>
                  <span className="text-[11px] text-slate-500">Studio day ends at {clock12(policy.end)}.</span>
                </motion.div>
              )
            ) : (
              <motion.div key="in" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Glide id={`mode-${variant}`} label="Where are you working" value={mode} onChange={setMode} disabled={busy}
                    options={[{ id: 'Office', label: 'Office', icon: MODE_ICON.Office }, { id: 'Site', label: 'Site', icon: MODE_ICON.Site }, { id: 'WFH', label: 'From home', icon: MODE_ICON.WFH }]} />
                  {mode === 'Site' && (
                    <select aria-label="Which site" className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#3D52A0]/30 max-w-[220px]"
                      value={site} onChange={(e) => setSite(e.target.value)} disabled={busy}>
                      <option value="">Which site?</option>
                      {sites.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className={btnPri} disabled={busy || (mode === 'Site' && !site)} onClick={checkIn}>
                    {phase === 'locating' ? (
                      <><span className="pp-radar relative w-4 h-4 grid place-items-center rounded-full"><MapPin className="w-4 h-4" /></span>Finding you…</>
                    ) : phase === 'saving' ? 'Checking in…' : (<><LogIn className="w-4 h-4" />Check in</>)}
                  </button>
                  <span className="text-[11px] text-slate-500">
                    {mode === 'WFH' ? 'No location is recorded when you work from home.' : `Your location is recorded${policy.requireLocation ? '' : ' if you allow it'}. Late after ${clock12(policy.lateAfter)}.`}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>{problem && <Notice text={problem} tone="bad" onClose={() => setProblem(null)} />}</AnimatePresence>
          {error && !problem && <Notice text={error} tone="bad" />}

          {watching && <div className="pt-1"><ArrivalStrip s={snapshot} /><ArrivalToasts s={snapshot} /></div>}
          {compact && bal && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {CHARGED.filter((t) => bal[t]?.entitled || bal[t]?.used).slice(0, 3).map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full bg-[#3D52A0]/10 text-[#3D52A0] text-[10px] font-bold uppercase tracking-wider" title={leaveLabel(t)}>
                  {t} {bal[t].available}
                </span>
              ))}
              {onOpenPeople && (
                <button type="button" onClick={onOpenPeople} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[#3D52A0] hover:underline">
                  <CalendarDays className="w-3.5 h-3.5" />Leave & attendance<ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          {loading && <span className="sr-only">Refreshing</span>}
        </div>
      </div>
    </motion.section>
  );
}
