import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BadgeCheck, Check, ChevronLeft, ChevronRight, Download, ListChecks, Loader2, MapPin, MapPinned, Maximize2, Minimize2, Minus, PenLine, Plus, Presentation, ReceiptText, RotateCw, Trash2, Undo2 } from 'lucide-react';
import { clientRoundsByRoom, isOverIncluded, plural, type DesignMeeting, type MeetingChange, type RoomOutcome } from '../../lib/designMeeting';
import type { MarkShape, ReviewMark, Turn } from '../../lib/drawingReview';
import { decideRoom, closeMeeting } from '../../services/designMeetingService';
import { fileUrl } from '../../services/drawingReviewService';
import PdfStage from './PdfStage';
import { CLIENT, roomLabel, useToast } from './ui';
import { Chip, ProjectMark } from './DeskParts';
import { RoomRecord } from './Meetings';
import ClientSign from './ClientSign';
import { LayoutPanel } from './LayoutPlan';

/*
  MEETING MODE: one room at a time, full width, on the versions the Design
  Head approved. For each room the client agrees, or asks for changes, which
  are pinned on the drawing where they asked. Every decision is saved as it
  is made, so a meeting can be left and resumed. Finishing shows what was
  decided; a round past the included ones is billed or waived; saving pins
  the changes on the sheets for the Design Head.
*/

interface Props {
  orgId: string;
  projectId: string;
  projectName: string;
  look: { code: string; color: string; soft: string };
  meeting: DesignMeeting;
  meetings: DesignMeeting[];
  onExit: (to?: 'foryou') => void;
}

type Draft = { shape: MarkShape; page: number; text: string };

/* The same per-drawing rotation the review screen remembers, so a sheet turned there is turned here too. */
const turnKey = (projectId: string, drawingId: string) => `ffds_dr_turn_${projectId}_${drawingId}`;
const savedTurn = (projectId: string, drawingId: string): Turn => {
  try { const v = Number(JSON.parse(localStorage.getItem(turnKey(projectId, drawingId)) || '0')); return ([0, 90, 180, 270].includes(v) ? v : 0) as Turn; } catch { return 0; }
};

/* How the layout plan sits beside the drawing, remembered on this device. */
type PlanMode = 'inset' | 'side' | 'off';
const PLAN_KEY = 'ffds_meeting_plan';
const savedPlanMode = (): PlanMode => { try { const v = localStorage.getItem(PLAN_KEY); return v === 'side' || v === 'off' ? v : 'inset'; } catch { return 'inset'; } };

