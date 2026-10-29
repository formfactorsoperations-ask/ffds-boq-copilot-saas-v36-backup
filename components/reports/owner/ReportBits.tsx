import React from 'react';
import { Info } from '@/lib/lucide-shim';
import { CountUp, Dot } from '../../ui/HudBits';
import { inr, pctText, type Delta, type Tone } from '../../../lib/ownerReports';

/*
  The pieces every Reports section is built from, on DESIGN.md's Panel
  pattern, with the reports deck's motion: panels rise in (hud-panel-in), bars
  grow once (rp-hbar, rp-bar), rows land in turn (hud-row-in), figures count up
  (CountUp) and lines draw themselves (rp-line). All of it stops under reduced
  motion in src/index.css.
*/

export const BRAND = '#3D52A0';
export const TONE_HEX: Record<Tone, string> = { ok: '#059669', warn: '#D97706', bad: '#E11D48', none: '#94A3B8' };
export const TONE_CHIP: Record<Tone, string> = {
  ok: 'bg-emerald-100 text-emerald-700', warn: 'bg-amber-100 text-amber-700', bad: 'bg-rose-100 text-rose-700', none: 'bg-slate-100 text-slate-600',
};
export const STATE_WORD: Record<Tone, string> = { ok: 'On track', warn: 'Watch', bad: 'Act now', none: 'No target' };

export const fmtInr = (v: number) => inr(v);
export const fmtPct = (v: number) => pctText(v);

export const Chip: React.FC<{ tone?: Tone | 'brand'; children: React.ReactNode }> = ({ tone = 'none', children }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${tone === 'brand' ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : TONE_CHIP[tone]}`}>
    {children}
  </span>
);

export const IconChip: React.FC<{ icon: React.ElementType }> = ({ icon: Icon }) => (
  <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0">
    <Icon className="w-4 h-4" strokeWidth={2.2} />
  </span>
);

export const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`text-[10px] font-bold uppercase tracking-wider text-slate-500 ${className}`}>{children}</span>
);

/** A figure that counts up as money or a percentage. */
export const Figure: React.FC<{ value: number | null; format: 'inr' | 'pct' | 'days' | 'count'; className?: string; color?: string; empty?: string }> = ({
  value, format, className = 'text-3xl', color = 'text-slate-800', empty = '—',
}) => {
  const f = format === 'inr' ? fmtInr : format === 'pct' ? fmtPct : format === 'days' ? (v: number) => `${Math.round(v)} ${Math.round(v) === 1 ? 'day' : 'days'}` : (v: number) => Math.round(v).toLocaleString('en-IN');
  return (
    <span className={`${className} ${color} leading-none font-black tabular-nums`}>
      {value == null ? empty : <CountUp value={value} format={f} />}
    </span>
  );
};

/** The footer every panel carries: how the figures are counted, and what they cannot see. */
export const Foot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-start gap-1.5 mt-auto">
    <Info className="w-3 h-3 shrink-0 text-slate-400 mt-[3px]" strokeWidth={2.4} />
    <span className="text-[11px] leading-relaxed text-slate-500">{children}</span>
  </div>
);

/** The Panel card: icon chip, title, blurb, an optional chip on the right, the body and the footer. */
export const Panel: React.FC<{
  icon: React.ElementType;
  title: string;
  blurb?: string;
  aside?: React.ReactNode;
  foot?: React.ReactNode;
  delay?: number;
  lift?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ icon, title, blurb, aside, foot, delay = 0, lift = true, className = '', children }) => (
  <section
    className={`rp-frame ${lift ? 'rp-panel' : ''} bg-white rounded-2xl border border-slate-200 shadow-sm hud-panel-in flex flex-col overflow-hidden ${className}`}
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="p-6 flex-1 min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <IconChip icon={icon} />
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800">{title}</h3>
            {blurb && <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>}
          </div>
        </div>
        {aside}
      </div>
      <div className="mt-5">{children}</div>
    </div>
    {foot && <Foot>{foot}</Foot>}
  </section>
);

/** A thin bar on the shared track. */
export const Track: React.FC<{ pct: number; color?: string; delay?: number; height?: string; className?: string }> = ({
  pct, color = BRAND, delay = 0, height = 'h-1.5', className = '',
}) => (
  <div className={`${height} rounded-full bg-slate-100 overflow-hidden ${className}`}>
    <div className="rp-hbar h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color, animationDelay: `${delay}ms` }} />
  </div>
);

/** A labelled bar: name and figure above, the bar under them. */
export const BarRow: React.FC<{ label: React.ReactNode; figure: React.ReactNode; pct: number; color?: string; delay?: number; figureClass?: string }> = ({
  label, figure, pct, color, delay = 0, figureClass = 'text-slate-800',
}) => (
  <div className="hud-row-in" style={{ animationDelay: `${delay}ms` }}>
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-slate-700 min-w-0">{label}</span>
      <span className={`text-xs font-bold tabular-nums shrink-0 ${figureClass}`}>{figure}</span>
    </div>
    <Track pct={pct} color={color} delay={delay + 40} className="mt-1.5" />
  </div>
);

/** One part of a whole, as a segmented bar. */
export const SplitBar: React.FC<{ parts: { key: string; value: number; color: string; label: string }[]; delay?: number }> = ({ parts, delay = 0 }) => {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="flex h-3.5 rounded-full overflow-hidden bg-slate-100">
      {parts.filter((p) => p.value > 0).map((p, i) => (
        <div key={p.key} className="rp-hbar h-full" title={`${p.label}: ${inr(p.value)}`}
          style={{ width: `${(p.value / total) * 100}%`, background: p.color, animationDelay: `${delay + i * 110}ms` }} />
      ))}
    </div>
  );
};

export const Swatch: React.FC<{ color: string }> = ({ color }) => (
  <span className="w-2.5 h-2.5 rounded-[3px] inline-block shrink-0" style={{ background: color }} />
);

/** Up or down since the period before; green when the move is good for the studio. */
export const DeltaChip: React.FC<{ delta: Delta | null }> = ({ delta }) => {
  if (!delta) return null;
  const cls = delta.dir === 'flat' ? 'bg-slate-100 text-slate-600' : delta.good ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${cls}`}>
      {delta.dir === 'up' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" aria-hidden><polyline points="18 15 12 9 6 15" /></svg>}
      {delta.dir === 'down' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>}
      {delta.text}
    </span>
  );
};

