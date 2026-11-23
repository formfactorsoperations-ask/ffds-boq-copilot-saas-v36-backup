import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, RotateCcw, SlidersHorizontal, X } from '@/lib/lucide-shim';
import { Button, Chip, SummaryStrip, LABEL, INPUT, type Stat } from '../ui/kit';
import DateField from '../ui/DateField';
import { formatCurrency } from '../../lib/utils';
import type { ScheduleResult } from '../../lib/paymentSchedule';
import {
  reasonLabel, reinstateProject, reviseSettlement, settleTermination, settlementInputs, settlementLine, stageWhenEnded,
  type ProjectTermination,
} from '../../lib/termination';
import TerminateProjectModal from './TerminateProjectModal';
import '../projectHeader/projectHeader.css';

/*
  A terminated project's settlement, in a window (DESIGN.md → "Modals"; built
  like AssignProjectsModal). Opened from the strip under the project header
  (components/projectAlerts/ProjectAlertBar), which is on every screen of the
  project, so the settlement is one click from anywhere and Money is left to
  be Money. Why it ended, what the studio keeps, and the refund or balance
  still to move, with the buttons that record it.
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

export const TerminationDetailModal: React.FC<{
  projectName: string;
  termination: ProjectTermination;
  context: any;
  schedule: ScheduleResult | null;
  /** Only the people who run the studio's money may settle, change or reopen. */
  canAct: boolean;
  actor: string;
  setProjectContext: (fn: (prev: any) => any) => void;
  onClose: () => void;
}> = ({ projectName, termination: t, context, schedule, canAct, actor, setProjectContext, onClose }) => {
  const [form, setForm] = useState<'record' | 'reopen' | null>(null);
  const [revising, setRevising] = useState(false);
  const [on, setOn] = useState(todayIso());
  const [note, setNote] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !revising) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, revising]);

  /* The settlement is measured against the money as it stood the day the project ended. */
  const inputs = useMemo(() => {
    const live = settlementInputs(context, schedule);
    return { ...live, collected: t.settlement.collected, invoicedUnpaid: t.settlement.invoicedUnpaid, designGross: t.settlement.designGross, executionGross: t.settlement.executionGross };
  }, [context, schedule, t]);

  const s = t.settlement;
  const line = settlementLine(s);
  const open = s.status === 'open' && line.kind !== 'even';
  const stats: Stat[] = [
    { label: 'Studio keeps', value: money(s.entitled), sub: s.basis === 'prorata' ? `Design ${s.designDonePct}% done${s.executionGross > 0 ? `, execution ${s.executionDonePct}%` : ''}${s.charges ? `, plus ${money(s.charges)} charges` : ''}` : s.basis === 'keep_paid' ? 'Everything paid so far' : s.basis === 'refund_all' ? 'Refunded in full' : 'Amount set by the studio' },
    { label: 'Collected', value: money(s.collected), sub: 'Up to the day it ended' },
    {
      label: line.kind === 'refund' ? 'Refund to the client' : line.kind === 'balance' ? 'Balance from the client' : 'To settle',
      value: money(line.amount),
      tone: line.kind === 'even' || s.status === 'settled' ? 'good' : s.status === 'waived' ? 'slate' : 'warn',
      sub: line.kind === 'even' ? 'Nothing to move'
        : s.status === 'settled' ? `${line.kind === 'refund' ? 'Paid' : 'Received'} ${day(s.settledOn)}`
          : s.status === 'waived' ? `${line.kind === 'refund' ? 'Waived' : 'Written off'} ${day(s.settledOn)}`
            : line.kind === 'refund' ? 'Still to be paid back' : 'Still to come in',
    },
  ];

  const record = (status: 'settled' | 'waived' | 'open') => {
    setProjectContext((prev: any) => settleTermination(prev, { status, on, note, actor }));
    setForm(null);
    setNote('');
  };

  if (revising) {
    return (
      <TerminateProjectModal projectName={projectName} inputs={inputs} portalLogins={0} existing={t} onClose={() => setRevising(false)}
        onConfirm={(p) => { setProjectContext((prev: any) => reviseSettlement(prev, p.settlement, actor)); setRevising(false); }} />
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 phd-scrim bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Termination settlement"
        className="relative phd-pop w-full max-w-4xl max-h-[92vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">{projectName || 'Project'} · Terminated</p>
            <h3 className="text-xl font-bold text-slate-800 mt-0.5 flex flex-wrap items-center gap-2">{reasonLabel(t.reason)}
              <Chip tone={open ? 'warn' : 'slate'}>{open ? 'Settlement open' : 'Settled'}</Chip>
              <Chip tone="slate">{t.initiatedBy === 'client' ? 'By the client' : 'By the studio'}</Chip>
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">Ended {day(t.effectiveOn)}{stageWhenEnded(t) ? `, while ${stageWhenEnded(t)}` : ''}. Recorded by {t.by}.{t.note ? ` ${t.note}` : ''}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
          <SummaryStrip stats={stats} />
          <p className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600">
            The client portal is closed and the payment schedule is frozen. Reports count what the studio keeps, not the full contract.
            {s.invoicedUnpaid > 0 ? ` Invoices of ${money(s.invoicedUnpaid)} were unpaid at the time: cancel them in your accounts.` : ''}
          </p>
          {form === 'record' && (
            <div className="hud-swap rounded-xl border border-slate-200 p-3 flex flex-wrap items-end gap-3">
              <label><span className={LABEL}>{line.kind === 'refund' ? 'Refund paid on' : 'Balance received on'}</span>
                <div className="mt-1.5"><DateField value={on} onChange={setOn} /></div></label>
              <label className="flex-1 min-w-[220px]"><span className={LABEL}>Note (optional)</span>
                <input className={`${INPUT} mt-1.5`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: bank transfer, reference 4471" /></label>
              <Button variant="secondary" size="sm" onClick={() => setForm(null)}>Cancel</Button>
              <Button variant="secondary" size="sm" onClick={() => record('waived')} title={line.kind === 'refund' ? 'The client is not taking the refund' : 'The studio is not collecting the balance'}>{line.kind === 'refund' ? 'Client waived it' : 'Write it off'}</Button>
              <Button variant="primary" size="sm" icon={Check} disabled={!on} onClick={() => record('settled')}>{line.kind === 'refund' ? 'Save refund paid' : 'Save balance received'}</Button>
            </div>
          )}
          {form === 'reopen' && (
            <div className="hud-swap rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-3">
              <p className="flex-1 min-w-[220px] text-xs text-slate-600">Reopening puts the project back to where it stood and drops this settlement. The portal stays closed until you send it again and give the logins back.</p>
              <Button variant="secondary" size="sm" onClick={() => setForm(null)}>Keep it terminated</Button>
              <Button variant="danger" size="sm" icon={RotateCcw} onClick={() => { setProjectContext((prev: any) => reinstateProject(prev, actor)); onClose(); }}>Reopen project</Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
          {canAct && !form && (
            <>
              <Button variant="quiet" size="sm" icon={RotateCcw} onClick={() => setForm('reopen')}>Reopen project</Button>
              <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => setRevising(true)}>Change settlement</Button>
              {line.kind !== 'even' && s.status !== 'open' && <Button variant="secondary" size="sm" onClick={() => record('open')}>Mark as not settled</Button>}
            </>
          )}
          <span className="flex-1" />
          <Button variant="secondary" size="sm" onClick={onClose}>Close window</Button>
          {canAct && !form && open && <Button variant="primary" size="sm" icon={Check} onClick={() => { setOn(todayIso()); setForm('record'); }}>{line.kind === 'refund' ? 'Record refund paid' : 'Record balance received'}</Button>}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TerminationDetailModal;
