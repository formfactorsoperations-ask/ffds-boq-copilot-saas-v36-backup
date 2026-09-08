import React, { useState, useMemo, useEffect } from "react";
import { db } from '../services/dbService';
import { FullProjectData, ProjectStatus } from "../types";
import Card from "./shared/Card";
import { BuildingOfficeIcon, PlusIcon, NewFileIcon, DeleteIcon } from "./Icons";
import { formatClientValue, timeAgo, formatCurrency } from "../lib/utils";
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
import { getNextActions } from "../services/nextActionEngine";
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
    color: "text-[#0066CC]",
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
          className="inline-block bg-[#0066CC]/60"
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


function TodayPanel({ projects, currentUserRole, onOpenProject }: { projects: FullProjectData[], currentUserRole: string, onOpenProject: (p: FullProjectData) => void }) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Compute the top action for each active project
    const rows = [];
    for (const project of projects) {
        // Skip archived or fully completed projects
        if (project.context?.status === 'completed' || project.context?.status === 'archived' as any || project.context?.status === 'lost') {
            continue;
        }

        const nextActionsCtx = {
            project: project.context,
            designPaymentStages: project.context?.paymentMilestones,
            designGate: (project.context as any)?.designGate,
            drawingTrackerSummary: null,
            scopeAdditionsSummary: { pending: ((project.context as any)?.scopeAdditions || []).filter((s:any) => s.status === 'pending_approval' || s.status === 'pending').length },
            timeline: null
        };

        const actions = getNextActions(nextActionsCtx, currentUserRole);
        if (actions && actions.length > 0) {
            rows.push({
                project: project,
                action: actions[0]
            });
        }
    }

    // Sort: blockers first, then due, then suggested
    rows.sort((a, b) => {
        const priorityOrder = { 'blocker': 0, 'due': 1, 'suggested': 2 };
        return priorityOrder[a.action.priority] - priorityOrder[b.action.priority];
    });

    const blockersCount = rows.filter(r => r.action.priority === 'blocker').length;
    const dueCount = rows.filter(r => r.action.priority === 'due').length;
    const suggestedCount = rows.filter(r => r.action.priority === 'suggested').length;
    const projectCount = new Set(rows.map(r => r.project.id)).size;

    if (rows.length === 0) {
        return (
            <div className="bg-emerald-50/50 backdrop-blur-sm border border-emerald-100 rounded-[1.25rem] p-3 sm:px-4 flex items-center justify-between gap-3 min-h-[50px]">
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <CheckCircle className="w-3.5 h-3.5" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-emerald-900 leading-tight">You're all caught up</p>
                        <p className="text-[10px] text-emerald-600 font-medium">No critical actions pending today.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-[1.25rem] shadow-sm border border-slate-200 overflow-hidden">
            {/* Collapsible Trigger Bar */}
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/50 transition-colors bg-slate-50/50 min-h-[50px]"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Zap className="w-4 h-4 text-white fill-white" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-800 leading-tight">Today's focus</h3>
                        <p className="text-[10px] text-slate-500 font-medium">
                            {rows.length} {rows.length === 1 ? 'action' : 'actions'} across {projectCount} {projectCount === 1 ? 'project' : 'projects'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                    <div className="flex items-center gap-1.5">
                        {blockersCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-50 border border-rose-100 text-rose-600">
                                {blockersCount} blocker{blockersCount > 1 ? 's' : ''}
                            </span>
                        )}
                        {dueCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 border border-amber-100 text-amber-700">
                                {dueCount} due
                            </span>
                        )}
                        {suggestedCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 border border-blue-100 text-blue-600">
                                {suggestedCount} suggested
                            </span>
                        )}
                    </div>
                    <div className="text-slate-400">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                </div>
            </div>

            {/* Collapsible List Container */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden border-t border-slate-100"
                    >
                        <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                            {rows.map((row) => {
                                const { project, action } = row;
                                const isBlocked = !!action.blockedBy;
                                let chipColors = '';
                                switch(action.priority) {
                                    case 'blocker': chipColors = 'bg-rose-50 text-rose-700 border-rose-100 text-[9px] font-bold'; break;
                                    case 'due': chipColors = 'bg-amber-50 text-amber-700 border-amber-100 text-[9px] font-bold'; break;
                                    case 'suggested': chipColors = 'bg-blue-50 text-blue-700 border-blue-100 text-[9px] font-bold'; break;
                                }

                                return (
                                    <div key={project.id} className="p-4 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                            <span className={`shrink-0 uppercase tracking-wider px-2.5 py-0.5 rounded border ${chipColors}`}>
                                                {action.priority}
                                            </span>
                                            <div className="min-w-0">
                                                <span className="text-[10px] font-bold text-slate-800/60 uppercase tracking-wider block mb-0.5">
                                                    {project.context?.name || "Unnamed"}
                                                </span>
                                                <h4 className="font-semibold text-sm text-slate-800 leading-snug">{action.title}</h4>
                                                {isBlocked && (
                                                    <p className="text-[10px] font-medium text-slate-500 mt-1.5 flex items-center gap-1">
                                                        <Lock className="w-3 h-3" /> Waiting on: {action.blockedBy}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOpenProject(project);
                                            }}
                                            className={`shrink-0 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${isBlocked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-100 text-slate-600 hover:bg-[#0066CC]/90 backdrop-blur-md border border-white/20 hover:text-white'}`}
                                            disabled={isBlocked}
                                        >
                                            {action.ctaLabel}
                                            {!isBlocked && <ArrowRight className="w-3 h-3" />}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

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
  const [focusMode, setFocusMode] = useState(false);
  const [sortBy, setSortBy] = useState<"updated" | "health">("updated");

  const isDummyProject = (p: FullProjectData) => {
    if (p.context?.isDummy !== undefined) return p.context.isDummy;
    if (p.context?.projectCategory) return p.context.projectCategory === 'dummy';
    const name = (p.context?.name || '').toLowerCase();
    return name.includes('sample') || name.includes('demo') || name.includes('test');
  };

  const pipelineStats = useMemo(() => ({
    pendingDecisions: projects.filter(p => p.context?.status === 'proposal_sent' || p.context?.status === 'negotiation').length,
    revenueVelocity: projects.reduce((sum, p) => sum + (p.boqValue || p.engagement?.designFee || 0), 0) / 12,
    activeProjectsCount: projects.filter(p => p.context?.status === 'execution' || p.context?.status === 'work_paused').length,
    conversionRate: projects.filter(p => p.context?.status !== 'lost').length / (projects.length || 1) * 100,
    bookedValue: projects.filter(p => p.context?.status === 'execution' || p.context?.status === 'won').reduce((sum, p) => sum + (p.boqValue || p.engagement?.designFee || 0), 0),
    avgDealSize: projects.length ? projects.reduce((sum, p) => sum + (p.boqValue || p.engagement?.designFee || 0), 0) / projects.length : 0,
    avgMargin: 35
  }), [projects]);

  const filteredProjects = projects.filter(p => {
    // Kind filter (Actual vs Dummy)
    if (kindFilter === 'actual' && isDummyProject(p)) return false;
    if (kindFilter === 'dummy' && !isDummyProject(p)) return false;

    if (statusFilter !== 'all') {
        const pStatus = p.context?.status || 'draft';
        if (statusFilter === 'draft') {
            // Pipeline stage
            if (pStatus !== 'draft' && pStatus !== 'lead') return false;
        } else if (statusFilter === 'proposal_sent') {
            // Proposals stage
            if (pStatus !== 'proposal_sent' && pStatus !== 'negotiation') return false;
        } else if (statusFilter === 'won') {
            // Execution stage
            if (pStatus !== 'won' && pStatus !== 'execution' && pStatus !== 'work_paused') return false;
        } else if (statusFilter === 'completed') {
            if (pStatus !== 'completed') return false;
        } else if (statusFilter === 'lost') {
            if (pStatus !== 'lost') return false;
        } else if (pStatus !== statusFilter) {
            return false;
        }
    }
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = (p.context?.name || '').toLowerCase();
        const client = (p.context?.clientName || '').toLowerCase();
        if (!name.includes(q) && !client.includes(q)) return false;
    }
    return true;
  });

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
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-transform">
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
                  <p className="text-lg font-medium text-[#0055B3] mt-1">
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
            <div className="bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden h-full">
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
          {/* TOP ACTION BAR: Today's Focus + New Project */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <TodayPanel
                projects={projects}
                currentUserRole={orgData?.role || 'Admin'}
                onOpenProject={onOpenProject}
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={onCreateNew}
              className="px-5 py-2.5 bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 hover:from-sky-400 hover:via-sky-500 hover:to-blue-500 text-white rounded-[1.25rem] transition-all shadow-sm shadow-sky-500/20 flex items-center justify-center gap-2 text-xs font-bold shrink-0 cursor-pointer h-[50px]"
            >
              <PlusIcon className="w-4 h-4" /> New Project
            </motion.button>
          </div>

          {/* 2. SUPER CLEAN TOOLBAR */}
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-transparent pt-1 pb-3 border-b border-slate-200/50 mb-4 w-full">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Kind Filter (Actual vs Dummy) */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 rounded-full border border-slate-200">
                <button
                  type="button"
                  onClick={() => setKindFilter("all")}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    kindFilter === "all"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  All Projects
                </button>
                <button
                  type="button"
                  onClick={() => setKindFilter("actual")}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                    kindFilter === "actual"
                      ? "bg-sky-600 text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-300"></span>
                  Actual
                </button>
                <button
                  type="button"
                  onClick={() => setKindFilter("dummy")}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                    kindFilter === "dummy"
                      ? "bg-amber-500 text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-200"></span>
                  Dummy
                </button>
              </div>

              {/* Status/Phase Filter */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">
                  Phase:
                </span>
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${statusFilter === "all" ? "bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white shadow-xs" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter("draft")}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${statusFilter === "draft" ? "bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white shadow-xs" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                >
                  Pipeline
                </button>
                <button
                  onClick={() => setStatusFilter("proposal_sent")}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${statusFilter === "proposal_sent" ? "bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white shadow-xs" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                >
                  Proposals
                </button>
                <button
                  onClick={() => setStatusFilter("won")}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${statusFilter === "won" ? "bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white shadow-xs" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                >
                  Execution
                </button>
                <button
                  onClick={() => setStatusFilter("completed")}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${statusFilter === "completed" ? "bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white shadow-xs" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                >
                  Completed
                </button>
                <button
                  onClick={() => setStatusFilter("lost")}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${statusFilter === "lost" ? "bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white shadow-xs" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                >
                  Lost
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 md:gap-4 w-full xl:w-auto pb-2 xl:pb-0">
              <button
                onClick={() => setFocusMode(!focusMode)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${focusMode ? "bg-rose-500 text-white shadow-md" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"}`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${focusMode ? "bg-white animate-pulse" : "bg-rose-400"}`}
                ></span>
                Focus: At Risk
              </button>

              <div className="shrink-0 flex bg-white border border-slate-200 rounded-full px-4 py-1.5 items-center gap-2 hover:border-slate-300 transition-colors">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Sort:
                </span>
                <select
                  className="bg-transparent text-[11px] font-bold text-slate-700 outline-none uppercase tracking-wider cursor-pointer"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                >
                  <option value="updated">Recent</option>
                  <option value="health">Urgent</option>
                </select>
              </div>

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
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-1.5 bg-white border border-slate-200 rounded-full text-[11px] font-bold uppercase tracking-wider text-slate-700 outline-none focus:border-slate-400 transition-all placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          {/* 3. PROJECT GRID */}
          {viewMode === "grid" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {filteredProjects.map((project, index) => {
                  const metrics = getProjectMetrics(project);
                  const isActive = activeProjectId === project.id;
                  
                  const getLatestActivity = () => {
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
                      
                      if (events.length > 0) {
                          events.sort((a, b) => b.time - a.time);
                          return events[0];
                      }
                      return null;
                  };

                  const latestAct = getLatestActivity();
                  
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
                          dot: "bg-[#0066CC]",
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
                          dot: "bg-[#0066CC]",
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
                      className="h-full"
                    >
                      <CardContainer containerClassName="w-full h-full p-0 flex items-stretch" className="w-full h-full">
                        <CardBody
                          className="h-full w-full bg-white border transition-all duration-300 relative group/card flex flex-col cursor-pointer overflow-hidden rounded-2xl"
                          onClick={() => onOpenProject(project)}
                          style={{
                            borderColor: isActive ? '#0066CC' : 'rgb(226, 232, 240)',
                            boxShadow: isActive ? '0 4px 20px -2px rgba(0, 102, 204, 0.15), 0 0 0 1px #0066CC' : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
                          }}
                        >
                          {/* Animated Glowing Gradient Hover Effect */}
                          <div className="absolute inset-0 bg-gradient-to-br from-sky-50/70 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none z-0"></div>
                          <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-white/40 to-transparent rotate-45 group-hover/card:translate-x-[200%] transition-transform duration-1000 pointer-events-none z-10 opacity-0 group-hover/card:opacity-100"></div>

                          {/* Card Header & Status */}
                          <CardItem translateZ={25} className="w-full">
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
                                          metrics.status === 'execution' ? 'bg-[#0066CC]' : 
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
                            <CardItem translateZ={35} className="w-full mb-4">
                              <div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em] mb-0.5">
                                  Project Name
                                </p>
                                <h3
                                  className="text-[1.1rem] font-semibold tracking-tight text-slate-900 leading-snug mb-2 line-clamp-2"
                                  title={project.context?.name || "Unnamed Project"}
                                >
                                  {project.context?.name || "Unnamed Project"}
                                </h3>
                                <div className="flex items-center gap-2">
                                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em]">
                                    Client:
                                  </p>
                                  <div className="w-5 h-5 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center text-[9px] font-bold text-[#0066CC] shrink-0">
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

                            {/* Action Indicators */}
                            {metrics.status !== "lost" && (
                              <CardItem translateZ={25} className="w-full">
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

                            <CardItem translateZ={20} className="w-full">
                              {getIndicators()}
                            </CardItem>

                            {/* Financial Summary */}
                            <CardItem translateZ={30} className="w-full mt-auto pt-4 border-t border-slate-100">
                              <div className="w-full">
                                {project.tiers && project.tiers.length > 0 ? (
                                  <>
                                    {project.tiers
                                      .filter(
                                        (t) =>
                                          t.id === project.context?.approvedTierId,
                                      )
                                      .map((tier) => {
                                        const exec = tier.summary.totalSell || 0;
                                        const fee = tier.summary.designFee || 0;
                                        const total =
                                          tier.summary.totalRevenue || exec + fee;

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
                                          <p className="text-lg font-semibold text-slate-900 leading-none">
                                            {formatClientValue(metrics.value)}
                                          </p>
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
                                      <p className="text-lg font-semibold text-slate-500 leading-none">
                                        {formatClientValue(metrics.value)}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </CardItem>

                            {/* Document completeness — sits with the money because
                                an unsigned contract is a money problem. */}
                            <CardItem translateZ={15} className="w-full">
                              <div className="mt-3 pt-3 border-t border-slate-100">
                                <DocumentMeter projectContext={project.context} />
                              </div>
                            </CardItem>

                            {/* Latest Activity Footer */}
                            {latestAct && (
                              <CardItem translateZ={15} className="w-full">
                                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center text-[9px] text-slate-500 font-medium">
                                  <span className="truncate pr-4">{latestAct.text}</span>
                                  <span className="shrink-0 font-bold uppercase tracking-wider opacity-60">{timeAgo(latestAct.time)}</span>
                                </div>
                              </CardItem>
                            )}
                          </div>

                          {/* Footer actions */}
                          <CardItem translateZ={25} className="w-full">
                            <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-3 flex items-center justify-between opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
                              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#0066CC] flex items-center gap-1.5 group-hover/card:text-[#0055B3] transition-colors">
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
                                  className="px-2 py-1 flex items-center gap-1 bg-white border border-slate-200 text-slate-600 hover:text-[#0066CC] hover:border-sky-200 rounded text-[11px] font-bold transition-colors shadow-sm cursor-pointer"
                                  title="Change Status & Phase"
                                >
                                  <SlidersHorizontal className="w-3 h-3 text-[#0066CC]" />
                                  <span>Status</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDuplicateProject(project);
                                  }}
                                  className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:text-[#0066CC] rounded hover:border-sky-200 transition-colors shadow-sm cursor-pointer"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0066CC]/90 backdrop-blur-md border border-white/20/40 backdrop-blur-md p-4">
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
