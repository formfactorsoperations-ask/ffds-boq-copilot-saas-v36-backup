const fs = require('fs');

const content = `import React, { useState, useEffect, useMemo } from 'react';
import { ProjectContext, SiteUpdateRecord, PaymentMilestone, ProposalTier, Item, FullProjectData, WeeklyPulseReport, DrawingTrackerItem, PaymentAdvance } from '../types';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebaseClient';
import { useOrg } from '../contexts/OrgContext';
import { ChevronLeft, ChevronRight, Share2, Printer, Eye, Sliders, MessageCircle, Wand2, Plus, CheckCircle2, Copy, Loader2, AlertCircle, Calendar, Edit2, Check } from 'lucide-react';
import { formatCurrency, formatINR } from '../lib/utils';
import { generateComprehensiveWeeklyReport } from '../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';

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

    const [weeksList, setWeeksList] = useState<WeeklyPulseReport[]>([]);
    const [selectedWeek, setSelectedWeek] = useState(1);
    const [activeViewMode, setActiveViewMode] = useState<'ops' | 'client'>(isClientView ? 'client' : 'ops');
    
    // For AI generation
    const [isGenerating, setIsGenerating] = useState(false);

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

    const currentPulse = weeksList.find(w => w.weekNumber === selectedWeek) || weeksList[0];

    const updateCurrentPulse = (updater: (prev: WeeklyPulseReport) => WeeklyPulseReport) => {
        const updatedList = weeksList.map(w => w.weekNumber === selectedWeek ? updater(w) : w);
        setWeeksList(updatedList);
        saveToServer(updatedList);
    };

    const saveToServer = async (reports: WeeklyPulseReport[]) => {
        setProjectContext(prev => ({ ...prev, weeklyPulseReports: reports }));
        if (projectId && orgId) {
            try {
                const projRef = doc(db, \`\${orgId}_projects\`, projectId);
                await updateDoc(projRef, { weeklyPulseReports: reports });
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
            id: \`week-\${maxWeek + 1}\`,
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

    const togglePublish = () => {
        updateCurrentPulse(p => ({
            ...p,
            publishedAt: p.publishedAt ? undefined : new Date().toISOString()
        }));
    };

    const formatDate = (isoString?: string) => {
        if (!isoString) return '';
        return new Date(isoString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    };

    const activeWeekRange = {
        dateRange: \`\${formatDate(currentPulse?.startDate)} - \${formatDate(currentPulse?.endDate)}\`
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
                        <h1 className="text-2xl font-bold text-[#1e293b] font-sans tracking-tight">Form Factors Design Studio</h1>
                        <p className="text-xs text-slate-500 tracking-[0.2em] mt-2 uppercase">Interior Architecture</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] text-slate-500 font-bold tracking-[0.2em] uppercase mb-1">Weekly Progress Report</p>
                        <p className="text-lg font-bold text-[#1e293b]">Week {currentPulse.weekNumber}</p>
                        <p className="text-xs text-slate-500 mt-1">{activeWeekRange.dateRange}</p>
                    </div>
                </div>

                <div className="space-y-12">
                    {/* Executive Summary */}
                    <div>
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">Executive Summary</h3>
                        <div className="text-[14px] text-[#334155] leading-relaxed whitespace-pre-wrap font-serif">
                            {currentPulse.executiveBriefing || 'No executive summary provided for this week.'}
                        </div>
                    </div>

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
                                            return (
                                                <tr key={\`client-room-\${idx}\`} className="hover:bg-slate-50/50">
                                                    <td className="px-5 py-4 font-medium text-slate-800">{r.name}</td>
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                <div className="h-full bg-[#1e293b] rounded-full transition-all duration-500" style={{ width: \`\${currentProg}%\` }} />
                                                            </div>
                                                            <span className="text-xs font-bold text-slate-700 min-w-[2.5rem]">{currentProg}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 text-right">
                                                        <span className={\`text-xs font-medium px-2.5 py-1 rounded-full \${currentProg === 100 ? 'bg-green-100 text-green-700' : currentProg === 0 ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'}\`}>
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
                        </div>
                    )}

                    {/* Revisions & Variations */}
                    {currentPulse.sectionVisibility.revisions && currentPulse.revisions && currentPulse.revisions.length > 0 && (
                        <div>
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">Revisions & Variations</h3>
                            <div className="space-y-4">
                                {currentPulse.revisions.map((rev, idx) => (
                                    <div key={\`rev-c-\${idx}\`} className="flex flex-col sm:flex-row gap-4 justify-between bg-slate-50 border border-slate-200/60 p-4 rounded-xl">
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
                                        <div key={\`act-c-\${idx}\`} className="flex gap-3 bg-amber-50/50 border border-amber-200/60 p-4 rounded-xl">
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

    const renderOpsConsole = () => {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form Col */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
                        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Edit2 className="w-4 h-4 text-slate-500" />
                                Edit Report Content
                            </h3>
                            <button 
                                onClick={async () => {
                                    setIsGenerating(true);
                                    try {
                                        const res = await generateComprehensiveWeeklyReport(currentPulse, projectContext);
                                        updateCurrentPulse(p => ({
                                            ...p,
                                            executiveBriefing: res.executiveBriefing || p.executiveBriefing,
                                            nextWeekPlan: res.nextWeekPlan || p.nextWeekPlan,
                                            manualActions: res.manualActions || p.manualActions
                                        }));
                                    } catch(e) {
                                        console.error(e);
                                    }
                                    setIsGenerating(false);
                                }}
                                disabled={isGenerating}
                                className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
                            >
                                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                                AI Draft Content
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Executive Summary</label>
                                <textarea
                                    value={currentPulse.executiveBriefing}
                                    onChange={e => updateCurrentPulse(p => ({ ...p, executiveBriefing: e.target.value }))}
                                    className="w-full h-32 p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    placeholder="Summarize the week's progress..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Next Week Focus</label>
                                <textarea
                                    value={currentPulse.nextWeekPlan || ''}
                                    onChange={e => updateCurrentPulse(p => ({ ...p, nextWeekPlan: e.target.value }))}
                                    className="w-full h-24 p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    placeholder="What is the studio focusing on next week?"
                                />
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Action Items</label>
                                <div className="space-y-3 mb-3">
                                    {(currentPulse.manualActions || []).map((action, idx) => (
                                        <div key={\`act-\${idx}\`} className="flex gap-2">
                                            <select 
                                                value={action.assignee}
                                                onChange={e => {
                                                    const updated = [...(currentPulse.manualActions || [])];
                                                    updated[idx].assignee = e.target.value as any;
                                                    updateCurrentPulse(p => ({ ...p, manualActions: updated }));
                                                }}
                                                className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                                            >
                                                <option value="client">Client</option>
                                                <option value="studio">Studio</option>
                                            </select>
                                            <input 
                                                value={action.text}
                                                onChange={e => {
                                                    const updated = [...(currentPulse.manualActions || [])];
                                                    updated[idx].text = e.target.value;
                                                    updateCurrentPulse(p => ({ ...p, manualActions: updated }));
                                                }}
                                                className="flex-1 text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg"
                                                placeholder="Action required..."
                                            />
                                            <button 
                                                onClick={() => {
                                                    const updated = (currentPulse.manualActions || []).filter((_, i) => i !== idx);
                                                    updateCurrentPulse(p => ({ ...p, manualActions: updated }));
                                                }}
                                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button 
                                    onClick={() => updateCurrentPulse(p => ({
                                        ...p,
                                        manualActions: [...(p.manualActions || []), { id: Date.now().toString(), text: '', assignee: 'client' }]
                                    }))}
                                    className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200"
                                >
                                    + Add Action Item
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Room Progress Editor */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
                        <div className="p-4 bg-slate-50 border-b border-slate-200">
                            <h3 className="font-bold text-slate-800 text-sm">Site Progress Update</h3>
                        </div>
                        <div className="p-6">
                            <div className="space-y-4">
                                {(projectContext.rooms || []).map((r, idx) => {
                                    const currentProg = currentPulse?.roomProgress?.[r.name] || 0;
                                    return (
                                        <div key={\`rm-ops-\${idx}\`} className="flex items-center gap-4">
                                            <span className="w-1/3 text-sm font-medium text-slate-700 truncate">{r.name}</span>
                                            <input 
                                                type="range" 
                                                min="0" 
                                                max="100" 
                                                step="5"
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
                                            <div className="w-16 flex items-center justify-end">
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
                                                    className="w-12 text-sm text-right bg-slate-50 border border-slate-200 rounded p-1"
                                                />
                                                <span className="text-xs text-slate-500 ml-1">%</span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {(!projectContext.rooms || projectContext.rooms.length === 0) && (
                                    <p className="text-sm text-slate-500">No rooms configured in project.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Settings Col */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-800 text-sm">Publish Settings</h3>
                            {currentPulse.publishedAt ? (
                                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-md flex items-center gap-1"><Check className="w-3 h-3" /> Published</span>
                            ) : (
                                <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-md">Draft</span>
                            )}
                        </div>
                        
                        <div className="space-y-4">
                            <button 
                                onClick={togglePublish}
                                className={\`w-full py-2.5 rounded-xl font-bold text-sm transition-colors \${currentPulse.publishedAt ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'}\`}
                            >
                                {currentPulse.publishedAt ? 'Unpublish Report' : 'Publish to Client Portal'}
                            </button>
                            {currentPulse.publishedAt && (
                                <p className="text-xs text-slate-500 text-center">
                                    Published on {new Date(currentPulse.publishedAt).toLocaleString()}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6">
                        <h3 className="font-bold text-slate-800 text-sm mb-4">Section Visibility</h3>
                        <div className="space-y-3">
                            {Object.entries({
                                siteProgress: 'Room Progress',
                                revisions: 'Revisions & Variations',
                                upcomingPlan: 'Upcoming Focus',
                                actionRequired: 'Action Items'
                            }).map(([key, label]) => (
                                <label key={key} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={(currentPulse.sectionVisibility as any)?.[key] ?? true}
                                        onChange={e => {
                                            updateCurrentPulse(p => ({
                                                ...p,
                                                sectionVisibility: {
                                                    ...(p.sectionVisibility || {}),
                                                    [key]: e.target.checked
                                                }
                                            }));
                                        }}
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm text-slate-700">{label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Top Control Bar */}
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
                        <h4 className="font-bold text-indigo-950 text-sm">Select Report Week</h4>
                        <p className="text-xs text-slate-500 font-semibold">{activeWeekRange.dateRange}</p>
                    </div>
                    <button 
                        onClick={() => setSelectedWeek(Math.min(weeksList.length, selectedWeek + 1))}
                        disabled={selectedWeek >= weeksList.length}
                        className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-40"
                    >
                        <ChevronRight className="w-5 h-5 text-indigo-950" />
                    </button>
                </div>
                
                <div className="flex items-center gap-3">
                    {!isClientView && (
                        <>
                            <div className="bg-slate-100 p-1.5 rounded-xl flex gap-1 border border-slate-200/60 mr-2">
                                <button 
                                    onClick={() => setActiveViewMode('ops')}
                                    className={\`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all \${activeViewMode === 'ops' ? 'bg-white shadow-sm text-indigo-900' : 'text-slate-500 hover:text-slate-700'}\`}
                                >
                                    <Sliders className="w-3.5 h-3.5" /> Ops Console
                                </button>
                                <button 
                                    onClick={() => setActiveViewMode('client')}
                                    className={\`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all \${activeViewMode === 'client' ? 'bg-white shadow-sm text-indigo-900' : 'text-slate-500 hover:text-slate-700'}\`}
                                >
                                    <Eye className="w-3.5 h-3.5" /> Preview
                                </button>
                            </div>
                            <button 
                                onClick={handleCreateNextWeek}
                                className="flex items-center gap-2 bg-[#1e293b] text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors"
                            >
                                <Plus className="w-4 h-4" /> Next Week
                            </button>
                        </>
                    )}
                </div>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeViewMode}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {activeViewMode === 'ops' ? renderOpsConsole() : renderClientView()}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
`;

fs.writeFileSync('components/WeeklyProgressReportTab.tsx', content);
