import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Pin } from '@/lib/lucide-shim';
import type { HomeFeeds } from './useHomeFeeds';
import { mayOpenStudioTab } from '../../lib/roleAccess';
import { teamToday } from '../../lib/homeWidgets';
import { checkInOf, dayOrder, dayTitle, type DayPin } from '../../lib/homeDay';
import { businessDate } from '../../lib/peopleDesk';
import { openInDesignReview } from '../../services/drawingReviewService';
import { usePeople } from '../../services/peopleService';
import MyDayCard from '../people/MyDayCard';
import { AttentionWidget, ComingUpWidget, ForYouWidget, Pinned, ReviewWidget, TeamWidget } from './HomeWidgets';
import type { AttentionRow } from './useAttention';
import { useCalendarData } from './calendarData';
import { useWide } from './StoryDeck';
import './homeStyles';

/*
  "YOUR DAY, IN ORDER" (DESIGN.md → "Your day, in order"): the Home widgets
  pinned to ruled paper along a dashed path, the one that saves the most time
  first (lib/homeDay.ts). Each pin is numbered and says in a word why it sits
  where it does. Two staggered columns on a wide screen, one on a phone.

  My day (check in and out) is pin 01 until the person is in, then steps to
  the end. The studio's worklist ("Needs your attention") and the week ahead
  (inside "Coming up") live here too, so nothing of the day sits below it.
*/

const DISPLAY = { fontFamily: 'var(--font-display)' } as const;
/* The pin colours in order: brass, indigo, rose, sage, periwinkle, navy (Home's materials, lightened for paper). */
const TINT = [
  { bg: '#FBF5EA', fg: '#8C6A33', bd: '#EBDDC2' },
  { bg: '#ECEFFB', fg: '#3D52A0', bd: '#D5DCF5' },
  { bg: '#FBEFF3', fg: '#B4436A', bd: '#F2D3DF' },
  { bg: '#E7F5EF', fg: '#0E7C5A', bd: '#C8E8DA' },
  { bg: '#EEF2FD', fg: '#5F79D6', bd: '#D9E1FA' },
  { bg: '#ECEEF6', fg: '#1E2A5A', bd: '#D3D8EA' },
];
const TILT = [1.5, -1.5, 1.2, -1.2, 1, -1];

export interface AttentionFeed {
  rows: AttentionRow[];
  money: (n: number) => string;
  onOpen: (r: AttentionRow, action?: any) => void;
  onSnooze?: (projectId: string) => void;
  onDismiss?: (projectId: string) => void;
}

