import React, { useMemo } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type Variants } from 'framer-motion';
import { TreePalm, Thermometer, Coffee, Gift, House, Building2, HardHat } from '@/lib/lucide-shim';
import type { LeaveType, Mode } from '../../lib/peopleDesk';
import './people.css';

/*
  Small pieces shared by the People screens (DESIGN.md → "People motion"):
  progress rings, initials, loading placeholders, the success tick, and the
  framer-motion presets every list and section uses; and, from round two,
  depth: cards that tilt to the pointer, icon tiles, coins that flip, a
  confetti burst, and the icon for each kind of leave and place of work.
*/

export const EASE = [0.22, 1, 0.36, 1] as const;

/** A list whose rows rise in one after another. */
export const listV: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } } };
export const rowV: Variants = {
  hidden: { opacity: 0, y: 10, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.42, ease: EASE } },
};
/** A section swapping in. */
export const sectionV: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.99 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
};

const TONE = { brand: '#3D52A0', ok: '#10B981', warn: '#F59E0B', bad: '#F43F5E', slate: '#94A3B8' } as const;
export type RingTone = keyof typeof TONE;

/** A ring that fills from empty to `value` (0 to 1), with anything in its middle. */
export const Ring: React.FC<{ value: number; size?: number; stroke?: number; tone?: RingTone; children?: React.ReactNode; label?: string }> =
  ({ value, size = 120, stroke = 10, tone = 'brand', children, label }) => {
    const r = (size - stroke) / 2;
    const full = 2 * Math.PI * r;
    const v = Math.max(0, Math.min(1, value || 0));
    return (
      <div className="relative shrink-0 grid place-items-center pp-ring-in" style={{ width: size, height: size }} role="img" aria-label={label}>
        <svg width={size} height={size} className="-rotate-90 absolute inset-0" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="pp-ring-track" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={TONE[tone]}
            className="pp-ring-fill" strokeDasharray={full} strokeDashoffset={full * (1 - v)} style={{ ['--pp-full' as any]: full }} />
        </svg>
        <div className="relative text-center">{children}</div>
      </div>
    );
  };

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';

export const Avatar: React.FC<{ name: string; size?: 'sm' | 'md'; ring?: 'ok' | 'warn' | null }> = ({ name, size = 'md', ring = null }) => (
  <span title={name}
    className={`${size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-9 h-9 text-xs'} shrink-0 rounded-full bg-[#3D52A0]/10 text-[#3D52A0] font-black grid place-items-center ${ring === 'ok' ? 'ring-2 ring-emerald-400' : ring === 'warn' ? 'ring-2 ring-amber-400' : ''}`}>
    {initials(name)}
  </span>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => <div className={`pp-shimmer rounded-lg ${className}`} />;

/** A tick that draws itself inside a bursting ring. */
export const DoneTick: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <span className="pp-burst relative inline-grid place-items-center rounded-full bg-emerald-100 text-emerald-600" style={{ width: size, height: size }}>
    <svg className="pp-tick" width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  </span>
);

