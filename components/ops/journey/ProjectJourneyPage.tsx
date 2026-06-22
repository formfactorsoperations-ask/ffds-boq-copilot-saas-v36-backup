import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Check, ArrowRight, Clock, AlertTriangle, Activity, ShieldCheck, FileCheck, Circle, Settings2, BarChart2, ShieldAlert, FileText, CheckCircle2, FastForward } from 'lucide-react';
import { useProjectJourney, StepWithStatus } from '../../../hooks/useProjectJourney';
import { PHASES } from '../../../constants/journeyConstants';
import { ProjectContext } from '../../../types';

interface ProjectJourneyPageProps {
    projectId: string;
    projectContext: ProjectContext | null;
    onClose: () => void;
    onNavigate?: (tab: string) => void;
}

export default function ProjectJourneyPage({ projectId, projectContext, onClose, onNavigate }: ProjectJourneyPageProps) {
    const { stepsByPhase, phaseProgress, overall, markStepDone, markStepPending, loading, activeSteps, nextStep } = useProjectJourney(projectId, projectContext);
    const [focusedPhase, setFocusedPhase] = useState<number | null>(null);
    const [retrofitMode, setRetrofitMode] = useState<boolean>(false);

    if (loading) return <div className="flex-1 flex items-center justify-center p-12 text-slate-400 font-mono text-[10px] uppercase tracking-widest animate-pulse h-full">Synchronizing Execution State...</div>;

    const currentActivePhaseIndex = phaseProgress.findIndex(p => p.pct < 100) !== -1 
        ? phaseProgress.findIndex(p => p.pct < 100) 
        : PHASES.length - 1;

    const displayPhaseIndex = focusedPhase !== null ? focusedPhase : currentActivePhaseIndex;
    const currentPhaseDef = PHASES[displayPhaseIndex];
    const currentSteps = stepsByPhase[displayPhaseIndex] || [];

    const completedSteps = currentSteps.filter(s => s.status === 'done');
    const pendingSteps = currentSteps.filter(s => s.status === 'pending' || s.status === 'active');
    const lockedSteps = currentSteps.filter(s => s.status === 'locked');

    // Retrofit Phase action
    const handleRetrofitPhase = () => {
        if (!retrofitMode) {
            setRetrofitMode(true);
            // Auto close confirmation after 5s
            setTimeout(() => setRetrofitMode(false), 5000);
            return;
        }

        currentSteps.forEach(step => {
            if (step.status !== 'done') {
                markStepDone(step.id);
            }
        });
        setRetrofitMode(false);
    };
    
    return (
        <div className="flex flex-col min-h-[calc(100vh-6rem)] max-w-[1600px] mx-auto font-sans relative">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pt-4">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 -ml-2 text-slate-500 hover:text-slate-900 transition-colors rounded-full hover:bg-slate-100 mb-1">
                        <X className="w-5 h-5"/>
                    </button>
                    <div className="font-serif text-3xl md:text-5xl font-light tracking-tighter text-slate-900">{projectContext?.name || 'Unnamed Project'}</div>
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded bg-slate-100/80 mt-1">
                        <Activity className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Ops Matrix</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 md:bg-white md:p-3 md:rounded-2xl md:border md:border-slate-100 md:shadow-sm">
                    <div className="flex flex-col items-start md:items-end md:mr-2">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-2">Pipeline Velocity</span>
                        <div className="flex items-center gap-4 w-48 md:w-64">
                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${overall.pct}%` }} />
                            </div>
                            <span className="text-xs font-mono font-bold text-slate-700">{overall.pct}%</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row gap-6 lg:gap-8 relative">
                
                {/* Left Rails : Navigation (Timeline Style) */}
                <div className="w-full md:w-80 bg-white/50 border border-slate-100 rounded-[2rem] p-4 shrink-0 flex flex-row md:flex-col gap-2 md:gap-0 custom-scrollbar overflow-x-auto relative">
                    <div className="hidden md:block px-6 mb-8 mt-4 shrink-0">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Project Lifecycle</span>
                    </div>
                    <div className="flex md:flex-col px-4 md:px-6 relative gap-2 md:gap-0">
                        {/* Vertical connecting line for desktop timeline */}
                        <div className="hidden md:block absolute left-[39px] top-8 bottom-8 w-[2px] bg-slate-100 -z-10" />

                        {PHASES.map((p, i) => {
                            const prog = phaseProgress[i] || { done: 0, total: 0, pct: 0 };
                            const isActive = displayPhaseIndex === i;
                            const isCurrentEngine = currentActivePhaseIndex === i;
                            const isPast = i < currentActivePhaseIndex;
                            
                            return (
                                <button 
                                    key={p.id}
                                    onClick={() => setFocusedPhase(i)}
                                    className={`group text-left pl-3 pr-4 py-3 md:py-4 rounded-xl md:rounded-none md:bg-transparent transition-all flex md:flex-row items-center gap-4 shrink-0 min-w-[160px] md:min-w-0 md:w-full relative ${isActive && !isCurrentEngine ? 'bg-slate-50 md:bg-transparent' : ''}`}
                                >
                                    {/* Desktop Active Background Highlight */}
                                    {isActive && <div className="hidden md:block absolute inset-y-1 left-2 right-2 bg-indigo-50 rounded-xl -z-10" />}

                                    {/* Timeline Node */}
                                    <div className="hidden md:flex shrink-0 w-8 h-8 rounded-full items-center justify-center bg-white border-2 z-10 transition-colors duration-300" 
                                         style={{ borderColor: isActive ? '#4f46e5' : isPast ? '#10b981' : '#e2e8f0' }}>
                                        {isPast && !isActive ? (
                                            <Check className="w-4 h-4 text-emerald-500" />
                                        ) : (
                                            <div className={`w-2.5 h-2.5 rounded-full transition-colors ${isActive ? 'bg-indigo-600' : isPast ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className={`text-[9px] font-bold uppercase tracking-widest ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                                                Phase 0{i + 1}
                                            </span>
                                            {isCurrentEngine && <span className="text-[8px] font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 px-1.5 py-[2px] rounded border border-indigo-200">Active</span>}
                                        </div>
                                        <div className={`text-[13px] tracking-tight truncate ${isActive ? 'font-semibold text-indigo-950' : 'font-medium text-slate-500'}`}>
                                            {p.name}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Center Logic Matrix */}
                <div className="flex-1 relative pb-32">
                    <div className="max-w-4xl flex flex-col h-full pl-0 md:pl-2">
                        
                        {/* Header Area */}
                        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div>
                                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2 font-mono">Phase 0{displayPhaseIndex + 1}</div>
                                <h2 className="text-3xl md:text-4xl font-serif text-slate-900 mb-3 tracking-tight">{currentPhaseDef.name}</h2>
                                <p className="text-slate-500 text-sm leading-relaxed max-w-xl font-light">{currentPhaseDef.desc}</p>
                            </div>
                            
                            {/* Retrofit Operations Action */}
                            {(pendingSteps.length > 0 || lockedSteps.length > 0) && (
                                <button 
                                    onClick={handleRetrofitPhase}
                                    className="group flex flex-col md:items-end text-left md:text-right shrink-0"
                                >
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${retrofitMode ? 'bg-red-50 text-red-600' : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-800 group-hover:text-white'}`}>
                                        {retrofitMode ? <AlertTriangle className="w-3.5 h-3.5" /> : <FastForward className="w-3.5 h-3.5" />}
                                        {retrofitMode ? 'Confirm Force Complete?' : 'Retrofit Phase'}
                                    </div>
                                    <div className="text-[9px] text-slate-400 mt-1 max-w-[150px] opacity-0 group-hover:opacity-100 transition-opacity">Force-complete past phases</div>
                                </button>
                            )}
                        </div>

                        {/* Steps Grid */}
                        <div className="flex flex-col space-y-12 pb-24">
                            
                            {/* Actionable Group */}
                            {pendingSteps.length > 0 && (
                                <div className="space-y-4 relative">
                                    <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
                                        <Activity className="w-4 h-4 text-indigo-600" />
                                        <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest font-mono">Active Gateways</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {pendingSteps.map(step => (
                                            <ExecutionMatrixRow 
                                                key={step.id} 
                                                step={step} 
                                                onInteract={() => markStepDone(step.id)} 
                                                onNavigate={onNavigate ? () => step.linkedTab && onNavigate(step.linkedTab) : undefined}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Locked Upstream */}
                            {lockedSteps.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3 opacity-80">
                                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Prerequisites Pending</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {lockedSteps.map(step => (
                                            <ExecutionMatrixRow key={step.id} step={step} locked />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Cleared Group */}
                            {completedSteps.length > 0 && (
                                <div className="space-y-4 pt-4">
                                    <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Cleared Gateways</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {completedSteps.map(step => (
                                            <ExecutionMatrixRow 
                                                key={step.id} 
                                                step={step} 
                                                onUndo={() => markStepPending(step.id)}
                                                onNavigate={onNavigate ? () => step.linkedTab && onNavigate(step.linkedTab) : undefined}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {currentSteps.length === 0 && (
                                <div className="text-center py-20 border border-dashed border-slate-200 rounded-2xl text-slate-400 font-mono text-xs max-w-lg mx-auto w-full">
                                    No operational steps defined for this phase.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// -------------------------------------------------------------
// Component: Execution Matrix Row
// -------------------------------------------------------------
function ExecutionMatrixRow({ 
    step, 
    locked = false, 
    onInteract, 
    onUndo,
    onNavigate
}: { 
    key?: string | number;
    step: StepWithStatus; 
    locked?: boolean;
    onInteract?: () => void;
    onUndo?: () => void;
    onNavigate?: () => void;
}) {
    const isDone = step.status === 'done';
    const isActive = step.status === 'active';

    return (
        <div className={`group flex flex-col md:flex-row md:items-center justify-between py-4 md:py-5 px-5 md:px-6 rounded-2xl transition-all duration-300 border bg-white ${isDone ? 'border-slate-200 shadow-sm opacity-80' : locked ? 'border-dashed border-slate-200 opacity-60' : isActive ? 'border-indigo-600 shadow-md ring-1 ring-indigo-600' : 'border-slate-200 shadow-sm'}`}>
            <div className="flex items-start gap-4 md:gap-5 flex-1 min-w-0 md:pr-6">
                <div className="mt-0.5 shrink-0 flex items-center justify-center">
                    {isDone ? (
                        <div className="w-6 h-6 rounded-full border-2 border-emerald-500 bg-emerald-50 flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                    ) : locked ? (
                        <div className="w-6 h-6 rounded-full border-2 border-slate-200 bg-transparent flex items-center justify-center text-slate-400">
                            <Lock className="w-3 h-3" />
                        </div>
                    ) : isActive ? (
                        <div className="w-6 h-6 rounded-full border-2 border-indigo-600 bg-indigo-600 flex items-center justify-center shadow-inner">
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        </div>
                    ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-slate-300 bg-transparent" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1.5">
                        <span className={`text-[15px] font-semibold tracking-tight truncate ${locked ? 'text-slate-500' : 'text-slate-900'}`}>{step.title}</span>
                        {step.isAutoDerived && (
                            <span className="text-[8px] font-bold uppercase tracking-widest text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 w-max">Auto Validated</span>
                        )}
                    </div>
                    <div className={`text-[13px] leading-relaxed max-w-2xl font-light ${isDone ? 'text-slate-500' : 'text-slate-600'}`}>{step.description}</div>
                    
                    {isDone && step.completedAt && (
                        <div className="text-[9px] font-mono text-slate-400 mt-3 md:opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3" />
                            Cleared {step.completedAt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 
                            {step.completedByName ? ` by ${step.completedByName}` : ''}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 pt-5 md:pt-0 pl-9 md:pl-0 border-t border-slate-100 md:border-t-0 mt-4 md:mt-0">
                {step.linkedFeature && (
                    <button 
                        onClick={onNavigate}
                        disabled={!step.linkedTab || locked}
                        className={`text-[10px] font-bold uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 ${step.linkedTab && !locked ? 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 shadow-sm border border-indigo-100' : 'text-slate-400 bg-transparent border border-transparent cursor-not-allowed'}`}
                    >
                        Access Task <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                )}
                
                {!step.isAutoDerived && (
                    <>
                        {isActive && onInteract && (
                            <button 
                                onClick={onInteract}
                                className="text-[10px] font-bold uppercase tracking-widest px-5 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-sm hover:shadow"
                            >
                                Sign Off
                            </button>
                        )}
                        {isDone && onUndo && (
                            <button 
                                onClick={onUndo}
                                className="text-[10px] font-bold uppercase tracking-widest px-4 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 transition-all outline outline-1 outline-transparent hover:outline-slate-200"
                            >
                                Undo
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
