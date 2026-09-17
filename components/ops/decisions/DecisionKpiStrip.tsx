import React from 'react';
import { motion } from 'framer-motion';
import { formatINR } from '../../../lib/utils';
import AnimatedNumber from '../../ui/AnimatedNumber';

interface Props {
  stats: { total: number; signed: number; waiting: number; disputed: number };
  /** Value of everything the client has already signed. */
  covered: number;
  /** Value riding on decisions nobody has signed yet. */
  atRisk: number;
}

const MotionDiv = motion.div as any;

/**
 * The five figures at the top of the Decisions screen.
 *
 * These used to be five equal tiles, which gave the reader nothing to look at
 * first. Only one of them is a decision the studio can act on today -- money
 * sitting on an unsigned approval -- so that one leads and the rest report.
 */
export default function DecisionKpiStrip({ stats, covered, atRisk }: Props) {
  const approvalPct = stats.total > 0 ? Math.round((stats.signed / stats.total) * 100) : 0;
  const exposed = atRisk > 0;

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white rounded-3xl border border-slate-200/70 p-5 sm:p-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-5">
        {/* The lead figure. */}
        <div className="lg:w-[290px] shrink-0">
          <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">
            At risk right now
          </span>
          <span
            className={`block mt-1.5 text-[34px] leading-none font-black tabular-nums ${
              exposed ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            <AnimatedNumber value={atRisk} format={(v) => formatINR(Math.round(v))} />
          </span>
          <p className="text-[12px] text-slate-500 font-medium mt-2 leading-relaxed">
            {exposed ? (
              <>
                Riding on <strong className="text-slate-700">{stats.waiting}</strong>{' '}
                {stats.waiting === 1 ? 'decision' : 'decisions'} the client has not signed.
              </>
            ) : (
              'Nothing is waiting on a client signature.'
            )}
          </p>

          {stats.disputed > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span className="text-[11px] font-bold text-rose-900">
                {stats.disputed} {stats.disputed === 1 ? 'query' : 'queries'} raised
              </span>
            </div>
          )}
        </div>

        <div className="hidden lg:block w-px bg-slate-100" />

        {/* The supporting record. */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4 self-center">
          <div>
            <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">
              Approved
            </span>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <MotionDiv
                  initial={{ width: 0 }}
                  animate={{ width: `${approvalPct}%` }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                  className="bg-[#3D52A0] h-full rounded-full"
                />
              </div>
              <span className="text-sm font-bold text-slate-900 tabular-nums">{approvalPct}%</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium block mt-1.5">
              {stats.signed} of {stats.total}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">
              Logged
            </span>
            <span className="text-xl font-bold text-slate-900 block mt-1.5 tabular-nums">
              <AnimatedNumber value={stats.total} format={(v) => String(Math.round(v))} />
            </span>
            <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
              {stats.waiting} still open
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">
              Signed value
            </span>
            <span className="text-xl font-bold text-emerald-700 block mt-1.5 tabular-nums">
              <AnimatedNumber value={covered} format={(v) => formatINR(Math.round(v))} />
            </span>
            <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">
              Formally approved
            </span>
          </div>
        </div>
      </div>
    </MotionDiv>
  );
}
