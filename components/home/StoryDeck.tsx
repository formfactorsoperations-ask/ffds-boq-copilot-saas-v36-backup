import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, Sparkles, ArrowRight, Clock } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import { isLimitedRole, isClientRelationsRole, seesStudioFinance } from '../../lib/roleAccess';
import { buildStories, paymentsOf, type Ring, type Story, type StoryAction, type Swatch } from '../../lib/homeStories';
import { teamToday } from '../../lib/homeWidgets';
import { opsSettingsOf } from '../../lib/opsDesk';
import { clock12 } from '../../lib/peopleDesk';
import { formatCompactINR, timeAgo } from '../../lib/utils';
import { projectLook } from '../../lib/designDesk';
import { openInDesignReview } from '../../services/drawingReviewService';
import { usePeople } from '../../services/peopleService';
import type { HomeFeeds } from './useHomeFeeds';
import { greetingWord } from './useStudioHomeData';
import { EDGE } from './homeStyles';
import '../people/peopleStyles';

/*
  THE TOP OF HOME (lib/homeStories.ts): a greeting, the projects you were last
  in (one tap back to the tab you left), the story rings, a fanned deck of
  cards and a strip of five swatches.

  Each card is one thing worth knowing with the button that acts on it; the
  deck opens on the most pressing. The fan is the mockup's: seven slots round
  a circle, the middle one in front. Tap a ring to turn the fan to its first
  card; point at a card and it rises while the others part round it. Fan
  through with the arrows, a swipe, the arrow keys, or by tapping a card at
  the side. Built for the owner's chosen design (Option 6, 12 Oct 2026):
  the five materials are Home's only (DESIGN.md → "Home stories").
*/

const INK = '#0A1B33';
const DISPLAY = { fontFamily: 'var(--font-display)' } as const;

