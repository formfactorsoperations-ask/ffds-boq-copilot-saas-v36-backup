import React, { useMemo, useState } from 'react';
import { Check, RotateCcw, ShieldOff, SlidersHorizontal } from '@/lib/lucide-shim';
import { Panel, Button, Chip, SummaryStrip, LABEL, INPUT, type Stat } from '../ui/kit';
import DateField from '../ui/DateField';
import { formatCurrency } from '../../lib/utils';
import type { ScheduleResult } from '../../lib/paymentSchedule';
import { clientPeople } from '../../lib/clientContacts';
import {
  isTerminated, reasonLabel, reinstateProject, reviseSettlement, settleTermination, settlementInputs, settlementLine,
  type ProjectTermination,
} from '../../lib/termination';
import TerminateProjectModal, { type TerminatePayload } from './TerminateProjectModal';

/*
  The termination card on Money.

  On a live project it is one quiet row at the foot of the screen: the way in.
  On a terminated project it leads the screen: why it ended, what the studio
  keeps, and the refund or balance still to move, with the buttons that
  record it. Built from the screen kit (DESIGN.md).
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

export const TerminationPanel: React.FC<{
  context: any;
  schedule: ScheduleResult | null;
  /** Only the people who run the studio's money may terminate, settle or reopen. */
  canAct: boolean;
  actor: string;
  setProjectContext: (fn: (prev: any) => any) => void;
  /** Terminates the open project: saves it and closes the client portal. */
  onTerminate?: (p: TerminatePayload) => Promise<void> | void;
}> = ({ context, schedule, canAct, actor, setProjectContext, onTerminate }) => {
  const terminated = isTerminated(context);
  const t: ProjectTermination | null = terminated ? context.termination : null;
  const [modal, setModal] = useState<'terminate' | 'revise' | null>(null);
  const [recording, setRecording] = useState(false);
  const [on, setOn] = useState(todayIso());
  const [note, setNote] = useState('');
  const [confirmReopen, setConfirmReopen] = useState(false);

  const inputs = useMemo(() => {
    const live = settlementInputs(context, schedule);
    /* Once terminated, the settlement is measured against the money as it stood that day. */
    return t ? { ...live, collected: t.settlement.collected, invoicedUnpaid: t.settlement.invoicedUnpaid, designGross: t.settlement.designGross, executionGross: t.settlement.executionGross } : live;
  }, [context, schedule, t]);
  const portalLogins = useMemo(() => clientPeople(context).filter((p) => p.portal === 'on').length, [context]);
  const name = String(context?.name || context?.clientName || 'Project');

  if (!terminated) {
    if (!canAct || !onTerminate) return null;
    return (
      <>
        <Panel as="h3" icon={ShieldOff} title="End this project early"
          blurb="For a project that stops before it is finished: the agreement was never signed, the client asked to stop, or the studio had to. Settles the money and closes the client portal."
          aside={<Button variant="danger" size="sm" onClick={() => setModal('terminate')}>Terminate project</Button>} />
        {modal === 'terminate' && (
          <TerminateProjectModal projectName={name} inputs={inputs} portalLogins={portalLogins} onClose={() => setModal(null)}
            onConfirm={async (p) => { await onTerminate(p); setModal(null); }} />
        )}
      </>
    );
  }

  const s = t!.settlement;
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
    setRecording(false);
    setNote('');
  };

  return (
    <>
      <Panel icon={ShieldOff} title="Project terminated"
        badge={<Chip tone={open ? 'warn' : 'slate'}>{open ? 'Settlement open' : 'Settled'}</Chip>}
        blurb={<>{reasonLabel(t!.reason)}. Ended {day(t!.effectiveOn)}, recorded by {t!.by}.{t!.note ? ` ${t!.note}` : ''}</>}
        foot={<>The client portal is closed and the payment schedule is frozen. Reports count what the studio keeps, not the full contract.{s.invoicedUnpaid > 0 ? ` Invoices of ${money(s.invoicedUnpaid)} were unpaid at the time: cancel them in your accounts.` : ''}</>}
      >
        <SummaryStrip stats={stats} />
        {canAct && (
          <div className="mt-4 space-y-3">
            {recording && (
              <div className="hud-swap rounded-xl border border-slate-200 p-3 flex flex-wrap items-end gap-3">
                <label><span className={LABEL}>{line.kind === 'refund' ? 'Refund paid on' : 'Balance received on'}</span>
                  <div className="mt-1.5"><DateField value={on} onChange={setOn} /></div></label>
                <label className="flex-1 min-w-[220px]"><span className={LABEL}>Note (optional)</span>
                  <input className={`${INPUT} mt-1.5`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: bank transfer, reference 4471" /></label>
                <Button variant="secondary" size="sm" onClick={() => setRecording(false)}>Cancel</Button>
                <Button variant="secondary" size="sm" onClick={() => record('waived')} title={line.kind === 'refund' ? 'The client is not taking the refund' : 'The studio is not collecting the balance'}>{line.kind === 'refund' ? 'Client waived it' : 'Write it off'}</Button>
                <Button variant="primary" size="sm" icon={Check} disabled={!on} onClick={() => record('settled')}>{line.kind === 'refund' ? 'Save refund paid' : 'Save balance received'}</Button>
              </div>
            )}
            {confirmReopen && (
              <div className="hud-swap rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-3">
                <p className="flex-1 min-w-[220px] text-xs text-slate-600">Reopening puts the project back to where it stood and drops this settlement. The portal stays closed until you send it again and give the logins back.</p>
                <Button variant="secondary" size="sm" onClick={() => setConfirmReopen(false)}>Keep it terminated</Button>
                <Button variant="danger" size="sm" onClick={() => { setProjectContext((prev: any) => reinstateProject(prev, actor)); setConfirmReopen(false); }}>Reopen project</Button>
              </div>
            )}
            {!recording && !confirmReopen && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="quiet" size="sm" icon={RotateCcw} onClick={() => setConfirmReopen(true)}>Reopen project</Button>
                <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => setModal('revise')}>Change settlement</Button>
                {line.kind !== 'even' && s.status !== 'open' && <Button variant="secondary" size="sm" onClick={() => record('open')}>Mark as not settled</Button>}
                <span className="flex-1" />
                {open && <Button variant="primary" size="sm" icon={Check} onClick={() => { setOn(todayIso()); setRecording(true); }}>{line.kind === 'refund' ? 'Record refund paid' : 'Record balance received'}</Button>}
              </div>
            )}
          </div>
        )}
      </Panel>
      {modal === 'revise' && (
        <TerminateProjectModal projectName={name} inputs={inputs} portalLogins={0} existing={t} onClose={() => setModal(null)}
          onConfirm={(p) => { setProjectContext((prev: any) => reviseSettlement(prev, p.settlement, actor)); setModal(null); }} />
      )}
    </>
  );
};

export default TerminationPanel;
