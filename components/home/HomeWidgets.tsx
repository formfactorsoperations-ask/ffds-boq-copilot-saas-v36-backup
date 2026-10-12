import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  PenTool, Undo2, Send, Eye, ArrowRight, Stamp, Flame, Clock, Sparkles, CalendarClock, Users, HardHat, Ruler, Video, Phone,
  MapPin, PartyPopper, TreePalm, House, Hourglass, MessageSquareQuote,
} from '@/lib/lucide-shim';
import type { HomeFeeds } from './useHomeFeeds';
import { mayOpenStudioTab } from '../../lib/roleAccess';
import { dueOf, projectLook, type DeskRow, type Viewer } from '../../lib/designDesk';
import { mySheets, reviewInbox, teamToday, whenLabel, type Upcoming } from '../../lib/homeWidgets';
import { openInDesignReview } from '../../services/drawingReviewService';
import { usePeople } from '../../services/peopleService';
import { CountUp, Dot } from '../ui/HudBits';
import { Confetti, IconTile, Tilt, initials, EASE } from '../people/PeopleBits';

/*
  HOME WIDGETS (lib/homeWidgets.ts): a shelf of live cards under My day, one
  for each thing a team member checks first.

    For you        Design Desk: my sheets to fix and to send, with one tap to open
    Review inbox   Design Desk, for those who review: what waits and for how long
    Coming up      meetings, site visits and measurements booked with clients
    Team today     who is away or working from home (never why, never who is in)
    Next holiday   a countdown

  Each card appears only for someone whose role opens what it shows. Built
  with the People motion kit (DESIGN.md → "People motion"): the same fonts
  and colours, with depth.
*/

const DESK_TAB = 'design-review';
const tone = { late: 'text-rose-700 bg-rose-100', soon: 'text-amber-700 bg-amber-100', week: 'text-[#3D52A0] bg-[#3D52A0]/10', later: 'text-slate-600 bg-slate-100' } as const;
const chip = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap';

/* ── The card every widget sits in ───────────────────────────────────────── */

