import React, { useMemo, useState } from "react";
import { FullProjectData } from "../types";
import { formatINR, formatCurrency } from "../lib/utils";
import AnimatedNumber from "./ui/AnimatedNumber";
import { motion, AnimatePresence } from "framer-motion";
import { calculateProjectFinancials, getSingleProjectValue } from "../lib/financialsUtils";
export { getSingleProjectValue };
import { SEED_OBSERVATIONS, SEED_SOURCE } from "../lib/studioSeed";
import {
  directorFindings,
  blendedMargin,
  costMix,
  vendorRecords,
  concentration,
  spendByMonth,
  transactionProfile,
  COST_TYPE_LABEL
} from "../lib/studioMemory";
import {
  TrendingUp,
  BarChart3,
  Users,
  Target,
  FileSpreadsheet,
  ArrowRight,
  TrendingDown,
  Percent,
  CheckCircle2,
  DollarSign,
  Layers,
  Brain,
  Sparkles,
  HelpCircle,
  ShieldAlert,
  AlertTriangle,
  Lightbulb,
  FileText,
  Calendar,
  Building2,
  MapPin,
  Compass,
  Briefcase,
  Activity,
  Clock,
  ShieldCheck,
  Wallet,
  ArrowUpRight,
  Filter,
  Download,
  Pin,
  Search,
  Maximize2,
  RefreshCw,
  ChevronRight,
  CheckCircle,
  Zap,
  Tag
} from "lucide-react";

interface StudioReportsProps {
  projects: FullProjectData[];
  onNavigate?: (tab: string) => void;
}

// Stage classification
const STAGES_CONFIG = [
  { key: "leads", label: "Leads & Scopes", statuses: ["lead", "draft"], color: "bg-amber-500 text-amber-600", barGradient: "from-amber-400 to-amber-500", glow: "shadow-amber-500/20" },
  { key: "proposals", label: "Proposals & Negotiation", statuses: ["proposal_sent", "negotiation"], color: "bg-orange-500 text-orange-600", barGradient: "from-orange-400 to-orange-500", glow: "shadow-orange-500/20" },
  { key: "won", label: "Contract Won", statuses: ["won"], color: "bg-sky-600 text-sky-600", barGradient: "from-sky-500 to-sky-600", glow: "shadow-sky-500/20" },
  { key: "execution", label: "In Active Execution", statuses: ["execution", "work_paused"], color: "bg-indigo-600 text-indigo-600", barGradient: "from-indigo-500 to-indigo-600", glow: "shadow-indigo-500/20" },
  { key: "delivered", label: "Delivered & Handover", statuses: ["completed"], color: "bg-emerald-600 text-emerald-600", barGradient: "from-emerald-400 to-emerald-600", glow: "shadow-emerald-500/20" },
  { key: "lost", label: "Lost / Closed", statuses: ["lost", "archived"], color: "bg-rose-500 text-rose-600", barGradient: "from-rose-400 to-rose-500", glow: "shadow-rose-500/20" },
];

export const isDummyProject = (p: FullProjectData): boolean => {
  if (p.context?.isDummy !== undefined) return Boolean(p.context.isDummy);
  if (p.context?.projectCategory) return p.context.projectCategory === 'dummy';
  const name = (p.context?.name || '').toLowerCase();
  return name.includes('sample') || name.includes('demo') || name.includes('test');
};

// 3D Perspective Card Wrapper with subtle mouse gyro elevation
function PerspectiveCard({
  children,
  className = "",
  glowColor = "rgba(79, 70, 229, 0.12)",
  onClick
}: {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  onClick?: () => void;
}) {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // Moderate tilt angles for sophisticated, subtle tactile feel
    setRotateX(-y / 18);
    setRotateY(x / 18);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setIsHovered(false);
  };

  return (
    <div
      style={{ perspective: 1000 }}
      className="w-full h-full"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <motion.div
        animate={{
          rotateX,
          rotateY,
          scale: isHovered ? 1.018 : 1,
          translateZ: isHovered ? 12 : 0,
        }}
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
        style={{ transformStyle: "preserve-3d" }}
        className={`relative transition-shadow duration-300 ${className}`}
      >
        {/* Subtle 3D Ambient specular sheen on hover */}
        {isHovered && (
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300 opacity-60 mix-blend-overlay"
            style={{
              background: `radial-gradient(circle at ${50 + rotateY * 3}% ${50 - rotateX * 3}%, ${glowColor}, transparent 70%)`
            }}
          />
        )}
        {children}
      </motion.div>
    </div>
  );
}

