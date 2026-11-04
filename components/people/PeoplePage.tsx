import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNoteArrivals } from '../notify/NotifyContext';
import {
  Sunrise, Fingerprint, TreePalm, Stamp, CalendarDays, ChartColumn, Plus, RefreshCw, ChevronLeft, ChevronRight, MapPin, Download, Check, X, Search,
  PartyPopper, Inbox, Users, Sparkles, Wrench, History, RotateCcw, BookUser, HandHeart, Building2, HeartPulse, Route,
} from '@/lib/lucide-shim';
import { LEAVE_LABELS, addDays, clock12, isLate, type Attendance, type Balance, type LeaveType, type RequestRecord, type Snapshot, type Status } from '../../lib/peopleDesk';
import {
  myDay, minutesWorked, duration, whereLabel, mapLink, CHARGED, currentFy, fyLabel, unitsOf, awaitingMe, personName,
  monthGrid, shiftMonth, awayOn, dayKind, monthReport, attendanceCsv, todayOf,
} from '../../lib/peopleView';
import { usePeople, runPeople, fetchPeopleMonth } from '../../services/peopleService';
import { StudioBar, BarStrip, BarButton } from '../ui/StudioBar';
import { CountUp, Dot } from '../ui/HudBits';
import MyDayCard from './MyDayCard';
import { LeaveSheet, CorrectionSheet } from './PeopleSheets';
import { Ring, Avatar, Skeleton, Glide, Notice, IconTile, Tilt, Panel, Empty, LEAVE_ICON, MODE_ICON, initials, listV, rowV, sectionV, EASE } from './PeopleBits';
import { StudioPulse, ArrivalToasts, useToday } from './Arrivals';
import PeopleCalendar from './PeopleCalendar';
import { useGuide, kudosSeenAt, markKudosSeen } from '../../services/peopleGuideService';
import { wantedPeopleSection, clearPeopleSection, onPeopleSection } from '../../lib/peopleSection';
import { OfficeGuideSection } from './OfficeGuide';
import { CelebrationsSection, CelebrationBanner } from './Celebrations';
import { KudosWallSection } from './KudosWall';
import { EssentialsSection } from './OfficeEssentials';
import { EmergencySection } from './EmergencyContacts';
import { TravelSection, ClaimApprovals } from './TravelClaims';
import { ReportSection } from './PeopleReport';
import { useClaims } from '../../services/peopleClaimsService';
import type { ClaimsView } from '../../lib/peopleClaims';
import { btnPri, btnSec, btnSm, input } from '../opsDesk/OpsDeskPanels';

/*
  PEOPLE (lib/peopleDesk.ts): attendance and leave for everyone in the
  studio. Each person has their day, their attendance and their leave;
  managers and admins also approve, see their people's attendance and the
  monthly report. Everyone sees the team calendar, which shows only who is
  away, never why. Built to DESIGN.md, with the People motion kit the owner
  approved ("People motion").

  From 27 Oct 2026 People also holds the studio's own life (lib/peopleGuide.ts):
  the office guide (which replaced the Directory), office essentials,
  celebrations, the kudos wall and each person's emergency contacts.
*/

type Section = 'today' | 'attendance' | 'leave' | 'travel' | 'approvals' | 'calendar' | 'guide' | 'celebrations' | 'kudos' | 'essentials' | 'emergency' | 'report';
const SECTION_IDS: Section[] = ['today', 'attendance', 'leave', 'travel', 'approvals', 'calendar', 'guide', 'celebrations', 'kudos', 'essentials', 'emergency', 'report'];
const asSection = (x: string): Section | null => (SECTION_IDS.includes(x as Section) ? (x as Section) : null);
const chip = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap';
const niceDay = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const range = (a: string, b: string) => (a === b ? niceDay(a) : `${niceDay(a)} – ${niceDay(b)}`);
const STATUS_TINT: Record<Status, string> = {
  Pending: 'bg-amber-100 text-amber-700', Approved: 'bg-emerald-100 text-emerald-700', Rejected: 'bg-rose-100 text-rose-700',
  Withdrawn: 'bg-slate-100 text-slate-600', 'Cancellation requested': 'bg-amber-100 text-amber-700', Cancelled: 'bg-slate-100 text-slate-600',
};

