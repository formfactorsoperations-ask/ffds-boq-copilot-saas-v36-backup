import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

export interface AttentionItem {
  id: string;
  /** How loud this should be. `blocked` is a client query; the rest are ours to move. */
  tone: 'blocked' | 'waiting' | 'todo';
  /** What is wrong, in four words. */
  label: string;
  /** Which decision, and why it is stuck. */
  detail: string;
  actionLabel: string;
  onAction: () => void;
  onView: () => void;
}

const TONES = {
  blocked: {
    dot: 'bg-rose-500',
    chip: 'text-rose-700 bg-rose-50 border-rose-200',
    button: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
  waiting: {
    dot: 'bg-amber-500',
    chip: 'text-amber-800 bg-amber-50 border-amber-200',
    button: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  todo: {
    dot: 'bg-[#0066CC]',
    chip: 'text-[#0055B3] bg-sky-50 border-sky-200',
    button: 'bg-[#0066CC] hover:bg-[#0055B3] text-white',
  },
} as const;

const MotionDiv = motion.div as any;

/**
 * The decisions that are stuck on somebody, at the top of the screen.
 *
 * What this replaces was a loose card per problem, emitted into the page flow
 * with no heading and no grouping, and it only knew about two situations: a
 * client query, and a sign-off that had gone quiet. The two most ordinary
 * states -- a decision the client has been told about but has no drawing yet,
 * and a drawing that is ready but was never sent for sign-off -- produced
 * nothing at all, so the work that actually piles up was invisible.
 *
 * Renders nothing when there is nothing to do. A permanent "all clear" panel
 * is furniture.
 */
export default function DecisionAttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-5 sm:px-6 pt-5 pb-3">
        <AlertCircle className="w-4 h-4 text-slate-400" />
        <h3 className="text-[15px] font-extrabold tracking-tight text-slate-900">
          Needs your attention
        </h3>
        <span className="text-[11px] font-black text-slate-400 tabular-nums">{items.length}</span>
      </div>

      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {items.map((item, i) => {
          const tone = TONES[item.tone];

          return (
            <MotionDiv
              key={item.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: Math.min(i, 6) * 0.04 }}
              className="px-5 sm:px-6 py-3.5 flex flex-wrap items-center gap-3"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${tone.chip}`}
                  >
                    {item.label}
                  </span>
                </div>
                <p className="text-[12.5px] text-slate-600 font-medium mt-1 leading-relaxed">
                  {item.detail}
                </p>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={item.onView}
                  className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  View
                </button>
                <button
                  onClick={item.onAction}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap ${tone.button}`}
                >
                  {item.actionLabel}
                </button>
              </div>
            </MotionDiv>
          );
        })}
      </div>
    </MotionDiv>
  );
}
