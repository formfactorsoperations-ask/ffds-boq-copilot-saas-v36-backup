import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarCheck, Check, ChevronRight, Clock, History, IndianRupee, Loader2, MapPinned, MonitorUp, PenLine, Presentation, ReceiptText, Tv, UserCheck, Users, X } from 'lucide-react';
import {
  presentableRooms, revisionCharges, meetingSummary, plural, confirmationLine, isConfirmed, guessLayout, mayRunThis, clientRoundsByRoom, approvalStage, needsApproval, sheetLine,
  GENERAL_ROOM, type DesignMeeting, type LayoutSetup, type MeetingRoom,
} from '../../lib/designMeeting';
import { minutesOf, nextRoundCharged, roundsLine, WAYS, type MeetingWay } from '../../lib/meetingMinutes';
import { startMeeting, cancelMeeting, updateCharge, watchLayoutSetup, listApprovable, recordPresentedOutside } from '../../services/designMeetingService';
import type { ReviewDrawing } from '../../services/drawingReviewService';
import Presenters, { type TeamMember } from '../drawingReview/Presenters';
import { LayoutRooms } from '../drawingReview/LayoutPlan';
import ClientSign from '../drawingReview/ClientSign';
import ClientApproval from '../drawingReview/ClientApproval';
import { ProjectMark, SheetThumb } from '../drawingReview/DeskParts';
import { roomLabel, shortDate, firstName, useToast } from '../drawingReview/ui';
import { Btn, Card, Empty, SectionTitle, Tag, cx } from './parts';
import { CopyMinutes, DESK_ACCENT, MinutesList, RoomResult, inr, meetingTitle, saveWay, savedWay, useSheetTurn } from './meetingBits';

/*
  DESIGN DESK 2.0: the Meetings page (build plan, Phase 2).

  Three numbered steps start a meeting: pick the rooms to show, say who is
  attending, say how the client will see the drawings. Under them: recording
  drawings shown outside the desk, the meetings waiting for the client's
  answer, the revision rounds to bill, and the meetings already held.

  Every rule is today's (lib/designMeeting.ts, the designMeeting function):
  only drawings the Design Head approved can be shown, a Designer shows only
  what the Design Head gave them and never sees fees, and nothing here is
  approved until the client says so in writing.
*/

interface Props {
  orgId: string;
  projectId: string | null;
  projectName: string;
  drawings: ReviewDrawing[];
  meetings: DesignMeeting[] | null;
  /** The Design Head, the Owner or an Admin: runs any meeting and chooses who presents. */
  canRun: boolean;
  /** May bill or waive a revision round. */
  canBill: boolean;
  /** A Designer showing only what the Design Head gave them. */
  presenter: boolean;
  /** Operations: sends the approval email and records the client's answer on any held meeting. */
  approver?: boolean;
  me: { uid: string; email: string; name?: string | null };
  designers: TeamMember[];
  onResume: (m: DesignMeeting) => void;
  projects: { id: string; name: string; code: string; color: string }[];
  onPickProject: (id: string) => void;
}

const field = 'w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20';

const StepHead: React.FC<{ n: number; title: string; line: string; aside?: React.ReactNode }> = ({ n, title, line, aside }) => (
  <div className="flex flex-wrap items-start gap-3">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-sm font-bold text-white" aria-hidden>{n}</span>
    <div className="min-w-0 flex-1">
      <h3 className="text-base font-bold text-slate-800">{title}</h3>
      <p className="text-sm text-slate-500">{line}</p>
    </div>
    {aside}
  </div>
);

