
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { showSuccessWithNext } from './SuccessWithNextToast';
import { calculateSellPrice } from "../lib/utils";
import { ProjectContext, ProposalTier, PaymentMilestone, ClientBilling, FullProjectData, Item, FullBoqItem, PaymentStatus, ProjectDiscount, BoqItem, AIStrategy } from '../types';
import { formatCurrency, formatINR, id as generateId } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Coins, CheckCircle, TrendingUp, Info, AlertTriangle, Sparkles, Sliders, History, FileText, Lock } from '@/lib/lucide-shim';
import Card from './shared/Card';
import { CalculatorIcon, ShieldCheckIcon, AlertIcon, CheckIcon, PencilIcon, ChevronDownIcon, ChevronUpIcon, DeleteIcon, PlusIcon, ScissorsIcon, ClockIcon, CalendarIcon } from './Icons';
import { useOrg } from '../contexts/OrgContext';
import { computeSchedule, outstandingInvoices, resolveFinancials, sameFinancials, billingBase, billingSummary, milestonesFromStructure } from '../lib/paymentSchedule';
import { engagementOf, isFeeOnly } from '../lib/engagement';
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
import { useZohoBooks } from '../hooks/useZohoBooks';
import ZohoRaiseInvoiceDialog from './ZohoRaiseInvoiceDialog';
import type { ZohoRaiseResult } from '../services/zohoBooksService';
import ScopeAdditionsMoneyPanel from './ops/ScopeAdditionsMoneyPanel';
import { useFiguresHidden, Masked, MarginsHidden } from './ui/HideFigures';
import RevisionMoneyPanel from './money/RevisionMoneyPanel';
import { pendingRevision, previewRevisionMoney } from '../lib/revisionMoneyPreview';
import AsActualsCorrectionPanel from './money/AsActualsCorrectionPanel';
import { asActualsInContract, takeAsActualsOut } from '../lib/asActualsCorrection';
import { MoneyBoard, BOARD_ICONS, type BoardTile, type BoardTotals, type BoardPreview } from './money/board/MoneyBoard';
import { TrackColumn, TaxPlate, type TrackFigures, type CardActions } from './money/board/TrackColumn';
import { EditMilestonesModal, type StudioStages } from './money/board/EditMilestonesModal';
import { MilestoneSummary } from './money/board/MilestoneSummary';
import { QuickScheduleModal } from './money/board/QuickScheduleModal';
import { cardStates, trackTotal, shareOf, sameTerms, termsChanges, studioCashPct, snapshotOf, restoreSchedule, milestonesFromIssued, type TaxTerms, type ScheduleChange, type Track as BoardTrack } from '../lib/moneyBoard';
import { Button } from './ui/kit';
import { scheduleDiffers, acceptedLatest, clientCopiesBehind, nextInvoiceSeq } from '../lib/scheduleImpact';
import { isTerminated } from '../lib/termination';
import { holdsFinanceRole } from '../lib/roleAccess';
import TerminationPanel from './termination/TerminationPanel';
import DisputePanel from './disputes/DisputePanel';
import { heldInDispute } from '../lib/disputes';
import type { TerminatePayload } from './termination/TerminateProjectModal';
import { Wallet, SlidersHorizontal } from '@/lib/lucide-shim';

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
    /** Terminates this project: saves it and closes the client portal (App). */
    onTerminate?: (p: TerminatePayload) => Promise<void> | void;
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
                <span className="text-[10px] text-[#ADBBDA] tabular-nums leading-none">₹{compact(hi)}</span>
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
                    className="absolute left-0 text-[10px] text-[#ADBBDA] leading-none"
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
                    <span key={m.key} className={`text-[10px] text-center truncate ${m.isPast ? 'text-[#C3CBE4]' : 'text-[#8E96B8]'}`}>
                        {m.label}
                    </span>
                ))}

                <span className="text-[10px] text-[#ADBBDA]">in</span>
                {months.map(m => (
                    <span key={m.key} className="text-[10px] text-center tabular-nums truncate text-[#3A416B] font-semibold">
                        {cell(m.inflow)}
                    </span>
                ))}

                <span className="text-[10px] text-[#ADBBDA]">out</span>
                {months.map(m => (
                    <span key={m.key} className={`text-[10px] text-center tabular-nums truncate font-semibold ${m.outflow ? 'text-[#C4574F]' : 'text-[#C3CBE4]'}`}>
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

const PaymentCalculatorTab: React.FC<PaymentCalculatorTabProps> = ({ projectContext, setProjectContext, activeTier, tiers = [], allProjects = [], bank = [], fullBoq = [], setBoq, aiStrategy = 'balanced', projectId, onTerminate }) => {
    // --- STATE ---
    const { orgData, currentUserAuth, currentRole, currentRoles } = useOrg() as any;
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
    /* What is billed: the contract's figures while one is in force, otherwise
       the selected option's own (lib/paymentSchedule.ts). The header, the
       versions list and the schedule all read it, so they cannot disagree. */
    const liveBase = billingBase(projectContext, activeTier?.summary, financials);
    const contractExecution = liveBase.contract ? financials.approvedExecutionValue : undefined;
    const contractDesign = liveBase.contract ? financials.approvedDesignValue : undefined;

    const [localGstRate, setGstRate] = useState<number>(projectContext.gstRate || 18);
    const [localInitiationFee, setInitiationFee] = useState<number>(financials.initiationFeePaid);
    const [localBillablePercent, setBillablePercent] = useState<number>(financials.billablePercent);
    const [localDesignBillablePercent, setDesignBillablePercent] = useState<number>(financials.designBillablePercent);
    const [localExecutionGstEnabled, setExecutionGstEnabled] = useState<boolean>(financials.executionGstEnabled);
    const [localDesignGstEnabled, setDesignGstEnabled] = useState<boolean>(financials.designGstEnabled);
    const [localCashLimit, setCashLimit] = useState<number>(financials.taxLimitYearly);
    
    // Discounts
    /* Offers and discounts are edited in Money & Offers (components/money/MoneyOffersTab); Money reads them. */

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
            designBillablePercent?: number;
            executionGstEnabled?: boolean;
            designGstEnabled?: boolean;
            isCurrentActive: boolean;
            isSnapshot: boolean;
        }> = [];

        // 1. Live Current Tier
        const liveExec = liveBase.execution;
        const liveDesign = liveBase.design;
        list.push({
            id: activeTier?.id || 'live-current',
            name: activeTier?.name || 'Current Active Billing',
            timestamp: activeTier?.timestamp || Date.now(),
            lifecycleTag: activeTier?.lifecycleTag || (projectContext.approvedTierId === activeTier?.id ? 'Current contract' : 'Active'),
            executionValue: liveExec,
            designValue: liveDesign,
            milestones: projectContext.paymentMilestones || [],
            billablePercent: localBillablePercent,
            designBillablePercent: localDesignBillablePercent,
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
                designBillablePercent: matchingSnapshot?.designBillablePercent,
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
                    designBillablePercent: s.designBillablePercent,
                    executionGstEnabled: s.executionGstEnabled,
                    designGstEnabled: s.designGstEnabled,
                    isCurrentActive: false,
                    isSnapshot: true,
                });
            }
        });

        return list;
    }, [activeTier, tiers, projectContext.tiers, projectContext.approvedTierId, projectContext.paymentMilestones, snapshots, financials.approvedExecutionValue, financials.approvedDesignValue, liveBase.execution, liveBase.design, localBillablePercent, localDesignBillablePercent, localExecutionGstEnabled]);

    const selectedHistoricalEntry = selectedSnapshotId ? availableVersions.find(v => v.id === selectedSnapshotId) : null;
    const activeSnapshot = selectedHistoricalEntry;
    const isReadOnlyMode = !!selectedHistoricalEntry && !selectedHistoricalEntry.isCurrentActive;
    /* A terminated project's schedule is frozen: the settlement (lib/termination) is the truth from there. */
    const terminated = isTerminated(projectContext);
    const lockedMode = isReadOnlyMode || terminated;

    // Derived active values
    /*
      A fee-only project (design only, design + PMC) has no execution track:
      only its design milestones are shown and billed (lib/engagement.ts).
    */
    const feeOnly = isFeeOnly(engagementOf(projectContext));
    const milestones = (selectedHistoricalEntry ? selectedHistoricalEntry.milestones : (projectContext.paymentMilestones || []))
        .filter((m: PaymentMilestone) => !(feeOnly && m.type === 'execution'));
    const gstRate = localGstRate;
    const cashLimit = localCashLimit;

    const billablePercent = selectedHistoricalEntry && selectedHistoricalEntry.billablePercent !== undefined 
        ? selectedHistoricalEntry.billablePercent 
        : localBillablePercent;

    const designBillablePercent = selectedHistoricalEntry && selectedHistoricalEntry.designBillablePercent !== undefined
        ? selectedHistoricalEntry.designBillablePercent
        : localDesignBillablePercent;

    const executionGstEnabled = selectedHistoricalEntry && selectedHistoricalEntry.executionGstEnabled !== undefined 
        ? selectedHistoricalEntry.executionGstEnabled 
        : localExecutionGstEnabled;
        
        const designGstEnabled = selectedHistoricalEntry && selectedHistoricalEntry.designGstEnabled !== undefined
            ? selectedHistoricalEntry.designGstEnabled
            : localDesignGstEnabled;

    const initiationFee = isReadOnlyMode ? 0 : localInitiationFee;
    const discounts = (isReadOnlyMode ? [] : (financials.discounts || [])) as ProjectDiscount[];

    // Computed vitals for header bar
    const displayDesign = selectedHistoricalEntry
        ? selectedHistoricalEntry.designValue
        : liveBase.design;

    const displayExec = selectedHistoricalEntry
        ? selectedHistoricalEntry.executionValue
        : liveBase.execution;

    usePageHeader({
        vitals: [
            { label: "DESIGN", value: formatINR(displayDesign) },
            { label: "EXECUTION", value: formatINR(displayExec) }
        ]
    }, [displayDesign, displayExec]);

    /*
      Opening a screen is not a decision, so this no longer writes one.

      An effect here used to copy the active tier's totals into
      `approvedDesignValue` / `approvedExecutionValue` the first time anyone
      opened the Money tab. Three live projects were rewritten that way in a
      single afternoon just by being looked at. Worse than the unrequested
      write was what it wrote: the tier total, so a contract negotiated away
      from the BOQ was silently replaced by the BOQ's own number whenever the
      BOQ moved.

      Nothing needed it. The header, the versions list and `computeSchedule`
      all read `liveBase` (billingBase in lib/paymentSchedule.ts): the stored
      values while a contract is in force, the selected option's otherwise.
      The approved values now change only when somebody sets them.
    */

    // Reset Confirm State
    const [isResetting, setIsResetting] = useState(false);

    // Track Filter Tab
    const [activeTrackTab, setActiveTrackTab] = useState<'all' | 'design' | 'execution'>('all');
    const [activeSmartView, setActiveSmartView] = useState<'none' | 'margin' | 'cash-flow'>('none');
    /* Hide figures (lib/figuresPrivacy): the schedule, billing and collections stay; the margin optimizer and the simulator's cost and profit go. */
    const marginsHidden = useFiguresHidden();
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

    /*
      The optional Zoho Books add-in. A studio that has not connected it never
      sees any of this: `connected` is false and Raise Invoice behaves exactly
      as it always did.
    */
    const zohoBooks = useZohoBooks();
    const [zohoRaise, setZohoRaise] = useState<{ milestoneId: string; lockedTaxableBase?: number } | null>(null);

    // Payment Schedule Logic
    const paymentSchedules = projectContext.paymentSchedules || [];
    const latestSchedule = paymentSchedules.length > 0 ? paymentSchedules.reduce((a, b) => a.version > b.version ? a : b) : null;
    /* Every field the schedule document prints: stage, track, share or fixed amount, when it is due, what it unlocks (lib/scheduleImpact). */
    const hasUnsavedScheduleChanges = scheduleDiffers(milestones, latestSchedule);

    const executionMilestonesExist = (ms: PaymentMilestone[]) => ms.some(m => m.type === 'execution');

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
                milestoneId: m.id,
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

    /* Terms & Payment's stages, else FFDS's: the same mapping the proposal reads (lib/paymentSchedule scheduleFor). */
    const getDefaultMilestones = (customStructure?: any) =>
        milestonesFromStructure(customStructure || studioPaymentStr || (orgData as any).paymentStructure, feeOnly);

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

    /*
      A design-only project that becomes turnkey (the client asks the studio to
      build) has its design milestones, some perhaps paid, and no execution
      track. The studio's execution stages are added after them; the design
      milestones are left exactly as they are.
    */
    useEffect(() => {
        if (feeOnly || selectedHistoricalEntry) return;
        const stored = projectContext.paymentMilestones || [];
        if (stored.length === 0 || stored.some(m => m.type === 'execution')) return;
        const execution = getDefaultMilestones().filter(m => m.type === 'execution');
        if (execution.length) setProjectContext(prev => ({ ...prev, paymentMilestones: [...(prev.paymentMilestones || []), ...execution] }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [feeOnly, studioPaymentStr]);

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
            // Reset clears the retainer rather than reinstating a default one.
            initiationFeePaid: 0,
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
        setDesignBillablePercent(100);
        setExecutionGstEnabled(defaultFinancials.executionGstEnabled);
        setDesignGstEnabled(defaultFinancials.designGstEnabled);
        setCashLimit(defaultFinancials.taxLimitYearly);

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

    type InvoiceAction = 'generate_invoice' | 'mark_paid' | 'revert_invoice' | 'revert_payment';

    /* The split and GST rate an invoice goes out at, kept on the milestone so later changes leave it alone. */
    const lockedTermsFor = (m?: PaymentMilestone) => !m ? {} : {
        lockedBillablePercent: m.type === 'execution' ? billablePercent : designBillablePercent,
        lockedGstRate: (m.type === 'execution' ? executionGstEnabled : designGstEnabled) ? gstRate : 0,
    };

    const executeInvoiceAction = (index: number, action: InvoiceAction, lockedTaxableBase?: number) => {
        if (terminated) return;
        const projectCode = (projectContext?.name || 'PRJ').substring(0, 3).toUpperCase();
        /* One past the highest number used, so adding, removing or moving a stage never repeats an invoice number. */
        const seq = nextInvoiceSeq(projectContext.paymentMilestones || milestones, index);
        
        let invNumber = '';
        if (billablePercent > 0) {
            invNumber = `INV-026-${projectCode}-${seq}`;
        } else {
            invNumber = `INV-CASH-${projectCode}-${seq}`;
        }

        if (action === 'generate_invoice') {
            const raiseLocally = () => {
                handleUpdateMilestone(index, { 
                    status: 'invoiced', 
                    invoiceNumber: invNumber, 
                    invoiceDate: new Date().toISOString(),
                    lockedTaxableBase: lockedTaxableBase,
                    ...lockedTermsFor(milestones[index]),
                });
                showSuccessWithNext('Invoice raised successfully');
            };

            /*
              With Zoho Books connected, the invoice is drafted there and Zoho's
              own number comes back, so the app and the books name the same
              invoice. The local number is only for studios without the add-in,
              and for a milestone with nothing officially billable (the cash
              side is never invoiced).
            */
            void (async () => {
                let zs = zohoBooks.status;
                if (!zs && zohoBooks.tenantId) zs = await zohoBooks.refresh();
                if (!zs && zohoBooks.tenantId) {
                    alert('Could not check the Zoho Books connection just now. Please try again in a moment.');
                    return;
                }
                const amt = schedule.byId[milestones[index]?.id];
                if (!zs?.connected || !amt || !(amt.billable > 0)) { raiseLocally(); return; }
                if (!zs.canRaise) {
                    alert('Zoho Books is connected, so invoices are raised there. Ask an Owner, Admin or Ops Director to raise this one.');
                    return;
                }
                if (!projectId) {
                    alert('Save the project first, then raise the invoice.');
                    return;
                }
                setZohoRaise({ milestoneId: milestones[index].id, lockedTaxableBase });
            })();
        } else if (action === 'mark_paid') {
            /* The day it landed, for Reports: cash by month and days to get paid. */
            const pm = milestones[index];
            handleUpdateMilestone(index, {
                status: 'paid', paidDate: new Date().toLocaleDateString('en-CA'),
                ...(pm && typeof pm.lockedBillablePercent !== 'number' ? lockedTermsFor(pm) : {}),
            });
        } else if (action === 'revert_payment') {
            /*
              Un-marking a payment is not the same as cancelling the invoice.

              `paid` used to be terminal: every control on the row was gated on
              `!m.status || m.status === 'pending'`, and the revert button was
              rendered only for `invoiced`. So a milestone marked paid by
              mistake could not be corrected, split, reordered or deleted --
              one wrong click was permanent. Harmony 704 sat on a paid sign-up
              milestone locked to a design fee the project no longer had,
              reporting more collected than the entire fee.

              Stepping back to `invoiced` keeps the invoice and its number
              intact, because "they have not paid" and "this invoice should not
              exist" are different statements. The existing revert below makes
              the second one, and from `pending` the edit controls return on
              their own.
            */
            handleUpdateMilestone(index, { status: 'invoiced', paidDate: undefined });
        } else if (action === 'revert_invoice') {
            if (milestones[index]?.zohoInvoiceId &&
                !window.confirm('This takes the milestone back to pending here. The draft in Zoho Books is not deleted: remove or void it there, or raising again will hand you the same draft.')) {
                return;
            }
            handleUpdateMilestone(index, { 
                status: 'pending',
                invoiceNumber: undefined,
                invoiceDate: undefined,
                paidDate: undefined,
                lockedTaxableBase: undefined,
                lockedBillablePercent: undefined,
                lockedGstRate: undefined,
                zohoInvoiceId: undefined
            });
        }
    };

    const handleInvoiceAction = (index: number, action: InvoiceAction, lockedTaxableBase?: number) => {
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

    // A fee-only project bills no execution and the fee engine's design fee (lib/paymentSchedule.ts).
    const optionSummary = billingSummary(projectContext, activeTier?.summary);
    const originalExecutionTotal = selectedHistoricalEntry
        ? selectedHistoricalEntry.executionValue
        : (optionSummary?.totalSell || 0);

    const originalDesignFee = selectedHistoricalEntry
        ? selectedHistoricalEntry.designValue
        : (optionSummary?.designFee || 0);

    const rawExecutionTotal = selectedHistoricalEntry
        ? selectedHistoricalEntry.executionValue
        : liveBase.execution;

    const rawDesignFee = selectedHistoricalEntry
        ? selectedHistoricalEntry.designValue
        : liveBase.design;

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

    /*
      The latest schedule's execution stages no longer add up to the execution
      after discounts: a discount was given (a scope revision's own, say) or the
      value moved, with the milestones left as they were. Generating a revised
      schedule is then the way to bring it up to date, not only after a
      milestone edit. A schedule with no execution stages is not judged here.
    */
    const scheduleAmountsStale = (() => {
        if (!latestSchedule || selectedHistoricalEntry) return false;
        const exec = (latestSchedule.advances || []).filter((a: any) => a.phase === 'execution');
        if (!exec.length || !executionMilestonesExist(milestones)) return false;
        const sum = exec.reduce((t: number, a: any) => t + (Number(a.amount) || 0), 0);
        return Math.abs(sum - taxableExecution) > Math.max(10, exec.length);
    })();
    const scheduleOutOfDate = !!hasUnsavedScheduleChanges || scheduleAmountsStale;

    // 2. Filter Milestones
    const executionMilestones = milestones.filter(m => m.type === 'execution');
    const designMilestones = milestones.filter(m => m.type === 'design');
    
    // 3. Splits (on Taxable Base)
    const executionBillable = taxableExecution * (billablePercent / 100);
    const executionCash = taxableExecution * ((100 - billablePercent) / 100);

    // 4. GST (Liability) - Calculated on Taxable Amount
    const gstOnExecution = executionGstEnabled ? (executionBillable * (gstRate / 100)) : 0;
    const gstOnDesign = designGstEnabled ? taxableDesign * (designBillablePercent / 100) * (gstRate / 100) : 0;
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
    const scheduleArgs = useMemo(() => ({
        context: { ...projectContext, paymentMilestones: milestones },
        tierSummary: { totalSell: originalExecutionTotal, designFee: originalDesignFee },
        overrides: {
            gstRate,
            billablePercent,
            designBillablePercent,
            executionGstEnabled,
            designGstEnabled,
            initiationFeePaid: initiationFee,
            discounts: discounts as any,
            approvedExecutionValue: rawExecutionTotal,
            approvedDesignValue: rawDesignFee,
        },
    }), [projectContext, milestones, originalExecutionTotal, originalDesignFee, gstRate,
         billablePercent, designBillablePercent, executionGstEnabled, designGstEnabled, initiationFee, discounts,
         rawExecutionTotal, rawDesignFee]);
    const schedule = useMemo(() => computeSchedule(scheduleArgs), [scheduleArgs]);
    const canTerminate = holdsFinanceRole(currentRoles?.length ? currentRoles : currentRole);
    const terminationActor = String(currentUserAuth?.displayName || currentUserAuth?.email || orgData?.role || 'Studio');

    /*
      An open Scope Revision, previewed on these same figures.

      The milestones above stay on the approved scope until the client approves
      the revision and the studio applies it; this shows what they become, with
      the discount, GST and billing split as set here. Nothing is saved. Not on
      an older version from History: that is the past, not what a revision changes.
    */
    const openRevision = useMemo(
        () => (selectedHistoricalEntry ? null : pendingRevision(projectContext, tiers, bank)),
        [selectedHistoricalEntry, projectContext, tiers, bank],
    );
    const revisionPreview = useMemo(
        () => (openRevision ? previewRevisionMoney(scheduleArgs, openRevision.v2Total, openRevision.discounts, openRevision.designFeeAfter) : null),
        [openRevision, scheduleArgs],
    );

    /*
      An approved value that still counts as-actuals (lib/asActualsCorrection):
      shown with what taking them out does, and done on the studio's click.
    */
    const asActualsFix = useMemo(
        () => (selectedHistoricalEntry ? null : asActualsInContract(projectContext, tiers)),
        [selectedHistoricalEntry, projectContext, tiers],
    );
    const asActualsPreview = useMemo(
        () => (asActualsFix ? previewRevisionMoney(scheduleArgs, asActualsFix.to) : null),
        [asActualsFix, scheduleArgs],
    );
    const applyAsActualsFix = () => {
        if (!asActualsFix) return;
        setProjectContext(takeAsActualsOut(asActualsFix, currentUserAuth?.displayName || currentUserAuth?.email || 'Studio'));
    };

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
    const [moneyTab, setMoneyTab] = useState<'board' | 'history'>('board');
    /* The Money board: the tax tools panel, a tax change being previewed, and the milestone editor. */
    const [taxToolsOpen, setTaxToolsOpen] = useState(false);
    const [termsDraft, setTermsDraft] = useState<TaxTerms | null>(null);
    const [termsReason, setTermsReason] = useState('');
    const [editFocus, setEditFocus] = useState<BoardTrack | 'both' | null>(null);
    /* Quick schedule (lib/quickSchedule): open, and the draft it hands to Edit milestones to fine-tune. */
    const [quickOpen, setQuickOpen] = useState(false);
    const [editDraft, setEditDraft] = useState<PaymentMilestone[] | null>(null);
    /* Putting back an earlier schedule from History: what it came from, and what had to give way to billing since. */
    const [restoreFrom, setRestoreFrom] = useState<{ label: string; notes: string[] } | null>(null);
    /* Which cards this screen just changed, so a change from the portal or the site can be told apart. */
    const localTouch = useRef<Map<string, number>>(new Map());
    /* Retainer editor on the overview. Closed unless the user opens it. */
    const [retainerOpen, setRetainerOpen] = useState(false);
    /* Per-invoice concession editor: the milestone id being edited, or null. */
    const [discountFor, setDiscountFor] = useState<string | null>(null);

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
        setMoneyTab('board');
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
    /* Invoices held in a payment dispute stay off the chase ladder: the dispute card is where they are worked. */
    const heldNames = useMemo(
        () => new Set(milestones.filter((m) => heldInDispute(projectContext, m)).map((m) => m.name)),
        [milestones, projectContext],
    );
    const invoicedOutstanding = useMemo(
        () => outstandingInvoices(schedule, { paymentMilestones: milestones.filter((m) => !heldInDispute(projectContext, m)) }),
        [schedule, milestones, projectContext],
    );

    const escalationCfg = (moneySettings as any)?.paymentMilestones?.escalation || DEFAULT_ESCALATION;
    const chase = useMemo(
        () => collections(((moneyRequests || []) as any[]).filter((r) => !heldNames.has(r?.milestoneLabel)) as any, invoicedOutstanding, escalationCfg),
        [moneyRequests, invoicedOutstanding, escalationCfg, heldNames],
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
            designBillablePercent,
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
                /* Merged, not replaced: the record also holds the revision log, version snapshots and schedule changes. */
                setProjectContext(prev => ({ ...prev, financials: { ...(prev.financials || {}), ...newConfig } as any }));
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [initiationFee, billablePercent, designBillablePercent, executionGstEnabled, designGstEnabled, executionCash, cashLimit, discounts, financials.approvedExecutionValue, financials.approvedDesignValue, isReadOnlyMode, projectId, projectContext?.name]);


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
        // A fee-only project has no execution track to balance.
        if (!feeOnly && Math.abs(totalExecPct - 100) > 0.1) {
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
                text: feeOnly
                    ? 'All design milestones are invoiced or paid. Release the GFC set to move the project to Drawings & Selections (stage 5).'
                    : 'All Design milestones are invoiced or paid. Consider advancing the project stage to Execution (Stage 5) to initiate civil/material orders.',
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

    /*
      The Money board (DESIGN.md → "Money motion", chosen by the owner on 18 Nov 2026).

      Money opens on the design and execution milestones side by side, each
      track with its tax plate. A change to the taxable share or GST is
      previewed on every unpaid milestone before it is applied; the schedule
      itself is edited in one window and saved in one go. Both are kept in
      History with what moved and why.
    */
    const savedTerms: TaxTerms = { billablePercent, designBillablePercent, executionGstEnabled, designGstEnabled, gstRate };
    const shownTerms: TaxTerms = termsDraft || savedTerms;
    const previewing = !!termsDraft && !sameTerms(termsDraft, savedTerms);
    const previewSchedule = useMemo(
        () => (previewing && termsDraft ? computeSchedule({ ...scheduleArgs, overrides: { ...scheduleArgs.overrides, ...termsDraft } }) : null),
        [previewing, termsDraft, scheduleArgs],
    );
    const priceDraft = useCallback(
        (draft: PaymentMilestone[]) => computeSchedule({ ...scheduleArgs, context: { ...scheduleArgs.context, paymentMilestones: draft } }),
        [scheduleArgs],
    );
    const shown = previewSchedule || schedule;
    const touch = (id: string) => { localTouch.current.set(id, Date.now()); };
    const wasLocal = useCallback((id: string) => Date.now() - (localTouch.current.get(id) || 0) < 15000, []);

    const trackOf = (m: PaymentMilestone): BoardTrack => (m.type === 'execution' ? 'execution' : 'design');
    const figuresOf = (s: typeof schedule, t: BoardTrack): TrackFigures => {
        const rows = s.amounts.filter(a => a.type === t);
        const sum = (k: 'billable' | 'gst' | 'cash' | 'base') => rows.reduce((x, a) => x + (a[k] || 0), 0);
        const taxable = t === 'design' ? s.totals.taxableDesign : s.totals.taxableExecution;
        const gross = t === 'design' ? rawDesignFee : rawExecutionTotal;
        return { gross, discount: Math.max(0, gross - taxable), taxable, billable: sum('billable'), gst: sum('gst'), cash: sum('cash'), total: sum('base') + sum('gst') };
    };
    const earnedIds = useMemo(() => new Set((billable.items || []).filter(i => i.earned).map(i => i.id)), [billable]);
    const states = useMemo(() => cardStates(milestones, earnedIds, terminated), [milestones, earnedIds, terminated]);
    const owedWhere = (s: typeof schedule, pick: (m: PaymentMilestone) => boolean) =>
        milestones.filter(pick).reduce((x, m) => x + (s.byId[m.id]?.owed || 0), 0);
    const sumOf = (s: typeof schedule, k: 'gst' | 'cash' | 'base') => s.amounts.reduce((x, a) => x + (a[k] || 0), 0);
    const contractOf = (s: typeof schedule) => sumOf(s, 'base') + sumOf(s, 'gst');

    const boardTotals: BoardTotals = (() => {
        const contract = contractOf(schedule);
        const collected = totalPaid;
        const withClient = owedWhere(schedule, m => states[m.id] === 'invoiced');
        const earned = owedWhere(schedule, m => states[m.id] === 'earned');
        return {
            contract, collected, withClient, earned,
            notEarned: Math.max(0, contract - collected - withClient - earned),
            taxable: schedule.totals.taxableDesign + schedule.totals.taxableExecution,
            gst: sumOf(schedule, 'gst'), cash: sumOf(schedule, 'cash'),
        };
    })();
    const boardStatus: { label: string; tone: 'brand' | 'warn' | 'good' | 'bad' } = chase.amountOverdue > 0
        ? { label: `${formatCurrency(chase.amountOverdue)} overdue`, tone: 'bad' }
        : boardTotals.earned > 0
            ? { label: `${formatCurrency(boardTotals.earned)} to invoice`, tone: 'brand' }
            : boardTotals.withClient > 0
                ? { label: `${formatCurrency(boardTotals.withClient)} with client`, tone: 'warn' }
                : { label: 'Nothing overdue', tone: 'good' };

    /* Accepted means the client accepted after the latest version was generated, not that the terms were once acknowledged. */
    const scheduleAccepted = acceptedLatest(projectContext.engagement, latestSchedule);
    /* What the client holds that is now older than the schedule, in order (lib/scheduleImpact). */
    const copiesBehind = lockedMode ? [] : clientCopiesBehind(projectContext, milestones);
    const scheduleAction = !latestSchedule
        ? { label: 'Generate payment schedule', onClick: handleGenerateSchedule }
        : scheduleOutOfDate
            ? { label: `Generate revised schedule (v${latestSchedule.version + 1})`, onClick: handleGenerateSchedule }
            : { label: `Payment schedule v${latestSchedule.version}`, onClick: () => setMoneyTab('history') };

    const today = new Date();
    const in30 = milestones.filter(m => m.status !== 'paid' && m.date && (new Date(m.date.slice(0, 10) + 'T00:00:00').getTime() - today.getTime()) <= 30 * 864e5);
    const undated = milestones.filter(m => m.status !== 'paid' && !m.date);
    const projectCashOf = (s: typeof schedule) => s.amounts.reduce((x, a) => x + (a.type === 'execution' ? a.cash : 0), 0);
    const studioPctNow = cashUtilization;
    const studioPctPreview = previewSchedule ? studioCashPct(otherProjectsCash, projectCashOf(previewSchedule), cashLimit) : null;
    const studioPct = studioPctPreview ?? studioPctNow;
    const boardTiles: BoardTile[] = [
        {
            key: 'collections', label: 'Collections', icon: BOARD_ICONS.Coins,
            tone: chase.chaseNow > 0 ? 'bad' : chase.items.length > 0 ? 'warn' : 'ok',
            value: formatCurrency(chase.amountOutstanding),
            sub: chase.chaseNow > 0 ? `${chase.chaseNow} past due` : chase.items.length > 0 ? `${chase.items.length} open, none past due` : 'Nothing out with the client',
        },
        {
            key: 'next30', label: 'Next 30 days', icon: BOARD_ICONS.CalendarClock, tone: 'brand',
            value: formatCurrency(in30.reduce((x, m) => x + (schedule.byId[m.id]?.owed || 0), 0)),
            sub: undated.length ? `Expected in · ${undated.length} undated, tap to date them from the timeline` : `Expected in · ${formatCurrency(gap.outflowTotal + gap.undatedOutflow)} owed to vendors`,
            onClick: undated.length && !lockedMode ? runDateDerivation : undefined,
        },
        {
            key: 'schedule', label: 'Payment schedule', icon: BOARD_ICONS.FileSignature,
            tone: !latestSchedule || scheduleOutOfDate ? 'warn' : scheduleAccepted ? 'ok' : 'slate',
            value: !latestSchedule ? 'Not generated' : scheduleOutOfDate ? 'Out of date' : scheduleAccepted ? 'Accepted' : `v${latestSchedule.version} issued`,
            sub: !latestSchedule ? 'Tap to generate it from these milestones' : hasUnsavedScheduleChanges ? 'Milestones changed since it was issued' : scheduleAmountsStale ? 'The value or the discounts changed since it was issued' : scheduleAccepted ? 'The client accepted the schedule and terms' : 'Waiting for the client to accept it',
            onClick: (!latestSchedule || scheduleOutOfDate) && !lockedMode ? handleGenerateSchedule : undefined,
        },
        {
            key: 'studio', label: 'Studio cash this FY', icon: BOARD_ICONS.Gauge,
            tone: studioPct > 100 ? 'bad' : studioPct > 85 ? 'warn' : 'ok',
            value: <>{Math.round(studioPct)}% <span className="text-xs font-semibold text-slate-500">of limit</span>
                {studioPctPreview !== null && Math.round(studioPctPreview - studioPctNow) !== 0 && (
                    <span className={`ml-1.5 px-1.5 rounded-md text-[10px] font-bold ${studioPctPreview > studioPctNow ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {studioPctPreview > studioPctNow ? '+' : ''}{Math.round(studioPctPreview - studioPctNow)} pts
                    </span>
                )}</>,
            sub: 'Every project. Moves with this project\'s split.',
            meter: { pct: studioPct, tone: studioPct > 100 ? 'bad' : studioPct > 85 ? 'warn' : 'ok' },
        },
    ];

    const setTerm = (up: Partial<TaxTerms>) => {
        const next = { ...shownTerms, ...up };
        setTermsDraft(sameTerms(next, savedTerms) ? null : next);
    };
    const clearedCount = milestones.filter(m => m.status === 'paid' || m.status === 'invoiced').length;
    const applyTerms = () => {
        if (!termsDraft) return;
        const before = contractOf(schedule), after = previewSchedule ? contractOf(previewSchedule) : before;
        const entry: ScheduleChange = { id: generateId(), date: new Date().toISOString(), kind: 'terms', changes: termsChanges(savedTerms, termsDraft), reason: termsReason.trim() || undefined, before, after };
        setBillablePercent(termsDraft.billablePercent);
        setDesignBillablePercent(termsDraft.designBillablePercent);
        setExecutionGstEnabled(termsDraft.executionGstEnabled);
        setDesignGstEnabled(termsDraft.designGstEnabled);
        setGstRate(termsDraft.gstRate);
        setProjectContext(prev => ({ ...prev, gstRate: termsDraft.gstRate, financials: { ...(prev.financials as any || {}), scheduleChanges: [...((prev.financials as any)?.scheduleChanges || []), entry] } as any }));
        setTermsDraft(null);
        setTermsReason('');
        showSuccessWithNext('Tax terms applied to the schedule');
    };
    const boardPreview: BoardPreview | null = previewing && previewSchedule ? {
        before: contractOf(schedule), after: contractOf(previewSchedule),
        gstBefore: sumOf(schedule, 'gst'), gstAfter: sumOf(previewSchedule, 'gst'),
        cashBefore: sumOf(schedule, 'cash'), cashAfter: sumOf(previewSchedule, 'cash'),
        changed: milestones.filter(m => m.status !== 'paid' && m.status !== 'invoiced' && Math.round(previewSchedule.byId[m.id]?.owed || 0) !== Math.round(schedule.byId[m.id]?.owed || 0)).length,
        locked: clearedCount,
        needReason: clearedCount > 0, reason: termsReason, onReason: setTermsReason,
        onApply: applyTerms, onDiscard: () => { setTermsDraft(null); setTermsReason(''); },
    } : null;

    const indexOf = (id: string) => milestones.findIndex(m => m.id === id);
    const cardActions: CardActions = {
        raise: (id) => { const i = indexOf(id); if (i < 0) return; if (previewing) { alert('Apply or discard the tax preview first, so the invoice goes out on the terms you mean.'); return; } touch(id); handleInvoiceAction(i, 'generate_invoice', schedule.byId[id]?.taxableBaseForLocking); },
        markPaid: (id) => { const i = indexOf(id); if (i < 0) return; touch(id); handleInvoiceAction(i, 'mark_paid'); },
        revertInvoice: (id) => { const i = indexOf(id); if (i < 0) return; touch(id); handleInvoiceAction(i, 'revert_invoice'); },
        revertPayment: (id) => { const i = indexOf(id); if (i < 0) return; touch(id); handleInvoiceAction(i, 'revert_payment'); },
        toggleStep: (id, k) => { const i = indexOf(id); if (i < 0) return; touch(id); handleToggleSubStep(i, k); },
        setDate: (id, v) => { const i = indexOf(id); if (i < 0) return; touch(id); handleUpdateMilestone(i, { date: v || undefined }); },
        setDiscount: (id, amount, reason) => { const i = indexOf(id); if (i < 0) return; touch(id); handleUpdateMilestone(i, { discountAmount: amount > 0 ? amount : undefined, discountReason: amount > 0 ? reason : undefined }); },
        setHandover: (id, on) => { const i = indexOf(id); if (i < 0) return; touch(id); handleUpdateMilestone(i, { isHandoverAdvance: on }); },
        edit: (t) => openEditor(t),
    };
    /* Opens an earlier schedule in Edit milestones, made safe against what has been billed since; nothing changes until it is saved. */
    function openRestore(past: PaymentMilestone[], label: string) {
        if (previewing) { alert('Apply or discard the tax preview first.'); return; }
        const { draft, notes } = restoreSchedule(past.filter(m => !(feeOnly && m.type === 'execution')), milestones, { design: taxableDesign, execution: taxableExecution });
        setRestoreFrom({ label, notes });
        setEditDraft(draft);
        setEditFocus('both');
    }
    function openEditor(t: BoardTrack | 'both') {
        if (previewing) { alert('Apply or discard the tax preview first.'); return; }
        setEditFocus(t);
    }

    const retainerLine = (
        <span className="basis-full inline-flex flex-wrap items-center gap-2 text-slate-600">
            <Wallet className="w-3.5 h-3.5 text-[#3D52A0]" />
            Initiation retainer: {initiationFee > 0 ? <b className="text-slate-800 tabular-nums">{formatCurrency(initiationFee)}</b> : 'none taken'}
            {initiationFee > 0 && <span className="text-slate-500">· comes off the first design invoice</span>}
            {!lockedMode && !retainerOpen && <Button size="sm" variant="quiet" onClick={() => setRetainerOpen(true)}>{initiationFee > 0 ? 'Change' : 'Add retainer'}</Button>}
            {!lockedMode && retainerOpen && (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                    {[4999, 10000, 25000].map(v => <Button key={v} size="sm" variant={initiationFee === v ? 'primary' : 'secondary'} onClick={() => setInitiationFee(v)}>{formatCurrency(v)}</Button>)}
                    <input className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs tabular-nums" inputMode="numeric" aria-label="Retainer amount"
                        value={initiationFee || ''} placeholder="₹0" onChange={e => setInitiationFee(Math.max(0, Number(e.target.value.replace(/[^0-9]/g, '')) || 0))} />
                    <Button size="sm" variant="secondary" onClick={() => setRetainerOpen(false)}>Done</Button>
                    {initiationFee > 0 && <Button size="sm" variant="quiet" onClick={() => { setInitiationFee(0); setRetainerOpen(false); }}>Remove</Button>}
                </span>
            )}
        </span>
    );

    const tracks: BoardTrack[] = feeOnly ? ['design'] : ['design', 'execution'];
    const boardColumns = tracks.map((t, n) => {
        const rows = milestones.filter(m => trackOf(m) === t);
        const taxableT = t === 'design' ? taxableDesign : taxableExecution;
        const tot = trackTotal(rows, taxableT);
        const share = t === 'design' ? shownTerms.designBillablePercent : shownTerms.billablePercent;
        const gstOnT = t === 'design' ? shownTerms.designGstEnabled : shownTerms.executionGstEnabled;
        const collectedT = owedWhere(schedule, m => trackOf(m) === t && m.status === 'paid');
        const withClientT = owedWhere(schedule, m => trackOf(m) === t && m.status === 'invoiced');
        return (
            <TrackColumn key={t} index={n} track={t}
                value={t === 'design' ? rawDesignFee : rawExecutionTotal}
                plate={(
                    <TaxPlate track={t} share={share} gstOn={gstOnT} gstRate={shownTerms.gstRate}
                        figures={figuresOf(shown, t)} saved={previewSchedule ? figuresOf(schedule, t) : undefined}
                        readOnly={lockedMode}
                        onShare={v => setTerm(t === 'design' ? { designBillablePercent: v } : { billablePercent: v })}
                        onGst={on => setTerm(t === 'design' ? { designGstEnabled: on } : { executionGstEnabled: on })}
                        footer={t === 'design' ? retainerLine : undefined} />
                )}
                milestones={rows} states={states} amounts={shown.byId} saved={previewSchedule ? schedule.byId : undefined}
                shares={Object.fromEntries(rows.map(m => [m.id, shareOf(m, taxableT)]))}
                totalPct={tot.pct} whole={tot.whole || rows.length === 0}
                collected={collectedT} withClient={withClientT} clientPays={figuresOf(schedule, t).total}
                waitingOnClient={!scheduleAccepted} readOnly={lockedMode} wasLocal={wasLocal}
                actions={cardActions} highlightId={highlightMilestoneId}
                onSetDates={lockedMode ? undefined : () => setDatingTrack(t)} />
        );
    });

    const boardSummary = (
        <MilestoneSummary onOpen={goToMilestone} tracks={tracks.map(t => {
            const rows = milestones.filter(m => trackOf(m) === t);
            const taxableT = t === 'design' ? taxableDesign : taxableExecution;
            return { track: t, milestones: rows, states, amounts: shown.byId, saved: previewSchedule ? schedule.byId : undefined,
                shares: Object.fromEntries(rows.map(m => [m.id, shareOf(m, taxableT)])) };
        })} />
    );

    const versionPill = availableVersions.length > 1 ? (
        <button type="button" onClick={() => setMoneyTab('history')} title="Switch or audit billing versions in History"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-[#3D52A0]/40">
            <History className="w-3.5 h-3.5 text-[#3D52A0]" />
            {selectedHistoricalEntry ? `Viewing ${selectedHistoricalEntry.name}` : (availableVersions.find(v => v.isCurrentActive)?.name || 'Active version')}
            <span className="text-slate-400">· {availableVersions.length} versions</span>
        </button>
    ) : null;

    const boardNotices = (
        <>
            {copiesBehind.length > 0 && (
                <section className="rounded-2xl border border-[#3D52A0]/30 bg-white px-5 py-4 hud-panel-in" aria-label="Bring the client's copies up to date">
                    <div className="flex flex-wrap items-start gap-3">
                        <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><FileText className="w-4 h-4" /></span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800">Bring the client's copies up to date</p>
                            <p className="text-xs text-slate-500">The schedule changed. Everything on this screen, the proposal and the reports already show it; what the client holds does not until you do these, in order.</p>
                        </div>
                    </div>
                    <ol className="mt-3 space-y-2">
                        {copiesBehind.map((st, i) => (
                            <li key={st.key} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 hud-row-in" style={{ animationDelay: `${i * 40}ms` }}>
                                <span className="w-6 h-6 rounded-full bg-[#3D52A0] text-white text-xs font-bold grid place-items-center shrink-0">{i + 1}</span>
                                <span className="flex-1 min-w-[200px]"><b className="block text-xs text-slate-800">{st.title}</b><span className="text-[11px] text-slate-500">{st.why}</span></span>
                                <Button size="sm" variant={i === 0 ? 'primary' : 'secondary'} onClick={() => ('action' in st.go ? handleGenerateSchedule() : window.dispatchEvent(new CustomEvent('change-tab', { detail: (st.go as { tab: string }).tab })))}>{st.label}</Button>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
            {(schedule.overBilled || []).map(ob => (
                <div key={ob.track} className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-xs text-amber-900">
                    <p className="text-sm font-bold">{ob.track === 'design' ? 'Design' : 'Execution'} is billed {formatCurrency(ob.overBy)} over its contract</p>
                    <p className="mt-1">Invoiced milestones account for {formatCurrency(ob.lockedBase)} against a contract of {formatCurrency(ob.taxableBase)}.
                        {ob.unpaidCount > 0 ? ` The ${ob.unpaidCount} milestone${ob.unpaidCount === 1 ? '' : 's'} still unpaid ${ob.unpaidCount === 1 ? 'is' : 'are'} shown as zero owed, because there is nothing left to bill against.` : ' Every milestone on this track is settled, so the difference sits in what was invoiced.'}
                        {' '}Either the contract value is understated, or a milestone was invoiced at the wrong base.</p>
                </div>
            ))}
            {asActualsFix && asActualsPreview && <AsActualsCorrectionPanel c={asActualsFix} preview={asActualsPreview} onApply={applyAsActualsFix} />}
            {openRevision && revisionPreview && <RevisionMoneyPanel rev={openRevision} preview={revisionPreview} compact onOpen={() => openEditor('both')} />}
            <ScopeAdditionsMoneyPanel summary={scopeSummary} contractedExGst={scopeContracted} baseMarginPct={scopeBaseMarginPct} loading={scopeLoading} error={scopeError} />
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
        </>
    );

    const breakdownToggle = (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setTaxToolsOpen(o => !o)} aria-expanded={taxToolsOpen} className="group flex flex-1 min-w-[240px] items-center gap-3 text-left">
                    <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><SlidersHorizontal className="w-4 h-4" /></span>
                    <span className="min-w-0">
                        <span className="block font-bold text-slate-800">Contract breakdown and tax tools</span>
                        <span className="block text-xs text-slate-500">The full table, the cash limit, discounts and the split-GST simulator.</span>
                    </span>
                    <ChevronDownIcon className={`ml-auto w-4 h-4 text-slate-400 mb-turn ${taxToolsOpen ? 'rotate-180' : ''}`} />
                </button>
                <span className="flex flex-wrap gap-2">
                    {setBoq && !marginsHidden && <Button size="sm" variant="secondary" icon={TrendingUp} onClick={() => setActiveSmartView('margin')}>Margin optimizer</Button>}
                    <Button size="sm" variant="secondary" icon={Coins} onClick={() => setActiveSmartView('cash-flow')}>Cash flow forecast</Button>
                </span>
            </div>
        </section>
    );

    const scheduleChangeLog: ScheduleChange[] = ((financials as any)?.scheduleChanges || []) as ScheduleChange[];
    const scheduleLog = scheduleChangeLog.length > 0 ? (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in">
            <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><History className="w-4 h-4" /></span>
                <div><h3 className="font-bold text-slate-800">Schedule and tax changes</h3>
                    <p className="text-xs text-slate-500">Every saved change to the milestones or the tax terms, with what moved and why.</p></div>
            </div>
            <div className="mt-4 divide-y divide-slate-100">
                {[...scheduleChangeLog].reverse().map((c, i) => (
                    <div key={c.id} className="py-3 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <b className="text-slate-800">{c.kind === 'terms' ? 'Tax terms' : 'Milestones'}</b>
                            <span className="text-xs text-slate-500">{new Date(c.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                            {typeof c.before === 'number' && typeof c.after === 'number' && Math.round(c.before) !== Math.round(c.after) && (
                                <span className="ml-auto text-xs text-slate-600 tabular-nums">Client pays {formatCurrency(c.before)} → <b className="text-slate-800">{formatCurrency(c.after)}</b></span>
                            )}
                        </div>
                        {c.reason && <p className="text-xs text-slate-700 mt-1">{c.reason}</p>}
                        <ul className="mt-1 text-[11px] text-slate-500 list-disc pl-4">{c.changes.map((x, k) => <li key={k}>{x}</li>)}</ul>
                        {c.kind === 'schedule' && !lockedMode && (c.snapshot?.length ? (
                            <Button size="sm" variant="quiet" icon={RotateCcw} className="mt-1 -ml-3" onClick={() => openRestore(c.snapshot!, `before the change on ${new Date(c.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`)}>
                                Restore the schedule from before this change
                            </Button>
                        ) : <p className="mt-1 text-[11px] text-slate-400">Saved before restore was added, so it cannot be put back.</p>)}
                    </div>
                ))}
            </div>
        </section>
    ) : null;

    const studioStages: StudioStages | null = (() => {
        const s: any = studioPaymentStr || FFDS_PAYMENT_STRUCTURE_DEFAULTS;
        if (!s?.designStages && !s?.executionStages) return null;
        const map = (list: any[]) => (list || []).map((x: any) => ({ name: x.name, pct: Number(x.pct) || 0, trigger: x.trigger, unlocks: x.unlocks }));
        return { design: map(s.designStages), execution: map(s.executionStages) };
    })();

    const saveScheduleDraft = (draft: PaymentMilestone[], reason: string, changes: string[]) => {
        const before = contractOf(schedule), after = contractOf(priceDraft(draft));
        const said = restoreFrom ? [`Restored the schedule from ${restoreFrom.label}`, ...changes] : changes;
        /* The schedule as it was, kept with the change so History can put it back. */
        const entry: ScheduleChange = { id: generateId(), date: new Date().toISOString(), kind: 'schedule', changes: said, reason: reason || undefined, before, after, snapshot: snapshotOf(milestones) };
        draft.forEach(m => touch(m.id));
        setProjectContext(prev => ({
            ...prev,
            paymentMilestones: [...draft, ...((prev.paymentMilestones || []).filter(m => feeOnly && m.type === 'execution'))],
            financials: { ...(prev.financials as any || {}), scheduleChanges: [...((prev.financials as any)?.scheduleChanges || []), entry] } as any,
        }));
        setEditFocus(null);
        setEditDraft(null);
        setQuickOpen(false);
        setRestoreFrom(null);
        showSuccessWithNext(restoreFrom ? 'Earlier schedule restored' : 'Milestones saved');
    };

    const saveDraftAsStudioDefaults = async (draft: PaymentMilestone[]) => {
        if (!window.confirm('Save these milestones as the studio defaults for future projects?')) return;
        try {
            const stage = (m: PaymentMilestone, k: string) => ({ code: k, name: m.name, pct: Math.round(shareOf(m, trackOf(m) === 'design' ? taxableDesign : taxableExecution) * 100) / 100, trigger: m.trigger || '', unlocks: m.unlocks || '' });
            const structure = {
                designStages: draft.filter(m => trackOf(m) === 'design').map((m, i) => stage(m, `D${i + 1}`)),
                executionStages: draft.filter(m => trackOf(m) === 'execution').map((m, i) => stage(m, `E${i + 1}`)),
                validation: { designSumMustEqual: 100, executionSumMustEqual: 100 },
            };
            await setPaymentStructure(orgData?.tenantId || 'demo-tenant-01', structure as any);
            setStudioPaymentStr(structure);
            showSuccessWithNext('Saved as the studio defaults');
        } catch (err: any) {
            alert(`Could not save the studio defaults: ${err?.message || err}`);
        }
    };


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
                                    marginsHidden ? (
                                        <MarginsHidden what="Margins" />
                                    ) : setBoq ? (
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
                    <MoneyBoard
                        totals={boardTotals}
                        milestoneCount={milestones.length}
                        status={terminated ? { label: 'Schedule frozen', tone: 'warn' } : boardStatus}
                        terminated={terminated}
                        tab={moneyTab}
                        onTab={setMoneyTab}
                        historyCount={(financials?.paymentRevisions || []).length + scheduleChangeLog.length}
                        onSchedule={scheduleAction.onClick}
                        scheduleLabel={scheduleAction.label}
                        onEdit={() => openEditor('both')}
                        onQuick={() => { if (previewing) { alert('Apply or discard the tax preview first.'); return; } setQuickOpen(true); }}
                        readOnly={lockedMode}
                        tiles={boardTiles}
                        preview={boardPreview}
                        versionPill={versionPill}
                        notices={boardNotices}
                        summary={boardSummary}
                        columns={boardColumns}
                        breakdown={breakdownToggle}
                    />

            {moneyTab === 'board' && taxToolsOpen && !lockedMode && (<>

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
                                                type="button"
                                                onClick={() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'analytics' }))}
                                                className="text-[#3D52A0] hover:text-[#334486] text-xs font-bold flex items-center gap-1"
                                            >
                                                Change in Money &amp; Offers ›
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {discounts.map(discount => (
                                                <div key={discount.id} className="flex justify-between items-center text-xs p-3 bg-red-50/60 rounded-xl border border-red-100">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-red-800 font-bold">{discount.name}</span>
                                                        <span className="text-[10px] text-red-600 bg-red-100/60 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">{discount.target}</span>
                                                    </div>
                                                    <span className="font-extrabold text-red-700 tabular-nums">
                                                        -{discount.type === 'percentage' ? `${discount.value}%` : formatCurrency(discount.value)}
                                                    </span>
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
                                    {!feeOnly && (
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
                                    )}

                                    <div>
                                        <h4 className="text-xs font-black text-[#8E96B8] uppercase tracking-wider mb-3">GST</h4>
                                        {!feeOnly && (
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
                                                <p className="text-[10px] text-[#8E96B8] font-bold uppercase tracking-wider">Estimated Cash value</p>
                                                <p className="text-sm font-extrabold text-amber-700 tabular-nums">{formatCurrency(executionCash)}</p>
                                            </div>
                                        </div>
                                        )}
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
                                                <p className="text-[10px] text-[#8E96B8] font-bold uppercase tracking-wider">GST on design</p>
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
                            {/* Execution Row: none on a fee-only project */}
                            {!feeOnly && (
                            <tr className="hover:bg-[#F6F7FB]/30">
                                <td className="p-4 font-bold text-[#252C4E]">Execution Scope</td>
                                <td className="p-4 text-right text-[#5A628A]">{formatCurrency(rawExecutionTotal)}</td>
                                <td className="p-4 text-right text-red-600">-{formatCurrency(executionDiscountVal)}</td>
                                <td className="p-4 text-right font-bold text-slate-800 bg-[#EDE8F5]/10">{formatCurrency(taxableExecution)}</td>
                                <td className="p-4 text-right text-[#5A628A]">{executionGstEnabled ? formatCurrency(gstOnExecution) : '₹0'}</td>
                                <td className="p-4 text-right font-extrabold text-[#252C4E]">{formatCurrency(taxableExecution + (executionGstEnabled ? gstOnExecution : 0))}</td>
                            </tr>
                            )}
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
            {/* Splits material and labour from the BOQ: nothing to split on a fee-only project. */}
            {!feeOnly && (
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
                            The Material vs Labor % splits are calculated dynamically from the active project's BOQ line items (Material Cost: <Masked>{formatCurrency(materialCostRaw)}</Masked>, Labor Cost: <Masked>{formatCurrency(laborCostRaw)}</Masked>). This theoretical split is shown in the dedicated Simulated Execution Schedule table below.
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
                                <span className="text-2xl font-black text-emerald-400 tabular-nums"><Masked>{formatCurrency(theoreticalProfit)}</Masked></span>
                                <div className="text-[10px] text-[#8E96B8] mt-1 font-medium leading-relaxed">
                                    (Accounts for {formatCurrency(estimatedMaterialInputGst)} dead input GST) <br/>
                                    Implied Margin: <Masked dots="••">{profitMargin.toFixed(1)}%</Masked>
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
                                            <th className="p-3 text-right bg-[#3D52A0]/1">Labor Base</th>
                                            <th className="p-3 text-right bg-[#3D52A0]/1">Labor GST/Rec</th>
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
                                                    <td className="p-3 text-right text-xs text-slate-800 bg-[#3D52A0]/1 tabular-nums">{formatCurrency(rowLaborBase)}</td>
                                                    <td className="p-3 text-right text-xs text-slate-800 bg-[#3D52A0]/1 tabular-nums">
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
                                            <td className="p-3 text-right text-xs font-bold text-[#334486] bg-[#3D52A0]/1 tabular-nums">{formatCurrency(simulatedTaxableLabor)}</td>
                                            <td className="p-3 text-right text-xs font-bold text-[#334486] bg-[#3D52A0]/1 tabular-nums">
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
            )}

            </>)}

            {moneyTab === 'history' && (<>

            {scheduleLog}

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
                                                {!lockedMode && (sched.advances || []).length > 0 && (
                                                    <Button size="sm" variant="quiet" icon={RotateCcw} className="ml-1" onClick={() => openRestore(milestonesFromIssued(sched.advances), `issued schedule ${sched.versionLabel || `v${sched.version}.0`}`)}>Restore</Button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}


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
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
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
                                                    className="px-3 py-1.5 bg-[#3D52A0]/5 text-[#334486] hover:bg-[#3D52A0]/10 rounded-lg text-xs font-bold transition-colors border border-[#3D52A0]/20"
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

            {editFocus && !lockedMode && (
                <EditMilestonesModal
                    milestones={milestones}
                    initialDraft={editDraft}
                    notice={restoreFrom ? (
                        <div className="space-y-1">
                            <p className="font-bold text-slate-800">Restoring the schedule from {restoreFrom.label}</p>
                            <p>Check it, change anything you like, then save. Nothing changes until you save, and History keeps this as a new change you can undo.</p>
                            {restoreFrom.notes.map(n => <p key={n} className="text-amber-800">{n}</p>)}
                        </div>
                    ) : undefined}
                    focus={editFocus}
                    feeOnly={feeOnly}
                    taxable={{ design: taxableDesign, execution: taxableExecution }}
                    price={priceDraft}
                    saved={schedule}
                    studio={studioStages}
                    onSaveAsDefaults={saveDraftAsStudioDefaults}
                    onClose={() => { setEditFocus(null); setEditDraft(null); setRestoreFrom(null); }}
                    onSave={saveScheduleDraft}
                />
            )}

            {quickOpen && !lockedMode && !editFocus && (
                <QuickScheduleModal
                    milestones={milestones}
                    feeOnly={feeOnly}
                    taxable={{ design: taxableDesign, execution: taxableExecution }}
                    price={priceDraft}
                    studio={studioStages}
                    onClose={() => setQuickOpen(false)}
                    onApprove={saveScheduleDraft}
                    onFineTune={draft => { setQuickOpen(false); setEditDraft(draft); setEditFocus('both'); }}
                />
            )}

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
                                                <span className="text-[#334486]">Execution: <span className="font-bold text-slate-800">{formatCurrency(contractExecution || originalNetExecution)}</span></span>
                                                <span className="text-[#334486]">Design: <span className="font-bold text-slate-800">{formatCurrency(contractDesign || originalNetDesign)}</span></span>
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <h4 className="font-semibold text-xs text-[#7091E6] uppercase tracking-wider mb-2">Milestone Breakdown</h4>
                                            <div className="space-y-2 max-h-[360px] overflow-y-auto">
                                                {milestones.map(m => {
                                                    const isCleared = m.status === 'paid' || m.status === 'invoiced';
                                                    const baseAmount = m.type === 'execution' ? (contractExecution || originalNetExecution) : (contractDesign || originalNetDesign);
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

            {/* ZOHO BOOKS: DRAFT THE INVOICE (only when the add-in is connected) */}
            {zohoRaise && projectId && (() => {
                const m = milestones.find(x => x.id === zohoRaise.milestoneId);
                const amt = m ? schedule.byId[m.id] : undefined;
                if (!m || !amt) return null;
                const rate = m.type === 'execution' ? (executionGstEnabled ? gstRate : 0) : (designGstEnabled ? gstRate : 0);
                return (
                    <ZohoRaiseInvoiceDialog
                        milestone={m}
                        amounts={{
                            taxable: amt.billable,
                            gst: amt.gst,
                            gstRatePct: rate,
                            retainer: amt.retainerDeducted,
                            discount: amt.discountApplied,
                            discountReason: amt.discountReason,
                            invoiceTotal: amt.invoiceTotal,
                        }}
                        projectId={projectId}
                        projectName={projectContext.name || 'Project'}
                        client={{ name: projectContext.clientName, email: projectContext.clientEmail, phone: projectContext.clientPhone }}
                        billing={projectContext.clientBilling}
                        onClose={() => setZohoRaise(null)}
                        onRaised={(result: ZohoRaiseResult, billing: ClientBilling) => {
                            // By id and against the latest state: the request took a moment, and the schedule may have moved.
                            setProjectContext(prev => ({
                                ...prev,
                                clientBilling: { ...(prev.clientBilling || {}), ...billing },
                                paymentMilestones: (prev.paymentMilestones || []).map(x => x.id === zohoRaise.milestoneId ? {
                                    ...x,
                                    status: 'invoiced',
                                    invoiceNumber: result.invoiceNumber,
                                    // A linked invoice keeps the date it has in Zoho; a new draft is dated today.
                                    invoiceDate: result.invoiceDate || new Date().toISOString(),
                                    lockedTaxableBase: zohoRaise.lockedTaxableBase,
                                    ...lockedTermsFor(x),
                                    zohoInvoiceId: result.invoiceId,
                                } : x),
                            }));
                        }}
                    />
                );
            })()}

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

            {!isReadOnlyMode && (
                <div className="mt-6 empty:hidden">
                    <DisputePanel context={projectContext} schedule={schedule} canAct={canTerminate && !terminated} actor={terminationActor}
                        setProjectContext={setProjectContext as any} />
                </div>
            )}
            {!terminated && !isReadOnlyMode && (
                <div className="mt-6">
                    <TerminationPanel context={projectContext} schedule={schedule} canAct={canTerminate} onTerminate={onTerminate} />
                </div>
            )}

        </div>
    );
};

export default PaymentCalculatorTab;
