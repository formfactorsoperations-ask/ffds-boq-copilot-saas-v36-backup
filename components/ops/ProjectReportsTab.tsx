import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Wallet, Ruler, Percent, FileCheck,
  Compass, AlertTriangle, Lock, ShieldCheck, ArrowRight, Activity,
  PieChart, Users, GitCompare, Clock,
} from '@/lib/lucide-shim';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db as fsDb } from '../../services/firebaseClient';
import { useOrg } from '../../contexts/OrgContext';
import { useProjectJourney } from '../../hooks/useProjectJourney';
import { useMomScopeQueue } from '../../hooks/useMomScopeQueue';
import { computeSchedule as computePayments } from '../../lib/paymentSchedule';
import { costModel, activityItems, shortDate } from '../../lib/projectHome';
import { boqRevisionInsight, timeSpent } from '../../lib/boqRevisionInsight';
import { STAGE_LABELS } from '../../constants/journeyConstants';
import { UiProvider } from '../projectHome/bits';
import { CostPanel, ActivityPanel, marginLineFor } from '../projectHome/InsightsCard';
import ProjectPnlCard from './ProjectPnlCard';
import { SiteVisitLogModal } from '../SiteVisitLogModal';
import SiteVisitHistory from '../../pages/SiteVisitHistory';
import { Chip, StateDot, EmptyState } from '../ui/kit';
import { FullProjectData, ProjectContext, FullBoqItem, PurchaseOrder, Item } from '../../types';
import { db } from '../../services/dbService';
import { formatINR } from '../../lib/utils';
import { calculateProjectFinancials } from '../../lib/financialsUtils';
import { buildProjectPnl, marginAssumption } from '../../lib/projectPnl';
import { buildProjectRisk, RISK_TONE } from '../../lib/projectRisk';
import { Gauge, MarginWaterfall, CostSpine, RoomMarginChart, CollectionBar } from './ReportCharts';
import DocumentMeter from './DocumentMeter';
import { Panel as KitPanel } from '../ui/kit';
import { useFiguresHidden, MarginsHidden, Masked } from '../ui/HideFigures';
import { buildDocumentCompleteness } from '../../lib/documentCompleteness';
import { engagementOf, isFeeOnly } from '../../lib/engagement';

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
  /** For the margin to assume when the BOQ carries no costs (lib/projectPnl marginAssumption). */
  tiers?: any[];
  bank?: Item[];
}

/* Same shell as the Project P&L card: 24px radius, gold hairline, milky-white
   header. The two are read side by side, so they should look like one family. */