export default function StoryDeck({ feeds, counts, projects, role, roles, userName, recent = [], onResume, onNavigate, onOpenProject, onCreateNew }: {
  feeds: HomeFeeds;
  /** The projects this person was last in, most recent first. */
  recent?: any[];
  onResume?: (project: any) => void;
  counts: { active: number; pipeline: number; booked: number; open: number; winRate: number };
  projects: any[];
  role: string;
  roles?: string[];
  userName: string;
  onNavigate: (tab: string) => void;
  onOpenProject: (project: any) => void;
  onCreateNew: () => void;
}) {
  const org: any = useOrg();
  const who = roles?.length ? roles : role;
  const finance = seesStudioFinance(who);
  const designer = isLimitedRole(who) && !isClientRelationsRole(who) && feeds.desk && !feeds.reviewer;
  const { snapshot } = usePeople(feeds.people);
  const now = useMemo(() => new Date(), [feeds.rows, feeds.visits, snapshot]);
  const stories = useMemo(() => buildStories({
    now, view: designer ? 'designer' : 'studio', finance, viewer: feeds.viewer, projects, counts,
    rows: feeds.rows, visits: feeds.visits, team: feeds.people && snapshot ? teamToday(snapshot) : null,
    payments: finance ? paymentsOf(projects, opsSettingsOf(org?.orgData).paymentDueDays, now.getTime()) : [],
    money: formatCompactINR,
  }), [now, designer, finance, feeds.viewer, projects, counts, feeds.rows, feeds.visits, snapshot, org?.orgData]);

  /* Round a circle: the most pressing card in front, the next ones alternating right and left of it. */
  const cards = useMemo(() => around(stories.cards), [stories.cards]);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<'left' | 'right'>('right');
  useEffect(() => { setIdx(0); }, [stories.cards.length]);
  const n = cards.length;
  const at = n ? ((idx % n) + n) % n : 0;
  const go = (to: number, d: 'left' | 'right') => { setDir(d); setIdx(to); };
  /* A ring turns the fan to its first card; the ring of the card in front is lit. */
  const pick = (id: string) => { const i = cards.findIndex((c) => c.ring === id); if (i >= 0 && i !== at) go(i, i > at ? 'right' : 'left'); };
  const ring = cards[at]?.ring ?? null;

  const act = (a: StoryAction) => {
    if (a.kind === 'tab') onNavigate(a.tab);
    else if (a.kind === 'sheet') openInDesignReview(a.projectId, a.drawingId);
    else { const p = projects.find((x) => String(x.id) === a.projectId); if (p) onOpenProject(p); }
  };

  const first = String(userName || '').split(/[\s@]/)[0] || 'there';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  const loading = (feeds.desk && feeds.rows === null) || (feeds.visitsOn && feeds.visits === null);

  return (
    <section className="relative w-full max-w-[1400px] mx-auto rounded-[40px] bg-white border border-slate-200/60 shadow-[0_40px_100px_-24px_rgba(0,0,0,0.07)] overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-[#F4F6FC] via-white to-[#FAF7F1]" />
        <div className="aurora-a absolute -top-48 right-[-6rem] w-[38rem] h-[38rem] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(61, 82, 160,.12), transparent 70%)' }} />
      </div>
      <div className="relative px-5 md:px-12 pt-9 pb-8 flex flex-col items-center text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{today}</p>
          <LiveClock />
        </div>
        <h1 className="mt-2 text-[30px] md:text-[44px] font-bold leading-[1.08] tracking-tight" style={{ ...DISPLAY, color: INK }}>
          {greetingWord()}, {first}. {stories.view === 'designer' ? 'Here is your day.' : 'Here is your studio.'}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
          {stories.view === 'designer'
            ? 'Only your projects. Fan through your cards; each one has the button that acts on it.'
            : 'Tap a story or fan through the cards: each is one thing worth knowing, with the button that acts on it.'}
        </p>
        {/* New project, then back into what you were last in. */}
        {(!isLimitedRole(who) || recent.length > 0) && (
          <div className="mt-4 w-full flex flex-col items-center gap-2">
            {recent.length > 0 && <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Continue where you left off</p>}
            <div className="max-w-full flex items-center gap-2 overflow-x-auto pb-1 px-1 [scrollbar-width:none]">
              {!isLimitedRole(who) && (
                <button type="button" onClick={onCreateNew}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-bold text-[#3D52A0] hover:border-[#3D52A0]/40 hover:bg-white transition-colors">
                  <Plus className="w-4 h-4" />New project
                </button>
              )}
              {recent.slice(0, 4).map((p, k) => <RecentChip key={p.id} p={p} k={k} onClick={() => onResume?.(p)} />)}
            </div>
          </div>
        )}

        {/* The rings */}
        {stories.rings.length > 0 && (
          <div className="mt-7 flex flex-wrap justify-center gap-3 sm:gap-5 md:gap-7" role="tablist" aria-label="Stories">
            {stories.rings.map((r, k) => <RingButton key={r.id} r={r} k={k} on={ring === r.id} onClick={() => pick(r.id)} />)}
          </div>
        )}

        {/* The deck */}
        <div className="w-full mt-6">
          {loading && cards.length === 0 ? <DeckSkeleton />
            : cards.length === 0 ? <AllClear designer={stories.view === 'designer'} />
            : <Deck cards={cards} at={at} dir={dir} go={go} onAct={act} />}
        </div>

        {/* The swatches */}
        <div className="w-full mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {stories.swatches.map((w, k) => <SwatchCard key={w.id} w={w} k={k} />)}
        </div>
      </div>
    </section>
  );
}

/** Most pressing first → round a circle: [a,b,c,d,e] → a in front, b right of it, c left, d further right, e further left. */
function around<T>(list: T[]): T[] {
  const n = list.length, out = new Array<T>(n);
  list.forEach((x, i) => { const p = i % 2 ? (i + 1) / 2 : -i / 2; out[(p + n) % n] = x; });
  return out;
}

/* ── The clock at the top of Home ────────────────────────────────────────── */

/** The studio's time now, on the 12-hour clock; the colon ticks. */
const LiveClock: React.FC = () => {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date().toISOString()), 10000);
    return () => window.clearInterval(t);
  }, []);
  const [clock, ampm] = clock12(now).split(' ');
  const [h, m] = clock.split(':');
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[#3D52A0]" aria-label={`The time is ${clock} ${ampm}`}>
      <Clock className="w-3.5 h-3.5" />
      <span className="text-sm font-bold tabular-nums" style={DISPLAY}>{h}<span className="pp-tickover">:</span>{m}</span>
      <span className="text-[10px] font-bold tracking-wider">{ampm}</span>
    </span>
  );
};

