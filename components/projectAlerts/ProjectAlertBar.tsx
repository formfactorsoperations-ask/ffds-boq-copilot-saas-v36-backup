import React, { useMemo, useState } from 'react';
import { Scale, ShieldOff } from '@/lib/lucide-shim';
import { Button, Chip } from '../ui/kit';
import { formatCurrency } from '../../lib/utils';
import { computeSchedule, type ScheduleResult } from '../../lib/paymentSchedule';
import { holdsFinanceRole, seesStudioFinance } from '../../lib/roleAccess';
import type { RoleSet } from '../../lib/roles';
import { isTerminated, reasonLabel, settlementLine, type ProjectTermination } from '../../lib/termination';
import { daysOpen, disputesOf, editDispute, openDispute, outstandingByTrack } from '../../lib/disputes';
import TerminationDetailModal from '../termination/TerminationDetailModal';
import DisputeDetailModal from '../disputes/DisputeDetailModal';
import DisputeModal from '../disputes/DisputeModal';

/*
  The strip under the project header, on every screen of the project.

  A terminated project, or one with a payment dispute open, is the first
  thing anyone working on it should know, whichever screen they are on. It
  used to be a card at the top of Money, which nobody on Drawings or the
  Timeline ever saw. The strip says it in one line; the detail and its
  buttons open in a window (TerminationDetailModal, DisputeDetailModal).

  Everyone on the studio's side sees that the project is terminated or in
  dispute. The amounts, and the window, are for those who see the studio's
  money (lib/roleAccess).
*/

const money = (v: number) => formatCurrency(Math.round(v));
const day = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const Strip: React.FC<{ icon: React.ElementType; chip: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }> = ({ icon: Icon, chip, children, action }) => (
  <div className="hud-row-in flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 sm:px-5 py-2 bg-white border-b border-slate-200 min-w-0">
    <Icon className="w-4 h-4 text-slate-500 shrink-0" aria-hidden />
    {chip}
    <p className="flex-1 min-w-[180px] text-xs text-slate-600 truncate">{children}</p>
    {action}
  </div>
);

export const ProjectAlertBar: React.FC<{
  context: any;
  setProjectContext?: (fn: (prev: any) => any) => void;
  /** The billed option's summary, so the windows price the schedule as Money does. */
  tierSummary?: { totalSell?: number; designFee?: number };
  role?: RoleSet;
  actor: string;
}> = ({ context, setProjectContext, tierSummary, role, actor }) => {
  const terminated = isTerminated(context);
  const t: ProjectTermination | null = terminated ? context.termination : null;
  const dispute = openDispute(context);
  const [win, setWin] = useState<'termination' | 'dispute' | 'edit-dispute' | null>(null);
  /* The dispute in the window, by id, so it stays put through an edit. */
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const viewedDispute = disputeId ? disputesOf(context).find((d) => d.id === disputeId) || null : null;

  const active = terminated || !!dispute || !!viewedDispute;
  const schedule: ScheduleResult | null = useMemo(() => {
    if (!active) return null;
    try { return computeSchedule({ context, tierSummary }); } catch { return null; }
  }, [active, context, tierSummary]);

  if (!active) return null;
  const seesMoney = seesStudioFinance(role);
  const canAct = holdsFinanceRole(role) && !!setProjectContext;
  const write = setProjectContext || (() => {});
  const name = String(context?.name || context?.clientName || 'Project');
  const line = t ? settlementLine(t.settlement) : null;
  const settlementOpen = !!t && t.settlement.status === 'open' && line!.kind !== 'even';

  return (
    <div className="shrink-0 relative z-20">
      {t && (
        <Strip icon={ShieldOff} chip={<Chip tone="bad">Project terminated</Chip>}
          action={seesMoney ? <Button size="sm" variant={settlementOpen ? 'primary' : 'secondary'} onClick={() => setWin('termination')}>View settlement</Button> : undefined}>
          <b className="text-slate-800">{reasonLabel(t.reason)}.</b> Ended {day(t.effectiveOn)}.
          {seesMoney && <> {line!.kind === 'even' ? 'Nothing to refund and nothing owed.' : `${line!.text}: ${money(line!.amount)}.`}</>}
          {' '}Client portal closed, payment schedule frozen.
        </Strip>
      )}
      {dispute && (
        <Strip icon={Scale} chip={<Chip tone="warn">Payment dispute</Chip>}
          action={seesMoney ? <Button size="sm" variant={t ? 'secondary' : 'primary'} onClick={() => { setDisputeId(dispute.id); setWin('dispute'); }}>Open dispute</Button> : undefined}>
          <b className="text-slate-800">{dispute.title}.</b>
          {seesMoney && <> {money(dispute.claimed.execution + dispute.claimed.design)} held back.</>}
          {' '}Open {daysOpen(dispute)} day{daysOpen(dispute) === 1 ? '' : 's'}, since {day(dispute.openedOn)}.{dispute.workStopped ? ' Client has stopped work on site.' : ''}
        </Strip>
      )}
      {win === 'termination' && t && (
        <TerminationDetailModal projectName={name} termination={t} context={context} schedule={schedule} canAct={canAct} actor={actor}
          setProjectContext={write} onClose={() => setWin(null)} />
      )}
      {win === 'dispute' && viewedDispute && (
        <DisputeDetailModal projectName={name} dispute={viewedDispute} context={context} schedule={schedule} canAct={canAct && !terminated} actor={actor}
          setProjectContext={write} onEdit={() => setWin('edit-dispute')} onClose={() => { setWin(null); setDisputeId(null); }} />
      )}
      {win === 'edit-dispute' && viewedDispute && (
        <DisputeModal projectName={name} outstanding={outstandingByTrack(context, schedule)} existing={viewedDispute} onClose={() => setWin('dispute')}
          onSave={(draft) => { write((prev: any) => editDispute(prev, viewedDispute.id, draft)); setWin('dispute'); }} />
      )}
    </div>
  );
};

export default ProjectAlertBar;
