import React, { useEffect, useMemo, useState } from "react";
import { FullProjectData } from "../../types";
import { formatCompactINR } from "../../lib/utils";
import { buildStudioAnalytics, MonthPoint, MarginRow } from "../../lib/studioAnalytics";
import { getSingleProjectValue } from "../../lib/financialsUtils";
import {
  ReportScope, SCOPE_LABEL, inScope, countClasses, classifyProject, isEmptyShell,
} from "../../lib/projectClassification";
import { db } from "../../services/dbService";
import AnimatedNumber from "../ui/AnimatedNumber";
import { HudDial, HudDonut, HudTrace } from "./HudCharts";
import BulkTagPanel from "./BulkTagPanel";
import {
  Building2, Wallet, Scissors, Target, Info, AlertTriangle, Tags,
} from "lucide-react";

/**
 * THE ANALYTICS DECK.
 *
 * Four panels, each titled with a question an owner actually opens this screen
 * to answer -- can I take more work, when does the money land, where is margin
 * going, what converts -- rather than with the name of a data table.
 *
 * Every panel carries a footer stating what it is blind to. That is the whole
 * design premise: on this studio's real data, procurement covers 0.3% of
 * planned cost, so a confident "current margin" figure would be fiction. The
 * screen says so in the same breath as the number instead of drawing a line
 * through empty space and letting it be believed.
 *
 * Charts are hand-built SVG. recharts is in package.json but unused, and
 * pulling it in for four small charts would cost more bundle than it saves
 * code, while taking the type, colour and motion out of our hands -- all three
 * of which have to match the rest of the app exactly.
 */

const BRAND = "#3D52A0";
const INK = "#0A1B33";

/* Semantic colours, kept separate from the brand accent so "this is money in"
   never has to compete with "this is the studio's colour". */
const GOOD = "#0F766E";
const WARN = "#B45309";
const RISK = "#B4436A";

const pct = (n: number) => `${n.toFixed(n >= 10 ? 0 : 1)}%`;

/* ────────────────────────────────────────────────────────────────────────
   SHELL
   ──────────────────────────────────────────────────────────────────────── */

const Panel: React.FC<{
  icon: React.ElementType;
  eyebrow: string;
  question: string;
  accent?: string;
  delay?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ icon: Icon, eyebrow, question, accent = BRAND, delay = 0, children, footer }) => (
  <div className="cc-scene rp-in" style={{ animationDelay: `${delay}ms` }}>
    <div className="cc-panel rp-panel rp-frame rounded-3xl border border-slate-200/80 bg-white overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.4} style={{ color: accent }} />
          <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {eyebrow}
          </span>
        </div>
        <h3 className="mt-1.5 text-[15px] font-semibold" style={{ color: INK }}>
          {question}
        </h3>
      </div>

      <div className="px-5 py-5">{children}</div>

      {footer && (
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-start gap-1.5">
          <Info className="w-3 h-3 shrink-0 text-slate-400 mt-[2px]" strokeWidth={2.4} />
          <span className="text-[11px] leading-[1.5] text-slate-500">{footer}</span>
        </div>
      )}
    </div>
  </div>
);

/** A headline figure. The label sits under it, because the number is the point. */
const Figure: React.FC<{ value: number; format: (v: number) => string; label: string; tone?: string }> = ({
  value, format, label, tone = INK,
}) => (
  <div className="cc-z1">
    <div className="text-[26px] font-semibold leading-none tabular-nums" style={{ color: tone }}>
      <AnimatedNumber value={value} format={format} />
    </div>
    <div className="mt-1.5 text-[11.5px] text-slate-500">{label}</div>
  </div>
);

/* ────────────────────────────────────────────────────────────────────────
   CHARTS
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Monthly columns. Scaled to the tallest bar PRESENT, never to a portfolio
 * total -- scaling to the total is what made an earlier chart on this app draw
 * every month as a 2% sliver.
 */
