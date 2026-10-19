import React from 'react';
import {
  Check, CheckCircle2, AlertTriangle, Gavel, ArrowRight, StickyNote, HelpCircle, Sparkles, X,
} from '@/lib/lucide-shim';
import { FLOW_STEPS, KIND_LABEL, type ChipTone, type LineKind, type SendCheck, type TrailEntry, stepLabel } from '../../lib/minutes';
import '../projectHeader/projectHeader.css';

/*
  The pieces every minutes screen shares, built to DESIGN.md: the Panel card,
  status chips, the segmented choice, the four steps, the line-kind chip.
*/

export const EYEBROW = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
export const BRAND_EYEBROW = 'text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]';
export const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50';
export const btnPri = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] transition-colors disabled:opacity-50';
export const btnSec = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors disabled:opacity-50';
export const btnSm = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50';
export const linkBtn = 'inline-flex items-center gap-1 text-xs font-bold text-[#3D52A0] hover:text-[#334486] disabled:opacity-50';

const TONE: Record<ChipTone, string> = {
  brand: 'bg-[#3D52A0]/10 text-[#3D52A0]',
  slate: 'bg-slate-100 text-slate-600',
  amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  rose: 'bg-rose-100 text-rose-700',
};

export const Chip: React.FC<{ tone?: ChipTone; children: React.ReactNode; className?: string }> = ({ tone = 'slate', children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${TONE[tone]} ${className}`}>{children}</span>
);

export const IconChip: React.FC<{ icon: React.ComponentType<any> }> = ({ icon: I }) => (
  <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><I className="w-4 h-4" /></span>
);

export const Panel: React.FC<{
  icon: React.ComponentType<any>; title: string; blurb?: string; right?: React.ReactNode; children?: React.ReactNode; className?: string;
}> = ({ icon, title, blurb, right, children, className = '' }) => (
  <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hud-panel-in ${className}`}>
    <header className={`flex items-start gap-3 ${children ? 'mb-4' : ''}`}>
      <IconChip icon={icon} />
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-slate-800">{title}</h3>
        {blurb && <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>}
      </div>
      {right}
    </header>
    {children}
  </section>
);

