import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarClock, Check, Clock, Loader2, Mail, MessageSquareWarning, Send, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebaseClient';
import {
  approvalStage, approvalEmail, approvalSheets, approvalDate, addWorkingDays, mayDeem, sheetLine, cleanEmails, cleanLink,
  APPROVAL_WORKING_DAYS, REMINDER_WORKING_DAYS, type DesignMeeting, type ApprovalStage,
} from '../../lib/designMeeting';
import { sendApproval, recordApproval } from '../../services/designMeetingService';
import { projectDriveLink } from '../../services/googleDriveService';
import { shortDate, firstName, useToast } from './ui';
import { Chip, type Tone } from './DeskParts';

/*
  THE CLIENT'S APPROVAL, IN WRITING.

  Agreeing a room at the design meeting is not the approval. From a held
  meeting the studio sends the approval email (its own wording, the Drive
  link, and the date to answer by: 5 working days), the app sends reminders
  on working days 3 and 5, and the studio records the answer: the client's
  "Approved" pasted in, the changes they asked for, or, once the date has
  passed, the Design Head takes the drawings as approved. Only then are the
  drawings approved in the Drawings table (lib/designMeeting: ClientApproval).
*/

const STAGE: Record<ApprovalStage, { label: string; tone: Tone; Icon: typeof Clock }> = {
  presented: { label: 'Send for approval', tone: 'amber', Icon: Mail },
  sent: { label: 'Awaiting client', tone: 'amber', Icon: Clock },
  overdue: { label: 'Approval overdue', tone: 'red', Icon: CalendarClock },
  approved: { label: 'Approved by client', tone: 'green', Icon: BadgeCheck },
  changes: { label: 'Client changes', tone: 'red', Icon: MessageSquareWarning },
};

export function ApprovalChip({ m }: { m: DesignMeeting }) {
  const s = STAGE[approvalStage(m)];
  return <Chip tone={s.tone} icon={s.Icon} small>{s.label}</Chip>;
}

const VIA: Record<string, string> = { email: 'by email', signature: 'by signing in the studio', portal: 'in their portal', deemed: 'taken as approved' };

const input = 'w-full min-h-[40px] rounded-[10px] border border-[#DCDCD5] bg-white px-3 text-[13px] outline-none focus:border-[#4146C8] focus:shadow-[0_0_0_3px_rgba(65,70,200,0.15)]';
const label = 'mb-1 block text-[12px] font-bold text-[#17191E]';
const primary = 'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[#4146C8] px-3.5 text-[13px] font-bold text-white hover:bg-[#3439AD] disabled:opacity-45';
const secondary = 'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-[#DCDCD5] bg-white px-3.5 text-[13px] font-bold text-[#17191E] hover:border-[#A9AAA2] disabled:opacity-45';

interface Props {
  orgId: string;
  projectId: string;
  m: DesignMeeting;
  /** May carry this meeting on (lib/designMeeting mayRunThis). */
  mine: boolean;
  /** The Design Head, the Owner or an Admin: may take overdue drawings as approved. */
  lead: boolean;
  me: { email: string; name?: string | null };
  /** The client and the studio, when the caller already has them (the Ops Desk, from the server). */
  contact?: { name: string; email: string; studio: string } | null;
  /** Told after a change, for a screen that does not watch meetings live (the Ops Desk). */
  onChanged?: () => void;
}

