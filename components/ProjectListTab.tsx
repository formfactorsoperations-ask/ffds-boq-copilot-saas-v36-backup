import React, { useState, useMemo, useEffect } from "react";
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

interface ProjectListTabProps {
  projects: FullProjectData[];
  activeProjectId: string | null;
  onOpenProject: (project: FullProjectData) => void;
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

/** One phase pill, one predicate. Kept together so the two cannot drift. */
const PHASES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Pipeline' },
  { key: 'proposal_sent', label: 'Proposals' },
  { key: 'won', label: 'Execution' },
  { key: 'completed', label: 'Completed' },
  { key: 'lost', label: 'Lost' },
];

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

  const matchesPhase = (proj: FullProjectData, phase: string) => {
    if (phase === 'all') return true;
    const st = proj.context?.status || 'draft';
    if (phase === 'draft') return st === 'draft' || st === 'lead';
    if (phase === 'proposal_sent')
      return st === 'proposal_sent' || st === 'negotiation';
    if (phase === 'won')
      return st === 'won' || st === 'execution' || st === 'work_paused';
    return st === phase;
  };

  const matchesSearch = (proj: FullProjectData) => {
    if (!searchQuery) return true;
    const st = (proj.context?.status || 'draft') as string;
    /* The phase word is what people actually type -- "execution", "lost" --
       and searching for one used to return nothing at all. */
    /* The pill's own word too, not just the raw status: the Execution pill
       counts seven, so typing "execution" had better not return four. */
    const bucket = PHASES.find(
      (ph) => ph.key !== 'all' && matchesPhase(proj, ph.key),
    );
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
          matchesSearch(proj) &&
          matchesAlert(proj),
      ),
    [projects, kindFilter, statusFilter, engagementFilter, searchQuery, alertFilter, intel],
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
          {/* TOP ACTION BAR: what is wrong, and the way straight to it.

              This replaces the "Today's focus" accordion, which opened closed
              and so hid its own contents by default. Each project's top action
              now rides on that project's own card; what is left worth saying
              at page level is the count, which fits on one line. */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              {alarm.total === 0 ? (
                <div className="bg-white rounded-[1.25rem] border border-slate-200 cd-panel px-4 py-2.5 flex items-center gap-3 min-h-[50px]">
                  <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </span>
                  <p className="text-xs font-semibold text-slate-700">
                    Nothing is waiting on you.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-[1.25rem] border border-slate-200 cd-panel px-4 py-2 flex items-center gap-2 flex-wrap min-h-[50px]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 shrink-0 mr-1">
                    Needs you
                  </span>
                  {(
                    [
                      {
                        key: 'blocker',
                        n: alarm.blocker,
                        word: alarm.blocker === 1 ? 'blocker' : 'blockers',
                        off: 'bg-rose-50 text-rose-700 border-rose-200',
                        on: 'bg-rose-600 text-white border-rose-600',
                      },
                      {
                        key: 'due',
                        n: alarm.due,
                        word: 'due now',
                        off: 'bg-amber-50 text-amber-800 border-amber-200',
                        on: 'bg-amber-600 text-white border-amber-600',
                      },
                      {
                        key: 'unsigned',
                        n: alarm.unsigned,
                        word:
                          alarm.unsigned === 1
                            ? 'contract unsigned'
                            : 'contracts unsigned',
                        off: 'bg-slate-50 text-slate-700 border-slate-200',
                        on: 'bg-[#3D52A0] text-white border-[#3D52A0]',
                      },
                      {
                        key: 'risk',
                        n: alarm.risk,
                        word: 'at risk',
                        off: 'bg-slate-50 text-slate-700 border-slate-200',
                        on: 'bg-[#3D52A0] text-white border-[#3D52A0]',
                      },
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
                          onClick={() =>
                            setAlertFilter(live ? null : (chip.key as any))
                          }
                          title={
                            live
                              ? 'Showing only these — click to clear'
                              : 'Show only these projects'
                          }
                          className={`px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all cursor-pointer ${
                            live ? chip.on : `${chip.off} hover:border-slate-400`
                          }`}
                        >
                          <span className="tabular-nums">{chip.n}</span> {chip.word}
                        </button>
                      );
                    })}
                  {alertFilter && (
                    <button
                      type="button"
                      onClick={() => setAlertFilter(null)}
                      className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-700 transition-colors cursor-pointer px-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* A3: hand one Designer several projects at once. */}
            {seesStudioFinance(currentRole) && (
              <motion.button
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setAssignOpen(true)}
                className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-[1.25rem] transition-colors shadow-sm flex items-center justify-center gap-2 text-xs font-bold shrink-0 cursor-pointer h-[50px]"
              >
                <Users className="w-4 h-4" /> Assign Designer
              </motion.button>
            )}
            {assignOpen && <AssignProjectsModal onClose={() => setAssignOpen(false)} />}
            {/* A Designer works on the projects they are given; they do not start them. */}
            {!isLimitedRole(currentRole) && (
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={onCreateNew}
              className="px-5 py-2.5 bg-[#3D52A0] hover:bg-[#334486] text-white rounded-[1.25rem] transition-colors shadow-sm flex items-center justify-center gap-2 text-xs font-bold shrink-0 cursor-pointer h-[50px]"
            >
              <PlusIcon className="w-4 h-4" /> New Project
            </motion.button>
            )}
          </div>

          {/* A Designer's list is only what they are assigned, so an empty one
              says how to get a project rather than showing a row of zeros. */}
          {/* While the library is still arriving, say so, rather than an empty
              screen that reads as "you have no projects". */}
          {loading && projects.length === 0 && (
            <div className="mb-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 flex items-center justify-center gap-2.5">
              <Dot tone="warn" live />
              <p className="text-sm font-bold text-slate-800">Loading your projects…</p>
            </div>
          )}

          {!loading && isLimitedRole(currentRole) && projects.length === 0 && (
            <div className="mb-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-center">
              <p className="text-sm font-bold text-slate-800">No projects are assigned to you yet.</p>
              <p className="text-[13px] text-slate-500 mt-1">
                Ask your studio to add you to a project: they tick your name in Studio settings → Team, or on the project's team.
              </p>
            </div>
          )}

          {/* 2. SUPER CLEAN TOOLBAR */}
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-transparent pt-1 pb-3 border-b border-slate-200/50 mb-4 w-full">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Kind Filter (Actual vs Dummy) */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 rounded-full border border-slate-200">
                {(
                  [
                    { key: 'all', label: 'All Projects', dot: null },
                    { key: 'actual', label: 'Actual', dot: '#ADBBDA' },
                    { key: 'dummy', label: 'Dummy', dot: '#FDE68A' },
                    /* Only worth a chip while something is unclassified. */
                    ...(projects.some((proj) => classifyProject(proj) === 'untagged')
                      ? ([{ key: 'untagged', label: 'Untagged', dot: '#FCA5A5' }] as const)
                      : []),
                  ] as const
                ).map((kind) => {
                  const live = kindFilter === kind.key;
                  const n = projects.filter(
                    (proj) =>
                      matchesKind(proj, kind.key) &&
                      matchesPhase(proj, statusFilter) &&
                      matchesSearch(proj) &&
                      matchesAlert(proj),
                  ).length;
                  return (
                    <button
                      key={kind.key}
                      type="button"
                      onClick={() => setKindFilter(kind.key)}
                      className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                        live
                          ? kind.key === 'dummy'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : kind.key === 'untagged'
                              ? 'bg-rose-500 text-white shadow-xs'
                              : kind.key === 'actual'
                                ? 'bg-[#3D52A0] text-white shadow-xs'
                                : 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {kind.dot && (
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: kind.dot }}
                        />
                      )}
                      {kind.label}
                      <span
                        className={`tabular-nums text-[10px] ${live ? 'text-white/70' : 'text-slate-400'} ${live && kind.key === 'all' ? '!text-slate-400' : ''}`}
                      >
                        {n}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Status/Phase Filter — each pill states its own size, so you
                  never click into an empty phase to find out it is empty. */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">
                  Phase:
                </span>
                {PHASES.map((phase) => {
                  const live = statusFilter === phase.key;
                  const n = projects.filter(
                    (proj) =>
                      matchesKind(proj, kindFilter) &&
                      matchesPhase(proj, phase.key) &&
                      matchesSearch(proj) &&
                      matchesAlert(proj),
                  ).length;
                  return (
                    <button
                      key={phase.key}
                      onClick={() => setStatusFilter(phase.key)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                        live
                          ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white shadow-xs'
                          : n === 0
                            ? 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {phase.label}
                      <span
                        className={`tabular-nums text-[10px] ${live ? 'text-white/70' : 'text-slate-400'}`}
                      >
                        {n}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Engagement filter: shown once the studio has design-only (or PMC) projects as well as turnkey ones. */}
              {engagementsInUse.length > 1 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">
                    Engagement:
                  </span>
                  {([{ id: 'all', short: 'All' }, ...engagementsInUse] as { id: "all" | EngagementType; short: string }[]).map((e) => {
                    const live = engagementFilter === e.id;
                    const n = projects.filter(
                      (proj) =>
                        matchesKind(proj, kindFilter) &&
                        matchesPhase(proj, statusFilter) &&
                        matchesEngagement(proj, e.id) &&
                        matchesSearch(proj) &&
                        matchesAlert(proj),
                    ).length;
                    return (
                      <button
                        key={e.id}
                        onClick={() => setEngagementFilter(e.id)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                          live
                            ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white shadow-xs'
                            : n === 0
                              ? 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {e.short}
                        <span className={`tabular-nums text-[10px] ${live ? 'text-white/70' : 'text-slate-400'}`}>{n}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 md:gap-4 w-full xl:w-auto pb-2 xl:pb-0">
              {/* The Sort dropdown and the Focus: At Risk toggle used to live
                  here. Neither was ever read by the list — `sortBy` and
                  `focusMode` changed their own appearance and nothing else.
                  The alert bar above now does the focusing, honestly. */}
              <div className="relative flex-grow min-w-[200px] md:w-64 shrink-0">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </span>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search name, client or phase…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-1.5 bg-white border border-slate-200 rounded-full text-[11px] font-bold uppercase tracking-wider text-slate-700 outline-none focus:border-slate-400 transition-all placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal"
                />
                {!searchQuery && (
                  <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 border border-slate-200 rounded px-1.5 py-[1px] pointer-events-none">
                    /
                  </kbd>
                )}
              </div>
            </div>
          </div>

          {/* What is on screen right now, in four numbers. Every figure here
              follows the filters above it — a count that ignored them would
              contradict the cards it sits on top of. */}
          <div className={`grid grid-cols-2 gap-3 mb-4 ${showFinance ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            {showFinance && (
            <div className="bg-white rounded-2xl border border-slate-200 cd-panel px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Book on screen
              </p>
              <p className="text-[22px] leading-none font-bold text-slate-900 tabular-nums mt-1.5">
                {formatClientValue(deck.book)}
              </p>
              <p className="text-[10px] text-slate-500 font-medium mt-1.5">
                {formatClientValue(deck.booked)} booked ·{' '}
                {formatClientValue(deck.pipeline)} in the pipeline
              </p>
            </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 cd-panel px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                On site
              </p>
              <p className="text-[22px] leading-none font-bold text-slate-900 tabular-nums mt-1.5">
                {deck.onSite}
              </p>
              <p className="text-[10px] text-slate-500 font-medium mt-1.5">
                of {filteredProjects.length}{' '}
                {filteredProjects.length === 1 ? 'project' : 'projects'} shown
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 cd-panel px-4 py-3">
              {/* Not "Needs you" -- the alert bar directly above already
                  carries that label, and two different counts under one word,
                  one above the other, is a screen arguing with itself. */}
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Blocked or due
              </p>
              <p
                className={`text-[22px] leading-none font-bold tabular-nums mt-1.5 ${
                  deck.needsYou > 0 ? 'text-amber-700' : 'text-slate-400'
                }`}
              >
                {deck.needsYou}
              </p>
              <p className="text-[10px] text-slate-500 font-medium mt-1.5">
                {deck.needsYou === 0
                  ? 'Nothing outstanding'
                  : 'Suggestions are not counted'}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 cd-panel px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Contracts
              </p>
              <p
                className={`text-[22px] leading-none font-bold tabular-nums mt-1.5 ${
                  deck.unsigned > 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {deck.unsigned > 0 ? deck.unsigned : '✓'}
              </p>
              <p className="text-[10px] text-slate-500 font-medium mt-1.5">
                {deck.unsigned > 0
                  ? deck.unsigned === 1
                    ? 'awaiting signature'
                    : 'awaiting signature'
                  : 'All signed and clear'}
              </p>
            </div>
          </div>

          {/* 3. PROJECT GRID */}
          {viewMode === "grid" && (
            /*
              Equal heights, deliberately.

              These cards were briefly allowed to keep their own height, because
              the slack the grid gave them was landing as a void above the money
              with nothing true to put in it. The band above now has a Recent
              slot that is always present and grows, so the slack falls inside a
              labelled section instead. With somewhere honest for it to go, a
              uniform row reads as one system rather than as eight cards padded
              out -- so stretch is back on.
            */
            <>
            {selectedForDelete.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 rounded-2xl border border-[#3D52A0]/25 bg-[#3D52A0]/5 px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
              >
                <p className="text-sm font-bold text-[#334486]">
                  {selectedForDelete.size} project{selectedForDelete.size === 1 ? '' : 's'} selected
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedForDelete(new Set())}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-white transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setDeleteTargets([...selectedForDelete])}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors shadow-sm cursor-pointer"
                  >
                    Delete {selectedForDelete.size}
                  </button>
                </div>
              </motion.div>
            )}
            <div className="relative">
              {/* Ambient refractive light field & subtle architectural blueprint grid behind crystal glass cards */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-4 -z-10 overflow-hidden rounded-[2rem]"
              >
                <div
                  className="absolute inset-0 opacity-45"
                  style={{
                    backgroundImage:
                      'radial-gradient(rgba(99, 102, 241, 0.22) 1px, transparent 1px), radial-gradient(rgba(14, 165, 233, 0.16) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                    backgroundPosition: '0 0, 12px 12px',
                  }}
                />
                <div className="absolute -top-16 left-[8%] h-72 w-72 rounded-full bg-indigo-200/45 blur-3xl" />
                <div className="absolute top-1/3 right-[6%] h-80 w-80 rounded-full bg-sky-200/40 blur-3xl" />
                <div className="absolute bottom-8 left-[32%] h-72 w-96 rounded-full bg-violet-100/45 blur-3xl" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
                <AnimatePresence>
                {shownProjects.map((project, index) => {
                  const metrics = getProjectMetrics(project);
                  const isActive = activeProjectId === project.id;
                  
                  const statusStyle =
                    STATUS_CONFIG[metrics.status] || STATUS_CONFIG["draft"];

                  /* Returns the conditions, not the markup.

                     It used to render its own block and return null when there
                     was nothing to say, which is half of why the middle of the
                     card moved around: one card had this section, the next did
                     not, and everything below it shifted. The band renders the
                     chips now, in a row that is always present. */
                  const getConditions = () => {
                    const conditions = [];

                    if (metrics.status !== "lost" && metrics.status !== "completed") {
                      // 1. Flight Risk (Pre-sales)
                      if ((metrics.status === 'lead' || metrics.status === 'proposal_sent') && project.decisionBrainOutput?.flags?.high_flight_risk) {
                        conditions.push({
                          dot: "bg-rose-500 animate-pulse",
                          text: "High Flight Risk",
                          bg: "bg-rose-50 border-rose-200 text-rose-700"
                        });
                      }

                      // 2. Critical Sign-offs Pending
                      const signoffs = [
                        { name: 'Contract', data: project.context?.contractSignoff },
                        { name: 'Design Agreement', data: project.context?.designAgreementSignoff },
                        { name: 'Handover', data: project.context?.handoverSignoff },
                      ];
                      
                      signoffs.forEach(s => {
                        if (s.data?.status === 'sent') {
                          conditions.push({
                            dot: "bg-amber-500 animate-pulse",
                            text: `${s.name} Pending Sign-off`,
                            bg: "bg-amber-50 border-amber-200 text-amber-700"
                          });
                        }
                      });

                      // 3. Execution Blockers
                      const unresolvedBlockers = project.activeProject?.executionData?.blockers?.filter(b => !b.resolved) || [];
                      const criticalBlocker = unresolvedBlockers.find(b => b.impactLevel === 'critical' || b.severity === 'high');
                      
                      if (criticalBlocker) {
                        conditions.push({
                          dot: "bg-rose-500 animate-pulse",
                          text: `Critical Blocker: ${criticalBlocker.description.substring(0, 25)}${criticalBlocker.description.length > 25 ? '...' : ''}`,
                        });
                      } else if (unresolvedBlockers.length > 0) {
                         conditions.push({
                          dot: "bg-amber-500",
                          text: `${unresolvedBlockers.length} Active Blocker${unresolvedBlockers.length > 1 ? 's' : ''}`,
                        });
                      }

                      // 4. Pending Change Requests
                      const pendingCRs = project.materials?.filter(m => m.itemType === 'change_request' && m.status === 'pending_approval')?.length || 0;
                      if (pendingCRs > 0) {
                        conditions.push({
                          dot: "bg-[#3D52A0]",
                          text: `${pendingCRs} Change Request${pendingCRs > 1 ? 's' : ''} Pending`,
                        });
                      }                      // 5. Payment Pending
                      const pendingPayments = project.context?.paymentMilestones?.filter((m) => {
                          const st = m.status?.toLowerCase();
                          return st === "invoiced" || st === "advance_requested";
                      });

                      if (pendingPayments && pendingPayments.length > 0) {
                        conditions.push({
                          dot: "bg-amber-500 animate-pulse",
                          text: pendingPayments.length === 1 ? 'Payment Pending' : `${pendingPayments.length} Payments Pending`,
                          isAlert: true
                        });
                      }

                      // 6. Pending Decisions
                      const pendingDecisions =
                        project.activeProject?.executionData?.decisions?.filter(
                          (d) => !d.resolved,
                        )?.length || 0;
                      if (pendingDecisions > 0) {
                        conditions.push({
                          dot: "bg-amber-500",
                          text: `${pendingDecisions} pending decision${pendingDecisions > 1 ? "s" : ""}`,
                        });
                      }

                      // 7. SOF Items Pending
                      const pendingSofItems =
                        project.activeProject?.executionData?.sofItems?.filter(
                          (s) => s.status === "pending",
                        )?.length || 0;
                      if (pendingSofItems > 0) {
                        conditions.push({
                          dot: "bg-[#3D52A0]",
                          text: `${pendingSofItems} SOF item${pendingSofItems > 1 ? "s" : ""} pending`,
                        });
                      }
                    }

                    return conditions;
                  };

                  const conditions = getConditions();
                  // The studio's next move (agreements, invoices, sign-offs) is not
                  // a Designer's; their work on a project is in the Drawing Tracker.
                  const nextMove =
                    DORMANT.includes(metrics.status) || isLimitedRole(currentRole)
                      ? null
                      : intel.get(project.id)?.action || null;

                  const progressValue = (() => {
                    if (metrics.status === 'completed') return 100;
                    if (metrics.status === 'execution' || metrics.status === 'work_paused') {
                      return 60 + Math.floor(((project.context?.journeySummary?.pct || 0) / 100) * 40);
                    }
                    if (metrics.status === 'won') return 40;
                    if (metrics.status === 'negotiation') return 30;
                    if (metrics.status === 'proposal_sent') return 20;
                    if (metrics.status === 'draft') return 10;
                    return 0;
                  })();

                  const renderFinancialSummary = () => (
                    <div className="w-full" data-lgf-interactive="true">
                      {project.tiers && project.tiers.length > 0 ? (
                        <>
                          {project.tiers
                            .filter((t) => t.id === project.context?.approvedTierId)
                            .map((tier) => {
                              const total = valueOf(project);
                              return (
                                <div key={tier.id} className="flex justify-between items-end">
                                  <div>
                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.1em] mb-0.5">
                                      Approved
                                    </p>
                                    <p className="text-lg font-bold text-slate-900 leading-none tabular-nums">
                                      {formatClientValue(total)}
                                    </p>
                                  </div>
                                  {showFinance && !isFeeOnly(engagementOf(project.context)) && (
                                    <MarginReveal
                                      variant="glass"
                                      value={Number(
                                        tier.summary.blendedGm?.toFixed(0) ||
                                          tier.summary.totalGm?.toFixed(0) ||
                                          0,
                                      )}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          {!project.context?.approvedTierId && (
                            <div className="flex justify-between items-end">
                              <div>
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.1em] mb-0.5">
                                  Pipeline
                                </p>
                                {valueOf(project) > 0 ? (
                                  <p className="text-lg font-bold text-slate-900 leading-none tabular-nums">
                                    {formatClientValue(valueOf(project))}
                                  </p>
                                ) : (
                                  <p className="text-sm font-semibold text-slate-400 leading-none h-[18px] flex items-end">
                                    Not priced yet
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.1em] mb-0.5">
                              Est. Value
                            </p>
                            {valueOf(project) > 0 ? (
                              <p className="text-lg font-bold text-slate-800 leading-none tabular-nums">
                                {formatClientValue(valueOf(project))}
                              </p>
                            ) : (
                              <p className="text-sm font-semibold text-slate-400 leading-none h-[18px] flex items-end">
                                Not priced yet
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );

                  const activeOrApprovedTier =
                    project.tiers?.find((t) => t.id === project.context?.approvedTierId) ||
                    project.tiers?.find((t) => t.id === project.activeTierId) ||
                    project.tiers?.[0];
                  const boqLineCount =
                    (activeOrApprovedTier as any)?.fullBoq?.length ||
                    (activeOrApprovedTier as any)?.boq?.length ||
                    0;
                  const roomCount = project.context?.rooms?.length || 0;
                  const roomNames = (project.context?.rooms || [])
                    .map((r) => r.name?.trim())
                    .filter(Boolean) as string[];

                  const primaryConfigLabel =
                    project.context?.config?.trim() ||
                    engagementDef(engagementOf(project.context)).label;
                  const areaLabel = project.context?.area
                    ? `${Number(project.context.area).toLocaleString('en-IN', { maximumFractionDigits: 0 })} sft`
                    : null;
                  const locationLabel = project.context?.location?.trim() || 'Location TBD';
                  const themeLabel = project.context?.theme?.trim() || null;

                  // Radial gauge fill (0..1) for scope density (rooms + BOQ lines)
                  const scopeDensityPct = Math.min(
                    100,
                    Math.max(12, Math.round((roomCount * 4 + boqLineCount * 1.2))),
                  );
                  const gaugeRadius = 15;
                  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
                  const gaugeStrokeOffset =
                    gaugeCircumference * (1 - scopeDensityPct / 100);

                  // Lifecycle 5-node visual stepper mapping
                  const lifecycleStages = [
                    { key: 'draft', label: 'Lead', icon: FileText, threshold: 10 },
                    { key: 'proposal', label: 'Quote', icon: Send, threshold: 25 },
                    { key: 'won', label: 'Won', icon: Trophy, threshold: 40 },
                    { key: 'execution', label: 'Site', icon: Hammer, threshold: 70 },
                    { key: 'completed', label: 'Done', icon: CheckCircle2, threshold: 100 },
                  ];
                  const activeStageIdx =
                    metrics.status === 'completed'
                      ? 4
                      : metrics.status === 'execution' || metrics.status === 'work_paused'
                        ? 3
                        : metrics.status === 'won'
                          ? 2
                          : metrics.status === 'proposal_sent' || metrics.status === 'negotiation'
                            ? 1
                            : 0;

                  const frontFace = (
                    <div className="flex flex-col h-full w-full select-none text-slate-900">
                      {/* Front Top: Status, Classification, Progress & Dossier Header */}
                      <div className="shrink-0">
                        <div className="pb-3 border-b border-white/60">
                          <div className="flex justify-between items-start pr-11 gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                data-lgf-interactive="true"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setStatusModalProject(project);
                                }}
                                className="group/status flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full whitespace-nowrap bg-gradient-to-br from-white/85 via-white/65 to-white/45 backdrop-blur-md text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-800 border border-white/95 shadow-[inset_0_1.5px_1px_rgba(255,255,255,1),0_4px_10px_-2px_rgba(15,23,42,0.08)] transition-all hover:scale-105 hover:from-white/95 hover:to-white/70 cursor-pointer"
                                title="Click to change project status & manage downstream impacts"
                              >
                                <ProjectStatusIllustration status={metrics.status} size={22} />
                                <span>{statusStyle.label}</span>
                                <ChevronDown className="w-2.5 h-2.5 opacity-60 group-hover/status:opacity-100 transition-opacity" />
                              </button>

                              {/* Waving Pinned-Note Classification Tag */}
                              {(() => {
                                const kind = classifyProject(project);
                                const isDummy = kind === 'test';
                                const untagged = kind === 'untagged';
                                return (
                                  /* The same wave as before, written as one transform so
                                     framer-motion hands it to the browser's compositor.
                                     As separate rotate and y it ran in JavaScript every
                                     frame on every card, over a blurred backdrop, forever:
                                     the screen held the main thread ~45% busy while idle. */
                                  <motion.div
                                    animate={reduceMotion ? undefined : {
                                      transform: [
                                        'translateY(0px) rotate(-2deg)',
                                        'translateY(-1px) rotate(4deg)',
                                        'translateY(0px) rotate(-3deg)',
                                        'translateY(-1px) rotate(2deg)',
                                        'translateY(0px) rotate(-2deg)',
                                      ],
                                    }}
                                    transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md border transition-colors shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.95)] ${
                                      untagged
                                        ? 'bg-rose-50/75 text-rose-700 border-rose-200/80'
                                        : isDummy
                                          ? 'bg-amber-50/75 text-amber-800 border-amber-200/80'
                                          : 'bg-sky-50/75 text-sky-800 border-sky-200/85'
                                    }`}
                                    title={
                                      untagged
                                        ? 'Not classified yet — open the project and tag it Actual or Dummy'
                                        : `Project is marked as ${isDummy ? 'Dummy / Demo' : 'Actual Site'}`
                                    }
                                  >
                                    <Pin className={`w-2.5 h-2.5 ${untagged ? 'text-rose-500' : isDummy ? 'text-amber-500' : 'text-sky-600'}`} />
                                    <span className="capitalize">{untagged ? 'Untagged' : isDummy ? 'Dummy' : 'Actual'}</span>
                                  </motion.div>
                                );
                              })()}

                              {isFeeOnly(engagementOf(project.context)) && (
                                <span
                                  className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/70 border border-white/90 text-slate-600 shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.95)]"
                                  title={engagementDef(engagementOf(project.context)).blurb}
                                >
                                  {engagementDef(engagementOf(project.context)).label}
                                </span>
                              )}

                              {metrics.riskScore > 0 && (
                                <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] bg-rose-50/80 text-rose-700 border border-rose-200/85 shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.9)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                  At Risk
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Status Progress Bar */}
                          <div className="flex items-center justify-between gap-3 mt-2.5">
                            <div className="flex gap-[2px] flex-1">
                              {[...Array(10)].map((_, i) => {
                                const barColor =
                                  metrics.status === 'completed'
                                    ? 'bg-emerald-500'
                                    : metrics.status === 'execution'
                                      ? 'bg-[#3D52A0]'
                                      : metrics.status === 'work_paused'
                                        ? 'bg-rose-500'
                                        : metrics.status === 'won'
                                          ? 'bg-emerald-500'
                                          : metrics.status === 'negotiation'
                                            ? 'bg-amber-500'
                                            : metrics.status === 'proposal_sent'
                                              ? 'bg-sky-500'
                                              : 'bg-slate-400';

                                const isFilled = (i + 1) * 10 <= progressValue + 5;

                                return (
                                  <div
                                    key={i}
                                    className={`h-1.5 flex-1 rounded-[1px] transition-colors duration-300 ${
                                      isFilled ? barColor : 'bg-slate-900/10'
                                    }`}
                                  />
                                );
                              })}
                            </div>
                            <span className="text-[10px] font-bold text-slate-600 tracking-wider tabular-nums min-w-[28px] text-right">
                              {progressValue}%
                            </span>
                          </div>
                        </div>

                        {/* Project Name & Client Dossier */}
                        <div className="pt-3 pb-2">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.12em]">
                              Project Dossier
                            </p>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0 bg-[#3D52A0] shadow-xs">
                                {(project.context?.clientName || "U").charAt(0).toUpperCase()}
                              </div>
                              <p className="text-[10.5px] text-slate-700 font-semibold truncate max-w-[150px]">
                                {project.context?.clientName || "Unknown Client"}
                              </p>
                            </div>
                          </div>

                          <h3
                            className="text-[1.28rem] font-semibold tracking-tight text-slate-900 leading-snug line-clamp-2"
                            title={displayName(project)}
                          >
                            {displayName(project)}
                          </h3>
                        </div>
                      </div>

                      {/* Front Middle: Static Spatial Bento + Lifecycle Stepper + Darker-Shaded Room Text Band */}
                      <div className="flex-1 flex flex-col justify-between py-3 border-y border-white/60 gap-3">
                        {/* 1. 2-Column Visual Bento: Property Footprint & BOQ Scope */}
                        <div className="grid grid-cols-2 gap-2.5">
                          {/* Left Tile: Property Footprint & Location */}
                          <div className="rounded-2xl bg-gradient-to-br from-white/82 via-white/58 to-white/35 backdrop-blur-md border border-white/95 p-3 shadow-[inset_0_1.5px_1px_rgba(255,255,255,1),0_6px_14px_-6px_rgba(15,23,42,0.08)] flex flex-col justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-indigo-500/12 border border-indigo-200/70 flex items-center justify-center shrink-0 text-[#3D52A0] shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.9)]">
                                <Home className="w-4 h-4" strokeWidth={2.2} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13.5px] font-extrabold text-slate-900 leading-tight truncate">
                                  {primaryConfigLabel}
                                </p>
                                <p className="text-[11px] font-bold text-[#3D52A0] tabular-nums leading-tight truncate mt-0.5">
                                  {areaLabel || 'Area TBD'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-slate-200/50 text-[10.5px] font-semibold text-slate-600">
                              <span className="inline-flex items-center gap-1 min-w-0 truncate" title={locationLabel}>
                                <MapPin className="w-3 h-3 text-sky-600 shrink-0" strokeWidth={2.3} />
                                <span className="truncate">{locationLabel}</span>
                              </span>
                              {themeLabel && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/80 border border-white/90 text-[9.5px] font-bold capitalize text-slate-700 shrink-0"
                                  title={`Theme: ${themeLabel}`}
                                >
                                  <Palette className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                                  <span className="truncate max-w-[56px]">{themeLabel}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right Tile: Radial Scope & BOQ Density */}
                          <div className="rounded-2xl bg-gradient-to-br from-white/82 via-white/58 to-white/35 backdrop-blur-md border border-white/95 p-3 shadow-[inset_0_1.5px_1px_rgba(255,255,255,1),0_6px_14px_-6px_rgba(15,23,42,0.08)] flex flex-col justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="relative w-9 h-9 shrink-0 flex items-center justify-center">
                                <svg className="w-9 h-9 -rotate-90" viewBox="0 0 38 38">
                                  <circle
                                    cx="19"
                                    cy="19"
                                    r={gaugeRadius}
                                    fill="none"
                                    stroke="rgba(148,163,184,0.22)"
                                    strokeWidth="3.2"
                                  />
                                  <circle
                                    cx="19"
                                    cy="19"
                                    r={gaugeRadius}
                                    fill="none"
                                    stroke="#3D52A0"
                                    strokeWidth="3.2"
                                    strokeLinecap="round"
                                    strokeDasharray={gaugeCircumference}
                                    strokeDashoffset={gaugeStrokeOffset}
                                  />
                                </svg>
                                <Layers className="w-3.5 h-3.5 text-[#3D52A0] absolute" strokeWidth={2.3} />
                              </div>

                              <div className="min-w-0">
                                <p className="text-[13.5px] font-extrabold text-slate-900 tabular-nums leading-tight truncate">
                                  {roomCount} {roomCount === 1 ? 'Room' : 'Rooms'}
                                </p>
                                <p className="text-[11px] font-bold text-[#3D52A0] tabular-nums leading-tight truncate mt-0.5">
                                  {boqLineCount > 0 ? `${boqLineCount} BOQ Lines` : 'BOQ Pending'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-200/50">
                              <span className="text-[10px] font-bold text-slate-500 truncate">
                                {boqLineCount > 0 ? 'Priced Scope' : 'Takeoff Queue'}
                              </span>
                              <span className="text-[10px] font-bold text-slate-600 tabular-nums shrink-0">
                                {scopeDensityPct}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 2. Static 5-Stage Lifecycle Stepper Track */}
                        <div className="rounded-2xl bg-gradient-to-br from-white/78 via-white/50 to-white/28 backdrop-blur-md border border-white/95 px-3.5 py-2.5 shadow-[inset_0_1.5px_1px_rgba(255,255,255,1),0_4px_12px_-4px_rgba(15,23,42,0.05)]">
                          <div className="relative flex items-center justify-between">
                            <div className="absolute left-3 right-3 top-[13px] h-[2px] bg-slate-200/80 rounded-full" />
                            <div
                              style={{
                                width: `${Math.min(100, Math.max(0, (activeStageIdx / (lifecycleStages.length - 1)) * 88))}%`,
                              }}
                              className="absolute left-3 top-[13px] h-[2px] bg-gradient-to-r from-[#3D52A0] via-sky-500 to-emerald-500 rounded-full"
                            />

                            {lifecycleStages.map((st, idx) => {
                              const StageIcon = st.icon;
                              const isDone = idx < activeStageIdx;
                              const isCurrent = idx === activeStageIdx;
                              return (
                                <div key={st.key} className="relative z-10 flex flex-col items-center gap-1">
                                  <div
                                    className={`w-7 h-7 rounded-full flex items-center justify-center border ${
                                      isCurrent
                                        ? 'bg-[#3D52A0] text-white border-white shadow-[0_2px_8px_rgba(61,82,160,0.4)] scale-105'
                                        : isDone
                                          ? 'bg-emerald-500 text-white border-white shadow-xs'
                                          : 'bg-white/90 text-slate-400 border-slate-200/90'
                                    }`}
                                  >
                                    <StageIcon className="w-3.5 h-3.5" strokeWidth={2.3} />
                                  </div>
                                  <span
                                    className={`text-[8.5px] font-extrabold uppercase tracking-wider leading-none ${
                                      isCurrent
                                        ? 'text-[#3D52A0]'
                                        : isDone
                                          ? 'text-slate-700'
                                          : 'text-slate-400'
                                    }`}
                                  >
                                    {st.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 3. Calm Darker-Shaded Recessed Surface with Static Room Scope Text */}
                        <div className="rounded-2xl bg-slate-900/[0.06] border border-slate-900/[0.08] shadow-[inset_0_2px_4px_rgba(15,23,42,0.06)] px-3.5 py-3 flex flex-col justify-center gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              Mapped Spaces
                            </span>
                            {roomNames.length > 4 && (
                              <span
                                className="text-[9.5px] font-bold text-[#3D52A0] tabular-nums"
                                title={roomNames.slice(4).join(' · ')}
                              >
                                +{roomNames.length - 4} more
                              </span>
                            )}
                          </div>
                          <p
                            className="text-[12px] font-semibold text-slate-700 leading-relaxed line-clamp-2"
                            title={roomNames.join(' · ')}
                          >
                            {roomNames.length > 0
                              ? roomNames.slice(0, 4).join('  ·  ')
                              : 'Spatial rooms not mapped yet'}
                          </p>
                        </div>
                      </div>

                      {/* Front Bottom: Primary Open CTA + Flip Hint */}
                      <div className="mt-auto pt-2.5 shrink-0 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          data-lgf-interactive="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenProject(project);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#3D52A0] hover:bg-[#314388] text-white text-[10px] font-bold uppercase tracking-[0.14em] shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.4),0_8px_18px_-6px_rgba(61,82,160,0.5)] transition-colors cursor-pointer"
                        >
                          <span>Open Project</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        <span className="text-[9.5px] font-bold uppercase tracking-widest text-slate-500">
                          {conditions.length > 0
                            ? `${conditions.length} ${conditions.length === 1 ? 'flag' : 'flags'} · Flip →`
                            : 'Flip for commercials & ops →'}
                        </span>
                      </div>
                    </div>
                  );

                  const backFace = (
                    <div className="flex flex-col h-full w-full justify-between select-none text-slate-900">
                      <div>
                        {/* Back Header: Team Assignment & Last Modified */}
                        <div className="pb-2.5 border-b border-white/60 pr-11 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#3D52A0] truncate">
                              {displayName(project)}
                            </p>
                            <p className="text-[10px] font-semibold text-slate-500 tabular-nums mt-0.5">
                              Modified {timeAgo(project.lastModified)}
                              {project.context?.bookedOn ? ` · Booked ${project.context.bookedOn}` : ''}
                            </p>
                          </div>
                          <div className="shrink-0" data-lgf-interactive="true">
                            <ProjectTeamButton project={project} size="sm" align="right" />
                          </div>
                        </div>

                        {/* Commercials, Margin & Governance (Exclusive to Back) */}
                        <div className="py-2.5 border-b border-white/60 flex flex-col gap-2">
                          <div className="bg-gradient-to-br from-white/78 via-white/52 to-white/32 backdrop-blur-md border border-white/90 shadow-[inset_0_1.5px_1px_rgba(255,255,255,1),0_4px_12px_-4px_rgba(15,23,42,0.06)] rounded-xl px-3 py-2">
                            {renderFinancialSummary()}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <div className="bg-gradient-to-br from-white/75 to-white/38 border border-white/90 shadow-[inset_0_1px_0.5px_rgba(255,255,255,1)] rounded-lg px-2 py-1">
                              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">
                                Rooms
                              </p>
                              <p className="text-[11px] font-bold text-slate-800 tabular-nums">
                                {roomCount > 0 ? `${roomCount} spaces` : 'Unmapped'}
                              </p>
                            </div>
                            <div className="bg-gradient-to-br from-white/75 to-white/38 border border-white/90 shadow-[inset_0_1px_0.5px_rgba(255,255,255,1)] rounded-lg px-2 py-1">
                              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">
                                BOQ Scope
                              </p>
                              <p className="text-[11px] font-bold text-slate-800 tabular-nums">
                                {boqLineCount > 0 ? `${boqLineCount} lines` : 'No lines'}
                              </p>
                            </div>
                            <div className="bg-gradient-to-br from-white/75 to-white/38 border border-white/90 shadow-[inset_0_1px_0.5px_rgba(255,255,255,1)] rounded-lg px-2 py-1">
                              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">
                                Governance
                              </p>
                              <p className="text-[11px] font-bold text-slate-800 truncate">
                                {project.context?.boqFrozen
                                  ? 'BOQ Frozen'
                                  : project.context?.portalAccess?.token
                                    ? 'Portal Live'
                                    : 'Editable'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Operational Signals, Payment Health & Flags (Exclusive to Back) */}
                        <div className="py-2.5 border-b border-white/60 flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                              <Flag className="w-2.5 h-2.5 shrink-0 text-[#3D52A0]" strokeWidth={2.6} />
                              Flags & Payment Health
                            </span>
                            <div className="flex items-center gap-2">
                              {(project.context?.commsSummary?.pendingCount || 0) > 0 && (
                                <span className="text-[9.5px] font-bold uppercase tracking-wider text-amber-700">
                                  {project.context!.commsSummary!.pendingCount} comms
                                </span>
                              )}
                              {showFinance && metrics.status !== 'lost' && (
                                <div className="scale-90 origin-right" data-lgf-interactive="true">
                                  <ProjectPaymentBadge projectId={project.id} milestones={project.context?.paymentMilestones || []} size="sm" />
                                </div>
                              )}
                            </div>
                          </div>

                          {conditions.length === 0 ? (
                            <p className="text-[11px] font-medium text-slate-500">
                              No active blockers, pending sign-offs or overdue flags.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {conditions.slice(0, 3).map((c: any, idx: number) => (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[9.5px] font-bold uppercase tracking-wider border shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.9)] ${
                                    c.isAlert
                                      ? 'bg-rose-50/80 border-rose-200/85 text-rose-700'
                                      : 'bg-white/75 border-white/90 text-slate-700'
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                                  <span className="truncate max-w-[200px]">{c.text}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Document Meter (Exclusive to Back) */}
                        <div className="py-2 border-b border-white/60" data-lgf-interactive="true">
                          <DocumentMeter projectContext={project.context} />
                        </div>

                        {/* Immediate Next Move (Moved to Back in place of Recent Activity) */}
                        <div className="pt-2.5 flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                              <Zap className="w-2.5 h-2.5 shrink-0 text-[#3D52A0]" strokeWidth={2.6} />
                              Immediate Next Move
                            </span>
                            {nextMove?.priority && (
                              <span
                                className={`text-[8.5px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
                                  nextMove.priority === 'blocker'
                                    ? 'bg-rose-50/90 text-rose-700 border-rose-200'
                                    : nextMove.priority === 'due'
                                      ? 'bg-amber-50/90 text-amber-800 border-amber-200'
                                      : 'bg-indigo-50/90 text-[#3D52A0] border-indigo-200'
                                }`}
                              >
                                {nextMove.priority}
                              </span>
                            )}
                          </div>
                          {nextMove ? (
                            (() => {
                              const urgent =
                                nextMove.priority === 'blocker' || nextMove.priority === 'due';
                              const skin =
                                nextMove.priority === 'blocker'
                                  ? 'bg-gradient-to-br from-rose-50/90 to-rose-100/55 text-rose-800 border-rose-200/90 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.95)]'
                                  : nextMove.priority === 'due'
                                    ? 'bg-gradient-to-br from-amber-50/90 to-amber-100/55 text-amber-900 border-amber-200/90 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.95)]'
                                    : 'bg-gradient-to-br from-white/85 to-white/50 text-slate-800 border-white/95 shadow-[inset_0_1.5px_1px_rgba(255,255,255,1)]';
                              return (
                                <motion.div
                                  title={nextMove.why}
                                  animate={
                                    urgent && !reduceMotion
                                      /* One transform, so it runs on the compositor; see the tag above. */
                                      ? { transform: ['rotate(-0.4deg)', 'rotate(0.4deg)', 'rotate(-0.3deg)', 'rotate(0.3deg)', 'rotate(-0.4deg)'] }
                                      : undefined
                                  }
                                  transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
                                  className={`w-full flex items-start gap-2 px-3 py-2 rounded-xl border backdrop-blur-md text-[11.5px] font-semibold leading-snug origin-left ${skin}`}
                                >
                                  {nextMove.blockedBy && (
                                    <Lock className="w-3 h-3 shrink-0 mt-[2px]" strokeWidth={2.4} />
                                  )}
                                  <span className="min-w-0 line-clamp-2">
                                    {nextMove.title}
                                    {nextMove.blockedBy && (
                                      <span className="font-medium opacity-75">
                                        {' '}· waiting on {nextMove.blockedBy}
                                      </span>
                                    )}
                                  </span>
                                </motion.div>
                              );
                            })()
                          ) : (
                            <div className="px-3 py-2 rounded-xl bg-gradient-to-br from-white/75 to-white/40 border border-white/90 text-[11px] font-medium text-slate-500 shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.95)]">
                              {isDesignerRole(currentRole) ? 'Open project to view drawings' : 'Nothing blocking or waiting'}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Back Footer: Management Toolbar (Status, Clone, Select, Delete) */}
                      <div
                        className="mt-3 pt-2.5 border-t border-white/60 flex items-center justify-between gap-2"
                        data-lgf-interactive="true"
                      >
                        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          Manage Card
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatusModalProject(project);
                            }}
                            className="px-2.5 py-1.5 flex items-center gap-1 bg-gradient-to-br from-white/85 to-white/55 border border-white/95 text-slate-700 hover:from-white hover:to-white/80 rounded-lg text-[10.5px] font-bold transition-colors shadow-[inset_0_1px_0.5px_rgba(255,255,255,1),0_2px_6px_-2px_rgba(15,23,42,0.06)] cursor-pointer"
                            title="Change Status & Phase"
                          >
                            <SlidersHorizontal className="w-3 h-3 text-[#3D52A0]" />
                            <span>Status</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDuplicateProject(project);
                            }}
                            className="px-2.5 py-1.5 flex items-center gap-1 bg-gradient-to-br from-white/85 to-white/55 border border-white/95 text-slate-700 hover:from-white hover:to-white/80 rounded-lg text-[10.5px] font-bold transition-colors shadow-[inset_0_1px_0.5px_rgba(255,255,255,1),0_2px_6px_-2px_rgba(15,23,42,0.06)] cursor-pointer"
                            title="Clone as template — copies rooms and priced scope, not the client, payments or sign-offs"
                          >
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span>Clone</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelected(project.id);
                            }}
                            className={`w-7 h-7 flex items-center justify-center border rounded-lg transition-colors shadow-[inset_0_1px_0.5px_rgba(255,255,255,1)] cursor-pointer ${
                              selectedForDelete.has(project.id)
                                ? 'bg-[#3D52A0] border-[#3D52A0] text-white'
                                : 'bg-gradient-to-br from-white/85 to-white/55 border-white/95 text-slate-500 hover:text-slate-800 hover:from-white'
                            }`}
                            title={selectedForDelete.has(project.id) ? 'Selected' : 'Select'}
                            aria-pressed={selectedForDelete.has(project.id)}
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTargets([project.id]);
                            }}
                            className="w-7 h-7 flex items-center justify-center bg-gradient-to-br from-white/85 to-white/55 border border-white/95 text-slate-500 hover:text-rose-600 hover:from-rose-50 hover:to-rose-100/70 hover:border-rose-200 rounded-lg transition-colors shadow-[inset_0_1px_0.5px_rgba(255,255,255,1)] cursor-pointer"
                            title="Delete"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );

                  return (
                    <motion.div
                      key={project.id}
                      initial={{ opacity: 0, y: 30, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      /* The ripple stops at the first screenful. Uncapped, the fortieth
                         card waited two seconds to begin appearing. */
                      transition={{ duration: 0.4, delay: Math.min(index, FIRST_CARDS - 1) * 0.05, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <LiquidGlassFlipCard
                        ariaLabel={displayName(project)}
                        trigger="click"
                        drag={true}
                        axis="horizontal"
                        surface="light"
                        material="clear"
                        tint={isActive ? "#E0E7FF" : "#FFFFFF"}
                        textColor="#0F172A"
                        radius="24px"
                        padding="20px"
                        liquidity={45}
                        tilt={60}
                        flipButton={true}
                        shadow="prism"
                        focusColor="#3D52A0"
                        optics={{
                          blur: 14,
                          depth: 28,
                          refraction: 85,
                          dispersion: 55,
                          light: 92,
                        }}
                        style={{
                          boxShadow: isActive ? "0 0 0 2px #3D52A0" : undefined,
                          borderRadius: "24px",
                        }}
                        frontLayer={frontFace}
                        backLayer={backFace}
                      />
                    </motion.div>
                  );
                })}
                </AnimatePresence>
              </div>
            </div>
            </>
          )}

          {/* --- COMPARISON VIEW --- */}
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
