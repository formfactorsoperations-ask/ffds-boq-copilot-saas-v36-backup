import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChartColumn, ChevronLeft, ChevronRight, Download, Fingerprint, Sunrise, TreePalm, Clock, Search, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle,
  IndianRupee, Hourglass, BadgeCheck, Wallet, ChevronDown, Route, CalendarRange, House,
} from '@/lib/lucide-shim';
import { LEAVE_LABELS, addDays, isOff, type Snapshot } from '../../lib/peopleDesk';
import {
  monthReport, attendanceCsv, shiftMonth, todayOf, duration, currentFy, fyLabel, leaveYear, leaveYearCsv, CHARGED, personName, type ReportRow, type LeaveYearRow,
} from '../../lib/peopleView';
import { claimsMonth, claimsCsv, canDelete, inr, type ClaimsView, type ClaimRow } from '../../lib/peopleClaims';
import { fetchPeopleMonth } from '../../services/peopleService';
import { CountUp } from '../ui/HudBits';
import { btnSm } from '../opsDesk/OpsDeskPanels';
import { Panel, Notice, Skeleton, Glide, IconTile, Avatar, Empty, listV, rowV, EASE, LEAVE_ICON, type RingTone } from './PeopleBits';
import { TripRow, DeleteTrip } from './TravelClaims';

/*
  PEOPLE'S REPORTS (the owner, 4 Nov 2026: "make the monthly report more
  usable for founders"). Three views of the studio, each with its own
  spreadsheet:

    Attendance   a month, person by person: days present against working
                 days, late, hours, leave; who needs a look; search and sort.
    Travel       founders: a month's travel claims, person by person, with
                 each trip a tap away (lib/peopleClaims.ts).
    Leave year   a leave year: what each person has taken and has left, by
                 type, and when in the year they took it.
*/

type Tab = 'attendance' | 'travel' | 'leave';
const money = (v: number) => inr(v);
const monthName = (m: string) => new Date(`${m}-15T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

function download(text: string, name: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** The first month the snapshot covers in full; older months are fetched for the report. */
const coveredFrom = (s: Snapshot) => shiftMonth(addDays(todayOf(s), -120).slice(0, 7), 1);

/** Working days in a month so far (or all of it, once it is over): the studio's offs and holidays left out. */
function workingDays(s: Snapshot, month: string): number {
  const today = todayOf(s);
  let n = 0;
  for (let d = `${month}-01`; d.slice(0, 7) === month && d <= today; d = addDays(d, 1)) if (!isOff(d, s.policy)) n++;
  return n;
}

export function ReportSection({ s, claims }: { s: Snapshot; claims: ClaimsView | null }) {
  const founder = !!claims?.founder;
  const [tab, setTab] = useState<Tab>('attendance');
  const [month, setMonth] = useState(todayOf(s).slice(0, 7));
  const [fy, setFy] = useState(currentFy(s));
  const [query, setQuery] = useState('');
  const thisMonth = todayOf(s).slice(0, 7);
  const years = useMemo(() => { const now = Number(currentFy(s)); return [now - 1, now, now + 1].map(String); }, [s]);
  return (
    <Panel icon={ChartColumn} title="Reports"
      blurb={s.me.accessRole === 'manager' ? 'You and the people who report to you.' : founder ? 'Attendance, travel claims and leave across the studio, with a spreadsheet for each.' : 'Attendance and leave across the studio, with a spreadsheet for each.'}
      aside={tab === 'leave'
        ? <Glide id="report-fy" label="Leave year" value={fy} onChange={setFy} options={years.map((y) => ({ id: y, label: fyLabel(y) }))} />
        : <div className="flex items-center gap-1">
          <button type="button" className={btnSm} aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="w-3.5 h-3.5" /></button>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={month} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="text-sm font-bold text-slate-800 w-36 text-center">{monthName(month)}</motion.span>
          </AnimatePresence>
          <button type="button" className={btnSm} aria-label="Next month" disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Glide id="report-tab" label="Report" value={tab} onChange={(v) => setTab(v)} options={[
          { id: 'attendance', label: 'Attendance' },
          ...(founder ? [{ id: 'travel' as Tab, label: 'Travel claims' }] : []),
          { id: 'leave', label: 'Leave year' },
        ]} />
        <label className="relative ml-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input aria-label="Find a person" className="pl-8 pr-3 py-2 w-52 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]" placeholder="Find a person" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
        {tab === 'attendance' && <AttendanceReport s={s} month={month} query={query} />}
        {tab === 'travel' && founder && claims && <TravelReport s={s} claims={claims} month={month} query={query} />}
        {tab === 'leave' && <LeaveYearReport s={s} fy={fy} query={query} />}
      </motion.div>
    </Panel>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────────────── */

function Tiles({ items }: { items: [React.ComponentType<any>, string, number, RingTone, ((v: number) => string)?][] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {items.map(([Icon, k, v, tone, format], i) => (
        <motion.div key={k} initial={{ opacity: 0, y: 8, rotateX: -40 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: i * 0.07, duration: 0.5, ease: EASE }} style={{ transformPerspective: 600 }}
          className="group rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-3">
          <IconTile icon={Icon} tone={tone} size="sm" />
          <span className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight">{k}</p>
            <p className="text-sm font-black text-slate-800 tabular-nums mt-1"><CountUp value={v} format={format} /></p></span>
        </motion.div>
      ))}
    </div>
  );
}

type Sort<K extends string> = { key: K; dir: 1 | -1 };
function Th<K extends string>({ k, sort, onSort, children, right = true }: { k: K; sort: Sort<K>; onSort: (s: Sort<K>) => void; children: React.ReactNode; right?: boolean }) {
  const on = sort.key === k;
  const Icon = !on ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th className={`px-3 py-2 ${right ? 'text-right' : 'text-left'}`} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort({ key: k, dir: on ? (sort.dir === 1 ? -1 : 1) : -1 })}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-[#3D52A0] ${on ? 'text-[#3D52A0]' : ''}`}>
        {children}<Icon className="w-3 h-3" />
      </button>
    </th>
  );
}
function sorted<T, K extends string>(rows: T[], sort: Sort<K>, get: (r: T, k: K) => number | string): T[] {
  return [...rows].sort((a, b) => {
    const x = get(a, sort.key), y = get(b, sort.key);
    return (typeof x === 'string' ? x.localeCompare(String(y)) : x - Number(y)) * sort.dir;
  });
}
const matches = (name: string, q: string) => !q.trim() || name.toLowerCase().includes(q.trim().toLowerCase());

