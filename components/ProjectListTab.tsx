import React, { useState, useMemo, useEffect } from "react";
import { unansweredMessages } from './ops/ClientMessagesPage';
import { ENGAGEMENTS, EngagementType, engagementDef, engagementOf, isFeeOnly } from '../lib/engagement';
import { db } from '../services/dbService';
import { FullProjectData, ProjectStatus } from "../types";
import { classifyProject } from "../lib/projectClassification";
import { buildDisplayNames } from "../lib/projectNaming";
import Card from "./shared/Card";
import { BuildingOfficeIcon, PlusIcon, NewFileIcon, DeleteIcon } from "./Icons";
import { formatClientValue, timeAgo, formatCurrency } from "../lib/utils";
import { getSingleProjectValue } from "../lib/financialsUtils";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Info, PlayCircle, PauseCircle, CheckCircle, CheckCircle2, FileText, Send, MessageSquare, Briefcase, Zap, Trophy, LayoutDashboard, SlidersHorizontal, XCircle, Pin, Home, MapPin, Layers, Palette, Hammer } from '@/lib/lucide-shim';
import { ProjectPaymentBadge } from "./PaymentHealth";
import DocumentMeter from "./ops/DocumentMeter";
import { ClockIcon } from "./Icons";
import ProjectStatusIllustration from "./ProjectStatusIllustration";
import {
  fetchPaymentHealthScore,
  PaymentHealth,
} from "../hooks/usePaymentHealthScore";
import {
  CashFlowSummaryWidget,
  CashFlowForecastDashboard,
} from "./CashFlowForecastDashboard";
import { useOrg } from "../contexts/OrgContext";
import { seesStudioFinance, isDesignerRole, isLimitedRole } from "../lib/roleAccess";
import { Users } from '@/lib/lucide-shim';
import ProjectTeamButton from "./projectHeader/ProjectTeamButton";
import AssignProjectsModal from "./projectHeader/AssignProjectsModal";
import { useMomActions } from "../hooks/useMomActions";
import { getNextActions, NextAction } from "../services/nextActionEngine";
import { buildDocumentCompleteness, DocumentCompleteness } from "../lib/documentCompleteness";
import { Lock, ArrowRight, CheckSquare, ChevronDown, ChevronUp, Flag } from '@/lib/lucide-shim';
import ProjectStatusTransitionModal from "./ProjectStatusTransitionModal";
import LiquidGlassFlipCard from "./ui/LiquidGlassFlipCard";
import MarginReveal from "./projects/MarginReveal";
import { Dot } from "./ui/HudBits";
import ProjectFolder from "./projects/ProjectFolder";
import { FOLDER_STAGES, STAGE, stageOf, stageOfProject, kindOf, folderFiles, folderNext, type FolderStage } from "../lib/projectFolders";
import { boqTagOf, type BoqTag } from "../lib/playground/versions";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { LayoutGrid, Rows3, Search as SearchIcon, X as XIcon, Check as CheckIcon } from "lucide-react";

interface ProjectListTabProps {
  projects: FullProjectData[];
  activeProjectId: string | null;
  /** Opens the project, at a screen of it when a route is given (a folder's file or next step). */
  onOpenProject: (project: FullProjectData, route?: string) => void;
  onCreateNew: () => void;
  onDeleteProject: (id: string) => void;
  onDuplicateProject: (project: FullProjectData) => void;
  onQuickUpdate?: (projectId: string, field: string, value: any) => void;
  onStatusChange?: (projectId: string, newStatus: ProjectStatus, note?: string) => Promise<void> | void;
  /** The library is still on its way; App loads it without holding the screen. */
  loading?: boolean;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; icon?: any }
> = {
  lead: {
    label: "New Lead",
    color: "text-blue-600",
    bg: "bg-blue-50/50 backdrop-blur-sm",
    border: "border-blue-200/50",
    icon: Zap,
  },
  draft: {
    label: "Drafting",
    color: "text-slate-600",
    bg: "bg-slate-100/50 backdrop-blur-sm",
    border: "border-slate-200/50",
    icon: FileText,
  },
  proposal_sent: {
    label: "Proposal Sent",
    color: "text-[#3D52A0]",
    bg: "bg-sky-50/50 backdrop-blur-sm",
    border: "border-sky-200/50",
    icon: Send,
  },
  negotiation: {
    label: "Negotiation",
    color: "text-amber-600",
    bg: "bg-amber-50/50 backdrop-blur-sm",
    border: "border-amber-200/50",
    icon: MessageSquare,
  },
  won: {
    label: "Won",
    color: "text-emerald-600",
    bg: "bg-emerald-50/50 backdrop-blur-sm",
    border: "border-emerald-200/50",
    icon: Trophy,
  },
  execution: {
    label: "Execution",
    color: "text-purple-600",
    bg: "bg-purple-50/50 backdrop-blur-sm",
    border: "border-purple-200/50",
    icon: PlayCircle,
  },
  work_paused: {
    label: "Work Paused",
    color: "text-rose-700",
    bg: "bg-rose-100 backdrop-blur-sm",
    border: "border-rose-300",
    icon: PauseCircle,
  },
  completed: {
    label: "Completed",
    color: "text-teal-600",
    bg: "bg-teal-50/50 backdrop-blur-sm",
    border: "border-teal-200/50",
    icon: CheckCircle,
  },
  lost: {
    label: "Lost",
    color: "text-red-400",
    bg: "bg-red-50/50 backdrop-blur-sm",
    border: "border-red-100/50",
    icon: XCircle,
  },
};

