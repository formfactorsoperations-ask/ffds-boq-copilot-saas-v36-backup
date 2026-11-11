import React, { useMemo, useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import { approvalStage, sheetLine, type ApprovalItem, type DesignMeeting } from '../../lib/designMeeting';
import ClientApproval, { ApprovalChip } from '../drawingReview/ClientApproval';
import { ToastHost } from '../drawingReview/ui';
import { Panel, Empty, Loading } from './DeskBits';

/*
  OPS DESK → DRAWINGS FOR APPROVAL.

  After a design meeting, operations sends the client the approval email
  (in their own name, so the reply comes back to them), and records the
  answer: approved, changes, or (the Design Head) taken as approved after the
  date. Client Relations do not read meetings themselves, so the server hands
  this list over (designMeeting: approvals), for their own projects only.
  The same panel the Design Desk shows under Meetings (ClientApproval).
*/

/** The item, in the shape the approval panel reads: only the agreed rooms and their sheets. */
function asMeeting(i: ApprovalItem): DesignMeeting {
  const rooms = new Map<string, ApprovalItem['sheets']>();
  i.sheets.forEach((s) => rooms.set(s.room, [...(rooms.get(s.room) || []), s]));
  return {
    id: i.meetingId, orgId: '', projectId: i.projectId, projectName: i.projectName, state: 'CLOSED', rev: 0, attendees: '', includedRounds: 0,
    startedAt: i.closedAt, startedBy: { uid: '', email: '', name: i.presentedBy }, closedAt: i.closedAt, closedBy: null,
    rooms: [...rooms].map(([room, sheets]) => ({
      room, outcome: 'agreed', changes: [], round: 0, charge: null,
      sheets: sheets.map((s) => ({ drawingId: s.drawingId, name: s.name, versionId: '', versionNo: s.versionNo, pdfPath: null, thumbPath: null, pageCount: null })),
    })),
    approval: i.approval, confirmation: i.confirmation as any,
  };
}

interface Props {
  orgId: string;
  items: ApprovalItem[] | null;
  me: { email: string; name?: string | null };
  /** The Design Head, Owner or Admin: may take overdue drawings as approved. */
  lead: boolean;
  onChanged: (projectId: string) => void;
}

export default function DrawingApprovals({ orgId, items, me, lead, onChanged }: Props) {
  const waiting = useMemo(() => (items || []).filter((i) => approvalStage(asMeeting(i)) !== 'approved'), [items]);
  /* One project at a time: the projects with meetings waiting, by name. */
  const projects = useMemo(() => {
    const by = new Map<string, string>();
    waiting.forEach((i) => by.set(i.projectId, i.projectName));
    return [...by].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [waiting]);
  const [pick, setPick] = useState<string>('');
  const projectId = projects.some((p) => p.id === pick) ? pick : projects.length === 1 ? projects[0].id : '';
  const open = projectId ? waiting.filter((i) => i.projectId === projectId) : waiting;
  const done = (items || []).length - waiting.length;
  return (
    <Panel icon={FileCheck2} title="Drawings for approval"
      blurb="Rooms the client agreed at a design meeting. Pick the project, upload the drawings you choose to its Drive folder, send the approval email (it goes in your name, and replies come to you), then record their answer. Reminders go on working days 3 and 5."
      right={projects.length > 1 ? (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Project
          <select value={projectId} onChange={(e) => setPick(e.target.value)} className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-800">
            <option value="">All projects ({waiting.length})</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({waiting.filter((i) => i.projectId === p.id).length})</option>)}
          </select>
        </label>
      ) : undefined}>
      {items === null ? <Loading /> : !open.length ? <Empty icon={FileCheck2} text={done ? `Nothing waiting. ${done} meeting${done === 1 ? ' is' : 's are'} approved by the client.` : 'No design meetings are waiting for the client\'s approval.'} /> : (
        <ToastHost>
          <div className="space-y-3">
            {open.map((i) => {
              const m = asMeeting(i);
              return (
                <div key={i.meetingId} className="hud-row-in rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
                      {i.projectName} <span className="font-normal text-slate-500">· meeting {new Date(i.closedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}{i.presentedBy ? ` · presented by ${i.presentedBy}` : ''}</span>
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
      )}
    </Panel>
  );
}
