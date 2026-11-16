import React from 'react';

/*
  The screen kit (DESIGN.md "Screen kit", standardisation PR 2).

  Every project screen used to build its own cards, buttons, tiles and empty
  states. Six files each had a Panel of their own, close to each other but not
  the same, and every round of work added another look. These are the parts a
  screen is built from now. They are DESIGN.md written as components, so a
  screen that uses them cannot drift from it: brand #3D52A0, slate, and rose,
  amber and emerald for state only; the type scale; the console motion.

  People, the Ops Desk and Pricing keep their approved motion by passing their
  own icon tile (`chip`) into the same header; the card around it is the same.
*/

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/* ── Icon chip ──────────────────────────────────────────────────────────── */

/** The brand-tint square that leads a card's header. */
export const IconChip: React.FC<{ icon: React.ElementType; className?: string }> = ({ icon: Icon, className }) => (
  <span className={cx('w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0', className)}>
    <Icon className="w-4 h-4" strokeWidth={2.2} aria-hidden />
  </span>
);

/* ── Panel ──────────────────────────────────────────────────────────────── */

export interface PanelHeadProps {
  /** Lucide icon for the brand chip. */
  icon?: React.ElementType;
  /** Use instead of `icon` where an approved motion kit has its own tile (People, Ops Desk). */
  chip?: React.ReactNode;
  title: React.ReactNode;
  blurb?: React.ReactNode;
  /** Sits right after the title, e.g. a status chip ("3 missing"). */
  badge?: React.ReactNode;
  /** Right-aligned: a button, a switch, a link. */
  aside?: React.ReactNode;
  /** h2 for a screen's cards, h3 inside a card. */
  as?: 'h2' | 'h3';
}

/** A card's header: icon chip, title, one line of blurb, and anything on the right. */
export const PanelHead: React.FC<PanelHeadProps> = ({ icon, chip, title, blurb, badge, aside, as: H = 'h2' }) => (
  <div className="flex flex-wrap items-start gap-3">
    {chip ?? (icon ? <IconChip icon={icon} /> : null)}
    <div className="min-w-0 grow basis-52">
      <H className="font-bold text-slate-800 flex flex-wrap items-center gap-2">{title}{badge}</H>
      {blurb && <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>}
    </div>
    {aside && <div className="shrink-0 flex items-center gap-2">{aside}</div>}
  </div>
);

export interface PanelProps extends PanelHeadProps {
  children?: React.ReactNode;
  /** A strip under the body (`bg-slate-50`, top rule): a note, a total, a link. */
  foot?: React.ReactNode;
  id?: string;
  className?: string;
  /** Stagger when several cards arrive together (ms). */
  delay?: number;
}

/** The content card: `bg-white rounded-2xl border-slate-200 shadow-sm p-6`, arriving with `hud-panel-in`. */
export const Panel: React.FC<PanelProps> = ({ children, foot, id, className, delay, ...head }) => (
  <section
    id={id}
    className={cx('bg-white rounded-2xl border border-slate-200 shadow-sm hud-panel-in flex flex-col min-w-0', foot && 'overflow-hidden', className)}
    style={delay ? { animationDelay: `${delay}ms` } : undefined}
  >
    <div className="p-6 flex-1 min-w-0">
      <PanelHead {...head} />
      {children != null && children !== false && <div className="mt-5">{children}</div>}
    </div>
    {foot && <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 mt-auto">{foot}</div>}
  </section>
);

/* ── Buttons ────────────────────────────────────────────────────────────── */

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-[#3D52A0] text-white hover:bg-[#334486] border border-transparent',
  secondary: 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300',
  quiet: 'bg-transparent text-[#3D52A0] hover:bg-[#3D52A0]/10 border border-transparent',
  danger: 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-200',
};

/** The class list for a button, for the rare place that cannot use `<Button>` (a link styled as one). */
export const buttonClass = (variant: ButtonVariant = 'secondary', size: 'md' | 'sm' = 'md') => cx(
  'inline-flex items-center justify-center gap-1.5 rounded-xl font-bold whitespace-nowrap transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 disabled:opacity-50 disabled:pointer-events-none',
  size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
  BUTTON[variant],
);

/* Props are listed rather than inherited: the repo has no React type package, so inherited HTML props resolve to nothing. */
export interface ButtonProps {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: React.ElementType;
  className?: string;
  children?: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
  [attr: string]: unknown;
}

/** Says exactly what it does, in sentence case ("Send for approval"). One primary per screen, last in its row. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon: Icon, className, children, type = 'button', ...rest }: ButtonProps, ref) => (
    <button ref={ref} type={type} className={cx(buttonClass(variant, size), className)} {...rest}>
      {Icon && <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/* ── Chips ──────────────────────────────────────────────────────────────── */

export type Tone = 'brand' | 'slate' | 'good' | 'warn' | 'bad';

const CHIP: Record<Tone, string> = {
  brand: 'bg-[#3D52A0]/10 text-[#3D52A0]',
  slate: 'bg-slate-100 text-slate-600',
  good: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
  bad: 'bg-rose-100 text-rose-700',
};

/** A status chip: `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider`. */
export const Chip: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string; title?: string }> = ({ tone = 'slate', children, className, title }) => (
  <span title={title} className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap', CHIP[tone], className)}>
    {children}
  </span>
);

