import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, Columns2, History, Info, Layers, ListChecks, Loader2, MapPin, MessageSquare,
  Minus, MousePointer2, MoveUpRight, PenLine, Plus, Presentation, RotateCcw, RotateCw, Send, Sparkles, Square, Trash2, Undo2, Upload,
} from 'lucide-react';
import {
  watchDrawing, watchVersions, watchMarks, watchRounds, watchEvents, uploadSheet, submitSheet, withdrawSheet,
  approveSheet, returnSheet, clientReturn, clientKeep, createMark, deleteMark, updateMark, fixMark, setAudience, removeVersion, ReviewError, type ReviewDrawing,
} from '../../services/drawingReviewService';
import { canReview, canUpload, canSetAudience, allowed, clientPending, stateOf, refusal, guessAudience, turnShape, type Turn, type MarkShape, type ReviewMark, type ReviewVersion, type ReviewRound, type ReviewEvent } from '../../lib/drawingReview';
import { roundWarn, INCLUDED_ROUNDS } from '../../lib/designDesk';
import { thumbnailOf } from '../../lib/pdfRender';
import { roleLabel, type RoleSet } from '../../lib/roles';
import PdfStage, { type Tool } from './PdfStage';
import { useSheetChanges } from './useSheetChanges';
import { MARK, FIXED, CLIENT, roomLabel, ago, shortDate, firstName, useToast, Initials } from './ui';
import { Chip, ProjectMark, StatusPill } from './DeskParts';

export interface Me { uid: string; email: string; name: string }

/*
  ONE SHEET, in focus. The light table with the drawing, one dock of tools
  under it, and the notes beside it with the decision at their foot. A note
  is written right where it is pinned. After each decision the next sheet
  waiting opens; after sending, the designer goes back to the desk.
*/

interface Props {
  orgId: string;
  projectId: string;
  drawingId: string;
  projectName: string;
  look: { code: string; color: string; soft: string };
  /** Other sheets in this project that need the viewer. */
  projectNeeds?: number;
  /** One role, or all of the person's roles (lib/roles). */
  role: RoleSet;
  me: Me;
  queue: { projectId: string; drawingId: string }[];
  onClose: () => void;
  onOpen: (next: { projectId: string; drawingId: string }) => void;
}

const TOOLS: [Tool, string, string, string, React.ComponentType<any>][] = [
  ['select', 'V', 'Select', 'Click a note to see it. Clicks on the sheet add nothing.', MousePointer2],
  ['pin', 'P', 'Pin', 'Click to drop a numbered note', MapPin],
  ['rect', 'B', 'Box', 'Drag across an area to box it', Square],
  ['arrow', 'A', 'Arrow', 'Drag from the note to what it points at', MoveUpRight],
  ['pen', 'D', 'Draw', 'Sketch freehand on the sheet', PenLine],
];
const SHAPE_WORD: Record<string, string> = { pin: 'Pin', rect: 'Box', arrow: 'Arrow', pen: 'Sketch' };
const EVENT_WORD: Record<string, string> = { uploaded: 'uploaded', submitted: 'sent for review', withdrawn: 'pulled back', returned: 'returned', approved: 'approved', audience: 'changed who it is for', removed: 'removed the PDF', client: 'presented it to the client', clientKept: 'kept it approved after the meeting' };
const QUICK = ['Check this dimension', 'Line this up with the ceiling plan', 'Match the material schedule', 'Show the hinge side', 'Add a section through here'];

/* Small per-person memory on this device: phrases used in notes, fixes already checked, the change outline on or off. */
const read = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage off */ } };
const phraseOf = (text: string) => { const s = text.split(/[.\n]/)[0].trim(); return s.length >= 6 && s.length <= 60 ? s : null; };

