import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check, ChevronLeft, ChevronRight, Columns2, FileUp, History, Loader2, MapPin, Maximize2, MessageSquare, Minimize2, Minus, MousePointer2,
  MoveUpRight, PanelRightClose, PanelRightOpen, PenLine, Plus, RotateCcw, RotateCw, Send, Sparkles, Square, Trash2, Undo2,
} from 'lucide-react';
import {
  watchDrawing, watchVersions, watchMarks, watchRounds, watchEvents, submitSheet, withdrawSheet, approveSheet, returnSheet, clientReturn, clientKeep,
  createMark, deleteMark, updateMark, fixMark, setAudience, removeVersion, fileBlob, type ReviewDrawing, type ReviewError,
} from '../../services/drawingReviewService';
import { loadPdf } from '../../lib/pdfRender';
import { canReview, canUpload, canSetAudience, allowed, clientPending, stateOf, guessAudience, turnShape, type Turn, type MarkShape, type ReviewMark, type ReviewVersion, type ReviewRound, type ReviewEvent } from '../../lib/drawingReview';
import { roundWarn, INCLUDED_ROUNDS, needsMe, type Viewer } from '../../lib/designDesk';
import { stepsOf, whereLine } from '../../lib/designDesk2';
import type { RoleSet } from '../../lib/roles';
import PdfStage, { type Tool } from '../drawingReview/PdfStage';
import { useSheetChanges } from '../drawingReview/useSheetChanges';
import { MARK, FIXED, CLIENT, roomLabel, ago, shortDate, firstName, useToast, Initials } from '../drawingReview/ui';
import type { Me } from '../drawingReview/SheetStudio';
import { Btn, Tag, cx } from './parts';

/*
  ONE DRAWING, on the new desk (Design Desk 2.0, Phase 1).

  The drawing's pages one under the other on the left, with scroll, zoom
  (buttons, Ctrl + scroll, pinch), drag to move, rotate and full screen. A
  drawing stored upright opens turned to landscape. The notes panel can be
  put away so the drawing has the whole width. The
  tools sit in one bar under it: Select, Pin, Box, Arrow, Draw, Compare and
  Changes. On the right: whose turn it is in a sentence, the notes and the
  history, and the decision at the foot.

  Every rule is today's. This screen watches the same records as
  components/drawingReview/SheetStudio and calls the same functions; the
  server decides what is allowed. Uploading opens the three-step upload.
*/

interface Props {
  orgId: string;
  projectId: string;
  drawingId: string;
  projectName: string;
  role: RoleSet;
  me: Me;
  viewer: Viewer;
  /** Drawings waiting for the Design Head, so a decision can open the next one. */
  queue: { projectId: string; drawingId: string }[];
  onClose: () => void;
  backLabel: string;
  onOpen: (next: { projectId: string; drawingId: string }) => void;
  /** Open the three-step upload on this drawing. */
  onUpload: (d: ReviewDrawing) => void;
}

const TOOLS: [Tool, string, string, string, React.ComponentType<any>][] = [
  ['select', 'V', 'Select', 'Click a note to see it. Drag the drawing to move around it.', MousePointer2],
  ['pin', 'P', 'Pin', 'Click the drawing to drop a numbered note.', MapPin],
  ['rect', 'B', 'Box', 'Drag across an area to box it.', Square],
  ['arrow', 'A', 'Arrow', 'Drag from the note to what it points at.', MoveUpRight],
  ['pen', 'D', 'Draw', 'Sketch freehand on the drawing.', PenLine],
];
const SHAPE_WORD: Record<string, string> = { pin: 'Pin', rect: 'Box', arrow: 'Arrow', pen: 'Sketch' };
const EVENT_WORD: Record<string, string> = { uploaded: 'uploaded', submitted: 'sent it to the Design Head', withdrawn: 'pulled it back', returned: 'asked for changes', approved: 'approved', audience: 'changed who it is for', removed: 'removed the PDF', client: 'showed it to the client', clientKept: 'kept it approved after the meeting' };
const QUICK = ['Check this dimension', 'Line this up with the ceiling plan', 'Match the material schedule', 'Show the hinge side', 'Add a section through here'];

const read = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage off */ } };
const clampZoom = (z: number) => Math.min(5, Math.max(0.4, Math.round(z * 20) / 20));
/* A drawing stored upright opens turned this way (anticlockwise), which is how the studio's CAD exports read; R turns it on. */
const LANDSCAPE_TURN: Turn = 270;

type Draft = { page: number; shape: MarkShape; anchor: { x: number; y: number }; text: string; blocking: boolean };
type Diff = { busy: boolean; kind?: string; count: number };

/* ------------------------------------------------------------ one page of the PDF */

interface PageProps {
  index: number; pages: number; pdfPath: string; prevPath: string | null; compare: boolean; compareLabel?: [string, string]; spotting: boolean;
  zoom: number; turn: Turn; marks: ReviewMark[]; draft: MarkShape | null; selected: string | null; tool: Tool; canMark: boolean;
  onPageCount: (n: number) => void; onSelect: (id: string) => void; onShape: (page: number, shape: MarkShape, anchor: { x: number; y: number }) => void;
  onDiff: (page: number, d: Diff | null) => void; overlay: React.ReactNode;
}

/** A page is drawn when it comes near the screen, so a long set opens as fast as a single sheet. */
const PageBlock: React.FC<PageProps> = ({ index, pages, pdfPath, prevPath, compare, compareLabel, spotting, zoom, turn, marks, draft, selected, tool, canMark, onPageCount, onSelect, onShape, onDiff, overlay }) => {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(index === 0 || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near || !box.current) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setNear(true); }, { rootMargin: '900px 0px' });
    io.observe(box.current);
    return () => io.disconnect();
  }, [near]);
  const changes = useSheetChanges(near ? pdfPath : undefined, prevPath || undefined, index, spotting && near);
  const boxes = spotting && changes.diff?.kind === 'boxes' ? changes.diff.boxes : null;
  useEffect(() => {
    onDiff(index, spotting && near ? { busy: !!changes.busy, kind: changes.diff?.kind, count: boxes?.length || 0 } : null);
  }, [spotting, near, changes.busy, changes.diff?.kind, boxes?.length]);
  return (
    <div ref={box} data-page={index} className="mb-6 last:mb-0">
      {pages > 1 && <div className="mb-1.5 text-xs font-bold text-slate-500">Page {index + 1} of {pages}</div>}
      {near ? (
        <PdfStage pdfPath={pdfPath} comparePath={compare ? prevPath : null} compareLabel={compareLabel} page={index} zoom={zoom} turn={turn}
          marks={marks} draft={draft} selectedId={selected} tool={tool} canMark={canMark} onPageCount={index === 0 ? onPageCount : undefined}
          changes={boxes} maxWidth={5000} onSelect={onSelect} onShape={(shape, anchor) => onShape(index, shape, anchor)} overlay={overlay} />
      ) : <div className="mx-auto aspect-[1.414/1] w-full max-w-full rounded bg-white/70" aria-hidden />}
    </div>
  );
};

