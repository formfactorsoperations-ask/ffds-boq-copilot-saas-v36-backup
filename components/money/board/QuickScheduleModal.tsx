import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Sparkles, SlidersHorizontal, Lock, PenTool, HardHat, ListChecks, Wand2 } from '@/lib/lucide-shim';
import { Button, Chip, EmptyState, LABEL, INPUT } from '../../ui/kit';
import { IconTile } from '../../people/PeopleBits';
import { formatCurrency, id as newId } from '../../../lib/utils';
import type { PaymentMilestone } from '../../../types';
import type { ScheduleResult } from '../../../lib/paymentSchedule';
import { fixedOverflow, scheduleChanges, trackTotal, type Track } from '../../../lib/moneyBoard';
import { draftStages, QUICK_EXAMPLE } from '../../../lib/quickSchedule';
import { KIND_ICON } from './TrackColumn';
import '../../projectHeader/projectHeader.css';
import './moneyBoardStyles';

/*
  Quick schedule (DESIGN.md → "Money motion"; modal built like Edit milestones).

  The studio types its milestones and the stages are worked out as it types:
  the track, the share, when each is earned, what it unlocks and the steps that
  earn it (lib/quickSchedule.ts). The preview is priced on the project's terms.
  Approve saves it as the payment schedule; Fine-tune opens it in Edit
  milestones first. Paid and invoiced milestones stay as they are.
*/

const money = (v: number) => formatCurrency(Math.round(v));
const cleared = (m: PaymentMilestone) => m.status === 'paid' || m.status === 'invoiced';

