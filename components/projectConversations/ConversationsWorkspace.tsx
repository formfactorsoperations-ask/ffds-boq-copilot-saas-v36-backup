import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ArrowRight, Sparkles, MessageCircle, Wallet, Table, FolderOpen, PenTool, HardHat, CalendarRange, MapPin,
  X, Home, Users, Building2, ChevronRight as Crumb, Search, FileText, Globe, IndianRupee, NotebookPen, Info, Eye, Scale, ChevronRight, LayoutGrid, Compass, History,
} from '@/lib/lucide-shim';
import { Button, Chip, EmptyState, INPUT, Segmented, type Tone } from '../ui/kit';
import { Masked, useFiguresHidden } from '../ui/HideFigures';
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
import { useHubAlerts } from '../ops/useHubAlerts';
import { moneyPicture, projectSignals, rippleRoute, rippleSteps, signalOf, type MoneyPicture, type Signal } from '../../lib/projectSignals';
import { catchUp, lastActivityOf, sinceLabel, type CatchUp } from '../../lib/projectCatchUp';
import { designPicture, digestLine, handoverReadiness, holderLine, inWork, projectNextMove, projectPulse, projectWaiting, type DesignPicture, type DigestLine, type Readiness } from '../../lib/projectCare';
import { canNudge, nudgeTarget } from '../../lib/deskSmart';
import { BAND_LABEL, type Pulse } from '../../lib/clientCare';
import type { NextMove } from '../../lib/clientNextMove';
import { digestWeekOf } from '../../lib/fridayDigest';
import { dayKey, opsSettingsOf, type OpsSettings } from '../../lib/opsDesk';
import { askClientsToOpen } from '../../lib/clientsOpen';
import { nudgeHolder, openInDesignReview, toDrawing, type ReviewDrawing } from '../../services/drawingReviewService';
import { useProjectCare } from './useProjectCare';
import { useProjectOrders } from './useProjectPnl';
import { buildProjectPnl, marginAssumption } from '../../lib/projectPnl';
import { CONFIDENCE_LINE, handoverLine, handoverOutlook, marginOutlook, type HandoverOutlook, type MarginOutlook } from '../../lib/projectOutlook';
import SmartRecord from './SmartRecord';
import { askScopeAddition } from '../../lib/smartRecord';
import { assistAvailable, askThisProject } from '../../services/opsAssistService';
import { markNextDone } from '../../services/opsDeskService';
import { askRecord, looksLikeQuestion, promisesOf, type ProjectAnswer, type Promises, type PromiseLine } from '../../lib/projectAsk';
import { buildProjectBrief } from '../../lib/opsAssist';
import { opsViewOf } from '../../functions/src/teamViewStrip';
import type { Item, SnagItem } from '../../types';
import type { ImpactStep } from '../../lib/scheduleImpact';
import { markSeen, readSeen } from '../../services/projectSeenService';
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
  Each conversation in Home's own colours (owner, 27 Nov 2026: "project
  workspace should look as part of the same application"): the rings on Home
  are gold Money, brand Design, green Site and navy Team (components/home),
  and DayBoard pairs each with its pale tint. The picked conversation's plate
  fills with its colour; the others wear its tint.