const ProjectSparkles = () => {
  const randomMove = () => Math.random() * 2 - 1;
  const randomOpacity = () => Math.random();
  const random = () => Math.random();
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      {[...Array(12)].map((_, i) => (
        <motion.span
          key={`star-${i}`}
          animate={{
            top: `calc(${random() * 100}% + ${randomMove()}px)`,
            left: `calc(${random() * 100}% + ${randomMove()}px)`,
            opacity: [0, randomOpacity(), 0],
            scale: [0.5, 1.2, 0.5],
          }}
          transition={{
            duration: random() * 2 + 4,
            repeat: Infinity,
            ease: "linear",
          }}
          style={{
            position: "absolute",
            top: `${random() * 100}%`,
            left: `${random() * 100}%`,
            width: `2px`,
            height: `2px`,
            borderRadius: "50%",
            zIndex: 0,
          }}
          className="inline-block bg-[#3D52A0]/60"
        ></motion.span>
      ))}
    </div>
  );
};

// --- Exciting Feature Components ---
const AnimatedRing = ({
  progress,
  colorClass,
  size = 60,
  strokeWidth = 4,
}: {
  progress: number;
  colorClass: string;
  size?: number;
  strokeWidth?: number;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg className="transform -rotate-90 w-full h-full">
        <circle
          className="text-slate-100"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <motion.circle
          className={colorClass}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-sm font-light tracking-tighter text-slate-800">
          {progress}
          <span className="text-[8px]">%</span>
        </span>
      </div>
    </div>
  );
};



/*
  What one project is worth.

  Deliberately the app's shared answer and not a local one. A first pass here
  read the approved tier and fell back to context.financials, which reported
  the whole forty-two-project book as 115.80L with nothing in the pipeline --
  every unwon project priced at zero, because that fallback field is not where
  their money lives. The cards had the same bug and showed a flat Rs 0 on
  thirty-one of forty-two. getSingleProjectValue is what Clients, Home and
  Reports already ask, so this screen now agrees with them by construction
  rather than by coincidence.
*/
const valueOf = (p: FullProjectData): number => getSingleProjectValue(p);

/** Nothing is owed on a project that is finished, lost or filed away. */
const DORMANT = ['completed', 'lost', 'archived'];

const getProjectMetrics = (project: any) => {
    return {
        status: project.context?.status || 'draft',
        value: project.context?.financials?.totalValue || project.context?.estimatedValue || 0,
        riskScore: project.decisionBrainOutput?.riskScore || 0,
    };
};

