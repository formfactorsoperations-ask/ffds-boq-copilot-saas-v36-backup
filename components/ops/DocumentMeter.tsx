import React, { useEffect, useId, useState } from 'react';
import {
  BadgeCheck, Eye, AlertCircle, FilePen, FileWarning, Circle, AlertTriangle,
} from 'lucide-react';
import { ProjectContext } from '../../types';
import {
  buildDocumentCompleteness,
  DocumentCompleteness,
  DocSlot,
  DocStatus,
} from '../../lib/documentCompleteness';

/**
 * DOCUMENT COMPLETENESS — SIGNATURE RING
 *
 * ONE UNBROKEN ARC, not six segments.
 *
 * The segmented version was geometrically correct after the linecap fix and
 * still looked wrong: a ring chopped into six pieces, each a different hue,
 * with grey voids between them, reads as debris rather than as an instrument.
 * The ring was being asked to carry six independent facts at once, which is a
 * job it cannot do gracefully at 78px.
 *
 * So the ring now answers one question -- how much of this is signed -- as a
 * single smooth sweep with a gradient and a soft bloom. Which document is
 * where is carried entirely by the named list beside it, where it was already
 * legible. One colour at a time: green when everything is in, rose when the
 * execution agreement is the problem, studio blue while work is in progress.
 */

interface Props {
  projectContext?: ProjectContext | null;
  report?: DocumentCompleteness;
  /** `card` is the compact form; `panel` gives each row its state in words. */
  variant?: 'card' | 'panel';
  className?: string;
}

/* ── Ring geometry ─────────────────────────────────────────────────────── */
const R = 30;
const STROKE = 8;
const BOX = 78;
const CX = BOX / 2;
const C = 2 * Math.PI * R;
const TRACK = '#EDF0F5';
/* A project with nothing signed draws no arc at all, so on a card whose
   contract is the problem the ring would read as calmly neutral. Tinting the
   track keeps the alarm on the instrument without reintroducing fragments. */
const TRACK_ALERT = '#F8E7EE';

/* Light stop -> full stop, so the sweep has depth rather than reading flat. */
const TONE: Record<'good' | 'brand' | 'critical', [string, string]> = {
  good:     ['#3FAE87', '#0E7C5A'],
  brand:    ['#4A9BE4', '#3D52A0'],
  critical: ['#D2708F', '#B4436A'],
};

const TEXT: Record<DocStatus, string> = {
  complete:  'text-emerald-700',
  issued:    'text-sky-700',
  attention: 'text-amber-700',
  draft:     'text-slate-500',
  missing:   'text-rose-700',
  not_due:   'text-slate-300',
};

/** Signed is a seal. Everything else says what it is waiting on. */
const StatusIcon: React.FC<{ status: DocStatus; className?: string }> = ({ status, className = 'w-3.5 h-3.5' }) => {
  const cls = `${className} shrink-0 ${TEXT[status]}`;
  switch (status) {
    case 'complete':  return <BadgeCheck className={cls} strokeWidth={2.4} />;
    case 'issued':    return <Eye className={`${cls} hud-wait`} strokeWidth={2.2} />;
    case 'attention': return <AlertCircle className={`${cls} hud-wait`} strokeWidth={2.4} />;
    case 'draft':     return <FilePen className={cls} strokeWidth={2.2} />;
    case 'missing':   return <FileWarning className={`${cls} hud-wait`} strokeWidth={2.3} />;
    default:          return <Circle className={cls} strokeWidth={2} />;
  }
};

const wordFor = (s: DocSlot): string =>
  s.status === 'complete' ? 'Signed'
  : s.status === 'not_due' ? 'Not due'
  : s.status === 'missing' ? 'Not issued'
  : s.status === 'attention' ? 'Needs attention'
  : s.status === 'draft' ? 'In draft'
  : 'In review';

