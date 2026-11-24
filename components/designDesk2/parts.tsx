import React from 'react';
import { Check, Clock, type LucideIcon } from 'lucide-react';
import { dueOf } from '../../lib/designDesk';
import type { Steps } from '../../lib/designDesk2';

/*
  DESIGN DESK 2.0: the small parts every page of the new desk shares.

  The look is the mockup the owner approved on 24 Nov 2026 (DESIGN.md, "Design
  Desk 2.0"): a dark green rail, emerald for the main action and for done,
  amber for "your turn" and the client, slate for everything else. Controls
  are larger than the console's because designers are the main users. The
  fonts and the motion classes are the app's own.
*/

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ------------------------------------------------------------ buttons */

export type BtnKind = 'primary' | 'plain' | 'quiet' | 'light';
const BTN: Record<BtnKind, string> = {
  primary: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
  plain: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  quiet: 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
  light: 'bg-white text-emerald-900 shadow-sm hover:bg-emerald-50',
};
export const btnClass = (kind: BtnKind = 'plain', big = false) =>
  cx('inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors disabled:opacity-50', big ? 'min-h-[48px] px-5 text-base' : 'min-h-[44px] px-4 text-sm', BTN[kind]);

export const Btn: React.FC<{
  kind?: BtnKind; big?: boolean; icon?: LucideIcon; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean; title?: string; className?: string; 'aria-label'?: string;
}> = ({ kind, big, icon: Icon, children, className, ...rest }) => (
  <button type="button" className={cx(btnClass(kind, big), className)} {...rest}>
    {Icon && <Icon size={big ? 20 : 18} aria-hidden />}{children}
  </button>
);

/* ------------------------------------------------------------ surfaces */

export const Card: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({ children, className, delay }) => (
  <div className={cx('hud-panel-in rounded-2xl border border-slate-200 bg-white shadow-sm', className)} style={delay ? { animationDelay: `${delay}ms` } : undefined}>{children}</div>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; hint?: string; aside?: React.ReactNode }> = ({ children, hint, aside }) => (
  <div className="mb-3 mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <h2 className="text-lg font-bold text-slate-800">{children}</h2>
    {hint && <span className="text-sm text-slate-500">{hint}</span>}
    {aside && <span className="ml-auto">{aside}</span>}
  </div>
);

export const Empty: React.FC<{ icon: LucideIcon; title: string; line: string; children?: React.ReactNode }> = ({ icon: Icon, title, line, children }) => (
  <Card className="grid place-items-center px-6 py-12 text-center">
    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon size={22} aria-hidden /></span>
    <p className="mt-3 text-base font-bold text-slate-800">{title}</p>
    <p className="mt-1 max-w-md text-sm text-slate-500">{line}</p>
    {children && <div className="mt-4">{children}</div>}
  </Card>
);

/* ------------------------------------------------------------ small labels */

export type TagTone = 'you' | 'good' | 'bad' | 'plain';
const TAG: Record<TagTone, string> = {
  you: 'bg-amber-100 text-amber-800',
  good: 'bg-emerald-100 text-emerald-800',
  bad: 'bg-rose-100 text-rose-700',
  plain: 'bg-slate-100 text-slate-600',
};
export const Tag: React.FC<{ tone?: TagTone; icon?: LucideIcon; children: React.ReactNode; title?: string }> = ({ tone = 'plain', icon: Icon, children, title }) => (
  <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold', TAG[tone])}>
    {Icon && <Icon size={13} aria-hidden />}{children}
  </span>
);

/** When the drawing is due, red once it is late. Nothing when it has no date. */
export const DueTag: React.FC<{ targetDate?: string | null }> = ({ targetDate }) => {
  const due = dueOf(targetDate);
  if (!due) return null;
  return <Tag tone={due.tone === 'late' ? 'bad' : due.tone === 'soon' ? 'you' : 'plain'} icon={Clock}>{due.label}</Tag>;
};

/** Who has the drawing now. "You" is amber so a person finds their own turn at a glance. */
export const HolderTag: React.FC<{ holder: string | null }> = ({ holder }) => {
  if (!holder) return <Tag>Not started</Tag>;
  if (holder === 'You') return <Tag tone="you">Your turn</Tag>;
  if (holder === 'Ready for site' || holder === 'Sent to site') return <Tag tone="good">{holder}</Tag>;
  return <Tag tone={holder === 'Client' ? 'you' : 'plain'}>With {holder === 'Design Head' ? 'the Design Head' : holder === 'Client' ? 'the client' : holder}</Tag>;
};

/* ------------------------------------------------------------ the numbered steps */

/** The drawing's steps in a row: done steps ticked in emerald, the current one ringed (amber when it is your turn). */
export const StepTrack: React.FC<{ steps: Steps; yours?: boolean; compact?: boolean }> = ({ steps, yours, compact }) => (
  <ol className="flex w-full items-start" aria-label="Steps">
    {steps.labels.map((label, i) => {
      const done = i < steps.current;
      const now = i === steps.current;
      return (
        <li key={label} className="relative flex min-w-0 flex-1 flex-col items-center text-center" aria-current={now ? 'step' : undefined}>
          {i > 0 && <span aria-hidden className={cx('absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2', done || now ? 'bg-emerald-500' : 'bg-slate-200')} />}
          <span className={cx('relative z-[1] grid h-7 w-7 place-items-center rounded-full text-xs font-bold',
            done ? 'bg-emerald-600 text-white' : now ? (yours ? 'bg-amber-500 text-white ring-4 ring-amber-100' : 'bg-white text-emerald-700 ring-2 ring-emerald-500') : 'bg-slate-100 text-slate-400')}>
            {done ? <Check size={14} strokeWidth={3} aria-label="Done" /> : i + 1}
          </span>
          {!compact && <span className={cx('mt-1.5 px-1 text-xs leading-tight', now ? 'font-bold text-slate-800' : done ? 'text-slate-600' : 'text-slate-400')}>{label}</span>}
        </li>
      );
    })}
  </ol>
);

export { cx };
