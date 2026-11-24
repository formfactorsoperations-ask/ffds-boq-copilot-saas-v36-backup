import React, { useEffect, useRef } from 'react';
import { FileUp, type LucideIcon } from 'lucide-react';
import { CountUp } from '../ui/HudBits';
import { ProjectMark } from '../drawingReview/DeskParts';
import { cx } from './parts';

/*
  DESIGN DESK 2.0: the rail.

  The rail used to be three buttons that scrolled away with the page, which
  left the whole left side of the desk empty (owner, 25 Nov 2026). It is now a
  full-height side panel that stays in view: the three pages, how much of the
  studio's drawings are approved, what needs the person, the projects that
  have drawings (one click to open one) and, for someone who uploads, Upload
  drawings. On a phone it is still a row of tabs and the rest is left out.

  Staying in view is done here and not with CSS `sticky`: the app's root has
  `overflow-x: hidden`, which makes it the box a sticky element sticks to, and
  that box never scrolls. So the rail is pinned (position: fixed) once its
  place in the page has scrolled under the app's top bar, and let go when it
  comes back. If something above it ever makes `fixed` measure from itself
  (a transformed parent), the rail is moved with a transform instead.
*/

const GAP = 16;
const MIN_H = 320;

export function useRailFollow(slot: React.RefObject<HTMLElement | null>, rail: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const s = slot.current, r = rail.current;
    if (!s || !r || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const wide = window.matchMedia('(min-width: 1024px)');
    let fixedOk = true, raf = 0;
    const clear = () => { ['position', 'top', 'left', 'width', 'height', 'transform'].forEach((k) => r.style.removeProperty(k)); };
    const place = () => {
      raf = 0;
      if (!wide.matches) { clear(); return; }
      /* The app's top bar, when it is pinned over the page. */
      const bar = document.querySelector('header');
      const pinned = bar && getComputedStyle(bar).position === 'fixed' ? bar.getBoundingClientRect() : null;
      const top = Math.max(0, pinned && pinned.height ? pinned.bottom : 0) + GAP;
      const box = s.getBoundingClientRect();
      const end = s.parentElement ? s.parentElement.getBoundingClientRect().bottom : Infinity;
      const view = window.innerHeight;
      if (box.top >= top) {
        clear();
        r.style.height = `${Math.max(MIN_H, Math.min(view - GAP, end) - box.top)}px`;
        return;
      }
      r.style.height = `${Math.max(MIN_H, Math.min(view - GAP, end) - top)}px`;
      if (fixedOk) {
        r.style.removeProperty('transform');
        r.style.position = 'fixed';
        r.style.top = `${top}px`;
        r.style.left = `${box.left}px`;
        r.style.width = `${box.width}px`;
        const now = r.getBoundingClientRect();
        if (Math.abs(now.top - top) > 2 || Math.abs(now.left - box.left) > 2) fixedOk = false;
      }
      if (!fixedOk) {
        ['position', 'top', 'left', 'width'].forEach((k) => r.style.removeProperty(k));
        r.style.transform = `translateY(${Math.round(top - box.top)}px)`;
      }
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(place); };
    place();
    window.addEventListener('scroll', ask, { passive: true, capture: true });
    window.addEventListener('resize', ask);
    wide.addEventListener?.('change', ask);
    const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(ask) : null;
    watch?.observe(s);
    if (s.parentElement) watch?.observe(s.parentElement);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', ask, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', ask);
      wide.removeEventListener?.('change', ask);
      watch?.disconnect();
      clear();
    };
  }, [slot, rail]);
}

export interface RailTab<T extends string> { at: T; label: string; icon: LucideIcon; count?: number }
export interface RailProject { id: string; name: string; code: string; color: string; total: number; need: number; done: number }

interface Props<T extends string> {
  tabs: RailTab<T>[];
  on: T;
  go: (at: T) => void;
  /** Every drawing the desk knows, counted. */
  stats: { total: number; approved: number; need: number; review: number; changes: number };
  /** The projects that have drawings, the ones that need the person first. */
  projects: RailProject[];
  openProject: string | null;
  goProject: (id: string) => void;
  /** For someone who uploads: opens Upload drawings. */
  onUpload?: () => void;
}

/* A small flat, wall by wall: the outline, the partitions, two doors, a bed, a table and the dimension line above. */
const PLAN = [
  'M10 26 H150 V62 H210 V142 H10 Z',
  'M92 26 V72 M92 96 V142',
  'M10 86 H58 M150 62 V100',
  'M92 72 A24 24 0 0 1 116 96',
  'M58 86 A22 22 0 0 0 80 108',
  'M22 38 H62 V70 H22 Z M22 48 H62',
  'M180 112 m-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0',
  'M10 12 H150 M10 7 V17 M150 7 V17',
];

const R = 26;
const LEN = 2 * Math.PI * R;