/** A segmented choice whose selected pill glides between options. */
export function Glide<T extends string>({ value, options, onChange, label, id, disabled }: {
  value: T; options: { id: T; label: string; icon?: React.ComponentType<any> }[]; onChange: (v: T) => void; label: string; id: string; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-flex flex-wrap gap-0.5 p-1 rounded-xl bg-slate-100">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(o.id)}
            className={`relative px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors disabled:opacity-50 ${on ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {on && <motion.span layoutId={`glide-${id}`} className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative inline-flex items-center gap-1.5">{o.icon && <o.icon className={`w-3.5 h-3.5 transition-transform ${on ? 'scale-110 text-[#3D52A0]' : ''}`} />}{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A small line that rises in to say something happened, or went wrong. */
export const Notice: React.FC<{ text: string | null; tone?: 'ok' | 'bad'; onClose?: () => void }> = ({ text, tone = 'ok', onClose }) => (
  text ? (
    <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role={tone === 'bad' ? 'alert' : 'status'}
      className={`text-xs rounded-lg px-3 py-2 border flex items-start gap-2 ${tone === 'bad' ? 'text-rose-800 bg-rose-50 border-rose-200' : 'text-emerald-900 bg-emerald-50 border-emerald-200'}`}>
      <span className="flex-1">{text}</span>
      {onClose && <button type="button" onClick={onClose} className="font-bold opacity-60 hover:opacity-100" aria-label="Dismiss">×</button>}
    </motion.p>
  ) : null
);

/* ── Round two: depth ────────────────────────────────────────────────────── */

/** The icon for each kind of leave, and for where someone works. */
export const LEAVE_ICON: Record<LeaveType, React.ComponentType<any>> = { PL: TreePalm, SL: Thermometer, CL: Coffee, COMP: Gift, WFH: House };
export const MODE_ICON: Record<Mode, React.ComponentType<any>> = { Office: Building2, Site: HardHat, WFH: House };

const TILE: Record<RingTone, string> = {
  brand: 'bg-[#3D52A0]/10 text-[#3D52A0]', ok: 'bg-emerald-100 text-emerald-600', warn: 'bg-amber-100 text-amber-600',
  bad: 'bg-rose-100 text-rose-600', slate: 'bg-slate-100 text-slate-500',
};
/** An icon in a tinted tile that lifts and turns when it, or the `group` around it, is hovered. */
export const IconTile: React.FC<{ icon: React.ComponentType<any>; tone?: RingTone; size?: 'sm' | 'md' | 'lg'; className?: string }> =
  ({ icon: Icon, tone = 'brand', size = 'md', className = '' }) => {
    const box = size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-12 h-12 rounded-2xl' : 'w-10 h-10 rounded-xl';
    const glyph = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';
    return <span className={`pp-tile shrink-0 ${box} ${TILE[tone]} ${className}`}><Icon className={glyph} strokeWidth={2.1} /></span>;
  };

/**
 * A card that tilts towards the pointer in 3D, with a light that follows it.
 * Still under reduced motion and on touch.
 */
export const Tilt: React.FC<{ children: React.ReactNode; className?: string; max?: number; glare?: boolean; as?: 'div' | 'section' }> =
  ({ children, className = '', max = 7, glare = true }) => {
    const still = useReducedMotion();
    const x = useMotionValue(0.5), y = useMotionValue(0.5);
    const rx = useSpring(useTransform(y, [0, 1], [max, -max]), { stiffness: 220, damping: 22 });
    const ry = useSpring(useTransform(x, [0, 1], [-max, max]), { stiffness: 220, damping: 22 });
    const light = useTransform([x, y] as any, ([a, b]: number[]) => `radial-gradient(420px circle at ${a * 100}% ${b * 100}%, rgba(255,255,255,0.55), transparent 55%)`);
    if (still) return <div className={className}>{children}</div>;
    return (
      <motion.div className={`relative ${className}`} style={{ rotateX: rx, rotateY: ry, transformPerspective: 1100, transformStyle: 'preserve-3d' }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const r = e.currentTarget.getBoundingClientRect();
          x.set((e.clientX - r.left) / r.width);
          y.set((e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => { x.set(0.5); y.set(0.5); }}>
        {children}
        {glare && <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-soft-light" style={{ background: light }} />}
      </motion.div>
    );
  };

/** A coin that flips from its back (not in yet) to its face (here), in 3D. */
export const Coin: React.FC<{ front: React.ReactNode; back: React.ReactNode; shown: boolean; delay?: number; size?: number }> =
  ({ front, back, shown, delay = 0, size = 56 }) => (
    <div className="pp-3d shrink-0" style={{ width: size, height: size }}>
      <motion.div className="pp-keep relative w-full h-full" initial={{ rotateY: 180 }} animate={{ rotateY: shown ? 0 : 180 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14, delay }}>
        <div className="pp-face absolute inset-0">{front}</div>
        <div className="pp-face pp-flipped absolute inset-0">{back}</div>
      </motion.div>
    </div>
  );

const BURST = ['#3D52A0', '#10B981', '#F59E0B', '#F43F5E', '#3D52A0', '#10B981'];
/** A burst of small pieces in the brand and state colours, for an arrival or a day well done. */
export const Confetti: React.FC<{ pieces?: number; spread?: number }> = ({ pieces = 18, spread = 90 }) => {
  const still = useReducedMotion();
  const bits = useMemo(() => Array.from({ length: pieces }, (_, i) => {
    const a = (i / pieces) * Math.PI * 2 + Math.random() * 0.4;
    const d = spread * (0.55 + Math.random() * 0.45);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 20, r: Math.random() * 540 - 270, c: BURST[i % BURST.length], w: 4 + Math.round(Math.random() * 4), round: i % 3 === 0 };
  }), [pieces, spread]);
  if (still) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-10">
      {bits.map((b, i) => (
        <motion.span key={i} className={`absolute ${b.round ? 'rounded-full' : 'rounded-sm'}`} style={{ width: b.w, height: b.round ? b.w : b.w * 1.8, background: b.c, left: 0, top: 0 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{ x: b.x, y: [0, b.y, b.y + 40], opacity: [1, 1, 0], rotate: b.r, scale: 1 }}
          transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1], times: [0, 0.6, 1] }} />
      ))}
    </span>
  );
};
