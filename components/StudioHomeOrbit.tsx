import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { FullProjectData } from "../types";
import { formatCompactINR, timeAgo } from "../lib/utils";
import { getSingleProjectValue } from "../lib/financialsUtils";
import { useStudioHomeData, tabFor, greetingWord } from "./home/useStudioHomeData";
import ClockCalendar from "./home/ClockCalendar";
import { useTilt } from "./home/useTilt";
import {
  AttentionState, isHidden, writeAttentionEntry, TOMORROW_9AM, NEXT_WEEK,
} from "../services/attentionState";
import StudioFooter from "./home/StudioFooter";
import {
  ArrowRight, CheckCircle2, ChevronDown, Plus, Sparkles, Clock, Wallet, Zap, Layers3, Check, BellOff,
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
  /** projectId -> the tab this person last had open in it. */
  lastTabs?: Record<string, string>;
  /** Snoozed / dismissed items, per person. */
  attention?: AttentionState;
  onAttentionChange?: (projectId: string, entry: { snoozedUntil?: number; dismissedAt?: number }) => void;
  role: string;
  userName?: string;
}

export default function StudioHomeOrbit({
  projects, onOpenProject, onCreateNew, onNavigate, role, userName = "there", lastTabs = {},
  attention = {}, onAttentionChange,
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

const RANK: Record<string, number> = { blocker: 0, due: 1, suggested: 2 };

  /*
    Grouped by project, because a project is the thing you act on.

    This used to group by action -- one row per distinct task, with a count
    beside it. That answered "what kind of work is outstanding" and hid the
    only question anyone actually asks of this list: on WHICH site. A row
    reading "Collect Execution Advance - 2" told you nothing you could act on
    without opening it first.

    Now each row is a project, carrying its money and its worst-priority flag,
    with its actions underneath. Actions do repeat across rows, and that is
    honest: the same task on two different sites is two different jobs.
  */
  const byProject = useMemo(() => {
    const now = Date.now();
    const map = new Map<
      string,
      {
        project: FullProjectData;
        actions: any[];
        value: number;
        worst: string;
        idle: number;
        stageDays: number | null;
        share: number;
      }
    >();
    for (const w of data.worklist) {
      const id = w.project.id;
      if (!map.has(id)) {
        const ctx: any = w.project.context || {};
        const enteredAt = ctx.lifecycle?.enteredStageAt;
        map.set(id, {
          project: w.project,
          actions: [],
          value: getSingleProjectValue(w.project) || 0,
          worst: w.action.priority,
          /* Days since anyone touched this at all. The dimension this list was
             missing: something blocked since June is a different problem from
             something blocked this morning, and they looked identical. */
          idle: w.project.lastModified
            ? Math.max(0, Math.floor((now - w.project.lastModified) / 86400000))
            : 0,
          stageDays: enteredAt
            ? Math.max(0, Math.floor((now - enteredAt) / 86400000))
            : null,
          share: 0,
        });
      }
      const entry = map.get(id)!;
      entry.actions.push(w.action);
      if (RANK[w.action.priority] < RANK[entry.worst]) entry.worst = w.action.priority;
    }

    /* Snoozed and dismissed items leave before anything is ranked, so the
       tiles, the counts and the brief all agree with what is on screen. */
    const rows = [...map.values()].filter(
      (r) => !isHidden(attention[r.project.id], r.project.lastModified)
    );
    /* Scaled against the LARGEST row, not the portfolio total.

       Against the total, thirty projects meant every bar came out at two or
       three percent and the whole column read as empty -- technically a true
       proportion, visually no information at all. Against the biggest one,
       the bar answers the question actually being asked: how does this
       compare with the worst of them. */
    const top = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
    rows.forEach((r) => (r.share = r.value / top));

    /* Triage, not just sorting. Worst priority always wins, but within a band
       the thing to look at is value WEIGHTED BY how long it has sat -- a
       quarter-million stuck two months outranks a larger job raised today. */
    const heat = (r: (typeof rows)[number]) => r.value * (1 + Math.min(r.idle, 90) / 30);
    return rows.sort((a, b) => RANK[a.worst] - RANK[b.worst] || heat(b) - heat(a));
  }, [data.worklist, attention]);

/*
    Age in words, never in colour.

    It was a coloured chip -- rose past three weeks, amber past one -- which put
    a SECOND colour system on a row that already used rose for "blocked" and
    amber for "next up". The same two colours meant two unrelated things
    depending on which element you were looking at, and nothing on screen said
    which was which. Plain words need no key.

    Weight still carries it: something sitting over a month is stated firmly,
    everything else stays quiet.
  */
  const idleLabel = (d: number) =>
    d <= 0 ? "touched today" : d === 1 ? "idle 1 day" : `idle ${d} days`;


  /* The single most useful sentence this panel can say: what has been sitting
     longest. Derived from the same rows, so it cannot disagree with the list. */
  const stalest = useMemo(() => {
    const blocked = byProject.filter((r) => r.worst !== "suggested");
    if (blocked.length === 0) return null;
    return blocked.reduce((a, b) => (b.idle > a.idle ? b : a));
  }, [byProject]);

  const attentionTilt = useTilt(3);
  const recentTilt = useTilt(5);

  const worklistRef = React.useRef<HTMLDivElement | null>(null);
  const reviewPriorities = () =>
    worklistRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = React.useState(false);
  /* The bento is the summary; the list is the drill-down. Closed by default,
     because the whole point of the tiles is not having to read a list. */
  const [showList, setShowList] = React.useState(false);

  const allOpen = (list: { project: FullProjectData }[]) =>
    list.length > 0 && list.every((r) => open[r.project.id]);
  const toggleAll = (list: { project: FullProjectData }[]) => {
    const closing = allOpen(list);
    setOpen(Object.fromEntries(list.map((r) => [r.project.id, !closing])));
  };

  /* "Can wait" is now a property of the project: one whose worst outstanding
     item is a suggestion is not asking for anything today. */
  const later = byProject.filter((r) => r.worst === "suggested");
  const visible = showAll ? byProject : byProject.filter((r) => r.worst !== "suggested");
  /* The bar scales against the biggest row ON SCREEN. Scaled against the whole
     portfolio, one large dormant project flattened every visible bar to four
     percent and the column said nothing. */
  const topVisible = visible.reduce((m, r) => Math.max(m, r.value), 0) || 1;

  /* One number: what the visible items are holding up. Computed over the same
     rows the tiles render, so it cannot disagree with them the way the old
     action-level count disagreed with the project-level one beside it. */
  const briefValue = useMemo(
    () => visible.reduce((t, r) => t + r.value, 0),
    [visible]
  );

  /*
    Three tiles, each answering a different question a person actually asks
    when they open this: what has been ignored longest, what is worth most,
    and what could I clear in the next ten minutes.

    "Quickest win" is the fewest outstanding actions, tie-broken by most
    recently touched -- fewest things to do, and still fresh in mind. It is
    deliberately not "cheapest": the point is the shortest path to one fewer
    blocked project, not the smallest number.
  */
  const picks = useMemo(() => {
    if (visible.length === 0) return null;
    /* Each tile picks from what the previous ones left.

       Picking independently, one project won two tiles at once -- the same
       name and the same action shown twice, with a tile wasted saying it. Three
       tiles should name three projects, or they are not worth three tiles. */
    const taken = new Set<(typeof visible)[number]>();
    const pick = (
      pool: typeof visible,
      better: (a: (typeof visible)[number], b: (typeof visible)[number]) => boolean
    ) => {
      const left = pool.filter((r) => !taken.has(r));
      if (left.length === 0) return null;
      const chosen = left.reduce((a, b) => (better(a, b) ? b : a));
      taken.add(chosen);
      return chosen;
    };

    const oldest = pick(visible, (a, b) => b.idle > a.idle);
    const biggest = pick(visible, (a, b) => b.value > a.value);
    const quickest = pick(
      visible,
      (a, b) =>
        b.actions.length < a.actions.length ||
        (b.actions.length === a.actions.length && b.idle < a.idle)
    );
    const rest = visible.filter((r) => !taken.has(r));
    return {
      /* Fewer than three outstanding projects means fewer than three tiles.
         A tile repeating what the one above it says is worse than a gap. */
      tiles: [oldest, biggest, quickest],
      rest,
      restValue: rest.reduce((t, r) => t + r.value, 0),
    };
  }, [visible]);

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
              {/* The total held up used to live in a brief below this line,
                  alongside a "longest waiting" sentence that repeated the first
                  tile word for word and a count that disagreed with this one.
                  The figure was the only thing there worth keeping. */}
              {visible.length} need{visible.length === 1 ? "s" : ""} you now
              {briefValue > 0 && ` · ${formatCompactINR(briefValue)} held up`}
              {later.length > 0 && ` · ${later.length} can wait`}
            </span>
          </div>


          {byProject.length === 0 ? (
            <div className="py-14 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
              <p className="mt-3 text-[14px] font-semibold" style={{ color: INK }}>
                Everything is clear.
              </p>
              <p className="text-[13px] text-slate-500">Nothing is blocked and nothing is due.</p>
            </div>
          ) : (
            <>
            {/*
              THE BENTO.

              Four tiles instead of a wall of rows. Each answers a question
              someone actually arrives with -- what has been ignored longest,
              what is worth most, what could I finish today -- and the fourth
              holds the remainder so nothing is hidden, only deprioritised.

              A list makes you scan and compare. Tiles have already done the
              comparing, which is the difference between a dashboard you read
              and a worklist you work.
            */}
            {picks && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: "oldest", icon: Clock, eyebrow: "Ignored longest",
                    line: (r: any) => idleLabel(r.idle) },
                  { key: "biggest", icon: Wallet, eyebrow: "Most at stake",
                    line: (r: any) => formatCompactINR(r.value) },
                  { key: "quickest", icon: Zap, eyebrow: "Quickest win",
                    line: (r: any) =>
                      `${r.actions.length} action${r.actions.length === 1 ? "" : "s"} to clear` },
                ].map((tile, ti) => {
                  const r = picks.tiles[ti];
                  if (!r) return null;
                  const t = tone(r.worst);
                  const Icon = tile.icon;
                  const name =
                    r.project.context?.name || r.project.context?.clientName || "Untitled";
                  return (
                    <div
                      key={tile.key}
                      className="group relative rounded-2xl border border-slate-200/80 bg-white p-4 hover:border-slate-300 transition-colors overflow-hidden"
                    >
                      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: t.fg }} />
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3 h-3 shrink-0 text-slate-400" strokeWidth={2.4} />
                        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
                          {tile.eyebrow}
                        </span>
                      </div>

                      <button
                        onClick={() => onOpenProject(r.project, tabFor(r.actions[0]?.route))}
                        className="mt-2 block w-full text-left"
                      >
                        <span className="block text-[14.5px] font-semibold truncate group-hover:text-[#3D52A0] transition-colors" style={{ color: INK }}>
                          {name}
                        </span>
                        <span className="mt-1 block text-[12.5px] text-slate-600 truncate">
                          {r.actions[0]?.title}
                        </span>
                      </button>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[11.5px] font-semibold tabular-nums text-slate-500">
                          {tile.line(r)}
                        </span>
                        {/* Snooze and dismiss, so the queue is yours. Dismiss
                            returns the moment the project is touched again. */}
                        <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            onClick={() => onAttentionChange?.(r.project.id, { snoozedUntil: TOMORROW_9AM() })}
                            title="Not today - back tomorrow morning"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#3D52A0] hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <BellOff className="w-3.5 h-3.5" strokeWidth={2.2} />
                          </button>
                          <button
                            onClick={() => onAttentionChange?.(r.project.id, { dismissedAt: Date.now() })}
                            title="Handled - returns if the project moves again"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" strokeWidth={2.6} />
                          </button>
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* The remainder. Nothing is hidden by the tiles -- this says
                    exactly how much is behind them and opens the full list. */}
                <button
                  onClick={() => setShowList((v) => !v)}
                  className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-left hover:border-slate-400 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <Layers3 className="w-3 h-3 shrink-0 text-slate-400" strokeWidth={2.4} />
                    <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      Everything else
                    </span>
                  </div>
                  <span className="mt-2 block text-[14.5px] font-semibold" style={{ color: INK }}>
                    {picks.rest.length === 0
                      ? "Nothing else waiting"
                      : `${picks.rest.length} more project${picks.rest.length === 1 ? "" : "s"}`}
                  </span>
                  <span className="mt-1 block text-[12.5px] text-slate-500">
                    {picks.restValue > 0 ? `${formatCompactINR(picks.restValue)} held up` : "\u00a0"}
                  </span>
                  <span className="mt-3 block text-[11.5px] font-semibold" style={{ color: BRAND }}>
                    {showList ? "Hide the full list" : "See the full list"}
                  </span>
                </button>
              </div>
            )}

            {showList && (
            <div className="mt-4 space-y-2">
              {visible.map((r) => {
                const t = tone(r.worst);
                const isOpen = !!open[r.project.id];
                const name =
                  r.project.context?.name || r.project.context?.clientName || "Untitled";
                const client = r.project.context?.clientName;
                const stale = r.idle >= 30;
                return (
                  <div
                    key={r.project.id}
                    className="cc-row rounded-2xl border border-slate-200/80 bg-white overflow-hidden"
                  >
                    {/* The ONLY colour on the row, and it means one thing:
                        how urgent this is. Everything else is neutral, so
                        nothing competes with it and no legend is needed. */}
                    <div className="flex">
                    <span aria-hidden className="w-[3px] shrink-0" style={{ background: t.fg }} />

                    <button
                      onClick={() =>
                        setOpen((s) => ({ ...s, [r.project.id]: !s[r.project.id] }))
                      }
                      className="flex-1 min-w-0 flex items-center gap-4 px-4 py-3 text-left hover:bg-slate-50/70 transition-colors"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="flex items-baseline gap-2 min-w-0">
                          <span
                            className="text-[14px] font-semibold truncate"
                            style={{ color: INK }}
                          >
                            {name}
                          </span>
                          {client && client !== name && (
                            <span className="text-[11.5px] text-slate-400 truncate shrink-0 max-w-[45%]">
                              {client}
                            </span>
                          )}
                        </span>

                        <span className="mt-1.5 flex items-center gap-2 min-w-0">
                          <span
                            className="shrink-0 text-[9.5px] font-bold uppercase tracking-[0.1em] px-1.5 py-[3px] rounded"
                            style={{ color: t.fg, background: t.bg }}
                          >
                            {t.word}
                          </span>
                          <span className="text-[12.5px] text-slate-600 truncate">
                            {r.actions[0]?.title}
                          </span>
                          {r.actions.length > 1 && (
                            <span className="shrink-0 text-[11px] text-slate-400">
                              +{r.actions.length - 1}
                            </span>
                          )}
                        </span>
                      </span>

                      {/* Money over age, right-aligned and both neutral. The
                          figure is the fact; the line under it is how long it
                          has been true. */}
                      <span className="shrink-0 text-right">
                        {r.value > 0 && (
                          <span
                            className="block text-[13.5px] font-semibold tabular-nums"
                            style={{ color: INK }}
                          >
                            {formatCompactINR(r.value)}
                          </span>
                        )}
                        <span
                          className={`block text-[11px] tabular-nums mt-0.5 ${
                            stale ? "text-slate-600 font-semibold" : "text-slate-400"
                          }`}
                          title={
                            r.stageDays !== null
                              ? `In this stage for ${r.stageDays} days`
                              : "Since anyone last opened this project"
                          }
                        >
                          {idleLabel(r.idle)}
                        </span>
                      </span>

                      <ChevronDown
                        className={`w-4 h-4 shrink-0 text-slate-300 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                      </button>
                    </div>

                      {isOpen && (
                        <div className="border-t border-slate-100 divide-y divide-slate-100">
                          {r.actions.map((a, i) => (
                            <button
                              key={`${a.id || a.title}-${i}`}
                              onClick={() => onOpenProject(r.project, tabFor(a.route))}
                              title={a.why}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                            >
                              <span className="flex-1 min-w-0 text-[12.5px] text-slate-600 truncate">
                                {a.title}
                              </span>
                              {a.blockedBy && (
                                <span className="shrink-0 text-[11px] text-slate-400 truncate max-w-[38%]">
                                  waiting on {a.blockedBy}
                                </span>
                              )}
                              <span
                                className="shrink-0 text-[11.5px] font-semibold"
                                style={{ color: t.fg }}
                              >
                                {a.ctaLabel || "Open"}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 shrink-0 text-slate-300" />
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
            </>
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
                    /* Back to the tab you stopped on, not the dashboard you
                       started from. Falls through to the dashboard when there
                       is nothing remembered for this project. */
                    onClick={() => onOpenProject(p, lastTabs[p.id])}
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
