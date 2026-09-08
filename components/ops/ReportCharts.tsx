import React, { useEffect, useState } from 'react';

/**
 * Charts for the project report, hand-built in SVG.
 *
 * `recharts` is in package.json but is not imported anywhere in the app, so it
 * is an unproven dependency here — and a heavy one. These four shapes are all
 * the report needs, they render deterministically, they inherit the app's own
 * colours, and they add nothing to the bundle. If richer interactive charting
 * is ever wanted, recharts is already installed and waiting.
 */

import { BRAND, GOOD, CAUTION, CRITICAL, NEUTRAL, NEUTRAL_DIM, TRACK, GOLD } from '../../lib/reportPalette';

/* Local aliases keep the drawing code short. The values live in one place so
   this screen and the Health Check & Audit screen cannot drift apart. */
/** True one frame after mount, so bars can animate up from zero rather than
    appearing already at their final value. */
const useCharged = (delay = 60) => {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), delay); return () => clearTimeout(t); }, [delay]);
  return on;
};

const BLUE = BRAND;
const GREEN = GOOD;
const ROSE = CRITICAL;
const AMBER = CAUTION;

/* ── Radial gauge: one number as a proportion of a whole ─────────────────── */
export const Gauge: React.FC<{
  pct: number; label: string; sub?: string; tone?: 'blue' | 'green' | 'rose' | 'amber'; size?: number;
}> = ({ pct, label, sub, tone = 'blue', size = 132 }) => {
  const colour = tone === 'green' ? GREEN : tone === 'rose' ? ROSE : tone === 'amber' ? AMBER : BLUE;
  const r = (size - 18) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const charged = useCharged();
  const offset = charged ? c - (clamped / 100) * c : c;
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth="10" />
          {/* Blurred twin under the arc: the readout glows like an instrument
              rather than sitting flat on the card. */}
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour} strokeWidth="10"
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} opacity={0.3}
            style={{ filter: 'blur(5px)', transition: 'stroke-dashoffset 1.05s cubic-bezier(.22,1,.36,1)' }}
          />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour} strokeWidth="10"
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1.05s cubic-bezier(.22,1,.36,1)' }}
          />
        </svg>
        {charged && <span className="hud-lock" />}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] font-extrabold tabular-nums leading-none text-slate-900">{label}</span>
          {sub && <span className="text-[9.5px] text-slate-400 mt-1 font-medium">{sub}</span>}
        </div>
      </div>
    </div>
  );
};

/* ── Waterfall: contracted, less cost, leaves margin ─────────────────────── */
export const MarginWaterfall: React.FC<{
  contracted: number; cost: number; margin: number; fmt: (n: number) => string;
}> = ({ contracted, cost, margin, fmt }) => {
  const max = Math.max(contracted, 1);
  const costPct = Math.min(100, (cost / max) * 100);
  const marginPct = Math.max(0, 100 - costPct);
  const negative = margin < 0;
  return (
    <div>
      <div className="relative flex h-9 rounded-lg overflow-hidden border border-slate-200 hud-grid">
        <div
          className="hud-charge flex items-center justify-start pl-2.5 text-[10.5px] font-bold text-white"
          style={{ width: `${costPct}%`, background: negative ? ROSE : NEUTRAL }}
        >
          {costPct > 22 && <span className="truncate">Cost {fmt(cost)}</span>}
        </div>
        <div
          className="hud-charge flex items-center justify-end pr-2.5 text-[10.5px] font-bold text-white"
          style={{ width: `${marginPct}%`, background: negative ? ROSE : GREEN, animationDelay: '.1s' }}
        >
          {marginPct > 18 && <span className="truncate">Margin {fmt(margin)}</span>}
        </div>
        <span className="hud-edge" style={{ left: `${costPct}%` }} />
        <span className="hud-scan" />
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-slate-400">
        <span>0</span>
        <span>Contracted {fmt(contracted)}</span>
      </div>
    </div>
  );
};

