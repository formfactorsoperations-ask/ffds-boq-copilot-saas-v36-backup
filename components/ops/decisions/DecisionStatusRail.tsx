import React from 'react';
import { motion } from 'framer-motion';

type LedgerStatus = 'draft' | 'notified' | 'drawing_pending' | 'drawing_sent' | 'signed' | 'disputed';

const STEPS = ['Logged', 'Notified', 'Drawing', 'Signed'] as const;

/**
 * How far along the four steps each ledger status sits.
 *
 * `disputed` stops at the same place `drawing_sent` does: the client has been
 * asked and has answered, but the answer was a query, so the step is reached
 * without being complete.
 */
const REACHED: Record<LedgerStatus, number> = {
  draft: 1,
  notified: 2,
  drawing_pending: 3,
  drawing_sent: 3,
  disputed: 3,
  signed: 4,
};

const MotionDiv = motion.div as any;

/**
 * The lifecycle a decision is already living, drawn.
 *
 * The ledger has always moved through logged -> notified -> drawing -> signed,
 * but the screen showed only a coloured dot, so the reader could tell something
 * was outstanding without telling what was outstanding. This is the same state,
 * spatially: how far it got, and where it stopped.
 */
export default function DecisionStatusRail({
  status,
  compact = false,
}: {
  status: string;
  compact?: boolean;
}) {
  const reached = REACHED[(status as LedgerStatus)] ?? 1;
  const queried = status === 'disputed';
  const done = status === 'signed';

  const tone = queried
    ? { fill: 'bg-rose-500', ring: 'bg-rose-100', text: 'text-rose-700' }
    : done
      ? { fill: 'bg-emerald-500', ring: 'bg-emerald-100', text: 'text-emerald-700' }
      : { fill: 'bg-[#0066CC]', ring: 'bg-sky-100', text: 'text-[#0055B3]' };

  return (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-1.5'}`} aria-label={`Step ${reached} of 4`}>
      {STEPS.map((label, i) => {
        const filled = i < reached;
        const isLast = i === STEPS.length - 1;

        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1">
              <MotionDiv
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.25, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                className={`rounded-full ${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'} ${
                  filled ? tone.fill : 'bg-slate-200'
                }`}
              />
              {!compact && (
                <span
                  className={`text-[9px] font-bold tracking-wide ${
                    filled ? tone.text : 'text-slate-300'
                  }`}
                >
                  {label}
                </span>
              )}
            </div>

            {!isLast && (
              <div
                className={`${compact ? 'w-4' : 'w-7'} h-px ${compact ? '' : 'mb-4'} ${
                  i + 1 < reached ? tone.ring : 'bg-slate-200'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
