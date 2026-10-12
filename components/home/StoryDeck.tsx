import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, Sparkles, ArrowRight } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import { isLimitedRole, isClientRelationsRole, seesStudioFinance } from '../../lib/roleAccess';
import { buildStories, paymentsOf, type Ring, type Story, type StoryAction, type Swatch } from '../../lib/homeStories';
import { teamToday } from '../../lib/homeWidgets';
import { opsSettingsOf } from '../../lib/opsDesk';
import { formatCompactINR } from '../../lib/utils';
import { openInDesignReview } from '../../services/drawingReviewService';
import { usePeople } from '../../services/peopleService';
import type { HomeFeeds } from './useHomeFeeds';
import { greetingWord } from './useStudioHomeData';
import { EDGE } from './homeStyles';
import '../people/peopleStyles';

/*
  THE TOP OF HOME (lib/homeStories.ts): a greeting, the story rings, a fanned
  deck of cards and a strip of five swatches.

  Each card is one thing worth knowing with the button that acts on it; the
  deck opens on the most pressing. Tap a ring to see only its cards. Fan
  through with the arrows, a swipe, the arrow keys, or by tapping a card at
  the side. Built for the owner's chosen design (Option 6, 12 Oct 2026):
  the five materials are Home's only (DESIGN.md → "Home stories").
*/

const INK = '#0A1B33';
const DISPLAY = { fontFamily: 'var(--font-display)' } as const;

export default function StoryDeck({ feeds, counts, projects, role, roles, userName, onNavigate, onOpenProject, onCreateNew }: {
  feeds: HomeFeeds;
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

  const [ring, setRing] = useState<string | null>(null);
  /* The most pressing card in the middle, the next ones alternating either side of it, like a fanned hand. */
  const cards = useMemo(() => fan(ring ? stories.cards.filter((c) => c.ring === ring) : stories.cards), [ring, stories.cards]);
  const middle = Math.floor((cards.length - 1) / 2);
  const [idx, setIdx] = useState<number | null>(null);
  useEffect(() => { setIdx(null); }, [ring, stories.cards.length]);
  const at = Math.min(idx ?? middle, Math.max(0, cards.length - 1));

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
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{today}</p>
        <h1 className="mt-2 text-[30px] md:text-[44px] font-bold leading-[1.08] tracking-tight" style={{ ...DISPLAY, color: INK }}>
          {greetingWord()}, {first}. {stories.view === 'designer' ? 'Here is your day.' : 'Here is your studio.'}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
          {stories.view === 'designer'
            ? 'Only your projects. Fan through your cards; each one has the button that acts on it.'
            : 'Tap a story or fan through the cards: each is one thing worth knowing, with the button that acts on it.'}
        </p>
        {!isLimitedRole(who) && (
          <button type="button" onClick={onCreateNew}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-bold text-[#3D52A0] hover:border-[#3D52A0]/40 hover:bg-white transition-colors">
            <Plus className="w-4 h-4" />New project
          </button>
        )}

        {/* The rings */}
        {stories.rings.length > 0 && (
          <div className="mt-7 flex flex-wrap justify-center gap-3 sm:gap-5 md:gap-7" role="tablist" aria-label="Stories">
            {stories.rings.map((r, k) => <RingButton key={r.id} r={r} k={k} on={ring === r.id} onClick={() => setRing(ring === r.id ? null : r.id)} />)}
          </div>
        )}

        {/* The deck */}
        <div className="w-full mt-6">
          {loading && cards.length === 0 ? <DeckSkeleton />
            : cards.length === 0 ? <AllClear designer={stories.view === 'designer'} />
            : <Deck cards={cards} at={at} setAt={setIdx} onAct={act} />}
        </div>

        {/* The swatches */}
        <div className="w-full mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {stories.swatches.map((w, k) => <SwatchCard key={w.id} w={w} k={k} />)}
        </div>
      </div>
    </section>
  );
}

/** [0,1,2,3,4] → [4,2,0,1,3]: the first in the middle, then out to either side, right first. */
function fan<T>(list: T[]): T[] {
  const n = list.length, mid = Math.floor((n - 1) / 2);
  const slots: number[] = [];
  for (let d = 0; slots.length < n; d++) for (const p of d ? [mid + d, mid - d] : [mid]) if (p >= 0 && p < n) slots.push(p);
  const out = new Array<T>(n);
  list.forEach((x, i) => { out[slots[i]] = x; });
  return out;
}

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

function useWide() {
  const [wide, setWide] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 768));
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= 768);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return wide;
}

