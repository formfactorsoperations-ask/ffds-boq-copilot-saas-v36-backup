import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarCheck, Check, ChevronRight, Clock, History, IndianRupee, Loader2, PenLine, Presentation, ReceiptText, Undo2, Users, X } from 'lucide-react';
import { presentableRooms, revisionCharges, meetingSummary, plural, confirmationLine, isConfirmed, type DesignMeeting, type MeetingRoom } from '../../lib/designMeeting';
import { startMeeting, cancelMeeting, updateCharge } from '../../services/designMeetingService';
import type { ReviewDrawing } from '../../services/drawingReviewService';
import { roomLabel, shortDate, firstName, useToast } from './ui';
import { Chip, ProjectMark, SectionHead, TONE } from './DeskParts';
import ClientSign from './ClientSign';

/*
  MEETINGS: presenting approved rooms to the client.

  Pick the rooms that are ready (every client sheet approved by the Design
  Head), start, and present them one by one. Below: the revision rounds past
  the included ones, with their fee and whether they were billed or waived,
  and the meetings already held.
*/

interface Props {
  orgId: string;
  projectId: string | null;
  projectName: string;
  look: { code: string; color: string; soft: string } | null;
  drawings: ReviewDrawing[];
  meetings: DesignMeeting[] | null;
  canRun: boolean;
  canBill: boolean;
  onResume: (m: DesignMeeting) => void;
  projects: { id: string; name: string; code: string; color: string }[];
  onPickProject: (id: string) => void;
}

const inr = (n: number | null) => (n === null ? '' : `₹${n.toLocaleString('en-IN')}`);
const CHARGE: Record<string, { label: string; tone: 'red' | 'green' | 'grey' }> = {
  to_bill: { label: 'To bill', tone: 'red' }, billed: { label: 'Billed', tone: 'green' }, waived: { label: 'Waived', tone: 'grey' },
};