const Widget: React.FC<{
  icon: React.ComponentType<any>; tone?: 'brand' | 'ok' | 'warn' | 'bad' | 'slate'; eyebrow: string; title?: React.ReactNode;
  live?: boolean; action?: { label: string; onClick: () => void }; span?: string; index: number; children: React.ReactNode;
}> = ({ icon, tone: t = 'brand', eyebrow, title, live, action, span = '', index, children }) => (
  <motion.div initial={{ opacity: 0, y: 18, rotateX: -18 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
    transition={{ delay: 0.08 + index * 0.07, duration: 0.6, ease: EASE }} style={{ transformPerspective: 1000 }} className={`min-w-0 ${span}`}>
    <Tilt max={5} className="h-full rounded-3xl">
      <section className="group relative h-full overflow-hidden rounded-3xl pp-glass p-5 flex flex-col gap-4">
        <div className="pp-glow" />
        <header className="relative flex items-center gap-3">
          <IconTile icon={icon} tone={t} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">{eyebrow}{live && <Dot tone="ok" live />}</p>
            {title && <p className="text-sm font-bold text-slate-800 truncate">{title}</p>}
          </div>
          {action && (
            <button type="button" onClick={action.onClick} className="inline-flex items-center gap-1 text-xs font-bold text-[#3D52A0] hover:gap-1.5 transition-all">
              {action.label}<ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </header>
        <div className="relative flex-1 min-h-0 flex flex-col">{children}</div>
      </section>
    </Tilt>
  </motion.div>
);

/** A big figure and what it counts. */
const Figure: React.FC<{ value: number; label: string; small?: string }> = ({ value, label, small }) => (
  <div className="flex items-end gap-2">
    <span className="text-4xl font-black text-slate-800 tabular-nums leading-none"><CountUp value={value} /></span>
    <span className="text-xs text-slate-500 pb-1 leading-tight">{label}{small && <span className="block text-[11px] text-slate-400">{small}</span>}</span>
  </div>
);

const Stat: React.FC<{ icon: React.ComponentType<any>; n: number; label: string; t: 'warn' | 'brand' | 'slate' | 'bad' | 'ok' }> = ({ icon: Icon, n, label, t }) => {
  const tint = { warn: 'bg-amber-100 text-amber-700', brand: 'bg-[#3D52A0]/10 text-[#3D52A0]', slate: 'bg-slate-100 text-slate-600', bad: 'bg-rose-100 text-rose-700', ok: 'bg-emerald-100 text-emerald-700' }[t];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 ${tint}`}>
      <Icon className="w-3.5 h-3.5" /><span className="text-sm font-black tabular-nums">{n}</span><span className="text-[11px] font-semibold">{label}</span>
    </span>
  );
};

const AllClear: React.FC<{ text: string }> = ({ text }) => (
  <div className="relative flex-1 flex flex-col items-center justify-center gap-2 py-4 text-center">
    <span className="relative"><Confetti pieces={12} spread={44} /><span className="pp-float inline-grid w-11 h-11 rounded-full bg-emerald-100 text-emerald-600 place-items-center"><Sparkles className="w-5 h-5" /></span></span>
    <p className="text-xs font-semibold text-slate-600">{text}</p>
  </div>
);

/* ── The shelf ───────────────────────────────────────────────────────────── */

export default function HomeWidgets({ feeds, onNavigate }: { feeds: HomeFeeds; onNavigate: (tab: string) => void }) {
  const { who, desk, reviewer, people, visitsOn, rows, visits, viewer, names } = feeds;

  if (!desk && !people && !visitsOn) return null;
  /*
    The shelf, four columns wide. Those who review: For you, the inbox and the
    team on top, client dates across the row below. Everyone else: For you
    beside client dates, the team and the next holiday below.
  */
  const toDesk = () => onNavigate(DESK_TAB);
  const comingUp = visitsOn && <ComingUpWidget index={3} list={visits} wide={reviewer} span={reviewer ? 'md:col-span-2 xl:col-span-4' : 'md:col-span-2'}
    onAll={mayOpenStudioTab('ops-desk', who) ? () => onNavigate('ops-desk') : undefined} />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
      {desk && <ForYouWidget index={0} rows={rows} viewer={viewer} names={names} onOpen={(d) => openInDesignReview(d.projectId, d.id)} onAll={toDesk} />}
      {reviewer && <ReviewWidget index={1} rows={rows} viewer={viewer} onAll={toDesk} />}
      {!reviewer && comingUp}
      {people && <PeopleWidgets index={2} stacked={reviewer} onAll={() => onNavigate('people')} />}
      {reviewer && comingUp}
    </div>
  );
}

/* ── For you (Design Desk) ───────────────────────────────────────────────── */

function ForYouWidget({ rows, viewer, names, onOpen, onAll, index }: {
  rows: DeskRow[] | null; viewer: Viewer; names: Map<string, string>; onOpen: (d: DeskRow) => void; onAll: () => void; index: number;
}) {
  const m = useMemo(() => (rows ? mySheets(rows, viewer) : null), [rows, viewer.email]);
  /* Those who review also act on what waits for them: their own fixes first, then the review queue, then drafts. */
  const queue = useMemo(() => (rows && viewer.reviewer ? reviewInbox(rows, viewer).waiting : []), [rows, viewer.reviewer]);
  const top = m ? [...m.fix, ...queue, ...m.drafts].slice(0, 3) : [];
  const count = m ? m.fix.length + m.drafts.length + queue.length : 0;
  const name = (d: DeskRow) => names.get(d.projectId) || (d.review as any)?.projectName || 'Project';
  return (
    <Widget index={index} icon={PenTool} eyebrow="Design Desk · for you" title={m ? (count ? `${count} sheet${count === 1 ? '' : 's'} to act on` : 'Nothing waiting on you') : 'Loading your sheets…'}
      live action={{ label: 'Open', onClick: onAll }} span="md:col-span-2">
      {!m ? <div className="space-y-2">{[0, 1, 2].map((k) => <div key={k} className="pp-shimmer h-11 rounded-2xl" />)}</div> : (
        <>
          <div className="flex flex-wrap gap-2">
            <Stat icon={Undo2} n={m.fix.length} label="to fix" t={m.fix.length ? 'warn' : 'slate'} />
            <Stat icon={Send} n={m.drafts.length} label={m.drafts.length === 1 ? 'draft to send' : 'drafts to send'} t={m.drafts.length ? 'brand' : 'slate'} />
            {viewer.reviewer ? <Stat icon={Stamp} n={queue.length} label="to review" t={queue.length ? 'bad' : 'slate'} />
              : <Stat icon={Eye} n={m.waiting.length} label="with the reviewer" t="slate" />}
          </div>
          {top.length === 0 ? <AllClear text={m.waiting.length ? 'All sent. Waiting on review.' : 'All caught up. Nice work.'} /> : (
            <ul className="mt-3 flex flex-col gap-2">
              {top.map((d, k) => {
                const look = projectLook(d.projectId, name(d));
                const due = dueOf(d.targetDate);
                const fix = d.review?.state === 'CHANGES_REQUESTED';
                const review = d.review?.state === 'IN_REVIEW';
                return (
                  <motion.li key={`${d.projectId}/${d.id}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + k * 0.07, ease: EASE }}>
                    <button type="button" onClick={() => onOpen(d)}
                      className="group/row w-full flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2.5 text-left hover:bg-white hover:shadow-[0_10px_24px_-16px_rgba(61,82,160,0.55)] transition-all">
                      <span className="w-9 h-9 shrink-0 rounded-xl grid place-items-center text-[10px] font-black text-white shadow-sm" style={{ background: look.color }}>{look.code}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-800 truncate">{d.name}</span>
                        <span className="block text-[11px] text-slate-500 truncate">{name(d)}{d.roomName ? ` · ${d.roomName}` : ''}{fix && d.review?.marksOpen ? ` · ${d.review.marksOpen} note${d.review.marksOpen === 1 ? '' : 's'} open` : ''}{review && d.review?.designer?.name ? ` · from ${d.review.designer.name.split(' ')[0]}` : ''}</span>
                      </span>
                      <span className={`${chip} ${fix ? 'bg-amber-100 text-amber-700' : review ? 'bg-rose-100 text-rose-700' : 'bg-[#3D52A0]/10 text-[#3D52A0]'}`}>{fix ? 'Fix' : review ? 'Review' : 'Send'}</span>
                      {due && <span className={`${chip} hidden sm:inline ${tone[due.tone]}`}>{due.label}</span>}
                      <ArrowRight className="w-4 h-4 text-slate-300 group-hover/row:text-[#3D52A0] group-hover/row:translate-x-0.5 transition-all" />
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Widget>
  );
}

/* ── Review inbox (Design Desk, reviewers) ───────────────────────────────── */

function ReviewWidget({ rows, viewer, onAll, index }: { rows: DeskRow[] | null; viewer: Viewer; onAll: () => void; index: number }) {
  const r = useMemo(() => (rows ? reviewInbox(rows, viewer) : null), [rows]);
  const still = useReducedMotion();
  const peak = r ? Math.max(1, ...r.approvedByDay) : 1;
  const days = ['', '', '', '', '', '', ''].map((_, k) => new Date(Date.now() - (6 - k) * 86400000).toLocaleDateString('en-IN', { weekday: 'narrow' }));
  return (
    <Widget index={index} icon={Stamp} tone={r && r.overdue ? 'bad' : 'brand'} eyebrow="Review inbox" action={{ label: 'Review', onClick: onAll }}>
      {!r ? <div className="pp-shimmer h-28 rounded-2xl" /> : (
        <>
          <Figure value={r.waiting.length} label={r.waiting.length === 1 ? 'sheet waiting' : 'sheets waiting'} small={r.oldestDays != null ? `oldest ${r.oldestDays ? `${r.oldestDays} d` : 'today'}` : 'nothing waiting'} />
          <div className="flex flex-wrap gap-1.5 mt-3">
            {r.overdue > 0 && <span className={`${chip} bg-rose-100 text-rose-700 inline-flex items-center gap-1`}><Flame className="w-3 h-3" />{r.overdue} overdue</span>}
            {r.clientChanges > 0 && <span className={`${chip} bg-amber-100 text-amber-700 inline-flex items-center gap-1`}><MessageSquareQuote className="w-3 h-3" />{r.clientChanges} client change{r.clientChanges === 1 ? '' : 's'}</span>}
            {!r.overdue && !r.clientChanges && <span className={`${chip} bg-emerald-100 text-emerald-700`}>On track</span>}
          </div>
          {/* Approvals this week, a bar a day */}
          <div className="mt-auto pt-4">
            <div className="flex items-end justify-between gap-1.5 h-14" aria-label={`${r.approvedWeek} approved this week`}>
              {r.approvedByDay.map((n, k) => (
                <div key={k} className="flex-1 flex flex-col items-center gap-1">
                  <motion.div className={`w-full rounded-md ${k === 6 ? 'bg-[#3D52A0]' : 'bg-[#3D52A0]/25'}`} initial={{ height: still ? `${(n / peak) * 40 + 4}px` : 0 }}
                    animate={{ height: `${(n / peak) * 40 + 4}px` }} transition={{ delay: 0.4 + k * 0.05, duration: 0.6, ease: EASE }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1">{days.map((d, k) => <span key={k} className="flex-1 text-center text-[10px] font-bold text-slate-400">{d}</span>)}</div>
            <p className="text-[11px] text-slate-500 mt-1.5"><b className="text-slate-800 tabular-nums">{r.approvedWeek}</b> approved this week</p>
          </div>
        </>
      )}
    </Widget>
  );
}

/* ── Coming up: meetings and visits ──────────────────────────────────────── */

const KIND_ICON: Record<string, React.ComponentType<any>> = { meeting: Users, site_visit: HardHat, measurement: Ruler };
const KIND_LABEL: Record<string, string> = { meeting: 'Design meeting', site_visit: 'Site visit', measurement: 'Measurement' };
const MODE_ICON: Record<string, React.ComponentType<any>> = { in_person: MapPin, video: Video, call: Phone };

function ComingUpWidget({ list, onAll, index, span, wide }: { list: Upcoming[] | null; onAll?: () => void; index: number; span: string; wide: boolean }) {
  const shown = (list || []).slice(0, 4);
  return (
    <Widget index={index} icon={CalendarClock} eyebrow="Coming up with clients" title={list ? (list.length ? `${list.length} in the next two weeks` : 'Nothing booked') : 'Loading…'}
      action={onAll ? { label: 'Ops Desk', onClick: onAll } : undefined} span={span}>
      {!list ? <div className="grid grid-cols-2 gap-3">{[0, 1].map((k) => <div key={k} className="pp-shimmer h-24 rounded-2xl" />)}</div>
        : shown.length === 0 ? <AllClear text="No meetings or visits booked for the next two weeks." /> : (
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${wide ? 'xl:grid-cols-4' : ''} gap-3`}>
            {shown.map((u, k) => {
              const Kind = KIND_ICON[u.visit.kind] || Users;
              const Mode = MODE_ICON[u.visit.mode] || MapPin;
              const confirmed = u.visit.status === 'confirmed';
              const d = new Date(`${u.date}T12:00:00+05:30`);
              return (
                <motion.div key={u.visit.id} initial={{ opacity: 0, rotateY: -25, x: 10 }} animate={{ opacity: 1, rotateY: 0, x: 0 }} transition={{ delay: 0.25 + k * 0.08, duration: 0.5, ease: EASE }}
                  style={{ transformPerspective: 800 }} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-3">
                  <span className={`pp-tile w-12 h-12 shrink-0 rounded-2xl grid place-items-center text-center leading-none ${u.daysAway === 0 ? 'bg-[#3D52A0] text-white' : 'bg-[#3D52A0]/10 text-[#3D52A0]'}`}>
                    <span><span className="block text-[10px] font-bold uppercase">{d.toLocaleDateString('en-IN', { month: 'short' })}</span><span className="block text-lg font-black tabular-nums">{d.getDate()}</span></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 truncate"><Kind className="w-3.5 h-3.5 shrink-0 text-slate-400" />{KIND_LABEL[u.visit.kind] || 'Meeting'}</span>
                    <span className="block text-[11px] text-slate-500 truncate">{u.visit.projectName}</span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-500"><Mode className="w-3 h-3" />{whenLabel(u)}{u.time ? ` · ${u.time}` : ''}</span>
                  </span>
                  <span className={`${chip} ${confirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{confirmed ? 'Confirmed' : u.visit.status === 'rescheduled' ? 'Moved' : 'Asked'}</span>
                </motion.div>
              );
            })}
          </div>
        )}
    </Widget>
  );
}

/* The two People cards, only for those on People (the snapshot loads here, never for anyone else). */
function PeopleWidgets({ index, onAll, stacked }: { index: number; onAll: () => void; stacked: boolean }) {
  const { snapshot } = usePeople();
  if (!snapshot) return null;
  /* Beside the review inbox they share one column; otherwise they take a row between them. */
  return stacked ? (
    <div className="flex flex-col gap-5 min-w-0">
      <TeamWidget index={index} s={snapshot} onAll={onAll} compact />
      <HolidayWidget index={index + 1} s={snapshot} compact />
    </div>
  ) : (
    <>
      <TeamWidget index={index} s={snapshot} onAll={onAll} span="md:col-span-1 xl:col-span-2" />
      <HolidayWidget index={index + 1} s={snapshot} span="md:col-span-1 xl:col-span-2" />
    </>
  );
}

/* ── Team today (People) ─────────────────────────────────────────────────── */

const Faces: React.FC<{ list: { personId: string; name: string }[]; icon: React.ComponentType<any>; tint: string; label: string; delay: number }> = ({ list, icon: Icon, tint, label, delay }) => (
  <div className="flex items-center gap-3">
    <span className={`w-7 h-7 rounded-lg grid place-items-center ${tint}`}><Icon className="w-3.5 h-3.5" /></span>
    <div className="flex -space-x-2">
      {list.slice(0, 4).map((p, k) => (
        <motion.span key={p.personId} title={p.name} initial={{ rotateY: 180, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: delay + k * 0.08, duration: 0.55, ease: EASE }}
          style={{ transformPerspective: 400 }} className={`w-8 h-8 rounded-full ring-2 ring-white grid place-items-center text-[10px] font-black ${tint}`}>{initials(p.name)}</motion.span>
      ))}
      {list.length > 4 && <span className="w-8 h-8 rounded-full ring-2 ring-white bg-slate-100 text-slate-600 grid place-items-center text-[10px] font-black">+{list.length - 4}</span>}
    </div>
    <span className="text-xs text-slate-600 min-w-0 truncate">{list.length === 1 ? list[0].name.split(' ')[0] : `${list.length}`} {label}</span>
  </div>
);

function TeamWidget({ s, onAll, index, span, compact }: { s: any; onAll: () => void; index: number; span?: string; compact?: boolean }) {
  const t = useMemo(() => teamToday(s), [s]);
  const out = t.away.length + t.home.length;
  return (
    <Widget index={index} icon={Users} eyebrow="Team today" action={{ label: 'People', onClick: onAll }} span={span}>
      <Figure value={Math.max(0, t.team - t.away.length)} label="working today" small={`of ${t.team} on the team`} />
      <div className={`${compact ? 'mt-3' : 'mt-4'} flex flex-col gap-2.5`}>
        {t.away.length > 0 && <Faces list={t.away} icon={TreePalm} tint="bg-amber-100 text-amber-700" label="on leave" delay={0.3} />}
        {t.home.length > 0 && <Faces list={t.home} icon={House} tint="bg-[#3D52A0]/10 text-[#3D52A0]" label="from home" delay={0.4} />}
        {t.asked.length > 0 && <Faces list={t.asked} icon={Hourglass} tint="bg-slate-100 text-slate-600" label="asked off" delay={0.5} />}
        {out === 0 && t.asked.length === 0 && <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><Sparkles className="w-4 h-4" />Everyone's in today.</p>}
      </div>
    </Widget>
  );
}

/* ── Next holiday ────────────────────────────────────────────────────────── */

function HolidayWidget({ s, index, span, compact }: { s: any; index: number; span?: string; compact?: boolean }) {
  const t = useMemo(() => teamToday(s), [s]);
  const h = t.nextHoliday;
  return (
    <Widget index={index} icon={PartyPopper} tone="ok" eyebrow="Next holiday" span={span}>
      {!h ? <p className="text-xs text-slate-500">No studio holidays set yet.</p> : (
        <div className={`flex-1 flex ${compact ? 'flex-col gap-3' : 'flex-wrap items-end justify-between gap-4'}`}>
          <div className="flex items-end gap-2">
            {String(h.days).padStart(2, '0').split('').map((ch, k) => (
              <motion.span key={`${h.date}-${k}`} initial={{ rotateX: -90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ delay: 0.3 + k * 0.12, duration: 0.55, ease: EASE }}
                style={{ transformPerspective: 500 }} className="pp-tile w-11 h-14 rounded-xl bg-emerald-100 text-emerald-700 grid place-items-center text-3xl font-black tabular-nums">{ch}</motion.span>
            ))}
            <span className="text-xs text-slate-500 pb-1">{h.days === 0 ? 'today!' : h.days === 1 ? 'day to go' : 'days to go'}</span>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 truncate">{h.name}</p>
            <p className="text-[11px] text-slate-500">{new Date(`${h.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>
      )}
    </Widget>
  );
}
