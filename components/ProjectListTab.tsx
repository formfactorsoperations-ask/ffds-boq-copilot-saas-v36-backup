import React, { useState, useMemo, useEffect } from "react";
import { FullProjectData, ProjectStatus } from "../types";
import Card from "./shared/Card";
import { BuildingOfficeIcon, PlusIcon, NewFileIcon, DeleteIcon } from "./Icons";
import { formatClientValue, timeAgo, formatCurrency } from "../lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";
import { ProjectPaymentBadge } from "./PaymentHealth";
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

interface ProjectListTabProps {
  projects: FullProjectData[];
  activeProjectId: string | null;
  onOpenProject: (project: FullProjectData) => void;
  onCreateNew: () => void;
  onDeleteProject: (id: string) => void;
  onDuplicateProject: (project: FullProjectData) => void;
  onQuickUpdate?: (projectId: string, field: string, value: any) => void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  lead: {
    label: "New Lead",
    color: "text-blue-600",
    bg: "bg-blue-50/50 backdrop-blur-sm",
    border: "border-blue-200/50",
  },
  draft: {
    label: "Drafting",
    color: "text-slate-600",
    bg: "bg-slate-100/50 backdrop-blur-sm",
    border: "border-slate-200/50",
  },
  proposal_sent: {
    label: "Proposal Sent",
    color: "text-indigo-600",
    bg: "bg-indigo-50/50 backdrop-blur-sm",
    border: "border-indigo-200/50",
  },
  negotiation: {
    label: "Negotiation",
    color: "text-amber-600",
    bg: "bg-amber-50/50 backdrop-blur-sm",
    border: "border-amber-200/50",
  },
  won: {
    label: "Won",
    color: "text-emerald-600",
    bg: "bg-emerald-50/50 backdrop-blur-sm",
    border: "border-emerald-200/50",
  },
  execution: {
    label: "Execution",
    color: "text-purple-600",
    bg: "bg-purple-50/50 backdrop-blur-sm",
    border: "border-purple-200/50",
  },
  work_paused: {
    label: "Work Paused 🔴",
    color: "text-rose-700",
    bg: "bg-rose-100 backdrop-blur-sm",
    border: "border-rose-300",
  },
  completed: {
    label: "Completed",
    color: "text-teal-600",
    bg: "bg-teal-50/50 backdrop-blur-sm",
    border: "border-teal-200/50",
  },
  lost: {
    label: "Lost",
    color: "text-red-400",
    bg: "bg-red-50/50 backdrop-blur-sm",
    border: "border-red-100/50",
  },
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
        <span className="text-sm font-light tracking-tighter text-indigo-900">
          {progress}
          <span className="text-[8px]">%</span>
        </span>
      </div>
    </div>
  );
};

