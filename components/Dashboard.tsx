import { calculateProjectFinancials } from '../lib/financialsUtils';

import React, { useState, useEffect } from 'react';
import { ProjectContext, ProposalTier, FullBoqItem, ActiveProject, Item, ProjectStatus } from '../types';
import { formatCurrency, formatINR } from '../lib/utils';
import { db } from '../services/firebaseClient';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { AlertCircleIcon, CheckCircleIcon, DashboardIcon, TrendingUpIcon, TrophyIcon, ClockIcon } from './Icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, FileText, MessageCircle, CheckSquare, Edit, Wand2, ArrowRight, Menu, X, Plus, Lock, Settings2, TrendingDown } from 'lucide-react';
import { useOrg } from '../contexts/OrgContext';
import { usePaymentHealthScore } from '../hooks/usePaymentHealthScore';
import { PaymentHealthWidget } from './PaymentHealth';
import { SiteVisitLogModal } from './SiteVisitLogModal';
import { SiteActivityWidget } from './SiteActivityWidget';
import { ExecutionBundleWidget } from './ExecutionBundleWidget';
import { useCommunicationLog } from '../hooks/useCommunicationLog';
import { useProjectJourney } from '../hooks/useProjectJourney';
import { useMomActions } from '../hooks/useMomActions';
import { PHASES } from '../constants/journeyConstants';
import { generateProjectFeed, calculateActionProtocol } from './DashboardHelpers';

