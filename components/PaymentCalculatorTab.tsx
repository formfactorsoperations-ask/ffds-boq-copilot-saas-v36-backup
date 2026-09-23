
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { showSuccessWithNext } from './SuccessWithNextToast';
import { calculateSellPrice } from "../lib/utils";
import { ProjectContext, ProposalTier, PaymentMilestone, FullProjectData, Item, FullBoqItem, PaymentStatus, ProjectDiscount, BoqItem, AIStrategy } from '../types';
import { formatCurrency, formatINR, id as generateId } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Coins, CheckCircle, TrendingUp, Info, AlertTriangle, Sparkles, Sliders, History, FileText, Lock } from 'lucide-react';
import Card from './shared/Card';
import { CalculatorIcon, ShieldCheckIcon, AlertIcon, CheckIcon, PencilIcon, ChevronDownIcon, ChevronUpIcon, DeleteIcon, PlusIcon, ScissorsIcon, ClockIcon, CalendarIcon } from './Icons';
import { useOrg } from '../contexts/OrgContext';
import { computeSchedule, outstandingInvoices, resolveFinancials, sameFinancials } from '../lib/paymentSchedule';
import { resolveDocumentState } from '../services/documentIssueEngine';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { FFDS_PAYMENT_STRUCTURE_DEFAULTS, getPaymentStructure, setPaymentStructure } from '../services/engagementService';
import MarginOptimizer from './MarginOptimizer';
import { CashFlowForecastDashboard } from './CashFlowForecastDashboard';
import Tabs from './ui/Tabs';
import AnimatedNumber from './ui/AnimatedNumber';
import { useStudioSettings } from '../hooks/useStudioSettings';
import { usePaymentRequests } from '../hooks/usePaymentRequests';
import { collections, billableNow, contractDrift, deriveDatesFromTimeline, paymentBehaviour, benchmarkOf, cashGap, CHASE_LABEL, DEFAULT_ESCALATION } from '../lib/moneyIntel';
import type { GapMonth } from '../lib/moneyIntel';
import DateField from './ui/DateField';
import { collection as fsCollection, getDocs as fsGetDocs } from 'firebase/firestore';
import { db as fsDb } from '../services/firebaseClient';
import { db as projectDb } from '../services/dbService';
import { useTimelinePhases } from '../hooks/useTimelinePhases';
import TermsAndPaymentTab from './studio/TermsAndPaymentTab';
import { useScopeAdditions } from './ops/useScopeAdditions';
import ScopeAdditionsMoneyPanel from './ops/ScopeAdditionsMoneyPanel';

interface PaymentCalculatorTabProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    activeTier?: ProposalTier;
    tiers?: ProposalTier[];
    allProjects: FullProjectData[];
    /** Needed to read this project's payment requests for the collections ladder. */
    projectId?: string;
    bank?: Item[];
    fullBoq?: FullBoqItem[];
    setBoq?: React.Dispatch<React.SetStateAction<BoqItem[]>>;
    aiStrategy?: AIStrategy;
}

const DEFAULT_MILESTONES: PaymentMilestone[] = [
    { id: 'd1', type: 'design', name: 'Design Advance 1', percentage: 20, description: 'Retainer', unlocks: 'Commencement of Discovery & Concept Phase' },
    { id: 'd2', type: 'design', name: 'Design Advance 2', percentage: 35, description: 'Layouts', unlocks: 'Commencement of Design & 3D Visuals' },
    { id: 'd3', type: 'design', name: 'Design Advance 3', percentage: 35, description: 'GFCs', unlocks: 'Technical Drawings & BOQ Planning' },
    { id: 'd4', type: 'design', name: 'Design Final Advance', percentage: 10, description: 'Closeout', unlocks: 'Final Design Handover & Approvals' },
    { id: 'e1', type: 'execution', name: 'Execution Advance 1', percentage: 10, description: 'Start', unlocks: 'Site Mobilization & Ordering' },
    { id: 'e2', type: 'execution', name: 'Execution Advance 2', percentage: 40, description: 'Structural', unlocks: 'Civil & Core Material Procurement' },
    { id: 'e3', type: 'execution', name: 'Execution Advance 3', percentage: 40, description: 'Finishing', unlocks: 'Carpentry, Painting & Finishes' },
    { id: 'e4', type: 'execution', name: 'Execution Final Advance', percentage: 10, description: 'Handover', unlocks: 'Handover Document & Keys', isHandoverAdvance: true },
];

/*
  Where the cash position stands, month by month.

  This was a diverging bar chart of money in against money committed out,
  and it could not work: on this book inflow runs to lakhs and vendor
  commitments to tens of thousands, so at any scale that fits the inflow the
  outflow is a one-pixel smear. Worse, the figure that answers the question —
  the running balance — was never drawn at all, only stated in a sentence
  underneath.

  So the line is the cumulative position and the zero axis is the thing it
  can cross. A real shortfall dives below the axis where it cannot be missed,
  and the month figures sit underneath as numbers, where small amounts stay
  legible instead of competing for pixels.

  Geometry is stretched to the panel width (preserveAspectRatio="none") with
  a non-scaling stroke, so the plot fills its card at any column width; every
  label is HTML underneath, which is why nothing distorts with it.
*/
const CashGapChart: React.FC<{ months: GapMonth[] }> = ({ months }) => {
    const H = 92;

    const compact = (n: number) => n >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr`
        : n >= 1e5 ? `${(n / 1e5).toFixed(2)}L`
        : `${Math.round(n / 1e3)}k`;
    // Full figures while they fit; compact once the columns get narrow.
    const cell = (n: number) => !n ? '—'
        : months.length <= 5 ? Math.round(n).toLocaleString('en-IN') : compact(n);

    const hi = Math.max(0, ...months.map(m => m.cumulative));
    const lo = Math.min(0, ...months.map(m => m.cumulative));
    const span = (hi - lo) || 1;
    const yOf = (v: number) => ((hi - v) / span) * 100;
    const zeroY = yOf(0);
    const dips = lo < 0;

    const pts: [number, number][] = months.length === 1
        ? [[8, yOf(months[0].cumulative)], [92, yOf(months[0].cumulative)]]
        : months.map((m, i) => [((i + 0.5) / months.length) * 100, yOf(m.cumulative)]);

    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const area = `${line} L${pts[pts.length - 1][0].toFixed(2)},${zeroY.toFixed(2)} L${pts[0][0].toFixed(2)},${zeroY.toFixed(2)} Z`;

    // The tightest the account gets — the number this panel exists to give you.
    const low = months.reduce((a, m) => (m.cumulative < a.cumulative ? m : a), months[0]);
    const lowIdx = months.indexOf(low);
    const lowPt = months.length === 1 ? [50, yOf(low.cumulative)] : [((lowIdx + 0.5) / months.length) * 100, yOf(low.cumulative)];

    const ink = dips ? '#C4574F' : '#3D52A0';

    return (
        <div className="mt-3">
            <div className="flex justify-end">
                <span className="text-[9px] text-[#ADBBDA] tabular-nums leading-none">₹{compact(hi)}</span>
            </div>

            <div className="relative mt-1" style={{ height: `${H}px` }}>
                <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full overflow-visible"
                    role="img"
                    aria-label={`Running cash position across ${months.length} months`}
                >
                    <defs>
                        <linearGradient id="gapFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={ink} stopOpacity="0.26" />
                            <stop offset="100%" stopColor={ink} stopOpacity="0.02" />
                        </linearGradient>
                    </defs>
                    <path d={area} fill="url(#gapFill)" />
                    <path
                        d={line}
                        fill="none"
                        stroke={ink}
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        pathLength={1}
                        className="mny-draw"
                    />
                </svg>

                {/* zero, in HTML so it spans the card and keeps a true 1px rule */}
                <div
                    className="absolute inset-x-0 border-t border-dashed"
                    style={{ top: `${zeroY}%`, borderColor: dips ? '#E8A6A0' : '#CBD1E4' }}
                />
                <span
                    className="absolute left-0 text-[9px] text-[#ADBBDA] leading-none"
                    style={{ top: `calc(${zeroY}% + 3px)` }}
                >₹0</span>

                {/* the low point, marked because it is the answer */}
                <span
                    className="absolute rounded-full"
                    style={{
                        left: `${lowPt[0]}%`, top: `${lowPt[1]}%`,
                        width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5,
                        background: '#fff', border: `2px solid ${ink}`,
                    }}
                    title={`Lowest: ${formatCurrency(low.cumulative)} in ${low.label}`}
                />
            </div>

            {/* the months, as numbers rather than pixels */}
            <div
                className="mt-2 grid gap-x-1 items-baseline"
                style={{ gridTemplateColumns: `26px repeat(${months.length}, minmax(0,1fr))` }}
            >
                <span />
                {months.map(m => (
                    <span key={m.key} className={`text-[9px] text-center truncate ${m.isPast ? 'text-[#C3CBE4]' : 'text-[#8E96B8]'}`}>
                        {m.label}
                    </span>
                ))}

                <span className="text-[9px] text-[#ADBBDA]">in</span>
                {months.map(m => (
                    <span key={m.key} className="text-[9px] text-center tabular-nums truncate text-[#3A416B] font-semibold">
                        {cell(m.inflow)}
                    </span>
                ))}

                <span className="text-[9px] text-[#ADBBDA]">out</span>
                {months.map(m => (
                    <span key={m.key} className={`text-[9px] text-center tabular-nums truncate font-semibold ${m.outflow ? 'text-[#C4574F]' : 'text-[#C3CBE4]'}`}>
                        {cell(m.outflow)}
                    </span>
                ))}
            </div>
        </div>
    );
};

/*
  One shell for the four Overview panels.

  They used to be four identical flat boxes with the same grey uppercase
  label, so nothing on the grid said which one needed attention — a project
  with two overdue requests looked exactly like a project with none. Each
  panel now carries its own state as a coloured rail and chip, and leads
  with the single figure that state is about.
*/
type PanelTone = 'clear' | 'watch' | 'alert';

const TONE: Record<PanelTone, { rail: string; chip: string; dot: string }> = {
    clear: { rail: '#CBD1E4', chip: 'bg-[#F6F7FB] text-[#5A628A] border-[#E2E5F0]', dot: 'bg-[#8E96B8]' },
    watch: { rail: '#D9A441', chip: 'bg-amber-50 text-amber-800 border-amber-200',  dot: 'bg-amber-500' },
    alert: { rail: '#C4574F', chip: 'bg-rose-50 text-rose-800 border-rose-200',     dot: 'bg-rose-600' },
};

const PANEL_CLASS = 'group/panel relative overflow-hidden text-left w-full bg-white border border-[#E2E5F0] rounded-2xl p-5 pl-6 mny-rise mny-card cursor-pointer';

const PanelHead: React.FC<{ title: string; state: string; tone: PanelTone; action: string }> = ({ title, state, tone, action }) => (
    <>
        <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: TONE[tone].rail }} />
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#5A628A] shrink-0">{title}</h3>
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full border px-1.5 py-0.5 min-w-0 ${TONE[tone].chip}`}>
                    <i className={`w-1.5 h-1.5 rounded-full not-italic shrink-0 ${TONE[tone].dot}`} />
                    <span className="truncate">{state}</span>
                </span>
            </div>
            <span className="text-[10px] font-semibold text-[#ADBBDA] group-hover/panel:text-[#3D52A0] transition-colors shrink-0">{action}</span>
        </div>
    </>
);

/** The one figure the panel is about, at a size you can read across the room. */
const PanelMetric: React.FC<{ value: string; caption: string; muted?: boolean }> = ({ value, caption, muted }) => (
    <div className="mt-3 flex items-baseline gap-2 flex-wrap">
        <span className={`text-[26px] leading-none font-black tabular-nums ${muted ? 'text-[#8E96B8]' : 'text-[#12182F]'}`}>{value}</span>
        <span className="text-[11px] text-[#8E96B8]">{caption}</span>
    </div>
);

