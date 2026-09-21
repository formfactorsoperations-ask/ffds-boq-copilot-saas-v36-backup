import React from "react";
import { formatCompactINR } from "../../lib/utils";
import { COST_TYPE_LABEL } from "../../lib/studioMemory";
import { LiveObservationResult } from "../../lib/liveObservations";
import { HudDial, HudRings, HudDonut, HudTrace } from "./HudCharts";
import { Database, Radio, Info } from "lucide-react";

/**
 * STUDIO MEMORY, AS INSTRUMENTS.
 *
 * Four flat number cards became four readings. The substance is unchanged --
 * the same blended margin, cost mix, vendor concentration and spend rhythm the
 * memory library already computed -- but a ratio belongs on a dial and a
 * composition belongs on rings, where they can be compared at a glance instead
 * of read one at a time.
 *
 * Above them, the provenance strip. The page used to be a frozen Zoho Books
 * export presented without qualification; it now merges live purchase-order
 * data from procurement, so every figure below is part history and part what
 * this OS has tracked itself. The strip says the mix outright, because a
 * benchmark whose basis is quietly shifting underneath you is worse than one
 * that is simply old.
 */

const BRAND = "#3D52A0";
const INK = "#0A1B33";
const GOOD = "#0F766E";
const WARN = "#B45309";
const RISK = "#B4436A";

/* Cost types keep one colour each across every instrument on the page. */
const COST_COLOR: Record<string, string> = {
  subcontract: BRAND,
  material: GOOD,
  labour: WARN,
  uncategorised: "#94A3B8",
};

const VENDOR_COLORS = [BRAND, GOOD, WARN, "#5C6FC0", "#7C8AC9", "#CBD5E1"];

interface Props {
  data: {
    blended: any;
    mix: any;
    vendors: any[];
    conc: any[];
    monthlySpend: any;
    adminProfile: any;
  };
  live: LiveObservationResult & { loading: boolean };
  seedSource: string;
}