const SheetStudio: React.FC<Props> = ({ orgId, projectId, drawingId, projectName, look, projectNeeds = 0, role, me, queue, onClose, onOpen }) => {
  const toast = useToast();
  const target = { orgId, projectId, drawingId };
  const [d, setD] = useState<ReviewDrawing | null | undefined>(undefined);
  const [versions, setVersions] = useState<ReviewVersion[]>([]);
  const [marks, setMarks] = useState<ReviewMark[]>([]);
  const [rounds, setRounds] = useState<ReviewRound[]>([]);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  /* How this person has the sheet turned; remembered per drawing on this device, never shared. */
  const turnKey = `ffds_dr_turn_${projectId}_${drawingId}`;
  const [turn, setTurnRaw] = useState<Turn>(() => { const v = Number(read(turnKey, 0)); return ([0, 90, 180, 270].includes(v) ? v : 0) as Turn; });
  const rotate = () => setTurnRaw((t) => { const n = (((t + 90) % 360) as Turn); write(turnKey, n); return n; });
  const [compare, setCompare] = useState(false);
  const spotKey = `ffds_dr_spot_${me.uid}`;
  const [spot, setSpotRaw] = useState<boolean>(() => read(spotKey, true));
  const setSpot = (v: boolean) => { setSpotRaw(v); write(spotKey, v); };
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ shape: MarkShape; anchor: { x: number; y: number }; text: string; blocking: boolean } | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [retMsg, setRetMsg] = useState('');
  const [clientStep, setClientStep] = useState<'send' | 'keep' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [railTab, setRailTab] = useState<'notes' | 'history'>('notes');
  const [upload, setUpload] = useState<{ stage: string; fraction?: number } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [versionMenu, setVersionMenu] = useState(false);
  const [fileOver, setFileOver] = useState(false);
  const checkedKey = `ffds_dr_checked_${me.uid}`;
  const [checked, setCheckedRaw] = useState<Record<string, 'ok' | 'open'>>(() => read(checkedKey, {}));
  const setChecked = (id: string, v: 'ok' | 'open' | null) => setCheckedRaw((c) => { const n = { ...c }; if (v) n[id] = v; else delete n[id]; write(checkedKey, n); return n; });
  const phrasesKey = `ffds_dr_phrases_${me.uid}`;
  const fileInput = useRef<HTMLInputElement>(null);
  const draftBox = useRef<HTMLTextAreaElement>(null);
  const depth = useRef(0);

  useEffect(() => {
    setD(undefined); setViewId(null); setPage(0); setCompare(false); setSelected(null); setDraft(null); setRetMsg(''); setRequestOpen(false);
    const off = [
      watchDrawing(orgId, projectId, drawingId, setD),
      watchVersions(orgId, projectId, drawingId, setVersions),
      watchMarks(orgId, projectId, drawingId, setMarks),
      watchRounds(orgId, projectId, drawingId, setRounds),
      watchEvents(orgId, projectId, drawingId, setEvents),
    ];
    return () => off.forEach((f) => f());
  }, [orgId, projectId, drawingId]);

  const r = d?.review;
  const state = stateOf(r);
  const current = versions.find((v) => v.id === r?.versionId) || versions[versions.length - 1] || null;
  const viewing = versions.find((v) => v.id === viewId) || current;
  const isCurrent = !!viewing && viewing.id === current?.id;
  const prev = viewing ? versions.find((v) => v.n === viewing.n - 1) || null : null;
  const onSheet = marks.filter((m) => m.versionId === viewing?.id);
  const fixedFromPrev = isCurrent && prev ? marks.filter((m) => m.versionId === prev.id && m.status === 'FIXED') : [];
  const reviewer = canReview(role);
  /* The client asked for changes at the design meeting; the Design Head decides what reaches the designer. */
  const fromClient = clientPending(r) && isCurrent;
  const canMark = reviewer && (state === 'IN_REVIEW' || fromClient) && isCurrent && !compare;
  const canDecide = reviewer && state === 'IN_REVIEW' && isCurrent;
  const canFix = canUpload(role) && state === 'CHANGES_REQUESTED' && isCurrent;
  const canUploadNew = canUpload(role) && allowed('finalize', r);
  const canSend = canUpload(role) && state === 'DRAFT' && !!r?.versionId;
  const canPullBack = canUpload(role) && state === 'IN_REVIEW' && (!reviewer || r?.designer?.email === me.email);
  const blockingOpen = onSheet.filter((m) => m.blocking && m.status === 'OPEN').length;
  /* A wrong PDF can be taken back while nobody has reviewed it: by whoever uploaded it, or a lead. */
  const canRemove = canUpload(role) && state === 'DRAFT' && isCurrent && !!current && onSheet.length === 0
    && !rounds.some((x) => x.versionId === current.id && (x.status === 'APPROVED' || x.status === 'CHANGES_REQUESTED'))
    && (current.by?.uid === me.uid || canSetAudience(role));
  const lastReturn = [...rounds].reverse().find((x) => x.status === 'CHANGES_REQUESTED');
  const qIndex = queue.findIndex((q) => q.drawingId === drawingId && q.projectId === projectId);
  const self = r?.designer?.email === me.email;
  const audience = r?.audience || (d ? guessAudience(d.name) : 'client');
  const fixedN = onSheet.filter((m) => m.status === 'FIXED').length;
  const round = roundWarn(r);

  /* Where the sheet changed since the last version, outlined on the page. */
  const spotting = spot && isCurrent && !!prev && !compare;
  const changes = useSheetChanges(viewing?.pdfPath, prev?.pdfPath, page, spotting);
  const boxes = spotting && changes.diff?.kind === 'boxes' ? changes.diff.boxes : null;

  useEffect(() => { if (!prev) setCompare(false); }, [prev?.id]);
  useEffect(() => { if (draft) setTimeout(() => draftBox.current?.focus(), 30); }, [!!draft]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
      if (e.key === 'Escape') { if (draft) setDraft(null); else if (versionMenu) setVersionMenu(false); else setTool('select'); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = ({ v: 'select', p: 'pin', b: 'rect', a: 'arrow', d: 'pen' } as Record<string, Tool>)[e.key.toLowerCase()];
      if (t && canMark) setTool(t);
      if (e.key.toLowerCase() === 'c' && prev) setCompare((c) => !c);
      if (e.key.toLowerCase() === 'r') rotate();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [canMark, prev?.id, !!draft, versionMenu]);

  /* A PDF dropped anywhere on this screen becomes this sheet's next version. */
  useEffect(() => {
    if (!canUpload(role)) return;
    const has = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const enter = (e: DragEvent) => { if (!has(e)) return; depth.current++; setFileOver(true); };
    const leave = (e: DragEvent) => { if (!has(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setFileOver(false); };
    const over = (e: DragEvent) => { if (has(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!has(e)) return;
      e.preventDefault(); depth.current = 0; setFileOver(false);
      const f = e.dataTransfer!.files[0];
      if (f) revise(f);
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [roleLabel(role), r?.rev, r?.state]);

  async function act(label: string, fn: () => Promise<any>, ok?: { title: string; sub?: string; celebrate?: boolean }) {
    setBusy(label);
    try {
      const res = await fn();
      if (ok) toast({ ...ok, ok: true });
      return res ?? true;
    } catch (e: any) {
      const err = e as ReviewError;
      toast({ title: err.code === 'aborted' ? 'This sheet changed a moment ago' : 'Not saved', sub: e?.message });
      return null;
    } finally {
      setBusy(null);
    }
  }

  function goNext() {
    const rest = queue.filter((q) => !(q.drawingId === drawingId && q.projectId === projectId));
    if (rest.length) onOpen(rest[0]); else onClose();
  }

  async function decide(kind: 'approve' | 'return') {
    if (!r) return;
    if (kind === 'return' && !retMsg.trim() && !onSheet.length) {
      toast({ title: 'Mark the sheet or write a line first', sub: 'A returned sheet needs at least one thing to fix.' });
      return;
    }
    const rest = queue.filter((q) => !(q.drawingId === drawingId && q.projectId === projectId)).length;
    const res = await act(kind, () => (kind === 'approve' ? approveSheet(target, r.rev) : returnSheet(target, r.rev, retMsg.trim())),
      kind === 'approve'
        ? { celebrate: true, title: `v${r.versionNo} approved${self ? ' (self-approved)' : ''}`, sub: rest ? `${rest} more waiting. Opening the next one.` : audience === 'client' ? 'Ready for the client meeting. Your queue is clear.' : 'Final, and it stays inside the studio.' }
        : { title: `Back with ${self ? 'you' : firstName(r.designer?.name)}`, sub: `${onSheet.length ? `${onSheet.length} note${onSheet.length === 1 ? '' : 's'} to fix` : 'With your message'}${rest ? ' · opening the next one' : ''}.` });
    if (res) goNext();
  }

  async function decideClient(kind: 'send' | 'keep') {
    if (!r) return;
    const res = await act(kind, () => (kind === 'send' ? clientReturn(target, r.rev, retMsg.trim() || undefined) : clientKeep(target, r.rev, retMsg.trim() || undefined)),
      kind === 'send'
        ? { title: `Back with ${self ? 'you' : firstName(r.designer?.name)}`, sub: `${onSheet.filter((m) => m.status === 'OPEN').length} client change${onSheet.filter((m) => m.status === 'OPEN').length === 1 ? '' : 's'} to make.` }
        : { title: `v${r.versionNo} stays approved`, sub: "The client's notes are cleared; the history keeps them." });
    if (res) { setClientStep(null); setRetMsg(''); goNext(); }
  }

  async function saveDraft() {
    if (!draft) return;
    const text = draft.text.trim();
    if (!text) { draftBox.current?.focus(); return; }
    const res = await act('mark', () => createMark(target, page, draft.shape, text, draft.blocking));
    if (res) {
      setDraft(null); setSelected(res.mark?.id || null);
      const ph = phraseOf(text);
      if (ph) { const m = read<Record<string, number>>(phrasesKey, {}); m[ph] = (m[ph] || 0) + 1; write(phrasesKey, m); }
    }
  }

  async function revise(file: File) {
    if (!/\.pdf$/i.test(file.name)) { toast({ title: /\.(dwg|dxf)$/i.test(file.name) ? 'A CAD file cannot be reviewed' : 'Only PDFs can be reviewed', sub: 'Export the drawing as a PDF and drop that.' }); return; }
    if (!allowed('finalize', r)) { toast({ title: 'Not now', sub: refusal('finalize', r) }); return; }
    setUpload({ stage: 'Making a preview…' });
    try {
      const thumb = await thumbnailOf(file);
      const res = await uploadSheet(target, me.uid, file, {
        thumb, expectedRev: r?.rev,
        onStage: (stage, fraction) => setUpload({ stage: stage === 'uploading' ? 'Uploading…' : 'Checking the PDF…', fraction }),
      });
      setViewId(null);
      toast({ ok: true, title: `v${res.versionNo} is on the table`, sub: (res?.versionNo || 0) > 1 ? 'What changed is outlined on the sheet. Send it when it looks right.' : 'Send it to the Design Head when you are ready.' });
    } catch (e: any) {
      toast({ title: 'Upload not saved', sub: e?.message });
    } finally {
      setUpload(null);
    }
  }

  async function send() {
    const res = await act('send', () => submitSheet(target, r!.rev), { title: `${d!.name} is with the Design Head`, sub: 'Nothing goes to the client from here.' });
    if (res !== null) setTimeout(onClose, 350);
  }

  async function stillOpen(m: ReviewMark) {
    const res = await act(`reopen-${m.id}`, () => createMark(target, m.page, m.shape, `Still open from v${prev!.n}: ${m.text}`, true),
      { title: 'Sent back as a must-fix note', sub: 'It sits where the original note was.' });
    if (res) { setChecked(m.id, 'open'); setSelected(res.mark?.id || null); }
  }

  const snippets = useMemo(() => {
    const mine = Object.entries(read<Record<string, number>>(phrasesKey, {})).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 3);
    return [...new Set([...mine, ...QUICK])].slice(0, 5);
  }, [phrasesKey, !!draft]);

  if (d === undefined) return <div className="grid min-h-[60vh] place-items-center text-[#8A8E97]"><Loader2 className="animate-spin" /></div>;
  if (d === null) return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="text-lg font-semibold text-[#17191E]">This drawing is not in the tracker any more.</p>
      <button type="button" onClick={onClose} className="mt-4 rounded-xl bg-[#17191E] px-4 py-2 text-sm font-bold text-white">Back to Design Desk</button>
    </div>
  );

  const toolNow = TOOLS.find((t) => t[0] === tool) || TOOLS[0];
  const dockBtn = (on = false) => `inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-[11px] px-2.5 text-[12.5px] font-bold transition disabled:opacity-40 ${on ? 'bg-[#17191E] text-white' : 'text-[#4F535C] hover:bg-[#F1F1EC] hover:text-[#17191E]'}`;
  const sep = <span className="mx-1 h-6 w-px shrink-0 bg-[#E4E4DE]" />;
  const draftNo = (r?.marksSeq || 0) + 1;
  const roundLabel = (v: ReviewVersion) => {
    const rd = [...rounds].reverse().find((x) => x.versionId === v.id);
    return rd ? ({ OPEN: 'In review', APPROVED: 'Approved', CHANGES_REQUESTED: 'Returned', WITHDRAWN: 'Pulled back' } as Record<string, string>)[rd.status] : 'Not sent';
  };

  /* Positioned by the outer box; the inner one animates, so the pop-in cannot undo the placement. */
  const composer = draft && (
    <div className="absolute z-20 w-[340px] max-w-[calc(100vw-48px)]" onPointerDown={(e) => e.stopPropagation()}
      style={{ left: `${draft.anchor.x * 100}%`, top: `${draft.anchor.y * 100}%`, transform: `translate(${draft.anchor.x > 0.58 ? 'calc(-100% - 22px)' : '22px'}, ${draft.anchor.y > 0.5 ? 'calc(-100% + 18px)' : '-18px'})` }}>
    <div className="dd-pop rounded-[18px] border border-[#E4E4DE] bg-white p-3.5 shadow-[0_20px_44px_-18px_rgba(23,25,30,0.45)]">
      <label htmlFor="dd-draft" className="mb-1.5 flex items-center gap-2 text-[13px] font-bold text-[#17191E]">
        <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-extrabold text-white" style={{ background: MARK }}>{draftNo}</span>
        Note {draftNo} for {self ? 'your own sheet' : firstName(r?.designer?.name)}
      </label>
      <textarea id="dd-draft" ref={draftBox} value={draft.text} rows={3} placeholder="What should change here?"
        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveDraft(); } if (e.key === 'Escape') setDraft(null); }}
        className="w-full rounded-[10px] border border-[#DCDCD5] px-3 py-2.5 text-[13.5px] outline-none focus:border-[#4146C8] focus:shadow-[0_0_0_3px_rgba(65,70,200,0.15)]" />
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick notes">
        {snippets.map((s) => (
          <button key={s} type="button" onClick={() => setDraft({ ...draft, text: draft.text.trim() ? `${draft.text.trim()} ${s}.` : `${s}.` })}
            className="min-h-[26px] rounded-full border border-[#DCDCD5] bg-white px-2 text-[11px] font-bold text-[#4F535C] hover:border-[#A9AAA2] hover:text-[#17191E]">{s}</button>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-2 text-[13px] font-bold text-[#B4232F]">
          <input type="checkbox" checked={draft.blocking} onChange={(e) => setDraft({ ...draft, blocking: e.target.checked })} className="h-[18px] w-[18px] accent-[#D9354B]" />Must fix
        </label>
        <span className="flex-1" />
        <button type="button" onClick={() => setDraft(null)} className="min-h-[36px] rounded-[10px] px-3 text-[13px] font-bold text-[#4F535C] hover:bg-[#EBEBE5]">Cancel</button>
        <button type="button" onClick={saveDraft} disabled={busy === 'mark'} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[10px] bg-[#4146C8] px-3.5 text-[13px] font-bold text-white hover:bg-[#3439AD] disabled:opacity-50">
          {busy === 'mark' && <Loader2 size={14} className="animate-spin" />}Add
        </button>
      </div>
      <div className="mt-1.5 text-[11px] text-[#8A8E97]">Ctrl + Enter to add · Esc to cancel</div>
    </div>
    </div>
  );

  const banner = (tone: 'amber' | 'green' | 'grey', icon: React.ReactNode, text: React.ReactNode, action?: React.ReactNode) => (
    <div className="dd-rise mx-3.5 mt-3.5 flex flex-wrap items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px]"
      style={{ background: tone === 'amber' ? '#FBF1E3' : tone === 'green' ? '#E3F2EA' : '#EEEEEA', color: tone === 'amber' ? '#6E3B05' : tone === 'green' ? '#134F38' : '#4F535C' }}>
      {icon}<span className="min-w-0 flex-[1_1_240px]">{text}</span>{action}
    </div>
  );

  return (
    <div className="dd-rise">
      <div className="mb-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
        <button type="button" onClick={onClose} className="inline-flex min-h-[38px] items-center gap-1 rounded-[10px] py-0 pl-2 pr-3 text-[13px] font-bold text-[#4F535C] hover:bg-[#EBEBE5] hover:text-[#17191E]">
          <ChevronLeft size={16} strokeWidth={2.4} />Design Desk
        </button>
        <span className="inline-flex min-w-0 items-center gap-2 rounded-full border-[1.5px] py-[5px] pl-[5px] pr-3" style={{ background: look.soft, borderColor: look.color }}>
          <ProjectMark code={look.code} color={look.color} size={26} round />
          <span className="truncate text-[13px] font-extrabold" style={{ color: look.color }}>{projectName}</span>
          <span className="truncate text-[13px] text-[#4F535C]">› {roomLabel(d.roomName)}</span>
          {projectNeeds > 0 && <span className="whitespace-nowrap rounded-full bg-white px-1.5 text-[10.5px] font-bold" style={{ color: look.color }} title="Other sheets in this project that need you">{projectNeeds} more {reviewer ? 'waiting' : 'need you'}</span>}
        </span>
        <span className="flex-1" />
        {reviewer && qIndex >= 0 && queue.length > 1 && (
          <div className="inline-flex items-center gap-0.5">
            <button type="button" onClick={() => onOpen(queue[(qIndex - 1 + queue.length) % queue.length])} aria-label="Previous sheet waiting" className="grid min-h-[38px] w-10 place-items-center rounded-[10px] text-[#4F535C] hover:bg-[#EBEBE5]"><ChevronLeft size={16} strokeWidth={2.4} /></button>
            <span className="min-w-[96px] text-center text-[13px] font-bold">{qIndex + 1} of {queue.length} waiting</span>
            <button type="button" onClick={() => onOpen(queue[(qIndex + 1) % queue.length])} aria-label="Next sheet waiting" className="grid min-h-[38px] w-10 place-items-center rounded-[10px] text-[#4F535C] hover:bg-[#EBEBE5]"><ChevronRight size={16} strokeWidth={2.4} /></button>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-[27px] font-semibold tracking-tight text-[#17191E]">{d.name}</h1>
        <StatusPill state={state} />
        {round > 0 && <Chip tone="red" title={`${INCLUDED_ROUNDS} review rounds are included. Further rounds may count as chargeable revisions.`}>Round {round} · {INCLUDED_ROUNDS} included</Chip>}
        <span className="flex-1" />
        {canSetAudience(role) ? (
          <label className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#4F535C]">For
            <select value={audience} disabled={busy === 'audience'} aria-label="Who this drawing is for"
              onChange={(e) => act('audience', () => setAudience(target, e.target.value as any), { title: e.target.value === 'client' ? 'Shown to the client in meetings' : 'Kept inside the studio', sub: d.name })}
              className="min-h-[38px] rounded-[10px] border border-[#DCDCD5] bg-white px-2 font-bold text-[#17191E]">
              <option value="client">the client</option>
              <option value="studio">the studio only</option>
            </select>
          </label>
        ) : <Chip tone="grey">{audience === 'studio' ? 'Studio only' : 'For the client'}</Chip>}
        {versions.length > 0 && (
          <div className="relative">
            <button type="button" onClick={() => setVersionMenu((o) => !o)} aria-expanded={versionMenu}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] border border-[#DCDCD5] bg-white px-3 text-[13px] font-bold hover:border-[#A9AAA2]">
              <Layers size={15} />v{viewing?.n}{!isCurrent ? ' · older' : ''}<ChevronDown size={14} strokeWidth={2.4} />
            </button>
            {versionMenu && (
              <div className="dd-pop absolute right-0 top-[46px] z-30 w-[250px] rounded-[18px] border border-[#E4E4DE] bg-white p-1.5 shadow-[0_18px_40px_-16px_rgba(23,25,30,0.35)]" style={{ transformOrigin: 'top right' }}>
                {[...versions].reverse().map((v) => (
                  <button key={v.id} type="button" onClick={() => { setViewId(v.id === current?.id ? null : v.id); setCompare(false); setSelected(null); setVersionMenu(false); setDraft(null); }}
                    className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left ${v.id === viewing?.id ? 'bg-[#F1F1EC]' : 'hover:bg-[#F6F6F2]'}`}>
                    <b className="w-7">v{v.n}</b>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#5F636D]">{roundLabel(v)} · {firstName(v.by?.name)}, {shortDate(v.at)}</span>
                    {v.id === viewing?.id && <Check size={15} className="text-[#1F7A57]" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <div className="relative flex min-h-[620px] min-w-0 flex-[999_1_620px] flex-col overflow-hidden rounded-[22px]"
          style={{ backgroundColor: '#E8E8E2', backgroundImage: 'radial-gradient(#D3D3CB 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
          {fromClient && banner('amber', <Presentation size={16} />,
            reviewer
              ? <>The client asked for <b>{r?.clientChanges?.count || onSheet.length} change{(r?.clientChanges?.count || onSheet.length) === 1 ? '' : 's'}</b> at the design meeting{r?.clientChanges?.at ? ` on ${shortDate(r.clientChanges.at)}` : ''}. Edit or add notes, then send them to {self ? 'yourself' : firstName(r?.designer?.name)}, or keep the sheet approved.</>
              : <>The client asked for changes at the design meeting. The Design Head looks at them first, then sends them to you.</>)}
          {!isCurrent && viewing && banner('amber', <History size={16} />, <>You are looking at <b>v{viewing.n}</b>, an older version. Its notes stay with it.</>,
            <button type="button" onClick={() => setViewId(null)} className="min-h-[34px] rounded-[10px] border border-[#DCDCD5] bg-white px-3 text-[13px] font-bold text-[#17191E]">Back to v{current?.n}</button>)}
          {isCurrent && prev && reviewer && fixedFromPrev.length > 0 && !compare && banner('green', <Check size={16} strokeWidth={2.4} />,
            <>{self ? 'You' : firstName(r?.designer?.name)} marked {fixedFromPrev.length} note{fixedFromPrev.length === 1 ? '' : 's'} from v{prev.n} as fixed. {boxes ? `${boxes.length} area${boxes.length === 1 ? '' : 's'} changed, outlined on the sheet.` : 'Compare to check.'}</>,
            <button type="button" onClick={() => setCompare(true)} className="min-h-[34px] rounded-[10px] border border-[#DCDCD5] bg-white px-3 text-[13px] font-bold text-[#17191E]">Compare with v{prev.n}</button>)}
          {spotting && changes.busy && banner('grey', <Loader2 size={15} className="animate-spin" />, `Spotting what changed since v${prev!.n}…`)}
          {spotting && changes.diff?.kind === 'mostly' && banner('grey', <Sparkles size={15} />, `Most of the sheet changed since v${prev!.n}. Compare shows them side by side.`)}
          {spotting && changes.diff?.kind === 'size' && banner('grey', <Sparkles size={15} />, `The page size changed since v${prev!.n}, so the changes cannot be outlined. Compare shows them side by side.`)}
          {spotting && changes.diff?.kind === 'same' && banner('grey', <Sparkles size={15} />, `Nothing on this page changed since v${prev!.n}.`)}

          <div className="flex-1 overflow-auto px-7 pb-[130px] pt-9">
            {viewing ? (
              <div>
                <PdfStage
                  pdfPath={viewing.pdfPath} comparePath={compare && prev ? prev.pdfPath : null} compareLabel={prev ? [`v${prev.n}`, `v${viewing.n}`] : undefined}
                  page={page} zoom={zoom} turn={turn} marks={onSheet.filter((m) => m.page === page)} draft={draft?.shape || null} selectedId={selected}
                  tool={tool} canMark={canMark && !draft} onPageCount={setPages} changes={boxes}
                  onSelect={(id) => { setSelected(id); setRailTab('notes'); }}
                  onShape={(shape, anchor) => { setDraft({ shape, anchor, text: '', blocking: false }); setRailTab('notes'); setSelected(null); }}
                  overlay={composer}
                />
              </div>
            ) : (
              <div className="mx-auto mt-16 max-w-[440px] rounded-[22px] border-2 border-dashed border-[#C9C9C1] bg-white/60 px-6 py-9 text-center">
                <div className="font-display text-[22px] font-semibold text-[#17191E]">A clear desk</div>
                <p className="mb-4 mt-1.5 text-[#5F636D]">{canUploadNew ? `Drop the first PDF of ${d.name} anywhere on this page. It becomes v1.` : 'No PDF has been uploaded for this sheet yet.'}</p>
                {upload ? <UploadProgress upload={upload} /> : canUploadNew && (
                  <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#4146C8] px-[18px] text-[14px] font-bold text-white hover:bg-[#3439AD]"><Upload size={16} />Choose a PDF</button>
                )}
              </div>
            )}
          </div>

          {viewing && (
            <div className="absolute bottom-4 left-1/2 z-10 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 flex-col items-center gap-2">
              {canMark && !draft && <div className="dd-rise rounded-full bg-[rgba(23,25,30,0.86)] px-3 py-1.5 text-center text-[12.5px] font-semibold text-white">{toolNow[2]}: {toolNow[3]}</div>}
              <div className="flex flex-wrap items-center justify-center gap-0.5 rounded-2xl bg-white p-[5px] shadow-[0_2px_4px_rgba(23,25,30,0.06),0_16px_40px_-14px_rgba(23,25,30,0.35)]" role="toolbar" aria-label="Sheet tools">
                {canMark && <>
                  {TOOLS.map(([t, key, name, hint, Icon]) => (
                    <button key={t} type="button" onClick={() => { setTool(t); setDraft(null); }} aria-pressed={tool === t} aria-label={name} title={`${name} (${key}) · ${hint}`}
                      className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-[11px] px-2.5 text-[12.5px] font-bold transition ${tool === t ? 'text-white' : 'text-[#4F535C] hover:bg-[#F1F1EC] hover:text-[#17191E]'}`}
                      style={tool === t ? { background: t === 'select' ? '#17191E' : MARK } : undefined}>
                      <Icon size={17} />{tool === t && <span>{name}</span>}
                    </button>
                  ))}
                  {sep}
                </>}
                {prev && isCurrent && (
                  <button type="button" onClick={() => { setCompare((c) => !c); setDraft(null); }} aria-pressed={compare} className={dockBtn(compare)} title="Slide between this version and the last (C)">
                    <Columns2 size={17} />{compare ? 'Comparing' : `Compare v${prev.n}`}
                  </button>
                )}
                {prev && isCurrent && !compare && (
                  <button type="button" onClick={() => setSpot(!spot)} aria-pressed={spot} title="Outline what changed since the last version"
                    className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-[11px] px-2.5 text-[12.5px] font-bold transition ${spot ? 'bg-[#FBF1E3] text-[#8F4C07]' : 'text-[#4F535C] hover:bg-[#F1F1EC] hover:text-[#17191E]'}`}>
                    <Sparkles size={17} />{spot && boxes ? `Changes · ${boxes.length}` : spot ? 'Changes' : 'Show changes'}
                  </button>
                )}
                {pages > 1 && <>
                  {sep}
                  <button type="button" onClick={() => { setPage((p) => Math.max(0, p - 1)); setDraft(null); }} disabled={page === 0} aria-label="Previous sheet in this PDF" className={dockBtn()}><ChevronLeft size={16} strokeWidth={2.4} /></button>
                  <span className="whitespace-nowrap text-[12.5px] font-bold text-[#4F535C]">Sheet {page + 1} of {pages}</span>
                  <button type="button" onClick={() => { setPage((p) => Math.min(pages - 1, p + 1)); setDraft(null); }} disabled={page >= pages - 1} aria-label="Next sheet in this PDF" className={dockBtn()}><ChevronRight size={16} strokeWidth={2.4} /></button>
                </>}
                {sep}
                <button type="button" onClick={() => { rotate(); setDraft(null); }} aria-label="Rotate the sheet" title="Rotate the sheet (R). Notes stay where they belong." className={dockBtn()}><RotateCw size={17} />{turn ? `${turn}°` : ''}</button>
                <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out" className={dockBtn()}><Minus size={17} /></button>
                <span className="min-w-[42px] text-center text-[12.5px] font-bold text-[#4F535C]">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))} aria-label="Zoom in" className={dockBtn()}><Plus size={17} /></button>
              </div>
            </div>
          )}
        </div>

        <aside className="flex min-h-[620px] min-w-0 max-w-full flex-[1_1_340px] flex-col overflow-hidden rounded-[18px] border border-[#E4E4DE] bg-white lg:max-h-[860px]">
          <div className="border-b border-[#EEEEEA] px-4 pt-3.5">
            <div className="flex items-center gap-2.5">
              <Initials name={r?.designer?.name || viewing?.by?.name || d.name} size={30} color="#4146C8" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold">{self ? (reviewer ? 'Your own sheet' : 'You') : r?.designer?.name || 'No PDF yet'}</div>
                <div className="truncate text-[12.5px] text-[#5F636D]">
                  {viewing ? <>v{viewing.n} · {state === 'IN_REVIEW' ? `sent ${ago(r?.submittedAt)}` : state === 'APPROVED' ? `${r?.selfApproved ? 'self-approved' : 'approved'} ${shortDate(r?.decidedAt)}` : state === 'CHANGES_REQUESTED' ? `returned ${ago(r?.decidedAt)}` : `uploaded ${ago(viewing.at)}`}{viewing.note ? ` · “${viewing.note}”` : ''}</> : 'Drop the first PDF to start'}
                </div>
              </div>
            </div>
            {state === 'CHANGES_REQUESTED' && isCurrent && onSheet.length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 flex justify-between text-[12.5px] font-bold"><span>{fixedN} of {onSheet.length} fixed</span><span className="text-[#5F636D]">{Math.round((fixedN / onSheet.length) * 100)}%</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#EEEEEA]"><i className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${(fixedN / onSheet.length) * 100}%`, background: FIXED }} /></div>
              </div>
            )}
            <div className="mt-2.5 flex gap-1" role="tablist" aria-label="Panel">
              {(['notes', 'history'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={railTab === t} onClick={() => setRailTab(t)}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 px-3 text-[14px] font-bold ${railTab === t ? 'text-[#17191E] shadow-[inset_0_-2px_0_#17191E]' : 'text-[#6B6F78] hover:text-[#17191E]'}`}>
                  {t === 'notes' ? <><MessageSquare size={15} />Notes{onSheet.length ? ` · ${onSheet.length}` : ''}</> : <><History size={15} />History</>}
                </button>
              ))}
            </div>
          </div>

          {railTab === 'history' ? (
            <div className="flex-1 overflow-auto px-[18px] py-4">
              <div className="flex flex-col gap-3 border-l-2 border-[#E4E4DE] pl-4">
                {[...events].reverse().map((e, i) => (
                  <div key={i} className="dd-rise relative text-[13px] text-[#17191E]" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                    <span className="absolute -left-[23px] top-[5px] h-2.5 w-2.5 rounded-full border-2 bg-white" style={{ borderColor: e.type === 'returned' ? '#C77A1A' : e.type === 'approved' ? '#1F7A57' : '#4146C8' }} />
                    <b>{e.by?.email === me.email ? 'You' : firstName(e.by?.name)}</b> {EVENT_WORD[e.type] || e.type}{e.versionNo ? ` v${e.versionNo}` : ''}
                    {e.text && <div className="text-[12.5px] text-[#5F636D]">“{e.text}”</div>}
                    <div className="text-[11.5px] text-[#8A8E97]">{ago(e.at)}</div>
                  </div>
                ))}
                {!events.length && <p className="text-sm text-[#5F636D]">Nothing yet.</p>}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-2 overflow-auto p-3.5">
              {self && reviewer && state === 'IN_REVIEW' && <Callout tone="indigo"><b>Your own sheet.</b> As Design Head you can approve it. The history will say it was self-approved.</Callout>}
              {state === 'CHANGES_REQUESTED' && isCurrent && lastReturn && (
                <Callout tone="amber"><b>From {lastReturn.decidedBy?.email === me.email ? 'you' : firstName(lastReturn.decidedBy?.name)}:</b> {lastReturn.reason ? `“${lastReturn.reason}”` : 'Notes are on the sheet.'} {canFix ? 'Tick each note as you fix it, then drop the new PDF anywhere on this page.' : ''}</Callout>
              )}
              {canMark && !draft && (
                <button type="button" onClick={() => { const anchor = { x: 0.5, y: 0.45 }; setDraft({ shape: turnShape({ t: 'pin', ...anchor }, turn, 'page'), anchor, text: '', blocking: false }); setSelected(null); }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 self-start rounded-[10px] px-3 text-[13px] font-bold text-[#4F535C] hover:bg-[#EBEBE5] hover:text-[#17191E]">
                  <Plus size={15} strokeWidth={2.4} />Add a note
                </button>
              )}

              {onSheet.map((m, i) => {
                const done = m.status === 'FIXED';
                const sel = selected === m.id;
                return (
                  <div key={m.id} className="dd-rise flex gap-2.5 rounded-[14px] border bg-white p-3 transition" style={{ animationDelay: `${Math.min(i, 8) * 30}ms`, borderColor: sel ? MARK : '#E4E4DE', boxShadow: sel ? '0 0 0 3px rgba(217,53,75,.14)' : undefined }}>
                    <button type="button" onClick={() => { setSelected(m.id); if (m.page !== page) setPage(m.page); }} aria-label={`Show note ${m.n} on the sheet`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white transition-colors" style={{ background: done ? FIXED : m.source === 'client' ? CLIENT : MARK }}>{m.n}</button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] font-bold text-[#5F636D]">{m.source === 'client' ? <span style={{ color: CLIENT }}>Client</span> : m.by?.email === me.email ? 'You' : firstName(m.by?.name)} · {SHAPE_WORD[m.shape.t]}{pages > 1 ? ` · sheet ${m.page + 1}` : ''}</div>
                      <div className={`mt-0.5 text-[13.5px] ${done ? 'text-[#6B6F78] line-through decoration-[#3FBF94]' : 'text-[#17191E]'}`}>{m.text}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {canFix && (
                          <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-2 text-[13px] font-bold">
                            <input type="checkbox" checked={done} disabled={busy === `fix-${m.id}`} onChange={() => act(`fix-${m.id}`, () => fixMark(target, m.id, !done))} className="h-[18px] w-[18px] accent-[#2E9D71]" />
                            {done ? 'Fixed' : 'Mark fixed'}
                          </label>
                        )}
                        {canMark ? (
                          <>
                            <button type="button" onClick={() => act(`blk-${m.id}`, () => updateMark(target, m.id, { blocking: !m.blocking }))} aria-pressed={m.blocking}
                              className="inline-flex h-[30px] items-center rounded-full border px-2.5 text-[12px] font-bold" style={m.blocking ? { background: '#FCE8EA', color: '#B4232F', borderColor: '#F2B8BF' } : { color: '#6B6F78', borderColor: '#DCDCD5' }}>Must fix</button>
                            <button type="button" onClick={() => act(`del-${m.id}`, () => deleteMark(target, m.id))} className="inline-flex h-[30px] items-center gap-1 rounded-[10px] px-2.5 text-[12px] font-bold text-[#4F535C] hover:bg-[#EBEBE5]"><Trash2 size={13} />Remove</button>
                          </>
                        ) : m.blocking && !done && <Chip tone="red" small>Must fix</Chip>}
                        {done && !canFix && <Chip tone="green" small>{m.fixedInVersionNo ? `Fixed in v${m.fixedInVersionNo}` : 'Fixed'}</Chip>}
                      </div>
                    </div>
                  </div>
                );
              })}

              {reviewer && fixedFromPrev.length > 0 && prev && (
                <div className="mt-1 flex flex-col gap-1.5">
                  <div className="flex justify-between text-[11px] font-extrabold uppercase tracking-[.09em] text-[#5F636D]">
                    <span>Fixed from v{prev.n}</span><span>{fixedFromPrev.filter((m) => checked[m.id]).length} of {fixedFromPrev.length} checked</span>
                  </div>
                  {fixedFromPrev.map((m) => {
                    const c = checked[m.id];
                    return (
                      <div key={m.id} className="flex gap-2.5 rounded-[14px] border bg-white p-3" style={{ borderColor: c === 'ok' ? '#BFE3D0' : '#E4E4DE' }}>
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white" style={{ background: FIXED }}>{m.n}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-[#5F636D] line-through decoration-[#3FBF94]">{m.text}</div>
                          {c ? (
                            <div className="mt-1.5 flex items-center gap-2">
                              <Chip tone={c === 'ok' ? 'green' : 'red'} icon={c === 'ok' ? Check : Undo2} small>{c === 'ok' ? 'Checked by you' : 'Sent back as a must-fix note'}</Chip>
                              {c === 'ok' && <button type="button" onClick={() => setChecked(m.id, null)} className="text-[12px] font-bold text-[#6B6F78] hover:text-[#17191E]">Undo</button>}
                            </div>
                          ) : canMark && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <button type="button" onClick={() => setChecked(m.id, 'ok')} className="inline-flex h-[30px] items-center gap-1 rounded-[10px] border border-[#DCDCD5] bg-white px-2.5 text-[12px] font-bold text-[#1B6E4F] hover:border-[#A9AAA2]"><Check size={13} strokeWidth={2.8} />Looks fixed</button>
                              <button type="button" onClick={() => stillOpen(m)} disabled={busy === `reopen-${m.id}`} className="inline-flex h-[30px] items-center gap-1 rounded-[10px] px-2.5 text-[12px] font-bold text-[#B4232F] hover:bg-[#FCE8EA] disabled:opacity-50"><Undo2 size={13} />Still open</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-[12px] text-[#5F636D]">
                    {fixedFromPrev.every((m) => checked[m.id]) ? 'Every fix is checked. Approve when the rest looks right.' : '“Fixed” is the designer’s word. Check each one, or send it back as still open.'}
                  </div>
                </div>
              )}

              {!onSheet.length && !draft && !(reviewer && fixedFromPrev.length) && (
                <div className="rounded-[14px] border-[1.5px] border-dashed border-[#DCDCD5] px-3 py-[18px] text-center text-[13px] text-[#5F636D]">
                  {canMark ? 'Pick a tool below and mark the sheet, or press P, B, A or D. Each mark becomes a numbered note.'
                    : !isCurrent ? 'Notes on older versions stay with them.'
                    : !viewing ? 'Notes from the Design Head appear here, pinned to the exact spot on the sheet.'
                    : state === 'DRAFT' ? 'Ready when you are. Send it and the Design Head gets it in her queue.'
                    : 'No notes on this version.'}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2.5 border-t border-[#EEEEEA] px-4 pb-4 pt-3.5">
            {canDecide && !requestOpen && (
              <>
                <div className="text-[12.5px]" style={{ color: blockingOpen ? '#B4232F' : '#5F636D' }}>
                  {blockingOpen ? `${blockingOpen} must-fix note${blockingOpen === 1 ? '' : 's'} open. Send it back, or untick Must fix to approve.` : `Approving signs off v${r?.versionNo} exactly as it is${audience === 'studio' ? '. This sheet stays inside the studio.' : '.'}`}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!!busy} onClick={() => { setRequestOpen(true); setDraft(null); }}
                    className="inline-flex min-h-[44px] flex-[1_1_140px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#DCDCD5] bg-white px-4 text-[14px] font-bold hover:border-[#A9AAA2] disabled:opacity-45">
                    <Undo2 size={16} />Request changes
                  </button>
                  <button type="button" disabled={!!busy || blockingOpen > 0 || !!draft} onClick={() => decide('approve')}
                    className="inline-flex min-h-[44px] flex-[1_1_140px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#1F7A57] px-4 text-[14px] font-bold text-white hover:bg-[#196649] disabled:opacity-45">
                    {busy === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />}{self ? 'Approve your own sheet' : `Approve v${r?.versionNo}`}
                  </button>
                </div>
              </>
            )}
            {canDecide && requestOpen && (
              <div className="dd-rise flex flex-col gap-2">
                <label htmlFor="dd-ret" className="text-[13px] font-bold">A line for {self ? 'yourself' : firstName(r?.designer?.name)} <span className="font-medium text-[#8A8E97]">{onSheet.length ? '(optional)' : '(needed without notes)'}</span></label>
                <textarea id="dd-ret" autoFocus value={retMsg} onChange={(e) => setRetMsg(e.target.value)} rows={2} placeholder="The one-line summary of what to change"
                  className="w-full rounded-[10px] border border-[#DCDCD5] px-3 py-2.5 text-[13.5px] outline-none focus:border-[#4146C8] focus:shadow-[0_0_0_3px_rgba(65,70,200,0.15)]" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRequestOpen(false)} className="min-h-[44px] rounded-xl px-4 text-[14px] font-bold text-[#4F535C] hover:bg-[#EBEBE5]">Cancel</button>
                  <button type="button" disabled={!!busy} onClick={() => decide('return')} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#4146C8] px-4 text-[14px] font-bold text-white hover:bg-[#3439AD] disabled:opacity-45">
                    {busy === 'return' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{self ? 'Return to your desk' : `Send back to ${firstName(r?.designer?.name)}`}
                  </button>
                </div>
              </div>
            )}

            {reviewer && fromClient && !clientStep && (
              <>
                <div className="text-[12.5px] text-[#5F636D]">The client's notes stay with this sheet until you decide. Nothing changes for the designer yet.</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!!busy || !!draft} onClick={() => { setClientStep('keep'); setDraft(null); }}
                    className="inline-flex min-h-[44px] flex-[1_1_140px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#DCDCD5] bg-white px-4 text-[14px] font-bold hover:border-[#A9AAA2] disabled:opacity-45">
                    <Check size={16} strokeWidth={2.6} />Keep it approved
                  </button>
                  <button type="button" disabled={!!busy || !!draft || !onSheet.some((m) => m.status === 'OPEN')} onClick={() => { setClientStep('send'); setDraft(null); }}
                    title={onSheet.some((m) => m.status === 'OPEN') ? undefined : 'Add a note first'}
                    className="inline-flex min-h-[44px] flex-[1_1_140px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#4146C8] px-4 text-[14px] font-bold text-white hover:bg-[#3439AD] disabled:opacity-45">
                    <Send size={16} />Send to {self ? 'yourself' : firstName(r?.designer?.name)}
                  </button>
                </div>
              </>
            )}
            {reviewer && fromClient && clientStep && (
              <div className="dd-rise flex flex-col gap-2">
                {clientStep === 'keep' && <div className="text-[12.5px] font-bold text-[#6E3B05]">v{r?.versionNo} stays approved as it is. The client's notes are cleared from the sheet; the history keeps what they asked.</div>}
                <label htmlFor="dd-client" className="text-[13px] font-bold">{clientStep === 'send' ? `A line for ${self ? 'yourself' : firstName(r?.designer?.name)}` : 'Why it stays as it is'} <span className="font-medium text-[#8A8E97]">(optional)</span></label>
                <textarea id="dd-client" autoFocus value={retMsg} onChange={(e) => setRetMsg(e.target.value)} rows={2}
                  placeholder={clientStep === 'send' ? 'Changes the client asked for at the design meeting.' : 'For example: agreed with the client to keep the current finish'}
                  className="w-full rounded-[10px] border border-[#DCDCD5] px-3 py-2.5 text-[13.5px] outline-none focus:border-[#4146C8] focus:shadow-[0_0_0_3px_rgba(65,70,200,0.15)]" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setClientStep(null)} className="min-h-[44px] rounded-xl px-4 text-[14px] font-bold text-[#4F535C] hover:bg-[#EBEBE5]">Cancel</button>
                  <button type="button" disabled={!!busy} onClick={() => decideClient(clientStep)}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-bold text-white disabled:opacity-45"
                    style={{ background: clientStep === 'send' ? '#4146C8' : '#1F7A57' }}>
                    {busy === clientStep ? <Loader2 size={16} className="animate-spin" /> : clientStep === 'send' ? <Send size={16} /> : <Check size={16} strokeWidth={2.6} />}
                    {clientStep === 'send' ? `Send to ${self ? 'yourself' : firstName(r?.designer?.name)}` : `Keep v${r?.versionNo} approved`}
                  </button>
                </div>
              </div>
            )}

            {canUploadNew && viewing && (
              upload ? <UploadProgress upload={upload} /> : (
                <div className="rounded-[14px] border-2 border-dashed border-[#CFCFC7] p-3 text-center text-[12.5px] text-[#5F636D]">
                  <b className="text-[#17191E]">Drop v{(r?.versionNo || 0) + 1} anywhere on this page</b>
                  <div>It lands on this drawing only.{state === 'APPROVED' ? ' A new version goes back for review.' : ''}</div>
                  <button type="button" onClick={() => fileInput.current?.click()} className="mt-2 inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] bg-[#4146C8] px-3.5 text-[13px] font-bold text-white hover:bg-[#3439AD]">
                    <Upload size={14} />{canFix ? `Choose v${(r?.versionNo || 0) + 1}` : 'Choose a PDF'}
                  </button>
                </div>
              )
            )}
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) revise(f); }} />

            {canSend && (
              <>
                <div className="text-[12.5px] text-[#5F636D]">v{r?.versionNo} is ready. After sending you go back to the Design Desk.</div>
                {confirmRemove ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-bold text-[#B4232F]">Remove v{r?.versionNo}?{(r?.versionNo || 0) > 1 ? ` The sheet goes back to v${(r?.versionNo || 0) - 1}.` : ''}</span>
                    <button type="button" disabled={!!busy} onClick={() => setConfirmRemove(false)} className="min-h-[40px] rounded-xl px-3 text-[13px] font-bold text-[#4F535C] hover:bg-[#EBEBE5]">Keep it</button>
                    <button type="button" disabled={!!busy}
                      onClick={async () => { const res = await act('remove', () => removeVersion(target, r!.rev, current!.id), { title: `v${r?.versionNo} removed`, sub: (r?.versionNo || 0) > 1 ? `Back to v${(r?.versionNo || 0) - 1}.` : 'Drop the right PDF when you have it.' }); setConfirmRemove(false); if (res) { setViewId(null); setCompare(false); } }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#B4232F] px-3.5 text-[13px] font-bold text-white disabled:opacity-45">
                      {busy === 'remove' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}Yes, remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {canRemove && (
                      <button type="button" disabled={!!busy} onClick={() => setConfirmRemove(true)} title="Remove this PDF if it is the wrong file"
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold text-[#4F535C] hover:bg-[#FCE8EA] hover:text-[#B4232F] disabled:opacity-45">
                        <Trash2 size={15} />Wrong file? Remove
                      </button>
                    )}
                    <button type="button" disabled={!!busy} onClick={send} className="inline-flex min-h-[44px] flex-[1_1_160px] items-center justify-center gap-2 rounded-xl bg-[#4146C8] px-4 text-[14px] font-bold text-white hover:bg-[#3439AD] disabled:opacity-45">
                      {busy === 'send' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Send v{r?.versionNo} for review
                    </button>
                  </div>
                )}
              </>
            )}

            {canPullBack && (
              <>
                <div className="text-[12.5px] text-[#5F636D]">With the Design Head since {ago(r?.submittedAt)}. Pull it back to change the PDF.</div>
                <button type="button" disabled={!!busy} onClick={() => act('pull', () => withdrawSheet(target, r!.rev), { title: 'Pulled back', sub: 'It is on your desk again. Drop the new PDF and send it.' })}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#DCDCD5] bg-white px-4 text-[14px] font-bold hover:border-[#A9AAA2] disabled:opacity-45">
                  {busy === 'pull' ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}Pull it back
                </button>
              </>
            )}
            {!canDecide && !canSend && !canPullBack && !(canUploadNew && viewing) && state === 'IN_REVIEW' && (
              <div className="flex items-center gap-2 text-[12.5px] text-[#5F636D]"><ListChecks size={15} />With the Design Head since {ago(r?.submittedAt)}.</div>
            )}
          </div>
        </aside>
      </div>

      {fileOver && (
        <div className="pointer-events-none fixed inset-0 z-[110] grid place-items-center p-6" style={{ background: 'rgba(23,25,30,.55)', backdropFilter: 'blur(3px)' }}>
          <div className="dd-breathe max-w-[540px] rounded-[28px] border-[2.5px] border-dashed border-white px-10 py-14 text-center text-white">
            <h2 className="font-display text-[28px] font-semibold">{canUploadNew ? `Drop to add v${(r?.versionNo || 0) + 1}` : 'This sheet is with the Design Head'}</h2>
            <p className="mt-1.5 opacity-90">{canUploadNew ? `It lands on ${d.name} only.` : 'Pull it back first, then drop the new PDF.'}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SheetStudio;

function UploadProgress({ upload }: { upload: { stage: string; fraction?: number } }) {
  return (
    <div className="mx-auto w-full max-w-[280px] text-left">
      <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold"><Loader2 size={14} className="animate-spin" />{upload.stage}</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#EEEEEA]"><i className="block h-full rounded-full bg-[#4146C8] transition-all" style={{ width: `${upload.fraction !== undefined ? Math.max(6, Math.round(upload.fraction * 100)) : 92}%` }} /></div>
    </div>
  );
}

function Callout({ tone, children }: { tone: 'indigo' | 'amber'; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-[14px] px-3.5 py-3 text-[13px] leading-relaxed" style={{ background: tone === 'indigo' ? '#ECEDFB' : '#FBF1E3', color: tone === 'indigo' ? '#23266F' : '#4A2A06' }}>
      {tone === 'amber' ? <MessageSquare size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}
