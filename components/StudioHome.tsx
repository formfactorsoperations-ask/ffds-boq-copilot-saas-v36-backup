import React, { useMemo } from "react";
import { FullProjectData } from "../types";
import { formatINR, timeAgo } from "../lib/utils";
import WeekAhead from "./home/WeekAhead";
import { useStudioHomeData } from "./home/useStudioHomeData";
import HubMarquee from "./home/HubMarquee";

/* Supplied by the studio. Hotlinked from the reference CDN for now: swap this
   one line for your own footage when it is shot. */
const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260505_101331_74f9b798-3f00-4e86-8a01-377aa16ffeaa.mp4";
import PortfolioOrbit from "./home/PortfolioOrbit";
import { CardContainer, CardBody, CardItem } from "./ui/3d-card";
import ClockCalendar from "./home/ClockCalendar";
import WavingGreeting from "./home/WavingGreeting";
import AnimatedNumber from "./ui/AnimatedNumber";
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
  Boxes, ChevronDown } from "lucide-react";

interface StudioHomeProps {
  projects: FullProjectData[];
  onOpenProject: (project: FullProjectData, targetTab?: string) => void;
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

  // Compute all data points in a single useMemo
  const data = useStudioHomeData(projects, role);

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

  /* Twenty-six items in one undifferentiated run is why this read as
     "dispersed": nothing told you where the things that need you end and the
     things that can wait begin. Three named groups do that in one glance. */
  const focusGroups = useMemo(() => {
    const of = (p: string) => filteredWorklist.filter((w) => w.action.priority === p);
    return [
      { key: "blocker",   label: "Blocked",            items: of("blocker") },
      { key: "due",       label: "Next up",            items: of("due") },
      { key: "suggested", label: "When there is time", items: of("suggested") },
    ].filter((g) => g.items.length > 0);
  }, [filteredWorklist]);

  /* The long tail is collapsed by default so the top of the list stays the
     part you act on. */
  /* Action routes carry deep-link hints like "payment-calc?focus=e1", but
     activeTab is matched as an exact string, so the query made every one of
     them render a blank screen. The hint is not consumed anywhere yet; strip
     it and navigate to the tab itself. */
  const tabFor = (route?: string) => (route || "dashboard").split("?")[0];

