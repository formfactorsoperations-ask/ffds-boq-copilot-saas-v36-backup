import React, { useState, useMemo, useEffect } from "react";
import { db } from '../services/dbService';
import { FullProjectData, ProjectStatus } from "../types";
import Card from "./shared/Card";
import { BuildingOfficeIcon, PlusIcon, NewFileIcon, DeleteIcon } from "./Icons";
import { formatClientValue, timeAgo, formatCurrency } from "../lib/utils";
import { getSingleProjectValue } from "../lib/financialsUtils";
import { motion, AnimatePresence } from "framer-motion";
import { Info, PlayCircle, PauseCircle, CheckCircle, FileText, Send, MessageSquare, Briefcase, Zap, Trophy, LayoutDashboard, SlidersHorizontal, XCircle, Pin } from "lucide-react";
import { ProjectPaymentBadge } from "./PaymentHealth";
import DocumentMeter from "./ops/DocumentMeter";
import { ClockIcon } from "./Icons";
import {
  fetchPaymentHealthScore,
  PaymentHealth,
} from "../hooks/usePaymentHealthScore";
import {
  CashFlowSummaryWidget,
  CashFlowForecastDashboard,
} from "./CashFlowForecastDashboard";
import { useOrg } from "../contexts/OrgContext";
import { useMomActions } from "../hooks/useMomActions";
import { getNextActions, NextAction } from "../services/nextActionEngine";
import { buildDocumentCompleteness, DocumentCompleteness } from "../lib/documentCompleteness";
import { Lock, ArrowRight, CheckSquare, ChevronDown, ChevronUp } from "lucide-react";
import ProjectStatusTransitionModal from "./ProjectStatusTransitionModal";
import { CardContainer, CardBody, CardItem } from "./ui/3d-card";

