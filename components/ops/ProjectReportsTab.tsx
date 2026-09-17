import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Wallet, Ruler, Percent, FileCheck,
  Compass, AlertTriangle, Lock, ShieldCheck, ArrowRight, Activity,
} from 'lucide-react';
import { FullProjectData, ProjectContext, FullBoqItem, PurchaseOrder } from '../../types';
import { db } from '../../services/dbService';
import { formatINR } from '../../lib/utils';
import { calculateProjectFinancials } from '../../lib/financialsUtils';
import { buildProjectPnl } from '../../lib/projectPnl';
import { buildProjectRisk, RISK_TONE } from '../../lib/projectRisk';
import { Gauge, MarginWaterfall, CostSpine, RoomMarginChart, CollectionBar } from './ReportCharts';
import DocumentMeter from './DocumentMeter';
import { buildDocumentCompleteness } from '../../lib/documentCompleteness';

/**
 * PROJECT REPORTS — the studio report, scoped to one job.
 *
 * KPIs use the SAME formulas as the studio-wide report, so a number means the
 * same thing on both screens:
 *
 *   Portfolio Valuation   -> Contract value
 *   Realized Inflows      -> Collected from this client
 *   Realized Rate         -> contract / sq ft          (identical)
 *   Collection Efficiency -> collected / contract      (identical)
 *   Portfolio Margin      -> this project's margin, ex-GST, incl. design fee
 *
 * Active Pipeline, Deal Win Rate and Client Accounts are portfolio questions
 * with no single-project meaning, so that space goes to what actually decides
 * whether one job succeeds: what is holding it up.
 */

interface Props {
  projectContext: ProjectContext;
  boq: FullBoqItem[];
  projectId: string | null;
  activeTier?: any;
  allProjects?: FullProjectData[];
  currentUserRole?: string;
  setActiveTab?: (tab: string) => void;
}

/* Same shell as the Project P&L card: 24px radius, gold hairline, milky-white
   header. The two are read side by side, so they should look like one family. */
