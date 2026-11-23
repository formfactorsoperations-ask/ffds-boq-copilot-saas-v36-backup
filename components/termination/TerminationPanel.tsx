import React, { useMemo, useState } from 'react';
import { ShieldOff } from '@/lib/lucide-shim';
import { Panel, Button } from '../ui/kit';
import type { ScheduleResult } from '../../lib/paymentSchedule';
import { clientPeople } from '../../lib/clientContacts';
import { isTerminated, settlementInputs } from '../../lib/termination';
import TerminateProjectModal, { type TerminatePayload } from './TerminateProjectModal';

/*
  The way in to terminating a project: one quiet row at the foot of Money.

  Once a project is terminated it is said on every screen, in the strip under
  the project header (components/projectAlerts/ProjectAlertBar), and its
  settlement opens from there in a window. Nothing more is drawn here. Built
  from the screen kit (DESIGN.md).
*/
export const TerminationPanel: React.FC<{
  context: any;
  schedule: ScheduleResult | null;
  /** Only the people who run the studio's money may terminate. */
  canAct: boolean;
  /** Terminates the open project: saves it and closes the client portal. */
  onTerminate?: (p: TerminatePayload) => Promise<void> | void;
}> = ({ context, schedule, canAct, onTerminate }) => {
  const [open, setOpen] = useState(false);
  const inputs = useMemo(() => settlementInputs(context, schedule), [context, schedule]);
  const portalLogins = useMemo(() => clientPeople(context).filter((p) => p.portal === 'on').length, [context]);
  if (isTerminated(context) || !canAct || !onTerminate) return null;
  return (
    <>
      <Panel as="h3" icon={ShieldOff} title="End this project early"
        blurb="For a project that stops before it is finished: the agreement was never signed, the client asked to stop, or the studio had to. Settles the money and closes the client portal."
        aside={<Button variant="danger" size="sm" onClick={() => setOpen(true)}>Terminate project</Button>} />
      {open && (
        <TerminateProjectModal projectName={String(context?.name || context?.clientName || 'Project')} inputs={inputs} portalLogins={portalLogins} onClose={() => setOpen(false)}
          onConfirm={async (p) => { await onTerminate(p); setOpen(false); }} />
      )}
    </>
  );
};

export default TerminationPanel;
