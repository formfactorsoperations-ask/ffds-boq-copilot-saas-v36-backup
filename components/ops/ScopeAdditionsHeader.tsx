import React from "react";
import { formatCurrency } from "../../lib/utils";
import { ScopeAdditionSummary } from "../../lib/scopeAdditions";
import { HudDial } from "../reports/HudCharts";
import { Plus, FileText, TrendingDown, Layers, Gauge, Info, AlertTriangle } from "lucide-react";

/**
 * SCOPE ADDITIONS: WHAT THE CHANGES HAVE DONE TO THIS JOB.
 *
 * The screen used to open on two buttons and a list. Everything an owner would
 * want to know first -- how far the job has drifted from what was signed,
 * whether the extra work is being priced as well as the original, and whether
 * it is being priced off rates that have since moved -- had to be worked out by
 * reading every card and doing the arithmetic by hand.
 *
 * Three readings, from the same `summariseScopeAdditions` the Money tab uses,
 * so the two screens cannot disagree about what this project is worth.
 */

const INK = "#0A1B33";
const BRAND = "#3D52A0";
const GOOD = "#0F766E";
const WARN = "#B45309";
const RISK = "#B4436A";

interface Props {
  summary: ScopeAdditionSummary;
  contractedExGst: number;
  baseMarginPct: number | null;
  onNew: () => void;
  onExport?: () => void;
}

const Card: React.FC<{
  icon: React.ElementType;
  label: string;
  accent?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ icon: Icon, label, accent = BRAND, children, footer }) => (
  <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col">
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.4} style={{ color: accent }} />
      <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
    </div>
    <div className="mt-3 flex-1">{children}</div>
    {footer && (
      <p className="mt-3 pt-3 border-t border-slate-100 text-[11px] leading-[1.5] text-slate-500">{footer}</p>
    )}
  </div>
);

