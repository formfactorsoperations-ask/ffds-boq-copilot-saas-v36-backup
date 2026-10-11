import React from 'react';
import { motion, type Variants } from 'framer-motion';
import './people.css';

/*
  Small pieces shared by the People screens (DESIGN.md → "People motion"):
  progress rings, initials, loading placeholders, the success tick, and the
  framer-motion presets every list and section uses.
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
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string; id: string; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-flex flex-wrap gap-0.5 p-1 rounded-xl bg-slate-100">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(o.id)}
            className={`relative px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors disabled:opacity-50 ${on ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {on && <motion.span layoutId={`glide-${id}`} className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative">{o.label}</span>
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