export default function Meetings({ orgId, projectId, projectName, look, drawings, meetings, canRun, canBill, onResume, projects, onPickProject }: Props) {
  const toast = useToast();
  const rooms = useMemo(() => presentableRooms(drawings), [drawings]);
  const ready = rooms.filter((r) => r.ready);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [attendees, setAttendees] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [openPast, setOpenPast] = useState<string | null>(null);
  const [signing, setSigning] = useState<DesignMeeting | null>(null);
  useEffect(() => { setPicked(Object.fromEntries(ready.map((r) => [r.room, true]))); }, [projectId, ready.map((r) => r.room).join('|')]);

  if (!projectId) {
    return (
      <div className="dd-rise rounded-[18px] border border-[#E4E4DE] bg-white px-6 py-6">
        <div className="font-display text-[21px] font-semibold">Pick the project you are meeting about</div>
        <p className="mt-1 text-[#5F636D]">A design meeting presents one project's ready rooms.</p>
        <div className="mt-4 grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {projects.map((p) => (
            <button key={p.id} type="button" onClick={() => onPickProject(p.id)} className="flex min-h-[56px] items-center gap-3 rounded-[14px] border border-[#E4E4DE] bg-white px-3 text-left transition hover:border-[#A9AAA2]">
              <ProjectMark code={p.code} color={p.color} size={34} />
              <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
              <ChevronRight size={16} className="text-[#8A8E97]" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  const open = (meetings || []).find((m) => m.state === 'OPEN') || null;
  const closed = (meetings || []).filter((m) => m.state === 'CLOSED');
  const charges = revisionCharges(meetings || []);
  const chosen = ready.filter((r) => picked[r.room]).map((r) => r.room);
  const target = { orgId, projectId };

  const start = async () => {
    setBusy('start');
    try {
      const m = await startMeeting(target, chosen, attendees.trim());
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
    <div className="flex flex-col gap-4">
      {open && (
        <div className="dd-rise flex flex-wrap items-center gap-3 rounded-[18px] border-[1.5px] px-5 py-4" style={{ borderColor: look?.color || '#4146C8', background: look?.soft || '#ECEDFB' }}>
          <Presentation size={22} style={{ color: look?.color || '#4146C8' }} />
          <div className="min-w-0 flex-[1_1_260px]">
            <div className="font-bold">A meeting is in progress</div>
            <div className="text-[13px] text-[#4F535C]">Started {shortDate(open.startedAt)} by {firstName(open.startedBy?.name)} · {plural(open.rooms.length, 'room')} · {meetingSummary(open)}</div>
          </div>
          {canRun && <>
            <button type="button" onClick={() => cancel(open)} disabled={!!busy} className="min-h-[40px] rounded-[10px] px-3 text-[13px] font-bold text-[#4F535C] hover:bg-white/70 disabled:opacity-45">Cancel meeting</button>
            <button type="button" onClick={() => onResume(open)} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#4146C8] px-[18px] text-[14px] font-bold text-white hover:bg-[#3439AD]">Resume<ChevronRight size={16} /></button>
          </>}
        </div>
      )}

      <section className="dd-rise rounded-[18px] border border-[#E4E4DE] bg-white px-2.5 pb-3 pt-2">
        <SectionHead icon={Presentation} tone="indigo" title="Next design meeting" sub={`${projectName}: rooms whose client drawings are all approved`} />
        {rooms.length === 0 ? (
          <div className="px-3 pb-3 pt-2 text-[13px] text-[#5F636D]">No drawings for the client in this project yet.</div>
        ) : (
          <div className="flex flex-col">
            {rooms.map((r) => (
              <label key={r.room} className={`flex items-center gap-3 border-t border-[#EEEEEA] px-3 py-3 first:border-t-0 ${r.ready ? 'cursor-pointer' : 'opacity-60'}`}>
                <input type="checkbox" checked={r.ready && !!picked[r.room]} disabled={!r.ready || !canRun || !!open} onChange={() => setPicked((p) => ({ ...p, [r.room]: !p[r.room] }))}
                  className="h-[18px] w-[18px] accent-[#4146C8]" aria-label={`Present ${roomLabel(r.room)}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{roomLabel(r.room)}</span>
                  <span className="block truncate text-[12.5px] text-[#5F636D]">{r.ready ? r.sheets.map((d) => `${d.name} v${d.review?.versionNo}`).join(' · ') : r.why}</span>
                </span>
                <Chip tone={r.ready ? 'indigo' : 'grey'}>{r.ready ? 'Ready to present' : 'Not ready'}</Chip>
              </label>
            ))}
          </div>
        )}
        {canRun && !open && ready.length > 0 && (
          <div className="mt-2 flex flex-wrap items-end gap-3 border-t border-[#EEEEEA] px-3 pt-3">
            <label className="min-w-0 flex-[1_1_260px]">
              <span className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold"><Users size={14} />Who is in the meeting <span className="font-medium text-[#8A8E97]">(optional)</span></span>
              <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="Rahul and Priya Mehta"
                className="min-h-[44px] w-full rounded-[10px] border border-[#DCDCD5] px-3 text-[13.5px] outline-none focus:border-[#4146C8] focus:shadow-[0_0_0_3px_rgba(65,70,200,0.15)]" />
            </label>
            <button type="button" onClick={start} disabled={!chosen.length || !!busy}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#4146C8] px-[18px] text-[14px] font-bold text-white hover:bg-[#3439AD] disabled:opacity-45">
              {busy === 'start' ? <Loader2 size={16} className="animate-spin" /> : <Presentation size={16} />}
              {chosen.length ? `Present ${plural(chosen.length, 'room')}` : 'Pick a room to present'}
            </button>
          </div>
        )}
        {!canRun && <div className="px-3 pt-2 text-[12.5px] text-[#5F636D]">The Design Head, the Owner or an Admin runs design meetings.</div>}
      </section>

      {charges.length > 0 && (
        <section className="dd-rise rounded-[18px] border border-[#E4E4DE] bg-white px-2.5 pb-2.5 pt-2">
          <SectionHead icon={ReceiptText} tone="red" title="Revisions to bill" count={charges.filter((c) => c.room.charge?.status === 'to_bill').length}
            sub="Rounds past the ones included in the client's terms" />
          {charges.map(({ meeting, room }) => (
            <ChargeRow key={`${meeting.id}/${room.room}`} meeting={meeting} room={room} canBill={canBill}
              save={async (patch) => { await updateCharge(target, meeting.id, room.room, patch); }} />
          ))}
        </section>
      )}

      <section className="dd-rise rounded-[18px] border border-[#E4E4DE] bg-white px-2.5 pb-2.5 pt-2">
        <SectionHead icon={History} tone="grey" title="Past meetings" count={closed.length} />
        {meetings === null ? <div className="grid place-items-center py-6"><Loader2 className="animate-spin text-[#8A8E97]" /></div>
          : !closed.length ? <div className="px-3 pb-3 pt-1 text-[13px] text-[#5F636D]">None yet for this project.</div>
          : closed.map((m) => {
            const isOpen = openPast === m.id;
            return (
              <div key={m.id} className="border-t border-[#EEEEEA] first:border-t-0">
                <button type="button" onClick={() => setOpenPast(isOpen ? null : m.id)} aria-expanded={isOpen} className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-[#F6F6F2]">
                  <CalendarCheck size={18} className="shrink-0 text-[#5F636D]" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{shortDate(m.closedAt || m.startedAt)} · {meetingSummary(m)}</span>
                    <span className="block truncate text-[12.5px] text-[#5F636D]">{[m.attendees, `presented by ${firstName(m.startedBy?.name)}`].filter(Boolean).join(' · ')}</span>
                  </span>
                  {isConfirmed(m)
                    ? <Chip tone="green" icon={BadgeCheck} small>{m.confirmation!.via === 'portal' ? 'Confirmed in portal' : 'Signed'}</Chip>
                    : <Chip tone="amber" icon={Clock} small>Awaiting client</Chip>}
                  <ChevronRight size={16} className="shrink-0 text-[#8A8E97] transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                </button>
                {isOpen && (
                  <div className="dd-rise flex flex-col gap-2 px-4 pb-4 pt-1">
                    {m.rooms.map((r) => <RoomRecord key={r.room} r={r} included={m.includedRounds} />)}
                    <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#E4E4DE] px-3.5 py-3 text-[13px]">
                      {isConfirmed(m) ? <BadgeCheck size={18} className="shrink-0 text-[#1B6E4F]" /> : <Clock size={18} className="shrink-0 text-[#8F4C07]" />}
                      <span className="min-w-0 flex-[1_1_240px]">
                        <b>{confirmationLine(m.confirmation, shortDate)}</b>
                        <span className="block text-[12.5px] text-[#5F636D]">
                          {isConfirmed(m)
                            ? (m.confirmation!.via === 'studio' ? `Taken on the studio's screen by ${firstName(m.confirmation!.recordedBy?.name)}.` : 'Signed in to their portal; their login, address and the time are recorded.')
                            : 'The client sees this meeting in their portal and can confirm it there, or sign here if they are with you.'}
                        </span>
                      </span>
                      {m.confirmation?.signature && <img src={m.confirmation.signature} alt={`Signature of ${m.confirmation.name}`} className="h-12 max-w-[180px] rounded-lg border border-[#EEEEEA] bg-white object-contain" />}
                      {!isConfirmed(m) && canRun && (
                        <button type="button" onClick={() => setSigning(m)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#DCDCD5] bg-white px-3.5 text-[13px] font-bold hover:border-[#A9AAA2]">
                          <PenLine size={15} />Client signs here
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </section>
      {signing && <ClientSign orgId={orgId} projectId={projectId} meeting={signing} onClose={() => setSigning(null)} />}
    </div>
  );
}

export const RoomRecord: React.FC<{ r: MeetingRoom; included: number }> = ({ r, included }) => {
  const tone = r.outcome === 'agreed' ? 'green' : r.outcome === 'changes' ? 'amber' : 'grey';
  return (
    <div className="rounded-[14px] bg-[#F6F6F2] px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <b>{roomLabel(r.room)}</b>
        <Chip tone={tone} icon={r.outcome === 'agreed' ? Check : r.outcome === 'changes' ? Undo2 : undefined}>
          {r.outcome === 'agreed' ? 'Agreed' : r.outcome === 'changes' ? plural(r.changes.length, 'change') : 'Not discussed'}
        </Chip>
        {r.round > 0 && <Chip tone={r.round > included ? 'red' : 'grey'}>Round {r.round} of {included} included</Chip>}
        {r.charge && <Chip tone={CHARGE[r.charge.status].tone}>{CHARGE[r.charge.status].label}{r.charge.fee !== null ? ` · ${inr(r.charge.fee)}` : ''}</Chip>}
      </div>
      <div className="mt-1 text-[12.5px] text-[#5F636D]">{r.sheets.map((s) => `${s.name} v${s.versionNo}`).join(' · ')}</div>
      {r.changes.map((c) => <div key={c.n} className="mt-1 text-[13px]"><b className="text-[#8F4C07]">{c.n}.</b> {c.text} <span className="text-[#8A8E97]">({r.sheets.find((s) => s.drawingId === c.drawingId)?.name})</span></div>)}
    </div>
  );
};

type ChargeProps = { meeting: DesignMeeting; room: MeetingRoom; canBill: boolean; save: (p: { status?: 'to_bill' | 'billed' | 'waived'; fee?: string | number | null; ref?: string }) => Promise<void> };

const ChargeRow: React.FC<ChargeProps> = ({ meeting, room, canBill, save }) => {
  const toast = useToast();
  const c = room.charge!;
  const [fee, setFee] = useState(c.fee === null ? '' : String(c.fee));
  const [ref, setRef] = useState(c.ref || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setFee(c.fee === null ? '' : String(c.fee)); setRef(c.ref || ''); }, [c.fee, c.ref]);
  const run = async (patch: Parameters<typeof save>[0], done: string) => {
    setBusy(true);
    try { await save(patch); toast({ ok: true, title: done, sub: `${roomLabel(room.room)}, round ${room.round}` }); }
    catch (e: any) { toast({ title: 'Not saved', sub: e?.message }); }
    finally { setBusy(false); }
  };
  const t = TONE[CHARGE[c.status].tone];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[#EEEEEA] px-3 py-3 first:border-t-0">
      <span className="min-w-0 flex-[1_1_220px]">
        <span className="block font-bold">{roomLabel(room.room)} · round {room.round} of {meeting.includedRounds} included</span>
        <span className="block text-[12.5px] text-[#5F636D]">Meeting {shortDate(meeting.closedAt)} · {plural(room.changes.length, 'change')}{c.ref ? ` · billed on ${c.ref}` : ''}</span>
      </span>
      <span className="inline-flex h-[26px] items-center rounded-full px-2.5 text-[12px] font-bold" style={{ background: t.bg, color: t.ink }}>{CHARGE[c.status].label}{c.fee !== null && c.status !== 'to_bill' ? ` · ${inr(c.fee)}` : ''}</span>
      {canBill && c.status === 'to_bill' && (
        <span className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-[38px] items-center gap-1 rounded-[10px] border border-[#DCDCD5] bg-white px-2 focus-within:border-[#4146C8]">
            <IndianRupee size={14} className="text-[#6B6F78]" />
            <input value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="Fee" aria-label={`Fee for ${room.room}, before GST`} className="w-20 bg-transparent text-[13px] outline-none" />
          </label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Invoice no." aria-label="Invoice number" className="min-h-[38px] w-28 rounded-[10px] border border-[#DCDCD5] px-2 text-[13px] outline-none focus:border-[#4146C8]" />
          <button type="button" disabled={busy || !fee} onClick={() => run({ status: 'billed', fee, ref }, 'Marked billed')} className="min-h-[38px] rounded-[10px] bg-[#1F7A57] px-3 text-[13px] font-bold text-white disabled:opacity-45">Mark billed</button>
          <button type="button" disabled={busy} onClick={() => run({ status: 'waived', fee: fee || null }, 'Waived')} className="min-h-[38px] rounded-[10px] px-3 text-[13px] font-bold text-[#4F535C] hover:bg-[#EBEBE5] disabled:opacity-45">Waive</button>
        </span>
      )}
      {canBill && c.status !== 'to_bill' && (
        <button type="button" disabled={busy} onClick={() => run({ status: 'to_bill' }, 'Back to be billed')} className="inline-flex min-h-[36px] items-center gap-1 rounded-[10px] px-3 text-[12.5px] font-bold text-[#4F535C] hover:bg-[#EBEBE5] disabled:opacity-45"><X size={13} />Undo</button>
      )}
    </div>
  );
};
