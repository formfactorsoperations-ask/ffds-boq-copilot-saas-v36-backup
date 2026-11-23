import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Pencil, RotateCcw, Trash2, X } from '@/lib/lucide-shim';
import { Button, Chip, Segmented, SummaryStrip, LABEL, INPUT, type Stat } from '../ui/kit';
import DateField from '../ui/DateField';
import { formatCurrency } from '../../lib/utils';
import type { ScheduleResult } from '../../lib/paymentSchedule';
import {
  addPosition, allocateConcession, concessionFor, daysOpen, issuesTotal, latestOffer, openDispute,
  removePosition, reopenDispute, settleDispute, withdrawDispute, type ProjectDispute,
} from '../../lib/disputes';
import '../projectHeader/projectHeader.css';

/*
  One dispute, in a window (DESIGN.md → "Modals"; built like AssignProjectsModal).

  Everything about the dispute lives here so Money itself stays a short card:
  what is held back, the items contested, each side's positions in order, and
  the buttons that move it on. An open dispute can take a position, be settled
  or be closed with nothing conceded. A closed one is read here and can be
  reopened; it then stays in this window, open, to be worked.
*/

const money = (v: number) => formatCurrency(Math.round(v));
const day = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const n = (v: string) => (v === '' ? 0 : Math.max(0, Number(v) || 0));