export const QuickScheduleModal: React.FC<{
  milestones: PaymentMilestone[];
  feeOnly: boolean;
  taxable: { design: number; execution: number };
  price: (draft: PaymentMilestone[]) => ScheduleResult;
  onClose: () => void;
  onApprove: (draft: PaymentMilestone[], reason: string, changes: string[]) => void;
  onFineTune: (draft: PaymentMilestone[]) => void;
}> = ({ milestones, feeOnly, taxable, price, onClose, onApprove, onFineTune }) => {
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');

  const tracks: Track[] = feeOnly ? ['design'] : ['design', 'execution'];
  const draft = useMemo(() => draftStages({ text, current: milestones, taxable, feeOnly, newId }), [text, milestones, taxable, feeOnly]);
  const priced = useMemo(() => price(draft.milestones), [draft, price]);
  const changes = useMemo(() => scheduleChanges(milestones, draft.milestones), [milestones, draft]);
  const anyBilled = milestones.some(cleared);
  const generated = draft.stages.filter(s => s.from !== 'kept').length;

  const rows = (t: Track) => draft.milestones.filter(m => (m.type || 'design') === t);
  const lockedBase = (t: Track) => rows(t).filter(cleared).reduce((s, m) => s + (priced.byId[m.id]?.base || 0), 0);
  const live = tracks.filter(t => draft.stages.some(s => s.from !== 'kept' && (s.milestone.type || 'design') === t));
  const totals = Object.fromEntries(tracks.map(t => [t, trackTotal(rows(t), taxable[t])])) as Record<Track, { pct: number; whole: boolean }>;
  const over = live.some(t => fixedOverflow(rows(t), taxable[t], lockedBase(t)).over);
  const allWhole = live.every(t => totals[t].whole);
  const ok = generated > 0 && changes.length > 0 && allWhole && !over && (!anyBilled || reason.trim().length > 2);

  const current = milestones.filter(m => !cleared(m)).map(m => m.name);
  const fromCurrent = () => {
    const line = (t: Track) => milestones.filter(m => (m.type || 'design') === t && !cleared(m)).map(m => m.name).join(', ');
    setText(tracks.map(t => line(t) && `${t === 'design' ? 'Design' : 'Execution'}: ${line(t)}`).filter(Boolean).join('\n'));
  };

  const column = (t: Track) => {
    const stages = draft.stages.filter(s => (s.milestone.type || 'design') === t);
    const tot = totals[t];
    if (draft.untouched.includes(t)) {
      return (
        <div key={t} className="rounded-2xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 flex items-center gap-2.5">
          <IconTile icon={t === 'design' ? PenTool : HardHat} size="sm" tone="slate" />
          <span><b className="text-slate-700">{t === 'design' ? 'Design' : 'Execution'}</b> stays as it is: {rows(t).length} {rows(t).length === 1 ? 'milestone' : 'milestones'}. Add an "{t === 'design' ? 'Design' : 'Execution'}:" line to redo it.</span>
        </div>
      );
    }
    if (!stages.length) return null;
    return (
      <div key={t} className="group rounded-2xl border border-slate-200 p-4 space-y-2 min-w-0 hud-panel-in">
        <div className="flex flex-wrap items-center gap-2.5">
          <IconTile icon={t === 'design' ? PenTool : HardHat} size="sm" />
          <div className="min-w-0"><h4 className="font-bold text-slate-800">{t === 'design' ? 'Design' : 'Execution'}</h4>
            <p className="text-[11px] text-slate-500 tabular-nums">Taxable {money(taxable[t])}</p></div>
          <span className="ml-auto"><Chip tone={tot.whole ? 'good' : 'warn'}>Total {tot.whole ? 100 : Math.round(tot.pct * 10) / 10}%</Chip></span>
        </div>
        <AnimatePresence initial={false}>
          {stages.map((s, i) => {
            const m = s.milestone, r = priced.byId[m.id], Icon = KIND_ICON[s.kind], kept = s.from === 'kept';
            return (
              <motion.div key={kept ? m.id : `${i}-${m.name}`} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.22 }}
                className="border-t border-slate-100 pt-2">
                <div className="flex items-start gap-2.5">
                  <IconTile icon={kept ? Lock : Icon} size="sm" tone={kept ? 'slate' : 'brand'} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-800">
                      {m.name}
                      <Chip tone={kept ? 'slate' : s.from === 'typed' ? 'brand' : 'good'}>
                        {kept ? (m.status === 'paid' ? 'Paid, kept' : 'Invoiced, kept') : m.isFixedAmount ? `${money(m.fixedAmount || 0)} fixed` : `${Math.round((Number(m.percentage) || 0) * 10) / 10}%${s.from === 'auto' ? ' · auto' : ''}`}
                      </Chip>
                      {m.isHandoverAdvance && !kept && <Chip tone="slate">Handover advance</Chip>}
                    </p>
                    {!kept && (
                      <>
                        <p className="text-[11px] text-slate-500 mt-0.5"><b className="text-slate-600">Earned when</b> {(m.trigger || '').charAt(0).toLowerCase() + (m.trigger || '').slice(1)} · <b className="text-slate-600">unlocks</b> {(m.unlocks || '').charAt(0).toLowerCase() + (m.unlocks || '').slice(1)}</p>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          <ListChecks className="w-3.5 h-3.5 text-slate-400" aria-label="Steps" />
                          {(m.subSteps || []).map(st => <span key={st.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{st.label}</span>)}
                        </span>
                      </>
                    )}
                  </div>
                  <span className="text-right text-xs font-black text-slate-800 tabular-nums shrink-0">{money(r?.owed || 0)}<span className="block text-[10px] font-semibold text-slate-500">GST {money(r?.gst || 0)}</span></span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 phd-scrim bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Quick schedule" className="relative phd-pop w-full max-w-6xl max-h-[92vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex flex-wrap items-start gap-3 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex-1 min-w-[240px]">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Payment schedule</p>
            <h3 className="text-xl font-bold text-slate-800 mt-0.5">Quick schedule</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">Type your milestones and the stages are worked out as you type: the track, the share, when each is earned and the steps that earn it. Nothing is saved until you approve.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
          <div className="space-y-3 min-w-0">
            <label className="block"><span className={LABEL}>Your milestones</span>
              <textarea className={`${INPUT} mt-1.5 min-h-[180px] leading-relaxed`} value={text} onChange={e => setText(e.target.value)} autoFocus
                aria-label="Your milestones" placeholder={QUICK_EXAMPLE} /></label>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="quiet" icon={Sparkles} onClick={() => setText(QUICK_EXAMPLE)}>Use the example</Button>
              {current.length > 0 && <Button size="sm" variant="quiet" icon={Wand2} onClick={fromCurrent}>Start from this schedule</Button>}
            </div>
            <ul className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600 space-y-1">
              <li>One per line, or separated by commas.</li>
              <li>Add <b>25%</b> or <b>₹1L</b> to set a share; the rest is shared out by what each stage usually carries.</li>
              <li><b>Design:</b> and <b>Execution:</b> put what follows on that track. Without them, the words decide.</li>
              <li><b>Civil: demolition, masonry</b> sets the steps that earn a stage.</li>
              {anyBilled && <li>Paid and invoiced milestones stay as they are; the new stages share what is left.</li>}
            </ul>
          </div>

          <div className="space-y-3 min-w-0">
            {generated === 0 ? (
              <EmptyState icon={Sparkles} title="The stages appear here" text="Type a milestone or use the example. Each one gets its share, its trigger and its steps." />
            ) : (
              <>
                {draft.warnings.map(w => <p key={w} className="rounded-xl bg-amber-50 text-amber-800 px-3 py-2 text-xs">{w}</p>)}
                {over && <p className="rounded-xl bg-amber-50 text-amber-800 px-3 py-2 text-xs">Fixed amounts add up to more than what is left to bill on a track.</p>}
                <div className="space-y-3">{tracks.map(column)}</div>
                <p className="text-xs text-slate-600 tabular-nums">Client pays <b className="text-slate-800">{money(priced.amounts.reduce((s, r) => s + (r.owed || 0), 0))}</b> across {draft.milestones.length} {draft.milestones.length === 1 ? 'milestone' : 'milestones'}.</p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          {anyBilled ? (
            <label className="basis-full sm:basis-auto sm:flex-1 sm:min-w-[240px]"><span className={LABEL}>Why is the schedule changing?</span>
              <input className={`${INPUT} mt-1.5`} value={reason} onChange={e => setReason(e.target.value)} placeholder="For example: client agreed new stages for the site work" /></label>
          ) : <span className="flex-1" />}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" icon={SlidersHorizontal} disabled={generated === 0} onClick={() => onFineTune(draft.milestones)}>Fine-tune first</Button>
          <Button variant="primary" icon={Check} className="pp-press" disabled={!ok} onClick={() => onApprove(draft.milestones, reason.trim(), changes)}>Approve as payment schedule</Button>
          <p className="basis-full text-[11px] text-slate-500">
            {generated === 0 ? 'Type your milestones to see the stages.'
              : over ? 'Fixed amounts are more than what is left to bill on a track.'
                : !allWhole ? 'Each track has to total 100%. Fine-tune first, or change a typed share.'
                  : !changes.length ? 'This is the schedule you already have.'
                    : anyBilled && reason.trim().length < 3 ? 'Add a reason to approve.' : 'Looks right? Approve it and it becomes the payment schedule.'}
          </p>
        </div>
      </div>
    </div>
  );
};