const DOT: Record<Exclude<Tone, 'brand'>, string> = { slate: 'bg-slate-300', good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500' };

/** A state light. State lives here and in chips, never in tinted tiles or buttons. */
export const StateDot: React.FC<{ tone: Exclude<Tone, 'brand'>; className?: string }> = ({ tone, className }) => (
  <span aria-hidden className={cx('inline-block w-2 h-2 rounded-full shrink-0', DOT[tone], className)} />
);

/* ── Segmented choice ───────────────────────────────────────────────────── */

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: {
  value: T | null;
  options: Array<{ id: T; label: React.ReactNode; count?: number }>;
  onChange: (v: T) => void;
  /** Names the choice for screen readers. */
  label: string;
  size?: 'md' | 'sm';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 p-1 rounded-xl bg-slate-100">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)}
            className={cx(
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              'rounded-lg font-semibold whitespace-nowrap transition-colors inline-flex items-center gap-1.5',
              on ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}>
            {o.label}
            {o.count != null && <span className={cx('text-[11px] font-bold tabular-nums', on ? 'text-[#3D52A0]' : 'text-slate-400')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Summary strip ──────────────────────────────────────────────────────── */

export interface Stat {
  label: string;
  value: React.ReactNode;
  /** One line under the figure. */
  sub?: React.ReactNode;
  /** A state light beside the label. Tiles themselves stay white. */
  tone?: Exclude<Tone, 'brand'>;
  onClick?: () => void;
}

/** One figure: label, a `font-black` number, one line. White, whatever its state. */
export const StatTile: React.FC<Stat> = ({ label, value, sub, tone, onClick }) => {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {tone && <StateDot tone={tone} />}{label}
      </span>
      <span className="mt-1 block text-xl font-black text-slate-800 tabular-nums leading-tight">{value}</span>
      {sub && <span className="mt-0.5 block text-[11px] text-slate-500">{sub}</span>}
    </>
  );
  const box = 'min-w-0 text-left bg-white rounded-xl border border-slate-200 px-4 py-3';
  return onClick
    ? <button type="button" onClick={onClick} className={cx(box, 'hover:border-[#3D52A0]/40 hover:bg-slate-50 transition-colors')}>{body}</button>
    : <div className={box}>{body}</div>;
};

/** Three to five figures above a screen's work. More than five stops being scannable. */
export const SummaryStrip: React.FC<{ stats: Stat[]; className?: string }> = ({ stats, className }) => (
  <div className={cx('grid gap-3 grid-cols-2', stats.length >= 4 ? 'lg:grid-cols-4' : 'sm:grid-cols-3', stats.length >= 5 && 'xl:grid-cols-5', className)}>
    {stats.slice(0, 5).map((s, i) => (
      <div key={s.label} className="hud-row-in min-w-0 grid" style={{ animationDelay: `${i * 30}ms` }}><StatTile {...s} /></div>
    ))}
  </div>
);

/* ── Empty state ────────────────────────────────────────────────────────── */

/**
 * Nothing here yet: an icon chip, a title, one line and at most one button,
 * in a dashed box sized to its words. Never a hero.
 */
export const EmptyState: React.FC<{
  icon: React.ElementType;
  title: string;
  text?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, text, action, className }) => (
  <div className={cx('rounded-xl border border-dashed border-slate-300 px-5 py-6 flex flex-col sm:flex-row sm:items-center gap-3', className)}>
    <IconChip icon={icon} className="!bg-slate-100 !text-slate-400" />
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {text && <p className="text-xs text-slate-500 mt-0.5">{text}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/* ── Fields ─────────────────────────────────────────────────────────────── */

/** Field labels, eyebrows and column heads. */
export const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
/** Inputs and selects. */
export const INPUT = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50';

/** A row of filters on the left and search or refresh on the right, under a rule. */
export const Toolbar: React.FC<{ left?: React.ReactNode; right?: React.ReactNode; className?: string }> = ({ left, right, className }) => (
  <div className={cx('flex flex-wrap items-center gap-2 pt-1 pb-3 border-b border-slate-200/50', className)}>
    <div className="flex flex-wrap items-center gap-2 min-w-0">{left}</div>
    {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
  </div>
);
