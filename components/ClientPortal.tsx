import React, { useMemo, useState, useEffect } from 'react';
import { FullProjectData, ProjectUpdateRecord, PaymentMilestone, Item, SiteUpdateRecord, ProjectDecisionRecord } from '../types';
import { calculateSellPrice } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrg } from '../contexts/OrgContext';
import { useStepProgress } from '../hooks/useStepProgress';
import { usePaymentRequests, usePaymentOverdueCheck } from '../hooks/usePaymentRequests';
import { StepDeliverableChecklist } from './studio/StepDeliverableChecklist';
import { functions } from '../services/firebaseClient';
import { httpsCallable } from 'firebase/functions';
import { 
    LayoutDashboard, 
    CalendarDays, 
    Wallet, 
    ClipboardList, 
    CheckCircle2, 
    AlertCircle, 
    Clock, 
    ChevronRight,
    ChevronDown,
    FileText,
    ArrowRight,
    ArrowRight as ArrowRightIcon,
    Building2,
    IndianRupee,
    Check,
    XCircle,
    Link as LinkIcon,
    LogOut,
    Sparkles,
    ExternalLink,
    PhoneCall,
    Mail,
    Activity,
    GitMerge,
    Image as ImageIcon,
    Camera,
    PlusCircle,
    MinusCircle,
    FileEdit,
    Folder,
    Map as MapIcon,
    BookOpen,
    Info,
    HelpCircle,
    ShieldCheck
} from 'lucide-react';
import { useStudioSettings } from '../hooks/useStudioSettings';
import WeeklyProgressReportTab from './WeeklyProgressReportTab';

interface ClientPortalProps {
    projectData: FullProjectData;
    bank: Item[];
    onLogout?: () => void;
    onProjectUpdate?: (project: FullProjectData) => void;
}

