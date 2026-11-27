import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ArrowRight, Sparkles, MessageCircle, Wallet, Table, FolderOpen, PenTool, HardHat, CalendarRange, MapPin,
  X, Home, Users, Building2, ChevronRight as Crumb, Search, FileText, Globe, IndianRupee, NotebookPen, Info, Eye, Scale, ChevronRight, LayoutGrid, Compass, History,
} from '@/lib/lucide-shim';
import { Button, Chip, EmptyState, INPUT, Segmented, type Tone } from '../ui/kit';
import { Masked, HideFiguresButton } from '../ui/HideFigures';
import { CountUp } from '../ui/HudBits';
import { useProjectGlance, type Glance } from './useProjectGlance';
import { motion } from 'framer-motion';
import PageTitleBlock from '../PageTitleBlock';
import ViewOnlyGuard from '../ViewOnlyGuard';
import { PortalLineText } from '../clients/parts';
import { classicLine, conversationDef, conversationOf, findScreens, type ClassicPlace, type ConversationDef, type ConversationId } from '../../lib/projectConversations';
import { buildStory, groupStory, latestOf, noteHomes, noteKey, storyFor, whenShort, type StoryItem } from '../../lib/projectThread';
import { buildThread, SOURCE_LABEL, EMPTY_RECORDS, type ThreadRecords, type ThreadSource } from '../../lib/clientThread';
import { noteLine, type FollowUpLine } from '../../lib/clientCompose';
import { portalStatus, portalStatusForViewer, type PortalVisit } from '../../lib/portalVisits';
import type { ClientMoney } from '../../lib/clientMoney';
import type { TemplateId } from '../../lib/clientNextMove';
import { loadClientRecords } from '../../services/clientThreadService';
import { watchClientVisits } from '../../services/portalVisitsService';
import { logFollowUp } from '../../services/opsDeskService';
import type { StudioJumpItem } from '../projectNav/StudioJump';
import '../projectHeader/projectHeader.css';

/*
  THE CONVERSATIONS WORKSPACE (owner, 27 Nov 2026; DESIGN.md "Project
  workspace: conversations"). The same project as the Classic workspace, laid
  out like the Clients screen:

    - one bar on top: Projects › the project on the left, the studio's sections on the right;
    - left: the project's conversations (lib/projectConversations), each with
      its latest line, like a chat list;
    - middle: the chosen conversation's story (lib/projectThread), each item
      with an Open button for its screen; Whole project adds the next step and
      Up next, and the composer writes to the follow-up log as Clients does;
    - right: the project card (At a glance, Client portal, Timeline, Details,
      Journey).

  Every screen opens in a full-screen window over all of it (the modal
  pattern: phd-scrim, phd-pop). The window draws the screen exactly as the
  Classic workspace does (the same children), so a fix lands in both. Closing
  the window, Esc or "Back to …" returns to the conversation.
*/

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

const CONV_ICON: Record<ConversationId, React.ElementType> = {
  whole: Sparkles, chat: MessageCircle, money: Wallet, boq: Table, docs: FolderOpen,
  design: PenTool, site: HardHat, plan: CalendarRange, brief: MapPin,
};

/*
  Each icon has a motion of its own that fits what it shows (conversations.css
  .cvw-ic, owner 27 Nov 2026): it plays on hover, and once when its
  conversation opens.
*/
const CONV_MOVE: Record<ConversationId, string> = {
  whole: 'twinkle', chat: 'talk', money: 'flip', boq: 'shuffle', docs: 'open', design: 'draw', site: 'tap', plan: 'page', brief: 'drop',
};
const SOURCE_MOVE: Record<ThreadSource, string> = {
  sent: 'talk', proposals: 'open', portal: 'spin', payments: 'flip', design: 'draw', site: 'tap', team: 'draw',
};

/* The sticker faces (DESIGN.md "Stickers"), as on Clients: gold for a signature, rose for unpaid, amber for no reply. */
const STICKER: Record<'gold' | 'bad' | 'warn', React.CSSProperties> = {
  gold: { color: '#8C6D2A', background: 'linear-gradient(180deg, #fffbeb, #f6ead0)' },
  bad: { color: '#be123c', background: 'linear-gradient(180deg, #fff1f2, #ffe4e6)' },
  warn: { color: '#b45309', background: 'linear-gradient(180deg, #fffbeb, #fef3c7)' },
};

const SOURCE_ICON: Record<ThreadSource, { icon: React.ElementType; tone: Tone }> = {
  sent: { icon: MessageCircle, tone: 'brand' },
  proposals: { icon: FileText, tone: 'brand' },
  portal: { icon: Globe, tone: 'brand' },
  payments: { icon: IndianRupee, tone: 'good' },
  design: { icon: PenTool, tone: 'slate' },
  site: { icon: HardHat, tone: 'warn' },
  team: { icon: NotebookPen, tone: 'slate' },
};

export interface StageRow { stage: number; label: string; state: 'done' | 'now' | 'todo'; first?: string | null }
export interface UpNextAction { label: string; run: () => void; primary?: boolean }
/** A row of Up next, as the Hub ranks them: its badge ("Blocker", "Your sign-off", "Due") and its own actions. */
export interface UpNextRow { id: string; title: string; text?: string; badge?: string; actions?: UpNextAction[]; route?: string | null }

export interface ConversationsWorkspaceProps {
  projectId: string;
  projectContext: any;
  activeTab: string;
  setActiveTab: (route: string) => void;
  /** The home route: Whole project (no window). */
  homeRoute: string;
  /** What the home route's screen is called when opened in the window ("Hub"; a Designer's "Drawings"). */
  hubLabel: string;
  conversations: ConversationDef[];
  labelOf: (route: string) => string;
  /** One line on what a screen is for, for the "Start here" buttons. */
  aboutOf?: (route: string) => string;
  /** Notes waiting on this person, by screen (lib/notify). */
  needsOf: (route: string) => number;
  stages: StageRow[];
  currentStage: number;
  journey: { done: number; total: number; pct: number; next: string | null; upNext: UpNextRow[]; /** Rows beyond the three shown: they are on the Hub. */ more?: number };
  /** The client's side of the money, already without amounts where they are hidden; null when there is no schedule. */
  money: ClientMoney | null;
  seesMoney: boolean;
  /** May write to the follow-up log (every studio role but Viewer). */
  canLog: boolean;
  /** Sees portal visits and the lead (Owner, Admin, Ops Director, Super Admin). */
  seesVisits: boolean;
  tenantId: string;
  me: { email: string; name: string };
  statusLabel: string;
  onStatusClick?: () => void;
  desks: StudioJumpItem[];
  onLeaveProject: (target?: string) => void;
  /** The Hide figures eye, for those who hold finance. */
  showHideFigures: boolean;
  /** The screen's look-only guard (a Designer, Client Relations). */
  viewOnly: boolean;
  /** Terminated or a dispute open: the strip Classic shows under its bar. */
  alertBar?: React.ReactNode;
  /** The person's own switch back to Classic, when the studio lets them choose. */
  onUseClassic?: () => void;
  /** Where each screen sits in the Classic sidebar, for "Where did it go?" and the window's signpost. */
  classic?: ClassicPlace[];
  /** The screen for the active route, drawn as Classic draws it. */
  children: React.ReactNode;
}