const ProjectListTab: React.FC<ProjectListTabProps> = ({
  projects,
  activeProjectId,
  onOpenProject,
  onCreateNew,
  onDeleteProject,
  onDuplicateProject,
  onQuickUpdate,
  onStatusChange,
  loading = false,
}) => {
  const { orgData, currentRole } = useOrg();
  /* Margins, portfolio totals and cash are the studio's own figures; see
     lib/roleAccess. Client prices on a card stay visible to everyone. */
  const showFinance = seesStudioFinance(currentRole);
  const [assignOpen, setAssignOpen] = useState(false);

  /*
    What to call each project on this screen.

    Sixteen of these were called "New Project", seven of them with real BOQs
    behind them, and the list gave no way to tell which was which -- finding one
    meant opening them in turn. Only names that actually collide get a suffix,
    so a project with a real name is left exactly as it is.

    Built from the whole list rather than the filtered one, so a label does not
    change as somebody types in the search box.
  */
  const displayNames = useMemo(() => buildDisplayNames(projects), [projects]);
  const displayName = (p: any) =>
    displayNames.get(p?.id) || p?.context?.name || 'Unnamed Project';
  /* Hooked once here, never inside the card map -- the number of hook calls
     per render has to be constant. Everything below reads it from the closure. */
  const reduceMotion = useReducedMotion();
  const siteSupervisors =
    orgData?.team?.filter((m) => m.role === "Site Supervisor") || [];
  const [viewMode, setViewMode] = useState<"grid" | "compare">("grid");
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(
    new Set(),
  );
  const [activeTab, setActiveTab] = useState<"projects" | "intelligence" | "analytics">("projects");
  /* The open and overdue action counts appear on Intelligence only, so the
     listener behind them opens there and not on every visit to the cards. */
  const { openActions, overdueActions } = useMomActions(
    undefined,
    activeTab === "intelligence" ? orgData?.tenantId || "demo-tenant-01" : undefined,
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | "actual" | "dummy" | "untagged">("all");
  /* BOQ Playground (PR T): which projects' latest BOQ is a Playground BOQ, a Classic one, or none yet. */
  const [boqFilter, setBoqFilter] = useState<"all" | BoqTag>("all");
  /* Turnkey, design only, design + PMC (lib/engagement.ts). */
  const [engagementFilter, setEngagementFilter] = useState<"all" | EngagementType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  /*
    Deleting more than one.

    The single delete stays exactly as it was -- the same button, the same
    confirmation -- it just goes through a list of one now. Nine abandoned
    projects took nine trips through that dialog, and a dialog somebody clicks
    nine times in a row is a dialog they have stopped reading by the third.
  */
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());

  const toggleSelected = (id: string) =>
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const [statusModalProject, setStatusModalProject] = useState<FullProjectData | null>(null);
  /* Set by the alert bar's chips. The bar is the only thing that writes it,
     and clicking the live chip again clears it. */
  const [alertFilter, setAlertFilter] = useState<
    'blocker' | 'due' | 'unsigned' | 'risk' | null
  >(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  /*
    Classification comes from lib/projectClassification now, which reads the
    project's TAG and nothing else. This screen used to keep its own copy that
    fell back to matching "sample"/"demo"/"test" in the name, so it disagreed
    with Reports about which projects were real -- the chips read 23 actual /
    19 dummy while the tags said 13 / 29.

    Untagged is a third state here too, and it gets its own chip when any exist.
    Folding it into either side would be the same guess by another route, and a
    newly created project would silently land in "Actual".
  */

  /*
    One pass over the book, read four times over.

    getNextActions and buildDocumentCompleteness both walk a project's whole
    context, and the alert bar, the phase counts, the summary strip and every
    card's next-move line all want the same two answers. Deriving them once
    here is partly about cost and mostly about agreement: a card that says
    "chase the contract" above a bar reporting nothing outstanding is worse
    than either of them alone.
  */
  const intel = useMemo(() => {
    const role = currentRole || 'Admin';
    const map = new Map<
      string,
      { action: NextAction | null; docs: DocumentCompleteness }
    >();
    for (const proj of projects) {
      const status = (proj.context?.status || 'draft') as string;
      const actions = DORMANT.includes(status)
        ? []
        : getNextActions(
            {
              project: proj.context,
              designPaymentStages: proj.context?.paymentMilestones,
              designGate: (proj.context as any)?.designGate,
              drawingTrackerSummary: null,
              scopeAdditionsSummary: {
                pending: ((proj.context as any)?.scopeAdditions || []).filter(
                  (sa: any) =>
                    sa.status === 'pending_approval' || sa.status === 'pending',
                ).length,
              },
              timeline: null,
            },
            role,
          );
      map.set(proj.id, {
        action: actions[0] || null,
        docs: buildDocumentCompleteness(proj.context),
      });
    }
    return map;
  }, [projects, currentRole]);

  const pipelineStats = useMemo(() => ({
    pendingDecisions: projects.filter(p => p.context?.status === 'proposal_sent' || p.context?.status === 'negotiation').length,
    revenueVelocity: projects.reduce((sum, p) => sum + (p.boqValue || p.engagement?.designFee || 0), 0) / 12,
    activeProjectsCount: projects.filter(p => p.context?.status === 'execution' || p.context?.status === 'work_paused').length,
    conversionRate: projects.filter(p => p.context?.status !== 'lost').length / (projects.length || 1) * 100,
    bookedValue: projects.filter(p => p.context?.status === 'execution' || p.context?.status === 'won').reduce((sum, p) => sum + (p.boqValue || p.engagement?.designFee || 0), 0),
    avgDealSize: projects.length ? projects.reduce((sum, p) => sum + (p.boqValue || p.engagement?.designFee || 0), 0) / projects.length : 0,
    avgMargin: 35
  }), [projects]);

  /*
    Four predicates instead of one inline filter.

    A phase pill has to answer "how many would I show", which means running
    every test except its own. A single fused filter cannot answer that, which
    is why the pills carried no counts and you could click into an empty phase.
  */
  const matchesKind = (proj: FullProjectData, kind: typeof kindFilter) =>
    kind === 'all' || classifyProject(proj) === (kind === 'dummy' ? 'test' : kind);

  /* The phase tabs are the folder stages (lib/projectFolders stageOf), so a tab and its folders always agree. */
  const matchesPhase = (proj: FullProjectData, phase: string) =>
    phase === 'all' || stageOfProject(proj) === phase;

  const matchesSearch = (proj: FullProjectData) => {
    if (!searchQuery) return true;
    const st = (proj.context?.status || 'draft') as string;
    /* The phase word is what people actually type -- "execution", "lost" --
       and searching for one used to return nothing at all. */
    /* The pill's own word too, not just the raw status: the Execution pill
       counts seven, so typing "execution" had better not return four. */
    const bucket = STAGE[stageOfProject(proj)];
    return [
      /* The label on the card, not just the stored name -- otherwise typing
         the very detail the row shows you returns nothing. */
      displayName(proj),
      proj.context?.name,
      proj.context?.clientName,
      (proj.context as any)?.city,
      STATUS_CONFIG[st]?.label,
      bucket?.label,
      st,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
  };

  const matchesAlert = (proj: FullProjectData) => {
    if (!alertFilter) return true;
    const it = intel.get(proj.id);
    if (alertFilter === 'unsigned') return !!it?.docs.unsignedContract;
    if (alertFilter === 'risk')
      return ((proj as any).decisionBrainOutput?.riskScore || 0) > 0;
    return it?.action?.priority === alertFilter;
  };

  const matchesBoq = (proj: FullProjectData, b: "all" | BoqTag = boqFilter) =>
    b === "all" || boqTagOf(proj.tiers) === b;

  const matchesEngagement = (proj: FullProjectData, e: "all" | EngagementType = engagementFilter) =>
    e === "all" || engagementOf(proj.context) === e;

  /* Only worth a filter once the studio has more than one kind of project. */
  const engagementsInUse = useMemo(
    () => ENGAGEMENTS.filter((d) => projects.some((p) => engagementOf(p.context) === d.id)),
    [projects],
  );

  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (proj) =>
          matchesKind(proj, kindFilter) &&
          matchesPhase(proj, statusFilter) &&
          matchesEngagement(proj) &&
          matchesBoq(proj) &&
          matchesSearch(proj) &&
          matchesAlert(proj),
      ),
    [projects, kindFilter, statusFilter, engagementFilter, boqFilter, searchQuery, alertFilter, intel],
  );

  /*
    The cards go in a screenful at a time.

    Every card is a flip card with both faces, a payment badge, a document
    meter and the team button -- some 30ms of work each -- and all of them used
    to be built before anything was painted, so a studio with forty projects
    waited on the fortieth before it saw the first. The first screenful is
    built straight away and the rest follow a batch at a time, below the
    fold where nobody is looking yet. Once every card is in, it stays that way:
    filtering and searching work on the whole list as before.
  */
  const FIRST_CARDS = 12;
  const [cardLimit, setCardLimit] = useState(FIRST_CARDS);
  useEffect(() => {
    if (cardLimit >= filteredProjects.length) return;
    /* A timer, not requestAnimationFrame: a frame callback waits for as long
       as the browser tab is in the background, and the rest of the cards
       would wait with it. Sixteen milliseconds leaves room for one paint. */
    const timer = setTimeout(() => setCardLimit((n) => n + FIRST_CARDS), 16);
    return () => clearTimeout(timer);
  }, [cardLimit, filteredProjects.length]);
  /*
    The glass rests while the page scrolls (owner's call, 11 Nov 2026).

    Every card's surface refracts and blurs what is behind it, and the panels
    inside blur again; while the page moves, all of that is redrawn every frame,
    and scrolling the Projects screen ran at about ten frames a second. While a
    scroll is under way the grid carries data-lgf-scrolling, which swaps the
    glass for the same solid white the card already falls back to for people
    who turn transparency off (LiquidGlassFlipCard's stylesheet); 150ms after
    the last scroll it comes back. Set on the element directly, not through
    state, so scrolling never re-renders the cards.

    Captured at the document because the page may scroll in the window or in
    the app shell's own scroll area.
  */
  const cardGridRef = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let rest: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const grid = cardGridRef.current;
      if (!grid) return;
      if (!grid.hasAttribute('data-lgf-scrolling')) grid.setAttribute('data-lgf-scrolling', '');
      clearTimeout(rest);
      rest = setTimeout(() => cardGridRef.current?.removeAttribute('data-lgf-scrolling'), 150);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      clearTimeout(rest);
    };
  }, []);

  const shownProjects = useMemo(
    () => (cardLimit >= filteredProjects.length ? filteredProjects : filteredProjects.slice(0, cardLimit)),
    [filteredProjects, cardLimit],
  );

  /*
    The alarm follows the Actual/Dummy switch and nothing else.

    It is a screen-level alert, not a readout of the current view: filtering to
    Completed should not make three live blockers disappear from the top of the
    page. Scoping it to the kind switch only means demo projects stay out of it
    without the real ones ever going quiet.
  */
  const alarm = useMemo(() => {
    let blocker = 0;
    let due = 0;
    let unsigned = 0;
    let risk = 0;
    for (const proj of projects) {
      if (!matchesKind(proj, kindFilter)) continue;
      const it = intel.get(proj.id);
      if (it?.action?.priority === 'blocker') blocker++;
      else if (it?.action?.priority === 'due') due++;
      if (it?.docs.unsignedContract) unsigned++;
      if (((proj as any).decisionBrainOutput?.riskScore || 0) > 0) risk++;
    }
    return { blocker, due, unsigned, risk, total: blocker + due + unsigned + risk };
  }, [projects, kindFilter, intel]);

  /* The four figures above the grid, counted over what is on screen. */
  const deck = useMemo(() => {
    let book = 0;
    let booked = 0;
    let onSite = 0;
    let needsYou = 0;
    let unsigned = 0;
    for (const proj of filteredProjects) {
      const v = valueOf(proj);
      book += v;
      const st = proj.context?.status;
      /* Won, not priced. Keying the split on approvedTierId counted a new
         lead with a locked tier as approved revenue, which is a different
         claim from the one the words make. This matches On site. */
      if (
        st === 'won' ||
        st === 'execution' ||
        st === 'work_paused' ||
        st === 'completed'
      )
        booked += v;
      if (st === 'execution' || st === 'won' || st === 'work_paused') onSite++;
      const it = intel.get(proj.id);
      if (it?.action && it.action.priority !== 'suggested') needsYou++;
      if (it?.docs.unsignedContract) unsigned++;
    }
    return {
      book,
      booked,
      pipeline: book - booked,
      onSite,
      needsYou,
      unsigned,
    };
  }, [filteredProjects, intel]);

  /*
    The desk (DESIGN.md "Projects as glass folders"). Folders are large -- three
    across on a desktop, two from 640px, one on a phone -- so the width follows
    the desk itself rather than the window.
  */
  const deskRef = React.useRef<HTMLDivElement | null>(null);
  const [deskW, setDeskW] = useState(1200);
  useEffect(() => {
    const el = deskRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setDeskW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTab]);
  const folderCols = deskW >= 1240 ? 3 : deskW >= 640 ? 2 : 1;
  const folderW = Math.max(260, Math.min(460, Math.floor((deskW - 24 - (folderCols - 1) * 24) / folderCols)));
  const [deskView, setDeskView] = useState<'desk' | 'shelves'>('desk');
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* Search, Assign designer and New project sit in the title row, beside the page name. */
  usePageHeader({
    actions: (
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 h-10 w-full sm:w-72 px-3 rounded-xl border border-slate-300 bg-white text-slate-400 focus-within:border-[#3D52A0] focus-within:ring-2 focus-within:ring-[#3D52A0]/30">
          <SearchIcon className="w-4 h-4 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            aria-label="Search projects"
            placeholder="Search a project, client or place"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400"
          />
          {searchQuery ? (
            <button type="button" aria-label="Clear search" onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-700"><XIcon className="w-3.5 h-3.5" /></button>
          ) : (
            <kbd className="text-[10px] font-bold text-slate-400 border border-slate-200 rounded px-1.5">/</kbd>
          )}
        </label>
        {seesStudioFinance(currentRole) && (
          <button type="button" onClick={() => setAssignOpen(true)} className="h-10 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 flex items-center gap-2">
            <Users className="w-4 h-4" /> Assign designer
          </button>
        )}
        {!isLimitedRole(currentRole) && (
          <button type="button" onClick={onCreateNew} className="h-10 px-4 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] flex items-center gap-2 shadow-sm">
            <PlusIcon className="w-4 h-4" /> New project
          </button>
        )}
      </div>
    ),
  }, [searchQuery, currentRole, onCreateNew]);

  /* "/" jumps to search, Escape clears it -- the two keys every list in this
     app should answer to. Ignored while you are already typing somewhere. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && el === searchRef.current) {
        setSearchQuery('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {activeTab === "intelligence" && (
        <div className="space-y-12">
          <div className="px-4">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Ops Intelligence
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal">
              Execution bottlenecks, risk factors, and pending client decisions.
            </p>
          </div>

          {/* 1. COMPACT STATS HEADER */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
            }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4"
          >
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-transform">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">
                  Blockers & Risks
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-6xl font-light tracking-tighter text-white">
                    {openActions}
                  </p>
                </div>
              </div>
              <div className="mt-8 pt-6 border-t border-sky-900">
                <p className="text-xs text-slate-400 font-medium">
                  Overdue Actions:{" "}
                  <span className="text-rose-400">{overdueActions}</span>
                </p>
                <p className="text-xs text-slate-400 font-medium mt-1">
                  Pending Decisions:{" "}
                  <span className="text-amber-400">
                    {pipelineStats.pendingDecisions}
                  </span>
                </p>
              </div>
              {openActions > 0 && overdueActions > 0 && (
                <div className="absolute top-8 right-8 w-3 h-3 bg-rose-500 rounded-full animate-ping"></div>
              )}
            </motion.div>

            {showFinance && (<>
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-transform">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">
                  Pace & Volume
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-light tracking-tighter text-slate-900">
                    {formatClientValue(pipelineStats.revenueVelocity)}
                  </p>
                  <p className="text-xs text-slate-500 uppercase font-bold">
                    / Mo
                  </p>
                </div>
              </div>
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Active Book
                  </p>
                  <p className="text-lg font-medium text-slate-800 mt-1">
                    {pipelineStats.activeProjectsCount} Projects
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Win Rate
                  </p>
                  <p className="text-lg font-medium text-slate-800 mt-1">
                    {pipelineStats.conversionRate.toFixed(0)}%
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-transform">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">
                  Value & Margin
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-light tracking-tighter text-emerald-700">
                    {formatClientValue(pipelineStats.bookedValue)}
                  </p>
                </div>
              </div>
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Avg Deal
                  </p>
                  <p className="text-lg font-medium text-slate-800 mt-1">
                    {formatClientValue(pipelineStats.avgDealSize)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Est Margin
                  </p>
                  <p className="text-lg font-medium text-[#334486] mt-1">
                    {pipelineStats.avgMargin.toFixed(1)}%
                  </p>
                </div>
              </div>
            </motion.div>
            </>)}
          </motion.div>

          {showFinance && (
          <div className="px-4">
            <CashFlowSummaryWidget
              onNavigate={() => setActiveTab("reports")}
            />
          </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-4 mt-6">
            {/* Ops Feature 1: Procurement & Lead Time Risk */}
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none text-slate-800">
                <ClockIcon className="w-24 h-24" />
              </div>
              <h3 className="text-xl font-light tracking-tight text-slate-900 leading-none mb-1">
                Procurement Risk
              </h3>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mb-6">
                Long lead time items
              </p>

              <div className="space-y-4 relative z-10">
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-4">
                  <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0 animate-pulse"></div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-sm text-slate-900">
                        Italian Marble Slabs
                      </p>
                      <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded uppercase tracking-wider">
                        High Risk
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mb-2">
                      Lead time: 45-60 days. Required on site by{" "}
                      <span className="font-semibold">Nov 15</span>.
                    </p>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest pt-2 border-t border-rose-200/50">
                      <span>Project: The Oasis</span>
                      <button className="text-rose-600 hover:text-rose-800">
                        Expedite
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-4">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0"></div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-sm text-slate-900">
                        Custom Teak Joinery
                      </p>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded uppercase tracking-wider">
                        Delay Risk
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mb-2">
                      Vendor reporting 2 week delay due to labor shortage.
                    </p>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest pt-2 border-t border-amber-200/50">
                      <span>Project: Sky Villa</span>
                      <button className="text-amber-700 hover:text-amber-900">
                        Contact Vendor
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ops Feature 2: Vendor Performance Intelligence */}
            <div className="bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden h-full">
              <h3 className="text-xl font-light tracking-tight text-white leading-none mb-1">
                Contractor Health
              </h3>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mb-6">
                Bandwidth & Reliability
              </p>

              <div className="space-y-6 relative z-10">
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <p className="font-bold text-sm text-white">
                      Vinay (Civil & MEP)
                    </p>
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                      90% Capacity
                    </span>
                  </div>
                  <div className="w-full bg-sky-900 rounded-full h-1.5 mb-2">
                    <div
                      className="bg-amber-400 h-1.5 rounded-full"
                      style={{ width: "90%" }}
                    ></div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed italic">
                    Currently deployed across 3 major sites. Risk of execution
                    slowdown if assigned new projects before Dec 1.
                  </p>
                </div>

                <div className="pt-4 border-t border-sky-900">
                  <div className="flex justify-between items-end mb-2">
                    <p className="font-bold text-sm text-white">
                      Star Carpentry
                    </p>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                      Available
                    </span>
                  </div>
                  <div className="w-full bg-sky-900 rounded-full h-1.5 mb-2">
                    <div
                      className="bg-emerald-400 h-1.5 rounded-full"
                      style={{ width: "30%" }}
                    ></div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed italic">
                    Finishing up project Alpha. Ready for new mobilization
                    starting next week. 95% on-time delivery rate.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "projects" && (
        <div className="space-y-4 px-4">
          {assignOpen && <AssignProjectsModal onClose={() => setAssignOpen(false)} />}

          {/* While the library is still arriving, say so, rather than an empty
              screen that reads as "you have no projects". */}
          {loading && projects.length === 0 && (
            <div className="mb-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 flex items-center justify-center gap-2.5">
              <Dot tone="warn" live />
              <p className="text-sm font-bold text-slate-800">Loading your projects…</p>
            </div>
          )}

          {/* A Designer's list is only what they are assigned, so an empty one
              says how to get a project rather than showing a row of zeros. */}
          {!loading && isLimitedRole(currentRole) && projects.length === 0 && (
            <div className="mb-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-center">
              <p className="text-sm font-bold text-slate-800">No projects are assigned to you yet.</p>
              <p className="text-xs text-slate-500 mt-1">
                Ask your studio to add you to a project: they tick your name in Studio settings → Team, or on the project's team.
              </p>
            </div>
          )}

          {/*
            Projects as glass folders (plan item 10; DESIGN.md "Projects as glass
            folders"). The phase pills became cabinet dividers on one desk; the
            Needs-you bar, the Actual/Dummy and Engagement filters and the view
            switch run along the desk's edge; the four figures are gone (owner's
            call: no amounts on this screen). Each project is a folder coloured
            by its stage, with a waving stage flag, its Actual/Dummy tag, its
            next step as a button on the glass, and its screens as files.
          */}
          <div>
            <nav className="pf-dividers" aria-label="Stage">
              {([{ id: 'all', label: 'All', color: '#3D52A0' }, ...FOLDER_STAGES] as { id: string; label: string; color: string }[]).map((st) => {
                const live = statusFilter === st.id;
                const n = projects.filter(
                  (proj) => matchesKind(proj, kindFilter) && matchesPhase(proj, st.id) && matchesEngagement(proj) && matchesBoq(proj) && matchesSearch(proj) && matchesAlert(proj),
                ).length;
                return (
                  <button
                    key={st.id}
                    type="button"
                    aria-pressed={live}
                    onClick={() => setStatusFilter(st.id)}
                    className={`pf-div${live ? ' on' : ''}`}
                    style={{ ['--fc' as any]: st.color }}
                  >
                    {st.id !== 'all' && <i className="pf-sw" />}
                    {st.label}
                    <b>{n}</b>
                  </button>
                );
              })}
            </nav>

            <section className="pf-desk">
              <div className="pf-edge">
                <div className="pf-needs">
                  {alarm.total === 0 ? (
                    <span className="!normal-case !tracking-normal !text-xs !font-semibold !text-slate-600 flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Nothing is waiting on you.
                    </span>
                  ) : (
                    <>
                      <span>Needs you</span>
                      {(
                        [
                          { key: 'blocker', n: alarm.blocker, word: alarm.blocker === 1 ? 'blocker' : 'blockers', tone: 'red' },
                          { key: 'due', n: alarm.due, word: 'due now', tone: 'gold' },
                          { key: 'unsigned', n: alarm.unsigned, word: alarm.unsigned === 1 ? 'contract unsigned' : 'contracts unsigned', tone: '' },
                          { key: 'risk', n: alarm.risk, word: 'at risk', tone: '' },
                        ] as const
                      )
                        .filter((chip) => chip.n > 0)
                        .map((chip) => {
                          const live = alertFilter === chip.key;
                          return (
                            <button
                              key={chip.key}
                              type="button"
                              aria-pressed={live}
                              onClick={() => setAlertFilter(live ? null : (chip.key as any))}
                              title={live ? 'Showing only these. Click to clear' : 'Show only these projects'}
                              className={`pf-chip ${chip.tone}${live ? ' on' : ''}`}
                            >
                              <span className="tabular-nums">{chip.n}</span> {chip.word}
                            </button>
                          );
                        })}
                    </>
                  )}
                </div>
                <div className="pf-right">
                  <div className="pf-pop">
                    <button
                      type="button"
                      className={`pf-tool${filtersOpen || kindFilter !== 'all' || engagementFilter !== 'all' || boqFilter !== 'all' ? ' on' : ''}`}
                      aria-expanded={filtersOpen}
                      onClick={() => setFiltersOpen((o) => !o)}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      {(() => { const n = (kindFilter !== 'all' ? 1 : 0) + (engagementFilter !== 'all' ? 1 : 0) + (boqFilter !== 'all' ? 1 : 0); return `Filters${n ? ` · ${n}` : ''}`; })()}
                    </button>
                    {filtersOpen && (
                      <div className="pf-menu" role="menu">
                        <small>Show</small>
                        {(
                          [
                            { key: 'all', label: 'All projects' },
                            { key: 'actual', label: 'Actual' },
                            { key: 'dummy', label: 'Dummy' },
                            ...(projects.some((proj) => classifyProject(proj) === 'untagged') ? ([{ key: 'untagged', label: 'Untagged' }] as const) : []),
                          ] as const
                        ).map((k) => (
                          <button key={k.key} type="button" role="menuitem" onClick={() => { setKindFilter(k.key); setFiltersOpen(false); }}>
                            {k.label}
                            <span className="flex items-center gap-2">
                              {projects.filter((proj) => matchesKind(proj, k.key)).length}
                              {kindFilter === k.key && <CheckIcon className="w-3.5 h-3.5 text-[#3D52A0]" />}
                            </span>
                          </button>
                        ))}
                        <small>BOQ</small>
                        {([
                          { key: 'all', label: 'All' },
                          { key: 'playground', label: 'Playground' },
                          { key: 'classic', label: 'Classic' },
                          { key: 'none', label: 'None yet' },
                        ] as { key: 'all' | BoqTag; label: string }[]).map((b) => (
                          <button key={b.key} type="button" role="menuitem" onClick={() => { setBoqFilter(b.key); setFiltersOpen(false); }}>
                            {b.label}
                            <span className="flex items-center gap-2">
                              {projects.filter((proj) => matchesBoq(proj, b.key)).length}
                              {boqFilter === b.key && <CheckIcon className="w-3.5 h-3.5 text-[#3D52A0]" />}
                            </span>
                          </button>
                        ))}
                        {engagementsInUse.length > 1 && (
                          <>
                            <small>Engagement</small>
                            {([{ id: 'all', short: 'All' }, ...engagementsInUse] as { id: 'all' | EngagementType; short: string }[]).map((e) => (
                              <button key={e.id} type="button" role="menuitem" onClick={() => { setEngagementFilter(e.id); setFiltersOpen(false); }}>
                                {e.short}
                                <span className="flex items-center gap-2">
                                  {projects.filter((proj) => matchesEngagement(proj, e.id)).length}
                                  {engagementFilter === e.id && <CheckIcon className="w-3.5 h-3.5 text-[#3D52A0]" />}
                                </span>
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="pf-seg" role="group" aria-label="Layout">
                    <button type="button" className={deskView === 'desk' ? 'on' : ''} aria-pressed={deskView === 'desk'} aria-label="Desk" title="Desk" onClick={() => setDeskView('desk')}><LayoutGrid className="w-4 h-4" /></button>
                    <button type="button" className={deskView === 'shelves' ? 'on' : ''} aria-pressed={deskView === 'shelves'} aria-label="Shelves by stage" title="Shelves by stage" onClick={() => setDeskView('shelves')}><Rows3 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>

              {selectedForDelete.size > 0 && (
                <div className="mx-4 mt-3 rounded-2xl border border-[#3D52A0]/25 bg-[#3D52A0]/5 px-4 py-3 flex items-center justify-between gap-4 flex-wrap relative z-[6]">
                  <p className="text-sm font-bold text-[#334486]">
                    {selectedForDelete.size} project{selectedForDelete.size === 1 ? '' : 's'} selected
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelectedForDelete(new Set())} className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-white transition-colors cursor-pointer">Clear</button>
                    <button onClick={() => setDeleteTargets([...selectedForDelete])} className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors shadow-sm cursor-pointer">
                      Delete {selectedForDelete.size}
                    </button>
                  </div>
                </div>
              )}

              <div ref={deskRef} className="pf-surface">
                {filteredProjects.length === 0 && projects.length > 0 && (
                  <div className="pf-empty">
                    No project matches.{' '}
                    <button
                      type="button"
                      className="font-bold text-[#3D52A0]"
                      onClick={() => { setSearchQuery(''); setAlertFilter(null); setKindFilter('all'); setEngagementFilter('all'); setBoqFilter('all'); setStatusFilter('all'); }}
                    >
                      Clear the filters
                    </button>
                  </div>
                )}
                {(() => {
                  const folder = (project: FullProjectData, index: number, width: number) => {
                    const c: any = project.context || {};
                    const meta = [c.config || c.bhk, Number(c.area) > 0 ? `${Math.round(Number(c.area)).toLocaleString('en-IN')} sft` : null, c.location || c.city].filter(Boolean).join(' · ');
                    return (
                      <ProjectFolder
                        key={project.id}
                        id={project.id}
                        name={displayName(project)}
                        meta={meta || 'Scope to set'}
                        client={c.clientName || 'No client yet'}
                        stage={stageOfProject(project)}
                        kind={kindOf(project)}
                        boq={boqTagOf(project.tiers)}
                        files={folderFiles(project)}
                        next={folderNext(intel.get(project.id)?.action)}
                        width={width}
                        index={index}
                        active={activeProjectId === project.id}
                        selected={selectedForDelete.has(project.id)}
                        onOpen={(route) => onOpenProject(project, route)}
                        onChangeStage={() => setStatusModalProject(project)}
                        onDuplicate={() => onDuplicateProject(project)}
                        onToggleSelect={() => toggleSelected(project.id)}
                        onDelete={() => setDeleteTargets([project.id])}
                      />
                    );
                  };
                  if (deskView === 'shelves') {
                    return (
                      <div className="pf-shelves">
                        {FOLDER_STAGES.map((st) => {
                          const row = shownProjects.filter((proj) => stageOfProject(proj) === st.id);
                          if (!row.length) return null;
                          return (
                            <div key={st.id} className="pf-shelf" style={{ ['--fc' as any]: st.color }}>
                              <h2><i className="pf-sw" />{st.label}<b>{row.length}</b></h2>
                              <div className="pf-row">{row.map((proj, i) => folder(proj, i, Math.min(380, folderW)))}</div>
                              <div className="pf-plank" />
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return (
                    <div ref={cardGridRef} className="pf-grid" style={{ gridTemplateColumns: `repeat(${folderCols}, ${folderW}px)` }}>
                      {shownProjects.map((project, index) => folder(project, index, folderW))}
                    </div>
                  );
                })()}
              </div>
            </section>
          </div>

          {viewMode === "compare" && (
            <Card
              title="Strategic Decision Matrix"
              className="overflow-hidden bg-white/60 backdrop-blur-xl border-white/40 shadow-xl rounded-[2rem]"
            >
              <p className="text-sm text-slate-500 mb-6 font-medium">
                Comparing potential returns and operational load to prioritize
                the right projects.
              </p>
              <div className="overflow-x-auto rounded-2xl border border-slate-200/50 bg-white/50">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200/50">
                      <th className="p-5 w-48 font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                        Metric
                      </th>
                      {projects
                        .filter((p) => selectedForCompare.has(p.id))
                        .map((p) => (
                          <th
                            key={p.id}
                            className="p-5 min-w-[200px] font-light tracking-tighter text-slate-900 text-xl border-l border-slate-200/50"
                          >
                            {displayName(p)}
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2">
                              {p.context?.clientName || "Unknown Client"}
                            </div>
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50">
                    {/* Section 1: Financial Health */}
                    <tr className="bg-slate-50/30">
                      <td
                        colSpan={10}
                        className="p-3 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest"
                      >
                        Financial Health
                      </td>
                    </tr>
                    <tr className="hover:bg-white/50 transition-colors">
                      <td className="p-5 font-bold text-slate-600">
                        Total Value
                      </td>
                      {projects
                        .filter((p) => selectedForCompare.has(p.id))
                        .map((p) => {
                          const metrics = getProjectMetrics(p);
                          return (
                            <td
                              key={p.id}
                              className="p-5 border-l border-slate-100/50 font-light tracking-tighter text-emerald-700 text-2xl"
                            >
                              {formatClientValue(metrics.value)}
                            </td>
                          );
                        })}
                    </tr>
                    {/* ... (rest of comparison table) ... */}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === "analytics" && (
        <div className="py-8">
          <CashFlowForecastDashboard />
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTargets && deleteTargets.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/40 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/50 max-w-md w-full overflow-hidden"
            >
              <div className="p-8">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-500 flex items-center justify-center mb-6">
                  <DeleteIcon className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-light tracking-tighter text-slate-900 mb-3">
                  {deleteTargets.length === 1
                    ? 'Delete this project?'
                    : `Delete ${deleteTargets.length} projects?`}
                </h3>

                {/* Named, not counted. Nine rows called "New Project" is how
                    this list got into trouble; a dialog that says only "9
                    projects" asks somebody to trust a number they cannot
                    check. */}
                <ul className="mb-5 max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {deleteTargets.map((id) => {
                    const p: any = projects.find((x) => x.id === id);
                    const lines = (p?.tiers || []).reduce(
                      (n: number, t: any) => n + ((t.fullBoq || t.boq || []).length), 0,
                    );
                    const rooms = (p?.context?.rooms || []).length;
                    const detail = [
                      lines ? `${lines} BOQ line${lines === 1 ? '' : 's'}` : null,
                      rooms ? `${rooms} room${rooms === 1 ? '' : 's'}` : null,
                      p?.context?.clientName || null,
                    ].filter(Boolean).join(' · ');
                    return (
                      <li key={id} className="text-[13px] text-slate-700 flex items-baseline gap-2">
                        <span className="font-semibold">{displayName(p) }</span>
                        <span className="text-[11px] text-slate-400">
                          {detail || 'empty'}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                  This cannot be undone. Everything hanging off{' '}
                  {deleteTargets.length === 1 ? 'it' : 'them'} goes too — the BOQ,
                  decisions, purchase orders and documents.{' '}
                  {/* Worth saying out loud: it is the one consequence that
                      reaches somebody outside the studio. */}
                  <span className="text-slate-700 font-semibold">
                    Any client portal among them is taken down at the same time.
                  </span>
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setDeleteTargets(null)}
                    className="px-6 py-3 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      deleteTargets.forEach((id) => onDeleteProject(id));
                      setSelectedForDelete(new Set());
                      setDeleteTargets(null);
                    }}
                    className="px-6 py-3 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-all shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:-translate-y-0.5"
                  >
                    {deleteTargets.length === 1
                      ? 'Delete permanently'
                      : `Delete ${deleteTargets.length} permanently`}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Project Status Transition Modal */}
      {statusModalProject && (
        <ProjectStatusTransitionModal
          project={statusModalProject}
          isOpen={!!statusModalProject}
          onClose={() => setStatusModalProject(null)}
          onStatusChange={async (projId, newStatus, note) => {
            if (onStatusChange) {
              await onStatusChange(projId, newStatus, note);
            } else if (onQuickUpdate) {
              onQuickUpdate(projId, 'status', newStatus);
            }
            setStatusModalProject(null);
          }}
        />
      )}
    </div>
  );
};

export default ProjectListTab;
