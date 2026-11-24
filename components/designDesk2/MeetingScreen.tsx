import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BadgeCheck, Check, ChevronLeft, ChevronRight, Download, Eye, IndianRupee, Loader2, MapPin, MapPinned, Maximize2, Minimize2, Minus, MonitorUp, PenLine, PhoneOff, Plus, ReceiptText, RotateCw, Trash2, Undo2, X } from 'lucide-react';
import { landscapePdf } from '../../lib/pdfLandscape';
import { clientRoundsByRoom, costLine, costTotal, isOverIncluded, needsApproval, plural, type ChangeCost, type DesignMeeting, type MeetingChange, type RoomOutcome } from '../../lib/designMeeting';
import { clock, minutesOf, roundsLine } from '../../lib/meetingMinutes';
import { turnShape, type MarkShape, type ReviewMark, type Turn } from '../../lib/drawingReview';
import { decideRoom, closeMeeting } from '../../services/designMeetingService';
import { fileBlob } from '../../services/drawingReviewService';
import PdfStage from '../drawingReview/PdfStage';
import { CLIENT, roomLabel, shortDate, useToast } from '../drawingReview/ui';
import ClientSign from '../drawingReview/ClientSign';
import ClientApproval from '../drawingReview/ClientApproval';
import { LayoutPanel } from '../drawingReview/LayoutPlan';
import { ClientView } from '../drawingReview/MeetingMode';
import { useClientWindow, ClientPortal, useScrollMirror } from '../drawingReview/ClientWindow';
import { Btn, cx } from './parts';
import { CopyMinutes, DESK_ACCENT, MinutesList, RoomResult, inr, meetingTitle, savedWay, useSheetTurn } from './meetingBits';
import { DeskMotionStyles, MeetMotionStyles, Tilt } from './motion';

/*
  DESIGN DESK 2.0: the meeting screen (build plan, Phase 2).

  One room at a time on the versions the Design Head approved, on a dark
  screen that leaves the drawing as the brightest thing in the room. The rooms
  are listed on the left, each drawing of the room has a tab, and the layout
  plan is a tab of its own. What the client asks for is pinned on the drawing;
  the minutes write themselves on the right as buttons are pressed.

  Every rule and every saved fact is today's (lib/designMeeting.ts, the
  designMeeting function, components/drawingReview/MeetingMode.tsx): each
  decision is saved as it is made, so the meeting can be left and resumed; a
  room can be reopened until the meeting is saved; the client's window shows
  exactly what it shows today (the same ClientView), for a call on Google Meet
  or Zoom.

  New here: the round counter is always on screen and warns before a change
  starts a round that can be charged; the leads can put a cost estimate on a
  change (never shown to the client, never to a Designer); and the minutes.
  Bill or waive, fees and costs stay with the Design Head (`lead`).
*/

interface Props {
  orgId: string;
  projectId: string;
  projectName: string;
  look: { code: string; color: string; soft: string };
  meeting: DesignMeeting;
  meetings: DesignMeeting[];
  /** The Design Head or a lead: decides billing and may estimate what a change costs. Off for a Designer. */
  lead: boolean;
  me: { uid: string; email: string; name?: string | null };
  onExit: (to?: 'home') => void;
}

type CostKind = '' | ChangeCost['kind'];
type Draft = { shape: MarkShape; page: number; text: string; kind: CostKind; amount: string; note: string };
type Tab = number | 'plan';

const Elapsed: React.FC<{ since: number }> = ({ since }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return <span className="tabular-nums">{clock(now - since)}</span>;
};

const dark = 'inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold disabled:opacity-40';
const ghost = cx(dark, 'dd2m-soft text-slate-100');
const calm = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Where a change's numbered pin sits on the page as it is shown (the same spot PdfStage draws its flat tag). */
function pinSpot(shape: MarkShape, turn: Turn): [number, number] {
  const s = turnShape(shape, turn, 'view');
  if (s.t === 'pin') return [s.x, s.y];
  if (s.t === 'rect') return [s.x + s.w, s.y];
  if (s.t === 'arrow') return [s.x, s.y];
  return [s.pts[0]?.[0] ?? 0.5, s.pts[0]?.[1] ?? 0.5];
}

/*
  The client's changes on the page being shown, as the drawing screen's living
  pins in the client's amber: each pops in and ripples, grows under the pointer
  and springs its words out beside it, and lights its card in the list. While a
  change is being placed they let the tap through.
*/
const ChangePins: React.FC<{ changes: MeetingChange[]; turn: Turn; hot: number | null; onHot: (n: number | null) => void; passive: boolean; studio: boolean }> = ({ changes, turn, hot, onHot, passive, studio }) => (
  <>
    {changes.map((c) => {
      const [x, y] = pinSpot(c.shape, turn);
      const on = hot === c.n;
      const below = y < 0.3;
      const at = x > 0.72 ? 'calc(100% - 18px)' : x < 0.28 ? '18px' : '50%';
      const pin = { left: `${x * 100}%`, top: `${y * 100}%`, ['--pin' as any]: '#D97706' };
      return (
        <React.Fragment key={c.n}>
          <button type="button" aria-label={`Change ${c.n}: ${c.text}`} onMouseEnter={() => onHot(c.n)} onMouseLeave={() => onHot(null)} onFocus={() => onHot(c.n)} onBlur={() => onHot(null)}
            className={cx('dd2-pin is-open', on && 'is-hot', passive && 'is-off')} style={pin}><b>{c.n}</b></button>
          {on && (
            <div className="absolute z-[5] w-[260px] max-w-[70vw]" role="tooltip"
              style={{ ...pin, transform: `translate(${x > 0.72 ? 'calc(-100% + 18px)' : x < 0.28 ? '-18px' : '-50%'}, ${below ? '34px' : 'calc(-100% - 34px)'})` }}>
              <span className="dd2-lead" style={{ left: at, [below ? 'bottom' : 'top']: '100%' }} aria-hidden />
              <div className="dd2-bubble rounded-2xl border border-slate-200 bg-white p-3 text-left text-slate-800 shadow-2xl" style={{ transformOrigin: `${at} ${below ? 'top' : 'bottom'}` }}>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><span className="dd2-badge grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white">{c.n}</span>The client asked</div>
                <p className="mt-1.5 text-sm">{c.text}</p>
                {studio && c.cost && <p className="mt-1 text-xs font-bold text-amber-800">{costLine(c.cost)}</p>}
              </div>
            </div>
          )}
        </React.Fragment>
      );
    })}
  </>
);
const icon = 'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30';

