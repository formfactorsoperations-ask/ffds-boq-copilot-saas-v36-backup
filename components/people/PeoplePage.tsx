import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sun, Clock3, CalendarDays, Inbox, Users, BookUser, FileSpreadsheet, Plus, RefreshCw, ChevronLeft, ChevronRight, MapPin, Download, Check, X, Search,
} from '@/lib/lucide-shim';
import { LEAVE_LABELS, isLate, timeLabel, type Attendance, type RequestRecord, type Snapshot, type Status } from '../../lib/peopleDesk';
import {
  myDay, minutesWorked, duration, whereLabel, mapLink, CHARGED, currentFy, fyLabel, unitsOf, awaitingMe, personName,
  monthGrid, shiftMonth, awayOn, dayKind, monthReport, attendanceCsv, todayOf,
} from '../../lib/peopleView';
import { usePeople, runPeople } from '../../services/peopleService';
import ConsoleHeader from '../ui/ConsoleHeader';
import { CountUp, Dot } from '../ui/HudBits';
import MyDayCard from './MyDayCard';
import { LeaveSheet, CorrectionSheet } from './PeopleSheets';
import { Ring, Avatar, Skeleton, Glide, Notice, listV, rowV, sectionV, EASE } from './PeopleBits';
import { btnPri, btnSec, btnSm, input } from '../opsDesk/OpsDeskPanels';

/*
  PEOPLE (lib/peopleDesk.ts): attendance and leave for everyone in the
  studio. Each person has their day, their attendance and their leave;
  managers and admins also approve, see their people's attendance and the
  monthly report. Everyone sees the team calendar and the directory, which
  show only who is away, never why. Built to DESIGN.md, with the People
  motion kit the owner approved ("People motion").
*/

type Section = 'today' | 'attendance' | 'leave' | 'approvals' | 'calendar' | 'directory' | 'report';
const chip = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap';
const niceDay = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const range = (a: string, b: string) => (a === b ? niceDay(a) : `${niceDay(a)} – ${niceDay(b)}`);
const STATUS_TINT: Record<Status, string> = {
  Pending: 'bg-amber-100 text-amber-700', Approved: 'bg-emerald-100 text-emerald-700', Rejected: 'bg-rose-100 text-rose-700',
  Withdrawn: 'bg-slate-100 text-slate-600', 'Cancellation requested': 'bg-amber-100 text-amber-700', Cancelled: 'bg-slate-100 text-slate-600',
};

const Panel: React.FC<{ icon: React.ComponentType<any>; title: string; blurb: string; children: React.ReactNode; aside?: React.ReactNode }> = ({ icon: Icon, title, blurb, children, aside }) => (
  <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in">
    <div className="flex flex-wrap items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></div>
      <div className="min-w-0 flex-1">
        <h2 className="font-bold text-slate-800">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>
      </div>
      {aside}
    </div>
    {children}
  </section>
);
const Empty: React.FC<{ text: string }> = ({ text }) => <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">{text}</p>;