/** A thin bar that fills to `value` (0 to 1). */
function Bar({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'ok' | 'warn' }) {
  const fill = tone === 'ok' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-[#3D52A0]';
  return (
    <span className="block h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <motion.span className={`block h-full rounded-full ${fill}`} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={{ duration: 0.8, ease: EASE }} />
    </span>
  );
}

/* ── Attendance ──────────────────────────────────────────────────────────── */

type AttKey = 'name' | 'present' | 'office' | 'site' | 'wfh' | 'late' | 'minutes' | 'awayDays' | 'open';
function AttendanceReport({ s, month, query }: { s: Snapshot; month: string; query: string }) {
  const [older, setOlder] = useState<{ month: string; s: Snapshot | null; error?: string } | null>(null);
  const [sort, setSort] = useState<Sort<AttKey>>({ key: 'name', dir: 1 });
  const old = month < coveredFrom(s);
  useEffect(() => {
    if (!old || older?.month === month) return;
    let live = true;
    setOlder({ month, s: null });
    fetchPeopleMonth(month).then((x) => { if (live) setOlder({ month, s: x }); }).catch((e) => { if (live) setOlder({ month, s: null, error: String(e?.message || 'Could not load that month.') }); });
    return () => { live = false; };
  }, [month, old]);
  const source = old ? (older?.month === month ? older.s : null) : s;
  const rows = useMemo(() => (source ? monthReport(source, month) : []), [source, month]);
  const work = useMemo(() => workingDays(s, month), [s, month]);
  const shown = sorted<ReportRow, AttKey>(rows.filter((r) => matches(r.person.name, query)), sort, (r, k) => (k === 'name' ? r.person.name : (r as any)[k] as number));
  const totals = rows.reduce((t, r) => ({ present: t.present + r.present, late: t.late + r.late, away: t.away + r.awayDays, minutes: t.minutes + r.minutes }), { present: 0, late: 0, away: 0, minutes: 0 });
  /* Who needs a look this month: late three times or more, a day never checked out, or little presence with no leave to explain it. */
  const flags = rows.flatMap((r) => [
    r.late >= 3 ? { id: `${r.person.id}-late`, name: r.person.name, text: `late ${r.late} times`, tone: 'warn' as const } : null,
    r.open > 0 ? { id: `${r.person.id}-open`, name: r.person.name, text: `${r.open} day${r.open === 1 ? '' : 's'} not checked out`, tone: 'bad' as const } : null,
    work >= 5 && r.present + r.awayDays < work * 0.6 ? { id: `${r.person.id}-gap`, name: r.person.name, text: `${r.present + r.awayDays} of ${work} working days accounted for`, tone: 'warn' as const } : null,
  ].filter(Boolean)) as { id: string; name: string; text: string; tone: 'warn' | 'bad' }[];
  return (
    <>
      {old && !source && (older?.error ? <Notice text={older.error} tone="bad" /> : <div className="space-y-2 mb-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 rounded-xl" />)}</div>)}
      <Tiles items={[
        [Fingerprint, 'Days present', totals.present, 'brand'],
        [Sunrise, 'Late arrivals', totals.late, 'warn'],
        [TreePalm, 'Leave days taken', totals.away, 'ok'],
        [Clock, 'Hours worked', Math.round(totals.minutes / 60), 'brand'],
      ]} />
      <AnimatePresence initial={false}>
        {flags.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5" />Worth a look</p>
            <motion.div variants={listV} initial="hidden" animate="show" className="flex flex-wrap gap-2">
              {flags.map((f) => (
                <motion.span key={f.id} variants={rowV} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white border ${f.tone === 'bad' ? 'border-rose-200 text-rose-700' : 'border-amber-200 text-amber-800'}`}>
                  <b className="text-slate-800">{f.name}</b> {f.text}
                </motion.span>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] text-xs">
          <thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50">
            <Th k="name" sort={sort} onSort={setSort} right={false}>Person</Th>
            <Th k="present" sort={sort} onSort={setSort}>Present</Th>
            <Th k="office" sort={sort} onSort={setSort}>Office</Th>
            <Th k="site" sort={sort} onSort={setSort}>Site</Th>
            <Th k="wfh" sort={sort} onSort={setSort}>Home</Th>
            <Th k="late" sort={sort} onSort={setSort}>Late</Th>
            <Th k="minutes" sort={sort} onSort={setSort}>Hours</Th>
            <Th k="awayDays" sort={sort} onSort={setSort}>Leave</Th>
            <Th k="open" sort={sort} onSort={setSort}>Open</Th>
          </tr></thead>
          <motion.tbody variants={listV} initial="hidden" animate="show" key={month} className="divide-y divide-slate-100">
            {shown.map((r: ReportRow) => (
              <motion.tr key={r.person.id} variants={rowV} className="hover:bg-slate-50/70">
                <td className="px-3 py-2"><span className="flex items-center gap-2"><Avatar name={r.person.name} size="sm" /><span className="text-sm font-semibold text-slate-800">{r.person.name}</span></span></td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex flex-col items-end gap-1 w-24">
                    <span className="font-bold text-slate-800 tabular-nums">{r.present}{work ? <span className="font-normal text-slate-500"> / {work}</span> : ''}</span>
                    {work > 0 && <Bar value={(r.present + r.awayDays) / work} tone={(r.present + r.awayDays) >= work ? 'ok' : 'brand'} />}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.office}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.site}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.wfh}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.late >= 3 ? 'text-amber-700 font-bold' : ''}`}>{r.late}</td>
                <td className="px-3 py-2 text-right tabular-nums">{duration(r.minutes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.awayDays}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.open ? 'text-rose-700 font-bold' : ''}`}>{r.open}</td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
        {shown.length === 0 && <p className="text-xs text-slate-500 px-3 py-4">No one matches “{query}”.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <p className="text-[11px] text-slate-500 flex-1 min-w-0">Present: days checked in, against {work} working day{work === 1 ? '' : 's'} so far (offs and holidays left out); the bar counts leave too. Open: checked in, never checked out.</p>
        <button type="button" className={btnSm} disabled={!source} onClick={() => source && download(attendanceCsv(source, month), `attendance-${month}.csv`)}><Download className="w-3.5 h-3.5" />Attendance CSV</button>
      </div>
    </>
  );
}

/* ── Travel ──────────────────────────────────────────────────────────────── */

type TravelKey = 'name' | 'trips' | 'km' | 'claimed' | 'waiting' | 'approved' | 'paid';
function TravelReport({ s, claims, month, query }: { s: Snapshot; claims: ClaimsView; month: string; query: string }) {
  const [sort, setSort] = useState<Sort<TravelKey>>({ key: 'claimed', dir: -1 });
  const [open, setOpen] = useState<string | null>(null);
  const nameOf = (id: string) => personName(s, id);
  const { rows, totals } = useMemo(() => claimsMonth(claims.all, month, nameOf), [claims.all, month, s]);
  const shown = sorted<ClaimRow, TravelKey>(rows.filter((r) => matches(r.name, query)), sort, (r, k) => (k === 'name' ? r.name : r.totals[k]));
  const top = Math.max(1, ...rows.map((r) => r.totals.claimed));
  return (
    <>
      <Tiles items={[
        [IndianRupee, 'Claimed', totals.claimed, 'brand', money],
        [Hourglass, 'Waiting', totals.waiting, 'warn', money],
        [BadgeCheck, 'Approved', totals.approved, 'ok', money],
        [Wallet, 'Paid back', totals.paid, 'brand', money],
      ]} />
      {rows.length === 0 ? <Empty icon={Route} text={`No trips logged in ${monthName(month)}.`} /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-xs">
            <thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50">
              <Th k="name" sort={sort} onSort={setSort} right={false}>Person</Th>
              <Th k="trips" sort={sort} onSort={setSort}>Trips</Th>
              <Th k="km" sort={sort} onSort={setSort}>Km</Th>
              <Th k="claimed" sort={sort} onSort={setSort}>Claimed</Th>
              <Th k="waiting" sort={sort} onSort={setSort}>Waiting</Th>
              <Th k="approved" sort={sort} onSort={setSort}>Approved</Th>
              <Th k="paid" sort={sort} onSort={setSort}>Paid back</Th>
            </tr></thead>
            <motion.tbody variants={listV} initial="hidden" animate="show" key={month} className="divide-y divide-slate-100">
              {shown.map((r: ClaimRow) => (
                <React.Fragment key={r.personId}>
                  <motion.tr variants={rowV} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => setOpen(open === r.personId ? null : r.personId)} aria-expanded={open === r.personId}>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <Avatar name={r.name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="text-sm font-semibold text-slate-800 flex items-center gap-1">{r.name}<motion.span animate={{ rotate: open === r.personId ? 180 : 0 }} className="inline-flex"><ChevronDown className="w-3.5 h-3.5 text-slate-400" /></motion.span></span>
                          <span className="block w-32 mt-1"><Bar value={r.totals.claimed / top} /></span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.totals.trips}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Math.round(r.totals.km)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-800">{money(r.totals.claimed)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.totals.waiting ? 'text-amber-700 font-bold' : ''}`}>{money(r.totals.waiting)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.totals.approved)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.totals.paid)}</td>
                  </motion.tr>
                  {open === r.personId && (
                    <tr><td colSpan={7} className="p-0 bg-slate-50/60">
                      <motion.div variants={listV} initial="hidden" animate="show" className="divide-y divide-slate-100">
                        <AnimatePresence initial={false}>{r.trips.map((c) => <TripRow key={c.id} c={c} right={canDelete(s.me, c) ? <DeleteTrip c={c} /> : null} />)}</AnimatePresence>
                      </motion.div>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </motion.tbody>
          </table>
          {shown.length === 0 && <p className="text-xs text-slate-500 px-3 py-4">No one matches “{query}”.</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <p className="text-[11px] text-slate-500 flex-1 min-w-0">Claimed counts every trip but those not approved. Approved includes paid back. Tap a person to see their trips; approve and pay back in Travel.</p>
        <button type="button" className={btnSm} disabled={!rows.length} onClick={() => download(claimsCsv(claims.all, month, nameOf), `travel-claims-${month}.csv`)}><Download className="w-3.5 h-3.5" />Travel CSV</button>
      </div>
    </>
  );
}

/* ── The leave year ──────────────────────────────────────────────────────── */

type LeaveKey = 'name' | 'taken' | 'left' | 'wfh' | 'PL' | 'SL' | 'CL' | 'COMP';
const MONTHS = ['A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D', 'J', 'F', 'M'];
function LeaveYearReport({ s, fy, query }: { s: Snapshot; fy: string; query: string }) {
  const [sort, setSort] = useState<Sort<LeaveKey>>({ key: 'name', dir: 1 });
  const rows = useMemo(() => leaveYear(s, fy), [s, fy]);
  const shown = sorted<LeaveYearRow, LeaveKey>(rows.filter((r) => matches(r.person.name, query)), sort, (r, k) =>
    k === 'name' ? r.person.name : k === 'taken' || k === 'left' || k === 'wfh' ? r[k] : r.balances[k].available);
  const totals = rows.reduce((t, r) => ({ taken: t.taken + r.taken, left: t.left + r.left, wfh: t.wfh + r.wfh }), { taken: 0, left: 0, wfh: 0 });
  const low = rows.filter((r) => r.balances.PL.entitled > 0 && r.balances.PL.available <= 1).length;
  const peak = Math.max(1, ...rows.flatMap((r) => r.byMonth));
  const start = s.policy.fiscalStartMonth || 4;
  const months = MONTHS.map((_, i) => new Date(2026, (start - 1 + i) % 12, 15).toLocaleDateString('en-IN', { month: 'short' }));
  return (
    <>
      <Tiles items={[
        [TreePalm, 'Leave taken', totals.taken, 'ok'],
        [CalendarRange, 'Leave left', totals.left, 'brand'],
        [House, 'Days from home', totals.wfh, 'brand'],
        [AlertTriangle, '1 day of paid leave or less', low, 'warn'],
      ]} />
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[900px] text-xs">
          <thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50">
            <Th k="name" sort={sort} onSort={setSort} right={false}>Person</Th>
            {CHARGED.map((t) => <React.Fragment key={t}><Th k={t as LeaveKey} sort={sort} onSort={setSort}>{LEAVE_LABELS[t]}</Th></React.Fragment>)}
            <Th k="taken" sort={sort} onSort={setSort}>Taken</Th>
            <Th k="left" sort={sort} onSort={setSort}>Left</Th>
            <Th k="wfh" sort={sort} onSort={setSort}>Home</Th>
            <th className="px-3 py-2 text-left">Through the year</th>
          </tr></thead>
          <motion.tbody variants={listV} initial="hidden" animate="show" key={fy} className="divide-y divide-slate-100">
            {shown.map((r: LeaveYearRow) => (
              <motion.tr key={r.person.id} variants={rowV} className="hover:bg-slate-50/70">
                <td className="px-3 py-2"><span className="flex items-center gap-2"><Avatar name={r.person.name} size="sm" /><span className="text-sm font-semibold text-slate-800">{r.person.name}</span></span></td>
                {CHARGED.map((t) => {
                  const b = r.balances[t];
                  const Icon = LEAVE_ICON[t];
                  return (
                    <td key={t} className="px-3 py-2 text-right" title={`${LEAVE_LABELS[t]}: ${b.used} taken, ${b.reserved} waiting, ${b.available} left of ${b.entitled}`}>
                      <span className="inline-flex flex-col items-end gap-1 w-20">
                        <span className="tabular-nums"><b className={b.available <= 0 && b.entitled ? 'text-rose-700' : b.available <= 1 && b.entitled ? 'text-amber-700' : 'text-slate-800'}>{b.available}</b><span className="text-slate-500"> left of {b.entitled}</span></span>
                        <span className="flex items-center gap-1 w-full"><Icon className="w-3 h-3 text-slate-400 shrink-0" /><Bar value={b.entitled ? b.used / b.entitled : 0} tone={b.available <= 1 && b.entitled ? 'warn' : 'ok'} /></span>
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-800">{r.taken}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-[#3D52A0]">{r.left}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.wfh}</td>
                <td className="px-3 py-2">
                  <span className="flex items-end gap-0.5 h-6" aria-label={`Leave by month: ${r.byMonth.map((n, i) => `${months[i]} ${n}`).join(', ')}`}>
                    {r.byMonth.map((n, i) => (
                      <motion.span key={i} title={`${months[i]}: ${n} day${n === 1 ? '' : 's'}`} className={`w-2 rounded-sm ${n ? 'bg-emerald-500' : 'bg-slate-200'}`}
                        initial={{ height: 2 }} animate={{ height: n ? Math.max(4, (n / peak) * 24) : 2 }} transition={{ delay: 0.2 + i * 0.03, duration: 0.5, ease: EASE }} />
                    ))}
                  </span>
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
        {shown.length === 0 && <p className="text-xs text-slate-500 px-3 py-4">No one matches “{query}”.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <p className="text-[11px] text-slate-500 flex-1 min-w-0">Left counts leave waiting for approval as spoken for. Taken is approved paid, sick, casual and comp-off leave in {fyLabel(fy)}; the bars show when in the year ({months[0]} to {months[11]}).</p>
        <button type="button" className={btnSm} onClick={() => download(leaveYearCsv(rows, fy), `leave-${fyLabel(fy).replace(/\s+/g, '-')}.csv`)}><Download className="w-3.5 h-3.5" />Leave CSV</button>
      </div>
    </>
  );
}