export default function ConversationsWorkspace(p: ConversationsWorkspaceProps) {
  const ctx = p.projectContext || {};
  const name = ctx.name || 'Untitled project';
  const clientName = ctx.clientName || '';
  const now = useMemo(() => Date.now(), [p.activeTab]);

  /* Which conversation is open. A screen opened by a link opens its conversation behind the window. */
  const [conv, setConv] = useState<ConversationId>(() => conversationOf(p.activeTab) || 'whole');
  useEffect(() => { setConv(conversationOf(p.activeTab) || 'whole'); }, [p.projectId]);
  useEffect(() => { const c = conversationOf(p.activeTab); if (c && c !== conv) setConv(c); }, [p.activeTab]);
  const shown = p.conversations.find((c) => c.id === conv) || p.conversations[0];

  /* The Hub itself stays one click away from Whole project, in the window. */
  const [hubOpen, setHubOpen] = useState(false);
  useEffect(() => { if (p.activeTab !== p.homeRoute) setHubOpen(false); }, [p.activeTab, p.homeRoute]);
  const windowRoute = p.activeTab !== p.homeRoute ? p.activeTab : hubOpen ? p.homeRoute : null;
  const closeWindow = () => { setHubOpen(false); if (p.activeTab !== p.homeRoute) p.setActiveTab(p.homeRoute); };
  const open = (route: string | null) => {
    if (!route) return;
    if (route === p.homeRoute) { setHubOpen(true); return; }
    p.setActiveTab(route);
  };

  /* The project's records, read once per project (the Clients thread's loader, for this one project). */
  const [records, setRecords] = useState<ThreadRecords | null>(null);
  useEffect(() => {
    let live = true;
    setRecords(null);
    if (!p.tenantId) { setRecords(EMPTY_RECORDS); return; }
    loadClientRecords(p.tenantId, [{ id: p.projectId, name, leadId: ctx.leadId || null }], { leads: p.seesVisits })
      .then((r) => { if (live) setRecords(r); })
      .catch(() => { if (live) setRecords(EMPTY_RECORDS); });
    return () => { live = false; };
  }, [p.projectId, p.tenantId]);
  const [visits, setVisits] = useState<PortalVisit[]>([]);
  useEffect(() => {
    if (!p.seesVisits) { setVisits([]); return; }
    return watchClientVisits([p.projectId], setVisits);
  }, [p.projectId, p.seesVisits]);

  const story = useMemo(() => {
    if (!records) return [] as StoryItem[];
    const entries = buildThread({
      clientName, projects: [{ id: p.projectId, name, context: ctx }],
      money: { [p.projectId]: p.money }, records, portalVisits: visits, now,
    });
    return buildStory(entries, ctx.history, p.projectId, noteHomes(records.followUps as any));
  }, [records, visits, p.money, ctx, p.projectId, now]);

  const glance = useProjectGlance(p.projectId, p.tenantId, ctx);
  const portalLine = useMemo(
    () => (p.seesVisits ? portalStatus({ context: ctx }, visits, now) : portalStatusForViewer({ context: ctx })),
    [ctx, visits, now, p.seesVisits],
  );

  /* A line to the project's follow-up log (lib/clientCompose), in this person's name: it joins the story at once. */
  const writeLine = async (line: FollowUpLine) => {
    const f = await logFollowUp({
      tenantId: p.tenantId, projectId: p.projectId, projectName: name, me: p.me,
      channel: line.channel, outcome: line.outcome, note: line.note, subject: line.subject, next: null,
    } as any);
    setRecords((prev) => ({ ...(prev || EMPTY_RECORDS), followUps: [f as any, ...((prev || EMPTY_RECORDS).followUps)] }));
  };

  /* S, M and D record from Whole project, as on the Hub; never while typing or with a window open. */
  useEffect(() => {
    if (conv !== 'whole' || windowRoute) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (t && typeof t.closest === 'function' && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      if (k === 's' || k === 'm') open('site-meetings');
      else if (k === 'd') open('record-decision');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [conv, windowRoute]);

  /* Said once, the first time someone sees this view. */
  const [welcome, setWelcome] = useState(() => { try { return !window.localStorage.getItem('studiodesk.projectView.welcomed'); } catch { return false; } });
  const dismissWelcome = () => { setWelcome(false); try { window.localStorage.setItem('studiodesk.projectView.welcomed', '1'); } catch { /* private window */ } };
  /* The short tour: offered with the welcome, and again from "Show me around" on top. */
  const [tour, setTour] = useState(false);
  const tourFrom = useRef<ConversationId>('whole');
  const beginTour = () => { tourFrom.current = conv; setTour(true); };
  const startTour = () => { dismissWelcome(); beginTour(); };
  /* Step 2 shows the Open buttons, so it opens a conversation that has some; the tour ends where it began. */
  const tourStep = (n: number) => {
    if (n === 1 && !shown.routes.length) { const c = p.conversations.find((x) => x.routes.length); if (c) setConv(c.id); }
    else if (n !== 1) setConv(tourFrom.current);
  };
  const endTour = () => { setTour(false); setConv(tourFrom.current); };
  const classic = p.classic || [];
  const classicOf = (route: string) => classic.find((c) => c.route === route) || null;

  /* A ripple spreads from where you click anything marked data-ripple (conversations.css .cvw-ripple). */
  const ripple = (e: React.PointerEvent) => {
    const host = (e.target as HTMLElement | null)?.closest?.('[data-ripple]') as HTMLElement | null;
    if (!host || (host as HTMLButtonElement).disabled) return;
    try { if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return; } catch { /* old browser */ }
    const r = host.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'cvw-ripple';
    dot.setAttribute('aria-hidden', 'true');
    Object.assign(dot.style, { width: `${d}px`, height: `${d}px`, left: `${e.clientX - r.left - d / 2}px`, top: `${e.clientY - r.top - d / 2}px` });
    host.appendChild(dot);
    window.setTimeout(() => dot.remove(), 700);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 min-w-0" onPointerDown={ripple}>
      <ProjectBar ctx={ctx} name={name} statusLabel={p.statusLabel} onStatusClick={p.onStatusClick}
        onPortal={p.conversations.some((c) => c.routes.includes('client-portal')) ? () => open('client-portal') : undefined}
        desks={p.desks} onLeave={p.onLeaveProject} onUseClassic={p.onUseClassic} showHideFigures={p.showHideFigures} onTour={beginTour} />
      {p.alertBar}
      {welcome && (
        <div className="mx-3 sm:mx-5 mb-2 flex items-center gap-3 rounded-xl border border-[#3D52A0]/20 bg-[#3D52A0]/10 px-4 py-2.5 text-xs text-slate-700 hud-panel-in">
          <Info className="w-4 h-4 text-[#3D52A0] shrink-0" aria-hidden />
          <span className="flex-1 min-w-0">
            <b className="text-slate-800">This is the new project view.</b> Pick a conversation on the left (Money, BOQ, Documents…); every screen opens full size and closes back here.
            {p.onUseClassic && ' You can go back to Classic from the top bar at any time.'}
          </span>
          <Button size="sm" variant="primary" icon={Compass} onClick={startTour}>Show me around</Button>
          <Button size="sm" variant="quiet" onClick={dismissWelcome}>Got it</Button>
        </div>
      )}

      <div className="flex-1 min-h-0 mx-3 sm:mx-5 mb-3 sm:mb-5 grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hud-panel-in">
        <ConversationList conversations={p.conversations} conv={shown.id} story={story} now={now} needsOf={p.needsOf}
          money={p.money} journey={p.journey} onPick={setConv}
          findScreen={(q) => findScreens(q, p.conversations, (r) => (r === p.homeRoute ? p.hubLabel : p.labelOf(r)), classic, p.homeRoute)}
          onOpenScreen={(c, r) => { setConv(c); open(r); }} />
        <section className="flex flex-col min-h-0 min-w-0 border-l border-slate-100" aria-label={shown.name}>
          <ThreadHead conv={shown} labelOf={p.labelOf} onOpen={open} onPickMobile={setConv} conversations={p.conversations} />
          <Thread key={shown.id} conv={shown.id} routes={shown.routes} aboutOf={p.aboutOf || (() => '')} story={storyFor(story, shown.id)} now={now} loading={!records} onOpen={open}
            labelOf={p.labelOf} visible={(r) => p.conversations.some((c) => c.routes.includes(r))}
            pinned={shown.id === 'whole' ? (
              <UpNext stage={p.currentStage} stages={p.stages} journey={p.journey} hubLabel={p.hubLabel} onHub={() => setHubOpen(true)}
                onMatrix={p.conversations.some((c) => c.routes.includes('project-journey')) ? () => open('project-journey') : undefined}
                onOpen={open} labelOf={p.labelOf} />
            ) : null}
            tail={null} />
          <Composer conv={shown.id} convName={shown.name} canLog={p.canLog} onWrite={writeLine}
            onRecord={shown.id === 'whole' ? open : undefined} />
        </section>
        <ProjectCard ctx={ctx} money={p.money} seesMoney={p.seesMoney} journey={p.journey} stages={p.stages} glance={glance}
          portalLine={portalLine} onOpen={open} has={(r) => p.conversations.some((c) => c.routes.includes(r))} />
      </div>

      {windowRoute && (
        <ScreenWindow route={windowRoute} isHub={windowRoute === p.homeRoute} hubLabel={p.hubLabel} projectName={name} labelOf={p.labelOf}
          conversations={p.conversations} backTo={shown} viewOnly={p.viewOnly} onOpen={open} onClose={closeWindow} classic={classicOf(windowRoute)}>
          {p.children}
        </ScreenWindow>
      )}
      {tour && !windowRoute && <Tour canClassic={!!p.onUseClassic} onStep={tourStep} onDone={endTour} />}
    </div>
  );
}

/* ───────────── the way out ───────────── */

/*
  ONE BAR ON TOP (owner, 27 Nov 2026). Left, where you are: "Projects ›" (the
  way back) and the project's name, status and client line. Right, the
  studio's sections as colour-filled icon tiles (owner: "can we just have
  color filled icons instead and when hovered user will understand where to
  navigate?"): named, iconed and ordered as on the studio bar, brand tiles
  that fill solid on hover with the name and a line on what is there (the
  Classic bar's tooltip, .psb-tip). Projects, where you are, stays filled.
  No "All projects" item (owner: not right business-wise).
*/
type WayItem = { key: string; label: string; sub: string; icon: React.ElementType; move: string; go: () => void; show?: string };

function ProjectBar({ ctx, name, statusLabel, onStatusClick, onPortal, desks, onLeave, onUseClassic, showHideFigures, onTour }: {
  ctx: any; name: string; statusLabel: string; onStatusClick?: () => void; onPortal?: () => void;
  desks: StudioJumpItem[]; onLeave: (t?: string) => void; onUseClassic?: () => void; showHideFigures: boolean; onTour: () => void;
}) {
  const sub = [ctx.clientName || 'No client yet', ctx.location, ctx.area ? `${ctx.area} sq ft` : ''].filter(Boolean).join(' · ');
  const initials = (name.match(/[A-Za-z]+/g) || ['P']).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  const desk = (route: string) => desks.find((d) => d.route === route);
  const asItem = (d: StudioJumpItem | undefined, move: string): WayItem[] =>
    d ? [{ key: d.route, label: d.label, sub: d.sub, icon: d.icon, move, go: () => onLeave(d.route), show: 'hidden md:inline-flex' }] : [];
  const sections: WayItem[] = [
    { key: 'home', label: 'Home', sub: 'The studio’s day at a glance', icon: Home, move: 'bounce', go: () => onLeave('home') },
    { key: 'projects', label: 'Projects', sub: 'Back to all your projects', icon: Building2, move: 'back', go: () => onLeave('projects') },
    ...asItem(desk('design-review'), 'draw'),
    ...asItem(desk('ops-desk'), 'go'),
    ...asItem(desk('people'), 'talk'),
    { key: 'clients', label: 'Clients', sub: 'Every client and what they need', icon: Users, move: 'talk', go: () => onLeave('clients'), show: 'hidden sm:inline-flex' },
    ...asItem(desk('admin-templates-bank'), 'shuffle'),
    /* Any other desk the studio adds later still appears. */
    ...desks.filter((d) => !['design-review', 'ops-desk', 'people', 'admin-templates-bank'].includes(d.route)).flatMap((d) => asItem(d, 'go')),
  ];
  const helpers: WayItem[] = [
    ...(onPortal ? [{ key: 'portal', label: 'Client portal', sub: 'See what the client sees', icon: Globe, move: 'spin', go: onPortal, show: 'hidden sm:inline-flex' }] : []),
    { key: 'tour', label: 'Show me around', sub: 'A short tour of this view', icon: Compass, move: 'spin', go: onTour, show: 'hidden sm:inline-flex' },
  ];

  /* The name under a tile, as the Classic bar shows it (StudioJump). */
  const [tip, setTip] = useState<null | { x: number; y: number; it: WayItem }>(null);
  const show = (it: WayItem) => (e: React.SyntheticEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.bottom + 8, it });
  };
  const hide = () => setTip(null);

  const tile = (it: WayItem, i: number) => {
    const Icon = it.icon;
    const here = it.key === 'projects';
    return (
      <button key={it.key} type="button" data-way={it.key} data-ripple aria-label={it.label} aria-current={here ? 'page' : undefined}
        onClick={() => { hide(); it.go(); }} onMouseEnter={show(it)} onMouseLeave={hide} onFocus={show(it)} onBlur={hide}
        style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}
        className={cx('cvw-hot cvw-tile hud-rise w-9 h-9 shrink-0 grid place-items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/40',
          here ? 'is-here text-white' : 'bg-[#3D52A0]/10 text-[#3D52A0]', it.show)}>
        <span className="cvw-ic" data-m={it.move}><Icon className="w-[18px] h-[18px]" aria-hidden /></span>
      </button>
    );
  };

  return (
    <div className="relative h-14 shrink-0 bg-white border-b border-slate-200 px-3 sm:px-5 flex items-center gap-3 min-w-0">
      {/* Left: where you are. */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="w-9 h-9 rounded-xl grid place-items-center text-white text-xs font-bold bg-[#3D52A0] shrink-0">{initials}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <button type="button" onClick={() => onLeave('projects')} aria-label="Back to Projects" title="Back to all projects"
              className="cvw-hot shrink-0 inline-flex items-center gap-0.5 rounded-md px-1 -mx-1 text-[13px] font-semibold text-slate-500 hover:text-[#3D52A0] hover:bg-[#3D52A0]/10">
              Projects<Crumb className="cvw-arrow w-3.5 h-3.5 text-slate-400" aria-hidden />
            </button>
            <h1 className="text-base font-bold text-slate-800 tracking-tight truncate">{name}</h1>
            <button type="button" onClick={onStatusClick} disabled={!onStatusClick} className="shrink-0 disabled:cursor-default" title={onStatusClick ? 'Change the project status' : undefined}>
              <Chip tone="brand">{statusLabel}</Chip>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 truncate">{sub}</p>
        </div>
      </div>

      {/* Right: the studio's sections, then this view's helpers. */}
      <nav aria-label="Studio" data-tour="way" className="flex items-center gap-1.5 shrink-0">
        {sections.map((it, i) => tile(it, i))}
        <span className="w-px h-6 bg-slate-200 mx-1 shrink-0 hidden sm:block" aria-hidden />
        {helpers.map((it, i) => tile(it, sections.length + i))}
      </nav>
      {showHideFigures && <HideFiguresButton />}
      {onUseClassic && (
        <Button size="sm" variant="secondary" className="cvw-hot shrink-0" data-ripple onClick={onUseClassic} title="Your own choice: the studio's setting stays as it is">Use Classic view</Button>
      )}
      {tip && createPortal(
        <div role="tooltip" className="fixed z-[320] pointer-events-none -translate-x-1/2" style={{ left: tip.x, top: tip.y }}>
          <div className="psb-tip" style={{ position: 'static' }}>{tip.it.label}<small>{tip.it.sub}</small></div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ───────────── the list ───────────── */

function ConversationList({ conversations, conv, story, now, needsOf, money, journey, onPick, findScreen, onOpenScreen }: {
  conversations: ConversationDef[]; conv: ConversationId; story: StoryItem[]; now: number; needsOf: (r: string) => number;
  money: ClientMoney | null; journey: ConversationsWorkspaceProps['journey']; onPick: (c: ConversationId) => void;
  findScreen: (q: string) => ReturnType<typeof findScreens>; onOpenScreen: (c: ConversationId, route: string) => void;
}) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const list = term ? conversations.filter((c) => c.name.toLowerCase().includes(term) || c.about.toLowerCase().includes(term)) : conversations;
  /* "Where did it go?": a screen found by today's name, its Classic name or its Classic stage. */
  const screens = term ? findScreen(term) : [];
  const owed = money?.milestones.find((m) => m.status === 'invoiced' && !m.disputed);
  const previewOf = (c: ConversationDef): { text: string; at: number | null } => {
    if (c.id === 'whole' && journey.next) return { text: `Next: ${journey.next}`, at: null };
    if (c.id === 'money' && owed) return { text: `${owed.name} invoiced`, at: null };
    const last = latestOf(story, c.id);
    return last ? { text: last.text, at: last.at } : { text: c.about, at: null };
  };
  return (
    <aside data-tour="list" className="hidden md:flex flex-col min-h-0 bg-white" aria-label="This project's conversations">
      <div className="p-3 border-b border-slate-100">
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 focus-within:ring-2 focus-within:ring-[#3D52A0]/30">
          <Search className="w-4 h-4 text-slate-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a screen or old name" aria-label="Find a conversation or a screen" className="flex-1 min-w-0 text-[13px] outline-none bg-transparent" />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Clear the search" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" aria-hidden /></button>}
        </label>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {list.map((c, i) => {
          const Icon = CONV_ICON[c.id];
          const pv = previewOf(c);
          const needs = c.routes.reduce((s, r) => s + needsOf(r), 0) > 0;
          const on = c.id === conv;
          return (
            <button key={c.id} type="button" data-ripple onClick={() => onPick(c.id)} aria-current={on ? 'true' : undefined}
              className={cx('cvw-hot w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-slate-100 hud-row-in', !on && 'hover:bg-slate-50')}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
              {/* The highlight slides to the conversation you pick, as the sidebar's does to the screen you are on. */}
              {on && <motion.span layoutId="conv-on" aria-hidden className="absolute inset-0 bg-[#3D52A0]/10 shadow-[inset_3px_0_0_#3D52A0]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              {/* The conversation you are in fills its disc; it pops and its icon plays as you pick it. */}
              <span key={on ? 'on' : 'off'} className={cx('cvw-disc relative w-9 h-9 rounded-full grid place-items-center shrink-0', on ? 'is-pop bg-[#3D52A0] text-white' : 'bg-[#3D52A0]/10 text-[#3D52A0]')}>
                <span className={cx('cvw-ic', on && 'is-play')} data-m={CONV_MOVE[c.id]}><Icon className="w-[18px] h-[18px]" aria-hidden /></span>
              </span>
              <span className="cvw-text relative min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="flex-1 min-w-0 truncate text-[13px] font-bold text-slate-800">{c.name}</span>
                  {pv.at && <span className="text-[11px] text-slate-400 whitespace-nowrap">{whenShort(pv.at, now)}</span>}
                </span>
                <span className="flex items-center gap-1.5 mt-0.5">
                  <span className="flex-1 min-w-0 truncate text-xs text-slate-500">{pv.text}</span>
                  {needs && <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 animate-[psb-attn_1.8s_infinite] motion-reduce:animate-none" title="Needs you" />}
                </span>
              </span>
            </button>
          );
        })}
        {screens.length > 0 && (
          <div className="hud-panel-in" role="group" aria-label="Screens">
            <p className="px-4 pt-3 pb-1 text-xs font-bold text-slate-500">Screens</p>
            {screens.map((m, i) => {
              const renamed = m.classic && m.classic.label !== m.label;
              return (
                <button key={m.route} type="button" data-ripple onClick={() => onOpenScreen(m.conv.id, m.route)}
                  className="cvw-hot w-full flex items-start gap-3 px-3 py-2.5 text-left border-b border-slate-100 hover:bg-slate-50 hud-row-in"
                  style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                  <span className="cvw-disc w-8 h-8 rounded-lg bg-slate-100 text-slate-500 grid place-items-center shrink-0"><span className="cvw-ic" data-m="go"><ArrowRight className="w-4 h-4" aria-hidden /></span></span>
                  <span className="cvw-text min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-slate-800">{m.label}</span>
                    <span className="block text-xs text-slate-500">
                      In {m.conv.name}
                      {m.classic && <> · was {renamed ? <>“{m.classic.label}” </> : ''}in {m.classic.where || 'the top of the sidebar'}</>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!list.length && !screens.length && <p className="px-4 py-6 text-xs text-slate-500">Nothing matches “{q}”. Try a screen’s name, such as Money or Drawings.</p>}
      </div>
    </aside>
  );
}

/* ───────────── the conversation ───────────── */

function ThreadHead({ conv, labelOf, onOpen, onPickMobile, conversations }: {
  conv: ConversationDef; labelOf: (r: string) => string; onOpen: (r: string) => void;
  onPickMobile: (c: ConversationId) => void; conversations: ConversationDef[];
}) {
  const Icon = CONV_ICON[conv.id];
  return (
    <div data-tour="open" className="shrink-0 border-b border-slate-100">
      <div className="flex items-center gap-3 px-4 py-3">
        <span key={conv.id} className="cvw-disc is-pop w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0">
          <span className="cvw-ic is-play" data-m={CONV_MOVE[conv.id]}><Icon className="w-[18px] h-[18px]" aria-hidden /></span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-slate-800 truncate">{conv.name}</h2>
          <p className="text-xs text-slate-500 truncate">{conv.about}</p>
        </div>
        {/* Below 768px the list is a choice here. */}
        <select className={cx(INPUT, 'md:hidden !w-auto')} value={conv.id} onChange={(e) => onPickMobile(e.target.value as ConversationId)} aria-label="Conversation">
          {conversations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {conv.routes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
          <span className="text-xs font-semibold text-slate-500 mr-1">Open:</span>
          {conv.routes.map((r, i) => (
            <Button key={r} size="sm" variant={i === 0 ? 'primary' : 'secondary'} className="cvw-hot cvw-lift" data-ripple onClick={() => onOpen(r)}>{labelOf(r)}</Button>
          ))}
        </div>
      )}
    </div>
  );
}

const SHOW = 25;

const Thread: React.FC<{
  conv: ConversationId; routes: string[]; aboutOf: (r: string) => string; story: StoryItem[]; now: number; loading: boolean; onOpen: (r: string) => void;
  labelOf: (r: string) => string; visible: (r: string) => boolean; pinned: React.ReactNode; tail: React.ReactNode;
}> = ({ conv, routes, aboutOf, story, now, loading, onOpen, labelOf, visible, pinned, tail }) => {
  const [all, setAll] = useState(false);
  const items = all ? story : story.slice(-SHOW);
  const groups = groupStory(items, now);
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [story.length, conv]);
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {pinned}
      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
        {story.length > SHOW && !all && (
          <button type="button" onClick={() => setAll(true)} className="self-center text-xs font-bold text-[#3D52A0] px-3 py-1.5 rounded-lg hover:bg-[#3D52A0]/10">
            Show earlier ({story.length - SHOW})
          </button>
        )}
        {loading && <p className="text-xs text-slate-500 self-center py-6">Reading this project’s story…</p>}
        {!loading && !story.length && conv === 'whole' && (
          <EmptyState icon={Sparkles} title="Nothing has happened on this project yet" text="Start with Up next above. Everything that happens will appear here, newest at the bottom." />
        )}
        {/* An empty conversation says where to click: its screens, as big buttons with what each is for. */}
        {!loading && !story.length && conv !== 'whole' && routes.length > 0 && (
          <StartHere conv={conv} routes={routes} labelOf={labelOf} aboutOf={aboutOf} onOpen={onOpen} />
        )}
        {groups.map((g) => (
          <React.Fragment key={g.group + g.items[0].id}>
            <div className="self-center my-1 px-3 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-500">{g.group}</div>
            {g.items.map((it, i) => <StoryRow key={it.id} it={it} delay={Math.min(i, 12) * 35} onOpen={onOpen} labelOf={labelOf} visible={visible} />)}
          </React.Fragment>
        ))}
        {tail}
      </div>
    </div>
  );
}

const StartHere: React.FC<{ conv: ConversationId; routes: string[]; labelOf: (r: string) => string; aboutOf: (r: string) => string; onOpen: (r: string) => void }> = ({ conv, routes, labelOf, aboutOf, onOpen }) => {
  const Icon = CONV_ICON[conv];
  return (
    <div className="py-2">
      <p className="text-[13px] font-bold text-slate-800">Nothing has happened here yet. Start here:</p>
      <p className="text-xs text-slate-500 mb-3">Open a screen below. What you do there will appear in this conversation.</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {routes.map((r, i) => (
          <button key={r} type="button" data-ripple onClick={() => onOpen(r)}
            className="cvw-hot cvw-lift hud-row-in text-left flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 hover:border-[#3D52A0]"
            style={{ animationDelay: `${i * 40}ms` }}>
            <span className={cx('cvw-disc w-11 h-11 rounded-xl grid place-items-center shrink-0', i === 0 ? 'bg-[#3D52A0] text-white' : 'bg-[#3D52A0]/10 text-[#3D52A0]')}>
              <span className="cvw-ic" data-m={CONV_MOVE[conv]}><Icon className="w-5 h-5" aria-hidden /></span>
            </span>
            <span className="cvw-text min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-slate-800">{labelOf(r)}</span>
              {aboutOf(r) && <span className="block text-xs text-slate-500 line-clamp-2">{aboutOf(r)}</span>}
            </span>
            <ArrowRight className="cvw-arrow w-4 h-4 text-[#3D52A0] shrink-0" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
};

const StoryRow: React.FC<{
  it: StoryItem; delay: number; onOpen: (r: string) => void; labelOf: (r: string) => string; visible: (r: string) => boolean;
}> = ({ it, delay, onOpen, labelOf, visible }) => {
  const openBtn = it.route && visible(it.route) ? (
    <button type="button" data-ripple onClick={() => onOpen(it.route!)} className="cvw-hot mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-[#3D52A0]/10 text-[#3D52A0] hover:bg-[#3D52A0] hover:text-white">
      Open {labelOf(it.route)}<ArrowRight className="cvw-arrow w-3 h-3" aria-hidden />
    </button>
  ) : null;
  const style = { animationDelay: `${delay}ms` };
  if (it.kind === 'sticker') {
    const slap = (e: React.MouseEvent<HTMLElement>) => { const el = e.currentTarget; el.classList.remove('slap'); void el.offsetWidth; el.classList.add('slap'); };
    return (
      <div className="pj self-center py-1">
        <span role="img" tabIndex={0} className="pj-stk" style={{ ['--r' as any]: '-3deg' }} aria-label={it.text} data-tip={it.text} onClick={slap}>
          <span className="pj-face !text-[11px] !px-2.5 !py-1" style={STICKER[it.tone || 'gold']}>{it.text}</span><span className="pj-fold" />
        </span>
      </div>
    );
  }
  if (it.kind === 'sent') {
    return (
      <div className="self-end max-w-[78%] rounded-2xl rounded-br-md bg-[#3D52A0] text-white px-3.5 py-2.5 text-[13px] hud-row-in" style={style}>
        <p className="whitespace-pre-wrap">{it.text}</p>
        <p className="mt-1 text-[11px] text-white/75">{[it.meta, it.template].filter(Boolean).join(' · ')}</p>
      </div>
    );
  }
  if (it.kind === 'said') {
    return (
      <div className="self-start max-w-[78%] rounded-2xl rounded-bl-md bg-white border border-dashed border-slate-300 px-3.5 py-2.5 text-[13px] italic text-slate-700 hud-row-in" style={style}>
        <p>“{it.text}”</p>
        {it.meta && <p className="mt-1 text-[11px] not-italic text-slate-400">{it.meta}</p>}
      </div>
    );
  }
  const src = SOURCE_ICON[it.source || 'team'];
  const Icon = src.icon;
  return (
    <div className={cx('cvw-hot cvw-lift max-w-[82%] flex gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 hud-row-in', it.side === 'client' ? 'self-start' : 'self-end')} style={style}>
      <span className="cvw-disc w-8 h-8 rounded-lg bg-slate-100 text-slate-500 grid place-items-center shrink-0"><span className="cvw-ic" data-m={SOURCE_MOVE[it.source || 'team']}><Icon className="w-4 h-4" aria-hidden /></span></span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-slate-800">{it.text}</p>
        {it.detail && <p className="text-xs text-slate-500">{it.detail}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
          {it.source === 'payments' && <Chip tone="good">{SOURCE_LABEL.payments}</Chip>}
          {new Date(it.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          {it.meta ? ` · ${it.meta}` : ''}
        </p>
        {openBtn}
      </div>
    </div>
  );
}

/*
  Whole project's one card on top: where the project is, and the three things
  to do next, one button each. It replaced a "Next" card and an Up next list
  that said the same first step twice (owner, 27 Nov 2026: "too busy").
*/
function UpNext({ stage, stages, journey, hubLabel, onHub, onMatrix, onOpen, labelOf }: {
  stage: number; stages: StageRow[]; journey: ConversationsWorkspaceProps['journey']; hubLabel: string;
  onHub: () => void; onMatrix?: () => void; onOpen: (r: string) => void; labelOf: (r: string) => string;
}) {
  const stageName = stages.find((s) => s.stage === stage)?.label || '';
  const rows = journey.upNext;
  return (
    <div className="shrink-0 mx-4 mt-3 rounded-2xl border border-slate-200 bg-white overflow-hidden hud-panel-in">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100">
        <p className="min-w-0 flex-1 text-xs text-slate-500 truncate">
          <b className="text-slate-700">Stage {stage} of 6{stageName ? ` · ${stageName}` : ''}</b> · {journey.done} of {journey.total} steps done
        </p>
        {onMatrix && <Button size="sm" variant="quiet" className="cvw-hot" data-ripple onClick={onMatrix}>Ops Matrix</Button>}
        <Button size="sm" variant="quiet" icon={LayoutGrid} className="cvw-hot" data-ripple onClick={onHub}>Open {hubLabel === 'Hub' ? 'the Hub' : hubLabel}</Button>
      </div>
      <div className="px-4 pt-2.5 pb-1"><h3 className="text-[15px] font-bold text-slate-800">Up next</h3></div>
      {!rows.length && <p className="px-4 pb-3 text-xs text-slate-500">Nothing needs you on this project right now.</p>}
      {rows.map((r, i) => (
        <div key={r.id} className="hud-row-in flex items-center gap-3 px-4 py-2 border-t border-slate-100 first:border-t-0" style={{ animationDelay: `${120 + i * 40}ms` }}>
          <p className="min-w-0 flex-1 flex items-center gap-2" title={r.text || undefined}>
            <span className="text-[13px] font-semibold text-slate-800 truncate">{r.title}</span>
            {r.badge && <Chip tone={r.badge === 'Blocker' ? 'bad' : 'brand'}>{r.badge}</Chip>}
          </p>
          {(r.actions || []).map((a) => (
            <Button key={a.label} size="sm" variant={a.primary ? 'primary' : 'secondary'} className="cvw-hot cvw-lift" data-ripple onClick={a.run}>{a.label}</Button>
          ))}
          {!r.actions?.length && r.route && <Button size="sm" variant="secondary" className="cvw-hot cvw-lift" data-ripple onClick={() => onOpen(r.route!)}>Open {labelOf(r.route)}</Button>}
        </div>
      ))}
      {!!journey.more && (
        <button type="button" data-ripple onClick={onHub} className="cvw-hot w-full text-left px-4 py-2 border-t border-slate-100 text-xs font-bold text-[#3D52A0] hover:bg-[#3D52A0]/5">
          {journey.more} more on the Hub →
        </button>
      )}
    </div>
  );
}

/* ───────────── the composer ───────────── */

/*
  The foot of a conversation: Record (Whole project) and a note for the team.
  A note is a line in the project's follow-up log, so it is on the Ops Desk too.
  It stays in the conversation it was written in (lib/projectThread noteHomes).
  Messages to the client are written on the Messages screen and on Clients, not
  here (owner, 27 Nov 2026).
*/
function Composer({ conv, convName, canLog, onWrite, onRecord }: {
  conv: ConversationId; convName: string; canLog: boolean;
  onWrite: (l: FollowUpLine) => Promise<void>; onRecord?: (r: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  useEffect(() => { setOpen(false); setText(''); setState('idle'); }, [conv]);
  if (!canLog && !onRecord) return null;
  const save = async () => {
    setState('saving');
    try {
      await onWrite({ ...noteLine(text), subject: { kind: 'general', key: noteKey(conv), label: `Note · ${convName}` } });
      setState('saved'); setText(''); setOpen(false);
    } catch { setState('failed'); }
  };
  return (
    <div className="shrink-0 border-t border-slate-200 px-4 py-2.5 bg-white flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {onRecord && (
          <>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">Record</span>
            <Button size="sm" variant="secondary" icon={HardHat} onClick={() => onRecord('site-meetings')} aria-keyshortcuts="S" className="cvw-hot cvw-lift" data-ripple>Site visit</Button>
            <Button size="sm" variant="secondary" icon={Users} onClick={() => onRecord('site-meetings')} aria-keyshortcuts="M" className="cvw-hot cvw-lift" data-ripple>Meeting</Button>
            <Button size="sm" variant="secondary" icon={Scale} onClick={() => onRecord('record-decision')} aria-keyshortcuts="D" className="cvw-hot cvw-lift" data-ripple>Decision</Button>
          </>
        )}
        <span className="flex-1" />
        {state === 'saved' && !open && <span className="text-[11px] text-emerald-700 hud-row-in">Note saved here and on the Ops Desk</span>}
        {canLog && !open && (
          <Button size="sm" variant="quiet" icon={NotebookPen} className="cvw-hot" data-ripple onClick={() => { setOpen(true); setState('idle'); }}
            title="A note only the studio sees, kept here and on the Ops Desk">Add a note for the team</Button>
        )}
      </div>
      {canLog && open && (
        <div className="hud-row-in flex flex-col gap-1.5">
          <p className="text-xs text-slate-500">Only the studio sees notes. This one stays in {convName} and is also kept on the Ops Desk.</p>
          <div className="flex gap-2 items-stretch">
            <textarea autoFocus value={text} onChange={(e) => { setText(e.target.value); setState('idle'); }} rows={2}
              placeholder="For example: client prefers matte laminate in the kitchen" aria-label="Note" className={cx(INPUT, 'resize-none flex-1')} />
            <div className="flex flex-col gap-1.5 shrink-0 justify-center">
              <Button variant="primary" size="sm" onClick={save} disabled={!text.trim() || state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save note'}</Button>
              <Button variant="quiet" size="sm" onClick={() => { setOpen(false); setText(''); }}>Cancel</Button>
              {state === 'failed' && <span className="text-[11px] text-rose-700">Not saved. Try again.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── the project card ───────────── */

/** "5 Dec", or "14 Mar ’27" with the year. */
const dayShort = (iso: string, year = false) => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const s = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(year ? { year: '2-digit' } : {}) });
  return year ? s.replace(/ (\d{2})$/, ' ’$1') : s;
};

function ProjectCard({ ctx, money, seesMoney, journey, stages, glance, portalLine, onOpen, has }: {
  ctx: any; money: ClientMoney | null; seesMoney: boolean; journey: ConversationsWorkspaceProps['journey']; glance: Glance;
  stages: StageRow[]; portalLine: ReturnType<typeof portalStatus>; onOpen: (r: string) => void; has: (r: string) => boolean;
}) {
  const inr = (n: number | null | undefined) => (n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN'));
  const next = money?.milestones.find((m) => m.status !== 'paid' && m.status !== 'received');
  const pct = money && money.projectValue ? Math.round(((money.totalPaid || 0) / money.projectValue) * 100) : null;
  const Sec: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
    <div className="px-4 py-3 border-b border-slate-100">
      <div className="flex items-center justify-between mb-2"><h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>{action}</div>
      {children}
    </div>
  );
  const Tile: React.FC<{ label: string; value: React.ReactNode; sub: string; route: string | null }> = ({ label, value, sub, route }) => (
    <button type="button" data-ripple disabled={!route || !has(route)} onClick={() => route && onOpen(route)}
      className="cvw-hot cvw-lift text-left rounded-xl border border-slate-200 px-3 py-2.5 hover:border-[#3D52A0] disabled:hover:border-slate-200 disabled:cursor-default">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="block font-black text-slate-800 tabular-nums">{value}</span>
      <span className="block text-[11px] text-slate-500 truncate">{sub}</span>
    </button>
  );
  return (
    <aside className="hidden xl:flex flex-col min-h-0 overflow-y-auto border-l border-slate-100" aria-label="Project card">
      <Sec title="At a glance">
        <div className="grid grid-cols-2 gap-2">
          {seesMoney && (
            <Tile label="Collected" route="payment-calc"
              value={money && !money.amountsHidden ? <Masked><CountUp value={money.totalPaid || 0} format={(v) => inr(v)} /></Masked> : '—'}
              sub={money && money.projectValue != null && !money.amountsHidden ? `${pct}% of ${inr(money.projectValue)}` : 'No payment schedule yet'} />
          )}
          {seesMoney && (
            <Tile label="Next due" route="payment-calc"
              value={next ? (next.owed != null ? <Masked><CountUp value={next.owed} format={(v) => inr(v)} /></Masked> : next.name) : '—'}
              sub={next ? `${next.name}${next.date ? ` · ${new Date(next.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}` : 'Nothing due'} />
          )}
          {has('drawing-tracker') && (
            <Tile label="Drawings" route="drawing-tracker"
              value={glance.drawings ? (glance.drawings.total ? <><CountUp value={glance.drawings.issued} /> of {glance.drawings.total}</> : 'None yet') : '…'}
              sub={glance.drawings && glance.drawings.total ? `issued · ${glance.drawings.approved} approved` : 'Drawing Tracker'} />
          )}
          {has('timeline') && (
            <Tile label="Handover" route="timeline"
              value={glance.handoverISO ? dayShort(glance.handoverISO, true) : (glance.hasProgramme === undefined ? '…' : '—')}
              sub={glance.handoverISO ? (glance.targetISO ? `forecast · target ${dayShort(glance.targetISO)}` : 'forecast · no target set') : 'No programme yet'} />
          )}
        </div>
      </Sec>
      {has('client-portal') && (
        <Sec title="Client portal" action={<Button size="sm" variant="quiet" onClick={() => onOpen('client-portal')}>Open</Button>}>
          <PortalLineText line={portalLine} />
          {portalLine.rule <= 4 && (
            <div className="flex gap-1.5 mt-2">
              <Button size="sm" variant="primary" className="flex-1" onClick={() => onOpen('client-portal')}>Review &amp; send</Button>
            </div>
          )}
          {portalLine.giveAccess && (
            <div className="flex gap-1.5 mt-2">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => onOpen('client-portal')}>Give access</Button>
            </div>
          )}
        </Sec>
      )}
      {has('timeline') && (
        <Sec title="Timeline" action={<Button size="sm" variant="quiet" onClick={() => onOpen('timeline')}>Open</Button>}>
          {glance.milestones.length ? glance.milestones.map((m, i) => (
            <div key={m.id} className="hud-row-in flex items-center gap-2.5 py-1 text-xs" style={{ animationDelay: `${i * 40}ms` }}>
              <span className={cx('w-2 h-2 rounded-full shrink-0', i === 0 ? 'bg-[#3D52A0]' : 'bg-slate-300')} aria-hidden />
              <span className="w-14 shrink-0 font-bold text-slate-800 tabular-nums">{dayShort(m.startISO)}</span>
              <span className="min-w-0 flex-1 truncate text-slate-600">{m.title}</span>
            </div>
          )) : (
            <p className="text-xs text-slate-500">{glance.hasProgramme === false ? 'No programme yet. Open the Timeline to plan from here to handover.' : glance.hasProgramme === undefined ? 'Reading the programme…' : 'Nothing left on the programme.'}</p>
          )}
          {glance.handoverISO && <p className="mt-1.5 text-xs text-slate-500">Handover forecast <b className="text-slate-700">{dayShort(glance.handoverISO, true)}</b></p>}
        </Sec>
      )}
      <Sec title="Details">
        {[['Client', ctx.clientName], ['Phone', ctx.clientPhone], ['Email', ctx.clientEmail], ['Place', ctx.location], ['Area', ctx.area ? `${ctx.area} sq ft` : null]]
          .filter(([, v]) => v).map(([k, v]) => (
            <div key={k as string} className="flex justify-between gap-3 py-0.5 text-xs"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-800 truncate">{v}</span></div>
          ))}
      </Sec>
      <Sec title="Journey">
        {stages.map((s) => (
          <button key={s.stage} type="button" disabled={!s.first} onClick={() => s.first && onOpen(s.first)}
            className="w-full flex items-center gap-2.5 py-1 text-left text-xs disabled:cursor-default">
            <span className={cx('w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold shrink-0',
              s.state === 'done' ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : s.state === 'now' ? 'bg-[#3D52A0] text-white animate-[psb-breathe_2.4s_infinite] motion-reduce:animate-none' : 'bg-white text-slate-400 border border-slate-300')}>{s.stage}</span>
            <span className={cx('flex-1 min-w-0 truncate', s.state === 'now' ? 'font-bold text-slate-800' : 'text-slate-600')}>{s.label}</span>
            {s.state === 'now' && <Chip tone="brand">Now</Chip>}
            {s.first && <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden />}
          </button>
        ))}
      </Sec>
    </aside>
  );
}

/* ───────────── the full-screen window ───────────── */

function ScreenWindow({ route, isHub, hubLabel, projectName, labelOf, conversations, backTo, viewOnly, onOpen, onClose, classic, children }: {
  route: string; isHub: boolean; hubLabel: string; projectName: string; labelOf: (r: string) => string; conversations: ConversationDef[];
  backTo: ConversationDef; viewOnly: boolean; onOpen: (r: string) => void; onClose: () => void; classic: ClassicPlace | null; children: React.ReactNode;
}) {
  const home = conversations.find((c) => c.routes.includes(route));
  const owner = home || conversationDef('whole');
  const title = isHub ? hubLabel : labelOf(route);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      /* A dialog the screen opened inside the window closes first. */
      if (document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    box.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[300]">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className="phd-pop absolute inset-2 sm:inset-4 lg:inset-6 bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden outline-none">
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-slate-100 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0] truncate">{projectName} · {owner.name}</p>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight truncate">{title}</h2>
          </div>
          {home && home.routes.length > 1 && (
            <div className="hidden lg:block shrink-0">
              <Segmented<string> label="Screens in this conversation" size="sm" glide value={route} onChange={onOpen}
                options={home.routes.map((r) => ({ id: r, label: labelOf(r) }))} />
            </div>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 grid place-items-center rounded-xl border border-slate-300 text-slate-500 hover:text-[#3D52A0] hover:border-[#3D52A0] shrink-0">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
          <PageTitleBlock compact route={route} />
          <ViewOnlyGuard active={viewOnly}>{children}</ViewOnlyGuard>
        </div>
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
          <span className="flex-1 min-w-0 truncate">What you change here shows up in the {owner.name} conversation.</span>
          {/* The signpost for people who learnt the Classic sidebar (plan PR G). */}
          {classic && (
            <span className="hidden md:inline-flex items-center gap-1.5 min-w-0 truncate" title="Where this screen is in the Classic view">
              <History className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />In Classic: {classicLine(classic)}
            </span>
          )}
          <span className="hidden sm:inline px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[11px] font-bold text-slate-600">Esc</span>
          <Button size="sm" variant="secondary" icon={ArrowLeft} onClick={onClose}>Back to {backTo.name}</Button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── the short tour (plan PR G) ───────────── */

type TourStep = { target: 'list' | 'open' | 'way'; side: 'right' | 'below'; title: string; text: string };

function tourSteps(canClassic: boolean): TourStep[] {
  return [
    { target: 'list', side: 'right', title: 'Your project, as conversations',
      text: 'Money, BOQ, Documents, Design, Site… each is a conversation. Pick one to see what has happened and what to open next.' },
    { target: 'open', side: 'below', title: 'Open a screen',
      text: 'The buttons here open each screen full size, over the project. Close it, press Esc or use Back to come back here.' },
    { target: 'way', side: 'below', title: 'The studio is always on top',
      text: `The studio's sections are up here on every screen; Projects (or Projects › beside the name) takes you back to all your projects.${canClassic ? ' Use Classic view puts the old view back, just for you.' : ''} Show me around plays this tour again.` },
  ];
}

/*
  Three steps, each pointing at the part it explains: a ring around it, the
  rest dimmed, and a card beside it (phd-pop). Esc or Skip ends it; nothing is
  stored, so it can be played again from the top bar at any time.
*/
function Tour({ canClassic, onStep, onDone }: { canClassic: boolean; onStep: (n: number) => void; onDone: () => void }) {
  const steps = tourSteps(canClassic);
  const [i, setI] = useState(0);
  const go = (n: number) => { const k = Math.max(0, Math.min(n, steps.length - 1)); onStep(k); setI(k); };
  const step = steps[i];
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 && r.height > 0 ? r : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [step.target]);
  const card = useRef<HTMLDivElement | null>(null);
  useEffect(() => { card.current?.focus(); }, [i]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      else if (e.key === 'ArrowRight') go(i + 1);
      else if (e.key === 'ArrowLeft') go(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const W = 340;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const pos: React.CSSProperties = !rect
    ? { left: Math.max(16, (vw - W) / 2), top: Math.max(16, vh / 2 - 110) }
    : step.side === 'right' && rect.right + 16 + W < vw
      ? { left: rect.right + 16, top: Math.min(rect.top + 24, vh - 260) }
      : { left: Math.min(Math.max(16, rect.left), vw - W - 16), top: Math.min(rect.bottom + 12, vh - 260) };
  const last = i === steps.length - 1;
  return (
    <div className="fixed inset-0 z-[310]">
      {/* The part being explained stays bright inside the ring; the rest is dimmed. */}
      {rect ? (
        <div aria-hidden className="phd-scrim absolute rounded-2xl ring-2 ring-[#3D52A0] pointer-events-none transition-all duration-300"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8, boxShadow: '0 0 0 9999px rgba(18, 24, 47, 0.4)' }} />
      ) : (
        <div aria-hidden className="phd-scrim absolute inset-0 bg-[#12182F]/40" />
      )}
      <div className="absolute inset-0" onClick={onDone} aria-hidden />
      <div key={i} ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-label={step.title}
        className="phd-pop absolute bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 outline-none" style={{ ...pos, width: W, maxWidth: 'calc(100vw - 32px)' }}>
        <p className="text-xs font-bold text-[#3D52A0]">{i + 1} of {steps.length}</p>
        <h3 className="mt-1 text-base font-bold text-slate-800">{step.title}</h3>
        <p className="mt-1 text-[13px] text-slate-600">{step.text}</p>
        <div className="mt-4 flex items-center gap-2">
          <span className="flex gap-1.5 flex-1" aria-hidden>
            {steps.map((_, n) => <span key={n} className={cx('h-1.5 rounded-full transition-all duration-300', n === i ? 'w-5 bg-[#3D52A0]' : 'w-1.5 bg-slate-300')} />)}
          </span>
          {i > 0 ? <Button size="sm" variant="quiet" onClick={() => go(i - 1)}>Back</Button> : <Button size="sm" variant="quiet" onClick={onDone}>Skip</Button>}
          <Button size="sm" variant="primary" onClick={() => (last ? onDone() : go(i + 1))}>{last ? 'Done' : 'Next'}</Button>
        </div>
      </div>
    </div>
  );
}