export const DisputeDetailModal: React.FC<{
  projectName: string;
  dispute: ProjectDispute;
  context: any;
  schedule: ScheduleResult | null;
  canAct: boolean;
  actor: string;
  setProjectContext: (fn: (prev: any) => any) => void;
  onEdit: () => void;
  onClose: () => void;
}> = ({ projectName, dispute: d, context, schedule, canAct, actor, setProjectContext, onEdit, onClose }) => {
  const [form, setForm] = useState<'position' | 'settle' | 'withdraw' | 'reopen' | null>(null);
  const [on, setOn] = useState(todayIso());
  const [by, setBy] = useState<'client' | 'studio'>('client');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [settled, setSettled] = useState({ execution: '', design: '' });
  const [noAdmission, setNoAdmission] = useState(true);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const isOpen = d.status === 'open';
  const acts = canAct && isOpen;
  const start = (f: 'position' | 'settle' | 'withdraw' | 'reopen') => {
    setOn(todayIso()); setNote(''); setAmount('');
    if (f === 'settle') setSettled({ execution: String(d.claimed.execution || ''), design: String(d.claimed.design || '') });
    setForm(f);
  };

  const claimed = d.claimed.execution + d.claimed.design;
  const issues = issuesTotal(d);
  const offer = latestOffer(d);
  const r = d.resolution;
  const draftSettled = { execution: n(settled.execution), design: n(settled.design) };
  const draftConcession = concessionFor(d.claimed, draftSettled);
  const landing = allocateConcession(context, schedule, draftConcession);
  const otherOpen = !isOpen && !!openDispute(context);

  const stats: Stat[] = [
    { label: 'Held back', value: money(claimed), tone: isOpen ? 'warn' : undefined, sub: `Execution ${money(d.claimed.execution)}, design ${money(d.claimed.design)}` },
    { label: 'Client wants off', value: issues.claimed > 0 ? money(issues.claimed) : 'Not said', sub: d.issues.length ? `${d.issues.length} item${d.issues.length === 1 ? '' : 's'}, ${money(issues.billed)} billed` : 'No items listed' },
    r
      ? { label: 'Settled at', value: money(r.settled.execution + r.settled.design), tone: 'good', sub: `${money(r.concession.execution + r.concession.design)} conceded${r.withoutAdmission ? ', without admission' : ''}` }
      : { label: 'Last amount offered', value: offer?.amount != null ? money(offer.amount) : 'None yet', sub: offer ? `${offer.by === 'client' ? 'Client' : 'Studio'}, ${day(offer.on)}` : 'Log each position below' },
    { label: isOpen ? 'Open for' : 'Lasted', value: `${daysOpen(d)} days`, sub: isOpen ? `Since ${day(d.openedOn)}` : `${day(d.openedOn)} to ${day(d.closedOn)}` },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 phd-scrim bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Dispute"
        className="relative phd-pop w-full max-w-5xl max-h-[92vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{projectName || 'Project'} · Payment dispute</p>
            <h3 className="text-xl font-bold text-slate-800 mt-0.5 flex flex-wrap items-center gap-2">{d.title}
              <Chip tone={isOpen ? 'warn' : d.status === 'settled' ? 'good' : 'slate'}>{isOpen ? 'In dispute' : d.status === 'settled' ? 'Settled' : 'Nothing conceded'}</Chip>
              {d.workStopped && <Chip tone="slate">Work stopped by client</Chip>}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">Raised by the {d.raisedBy} on {day(d.openedOn)}.{d.summary ? ` ${d.summary}` : ''}</p>
          </div>
          {acts && <Button variant="quiet" size="sm" icon={Pencil} onClick={onEdit}>Edit</Button>}
          <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
          <SummaryStrip stats={stats} />

          {!isOpen && (r?.reason || d.closedNote) && (
            <p className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600">
              <b className="text-slate-800">How it closed.</b> {r?.reason || d.closedNote}
              {r && <> Execution settled at {money(r.settled.execution)} of {money(d.claimed.execution)}, design at {money(r.settled.design)} of {money(d.claimed.design)}.</>}
            </p>
          )}

          {d.issues.length > 0 && (
            <div>
              <p className={LABEL}>Items in dispute</p>
              <div className="mt-1.5 rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                {d.issues.map((i, k) => (
                  <div key={i.id} className="hud-row-in grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-4 px-3 py-2" style={{ animationDelay: `${Math.min(k, 6) * 30}ms` }}>
                    <p className="min-w-0"><span className="font-semibold text-slate-800">{i.title}</span>{i.ref && <span className="block text-[11px] text-slate-500">{i.ref}</span>}</p>
                    <p className="w-24 text-right tabular-nums text-slate-600">{i.billed ? money(i.billed) : ''}<span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Billed</span></p>
                    <p className="w-24 text-right tabular-nums font-bold text-slate-800">{money(i.claimed)}<span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Asked off</span></p>
                    <p className="w-24 text-right tabular-nums text-slate-600">{i.billed ? money(Math.max(0, i.billed - i.claimed)) : ''}<span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Would pay</span></p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className={LABEL}>Positions</p>
            {d.positions.length === 0
              ? <p className="mt-1.5 text-xs text-slate-500">{isOpen ? 'Nothing logged yet. Add each email, call or proposal as it happens, with the amount on the table.' : 'None were logged.'}</p>
              : (
                <ol className="mt-1.5 rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {d.positions.map((p) => (
                    <li key={p.id} className="flex items-start gap-3 px-3 py-2">
                      <span className="w-24 shrink-0 text-[11px] text-slate-500 tabular-nums pt-0.5">{day(p.on)}</span>
                      <Chip tone={p.by === 'client' ? 'slate' : 'brand'}>{p.by === 'client' ? 'Client' : 'Studio'}</Chip>
                      <p className="flex-1 min-w-0 text-sm text-slate-700">{p.note}</p>
                      {p.amount != null && <b className="text-sm text-slate-800 tabular-nums">{money(p.amount)}</b>}
                      {acts && <button type="button" aria-label="Remove position" onClick={() => setProjectContext((prev: any) => removePosition(prev, d.id, p.id))} className="w-6 h-6 grid place-items-center rounded text-slate-300 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </li>
                  ))}
                </ol>
              )}
          </div>

          {form === 'position' && (
            <div className="hud-swap rounded-xl border border-slate-200 p-3 flex flex-wrap items-end gap-3">
              <label><span className={LABEL}>On</span><div className="mt-1.5"><DateField value={on} onChange={setOn} /></div></label>
              <div><p className={LABEL}>From</p><div className="mt-1.5"><Segmented label="Position from" size="sm" value={by} onChange={setBy} options={[{ id: 'client', label: 'Client' }, { id: 'studio', label: 'Studio' }]} /></div></div>
              <label className="flex-1 min-w-[220px]"><span className={LABEL}>What was said</span>
                <input className={`${INPUT} mt-1.5`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: itemised deductions on five BOQ lines; will pay at once if agreed" /></label>
              <label><span className={LABEL}>Would pay (optional)</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">₹<input type="number" min={0} step={100} className={`${INPUT} w-32 text-right tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Total" /></span></label>
              <Button variant="secondary" size="sm" onClick={() => setForm(null)}>Cancel</Button>
              <Button variant="primary" size="sm" icon={Check} disabled={!on || (!note.trim() && amount === '')}
                onClick={() => { setProjectContext((prev: any) => addPosition(prev, d.id, { on, by, note, amount: amount === '' ? null : n(amount) }, actor)); setForm(null); }}>Save position</Button>
            </div>
          )}
          {form === 'settle' && (
            <div className="hud-swap rounded-xl border border-slate-200 p-3 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <label><span className={LABEL}>Execution settled at</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">₹<input type="number" min={0} step={100} className={`${INPUT} w-36 text-right tabular-nums`} value={settled.execution} onChange={(e) => setSettled((s) => ({ ...s, execution: e.target.value }))} placeholder="0" /></span>
                  <span className="block text-[11px] text-slate-500 mt-1 tabular-nums">of {money(d.claimed.execution)} held back</span></label>
                <label><span className={LABEL}>Design fee settled at</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">₹<input type="number" min={0} step={100} className={`${INPUT} w-36 text-right tabular-nums`} value={settled.design} onChange={(e) => setSettled((s) => ({ ...s, design: e.target.value }))} placeholder="0" /></span>
                  <span className="block text-[11px] text-slate-500 mt-1 tabular-nums">of {money(d.claimed.design)} held back</span></label>
                <label><span className={LABEL}>Agreed on</span><div className="mt-1.5"><DateField value={on} onChange={setOn} /></div></label>
                <p className="flex-1 min-w-[180px] text-right text-sm text-slate-600">Studio concedes
                  <b className="block text-xl font-black text-slate-800 tabular-nums">{money(draftConcession.execution + draftConcession.design)}</b>
                  <span className="block text-[11px] text-slate-500 tabular-nums">Client pays {money(draftSettled.execution + draftSettled.design)}</span></p>
              </div>
              <label className="block"><span className={LABEL}>Reason, as it will read on the invoices</span>
                <input className={`${INPUT} mt-1.5`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Dispute settlement: ${d.title}`} /></label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" className="accent-[#3D52A0]" checked={noAdmission} onChange={(e) => setNoAdmission(e.target.checked)} />
                Full and final, without admission: neither side accepts the other's account
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <p className="flex-1 min-w-[220px] text-[11px] text-slate-500">
                  {draftConcession.execution + draftConcession.design === 0 ? 'Nothing is conceded at these amounts.'
                    : landing.unallocated > 0 ? `${money(landing.unallocated)} of the concession has no unpaid invoice to sit on; it is kept on the dispute record only.`
                      : `The concession goes onto ${landing.appliedTo.length} unpaid invoice${landing.appliedTo.length === 1 ? '' : 's'}. Mark them received on the board when the money comes in.`}
                </p>
                <Button variant="secondary" size="sm" onClick={() => setForm(null)}>Cancel</Button>
                <Button variant="primary" size="sm" icon={Check} disabled={!on}
                  onClick={() => { setProjectContext((prev: any) => settleDispute(prev, d.id, schedule, { settled: draftSettled, on, reason: note, withoutAdmission: noAdmission, actor })); onClose(); }}>Settle dispute</Button>
              </div>
            </div>
          )}
          {form === 'withdraw' && (
            <div className="hud-swap rounded-xl border border-slate-200 p-3 flex flex-wrap items-end gap-3">
              <label><span className={LABEL}>Closed on</span><div className="mt-1.5"><DateField value={on} onChange={setOn} /></div></label>
              <label className="flex-1 min-w-[220px]"><span className={LABEL}>How it ended</span>
                <input className={`${INPUT} mt-1.5`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: client accepted the bill after the rectification visit" /></label>
              <Button variant="secondary" size="sm" onClick={() => setForm(null)}>Cancel</Button>
              <Button variant="primary" size="sm" icon={Check} disabled={!on} onClick={() => { setProjectContext((prev: any) => withdrawDispute(prev, d.id, { on, note, actor })); onClose(); }}>Close dispute</Button>
            </div>
          )}
          {form === 'reopen' && (
            <div className="hud-swap rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-3">
              <p className="flex-1 min-w-[220px] text-xs text-slate-600">
                Reopening puts this dispute back in progress{r?.appliedTo?.length ? ` and takes its concession of ${money(r.appliedTo.reduce((s, a) => s + a.amount, 0))} back off the invoices` : ''}. The settlement recorded here is dropped; you can settle it again in this window.
              </p>
              <Button variant="secondary" size="sm" onClick={() => setForm(null)}>Keep it closed</Button>
              <Button variant="danger" size="sm" icon={RotateCcw} onClick={() => { setProjectContext((prev: any) => reopenDispute(prev, d.id, actor)); setForm(null); }}>Reopen dispute</Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
          {acts && !form && (
            <>
              <Button variant="secondary" size="sm" icon={Plus} onClick={() => start('position')}>Add a position</Button>
              <Button variant="quiet" size="sm" onClick={() => start('withdraw')}>Close with nothing conceded</Button>
            </>
          )}
          {canAct && !isOpen && !form && (
            <Button variant="quiet" size="sm" icon={RotateCcw} disabled={otherOpen} title={otherOpen ? 'Another dispute is open on this project' : undefined} onClick={() => start('reopen')}>Reopen dispute</Button>
          )}
          <p className="flex-1 min-w-[160px] text-[11px] text-slate-500">
            {isOpen ? 'The invoices stay as they are, and out of the overdue chase, until the dispute is settled.' : 'This dispute is closed. It is kept here as a record.'}
          </p>
          <Button variant="secondary" size="sm" onClick={onClose}>Close window</Button>
          {acts && !form && <Button variant="primary" size="sm" icon={Check} onClick={() => start('settle')}>Settle dispute</Button>}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DisputeDetailModal;