export function Seg<T extends string>({ value, options, onChange, label, small }: {
  value: T | null; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string; small?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 p-1 rounded-xl bg-slate-100">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={`${small ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'} rounded-lg font-bold whitespace-nowrap transition-colors ${value === o.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Write → Review → Send → Confirmed, with the current step lit. */
export const Steps: React.FC<{ on: number }> = ({ on }) => (
  <ol className="flex items-center gap-1.5 flex-wrap" aria-label="Where these minutes are">
    {FLOW_STEPS.map((s, i) => {
      const done = i < on || on === 4;
      const here = i === on && on < 4;
      return (
        <React.Fragment key={s}>
          <li aria-current={here ? 'step' : undefined}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${done ? 'bg-emerald-100 text-emerald-700' : here ? 'bg-[#3D52A0] text-white' : 'bg-slate-100 text-slate-500'}`}>
            {done ? <Check className="w-3 h-3" /> : <span className="tabular-nums">{i + 1}</span>}{s}
          </li>
          {i < FLOW_STEPS.length - 1 && <span aria-hidden className="w-4 h-px bg-slate-300" />}
        </React.Fragment>
      );
    })}
  </ol>
);

const KIND_STYLE: Record<LineKind, { icon: React.ComponentType<any>; cls: string }> = {
  decision: { icon: Gavel, cls: TONE.brand },
  action: { icon: ArrowRight, cls: TONE.amber },
  note: { icon: StickyNote, cls: TONE.slate },
  question: { icon: HelpCircle, cls: TONE.rose },
};

export const KindChip: React.FC<{ kind: LineKind; onClick?: () => void; title?: string }> = ({ kind, onClick, title }) => {
  const k = KIND_STYLE[kind];
  const body = <><k.icon className="w-3 h-3" />{KIND_LABEL[kind]}</>;
  const cls = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 whitespace-nowrap ${k.cls}`;
  return onClick
    ? <button type="button" onClick={onClick} title={title || 'Change the kind'} className={`${cls} hover:ring-2 hover:ring-[#3D52A0]/20`}>{body}</button>
    : <span className={cls}>{body}</span>;
};

export const FromNotes: React.FC = () => (
  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#3D52A0] shrink-0 whitespace-nowrap"><Sparkles className="w-3 h-3" />From notes · check</span>
);

/** Initials in a round chip. */
export const Avatar: React.FC<{ name: string; side?: string }> = ({ name, side }) => {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const bg = side === 'client' ? 'bg-slate-700' : side === 'vendor' ? 'bg-slate-400' : 'bg-[#3D52A0]';
  return <span aria-hidden className={`w-7 h-7 rounded-full grid place-items-center text-[10px] font-bold text-white shrink-0 ${bg}`}>{ini}</span>;
};

export const CheckRow: React.FC<{ c: SendCheck; i?: number }> = ({ c, i = 0 }) => (
  <li className="flex items-start gap-2 text-xs hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
    {c.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className={`w-4 h-4 shrink-0 ${c.blocking ? 'text-amber-600' : 'text-slate-400'}`} />}
    <span className={c.ok ? 'text-slate-600' : c.blocking ? 'text-amber-800 font-semibold' : 'text-slate-500'}>{c.text}</span>
  </li>
);

const fmtStamp = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** The record kept on every MoM, newest first. */
export const Trail: React.FC<{ trail: TrailEntry[] | undefined; waiting?: string | null }> = ({ trail, waiting }) => {
  const list = [...(trail || [])].reverse();
  const dot = (s: TrailEntry['step']) =>
    s === 'approved' || s === 'confirmed' ? 'bg-emerald-500' : s === 'returned' || s === 'correction_asked' ? 'bg-amber-500' : s === 'sent' ? 'bg-[#3D52A0]' : 'bg-slate-300';
  return (
    <ol className="relative border-l border-slate-200 ml-2 space-y-4">
      {waiting && (
        <li className="pl-4 relative hud-row-in">
          <span style={{ left: -5 }} className="absolute top-1.5 w-2.5 h-2.5 rounded-full bg-amber-500" />
          <p className="text-sm font-semibold text-slate-800">{waiting}</p>
        </li>
      )}
      {list.map((e, i) => (
        <li key={`${e.step}-${e.at}-${i}`} className="pl-4 relative hud-row-in" style={{ animationDelay: `${(i + 1) * 30}ms` }}>
          <span style={{ left: -5 }} className={`absolute top-1.5 w-2.5 h-2.5 rounded-full ${dot(e.step)}`} />
          <p className="text-sm font-semibold text-slate-800">{stepLabel(e)}</p>
          <p className="text-[11px] text-slate-500">{fmtStamp(e.at)}{e.note ? ` · ${e.note}` : ''}</p>
        </li>
      ))}
      {!list.length && !waiting && <li className="pl-4 text-xs text-slate-500">Nothing recorded yet.</li>}
    </ol>
  );
};

/** The full-screen shell every minutes screen sits in (the AssignProjectsModal pattern, wider). */
export const MinutesShell: React.FC<{
  eyebrow: string; title: React.ReactNode; step: number; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode; label: string;
}> = ({ eyebrow, title, step, onClose, footer, children, label }) => (
  <div className="fixed inset-0 z-[300] flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={label}>
    <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
    <div className="phd-pop relative w-full max-w-[1360px] bg-[#F6F7FB] sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[94vh]">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className={BRAND_EYEBROW}>{eyebrow}</p>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight truncate">{title}</h1>
        </div>
        <div className="hidden md:block"><Steps on={step} /></div>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-xl grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="bg-slate-50 border-t border-slate-100 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">{footer}</div>}
    </div>
  </div>
);