const MeetingMode: React.FC<Props> = ({ orgId, projectId, projectName, look, meeting, meetings, onExit }) => {
  const toast = useToast();
  const target = { orgId, projectId };
  const [local, setLocal] = useState(meeting);
  useEffect(() => { if (meeting.rev >= local.rev) setLocal(meeting); }, [meeting]);
  const m = local;
  const [step, setStep] = useState<'present' | 'wrap' | 'done'>(m.state === 'CLOSED' ? 'done' : 'present');
  const [at, setAt] = useState(() => Math.max(0, m.rooms.findIndex((r) => !r.outcome)));
  const [sheet, setSheet] = useState(0);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pinning, setPinning] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [changes, setChanges] = useState<Record<string, MeetingChange[]>>(() => Object.fromEntries(m.rooms.map((r) => [r.room, r.changes])));
  const [busy, setBusy] = useState(false);
  const [charges, setCharges] = useState<Record<string, 'to_bill' | 'waived'>>({});
  const [turns, setTurns] = useState<Record<string, Turn>>({});
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);

  /* Full-screen presentation, for sharing the screen with the client. */
  const [full, setFull] = useState(false);
  const fullRef = useRef<HTMLDivElement>(null);
  const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 900));
  const [planMode, setPlanModeRaw] = useState<PlanMode>(savedPlanMode);
  const setPlanMode = (p: PlanMode) => { setPlanModeRaw(p); try { localStorage.setItem(PLAN_KEY, p); } catch { /* storage off */ } };
  const [drawer, setDrawer] = useState(true);
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFs);
    return () => { window.removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onFs); };
  }, []);
  const enterFull = () => {
    setFull(true);
    setTimeout(() => { fullRef.current?.requestFullscreen?.().catch(() => undefined); }, 0);
  };
  const exitFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    setFull(false);
  };

  const used = useMemo(() => clientRoundsByRoom(meetings, m.id), [meetings, m.id]);
  const room = m.rooms[at] || m.rooms[0];
  const sh = room.sheets[sheet] || room.sheets[0];
  const mine = changes[room.room] || [];
  const nextRound = (used[room.room] || 0) + 1;
  const over = isOverIncluded(nextRound, m.includedRounds);
  const done = m.rooms.filter((r) => r.outcome).length;

  const turn = turns[sh.drawingId] ?? savedTurn(projectId, sh.drawingId);
  const rotate = () => {
    const n = ((turn + 90) % 360) as Turn;
    setTurns((t) => ({ ...t, [sh.drawingId]: n }));
    try { localStorage.setItem(turnKey(projectId, sh.drawingId), JSON.stringify(n)); } catch { /* storage off */ }
  };
  async function download() {
    if (!sh.pdfPath) return;
    setSaving(true);
    try {
      const a = document.createElement('a');
      a.href = await fileUrl(sh.pdfPath);
      a.download = `${sh.name.replace(/[\\/:*?"<>|]+/g, '-')} v${sh.versionNo}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e: any) {
      toast({ title: 'The PDF did not download', sub: e?.message });
    } finally { setSaving(false); }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (step !== 'present') return;
      const k = e.key.toLowerCase();
      if (k === 'r') rotate();
      if (k === 'c' && !room.outcome) { setPinning((p) => !p); setDraft(null); }
      if (k === 'l' && m.layout) setPlanMode(planMode === 'inset' ? 'side' : planMode === 'side' ? 'off' : 'inset');
      if (e.key === 'ArrowRight' && room.sheets.length > 1) { setSheet((x) => (x + 1) % room.sheets.length); setPage(0); setDraft(null); }
      if (e.key === 'ArrowLeft' && room.sheets.length > 1) { setSheet((x) => (x - 1 + room.sheets.length) % room.sheets.length); setPage(0); setDraft(null); }
      if (e.key === 'Escape' && full && !document.fullscreenElement) exitFull();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const go = (i: number) => { setAt(i); setSheet(0); setPage(0); setPinning(false); setDraft(null); };
  const marks = mine.filter((c) => c.drawingId === sh.drawingId && c.page === page)
    .map((c) => ({ id: `c${c.n}`, n: c.n, page: c.page, shape: c.shape, status: 'OPEN', source: 'client' }) as unknown as ReviewMark);

  async function decide(outcome: RoomOutcome) {
    setBusy(true);
    try {
      const res = await decideRoom(target, m.id, room.room, outcome, outcome === 'changes' ? mine : []);
      if (res) setLocal(res);
      const rooms = res?.rooms || m.rooms;
      const next = rooms.findIndex((r, i) => i > at && !r.outcome);
      const any = rooms.findIndex((r) => !r.outcome);
      toast({ ok: true, title: outcome === 'agreed' ? `${roomLabel(room.room)} agreed` : `${roomLabel(room.room)}: ${plural(mine.length, 'change')} noted`,
        sub: next >= 0 ? `Next: ${roomLabel(rooms[next].room)}` : any >= 0 ? 'One room is still open.' : 'Every room is done. Finish the meeting when you are ready.' });
      if (outcome === 'agreed') setChanges((c) => ({ ...c, [room.room]: [] }));
      const to = next >= 0 ? next : any;
      if (to >= 0) setTimeout(() => go(to), 300);
    } catch (e: any) {
      toast({ title: 'Not saved', sub: e?.message });
    } finally { setBusy(false); }
  }

  function addDraft() {
    if (!draft || !draft.text.trim()) return;
    const list = changes[room.room] || [];
    setChanges({ ...changes, [room.room]: [...list, { n: list.length + 1, drawingId: sh.drawingId, page: draft.page, shape: draft.shape, text: draft.text.trim() }] });
    setDraft(null);
  }
  const removeChange = (n: number) => setChanges({ ...changes, [room.room]: mine.filter((c) => c.n !== n).map((c, i) => ({ ...c, n: i + 1 })) });

  async function save() {
    setBusy(true);
    try {
      const res = await closeMeeting(target, m.id, m.rev, charges);
      if (res) setLocal(res);
      setStep('done');
    } catch (e: any) {
      toast({ title: 'The meeting was not saved', sub: e?.message });
    } finally { setBusy(false); }
  }

  const header = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#E4E4DE] bg-white px-5 py-3">
      <ProjectMark code={look.code} color={look.color} size={34} />
      <div className="min-w-0">
        <div className="font-extrabold">Design meeting · {projectName}</div>
        <div className="truncate text-[12.5px] text-[#5F636D]">{m.attendees ? `With ${m.attendees}` : 'With the client'} · {m.includedRounds} revision round{m.includedRounds === 1 ? '' : 's'} included per room</div>
      </div>
      <span className="flex-1" />
      <div className="flex min-w-[200px] items-center gap-2">
        <span className="whitespace-nowrap text-[12.5px] font-bold">{done} of {m.rooms.length} rooms</span>
        <span className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-[#EEEEEA]"><i className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${(done / m.rooms.length) * 100}%`, background: look.color }} /></span>
      </div>
      {step === 'present' && <>
        <button type="button" onClick={enterFull} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] bg-[#17191E] px-3.5 text-[13px] font-bold text-white hover:bg-black" title="For sharing your screen with the client">
          <Maximize2 size={15} />Present full screen
        </button>
        <button type="button" onClick={() => onExit()} className="min-h-[38px] rounded-[10px] px-3 text-[13px] font-bold text-[#4F535C] hover:bg-[#EBEBE5]" title="The meeting stays open; resume it from Meetings">Leave for now</button>
        <button type="button" onClick={() => setStep('wrap')} disabled={!done} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] border border-[#DCDCD5] bg-white px-3.5 text-[13px] font-bold hover:border-[#A9AAA2] disabled:opacity-45">
          {done === m.rooms.length ? 'Finish the meeting' : 'End meeting'}<ChevronRight size={15} />
        </button>
      </>}
    </div>
  );

  if (step !== 'present') {
    const decided = m.rooms.filter((r) => r.outcome);
    const needCharge = decided.filter((r) => r.outcome === 'changes' && isOverIncluded((used[r.room] || 0) + 1, m.includedRounds));
    const ready = needCharge.every((r) => charges[r.room]);
    const totalChanges = decided.reduce((n, r) => n + (r.outcome === 'changes' ? r.changes.length : 0), 0);
    return (
      <div className="dd-rise -mx-4 -mt-6 md:-mx-5">
        {header}
        <div className="mx-auto flex max-w-[920px] flex-col gap-4 px-5 py-6">
          {step === 'wrap' ? (
            <>
              <button type="button" onClick={() => setStep('present')} className="inline-flex min-h-[38px] items-center gap-1 self-start rounded-[10px] py-0 pl-2 pr-3 text-[13px] font-bold text-[#4F535C] hover:bg-[#EBEBE5]"><ArrowLeft size={15} />Back to the meeting</button>
              <div>
                <h1 className="font-display text-[28px] font-semibold">{m.rooms.filter((r) => r.outcome === 'agreed').length} agreed, {m.rooms.filter((r) => r.outcome === 'changes').length} with changes</h1>
                <p className="text-[#5F636D]">Check it, then save. {m.rooms.length - decided.length ? `${plural(m.rooms.length - decided.length, 'room')} not discussed will not be recorded.` : ''}</p>
              </div>
              <div className="flex flex-col gap-2">{decided.map((r) => <RoomRecord key={r.room} r={{ ...r, round: r.outcome === 'changes' ? (used[r.room] || 0) + 1 : 0 }} included={m.includedRounds} />)}</div>
              {needCharge.map((r) => {
                const round = (used[r.room] || 0) + 1;
                return (
                  <div key={r.room} className="rounded-[14px] bg-[#FCE8EA] px-4 py-3 text-[13.5px] text-[#6E1A22]">
                    <div className="flex items-center gap-2 font-bold"><ReceiptText size={16} />{roomLabel(r.room)} goes to round {round}; {m.includedRounds} {m.includedRounds === 1 ? 'is' : 'are'} included.</div>
                    <div className="mt-0.5">Under the terms this round can be billed. It goes on the list to bill, unless you waive it.</div>
                    <div className="mt-2.5 flex flex-wrap gap-2" role="radiogroup" aria-label={`Billing for ${r.room}`}>
                      {(['to_bill', 'waived'] as const).map((k) => (
                        <button key={k} type="button" role="radio" aria-checked={charges[r.room] === k} onClick={() => setCharges({ ...charges, [r.room]: k })}
                          className="min-h-[38px] rounded-full border px-3.5 text-[13px] font-bold transition" style={charges[r.room] === k ? { background: '#fff', borderColor: k === 'to_bill' ? '#B4232F' : '#4F535C', color: k === 'to_bill' ? '#B4232F' : '#17191E' } : { borderColor: '#F2B8BF', color: '#6E1A22' }}>
                          {k === 'to_bill' ? 'Bill this revision' : 'Waive it this time'}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {totalChanges > 0 && <div className="rounded-[14px] bg-[#FBF1E3] px-4 py-3 text-[13px] text-[#4A2A06]">{totalChanges === 1 ? 'The change goes' : `All ${totalChanges} changes go`} to the Design Head first, pinned on the sheets where the client asked. The Design Head edits them, then sends them to the designer or keeps the sheet approved.</div>}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={save} disabled={busy || !ready || !decided.length} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1F7A57] px-[18px] text-[14px] font-bold text-white hover:bg-[#196649] disabled:opacity-45">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />}Save the meeting
                </button>
              </div>
            </>
          ) : (
            <div className="dd-rise rounded-[18px] border border-[#E4E4DE] bg-white px-6 py-7 text-center">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-[#E3F2EA] text-[#1B6E4F]"><Check size={28} strokeWidth={2.6} /></div>
              <h1 className="font-display text-[26px] font-semibold">Meeting saved</h1>
              <p className="mx-auto mt-1 max-w-[520px] text-[#5F636D]">
                {plural(m.rooms.filter((r) => r.outcome === 'agreed').length, 'room')} agreed on the versions shown.
                {totalChanges ? ` ${plural(totalChanges, 'change')} are waiting for the Design Head under For you.` : ''}
                {needCharge.some((r) => charges[r.room] === 'to_bill' || r.charge?.status === 'to_bill') ? ' Chargeable rounds are on the list to bill in Meetings.' : ''}
              </p>
              {m.confirmation?.at
                ? <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#E3F2EA] px-3 py-1.5 text-[13px] font-bold text-[#134F38]"><BadgeCheck size={15} />Signed by {m.confirmation.name}</p>
                : <p className="mx-auto mt-2 max-w-[520px] text-[13px] text-[#5F636D]">The client can confirm this record in their portal, or sign it here now.</p>}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {!m.confirmation?.at && <button type="button" onClick={() => setSigning(true)} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1F7A57] px-[18px] text-[14px] font-bold text-white hover:bg-[#196649]"><PenLine size={16} />Client signs now</button>}
                <button type="button" onClick={() => onExit()} className="min-h-[44px] rounded-xl border border-[#DCDCD5] bg-white px-[18px] text-[14px] font-bold hover:border-[#A9AAA2]">Back to Meetings</button>
                {totalChanges > 0 && <button type="button" onClick={() => onExit('foryou')} className="min-h-[44px] rounded-xl bg-[#4146C8] px-[18px] text-[14px] font-bold text-white hover:bg-[#3439AD]">Review the client's changes</button>}
              </div>
            </div>
          )}
        </div>
        {signing && <ClientSign orgId={orgId} projectId={projectId} meeting={m} onClose={() => setSigning(false)} onSigned={(x) => setLocal(x)} />}
      </div>
    );
  }

  /* ------------------------------------------------------------ presenting full screen */
  if (full) {
    const box = m.layout?.rooms?.[room.room] || null;
    const side = !!m.layout && planMode === 'side';
    const inset = !!m.layout && planMode === 'inset';
    const right = drawer ? 384 : 24;
    /* Centred over the drawing, not the drawer. */
    const mid = { left: `calc(50% + ${(24 - right) / 2}px)` };
    const tb = (on: boolean) => `inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] px-3 text-[13px] font-bold transition ${on ? 'bg-[#17191E] text-white' : 'text-[#4F535C] hover:bg-[#F1F1EC]'}`;
    return (
      <div ref={fullRef} className="fixed inset-0 z-[150] overflow-hidden text-[#17191E]"
        style={{ backgroundColor: '#EDEDE7', backgroundImage: 'radial-gradient(#D6D6CE 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
        <div className="absolute left-6 top-3.5 z-10 flex items-center gap-2 rounded-[12px] border border-[#E4E4DE] bg-white/90 px-3 py-2 shadow-[0_4px_14px_-8px_rgba(23,25,30,.3)] backdrop-blur">
          <b className="font-display text-[16px]">{roomLabel(room.room)}</b>
          <span className="text-[13px] text-[#5F636D]">{sh.name} · v{sh.versionNo} · approved{room.sheets.length > 1 ? ` · ${sheet + 1} of ${room.sheets.length} sheets` : ''}</span>
        </div>
        <div className="absolute top-3.5 z-10 flex items-center gap-2" style={{ right }}>
          <span className="flex items-center gap-2 rounded-[12px] border border-[#E4E4DE] bg-white/90 px-3 py-2 text-[13px] text-[#4F535C]"><span className="h-2 w-2 rounded-full bg-[#E5484D]" />Presenting · {projectName}</span>
          <button type="button" onClick={exitFull} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[12px] border border-[#E4E4DE] bg-white px-3 text-[13px] font-bold hover:border-[#A9AAA2]"><Minimize2 size={15} />Exit · Esc</button>
        </div>

        <div className="absolute inset-0 flex gap-4" style={{ padding: `66px ${right}px 96px 24px` }}>
          <div className="relative min-w-0 flex-1 overflow-auto">
            {sh.pdfPath ? (
              <React.Fragment key={`${sh.drawingId}/${sh.versionId}`}><PdfStage pdfPath={sh.pdfPath} page={page} zoom={zoom} turn={turn} marks={marks} draft={draft?.shape || null}
                tool={pinning ? 'pin' : 'select'} canMark={pinning && !draft && !room.outcome} markColor={CLIENT} onPageCount={setPages}
                maxWidth={4000} fitHeight={vh - 180} onShape={(shape) => setDraft({ shape, page, text: '' })} /></React.Fragment>
            ) : <div className="grid h-60 place-items-center text-[#5F636D]">This sheet has no PDF.</div>}
          </div>
          {side && m.layout && (
            <div className="w-[34%] min-w-[280px] max-w-[620px] self-start rounded-[16px] border border-[#E4E4DE] bg-white p-3 shadow-[0_20px_40px_-24px_rgba(23,25,30,.45)]">
              <LayoutPanel sheet={m.layout} room={room.room} box={box} fitHeight={vh - 240} maxWidth={1200} />
            </div>
          )}
        </div>

        {inset && m.layout && (
          <div className="absolute bottom-24 left-6 z-10 w-[320px] rounded-[16px] border border-[#E4E4DE] bg-white p-2.5 shadow-[0_20px_40px_-20px_rgba(23,25,30,.45)]">
            <LayoutPanel sheet={m.layout} room={room.room} box={box} maxWidth={300} compact />
          </div>
        )}

        {pinning && !draft && <div style={mid} className="absolute bottom-[92px] z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-[rgba(23,25,30,0.86)] px-4 py-2 text-[14px] font-semibold text-white">Tap the drawing where the client wants a change</div>}

        {draft && (
          <div className="dd-pop absolute bottom-[96px] z-20 w-[min(560px,calc(100vw-48px))] -translate-x-1/2 rounded-[18px] border-2 bg-white p-4 shadow-[0_24px_50px_-20px_rgba(23,25,30,.55)]" style={{ ...mid, borderColor: CLIENT }}>
            <label htmlFor="mm-full-note" className="mb-2 block text-[12px] font-extrabold uppercase tracking-[.08em]" style={{ color: CLIENT }}>Change {mine.length + 1}: what does the client want?</label>
            <textarea id="mm-full-note" autoFocus rows={2} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addDraft(); } if (e.key === 'Escape') { e.stopPropagation(); setDraft(null); } }}
              placeholder="For example: walnut shutters instead of white"
              className="w-full resize-none rounded-[12px] border border-[#DCDCD5] px-3 py-2.5 text-[19px] font-semibold outline-none focus:border-[#C77A1A]" />
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className="min-h-[42px] rounded-[10px] px-4 text-[14px] font-bold text-[#4F535C] hover:bg-[#EBEBE5]">Cancel</button>
              <button type="button" onClick={addDraft} disabled={!draft.text.trim()} className="min-h-[42px] rounded-[10px] px-4 text-[14px] font-bold text-white disabled:opacity-45" style={{ background: CLIENT }}>Add change · Enter</button>
            </div>
          </div>
        )}

        {drawer && (
          <aside className="absolute bottom-0 right-0 top-0 z-10 flex w-[360px] flex-col gap-3 border-l border-[#E4E4DE] bg-white/95 px-5 pb-5 pt-[70px] backdrop-blur" aria-label="The client's changes">
            <div className="text-[12px] font-extrabold uppercase tracking-[.1em] text-[#5F636D]">The client’s changes · {roomLabel(room.room)}</div>
            <div className="flex flex-1 flex-col gap-2 overflow-auto">
              {mine.map((c) => (
                <div key={c.n} className="flex items-start gap-3 rounded-[14px] bg-[#F6F6F2] p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-extrabold text-white" style={{ background: CLIENT }}>{c.n}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-semibold leading-snug">{c.text}</div>
                    <div className="text-[12px] text-[#5F636D]">{room.sheets.find((s) => s.drawingId === c.drawingId)?.name}</div>
                  </div>
                  {!room.outcome && <button type="button" onClick={() => removeChange(c.n)} aria-label={`Remove change ${c.n}`} className="grid h-8 w-8 place-items-center rounded-[10px] text-[#6B6F78] hover:bg-[#EBEBE5]"><Trash2 size={14} /></button>}
                </div>
              ))}
              {!mine.length && <div className="rounded-[14px] border-[1.5px] border-dashed border-[#DCDCD5] px-3 py-4 text-center text-[14px] text-[#5F636D]">{room.outcome === 'agreed' ? 'Agreed as shown.' : 'None yet. Press Add change, or C, and tap the drawing.'}</div>}
            </div>
            {room.outcome ? (
              <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const res = await decideRoom(target, m.id, room.room, null); if (res) setLocal(res); } catch (e: any) { toast({ title: 'Not saved', sub: e?.message }); } finally { setBusy(false); } }}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] border border-[#DCDCD5] bg-white text-[14px] font-bold"><Undo2 size={16} />Reopen this room</button>
            ) : (
              <div className="flex flex-col gap-2">
                <button type="button" disabled={busy || !!draft} onClick={() => decide(mine.length ? 'changes' : 'agreed')}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[14px] bg-[#1F7A57] text-[15px] font-extrabold text-white hover:bg-[#196649] disabled:opacity-45">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />}{mine.length ? `Done: ${plural(mine.length, 'change')}${at < m.rooms.length - 1 ? ' · next room' : ''}` : 'Client agrees as shown'}
                </button>
              </div>
            )}
            <div className="text-[12px] text-[#5F636D]">Keys: C add a change · L layout plan · ← → sheets · Esc exit</div>
          </aside>
        )}

        <div style={{ ...mid, maxWidth: `calc(100vw - ${right + 24}px)` }} className="absolute bottom-5 z-10 flex -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-[18px] border border-[#E4E4DE] bg-white p-1.5 shadow-[0_20px_40px_-16px_rgba(23,25,30,.4)]" role="toolbar" aria-label="Presentation controls">
          <button type="button" className={tb(false)} onClick={() => go(Math.max(0, at - 1))} disabled={at === 0} aria-label="Previous room"><ChevronLeft size={18} /></button>
          <span className="px-1 text-[13px] font-bold whitespace-nowrap">Room {at + 1} of {m.rooms.length}</span>
          <button type="button" className={tb(false)} onClick={() => go(Math.min(m.rooms.length - 1, at + 1))} disabled={at >= m.rooms.length - 1} aria-label="Next room"><ChevronRight size={18} /></button>
          <span className="mx-1 h-6 w-px bg-[#E4E4DE]" />
          <button type="button" onClick={() => { setPinning((p) => !p); setDraft(null); }} disabled={!!room.outcome}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[12px] px-3.5 text-[13px] font-bold text-white disabled:opacity-45" style={{ background: pinning ? '#8F4C07' : CLIENT }}>
            <MapPin size={16} />{pinning ? 'Stop pinning' : 'Add change · C'}
          </button>
          {m.layout && <>
            <span className="mx-1 h-6 w-px bg-[#E4E4DE]" />
            <button type="button" className={tb(planMode === 'inset')} onClick={() => setPlanMode('inset')}><MapPinned size={15} />Plan inset</button>
            <button type="button" className={tb(planMode === 'side')} onClick={() => setPlanMode('side')}>Side by side</button>
            <button type="button" className={tb(planMode === 'off')} onClick={() => setPlanMode('off')}>Hide plan</button>
          </>}
          <span className="mx-1 h-6 w-px bg-[#E4E4DE]" />
          <button type="button" className={tb(drawer)} onClick={() => setDrawer((d) => !d)}><ListChecks size={15} />Changes</button>
          <button type="button" className={tb(false)} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out"><Minus size={16} /></button>
          <span className="min-w-[40px] text-center text-[12.5px] font-bold text-[#4F535C]">{Math.round(zoom * 100)}%</span>
          <button type="button" className={tb(false)} onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in"><Plus size={16} /></button>
          <button type="button" className={tb(false)} onClick={rotate} aria-label="Rotate the sheet"><RotateCw size={16} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="dd-rise -mx-4 -mt-6 flex min-h-[calc(100vh-80px)] flex-col md:-mx-5">
      {header}
      <div className="flex flex-1 flex-wrap items-stretch gap-4 px-5 py-4">
        <nav className="w-full self-start rounded-[18px] border border-[#E4E4DE] bg-white p-2 lg:w-[230px]" aria-label="Rooms in this meeting">
          <div className="px-2.5 pb-1.5 pt-2 text-[11px] font-extrabold uppercase tracking-[.09em] text-[#5F636D]">Rooms</div>
          {m.rooms.map((r, i) => {
            const on = i === at; const n = r.outcome === 'changes' ? r.changes.length : (changes[r.room] || []).length;
            return (
              <button key={r.room} type="button" onClick={() => go(i)} aria-current={on}
                className="flex w-full items-center gap-2.5 rounded-[14px] border-[1.5px] p-2.5 text-left transition hover:bg-[#F6F6F2]"
                style={{ background: on ? look.soft : undefined, borderColor: on ? look.color : 'transparent' }}>
                <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[11px] font-extrabold"
                  style={{ background: r.outcome === 'agreed' ? '#1F7A57' : r.outcome === 'changes' ? CLIENT : on ? look.color : '#EEEEEA', color: r.outcome || on ? '#fff' : '#4F535C' }}>
                  {r.outcome === 'agreed' ? <Check size={13} strokeWidth={3} /> : r.outcome === 'changes' ? n : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold">{roomLabel(r.room)}</span>
                  <span className="block text-[12px]" style={{ color: r.outcome === 'agreed' ? '#1B6E4F' : r.outcome === 'changes' ? '#8F4C07' : '#5F636D' }}>
                    {r.outcome === 'agreed' ? 'Agreed' : r.outcome === 'changes' ? `${plural(n, 'change')} asked` : on ? 'Presenting now' : 'Up next'}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="relative flex min-h-[560px] min-w-0 flex-[999_1_520px] flex-col gap-3 rounded-[22px] p-4"
          style={{ backgroundColor: '#E8E8E2', backgroundImage: 'radial-gradient(#D3D3CB 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="flex-auto font-display text-[24px] font-semibold">{roomLabel(room.room)}</h1>
            {room.sheets.map((s, i) => (
              <button key={s.drawingId} type="button" onClick={() => { setSheet(i); setPage(0); setDraft(null); }} aria-pressed={i === sheet}
                className={`min-h-[36px] rounded-full border px-3 text-[12.5px] font-bold transition ${i === sheet ? 'border-[#17191E] bg-[#17191E] text-white' : 'border-[#DCDCD5] bg-white hover:border-[#A9AAA2]'}`}>
                {s.name} · v{s.versionNo}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto pb-16">
            {sh.pdfPath ? (
              <React.Fragment key={`${sh.drawingId}/${sh.versionId}`}><PdfStage pdfPath={sh.pdfPath} page={page} zoom={zoom} turn={turn} marks={marks} draft={draft?.shape || null}
                tool={pinning ? 'pin' : 'select'} canMark={pinning && !draft && !room.outcome} markColor={CLIENT} onPageCount={setPages}
                onShape={(shape) => setDraft({ shape, page, text: '' })} /></React.Fragment>
            ) : <div className="grid h-60 place-items-center text-[#5F636D]">This sheet has no PDF.</div>}
          </div>
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
            {pinning && !draft && <div className="rounded-full bg-[rgba(23,25,30,0.86)] px-3 py-1.5 text-[12.5px] font-semibold text-white">Tap the drawing where the client wants a change</div>}
            <div className="flex items-center gap-0.5 rounded-2xl bg-white p-[5px] shadow-[0_2px_4px_rgba(23,25,30,0.06),0_16px_40px_-14px_rgba(23,25,30,0.35)]">
              {pages > 1 && <>
                <button type="button" onClick={() => { setPage((p) => Math.max(0, p - 1)); setDraft(null); }} disabled={page === 0} aria-label="Previous sheet in this PDF" className="grid min-h-[40px] min-w-[40px] place-items-center rounded-[11px] text-[#4F535C] hover:bg-[#F1F1EC] disabled:opacity-40"><ChevronLeft size={16} /></button>
                <span className="px-1 text-[12.5px] font-bold text-[#4F535C]">Sheet {page + 1} of {pages}</span>
                <button type="button" onClick={() => { setPage((p) => Math.min(pages - 1, p + 1)); setDraft(null); }} disabled={page >= pages - 1} aria-label="Next sheet in this PDF" className="grid min-h-[40px] min-w-[40px] place-items-center rounded-[11px] text-[#4F535C] hover:bg-[#F1F1EC] disabled:opacity-40"><ChevronRight size={16} /></button>
                <span className="mx-1 h-6 w-px bg-[#E4E4DE]" />
              </>}
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out" className="grid min-h-[40px] min-w-[40px] place-items-center rounded-[11px] text-[#4F535C] hover:bg-[#F1F1EC]"><Minus size={17} /></button>
              <span className="min-w-[42px] text-center text-[12.5px] font-bold text-[#4F535C]">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))} aria-label="Zoom in" className="grid min-h-[40px] min-w-[40px] place-items-center rounded-[11px] text-[#4F535C] hover:bg-[#F1F1EC]"><Plus size={17} /></button>
              <span className="mx-1 h-6 w-px bg-[#E4E4DE]" />
              <button type="button" onClick={rotate} aria-label="Rotate the sheet" title="Rotate (R). Only on your screen; pins stay where they are on the drawing." className="grid min-h-[40px] min-w-[40px] place-items-center rounded-[11px] text-[#4F535C] hover:bg-[#F1F1EC]"><RotateCw size={17} /></button>
              <button type="button" onClick={download} disabled={saving || !sh.pdfPath} aria-label={`Download ${sh.name} v${sh.versionNo}`} title={`Download ${sh.name} v${sh.versionNo} (the approved PDF)`} className="grid min-h-[40px] min-w-[40px] place-items-center rounded-[11px] text-[#4F535C] hover:bg-[#F1F1EC] disabled:opacity-40">{saving ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}</button>
            </div>
          </div>
        </div>

        <aside className="flex min-h-[560px] min-w-0 flex-[1_1_320px] flex-col overflow-hidden rounded-[18px] border border-[#E4E4DE] bg-white">
          <div className="border-b border-[#EEEEEA] px-4 py-3.5">
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Chip tone="green" icon={Check}>Approved by the Design Head</Chip>
              <Chip tone={over ? 'red' : 'grey'}>{over ? `Changes start round ${nextRound} · ${m.includedRounds} included` : `Round ${used[room.room] || 0} of ${m.includedRounds} used`}</Chip>
            </div>
            <div className="text-[12.5px] text-[#5F636D]">Showing the approved versions: {room.sheets.map((s) => `${s.name} v${s.versionNo}`).join(' · ')}.</div>
            {m.layout && planMode !== 'off' && (
              <div className="mt-3 rounded-[12px] bg-[#F6F6F2] p-2">
                <LayoutPanel sheet={m.layout} room={room.room} box={m.layout.rooms?.[room.room] || null} maxWidth={300} compact />
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-auto p-3.5">
            <div className="text-[11px] font-extrabold uppercase tracking-[.09em] text-[#5F636D]">The client's changes</div>
            {mine.map((c) => (
              <div key={c.n} className="dd-rise flex gap-2.5 rounded-[14px] border border-[#E4E4DE] p-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white" style={{ background: CLIENT }}>{c.n}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px]">{c.text}</div>
                  <div className="text-[11.5px] text-[#8A8E97]">On {room.sheets.find((s) => s.drawingId === c.drawingId)?.name}{c.page ? `, sheet ${c.page + 1}` : ''}</div>
                </div>
                {!room.outcome && <button type="button" onClick={() => removeChange(c.n)} aria-label={`Remove change ${c.n}`} className="grid h-8 w-8 place-items-center rounded-[10px] text-[#6B6F78] hover:bg-[#EBEBE5]"><Trash2 size={14} /></button>}
              </div>
            ))}
            {draft && (
              <div className="dd-pop rounded-[14px] border-2 p-3" style={{ borderColor: CLIENT }}>
                <label htmlFor="mm-note" className="mb-1.5 block text-[13px] font-bold">Change {mine.length + 1}: what does the client want?</label>
                <textarea id="mm-note" autoFocus rows={2} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addDraft(); } if (e.key === 'Escape') setDraft(null); }}
                  placeholder="For example: a lighter shade on the shutters"
                  className="w-full rounded-[10px] border border-[#DCDCD5] px-3 py-2.5 text-[13.5px] outline-none focus:border-[#4146C8] focus:shadow-[0_0_0_3px_rgba(65,70,200,0.15)]" />
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setDraft(null)} className="min-h-[36px] rounded-[10px] px-3 text-[13px] font-bold text-[#4F535C] hover:bg-[#EBEBE5]">Cancel</button>
                  <button type="button" onClick={addDraft} disabled={!draft.text.trim()} className="min-h-[36px] rounded-[10px] bg-[#4146C8] px-3.5 text-[13px] font-bold text-white disabled:opacity-45">Add change</button>
                </div>
              </div>
            )}
            {!mine.length && !draft && (
              <div className="rounded-[14px] border-[1.5px] border-dashed border-[#DCDCD5] px-3 py-4 text-center text-[13px] text-[#5F636D]">
                {room.outcome === 'agreed' ? 'Agreed as shown.' : pinning ? 'Tap the drawing to pin the first change.' : 'None. If the client asks for something, press "Client wants changes" and pin it on the drawing.'}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-[#EEEEEA] px-4 pb-4 pt-3">
            {room.outcome ? (
              <>
                <div className="text-[12.5px] text-[#5F636D]">{room.outcome === 'agreed' ? 'Recorded as agreed.' : `Recorded with ${plural(room.changes.length, 'change')}.`} You can change it until the meeting is saved.</div>
                <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const res = await decideRoom(target, m.id, room.room, null); if (res) setLocal(res); } catch (e: any) { toast({ title: 'Not saved', sub: e?.message }); } finally { setBusy(false); } }}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#DCDCD5] bg-white px-4 text-[14px] font-bold hover:border-[#A9AAA2] disabled:opacity-45"><Undo2 size={16} />Reopen this room</button>
              </>
            ) : (
              <>
                <div className="text-[12.5px]" style={{ color: mine.length && over ? '#B4232F' : '#5F636D' }}>
                  {mine.length ? (over ? `These changes start round ${nextRound}; ${m.includedRounds} ${m.includedRounds === 1 ? 'is' : 'are'} included. You decide on billing when you finish.` : `These go to the Design Head, then the designer, as round ${nextRound}.`) : 'Agreed records the room against the exact versions on screen.'}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setPinning((p) => !p); setDraft(null); }} aria-pressed={pinning}
                    className="inline-flex min-h-[44px] flex-[1_1_150px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-4 text-[14px] font-bold transition"
                    style={pinning ? { background: '#FBF1E3', borderColor: CLIENT } : { background: '#fff', borderColor: '#DCDCD5' }}>
                    <MapPin size={16} />{pinning ? 'Stop pinning' : 'Client wants changes'}
                  </button>
                  <button type="button" disabled={busy || !!draft} onClick={() => decide(mine.length ? 'changes' : 'agreed')}
                    className="inline-flex min-h-[44px] flex-[1_1_150px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#1F7A57] px-4 text-[14px] font-bold text-white hover:bg-[#196649] disabled:opacity-45">
                    {busy ? <Loader2 size={16} className="animate-spin" /> : mine.length ? <Presentation size={16} /> : <Check size={16} strokeWidth={2.6} />}
                    {mine.length ? `Done: ${plural(mine.length, 'change')}` : 'Client agrees'}
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default MeetingMode;