const MonthColumns: React.FC<{
  points: MonthPoint[];
  color: string;
  caption: (p: MonthPoint) => string;
}> = ({ points, color, caption }) => {
  const max = points.reduce((m, p) => Math.max(m, p.value), 0) || 1;
  if (points.length === 0) {
    return <div className="h-[132px] flex items-center text-[12px] text-slate-400">No dated activity yet.</div>;
  }
  return (
    <div className="rp-chart rp-scan">
      {/* No `items-end` here. It shrinks each column to its content, and the
          content is a bar whose height is a PERCENTAGE of that column -- so the
          column measured zero, the bar resolved to zero, and the chart drew
          nothing but axis labels. The columns stretch; the bar is pinned to the
          bottom of its own full-height column instead. */}
      <div className="flex gap-2 h-[112px]">
        {points.map((p, i) => {
          const h = Math.max(3, (p.value / max) * 100);
          return (
            <div key={p.month} className="rp-col flex-1 min-w-0 h-full flex flex-col justify-end items-center group/col">
              <span className="mb-1.5 text-[10px] font-semibold tabular-nums text-slate-500 opacity-0 group-hover/col:opacity-100 transition-opacity whitespace-nowrap">
                {caption(p)}
              </span>
              {/* Capped, so a two-month series reads as two columns rather
                  than two slabs filling the panel. */}
              <div
                className="rp-bar w-full max-w-[54px] rounded-t-md"
                style={{
                  height: `${h}%`,
                  background: `linear-gradient(180deg, ${color} 0%, ${color}C0 100%)`,
                  animationDelay: `${140 + i * 70}ms`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
        {points.map((p) => (
          <div key={p.month} className="flex-1 min-w-0 text-center text-[10px] text-slate-400 truncate">
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * One contracted rupee, split three ways. A stacked bar rather than three
 * separate figures, because the question is what share has landed -- and a
 * share is a length, not three numbers you subtract in your head.
 */
const CashSplit: React.FC<{ collected: number; pending: number; outstanding: number }> = ({
  collected, pending, outstanding,
}) => {
  const total = collected + pending + outstanding || 1;
  const parts = [
    { key: "collected", label: "Received", value: collected, color: GOOD },
    { key: "pending", label: "Invoice raised", value: pending, color: WARN },
    { key: "outstanding", label: "Not yet billed", value: outstanding, color: "#CBD5E1" },
  ].filter((p) => p.value > 0);

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
        {parts.map((p, i) => (
          <div
            key={p.key}
            className="rp-hbar h-full"
            title={`${p.label}: ${formatCompactINR(p.value)}`}
            style={{
              width: `${(p.value / total) * 100}%`,
              background: p.color,
              animationDelay: `${200 + i * 110}ms`,
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {parts.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-[11.5px] text-slate-500">{p.label}</span>
            <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: INK }}>
              {formatCompactINR(p.value)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};

/**
 * Margin per project, thinnest first. Two marks per row: where the quote put
 * the margin, and where it stands now. They sit on one shared scale so the gap
 * between them IS the drift -- no second axis to reconcile.
 */
const MarginBars: React.FC<{ rows: MarginRow[]; onOpen?: (id: string) => void }> = ({ rows, onOpen }) => {
  const shown = rows.slice(0, 6);
  const max = Math.max(40, ...shown.map((r) => Math.max(r.quotedPct, r.currentPct)));
  return (
    <div className="space-y-2.5">
      {shown.map((r, i) => {
        const thin = r.quotedPct < 15;
        return (
          <button
            key={r.id}
            onClick={() => onOpen?.(r.id)}
            className="w-full text-left group/row cursor-pointer"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] truncate text-slate-600 group-hover/row:text-[#3D52A0] transition-colors">
                {r.name}
              </span>
              <span
                className="shrink-0 text-[12px] font-semibold tabular-nums"
                style={{ color: thin ? RISK : INK }}
              >
                {pct(r.quotedPct)}
              </span>
            </div>
            <div className="mt-1 h-[6px] rounded-full bg-slate-100 overflow-hidden">
              <div
                className="rp-hbar h-full rounded-full"
                style={{
                  width: `${Math.max(2, (r.quotedPct / max) * 100)}%`,
                  background: thin ? RISK : BRAND,
                  animationDelay: `${180 + i * 65}ms`,
                }}
              />
            </div>
          </button>
        );
      })}
      {rows.length > shown.length && (
        <p className="pt-1 text-[11px] text-slate-400">
          {rows.length - shown.length} more contracted {rows.length - shown.length === 1 ? "project" : "projects"} not shown.
        </p>
      )}
    </div>
  );
};

/** The pipeline as widths, largest stage setting the scale. */
const StageFunnel: React.FC<{
  stages: { key: string; label: string; count: number; value: number }[];
}> = ({ stages }) => {
  const rows = stages.filter((s) => s.count > 0);
  const max = rows.reduce((m, s) => Math.max(m, s.count), 0) || 1;
  const colorFor: Record<string, string> = {
    pipeline: "#94A3B8", won: BRAND, execution: "#5C6FC0", delivered: GOOD, lost: "#CBD5E1",
  };
  return (
    <div className="space-y-2.5">
      {rows.map((s, i) => (
        <div key={s.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] text-slate-600">{s.label}</span>
            <span className="text-[12px] tabular-nums text-slate-500">
              <span className="font-semibold" style={{ color: INK }}>{s.count}</span>
              {s.value > 0 && <> · {formatCompactINR(s.value)}</>}
            </span>
          </div>
          <div className="mt-1 h-[6px] rounded-full bg-slate-100 overflow-hidden">
            <div
              className="rp-hbar h-full rounded-full"
              style={{
                width: `${(s.count / max) * 100}%`,
                background: colorFor[s.key] || BRAND,
                animationDelay: `${180 + i * 65}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
   DECK
   ──────────────────────────────────────────────────────────────────────── */

interface Props {
  projects: FullProjectData[];
  /* An id, not a project: this is App's handler, which looks the project up in
     its own library and opens it on the project Reports tab. Declared here as
     (project, tab) it type-checked only because strict mode is off, and the
     margin rows silently did nothing when clicked. */
  onOpenProject?: (projectId: string) => void;
  /** Projects whose stored data changed here, for the app to merge back. */
  onProjectsPatched?: (updated: FullProjectData[]) => void;
}

const MONEY_STATUSES = ["won", "execution", "work_paused", "completed"];

const StudioAnalyticsDeck: React.FC<Props> = ({ projects, onOpenProject, onProjectsPatched }) => {
  const [posByProject, setPosByProject] = useState<Record<string, any[]>>({});

  /*
    Three states, because the data has three.

    A project is Actual or Test only when the studio has TAGGED it so on the
    project card. Anything else is untagged -- not guessed at from its name,
    which is how a template and nine empty "New Project" shells were being
    counted as real work.

    The default counts actual AND untagged, and says so. Strict "tagged actual"
    is one click away but currently resolves to a single lead, so defaulting to
    it would render an empty page and read as a broken screen rather than as an
    untagged one.
  */
  const [scope, setScope] = useState<ReportScope>("untagged");
  const [tagging, setTagging] = useState(false);

  const scoped = useMemo(
    () => (projects || []).filter((p) => inScope(p, scope)),
    [projects, scope]
  );

  const counts = useMemo(
    () => countClasses(projects || [], getSingleProjectValue),
    [projects]
  );

  const untagged = useMemo(
    () => (projects || []).filter((p) => classifyProject(p) === "untagged"),
    [projects]
  );

  /* Untagged projects that somebody actually worked on -- worth a moment to
     classify, unlike the abandoned drafts, which are worth deleting. */
  const untaggedWorth = useMemo(
    () => untagged.filter((p) => !isEmptyShell(p, getSingleProjectValue)),
    [untagged]
  );

  const a = useMemo(() => buildStudioAnalytics(scoped, posByProject), [scoped, posByProject]);

  const openById = (id: string) => onOpenProject?.(id);

  /* The one line worth reading if you read nothing else. Derived, not written:
     whichever of the four questions currently has the worst answer speaks. */
  const headline = useMemo(() => {
    const m = a.capacity.wonByMonth;
    if (m.length >= 2) {
      const last = m[m.length - 1];
      const prev = m[m.length - 2];
      if (last.count < prev.count) {
        return {
          tone: WARN,
          text: `Contracting has slowed: ${prev.count} signed in ${prev.label}, ${last.count} in ${last.label}. With ${a.pipeline.openCount} proposals open, this is the month to chase them.`,
        };
      }
    }
    if (a.cash.collectionRate < 40 && a.cash.outstanding > 0) {
      return {
        tone: WARN,
        text: `${formatCompactINR(a.cash.outstanding)} of contracted work is still unbilled or unpaid — ${pct(100 - a.cash.collectionRate)} of everything signed.`,
      };
    }
    return {
      tone: GOOD,
      text: `${a.capacity.activeSites} sites live and ${pct(a.cash.collectionRate)} of contracted value collected.`,
    };
  }, [a]);

  /* What the monthly columns do NOT account for, in rupees rather than as a
     percentage. Coverage here runs at 99.85%, which rounds to a flat "100% of
     what has come in" -- a sentence that is not true while an initiation fee
     sits outside every milestone. A rupee figure cannot round itself away. */
  const undatedCash = Math.max(0, a.cash.collected - a.cash.datedCollected);

  return (
    <div className="space-y-5">
      {/* ── what is being counted ───────────────────────────────────── */}
      <div className="rp-in rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11.5px] leading-[1.6] text-slate-500">
            Counting{" "}
            <strong className="font-semibold" style={{ color: INK }}>
              {scoped.length} {scoped.length === 1 ? "project" : "projects"}
            </strong>
            {scope === "actual" && <> tagged as actual work.</>}
            {scope === "untagged" && (
              <>
                {" "}
                — {counts.actual} tagged actual and {counts.untagged} not yet tagged.{" "}
                {counts.test} test {counts.test === 1 ? "record" : "records"} excluded.
              </>
            )}
            {scope === "all" && (
              <>
                {" "}
                — everything, <strong className="font-semibold" style={{ color: WARN }}>
                  including {counts.test} test {counts.test === 1 ? "record" : "records"}
                </strong>. Not a true picture of the studio.
              </>
            )}
          </p>

          <div className="flex rounded-xl border border-slate-200 bg-white p-1 shrink-0">
            {(["actual", "untagged", "all"] as ReportScope[]).map((k) => (
              <button
                key={k}
                onClick={() => setScope(k)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg leading-none transition-colors cursor-pointer ${
                  scope === k ? "bg-[#3D52A0] text-white" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {SCOPE_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {/* The nudge. Untagged is a state to be resolved, not a permanent
            bucket -- so the screen says exactly how much is unresolved and
            separates the drafts worth deleting from the projects worth
            classifying. */}
        {counts.untagged > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-start gap-1.5">
            <Tags className="w-3 h-3 shrink-0 text-slate-400 mt-[2px]" strokeWidth={2.4} />
            <p className="text-[11px] leading-[1.55] text-slate-500">
              {untaggedWorth.length > 0 && (
                <>
                  <strong className="font-semibold text-slate-600">
                    {untaggedWorth.length} {untaggedWorth.length === 1 ? "project has" : "projects have"} no
                    Actual/Dummy tag
                  </strong>{" "}
                  — once tagged, these figures stop depending on which scope is selected.
                </>
              )}
              {counts.untaggedEmpty > 0 && (
                <>
                  {" "}
                  A further {counts.untaggedEmpty} empty{" "}
                  {counts.untaggedEmpty === 1 ? "draft was" : "drafts were"} never filled in — no client, no
                  value, no scope — and can be deleted.
                </>
              )}
            </p>
          </div>
        )}

        {untagged.length > 0 && (
          <button
            onClick={() => setTagging(true)}
            className="mt-2.5 px-3 py-1.5 text-[11px] font-bold rounded-lg text-white transition-opacity hover:opacity-90 cursor-pointer"
            style={{ background: BRAND }}
          >
            Classify {untagged.length} {untagged.length === 1 ? "project" : "projects"}
          </button>
        )}
      </div>

      {tagging && (
        <BulkTagPanel
          projects={untagged}
          onClose={() => setTagging(false)}
          onSaved={(updated) => onProjectsPatched?.(updated)}
        />
      )}

      {/* ── the single line ─────────────────────────────────────────── */}
      <div
        className="rp-in rounded-2xl border px-4 py-3 flex items-start gap-2.5"
        style={{ borderColor: `${headline.tone}33`, background: `${headline.tone}0D` }}
      >
        <AlertTriangle className="w-4 h-4 shrink-0 mt-[1px]" strokeWidth={2.3} style={{ color: headline.tone }} />
        <p className="text-[13px] leading-[1.55]" style={{ color: INK }}>
          {headline.text}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── 1. CAPACITY ───────────────────────────────────────────── */}
        <Panel
          icon={Building2}
          eyebrow="Capacity"
          question="Can the studio take more work?"
          delay={40}
          footer={
            a.capacity.datedWins < a.capacity.contractedCount ? (
              <>
                {a.capacity.datedWins} of {a.capacity.contractedCount} contracted projects carry an
                acceptance date, so the columns cover most but not all of the book.
              </>
            ) : (
              <>Every contracted project carries an acceptance date.</>
            )
          }
        >
          <div className="flex items-center gap-4">
            {/* Studio load: how much of the whole book is live work rather than
                pipeline. The one capacity reading that holds meaning whether or
                not anything is currently on site. */}
            <HudDial
              value={a.capacity.loadPct}
              max={100}
              readout={`${Math.round(a.capacity.loadPct)}%`}
              label="Studio load"
              sub={`${a.capacity.activeSites} on site`}
              color={a.capacity.loadPct < 25 ? WARN : BRAND}
              size={128}
            />

            {/* Three zeros are a true answer but a useless one. When nothing is
                on site the panel says that in words, and says what IS in hand --
                which is the actual capacity question. */}
            <div className="min-w-0 flex-1">
              {a.capacity.activeSites === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
                  <p className="text-[13.5px] font-semibold" style={{ color: INK }}>
                    Nothing is on site right now.
                  </p>
                  <p className="mt-1 text-[12px] leading-[1.55] text-slate-500">
                    {a.pipeline.byStage.find((st) => st.key === "won")?.count
                      ? `${a.pipeline.byStage.find((st) => st.key === "won")!.count} contracted ${
                          a.pipeline.byStage.find((st) => st.key === "won")!.count === 1 ? "project is" : "projects are"
                        } signed and waiting to start — worth ${formatCompactINR(
                          a.pipeline.byStage.find((st) => st.key === "won")!.value
                        )}. The studio has full execution capacity.`
                      : "No contracted work is waiting to start either, so the constraint is sales, not capacity."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Figure
                    value={a.capacity.sqftOnSite}
                    format={(v) => `${Math.round(v).toLocaleString("en-IN")}`}
                    label="sq ft under execution"
                  />
                  <Figure
                    value={a.capacity.avgValuePerActive}
                    format={formatCompactINR}
                    label="average live job"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              Contracts signed per month
            </p>
            <MonthColumns
              points={a.capacity.wonByMonth}
              color={BRAND}
              caption={(p) => `${p.count} · ${formatCompactINR(p.value)}`}
            />
          </div>
        </Panel>

        {/* ── 2. CASH ───────────────────────────────────────────────── */}
        <Panel
          icon={Wallet}
          eyebrow="Cash"
          question="When does the money actually land?"
          accent={GOOD}
          delay={110}
          footer={
            <>
              {a.cash.datedMilestones === a.cash.paidMilestones
                ? "Every received payment carries a date."
                : `${a.cash.datedMilestones} of ${a.cash.paidMilestones} received payments carry a date.`}
              {undatedCash > 0 && (
                <>
                  {" "}A further {formatCompactINR(undatedCash)} of initiation fees is not attached to any
                  milestone, so it is counted above but does not appear in the months.
                </>
              )}
              {" "}No milestone in the studio carries a <em>due</em> date, so none of this can be run
              forward into a forecast.
            </>
          }
        >
          <div className="flex items-center gap-4">
            {/* The faint inner arc is everything invoiced; the solid one is what
                actually arrived. The gap between them is the chasing to do. */}
            <HudDial
              value={a.cash.collectionRate}
              max={100}
              readout={pct(a.cash.collectionRate)}
              label="Collected"
              sub="of contracted"
              color={GOOD}
              size={128}
              ghost={
                a.cash.pending > 0 && a.cash.contracted > 0
                  ? {
                      value: ((a.cash.collected + a.cash.pending) / a.cash.contracted) * 100,
                      label: `${formatCompactINR(a.cash.pending)} invoiced, unpaid`,
                    }
                  : undefined
              }
            />
            <div className="min-w-0 flex-1 space-y-3">
              <Figure value={a.cash.collected} format={formatCompactINR} label="received to date" tone={GOOD} />
              <Figure value={a.cash.outstanding} format={formatCompactINR} label="contracted, not yet in" />
            </div>
          </div>

          <div className="mt-5">
            <CashSplit
              collected={a.cash.collected}
              pending={a.cash.pending}
              outstanding={a.cash.outstanding}
            />
          </div>

          <div className="mt-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              Received per month
            </p>
            {a.cash.collectedByMonth.length >= 3 ? (
              <HudTrace
                points={a.cash.collectedByMonth.map((m) => ({ label: m.label, value: m.value }))}
                color={GOOD}
                format={formatCompactINR}
              />
            ) : (
              /* A trend line needs a trend. Under three months the columns are
                 the honest picture. */
              <MonthColumns
                points={a.cash.collectedByMonth}
                color={GOOD}
                caption={(p) => formatCompactINR(p.value)}
              />
            )}
          </div>
        </Panel>

        {/* ── 3. MARGIN ─────────────────────────────────────────────── */}
        <Panel
          icon={Scissors}
          eyebrow="Margin"
          question="Where is margin leaking?"
          accent={RISK}
          delay={180}
          footer={
            a.margin.blind ? (
              <>
                <strong className="font-semibold text-slate-600">This cannot be answered yet.</strong>{" "}
                Purchase orders cover {pct(a.margin.procurementCoverage * 100)} of planned cost
                ({a.margin.withProcurement} of {a.margin.rows.length} contracted projects have any),
                so there is nothing to compare the quote against. The figures above are what was
                quoted, not what is being spent. Raise POs against site spend and this panel starts
                reading drift.
              </>
            ) : (
              <>
                Measured against {pct(a.margin.procurementCoverage * 100)} of planned cost committed
                on purchase orders.
              </>
            )
          }
        >
          <div className="flex items-center gap-4">
            <HudDial
              value={a.margin.quotedPct}
              max={50}
              readout={pct(a.margin.quotedPct)}
              label="Quoted margin"
              sub={a.margin.blind ? "not yet measured" : "against spend"}
              color={a.margin.quotedPct < 20 ? RISK : BRAND}
              size={128}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <Figure value={a.margin.quotedMargin} format={formatCompactINR} label="rupees of quoted margin" />
              <Figure
                value={a.margin.contracted}
                format={formatCompactINR}
                label={`across ${a.margin.rows.length} contracts`}
              />
            </div>
          </div>
          <div className="mt-5">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              Thinnest quotes first
            </p>
            <MarginBars rows={a.margin.rows} onOpen={openById} />
          </div>
        </Panel>

        {/* ── 4. CONVERSION ─────────────────────────────────────────── */}
        <Panel
          icon={Target}
          eyebrow="Conversion"
          question="What is converting, and what is stuck?"
          delay={250}
          footer={
            <>
              Win rate counts decided projects only — {a.pipeline.wonCount} contracted against{" "}
              {a.pipeline.lostCount} lost. The {a.pipeline.openCount} still open are not yet either.
            </>
          }
        >
          <div className="flex items-center gap-4">
            <HudDial
              value={a.pipeline.winRate}
              max={100}
              readout={pct(a.pipeline.winRate)}
              label="Win rate"
              sub={`${a.pipeline.wonCount} won / ${a.pipeline.lostCount} lost`}
              color={a.pipeline.winRate < 50 ? WARN : BRAND}
              size={128}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <Figure value={a.pipeline.pipelineValue} format={formatCompactINR} label="open pipeline value" />
              <Figure value={a.pipeline.lostValue} format={formatCompactINR} label="lost this book" tone={RISK} />
            </div>
          </div>
          <div className="mt-5">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              Where the book sits
            </p>
            <StageFunnel stages={a.pipeline.byStage} />
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default StudioAnalyticsDeck;