/* ── Continue where you left off ─────────────────────────────────────────── */

const STAGE: Record<string, string> = {
  lead: 'Lead', draft: 'Draft', proposal_sent: 'Proposal sent', negotiation: 'Negotiation', won: 'Won',
  execution: 'On site', work_paused: 'Paused', completed: 'Delivered',
};
const RecentChip: React.FC<{ p: any; k: number; onClick: () => void }> = ({ p, k, onClick }) => {
  const name = String(p.context?.name || p.context?.clientName || 'Untitled');
  const look = projectLook(String(p.id), name);
  return (
    <motion.button type="button" onClick={onClick} title={`Open ${name} where you left it`}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + k * 0.05, type: 'spring', stiffness: 300, damping: 24 }}
      whileHover={{ y: -2 }}
      className="shrink-0 inline-flex items-center gap-2.5 rounded-full border border-slate-200 bg-white/80 pl-1.5 pr-4 py-1.5 text-left hover:border-[#3D52A0]/40 hover:bg-white transition-colors">
      <span className="w-7 h-7 rounded-full grid place-items-center text-[10px] font-black text-white" style={{ background: look.color }}>{look.code}</span>
      <span className="min-w-0">
        <span className="block max-w-[150px] truncate text-xs font-bold text-slate-800">{name}</span>
        <span className="block text-[10px] text-slate-500">{STAGE[p.context?.status || 'draft'] || 'Draft'} · {timeAgo(p.lastModified)}</span>
      </span>
    </motion.button>
  );
};

/* ── Rings ───────────────────────────────────────────────────────────────── */

const RingButton: React.FC<{ r: Ring; k: number; on: boolean; onClick: () => void }> = ({ r, k, on, onClick }) => {
  return (
    <motion.button type="button" role="tab" aria-selected={on} onClick={onClick}
      initial={{ opacity: 0, y: 10, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: on ? 1.08 : 1 }}
      transition={{ delay: 0.1 + k * 0.06, type: 'spring', stiffness: 320, damping: 22 }}
      whileHover={{ y: -3 }} className="flex flex-col items-center gap-2 group">
      <span className={`hs-ring hs-${r.material} w-[56px] h-[56px] sm:w-[68px] sm:h-[68px] md:w-[76px] md:h-[76px] rounded-full grid place-items-center text-white text-lg sm:text-xl font-black tabular-nums`}
        style={{ ['--hs-edge' as any]: on ? '#0A1B33' : EDGE[r.material], ...DISPLAY }}>
        {r.glyph || r.count}
      </span>
      <span className={`text-xs font-bold ${on ? 'text-[#3D52A0]' : 'text-slate-700'}`}>{r.label}</span>
    </motion.button>
  );
};

/* ── The fanned deck ─────────────────────────────────────────────────────── */