  /* Sections open and close. "Blocked" and "Next up" start open because they
     are the reason to look at this page; the long optional tail starts closed
     so it cannot bury them. */
  /* "Needs Attention" counts exactly the items the Attention tab shows, but
     the tile went nowhere. Clicking it now sets that filter and scrolls to the
     list -- the number and the thing it describes are finally connected. */
  const greetingWord = React.useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }, []);

  const focusRef = React.useRef<HTMLDivElement | null>(null);
  const focusOnAttention = () => {
    setFocusFilter("attention");
    requestAnimationFrame(() =>
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  /* The same action repeated across projects was most of the list: 26 rows
     carried only 8 distinct actions, and "Send Terms Docket" alone accounted
     for 17 of them. Identical actions now collapse into one row that opens to
     show the projects, so the list reads as "what to do", not "how many times
     the same thing is true". */
  const [openRollups, setOpenRollups] = React.useState<Record<string, boolean>>({});
  const toggleRollup = (k: string) =>
    setOpenRollups((prev) => ({ ...prev, [k]: !prev[k] }));

  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({
    blocker: true, due: true, suggested: false,
  });
  const toggleGroup = (k: string) =>
    setOpenGroups((prev) => ({ ...prev, [k]: !prev[k] }));

  // Switching tabs resets the sections rather than inheriting the last view.
  React.useEffect(() => {
    setOpenGroups({ blocker: true, due: true, suggested: false });
  }, [focusFilter]);

  const attentionCount = useMemo(() => {
    return data.worklist.filter(
      (w) => w.action.priority === "blocker" || w.action.priority === "due"
    ).length;
  }, [data.worklist]);

  const suggestedCount = useMemo(() => {
    return data.worklist.filter((w) => w.action.priority === "suggested").length;
  }, [data.worklist]);

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
      link: "reports",
      value: data.openValue,
      icon: TrendingUp,
      color: "text-emerald-700 bg-emerald-50 border-emerald-200/60",
      isCurrency: true,
    },
    {
      id: "winrate",
      label: "Win Rate",
      link: "reports",
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
      {/* 1. HERO CARD — one rounded plate carrying the whole opening:
             footage behind, the studio's own line on top, and the live
             readouts floating at the bottom instead of a nav. The Quick Hub
             rides the marquee underneath. */}
      <motion.div variants={itemVariants} className="w-full">
        <div className="relative w-full max-w-[1400px] mx-auto rounded-[48px] bg-white border border-slate-200/50 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.06)] overflow-hidden h-[460px] md:h-[540px] lg:h-[600px] flex flex-col">

          {/* Footage layer. Plain autoplay loop, as the hero-card spec calls
              for -- no capture pass, no crossOrigin, so nothing depends on the
              CDN sending CORS headers. */}
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none">
            {/* Painted behind the video, always. A <video> that fails to load
                renders transparent, so this is what shows if the CDN is
                unreachable -- the plate is never an empty black box. */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#F7F8FA] via-white to-[#EFEDE7]" />
            <div className="aurora-a absolute -top-40 right-[-8rem] w-[42rem] h-[42rem] rounded-full blur-3xl"
                 style={{ background: "radial-gradient(circle, rgba(0,102,204,.20), transparent 70%)" }} />
            <div className="aurora-b absolute -bottom-56 right-1/4 w-[38rem] h-[38rem] rounded-full blur-3xl"
                 style={{ background: "radial-gradient(circle, rgba(181,148,91,.20), transparent 68%)" }} />
            <video
              src={HERO_VIDEO}
              autoPlay
              loop
              muted
              playsInline
              className="relative w-full h-full object-cover scale-105 transition-transform duration-1000"
            />
          </div>

          {/* Scrim only where the type sits. The reference keeps the right side
              of the frame clear so the subject reads; washing the whole plate
              would have hidden the footage entirely. */}
          <div className="absolute inset-0 z-[1] pointer-events-none bg-gradient-to-r from-white/90 via-white/45 to-transparent" />

          {/* Copy */}
          <div className="relative z-20 flex-1 px-8 md:px-16 pt-12 md:pt-16 flex flex-col items-start">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-2xl"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0a1b33]/45">
                {greetingWord}, {userName}
              </p>

              <h1 className="mt-3 text-[42px] md:text-[56px] font-bold leading-[1.08] tracking-tight text-[#0a1b33]">
                {data.attentionCount > 0 ? (
                  <>
                    {data.attentionCount} thing{data.attentionCount === 1 ? "" : "s"} need you
                    <br />
                    before anything else.
                  </>
                ) : (
                  <>
                    Nothing is waiting
                    <br />
                    on you today.
                  </>
                )}
              </h1>

              <p className="mt-5 max-w-xl text-[14px] md:text-[15px] leading-relaxed text-[#64748b]">
                {data.activeCount} live {data.activeCount === 1 ? "project" : "projects"} and{" "}
                {data.pipelineCount} in the pipeline, worth {formatINR(data.openValue)} open.
                Price the work, run the site, and show every client where their money went.
              </p>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={focusOnAttention}
                className="mt-7 md:mt-9 inline-flex items-center gap-2 bg-[#0066CC] hover:bg-[#0055B3] text-white rounded-full px-6 py-3 text-[13px] font-semibold cursor-pointer transition-colors shadow-[0_8px_24px_-6px_rgba(0,102,204,0.5)]"
              >
                {data.attentionCount > 0 ? "Show me what needs me" : "Review today's focus"}
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </motion.div>
          </div>

          {/* Floating readouts — the numbers, not a second navigation. */}
          <div className="absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] md:w-auto">
            <motion.nav
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-1 bg-white/90 backdrop-blur-2xl px-1.5 py-1.5 rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.08)] border border-slate-200/40 overflow-x-auto"
            >
              <span className="w-9 h-9 shrink-0 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center text-[#0a1b33] text-sm">
                &#10022;
              </span>

              {kpiConfigs.map((kpi) => {
                const urgent = kpi.id === "attention" && Number(kpi.value) > 0;
                const clickable = !!kpi.link || kpi.id === "attention";
                return (
                  <button
                    key={kpi.id}
                    onClick={() => {
                      if (kpi.id === "attention") return focusOnAttention();
                      if (kpi.link) onNavigate(kpi.link);
                    }}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all whitespace-nowrap ${
                      urgent
                        ? "bg-rose-50 text-rose-700 border border-rose-200/70"
                        : "text-slate-500 hover:text-[#0a1b33] hover:bg-slate-50"
                    } ${clickable ? "cursor-pointer" : "cursor-default"}`}
                    title={kpi.label}
                  >
                    <span className="tabular-nums">
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
                    </span>
                    <span className={`ml-1.5 font-medium ${urgent ? "text-rose-600/80" : "text-slate-400"}`}>
                      {kpi.label}
                    </span>
                  </button>
                );
              })}
            </motion.nav>
          </div>
        </div>

        {/* Quick Hub, on the rail */}
        <div className="mt-6 md:mt-8">
          <HubMarquee onNavigate={onNavigate} onCreateNew={onCreateNew} />
        </div>
      </motion.div>

      {/* 2. LIVE CLOCK & MONTH CALENDAR — kept. It carries the studio's
             rhythm, and the calendar already marks the days that matter. */}
      <motion.div variants={itemVariants} className="w-full">
        <ClockCalendar projects={projects} />
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
        <div ref={focusRef} className="lg:col-span-3 space-y-4 scroll-mt-24">
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
              focusGroups.map((group) => {
                const tone: Record<string, { dot: string; stripe: string; icon: React.ReactNode; chip: string }> = {
                  blocker:   { dot: "bg-rose-500",  stripe: "bg-rose-500",  chip: "text-rose-700",
                               icon: <AlertCircle className="w-4 h-4 text-rose-600" /> },
                  due:       { dot: "bg-amber-500", stripe: "bg-amber-500", chip: "text-amber-700",
                               icon: <Clock className="w-4 h-4 text-amber-600" /> },
                  suggested: { dot: "bg-sky-400",   stripe: "bg-sky-300",   chip: "text-sky-700",
                               icon: <Sparkles className="w-4 h-4 text-sky-500" /> },
                };
                const cfg = tone[group.key] || tone.suggested;
                const isOpen = openGroups[group.key] !== false;

                return (
                  <div key={group.key} className="space-y-2">
                    {/* Group header doubles as the accordion control. */}
                    <button
                      onClick={() => toggleGroup(group.key)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center gap-2 pt-1 pb-0.5 group/hdr cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 group-hover/hdr:text-slate-700 transition-colors">
                        {group.label}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                        {group.items.length}
                      </span>
                      <span className="flex-1 h-px bg-slate-100" />
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
                      />
                    </button>

                    {isOpen && (() => {
                      // Preserve order of first appearance while bucketing.
                      const buckets: { title: string; items: typeof group.items }[] = [];
                      const index: Record<string, number> = {};
                      group.items.forEach((it) => {
                        const key = it.action.title;
                        if (index[key] === undefined) {
                          index[key] = buckets.length;
                          buckets.push({ title: key, items: [] });
                        }
                        buckets[index[key]].items.push(it);
                      });

                      return buckets.flatMap((bucket) => {
                        if (bucket.items.length === 1) return bucket.items;
                        const rollKey = `${group.key}:${bucket.title}`;
                        const rollOpen = !!openRollups[rollKey];
                        const head = (
                          <button
                            key={rollKey}
                            onClick={() => toggleRollup(rollKey)}
                            aria-expanded={rollOpen}
                            className="w-full group relative flex items-center gap-3 bg-white border border-slate-200/80 rounded-xl pl-4 pr-3 py-2.5 cursor-pointer transition-colors hover:border-sky-300 hover:bg-sky-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 overflow-hidden text-left"
                          >
                            <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${cfg.stripe}`} />
                            <span className="shrink-0">{cfg.icon}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight">
                                {bucket.title}
                              </p>
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                {bucket.items.length} projects
                              </p>
                            </div>
                            <ChevronDown
                              className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${rollOpen ? "" : "-rotate-90"}`}
                            />
                          </button>
                        );
                        return rollOpen ? [head, ...bucket.items] : [head];
                      });
                    })().map((entry: any) => {
                      if (React.isValidElement(entry)) return entry;
                      const { project, action } = entry;
                      const client = project.context?.clientName;
                      return (
                        <div
                          key={`${project.id}-${action.id}`}
                          onClick={() => onOpenProject(project, tabFor(action.route))}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onOpenProject(project, tabFor(action.route));
                            }
                          }}
                          /* Fixed padding and type sizes: every row is the same
                             height whatever its state, which is what stops the
                             list looking scattered. */
                          className="group relative flex items-center gap-3 bg-white border border-slate-200/80 rounded-xl pl-4 pr-3 py-2.5 cursor-pointer transition-colors hover:border-sky-300 hover:bg-sky-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 overflow-hidden"
                        >
                          <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${cfg.stripe}`} />
                          <span className="shrink-0">{cfg.icon}</span>

                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight">
                              {action.title}
                            </p>
                            {/* The client, because three rows can all say
                                "New Project" and only the client tells them apart. */}
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {project.context?.name || "Unnamed project"}
                              {client ? <span className="text-slate-300"> · {client}</span> : null}
                            </p>
                          </div>

                          {/* The action itself, not hidden behind a chevron. */}
                          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-[#0066CC] group-hover:text-[#0055B3] whitespace-nowrap">
                            {action.ctaLabel || "Open"}
                            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      );
                    })}

                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (SPANS 2): Jump back in (Recents) & Shortcuts */}
        <div className="lg:col-span-2 space-y-6">
          
          <WeekAhead projects={projects} onOpenProject={onOpenProject} />

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


        </div>

      </motion.div>

    </motion.div>
  );
}

