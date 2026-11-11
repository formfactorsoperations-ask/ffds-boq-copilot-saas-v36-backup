import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, Lock, ShieldCheck } from '@/lib/lucide-shim';
import { CountUp } from '../ui/HudBits';
import { inr } from '../../lib/opsDesk';
import type { Health } from '../../lib/opsDesk2';
import { useDesk } from './DeskBits';
import './od2Styles';

/*
  The pieces every Ops Desk 2.1 screen is built from (DESIGN.md → "Ops Desk
  2.1"): the band at the head of a screen with its stat tiles, rings that
  fill from empty, the line that says whose view this is, money that only
  the roles that see it see, fanned sheets and the approval countdown.
*/

const still = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export type Tone = 'brand' | 'good' | 'warn' | 'bad';
const STROKE: Record<Tone, string> = { brand: 'var(--od-brand)', good: 'var(--od-good-dot)', warn: 'var(--od-warn-dot)', bad: 'var(--od-bad-dot)' };
export const toneOf = (h: Health): Tone => h;

/** A ring that fills from empty to `p` (0 to 1). */
export const RingSvg: React.FC<{ p: number; size?: number; stroke?: number; tone?: Tone; children?: React.ReactNode; label?: string }> = ({ p, size = 64, stroke = 7, tone = 'brand', children, label }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const to = c * (1 - Math.max(0, Math.min(1, p || 0)));
  const [off, setOff] = useState(still() ? to : c);
  useEffect(() => {
    if (still()) { setOff(to); return; }
    const id = requestAnimationFrame(() => setOff(to));
    return () => cancelAnimationFrame(id);
  }, [to]);
  return (
    <span className="od-ring2" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--od-brand-tint)" strokeWidth={stroke} fill="none" />
        <circle className="od-arc" cx={size / 2} cy={size / 2} r={r} stroke={STROKE[tone]} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <span className="od-rl">{children}</span>
    </span>
  );
};

/** The head of a screen: eyebrow, title, a line, what is on the right, and the tiles under it. */
export const Band: React.FC<{ eyebrow: string; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode; className?: string; tour?: string }> =
  ({ eyebrow, title, sub, right, children, className = '', tour }) => (
    <section className={`od-band od-rise ${className}`} data-tour={tour}>
      <div className="od-band-h">
        <div className="min-w-0">
          <span className="od-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {right && <div className="od-r">{right}</div>}
      </div>
      {children}
    </section>
  );

export interface TileSpec { title: string; sub: string; big?: React.ReactNode; count?: number; unit?: string; ring?: { p: number; label: React.ReactNode; tone?: Tone }; alarm?: boolean }
/** The stat tiles under a band's head: frosted glass, figures counting up. */
export const Tiles: React.FC<{ tiles: TileSpec[] }> = ({ tiles }) => (
  <div className={`od-lstats ${tiles.length === 3 ? 'three' : ''}`}>
    {tiles.map((t) => (
      <div key={t.title} className={`od-ls1 od-glass ${t.alarm ? 'alarm' : ''}`}>
        {t.ring ? <RingSvg p={t.ring.p} size={70} stroke={8} tone={t.ring.tone || 'good'}>{t.ring.label}</RingSvg>
          : <b className="od-big od-num">{t.count != null ? <CountUp value={t.count} /> : t.big}{t.unit && <small>{t.unit}</small>}</b>}
        <span><b>{t.title}</b><small>{t.sub}</small></span>
      </div>
    ))}
  </div>
);

/** Whose view this is: every project with amounts, or my projects with the money taken out. */
export const SeeAs: React.FC = () => {
  const d = useDesk();
  if (d.seesMoney) {
    return (
      <div className="od-seeas lead od-rise" style={{ ['--d' as any]: 1 }}>
        <Eye />
        <span>You see this as <b>{d.me.name}{d.isLead ? ', a lead' : ''}</b>: {d.isLead ? 'every project on the desk' : 'your projects'}, amounts included.</span>
      </div>
    );
  }
  return (
    <div className="od-seeas od-rise" style={{ ['--d' as any]: 1 }}>
      <ShieldCheck />
      <span>You see this as <b>{d.me.name}</b>: {d.isLead ? 'every project on the desk' : `your ${d.projects.length} project${d.projects.length === 1 ? '' : 's'}`}. Amounts, rates and margins are taken out.</span>
    </div>
  );
};

