import React, { useMemo } from "react";
import { FullProjectData } from "../types";
import { formatINR, timeAgo } from "../lib/utils";
import { getNextActions } from "../services/nextActionEngine";
import { getSingleProjectValue } from "../lib/financialsUtils";
import ClockCalendar from "./home/ClockCalendar";
import WavingGreeting from "./home/WavingGreeting";
import AnimatedNumber from "./ui/AnimatedNumber";
import { LampContainer } from "./ui/lamp";
import { CardContainer, CardBody, CardItem } from "./ui/3d-card";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  ArrowUpRight,
  TrendingUp,
  Layers,
  Briefcase,
  Users,
  AlertCircle,
  Clock,
  Plus,
  Compass,
  Building2,
  CheckCircle2,
  FolderKanban,
  FolderPlus,
  BarChart3,
  Store,
  Boxes
} from "lucide-react";

interface StudioHomeProps {
  projects: FullProjectData[];
  onOpenProject: (project: FullProjectData) => void;
  onCreateNew: () => void;
  onNavigate: (tab: string) => void;
  role: string;
  userName?: string;
}

export default function StudioHome({
  projects,
  onOpenProject,
  onCreateNew,
  onNavigate,
  role,
  userName = "there"
}: StudioHomeProps) {
  
  const [focusFilter, setFocusFilter] = React.useState<"all" | "attention" | "suggested">("all");
  const [expandedActionId, setExpandedActionId] = React.useState<string | null>(null);

  // Compute all data points in a single useMemo
  const data = useMemo(() => {
    const activeStatuses = ["won", "execution", "work_paused"];
    const pipelineStatuses = ["lead", "draft", "proposal_sent", "negotiation"];
    const deliveredStatuses = ["completed"];
    const lostStatuses = ["lost", "archived"];

    let activeCount = 0;
    let pipelineCount = 0;
    let deliveredCount = 0;
    let lostCount = 0;
    const clientKeys = new Set<string>();

    let openValue = 0;
    let bookedValue = 0;

    const worklist: Array<{ project: FullProjectData; action: any }> = [];

    // Map projects to extract stats
    for (const p of projects) {
      const status = p.context?.status || "draft";
      const pVal = getSingleProjectValue(p);

      // Classify bucket
      if (activeStatuses.includes(status)) {
        activeCount++;
        bookedValue += pVal;
        openValue += pVal;
      } else if (pipelineStatuses.includes(status)) {
        pipelineCount++;
        openValue += pVal;
      } else if (deliveredStatuses.includes(status)) {
        deliveredCount++;
      } else if (lostStatuses.includes(status)) {
        lostCount++;
      }

      // Track unique clients
      const clientEmail = p.context?.clientEmail;
      const clientName = p.context?.clientName;
      if (clientEmail || clientName) {
        const key = (clientEmail || clientName).toLowerCase().trim();
        clientKeys.add(key);
      }

      // Build Cross-Project Worklist (Only non-closed)
      if (status !== "completed" && status !== "lost" && (status as any) !== "archived") {
        const nextActionsCtx = {
          project: p.context,
          designPaymentStages: p.context?.paymentMilestones,
          designGate: (p.context as any)?.designGate,
          drawingTrackerSummary: null,
          scopeAdditionsSummary: {
            pending: ((p.context as any)?.scopeAdditions || []).filter(
              (s: any) => s.status === "pending_approval" || s.status === "pending"
            ).length
          },
          timeline: null
        };

        const actions = getNextActions(nextActionsCtx, role);
        if (actions && actions.length > 0) {
          worklist.push({
            project: p,
            action: actions[0] // take top action
          });
        }
      }
    }

    // Sort worklist: blocker first, then due, then suggested
    const priorityOrder: Record<string, number> = { blocker: 0, due: 1, suggested: 2 };
    worklist.sort((a, b) => priorityOrder[a.action.priority] - priorityOrder[b.action.priority]);

    const blockersCount = worklist.filter(w => w.action.priority === "blocker").length;
    const dueCount = worklist.filter(w => w.action.priority === "due").length;
    const attentionCount = blockersCount + dueCount;

    // Win rate: (won + completed) / (won + completed + lost)
    const totalDecided = activeCount + deliveredCount + lostCount;
    const winRate = totalDecided > 0 ? Math.round(((activeCount + deliveredCount) / totalDecided) * 100) : 0;

    // Portfolio flow distribution
    const totalCount = pipelineCount + activeCount + deliveredCount;
    const dist = {
      pipeline: totalCount > 0 ? (pipelineCount / totalCount) * 100 : 0,
      active: totalCount > 0 ? (activeCount / totalCount) * 100 : 0,
      delivered: totalCount > 0 ? (deliveredCount / totalCount) * 100 : 0
    };

    // Recent non-closed projects sorted by lastModified descending
    const recent = projects
      .filter(p => p.context?.status !== "completed" && p.context?.status !== "lost" && (p.context?.status as any) !== "archived")
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, 4);

    return {
      activeCount,
      pipelineCount,
      deliveredCount,
      clientsCount: clientKeys.size,
      attentionCount,
      openValue,
      bookedValue,
      winRate,
      worklist,
      dist,
      recent
    };
  }, [projects, role]);

  const filteredWorklist = useMemo(() => {
    if (focusFilter === "attention") {
      return data.worklist.filter(
        (w) => w.action.priority === "blocker" || w.action.priority === "due"
      );
    }
    if (focusFilter === "suggested") {
      return data.worklist.filter((w) => w.action.priority === "suggested");
    }
    return data.worklist;
  }, [data.worklist, focusFilter]);

  const attentionCount = useMemo(() => {
    return data.worklist.filter(
      (w) => w.action.priority === "blocker" || w.action.priority === "due"
    ).length;
  }, [data.worklist]);

  const suggestedCount = useMemo(() => {
    return data.worklist.filter((w) => w.action.priority === "suggested").length;
  }, [data.worklist]);

  // Auto-expand the top-priority action item when filter changes or data updates
  React.useEffect(() => {
    if (filteredWorklist.length > 0) {
      const topId = `${filteredWorklist[0].project.id}-${filteredWorklist[0].action.id}`;
      setExpandedActionId(topId);
    } else {
      setExpandedActionId(null);
    }
  }, [filteredWorklist]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 14 } }
  };

  // KPI Tile Configurations
  const kpiConfigs = [
    {
      id: "active",
      label: "Active Projects",
      value: data.activeCount,
      icon: Briefcase,
      color: "text-sky-600 bg-sky-50 border-sky-200/60",
      link: "projects",
    },
    {
      id: "pipeline",
      label: "In Pipeline",
      value: data.pipelineCount,
      icon: Layers,
      color: "text-amber-600 bg-amber-50 border-amber-200/60",
      link: "projects",
    },
    {
      id: "clients",
      label: "Total Clients",
      value: data.clientsCount,
      icon: Users,
      color: "text-teal-600 bg-teal-50 border-teal-200/60",
      link: "clients",
    },
    {
      id: "attention",
      label: "Needs Attention",
      value: data.attentionCount,
      icon: AlertCircle,
      color: data.attentionCount > 0 ? "text-rose-600 bg-rose-50 border-rose-200/60" : "text-slate-500 bg-slate-50 border-slate-200/60",
      isAlert: data.attentionCount > 0,
    },
    {
      id: "value",
      label: "Open Value",
      value: data.openValue,
      icon: TrendingUp,
      color: "text-emerald-700 bg-emerald-50 border-emerald-200/60",
      isCurrency: true,
    },
    {
      id: "winrate",
      label: "Win Rate",
      value: data.winRate,
      icon: Sparkles,
      color: "text-violet-600 bg-violet-50 border-violet-200/60",
      isPercent: true,
    }
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="w-full px-3 lg:px-6 pb-16 space-y-6 bg-transparent font-['Plus_Jakarta_Sans']"
    >
      {/* 1. STUDIO SPOTLIGHT HERO WITH LAMP ANIMATION */}
      <motion.div variants={itemVariants} className="w-full">
        <LampContainer
          theme="studio"
          containerHeight="min-h-[13rem] sm:min-h-[14rem]"
          className="rounded-2xl border border-slate-800/80 shadow-md"
        >
          <div className="flex flex-col items-center text-center justify-center gap-2 w-full max-w-4xl px-4 sm:px-6">
            <WavingGreeting userName={userName} attentionCount={data.attentionCount} variant="inverted" />
          </div>
        </LampContainer>
      </motion.div>

      {/* 2. PROJECT HUB QUICK LAUNCHPAD */}
      <motion.div variants={itemVariants} className="w-full">
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono">
              Studio Launchpad & Directory
            </span>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Quick Hub Access
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Tile 1: New Project */}
          <motion.button
            id="hub-action-new-project"
            type="button"
            onClick={onCreateNew}
            whileHover={{ y: -3, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-sky-50/90 via-white to-blue-50/90 border border-sky-200 hover:border-sky-400 shadow-2xs hover:shadow-lg hover:shadow-sky-500/10 text-left transition-all flex flex-col justify-between min-h-[128px] cursor-pointer"
          >
            <div className="flex items-center justify-between w-full mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-sky-500/25 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-200">
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-200/80">
                <Sparkles className="w-2.5 h-2.5" />
                <span>Create</span>
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  New Project
                </h4>
                <ArrowUpRight className="w-3.5 h-3.5 text-sky-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5 line-clamp-1">
                Start estimate or BOQ
              </p>
            </div>
          </motion.button>

          {/* Tile 2: Projects Pipeline */}
          <motion.button
            id="hub-action-projects"
            type="button"
            onClick={() => onNavigate("projects")}
            whileHover={{ y: -3, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="group relative overflow-hidden p-4 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 hover:border-indigo-300 shadow-2xs hover:shadow-lg hover:shadow-indigo-500/10 text-left transition-all flex flex-col justify-between min-h-[128px] cursor-pointer"
          >
            <div className="flex items-center justify-between w-full mb-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/70 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white group-hover:scale-110 group-hover:rotate-3 transition-all duration-200">
                <FolderKanban className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                {projects.length} Total
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Projects Hub
                </h4>
                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5 line-clamp-1">
                {data.activeCount} active · {data.pipelineCount} pipeline
              </p>
            </div>
          </motion.button>

          {/* Tile 3: Clients Directory */}
          <motion.button
            id="hub-action-clients"
            type="button"
            onClick={() => onNavigate("clients")}
            whileHover={{ y: -3, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="group relative overflow-hidden p-4 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 hover:border-teal-300 shadow-2xs hover:shadow-lg hover:shadow-teal-500/10 text-left transition-all flex flex-col justify-between min-h-[128px] cursor-pointer"
          >
            <div className="flex items-center justify-between w-full mb-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 border border-teal-200/70 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white group-hover:scale-110 group-hover:rotate-3 transition-all duration-200">
                <Users className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200/80">
                CRM & Portal
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-teal-600 transition-colors">
                  Clients Directory
                </h4>
                <ArrowUpRight className="w-3.5 h-3.5 text-teal-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5 line-clamp-1">
                {data.clientsCount} studio clients connected
              </p>
            </div>
          </motion.button>

          {/* Tile 4: Reports & Analytics */}
          <motion.button
            id="hub-action-reports"
            type="button"
            onClick={() => onNavigate("reports")}
            whileHover={{ y: -3, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="group relative overflow-hidden p-4 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 hover:border-violet-300 shadow-2xs hover:shadow-lg hover:shadow-violet-500/10 text-left transition-all flex flex-col justify-between min-h-[128px] cursor-pointer"
          >
            <div className="flex items-center justify-between w-full mb-3">
              <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 border border-violet-200/70 flex items-center justify-center group-hover:bg-violet-600 group-hover:text-white group-hover:scale-110 group-hover:rotate-3 transition-all duration-200">
                <BarChart3 className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200/80">
                {data.winRate}% Win
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-violet-600 transition-colors">
                  Reports & Analytics
                </h4>
                <ArrowUpRight className="w-3.5 h-3.5 text-violet-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5 line-clamp-1">
                Margins, revenue & win rate
              </p>
            </div>
          </motion.button>

          {/* Tile 5: Vendors & Rate Bank */}
          <motion.button
            id="hub-action-vendors"
            type="button"
            onClick={() => onNavigate("admin-templates-bank")}
            whileHover={{ y: -3, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="group relative overflow-hidden p-4 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 hover:border-amber-300 shadow-2xs hover:shadow-lg hover:shadow-amber-500/10 text-left transition-all flex flex-col justify-between min-h-[128px] cursor-pointer"
          >
            <div className="flex items-center justify-between w-full mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/70 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white group-hover:scale-110 group-hover:rotate-3 transition-all duration-200">
                <Store className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                Rate Bank
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                  Vendors & Bank
                </h4>
                <ArrowUpRight className="w-3.5 h-3.5 text-amber-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5 line-clamp-1">
                Item catalogs & rate cards
              </p>
            </div>
          </motion.button>
        </div>
      </motion.div>

      {/* 2. LIVE CLOCK & MONTH CALENDAR BAND */}
      <motion.div variants={itemVariants} className="w-full">
        <ClockCalendar projects={projects} />
      </motion.div>

      {/* 3. PORTFOLIO PULSE KPIs */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {kpiConfigs.map((kpi) => {
          const Icon = kpi.icon;
          const isClickable = !!kpi.link;

          return (
            <CardContainer
              key={kpi.id}
              containerClassName="w-full py-0"
              className="w-full h-full"
              onClick={() => isClickable && kpi.link && onNavigate(kpi.link)}
            >
              <CardBody
                className={`bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between transition-all group w-full h-full ${
                  isClickable ? "cursor-pointer hover:border-sky-300 hover:shadow-lg hover:shadow-sky-500/5" : ""
                }`}
              >
                <CardItem translateZ={15} className="flex items-center justify-between mb-2.5 w-full">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-none">
                    {kpi.label}
                  </span>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center border shadow-2xs ${kpi.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                </CardItem>
                <CardItem translateZ={30} className="w-full">
                  <h3 className="text-xl font-bold text-slate-900 leading-tight tracking-tight tabular-nums">
                    <AnimatedNumber
                      value={kpi.value}
                      format={
                        kpi.isCurrency
                          ? (v) => formatINR(v)
                          : kpi.isPercent
                          ? (v) => `${Math.floor(v)}%`
                          : undefined
                      }
                    />
                  </h3>
                  {isClickable && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-sky-600 mt-1.5 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>View list</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                    </span>
                  )}
                </CardItem>
              </CardBody>
            </CardContainer>
          );
        })}
      </motion.div>

      {/* 4. PORTFOLIO FLOW VISUAL BAR */}
      {projects.length > 0 && (
        <motion.div variants={itemVariants} className="bg-white/90 backdrop-blur-md p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5 mb-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Portfolio Lifecycle Flow</h4>
            <span className="text-xs font-medium text-slate-600">
              <span className="font-semibold text-amber-700">{data.pipelineCount}</span> Pipeline · <span className="font-semibold text-sky-700">{data.activeCount}</span> Active · <span className="font-semibold text-teal-700">{data.deliveredCount}</span> Delivered
            </span>
          </div>

          <div className="h-2 w-full bg-slate-100/90 rounded-full overflow-hidden flex shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${data.dist.pipeline}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="bg-amber-400 h-full"
              title={`Pipeline: ${Math.round(data.dist.pipeline)}%`}
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${data.dist.active}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
              className="bg-sky-500 h-full"
              title={`Active: ${Math.round(data.dist.active)}%`}
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${data.dist.delivered}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className="bg-teal-500 h-full"
              title={`Delivered: ${Math.round(data.dist.delivered)}%`}
            />
          </div>
        </motion.div>
      )}

      {/* 5, 6, 7. GRID LAYOUT */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* LEFT COLUMN (SPANS 3): Today's Focus Worklist */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-600" />
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Today's Focus
              </h3>
            </div>
            
            {/* Minimalist Tab Capsule */}
            <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 self-start sm:self-auto">
              <button
                onClick={() => setFocusFilter("all")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  focusFilter === "all"
                    ? "bg-white text-sky-700 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>All</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-md ${
                  focusFilter === "all" ? "bg-sky-50 text-sky-700" : "bg-slate-200/60 text-slate-600"
                }`}>
                  {data.worklist.length}
                </span>
              </button>

              <button
                onClick={() => setFocusFilter("attention")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  focusFilter === "attention"
                    ? "bg-white text-rose-700 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                </span>
                <span>Attention</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-md ${
                  focusFilter === "attention" ? "bg-rose-50 text-rose-700" : "bg-slate-200/60 text-slate-600"
                }`}>
                  {attentionCount}
                </span>
              </button>

              <button
                onClick={() => setFocusFilter("suggested")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  focusFilter === "suggested"
                    ? "bg-white text-sky-700 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>Suggested</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-md ${
                  focusFilter === "suggested" ? "bg-sky-50 text-sky-700" : "bg-slate-200/60 text-slate-600"
                }`}>
                  {suggestedCount}
                </span>
              </button>
            </div>
          </div>
 
          <div className="space-y-3">
            {filteredWorklist.length === 0 ? (
              <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/80 p-8 text-center shadow-2xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2.5" />
                <h4 className="text-sm font-semibold text-slate-800">All caught up!</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed font-normal">
                  No pending actions for this category. Everything is fully aligned.
                </p>
              </div>
            ) : (
              filteredWorklist.map(({ project, action }) => {
                // Style configurations based on priority
                const priorityConfig: Record<string, { label: string; text: string; bg: string; border: string; icon: React.ReactNode }> = {
                  blocker: { 
                    label: "Needs Attention", 
                    text: "text-rose-700 bg-rose-50 border-rose-200/60", 
                    bg: "bg-rose-50/40", 
                    border: "group-hover:border-rose-200", 
                    icon: <AlertCircle className="w-4 h-4 text-rose-600" />
                  },
                  due: { 
                    label: "Next Step", 
                    text: "text-amber-800 bg-amber-50 border-amber-200/60", 
                    bg: "bg-amber-50/40", 
                    border: "group-hover:border-amber-200", 
                    icon: <Clock className="w-4 h-4 text-amber-600" />
                  },
                  suggested: { 
                    label: "Opportunity", 
                    text: "text-sky-700 bg-sky-50 border-sky-200/60", 
                    bg: "bg-sky-50/30", 
                    border: "group-hover:border-sky-200", 
                    icon: <Sparkles className="w-4 h-4 text-sky-600" />
                  }
                };

                const cfg = priorityConfig[action.priority] || priorityConfig.suggested;
                const itemKey = `${project.id}-${action.id}`;
                const isExpanded = expandedActionId === itemKey;

                return (
                  <motion.div
                    layout
                    key={itemKey}
                    onClick={() => {
                      if (!isExpanded) {
                        setExpandedActionId(itemKey);
                      } else {
                        setExpandedActionId(null);
                      }
                    }}
                    className={`bg-white/90 backdrop-blur-xs border rounded-2xl cursor-pointer transition-all duration-200 flex flex-col overflow-hidden ${
                      isExpanded 
                        ? "border-sky-400 shadow-sm p-4.5 bg-white ring-1 ring-sky-100" 
                        : "border-slate-200/80 hover:border-sky-300 hover:shadow-2xs p-3.5 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Icon Indicator */}
                        <div className={`p-2 rounded-xl border flex items-center justify-center shrink-0 ${cfg.text} ${isExpanded ? 'w-9 h-9' : 'w-8 h-8'}`}>
                          {React.cloneElement(cfg.icon as React.ReactElement, { className: isExpanded ? "w-4.5 h-4.5" : "w-4 h-4" })}
                        </div>

                        <div className="min-w-0 flex-1">
                          {/* Badges row */}
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className="px-2 py-0.5 bg-slate-100/80 border border-slate-200/80 text-slate-700 text-[10px] font-semibold rounded-lg">
                              {project.context?.name || "Unnamed Project"}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider border ${cfg.text}`}>
                              {cfg.label}
                            </span>
                          </div>

                          {/* Title */}
                          <h4 className={`font-semibold text-slate-800 leading-snug group-hover:text-sky-700 transition-colors ${isExpanded ? 'text-sm' : 'text-xs'}`}>
                            {action.title}
                          </h4>
                        </div>
                      </div>

                      {/* Expand/Collapse Chevron Indicator */}
                      <div className="pl-2 pr-1 text-slate-400 shrink-0">
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <svg className="w-4 h-4 stroke-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </motion.div>
                      </div>
                    </div>

                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="mt-3 pt-3 border-t border-slate-100"
                      >
                        <p className="text-xs text-slate-600 leading-relaxed font-normal">
                          {action.why}
                        </p>
                        <div className="mt-3.5 flex justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenProject(project);
                            }}
                            className="px-4 py-2 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 shadow-2xs active:scale-98 cursor-pointer"
                          >
                            <span>{action.ctaLabel || "Open Project"}</span>
                            <ArrowRight className="w-3.5 h-3.5 opacity-90" />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (SPANS 2): Jump back in (Recents) & Shortcuts */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Recent Projects */}
          <div className="space-y-3.5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-sky-600" />
              <span>Jump Back In</span>
            </h3>

            <div className="space-y-2">
              {data.recent.length === 0 ? (
                <div className="p-4 bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/80 text-center text-xs text-slate-500 shadow-2xs">
                  No active projects to resume.
                </div>
              ) : (
                data.recent.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => onOpenProject(p)}
                    className="p-3 bg-white/90 backdrop-blur-xs border border-slate-200/80 rounded-xl hover:border-sky-300 hover:shadow-xs cursor-pointer transition-all flex justify-between items-center group"
                  >
                    <div className="min-w-0">
                      <h4 className="font-semibold text-xs text-slate-800 leading-snug truncate group-hover:text-sky-700 transition-colors">
                        {p.context?.name || "Unnamed Project"}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-1 font-normal">
                        Modified {timeAgo(p.lastModified)}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold text-sky-600 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity shrink-0 flex items-center gap-1">
                      <span>Resume</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="space-y-3.5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Compass className="w-4 h-4 text-sky-600" />
              <span>Quick Shortcuts</span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onNavigate("projects")}
                className="p-3.5 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl hover:border-sky-300 hover:shadow-md hover:shadow-sky-500/5 hover:-translate-y-0.5 transition-all flex flex-col items-center justify-center text-center gap-2 group cursor-pointer shadow-2xs"
              >
                <div className="w-8 h-8 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600 transition-colors group-hover:bg-gradient-to-r group-hover:from-sky-500 group-hover:to-blue-600 group-hover:text-white border border-sky-100 shadow-2xs">
                  <Building2 className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700 group-hover:text-sky-700 transition-colors">
                  Projects Grid
                </span>
              </button>

              <button
                onClick={() => onNavigate("clients")}
                className="p-3.5 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl hover:border-sky-300 hover:shadow-md hover:shadow-sky-500/5 hover:-translate-y-0.5 transition-all flex flex-col items-center justify-center text-center gap-2 group cursor-pointer shadow-2xs"
              >
                <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 transition-colors group-hover:bg-gradient-to-r group-hover:from-sky-500 group-hover:to-blue-600 group-hover:text-white border border-teal-100 shadow-2xs">
                  <Users className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700 group-hover:text-sky-700 transition-colors">
                  Clients Directory
                </span>
              </button>
            </div>
          </div>

        </div>

      </motion.div>

    </motion.div>
  );
}

