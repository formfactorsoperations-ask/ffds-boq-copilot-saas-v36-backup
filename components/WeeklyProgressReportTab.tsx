import { generateWhatsAppDigest } from '../services/whatsappService';
import React, { useState, useEffect, useMemo } from 'react';
import { ProjectContext, SiteUpdateRecord, PaymentMilestone, ProposalTier, Item, FullProjectData, WeeklyPulseReport, DrawingTrackerItem, PaymentAdvance } from '../types';
import { collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebaseClient';
import { useOrg } from '../contexts/OrgContext';
import { ChevronLeft, ChevronRight, Share2, Printer, Eye, Sliders, MessageCircle, Wand2, Plus, CheckCircle2, Copy, Loader2, AlertCircle, Calendar, Edit2, Check } from 'lucide-react';
import { formatCurrency, formatINR } from '../lib/utils';
import { draftWeeklyReportContent } from '../services/geminiService';
import { syncWeeklyReport } from '../services/weeklyReportCompiler';
import { motion, AnimatePresence } from 'framer-motion';


function applyValueAtPath(obj: any, path: string, value: any) {
    if (!obj || !path) return;
    const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (current[keys[i]] === undefined) current[keys[i]] = {};
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
}

interface WeeklyProgressReportTabProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    activeTier?: ProposalTier;
    bank?: Item[];
    projectId?: string;
    projectData?: FullProjectData;
    isClientView?: boolean;
}

