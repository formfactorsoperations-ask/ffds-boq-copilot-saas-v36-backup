import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb, Box, DraftingCompass, Truck, Hammer, PaintRoller, KeyRound, PenTool, HardHat,
  Receipt, Percent, Banknote, Landmark, Wallet, Tag, ShieldCheck, Send, Sparkles, Check, ChevronDown,
  Undo2, Pencil, Minus, Plus, TriangleAlert, CalendarDays,
} from '@/lib/lucide-shim';
import { Button, Chip, LABEL } from '../../ui/kit';
import { CountUp } from '../../ui/HudBits';
import { IconTile, Glide, Ring, DoneTick, Confetti } from '../../people/PeopleBits';
import DateField from '../../ui/DateField';
import { formatCurrency } from '../../../lib/utils';
import type { PaymentMilestone } from '../../../types';
import type { MilestoneAmount } from '../../../lib/paymentSchedule';
import { milestoneKind, type CardState, type MilestoneKind, type Track } from '../../../lib/moneyBoard';
import './moneyBoardStyles';

/*
  One track of the Money board (DESIGN.md → "Money motion"): its tax plate,
  how much of it has come in, and a card per milestone.
*/

export const KIND_ICON: Record<MilestoneKind, React.ComponentType<any>> = {
  concept: Lightbulb, model: Box, drawings: DraftingCompass, material: Truck, build: Hammer,
  finish: PaintRoller, handover: KeyRound, design: PenTool, execution: HardHat,
};

/** A track's money, as the plate shows it. */
export interface TrackFigures {
  gross: number;
  discount: number;
  taxable: number;
  billable: number;
  gst: number;
  cash: number;
  /** What the client pays on this track: taxable plus GST. */
  total: number;
}

export interface CardActions {
  raise: (id: string) => void;
  markPaid: (id: string) => void;
  revertInvoice: (id: string) => void;
  revertPayment: (id: string) => void;
  toggleStep: (id: string, stepIndex: number) => void;
  setDate: (id: string, iso: string) => void;
  setDiscount: (id: string, amount: number, reason: string) => void;
  setHandover: (id: string, on: boolean) => void;
  edit: (track: Track) => void;
}

const money = (v: number) => formatCurrency(Math.round(v));
const Fig: React.FC<{ v: number; className?: string }> = ({ v, className }) => <CountUp value={Math.round(v)} format={money} className={className} />;
const Was: React.FC<{ now: number; was?: number }> = ({ now, was }) =>
  was !== undefined && Math.round(was) !== Math.round(now) ? <s className="block text-[10px] text-slate-400 tabular-nums">{money(was)}</s> : null;