export default function StudioReports({ projects, onNavigate }: StudioReportsProps) {
  const [subTab, setSubTab] = useState<'live' | 'memory'>('live');
  const [datasetFilter, setDatasetFilter] = useState<'all' | 'actual' | 'dummy'>('all');
  const [signalCategory, setSignalCategory] = useState<'all' | 'cash' | 'gate' | 'capacity'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pre-calculate Global Dataset Split (All vs Actual vs Dummy)
  const globalCounts = useMemo(() => {
    const total = projects.length;
    let actualCount = 0;
    let dummyCount = 0;
    let actualVal = 0;
    let dummyVal = 0;

    for (const p of projects) {
      const isDummy = isDummyProject(p);
      const val = getSingleProjectValue(p);
      if (isDummy) {
        dummyCount++;
        dummyVal += val;
      } else {
        actualCount++;
        actualVal += val;
      }
    }

    return {
      total,
      actualCount,
      dummyCount,
      actualVal,
      dummyVal,
      actualShare: total > 0 ? (actualCount / total) * 100 : 0,
      dummyShare: total > 0 ? (dummyCount / total) * 100 : 0
    };
  }, [projects]);

  // Filtered dataset according to user's dataset slice selection
  const scopedProjects = useMemo(() => {
    return projects.filter(p => {
      if (datasetFilter === 'actual' && isDummyProject(p)) return false;
      if (datasetFilter === 'dummy' && !isDummyProject(p)) return false;
      return true;
    });
  }, [projects, datasetFilter]);

  // Comprehensive Live Analytical Aggregations
  const data = useMemo(() => {
    let pipelineValue = 0;
    let bookedValue = 0;
    let deliveredValue = 0;
    let lostValue = 0;

    let wonCount = 0;
    let executionCount = 0;
    let deliveredCount = 0;
    let lostCount = 0;
    let leadCount = 0;
    let proposalCount = 0;

    let totalSqft = 0;
    let bookedDeliveredSqft = 0;
    let totalPaidInr = 0;
    let totalInvoicedInr = 0;
    let totalDesignFeeInr = 0;

    const clientsMap = new Map<string, {
      name: string;
      email?: string;
      phone?: string;
      totalValue: number;
      totalSqft: number;
      projectsCount: number;
      activeCount: number;
      deliveredCount: number;
      isActual: boolean;
      projectNames: string[];
    }>();

    const typologyMap = new Map<string, { count: number; value: number; sqft: number }>();
    const themeMap = new Map<string, { count: number; value: number }>();

    // Stage stats initialization
    const stageStats: Record<string, { count: number; value: number; color: string; barGradient: string; glow: string; label: string; key: string }> = {};
    for (const stg of STAGES_CONFIG) {
      stageStats[stg.key] = {
        count: 0,
        value: 0,
        color: stg.color,
        barGradient: stg.barGradient,
        glow: stg.glow,
        label: stg.label,
        key: stg.key
      };
    }

    for (const p of scopedProjects) {
      const status = p.context?.status || "draft";
      const pVal = getSingleProjectValue(p);
      const pSqft = p.context?.area || 0;
      const config = (p.context?.config || "2BHK").trim().toUpperCase();
      const theme = (p.context?.theme || "Modern Minimalist").trim();
      const isDummy = isDummyProject(p);

      totalSqft += pSqft;

      // Typology breakdown
      const typ = typologyMap.get(config) || { count: 0, value: 0, sqft: 0 };
      typ.count += 1;
      typ.value += pVal;
      typ.sqft += pSqft;
      typologyMap.set(config, typ);

      // Theme breakdown
      const th = themeMap.get(theme) || { count: 0, value: 0 };
      th.count += 1;
      th.value += pVal;
      themeMap.set(theme, th);

      // Financial milestones parsing for collections
      try {
        const financials = calculateProjectFinancials(p.context);
        totalPaidInr += financials.totalPaid || 0;
        totalInvoicedInr += financials.totalInvoicedBaseAmt || 0;
      } catch {
        // Safe fallback
      }

      // Design fee aggregation
      const pDesignFee = p.context?.designFee || p.context?.financials?.approvedDesignValue || (pVal * 0.08);
      totalDesignFeeInr += pDesignFee;

      // Classify stages & update aggregate stats
      let stageKey = "leads";
      if (["lead", "draft"].includes(status)) {
        stageKey = "leads";
        leadCount++;
        pipelineValue += pVal;
      } else if (["proposal_sent", "negotiation"].includes(status)) {
        stageKey = "proposals";
        proposalCount++;
        pipelineValue += pVal;
      } else if (["won"].includes(status)) {
        stageKey = "won";
        wonCount++;
        bookedValue += pVal;
        bookedDeliveredSqft += pSqft;
      } else if (["execution", "work_paused"].includes(status)) {
        stageKey = "execution";
        executionCount++;
        bookedValue += pVal;
        bookedDeliveredSqft += pSqft;
      } else if (["completed"].includes(status)) {
        stageKey = "delivered";
        deliveredCount++;
        deliveredValue += pVal;
        bookedDeliveredSqft += pSqft;
      } else if (["lost", "archived"].includes(status)) {
        stageKey = "lost";
        lostCount++;
        lostValue += pVal;
      }

      if (stageStats[stageKey]) {
        stageStats[stageKey].count++;
        stageStats[stageKey].value += pVal;
      }

      // Aggregate by client
      const clientEmail = p.context?.clientEmail;
      const clientName = p.context?.clientName;
      if (clientEmail || clientName) {
        const isWonOrDelivered = ["won", "execution", "work_paused", "completed"].includes(status);
        const key = (clientEmail || clientName).toLowerCase().trim();
        const existing = clientsMap.get(key);
        const pName = p.context?.name || "Untitled Project";

        if (existing) {
          if (isWonOrDelivered) existing.totalValue += pVal;
          existing.totalSqft += pSqft;
          existing.projectsCount++;
          if (["won", "execution", "work_paused"].includes(status)) existing.activeCount++;
          if (status === "completed") existing.deliveredCount++;
          if (!existing.projectNames.includes(pName)) existing.projectNames.push(pName);
        } else {
          clientsMap.set(key, {
            name: clientName || clientEmail || "Unnamed Client",
            email: clientEmail,
            phone: p.context?.clientPhone,
            totalValue: isWonOrDelivered ? pVal : 0,
            totalSqft: pSqft,
            projectsCount: 1,
            activeCount: ["won", "execution", "work_paused"].includes(status) ? 1 : 0,
            deliveredCount: status === "completed" ? 1 : 0,
            isActual: !isDummy,
            projectNames: [pName]
          });
        }
      }
    }

    // Portfolio Value = Pipeline + Booked + Delivered
    const portfolioValue = pipelineValue + bookedValue + deliveredValue;
    const activeContractedValue = bookedValue + deliveredValue;

    // Top clients: sorted desc by total value, top 6
    const topClients = Array.from(clientsMap.values())
      .filter(c => c.totalValue > 0 || c.projectsCount > 0)
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 6);

    // Conversion rate: (won + active + completed) / (won + active + completed + lost)
    const activeAndDecided = wonCount + executionCount + deliveredCount + lostCount;
    const winRate = activeAndDecided > 0 ? Math.round(((wonCount + executionCount + deliveredCount) / activeAndDecided) * 100) : 0;

    // Average Deal Size (portfolio value / non-lost projects)
    const activeProjectsCount = scopedProjects.filter(p => !["lost", "archived"].includes(p.context?.status || "")).length;
    const avgDealSize = activeProjectsCount > 0 ? portfolioValue / activeProjectsCount : 0;

    // Realized Rate per Sq Ft
    const avgRatePerSqft = bookedDeliveredSqft > 0 ? activeContractedValue / bookedDeliveredSqft : (totalSqft > 0 ? portfolioValue / totalSqft : 0);

    // Collections Health
    const pendingCollections = Math.max(0, activeContractedValue - totalPaidInr);
    const collectionEfficiency = activeContractedValue > 0 ? Math.min(100, Math.round((totalPaidInr / activeContractedValue) * 100)) : 0;

    // Total Count
    const totalCount = scopedProjects.length;

    // Smart Action Signals & Insights derived from live portfolio data
    interface SmartSignal {
      id: string;
      category: 'cash' | 'gate' | 'capacity';
      severity: 'critical' | 'warning' | 'positive' | 'info';
      tag: string;
      title: string;
      description: string;
      metric: string;
      metricLabel: string;
      actionText?: string;
      projectId?: string;
      tabTarget?: string;
    }

    const smartSignals: SmartSignal[] = [];

    // Signal 1: Cash Collection Runway
    if (pendingCollections > 0) {
      smartSignals.push({
        id: "sig-cash-uncollected",
        category: "cash",
        severity: collectionEfficiency < 50 ? "critical" : "warning",
        tag: "Receivables",
        title: `${collectionEfficiency}% Invoiced Cash Collected`,
        description: `${formatINR(pendingCollections)} outstanding across active execution and booked sites.`,
        metric: formatINR(pendingCollections),
        metricLabel: "Pending Inflow",
        actionText: "Review Financials",
        tabTarget: "financials"
      });
    } else if (activeContractedValue > 0) {
      smartSignals.push({
        id: "sig-cash-healthy",
        category: "cash",
        severity: "positive",
        tag: "Zero Arrears",
        title: "100% Contracted Capital Collected",
        description: "All booked execution sites are fully collected to date.",
        metric: "100%",
        metricLabel: "Collection Ratio",
        actionText: "View Payments",
        tabTarget: "financials"
      });
    }

    // Signal 2: BOQ Freeze & Design Gates
    const unfrozenExecution = scopedProjects.filter(p => {
      const status = p.context?.status || "";
      const isWonOrExec = ["won", "execution"].includes(status);
      const isFrozen = p.canonical?.boqFrozen || false;
      return isWonOrExec && !isFrozen;
    });

    if (unfrozenExecution.length > 0) {
      smartSignals.push({
        id: "sig-gate-unfrozen",
        category: "gate",
        severity: "warning",
        tag: "Gate Control",
        title: `${unfrozenExecution.length} Site${unfrozenExecution.length > 1 ? 's' : ''} Pending BOQ Freeze`,
        description: `Unfrozen BOQs in active execution pose procurement margin leakage risks.`,
        metric: `${unfrozenExecution.length} Active`,
        metricLabel: "Open Gates",
        actionText: "Open BOQ",
        tabTarget: "boq"
      });
    } else if (scopedProjects.some(p => p.canonical?.boqFrozen)) {
      smartSignals.push({
        id: "sig-gate-locked",
        category: "gate",
        severity: "positive",
        tag: "Audited Baseline",
        title: "Procurement Baselines Locked",
        description: "Active execution sites have locked BOQs with verified vendor rates.",
        metric: "Locked",
        metricLabel: "Baseline Status",
        actionText: "View Audit",
        tabTarget: "boq"
      });
    }

    // Signal 3: Pipeline Velocity & Win Rate
    if (proposalCount > 0) {
      smartSignals.push({
        id: "sig-pipeline-open",
        category: "capacity",
        severity: "info",
        tag: "Pipeline",
        title: `${proposalCount} Live Proposal Tiers in Market`,
        description: `Total pipeline value of ${formatINR(pipelineValue)} ready for closing.`,
        metric: formatINR(pipelineValue),
        metricLabel: "In Negotiation",
        actionText: "Review Proposals",
        tabTarget: "proposals"
      });
    }

    // Signal 4: Spatial Realization Yield
    if (avgRatePerSqft > 0) {
      const isPremiumYield = avgRatePerSqft >= 2000;
      smartSignals.push({
        id: "sig-yield-rate",
        category: "capacity",
        severity: isPremiumYield ? "positive" : "info",
        tag: "Spatial Yield",
        title: `Average Realization ₹${Math.round(avgRatePerSqft).toLocaleString('en-IN')}/sq.ft`,
        description: isPremiumYield ? "High-yield portfolio density with luxury tier specifications." : "Standard turnkey specification pricing footprint.",
        metric: `₹${Math.round(avgRatePerSqft)}`,
        metricLabel: "per sq.ft avg",
        actionText: "Explore Projects",
        tabTarget: "projects"
      });
    }

    // Typologies array
    const typologiesList = Array.from(typologyMap.entries())
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.value - a.value);

    // Themes array
    const themesList = Array.from(themeMap.entries())
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.value - a.value);

    return {
      portfolioValue,
      pipelineValue,
      bookedValue,
      deliveredValue,
      lostValue,
      activeContractedValue,
      totalPaidInr,
      pendingCollections,
      collectionEfficiency,
      totalDesignFeeInr,
      totalSqft,
      avgRatePerSqft,
      winRate,
      avgDealSize,
      activeProjectsCount,
      clientsCount: clientsMap.size,
      stageStats: Object.values(stageStats),
      topClients,
      smartSignals,
      typologiesList,
      themesList,
      totalCount
    };
  }, [scopedProjects]);

  const memoryData = useMemo(() => {
    const obs = SEED_OBSERVATIONS;
    const blended = blendedMargin(obs);
    const mix = costMix(obs);
    const vendors = vendorRecords(obs);
    const conc = concentration(obs);
    const findingsList = directorFindings(obs);
    const monthlySpend = spendByMonth(obs);
    const adminProfile = transactionProfile(obs);

    return {
      blended,
      mix,
      vendors,
      conc,
      findingsList,
      monthlySpend,
      adminProfile
    };
  }, []);

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
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 18 } }
  };

  const filteredSignals = useMemo(() => {
    if (signalCategory === 'all') return data.smartSignals;
    return data.smartSignals.filter(s => s.category === signalCategory);
  }, [data.smartSignals, signalCategory]);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="w-full px-4 pb-16 space-y-8 bg-transparent"
    >
      {/* 1. TOP CONTROL BAR & SUB-TABS SELECTOR */}
      <motion.div variants={itemVariants} className="pt-2 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
              <Activity className="w-3 h-3" />
              Executive Intelligence
            </span>
            <span className="text-xs text-slate-400">· Real-time INR Studio Ledger</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
            Studio Performance & Live Analytics
          </h2>
        </div>

        {/* SUB-TABS SELECTOR */}
        <div className="flex items-center gap-3">
          <div className="flex border border-slate-200 bg-white rounded-xl p-1 shadow-xs self-start md:self-end">
            <button
              onClick={() => setSubTab('live')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all leading-none cursor-pointer flex items-center gap-1.5 ${
                subTab === 'live'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Live Portfolio Analytics
            </button>
            <button
              onClick={() => setSubTab('memory')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all leading-none flex items-center gap-1.5 cursor-pointer ${
                subTab === 'memory'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-amber-400" />
              Studio Memory & Benchmarks
            </button>
          </div>
        </div>
      </motion.div>

      {/* SUB-TAB CONTENTS */}
      {subTab === 'live' ? (
        projects.length === 0 ? (
          <div className="max-w-lg mx-auto py-16 text-center">
            <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm">
              <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-light text-slate-800">No active project data available</h2>
              <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
                Once you create projects, draft scopes, or win contracts, this dashboard will visualize your live studio pipeline.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* 2. DATASET SLICE CONTROLLER (ACTUAL VS DUMMY) */}
            <motion.div
              variants={itemVariants}
              className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 p-4 shadow-card flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  Dataset Slice:
                </div>

                {/* Actual vs Dummy Segment Switcher */}
                <div className="flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setDatasetFilter('all')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      datasetFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <span>Combined Portfolio</span>
                    <span className="px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-600 text-[10px] font-mono">
                      {globalCounts.total}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDatasetFilter('actual')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      datasetFilter === 'actual'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-sky-300"></span>
                    <span>Actual Sites Only</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                      datasetFilter === 'actual' ? 'bg-sky-700 text-sky-100' : 'bg-slate-200/70 text-slate-600'
                    }`}>
                      {globalCounts.actualCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDatasetFilter('dummy')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      datasetFilter === 'dummy'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-200"></span>
                    <span>Dummy / Demos Only</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                      datasetFilter === 'dummy' ? 'bg-amber-600 text-amber-100' : 'bg-slate-200/70 text-slate-600'
                    }`}>
                      {globalCounts.dummyCount}
                    </span>
                  </button>
                </div>
              </div>

              {/* Composition Proportional Bar */}
              <div className="flex items-center gap-4 w-full lg:w-auto text-xs">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Studio Data Mix
                  </span>
                  <span className="text-xs font-semibold text-slate-700">
                    <span className="text-sky-600 font-bold">{globalCounts.actualCount} Actual</span> ({formatINR(globalCounts.actualVal)}) · <span className="text-amber-600 font-bold">{globalCounts.dummyCount} Demo</span>
                  </span>
                </div>

                <div className="w-full sm:w-44 h-3 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200/80 shadow-xs">
                  <div
                    style={{ width: `${globalCounts.actualShare}%` }}
                    className="h-full bg-gradient-to-r from-sky-500 to-sky-600 transition-all duration-500"
                    title={`Actual Projects: ${globalCounts.actualShare.toFixed(1)}%`}
                  />
                  <div
                    style={{ width: `${globalCounts.dummyShare}%` }}
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                    title={`Dummy/Demo Projects: ${globalCounts.dummyShare.toFixed(1)}%`}
                  />
                </div>
              </div>
            </motion.div>

            {/* 3. 3D HERO KPI METRICS GRID */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {/* 1. Live Portfolio Total */}
              <PerspectiveCard glowColor="rgba(79, 70, 229, 0.18)">
                <div className="h-full p-4.5 rounded-2xl bg-white border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-indigo-300">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Portfolio Valuation
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold text-slate-900 leading-none tracking-tight tabular-nums">
                      <AnimatedNumber value={data.portfolioValue} format={(v) => formatINR(v)} />
                    </h3>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Booked: <strong className="text-slate-800 font-semibold">{formatINR(data.bookedValue)}</strong></span>
                      <span>· {data.totalCount} proj</span>
                    </div>
                  </div>
                </div>
              </PerspectiveCard>

              {/* 2. Pipeline In Play */}
              <PerspectiveCard glowColor="rgba(245, 158, 11, 0.18)">
                <div className="h-full p-4.5 rounded-2xl bg-white border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-amber-300">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Active Pipeline
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-xs">
                      <Target className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold text-slate-900 leading-none tracking-tight tabular-nums">
                      <AnimatedNumber value={data.pipelineValue} format={(v) => formatINR(v)} />
                    </h3>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Proposals & Leads</span>
                      <span className="font-semibold text-amber-600">
                        {data.portfolioValue > 0 ? Math.round((data.pipelineValue / data.portfolioValue) * 100) : 0}% share
                      </span>
                    </div>
                  </div>
                </div>
              </PerspectiveCard>

              {/* 3. Cash Realized (Collections) */}
              <PerspectiveCard glowColor="rgba(16, 185, 129, 0.18)">
                <div className="h-full p-4.5 rounded-2xl bg-white border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-emerald-300">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Realized Inflows
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-xs">
                      <Wallet className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold text-emerald-700 leading-none tracking-tight tabular-nums">
                      <AnimatedNumber value={data.totalPaidInr} format={(v) => formatINR(v)} />
                    </h3>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Collections Health</span>
                      <span className="font-bold text-emerald-600">{data.collectionEfficiency}% Collected</span>
                    </div>
                  </div>
                </div>
              </PerspectiveCard>

              {/* 4. Spatial Realization (₹/sqft & Total Sqft) */}
              <PerspectiveCard glowColor="rgba(14, 165, 233, 0.18)">
                <div className="h-full p-4.5 rounded-2xl bg-white border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-sky-300">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Realized Rate
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shadow-xs">
                      <Building2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold text-slate-900 leading-none tracking-tight tabular-nums">
                      ₹{Math.round(data.avgRatePerSqft).toLocaleString('en-IN')}<span className="text-xs font-normal text-slate-400">/sqft</span>
                    </h3>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Footprint: <strong className="text-slate-800 font-semibold">{data.totalSqft.toLocaleString('en-IN')}</strong> sqft</span>
                    </div>
                  </div>
                </div>
              </PerspectiveCard>

              {/* 5. Win Rate & Velocity */}
              <PerspectiveCard glowColor="rgba(147, 51, 234, 0.18)">
                <div className="h-full p-4.5 rounded-2xl bg-white border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-purple-300">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Deal Win Rate
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-xs">
                      <Percent className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold text-slate-900 leading-none tracking-tight tabular-nums">
                      <AnimatedNumber value={data.winRate} format={(v) => `${Math.floor(v)}%`} />
                    </h3>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Avg Ticket:</span>
                      <span className="font-semibold text-slate-800">{formatINR(data.avgDealSize)}</span>
                    </div>
                  </div>
                </div>
              </PerspectiveCard>

              {/* 6. Client Accounts Base */}
              <PerspectiveCard glowColor="rgba(59, 130, 246, 0.18)" onClick={() => onNavigate && onNavigate('clients')}>
                <div className="h-full p-4.5 rounded-2xl bg-white border border-slate-200/80 shadow-card flex flex-col justify-between group cursor-pointer hover:border-sky-400">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Client Accounts
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 shadow-xs group-hover:bg-sky-50 group-hover:text-sky-600 group-hover:border-sky-200 transition-colors">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-2xl font-extrabold text-slate-900 leading-none tracking-tight tabular-nums">
                        {data.clientsCount}
                      </h3>
                      <span className="text-[10px] font-bold text-sky-600 uppercase flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        View <ArrowRight className="w-2.5 h-2.5" />
                      </span>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Active Sites: <strong className="text-slate-800 font-semibold">{data.activeProjectsCount}</strong></span>
                      <span className="text-sky-600 font-semibold">Directory →</span>
                    </div>
                  </div>
                </div>
              </PerspectiveCard>
            </motion.div>

            {/* 4. ISOMETRIC STAGE & STATUS BREAKDOWN MATRICES */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* PIPELINE VALUATION BY STAGE WITH 3D DEPTH BARS */}
              <motion.div
                variants={itemVariants}
                className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
                          Stage & Pipeline Valuation
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Conversion track across active, committed, and closed projects
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-700 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg">
                      {formatINR(data.portfolioValue)} Total
                    </span>
                  </div>

                  <div className="space-y-4">
                    {data.stageStats.map((stg) => {
                      const maxVal = Math.max(...data.stageStats.map(s => s.value), 1);
                      const widthPercent = (stg.value / maxVal) * 100;
                      const shareOfTotal = data.portfolioValue > 0 ? (stg.value / data.portfolioValue) * 100 : 0;

                      return (
                        <div key={stg.label} className="group p-2 rounded-xl hover:bg-slate-50/80 transition-colors">
                          <div className="flex justify-between items-center text-xs mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${stg.color.split(" ")[0]} shadow-xs`} />
                              <span className="font-bold text-slate-800">{stg.label}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                ({stg.count} {stg.count === 1 ? 'project' : 'projects'})
                              </span>
                            </div>
                            <div className="text-right flex items-center gap-3">
                              <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                                {shareOfTotal.toFixed(1)}%
                              </span>
                              <span className="font-mono font-bold text-slate-900 tabular-nums text-xs">
                                {formatINR(stg.value)}
                              </span>
                            </div>
                          </div>

                          {/* 3D Elevated Pill Bar */}
                          <div className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60 p-0.5 shadow-inner">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.max(widthPercent, 2)}%` }}
                              transition={{ duration: 0.9, ease: "easeOut" }}
                              className={`h-full rounded-full bg-gradient-to-r ${stg.barGradient} shadow-xs`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-6 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>Filtered by: <strong className="text-slate-700 capitalize">{datasetFilter} projects</strong></span>
                  <span>Execution & Delivered volume: <strong className="text-slate-900">{formatINR(data.activeContractedValue)}</strong></span>
                </div>
              </motion.div>

              {/* SMART SIGNALS & TACTICAL RADAR (Replacing donut chart with actionable tags & insights) */}
              <motion.div
                variants={itemVariants}
                className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
                          Smart Signals & Action Radar
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Automated portfolio alerts & margin levers
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50/80 border border-indigo-100 px-2 py-0.5 rounded-full">
                      {filteredSignals.length} Active
                    </span>
                  </div>

                  {/* SMART FILTER TAGS */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    {[
                      { key: 'all', label: 'All Signals' },
                      { key: 'cash', label: 'Cash & Arrears' },
                      { key: 'gate', label: 'Design Gates' },
                      { key: 'capacity', label: 'Capacity & Yield' }
                    ].map((tagItem) => {
                      const isActive = signalCategory === tagItem.key;
                      return (
                        <button
                          key={tagItem.key}
                          type="button"
                          onClick={() => setSignalCategory(tagItem.key as any)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                            isActive
                              ? 'bg-slate-900 text-white shadow-xs'
                              : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/70'
                          }`}
                        >
                          {tagItem.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* SIGNALS LIST */}
                  <div className="space-y-3">
                    {filteredSignals.length === 0 ? (
                      <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                        <p className="text-xs font-semibold text-slate-700">No active alerts in this category</p>
                        <p className="text-[10px] text-slate-400">Portfolio health is fully operational.</p>
                      </div>
                    ) : (
                      filteredSignals.map((sig) => {
                        const isCrit = sig.severity === 'critical';
                        const isWarn = sig.severity === 'warning';
                        const isPos = sig.severity === 'positive';

                        const badgeColor = isCrit
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : isWarn
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : isPos
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200';

                        return (
                          <div
                            key={sig.id}
                            className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 hover:border-slate-300 hover:bg-slate-50 transition-all flex items-start justify-between gap-3 group"
                          >
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${badgeColor}`}>
                                  {sig.tag}
                                </span>
                                <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                  {sig.title}
                                </h4>
                              </div>
                              <p className="text-[11px] text-slate-500 leading-snug">
                                {sig.description}
                              </p>
                            </div>

                            <div className="text-right flex-shrink-0 flex flex-col items-end justify-between self-stretch">
                              <div>
                                <span className="text-xs font-mono font-bold text-slate-900 tabular-nums block">
                                  {sig.metric}
                                </span>
                                <span className="text-[9px] text-slate-400 font-medium">
                                  {sig.metricLabel}
                                </span>
                              </div>
                              {sig.tabTarget && onNavigate && (
                                <button
                                  type="button"
                                  onClick={() => onNavigate(sig.tabTarget!)}
                                  className="mt-2 inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                                >
                                  {sig.actionText || 'View'} <ArrowRight className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-5 flex justify-between items-center text-[10px] text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live studio telemetry active
                  </span>
                  <span className="font-semibold text-slate-700">{data.activeProjectsCount} active projects monitored</span>
                </div>
              </motion.div>
            </div>

            {/* 5. TYPOLOGY MIX & SPATIAL FOOTPRINT */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Configuration Mix Breakdown */}
              <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
                          Configuration & Typology Mix
                        </h3>
                        <p className="text-[11px] text-slate-400">Unit configurations across live portfolio</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {data.typologiesList.map((typ) => {
                      const maxVal = Math.max(...data.typologiesList.map(t => t.value), 1);
                      const barPercent = (typ.value / maxVal) * 100;
                      const avgSqft = typ.count > 0 ? Math.round(typ.sqft / typ.count) : 0;

                      return (
                        <div key={typ.name} className="p-3 bg-slate-50/60 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md text-[11px]">
                                {typ.name}
                              </span>
                              <span className="text-slate-500 font-medium">
                                {typ.count} {typ.count === 1 ? 'unit' : 'units'} · ~{avgSqft.toLocaleString('en-IN')} sqft avg
                              </span>
                            </div>
                            <span className="font-mono font-bold text-slate-900">
                              {formatINR(typ.value)}
                            </span>
                          </div>
                          <div className="h-2 w-full bg-slate-200/70 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${barPercent}%` }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                              className="h-full bg-indigo-600 rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4 text-[10px] text-slate-400 flex justify-between">
                  <span>Total Footprint Covered</span>
                  <span className="font-mono font-bold text-slate-700">{data.totalSqft.toLocaleString('en-IN')} sq ft</span>
                </div>
              </div>

              {/* Design Theme Trends */}
              <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                        <Compass className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
                          Design Theme & Style Preferences
                        </h3>
                        <p className="text-[11px] text-slate-400">Aesthetic styles demanded by clients</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {data.themesList.slice(0, 5).map((th, idx) => {
                      const maxCount = Math.max(...data.themesList.map(t => t.count), 1);
                      const barPercent = (th.count / maxCount) * 100;

                      return (
                        <div key={th.name} className="p-3 bg-slate-50/60 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-bold text-slate-400">#0{idx + 1}</span>
                              <span className="font-bold text-slate-800 truncate max-w-[200px]">{th.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                ({th.count} {th.count === 1 ? 'project' : 'projects'})
                              </span>
                            </div>
                            <span className="font-mono font-bold text-slate-800">
                              {formatINR(th.value)}
                            </span>
                          </div>
                          <div className="h-2 w-full bg-slate-200/70 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${barPercent}%` }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                              className="h-full bg-emerald-500 rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4 text-[10px] text-slate-400 flex justify-between">
                  <span>Leading Style</span>
                  <span className="font-bold text-slate-700">{data.themesList[0]?.name || 'Modern Minimalist'}</span>
                </div>
              </div>
            </motion.div>

            {/* 6. TOP CLIENTS & CONCENTRATION OVERVIEW */}
            <motion.div variants={itemVariants} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
                      Key Client Accounts & Contract Concentration
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Ranked by booked & delivered contractual volume
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg">
                    {data.clientsCount} Total Accounts
                  </span>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('clients')}
                      className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer"
                    >
                      All Clients <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.topClients.map((client, idx) => {
                  return (
                    <div
                      key={client.name}
                      onClick={() => onNavigate && onNavigate('clients')}
                      className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-sky-300 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center font-mono text-[10px] font-bold text-slate-500">
                              {idx + 1}
                            </span>
                            <div>
                              <h4 className="text-sm font-bold text-slate-800 truncate max-w-[180px] group-hover:text-sky-600 transition-colors">
                                {client.name}
                              </h4>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[180px]">
                                {client.email || client.phone || 'Account Profile'}
                              </span>
                            </div>
                          </div>

                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                            client.isActual
                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            <Pin className="w-2.5 h-2.5" />
                            {client.isActual ? 'Actual' : 'Demo'}
                          </span>
                        </div>

                        <div className="space-y-1 my-3">
                          <div className="text-[11px] text-slate-500 flex items-center justify-between">
                            <span>Projects:</span>
                            <span className="font-semibold text-slate-800">{client.projectsCount} total ({client.activeCount} active)</span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center justify-between">
                            <span>Total Area:</span>
                            <span className="font-semibold text-slate-800">{client.totalSqft.toLocaleString('en-IN')} sqft</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Contract Value
                        </span>
                        <span className="text-sm font-mono font-bold text-slate-900">
                          {formatINR(client.totalValue)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )
      ) : (
        /* HISTORICAL STUDIO MEMORY & BENCHMARKS */
        <div className="space-y-8">
          {/* KPI METRICS (HISTORICAL) */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Blended Margin */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                  Historical Margin (Blended)
                </span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50 border border-emerald-100 text-emerald-600">
                  <Percent className="w-4 h-4" />
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-light text-slate-900 leading-none tracking-tight tabular-nums">
                  {memoryData.blended?.marginPct.toFixed(1)}%
                </h3>
                <p className="text-[10px] text-slate-500 mt-2">
                  On <span className="font-bold text-slate-700">{formatINR(memoryData.blended?.revenue || 0)}</span> revenue · {memoryData.blended?.n} projects
                </p>
              </div>
            </div>

            {/* Subcontractor Share */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                  Subcontractor Share
                </span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-sky-50 border border-sky-100 text-[#0066CC]">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-light text-slate-900 leading-none tracking-tight tabular-nums">
                  {memoryData.mix.subcontractPct.toFixed(1)}%
                </h3>
                <p className="text-[10px] text-slate-500 mt-2">
                  Carries <span className="font-bold text-slate-700">{formatINR(memoryData.mix.subcontract)}</span> of total spend
                </p>
              </div>
            </div>

            {/* Paperwork Drag */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                  Administrative Drag
                </span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 border border-amber-100 text-amber-600">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-light text-slate-900 leading-none tracking-tight tabular-nums">
                  {memoryData.adminProfile?.smallBills} bills
                </h3>
                <p className="text-[10px] text-slate-500 mt-2">
                  Are under <span className="font-bold text-slate-700">₹10,000</span> (high admin drag)
                </p>
              </div>
            </div>

            {/* Cash Outflow Volatility */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                  Outflow Volatility
                </span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-rose-50 border border-rose-100 text-rose-600">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-light text-slate-900 leading-none tracking-tight tabular-nums">
                  {memoryData.monthlySpend?.peakMultiple.toFixed(1)}×
                </h3>
                <p className="text-[10px] text-slate-500 mt-2">
                  Heaviest month spend vs typical median month
                </p>
              </div>
            </div>
          </motion.div>

          {/* TWO-COLUMN BENCHMARKS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* DIRECT FINDINGS BRIEFING PANEL */}
            <motion.div variants={itemVariants} className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Brain className="w-4.5 h-4.5 text-slate-900" />
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Director Smart Briefing</h3>
                </div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider tabular-nums bg-slate-50 px-2 py-0.5 rounded border">
                  Source: {SEED_SOURCE}
                </span>
              </div>

              <div className="space-y-4 overflow-y-auto max-h-[550px] pr-1">
                {memoryData.findingsList.map((finding) => {
                  const isOpportunity = finding.tone === 'opportunity';
                  const isRisk = finding.tone === 'risk';
                  return (
                    <div
                      key={finding.id}
                      className={`p-4 rounded-xl border flex flex-col gap-3 transition-all ${
                        isOpportunity
                          ? 'bg-emerald-50/40 border-emerald-100'
                          : isRisk
                          ? 'bg-rose-50/30 border-rose-100'
                          : 'bg-slate-50/50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2">
                          {isOpportunity ? (
                            <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          ) : isRisk ? (
                            <ShieldAlert className="w-4.5 h-4.5 text-rose-600 flex-shrink-0" />
                          ) : (
                            <Lightbulb className="w-4 h-4 text-slate-900/60 flex-shrink-0" />
                          )}
                          <h4 className="font-semibold text-slate-800 text-sm leading-snug">
                            {finding.headline}
                          </h4>
                        </div>
                        {finding.valueAtStake && (
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded leading-none flex-shrink-0 ${
                            isOpportunity ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {formatINR(finding.valueAtStake)} stake
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed pl-6">
                        {finding.detail}
                      </p>

                      {finding.action && (
                        <div className="bg-white/80 p-2.5 rounded-lg border border-slate-100/80 text-xs ml-6 flex items-start gap-2 text-slate-700">
                          <span className="font-bold text-slate-900 uppercase text-[9px] tracking-wider mt-0.5">Action:</span>
                          <span className="flex-1 leading-normal font-medium">{finding.action}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pl-6 mt-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        <span>Evidence:</span>
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 normal-case font-mono">{finding.evidence}</span>
                        <span className="text-slate-300">|</span>
                        <span>Confidence:</span>
                        <span className={`px-1.5 py-0.5 rounded leading-none ${
                          finding.confidence === 'usable' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>{finding.confidence}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* HISTORICAL PORTFOLIO LEDGER LIST */}
            <motion.div variants={itemVariants} className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4.5 h-4.5 text-slate-900" />
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Historical Projects Ledger</h3>
                </div>
                <span className="text-xs text-slate-400 font-medium">
                  7 completed Zoho Books reconciliations
                </span>
              </div>

              {/* Table ledger */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5">Project</th>
                      <th className="py-2.5 text-right">Margin %</th>
                      <th className="py-2.5 text-right">Total Cost</th>
                      <th className="py-2.5">Top Vendor (Share %)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-600 font-medium">
                    {memoryData.conc.map((item) => (
                      <tr key={item.projectId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 font-semibold text-slate-800 truncate max-w-[150px]">
                          {item.projectName.split(' - ')[0]}
                        </td>
                        <td className={`py-3 text-right font-mono font-bold ${
                          item.marginPct && item.marginPct >= 35
                            ? 'text-emerald-600'
                            : item.marginPct && item.marginPct < 25
                            ? 'text-rose-600'
                            : 'text-slate-900'
                        }`}>
                          {item.marginPct ? `${item.marginPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-3 text-right font-mono text-slate-700">
                          {formatINR(item.cost)}
                        </td>
                        <td className="py-3 pl-4 truncate max-w-[150px] text-slate-500">
                          {item.topVendor} <span className="font-mono text-slate-400">({item.topSharePct.toFixed(0)}%)</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Outsourcing negative correlation warning card */}
              <div className="p-4 bg-amber-50/30 rounded-xl border border-amber-100 mt-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">Concentration & Subcontracting Impact</h4>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    Statistical analysis of the ledger reveals an extremely high subcontractor penalty of <span className="font-bold text-slate-900">-10.4%</span> points. 
                    Leakage is concentrated in projects where single vendors held more than <span className="font-bold">55%</span> share of execution cost.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* VENDORS SPEND RECONCILIATION */}
          <motion.div variants={itemVariants} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-slate-900" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Historical Vendor Spend & Margin Correlation</h3>
              </div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 border rounded uppercase">
                {memoryData.vendors.length} Total Vendors on File
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {memoryData.vendors.slice(0, 6).map((v) => (
                <div key={v.vendorName} className="p-4 border border-slate-100 rounded-xl bg-slate-50/20 hover:border-slate-200 hover:shadow-sm transition-all flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs truncate max-w-[180px]">{v.vendorName}</h4>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1 block">
                        {COST_TYPE_LABEL[v.costType] || v.costType}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-700 tabular-nums">
                      {formatINR(v.total)}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100/80 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <span>Share of Spend: <span className="font-mono text-slate-700">{v.sharePct.toFixed(1)}%</span></span>
                    <span>Reach: <span className="font-mono text-slate-700">{v.projects} projects</span></span>
                  </div>

                  <div className="mt-2 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <span>Avg. Project Margin:</span>
                    <span className={`font-mono text-xs ${v.weightedMarginPct && v.weightedMarginPct >= 31 ? 'text-emerald-600' : 'text-slate-700'}`}>
                      {v.weightedMarginPct ? `${v.weightedMarginPct.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

