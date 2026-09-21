import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * HUD INSTRUMENTS.
 *
 * Dials, concentric rings and segmented donuts for the two analytics screens.
 *
 * The brief was "Jarvis" without leaving the app's own skin, so the instrument
 * character is carried entirely by GEOMETRY -- ticked bezels, hairline guide
 * circles, arcs that sweep once into place, corner brackets on the housing --
 * and never by colour or typeface. Everything here renders in the studio's
 * Jakarta Sans and the app's indigo. Specifically: nothing wears `.font-mono`,
 * however much a readout wants it, because index.html exempts that class from
 * the studio's font setting and it would silently opt these numbers out of the
 * typeface the user chose. `tabular-nums` gives the aligned-digit read instead.
 *
 * Each instrument animates once on mount and then holds still. A dial that
 * keeps sweeping is a screensaver.
 */

const INK = "#0A1B33";

/** Flips true one frame after mount, so a CSS transition has a start state. */
function useSwept(): boolean {
  const [swept, setSwept] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSwept(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return swept;
}

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

/** An arc path from `startDeg` sweeping `sweepDeg` degrees clockwise. */
const arcPath = (cx: number, cy: number, r: number, startDeg: number, sweepDeg: number) => {
  const clamped = Math.max(0.001, Math.min(359.999, sweepDeg));
  const a = polar(cx, cy, r, startDeg);
  const b = polar(cx, cy, r, startDeg + clamped);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${clamped > 180 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

/* ────────────────────────────────────────────────────────────────────────
   DIAL — one ratio, read at a glance
   ──────────────────────────────────────────────────────────────────────── */

export const HudDial: React.FC<{
  /** The value to display, in the same unit as `max`. */
  value: number;
  max?: number;
  /** Rendered in the middle. Defaults to a whole-number percentage. */
  readout?: string;
  label: string;
  sub?: string;
  color?: string;
  size?: number;
  /** A second, fainter arc behind the value — e.g. what was quoted. */
  ghost?: { value: number; label: string };
}> = ({ value, max = 100, readout, label, sub, color = "#3D52A0", size = 148, ghost }) => {
  const swept = useSwept();
  const cx = 60, cy = 60, r = 44;
  const SWEEP = 260;            // leaves a gap at the bottom for the readout
  const START = 180 - (SWEEP - 180) / 2;

  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const ghostFrac = ghost && max > 0 ? Math.max(0, Math.min(1, ghost.value / max)) : 0;

  const circ = (2 * Math.PI * r * SWEEP) / 360;
  const track = arcPath(cx, cy, r, START, SWEEP);

  /* 27 ticks around the bezel, every third one long. Purely an instrument
     cue -- they carry no reading of their own, so they stay very light. */
  const ticks = useMemo(
    () =>
      Array.from({ length: 27 }, (_, i) => {
        const deg = START + (SWEEP / 26) * i;
        const major = i % 3 === 0;
        const outer = polar(cx, cy, r + 9, deg);
        const inner = polar(cx, cy, r + (major ? 4 : 6), deg);
        return { ...outer, x2: inner.x, y2: inner.y, major };
      }),
    [START]
  );

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
          <g className="rp-bezel">
            {ticks.map((t, i) => (
              <line
                key={i}
                x1={t.x} y1={t.y} x2={t.x2} y2={t.y2}
                stroke={t.major ? "#C3CBDD" : "#E2E8F0"}
                strokeWidth={t.major ? 1.4 : 1}
                strokeLinecap="round"
              />
            ))}
          </g>

          <path d={track} fill="none" stroke="#EEF1F7" strokeWidth={9} strokeLinecap="round" />

          {ghost && (
            <path
              d={track}
              fill="none"
              stroke={color}
              strokeOpacity={0.22}
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - ghostFrac)}
            />
          )}

          <path
            className="rp-hud-arc"
            d={track}
            fill="none"
            stroke={color}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={swept ? circ * (1 - frac) : circ}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="text-[24px] font-semibold leading-none tabular-nums"
            style={{ color: INK }}
          >
            {readout ?? `${Math.round(value)}%`}
          </span>
          {sub && <span className="mt-1 text-[10px] text-slate-400 text-center px-4">{sub}</span>}
        </div>
      </div>

      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 text-center">
        {label}
      </p>
      {ghost && (
        <p className="mt-1 text-[11px] text-slate-500 text-center">
          <span
            className="inline-block w-2 h-2 rounded-full align-middle mr-1.5"
            style={{ background: color, opacity: 0.32 }}
          />
          {ghost.label}
        </p>
      )}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
   RINGS — a composition, one arc per part
   ──────────────────────────────────────────────────────────────────────── */

export interface RingPart {
  label: string;
  /** Share of the whole, 0–100. */
  pct: number;
  value?: string;
  color: string;
}

/**
 * Concentric arcs rather than a pie. Each part gets its own radius and its own
 * baseline, so shares are compared against a common start angle instead of
 * against wedge areas, which people read badly.
 */
export const HudRings: React.FC<{ parts: RingPart[]; size?: number; centre?: React.ReactNode }> = ({
  parts, size = 168, centre,
}) => {
  const swept = useSwept();
  const cx = 60, cy = 60;
  const SWEEP = 300;
  const START = 180 - (SWEEP - 180) / 2;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
          {parts.map((p, i) => {
            const r = 48 - i * 12;
            const circ = (2 * Math.PI * r * SWEEP) / 360;
            const d = arcPath(cx, cy, r, START, SWEEP);
            const frac = Math.max(0, Math.min(1, p.pct / 100));
            return (
              <g key={p.label}>
                <path d={d} fill="none" stroke="#EEF1F7" strokeWidth={7} strokeLinecap="round" />
                <path
                  className="rp-hud-arc"
                  d={d}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={7}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={swept ? circ * (1 - frac) : circ}
                  style={{ transitionDelay: `${i * 110}ms` }}
                />
              </g>
            );
          })}
        </svg>
        {centre && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {centre}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-baseline gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-[12px] text-slate-600 truncate flex-1 min-w-0">{p.label}</span>
            <span className="text-[12px] font-semibold tabular-nums shrink-0" style={{ color: INK }}>
              {p.pct.toFixed(p.pct >= 10 ? 0 : 1)}%
            </span>
            {p.value && (
              <span className="text-[11px] tabular-nums text-slate-400 shrink-0 w-[68px] text-right">
                {p.value}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
   DONUT — shares of one total, where the total is the point
   ──────────────────────────────────────────────────────────────────────── */

export const HudDonut: React.FC<{
  parts: { label: string; value: number; color: string }[];
  size?: number;
  centre?: React.ReactNode;
  /** Draws a hairline at this share, e.g. a concentration threshold. */
  markAt?: number;
}> = ({ parts, size = 168, centre, markAt }) => {
  const swept = useSwept();
  const cx = 60, cy = 60, r = 43;
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const circ = 2 * Math.PI * r;

  let acc = 0;
  const segs = parts.map((p) => {
    const start = (acc / total) * 360;
    const sweep = (p.value / total) * 360;
    acc += p.value;
    /* A hair of space between segments, so neighbouring colours never touch
       and read as one block. */
    return { ...p, d: arcPath(cx, cy, r, start, Math.max(0.5, sweep - 1.6)), share: (p.value / total) * 100 };
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EEF1F7" strokeWidth={10} />
        <circle cx={cx} cy={cy} r={r - 9.5} fill="none" stroke="#F1F5F9" strokeWidth={0.8} />

        {segs.map((sg, i) => (
          <path
            key={sg.label + i}
            className="rp-hud-arc"
            d={sg.d}
            fill="none"
            stroke={sg.color}
            strokeWidth={10}
            strokeLinecap="butt"
            strokeDasharray={circ}
            strokeDashoffset={swept ? 0 : circ}
            style={{ transitionDelay: `${i * 90}ms` }}
          />
        ))}

        {markAt != null && (
          <line
            {...(() => {
              const a = polar(cx, cy, r - 7, (markAt / 100) * 360);
              const b = polar(cx, cy, r + 7, (markAt / 100) * 360);
              return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
            })()}
            stroke={INK}
            strokeWidth={1.4}
            strokeDasharray="2 2"
          />
        )}
      </svg>
      {centre && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {centre}
        </div>
      )}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
   TRACE — a series drawn as a line, with the last point called out
   ──────────────────────────────────────────────────────────────────────── */

export const HudTrace: React.FC<{
  points: { label: string; value: number }[];
  color?: string;
  height?: number;
  format?: (v: number) => string;
}> = ({ points, color = "#3D52A0", height = 96, format }) => {
  const ref = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (ref.current) {
      try { setLen(ref.current.getTotalLength()); } catch { /* jsdom / older engines */ }
    }
  }, [points]);

  if (points.length < 2) {
    return (
      <div style={{ height }} className="flex items-center text-[12px] text-slate-400">
        Not enough months to draw a trend yet.
      </div>
    );
  }

  const W = 300, H = 100, PAD = 8;
  const max = points.reduce((m, p) => Math.max(m, p.value), 0) || 1;
  const xs = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const ys = (v: number) => H - PAD - (v / max) * (H - PAD * 2);

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(1)} ${ys(p.value).toFixed(1)}`).join(" ");
  const area = `${d} L ${xs(points.length - 1).toFixed(1)} ${H - PAD} L ${xs(0).toFixed(1)} ${H - PAD} Z`;
  const last = points[points.length - 1];

  /*
    Nearest point to the cursor, in viewBox space.

    The SVG is drawn with preserveAspectRatio="none", so it stretches to the
    container independently in x and y. Working in fractions of the container
    and converting to the viewBox keeps the maths correct at any width, and
    lets the marker be drawn in viewBox units with no pixel conversion at all.
  */
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const step = (W - PAD * 2) / (points.length - 1);
    const i = Math.round((vx - PAD) / step);
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  const shown = hover != null ? points[hover] : null;
  const fmt = (v: number) => (format ? format(v) : Math.round(v).toLocaleString("en-IN"));

  return (
    <div>
      <div
        className="relative"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="rp-trace-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1={PAD} x2={W - PAD} y1={PAD + g * (H - PAD * 2)} y2={PAD + g * (H - PAD * 2)} className="rp-grid" />
          ))}

          <path d={area} fill="url(#rp-trace-fill)" />
          <path
            ref={ref}
            className="rp-line"
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ ["--rp-len" as any]: len }}
          />

          {/* The resting endpoint, hidden while a different month is held so
              there is never more than one marked value on the line. */}
          {hover == null && <circle cx={xs(points.length - 1)} cy={ys(last.value)} r={3.2} fill={color} />}

          {hover != null && (
            <g>
              <line
                x1={xs(hover)} x2={xs(hover)} y1={PAD} y2={H - PAD}
                stroke={color} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={xs(hover)} cy={ys(points[hover].value)} r={4}
                fill={color} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
        </svg>

        {shown && (
          <div
            className="absolute pointer-events-none rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-md whitespace-nowrap"
            style={(() => {
              const vy = ys(shown.value);
              /* Above the point normally, below it near the top of the plot --
                 a peak sits at the very top, and "above" would put the chip
                 outside the chart and over the heading. */
              const high = vy < 34;
              return {
                /* Clamped away from the edges so the chip never leaves the
                   panel; the dashed guide still says which month it is. */
                left: `${Math.min(88, Math.max(12, (xs(hover!) / W) * 100))}%`,
                top: `${(vy / H) * 100}%`,
                transform: high ? "translate(-50%, 28%)" : "translate(-50%, -132%)",
              };
            })()}
          >
            <span className="block text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-400">
              {shown.label}
            </span>
            <span className="block text-[12.5px] font-semibold tabular-nums" style={{ color: INK }}>
              {fmt(shown.value)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex justify-between border-t border-slate-100 pt-1.5">
        <span className="text-[10px] text-slate-400">{points[0].label}</span>
        <span className="text-[10px] tabular-nums text-slate-500">
          {shown ? `${shown.label} · ${fmt(shown.value)}` : `${last.label} · ${fmt(last.value)}`}
        </span>
      </div>
    </div>
  );
};
