import React, { useMemo, useRef, useState } from 'react';
import { Scale, Upload } from '@/lib/lucide-shim';
import { Panel, Button, Chip } from '../ui/kit';
import { formatCurrency } from '../../lib/utils';
import type { ScheduleResult } from '../../lib/paymentSchedule';
import {
  daysOpen, disputeFileProblems, disputesOf, editDispute, importDispute, openDispute,
  outstandingByTrack, raiseDispute,
} from '../../lib/disputes';
import DisputeModal from './DisputeModal';
import DisputeDetailModal from './DisputeDetailModal';

/*
  The dispute card at the foot of Money: the way in, and the disputes already
  closed, each opening in a window (DisputeDetailModal).

  An OPEN dispute is not drawn here. It is said on every screen of the
  project, in the strip under the project header
  (components/projectAlerts/ProjectAlertBar), and opens from there. Built from
  the screen kit (DESIGN.md).
*/

const money = (v: number) => formatCurrency(Math.round(v));
const day = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const DisputePanel: React.FC<{
  context: any;
  schedule: ScheduleResult | null;
  /** Only the people who run the studio's money may raise, settle or reopen. */
  canAct: boolean;
  actor: string;
  setProjectContext: (fn: (prev: any) => any) => void;
}> = ({ context, schedule, canAct, actor, setProjectContext }) => {
  const open = openDispute(context);
  const all = disputesOf(context);
  const past = all.filter((d) => d.status !== 'open');
  const outstanding = useMemo(() => outstandingByTrack(context, schedule), [context, schedule]);
  const name = String(context?.name || context?.clientName || 'Project');
  /* The dispute shown in the window, by id, read live so it follows a reopen or an edit. */
  const [viewId, setViewId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [raising, setRaising] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const viewed = viewId ? all.find((d) => d.id === viewId) || null : null;

  /* A dispute kept elsewhere, or one from before disputes were kept here, comes in as a file (lib/disputes importDispute). */
  const readFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const problems = disputeFileProblems(raw);
      if (problems.length) { setFileError(problems.join(' ')); return; }
      if (raw.status !== 'settled' && raw.status !== 'withdrawn' && openDispute(context)) { setFileError('A dispute is already open on this project.'); return; }
      setProjectContext((prev: any) => importDispute(prev, raw, actor));
    } catch {
      setFileError('That file could not be read as a dispute file.');
    }
  };

  /* The windows. A dispute reopened here stays in its window, now open, to be worked. */
  const mine = !!viewed;
  const windows = (
    <>
      {mine && viewed && !editing && (
        <DisputeDetailModal projectName={name} dispute={viewed} context={context} schedule={schedule} canAct={canAct} actor={actor}
          setProjectContext={setProjectContext} onEdit={() => setEditing(true)} onClose={() => setViewId(null)} />
      )}
      {mine && viewed && editing && (
        <DisputeModal projectName={name} outstanding={outstanding} existing={viewed} onClose={() => setEditing(false)}
          onSave={(draft) => { setProjectContext((prev: any) => editDispute(prev, viewed.id, draft)); setEditing(false); }} />
      )}
      {raising && (
        <DisputeModal projectName={name} outstanding={outstanding} onClose={() => setRaising(false)}
          onSave={(d) => { setProjectContext((prev: any) => raiseDispute(prev, d, actor)); setRaising(false); }} />
      )}
    </>
  );

  {
    /* While a dispute is open the strip under the project header is the way in; this card stays for the closed ones and for a window it already has open. */
    if (!canAct && !past.length && !viewed) return null;
    if (open && !past.length && !viewed) return null;
    return (
      <>
        <Panel as="h3" icon={Scale} title="Payment dispute"
          blurb="For a client holding back payment over the work or the bill. Track what is contested and each side's position, then settle it: the concession goes onto the unpaid invoices."
          aside={canAct && !open ? (
            <>
              <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" aria-label="Dispute file"
                onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
              <Button variant="quiet" size="sm" icon={Upload} onClick={() => fileInput.current?.click()} title="Add a dispute from a file, for example one settled before disputes were kept here. A settled one is history only: no invoice is changed.">Add from a file</Button>
              <Button variant="secondary" size="sm" onClick={() => setRaising(true)}>Raise a dispute</Button>
            </>
          ) : undefined}>
          {fileError && <p className="mb-3 text-xs font-semibold text-rose-700">{fileError}</p>}
          {past.length > 0 && (
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {past.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-semibold text-slate-800 flex flex-wrap items-center gap-2">{d.title}<Chip tone={d.status === 'settled' ? 'good' : 'slate'}>{d.status === 'settled' ? 'Settled' : 'Nothing conceded'}</Chip></p>
                    <p className="text-[11px] text-slate-500 tabular-nums">{day(d.openedOn)} to {day(d.closedOn)}, {daysOpen(d)} days.{d.resolution ? ` ${money(d.claimed.execution + d.claimed.design)} held back, settled at ${money(d.resolution.settled.execution + d.resolution.settled.design)}.` : d.closedNote ? ` ${d.closedNote}` : ''}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => { setEditing(false); setViewId(d.id); }}>View</Button>
                </div>
              ))}
            </div>
          )}
        </Panel>
        {windows}
      </>
    );
  }

  return null;
};

export default DisputePanel;
