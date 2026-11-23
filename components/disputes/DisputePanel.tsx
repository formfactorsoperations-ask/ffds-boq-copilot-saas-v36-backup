import React, { useMemo, useState } from 'react';
import { Check, Plus, Scale, Pencil, RotateCcw, Trash2 } from '@/lib/lucide-shim';
import { Panel, Button, Chip, Segmented, SummaryStrip, LABEL, INPUT, type Stat } from '../ui/kit';
import DateField from '../ui/DateField';
import { formatCurrency } from '../../lib/utils';
import type { ScheduleResult } from '../../lib/paymentSchedule';
import {
  addPosition, allocateConcession, concessionFor, daysOpen, disputesOf, editDispute, issuesTotal, latestOffer, openDispute,
  outstandingByTrack, raiseDispute, removePosition, reopenDispute, settleDispute, withdrawDispute, type ProjectDispute,
} from '../../lib/disputes';
import DisputeModal from './DisputeModal';

/*
  The dispute card on Money.

  With nothing in dispute it is one quiet row at the foot of the screen. With
  a dispute open it leads the screen: what is held back, the items contested,
  each side's positions in order, and the settlement that closes it. Built
  from the screen kit (DESIGN.md).
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

export const DisputePanel: React.FC<{
  context: any;
  schedule: ScheduleResult | null;
  /** Only the people who run the studio's money may raise, settle or reopen. */
  canAct: boolean;
  actor: string;
  setProjectContext: (fn: (prev: any) => any) => void;
  /** 'lead' shows the open dispute (top of Money); 'foot' shows the way in and the past ones. */
  slot: 'lead' | 'foot';
}> = ({ context, schedule, canAct, actor, setProjectContext, slot }) => {
  const open = openDispute(context);
  const past = disputesOf(context).filter((d) => d.status !== 'open');
  const outstanding = useMemo(() => outstandingByTrack(context, schedule), [context, schedule]);
  const name = String(context?.name || context?.clientName || 'Project');
  const [modal, setModal] = useState<'raise' | 'edit' | null>(null);
  const [form, setForm] = useState<'position' | 'settle' | 'withdraw' | null>(null);
  const [on, setOn] = useState(todayIso());
  const [by, setBy] = useState<'client' | 'studio'>('client');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [settled, setSettled] = useState({ execution: '', design: '' });
  const [noAdmission, setNoAdmission] = useState(true);

  const start = (f: 'position' | 'settle' | 'withdraw', d: ProjectDispute) => {
    setOn(todayIso()); setNote(''); setAmount('');
    if (f === 'settle') setSettled({ execution: String(d.claimed.execution || ''), design: String(d.claimed.design || '') });
    setForm(f);
  };

  if (slot === 'foot') {
    if (open || (!canAct && !past.length)) return null;
    return (
      <>
        <Panel as="h3" icon={Scale} title="Payment dispute"
          blurb="For a client holding back payment over the work or the bill. Track what is contested and each side's position, then settle it: the concession goes onto the unpaid invoices."
          aside={canAct ? <Button variant="secondary" size="sm" onClick={() => setModal('raise')}>Raise a dispute</Button> : undefined}>
          {past.length > 0 && (
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {past.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-semibold text-slate-800 flex flex-wrap items-center gap-2">{d.title}<Chip tone={d.status === 'settled' ? 'good' : 'slate'}>{d.status === 'settled' ? 'Settled' : 'Nothing conceded'}</Chip></p>
                    <p className="text-[11px] text-slate-500 tabular-nums">{day(d.openedOn)} to {day(d.closedOn)}, {daysOpen(d)} days.{d.resolution ? ` ${money(d.claimed.execution + d.claimed.design)} claimed, settled at ${money(d.resolution.settled.execution + d.resolution.settled.design)}; ${money(d.resolution.concession.execution + d.resolution.concession.design)} conceded.` : d.closedNote ? ` ${d.closedNote}` : ''}</p>
                  </div>
                  {canAct && <Button variant="quiet" size="sm" icon={RotateCcw} onClick={() => setProjectContext((prev: any) => reopenDispute(prev, d.id, actor))} title={d.resolution ? 'Takes the concession back off the invoices' : undefined}>Reopen</Button>}
                </div>
              ))}
            </div>
          )}
        </Panel>
        {modal === 'raise' && (
          <DisputeModal projectName={name} outstanding={outstanding} onClose={() => setModal(null)}
            onSave={(d) => { setProjectContext((prev: any) => raiseDispute(prev, d, actor)); setModal(null); }} />
        )}
      </>
    );
  }

  if (!open) return null;
  const d = open;
  const claimed = d.claimed.execution + d.claimed.design;
  const issues = issuesTotal(d);
  const offer = latestOffer(d);
  const draftSettled = { execution: n(settled.execution), design: n(settled.design) };
  const draftConcession = concessionFor(d.claimed, draftSettled);
  const landing = allocateConcession(context, schedule, draftConcession);
  const stats: Stat[] = [
    { label: 'Held back', value: money(claimed), tone: 'warn', sub: `Execution ${money(d.claimed.execution)}, design ${money(d.claimed.design)}` },
    { label: 'Client wants off', value: issues.claimed > 0 ? money(issues.claimed) : 'Not said', sub: d.issues.length ? `${d.issues.length} item${d.issues.length === 1 ? '' : 's'}, ${money(issues.billed)} billed` : 'No items listed' },
    { label: 'Last amount offered', value: offer?.amount != null ? money(offer.amount) : 'None yet', sub: offer ? `${offer.by === 'client' ? 'Client' : 'Studio'}, ${day(offer.on)}` : 'Log each position below' },
    { label: 'Open for', value: `${daysOpen(d)} days`, sub: `Since ${day(d.openedOn)}` },
  ];

  return (
    <>
      <Panel icon={Scale} title={d.title}
        badge={<><Chip tone="warn">In dispute</Chip>{d.workStopped && <Chip tone="slate">Work stopped by client</Chip>}</>}
        blurb={<>Raised by the {d.raisedBy} on {day(d.openedOn)}.{d.summary ? ` ${d.summary}` : ''}</>}
        aside={canAct ? <Button variant="quiet" size="sm" icon={Pencil} onClick={() => setModal('edit')}>Edit</Button> : undefined}
        foot="The invoices stay as they are until the dispute is settled. Settling writes the concession onto the unpaid invoices, so Money, the client's figures and the reports read the settled amount."
      >
        <SummaryStrip stats={stats} />

        {d.issues.length > 0 && (
          <div className="mt-4">
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

        <div className="mt-4">
          <p className={LABEL}>Positions</p>
          {d.positions.length === 0
            ? <p className="mt-1.5 text-xs text-slate-500">Nothing logged yet. Add each email, call or proposal as it happens, with the amount on the table.</p>
            : (
              <ol className="mt-1.5 rounded-xl border border-slate-200 divide-y divide-slate-100">
                {d.positions.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 px-3 py-2">
                    <span className="w-24 shrink-0 text-[11px] text-slate-500 tabular-nums pt-0.5">{day(p.on)}</span>
                    <Chip tone={p.by === 'client' ? 'slate' : 'brand'}>{p.by === 'client' ? 'Client' : 'Studio'}</Chip>
                    <p className="flex-1 min-w-0 text-sm text-slate-700">{p.note}</p>
                    {p.amount != null && <b className="text-sm text-slate-800 tabular-nums">{money(p.amount)}</b>}
                    {canAct && <button type="button" aria-label="Remove position" onClick={() => setProjectContext((prev: any) => removePosition(prev, d.id, p.id))} className="w-6 h-6 grid place-items-center rounded text-slate-300 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </li>
                ))}
              </ol>
            )}
        </div>

        {canAct && (
          <div className="mt-4 space-y-3">
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
                    onClick={() => { setProjectContext((prev: any) => settleDispute(prev, d.id, schedule, { settled: draftSettled, on, reason: note, withoutAdmission: noAdmission, actor })); setForm(null); }}>Settle dispute</Button>
                </div>
              </div>
            )}
            {form === 'withdraw' && (
              <div className="hud-swap rounded-xl border border-slate-200 p-3 flex flex-wrap items-end gap-3">
                <label><span className={LABEL}>Closed on</span><div className="mt-1.5"><DateField value={on} onChange={setOn} /></div></label>
                <label className="flex-1 min-w-[220px]"><span className={LABEL}>How it ended</span>
                  <input className={`${INPUT} mt-1.5`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: client accepted the bill after the rectification visit" /></label>
                <Button variant="secondary" size="sm" onClick={() => setForm(null)}>Cancel</Button>
                <Button variant="primary" size="sm" icon={Check} disabled={!on} onClick={() => { setProjectContext((prev: any) => withdrawDispute(prev, d.id, { on, note, actor })); setForm(null); }}>Close dispute</Button>
              </div>
            )}
            {!form && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" icon={Plus} onClick={() => start('position', d)}>Add a position</Button>
                <Button variant="quiet" size="sm" onClick={() => start('withdraw', d)}>Close with nothing conceded</Button>
                <span className="flex-1" />
                <Button variant="primary" size="sm" icon={Check} onClick={() => start('settle', d)}>Settle dispute</Button>
              </div>
            )}
          </div>
        )}
      </Panel>
      {modal === 'edit' && (
        <DisputeModal projectName={name} outstanding={outstanding} existing={d} onClose={() => setModal(null)}
          onSave={(draft) => { setProjectContext((prev: any) => editDispute(prev, d.id, draft)); setModal(null); }} />
      )}
    </>
  );
};

export default DisputePanel;
