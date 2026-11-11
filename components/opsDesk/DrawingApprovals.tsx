import React, { useEffect, useMemo, useState } from 'react';
import { FileCheck2, Loader2, Plus, X } from 'lucide-react';
import { approvalStage, sheetLine, type ApprovalItem, type DesignMeeting } from '../../lib/designMeeting';
import ClientApproval, { ApprovalChip } from '../drawingReview/ClientApproval';
import { ToastHost, useToast } from '../drawingReview/ui';
import { listApprovable, recordPresentedOutside } from '../../services/designMeetingService';
import { Panel, Empty, Loading } from './DeskBits';

/*
  OPS DESK → DRAWINGS FOR APPROVAL.

  After the client has seen drawings, operations send the approval email (in
  their own name, so the reply comes back to them), upload the drawings they
  choose to the project's Drive folder, and record the answer. Client
  Relations do not read meetings themselves, so the server hands this list
  over (designMeeting: approvals), for their own projects only.

  Drawings are not always presented in a design meeting here: at site, in
  person, on WhatsApp. "Presented outside the Studio Desk" records that the
  client saw them (designMeeting: presentedOutside), and the approval then
  runs the same way. One project at a time, from every project the person
  can see, whatever the desk's Actual/Dummy choice.
*/

/** The item, in the shape the approval panel reads: only the agreed rooms and their sheets. */
export function asMeeting(i: ApprovalItem): DesignMeeting {
  const rooms = new Map<string, ApprovalItem['sheets']>();
  i.sheets.forEach((s) => rooms.set(s.room, [...(rooms.get(s.room) || []), s]));
  return {
    id: i.meetingId, orgId: '', projectId: i.projectId, projectName: i.projectName, state: 'CLOSED', rev: 0, attendees: '', includedRounds: 0,
    startedAt: i.closedAt, startedBy: { uid: '', email: '', name: i.presentedBy }, closedAt: i.closedAt, closedBy: null,
    rooms: [...rooms].map(([room, sheets]) => ({
      room, outcome: 'agreed', changes: [], round: 0, charge: null,
      sheets: sheets.map((s) => ({ drawingId: s.drawingId, name: s.name, versionId: '', versionNo: s.versionNo, pdfPath: null, thumbPath: null, pageCount: null })),
    })),
    approval: i.approval, confirmation: i.confirmation as any, outside: !!i.outside,
  };
}

const day = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const field = 'min-h-[38px] rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-[#3D52A0] focus:ring-2 focus:ring-[#3D52A0]/15';
const btnPri = 'inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#3D52A0] px-3.5 text-sm font-bold text-white hover:bg-[#334486] disabled:opacity-45';
const btnSec = 'inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-45';

/* ------------------------------------------------------------ presented outside the Studio Desk */

export function PresentedOutside({ orgId, projectId, projectName, onDone, onCancel }: { orgId: string; projectId: string; projectName: string; onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<{ drawingId: string; name: string; room: string; versionNo: number }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [how, setHow] = useState('');
  const [on, setOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setList(null); setErr(null); setTicked({});
    listApprovable({ orgId, projectId }).then((r) => setList(r.drawings)).catch((e) => setErr(e?.message || 'The drawings could not be loaded.'));
  }, [orgId, projectId]);
  const picked = (list || []).filter((d) => ticked[d.drawingId]).map((d) => d.drawingId);

  async function save() {
    setBusy(true); setErr(null);
    try {
      await recordPresentedOutside({ orgId, projectId }, picked, how, new Date(`${on}T12:00:00+05:30`).getTime());
      toast({ ok: true, title: `${picked.length} drawing${picked.length === 1 ? '' : 's'} ready to send for approval`, sub: 'Upload them to Drive and send the approval email below.' });
      onDone();
    } catch (e: any) {
      setErr(e?.message || 'Not recorded.');
    } finally { setBusy(false); }
  }

  return (
    <div className="hud-panel-in space-y-3 rounded-xl border border-[#3D52A0]/25 bg-slate-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Presented outside the Studio Desk · <span className="text-[#3D52A0]">{projectName}</span>
          <span className="block text-xs font-normal text-slate-500">Tick the drawings the client was shown at site, in person or on WhatsApp. Only drawings the Design Head approved for the client are listed.</span>
        </p>
        <button type="button" onClick={onCancel} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      {list === null && !err ? <Loading rows={2} /> : list && !list.length ? (
        <p className="text-sm text-slate-600">No drawing here is waiting for the client: none is approved by the Design Head for the client, or they are already approved by the client.</p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {(list || []).map((d) => (
            <label key={d.drawingId} className="flex min-h-[40px] items-center gap-2.5 px-3 text-sm text-slate-800">
              <input type="checkbox" checked={!!ticked[d.drawingId]} disabled={busy} onChange={(e) => setTicked((t) => ({ ...t, [d.drawingId]: e.target.checked }))} className="h-4 w-4 accent-[#3D52A0]" />
              <span className="min-w-0 flex-1 truncate">{sheetLine(d.room, d.name)}</span>
              <span className="shrink-0 text-xs text-slate-400">v{d.versionNo}</span>
            </label>
          ))}
        </div>
      )}
      {!!list?.length && (
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-semibold text-slate-600">How it was presented
            <input value={how} onChange={(e) => setHow(e.target.value)} maxLength={200} placeholder="Shown at site / sent on WhatsApp" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">On
            <input type="date" value={on} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setOn(e.target.value)} className={field} />
          </label>
          <button type="button" disabled={!picked.length || busy} onClick={save} className={btnPri}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}Ready to send{picked.length ? ` (${picked.length})` : ''}
          </button>
        </div>
      )}
      {err && <p className="text-sm text-rose-700">{err}</p>}
    </div>
  );
}