/* ------------------------------------------------------------ the screen */

export default function DrawingScreen({ orgId, projectId, drawingId, projectName, role, me, viewer, queue, onClose, backLabel, onOpen, onUpload }: Props) {
  const toast = useToast();
  const target = { orgId, projectId, drawingId };
  const [d, setD] = useState<ReviewDrawing | null | undefined>(undefined);
  const [versions, setVersions] = useState<ReviewVersion[]>([]);
  const [marks, setMarks] = useState<ReviewMark[]>([]);
  const [rounds, setRounds] = useState<ReviewRound[]>([]);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  /* How this person has the drawing turned; remembered per drawing on this device, shared with today's desk. */
  const turnKey = `ffds_dr_turn_${projectId}_${drawingId}`;
  const [turn, setTurnRaw] = useState<Turn>(() => { const v = Number(read(turnKey, 0)); return ([0, 90, 180, 270].includes(v) ? v : 0) as Turn; });
  /* Whether this person has turned this drawing themselves; until they do, an upright drawing is turned to landscape for them. */
  const turnChosen = useRef<boolean>(read<number | null>(turnKey, null) !== null);
  const [oriented, setOriented] = useState<boolean>(turnChosen.current);
  const rotate = () => setTurnRaw((t) => { const n = (((t + 90) % 360) as Turn); write(turnKey, n); turnChosen.current = true; return n; });
  const [compare, setCompare] = useState(false);
  const spotKey = `ffds_dr_spot_${me.uid}`;
  const [spot, setSpotRaw] = useState<boolean>(() => read(spotKey, true));
  const setSpot = (v: boolean) => { setSpotRaw(v); write(spotKey, v); };
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [retMsg, setRetMsg] = useState('');
  const [clientStep, setClientStep] = useState<'send' | 'keep' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'notes' | 'history'>('notes');
  const [confirmRemove, setConfirmRemove] = useState(false);
  /* The notes panel can be put away, on this device, so the drawing has the whole width. */
  const panelKey = `ffds_dd2_panel_${me.uid}`;
  const [panel, setPanelRaw] = useState<boolean>(() => read(panelKey, true));
  const setPanel = (v: boolean) => { setPanelRaw(v); write(panelKey, v); };
  /* A short tip when the drawing opens; it goes away by itself. */
  const [tip, setTip] = useState(true);
  useEffect(() => { const t = setTimeout(() => setTip(false), 7000); return () => clearTimeout(t); }, []);
  const [diffs, setDiffs] = useState<Record<number, Diff>>({});
  const checkedKey = `ffds_dr_checked_${me.uid}`;
  const [checked, setCheckedRaw] = useState<Record<string, 'ok' | 'open'>>(() => read(checkedKey, {}));
  const setChecked = (id: string, v: 'ok' | 'open' | null) => setCheckedRaw((c) => { const n = { ...c }; if (v) n[id] = v; else delete n[id]; write(checkedKey, n); return n; });
  const draftBox = useRef<HTMLTextAreaElement>(null);
  /* The drawing and its panel fill what is left of the window, so the decision stays in view without scrolling the page. */
  const stage = useRef<HTMLDivElement>(null);
  const [stageH, setStageH] = useState<number | null>(null);

  useEffect(() => {
    setD(undefined); setViewId(null); setCompare(false); setSelected(null); setDraft(null); setRetMsg(''); setRequestOpen(false); setDiffs({});
    const off = [
      watchDrawing(orgId, projectId, drawingId, setD),
      watchVersions(orgId, projectId, drawingId, setVersions),
      watchMarks(orgId, projectId, drawingId, setMarks),
      watchRounds(orgId, projectId, drawingId, setRounds),
      watchEvents(orgId, projectId, drawingId, setEvents),
    ];
    return () => off.forEach((f) => f());
  }, [orgId, projectId, drawingId]);

  /* ------------------------------------------------------------ what this person may do (as SheetStudio) */
  const r = d?.review;
  const state = stateOf(r);
  const current = versions.find((v) => v.id === r?.versionId) || versions[versions.length - 1] || null;
  const viewing = versions.find((v) => v.id === viewId) || current;
  const isCurrent = !!viewing && viewing.id === current?.id;
  const prev = viewing ? versions.find((v) => v.n === viewing.n - 1) || null : null;
  const onSheet = marks.filter((m) => m.versionId === viewing?.id);
  const fixedFromPrev = isCurrent && prev ? marks.filter((m) => m.versionId === prev.id && m.status === 'FIXED') : [];
  const reviewer = canReview(role);
  const fromClient = clientPending(r) && isCurrent;
  const canMark = reviewer && (state === 'IN_REVIEW' || fromClient) && isCurrent && !compare;
  const canDecide = reviewer && state === 'IN_REVIEW' && isCurrent;
  const canFix = canUpload(role) && state === 'CHANGES_REQUESTED' && isCurrent;
  const canUploadNew = canUpload(role) && allowed('finalize', r);
  const canSend = canUpload(role) && state === 'DRAFT' && !!r?.versionId;
  const canPullBack = canUpload(role) && state === 'IN_REVIEW' && (!reviewer || r?.designer?.email === me.email);
  const blockingOpen = onSheet.filter((m) => m.blocking && m.status === 'OPEN').length;
  const canRemove = canUpload(role) && state === 'DRAFT' && isCurrent && !!current && onSheet.length === 0
    && !rounds.some((x) => x.versionId === current.id && (x.status === 'APPROVED' || x.status === 'CHANGES_REQUESTED'))
    && (current.by?.uid === me.uid || canSetAudience(role));
  const lastReturn = [...rounds].reverse().find((x) => x.status === 'CHANGES_REQUESTED');
  const qIndex = queue.findIndex((q) => q.drawingId === drawingId && q.projectId === projectId);
  const self = r?.designer?.email === me.email;
  const audience = r?.audience || (d ? guessAudience(d.name) : 'client');
  const fixedN = onSheet.filter((m) => m.status === 'FIXED').length;
  const round = roundWarn(r);
  const spotting = spot && isCurrent && !!prev && !compare;
  const who = self ? 'yourself' : firstName(r?.designer?.name);

  useEffect(() => {
    const fit = () => { const el = stage.current; if (el) setStageH(Math.max(420, Math.round(window.innerHeight - el.getBoundingClientRect().top - window.scrollY - 12))); };
    fit();
    const again = setTimeout(fit, 400);
    window.addEventListener('resize', fit);
    return () => { clearTimeout(again); window.removeEventListener('resize', fit); };
  }, [d === undefined, d === null]);
  /*
    DRAWINGS READ LANDSCAPE. A PDF stored upright (uploaded before uploads were
    turned, or kept upright on purpose) opens turned to landscape, unless this
    person has already turned this drawing themselves. The pages wait a moment
    for this, so the drawing does not appear upright and then jump.
  */
  const viewPath = viewing?.pdfPath || null;
  useEffect(() => {
    if (turnChosen.current) { setOriented(true); return; }
    if (!viewPath) return;
    let live = true;
    setOriented(false);
    const giveUp = setTimeout(() => { if (live) setOriented(true); }, 2500);
    loadPdf(viewPath, async () => (await fileBlob(viewPath)).arrayBuffer())
      .then((doc) => doc.getPage(1))
      .then((page) => {
        if (!live || turnChosen.current) return;
        const v = page.getViewport({ scale: 1 });
        if (v.height > v.width * 1.01) setTurnRaw(LANDSCAPE_TURN);
      })
      .catch(() => undefined)
      .finally(() => { clearTimeout(giveUp); if (live) setOriented(true); });
    return () => { live = false; clearTimeout(giveUp); };
  }, [viewPath]);
  useEffect(() => { if (!prev) setCompare(false); }, [prev?.id]);
  useEffect(() => { if (draft) setTimeout(() => draftBox.current?.focus(), 30); }, [!!draft]);
  const onDiff = useCallback((page: number, x: Diff | null) => setDiffs((m) => {
    if (!x) { if (!(page in m)) return m; const n = { ...m }; delete n[page]; return n; }
    const o = m[page];
    return o && o.busy === x.busy && o.kind === x.kind && o.count === x.count ? m : { ...m, [page]: x };
  }), []);
  const diffList = Object.values(diffs) as Diff[];
  const changeCount = diffList.reduce((n, x) => n + x.count, 0);
  const diffBusy = diffList.some((x) => x.busy);

  /* ------------------------------------------------------------ moving around: drag, Ctrl + scroll, pinch, full screen */
  const [full, setFull] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const viewerBox = useRef<HTMLDivElement | null>(null);
  const pagesBox = useRef<HTMLDivElement | null>(null);
  /* The zoom as it is being changed (a trackpad pinch moves it by tiny amounts); the page is redrawn at steps of 5%. */
  const zoomExact = useRef(1);
  /* The spot of the drawing to keep still while it is redrawn at the new size: the pointer's, or the middle of the view. */
  const anchor = useRef<{ fx: number; fy: number; px: number; py: number; at: number } | null>(null);
  const zoomTo = useCallback((next: number | ((z: number) => number), at?: { x: number; y: number }) => {
    const el = scroller.current;
    const target = Math.min(5, Math.max(0.4, typeof next === 'function' ? next(zoomExact.current) : next));
    zoomExact.current = target;
    if (el && el.scrollWidth && el.scrollHeight) {
      const r = el.getBoundingClientRect();
      const px = at ? at.x - r.left : el.clientWidth / 2;
      const py = at ? at.y - r.top : el.clientHeight / 2;
      anchor.current = { fx: (el.scrollLeft + px) / el.scrollWidth, fy: (el.scrollTop + py) / el.scrollHeight, px, py, at: Date.now() };
    }
    setZoom(clampZoom(target));
  }, []);
  useEffect(() => {
    const el = scroller.current, box = pagesBox.current;
    if (!el || !box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const a = anchor.current;
      if (!a || Date.now() - a.at > 2500) return;
      el.scrollLeft = a.fx * el.scrollWidth - a.px;
      el.scrollTop = a.fy * el.scrollHeight - a.py;
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [d === undefined, full, oriented]);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [space, setSpace] = useState(false);
  const overSheet = useRef(false);
  const enterFull = useCallback(() => { setFull(true); document.documentElement.requestFullscreen?.().catch(() => undefined); }, []);
  const exitFull = useCallback(() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined); setFull(false); }, []);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => { document.removeEventListener('fullscreenchange', onFs); if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined); };
  }, []);
  useEffect(() => {
    /* On the whole viewer, tools and banners included, so the browser never zooms the page instead. */
    const el = viewerBox.current;
    if (!el) return;
    /* Ctrl + scroll, and a trackpad pinch (which browsers report the same way), zoom the drawing around the pointer. */
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const step = Math.max(-0.35, Math.min(0.35, -e.deltaY * (e.deltaMode === 1 ? 0.06 : 0.002)));
      zoomTo((z) => z * Math.exp(step), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [d === undefined, full, zoomTo]);
  useEffect(() => {
    const typing = () => { const el = document.activeElement as HTMLElement | null; return !!el && /INPUT|TEXTAREA|SELECT/.test(el.tagName); };
    const down = (e: KeyboardEvent) => { if (e.key === ' ' && overSheet.current && !typing()) { e.preventDefault(); setSpace(true); } };
    const up = (e: KeyboardEvent) => { if (e.key === ' ') setSpace(false); };
    const blur = () => setSpace(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
      if (e.key === 'Escape') { if (draft) setDraft(null); else if (tool !== 'select') setTool('select'); else if (full) exitFull(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const t = ({ v: 'select', p: 'pin', b: 'rect', a: 'arrow', d: 'pen' } as Record<string, Tool>)[k];
      if (t && canMark) setTool(t);
      if (k === 'c' && prev) setCompare((c) => !c);
      if (k === 'r') rotate();
      if (k === 'f') { if (full) exitFull(); else enterFull(); }
      if (k === 'n') setPanel(!panel);
      if (e.key === '+' || e.key === '=') zoomTo((z) => z + 0.2);
      if (e.key === '-') zoomTo((z) => z - 0.2);
      if (e.key === '0') zoomTo(1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [canMark, prev?.id, !!draft, tool, full, panel]);

  const moving = space || tool === 'select' || !canMark;
  const dist = () => { const [a, b] = [...touches.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const panStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el) return;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) { pinch.current = { dist: dist(), zoom: zoomExact.current }; pan.current = null; setGrabbing(false); return; }
    }
    if (e.button !== 1 && (e.button !== 0 || !moving)) return;
    if (e.button === 0 && (e.target as HTMLElement).closest('button, a, input, textarea, select, label')) return;
    if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return;
    pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    setGrabbing(true);
  };
  const panMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el) return;
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current && touches.current.size === 2 && pinch.current.dist > 0) { zoomTo(pinch.current.zoom * (dist() / pinch.current.dist)); return; }
    }
    const p = pan.current;
    if (!p) return;
    el.scrollLeft = p.left - (e.clientX - p.x);
    el.scrollTop = p.top - (e.clientY - p.y);
  };
  const panEnd = (e: React.PointerEvent<HTMLDivElement>) => { touches.current.delete(e.pointerId); if (touches.current.size < 2) pinch.current = null; pan.current = null; setGrabbing(false); };

  /* ------------------------------------------------------------ actions (the same calls as today's screen) */
  async function act(label: string, fn: () => Promise<any>, ok?: { title: string; sub?: string; celebrate?: boolean }) {
    setBusy(label);
    try {
      const res = await fn();
      if (ok) toast({ ...ok, ok: true });
      return res ?? true;
    } catch (e: any) {
      toast({ title: (e as ReviewError)?.code === 'aborted' ? 'This drawing changed a moment ago' : 'Not saved', sub: e?.message });
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
    if (kind === 'return' && !retMsg.trim() && !onSheet.length) { toast({ title: 'Add a note or write a line first', sub: 'A drawing sent back needs at least one thing to change.' }); return; }
    const rest = queue.filter((q) => !(q.drawingId === drawingId && q.projectId === projectId)).length;
    const res = await act(kind, () => (kind === 'approve' ? approveSheet(target, r.rev) : returnSheet(target, r.rev, retMsg.trim())),
      kind === 'approve'
        ? { celebrate: true, title: `v${r.versionNo} approved${self ? ' (self-approved)' : ''}`, sub: rest ? `${rest} more waiting. Opening the next one.` : audience === 'client' ? 'It is ready for the client meeting.' : 'Final. It stays inside the studio.' }
        : { title: `Sent back to ${self ? 'you' : firstName(r.designer?.name)}`, sub: `${onSheet.length ? `${onSheet.length} note${onSheet.length === 1 ? '' : 's'} to fix` : 'With your message'}${rest ? '. Opening the next one.' : '.'}` });
    if (res) goNext();
  }
  async function decideClient(kind: 'send' | 'keep') {
    if (!r) return;
    const open = onSheet.filter((m) => m.status === 'OPEN').length;
    const res = await act(kind, () => (kind === 'send' ? clientReturn(target, r.rev, retMsg.trim() || undefined) : clientKeep(target, r.rev, retMsg.trim() || undefined)),
      kind === 'send' ? { title: `Sent to ${self ? 'you' : firstName(r.designer?.name)}`, sub: `${open} client change${open === 1 ? '' : 's'} to make.` }
        : { title: `v${r.versionNo} stays approved`, sub: "The client's notes are cleared. The history keeps them." });
    if (res) { setClientStep(null); setRetMsg(''); goNext(); }
  }
  async function saveDraft() {
    if (!draft) return;
    const text = draft.text.trim();
    if (!text) { draftBox.current?.focus(); return; }
    const res = await act('mark', () => createMark(target, draft.page, draft.shape, text, draft.blocking));
    if (res) { setDraft(null); setSelected(res.mark?.id || null); }
  }
  async function send() {
    const res = await act('send', () => submitSheet(target, r!.rev), { title: `${d!.name} is with the Design Head`, sub: 'Nothing goes to the client from here.' });
    if (res !== null) setTimeout(onClose, 350);
  }
  async function stillOpen(m: ReviewMark) {
    const res = await act(`reopen-${m.id}`, () => createMark(target, m.page, m.shape, `Still open from v${prev!.n}: ${m.text}`, true), { title: 'Sent back as a must-fix note', sub: 'It sits where the first note was.' });
    if (res) { setChecked(m.id, 'open'); setSelected(res.mark?.id || null); }
  }
  /** Bring a note's page into view when the note is picked from the list. */
  const showMark = (m: ReviewMark) => {
    setSelected(m.id);
    scroller.current?.querySelector(`[data-page="${m.page}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  };

  const snippets = useMemo(() => QUICK.slice(0, 4), []);

  if (d === undefined) return <div className="grid min-h-[60vh] place-items-center text-slate-400"><Loader2 className="animate-spin" aria-label="Loading" /></div>;
  if (d === null) return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="text-lg font-bold text-slate-800">This drawing is not in the project any more.</p>
      <div className="mt-4"><Btn kind="primary" onClick={onClose}>Back to {backLabel}</Btn></div>
    </div>
  );

  const yours = needsMe(d, viewer);
  const steps = stepsOf(d);
  const toolNow = TOOLS.find((t) => t[0] === tool) || TOOLS[0];
  const draftNo = (r?.marksSeq || 0) + 1;
  const barBtn = (on = false) => cx('inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm font-bold transition-colors disabled:opacity-40', on ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800');
  const sep = <span className="mx-0.5 h-7 w-px shrink-0 bg-slate-200" aria-hidden />;
  const field = 'w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20';

  const composer = (page: number) => draft && draft.page === page && (
    <div className="absolute z-20 w-[340px] max-w-[calc(100vw-48px)]" onPointerDown={(e) => e.stopPropagation()}
      style={{ left: `${draft.anchor.x * 100}%`, top: `${draft.anchor.y * 100}%`, transform: `translate(${draft.anchor.x > 0.58 ? 'calc(-100% - 22px)' : '22px'}, ${draft.anchor.y > 0.5 ? 'calc(-100% + 18px)' : '-18px'})` }}>
      <div className="hud-panel-in rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl">
        <label htmlFor="dd2-draft" className="mb-1.5 flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white" style={{ background: MARK }}>{draftNo}</span>
          Note {draftNo} for {self ? 'your own drawing' : firstName(r?.designer?.name)}
        </label>
        <textarea id="dd2-draft" ref={draftBox} value={draft.text} rows={3} placeholder="What should change here?" className={field}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveDraft(); } if (e.key === 'Escape') setDraft(null); }} />
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick notes">
          {snippets.map((s) => (
            <button key={s} type="button" onClick={() => setDraft({ ...draft, text: draft.text.trim() ? `${draft.text.trim()} ${s}.` : `${s}.` })}
              className="min-h-[28px] rounded-full border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800">{s}</button>
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-sm font-bold text-rose-700">
            <input type="checkbox" checked={draft.blocking} onChange={(e) => setDraft({ ...draft, blocking: e.target.checked })} className="h-[18px] w-[18px] accent-rose-600" />Must fix
          </label>
          <span className="flex-1" />
          <Btn kind="quiet" onClick={() => setDraft(null)}>Cancel</Btn>
          <Btn kind="primary" icon={busy === 'mark' ? Loader2 : undefined} disabled={busy === 'mark'} onClick={saveDraft}>Add the note</Btn>
        </div>
      </div>
    </div>
  );

  const body = (
    <div ref={full ? undefined : stage} className={cx('flex min-w-0 flex-col gap-4 lg:flex-row lg:items-stretch', full ? 'fixed inset-0 z-[110] bg-slate-100 p-3' : 'lg:h-[var(--dd2-stage)]')}
      style={full ? undefined : ({ '--dd2-stage': `${stageH || 640}px` } as React.CSSProperties)}>
      {/* ---- the drawing */}
      <div ref={viewerBox} className={cx('relative flex min-h-[380px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-200', !full && 'h-[72vh] lg:h-auto')}>
        {(fromClient || (!isCurrent && viewing)) && (
          <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            {fromClient ? <span className="min-w-0 flex-1">{reviewer ? <>The client asked for <b>{r?.clientChanges?.count || onSheet.length} change{(r?.clientChanges?.count || onSheet.length) === 1 ? '' : 's'}</b> at the meeting. Edit or add notes, then send them to {who} or keep the drawing approved.</> : 'The client asked for changes at the meeting. The Design Head looks at them first.'}</span>
              : <><span className="min-w-0 flex-1">You are looking at <b>v{viewing!.n}</b>, an older version. Its notes stay with it.</span><Btn kind="plain" onClick={() => setViewId(null)}>Back to v{current?.n}</Btn></>}
          </div>
        )}
        {/* What Changes found, as a small line over the drawing: it takes no room from it. */}
        {spotting && (diffBusy || diffList.some((x) => x.kind && x.kind !== 'boxes')) && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-3">
            <span className="flex items-center gap-2 rounded-full bg-amber-100 px-3.5 py-1.5 text-xs font-semibold text-amber-900 shadow-sm">
              {diffBusy ? <><Loader2 size={13} className="animate-spin" aria-hidden />Finding what changed since v{prev?.n}…</>
                : diffList.every((x) => x.kind === 'same') ? `Nothing changed since v${prev?.n}.` : `Some pages changed too much to outline. Use Compare to see v${prev?.n}.`}
            </span>
          </div>
        )}
        <div ref={scroller} className="flex-1 overflow-auto p-3 pb-[92px]" style={{ cursor: grabbing ? 'grabbing' : moving ? 'grab' : undefined, touchAction: 'pan-x pan-y' }}
          onPointerDown={panStart} onPointerMove={panMove} onPointerUp={panEnd} onPointerCancel={panEnd} onPointerEnter={() => { overSheet.current = true; }} onPointerLeave={(e) => { overSheet.current = false; panEnd(e); }}>
          {viewing && !oriented ? (
            <div className="grid h-full min-h-[240px] place-items-center text-slate-400"><Loader2 className="animate-spin" aria-label="Opening the drawing" /></div>
          ) : viewing ? <div ref={pagesBox}>{Array.from({ length: pages }, (_, i) => (
            <PageBlock key={`${viewing.id}:${i}`} index={i} pages={pages} pdfPath={viewing.pdfPath} prevPath={prev?.pdfPath || null} compare={compare && !!prev}
              compareLabel={prev ? [`v${prev.n}`, `v${viewing.n}`] : undefined} spotting={spotting} zoom={zoom} turn={turn}
              marks={onSheet.filter((m) => m.page === i)} draft={draft?.page === i ? draft.shape : null} selected={selected}
              tool={space ? 'select' : tool} canMark={canMark && !draft} onPageCount={setPages}
              onSelect={(id) => { setSelected(id); setTab('notes'); }}
              onShape={(page, shape, anchor) => { setDraft({ page, shape, anchor, text: '', blocking: false }); setTab('notes'); setSelected(null); }}
              onDiff={onDiff} overlay={composer(i)} />
          ))}</div> : (
            <div className="mx-auto mt-12 max-w-md rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <p className="text-lg font-bold text-slate-800">No PDF yet</p>
              <p className="mt-1 text-sm text-slate-500">{canUploadNew ? 'Upload the PDF of this drawing. It becomes v1.' : 'Nobody has uploaded this drawing yet.'}</p>
              {canUploadNew && <div className="mt-4"><Btn kind="primary" big icon={FileUp} onClick={() => onUpload(d)}>Upload the drawing</Btn></div>}
            </div>
          )}
        </div>

        {viewing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col items-center gap-2 px-3">
            {canMark && !draft && tool !== 'select' ? <div className="rounded-full bg-slate-800/90 px-3.5 py-1.5 text-center text-sm font-semibold text-white">{toolNow[2]}: {toolNow[3]}</div>
              : tip && !draft && <div className="rounded-full bg-slate-800/90 px-3.5 py-1.5 text-center text-sm font-semibold text-white">Drag to move around. Ctrl + scroll to zoom.</div>}
            <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl" role="toolbar" aria-label="Drawing tools">
              {canMark && <>
                {TOOLS.map(([t, key, name, hint, Icon]) => (
                  <button key={t} type="button" onClick={() => { setTool(t); setDraft(null); }} aria-pressed={tool === t} aria-label={name} title={`${name} (${key}). ${hint}`}
                    className={cx('inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm font-bold transition-colors', tool === t ? (t === 'select' ? 'bg-slate-800 text-white' : 'bg-rose-600 text-white') : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800')}>
                    <Icon size={18} aria-hidden /><span className={tool === t ? '' : 'hidden 2xl:inline'}>{name}</span>
                  </button>
                ))}
                {sep}
              </>}
              {prev && isCurrent && (
                <button type="button" onClick={() => { setCompare((c) => !c); setDraft(null); }} aria-pressed={compare} className={barBtn(compare)} title={`Slide between this version and v${prev.n} (C)`}>
                  <Columns2 size={18} aria-hidden />{compare ? 'Comparing' : 'Compare'}
                </button>
              )}
              {prev && isCurrent && !compare && (
                <button type="button" onClick={() => setSpot(!spot)} aria-pressed={spot} title={`Outline what changed since v${prev.n}`}
                  className={cx('inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2.5 text-sm font-bold transition-colors', spot ? 'bg-amber-100 text-amber-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800')}>
                  <Sparkles size={18} aria-hidden />{spot && changeCount ? `Changes · ${changeCount}` : 'Changes'}
                </button>
              )}
              {prev && isCurrent && sep}
              <button type="button" onClick={() => { rotate(); setDraft(null); }} aria-label="Rotate the drawing" title="Rotate (R). Notes stay where they belong." className={barBtn()}><RotateCw size={18} aria-hidden />{turn ? `${turn}°` : ''}</button>
              <button type="button" onClick={() => zoomTo((z) => z - 0.2)} aria-label="Zoom out" title="Zoom out (-, or Ctrl + scroll)" className={barBtn()}><Minus size={18} aria-hidden /></button>
              <button type="button" onClick={() => zoomTo(1)} title="Fit the width (0)" aria-label={`Zoom ${Math.round(zoom * 100)} percent. Press to fit the width.`} className={cx(barBtn(), 'min-w-[56px] tabular-nums')}>{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => zoomTo((z) => z + 0.2)} aria-label="Zoom in" title="Zoom in (+, or Ctrl + scroll)" className={barBtn()}><Plus size={18} aria-hidden /></button>
              {sep}
              <button type="button" onClick={() => (full ? exitFull() : enterFull())} aria-pressed={full} title={full ? 'Leave full screen (Esc)' : 'Full screen, with the notes beside the drawing (F)'} className={barBtn(full)}>
                {full ? <Minimize2 size={18} aria-hidden /> : <Maximize2 size={18} aria-hidden />}<span className="hidden md:inline">{full ? 'Exit full screen' : 'Full screen'}</span>
              </button>
              <button type="button" onClick={() => setPanel(!panel)} aria-pressed={!panel} title={panel ? 'Hide the notes so the drawing has the whole width (N)' : 'Show the notes again (N)'} className={barBtn(!panel)}>
                {panel ? <PanelRightClose size={18} aria-hidden /> : <PanelRightOpen size={18} aria-hidden />}<span className="hidden md:inline">{panel ? 'Hide notes' : `Show notes${onSheet.length ? ` · ${onSheet.length}` : ''}`}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---- the panel */}
      <aside hidden={!panel} className={cx('min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:w-[360px] lg:flex-none', panel ? 'flex' : 'hidden', full && 'max-h-[45vh] lg:max-h-none')}>
        <div className="border-b border-slate-100 px-4 pt-4">
          <div className="flex items-center gap-3">
            <Initials name={r?.designer?.name || viewing?.by?.name || d.name} size={36} color="#059669" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-800">{self ? (reviewer ? 'Your own drawing' : 'Your drawing') : r?.designer?.name || 'No PDF yet'}</div>
              <div className="truncate text-xs text-slate-500">
                {viewing ? <>v{viewing.n} · {state === 'IN_REVIEW' ? `sent ${ago(r?.submittedAt)}` : state === 'APPROVED' ? `${r?.selfApproved ? 'self-approved' : 'approved'} ${shortDate(r?.decidedAt)}` : state === 'CHANGES_REQUESTED' ? `sent back ${ago(r?.decidedAt)}` : `uploaded ${ago(viewing.at)}`}{viewing.note ? ` · “${viewing.note}”` : ''}</> : 'Waiting for its first PDF'}
              </div>
            </div>
          </div>
          <div className={cx('mt-3 rounded-xl px-3.5 py-3 text-sm', yours ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700')}>
            <b className="block">{yours ? 'Your turn' : 'Where it is now'}</b>{whereLine(d, viewer)}
            <span className="mt-1 block text-xs opacity-80">{steps.current >= steps.labels.length ? `All ${steps.labels.length} steps done` : `Step ${steps.current + 1} of ${steps.labels.length}: ${steps.labels[steps.current]}`}</span>
            {self && reviewer && state === 'IN_REVIEW' && <span className="mt-1 block">As Design Head you can approve your own drawing. The history will say it was self-approved.</span>}
          </div>
          {state === 'CHANGES_REQUESTED' && isCurrent && lastReturn?.reason && (
            <p className="mt-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700"><b>From {lastReturn.decidedBy?.email === me.email ? 'you' : firstName(lastReturn.decidedBy?.name)}:</b> “{lastReturn.reason}”</p>
          )}
          {state === 'CHANGES_REQUESTED' && isCurrent && onSheet.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 flex justify-between text-xs font-bold text-slate-700"><span>{fixedN} of {onSheet.length} fixed</span><span className="text-slate-500">{Math.round((fixedN / onSheet.length) * 100)}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><i className="block h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${(fixedN / onSheet.length) * 100}%` }} /></div>
            </div>
          )}
          <div className="mt-2 flex gap-1" role="tablist" aria-label="Panel">
            {(['notes', 'history'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={cx('inline-flex min-h-[44px] items-center gap-1.5 px-3 text-sm font-bold', tab === t ? 'text-slate-800 shadow-[inset_0_-2px_0_#059669]' : 'text-slate-500 hover:text-slate-800')}>
                {t === 'notes' ? <><MessageSquare size={16} aria-hidden />Notes{onSheet.length ? ` · ${onSheet.length}` : ''}</> : <><History size={16} aria-hidden />History</>}
              </button>
            ))}
          </div>
        </div>

        {tab === 'history' ? (
          <div className="flex-1 overflow-auto px-5 py-4">
            <div className="flex flex-col gap-3 border-l-2 border-slate-200 pl-4">
              {[...events].reverse().map((e, i) => (
                <div key={i} className="hud-row-in relative text-sm text-slate-800" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                  <span className={cx('absolute -left-[23px] top-[5px] h-2.5 w-2.5 rounded-full border-2 bg-white', e.type === 'returned' ? 'border-amber-500' : e.type === 'approved' ? 'border-emerald-600' : 'border-slate-400')} />
                  <b>{e.by?.email === me.email ? 'You' : firstName(e.by?.name)}</b> {EVENT_WORD[e.type] || e.type}{e.versionNo ? ` (v${e.versionNo})` : ''}
                  {e.text && <div className="text-sm text-slate-500">“{e.text}”</div>}
                  <div className="text-xs text-slate-400">{ago(e.at)}</div>
                </div>
              ))}
              {!events.length && <p className="text-sm text-slate-500">Nothing yet.</p>}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-2 overflow-auto p-3.5">
            {canMark && !draft && (
              <Btn kind="quiet" icon={Plus} className="self-start" onClick={() => { const anchor = { x: 0.5, y: 0.45 }; setDraft({ page: 0, shape: turnShape({ t: 'pin', ...anchor }, turn, 'page'), anchor, text: '', blocking: false }); setSelected(null); }}>Add a note</Btn>
            )}
            {onSheet.map((m, i) => {
              const done = m.status === 'FIXED';
              const sel = selected === m.id;
              return (
                <div key={m.id} className={cx('hud-row-in flex gap-2.5 rounded-xl border bg-white p-3', sel ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-200')} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                  <button type="button" onClick={() => showMark(m)} aria-label={`Show note ${m.n} on the drawing`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: done ? FIXED : m.source === 'client' ? CLIENT : MARK }}>{m.n}</button>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-500">{m.source === 'client' ? <span className="text-amber-700">Client</span> : m.by?.email === me.email ? 'You' : firstName(m.by?.name)} · {SHAPE_WORD[m.shape.t]}{pages > 1 ? ` · page ${m.page + 1}` : ''}</div>
                    <div className={cx('mt-0.5 text-sm', done ? 'text-slate-500 line-through decoration-emerald-500' : 'text-slate-800')}>{m.text}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {canFix && (
                        <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
                          <input type="checkbox" checked={done} disabled={busy === `fix-${m.id}`} onChange={() => act(`fix-${m.id}`, () => fixMark(target, m.id, !done))} className="h-5 w-5 accent-emerald-600" />
                          {done ? 'Fixed' : 'Mark fixed'}
                        </label>
                      )}
                      {canMark ? (
                        <>
                          <button type="button" onClick={() => act(`blk-${m.id}`, () => updateMark(target, m.id, { blocking: !m.blocking }))} aria-pressed={m.blocking}
                            className={cx('inline-flex min-h-[32px] items-center rounded-full border px-3 text-xs font-bold', m.blocking ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-300 text-slate-500')}>Must fix</button>
                          <button type="button" onClick={() => act(`del-${m.id}`, () => deleteMark(target, m.id))} className="inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100"><Trash2 size={13} aria-hidden />Remove</button>
                        </>
                      ) : m.blocking && !done && <Tag tone="bad">Must fix</Tag>}
                      {done && !canFix && <Tag tone="good">{m.fixedInVersionNo ? `Fixed in v${m.fixedInVersionNo}` : 'Fixed'}</Tag>}
                    </div>
                  </div>
                </div>
              );
            })}

            {reviewer && fixedFromPrev.length > 0 && prev && (
              <div className="mt-1 flex flex-col gap-1.5">
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-500"><span>Fixed from v{prev.n}</span><span>{fixedFromPrev.filter((m) => checked[m.id]).length} of {fixedFromPrev.length} checked</span></div>
                {fixedFromPrev.map((m) => {
                  const c = checked[m.id];
                  return (
                    <div key={m.id} className={cx('flex gap-2.5 rounded-xl border bg-white p-3', c === 'ok' ? 'border-emerald-200' : 'border-slate-200')}>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: FIXED }}>{m.n}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-500 line-through decoration-emerald-500">{m.text}</div>
                        {c ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <Tag tone={c === 'ok' ? 'good' : 'bad'} icon={c === 'ok' ? Check : Undo2}>{c === 'ok' ? 'Checked by you' : 'Sent back as a must-fix note'}</Tag>
                            {c === 'ok' && <button type="button" onClick={() => setChecked(m.id, null)} className="text-xs font-bold text-slate-500 hover:text-slate-800">Undo</button>}
                          </div>
                        ) : canMark && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => setChecked(m.id, 'ok')} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><Check size={14} aria-hidden />Looks fixed</button>
                            <button type="button" onClick={() => stillOpen(m)} disabled={busy === `reopen-${m.id}`} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Undo2 size={14} aria-hidden />Still open</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-slate-500">{fixedFromPrev.every((m) => checked[m.id]) ? 'Every fix is checked. Approve when the rest looks right.' : '“Fixed” is the designer’s word. Check each one, or send it back as still open.'}</p>
              </div>
            )}

            {!onSheet.length && !draft && !(reviewer && fixedFromPrev.length) && (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-5 text-center text-sm text-slate-500">
                {canMark ? 'Pick a tool under the drawing and mark it. Each mark becomes a numbered note.'
                  : !isCurrent ? 'Notes on older versions stay with them.'
                    : !viewing ? 'Notes from the Design Head will appear here, pinned to the exact spot on the drawing.'
                      : state === 'DRAFT' ? 'No notes yet. Send it and the Design Head checks it.'
                        : 'No notes on this version.'}
              </div>
            )}
          </div>
        )}

        {/* ---- the decision */}
        <div className="flex flex-col gap-2.5 border-t border-slate-100 bg-slate-50 px-4 pb-4 pt-3.5">
          {canDecide && !requestOpen && (
            <>
              <p className={cx('text-sm', blockingOpen ? 'font-semibold text-rose-700' : 'text-slate-500')}>
                {blockingOpen ? `${blockingOpen} must-fix note${blockingOpen === 1 ? ' is' : 's are'} open. Send it back, or untick Must fix to approve.` : `Approving signs off v${r?.versionNo} exactly as it is.${audience === 'studio' ? ' This drawing stays inside the studio.' : ''}`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Btn kind="plain" icon={Undo2} className="flex-[1_1_150px]" disabled={!!busy} onClick={() => { setRequestOpen(true); setDraft(null); }}>Request changes</Btn>
                <Btn kind="primary" icon={busy === 'approve' ? Loader2 : Check} className="flex-[1_1_150px]" disabled={!!busy || blockingOpen > 0 || !!draft} onClick={() => decide('approve')}>{self ? 'Approve your own drawing' : `Approve v${r?.versionNo}`}</Btn>
              </div>
            </>
          )}
          {canDecide && requestOpen && (
            <div className="flex flex-col gap-2">
              <label htmlFor="dd2-ret" className="text-sm font-bold text-slate-800">A line for {who} <span className="font-medium text-slate-400">{onSheet.length ? '(optional)' : '(needed when there are no notes)'}</span></label>
              <textarea id="dd2-ret" autoFocus value={retMsg} onChange={(e) => setRetMsg(e.target.value)} rows={2} placeholder="In one line, what should change" className={field} />
              <div className="flex gap-2">
                <Btn kind="quiet" onClick={() => setRequestOpen(false)}>Cancel</Btn>
                <Btn kind="primary" icon={busy === 'return' ? Loader2 : Send} className="flex-1" disabled={!!busy} onClick={() => decide('return')}>{self ? 'Send back to yourself' : `Send back to ${firstName(r?.designer?.name)}`}</Btn>
              </div>
            </div>
          )}

          {reviewer && fromClient && !clientStep && (
            <>
              <p className="text-sm text-slate-500">The client's notes stay on this drawing until you decide. Nothing changes for the designer yet.</p>
              <div className="flex flex-wrap gap-2">
                <Btn kind="plain" icon={Check} className="flex-[1_1_150px]" disabled={!!busy || !!draft} onClick={() => { setClientStep('keep'); setDraft(null); }}>Keep it approved</Btn>
                <Btn kind="primary" icon={Send} className="flex-[1_1_150px]" disabled={!!busy || !!draft || !onSheet.some((m) => m.status === 'OPEN')} title={onSheet.some((m) => m.status === 'OPEN') ? undefined : 'Add a note first'} onClick={() => { setClientStep('send'); setDraft(null); }}>Send to {who}</Btn>
              </div>
            </>
          )}
          {reviewer && fromClient && clientStep && (
            <div className="flex flex-col gap-2">
              {clientStep === 'keep' && <p className="text-sm font-semibold text-amber-800">v{r?.versionNo} stays approved as it is. The client's notes are cleared from the drawing. The history keeps what they asked.</p>}
              <label htmlFor="dd2-client" className="text-sm font-bold text-slate-800">{clientStep === 'send' ? `A line for ${who}` : 'Why it stays as it is'} <span className="font-medium text-slate-400">(optional)</span></label>
              <textarea id="dd2-client" autoFocus value={retMsg} onChange={(e) => setRetMsg(e.target.value)} rows={2} className={field}
                placeholder={clientStep === 'send' ? 'Changes the client asked for at the meeting.' : 'For example: agreed with the client to keep this finish'} />
              <div className="flex gap-2">
                <Btn kind="quiet" onClick={() => setClientStep(null)}>Cancel</Btn>
                <Btn kind="primary" icon={busy === clientStep ? Loader2 : clientStep === 'send' ? Send : Check} className="flex-1" disabled={!!busy} onClick={() => decideClient(clientStep)}>{clientStep === 'send' ? `Send to ${who}` : `Keep v${r?.versionNo} approved`}</Btn>
              </div>
            </div>
          )}

          {canSend && (
            confirmRemove ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-rose-700">Remove v{r?.versionNo}?{(r?.versionNo || 0) > 1 ? ` The drawing goes back to v${(r?.versionNo || 0) - 1}.` : ''}</span>
                <Btn kind="quiet" disabled={!!busy} onClick={() => setConfirmRemove(false)}>Keep it</Btn>
                <Btn kind="plain" icon={busy === 'remove' ? Loader2 : Trash2} disabled={!!busy} className="border-rose-300 text-rose-700"
                  onClick={async () => { const res = await act('remove', () => removeVersion(target, r!.rev, current!.id), { title: `v${r?.versionNo} removed`, sub: (r?.versionNo || 0) > 1 ? `Back to v${(r?.versionNo || 0) - 1}.` : 'Upload the right PDF when you have it.' }); setConfirmRemove(false); if (res) { setViewId(null); setCompare(false); } }}>Yes, remove</Btn>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-500">v{r?.versionNo} is ready. After sending, you go back to {backLabel}.</p>
                <Btn kind="primary" big icon={busy === 'send' ? Loader2 : Send} disabled={!!busy} onClick={send}>Send to the Design Head</Btn>
                {canRemove && <Btn kind="quiet" icon={Trash2} disabled={!!busy} onClick={() => setConfirmRemove(true)} title="Remove this PDF if it is the wrong file">Wrong file? Remove it</Btn>}
              </>
            )
          )}

          {canPullBack && (
            <>
              <p className="text-sm text-slate-500">With the Design Head since {ago(r?.submittedAt)}. Pull it back to change the PDF.</p>
              <Btn kind="plain" icon={busy === 'pull' ? Loader2 : RotateCcw} disabled={!!busy} onClick={() => act('pull', () => withdrawSheet(target, r!.rev), { title: 'Pulled back', sub: 'It is with you again. Upload the new PDF and send it.' })}>Pull it back</Btn>
            </>
          )}

          {canUploadNew && viewing && (
            <Btn kind={canFix ? 'primary' : 'plain'} big={canFix} icon={FileUp} disabled={!!busy} onClick={() => onUpload(d)}
              title={state === 'APPROVED' ? 'A new version goes back to the Design Head to check' : undefined}>
              {canFix ? 'Upload the fixed drawing' : `Upload a new version (v${(r?.versionNo || 0) + 1})`}
            </Btn>
          )}
        </div>
      </aside>
    </div>
  );

  return (
    <div className="hud-panel-in">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button type="button" onClick={onClose} className="inline-flex min-h-[40px] items-center gap-1 rounded-xl pl-2 pr-3 text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-800">
          <ChevronLeft size={18} aria-hidden />{backLabel}
        </button>
        <div className="min-w-0 flex-[1_1_260px]">
          <h1 className="truncate text-lg font-bold tracking-tight text-slate-800">{d.name}</h1>
          <p className="truncate text-xs text-slate-500">{projectName} · {roomLabel(d.roomName)}</p>
        </div>
        {round > 0 && <Tag tone="bad" title={`${INCLUDED_ROUNDS} review rounds are included. Further rounds may count as chargeable revisions.`}>Round {round} · {INCLUDED_ROUNDS} included</Tag>}
        {reviewer && qIndex >= 0 && queue.length > 1 && (
          <div className="inline-flex items-center gap-0.5">
            <button type="button" onClick={() => onOpen(queue[(qIndex - 1 + queue.length) % queue.length])} aria-label="Previous drawing waiting" className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100"><ChevronLeft size={18} /></button>
            <span className="min-w-[96px] text-center text-sm font-bold text-slate-700">{qIndex + 1} of {queue.length} waiting</span>
            <button type="button" onClick={() => onOpen(queue[(qIndex + 1) % queue.length])} aria-label="Next drawing waiting" className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100"><ChevronRight size={18} /></button>
          </div>
        )}
        {canSetAudience(role) ? (
          <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-600">For
            <select value={audience} disabled={busy === 'audience'} aria-label="Who this drawing is for"
              onChange={(e) => act('audience', () => setAudience(target, e.target.value as any), { title: e.target.value === 'client' ? 'It can be shown to the client' : 'It stays inside the studio', sub: d.name })}
              className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-2.5 text-sm font-bold text-slate-800">
              <option value="client">the client</option>
              <option value="studio">the studio only</option>
            </select>
          </label>
        ) : <Tag>{audience === 'studio' ? 'Studio only' : 'For the client'}</Tag>}
        {versions.length > 1 && (
          <select value={viewing?.id || ''} aria-label="Version" onChange={(e) => { setViewId(e.target.value === current?.id ? null : e.target.value); setCompare(false); setSelected(null); setDraft(null); }}
            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-2.5 text-sm font-bold text-slate-800">
            {[...versions].reverse().map((v) => <option key={v.id} value={v.id}>v{v.n}{v.id === current?.id ? ' (latest)' : ''} · {firstName(v.by?.name)}, {shortDate(v.at)}</option>)}
          </select>
        )}
      </div>
      {full ? createPortal(body, document.body) : body}
    </div>
  );
}