const ProjectListTab: React.FC<ProjectListTabProps> = ({
  projects,
  activeProjectId,
  onOpenProject,
  onCreateNew,
  onDeleteProject,
  onDuplicateProject,
  onQuickUpdate,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">(
    "all",
  );
  const [sortBy, setSortBy] = useState<"updated" | "health">("updated");
  const [paymentFilter, setPaymentFilter] = useState<
    "all" | "overdue" | "at_risk"
  >("all");
  const [focusMode, setFocusMode] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "projects" | "intelligence" | "analytics"
  >("projects");
  const [healthScores, setHealthScores] = useState<
    Record<string, PaymentHealth>
  >({});

  useEffect(() => {
    if (!orgData?.tenantId) return;
    const fetchAll = async () => {
      const results = await Promise.all(
        projects.map((p) =>
          fetchPaymentHealthScore(p.id, orgData.tenantId!).then((h) => ({
            id: p.id,
            health: h,
          })),
        ),
      );
      const newScores: Record<string, PaymentHealth> = {};
      results.forEach((r) => (newScores[r.id] = r.health));
      setHealthScores(newScores);
    };
    fetchAll();
  }, [projects, orgData?.tenantId]);

  const paymentAggregate = useMemo(() => {
    let overdueProjects = 0;
    let atRiskProjects = 0;
    let healthyProjects = 0;
    let totalOutstanding = 0;

    Object.values(healthScores).forEach((h: PaymentHealth) => {
      if (h.healthStatus === "red") overdueProjects++;
      else if (h.healthStatus === "amber") atRiskProjects++;
      else if (h.healthStatus === "green" || h.healthStatus === "fully_paid")
        healthyProjects++;
      totalOutstanding += h.outstandingAmount || 0;
    });

    return {
      overdueProjects,
      atRiskProjects,
      healthyProjects,
      totalOutstanding,
    };
  }, [healthScores]);

  // Calculate Extended Metrics helper
  const getProjectMetrics = (p: FullProjectData) => {
    const tiers = p.tiers || [];
    const context = p.context || ({} as any);
    const approvedTier = tiers.find((t) => t.id === context.approvedTierId);

    let value = 0;
    let isRange = false;
    let designFee = 0;
    let margin = 0;
    let profit = 0;
    let sortValue = 0;

    const activeTier =
      approvedTier || tiers.find((t) => t.id === p.activeTierId) || tiers[0];

    if (activeTier) {
      // Locked / Approved State
      const originalExecutionTotal = activeTier.summary?.totalSell || 0;
      const originalDesignFee = activeTier.summary?.designFee || 0;

      const rawExecutionTotal =
        context.financials?.approvedExecutionValue ?? originalExecutionTotal;
      const rawDesignFee =
        context.financials?.approvedDesignValue ?? originalDesignFee;

      const discounts = context.financials?.discounts || [];

      const calculateDiscountValue = (
        base: number,
        target: "execution" | "design",
      ) => {
        const targetDiscounts = discounts.filter(
          (d: any) => d.target === target,
        );
        let totalDeduction = 0;
        targetDiscounts.forEach((d: any) => {
          if (d.type === "percentage") {
            totalDeduction += base * (d.value / 100);
          } else {
            totalDeduction += d.value;
          }
        });
        return totalDeduction;
      };

      const executionDiscountVal = calculateDiscountValue(
        rawExecutionTotal,
        "execution",
      );
      const designDiscountVal = calculateDiscountValue(rawDesignFee, "design");

      const netExecution = Math.max(
        0,
        rawExecutionTotal - executionDiscountVal,
      );
      const netDesign = Math.max(0, rawDesignFee - designDiscountVal);

      value = netExecution + netDesign;
      sortValue = value;
      designFee = netDesign;

      const executionMarginPercent =
        activeTier.summary?.blendedGm !== undefined
          ? activeTier.summary.blendedGm
          : activeTier.summary?.totalGm || 0;
      profit = netExecution * (executionMarginPercent / 100) + netDesign; // Assuming design fee is 100% margin
      margin = value > 0 ? (profit / value) * 100 : 0;
    } else if (tiers.length > 0) {
      // Range State
      isRange = true;
      const revenues = tiers.map(
        (t) => t.summary?.totalRevenue || t.summary?.totalSell || 0,
      );
      sortValue = revenues.reduce((a, b) => a + b, 0) / (revenues.length || 1);
      value = sortValue;
    }

    let status: ProjectStatus = context.status || "draft";
    if (!context.status) {
      if (p.activeProject) status = "execution";
      else if (tiers.length > 0 && (tiers[0].boq?.length || 0) > 0)
        status = "proposal_sent";
      else status = "draft";
    }

    const durationMonths =
      (p.timeline || []).length > 0
        ? Math.ceil(
            p.timeline.reduce(
              (acc: number, ph: any) => acc + (ph.durationDays || 0),
              0,
            ) / 30,
          )
        : 3;

    const profitPerMonth = durationMonths > 0 ? profit / durationMonths : 0;
    const itemCount = activeTier
      ? activeTier.boq?.length || 0
      : tiers[0]?.boq?.length || 0;
    const clientScore = p.leadProfile ? (p.leadProfile.iterationsToClose === '1' ? 80 : 50) : 50;

    const executionDecisions = (
      p.activeProject?.executionData?.decisions || []
    ).filter((d: any) => !d.resolved).length;
    const executionBlockers = (
      p.activeProject?.executionData?.blockers || []
    ).filter((b: any) => !b.resolved).length;
    const riskScore = executionBlockers * 20 + executionDecisions * 10;

    return {
      value,
      sortValue,
      isRange,
      designFee,
      profit,
      status,
      gmPercent: margin,
      durationMonths,
      profitPerMonth,
      itemCount,
      clientScore,
      area: context.area || 0,
      executionDecisions,
      executionBlockers,
      riskScore,
    };
  };

  const pipelineStats = useMemo(() => {
    let pipelineValue = 0;
    let bookedValue = 0;
    let activeLeads = 0;
    let activeProjectsCount = 0;
    let conversionCount = 0;
    let totalClosed = 0;
    let totalBookedProfit = 0;

    // Operational Insights
    let executionLoad = 0;
    let pendingDecisions = 0;
    let totalDurationMonths = 0;
    let projectedMonthlyProfit = 0;
    let totalDesignFeeBooked = 0;
    let activeBookedValue = 0;

    projects.forEach((p) => {
      const m = getProjectMetrics(p);
      if (["draft", "proposal_sent", "negotiation"].includes(m.status)) {
        pipelineValue += m.sortValue;
        activeLeads++;
        if (["proposal_sent", "negotiation"].includes(m.status)) {
          pendingDecisions++;
        }
      }
      if (["won", "execution", "completed"].includes(m.status)) {
        bookedValue += m.sortValue;
        conversionCount++;
        totalClosed++;
        totalBookedProfit += m.profit;
        if (["won", "execution"].includes(m.status)) {
          activeProjectsCount++;
          executionLoad++;
          totalDurationMonths += m.durationMonths;
          projectedMonthlyProfit += m.profitPerMonth;
          totalDesignFeeBooked += m.designFee;
          activeBookedValue += m.sortValue;
        }
      }
      if (m.status === "lost") {
        totalClosed++;
      }
    });

    const conversionRate =
      totalClosed > 0 ? (conversionCount / totalClosed) * 100 : 0;
    const avgMargin =
      bookedValue > 0 ? (totalBookedProfit / bookedValue) * 100 : 0;
    const avgDealSize = conversionCount > 0 ? bookedValue / conversionCount : 0;
    const avgDuration =
      executionLoad > 0 ? totalDurationMonths / executionLoad : 0;

    // Fresh Insights
    const designFeeYield =
      activeBookedValue > 0
        ? (totalDesignFeeBooked / activeBookedValue) * 100
        : 0;
    const revenueVelocity =
      avgDuration > 0 ? activeBookedValue / avgDuration : 0;
    const projectedPipelineYield = pipelineValue * (conversionRate / 100);

    // Trends
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const sixtyDays = 60 * 24 * 60 * 60 * 1000;
    const oneTwentyDays = 120 * 24 * 60 * 60 * 1000;

    const getStatsForBucket = (bucketProjects: FullProjectData[]) => {
      let pValue = 0,
        bValue = 0,
        aLeads = 0,
        cCount = 0,
        tClosed = 0,
        tProfit = 0;
      bucketProjects.forEach((p) => {
        const m = getProjectMetrics(p);
        if (["draft", "proposal_sent", "negotiation"].includes(m.status)) {
          pValue += m.sortValue;
          aLeads++;
        }
        if (["won", "execution", "completed"].includes(m.status)) {
          bValue += m.sortValue;
          cCount++;
          tClosed++;
          tProfit += m.profit;
        }
        if (m.status === "lost") {
          tClosed++;
        }
      });
      const cRate = tClosed > 0 ? (cCount / tClosed) * 100 : 0;
      const aMargin = bValue > 0 ? (tProfit / bValue) * 100 : 0;
      const aDealSize = cCount > 0 ? bValue / cCount : 0;
      return {
        pipelineValue: pValue,
        bookedValue: bValue,
        activeLeads: aLeads,
        conversionRate: cRate,
        avgMargin: aMargin,
        avgDealSize: aDealSize,
        totalValue: pValue + bValue,
      };
    };

    const recentProjects = projects.filter(
      (p) => now - p.lastModified <= thirtyDays,
    );
    const previousProjects = projects.filter(
      (p) =>
        p.lastModified < now - thirtyDays && p.lastModified >= now - sixtyDays,
    );

    const recentStats = getStatsForBucket(recentProjects);
    const previousStats = getStatsForBucket(previousProjects);

    const recentWinProjects = projects.filter(
      (p) => now - p.lastModified <= sixtyDays,
    );
    const previousWinProjects = projects.filter(
      (p) =>
        p.lastModified < now - sixtyDays &&
        p.lastModified >= now - oneTwentyDays,
    );

    const recentWinStats = getStatsForBucket(recentWinProjects);
    const previousWinStats = getStatsForBucket(previousWinProjects);

    const calculateTrend = (
      current: number,
      previous: number,
      sufficientData: boolean,
    ) => {
      if (!sufficientData)
        return { label: "Not enough data", color: "text-slate-400" };
      if (previous === 0) return { label: "→ Stable", color: "text-slate-400" };
      const pctChange = Math.round(((current - previous) / previous) * 100);
      if (pctChange > 2)
        return {
          label: `↑ +${pctChange}% vs last month`,
          color: "text-emerald-600",
        };
      if (pctChange < -2)
        return {
          label: `↓ ${pctChange}% vs last month`,
          color: "text-red-500",
        };
      return { label: "→ Stable", color: "text-slate-400" };
    };

    const hasEnoughData = (recentCount: number, prevCount: number) =>
      recentCount >= 3 && prevCount >= 3;

    const trends = {
      pipelineValue: calculateTrend(
        recentStats.pipelineValue,
        previousStats.pipelineValue,
        hasEnoughData(recentProjects.length, previousProjects.length),
      ),
      bookedValue: calculateTrend(
        recentStats.bookedValue,
        previousStats.bookedValue,
        hasEnoughData(recentProjects.length, previousProjects.length),
      ),
      avgDealSize: calculateTrend(
        recentStats.avgDealSize,
        previousStats.avgDealSize,
        hasEnoughData(recentProjects.length, previousProjects.length),
      ),
      avgMargin: calculateTrend(
        recentStats.avgMargin,
        previousStats.avgMargin,
        hasEnoughData(recentProjects.length, previousProjects.length),
      ),
      conversionRate: calculateTrend(
        recentWinStats.conversionRate,
        previousWinStats.conversionRate,
        hasEnoughData(recentWinProjects.length, previousWinProjects.length),
      ),
      totalValue: calculateTrend(
        recentStats.totalValue,
        previousStats.totalValue,
        hasEnoughData(recentProjects.length, previousProjects.length),
      ),
    };

    return {
      pipelineValue,
      bookedValue,
      activeLeads,
      activeProjectsCount,
      conversionRate,
      avgMargin,
      avgDealSize,
      executionLoad,
      pendingDecisions,
      avgDuration,
      projectedMonthlyProfit,
      designFeeYield,
      revenueVelocity,
      projectedPipelineYield,
      trends,
    };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects
      .filter((p) => {
        const context = p.context || {
          name: "Unnamed Project",
          clientName: "",
        };
        const searchMatch =
          (context.name || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          (context.clientName || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase());

        if (!searchMatch) return false;

        const m = getProjectMetrics(p);

        // Show failed hydration projects regardless of filters
        if ((p as any)._failedHydration) return true;

        if (focusMode && m.riskScore === 0) return false;

        if (statusFilter !== "all" && m.status !== statusFilter) return false;

        if (paymentFilter !== "all") {
          const h = healthScores[p.id];
          if (!h) return false;
          if (paymentFilter === "overdue" && h.healthStatus !== "red")
            return false;
          if (paymentFilter === "at_risk" && h.healthStatus !== "amber")
            return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "health") {
          const ha = healthScores[a.id]?.healthStatus || "neutral";
          const hb = healthScores[b.id]?.healthStatus || "neutral";
          const weight = {
            red: 0,
            amber: 1,
            green: 2,
            neutral: 3,
            fully_paid: 4,
            unconfigured: 5,
          };
          const wa = weight[ha];
          const wb = weight[hb];
          if (wa !== wb) return wa - wb;
        }
        return b.lastModified - a.lastModified;
      });
  }, [
    projects,
    searchQuery,
    statusFilter,
    focusMode,
    sortBy,
    paymentFilter,
    healthScores,
  ]);

  const MotionDiv = motion.div as any;

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="bg-indigo-50 p-6 rounded-full mb-6">
          <BuildingOfficeIcon className="w-16 h-16 text-indigo-400" />
        </div>
        <h2 className="text-2xl font-black text-indigo-900 mb-2">
          No Projects Saved
        </h2>
        <p className="text-slate-500 max-w-md mb-8">
          Your studio library is empty. Start a new project to populate your
          pipeline.
        </p>
        <button
          onClick={onCreateNew}
          className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" /> Start First Project
        </button>
      </div>
    );
  }

  const generateStudioFeed = () => {
    const items: any[] = [];
    const now = Date.now();
    const ONE_DAY = 86400000;

    projects.forEach((p) => {
      const projectName = p.context.name || "Project";

      // Selections
      const selections = p.activeProject?.materialSelections || [];
      selections.forEach((s) => {
        if (s.status === "locked" || (s as any).status === "approved")
          items.push({
            text: `[${projectName}] ${s.itemName} locked ✓`,
            emoji: "🔒",
            type: "sof",
            timestamp: s.clientConfirmedAt
              ? new Date(s.clientConfirmedAt).getTime()
              : now,
            route: "materials",
            project: p,
          });
        if (s.status === "change_requested")
          items.push({
            text: `[${projectName}] ${s.itemName} change requested`,
            emoji: "⚠️",
            type: "warning",
            timestamp: s.changeRequestedAt
              ? new Date(s.changeRequestedAt).getTime()
              : now,
            route: "materials",
            project: p,
          });
      });

      // Decisions
      const decisions = p.activeProject?.projectDecisions || [];
      decisions.forEach((d) => {
        if (d.status === "confirmed")
          items.push({
            text: `[${projectName}] ${d.title} approved`,
            emoji: "✅",
            type: "decision",
            timestamp: d.date ? new Date(d.date).getTime() : now,
            route: "site-ops",
            project: p,
          });
        if (d.status === "rejected")
          items.push({
            text: `[${projectName}] ${d.title} concern raised`,
            emoji: "⚠️",
            type: "warning",
            timestamp: d.date ? new Date(d.date).getTime() : now,
            route: "site-ops",
            project: p,
          });
      });

      // Milestones
      const milestones = p.context.paymentMilestones || [];
      milestones.forEach((m) => {
        if (m.status === "paid")
          items.push({
            text: `[${projectName}] ${m.name} payment received`,
            emoji: "💰",
            type: "payment",
            timestamp: m.date ? new Date(m.date).getTime() : now,
            route: "payment-calc",
            project: p,
          });
        const dueDateTimestamp =
          m.date || m.invoiceDate
            ? new Date(m.date || (m.invoiceDate as string)).getTime()
            : undefined;
        if (dueDateTimestamp && m.status !== "paid") {
          const daysUntilDue = Math.ceil((dueDateTimestamp - now) / ONE_DAY);
          if (daysUntilDue <= 7 && daysUntilDue > 0)
            items.push({
              text: `[${projectName}] ${m.name} due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`,
              emoji: "📅",
              type: "alert",
              timestamp: now - 3600000,
              route: "payment-calc",
              project: p,
            });
          if (daysUntilDue <= 0)
            items.push({
              text: `[${projectName}] ${m.name} payment overdue`,
              emoji: "🚨",
              type: "critical",
              timestamp: now,
              route: "payment-calc",
              project: p,
            });
        }
      });
    });

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
  };

  const feedItems = generateStudioFeed();

  return (
    <div className="space-y-6 md:space-y-8 max-w-7xl mx-auto bg-[#F9F9F8] min-h-screen p-3 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem]">
      {feedItems.length > 0 ? (
        <div className="overflow-hidden whitespace-nowrap bg-[#111] text-white py-3 px-4 rounded-2xl mb-6 md:mb-8 flex items-center shadow-lg group relative">
          <div className="flex items-center gap-2 pr-4 border-r border-white/20 mr-4 shrink-0 bg-[#111] relative z-20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              STUDIO FEED
            </span>
          </div>
          <MotionDiv
            className="flex gap-12 text-xs font-medium tracking-wide will-change-transform"
            animate={{ x: [0, -1500] }}
            transition={{ repeat: Infinity, duration: 35, ease: "linear" }}
            style={{ width: "max-content" }}
          >
            {feedItems.map((item, idx) => (
              <span
                key={`a-${idx}`}
                className="cursor-pointer hover:text-emerald-400 transition-colors"
                onClick={() => onOpenProject(item.project)}
              >
                {item.emoji} {item.text}
              </span>
            ))}
            {feedItems.map((item, idx) => (
              <span
                key={`b-${idx}`}
                className="cursor-pointer hover:text-emerald-400 transition-colors"
                onClick={() => onOpenProject(item.project)}
              >
                {item.emoji} {item.text}
              </span>
            ))}
          </MotionDiv>
        </div>
      ) : (
        <div className="bg-[#111] text-white py-3 px-4 rounded-2xl mb-8 flex items-center shadow-lg">
          <div className="flex items-center gap-2 pr-4 border-r border-white/20 mr-4 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              STUDIO FEED
            </span>
          </div>
          <div className="text-xs text-slate-400 font-medium italic">
            No recent active updates across projects yet.
          </div>
        </div>
      )}

      {/* TAB BAR */}
      <div className="flex justify-center mb-6 md:mb-10 w-full px-1 md:px-4">
        <div className="flex flex-nowrap items-center bg-slate-100/50 backdrop-blur-xl p-1 md:p-1.5 rounded-[2rem] border border-slate-200/60 shadow-sm relative w-full md:w-auto overflow-hidden">
          {/* Active State background */}
          <div
            className="absolute inset-y-1 md:inset-y-1.5 rounded-[1.5rem] bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] z-0 transition-all duration-300 ease-out"
            style={{
              width: "calc(33.33% - 4px)",
              left:
                activeTab === "projects"
                  ? "4px"
                  : activeTab === "intelligence"
                    ? "calc(33.33% + 1px)"
                    : "calc(66.66% - 1px)",
            }}
          ></div>

          <button
            onClick={() => setActiveTab("projects")}
            className={`relative z-10 flex-1 md:flex-none md:w-[160px] py-2.5 md:py-3 text-[9px] md:text-[11px] font-bold uppercase tracking-[0.05em] sm:tracking-[0.2em] rounded-[1.5rem] transition-all duration-300 ${activeTab === "projects" ? "text-indigo-950" : "text-slate-400 hover:text-slate-600"}`}
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            Directory
          </button>
          <button
            onClick={() => setActiveTab("intelligence")}
            className={`relative z-10 flex-1 md:flex-none md:w-[160px] py-2.5 md:py-3 text-[9px] md:text-[11px] font-bold uppercase tracking-[0.05em] sm:tracking-[0.2em] rounded-[1.5rem] transition-all duration-300 ${activeTab === "intelligence" ? "text-indigo-950" : "text-slate-400 hover:text-slate-600"}`}
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            Intelligence
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`relative z-10 flex-1 md:flex-none md:w-[160px] py-2.5 md:py-3 text-[9px] md:text-[11px] font-bold uppercase tracking-[0.05em] sm:tracking-[0.2em] rounded-[1.5rem] transition-all duration-300 ${activeTab === "analytics" ? "text-indigo-950" : "text-slate-400 hover:text-slate-600"}`}
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            Analytics
          </button>
        </div>
      </div>

      {/* ACTION BAR */}
      {activeTab === "projects" && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 px-4">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-indigo-950">
              Project Directory
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage active executions and pipeline deals.
            </p>
          </div>
          <button
            onClick={onCreateNew}
            className="px-6 py-3 bg-indigo-950 text-white rounded-full hover:bg-indigo-950 transition-all shadow-[0_8px_30px_-4px_rgba(0,0,0,0.3)] hover:shadow-[0_12px_40px_-4px_rgba(0,0,0,0.4)] flex items-center justify-center gap-2 text-sm font-bold w-full md:w-auto shrink-0"
          >
            <PlusIcon className="w-4 h-4" /> New Project
          </button>
        </div>
      )}

      {activeTab === "intelligence" && (
        <div className="space-y-12">
          <div className="px-4">
            <h1 className="text-3xl font-light tracking-tight text-indigo-950">
              Ops Intelligence
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Execution bottlenecks, risk factors, and pending client decisions.
            </p>
          </div>

          {/* 1. COMPACT STATS HEADER */}
          <MotionDiv
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, staggerChildren: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4"
          >
            <MotionDiv className="bg-indigo-950 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-transform">
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
              <div className="mt-8 pt-6 border-t border-indigo-900">
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
            </MotionDiv>

            <MotionDiv className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-transform">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">
                  Pace & Volume
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-light tracking-tighter text-indigo-950">
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
                  <p className="text-lg font-medium text-indigo-900 mt-1">
                    {pipelineStats.activeProjectsCount} Projects
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Win Rate
                  </p>
                  <p className="text-lg font-medium text-indigo-900 mt-1">
                    {pipelineStats.conversionRate.toFixed(0)}%
                  </p>
                </div>
              </div>
            </MotionDiv>

            <MotionDiv className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-transform">
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
                  <p className="text-lg font-medium text-indigo-900 mt-1">
                    {formatClientValue(pipelineStats.avgDealSize)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Est Margin
                  </p>
                  <p className="text-lg font-medium text-indigo-700 mt-1">
                    {pipelineStats.avgMargin.toFixed(1)}%
                  </p>
                </div>
              </div>
            </MotionDiv>
          </MotionDiv>

          <div className="px-4">
            <CashFlowSummaryWidget
              onNavigate={() => setActiveTab("analytics")}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-4 mt-6">
            {/* Ops Feature 1: Procurement & Lead Time Risk */}
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none text-indigo-900">
                <ClockIcon className="w-24 h-24" />
              </div>
              <h3 className="text-xl font-light tracking-tight text-indigo-950 leading-none mb-1">
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
                      <p className="font-bold text-sm text-indigo-950">
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
                      <p className="font-bold text-sm text-indigo-950">
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
            <div className="bg-indigo-950 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden h-full">
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
                  <div className="w-full bg-indigo-900 rounded-full h-1.5 mb-2">
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

                <div className="pt-4 border-t border-indigo-900">
                  <div className="flex justify-between items-end mb-2">
                    <p className="font-bold text-sm text-white">
                      Star Carpentry
                    </p>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                      Available
                    </span>
                  </div>
                  <div className="w-full bg-indigo-900 rounded-full h-1.5 mb-2">
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
        <div className="space-y-6 px-4">
          {/* 2. SUPER CLEAN TOOLBAR */}
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6 bg-transparent pt-2 pb-4 border-b border-slate-200/50 mb-6 w-full">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">
                Phase:
              </span>
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all ${statusFilter === "all" ? "bg-indigo-950 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter("draft")}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all ${statusFilter === "draft" ? "bg-indigo-950 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              >
                Pipeline
              </button>
              <button
                onClick={() => setStatusFilter("proposal_sent")}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all ${statusFilter === "proposal_sent" ? "bg-indigo-950 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              >
                Proposals
              </button>
              <button
                onClick={() => setStatusFilter("won")}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all ${statusFilter === "won" ? "bg-indigo-950 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              >
                Execution
              </button>
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
                {filteredProjects.map((project) => {
                  const metrics = getProjectMetrics(project);
                  const isActive = activeProjectId === project.id;
                  const lastEdited = timeAgo(project.lastModified);
                  const statusStyle =
                    STATUS_CONFIG[metrics.status] || STATUS_CONFIG["draft"];

                  // CALCULATE PENDING ITEM INDICATORS
                  const getIndicators = () => {
                    const conditions = [];

                    if (metrics.status !== "lost") {
                      // 1. Payment Due (within 7 days or overdue)
                      const upcomingOrOverdue =
                        project.context?.paymentMilestones
                          ?.filter((m) => {
                            if (m.status === "paid" || !m.date) return false;
                            const mDate = new Date(m.date);
                            if (isNaN(mDate.getTime())) return false;
                            const in7Days = new Date();
                            in7Days.setDate(in7Days.getDate() + 7);
                            return mDate <= in7Days;
                          })
                          .sort(
                            (a, b) =>
                              new Date(a.date!).getTime() -
                              new Date(b.date!).getTime(),
                          );

                      if (upcomingOrOverdue && upcomingOrOverdue.length > 0) {
                        const d = new Date(
                          upcomingOrOverdue[0].date!,
                        ).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        });
                        conditions.push({
                          dot: "bg-rose-500",
                          text: `Payment due ${d}`,
                        });
                      }

                      // 2. Pending Decisions
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

                      // 3. SOF Items Pending
                      const pendingSofItems =
                        project.activeProject?.executionData?.sofItems?.filter(
                          (s) => s.status === "pending",
                        )?.length || 0;
                      if (pendingSofItems > 0) {
                        conditions.push({
                          dot: "bg-amber-500",
                          text: `${pendingSofItems} SOF item${pendingSofItems > 1 ? "s" : ""} pending`,
                        });
                      }
                    }

                    if (conditions.length === 0) return null;

                    return (
                      <div className="mt-2 pt-3 border-t border-slate-100 flex flex-col gap-2 mb-2">
                        {conditions.slice(0, 2).map((c, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-[10px] text-slate-600 font-semibold uppercase tracking-wider"
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${c.dot}`}
                            ></span>
                            <span>{c.text}</span>
                          </div>
                        ))}
                        {conditions.length > 2 && (
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                            <span>+{conditions.length - 2} more blockers</span>
                          </div>
                        )}
                      </div>
                    );
                  };

                  return (
                    <MotionDiv
                      key={project.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`bg-white rounded-2xl border transition-all duration-200 relative group flex flex-col cursor-pointer overflow-hidden h-full hover:shadow-lg hover:-translate-y-0.5
                                    ${isActive ? "border-indigo-500 ring-1 ring-indigo-500 shadow-md" : "border-slate-200 hover:border-slate-300"}
                                `}
                      onClick={() => onOpenProject(project)}
                    >
                      <div className="p-5 pb-0 flex flex-col gap-3 border-b border-slate-50/50 bg-slate-50/30">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-[0.15em] border ${statusStyle.bg} ${statusStyle.color} ${statusStyle.border}`}
                            >
                              {statusStyle.label}
                            </span>
                            {metrics.riskScore > 0 && (
                              <span className="flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-[0.15em] bg-rose-50 text-rose-600 border border-rose-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                At Risk
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-semibold tracking-wider shrink-0 mt-0.5">
                            {lastEdited}
                          </span>
                        </div>
                        
                        {/* Status Progress Bar */}
                        <div className="flex flex-col gap-1.5 mt-2 mb-[-2px]">
                          <div className="flex items-center justify-between">
                             <div className="flex gap-[1px] flex-1 mr-3">
                                {[...Array(10)].map((_, i) => {
                                  const progressPct = metrics.status === 'completed' ? 100 : 
                                    (metrics.status === 'execution' || metrics.status === 'work_paused') ? 65 : 
                                    metrics.status === 'won' ? 35 : 
                                    metrics.status === 'negotiation' ? 25 : 
                                    metrics.status === 'proposal_sent' ? 15 : 
                                    metrics.status === 'draft' ? 5 : 0;
                                    
                                  const barColor = metrics.status === 'completed' ? 'bg-emerald-500' : 
                                    metrics.status === 'execution' ? 'bg-indigo-500' : 
                                    metrics.status === 'work_paused' ? 'bg-rose-500' : 
                                    metrics.status === 'won' ? 'bg-emerald-400' : 
                                    metrics.status === 'negotiation' ? 'bg-amber-400' : 
                                    metrics.status === 'proposal_sent' ? 'bg-indigo-400' : 
                                    'bg-slate-400';

                                  return (
                                    <div 
                                      key={i} 
                                      className={`h-1.5 flex-1 rounded-[1px] ${
                                        (i + 1) * 10 <= (progressPct + 5) ? barColor : 'bg-slate-200/60'
                                      }`}
                                    ></div>
                                  );
                                })}
                             </div>
                             <span className="text-[9px] font-bold text-slate-500 tracking-wider">
                                {metrics.status === 'completed' ? 100 : 
                                 (metrics.status === 'execution' || metrics.status === 'work_paused') ? 65 : 
                                 metrics.status === 'won' ? 35 : 
                                 metrics.status === 'negotiation' ? 25 : 
                                 metrics.status === 'proposal_sent' ? 15 : 
                                 metrics.status === 'draft' ? 5 : 0}%
                             </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-5 flex-grow flex flex-col">
                        <div className="mb-4">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em] mb-0.5">
                            Project Name
                          </p>
                          <h3
                            className="text-[1.1rem] font-semibold tracking-tight text-indigo-950 leading-snug mb-2 line-clamp-2"
                            title={project.context?.name || "Unnamed Project"}
                          >
                            {project.context?.name || "Unnamed Project"}
                          </h3>
                          <div className="flex items-center gap-2">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em]">
                              Client:
                            </p>
                            <div className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-600 shrink-0">
                              {(project.context?.clientName || "U")
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium truncate">
                              {project.context?.clientName || "Unknown Client"}
                            </p>
                          </div>
                        </div>

                        {/* Action Indicators */}
                        {metrics.status !== "lost" && (
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
                        )}

                        {getIndicators()}

                        {/* Financial Summary */}
                        <div className="mt-auto pt-4 border-t border-slate-100">
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
                                        <p className="text-lg font-semibold text-indigo-950 leading-none">
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
                                    <p className="text-lg font-semibold text-indigo-950 leading-none">
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
                      </div>

                      {/* Footer actions */}
                      <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-600 flex items-center gap-1.5 group-hover:text-indigo-700 transition-colors">
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
                              onDuplicateProject(project);
                            }}
                            className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 rounded hover:border-indigo-200 transition-colors shadow-sm"
                            title="Duplicate"
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
                            className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 rounded transition-colors shadow-sm"
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
                    </MotionDiv>
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
                            className="p-5 min-w-[200px] font-light tracking-tighter text-indigo-950 text-xl border-l border-slate-200/50"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/40 backdrop-blur-md p-4">
            <MotionDiv
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/50 max-w-md w-full overflow-hidden"
            >
              <div className="p-8">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-500 flex items-center justify-center mb-6">
                  <DeleteIcon className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-light tracking-tighter text-indigo-950 mb-3">
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
                    className="px-6 py-3 rounded-xl text-sm font-bold text-slate-500 hover:text-indigo-900 hover:bg-slate-100 transition-all"
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
            </MotionDiv>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProjectListTab;
