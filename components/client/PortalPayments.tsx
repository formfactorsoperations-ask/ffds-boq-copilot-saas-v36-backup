import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { PaymentMilestone } from '../../types';
import { formatINR } from '../../lib/utils';
import { Check, Clock, MessageSquare, Info } from 'lucide-react';

/**
 * PAYMENTS — what has cleared, what is next, and what the whole road costs.
 *
 * The tab used to render the milestone schedule TWICE: a table at the top and
 * the same array again underneath the fee cards, with different wording,
 * different status chips and different amounts formatting. A client reading a
 * payment page and finding the same nine milestones listed twice does not think
 * "duplicate component" — they think the studio is billing them twice.
 *
 * Three deliberate departures from what was here:
 *
 *   • One list, grouped by the two things a client is actually signing up to —
 *     the design fee and the execution contract.
 *   • A running total against every milestone. A schedule exists so somebody can
 *     plan cash flow, and "what will I have paid by the time site starts" was a
 *     sum the client had to do on paper.
 *   • No invoices and no bank details. Neither is issued from this portal, and
 *     a "Pay via Bank Transfer" button that only opens a panel of account
 *     numbers invites a client to transfer money against a screen rather than
 *     against a document from their studio.
 */

interface Phase {
  total: number;
  taxable: number;
  paid: number;
  pct: number;
}

interface Props {
  milestones: PaymentMilestone[];
  amountOf: (m: PaymentMilestone) => number;
  /** Concessions by milestone id, so a reduced invoice says why it is reduced. */
  discountOf?: (m: PaymentMilestone) => { amount: number; billed: number; reason?: string } | undefined;
  projectValue: number;
  totalPaid: number;
  balanceDue: number;
  /** Milestones the studio has raised and is waiting to be paid. */
  dueCount: number;
  design: Phase;
  execution: Phase;
  onContactStudio: () => void;
  /*
    Whether these figures rest on anything.

    False when the client is holding a projection published before the money
    was part of it. The portal used to fill that gap from a hard-coded object --
    a 4,999 retainer shown as cleared, an assumed 100% billable split -- so a
    client read invented numbers on a money screen with nothing saying they were
    invented. A payment page that admits it does not know is worth more than one
    that guesses convincingly.
  */
  known?: boolean;
}

type Stage = 'cleared' | 'due' | 'upcoming';

const stageOf = (m: PaymentMilestone): Stage =>
  m.status === 'paid' ? 'cleared' : m.status === 'invoiced' ? 'due' : 'upcoming';

const STAGE_LABEL: Record<Stage, string> = {
  cleared: 'Cleared',
  due: 'Due now',
  upcoming: 'Not yet due',
};

const STAGE_CHIP: Record<Stage, string> = {
  cleared: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  due: 'bg-amber-50 text-amber-800 border-amber-200',
  upcoming: 'bg-slate-100 text-slate-500 border-slate-200',
};

const pctOf = (part: number, whole: number) =>
  whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0;

/**
 * A bar that grows from the left on mount. Transform only — never a colour.
 *
 * Driven by the studio's own `.mny-bar` (src/index.css) rather than a
 * transition written here: scaleX(0)→1 over .8s on cubic-bezier(.22,1,.36,1),
 * `transform-origin: left center`, and `backwards` so the fill is never briefly
 * at full width before it charges. The same class carries the fee cards and the
 * Money tab, so every bar in the app moves identically.
 *
 * It also inherits the stylesheet's `prefers-reduced-motion` rule, which a
 * hand-rolled transition here did not — a viewer who has asked for less motion
 * was getting the animation anyway.
 *
 * The width stays inline because it is data, not decoration; the class only
 * scales whatever width the value asked for.
 */
const Fill: React.FC<{ pct: number; className: string; delay?: number }> = ({ pct, className, delay = 0 }) => (
  <span
    className={`mny-bar block h-full ${className}`}
    style={{ width: `${pct}%`, animationDelay: delay ? `${delay}s` : undefined }}
  />
);

/*
  What to say under the amount.

  This began as a running total -- "₹8,57,511 by here" -- accumulated over the
  stored milestone array while the rows above it were grouped by phase, so a
  design milestone that happened to sit last in the array showed a figure
  containing the entire execution contract. It answered a question nobody asked,
  and answered it wrongly.

  It then carried dates, and dates are a liability here: a client comparing the
  month on this screen against the date on their invoice has something to argue
  about, and keeping the two in step is work the studio should not have to do.
  So this states the billing fact and nothing else.

  Deliberately NOT the same fact as the chip beside it. The chip says whether
  the money is due; this says whether an invoice exists for it. A milestone can
  be not yet due and not yet invoiced, or due precisely because an invoice went
  out, and the pair reads correctly either way.
*/
const whenLine = (_m: PaymentMilestone, stage: Stage): string => {
  if (stage === 'cleared') return 'Paid in full';
  if (stage === 'due') return 'Invoice raised';
  return 'Not yet invoiced';
};