*/
const CONV_TONE: Record<ConversationId, { fg: string; tint: string }> = {
  whole: { fg: '#3D52A0', tint: '#EEF2FD' }, chat: { fg: '#B4436A', tint: '#FBEFF3' }, money: { fg: '#8C6A33', tint: '#FBF5EA' },
  boq: { fg: '#5F79D6', tint: '#EEF2FD' }, docs: { fg: '#1E2A5A', tint: '#ECEEF6' }, design: { fg: '#3D52A0', tint: '#EEF2FD' },
  site: { fg: '#0E7C5A', tint: '#E7F5EF' }, plan: { fg: '#1E2A5A', tint: '#ECEEF6' }, brief: { fg: '#0E7C5A', tint: '#E7F5EF' },
};
const plate = (id: ConversationId, filled: boolean): React.CSSProperties =>
  filled ? { background: CONV_TONE[id].fg, color: '#fff' } : { background: CONV_TONE[id].tint, color: CONV_TONE[id].fg };

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
  onLeaveProject: (target?: string) => void;
  /** The screen's look-only guard (a Designer, Client Relations). */
  viewOnly: boolean;
  /** Terminated or a dispute open: the strip Classic shows under its bar. */
  alertBar?: React.ReactNode;
  /** May open the Ops Desk (lib/roleAccess mayOpenStudioTab): sees the client pulse, this week's update and handover readiness. */
  seesClientCare?: boolean;
  /** Bills or waives revision rounds past the included ones (lib/drawingReview canSetAudience). */
  canBillRounds?: boolean;
  /** Checks drawings (the Design Head's part): nobody nudges themselves. */
  isReviewer?: boolean;
  /** The studio's Ops Desk settings (lib/opsDesk opsSettingsOf): when a payment falls due, for the pulse. */
  opsSettings?: OpsSettings;
  /** Smart Record (lib/smartRecord): adds snags to the project's snag list; none when this person cannot change the project. */
  onAddSnags?: (snags: SnagItem[]) => void;
  /** Who logs a snag from here, for the snag list's "raised by". */
  snagRaisedBy?: SnagItem['raisedBy'];
  /** The studio's Item bank and the active option's BOQ, for the scope-creep catcher. */
  bank?: Item[];
  boq?: Array<{ id?: string; name?: string; unit?: string }>;
  /** For the margin (lib/projectPnl, as Reports reads it): the BOQ it is measured on, the billed option and all options. */
  pnlBoq?: any[];
  activeTier?: any;
  tiers?: any[];
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

  /*
    What is wrong in each conversation (lib/projectSignals, smart workspace PR 1):
    the project's risk checks, the Hub's alerts, the money and the drawings. A
    signal shows only when this person may open the screen that owns it.
  */
  const { alerts } = useHubAlerts(p.projectId, ctx);
  const canOpen = (r: string) => p.conversations.some((c) => c.routes.includes(r));
  /* The tracker's rows as the Design Desk reads them, for the site date (lib/deskSmart). */
  const siteRows = useMemo(
    () => (glance.items || []).map((d: any) => toDrawing(p.tenantId, p.projectId, String(d.id), d)),
    [glance.items, p.tenantId, p.projectId],
  );
  const lastActivityAt = useMemo(() => (records ? lastActivityOf(story) : null), [records, story]);
  /*
    Smart workspace, PR 5 (lib/projectOutlook): the handover forecast from the
    saved programme, and, for the roles that see the studio's money, the
    project's P&L as Reports builds it. With the P&L, the cash and margin
    checks run too; their figures follow the hide-figures eye.
  */
  const handover = useMemo<HandoverOutlook | null>(() => {
    const prog = glance.programme;
    if (!prog?.schedule || !prog?.result) return null;
    try { return handoverOutlook(prog.schedule, prog.result); } catch { return null; }
  }, [glance.programme]);
  const orders = useProjectOrders(p.projectId, p.seesMoney);
  const pnl = useMemo(() => {
    if (!p.seesMoney || !orders) return null;
    try { return buildProjectPnl(ctx, (p.pnlBoq || p.boq || []) as any, orders, p.activeTier, ctx.procurementModes || {}, marginAssumption(ctx, p.tiers || [], p.bank || [])); } catch { return null; }
  }, [p.seesMoney, orders, ctx, p.pnlBoq, p.boq, p.activeTier, p.tiers, p.bank]);
  const margin = useMemo<MarginOutlook | null>(() => marginOutlook(pnl), [pnl]);
  const figuresHidden = useFiguresHidden();
  const signals = useMemo(
    () => projectSignals({
      context: ctx, money: p.money, alerts, drawings: glance.items ?? null, siteRows, lastActivityAt, now, pnl,
      handover: handover ? { lateWorkDays: handover.lateWorkDays, line: handoverLine(handover) } : null,
    })
      .filter((s) => canOpen(s.route))
      .map((s) => (figuresHidden && (s.id === 'risk-cash-exposure' || s.id === 'risk-margin-erosion') ? { ...s, detail: 'Hidden while figures are hidden.' } : s)),
    [ctx, p.money, alerts, glance.items, siteRows, lastActivityAt, now, p.conversations, pnl, handover, figuresHidden],
  );
  const moneyCard = useMemo(() => (p.seesMoney ? moneyPicture(ctx, p.money, { now }) : null), [ctx, p.money, p.seesMoney, now]);
  const copiesBehind = useMemo(() => rippleSteps(ctx), [ctx]);

  /*
    Smart workspace, PR 2 (lib/projectCare): the Design card, the client pulse
    and next move, this week's update and handover readiness, from the records
    the Design Desk and the Ops Desk keep, each for the roles that see them.
  */
  const careData = useProjectCare({
    projectId: p.projectId, tenantId: p.tenantId, name, seesCare: !!p.seesClientCare, canBill: !!p.canBillRounds, week: digestWeekOf(now),
  });
  const design = useMemo(
    () => (canOpen('drawing-tracker') && glance.items
      ? designPicture({ projectId: p.projectId, projectName: name, rows: siteRows, items: glance.items as any, meetings: careData.meetings, now })
      : null),
    [glance.items, siteRows, careData.meetings, p.projectId, name, now, p.conversations],
  );
  const pulse = useMemo(() => (careData.care ? projectPulse({
    project: { id: p.projectId, name, targetHandover: ctx.targetHandoverDate || null },
    money: p.money, care: careData.care, settings: p.opsSettings || opsSettingsOf({}), now,
  }) : null), [careData.care, p.money, p.opsSettings, ctx.targetHandoverDate, p.projectId, name, now]);
  const move = useMemo(() => (careData.care ? projectNextMove({ status: String(ctx.status || ''), money: p.money, followUps: careData.care.followUps, now }) : null), [careData.care, ctx.status, p.money, now]);
  const weekly = useMemo(
    () => (p.seesClientCare && careData.digest !== undefined ? digestLine(careData.digest, { inWork: inWork(ctx, now), now }) : null),
    [p.seesClientCare, careData.digest, ctx, now],
  );
  const readiness = useMemo(() => (careData.care ? handoverReadiness(ctx, careData.care.checklists, now) : null), [careData.care, ctx, now]);

  /*
    Smart workspace, PR 4 (lib/projectAsk): the project's brief as the Ops Desk
    builds it, from the copy without the studio's costs (functions/src
    teamViewStrip opsViewOf), with the client's side of the money as this
    person sees it. It feeds Ask this project and the promises.
  */
  const brief = useMemo(() => {
    if (!careData.care) return null;
    const project = { id: p.projectId, name };
    const view = { ...opsViewOf({ id: p.projectId, context: ctx }), id: p.projectId, clientMoney: p.money };
    const waiting = projectWaiting({ project, money: p.money, care: careData.care, settings: p.opsSettings || opsSettingsOf({}), now });
    try { return buildProjectBrief(view, careData.care as any, waiting, now); } catch { return null; }
  }, [careData.care, ctx, p.money, p.projectId, p.opsSettings, name, now]);
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const promises = useMemo(() => {
    if (!careData.care || !brief) return null;
    const pr = promisesOf({ followUps: careData.care.followUps.filter((f) => !doneIds.includes(f.id)), actions: brief.actions, today: dayKey(now) });
    return pr.ours.length + pr.theirs.length ? pr : null;
  }, [careData.care, brief, doneIds, now]);
  const markDone = async (followUpId: string) => {
    await markNextDone(p.projectId, followUpId, p.me.email);
    setDoneIds((d) => [...d, followUpId]);
  };
  const canAsk = !!brief && assistAvailable();
  const ask = (question: string) => {
    const screens = p.conversations.flatMap((c) => c.routes).map((route) => ({ route, name: p.labelOf(route) }));
    return askThisProject(askRecord({ brief: brief!, story, snags: ctx.snagList || [], screens }), question);
  };
  const openClients = () => { askClientsToOpen(p.projectId); p.onLeaveProject('clients'); };

  /* Smart Record (PR 3): "From notes" on the Record bar, for those who may log and while the studio's AI is reachable. */
  const [smartOpen, setSmartOpen] = useState(false);
  const canSmart = p.canLog && !p.viewOnly && assistAvailable();

  /* Which smart card is open in each conversation: none at first, then the person's last choice (a convenience, this browser only). */
  const [briefs, setBriefs] = useState<Record<string, string | null>>(() => { try { return JSON.parse(window.localStorage.getItem('studiodesk.smartBriefs') || '{}') || {}; } catch { return {}; } });
  const isOpen = (id: string) => briefs[conv] === id;
  const toggle = (id: string) => setBriefs((b) => {
    const next = { ...b, [conv]: b[conv] === id ? null : id };
    try { window.localStorage.setItem('studiodesk.smartBriefs', JSON.stringify(next)); } catch { /* private window */ }
    return next;
  });

  /*
    Since you were here: when this person last opened the project is read once
    as the project opens and kept as the "since" for this visit; the visit
    itself is marked at once, so the next visit starts from now.
  */
  const [seenAt, setSeenAt] = useState<number | null | undefined>(undefined);
  const [caughtUp, setCaughtUp] = useState(false);
  useEffect(() => {
    let live = true;
    setSeenAt(undefined); setCaughtUp(false);
    readSeen(p.me.email, p.projectId).then((at) => {
      if (!live) return;
      setSeenAt(at);
      void markSeen(p.me.email, p.projectId);
    });
    return () => { live = false; };
  }, [p.projectId, p.me.email]);
  const sinceThen = useMemo(() => (caughtUp || !records ? null : catchUp(story, seenAt)), [story, seenAt, caughtUp, records]);
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
    /* The ring lives in a clipping layer of its own, so the card itself never clips (or, in a long story, gets squeezed). */
    const clip = document.createElement('span');
    clip.className = 'cvw-ripple-clip';
    clip.setAttribute('aria-hidden', 'true');
    const dot = document.createElement('span');
    dot.className = 'cvw-ripple';
    Object.assign(dot.style, { width: `${d}px`, height: `${d}px`, left: `${e.clientX - r.left - d / 2}px`, top: `${e.clientY - r.top - d / 2}px` });
    clip.appendChild(dot);
    host.appendChild(clip);
    window.setTimeout(() => clip.remove(), 700);
  };

  return (
    <div className="cvw-canvas flex flex-col h-full min-w-0" onPointerDown={ripple}>
      <ProjectBar ctx={ctx} name={name} statusLabel={p.statusLabel} onStatusClick={p.onStatusClick}
        onPortal={p.conversations.some((c) => c.routes.includes('client-portal')) ? () => open('client-portal') : undefined}
        onLeave={p.onLeaveProject} onUseClassic={p.onUseClassic} onTour={beginTour} />
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

      <div className="flex-1 min-h-0 mx-3 sm:mx-5 mb-3 sm:mb-5 grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px] gap-4 hud-panel-in">
        <ConversationList conversations={p.conversations} conv={shown.id} story={story} now={now} needsOf={p.needsOf}
          money={p.money} journey={p.journey} onPick={setConv} signals={signals}
          findScreen={(q) => findScreens(q, p.conversations, (r) => (r === p.homeRoute ? p.hubLabel : p.labelOf(r)), classic, p.homeRoute)}
          onOpenScreen={(c, r) => { setConv(c); open(r); }}
          onAsk={canAsk ? ask : undefined} labelOf={p.labelOf} onOpenRoute={(r) => { const c = conversationOf(r); if (c) setConv(c); open(r); }} />
        <section className="cvw-float flex flex-col min-h-0 min-w-0 overflow-hidden" aria-label={shown.name}>
          <ThreadHead conv={shown} labelOf={p.labelOf} onOpen={open} onPickMobile={setConv} conversations={p.conversations} />
          <Thread key={shown.id} conv={shown.id} routes={shown.routes} aboutOf={p.aboutOf || (() => '')} story={storyFor(story, shown.id)} now={now} loading={!records} onOpen={open}
            labelOf={p.labelOf} visible={(r) => p.conversations.some((c) => c.routes.includes(r))}
            pinned={shown.id === 'whole' ? (
              <>
                {sinceThen && (
                  <Brief label="Since you were here" title={`Since you were here ${sinceLabel(sinceThen.since, now)}`} tone="plain"
                    summary={`${sinceThen.lines.length + sinceThen.more === 1 ? '1 update' : `${sinceThen.lines.length + sinceThen.more} updates`}: ${sinceThen.lines[0].text}`}
                    open={isOpen('since')} onToggle={() => toggle('since')}>
                    <SinceCard data={sinceThen} names={p.conversations} canOpen={canOpen} onOpen={open} onPick={setConv} onDone={() => setCaughtUp(true)} />
                  </Brief>
                )}
                <UpNext stage={p.currentStage} stages={p.stages} journey={p.journey} hubLabel={p.hubLabel} onHub={() => setHubOpen(true)}
                  onMatrix={p.conversations.some((c) => c.routes.includes('project-journey')) ? () => open('project-journey') : undefined}
                  onOpen={open} labelOf={p.labelOf} />
                {signals.length > 0 && (
                  <Brief label="Watch-outs" title="Watch-outs" tone={signals[0].tone}
                    summary={`${signals.length === 1 ? '1 on this project' : `${signals.length} on this project`} · ${signals[0].line}`}
                    open={isOpen('watch')} onToggle={() => toggle('watch')}>
                    <WatchOuts signals={signals} names={p.conversations} labelOf={p.labelOf} onOpen={open} />
                  </Brief>
                )}
                {promises && (
                  <Brief label="Promises" title="Promises" tone={promises.late ? 'late' : 'turn'}
                    summary={[`${promises.ours.length} open from us`, `${promises.theirs.length} from the client`, promises.late ? `${promises.late} late` : ''].filter(Boolean).join(' · ')}
                    open={isOpen('promises')} onToggle={() => toggle('promises')}>
                    <PromisesCard data={promises} onDone={markDone} onMinutes={canOpen('site-meetings') ? () => open('site-meetings') : undefined} />
                  </Brief>
                )}
              </>
            ) : shown.id === 'money' && (moneyCard || copiesBehind.length || margin) ? (
              <>
                {moneyCard && (() => { const b = moneyBrief(moneyCard); return (
                  <Brief label="Money waiting" title="Money waiting" tone={b.tone} summary={b.summary} open={isOpen('money')} onToggle={() => toggle('money')}>
                    <MoneyCard data={moneyCard} canOpen={canOpen('payment-calc')} openLabel={p.labelOf('payment-calc')} onOpen={() => open('payment-calc')} />
                  </Brief>
                ); })()}
                {margin && (
                  <Brief label="Margin" title="Margin" tone={margin.tone}
                    summary={<>Quoted <Masked>{margin.quotedPct}%</Masked> · on track for <Masked>{margin.currentPct}%</Masked>{margin.overspent.length ? ` · ${margin.overspent.length === 1 ? '1 envelope' : `${margin.overspent.length} envelopes`} over budget` : ''}</>}
                    open={isOpen('margin')} onToggle={() => toggle('margin')}>
                    <MarginCard data={margin} onReports={canOpen('project-reports') ? () => open('project-reports') : undefined} />
                  </Brief>
                )}
                {copiesBehind.length > 0 && (
                  <Brief label="What the client holds" title="The client holds older copies" tone="turn"
                    summary={`${copiesBehind.length === 1 ? '1 step' : `${copiesBehind.length} steps`} to bring them up to date · ${copiesBehind[0].title}`}
                    open={isOpen('ripple')} onToggle={() => toggle('ripple')}>
                    <RippleCard steps={copiesBehind} canOpen={canOpen} onOpen={open} labelOf={p.labelOf} />
                  </Brief>
                )}
              </>
            ) : shown.id === 'design' && design ? (() => { const b = designBrief(design); return (
              <Brief label="What will hold up site" title="What will hold up site" tone={b.tone} summary={b.summary} open={isOpen('design')} onToggle={() => toggle('design')}>
                <DesignCard data={design} rows={siteRows} me={p.me} isReviewer={!!p.isReviewer}
                  onOpenDrawing={(id) => openInDesignReview(p.projectId, id, { tab: p.homeRoute, label: name })}
                  onOpenTracker={canOpen('drawing-tracker') ? () => open('drawing-tracker') : undefined}
                  onDesk={() => p.onLeaveProject('design-review')} />
              </Brief>
            ); })() : shown.id === 'plan' && handover ? (
              <Brief label="Handover forecast" title="Handover forecast" tone={handover.lateWorkDays != null && handover.lateWorkDays > 0 ? 'late' : 'plain'}
                summary={handoverLine(handover)} open={isOpen('handover')} onToggle={() => toggle('handover')}>
                <HandoverCard data={handover} onTimeline={canOpen('timeline') ? () => open('timeline') : undefined} />
              </Brief>
            ) : shown.id === 'chat' && weekly ? (
              <WeeklyCard line={weekly} onOpsDesk={() => p.onLeaveProject('ops-desk')} />
            ) : null}
            tail={null} />
          <Composer conv={shown.id} convName={shown.name} canLog={p.canLog} onWrite={writeLine}
            onRecord={shown.id === 'whole' ? open : undefined} onFromNotes={shown.id === 'whole' && canSmart ? () => setSmartOpen(true) : undefined} />
        </section>
        <ProjectCard ctx={ctx} money={p.money} seesMoney={p.seesMoney} journey={p.journey} stages={p.stages} glance={glance}
          portalLine={portalLine} onOpen={open} has={(r) => p.conversations.some((c) => c.routes.includes(r))}
          pulse={pulse} move={move} readiness={readiness} onClients={openClients} onOpsDesk={() => p.onLeaveProject('ops-desk')} />
      </div>

      {windowRoute && (
        <ScreenWindow route={windowRoute} isHub={windowRoute === p.homeRoute} hubLabel={p.hubLabel} projectName={name} labelOf={p.labelOf}
          conversations={p.conversations} backTo={shown} viewOnly={p.viewOnly} onOpen={open} onClose={closeWindow} classic={classicOf(windowRoute)}>
          {p.children}
        </ScreenWindow>
      )}
      {smartOpen && (
        <SmartRecord projectId={p.projectId} projectName={name} clientName={clientName} tenantId={p.tenantId} me={p.me}
          rooms={(ctx.rooms || []).map((r: any) => String(r?.name || '')).filter(Boolean)}
          raisedBy={p.snagRaisedBy || 'owner'} onAddSnags={p.onAddSnags}
          canPrice={canOpen('scope-additions')} seesRates={p.seesMoney} boq={p.boq || []} bank={p.bank || []}
          canOpen={canOpen} onOpen={open}
          onDraftScope={(text) => { askScopeAddition(p.projectId, text); open('scope-additions'); }}
          onLogged={(f) => setRecords((prev) => ({ ...(prev || EMPTY_RECORDS), followUps: [f, ...((prev || EMPTY_RECORDS).followUps)] }))}
          onClose={() => setSmartOpen(false)} />
      )}
      {tour && !windowRoute && <Tour canClassic={!!p.onUseClassic} onStep={tourStep} onDone={endTour} />}
    </div>
  );
}