const DocumentMeter: React.FC<Props> = ({ projectContext, report, variant = 'card', className = '' }) => {
  const doc = report || buildDocumentCompleteness(projectContext);
  const { slots, completeCount, dueCount, unsignedContract, headline } = doc;
  const allDone = dueCount > 0 && completeCount === dueCount;
  const pct = dueCount > 0 ? completeCount / dueCount : 0;

  /* Sweeps up from zero on mount. Same pattern as the Reports gauges. */
  const [charged, setCharged] = useState(false);
  useEffect(() => { const t = setTimeout(() => setCharged(true), 70); return () => clearTimeout(t); }, []);
  const offset = charged ? C - pct * C : C;

  /* Gradient ids must be unique or the first card on the page wins them all. */
  const uid = useId().replace(/:/g, '');
  const gradId = `dm-grad-${uid}`;

  const toneKey = allDone ? 'good' : unsignedContract ? 'critical' : 'brand';
  const [from, to] = TONE[toneKey];

  return (
    <div className={className}>
      {/* In `panel` the surrounding Panel already carries the heading, so
          printing it again here read as "Documents / Documents". */}
      {variant === 'card' && (
        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.14em] mb-2">
          Documents
        </p>
      )}

      <div className="flex items-center gap-4">
        {/* ── Ring ─────────────────────────────────────────────────────── */}
        <div className="relative shrink-0" style={{ width: BOX, height: BOX }}>
          <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={from} />
                <stop offset="100%" stopColor={to} />
              </linearGradient>
            </defs>

            <circle cx={CX} cy={CX} r={R} fill="none" stroke={unsignedContract ? TRACK_ALERT : TRACK} strokeWidth={STROKE} />

            {dueCount > 0 && pct > 0 && (
              <g transform={`rotate(-90 ${CX} ${CX})`}>
                {/* Blurred twin: the arc reads as emitted light, not paint. */}
                <circle
                  cx={CX} cy={CX} r={R} fill="none"
                  stroke={`url(#${gradId})`} strokeWidth={STROKE} strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={offset} opacity={0.4}
                  style={{ filter: 'blur(5px)', transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)' }}
                />
                <circle
                  cx={CX} cy={CX} r={R} fill="none"
                  stroke={`url(#${gradId})`} strokeWidth={STROKE} strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={offset}
                  style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)' }}
                />
              </g>
            )}

            {/* Cyan tracer, one lap, as the ring powers on. */}
            <g className="hud-trace" style={{ transformOrigin: `${CX}px ${CX}px` }}>
              <circle
                cx={CX} cy={CX} r={R} fill="none"
                stroke="#22D3EE" strokeWidth={STROKE} strokeLinecap="round"
                strokeDasharray={`7 ${C - 7}`}
              />
            </g>
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {dueCount === 0 ? (
              <span className="text-[8px] uppercase tracking-widest text-slate-300 font-bold text-center leading-tight">
                None<br />due
              </span>
            ) : allDone ? (
              <BadgeCheck
                className="w-7 h-7 hud-tick text-emerald-700"
                strokeWidth={2.2}
                style={{ animationDelay: '.6s' }}
              />
            ) : (
              <>
                <span className="text-[16px] font-mono font-bold tabular-nums leading-none text-slate-800">
                  {completeCount}<span className="text-slate-300 mx-[1px]">/</span>{dueCount}
                </span>
                <span className="text-[7px] uppercase tracking-[0.12em] text-slate-400 mt-[3px] font-bold">signed</span>
              </>
            )}
          </div>
        </div>

        {/* ── The six, by name ─────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 grid grid-cols-2 gap-x-3 gap-y-1">
          {slots.map((s, i) => (
            <div
              key={s.kind}
              title={`${s.label} — ${s.detail}`}
              className="flex items-center gap-1.5 min-w-0 hud-tick"
              style={{ animationDelay: `${200 + i * 60}ms` }}
            >
              <StatusIcon status={s.status} />
              <span className={`text-[10.5px] truncate ${
                s.status === 'not_due' ? 'text-slate-300'
                : s.status === 'complete' ? 'text-slate-500 font-medium'
                : s.kind === 'execution_agreement' ? 'text-slate-900 font-bold'
                : 'text-slate-700 font-semibold'
              }`}>
                {s.short}
              </span>
            </div>
          ))}
        </div>
      </div>

      {headline && (
        <p className={`mt-2 text-[9.5px] leading-tight flex items-start gap-1 ${
          unsignedContract ? 'text-rose-700 font-bold' : 'text-slate-500 font-medium'
        }`}>
          {unsignedContract && <AlertTriangle className="w-2.5 h-2.5 shrink-0 mt-[1px]" />}
          <span className="truncate">{headline}</span>
        </p>
      )}

      {variant === 'panel' && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
          {slots.map(s => (
            <div key={s.kind} className="flex items-center justify-between gap-3 text-[11.5px]">
              <span className="flex items-center gap-2 min-w-0">
                <StatusIcon status={s.status} className="w-4 h-4" />
                <span className={`truncate ${s.status === 'not_due' ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
                  {s.label}
                </span>
              </span>
              <span className={`shrink-0 font-semibold ${TEXT[s.status]}`}>{wordFor(s)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentMeter;