/* ── Cost spine: four stages, each a share of planned ────────────────────── */
export const CostSpine: React.FC<{
  planned: number; committed: number; billed: number; paid: number; fmt: (n: number) => string;
}> = ({ planned, committed, billed, paid, fmt }) => {
  const max = Math.max(planned, committed, billed, paid, 1);
  const rows = [
    { k: 'Planned',   v: planned,   c: NEUTRAL_DIM },
    { k: 'Committed', v: committed, c: BLUE },
    { k: 'Billed',    v: billed,    c: AMBER },
    { k: 'Paid out',  v: paid,      c: GREEN },
  ];
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.k} className="hud-row" style={{ animationDelay: `${i * 90}ms` }}>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="font-semibold text-slate-600">{r.k}</span>
            <span className="font-mono tabular-nums font-bold text-slate-800">
              {r.v > 0 ? fmt(r.v) : <span className="text-slate-300">&mdash;</span>}
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden hud-grid">
            <div
              className="h-full rounded-full hud-charge"
              style={{ width: `${(r.v / max) * 100}%`, background: r.c, animationDelay: `${i * 90}ms` }}
            />
            {r.v > 0 && (
              <span className="hud-edge" style={{ left: `${(r.v / max) * 100}%`, animationDelay: `${i * 90}ms` }} />
            )}
          </div>
        </div>
      ))}
      {committed > planned && (
        <p className="text-[10.5px] text-rose-700 font-semibold pt-0.5">
          Committed is {fmt(committed - planned)} above the plan.
        </p>
      )}
    </div>
  );
};

/* ── Room margin bars, quoted vs now ─────────────────────────────────────── */
export const RoomMarginChart: React.FC<{
  rooms: { roomId: string; quotedMarginPct: number; marginPct: number }[];
}> = ({ rooms }) => {
  const shown = rooms.slice(0, 8);
  if (!shown.length) return null;
  const max = Math.max(40, ...shown.map(r => Math.max(r.quotedMarginPct, r.marginPct)));
  return (
    <div className="space-y-2.5">
      {shown.map((r, i) => {
        const slipped = r.marginPct < r.quotedMarginPct - 0.5;
        return (
          <div key={r.roomId} className="flex items-center gap-3 hud-row" style={{ animationDelay: `${i * 70}ms` }}>
            <span className="w-[86px] shrink-0 text-[11px] text-slate-600 truncate">{r.roomId}</span>
            <div className="flex-1 h-5 relative rounded bg-slate-50 overflow-hidden hud-grid">
              <div
                className="absolute inset-y-0 left-0 rounded hud-charge"
                style={{
                  width: `${Math.max(0, (r.marginPct / max) * 100)}%`,
                  background: slipped ? ROSE : GREEN,
                  opacity: 0.9,
                  animationDelay: `${i * 70}ms`,
                }}
              />
              {/* Quoted, as a tick ON TOP. Drawn as a bar behind the current
                  value it vanished whenever the two matched — which is every
                  project before its first purchase order, i.e. exactly when
                  people first open this chart. */}
              <div
                className="absolute inset-y-0 w-[2px] rounded-full"
                style={{
                  left: `calc(${Math.max(0, Math.min(100, (r.quotedMarginPct / max) * 100))}% - 1px)`,
                  background: GOLD,
                }}
                title={`Quoted ${r.quotedMarginPct.toFixed(0)}%`}
              />
            </div>
            <span className={`w-11 shrink-0 text-right font-mono tabular-nums text-[11px] font-bold ${
              slipped ? 'text-rose-700' : 'text-emerald-700'
            }`}>
              {r.marginPct.toFixed(0)}%
            </span>
          </div>
        );
      })}
      <p className="text-[10px] text-slate-400 pt-1 flex items-center gap-1.5">
        <span className="inline-block w-[2px] h-3 rounded-full align-middle" style={{ background: GOLD }} />
        Gold marks the quote. The bar is where the room stands now.
      </p>
    </div>
  );
};

/* ── Collection progress, milestone by milestone ─────────────────────────── */
export const CollectionBar: React.FC<{
  collected: number; invoiced: number; contracted: number; fmt: (n: number) => string;
}> = ({ collected, invoiced, contracted, fmt }) => {
  const max = Math.max(contracted, 1);
  const cPct = Math.min(100, (collected / max) * 100);
  const iPct = Math.min(100 - cPct, (invoiced / max) * 100);
  return (
    <div>
      <div className="relative flex h-8 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 hud-grid">
        <div className="hud-charge" style={{ width: `${cPct}%`, background: GREEN }} />
        <div className="hud-charge" style={{ width: `${iPct}%`, background: AMBER, animationDelay: '.12s' }} />
        {cPct > 0 && <span className="hud-edge" style={{ left: `${cPct}%` }} />}
        <span className="hud-scan" />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10.5px]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: GREEN }} />
          Collected <strong className="text-slate-800">{fmt(collected)}</strong>
        </span>
        {invoiced > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: AMBER }} />
            Invoiced, unpaid <strong className="text-slate-800">{fmt(invoiced)}</strong>
          </span>
        )}
        <span className="flex items-center gap-1.5 text-slate-400">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          Not raised {fmt(Math.max(0, contracted - collected - invoiced))}
        </span>
      </div>
    </div>
  );
};
