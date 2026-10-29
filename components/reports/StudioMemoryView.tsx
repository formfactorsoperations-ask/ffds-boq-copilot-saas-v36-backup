import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { FullProjectData } from "../../types";
import { formatINR } from "../../lib/utils";
import StudioMemoryInstruments from "./StudioMemoryInstruments";
import { useLiveObservations } from "./useLiveObservations";
import { SEED_OBSERVATIONS, SEED_SOURCE } from "../../lib/studioSeed";
import {
  mergeObservations,
  directorFindings,
  blendedMargin,
  costMix,
  vendorRecords,
  concentration,
  spendByMonth,
  transactionProfile,
  COST_TYPE_LABEL
} from "../../lib/studioMemory";
import {
  Users,
  FileSpreadsheet,
  Brain,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";

/*
  Studio memory and benchmarks: the Zoho Books history merged with the
  purchase orders this OS has recorded since. Moved here unchanged from
  StudioReports when the owner's reports took over the rest of that screen.
*/
export default function StudioMemoryView({ projects }: { projects: FullProjectData[] }) {
  /*
    Derived on read rather than written to a collection: correct a purchase
    order and the benchmark corrects itself, with no second copy of the truth.
  */
  const live = useLiveObservations(projects);

  const memoryData = useMemo(() => {
    const obs = mergeObservations(SEED_OBSERVATIONS, live.observations);
    return {
      blended: blendedMargin(obs),
      mix: costMix(obs),
      vendors: vendorRecords(obs),
      conc: concentration(obs),
      findingsList: directorFindings(obs),
      monthlySpend: spendByMonth(obs),
      adminProfile: transactionProfile(obs)
    };
  }, [live.observations]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 18 } }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show">
        <div className="space-y-8">
          {/*
            The instrument row.

            Four flat number cards became four readings you can compare at a
            glance: margin against the studio's own history, the cost mix as
            concentric arcs, vendor concentration as a segmented ring, and the
            spend trace. The strip above them states how much of every figure is
            Zoho history and how much is work this OS has tracked itself.
          */}
          <motion.div variants={itemVariants}>
            <StudioMemoryInstruments
              data={memoryData}
              live={live}
              seedSource={SEED_SOURCE}
            />
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
    </motion.div>
  );
}
