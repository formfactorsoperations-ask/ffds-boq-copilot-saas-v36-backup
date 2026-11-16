import React from "react";
import { formatCurrency } from "../../lib/utils";
import { ScopeAdditionSummary } from "../../lib/scopeAdditions";
import { HudDial } from "../reports/HudCharts";
import { Plus, FileText, TrendingDown, Layers, Gauge, Info, AlertTriangle } from '@/lib/lucide-shim';
import { Panel, Button, EmptyState, StateDot } from "../ui/kit";

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
 *
 * Built from the screen kit (DESIGN.md "Screen kit", standardisation PR 5): the
 * page bar names the screen, so there is no title of its own; the ladder and
 * the buttons share one row; state is told in rose, amber and emerald only.
 */

/* State colours from the palette, for the dial and the bars (DESIGN.md "Colour"). */
const BRAND = "#3D52A0";
const GOOD = "#059669"; // emerald-600
const WARN = "#d97706"; // amber-600
const RISK = "#e11d48"; // rose-600

interface Props {
  summary: ScopeAdditionSummary;
  contractedExGst: number;
  baseMarginPct: number | null;
  onNew: () => void;
  onExport?: () => void;
}

const ScopeAdditionsHeader: React.FC<Props> = ({
  summary: s, contractedExGst, baseMarginPct, onNew, onExport,
}) => {
  const revised = contractedExGst + s.authorisedTotal;
  const none = s.live.length === 0;

  return (
    <div className="space-y-4">
      {/* The contract ladder and the actions, on one row. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {!none && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500">
            <span>Frozen BOQ <b className="font-semibold text-slate-800 tabular-nums">{formatCurrency(contractedExGst)}</b></span>
            <span>+ authorised <b className={`font-semibold tabular-nums ${s.authorisedTotal > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
              {s.authorisedTotal > 0 ? formatCurrency(s.authorisedTotal) : "—"}</b></span>
            <span>= revised contract <b className="text-sm font-bold text-slate-800 tabular-nums">{formatCurrency(revised)}</b></span>
            {s.raisedTotal > 0 && (
              <span className="inline-flex items-center gap-1.5"><StateDot tone="warn" />
                <b className="font-semibold text-amber-700 tabular-nums">{formatCurrency(s.raisedTotal)}</b> raised, awaiting the client</span>
            )}
          </div>
        )}
        <div className="ml-auto flex gap-2">
          {!none && onExport && <Button size="sm" icon={FileText} onClick={onExport}>Export ledger</Button>}
          <Button variant="primary" size="sm" icon={Plus} onClick={onNew}>New addition</Button>
        </div>
      </div>

      {none ? (
        <EmptyState
          icon={Layers}
          title="Nothing added since the BOQ was frozen"
          text={<>The contract stands at {formatCurrency(contractedExGst)}. Anything the client asks for from here is raised as a supplementary invoice and shows here and in the project's Money.</>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. scope creep */}
          <Panel
            as="h3"
            icon={Gauge}
            title="Scope creep"
            blurb="Additions against the signed contract"
            foot={<>{s.authorisedCreepPct.toFixed(1)}% settled · {(s.creepPct - s.authorisedCreepPct).toFixed(1)}% still with the client.</>}
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
          </Panel>

          {/* 2. margin on the extra work */}
          <Panel
            as="h3"
            icon={TrendingDown}
            title="Margin on additions"
            blurb="Each addition against this contract's own margin"
            foot={s.thinCount > 0
              ? <><b className="font-semibold text-slate-700">{s.thinCount} of {s.margins.length}</b> priced thinner than the job {s.thinCount === 1 ? "it is" : "they are"} being added to. Extra work is where margin quietly leaks.</>
              : <>Nothing is priced below the contract's own margin.</>}
          >
            {s.blendedMarginPct == null ? (
              <p className="text-xs text-slate-500">No priced additions to measure.</p>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-black leading-none tabular-nums ${s.thinCount > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                    {s.blendedMarginPct.toFixed(1)}%
                  </span>
                  {baseMarginPct != null && <span className="text-xs text-slate-500">vs {baseMarginPct.toFixed(1)}% base</span>}
                </div>
                {/* Each addition against the contract's own margin, so "thin"
                    means thin for THIS job rather than against a number
                    picked out of the air. */}
                <div className="mt-3 space-y-1.5">
                  {s.margins.slice(0, 4).map((m) => (
                    <div key={m.ref} className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 w-14 shrink-0">{m.ref}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, Math.min(100, (m.pct / Math.max(40, baseMarginPct || 40)) * 100))}%`,
                            background: m.thinnerThanBase ? RISK : GOOD,
                          }}
                        />
                      </div>
                      <span className={`text-[11px] font-semibold tabular-nums w-10 text-right shrink-0 ${m.thinnerThanBase ? 'text-rose-700' : 'text-slate-800'}`}>
                        {m.pct.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          {/* 3. rate drift */}
          <Panel
            as="h3"
            icon={s.drift.length > 0 ? AlertTriangle : Info}
            title="Rate drift"
            blurb="Additions priced against today's rate bank"
            foot={s.driftComparable === 0
              ? <>None of the {s.driftTotalLines} {s.driftTotalLines === 1 ? "line" : "lines"} is linked to a rate-bank item, so there is nothing to compare against. Pick items from the bank rather than typing them to make this measurable.</>
              : <>{s.driftComparable} of {s.driftTotalLines} lines could be checked against today's rates.</>}
          >
            {s.driftComparable === 0 ? (
              <p className="text-xs text-slate-500">Not measurable on these additions.</p>
            ) : s.drift.length === 0 ? (
              <>
                <span className="text-2xl font-black leading-none text-emerald-700">None</span>
                <p className="mt-1.5 text-xs text-slate-500">Every checked line still matches the rate bank.</p>
              </>
            ) : (
              <>
                <span className="text-2xl font-black leading-none tabular-nums text-amber-700">{formatCurrency(s.driftExposure)}</span>
                <p className="mt-1 text-xs text-slate-500">under-priced against today's rates</p>
                <div className="mt-3 space-y-1.5">
                  {s.drift.slice(0, 3).map((d, i) => (
                    <div key={`${d.ref}-${i}`} className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-slate-600 truncate">{d.description}</span>
                      <span className="text-[11px] font-semibold tabular-nums shrink-0 text-amber-700">+{d.gapPct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
};

export default ScopeAdditionsHeader;
