/**
 * Small shared pieces for Project Home: one stroke icon set, the animated ring
 * and donut, count-up numbers, and the tooltip / toast the page uses.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

/* ── icons (24px grid, 2px stroke, one family) ────────────────────────── */
const P = (d: React.ReactNode, size = 15, stroke = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const Icon = {
  doc: (s?: number) => P(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>, s),
  money: (s?: number) => P(<path d="M6 3h12M6 8h12M16 3c0 5-4 5-7 5l7 8" />, s),
  grid: (s?: number) => P(<><path d="M3 3h18v18H3z" /><path d="M3 9h18M9 21V9" /></>, s),
  check: (s?: number) => P(<path d="M5 12l5 5L20 7" />, s, 2.6),
  checkBox: (s?: number) => P(<><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></>, s),
  info: (s?: number) => P(<><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>, s),
  alert: (s?: number) => P(<><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>, s),
  spark: (s?: number) => P(<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />, s),
  plus: (s?: number) => P(<path d="M12 5v14M5 12h14" />, s),
  pin: (s?: number) => P(<><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>, s),
  people: (s?: number) => P(<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5a3 3 0 0 1 0 6" /></>, s),
  video: (s?: number) => P(<><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l6-3v10l-6-3" /></>, s),
  bars: (s?: number) => P(<path d="M3 6h10M3 12h16M3 18h7" />, s),
  pie: (s?: number) => P(<path d="M21 12A9 9 0 1 1 12 3v9z" />, s),
  pulse: (s?: number) => P(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />, s),
  calendar: (s?: number) => P(<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>, s),
  chev: (s?: number) => P(<path d="M6 9l6 6 6-6" />, s, 2.4),
  right: (s?: number) => P(<path d="M9 6l6 6-6 6" />, s, 2.4),
  link: (s?: number) => P(<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>, s),
  copy: (s?: number) => P(<><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>, s),
  chat: (s?: number) => P(<path d="M4 4h16v12H8l-4 4z" />, s),
  lock: (s?: number) => P(<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>, s),
  building: (s?: number) => P(<path d="M3 21h18M6 21V9l6-4 6 4v12" />, s),
  key: (s?: number) => P(<><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2L20 3M16 7l3 3" /></>, s),
  flag: (s?: number) => P(<><path d="M5 22V4" /><path d="M5 5h13l-2.5 4L18 13H5z" /></>, s),
  arrow: (s?: number) => P(<path d="M5 12h14M13 6l6 6-6 6" />, s),
  more: (s?: number) => P(<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>, s, 2.4),
  refresh: (s?: number) => P(<><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>, s),
};

/*
  ── the page's own icons ─────────────────────────────────────────────────
  1.6px line with a faint tinted fill (`.d`). Every outline carries
  pathLength="1", so one dash animation in projectHome.css draws any shape
  as it appears and redraws it on hover. Static, trusted markup only.
*/
const RAW_GLYPHS = {
  agreement: '<path class="d" d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M7.5 16.5c1.2-1.7 2.1-1.7 2.5-.3.3 1 1.1.9 1.8-.1.5-.8 1.1-.8 1.6.1"/><path d="M15.5 16.5h1.5"/>',
  invoice: '<path class="d" d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>',
  plan: '<path class="d" d="M11 12h9v7h-9z"/><rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 12h4M11 12h9M11 12v7M15 5v4"/>',
  records: '<circle class="d" cx="15" cy="15" r="4"/><path d="M4 6h11M4 10h7M4 14h4M4 18h4"/><circle cx="15" cy="15" r="4"/><path d="M18 18l3 3"/>',
  talk: '<path class="d" d="M4 4h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M4 4h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M19 8h1a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1v3l-4-3h-3a1 1 0 0 1-1-1v-1"/>',
  people: '<circle class="d" cx="9" cy="8" r="3.5"/><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.3c1.8.8 3 2.6 3 4.7"/>',
  video: '<rect class="d" x="3" y="6" width="12" height="12" rx="2"/><rect x="3" y="6" width="12" height="12" rx="2"/><path d="M15 10.5l6-3.5v10l-6-3.5"/>',
  hardhat: '<path class="d" d="M5 16a7 7 0 0 1 14 0z"/><path d="M3 16h18v2.5H3z"/><path d="M5 16a7 7 0 0 1 14 0"/><path d="M10 9.4V6.5h4v2.9"/><path d="M8.5 16v-3M15.5 16v-3"/>',
  decision: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M8.5 12.3l2.3 2.3 4.7-5"/>',
  flag: '<path class="d" d="M5 4h13l-2.5 4.5L18 13H5z"/><path d="M5 21V4h13l-2.5 4.5L18 13H5"/>',
  rupee: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M8.5 7.5h7M8.5 10.5h7M12 7.5c2.2 0 2.2 5.5-3.5 5.5l5 4.5"/>',
  key: '<circle class="d" cx="8" cy="15" r="4.5"/><circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8L20 3M16.5 6.5l2.5 2.5M14.5 8.5l2 2"/>',
  portal: '<rect class="d" x="3" y="4" width="18" height="12" rx="2"/><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M9 10.3l2 2 4-4"/>',
  home: '<path class="d" d="M5 10.5 12 5l7 5.5V20H5z"/><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  hourglass: '<path class="d" d="M8 18.5c0-2 4-3 4-3s4 1 4 3z"/><path d="M6 3h12M6 21h12"/><path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
  calnext: '<path class="d" d="M3 5h18v4H3z"/><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2.5v3M16 2.5v3M10 15h5M13 12.5l2.5 2.5-2.5 2.5"/>',
  pencil: '<path class="d" d="M4 20l1-4L15.5 5.5l3 3L8 19z"/><path d="M4 20l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M13.5 7.5l3 3"/>',
  building: '<path class="d" d="M5 21V9l7-4 7 4v12z"/><path d="M3 21h18"/><path d="M5 21V9l7-4 7 4v12"/><path d="M9.5 21v-5h5v5"/>',
  lock: '<rect class="d" x="4" y="10" width="16" height="11" rx="2"/><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/>',
  alert: '<path class="d" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  realign: '<circle class="d" cx="12" cy="12" r="9"/><path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5"/><path d="M20 3.5v5h-5"/>',
  advance: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M8 12h8M13 8.5l3.5 3.5-3.5 3.5"/>',
  pause: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
  swatch: '<rect class="d" x="3" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M13 17h8M17 13v8"/>',
};
export type GlyphName = keyof typeof RAW_GLYPHS;
const GLYPHS = Object.fromEntries(Object.entries(RAW_GLYPHS).map(([k, v]) =>
  [k, v.replace(/<(path|circle|rect)(?![^>]*class="d")/g, '<$1 pathLength="1"')])) as Record<GlyphName, string>;

export function Glyph({ name, size }: { name: GlyphName; size?: number }) {
  return (
    <svg className="ph-gly" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: GLYPHS[name] }} />
  );
}

/* ── tooltip + toast, shared through context ──────────────────────────── */
interface Ui {
  tip: (e: React.MouseEvent | null, content?: React.ReactNode) => void;
  say: (msg: string) => void;
}
const UiCtx = createContext<Ui>({ tip: () => {}, say: () => {} });
export const useUi = () => useContext(UiCtx);

/** Props that attach a tooltip to any element. */
export function tipProps(ui: Ui, content: React.ReactNode) {
  return {
    onMouseEnter: (e: React.MouseEvent) => ui.tip(e, content),
    onMouseMove: (e: React.MouseEvent) => ui.tip(e, content),
    onMouseLeave: () => ui.tip(null),
  };
}

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [tip, setTip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const ui: Ui = {
    tip: (e, content) => {
      if (!e || !content) { setTip(null); return; }
      setTip({ x: Math.min(e.clientX + 14, window.innerWidth - 280), y: e.clientY + 16, content });
    },
    say: (msg) => {
      setToast(msg);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(null), 2200);
    },
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <UiCtx.Provider value={ui}>
      {children}
      {tip && <div className="ph-tip" style={{ left: tip.x, top: tip.y }}>{tip.content}</div>}
      <div className={`ph-toast${toast ? ' show' : ''}`} role="status" aria-live="polite">{toast}</div>
    </UiCtx.Provider>
  );
}

/* ── motion helpers ───────────────────────────────────────────────────── */
const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A number that eases up to `to` once `run` turns true. */
export function useCountUp(to: number, run = true, dur = 1000): number {
  const [v, setV] = useState(reduced() ? to : 0);
  useEffect(() => {
    if (!run) return;
    if (reduced()) { setV(to); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, run, dur]);
  return v;
}

/** True one frame after mount — lets CSS transitions run from their start state. */
export function useArmed(delay = 60): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setOn(true), delay); return () => window.clearTimeout(t); }, [delay]);
  return on;
}