/* ───────────── the way out ───────────── */

/*
  THE PROJECT'S HEADER (owner, 27 Nov 2026: "project workspace should look
  as part of the same application"). The studio's own top bar stays above it
  in this view, with Projects lit (App.tsx, components/Header), so the way
  out and the studio's screens are exactly where they are on Home. This row
  says where you are, "Projects › the project", with its status and client
  line, and holds what belongs to this view: Client portal, Show me around
  and the person's way back to Classic. It sits on the workspace's own
  canvas, like Home's section heads, with no bar of its own.
*/
function ProjectBar({ ctx, name, statusLabel, onStatusClick, onPortal, onLeave, onUseClassic, onTour }: {
  ctx: any; name: string; statusLabel: string; onStatusClick?: () => void; onPortal?: () => void;
  onLeave: (t?: string) => void; onUseClassic?: () => void; onTour: () => void;
}) {
  const sub = [ctx.clientName || 'No client yet', ctx.location, ctx.area ? `${ctx.area} sq ft` : ''].filter(Boolean).join(' · ');
  const initials = (name.match(/[A-Za-z]+/g) || ['P']).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  return (
    <div data-tour="way" className="shrink-0 px-3 sm:px-5 py-3 flex items-center gap-3 min-w-0">
      <span className="w-10 h-10 rounded-xl grid place-items-center text-white text-sm font-bold bg-[#3D52A0] shrink-0">{initials}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Where you are: Projects › this project. Projects is the way back. */}
          <button type="button" onClick={() => onLeave('projects')} aria-label="Back to Projects" title="Back to all projects"
            className="cvw-hot shrink-0 inline-flex items-center gap-0.5 rounded-md px-1 -mx-1 text-[13px] font-semibold text-slate-500 hover:text-[#3D52A0] hover:bg-[#3D52A0]/10">
            Projects<Crumb className="cvw-arrow w-3.5 h-3.5 text-slate-400" aria-hidden />
          </button>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight truncate">{name}</h1>
          <button type="button" onClick={onStatusClick} disabled={!onStatusClick} className="shrink-0 disabled:cursor-default" title={onStatusClick ? 'Change the project status' : undefined}>
            <Chip tone="brand">{statusLabel}</Chip>
          </button>
        </div>
        <p className="text-[11px] text-slate-500 truncate">{sub}</p>
      </div>
      {onPortal && <Button size="sm" variant="quiet" icon={Globe} className="cvw-hot cvw-lift hidden sm:inline-flex bg-[#3D52A0]/10 text-[#3D52A0]" data-ripple onClick={onPortal}>Client portal</Button>}
      <Button size="sm" variant="secondary" icon={Compass} className="cvw-hot cvw-lift hidden sm:inline-flex" data-ripple onClick={onTour} title="A short tour of this view">Show me around</Button>
      {onUseClassic && (
        <Button size="sm" variant="secondary" className="cvw-hot cvw-lift shrink-0" data-ripple onClick={onUseClassic} title="Your own choice: the studio's setting stays as it is">Use Classic view</Button>
      )}
    </div>
  );
}