const StudioMemoryInstruments: React.FC<Props> = ({ data, live, seedSource }) => {
  const { blended, mix, vendors, monthlySpend, adminProfile } = data;

  const liveRates = live.observations.filter((o) => o.type === "rate_actual").length;
  const liveMargins = live.marginsMeasured;

  const mixParts = mix
    ? ([
        { key: "subcontract", pct: mix.subcontractPct, value: mix.subcontract },
        { key: "material", pct: mix.materialPct, value: mix.material },
        { key: "labour", pct: mix.labourPct, value: mix.labour },
      ]
        .filter((p) => p.pct > 0)
        .map((p) => ({
          label: COST_TYPE_LABEL[p.key as keyof typeof COST_TYPE_LABEL] || p.key,
          pct: p.pct,
          value: formatCompactINR(p.value),
          color: COST_COLOR[p.key],
        })))
    : [];

  /* Top five vendors plus a remainder, so the ring always sums to all spend
     and "everyone else" is visible rather than cropped off. */
  const topVendors = (vendors || []).slice(0, 5);
  const restShare = Math.max(0, 100 - topVendors.reduce((s, v) => s + (v.sharePct || 0), 0));
  const vendorParts = [
    ...topVendors.map((v, i) => ({ label: v.vendorName, value: v.sharePct || 0, color: VENDOR_COLORS[i] })),
    ...(restShare > 0.5 ? [{ label: "Everyone else", value: restShare, color: "#E2E8F0" }] : []),
  ];
  const topThreeShare = topVendors.slice(0, 3).reduce((s, v) => s + (v.sharePct || 0), 0);

  return (
    <div className="space-y-4">
      {/* ── where these numbers come from ───────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 shrink-0 text-slate-400" strokeWidth={2.3} />
            <span className="text-[11.5px] text-slate-500">
              <strong className="font-semibold" style={{ color: INK }}>
                {blended?.n || 0} historical {blended?.n === 1 ? "project" : "projects"}
              </strong>{" "}
              · {seedSource}
            </span>
          </span>

          <span className="flex items-center gap-1.5">
            <Radio
              className="w-3.5 h-3.5 shrink-0"
              strokeWidth={2.3}
              style={{ color: liveRates > 0 ? GOOD : "#94A3B8" }}
            />
            <span className="text-[11.5px] text-slate-500">
              {liveRates > 0 ? (
                <>
                  <strong className="font-semibold" style={{ color: INK }}>
                    {liveRates} live {liveRates === 1 ? "entry" : "entries"}
                  </strong>{" "}
                  from {live.projectsWithProcurement}{" "}
                  {live.projectsWithProcurement === 1 ? "project" : "projects"} in procurement
                  {liveMargins > 0 && <>, {liveMargins} with a realised margin</>}
                </>
              ) : (
                <>No live procurement data yet — every figure below is history</>
              )}
            </span>
          </span>
        </div>

        {/* The mechanism, stated once, so it is obvious what makes this page
            move rather than leaving it looking permanently frozen. */}
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-start gap-1.5">
          <Info className="w-3 h-3 shrink-0 text-slate-400 mt-[2px]" strokeWidth={2.4} />
          <p className="text-[11px] leading-[1.55] text-slate-500">
            Every purchase order raised under a project's Procurement tab feeds these benchmarks —
            each line becomes a recorded rate, and a completed project with billed orders becomes a
            realised margin.
            {live.marginsUnmeasurable > 0 && (
              <>
                {" "}
                {live.marginsUnmeasurable} completed{" "}
                {live.marginsUnmeasurable === 1 ? "project has" : "projects have"} no purchase orders, so
                their true cost cannot be measured and they are left out rather than counted at zero cost.
              </>
            )}
          </p>
        </div>
      </div>

      {/* ── the instruments ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Blended margin */}
        <div className="cc-scene">
          <div className="cc-panel rp-panel rp-frame rounded-3xl border border-slate-200/80 bg-white px-4 pt-5 pb-4 flex flex-col items-center">
            <HudDial
              value={blended?.marginPct || 0}
              max={50}
              readout={`${(blended?.marginPct || 0).toFixed(1)}%`}
              label="Blended margin"
              sub={blended ? `on ${formatCompactINR(blended.revenue)}` : undefined}
              color={(blended?.marginPct || 0) < 20 ? RISK : GOOD}
            />
            <p className="mt-2 text-[11px] text-center text-slate-500 leading-[1.5]">
              {blended
                ? `Best ${blended.best.marginPct.toFixed(0)}%, worst ${blended.worst.marginPct.toFixed(0)}% across ${blended.n} jobs.`
                : "No completed project has both revenue and recorded cost yet."}
            </p>
          </div>
        </div>

        {/* Cost mix */}
        <div className="cc-scene">
          <div className="cc-panel rp-panel rp-frame rounded-3xl border border-slate-200/80 bg-white px-4 pt-5 pb-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 text-center">
              Where the money goes
            </p>
            {mixParts.length > 0 ? (
              <HudRings parts={mixParts} size={124} />
            ) : (
              <p className="py-6 text-[12px] text-center text-slate-400">No categorised spend recorded.</p>
            )}
          </div>
        </div>

        {/* Vendor concentration */}
        <div className="cc-scene">
          <div className="cc-panel rp-panel rp-frame rounded-3xl border border-slate-200/80 bg-white px-4 pt-5 pb-4 flex flex-col items-center">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 text-center">
              Vendor concentration
            </p>
            {vendorParts.length > 0 ? (
              <>
                <HudDonut
                  parts={vendorParts}
                  size={134}
                  markAt={55}
                  centre={
                    <>
                      <span className="text-[21px] font-semibold leading-none tabular-nums" style={{ color: INK }}>
                        {topThreeShare.toFixed(0)}%
                      </span>
                      <span className="mt-0.5 text-[9.5px] text-slate-400">top 3</span>
                    </>
                  }
                />
                <p className="mt-2.5 text-[11px] text-center text-slate-500 leading-[1.5]">
                  {topThreeShare >= 55
                    ? `Three vendors carry most of the spend. The dashed mark is 55%.`
                    : `Spread across ${(vendors || []).length} vendors. The dashed mark is 55%.`}
                </p>
              </>
            ) : (
              <p className="py-6 text-[12px] text-center text-slate-400">No vendor spend recorded.</p>
            )}
          </div>
        </div>

        {/* Spend rhythm */}
        <div className="cc-scene">
          <div className="cc-panel rp-panel rp-frame rounded-3xl border border-slate-200/80 bg-white px-4 pt-5 pb-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 text-center">
              Money out, by month
            </p>
            {monthlySpend?.months?.length ? (
              <>
                <HudTrace
                  points={monthlySpend.months.map((m: any) => ({ label: m.label, value: m.total }))}
                  color={BRAND}
                  height={92}
                  format={formatCompactINR}
                />
                <p className="mt-2 text-[11px] text-slate-500 leading-[1.5]">
                  Heaviest month ran{" "}
                  <strong className="font-semibold" style={{ color: monthlySpend.peakMultiple >= 3 ? WARN : INK }}>
                    {monthlySpend.peakMultiple.toFixed(1)}×
                  </strong>{" "}
                  a typical one
                  {adminProfile?.smallBills > 0 && (
                    <>, and {adminProfile.smallBills} bills sit under ₹10,000</>
                  )}
                  .
                </p>
              </>
            ) : (
              <p className="py-6 text-[12px] text-center text-slate-400">No dated spend recorded.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudioMemoryInstruments;