export function Ring({ pct, colour, label }: { pct: number; colour: string; label: string }) {
  const armed = useArmed(420);
  const C = 2 * Math.PI * 17;
  const off = armed ? C * (1 - Math.max(0, Math.min(100, pct)) / 100) : C;
  return (
    <div className="ph-ring">
      <svg viewBox="0 0 42 42" width="42" height="42">
        <circle className="tr" cx="21" cy="21" r="17" />
        <circle className="fg" cx="21" cy="21" r="17" stroke={colour} strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <span>{label}</span>
    </div>
  );
}

export interface DonutPart { value: number; colour: string; label: string }

/**
 * An animated donut. Hovering a slice dims the rest and hands the slice index
 * to `onHover` so the caller can change the centre label.
 */
export function Donut({ parts, size, radius, width, play, onHover, children, className = '' }: {
  parts: DonutPart[]; size: number; radius: number; width: number; play: boolean;
  onHover?: (i: number) => void; children?: React.ReactNode; className?: string;
}) {
  const [hl, setHl] = useState(-1);
  const C = 2 * Math.PI * radius;
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  const gap = parts.filter(p => p.value > 0).length > 1 ? 2 : 0;
  let acc = 0;
  const cx = size / 2;
  return (
    <div className={`ph-donut ${className}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={cx} cy={cx} r={radius} stroke="#EEF0F6" strokeWidth={width} />
        {parts.map((p, i) => {
          const len = Math.max(0, (p.value / total) * C - gap);
          const start = acc;
          acc += (p.value / total) * C;
          if (p.value <= 0) return null;
          return (
            <circle key={i} cx={cx} cy={cx} r={radius} stroke={p.colour} strokeWidth={width}
              strokeDasharray={`${len} ${C}`} strokeDashoffset={play ? -start : C}
              style={{ transitionDelay: `${i * 0.11}s`, opacity: hl < 0 || hl === i ? 1 : 0.25, cursor: onHover ? 'pointer' : 'default' }}
              onMouseEnter={() => { setHl(i); onHover?.(i); }}
              onMouseLeave={() => { setHl(-1); onHover?.(-1); }} />
          );
        })}
      </svg>
      <div className="ctr">{children}</div>
    </div>
  );
}
