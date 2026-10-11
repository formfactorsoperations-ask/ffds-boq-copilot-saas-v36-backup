import React, { useEffect, useMemo, useRef, useState } from 'react';

/*
  MOTION FOR DESIGN DESK.

  Small pieces that make the desk feel alive without getting in the way:
  numbers that count to their value, bars that fill, cards that lean toward
  the pointer with a soft spotlight, sections that fold open and shut, and a
  burst of confetti when something is signed off. All of it is CSS or a few
  animation frames (a framer exit inside a tab stalls the app's tab
  transitions), and all of it stands still for people who ask for less
  motion.
*/

export const calm = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A number that counts to its new value instead of jumping. */
export function CountUp({ value, ms = 750, className, style }: { value: number; ms?: number; className?: string; style?: React.CSSProperties }) {
  const [shown, setShown] = useState(() => (calm() ? value : 0));
  const at = useRef(shown);
  useEffect(() => {
    if (calm() || typeof requestAnimationFrame === 'undefined') { at.current = value; setShown(value); return; }
    const from = at.current;
    if (from === value) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3)));
      at.current = v; setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return (
    <span className={className} style={style}>
      <span aria-hidden>{shown}</span><span className="sr-only">{value}</span>
    </span>
  );
}

/** A progress bar that fills from empty, with a light sweeping across what is done. */
export function Bar({ pct, color, track = '#EEEEEA', height = 6, shine = false }: { pct: number; color: string; track?: string; height?: number; shine?: boolean }) {
  const [w, setW] = useState(() => (calm() ? pct : 0));
  useEffect(() => {
    if (calm() || typeof requestAnimationFrame === 'undefined') { setW(pct); return; }
    const r = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(r);
  }, [pct]);
  return (
    <span className="relative block overflow-hidden rounded-full" style={{ height, background: track }}>
      <i className="dd-bar block h-full rounded-full" style={{ width: `${w}%`, background: color }} />
      {shine && w > 0 && <i className="dd-shine" style={{ width: `${w}%` }} aria-hidden />}
    </span>
  );
}