interface ProjectListTabProps {
  projects: FullProjectData[];
  activeProjectId: string | null;
  onOpenProject: (project: FullProjectData) => void;
  onCreateNew: () => void;
  onDeleteProject: (id: string) => void;
  onDuplicateProject: (project: FullProjectData) => void;
  onQuickUpdate?: (projectId: string, field: string, value: any) => void;
  onStatusChange?: (projectId: string, newStatus: ProjectStatus, note?: string) => Promise<void> | void;
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

/*
  Three planes, not nine numbers.

  The card lifted its layers to 25, 35, 28, 25, 20, 15, 30, 15 and 0 reading
  downward, which put the project name in front of the money and the badges in
  front of the indicators. That is not a hierarchy, it is nine values that each
  happened to look fine alone. Depth should say the same thing the type sizes
  say: chrome sits on the surface, supporting detail lifts a little, and the
  three things you came to read lift most.
*/
/** Card chrome and running detail -- flat with the card's own surface. */
const Z_SURFACE = 0;
/** Contained panels that read as objects: the next move, the documents block. */
const Z_DETAIL = 14;
/** What the card is for: the project name and the money. */
const Z_LEAD = 26;

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
}) => {
  const { orgData } = useOrg();
  const siteSupervisors =
    orgData?.team?.filter((m) => m.role === "Site Supervisor") || [];
  const [viewMode, setViewMode] = useState<"grid" | "compare">("grid");
  const { openActions, overdueActions } = useMomActions(
    undefined,
    orgData?.tenantId || "demo-tenant-01",
  );
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(
    new Set(),
  );
  const [activeTab, setActiveTab] = useState<"projects" | "intelligence" | "analytics">("projects");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | "actual" | "dummy">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [statusModalProject, setStatusModalProject] = useState<FullProjectData | null>(null);
  /* Set by the alert bar's chips. The bar is the only thing that writes it,
     and clicking the live chip again clears it. */
  const [alertFilter, setAlertFilter] = useState<
    'blocker' | 'due' | 'unsigned' | 'risk' | null
  >(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  const isDummyProject = (p: FullProjectData) => {
    if (p.context?.isDummy !== undefined) return p.context.isDummy;
    if (p.context?.projectCategory) return p.context.projectCategory === 'dummy';
    const name = (p.context?.name || '').toLowerCase();
    return name.includes('sample') || name.includes('demo') || name.includes('test');
  };

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
    const role = orgData?.role || 'Admin';
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
  }, [projects, orgData?.role]);

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
    kind === 'all' ||
    (kind === 'actual' ? !isDummyProject(proj) : isDummyProject(proj));

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

  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (proj) =>
          matchesKind(proj, kindFilter) &&
          matchesPhase(proj, statusFilter) &&
          matchesSearch(proj) &&
          matchesAlert(proj),
      ),
    [projects, kindFilter, statusFilter, searchQuery, alertFilter, intel],
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
          </motion.div>

          <div className="px-4">
            <CashFlowSummaryWidget
              onNavigate={() => setActiveTab("reports")}
            />
          </div>

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
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={onCreateNew}
              className="px-5 py-2.5 bg-[#3D52A0] hover:bg-[#334486] text-white rounded-[1.25rem] transition-colors shadow-sm flex items-center justify-center gap-2 text-xs font-bold shrink-0 cursor-pointer h-[50px]"
            >
              <PlusIcon className="w-4 h-4" /> New Project
            </motion.button>
          </div>

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
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
              items-start, so a card ends where its content ends.

              A grid stretches every item to its row's tallest by default, and
              on this book that meant 356px cards padded out to sit beside
              484px ones -- eight cards carrying between 40 and 128px of white
              above the money, with nothing true to put in it. Letting them
              keep their own height removes the space rather than filling it.
              The trade is a ragged bottom edge across each row.
            */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
              <AnimatePresence>
                {filteredProjects.map((project, index) => {
                  const metrics = getProjectMetrics(project);
                  const isActive = activeProjectId === project.id;
                  
                  const getLatestActivity = (): { time: number; text: string }[] => {
                      let events: { time: number, text: string }[] = [];

                      const updates = project.activeProject?.executionData?.updates;
                      if (updates && updates.length > 0) {
                          const latestUpdate = [...updates].sort((a, b) => b.timestamp - a.timestamp)[0];
                          events.push({ time: latestUpdate.timestamp, text: `Update: ${latestUpdate.text.substring(0, 30)}${latestUpdate.text.length > 30 ? '...' : ''}`});
                      }

                      const contract = project.context?.contractSignoff;
                      if (contract?.signedAt) {
                          events.push({ time: new Date(contract.signedAt).getTime(), text: "Contract signed" });
                      } else if (contract?.sentAt) {
                          events.push({ time: new Date(contract.sentAt).getTime(), text: "Contract sent" });
                      }

                      project.materials?.forEach(m => {
                          if (m.clientConfirmedAt) events.push({ time: new Date(m.clientConfirmedAt).getTime(), text: `Confirmed: ${m.itemName.substring(0, 20)}`});
                          if (m.changeRequestedAt) events.push({ time: new Date(m.changeRequestedAt).getTime(), text: `CR: ${m.itemName.substring(0, 20)}`});
                      });
                      
                      const blockers = project.activeProject?.executionData?.blockers;
                      if (blockers) {
                          blockers.forEach(b => {
                              if (b.resolvedAt) events.push({ time: b.resolvedAt, text: `Resolved: ${b.title || 'Blocker'}`});
                          });
                      }
                      
                      /* It built the whole list and returned one line of it.
                         Three costs nothing more and gives the short cards
                         something to say in the space the grid stretches them
                         into. */
                      events.sort((a, b) => b.time - a.time);
                      return events.slice(0, 3);
                  };

                  const recentAct = getLatestActivity();
                  
                  const statusStyle =
                    STATUS_CONFIG[metrics.status] || STATUS_CONFIG["draft"];

                  // CALCULATE PENDING ITEM INDICATORS
                  const getIndicators = () => {
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

                    if (conditions.length === 0) return null;

                    return (
                      <div className="mt-3 flex flex-col gap-1.5 mb-1">
                        {conditions.slice(0, 2).map((c: any, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider ${c.isAlert ? 'text-rose-600 font-bold' : 'text-slate-600'}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${c.dot}`}
                            ></span>
                            <span className="truncate">{c.text}</span>
                          </div>
                        ))}
                        {conditions.length > 2 && (
                          <div className="flex items-center gap-2 mt-0.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                            <span>+{conditions.length - 2} more action{conditions.length - 2 > 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>
                    );
                  };

                  return (
                    <motion.div
                      key={project.id}
                      initial={{ opacity: 0, y: 30, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      /* No h-full. height:100% on a grid item resolves against
                         the row, not the content, so it quietly defeated the
                         grid's items-start and every card came back at exactly
                         the row height -- 636.32px across the board. The card's
                         own inner h-full chain now resolves against an auto
                         parent and follows the content. */
                    >
                      <CardContainer containerClassName="w-full h-full p-0 flex items-stretch" className="w-full h-full">
                        <CardBody
                          className="fx-tilt-card h-full w-full bg-white border relative group/card flex flex-col cursor-pointer overflow-hidden rounded-2xl"
                          onClick={() => onOpenProject(project)}
                          style={{
                            borderColor: isActive ? '#3D52A0' : 'rgb(226, 232, 240)',
                            /* The shadow moved to .fx-tilt-card so it can track
                               the tilt; only the active ring stays inline, fed
                               to that rule as a second shadow. */
                            ['--tilt-ring' as any]: isActive
                              ? '0 0 0 1px #3D52A0'
                              : '0 0 0 0 rgba(0, 0, 0, 0)',
                          }}
                        >
                          {/* One hover wash, in the app's own indigo.

                              The white shimmer that used to sweep across on
                              hover -- a rotated gradient translated 200% over a
                              second -- is gone. It is the most recognisable
                              "template" flourish there is, it fired on all
                              forty-two cards, and it was animating a layer
                              twice the card's size on every pointer entry. */}
                          <div className="absolute inset-0 bg-gradient-to-br from-[#EDE8F5]/60 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none z-0"></div>

                          {/* Card Header & Status */}
                          <CardItem translateZ={Z_SURFACE} className="w-full">
                            <div className="p-5 pb-0 flex flex-col gap-3 border-b border-slate-50/50 bg-slate-50/30 w-full relative z-20">
                              <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setStatusModalProject(project);
                                    }}
                                    className={`group/status flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-[0.15em] border transition-all hover:scale-105 hover:shadow-sm cursor-pointer ${statusStyle.bg} ${statusStyle.color} ${statusStyle.border}`}
                                    title="Click to change project status & manage downstream impacts"
                                  >
                                    {statusStyle.icon && <statusStyle.icon className="w-3 h-3" />}
                                    <span>{statusStyle.label}</span>
                                    <ChevronDown className="w-2.5 h-2.5 opacity-60 group-hover/status:opacity-100 transition-opacity" />
                                  </button>

                                  {/* Waving Pinned-Note Classification Tag */}
                                  {(() => {
                                    const isDummy = isDummyProject(project);
                                    return (
                                      <motion.div
                                        animate={{ rotate: [-2, 4, -3, 2, -2], y: [0, -1, 0, -1, 0] }}
                                        transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-xs border transition-colors ${
                                          !isDummy
                                            ? 'bg-sky-50 text-sky-700 border-sky-200/80'
                                            : 'bg-amber-50 text-amber-700 border-amber-200/80'
                                        }`}
                                        title={`Project is marked as ${isDummy ? 'Dummy / Demo' : 'Actual Site'}`}
                                      >
                                        <Pin className={`w-2.5 h-2.5 ${!isDummy ? 'text-sky-600' : 'text-amber-600'}`} />
                                        <span className="capitalize">{isDummy ? 'Dummy' : 'Actual'}</span>
                                      </motion.div>
                                    );
                                  })()}

                                  {metrics.riskScore > 0 && (
                                    <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-[0.15em] bg-rose-50 text-rose-600 border border-rose-100">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                      At Risk
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 font-semibold tracking-wider shrink-0 mt-0.5">
                                  {timeAgo(project.lastModified)}
                                </span>
                              </div>
                              
                              {/* Status Progress Bar */}
                              <div className="flex flex-col gap-1.5 mt-3 mb-1">
                                <div className="flex items-center justify-between">
                                   <div className="flex gap-[2px] flex-1 mr-3">
                                      {[...Array(10)].map((_, i) => {
                                        const baseProgressPct = metrics.status === 'completed' ? 100 : 
                                          (metrics.status === 'execution' || metrics.status === 'work_paused') ? 60 : 
                                          metrics.status === 'won' ? 40 : 
                                          metrics.status === 'negotiation' ? 30 : 
                                          metrics.status === 'proposal_sent' ? 20 : 
                                          metrics.status === 'draft' ? 10 : 0;
                                          
                                        // For execution phase, interpolate between 60% and 100% based on journeySummary pct
                                        let progressPct = baseProgressPct;
                                        if ((metrics.status === 'execution' || metrics.status === 'work_paused') && project.context?.journeySummary?.pct !== undefined) {
                                            // Scale 0-100 execution progress into the remaining 40% (60% to 100%)
                                            progressPct = 60 + Math.floor((project.context.journeySummary.pct / 100) * 40);
                                        }

                                        const barColor = metrics.status === 'completed' ? 'bg-emerald-500' : 
                                          metrics.status === 'execution' ? 'bg-[#3D52A0]' : 
                                          metrics.status === 'work_paused' ? 'bg-rose-500' : 
                                          metrics.status === 'won' ? 'bg-emerald-400' : 
                                          metrics.status === 'negotiation' ? 'bg-amber-400' : 
                                          metrics.status === 'proposal_sent' ? 'bg-sky-400' : 
                                          'bg-slate-400';

                                        const isFilled = (i + 1) * 10 <= (progressPct + 5);

                                        return (
                                          <motion.div 
                                            key={i} 
                                            initial={{ opacity: 0, scale: 0.5 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ duration: 0.3, delay: i * 0.03 }}
                                            className={`h-1.5 flex-1 rounded-[1px] transition-colors duration-500 ${
                                              isFilled ? barColor : 'bg-slate-200/60'
                                            }`}
                                          ></motion.div>
                                        );
                                      })}
                                   </div>
                                   <span className="text-[10px] font-bold text-slate-500 tracking-wider min-w-[28px] text-right">
                                      {(() => {
                                        if (metrics.status === 'completed') return 100;
                                        if (metrics.status === 'execution' || metrics.status === 'work_paused') {
                                            return 60 + Math.floor(((project.context?.journeySummary?.pct || 0) / 100) * 40);
                                        }
                                        if (metrics.status === 'won') return 40;
                                        if (metrics.status === 'negotiation') return 30;
                                        if (metrics.status === 'proposal_sent') return 20;
                                        if (metrics.status === 'draft') return 10;
                                        return 0;
                                      })()}%
                                   </span>
                                </div>
                              </div>
                            </div>
                          </CardItem>

                          {/* Card Content (Name, Client, Metrics, Financial Summary) */}
                          <div className="p-5 flex-grow flex flex-col relative z-20">
                            {/* The name block gets a surface of its own.

                                The card had exactly one bordered thing on it --
                                the documents panel at the bottom -- so the top
                                half read as loose text on white. This bookends
                                it: the same rounded, tinted, inset-highlit
                                treatment, kept lighter so the documents panel
                                is still the heavier of the two, with a hairline
                                between the name and the client so each has an
                                edge of its own. */}
                            <CardItem translateZ={Z_LEAD} className="w-full mb-4">
                              <div
                                className="rounded-2xl border border-[#E4E8F3] px-3.5 py-3"
                                style={{
                                  background:
                                    'linear-gradient(135deg, #FFFFFF 0%, #F3F5FC 100%)',
                                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
                                }}
                              >
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em] mb-0.5">
                                  Project Name
                                </p>
                                <h3
                                  className="text-[1.1rem] font-semibold tracking-tight text-slate-900 leading-snug line-clamp-2"
                                  title={project.context?.name || "Unnamed Project"}
                                >
                                  {project.context?.name || "Unnamed Project"}
                                </h3>
                                <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-[#E4E8F3]">
                                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em]">
                                    Client:
                                  </p>
                                  {/* The one place on the card where a gradient
                                      costs nothing to read. The project name is
                                      what you scan, so it stays solid; a disc
                                      holding a single letter can be decorative.
                                      Also retires the last sky-50 on the card.

                                      Stops chosen so white holds at both ends:
                                      about 5:1 on #4F6BC4 and 10:1 on #2E3C78. */}
                                  <div
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                                    style={{
                                      background:
                                        'linear-gradient(135deg, #4F6BC4 0%, #2E3C78 100%)',
                                    }}
                                  >
                                    {(project.context?.clientName || "U")
                                      .charAt(0)
                                      .toUpperCase()}
                                  </div>
                                  <p className="text-[11px] text-slate-500 font-medium truncate">
                                    {project.context?.clientName || "Unknown Client"}
                                  </p>
                                </div>
                              </div>
                            </CardItem>

                            {/* What this project is waiting for.

                                Straight off the same nextActionEngine that fed
                                the old "Today's focus" banner. Putting it on
                                the card puts it next to the project it is
                                about, which is where you were going to have to
                                look anyway. */}
                            {(() => {
                              const move = intel.get(project.id)?.action;
                              if (!move || DORMANT.includes(metrics.status)) return null;
                              const skin =
                                move.priority === 'blocker'
                                  ? 'bg-rose-50 border-rose-100 text-rose-700'
                                  : move.priority === 'due'
                                    ? 'bg-amber-50 border-amber-100 text-amber-800'
                                    : 'bg-slate-50 border-slate-200 text-slate-600';
                              return (
                                <CardItem translateZ={Z_DETAIL} className="w-full mb-3">
                                  <div
                                    className={`flex items-start gap-2 px-2.5 py-2 rounded-xl border ${skin}`}
                                    title={move.why}
                                  >
                                    {move.blockedBy ? (
                                      <Lock className="w-3 h-3 shrink-0 mt-[2px]" />
                                    ) : (
                                      <ArrowRight className="w-3 h-3 shrink-0 mt-[2px]" />
                                    )}
                                    <span className="text-[11px] font-semibold leading-snug">
                                      {move.title}
                                      {move.blockedBy && (
                                        <span className="block font-medium opacity-70 mt-0.5">
                                          Waiting on {move.blockedBy}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </CardItem>
                              );
                            })()}

                            {/* Action Indicators */}
                            {metrics.status !== "lost" && (
                              <CardItem translateZ={Z_SURFACE} className="w-full">
                                <div className="flex items-center gap-2 mb-4 flex-wrap">
                                  {project.context?.commsSummary &&
                                    project.context.commsSummary.pendingCount > 0 && (
                                      <span className="flex items-center gap-1 px-2 py-1 rounded bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
                                        <span className="text-xs">📬</span>{" "}
                                        {project.context.commsSummary.pendingCount}{" "}
                                        Comm
                                      </span>
                                    )}
                                  <div className="scale-90 origin-left -ml-1">
                                    <ProjectPaymentBadge
                                      projectId={project.id}
                                      size="sm"
                                    />
                                  </div>
                                </div>
                              </CardItem>
                            )}

                            <CardItem translateZ={Z_SURFACE} className="w-full">
                              {getIndicators()}
                            </CardItem>

                            {/* Recent activity, placed to absorb the row stretch.

                                grow on this block is what fills the gap: it
                                takes the free space before the money does, so a
                                card with history ends in a quiet list rather
                                than a void.

                                Only when there is history, though. Seven of
                                eight projects on this book log no activity at
                                all -- the events come from execution updates,
                                contract sign-off, material confirmations and
                                resolved blockers, and a project that has not
                                started has none of them. Rendering the section
                                regardless added 60px of "Nothing logged yet" to
                                every card and made the stretch worse, not
                                better. So the void stays on those cards, and
                                the money keeps its mt-auto. */}
                            {recentAct.length > 0 && (
                            <CardItem translateZ={Z_SURFACE} className="w-full grow">
                              <div className="mt-3 pt-3 border-t border-slate-100 h-full">
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em] mb-1.5">
                                  Recent
                                </p>
                                {(
                                  <ul className="space-y-1">
                                    {recentAct.map((ev, i) => (
                                      <li
                                        key={`${ev.time}-${i}`}
                                        className="flex justify-between items-baseline gap-3 text-[10px]"
                                      >
                                        <span className="truncate text-slate-600 font-medium">
                                          {ev.text}
                                        </span>
                                        <span className="shrink-0 text-slate-400 font-bold uppercase tracking-wider tabular-nums">
                                          {timeAgo(ev.time)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </CardItem>
                            )}

                            {/* Financial Summary */}
                            <CardItem
                              translateZ={Z_LEAD}
                              className={`w-full pt-4 border-t border-slate-100 ${recentAct.length > 0 ? '' : 'mt-auto'}`}
                            >
                              <div className="w-full">
                                {project.tiers && project.tiers.length > 0 ? (
                                  <>
                                    {project.tiers
                                      .filter(
                                        (t) =>
                                          t.id === project.context?.approvedTierId,
                                      )
                                      .map((tier) => {
                                        /* Not the tier's own total: that is the
                                           price list, and it ignores approved
                                           changes. valueOf is what the rest of
                                           the app quotes for this project. */
                                        const total = valueOf(project);

                                        return (
                                          <div
                                            key={tier.id}
                                            className="flex justify-between items-end"
                                          >
                                            <div>
                                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em] mb-0.5">
                                                Approved
                                              </p>
                                              <p className="text-lg font-semibold text-slate-900 leading-none">
                                                {formatClientValue(total)}
                                              </p>
                                            </div>
                                            <div className="text-right">
                                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em] mb-0.5">
                                                Margin
                                              </p>
                                              <p className="text-sm font-semibold text-slate-700 leading-none">
                                                {tier.summary.blendedGm?.toFixed(0) ||
                                                  tier.summary.totalGm?.toFixed(0) ||
                                                  0}
                                                %
                                              </p>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    {!project.context?.approvedTierId && (
                                      <div className="flex justify-between items-end">
                                        <div>
                                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em] mb-0.5">
                                            Pipeline
                                          </p>
                                          {/* A project nobody has priced yet is worth
                                              nothing only in the arithmetic sense.
                                              Printing "Rs 0" states a price; this
                                              states the absence of one. */}
                                          {valueOf(project) > 0 ? (
                                            <p className="text-lg font-semibold text-slate-900 leading-none">
                                              {formatClientValue(valueOf(project))}
                                            </p>
                                          ) : (
                                            <p className="text-sm font-semibold text-slate-400 leading-none">
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
                                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em] mb-0.5">
                                        Est. Value
                                      </p>
                                      {valueOf(project) > 0 ? (
                                        <p className="text-lg font-semibold text-slate-500 leading-none">
                                          {formatClientValue(valueOf(project))}
                                        </p>
                                      ) : (
                                        <p className="text-sm font-semibold text-slate-400 leading-none">
                                          Not priced yet
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </CardItem>

                            {/* Document completeness — sits with the money because
                                an unsigned contract is a money problem.

                                No rule above it any more: the meter now carries
                                its own tinted panel, and a hairline divider
                                immediately above a bordered box reads as a
                                stray line. */}
                            <CardItem translateZ={Z_DETAIL} className="w-full">
                              <div className="mt-3">
                                <DocumentMeter projectContext={project.context} />
                              </div>
                            </CardItem>


                          </div>

                          {/* Footer actions.

                              translateZ={0}, not 25. Under the container's
                              perspective:1000px a lifted element below the
                              card's centre projects upward, and this one sits
                              at the very bottom -- it rendered 88px above its
                              own layout box and left that much bare card
                              beneath it. That strip of nothing at the foot of
                              every card was this, not spacing. */}
                          <CardItem translateZ={0} className="w-full">
                            <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-3 flex items-center justify-between opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
                              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#3D52A0] flex items-center gap-1.5 group-hover/card:text-[#334486] transition-colors">
                                Open Project{" "}
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                              </span>

                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setStatusModalProject(project);
                                  }}
                                  className="px-2 py-1 flex items-center gap-1 bg-white border border-slate-200 text-slate-600 hover:text-[#3D52A0] hover:border-sky-200 rounded text-[11px] font-bold transition-colors shadow-sm cursor-pointer"
                                  title="Change Status & Phase"
                                >
                                  <SlidersHorizontal className="w-3 h-3 text-[#3D52A0]" />
                                  <span>Status</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDuplicateProject(project);
                                  }}
                                  className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:text-[#3D52A0] rounded hover:border-sky-200 transition-colors shadow-sm cursor-pointer"
                                  title="Clone as template — copies rooms and priced scope, not the client, payments or sign-offs"
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <rect
                                      x="9"
                                      y="9"
                                      width="13"
                                      height="13"
                                      rx="2"
                                      ry="2"
                                    ></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setProjectToDelete(project.id);
                                  }}
                                  className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 rounded transition-colors shadow-sm cursor-pointer"
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
                          </CardItem>
                        </CardBody>
                      </CardContainer>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
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
                            {p.context?.name || "Unnamed Project"}
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
        {projectToDelete && (
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
                  Delete Project?
                </h3>
                <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                  Are you sure you want to permanently delete this project? This
                  action cannot be undone and all associated data will be lost
                  forever.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setProjectToDelete(null)}
                    className="px-6 py-3 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (projectToDelete) {
                        onDeleteProject(projectToDelete);
                        setProjectToDelete(null);
                      }
                    }}
                    className="px-6 py-3 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-all shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:-translate-y-0.5"
                  >
                    Delete Permanently
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