export default function MeetingScreen({ orgId, projectId, projectName, look, meeting, meetings, lead, me, onExit }: Props) {
  const toast = useToast();
  const target = { orgId, projectId };
  const [local, setLocal] = useState(meeting);
  useEffect(() => { if (meeting.rev >= local.rev) setLocal(meeting); }, [meeting]);
  const m = local;
  const [step, setStep] = useState<'present' | 'wrap' | 'done'>(m.state === 'CLOSED' ? 'done' : 'present');
  const [at, setAt] = useState(() => Math.max(0, m.rooms.findIndex((r) => !r.outcome)));
  const [tab, setTab] = useState<Tab>(0);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pinning, setPinning] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [changes, setChanges] = useState<Record<string, MeetingChange[]>>(() => Object.fromEntries(m.rooms.map((r) => [r.room, r.changes])));
  const [busy, setBusy] = useState(false);
  const [charges, setCharges] = useState<Record<string, 'to_bill' | 'waived'>>({});
  const [signing, setSigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const way = useMemo(savedWay, []);

  const used = useMemo(() => clientRoundsByRoom(meetings, m.id), [meetings, m.id]);
  const room = m.rooms[at] || m.rooms[0];
  const sheet = tab === 'plan' ? 0 : Math.min(tab, room.sheets.length - 1);
  const sh = room.sheets[sheet] || room.sheets[0];
  const mine = changes[room.room] || [];
  const roundsUsed = used[room.room] || 0;
  const nextRound = roundsUsed + 1;
  const over = isOverIncluded(nextRound, m.includedRounds);
  const done = m.rooms.filter((r) => r.outcome).length;
  const showPlan = tab === 'plan' && !!m.layout;

  /* ------------------------------------------------------------ which way each drawing, and the plan, reads */
  const [turnRaw, rotateSheet] = useSheetTurn(projectId, sh.drawingId, sh.pdfPath);
  const turn: Turn = turnRaw ?? 0;
  const [planTurnRaw, rotatePlan] = useSheetTurn(projectId, m.layout?.drawingId, m.layout?.pdfPath);
  const planTurn: Turn = planTurnRaw ?? 0;
  const rotate = () => (showPlan ? rotatePlan() : rotateSheet());
  const [hot, setHot] = useState<number | null>(null);
  /* A room just decided: a tick, or the number of changes, over the drawing before the next room opens. */
  const [stamp, setStamp] = useState<{ happy: boolean; n: number } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /* ------------------------------------------------------------ the three ways to show it */
  const [full, setFull] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const enterFull = () => { setFull(true); setTimeout(() => { root.current?.requestFullscreen?.().catch(() => undefined); }, 0); };
  const exitFull = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined); setFull(false); };
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const { client, open: openClient, close: closeClient } = useClientWindow(`Design meeting · ${projectName}`);
  const mirror = useScrollMirror();
  const launchClient = () => {
    if (!openClient()) toast({ title: 'The browser blocked the window', sub: 'Allow pop-ups for StudioDesk in the address bar, then press Client window again.' });
  };

  /* The drawing fills the stage: its content box is measured (the room the controls take is already off), and the page is fitted into it. */
  const stage = useRef<HTMLDivElement>(null);
  const [stageH, setStageH] = useState(0);
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setStageH(Math.floor(e.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [step, full, showPlan]);
  /*
    Zoom. Ctrl + scroll works anywhere over the viewer (its tabs and controls
    too), in whichever room or drawing is open, and keeps the spot under the
    pointer where it is; the client's window follows. The listener sits on
    the viewer itself, which is never replaced when the room changes.
  */
  const viewer = useRef<HTMLElement>(null);
  const anchor = useRef<{ fx: number; fy: number; px: number; py: number; at: number } | null>(null);
  const zoomTo = (next: (z: number) => number, at?: { x: number; y: number }) => {
    const sc = stage.current;
    const pg = sc?.querySelector('canvas');
    if (sc && pg && at) {
      const r = pg.getBoundingClientRect(), s0 = sc.getBoundingClientRect();
      const px = at.x - s0.left, py = at.y - s0.top;
      const held = anchor.current;
      /* More notches of the same scroll, pointer still: keep the spot first measured, since the page is mid-resize now. */
      if (held && Math.abs(held.px - px) < 4 && Math.abs(held.py - py) < 4) held.at = Date.now();
      else if (r.width > 0 && r.height > 0) anchor.current = { fx: (at.x - r.left) / r.width, fy: (at.y - r.top) / r.height, px, py, at: Date.now() };
    }
    setZoom((z) => Math.min(5, Math.max(0.5, Math.round(next(z) * 100) / 100)));
  };
  const zoomBy = (d: number) => zoomTo((z) => z + d);
  useEffect(() => {
    const el = viewer.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const step = Math.max(-0.35, Math.min(0.35, -e.deltaY * 0.0014));
      zoomTo((z) => z * Math.exp(step), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [step]);
  /*
    After a zoom the page takes a moment to settle at its new size (the PDF is
    drawn again): hold the pointer's spot until the size has stopped changing,
    and let go at once if the person scrolls or drags themselves.
  */
  useEffect(() => {
    const a = anchor.current;
    const sc = stage.current;
    if (!a || !sc) return;
    let raf = 0, lastW = -1, steady = Date.now();
    const drop = (e: Event) => { if (e.type === 'wheel' && ((e as WheelEvent).ctrlKey || (e as WheelEvent).metaKey)) return; anchor.current = null; };
    sc.addEventListener('pointerdown', drop);
    sc.addEventListener('wheel', drop, { passive: true });
    const hold = () => {
      if (anchor.current !== a) return;
      const pg = sc.querySelector('canvas');
      if (pg) {
        const r = pg.getBoundingClientRect(), s0 = sc.getBoundingClientRect();
        if (Math.abs(r.width - lastW) > 0.5) { lastW = r.width; steady = Date.now(); }
        sc.scrollLeft += r.left + a.fx * r.width - (s0.left + a.px);
        sc.scrollTop += r.top + a.fy * r.height - (s0.top + a.py);
      }
      const now = Date.now();
      if (now - a.at > 3000 || (now - a.at > 500 && now - steady > 450)) { anchor.current = null; return; }
      raf = requestAnimationFrame(hold);
    };
    raf = requestAnimationFrame(hold);
    return () => { cancelAnimationFrame(raf); sc.removeEventListener('pointerdown', drop); sc.removeEventListener('wheel', drop); };
  }, [zoom]);

  /* ------------------------------------------------------------ moving about */
  const go = (i: number) => { setAt(i); setTab(0); setPage(0); setPinning(false); setDraft(null); };
  const pick = (t: Tab) => { setTab(t); setPage(0); setDraft(null); if (t === 'plan') setPinning(false); };
  const tabs: Tab[] = [...room.sheets.map((_, i) => i), ...(m.layout ? ['plan' as const] : [])];
  const step1 = (d: number) => { const i = tabs.indexOf(tab); pick(tabs[(i + d + tabs.length) % tabs.length]); };
  const startPin = () => { if (room.outcome) return; if (tab === 'plan') setTab(0); setPinning((p) => !p); setDraft(null); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || step !== 'present' || signing) return;
      const k = e.key.toLowerCase();
      if (k === 'c') startPin();
      if (k === 'l' && m.layout) pick(tab === 'plan' ? 0 : 'plan');
      if (k === 'r') rotate();
      if (k === 'f') { if (full) exitFull(); else enterFull(); }
      if (k === '+' || k === '=') zoomBy(0.25);
      if (k === '-') zoomBy(-0.25);
      if (k === '0') setZoom(1);
      if (e.key === 'ArrowRight' && tabs.length > 1) step1(1);
      if (e.key === 'ArrowLeft' && tabs.length > 1) step1(-1);
      if (e.key === 'Escape') { if (draft) setDraft(null); else if (pinning) setPinning(false); else if (full && !document.fullscreenElement) exitFull(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const onPage = mine.filter((c) => c.drawingId === sh.drawingId && c.page === page);
  const marks = onPage
    .map((c) => ({ id: `c${c.n}`, n: c.n, page: c.page, shape: c.shape, status: 'OPEN', source: 'client' }) as unknown as ReviewMark);

  /* ------------------------------------------------------------ what the buttons do */
  async function decide(outcome: RoomOutcome) {
    setBusy(true);
    try {
      const res = await decideRoom(target, m.id, room.room, outcome, outcome === 'changes' ? mine : []);
      if (res) setLocal(res);
      const rooms = res?.rooms || m.rooms;
      const next = rooms.findIndex((r, i) => i > at && !r.outcome);
      const any = rooms.findIndex((r) => !r.outcome);
      toast({ ok: true, celebrate: outcome === 'agreed', title: outcome === 'agreed' ? `${roomLabel(room.room)}: the client is happy` : `${roomLabel(room.room)}: ${plural(mine.length, 'change')} noted`,
        sub: next >= 0 ? `Next: ${roomLabel(rooms[next].room)}` : any >= 0 ? 'One room is still open.' : 'Every room is done. Finish the meeting when you are ready.' });
      if (outcome === 'agreed') setChanges((c) => ({ ...c, [room.room]: [] }));
      setPinning(false);
      const to = next >= 0 ? next : any;
      const still = calm();
      if (!still) { setStamp({ happy: outcome === 'agreed', n: mine.length }); setTimeout(() => { if (alive.current) setStamp(null); }, 1100); }
      if (to >= 0) setTimeout(() => { if (alive.current) go(to); }, still ? 300 : 950);
    } catch (e: any) {
      toast({ title: 'Not saved', sub: e?.message });
    } finally { setBusy(false); }
  }
  async function reopen() {
    setBusy(true);
    try { const res = await decideRoom(target, m.id, room.room, null); if (res) setLocal(res); }
    catch (e: any) { toast({ title: 'Not saved', sub: e?.message }); }
    finally { setBusy(false); }
  }
  function addDraft() {
    if (!draft || !draft.text.trim()) return;
    const list = changes[room.room] || [];
    const amount = Number(draft.amount);
    const cost: ChangeCost | null = lead && draft.kind ? { kind: draft.kind, amount: draft.kind !== 'none' && Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null, note: draft.note.trim() || null } : null;
    setChanges({ ...changes, [room.room]: [...list, { n: list.length + 1, drawingId: sh.drawingId, page: draft.page, shape: draft.shape, text: draft.text.trim(), ...(cost ? { cost } : {}) }] });
    setDraft(null);
  }
  const removeChange = (n: number) => setChanges({ ...changes, [room.room]: mine.filter((c) => c.n !== n).map((c, i) => ({ ...c, n: i + 1 })) });
  async function save() {
    setBusy(true);
    try {
      const res = await closeMeeting(target, m.id, m.rev, lead ? charges : {});
      if (res) setLocal(res);
      closeClient();
      setStep('done');
    } catch (e: any) {
      toast({ title: 'The meeting was not saved', sub: e?.message });
    } finally { setBusy(false); }
  }
  async function download() {
    if (!sh.pdfPath) return;
    setSaving(true);
    try {
      const { bytes } = await landscapePdf(await (await fileBlob(sh.pdfPath)).arrayBuffer());
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${sh.name.replace(/[\\/:*?"<>|]+/g, '-')} v${sh.versionNo}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast({ title: 'The PDF did not download', sub: e?.message });
    } finally { setSaving(false); }
  }
  const leave = () => { exitFull(); closeClient(); onExit(); };

  const lines = useMemo(() => minutesOf({ meeting: m, live: changes, used, charges, way, ending: step !== 'present' }), [m, changes, used, charges, way, step]);
  const shownLines = lead ? lines : lines.filter((l) => !l.studio || l.kind === 'round');

  /* The client's window: what they see today, drawn from this same state. */
  const clientView = client ? (
    <ClientPortal client={client}>
      <ClientView projectName={projectName} look={look} meeting={m} step={step} at={at} room={room} sh={sh} sheetIndex={sheet}
        page={page} pages={pages} zoom={zoom} turn={turn} marks={marks} draft={draft ? { shape: draft.shape, page: draft.page, text: draft.text } : null} changes={mine}
        planMode={!m.layout ? 'off' : showPlan ? 'side' : 'inset'} size={client.size} scroll={mirror.at} planTurn={planTurn} />
    </ClientPortal>
  ) : null;

  /* ============================================================ finishing and the saved meeting */
  if (step !== 'present') {
    const decided = m.rooms.filter((r) => r.outcome);
    const open = m.rooms.filter((r) => !r.outcome);
    const roundOf = (r: DesignMeeting['rooms'][number]) => (r.outcome === 'changes' ? r.round || (used[r.room] || 0) + 1 : 0);
    const chargeable = decided.filter((r) => r.outcome === 'changes' && isOverIncluded(roundOf(r), m.includedRounds));
    const ready = !lead || chargeable.every((r) => charges[r.room]);
    const happy = m.rooms.filter((r) => r.outcome === 'agreed').length;
    const withChanges = m.rooms.filter((r) => r.outcome === 'changes');
    const totalChanges = withChanges.reduce((n, r) => n + r.changes.length, 0);
    const cost = costTotal(withChanges.flatMap((r) => r.changes));
    return (
      <div className="fixed inset-0 z-[110] overflow-y-auto bg-slate-50" style={DESK_ACCENT}>
        <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-4 py-8">
          {step === 'wrap' ? (
            <>
              <Btn kind="quiet" icon={ArrowLeft} className="self-start" onClick={() => setStep('present')}>Back to the meeting</Btn>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Finish the meeting</h1>
                <p className="mt-1 text-base text-slate-600">{decided.length
                  ? `${plural(happy, 'room')} the client is happy with, ${plural(withChanges.length, 'room')} with changes${open.length ? `, ${plural(open.length, 'room')} with no decision` : ''}. Check it, then save.`
                  : 'The client did not decide on any room. You can still save the meeting: it is kept as held, and every room can be shown again.'}</p>
              </div>
              <div className="flex flex-col gap-2">{m.rooms.map((r) => <RoomResult key={r.room} r={r} included={m.includedRounds} studio={lead} round={roundOf(r)} />)}</div>
              {chargeable.map((r) => (
                <div key={r.room} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  <div className="flex items-center gap-2 text-base font-bold"><ReceiptText size={18} aria-hidden />{roomLabel(r.room)}: a revision round that can be charged</div>
                  <p className="mt-0.5">This is round {roundOf(r)} and {plural(m.includedRounds, 'round')} {m.includedRounds === 1 ? 'is' : 'are'} included. {lead ? 'It goes on the list to bill, unless you waive it.' : 'It waits for the Design Head to bill or waive it.'}</p>
                  {lead && (
                    <div className="mt-2.5 flex flex-wrap gap-2" role="radiogroup" aria-label={`Billing for ${r.room}`}>
                      {(['to_bill', 'waived'] as const).map((k) => (
                        <button key={k} type="button" role="radio" aria-checked={charges[r.room] === k} onClick={() => setCharges({ ...charges, [r.room]: k })}
                          className={cx('min-h-[44px] rounded-xl border-2 px-4 text-sm font-bold transition-colors', charges[r.room] === k ? 'border-rose-600 bg-white text-rose-700' : 'border-rose-200 text-rose-900 hover:bg-white')}>
                          {k === 'to_bill' ? 'Bill this round' : 'Waive it this time'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {lead && cost.any && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <IndianRupee size={18} className="mt-0.5 shrink-0" aria-hidden />
                  <span><b className="block text-base">{cost.net === 0 ? 'The changes do not move the BOQ' : `The changes come to about ${cost.net > 0 ? '+' : '−'}${inr(cost.net)} on the BOQ`}{cost.open ? `, with ${plural(cost.open, 'figure')} still to work out` : ''}</b>These are your estimates from the meeting. Nothing reaches the client's bill until you confirm it in the BOQ. The client and the designers do not see them.</span>
                </div>
              )}
              {totalChanges > 0 && <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">{totalChanges === 1 ? 'The change goes' : `All ${totalChanges} changes go`} to the Design Head first, pinned on the drawings where the client asked.</p>}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <b className="mb-2 block text-base text-slate-800">Minutes</b>
                <MinutesList lines={shownLines} />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                {!ready && <span className="text-sm text-rose-700">Choose to bill or waive each round first.</span>}
                <Btn kind="primary" big icon={busy ? Loader2 : Check} disabled={busy || !ready} onClick={save} className={busy ? '[&>svg]:animate-spin' : undefined}>Save the meeting</Btn>
              </div>
            </>
          ) : (
            <>
              <div className="hud-panel-in rounded-3xl bg-gradient-to-r from-[#0C1F1A] to-emerald-900 px-6 py-6 text-white">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><Check size={26} strokeWidth={2.6} aria-hidden /></span>
                <h1 className="mt-3 text-2xl font-bold">Meeting saved</h1>
                <p className="mt-1 text-base text-emerald-100">{projectName} · {shortDate(m.closedAt || Date.now())}{m.attendees ? ` · with ${m.attendees}` : ''}. {decided.length ? `The desk wrote this during the meeting. Check it${needsApproval(m) ? ', then ask the client to approve' : ''}.` : 'The client did not decide on any room. Nothing went to the client or onto a drawing, and every room can be shown again.'}</p>
              </div>
              <section>
                <h2 className="mb-2 text-lg font-bold text-slate-800">What was decided</h2>
                <div className="flex flex-col gap-2">{m.rooms.map((r) => <RoomResult key={r.room} r={r} included={m.includedRounds} studio={lead} />)}</div>
                {!lead && chargeable.length > 0 && <p className="mt-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900">{chargeable.map((r) => roomLabel(r.room)).join(', ')}: a revision round that can be charged. It waits for the Design Head to bill or waive it.</p>}
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="flex-1 text-lg font-bold text-slate-800">Minutes <span className="text-sm font-normal text-slate-500">· {plural(shownLines.length, 'line')}{m.closedAt ? ` · ${Math.max(1, Math.round((m.closedAt - m.startedAt) / 60000))} min` : ''}</span></h2>
                  <CopyMinutes title={meetingTitle(m, shortDate)} lines={lines} />
                </div>
                <MinutesList lines={shownLines} />
              </section>
              {needsApproval(m) && (
                <section>
                  <h2 className="mb-1 text-lg font-bold text-slate-800">Ask the client to approve</h2>
                  <p className="mb-2 text-sm text-slate-600">Agreeing in the meeting is not the approval. The email is drafted for you: check the address, then send it. Reminders go by themselves on working days 3 and 5.</p>
                  <div className="rounded-2xl bg-white"><ClientApproval orgId={orgId} projectId={projectId} m={m} mine lead={lead} me={me} startOpen /></div>
                </section>
              )}
              {decided.length > 0 && <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                {m.confirmation?.at ? <BadgeCheck size={22} className="shrink-0 text-emerald-600" aria-hidden /> : <PenLine size={22} className="shrink-0 text-slate-400" aria-hidden />}
                <span className="min-w-0 flex-[1_1_240px] text-sm text-slate-600">
                  <b className="block text-base text-slate-800">{m.confirmation?.at ? `Signed by ${m.confirmation.name}` : 'Is the client with you?'}</b>
                  {m.confirmation?.at ? 'The record is confirmed.' : 'They can sign the record on this screen now. Their signature counts as their written approval of the rooms they were happy with.'}
                </span>
                {!m.confirmation?.at && <Btn kind="plain" icon={PenLine} onClick={() => setSigning(true)}>Client signs now</Btn>}
              </section>}
              <div className="flex flex-wrap justify-end gap-3">
                {totalChanges > 0 && <Btn kind="plain" onClick={() => onExit('home')}>See the client's changes on Home</Btn>}
                <Btn kind="primary" big onClick={() => onExit()}>Back to Meetings</Btn>
              </div>
            </>
          )}
        </div>
        {signing && <ClientSign orgId={orgId} projectId={projectId} meeting={m} onClose={() => setSigning(false)} onSigned={(x) => setLocal(x)} />}
        {clientView}
      </div>
    );
  }

  /* ============================================================ showing the drawings */
  const box = m.layout?.rooms?.[room.room] || null;
  const status = (r: DesignMeeting['rooms'][number]) => {
    const n = r.outcome === 'changes' ? r.changes.length : (changes[r.room] || []).length;
    return r.outcome === 'agreed' ? { tone: 'ok', text: 'Client is happy' }
      : r.outcome === 'changes' ? { tone: 'ch', text: `${plural(n, 'change')} to make` }
      : n ? { tone: 'ch', text: `${plural(n, 'change')} so far` } : { tone: '', text: plural(r.sheets.length, 'drawing') };
  };
  const firstOver = over && !mine.length;
  const costKinds: [ChangeCost['kind'], string][] = [['none', 'No cost change'], ['more', 'Costs more'], ['less', 'Costs less']];

  return (
    <div ref={root} className="dd2m-bg fixed inset-0 z-[110] flex flex-col overflow-hidden bg-slate-950 text-slate-100" style={DESK_ACCENT} role="dialog" aria-label="Client meeting">
      <DeskMotionStyles />
      <MeetMotionStyles />
      {/* ---------------- the top bar */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <span className="inline-flex h-8 items-center gap-2 rounded-full bg-rose-600 px-3 text-xs font-bold text-white" title="How long the meeting has run"><span className="dd2-dot h-1.5 w-1.5 rounded-full bg-white" /><Elapsed since={m.startedAt} /></span>
        <div className="min-w-0 flex-[1_1_220px]">
          <div className="truncate text-base font-bold">Meeting{m.attendees ? ` with ${m.attendees}` : ` · ${projectName}`}</div>
          <div className="truncate text-xs text-slate-400">Room {at + 1} of {m.rooms.length} · {done} done · {way === 'call' ? (client ? 'share the client window in your call' : 'open the client window for your call') : 'turn the screen to the client, or go full screen'}</div>
        </div>
        <span className={cx('dd2m-chip inline-flex min-h-[32px] items-center rounded-full px-3 text-xs font-bold', over ? 'is-over bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300')}
          title={over ? 'A change in this room starts a round that can be charged' : 'Revision rounds the client has used in this room'}>
          {roomLabel(room.room)}: {roundsLine(roundsUsed, m.includedRounds)}
        </span>
        {!full && (client ? (
          <span className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-emerald-900/70 pl-3 text-sm font-bold text-emerald-200">
            <Eye size={16} aria-hidden />
            <button type="button" onClick={() => client.win.focus()} className="min-h-[44px] pr-1" title="Bring the client's window to the front">Client window open</button>
            <button type="button" onClick={closeClient} aria-label="Close the client's window" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white/10"><X size={15} /></button>
          </span>
        ) : (
          <button type="button" onClick={launchClient} className={cx(dark, 'dd2m-soft text-white', way === 'call' && 'go')} title="For a call: a clean window with only the drawing, to share in Google Meet or Zoom">
            <MonitorUp size={16} aria-hidden />Client window
          </button>
        ))}
        <button type="button" onClick={full ? exitFull : enterFull} className={ghost} title={full ? 'Leave full screen (F)' : 'Fill this screen with the drawing, for a client in the room or a TV (F)'}>
          {full ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}{full ? 'Exit full screen' : 'Full screen'}
        </button>
        {!full && <button type="button" onClick={leave} className={ghost} title="The meeting stays open. Resume it from Meetings.">Leave for now</button>}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 lg:flex-row">
        {/* ---------------- the rooms */}
        {!full && (
          <nav aria-label="Rooms to show" className="flex shrink-0 gap-2 overflow-x-auto lg:w-[208px] lg:flex-col lg:overflow-y-auto">
            <p className="hidden px-1 text-xs font-semibold text-slate-400 lg:block">Rooms to show</p>
            {m.rooms.map((r, i) => {
              const on = i === at; const s = status(r);
              return (
                <button key={r.room} type="button" onClick={() => go(i)} aria-current={on ? 'true' : undefined}
                  className={cx('dd2m-room flex min-h-[56px] shrink-0 items-center gap-3 rounded-xl px-3 text-left', on ? 'is-on' : 'hover:bg-slate-900')}>
                  <span key={s.tone} className={cx('dd2m-disc grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold', r.outcome && 'is-done', s.tone === 'ok' ? 'bg-emerald-600 text-white' : s.tone === 'ch' ? 'bg-amber-500 text-white' : on ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-300')}>
                    {s.tone === 'ok' ? <Check size={15} strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-100">{roomLabel(r.room)}</span>
                    <span className={cx('block truncate text-xs', s.tone === 'ok' ? 'text-emerald-400' : s.tone === 'ch' ? 'text-amber-300' : 'text-slate-400')}>{s.text}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {/* ---------------- the drawing */}
        <section ref={viewer} className="dd2m-panel relative flex min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl lg:min-h-0">
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-800 px-2 py-2">
            <button type="button" onClick={() => step1(-1)} disabled={tabs.length < 2} aria-label="Previous drawing" className={icon}><ChevronLeft size={18} /></button>
            <b key={at} className="hud-swap shrink-0 px-1 text-base">{roomLabel(room.room)}</b>
            {room.sheets.map((s, i) => (
              <button key={s.drawingId} type="button" onClick={() => pick(i)} aria-pressed={tab === i}
                className={cx('dd2m-tab min-h-[40px] shrink-0 whitespace-nowrap rounded-xl px-3 text-sm font-bold', tab === i ? 'is-on bg-white text-slate-900' : 'bg-slate-800 text-slate-200 hover:bg-slate-700')}>
                {s.name}<span className={cx('ml-1.5 text-xs font-semibold', tab === i ? 'text-slate-500' : 'text-slate-400')}>v{s.versionNo}</span>
              </button>
            ))}
            {m.layout && (
              <button type="button" onClick={() => pick('plan')} aria-pressed={tab === 'plan'} title="Show the layout plan large (L)"
                className={cx('dd2m-tab inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-bold', tab === 'plan' ? 'is-on bg-white text-slate-900' : 'bg-slate-800 text-slate-200 hover:bg-slate-700')}>
                <MapPinned size={15} aria-hidden />Layout plan
              </button>
            )}
            <span className="flex-1" />
            <button type="button" onClick={() => step1(1)} disabled={tabs.length < 2} aria-label="Next drawing" className={icon}><ChevronRight size={18} /></button>
          </div>

          <div ref={stage} key={`${at}:${showPlan ? 'plan' : sheet}`} onScroll={mirror.onScroll} className="min-h-0 flex-1 overflow-auto p-3 pb-[76px]">
            {showPlan && m.layout ? (
              planTurnRaw === undefined ? <div className="grid h-full min-h-[240px] place-items-center text-slate-500"><Loader2 className="animate-spin" aria-label="Opening the layout plan" /></div>
                : <div className="dd2m-page mx-auto max-w-[1500px] rounded-xl bg-white p-3"><LayoutPanel sheet={m.layout} room={room.room} box={box} turn={planTurn} zoom={zoom} fitHeight={stageH > 240 ? stageH - 60 : undefined} maxWidth={4000} /></div>
            ) : sh.pdfPath ? (
              turnRaw === undefined ? <div className="grid h-full min-h-[240px] place-items-center text-slate-500"><Loader2 className="animate-spin" aria-label="Opening the drawing" /></div> : (
                <div key={`${sh.drawingId}/${sh.versionId}`} className="dd2m-page"><PdfStage pdfPath={sh.pdfPath} page={page} zoom={zoom} turn={turn} marks={marks} draft={draft?.shape || null}
                  tool={pinning ? 'pin' : 'select'} canMark={pinning && !draft && !room.outcome} markColor={CLIENT} onPageCount={setPages}
                  maxWidth={4000} fitHeight={stageH > 240 ? stageH - 4 : undefined}
                  overlay={<ChangePins changes={onPage} turn={turn} hot={hot} onHot={setHot} passive={pinning} studio={lead} />}
                  onShape={(shape) => setDraft({ shape, page, text: '', kind: '', amount: '', note: '' })} /></div>
              )
            ) : <div className="grid h-60 place-items-center text-slate-400">This drawing has no PDF.</div>}
          </div>

          {full && m.layout && !showPlan && (
            <button type="button" onClick={() => pick('plan')} title="Show the layout plan large (L)" className="absolute bottom-[76px] left-3 z-10 w-[240px] rounded-xl bg-white p-2 text-left shadow-2xl">
              <LayoutPanel sheet={m.layout} room={room.room} box={box} maxWidth={224} compact turn={planTurn} />
            </button>
          )}

          {stamp && (stamp.happy
            ? <div className="dd2-tick" role="status" aria-label="The client is happy"><svg viewBox="0 0 24 24" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
            : <div className="dd2m-stamp" role="status" aria-label={`${plural(stamp.n, 'change')} noted`}>{stamp.n}</div>)}

          {pinning && !draft && <div className="pointer-events-none absolute bottom-[76px] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-lg" role="status">Tap the drawing where the client wants a change</div>}

          {/* What the client wants, typed where everyone can see it. */}
          {draft && (
            <div className="phd-pop absolute bottom-[72px] left-1/2 z-20 w-[min(520px,calc(100%-24px))] -translate-x-1/2 rounded-3xl bg-white p-4 text-slate-800 shadow-2xl" role="group" aria-label="A change the client wants">
              <label htmlFor="dd2-meet-change" className="mb-2 block text-base font-bold">What does the client want changed here?</label>
              <textarea id="dd2-meet-change" autoFocus rows={2} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addDraft(); } if (e.key === 'Escape') { e.stopPropagation(); setDraft(null); } }}
                placeholder="For example: walnut shutters instead of white"
                className="w-full resize-none rounded-xl border-2 border-slate-300 px-3 py-2.5 text-base outline-none focus:border-emerald-600" />
              {lead && (
                <div className="mt-2 rounded-2xl bg-amber-50 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-amber-900"><IndianRupee size={15} aria-hidden />What does it do to the BOQ? <span className="font-normal text-amber-800">Your estimate. The client does not see it.</span></div>
                  <div className="mt-2 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Cost on the BOQ">
                    {costKinds.map(([k, t]) => (
                      <button key={k} type="button" role="radio" aria-checked={draft.kind === k} onClick={() => setDraft({ ...draft, kind: draft.kind === k ? '' : k })}
                        className={cx('min-h-[40px] rounded-xl border-2 px-3 text-sm font-bold transition-colors', draft.kind === k ? 'border-amber-600 bg-white text-amber-900' : 'border-amber-200 text-amber-900 hover:bg-white')}>{t}</button>
                    ))}
                  </div>
                  {(draft.kind === 'more' || draft.kind === 'less') && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <label className="flex min-h-[40px] items-center gap-1 rounded-xl border border-amber-300 bg-white px-2 text-sm focus-within:border-amber-600">
                        <span className="font-bold text-amber-900">About ₹</span>
                        <input value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value.replace(/[^0-9]/g, '').slice(0, 8) })} inputMode="numeric" placeholder="6500" aria-label="About how many rupees" className="w-24 bg-transparent outline-none" />
                      </label>
                      <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value.slice(0, 120) })} placeholder="What on the BOQ, for example dimmer driver" aria-label="What on the BOQ it touches"
                        className="min-h-[40px] min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 text-sm outline-none focus:border-amber-600" />
                    </div>
                  )}
                  {draft.kind && <p className="mt-1.5 text-xs text-amber-800">An estimate. You confirm it in the BOQ before it reaches the client's bill.</p>}
                </div>
              )}
              {firstOver && (
                <div className="mt-2 flex items-start gap-2 rounded-2xl bg-rose-50 px-3 py-2.5 text-sm text-rose-900" role="alert">
                  <Undo2 size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span><b className="block">This starts revision round {nextRound} for {roomLabel(room.room)}</b>{plural(m.includedRounds, 'round')} {m.includedRounds === 1 ? 'is' : 'are'} included, so this one can be charged. {lead ? 'You choose to bill or waive it when you finish.' : 'The Design Head decides whether to bill it.'}</span>
                </div>
              )}
              <div className="mt-3 flex justify-between gap-2">
                <Btn kind="plain" onClick={() => setDraft(null)}>Cancel</Btn>
                <Btn kind="primary" icon={MapPin} disabled={!draft.text.trim()} onClick={addDraft}>Add the change</Btn>
              </div>
            </div>
          )}

          {(
            <div className="absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-2xl border border-slate-600/40 bg-slate-800/95 p-1 shadow-2xl backdrop-blur" role="toolbar" aria-label="Drawing controls">
              {!showPlan && pages > 1 && <>
                <button type="button" onClick={() => { setPage((p) => Math.max(0, p - 1)); setDraft(null); }} disabled={page === 0} aria-label="Previous page" className={icon}><ChevronLeft size={17} /></button>
                <span className="whitespace-nowrap px-1 text-xs font-bold text-slate-300">Page {page + 1} of {pages}</span>
                <button type="button" onClick={() => { setPage((p) => Math.min(pages - 1, p + 1)); setDraft(null); }} disabled={page >= pages - 1} aria-label="Next page" className={icon}><ChevronRight size={17} /></button>
                <span className="mx-1 h-6 w-px shrink-0 bg-slate-700" />
              </>}
              <button type="button" onClick={() => zoomBy(-0.25)} aria-label="Zoom out" className={icon}><Minus size={17} /></button>
              <button type="button" onClick={() => setZoom(1)} title="Fit the drawing (0)" className="min-h-[40px] min-w-[52px] rounded-xl px-1 text-xs font-bold text-slate-200 hover:bg-slate-700">{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => zoomBy(0.25)} aria-label="Zoom in" className={icon}><Plus size={17} /></button>
              <button type="button" onClick={rotate} aria-label={showPlan ? 'Rotate the layout plan' : 'Rotate the drawing'} title={showPlan ? 'Turn the plan a quarter (R). It is remembered on this device.' : 'Rotate (R). Pins stay where they are on the drawing.'} className={icon}><RotateCw size={17} /></button>
              {!showPlan && <button type="button" onClick={download} disabled={saving || !sh.pdfPath} aria-label={`Download ${sh.name} v${sh.versionNo}`} title="Download the approved PDF" className={icon}>{saving ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}</button>}
            </div>
          )}
        </section>

        {/* ---------------- the plan, the client window, the changes and the minutes */}
        {!full && (
          <aside className="flex min-h-0 shrink-0 flex-col gap-3 overflow-y-auto pb-1 lg:w-[292px]" aria-label="Meeting notes">
            {(way === 'call' || client) && (
              <button type="button" onClick={client ? () => client.win.focus() : launchClient} className={cx('dd2m-panel dd2m-lift dd2m-rise flex shrink-0 items-center gap-3 rounded-2xl p-3 text-left', !client && 'dd2m-call')}>
                <span className={cx('relative grid h-11 w-11 shrink-0 place-items-center rounded-xl', client ? 'bg-emerald-900/60 text-emerald-300' : 'bg-slate-800 text-slate-400')}>{client ? <Eye size={20} aria-hidden /> : <MonitorUp size={20} aria-hidden />}{client && <span className="dd2-dot absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden />}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">Client window</span>
                  <span className={cx('block text-sm font-bold', client ? 'text-emerald-400' : 'text-amber-300')}>{client ? 'Open. This is what the client sees.' : 'Not open yet. Press to open it.'}</span>
                </span>
              </button>
            )}
            {client && <p className="shrink-0 px-1 text-xs text-slate-400">In your call, share the window called <b className="text-slate-200">Design meeting · {projectName}</b>. It follows what you show here.</p>}

            {m.layout && (
              <button type="button" onClick={() => pick(tab === 'plan' ? 0 : 'plan')} title="Show the layout plan large (L)" className="dd2m-panel dd2m-lift dd2m-rise shrink-0 rounded-2xl p-3 text-left" style={{ animationDelay: '60ms' }}>
                <span className="mb-2 flex items-center gap-2"><span className="flex-1 text-xs font-bold uppercase tracking-wider text-slate-400">Layout plan</span><span className="truncate text-xs font-bold text-emerald-400">{box ? roomLabel(room.room) : 'Room not marked'}</span></span>
                <span className="block overflow-hidden rounded-lg bg-white p-1.5"><LayoutPanel sheet={m.layout} room={room.room} box={box} maxWidth={250} compact turn={planTurn} /></span>
              </button>
            )}

            <div className="dd2m-panel dd2m-rise shrink-0 rounded-2xl p-3" style={{ animationDelay: '120ms' }}>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">The client's changes · {roomLabel(room.room)}</div>
              {mine.length ? (
                <ul className="flex flex-col gap-1.5">
                  {mine.map((c) => (
                    <li key={c.n} className="hud-row-in"><Tilt className={cx('dd2-note flex items-start gap-2.5 rounded-xl bg-slate-800 p-2.5', hot === c.n && 'is-hot')} style={{ ['--pin' as any]: '#F59E0B' }}
                      onMouseEnter={() => setHot(c.n)} onMouseLeave={() => setHot(null)}>
                      <span className="dd2-badge mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white">{c.n}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-100">{c.text}</span>
                        <span className="block truncate text-xs text-slate-400">On {room.sheets.find((s) => s.drawingId === c.drawingId)?.name}{c.page ? `, page ${c.page + 1}` : ''}</span>
                        {lead && c.cost && <span className="block text-xs font-semibold text-amber-300">{costLine(c.cost)}</span>}
                      </span>
                      {!room.outcome && <button type="button" onClick={() => removeChange(c.n)} aria-label={`Remove change ${c.n}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"><Trash2 size={15} /></button>}
                    </Tilt></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-400">{room.outcome === 'agreed' ? 'The client is happy with this room as shown.' : pinning ? 'Tap the drawing to pin the first change.' : 'None yet. If the client asks for something, press Add a change and tap the drawing.'}</p>}
            </div>

            <div className="dd2m-panel dd2m-rise flex min-h-[160px] flex-1 flex-col rounded-2xl p-3" style={{ animationDelay: '180ms' }}>
              <div className="mb-2 flex items-center gap-2"><span className="flex-1 text-xs font-bold uppercase tracking-wider text-slate-400">Minutes</span><span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400"><span className="dd2-dot h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />writing as you go</span></div>
              <MinutesList lines={shownLines} dark className="min-h-0 flex-1" />
            </div>
          </aside>
        )}
      </div>

      {/* ---------------- what the room ends with */}
      <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-4 pt-3">
        <div className="min-w-0 flex-[1_1_220px]">
          <div className="truncate text-sm font-bold text-slate-100">
            {room.outcome ? `${roomLabel(room.room)}: ${room.outcome === 'agreed' ? 'the client is happy' : `${plural(room.changes.length, 'change')} recorded`}. You can reopen it until the meeting is saved.` : `${roomLabel(room.room)}: what does the client say?`}
          </div>
          <div className="truncate text-xs text-slate-400">Keys: C add a change{m.layout ? ' · L layout plan' : ''} · ← → drawings · F full screen · Ctrl + scroll to zoom</div>
        </div>
        {room.outcome ? (
          <button type="button" disabled={busy} onClick={reopen} className={cx(dark, 'dd2m-key slate min-h-[48px] text-base')}><span className="ico"><Undo2 size={18} aria-hidden /></span>Reopen this room</button>
        ) : (<>
          <button type="button" onClick={startPin} aria-pressed={pinning} title="Pin what the client wants changed on the drawing (C)"
            className={cx(dark, 'dd2m-key amber min-h-[48px] text-base', pinning && 'is-on')}>
            <span className="ico"><MapPin size={18} aria-hidden /></span>{pinning ? 'Stop adding' : 'Add a change'}
          </button>
          <button type="button" disabled={busy || !!draft} onClick={() => decide(mine.length ? 'changes' : 'agreed')} className={cx(dark, 'dd2m-key emerald min-h-[48px] text-base')}>
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <span className="ico"><Check size={18} strokeWidth={2.6} aria-hidden /></span>}
            {mine.length ? `Done: ${plural(mine.length, 'change')} for this room` : 'Client is happy with this room'}
          </button>
        </>)}
        <button type="button" onClick={() => { exitFull(); setPinning(false); setDraft(null); setStep('wrap'); }} title={done ? undefined : 'You can finish even if the client has not decided on a room'}
          className={cx(dark, 'dd2m-key rose min-h-[48px] text-base')}>
          <span className="ico"><PhoneOff size={18} aria-hidden /></span>Finish the meeting
        </button>
      </footer>
      {clientView}
    </div>
  );
}