/* The kit's Panel (components/ui/kit). This screen had a card of its own: a gold rule, an upper-case title, a cream header. */
const Panel: React.FC<{ title: string; sub?: string; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }> =
({ title, sub, icon, children, right }) => (
  <KitPanel
    chip={icon ? <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0">{icon}</span> : undefined}
    title={title} blurb={sub} aside={right} className="h-full">
    {children}
  </KitPanel>
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
  projectContext, boq, projectId, activeTier, allProjects, currentUserRole = 'Admin', setActiveTab, tiers, bank,
}) => {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { orgData } = useOrg();
  const studioId: string | null = (orgData as any)?.tenantId || null;
  const journeyCtx = useProjectJourney(projectId || undefined, projectContext);
  const momQueue = useMomScopeQueue(studioId, projectId);

  /* Meetings and site visits, as the Hub reads them (components/projectHome/ProjectHome). */
  const [visits, setVisits] = useState<any[]>([]);
  useEffect(() => {
    if (!fsDb || !projectId || !studioId) { setVisits([]); return; }
    // Its own error path: an unhandled one stalls Firestore's queue for the whole page.
    return onSnapshot(query(collection(fsDb, `organizations/${studioId}/projects/${projectId}/siteVisits`), orderBy('date', 'desc')),
      snap => setVisits(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setVisits([]));
  }, [projectId, studioId]);
  const [logOpen, setLogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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
    () => buildProjectPnl(projectContext, boq, pos, activeTier, projectContext?.procurementModes || {}, marginAssumption(projectContext, tiers, bank)),
    [projectContext, boq, pos, activeTier, tiers, bank],
  );
  /* Hide figures (lib/figuresPrivacy): value, collections and progress stay; margin and cost go. */
  const marginsHidden = useFiguresHidden();
  const risk = useMemo(() => {
    const r = buildProjectRisk(projectContext, pnl);
    if (!marginsHidden) return r;
    const veil = (x: any) => (x.id === 'margin-erosion' ? { ...x, detail: 'Hidden while figures are hidden.' } : x);
    return { ...r, signals: r.signals.map(veil), active: r.active.map(veil) };
  }, [projectContext, pnl, marginsHidden]);
  const docs = useMemo(() => buildDocumentCompleteness(projectContext), [projectContext]);

  /* From the Hub: Cost & margin (cost by trade and room, the full P&L) and Activity. */
  const ctxAny: any = projectContext || {};
  const cost = useMemo(() => costModel(boq, ctxAny.rooms || []), [boq, ctxAny.rooms]);
  const assumption = useMemo(() => marginAssumption(projectContext, tiers, bank), [projectContext, tiers, bank]);
  const paidAmounts = useMemo(() => {
    try {
      const r = computePayments({ context: ctxAny, tierSummary: activeTier?.summary });
      return new Map((r?.amounts || []).filter((a: any) => a.status === 'paid').map((a: any) => [a.id, a.invoiceTotal] as [string, number]));
    } catch { return new Map<string, number>(); }
  }, [ctxAny, activeTier]);
  const activity = useMemo(() => activityItems({
    visits, milestones: ctxAny.paymentMilestones || [], paidAmounts, decisions: ctxAny.projectDecisions || [], steps: journeyCtx.steps as any,
  }), [visits, ctxAny.paymentMilestones, paidAmounts, ctxAny.projectDecisions, journeyCtx.steps]);
  const time = useMemo(() => timeSpent(visits), [visits]);
  const revisions = useMemo(
    () => boqRevisionInsight(projectContext, tiers, activeTier?.id, momQueue.items.length),
    [projectContext, tiers, activeTier, momQueue.items.length],
  );
  const stageNum = typeof ctxAny.lifecycle?.stage === 'number' ? ctxAny.lifecycle.stage : 1;

  /* Same formulas as StudioReports, one project deep. */
  const contracted    = fin.currentProjectValue || 0;
  const collected     = fin.totalPaid || 0;
  const area          = projectContext?.area || 0;
  const ratePerSqft   = area > 0 ? contracted / area : 0;
  const collectionPct = contracted > 0 ? Math.min(100, Math.round((collected / contracted) * 100)) : 0;

  /* A design-only project: its revenue is the fee and it has no bought cost (lib/engagement.ts). */
  const feeOnly = isFeeOnly(engagementOf(projectContext));
  const designMilestones = (projectContext?.paymentMilestones || []).filter((m: any) => m?.type === 'design');
  const designMilestonesPaid = designMilestones.filter((m: any) => m.status === 'paid').length;
  const designMilestonesInvoiced = designMilestones.filter((m: any) => m.status === 'invoiced').length;

  const studioMarginPct = useMemo(() => {
    const MONEY = ['won', 'execution', 'work_paused', 'completed'];
    /* Turnkey work only: a design-only fee has no BOQ cost to measure against. */
    const rows = (allProjects || []).filter(p => MONEY.includes(p.context?.status || '') && !isFeeOnly(engagementOf(p.context)));
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
        {/*
          Design only: the margin is the fee less what was actually bought for
          the job (outsourced renders, a consultant), never an old BOQ's cost:
          read against one it showed -634% on Pali Hills.
        */}
        <Panel
          title="Margin"
          sub={feeOnly
            ? (pnl.hasProcurement ? 'The design fee less what was bought for the job' : 'The design fee: nothing bought for the job yet')
            : (pnl.hasProcurement ? 'Actual: against orders and vendor bills' : 'Potential: from the BOQ margin')}
          icon={<Percent className="w-4 h-4" />}
        >
          {marginsHidden ? <MarginsHidden /> : (<>
          <div className="flex items-center gap-5">
            <Gauge
              pct={Math.max(0, marginPct)}
              label={`${marginPct.toFixed(1)}%`}
              sub={pnl.hasProcurement ? 'actual' : 'potential'}
              tone={marginPct < 0 ? 'rose' : marginPct < 15 ? 'amber' : 'green'}
              size={116}
            />
            <div className="flex-1 min-w-0 space-y-3">
              <Stat label="Margin" value={formatINR(marginValue)} tone={marginValue < 0 ? 'text-rose-700' : 'text-slate-900'} />
              {vsStudio != null && !feeOnly && (
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
            {feeOnly ? (
              <Stat label="Bought for the job" value={formatINR(pnl.effectiveCost)} foot={pnl.poCount ? `${pnl.poCount} purchase order${pnl.poCount === 1 ? '' : 's'}` : 'no purchase orders'} />
            ) : (
              <Stat label="Execution work" value={formatINR(pnl.hasProcurement ? pnl.executionMarginCurrent : pnl.executionMarginQuoted)} foot="sell less cost" />
            )}
            <Stat label="Design fee" value={formatINR(pnl.contractedDesign)} foot={feeOnly ? 'ex-GST' : 'no cost against it'} tone="text-emerald-700" />
          </div>
          {feeOnly && (
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">The studio's own design time is not costed here, and the client pays the contractors directly.</p>
          )}
          </>)}
        </Panel>

        {feeOnly ? (
          <Panel title="Design fee" sub="Stages billed and paid" icon={<Activity className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Design fee" value={formatINR(pnl.contractedDesign)} foot="ex-GST" tone="text-emerald-700" />
              <Stat label="Fee stages paid" value={`${designMilestonesPaid} / ${designMilestones.length}`} foot={designMilestonesInvoiced ? `${designMilestonesInvoiced} invoiced, awaiting payment` : 'none awaiting payment'} />
              <Stat label="Collected" value={formatINR(collected)} foot={(projectContext as any)?.financials?.designGstEnabled === false ? 'no GST on this fee' : 'incl. GST'} />
              <Stat label="Still to collect" value={formatINR(pnl.uncollected)} foot={(projectContext as any)?.financials?.designGstEnabled === false ? 'no GST on this fee' : 'incl. GST'} tone={pnl.uncollected > 0 ? 'text-slate-900' : 'text-emerald-700'} />
            </div>
          </Panel>
        ) : (
        <Panel title="Cost" sub={`${pnl.poCount} purchase order${pnl.poCount === 1 ? '' : 's'} raised`} icon={<Activity className="w-4 h-4" />}>
          {marginsHidden ? <MarginsHidden what="Costs" /> : (<>
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
          </>)}
        </Panel>
        )}

        <Panel title="Collections" sub={`${collectionPct}% of contract in hand`} icon={<Wallet className="w-4 h-4" />}>
          <CollectionBar
            collected={collected}
            invoiced={pnl.awaitingPayment}
            contracted={contracted}
            fmt={formatINR}
          />
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
            <Stat label="Contract value" value={formatINR(contracted)} foot={feeOnly && (projectContext as any)?.financials?.designGstEnabled === false ? 'no GST on this fee' : 'incl. GST'} />
            <Stat
              label="Net in hand"
              value={feeOnly ? formatINR(pnl.cashPosition) : <Masked>{formatINR(pnl.cashPosition)}</Masked>}
              foot={feeOnly ? 'the design fee collected so far' : 'collected less paid to vendors'}
              tone={pnl.cashPosition < 0 ? 'text-rose-700' : 'text-emerald-700'}
            />
          </div>
        </Panel>
      </div>

      {/* ── Cost & margin, as on the Hub ─────────────────────────────────── */}
      {!feeOnly && (
        <Panel title="Where the cost goes" sub="By trade and by room, from the BOQ, with the full P&L" icon={<PieChart className="w-4 h-4" />}>
          {marginsHidden ? <MarginsHidden what="Costs" /> : (
            <div className="ph ph-embed">
              <UiProvider>
                <CostPanel
                  cost={cost}
                  marginLine={marginLineFor(pnl)}
                  pnlCard={<ProjectPnlCard projectContext={projectContext} boq={boq} projectId={projectId} activeTier={activeTier}
                    assumption={assumption} currentUserRole={currentUserRole} onOpenProcurement={() => setActiveTab?.('materials')} />}
                />
              </UiProvider>
            </div>
          )}
        </Panel>
      )}

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
              : `${docs.completeCount} of ${docs.dueCount} signed off by the client`}
            icon={<FileCheck className="w-4 h-4" />}
          >
            <DocumentMeter report={docs} variant="panel" />
          </Panel>
        </div>

        {!feeOnly && (
        <div className="lg:col-span-3">
          <Panel title="Margin by room" sub="Where the money is made and lost" icon={<Ruler className="w-4 h-4" />}>
            {marginsHidden ? <MarginsHidden /> : pnl.rooms.filter(r => r.quotedSell > 0).length > 0 ? (
              <RoomMarginChart rooms={pnl.rooms.filter(r => r.quotedSell > 0)} />
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">
                Room margins appear once the BOQ has priced items assigned to rooms.
              </p>
            )}
          </Panel>
        </div>
        )}
      </div>

      {/* ── BOQ revisions and time with the client ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel
          title="BOQ revisions"
          sub={revisions.toDo === 0
            ? 'Nothing left to revise'
            : `${revisions.toDo} to be done: ${revisions.withStudio + revisions.queued} with the studio, ${revisions.withClient} with the client`}
          icon={<GitCompare className="w-4 h-4" />}
          right={setActiveTab ? (
            <button onClick={() => setActiveTab('revision-studio')} className="text-[12px] font-bold text-[#3D52A0] hover:text-[#334486] inline-flex items-center gap-1">
              Open revisions <ArrowRight className="w-3 h-3" />
            </button>
          ) : undefined}
        >
          <div className="grid grid-cols-3 gap-4">
            <Stat label="To be done" value={revisions.toDo} tone={revisions.toDo > 0 ? 'text-amber-700' : 'text-emerald-700'}
              foot={revisions.queued ? `incl. ${revisions.queued} item${revisions.queued === 1 ? '' : 's'} from meetings` : 'open scope revisions'} />
            <Stat label="Applied" value={revisions.applied} foot="scope revisions in the BOQ" />
            <Stat label="Before signing" value={revisions.preSignRevisions}
              foot={revisions.optionName ? `revised versions of ${revisions.optionName}` : 'revised versions of the option'} />
          </div>

          {(revisions.open.length > 0 || revisions.queued > 0) && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
              {revisions.open.map(r => (
                <div key={r.id} className="flex items-center gap-2.5">
                  <StateDot tone={r.holder === 'client' ? 'slate' : r.state === 'sent-back' || r.state === 'reworking' ? 'bad' : 'warn'} />
                  <p className="text-[13px] font-semibold text-slate-700 shrink-0">Revision {r.number}</p>
                  <p className="text-[12px] text-slate-500 min-w-0 truncate flex-1">{r.label}</p>
                  <Chip tone={r.holder === 'client' ? 'slate' : 'warn'}>{r.holder === 'client' ? 'Client' : 'Studio'}</Chip>
                </div>
              ))}
              {revisions.queued > 0 && (
                <div className="flex items-center gap-2.5">
                  <StateDot tone="warn" />
                  <p className="text-[13px] font-semibold text-slate-700 shrink-0">From meetings</p>
                  <p className="text-[12px] text-slate-500 min-w-0 truncate flex-1">
                    {revisions.queued} cost or scope item{revisions.queued === 1 ? '' : 's'} waiting to go into a revision
                  </p>
                  <Chip tone="warn">Studio</Chip>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Why lines changed</p>
            {revisions.ledger.total === 0 ? (
              <p className="text-[12px] text-slate-400 mt-1.5">No line changes recorded in the BOQ yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {revisions.ledger.byReason.map(r => (
                  <Chip key={r.reason} tone={/client/i.test(r.reason) ? 'brand' : 'slate'}>{r.reason} · {r.count}</Chip>
                ))}
              </div>
            )}
            {revisions.sentBackTimes > 0 && (
              <p className="text-[11px] text-slate-500 mt-2">
                The client has sent a version back for changes {revisions.sentBackTimes} time{revisions.sentBackTimes === 1 ? '' : 's'}.
              </p>
            )}
          </div>
        </Panel>

        <Panel
          title="Meetings and hours"
          sub={time.lastAt ? `Last meeting or site visit: ${shortDate(time.lastAt)}` : 'No meetings or site visits logged yet'}
          icon={<Users className="w-4 h-4" />}
        >
          {time.meetings + time.siteVisits === 0 ? (
            <EmptyState icon={Clock} title="Nothing logged yet"
              text="Meetings and site visits logged with Record on the Hub are counted here, with their hours." />
          ) : (<>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Meetings" value={time.meetings}
                foot={`${time.inPerson} in person · ${time.online} online`} />
              <Stat label="Meeting hours" value={`${time.meetingHours} h`}
                foot={time.avgMeetingMinutes != null ? `about ${time.avgMeetingMinutes} min a meeting` : 'no durations logged'} />
              <Stat label="Total hours" value={`${time.totalHours} h`} foot="meetings and site visits" tone="text-[#3D52A0]" />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
              <Stat label="Site visits" value={time.siteVisits} foot={`${time.siteHours} h on site`} />
              <Stat label="Last 30 days" value={time.last30} foot="meetings and site visits" />
              <Stat label="Decisions" value={(ctxAny.projectDecisions || []).length} foot="raised on the project" />
            </div>
            {time.meetingsWithoutTime > 0 && (
              <p className="text-[11px] text-slate-500 mt-3">
                {time.meetingsWithoutTime} meeting{time.meetingsWithoutTime === 1 ? ' has' : 's have'} no duration logged, so the hours are short by {time.meetingsWithoutTime === 1 ? 'it' : 'them'}.
              </p>
            )}
          </>)}
        </Panel>
      </div>

      {/* ── Activity, as on the Hub ──────────────────────────────────────── */}
      <Panel title="Activity" sub="The last eight weeks: meetings, site visits, payments, decisions and Ops Matrix steps" icon={<Activity className="w-4 h-4" />}>
        <div className="ph ph-embed">
          <UiProvider>
            <ActivityPanel
              activity={activity}
              activitySummary={time.lastAt ? `Last meeting or site visit: ${shortDate(time.lastAt)}.` : 'No meetings or site visits logged yet.'}
              activityStats={{ meetings: time.meetings, sites: time.siteVisits, hours: time.meetingHours, decisions: (ctxAny.projectDecisions || []).length, received: collected }}
              openHistory={() => setHistoryOpen(true)}
              onPlanCheckIn={() => setLogOpen(true)}
            />
          </UiProvider>
        </div>
      </Panel>

      <p className="text-[10.5px] text-slate-400 leading-relaxed">
        {feeOnly
          ? 'Contract value and collections include GST; the design fee is shown ex-GST. Realized rate and collection percentage use the same formulas as the studio-wide report, so the two screens agree.'
          : 'Contract value and collections include GST. Margin is ex-GST and includes the design fee, which carries no cost. Realized rate and collection percentage use the same formulas as the studio-wide report, so the two screens agree.'}
      </p>

      {projectId && studioId && (
        <SiteVisitLogModal
          isOpen={logOpen}
          onClose={() => setLogOpen(false)}
          projectId={projectId}
          studioId={studioId}
          defaultType="client_meeting"
          projectContext={projectContext}
          currentPhaseStep={stageNum}
          currentPhaseTitle={STAGE_LABELS[stageNum] || 'Agreement & Design'}
        />
      )}
      {historyOpen && projectId && studioId && (
        <SiteVisitHistory projectId={projectId} studioId={studioId} onClose={() => setHistoryOpen(false)} projectContext={projectContext} />
      )}
    </motion.div>
  );
};

export default ProjectReportsTab;