const Delta: React.FC<{ d: number }> = ({ d }) => (Math.round(d) === 0 ? null : (
  <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
    className={`inline-block ml-1 px-1.5 rounded-md text-[10px] font-bold tabular-nums ${d > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
    {d > 0 ? '+' : '−'}{money(Math.abs(d))}
  </motion.span>
));

/* ── The tax plate ─────────────────────────────────────────────────────── */

export const TaxPlate: React.FC<{
  track: Track;
  share: number;
  gstOn: boolean;
  gstRate: number;
  figures: TrackFigures;
  /** The saved figures, while a change is being previewed. */
  saved?: TrackFigures;
  readOnly?: boolean;
  onShare: (v: number) => void;
  onGst: (on: boolean) => void;
  footer?: React.ReactNode;
}> = ({ track, share, gstOn, gstRate, figures: F, saved: S, readOnly, onShare, onGst, footer }) => {
  const whole = Math.max(1, F.billable + F.gst + F.cash);
  const stops = ['0', '30', '50', '70', '100'] as const;
  const showCash = track === 'execution' || F.cash > 0 || share < 100;
  const part = (label: string, icon: React.ComponentType<any>, tone: 'brand' | 'slate', now: number, was: number | undefined, sub: string) => {
    const changed = was !== undefined && Math.round(was) !== Math.round(now);
    return (
      <div className={`flex items-center gap-2.5 px-2 py-1.5 rounded-xl min-w-0 ${changed ? 'bg-[#3D52A0]/5 mb-sheen' : ''}`}>
        <IconTile icon={icon} tone={tone} size="sm" />
        <div className="min-w-0">
          <span className={LABEL}>{label}</span>
          <span className="block text-sm font-black text-slate-800 tabular-nums"><Fig v={now} /></span>
          {changed ? <Was now={now} was={was} /> : <span className="block text-[10px] text-slate-500">{sub}</span>}
        </div>
      </div>
    );
  };
  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-3.5 py-3">
        <Ring value={share / 100} size={58} stroke={7} label={`${share}% taxable`}>
          <span className="block text-xs font-black text-slate-800 tabular-nums leading-none">{share}%</span>
          <span className="block text-[10px] text-slate-500">taxable</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <span className={LABEL}>Taxable share</span>
          <div className="mt-1">
            <Glide id={`share-${track}`} label={`${track === 'design' ? 'Design' : 'Execution'} taxable share`} disabled={readOnly}
              value={(String(share) as any)} options={stops.map(s => ({ id: s, label: `${s}%` }))} onChange={(v) => onShare(Number(v))} />
          </div>
        </div>
        <div className="inline-flex items-center rounded-xl border border-slate-300 overflow-hidden">
          <button type="button" disabled={readOnly || share <= 0} onClick={() => onShare(Math.max(0, share - 5))} aria-label="Five percent less" className="w-7 h-8 grid place-items-center text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Minus className="w-3.5 h-3.5" /></button>
          <span className="min-w-[44px] text-center text-xs font-bold tabular-nums">{share}%</span>
          <button type="button" disabled={readOnly || share >= 100} onClick={() => onShare(Math.min(100, share + 5))} aria-label="Five percent more" className="w-7 h-8 grid place-items-center text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Plus className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className="px-3.5 py-3 border-t border-slate-200 bg-slate-50/60 space-y-2.5">
        <div className="flex h-3 rounded-full overflow-hidden gap-0.5 bg-slate-100" aria-hidden>
          <motion.span className="h-full bg-[#3D52A0]" initial={{ width: 0 }} animate={{ width: `${F.billable / whole * 100}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
          <motion.span className="h-full mb-gst" initial={{ width: 0 }} animate={{ width: `${F.gst / whole * 100}%` }} transition={{ duration: 0.8, delay: 0.08, ease: [0.22, 1, 0.36, 1] }} />
          <motion.span className="h-full bg-slate-300" initial={{ width: 0 }} animate={{ width: `${F.cash / whole * 100}%` }} transition={{ duration: 0.8, delay: 0.16, ease: [0.22, 1, 0.36, 1] }} />
        </div>
        <div className={`grid gap-1 ${showCash ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {part('Invoiced', Receipt, 'brand', F.billable, S?.billable, `${share}% of taxable`)}
          {part(gstOn ? `GST ${gstRate}%` : 'GST off', Percent, 'brand', F.gst, S?.gst, gstOn ? 'on the invoiced part' : 'not charged')}
          {showCash && part('Cash', Banknote, 'slate', F.cash, S?.cash, `${100 - share}%, no GST`)}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 border-t border-dashed border-slate-200 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5 text-[#3D52A0]" /> Taxable <b className="text-slate-800 tabular-nums"><Fig v={F.taxable} /></b>
            {F.discount > 0 && <span className="text-slate-500">after {money(F.discount)} off</span>}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-slate-800"><Wallet className="w-4 h-4 text-[#3D52A0]" /> Client pays
            <b className="text-base font-black tabular-nums"><Fig v={F.total} /></b>{S && <Delta d={F.total - S.total} />}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 border-t border-slate-200 text-xs text-slate-700">
        <button type="button" disabled={readOnly} onClick={() => onGst(!gstOn)} aria-pressed={gstOn} className="inline-flex items-center gap-2 font-semibold disabled:opacity-50">
          <span className={`relative w-8 h-[18px] rounded-full transition-colors ${gstOn ? 'bg-[#3D52A0]' : 'bg-slate-300'}`}>
            <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 30 }} className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${gstOn ? 'right-0.5' : 'left-0.5'}`} />
          </span>
          GST {gstOn ? 'charged' : 'not charged'}
        </button>
        {F.discount > 0 && <span className="inline-flex items-center gap-1.5 text-slate-500"><Tag className="w-3.5 h-3.5" /> Discount {money(F.discount)}, set in Money &amp; Offers</span>}
        {footer}
      </div>
    </div>
  );
};

/* ── A milestone card ─────────────────────────────────────────────────── */

type Moment = 'sent' | 'paid' | 'earned' | null;

export const MilestoneCard: React.FC<{
  m: PaymentMilestone;
  index: number;
  state: CardState;
  amount: MilestoneAmount;
  /** The same milestone on the saved terms, while a change is previewed. */
  saved?: MilestoneAmount;
  share: number;
  waitingOnClient: boolean;
  readOnly?: boolean;
  /** True when the last change on this card came from this screen, not from the portal or the site. */
  wasLocal: (id: string) => boolean;
  actions: CardActions;
  highlight?: boolean;
}> = ({ m, index, state, amount: A, saved: S, share, waitingOnClient, readOnly, wasLocal, actions, highlight }) => {
  const [open, setOpen] = useState(false);
  const [moment, setMoment] = useState<Moment>(null);
  const [live, setLive] = useState(false);
  const [disc, setDisc] = useState<{ amount: string; reason: string } | null>(null);
  const prev = useRef(state);
  useEffect(() => {
    if (prev.current === state) return;
    const was = prev.current;
    prev.current = state;
    const next: Moment = state === 'paid' ? 'paid' : state === 'invoiced' && was !== 'paid' ? 'sent' : state === 'earned' ? 'earned' : null;
    if (!next) return;
    setMoment(next);
    if (!wasLocal(m.id)) setLive(true);
    const t = setTimeout(() => { setMoment(null); setLive(false); }, 3600);
    return () => clearTimeout(t);
  }, [state]);

  const Icon = KIND_ICON[milestoneKind(m)];
  const cleared = state === 'paid' || state === 'invoiced';
  const fixed = m.isFixedAmount && m.fixedAmount !== undefined;
  const showCash = m.type === 'execution' || A.cash > 0;
  const whole = Math.max(1, A.billable + A.gst + A.cash);
  const tone = state === 'paid' ? 'ok' : state === 'invoiced' ? 'warn' : state === 'later' ? 'slate' : 'brand';
  const chip = {
    paid: <Chip tone="good"><span className="w-1.5 h-1.5 rounded-full bg-current" />Paid</Chip>,
    invoiced: <Chip tone="warn"><span className="w-1.5 h-1.5 rounded-full bg-current" />With client</Chip>,
    earned: <Chip tone="brand"><span className="w-1.5 h-1.5 rounded-full bg-current" />Earned</Chip>,
    next: <Chip tone="slate"><span className="w-1.5 h-1.5 rounded-full bg-current" />Up next</Chip>,
    later: <Chip tone="slate"><span className="w-1.5 h-1.5 rounded-full bg-current" />Later</Chip>,
  }[state];
  const steps = m.subSteps || [];
  const done = steps.filter(s => s.isDone).length;
  const hint = state === 'paid'
    ? `Paid${m.paidDate ? ` on ${new Date(m.paidDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}.`
    : state === 'invoiced'
      ? `${m.invoiceNumber || 'Invoice'} is with the client${m.invoiceDate ? ` since ${new Date(m.invoiceDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}.`
      : state === 'earned'
        ? `Earned. The invoice reads ${money(A.invoiceTotal)}${A.cash > 0 ? `, with ${money(A.cash)} as cash` : ''}.`
        : steps.length
          ? `${done} of ${steps.length} steps done${steps.some(s => !s.isDone) ? `. Waiting on: ${steps.filter(s => !s.isDone).map(s => s.label.toLowerCase()).join(', ')}` : ''}.`
          : m.trigger ? `Earned when: ${m.trigger}.` : null;
  const dOwed = S ? A.owed - S.owed : 0;
  const cell = (label: string, icon: React.ComponentType<any>, now: number, was?: number) => {
    const changed = was !== undefined && Math.round(was) !== Math.round(now);
    return (
      <div className={`px-2.5 py-1.5 min-w-0 ${changed ? 'bg-[#3D52A0]/5 mb-sheen' : 'bg-white'}`}>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{React.createElement(icon, { className: 'w-3 h-3 text-slate-400' })}{label}</span>
        <span className="block text-xs font-black text-slate-800 tabular-nums"><Fig v={now} /></span>
        {changed && <Was now={now} was={was} />}
      </div>
    );
  };

  return (
    <motion.article layout="position" data-milestone-id={m.id}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className={`group mb-card relative rounded-2xl border p-3.5 space-y-2.5 ${state === 'paid' ? 'bg-slate-50 border-slate-200' : 'bg-white'} ${state === 'earned' ? 'border-[#3D52A0] ring-4 ring-[#3D52A0]/10' : state === 'invoiced' ? 'border-amber-300' : 'border-slate-200'} ${highlight ? 'ring-4 ring-[#3D52A0]/30' : ''}`}>

      <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 items-start">
        <span className={`relative ${state === 'earned' ? 'mb-halo' : ''}`}>
          <IconTile icon={state === 'paid' ? Check : Icon} tone={tone as any} />
          <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white border border-slate-200 text-[10px] font-bold text-slate-600 grid place-items-center">{index + 1}</span>
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-800 truncate">{m.name}</h4>
          {m.description && <p className="text-[11px] text-slate-500 truncate">{m.description}</p>}
        </div>
        <div className="text-right">
          {S && Math.round(dOwed) !== 0 && <s className="block text-[11px] text-slate-400 tabular-nums">{money(S.owed)}</s>}
          <span className="block text-base font-black text-slate-800 tabular-nums"><Fig v={A.owed} /></span>
          <span className="text-[11px] text-slate-500 tabular-nums">
            {fixed ? `Fixed · ≈ ${Math.round(share * 10) / 10}%` : `${Number(m.percentage) || 0}%`}{S && <Delta d={dOwed} />}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-[52px] text-[11px] text-slate-600">
        {chip}
        {fixed && <Chip tone="brand"><Tag className="w-3 h-3" />Fixed {money(m.fixedAmount || 0)} + GST</Chip>}
        {m.isHandoverAdvance && <Chip tone="slate">Handover advance</Chip>}
        <DateField size="sm" value={m.date || ''} onChange={v => actions.setDate(m.id, v)} placeholder={cleared ? 'set date on record' : 'set target date'} showRelative={!cleared} disabled={readOnly} />
        {m.invoiceNumber && <span>{m.invoiceNumber}</span>}
      </div>

      <div className="ml-[52px] flex h-1.5 rounded-full overflow-hidden gap-0.5 bg-slate-100" aria-hidden>
        <motion.span className="h-full bg-[#3D52A0]" initial={{ width: 0 }} animate={{ width: `${A.billable / whole * 100}%` }} transition={{ duration: 0.7 }} />
        <motion.span className="h-full mb-gst" initial={{ width: 0 }} animate={{ width: `${A.gst / whole * 100}%` }} transition={{ duration: 0.7, delay: 0.05 }} />
        <motion.span className="h-full bg-slate-300" initial={{ width: 0 }} animate={{ width: `${A.cash / whole * 100}%` }} transition={{ duration: 0.7, delay: 0.1 }} />
      </div>
      <div className={`ml-[52px] grid gap-px rounded-xl overflow-hidden border border-slate-200 bg-slate-200 ${showCash ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        {cell('Taxable', Landmark, A.base, S?.base)}
        {cell('GST', Percent, A.gst, S?.gst)}
        {showCash && cell('Cash', Banknote, A.cash, S?.cash)}
        {cell('Invoice', Receipt, A.invoiceTotal, S?.invoiceTotal)}
      </div>
      {cleared && typeof m.lockedBillablePercent === 'number' && (
        <p className="ml-[52px] flex items-center gap-1.5 text-[11px] text-slate-500"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          Billed at {m.lockedBillablePercent}% taxable, GST {m.lockedGstRate ? `${m.lockedGstRate}%` : 'off'}. Later changes to the split leave it alone.</p>
      )}
      {A.discountApplied > 0 && <p className="ml-[52px] text-[11px] text-emerald-700">{money(A.discountApplied)} off this invoice{A.discountReason ? `: ${A.discountReason}` : ''}.</p>}
      {A.retainerDeducted > 0 && <p className="ml-[52px] text-[11px] text-slate-500">{money(A.retainerDeducted)} retainer already collected comes off this invoice.</p>}

      {hint && (
        <p className={`ml-[52px] flex items-start gap-2 rounded-xl px-2.5 py-2 text-[11px] ${waitingOnClient && !cleared && m.type === 'execution' ? 'bg-amber-50 text-amber-800' : 'bg-[#3D52A0]/5 text-slate-700'}`}>
          <Sparkles className="w-3.5 h-3.5 mt-px shrink-0 text-[#3D52A0]" />
          <span>{hint}{waitingOnClient && !cleared && m.type === 'execution' ? ' The client has not accepted the payment schedule yet, so raising it asks for an exception.' : ''}</span>
        </p>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 pl-[52px]">
          {state === 'invoiced' && <Button size="sm" variant="primary" icon={Check} className="pp-press" onClick={() => actions.markPaid(m.id)}>Record payment</Button>}
          {(state === 'earned') && <Button size="sm" variant="primary" icon={Receipt} className="pp-press" onClick={() => actions.raise(m.id)}>Raise invoice</Button>}
          {(state === 'next' || state === 'later') && <Button size="sm" variant="secondary" onClick={() => actions.raise(m.id)}>Raise early</Button>}
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700">
            {open ? 'Less' : 'More'} <ChevronDown className={`w-3.5 h-3.5 mb-turn ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && !readOnly && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="ml-[52px] border-t border-dashed border-slate-200 pt-3 grid sm:grid-cols-2 gap-3 text-xs text-slate-700">
              <div><span className={LABEL}>When it's earned</span><p className="mt-1">{m.trigger || 'Not set'}</p></div>
              <div><span className={LABEL}>What it unlocks</span><p className="mt-1">{m.unlocks || 'Not set'}</p></div>
              {steps.length > 0 && (
                <div className="sm:col-span-2 space-y-1.5"><span className={LABEL}>Steps · ticking them all earns it</span>
                  {steps.map((s, i) => (
                    <button key={s.id} type="button" disabled={cleared} onClick={() => actions.toggleStep(m.id, i)} className="flex items-center gap-2 text-left disabled:cursor-default">
                      <span className={`w-4 h-4 rounded grid place-items-center border transition-colors ${s.isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'}`}>{s.isDone && <Check className="w-3 h-3" />}</span>{s.label}
                    </button>
                  ))}
                </div>
              )}
              {state !== 'paid' && (
                <div className="sm:col-span-2">
                  <span className={LABEL}>Discount off this invoice</span>
                  {disc ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      <input className="w-28 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs" inputMode="numeric" placeholder="₹0" value={disc.amount} onChange={e => setDisc({ ...disc, amount: e.target.value.replace(/[^0-9]/g, '') })} aria-label="Discount amount" />
                      <input className="flex-1 min-w-[140px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs" placeholder="Reason" value={disc.reason} onChange={e => setDisc({ ...disc, reason: e.target.value })} aria-label="Discount reason" />
                      <Button size="sm" variant="secondary" disabled={!disc.amount || !disc.reason.trim()} onClick={() => { actions.setDiscount(m.id, Number(disc.amount), disc.reason.trim()); setDisc(null); }}>Apply</Button>
                      <Button size="sm" variant="quiet" onClick={() => setDisc(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <span>{m.discountAmount ? `${money(m.discountAmount)}${m.discountReason ? `, ${m.discountReason}` : ''}` : 'None'}</span>
                      <Button size="sm" variant="quiet" icon={Tag} onClick={() => setDisc({ amount: m.discountAmount ? String(m.discountAmount) : '', reason: m.discountReason || '' })}>{m.discountAmount ? 'Change' : 'Add discount'}</Button>
                      {!!m.discountAmount && <Button size="sm" variant="quiet" onClick={() => actions.setDiscount(m.id, 0, '')}>Remove</Button>}
                    </div>
                  )}
                </div>
              )}
              {m.type === 'execution' && (
                <button type="button" disabled={cleared} onClick={() => actions.setHandover(m.id, !m.isHandoverAdvance)} className="flex items-center gap-2 text-left disabled:opacity-60">
                  <span className={`relative w-8 h-[18px] rounded-full transition-colors ${m.isHandoverAdvance ? 'bg-[#3D52A0]' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${m.isHandoverAdvance ? 'right-0.5' : 'left-0.5'}`} />
                  </span>
                  Handover advance
                </button>
              )}
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                {state === 'invoiced' && <Button size="sm" variant="quiet" icon={Undo2} onClick={() => actions.revertInvoice(m.id)}>Take the invoice back</Button>}
                {state === 'paid' && <Button size="sm" variant="quiet" icon={Undo2} onClick={() => actions.revertPayment(m.id)}>Undo payment</Button>}
                <Button size="sm" variant="quiet" icon={Pencil} onClick={() => actions.edit(m.type === 'execution' ? 'execution' : 'design')}>Edit in schedule</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {moment === 'paid' && (
        <>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"><DoneTick size={52} /></span>
          <Confetti pieces={24} spread={110} />
          <span className="mb-stamp text-xs font-black uppercase tracking-wider text-emerald-700">Paid</span>
        </>
      )}
      {moment === 'sent' && (
        <>
          <span className="mb-plane text-[#3D52A0]"><Send className="w-6 h-6" /></span>
          <span className="mb-stamp text-xs font-black uppercase tracking-wider text-amber-700">Sent</span>
        </>
      )}
      {moment === 'earned' && (
        <>
          <Confetti pieces={12} spread={70} />
          <span className="mb-stamp text-xs font-black uppercase tracking-wider text-[#3D52A0]">Earned</span>
        </>
      )}
      {live && <span className="mb-live inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-white text-[10px] font-bold uppercase tracking-wider"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Live update</span>}
    </motion.article>
  );
};

/* ── A track column ───────────────────────────────────────────────────── */

export const TrackColumn: React.FC<{
  track: Track;
  value: number;
  plate: React.ReactNode;
  milestones: PaymentMilestone[];
  states: Record<string, CardState>;
  amounts: Record<string, MilestoneAmount>;
  saved?: Record<string, MilestoneAmount>;
  shares: Record<string, number>;
  totalPct: number;
  whole: boolean;
  collected: number;
  withClient: number;
  clientPays: number;
  waitingOnClient: boolean;
  readOnly?: boolean;
  wasLocal: (id: string) => boolean;
  actions: CardActions;
  notice?: React.ReactNode;
  highlightId?: string | null;
  index: number;
  /** Dates every milestone on the track from a first date and an interval. */
  onSetDates?: () => void;
}> = (p) => {
  const whole = Math.max(1, p.clientPays);
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: p.index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3 min-w-0">
      <div className="group flex flex-wrap items-start gap-3">
        <IconTile icon={p.track === 'design' ? PenTool : HardHat} size="md" />
        <div className="min-w-0">
          <h3 className="font-bold text-slate-800">{p.track === 'design' ? 'Design' : 'Execution'}</h3>
          <p className="text-[11px] text-slate-500 tabular-nums">{p.track === 'design' ? 'Design fee' : 'Execution scope'} {money(p.value)}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Chip tone={p.whole ? 'good' : 'warn'}>Milestones {Math.round(p.totalPct * 10) / 10}%</Chip>
          {p.onSetDates && <Button size="sm" variant="quiet" icon={CalendarDays} onClick={p.onSetDates}>Set dates</Button>}
          {!p.readOnly && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => p.actions.edit(p.track)}>Edit</Button>}
        </div>
      </div>
      {p.plate}
      <div>
        <div className="flex h-2 rounded-full overflow-hidden gap-0.5 bg-slate-100" aria-hidden>
          <motion.span className="h-full bg-[#3D52A0]" initial={{ width: 0 }} animate={{ width: `${p.collected / whole * 100}%` }} transition={{ duration: 0.8 }} />
          <motion.span className="h-full bg-amber-500" initial={{ width: 0 }} animate={{ width: `${p.withClient / whole * 100}%` }} transition={{ duration: 0.8, delay: 0.1 }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-500 tabular-nums">
          <span><Fig v={p.collected} /> collected{p.withClient > 0 && <> · {money(p.withClient)} with client</>}</span>
          <span><Fig v={Math.max(0, p.clientPays - p.collected)} /> to go</span>
        </div>
      </div>
      {p.notice}
      {p.track === 'execution' && p.waitingOnClient && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 text-amber-800 px-3 py-2 text-xs">
          <TriangleAlert className="w-4 h-4 shrink-0" />The client has not accepted the payment schedule, so an execution invoice goes out only as an exception.
        </p>
      )}
      {p.milestones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
          No {p.track} milestones yet.{' '}
          {!p.readOnly && <button type="button" className="font-bold text-[#3D52A0]" onClick={() => p.actions.edit(p.track)}>Add them</button>}
        </div>
      ) : (
        <div className="space-y-2.5">
          {p.milestones.map((m, i) => p.amounts[m.id] && (
            <MilestoneCard key={m.id} m={m} index={i} state={p.states[m.id]} amount={p.amounts[m.id]} saved={p.saved?.[m.id]}
              share={p.shares[m.id] || 0} waitingOnClient={p.waitingOnClient} readOnly={p.readOnly} wasLocal={p.wasLocal}
              actions={p.actions} highlight={p.highlightId === m.id} />
          ))}
        </div>
      )}
    </motion.section>
  );
};

