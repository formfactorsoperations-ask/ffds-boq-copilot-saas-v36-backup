/*
  The instrument-panel pieces, shared.

  Extracted when the studio settings screen needed the same readiness dial the
  platform console uses. Each of these carries a fix that was expensive to find
  -- the count-up alone has three -- and a second copy would have been a second
  place for them to rot.
*/

import React, { useState, useEffect } from 'react';

export const CountUp: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  /*
    Seeded at zero, not at the value: the panels these sit in mount fresh every
    time the tab is opened, so seeding from the value meant the first render
    had nothing to travel and the figure simply appeared. Counting up from
    nothing on arrival is the whole point of the component.
  */
  const [shown, setShown] = useState(0);
  /*
    Holds what is on screen, not what we are heading for. StrictMode runs every
    effect twice in development; a ref set to the target on the first run left
    the second run with from === value and nothing to animate, so the figure
    snapped straight to its final number. Tracking the displayed value instead
    means a cancelled run leaves the next one exactly where it stopped.
  */
  const shownRef = React.useRef(0);

  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = shownRef.current;
    if (reduce || from === value) { shownRef.current = value; setShown(value); return; }

    /*
      The clock starts on the first frame, not on this line. A tab that has
      been idle can wait most of a second for its next paint, and timing from
      here meant the first callback already read as finished: the figure
      snapped to its value and no one ever saw it move. Measured at 907ms
      between scheduling and the first frame on an idle pane.
    */
    let start = 0;
    const dur = 520;
    let raf = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / dur);
      // ease-out: fast first, settles precisely on the number
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{shown}</span>;
};

/*
  A dial for one ratio, drawn once.

  Used where a proportion matters more than a count — how much of the platform
  answered, how full a document is against its limit. The arc length is handed
  to CSS as a variable so the draw-on animation has something to animate from.
*/
export const Gauge: React.FC<{ pct: number; label: string; sub?: string; tone?: 'ok' | 'warn' | 'bad' }> =
  ({ pct, label, sub, tone = 'ok' }) => {
    const clamped = Math.max(0, Math.min(100, pct));
    const r = 46;
    const circumference = 2 * Math.PI * r;
    const dash = (clamped / 100) * circumference;
    const colour = tone === 'bad' ? '#e11d48' : tone === 'warn' ? '#d97706' : '#0066CC';
    return (
      <div className="flex items-center gap-4">
        <svg width="112" height="112" viewBox="0 0 112 112" className="shrink-0 -rotate-90">
          <circle cx="56" cy="56" r={r} fill="none" stroke="#e2e8f0" strokeWidth="9" />
          <circle
            cx="56" cy="56" r={r} fill="none" stroke={colour} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            className="hud-arc"
            style={{ ['--arc-len' as any]: `${circumference}px` }}
          />
        </svg>
        <div>
          <div className="text-3xl font-black text-slate-800 leading-none">
            <CountUp value={Math.round(clamped)} />%
          </div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">{label}</div>
          {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
        </div>
      </div>
    );
  };

export const Dot: React.FC<{ tone: 'ok' | 'warn' | 'bad'; live?: boolean }> = ({ tone, live }) => (
  <span
    className={`hud-dot ${live ? 'hud-dot-live' : ''} ${
      tone === 'bad' ? 'text-rose-500' : tone === 'warn' ? 'text-amber-500' : 'text-emerald-500'
    }`}
  />
);
