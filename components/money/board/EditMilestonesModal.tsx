import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Lock, Zap, SlidersHorizontal, ChevronDown, ArrowUp, ArrowDown, Scissors, Trash2, Sparkles, Check, PenTool, HardHat, ListChecks } from '@/lib/lucide-shim';
import { Button, Chip, Segmented, LABEL, INPUT } from '../../ui/kit';
import { IconTile } from '../../people/PeopleBits';
import DateField from '../../ui/DateField';
import { formatCurrency, id as newId } from '../../../lib/utils';
import type { PaymentMilestone } from '../../../types';
import type { ScheduleResult } from '../../../lib/paymentSchedule';
import { balanceTrack, fixedOverflow, scheduleChanges, shareOf, trackTotal, type Track } from '../../../lib/moneyBoard';
import '../../projectHeader/projectHeader.css';
import './moneyBoardStyles';

/*
  Edit milestones (DESIGN.md → "Money motion"; modal built like AssignProjectsModal).

  The schedule is edited as a draft and saved in one go, so a half-made change
  never reaches the client. Each milestone is billed by a share of its track
  (%) or by a fixed amount before GST; fixed amounts are taken first and the %
  milestones share what is left, as lib/paymentSchedule.ts prices them. Paid
  and invoiced milestones are locked. Once anything has been billed, a save
  needs a reason, which History keeps.
*/

const money = (v: number) => formatCurrency(Math.round(v));
const cleared = (m: PaymentMilestone) => m.status === 'paid' || m.status === 'invoiced';

export interface StudioStages { design: { name: string; pct: number; trigger?: string; unlocks?: string }[]; execution: { name: string; pct: number; trigger?: string; unlocks?: string }[] }

