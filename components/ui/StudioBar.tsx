/*
  The action bar under a studio page's title, as Projects has it.

  Projects, Clients and Home name themselves in the shell's title row
  (PageTitleBlock) and open with one line under it: a white strip saying
  what needs you, and the page's buttons beside it. Design Desk, Ops Desk and
  People had each grown their own header card, so moving between the top
  tabs read as moving between apps. They now use the title row and this bar,
  so every top tab opens the same way.
*/

import React from 'react';
import { motion } from 'framer-motion';

/** The white strip on the left of the bar: a label, then chips or a line of text. */
export const BarStrip: React.FC<{ label?: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <div className={`flex-1 min-w-[260px] bg-white rounded-[1.25rem] border border-slate-200 cd-panel px-4 py-2 flex items-center gap-2 flex-wrap min-h-[50px] ${className}`}>
    {label && (
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 shrink-0 mr-1">{label}</span>
    )}
    {children}
  </div>
);

/** A count in the strip. Tones follow the Projects "Needs you" chips. */
export const BarChip: React.FC<{
  n: number;
  word: string;
  tone: 'bad' | 'warn' | 'ok' | 'none';
  onClick?: () => void;
  title?: string;
}> = ({ n, word, tone, onClick, title }) => {
  const tint = n === 0 || tone === 'none'
    ? 'bg-slate-50 text-slate-700 border-slate-200'
    : tone === 'bad'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return (
    <button type="button" onClick={onClick} title={title}
      className={`px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all cursor-pointer hover:border-slate-400 ${tint}`}>
      <span className="tabular-nums">{n}</span> {word}
    </button>
  );
};

type BtnProps = Omit<React.ComponentProps<typeof motion.button>, 'className'> & { primary?: boolean; className?: string };

/** A button in the bar, the size and lift of Projects' "New Project". */
export const BarButton: React.FC<BtnProps> = ({ primary, className = '', children, ...rest }) => (
  <motion.button
    type="button"
    whileHover={rest.disabled ? undefined : { scale: 1.02, y: -1 }}
    whileTap={rest.disabled ? undefined : { scale: 0.98 }}
    className={`${primary
      ? 'px-5 bg-[#3D52A0] hover:bg-[#334486] text-white'
      : 'px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700'
    } py-2.5 rounded-[1.25rem] transition-colors shadow-sm flex items-center justify-center gap-2 text-xs font-bold shrink-0 cursor-pointer h-[50px] disabled:opacity-50 disabled:cursor-default ${className}`}
    {...rest}
  >
    {children}
  </motion.button>
);

/** The row itself: strip first, buttons after, wrapping on narrow screens. */
export const StudioBar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex flex-wrap items-stretch sm:items-center gap-3 ${className}`}>{children}</div>
);