/* ------------------------------------------------------------ the panel */

interface Props {
  orgId: string;
  items: ApprovalItem[] | null;
  /** Every project the person can see, for the picker. */
  projects: { id: string; name: string }[];
  me: { email: string; name?: string | null };
  /** The Design Head, Owner or Admin: may take overdue drawings as approved. */
  lead: boolean;
  onChanged: (projectId: string) => void;
  /** Inside one project (the Drawings table): that project only, no picker. */
  fixedProjectId?: string;
}

export default function DrawingApprovals({ orgId, items, projects, me, lead, onChanged, fixedProjectId }: Props) {
  const waiting = useMemo(() => (items || []).filter((i) => approvalStage(asMeeting(i)) !== 'approved'), [items]);
  const count = (id: string) => waiting.filter((i) => i.projectId === id).length;
  /* Projects waiting on the client first, then the rest by name. */
  const sorted = useMemo(() => [...projects].sort((a, b) => count(b.id) - count(a.id) || a.name.localeCompare(b.name)), [projects, waiting]);
  const [pick, setPick] = useState<string>('');
  const projectId = fixedProjectId || (projects.some((p) => p.id === pick) ? pick : '');
  const project = projects.find((p) => p.id === projectId) || null;
  const open = projectId ? waiting.filter((i) => i.projectId === projectId) : waiting;
  const [recording, setRecording] = useState(false);

  return (
    <Panel icon={FileCheck2} title="Drawings for approval"
      blurb={`Drawings the client has seen, in a design meeting or outside the Studio Desk. ${fixedProjectId ? '' : 'Pick the project, '}upload the drawings you choose to its Drive folder, send the approval email (it goes in your name, and replies come to you), then record their answer. Reminders go on working days 3 and 5.`}
      right={fixedProjectId ? undefined :
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Project
          <select value={projectId} onChange={(e) => { setPick(e.target.value); setRecording(false); }} className={`${field} max-w-[260px] font-semibold`}>
            <option value="">All projects ({waiting.length} waiting)</option>
            {sorted.map((p) => <option key={p.id} value={p.id}>{p.name}{count(p.id) ? ` (${count(p.id)})` : ''}</option>)}
          </select>
        </label>
      }>
      <ToastHost>
        <div className="space-y-3">
          {/* Drawings shown at site, in person or on WhatsApp: recorded here so their approval can be asked for. */}
          {project && !recording && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5">
              <p className="text-sm text-slate-600">Showed <b className="text-slate-800">{project.name}</b>'s drawings outside the Studio Desk?</p>
              <button type="button" onClick={() => setRecording(true)} className={btnSec}><Plus className="h-4 w-4" />Presented outside the Studio Desk</button>
            </div>
          )}
          {project && recording && (
            <PresentedOutside orgId={orgId} projectId={project.id} projectName={project.name}
              onCancel={() => setRecording(false)} onDone={() => { setRecording(false); onChanged(project.id); }} />
          )}
          {!project && <p className="text-xs text-slate-500">Pick a project to record drawings presented outside the Studio Desk.</p>}

          {items === null ? <Loading /> : !open.length ? (
            <Empty icon={FileCheck2} text={project ? `Nothing from ${project.name} is waiting for the client's approval.` : 'No drawings are waiting for the client\'s approval.'} />
          ) : open.map((i) => {
            const m = asMeeting(i);
            return (
              <div key={i.meetingId} className="hud-row-in space-y-2 rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
                    {i.projectName} <span className="font-normal text-slate-500">· {i.outside ? `presented outside the Studio Desk${i.how ? ` (${i.how})` : ''}` : 'meeting'} {day(i.closedAt)}{i.presentedBy ? ` · by ${i.presentedBy}` : ''}</span>
                  </p>
                  <ApprovalChip m={m} />
                </div>
                <p className="text-xs text-slate-500">{i.sheets.map((s) => sheetLine(s.room, s.name)).join(' · ')}</p>
                <ClientApproval orgId={orgId} projectId={i.projectId} m={m} mine lead={lead} me={me} contact={i.contact} onChanged={() => onChanged(i.projectId)} />
              </div>
            );
          })}
        </div>
      </ToastHost>
    </Panel>
  );
}