export function DeskRail<T extends string>({ tabs, on, go, stats, projects, openProject, goProject, onUpload }: Props<T>) {
  const slot = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  useRailFollow(slot, rail);
  const pct = stats.total ? Math.round((stats.approved / stats.total) * 100) : 0;
  const tiles: { label: string; value: number; tone: string }[] = [
    { label: 'Need you', value: stats.need, tone: stats.need ? 'text-amber-300' : 'text-white' },
    { label: 'Being checked', value: stats.review, tone: 'text-white' },
    { label: 'Being changed', value: stats.changes, tone: 'text-white' },
  ];
  return (
    <div ref={slot} className="shrink-0 lg:w-[232px] xl:w-[256px]">
      <nav ref={rail} aria-label="Design Desk" className="dd2h-rail flex gap-1 overflow-x-auto rounded-2xl p-2 lg:flex-col lg:overflow-hidden lg:p-3">
        {tabs.map((t) => {
          const active = on === t.at;
          return (
            <button key={t.at} type="button" onClick={() => go(t.at)} aria-current={active ? 'page' : undefined}
              className={cx('flex min-h-[44px] shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-colors', active ? 'bg-emerald-600 text-white shadow-sm hud-rail-active' : 'text-emerald-100 hover:bg-white/10 hover:text-white')}>
              <t.icon size={18} aria-hidden />{t.label}
              {!!t.count && <span className="dd2h-pop ml-auto grid h-6 min-w-[24px] place-items-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-amber-950" title="Drawings that need you">{t.count}</span>}
            </button>
          );
        })}

        {/* The rest of the rail: on a wide screen only. */}
        <div className="hidden min-h-0 flex-1 flex-col lg:flex" data-rail-more>
          <section aria-label="The studio's drawings" className="hud-row-in mt-4 border-t border-white/10 pt-4" style={{ animationDelay: '90ms' }}>
            <div className="flex items-center gap-3 px-1">
              <svg viewBox="0 0 64 64" className="dd2h-ring h-16 w-16 shrink-0 -rotate-90" aria-hidden style={{ '--len': LEN, '--off': LEN * (1 - pct / 100) } as React.CSSProperties}>
                <circle cx="32" cy="32" r={R} fill="none" strokeWidth="7" className="stroke-white/10" />
                <circle cx="32" cy="32" r={R} fill="none" strokeWidth="7" strokeLinecap="round" className="val stroke-emerald-400" />
              </svg>
              <p className="min-w-0">
                <span className="block text-2xl font-bold leading-none text-white"><CountUp value={pct} />%</span>
                <span className="mt-1 block text-xs font-semibold text-emerald-100">{stats.approved} of {stats.total} drawing{stats.total === 1 ? '' : 's'} approved</span>
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-1.5">
              {tiles.map((t) => (
                <div key={t.label} className="dd2h-tile rounded-xl px-1.5 py-2 text-center">
                  <dd className={cx('text-lg font-bold leading-none', t.tone)}><CountUp value={t.value} /></dd>
                  <dt className="mt-1 text-xs leading-tight text-emerald-100">{t.label}</dt>
                </div>
              ))}
            </dl>
          </section>

          <section aria-label="Projects with drawings" className="mt-4 flex min-h-0 shrink flex-col border-t border-white/10 pt-3">
            <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-emerald-300">Projects with drawings</h3>
            {projects.length ? (
              <ul className="dd2h-scroll -mr-1 mt-1.5 min-h-0 overflow-y-auto pr-1">
                {projects.map((p, i) => {
                  const here = openProject === p.id;
                  return (
                    <li key={p.id} className="hud-row-in" style={{ animationDelay: `${140 + Math.min(i, 10) * 30}ms` }}>
                      <button type="button" onClick={() => goProject(p.id)} aria-current={here ? 'true' : undefined} title={p.name} aria-label={`Open ${p.name}`}
                        className={cx('dd2h-proj flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-2 text-left', here ? 'bg-white/15 text-white' : 'text-emerald-50 hover:bg-white/10')}>
                        <ProjectMark code={p.code} color={p.color} size={26} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                        {p.need > 0
                          ? <span className="grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-amber-400 px-1 text-xs font-bold text-amber-950" title={`${p.need} need${p.need === 1 ? 's' : ''} you`}>{p.need}</span>
                          : <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-300" title={`${p.done} of ${p.total} approved`}>{p.done}/{p.total}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mt-1.5 px-2 text-sm text-emerald-100">A project shows here once it has a drawing.</p>}
          </section>

          {/* What is left of the rail: a plan that draws itself, when there is room for it. */}
          <div className="dd2h-fill flex min-h-0 flex-1 items-end" aria-hidden>
            <svg viewBox="0 0 220 150" className="dd2h-plan w-full">
              {PLAN.map((d, i) => <path key={d} d={d} pathLength={1} style={{ '--i': i } as React.CSSProperties} />)}
            </svg>
          </div>

          {onUpload && (
            <button type="button" onClick={onUpload}
              className="mt-3 inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-bold text-white ring-1 ring-white/15 transition-colors hover:bg-emerald-600">
              <FileUp size={18} aria-hidden />Upload drawings
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