export const EditMilestonesModal: React.FC<{
  milestones: PaymentMilestone[];
  /** Where the draft starts, when it is not the saved schedule (Quick schedule's Fine-tune). */
  initialDraft?: PaymentMilestone[] | null;
  focus: Track | 'both';
  feeOnly: boolean;
  taxable: { design: number; execution: number };
  /** Prices a draft on the current terms. */
  price: (draft: PaymentMilestone[]) => ScheduleResult;
  saved: ScheduleResult;
  studio?: StudioStages | null;
  onSaveAsDefaults?: (draft: PaymentMilestone[]) => void;
  onStudioRules?: () => void;
  onClose: () => void;
  onSave: (draft: PaymentMilestone[], reason: string, changes: string[]) => void;
}> = ({ milestones, initialDraft, focus, feeOnly, taxable, price, saved, studio, onSaveAsDefaults, onStudioRules, onClose, onSave }) => {
  const [draft, setDraft] = useState<PaymentMilestone[]>(() => (initialDraft || milestones).map(m => ({ ...m, subSteps: (m.subSteps || []).map(s => ({ ...s })) })));
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [reason, setReason] = useState('');
  const [menu, setMenu] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const tracks: Track[] = feeOnly ? ['design'] : ['design', 'execution'];
  const priced = useMemo(() => price(draft), [draft, price]);
  const changes = useMemo(() => scheduleChanges(milestones, draft), [milestones, draft]);
  const anyBilled = milestones.some(cleared);
  const rows = (t: Track) => draft.filter(m => (m.type || 'design') === t);
  const lockedBase = (t: Track) => rows(t).filter(cleared).reduce((s, m) => s + (saved.byId[m.id]?.base || 0), 0);
  const totals = Object.fromEntries(tracks.map(t => [t, trackTotal(rows(t), taxable[t])])) as Record<Track, { pct: number; whole: boolean }>;
  const overflow = Object.fromEntries(tracks.map(t => [t, fixedOverflow(rows(t), taxable[t], lockedBase(t))])) as Record<Track, { over: boolean; left: number }>;
  const allWhole = tracks.every(t => totals[t].whole || rows(t).length === 0);
  const anyOver = tracks.some(t => overflow[t].over);
  const ok = changes.length > 0 && allWhole && !anyOver && (!anyBilled || reason.trim().length > 2);

  const patch = (id: string, up: Partial<PaymentMilestone>) => setDraft(d => d.map(m => (m.id === id ? { ...m, ...up, isCustom: true } : m)));
  const setTrack = (t: Track, next: PaymentMilestone[]) => setDraft(d => {
    const out: PaymentMilestone[] = [];
    let i = 0;
    for (const m of d) if ((m.type || 'design') === t) out.push(next[i++]); else out.push(m);
    while (i < next.length) out.push(next[i++]);
    return out;
  });
  const move = (id: string, dir: -1 | 1) => setDraft(d => {
    const at = d.findIndex(m => m.id === id), t = d[at].type;
    let j = at + dir;
    while (j >= 0 && j < d.length && d[j].type !== t) j += dir;
    if (j < 0 || j >= d.length) return d;
    const out = [...d]; [out[at], out[j]] = [out[j], out[at]]; return out;
  });
  const split = (id: string) => setDraft(d => {
    const at = d.findIndex(m => m.id === id), m = d[at];
    const fixed = m.isFixedAmount && m.fixedAmount !== undefined;
    const a = fixed ? Math.floor((m.fixedAmount || 0) / 2) : Math.floor((Number(m.percentage) || 0) / 2 * 100) / 100;
    const b = fixed ? (m.fixedAmount || 0) - a : Math.round(((Number(m.percentage) || 0) - a) * 100) / 100;
    const one = { ...m, name: `${m.name} (part 1)`, ...(fixed ? { fixedAmount: a } : { percentage: a }), isCustom: true };
    const two = { ...m, id: newId(), name: `${m.name} (part 2)`, ...(fixed ? { fixedAmount: b } : { percentage: b }), subSteps: [], isCustom: true };
    const out = [...d]; out.splice(at, 1, one, two); return out;
  });
  const add = (t: Track, fixed: boolean) => {
    const m: PaymentMilestone = { id: newId(), type: t, name: fixed ? 'Fixed payment' : 'New milestone', percentage: 0, description: '', status: 'pending', isCustom: true,
      ...(fixed ? { isFixedAmount: true, fixedAmount: 25000 } : {}) } as PaymentMilestone;
    setDraft(d => [...d, m]);
    setOpenId(m.id);
  };
  const toggleFixed = (m: PaymentMilestone, fixed: boolean) => {
    if (fixed === !!m.isFixedAmount) return;
    const base = taxable[(m.type || 'design') as Track];
    if (fixed) patch(m.id, { isFixedAmount: true, fixedAmount: Math.round(saved.byId[m.id]?.base ?? base * (Number(m.percentage) || 0) / 100) });
    else patch(m.id, { isFixedAmount: false, percentage: Math.round(shareOf(m, base) * 100) / 100, fixedAmount: undefined });
  };
  const loadDefaults = () => {
    setMenu(false);
    if (!studio) return;
    tracks.forEach(t => {
      const stages = studio[t] || [];
      let list = rows(t);
      if (list.length === 0) {
        list = stages.map(s => ({ id: newId(), type: t, name: s.name, percentage: s.pct, trigger: s.trigger, unlocks: s.unlocks, description: '', status: 'pending' } as PaymentMilestone));
      } else {
        let k = 0;
        list = list.map(m => (cleared(m) || m.isFixedAmount ? m : (stages[k] ? { ...m, percentage: stages[k++].pct, isCustom: true } : m)));
      }
      setTrack(t, balanceTrack(list, taxable[t]));
    });
  };

  const moves = draft.filter(m => (saved.byId[m.id] ? Math.round(saved.byId[m.id].owed) !== Math.round(priced.byId[m.id]?.owed || 0) : true));

  const column = (t: Track) => {
    const list = rows(t), tot = totals[t];
    return (
      <div key={t} className={`group rounded-2xl border border-slate-200 p-4 space-y-2 min-w-0 transition-opacity ${focus !== 'both' && focus !== t ? 'opacity-50 hover:opacity-100' : ''}`}>
        <div className="flex flex-wrap items-center gap-2.5">
          <IconTile icon={t === 'design' ? PenTool : HardHat} size="sm" />
          <div className="min-w-0"><h4 className="font-bold text-slate-800">{t === 'design' ? 'Design' : 'Execution'}</h4>
            <p className="text-[11px] text-slate-500 tabular-nums">Taxable {money(taxable[t])}</p></div>
          <span className="ml-auto flex items-center gap-2">
            <Chip tone={tot.whole ? 'good' : 'warn'}>Total {tot.whole ? 100 : Math.round(tot.pct * 10) / 10}%</Chip>
            {!tot.whole && list.some(m => !cleared(m) && !m.isFixedAmount) && (
              <Button size="sm" variant="quiet" icon={Zap} onClick={() => setTrack(t, balanceTrack(list, taxable[t]))}>Auto-balance</Button>
            )}
          </span>
        </div>
        {overflow[t].over && <p className="rounded-xl bg-amber-50 text-amber-800 px-3 py-2 text-xs">Fixed amounts add up to more than the {money(overflow[t].left)} left to bill on this track.</p>}
        <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_70px_128px_96px_28px] gap-2 px-1 pt-1"><span className={LABEL}>Milestone</span><span className={LABEL}>Bill by</span><span className={LABEL}>Share or amount</span><span className={`${LABEL} text-right`}>Client pays</span><span /></div>
        <AnimatePresence initial={false}>
          {list.map((m, i) => {
            const locked = cleared(m), fixed = !!m.isFixedAmount, r = priced.byId[m.id], open = openId === m.id || mode === 'advanced';
            return (
              <motion.div key={m.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.22 }}
                className="border-t border-slate-100 pt-2">
                <div className="grid grid-cols-[minmax(0,1fr)_70px_28px] sm:grid-cols-[minmax(0,1fr)_70px_128px_96px_28px] gap-2 items-center">
                  <input className={`${INPUT} py-1.5 text-xs`} value={m.name} disabled={locked} aria-label="Milestone name" onChange={e => patch(m.id, { name: e.target.value })} />
                  <span className="relative inline-flex p-0.5 rounded-lg bg-slate-100" role="radiogroup" aria-label="Bill by">
                    {([['pct', '%'], ['amt', '₹']] as const).map(([k, l]) => {
                      const on = (k === 'amt') === fixed;
                      return (
                        <button key={k} type="button" role="radio" aria-checked={on} disabled={locked} onClick={() => toggleFixed(m, k === 'amt')}
                          className={`relative w-7 h-7 rounded-md text-sm font-bold transition-colors disabled:cursor-default ${on ? 'text-white' : 'text-slate-500'}`}>
                          {on && <motion.span layoutId={`by-${m.id}`} className="absolute inset-0 rounded-md bg-[#3D52A0]" transition={{ type: 'spring', stiffness: 500, damping: 34 }} />}
                          <span className="relative">{l}</span>
                        </button>
                      );
                    })}
                  </span>
                  <span className="hidden sm:flex flex-col gap-0.5 min-w-0">
                    {locked ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500"><Lock className="w-3 h-3" />{fixed ? money(m.fixedAmount || 0) : `${Number(m.percentage) || 0}%`}</span>
                    ) : fixed ? (
                      <span className="inline-flex items-center rounded-lg border border-slate-300 overflow-hidden focus-within:ring-2 focus-within:ring-[#3D52A0]/30 focus-within:border-[#3D52A0]">
                        <span className="px-2 self-stretch grid place-items-center bg-[#3D52A0]/10 text-[#3D52A0] text-xs font-bold">₹</span>
                        <input className="w-full min-w-0 px-2 py-1.5 text-xs font-bold outline-none tabular-nums" inputMode="numeric" aria-label="Amount before GST"
                          value={m.fixedAmount ? String(Math.round(m.fixedAmount)) : ''} placeholder="0" onChange={e => patch(m.id, { fixedAmount: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} />
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-lg border border-slate-300 overflow-hidden">
                        <button type="button" aria-label="Less" className="w-7 h-7 grid place-items-center text-slate-600 hover:bg-slate-100" onClick={() => patch(m.id, { percentage: Math.max(0, (Number(m.percentage) || 0) - 1) })}><Minus className="w-3 h-3" /></button>
                        <input className="w-full min-w-0 text-center text-xs font-bold outline-none tabular-nums" inputMode="decimal" aria-label="Share in percent"
                          value={String(Number(m.percentage) || 0)} onChange={e => patch(m.id, { percentage: Math.max(0, Math.min(100, Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)) })} />
                        <button type="button" aria-label="More" className="w-7 h-7 grid place-items-center text-slate-600 hover:bg-slate-100" onClick={() => patch(m.id, { percentage: Math.min(100, (Number(m.percentage) || 0) + 1) })}><Plus className="w-3 h-3" /></button>
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 tabular-nums">{fixed ? `before GST · ≈ ${Math.round(shareOf(m, taxable[t]) * 10) / 10}% of the track` : `taxable ${money(r?.base || 0)}`}</span>
                  </span>
                  <span className="hidden sm:block text-right text-xs font-black text-slate-800 tabular-nums">{money(r?.owed || 0)}<span className="block text-[10px] font-semibold text-slate-500">GST {money(r?.gst || 0)}</span></span>
                  {locked ? <span className="grid place-items-center text-slate-400"><Lock className="w-3.5 h-3.5" /></span>
                    : <button type="button" aria-label={`Remove ${m.name}`} className="grid place-items-center w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" onClick={() => setDraft(d => d.filter(x => x.id !== m.id))}><X className="w-4 h-4" /></button>}
                </div>
                {mode === 'simple' && !locked && (
                  <button type="button" onClick={() => setOpenId(openId === m.id ? null : m.id)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700">
                    Details <ChevronDown className={`w-3 h-3 mb-turn ${openId === m.id ? 'rotate-180' : ''}`} />
                  </button>
                )}
                <AnimatePresence initial={false}>
                  {open && !locked && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="grid sm:grid-cols-2 gap-2 pt-2">
                        <label className="sm:col-span-2"><span className={LABEL}>Description</span><input className={`${INPUT} py-1.5 text-xs mt-1`} value={m.description || ''} onChange={e => patch(m.id, { description: e.target.value })} /></label>
                        <label><span className={LABEL}>Earned when</span><input className={`${INPUT} py-1.5 text-xs mt-1`} value={m.trigger || ''} placeholder="For example: on signing" onChange={e => patch(m.id, { trigger: e.target.value })} /></label>
                        <label><span className={LABEL}>Unlocks</span><input className={`${INPUT} py-1.5 text-xs mt-1`} value={m.unlocks || ''} onChange={e => patch(m.id, { unlocks: e.target.value })} /></label>
                        <div><span className={LABEL}>Target date</span><div className="mt-1"><DateField value={m.date || ''} onChange={v => patch(m.id, { date: v || undefined })} placeholder="Set a date" clearable /></div></div>
                        {t === 'execution' && (
                          <button type="button" className="self-end flex items-center gap-2 text-xs text-slate-700" onClick={() => patch(m.id, { isHandoverAdvance: !m.isHandoverAdvance })}>
                            <span className={`relative w-8 h-[18px] rounded-full transition-colors ${m.isHandoverAdvance ? 'bg-[#3D52A0]' : 'bg-slate-300'}`}><span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${m.isHandoverAdvance ? 'right-0.5' : 'left-0.5'}`} /></span>
                            Handover advance
                          </button>
                        )}
                        <div className="sm:col-span-2 space-y-1.5">
                          <span className={`${LABEL} flex items-center gap-1.5`}><ListChecks className="w-3.5 h-3.5" />Steps · ticking them all earns it</span>
                          {(m.subSteps || []).map((s, k) => (
                            <span key={s.id} className="flex items-center gap-2">
                              <input className={`${INPUT} py-1 text-xs`} value={s.label} aria-label="Step" onChange={e => patch(m.id, { subSteps: (m.subSteps || []).map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })} />
                              <button type="button" aria-label="Remove step" className="text-slate-400 hover:text-rose-600" onClick={() => patch(m.id, { subSteps: (m.subSteps || []).filter((_, j) => j !== k) })}><Trash2 className="w-3.5 h-3.5" /></button>
                            </span>
                          ))}
                          <Button size="sm" variant="quiet" icon={Plus} onClick={() => patch(m.id, { subSteps: [...(m.subSteps || []), { id: newId(), label: 'New step', isDone: false }] })}>Add a step</Button>
                        </div>
                        <div className="sm:col-span-2 flex flex-wrap gap-1.5">
                          <Button size="sm" variant="quiet" icon={ArrowUp} disabled={i === 0} onClick={() => move(m.id, -1)}>Up</Button>
                          <Button size="sm" variant="quiet" icon={ArrowDown} disabled={i === list.length - 1} onClick={() => move(m.id, 1)}>Down</Button>
                          <Button size="sm" variant="quiet" icon={Scissors} onClick={() => split(m.id)}>Split in two</Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" variant="quiet" icon={Plus} onClick={() => add(t, false)}>Add by %</Button>
          <Button size="sm" variant="quiet" icon={Plus} onClick={() => add(t, true)}>Add a fixed amount</Button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 phd-scrim bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Edit milestones" className="relative phd-pop w-full max-w-6xl max-h-[92vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex flex-wrap items-start gap-3 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex-1 min-w-[240px]">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Payment schedule</p>
            <h3 className="text-xl font-bold text-slate-800 mt-0.5">Edit milestones</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">Bill each milestone by a share of its track (%) or a fixed amount (₹, before GST). Fixed amounts come first; the % milestones share what is left. Paid and invoiced milestones are locked.</p>
          </div>
          <Segmented label="Detail" size="sm" value={mode} onChange={setMode} options={[{ id: 'simple', label: 'Simple' }, { id: 'advanced', label: 'Advanced' }]} />
          <div className="relative">
            <Button size="sm" variant="secondary" icon={SlidersHorizontal} onClick={() => setMenu(o => !o)}>Studio defaults <ChevronDown className="w-3 h-3" /></Button>
            {menu && (
              <div className="phd-pop absolute right-0 top-full mt-1.5 z-10 w-64 rounded-2xl border border-slate-200 bg-white shadow-xl p-1.5 text-xs">
                <button type="button" disabled={!studio} onClick={loadDefaults} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-50">Load studio defaults into unlocked % rows</button>
                {onSaveAsDefaults && <button type="button" onClick={() => { setMenu(false); onSaveAsDefaults(draft); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100">Save these as the studio defaults</button>}
                {onStudioRules && <button type="button" onClick={() => { setMenu(false); onStudioRules(); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100">Studio payment rules</button>}
              </div>
            )}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {studio && (
            <p className="flex flex-wrap items-center gap-2 rounded-xl bg-[#3D52A0]/5 px-3 py-2 text-xs text-slate-700">
              <Sparkles className="w-4 h-4 text-[#3D52A0]" />
              <span><b>Studio default:</b> design {studio.design.map(s => s.pct).join(' · ')}{!feeOnly && <>, execution {studio.execution.map(s => s.pct).join(' · ')}</>}.</span>
              <Button size="sm" variant="quiet" onClick={loadDefaults}>Apply to unlocked % rows</Button>
            </p>
          )}
          <div className={`grid gap-4 ${tracks.length > 1 ? 'lg:grid-cols-2' : ''}`}>{tracks.map(column)}</div>
          {changes.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-[#3D52A0]/5 px-4 py-3 text-xs text-slate-700 space-y-1">
              <p className="font-bold text-slate-800">What this changes</p>
              {moves.map(m => (
                <p key={m.id} className="tabular-nums">{m.name}: {saved.byId[m.id] ? money(saved.byId[m.id].owed) : 'new'} → <b>{money(priced.byId[m.id]?.owed || 0)}</b> (taxable {money(priced.byId[m.id]?.base || 0)}, GST {money(priced.byId[m.id]?.gst || 0)})</p>
              ))}
              {changes.filter(c => / removed$/.test(c)).map(c => <p key={c}>{c}</p>)}
              <p>Collected stays as it is.{anyBilled ? ' Because something is already billed, this is kept in History with your reason, and the client should be sent the updated schedule.' : ''}</p>
            </motion.div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          {anyBilled ? (
            <label className="flex-1 min-w-[240px]"><span className={LABEL}>Why is the schedule changing?</span>
              <input className={`${INPUT} mt-1.5`} value={reason} onChange={e => setReason(e.target.value)} placeholder="For example: client asked for a fixed ₹1,00,000 at handover" /></label>
          ) : <span className="flex-1" />}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} className="pp-press" disabled={!ok} onClick={() => {
            const out = draft.map(m => (m.isFixedAmount ? { ...m, percentage: Math.round(shareOf(m, taxable[(m.type || 'design') as Track]) * 100) / 100 } : m));
            onSave(out, reason.trim(), changes);
          }}>Save changes</Button>
          <p className="basis-full text-[11px] text-slate-500">
            {!changes.length ? 'Change a share or an amount, switch a row between % and ₹, or add a milestone.'
              : anyOver ? 'Fixed amounts are more than what is left to bill on a track.'
                : !allWhole ? 'Each track has to total 100%. Auto-balance puts the difference on the last % milestone still to bill.'
                  : anyBilled && reason.trim().length < 3 ? 'Add a reason to save.' : 'Ready to save.'}
          </p>
        </div>
      </div>
    </div>
  );
};