/** A card that leans toward the pointer, lifted, with a spotlight that follows it. Mouse only. */
export function Tilt({ children, className = '', style, max = 7, glow = 'rgba(65,70,200,0.10)' }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties; max?: number; glow?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse' || calm()) return;
    const b = el.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width;
    const y = (e.clientY - b.top) / b.height;
    el.style.setProperty('--rx', `${((0.5 - y) * max).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((x - 0.5) * max).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
    el.dataset.tilt = 'on';
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
    delete el.dataset.tilt;
  };
  return (
    <div ref={ref} className={`dd-tilt ${className}`} style={{ ...style, ['--glow' as any]: glow }} onPointerMove={move} onPointerLeave={leave}>
      {children}
      <span className="dd-spot" aria-hidden />
    </div>
  );
}

/** Opens and shuts its contents smoothly; when shut they leave the page, as before. */
export function Fold({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [wide, setWide] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      if (calm() || typeof requestAnimationFrame === 'undefined') { setWide(true); return; }
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setWide(true)); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    }
    setWide(false);
    const t = setTimeout(() => setMounted(false), calm() ? 0 : 360);
    return () => clearTimeout(t);
  }, [open]);
  if (!mounted) return null;
  return (
    <div className="dd-fold" data-open={wide ? '' : undefined} inert={!open || undefined}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

const BURST = ['#4146C8', '#7091E6', '#3FBF94', '#E5A50A', '#C77A1A', '#E5484D'];

/** Confetti from one point, once. Place it inside a positioned element. */
export function Burst({ x = 0, y = 0, count = 16, spread = 56 }: { x?: number; y?: number; count?: number; spread?: number }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => ({
    a: (i / count) * 360 + Math.random() * 18,
    d: spread * (0.6 + Math.random() * 0.6),
    s: 4 + Math.random() * 4,
    round: Math.random() > 0.5,
    c: BURST[i % BURST.length],
    delay: Math.random() * 60,
  })), [count, spread]);
  if (calm()) return null;
  return (
    <span className="pointer-events-none absolute" style={{ left: x, top: y }} aria-hidden>
      {bits.map((b, i) => (
        <i key={i} className="dd-bit" style={{
          ['--a' as any]: `${b.a}deg`, ['--d' as any]: `${b.d}px`, width: b.s, height: b.round ? b.s : b.s * 1.8,
          borderRadius: b.round ? 99 : 1, background: b.c, animationDelay: `${b.delay}ms`,
        }} />
      ))}
    </span>
  );
}

/** A tick that draws itself, with a ring that ripples out. */
export function DrawnCheck({ size = 52, color = '#1B6E4F', soft = '#E3F2EA' }: { size?: number; color?: string; soft?: string }) {
  return (
    <span className="relative grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: soft, color }} aria-hidden>
      <span className="dd-ripple absolute inset-0 rounded-full" style={{ borderColor: color }} />
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path className="dd-draw" d="M4 12.5l5 5L20 6.5" pathLength={1} />
      </svg>
    </span>
  );
}

/** The motion styles. Rendered once with the desk. */
export const MotionStyles = () => (
  <style>{`
    .dd-bar { transition: width .9s cubic-bezier(.2,.8,.2,1) }
    .dd-shine { position: absolute; left: 0; top: 0; bottom: 0; overflow: hidden; border-radius: inherit; transition: width .9s cubic-bezier(.2,.8,.2,1) }
    .dd-shine::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 45%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.65), transparent); transform: translateX(-120%); animation: ddShine 3.2s ease-in-out 1.1s infinite }
    @keyframes ddShine { 0% { transform: translateX(-120%) } 55%, 100% { transform: translateX(260%) } }

    .dd-tilt { position: relative; border-radius: 18px; transform: perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateY(var(--lift, 0px)); transition: transform .5s cubic-bezier(.2,.8,.2,1), box-shadow .35s ease; will-change: transform }
    .dd-tilt[data-tilt] { --lift: -3px; transition: transform .1s linear, box-shadow .35s ease; box-shadow: 0 22px 40px -24px rgba(23,25,30,.45) }
    .dd-spot { pointer-events: none; position: absolute; inset: 0; border-radius: inherit; opacity: 0; transition: opacity .35s ease;
      background: radial-gradient(420px circle at var(--gx, 50%) var(--gy, 50%), var(--glow), transparent 42%) }
    .dd-tilt[data-tilt] .dd-spot { opacity: 1 }

    .dd-fold { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .36s cubic-bezier(.2,.8,.2,1), opacity .28s ease }
    .dd-fold[data-open] { grid-template-rows: 1fr; opacity: 1 }

    .dd-bit { position: absolute; left: 0; top: 0; opacity: 0; animation: ddBit .95s cubic-bezier(.12,.7,.3,1) both }
    @keyframes ddBit { 0% { opacity: 1; transform: rotate(var(--a)) translateX(0) rotate(0) } 70% { opacity: 1 } 100% { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) translateY(14px) rotate(220deg) } }

    .dd-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: ddDraw .55s cubic-bezier(.6,0,.2,1) .2s forwards }
    @keyframes ddDraw { to { stroke-dashoffset: 0 } }
    .dd-ripple { border: 2px solid; opacity: 0; animation: ddRipple 1.6s ease-out .5s 2 }
    @keyframes ddRipple { 0% { transform: scale(1); opacity: .5 } 100% { transform: scale(1.7); opacity: 0 } }

    .dd-cta { position: relative; overflow: hidden; isolation: isolate }
    .dd-cta::before { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.28) 50%, transparent 70%); transform: translateX(-110%); transition: transform .7s cubic-bezier(.2,.8,.2,1) }
    .dd-cta:hover::before { transform: translateX(110%) }
    .dd-cta .dd-arrow { transition: transform .25s cubic-bezier(.2,.8,.2,1) }
    .dd-cta:hover .dd-arrow { transform: translateX(3px) }
    .dd-glow { animation: ddGlow 2.4s ease-in-out infinite }
    @keyframes ddGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(65,70,200,.0), 0 8px 20px -10px rgba(65,70,200,.6) } 50% { box-shadow: 0 0 0 6px rgba(65,70,200,.12), 0 10px 24px -10px rgba(65,70,200,.7) } }

    .dd-grow { transform-origin: left; animation: ddGrow .8s cubic-bezier(.2,.8,.2,1) both }
    @keyframes ddGrow { from { transform: scaleX(0) } to { transform: none } }
    .dd-swap { animation: ddSwap .45s cubic-bezier(.2,.9,.25,1.1) both }
    @keyframes ddSwap { from { opacity: 0; transform: translateY(6px) scale(.98); filter: blur(3px) } to { opacity: 1; transform: none; filter: none } }
    .dd-spin-in { animation: ddSpinIn .55s cubic-bezier(.2,.9,.25,1.2) both }
    @keyframes ddSpinIn { from { opacity: 0; transform: rotate(-90deg) scale(.6) } to { opacity: 1; transform: none } }
    .dd-thumb { transition: transform .3s cubic-bezier(.2,.8,.2,1), box-shadow .3s ease }
    .group:hover .dd-thumb { transform: translateY(-2px) rotate(-1.5deg) scale(1.03); box-shadow: 0 10px 18px -10px rgba(23,25,30,.45) }
    .dd-nudge { transition: transform .25s cubic-bezier(.2,.8,.2,1) }
    .group:hover .dd-nudge { transform: translateX(3px) }
    .dd-march { background-image: linear-gradient(90deg, currentColor 50%, transparent 0), linear-gradient(90deg, currentColor 50%, transparent 0), linear-gradient(0deg, currentColor 50%, transparent 0), linear-gradient(0deg, currentColor 50%, transparent 0);
      background-repeat: repeat-x, repeat-x, repeat-y, repeat-y; background-size: 16px 2.5px, 16px 2.5px, 2.5px 16px, 2.5px 16px; background-position: 0 0, 0 100%, 0 0, 100% 0; animation: ddMarch .8s linear infinite }
    .dd-breathe.dd-march { animation: ddBreathe 2.2s ease-in-out infinite, ddMarch .8s linear infinite }
    .dd-pop.dd-glow { animation: ddPop .28s cubic-bezier(.2,1.2,.4,1) both, ddGlow 2.4s ease-in-out .3s infinite }
    @keyframes ddMarch { to { background-position: 16px 0, -16px 100%, 0 -16px, 100% 16px } }

    @media (prefers-reduced-motion: reduce) {
      .dd-bar, .dd-shine, .dd-tilt, .dd-fold, .dd-thumb, .dd-nudge { transition: none }
      .dd-shine::after, .dd-bit, .dd-ripple, .dd-glow, .dd-grow, .dd-swap, .dd-spin-in, .dd-march { animation: none }
      .dd-draw { animation: none; stroke-dashoffset: 0 }
      .dd-tilt[data-tilt] { --lift: 0px }
    }
  `}</style>
);