const PaymentCalculatorTab: React.FC<PaymentCalculatorTabProps> = ({ projectContext, setProjectContext, activeTier, tiers = [], allProjects = [], bank = [], fullBoq = [], setBoq, aiStrategy = 'balanced', projectId }) => {
    // --- STATE ---
    const { orgData } = useOrg();
    /*
      Field by field, not all-or-nothing.

      This was `projectContext.financials || {defaults}`, which only fired when
      the whole object was missing. Four live projects stored a PARTIAL one, so
      `executionGstEnabled` came back undefined, was read as false, and the
      execution GST vanished from the contract without a word -- Runwal Eirene
      read 9,76,872 where it should have read 11,30,899. `taxLimitYearly`
      undefined put a literal "NaN% of limit" on the cash gauge.
    */
    const financials = resolveFinancials(projectContext.financials);

    const [localGstRate, setGstRate] = useState<number>(projectContext.gstRate || 18);
    const [localInitiationFee, setInitiationFee] = useState<number>(financials.initiationFeePaid);
    const [localBillablePercent, setBillablePercent] = useState<number>(financials.billablePercent);
    const [localExecutionGstEnabled, setExecutionGstEnabled] = useState<boolean>(financials.executionGstEnabled);
    const [localDesignGstEnabled, setDesignGstEnabled] = useState<boolean>(financials.designGstEnabled);
    const [localCashLimit, setCashLimit] = useState<number>(financials.taxLimitYearly);
    
    // Discounts
    const [localDiscounts, setDiscounts] = useState<ProjectDiscount[]>(financials.discounts || []);
    const [newDiscount, setNewDiscount] = useState<Partial<ProjectDiscount>>({
        name: '', value: 0, type: 'percentage', target: 'execution'
    });
    const [showDiscountForm, setShowDiscountForm] = useState(false);

    // Historical Snapshot & Tier Versioning
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

    const snapshots = financials.paymentSnapshots || [];

    // Unified list of all available proposal versions, approved snapshots, and live billing
    const availableVersions = useMemo(() => {
        const list: Array<{
            id: string;
            name: string;
            timestamp: number;
            lifecycleTag?: string;
            executionValue: number;
            designValue: number;
            milestones: PaymentMilestone[];
            billablePercent?: number;
            executionGstEnabled?: boolean;
            designGstEnabled?: boolean;
            isCurrentActive: boolean;
            isSnapshot: boolean;
        }> = [];

        // 1. Live Current Tier
        const liveExec = (activeTier?.summary?.totalSell !== undefined && activeTier?.summary?.totalSell > 0)
            ? activeTier.summary.totalSell
            : (financials.approvedExecutionValue ?? (activeTier?.summary?.totalRevenue || 0));
        const liveDesign = (activeTier?.summary?.designFee !== undefined && activeTier?.summary?.designFee > 0)
            ? activeTier.summary.designFee
            : (financials.approvedDesignValue ?? 0);
        list.push({
            id: activeTier?.id || 'live-current',
            name: activeTier?.name || 'Current Active Billing',
            timestamp: activeTier?.timestamp || Date.now(),
            lifecycleTag: activeTier?.lifecycleTag || (projectContext.approvedTierId === activeTier?.id ? 'Current contract' : 'Active'),
            executionValue: liveExec,
            designValue: liveDesign,
            milestones: projectContext.paymentMilestones || [],
            billablePercent: localBillablePercent,
            executionGstEnabled: localExecutionGstEnabled,
            designGstEnabled: localDesignGstEnabled,
            isCurrentActive: true,
            isSnapshot: false,
        });

        // 2. Other Tiers in Project (e.g. Superseded versions, Drafts, Copies)
        const allTiers = (tiers && tiers.length > 0) ? tiers : (projectContext.tiers || []);
        allTiers.forEach(t => {
            if (activeTier && t.id === activeTier.id) return; // already added as live
            const matchingSnapshot = snapshots.find(s => s.tierId === t.id);
            const tExec = matchingSnapshot?.approvedExecutionValue ?? (t.summary?.totalSell || t.summary?.totalRevenue || 0);
            const tDesign = matchingSnapshot?.approvedDesignValue ?? (t.summary?.designFee || 0);
            const tMilestones = (matchingSnapshot?.milestones && matchingSnapshot.milestones.length > 0)
                ? matchingSnapshot.milestones
                : (projectContext.paymentMilestones || []);

            list.push({
                id: t.id,
                name: t.name,
                timestamp: t.timestamp,
                lifecycleTag: t.lifecycleTag || 'Alternative Option',
                executionValue: tExec,
                designValue: tDesign,
                milestones: tMilestones,
                billablePercent: matchingSnapshot?.billablePercent,
                executionGstEnabled: matchingSnapshot?.executionGstEnabled,
                designGstEnabled: matchingSnapshot?.designGstEnabled,
                isCurrentActive: false,
                isSnapshot: !!matchingSnapshot,
            });
        });

        // 3. Standalone snapshots not matching any tier
        snapshots.forEach(s => {
            if (!list.some(item => item.id === s.tierId)) {
                list.push({
                    id: s.tierId,
                    name: s.tierName || 'Archived Snapshot',
                    timestamp: s.timestamp,
                    lifecycleTag: 'Archived Snapshot',
                    executionValue: s.approvedExecutionValue || 0,
                    designValue: s.approvedDesignValue || 0,
                    milestones: s.milestones || [],
                    billablePercent: s.billablePercent,
                    executionGstEnabled: s.executionGstEnabled,
                    designGstEnabled: s.designGstEnabled,
                    isCurrentActive: false,
                    isSnapshot: true,
                });
            }
        });

        return list;
    }, [activeTier, tiers, projectContext.tiers, projectContext.approvedTierId, projectContext.paymentMilestones, snapshots, financials.approvedExecutionValue, financials.approvedDesignValue, localBillablePercent, localExecutionGstEnabled]);

    const selectedHistoricalEntry = selectedSnapshotId ? availableVersions.find(v => v.id === selectedSnapshotId) : null;
    const activeSnapshot = selectedHistoricalEntry;
    const isReadOnlyMode = !!selectedHistoricalEntry && !selectedHistoricalEntry.isCurrentActive;

    // Derived active values
    const milestones = selectedHistoricalEntry ? selectedHistoricalEntry.milestones : (projectContext.paymentMilestones || []);
    const gstRate = localGstRate;
    const cashLimit = localCashLimit;

    const billablePercent = selectedHistoricalEntry && selectedHistoricalEntry.billablePercent !== undefined 
        ? selectedHistoricalEntry.billablePercent 
        : localBillablePercent;

    const executionGstEnabled = selectedHistoricalEntry && selectedHistoricalEntry.executionGstEnabled !== undefined 
        ? selectedHistoricalEntry.executionGstEnabled 
        : localExecutionGstEnabled;
        
        const designGstEnabled = selectedHistoricalEntry && selectedHistoricalEntry.designGstEnabled !== undefined
            ? selectedHistoricalEntry.designGstEnabled
            : localDesignGstEnabled;

    const initiationFee = isReadOnlyMode ? 0 : localInitiationFee;
    const discounts = isReadOnlyMode ? [] : localDiscounts;

    // Computed vitals for header bar
    const displayDesign = selectedHistoricalEntry
        ? selectedHistoricalEntry.designValue
        : ((activeTier?.summary?.designFee !== undefined && activeTier?.summary?.designFee > 0)
            ? activeTier.summary.designFee
            : (financials.approvedDesignValue || 0));

    const displayExec = selectedHistoricalEntry
        ? selectedHistoricalEntry.executionValue
        : ((activeTier?.summary?.totalSell !== undefined && activeTier?.summary?.totalSell > 0)
            ? activeTier.summary.totalSell
            : (financials.approvedExecutionValue || 0));

    usePageHeader({
        vitals: [
            { label: "DESIGN", value: formatINR(displayDesign) },
            { label: "EXECUTION", value: formatINR(displayExec) }
        ]
    }, [displayDesign, displayExec]);

    useEffect(() => {
        if (setProjectContext && (displayDesign > 0 || displayExec > 0)) {
            setProjectContext(prev => {
                if (prev.financials?.approvedDesignValue === displayDesign && prev.financials?.approvedExecutionValue === displayExec) {
                    return prev;
                }
                return {
                    ...prev,
                    financials: {
                        ...(prev.financials || {}),
                        approvedDesignValue: displayDesign,
                        approvedExecutionValue: displayExec,
                    }
                };
            });
        }
    }, [displayDesign, displayExec, setProjectContext]);

    // Reset Confirm State
    const [isResetting, setIsResetting] = useState(false);

    // Track Filter Tab
    const [activeTrackTab, setActiveTrackTab] = useState<'all' | 'design' | 'execution'>('all');
    const [activeSmartView, setActiveSmartView] = useState<'none' | 'margin' | 'cash-flow'>('none');
    const [viewLayout, setViewLayout] = useState<'stacked' | 'side-by-side'>('stacked');
    const [designViewMode, setDesignViewMode] = useState<'simple' | 'advanced'>('simple');
    const [executionViewMode, setExecutionViewMode] = useState<'simple' | 'advanced'>('simple');
    const [isStudioDefaultsModalOpen, setIsStudioDefaultsModalOpen] = useState(false);
    // Insights Toggle
    const [showInsights, setShowInsights] = useState(true);
    // Financial Controls Accordion
    const [showFinancialControls, setShowFinancialControls] = useState(false);

    // Compare Revision State
    const [compareRevision, setCompareRevision] = useState<any>(null);

    const [confirmingException, setConfirmingException] = useState<{
        index: number;
        action: 'generate_invoice' | 'mark_paid';
        lockedTaxableBase?: number;
    } | null>(null);

    // Payment Schedule Logic
    const paymentSchedules = projectContext.paymentSchedules || [];
    const latestSchedule = paymentSchedules.length > 0 ? paymentSchedules.reduce((a, b) => a.version > b.version ? a : b) : null;
    const hasUnsavedScheduleChanges = latestSchedule && (
        milestones.length !== latestSchedule.advances.length ||
        milestones.some((m, i) => {
            const adv = latestSchedule.advances[i];
            if (!adv) return true;
            return m.percentage !== adv.percentage || 
                   (m.unlocks || '') !== adv.unlocks || 
                   m.name !== adv.label; 
        })
    );

    const handleGenerateSchedule = () => {
        // Contract value is sum of execution and design value
        const contractValue = taxableExecution + taxableDesign;

        // Pre-calculate design items remaining base
        const paidDesign = designMilestones.filter(m => m.status === 'paid' || m.status === 'invoiced');
        const unpaidDesign = designMilestones.filter(m => m.status !== 'paid' && m.status !== 'invoiced');
        let lockedDesignBase = 0;
        paidDesign.forEach(m => {
            if (m.isFixedAmount && m.fixedAmount !== undefined) {
                lockedDesignBase += m.fixedAmount;
            } else {
                lockedDesignBase += (m.lockedTaxableBase || taxableDesign) * (m.percentage / 100);
            }
        });
        const remainingDesignBase = taxableDesign - lockedDesignBase;

        // Pre-calculate execution items remaining base
        const paidExec = executionMilestones.filter(m => m.status === 'paid' || m.status === 'invoiced');
        const unpaidExec = executionMilestones.filter(m => m.status !== 'paid' && m.status !== 'invoiced');
        let lockedExecBase = 0;
        paidExec.forEach(m => {
            if (m.isFixedAmount && m.fixedAmount !== undefined) {
                lockedExecBase += m.fixedAmount;
            } else {
                lockedExecBase += (m.lockedTaxableBase || taxableExecution) * (m.percentage / 100);
            }
        });
        const remainingExecBase = taxableExecution - lockedExecBase;


        let designIndex = 0;
        let execIndex = 0;
        const newAdvances = milestones.map((m, i) => {
            let rowBaseOriginal = 0;
            const isExecution = m.type === 'execution';
            const unpaidItems = isExecution ? unpaidExec : unpaidDesign;
            const remainingBaseAmount = isExecution ? remainingExecBase : remainingDesignBase;
            const originalBaseAmount = isExecution ? taxableExecution : taxableDesign;
            
            const isCleared = m.status === 'paid' || m.status === 'invoiced';
            if (isCleared) {
                rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : ((m.lockedTaxableBase || originalBaseAmount) * (m.percentage / 100));
            } else {
                if (m.isFixedAmount && m.fixedAmount !== undefined) {
                    rowBaseOriginal = m.fixedAmount;
                } else {
                    const fixedPendingTotal = unpaidItems.filter(x => x.isFixedAmount).reduce((sum, x) => sum + (x.fixedAmount || 0), 0);
                    const remainingBaseForPercentages = Math.max(0, remainingBaseAmount - fixedPendingTotal);
                    
                    const unpaidPctExcludingFixed = unpaidItems.filter(x => !x.isFixedAmount).reduce((sum, x) => sum + x.percentage, 0);
                    const relativePct = unpaidPctExcludingFixed > 0 ? (m.percentage / unpaidPctExcludingFixed) : 0;
                    rowBaseOriginal = remainingBaseForPercentages * relativePct;
                }
            }
            rowBaseOriginal = Math.round(rowBaseOriginal);

            const advCode = m.type === 'design' ? `D${++designIndex}` : `E${++execIndex}`;

            return {
                advanceCode: advCode,
                label: (m.name || '').replace(' (Gross)', ''),
                phase: m.type as 'design' | 'execution' | 'handover',
                percentage: m.percentage,
                isFixedAmount: m.isFixedAmount,
                fixedAmount: m.fixedAmount,
                amount: rowBaseOriginal,
                dueCondition: m.trigger || (m.type === 'execution' ? 'Advance before ' + (m.name || '').replace(' (Gross)', '').toLowerCase() : 'On completion of ' + (m.name || '').replace(' (Gross)', '')),
                unlocks: m.unlocks || '',
                status: m.status === 'invoiced' ? 'advance_requested' : m.status === 'paid' ? 'received' : 'pending',
                invoiceRef: m.invoiceNumber || null,
                receivedAt: null,
                isHandoverAdvance: m.isHandoverAdvance || (m.name || '').toLowerCase().includes('handover') || false
            };
        });

        const newSchedule = {
            id: 'ps_' + Math.random().toString(36).substring(2, 9),
            version: latestSchedule ? latestSchedule.version + 1 : 1,
            versionLabel: 'v' + (latestSchedule ? latestSchedule.version + 1 : 1) + '.0',
            status: 'draft',
            docketRef: latestSchedule ? latestSchedule.docketRef : 'WILL_BIND_LATER',
            issuedAt: Date.now(),
            issuedBy: 'pm_auto',
            contractValue: contractValue,
            advances: newAdvances as any,
            revisionNote: latestSchedule ? 'Milestone adjustments' : '',
            supersededBy: null,
            snapshotEngagement: {
                designFee: taxableDesign,
                executionValue: taxableExecution
            }
        };

        const updatedSchedules = [...paymentSchedules];
        if (latestSchedule) {
            const idx = updatedSchedules.findIndex(s => s.id === latestSchedule.id);
            if (idx >= 0) {
                updatedSchedules[idx] = { ...updatedSchedules[idx], supersededBy: newSchedule.id };
            }
        }
        updatedSchedules.push(newSchedule as any);

        setProjectContext(prev => ({ ...prev, paymentSchedules: updatedSchedules as any }));
        showSuccessWithNext(`Payment Schedule v${newSchedule.version} generated successfully`);
    };

    // Studio Defaults State & Sync
    const [studioPaymentStr, setStudioPaymentStr] = useState<any>(null);
    const [savingStudioDefaults, setSavingStudioDefaults] = useState(false);

    useEffect(() => {
        const loadStudioPaymentStructure = async () => {
            try {
                const orgId = orgData?.tenantId || 'demo-tenant-01';
                const p = await getPaymentStructure(orgId);
                if (p) {
                    setStudioPaymentStr(p);
                }
            } catch (err) {
                console.error("Failed to load studio payment structure in PaymentCalculatorTab", err);
            }
        };
        loadStudioPaymentStructure();
    }, [orgData?.tenantId]);

    const getDefaultMilestones = (customStructure?: any) => {
        const paymentStr = customStructure || studioPaymentStr || (orgData as any).paymentStructure;
        const structure = paymentStr?.designStages ? paymentStr : FFDS_PAYMENT_STRUCTURE_DEFAULTS;
        
        return [
            ...structure.designStages.map((s: any, i: number) => ({
                id: `d${i + 1}`,
                type: 'design' as const,
                name: s.name,
                percentage: s.pct,
                description: s.code,
                unlocks: s.unlocks || '',
                trigger: s.trigger || ''
            })),
            ...structure.executionStages.map((s: any, i: number) => ({
                id: `e${i + 1}`,
                type: 'execution' as const,
                name: s.name,
                percentage: s.pct,
                description: s.code,
                unlocks: s.unlocks || '',
                trigger: s.trigger || '',
                isHandoverAdvance: s.code === 'E8' || s.name.toLowerCase().includes('handover') || i === structure.executionStages.length - 1
            }))
        ];
    };

    // Save Current Project Milestones back to Studio level defaults
    const handleSaveAsStudioDefaults = async () => {
        if (!window.confirm("This will save the current project's milestone structure as the new Studio Defaults for all future projects. Continue?")) return;
        
        try {
            setSavingStudioDefaults(true);
            const orgId = orgData?.tenantId || 'demo-tenant-01';
            
            const designStages = designMilestones.map(m => ({
                code: m.description || `D${m.id}`,
                name: m.name,
                pct: m.percentage,
                trigger: m.trigger || m.dueCondition || '',
                unlocks: m.unlocks || ''
            }));
            
            const executionStages = executionMilestones.map(m => ({
                code: m.description || `E${m.id}`,
                name: m.name,
                pct: m.percentage,
                trigger: m.trigger || m.dueCondition || '',
                unlocks: m.unlocks || ''
            }));
            
            const newStructure = {
                designStages,
                executionStages,
                validation: {
                    designSumMustEqual: 100,
                    executionSumMustEqual: 100
                }
            };
            
            await setPaymentStructure(orgId, newStructure as any);
            setStudioPaymentStr(newStructure);
            showSuccessWithNext("Current milestones saved as Studio Defaults successfully!");
        } catch (err: any) {
            console.error("Failed to save as studio defaults", err);
            alert(`Error saving defaults: ${err.message}`);
        } finally {
            setSavingStudioDefaults(false);
        }
    };

    // --- DEFAULTS ---
    useEffect(() => {
        if (!projectContext.paymentMilestones || projectContext.paymentMilestones.length === 0) {
            setProjectContext(prev => ({ ...prev, paymentMilestones: getDefaultMilestones() }));
        }
    }, [studioPaymentStr]);

    const autoBalanceMilestones = (items: PaymentMilestone[], phase: string, changedId?: string) => {
        const phaseItems = items.filter(m => m.type === phase);
        const baseAmount = phase === 'design' ? originalNetDesign : originalNetExecution;
        
        let lockedPercent = 0;
        let adjustableItems: PaymentMilestone[] = [];
        
        // First pass: identify locked and adjustable items
        phaseItems.forEach(m => {
            const isLocked = m.status === 'paid' || m.status === 'invoiced' || m.isFixedAmount || m.isCustom || m.id === changedId;
            if (isLocked) {
                if (m.isFixedAmount && m.fixedAmount !== undefined) {
                    lockedPercent += baseAmount > 0 ? (m.fixedAmount / baseAmount) * 100 : 0;
                } else {
                    lockedPercent += m.percentage;
                }
            } else {
                adjustableItems.push(m);
            }
        });

        // If everything is locked but we need to balance (e.g. they edited the last adjustable one)
        // We will unlock all pending percentage-based items EXCEPT the one they just changed
        if (adjustableItems.length === 0) {
            lockedPercent = 0;
            phaseItems.forEach(m => {
                const isForceLocked = m.status === 'paid' || m.status === 'invoiced' || m.isFixedAmount || m.id === changedId;
                if (isForceLocked) {
                    if (m.isFixedAmount && m.fixedAmount !== undefined) {
                        lockedPercent += baseAmount > 0 ? (m.fixedAmount / baseAmount) * 100 : 0;
                    } else {
                        lockedPercent += m.percentage;
                    }
                } else {
                    m.isCustom = false; // Unlock it
                    adjustableItems.push(m);
                }
            });
        }
        
        const remainingPercent = Math.max(0, 100 - lockedPercent);
        
        if (adjustableItems.length > 0 || phaseItems.some(m => m.isFixedAmount)) {
            const currentAdjustableSum = adjustableItems.reduce((sum, m) => sum + m.percentage, 0);
            
            let totalAssigned = 0;
            let adjustedCount = 0;
            
            items = items.map(m => {
                if (m.type === phase) {
                    if (m.isFixedAmount && m.fixedAmount !== undefined) {
                        return { ...m, percentage: Math.round(baseAmount > 0 ? (m.fixedAmount / baseAmount) * 100 : 0) };
                    } else if (adjustableItems.some(a => a.id === m.id)) {
                        adjustedCount++;
                        let newPct = 0;
                        
                        if (adjustedCount === adjustableItems.length) {
                            // For the last item, just give it whatever is left of the remaining percent to avoid rounding errors
                            newPct = Math.max(0, Math.round(remainingPercent - totalAssigned));
                        } else {
                            if (currentAdjustableSum > 0) {
                                newPct = Math.round((m.percentage / currentAdjustableSum) * remainingPercent);
                            } else {
                                newPct = Math.round(remainingPercent / adjustableItems.length);
                            }
                        }
                        totalAssigned += newPct;
                        return { ...m, percentage: newPct };
                    }
                }
                return m;
            });
        }
        
        return items;
    };

    const handleUpdateMilestone = (index: number, updates: Partial<PaymentMilestone>) => {
        let newMilestones = [...milestones];
        
        // If they manually edit percentage or amount, lock it as custom
        if (updates.percentage !== undefined || updates.fixedAmount !== undefined) {
            updates.isCustom = true;
        }
        
        newMilestones[index] = { ...newMilestones[index], ...updates };
        
        if (updates.percentage !== undefined || updates.fixedAmount !== undefined || updates.isFixedAmount !== undefined) {
             newMilestones = autoBalanceMilestones(newMilestones, newMilestones[index].type, newMilestones[index].id);
        }
        
        setProjectContext(prev => ({ ...prev, paymentMilestones: newMilestones }));
    };

    const handleAddMilestone = (type: 'design' | 'execution') => {
        const newMilestone: PaymentMilestone = {
            id: generateId(),
            type,
            name: 'New Milestone',
            percentage: 0,
            description: '',
            status: 'pending'
        };
        const newMilestones = [...milestones, newMilestone];
        setProjectContext(prev => ({ ...prev, paymentMilestones: autoBalanceMilestones(newMilestones, type) }));
    };

    const handleDeleteMilestone = (index: number) => {
        const newMilestones = [...milestones];
        const type = newMilestones[index].type;
        newMilestones.splice(index, 1);
        setProjectContext(prev => ({ ...prev, paymentMilestones: autoBalanceMilestones(newMilestones, type) }));
    };

    const handleRevertRevision = (revision: any) => {
        setProjectContext(prev => {
            const currentFinancials = prev.financials || {};
            const newRevisions = [...(currentFinancials.paymentRevisions || [])];
            
            newRevisions.push({
                id: Math.random().toString(36).substr(2, 9),
                date: new Date().toISOString(),
                previousExecutionValue: currentFinancials.approvedExecutionValue,
                newExecutionValue: revision.previousExecutionValue,
                previousDesignValue: currentFinancials.approvedDesignValue,
                newDesignValue: revision.previousDesignValue,
                reason: `Reverted to values from ${new Date(revision.date).toLocaleString()}`
            });

            return {
                ...prev,
                financials: {
                    ...currentFinancials,
                    approvedExecutionValue: revision.previousExecutionValue,
                    approvedDesignValue: revision.previousDesignValue,
                    paymentRevisions: newRevisions
                }
            };
        });
    };

    const handleReset = () => {
        if (!isResetting) {
            setIsResetting(true);
            setTimeout(() => setIsResetting(false), 3000);
            return;
        }

        const defaultFinancials = {
            initiationFeePaid: 4999,
            billablePercent: 100,
            executionGstEnabled: true,
            designGstEnabled: true,
            projectedCashValue: 0,
            taxLimitYearly: 2000000,
            goodwillDiscount: 0,
            discounts: []
        };

        setInitiationFee(defaultFinancials.initiationFeePaid);
        setBillablePercent(defaultFinancials.billablePercent);
        setExecutionGstEnabled(defaultFinancials.executionGstEnabled);
        setDesignGstEnabled(defaultFinancials.designGstEnabled);
        setCashLimit(defaultFinancials.taxLimitYearly);
        setDiscounts([]);

        setProjectContext(prev => ({ 
            ...prev, 
            paymentMilestones: getDefaultMilestones(), 
            financials: defaultFinancials 
        }));

        setIsResetting(false);
    };

    const handleLoadDefaults = () => {
        if (!window.confirm("This will overwrite your current milestones with the Studio Defaults. Continue?")) return;
        setProjectContext(prev => ({ ...prev, paymentMilestones: getDefaultMilestones() }));
    };

    const handleMoveMilestone = (id: string, direction: 'up' | 'down') => {
        const newMilestones = [...milestones];
        const targetIdx = newMilestones.findIndex(m => m.id === id);
        if (targetIdx === -1) return;
        const targetType = newMilestones[targetIdx].type;
        
        // Find previous or next milestone of the same type
        let swapIdx = -1;
        if (direction === 'up') {
            for (let i = targetIdx - 1; i >= 0; i--) {
                if (newMilestones[i].type === targetType) {
                    swapIdx = i;
                    break;
                }
            }
        } else {
            for (let i = targetIdx + 1; i < newMilestones.length; i++) {
                if (newMilestones[i].type === targetType) {
                    swapIdx = i;
                    break;
                }
            }
        }
        
        if (swapIdx !== -1) {
            const temp = newMilestones[targetIdx];
            newMilestones[targetIdx] = newMilestones[swapIdx];
            newMilestones[swapIdx] = temp;
            setProjectContext(prev => ({ ...prev, paymentMilestones: newMilestones }));
        }
    };

    const handleSplitMilestone = (id: string) => {
        const newMilestones = [...milestones];
        const idx = newMilestones.findIndex(m => m.id === id);
        if (idx === -1) return;
        
        const m = newMilestones[idx];
        if (m.status === 'paid' || m.status === 'invoiced') return;
        
        const p1 = Math.floor(m.percentage / 2);
        const p2 = m.percentage - p1;
        
        let f1: number | undefined;
        let f2: number | undefined;
        if (m.isFixedAmount && m.fixedAmount !== undefined) {
            f1 = Math.floor(m.fixedAmount / 2);
            f2 = m.fixedAmount - f1;
        }
        
        const m1: PaymentMilestone = {
            ...m,
            id: generateId(),
            name: `${m.name} (Part 1)`,
            percentage: p1,
            fixedAmount: f1,
            isCustom: true
        };
        
        const m2: PaymentMilestone = {
            ...m,
            id: generateId(),
            name: `${m.name} (Part 2)`,
            percentage: p2,
            fixedAmount: f2,
            isCustom: true,
            isHandoverAdvance: m.isHandoverAdvance,
            subSteps: []
        };
        
        newMilestones.splice(idx, 1, m1, m2);
        setProjectContext(prev => ({ ...prev, paymentMilestones: autoBalanceMilestones(newMilestones, m.type, m1.id) }));
    };

    const executeInvoiceAction = (index: number, action: 'generate_invoice' | 'mark_paid' | 'revert_invoice', lockedTaxableBase?: number) => {
        const projectCode = (projectContext?.name || 'PRJ').substring(0, 3).toUpperCase();
        const seq = String(index + 1).padStart(2, '0');
        
        let invNumber = '';
        if (billablePercent > 0) {
            invNumber = `INV-026-${projectCode}-${seq}`;
        } else {
            invNumber = `INV-CASH-${projectCode}-${seq}`;
        }

        if (action === 'generate_invoice') {
            handleUpdateMilestone(index, { 
                status: 'invoiced', 
                invoiceNumber: invNumber, 
                invoiceDate: new Date().toISOString(),
                lockedTaxableBase: lockedTaxableBase
            });
            showSuccessWithNext('Invoice raised successfully');
        } else if (action === 'mark_paid') {
            handleUpdateMilestone(index, { status: 'paid' });
        } else if (action === 'revert_invoice') {
            handleUpdateMilestone(index, { 
                status: 'pending', 
                invoiceNumber: undefined, 
                invoiceDate: undefined,
                lockedTaxableBase: undefined
            });
        }
    };

    const handleInvoiceAction = (index: number, action: 'generate_invoice' | 'mark_paid' | 'revert_invoice', lockedTaxableBase?: number) => {
        if (action === 'generate_invoice' || action === 'mark_paid') {
            const engagementStatus = projectContext.engagement?.status;
            if (engagementStatus !== 'acknowledged') {
                setConfirmingException({
                    index,
                    action,
                    lockedTaxableBase
                });
                return;
            }
        }

        executeInvoiceAction(index, action, lockedTaxableBase);
    };

    const handleConfirmException = () => {
        if (!confirmingException) return;
        const { index, action, lockedTaxableBase } = confirmingException;
        executeInvoiceAction(index, action, lockedTaxableBase);
        setConfirmingException(null);
    };

    // --- DISCOUNT HANDLERS ---
    const handleAddDiscount = () => {
        if (!newDiscount.name || !newDiscount.value) return;
        const discount: ProjectDiscount = {
            id: generateId(),
            name: newDiscount.name,
            value: Number(newDiscount.value),
            type: newDiscount.type || 'percentage',
            target: newDiscount.target || 'execution'
        };
        setDiscounts([...discounts, discount]);
        setNewDiscount({ name: '', value: 0, type: 'percentage', target: 'execution' });
        setShowDiscountForm(false);
    };

    const handleRemoveDiscount = (id: string) => {
        setDiscounts(discounts.filter(d => d.id !== id));
    };

    // --- SUB-STAGE HANDLERS ---
    const handleAddSubStep = (index: number) => {
        const m = milestones[index];
        const newStep = { id: generateId(), label: 'New Requirement', isDone: false };
        handleUpdateMilestone(index, { subSteps: [...(m.subSteps || []), newStep] });
    };

    const handleToggleSubStep = (mIndex: number, sIndex: number) => {
        const m = milestones[mIndex];
        if (!m.subSteps) return;
        const newSteps = [...m.subSteps];
        newSteps[sIndex] = { ...newSteps[sIndex], isDone: !newSteps[sIndex].isDone };
        handleUpdateMilestone(mIndex, { subSteps: newSteps });
    };

    const handleDeleteSubStep = (mIndex: number, sIndex: number) => {
        const m = milestones[mIndex];
        if (!m.subSteps) return;
        const newSteps = m.subSteps.filter((_, i) => i !== sIndex);
        handleUpdateMilestone(mIndex, { subSteps: newSteps });
    };

    const handleUpdateSubStepLabel = (mIndex: number, sIndex: number, label: string) => {
        const m = milestones[mIndex];
        if (!m.subSteps) return;
        const newSteps = [...m.subSteps];
        newSteps[sIndex] = { ...newSteps[sIndex], label };
        handleUpdateMilestone(mIndex, { subSteps: newSteps });
    };


    // --- CALCULATIONS ENGINE ---

    const originalExecutionTotal = selectedHistoricalEntry
        ? selectedHistoricalEntry.executionValue
        : (activeTier?.summary.totalSell || 0);

    const originalDesignFee = selectedHistoricalEntry
        ? selectedHistoricalEntry.designValue
        : (activeTier?.summary.designFee || 0);

    const rawExecutionTotal = selectedHistoricalEntry
        ? selectedHistoricalEntry.executionValue
        : (financials.approvedExecutionValue ?? originalExecutionTotal);

    const rawDesignFee = selectedHistoricalEntry
        ? selectedHistoricalEntry.designValue
        : (financials.approvedDesignValue ?? originalDesignFee);

    // 1. Apply Discounts (Pre-Tax)
    const calculateDiscountValue = (base: number, target: 'execution' | 'design') => {
        const targetDiscounts = discounts.filter(d => d.target === target);
        let totalDeduction = 0;
        targetDiscounts.forEach(d => {
            if (d.type === 'percentage') {
                totalDeduction += base * (d.value / 100);
            } else {
                totalDeduction += d.value;
            }
        });
        return totalDeduction;
    };

    const originalExecutionDiscountVal = calculateDiscountValue(originalExecutionTotal, 'execution');
    const originalNetExecution = Math.max(0, originalExecutionTotal - originalExecutionDiscountVal);

    const originalDesignDiscountVal = calculateDiscountValue(originalDesignFee, 'design');
    const originalNetDesign = Math.max(0, originalDesignFee - originalDesignDiscountVal);

    const executionDiscountVal = calculateDiscountValue(rawExecutionTotal, 'execution');
    const designDiscountVal = calculateDiscountValue(rawDesignFee, 'design');

    // Net Taxable Base
    const taxableExecution = Math.max(0, rawExecutionTotal - executionDiscountVal);
    const taxableDesign = Math.max(0, rawDesignFee - designDiscountVal);

    // 2. Filter Milestones
    const executionMilestones = milestones.filter(m => m.type === 'execution');
    const designMilestones = milestones.filter(m => m.type === 'design');
    
    // 3. Splits (on Taxable Base)
    const executionBillable = taxableExecution * (billablePercent / 100);
    const executionCash = taxableExecution * ((100 - billablePercent) / 100);

    // 4. GST (Liability) - Calculated on Taxable Amount
    const gstOnExecution = executionGstEnabled ? (executionBillable * (gstRate / 100)) : 0;
    const gstOnDesign = designGstEnabled ? taxableDesign * (gstRate / 100) : 0;
    const totalGST = gstOnExecution + gstOnDesign;

    // 5. Totals & Net
    // "Official Revenue" = Taxable Billable + Taxable Design
    const totalOfficialRevenue = executionBillable + taxableDesign; 
    
    // Gross Project Value = (Taxable Exe + Taxable Design) + GST + Cash Component
    // = (Net Exe + Net Design) + GST
    const grossProjectValue = (taxableExecution + taxableDesign) + totalGST;
    
    // 6. Final Receivables
    const netReceivable = grossProjectValue - initiationFee;

    /*
      Every milestone amount on this screen, from the one implementation.

      There were seven copies of this calculation in two families that
      disagreed: the table re-based unpaid rows onto the remaining contract,
      while totalPaid, the collections list and the client portal used a flat
      percentage of the original base. On Test Project for T&C the studio saw
      93,797 for a milestone the client's portal priced at 86,579.
    */
    const schedule = useMemo(() => computeSchedule({
        context: { ...projectContext, paymentMilestones: milestones },
        tierSummary: { totalSell: originalExecutionTotal, designFee: originalDesignFee },
        overrides: {
            gstRate,
            billablePercent,
            executionGstEnabled,
            designGstEnabled,
            initiationFeePaid: initiationFee,
            discounts: discounts as any,
            approvedExecutionValue: rawExecutionTotal,
            approvedDesignValue: rawDesignFee,
        },
    }), [projectContext, milestones, originalExecutionTotal, originalDesignFee, gstRate,
         billablePercent, executionGstEnabled, designGstEnabled, initiationFee, discounts,
         rawExecutionTotal, rawDesignFee]);

    // Calculate Total Paid and Remaining Balance
    const legacyTotalPaid = useMemo(() => {
        let paid = initiationFee; // Initiation fee is already paid
        
        // Sum up paid milestones
        designMilestones.forEach((m, i) => {
            if (m.status === 'paid') {
                let rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || originalNetDesign) * (m.percentage / 100);
                rowBaseOriginal = Math.round(rowBaseOriginal);
                let rowBillable = Math.round(rowBaseOriginal);
                let rowGST = Math.round(rowBillable * (gstRate / 100));
                let rowInvoiceTotal = Math.round(rowBillable + rowGST);
                
                if (i === 0 && initiationFee > 0) {
                    rowInvoiceTotal = Math.max(0, rowInvoiceTotal - initiationFee);
                }
                paid += rowInvoiceTotal;
            }
        });

        executionMilestones.forEach((m) => {
            if (m.status === 'paid') {
                let rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || originalNetExecution) * (m.percentage / 100);
                rowBaseOriginal = Math.round(rowBaseOriginal);
                let rowBillable = Math.round(rowBaseOriginal * (billablePercent / 100));
                const applicableGstRate = executionGstEnabled ? gstRate : 0;
                let rowGST = Math.round(rowBillable * (applicableGstRate / 100));
                let rowInvoiceTotal = Math.round(rowBillable + rowGST);
                
                // Add cash component to paid amount
                const rowCash = Math.round(rowBaseOriginal * ((100 - billablePercent) / 100));
                paid += rowInvoiceTotal + rowCash;
            }
        });

        return paid;
    }, [designMilestones, executionMilestones, originalNetDesign, originalNetExecution, gstRate, initiationFee, billablePercent, executionGstEnabled]);
    void legacyTotalPaid;

    const totalPaid = schedule.totals.totalPaid;
    const remainingBalance = grossProjectValue - totalPaid;

    /*
      Four sections, not fifteen stacked.

      Every existing block keeps its place — nothing was deleted and nothing
      moved in the file; they are gated on which tab is open, so the tax
      simulator is one click away instead of twelve screens down.
    */
    const [moneyTab, setMoneyTab] = useState<'overview' | 'milestones' | 'tax' | 'history'>('overview');

    /*
      What this screen knows but never said.

      Derived in lib/moneyIntel so "late", "earned" and "drifted" are defined
      once. Amounts are passed in rather than re-derived: the pricing chain
      above (taxable bases, discounts, fixed-amount overrides) is intricate
      and a second copy of it would quietly disagree with this one.
    */
    const moneyStudioId = orgData?.tenantId || 'demo-tenant-01';

    /*
      Scope additions.

      This tab reported the contract as it stood on the day the BOQ was frozen
      and nothing since, so supplementary invoices already sent to the client
      were invisible here. Subscribed rather than fetched, so Money and the
      Scope Additions screen can never disagree about what a project is worth.
    */
    const scopeContracted = taxableExecution + taxableDesign;
    const scopeBaseMarginPct = scopeContracted > 0
        ? ((scopeContracted - Number((activeTier as any)?.summary?.totalCost || 0)) / scopeContracted) * 100
        : null;
    const {
        summary: scopeSummary,
        loading: scopeLoading,
        error: scopeError,
    } = useScopeAdditions(moneyStudioId, projectId, scopeContracted, scopeBaseMarginPct, bank);
    const { settings: moneySettings } = useStudioSettings(moneyStudioId);
    const { paymentRequests: moneyRequests } = usePaymentRequests(projectId || '', moneyStudioId);
    const { phases: timelinePhasesForMoney } = useTimelinePhases(projectId || '', moneyStudioId);

    /*
      Target dates taken from the project's programme.

      Proposals only: a date shown to the client should come from the real
      timeline or not exist, so nothing is written until it is reviewed, and
      whatever cannot be traced back to a phase reports which link broke
      instead of being estimated.
    */
    const [dateProposal, setDateProposal] = useState<ReturnType<typeof deriveDatesFromTimeline> | null>(null);

    /*
      Taking you to the milestone rather than invoicing from the summary.

      A one-click "raise invoice" here would have to know the taxable base to
      lock, and that base is not the track total — the row derives it from the
      remaining base, pending fixed amounts and each milestone's share of what
      is left. A second copy of that maths would drift from the row's, and the
      number it locked would be wrong on a client invoice. So the panel jumps
      to the row and lets the one implementation do the work.
    */
    const [highlightMilestoneId, setHighlightMilestoneId] = useState<string | null>(null);

    /*
      How this client pays, and how that compares.

      The per-project measure is free — the requests are already loaded. The
      comparison is not: it means reading a subcollection for every project in
      the book, so it is fetched only when asked for, once, and never on load.
    */
    const behaviour = useMemo(() => paymentBehaviour(moneyRequests as any), [moneyRequests]);

    /*
      What has already been promised to vendors.

      Purchase orders are the only record of money committed out of this
      project, and nothing on this screen had ever read them — so the money
      view showed everything coming in and nothing going out.
    */
    const [projectOrders, setProjectOrders] = useState<any[]>([]);
    useEffect(() => {
        if (!projectId) return;
        let alive = true;
        projectDb.getPurchaseOrders(projectId)
            .then(list => { if (alive) setProjectOrders(list || []); })
            .catch(() => { if (alive) setProjectOrders([]); });
        return () => { alive = false; };
    }, [projectId]);
    const [benchmark, setBenchmark] = useState<ReturnType<typeof benchmarkOf> | null>(null);
    const [benchmarking, setBenchmarking] = useState(false);

    /*
      One block, rendered in both branches of Collections so the measure is
      there whether or not anything is currently outstanding.
    */
    const behaviourBlock = (
        <div className="mt-4 pt-3 border-t border-[#EDEFF7]">
            {behaviour.settled === 0 ? (
                <p className="text-[11px] text-[#8E96B8] leading-snug">
                    No payment has been settled on this project yet, so there is nothing to measure.
                </p>
            ) : (
                <>
                    <p className="text-[11px] text-[#5A628A] leading-snug">
                        This client settles in{' '}
                        <b className="text-[#12182F]">{behaviour.meanDays!.toFixed(0)} days</b> on average
                        <span className="text-[#8E96B8]">
                            {' '}across {behaviour.settled} {behaviour.settled === 1 ? 'payment' : 'payments'}
                        </span>
                        {behaviour.settled > 1 && behaviour.fastestDays !== behaviour.slowestDays && (
                            <span className="text-[#8E96B8]"> ({behaviour.fastestDays}–{behaviour.slowestDays}d)</span>
                        )}
                    </p>
                    {benchmark ? (
                        <p className="text-[11px] mt-1 leading-snug text-[#5A628A]">
                            {benchmark.meanDays === null ? (
                                <span className="text-[#8E96B8]">No other project has a settled payment to compare with.</span>
                            ) : (
                                <>
                                    Your book averages <b className="text-[#12182F]">{benchmark.meanDays.toFixed(0)} days</b>
                                    <span className="text-[#8E96B8]"> over {benchmark.settled} payments across {benchmark.projects} projects</span>
                                    {behaviour.meanDays !== null && (
                                        <span className={behaviour.meanDays > benchmark.meanDays ? 'text-amber-700' : 'text-[#3D52A0]'}>
                                            {' '}— this client is{' '}
                                            {Math.abs(behaviour.meanDays - benchmark.meanDays).toFixed(0)}d{' '}
                                            {behaviour.meanDays > benchmark.meanDays ? 'slower' : 'faster'}
                                        </span>
                                    )}
                                </>
                            )}
                        </p>
                    ) : (
                        <button
                            type="button"
                            onClick={e => { e.stopPropagation(); runBenchmark(); }}
                            disabled={benchmarking}
                            className="mt-1.5 text-[11px] font-semibold text-[#3D52A0] hover:text-[#334486] disabled:text-[#ADBBDA] cursor-pointer"
                        >
                            {benchmarking ? 'Reading your book…' : 'Compare with your book ›'}
                        </button>
                    )}
                </>
            )}
        </div>
    );

    const runBenchmark = async () => {
        if (benchmarking || !moneyStudioId) return;
        setBenchmarking(true);
        try {
            const ids = (allProjects || []).map((x: any) => x?.id).filter(Boolean).slice(0, 60);
            const perProject = await Promise.all(ids.map(async (pid: string) => {
                try {
                    const snap = await fsGetDocs(fsCollection(fsDb, `studios/${moneyStudioId}/projects/${pid}/paymentRequests`));
                    return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
                } catch {
                    return [];
                }
            }));
            setBenchmark(benchmarkOf(perProject));
        } finally {
            setBenchmarking(false);
        }
    };

    const goToMilestone = (id: string) => {
        setMoneyTab('milestones');
        setHighlightMilestoneId(id);
        // Let the tab paint before looking for the row.
        setTimeout(() => {
            const el = document.querySelector(`[data-milestone-id="${id}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
        setTimeout(() => setHighlightMilestoneId(null), 2600);
    };

    const runDateDerivation = () => {
        setDateProposal(deriveDatesFromTimeline(
            milestones,
            (timelinePhasesForMoney || []) as any,
            ((moneySettings as any)?.designProcess?.steps || []) as any,
            ((moneySettings as any)?.paymentMilestones?.milestones || []) as any,
        ));
    };

    const applyDateProposal = () => {
        if (!dateProposal || dateProposal.proposals.length === 0) return;
        const byId = new Map(dateProposal.proposals.map(d => [d.id, d.date]));
        const next = milestones.map(m => (byId.has(m.id) ? { ...m, date: byId.get(m.id) } : m));
        setProjectContext(prev => ({ ...prev, paymentMilestones: next }));
        setDateProposal(null);
    };

    const amountOfMilestone = useCallback((m: any) => {
        if (m?.isFixedAmount) return Number(m.fixedAmount) || 0;
        const base = m?.type === 'design' ? taxableDesign : taxableExecution;
        return (Number(m?.percentage) || 0) / 100 * (Number(base) || 0);
    }, [taxableDesign, taxableExecution]);

    /*
      What has been invoiced and not yet paid, priced exactly as the milestone
      row prices it — locked taxable base, the billable split on execution,
      GST at the applicable rate, less the initiation fee on the first design
      invoice. Same arithmetic as totalPaid above, for the invoiced state.
    */
    /* Raised and unsettled, priced the same way the table prices them. */
    const invoicedOutstanding = useMemo(
        () => outstandingInvoices(schedule, { paymentMilestones: milestones }),
        [schedule, milestones],
    );

    const escalationCfg = (moneySettings as any)?.paymentMilestones?.escalation || DEFAULT_ESCALATION;
    const chase = useMemo(
        () => collections(moneyRequests as any, invoicedOutstanding, escalationCfg),
        [moneyRequests, invoicedOutstanding, escalationCfg],
    );
    const billable = useMemo(
        () => billableNow(milestones, amountOfMilestone),
        [milestones, amountOfMilestone],
    );
    const gap = useMemo(
        () => cashGap(milestones, amountOfMilestone, projectOrders as any),
        [milestones, amountOfMilestone, projectOrders],
    );
    const drift = useMemo(
        () => contractDrift(financials?.paymentRevisions, milestones),
        [financials?.paymentRevisions, milestones],
    );
    
    // 6. Global FY Tracking
    const otherProjectsCash = useMemo(() => {
        return allProjects
            .filter(p => p.context?.name !== projectContext?.name) 
            .reduce((sum, p) => sum + (p.context?.financials?.projectedCashValue || 0), 0);
    }, [allProjects, projectContext?.name]);

    const totalFYCash = otherProjectsCash + executionCash;
    const cashUtilization = (totalFYCash / cashLimit) * 100;
    const isRiskHigh = totalFYCash > cashLimit;

    /*
      Persistence, and only after a real edit.

      This wrote `financials` 500ms after the tab rendered, with no user action,
      and compared "has it changed" with JSON.stringify of two objects whose
      keys sit in different orders -- so an unchanged record almost never
      compared equal. Opening the Money tab on any project rewrote that
      project's financial record.

      That is how a completed job for a real client had `executionGstEnabled`
      go from absent to true, moving its recorded contract by 1,54,027, because
      somebody opened the screen to look at it.

      The first run for a project is the arrival, not an edit, so it is skipped.
      After that the comparison is by value.
    */
    const settledFor = useRef<string | null>(null);
    useEffect(() => {
        if (isReadOnlyMode) return;
        const key = projectId || projectContext?.name || 'unkeyed';
        if (settledFor.current !== key) {
            settledFor.current = key;
            return;
        }
        const newConfig = {
            initiationFeePaid: initiationFee,
            billablePercent,
            executionGstEnabled,
            designGstEnabled,
            projectedCashValue: executionCash,
            taxLimitYearly: cashLimit,
            goodwillDiscount: 0, // Deprecated in UI but kept in type
            discounts,
            approvedExecutionValue: financials.approvedExecutionValue,
            approvedDesignValue: financials.approvedDesignValue
        };
        const timer = setTimeout(() => {
            /*
              Compared against the RESOLVED record, not the raw one.

              A stored record that simply omits a field is not different from
              one carrying that field's default -- but comparing against the raw
              record said it was, so arriving on a project with an older record
              still wrote to it. Resolving both sides first means only a real
              difference counts as a change.
            */
            if (!sameFinancials(resolveFinancials(projectContext.financials), newConfig)) {
                setProjectContext(prev => ({ ...prev, financials: newConfig }));
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [initiationFee, billablePercent, executionGstEnabled, designGstEnabled, executionCash, cashLimit, discounts, financials.approvedExecutionValue, financials.approvedDesignValue, isReadOnlyMode, projectId, projectContext?.name]);


    /*
      The target date, editable wherever a milestone appears.

      It was read-only the moment a milestone went to invoiced or paid, and the
      Advanced table had no date field at all. On a legacy project -- one whose
      invoices were all settled long before anybody typed them in here -- that
      left no way to record when a single one of them fell due.

      That matters beyond tidiness: the cash-flow forecast reads this field, the
      client's portal spine and timeline read it, and a schedule of settled
      milestones carrying no dates forecasts nothing and shows the client an
      undated programme.

      Editing a settled row is a correction to the record, not a plan, which is
      what the tooltip says and why the relative "in 12 days" is dropped there.
      It does not reopen the invoice or change a rupee.
    */
    /*
      Dating a whole track in one go.

      161 of 192 milestones across the studio carry no date, and 149 of those
      are still pending -- so this is mostly a planning job, not a back-dating
      one. Setting eight dates a project, one picker at a time, is why nobody
      has done it, and the cash-flow forecast reads this field: undated
      milestones forecast nothing.

      Start date plus a rhythm, applied down the track in order. The rhythm
      counts every milestone, dated or not, so skipping the ones already set
      does not shift everything after them.
    */
    const [datingTrack, setDatingTrack] = useState<'design' | 'execution' | null>(null);
    const [dateStart, setDateStart] = useState('');
    const [dateEvery, setDateEvery] = useState(3);
    const [dateOnlyBlanks, setDateOnlyBlanks] = useState(true);

    const isoOf = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    /** What the current settings would write, without writing it. */
    const trackDatePreview = useMemo(() => {
        if (!datingTrack || !dateStart) return [] as { id: string; name: string; from?: string; to: string; skipped: boolean }[];
        const start = new Date(dateStart + 'T00:00:00');
        if (isNaN(start.getTime())) return [];
        let slot = 0;
        return milestones.filter(m => m.type === datingTrack).map(m => {
            const d = new Date(start);
            d.setDate(d.getDate() + slot * Math.max(0, dateEvery) * 7);
            slot++;
            const skipped = dateOnlyBlanks && !!m.date;
            return { id: m.id, name: m.name, from: m.date, to: isoOf(d), skipped };
        });
    }, [datingTrack, dateStart, dateEvery, dateOnlyBlanks, milestones]);

    const applyTrackDates = () => {
        if (!datingTrack || !dateStart) return;
        const byId = new Map<string, (typeof trackDatePreview)[number]>(trackDatePreview.map(r => [r.id, r]));
        setProjectContext(prev => ({
            ...prev,
            paymentMilestones: (prev.paymentMilestones || []).map(m => {
                const row = byId.get(m.id);
                if (!row || row.skipped) return m;
                return { ...m, date: row.to };
            }),
        }));
        setDatingTrack(null);
    };

    const renderTargetDate = (m: PaymentMilestone, mainIndex: number, isCleared: boolean) => (
        <DateField
            size="sm"
            value={m.date || ''}
            onChange={v => handleUpdateMilestone(mainIndex, { date: v || undefined })}
            placeholder={isCleared ? 'set date on record' : 'set target date'}
            showRelative={!isCleared}
            disabled={isReadOnlyMode}
            title={isCleared
                ? 'When this milestone fell due. Editing a settled row corrects the record \u2014 it does not reopen the invoice.'
                : 'Target date \u2014 drives the cash-flow forecast and is shown to the client'}
        />
    );

    const renderSplitTable = (
        items: PaymentMilestone[], 
        baseAmount: number, 
        originalBaseAmount: number,
        isExecution: boolean, 
        title: string
    ) => {
        let totalEffectivePercent = 0;
        items.forEach(m => {
            if (m.isFixedAmount && m.fixedAmount !== undefined) {
                totalEffectivePercent += baseAmount > 0 ? (m.fixedAmount / baseAmount) * 100 : 0;
            } else {
                totalEffectivePercent += m.percentage;
            }
        });
        const isBalanced = Math.abs(totalEffectivePercent - 100) < 0.1;

        const paidItems = items.filter(m => m.status === 'paid' || m.status === 'invoiced');
        const unpaidItems = items.filter(m => m.status !== 'paid' && m.status !== 'invoiced');
        const unpaidPct = unpaidItems.reduce((sum, m) => sum + m.percentage, 0);
        
        const viewMode = isExecution ? executionViewMode : designViewMode;
        const setViewMode = isExecution ? setExecutionViewMode : setDesignViewMode;
        
        let lockedBase = 0;
        paidItems.forEach(m => {
            if (m.isFixedAmount && m.fixedAmount !== undefined) {
                lockedBase += m.fixedAmount;
            } else {
                lockedBase += (m.lockedTaxableBase || originalBaseAmount) * (m.percentage / 100);
            }
        });
        const remainingBaseAmount = baseAmount - lockedBase;

        const renderStageAndConditions = (m: PaymentMilestone, mainIndex: number, isCleared: boolean, filteredIdx: number, totalFiltered: number) => {
            return (
                <div className="space-y-3 py-1.5">
                    <div className="flex items-center gap-2">
                        {(!m.status || m.status === 'pending') && (
                            <div className="flex items-center gap-0.5 shrink-0 bg-[#EDEFF7] p-0.5 rounded-lg border border-[#E2E5F0] select-none mr-1">
                                <button 
                                    onClick={() => handleMoveMilestone(m.id, 'up')}
                                    disabled={filteredIdx === 0}
                                    className={`p-0.5 rounded transition-all ${filteredIdx === 0 ? 'text-[#CBD1E4] cursor-not-allowed' : 'text-[#4A5178] hover:text-[#12182F] hover:bg-white shadow-xs'}`}
                                    title="Move Up"
                                >
                                    <ChevronUpIcon className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                    onClick={() => handleMoveMilestone(m.id, 'down')}
                                    disabled={filteredIdx === totalFiltered - 1}
                                    className={`p-0.5 rounded transition-all ${filteredIdx === totalFiltered - 1 ? 'text-[#CBD1E4] cursor-not-allowed' : 'text-[#4A5178] hover:text-[#12182F] hover:bg-white shadow-xs'}`}
                                    title="Move Down"
                                >
                                    <ChevronDownIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                        <input 
                            type="text" 
                            value={m.name} 
                            onChange={e => handleUpdateMilestone(mainIndex, { name: e.target.value })}
                            className="bg-transparent outline-none font-extrabold text-[#12182F] focus:border-b focus:border-[#8E96B8] text-xs font-semibold py-0.5 w-full max-w-md transition-colors"
                            disabled={isCleared}
                        />
                        {(!m.status || m.status === 'pending') && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => handleSplitMilestone(m.id)}
                                    className="text-[#8E96B8] hover:text-[#3D52A0] shrink-0 p-1 bg-[#F6F7FB] hover:bg-[#EDE8F5] rounded-lg border border-[#E2E5F0] transition-all shadow-2xs"
                                    title="Split Milestone"
                                >
                                    <ScissorsIcon className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                    onClick={() => handleDeleteMilestone(mainIndex)}
                                    className="text-[#8E96B8] hover:text-red-500 shrink-0 p-1 bg-[#F6F7FB] hover:bg-red-50 rounded-lg border border-[#E2E5F0] transition-all shadow-2xs"
                                    title="Delete Milestone"
                                >
                                    <DeleteIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Trigger (WHEN) & Deliverables (UNLOCKS) - Elegant, Flat, Non-collapsible */}
                    <div className="space-y-1.5 border-l border-[#E2E5F0] pl-3 ml-0.5">
                        <div className="flex items-start gap-1.5 text-[11px] text-[#5A628A] font-medium">
                            <span className="font-extrabold text-[#8E96B8] uppercase tracking-wider shrink-0 text-[9px] w-14 mt-0.5">WHEN:</span>
                            {isCleared ? (
                                <span className="text-[#4A5178] font-semibold leading-relaxed">{m.trigger || '—'}</span>
                            ) : (
                                <input 
                                    type="text" 
                                    value={m.trigger || ''} 
                                    onChange={e => handleUpdateMilestone(mainIndex, { trigger: e.target.value })} 
                                    placeholder="Trigger condition..." 
                                    className="bg-transparent border-b border-dashed border-[#E2E5F0] hover:border-[#8E96B8] focus:border-[#5A628A] outline-none w-full max-w-lg py-0.5 text-[11px] font-semibold text-[#3A416B] transition-colors"
                                />
                            )}
                        </div>

                        <div className="flex items-start gap-1.5 text-[11px] text-[#5A628A] font-medium">
                            <span className="font-extrabold text-[#7091E6] uppercase tracking-wider shrink-0 text-[9px] w-14 mt-0.5">UNLOCKS:</span>
                            {isCleared ? (
                                <span className="text-slate-900 font-semibold leading-relaxed">{m.unlocks || '—'}</span>
                            ) : (
                                <input 
                                    type="text" 
                                    value={m.unlocks || ''} 
                                    onChange={e => handleUpdateMilestone(mainIndex, { unlocks: e.target.value })} 
                                    placeholder="Unlocks deliverables..." 
                                    className="bg-transparent border-b border-dashed border-[#E2E5F0] hover:border-[#7091E6] focus:border-[#3D52A0] outline-none w-full max-w-lg py-0.5 text-[11px] font-semibold text-slate-900 transition-colors"
                                />
                            )}
                        </div>

                        {/* The date, beside the conditions rather than buried under them. */}
                        <div className="flex items-start gap-2 text-[11px]">
                            <span className="font-extrabold text-[#8E96B8] uppercase tracking-wider shrink-0 text-[9px] w-14 mt-1">DATE:</span>
                            {renderTargetDate(m, mainIndex, isCleared)}
                        </div>

                        {/* Handover advance checkbox for execution milestones */}
                        {isExecution && (
                            <div className="pt-0.5">
                                {isCleared ? (
                                    m.isHandoverAdvance && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200/50 text-[9px] font-black text-amber-800 uppercase tracking-wider mt-0.5">
                                            HANDOVER ADVANCE
                                        </span>
                                    )
                                ) : (
                                    <label className="flex items-center gap-1.5 cursor-pointer mt-0.5 select-none">
                                        <input 
                                            type="checkbox" 
                                            checked={m.isHandoverAdvance || false}
                                            onChange={(e) => handleUpdateMilestone(mainIndex, { isHandoverAdvance: e.target.checked })}
                                            className="w-3.5 h-3.5 text-amber-600 rounded border-[#CBD1E4] focus:ring-amber-500 cursor-pointer"
                                        />
                                        <span className="text-[10px] font-extrabold text-[#5A628A] uppercase tracking-wider">Is Handover Advance</span>
                                    </label>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Pre-requisites checklist */}
                    <div className="pl-3.5 pt-1 space-y-1.5">
                        {m.subSteps && m.subSteps.length > 0 && (
                            <div className="space-y-1.5 max-w-md">
                                {m.subSteps.map((step, sIdx) => (
                                    <div key={step.id} className="flex items-center gap-2 group/step">
                                        <input 
                                            type="checkbox" 
                                            checked={step.isDone} 
                                            onChange={() => handleToggleSubStep(mainIndex, sIdx)}
                                            className="rounded text-[#3D52A0] w-3.5 h-3.5 cursor-pointer border-[#CBD1E4] focus:ring-[#3D52A0]"
                                        />
                                        {isCleared ? (
                                            <span className={`text-[11px] font-semibold ${step.isDone ? 'text-[#8E96B8] line-through' : 'text-[#4A5178]'}`}>
                                                {step.label}
                                            </span>
                                        ) : (
                                            <div className="flex items-center gap-1 w-full">
                                                <input 
                                                    value={step.label || ''}
                                                    onChange={(e) => handleUpdateSubStepLabel(mainIndex, sIdx, e.target.value)}
                                                    className={`bg-transparent outline-none text-[11px] font-semibold w-full py-0.5 border-b border-transparent hover:border-[#E2E5F0] focus:border-[#CBD1E4] ${step.isDone ? 'text-[#8E96B8] line-through' : 'text-[#3A416B]'}`}
                                                />
                                                <button 
                                                    onClick={() => handleDeleteSubStep(mainIndex, sIdx)} 
                                                    className="text-[#CBD1E4] hover:text-red-500 p-0.5 opacity-0 group-hover/step:opacity-100 transition-opacity shrink-0"
                                                    title="Remove condition"
                                                >
                                                    <DeleteIcon className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {!isCleared && (
                            <button 
                                onClick={() => handleAddSubStep(mainIndex)} 
                                className="text-[10px] text-[#3D52A0] hover:text-[#334486] font-extrabold flex items-center gap-1 py-1 transition-colors uppercase tracking-wider"
                            >
                                <PlusIcon className="w-3 h-3" /> Add Pre-requisite Condition
                            </button>
                        )}
                    </div>
                </div>
            );
        };

        return (
            <div className="bg-white border border-[#E2E5F0] rounded-2xl overflow-hidden shadow-sm mb-8">
                <div className="bg-[#F6F7FB]/50 px-6 py-4 border-b border-[#E2E5F0] flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                        <h3 className="text-sm font-extrabold text-[#12182F] uppercase tracking-wider">{title} Tracking</h3>
                        <div className="text-[11px] text-[#5A628A] mt-1 flex flex-wrap gap-x-4 gap-y-1 items-center font-medium">
                            {baseAmount !== originalBaseAmount ? (
                                <div className="flex items-center gap-2">
                                    <span className="line-through text-[#8E96B8]" title="Original Taxable Base">Orig: {formatCurrency(originalBaseAmount)}</span>
                                    <span className="text-[#3D52A0] font-bold tabular-nums" title="Revised Taxable Base">Rev: {formatCurrency(baseAmount)}</span>
                                </div>
                            ) : (
                                <span>Taxable Base: <span className="tabular-nums font-bold text-[#3A416B]">{formatCurrency(baseAmount)}</span></span>
                            )}
                            {isExecution && (
                                <>
                                    {billablePercent < 100 && (
                                        <span className="text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200/60 tabular-nums text-[10px]">
                                            Split: {billablePercent}% / {100 - billablePercent}%
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Segmented Toggle Control */}
                        <div className="flex bg-[#EDEFF7] p-0.5 rounded-xl border border-[#E2E5F0] select-none">
                            <button 
                                onClick={() => setViewMode('simple')}
                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${viewMode === 'simple' ? 'bg-white text-slate-900 shadow-xs border border-[#E2E5F0]/50' : 'text-[#5A628A] hover:text-[#252C4E]'}`}
                            >
                                Simple
                            </button>
                            <button 
                                onClick={() => setViewMode('advanced')}
                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${viewMode === 'advanced' ? 'bg-white text-slate-900 shadow-xs border border-[#E2E5F0]/50' : 'text-[#5A628A] hover:text-[#252C4E]'}`}
                            >
                                Advanced
                            </button>
                        </div>

                        {!isReadOnlyMode && (
                            <button
                                onClick={() => {
                                    setDatingTrack(isExecution ? 'execution' : 'design');
                                    setDateStart(isoOf(new Date()));
                                }}
                                className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl border border-[#E2E5F0] bg-white text-[#3A416B] hover:border-[#3D52A0] hover:text-[#3D52A0] transition-colors cursor-pointer"
                                title="Give every milestone in this track a date, spaced evenly"
                            >
                                Set dates
                            </button>
                        )}

                        <div className={`text-xs font-black px-3 py-1.5 rounded-xl border tabular-nums ${isBalanced ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
                            Total: {totalEffectivePercent.toFixed(1).replace('.0', '')}%
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto w-full">
                <table className="w-full text-xs text-left min-w-[850px]">
                    <thead className="bg-[#F6F7FB] text-[10px] font-bold text-[#5A628A] uppercase tracking-wider border-b border-[#E2E5F0]">
                        <tr>
                            <th className="p-4 min-w-[325px]">Stage & Conditions</th>
                            <th className="p-4 w-32 text-center">% / Amt</th>
                            <th className="p-4 text-right min-w-[150px] bg-[#F6F7FB]/30 text-[#12182F] font-black">Invoice Amount</th>
                            {isExecution && billablePercent < 100 && (
                                <>
                                    <th className="p-4 text-right min-w-[120px] bg-amber-50/10 text-amber-900 font-black">Cash</th>
                                    {/*
                                      Invoice and cash sat side by side with no total, so
                                      this was the one view that never said what the client
                                      owes on a milestone — the Simple card, Collections and
                                      the realization pipeline all do. Shown only when there
                                      is a split; without one it would repeat the invoice
                                      column exactly.
                                    */}
                                    <th className="p-4 text-right min-w-[130px] bg-[#F6F7FB]/60 text-[#12182F] font-black">Total Owed</th>
                                </>
                            )}
                            <th className="p-4 text-center w-28">Status</th>
                            <th className="p-4 text-right w-32">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EDEFF7]">
                        {items.map((m, i) => {
                            const isCleared = m.status === 'paid' || m.status === 'invoiced';
                            let rowBaseOriginal = 0;
                            let effectiveTaxableBaseForLocking = baseAmount;
                            if (isCleared) {
                                rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : ((m.lockedTaxableBase || originalBaseAmount) * (m.percentage / 100));
                                effectiveTaxableBaseForLocking = m.lockedTaxableBase || originalBaseAmount;
                            } else {
                                if (m.isFixedAmount && m.fixedAmount !== undefined) {
                                    rowBaseOriginal = m.fixedAmount;
                                } else {
                                    const fixedPendingTotal = unpaidItems.filter(x => x.isFixedAmount).reduce((sum, x) => sum + (x.fixedAmount || 0), 0);
                                    const remainingBaseForPercentages = Math.max(0, remainingBaseAmount - fixedPendingTotal);
                                    
                                    const unpaidPctExcludingFixed = unpaidItems.filter(x => !x.isFixedAmount).reduce((sum, x) => sum + x.percentage, 0);
                                    const relativePct = unpaidPctExcludingFixed > 0 ? (m.percentage / unpaidPctExcludingFixed) : 0;
                                    rowBaseOriginal = remainingBaseForPercentages * relativePct;
                                }
                                effectiveTaxableBaseForLocking = m.percentage > 0 ? (rowBaseOriginal / (m.percentage / 100)) : baseAmount;
                            }
                            rowBaseOriginal = Math.round(rowBaseOriginal);
                            
                            let rowBillable = Math.round(isExecution ? rowBaseOriginal * (billablePercent / 100) : rowBaseOriginal);
                            const rowCash = Math.round(isExecution ? rowBaseOriginal * ((100 - billablePercent) / 100) : 0);
                            
                            const applicableGstRate = isExecution
                                ? (executionGstEnabled ? gstRate : 0)
                                : (designGstEnabled ? gstRate : 0);
                            let rowGST = Math.round(rowBillable * (applicableGstRate / 100));
                            
                            let rowInvoiceTotal = Math.round(rowBillable + rowGST);
                            
                            let deductedInitiationFee = 0;
                            if (!isExecution && i === 0 && initiationFee > 0) {
                                deductedInitiationFee = Math.min(rowInvoiceTotal, initiationFee);
                                rowInvoiceTotal = Math.max(0, rowInvoiceTotal - initiationFee);
                            }
                            
                            const mainIndex = milestones.findIndex(x => x.id === m.id);
                            
                            const statusColor = m.status === 'paid' 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                                : m.status === 'invoiced' 
                                    ? 'bg-[#EDE8F5]/50 text-[#2A3A73] border-[#ADBBDA]' 
                                    : 'bg-[#F6F7FB] text-[#5A628A] border-[#E2E5F0]/50';

                            if (deductedInitiationFee > 0) {
                                return (
                                    <React.Fragment key={m.id}>
                                        <tr id={m.id} className="hover:bg-[#F6F7FB]/10 transition-colors group scroll-mt-24">
                                            <td className="p-4 align-top">
                                                {renderStageAndConditions(m, mainIndex, isCleared, i, items.length)}
                                            </td>
                                            <td className="p-4 text-center align-top">
                                                <div className="flex flex-col items-center justify-center gap-1.5">
                                                    {!isCleared && (
                                                        <div className="flex bg-[#EDEFF7] p-0.5 rounded-lg border border-[#E2E5F0] select-none">
                                                            <button 
                                                                onClick={() => handleUpdateMilestone(mainIndex, { isFixedAmount: false })}
                                                                className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-all ${!m.isFixedAmount ? 'bg-white text-[#334486] shadow-xs' : 'text-[#5A628A] hover:text-[#252C4E]'}`}
                                                                title="Percentage Mode"
                                                            >
                                                                %
                                                            </button>
                                                            <button 
                                                                onClick={() => handleUpdateMilestone(mainIndex, { isFixedAmount: true, fixedAmount: m.fixedAmount || rowBaseOriginal })}
                                                                className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-all ${m.isFixedAmount ? 'bg-white text-[#334486] shadow-xs' : 'text-[#5A628A] hover:text-[#252C4E]'}`}
                                                                title="Fixed Amount Mode"
                                                            >
                                                                ₹
                                                            </button>
                                                        </div>
                                                    )}
                                                    {!m.isFixedAmount ? (
                                                        <div className="flex items-center gap-1 text-[#1B2240] font-bold tabular-nums">
                                                            {isCleared ? (
                                                                <span>{m.percentage}%</span>
                                                            ) : (
                                                                <>
                                                                    <input 
                                                                        type="number" 
                                                                        value={m.percentage} 
                                                                        onChange={e => handleUpdateMilestone(mainIndex, { percentage: Number(e.target.value) })}
                                                                        className="w-10 text-center font-bold text-[#252C4E] outline-none bg-[#F6F7FB] border border-[#E2E5F0] rounded-lg py-1 focus:ring-1 focus:ring-[#ADBBDA]"
                                                                    />
                                                                    <span className="text-[10px] text-[#8E96B8] font-bold">%</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1 text-[#1B2240] font-bold tabular-nums">
                                                            {isCleared ? (
                                                                <span>{formatCurrency(m.fixedAmount || 0)}</span>
                                                            ) : (
                                                                <input 
                                                                    type="number" 
                                                                    value={m.fixedAmount || 0} 
                                                                    onChange={e => handleUpdateMilestone(mainIndex, { fixedAmount: Number(e.target.value) })}
                                                                    className="w-24 text-center font-bold text-[#252C4E] outline-none bg-amber-50/50 border border-amber-200/50 rounded-lg py-1 focus:ring-1 focus:ring-amber-400"
                                                                />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            
                                            <td className="p-4 text-right tabular-nums text-slate-900 bg-[#F6F7FB]/20 border-l border-[#EDEFF7] align-top">
                                                <div className="font-bold text-sm">{formatCurrency(rowInvoiceTotal + deductedInitiationFee)}</div>
                                                <div className="text-[9px] text-[#8E96B8]">
                                                    (Base: {formatCurrency(rowBillable)} + {applicableGstRate}% GST)
                                                </div>
                                            </td>

                                            <td className="p-4 text-center align-top">
                                                <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${statusColor}`}>
                                                    {m.status || 'Pending'}
                                                </div>
                                                {m.invoiceNumber && (
                                                    <div className="text-[9px] text-[#8E96B8] tabular-nums mt-1.5">{m.invoiceNumber}</div>
                                                )}
                                            </td>

                                            <td className="p-4 text-right align-top">
                                                {!m.status || m.status === 'pending' ? (
                                                    <button 
                                                        onClick={() => handleInvoiceAction(mainIndex, 'generate_invoice', effectiveTaxableBaseForLocking)}
                                                        className="px-3.5 py-1.5 bg-[#3D52A0] text-white text-xs font-bold rounded-xl shadow-xs hover:bg-[#334486] transition-all"
                                                    >
                                                        Raise Invoice
                                                    </button>
                                                ) : m.status === 'invoiced' ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button 
                                                            onClick={() => handleInvoiceAction(mainIndex, 'revert_invoice')}
                                                            className="p-1.5 text-[#8E96B8] hover:text-red-650 hover:bg-red-50 rounded transition-colors"
                                                            title="Revert Invoice"
                                                        >
                                                            <RotateCcw className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleInvoiceAction(mainIndex, 'mark_paid')}
                                                            className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-xl shadow-xs hover:bg-emerald-100 transition-all"
                                                        >
                                                            Mark Paid
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-emerald-600 text-xs font-extrabold flex items-center justify-end gap-1">
                                                        <CheckIcon className="w-3.5 h-3.5 stroke-2" /> Paid
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                        <tr className="bg-amber-50/20 border-t border-amber-100/50">
                                            <td className="p-4 pl-8 text-amber-900 text-xs font-semibold leading-relaxed">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-amber-500 font-bold">↳</span>
                                                    <span>Less: Project Initiation Fee (Design Retainer)</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center text-amber-600 tabular-nums text-xs">-</td>
                                            <td className="p-4 text-right tabular-nums text-amber-700 font-bold border-l border-[#EDEFF7] text-sm">-{formatCurrency(deductedInitiationFee)}</td>
                                            <td className="p-4 text-center">
                                                <span className="px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-800 border-emerald-200">Paid</span>
                                            </td>
                                            <td className="p-4 text-right tabular-nums text-xs">-</td>
                                        </tr>
                                        <tr className="bg-blue-50/10 border-t border-blue-100/40">
                                            <td className="p-4 pl-8 text-slate-900 text-xs font-bold leading-relaxed">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[#3D52A0] font-bold">↳</span>
                                                    <span>Balance Payable on Milestone</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center text-blue-600 tabular-nums text-xs">-</td>
                                            <td className="p-4 text-right tabular-nums text-slate-900 font-black border-l border-[#EDEFF7] text-sm">{formatCurrency(rowInvoiceTotal)}</td>
                                            <td className="p-4 text-center">
                                                <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${statusColor}`}>
                                                    {m.status || 'Pending'}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right tabular-nums text-xs">-</td>
                                        </tr>
                                    </React.Fragment>
                                );
                            }

                            return (
                                <tr key={m.id} id={m.id} data-milestone-id={m.id} className="hover:bg-[#F6F7FB]/10 transition-colors group scroll-mt-24">
                                    <td className="p-4 align-top">
                                        {renderStageAndConditions(m, mainIndex, isCleared, i, items.length)}
                                    </td>
                                    <td className="p-4 text-center align-top">
                                        <div className="flex flex-col items-center justify-center gap-1.5">
                                            {!isCleared && (
                                                <div className="flex bg-[#EDEFF7] p-0.5 rounded-lg border border-[#E2E5F0] select-none">
                                                    <button 
                                                        onClick={() => handleUpdateMilestone(mainIndex, { isFixedAmount: false })}
                                                        className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-all ${!m.isFixedAmount ? 'bg-white text-[#334486] shadow-xs' : 'text-[#5A628A] hover:bg-slate-200'}`}
                                                        title="Percentage Mode"
                                                    >
                                                        %
                                                    </button>
                                                    <button 
                                                        onClick={() => handleUpdateMilestone(mainIndex, { isFixedAmount: true, fixedAmount: m.fixedAmount || rowBaseOriginal })}
                                                        className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-all ${m.isFixedAmount ? 'bg-white text-[#334486] shadow-xs' : 'text-[#5A628A] hover:bg-slate-200'}`}
                                                        title="Fixed Amount Mode"
                                                    >
                                                        ₹
                                                    </button>
                                                </div>
                                            )}
                                            {!m.isFixedAmount ? (
                                                <div className="flex items-center gap-1 text-[#1B2240] font-bold tabular-nums">
                                                    {isCleared ? (
                                                        <span>{m.percentage}%</span>
                                                    ) : (
                                                        <>
                                                            <input 
                                                                type="number" 
                                                                value={m.percentage} 
                                                                onChange={e => handleUpdateMilestone(mainIndex, { percentage: Number(e.target.value) })}
                                                                className="w-10 text-center font-bold text-[#252C4E] outline-none bg-[#F6F7FB] border border-[#E2E5F0] rounded-lg py-1 focus:ring-1 focus:ring-[#ADBBDA]"
                                                            />
                                                            <span className="text-[10px] text-[#8E96B8] font-bold">%</span>
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 text-[#1B2240] font-bold tabular-nums">
                                                    {isCleared ? (
                                                        <span>{formatCurrency(m.fixedAmount || 0)}</span>
                                                    ) : (
                                                        <input 
                                                            type="number" 
                                                            value={m.fixedAmount || 0} 
                                                            onChange={e => handleUpdateMilestone(mainIndex, { fixedAmount: Number(e.target.value) })}
                                                            className="w-24 text-center font-bold text-[#252C4E] outline-none bg-amber-50/50 border border-amber-200/50 rounded-lg py-1 focus:ring-1 focus:ring-amber-400"
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    
                                    <td className="p-4 text-right tabular-nums text-slate-900 bg-[#F6F7FB]/20 border-l border-[#EDEFF7] align-top">
                                        <div className="font-bold text-sm">{formatCurrency(rowInvoiceTotal)}</div>
                                        <div className="text-[9px] text-[#6F779E] font-sans font-medium mt-0.5">
                                            (Base: {formatCurrency(rowBillable)} + {applicableGstRate}% GST)
                                        </div>
                                    </td>

                                    {isExecution && billablePercent < 100 && (
                                        <>
                                            <td className="p-4 text-right tabular-nums text-amber-900 bg-amber-50/5 border-l border-[#EDEFF7] font-bold align-top text-sm">
                                                {formatCurrency(rowCash)}
                                            </td>
                                            <td className="p-4 text-right tabular-nums text-[#12182F] bg-[#F6F7FB]/40 border-l border-[#EDEFF7] align-top">
                                                <div className="font-black text-sm">{formatCurrency(rowInvoiceTotal + rowCash)}</div>
                                                <div className="text-[9px] text-[#6F779E] font-sans font-medium mt-0.5">invoice + cash</div>
                                            </td>
                                        </>
                                    )}

                                    <td className="p-4 text-center align-top">
                                        <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${statusColor}`}>
                                            {m.status || 'Pending'}
                                        </div>
                                        {m.invoiceNumber && (
                                            <div className="text-[9px] text-[#8E96B8] tabular-nums mt-1.5">{m.invoiceNumber}</div>
                                        )}
                                    </td>

                                    <td className="p-4 text-right align-top">
                                        {!m.status || m.status === 'pending' ? (
                                            <button 
                                                onClick={() => handleInvoiceAction(mainIndex, 'generate_invoice', effectiveTaxableBaseForLocking)}
                                                className="px-3.5 py-1.5 bg-[#3D52A0] text-white text-xs font-bold rounded-xl shadow-xs hover:bg-[#334486] transition-all"
                                            >
                                                Raise Invoice
                                            </button>
                                        ) : m.status === 'invoiced' ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={() => handleInvoiceAction(mainIndex, 'revert_invoice')}
                                                    className="p-1.5 text-[#8E96B8] hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                    title="Revert Invoice"
                                                >
                                                    <RotateCcw className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={() => handleInvoiceAction(mainIndex, 'mark_paid')}
                                                    className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-xl shadow-xs hover:bg-emerald-100 transition-all"
                                                >
                                                    Mark Paid
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-emerald-600 text-xs font-extrabold flex items-center justify-end gap-1">
                                                <CheckIcon className="w-3.5 h-3.5 stroke-2" /> Paid
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                </div>

                <div className="p-4 bg-[#F6F7FB]/50 border-t border-[#EDEFF7] flex justify-center">
                    <button 
                        onClick={() => handleAddMilestone(isExecution ? 'execution' : 'design')}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E5F0] text-[#3A416B] text-xs font-extrabold rounded-xl shadow-sm hover:bg-[#F6F7FB] hover:text-[#3D52A0] transition-all"
                    >
                        <PlusIcon className="w-4 h-4" /> Add {isExecution ? 'Execution' : 'Design'} Milestone
                    </button>
                </div>
            </div>
        );
    };

    const renderSimpleTrackView = (
        items: PaymentMilestone[], 
        baseAmount: number, 
        originalBaseAmount: number,
        isExecution: boolean, 
        title: string
    ) => {
        let totalEffectivePercent = 0;
        items.forEach(m => {
            if (m.isFixedAmount && m.fixedAmount !== undefined) {
                totalEffectivePercent += baseAmount > 0 ? (m.fixedAmount / baseAmount) * 100 : 0;
            } else {
                totalEffectivePercent += m.percentage;
            }
        });
        const isBalanced = Math.abs(totalEffectivePercent - 100) < 0.1;

        const paidItems = items.filter(m => m.status === 'paid' || m.status === 'invoiced');
        const unpaidItems = items.filter(m => m.status !== 'paid' && m.status !== 'invoiced');
        
        let lockedBase = 0;
        paidItems.forEach(m => {
            if (m.isFixedAmount && m.fixedAmount !== undefined) {
                lockedBase += m.fixedAmount;
            } else {
                lockedBase += (m.lockedTaxableBase || originalBaseAmount) * (m.percentage / 100);
            }
        });
        const remainingBaseAmount = baseAmount - lockedBase;
        const firstPendingIndex = items.findIndex(m => m.status !== 'paid' && m.status !== 'invoiced');

        const viewMode = isExecution ? executionViewMode : designViewMode;
        const setViewMode = isExecution ? setExecutionViewMode : setDesignViewMode;

        return (
            <div className="bg-white border border-[#E2E5F0] rounded-2xl overflow-hidden shadow-sm mb-8">
                {/* Header */}
                <div className="bg-[#F6F7FB]/50 px-6 py-4 border-b border-[#E2E5F0] flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                        <h3 className="text-sm font-extrabold text-[#12182F] uppercase tracking-wider">{title} Tracking</h3>
                        <div className="text-[11px] text-[#5A628A] mt-1 flex flex-wrap gap-x-4 gap-y-1 items-center font-medium">
                            {baseAmount !== originalBaseAmount ? (
                                <div className="flex items-center gap-2">
                                    <span className="line-through text-[#8E96B8]" title="Original Taxable Base">Orig: {formatCurrency(originalBaseAmount)}</span>
                                    <span className="text-[#3D52A0] font-bold tabular-nums" title="Revised Taxable Base">Rev: {formatCurrency(baseAmount)}</span>
                                </div>
                            ) : (
                                <span>Taxable Base: <span className="tabular-nums font-bold text-[#3A416B]">{formatCurrency(baseAmount)}</span></span>
                            )}
                            {isExecution && (
                                <>
                                    {billablePercent < 100 && (
                                        <span className="text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200/60 tabular-nums text-[10px]">
                                            Split: {billablePercent}% / {100 - billablePercent}%
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Segmented Toggle Control */}
                        <div className="flex bg-[#EDEFF7] p-0.5 rounded-xl border border-[#E2E5F0] select-none">
                            <button 
                                onClick={() => setViewMode('simple')}
                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${viewMode === 'simple' ? 'bg-white text-slate-900 shadow-xs border border-[#E2E5F0]/50' : 'text-[#5A628A] hover:text-[#252C4E]'}`}
                            >
                                Simple
                            </button>
                            <button 
                                onClick={() => setViewMode('advanced')}
                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${viewMode === 'advanced' ? 'bg-white text-slate-900 shadow-xs border border-[#E2E5F0]/50' : 'text-[#5A628A] hover:text-[#252C4E]'}`}
                            >
                                Advanced
                            </button>
                        </div>
                        
                        {!isReadOnlyMode && (
                            <button
                                onClick={() => {
                                    setDatingTrack(isExecution ? 'execution' : 'design');
                                    setDateStart(isoOf(new Date()));
                                }}
                                className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl border border-[#E2E5F0] bg-white text-[#3A416B] hover:border-[#3D52A0] hover:text-[#3D52A0] transition-colors cursor-pointer"
                                title="Give every milestone in this track a date, spaced evenly"
                            >
                                Set dates
                            </button>
                        )}

                        <div className={`text-xs font-black px-3 py-1.5 rounded-xl border tabular-nums ${isBalanced ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
                            Total: {totalEffectivePercent.toFixed(1).replace('.0', '')}%
                        </div>
                    </div>
                </div>

                {/* Cards List */}
                <div className="p-6 bg-[#F6F7FB]/20 space-y-4">
                    {items.map((m, i) => {
                        const isCleared = m.status === 'paid' || m.status === 'invoiced';
                        let rowBaseOriginal = 0;
                        let effectiveTaxableBaseForLocking = baseAmount;
                        if (isCleared) {
                            rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : ((m.lockedTaxableBase || originalBaseAmount) * (m.percentage / 100));
                            effectiveTaxableBaseForLocking = m.lockedTaxableBase || originalBaseAmount;
                        } else {
                            if (m.isFixedAmount && m.fixedAmount !== undefined) {
                                rowBaseOriginal = m.fixedAmount;
                            } else {
                                const fixedPendingTotal = unpaidItems.filter(x => x.isFixedAmount).reduce((sum, x) => sum + (x.fixedAmount || 0), 0);
                                const remainingBaseAmountValue = Math.max(0, remainingBaseAmount - fixedPendingTotal);
                                
                                const unpaidPctExcludingFixed = unpaidItems.filter(x => !x.isFixedAmount).reduce((sum, x) => sum + x.percentage, 0);
                                const relativePct = unpaidPctExcludingFixed > 0 ? (m.percentage / unpaidPctExcludingFixed) : 0;
                                rowBaseOriginal = remainingBaseAmountValue * relativePct;
                            }
                            effectiveTaxableBaseForLocking = m.percentage > 0 ? (rowBaseOriginal / (m.percentage / 100)) : baseAmount;
                        }
                        rowBaseOriginal = Math.round(rowBaseOriginal);
                        
                        let rowBillable = Math.round(isExecution ? rowBaseOriginal * (billablePercent / 100) : rowBaseOriginal);
                        const rowCash = Math.round(isExecution ? rowBaseOriginal * ((100 - billablePercent) / 100) : 0);
                        
                        const applicableGstRate = isExecution
                            ? (executionGstEnabled ? gstRate : 0)
                            : (designGstEnabled ? gstRate : 0);
                        let rowGST = Math.round(rowBillable * (applicableGstRate / 100));
                        
                        let rowInvoiceTotal = Math.round(rowBillable + rowGST);
                        
                        let deductedInitiationFee = 0;
                        if (!isExecution && i === 0 && initiationFee > 0) {
                            deductedInitiationFee = Math.min(rowInvoiceTotal, initiationFee);
                            rowInvoiceTotal = Math.max(0, rowInvoiceTotal - initiationFee);
                        }

                        const mainIndex = milestones.findIndex(x => x.id === m.id);
                        
                        const statusColor = m.status === 'paid' 
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                            : m.status === 'invoiced' 
                                ? 'bg-[#EDE8F5]/50 text-[#2A3A73] border-[#ADBBDA]' 
                                : 'bg-[#F6F7FB] text-[#5A628A] border-[#E2E5F0]/50';

                        /*
                          What the client owes on this milestone, cash side included.

                          This showed the tax-invoice total alone, so a part-cash
                          execution milestone read lower here than the same milestone
                          did in Collections and in the realization pipeline, both of
                          which count the cash portion as money owed. The Inv | Cash
                          line directly beneath already breaks this figure into its
                          two parts, and the Advanced table still lists them in
                          separate columns, so nothing about the invoice itself is
                          restated — only the total is now present.

                          Zero for design milestones and for fully billable execution,
                          so this changes nothing outside a genuine cash split.
                        */
                        const finalItemAmountToShow = rowInvoiceTotal + rowCash;

                        const isNextUp = i === firstPendingIndex;

                        return (
                            <motion.div 
                                key={m.id}
                                data-milestone-id={m.id}
                                
                                animate={isNextUp ? {
                                    boxShadow: [
                                        "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                                        "0 0 0 3px rgba(99, 102, 241, 0.15)",
                                        "0 1px 2px 0 rgba(0, 0, 0, 0.05)"
                                    ]
                                } : {}}
                                transition={isNextUp ? {
                                    duration: 3,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                } : {}}
                                className={`bg-white border ${isNextUp ? 'border-[#ADBBDA] shadow-md' : 'border-[#E2E5F0]/80 hover:border-[#CBD1E4]'} rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative transition-all shadow-xs pl-6`}
                            >
                                {/* Colored Left Accent Bar with Heartbeat effect if Next Up */}
                                <motion.div 
                                    animate={isNextUp ? {
                                        opacity: [1, 0.6, 1]
                                    } : {}}
                                    transition={isNextUp ? {
                                        duration: 1.5,
                                        repeat: Infinity,
                                        ease: "easeInOut"
                                    } : {}}
                                    className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${isExecution ? 'bg-amber-400' : 'bg-[#3D52A0]'}`} 
                                />

                                {/* Milestone Info Column */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {isCleared ? (
                                            <span className="font-extrabold text-[#12182F] text-sm block truncate">{m.name}</span>
                                        ) : (
                                            <input 
                                                type="text" 
                                                value={m.name} 
                                                onChange={e => handleUpdateMilestone(mainIndex, { name: e.target.value })}
                                                className="bg-transparent font-extrabold text-[#12182F] text-sm py-0.5 outline-none focus:border-b focus:border-[#8E96B8] w-full"
                                            />
                                        )}
                                        {isNextUp && (
                                            <span className="inline-flex items-center gap-1 bg-[#EDE8F5] text-[#334486] text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider select-none shrink-0 h-4.5 border border-[#DDE3F5]">
                                                <motion.span 
                                                    animate={{ opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
                                                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                                    className="w-1.5 h-1.5 bg-[#3D52A0] rounded-full inline-block"
                                                />
                                                Next Up
                                            </span>
                                        )}
                                        {(!m.status || m.status === 'pending') && (
                                            <div className="flex items-center gap-1 shrink-0 select-none">
                                                <button 
                                                    onClick={() => handleMoveMilestone(m.id, 'up')}
                                                    disabled={i === 0}
                                                    className={`p-1 rounded transition-colors ${i === 0 ? 'text-[#E2E5F0] cursor-not-allowed' : 'text-[#5A628A] hover:text-[#252C4E] hover:bg-[#EDEFF7]'}`}
                                                    title="Move Up"
                                                >
                                                    <ChevronUpIcon className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleMoveMilestone(m.id, 'down')}
                                                    disabled={i === items.length - 1}
                                                    className={`p-1 rounded transition-colors ${i === items.length - 1 ? 'text-[#E2E5F0] cursor-not-allowed' : 'text-[#5A628A] hover:text-[#252C4E] hover:bg-[#EDEFF7]'}`}
                                                    title="Move Down"
                                                >
                                                    <ChevronDownIcon className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleSplitMilestone(m.id)}
                                                    className="text-[#8E96B8] hover:text-[#3D52A0] p-1 hover:bg-[#EDE8F5] rounded transition-colors"
                                                    title="Split Milestone"
                                                >
                                                    <ScissorsIcon className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteMilestone(mainIndex)}
                                                    className="text-[#8E96B8] hover:text-red-500 p-1 hover:bg-red-55 rounded transition-colors shrink-0"
                                                    title="Delete Milestone"
                                                >
                                                    <DeleteIcon className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-[#5A628A] mt-1 leading-relaxed">
                                        {isCleared ? (
                                            <span>{m.unlocks || m.description || 'No deliverables mapped.'}</span>
                                        ) : (
                                            <input 
                                                type="text" 
                                                value={m.unlocks || m.description || ''} 
                                                onChange={e => handleUpdateMilestone(mainIndex, { unlocks: e.target.value })}
                                                placeholder="Unlocks deliverables..."
                                                className="bg-transparent text-[11px] text-[#5A628A] focus:border-b focus:border-[#8E96B8] w-full outline-none"
                                            />
                                        )}
                                    </div>
                                    {/*
                                      The target date.

                                      `PaymentMilestone.date` has always existed and nothing
                                      on this screen ever wrote to it, so every milestone
                                      carried null and no cash-flow forecast was possible.
                                      It is edited here, where the schedule is planned.

                                      Note this is client-visible: the portal's spine, tables
                                      and timeline all read this field, so a date entered
                                      here appears in what the client sees.
                                    */}
                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                        {renderTargetDate(m, mainIndex, isCleared)}
                                    </div>
                                    {m.invoiceNumber && (
                                        <div className="text-[9px] text-[#8E96B8] tabular-nums mt-1.5">Ref: {m.invoiceNumber}</div>
                                    )}
                                </div>

                                {/* Calculation and Inputs Column */}
                                <div className="flex flex-wrap items-center gap-4 sm:gap-6 shrink-0">
                                    {/* Percentage input */}
                                    <div className="flex items-center gap-1.5">
                                        {!m.isFixedAmount ? (
                                            <div className="flex items-center gap-1">
                                                {isCleared ? (
                                                    <span className="font-bold text-[#3A416B] bg-[#F6F7FB] px-2.5 py-1 rounded-lg border border-[#E2E5F0] text-xs tabular-nums">{m.percentage}%</span>
                                                ) : (
                                                    <>
                                                        <input 
                                                            type="number" 
                                                            value={m.percentage} 
                                                            onChange={e => handleUpdateMilestone(mainIndex, { percentage: Number(e.target.value) })}
                                                            className="w-12 text-center text-xs font-bold text-[#252C4E] outline-none bg-[#F6F7FB] border border-[#E2E5F0] rounded-lg py-1 focus:ring-1 focus:ring-[#ADBBDA] tabular-nums"
                                                        />
                                                        <span className="text-[10px] text-[#8E96B8] font-bold">%</span>
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1">
                                                {isCleared ? (
                                                    <span className="font-bold text-[#3A416B] bg-[#F6F7FB] px-2.5 py-1 rounded-lg border border-[#E2E5F0] text-xs tabular-nums">{formatCurrency(m.fixedAmount || 0)}</span>
                                                ) : (
                                                    <input 
                                                        type="number" 
                                                        value={m.fixedAmount || 0} 
                                                        onChange={e => handleUpdateMilestone(mainIndex, { fixedAmount: Number(e.target.value) })}
                                                        className="w-24 text-center text-xs font-bold text-[#252C4E] outline-none bg-amber-50/50 border border-amber-200/50 rounded-lg py-1 focus:ring-1 focus:ring-amber-400 tabular-nums"
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Amount Display */}
                                    <div className="text-right min-w-[100px]">
                                        <div className="font-extrabold text-[#12182F] text-sm tabular-nums">{formatCurrency(finalItemAmountToShow)}</div>
                                        {isExecution && billablePercent < 100 && (
                                            <div className="text-[9px] text-[#8E96B8] tabular-nums mt-0.5">
                                                Inv: {formatCurrency(rowInvoiceTotal)} | Cash: {formatCurrency(rowCash)}
                                            </div>
                                        )}
                                        {deductedInitiationFee > 0 && (
                                            <div className="text-[9px] text-amber-700 tabular-nums mt-0.5">
                                                -{formatCurrency(deductedInitiationFee)} Retainer applied (Gross: {formatCurrency(rowInvoiceTotal + deductedInitiationFee)})
                                            </div>
                                        )}
                                    </div>

                                    {/* Status Badge */}
                                    <div className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider text-center w-20 shrink-0 ${statusColor}`}>
                                        {m.status || 'Pending'}
                                    </div>

                                    {/* Action Button */}
                                    <div className="w-24 flex justify-end shrink-0">
                                        {!m.status || m.status === 'pending' ? (
                                            <button 
                                                onClick={() => handleInvoiceAction(mainIndex, 'generate_invoice', effectiveTaxableBaseForLocking)}
                                                className="w-full text-center px-3 py-1.5 bg-[#3D52A0] hover:bg-[#334486] text-white text-[11px] font-extrabold rounded-xl shadow-xs transition-all uppercase tracking-wider"
                                            >
                                                Raise
                                            </button>
                                        ) : m.status === 'invoiced' ? (
                                            <div className="flex items-center gap-1.5 w-full">
                                                <button 
                                                    onClick={() => handleInvoiceAction(mainIndex, 'revert_invoice')}
                                                    className="p-1.5 text-[#8E96B8] hover:text-red-650 hover:bg-red-50 rounded transition-colors shrink-0"
                                                    title="Revert Invoice"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleInvoiceAction(mainIndex, 'mark_paid')}
                                                    className="flex-1 text-center py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-extrabold rounded-xl shadow-xs transition-all uppercase tracking-wider"
                                                >
                                                    Paid
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-emerald-600 text-xs font-extrabold flex items-center gap-1">
                                                <CheckIcon className="w-3.5 h-3.5 stroke-2" /> Paid
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Switching help caption */}
                <div className="px-6 py-2 bg-[#F6F7FB]/50 border-t border-[#E2E5F0]">
                    <p className="text-[10px] text-[#8E96B8] text-center font-medium leading-relaxed">
                        Switch to <span className="font-extrabold text-[#3D52A0] cursor-pointer hover:underline" onClick={() => setViewMode('advanced')}>Advanced View</span> for triggers, release conditions, fixed amounts & cash split.
                    </p>
                </div>

                {/* Footer Add Button */}
                <div className="bg-[#F6F7FB]/50 px-6 py-4 border-t border-[#E2E5F0] flex justify-center">
                    <button 
                        onClick={() => handleAddMilestone(isExecution ? 'execution' : 'design')}
                        className="px-4 py-2 bg-white hover:bg-[#F6F7FB] border border-[#E2E5F0] rounded-xl text-xs font-bold text-[#3A416B] shadow-xs flex items-center gap-1.5 transition-all"
                    >
                        <PlusIcon className="w-3.5 h-3.5" /> Add {isExecution ? 'Execution' : 'Design'} Milestone
                    </button>
                </div>
            </div>
        );
    };

    // --- TAX SIMULATOR ---
    const [showTaxSimulator, setShowTaxSimulator] = useState(false);
    const [customMaterialRatio, setCustomMaterialRatio] = useState<number | null>(null);
    const [materialGstRecovery, setMaterialGstRecovery] = useState<number>(18);
    const [simulatedLaborGstEnabled, setSimulatedLaborGstEnabled] = useState<boolean>(true);
    const [laborGstRecovery, setLaborGstRecovery] = useState<number>(18);

    let materialSellRaw = 0;
    let laborSellRaw = 0;
    let materialCostRaw = 0;
    let laborCostRaw = 0;

    if (fullBoq && fullBoq.length > 0) {
        fullBoq.forEach(item => {
            const margin = item.marginOverride ?? item.margin ?? 20;
            const mCost = item.materials || 0;
            const lCost = item.labor || 0;
            const qty = item.qty || 1;
            
            materialCostRaw += mCost * qty;
            laborCostRaw += lCost * qty;
            
            const mSell = calculateSellPrice(mCost, 0, margin) * qty;
            const lSell = calculateSellPrice(0, lCost, margin) * qty;

            materialSellRaw += mSell;
            laborSellRaw += lSell;
        });
    }

    const totalRaw = materialSellRaw + laborSellRaw;
    const dynamicMaterialRatio = totalRaw > 0 ? materialSellRaw / totalRaw : 0;
    const dynamicLaborRatio = totalRaw > 0 ? laborSellRaw / totalRaw : 0;

    const materialRatio = customMaterialRatio !== null ? customMaterialRatio : dynamicMaterialRatio;
    const laborRatio = 1 - materialRatio;

    const simulatedTaxableLabor = taxableExecution * laborRatio;
    const simulatedTaxableMaterial = taxableExecution * materialRatio;

    const simulatedGstOnDesign = taxableDesign * 0.18;
    const simulatedGstOnLabor = simulatedLaborGstEnabled ? simulatedTaxableLabor * 0.18 : 0;
    const simulatedLaborRecovery = !simulatedLaborGstEnabled ? simulatedTaxableLabor * (laborGstRecovery / 100) : 0;
    const simulatedMaterialRecovery = simulatedTaxableMaterial * (materialGstRecovery / 100);

    const simulatedTotalGST = simulatedGstOnDesign + simulatedGstOnLabor;
    
    // The Studio pays ~18% GST on material purchases which is lost (dead cost) if sold in cash
    const estimatedMaterialInputGst = materialCostRaw * 0.18;
    
    const execProfitCurrent = taxableExecution - (materialCostRaw + laborCostRaw);
    const designProfitCurrent = taxableDesign; 
    
    // Theoretical profit accounts for the dead input GST, plus whatever recovery we charge the client in cash
    const theoreticalProfit = execProfitCurrent + designProfitCurrent - estimatedMaterialInputGst + simulatedMaterialRecovery + simulatedLaborRecovery;
    
    const newGrossProjectValue = taxableDesign + taxableExecution + simulatedTotalGST + simulatedMaterialRecovery + simulatedLaborRecovery;
    const profitMargin = (taxableDesign + taxableExecution) > 0 ? (theoreticalProfit / (taxableDesign + taxableExecution)) * 100 : 0;

    // Proportions for the visual pipeline progress bar
    const totalInvoicedButNotPaid = useMemo(() => {
        let invoicedUnpaid = 0;
        milestones.forEach((m) => {
            if (m.status === 'invoiced') {
                /*
                  The base locked at invoice time, not the live one.

                  This was the only place that priced an invoiced milestone off
                  the current taxable base while every other site here — the
                  milestone row, totalPaid, the collections panel — used the
                  base captured when the invoice went out. So the pipeline
                  reported a different figure for the same invoice than the row
                  right above it, and the difference grew every time the
                  contract value moved after billing.
                */
                const trackBase = m.lockedTaxableBase || (m.type === 'execution' ? originalNetExecution : originalNetDesign);
                let rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : trackBase * (m.percentage / 100);
                rowBaseOriginal = Math.round(rowBaseOriginal);
                let rowBillable = Math.round(m.type === 'execution' ? rowBaseOriginal * (billablePercent / 100) : rowBaseOriginal);
                const applicableGstRate = m.type === 'execution' ? (executionGstEnabled ? gstRate : 0) : gstRate;
                let rowGST = Math.round(rowBillable * (applicableGstRate / 100));
                let rowInvoiceTotal = Math.round(rowBillable + rowGST);
                
                // Adjust for first design milestone initiation fee subtraction
                const firstDesignMilestoneId = milestones.find(x => x.type === 'design')?.id;
                if (m.id === firstDesignMilestoneId && initiationFee > 0) {
                    rowInvoiceTotal = Math.max(0, rowInvoiceTotal - initiationFee);
                }

                /*
                  The cash side counts too.

                  Gross project value includes the cash component and totalPaid
                  adds it back when a milestone settles, so leaving it out here
                  pushed the cash half of an invoiced execution milestone into
                  Pending Release — reported as not yet asked for when it had
                  already been billed. Design milestones have no cash side, so
                  this is zero for them.
                */
                const rowCash = m.type === 'execution'
                    ? Math.round(rowBaseOriginal * ((100 - billablePercent) / 100))
                    : 0;

                invoicedUnpaid += rowInvoiceTotal + rowCash;
            }
        });
        return invoicedUnpaid;
    }, [milestones, originalNetDesign, originalNetExecution, gstRate, initiationFee, billablePercent, executionGstEnabled]);

    const paidPercentOfGross = grossProjectValue > 0 ? (totalPaid / grossProjectValue) * 100 : 0;
    const invoicedPercentOfGross = grossProjectValue > 0 ? (totalInvoicedButNotPaid / grossProjectValue) * 100 : 0;
    const pendingPercentOfGross = Math.max(0, 100 - paidPercentOfGross - invoicedPercentOfGross);

    const billingInsights = useMemo(() => {
        const list: { type: 'info' | 'warning' | 'success'; text: string }[] = [];
        
        // 1. Sign-up Retainer Check
        const hasPaidInvoices = milestones.some(m => m.status === 'paid' || m.status === 'invoiced');
        if (!hasPaidInvoices) {
            list.push({
                type: 'warning',
                text: 'No active payments or invoices recorded. Recommend raising the Design Retainer (D1) to formalize engagement and unlock Discovery.'
            });
        }

        // 2. Unbalanced Milestones Check
        let totalDesignPct = 0;
        let totalExecPct = 0;
        milestones.forEach(m => {
            if (m.type === 'design') {
                totalDesignPct += m.isFixedAmount && m.fixedAmount !== undefined && originalNetDesign > 0 ? (m.fixedAmount / originalNetDesign) * 100 : m.percentage;
            } else {
                totalExecPct += m.isFixedAmount && m.fixedAmount !== undefined && originalNetExecution > 0 ? (m.fixedAmount / originalNetExecution) * 100 : m.percentage;
            }
        });
        if (Math.abs(totalDesignPct - 100) > 0.1) {
            list.push({
                type: 'warning',
                text: `Design milestones sum to ${Math.round(totalDesignPct)}% (should equal 100%). Adjust stages to balance the design fee track.`
            });
        }
        if (Math.abs(totalExecPct - 100) > 0.1) {
            list.push({
                type: 'warning',
                text: `Execution milestones sum to ${Math.round(totalExecPct)}% (should equal 100%). Adjust stages to balance the execution track.`
            });
        }

        // 3. Design Gate Progress Check
        const allDesignInvoicedOrPaid = designMilestones.length > 0 && designMilestones.every(m => m.status === 'paid' || m.status === 'invoiced');
        const projectStageNum = projectContext.lifecycle?.stage || 1;
        if (allDesignInvoicedOrPaid && projectStageNum < 5) {
            list.push({
                type: 'info',
                text: 'All Design milestones are invoiced or paid. Consider advancing the project stage to Execution (Stage 5) to initiate civil/material orders.',
            });
        }

        // 4. Tax Threshold Alert
        if (cashUtilization > 80) {
            list.push({
                type: 'warning',
                text: `Yearly cash utilization across active studio projects is at ${Math.round(cashUtilization)}%. Standardize remaining execution milestones to GST-applicable billing to mitigate tax risks.`
            });
        }

        // 5. Missing Handover Tag Check
        const hasHandoverTag = executionMilestones.some(m => m.isHandoverAdvance);
        if (executionMilestones.length > 0 && !hasHandoverTag) {
            list.push({
                type: 'info',
                text: 'Best Practice: No execution milestone is marked as the final Handover Advance (Clause 6.4). Tag the final milestone to connect to keys/documentation delivery.'
            });
        }

        /*
          6. Terms acknowledgement.

          This read `engagement.status`, which only the Engagement Lifecycle
          widget ever wrote. Once a studio releases documents through the
          Documents board instead, that field stays 'draft' forever — so this
          warned that the client had not acknowledged the Payment Schedule on
          projects where they demonstrably had, certificate and all.
        */
        const psState = resolveDocumentState(projectContext, 'payment_schedule');
        const tdState = resolveDocumentState(projectContext, 'terms_docket');
        const settled = (st: any) => st === 'signed' || st === 'executed';
        const acknowledgedCanonically = settled(psState) && settled(tdState);

        if (!acknowledgedCanonically && projectContext.engagement?.status !== 'acknowledged') {
            list.push({
                type: 'warning',
                text: 'The client has not acknowledged the Payment Schedule and Terms Docket. Secure digital approval, or raise invoices as a special-case exception on the condition that amended terms will be signed later.'
            });
        }

        // 7. Pending Release Conditions
        milestones.forEach(m => {
            const pendingSteps = m.subSteps?.filter(s => !s.isDone) || [];
            if (pendingSteps.length > 0 && m.status !== 'paid') {
                list.push({
                    type: 'info',
                    text: `Milestone "${m.name}" has ${pendingSteps.length} pending release condition(s). Resolve all conditions prior to marking as paid.`
                });
            }
        });

        // 8. General Health Success
        if (list.length === 0) {
            list.push({
                type: 'success',
                text: 'Payment structure and records are fully balanced, compliant, and synchronized with client-approved dockets.'
            });
        }

        return list;
    }, [milestones, originalNetDesign, originalNetExecution, projectContext.lifecycle?.stage, cashUtilization, projectContext.engagement?.status, designMilestones, executionMilestones]);

    return (
        <div className="mny w-full space-y-6 animate-in fade-in">
            
            {/* Read-only Alert Bar if viewing a historical version */}
            {isReadOnlyMode && selectedHistoricalEntry && (
                <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl mt-0.5 md:mt-0">
                            <Lock className="w-5 h-5 text-amber-800" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="text-sm font-extrabold text-amber-900">Historical Read-Only Archive</h4>
                                {selectedHistoricalEntry.lifecycleTag && (
                                    <span className="text-[10px] bg-amber-200/80 text-amber-950 font-bold px-2 py-0.5 rounded-full">
                                        {selectedHistoricalEntry.lifecycleTag}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-amber-800 mt-1">
                                You are viewing the frozen milestone configuration for <strong>{selectedHistoricalEntry.name}</strong> • Execution Base: <strong>{formatCurrency(selectedHistoricalEntry.executionValue)}</strong> • Design Fee: <strong>{formatCurrency(selectedHistoricalEntry.designValue)}</strong> ({new Date(selectedHistoricalEntry.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}). All modifications, updates, and integrations are disabled.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 self-stretch md:self-auto">
                        <button
                            onClick={() => setCompareRevision({
                                name: selectedHistoricalEntry.name,
                                date: selectedHistoricalEntry.timestamp,
                                previousExecutionValue: selectedHistoricalEntry.executionValue,
                                previousDesignValue: selectedHistoricalEntry.designValue,
                                milestones: selectedHistoricalEntry.milestones,
                                reason: `Historical Version: ${selectedHistoricalEntry.name} (${selectedHistoricalEntry.lifecycleTag || 'Archived'})`
                            })}
                            className="px-3.5 py-2 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 font-bold text-xs rounded-xl transition-all shadow-xs"
                        >
                            Compare with Live
                        </button>
                        <button
                            onClick={() => setSelectedSnapshotId(null)}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl transition-all shadow-sm text-center"
                        >
                            Return to Live Billing
                        </button>
                    </div>
                </div>
            )}
            


            {/* Slide-over Drawer for Smart Features */}
            <AnimatePresence>
                {activeSmartView !== 'none' && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setActiveSmartView('none')}
                            className="fixed inset-0 bg-[#0B1026]/40 backdrop-blur-sm z-50 transition-all"
                        />
                        {/* Drawer Panel */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed inset-y-0 right-0 w-full max-w-4xl bg-white shadow-2xl border-l border-[#E2E5F0] z-50 flex flex-col h-full"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-[#EDEFF7] bg-[#F6F7FB]/50">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-xl ${activeSmartView === 'margin' ? 'bg-[#EDE8F5] text-[#3D52A0]' : 'bg-amber-50 text-amber-600'}`}>
                                        {activeSmartView === 'margin' ? <TrendingUp className="w-5 h-5" /> : <Coins className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-[#12182F]">
                                            {activeSmartView === 'margin' ? 'Interactive Margin Optimizer' : 'Cash Flow Forecast Dashboard'}
                                        </h3>
                                        <p className="text-xs text-[#8E96B8]">
                                            {activeSmartView === 'margin' ? 'Simulate pricing tracks and optimize profit margins inline' : 'Analyze monthly billings, forecast inflows, and optimize capital efficiency'}
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setActiveSmartView('none')}
                                    className="px-3.5 py-2 bg-[#EDEFF7] hover:bg-[#E2E5F0] text-[#4A5178] hover:text-[#12182F] rounded-xl transition-all duration-150 font-bold text-xs flex items-center gap-1.5 shadow-xs"
                                >
                                    <span>✕ Close Panel</span>
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {activeSmartView === 'margin' ? (
                                    setBoq ? (
                                        <MarginOptimizer boq={fullBoq} setBoq={setBoq} aiStrategy={aiStrategy} />
                                    ) : (
                                        <div className="p-6 text-center text-sm text-[#5A628A]">
                                            Designer role or missing BOQ write permissions.
                                        </div>
                                    )
                                ) : (
                                    <CashFlowForecastDashboard />
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {activeTier && (
                <>
                    {/*
                      The money summary, and the four ways into it.

                      This is the one place the whole picture is stated: what
                      has been billed, what has landed, what is late. The
                      sections below are unchanged — they are simply behind
                      whichever tab they belong to now.
                    */}
                    <div className="relative overflow-hidden bg-white border border-[#E2E5F0] rounded-2xl px-5 py-4 mny-frame">
                        <div className="mny-sweep" />
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <h2 className="text-lg font-black tracking-tight text-[#12182F]">Money</h2>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                        chase.amountOverdue > 0
                                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                                            : billable.total > 0
                                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                : 'bg-[#EDE8F5] text-[#3D52A0] border-[#ADBBDA]'
                                    }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                            chase.amountOverdue > 0 ? 'bg-rose-500 mny-pulse'
                                            : billable.total > 0 ? 'bg-amber-500' : 'bg-[#3D52A0]'
                                        }`} />
                                        {chase.amountOverdue > 0
                                            ? 'Overdue'
                                            : billable.total > 0
                                                ? 'Ready to bill'
                                                : 'Nothing outstanding'}
                                    </span>
                                </div>
                                {availableVersions.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => setMoneyTab('history')}
                                        title="Switch or audit billing versions in History"
                                        className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-md bg-[#F6F7FB] border border-[#E2E5F0] text-[10px] font-bold text-[#5A628A] hover:border-[#ADBBDA] hover:text-[#3D52A0] transition-colors cursor-pointer"
                                    >
                                        <History className="w-3 h-3" />
                                        {selectedHistoricalEntry
                                            ? `Viewing ${selectedHistoricalEntry.name}`
                                            : (availableVersions.find(v => v.isCurrentActive)?.name || 'Active version')}
                                        <span className="text-[#8E96B8]">· {availableVersions.length} total</span>
                                    </button>
                                )}
                                <p className="text-xs text-[#5A628A] font-semibold mt-1">
                                    {milestones.length} {milestones.length === 1 ? 'milestone' : 'milestones'} against a contract of{' '}
                                    <b className="text-[#12182F]">{formatCurrency(grossProjectValue)}</b>
                                </p>
                                <div className="mt-2.5 h-1.5 w-full max-w-md rounded-full bg-[#EDEFF7] overflow-hidden mny-progress">
                                    <div
                                        className="h-full rounded-full mny-bar"
                                        style={{
                                            width: `${grossProjectValue > 0 ? Math.min(100, (totalPaid / grossProjectValue) * 100) : 0}%`,
                                            background: 'linear-gradient(90deg,#7091E6,#3D52A0)',
                                        }}
                                    />
                                </div>
                            </div>

                            {/*
                              The right half of this header was empty.

                              It now carries the one picture the whole screen is
                              about: of everything contracted, how much has landed,
                              how much is invoiced and waiting, and how much has not
                              been asked for yet. The ring draws itself on arrival
                              and the figure counts up to meet it.
                            */}
                            {grossProjectValue > 0 && (() => {
                                const paidPct = Math.min(100, (totalPaid / grossProjectValue) * 100);
                                const billedPct = Math.min(100 - paidPct, (billable.total / grossProjectValue) * 100);
                                const R = 46, C = 2 * Math.PI * R;
                                const seg = (pct: number) => (pct / 100) * C;
                                return (
                                    <div className="flex items-center gap-5 shrink-0 mny-rise" style={{ animationDelay: '.2s' }}>
                                        <div className="relative shrink-0">
                                            <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
                                                <circle cx="56" cy="56" r={R} fill="none" stroke="#EDEFF7" strokeWidth="11" />
                                                {/* not yet asked for sits under everything */}
                                                <circle
                                                    cx="56" cy="56" r={R} fill="none" stroke="#ADBBDA" strokeWidth="11" strokeLinecap="round"
                                                    className="mny-ring"
                                                    style={{ strokeDasharray: C, strokeDashoffset: C - seg(paidPct + billedPct),
                                                             ['--ring-len' as any]: String(C), ['--ring-off' as any]: String(C - seg(paidPct + billedPct)) }}
                                                />
                                                <circle
                                                    cx="56" cy="56" r={R} fill="none" stroke="#3D52A0" strokeWidth="11" strokeLinecap="round"
                                                    className="mny-ring"
                                                    style={{ strokeDasharray: C, strokeDashoffset: C - seg(paidPct), animationDelay: '.35s',
                                                             ['--ring-len' as any]: String(C), ['--ring-off' as any]: String(C - seg(paidPct)) }}
                                                />
                                            </svg>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <span className="text-xl font-black text-[#12182F] tabular-nums leading-none">
                                                    <AnimatedNumber value={Math.round(paidPct)} format={v => `${Math.round(v)}%`} />
                                                </span>
                                                <span className="text-[9px] font-bold uppercase tracking-wider text-[#8E96B8] mt-0.5">collected</span>
                                            </div>
                                        </div>

                                        <div className="space-y-2 min-w-[150px]">
                                            {([
                                                ['Collected', totalPaid, '#3D52A0'],
                                                ['Next to bill', billable.total, '#ADBBDA'],
                                                ['Not yet raised', Math.max(0, grossProjectValue - totalPaid - billable.total), '#EDEFF7'],
                                            ] as [string, number, string][]).map(([label, val, col]) => (
                                                <div key={label} className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-sm shrink-0 border border-[#E2E5F0]" style={{ background: col }} />
                                                    <span className="text-[11px] text-[#5A628A] flex-1">{label}</span>
                                                    <span className="text-[11px] font-bold text-[#12182F] tabular-nums">{formatCurrency(val)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="mt-4">
                            <Tabs
                                ariaLabel="Money sections"
                                value={moneyTab}
                                onChange={(id) => setMoneyTab(id as any)}
                                items={[
                                    { id: 'overview', label: 'Overview' },
                                    { id: 'milestones', label: 'Milestones', count: milestones.length },
                                    { id: 'tax', label: 'Tax & ratios' },
                                    { id: 'history', label: 'History', count: (financials?.paymentRevisions || []).length, tone: 'attention' },
                                ]}
                            />
                        </div>
                    </div>

                    {moneyTab === 'overview' && (<>
                    {/*
                      The four questions that decide whether a project collects.

                      Every figure here comes from records this screen already
                      held and never read: payment-request timestamps against
                      the studio's own escalation thresholds, milestone
                      sub-steps and dates, and the revision log.
                    */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">

                        {/* Who is late */}
                        <button type="button" onClick={() => setMoneyTab('milestones')} className={PANEL_CLASS} style={{ animationDelay: '.08s' }}>
                            <PanelHead
                                title="Collections"
                                action="See the schedule &rsaquo;"
                                tone={chase.chaseNow > 0 ? 'alert' : chase.items.length > 0 ? 'watch' : 'clear'}
                                state={chase.chaseNow > 0
                                    ? `${chase.chaseNow} past due`
                                    : chase.items.length > 0
                                        ? `${chase.items.length} open`
                                        : 'Nothing to chase'}
                            />
                            <PanelMetric
                                value={formatCurrency(chase.amountOutstanding)}
                                caption="outstanding"
                                muted={chase.amountOutstanding === 0}
                            />

                            {chase.items.length === 0 ? (
                                <>
                                    {/*
                                      The escalation ladder was drawn here in full colour
                                      whatever the state, so a project with nothing
                                      outstanding showed an amber-to-red bar under the
                                      words "nothing to chase". With no request open the
                                      terms are just terms, so they read as a line of text
                                      and the ladder returns when something is on it.
                                    */}
                                    <p className="text-[11px] text-[#8E96B8] mt-1.5 leading-snug">
                                        No request open &middot; terms {chase.thresholds.reminderDays}d remind
                                        &middot; {chase.thresholds.warnDays}d call
                                        &middot; {chase.thresholds.pauseDays}d hold
                                    </p>
                                    {behaviourBlock}
                                </>
                            ) : (
                                <>
                                    {/*
                                      The ladder, now that something is actually on it.
                                      A caret marks where the oldest item stands against
                                      the studio's own thresholds, so the terms are read
                                      as a position rather than as decoration.
                                    */}
                                    {(() => {
                                        const th = chase.thresholds;
                                        const pause = th.pauseDays || 1;
                                        const at = (d: number) => Math.min(100, Math.max(0, (d / pause) * 100));
                                        const worst = chase.worst;
                                        return (
                                            <div className="mt-3">
                                                <div className="relative">
                                                    <div className="flex h-2 rounded-full overflow-hidden bg-[#EDEFF7]">
                                                        <div className="mny-bar" style={{ width: `${at(th.reminderDays)}%`, background: '#ADBBDA' }} />
                                                        <div className="mny-bar" style={{ width: `${at(th.warnDays) - at(th.reminderDays)}%`, background: '#D9A441', animationDelay: '.1s' }} />
                                                        <div className="mny-bar flex-1" style={{ background: '#C4574F', animationDelay: '.2s' }} />
                                                    </div>
                                                    {worst && (
                                                        <span
                                                            title={`Oldest: ${worst.daysOutstanding}d`}
                                                            className="absolute w-[2px] rounded-full bg-[#12182F]"
                                                            style={{ left: `${at(worst.daysOutstanding)}%`, top: -3, bottom: -3, marginLeft: -1 }}
                                                        />
                                                    )}
                                                </div>
                                                <div className="flex justify-between mt-1.5 text-[10px] text-[#8E96B8]">
                                                    <span>day 0</span>
                                                    <span>{th.reminderDays}d remind</span>
                                                    <span>{th.warnDays}d call</span>
                                                    <span>{th.pauseDays}d hold</span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    {chase.chaseNow > 0 && (
                                        <p className="text-[11px] text-rose-700 font-semibold mt-1.5">
                                            {chase.chaseNow} past the reminder threshold
                                            {chase.amountOverdue > 0 && <> — {formatCurrency(chase.amountOverdue)}</>}
                                        </p>
                                    )}
                                    <ul className="mt-3 space-y-1.5">
                                        {chase.items.slice(0, 4).map(item => (
                                            <li key={item.id} className="flex items-center gap-2">
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                    item.level >= 3 ? 'bg-rose-600'
                                                    : item.level === 2 ? 'bg-rose-400'
                                                    : item.level === 1 ? 'bg-amber-500' : 'bg-[#ADBBDA]'
                                                }`} />
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-xs text-[#2B3358] truncate">{item.label}</span>
                                                    {item.reference && (
                                                        <span className="block text-[10px] text-[#8E96B8] truncate">{item.reference}</span>
                                                    )}
                                                </span>
                                                <span className="text-[10px] font-bold text-[#8E96B8] shrink-0">{CHASE_LABEL[item.level]}</span>
                                                <span className="text-[11px] font-black text-[#12182F] tabular-nums shrink-0 w-12 text-right">
                                                    {item.daysOutstanding}d
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    {behaviourBlock}
                                </>
                            )}
                        </button>

                        {/* Earned, not invoiced */}
                        <button type="button" onClick={() => setMoneyTab('milestones')} className={PANEL_CLASS} style={{ animationDelay: '.16s' }}>
                            <PanelHead
                                title="Next to bill"
                                action="Open milestones &rsaquo;"
                                tone={billable.earnedTotal > 0 ? 'watch' : 'clear'}
                                state={billable.items.length === 0
                                    ? 'All invoiced'
                                    : billable.earnedTotal > 0
                                        ? 'Ready to raise'
                                        : `${billable.items.length} queued`}
                            />
                            {/*
                              The earned figure, not the total: the total is already
                              stated on the dial at the top of the screen, and repeating
                              it here would be the fourth copy of one number.
                            */}
                            <PanelMetric
                                value={formatCurrency(billable.earnedTotal)}
                                caption="earned, not yet invoiced"
                                muted={billable.earnedTotal === 0}
                            />
                            {billable.items.length === 0 ? (
                                <p className="text-xs text-[#5A628A] mt-3 leading-relaxed">
                                    Every milestone on both tracks is already invoiced or paid.
                                </p>
                            ) : (
                                <>
                                    <p className="text-[11px] text-[#8E96B8] mt-1.5 leading-snug">
                                        {billable.items.length} {billable.items.length === 1 ? 'milestone' : 'milestones'} up next,
                                        worth <b className="text-[#5A628A]">{formatCurrency(billable.total)}</b> in all
                                    </p>
                                    <ul className="mt-3 space-y-1.5">
                                        {billable.items.slice(0, 4).map(item => (
                                            <li key={item.id}>
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={e => { e.stopPropagation(); goToMilestone(item.id); }}
                                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); goToMilestone(item.id); } }}
                                                    className="group/row flex items-center gap-2 w-full rounded-lg px-1.5 -mx-1.5 py-1 hover:bg-[#F6F7FB] cursor-pointer transition-colors"
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.earned ? 'bg-[#3D52A0]' : 'bg-[#ADBBDA]'}`} />
                                                    <span className="flex-1 min-w-0">
                                                        <span className="block text-xs text-[#2B3358] truncate">{item.name}</span>
                                                        <span className="block text-[10px] text-[#8E96B8] truncate">{item.reason}</span>
                                                    </span>
                                                    <span className="text-[10px] font-semibold text-[#ADBBDA] opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
                                                        raise &rsaquo;
                                                    </span>
                                                    <span className="text-[11px] font-black text-[#12182F] tabular-nums shrink-0">
                                                        {formatCurrency(item.amount)}
                                                    </span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </button>

                        {/* When the money lands */}
                        {/*
                          Does the money coming in cover what is already promised out.

                          This replaced the Expected inflow panel, which drew the same
                          months from the same milestones — this one adds the vendor
                          side, so it answers what that one did and more.
                        */}
                        <button type="button" onClick={() => setMoneyTab('milestones')} className={PANEL_CLASS} style={{ animationDelay: '.24s' }}>
                            <PanelHead
                                title="Cash gap"
                                action="Set target dates &rsaquo;"
                                tone={gap.firstNegative ? 'alert' : gap.undatedOutflow > 0 ? 'watch' : 'clear'}
                                state={gap.firstNegative
                                    ? `Short in ${gap.firstNegative.label}`
                                    : gap.undatedOutflow > 0
                                        ? `${gap.undatedOrders} undated`
                                        : gap.outflowTotal > 0 ? 'Covered' : 'Nothing committed'}
                            />
                            <PanelMetric
                                value={gap.firstNegative
                                    ? formatCurrency(Math.abs(gap.firstNegative.cumulative))
                                    : formatCurrency(gap.outflowTotal + gap.undatedOutflow)}
                                caption={gap.firstNegative
                                    ? `short by ${gap.firstNegative.label}`
                                    : 'committed to vendors'}
                                muted={!gap.firstNegative && gap.outflowTotal + gap.undatedOutflow === 0}
                            />
                            {gap.months.length === 0 ? (
                                <p className="text-xs text-[#5A628A] mt-3 leading-relaxed">
                                    Nothing carries a date &mdash; no milestone, no purchase order &mdash; so there is no timeline to set them against.
                                </p>
                            ) : (
                                <>
                                    <CashGapChart months={gap.months} />
                                    {/*
                                      The verdict, stated. Without this the reader has to
                                      infer the tightest month off the line by eye, which
                                      is exactly the work the panel should be doing.
                                    */}
                                    {(() => {
                                        const low = gap.months.reduce((a, m) => (m.cumulative < a.cumulative ? m : a), gap.months[0]);
                                        return gap.firstNegative ? (
                                            <p className="text-[11px] font-semibold text-rose-700 mt-2 leading-snug">
                                                Short {formatCurrency(Math.abs(gap.firstNegative.cumulative))} by {gap.firstNegative.label}
                                            </p>
                                        ) : (
                                            <p className="text-[11px] text-[#5A628A] mt-2 leading-snug">
                                                Tightest at <b className="text-[#12182F]">{formatCurrency(low.cumulative)}</b> in {low.label}
                                                <span className="text-[#8E96B8]"> · never below zero</span>
                                            </p>
                                        );
                                    })()}
                                    <p className="text-[11px] text-[#8E96B8] mt-0.5 leading-snug">
                                        <b className="text-[#5A628A]">{formatCurrency(gap.inflowTotal)}</b> expected in across{' '}
                                        {gap.months.length} {gap.months.length === 1 ? 'month' : 'months'}
                                    </p>
                                </>
                            )}
                            {(gap.undatedOutflow > 0 || gap.undatedInflow > 0) && (
                                <p className="text-[11px] text-amber-700 mt-2 leading-snug border-t border-[#EDEFF7] pt-2">
                                    {gap.undatedOutflow > 0 && (
                                        <>
                                            <b>{formatCurrency(gap.undatedOutflow)}</b> committed to vendors with no delivery date
                                            {gap.undatedOrders > 0 && <> ({gap.undatedOrders} {gap.undatedOrders === 1 ? 'order' : 'orders'})</>}
                                            , so it sits outside this chart.
                                        </>
                                    )}
                                    {gap.undatedOutflow > 0 && gap.undatedInflow > 0 && ' '}
                                    {gap.undatedInflow > 0 && (
                                        <><b>{formatCurrency(gap.undatedInflow)}</b> of milestone money is undated too.</>
                                    )}
                                </p>
                            )}
                        </button>

                        {/* Does the schedule still match the contract */}
                        <button type="button" onClick={() => setMoneyTab('history')} className={PANEL_CLASS} style={{ animationDelay: '.32s' }}>
                            <PanelHead
                                title="Contract drift"
                                action="Open history &rsaquo;"
                                tone={(!drift.designBalanced || !drift.executionBalanced) ? 'alert' : drift.revisions > 0 ? 'watch' : 'clear'}
                                state={(!drift.designBalanced || !drift.executionBalanced)
                                    ? 'Schedule off 100%'
                                    : drift.revisions > 0
                                        ? `${drift.revisions} revised`
                                        : 'Matches contract'}
                            />
                            <PanelMetric
                                value={String(drift.revisions)}
                                caption={drift.revisions === 1 ? 'revision logged' : 'revisions logged'}
                                muted={drift.revisions === 0}
                            />
                            {(drift.designBalanced && drift.executionBalanced && drift.revisions === 0) ? (
                                <>
                                    <p className="text-[11px] text-[#8E96B8] mt-1.5 leading-snug">
                                        Both tracks total 100% and the contract has not been revised.
                                    </p>
                                    {/* Both tracks drawn, because "it adds up" is worth seeing, not just reading. */}
                                    <div className="mt-4 space-y-2.5">
                                        {([['Design', drift.designPct], ['Execution', drift.executionPct]] as [string, number][])
                                            .filter(([, pct]) => pct > 0)
                                            .map(([label, pct], i) => (
                                            <div key={label}>
                                                <div className="flex justify-between text-[10px] text-[#5A628A] mb-1">
                                                    <span className="font-semibold">{label} milestones</span>
                                                    <span className="font-bold tabular-nums text-[#12182F]">{pct}%</span>
                                                </div>
                                                <div className="h-2 rounded-full bg-[#EDEFF7] overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full mny-bar"
                                                        style={{ width: `${Math.min(100, pct)}%`, background: 'linear-gradient(90deg,#7091E6,#3D52A0)', animationDelay: `${0.15 + i * 0.1}s` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="mt-3 space-y-2">
                                    {!drift.executionBalanced && (
                                        <p className="text-[11px] text-rose-700 leading-snug">
                                            Execution milestones total <b>{drift.executionPct}%</b>, not 100% — the schedule no
                                            longer matches the contract.
                                        </p>
                                    )}
                                    {!drift.designBalanced && (
                                        <p className="text-[11px] text-rose-700 leading-snug">
                                            Design milestones total <b>{drift.designPct}%</b>, not 100%.
                                        </p>
                                    )}
                                    {drift.revisions > 0 && (
                                        <p className="text-[11px] text-[#5A628A] leading-snug">
                                            <b className="text-[#12182F]">{drift.revisions}</b>{' '}
                                            {drift.revisions === 1 ? 'revision' : 'revisions'}
                                            {drift.valueMoved !== 0 && (
                                                <> moving <b className="text-[#12182F]">{formatCurrency(Math.abs(drift.valueMoved))}</b>{' '}
                                                {drift.valueMoved > 0 ? 'up' : 'down'}</>
                                            )}
                                            {drift.lastRevisedOn && <> · last on {drift.lastRevisedOn}</>}
                                        </p>
                                    )}
                                    {drift.designBalanced && drift.executionBalanced && (
                                        <p className="text-[11px] text-[#3D52A0] leading-snug">
                                            Milestones were re-based correctly after the revisions.
                                        </p>
                                    )}
                                </div>
                            )}
                        </button>
                    </div>

                    {/*
                      Scope additions, over and above the frozen BOQ.

                      Placed directly under the four panels because it changes
                      what every one of them is a share OF: the contract this
                      screen reports is no longer the BOQ alone.
                    */}
                    <ScopeAdditionsMoneyPanel
                        summary={scopeSummary}
                        contractedExGst={scopeContracted}
                        baseMarginPct={scopeBaseMarginPct}
                        loading={scopeLoading}
                        error={scopeError}
                    />




                    {/* Payment Schedule Banner */}
                    {(!latestSchedule || hasUnsavedScheduleChanges) && (
                        <div className={`p-4 rounded-xl border flex items-center justify-between shadow-sm ${latestSchedule ? 'bg-amber-50 border-amber-200' : 'bg-[#EDE8F5] border-[#ADBBDA]'}`}>
                            <div>
                                <h3 className={`text-sm font-bold ${latestSchedule ? 'text-amber-800' : 'text-[#2A3A73]'}`}>
                                    {latestSchedule ? `Milestones have changed since the last Payment Schedule (v${latestSchedule.version}).` : 'No Advance Payment Schedule document generated yet.'}
                                </h3>
                                <p className={`text-xs mt-1 ${latestSchedule ? 'text-amber-700' : 'text-[#3D52A0]'}`}>
                                    {latestSchedule ? 'Generate a revised Payment Schedule to keep the client updated.' : 'Generate the document from these milestones to send to the client.'}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                {latestSchedule && <button className="text-sm font-semibold text-amber-700 hover:text-amber-900">Later</button>}
                                <button onClick={handleGenerateSchedule} className={`px-4 py-2 text-sm font-bold rounded-lg shadow-sm text-white transition-all ${latestSchedule ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#3D52A0] hover:bg-[#334486]'}`}>
                                    {latestSchedule ? `Generate Revised Schedule (v${latestSchedule.version + 1})` : 'Generate Payment Schedule'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* NEW HIGH-FIDELITY MILKY WHITE METRICS DASHBOARD BANNER */}
                    <div className="bg-white rounded-3xl border border-[#E2E5F0] shadow-sm p-6 space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-xl font-black text-[#12182F] tracking-tight">Payment Realization Dashboard</h2>
                        <p className="text-xs text-[#8E96B8] mt-0.5">Real-time financials and billing status for <strong>{activeTier?.name || 'Active Tier'}</strong></p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setShowInsights(!showInsights)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${showInsights ? 'bg-[#EDE8F5] border-[#DDE3F5] text-[#334486] hover:bg-[#DDE3F5]' : 'bg-white border-[#E2E5F0] text-[#4A5178] hover:bg-[#F6F7FB]'}`}
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            {showInsights ? 'Hide Insights' : 'Show Insights'}
                        </button>
                    </div>
                </div>

                {/*
                  Four facts the header dial does not carry.

                  Three of these cards used to be Gross Project Value, Total
                  Collected and Remaining Balance — the dial states all three,
                  so they were repetition in the most prominent slot on the
                  tab. The fourth was already unique and is untouched.
                */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <motion.div
                        whileHover={{ y: -4, scale: 1.01 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className="bg-[#F6F7FB]/50 p-4 rounded-2xl border border-[#E2E5F0]/80 shadow-xs relative overflow-hidden group cursor-default"
                    >
                        <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-[#8E96B8] uppercase tracking-wider">Billable vs cash</span>
                            <div className="text-[10px] font-bold text-[#8E96B8]">{billablePercent}% billed</div>
                        </div>
                        <h3 className="text-xl font-extrabold text-[#12182F] tabular-nums mt-2">{formatCurrency(executionBillable)}</h3>
                        <p className="text-[10px] text-[#8E96B8] mt-1">Cash side: {formatCurrency(executionCash)}</p>
                    </motion.div>

                    <motion.div
                        whileHover={{ y: -4, scale: 1.01 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className="bg-[#F6F7FB]/50 p-4 rounded-2xl border border-[#E2E5F0]/80 shadow-xs relative overflow-hidden group cursor-default"
                    >
                        <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-[#8E96B8] uppercase tracking-wider">Initiation fee</span>
                            <div className="text-[10px] font-bold text-[#8E96B8]">{initiationFee > 0 ? "applied" : "none"}</div>
                        </div>
                        <h3 className="text-xl font-extrabold text-[#12182F] tabular-nums mt-2">{formatCurrency(initiationFee)}</h3>
                        <p className="text-[10px] text-[#8E96B8] mt-1">Deducted from the first invoice raised</p>
                    </motion.div>

                    <motion.div
                        whileHover={{ y: -4, scale: 1.01 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className="bg-[#F6F7FB]/50 p-4 rounded-2xl border border-[#E2E5F0]/80 shadow-xs relative overflow-hidden group cursor-default"
                    >
                        <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-[#8E96B8] uppercase tracking-wider">Cash exposure this FY</span>
                            <div className="text-[10px] font-bold text-[#8E96B8]">{Math.round(cashUtilization)}% of limit</div>
                        </div>
                        <h3 className="text-xl font-extrabold text-[#12182F] tabular-nums mt-2">{formatCurrency(totalFYCash)}</h3>
                        <p className="text-[10px] text-[#8E96B8] mt-1">Across every project, not just this one</p>
                    </motion.div>

<motion.div 
                        whileHover={{ y: -4, scale: 1.01 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className="bg-[#F6F7FB]/50 p-4 rounded-2xl border border-[#E2E5F0]/80 shadow-xs relative overflow-hidden group cursor-pointer"
                    >
                        <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-[#8E96B8] uppercase tracking-wider">Tax & Recovery Ask</span>
                            <div className="px-1.5 py-0.5 bg-[#EDE8F5] text-[#334486] text-[9px] font-black rounded">18% GST</div>
                        </div>
                        <h3 className="text-xl font-extrabold text-[#12182F] tabular-nums mt-2">{formatCurrency(totalGST)}</h3>
                        <p className="text-[10px] text-[#8E96B8] mt-1">
                            Cash Portion: <span className="font-semibold text-amber-700 tabular-nums">{formatCurrency(executionCash)}</span>
                        </p>
                    </motion.div>
                </div>

                {/* REALIZATION PIPELINE PROGRESS BAR */}
                <div className="bg-[#F6F7FB]/50 p-4 rounded-2xl border border-[#E2E5F0]/80 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-[#3A416B]">Realization Pipeline</span>
                        <span className="font-medium text-[#8E96B8]">Visual Collection Map</span>
                    </div>
                    <div className="w-full h-3 bg-[#E2E5F0] rounded-full overflow-hidden flex">
                        {paidPercentOfGross > 0 && (
                            <div 
                                style={{ width: `${paidPercentOfGross}%` }} 
                                className="bg-emerald-500 transition-all duration-500" 
                                title={`Collected: ${paidPercentOfGross.toFixed(1)}%`}
                            />
                        )}
                        {invoicedPercentOfGross > 0 && (
                            <div 
                                style={{ width: `${invoicedPercentOfGross}%` }} 
                                className="bg-[#3D52A0] transition-all duration-500" 
                                title={`Billed / Outstanding: ${invoicedPercentOfGross.toFixed(1)}%`}
                            />
                        )}
                        {pendingPercentOfGross > 0 && (
                            <div 
                                style={{ width: `${pendingPercentOfGross}%` }} 
                                className="bg-[#CBD1E4] transition-all duration-500" 
                                title={`Pending Release: ${pendingPercentOfGross.toFixed(1)}%`}
                            />
                        )}
                    </div>
                    <div className="flex flex-wrap justify-between gap-4 text-[10px] font-bold text-[#5A628A] pt-1">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" />
                            <span>Settled ({paidPercentOfGross.toFixed(1)}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-[#3D52A0] rounded-sm" />
                            <span>Invoiced / Unpaid: {formatCurrency(totalInvoicedButNotPaid)} ({invoicedPercentOfGross.toFixed(1)}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-[#CBD1E4] rounded-sm" />
                            <span>Pending Release: {formatCurrency(remainingBalance - totalInvoicedButNotPaid)} ({pendingPercentOfGross.toFixed(1)}%)</span>
                        </div>
                    </div>
                </div>

                {/* COPILOT SMART BILLING INSIGHTS */}
                <AnimatePresence>
                    {showInsights && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="p-4 bg-[#EDE8F5]/40 rounded-2xl border border-[#DDE3F5]/60 space-y-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                                    <Sparkles className="w-4 h-4 text-[#3D52A0] animate-pulse" />
                                    <span>Studio Copilot Smart Billing Insights</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {billingInsights.map((insight, index) => (
                                        <div 
                                            key={index} 
                                            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                                                insight.type === 'warning' 
                                                    ? 'bg-amber-50/50 border-amber-200/60 text-amber-800' 
                                                    : insight.type === 'success'
                                                    ? 'bg-emerald-50/50 border-emerald-200/60 text-emerald-800'
                                                    : 'bg-blue-50/50 border-blue-200/60 text-blue-800'
                                            }`}
                                        >
                                            <div className="mt-0.5">
                                                {insight.type === 'warning' ? (
                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                                ) : insight.type === 'success' ? (
                                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                ) : (
                                                    <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                                )}
                                            </div>
                                            <p className="leading-relaxed font-medium">{insight.text}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>


            </>)}

            {moneyTab === 'tax' && (<>

            {/* COLLAPSIBLE FINANCIAL CONTROLS & RATIOS */}
            <div className="bg-white rounded-3xl border border-[#E2E5F0] shadow-sm overflow-hidden">
                {/*
                  Collapsed by default, which is right for advanced settings —
                  but the only thing saying so is the chevron, and flex was
                  shrinking it from 16px to 6px, and the divider from 1px to 0,
                  in a narrow column. The header then read as a promise of
                  controls with nothing underneath. The cluster now wraps
                  instead of compressing, and the parts that carry meaning
                  refuse to shrink.

                  It is also a div doing a button's job, so it gets the role,
                  the focus ring and the keyboard handling to match.
                */}
                <div 
                    role="button"
                    tabIndex={0}
                    aria-expanded={showFinancialControls}
                    onClick={() => setShowFinancialControls(!showFinancialControls)}
                    onKeyDown={e => {
                        if (e.target !== e.currentTarget) return;   // let the inner buttons be
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowFinancialControls(v => !v);
                        }
                    }}
                    className="p-5 bg-[#F6F7FB]/60 flex flex-wrap justify-between items-center gap-y-3 gap-x-3 cursor-pointer hover:bg-[#F6F7FB] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#3D52A0] transition-colors border-b border-[#EDEFF7]"
                >
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                        <div className="p-2 bg-[#E2E5F0]/60 text-[#3A416B] rounded-xl">
                            <CalculatorIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-[#252C4E] text-sm">Adjustments & Split Ratios</h3>
                            <p className="text-xs text-[#8E96B8] mt-0.5">Configure billing modes, tax rates, initiation fees, and client discounts</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleLoadDefaults();
                            }}
                            className="text-[10px] font-black tracking-wider uppercase transition-all px-2.5 py-1.5 rounded-lg border border-[#E2E5F0] bg-white text-[#4A5178] hover:bg-[#F6F7FB]"
                        >
                            Load Defaults
                        </button>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleReset();
                            }}
                            className={`text-[10px] font-black tracking-wider uppercase transition-all flex items-center gap-1 px-2.5 py-1.5 rounded-lg border ${
                                isResetting 
                                    ? 'bg-red-500 text-white border-red-500 hover:bg-red-600' 
                                    : 'text-red-500 hover:text-red-700 bg-red-50 border-red-100'
                            }`}
                        >
                            {isResetting ? 'Confirm Reset' : 'Reset All'}
                        </button>
                        <div className="h-4 w-px bg-[#E2E5F0] shrink-0" />
                        <span className="text-xs font-bold text-[#334486] bg-[#EDE8F5] px-2 py-1 rounded whitespace-nowrap">
                            {billablePercent}% GST / {100 - billablePercent}% Cash
                        </span>
                        {showFinancialControls
                            ? <ChevronUpIcon className="w-4 h-4 shrink-0 text-[#8E96B8]" />
                            : <ChevronDownIcon className="w-4 h-4 shrink-0 text-[#8E96B8]" />}
                    </div>
                </div>

                <AnimatePresence>
                    {showFinancialControls && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden border-t border-[#EDEFF7]"
                        >
                            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8 bg-white">
                                {/* Left Side: Discounts, Adjustments & Initiation Fees */}
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-xs font-black text-[#8E96B8] uppercase tracking-wider mb-3">Initiation Retainer</h4>
                                        <div className="flex justify-between items-center text-xs p-3.5 bg-[#F6F7FB] rounded-2xl border border-[#E2E5F0]/80">
                                            <span className="text-[#4A5178] font-bold">Standard Initiation Fee</span>
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-[#8E96B8]">₹</span>
                                                <input 
                                                    type="number" 
                                                    value={initiationFee} 
                                                    onChange={e => setInitiationFee(Number(e.target.value))}
                                                    className="w-24 text-right font-black text-[#252C4E] bg-transparent outline-none border-b border-dashed border-[#CBD1E4] focus:border-[#12182F] tabular-nums" 
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="text-xs font-black text-[#8E96B8] uppercase tracking-wider">Discounts & Deductions</h4>
                                            <button 
                                                onClick={() => setShowDiscountForm(!showDiscountForm)} 
                                                className="text-[#3D52A0] hover:text-[#334486] text-xs font-bold flex items-center gap-1"
                                            >
                                                <PlusIcon className="w-3 h-3" /> Add Discount
                                            </button>
                                        </div>

                                        {showDiscountForm && (
                                            <div className="mb-4 p-4 bg-[#F6F7FB] rounded-2xl border border-[#E2E5F0] shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <input 
                                                        placeholder="e.g. Goodwill Discount" 
                                                        value={newDiscount.name} 
                                                        onChange={e => setNewDiscount({...newDiscount, name: e.target.value})}
                                                        className="text-xs p-2 border border-[#E2E5F0] rounded-xl bg-white outline-none focus:border-[#8E96B8] font-medium"
                                                    />
                                                    <div className="flex">
                                                        <input 
                                                            type="number" 
                                                            placeholder="Value" 
                                                            value={newDiscount.value || ''} 
                                                            onChange={e => setNewDiscount({...newDiscount, value: Number(e.target.value)})}
                                                            className="w-full text-xs p-2 border border-[#E2E5F0] rounded-l-xl bg-white outline-none focus:border-[#8E96B8] tabular-nums"
                                                        />
                                                        <select 
                                                            value={newDiscount.type}
                                                            onChange={e => setNewDiscount({...newDiscount, type: e.target.value as any})}
                                                            className="text-xs p-2 border-y border-r border-[#E2E5F0] rounded-r-xl bg-[#EDEFF7] text-[#3A416B] outline-none"
                                                        >
                                                            <option value="percentage">%</option>
                                                            <option value="fixed">₹</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center gap-3">
                                                    <select 
                                                        value={newDiscount.target}
                                                        onChange={e => setNewDiscount({...newDiscount, target: e.target.value as any})}
                                                        className="text-xs p-2 border border-[#E2E5F0] rounded-xl bg-white text-[#3A416B] outline-none w-1/2"
                                                    >
                                                        <option value="execution">Apply On Execution</option>
                                                        <option value="design">Apply On Design Fee</option>
                                                    </select>
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => setShowDiscountForm(false)}
                                                            className="text-xs font-bold px-3 py-2 rounded-xl text-[#5A628A] hover:bg-[#EDEFF7]"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button 
                                                            onClick={handleAddDiscount}
                                                            className="text-xs font-bold bg-[#3D52A0] text-white px-4 py-2 rounded-xl hover:bg-[#334486] shadow-sm"
                                                        >
                                                            Apply
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            {discounts.map(discount => (
                                                <div key={discount.id} className="flex justify-between items-center text-xs p-3 bg-red-50/60 rounded-xl border border-red-100 group">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-red-800 font-bold">{discount.name}</span>
                                                        <span className="text-[9px] text-red-600 bg-red-100/60 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">{discount.target}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-extrabold text-red-700 tabular-nums">
                                                            -{discount.type === 'percentage' ? `${discount.value}%` : formatCurrency(discount.value)}
                                                        </span>
                                                        <button 
                                                            onClick={() => handleRemoveDiscount(discount.id)} 
                                                            className="text-red-400 hover:text-red-700 transition-colors"
                                                        >
                                                            <DeleteIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {discounts.length === 0 && (
                                                <p className="text-[11px] text-[#8E96B8] italic text-center py-4 bg-[#F6F7FB]/30 rounded-2xl border border-dashed border-[#E2E5F0]">
                                                    No additional discounts applied to this schedule.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side: Split Sliders & GST Overrides */}
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-xs font-black text-[#8E96B8] uppercase tracking-wider mb-3">Execution Cash Split</h4>
                                        <div className="p-4 bg-[#F6F7FB] rounded-2xl border border-[#E2E5F0]/80 space-y-4">
                                            <div className="flex justify-between items-end">
                                                <span className="text-xs font-bold text-[#4A5178]">Billable share of execution</span>
                                                <div className="text-right">
                                                    <span className="text-xl font-extrabold text-[#12182F] tabular-nums">{billablePercent}%</span>
                                                    <span className="text-[10px] text-[#8E96B8] ml-1.5">Official</span>
                                                </div>
                                            </div>
                                            <input 
                                                type="range" 
                                                min="0" max="100" step="5"
                                                value={billablePercent}
                                                onChange={(e) => setBillablePercent(Number(e.target.value))}
                                                disabled={isReadOnlyMode}
                                                className={`w-full h-1.5 bg-[#E2E5F0] rounded-lg appearance-none accent-[#3D52A0] ${isReadOnlyMode ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                            />
                                            <div className="flex justify-between text-[10px] text-[#8E96B8] tabular-nums font-semibold">
                                                <span>0% &middot; all cash</span>
                                                <span>100% &middot; all invoiced</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-black text-[#8E96B8] uppercase tracking-wider mb-3">GST</h4>
                                        <div className="p-4 bg-[#F6F7FB] rounded-2xl border border-[#E2E5F0]/80 flex items-center justify-between">
                                            <label className={`flex items-center gap-3 ${isReadOnlyMode ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                                <div className="relative">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={executionGstEnabled} 
                                                        onChange={e => setExecutionGstEnabled(e.target.checked)}
                                                        disabled={isReadOnlyMode}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-11 h-6 bg-[#E2E5F0] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#CBD1E4] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                                </div>
                                                <div>
                                                    <span className="text-xs font-bold text-[#3A416B] block">Charge GST on Execution Track</span>
                                                    <span className="text-[10px] text-[#8E96B8] block">Apply {gstRate}% official IGST/CGST split</span>
                                                </div>
                                            </label>
                                            <div className="text-right border-l border-[#E2E5F0] pl-4">
                                                <p className="text-[9px] text-[#8E96B8] font-bold uppercase tracking-wider">Estimated Cash value</p>
                                                <p className="text-sm font-extrabold text-amber-700 tabular-nums">{formatCurrency(executionCash)}</p>
                                            </div>
                                        </div>
                                        {/*
                                          The design fee has its own switch.

                                          It had none: its GST was hard-wired on, so a studio
                                          sliding the execution split to "all cash" still saw
                                          18% charged on the design fee and no way to say
                                          otherwise. The two tracks are taxed differently --
                                          a design fee is a professional service invoice, the
                                          execution a works contract -- so they get a control
                                          each rather than one slider pretending to govern both.
                                        */}
                                        <div className="p-4 bg-[#F6F7FB] rounded-2xl border border-[#E2E5F0]/80 flex items-center justify-between mt-3">
                                            <label className={`flex items-center gap-3 ${isReadOnlyMode ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                                <div className="relative">
                                                    <input
                                                        type="checkbox"
                                                        checked={designGstEnabled}
                                                        onChange={e => setDesignGstEnabled(e.target.checked)}
                                                        disabled={isReadOnlyMode}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-11 h-6 bg-[#E2E5F0] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#CBD1E4] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                                </div>
                                                <div>
                                                    <span className="text-xs font-bold text-[#3A416B] block">Charge GST on Design Fee</span>
                                                    <span className="text-[10px] text-[#8E96B8] block">Apply {gstRate}% on the professional fee</span>
                                                </div>
                                            </label>
                                            <div className="text-right border-l border-[#E2E5F0] pl-4">
                                                <p className="text-[9px] text-[#8E96B8] font-bold uppercase tracking-wider">GST on design</p>
                                                <p className="text-sm font-extrabold text-[#3A416B] tabular-nums">{formatCurrency(gstOnDesign)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* 2. FINANCIAL SUMMARY TABLE */}
            <div className="bg-white rounded-3xl border border-[#E2E5F0] overflow-hidden shadow-sm">
                <div className="p-5 border-b border-[#EDEFF7] bg-[#F6F7FB]/20">
                    <h3 className="font-bold text-[#252C4E] text-sm">Detailed Financial Breakdown</h3>
                    <p className="text-xs text-[#8E96B8] mt-0.5">Calculations engine ledger before milestones schedule allocation</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-[#F6F7FB] text-[10px] font-bold text-[#5A628A] uppercase tracking-wider border-b border-[#EDEFF7]">
                            <tr>
                                <th className="p-4 text-left">Component</th>
                                <th className="p-4 text-right">Gross Value</th>
                                <th className="p-4 text-right text-red-600">Discount</th>
                                <th className="p-4 text-right bg-[#EDE8F5]/20 text-slate-900">Taxable Base</th>
                                <th className="p-4 text-right text-[#5A628A]">GST ({gstRate}%)</th>
                                <th className="p-4 text-right font-black text-[#12182F]">Total Receivable</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EDEFF7] font-medium tabular-nums">
                            {/* Execution Row */}
                            <tr className="hover:bg-[#F6F7FB]/30">
                                <td className="p-4 font-bold text-[#252C4E]">Execution Scope</td>
                                <td className="p-4 text-right text-[#5A628A]">{formatCurrency(rawExecutionTotal)}</td>
                                <td className="p-4 text-right text-red-600">-{formatCurrency(executionDiscountVal)}</td>
                                <td className="p-4 text-right font-bold text-slate-800 bg-[#EDE8F5]/10">{formatCurrency(taxableExecution)}</td>
                                <td className="p-4 text-right text-[#5A628A]">{executionGstEnabled ? formatCurrency(gstOnExecution) : '₹0'}</td>
                                <td className="p-4 text-right font-extrabold text-[#252C4E]">{formatCurrency(taxableExecution + (executionGstEnabled ? gstOnExecution : 0))}</td>
                            </tr>
                            {/* Design Row */}
                            <tr className="hover:bg-[#F6F7FB]/30">
                                <td className="p-4 font-bold text-[#252C4E]">Design Fee</td>
                                <td className="p-4 text-right text-[#5A628A]">{formatCurrency(rawDesignFee)}</td>
                                <td className="p-4 text-right text-red-600">-{formatCurrency(designDiscountVal)}</td>
                                <td className="p-4 text-right font-bold text-slate-800 bg-[#EDE8F5]/10">{formatCurrency(taxableDesign)}</td>
                                <td className="p-4 text-right text-[#5A628A]">{formatCurrency(gstOnDesign)}</td>
                                <td className="p-4 text-right font-extrabold text-[#252C4E]">{formatCurrency(taxableDesign + gstOnDesign)}</td>
                            </tr>
                            {/* Grand Total Row */}
                            <tr className="bg-[#F6F7FB] font-bold border-t-2 border-[#EDEFF7]">
                                <td className="p-4 text-[#12182F] font-extrabold">GRAND TOTAL</td>
                                <td className="p-4 text-right text-[#4A5178]">{formatCurrency(rawExecutionTotal + rawDesignFee)}</td>
                                <td className="p-4 text-right text-red-700">-{formatCurrency(executionDiscountVal + designDiscountVal)}</td>
                                <td className="p-4 text-right text-slate-900 bg-[#EDE8F5]/30">{formatCurrency(taxableExecution + taxableDesign)}</td>
                                <td className="p-4 text-right text-[#4A5178]">{formatCurrency(totalGST)}</td>
                                <td className="p-4 text-right text-sm text-slate-900 font-extrabold">{formatCurrency(grossProjectValue)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* TAX SIMULATOR */}
            <div className="bg-white rounded-3xl border border-[#E2E5F0] overflow-hidden shadow-sm">
                <div 
                    className="p-5 bg-[#F6F7FB]/60 border-b border-[#EDEFF7] flex justify-between items-center cursor-pointer hover:bg-[#F6F7FB] transition-colors"
                    onClick={() => setShowTaxSimulator(!showTaxSimulator)}
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#EDE8F5] text-[#334486] rounded-xl">
                            <CalculatorIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-[#252C4E] text-sm">Tax Structure Simulator: Split GST</h3>
                            <p className="text-xs text-[#8E96B8] mt-0.5">Simulate split design fee, labor, and material procurement tax streams</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black tracking-wider uppercase text-[#334486] bg-[#EDE8F5] px-2 py-1 rounded">Experimental</span>
                        {showTaxSimulator ? <ChevronUpIcon className="w-5 h-5 text-[#8E96B8]" /> : <ChevronDownIcon className="w-5 h-5 text-[#8E96B8]" />}
                    </div>
                </div>
                
                {showTaxSimulator && (
                    <div className="p-6 bg-[#F6F7FB]/40 space-y-6">
                        <p className="text-xs text-[#5A628A] max-w-3xl leading-relaxed">
                            Simulate treating Design Fees and Labor as GST-applicable (18%), and Materials as non-GST (0%). 
                            The Material vs Labor % splits are calculated dynamically from the active project's BOQ line items (Material Cost: {formatCurrency(materialCostRaw)}, Labor Cost: {formatCurrency(laborCostRaw)}). This theoretical split is shown in the dedicated Simulated Execution Schedule table below.
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Material vs Labor Base breakdown */}
                            <div className="bg-white p-5 rounded-2xl border border-[#E2E5F0] shadow-sm space-y-4">
                                <h4 className="font-bold text-[#252C4E] text-xs uppercase tracking-wider border-b border-[#EDEFF7] pb-2">Execution Breakdown (Taxable Base)</h4>
                                
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-[#5A628A] font-medium">Material ({Math.round(materialRatio * 100)}%)</span>
                                        <span className="font-bold text-[#252C4E] tabular-nums">{formatCurrency(simulatedTaxableMaterial)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-[#5A628A] font-medium">Labor ({Math.round(laborRatio * 100)}%)</span>
                                        <span className="font-bold text-[#252C4E] tabular-nums">{formatCurrency(simulatedTaxableLabor)}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-[#EDEFF7] font-bold text-xs">
                                        <span className="text-[#252C4E]">Total</span>
                                        <span className="text-[#252C4E] tabular-nums">{formatCurrency(taxableExecution)}</span>
                                    </div>
                                    <div className="pt-4 border-t border-[#EDEFF7] mt-4 space-y-4">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-black text-[#8E96B8] uppercase tracking-wider">Labor Billing Mode</span>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className={simulatedLaborGstEnabled ? "text-[#8E96B8]" : "font-bold text-amber-700"}>Cash</span>
                                                    <div
                                                        className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${simulatedLaborGstEnabled ? 'bg-[#3D52A0]' : 'bg-[#CBD1E4]'}`}
                                                        onClick={() => setSimulatedLaborGstEnabled(!simulatedLaborGstEnabled)}
                                                    >
                                                        <div className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform ${simulatedLaborGstEnabled ? 'transform translate-x-5' : ''}`} />
                                                    </div>
                                                    <span className={simulatedLaborGstEnabled ? "font-bold text-[#334486]" : "text-[#8E96B8]"}>GST (18%)</span>
                                                </div>
                                            </div>
                                        </div>

                                        {!simulatedLaborGstEnabled && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-black text-[#8E96B8] uppercase tracking-wider">Labor Cash Recovery</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="28"
                                                        step="1"
                                                        value={laborGstRecovery}
                                                        onChange={(e) => setLaborGstRecovery(Number(e.target.value))}
                                                        className="w-full h-1.5 bg-[#E2E5F0] rounded-lg appearance-none cursor-pointer accent-amber-500"
                                                    />
                                                    <span className="text-xs font-bold text-amber-700 w-12 text-right tabular-nums">{laborGstRecovery}%</span>
                                                </div>
                                            </div>
                                        )}
                                        
                                        <div className="pt-2 border-t border-[#EDEFF7] space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-black text-[#8E96B8] uppercase tracking-wider">Material Cash Recovery</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="28"
                                                    step="1"
                                                    value={materialGstRecovery}
                                                    onChange={(e) => setMaterialGstRecovery(Number(e.target.value))}
                                                    className="w-full h-1.5 bg-[#E2E5F0] rounded-lg appearance-none cursor-pointer accent-amber-500"
                                                />
                                                <span className="text-xs font-bold text-amber-700 w-12 text-right tabular-nums">{materialGstRecovery}%</span>
                                            </div>
                                            <p className="text-[10px] text-[#8E96B8] leading-normal">
                                                % charged over and above Material Base to client in cash to recover your dead Input GST on purchases.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-[#EDEFF7] mt-4 space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-black text-[#8E96B8] uppercase tracking-wider">Override Split</span>
                                            {customMaterialRatio !== null && (
                                                <button 
                                                    onClick={() => setCustomMaterialRatio(null)}
                                                    className="text-[10px] text-[#3D52A0] hover:text-[#334486] underline font-bold"
                                                >
                                                    Reset to BOQ
                                                </button>
                                            )}
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={Math.round(materialRatio * 100)}
                                            onChange={(e) => setCustomMaterialRatio(Number(e.target.value) / 100)}
                                            className="w-full h-1.5 bg-[#E2E5F0] rounded-lg appearance-none cursor-pointer accent-[#3D52A0]"
                                        />
                                        <div className="flex justify-between text-[10px] text-[#8E96B8] tabular-nums font-bold">
                                            <span>Mat: {Math.round(materialRatio * 100)}%</span>
                                            <span>Lab: {100 - Math.round(materialRatio * 100)}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* GST Simulation */}
                            <div className="bg-white p-5 rounded-2xl border border-[#E2E5F0] shadow-sm space-y-4">
                                <h4 className="font-bold text-[#252C4E] text-xs uppercase tracking-wider border-b border-[#EDEFF7] pb-2">Tax & Recovery Simulation</h4>
                                
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-[#5A628A] font-medium">Design GST (18% - Billed)</span>
                                        <span className="font-bold text-[#334486] tabular-nums">{formatCurrency(simulatedGstOnDesign)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-[#5A628A] font-medium">Labor {simulatedLaborGstEnabled ? 'GST (18% - Billed)' : `Cash Recovery (${laborGstRecovery}%)`}</span>
                                        <span className={`font-bold tabular-nums ${simulatedLaborGstEnabled ? 'text-[#334486]' : 'text-amber-700'}`}>
                                            {simulatedLaborGstEnabled ? formatCurrency(simulatedGstOnLabor) : `+${formatCurrency(simulatedLaborRecovery)}`}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-[#5A628A] font-medium">Material Cash Recovery ({materialGstRecovery}%)</span>
                                        <span className="font-bold text-amber-700 tabular-nums">+{formatCurrency(simulatedMaterialRecovery)}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-[#EDEFF7] font-bold text-xs text-slate-900">
                                        <span>Total Tax & Recovery Ask</span>
                                        <span className="tabular-nums">{formatCurrency(simulatedTotalGST + simulatedLaborRecovery + simulatedMaterialRecovery)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Outcomes */}
                        <div className="bg-[#12182F] p-6 rounded-2xl text-white flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm border border-[#252C4E]">
                            <div className="space-y-1 w-full md:w-auto">
                                <span className="text-[10px] font-bold text-[#8E96B8] uppercase tracking-wider block">Theoretical Gross Ask</span>
                                <span className="text-2xl font-black tabular-nums">{formatCurrency(newGrossProjectValue)}</span>
                                <div className="text-[10px] text-[#8E96B8] mt-1 font-medium leading-relaxed">
                                    Current Gross: {formatCurrency(grossProjectValue)} <br/>
                                    {newGrossProjectValue < grossProjectValue ? `(Client saves: ${formatCurrency(grossProjectValue - newGrossProjectValue)})` : `(Client pays extra: ${formatCurrency(newGrossProjectValue - grossProjectValue)})`}
                                </div>
                            </div>
                            
                            <div className="w-px h-16 bg-[#252C4E] hidden md:block"></div>
                            
                            <div className="space-y-1 w-full md:w-auto text-right">
                                <span className="text-[10px] font-bold text-[#8E96B8] uppercase tracking-wider block">Theoretical Firm Profit</span>
                                <span className="text-2xl font-black text-emerald-400 tabular-nums">{formatCurrency(theoreticalProfit)}</span>
                                <div className="text-[10px] text-[#8E96B8] mt-1 font-medium leading-relaxed">
                                    (Accounts for {formatCurrency(estimatedMaterialInputGst)} dead input GST) <br/>
                                    Implied Margin: {profitMargin.toFixed(1)}%
                                </div>
                            </div>
                        </div>

                        {/* Simulated Schedule Table */}
                        <div className="bg-white rounded-2xl border border-[#E2E5F0] overflow-hidden shadow-sm mt-8">
                            <div className="bg-[#EDEFF7]/50 px-4 py-3 border-b border-[#E2E5F0]">
                                <h4 className="font-bold text-[#252C4E] text-xs uppercase tracking-wider">Simulated Execution Schedule</h4>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-[#F6F7FB] text-[10px] font-bold text-[#5A628A] uppercase tracking-wider border-b border-[#E2E5F0]">
                                        <tr>
                                            <th className="p-3 w-[25%]">Stage</th>
                                            <th className="p-3 text-right">% / Amt</th>
                                            <th className="p-3 text-right">Base Exec</th>
                                            <th className="p-3 text-right bg-blue-50/10">Labor Base</th>
                                            <th className="p-3 text-right bg-blue-50/10">Labor GST/Rec</th>
                                            <th className="p-3 text-right bg-amber-50/50 text-amber-800">Mat. Base (Cash)</th>
                                            <th className="p-3 text-right bg-amber-50/50 text-amber-800">Recovery ({materialGstRecovery}%)</th>
                                            <th className="p-3 text-right bg-[#EDE8F5]/50 text-[#2A3A73]">Total Ask (Inv + Cash)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {executionMilestones.map((m, i) => {
                                            const unpaidItems = executionMilestones;
                                            let rowBase = 0;
                                            
                                            if (m.isFixedAmount && m.fixedAmount !== undefined) {
                                                rowBase = m.fixedAmount;
                                            } else {
                                                const fixedPendingTotal = unpaidItems.filter(x => x.isFixedAmount).reduce((sum, x) => sum + (x.fixedAmount || 0), 0);
                                                const remainingBaseAmount = Math.max(0, taxableExecution - fixedPendingTotal);
                                                const unpaidPctExcludingFixed = unpaidItems.filter(x => !x.isFixedAmount).reduce((sum, x) => sum + x.percentage, 0);
                                                const relativePct = unpaidPctExcludingFixed > 0 ? (m.percentage / unpaidPctExcludingFixed) : 0;
                                                rowBase = remainingBaseAmount * relativePct;
                                            }
                                            rowBase = Math.round(rowBase);
                                            
                                            const rowLaborBase = Math.round(rowBase * laborRatio);
                                            const rowMaterialBase = Math.round(rowBase * materialRatio);
                                            const rowLaborGST = simulatedLaborGstEnabled ? Math.round(rowLaborBase * 0.18) : 0;
                                            const rowLaborRecovery = !simulatedLaborGstEnabled ? Math.round(rowLaborBase * (laborGstRecovery / 100)) : 0;
                                            const rowMaterialRecovery = Math.round(rowMaterialBase * (materialGstRecovery / 100));
                                            const rowTotalAsk = rowLaborBase + rowLaborGST + rowLaborRecovery + rowMaterialBase + rowMaterialRecovery;

                                            return (
                                                <tr key={m.id} className="hover:bg-[#F6F7FB]/30">
                                                    <td className="p-3 text-xs font-bold text-[#252C4E] truncate" title={m.name}>{m.name}</td>
                                                    <td className="p-3 text-right text-xs text-[#5A628A] tabular-nums">{m.isFixedAmount ? 'Fixed' : `${m.percentage}%`}</td>
                                                    <td className="p-3 text-right text-xs text-[#252C4E] tabular-nums">{formatCurrency(rowBase)}</td>
                                                    <td className="p-3 text-right text-xs text-slate-800 bg-blue-50/5 tabular-nums">{formatCurrency(rowLaborBase)}</td>
                                                    <td className="p-3 text-right text-xs text-slate-800 bg-blue-50/5 tabular-nums">
                                                        {simulatedLaborGstEnabled ? formatCurrency(rowLaborGST) : `+${formatCurrency(rowLaborRecovery)}`}
                                                    </td>
                                                    <td className="p-3 text-right text-xs text-amber-900 bg-amber-50/5 tabular-nums">{formatCurrency(rowMaterialBase)}</td>
                                                    <td className="p-3 text-right text-xs text-amber-900 bg-amber-50/5 tabular-nums">+{formatCurrency(rowMaterialRecovery)}</td>
                                                    <td className="p-3 text-right text-xs text-slate-900 bg-[#EDE8F5]/5 tabular-nums font-black">{formatCurrency(rowTotalAsk)}</td>
                                                </tr>
                                            );
                                        })}
                                        
                                        {/* Totals Row */}
                                        <tr className="bg-[#F6F7FB] border-t-2 border-[#E2E5F0]">
                                            <td colSpan={2} className="p-3 text-right text-xs font-black text-[#252C4E]">Totals</td>
                                            <td className="p-3 text-right text-xs font-bold text-[#252C4E] tabular-nums">{formatCurrency(taxableExecution)}</td>
                                            <td className="p-3 text-right text-xs font-bold text-blue-700 bg-blue-50/5 tabular-nums">{formatCurrency(simulatedTaxableLabor)}</td>
                                            <td className="p-3 text-right text-xs font-bold text-blue-700 bg-blue-50/5 tabular-nums">
                                                {simulatedLaborGstEnabled ? formatCurrency(simulatedGstOnLabor) : `+${formatCurrency(simulatedLaborRecovery)}`}
                                            </td>
                                            <td className="p-3 text-right text-xs font-bold text-amber-700 bg-amber-50/5 tabular-nums">{formatCurrency(simulatedTaxableMaterial)}</td>
                                            <td className="p-3 text-right text-xs font-bold text-amber-700 bg-amber-50/5 tabular-nums">+{formatCurrency(simulatedMaterialRecovery)}</td>
                                            <td className="p-3 text-right text-xs font-black text-slate-900 bg-[#EDE8F5]/5 tabular-nums">{formatCurrency(taxableExecution + simulatedGstOnLabor + simulatedLaborRecovery + simulatedMaterialRecovery)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            </>)}

            {moneyTab === 'milestones' && (<>

            {/*
              Dating the schedule from the programme.

              Sits here because this is where the schedule is planned, and it
              is explicit about what it could and could not trace — on a
              project with no timeline, or where the studio has not mapped a
              step to each milestone, it says so rather than inventing dates.
            */}
            <div className="bg-white border border-[#E2E5F0] rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h4 className="text-sm font-bold text-[#12182F]">Target dates</h4>
                    <p className="text-[11px] text-[#5A628A] mt-0.5 leading-snug max-w-xl">
                        {milestones.filter(m => m.date).length} of {milestones.length} milestones carry a date.
                        Dates drive the cash-flow forecast, and the client portal shows them.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={runDateDerivation}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#3D52A0] hover:bg-[#334486] rounded-lg transition-colors cursor-pointer"
                >
                    <CalendarIcon className="w-3.5 h-3.5" />
                    Derive from timeline
                </button>
            </div>

            {dateProposal && (
                <div className="bg-white border border-[#ADBBDA] rounded-2xl px-5 py-4 mny-rise">
                    {dateProposal.proposals.length > 0 ? (
                        <>
                            <h4 className="text-sm font-bold text-[#12182F]">
                                {dateProposal.proposals.length} {dateProposal.proposals.length === 1 ? 'date' : 'dates'} from the programme
                            </h4>
                            <p className="text-[11px] text-[#5A628A] mt-0.5 leading-snug">
                                Read off {dateProposal.phaseCount} timeline {dateProposal.phaseCount === 1 ? 'phase' : 'phases'}.
                                <b> Mapped</b> means the studio configured that step to trigger the milestone;
                                <b> placed</b> means it was positioned by where it sits in its own schedule.
                            </p>
                            <ul className="mt-2.5 space-y-1.5">
                                {dateProposal.proposals.map(d => (
                                    <li key={d.id} className="flex items-center gap-2 text-xs">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#3D52A0] shrink-0" />
                                        <span className="text-[#2B3358] flex-1 min-w-0 truncate">{d.name}</span>
                                        <span className="text-[#8E96B8] text-[10px] truncate">
                                            {d.how === 'mapped' ? 'mapped to' : 'placed in'} {d.from}
                                        </span>
                                        <span className="font-bold text-[#12182F] tabular-nums shrink-0">{d.date}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="flex items-center gap-2 mt-3.5">
                                <button
                                    type="button"
                                    onClick={applyDateProposal}
                                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#3D52A0] hover:bg-[#334486] rounded-lg cursor-pointer"
                                >
                                    Apply {dateProposal.proposals.length === 1 ? 'it' : 'them'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDateProposal(null)}
                                    className="px-3 py-1.5 text-xs font-bold text-[#5A628A] hover:text-[#12182F] cursor-pointer"
                                >
                                    Discard
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <h4 className="text-sm font-bold text-[#12182F]">Nothing could be dated from the programme</h4>
                            <p className="text-[11px] text-[#5A628A] mt-1 leading-relaxed max-w-2xl">
                                A date is traced from a milestone to the studio milestone of the same name, to the
                                design step configured to trigger it, to that step's phase on this project's timeline.
                                Here is where that broke:
                            </p>
                        </>
                    )}

                    {dateProposal.unmatched.length > 0 && (
                        <ul className="mt-3 space-y-1 border-t border-[#E2E5F0] pt-3">
                            {dateProposal.unmatched.map((u, i) => (
                                <li key={i} className="flex items-start gap-2 text-[11px]">
                                    <span className="w-1 h-1 rounded-full bg-[#CBD1E4] mt-1.5 shrink-0" />
                                    <span className="text-[#2B3358] font-semibold shrink-0">{u.name}</span>
                                    <span className="text-[#8E96B8]">— {u.reason}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {dateProposal.proposals.length === 0 && (
                        <button
                            type="button"
                            onClick={() => setDateProposal(null)}
                            className="mt-3 px-3 py-1.5 text-xs font-bold text-[#5A628A] hover:text-[#12182F] cursor-pointer"
                        >
                            Close
                        </button>
                    )}
                </div>
            )}

            {/* 3. BREAKDOWN TABLES & MAIN MILESTONES SECTION */}
            <div className="bg-white rounded-3xl border border-[#E2E5F0] shadow-sm p-6 space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#EDEFF7] pb-4">
                        <div>
                            <h3 className="text-base font-extrabold text-[#12182F]">Milestones Realization Schedule</h3>
                            <p className="text-xs text-[#8E96B8] mt-0.5">Track, release, and audit design and execution fee structures</p>
                        </div>
                        {activeTier && (
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex bg-[#EDEFF7] p-1 rounded-xl border border-[#E2E5F0]/60 max-w-fit">
                                    <button 
                                        onClick={() => setActiveTrackTab('all')}
                                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTrackTab === 'all' ? 'bg-white text-slate-900 shadow-sm border border-[#E2E5F0]/50 font-black' : 'text-[#5A628A] hover:text-[#12182F]'}`}
                                    >
                                        Show All
                                    </button>
                                    <button 
                                        onClick={() => setActiveTrackTab('design')}
                                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTrackTab === 'design' ? 'bg-white text-slate-900 shadow-sm border border-[#E2E5F0]/50 font-black' : 'text-[#5A628A] hover:text-[#12182F]'}`}
                                    >
                                        Design Track ({designMilestones.length})
                                    </button>
                                    <button 
                                        onClick={() => setActiveTrackTab('execution')}
                                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTrackTab === 'execution' ? 'bg-white text-slate-900 shadow-sm border border-[#E2E5F0]/50 font-black' : 'text-[#5A628A] hover:text-[#12182F]'}`}
                                    >
                                        Execution Track ({executionMilestones.length})
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Preset Stages & Defaults Management Panel */}
                    {!isReadOnlyMode && (
                        <div className="bg-[#F6F7FB] border border-[#E2E5F0]/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#E2E5F0]/50 text-[#3A416B] rounded-xl">
                                    <Sliders className="w-4 h-4 text-slate-900" />
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-[#252C4E] block">Preset Stages & Defaults</span>
                                    <span className="text-[10px] text-[#8E96B8] block mt-0.5">Synchronize, load, or update studio-wide payment templates</span>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {activeTier && (
                                    <>
                                        <button 
                                            onClick={handleLoadDefaults}
                                            className="text-[10px] font-black tracking-wider uppercase transition-all flex items-center gap-1 px-3 py-2 rounded-xl border border-[#E2E5F0] bg-white text-[#3A416B] hover:bg-[#EDEFF7] hover:text-[#12182F] shadow-xs"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5 text-[#5A628A]" /> Load Studio Defaults
                                        </button>
                                        <button 
                                            onClick={handleSaveAsStudioDefaults}
                                            disabled={savingStudioDefaults}
                                            className="text-[10px] font-black tracking-wider uppercase transition-all flex items-center gap-1 px-3 py-2 rounded-xl border border-[#E2E5F0] bg-white text-[#3A416B] hover:bg-[#EDEFF7] hover:text-[#12182F] shadow-xs disabled:opacity-50"
                                        >
                                            {savingStudioDefaults ? (
                                                <>
                                                    <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-[#5A628A]" /> Saving...
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles className="w-3.5 h-3.5 text-[#3D52A0] animate-pulse" /> Save as Studio Defaults
                                                </>
                                            )}
                                        </button>
                                        <div className="h-6 w-px bg-[#E2E5F0] hidden md:block" />
                                    </>
                                )}
                                <button 
                                    onClick={() => setIsStudioDefaultsModalOpen(true)}
                                    className="text-[10px] font-black tracking-wider uppercase transition-all flex items-center gap-1 px-3 py-2 rounded-xl border border-[#DDE3F5] bg-[#EDE8F5]/50 text-[#334486] hover:bg-[#DDE3F5] hover:text-[#334486]"
                                >
                                    <Sliders className="w-3.5 h-3.5 text-[#3D52A0]" /> Configure Studio Rules
                                </button>
                            </div>
                        </div>
                    )}

                    {!activeTier ? (
                        <div className="bg-[#F6F7FB] border border-[#E2E5F0] rounded-2xl p-8 text-center max-w-2xl mx-auto my-8">
                            <Sliders className="w-10 h-10 text-[#3D52A0] mx-auto mb-4" />
                            <h3 className="text-sm font-extrabold text-[#12182F] uppercase tracking-wider">No Active Project Tier Selected</h3>
                            <p className="text-xs text-[#5A628A] mt-2 leading-relaxed">
                                Please select an active project tier (such as Luxury or Premium) in the BOQ Editor to calculate project-specific milestone amounts and enable billing.
                            </p>
                            <p className="text-xs text-[#3D52A0] font-bold mt-4">
                                In the meantime, you can configure the studio-wide default templates using the "Configure Studio Rules" button above!
                            </p>
                        </div>
                    ) : (
                        /* Milestone tracking container - grid side-by-side if All is selected and viewLayout is side-by-side */
                        <div className={`grid grid-cols-1 ${activeTrackTab === 'all' && viewLayout === 'side-by-side' ? 'xl:grid-cols-2 gap-8' : 'gap-12'} items-start`}>
                            {(activeTrackTab === 'all' || activeTrackTab === 'design') && (
                                designViewMode === 'simple' ? (
                                    renderSimpleTrackView(designMilestones, taxableDesign, originalNetDesign, false, "Design Fees")
                                ) : (
                                    renderSplitTable(designMilestones, taxableDesign, originalNetDesign, false, "Design Fees")
                                )
                            )}
                            {(activeTrackTab === 'all' || activeTrackTab === 'execution') && (
                                executionViewMode === 'simple' ? (
                                    renderSimpleTrackView(executionMilestones, taxableExecution, originalNetExecution, true, "Execution Milestones")
                                ) : (
                                    renderSplitTable(executionMilestones, taxableExecution, originalNetExecution, true, "Execution Milestones")
                                )
                            )}
                        </div>
                    )}


            </div>

            {/* 4. ADVANCE PAYMENT SCHEDULES ARCHIVE */}
            {paymentSchedules.length > 0 && (
                <div className="bg-white p-6 rounded-3xl border border-[#E2E5F0] shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                        <div className="flex items-center gap-2">
                            <span className="p-1.5 bg-[#DDE3F5] text-[#3D52A0] rounded-lg"><FileText className="w-5 h-5"/></span>
                            <h2 className="text-lg font-black text-[#12182F]">
                                Generated Advance Payment Schedules
                            </h2>
                        </div>
                        <span className="text-xs font-bold text-[#8E96B8] tabular-nums">
                            {paymentSchedules.length} {paymentSchedules.length === 1 ? 'document' : 'documents'} generated
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-[#F6F7FB] text-[11px] font-bold text-[#5A628A] uppercase border-b border-[#E2E5F0]">
                                <tr>
                                    <th className="p-4">Schedule Version</th>
                                    <th className="p-4">Issued Date</th>
                                    <th className="p-4 text-right">Contract Value</th>
                                    <th className="p-4">Advances Count</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#EDEFF7]">
                                {[...paymentSchedules].reverse().map((sched: any) => {
                                    const isLatest = latestSchedule?.id === sched.id;
                                    return (
                                        <tr key={sched.id} className="hover:bg-[#F6F7FB]/80 transition-colors">
                                            <td className="p-4 font-bold text-[#12182F] flex items-center gap-2">
                                                <span className={`px-2.5 py-1 rounded-lg text-xs tabular-nums font-bold ${
                                                    isLatest ? 'bg-emerald-100 text-emerald-800' : 'bg-[#EDEFF7] text-[#3A416B]'
                                                }`}>
                                                    {sched.versionLabel || `v${sched.version}.0`}
                                                </span>
                                                {isLatest && (
                                                    <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                                                        Active
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-[#4A5178] text-xs">
                                                {new Date(sched.issuedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="p-4 text-right tabular-nums font-bold text-[#12182F]">
                                                {formatCurrency(sched.contractValue || 0)}
                                            </td>
                                            <td className="p-4 text-[#4A5178] text-xs">
                                                {sched.advances?.length || 0} advances ({sched.advances?.filter((a: any) => a.phase === 'design').length || 0} Design, {sched.advances?.filter((a: any) => a.phase !== 'design').length || 0} Execution)
                                            </td>
                                            <td className="p-4">
                                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                                                    sched.supersededBy ? 'bg-amber-100 text-amber-800' : isLatest ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                                                }`}>
                                                    {sched.supersededBy ? 'Superseded' : sched.status || 'Active'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <button
                                                    onClick={() => setCompareRevision({
                                                        name: `Payment Schedule ${sched.versionLabel || `v${sched.version}.0`}`,
                                                        date: sched.issuedAt,
                                                        previousExecutionValue: sched.snapshotEngagement?.executionValue || sched.contractValue,
                                                        previousDesignValue: sched.snapshotEngagement?.designFee || 0,
                                                        milestones: (sched.advances || []).map((adv: any, i: number) => ({
                                                            id: `adv_${i}`,
                                                            type: adv.phase || 'execution',
                                                            name: adv.label || adv.advanceCode,
                                                            percentage: adv.percentage || 0,
                                                            fixedAmount: adv.amount,
                                                            isFixedAmount: adv.isFixedAmount,
                                                            description: adv.advanceCode,
                                                            status: adv.status === 'received' ? 'paid' : adv.status === 'advance_requested' ? 'invoiced' : 'pending',
                                                        })),
                                                        reason: `Payment Schedule Document ${sched.versionLabel || `v${sched.version}.0`}`
                                                    })}
                                                    className="px-3 py-1.5 bg-[#EDE8F5] text-[#3D52A0] hover:bg-[#DDE3F5] rounded-lg text-xs font-bold transition-colors border border-[#ADBBDA]"
                                                >
                                                    Audit Snapshot
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            </>)}

            {moneyTab === 'history' && (<>

            {/*
              Versioning lives with the history it belongs to.

              This was a full-width card above everything else, so the first
              thing the money screen said was "here are four old versions"
              rather than anything about the money. Switching billing version
              is an audit action; the header still names the active one so you
              always know which numbers you are reading.
            */}
            {/* Version Selection Header (shown if multiple versions or snapshots exist) */}
            {availableVersions.length > 1 && (
                <div className="bg-white rounded-3xl border border-[#E2E5F0] p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-slate-100 text-slate-800 rounded-xl">
                            <History className="w-5 h-5 text-slate-700" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-extrabold text-[#12182F]">Payment Milestones Versioning</h3>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                    {availableVersions.length} versions
                                </span>
                            </div>
                            <p className="text-[10px] text-[#8E96B8] mt-0.5">Audit past milestone schedules or select active billing version</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {availableVersions.map((ver) => {
                            const isSelected = ver.isCurrentActive ? !selectedSnapshotId : selectedSnapshotId === ver.id;
                            return (
                                <button
                                    key={ver.id}
                                    onClick={() => setSelectedSnapshotId(ver.isCurrentActive ? null : ver.id)}
                                    className={`px-3.5 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 border ${
                                        isSelected
                                            ? ver.isCurrentActive
                                                ? "bg-[#EDE8F5] border-[#3D52A0] text-slate-900 shadow-xs font-bold ring-1 ring-[#3D52A0]/30"
                                                : "bg-amber-50/80 border-amber-300 text-amber-950 font-bold shadow-xs ring-1 ring-amber-300/60"
                                            : "bg-white border-[#E2E5F0] text-[#4A5178] hover:bg-[#F6F7FB]/80 hover:border-[#CBD1E4] font-medium"
                                    }`}
                                >
                                    {ver.isCurrentActive ? (
                                        <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-emerald-200" />
                                    ) : (
                                        <FileText className={`w-3.5 h-3.5 ${isSelected ? "text-amber-700" : "text-[#8E96B8]"}`} />
                                    )}
                                    <span className={`max-w-[150px] truncate ${isSelected ? "font-bold text-slate-900" : "text-[#3A416B]"}`}>{ver.name}</span>
                                    {ver.lifecycleTag && (
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                            isSelected 
                                                ? ver.isCurrentActive ? "bg-[#DDE3F5] text-[#334486] font-bold" : "bg-amber-100 text-amber-900 font-bold"
                                                : "bg-[#EDEFF7] text-[#4A5178]"
                                        }`}>
                                            {ver.lifecycleTag}
                                        </span>
                                    )}
                                    <span className={`text-[10px] tabular-nums ${isSelected ? (ver.isCurrentActive ? "text-[#334486] font-bold" : "text-amber-900 font-bold") : "text-[#5A628A]"}`}>
                                        {formatCurrency(ver.executionValue + ver.designValue)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {(!financials?.paymentRevisions || financials.paymentRevisions.length === 0) && (
                /*
                  Gating the sections by tab exposed this: with no revisions
                  logged, History rendered nothing at all. A tab that can be
                  empty needs to say so.
                */
                <div className="bg-white border border-[#E2E5F0] rounded-2xl px-6 py-10 text-center mny-rise">
                    <p className="text-sm font-bold text-[#12182F]">The contract has not been revised</p>
                    <p className="text-xs text-[#5A628A] mt-1.5 max-w-sm mx-auto leading-relaxed">
                        Every change to the design fee or execution value is recorded here, with what it
                        moved and why, so the schedule can be traced back to what was signed.
                    </p>
                </div>
            )}

            {/* 5. REVISION HISTORY */}
            {financials.paymentRevisions && financials.paymentRevisions.length > 0 && (
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <h2 className="text-xl font-black text-slate-900 mb-4 flex items-center gap-2">
                        <span className="p-1.5 bg-[#DDE3F5] text-[#3D52A0] rounded-lg"><ClockIcon className="w-5 h-5"/></span>
                        Payment Revisions History
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase border-b border-slate-200">
                                <tr>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">Reason</th>
                                    <th className="p-4 text-right">Execution Value</th>
                                    <th className="p-4 text-right">Design Value</th>
                                    <th className="p-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {[...financials.paymentRevisions].reverse().map((rev) => (
                                    <tr key={rev.id} className="hover:bg-slate-50">
                                        <td className="p-4 text-slate-600">{new Date(rev.date).toLocaleString()}</td>
                                        <td className="p-4 text-slate-800 font-medium">{rev.reason || 'Manual Revision'}</td>
                                        <td className="p-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-slate-400 line-through text-xs">{formatCurrency(rev.previousExecutionValue || 0)}</span>
                                                <span className="text-[#3D52A0] font-bold">{formatCurrency(rev.newExecutionValue || 0)}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-slate-400 line-through text-xs">{formatCurrency(rev.previousDesignValue || 0)}</span>
                                                <span className="text-[#3D52A0] font-bold">{formatCurrency(rev.newDesignValue || 0)}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button 
                                                    onClick={() => setCompareRevision(rev)}
                                                    className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors border border-blue-200"
                                                >
                                                    Compare
                                                </button>
                                                <button 
                                                    onClick={() => handleRevertRevision(rev)}
                                                    className="px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-bold transition-colors border border-amber-200"
                                                >
                                                    Revert
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            </>)}

            {/*
              The net receivable footer stood here and repeated gross,
              collected and remaining on every one of the four tabs — all
              three already owned by the dial in the header, which is on
              screen the whole time. Four copies of one figure was the
              single biggest source of duplicate text on this screen.
            */}
            </>)}

            {/* COMPARE REVISION MODAL */}
            <AnimatePresence>
                {compareRevision && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/50 backdrop-blur-sm p-4"
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
                        >
                            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">{compareRevision.name || 'Version Comparison'}</h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        {compareRevision.reason ? (
                                            <span>{compareRevision.reason} • <span className="font-semibold text-slate-700">{new Date(compareRevision.date).toLocaleString()}</span> vs Current</span>
                                        ) : (
                                            <span>Comparing <span className="font-semibold text-slate-700">{new Date(compareRevision.date).toLocaleString()}</span> vs Current</span>
                                        )}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setCompareRevision(null)}
                                    className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                                >
                                    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            
                            <div className="p-6 overflow-y-auto flex-1 bg-slate-100">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Previous Version */}
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="bg-slate-50 p-4 border-b border-slate-200">
                                            <h3 className="font-bold text-slate-800 text-center">{compareRevision.name || 'Previous Version'}</h3>
                                            <div className="flex justify-between mt-2 text-sm">
                                                <span className="text-slate-500">Execution: <span className="font-bold text-slate-900">{formatCurrency(compareRevision.previousExecutionValue)}</span></span>
                                                <span className="text-slate-500">Design: <span className="font-bold text-slate-900">{formatCurrency(compareRevision.previousDesignValue)}</span></span>
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <h4 className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-2">Milestone Breakdown</h4>
                                            <div className="space-y-2 max-h-[360px] overflow-y-auto">
                                                {(compareRevision.milestones || milestones).map((m: PaymentMilestone) => {
                                                    const isCleared = m.status === 'paid' || m.status === 'invoiced';
                                                    const baseAmount = m.type === 'execution' ? compareRevision.previousExecutionValue : compareRevision.previousDesignValue;
                                                    const origBase = m.type === 'execution' ? originalNetExecution : originalNetDesign;
                                                    
                                                    // Use lockedTaxableBase if available, otherwise fallback to origBase
                                                    let amount = 0;
                                                    if (isCleared) {
                                                        amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || origBase) * (m.percentage / 100);
                                                    } else {
                                                        amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * (m.percentage / 100); 
                                                    }
                                                    
                                                    const billable = m.type === 'execution' ? amount * (billablePercent / 100) : amount;
                                                    const gst = billable * (m.type === 'execution' ? (executionGstEnabled ? gstRate : 0) : gstRate) / 100;
                                                    let total = billable + gst;
                                                    
                                                    const firstDesignMilestoneId = (compareRevision.milestones || milestones).find((x: PaymentMilestone) => x.type === 'design')?.id;
                                                    if (m.id === firstDesignMilestoneId && initiationFee > 0) {
                                                        total = Math.max(0, total - initiationFee);
                                                    }

                                                    return (
                                                        <div key={m.id} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded border border-slate-100">
                                                            <span className="text-slate-600 truncate pr-2" title={m.name}>{m.percentage}% - {m.name}</span>
                                                            <span className="font-bold text-slate-900">{formatCurrency(total)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Current Version */}
                                    <div className="bg-white rounded-xl border border-[#ADBBDA] shadow-sm overflow-hidden ring-1 ring-[#3D52A0]/10">
                                        <div className="bg-[#EDE8F5] p-4 border-b border-[#DDE3F5]">
                                            <h3 className="font-bold text-slate-800 text-center">Current Live Billing</h3>
                                            <div className="flex justify-between mt-2 text-sm">
                                                <span className="text-[#334486]">Execution: <span className="font-bold text-slate-800">{formatCurrency(financials.approvedExecutionValue || originalNetExecution)}</span></span>
                                                <span className="text-[#334486]">Design: <span className="font-bold text-slate-800">{formatCurrency(financials.approvedDesignValue || originalNetDesign)}</span></span>
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <h4 className="font-semibold text-xs text-[#7091E6] uppercase tracking-wider mb-2">Milestone Breakdown</h4>
                                            <div className="space-y-2 max-h-[360px] overflow-y-auto">
                                                {milestones.map(m => {
                                                    const isCleared = m.status === 'paid' || m.status === 'invoiced';
                                                    const baseAmount = m.type === 'execution' ? (financials.approvedExecutionValue || originalNetExecution) : (financials.approvedDesignValue || originalNetDesign);
                                                    const origBase = m.type === 'execution' ? originalNetExecution : originalNetDesign;
                                                    
                                                    let amount = 0;
                                                    if (isCleared) {
                                                        amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || origBase) * (m.percentage / 100);
                                                    } else {
                                                        amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * (m.percentage / 100); 
                                                    }
                                                    
                                                    const billable = m.type === 'execution' ? amount * (billablePercent / 100) : amount;
                                                    const gst = billable * (m.type === 'execution' ? (executionGstEnabled ? gstRate : 0) : gstRate) / 100;
                                                    let total = billable + gst;
                                                    
                                                    const firstDesignMilestoneId = milestones.find(x => x.type === 'design')?.id;
                                                    if (m.id === firstDesignMilestoneId && initiationFee > 0) {
                                                        total = Math.max(0, total - initiationFee);
                                                    }

                                                    return (
                                                        <div key={m.id} className="flex justify-between items-center text-sm p-2 bg-[#EDE8F5]/50 rounded border border-[#DDE3F5]">
                                                            <span className="text-slate-600 truncate pr-2" title={m.name}>{m.percentage}% - {m.name}</span>
                                                            <span className="font-bold text-[#334486]">{formatCurrency(total)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-6 border-t border-slate-200 bg-white flex justify-end gap-3">
                                <button 
                                    onClick={() => setCompareRevision(null)}
                                    className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    Close
                                </button>
                                {compareRevision.id && (
                                    <button 
                                        onClick={() => {
                                            handleRevertRevision(compareRevision);
                                            setCompareRevision(null);
                                        }}
                                        className="px-4 py-2 bg-amber-500 text-white font-bold rounded-lg shadow-sm hover:bg-amber-600 transition-colors flex items-center gap-2"
                                    >
                                        <ClockIcon className="w-4 h-4" />
                                        Revert to Previous
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* PRE-SIGNOFF PAYMENTS EXCEPTION CONFIRMATION MODAL */}
            <AnimatePresence>
                {confirmingException && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/55 backdrop-blur-sm p-4 animate-none"
                        style={{ position: 'fixed', zIndex: 9999 }}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-[#E2E5F0]"
                        >
                            <div className="p-6 text-center space-y-4">
                                <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100">
                                    <AlertTriangle className="w-6 h-6" />
                                </div>
                                
                                <div className="space-y-2">
                                    <h3 className="text-lg font-bold text-slate-900">
                                        Client Unacknowledged Schedule
                                    </h3>
                                    <p className="text-sm text-[#4A5178] leading-relaxed">
                                        The client has not signed or acknowledged the Terms Docket & Payment Schedule yet.
                                    </p>
                                    <p className="text-xs text-[#5A628A] leading-relaxed bg-[#F6F7FB] p-3 rounded-lg border border-[#EDEFF7]">
                                        Do you want to proceed as a special-case exception, on the condition that amended terms and conditions will be signed later?
                                    </p>
                                </div>
                            </div>
                            
                            <div className="p-4 bg-[#F6F7FB] border-t border-[#E2E5F0] flex gap-3">
                                <button 
                                    onClick={() => setConfirmingException(null)}
                                    className="flex-1 px-4 py-2 bg-white text-[#3A416B] font-bold border border-[#E2E5F0] rounded-xl hover:bg-[#EDEFF7] transition-colors text-xs"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleConfirmException}
                                    className="flex-1 px-4 py-2 bg-[#3D52A0] text-white font-bold rounded-xl hover:bg-[#334486] shadow-sm transition-colors text-xs"
                                >
                                    {confirmingException.action === 'mark_paid' ? 'Yes, Mark Paid' : 'Yes, Raise Invoice'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {datingTrack && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#12182F]/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl border border-[#E2E5F0] shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#EDEFF7]">
                            <h3 className="text-sm font-extrabold text-[#12182F]">
                                Date the {datingTrack} track
                            </h3>
                            <p className="text-[11px] text-[#5A628A] font-medium mt-0.5">
                                One start date and a rhythm. Every milestone below gets a target date,
                                which is what the cash-flow forecast and the client's timeline read.
                            </p>
                        </div>

                        <div className="px-5 py-4 space-y-3">
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex-1 min-w-[150px]">
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-[#8E96B8] mb-1">First milestone</label>
                                    <DateField value={dateStart} onChange={setDateStart} placeholder="Start date" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-[#8E96B8] mb-1">Then every</label>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            min={0}
                                            value={dateEvery}
                                            onChange={e => setDateEvery(Math.max(0, Number(e.target.value)))}
                                            className="w-16 text-xs font-bold rounded-lg border border-[#E2E5F0] px-2 py-2 text-[#3A416B] tabular-nums focus:border-[#3D52A0] focus:outline-none"
                                        />
                                        <span className="text-xs font-semibold text-[#5A628A]">weeks</span>
                                    </div>
                                </div>
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={dateOnlyBlanks}
                                    onChange={e => setDateOnlyBlanks(e.target.checked)}
                                    className="w-3.5 h-3.5 rounded border-[#CBD1E4] text-[#3D52A0] cursor-pointer"
                                />
                                <span className="text-[11px] font-semibold text-[#3A416B]">
                                    Leave milestones that already have a date
                                </span>
                            </label>

                            {/* Shown before it is written, because this overwrites real dates. */}
                            <div className="rounded-xl border border-[#E2E5F0] bg-[#F6F7FB]/60 max-h-52 overflow-y-auto divide-y divide-[#EDEFF7]">
                                {trackDatePreview.length === 0 ? (
                                    <p className="text-[11px] text-[#8E96B8] font-medium p-3">Pick a start date to see what this would set.</p>
                                ) : trackDatePreview.map(r => (
                                    <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                        <span className={`text-[11px] font-semibold truncate ${r.skipped ? 'text-[#ADBBDA]' : 'text-[#3A416B]'}`}>{r.name}</span>
                                        <span className={`text-[11px] font-bold tabular-nums shrink-0 ${r.skipped ? 'text-[#ADBBDA]' : 'text-[#3D52A0]'}`}>
                                            {r.skipped
                                                ? 'kept ' + new Date((r.from as string) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
                                                : new Date(r.to + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="px-5 py-3 border-t border-[#EDEFF7] flex justify-end gap-2">
                            <button
                                onClick={() => setDatingTrack(null)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-[#5A628A] hover:bg-[#F6F7FB] transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={applyTrackDates}
                                disabled={!dateStart || trackDatePreview.every(r => r.skipped)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#3D52A0] hover:bg-[#334486] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Set {trackDatePreview.filter(r => !r.skipped).length} dates
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default PaymentCalculatorTab;