function Deck({ cards, at, setAt, onAct }: { cards: Story[]; at: number; setAt: (n: number) => void; onAct: (a: StoryAction) => void }) {
  const still = useReducedMotion();
  const wide = useWide();
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  /* The side card under the mouse lifts to the front for a look, without moving the fan; a click brings it to the middle. */
  const [peek, setPeek] = useState<string | null>(null);
  const go = (n: number) => { setPeek(null); setAt(Math.max(0, Math.min(cards.length - 1, n))); };
  const spread = wide ? 168 : 74;
  const reach = wide ? 3 : 1;
  return (
    <div className="flex flex-col items-center">
      <div ref={box} tabIndex={0} aria-roledescription="carousel" aria-label="Story cards"
        onKeyDown={(e) => { if (e.key === 'ArrowRight') go(at + 1); if (e.key === 'ArrowLeft') go(at - 1); }}
        onPointerDown={(e) => { drag.current = e.clientX; }}
        onPointerUp={(e) => { if (drag.current == null) return; const dx = e.clientX - drag.current; drag.current = null; if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1)); }}
        className="hs-stage relative w-full h-[420px] md:h-[440px] outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 rounded-3xl touch-pan-y select-none">
        {cards.map((c, i) => {
          const k = i - at;
          const off = Math.abs(k);
          if (off > reach + 1) return null;
          const hidden = off > reach;
          const lifted = peek === c.id && k !== 0 && !hidden;
          return (
            <motion.div key={c.id} className="hs-card absolute left-1/2 top-4 w-[272px] md:w-[290px] -ml-[136px] md:-ml-[145px]"
              initial={still ? false : { opacity: 0, y: 40, rotate: k * 9 }}
              animate={{
                x: k * spread, y: lifted ? off * (wide ? 28 : 18) - 34 : off * (wide ? 28 : 18),
                rotate: still ? 0 : k * (wide ? 8.5 : 6) * (lifted ? 0.35 : 1), scale: lifted ? 1.02 : 1 - off * 0.05,
                opacity: hidden ? 0 : 1, rotateY: still || lifted ? 0 : k * -4,
              }}
              transition={{ type: 'spring', stiffness: lifted ? 260 : 170, damping: 22, mass: 0.9 }}
              style={{ zIndex: lifted ? 60 : 50 - off, transformOrigin: '50% 120%', pointerEvents: hidden ? 'none' : 'auto' }}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse' && k !== 0) setPeek(c.id); }}
              onPointerLeave={() => setPeek((p) => (p === c.id ? null : p))}
              onClick={() => { if (k !== 0) go(i); }}>
              <StoryCard c={c} active={k === 0} lifted={lifted} onAct={onAct} />
            </motion.div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center gap-4">
        <button type="button" aria-label="Previous card" disabled={at === 0} onClick={() => go(at - 1)}
          className="w-11 h-11 rounded-full border border-slate-200 bg-white grid place-items-center text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
        <div className="flex items-center gap-1.5">
          {cards.map((c, i) => (
            <button key={c.id} type="button" aria-label={`Card ${i + 1}: ${c.eyebrow}`} onClick={() => go(i)}
              className={`h-2 rounded-full transition-all ${i === at ? 'w-5 bg-[#3D52A0]' : 'w-2 bg-slate-300 hover:bg-slate-400'}`} />
          ))}
        </div>
        <button type="button" aria-label="Next card" disabled={at === cards.length - 1} onClick={() => go(at + 1)}
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
    <article className={`relative h-[360px] md:h-[372px] rounded-[26px] overflow-hidden bg-white border border-white flex flex-col transition-shadow ${active || lifted ? 'shadow-[0_34px_60px_-26px_rgba(10,27,51,0.55)]' : 'shadow-[0_18px_40px_-26px_rgba(10,27,51,0.5)]'} ${active ? '' : 'cursor-pointer'}`}>
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
        <button type="button" tabIndex={active ? 0 : -1} onClick={(e) => { e.stopPropagation(); if (active) onAct(c.action); }}
          className="mt-auto w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white shadow-sm bg-gradient-to-r from-[#3D52A0] to-[#5F79D6] hover:from-[#334486] hover:to-[#3D52A0] transition-colors">
          {c.action.label}<ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </article>
  );
}

function DeckSkeleton() {
  return (
    <div className="h-[420px] md:h-[440px] flex items-start justify-center gap-4 pt-4">
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