export default function DayBoard({ feeds, projects, attention, onNavigate }: {
  feeds: HomeFeeds; projects: any[]; attention: AttentionFeed | null; onNavigate: (tab: string) => void;
}) {
  const { who, desk, reviewer, people, visitsOn, rows, visits, viewer, names } = feeds;
  const { snapshot } = usePeople(people);
  const team = useMemo(() => (people && snapshot ? teamToday(snapshot) : undefined), [people, snapshot]);
  const checkin = useMemo(() => (people && snapshot?.me ? checkInOf(snapshot) : undefined), [people, snapshot]);
  const counts = useMemo(() => (attention ? {
    blocked: attention.rows.filter((r) => r.worst === 'blocker').length,
    due: attention.rows.filter((r) => r.worst === 'due').length,
  } : undefined), [attention?.rows]);
  const day = useMemo(() => dayOrder({
    rows: desk ? rows : undefined, reviewer, viewer, visits: visitsOn ? visits : undefined, team, checkin, attention: counts,
  }), [desk, rows, reviewer, viewer, visitsOn, visits, team, checkin, counts]);
  const { importantDates } = useCalendarData(projects);
  const today = businessDate(new Date());
  const sites = useMemo(() => projects.map((p: any) => String(p?.context?.name || '')).filter(Boolean), [projects]);
  const wide = useWide(1024);
  if (!day.pins.length) return null;

  const toDesk = () => onNavigate('design-review');
  const widget = (p: DayPin) =>
    p.kind === 'sheets' ? <ForYouWidget index={0} rows={rows} viewer={viewer} names={names} onOpen={(d) => openInDesignReview(d.projectId, d.id)} onAll={toDesk} />
      : p.kind === 'reviews' ? <ReviewWidget index={0} rows={rows} viewer={viewer} onAll={toDesk} />
      : p.kind === 'meetings' ? <ComingUpWidget index={0} list={visits} today={today} milestones={importantDates} onAll={mayOpenStudioTab('ops-desk', who) ? () => onNavigate('ops-desk') : undefined} />
      : p.kind === 'checkin' ? <MyDayCard variant="pin" sites={sites} onOpenPeople={() => onNavigate('people')} />
      : p.kind === 'attention' ? <AttentionWidget index={0} {...attention!} />
      : <TeamWidget index={0} t={team!} onAll={() => onNavigate('people')} />;

  return (
    <section aria-label="Your day, in order" className="hs-paper rounded-[28px] border border-[#E3E8F4] overflow-hidden px-3 sm:px-6 pt-9 pb-12">
      <header className="relative z-10 text-center mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Your day, in order</p>
        <h2 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-[#0A1B33]" style={DISPLAY}>{dayTitle(day.toDo)}</h2>
      </header>
      <Board pins={day.pins} wide={wide} render={widget} />
    </section>
  );
}

/* ── The pins and the path that joins them ───────────────────────────────── */

function Board({ pins, wide, render }: { pins: DayPin[]; wide: boolean; render: (p: DayPin) => React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState({ d: '', w: 0, h: 0 });
  const order = pins.map((p) => p.kind).join('|');

  /* The path runs pin head to pin head, in order. Layout offsets, not boxes, so the tilt and the drop-in do not bend it. */
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const pts = pins.map((p) => {
        let n = el.querySelector<HTMLElement>(`[data-pin-head="${p.kind}"]`);
        if (!n) return null;
        let x = n.offsetWidth / 2, y = n.offsetHeight / 2;
        while (n && n !== el) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
        return { x, y };
      }).filter(Boolean) as { x: number; y: number }[];
      const d = pts.map((b, k) => {
        if (k === 0) return `M ${b.x} ${b.y}`;
        const a = pts[k - 1], bend = (b.y - a.y) * 0.6;
        return `C ${a.x + (wide ? 0 : 60)} ${a.y + bend}, ${b.x - (wide ? 0 : 60)} ${b.y - bend}, ${b.x} ${b.y}`;
      }).join(' ');
      setPath({ d, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll('[data-pin]').forEach((n) => ro.observe(n));
    return () => ro.disconnect();
  }, [order, wide]);

  const card = (p: DayPin, k: number) => <PinCard key={p.kind} p={p} k={k}>{render(p)}</PinCard>;
  return (
    <div ref={box} className="relative z-10 max-w-[1080px] mx-auto">
      {path.d && (
        <svg className="absolute inset-0 pointer-events-none" width={path.w} height={path.h} aria-hidden="true">
          <path d={path.d} className="hs-march" stroke="#ADBBDA" strokeWidth={2} strokeLinecap="round" fill="none" />
        </svg>
      )}
      {wide ? (
        /* Two columns, the right one dropped, so the eye zigzags 1, 2, 3, 4. */
        <div className="grid grid-cols-2 gap-x-16">
          <div className="flex flex-col items-center gap-12">{pins.map((p, k) => (k % 2 === 0 ? card(p, k) : null))}</div>
          <div className="flex flex-col items-center gap-12 pt-32">{pins.map((p, k) => (k % 2 === 1 ? card(p, k) : null))}</div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-10">{pins.map(card)}</div>
      )}
    </div>
  );
}

const PinCard: React.FC<{ p: DayPin; k: number; children: React.ReactNode }> = ({ p, k, children }) => {
  const still = useReducedMotion();
  const t = TINT[k % TINT.length];
  const tilt = still ? 0 : TILT[k % TILT.length];
  return (
    <motion.article data-pin layout={!still} initial={still ? false : { opacity: 0, y: -28, rotate: tilt * 4 }} animate={{ opacity: 1, y: 0, rotate: tilt }}
      whileHover={still ? undefined : { rotate: 0, scale: 1.015, zIndex: 3 }}
      transition={{ type: 'spring', stiffness: 170, damping: 18, delay: still ? 0 : 0.1 + k * 0.12 }}
      style={{ transformOrigin: '50% 0%', zIndex: 2 }} className="relative w-full max-w-[480px]">
      <div className="rounded-[26px] bg-white p-2 border border-[#EEF1F7] shadow-[0_10px_20px_0_#D3D8E6]">
        <motion.span data-pin-head={p.kind} className="block w-8 h-8 mx-auto mt-1 mb-3" style={{ color: t.fg }}
          initial={still ? false : { y: -18, scale: 1.5, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 16, delay: still ? 0 : 0.45 + k * 0.12 }}>
          <Pin className="w-8 h-8" fill="currentColor" />
        </motion.span>
        <div className="rounded-2xl border p-3 sm:p-4" style={{ background: t.bg, borderColor: t.bd }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-4xl leading-none font-semibold tabular-nums" style={{ ...DISPLAY, color: t.fg }}>{String(k + 1).padStart(2, '0')}</span>
            {p.why && <span className="px-2.5 py-1 rounded-full bg-white text-[10px] font-bold uppercase tracking-wider border" style={{ color: t.fg, borderColor: t.bd }}>{p.why}</span>}
          </div>
          <Pinned.Provider value>{children}</Pinned.Provider>
        </div>
      </div>
    </motion.article>
  );
};