/** True while the window is at least `min` pixels wide. */
export function useWide(min = 768) {
  const w = useWidth();
  return w >= min;
}
function useWidth() {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

/*
  The fan, slot by slot out from the middle, as in the mockup: each step out
  turns 7°, shrinks, slides out (rem, scaled to the screen) and drops. Cards
  move on a .65s overshoot; a new deck rises in from below, one card after
  another (hs-slot, hs-face in homeStyles.ts).
*/
const FAN = [
  { rot: 0, scale: 1, x: 0, y: 0, z: 10 },
  { rot: 7, scale: 0.9346, x: 11, y: 1.3, z: 3 },
  { rot: 14, scale: 0.8498, x: 22, y: 4, z: 2 },
  { rot: 21, scale: 0.7756, x: 30, y: 7.3, z: 1 },
];
const REM = 16;

function Deck({ cards, at, dir, go, onAct }: {
  cards: Story[]; at: number; dir: 'left' | 'right'; go: (to: number, d: 'left' | 'right') => void; onAct: (a: StoryAction) => void;
}) {
  const w = useWidth();
  const mult = w < 640 ? 0.38 : w < 768 ? 0.5 : w < 1024 ? 0.75 : 1;
  const drag = useRef<number | null>(null);
  /* The card under the mouse, by its place in the fan (-3 … 3). */
  const [hover, setHover] = useState<number | null>(null);
  const n = cards.length;
  const step = (d: 1 | -1) => { setHover(null); go(at + d, d > 0 ? 'right' : 'left'); };
  return (
    <div className="flex flex-col items-center">
      <div tabIndex={0} aria-roledescription="carousel" aria-label="Story cards"
        onKeyDown={(e) => { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); }}
        onPointerDown={(e) => { drag.current = e.clientX; }}
        onPointerUp={(e) => { if (drag.current == null) return; const dx = e.clientX - drag.current; drag.current = null; if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1); }}
        onMouseLeave={() => setHover(null)}
        className="relative w-full h-[500px] sm:h-[560px] outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 rounded-3xl touch-pan-y select-none">
        {cards.map((c, i) => {
          let k = (((i - at) % n) + n) % n;
          if (k > n / 2) k -= n;
          const hidden = Math.abs(k) > 3;
          let transform: string, z: number;
          if (hidden) {
            const off = dir === 'right' ? -40 : 40;
            transform = `translate(-50%,-50%) translate(${off * REM}px, 120px) rotate(${off > 0 ? 30 : -30}deg) scale(.5)`;
            z = 0;
          } else {
            const f = FAN[Math.abs(k)], side = Math.sign(k);
            let x = side * f.x * mult, y = f.y, rot = side * f.rot, sc = f.scale;
            if (hover !== null) {
              const d = Math.abs(k - hover);
              /* A small rise, so the button stays under the pointer that is reaching for it (the mockup's 2.5rem moved it away). */
              if (k === hover) { y -= 0.75; sc *= 1.04; }
              else {
                /* The others part round the one in hand, the near ones most. */
                const push = 8 * (1 - Math.abs(k / 3)) * (1 + 0.2 * Math.max(0, 3 - d));
                if (k < hover) { x -= push * mult; rot -= 3 / (d + 1); } else { x += push * mult; rot += 3 / (d + 1); }
                if (k === 3 && hover < 0) y -= 1;
                if (k === -3 && hover > 0) y -= 1;
              }
            }
            transform = `translate(-50%,-50%) translate(${x * REM}px, ${y * REM}px) rotate(${rot}deg) scale(${sc})`;
            z = k === hover ? 20 : f.z;
          }
          return (
            <div key={c.id} className="hs-slot absolute left-1/2 top-[44%] w-[260px] h-[370px] sm:w-[290px] sm:h-[390px]"
              style={{ transform, opacity: hidden ? 0 : 1, zIndex: z, pointerEvents: hidden ? 'none' : 'auto' }}
              aria-hidden={hidden}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !hidden && hover !== k) setHover(k); }}
              onClick={() => { if (k !== 0 && !hidden) { setHover(null); go(i, k > 0 ? 'right' : 'left'); } }}>
              <div className="hs-face h-full" style={{ animationDelay: `${0.2 + (k + 3) * 0.06}s` }}>
                <StoryCard c={c} active={k === 0} lifted={k === hover} onAct={onAct} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center gap-4">
        <button type="button" aria-label="Previous card" disabled={n < 2} onClick={() => step(-1)}
          className="w-11 h-11 rounded-full border border-slate-200 bg-white grid place-items-center text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
        <div className="flex items-center gap-1.5">
          {cards.map((c, i) => (
            <button key={c.id} type="button" aria-label={`Card ${i + 1}: ${c.eyebrow}`} onClick={() => { if (i !== at) go(i, i > at ? 'right' : 'left'); }}
              className={`h-2 rounded-full transition-all ${i === at ? 'w-5 bg-[#3D52A0]' : 'w-2 bg-slate-300 hover:bg-slate-400'}`} />
          ))}
        </div>
        <button type="button" aria-label="Next card" disabled={n < 2} onClick={() => step(1)}
          className="w-11 h-11 rounded-full border border-slate-200 bg-white grid place-items-center text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

const MATERIAL: Record<string, string> = {
  money: 'brass', design: 'indigo', clients: 'rose', site: 'sage', team: 'navy',
  sheets: 'indigo', reviews: 'brass', meetings: 'rose', wins: 'sage',
};
const LABEL: Record<string, string> = {
  money: 'Money', design: 'Design', clients: 'Clients', site: 'Site', team: 'Team',
  sheets: 'My sheets', reviews: 'Reviews', meetings: 'Meetings', wins: 'Wins',
};

function StoryCard({ c, active, lifted, onAct }: { c: Story; active: boolean; lifted?: boolean; onAct: (a: StoryAction) => void }) {
  const size = c.figure.length > 9 ? 'text-3xl' : c.figure.length > 6 ? 'text-4xl' : 'text-5xl';
  return (
    <article className={`relative h-full rounded-[24px] overflow-hidden bg-white border border-white flex flex-col transition-shadow ${active || lifted ? 'shadow-[0_34px_60px_-26px_rgba(10,27,51,0.55)]' : 'shadow-[0_18px_40px_-26px_rgba(10,27,51,0.5)]'} ${active ? '' : 'cursor-pointer'}`}>
      <div className={`hs-${MATERIAL[c.ring]} ${active ? 'hs-sheen' : ''} relative h-[150px] shrink-0 px-4 pt-3.5 pb-3 flex flex-col text-left`}>
        <div className="flex items-start justify-between gap-2">
          <span className="px-2.5 py-1 rounded-full bg-black/20 text-white text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">{c.eyebrow}</span>
          <span className="text-white/85 text-sm font-semibold italic">{LABEL[c.ring]}</span>
        </div>
        <p className={`mt-auto ${size} font-black text-white leading-none truncate drop-shadow-sm`} style={DISPLAY}>{c.figure}</p>
      </div>
      <div className="flex-1 flex flex-col p-4 text-left">
        <p className="text-base font-bold text-slate-800 leading-snug line-clamp-2">{c.headline}</p>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-3">{c.reason}</p>
        {/* Every card's button acts, the ones at the side too; a tap elsewhere on a side card brings it to the middle. */}
        <button type="button" tabIndex={active ? 0 : -1} onClick={(e) => { e.stopPropagation(); onAct(c.action); }}
          className="mt-auto w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white shadow-sm bg-gradient-to-r from-[#3D52A0] to-[#5F79D6] hover:from-[#334486] hover:to-[#3D52A0] transition-colors">
          {c.action.label}<ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </article>
  );
}

function DeckSkeleton() {
  return (
    <div className="h-[500px] sm:h-[560px] flex items-start justify-center gap-4 pt-10">
      {[-1, 0, 1].map((k) => (
        <div key={k} className={`pp-shimmer rounded-[26px] w-[260px] h-[340px] ${k ? 'hidden md:block opacity-60' : ''}`} style={{ transform: `rotate(${k * 7}deg) translateY(${Math.abs(k) * 24}px)` }} />
      ))}
    </div>
  );
}

function AllClear({ designer }: { designer: boolean }) {
  return (
    <div className="h-[260px] flex flex-col items-center justify-center gap-3">
      <span className="hs-sage hs-ring w-16 h-16 rounded-full grid place-items-center text-white" style={{ ['--hs-edge' as any]: EDGE.sage }}><Sparkles className="w-6 h-6" /></span>
      <p className="text-sm font-bold text-slate-800">{designer ? 'Nothing waiting on you.' : 'Nothing needs you right now.'}</p>
      <p className="text-xs text-slate-500">New cards appear here as soon as something does.</p>
    </div>
  );
}

/* ── Swatches ────────────────────────────────────────────────────────────── */

const TILT = [-1.4, 0.8, -0.6, 1.2, -1];
const SwatchCard: React.FC<{ w: Swatch; k: number }> = ({ w, k }) => {
  return (
    <motion.div initial={{ opacity: 0, y: 16, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate: TILT[k % TILT.length] }}
      transition={{ delay: 0.35 + k * 0.07, type: 'spring', stiffness: 200, damping: 20 }}
      whileHover={{ y: -4, rotate: 0, transition: { duration: 0.2 } }}
      className="rounded-2xl bg-white border border-slate-200/70 overflow-hidden shadow-[0_14px_30px_-22px_rgba(10,27,51,0.55)] text-left">
      <div className={`hs-${w.material} h-[58px] px-3.5 flex items-end pb-2`}>
        <span className="text-xl font-black text-white tabular-nums leading-none drop-shadow-sm" style={DISPLAY}>{w.figure}</span>
      </div>
      <div className="px-3.5 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-800 truncate">{w.label}</p>
        <p className="text-[11px] text-slate-500 truncate">{w.sub}</p>
      </div>
    </motion.div>
  );
};