export default function WeeklyProgressReportTab({ 
    projectContext, 
    setProjectContext,
    activeTier,
    bank,
    projectId,
    projectData,
    isClientView = false
}: WeeklyProgressReportTabProps) {
    const { orgData } = useOrg();
    const orgId = orgData?.tenantId || 'demo-tenant-01';

    const [drawingTracker, setDrawingTracker] = useState<any[]>([]);
    const [paymentGates, setPaymentGates] = useState<any[]>([]);

    const [correctionModal, setCorrectionModal] = useState<{ fieldPath: string, value: any, type: string } | null>(null);
    const [correctionReason, setCorrectionReason] = useState('');
    const [correctionNewValue, setCorrectionNewValue] = useState('');
    const [correctionConfirmValue, setCorrectionConfirmValue] = useState('');

    const handleApplyCorrection = async () => {
        if (!correctionModal) return;
        if (correctionReason.split(' ').filter(w => w.trim().length > 0).length < 10) {
            alert("Reason must be at least 10 words.");
            return;
        }
        if (['amount', 'status'].includes(correctionModal.type) && correctionNewValue !== correctionConfirmValue) {
            alert("Confirmation value does not match.");
            return;
        }
        
        const taskId = 'tsk-' + Date.now().toString(36);
        try {
            const taskRef = doc(collection(db, `organizations/${orgId}/projects/${projectId}/tasks`), taskId);
            await setDoc(taskRef, {
                id: taskId,
                type: 'report_source_mismatch',
                module: 'Weekly Report',
                instruction: `Corrected value for ${correctionModal.fieldPath}. Reason: ${correctionReason}`,
                raisedByReport: currentPulseRaw?.id || '',
                status: 'open',
                createdAt: Date.now(),
                createdBy: 'Ops User'
            });
        } catch (e) {
            console.error("Failed to create task", e);
        }

        const newCorrection = {
            id: 'corr-' + Date.now().toString(36),
            fieldPath: correctionModal.fieldPath,
            originalValue: correctionModal.value,
            correctedValue: ['amount', 'number'].includes(correctionModal.type) ? Number(correctionNewValue) : correctionNewValue,
            reason: correctionReason,
            correctedBy: 'Ops User',
            correctedAt: Date.now(),
            mismatchTaskId: taskId,
            state: 'active'
        };

        const updatedCorrections = [...(currentPulseRaw?.corrections || []), newCorrection];
        const updatedPulse = { ...currentPulseRaw, corrections: updatedCorrections };
        const updatedWeeks = weeksList.map(w => w.weekNumber === updatedPulse.weekNumber ? updatedPulse : w);
        
        setWeeksList(updatedWeeks);
        saveToServer(updatedWeeks);
        setCorrectionModal(null);
        setCorrectionReason('');
        setCorrectionNewValue('');
        setCorrectionConfirmValue('');
    };

    const Correctable = ({ fieldPath, value, children, type = 'text' }: { fieldPath: string, value: any, children: React.ReactNode, type?: string }) => {
        if (isClientView) return <>{children}</>;
        // Find if this field has an active correction
        const hasCorrection = currentPulseRaw?.corrections?.some(c => c.fieldPath === fieldPath && c.state === 'active');
        
        return (
            <span className="group relative inline-flex items-center gap-2 w-full">
                <span className={`flex-1 ${hasCorrection ? 'border-b border-dashed border-[#d8b87e]' : ''}`}>{children}</span>
                {!isClientView && currentPulse?.status !== 'published' && (
                    <button 
                        onClick={() => {
                            setCorrectionModal({ fieldPath, value, type });
                            setCorrectionNewValue(String(value));
                            setCorrectionConfirmValue('');
                            setCorrectionReason('');
                        }} 
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-[#d8b87e] transition-opacity shrink-0"
                        title="Correct this value"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </span>
        );
    };


    useEffect(() => {
        if (!projectId || !db) return;
        
        const unsubDrawings = onSnapshot(collection(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`), snap => {
            setDrawingTracker(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        
        const unsubGates = onSnapshot(collection(db, `organizations/${orgId}/projects/${projectId}/paymentGates`), snap => {
            setPaymentGates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubDrawings();
            unsubGates();
        };
    }, [projectId, orgId]);


    const [weeksList, setWeeksList] = useState<WeeklyPulseReport[]>([]);
    const [selectedWeek, setSelectedWeek] = useState(1);
    const [activeViewMode, setActiveViewMode] = useState<'ops' | 'client'>(isClientView ? 'client' : 'ops');
    
    // For AI generation
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        if (projectContext.weeklyPulseReports && projectContext.weeklyPulseReports.length > 0) {
            setWeeksList(projectContext.weeklyPulseReports);
            if (!isClientView) {
                const maxWeek = Math.max(...projectContext.weeklyPulseReports.map(w => w.weekNumber));
                setSelectedWeek(maxWeek);
            } else {
                const published = projectContext.weeklyPulseReports.filter(w => w.publishedAt).sort((a,b) => b.weekNumber - a.weekNumber);
                if (published.length > 0) {
                    setSelectedWeek(published[0].weekNumber);
                } else {
                    setSelectedWeek(1);
                }
            }
        } else {
            // Default week 1
            setWeeksList([{
                id: 'week-1',
                weekNumber: 1,
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
                executiveBriefing: '',
            status: 'building',
                roomProgress: {},
                nextWeekPlan: '',
                manualActions: [],
                revisions: [],
                selections: [],
                sectionVisibility: {
                    weekAtGlance: true,
                    governance: true,
                    designProgress: true,
                    revisions: true,
                    financials: true,
                    siteProgress: true,
                    selections: true,
                    upcomingPlan: true,
                    actionRequired: true,
                },
                studioNotes: {}
            }]);
            setSelectedWeek(1);
        }
    }, [projectContext.weeklyPulseReports, isClientView]);

    const currentPulseRaw = weeksList.find(w => w.weekNumber === selectedWeek) || weeksList[0];
    const currentPulse = useMemo(() => {
        if (!currentPulseRaw) return null;
        if (!currentPulseRaw.corrections || currentPulseRaw.corrections.length === 0) return currentPulseRaw;
        const clone = JSON.parse(JSON.stringify(currentPulseRaw));
        clone.corrections.forEach((corr: any) => {
            if (corr.state === 'active') {
                applyValueAtPath(clone, corr.fieldPath, corr.correctedValue);
            }
        });
        return clone;
    }, [currentPulseRaw]);

    // Auto-sync on open if building
    useEffect(() => {
        if (!isClientView && currentPulse && currentPulse.status !== 'published' && orgId && projectId && projectData) {
            const doSync = async () => {
                setIsSyncing(true);
                try {
                    const synced = await syncWeeklyReport(orgId, projectId, currentPulse.id, currentPulse, projectContext, projectData);
                    updateCurrentPulse(() => synced);
                } catch (e) {
                    console.error("Auto-sync failed", e);
                } finally {
                    setIsSyncing(false);
                }
            };
            // Only sync if it hasn't been synced in the last 10 seconds to avoid infinite loops
            if (!currentPulse.syncedAt || (Date.now() - currentPulse.syncedAt > 10000)) {
                doSync();
            }
        }
    }, [currentPulse?.id, currentPulse?.status, isClientView, orgId, projectId]);

    const updateCurrentPulse = (updater: (prev: WeeklyPulseReport) => WeeklyPulseReport) => {
        const updatedList = weeksList.map(w => w.weekNumber === selectedWeek ? updater(w) : w);
        setWeeksList(updatedList);
        saveToServer(updatedList);
    };

    const saveToServer = async (reports: WeeklyPulseReport[]) => {
        const updatedContext = { ...projectContext, weeklyPulseReports: reports };
        setProjectContext(updatedContext);
        if (projectData && projectData.id) {
            try {
                // Call dbService to save correctly in context
                const updatedProject = { ...projectData, context: updatedContext };
                const { db: dbService } = await import('../services/dbService');
                await dbService.saveProject(updatedProject);
            } catch (err) {
                console.error("Failed to save pulse reports", err);
            }
        }
    };

    const handleCreateNextWeek = () => {
        const maxWeek = Math.max(...weeksList.map(w => w.weekNumber));
        const lastWeek = weeksList.find(w => w.weekNumber === maxWeek);
        const newStartDate = lastWeek ? new Date(new Date(lastWeek.endDate).getTime() + 86400000).toISOString() : new Date().toISOString();
        const newEndDate = new Date(new Date(newStartDate).getTime() + 6 * 86400000).toISOString();
        
        const newPulse: WeeklyPulseReport = {
            id: `week-${maxWeek + 1}`,
            weekNumber: maxWeek + 1,
            startDate: newStartDate,
            endDate: newEndDate,
            executiveBriefing: '',
            nextWeekPlan: '',
            roomProgress: lastWeek?.roomProgress ? { ...lastWeek.roomProgress } : {},
            revisions: [],
            selections: [],
            manualActions: [],
            sectionVisibility: {
                weekAtGlance: true,
                governance: true,
                designProgress: true,
                revisions: true,
                financials: true,
                siteProgress: true,
                selections: true,
                upcomingPlan: true,
                actionRequired: true,
            },
            studioNotes: {}
        };
        const newList = [...weeksList, newPulse];
        setWeeksList(newList);
        setSelectedWeek(maxWeek + 1);
        saveToServer(newList);
    };

    const handleManualSync = async () => {
        if (!orgId || !projectId || !projectData || !currentPulse) return;
        setIsSyncing(true);
        try {
            const synced = await syncWeeklyReport(orgId, projectId, currentPulse.id, currentPulse, projectContext, projectData);
            updateCurrentPulse(() => synced);
        } catch (e) {
            console.error("Manual sync failed", e);
        } finally {
            setIsSyncing(false);
        }
    };

    const togglePublish = () => {
        updateCurrentPulse(p => ({
            ...p,
            publishedAt: p.publishedAt ? undefined : new Date().toISOString(),
            status: p.publishedAt ? 'building' : 'published'
        }));
    };

    const formatDate = (isoString?: string) => {
        if (!isoString) return '';
        return new Date(isoString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    };

    const activeWeekRange = {
        dateRange: `${formatDate(currentPulse?.startDate)} - ${formatDate(currentPulse?.endDate)}`
    };

    const renderClientView = () => {
        if (!currentPulse || (isClientView && !currentPulse.publishedAt)) {
            return (
                <div className="flex flex-col items-center justify-center p-20 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <Calendar className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">No Report Available</h3>
                    <p className="text-slate-500 max-w-sm">The weekly report for this period has not been published yet.</p>
                </div>
            );
        }

        return (
            <div className="max-w-4xl mx-auto bg-white p-8 md:p-14 border border-slate-200 shadow-sm rounded-xl">
                {/* Print Header */}
                <div className="flex justify-between items-end pb-8 border-b border-[#d8b87e] mb-10">
                    <div>
                        <h1 className="text-2xl font-bold text-[#1a2332] font-sans tracking-tight">Form Factors Design Studio</h1>
                        <p className="text-xs text-slate-500 tracking-[0.2em] mt-2 uppercase">Interior Architecture</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] text-slate-500 font-bold tracking-[0.2em] uppercase mb-1">Weekly Progress Report</p>
                        <p className="text-lg font-bold text-[#1a2332]">Week {currentPulse.weekNumber}</p>
                        <p className="text-xs text-slate-500 mt-1">{activeWeekRange.dateRange}</p>
                    </div>
                </div>

                <div className="space-y-12">
                                        {/* Executive Summary */}
                    <div>
                        <div className="flex justify-between items-end mb-6 border-b border-[#d8b87e] pb-2">
                            <h3 className="text-[11px] font-bold text-[#5a6577] uppercase tracking-widest">Executive Summary</h3>
                            {!isClientView && currentPulse?.status !== 'published' && (
                                <button 
                                    onClick={async () => {
                                        setIsGenerating(true);
                                        const draft = await draftWeeklyReportContent(currentPulse, projectContext, projectData);
                                        if (draft.executiveBriefing) {
                                            updateCurrentPulse(p => ({ ...p, executiveBriefing: draft.executiveBriefing }));
                                        }
                                        setIsGenerating(false);
                                    }}
                                    disabled={isGenerating}
                                    className="text-[10px] font-bold text-indigo-600 uppercase flex items-center gap-1 hover:underline"
                                >
                                    {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                    Auto-Draft Narrative
                                </button>
                            )}
                        </div>
                        
                        {!isClientView && currentPulse?.status !== 'published' ? (
                            <textarea
                                className="w-full text-[14px] text-[#1a2332] leading-relaxed whitespace-pre-wrap font-serif border border-dashed border-slate-300 rounded p-4 min-h-[120px] focus:outline-none focus:border-[#d8b87e] bg-slate-50/50"
                                value={currentPulse.executiveBriefing || ''}
                                onChange={e => updateCurrentPulse(p => ({ ...p, executiveBriefing: e.target.value }))}
                                placeholder="Write the executive summary here..."
                            />
                        ) : (
                            <div className="text-[14px] text-[#1a2332] leading-relaxed whitespace-pre-wrap font-serif">
                                {currentPulse.executiveBriefing || 'No executive summary provided for this week.'}
                            </div>
                        )}
                    </div>
                    
                    {/* ENRICHMENT 4: OPEN ITEMS */}
                    {(currentPulse.openItems?.client?.length > 0 || currentPulse.openItems?.studio?.length > 0) && (
                        <div>
                            <h3 className="text-[11px] font-bold text-[#5a6577] uppercase tracking-widest mb-6 border-b border-[#d8b87e] pb-2">Action Register</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <h4 className="text-[12px] font-bold text-[#1a2332] uppercase mb-4">Waiting on You</h4>
                                    {currentPulse.openItems?.client?.length > 0 ? (
                                        <ul className="space-y-3">
                                            {currentPulse.openItems.client.map((item, i) => (
                                                <li key={i} className="text-sm text-[#1a2332] flex items-start gap-2">
                                                    <span className="text-[#d8b87e] mt-0.5">●</span>
                                                    <span><Correctable fieldPath={`openItems.client[${i}].text`} value={item.text}>{item.text}</Correctable> {item.date && <span className="text-[#5a6577] ml-2">({item.date})</span>}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-sm text-[#5a6577] italic">No pending items.</p>
                                    )}
                                </div>
                                <div>
                                    <h4 className="text-[12px] font-bold text-[#1a2332] uppercase mb-4">Waiting on Us</h4>
                                    {currentPulse.openItems?.studio?.length > 0 ? (
                                        <ul className="space-y-3">
                                            {currentPulse.openItems.studio.map((item, i) => (
                                                <li key={i} className="text-sm text-[#1a2332] flex items-start gap-2">
                                                    <span className="text-[#d8b87e] mt-0.5">○</span>
                                                    <span><Correctable fieldPath={`openItems.studio[${i}].text`} value={item.text}>{item.text}</Correctable> {item.date && <span className="text-[#5a6577] ml-2">({item.date})</span>}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-sm text-[#5a6577] italic">No pending items.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ENRICHMENT 1: ACTIVITY */}
                    {currentPulse.activities && currentPulse.activities.length > 0 && (
                        <div>
                            <h3 className="text-[11px] font-bold text-[#5a6577] uppercase tracking-widest mb-6 border-b border-[#d8b87e] pb-2">Recent Activity</h3>
                            <div className="space-y-4 border-l border-slate-200 ml-2 pl-4">
                                {currentPulse.activities.map((act, i) => (
                                    <div key={i} className="relative">
                                        <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-[#1a2332]"></div>
                                        <p className="text-xs text-[#5a6577] font-bold mb-0.5">{act.date}</p>
                                        <p className="text-sm text-[#1a2332]"><Correctable fieldPath={`activities[${i}].text`} value={act.text}>{act.text}</Correctable></p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* ENRICHMENT 3: CATEGORY PROGRESS */}
                    {currentPulse.categoryProgress && currentPulse.categoryProgress.length > 0 && (
                        <div>
                            <h3 className="text-[11px] font-bold text-[#5a6577] uppercase tracking-widest mb-6 border-b border-[#d8b87e] pb-2">Execution Progress by Category</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                                {currentPulse.categoryProgress.map((cat, i) => (
                                    <div key={i}>
                                        <div className="flex justify-between items-end mb-2">
                                            <div>
                                                <h4 className="text-sm font-bold text-[#1a2332]">{cat.category}</h4>
                                                <p className="text-xs text-[#5a6577]">{cat.roomsCovered} of {cat.totalRooms} rooms covered</p>
                                            </div>
                                            <span className="text-sm font-bold text-[#1a2332]"><Correctable fieldPath={`categoryProgress[${i}].percentage`} value={cat.percentage} type="number">{Math.round(cat.percentage)}</Correctable>%</span>
                                        </div>
                                        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-[#1a2332]" style={{ width: `${cat.percentage}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ENRICHMENT 2: VELOCITY */}
                    <div>
                        <h3 className="text-[11px] font-bold text-[#5a6577] uppercase tracking-widest mb-6 border-b border-[#d8b87e] pb-2">Pace & Velocity</h3>
                        {currentPulse.velocity ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div>
                                    <p className="text-xs text-[#5a6577] uppercase tracking-widest mb-1">Client Review</p>
                                    <p className="text-2xl font-serif text-[#1a2332]"><Correctable fieldPath="velocity.clientAvgHours" value={currentPulse.velocity.clientAvgHours} type="number">{Math.round(currentPulse.velocity.clientAvgHours || 0)}</Correctable> <span className="text-sm text-[#5a6577]">hrs</span></p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#5a6577] uppercase tracking-widest mb-1">Studio Turnaround</p>
                                    <p className="text-2xl font-serif text-[#1a2332]"><Correctable fieldPath="velocity.studioAvgHours" value={currentPulse.velocity.studioAvgHours} type="number">{Math.round(currentPulse.velocity.studioAvgHours || 0)}</Correctable> <span className="text-sm text-[#5a6577]">hrs</span></p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#5a6577] uppercase tracking-widest mb-1">Data Coverage</p>
                                    <p className="text-2xl font-serif text-[#1a2332]">{Math.round(currentPulse.velocity.coveragePercent)}%</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-[#5a6577] italic">Insufficient data points to compute reliable velocity metrics for this period.</p>
                        )}
                    </div>

                    {/* ENRICHMENT 5: REVISION LEDGER */}
                    {currentPulse.revisionLedger && (
                        <div>
                            <h3 className="text-[11px] font-bold text-[#5a6577] uppercase tracking-widest mb-6 border-b border-[#d8b87e] pb-2">Revision Ledger</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                                <div>
                                    <p className="text-xs text-[#5a6577] uppercase tracking-widest mb-1">Client Requested</p>
                                    <p className="text-2xl font-serif text-[#1a2332]"><Correctable fieldPath="revisionLedger.clientRequested" value={currentPulse.revisionLedger.clientRequested} type="number">{currentPulse.revisionLedger.clientRequested}</Correctable></p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#5a6577] uppercase tracking-widest mb-1">Site Condition</p>
                                    <p className="text-2xl font-serif text-[#1a2332]"><Correctable fieldPath="revisionLedger.siteCondition" value={currentPulse.revisionLedger.siteCondition} type="number">{currentPulse.revisionLedger.siteCondition}</Correctable></p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#5a6577] uppercase tracking-widest mb-1">Internal Refinement</p>
                                    <p className="text-2xl font-serif text-[#1a2332]"><Correctable fieldPath="revisionLedger.internalRefinement" value={currentPulse.revisionLedger.internalRefinement} type="number">{currentPulse.revisionLedger.internalRefinement}</Correctable></p>
                                </div>
                                <div>
                                    <p className="text-xs text-[#5a6577] uppercase tracking-widest mb-1">Unclassified</p>
                                    <p className="text-2xl font-serif text-[#1a2332]"><Correctable fieldPath="revisionLedger.unclassified" value={currentPulse.revisionLedger.unclassified} type="number">{currentPulse.revisionLedger.unclassified}</Correctable></p>
                                </div>
                            </div>
                            
                            {currentPulse.revisionLedger.unclassified > 0 && (
                                <p className="text-sm text-[#5a6577] italic mb-4">
                                    <span className="text-[#d8b87e] mr-2">○</span>
                                    {currentPulse.revisionLedger.unclassified} item(s) being categorised — none chargeable without your confirmation.
                                </p>
                            )}

                            {currentPulse.revisionLedger.chargeableSummary && currentPulse.revisionLedger.chargeableSummary.length > 0 && (
                                <div className="mt-6 border-t border-slate-100 pt-6">
                                    <h4 className="text-[12px] font-bold text-[#1a2332] uppercase mb-4">Chargeable Revisions</h4>
                                    <ul className="space-y-3">
                                        {currentPulse.revisionLedger.chargeableSummary.map((item, i) => (
                                            <li key={i} className="text-sm text-[#1a2332] flex items-start gap-2">
                                                <span className="text-[#d8b87e] mt-0.5">●</span>
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    
                    {/* Design Progress */}
                    {currentPulse.sectionVisibility.designProgress && drawingTracker && drawingTracker.length > 0 && (
                        <div>
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">Design Progress</h3>
                            <div className="overflow-hidden border border-slate-200 rounded-xl">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Drawing</th>
                                            <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Category</th>
                                            <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {drawingTracker.slice(0, 5).map((dwg: any, idx: number) => (
                                            <tr key={`dwg-c-${idx}`} className="hover:bg-slate-50/50">
                                                <td className="px-5 py-4 font-medium text-slate-800">{dwg.name}</td>
                                                <td className="px-5 py-4 text-slate-600">{dwg.category}</td>
                                                <td className="px-5 py-4 text-right">
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${dwg.status === 'approved' ? 'bg-green-100 text-green-700' : dwg.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                                        {(dwg.status || '').replace('_', ' ')}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Room Progress */}
                    {currentPulse.sectionVisibility.siteProgress && (
                        <div>
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">Site Progress By Room</h3>
                            <div className="overflow-hidden border border-slate-200 rounded-xl">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Room / Area</th>
                                            <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider w-1/3">Progress</th>
                                            <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right w-1/4">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {(projectContext.rooms || []).map((r, idx) => {
                                            const currentProg = currentPulse?.roomProgress?.[r.name] || 0;
                                            const prevPulse = weeksList.find(w => w.weekNumber === currentPulse.weekNumber - 1);
                                            const prevProg = prevPulse?.roomProgress?.[r.name] || 0;
                                            
                                            // Handle builder mode inputs
                                            const isBuilder = !isClientView && currentPulse?.status !== 'published';
                                            
                                            return (
                                                <tr key={`client-room-${idx}`} className="hover:bg-slate-50/50">
                                                    <td className="px-5 py-4 font-medium text-slate-800">{r.name}</td>
                                                    <td className="px-5 py-4">
                                                        {isBuilder ? (
                                                            <div className="flex flex-col gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <input 
                                                                        type="range" 
                                                                        min="0" max="100" step="5"
                                                                        value={currentProg}
                                                                        onChange={e => {
                                                                            const val = parseInt(e.target.value);
                                                                            updateCurrentPulse(p => ({
                                                                                ...p,
                                                                                roomProgress: { ...(p.roomProgress || {}), [r.name]: val }
                                                                            }));
                                                                        }}
                                                                        className="flex-1 accent-indigo-600"
                                                                    />
                                                                    <input 
                                                                        type="number"
                                                                        value={currentProg}
                                                                        onChange={e => {
                                                                            const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                                                                            updateCurrentPulse(p => ({
                                                                                ...p,
                                                                                roomProgress: { ...(p.roomProgress || {}), [r.name]: val }
                                                                            }));
                                                                        }}
                                                                        className="w-14 text-sm text-right bg-slate-50 border border-slate-200 rounded p-1"
                                                                    />
                                                                </div>
                                                                {currentProg < prevProg && (
                                                                    <input 
                                                                        type="text" 
                                                                        placeholder={`Reason for decrease from ${prevProg}%...`} 
                                                                        className="text-xs p-1.5 border border-red-300 bg-red-50 rounded"
                                                                    />
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-[#1e293b] rounded-full transition-all duration-500" style={{ width: `${currentProg}%` }} />
                                                                </div>
                                                                <span className="text-xs font-bold text-slate-700 min-w-[2.5rem]">{currentProg}%</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-4 text-right">
                                                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${currentProg === 100 ? 'bg-green-100 text-green-700' : currentProg === 0 ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'}`}>
                                                            {currentProg === 100 ? 'Completed' : currentProg === 0 ? 'Pending' : 'In Progress'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {(!projectContext.rooms || projectContext.rooms.length === 0) && (
                                            <tr>
                                                <td colSpan={3} className="px-5 py-8 text-center text-slate-500 text-sm">No rooms defined in this project.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {projectData?.activeProject?.executionData?.updates && projectData?.activeProject.executionData.updates.length > 0 && (
                                <div className="mt-6 space-y-4">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">Recent Site Updates</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {projectData?.activeProject.executionData.updates.slice(0, 3).map((update: any, idx: number) => (
                                            <div key={`update-c-${idx}`} className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase">{new Date(update.date).toLocaleDateString()}</span>
                                                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded uppercase">{update.category}</span>
                                                </div>
                                                <p className="text-sm text-slate-700">{update.notes}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
</div>)}

                    
                    {/* Financial Status */}
                    {currentPulse.sectionVisibility.financials && currentPulse.paymentPlan && currentPulse.paymentPlan.length > 0 && (
                        <div>
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">Financial Status & Gates</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {currentPulse.paymentPlan.slice(0, 3).map((gate: any, idx: number) => (
                                    <div key={`gate-c-${idx}`} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col justify-between">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{gate.type} Phase</p>
                                            <p className="font-bold text-[#1e293b]">{gate.gate_name}</p>
                                        </div>
                                        <div className="mt-4 flex items-center justify-between">
                                            <span className="text-sm font-semibold text-slate-600">{gate.percentage}%</span>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${gate.status === 'paid' ? 'bg-green-100 text-green-700' : gate.status === 'invoice_raised' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                                {(gate.status || '').replace('_', ' ')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Revisions & Variations */}
                    {currentPulse.sectionVisibility.revisions && currentPulse.revisions && currentPulse.revisions.length > 0 && (
                        <div>
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">Revisions & Variations</h3>
                            <div className="space-y-4">
                                {currentPulse.revisions.map((rev, idx) => (
                                    <div key={`rev-c-${idx}`} className="flex flex-col sm:flex-row gap-4 justify-between bg-slate-50 border border-slate-200/60 p-4 rounded-xl">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-slate-800">{rev.drawing}</h4>
                                                <span className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 text-[10px] uppercase font-bold rounded-md">{rev.category}</span>
                                            </div>
                                            <p className="text-sm text-slate-600">{rev.change}</p>
                                        </div>
                                        {rev.charge && rev.charge.toLowerCase() !== 'included' && rev.charge !== '-' && (
                                            <div className="text-right shrink-0 mt-2 sm:mt-0">
                                                <span className="text-xs text-slate-500 uppercase font-bold block mb-0.5">Impact</span>
                                                <span className="text-sm font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-md">{rev.charge}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Next Week Plan */}
                        {currentPulse.sectionVisibility.upcomingPlan && currentPulse.nextWeekPlan && (
                            <div>
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">Upcoming Focus</h3>
                                <div className="text-[13px] text-[#334155] leading-relaxed whitespace-pre-wrap bg-slate-50 p-5 rounded-xl border border-slate-100">
                                    {currentPulse.nextWeekPlan}
                                </div>
                            </div>
                        )}

                        {/* Action Required */}
                        {currentPulse.sectionVisibility.actionRequired && currentPulse.manualActions && currentPulse.manualActions.length > 0 && (
                            <div>
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">Action Required</h3>
                                <div className="space-y-3">
                                    {currentPulse.manualActions.map((action, idx) => (
                                        <div key={`act-c-${idx}`} className="flex gap-3 bg-amber-50/50 border border-amber-200/60 p-4 rounded-xl">
                                            <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                            </div>
                                            <div>
                                                <span className="block text-[10px] font-bold text-amber-700 uppercase mb-0.5 tracking-wider">
                                                    For {action.assignee === 'client' ? 'Client' : 'Studio'}
                                                </span>
                                                <p className="text-[#1e293b] text-sm leading-relaxed">{action.text}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    
    const renderCorrectionModal = () => {
        if (!correctionModal) return null;
        return (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Correct Value: {correctionModal.fieldPath}</h3>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Compiled Value (Read-Only)</label>
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500 font-mono">
                                {String(correctionModal.value)}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">New Value</label>
                            <input 
                                type="text"
                                className="w-full border-slate-200 rounded-lg text-sm p-3 focus:ring-[#d8b87e] focus:border-[#d8b87e]"
                                value={correctionNewValue}
                                onChange={e => setCorrectionNewValue(e.target.value)}
                                placeholder="Enter correct value..."
                            />
                        </div>

                        {['amount', 'status'].includes(correctionModal.type) && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Confirm New Value</label>
                                <input 
                                    type="text"
                                    className="w-full border-slate-200 rounded-lg text-sm p-3 focus:ring-[#d8b87e] focus:border-[#d8b87e]"
                                    value={correctionConfirmValue}
                                    onChange={e => setCorrectionConfirmValue(e.target.value)}
                                    placeholder="Re-type new value..."
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Reason (min 10 words)</label>
                            <textarea 
                                className="w-full border-slate-200 rounded-lg text-sm p-3 min-h-[100px] focus:ring-[#d8b87e] focus:border-[#d8b87e]"
                                value={correctionReason}
                                onChange={e => setCorrectionReason(e.target.value)}
                                placeholder="Why is the source data incorrect? How should it be fixed..."
                            />
                            <p className="text-xs text-slate-400 mt-1">
                                Words: {correctionReason.split(' ').filter(w => w.trim().length > 0).length} / 10
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-8">
                        <button 
                            onClick={() => setCorrectionModal(null)}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleApplyCorrection}
                            className="px-4 py-2 text-sm font-bold bg-[#1a2332] text-white rounded-lg hover:bg-[#d8b87e] transition-colors"
                        >
                            Apply Correction
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderCorrectionsPanel = () => {
        if (!currentPulseRaw?.corrections || currentPulseRaw.corrections.length === 0) return null;
        return (
            <div className="mt-12 bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6">
                <h3 className="font-bold text-slate-800 text-sm mb-4">Applied Corrections</h3>
                <div className="space-y-4">
                    {currentPulseRaw.corrections.map((corr: any) => (
                        <div key={corr.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase mr-2 ${corr.state === 'active' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {corr.state}
                                    </span>
                                    <span className="text-sm font-mono text-slate-600">{corr.fieldPath}</span>
                                </div>
                                <span className="text-xs text-slate-400">{new Date(corr.correctedAt).toLocaleDateString()} by {corr.correctedBy}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm mt-2">
                                <span className="text-slate-400 line-through">{String(corr.originalValue)}</span>
                                <span className="text-slate-400">→</span>
                                <span className="font-bold text-slate-700">{String(corr.correctedValue)}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 bg-white p-2 rounded border border-slate-100">
                                <span className="font-bold">Reason:</span> {corr.reason}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        );
    };


    return (
        <div className="space-y-6 pb-20">
            {!isClientView && (
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
                            disabled={selectedWeek <= 1}
                            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-40"
                        >
                            <ChevronLeft className="w-5 h-5 text-indigo-950" />
                        </button>
                        <div className="min-w-[180px] text-center md:text-left">
                            <h4 className="font-bold text-indigo-950 text-sm">Week {currentPulse?.weekNumber || 1}</h4>
                            <p className="text-xs text-slate-500 font-semibold">{activeWeekRange.dateRange}</p>
                        </div>
                        <button 
                            onClick={() => setSelectedWeek(Math.min(weeksList.length, selectedWeek + 1))}
                            disabled={selectedWeek >= weeksList.length}
                            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-40"
                        >
                            <ChevronRight className="w-5 h-5 text-indigo-950" />
                        </button>
                        <button 
                            onClick={handleCreateNextWeek}
                            className="ml-2 flex items-center gap-1 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                        >
                            <Plus className="w-3 h-3" /> New
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {currentPulse && (
                            <div className="text-xs text-slate-500 flex flex-col items-end mr-4">
                                <span>Synced: {currentPulse.syncedAt ? new Date(currentPulse.syncedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Never'}</span>
                                <button onClick={handleManualSync} disabled={isSyncing} className="text-indigo-600 font-bold hover:underline flex items-center gap-1">
                                    {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sliders className="w-3 h-3" />} Sync Now
                                </button>
                            </div>
                        )}
                        <button onClick={() => window.open(`/reports/${projectId}/${currentPulse?.id}`, '_blank')} className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors">
                            <Eye className="w-4 h-4" /> Preview
                        </button>
                        <button onClick={async () => {
                            const digest = generateWhatsAppDigest(currentPulse);
                            await navigator.clipboard.writeText(digest);
                            alert('WhatsApp digest copied to clipboard!');
                        }} className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-100 transition-colors">
                            <Share2 className="w-4 h-4" /> WhatsApp
                        </button>
                        <button 
                            onClick={togglePublish}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${currentPulse?.publishedAt ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                        >
                            {currentPulse?.publishedAt ? <><CheckCircle2 className="w-4 h-4" /> Published</> : 'Publish'}
                        </button>
                    </div>
                </div>
            )}
            
            <motion.div
                key={selectedWeek}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
            >
                {renderClientView()}
                {!isClientView && renderCorrectionsPanel()}
                {renderCorrectionModal()}
            </motion.div>
        </div>
    );
}