export default function PortalPayments({
  milestones, amountOf, discountOf, projectValue, totalPaid, balanceDue,
  dueCount, design, execution, onContactStudio, known = true,
}: Props) {
  /** A figure, or an honest dash. */
  const rupees = (n: number) => (known ? formatINR(n) : '\u2014');
  const percent = (n: number) => (known ? `${n}%` : '\u2014');
  /*
    One pass over the schedule: the money in each state, the running total after
    each milestone, and the next thing the client actually has to deal with.
  */
  const { rows, dueTotal, next } = useMemo(() => {
    const rows = milestones.map(m => ({
      m,
      amount: amountOf(m),
      stage: stageOf(m),
    }));
    return {
      rows,
      dueTotal: rows.filter(r => r.stage === 'due').reduce((s, r) => s + r.amount, 0),
      next: rows.find(r => r.stage === 'due') || rows.find(r => r.stage === 'upcoming'),
    };
  }, [milestones, amountOf]);

  const clearedPct = pctOf(totalPaid, projectValue);
  const duePct = pctOf(dueTotal, projectValue);

  const phases: { key: 'design' | 'execution'; label: string; phase: Phase; bar: string; text: string }[] = [
    { key: 'design', label: 'Design fee', phase: design, bar: 'bg-indigo-500', text: 'text-indigo-700' },
    { key: 'execution', label: 'Execution contract', phase: execution, bar: 'bg-[#3D52A0]', text: 'text-[#334486]' },
  ];

  return (
    <div className="space-y-5">

      {!known && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 sm:p-6 flex gap-3">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-900">The amounts are not available here yet</p>
            <p className="text-xs text-amber-800 font-medium mt-1 leading-relaxed max-w-xl">
              The stages below are right — what they cost has not been published to your portal.
              Your studio has the figures; ask them and they can send them through. Nothing on this
              page is payable until they do.
            </p>
          </div>
        </section>
      )}

      {/* ── Where it stands. One meter, not four disconnected figures. ── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-slate-900">Where your payments stand</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Everything agreed for this project, and how much of it you have settled.
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums leading-none">{rupees(projectValue)}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Agreed in total</p>
          </div>
        </div>

        {/* Cleared, due, and what is still ahead — as one continuous bar. */}
        <div className="mt-5 h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
          <Fill pct={clearedPct} className="bg-emerald-500" />
          <Fill pct={duePct} className="bg-amber-400" delay={0.15} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          {[
            { dot: 'bg-emerald-500', label: 'Cleared', value: totalPaid },
            ...(dueTotal > 0 ? [{ dot: 'bg-amber-400', label: 'Due now', value: dueTotal }] : []),
            { dot: 'bg-slate-200', label: 'Still to come', value: Math.max(0, balanceDue - dueTotal) },
          ].map(s => (
            <span key={s.label} className="flex items-baseline gap-1.5">
              <span className={`w-2 h-2 rounded-full ${s.dot} self-center`} />
              <span className="text-[11px] font-bold text-slate-500">{s.label}</span>
              <span className="text-[12px] font-extrabold text-slate-900 tabular-nums">{rupees(s.value)}</span>
            </span>
          ))}
        </div>

        <p className="text-[11px] text-slate-500 font-semibold mt-3">
          {known ? `${Math.round(clearedPct)}% cleared` : 'Nothing recorded as cleared here'}
          {dueCount === 0
            ? ' · nothing is awaiting payment'
            : ` · ${dueCount} ${dueCount === 1 ? 'payment has' : 'payments have'} been raised`}
        </p>
      </section>

      {/* ── What is next. The one question a client opens this tab to ask. ── */}
      {next && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className={`rounded-2xl border p-5 sm:p-6 ${
            next.stage === 'due' ? 'border-amber-200 bg-amber-50/50' : 'border-sky-200 bg-sky-50/40'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            {next.stage === 'due' ? 'Awaiting payment' : 'Next payment'}
          </p>
          <div className="mt-2 flex items-end justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-[17px] font-bold text-slate-900 leading-tight">{next.m.name}</p>
              <p className="text-[12px] text-slate-600 font-medium mt-1">
                {next.m.trigger || next.m.description || 'Raised against this stage of the work'}
              </p>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums leading-none">
              {rupees(next.amount)}
            </p>
          </div>
          {next.stage !== 'due' && (
            <p className="text-[11px] text-slate-500 font-semibold mt-3">
              Nothing is payable yet — your studio raises this when the work above is reached.
            </p>
          )}
        </motion.section>
      )}

      {/* ── The two things being paid for. ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {phases.map(({ key, label, phase, bar, text }, i) => (
          <div key={key} className="rounded-2xl border border-slate-200/80 bg-white p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
              <p className={`text-[11px] font-extrabold tabular-nums ${text}`}>{percent(phase.pct)}</p>
            </div>
            <p className="text-xl font-extrabold text-slate-900 tabular-nums mt-1.5">{rupees(phase.total)}</p>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">
              {known ? `${formatINR(phase.taxable)} plus GST` : 'Not published yet'}
            </p>
            <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <Fill pct={phase.pct} className={bar} delay={0.1 + i * 0.1} />
            </div>
            <p className="text-[10px] text-slate-500 font-semibold mt-1.5">
              {known ? `${formatINR(phase.paid)} cleared` : 'Ask your studio'}
            </p>
          </div>
        ))}
      </section>

      {/* ── Every milestone, once. ──
             Grouped by phase, each row saying where it stands and when. The
             totals per phase are in the cards above; repeating them per row is
             what produced a design milestone quoting the execution contract. */}
      <section className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Every payment on this project</h3>
          {/*
            The list renders in the order the studio arranged the milestones,
            which is not necessarily date order -- so it no longer says it is.
          */}
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Grouped by design and execution, with where each one stands.
          </p>
        </div>

        {phases.map(({ key, label }) => {
          const group = rows.filter(r => (r.m.type || 'execution') === key);
          if (!group.length) return null;
          return (
            <div key={key} className="border-b border-slate-100 last:border-b-0">
              <p className="px-5 sm:px-6 py-2 bg-slate-50/70 text-[10px] font-black uppercase tracking-wider text-slate-500">
                {label}
              </p>
              <ul>
                {group.map((r, i) => (
                  <motion.li
                    key={r.m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, delay: Math.min(i * 0.035, 0.3) }}
                    className="px-5 sm:px-6 py-3.5 border-t border-slate-50 first:border-t-0 flex items-start gap-3.5"
                  >
                    {/* Where this sits: settled, waiting, or ahead. */}
                    <span className="relative flex flex-col items-center shrink-0 pt-0.5">
                      <span
                        className={`w-5 h-5 rounded-full grid place-items-center border-2 ${
                          r.stage === 'cleared' ? 'bg-emerald-500 border-emerald-500 text-white'
                            : r.stage === 'due' ? 'bg-amber-400 border-amber-400 text-white animate-pulse'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        {r.stage === 'cleared' && <Check className="w-3 h-3" strokeWidth={3} />}
                        {r.stage === 'due' && <Clock className="w-3 h-3" strokeWidth={3} />}
                      </span>
                      {i < group.length - 1 && (
                        <span className="w-px flex-1 min-h-[26px] bg-slate-150 mt-1 bg-slate-200" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-bold text-slate-900">{r.m.name}</p>
                        <span className="text-[10px] font-bold text-slate-400 tabular-nums">{r.m.percentage}%</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 border ${STAGE_CHIP[r.stage]}`}>
                          {STAGE_LABEL[r.stage]}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {r.m.trigger || r.m.description || 'Raised against this stage of the work'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-extrabold text-slate-900 tabular-nums">{rupees(r.amount)}</p>
                      {/*
                        A reduced invoice says why it is reduced.

                        `amountOf` already nets the concession off, so on its own
                        this row showed a smaller number with nothing to explain
                        it -- indistinguishable from a cheaper milestone.
                      */}
                      {(() => {
                        const d = discountOf?.(r.m);
                        if (!d || d.amount <= 0) return null;
                        return (
                          <p className="text-[10px] text-emerald-700 font-bold tabular-nums mt-0.5">
                            {formatINR(d.billed)} less {formatINR(d.amount)} discount
                            {d.reason ? <span className="font-medium text-slate-400"> &middot; {d.reason}</span> : null}
                          </p>
                        );
                      })()}
                      <p className={`text-[10px] font-semibold mt-0.5 ${
                        r.stage === 'due' ? 'text-amber-700' : 'text-slate-400'
                      }`}>
                        {whenLine(r.m, r.stage)}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {/* ── How to actually pay. Not from this screen. ── */}
      <section className="rounded-2xl border border-slate-200/80 bg-[#FDFDFB] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">Paying, and anything that looks wrong</p>
          <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed max-w-xl">
            Your studio confirms payment details with you directly and sends the request when a
            milestone falls due. If a figure here does not match what you were told, ask before
            you pay.
          </p>
        </div>
        <button
          onClick={onContactStudio}
          className="shrink-0 self-start sm:self-auto px-4 py-2.5 rounded-xl bg-[#3D52A0] text-white text-xs font-bold hover:bg-[#334486] transition-colors cursor-pointer flex items-center gap-2"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Message your studio
        </button>
      </section>

      <p className="text-[10px] text-slate-400 font-medium leading-relaxed flex gap-2 px-1">
        <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
        <span>
          Amounts include GST where it applies. Milestones are raised against progress rather
          than fixed dates, so when each one falls due can move with the work on site.
        </span>
      </p>
    </div>
  );
}