/* ───────────── the list ───────────── */

function ConversationList({ conversations, conv, story, now, needsOf, money, journey, onPick, findScreen, onOpenScreen, signals, onAsk, labelOf, onOpenRoute }: {
  conversations: ConversationDef[]; conv: ConversationId; story: StoryItem[]; now: number; needsOf: (r: string) => number;
  money: ClientMoney | null; journey: ConversationsWorkspaceProps['journey']; onPick: (c: ConversationId) => void; signals: Signal[];
  findScreen: (q: string) => ReturnType<typeof findScreens>; onOpenScreen: (c: ConversationId, route: string) => void;
  /** Ask this project (PR 4): only when the brief is read and the AI is reachable. */
  onAsk?: (question: string) => Promise<ProjectAnswer>; labelOf: (r: string) => string; onOpenRoute: (r: string) => void;
}) {
  const [q, setQ] = useState('');
  /* The question asked and its answer; a new search clears it. */
  const [asked, setAsked] = useState<{ q: string; state: 'asking' | 'done' | 'failed'; a?: ProjectAnswer } | null>(null);
  const question = !!onAsk && looksLikeQuestion(q);
  const runAsk = async () => {
    if (!onAsk || !q.trim()) return;
    const text = q.trim();
    setAsked({ q: text, state: 'asking' });
    try { setAsked({ q: text, state: 'done', a: await onAsk(text) }); }
    catch { setAsked({ q: text, state: 'failed' }); }
  };
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
    <aside data-tour="list" className="cvw-float hidden md:flex flex-col min-h-0 overflow-hidden" aria-label="This project's conversations">
      <div className="p-3">
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#E3E8F4] bg-[#F8FAFF] focus-within:ring-2 focus-within:ring-[#3D52A0]/30">
          <Search className="w-4 h-4 text-slate-400" aria-hidden />
          <input value={q} onChange={(e) => { setQ(e.target.value); if (asked && asked.state !== 'asking') setAsked(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && question) { e.preventDefault(); void runAsk(); } }}
            placeholder={onAsk ? 'Find a screen, or ask a question' : 'Find a screen or old name'} aria-label="Find a conversation or a screen" className="flex-1 min-w-0 text-[13px] outline-none bg-transparent" />
          {q && <button type="button" onClick={() => { setQ(''); setAsked(null); }} aria-label="Clear the search" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" aria-hidden /></button>}
        </label>
        {question && !asked && (
          <button type="button" data-ripple onClick={runAsk} className="cvw-hot hud-row-in mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[#EEF2FD] text-left text-xs font-bold text-[#3D52A0] hover:bg-[#3D52A0]/15">
            <Sparkles className="w-4 h-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate">Ask this project</span><span className="text-[11px] font-semibold text-slate-500">Enter</span>
          </button>
        )}
        {asked && <AskAnswer asked={asked} labelOf={labelOf} onOpenRoute={onOpenRoute} onClose={() => setAsked(null)} />}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {list.map((c, i) => {
          const Icon = CONV_ICON[c.id];
          const pv = previewOf(c);
          /* The worst thing wrong in it, in words (owner, 27 Nov 2026: "yes you can use coloured reason"): rose late, amber your turn. */
          const sig = signalOf(signals, c.id);
          const needs = c.routes.reduce((s, r) => s + needsOf(r), 0) > 0;
          const on = c.id === conv;
          return (
            <button key={c.id} type="button" data-ripple onClick={() => onPick(c.id)} aria-current={on ? 'true' : undefined}
              className={cx('cvw-hot w-[calc(100%-16px)] mx-2 my-0.5 flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-left hud-row-in', !on && 'hover:bg-[#F4F7FB]')}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
              {/* The highlight slides to the conversation you pick, as the sidebar's does to the screen you are on. */}
              {on && <motion.span layoutId="conv-on" aria-hidden className="absolute inset-0 rounded-2xl bg-[#EEF2FD]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              {/* The conversation you are in fills its disc; it pops and its icon plays as you pick it. */}
              <span key={on ? 'on' : 'off'} className={cx('cvw-disc relative w-9 h-9 rounded-xl grid place-items-center shrink-0', on && 'is-pop')} style={plate(c.id, on)}>
                <span className={cx('cvw-ic', on && 'is-play')} data-m={CONV_MOVE[c.id]}><Icon className="w-[18px] h-[18px]" aria-hidden /></span>
              </span>
              <span className="cvw-text relative min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="flex-1 min-w-0 truncate text-[13px] font-bold text-slate-800">{c.name}</span>
                  {pv.at && <span className="text-[11px] text-slate-400 whitespace-nowrap">{whenShort(pv.at, now)}</span>}
                </span>
                <span className="flex items-center gap-1.5 mt-0.5">
                  {sig ? (
                    <span className={cx('flex-1 min-w-0 truncate text-xs font-semibold', sig.tone === 'late' ? 'text-rose-700' : 'text-amber-700')} title={sig.detail}>{sig.line}</span>
                  ) : (
                    <span className="flex-1 min-w-0 truncate text-xs text-slate-500">{pv.text}</span>
                  )}
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
                  className="cvw-hot w-[calc(100%-16px)] mx-2 my-0.5 flex items-start gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-[#F4F7FB] hud-row-in"
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
        {!list.length && !screens.length && !question && <p className="px-4 py-6 text-xs text-slate-500">Nothing matches “{q}”. Try a screen’s name, such as Money or Drawings.</p>}
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
    <div data-tour="open" className="shrink-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <span key={conv.id} className="cvw-disc is-pop w-9 h-9 rounded-xl grid place-items-center shrink-0" style={plate(conv.id, false)}>
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
      {/* The cards on top keep to about two thirds of the pane, so the story below always shows. */}
      {pinned && <div className="shrink-0 max-h-[68%] overflow-y-auto flex flex-col gap-2 pb-1">{pinned}</div>}
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
            <div className="self-center my-1 px-3 py-1 rounded-full bg-[#EEF2FD] text-[11px] font-bold text-[#3D52A0]">{g.group}</div>
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
            className="cvw-hot cvw-lift hud-row-in text-left flex items-center gap-3 rounded-2xl bg-[#F7F9FF] px-4 py-3.5 shadow-[0_8px_18px_-16px_rgba(30,42,90,0.5)]"
            style={{ animationDelay: `${i * 40}ms` }}>
            <span className="cvw-disc w-11 h-11 rounded-xl grid place-items-center shrink-0" style={plate(conv, i === 0)}>
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
    <div className={cx('cvw-hot cvw-lift max-w-[82%] flex gap-2.5 rounded-2xl bg-[#F7F9FF] px-3 py-2.5 hud-row-in shadow-[0_8px_18px_-16px_rgba(30,42,90,0.5)]', it.side === 'client' ? 'self-start' : 'self-end')} style={style}>
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
  /* The first step shows; the next ones fold under "Show n more" so the story keeps its room (owner, 27 Nov 2026). */
  const [all, setAll] = useState(false);
  const rows = all ? journey.upNext : journey.upNext.slice(0, 1);
  const folded = journey.upNext.length - 1;
  return (
    <div className="shrink-0 mx-4 mt-1 rounded-2xl bg-gradient-to-b from-[#F7F9FF] to-[#EEF2FD] overflow-hidden hud-panel-in">
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
      {(folded > 0 || !!journey.more) && (
        <div className="flex items-center gap-2 px-2 py-1 border-t border-slate-100">
          {folded > 0 && (
            <button type="button" data-ripple aria-expanded={all} onClick={() => setAll((v) => !v)} className="cvw-hot px-2 py-1 rounded-lg text-xs font-bold text-[#3D52A0] hover:bg-[#3D52A0]/5">
              {all ? 'Show less' : `Show ${folded} more`}
            </button>
          )}
          <span className="flex-1" />
          {!!journey.more && (
            <button type="button" data-ripple onClick={onHub} className="cvw-hot px-2 py-1 rounded-lg text-xs font-bold text-[#3D52A0] hover:bg-[#3D52A0]/5">
              {journey.more} more on the Hub →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── smart workspace, PR 1 ───────────── */

/*
  A SMART CARD, FOLDED (owner, 27 Nov 2026: "actual conversation doesnt have
  much space, please check for all tabs"). Every smart card sits on top of its
  conversation as one line: a dot in its tone (rose late, amber your turn,
  brand otherwise), its name and the one fact that matters. Pressing the line
  opens the card under it; one card is open at a time in a conversation, and
  the workspace remembers which, so the story keeps the room.
*/
type BriefTone = 'late' | 'turn' | 'plain';
const BRIEF_DOT: Record<BriefTone, string> = { late: 'bg-rose-500', turn: 'bg-amber-500', plain: 'bg-[#3D52A0]' };
function Brief({ label, title, summary, tone, open, onToggle, children }: {
  label: string; title: string; summary: React.ReactNode; tone: BriefTone; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section className="shrink-0 mx-4 rounded-2xl bg-[#F7F9FF] overflow-hidden shadow-[0_8px_18px_-16px_rgba(30,42,90,0.5)]" aria-label={label}>
      <button type="button" data-ripple aria-expanded={open} onClick={onToggle}
        className="cvw-hot w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[#EEF2FD]">
        <span className={cx('w-2 h-2 rounded-full shrink-0', BRIEF_DOT[tone])} aria-hidden />
        <span className="shrink-0 text-[13px] font-bold text-slate-800">{title}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{summary}</span>
        <span className="shrink-0 text-xs font-bold text-[#3D52A0]">{open ? 'Hide' : 'Show'}</span>
        <ChevronRight className={cx('w-4 h-4 shrink-0 text-slate-400', open && 'rotate-90')} aria-hidden />
      </button>
      {open && <div className="px-4 pb-3 hud-panel-in">{children}</div>}
    </section>
  );
}

/*
  SINCE YOU WERE HERE (lib/projectCatchUp): what moved since this person last
  opened the project, at most three lines, the client's own first. Each line
  opens its screen (or its conversation); Mark as read puts it away for this
  visit. Owners and project leads open many projects a day (owner, 27 Nov 2026).
*/
function SinceCard({ data, names, canOpen, onOpen, onPick, onDone }: {
  data: CatchUp; names: ConversationDef[]; canOpen: (r: string) => boolean;
  onOpen: (r: string) => void; onPick: (c: ConversationId) => void; onDone: () => void;
}) {
  const nameOf = (c: ConversationId) => names.find((x) => x.id === c)?.name || conversationDef(c).name;
  return (
    <div className="-mx-1.5">
      <ul className="flex flex-col">
        {data.lines.map((l, i) => (
          <li key={l.id}>
            <button type="button" data-ripple onClick={() => (l.route && canOpen(l.route) ? onOpen(l.route) : onPick(l.conv))}
              className="cvw-hot hud-row-in w-full flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left hover:bg-white/70" style={{ animationDelay: `${60 + i * 40}ms` }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CONV_TONE[l.conv].fg }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700">{l.text}</span>
              <span className="text-[11px] text-slate-400 whitespace-nowrap">{nameOf(l.conv)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 px-1.5 mt-1">
        <p className="min-w-0 flex-1 text-[11px] text-slate-500">{data.more > 0 ? `and ${data.more} more in the story below` : ''}</p>
        <Button size="sm" variant="quiet" className="cvw-hot" data-ripple onClick={onDone}>Mark as read</Button>
      </div>
    </div>
  );
}

/*
  WATCH-OUTS (lib/projectSignals): the three worst things on the project, each
  in the conversation that owns it and one button to its screen. The rest are
  on their conversations in the list. Rose is late, amber is someone's turn.
*/
function WatchOuts({ signals, names, labelOf, onOpen }: {
  signals: Signal[]; names: ConversationDef[]; labelOf: (r: string) => string; onOpen: (r: string) => void;
}) {
  const nameOf = (c: ConversationId) => names.find((x) => x.id === c)?.name || conversationDef(c).name;
  const top = signals.slice(0, 3);
  return (
    <div className="flex flex-col gap-1.5">
      {top.map((s, i) => (
        <div key={s.id} className="hud-row-in flex items-center gap-3 rounded-xl bg-white px-3 py-2" style={{ animationDelay: `${60 + i * 40}ms` }}>
          <Chip tone={s.tone === 'late' ? 'bad' : 'warn'}>{s.tone === 'late' ? 'Late' : 'Your turn'}</Chip>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-slate-800 truncate">{s.line}</p>
            <p className="text-xs text-slate-500 truncate" title={s.detail}>{nameOf(s.conv)}{s.detail ? ` · ${s.detail}` : ''}</p>
          </div>
          <Button size="sm" variant="secondary" className="cvw-hot cvw-lift shrink-0" data-ripple onClick={() => onOpen(s.route)}>Open {labelOf(s.route)}</Button>
        </div>
      ))}
      {signals.length > 3 && (
        <p className="px-1 text-xs text-slate-500">{signals.length - 3} more, each shown on its conversation in the list</p>
      )}
    </div>
  );
}

const inrOf = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const TILE = {
  rose: 'bg-rose-50 text-rose-700', amber: 'bg-amber-50 text-amber-700', gold: 'bg-[#FBF5EA] text-[#8C6A33]',
  brand: 'bg-[#EEF2FD] text-[#3D52A0]', slate: 'bg-[#F4F7FB] text-slate-700',
} as const;
const MoneyTile: React.FC<{ label: string; value: React.ReactNode; sub: string; tint: keyof typeof TILE }> = ({ label, value, sub, tint }) => (
  <div className={cx('rounded-xl px-3 py-2.5 min-w-0', TILE[tint])}>
    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
    <span className="block font-black tabular-nums truncate">{value}</span>
    <span className="block text-[11px] text-slate-500 truncate">{sub}</span>
  </div>
);

/*
  MONEY WAITING (lib/projectSignals moneyPicture): the Money conversation opens
  on what is unpaid and for how long, what is earned and not invoiced, and
  whether the stages still add up, for the roles that see money, behind the
  hide-figures eye. The button opens the Money screen; nothing is raised or
  sent from here.
*/
function MoneyCard({ data, canOpen, openLabel, onOpen }: { data: MoneyPicture; canOpen: boolean; openLabel: string; onOpen: () => void }) {
  const amt = (n: number | null, fallback: string) => (n == null ? fallback : <Masked>{inrOf(n)}</Masked>);
  const worst = data.unpaid[0];
  const pastTerms = data.unpaid.filter((u) => u.level >= 1);
  const unpaidTint = !worst ? 'slate' : worst.level >= 2 ? 'rose' : worst.level === 1 ? 'amber' : 'slate';
  return (
    <div>
      <div className={cx('grid gap-2', data.drift ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')}>
        <MoneyTile label="Unpaid" tint={unpaidTint}
          value={worst ? amt(data.unpaidTotal, data.unpaid.length === 1 ? '1 invoice' : `${data.unpaid.length} invoices`) : 'Nothing'}
          sub={worst ? `${worst.name} · ${worst.days === 1 ? '1 day' : `${worst.days} days`}${pastTerms.length ? '' : ' · within terms'}` : 'No invoice waiting'} />
        {data.earned.length > 0 ? (
          <MoneyTile label="Earned, not invoiced" tint="gold"
            value={amt(data.earnedTotal, data.earned.length === 1 ? '1 stage' : `${data.earned.length} stages`)}
            sub={data.earned.length === 1 ? `${data.earned[0].name} · ${data.earned[0].reason}` : data.earned.map((e) => e.name).join(' · ')} />
        ) : (
          <MoneyTile label="Next to bill" tint="brand"
            value={data.nextToBill ? amt(data.nextToBill.amount, data.nextToBill.name) : 'Nothing'}
            sub={data.nextToBill ? data.nextToBill.name : 'Every stage is billed'} />
        )}
        {data.drift && (
          <MoneyTile label="Stages add up to" tint="amber"
            value={`${data.drift.design ?? data.drift.execution}%`}
            sub={data.drift.design != null && data.drift.execution != null ? `design and execution, not 100%` : `${data.drift.design != null ? 'design' : 'execution'} stages, not 100%`} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        <p className="min-w-0 flex-1 text-xs text-slate-500">
          {data.pays ? <>This client has paid <b className="text-slate-700">{data.pays.meanDays} days</b> after an invoice, over {data.pays.settled} stages.</> : 'Raise and chase invoices on the Money screen.'}
        </p>
        {canOpen && <Button size="sm" variant="primary" className="cvw-hot cvw-lift" data-ripple onClick={onOpen}>Open {openLabel}<ArrowRight className="cvw-arrow w-3.5 h-3.5" aria-hidden /></Button>}
      </div>
    </div>
  );
}

/* Money waiting, folded: the one or two facts that matter, amounts behind the hide-figures eye. */
function moneyBrief(d: MoneyPicture): { tone: BriefTone; summary: React.ReactNode } {
  const amt = (n: number | null) => (n == null ? null : <Masked>{inrOf(n)}</Masked>);
  const worst = d.unpaid[0];
  const parts: React.ReactNode[] = [];
  if (worst) parts.push(<>{amt(d.unpaidTotal) ?? worst.name} unpaid {worst.days === 1 ? '1 day' : `${worst.days} days`}</>);
  if (d.earned.length) parts.push(<>{amt(d.earnedTotal) ?? (d.earned.length === 1 ? d.earned[0].name : `${d.earned.length} stages`)} earned, not invoiced</>);
  else if (d.nextToBill) parts.push(<>Next to bill: {d.nextToBill.name}</>);
  if (d.drift) parts.push(<>stages add up to {d.drift.design ?? d.drift.execution}%</>);
  if (!parts.length) parts.push(<>Nothing waiting</>);
  const tone: BriefTone = worst && worst.level >= 2 ? 'late' : (worst && worst.level === 1) || d.earned.length || d.drift ? 'turn' : 'plain';
  return { tone, summary: parts.map((x, i) => <React.Fragment key={i}>{i ? ' · ' : ''}{x}</React.Fragment>) };
}

/*
  THE RIPPLE (lib/scheduleImpact, through lib/projectSignals rippleSteps): the
  payment schedule moved and what the client holds did not. The steps are in
  the order to take them, as Money lists them; each opens its screen.
*/
function RippleCard({ steps, canOpen, onOpen, labelOf }: {
  steps: ImpactStep[]; canOpen: (r: string) => boolean; onOpen: (r: string) => void; labelOf: (r: string) => string;
}) {
  return (
    <div>
      <p className="text-xs text-amber-700 mb-2">They are older than the payment schedule. Bring them up to date in this order.</p>
      <ol className="flex flex-col gap-1.5">
        {steps.map((s, i) => {
          const r = rippleRoute(s);
          return (
            <li key={s.key} className="hud-row-in flex items-center gap-3 rounded-xl bg-white px-3 py-2" style={{ animationDelay: `${80 + i * 40}ms` }}>
              <span className="w-6 h-6 rounded-full grid place-items-center bg-amber-100 text-amber-800 text-[11px] font-bold shrink-0" aria-hidden>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-800">{s.title}</p>
                <p className="text-xs text-slate-500">{s.why}</p>
              </div>
              {canOpen(r) && (
                <Button size="sm" variant="secondary" className="cvw-hot cvw-lift shrink-0" data-ripple onClick={() => onOpen(r)}>
                  {s.key === 'generate' ? `Open ${labelOf(r)}` : s.label}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ───────────── smart workspace, PR 5 ───────────── */

const longDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/*
  THE HANDOVER FORECAST (lib/projectOutlook handoverOutlook): the date the
  programme now forecasts against the target, the critical-path work and the
  holds that put it there, and the one change that would pull it back, worked
  out by running the programme again, never guessed.
*/
function HandoverCard({ data, onTimeline }: { data: HandoverOutlook; onTimeline?: () => void }) {
  const late = data.lateWorkDays != null && data.lateWorkDays > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <MoneyTile label="Likely handover" tint={late ? 'rose' : 'slate'} value={longDay(data.forecastISO)} sub={late ? `${data.lateWorkDays} working days past the target` : data.targetISO ? 'On target' : 'No target set'} />
        <MoneyTile label="Target" tint="slate" value={data.targetISO ? longDay(data.targetISO) : '—'} sub={data.targetISO ? 'As agreed' : 'Set it on the Timeline'} />
      </div>
      {data.reasons.length > 0 && (
        <ul className="flex flex-col gap-1">
          {data.reasons.map((r) => (
            <li key={r} className="flex items-start gap-2 text-xs text-slate-600"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" aria-hidden />{r}</li>
          ))}
        </ul>
      )}
      {data.lever && <p className="rounded-xl bg-[#EEF2FD] px-3 py-2 text-xs text-slate-700"><Sparkles className="inline w-3.5 h-3.5 mr-1 text-[#3D52A0]" aria-hidden />{data.lever.text}</p>}
      {onTimeline && <div><Button size="sm" variant="secondary" className="cvw-hot cvw-lift" data-ripple onClick={onTimeline}>Open Timeline</Button></div>}
    </div>
  );
}

/*
  THE MARGIN (lib/projectOutlook marginOutlook, from lib/projectPnl as Reports
  builds it): quoted against on track for, what moved it, and the cash the
  studio has committed to vendors beyond what the client has paid. For the
  roles that see the studio's money; every figure behind the hide-figures eye.
*/
function MarginCard({ data, onReports }: { data: MarginOutlook; onReports?: () => void }) {
  const inr = (n: number) => <Masked>{inrOf(n)}</Masked>;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <MoneyTile label="Quoted" tint="slate" value={<Masked>{data.quotedPct}%</Masked>} sub="what the job was sold to make" />
        <MoneyTile label="On track for" tint={data.tone === 'late' ? 'rose' : data.tone === 'turn' ? 'amber' : 'gold'} value={<Masked>{data.currentPct}%</Masked>} sub={data.hasProcurement ? 'orders and bills so far' : 'the plan, nothing ordered'} />
        <MoneyTile label={data.movedBy >= 0 ? 'Margin lost' : 'Margin gained'} tint={data.movedBy > 0 ? 'amber' : 'slate'} value={inr(Math.abs(data.movedBy))} sub={data.movedBy > 0 ? `${Math.round(data.slipShare * 100)}% of what was quoted` : 'against the quote'} />
      </div>
      {(data.overspent.length > 0 || data.uncostedLines > 0 || data.exposure > 0) && (
        <ul className="flex flex-col gap-1">
          {data.overspent.map((o) => (
            <li key={o.where} className="flex items-start gap-2 text-xs text-slate-600"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden /><span><b className="text-slate-800">{o.where}</b>: {inr(o.overBy)} over its budget</span></li>
          ))}
          {data.uncostedLines > 0 && <li className="flex items-start gap-2 text-xs text-slate-600"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden />{data.uncostedLines === 1 ? '1 BOQ line has' : `${data.uncostedLines} BOQ lines have`} no cost, so the margin on them is not known</li>}
          {data.exposure > 0 && <li className="flex items-start gap-2 text-xs text-slate-600"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" aria-hidden /><span>{inr(data.exposure)} committed to vendors beyond what the client has paid</span></li>}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[11px] text-slate-500">{CONFIDENCE_LINE[data.confidence]}</p>
        {onReports && <Button size="sm" variant="secondary" className="cvw-hot cvw-lift" data-ripple onClick={onReports}>Open Reports</Button>}
      </div>
    </div>
  );
}

/* ───────────── smart workspace, PR 4 ───────────── */

/*
  ASK THIS PROJECT (lib/projectAsk): the answer under the search box, from this
  project's record only, with the parts of the record it used and up to three
  screens to open. "The records here don't say" when they do not.
*/
function AskAnswer({ asked, labelOf, onOpenRoute, onClose }: {
  asked: { q: string; state: 'asking' | 'done' | 'failed'; a?: ProjectAnswer }; labelOf: (r: string) => string; onOpenRoute: (r: string) => void; onClose: () => void;
}) {
  return (
    <section className="hud-panel-in mt-2 rounded-xl bg-[#EEF2FD] px-3 py-2.5" aria-label="Answer" aria-live="polite">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-[#3D52A0]" aria-hidden />
        <div className="min-w-0 flex-1">
          {asked.state === 'asking' && <p className="text-xs text-slate-500">Reading this project’s records…</p>}
          {asked.state === 'failed' && <p className="text-xs text-rose-700">The AI did not answer. Check your connection and try again.</p>}
          {asked.state === 'done' && asked.a && (
            <>
              <p className="text-[13px] text-slate-800">{asked.a.answer}</p>
              {asked.a.sources.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">{asked.a.sources.map((s) => <Chip key={s} tone="brand">{s}</Chip>)}</div>
              )}
              {asked.a.routes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {asked.a.routes.map((r) => <Button key={r} size="sm" variant="secondary" className="cvw-hot" data-ripple onClick={() => onOpenRoute(r)}>Open {labelOf(r)}</Button>)}
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-slate-500">From this project’s records only.</p>
            </>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close the answer" className="text-slate-400 hover:text-slate-600 shrink-0"><X className="w-4 h-4" aria-hidden /></button>
      </div>
    </section>
  );
}

/*
  PROMISES (lib/projectAsk promisesOf): what the studio promised the client and
  what the client promised, still open, late first. A follow-up's next step is
  marked done here (as on the Ops Desk); a minutes action item is closed in the
  minutes.
*/
function PromisesCard({ data, onDone, onMinutes }: { data: Promises; onDone: (followUpId: string) => Promise<void>; onMinutes?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const dayOf = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const row = (l: PromiseLine) => (
    <div key={l.id} className="hud-row-in flex items-center gap-3 rounded-xl bg-white px-3 py-2">
      {l.due && <Chip tone={l.late ? 'bad' : 'slate'}>{l.late ? `Late · ${dayOf(l.due)}` : `By ${dayOf(l.due)}`}</Chip>}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-800">{l.text}</p>
        <p className="text-[11px] text-slate-500">{l.from.kind === 'follow-up' ? `Logged by ${l.from.by}` : `From the minutes${l.from.ref ? ` · ${l.from.ref}` : ''}`}{l.owner && !(l.from.kind === 'follow-up' && l.from.by === l.owner) ? ` · ${l.owner} to do it` : ''}</p>
        {failed === l.id && <p className="text-[11px] text-rose-700">Not saved. Try again.</p>}
      </div>
      {l.from.kind === 'follow-up' ? (
        <Button size="sm" variant="quiet" className="cvw-hot shrink-0" data-ripple disabled={busy === l.id}
          onClick={async () => { setBusy(l.id); setFailed(null); try { await onDone((l.from as any).followUpId); } catch { setFailed(l.id); } finally { setBusy(null); } }}>
          {busy === l.id ? 'Saving…' : 'Done'}
        </Button>
      ) : onMinutes ? <Button size="sm" variant="quiet" className="cvw-hot shrink-0" data-ripple onClick={onMinutes}>Open minutes</Button> : null}
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      {data.ours.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-slate-700">We promised</p>
          {data.ours.slice(0, 5).map(row)}
          {data.ours.length > 5 && <p className="px-1 text-[11px] text-slate-500">and {data.ours.length - 5} more on the Ops Desk</p>}
        </div>
      )}
      {data.theirs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-slate-700">The client promised</p>
          {data.theirs.slice(0, 5).map(row)}
          {data.theirs.length > 5 && <p className="px-1 text-[11px] text-slate-500">and {data.theirs.length - 5} more on the Ops Desk</p>}
        </div>
      )}
    </div>
  );
}

/* ───────────── smart workspace, PR 2 ───────────── */

/*
  THE DESIGN CARD (lib/projectCare designPicture): the drawings that will hold
  up site and who in the studio is holding each (lib/deskSmart), the drawing
  the client has had longest (lib/drawingIntel), and revision rounds past the
  included ones that nobody has billed or waived. Open takes the drawing to the
  Design Desk and back here; Nudge reminds whoever holds it, in the app only
  (owner, 24 Nov 2026: no WhatsApp for this); rounds are billed or waived on
  the Design Desk.
*/
function DesignCard({ data, rows, me, isReviewer, onOpenDrawing, onOpenTracker, onDesk }: {
  data: DesignPicture; rows: ReviewDrawing[]; me: { email: string }; isReviewer: boolean;
  onOpenDrawing: (id: string) => void; onOpenTracker?: () => void; onDesk: () => void;
}) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const [nudged, setNudged] = useState<Record<string, 'busy' | 'sent' | 'failed'>>({});
  const nudge = async (d: ReviewDrawing) => {
    setNudged((n) => ({ ...n, [d.id]: 'busy' }));
    try { await nudgeHolder({ orgId: d.orgId, projectId: d.projectId, drawingId: d.id }); setNudged((n) => ({ ...n, [d.id]: 'sent' })); }
    catch { setNudged((n) => ({ ...n, [d.id]: 'failed' })); }
  };
  const site = data.site.slice(0, 3);
  return (
    <div>
      {site.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {site.map((s, i) => {
            const d = byId.get(s.id);
            const holder = holderLine(s, d?.review?.designer?.name);
            const state = d ? canNudge(d.review) : null;
            /* As on the Design Desk: held a day or more, by someone else. */
            const mine = state?.held && (state.held.who === 'head' ? isReviewer : d?.review?.designer?.email === me.email);
            const mayNudge = !!d && !!state?.held && state.held.days >= 1 && !mine;
            const n = nudged[s.id];
            return (
              <div key={s.id} className="hud-row-in flex items-center gap-3 rounded-xl bg-white px-3 py-2" style={{ animationDelay: `${80 + i * 40}ms` }}>
                <Chip tone={s.risk.state === 'ready' ? 'brand' : 'bad'}>{s.risk.state === 'late' ? 'Late for site' : s.risk.state === 'ready' ? 'Ready' : 'Site date'}</Chip>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-800 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.risk.line}{holder ? ` ${holder}.` : ''}</p>
                  {n === 'failed' && <p className="text-[11px] text-rose-700">No reminder sent. Try again.</p>}
                </div>
                {mayNudge && (
                  <Button size="sm" variant="quiet" className="cvw-hot shrink-0" data-ripple disabled={!state!.ok || n === 'busy' || n === 'sent'}
                    title={n === 'sent' ? 'A reminder went just now' : state!.ok ? `Remind ${nudgeTarget(d!.review, state!.held!)}` : state!.why}
                    onClick={() => nudge(d!)}>{n === 'sent' ? 'Reminded' : n === 'busy' ? 'Sending…' : 'Nudge'}</Button>
                )}
                <Button size="sm" variant="secondary" className="cvw-hot cvw-lift shrink-0" data-ripple onClick={() => onOpenDrawing(s.id)}>Open</Button>
              </div>
            );
          })}
          {data.site.length > 3 && <p className="text-xs text-slate-500 px-1">{data.site.length - 3} more on the Design Desk</p>}
        </div>
      )}
      {data.clientHolding.worst && (
        <div className={cx('flex items-center gap-3', site.length > 0 && 'mt-2')}>
          <p className="min-w-0 flex-1 text-xs text-slate-600">
            The client has had <b className="text-slate-800">{data.clientHolding.worst.name}</b> for {data.clientHolding.worst.days} days
            {data.clientHolding.count > 1 ? `, and ${data.clientHolding.count - 1} more for over a week.` : '.'}
          </p>
          {onOpenTracker && <Button size="sm" variant="quiet" className="cvw-hot shrink-0" data-ripple onClick={onOpenTracker}>Open Drawings</Button>}
        </div>
      )}
      {data.rounds.length > 0 && (
        <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-amber-800">
              {data.rounds.length === 1 ? '1 revision round' : `${data.rounds.length} revision rounds`} past the included ones, not billed or waived
            </p>
            <p className="text-xs text-amber-700 truncate">{data.rounds.slice(0, 3).map((r) => `${r.room} · round ${r.round}`).join(' · ')}</p>
          </div>
          <Button size="sm" variant="secondary" className="cvw-hot cvw-lift shrink-0" data-ripple onClick={onDesk}>Bill or waive on the Design Desk</Button>
        </div>
      )}
    </div>
  );
}

/* What will hold up site, folded. */
function designBrief(d: DesignPicture): { tone: BriefTone; summary: string } {
  const risky = d.site.filter((s) => s.risk.state === 'late' || s.risk.state === 'risk').length;
  const parts: string[] = [];
  if (risky) parts.push(`${risky === 1 ? '1 drawing' : `${risky} drawings`} late for site or at risk`);
  else if (d.site.length) parts.push(`${d.site.length === 1 ? '1 drawing' : `${d.site.length} drawings`} ready for site`);
  if (d.clientHolding.worst) parts.push(`the client has had ${d.clientHolding.worst.name} ${d.clientHolding.worst.days} days`);
  if (d.rounds.length) parts.push(`${d.rounds.length === 1 ? '1 round' : `${d.rounds.length} rounds`} to bill or waive`);
  return { tone: risky ? 'late' : 'turn', summary: parts.join(' · ') };
}

/*
  THIS WEEK'S UPDATE (lib/projectCare digestLine, from lib/fridayDigest): where
  the client's weekly update stands. It is written, approved and sent on the Ops
  Desk; nothing to the client is written here (owner, 27 Nov 2026).
*/
function WeeklyCard({ line, onOpsDesk }: { line: DigestLine; onOpsDesk: () => void }) {
  const tint = line.tone === 'turn' ? 'bg-amber-50' : line.tone === 'done' ? 'bg-emerald-50' : 'bg-[#F7F9FF]';
  const ink = line.tone === 'turn' ? 'text-amber-800' : line.tone === 'done' ? 'text-emerald-800' : 'text-slate-800';
  return (
    <section className={cx('shrink-0 mx-4 rounded-2xl px-4 py-2 flex items-center gap-3 hud-panel-in', tint)} aria-label="This week’s update">
      <p className="min-w-0 flex-1 truncate text-xs text-slate-500">
        <b className={cx('text-[13px]', ink)}>{line.text}</b>{line.detail ? ` · ${line.detail}` : ''}
      </p>
      <Button size="sm" variant="secondary" className="cvw-hot cvw-lift shrink-0" data-ripple onClick={onOpsDesk}>Open the Ops Desk</Button>
    </section>
  );
}

/* The client pulse's ring in the band's colour: emerald good, amber watch, rose at risk. */
const BAND_INK: Record<Pulse['band'], { ring: string; text: string }> = {
  good: { ring: '#059669', text: 'text-emerald-700' }, watch: { ring: '#D97706', text: 'text-amber-700' }, at_risk: { ring: '#E11D48', text: 'text-rose-700' },
};

/*
  CLIENT PULSE (lib/clientCare clientPulse, worked out as the Ops Desk works it
  out): the score, its band, the three reasons that moved it most, and the next
  move with this client as Clients says it. "Open in Clients" opens this client.
*/
function PulseBlock({ pulse, move }: { pulse: Pulse; move: NextMove | null }) {
  const ink = BAND_INK[pulse.band];
  const top = pulse.reasons.slice().sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).slice(0, 3);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <span className="w-14 h-14 rounded-full grid place-items-center shrink-0" aria-hidden
          style={{ background: `conic-gradient(${ink.ring} ${pulse.score * 3.6}deg, #ECEEF6 0deg)` }}>
          <span className="w-11 h-11 rounded-full bg-white grid place-items-center text-[15px] font-black tabular-nums text-slate-800"><CountUp value={pulse.score} /></span>
        </span>
        <div className="min-w-0">
          <p className={cx('text-[13px] font-bold', ink.text)}>{BAND_LABEL[pulse.band]} · {pulse.score} of 100</p>
          <p className="text-[11px] text-slate-500">{pulse.confidence === 'low' ? 'An early read: little is logged yet' : pulse.confidence === 'medium' ? 'From what is logged so far' : 'From a full log'}</p>
        </div>
      </div>
      {top.length > 0 && (
        <ul className="flex flex-col gap-1">
          {top.map((r) => (
            <li key={r.label} className="flex items-baseline gap-2 text-xs">
              <span className={cx('w-7 shrink-0 text-right font-bold tabular-nums', r.points > 0 ? 'text-emerald-700' : 'text-rose-700')}>{r.points > 0 ? `+${r.points}` : r.points}</span>
              <span className="min-w-0 text-slate-600">{r.label}</span>
            </li>
          ))}
        </ul>
      )}
      {move && (
        <p className="text-xs text-slate-500">Next move: <b className={move.tone === 'warn' ? 'text-amber-700' : 'text-slate-800'}>{move.label}</b>{move.why ? ` · ${move.why}` : ''}</p>
      )}
    </div>
  );
}

/* HANDOVER CHECKLIST (lib/clientCare, through lib/projectCare handoverReadiness): one figure from the Execution phase on. */
function ReadinessBlock({ r }: { r: Readiness }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-slate-600"><b className="text-slate-800 tabular-nums">{r.done} of {r.total}</b> done{r.settled ? ': ready to hand over' : ''}</p>
      <span className="block h-2 rounded-full bg-[#E7F5EF] overflow-hidden" aria-hidden>
        <span className="block h-full rounded-full bg-[#0E7C5A]" style={{ width: `${r.pct}%` }} />
      </span>
      {r.outstanding.length > 0 && <p className="text-[11px] text-slate-500 truncate" title={r.outstanding.join(' · ')}>Still to do: {r.outstanding.slice(0, 2).join(' · ')}{r.outstanding.length > 2 ? ` and ${r.outstanding.length - 2} more` : ''}</p>}
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
function Composer({ conv, convName, canLog, onWrite, onRecord, onFromNotes }: {
  conv: ConversationId; convName: string; canLog: boolean;
  onWrite: (l: FollowUpLine) => Promise<void>; onRecord?: (r: string) => void;
  /** Smart Record: notes from a visit, meeting or call, sorted and filed (PR 3). */
  onFromNotes?: () => void;
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
    <div className="shrink-0 border-t border-slate-100 px-4 py-2.5 bg-white flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {onRecord && (
          <>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">Record</span>
            <Button size="sm" variant="secondary" icon={HardHat} onClick={() => onRecord('site-meetings')} aria-keyshortcuts="S" className="cvw-hot cvw-lift" data-ripple>Site visit</Button>
            <Button size="sm" variant="secondary" icon={Users} onClick={() => onRecord('site-meetings')} aria-keyshortcuts="M" className="cvw-hot cvw-lift" data-ripple>Meeting</Button>
            <Button size="sm" variant="secondary" icon={Scale} onClick={() => onRecord('record-decision')} aria-keyshortcuts="D" className="cvw-hot cvw-lift" data-ripple>Decision</Button>
            {onFromNotes && (
              <Button size="sm" variant="secondary" icon={Sparkles} onClick={onFromNotes} className="cvw-hot cvw-lift" data-ripple
                title="Type or speak your notes; decisions, snags, extra work and promises are sorted for you to file">From notes</Button>
            )}
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

function ProjectCard({ ctx, money, seesMoney, journey, stages, glance, portalLine, onOpen, has, pulse, move, readiness, onClients, onOpsDesk }: {
  ctx: any; money: ClientMoney | null; seesMoney: boolean; journey: ConversationsWorkspaceProps['journey']; glance: Glance;
  stages: StageRow[]; portalLine: ReturnType<typeof portalStatus>; onOpen: (r: string) => void; has: (r: string) => boolean;
  pulse?: Pulse | null; move?: NextMove | null; readiness?: Readiness | null; onClients?: () => void; onOpsDesk?: () => void;
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
  /* Each figure in one of Home's tints: Collected gold, Next due brand, Drawings navy, Handover green. */
  const TINTS = { gold: ['#FBF5EA', '#8C6A33'], brand: ['#EEF2FD', '#3D52A0'], navy: ['#ECEEF6', '#1E2A5A'], green: ['#E7F5EF', '#0E7C5A'] } as const;
  const Tile: React.FC<{ label: string; value: React.ReactNode; sub: string; route: string | null; tint: keyof typeof TINTS }> = ({ label, value, sub, route, tint }) => (
    <button type="button" data-ripple disabled={!route || !has(route)} onClick={() => route && onOpen(route)} style={{ background: TINTS[tint][0] }}
      className="cvw-hot cvw-lift text-left rounded-xl px-3 py-2.5 disabled:cursor-default">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="block font-black tabular-nums" style={{ color: TINTS[tint][1] }}>{value}</span>
      <span className="block text-[11px] text-slate-500 truncate">{sub}</span>
    </button>
  );
  return (
    <aside className="cvw-float hidden xl:flex flex-col min-h-0 overflow-y-auto" aria-label="Project card">
      <Sec title="At a glance">
        <div className="grid grid-cols-2 gap-2">
          {seesMoney && (
            <Tile label="Collected" tint="gold" route="payment-calc"
              value={money && !money.amountsHidden ? <Masked><CountUp value={money.totalPaid || 0} format={(v) => inr(v)} /></Masked> : '—'}
              sub={money && money.projectValue != null && !money.amountsHidden ? `${pct}% of ${inr(money.projectValue)}` : 'No payment schedule yet'} />
          )}
          {seesMoney && (
            <Tile label="Next due" tint="brand" route="payment-calc"
              value={next ? (next.owed != null ? <Masked><CountUp value={next.owed} format={(v) => inr(v)} /></Masked> : next.name) : '—'}
              sub={next ? `${next.name}${next.date ? ` · ${new Date(next.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}` : 'Nothing due'} />
          )}
          {has('drawing-tracker') && (
            <Tile label="Drawings" tint="navy" route="drawing-tracker"
              value={glance.drawings ? (glance.drawings.total ? <><CountUp value={glance.drawings.issued} /> of {glance.drawings.total}</> : 'None yet') : '…'}
              sub={glance.drawings && glance.drawings.total ? `issued · ${glance.drawings.approved} approved` : 'Drawing Tracker'} />
          )}
          {has('timeline') && (
            <Tile label="Handover" tint="green" route="timeline"
              value={glance.handoverISO ? dayShort(glance.handoverISO, true) : (glance.hasProgramme === undefined ? '…' : '—')}
              sub={glance.handoverISO ? (glance.targetISO ? `forecast · target ${dayShort(glance.targetISO)}` : 'forecast · no target set') : 'No programme yet'} />
          )}
        </div>
      </Sec>
      {pulse && (
        <Sec title="Client pulse" action={onClients && <Button size="sm" variant="quiet" onClick={onClients}>Open in Clients</Button>}>
          <PulseBlock pulse={pulse} move={move || null} />
        </Sec>
      )}
      {readiness && (
        <Sec title="Handover checklist" action={onOpsDesk && <Button size="sm" variant="quiet" onClick={onOpsDesk}>Open the Ops Desk</Button>}>
          <ReadinessBlock r={readiness} />
        </Sec>
      )}
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
      text: `The studio’s own bar stays at the very top, as on Home. Projects there, or Projects › beside the name, takes you back to all your projects.${canClassic ? ' Use Classic view puts the old view back, just for you.' : ''} Show me around plays this tour again.` },
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