export default function PeoplePage({ projects = [] }: { projects?: any[] }) {
  const { snapshot, loading, error, refresh } = usePeople();
  const [section, setSection] = useState<Section>('today');
  const [leaveOpen, setLeaveOpen] = useState<{ start?: string } | null>(null);
  const [correcting, setCorrecting] = useState<Attendance | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sites = useMemo(() => [...new Set(projects.map((p) => String(p?.context?.name || '')).filter(Boolean))].sort(), [projects]);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 4500); return () => window.clearTimeout(t); }, [notice]);

  if (!snapshot) {
    return (
      <div className="pb-28">
        <ConsoleHeader title="People" state={error ? 'Not available' : 'Loading'} tone={error ? 'bad' : 'warn'} live={!error} blurb="Your day, your leave, and who is in." />
        {error ? <Panel icon={Users} title="People could not open" blurb={error}><button type="button" className={btnSec} onClick={refresh}><RefreshCw className="w-4 h-4" />Try again</button></Panel>
          : <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6"><div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div><Skeleton className="h-64 rounded-3xl" /></div>}
      </div>
    );
  }

  const s = snapshot;
  const approver = s.me.accessRole !== 'employee';
  const waiting = awaitingMe(s);
  const { session } = myDay(s);
  const fy = currentFy(s);
  const bal = s.balances[fy];
  const SECTIONS: { id: Section; label: string; icon: React.ComponentType<any>; n?: number; show: boolean }[] = [
    { id: 'today', label: 'Today', icon: Sun, show: true },
    { id: 'attendance', label: 'Attendance', icon: Clock3, show: true },
    { id: 'leave', label: 'Leave', icon: CalendarDays, n: s.requests.filter((r) => r.employeeId === s.me.id && r.status === 'Pending').length, show: true },
    { id: 'approvals', label: 'Approvals', icon: Inbox, n: waiting.length, show: approver },
    { id: 'calendar', label: 'Team calendar', icon: Users, show: true },
    { id: 'directory', label: 'Directory', icon: BookUser, show: true },
    { id: 'report', label: 'Monthly report', icon: FileSpreadsheet, show: approver },
  ];
  const done = (msg: string) => { setLeaveOpen(null); setCorrecting(null); setNotice(msg); };

  return (
    <div className="pb-28">
      <ConsoleHeader
        title="People"
        state={session?.checkOut ? 'Day complete' : session ? 'Checked in' : 'Not checked in'}
        tone={session ? 'ok' : 'warn'}
        live={!!session && !session.checkOut}
        blurb={approver ? 'Your day and your leave, and your people: their attendance, approvals and the monthly report.' : 'Check in and out, your attendance and leave, and who is away.'}
        actions={<>
          <button type="button" className={btnPri} onClick={() => setLeaveOpen({})}><Plus className="w-4 h-4" />Apply for leave</button>
          <button type="button" className={btnSec} onClick={refresh} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </>}
        panel={bal ? (
          <div className="w-full md:w-[290px]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Leave left · {fyLabel(fy)}</div>
            <div className="mt-3 flex items-center justify-between gap-2">
              {(['PL', 'SL', 'CL'] as const).map((t, i) => (
                <motion.div key={t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08, ease: EASE }} className="flex flex-col items-center gap-1">
                  <Ring value={bal[t].entitled ? bal[t].available / bal[t].entitled : 0} size={64} stroke={6} tone={bal[t].available <= 1 ? 'warn' : 'brand'} label={`${LEAVE_LABELS[t]}: ${bal[t].available} left`}>
                    <span className="text-sm font-black text-slate-800 tabular-nums"><CountUp value={bal[t].available} /></span>
                  </Ring>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t}</span>
                </motion.div>
              ))}
            </div>
          </div>
        ) : undefined}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
        <nav aria-label="People sections" className="lg:sticky lg:top-4 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
          {SECTIONS.filter((x) => x.show).map((x, i) => {
            const Icon = x.icon;
            const on = section === x.id;
            return (
              <button key={x.id} type="button" onClick={() => setSection(x.id)} aria-current={on ? 'page' : undefined}
                className={`relative lg:w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors hud-row-in whitespace-nowrap ${on ? 'text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                style={{ animationDelay: `${i * 30}ms` }}>
                {on && <motion.span layoutId="people-rail" className="absolute inset-0 rounded-xl bg-[#3D52A0] shadow-sm" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                <Icon className={`relative w-4 h-4 shrink-0 ${on ? 'text-white' : 'text-slate-400'}`} />
                <span className="relative text-sm font-semibold flex-1 min-w-0 truncate">{x.label}</span>
                {!!x.n && <span className={`relative text-[10px] font-black px-1.5 py-0.5 rounded-full ${on ? 'bg-white/20 text-white' : x.id === 'approvals' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{x.n}</span>}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-6">
          <AnimatePresence>{notice && <Notice text={notice} onClose={() => setNotice(null)} />}</AnimatePresence>
          {error && <Notice text={error} tone="bad" />}
          <AnimatePresence mode="wait">
            <motion.div key={section} variants={sectionV} initial="hidden" animate="show" exit="exit" className="space-y-6">
              {section === 'today' && <TodaySection s={s} sites={sites} onCorrect={setCorrecting} onLeave={(start) => setLeaveOpen({ start })} onGo={setSection} waiting={waiting.length} />}
              {section === 'attendance' && <AttendanceSection s={s} onCorrect={setCorrecting} approver={approver} />}
              {section === 'leave' && <LeaveSection s={s} onApply={() => setLeaveOpen({})} onDone={setNotice} />}
              {section === 'approvals' && approver && <ApprovalsSection s={s} list={waiting} onDone={setNotice} />}
              {section === 'calendar' && <CalendarSection s={s} onLeave={(start) => setLeaveOpen({ start })} />}
              {section === 'directory' && <DirectorySection s={s} />}
              {section === 'report' && approver && <ReportSection s={s} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {leaveOpen && <LeaveSheet snapshot={s} start={leaveOpen.start} onClose={() => setLeaveOpen(null)} onSaved={done} />}
      {correcting && <CorrectionSheet snapshot={s} session={correcting} sites={sites} onClose={() => setCorrecting(null)} onSaved={done} />}
    </div>
  );
}

/* ── Today ───────────────────────────────────────────────────────────────── */

function TodaySection({ s, sites, onCorrect, onLeave, onGo, waiting }: { s: Snapshot; sites: string[]; onCorrect: (a: Attendance) => void; onLeave: (start?: string) => void; onGo: (x: Section) => void; waiting: number }) {
  const today = todayOf(s);
  const away = awayOn(s, today).filter((a) => a.personId !== s.me.id);
  const holidays = s.policy.holidays.filter((d) => d >= today).slice(0, 4);
  const mine = s.requests.filter((r) => r.employeeId === s.me.id && r.kind === 'leave' && r.end >= today && ['Pending', 'Approved', 'Cancellation requested'].includes(r.status)).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
  return (
    <>
      <MyDayCard sites={sites} onCorrect={onCorrect} />
      {waiting > 0 && (
        <motion.button type="button" onClick={() => onGo('approvals')} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="w-full flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left pp-lift">
          <Dot tone="warn" live /><span className="text-sm font-semibold text-amber-900 flex-1">{waiting} request{waiting === 1 ? '' : 's'} waiting for your decision</span>
          <span className="text-xs font-bold text-amber-900">Review</span>
        </motion.button>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel icon={Users} title="Away today" blurb="Who is on leave or working from home. Never why.">
          {away.length === 0 ? <Empty text="Everyone is in today." /> : (
            <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
              {away.map((a) => (
                <motion.li key={a.personId} variants={rowV} className="flex items-center gap-3">
                  <Avatar name={a.name} ring={a.pending ? 'warn' : null} />
                  <span className="text-sm font-semibold text-slate-800 flex-1 min-w-0 truncate">{a.name}</span>
                  <span className={`${chip} ${a.mode === 'WFH' ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-slate-100 text-slate-600'}`}>{a.mode === 'WFH' ? 'From home' : a.portion === 'Full day' ? 'Away' : a.portion}</span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Panel>
        <Panel icon={CalendarDays} title="Your leave ahead" blurb="Asked for or approved." aside={<button type="button" className={btnSm} onClick={() => onLeave()}><Plus className="w-3.5 h-3.5" />Apply</button>}>
          {mine.length === 0 ? <Empty text="Nothing booked. Plan a break?" /> : (
            <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
              {mine.map((r) => (
                <motion.li key={r.id} variants={rowV} className="flex items-center gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center text-[10px] font-black">{r.type}</span>
                  <span className="text-sm font-semibold text-slate-800 flex-1 min-w-0 truncate">{range(r.start, r.end)}</span>
                  <span className={`${chip} ${STATUS_TINT[r.status]}`}>{r.status === 'Cancellation requested' ? 'Cancelling' : r.status}</span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Panel>
        <Panel icon={Sun} title="Studio holidays" blurb="Coming up.">
          {holidays.length === 0 ? <Empty text="No holidays set yet." /> : (
            <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
              {holidays.map((d) => (
                <motion.li key={d} variants={rowV} className="flex items-center gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-xl bg-emerald-100 text-emerald-700 grid place-items-center text-xs font-black tabular-nums">{Number(d.slice(8))}</span>
                  <span className="text-sm font-semibold text-slate-800 flex-1 min-w-0 truncate">{s.policy.holidayNames?.[d] || 'Holiday'}</span>
                  <span className="text-[11px] text-slate-500">{niceDay(d)}</span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Panel>
      </div>
    </>
  );
}

/* ── Attendance ──────────────────────────────────────────────────────────── */

function AttendanceSection({ s, onCorrect, approver }: { s: Snapshot; onCorrect: (a: Attendance) => void; approver: boolean }) {
  const [whose, setWhose] = useState<'mine' | 'team'>('mine');
  const [shown, setShown] = useState(30);
  const list = s.attendance.filter((a) => (whose === 'mine' ? a.employeeId === s.me.id : a.employeeId !== s.me.id))
    .sort((a, b) => b.date.localeCompare(a.date) || personName(s, a.employeeId).localeCompare(personName(s, b.employeeId)));
  const pendingFix = new Set(s.requests.filter((r) => r.kind === 'correction' && r.status === 'Pending').map((r) => r.correction?.sessionId));
  return (
    <Panel icon={Clock3} title="Attendance" blurb="The last four months. A day can be corrected once your approver agrees."
      aside={approver ? <Glide id="att-whose" label="Whose" value={whose} onChange={(v) => { setWhose(v); setShown(30); }} options={[{ id: 'mine', label: 'Mine' }, { id: 'team', label: 'My people' }]} /> : undefined}>
      {list.length === 0 ? <Empty text={whose === 'mine' ? 'No attendance yet. Check in from Today.' : 'No attendance from your people yet.'} /> : (
        <>
          <motion.div variants={listV} initial="hidden" animate="show" key={whose} className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {list.slice(0, shown).map((a) => {
              const late = isLate(a, s.policy);
              return (
                <motion.div key={a.id} variants={rowV} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{new Date(`${a.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short' })}</p>
                    <p className="text-sm font-black text-slate-800 tabular-nums">{new Date(`${a.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {whose === 'team' && <span>{personName(s, a.employeeId)} · </span>}
                      {timeLabel(a.checkIn, s.policy.timezone)} – {a.checkOut ? timeLabel(a.checkOut, s.policy.timezone) : <span className="text-amber-700">not checked out</span>}
                      {a.checkOut && <span className="text-xs font-normal text-slate-500"> · {duration(minutesWorked(a, a.checkOut))}</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-1">
                      {a.mode}{a.site ? ` · ${a.site}` : ''} ·
                      {a.checkInLocation ? <a className="inline-flex items-center gap-0.5 hover:underline" href={mapLink(a.checkInLocation)} target="_blank" rel="noreferrer"><MapPin className="w-3 h-3" />{whereLabel(a.checkInLocation, a.mode)}</a> : <span>{whereLabel(null, a.mode)}</span>}
                    </p>
                  </div>
                  {late && <span className={`${chip} bg-amber-100 text-amber-700`}>Late</span>}
                  {pendingFix.has(a.id) ? <span className={`${chip} bg-[#3D52A0]/10 text-[#3D52A0]`}>Correction asked</span>
                    : whose === 'mine' && <button type="button" className={btnSm} onClick={() => onCorrect(a)}>Correct</button>}
                </motion.div>
              );
            })}
          </motion.div>
          {list.length > shown && <button type="button" className={`${btnSm} mt-3`} onClick={() => setShown((n) => n + 30)}>Show more</button>}
        </>
      )}
    </Panel>
  );
}

/* ── Leave ───────────────────────────────────────────────────────────────── */

function LeaveSection({ s, onApply, onDone }: { s: Snapshot; onApply: () => void; onDone: (m: string) => void }) {
  const years = Object.keys(s.balances).sort();
  const [fy, setFy] = useState(currentFy(s));
  const bal = s.balances[fy];
  const mine = s.requests.filter((r) => r.employeeId === s.me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayOf(s);
  const act = async (r: RequestRecord, action: 'withdraw' | 'cancel') => {
    setBusy(r.id);
    setError(null);
    const res = await runPeople(action, { requestId: r.id, version: r.version });
    setBusy(null);
    if ('error' in res) setError(res.error);
    else onDone(action === 'withdraw' ? 'Request withdrawn.' : 'Cancellation sent for approval. The days stay booked until then.');
  };
  const wfhDays = s.requests.filter((r) => r.employeeId === s.me.id && r.type === 'WFH' && r.status === 'Approved').reduce((n, r) => n + r.days.filter((d) => currentFy({ ...s, serverTime: `${d.date}T06:00:00Z` }) === fy).reduce((m, d) => m + d.units, 0), 0);
  return (
    <>
      <Panel icon={CalendarDays} title="Your balance" blurb="Approved leave is used; leave waiting for approval is held. No carry-forward into the next year."
        aside={years.length > 1 ? <Glide id="leave-fy" label="Leave year" value={fy} onChange={setFy} options={years.map((y) => ({ id: y, label: fyLabel(y) }))} /> : undefined}>
        {bal ? (
          <motion.div variants={listV} initial="hidden" animate="show" key={fy} className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {CHARGED.map((t) => {
              const b = bal[t];
              return (
                <motion.div key={t} variants={rowV} className="rounded-2xl border border-slate-200 p-4 flex flex-col items-center gap-2 pp-lift">
                  <Ring value={b.entitled ? b.available / b.entitled : 0} size={92} stroke={8} tone={b.available <= 0 ? 'slate' : b.available <= 1 ? 'warn' : 'brand'} label={`${LEAVE_LABELS[t]}: ${b.available} of ${b.entitled}`}>
                    <p className="text-lg font-black text-slate-800 tabular-nums leading-none"><CountUp value={b.available} /></p>
                    <p className="text-[10px] text-slate-500 mt-0.5">of {b.entitled}</p>
                  </Ring>
                  <p className="text-sm font-semibold text-slate-800 text-center">{LEAVE_LABELS[t]}</p>
                  <p className="text-[11px] text-slate-500">{b.used} used{b.reserved ? ` · ${b.reserved} held` : ''}</p>
                </motion.div>
              );
            })}
            <motion.div variants={rowV} className="rounded-2xl border border-slate-200 p-4 flex flex-col items-center justify-center gap-2 pp-lift">
              <span className="w-[92px] h-[92px] rounded-full bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center">
                <span className="text-center"><span className="block text-lg font-black tabular-nums leading-none"><CountUp value={wfhDays} /></span><span className="text-[10px]">days</span></span>
              </span>
              <p className="text-sm font-semibold text-slate-800">Work from home</p>
              <p className="text-[11px] text-slate-500">approved this year</p>
            </motion.div>
          </motion.div>
        ) : <Empty text="No balance for this year." />}
      </Panel>
      <Panel icon={Inbox} title="Your requests" blurb="Withdraw one that is waiting; cancel approved leave, which your approver confirms." aside={<button type="button" className={btnSm} onClick={onApply}><Plus className="w-3.5 h-3.5" />Apply</button>}>
        <AnimatePresence>{error && <Notice text={error} tone="bad" onClose={() => setError(null)} />}</AnimatePresence>
        {mine.length === 0 ? <Empty text="No requests yet." /> : (
          <motion.div variants={listV} initial="hidden" animate="show" className="rounded-xl border border-slate-200 divide-y divide-slate-100 mt-2">
            {mine.map((r) => {
              const last = r.decisions[r.decisions.length - 1];
              return (
                <motion.div key={r.id} variants={rowV} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center text-[10px] font-black">{r.kind === 'correction' ? 'FIX' : r.type}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{r.kind === 'correction' ? `Attendance correction, ${niceDay(r.start)}` : `${LEAVE_LABELS[r.type]} · ${range(r.start, r.end)}`}
                      {r.kind === 'leave' && <span className="text-xs font-normal text-slate-500"> · {unitsOf(r)} day{unitsOf(r) === 1 ? '' : 's'}{r.portion !== 'Full day' ? ` (${r.portion.toLowerCase()})` : ''}</span>}</p>
                    {last && <p className="text-[11px] text-slate-500">{personName(s, last.actorId)}: {last.status}{last.note ? ` · "${last.note}"` : ''}</p>}
                  </div>
                  <span className={`${chip} ${STATUS_TINT[r.status]}`}>{r.status === 'Cancellation requested' ? 'Cancelling' : r.status}</span>
                  {r.status === 'Pending' && <button type="button" className={btnSm} disabled={busy === r.id} onClick={() => act(r, 'withdraw')}>Withdraw</button>}
                  {r.status === 'Approved' && r.kind === 'leave' && r.end >= today && <button type="button" className={btnSm} disabled={busy === r.id} onClick={() => act(r, 'cancel')}>Cancel</button>}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </Panel>
    </>
  );
}

/* ── Approvals ───────────────────────────────────────────────────────────── */

function ApprovalsSection({ s, list, onDone }: { s: Snapshot; list: RequestRecord[]; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const tz = s.policy.timezone;
  const decide = async (r: RequestRecord, decision: 'approve' | 'reject') => {
    setBusy(r.id);
    setError(null);
    const res = await runPeople('decide', { requestId: r.id, version: r.version, decision, note: decision === 'reject' ? note.trim() : '' });
    setBusy(null);
    if ('error' in res) { setError(res.error); return; }
    setRejecting(null);
    setNote('');
    const who = personName(s, r.employeeId);
    onDone(r.status === 'Cancellation requested'
      ? (decision === 'approve' ? `${who}'s leave is cancelled and the days returned.` : `${who}'s leave stays booked.`)
      : `${decision === 'approve' ? 'Approved' : 'Rejected'}: ${who}'s ${r.kind === 'correction' ? 'correction' : LEAVE_LABELS[r.type].toLowerCase()}.`);
  };
  return (
    <Panel icon={Inbox} title="Approvals" blurb={s.me.accessRole === 'manager' ? 'Leave and corrections from the people who report to you, oldest first.' : 'Leave and corrections from across the studio, oldest first. Never your own.'}>
      <AnimatePresence>{error && <Notice text={error} tone="bad" onClose={() => setError(null)} />}</AnimatePresence>
      {list.length === 0 ? <Empty text="Nothing waiting for you." /> : (
        <motion.div variants={listV} initial="hidden" animate="show" className="flex flex-col gap-3 mt-2">
          <AnimatePresence initial={false}>
            {list.map((r) => {
              const name = personName(s, r.employeeId);
              const cancelling = r.status === 'Cancellation requested';
              const session = r.correction ? s.attendance.find((a) => a.id === r.correction!.sessionId) : null;
              return (
                <motion.div key={r.id} variants={rowV} layout exit={{ opacity: 0, x: 40, transition: { duration: 0.25 } }}
                  className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 pp-lift">
                  <div className="flex flex-wrap items-start gap-3">
                    <Avatar name={name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800">{name}
                        <span className="font-semibold text-slate-500"> · {r.kind === 'correction' ? 'attendance correction' : cancelling ? `cancel ${LEAVE_LABELS[r.type].toLowerCase()}` : LEAVE_LABELS[r.type].toLowerCase()}</span></p>
                      <p className="text-xs text-slate-500">
                        {r.kind === 'correction' && r.correction
                          ? <>{niceDay(r.start)}: {session ? `${timeLabel(session.checkIn, tz)}–${session.checkOut ? timeLabel(session.checkOut, tz) : 'open'}` : 'recorded day'} → <b className="text-slate-700">{timeLabel(r.correction.checkIn, tz)}–{timeLabel(r.correction.checkOut, tz)}</b>, {r.correction.mode}</>
                          : <>{range(r.start, r.end)} · {unitsOf(r)} day{unitsOf(r) === 1 ? '' : 's'}{r.portion !== 'Full day' ? ` (${r.portion.toLowerCase()})` : ''}</>}
                        {' · '}asked {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                      {r.reason && <p className="text-[13px] text-slate-700 mt-1.5">"{r.reason}"</p>}
                    </div>
                    <span className={`${chip} ${STATUS_TINT[r.status]}`}>{cancelling ? 'Cancelling' : 'Waiting'}</span>
                  </div>
                  {rejecting === r.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input autoFocus aria-label="Reason" className={`${input} flex-1 min-w-[200px]`} maxLength={1000} placeholder={cancelling ? 'Why the leave stays booked' : 'A short reason, shared with them'} value={note} onChange={(e) => setNote(e.target.value)} />
                      <button type="button" className={btnSm} disabled={busy === r.id || note.trim().length < 3} onClick={() => decide(r, 'reject')}><X className="w-3.5 h-3.5" />{cancelling ? 'Keep it booked' : 'Reject'}</button>
                      <button type="button" className={btnSm} onClick={() => { setRejecting(null); setNote(''); }}>Back</button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={btnPri} disabled={busy === r.id} onClick={() => decide(r, 'approve')}><Check className="w-4 h-4" />{cancelling ? 'Approve cancellation' : 'Approve'}</button>
                      <button type="button" className={btnSec} disabled={busy === r.id} onClick={() => { setRejecting(r.id); setNote(''); }}>{cancelling ? 'Keep it booked' : 'Reject'}</button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </Panel>
  );
}

/* ── The team calendar ───────────────────────────────────────────────────── */

function CalendarSection({ s, onLeave }: { s: Snapshot; onLeave: (start?: string) => void }) {
  const today = todayOf(s);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState<string>(today);
  const weeks = monthGrid(month);
  const label = new Date(`${month}-15T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const away = awayOn(s, picked);
  return (
    <Panel icon={Users} title="Team calendar" blurb="Who is away or working from home, studio holidays and offs. Dashed means asked for, not yet approved."
      aside={<div className="flex items-center gap-1">
        <button type="button" className={btnSm} aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="w-3.5 h-3.5" /></button>
        <span className="text-sm font-bold text-slate-800 w-36 text-center">{label}</span>
        <button type="button" className={btnSm} aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="w-3.5 h-3.5" /></button>
      </div>}>
      <div className="grid grid-cols-7 gap-1.5 text-center mb-1.5">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{d}</span>)}
      </div>
      <motion.div key={month} variants={listV} initial="hidden" animate="show" className="grid grid-cols-7 gap-1.5">
        {weeks.flat().map((d) => {
          const kind = dayKind(s.policy, d);
          const people = awayOn(s, d);
          const inMonth = d.slice(0, 7) === month;
          return (
            <motion.button key={d} type="button" variants={rowV} onClick={() => setPicked(d)} aria-pressed={picked === d}
              className={`min-h-[76px] rounded-xl border p-1.5 text-left flex flex-col gap-1 transition-colors ${!inMonth ? 'opacity-40' : ''} ${picked === d ? 'border-[#3D52A0] ring-2 ring-[#3D52A0]/20' : 'border-slate-200 hover:border-slate-300'} ${kind === 'work' ? 'bg-white' : 'bg-slate-50'}`}>
              <span className={`text-xs font-black tabular-nums ${d === today ? 'w-6 h-6 rounded-full bg-[#3D52A0] text-white grid place-items-center' : 'text-slate-700'}`}>{Number(d.slice(8))}</span>
              {kind === 'holiday' && <span className="text-[10px] font-semibold text-emerald-700 leading-tight line-clamp-2">{s.policy.holidayNames?.[d] || 'Holiday'}</span>}
              {kind === 'off' && <span className="text-[10px] text-slate-400">Off</span>}
              {kind === 'work' && people.length > 0 && (
                <span className="flex flex-wrap gap-0.5">
                  {people.slice(0, 4).map((p) => (
                    <span key={p.personId} className={`w-5 h-5 rounded-full text-[9px] font-black grid place-items-center ${p.mode === 'WFH' ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-amber-100 text-amber-700'} ${p.pending ? 'border border-dashed border-current' : ''}`} title={`${p.name}: ${p.mode === 'WFH' ? 'from home' : 'away'}`}>
                      {p.name.slice(0, 1)}
                    </span>
                  ))}
                  {people.length > 4 && <span className="text-[10px] text-slate-500">+{people.length - 4}</span>}
                </span>
              )}
            </motion.button>
          );
        })}
      </motion.div>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-bold text-slate-800">{niceDay(picked)}</p>
        <p className="text-xs text-slate-500 flex-1">
          {dayKind(s.policy, picked) === 'holiday' ? s.policy.holidayNames?.[picked] || 'Studio holiday'
            : dayKind(s.policy, picked) === 'off' ? 'Studio off day'
            : away.length ? away.map((a) => `${a.name} (${a.mode === 'WFH' ? 'from home' : a.portion === 'Full day' ? 'away' : a.portion.toLowerCase()}${a.pending ? ', asked' : ''})`).join(', ')
            : 'Everyone in.'}
        </p>
        {dayKind(s.policy, picked) === 'work' && picked >= today && <button type="button" className={btnSm} onClick={() => onLeave(picked)}><Plus className="w-3.5 h-3.5" />Take this day off</button>}
      </div>
    </Panel>
  );
}

/* ── Directory ───────────────────────────────────────────────────────────── */

const TEAM: Record<string, string> = { leadership: 'Leadership', design: 'Design', site: 'Site', 'client-relations': 'Client relations', ops: 'Operations', studio: 'Studio' };

function DirectorySection({ s }: { s: Snapshot }) {
  const [q, setQ] = useState('');
  const today = todayOf(s);
  const awayToday = new Map(awayOn(s, today).map((a) => [a.personId, a]));
  const people = [...s.people].filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name))
    .filter((p) => !q.trim() || `${p.name} ${p.title} ${TEAM[p.teamId] || ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Panel icon={BookUser} title="Directory" blurb="Everyone in the studio, who they report to, and whether they are away today."
      aside={<label className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" /><input aria-label="Search people" className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 w-44" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></label>}>
      {people.length === 0 ? <Empty text="Nobody matches." /> : (
        <motion.div variants={listV} initial="hidden" animate="show" key={q} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {people.map((p) => {
            const away = awayToday.get(p.id);
            return (
              <motion.div key={p.id} variants={rowV} className="rounded-2xl border border-slate-200 p-4 flex items-center gap-3 pp-lift">
                <Avatar name={p.name} ring={away && away.mode !== 'WFH' ? 'warn' : null} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 truncate">{p.name}{p.id === s.me.id ? ' (you)' : ''}</p>
                  <p className="text-[11px] text-slate-500 truncate">{p.title || TEAM[p.teamId] || 'Studio'}{p.managerId ? ` · reports to ${personName(s, p.managerId)}` : ''}</p>
                </div>
                {away && <span className={`${chip} ${away.mode === 'WFH' ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-amber-100 text-amber-700'}`}>{away.mode === 'WFH' ? 'From home' : 'Away'}</span>}
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </Panel>
  );
}

/* ── The monthly report ──────────────────────────────────────────────────── */

function ReportSection({ s }: { s: Snapshot }) {
  const [month, setMonth] = useState(todayOf(s).slice(0, 7));
  const rows = monthReport(s, month);
  const label = new Date(`${month}-15T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const download = () => {
    const blob = new Blob([attendanceCsv(s, month)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const totals = rows.reduce((t, r) => ({ present: t.present + r.present, late: t.late + r.late, away: t.away + r.awayDays }), { present: 0, late: 0, away: 0 });
  return (
    <Panel icon={FileSpreadsheet} title="Monthly report" blurb={s.me.accessRole === 'manager' ? 'You and the people who report to you.' : 'Everyone in the studio. Covers the last four months.'}
      aside={<div className="flex items-center gap-1">
        <button type="button" className={btnSm} aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="w-3.5 h-3.5" /></button>
        <span className="text-sm font-bold text-slate-800 w-36 text-center">{label}</span>
        <button type="button" className={btnSm} aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="w-3.5 h-3.5" /></button>
        <button type="button" className={`${btnSm} ml-2`} onClick={download}><Download className="w-3.5 h-3.5" />CSV</button>
      </div>}>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {([['Days present', totals.present], ['Late arrivals', totals.late], ['Leave days taken', totals.away]] as [string, number][]).map(([k, v], i) => (
          <motion.div key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, ease: EASE }} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k}</p>
            <p className="text-sm font-black text-slate-800 tabular-nums mt-1"><CountUp value={v} /></p>
          </motion.div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[640px] text-xs">
          <thead><tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50">
            <th className="px-3 py-2">Person</th><th className="px-3 py-2 text-right">Present</th><th className="px-3 py-2 text-right">Office</th><th className="px-3 py-2 text-right">Site</th>
            <th className="px-3 py-2 text-right">Home</th><th className="px-3 py-2 text-right">Late</th><th className="px-3 py-2 text-right">Hours</th><th className="px-3 py-2 text-right">Leave</th><th className="px-3 py-2 text-right">Open</th>
          </tr></thead>
          <motion.tbody variants={listV} initial="hidden" animate="show" key={month} className="divide-y divide-slate-100">
            {rows.map((r) => (
              <motion.tr key={r.person.id} variants={rowV}>
                <td className="px-3 py-2"><span className="flex items-center gap-2"><Avatar name={r.person.name} size="sm" /><span className="text-sm font-semibold text-slate-800">{r.person.name}</span></span></td>
                <td className="px-3 py-2 text-right font-bold text-slate-800 tabular-nums">{r.present}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.office}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.site}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.wfh}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.late ? 'text-amber-700 font-bold' : ''}`}>{r.late}</td>
                <td className="px-3 py-2 text-right tabular-nums">{duration(r.minutes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.awayDays}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.open ? 'text-rose-700 font-bold' : ''}`}>{r.open}</td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Open: checked in, never checked out. The CSV has every session with times, mode, site and where.</p>
    </Panel>
  );
}