const ScopeAdditionsHeader: React.FC<Props> = ({
  summary: s, contractedExGst, baseMarginPct, onNew, onExport,
}) => {
  const revised = contractedExGst + s.authorisedTotal;
  const none = s.live.length === 0;

  return (
    <div className="space-y-4">
      {/* ── title and actions ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 shrink-0" strokeWidth={2.4} style={{ color: BRAND }} />
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Scope additions
            </span>
          </div>
          <h2 className="mt-1 text-[19px] font-semibold tracking-tight" style={{ color: INK }}>
            What has been added since the BOQ was frozen
          </h2>
        </div>

        <div className="flex gap-2 shrink-0">
          {!none && onExport && (
            <button
              type="button"
              onClick={onExport}
              className="px-3.5 py-2 text-[12px] font-bold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" strokeWidth={2.3} />
              Export ledger
            </button>
          )}
          <button
            type="button"
            onClick={onNew}
            className="px-4 py-2 text-[12px] font-bold rounded-xl text-white transition-opacity hover:opacity-90 cursor-pointer flex items-center gap-1.5"
            style={{ background: BRAND }}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.6} />
            New addition
          </button>
        </div>
      </div>

      {none ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5">
          <p className="text-[13px] font-semibold" style={{ color: INK }}>
            Nothing has been added yet.
          </p>
          <p className="mt-1 text-[12px] leading-[1.55] text-slate-500">
            The contract stands at {formatCurrency(contractedExGst)}, exactly as it was frozen. Anything
            the client asks for from here is raised as a supplementary invoice and appears both on this
            screen and in the project's Money tab.
          </p>
        </div>
      ) : (
        <>
          {/* ── the ladder, stated once at the top ──────────────────── */}
          <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
            <span className="text-[12px] text-slate-500">
              Frozen BOQ{" "}
              <strong className="font-semibold tabular-nums" style={{ color: INK }}>
                {formatCurrency(contractedExGst)}
              </strong>
            </span>
            <span className="text-[12px] text-slate-500">
              + authorised{" "}
              <strong className="font-semibold tabular-nums" style={{ color: s.authorisedTotal > 0 ? GOOD : "#94A3B8" }}>
                {s.authorisedTotal > 0 ? formatCurrency(s.authorisedTotal) : "—"}
              </strong>
            </span>
            <span className="text-[12px] text-slate-500">
              = revised contract{" "}
              <strong className="font-bold tabular-nums text-[14px]" style={{ color: INK }}>
                {formatCurrency(revised)}
              </strong>
            </span>
            {s.raisedTotal > 0 && (
              <span className="text-[12px] text-slate-500">
                ·{" "}
                <strong className="font-semibold tabular-nums" style={{ color: WARN }}>
                  {formatCurrency(s.raisedTotal)}
                </strong>{" "}
                raised, awaiting client
              </span>
            )}
          </div>

          {/* ── the three readings ──────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. scope creep */}
            <Card
              icon={Gauge}
              label="Scope creep"
              accent={s.creepPct >= 15 ? WARN : BRAND}
              footer={
                <>
                  {s.authorisedCreepPct.toFixed(1)}% settled ·{" "}
                  {(s.creepPct - s.authorisedCreepPct).toFixed(1)}% still with the client.
                </>
              }
            >
              <div className="flex justify-center">
                <HudDial
                  value={s.creepPct}
                  max={Math.max(25, Math.ceil(s.creepPct / 5) * 5)}
                  readout={`${s.creepPct.toFixed(1)}%`}
                  label="of the signed contract"
                  sub={formatCurrency(s.authorisedTotal + s.raisedTotal)}
                  color={s.creepPct >= 15 ? WARN : BRAND}
                  size={124}
                />
              </div>
            </Card>

            {/* 2. margin on the extra work */}
            <Card
              icon={TrendingDown}
              label="Margin on additions"
              accent={s.thinCount > 0 ? RISK : GOOD}
              footer={
                s.thinCount > 0 ? (
                  <>
                    <strong className="font-semibold text-slate-600">
                      {s.thinCount} of {s.margins.length}
                    </strong>{" "}
                    priced thinner than the job {s.thinCount === 1 ? "it is" : "they are"} being added to.
                    Extra work is where margin quietly leaks.
                  </>
                ) : (
                  <>Nothing is priced below the contract's own margin.</>
                )
              }
            >
              {s.blendedMarginPct == null ? (
                <p className="text-[12px] text-slate-400">No priced additions to measure.</p>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-[26px] font-semibold leading-none tabular-nums"
                      style={{ color: s.thinCount > 0 ? RISK : INK }}
                    >
                      {s.blendedMarginPct.toFixed(1)}%
                    </span>
                    {baseMarginPct != null && (
                      <span className="text-[11.5px] text-slate-400">vs {baseMarginPct.toFixed(1)}% base</span>
                    )}
                  </div>

                  {/* Each addition against the contract's own margin, so "thin"
                      means thin for THIS job rather than against a number
                      picked out of the air. */}
                  <div className="mt-3 space-y-1.5">
                    {s.margins.slice(0, 4).map((m) => (
                      <div key={m.ref} className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 w-[54px] shrink-0">{m.ref}</span>
                        <div className="flex-1 h-[5px] rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(2, Math.min(100, (m.pct / Math.max(40, baseMarginPct || 40)) * 100))}%`,
                              background: m.thinnerThanBase ? RISK : GOOD,
                            }}
                          />
                        </div>
                        <span
                          className="text-[11px] font-semibold tabular-nums w-[38px] text-right shrink-0"
                          style={{ color: m.thinnerThanBase ? RISK : INK }}
                        >
                          {m.pct.toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>

            {/* 3. rate drift */}
            <Card
              icon={s.drift.length > 0 ? AlertTriangle : Info}
              label="Rate drift"
              accent={s.drift.length > 0 ? WARN : GOOD}
              footer={
                s.driftComparable === 0 ? (
                  <>
                    None of the {s.driftTotalLines} {s.driftTotalLines === 1 ? "line" : "lines"} is linked to a
                    rate-bank item, so there is nothing to compare against. Pick items from the bank rather
                    than typing them to make this measurable.
                  </>
                ) : (
                  <>
                    {s.driftComparable} of {s.driftTotalLines} lines could be checked against today's rates.
                  </>
                )
              }
            >
              {s.driftComparable === 0 ? (
                <p className="text-[12px] text-slate-400">Not measurable on these additions.</p>
              ) : s.drift.length === 0 ? (
                <>
                  <span className="text-[26px] font-semibold leading-none tabular-nums" style={{ color: GOOD }}>
                    None
                  </span>
                  <p className="mt-1.5 text-[11.5px] text-slate-500">
                    Every checked line still matches the rate bank.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[26px] font-semibold leading-none tabular-nums" style={{ color: WARN }}>
                      {formatCurrency(s.driftExposure)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    under-priced against today's rates
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {s.drift.slice(0, 3).map((d, i) => (
                      <div key={`${d.ref}-${i}`} className="flex items-baseline justify-between gap-2">
                        <span className="text-[11.5px] text-slate-600 truncate">{d.description}</span>
                        <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: WARN }}>
                          +{d.gapPct.toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default ScopeAdditionsHeader;