const Panel: React.FC<{ title: string; sub?: string; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }> =
({ title, sub, icon, children, right }) => (
  <div className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm overflow-hidden relative">
    <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#B5945B]/30" />
    <div className="px-5 py-4 border-b border-slate-100 bg-[#FAF9F6]/40 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5">
        {icon && <div className="w-8 h-8 rounded-lg bg-white border border-[#B5945B]/25 flex items-center justify-center text-[#3D52A0]">{icon}</div>}
        <div>
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">{title}</h3>
          {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const Stat: React.FC<{ label: string; value: React.ReactNode; foot?: React.ReactNode; tone?: string }> =
({ label, value, foot, tone = 'text-slate-900' }) => (
  <div>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
    <p className={`text-xl font-extrabold tabular-nums mt-1 leading-none ${tone}`}>{value}</p>
    {foot && <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">{foot}</p>}
  </div>
);

const ProjectReportsTab: React.FC<Props> = ({
  projectContext, boq, projectId, activeTier, allProjects, currentUserRole = 'Admin', setActiveTab,
}) => {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!projectId) { setLoading(false); return; }
    db.getPurchaseOrders(projectId)
      .then(r => { if (alive) setPos(r || []); })
      .catch(() => { if (alive) setPos([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId]);

  const fin = useMemo(() => calculateProjectFinancials(projectContext, activeTier) as any, [projectContext, activeTier]);
  const pnl = useMemo(
    () => buildProjectPnl(projectContext, boq, pos, activeTier, projectContext?.procurementModes || {}),
    [projectContext, boq, pos, activeTier],
  );
  const risk = useMemo(() => buildProjectRisk(projectContext, pnl), [projectContext, pnl]);
  const docs = useMemo(() => buildDocumentCompleteness(projectContext), [projectContext]);

  /* Same formulas as StudioReports, one project deep. */
  const contracted    = fin.currentProjectValue || 0;
  const collected     = fin.totalPaid || 0;
  const area          = projectContext?.area || 0;
  const ratePerSqft   = area > 0 ? contracted / area : 0;
  const collectionPct = contracted > 0 ? Math.min(100, Math.round((collected / contracted) * 100)) : 0;

  const studioMarginPct = useMemo(() => {
    const MONEY = ['won', 'execution', 'work_paused', 'completed'];
    const rows = (allProjects || []).filter(p => MONEY.includes(p.context?.status || ''));
    let c = 0, m = 0;
    rows.forEach(p => {
      const tier = (p.tiers || []).find(t => t.id === (p.activeTierId || p.context?.approvedTierId)) || (p.tiers || [])[0];
      const f = calculateProjectFinancials(p.context, tier) as any;
      const cv = (f.taxableExecution || 0) + (f.taxableDesign || 0);
      if (cv > 0) { c += cv; m += cv - ((tier as any)?.summary?.totalCost || 0); }
    });
    return c > 0 ? (m / c) * 100 : null;
  }, [allProjects]);

  const marginPct   = pnl.hasProcurement ? pnl.currentMarginPct : pnl.quotedMarginPct;
  const marginValue = pnl.hasProcurement ? pnl.currentMargin : pnl.quotedMargin;
  const vsStudio    = studioMarginPct != null ? marginPct - studioMarginPct : null;
  const journey     = projectContext?.journeySummary;

  if (currentUserRole === 'Designer') {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm">
          <Lock className="w-10 h-10 text-[#B5945B] mx-auto mb-4 stroke-[1.5]" />
          <h2 className="text-xl font-light text-slate-800">Reports are owner-only</h2>
          <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
            Project value, margin and collection figures are hidden for Designer roles.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-20 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#3D52A0] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

      {/* ── What is holding this project up ──────────────────────────────── */}
      <Panel
        title="What is holding this project up"
        sub={risk.headline}
        icon={<ShieldCheck className="w-4 h-4" />}
        right={
          <Gauge
            pct={risk.score}
            label={String(Math.round(risk.score))}
            sub="risk score"
            tone={risk.score >= 50 ? 'rose' : risk.score >= 20 ? 'amber' : 'green'}
            size={84}
          />
        }
      >
        {risk.active.length === 0 ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <p className="text-[13px] font-bold text-slate-700">Nothing is blocking this job</p>
            </div>
            {/* Show the checks that passed. An all-clear panel that shows no
                working reads as a panel that never ran. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-1.5">
              {risk.signals.map(s => (
                <div key={s.id} className="flex items-start gap-2 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-[7px]" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-600 leading-snug">{s.check}</p>
                    <p className="text-[11px] text-slate-400 leading-snug">{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {risk.active.map(s => {
              const tone = RISK_TONE[s.level];
              return (
                <button
                  key={s.id}
                  onClick={() => s.route && setActiveTab?.(s.route)}
                  className={`text-left rounded-xl border p-3.5 transition-all hover:shadow-sm ${tone.bg} ${tone.border} ${s.route ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${tone.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-bold leading-snug ${tone.text}`}>{s.title}</p>
                      <p className="text-[11.5px] text-slate-600 mt-0.5 leading-snug">{s.detail}</p>
                      {s.action && s.route && (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold mt-1.5 ${tone.text}`}>
                          {s.action} <ArrowRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ── Money ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel title="Margin" sub={pnl.hasProcurement ? 'Against actual committed cost' : 'Expected, from the quote'} icon={<Percent className="w-4 h-4" />}>
          <div className="flex items-center gap-5">
            <Gauge
              pct={Math.max(0, marginPct)}
              label={`${marginPct.toFixed(1)}%`}
              sub={pnl.hasProcurement ? 'now' : 'quoted'}
              tone={marginPct < 0 ? 'rose' : marginPct < 15 ? 'amber' : 'green'}
              size={116}
            />
            <div className="flex-1 min-w-0 space-y-3">
              <Stat label="Margin" value={formatINR(marginValue)} tone={marginValue < 0 ? 'text-rose-700' : 'text-slate-900'} />
              {vsStudio != null && (
                <p className={`text-[11px] font-bold flex items-center gap-1 ${vsStudio < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {vsStudio < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                  {vsStudio >= 0 ? '+' : ''}{vsStudio.toFixed(1)} pts vs studio {studioMarginPct!.toFixed(1)}%
                </p>
              )}
            </div>
          </div>
          <div className="mt-4">
            <MarginWaterfall
              contracted={pnl.contractedTotal}
              cost={pnl.hasProcurement ? pnl.effectiveCost : pnl.plannedCost}
              margin={marginValue}
              fmt={formatINR}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
            <Stat label="Execution work" value={formatINR(pnl.hasProcurement ? pnl.executionMarginCurrent : pnl.executionMarginQuoted)} foot="sell less cost" />
            <Stat label="Design fee" value={formatINR(pnl.contractedDesign)} foot="no cost against it" tone="text-emerald-700" />
          </div>
        </Panel>

        <Panel title="Cost" sub={`${pnl.poCount} purchase order${pnl.poCount === 1 ? '' : 's'} raised`} icon={<Activity className="w-4 h-4" />}>
          <CostSpine
            planned={pnl.plannedCost}
            committed={pnl.committedCost}
            billed={pnl.billedCost}
            paid={pnl.paidCost}
            fmt={formatINR}
          />
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Stat
              label="Ordered so far"
              value={`${Math.round(pnl.coveragePct)}%`}
              foot="of planned cost committed. Below 100%, margin is still partly an estimate."
            />
          </div>
        </Panel>

        <Panel title="Collections" sub={`${collectionPct}% of contract in hand`} icon={<Wallet className="w-4 h-4" />}>
          <CollectionBar
            collected={collected}
            invoiced={pnl.awaitingPayment}
            contracted={contracted}
            fmt={formatINR}
          />
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
            <Stat label="Contract value" value={formatINR(contracted)} foot="incl. GST" />
            <Stat
              label="Net in hand"
              value={formatINR(pnl.cashPosition)}
              foot="collected less paid to vendors"
              tone={pnl.cashPosition < 0 ? 'text-rose-700' : 'text-emerald-700'}
            />
          </div>
        </Panel>
      </div>

      {/* ── Delivery ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel title="Progress" icon={<Compass className="w-4 h-4" />}>
          <div className="flex items-center gap-5">
            <Gauge
              pct={journey?.pct ?? 0}
              label={`${journey?.pct ?? 0}%`}
              sub="journey"
              tone="blue"
              size={104}
            />
            <div className="flex-1 space-y-3">
              <Stat label="Steps done" value={`${journey?.done ?? 0} / ${journey?.total ?? 34}`} />
              <Stat
                label="Realized rate"
                value={area > 0 ? `₹${Math.round(ratePerSqft).toLocaleString('en-IN')}` : '—'}
                foot={area > 0 ? `per sq ft · ${area.toLocaleString('en-IN')} sq ft` : 'area not captured'}
              />
            </div>
          </div>
        </Panel>

        {/* Paperwork is a delivery fact, not an afterthought: a job at 100%
            with an unsigned agreement is not actually finished. */}
        <div className="lg:col-span-2">
          <Panel
            title="Documents"
            sub={docs.dueCount === 0
              ? 'None due at this stage'
              : `${docs.completeCount} of ${docs.dueCount} signed`}
            icon={<FileCheck className="w-4 h-4" />}
          >
            <DocumentMeter report={docs} variant="panel" />
          </Panel>
        </div>

        <div className="lg:col-span-3">
          <Panel title="Margin by room" sub="Where the money is made and lost" icon={<Ruler className="w-4 h-4" />}>
            {pnl.rooms.filter(r => r.quotedSell > 0).length > 0 ? (
              <RoomMarginChart rooms={pnl.rooms.filter(r => r.quotedSell > 0)} />
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">
                Room margins appear once the BOQ has priced items assigned to rooms.
              </p>
            )}
          </Panel>
        </div>
      </div>

      <p className="text-[10.5px] text-slate-400 leading-relaxed">
        Contract value and collections include GST. Margin is ex-GST and includes the design fee, which
        carries no cost. Realized rate and collection percentage use the same formulas as the studio-wide
        report, so the two screens agree.
      </p>
    </motion.div>
  );
};

export default ProjectReportsTab;
