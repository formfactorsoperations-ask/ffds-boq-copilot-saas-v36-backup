
import React, { useState, useMemo, useEffect } from 'react';
import { FullProjectData, ProjectStatus } from '../types';
import Card from './shared/Card';
import { BuildingOfficeIcon, PlusIcon, NewFileIcon, DeleteIcon } from './Icons';
import { formatClientValue, timeAgo, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Info } from 'lucide-react';
import { ProjectPaymentBadge } from './PaymentHealth';
import { ClockIcon } from './Icons';
import { fetchPaymentHealthScore, PaymentHealth } from '../hooks/usePaymentHealthScore';
import { CashFlowSummaryWidget, CashFlowForecastDashboard } from './CashFlowForecastDashboard';
import { useOrg } from '../contexts/OrgContext';
import { useMomActions } from '../hooks/useMomActions';

interface ProjectListTabProps {
    projects: FullProjectData[];
    activeProjectId: string | null;
    onOpenProject: (project: FullProjectData) => void;
    onCreateNew: () => void;
    onDeleteProject: (id: string) => void;
    onDuplicateProject: (project: FullProjectData) => void;
    onQuickUpdate?: (projectId: string, field: string, value: any) => void;
}

const STATUS_CONFIG: Record<string, { label: string, color: string, bg: string, border: string }> = {
    'lead': { label: 'New Lead', color: 'text-blue-600', bg: 'bg-blue-50/50 backdrop-blur-sm', border: 'border-blue-200/50' },
    'draft': { label: 'Drafting', color: 'text-slate-600', bg: 'bg-slate-100/50 backdrop-blur-sm', border: 'border-slate-200/50' },
    'proposal_sent': { label: 'Proposal Sent', color: 'text-indigo-600', bg: 'bg-indigo-50/50 backdrop-blur-sm', border: 'border-indigo-200/50' },
    'negotiation': { label: 'Negotiation', color: 'text-amber-600', bg: 'bg-amber-50/50 backdrop-blur-sm', border: 'border-amber-200/50' },
    'won': { label: 'Won', color: 'text-emerald-600', bg: 'bg-emerald-50/50 backdrop-blur-sm', border: 'border-emerald-200/50' },
    'execution': { label: 'Execution', color: 'text-purple-600', bg: 'bg-purple-50/50 backdrop-blur-sm', border: 'border-purple-200/50' },
    'work_paused': { label: 'Work Paused 🔴', color: 'text-rose-700', bg: 'bg-rose-100 backdrop-blur-sm', border: 'border-rose-300' },
    'completed': { label: 'Completed', color: 'text-teal-600', bg: 'bg-teal-50/50 backdrop-blur-sm', border: 'border-teal-200/50' },
    'lost': { label: 'Lost', color: 'text-red-400', bg: 'bg-red-50/50 backdrop-blur-sm', border: 'border-red-100/50' },
};

// --- Exciting Feature Components ---
const AnimatedRing = ({ progress, colorClass, size = 60, strokeWidth = 4 }: { progress: number, colorClass: string, size?: number, strokeWidth?: number }) => {
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
                <span className="text-sm font-light tracking-tighter text-slate-800">{progress}<span className="text-[8px]">%</span></span>
            </div>
        </div>
    );
};