export default function ClientPortal({ projectData, bank, onLogout, onProjectUpdate }: ClientPortalProps) {
    const { orgData } = useOrg();
    const { settings } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');
    const { context, tiers, timeline = [] } = projectData;
    const updates = context.projectUpdates || [];
    const decisions = context.projectDecisions || [];
    const studioId = orgData?.tenantId || 'demo-tenant-01';
    
    const { steps: stepProgressSteps, updateDeliverable, updateClientSignoff, markStepComplete: completeStep } = useStepProgress(projectData.id, studioId);
    usePaymentOverdueCheck(projectData.id, studioId);
    const { activeRequest, overridePaymentGate } = usePaymentRequests(projectData.id, studioId);
    const [expandedStepIdx, setExpandedStepIdx] = useState<number | null>(null);
    
    const [activeTab, setActiveTab] = useState<'overview' | 'roadmap' | 'feed' | 'financials' | 'scope' | 'designs' | 'decisions' | 'weekly-reports'>('overview');
    const [showGlossary, setShowGlossary] = useState(false);

    const setProjectContext = (updater: any) => {
        const nextContext = typeof updater === 'function' ? updater(projectData.context) : updater;
        if (onProjectUpdate) {
            onProjectUpdate({
                ...projectData,
                context: nextContext
            });
        }
    };

    // Filter out drafts
    const displayUpdates = updates.filter(u => u.status !== 'draft');

    // Use activeTierId if approvedTierId is not set, so client always sees the relevant BOQ
    const activeTier = useMemo(() => {
        if (projectData.activeTierId) {
            return tiers.find(t => t.id === projectData.activeTierId) || tiers[0];
        }
        return context.approvedTierId ? tiers.find(t => t.id === context.approvedTierId) : tiers[0];
    }, [projectData.activeTierId, context.approvedTierId, tiers]);

    const [operativeBoq, setOperativeBoq] = useState<any>(null);
    useEffect(() => {
        if (context.operativeBoqVersion && projectData.id && functions) {
            const getBoq = httpsCallable(functions, 'getOperativeBoq');
            getBoq({ orgId: studioId, projectId: projectData.id })
                .then(res => setOperativeBoq(res.data))
                .catch(err => console.error("Failed to load operative BOQ", err));
        }
    }, [context.operativeBoqVersion, projectData.id, studioId]);

    const displayBoq = operativeBoq?.itemsSnapshot ? operativeBoq.itemsSnapshot : activeTier?.boq || [];

    // --- FINANCIAL CALCULATIONS ---
    const financials = context.financials || {
        initiationFeePaid: 4999,
        billablePercent: 100,
        executionGstEnabled: true,
        projectedCashValue: 0,
        taxLimitYearly: 2000000,
        goodwillDiscount: 0,
        discounts: []
    };

    const gstRate = context.gstRate || 18;
    const initiationFee = financials.initiationFeePaid;
    const billablePercent = financials.billablePercent;
    const executionGstEnabled = financials.executionGstEnabled;
    const discounts = financials.discounts || [];

    const originalExecutionTotal = activeTier?.summary.totalSell || 0;
    const originalDesignFee = activeTier?.summary.designFee || 0;

    const rawExecutionTotal = financials.approvedExecutionValue ?? originalExecutionTotal;
    const rawDesignFee = financials.approvedDesignValue ?? originalDesignFee;

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

    const executionDiscountVal = calculateDiscountValue(rawExecutionTotal, 'execution');
    const designDiscountVal = calculateDiscountValue(rawDesignFee, 'design');

    const taxableExecution = Math.max(0, rawExecutionTotal - executionDiscountVal);
    const taxableDesign = Math.max(0, rawDesignFee - designDiscountVal);

    const executionBillable = taxableExecution * (billablePercent / 100);
    const executionCash = taxableExecution * ((100 - billablePercent) / 100);

    const gstOnExecution = executionGstEnabled ? (executionBillable * (gstRate / 100)) : 0;
    const gstOnDesign = taxableDesign * (gstRate / 100);
    const totalGST = gstOnExecution + gstOnDesign;

    const currentProjectValue = executionBillable + executionCash + taxableDesign + totalGST;
    const baseProjectValue = originalExecutionTotal + originalDesignFee + (originalExecutionTotal * (gstRate/100)) + (originalDesignFee * (gstRate/100));

    // Calculate Paid Amount
    const milestones = context.paymentMilestones || [];
    let totalPaid = initiationFee;
    
    const calculateMilestoneTotal = (m: PaymentMilestone) => {
        let baseAmount = taxableExecution; // default execution
        if (m.type === 'design') baseAmount = taxableDesign;
        if (m.lockedTaxableBase !== undefined) baseAmount = m.lockedTaxableBase;
        
        const rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * (m.percentage / 100);
        
        let rowBillable = rowBaseOriginal;
        let rowCash = 0;
        let applicableGstRate = gstRate;
        
        if (m.type === 'execution') {
            rowBillable = rowBaseOriginal * (billablePercent / 100);
            rowCash = rowBaseOriginal * (Math.max(0, 100 - billablePercent) / 100);
            if (!executionGstEnabled) applicableGstRate = 0;
        }
        
        const rowGST = rowBillable * (applicableGstRate / 100);
        return rowBillable + rowCash + rowGST;
    };

    milestones.forEach(m => {
        if (m.status === 'paid') {
            totalPaid += calculateMilestoneTotal(m);
        }
    });

    const paidPercentage = currentProjectValue > 0 ? Math.min(100, Math.round((totalPaid / currentProjectValue) * 100)) : 0;
    const balanceDue = Math.max(0, currentProjectValue - totalPaid);

    // --- ACTION REQUIRED ---
    const pendingUpdates = displayUpdates.filter(u => u.status === 'pending_approval');
    const pendingClientDecisions = decisions.filter(d => d.status === 'proposed' && d.requestedBy === 'ffds');
    
    const duePayments = milestones.filter(m => m.status === 'invoiced').map(m => {
        return {
            ...m,
            paymentAmount: calculateMilestoneTotal(m),
            dateString: m.invoiceDate || m.date || 'Immediate'
        };
    });

    // --- BOQ CATEGORIZATION & REVISIONS ---
    const boqRevisions = context.boqRevisions || [];

    const boqByCategory = useMemo(() => {
        if (!activeTier) return {};

        const validRoomNames = new Set(projectData.context.rooms?.map(r => r.name) || []);
        const bankMap = new Map<string, any>(bank.map(b => [b.id, b]));

        // 1. Build Baseline BOQ
        const baselineBoq: any[] = displayBoq.map((item: any) => {
            const bankItem = bankMap.get(item.bankId);
            if (!bankItem) return null;
            
            const groupKey = (item.roomId && validRoomNames.has(item.roomId)) 
                ? item.roomId 
                : (bankItem.cat || 'Uncategorized');

            const sellPrice = item.selectedRate ?? calculateSellPrice(bankItem.materials, bankItem.labor, item.marginOverride ?? bankItem.margin);
            
            return {
                ...item,
                id: item.id,
                roomId: groupKey, // normalized grouping key
                item: bankItem.name,
                unit: bankItem.unit,
                qty: item.qty,
                rate: sellPrice,
                total: sellPrice * item.qty,
                description: bankItem.specs,
                internalSpecs: bankItem.internalSpecs,
                status: 'Approved'
            };
        }).filter(Boolean);

        // 2. Apply Revisions to working BOQ
        let workingBoq = JSON.parse(JSON.stringify(baselineBoq));

        boqRevisions.forEach(action => {
            if (action.type === 'ADD') {
                workingBoq.push({
                    id: action.id,
                    roomId: action.section, // map section to roomId group
                    item: action.item,
                    unit: action.newValue?.unit || 'nos',
                    qty: action.newValue?.qty || 1,
                    rate: action.newValue?.rate || 0,
                    total: (action.newValue?.qty || 1) * (action.newValue?.rate || 0),
                    status: 'Added',
                    description: action.note,
                    internalSpecs: '',
                });
            } else {
                const targetIndex = workingBoq.findIndex((i: any) => action.targetId ? i.id === action.targetId : (i.roomId === action.section && i.item === action.item));
                if (targetIndex >= 0) {
                    if (action.type === 'REMOVE') {
                        workingBoq[targetIndex].status = 'Removed';
                        workingBoq[targetIndex].qty = 0;
                        workingBoq[targetIndex].total = 0;
                    } else if (action.type === 'REVISE_QTY') {
                        workingBoq[targetIndex].qty = action.newValue;
                        workingBoq[targetIndex].total = action.newValue * workingBoq[targetIndex].rate;
                        workingBoq[targetIndex].status = 'Revised';
                    } else if (action.type === 'REVISE_RATE') {
                        workingBoq[targetIndex].rate = action.newValue;
                        workingBoq[targetIndex].total = workingBoq[targetIndex].qty * action.newValue;
                        workingBoq[targetIndex].status = 'Revised';
                    } else if (action.type === 'REPLACE') {
                        workingBoq[targetIndex].item = action.newValue?.item || action.item;
                        workingBoq[targetIndex].rate = action.newValue?.rate || workingBoq[targetIndex].rate;
                        workingBoq[targetIndex].total = workingBoq[targetIndex].qty * workingBoq[targetIndex].rate;
                        workingBoq[targetIndex].status = 'Replaced';
                    }
                }
            }
        });

        // 3. Group by Category
        const grouped: Record<string, any[]> = {};
        workingBoq.forEach((item: any) => {
            // Don't show fully removed items that have 0 total to client in the standard scope view?
            // Actually, showing them as 0 qty is fine, but maybe filter out if they are completely removed
            if (item.status === 'Removed' && item.qty === 0) return;
            
            const groupKey = item.roomId || 'Uncategorized';
            if (!grouped[groupKey]) grouped[groupKey] = [];
            
            grouped[groupKey].push(item);
        });

        return grouped;
    }, [activeTier, bank, projectData.context.rooms, boqRevisions]);

    // --- LIVE FEED GENERATION ---
    // Combine site updates, project updates, and payment milestones into a single chronological feed
    const liveFeed = useMemo(() => {
        const feed: any[] = [];

        // 1. Site Updates (Strictly from projectContext)
        const siteUpdates: SiteUpdateRecord[] = context.siteUpdates || [];

        siteUpdates.forEach(su => {
            feed.push({
                id: su.id,
                type: 'site_update',
                date: new Date(su.date),
                data: su
            });
        });

        // 2. Project Updates (Variations)
        displayUpdates.forEach(pu => {
            if (pu.status === 'approved' || pu.status === 'pending_approval') {
                feed.push({
                    id: pu.id,
                    type: 'project_update',
                    date: new Date(pu.date),
                    data: pu
                });
            }
        });

        // 3. Payment Milestones
        milestones.forEach(m => {
            if (m.status === 'paid' || m.status === 'invoiced') {
                feed.push({
                    id: `pm-${m.id}`,
                    type: 'payment',
                    date: new Date(m.invoiceDate || m.date || Date.now()),
                    data: m
                });
            }
        });

        // Sort descending by date
        return feed.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [context.siteUpdates, displayUpdates, milestones]);

    const handleApproveUpdate = (id: string) => {
        if (!onProjectUpdate) return;
        const newUpdates = [...updates];
        const idx = newUpdates.findIndex(u => u.id === id);
        if (idx >= 0) {
            newUpdates[idx] = { ...newUpdates[idx], status: 'approved' };
            onProjectUpdate({
                ...projectData,
                context: { ...context, projectUpdates: newUpdates }
            });
        }
    };

    return (
        <div 
            className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans selection:bg-indigo-100 selection:text-indigo-900"
            style={{ 
                '--color-primary': settings?.primaryColor || '#4f46e5',
                '--color-accent': settings?.accentColor || '#10b981'
            } as React.CSSProperties}
        >
            {/* Sidebar Navigation */}
            <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 sticky top-0 md:h-screen z-20">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between md:justify-start gap-3">
                    {settings?.logoUrl ? (
                        <img src={settings.logoUrl} alt="Logo" className="w-8 h-8 object-contain shrink-0" />
                    ) : (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: settings?.primaryColor || orgData.themeColor || '#0f172a' }}>
                            {settings?.companyName?.charAt(0).toUpperCase() || orgData.orgName?.charAt(0).toUpperCase() || 'S'}
                        </div>
                    )}
                    <div>
                        <h1 className="font-bold text-indigo-950 leading-tight">
                            {settings?.clientPortalConfig?.portalTitle || `${settings?.companyName || orgData.orgName || 'Studio'} — Your Design Journey`}
                        </h1>
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Client Portal</p>
                    </div>
                    {onLogout && (
                        <button onClick={onLogout} className="md:hidden p-2 text-slate-400 hover:text-slate-600">
                            <LogOut className="w-5 h-5" />
                        </button>
                    )}
                </div>

                <nav className="flex-1 p-4 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible">
                    {[
                        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
                        ...(settings?.clientPortalConfig?.showTimeline !== false ? [{ id: 'roadmap', label: 'Project Roadmap', icon: MapIcon }] : []),
                        { id: 'feed', label: 'Live Feed', icon: Activity },
                        { id: 'weekly-reports', label: 'Weekly Progress', icon: ClipboardList },
                        ...(settings?.clientPortalConfig?.showDocuments !== false ? [
                            { id: 'designs', label: 'Approved Designs', icon: ImageIcon },
                            { id: 'decisions', label: 'Decisions Log', icon: ShieldCheck },
                            { id: 'scope', label: 'Scope & BOQ', icon: GitMerge }
                        ] : []),
                        ...(settings?.clientPortalConfig?.showPayments !== false ? [{ id: 'financials', label: 'Financials', icon: Wallet }] : []),
                    ].map((tab: any) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
                                activeTab === tab.id 
                                    ? 'text-white shadow-md' 
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-950'
                            }`}
                            style={activeTab === tab.id ? { backgroundColor: orgData.themeColor || '#0f172a' } : {}}
                        >
                            <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-white' : 'text-slate-400'}`} />
                            {tab.label}
                        </button>
                    ))}
                </nav>

                {onLogout && (
                    <div className="p-4 border-t border-slate-100 hidden md:block">
                        <button onClick={onLogout} className="flex items-center gap-3 px-4 py-3 w-full rounded-xl font-medium text-sm text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </button>
                    </div>
                )}
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
                {/* Top Header */}
                <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-10 px-6 md:px-10 py-5 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-indigo-950">{context.name || 'Your Project'}</h2>
                        <p className="text-sm text-slate-500 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            Execution Phase
                        </p>
                    </div>
                    <div className="hidden md:flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Project Manager</p>
                            <p className="text-sm font-semibold text-indigo-900">{settings?.companyName || orgData.orgName || 'Studio'} Ops Team</p>
                        </div>
                        {settings?.phone && (
                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200">
                                <a href={`tel:${settings.phone}`} aria-label="Call support">
                                    <PhoneCall className="w-4 h-4 text-slate-500" />
                                </a>
                            </div>
                        )}
                    </div>
                </header>

                <div className="p-6 md:p-10 max-w-5xl mx-auto">
                    <AnimatePresence mode="wait">
                        {activeTab === 'overview' && (
                            <motion.div
                                key="overview"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-8"
                            >
                                {settings?.clientPortalConfig?.introMessage && (
                                    <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200">
                                        <p className="text-slate-700 font-medium">
                                            {settings.clientPortalConfig.introMessage}
                                        </p>
                                    </div>
                                )}

                                {/* Action Required Banner */}
                                {(pendingUpdates.length > 0 || duePayments.length > 0 || pendingClientDecisions.length > 0) && (
                                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 shadow-sm">
                                        <div className="flex items-start gap-4 mb-4">
                                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shrink-0 shadow-sm border border-rose-100">
                                                <AlertCircle className="w-5 h-5 text-rose-500" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-rose-900 text-lg">Action Required</h3>
                                                <p className="text-rose-700 text-sm mt-1">
                                                    You have upcoming items that need your attention to keep the project on track.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col md:flex-row gap-3">
                                            {duePayments.length > 0 && (
                                                <button onClick={() => setActiveTab('financials')} className="flex-1 px-4 py-3 bg-white border border-rose-200 text-rose-700 text-sm font-medium rounded-lg hover:bg-rose-50 transition-colors shadow-sm text-left flex items-center justify-between">
                                                    <span>{duePayments.length} Payment(s) Due</span>
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            )}
                                            {pendingClientDecisions.length > 0 && (
                                                <button onClick={() => setActiveTab('decisions')} className="flex-1 px-4 py-3 bg-white border border-rose-200 text-rose-700 text-sm font-medium rounded-lg hover:bg-rose-50 transition-colors shadow-sm text-left flex items-center justify-between">
                                                    <span>{pendingClientDecisions.length} Pending Decision(s)</span>
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            )}
                                            {pendingUpdates.length > 0 && (
                                                <button onClick={() => setActiveTab('scope')} className="flex-1 px-4 py-3 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-700 transition-colors shadow-sm text-left flex items-center justify-between">
                                                    <span>{pendingUpdates.length} Variation(s) for Approval</span>
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* High-Level Stats */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Total Project Value</p>
                                        <p className="text-3xl font-bold text-indigo-950">₹{currentProjectValue.toLocaleString('en-IN')}</p>
                                        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-sm">
                                            <span className="text-slate-500">Base Contract</span>
                                            <span className="font-medium text-slate-700">₹{baseProjectValue.toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Amount Paid</p>
                                        <p className="text-3xl font-bold text-indigo-950">₹{totalPaid.toLocaleString('en-IN')}</p>
                                        <div className="mt-4 pt-4 border-t border-slate-100">
                                            <div className="flex justify-between items-center text-sm mb-2">
                                                <span className="text-slate-500">Progress</span>
                                                <span className="font-medium text-emerald-600">{paidPercentage}%</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${paidPercentage}%` }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Balance Due</p>
                                        <p className="text-3xl font-bold text-indigo-950">₹{balanceDue.toLocaleString('en-IN')}</p>
                                        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-sm">
                                            <span className="text-slate-500">Next Milestone</span>
                                            <button onClick={() => setActiveTab('financials')} className="font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                                View Schedule <ChevronRight className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Recent Activity Preview */}
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-bold text-indigo-950">Recent Activity</h3>
                                        <button onClick={() => setActiveTab('feed')} className="text-sm font-medium text-slate-500 hover:text-indigo-950 flex items-center gap-1 transition-colors">
                                            View Full Feed <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                        {liveFeed.slice(0, 3).map((item, idx) => (
                                            <div key={item.id} className={`p-5 flex gap-4 ${idx !== 0 ? 'border-t border-slate-100' : ''}`}>
                                                <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                                                    {item.type === 'site_update' ? <Camera className="w-4 h-4 text-slate-500" /> :
                                                     item.type === 'payment' ? <Wallet className="w-4 h-4 text-emerald-500" /> :
                                                     <GitMerge className="w-4 h-4 text-indigo-500" />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-medium text-slate-400">
                                                            {item.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                        </span>
                                                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                        <span className="text-xs font-medium text-slate-500 capitalize">
                                                            {(item.type || '').replace('_', ' ')}
                                                        </span>
                                                    </div>
                                                    <h4 className="font-semibold text-indigo-900 text-sm">
                                                        {item.type === 'site_update' ? item.data.title :
                                                         item.type === 'payment' ? `Payment ${item.data.status}: ${item.data.name}` :
                                                         `Scope Update: ${item.data.title}`}
                                                    </h4>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'roadmap' && (
                            <motion.div
                                key="roadmap"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="max-w-3xl mx-auto space-y-8"
                            >
                                <div className="mb-8">
                                    <h2 className="text-2xl font-bold text-indigo-950 mb-2">Project Roadmap</h2>
                                    <p className="text-slate-500">Your guide to the interior execution journey. See where we are, what happens next, and what to expect.</p>
                                </div>

                                <div className="relative">
                                    {/* Vertical Connecting Line */}
                                    <div className="absolute left-[20px] top-4 bottom-4 w-0.5 bg-slate-200"></div>

                                {(() => {
                                    const defaultSteps = [
                                        { title: 'Design & Approvals', description: 'Finalizing 3Ds, working drawings, and material selections.' },
                                        { title: 'Site Setup & Protection', description: 'Protecting existing areas, bringing tools, and masking floors.' },
                                        { title: 'Core Material Delivery', description: 'Procuring core materials (plywood, wires, pipes) and conducting quality checks at site.' },
                                        { title: 'Final Assembly & Testing', description: 'Installing switch plates, mounting lights, and testing all circuits and plumbing.' },
                                        { title: 'Deep Cleaning & Handover', description: 'Removing all debris, detailed cleaning, and final project walkthrough.' }
                                    ];
                                    const projectPhases = settings?.designProcess?.steps?.length > 0 ? settings.designProcess.steps : defaultSteps;
                                    
                                    // Determine active phase dynamically.
                                    const designPaid = (milestones || []).filter(m => m.type === 'design' && m.status === 'paid').length;
                                    const execPaid = (milestones || []).filter(m => m.type === 'execution' && m.status === 'paid').length;
                                    let activePhaseIndex = 0;
                                    
                                    if (stepProgressSteps && stepProgressSteps.length > 0) {
                                        activePhaseIndex = stepProgressSteps.findIndex(s => s.status === 'in_progress');
                                        if (activePhaseIndex === -1 && stepProgressSteps.every(s => s.status === 'completed')) {
                                            activePhaseIndex = projectPhases.length;
                                        } else if (activePhaseIndex === -1) {
                                            activePhaseIndex = 0;
                                        }
                                    } else {
                                        const designPaid = (milestones || []).filter(m => m.type === 'design' && m.status === 'paid').length;
                                        const execPaid = (milestones || []).filter(m => m.type === 'execution' && m.status === 'paid').length;
                                        if (execPaid > 2) activePhaseIndex = Math.min(projectPhases.length - 1, 3);
                                        else if (execPaid > 0) activePhaseIndex = Math.min(projectPhases.length - 1, 2);
                                        else if (designPaid > 1) activePhaseIndex = 1;
                                    }
                                    
                                    return projectPhases.map((step: any, idx: number) => {
                                        const isCompleted = idx < activePhaseIndex;
                                        const isActive = idx === activePhaseIndex;
                                        
                                        const progressStep = stepProgressSteps.find(s => s.stepNumber === idx + 1);
                                        const totalDeliverables = progressStep?.deliverables?.length || 0;
                                        const checkedDeliverables = progressStep?.deliverables?.filter(d => d.checked)?.length || 0;
                                        const isExpanded = expandedStepIdx === idx;
                                        const showGate = !!progressStep && (isActive || isExpanded || isCompleted);

                                        // Payment Gate Evaluation
                                        const showPaymentGate = isActive && activeRequest && activeRequest.triggeredByStepNumber === idx;

                                        return (
                                        <div key={idx} className="relative flex items-start gap-6 mb-8 group">
                                            {/* Milestone Node */}
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-4 border-slate-50 relative z-10 transition-colors ${
                                                isCompleted ? 'bg-emerald-500 text-white' :
                                                isActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' :
                                                'bg-slate-200 text-slate-500'
                                            }`}>
                                                {isCompleted ? <Check className="w-4 h-4" /> : <span className="text-sm font-bold">{idx + 1}</span>}
                                            </div>

                                            {/* Content Card */}
                                            <div className={`flex-1 pt-1 ${(isActive || isCompleted || showGate) ? '' : 'opacity-60'}`}>
                                                
                                                {showPaymentGate && (
                                                    <div className={`mb-4 w-full p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${activeRequest.status === 'overdue' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                                                        {activeRequest.status === 'overdue' ? (<div className="flex items-center gap-3 text-red-800 font-bold"><span className="flex-shrink-0 animate-pulse text-red-500">🔴</span>Payment Pending</div>) : (
                                                            <div className="flex items-center gap-3 text-amber-800 font-bold">
                                                                <span className="flex-shrink-0 animate-pulse text-amber-500">⏳</span>
                                                                Awaiting Payment — {activeRequest.milestoneLabel}
                                                            </div>
                                                        )}
                                                        {activeRequest.status === 'pending' && (
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const reason = window.prompt(`Payment for ${activeRequest.milestoneLabel} not yet received. Reason for proceeding:`);
                                                                    if (reason && reason.length >= 10) {
                                                                        overridePaymentGate(activeRequest.id, reason);
                                                                    } else if (reason !== null) {
                                                                        alert("Please provide a valid reason (min 10 chars).");
                                                                    }
                                                                }}
                                                                className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-md transition-colors"
                                                            >
                                                                Proceed Anyway →
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                <div 
                                                    className={`bg-white rounded-2xl p-6 border transition-all cursor-pointer ${
                                                        isActive ? 'border-indigo-200 shadow-sm ring-1 ring-indigo-50' : 'border-slate-200 shadow-sm hover:border-slate-300'
                                                    } ${showPaymentGate ? 'opacity-75 pointer-events-none' : ''}`}
                                                    onClick={() => !showPaymentGate && setExpandedStepIdx(isExpanded ? null : idx)}
                                                >
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                                                        <div className="flex items-center gap-3">
                                                            <h3 className={`font-bold text-lg ${isActive ? 'text-indigo-900' : 'text-indigo-900'}`}>
                                                                {step.title}
                                                            </h3>
                                                            {isActive && (
                                                                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                                                                    Current Phase
                                                                </span>
                                                            )}
                                                        </div>
                                                        {totalDeliverables > 0 && (
                                                            <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                                                <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(checkedDeliverables / totalDeliverables) * 100}%` }} />
                                                                </div>
                                                                <span className="text-xs font-bold text-slate-600">{checkedDeliverables}/{totalDeliverables} items</span>
                                                                {progressStep?.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <p className="text-slate-600 text-sm leading-relaxed">{step.description || step.desc}</p>
                                                    
                                                    {/* Educational Note conditionally shown */}
                                                    {isActive && (
                                                        <div className="mt-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-start gap-3">
                                                            <div className="mt-0.5"><Activity className="w-4 h-4 text-indigo-500" /></div>
                                                            <div>
                                                                <p className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-1">In Progress</p>
                                                                <p className="text-xs text-indigo-800/80 leading-relaxed">
                                                                    Our team is currently working on this phase at the site. We will post updates with photos in the Live Feed once significant progress is made.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Checklist Panel */}
                                                    <AnimatePresence>
                                                        {isExpanded && progressStep && (
                                                            <motion.div 
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="mt-6 pt-6 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                                                                    <StepDeliverableChecklist 
                                                                        step={progressStep}
                                                                        projectId={projectData.id}
                                                                        onUpdateDeliverable={updateDeliverable}
                                                                        onUpdateSignoff={updateClientSignoff}
                                                                        onCompleteStep={completeStep}
                                                                    />
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        </div>
                                    )});
                                })()}
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'feed' && (
                            <motion.div
                                key="feed"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="max-w-3xl mx-auto"
                            >
                                <div className="mb-8">
                                    <h2 className="text-2xl font-bold text-indigo-950 mb-2">Live Feed</h2>
                                    <p className="text-slate-500">Real-time updates from the site, financial milestones, and scope changes.</p>
                                </div>

                                <div className="relative space-y-8 before:absolute before:inset-0 before:ml-6 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                                    {liveFeed.length === 0 ? (
                                        <div className="relative flex items-center justify-center py-12 z-10">
                                            <div className="bg-white px-6 py-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                                                <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                                <p className="text-slate-500 font-medium">No updates yet.</p>
                                                <p className="text-sm text-slate-400">Site updates and milestones will appear here.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        liveFeed.map((item) => (
                                            <div key={item.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                            {/* Icon */}
                                            <div className="flex items-center justify-center w-12 h-12 rounded-full border-4 border-slate-50 bg-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                                {item.type === 'site_update' ? <Camera className="w-5 h-5 text-slate-500" /> :
                                                 item.type === 'payment' ? <Wallet className="w-5 h-5 text-emerald-500" /> :
                                                 <GitMerge className="w-5 h-5 text-indigo-500" />}
                                            </div>
                                            
                                            {/* Card */}
                                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                                                        item.type === 'site_update' ? (item.data.type === 'design' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600') :
                                                        item.type === 'payment' ? 'bg-emerald-50 text-emerald-600' :
                                                        'bg-indigo-50 text-indigo-600'
                                                    }`}>
                                                        {item.type === 'site_update' 
                                                            ? (item.data.type === 'design' ? 'Design Update' : 'Site Update')
                                                            : (item.type || '').replace('_', ' ')}
                                                    </span>
                                                    <time className="text-xs font-medium text-slate-400 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {item.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </time>
                                                </div>

                                                {item.type === 'site_update' && (
                                                    <div>
                                                        <h4 className="font-bold text-indigo-900 text-lg mb-2">{item.data.title}</h4>
                                                        <p className="text-sm text-slate-600 leading-relaxed mb-4">{item.data.description}</p>
                                                        {item.data.tags && (
                                                            <div className="flex flex-wrap gap-2 mb-4">
                                                                {item.data.tags.map((tag: string, i: number) => (
                                                                    <span key={i} className="text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-100 px-2 py-1 rounded-md">{tag}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 border-t border-slate-100 pt-3">
                                                            <div className="w-5 h-5 bg-slate-200 rounded-full flex items-center justify-center text-[8px] text-slate-600">FF</div>
                                                            {item.data.author}
                                                        </div>
                                                    </div>
                                                )}

                                                {item.type === 'payment' && (
                                                    <div>
                                                        <h4 className="font-bold text-indigo-900 text-lg mb-1">{item.data.name}</h4>
                                                        <p className="text-sm text-slate-500 mb-3">{item.data.description}</p>
                                                        <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center border border-slate-100">
                                                            <span className="text-xs font-medium text-slate-500">Amount</span>
                                                            <span className="font-bold text-indigo-950">
                                                                ₹{calculateMilestoneTotal(item.data).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {item.type === 'project_update' && (
                                                    <div>
                                                        <h4 className="font-bold text-indigo-900 text-lg mb-1">{item.data.title}</h4>
                                                        <p className="text-sm text-slate-500 mb-3">
                                                            {item.data.status === 'approved' ? 'Scope variation approved and integrated.' : 'Variation pending your approval.'}
                                                        </p>
                                                        <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center border border-slate-100">
                                                            <span className="text-xs font-medium text-slate-500">Net Impact</span>
                                                            <span className={`font-bold ${item.data.netImpact > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                                {item.data.netImpact > 0 ? '+' : ''}₹{item.data.netImpact.toLocaleString('en-IN')}
                                                            </span>
                                                        </div>
                                                        {item.data.status === 'pending_approval' && (
                                                            <button onClick={() => setActiveTab('scope')} className="mt-3 w-full py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors">
                                                                Review Details
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'weekly-reports' && (
                            <motion.div
                                key="weekly-reports"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <div className="mb-8">
                                    <h2 className="text-2xl font-bold text-indigo-950 mb-2">Weekly Progress Reports</h2>
                                    <p className="text-slate-500">Chronological week-by-week summaries of design, site execution, and financials.</p>
                                </div>
                                <WeeklyProgressReportTab
                                    projectContext={context}
                                    setProjectContext={setProjectContext}
                                    activeTier={activeTier}
                                    projectId={projectData.id}
                                    projectData={projectData}
                                    isClientView={true}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'financials' && (
                            <motion.div
                                key="financials"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-8"
                            >
                                <div className="mb-8">
                                    <h2 className="text-2xl font-bold text-indigo-950 mb-2">Financial Ledger</h2>
                                    <p className="text-slate-500">Track your payments, upcoming milestones, and official invoices.</p>
                                </div>

                                {/* Ledger Summary */}
                                <div className="bg-indigo-950/90 backdrop-blur-xl border border-indigo-800/50 rounded-3xl shadow-2xl shadow-indigo-950/20 p-8 text-white shadow-lg relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                                        <div>
                                            <p className="text-slate-400 text-sm font-medium mb-1">Total Project Value</p>
                                            <p className="text-4xl font-bold">₹{currentProjectValue.toLocaleString('en-IN')}</p>
                                        </div>
                                        <div>
                                            <p className="text-emerald-400 text-sm font-medium mb-1">Total Paid</p>
                                            <p className="text-3xl font-bold text-white">₹{totalPaid.toLocaleString('en-IN')}</p>
                                        </div>
                                        <div>
                                            <p className="text-rose-400 text-sm font-medium mb-1">Balance Due</p>
                                            <p className="text-3xl font-bold text-white">₹{balanceDue.toLocaleString('en-IN')}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Zoho Books Integration Note */}
                                <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 flex items-start gap-4">
                                    <div className="w-8 h-8 bg-white border border-blue-100 rounded-full flex items-center justify-center shrink-0 shadow-sm">
                                        <FileText className="w-4 h-4 text-blue-500" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-blue-900 text-sm mb-1">Official Tax Invoices via Zoho Books</h3>
                                        <p className="text-blue-800/80 text-sm leading-relaxed">
                                            We use Zoho Books for official invoicing. When a payment is marked as "Due" here, an official tax invoice with payment links is automatically sent to your registered email address.
                                        </p>
                                    </div>
                                </div>

                                {/* Payment Schedule */}
                                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="p-6 md:p-8 border-b border-slate-100">
                                        <h3 className="text-lg font-bold text-indigo-950">Payment Schedule</h3>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {milestones.map((milestone) => {
                                            const amount = calculateMilestoneTotal(milestone);
                                            const isPaid = milestone.status === 'paid';
                                            const isDue = milestone.status === 'invoiced';
                                            
                                            return (
                                                <div key={milestone.id} className={`p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-colors hover:bg-slate-50/50`}>
                                                    <div className="flex items-start gap-5">
                                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                                                            isPaid ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                                                            isDue ? 'bg-rose-50 border-rose-100 text-rose-600' :
                                                            'bg-slate-50 border-slate-200 text-slate-400'
                                                        }`}>
                                                            {isPaid ? <Check className="w-5 h-5" /> : `${milestone.percentage}%`}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-3 mb-1">
                                                                <h4 className={`font-bold text-base ${isDue ? 'text-indigo-950' : 'text-indigo-900'}`}>{milestone.name}</h4>
                                                                {isDue && <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-bold uppercase tracking-wider rounded">Action Required</span>}
                                                            </div>
                                                            <p className="text-slate-500 text-sm mt-1 max-w-2xl leading-relaxed">{milestone.description}</p>
                                                            {milestone.date && (
                                                                <p className="text-xs font-medium text-slate-400 mt-2 flex items-center gap-1.5">
                                                                    <Clock className="w-3.5 h-3.5" /> Target Date: {milestone.date}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-left md:text-right shrink-0 pl-17 md:pl-0 flex flex-col items-start md:items-end gap-2">
                                                        <p className={`text-xl font-bold ${isPaid ? 'text-slate-400' : isDue ? 'text-indigo-950' : 'text-slate-700'}`}>
                                                            ₹{amount.toLocaleString('en-IN')}
                                                        </p>
                                                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${
                                                            isPaid ? 'text-emerald-600' :
                                                            isDue ? 'text-rose-600' :
                                                            'text-slate-400'
                                                        }`}>
                                                            {isPaid ? 'Payment Received' : isDue ? 'Payment Due' : 'Upcoming'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'designs' && (
                            <motion.div
                                key="designs"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-8"
                            >
                                <div className="mb-8">
                                    <h2 className="text-2xl font-bold text-indigo-950 mb-2">Approved Designs</h2>
                                    <p className="text-slate-500">Access and review all finalized PDFs and design documents directly from Google Drive.</p>
                                </div>
                                
                                {(!context.designDocuments || context.designDocuments.length === 0) ? (
                                    <div className="relative flex items-center justify-center py-12">
                                        <div className="bg-white px-6 py-8 rounded-2xl border border-slate-200 shadow-sm text-center w-full">
                                            <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                                            <p className="text-slate-600 font-medium text-lg">No designs uploaded yet.</p>
                                            <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">Once the design team finalizes room layouts and views, the links to the approved PDFs will appear here.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {Object.entries((context.designDocuments || []).reduce((acc, doc) => {
                                            if (!acc[doc.roomName]) acc[doc.roomName] = [];
                                            acc[doc.roomName].push(doc);
                                            return acc;
                                        }, {} as Record<string, any[]>)).map(([roomName, roomDocs]) => (
                                            <div key={roomName} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                                                    <h3 className="font-bold text-indigo-900 text-lg flex items-center gap-2">
                                                        <Folder className="w-5 h-5 text-indigo-500" />
                                                        {roomName}
                                                    </h3>
                                                    <span className="text-xs font-bold text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm">
                                                        {roomDocs.length} {roomDocs.length === 1 ? 'File' : 'Files'}
                                                    </span>
                                                </div>
                                                <div className="divide-y divide-slate-100 flex-1">
                                                    {roomDocs.map(doc => (
                                                        <a 
                                                            key={doc.id} 
                                                            href={doc.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center justify-between p-4 hover:bg-indigo-50/50 group transition-colors"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex flex-col items-center justify-center shrink-0 border border-blue-100/50">
                                                                    <FileText className="w-4 h-4 mb-0.5" />
                                                                    <span className="text-[8px] font-bold uppercase">PDF</span>
                                                                </div>
                                                                <div>
                                                                    <p className="font-semibold text-indigo-900 group-hover:text-indigo-700 transition-colors text-sm">{doc.title}</p>
                                                                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                                                        <Clock className="w-3 h-3" />
                                                                        {new Date(doc.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-indigo-600 group-hover:bg-white group-hover:shadow-sm transition-all border border-transparent group-hover:border-indigo-100 shrink-0">
                                                                <ExternalLink className="w-4 h-4" />
                                                            </div>
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {activeTab === 'decisions' && (
                            <motion.div
                                key="decisions"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-8"
                            >
                                <div className="mb-8">
                                    <h2 className="text-2xl font-bold text-indigo-950 mb-2">Decisions Log</h2>
                                    <p className="text-slate-500">A clear audit trail of all confirmed decisions and their impact on the project.</p>
                                </div>
                                
                                {decisions.length === 0 ? (
                                    <div className="relative flex items-center justify-center py-12">
                                        <div className="bg-white px-6 py-8 rounded-2xl border border-slate-200 shadow-sm text-center w-full">
                                            <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                                            <p className="text-slate-600 font-medium text-lg">No decisions logged yet.</p>
                                            <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">Key decisions regarding design and execution will be recorded here for mutual clarity.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="divide-y divide-slate-100">
                                            {decisions.map(decision => (
                                                <div key={decision.id} className="p-6 md:p-8 flex flex-col md:flex-row gap-6 transition-colors hover:bg-slate-50/50">
                                                    <div className="flex-1">
                                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                                            {decision.status === 'confirmed' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider"><CheckCircle2 className="w-3 h-3"/> Confirmed</span>}
                                                            {decision.status === 'proposed' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider"><Clock className="w-3 h-3"/> Proposed</span>}
                                                            {decision.status === 'rejected' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wider"><XCircle className="w-3 h-3"/> Rejected</span>}
                                                            {decision.status === 'revoked' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wider"><AlertCircle className="w-3 h-3"/> Revoked</span>}
                                                            
                                                            <span className="text-xs text-slate-400 font-medium">{new Date(decision.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                                        </div>
                                                        
                                                        <h4 className={`text-lg font-bold text-indigo-900 ${decision.status === 'revoked' ? 'line-through text-slate-500' : ''}`}>
                                                            {decision.title}
                                                        </h4>
                                                        <p className="text-slate-600 text-sm mt-2 whitespace-pre-wrap leading-relaxed">{decision.description}</p>
                                                        
                                                        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                                                            <div>
                                                                <span className="text-slate-400 block mb-0.5 text-[10px] uppercase font-bold tracking-wider">Confirmed By</span>
                                                                <span className="font-medium text-slate-700">{decision.confirmingParty || '—'}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-slate-400 block mb-0.5 text-[10px] uppercase font-bold tracking-wider">Cost Impact</span>
                                                                <span className={decision.impactCost && decision.impactCost.toLowerCase() !== 'none' ? 'text-rose-600 font-bold' : 'font-medium text-slate-600'}>{decision.impactCost || 'None'}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-slate-400 block mb-0.5 text-[10px] uppercase font-bold tracking-wider">Timeline Impact</span>
                                                                <span className={decision.impactSchedule && decision.impactSchedule.toLowerCase() !== 'none' ? 'text-amber-600 font-bold' : 'font-medium text-slate-600'}>{decision.impactSchedule || 'None'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {activeTab === 'scope' && (
                            <motion.div
                                key="scope"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-8"
                            >
                                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h2 className="text-2xl font-bold text-indigo-950 mb-2">Scope & Variations</h2>
                                        <p className="text-slate-500">Review your active Bill of Quantities and track any changes to the project scope.</p>
                                        
                                        {operativeBoq && (
                                            <div className="mt-3 inline-flex bg-blue-50 border border-blue-200 text-blue-800 text-[10px] uppercase font-bold py-1 px-3 rounded shadow-sm items-center space-x-1">
                                                <span>Operative BOQ v{operativeBoq.versionNumber} &middot; {operativeBoq.changeOrderRef ? `incorporating ${operativeBoq.revisionSummary}` : 'Baseline'} &middot; issued {new Date(operativeBoq.issuedAt).toLocaleDateString()}</span>
                                            </div>
                                        )}
                                        {(!operativeBoq && projectData.context.contractSignoff?.status === 'signed') && (
                                            <div className="mt-3 inline-flex bg-amber-50 border border-amber-300 text-amber-800 text-[10px] uppercase font-bold py-1 px-3 rounded shadow-sm items-center space-x-1">
                                                <span>Working copy has unversioned changes — not visible to client</span>
                                            </div>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => setShowGlossary(!showGlossary)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${
                                            showGlossary 
                                                ? 'bg-indigo-950 text-white shadow-indigo-950/20' 
                                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                                        }`}
                                    >
                                        <BookOpen className="w-4 h-4" />
                                        {showGlossary ? 'Hide BOQ Glossary' : 'What does this mean?'}
                                    </button>
                                </div>

                                {/* Glossary Inline Panel */}
                                <AnimatePresence>
                                    {showGlossary && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0, scale: 0.98 }}
                                            animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                            exit={{ opacity: 0, height: 0, scale: 0.98 }}
                                            className="overflow-hidden mb-8"
                                        >
                                            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-3xl p-6 md:p-8 shadow-sm">
                                                <div className="flex items-center gap-3 mb-6 border-b border-indigo-200/50 pb-4">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                                        <HelpCircle className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-lg font-bold text-indigo-900">Material & Terms Glossary</h3>
                                                        <p className="text-sm text-indigo-700/70">Understand exactly what goes into your custom interiors.</p>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {[
                                                        { term: 'Carcass', def: 'The internal structural box of a cabinet or wardrobe, usually made of HDHMR or Plywood. It\'s the skeleton of the furniture.' },
                                                        { term: 'HDHMR', def: 'High-Density High Moisture Resistance board. A manufactured wood product that is highly durable, water-resistant, and perfect for modular furniture.' },
                                                        { term: 'Laminate', def: 'A decorative and protective surface sheet glued to the core board (like plywood or HDHMR) to provide color, texture, and durability. Measured in mm (e.g., 1mm).' },
                                                        { term: 'PU Finish', def: 'Polyurethane finish. A premium liquid coating sprayed onto furniture surfaces (usually MDF/HDHMR) yielding a seamless, luxurious, and highly durable matte or gloss look.' },
                                                        { term: 'Edge Banding', def: 'A thin strip of material (usually PVC) attached to the exposed raw edges of cut wood boards to seal them and give a finished look.' },
                                                        { term: 'Skirting', def: 'The baseboard or wooden trim that runs along the bottom of walls or cabinets, protecting it from kicks and mopping water.' },
                                                    ].map((item, i) => (
                                                        <div key={i} className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-indigo-100 shadow-sm hover:shadow-md transition-shadow">
                                                            <h4 className="font-bold text-indigo-900 text-sm mb-1">{item.term}</h4>
                                                            <p className="text-slate-600 text-xs leading-relaxed">{item.def}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* BOQ Change Log / Revisions History */}
                                {boqRevisions && boqRevisions.length > 0 && (
                                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-8">
                                        <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50">
                                            <h3 className="text-lg font-bold text-indigo-950">Change Log / BOQ Revisions</h3>
                                            <p className="text-slate-500 text-sm mt-1">History of approved changes made to your original BOQ.</p>
                                        </div>
                                        <div className="p-6 md:p-8 space-y-4">
                                            {boqRevisions.map(action => (
                                                <div key={action.id} className="flex gap-4 items-start p-4 bg-slate-50 rounded-xl border border-slate-200">
                                                    <div className={`p-2 rounded-lg shrink-0 ${
                                                        action.type === 'ADD' ? 'bg-emerald-100 text-emerald-700' :
                                                        action.type === 'REMOVE' ? 'bg-red-100 text-red-700' :
                                                        'bg-amber-100 text-amber-700'
                                                    }`}>
                                                        {action.type === 'ADD' && <PlusCircle className="w-5 h-5" />}
                                                        {action.type === 'REMOVE' && <MinusCircle className="w-5 h-5" />}
                                                        {(action.type === 'REPLACE' || action.type === 'REVISE_QTY' || action.type === 'REVISE_RATE' || action.type === 'MARK_VENDOR' || action.type === 'MARK_PENDING') && <FileEdit className="w-5 h-5" />}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-1">
                                                            <h4 className="font-bold text-indigo-950">
                                                                {action.type === 'ADD' && 'Item Added'}
                                                                {action.type === 'REMOVE' && 'Item Removed'}
                                                                {action.type === 'REPLACE' && 'Item Replaced'}
                                                                {action.type === 'REVISE_QTY' && 'Quantity Revised'}
                                                                {action.type === 'REVISE_RATE' && 'Rate Revised'}
                                                                {action.type === 'MARK_VENDOR' && 'Marked Vendor Direct'}
                                                                {action.type === 'MARK_PENDING' && 'Marked Pending Decision'}
                                                                <span className="text-slate-500 font-normal ml-2">in {action.section}</span>
                                                            </h4>
                                                            <span className="text-xs text-slate-400 font-medium">
                                                                {new Date(action.timestamp).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm font-medium text-slate-700 mb-2">{action.item}</p>
                                                        
                                                        {/* Details based on action type */}
                                                        {action.type === 'REVISE_QTY' && (
                                                            <div className="flex items-center gap-3 text-sm">
                                                                <span className="text-slate-500 line-through">Qty {action.oldValue}</span>
                                                                <ArrowRightIcon className="w-3 h-3 text-slate-400" />
                                                                <span className="font-bold text-amber-600">Qty {action.newValue}</span>
                                                            </div>
                                                        )}
                                                        {action.type === 'REVISE_RATE' && (
                                                            <div className="flex items-center gap-3 text-sm">
                                                                <span className="text-slate-500 line-through">₹{action.oldValue?.toLocaleString()}</span>
                                                                <ArrowRightIcon className="w-3 h-3 text-slate-400" />
                                                                <span className="font-bold text-amber-600">₹{action.newValue?.toLocaleString()}</span>
                                                            </div>
                                                        )}
                                                        {action.type === 'REPLACE' && (
                                                            <div className="flex flex-col gap-1 text-sm bg-white p-3 rounded-md border border-slate-200 mt-2">
                                                                <div className="flex justify-between text-slate-500">
                                                                    <span>Replaced with: <span className="font-medium text-slate-700">{action.newValue?.item}</span></span>
                                                                    <span className="font-medium">₹{action.newValue?.rate?.toLocaleString()}</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {action.type === 'ADD' && (
                                                            <div className="flex justify-between items-center gap-4 text-sm bg-white p-3 rounded-md border border-slate-200 mt-2">
                                                                <span>Qty {action.newValue?.qty} {action.newValue?.unit}</span>
                                                                <span className="font-bold text-emerald-600">₹{((action.newValue?.rate || 0) * (action.newValue?.qty || 1)).toLocaleString()}</span>
                                                            </div>
                                                        )}
                                                        
                                                        {/* Note */}
                                                        {action.note && (
                                                            <p className="text-sm text-slate-500 mt-3 pt-3 border-t border-slate-200">
                                                                <span className="font-medium text-slate-700">Reason: </span> {action.note}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Active Scope Summary */}
                                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-indigo-950">Active BOQ Summary</h3>
                                            <p className="text-slate-500 text-sm mt-1">Current approved scope of work.</p>
                                        </div>
                                        {activeTier && (
                                            <div className="text-left md:text-right bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 shadow-sm">
                                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Active BOQ Value</p>
                                                <p className="text-2xl font-bold text-indigo-950">₹{rawExecutionTotal.toLocaleString('en-IN')}</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-6 md:p-8 bg-slate-50/50">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {Object.entries(boqByCategory).map(([category, items]: [string, any[]]) => {
                                                const categoryTotal = items.reduce((sum, item) => sum + item.total, 0);
                                                const percentage = rawExecutionTotal > 0 ? (categoryTotal / rawExecutionTotal) * 100 : 0;
                                                return (
                                                    <div key={`summary-${category}`} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                                        <p className="text-xs font-medium text-slate-500 mb-1 truncate uppercase tracking-wider" title={category}>{category}</p>
                                                        <p className="text-lg font-bold text-indigo-950">₹{categoryTotal.toLocaleString('en-IN')}</p>
                                                        <p className="text-xs text-slate-400 mt-1">{percentage.toFixed(1)}% of total</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Detailed BOQ View */}
                                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center">
                                        <div>
                                            <h3 className="text-lg font-bold text-indigo-950">Detailed Bill of Quantities</h3>
                                            <p className="text-slate-500 text-sm mt-1">Itemized breakdown of your active scope.</p>
                                        </div>
                                        <button className="flex items-center gap-2 text-sm font-medium text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors">
                                            <FileText className="w-4 h-4" />
                                            Download PDF
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left border-collapse">
                                            <thead className="text-xs text-slate-500 bg-slate-50/80 uppercase tracking-wider border-b border-slate-200">
                                                <tr>
                                                    <th className="px-4 py-4 font-semibold w-16 text-center">#</th>
                                                    <th className="px-4 py-4 font-semibold">Item & Description</th>
                                                    <th className="px-4 py-4 font-semibold w-24 text-center">UOM</th>
                                                    <th className="px-4 py-4 font-semibold w-24 text-center">Qty</th>
                                                    <th className="px-4 py-4 font-semibold w-32 text-right">Rate</th>
                                                    <th className="px-4 py-4 font-semibold w-36 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    let srNo = 1;
                                                    return Object.entries(boqByCategory).map(([category, items]: [string, any[]]) => {
                                                        const categoryTotal = items.reduce((sum, item) => sum + item.total, 0);
                                                        return (
                                                            <React.Fragment key={`cat-${category}`}>
                                                                {/* Category Header */}
                                                                <tr className="bg-slate-50/50 border-b border-slate-200 group">
                                                                    <td className="px-4 py-3"></td>
                                                                    <td colSpan={4} className="px-4 py-3 font-bold text-indigo-900 flex items-center gap-2 uppercase tracking-wide">
                                                                        <div className="w-1.5 h-4 bg-indigo-500 rounded-full"></div>
                                                                        {category}
                                                                    </td>
                                                                    <td className="px-4 py-3 font-bold text-indigo-950 text-right">
                                                                        ₹{categoryTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                                    </td>
                                                                </tr>
                                                                {/* Category Items */}
                                                                {items.map((item, idx) => {
                                                                    const currentSrNo = srNo++;
                                                                    return (
                                                                        <tr key={`item-${idx}`} className={`border-b transition-colors ${
                                                                            item.status === 'Added' ? 'bg-emerald-50/50 border-emerald-100 hover:bg-emerald-50' :
                                                                            item.status === 'Revised' || item.status === 'Replaced' ? 'bg-amber-50/30 border-amber-100 hover:bg-amber-50/60' :
                                                                            'border-slate-100 hover:bg-slate-50/50'
                                                                        }`}>
                                                                            <td className="px-4 py-4 text-center text-slate-400 text-xs">{currentSrNo}</td>
                                                                            <td className="px-4 py-4">
                                                                                <div className="flex items-center gap-2">
                                                                                    <p className={`font-medium ${item.status === 'Added' ? 'text-emerald-800' : item.status === 'Revised' || item.status === 'Replaced' ? 'text-amber-800' : 'text-indigo-900'}`}>{item.item}</p>
                                                                                    {item.status && item.status !== 'Approved' && (
                                                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                                                                            item.status === 'Added' ? 'bg-emerald-100 text-emerald-700' :
                                                                                            'bg-amber-100 text-amber-700'
                                                                                        }`}>
                                                                                            {item.status}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                {(projectData.context.contractContent?.boqItemSpecOverrides?.[item.id] || item.internalSpecs || item.description) && (
                                                                                    <p className="text-xs text-slate-500 mt-1" title={projectData.context.contractContent?.boqItemSpecOverrides?.[item.id] || item.internalSpecs || item.description}>
                                                                                        {projectData.context.contractContent?.boqItemSpecOverrides?.[item.id] || item.internalSpecs || item.description}
                                                                                    </p>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-4 py-4 text-slate-600 text-center text-xs font-medium bg-slate-50/50">{item.unit}</td>
                                                                            <td className="px-4 py-4 text-center font-medium text-slate-700">{item.qty}</td>
                                                                            <td className="px-4 py-4 text-right text-slate-600">₹{(item.rate || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                                                            <td className="px-4 py-4 text-right font-bold text-indigo-900">₹{item.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </React.Fragment>
                                                        );
                                                    });
                                                })()}
                                                
                                                {/* Summary Rows */}
                                                {(() => {
                                                    const executionTotal = rawExecutionTotal;
                                                    const designFee = rawDesignFee;
                                                    const totalExclGst = executionTotal + designFee;
                                                    const gstRate = projectData.context.gstRate || 18;
                                                    const executionGst = executionGstEnabled ? executionTotal * (gstRate / 100) : 0;
                                                    const designGst = designFee * (gstRate / 100);
                                                    const grandTotal = totalExclGst + executionGst + designGst;

                                                    return (
                                                        <>
                                                            <tr className="border-b border-slate-100">
                                                                <td colSpan={5} className="px-4 py-4 font-medium text-slate-600 text-right">
                                                                    Execution Cost (Excl. Loose Furniture)
                                                                </td>
                                                                <td className="px-4 py-4 font-bold text-indigo-950 text-right">
                                                                    ₹{executionTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                                </td>
                                                            </tr>
                                                            <tr className="border-b border-slate-100">
                                                                <td colSpan={5} className="px-4 py-4 font-medium text-slate-600 text-right">
                                                                    Interior Design Fee {(!projectData.context.designFeeType || projectData.context.designFeeType === 'percentage') ? `(${projectData.context.designFee || 8}%)` : (projectData.context.designFeeType === 'fixed_sqft' ? `(Flat Rate: ₹${projectData.context.designFee}/sqft)` : `(Lumpsum)`)}
                                                                </td>
                                                                <td className="px-4 py-4 font-bold text-indigo-950 text-right">
                                                                    ₹{designFee.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                                </td>
                                                            </tr>
                                                            <tr className="bg-slate-50 border-b border-slate-200">
                                                                <td colSpan={5} className="px-4 py-4 font-bold text-indigo-900 text-right">
                                                                    Total Project Cost (Excl. GST)
                                                                </td>
                                                                <td className="px-4 py-4 font-bold text-indigo-950 text-right">
                                                                    ₹{totalExclGst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                                </td>
                                                            </tr>
                                                            <tr className="border-b border-slate-100">
                                                                <td colSpan={5} className="px-4 py-3 font-medium text-slate-500 text-right text-sm">
                                                                    {gstRate}% GST on Execution
                                                                    <div className="text-[10px] text-slate-400 mt-1">GST on execution can be adjusted in case of alternate payment method. (Admin charges of 1% of Total execution cost are applicable)</div>
                                                                </td>
                                                                <td className="px-4 py-3 font-medium text-slate-600 text-right text-sm">
                                                                    ₹{executionGst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                                </td>
                                                            </tr>
                                                            <tr className="border-b border-slate-200">
                                                                <td colSpan={5} className="px-4 py-3 font-medium text-slate-500 text-right text-sm">
                                                                    {gstRate}% GST on Design
                                                                </td>
                                                                <td className="px-4 py-3 font-medium text-slate-600 text-right text-sm">
                                                                    ₹{designGst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                                </td>
                                                            </tr>
                                                            <tr className="bg-indigo-50 border-b border-indigo-100">
                                                                <td colSpan={5} className="px-4 py-5 font-bold text-indigo-900 text-right text-base">
                                                                    Total Project Cost (Incl. GST)
                                                                </td>
                                                                <td className="px-4 py-5 font-bold text-indigo-900 text-right text-base">
                                                                    ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                                </td>
                                                            </tr>
                                                        </>
                                                    );
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Variations Journey */}
                                {displayUpdates.length > 0 ? (
                                    <div>
                                        <h3 className="text-lg font-bold text-indigo-950 mb-6">Scope Variations Journey</h3>
                                        <div className="relative pl-6 md:pl-8 border-l-2 border-slate-100 space-y-10">
                                            {/* Base Contract */}
                                            <div className="relative">
                                                <div className="absolute -left-[35px] md:-left-[43px] top-1 w-6 h-6 rounded-full bg-slate-200 border-4 border-white flex items-center justify-center">
                                                    <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                                                </div>
                                                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded border border-slate-100">Project Kickoff</span>
                                                        <span className="text-lg font-bold text-indigo-950">₹{baseProjectValue.toLocaleString('en-IN')}</span>
                                                    </div>
                                                    <h4 className="font-bold text-indigo-900 text-base">Base Contract</h4>
                                                    <p className="text-sm text-slate-500 mt-1">The original approved scope of work.</p>
                                                </div>
                                            </div>

                                            {/* Updates */}
                                            {displayUpdates.map((update, index) => {
                                            const runningTotal = update.netImpact; // Simplified for display, ideally calculate running total
                                            return (
                                                <div key={update.id} className="relative">
                                                    <div className={`absolute -left-[35px] md:-left-[43px] top-1 w-6 h-6 rounded-full border-4 border-white flex items-center justify-center ${
                                                        update.status === 'approved' ? 'bg-emerald-100' :
                                                        update.status === 'pending_approval' ? 'bg-amber-100' :
                                                        'bg-slate-100'
                                                    }`}>
                                                        <div className={`w-2 h-2 rounded-full ${
                                                            update.status === 'approved' ? 'bg-emerald-500' :
                                                            update.status === 'pending_approval' ? 'bg-amber-500' :
                                                            'bg-slate-400'
                                                        }`}></div>
                                                    </div>
                                                    
                                                    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm ${
                                                        update.status === 'pending_approval' ? 'border-amber-200' : 'border-slate-200'
                                                    }`}>
                                                        <div className={`p-5 border-b flex justify-between items-start gap-4 ${
                                                            update.status === 'pending_approval' ? 'bg-amber-50/30' : 'bg-slate-50/50'
                                                        }`}>
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                                        update.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                                                        update.status === 'rejected' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                                                        'bg-amber-50 text-amber-700 border border-amber-100'
                                                                    }`}>
                                                                        {(update.status || '').replace(/_/g, ' ')}
                                                                    </span>
                                                                    <span className="text-xs font-medium text-slate-400">{update.date}</span>
                                                                </div>
                                                                <h4 className="font-bold text-indigo-900 text-base">{update.title}</h4>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-0.5">Net Impact</span>
                                                                <span className={`font-bold ${update.netImpact > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                                    {update.netImpact > 0 ? '+' : ''}₹{update.netImpact.toLocaleString('en-IN')}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="p-5">
                                                            {update.changes && update.changes.length > 0 && (
                                                                <div className="space-y-3">
                                                                    {update.changes.map((change: any, idx: number) => (
                                                                        <div key={idx} className="text-sm">
                                                                            <div className="flex justify-between font-medium text-indigo-900 mb-1">
                                                                                <span>{change.itemName}</span>
                                                                                <span className={change.delta > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                                                                                    {change.delta > 0 ? '+' : ''}₹{change.delta.toLocaleString('en-IN')}
                                                                                </span>
                                                                            </div>
                                                                            <p className="text-slate-500 text-xs">{change.rationale}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {update.status === 'pending_approval' && (
                                                                <div className="mt-5 pt-5 border-t border-slate-100 flex justify-end">
                                                                    <button 
                                                                        onClick={() => handleApproveUpdate(update.id)}
                                                                        className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                                                                    >
                                                                        Approve Variation
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center mt-8">
                                        <div className="w-12 h-12 bg-white text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                                            <ClipboardList className="w-6 h-6" />
                                        </div>
                                        <h3 className="text-lg font-bold text-indigo-950 mb-1">No Scope Variations</h3>
                                        <p className="text-slate-500 text-sm max-w-md mx-auto">Your project is currently running exactly on the original approved base contract. Any future changes to the scope will be tracked here.</p>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    
                    {/* Support Block & Footer */}
                    <div className="mt-16 pt-10 border-t border-slate-200 text-center">
                        <div className="bg-slate-100/50 rounded-2xl p-6 md:p-8 max-w-2xl mx-auto border border-slate-200 mb-10 inline-block w-full">
                            <h3 className="text-lg font-bold text-indigo-900 mb-2">Need Help?</h3>
                            <p className="text-slate-500 mb-6 text-sm">Have a question about your project? We're here to assist you.</p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                {settings?.clientPortalConfig?.supportContact && (
                                    <a href={`https://wa.me/${(settings?.clientPortalConfig?.supportContact || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-6 py-3 bg-[#25D366] hover:bg-[#1DA851] text-white font-medium rounded-xl transition-all shadow-sm w-full sm:w-auto">
                                        WhatsApp Us
                                    </a>
                                )}
                                {settings?.email && (
                                    <a href={`mailto:${settings.email}`} className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-all shadow-sm w-full sm:w-auto">
                                        <Mail className="w-4 h-4" /> Email Us
                                    </a>
                                )}
                            </div>
                        </div>

                        <footer className="pb-8">
                            <p className="text-sm font-medium text-slate-400">
                                {settings?.companyName || orgData.orgName || 'Studio'} &middot; {settings?.tagline || 'Your Design Partner'}
                            </p>
                        </footer>
                    </div>
                </div>
            </main>
        </div>
    );
}