export default function ClientApproval({ orgId, projectId, m, mine, lead, me, contact: given, onChanged }: Props) {
  const toast = useToast();
  const stage = approvalStage(m);
  const a = m.approval;
  const sheets = approvalSheets(m);
  const [mode, setMode] = useState<'send' | 'approved' | 'changes' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /* The client's name and address, from the project, to start the email from. */
  const [contact, setContact] = useState<{ name: string; email: string; studio: string } | null>(given || null);
  useEffect(() => {
    if (mode !== 'send' || contact || !db) return;
    getDoc(doc(db, 'projects', projectId)).then((s) => {
      const c = (s.data() as any)?.context || {};
      setContact({ name: String(c.clientName || ''), email: String(c.clientEmail || ''), studio: String(c.portalStudio?.name || '') });
    }).catch(() => setContact({ name: '', email: '', studio: '' }));
  }, [mode, projectId]);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [greet, setGreet] = useState('');
  const [drive, setDrive] = useState('');
  useEffect(() => {
    if (!contact) return;
    setTo((v) => v || a?.sentTo?.join(', ') || contact.email);
    setGreet((v) => v || a?.clientName || contact.name);
    setDrive((v) => v || a?.driveLink || '');
    /* The project's Drive folder, when the studio has connected Google Drive (Studio settings). */
    if (!a?.driveLink) projectDriveLink(projectId, orgId).then((link) => { if (link) setDrive((v) => v || link); });
  }, [contact]);

  const [note, setNote] = useState('');
  const [on, setOn] = useState(() => new Date().toISOString().slice(0, 10));

  const preview = useMemo(() => approvalEmail({
    kind: 'request', clientName: greet || 'there', projectName: m.projectName || 'your project', sheets,
    driveLink: cleanLink(drive), dueAt: addWorkingDays(Date.now(), APPROVAL_WORKING_DAYS), senderName: me.name || '', studioName: contact?.studio || '',
  }), [greet, drive, contact, m.id]);

  const toOk = !!cleanEmails(to)?.length;
  const ccOk = cleanEmails(cc) !== null;
  const driveOk = !drive.trim() || !!cleanLink(drive);
  const t = { orgId, projectId };

  async function send() {
    setBusy('send');
    try {
      const r = await sendApproval(t, m.id, { to, cc, clientName: greet, driveLink: drive.trim() });
      toast({ ok: true, title: r?.sandbox ? 'Approval email simulated' : 'Approval email sent', sub: r?.sandbox ? 'The email service is not set up, so nothing left the studio.' : `Reminders go on working days ${REMINDER_WORKING_DAYS.join(' and ')}. Replies come to you.` });
      setMode(null);
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'The email did not go', sub: e?.message });
    } finally { setBusy(null); }
  }

  async function record(outcome: 'approved' | 'changes' | 'deemed') {
    setBusy(outcome);
    try {
      const answeredAt = outcome === 'approved' && on ? new Date(`${on}T12:00:00+05:30`).getTime() : undefined;
      const r = await recordApproval(t, m.id, outcome, note, answeredAt);
      const moved = r?.movedOn?.length ? `${r.movedOn.join(', ')} changed since the meeting and stayed as it is.` : undefined;
      toast({
        ok: !moved,
        title: outcome === 'changes' ? 'Changes recorded' : `${r?.approved?.length || 0} drawing${r?.approved?.length === 1 ? '' : 's'} approved`,
        sub: moved || (outcome === 'changes' ? 'Upload the revised sheets in Design Desk and present them again.' : 'The Drawings table shows them approved.'),
      });
      setMode(null); setNote('');
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'Not recorded', sub: e?.message });
    } finally { setBusy(null); }
  }

  if (!sheets.length) return null;
  const s = STAGE[stage];
  const reminders = a?.reminders?.length || 0;
  const line = stage === 'approved'
    ? `Approved ${VIA[a?.via || (m.confirmation?.via === 'portal' ? 'portal' : 'signature')] || ''}, ${shortDate(a?.answeredAt || m.confirmation?.at || 0)}`
    : stage === 'changes' ? `The client asked for changes, ${shortDate(a?.answeredAt || 0)}`
    : stage === 'presented' ? 'Agreed at the meeting. Send the approval email next.'
    : stage === 'overdue' ? `No answer by ${approvalDate(a!.dueAt!)}`
    : `Emailed ${shortDate(a!.sentAt!)} to ${a!.sentTo.join(', ')}. Answer by ${approvalDate(a!.dueAt!)}.`;
  const sub = stage === 'approved' ? (a?.note || (a?.recordedBy ? `Recorded by ${firstName(a.recordedBy.name)}.` : ''))
    : stage === 'changes' ? a?.note || ''
    : stage === 'presented' ? `${sheets.length} drawing${sheets.length === 1 ? '' : 's'} wait for the client's written approval. They are not approved in the Drawings table until it comes back.`
    : stage === 'overdue' ? (lead ? 'The email said the drawings would be taken as approved. You can do that, or record their answer if it came.' : 'The Design Head can take the drawings as approved, as the email said.')
    : `${reminders ? `${reminders} reminder${reminders === 1 ? '' : 's'} sent.` : `Reminders go on working days ${REMINDER_WORKING_DAYS.join(' and ')}.`} Replies go to ${firstName(a?.sentBy?.name)}.`;

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-[#E4E4DE] px-3.5 py-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-3">
        <s.Icon size={18} className="shrink-0" style={{ color: stage === 'approved' ? '#1B6E4F' : stage === 'overdue' || stage === 'changes' ? '#B4232F' : '#8F4C07' }} />
        <span className="min-w-0 flex-[1_1_240px]">
          <b>{line}</b>
          {sub && <span className="block whitespace-pre-line text-[12px] text-[#5F636D]">{sub}</span>}
        </span>
        {mine && stage !== 'approved' && !mode && (
          <span className="flex flex-wrap gap-2">
            {(stage === 'presented' || stage === 'sent' || stage === 'overdue') && (
              <button type="button" onClick={() => setMode('send')} className={stage === 'presented' ? primary : secondary}><Send size={15} />{stage === 'presented' ? 'Send for approval' : 'Send again'}</button>
            )}
            {stage !== 'presented' && <button type="button" onClick={() => setMode('approved')} className={primary}><Check size={15} />Client approved</button>}
            {stage !== 'presented' && stage !== 'changes' && <button type="button" onClick={() => setMode('changes')} className={secondary}><MessageSquareWarning size={15} />Asked for changes</button>}
            {lead && mayDeem(a) && (
              <button type="button" disabled={!!busy} onClick={() => record('deemed')} className={secondary}>
                {busy === 'deemed' ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />}Take as approved
              </button>
            )}
          </span>
        )}
      </div>

      {mode === 'send' && (
        <div className="hud-panel-in grid gap-3 border-t border-[#EEEEEA] pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2.5">
            <div><label className={label} htmlFor={`to-${m.id}`}>To</label>
              <input id={`to-${m.id}`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" className={input} style={{ borderColor: to && !toOk ? '#B4232F' : undefined }} /></div>
            <div><label className={label} htmlFor={`cc-${m.id}`}>CC <span className="font-medium text-[#8A8E97]">(you are copied, and replies come to you)</span></label>
              <input id={`cc-${m.id}`} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="designer@yourstudio.in" className={input} style={{ borderColor: !ccOk ? '#B4232F' : undefined }} /></div>
            <div><label className={label} htmlFor={`greet-${m.id}`}>Greeting</label>
              <input id={`greet-${m.id}`} value={greet} onChange={(e) => setGreet(e.target.value)} placeholder="Ms. Sharma" className={input} /></div>
            <div><label className={label} htmlFor={`drive-${m.id}`}>Google Drive link to the drawings</label>
              <input id={`drive-${m.id}`} value={drive} onChange={(e) => setDrive(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" className={input} style={{ borderColor: !driveOk ? '#B4232F' : undefined }} /></div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" disabled={!toOk || !ccOk || !driveOk || greet.trim().length < 2 || !!busy} onClick={send} className={primary}>
                {busy === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Send approval email
              </button>
              <button type="button" onClick={() => setMode(null)} disabled={!!busy} className={secondary}><X size={15} />Cancel</button>
            </div>
          </div>
          <div className="min-w-0">
            <div className={label}>{preview.subject}</div>
            {/* The email exactly as it goes; built and escaped by lib/designMeeting approvalEmail. */}
            <div className="max-h-[360px] overflow-auto rounded-[10px] border border-[#EEEEEA] bg-[#FAFAF7] p-3 [&_a]:text-[#3A3FB8] [&_a]:underline [&_ol]:list-decimal" dangerouslySetInnerHTML={{ __html: preview.html }} />
          </div>
        </div>
      )}

      {(mode === 'approved' || mode === 'changes') && (
        <div className="hud-panel-in flex flex-col gap-2.5 border-t border-[#EEEEEA] pt-3">
          <div>
            <label className={label} htmlFor={`reply-${m.id}`}>{mode === 'approved' ? "The client's reply" : 'What the client asked to change'} {mode === 'approved' && <span className="font-medium text-[#8A8E97]">(optional; paste it for the record)</span>}</label>
            <textarea id={`reply-${m.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder={mode === 'approved' ? 'Approved.' : 'The wardrobe handles in the master bedroom…'}
              className="w-full rounded-[10px] border border-[#DCDCD5] px-3 py-2.5 text-[13px] outline-none focus:border-[#4146C8] focus:shadow-[0_0_0_3px_rgba(65,70,200,0.15)]" />
          </div>
          {mode === 'approved' && (
            <div className="max-w-[220px]"><label className={label} htmlFor={`on-${m.id}`}>Date on their reply</label>
              <input id={`on-${m.id}`} type="date" value={on} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setOn(e.target.value)} className={input} /></div>
          )}
          <div className="text-[12px] text-[#5F636D]">
            {mode === 'approved'
              ? `Approves ${sheets.map((x) => sheetLine(x.room, x.name)).join(', ')} in the Drawings table, on the versions shown at the meeting.`
              : 'The drawings stay approved by the Design Head and wait for a revised set. Nothing is approved in the Drawings table.'}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy || (mode === 'changes' && !note.trim())} onClick={() => record(mode)} className={primary}>
              {busy === mode ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{mode === 'approved' ? 'Record approval' : 'Record changes'}
            </button>
            <button type="button" onClick={() => setMode(null)} disabled={!!busy} className={secondary}><X size={15} />Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