const ProjectListTab: React.FC<ProjectListTabProps> = ({ projects, activeProjectId, onOpenProject, onCreateNew, onDeleteProject, onDuplicateProject, onQuickUpdate }) => {
    const { orgData } = useOrg();
    const siteSupervisors = orgData?.team?.filter(m => m.role === 'Site Supervisor') || [];
    const [viewMode, setViewMode] = useState<'grid' | 'compare'>('grid');
    const { openActions, overdueActions } = useMomActions(undefined, orgData?.tenantId || 'demo-tenant-01');
    const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
    const [sortBy, setSortBy] = useState<'updated' | 'health'>('updated');
    const [paymentFilter, setPaymentFilter] = useState<'all' | 'overdue' | 'at_risk'>('all');
    const [focusMode, setFocusMode] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'projects' | 'intelligence' | 'analytics'>('projects');
    const [healthScores, setHealthScores] = useState<Record<string, PaymentHealth>>({});

    useEffect(() => {
        if (!orgData?.tenantId) return;
        const fetchAll = async () => {
            const results = await Promise.all(
                projects.map(p => fetchPaymentHealthScore(p.id, orgData.tenantId!).then(h => ({ id: p.id, health: h })))
            );
            const newScores: Record<string, PaymentHealth> = {};
            results.forEach(r => newScores[r.id] = r.health);
            setHealthScores(newScores);
        };
        fetchAll();
    }, [projects, orgData?.tenantId]);

    const paymentAggregate = useMemo(() => {
        let overdueProjects = 0;
        let atRiskProjects = 0;
        let healthyProjects = 0;
        let totalOutstanding = 0;

        Object.values(healthScores).forEach((h: PaymentHealth) => {
            if (h.healthStatus === 'red') overdueProjects++;
            else if (h.healthStatus === 'amber') atRiskProjects++;
            else if (h.healthStatus === 'green' || h.healthStatus === 'fully_paid') healthyProjects++;
            totalOutstanding += h.outstandingAmount || 0;
        });

        return { overdueProjects, atRiskProjects, healthyProjects, totalOutstanding };
    }, [healthScores]);

    // Calculate Extended Metrics helper
    const getProjectMetrics = (p: FullProjectData) => {
        const tiers = p.tiers || [];
        const context = p.context || {} as any;
        const approvedTier = tiers.find(t => t.id === context.approvedTierId);
        
        let value = 0;
        let isRange = false;
        let designFee = 0;
        let margin = 0;
        let profit = 0;
        let sortValue = 0;

        const activeTier = approvedTier || tiers.find(t => t.id === p.activeTierId) || tiers[0];

        if (activeTier) {
            // Locked / Approved State
            const originalExecutionTotal = activeTier.summary?.totalSell || 0;
            const originalDesignFee = activeTier.summary?.designFee || 0;
            
            const rawExecutionTotal = context.financials?.approvedExecutionValue ?? originalExecutionTotal;
            const rawDesignFee = context.financials?.approvedDesignValue ?? originalDesignFee;
            
            const discounts = context.financials?.discounts || [];
            
            const calculateDiscountValue = (base: number, target: 'execution' | 'design') => {
                const targetDiscounts = discounts.filter((d: any) => d.target === target);
                let totalDeduction = 0;
                targetDiscounts.forEach((d: any) => {
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
            
            const netExecution = Math.max(0, rawExecutionTotal - executionDiscountVal);
            const netDesign = Math.max(0, rawDesignFee - designDiscountVal);

            value = netExecution + netDesign;
            sortValue = value;
            designFee = netDesign;
            
            const executionMarginPercent = activeTier.summary?.blendedGm !== undefined ? activeTier.summary.blendedGm : (activeTier.summary?.totalGm || 0);
            profit = netExecution * (executionMarginPercent / 100) + netDesign; // Assuming design fee is 100% margin
            margin = value > 0 ? (profit / value) * 100 : 0;
        } else if (tiers.length > 0) {
            // Range State
            isRange = true;
            const revenues = tiers.map(t => t.summary?.totalRevenue || t.summary?.totalSell || 0);
            sortValue = revenues.reduce((a, b) => a + b, 0) / (revenues.length || 1);
            value = sortValue;
        }
        
        let status: ProjectStatus = context.status || 'draft';
        if (!context.status) {
            if (p.activeProject) status = 'execution';
            else if (tiers.length > 0 && ((tiers[0].boq?.length || 0) > 0)) status = 'proposal_sent';
            else status = 'draft';
        }

        const durationMonths = (p.timeline || []).length > 0 
            ? Math.ceil(p.timeline.reduce((acc: number, ph: any) => acc + (ph.durationDays || 0), 0) / 30) 
            : 3;
        
        const profitPerMonth = durationMonths > 0 ? profit / durationMonths : 0;
        const itemCount = activeTier ? (activeTier.boq?.length || 0) : (tiers[0]?.boq?.length || 0);
        const clientScore = p.leadProfile?.leadLensFitScore || 50;

        const executionDecisions = (p.activeProject?.executionData?.decisions || []).filter((d: any) => !d.resolved).length;
        const executionBlockers = (p.activeProject?.executionData?.blockers || []).filter((b: any) => !b.resolved).length;
        const riskScore = (executionBlockers * 20) + (executionDecisions * 10);

        return { 
            value, 
            sortValue,
            isRange,
            designFee,
            profit, 
            status,
            gmPercent: margin,
            durationMonths,
            profitPerMonth,
            itemCount,
            clientScore,
            area: context.area || 0,
            executionDecisions,
            executionBlockers,
            riskScore
        };
    };

    const pipelineStats = useMemo(() => {
        let pipelineValue = 0;
        let bookedValue = 0;
        let activeLeads = 0;
        let activeProjectsCount = 0;
        let conversionCount = 0;
        let totalClosed = 0;
        let totalBookedProfit = 0;
        
        // Operational Insights
        let executionLoad = 0;
        let pendingDecisions = 0;
        let totalDurationMonths = 0;
        let projectedMonthlyProfit = 0;
        let totalDesignFeeBooked = 0;
        let activeBookedValue = 0;

        projects.forEach(p => {
            const m = getProjectMetrics(p);
            if (['draft', 'proposal_sent', 'negotiation'].includes(m.status)) {
                pipelineValue += m.sortValue;
                activeLeads++;
                if (['proposal_sent', 'negotiation'].includes(m.status)) {
                    pendingDecisions++;
                }
            }
            if (['won', 'execution', 'completed'].includes(m.status)) {
                bookedValue += m.sortValue; 
                conversionCount++;
                totalClosed++;
                totalBookedProfit += m.profit;
                if (['won', 'execution'].includes(m.status)) {
                    activeProjectsCount++;
                    executionLoad++;
                    totalDurationMonths += m.durationMonths;
                    projectedMonthlyProfit += m.profitPerMonth;
                    totalDesignFeeBooked += m.designFee;
                    activeBookedValue += m.sortValue;
                }
            }
            if (m.status === 'lost') {
                totalClosed++;
            }
        });

        const conversionRate = totalClosed > 0 ? (conversionCount / totalClosed) * 100 : 0;
        const avgMargin = bookedValue > 0 ? (totalBookedProfit / bookedValue) * 100 : 0;
        const avgDealSize = conversionCount > 0 ? bookedValue / conversionCount : 0;
        const avgDuration = executionLoad > 0 ? totalDurationMonths / executionLoad : 0;
        
        // Fresh Insights
        const designFeeYield = activeBookedValue > 0 ? (totalDesignFeeBooked / activeBookedValue) * 100 : 0;
        const revenueVelocity = avgDuration > 0 ? activeBookedValue / avgDuration : 0;
        const projectedPipelineYield = pipelineValue * (conversionRate / 100);

        // Trends
        const now = Date.now();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        const sixtyDays = 60 * 24 * 60 * 60 * 1000;
        const oneTwentyDays = 120 * 24 * 60 * 60 * 1000;

        const getStatsForBucket = (bucketProjects: FullProjectData[]) => {
            let pValue = 0, bValue = 0, aLeads = 0, cCount = 0, tClosed = 0, tProfit = 0;
            bucketProjects.forEach(p => {
                const m = getProjectMetrics(p);
                if (['draft', 'proposal_sent', 'negotiation'].includes(m.status)) { pValue += m.sortValue; aLeads++; }
                if (['won', 'execution', 'completed'].includes(m.status)) { bValue += m.sortValue; cCount++; tClosed++; tProfit += m.profit; }
                if (m.status === 'lost') { tClosed++; }
            });
            const cRate = tClosed > 0 ? (cCount / tClosed) * 100 : 0;
            const aMargin = bValue > 0 ? (tProfit / bValue) * 100 : 0;
            const aDealSize = cCount > 0 ? bValue / cCount : 0;
            return { pipelineValue: pValue, bookedValue: bValue, activeLeads: aLeads, conversionRate: cRate, avgMargin: aMargin, avgDealSize: aDealSize, totalValue: pValue + bValue };
        };

        const recentProjects = projects.filter(p => now - p.lastModified <= thirtyDays);
        const previousProjects = projects.filter(p => p.lastModified < now - thirtyDays && p.lastModified >= now - sixtyDays);
        
        const recentStats = getStatsForBucket(recentProjects);
        const previousStats = getStatsForBucket(previousProjects);

        const recentWinProjects = projects.filter(p => now - p.lastModified <= sixtyDays);
        const previousWinProjects = projects.filter(p => p.lastModified < now - sixtyDays && p.lastModified >= now - oneTwentyDays);

        const recentWinStats = getStatsForBucket(recentWinProjects);
        const previousWinStats = getStatsForBucket(previousWinProjects);

        const calculateTrend = (current: number, previous: number, sufficientData: boolean) => {
            if (!sufficientData) return { label: "Not enough data", color: "text-slate-400" };
            if (previous === 0) return { label: "→ Stable", color: "text-slate-400" };
            const pctChange = Math.round(((current - previous) / previous) * 100);
            if (pctChange > 2) return { label: `↑ +${pctChange}% vs last month`, color: "text-emerald-600" };
            if (pctChange < -2) return { label: `↓ ${pctChange}% vs last month`, color: "text-red-500" };
            return { label: "→ Stable", color: "text-slate-400" };
        };

        const hasEnoughData = (recentCount: number, prevCount: number) => recentCount >= 3 && prevCount >= 3;
        
        const trends = {
            pipelineValue: calculateTrend(recentStats.pipelineValue, previousStats.pipelineValue, hasEnoughData(recentProjects.length, previousProjects.length)),
            bookedValue: calculateTrend(recentStats.bookedValue, previousStats.bookedValue, hasEnoughData(recentProjects.length, previousProjects.length)),
            avgDealSize: calculateTrend(recentStats.avgDealSize, previousStats.avgDealSize, hasEnoughData(recentProjects.length, previousProjects.length)),
            avgMargin: calculateTrend(recentStats.avgMargin, previousStats.avgMargin, hasEnoughData(recentProjects.length, previousProjects.length)),
            conversionRate: calculateTrend(recentWinStats.conversionRate, previousWinStats.conversionRate, hasEnoughData(recentWinProjects.length, previousWinProjects.length)),
            totalValue: calculateTrend(recentStats.totalValue, previousStats.totalValue, hasEnoughData(recentProjects.length, previousProjects.length))
        };

        return { 
            pipelineValue, bookedValue, activeLeads, activeProjectsCount, conversionRate, avgMargin, avgDealSize,
            executionLoad, pendingDecisions, avgDuration, projectedMonthlyProfit,
            designFeeYield, revenueVelocity, projectedPipelineYield, trends
        };
    }, [projects]);

    const filteredProjects = useMemo(() => {
        return projects
            .filter(p => {
                const context = p.context || { name: 'Unnamed Project', clientName: '' };
                const searchMatch = (context.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                                    (context.clientName || '').toLowerCase().includes(searchQuery.toLowerCase());
                
                if (!searchMatch) return false;

                const m = getProjectMetrics(p);
                
                // Show failed hydration projects regardless of filters
                if ((p as any)._failedHydration) return true;
                
                if (focusMode && m.riskScore === 0) return false;

                if (statusFilter !== 'all' && m.status !== statusFilter) return false;

                if (paymentFilter !== 'all') {
                    const h = healthScores[p.id];
                    if (!h) return false;
                    if (paymentFilter === 'overdue' && h.healthStatus !== 'red') return false;
                    if (paymentFilter === 'at_risk' && h.healthStatus !== 'amber') return false;
                }

                return true;
            })
            .sort((a, b) => {
                if (sortBy === 'health') {
                    const ha = healthScores[a.id]?.healthStatus || 'neutral';
                    const hb = healthScores[b.id]?.healthStatus || 'neutral';
                    const weight = { red: 0, amber: 1, green: 2, neutral: 3, fully_paid: 4, unconfigured: 5 };
                    const wa = weight[ha];
                    const wb = weight[hb];
                    if (wa !== wb) return wa - wb;
                }
                return b.lastModified - a.lastModified;
            });
    }, [projects, searchQuery, statusFilter, focusMode, sortBy, paymentFilter, healthScores]);

    const MotionDiv = motion.div as any;

    if (projects.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <div className="bg-indigo-50 p-6 rounded-full mb-6">
                    <BuildingOfficeIcon className="w-16 h-16 text-indigo-400" />
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">No Projects Saved</h2>
                <p className="text-slate-500 max-w-md mb-8">
                    Your studio library is empty. Start a new project to populate your pipeline.
                </p>
                <button 
                    onClick={onCreateNew}
                    className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2"
                >
                    <PlusIcon className="w-5 h-5" /> Start First Project
                </button>
            </div>
        );
    }

    const generateStudioFeed = () => {
        const items: any[] = [];
        const now = Date.now();
        const ONE_DAY = 86400000;

        projects.forEach(p => {
            const projectName = p.context.name || 'Project';
            
            // Selections
            const selections = p.activeProject?.materialSelections || [];
            selections.forEach(s => {
                if (s.status === 'locked' || (s as any).status === 'approved') items.push({ 
                    text: `[${projectName}] ${s.itemName} locked ✓`, 
                    emoji: '🔒', type: 'sof', 
                    timestamp: s.clientConfirmedAt ? new Date(s.clientConfirmedAt).getTime() : now,
                    route: 'materials',
                    project: p
                });
                if (s.status === 'change_requested') items.push({
                    text: `[${projectName}] ${s.itemName} change requested`,
                    emoji: '⚠️', type: 'warning',
                    timestamp: s.changeRequestedAt ? new Date(s.changeRequestedAt).getTime() : now,
                    route: 'materials',
                    project: p
                });
            });

            // Decisions
            const decisions = p.activeProject?.projectDecisions || [];
            decisions.forEach(d => {
                if (d.status === 'confirmed') items.push({
                    text: `[${projectName}] ${d.title} approved`,
                    emoji: '✅', type: 'decision',
                    timestamp: d.date ? new Date(d.date).getTime() : now,
                    route: 'site-ops',
                    project: p
                });
                if (d.status === 'rejected') items.push({
                    text: `[${projectName}] ${d.title} concern raised`,
                    emoji: '⚠️', type: 'warning',
                    timestamp: d.date ? new Date(d.date).getTime() : now,
                    route: 'site-ops',
                    project: p
                });
            });

            // Milestones
            const milestones = p.context.paymentMilestones || [];
            milestones.forEach(m => {
                if (m.status === 'paid') items.push({
                    text: `[${projectName}] ${m.name} payment received`,
                    emoji: '💰', type: 'payment',
                    timestamp: m.date ? new Date(m.date).getTime() : now,
                    route: 'payment-calc',
                    project: p
                });
                const dueDateTimestamp = (m.date || m.invoiceDate) ? new Date(m.date || m.invoiceDate as string).getTime() : undefined;
                if (dueDateTimestamp && m.status !== 'paid') {
                    const daysUntilDue = Math.ceil((dueDateTimestamp - now) / ONE_DAY);
                    if (daysUntilDue <= 7 && daysUntilDue > 0) items.push({
                        text: `[${projectName}] ${m.name} due in ${daysUntilDue} day${daysUntilDue===1?'':'s'}`,
                        emoji: '📅', type: 'alert',
                        timestamp: now - 3600000,
                        route: 'payment-calc',
                        project: p
                    });
                    if (daysUntilDue <= 0) items.push({
                        text: `[${projectName}] ${m.name} payment overdue`,
                        emoji: '🚨', type: 'critical',
                        timestamp: now,
                        route: 'payment-calc',
                        project: p
                    });
                }
            });
        });

        return items.sort((a,b) => b.timestamp - a.timestamp).slice(0, 30);
    };

    const feedItems = generateStudioFeed();

    return (
        <div className="space-y-8 max-w-7xl mx-auto bg-[#F9F9F8] min-h-screen p-4 md:p-8 rounded-[2.5rem]">
            
            {feedItems.length > 0 ? (
                <div className="overflow-hidden whitespace-nowrap bg-[#111] text-white py-3 px-4 rounded-2xl mb-8 flex items-center shadow-lg group relative">
                    <div className="flex items-center gap-2 pr-4 border-r border-white/20 mr-4 shrink-0 bg-[#111] z-10">
                        <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">STUDIO FEED</span>
                    </div>
                    <MotionDiv 
                        className="flex gap-12 text-xs font-medium tracking-wide will-change-transform"
                        animate={{ x: [0, -1500] }}
                        transition={{ repeat: Infinity, duration: 35, ease: "linear" }}
                        style={{ width: "max-content" }}
                    >
                        {feedItems.map((item, idx) => (
                            <span key={`a-${idx}`} className="cursor-pointer hover:text-emerald-400 transition-colors" onClick={() => onOpenProject(item.project)}>
                                {item.emoji} {item.text}
                            </span>
                        ))}
                        {feedItems.map((item, idx) => (
                            <span key={`b-${idx}`} className="cursor-pointer hover:text-emerald-400 transition-colors" onClick={() => onOpenProject(item.project)}>
                                {item.emoji} {item.text}
                            </span>
                        ))}
                    </MotionDiv>
                </div>
            ) : (
                <div className="bg-[#111] text-white py-3 px-4 rounded-2xl mb-8 flex items-center shadow-lg">
                    <div className="flex items-center gap-2 pr-4 border-r border-white/20 mr-4 shrink-0">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">STUDIO FEED</span>
                    </div>
                    <div className="text-xs text-slate-400 font-medium italic">
                        No recent active updates across projects yet.
                    </div>
                </div>
            )}

            {/* TAB BAR */}
            <div className="flex border-b border-slate-200 mb-8 overflow-x-auto items-center">
                <div className="flex gap-6 flex-grow">
                    <button 
                        onClick={() => setActiveTab('projects')} 
                        className={`pb-3 font-semibold text-sm transition-all border-b-2 ${activeTab === 'projects' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}
                    >Projects</button>
                    <button 
                        onClick={() => setActiveTab('intelligence')}
                        className={`pb-3 font-semibold text-sm transition-all border-b-2 ${activeTab === 'intelligence' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}
                    >Intelligence</button>
                    <button 
                        onClick={() => setActiveTab('analytics')}
                        className={`pb-3 font-semibold text-sm transition-all border-b-2 ${activeTab === 'analytics' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}
                    >Analytics</button>
                </div>
                <button onClick={onCreateNew} className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-black transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 -mt-2 text-sm font-bold">
                    <PlusIcon className="w-4 h-4" /> New Project
                </button>
            </div>

            {activeTab === 'intelligence' && (
                <div className="space-y-8">
                    {/* 1. COMPACT STATS HEADER */}
                    <MotionDiv 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, staggerChildren: 0.1 }}
                        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4"
                    >
                <MotionDiv initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white/60 backdrop-blur-xl p-5 rounded-2xl border border-white/20 shadow-sm flex flex-col justify-center hover:shadow-md transition-all">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Active Pipeline</p>
                    <p className="text-2xl font-light tracking-tighter text-slate-800">{formatClientValue(pipelineStats.pipelineValue)}</p>
                    <p className={`text-[13px] font-medium mt-1 ${pipelineStats.trends.pipelineValue.color}`}>{pipelineStats.trends.pipelineValue.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{pipelineStats.activeLeads} active deals</p>
                </MotionDiv>
                <MotionDiv initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald-50/60 backdrop-blur-xl p-5 rounded-2xl border border-emerald-100/50 shadow-sm flex flex-col justify-center hover:shadow-md transition-all">
                    <p className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-wider mb-1">Booked Revenue</p>
                    <p className="text-2xl font-light tracking-tighter text-emerald-700">{formatClientValue(pipelineStats.bookedValue)}</p>
                    <p className={`text-[13px] font-medium mt-1 ${pipelineStats.trends.bookedValue.color}`}>{pipelineStats.trends.bookedValue.label}</p>
                    <p className="text-[10px] text-emerald-600/70 mt-0.5">{pipelineStats.activeProjectsCount} active projects</p>
                </MotionDiv>
                <MotionDiv initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white/60 backdrop-blur-xl p-5 rounded-2xl border border-white/20 shadow-sm flex flex-col justify-center hover:shadow-md transition-all">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Avg Deal Size</p>
                    <p className="text-2xl font-light tracking-tighter text-blue-600">{formatClientValue(pipelineStats.avgDealSize)}</p>
                    <p className={`text-[13px] font-medium mt-1 ${pipelineStats.trends.avgDealSize.color}`}>{pipelineStats.trends.avgDealSize.label}</p>
                </MotionDiv>
                <MotionDiv initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white/60 backdrop-blur-xl p-5 rounded-2xl border border-white/20 shadow-sm flex flex-col justify-center hover:shadow-md transition-all">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Avg Margin</p>
                    <p className="text-2xl font-light tracking-tighter text-indigo-600">{pipelineStats.avgMargin.toFixed(1)}%</p>
                    <p className={`text-[13px] font-medium mt-1 ${pipelineStats.trends.avgMargin.color}`}>{pipelineStats.trends.avgMargin.label}</p>
                </MotionDiv>
                <MotionDiv initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white/60 backdrop-blur-xl p-5 rounded-2xl border border-white/20 shadow-sm flex flex-col justify-center hover:shadow-md transition-all">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Win Rate</p>
                    <p className="text-2xl font-light tracking-tighter text-purple-600">{pipelineStats.conversionRate.toFixed(0)}%</p>
                    <p className={`text-[13px] font-medium mt-1 ${pipelineStats.trends.conversionRate.color}`}>{pipelineStats.trends.conversionRate.label}</p>
                </MotionDiv>
                <MotionDiv initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-900/5 backdrop-blur-xl p-5 rounded-2xl border border-slate-900/10 shadow-sm flex flex-col justify-center hover:shadow-md transition-all">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Value</p>
                    <p className="text-2xl font-light tracking-tighter text-slate-900">{formatClientValue(pipelineStats.pipelineValue + pipelineStats.bookedValue)}</p>
                    <p className={`text-[13px] font-medium mt-1 ${pipelineStats.trends.totalValue.color}`}>{pipelineStats.trends.totalValue.label}</p>
                </MotionDiv>
            </MotionDiv>

            {/* 1.5 OPERATIONAL & STRATEGIC INSIGHTS */}
            <MotionDiv 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4"
            >
                <div className="md:col-span-2">
                    <CashFlowSummaryWidget onNavigate={() => setActiveTab('analytics')} />
                </div>
                <div className="bg-orange-50/60 backdrop-blur-xl p-5 rounded-2xl border border-orange-100/50 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                    <div>
                        <p className="text-[10px] font-bold text-orange-500/80 uppercase tracking-wider mb-1">Pending Decisions</p>
                        <p className="text-2xl font-light tracking-tighter text-orange-700">{pipelineStats.pendingDecisions} <span className="text-xs font-medium text-orange-500/60">deals</span></p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-orange-100/80 flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform duration-500">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                </div>
                <div className={`backdrop-blur-xl p-5 rounded-2xl border shadow-sm flex items-center justify-between group hover:shadow-md transition-all ${openActions > 0 ? (overdueActions > 0 ? 'bg-red-50/60 border-red-100/50' : 'bg-amber-50/60 border-amber-100/50') : 'bg-blue-50/60 border-blue-100/50'}`}>
                    <div>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${openActions > 0 ? (overdueActions > 0 ? 'text-red-500/80' : 'text-amber-500/80') : 'text-blue-500/80'}`}>Open Actions</p>
                        <p className={`text-2xl font-light tracking-tighter ${openActions > 0 ? (overdueActions > 0 ? 'text-red-700' : 'text-amber-700') : 'text-blue-700'}`}>
                            {openActions} <span className={`text-xs font-medium ${openActions > 0 ? (overdueActions > 0 ? 'text-red-500/60' : 'text-amber-500/60') : 'text-blue-500/60'}`}>total</span>
                        </p>
                    </div>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-500 ${openActions > 0 ? (overdueActions > 0 ? 'bg-red-100/80 text-red-500' : 'bg-amber-100/80 text-amber-500') : 'bg-blue-100/80 text-blue-500'}`}>
                        <ClockIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="bg-emerald-50/60 backdrop-blur-xl p-5 rounded-2xl border border-emerald-100/50 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                    <div>
                        <p className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-wider mb-1">Proj. Monthly Profit</p>
                        <p className="text-2xl font-light tracking-tighter text-emerald-700">{formatClientValue(pipelineStats.projectedMonthlyProfit)}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-emerald-100/80 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform duration-500">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                </div>
            </MotionDiv>

            {/* STRATEGIC INTELLIGENCE (PLUSH INSIGHTS) */}
            <MotionDiv 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-[2rem] border border-slate-700 shadow-xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Revenue Velocity</p>
                            <p className="text-4xl font-light tracking-tighter text-white">{formatClientValue(pipelineStats.revenueVelocity)} <span className="text-sm font-medium text-slate-400">/ mo</span></p>
                            <p className="text-[10px] text-slate-400 mt-2">Pace of execution revenue recognition</p>
                        </div>
                        <AnimatedRing progress={Math.min(100, Math.round((pipelineStats.revenueVelocity / 5000000) * 100))} colorClass="text-emerald-400" size={70} strokeWidth={6} />
                    </div>
                    <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                        <svg className="w-40 h-40 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-indigo-900 to-indigo-800 p-6 rounded-[2rem] border border-indigo-700 shadow-xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-1">Design Fee Yield</p>
                            <p className="text-4xl font-light tracking-tighter text-white">{pipelineStats.designFeeYield.toFixed(1)}%</p>
                            <p className="text-[10px] text-indigo-300 mt-2">Pure design margin on active book</p>
                        </div>
                        <AnimatedRing progress={Math.round(pipelineStats.designFeeYield)} colorClass="text-indigo-400" size={70} strokeWidth={6} />
                    </div>
                    <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                        <svg className="w-40 h-40 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-emerald-900 to-emerald-800 p-6 rounded-[2rem] border border-emerald-700 shadow-xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider mb-1">Risk-Adj Pipeline</p>
                            <p className="text-4xl font-light tracking-tighter text-white">{formatClientValue(pipelineStats.projectedPipelineYield)}</p>
                            <p className="text-[10px] text-emerald-300 mt-2">Expected yield based on {pipelineStats.conversionRate.toFixed(0)}% win rate</p>
                        </div>
                        <AnimatedRing progress={Math.round(pipelineStats.conversionRate)} colorClass="text-emerald-400" size={70} strokeWidth={6} />
                    </div>
                    <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                        <svg className="w-40 h-40 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    </div>
                </div>
            </MotionDiv>
            </div>
            )}

            {activeTab === 'projects' && (
                <div className="space-y-6">
                    {/* 2. TOOLBAR */}
                    <div className="flex flex-col xl:flex-row justify-between items-center gap-4 bg-transparent pt-4 pb-2">
                        <div className="flex flex-wrap gap-2 items-center justify-center bg-white/60 backdrop-blur-xl p-1.5 rounded-2xl md:rounded-full border border-white/20 shadow-sm w-full xl:w-auto">
                            <button onClick={() => setStatusFilter('all')} className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${statusFilter === 'all' ? 'bg-slate-800 text-white shadow-md' : 'bg-transparent text-slate-500 hover:text-slate-800 hover:bg-white/50'}`}>All</button>
                            <button onClick={() => setStatusFilter('draft')} className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${statusFilter === 'draft' ? 'bg-blue-600 text-white shadow-md' : 'bg-transparent text-slate-500 hover:text-slate-800 hover:bg-white/50'}`}>Drafts</button>
                            <button onClick={() => setStatusFilter('proposal_sent')} className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${statusFilter === 'proposal_sent' ? 'bg-indigo-600 text-white shadow-md' : 'bg-transparent text-slate-500 hover:text-slate-800 hover:bg-white/50'}`}>Sent</button>
                            <button onClick={() => setStatusFilter('won')} className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${statusFilter === 'won' ? 'bg-emerald-600 text-white shadow-md' : 'bg-transparent text-slate-500 hover:text-slate-800 hover:bg-white/50'}`}>Won</button>
                            
                            <div className="w-px h-6 bg-slate-200 mx-1"></div>
                            
                            <button 
                                onClick={() => setFocusMode(!focusMode)} 
                                className={`px-5 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${focusMode ? 'bg-red-50 text-red-700 border border-red-200 shadow-inner' : 'bg-transparent text-slate-500 hover:text-slate-800 hover:bg-white/50'}`}
                            >
                                <span className={`w-2 h-2 rounded-full ${focusMode ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`}></span>
                                Focus: At Risk
                                <div title="Projects are flagged At Risk when they have unresolved execution blockers or pending execution decisions.">
                                    <Info className="w-3.5 h-3.5 opacity-70 hover:opacity-100 transition-opacity" />
                                </div>
                            </button>
                        </div>

                        <div className="flex gap-3 w-full md:w-auto">
                            <div className="flex bg-white/60 backdrop-blur-xl border border-white/20 rounded-full px-4 py-1.5 items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sort:</span>
                                <select 
                                    className="bg-transparent text-xs font-bold text-slate-700 outline-none"
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as any)}
                                >
                                    <option value="updated">Last Updated</option>
                                    <option value="health">Payment Health (Needs action first)</option>
                                </select>
                            </div>
                            
                            <div className="flex bg-white/60 backdrop-blur-xl border border-white/20 rounded-full px-4 py-1.5 items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payments:</span>
                                <select 
                                    className="bg-transparent text-xs font-bold text-slate-700 outline-none"
                                    value={paymentFilter}
                                    onChange={(e) => setPaymentFilter(e.target.value as any)}
                                >
                                    <option value="all">All</option>
                                    <option value="at_risk">At Risk</option>
                                    <option value="overdue">Overdue</option>
                                </select>
                            </div>

                            <div className="relative flex-grow md:w-64">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                                <input 
                                    type="text" 
                                    placeholder="Search projects..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-white/60 backdrop-blur-xl border border-white/20 rounded-full text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm h-full"
                                />
                            </div>
                        </div>
                    </div>

            {/* 3. PROJECT GRID */}
            {viewMode === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <AnimatePresence>
                    {filteredProjects.map(project => {
                        const metrics = getProjectMetrics(project);
                        const isActive = activeProjectId === project.id;
                        const lastEdited = timeAgo(project.lastModified);
                        const statusStyle = STATUS_CONFIG[metrics.status] || STATUS_CONFIG['draft'];

                        // CALCULATE PENDING ITEM INDICATORS
                        const getIndicators = () => {
                            const conditions = [];

                            // 1. Payment Due (within 7 days or overdue)
                            const upcomingOrOverdue = project.context?.paymentMilestones?.filter(m => {
                                if (m.status === 'paid' || !m.date) return false;
                                const mDate = new Date(m.date);
                                if (isNaN(mDate.getTime())) return false;
                                const in7Days = new Date();
                                in7Days.setDate(in7Days.getDate() + 7);
                                return mDate <= in7Days;
                            }).sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());

                            if (upcomingOrOverdue && upcomingOrOverdue.length > 0) {
                                const d = new Date(upcomingOrOverdue[0].date!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                conditions.push({ dot: 'bg-red-500', text: `Payment due ${d}` });
                            }

                            // 2. Pending Decisions
                            const pendingDecisions = project.activeProject?.executionData?.decisions?.filter(d => !d.resolved)?.length || 0;
                            if (pendingDecisions > 0) {
                                conditions.push({ dot: 'bg-amber-500', text: `${pendingDecisions} pending decision${pendingDecisions > 1 ? 's' : ''}` });
                            }

                            // 3. SOF Items Pending
                            const pendingSofItems = project.activeProject?.executionData?.sofItems?.filter(s => s.status === 'pending')?.length || 0;
                            if (pendingSofItems > 0) {
                                conditions.push({ dot: 'bg-amber-500', text: `${pendingSofItems} SOF item${pendingSofItems > 1 ? 's' : ''} pending` });
                            }

                            if (conditions.length === 0) return null;

                            let displayConditions = conditions;
                            if (conditions.length > 2) {
                                displayConditions = [
                                    conditions[0],
                                    { dot: 'bg-slate-300', text: `+${conditions.length - 1} more items needing attention` }
                                ];
                            }

                            return (
                                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-1.5">
                                    {displayConditions.map((c, i) => (
                                        <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium tracking-wide">
                                            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>
                                            <span>{c.text}</span>
                                        </div>
                                    ))}
                                </div>
                            );
                        };

                        return (
                            <MotionDiv 
                                key={project.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className={`bg-white/80 backdrop-blur-xl rounded-[2rem] border transition-all duration-500 relative group overflow-hidden flex flex-col hover:-translate-y-2 hover:shadow-2xl
                                    ${isActive ? 'border-emerald-500 ring-4 ring-emerald-500/20 shadow-xl' : 'border-white/40 shadow-lg'}
                                    ${metrics.status === 'won' ? 'bg-gradient-to-b from-emerald-50/50 to-white/80' : ''}
                                `}
                            >
                                {/* Header / Status */}
                                <div className="p-5 flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${statusStyle.bg} ${statusStyle.color} ${statusStyle.border} shadow-sm`}>
                                            {statusStyle.label}
                                        </span>
                                        {project.context?.journeySummary && (
                                            <span className={`px-2 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border shadow-sm flex items-center gap-1.5 hidden md:flex ${project.context.journeySummary.pct === 100 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                <div className="w-12 h-1 bg-black/10 rounded-full overflow-hidden shrink-0"><div className="h-full bg-current transition-all" style={{ width: `${project.context.journeySummary.pct}%` }} /></div>
                                                {project.context.journeySummary.pct}%
                                            </span>
                                        )}
                                        {metrics.riskScore > 0 && (
                                            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-red-50 text-red-600 border border-red-100 shadow-sm" title={`${metrics.executionBlockers} Blockers, ${metrics.executionDecisions} Pending Decisions`}>
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                                                At Risk
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{lastEdited}</span>
                                        <div className="flex items-center gap-1.5">
                                            {(project as any)._failedHydration && (
                                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-sm border bg-red-50 text-red-600 border-red-200" title="Project failed to decompress">
                                                    ⚠️ ERROR
                                                </span>
                                            )}
                                            {project.context?.commsSummary && (
                                                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm border ${
                                                    project.context.commsSummary.healthScore === 100 
                                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                    : project.context.commsSummary.pendingCount > 0 
                                                        ? 'bg-rose-50 text-rose-600 border-rose-100' 
                                                        : 'bg-slate-50 text-slate-500 border-slate-200'
                                                }`} title="Communication Health">
                                                    <span className="text-[10px]">📬</span> 
                                                    {project.context.commsSummary.healthScore === 100 ? (
                                                        <span>✓</span>
                                                    ) : (
                                                        <span>{project.context.commsSummary.pendingCount}</span>
                                                    )}
                                                </span>
                                            )}
                                            <ProjectPaymentBadge projectId={project.id} size="sm" />
                                        </div>
                                    </div>
                                </div>

                                {/* Main Info */}
                                <div className="px-6 pb-4 flex-grow cursor-pointer">
                                    <div className="flex justify-between items-start mb-6 gap-2">
                                        <div className="flex-1 min-w-0" onClick={() => onOpenProject(project)}>
                                            <h3 className="text-2xl font-light tracking-tighter text-slate-900 leading-tight mb-1 truncate" title={project.context?.name || 'Unnamed Project'}>
                                                {project.context?.name || 'Unnamed Project'}
                                            </h3>
                                            <p className="text-xs text-slate-500 font-medium truncate uppercase tracking-wider">
                                                {project.context?.clientName || 'Unknown Client'} • {project.context?.config || 'Unknown Config'}
                                            </p>
                                        </div>
                                        {onQuickUpdate && ['won', 'execution', 'work_paused'].includes(project.context?.status || 'draft') && (
                                            <div className="relative group/supervisor shrink-0" onClick={(e) => e.stopPropagation()}>
                                                <select 
                                                    value={project.context?.assignedSupervisors?.[0] || ''}
                                                    onChange={(e) => onQuickUpdate(project.id, 'assignedSupervisors', [e.target.value])}
                                                    className="appearance-none bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold uppercase tracking-wider rounded-lg py-1.5 pl-2 pr-5 cursor-pointer hover:bg-emerald-100 hover:border-emerald-300 outline-none transition-all shadow-sm max-w-[100px] truncate"
                                                    title="Assign Site Supervisor"
                                                >
                                                    <option value="">Assign Site</option>
                                                    {siteSupervisors.map(s => (
                                                        <option key={s.id} value={s.id}>{s.name.split(' ')[0]}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute inset-y-0 right-1.5 flex items-center pointer-events-none text-emerald-600">
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Updated: CLEAN STACKED TIER LIST */}
                                    {project.tiers && project.tiers.length > 0 ? (
                                        <div className="space-y-3 mt-4">
                                            {project.tiers.map((tier) => {
                                                const isApproved = tier.id === project.context.approvedTierId;
                                                const exec = tier.summary.totalSell || 0;
                                                const fee = tier.summary.designFee || 0;
                                                const total = tier.summary.totalRevenue || (exec + fee);
                                                // Calculate blended GM
                                                const margin = tier.summary.blendedGm !== undefined ? tier.summary.blendedGm : (tier.summary.totalGm || 0);
                                                
                                                return (
                                                    <div 
                                                        key={tier.id} 
                                                        className={`p-3 rounded-2xl border flex flex-col gap-2 transition-all duration-300 ${isApproved ? 'bg-emerald-50/80 border-emerald-200 shadow-md scale-[1.02]' : 'bg-slate-50/50 border-slate-100 hover:bg-white hover:shadow-sm'}`}
                                                    >
                                                        {/* Row 1: Name and Total */}
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                {isApproved && <span className="text-emerald-500 text-sm">✓</span>}
                                                                <span className={`text-xs font-bold uppercase tracking-wider truncate ${isApproved ? 'text-emerald-900' : 'text-slate-600'}`}>
                                                                    {tier.name}
                                                                </span>
                                                            </div>
                                                            <span className={`text-sm font-light tracking-tighter whitespace-nowrap ${isApproved ? 'text-emerald-700 font-medium' : 'text-slate-900'}`}>
                                                                {formatClientValue(total)}
                                                            </span>
                                                        </div>

                                                        {/* Row 2: Detailed Breakdown */}
                                                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium">
                                                            <div className="flex gap-3">
                                                                <span>Ex: {formatClientValue(exec)}</span>
                                                                <span className="text-blue-500/80">Fe: {formatClientValue(fee)}</span>
                                                            </div>
                                                            <span className={`font-bold px-2 py-0.5 rounded-full ${margin >= 25 ? 'bg-emerald-100/80 text-emerald-700' : margin >= 15 ? 'bg-amber-100/80 text-amber-700' : 'bg-red-50/80 text-red-600'}`}>
                                                                {margin.toFixed(0)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="h-24 flex items-center justify-center text-slate-400 text-xs font-medium uppercase tracking-wider bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                            No Options Created
                                        </div>
                                    )}

                                    {getIndicators()}
                                </div>

                                {/* Footer Actions */}
                                <div className="px-4 py-3 border-t border-slate-100/50 bg-slate-50/30 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDuplicateProject(project); }}
                                        className="p-2 text-slate-400 hover:text-indigo-600 rounded-xl hover:bg-white hover:shadow-sm transition-all"
                                        title="Duplicate"
                                    >
                                        <NewFileIcon className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setProjectToDelete(project.id); }}
                                        className="p-2 text-slate-300 hover:text-red-500 rounded-xl hover:bg-white hover:shadow-sm transition-all"
                                        title="Delete"
                                    >
                                        <DeleteIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </MotionDiv>
                        )
                    })}
                    </AnimatePresence>
                </div>
            )}

            {/* --- COMPARISON VIEW --- */}
            {viewMode === 'compare' && (
                <Card title="Strategic Decision Matrix" className="overflow-hidden bg-white/60 backdrop-blur-xl border-white/40 shadow-xl rounded-[2rem]">
                    <p className="text-sm text-slate-500 mb-6 font-medium">Comparing potential returns and operational load to prioritize the right projects.</p>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200/50 bg-white/50">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="bg-slate-50/80 border-b border-slate-200/50">
                                    <th className="p-5 w-48 font-bold text-slate-400 uppercase tracking-widest text-[10px]">Metric</th>
                                    {projects.filter(p => selectedForCompare.has(p.id)).map(p => (
                                        <th key={p.id} className="p-5 min-w-[200px] font-light tracking-tighter text-slate-900 text-xl border-l border-slate-200/50">
                                            {p.context?.name || 'Unnamed Project'}
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2">{p.context?.clientName || 'Unknown Client'}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/50">
                                {/* Section 1: Financial Health */}
                                <tr className="bg-slate-50/30"><td colSpan={10} className="p-3 px-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Financial Health</td></tr>
                                <tr className="hover:bg-white/50 transition-colors">
                                    <td className="p-5 font-bold text-slate-600">Total Value</td>
                                    {projects.filter(p => selectedForCompare.has(p.id)).map(p => {
                                        const metrics = getProjectMetrics(p);
                                        return (
                                            <td key={p.id} className="p-5 border-l border-slate-100/50 font-light tracking-tighter text-emerald-700 text-2xl">
                                                {formatClientValue(metrics.value)}
                                            </td>
                                        )
                                    })}
                                </tr>
                                {/* ... (rest of comparison table) ... */}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
            </div>
            )}

            {activeTab === 'analytics' && (
                <div className="py-8">
                    <CashFlowForecastDashboard />
                </div>
            )}

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {projectToDelete && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
                        <MotionDiv
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/50 max-w-md w-full overflow-hidden"
                        >
                            <div className="p-8">
                                <div className="w-12 h-12 rounded-full bg-red-100 text-red-500 flex items-center justify-center mb-6">
                                    <DeleteIcon className="w-6 h-6" />
                                </div>
                                <h3 className="text-2xl font-light tracking-tighter text-slate-900 mb-3">Delete Project?</h3>
                                <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                                    Are you sure you want to permanently delete this project? This action cannot be undone and all associated data will be lost forever.
                                </p>
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setProjectToDelete(null)}
                                        className="px-6 py-3 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (projectToDelete) {
                                                onDeleteProject(projectToDelete);
                                                setProjectToDelete(null);
                                            }
                                        }}
                                        className="px-6 py-3 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-all shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:-translate-y-0.5"
                                    >
                                        Delete Permanently
                                    </button>
                                </div>
                            </div>
                        </MotionDiv>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ProjectListTab;