function CommunicationTrackerWidget({ projectId, studioId, onClick }: { projectId: string; studioId: string, onClick: () => void }) {
    const { mergedItems, healthScore, sentCount, pendingCount } = useCommunicationLog(projectId, studioId);
    
    const pendingItems = mergedItems.filter(i => i.template.isRequired && i.log.status === 'pending').slice(0, 2);

    return (
        <div onClick={onClick} className="col-span-1 bg-white rounded-[2.5rem] p-8 md:p-10 border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col cursor-pointer hover:shadow-lg transition-all min-h-[450px] h-full relative">
            <h2 className="text-2xl font-light tracking-tighter text-indigo-950 mb-2">Comms Health</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Client Communication</p>
            
            <div className="flex items-center gap-6 mb-8">
                <div className={`text-6xl font-light tracking-tighter ${healthScore === 100 ? 'text-emerald-500' : healthScore > 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                    {healthScore}%
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-indigo-900">{sentCount} of {sentCount + pendingCount}</span>
                    <span className="text-xs text-slate-500">Required Emails Sent</span>
                </div>
            </div>

            <div className="space-y-3 flex-grow">
                {pendingItems.length > 0 ? (
                    <div className="space-y-3">
                        {/* Amber Callout Path Forward */}
                        <div className="bg-amber-50/70 border border-amber-200 text-amber-900 p-3.5 rounded-2xl text-xs space-y-1">
                            <p className="font-bold">⚠️ Required Emails Pending</p>
                            <p className="text-amber-700 font-medium">To maintain project velocity, review, copy & send these stage emails to your client.</p>
                        </div>
                        
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Next Actions:</h3>
                        {pendingItems.map((item, idx) => (
                            <div key={idx} className="flex flex-col px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                                <span className="text-sm font-semibold text-indigo-900 line-clamp-1">{item.template.title}</span>
                                <span className="text-xs text-slate-500 capitalize">{item.template.phase}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center p-6 bg-emerald-50 rounded-2xl border border-emerald-100 h-full">
                        <CheckCircleIcon className="w-8 h-8 text-emerald-500 mb-2" />
                        <span className="text-sm font-bold text-emerald-800">All current comms sent</span>
                    </div>
                )}
            </div>

            <div className="mt-4 text-right">
                <span className="text-sm font-semibold text-indigo-600 flex items-center gap-1 justify-end">View Tracker <ArrowRight className="w-4 h-4"/></span>
            </div>
        </div>
    );
}
import SiteVisitHistory from '../pages/SiteVisitHistory'; // We'll create this later or adjust imports
import { SiteVisitType } from '../types';

interface DashboardProps {
    activeTier?: ProposalTier;
    fullBoq: FullBoqItem[];
    projectContext: ProjectContext;
    setActiveTab: (tab: string) => void;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    activeProject: ActiveProject | null;
    setActiveProject: (project: ActiveProject | null) => void;
    tiers: ProposalTier[];
    bank: Item[];
    projectId: string | null;
}

const STATUS_OPTIONS: { id: ProjectStatus, label: string }[] = [
    { id: 'lead', label: 'New Lead' },
    { id: 'draft', label: 'Drafting' },
    { id: 'proposal_sent', label: 'Proposal Sent' },
    { id: 'negotiation', label: 'Negotiation' },
    { id: 'won', label: 'Won / Execution' },
    { id: 'execution', label: 'In Execution' },
    { id: 'work_paused', label: 'Work Paused 🔴' },
    { id: 'completed', label: 'Completed' },
    { id: 'lost', label: 'Lost' },
];

const QUICK_ACTIONS_BY_STAGE: Record<string, { label: string, icon: any, route: string, highlight?: boolean, action?: string }[]> = {
  'proposal': [
    { label: 'Send proposal', icon: <Send className="w-5 h-5" />, route: 'ops', highlight: true },
    { label: 'View proposal PDF', icon: <FileText className="w-5 h-5" />, route: 'client' }
  ],
  'agreement': [
    { label: 'Generate contract', icon: <FileText className="w-5 h-5" />, route: 'contract' },
    { label: 'Design Complete Gate', icon: <Lock className="w-5 h-5" />, route: 'design-gate', highlight: true },
    { label: 'Send via WhatsApp', icon: <MessageCircle className="w-5 h-5" />, route: 'ops' } 
  ],
  'execution': [
    { label: 'Update client feed', icon: <MessageCircle className="w-5 h-5" />, route: 'update-client-feed', highlight: true },
    { label: 'Log a decision', icon: <CheckSquare className="w-5 h-5" />, route: 'record-decision' }
  ],
  'build-scope': [
    { label: 'Edit scope', icon: <Edit className="w-5 h-5" />, route: 'boq-editor', highlight: true }
  ]
};

// --- Exciting Feature Components ---

const LiveMarquee = ({ items, onNavigate, dark }: { items: any[], onNavigate: (route: string) => void, dark?: boolean }) => {
    if (items.length === 0) {
        return (
            <div className="bg-[#111] text-white py-3 px-4 rounded-2xl mb-8 flex items-center shadow-lg">
                <div className="flex items-center gap-2 pr-4 border-r border-white/20 mr-4 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">LIVE FEED</span>
                </div>
                <div className="text-xs text-slate-400 font-medium italic">
                    No activity yet for this project — activity will appear here as the project progresses
                </div>
            </div>
        );
    }

    return (
        <div className="overflow-hidden whitespace-nowrap bg-[#111] text-white py-3 px-4 rounded-2xl mb-8 flex items-center shadow-lg">
            <div className="flex items-center gap-2 pr-4 border-r border-white/20 mr-4 shrink-0 bg-[#111] z-10">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">LIVE FEED</span>
            </div>
            <motion.div 
                className="flex gap-12 text-xs font-medium tracking-wide will-change-transform"
                animate={{ x: [0, -1500] }}
                transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
                style={{ width: "max-content" }}
            >
                {items.map((item, idx) => (
                    <span key={`a-${idx}`} className="cursor-pointer hover:text-emerald-400 transition-colors" onClick={() => onNavigate(item.route)}>
                        {item.emoji} {item.text}
                    </span>
                ))}
                {items.map((item, idx) => (
                    <span key={`b-${idx}`} className="cursor-pointer hover:text-emerald-400 transition-colors" onClick={() => onNavigate(item.route)}>
                        {item.emoji} {item.text}
                    </span>
                ))}
            </motion.div>
        </div>
    );
};

const AnimatedRing = ({ progress, colorClass, size = 120, strokeWidth = 8 }: { progress: number, colorClass: string, size?: number, strokeWidth?: number }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (progress / 100) * circumference;

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg className="transform -rotate-90 w-full h-full">
                <circle
                    className="text-slate-100"
                    strokeWidth={strokeWidth}
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
                <motion.circle
                    className={colorClass}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
                <span className="text-3xl font-light tracking-tighter text-indigo-900">{progress}<span className="text-sm">%</span></span>
            </div>
        </div>
    );
};

const CountdownTimer = ({ hours }: { hours: number }) => {
    return (
        <div className="flex gap-1.5 text-center">
            <div className="bg-red-50 text-red-600 rounded-xl p-2 min-w-[3rem] border border-red-100">
                <span className="text-xl font-light tracking-tight">{hours}</span>
                <span className="text-[8px] block font-bold uppercase tracking-widest mt-0.5">HRS</span>
            </div>
            <div className="bg-red-50 text-red-600 rounded-xl p-2 min-w-[3rem] border border-red-100">
                <span className="text-xl font-light tracking-tight animate-pulse">00</span>
                <span className="text-[8px] block font-bold uppercase tracking-widest mt-0.5">MIN</span>
            </div>
        </div>
    );
};

function ActionTrackerWidget({ openActions, overdueActions, onClick }: { openActions: number, overdueActions: number, onClick: () => void }) {
    return (
        <div onClick={onClick} className="col-span-1 bg-white rounded-[2.5rem] p-8 md:p-10 border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all min-h-[450px] h-full relative">
            <div className="absolute top-0 right-0 p-8">
                {overdueActions > 0 && (
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                )}
            </div>
            <div>
                <h2 className="text-2xl font-light tracking-tighter text-indigo-950 mb-2">Mom Actions</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Execution Protocol</p>
                
                <div className="flex items-end gap-4 mb-4">
                    <div className={`text-6xl font-light tracking-tighter ${openActions > 0 ? (overdueActions > 0 ? 'text-red-500' : 'text-amber-500') : 'text-emerald-500'}`}>
                        {openActions}
                    </div>
                </div>
                <div className="space-y-4">
                    {openActions === 0 ? (
                        <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm bg-emerald-50 border border-emerald-100 p-3 rounded-2xl">
                            <span>✓ No open actions — all clear</span>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${openActions > 0 ? 'bg-amber-500' : 'bg-slate-300'}`}></div>
                                <span className="text-sm font-medium text-slate-700">{openActions} Open Actions</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${overdueActions > 0 ? 'bg-red-500' : 'bg-slate-300'}`}></div>
                                <span className={`text-sm font-medium ${overdueActions > 0 ? 'text-red-600' : 'text-slate-700'}`}>{overdueActions} Overdue</span>
                            </div>
                        </>
                    )}
                </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-slate-100 flex items-end justify-end">
                <span className="text-sm font-semibold text-indigo-600 flex items-center gap-1">Action Tracker <ArrowRight className="w-4 h-4"/></span>
            </div>
        </div>
    );
}

const Dashboard: React.FC<DashboardProps> = ({ activeTier, fullBoq, projectContext, setActiveTab, setProjectContext, activeProject, setActiveProject, tiers, bank, projectId }) => {
    const { orgData } = useOrg();
    const [selections, setSelections] = useState<any[]>([]);
    
    // Widget Configuration State
    const WIDGET_OPTIONS = [
        { id: 'what-to-do', label: 'What To Do Today' },
        { id: 'project-journey', label: 'Project Journey' },
        { id: 'quick-actions', label: 'Quick Actions' },
        { id: 'financials', label: 'Financials & Scope' },
        { id: 'ops-intelligence', label: 'Ops Intelligence' },
        { id: 'execution-bundles', label: 'Execution Workspace' },
        { id: 'site-activity', label: 'Site Activity' },
        { id: 'comms-tracker', label: 'Comms Tracker' }
    ];
    
    const [activeWidgets, setActiveWidgets] = useState<string[]>(() => {
        const saved = localStorage.getItem('ffds_dashboard_widgets');
        return saved ? JSON.parse(saved) : ['what-to-do', 'project-journey', 'quick-actions', 'ops-intelligence', 'execution-bundles'];
    });
    const [isWidgetModalOpen, setIsWidgetModalOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem('ffds_dashboard_widgets', JSON.stringify(activeWidgets));
    }, [activeWidgets]);

    
    // Journey integration
    const journey = useProjectJourney(projectId!, projectContext);
    const { openActions, overdueActions } = useMomActions(projectId, orgData?.tenantId || 'demo-tenant-01');
    
    const activePhaseIndex = journey.activeSteps.length > 0 ? journey.activeSteps[0].phase : (journey.overall.done === journey.overall.total ? PHASES.length - 1 : 0);
    const activePhase = {
        index: activePhaseIndex,
        phase: PHASES[activePhaseIndex],
        progress: journey.phaseProgress[activePhaseIndex] || { pct: 0 }
    };


    // Add payment health score fetching
    const health = usePaymentHealthScore(projectId, orgData?.tenantId || 'demo-tenant-01', projectContext.paymentMilestones);
    const { mergedItems, healthScore: commsHealthScore, sentCount: commsSentCount, pendingCount: commsPendingCount } = useCommunicationLog(projectId || '', orgData?.tenantId || 'demo-tenant-01');

    const advanceLifecycle = async (newStage: any, legacyStatus: any) => {
        const now = new Date().toISOString();
        const updatedLifecycle = {
            ...projectContext.lifecycle,
            stage: newStage,
            updatedAt: now,
        };
        setProjectContext((prev: any) => ({
            ...prev,
            status: legacyStatus,
            lifecycle: updatedLifecycle
        }));
        if (projectId && db) {
            await updateDoc(doc(db, 'projects', projectId), {
                status: legacyStatus,
                lifecycle: updatedLifecycle
            }).catch(e => console.error(e));
        }
    };

    useEffect(() => {
        if (!activeProject?.id) return;
        const q = collection(db, 'projects', activeProject.id, 'selections');
        const unsub = onSnapshot(q, snap => {
            setSelections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [activeProject?.id]);

    const calculateSOFSummary = (selections: any[]) => {
        if (!selections || selections.length === 0) return { frozen: 0, pending: 0, total: 0, pct: 0, pendingSignoff: 0, delayed: 0, absorbedCost: 0 }
        
        const frozen = (selections || []).filter(s => s.status === 'locked' || s.status === 'approved' || s.status === 'ordered').length;
        const pending = (selections || []).filter(s => s.status === 'pending' || s.status === 'in_review').length;
        const pendingSignoff = (selections || []).filter(s => s.clientSignoffStatus === 'pending').length;
        const delayed = (selections || []).filter(s => s.status === 'delayed').length;
        const absorbedCost = selections.filter(s => s.boqAbsorbed).reduce((sum, s) => sum + (s.costDelta || 0), 0);
        
        const total = selections.length;
        const pct = total > 0 ? Math.round((frozen / total) * 100) : 0;
        
        return { frozen, pending, total, pct, pendingSignoff, delayed, absorbedCost }
    }

    // Force sync with project context to ensure updates from MaterialTab are immediately visible
    // We prefer context over firestore here to ensure local UI reactivity for the demo
    const allSelections = projectContext.materialSelections?.length ? projectContext.materialSelections : selections;
    const sofSummary = calculateSOFSummary(allSelections);

    // Basic Calculations
    const totalRevenue = activeTier?.summary.totalRevenue || activeTier?.summary.totalSell || 0;
    const totalGm = activeTier?.summary.blendedGm || activeTier?.summary.totalGm || 0;
    const itemCount = fullBoq.length;
    const area = projectContext.area || 1;
    const costPerSqFt = totalRevenue / area;

    // Execution Intelligence
    const isExecution = !!activeProject || ['won', 'execution'].includes(projectContext.status || '');
    
    // Blast Radius State
    const [showSetupSequence, setShowSetupSequence] = useState(false);
    const [tradeSequenceDraft, setTradeSequenceDraft] = useState<string[]>([
        'civil works', 'electrical rough-in', 'plumbing', 'false ceiling', 
        'flooring', 'wall tiles', 'painting', 'carpentry', 'mep finishing', 'handover'
    ]);
    const [showMarkDelayed, setShowMarkDelayed] = useState(false);
    const [delayTradeSelect, setDelayTradeSelect] = useState('');
    const [delayDaysInput, setDelayDaysInput] = useState('');

    const [siteVisitModalOpen, setSiteVisitModalOpen] = useState(false);
    const [siteVisitType, setSiteVisitType] = useState<SiteVisitType>('site_visit');
    const [showSiteVisitHistory, setShowSiteVisitHistory] = useState(false);

    const tradeSequence = projectContext.tradeSequence || [];
    const delayedTrades = projectContext.delayedTrades || [];

    const handleSaveSequence = async () => {
        try {
            if (activeProject?.id && db) {
                await updateDoc(doc(db, 'projects', activeProject.id), {
                    tradeSequence: tradeSequenceDraft
                }).catch(e => console.warn("Firestore update skipped or failed", e));
            }
            if (setProjectContext) {
                setProjectContext(prev => ({ ...prev, tradeSequence: tradeSequenceDraft }));
            }
            setShowSetupSequence(false);
        } catch (e) {
            console.error("Failed to save sequence", e);
        }
    };

    const handleMarkDelayed = async () => {
        if (!delayTradeSelect || !delayDaysInput) return;
        const days = parseInt(delayDaysInput, 10);
        if (isNaN(days) || days <= 0) return;
        
        try {
            const currentDelayed = [...delayedTrades];
            const delayObj = { trade: delayTradeSelect, delayDays: days, markedAt: Date.now() };
            // Replace if already exists or add
            const existingIdx = currentDelayed.findIndex(d => d.trade === delayTradeSelect);
            if (existingIdx > -1) {
                currentDelayed[existingIdx] = delayObj;
            } else {
                currentDelayed.push(delayObj);
            }

            if (activeProject?.id && db) {
                await updateDoc(doc(db, 'projects', activeProject.id), {
                    delayedTrades: currentDelayed
                }).catch(e => console.warn("Firestore update skipped or failed", e));
            }
            if (setProjectContext) {
                setProjectContext(prev => ({ ...prev, delayedTrades: currentDelayed }));
            }
            setShowMarkDelayed(false);
            setDelayTradeSelect('');
            setDelayDaysInput('');
        } catch (e) {
            console.error("Failed to mark delayed", e);
        }
    };

    const handleResolveDelay = async (trade: string) => {
        try {
            const updated = delayedTrades.filter(d => d.trade !== trade);
            if (activeProject?.id && db) {
                await updateDoc(doc(db, 'projects', activeProject.id), {
                    delayedTrades: updated
                }).catch(e => console.warn("Firestore update skipped or failed", e));
            }
            if (setProjectContext) {
                setProjectContext(prev => ({ ...prev, delayedTrades: updated }));
            }
        } catch (e) {
            console.error("Failed to resolve delay", e);
        }
    };

    
    // Contract Value Logic
    let approvedContractValue: number | null = null;
    if (projectContext.approvedExecutionValue != null) {
        approvedContractValue = projectContext.approvedExecutionValue;
    } else if ((projectContext as any).approvedTierTotal != null) {
        approvedContractValue = (projectContext as any).approvedTierTotal;
    } else if ((projectContext as any).approvedTierValue != null) {
        approvedContractValue = (projectContext as any).approvedTierValue;
    }
    
    let designFee = activeTier?.summary.designFee || 0;

    const approvedTier = tiers.find(t => t.id === projectContext.approvedTierId || t.status === 'approved' || (t as any).approved === true);
    if (approvedTier) {
        if (approvedContractValue == null) {
            approvedContractValue = approvedTier.summary.totalRevenue || approvedTier.summary.totalSell || 0;
        }
        if (approvedTier.summary.designFee != null) {
            designFee = approvedTier.summary.designFee;
        }
    }

    if (projectContext.approvedDesignValue != null) {
        designFee = projectContext.approvedDesignValue;
    }

    const isContractApproved = approvedContractValue != null;
    const displayContractValue = isContractApproved ? approvedContractValue : totalRevenue;

    const pendingDecisions = activeProject?.executionData?.decisions?.filter(d => d.status === 'pending') || [];
    const activeBlockers = activeProject?.executionData?.blockers?.filter(b => b.status === 'active') || [];
    
    // Logic to determine current stage
    const hasTiers = tiers && tiers.length > 0;
    const hasScope = hasTiers && (tiers[0].boq?.length > 0 || false);
    const hasOptions = tiers && tiers.length > 1; 
    const isApproved = !!projectContext.approvedTierId;

    let currentStageKey = 'setup';
    if (isExecution) currentStageKey = 'execution';
    else if (isApproved) currentStageKey = 'agreement';
    else if (hasOptions) currentStageKey = 'proposal';
    else if (hasScope) currentStageKey = 'refine';
    else if (hasTiers) currentStageKey = 'build-scope';

    const sofItems = activeProject?.executionData?.sofItems || [];
    const frozenSof = (sofItems || []).filter(s => s.status === 'frozen').length;
    const sofProgress = sofItems.length > 0 ? Math.round((frozenSof / sofItems.length) * 100) : 0;

    // -- Widget visibility state --
    const [visibleWidgets, setVisibleWidgets] = useState<string[]>(['velocity', 'margin', 'cashFlow']);
    const [showWidgetMenu, setShowWidgetMenu] = useState(false);

    // -- Dynamic Widget Calculations --
    
    // 1. Velocity Real Time Calculation
    const isActuallyExecuting = projectContext.lifecycle?.stage === 'execution' || projectContext.lifecycle?.stage === 'handover';
    const velocityPct = isActuallyExecuting ? (journey.overall.pct || 0) : 0;
    let expectedPct = 0;
    if (isActuallyExecuting && activeProject?.startDate) {
        const elapsedDays = Math.max(0, Math.floor((Date.now() - new Date(activeProject.startDate).getTime()) / 86400000));
        const assumedTotalDays = projectContext.area ? Math.max(45, Math.floor(projectContext.area / 10)) : 90;
        expectedPct = Math.min(100, Math.round((elapsedDays / assumedTotalDays) * 100));
    }
    const velocityDiff = velocityPct - expectedPct;
    const isAhead = velocityDiff >= 0;
    const velocityDays = Math.abs(Math.round(velocityDiff / 2)); // rough translation of % to days for realistic display

    // 2. Margin Leakage Real Time
    const currentExecutionCost = fullBoq.reduce((acc, item) => acc + (item.rate * item.qty), 0);
    const approvedExecutionCost = activeTier?.summary.totalCost || 0;

    // 3. Cash Flow Risk Real Time
    const { currentProjectValue, totalPaid, designPaid, executionPaid, totalInvoicedBaseAmt, overdueAmt } = calculateProjectFinancials(projectContext, activeTier);
    
    // Override local values
    const displayContractValueFinal = currentProjectValue || displayContractValue;
    const collectedAmt = totalPaid;
    const designCollectedAmt = designPaid;
    const executionCollectedAmt = executionPaid;
    const actualPercentDisplay = displayContractValueFinal > 0 ? Math.min(100, Math.round((collectedAmt / displayContractValueFinal) * 100)) : 0;
    const expectedPercent = Math.min(100, Math.max(0, health.expectedReceived));
    const cashFlowRisk = (expectedPercent > actualPercentDisplay) || health.overdueCount > 0;

    // Pre-execution Intelligence
    const pricedItems = (fullBoq || []).filter(item => item.rate > 0).length;
    const pricingConfidence = itemCount > 0 ? Math.round((pricedItems / itemCount) * 100) : 0;

    const feedItems = generateProjectFeed(projectContext, activeProject);
    const protocolItems = calculateActionProtocol(projectContext, activeProject, journey);
    const criticalCount = (protocolItems || []).filter(i => i.severity === 'critical').length;

    // Dynamically derive the "What to do today" actions
    const todayItems: any[] = [];
    if (health.overdueCount > 0) {
        todayItems.push({
            title: 'Overdue Payment Alert',
            description: `₹${health.overdueAmount.toLocaleString('en-IN')} is overdue. Send reminder message.`,
            btnText: 'Send Reminder',
            route: 'comms-tracker',
            badge: 'High Priority',
            badgeColor: 'bg-rose-50 text-rose-700 border-rose-100'
        });
    }

    const currentStage = projectContext.status === 'completed' ? 'completed' : (projectContext.lifecycle?.stage || 'pre_sales');
    if (currentStage === 'design') {
        todayItems.push({
            title: 'Design Freeze Input',
            description: 'Secure approvals on the layout & specifications to freeze the Design Gate.',
            btnText: 'Freeze Design Gate',
            route: 'project-journey',
            badge: 'Milestone Gate',
            badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-100'
        });
    } else if (currentStage === 'execution') {
        const progressPct = activePhase.progress.pct || 0;
        if (progressPct >= 90) {
            todayItems.push({
                title: 'Review Handover Readiness',
                description: 'Execution is nearly finished. Review pre-handover walkthrough & snags.',
                btnText: 'Begin Handover 🔑',
                route: 'project-journey',
                badge: 'Stage Transition',
                badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-100'
            });
        } else {
            todayItems.push({
                title: 'Weekly Site Audit',
                description: 'Execution underway — schedule pre-handover walkthrough when site is substantially complete.',
                btnText: 'Log Site Visit',
                route: 'site-ops',
                badge: 'Operational Pulse',
                badgeColor: 'bg-amber-50 text-amber-700 border-amber-100'
            });
        }
    } else if (currentStage === 'handover') {
        todayItems.push({
            title: 'Clear Snag Decisions',
            description: 'Complete unresolved snag points to clear the handover and collect final payout.',
            btnText: 'View Snag Details',
            route: 'site-ops',
            badge: 'Closing Gate',
            badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-100'
        });
    }

    if (overdueActions && overdueActions.length > 0) {
        todayItems.push({
            title: 'MoM Directive Overdue',
            description: `"${overdueActions[0].title}" requires immediate attention on site.`,
            btnText: 'Update Task',
            route: 'site-ops',
            badge: 'Minutes of Meeting',
            badgeColor: 'bg-pink-50 text-pink-700 border-pink-100'
        });
    }

    const pendingEmailsList = (mergedItems || []).filter(i => i.template.isRequired && i.log.status === 'pending');
    if (pendingEmailsList.length > 0) {
        todayItems.push({
            title: 'Prepare Client Email',
            description: `Required '${pendingEmailsList[0]?.template.title || 'Client Update'}' email is pending stage transition.`,
            btnText: 'Review Email',
            route: 'comms-tracker',
            badge: 'Required Comms',
            badgeColor: 'bg-amber-50 text-amber-700 border-amber-100'
        });
    }

    const finalTodayItems = todayItems.slice(0, 3);

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
    };

    return (
        <motion.div 
            className="space-y-8 max-w-7xl mx-auto bg-[#F9F9F8] min-h-screen p-4 md:p-8 rounded-[2.5rem]"
            variants={containerVariants}
            initial="hidden"
            animate="show"
        >
            {/* LIVE MARQUEE AT TOP */}
            <div className="mt-4 mx-0 md:mx-4 relative overflow-hidden">
                <LiveMarquee items={feedItems} onNavigate={setActiveTab} dark={true} />
            </div>

            {/* PROJECT LIFECYCLE & CTA */}
            <div className="bg-white rounded-2xl md:rounded-[2rem] p-6 border border-slate-200/60 shadow-sm flex flex-col gap-6 mx-0 md:mx-4 mb-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-light tracking-tight text-indigo-950">
                            {projectContext.name || 'Untitled Project'}
                        </h1>
                        <p className="text-sm font-medium text-slate-500 mt-1">
                            Client: <span className="text-indigo-900">{projectContext.clientName || 'Not Set'}</span> &nbsp;|&nbsp;
                            <span className="capitalize ml-1">{projectContext.status?.replace('_', ' ') || 'New Lead'}</span>
                        </p>
                    </div>
                    {/* PRIMARY CTA FOR CURRENT LIFECYCLE STAGE */}
                    <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                        <button 
                            onClick={() => setIsWidgetModalOpen(true)}
                            className="px-3 py-2 border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 text-xs font-bold rounded-full shadow-sm transition-colors flex items-center gap-1.5"
                        >
                            <Settings2 className="w-3.5 h-3.5" /> Customize
                        </button>
                        <button 
                            onClick={() => setActiveTab('update-client-feed')}
                            className="px-4 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold rounded-full shadow-sm transition-colors flex items-center gap-1.5"
                        >
                            ↗ Share update
                        </button>
                        {projectContext.status === 'work_paused' && (
                            <button
                                onClick={async () => {
                                    setProjectContext((prev: any) => ({...prev, status: 'execution'}));
                                    if (projectId && db) {
                                        await updateDoc(doc(db, 'projects', projectId), { status: 'execution' }).catch(() => {});
                                    }
                                }}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-full shadow-sm transition-colors"
                            >
                                Resume Project
                            </button>
                        )}
                        {currentStage === 'pre_sales' && (
                            <button
                                onClick={() => advanceLifecycle('design', 'won')}
                                className="px-5 py-2.5 bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5"
                            >
                                Start Design Phase
                            </button>
                        )}
                        {currentStage === 'design' && (
                            <button
                                onClick={() => advanceLifecycle('execution', 'execution')}
                                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5"
                            >
                                Start Execution Phase 🚀
                            </button>
                        )}
                        {currentStage === 'execution' && (
                            <button
                                onClick={() => advanceLifecycle('handover', 'execution')}
                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5"
                            >
                                Begin Handover 🔑
                            </button>
                        )}
                        {currentStage === 'handover' && (
                            <button
                                onClick={() => advanceLifecycle('completed', 'completed')}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5"
                            >
                                Complete Project 🔐
                            </button>
                        )}
                        {currentStage === 'completed' && (
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-full text-xs font-bold text-emerald-700">
                                    ✓ Completed
                                </div>
                                <button
                                    onClick={() => advanceLifecycle('execution', 'execution')}
                                    className="px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5"
                                >
                                    Reopen Project 🔓
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* PHASE STEPPER */}
                <div className="w-full pt-6 border-t border-slate-100 relative mt-2">
                    <div className="absolute top-[48px] left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0">
                        <div className="h-full bg-emerald-600 transition-all duration-700 ease-in-out" 
                            style={{ width: currentStage === 'completed' ? '100%' : currentStage === 'handover' ? '100%' : currentStage === 'execution' ? '66%' : currentStage === 'design' ? '33%' : '0%' }}></div>
                    </div>
                    <div className="flex items-center justify-between relative z-10 px-4 md:px-12">
                        {[
                            { id: 'pre_sales', label: 'PRE-SALES', i: 1 },
                            { id: 'design', label: 'DESIGN', i: 2 },
                            { id: 'execution', label: 'EXECUTION', i: 3 },
                            { id: 'handover', label: 'HANDOVER', i: 4 }
                        ].map((phase, idx) => {
                            const isPast = ['completed', 'handover', 'execution', 'design'].includes(currentStage) && (
                                phase.id === 'pre_sales' || 
                                (phase.id === 'design' && ['completed', 'handover', 'execution'].includes(currentStage)) || 
                                (phase.id === 'execution' && ['completed', 'handover'].includes(currentStage)) ||
                                (phase.id === 'handover' && currentStage === 'completed')
                            );
                            const isActive = currentStage === phase.id;
                            
                            return (
                                <div key={phase.id} className="flex flex-col items-center gap-3 bg-white px-2">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors ${
                                        isActive ? 'bg-indigo-600 text-white shadow-md scale-110 ring-4 ring-indigo-50' : 
                                        isPast ? 'bg-emerald-600 text-white' : 
                                        'bg-white text-slate-400 border border-slate-200'
                                    }`}>
                                        {isPast ? '✓' : phase.i}
                                    </div>
                                    <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-indigo-600' : isPast ? 'text-indigo-900' : 'text-slate-400'}`}>
                                        {phase.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Main Masonry Grid */}
            <div className="columns-1 lg:columns-2 xl:columns-3 gap-6 items-start mx-0 md:mx-4 space-y-6">
                
                {activeWidgets.includes('quick-actions') && (
                    <div className="break-inside-avoid">
                        <motion.div variants={itemVariants} className="bg-indigo-950/90 backdrop-blur-xl border border-indigo-800/50 rounded-3xl shadow-2xl shadow-indigo-950/20 p-6 md:p-8 shadow-sm">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                                <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Quick Actions</h2>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => setActiveTab('update-client-feed')}
                                    className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-600 hover:bg-indigo-500 text-white transition-all text-center group flex flex-col justify-center items-center gap-3 shadow-sm min-h-[110px]"
                                >
                                    <div className="text-xl">💬</div>
                                    <h3 className="font-semibold text-xs leading-tight">Update client feed</h3>
                                </button>
                                <button 
                                    onClick={() => setActiveTab('record-decision')}
                                    className="p-4 rounded-2xl border border-slate-700 bg-indigo-900 hover:bg-indigo-800 text-slate-200 transition-all text-center group flex flex-col justify-center items-center gap-3 shadow-sm min-h-[110px]"
                                >
                                    <div className="text-xl">✅</div>
                                    <h3 className="font-semibold text-xs leading-tight">Log decision</h3>
                                </button>
                                <button 
                                    onClick={() => { setSiteVisitType('site_visit'); setSiteVisitModalOpen(true); }}
                                    className="p-4 rounded-2xl border border-slate-700 bg-indigo-900 hover:bg-indigo-800 text-slate-200 transition-all text-center group flex flex-col justify-center items-center gap-3 shadow-sm min-h-[110px]"
                                >
                                    <div className="text-xl">🏗️</div>
                                    <h3 className="font-semibold text-xs leading-tight">Log site visit</h3>
                                </button>
                                <button 
                                    onClick={() => { setSiteVisitType('client_meeting'); setSiteVisitModalOpen(true); }}
                                    className="p-4 rounded-2xl border border-slate-700 bg-indigo-900 hover:bg-indigo-800 text-slate-200 transition-all text-center group flex flex-col justify-center items-center gap-3 shadow-sm min-h-[110px]"
                                >
                                    <div className="text-xl">📝</div>
                                    <h3 className="font-semibold text-xs leading-tight">Log meeting</h3>
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {activeWidgets.includes('financials') && (
                    <div className="break-inside-avoid">
                        <motion.div variants={itemVariants} className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/60 shadow-sm">
                            <div className="flex items-center gap-2 mb-6">
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Financials & Scope</h3>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">CONTRACT VALUE</p>
                                    <p className="text-xl md:text-2xl font-bold tracking-tight text-indigo-950 mb-1">{formatINR(displayContractValueFinal)}</p>
                                    {isExecution && (
                                        <span className="text-[9px] font-semibold text-emerald-600 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Contracted
                                        </span>
                                    )}
                                </div>
                                <div className="px-4 border-l border-emerald-100 bg-emerald-50/30 rounded-r-xl">
                                    <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-1">COLLECTED</p>
                                    <p className="text-xl md:text-2xl font-bold tracking-tight text-emerald-600 mb-1">{formatINR(collectedAmt)}</p>
                                    <p className="text-[9px] text-slate-500 leading-tight">
                                        Design {formatINR(designCollectedAmt)} <br/> Exec {formatINR(executionCollectedAmt)}
                                    </p>
                                </div>
                                <div className="px-4 border-l border-slate-100">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">DUE NOW</p>
                                    <p className="text-xl md:text-2xl font-bold tracking-tight text-emerald-600 mb-1">{formatINR(overdueAmt)}</p>
                                    <p className="text-[9px] text-slate-500 leading-tight">No outstanding invoices</p>
                                </div>
                                <div className="px-4 border-l border-slate-100">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">UNBILLED</p>
                                    <p className="text-xl md:text-2xl font-bold tracking-tight text-indigo-950 mb-1">{formatINR(Math.max(0, displayContractValueFinal - collectedAmt - totalInvoicedBaseAmt))}</p>
                                    <p className="text-[9px] text-slate-500 leading-tight">Remaining to invoice</p>
                                </div>
                            </div>

                            {/* Progress Bar Container */}
                            <div className="mt-8">
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-emerald-500" style={{ width: `${actualPercentDisplay}%` }}></div>
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                    <span className="text-[10px] text-slate-500">{actualPercentDisplay}% collected</span>
                                    <span className="text-[10px] text-slate-500">Payment ledger: <span className={(health.healthStatus === "green" || health.healthStatus === "fully_paid" || health.healthStatus === "neutral" || health.healthStatus === "unconfigured") ? 'text-emerald-600 font-bold' : 'text-amber-500 font-bold'}>{(health.healthStatus === "green" || health.healthStatus === "fully_paid" || health.healthStatus === "neutral" || health.healthStatus === "unconfigured") ? 'Healthy' : 'Attention'}</span></span>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {activeWidgets.includes('project-journey') && (
                    <div className="break-inside-avoid">
                        <motion.div variants={itemVariants} className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/60 shadow-sm">
                            <div className="flex items-center gap-2 mb-6">
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Project Journey</h3>
                            </div>
                            
                            <div className="flex flex-col items-center gap-6">
                                <div className="text-4xl md:text-5xl font-light text-indigo-600 tracking-tighter">
                                    {journey.overall.pct}%
                                </div>
                                <div className="flex-1 text-center">
                                    <p className="text-sm font-bold text-indigo-950 mb-1">Overall completion • {journey.overall.done} of {journey.overall.total} steps</p>
                                    <p className="text-xs text-slate-600 mb-3">Active phase: <span className="font-semibold">{currentStage === 'completed' ? 'Completed' : `Phase ${activePhaseIndex + 1} — ${PHASES[activePhaseIndex]?.name || 'Pre-sales'}`}</span></p>
                                    
                                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2">
                                        <div className="bg-indigo-600 h-full" style={{ width: `${journey.overall.pct}%` }}></div>
                                    </div>
                                    <button onClick={() => setActiveTab('project-journey')} className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider hover:text-indigo-700">VIEW MAP →</button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {activeWidgets.includes('ops-intelligence') && isExecution && (
                    <div className="break-inside-avoid">
                        <motion.div variants={itemVariants} className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/60 shadow-sm flex flex-col">
                            <div className="flex items-center gap-2 mb-6">
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Ops Intelligence</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Execution Velocity */}
                                <div className="p-5 border border-slate-100 rounded-2xl flex flex-col">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Execution Velocity</p>
                                    <div className="text-3xl font-light text-indigo-600 tracking-tight mb-2">
                                        {isActuallyExecuting ? `${velocityPct}%` : 'N/A'}
                                    </div>
                                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-auto">
                                        {isActuallyExecuting ? (
                                            <>
                                                <TrendingUpIcon className="w-3.5 h-3.5 text-indigo-400" />
                                                {velocityDiff === 0 ? 'Exactly on baseline' : `${Math.abs(velocityDays)} days ${velocityDiff > 0 ? 'ahead of' : 'behind'} baseline`}
                                            </>
                                        ) : (
                                            <span>Execution hasn't started</span>
                                        )}
                                    </div>
                                </div>

                                {/* Cash Flow Risk */}
                                <div className="p-5 border border-slate-100 rounded-2xl flex flex-col">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Cash Flow Risk</p>
                                    <div className={`text-xl font-bold tracking-tight mb-3 ${(health.healthStatus === "green" || health.healthStatus === "fully_paid" || health.healthStatus === "neutral" || health.healthStatus === "unconfigured") ? 'text-emerald-600' : 'text-amber-500'}`}>
                                        {(health.healthStatus === "green" || health.healthStatus === "fully_paid" || health.healthStatus === "neutral" || health.healthStatus === "unconfigured") ? 'Healthy' : 'Elevated'}
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-auto">
                                        Collections ahead of execution burn
                                    </div>
                                </div>

                                {/* Target Dates & Estimates */}
                                <div className="p-5 border border-slate-100 rounded-2xl flex flex-col">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Timeline Estimates</p>
                                    
                                    <div className="space-y-4 mt-auto">
                                        <div>
                                            <p className="text-[10px] text-slate-500 mb-1">Target Handover</p>
                                            <p className="text-lg font-semibold tracking-tight text-slate-700">
                                                {projectContext.targetHandoverDate ? new Date(projectContext.targetHandoverDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[10px] text-slate-500 mb-1">Execution Est.</p>
                                                <p className="text-base font-medium text-indigo-600">
                                                    {projectContext.handoverDate && projectContext.designApprovedAt 
                                                        ? `${Math.round((projectContext.handoverDate - projectContext.designApprovedAt) / (1000 * 60 * 60 * 24))} Days` 
                                                        : '45-60 Days'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 mb-1">Design Est.</p>
                                                <p className="text-base font-medium text-emerald-600">
                                                    {projectContext.designApprovedAt && projectContext.briefFrozenAt 
                                                        ? `${Math.round((projectContext.designApprovedAt - projectContext.briefFrozenAt) / (1000 * 60 * 60 * 24))} Days` 
                                                        : '15-20 Days'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Material Pipeline */}
                                <div className="p-5 border border-slate-100 rounded-2xl flex flex-col cursor-pointer hover:border-slate-300 transition-colors" onClick={() => setActiveTab('materials')}>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Material Pipeline</p>
                                    <div className="text-2xl font-bold tracking-tight text-emerald-600 mb-4 flex items-center gap-2">
                                        {sofSummary.frozen} Locked
                                    </div>
                                    <div className="mt-auto space-y-1.5 text-[10px] text-slate-500">
                                        <div className="flex justify-between items-center">
                                            <span>To select</span>
                                            <span className="font-semibold text-slate-700">{sofSummary.pending}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span>Pending signoff</span>
                                            <span className="font-semibold text-slate-700">{sofSummary.pendingSignoff}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span>Delayed</span>
                                            <span className="font-semibold text-rose-500">{sofSummary.delayed}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {activeWidgets.includes('what-to-do') && (
                    <div className="break-inside-avoid">
                        <div className="bg-indigo-950/90 backdrop-blur-xl border border-indigo-800/50 rounded-3xl shadow-2xl shadow-indigo-950/20 p-6 md:p-8 shadow-sm">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">WHAT TO DO TODAY</h3>
                            <div className="space-y-4">
                                {finalTodayItems.length === 0 ? (
                                    <div className="text-center py-6 text-slate-500 text-sm">
                                        All clear! ✓
                                    </div>
                                ) : (
                                    finalTodayItems.map((item, idx) => (
                                        <div key={idx} className="flex items-start gap-3 p-3 rounded-xl hover:bg-indigo-900 transition-colors group cursor-pointer" onClick={() => setActiveTab(item.route)}>
                                            <div className="mt-0.5 text-indigo-400 text-lg">
                                                {item.title.toLowerCase().includes('handover') ? '🔑' : '📄'}
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-slate-200 leading-snug">{item.title}</h4>
                                                <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                                                <button className="mt-2 text-xs font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg group-hover:bg-indigo-500 transition-colors shadow-sm">
                                                    {item.btnText}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeWidgets.includes('site-activity') && (
                    <div className="break-inside-avoid">
                        <div className="bg-white rounded-3xl p-0 shadow-sm border border-slate-200/60 overflow-hidden">
                            <SiteActivityWidget 
                                projectId={projectId || ''}
                                studioId={orgData?.tenantId || 'demo-tenant-01'}
                                projectContextName={projectContext.name}
                                studioSettings={orgData}
                                onOpenHistory={() => setShowSiteVisitHistory(true)}
                                onNavigateSettings={() => setActiveTab('studio-settings')}
                            />
                        </div>
                    </div>
                )}

                {activeWidgets.includes('execution-bundles') && isExecution && (
                    <div className="break-inside-avoid">
                        <ExecutionBundleWidget
                            executionData={activeProject?.executionData}
                            boq={fullBoq}
                            onClick={() => setActiveTab('site-ops')}
                        />
                    </div>
                )}

                {activeWidgets.includes('comms-tracker') && projectId && (
                    <div className="break-inside-avoid">
                        <div className="bg-white rounded-3xl p-0 shadow-sm border border-slate-200/60 overflow-hidden">
                            <CommunicationTrackerWidget 
                                projectId={projectId} 
                                studioId={orgData?.tenantId || 'demo-tenant-01'} 
                                onClick={() => setActiveTab('comms-tracker')} 
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Widget Configuration Modal */}
            <AnimatePresence>
                {isWidgetModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-indigo-950/40 backdrop-blur-sm"
                            onClick={() => setIsWidgetModalOpen(false)}
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[2rem] shadow-xl w-full max-w-md relative z-10 overflow-hidden border border-slate-100"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                <div>
                                    <h3 className="text-lg font-bold text-indigo-950">Configure Dashboard</h3>
                                    <p className="text-xs text-slate-500 mt-1">Select the widgets you want to see.</p>
                                </div>
                                <button onClick={() => setIsWidgetModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-2 bg-white">
                                {WIDGET_OPTIONS.map((widget) => {
                                    const isActive = activeWidgets.includes(widget.id);
                                    return (
                                        <div key={widget.id} 
                                            onClick={() => {
                                                if (isActive) {
                                                    setActiveWidgets(prev => prev.filter(id => id !== widget.id));
                                                } else {
                                                    setActiveWidgets(prev => [...prev, widget.id]);
                                                }
                                            }}
                                            className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer border transition-all ${isActive ? 'bg-indigo-50/50 border-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                                        >
                                            <span className={`font-semibold text-sm ${isActive ? 'text-indigo-900' : 'text-slate-700'}`}>{widget.label}</span>
                                            <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isActive ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                                                {isActive && <CheckSquare className="w-3.5 h-3.5" />}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                                <button 
                                    onClick={() => setActiveWidgets(['what-to-do', 'project-journey', 'quick-actions', 'ops-intelligence', 'execution-bundles'])}
                                    className="px-4 py-2.5 rounded-xl font-bold text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex-1 transition-colors"
                                >
                                    Reset to Default
                                </button>
                                <button 
                                    onClick={() => setIsWidgetModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-700 flex-1 transition-colors shadow-sm"
                                >
                                    Done
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Render Modals / Overlays */}
            <SiteVisitLogModal
              isOpen={siteVisitModalOpen}
              onClose={() => setSiteVisitModalOpen(false)}
              projectId={projectId || ''}
              studioId={orgData?.tenantId || 'demo-tenant-01'}
              defaultType={siteVisitType}
              projectContext={projectContext}
              currentPhaseStep={3} // Provide correct phase logic here if available
              currentPhaseTitle={"Execution Phase"}
            />
            {showSiteVisitHistory && (
              <SiteVisitHistory 
                projectId={projectId || ''}
                studioId={orgData?.tenantId || 'demo-tenant-01'}
                onClose={() => setShowSiteVisitHistory(false)}
                projectContext={projectContext}
              />
            )}
        </motion.div>
    );
};

export default Dashboard;