export default function MeetingsPage({ orgId, projectId, projectName, drawings, meetings, canRun, canBill, presenter, approver, me, designers, onResume, projects, onPickProject }: Props) {
  const toast = useToast();
  const rooms = useMemo(() => presentableRooms(drawings, presenter && !canRun ? me.email : null), [drawings, presenter, canRun, me.email]);
  const canStart = canRun || presenter;
  const mine = (m: DesignMeeting) => canStart && mayRunThis(m, { uid: me.uid, lead: canRun });
  const ready = rooms.filter((r) => r.ready);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  useEffect(() => { setPicked(Object.fromEntries(ready.map((r) => [r.room, true]))); }, [projectId, ready.map((r) => r.room).join('|')]);
  const [attendees, setAttendees] = useState('');
  const [way, setWayRaw] = useState<MeetingWay>(savedWay);
  const setWay = (w: MeetingWay) => { setWayRaw(w); saveWay(w); };
  const [busy, setBusy] = useState<string | null>(null);
  const [openPast, setOpenPast] = useState<string | null>(null);
  const [signing, setSigning] = useState<DesignMeeting | null>(null);
  const [giving, setGiving] = useState(false);
  const [outside, setOutside] = useState(false);

  /* The layout plan shown beside each room: any approved drawing, the project's last choice first. */
  const [setup, setSetup] = useState<LayoutSetup | null>(null);
  useEffect(() => { setSetup(null); if (projectId) return watchLayoutSetup(orgId, projectId, setSetup); }, [orgId, projectId]);
  const plans = useMemo(() => drawings.filter((d) => d.review?.state === 'APPROVED' && d.review?.versionId && d.review?.pdfPath), [drawings]);
  const [planId, setPlanId] = useState<string | null>(null);
  const defaultPlan = (setup && plans.find((d) => d.id === setup.drawingId)) || guessLayout(plans);
  const plan = planId === '' ? null : plans.find((d) => d.id === planId) || defaultPlan || null;
  const allRooms = useMemo(() => [...new Set(drawings.map((d) => d.roomName || GENERAL_ROOM))].filter((r) => r !== GENERAL_ROOM).sort(), [drawings]);
  const marks = setup && plan && setup.drawingId === plan.id ? setup.rooms : {};
  const [marking, setMarking] = useState(false);
  /* A plan stored upright is marked the way it will be shown: landscape. */
  const [planTurn] = useSheetTurn(projectId || '', plan?.id, plan?.review?.pdfPath);

  /* Revision rounds: what each room has used, and how many the client's terms include (as the last meeting recorded them). */
  const used = useMemo(() => clientRoundsByRoom(meetings || []), [meetings]);
  const included = (meetings || []).find((m) => m.state !== 'CANCELLED')?.includedRounds ?? null;

  if (!projectId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Meetings</h1>
        <p className="mt-1 text-base text-slate-600">Show approved drawings to the client, one room at a time. The desk writes down what they say.</p>
        <SectionTitle hint="A meeting shows one project's ready rooms">Which project are you meeting about?</SectionTitle>
        {projects.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p, i) => (
              <button key={p.id} type="button" onClick={() => onPickProject(p.id)} style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                className="hud-panel-in phd-lift flex min-h-[64px] min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-left shadow-sm hover:border-emerald-300">
                <ProjectMark code={p.code} color={p.color} size={36} />
                <span className="min-w-0 flex-1 truncate text-base font-bold text-slate-800">{p.name}</span>
                <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden />
              </button>
            ))}
          </div>
        ) : <Empty icon={Presentation} title="No projects yet" line="A meeting needs a project with drawings the Design Head has approved." />}
      </div>
    );
  }

  const open = (meetings || []).find((m) => m.state === 'OPEN') || null;
  const closed = (meetings || []).filter((m) => m.state === 'CLOSED');
  const waiting = closed.filter((m) => needsApproval(m) && approvalStage(m) !== 'approved');
  const charges = revisionCharges(meetings || []);
  const chosen = ready.filter((r) => picked[r.room]).map((r) => r.room);
  const target = { orgId, projectId };
  const nameOf = (e: string) => firstName(designers.find((p) => p.email.toLowerCase() === e.toLowerCase())?.name || e);

  const start = async () => {
    setBusy('start');
    try {
      const m = await startMeeting(target, chosen, attendees.trim(), plan?.id || null);
      if (m) onResume(m);
    } catch (e: any) {
      toast({ title: 'The meeting did not start', sub: e?.message });
    } finally { setBusy(null); }
  };
  const cancel = async (m: DesignMeeting) => {
    setBusy('cancel');
    try { await cancelMeeting(target, m.id); toast({ ok: true, title: 'Meeting cancelled', sub: 'Nothing was recorded for the client.' }); }
    catch (e: any) { toast({ title: 'Not cancelled', sub: e?.message }); }
    finally { setBusy(null); }
  };

  return (
    <div style={DESK_ACCENT}>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-800">Meetings</h1>
          <p className="mt-1 text-base text-slate-600">Show approved drawings to the client, one room at a time. The desk writes down what they say.</p>
        </div>
        {projects.length > 1 && (
          <label className="flex flex-col text-xs font-bold text-slate-500">Project
            <select value={projectId} onChange={(e) => onPickProject(e.target.value)} className={cx(field, 'mt-1 max-w-[280px] font-semibold')}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {open && (
        <div className="hud-panel-in mt-5 flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-r from-[#0C1F1A] to-emerald-900 px-5 py-4 text-white">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10"><Presentation size={22} aria-hidden /></span>
          <div className="min-w-0 flex-[1_1_260px]">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-200">Still open</p>
            <p className="text-lg font-bold">Your meeting{open.attendees ? ` with ${open.attendees}` : ''} is still open</p>
            <p className="text-sm text-emerald-100">{open.rooms.filter((r) => r.outcome).length} of {plural(open.rooms.length, 'room')} done. Nothing is lost. {mine(open) ? 'Carry on where you stopped.' : `Only ${firstName(open.startedBy?.name)}, the Design Head or an Admin can carry it on.`}</p>
          </div>
          {mine(open) && <>
            <Btn kind="quiet" className="!text-emerald-100 hover:!bg-white/10 hover:!text-white" disabled={!!busy} onClick={() => cancel(open)}>Cancel the meeting</Btn>
            <Btn kind="light" big icon={Presentation} onClick={() => onResume(open)}>Resume the meeting</Btn>
          </>}
        </div>
      )}

      <SectionTitle hint={presenter && !canRun ? `${projectName}: the approved drawings the Design Head gave you` : projectName}>Next meeting</SectionTitle>
      <Card className="flex flex-col gap-6 p-5">
        <div>
          <StepHead n={1} title="Pick the rooms to show" line="Only drawings the Design Head has approved can be shown."
            aside={canRun && <Btn kind="plain" icon={UserCheck} onClick={() => setGiving(true)} title="Choose which designers may present which drawings">Who presents</Btn>} />
          {rooms.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">No drawings for the client in this project yet.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {rooms.map((r, i) => {
                const u = used[r.room] || 0;
                const who = canRun && designers.length ? [...new Set(r.sheets.flatMap((d) => d.review?.presenters || []))] : [];
                return (
                  <label key={r.room} style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                    className={cx('hud-row-in flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3', r.ready ? 'cursor-pointer bg-slate-50 hover:bg-emerald-50' : 'bg-slate-50/60')}>
                    <input type="checkbox" checked={r.ready && !!picked[r.room]} disabled={!r.ready || !canStart || !!open} onChange={() => setPicked((p) => ({ ...p, [r.room]: !p[r.room] }))}
                      className={cx('h-5 w-5 shrink-0 accent-emerald-600', !r.ready && 'invisible')} aria-label={`Show ${roomLabel(r.room)}`} />
                    <span className={cx('hidden shrink-0 sm:block', !r.ready && 'opacity-50')}><SheetThumb d={(r.sheets[0] || r.later[0]) as ReviewDrawing} className="w-[84px]" /></span>
                    <span className={cx('min-w-0 flex-[1_1_220px]', !r.ready && 'opacity-70')}>
                      <span className="block text-base font-bold text-slate-800">{roomLabel(r.room)}</span>
                      <span className="block text-sm text-slate-600">
                        {r.ready ? `${r.sheets.map((d) => `${d.name} v${d.review?.versionNo}`).join(', ')}${r.later.length ? '.' : ''}` : `${r.why}.`}
                        {r.ready && r.later.length ? ` ${plural(r.later.length, 'drawing')} not ${presenter && !canRun ? 'yours or not ' : ''}approved yet, left out.` : ''}
                      </span>
                      {who.length > 0 && <span className="mt-0.5 flex items-center gap-1 text-xs font-bold text-emerald-700"><UserCheck size={13} aria-hidden />{who.map(nameOf).join(', ')} can present</span>}
                    </span>
                    {r.ready
                      ? included !== null
                        ? <Tag tone={nextRoundCharged(u, included) ? 'you' : 'good'} title={nextRoundCharged(u, included) ? 'A change in this room starts a round that can be charged' : undefined}>{roundsLine(u, included)}</Tag>
                        : <Tag tone="good">Ready to show</Tag>
                      : <Tag tone="you">Not ready yet</Tag>}
                  </label>
                );
              })}
            </div>
          )}
          {presenter && !canRun && !ready.length && rooms.length > 0 && <p className="mt-2 text-sm text-slate-500">You show the approved drawings the Design Head gives you. Ask them to add you under "Who presents".</p>}
        </div>

        {canStart && !open && ready.length > 0 && <>
          <div>
            <StepHead n={2} title="Who is attending" line="Their names go on the meeting record." />
            <label className="mt-3 flex items-center gap-2">
              <Users size={18} className="shrink-0 text-slate-400" aria-hidden />
              <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="Mrs Mehta, Mr Mehta" aria-label="Who is attending" className={field} />
            </label>
          </div>

          <div>
            <StepHead n={3} title="How will the client see the drawings?" line="Pick one. You can change it at the next meeting." />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="How the client sees the drawings">
              {(['room', 'call'] as MeetingWay[]).map((k) => {
                const on = way === k;
                const Icon = k === 'room' ? Tv : MonitorUp;
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setWay(k)}
                    className={cx('flex min-h-[76px] items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors', on ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300')}>
                    <span className={cx('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl', on ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500')}><Icon size={18} aria-hidden /></span>
                    <span className="min-w-0"><span className="block text-base font-bold text-slate-800">{WAYS[k].title}</span><span className="block text-sm text-slate-600">{WAYS[k].line}</span></span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <MapPinned size={20} className="shrink-0 text-amber-600" aria-hidden />
              <span className="min-w-0 flex-[1_1_220px]">
                <b className="block text-sm text-slate-800">Show the layout plan beside each room</b>
                <span className="block text-sm text-slate-600">{plan ? `${Object.keys(marks).length} of ${plural(allRooms.length, 'room')} marked on it. The room you show is outlined.` : plans.length ? 'No plan will be shown.' : 'Approve a layout plan first to show it here.'}</span>
              </span>
              {plans.length > 0 && (
                <select value={plan?.id || ''} onChange={(e) => setPlanId(e.target.value)} aria-label="Layout plan" className={cx(field, 'max-w-[260px] font-semibold')}>
                  {plans.map((d) => <option key={d.id} value={d.id}>{d.name} · v{d.review?.versionNo}</option>)}
                  <option value="">Do not show a plan</option>
                </select>
              )}
              {plan && <Btn kind="plain" onClick={() => setMarking(true)}>{Object.keys(marks).length ? 'Edit the room marks' : 'Mark the rooms on it'}</Btn>}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <span className="text-sm text-slate-500">{chosen.length ? `${plural(chosen.length, 'room')} to show.` : 'Tick at least one room to show.'}</span>
            <Btn kind="primary" big icon={busy === 'start' ? Loader2 : Presentation} disabled={!chosen.length || !!busy} onClick={start}
              className={busy === 'start' ? '[&>svg]:animate-spin' : undefined}>Start the meeting</Btn>
          </div>
        </>}
        {!canStart && <p className="text-sm text-slate-500">The Design Head, the Owner, an Admin or the project's designer runs design meetings.</p>}
      </Card>

      {canStart && (
        <>
          <SectionTitle hint="In person, on WhatsApp or by email">Showed drawings another way?</SectionTitle>
          <Card className="flex flex-wrap items-center gap-4 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><History size={20} aria-hidden /></span>
            <div className="min-w-0 flex-[1_1_260px]">
              <p className="text-base font-bold text-slate-800">Record it, so the approval days still start</p>
              <p className="text-sm text-slate-600">The drawings go to the client for approval, just as they would after a meeting here.</p>
            </div>
            <Btn kind="plain" onClick={() => setOutside(true)}>Record it</Btn>
          </Card>
        </>
      )}

      <SectionTitle hint="Reminders go by themselves on working days 3 and 5">Waiting for the client's answer</SectionTitle>
      {meetings === null ? <Card className="grid place-items-center py-8 text-slate-400"><Loader2 className="animate-spin" aria-label="Loading" /></Card>
        : waiting.length ? (
          <div className="flex flex-col gap-3">
            {waiting.map((m, i) => (
              <Card key={m.id} delay={Math.min(i, 8) * 40} className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Clock size={18} className="text-amber-600" aria-hidden />
                  <b className="text-base text-slate-800">{m.outside ? 'Shown outside the desk' : 'Meeting'} on {shortDate(m.closedAt || m.startedAt)}</b>
                  <span className="text-sm text-slate-500">{m.rooms.filter((r) => r.outcome === 'agreed').flatMap((r) => r.sheets.map((s) => sheetLine(r.room, s.name))).join(', ')}</span>
                </div>
                <ClientApproval orgId={orgId} projectId={projectId} m={m} mine={mine(m) || !!approver} lead={canRun} me={me} />
              </Card>
            ))}
          </div>
        ) : <Card className="px-5 py-5 text-sm text-slate-600">Nothing is waiting for the client.</Card>}

      {charges.length > 0 && canBill && (
        <>
          <SectionTitle hint="Rounds past the ones included in the client's terms">Revision rounds to bill</SectionTitle>
          <Card className="divide-y divide-slate-100 px-2">
            {charges.map(({ meeting, room }) => (
              <BillRow key={`${meeting.id}/${room.room}`} meeting={meeting} room={room}
                save={async (patch) => { await updateCharge(target, meeting.id, room.room, patch); }} />
            ))}
          </Card>
        </>
      )}

      <SectionTitle hint={closed.length ? plural(closed.length, 'meeting') : undefined}>Past meetings</SectionTitle>
      {meetings === null ? null : !closed.length ? <Card className="px-5 py-5 text-sm text-slate-600">None yet for this project.</Card> : (
        <Card className="divide-y divide-slate-100 px-2">
          {closed.map((m) => {
            const isOpen = openPast === m.id;
            const stage = needsApproval(m) ? approvalStage(m) : null;
            const lines = isOpen ? minutesOf({ meeting: m }) : [];
            return (
              <div key={m.id}>
                <button type="button" onClick={() => setOpenPast(isOpen ? null : m.id)} aria-expanded={isOpen} className="flex min-h-[60px] w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-slate-50">
                  <CalendarCheck size={20} className="shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold text-slate-800">{shortDate(m.closedAt || m.startedAt)} · {m.outside ? 'Shown outside the desk' : meetingSummary(m)}</span>
                    <span className="block truncate text-sm text-slate-500">{[m.attendees, `shown by ${firstName(m.startedBy?.name)}`].filter(Boolean).join(' · ')}</span>
                  </span>
                  {stage === 'approved' ? <Tag tone="good" icon={BadgeCheck}>Approved by the client</Tag>
                    : stage === 'changes' ? <Tag tone="bad">Client asked for changes</Tag>
                    : stage === 'overdue' ? <Tag tone="bad">No answer yet</Tag>
                    : stage ? <Tag tone="you">Waiting for the client</Tag>
                    : isConfirmed(m) ? <Tag tone="good" icon={BadgeCheck}>Signed</Tag> : null}
                  <ChevronRight size={18} className={cx('shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-90')} aria-hidden />
                </button>
                {isOpen && (
                  <div className="hud-panel-in flex flex-col gap-3 px-3 pb-4 pt-1">
                    {m.rooms.map((r) => <RoomResult key={r.room} r={r} included={m.includedRounds} studio={canBill} />)}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <b className="flex-1 text-sm text-slate-800">Minutes</b>
                        <CopyMinutes title={meetingTitle(m, shortDate)} lines={lines} />
                      </div>
                      <MinutesList lines={canBill ? lines : lines.filter((l) => !l.studio)} />
                    </div>
                    <ClientApproval orgId={orgId} projectId={projectId} m={m} mine={mine(m) || !!approver} lead={canRun} me={me} />
                    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                      {isConfirmed(m) ? <BadgeCheck size={18} className="shrink-0 text-emerald-600" aria-hidden /> : <Clock size={18} className="shrink-0 text-amber-600" aria-hidden />}
                      <span className="min-w-0 flex-[1_1_240px]">
                        <b className="text-slate-800">{confirmationLine(m.confirmation, shortDate)}</b>
                        <span className="block text-slate-500">
                          {isConfirmed(m)
                            ? (m.confirmation!.via === 'studio' ? `Taken on the studio's screen by ${firstName(m.confirmation!.recordedBy?.name)}.` : 'Confirmed in their portal.')
                            : 'If the client is with you, they can sign the record here. Their signature counts as their written approval of the agreed rooms.'}
                        </span>
                      </span>
                      {m.confirmation?.signature && <img src={m.confirmation.signature} alt={`Signature of ${m.confirmation.name}`} className="h-12 max-w-[180px] rounded-lg border border-slate-200 bg-white object-contain" />}
                      {!isConfirmed(m) && mine(m) && <Btn kind="plain" icon={PenLine} onClick={() => setSigning(m)}>Client signs here</Btn>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {signing && <ClientSign orgId={orgId} projectId={projectId} meeting={signing} onClose={() => setSigning(null)} />}
      {giving && <Presenters orgId={orgId} projectId={projectId} projectName={projectName} drawings={drawings} designers={designers} onClose={() => setGiving(false)} />}
      {marking && plan && (
        <LayoutRooms orgId={orgId} projectId={projectId} rooms={allRooms} initial={marks} onClose={() => setMarking(false)} turn={planTurn}
          sheet={{ drawingId: plan.id, name: plan.name, versionNo: plan.review?.versionNo || 1, pdfPath: plan.review?.pdfPath || null }} />
      )}
      {outside && <RecordOutside orgId={orgId} projectId={projectId} onClose={() => setOutside(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------ drawings shown outside the desk */

const HOWS = ['In person', 'On WhatsApp', 'By email', 'On a phone or video call'];

const RecordOutside: React.FC<{ orgId: string; projectId: string; onClose: () => void }> = ({ orgId, projectId, onClose }) => {
  const toast = useToast();
  const [list, setList] = useState<{ drawingId: string; name: string; room: string; versionNo: number }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [how, setHow] = useState(HOWS[0]);
  const today = new Date().toISOString().slice(0, 10);
  const [on, setOn] = useState(today);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listApprovable({ orgId, projectId }).then((r) => setList(r?.drawings || [])).catch((e) => { setList([]); setErr(e?.message || 'The drawings could not be loaded.'); });
  }, [orgId, projectId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, onClose]);
  const byRoom = useMemo(() => {
    const m = new Map<string, NonNullable<typeof list>>();
    (list || []).forEach((d) => m.set(d.room, [...(m.get(d.room) || []), d]));
    return [...m.entries()];
  }, [list]);
  const picked = (list || []).filter((d) => ticked[d.drawingId]).map((d) => d.drawingId);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await recordPresentedOutside({ orgId, projectId }, picked, `Shown ${how.replace(/^./, (x) => x.toLowerCase())}`, new Date(`${on}T12:00:00+05:30`).getTime());
      toast({ ok: true, title: `Recorded: ${plural(picked.length, 'drawing')} shown ${how.replace(/^./, (x) => x.toLowerCase())}`, sub: 'Send the approval email from "Waiting for the client\'s answer". The client then has 5 working days.' });
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Not recorded.');
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[300] grid place-items-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Record drawings shown outside the desk">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }} />
      <div className="phd-pop relative w-full max-w-[600px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 px-6 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-800">Record drawings shown outside the desk</h2>
            <p className="mt-1 text-sm text-slate-600">Use this when you showed drawings in person, on WhatsApp or by email. They then wait for the client's approval in writing, as after a meeting here.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="max-h-[46vh] overflow-auto px-6">
          {list === null ? <div className="grid place-items-center py-8 text-slate-400"><Loader2 className="animate-spin" aria-label="Loading" /></div>
            : !list.length ? <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">{err || 'No drawing is waiting to be shown: none is approved by the Design Head for the client, or the client has already approved them.'}</p>
            : byRoom.map(([room, ds]) => (
              <fieldset key={room} className="mb-3">
                <legend className="mb-1 text-sm font-bold text-slate-800">{roomLabel(room)}</legend>
                {ds.map((d) => (
                  <label key={d.drawingId} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 text-sm text-slate-700 hover:bg-slate-50">
                    <input type="checkbox" checked={!!ticked[d.drawingId]} disabled={busy} onChange={(e) => setTicked((t) => ({ ...t, [d.drawingId]: e.target.checked }))} className="h-5 w-5 accent-emerald-600" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">v{d.versionNo}</span>
                  </label>
                ))}
              </fieldset>
            ))}
        </div>
        {!!list?.length && (
          <div className="grid grid-cols-1 gap-3 px-6 pt-2 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">How did you show them?
              <select value={how} onChange={(e) => setHow(e.target.value)} className={cx(field, 'mt-1 font-normal')}>{HOWS.map((h) => <option key={h}>{h}</option>)}</select>
            </label>
            <label className="text-sm font-bold text-slate-700">When?
              <input type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} className={cx(field, 'mt-1 font-normal')} />
            </label>
          </div>
        )}
        {err && !!list?.length && <p className="px-6 pt-2 text-sm text-rose-700">{err}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <Btn kind="plain" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind="primary" icon={busy ? Loader2 : Check} disabled={!picked.length || busy || !on} onClick={save} className={busy ? '[&>svg]:animate-spin' : undefined}>Save the record</Btn>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------ a revision round to bill or waive */

type Patch = { status?: 'to_bill' | 'billed' | 'waived'; fee?: string | number | null; ref?: string };

const BillRow: React.FC<{ meeting: DesignMeeting; room: MeetingRoom; save: (p: Patch) => Promise<void> }> = ({ meeting, room, save }) => {
  const toast = useToast();
  const c = room.charge!;
  const [fee, setFee] = useState(c.fee === null ? '' : String(c.fee));
  const [ref, setRef] = useState(c.ref || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setFee(c.fee === null ? '' : String(c.fee)); setRef(c.ref || ''); }, [c.fee, c.ref]);
  const run = async (patch: Patch, done: string) => {
    setBusy(true);
    try { await save(patch); toast({ ok: true, title: done, sub: `${roomLabel(room.room)}, round ${room.round}` }); }
    catch (e: any) { toast({ title: 'Not saved', sub: e?.message }); }
    finally { setBusy(false); }
  };
  const small = 'min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
      <ReceiptText size={20} className="shrink-0 text-rose-500" aria-hidden />
      <span className="min-w-0 flex-[1_1_220px]">
        <span className="block text-base font-bold text-slate-800">{roomLabel(room.room)} · round {room.round} of {meeting.includedRounds} included</span>
        <span className="block text-sm text-slate-500">Meeting on {shortDate(meeting.closedAt)} · {plural(room.changes.length, 'change')}{c.ref ? ` · billed on ${c.ref}` : ''}</span>
      </span>
      <Tag tone={c.status === 'to_bill' ? 'bad' : c.status === 'billed' ? 'good' : 'plain'}>{c.status === 'to_bill' ? 'To bill' : c.status === 'billed' ? 'Billed' : 'Waived'}{c.fee !== null && c.status !== 'to_bill' ? ` · ${inr(c.fee)}` : ''}</Tag>
      {c.status === 'to_bill' ? (
        <span className="flex flex-wrap items-center gap-2">
          <label className={cx(small, 'flex items-center gap-1 focus-within:border-emerald-600')}>
            <IndianRupee size={14} className="text-slate-400" aria-hidden />
            <input value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="Fee" aria-label={`Fee for ${room.room}, before GST`} className="w-20 bg-transparent outline-none" />
          </label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Invoice no." aria-label="Invoice number" className={cx(small, 'w-32')} />
          <Btn kind="primary" disabled={busy || !fee} onClick={() => run({ status: 'billed', fee, ref }, 'Marked billed')}>Mark billed</Btn>
          <Btn kind="quiet" disabled={busy} onClick={() => run({ status: 'waived', fee: fee || null }, 'Waived')}>Waive</Btn>
        </span>
      ) : <Btn kind="quiet" disabled={busy} onClick={() => run({ status: 'to_bill' }, 'Back on the list to bill')}>Undo</Btn>}
    </div>
  );
};