export default function PeoplePage({ projects = [] }: { projects?: any[] }) {
  const { snapshot, loading, error, stale, at, refresh } = usePeople();
  /* The office guide, essentials, cards, kudos and emergency contacts (lib/peopleGuide.ts), loaded beside the snapshot. */
  const guide = useGuide();
  /* Travel claims (lib/peopleClaims.ts): your trips, and the founders' to approve and pay back. */
  const claims = useClaims();
  /* A note or a Home pin can open People at a section (lib/peopleSection.ts). */
  const [section, setSection] = useState<Section>(() => asSection(wantedPeopleSection()) || 'today');
  useEffect(() => {
    clearPeopleSection();
    return onPeopleSection((x) => { const want = asSection(x); if (want) setSection(want); });
  }, []);
  const [leaveOpen, setLeaveOpen] = useState<{ start?: string } | null>(null);
  const [correcting, setCorrecting] = useState<Attendance | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sites = useMemo(() => [...new Set(projects.map((p) => String(p?.context?.name || '')).filter(Boolean))].sort(), [projects]);
  /* Projects a trip can be for (lib/peopleClaims.ts): the ones this person can see. */
  const projectPicks = useMemo(() => projects.filter((p) => p?.id && p?.context?.name).map((p) => ({ id: String(p.id), name: String(p.context.name), sub: [p.context.clientName, p.context.status].filter(Boolean).join(' · ') })).sort((a, b) => a.name.localeCompare(b.name)), [projects]);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 4500); return () => window.clearTimeout(t); }, [notice]);
  /* Those who approve see arrivals as they happen: refresh every minute while People is open and on screen. */
  const approving = !!snapshot && snapshot.me.accessRole !== 'employee';
  useEffect(() => {
    if (!approving) return;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);
    return () => window.clearInterval(t);
  }, [approving]);
  /* And at once, when a note says someone checked in or asked for leave: the arrivals board and approvals catch up (components/notify). The minute's refresh stays for what no note covers. */
  useNoteArrivals((n) => n.kind.startsWith('people.'), () => refresh());
  /* A thank-you, or your emergency contacts opened: the guide catches up. */
  useNoteArrivals((n) => n.kind.startsWith('guide.'), () => guide.refresh());
  /* A trip logged, decided or paid back: the claims catch up. */
  useNoteArrivals((n) => n.kind.startsWith('claims.'), () => claims.refresh());
  /* Thank-yous pinned up since this person last looked at the wall, counted on its rail item. */
  const meId = snapshot?.me.id || '';
  const [kudosSeen, setKudosSeen] = useState('');
  useEffect(() => {
    if (!meId) return;
    if (section === 'kudos') { markKudosSeen(meId); setKudosSeen(new Date().toISOString()); } else setKudosSeen(kudosSeenAt(meId));
  }, [meId, section]);

  if (!snapshot) {
    return (
      <div className="pb-28">
        <StudioBar className="mb-6">
          <BarStrip label="Leave left"><span className="text-xs font-semibold text-slate-500">{error ? 'Not available' : 'Loading…'}</span></BarStrip>
        </StudioBar>
        {error ? <Panel icon={Users} title="People could not open" blurb={error}><button type="button" className={btnSec} onClick={refresh}><RefreshCw className="w-4 h-4" />Try again</button></Panel>
          : <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6"><div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div><Skeleton className="h-64 rounded-3xl" /></div>}
      </div>
    );
  }

  const s = snapshot;
  const approver = s.me.accessRole !== 'employee';
  const waiting = awaitingMe(s);
  const tripsWaiting = claims.view?.toDecide.length || 0;
  const { session } = myDay(s);
  const fy = currentFy(s);
  const bal = s.balances[fy];
  /* The rail in four groups (the owner, 28 Oct 2026): your own day, the team, the studio, and what admins run. */
  const GROUPS: { label: string; items: { id: Section; label: string; icon: React.ComponentType<any>; n?: number; show: boolean }[] }[] = [
    { label: 'My day', items: [
      { id: 'today', label: 'Today', icon: Sunrise, show: true },
      { id: 'attendance', label: 'Attendance', icon: Fingerprint, show: true },
      { id: 'leave', label: 'Leave', icon: TreePalm, n: s.requests.filter((r) => r.employeeId === s.me.id && r.status === 'Pending').length, show: true },
      { id: 'travel', label: 'Travel', icon: Route, n: tripsWaiting, show: true },
      { id: 'approvals', label: 'Approvals', icon: Stamp, n: waiting.length + tripsWaiting, show: approver || tripsWaiting > 0 },
    ] },
    { label: 'Team', items: [
      { id: 'calendar', label: 'Calendar', icon: CalendarDays, show: true },
      { id: 'guide', label: 'Office guide', icon: BookUser, show: true },
      { id: 'celebrations', label: 'Celebrations', icon: PartyPopper, n: (guide.view?.cards || []).filter((c) => c.days === 0 && !c.mine && !c.signed).length, show: true },
      { id: 'kudos', label: 'Kudos', icon: HandHeart, n: kudosSeen ? (guide.view?.kudos || []).filter((k) => k.at > kudosSeen && k.from !== s.me.id).length : 0, show: true },
    ] },
    { label: 'Studio', items: [
      { id: 'essentials', label: 'Essentials', icon: Building2, show: true },
      { id: 'emergency', label: 'Emergency contacts', icon: HeartPulse, show: true },
    ] },
    { label: 'Admin', items: [
      { id: 'report', label: 'Reports', icon: ChartColumn, show: approver },
    ] },
  ];
  const done = (msg: string) => { setLeaveOpen(null); setCorrecting(null); setNotice(msg); };

  return (
    <div className="pb-28">
      {/* Named by the shell's title row, like Projects; this is the bar under it. */}
      <StudioBar className="mb-6">
        <BarStrip label={bal ? `Leave left · ${fyLabel(fy)}` : 'Your day'}>
          {bal && (['PL', 'SL', 'CL'] as const).map((t, i) => (
            <motion.div key={t} initial={{ opacity: 0, y: 6, rotateY: -90 }} animate={{ opacity: 1, y: 0, rotateY: 0 }} transition={{ delay: 0.1 + i * 0.1, duration: 0.6, ease: EASE }} style={{ transformPerspective: 600 }}
              className="flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full border border-slate-200 bg-slate-50">
              <Ring value={bal[t].entitled ? bal[t].available / bal[t].entitled : 0} size={30} stroke={3} tone={bal[t].available <= 1 ? 'warn' : 'brand'} label={`${LEAVE_LABELS[t]}: ${bal[t].available} left`}>
                <span className="block text-[10px] leading-none font-black text-slate-800 tabular-nums"><CountUp value={bal[t].available} /></span>
              </Ring>
              <span className="text-[11px] font-bold text-slate-700">{LEAVE_LABELS[t]}</span>
            </motion.div>
          ))}
          <span className="ml-auto flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Dot tone={session ? 'ok' : 'warn'} live={!!session && !session.checkOut} />
            {session?.checkOut ? 'Day complete' : session ? 'Checked in' : 'Not checked in'}
          </span>
        </BarStrip>
        <BarButton onClick={() => { refresh(); guide.refresh(); claims.refresh(); }} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh</BarButton>
        <BarButton primary onClick={() => setLeaveOpen({})}><Plus className="w-4 h-4" />Apply for leave</BarButton>
      </StudioBar>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
        <nav aria-label="People sections" className="lg:sticky lg:top-4 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
          {GROUPS.map((g) => ({ ...g, items: g.items.filter((x) => x.show) })).filter((g) => g.items.length).map((g, gi, all) => {
            const before = all.slice(0, gi).reduce((n, x) => n + x.items.length, 0);
            return (
              <div key={g.label} role="group" aria-label={g.label} className={`flex lg:flex-col gap-1 ${gi ? 'lg:mt-3' : ''}`}>
                <p className="hidden lg:block px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{g.label}</p>
                {g.items.map((x, i) => {
                  const Icon = x.icon;
                  const on = section === x.id;
                  return (
                    <button key={x.id} type="button" onClick={() => setSection(x.id)} aria-current={on ? 'page' : undefined}
                      className={`relative lg:w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors hud-row-in whitespace-nowrap ${on ? 'text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                      style={{ animationDelay: `${(before + gi + i + 1) * 30}ms` }}>
                      {on && <motion.span layoutId="people-rail" className="absolute inset-0 rounded-xl bg-[#3D52A0] shadow-sm" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                      <motion.span className="relative inline-flex" whileHover={{ rotateY: 180 }} transition={{ duration: 0.5 }} style={{ transformPerspective: 300 }}>
                        <Icon className={`w-4 h-4 shrink-0 ${on ? 'text-white' : 'text-slate-400'}`} />
                      </motion.span>
                      <span className="relative text-sm font-semibold flex-1 min-w-0 truncate">{x.label}</span>
                      {!!x.n && <span className={`relative text-[10px] font-black px-1.5 py-0.5 rounded-full ${on ? 'bg-white/20 text-white' : x.id === 'approvals' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{x.n}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-6">
          <AnimatePresence>{notice && <Notice text={notice} onClose={() => setNotice(null)} />}</AnimatePresence>
          {error && <Notice text={error} tone="bad" />}
          {stale && !error && <Notice text={`Could not refresh just now. Showing People as of ${new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}; trying again shortly.`} tone="bad" />}
          {/* The new section swaps in at once: waiting for the old one's exit (mode="wait") delayed every switch and could stall on a blank section, as App's tabs once did. */}
          <motion.div key={section} variants={sectionV} initial="hidden" animate="show" className="space-y-6">
              {section === 'today' && <CelebrationBanner view={guide.view} onOpen={() => setSection('celebrations')} />}
              {section === 'today' && <TodaySection s={s} sites={sites} onCorrect={setCorrecting} onLeave={(start) => setLeaveOpen({ start })} onGo={setSection} waiting={waiting.length + tripsWaiting} />}
              {section === 'attendance' && <AttendanceSection s={s} onCorrect={setCorrecting} approver={approver} />}
              {section === 'leave' && <LeaveSection s={s} onApply={() => setLeaveOpen({})} onDone={setNotice} />}
              {section === 'travel' && <TravelSection s={s} view={claims.view} error={claims.error} onRefresh={claims.refresh} projects={projectPicks} />}
              {section === 'approvals' && (approver || tripsWaiting > 0) && <ApprovalsSection s={s} list={waiting} claims={claims.view} onDone={setNotice} />}
              {section === 'calendar' && <PeopleCalendar s={s} onLeave={(start) => setLeaveOpen({ start })} />}
              {section === 'guide' && <OfficeGuideSection s={s} view={guide.view} loading={guide.loading} error={guide.error} onRefresh={guide.refresh} />}
              {section === 'celebrations' && <CelebrationsSection view={guide.view} meId={s.me.id} error={guide.error} onRefresh={guide.refresh} />}
              {section === 'kudos' && <KudosWallSection view={guide.view} meId={s.me.id} error={guide.error} onRefresh={guide.refresh} />}
              {section === 'essentials' && <EssentialsSection view={guide.view} policy={s.policy} error={guide.error} onRefresh={guide.refresh} />}
              {section === 'emergency' && <EmergencySection view={guide.view} meId={s.me.id} error={guide.error} onRefresh={guide.refresh} />}
              {section === 'report' && approver && <ReportSection s={s} claims={claims.view} />}
          </motion.div>
        </div>
      </div>

      {approver && <ArrivalToasts s={s} />}
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
      {s.me.accessRole !== 'employee' && <StudioPulse s={s} />}
      {waiting > 0 && (
        <motion.button type="button" onClick={() => onGo('approvals')} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="w-full flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left pp-lift">
          <Dot tone="warn" live /><span className="text-sm font-semibold text-amber-900 flex-1">{waiting} request{waiting === 1 ? '' : 's'} waiting for your decision</span>
          <span className="text-xs font-bold text-amber-900">Review</span>
        </motion.button>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel icon={Users} title="Away today" blurb="Who is on leave or working from home. Never why.">
          {away.length === 0 ? <Empty icon={Users} text="Everyone is in today." /> : (
            <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
              {away.map((a) => (
                <motion.li key={a.personId} variants={rowV} className="flex items-center gap-3">
                  <Avatar name={a.name} ring={a.pending ? 'warn' : null} />
                  <span className="text-sm font-semibold text-slate-800 flex-1 min-w-0 truncate">{a.name}</span>
                  {a.mode === 'WFH' ? <MODE_ICON.WFH className="w-4 h-4 text-[#3D52A0]" /> : <TreePalm className="w-4 h-4 text-amber-600" />}
                  <span className={`${chip} ${a.mode === 'WFH' ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-slate-100 text-slate-600'}`}>{a.mode === 'WFH' ? 'From home' : a.portion === 'Full day' ? 'Away' : a.portion}</span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Panel>
        <Panel icon={CalendarDays} title="Your leave ahead" blurb="Asked for or approved." aside={<button type="button" className={btnSm} onClick={() => onLeave()}><Plus className="w-3.5 h-3.5" />Apply</button>}>
          {mine.length === 0 ? <Empty icon={TreePalm} text="Nothing booked. Plan a break?" /> : (
            <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
              {mine.map((r) => (
                <motion.li key={r.id} variants={rowV} className="flex items-center gap-3">
                  <IconTile icon={LEAVE_ICON[r.type]} size="sm" tone={r.type === 'SL' ? 'warn' : 'brand'} />
                  <span className="text-sm font-semibold text-slate-800 flex-1 min-w-0 truncate">{range(r.start, r.end)}<span className="block text-[11px] font-normal text-slate-500">{LEAVE_LABELS[r.type]}</span></span>
                  <span className={`${chip} ${STATUS_TINT[r.status]}`}>{r.status === 'Cancellation requested' ? 'Cancelling' : r.status}</span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Panel>
        <Panel icon={PartyPopper} title="Studio holidays" blurb="Coming up.">
          {holidays.length === 0 ? <Empty icon={PartyPopper} text="No holidays set yet." /> : (
            <motion.ul variants={listV} initial="hidden" animate="show" className="flex flex-col gap-2">
              {holidays.map((d) => (
                <motion.li key={d} variants={rowV} className="flex items-center gap-3">
                  <span className="pp-tile w-9 h-9 shrink-0 rounded-xl bg-emerald-100 text-emerald-700 grid place-items-center leading-none text-center">
                    <span><span className="block text-[9px] font-bold uppercase">{new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'short' })}</span><span className="block text-xs font-black tabular-nums">{Number(d.slice(8))}</span></span>
                  </span>
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
  /* Sorted once per snapshot, not on every render; names looked up once each. */
  const list = useMemo(() => {
    const names = new Map(s.people.map((p) => [p.id, personName(s, p.id)]));
    const nameOf = (id: string) => names.get(id) ?? personName(s, id);
    return s.attendance.filter((a) => (whose === 'mine' ? a.employeeId === s.me.id : a.employeeId !== s.me.id))
      .sort((a, b) => b.date.localeCompare(a.date) || nameOf(a.employeeId).localeCompare(nameOf(b.employeeId)));
  }, [s, whose]);
  const pendingFix = useMemo(() => new Set(s.requests.filter((r) => r.kind === 'correction' && r.status === 'Pending').map((r) => r.correction?.sessionId)), [s]);
  return (
    <Panel icon={Fingerprint} title="Attendance" blurb="The last four months. A day can be corrected once your approver agrees."
      aside={approver ? <Glide id="att-whose" label="Whose" value={whose} onChange={(v) => { setWhose(v); setShown(30); }} options={[{ id: 'mine', label: 'Mine' }, { id: 'team', label: 'My people' }]} /> : undefined}>
      {list.length === 0 ? <Empty icon={Fingerprint} text={whose === 'mine' ? 'No attendance yet. Check in from Today.' : 'No attendance from your people yet.'} /> : (
        <>
          <motion.div variants={listV} initial="hidden" animate="show" key={whose} className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {list.slice(0, shown).map((a) => {
              const late = isLate(a, s.policy);
              return (
                <motion.div key={a.id} variants={rowV} className="group flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-slate-50/70 transition-colors">
                  <IconTile icon={MODE_ICON[a.mode]} size="sm" tone={late ? 'warn' : a.checkOut ? 'brand' : 'slate'} />
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{new Date(`${a.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short' })}</p>
                    <p className="text-sm font-black text-slate-800 tabular-nums">{new Date(`${a.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {whose === 'team' && <span>{personName(s, a.employeeId)} · </span>}
                      {clock12(a.checkIn, s.policy.timezone)} – {a.checkOut ? clock12(a.checkOut, s.policy.timezone) : <span className="text-amber-700">{a.imported ? 'no check-out recorded' : 'not checked out'}</span>}
                      {a.checkOut && <span className="text-xs font-normal text-slate-500"> · {duration(minutesWorked(a, a.checkOut))}</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-1">
                      {a.mode}{a.site ? ` · ${a.site}` : ''} ·
                      {a.checkInLocation ? <a className="inline-flex items-center gap-0.5 hover:underline" href={mapLink(a.checkInLocation)} target="_blank" rel="noreferrer"><MapPin className="w-3 h-3" />{whereLabel(a.checkInLocation, a.mode)}</a> : <span>{whereLabel(null, a.mode)}</span>}
                    </p>
                  </div>
                  {a.imported && <span className={`${chip} bg-slate-100 text-slate-600 inline-flex items-center gap-1`} title={a.imported.flags.join('. ')}><History className="w-3 h-3" />People Hub</span>}
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
            {CHARGED.map((t) => (
              <motion.div key={t} variants={rowV}><BalanceCard type={t} b={bal[t]} onApply={onApply} /></motion.div>
            ))}
            <motion.div variants={rowV} className="group rounded-2xl border border-slate-200 p-4 flex flex-col items-center justify-center gap-2 pp-lift min-h-[208px]">
              <span className="pp-tile w-[92px] h-[92px] rounded-full bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center">
                <span className="text-center"><span className="block text-lg font-black tabular-nums leading-none"><CountUp value={wfhDays} /></span><span className="text-[10px]">days</span></span>
              </span>
              <p className="text-sm font-semibold text-slate-800">Work from home</p>
              <p className="text-[11px] text-slate-500">approved this year</p>
            </motion.div>
          </motion.div>
        ) : <Empty icon={TreePalm} text="No balance for this year." />}
      </Panel>
      <Panel icon={Inbox} title="Your requests" blurb="Withdraw one that is waiting; cancel approved leave, which your approver confirms." aside={<button type="button" className={btnSm} onClick={onApply}><Plus className="w-3.5 h-3.5" />Apply</button>}>
        <AnimatePresence>{error && <Notice text={error} tone="bad" onClose={() => setError(null)} />}</AnimatePresence>
        {mine.length === 0 ? <Empty icon={Inbox} text="No requests yet." /> : (
          <motion.div variants={listV} initial="hidden" animate="show" className="rounded-xl border border-slate-200 divide-y divide-slate-100 mt-2">
            {mine.map((r) => {
              const last = r.decisions[r.decisions.length - 1];
              return (
                <motion.div key={r.id} variants={rowV} className="group flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <IconTile icon={r.kind === 'correction' ? Wrench : LEAVE_ICON[r.type]} tone={r.status === 'Rejected' ? 'bad' : r.status === 'Approved' ? 'ok' : r.status === 'Pending' || r.status === 'Cancellation requested' ? 'warn' : 'slate'} />
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

function ApprovalsSection({ s, list, claims, onDone }: { s: Snapshot; list: RequestRecord[]; claims: ClaimsView | null; onDone: (m: string) => void }) {
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
  const trips = claims?.founder && claims.toDecide.length ? <ClaimApprovals s={s} view={claims} onDone={onDone} /> : null;
  if (s.me.accessRole === 'employee') return trips;
  return (
    <>
    {trips}
    <Panel icon={Inbox} title="Leave and corrections" blurb={s.me.accessRole === 'manager' ? 'Leave and corrections from the people who report to you, oldest first.' : 'Leave and corrections from across the studio, oldest first. Never your own.'}>
      <AnimatePresence>{error && <Notice text={error} tone="bad" onClose={() => setError(null)} />}</AnimatePresence>
      {list.length === 0 ? <Empty icon={Stamp} text="Nothing waiting for you. All clear." /> : (
        <motion.div variants={listV} initial="hidden" animate="show" className="flex flex-col gap-3 mt-2">
          <AnimatePresence initial={false}>
            {list.map((r) => {
              const name = personName(s, r.employeeId);
              const cancelling = r.status === 'Cancellation requested';
              const session = r.correction ? s.attendance.find((a) => a.id === r.correction!.sessionId) : null;
              return (
                <motion.div key={r.id} variants={rowV} layout exit={{ opacity: 0, x: 40, transition: { duration: 0.25 } }}
                  className="group rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 pp-lift">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="relative"><Avatar name={name} /><span className="absolute -bottom-1 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-200 grid place-items-center text-[#3D52A0]">{React.createElement(r.kind === 'correction' ? Wrench : LEAVE_ICON[r.type], { className: 'w-3 h-3' })}</span></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800">{name}
                        <span className="font-semibold text-slate-500"> · {r.kind === 'correction' ? 'attendance correction' : cancelling ? `cancel ${LEAVE_LABELS[r.type].toLowerCase()}` : LEAVE_LABELS[r.type].toLowerCase()}</span></p>
                      <p className="text-xs text-slate-500">
                        {r.kind === 'correction' && r.correction
                          ? <>{niceDay(r.start)}: {session ? `${clock12(session.checkIn, tz)}–${session.checkOut ? clock12(session.checkOut, tz) : 'open'}` : 'recorded day'} → <b className="text-slate-700">{clock12(r.correction.checkIn, tz)}–{clock12(r.correction.checkOut, tz)}</b>, {r.correction.mode}</>
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
    </>
  );
}

/* ── A leave balance, as a card that turns over ──────────────────────────── */

function BalanceCard({ type, b, onApply }: { type: LeaveType; b: Balance; onApply: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const Icon = LEAVE_ICON[type];
  const tone = b.available <= 0 ? 'slate' : b.available <= 1 ? 'warn' : 'brand';
  return (
    <div className="pp-3d h-[208px]">
      <motion.button type="button" aria-pressed={flipped} aria-label={`${LEAVE_LABELS[type]}: ${b.available} of ${b.entitled} left. ${flipped ? 'Show the ring' : 'Show the details'}`}
        onClick={() => setFlipped((f) => !f)} animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', stiffness: 160, damping: 18 }}
        whileHover={{ y: -3 }} className="pp-keep relative w-full h-full text-left">
        <span className="group pp-face absolute inset-0 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 flex flex-col items-center gap-2 shadow-sm">
          <span className="absolute top-3 right-3"><IconTile icon={Icon} size="sm" tone={tone} /></span>
          <Ring value={b.entitled ? b.available / b.entitled : 0} size={92} stroke={8} tone={tone} label={`${LEAVE_LABELS[type]}: ${b.available} of ${b.entitled}`}>
            <p className="text-lg font-black text-slate-800 tabular-nums leading-none"><CountUp value={b.available} /></p>
            <p className="text-[10px] text-slate-500 mt-0.5">of {b.entitled}</p>
          </Ring>
          <p className="text-sm font-semibold text-slate-800 text-center">{LEAVE_LABELS[type]}</p>
          <p className="text-[11px] text-slate-500">{b.used} used{b.reserved ? ` · ${b.reserved} held` : ''} · tap to turn</p>
        </span>
        <span className="pp-face pp-flipped absolute inset-0 rounded-2xl border border-[#3D52A0]/30 bg-[#3D52A0] text-white p-4 flex flex-col gap-2 shadow-lg">
          <span className="flex items-center gap-2"><Icon className="w-4 h-4" /><span className="text-sm font-bold">{LEAVE_LABELS[type]}</span></span>
          {([['Allowed this year', b.entitled], ['Taken', b.used], ['Waiting for approval', b.reserved], ['Left to plan', b.available]] as [string, number][]).map(([k, v]) => (
            <span key={k} className="flex items-center justify-between text-xs"><span className="opacity-80">{k}</span><span className="font-black tabular-nums">{v}</span></span>
          ))}
          <span className="mt-auto flex items-center justify-between">
            <span className="text-[11px] opacity-80 inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" />Tap to turn back</span>
            {b.available > 0 && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onApply(); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onApply(); } }}
              className="px-2.5 py-1 rounded-lg bg-white text-[#3D52A0] text-xs font-bold hover:bg-slate-100">Plan</span>}
          </span>
        </span>
      </motion.button>
    </div>
  );
}