/** Six months as a line that draws itself once. */
export const Spark: React.FC<{ values: number[]; color: string }> = ({ values, color }) => {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i * 96) / (values.length - 1)).toFixed(1)},${(28 - ((v - lo) / span) * 24).toFixed(1)}`).join(' ');
  return (
    <svg width="96" height="32" viewBox="0 0 96 32" aria-hidden className="shrink-0">
      <polyline points={pts} pathLength={100} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="rp-line" style={{ ['--rp-len' as any]: 100 }} />
    </svg>
  );
};

/** A small figure box: label, number, one line under it. */
export const Stat: React.FC<{ label: string; value: number | null; format: 'inr' | 'pct' | 'days' | 'count'; line?: React.ReactNode; tone?: 'ok' | 'bad' | 'warn'; delay?: number; suffix?: string }> = ({
  label, value, format, line, tone, delay = 0, suffix,
}) => (
  <div className="hud-row-in rounded-xl border border-slate-200 p-4 min-w-0" style={{ animationDelay: `${delay}ms` }}>
    <Eyebrow>{label}</Eyebrow>
    <div className="mt-2.5">
      <Figure value={value} format={format} className="text-2xl"
        color={tone === 'ok' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-800'} />
      {suffix && value != null && <span className="text-sm font-bold text-slate-500 ml-1">{suffix}</span>}
    </div>
    {line && <div className="text-xs text-slate-500 mt-1.5">{line}</div>}
  </div>
);

/** Columns by month. Stacked when given more than one series. */
export const Columns: React.FC<{
  months: { key: string; label: string; bold?: boolean; parts: { value: number; color: string }[] }[];
  height?: number;
  line?: { value: number; label: string };
  format?: (v: number) => string;
  delay?: number;
  grouped?: boolean;
}> = ({ months, height = 150, line, format, delay = 0, grouped = false }) => {
  const max = Math.max(1, line?.value || 0, ...months.map((m) => grouped ? Math.max(0, ...m.parts.map((p) => p.value)) : m.parts.reduce((s, p) => s + p.value, 0))) * 1.08;
  const px = (v: number) => Math.max(v > 0 ? 3 : 0, (v / max) * height);
  return (
    <div className="rp-chart">
      <div className="relative flex gap-3 items-stretch" style={{ height }}>
        {/* The line is named in the panel's legend: a label on it sat over the tallest bar. */}
        {line && line.value > 0 && (
          <div className="absolute left-0 right-0 border-t-[1.5px] border-dashed border-slate-400 pointer-events-none" style={{ bottom: px(line.value) }} title={line.label} />
        )}
        {months.map((m, i) => (
          <div key={m.key} className="rp-col flex-1 min-w-0 flex items-end justify-center gap-1" title={`${m.label}: ${m.parts.map((p) => format ? format(p.value) : p.value).join(' · ')}`}>
            {grouped
              ? m.parts.map((p, j) => (
                <div key={j} className="rp-bar rounded-t-md w-full max-w-[22px]" style={{ height: px(p.value), background: p.color, animationDelay: `${delay + i * 60 + j * 30}ms` }} />
              ))
              : (
                <div className="flex flex-col-reverse w-full max-w-[40px]">
                  {m.parts.map((p, j) => (
                    <div key={j} className={`rp-bar w-full ${j === m.parts.length - 1 ? 'rounded-t-md' : ''}`} style={{ height: px(p.value), background: p.color, animationDelay: `${delay + i * 60 + j * 30}ms` }} />
                  ))}
                </div>
              )}
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-slate-100 flex gap-3">
        {months.map((m) => (
          <span key={m.key} className={`flex-1 min-w-0 text-center text-[11px] truncate ${m.bold ? 'font-bold text-slate-700' : 'text-slate-500'}`}>{m.label}</span>
        ))}
      </div>
    </div>
  );
};

/** A row that names one thing and offers one button. */
export const ActionRow: React.FC<{ tone: Tone; title: React.ReactNode; detail?: React.ReactNode; chip?: React.ReactNode; button?: React.ReactNode; delay?: number; last?: boolean }> = ({
  tone, title, detail, chip, button, delay = 0, last,
}) => (
  <div className={`hud-row-in flex items-center gap-3 py-3 ${last ? '' : 'border-b border-slate-100'}`} style={{ animationDelay: `${delay}ms` }}>
    {tone === 'none' ? <span className="hud-dot text-slate-400" /> : <Dot tone={tone} live={tone === 'bad'} />}
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      {detail && <div className="text-xs text-slate-500">{detail}</div>}
    </div>
    {chip}
    {button}
  </div>
);

export const SmallButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', ...rest }) => (
  <button type="button" className={`px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 whitespace-nowrap disabled:opacity-50 ${className}`} {...rest} />
);

/** What a panel shows when there is nothing to show yet, and what would change that. */
export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-xs text-slate-500">{children}</div>
);
