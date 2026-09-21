import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { FullProjectData } from "../types";
import { formatCompactINR, timeAgo } from "../lib/utils";
import { getSingleProjectValue } from "../lib/financialsUtils";
import { useStudioHomeData, tabFor, greetingWord } from "./home/useStudioHomeData";
import ClockCalendar from "./home/ClockCalendar";
import { useTilt } from "./home/useTilt";
import StudioFooter from "./home/StudioFooter";
import {
  ArrowRight, CheckCircle2, ChevronDown, Plus, Sparkles,
  LayoutGrid, Users, BarChart3, Store, FileSignature, Boxes,
} from "lucide-react";

/**
 * STUDIO HOME.
 *
 * The studio's home page. Chosen over an earlier hero-card design after both
 * ran side by side behind a switch; that switch and its storage key are gone,
 * and App.tsx renders this directly.
 *
 * Figures come from useStudioHomeData rather than being derived here, so the
 * page and anything else reading the portfolio cannot disagree about how many
 * projects are live.
 *
 * The dial is the studio's hub: the places you go, arranged by how often you
 * go there. Starting a project sits at the bullseye because it is the one
 * thing done from a standing start; the rooms you are in daily ride the inner
 * ring; the things set up once and referred to later ride the outer one. The
 * rings are that hierarchy made visible, not decoration.
 *
 * There is deliberately no quick-access marquee under this dial. The marquee
 * carries these same destinations, and showing them twice on one screen is the
 * duplication this page exists to avoid.
 */

const STAGE_LABEL: Record<string, string> = {
  lead: "Lead",
  draft: "Draft",
  proposal_sent: "Proposal sent",
  negotiation: "Negotiation",
  won: "Won",
  execution: "On site",
  work_paused: "Paused",
  completed: "Delivered",
};

/** "Unique Vistas" -> "UV". Falls back to one letter for a single word. */
const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "—";

const BRAND = "#3D52A0";
const INK = "#0A1B33";

interface Hub {
  key: string;
  label: string;
  icon: React.ElementType;
  accent: string;
  tab: string;
  /** Live figure, shown only where a true one is to hand. */
  count?: number;
  ring: 0 | 1;
}

/** Ring geometry. Inner = daily, outer = set up once and referred to later. */
const RINGS = [
  { d: 384, dur: "52s", dir: "lpo-orbit-ccw", anti: "lpo-upright-cw", offset: 0 },
  { d: 620, dur: "72s", dir: "lpo-orbit-cw", anti: "lpo-upright-ccw", offset: 36 },
] as const;

interface Props {
  projects: FullProjectData[];
  onOpenProject: (project: FullProjectData, targetTab?: string) => void;
  onCreateNew: () => void;
  onNavigate: (tab: string) => void;
  role: string;
  userName?: string;
}

