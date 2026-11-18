import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MessagesSquare, Ruler, FileText, PenTool, HardHat, KeyRound, MapPin, Layers, Table, BadgePercent, Presentation,
  GitBranch, ScrollText, Package, Signature, CalendarCheck, ShieldCheck, Hammer, SwatchBook, SquarePlus, Key,
  Compass, DraftingCompass, ChartColumn, FolderOpen, MonitorSmartphone, CalendarRange, MessageCircle, Wallet, Scale,
  History, LayoutGrid, Search, Sparkles, Lock, ChevronLeft, ChevronDown, ChevronsUpDown, Circle, Building2, Eye,
  ClipboardCheck, NotebookPen,
} from '@/lib/lucide-shim';
import NotifyBell, { type ProjectAlerts } from '../notify/NotifyBell';
import './projectSidebar.css';

/*
  The project sidebar (DESIGN.md "Project sidebar", approved 16 Nov 2026).

  The owner found the five-row project header took a third of the screen,
  and chose a quiet sidebar from the prototypes: Studio home and the bell at
  the top, the project and its next step, Jump to (Ctrl/Cmd K), the project's
  journey through its six stages with each stage's screens, the Project Hub,
  and the person at the bottom. It collapses to icons on a click (Ctrl/Cmd B)
  and its edge can be dragged to any width; both are remembered. Icons are
  Lucide, each with its own small move on hover.
*/

export interface SidebarScreen { route: string; label: string; readOnly?: boolean }
export interface SidebarStage { stage: number; label: string; screens: SidebarScreen[]; locked: boolean; lockNote?: string; state: 'done' | 'now' | 'todo' }
export interface SidebarHubItem { route: string; label: string; badge?: string | null; tone?: string | null; readOnly?: boolean; note?: string }
export interface SidebarMenuItem { label: string; icon: React.ComponentType<any>; onClick: () => void }