/** An amount for the roles that see money; a "Hidden" mask for everyone else. */
export const Amt: React.FC<{ n: number | null | undefined; className?: string }> = ({ n, className = '' }) => {
  const d = useDesk();
  if (!d.seesMoney || n == null) return <span className="od-mask"><Lock />Hidden</span>;
  return <span className={`od-amt od-num ${className}`}>{inr(n)}</span>;
};

/** A few sheets fanned out, that spread when pointed at. */
export const Fan: React.FC<{ n: number }> = ({ n }) => (
  <span className="od-fan" aria-hidden>{Array.from({ length: Math.max(1, Math.min(4, n)) }, (_, i) => <i key={i} style={{ ['--k' as any]: i }} />)}</span>
);

/** The approval countdown: days left of five, and the two reminders. */
export const Countdown: React.FC<{ r: { day: number; left: number; overdue: boolean; reminders: number; of: number } }> = ({ r }) => (
  <span className="od-cdown" title={`Working day ${r.day} of 5 · ${r.reminders} of ${r.of} reminders sent`}>
    <RingSvg p={r.overdue ? 1 : r.day / 5} size={52} stroke={5} tone={r.overdue ? 'bad' : r.day >= 3 ? 'warn' : 'brand'}>
      <b className="od-num">{r.overdue ? '!' : r.left}</b><small>{r.overdue ? 'late' : 'left'}</small>
    </RingSvg>
    <span className="od-pips">{Array.from({ length: r.of }, (_, i) => <i key={i} className={i < r.reminders ? 'on' : ''} title={`Reminder ${i + 1}`} />)}</span>
  </span>
);

/** A score bar, for the health of a client out of 100. */
export const ScoreBar: React.FC<{ score: number; tone: Tone }> = ({ score, tone }) => (
  <span className="od-scorebar" aria-hidden><i style={{ width: `${Math.max(4, Math.min(100, score))}%`, background: STROKE[tone] }} /></span>
);

export const initialsOf = (name: string) => String(name || '').replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').split(/[\s@]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';

/**
 * Cards marked `od-tilt` lean towards the pointer. One listener for the whole
 * desk, mouse only, and nothing under reduced motion.
 */
export function useTiltCards(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || still()) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const t = (e.target as HTMLElement)?.closest?.('.od-tilt') as HTMLElement | null;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      t.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
      t.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`);
    };
    const out = (e: PointerEvent) => {
      const t = (e.target as HTMLElement)?.closest?.('.od-tilt') as HTMLElement | null;
      if (t && !t.contains(e.relatedTarget as Node)) { t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerout', out);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerout', out); };
  }, [root]);
}

/** Re-render every minute, for the red "now" line. */
export function useMinute(): number {
  const [t, setT] = useState(Date.now());
  const ref = useRef<number | null>(null);
  useEffect(() => {
    ref.current = window.setInterval(() => setT(Date.now()), 60000);
    return () => { if (ref.current) window.clearInterval(ref.current); };
  }, []);
  return t;
}

/* ── The rail: grouped, in a white card, with a highlight that slides ── */

export interface DeskRailItem<S extends string> { id: S; label: string; icon: React.ComponentType<any>; n?: number; alert?: boolean; tour?: string }
export function DeskRail<S extends string>({ groups, on, onPick }: { groups: { label?: string; items: DeskRailItem<S>[] }[]; on: S; onPick: (s: S) => void }) {
  return (
    <nav className="od-rail" aria-label="Ops Desk sections">
      {groups.map((g, gi) => (
        <React.Fragment key={gi}>
          {g.label && <h4>{g.label}</h4>}
          {g.items.map((x, i) => {
            const Icon = x.icon;
            const active = on === x.id;
            return (
              <button key={x.id} type="button" className={`${active ? 'on' : ''} hud-row-in`} style={{ animationDelay: `${(gi * 3 + i) * 30}ms` }}
                aria-current={active ? 'page' : undefined} data-tour={x.tour} onClick={() => onPick(x.id)}>
                {active && <motion.span layoutId="od-rail" className="od-rail-on" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
                <Icon /><span>{x.label}</span>
                {!!x.n && <span className={`od-badge ${x.alert ? 'bad' : ''}`}>{x.n}</span>}
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </nav>
  );
}