export default function StudioHomeOrbit({
  projects, onOpenProject, onCreateNew, onNavigate, role, userName = "there",
}: Props) {
  const data = useStudioHomeData(projects, role);

  /* Counts appear only for Projects and Clients, the two this page already
     derives honestly. The rate bank and template library live in Firestore and
     are not passed to this component, so those tiles carry no number rather
     than a guessed one. */
  const hubs: Hub[] = useMemo(() => [
    {
      key: "projects", label: "Projects", icon: LayoutGrid, accent: "#1D4ED8",
      tab: "projects", ring: 0,
      count: data.activeCount + data.pipelineCount + data.deliveredCount,
    },
    {
      key: "clients", label: "Clients", icon: Users, accent: "#0E7C5A",
      tab: "clients", ring: 0, count: data.clientsCount,
    },
    { key: "reports", label: "Reports", icon: BarChart3, accent: "#B5945B", tab: "reports", ring: 0 },
    { key: "ratebank", label: "Rate bank", icon: Store, accent: "#C77700", tab: "admin-templates-bank", ring: 1 },
    { key: "templates", label: "Templates", icon: FileSignature, accent: "#6D28D9", tab: "admin-templates-bank", ring: 1 },
    { key: "setup", label: "Studio setup", icon: Boxes, accent: "#0F766E", tab: "studio-settings", ring: 1 },
  ], [data.activeCount, data.pipelineCount, data.deliveredCount, data.clientsCount]);

  /* Identical actions across projects were most of the old list -- one action
     could account for seventeen rows. Collapsing them says "what to do"
     instead of "how many times the same thing is true". */
  const rollups = useMemo(() => {
    const map = new Map<string, { label: string; priority: string; route?: string; items: typeof data.worklist }>();
    for (const w of data.worklist) {
      const key = w.action.label || w.action.title || "Action";
      if (!map.has(key)) {
        map.set(key, { label: key, priority: w.action.priority, route: w.action.route, items: [] });
      }
      map.get(key)!.items.push(w);
    }
    return [...map.values()].sort(
      (a, b) =>
        ({ blocker: 0, due: 1, suggested: 2 } as any)[a.priority] -
        ({ blocker: 0, due: 1, suggested: 2 } as any)[b.priority]
    );
  }, [data.worklist]);

  const brief = useMemo(() => {
    const blocking = data.worklist.filter((w) => w.action.priority === "blocker");
    const seen = new Set<string>();
    let value = 0;
    for (const w of blocking) {
      if (seen.has(w.project.id)) continue;
      seen.add(w.project.id);
      value += getSingleProjectValue(w.project) || 0;
    }
    return { count: blocking.length, projects: seen.size, value };
  }, [data.worklist]);

  const attentionTilt = useTilt(3);
  const recentTilt = useTilt(5);

  const worklistRef = React.useRef<HTMLDivElement | null>(null);
  const reviewPriorities = () =>
    worklistRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = React.useState(false);

  const allOpen = (list: { label: string }[]) => list.every((r) => open[r.label]);
  const toggleAll = (list: { label: string }[]) => {
    const closing = allOpen(list);
    setOpen(Object.fromEntries(list.map((r) => [r.label, !closing])));
  };

  const later = rollups.filter((r) => r.priority === "suggested");
  const visible = showAll ? rollups : rollups.filter((r) => r.priority !== "suggested");

  const tone = (p: string) =>
    p === "blocker"
      ? { fg: "#B4436A", bg: "#FDF2F6", bd: "#B4436A33", word: "Blocked" }
      : p === "due"
      ? { fg: "#C77700", bg: "#FDF7EC", bd: "#C7770033", word: "Next up" }
      : { fg: "#64748B", bg: "#F6F8FB", bd: "#64748B26", word: "When there is time" };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full px-3 lg:px-6 pb-16 space-y-6 font-['Plus_Jakarta_Sans']"
    >
      <div className="relative w-full max-w-[1400px] mx-auto rounded-[40px] bg-white border border-slate-200/60 shadow-[0_40px_100px_-24px_rgba(0,0,0,0.07)] overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-[#F7FAFE] via-white to-[#FAF7F1]" />
          <div
            className="aurora-a absolute -top-48 right-[-6rem] w-[38rem] h-[38rem] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(61, 82, 160,.14), transparent 70%)" }}
          />
        </div>

        <div className="relative flex flex-col xl:flex-row items-center gap-4 px-6 md:px-12 py-10">
          {/* Left — the ask */}
          <div className="flex-[0_1_520px] w-full">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0a1b33]/45">
              {greetingWord()}, {userName}
            </p>

            <h1
              className="mt-3 text-[38px] md:text-[50px] font-bold leading-[1.06] tracking-tight"
              style={{ color: INK }}
            >
              Your studio, ready
              <br />
              for <span style={{ color: BRAND }}>what&rsquo;s next.</span>
            </h1>

            {/* Every figure here is live: none of it is written down. */}
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[#64748b]">
              <strong className="font-semibold" style={{ color: INK }}>
                {data.activeCount} project{data.activeCount === 1 ? "" : "s"}{" "}
                {data.activeCount === 1 ? "is" : "are"} active
              </strong>
              , {data.pipelineCount}{" "}
              {data.pipelineCount === 1 ? "opportunity is" : "opportunities are"} in the pipeline
              {data.attentionCount > 0 ? (
                <>
                  , and{" "}
                  <strong className="font-semibold" style={{ color: INK }}>
                    {data.attentionCount} item{data.attentionCount === 1 ? "" : "s"}
                  </strong>{" "}
                  need{data.attentionCount === 1 ? "s" : ""} your attention today.
                </>
              ) : (
                <>, and nothing needs your attention today.</>
              )}
            </p>

            <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-slate-400">
              Choose a workspace from the launchpad, or review today&rsquo;s priorities.
            </p>

            <div className="mt-7">
              <div className="lpo-border-wrap inline-block">
                <button
                  onClick={reviewPriorities}
                  className="relative z-10 inline-flex items-center gap-2 rounded-[50px] px-6 py-3 text-[14px] font-semibold text-white transition-colors"
                  style={{ background: BRAND }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#334486")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = BRAND)}
                >
                  Review priorities
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Portfolio shape. Clients is not repeated here -- it already
                carries its own count on the dial. */}
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { n: data.activeCount, label: "active" },
                { n: data.pipelineCount, label: "pipeline" },
                { n: data.deliveredCount, label: "delivered" },
              ].map((s) => (
                <button
                  key={s.label}
                  onClick={() => onNavigate("projects")}
                  className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-[13px] hover:border-slate-300 transition-colors"
                >
                  <span className="font-semibold tabular-nums" style={{ color: INK }}>{s.n}</span>
                  <span className="ml-1.5 text-slate-500">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right — the hub dial */}
          <div className="flex-1 min-w-0 flex items-center justify-center">
            <div className="lpo-stage-box lpo-stage-box--home">
              <div className="lpo-stage">
                {RINGS.map((r, ri) => {
                  const onRing = hubs.filter((h) => h.ring === ri);
                  return (
                    <div
                      key={ri}
                      className="lpo-orbit"
                      style={{
                        width: r.d,
                        height: r.d,
                        ["--lpo-dur" as any]: r.dur,
                        ["--lpo-dir" as any]: r.dir,
                      }}
                    >
                      {onRing.map((h, i) => {
                        const angle = (360 / Math.max(onRing.length, 1)) * i + r.offset;
                        const Icon = h.icon;
                        return (
                          <div
                            key={h.key}
                            className="absolute top-1/2 left-1/2"
                            style={{
                              transform: `translate(-50%, -50%) rotate(${angle}deg) translate(${r.d / 2}px) rotate(${-angle}deg)`,
                            }}
                          >
                            {/* Cancels the ring's spin so the tile stays upright. */}
                            <div
                              className="lpo-upright"
                              style={{ ["--lpo-dur" as any]: r.dur, ["--lpo-anti" as any]: r.anti }}
                            >
                              <button
                                onClick={() => onNavigate(h.tab)}
                                title={h.label}
                                className="lpo-anim group flex flex-col items-center justify-center gap-2 w-[116px] h-[100px] rounded-[26px] bg-white/95 backdrop-blur-sm hover:-translate-y-1 transition-transform cursor-pointer"
                                style={{
                                  border: `1px solid ${h.accent}2E`,
                                  boxShadow: `0 14px 32px -14px ${h.accent}99`,
                                  animationName: "lpo-chip-in",
                                  animationDuration: "0.6s",
                                  animationDelay: `${0.35 + (ri * 3 + i) * 0.09}s`,
                                }}
                              >
                                <span
                                  className="w-10 h-10 rounded-2xl flex items-center justify-center"
                                  style={{
                                    background: `linear-gradient(140deg, ${h.accent}, ${h.accent}B3)`,
                                    boxShadow: `0 6px 16px -5px ${h.accent}80`,
                                  }}
                                >
                                  <Icon className="w-5 h-5 text-white" strokeWidth={1.9} />
                                </span>
                                <span className="flex items-baseline gap-1.5">
                                  <span className="text-[12.5px] font-semibold" style={{ color: INK }}>
                                    {h.label}
                                  </span>
                                  {h.count !== undefined && (
                                    <span
                                      className="text-[11px] font-bold tabular-nums"
                                      style={{ color: h.accent }}
                                    >
                                      {h.count}
                                    </span>
                                  )}
                                </span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Bullseye. Sits outside the rings rather than on the inner
                    one, so it needs no counter-rotation and never wobbles. */}
                <button
                  onClick={onCreateNew}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[168px] h-[168px] rounded-full flex flex-col items-center justify-center gap-1.5 text-white transition-transform hover:scale-[1.04] cursor-pointer"
                  style={{
                    background: `linear-gradient(150deg, ${BRAND}, #334486)`,
                    boxShadow: `0 26px 60px -18px ${BRAND}, 0 0 0 10px rgba(61, 82, 160,0.07)`,
                  }}
                >
                  <Plus className="w-8 h-8" strokeWidth={2.2} />
                  <span className="text-[15px] font-semibold">New project</span>
                  <span className="text-[11px] text-white/70">Start from scratch</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clock, calendar and pulse as one strip directly under the hero --
          today's context before today's work. Same component design A uses, so
          the two pages cannot drift apart. */}
      <div className="max-w-[1400px] mx-auto w-full">
        <ClockCalendar projects={projects} />
      </div>

      {/* ── What needs you, and what you were last in ─────────────────── */}
      <div ref={worklistRef} className="max-w-[1400px] mx-auto w-full space-y-5 scroll-mt-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 cc-scene">
        <div
          ref={attentionTilt.ref}
          onMouseMove={attentionTilt.onMouseMove}
          onMouseLeave={attentionTilt.onMouseLeave}
          className="cc-panel bg-white rounded-3xl border border-slate-200/70 p-6"
        >
          <div className="flex items-baseline justify-between">
            <h2 className="text-[19px] font-bold tracking-tight" style={{ color: INK }}>
              Needs your attention
            </h2>
            <span className="text-[12px] text-slate-400">
              {rollups.length} action{rollups.length === 1 ? "" : "s"} across your active portfolio
            </span>
          </div>

          {brief.count > 0 && (
            <div className="cc-z1 mt-4 flex items-center gap-3.5 rounded-2xl border border-[#3D52A0]/15 bg-[#F2F7FD] px-4 py-3.5">
              <span
                className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
                style={{ background: `linear-gradient(140deg, ${BRAND}, #334486)` }}
              >
                <Sparkles className="w-4 h-4 text-white" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold" style={{ color: INK }}>
                  Studio Copilot Brief
                </p>
                <p className="text-[13px] text-[#64748b]">
                  {brief.count} item{brief.count === 1 ? " is" : "s are"} blocking progress today.
                  {brief.value > 0 && (
                    <>
                      {" "}
                      {brief.projects === 1 ? "It is" : "Together, they are"} holding up{" "}
                      <strong className="font-semibold" style={{ color: INK }}>
                        {formatCompactINR(brief.value)}
                      </strong>{" "}
                      of active work.
                    </>
                  )}
                </p>
              </div>
              <button
                onClick={() => toggleAll(visible)}
                className="shrink-0 text-[13px] font-semibold transition-colors"
                style={{ color: BRAND }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#334486")}
                onMouseLeave={(e) => (e.currentTarget.style.color = BRAND)}
              >
                {allOpen(visible) ? "Collapse all" : "Expand all"}
              </button>
            </div>
          )}

          {rollups.length === 0 ? (
            <div className="py-14 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
              <p className="mt-3 text-[14px] font-semibold" style={{ color: INK }}>
                Everything is clear.
              </p>
              <p className="text-[13px] text-slate-500">Nothing is blocked and nothing is due.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {visible.map((r) => {
                const t = tone(r.priority);
                const isOpen = !!open[r.label];
                return (
                  <div key={r.label} className="cc-row rounded-2xl border" style={{ borderColor: t.bd }}>
                    <button
                      onClick={() => setOpen((s) => ({ ...s, [r.label]: !s[r.label] }))}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left"
                      style={{ background: t.bg }}
                    >
                      <span
                        className="text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
                        style={{ color: t.fg, background: "#fff" }}
                      >
                        {t.word}
                      </span>
                      <span className="flex-1 text-[13.5px] font-semibold" style={{ color: INK }}>
                        {r.label}
                      </span>
                      <span className="text-[12px] tabular-nums text-slate-500">{r.items.length}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isOpen && (
                      <div className="divide-y divide-slate-100">
                        {r.items.map((w) => (
                          <button
                            key={w.project.id}
                            onClick={() => onOpenProject(w.project, tabFor(w.action.route))}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                          >
                            <span className="text-[13px] text-[#0a1b33]">
                              {w.project.context?.name ||
                                w.project.context?.clientName ||
                                "Untitled"}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {later.length > 0 && (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="w-full mt-1 py-2.5 text-[12px] font-semibold text-slate-500 hover:text-[#0a1b33] transition-colors"
                >
                  {showAll ? "Hide what can wait" : `Show ${later.length} more that can wait`}
                </button>
              )}
            </div>
          )}
        </div>

        </div>

        {/* Right rail, read top to bottom: what you were last in, then when
            the next thing lands. Both live in ONE grid cell -- as separate
            children of a 3-column grid the calendar wrapped onto the next row
            and reappeared under the worklist, which is the position this was
            meant to get it out of. */}
        <div className="space-y-5">
        <div className="cc-scene">
        <div
          ref={recentTilt.ref}
          onMouseMove={recentTilt.onMouseMove}
          onMouseLeave={recentTilt.onMouseLeave}
          className="cc-panel bg-white rounded-3xl border border-slate-200/70 p-6"
        >
          <h2 className="text-[19px] font-bold tracking-tight" style={{ color: INK }}>
            Continue where you left off
          </h2>
          <p className="text-[12.5px] text-slate-400 mt-0.5">Your recent work</p>

          {data.recent.length === 0 ? (
            <p className="mt-6 text-[13px] text-slate-500">
              Nothing open yet. Start a project from the centre of the dial.
            </p>
          ) : (
            <div className="mt-4 rounded-2xl bg-[#F8FAFD] border border-slate-200/60 divide-y divide-slate-200/70">
              {data.recent.map((p) => {
                const name =
                  p.context?.name || p.context?.clientName || "Untitled";
                const stage = STAGE_LABEL[p.context?.status || "draft"] || "Draft";
                return (
                  <button
                    key={p.id}
                    onClick={() => onOpenProject(p)}
                    className="cc-row group w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-white first:rounded-t-2xl last:rounded-b-2xl"
                  >
                    <span
                      className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-[11px] font-bold tracking-wide"
                      style={{ background: "#E8F0FB", color: BRAND }}
                    >
                      {initialsOf(name)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className="block text-[14px] font-semibold truncate"
                        style={{ color: INK }}
                      >
                        {name}
                      </span>
                      <span className="block text-[12.5px] text-slate-500 truncate">
                        {stage} &middot; {timeAgo(p.lastModified)}
                      </span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#3D52A0] transition-colors" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        </div>

        </div>
        </div>

        <StudioFooter
          onNavigate={onNavigate}
          activeCount={data.activeCount}
          clientsCount={data.clientsCount}
          openValue={data.openValue}
        />
      </div>
    </motion.div>
  );
}
