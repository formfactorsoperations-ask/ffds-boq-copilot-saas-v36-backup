import React, { useState, useEffect } from 'react';
import { Home, PlusCircle, CheckCircle, Camera, Navigation2, FileText, ArrowLeft, LogOut, Package, AlertTriangle, ListTodo, Activity, Clock, Box } from 'lucide-react';
import { SiteActivityWidget } from './SiteActivityWidget';
import { SiteVisitLogModal } from './SiteVisitLogModal';
import { SiteProgressChart } from './SiteProgressChart';
import { FullProjectData } from '../types';
import { useOrg } from '../contexts/OrgContext';
import { formatClientValue } from '../lib/utils';

interface SupervisorMobileAppProps {
    projects: FullProjectData[];
    onLogout: () => void;
    onProjectUpdate?: (project: FullProjectData) => void;
}

export default function SupervisorMobileApp({ projects, onLogout, onProjectUpdate }: SupervisorMobileAppProps) {
    const { orgData } = useOrg();
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [isLoggingVisit, setIsLoggingVisit] = useState(false);
    const [activeTab, setActiveTab] = useState<'activity' | 'bundles' | 'materials' | 'blockers'>('activity');
    const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
    const [quickAction, setQuickAction] = useState<'update' | 'blocker' | 'material' | null>(null);
    const [quickActionText, setQuickActionText] = useState('');

    // Get active project
    const activeProject = projects.find(p => p.id === selectedProjectId);

    if (!selectedProjectId) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
                <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black shadow-md">
                            <Camera className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-indigo-900 tracking-tight">Supervisor Ops</h1>
                            <p className="text-xs text-slate-500 font-medium">Site Activity Tracker</p>
                        </div>
                    </div>
                    <button 
                        onClick={onLogout} 
                        className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="hidden sm:inline">Sign Out</span>
                    </button>
                </header>

                <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
                    <div className="mb-8">
                        <h2 className="text-2xl font-black text-indigo-950 tracking-tight">Active Sites</h2>
                        <p className="text-slate-500 font-medium mt-1">Select a site to log updates, blockers, and progress.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.length > 0 ? projects.map(proj => {
                            const executionData = proj.activeProject?.executionData;
                            const bundles = executionData?.bundles || [];
                            const completedBundles = (bundles || []).filter(b => b.status === 'completed').length;
                            const progress = bundles.length > 0 ? Math.round((completedBundles / bundles.length) * 100) : 0;
                            
                            const blockers = executionData?.blockers?.filter(b => !b.resolved) || [];
                            const hasCriticalBlocker = blockers.some(b => b.impactLevel === 'critical');

                            return (
                                <button 
                                    key={proj.id}
                                    onClick={() => setSelectedProjectId(proj.id)}
                                    className={`bg-white border ${hasCriticalBlocker ? 'border-red-300' : 'border-slate-200'} rounded-xl p-6 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all text-left flex flex-col justify-between group h-full relative overflow-hidden`}
                                >
                                    {hasCriticalBlocker && (
                                        <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-lg">
                                            Blocked
                                        </div>
                                    )}
                                    <div className="w-full">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className={`w-10 h-10 ${hasCriticalBlocker ? 'bg-red-50 text-red-500 group-hover:bg-red-100' : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600'} border border-slate-100 rounded-lg flex items-center justify-center transition-colors`}>
                                                <Navigation2 className="w-5 h-5" />
                                            </div>
                                            <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${proj.context?.status === 'execution' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {proj.context?.status?.replace('_', ' ') || 'Setup'}
                                            </div>
                                        </div>
                                        <h3 className="text-xl font-bold text-indigo-900 group-hover:text-indigo-600 transition-colors leading-tight mb-1">{proj.context?.name || 'Unnamed Project'}</h3>
                                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4">{proj.context?.clientName || 'Client'}</p>
                                        
                                        <div className="space-y-1 mt-4">
                                            <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                <span>Progress</span>
                                                <span className="text-slate-700">{progress}%</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className={`h-full ${hasCriticalBlocker ? 'bg-red-400' : 'bg-indigo-500'} transition-all`} style={{ width: `${progress}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between w-full">
                                        <div className="flex space-x-3 text-slate-400">
                                            <div className="flex items-center space-x-1" title="Active Blockers">
                                                <AlertTriangle className={`w-4 h-4 ${blockers.length > 0 ? 'text-amber-500' : ''}`} />
                                                <span className="text-xs font-bold">{blockers.length}</span>
                                            </div>
                                            <div className="flex items-center space-x-1" title="Total Bundles">
                                                <ListTodo className="w-4 h-4" />
                                                <span className="text-xs font-bold">{bundles.length}</span>
                                            </div>
                                        </div>
                                        <span className="text-xs font-bold text-slate-400 group-hover:text-indigo-500 transition-colors">Enter Site &rarr;</span>
                                    </div>
                                </button>
                            );
                        }) : (
                            <div className="col-span-full text-center p-12 bg-white rounded-xl border border-dashed border-slate-300">
                                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                <h3 className="text-lg font-bold text-slate-700">No active sites</h3>
                                <p className="text-slate-500 mt-1">You don't have any projects assigned to you.</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        );
    }

    const executionData = activeProject?.activeProject?.executionData;

    const handleQuickActionSubmit = () => {
        if (!quickActionText.trim()) return;

        if (!activeProject) {
            console.error("handleQuickActionSubmit failed: activeProject is undefined");
            setQuickAction(null);
            setQuickActionText('');
            return;
        }

        if (!onProjectUpdate) {
            console.error("handleQuickActionSubmit failed: onProjectUpdate is undefined");
            setQuickAction(null);
            setQuickActionText('');
            return;
        }

        try {
            const updatedProject = JSON.parse(JSON.stringify(activeProject));
            if (!updatedProject.activeProject) {
                updatedProject.activeProject = {
                    tierId: activeProject.activeTierId || '',
                    budget: 0,
                    startDate: new Date().toISOString(),
                    expenses: [],
                    status: 'active',
                    executionData: {
                        bundles: [],
                        sofItems: [],
                        blockers: [],
                        actions: [],
                        decisions: [],
                        procurement: [],
                        updates: [],
                        lastUpdated: Date.now()
                    }
                };
            }

            if (!updatedProject.activeProject.executionData) {
                updatedProject.activeProject.executionData = {
                    bundles: [],
                    sofItems: [],
                    blockers: [],
                    actions: [],
                    decisions: [],
                    procurement: [],
                    updates: [],
                    lastUpdated: Date.now()
                };
            }

            const currentExecutionData = updatedProject.activeProject.executionData;
            
            if (quickAction === 'update' || quickAction === 'material') {
                const newUpdates = [...(currentExecutionData.updates || [])];
                newUpdates.unshift({
                    id: Math.random().toString(36).substr(2, 9),
                    timestamp: Date.now(),
                    text: quickAction === 'material' ? `[Material Selection] ${quickActionText}` : quickActionText,
                    type: quickAction === 'material' ? 'material' : 'general',
                    author: 'Site Supervisor'
                });
                currentExecutionData.updates = newUpdates;
            } else if (quickAction === 'blocker') {
                const newBlockers = [...(currentExecutionData.blockers || [])];
                newBlockers.unshift({
                    id: Math.random().toString(36).substr(2, 9),
                    type: 'decision', // default simple
                    description: quickActionText,
                    impactLevel: 'medium',
                    blockedBundleIds: [],
                    owner: 'ops',
                    financialImpact: 0,
                    daysDelayed: 0,
                    resolved: false
                });
                currentExecutionData.blockers = newBlockers;
            }

            currentExecutionData.lastUpdated = Date.now();
            onProjectUpdate(updatedProject);
        } catch (err) {
            console.error("Error updating project data in handleQuickActionSubmit:", err);
        } finally {
            setQuickAction(null);
            setQuickActionText('');
        }
    };

    const handleUpdateBundleStatus = (bundleId: string, newStatus: any, completionPercentage: number) => {
        if (!activeProject || !onProjectUpdate || !executionData) return;
        
        const newBundles = [...(executionData.bundles || [])];
        const index = newBundles.findIndex(b => b.id === bundleId);
        if (index > -1) {
            newBundles[index] = { ...newBundles[index], status: newStatus, completionPercentage };
            const updatedProject = { ...activeProject };
            updatedProject.activeProject!.executionData!.bundles = newBundles;
            updatedProject.activeProject!.executionData!.lastUpdated = Date.now();
            onProjectUpdate(updatedProject);
        }
    };

    const handleUpdateSofItemStatus = (itemId: string, newStatus: any) => {
        if (!activeProject || !onProjectUpdate || !executionData) return;
        
        const newSofItems = [...(executionData.sofItems || [])];
        const index = newSofItems.findIndex(i => i.id === itemId);
        if (index > -1) {
            newSofItems[index] = { ...newSofItems[index], status: newStatus };
            const updatedProject = { ...activeProject };
            updatedProject.activeProject!.executionData!.sofItems = newSofItems;
            updatedProject.activeProject!.executionData!.lastUpdated = Date.now();
            onProjectUpdate(updatedProject);
        }
    };

    const handleResolveBlocker = (blockerId: string) => {
        if (!activeProject || !onProjectUpdate || !executionData) return;
        
        const newBlockers = [...(executionData.blockers || [])];
        const index = newBlockers.findIndex(b => b.id === blockerId);
        if (index > -1) {
            newBlockers[index] = { ...newBlockers[index], resolved: true };
            const updatedProject = { ...activeProject };
            updatedProject.activeProject!.executionData!.blockers = newBlockers;
            updatedProject.activeProject!.executionData!.lastUpdated = Date.now();
            onProjectUpdate(updatedProject);
        }
    };

    return (
        <div className="h-screen bg-slate-50 flex flex-col font-sans">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm shrink-0">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setSelectedProjectId(null)}
                        className="p-1.5 -ml-1 text-slate-500 hover:text-indigo-950 transition-colors rounded-lg hover:bg-slate-100 flex items-center justify-center shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-lg font-black text-indigo-900 leading-tight truncate">{activeProject?.context?.clientName || activeProject?.context?.name || 'Client Site'}</h1>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider truncate">{activeProject?.context?.name}</p>
                    </div>
                </div>
            </header>

            {/* Scrollable Main Content */}
            <main className="flex-1 overflow-y-auto w-full max-w-5xl mx-auto pb-24">
                <div className="p-3 md:p-6 lg:p-8">
                    {activeTab === 'activity' && (
                        <div className="space-y-6">
                            <SiteProgressChart project={activeProject} />
                            
                            <SiteActivityWidget 
                                projectId={selectedProjectId!}
                                studioId={orgData?.tenantId || 'FFDS'}
                                projectContextName={activeProject?.context?.name || 'Project'}
                                studioSettings={orgData}
                                onOpenHistory={() => {}}
                            />

                            {(executionData?.updates && executionData.updates.length > 0) && (
                                <div className="space-y-4">
                                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider px-1">Project Updates</h3>
                                    {executionData.updates.map(update => (
                                        <div key={update.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-[10px] font-bold">
                                                        {update.author.charAt(0)}
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-700">{update.author}</span>
                                                </div>
                                                <span className="text-[10px] text-slate-400 font-medium">{new Date(update.timestamp).toLocaleDateString()}</span>
                                            </div>
                                            <p className="text-sm text-indigo-900 whitespace-pre-wrap leading-relaxed">{update.text}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'bundles' && (
                        <div className="space-y-4">
                            <h2 className="text-xl font-black text-indigo-950 px-1">Execution Bundles</h2>
                            {(!executionData?.bundles || executionData.bundles.length === 0) ? (
                                <div className="text-center p-8 bg-white rounded-xl border border-slate-200">
                                    <ListTodo className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                    <p className="text-slate-500 font-medium text-sm">No execution bundles released by Ops yet.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {executionData.bundles.map(bundle => (
                                        <div key={bundle.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded mr-2">{bundle.trade}</span>
                                                    <h3 className="font-bold text-indigo-900">{bundle.name}</h3>
                                                </div>
                                                <div className={`text-xs font-bold px-2 py-1 rounded capitalize ${bundle.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : bundle.status === 'blocked' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {bundle.status}
                                                </div>
                                            </div>

                                            {typeof bundle.gate === 'object' && bundle.gate.requiresGfc && bundle.gate.status === 'blocked' && (
                                                <div className="mt-3 p-2.5 bg-rose-50 border border-rose-100 rounded-lg text-[11px] text-rose-800 leading-snug">
                                                    <strong>GFC Gate Blocked:</strong> {bundle.gate.blockedReason}
                                                </div>
                                            )}
                                            {typeof bundle.gate === 'object' && bundle.gate.requiresGfc && bundle.gate.status === 'in_progress' && (
                                                <div className="mt-3 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-[11px] text-amber-800 leading-snug">
                                                    <strong>Proceeding At Risk:</strong> Overrun authorized by {bundle.gate.overrideAudit?.by || 'Ops'} (Justification: "{bundle.gate.overrideAudit?.reason}")
                                                </div>
                                            )}
                                            
                                            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                                        <span>Progress</span>
                                                        <span>{bundle.completionPercentage}%</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${bundle.completionPercentage}%` }} />
                                                    </div>
                                                </div>
                                                
                                                {bundle.status !== 'completed' && (
                                                    <button 
                                                        onClick={() => handleUpdateBundleStatus(bundle.id, 'completed', 100)}
                                                        className="shrink-0 p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-slate-200"
                                                        title="Mark Completed"
                                                    >
                                                        <CheckCircle className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'materials' && (
                        <div className="space-y-4">
                            <h2 className="text-xl font-black text-indigo-950 px-1">Material Receivals</h2>
                            <p className="text-sm text-slate-500 px-1 mb-4">Mark Schedule of Finishes items when they arrive at site.</p>
                            
                            {(!executionData?.sofItems || executionData.sofItems.length === 0) ? (
                                <div className="text-center p-8 bg-white rounded-xl border border-slate-200">
                                    <Box className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                    <p className="text-slate-500 font-medium text-sm">No SOF items to track.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {executionData.sofItems.map(item => (
                                        <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between gap-4">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate max-w-[100px]">{item.category}</span>
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${item.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        {item.status}
                                                    </span>
                                                </div>
                                                <h4 className="font-bold text-indigo-900 text-sm truncate">{item.name}</h4>
                                                <p className="text-xs text-slate-500 truncate">{item.location} • {item.specifications?.brand || 'Any Brand'}</p>
                                            </div>
                                            
                                            {item.status !== 'delivered' && (
                                                <button 
                                                    onClick={() => handleUpdateSofItemStatus(item.id, 'delivered')}
                                                    className="shrink-0 whitespace-nowrap text-xs font-bold px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
                                                >
                                                    Mark Arrived
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'blockers' && (
                        <div className="space-y-4">
                            <h2 className="text-xl font-black text-indigo-950 px-1">Site Blockers</h2>
                            <p className="text-sm text-slate-500 px-1 mb-4">Items actively blocking site execution.</p>
                            
                            {(!executionData?.blockers || (executionData.blockers || []).length === 0) ? (
                                <div className="text-center p-8 bg-white rounded-xl border border-slate-200">
                                    <AlertTriangle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                    <p className="text-slate-500 font-medium text-sm">No active blockers. Site path is clear.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {(executionData.blockers || []).filter(b => !b.resolved).map(blocker => (
                                        <div key={blocker.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm border-l-4 border-l-red-500">
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-bold text-indigo-900 text-sm leading-tight">{blocker.description}</h4>
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${blocker.impactLevel === 'critical' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {blocker.impactLevel}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-end mt-4">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    Owned by: <span className="text-slate-600">{blocker.owner}</span>
                                                </div>
                                                <button 
                                                    onClick={() => handleResolveBlocker(blocker.id)}
                                                    className="text-xs font-bold text-slate-500 hover:text-emerald-600 flex items-center gap-1"
                                                >
                                                    <CheckCircle className="w-3.5 h-3.5" />
                                                    Resolve
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {(executionData.blockers || []).filter(b => b.resolved).length > 0 && (
                                        <div className="mt-8">
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Recently Resolved</h3>
                                            {(executionData.blockers || []).filter(b => b.resolved).map(blocker => (
                                                <div key={blocker.id} className="bg-slate-50 rounded-xl border border-dashed border-slate-200 p-3 mb-2 flex items-center justify-between opacity-70">
                                                    <span className="text-xs font-medium text-slate-600 truncate">{blocker.description}</span>
                                                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 ml-2" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Bottom Modal Actions (FAB overlay) */}
            {activeTab === 'activity' && !isActionSheetOpen && !quickAction && (
                <div className="fixed bottom-24 right-5 z-20">
                    <button 
                        onClick={() => setIsActionSheetOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white w-14 h-14 rounded-full shadow-lg hover:shadow-indigo-600/30 flex items-center justify-center transition-all active:scale-95"
                    >
                        <PlusCircle className="w-6 h-6" />
                    </button>
                </div>
            )}

            {/* Action Sheet Modal */}
            {isActionSheetOpen && (
                <div className="fixed inset-0 bg-indigo-950/60 z-50 flex items-end justify-center" onClick={() => setIsActionSheetOpen(false)}>
                    <div className="bg-white w-full rounded-t-3xl p-6 pb-12 animate-in slide-in-from-bottom flex flex-col gap-3" onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />
                        <h3 className="text-lg font-black text-indigo-900 mb-2">What would you like to log?</h3>
                        
                        <button onClick={() => { setIsActionSheetOpen(false); setIsLoggingVisit(true); }} className="flex items-center gap-4 p-4 rounded-xl bg-orange-50/50 hover:bg-orange-50 border border-orange-100 transition-colors w-full text-left">
                            <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0"><Camera size={18} /></div>
                            <div>
                                <h4 className="font-bold text-orange-900">Site Visit</h4>
                                <p className="text-xs text-orange-700/70 font-medium">Log site survey or client meeting to calendar.</p>
                            </div>
                        </button>
                        
                        <button onClick={() => { setIsActionSheetOpen(false); setQuickAction('update'); }} className="flex items-center gap-4 p-4 rounded-xl bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 transition-colors w-full text-left">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><Activity size={18} /></div>
                            <div>
                                <h4 className="font-bold text-indigo-900">Project Update</h4>
                                <p className="text-xs text-indigo-700/70 font-medium">Post general textual update for ongoing work.</p>
                            </div>
                        </button>

                        <button onClick={() => { setIsActionSheetOpen(false); setQuickAction('material'); }} className="flex items-center gap-4 p-4 rounded-xl bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-100 transition-colors w-full text-left">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Package size={18} /></div>
                            <div>
                                <h4 className="font-bold text-emerald-900">Material Selection</h4>
                                <p className="text-xs text-emerald-700/70 font-medium">Log client material selection or note.</p>
                            </div>
                        </button>

                        <button onClick={() => { setIsActionSheetOpen(false); setQuickAction('blocker'); }} className="flex items-center gap-4 p-4 rounded-xl bg-red-50/50 hover:bg-red-50 border border-red-100 transition-colors w-full text-left">
                            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0"><AlertTriangle size={18} /></div>
                            <div>
                                <h4 className="font-bold text-red-900">Report Blocker</h4>
                                <p className="text-xs text-red-700/70 font-medium">Flag an issue stopping site execution.</p>
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {/* Quick Action Input Modal */}
            {quickAction && (
                <div className="fixed inset-0 bg-indigo-950/60 z-50 flex items-end justify-center" onClick={() => setQuickAction(null)}>
                    <div className="bg-white w-full rounded-t-3xl p-6 pb-12 animate-in slide-in-from-bottom flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-2" />
                        <h3 className="text-lg font-black text-indigo-900">
                            {quickAction === 'update' ? 'Post Project Update' : quickAction === 'material' ? 'Log Material Selection' : 'Report New Blocker'}
                        </h3>
                        <textarea 
                            value={quickActionText}
                            onChange={(e) => setQuickActionText(e.target.value)}
                            placeholder={quickAction === 'update' ? "What's the latest progress?" : quickAction === 'material' ? "E.g. Client confirmed Italian Marble for Living Room..." : "Describe what is blocking the path..."}
                            className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none"
                            autoFocus
                        />
                        <button 
                            onClick={handleQuickActionSubmit}
                            disabled={!quickActionText.trim()}
                            className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 disabled:opacity-50"
                        >
                            Submit
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom Navigation Bar */}
            <nav className="bg-white border-t border-slate-200 fixed bottom-0 left-0 right-0 z-30 pb-safe">
                <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
                    <button 
                        onClick={() => setActiveTab('activity')}
                        className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === 'activity' ? 'text-indigo-600' : 'text-slate-400'}`}
                    >
                        <Activity className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Log</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('bundles')}
                        className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === 'bundles' ? 'text-indigo-600' : 'text-slate-400'}`}
                    >
                        <ListTodo className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Bundles</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('materials')}
                        className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === 'materials' ? 'text-indigo-600' : 'text-slate-400'}`}
                    >
                        <Package className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Materials</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('blockers')}
                        className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === 'blockers' ? 'text-indigo-600' : 'text-slate-400'}`}
                    >
                        <AlertTriangle className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Blockers</span>
                    </button>
                </div>
            </nav>

            {/* Site Visit Modal */}
            {isLoggingVisit && (
                <SiteVisitLogModal 
                    isOpen={isLoggingVisit}
                    projectId={selectedProjectId!} 
                    studioId={orgData?.tenantId || 'FFDS'}
                    defaultType="measurement_survey"
                    projectContext={activeProject?.context as any}
                    onClose={() => setIsLoggingVisit(false)} 
                />
            )}
        </div>
    );
}