interface Props {
  projectId: string;
  activeTab: string;
  onGo: (route: string, stage?: number) => void;
  /** The Hub's own screen ("dashboard"), or a Designer's home. */
  home: { route: string; label: string };
  stages: SidebarStage[];
  /** The stage whose screens show under it. */
  selectedStage: number | null;
  hub: SidebarHubItem[];
  /** Notes waiting on this person, by screen (lib/notify). */
  counts: (route: string) => { needs: number; unread: number };
  project: { name: string; sub: string; initials: string };
  status: { label: string; onClick?: () => void; disabled?: boolean };
  progress: { pct: number; next?: string; onClick?: () => void };
  /** Under the project's name: Details, the team. */
  projectTools?: React.ReactNode;
  studioHome: { label: string; onClick: () => void };
  bellProject?: ProjectAlerts;
  user: { name: string; role: string };
  menu: SidebarMenuItem[];
  /** For phones: the page bar's menu button opens the sidebar as a drawer. */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

/* Icons: one per stage and screen, from the studio's own world. */
const STAGE_ICON: Record<number, React.ComponentType<any>> = { 1: MessagesSquare, 2: Ruler, 3: FileText, 4: PenTool, 5: HardHat, 6: KeyRound };
const ROUTE_ICON: Record<string, React.ComponentType<any>> = {
  leadiq: MapPin, ops: Layers, 'boq-editor': Table, analytics: BadgePercent, client: Presentation, 'revision-studio': GitBranch,
  'terms-docket': ScrollText, onboarding: Package, 'execution-agreement': Signature, 'payment-calc': CalendarCheck,
  'design-gate': ShieldCheck, 'site-ops': Hammer, 'site-quality': ClipboardCheck, 'site-meetings': NotebookPen, materials: SwatchBook, 'scope-additions': SquarePlus, 'handover-docket': Key,
  'project-journey': Compass, 'drawing-tracker': DraftingCompass, 'project-reports': ChartColumn, docs: FolderOpen,
  'client-portal': MonitorSmartphone, timeline: CalendarRange, 'comms-tracker': MessageCircle, 'record-decision': Scale,
  history: History, dashboard: LayoutGrid,
};
/* The Money hub item shares Payment Schedule's route; in the hub it is a wallet. */
const HUB_ICON: Record<string, React.ComponentType<any>> = { 'payment-calc': Wallet };
const MOVE: Record<string, string> = {
  leadiq: 'bounce', ops: 'bounce', 'boq-editor': 'nudge', analytics: 'spin', client: 'nudge', 'revision-studio': 'wiggle',
  'terms-docket': 'nudge', onboarding: 'bounce', 'execution-agreement': 'swing', 'payment-calc': 'wiggle', 'design-gate': 'tilt',
  'site-ops': 'swing', 'site-quality': 'tilt', 'site-meetings': 'nudge', materials: 'wiggle', 'scope-additions': 'spin', 'handover-docket': 'swing', 'project-journey': 'spin',
  'drawing-tracker': 'swing', 'project-reports': 'bounce', docs: 'nudge', 'client-portal': 'nudge', timeline: 'nudge',
  'comms-tracker': 'wiggle', 'record-decision': 'tilt', history: 'rewind', dashboard: 'nudge',
};
const DRAWS = new Set(['ops', 'revision-studio', 'terms-docket', 'execution-agreement', 'timeline', 'project-reports', 'history', 'drawing-tracker', 'leadiq']);
const STAGE_MOVE: Record<number, string> = { 1: 'bounce', 2: 'tilt', 3: 'nudge', 4: 'swing', 5: 'bounce', 6: 'swing' };

const Ic = ({ icon: I, move = 'nudge', draw = false }: { icon: React.ComponentType<any>; move?: string; draw?: boolean }) => (
  <span className={`psb-ic ${draw ? 'is-draw' : ''}`} data-a={move} aria-hidden><I /></span>
);

const KEY = 'sd.projectSidebar';
const MIN = 200, MAX = 400, SNAP = 150, OPEN_W = 288;

/*
  The curved glass (asked for 18 Nov 2026, rounds three and four the same
  day): the sidebar is one pane of clear, glossy glass set into the window's
  left edge, from top to bottom, so it reads as part of the app rather than a
  card stuck on it. Its left, top and bottom meet the window; its right side
  bows in along its whole height, deepest at the middle. The outline is drawn
  for the pane's real size, so the curve follows as it opens, closes or is
  dragged wider.
*/
export function glassDepth(w: number, closed: boolean): number {
  return closed ? 6 : Math.round(Math.max(8, Math.min(16, w * 0.06)));
}
const n1 = (v: number) => Math.round(v * 10) / 10;
/** The curved right side alone: what lights up while you hover or drag it. */
export function glassEdge(w: number, h: number, closed: boolean): string {
  if (w <= 0 || h <= 0) return '';
  return `M${n1(w)} 0Q${n1(w - 2 * glassDepth(w, closed))} ${n1(h / 2)} ${n1(w)} ${n1(h)}`;
}
export function glassPath(w: number, h: number, closed: boolean): string {
  if (w <= 0 || h <= 0) return '';
  return `${glassEdge(w, h, closed)}H0V0Z`;
}

function Glass({ closed, hot }: { closed: boolean; hot: boolean }) {
  const id = useId().replace(/:/g, '');
  const frame = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = frame.current; if (!el) return;
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      setBox((b) => (Math.abs(b.w - w) < 0.5 && Math.abs(b.h - h) < 0.5 ? b : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { w, h } = box;
  const d = glassPath(w, h, closed);
  const edge = glassEdge(w, h, closed);
  const u = (k: string) => `url(#${id}${k})`;
  return (
    <div className="psb-glass" ref={frame} aria-hidden>
      {/* frosts whatever is behind the pane (the page, under the phone drawer) */}
      {d && <div className="psb-frost" style={{ clipPath: `path('${d}')`, WebkitClipPath: `path('${d}')` } as React.CSSProperties} />}
      {d && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <clipPath id={`${id}c`}><path d={d} /></clipPath>
            {/* the shadow falls outside the pane only, so the glass stays clear */}
            <filter id={`${id}o`} x="-40%" y="-15%" width="180%" height="135%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="14" result="b" />
              <feOffset in="b" dx="6" result="o" />
              <feFlood floodColor="#0F172A" floodOpacity=".16" />
              <feComposite in2="o" operator="in" result="s" />
              <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b2" />
              <feOffset in="b2" dx="1" result="o2" />
              <feFlood floodColor="#3D52A0" floodOpacity=".14" />
              <feComposite in2="o2" operator="in" result="s2" />
              <feMerge result="all"><feMergeNode in="s" /><feMergeNode in="s2" /></feMerge>
              <feComposite in="all" in2="SourceAlpha" operator="out" />
            </filter>
            <filter id={`${id}z`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16" /></filter>
            <filter id={`${id}y`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2" /></filter>
            <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity=".55" />
              <stop offset=".5" stopColor="#FFFFFF" stopOpacity=".3" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity=".45" />
            </linearGradient>
            <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity=".95" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
              <stop offset=".45" stopColor="#FFFFFF" stopOpacity=".35" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity=".9" />
            </linearGradient>
            <linearGradient id={`${id}e`} x1="0" y1="0" x2="1" y2="1">
              <stop offset=".35" stopColor="#64748B" stopOpacity="0" />
              <stop offset="1" stopColor="#64748B" stopOpacity=".32" />
            </linearGradient>
          </defs>

          <path d={d} fill="#000" filter={u('o')} />
          <g clipPath={u('c')}>
            {/* what the glass sits over: soft brand and slate light, blurred */}
            <rect width={w} height={h} fill="#F1F5F9" fillOpacity=".55" />
            <g filter={u('z')}>
              <ellipse cx={w * 0.08} cy={h * 0.1} rx={w * 0.75} ry={h * 0.12} fill="#3D52A0" fillOpacity=".26" />
              <path d={`M${-w * 0.3} ${h * 0.4}C${w * 0.3} ${h * 0.28} ${w * 0.7} ${h * 0.6} ${w * 1.3} ${h * 0.4}L${w * 1.3} ${h * 0.5}C${w * 0.7} ${h * 0.7} ${w * 0.3} ${h * 0.38} ${-w * 0.3} ${h * 0.52}Z`} fill="#3D52A0" fillOpacity=".17" />
              <path d={`M${-w * 0.3} ${h * 0.74}C${w * 0.4} ${h * 0.64} ${w * 0.6} ${h * 0.9} ${w * 1.3} ${h * 0.72}L${w * 1.3} ${h * 0.84}C${w * 0.6} ${h * 1.0} ${w * 0.4} ${h * 0.74} ${-w * 0.3} ${h * 0.86}Z`} fill="#94A3B8" fillOpacity=".42" />
              <ellipse cx={w * 0.95} cy={h * 0.98} rx={w * 0.6} ry={h * 0.1} fill="#3D52A0" fillOpacity=".2" />
            </g>
            {/* the glass itself, then its gloss */}
            <rect width={w} height={h} fill={u('f')} />
            <rect width={w} height={Math.min(220, h * 0.28)} fill={u('t')} />
            <g filter={u('y')} className="psb-sheen">
              <path d={`M${w * 0.42} 0L${w * 0.62} 0L${w * 0.02} ${h * 0.62}L${-w * 0.18} ${h * 0.62}Z`} fill="#FFFFFF" fillOpacity=".55" />
              <path d={`M${w * 0.7} 0L${w * 0.76} 0L${w * 0.16} ${h * 0.62}L${w * 0.1} ${h * 0.62}Z`} fill="#FFFFFF" fillOpacity=".45" />
            </g>
            {/* thickness: a shade along the lower and right inner edge, a bright rim */}
            <path d={d} fill="none" stroke={u('e')} strokeWidth="12" filter={u('y')} />
            <path d={d} fill="none" stroke={u('r')} strokeWidth="4" />
          </g>
          {/* the curved edge: a slate hairline, brand while you hover or drag it to resize */}
          <path d={edge} fill="none" className={`psb-edge ${hot ? 'is-hot' : ''}`} />
        </svg>
      )}
    </div>
  );
}

export default function ProjectSidebar(p: Props) {
  /* Open or icons, and the width: remembered on this device. */
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(OPEN_W);
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (typeof s.open === 'boolean') setOpen(s.open);
      if (typeof s.width === 'number') setWidth(Math.min(MAX, Math.max(MIN, s.width)));
      if (s.shut && typeof s.shut === 'object') setShut(s.shut);
    } catch { /* storage refused: start open */ }
    const mq = window.matchMedia?.('(max-width: 767px)');
    const on = () => setPhone(!!mq?.matches);
    on(); mq?.addEventListener?.('change', on);
    return () => mq?.removeEventListener?.('change', on);
  }, []);
  const save = useCallback((next: { open?: boolean; width?: number; shut?: Record<string, boolean> }) => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      localStorage.setItem(KEY, JSON.stringify({ ...s, ...next }));
    } catch { /* storage refused */ }
  }, []);
  const closed = !open && !phone;

  const toggle = useCallback(() => { setOpen((o) => { save({ open: !o }); return !o; }); }, [save]);
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggle(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((v) => !v); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [toggle]);

  /* Drag the edge: narrow enough and it snaps to icons; drag out again to reopen. */
  const aside = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<null | string>(null);
  const [edgeHover, setEdgeHover] = useState(false);
  const startResize = (e: React.PointerEvent) => {
    if (phone) return;
    e.preventDefault();
    const left = aside.current?.getBoundingClientRect().left || 0;
    document.body.classList.add('psb-resizing');
    let w = width, isOpen = open;
    const move = (ev: PointerEvent) => {
      const x = ev.clientX - left;
      if (x < SNAP) { isOpen = false; setOpen(false); setDrag('Icons'); }
      else { isOpen = true; w = Math.round(Math.min(MAX, Math.max(MIN, x))); setOpen(true); setWidth(w); setDrag(`${w}px`); }
    };
    const up = () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
      document.body.classList.remove('psb-resizing'); setDrag(null); save({ open: isOpen, width: w });
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  };
  const resetWidth = () => { setWidth(OPEN_W); setOpen(true); save({ open: true, width: OPEN_W }); };

  /* The sliding highlight under the screen you are on. */
  const scroller = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ y: number; h: number } | null>(null);
  const place = useCallback(() => {
    const sc = scroller.current; if (!sc) return;
    let el = sc.querySelector<HTMLElement>('.psb-item.is-on');
    if (el && closed && el.classList.contains('is-sub')) el = sc.querySelector<HTMLElement>(`.psb-stage[data-stage="${p.selectedStage}"]`);
    if (!el || (!closed && el.closest('.psb-group.is-shut'))) { setInd(null); return; }
    const r = el.getBoundingClientRect(), s = sc.getBoundingClientRect();
    setInd({ y: r.top - s.top + sc.scrollTop, h: r.height });
  }, [closed, p.selectedStage]);
  /* No scrollbar on the glass (on Windows it cut across the curve): the list fades at an edge with more beyond it. */
  const [more, setMore] = useState({ up: false, down: false });
  const edges = useCallback(() => {
    const sc = scroller.current; if (!sc) return;
    const up = sc.scrollTop > 2, down = sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2;
    setMore((m) => (m.up === up && m.down === down ? m : { up, down }));
  }, []);
  useLayoutEffect(() => { place(); edges(); const t = setTimeout(() => { place(); edges(); }, 520); return () => clearTimeout(t); }, [place, edges, p.activeTab, open, width, shut, p.selectedStage]);
  useEffect(() => {
    const on = () => { place(); edges(); };
    window.addEventListener('resize', on); return () => window.removeEventListener('resize', on);
  }, [place, edges]);

  /* The journey line fills to the stage the project is at. */
  const journeyRef = useRef<HTMLDivElement>(null);
  const [fill, setFill] = useState(0);
  useLayoutEffect(() => {
    const now = journeyRef.current?.querySelector<HTMLElement>('.psb-stage.is-now');
    setFill(now ? now.offsetTop : 0);
  }, [p.stages, open, shut, p.selectedStage]);

  /* Collapsed: names on hover, and a stage's screens in a pop-out. */
  const [tip, setTip] = useState<null | { x: number; y: number; text: string; sub?: string }>(null);
  const [fly, setFly] = useState<null | { x: number; y: number; stage: SidebarStage }>(null);
  const flyTimer = useRef<number>();
  const hover = (e: React.MouseEvent) => {
    if (!closed) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const st = el.dataset.stage ? p.stages.find((s) => s.stage === Number(el.dataset.stage)) : null;
    window.clearTimeout(flyTimer.current);
    if (st && !st.locked && st.screens.length) { setTip(null); setFly({ x: r.right + 12, y: Math.max(8, r.top - 8), stage: st }); return; }
    setFly(null);
    setTip({ x: r.right + 12, y: r.top + r.height / 2 - 18, text: el.dataset.tip || '', sub: el.dataset.tipsub });
  };
  const leave = () => { setTip(null); flyTimer.current = window.setTimeout(() => setFly(null), 180); };
  useEffect(() => { if (!closed) { setTip(null); setFly(null); } }, [closed]);

  const [shake, setShake] = useState<number | null>(null);
  const [me, setMe] = useState<null | { x: number; y: number }>(null);

  const go = (route: string, stage?: number) => { setFly(null); setTip(null); p.onGo(route, stage); p.onMobileClose(); };
  const clickStage = (st: SidebarStage) => {
    if (st.locked) { setShake(st.stage); window.setTimeout(() => setShake(null), 420); return; }
    if (st.screens[0]) go(st.screens[0].route, st.stage);
  };
  const toggleGroup = (g: string) => setShut((s) => { const n = { ...s, [g]: !s[g] }; save({ shut: n }); return n; });

  const count = (route: string, badge?: string | null, tone?: string | null) => {
    const c = p.counts(route);
    if (c.needs) return { text: String(c.needs), tone: 'alert' };
    if (badge) return { text: badge, tone: tone === 'alert' ? 'alert' : tone === 'warn' ? 'warn' : tone === 'ok' ? 'ok' : '' };
    if (c.unread) return { text: '•', tone: '' };
    return null;
  };

  const ringOffset = 163 - 163 * Math.max(0, Math.min(100, p.progress.pct)) / 100;

  return (
    <>
      {phone && p.mobileOpen && <div className="fixed inset-0 z-[39] bg-[#12182F]/30" onClick={p.onMobileClose} aria-hidden />}
      <aside
        ref={aside}
        aria-label="Project navigation"
        className={`psb ${closed ? 'is-closed' : ''} ${drag ? 'is-drag' : ''} ${p.mobileOpen ? 'is-mobile-open' : ''}`}
        style={{ ['--psb-w' as any]: `${width}px` }}
        onMouseOver={hover}
        onMouseLeave={leave}
      >
        <Glass closed={closed} hot={edgeHover || !!drag} />
        {!phone && (
          <button type="button" className="psb-toggle" onClick={toggle} aria-label={closed ? 'Expand sidebar' : 'Collapse sidebar'} title="Ctrl/⌘ B">
            <ChevronLeft strokeWidth={2.4} />
          </button>
        )}
        {!phone && <div className="psb-resize" onPointerDown={startResize} onDoubleClick={resetWidth} onPointerEnter={() => setEdgeHover(true)} onPointerLeave={() => setEdgeHover(false)} title="Drag to resize · double-click to reset" aria-hidden />}
        {drag && <div className="psb-wlabel">{drag}</div>}

        {/* Studio home and the bell: always on screen. */}
        <div className="psb-studio">
          <button type="button" className="psb-home" onClick={p.studioHome.onClick} data-tip={p.studioHome.label} data-tipsub="All projects, people and reports">
            <span className="psb-mark"><span className="psb-ic" data-a="nudge"><Building2 className="!w-4 !h-4" /></span></span>
            <span className="psb-lbl leading-tight"><b className="block text-[13px] font-extrabold text-slate-800">{p.studioHome.label}</b><small className="block text-[11px] text-slate-500">All projects</small></span>
          </button>
          <span data-tip="Notifications" className="shrink-0"><NotifyBell project={p.bellProject} className="bg-white border border-slate-200" /></span>
        </div>

        {/* The project, its status and its next step. */}
        <div className="psb-px flex items-center gap-[11px] pt-2.5 pb-3">
          <button type="button" className="psb-tile" onClick={p.progress.onClick} data-tip={p.project.name} data-tipsub={`${Math.round(p.progress.pct)}% · Next: ${p.progress.next || 'Up next'}`} aria-label={`Progress ${Math.round(p.progress.pct)}%`}>
            {p.project.initials}
            <svg className="psb-ring" viewBox="0 0 56 56" aria-hidden><circle className="bg" cx="28" cy="28" r="26" /><circle className="fg" cx="28" cy="28" r="26" style={{ strokeDashoffset: ringOffset }} /></svg>
          </button>
          <div className="psb-lbl min-w-0 leading-tight">
            <b className="block text-sm font-extrabold text-slate-800 truncate" title={p.project.name}>{p.project.name}</b>
            <small className="block text-[11px] text-slate-500 truncate">{p.project.sub}</small>
            <button type="button" disabled={p.status.disabled} onClick={p.status.onClick} className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#3D52A0] disabled:cursor-default" title={p.status.disabled ? p.status.label : 'Change the project status'}>
              <span className="psb-dot" />{p.status.label}{!p.status.disabled && <ChevronDown className="w-3 h-3 opacity-60" />}
            </button>
          </div>
        </div>
        {p.projectTools && <div className="psb-hide-closed psb-lbl psb-px flex items-center gap-2 pb-2">{p.projectTools}</div>}
        {p.progress.next && (
          <button type="button" onClick={p.progress.onClick} className="psb-hide-closed psb-btn psb-mx psb-glassy mb-2.5 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left">
            <span className="psb-ic text-[#3D52A0]" data-a="spin"><Sparkles className="!w-4 !h-4" /></span>
            <span className="min-w-0"><small className="block text-[10px] font-extrabold tracking-[0.1em] text-slate-400">NEXT · {Math.round(p.progress.pct)}%</small><b className="block text-xs text-slate-800 truncate">{p.progress.next}</b></span>
          </button>
        )}
        <button type="button" onClick={() => setPalette(true)} data-tip="Jump to…" data-tipsub="Ctrl/⌘ K"
          className={`psb-btn psb-mx psb-glassy mb-1.5 flex items-center gap-2.5 rounded-xl text-slate-500 text-[13px] hover:text-slate-800 ${closed ? 'justify-center py-2.5' : 'px-2.5 py-2'}`}>
          <span className="psb-ic" data-a="tilt"><Search className="!w-[18px] !h-[18px]" /></span>
          <span className="psb-lbl">Jump to…</span>
          <kbd className="psb-lbl ml-auto font-sans text-[10px] font-bold px-1.5 rounded-md bg-slate-100 text-slate-500">⌘K</kbd>
        </button>

        <div className={`psb-scroll ${more.up ? 'more-up' : ''} ${more.down ? 'more-down' : ''}`} ref={scroller} onScroll={() => { setTip(null); edges(); }}>
          {ind && <span className="psb-ind" style={{ transform: `translateY(${ind.y}px)`, height: ind.h }} />}

          <div className="psb-group">
            <div className="psb-gbody"><div>
              <button type="button" className={`psb-item ${p.activeTab === p.home.route ? 'is-on' : ''}`} onClick={() => go(p.home.route)} data-tip={p.home.label} data-tipsub="The project at a glance">
                <Ic icon={ROUTE_ICON[p.home.route] || LayoutGrid} move="nudge" /><span className="psb-lbl">{p.home.label}</span>
              </button>
            </div></div>
          </div>

          {p.stages.length > 0 && (
            <div className={`psb-group ${shut.journey ? 'is-shut' : ''}`}>
              <button type="button" className="psb-ghead" onClick={() => toggleGroup('journey')} aria-expanded={!shut.journey}><span>Journey</span><ChevronDown strokeWidth={2.4} /></button>
              <div className="psb-gbody"><div>
                <div className="psb-journey" ref={journeyRef}>
                  <i className="psb-fill" style={{ height: fill }} />
                  {p.stages.map((st) => {
                    const Icon = STAGE_ICON[st.stage] || Circle;
                    const sel = p.selectedStage === st.stage;
                    const c = st.screens.reduce((t, s) => { const n = p.counts(s.route); return { needs: t.needs + n.needs, unread: t.unread + n.unread }; }, { needs: 0, unread: 0 });
                    return (
                      <React.Fragment key={st.stage}>
                        <button type="button" data-stage={st.stage}
                          className={`psb-item psb-stage is-${st.state} ${st.locked ? 'is-locked' : ''} ${shake === st.stage ? 'is-shake' : ''}`}
                          onClick={() => clickStage(st)} aria-expanded={sel}
                          data-tip={st.label} data-tipsub={st.locked ? st.lockNote || 'Locked' : st.state === 'now' ? 'Where the project is now' : st.state === 'done' ? 'Done' : ''}
                          title={st.locked ? st.lockNote : undefined}>
                          <span className="psb-node"><Ic icon={Icon} move={STAGE_MOVE[st.stage]} /></span>
                          <span className="psb-lbl">{st.label}</span>
                          <span className="psb-meta psb-lbl">
                            {c.needs > 0 && <span className="psb-cnt alert">{c.needs}</span>}
                            {st.locked ? <Lock className="w-3.5 h-3.5 text-slate-400" /> : st.state === 'now' ? <span className="text-[10px] font-extrabold tracking-[0.08em] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">NOW</span> : null}
                          </span>
                          {c.needs > 0 && <i className="psb-pip alert" />}
                        </button>
                        <div className={`psb-subs ${sel ? 'is-open' : ''}`}><div>
                          {st.screens.map((s) => {
                            const n = count(s.route);
                            return (
                              <button key={s.route} type="button" className={`psb-item is-sub ${p.activeTab === s.route ? 'is-on' : ''}`} onClick={() => go(s.route, st.stage)}>
                                <Ic icon={ROUTE_ICON[s.route] || Circle} move={MOVE[s.route]} draw={DRAWS.has(s.route)} />
                                <span className="psb-lbl truncate">{s.label}</span>
                                <span className="psb-meta psb-lbl">
                                  {s.readOnly && <Eye className="w-3.5 h-3.5 text-amber-600" aria-label="Read-only" />}
                                  {n && <span className={`psb-cnt ${n.tone}`}>{n.text}</span>}
                                </span>
                              </button>
                            );
                          })}
                        </div></div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div></div>
            </div>
          )}

          {p.hub.length > 0 && (
            <div className={`psb-group ${shut.hub ? 'is-shut' : ''}`}>
              <button type="button" className="psb-ghead" onClick={() => toggleGroup('hub')} aria-expanded={!shut.hub}><span>Project Hub</span><ChevronDown strokeWidth={2.4} /></button>
              <div className="psb-gbody"><div>
                {p.hub.map((h) => {
                  const n = count(h.route, h.badge, h.tone);
                  const on = p.activeTab === h.route && !p.stages.some((s) => s.stage === p.selectedStage && s.screens.some((x) => x.route === h.route));
                  return (
                    <button key={h.label} type="button" className={`psb-item ${on ? 'is-on' : ''}`} onClick={() => go(h.route)} data-tip={h.label} data-tipsub={n ? n.text : h.note}>
                      <Ic icon={HUB_ICON[h.route] || ROUTE_ICON[h.route] || Circle} move={MOVE[h.route]} draw={DRAWS.has(h.route)} />
                      <span className="psb-lbl truncate">{h.label}</span>
                      <span className="psb-meta psb-lbl">
                        {h.readOnly && <Eye className="w-3.5 h-3.5 text-amber-600" aria-label="Read-only" />}
                        {n && <span className={`psb-cnt ${n.tone}`}>{n.text}</span>}
                      </span>
                      {n && <i className={`psb-pip ${n.tone}`} />}
                    </button>
                  );
                })}
              </div></div>
            </div>
          )}
        </div>

        {/* The person: one row; the studio's screens and settings in its menu. */}
        <div className="psb-foot">
          <button type="button" className="psb-me" data-tip={p.user.name} data-tipsub={p.user.role}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMe(me ? null : { x: r.left, y: r.top }); }} aria-haspopup="menu" aria-expanded={!!me}>
            <span className="w-8 h-8 rounded-full bg-[#E8ECFB] text-[#3D52A0] grid place-items-center text-xs font-extrabold shrink-0">{p.user.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()}</span>
            <span className="psb-lbl min-w-0 leading-tight"><b className="block text-xs font-bold text-slate-800 truncate">{p.user.name}</b><small className="block text-[11px] text-slate-500">{p.user.role}</small></span>
            <ChevronsUpDown className="psb-lbl ml-auto w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </aside>

      {tip && createPortal(<div className="psb-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}{tip.sub && <small>{tip.sub}</small>}</div>, document.body)}
      {fly && createPortal(
        <div className="psb-pop" style={{ left: fly.x, top: fly.y }} onMouseEnter={() => window.clearTimeout(flyTimer.current)} onMouseLeave={() => { flyTimer.current = window.setTimeout(() => setFly(null), 180); }}>
          <p className="px-2 pt-1 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{fly.stage.stage} · {fly.stage.label}</p>
          {fly.stage.screens.map((s) => (
            <button key={s.route} type="button" className={`psb-item ${p.activeTab === s.route ? 'is-on' : ''}`} style={{ justifyContent: 'flex-start', padding: '0 10px' }} onClick={() => go(s.route, fly.stage.stage)}>
              <Ic icon={ROUTE_ICON[s.route] || Circle} move={MOVE[s.route]} /><span>{s.label}</span>
            </button>
          ))}
        </div>, document.body)}
      {me && <MeMenu at={me} items={p.menu} user={p.user} onClose={() => setMe(null)} />}
      {palette && <JumpTo stages={p.stages} hub={p.hub} home={p.home} onGo={(r, s) => { setPalette(false); go(r, s); }} onLocked={(s) => { setPalette(false); setShake(s); window.setTimeout(() => setShake(null), 420); }} onClose={() => setPalette(false)} />}
    </>
  );
}

function MeMenu({ at, items, user, onClose }: { at: { x: number; y: number }; items: SidebarMenuItem[]; user: { name: string; role: string }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = window.setTimeout(() => document.addEventListener('pointerdown', away), 0);
    window.addEventListener('keydown', esc);
    return () => { window.clearTimeout(t); document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [onClose]);
  const h = 64 + items.length * 38;
  return createPortal(
    <div ref={ref} role="menu" className="psb-pop" style={{ left: at.x, top: Math.max(8, at.y - h - 8), width: 240 }}>
      <div className="px-2 pt-1 pb-2 mb-1 border-b border-slate-100 leading-tight"><b className="block text-[13px] text-slate-800">{user.name}</b><small className="block text-[11px] text-slate-500">{user.role}</small></div>
      {items.map((it) => (
        <button key={it.label} type="button" role="menuitem" onClick={() => { onClose(); it.onClick(); }}
          className="psb-item" style={{ justifyContent: 'flex-start', padding: '0 10px' }}>
          <Ic icon={it.icon} /><span>{it.label}</span>
        </button>
      ))}
    </div>, document.body);
}

/* Ctrl/Cmd K: every screen of the project by name. */
function JumpTo({ stages, hub, home, onGo, onLocked, onClose }: {
  stages: SidebarStage[]; hub: SidebarHubItem[]; home: { route: string; label: string };
  onGo: (route: string, stage?: number) => void; onLocked: (stage: number) => void; onClose: () => void;
}) {
  const all = useMemo(() => [
    { route: home.route, label: home.label, where: 'Project', stage: undefined as number | undefined, locked: false },
    ...stages.flatMap((s) => s.screens.map((x) => ({ route: x.route, label: x.label, where: s.label, stage: s.stage, locked: s.locked }))),
    ...hub.map((h) => ({ route: h.route, label: h.label, where: 'Project Hub', stage: undefined, locked: false })),
  ], [stages, hub, home]);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const list = all.filter((x) => !q.trim() || `${x.label} ${x.where}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12);
  const pick = (i: number) => { const x = list[i]; if (!x) return; if (x.locked && x.stage) onLocked(x.stage); else onGo(x.route, x.stage); };
  return createPortal(
    <div className="fixed inset-0 z-[300] grid place-items-start justify-center pt-[12vh]" role="dialog" aria-label="Jump to">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-[min(560px,92vw)] bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} placeholder="Jump to a screen…" aria-label="Jump to a screen"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            if (e.key === 'Enter') pick(hi);
            if (e.key === 'Escape') onClose();
          }}
          className="w-full px-5 py-4 text-[15px] outline-none border-b border-slate-100" />
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {list.length === 0 && <p className="px-3 py-4 text-xs text-slate-500">Nothing by that name.</p>}
          {list.map((x, i) => {
            const Icon = (x.where === 'Project Hub' && HUB_ICON[x.route]) || ROUTE_ICON[x.route] || Circle;
            return (
              <button key={`${x.where}-${x.route}-${x.label}`} type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(i)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-[13px] font-semibold ${i === hi ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'text-slate-700'}`}>
                <Icon className="w-[18px] h-[18px] shrink-0" />{x.label}
                <small className="ml-auto text-[11px] font-semibold text-slate-400">{x.locked ? 'Locked · ' : ''}{x.where}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>, document.body);
}
