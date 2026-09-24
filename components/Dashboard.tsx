import { calculateProjectFinancials } from '../lib/financialsUtils';
import ProjectPnlCard from './ops/ProjectPnlCard';
import React, { useState, useEffect } from 'react';
import { ProjectContext, ProposalTier, FullBoqItem, ActiveProject, Item, ProjectStatus, SiteVisitType } from '../types';
import { formatCurrency, formatINR } from '../lib/utils';
import { db } from '../services/firebaseClient';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { AlertCircleIcon, CheckCircleIcon, DashboardIcon, TrendingUpIcon, TrophyIcon, ClockIcon } from './Icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, FileText, MessageCircle, CheckSquare, Edit, Wand2, ArrowRight, Menu, X, Plus, Lock, Settings2, TrendingDown, ChevronRight, Map, Handshake, Paintbrush, Ruler, Activity, Hammer, Key, Check, Layers, BookOpen, Mail, AlertTriangle } from 'lucide-react';
import { useOrg } from '../contexts/OrgContext';
import { usePaymentHealthScore } from '../hooks/usePaymentHealthScore';
import { PaymentHealthWidget } from './PaymentHealth';
import { SiteVisitLogModal } from './SiteVisitLogModal';
import { SiteActivityWidget } from './SiteActivityWidget';
import { ProcurementGateWidget } from './ProcurementGateWidget';
import { HandoverReadinessWidget } from './HandoverReadinessWidget';
import { ExecutionBundleWidget } from './ExecutionBundleWidget';
import { useCommunicationLog } from '../hooks/useCommunicationLog';
import { useProjectJourney } from '../hooks/useProjectJourney';
import { useMomActions } from '../hooks/useMomActions';
import { PHASES, STAGE_LABELS } from '../constants/journeyConstants';
import { generateProjectFeed, calculateActionProtocol } from './DashboardHelpers';
import { getNextActions } from '../services/nextActionEngine';
import { explainNextActions, isAiAvailable } from '../services/geminiService';
import SiteVisitHistory from '../pages/SiteVisitHistory';


function NextUpCard({ 
    journey,
    nextActionsList, 
    setActiveTab, 
    stage, 
    subState,
    projectContext,
    advanceLifecycle
}: { 
    journey: any,
    nextActionsList: any[], 
    setActiveTab: any, 
    stage: number | string, 
    subState: string,
    projectContext: any,
    advanceLifecycle: (newStage: number) => Promise<void>
}) {
    const [explanation, setExplanation] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    
    const nextJourneyStep = journey.nextStep;

    const handleAskAi = async () => {
        if (!isAiAvailable()) return;
        setLoading(true);
        try {
            const result = await explainNextActions({ stage, subState, actions: nextActionsList.slice(0, 3) });
            setExplanation(result);
        } catch (e) {
            console.error("AI next actions explanation failed:", e);
            setExplanation(null);
        } finally {
            setLoading(false);
        }
    };

    const activePhaseIndex = journey.activeSteps.length > 0 
        ? journey.activeSteps[0].phase 
        : (journey.overall.done === journey.overall.total ? PHASES.length - 1 : 0);
    const activePhaseProgress = journey.phaseProgress[activePhaseIndex] || { pct: 0, done: 0, total: 0 };
    const activePhaseDef = PHASES[activePhaseIndex];
    const currentStageNum = typeof stage === 'number' ? stage : parseInt(stage as string, 10) || 1;

    const STAGE_DETAILS_FOR_SYNC = [
        { id: 1, name: "Initial Consultation" },
        { id: 2, name: "Scope & Strategy" },
        { id: 3, name: "Proposal & Revisions" },
        { id: 4, name: "Agreement & Design" },
        { id: 5, name: "Execution" },
        { id: 6, name: "Handover & Closeout" }
    ];

    const isMismatch = (currentStageNum - 1) !== activePhaseIndex;
    const currentStageName = STAGE_DETAILS_FOR_SYNC[currentStageNum - 1]?.name || "Initial Consultation";
    const suggestedStageName = STAGE_DETAILS_FOR_SYNC[activePhaseIndex]?.name || "Initial Consultation";

    // Custom messages based on active phase
    let transitionMessage = "Every step is signed off. You can now advance the project to the next lifecycle stage.";
    if (activePhaseIndex === 0) transitionMessage = "Acquisition complete. Ready to advance the project to Design.";
    else if (activePhaseIndex === 1) transitionMessage = "Every step is signed off. Move the project into Contracting.";
    else if (activePhaseIndex === 2) transitionMessage = "Contracting complete. Ready to start Pre-Execution setup.";
    else if (activePhaseIndex === 3) transitionMessage = "Pre-Execution setup complete. Ready to mobilize on-site execution.";
    else if (activePhaseIndex === 4) transitionMessage = "Execution complete. Ready to begin handover closeout.";

    const isPhaseComplete = activePhaseProgress.pct === 100;

    return (
        <div className="bg-white/90 backdrop-blur-md px-5 py-4 mb-6 rounded-2xl shadow-2xs border border-slate-200/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                <div>
                    <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                        <span className="w-1.5 h-3.5 bg-amber-500 rounded-sm"></span>
                        Active Focus &amp; Next Steps
                    </h2>
                    <p className="text-xs text-slate-500 font-normal mt-0.5">Your guide to keeping the project moving forward smoothly.</p>
                </div>
                {isAiAvailable() && (
                    <button 
                        onClick={handleAskAi} 
                        disabled={loading} 
                        className="px-3 py-1 text-[10px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/60 rounded-full flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-2xs cursor-pointer self-start sm:self-auto"
                    >
                        {loading ? (
                            <div className="w-3 h-3 border-2 border-amber-800 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <Wand2 className="w-3 h-3 text-amber-700" />
                        )}
                        Ask AI Assistant
                    </button>
                )}
            </div>

            {/* Stage Mismatch Smart Alert Banner */}
            {isMismatch && (
                <div className="mb-4 p-3 bg-amber-50/60 border border-amber-200/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs text-xs">
                    <div className="flex items-start gap-2.5">
                        <AlertCircleIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-[10px] text-amber-900 uppercase tracking-wider">Stage Alignment Recommended</h4>
                            <p className="text-xs text-amber-800 mt-0.5 leading-normal font-normal">
                                Database tracks this project as <strong className="font-semibold">{currentStageName}</strong>, but active milestones are at <strong className="font-semibold">{suggestedStageName}</strong> (Ops Matrix is {journey?.overall?.pct}%).
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={async () => {
                            await advanceLifecycle(activePhaseIndex + 1);
                        }}
                        className="px-3 py-1 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white rounded-lg text-[10px] font-bold transition-all shadow-2xs flex items-center gap-1 shrink-0 cursor-pointer self-start sm:self-auto"
                    >
                        <Activity className="w-3 h-3" />
                        Sync to {suggestedStageName}
                    </button>
                </div>
            )}

            {explanation && (
                <div className="mb-4 p-3 bg-sky-50/60 border border-sky-100/80 rounded-xl text-xs text-slate-900 leading-relaxed font-normal">
                    <div className="flex justify-between items-center mb-1.5">
                        <p className="font-bold flex items-center gap-1 text-sky-900">🤖 AI Guidance Note:</p>
                        <button onClick={() => setExplanation(null)} className="text-[10px] text-sky-700 hover:underline font-semibold">Clear</button>
                    </div>
                    {explanation}
                </div>
            )}

            <div className="w-full">
                <div className="bg-slate-50/60 rounded-xl border border-slate-200/60 p-3.5 space-y-3">
                        
                        {/* Unified Action & Milestone List */}
                        <div className="divide-y divide-slate-100">
                            {/* Primary Journey Milestone Step - Sleek Minimal styling */}
                            {nextJourneyStep && (
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 last:pb-0">
                                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                        <div className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border mt-0.5 shrink-0 bg-amber-50 text-amber-800 border-amber-200/60 whitespace-nowrap">
                                            Milestone
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-bold text-xs text-slate-800 leading-snug flex items-center gap-1.5">
                                                <span>{nextJourneyStep.title}</span>
                                                {nextJourneyStep.isAutoDerived && (
                                                    <span className="text-[8px] font-semibold uppercase text-slate-500 border border-slate-200 bg-white px-1.5 py-0.2 rounded">Auto</span>
                                                )}
                                            </h4>
                                            <p className="text-xs text-slate-500 mt-0.5 font-normal leading-snug">{nextJourneyStep.description}</p>
                                        </div>
                                    </div>
                                    <div className="shrink-0 flex items-center mt-1 sm:mt-0">
                                        {nextJourneyStep.statusSource === 'manual' ? (
                                            <button
                                                onClick={() => journey.markStepDone(nextJourneyStep.id)}
                                                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-full text-[10px] font-bold transition-all cursor-pointer uppercase tracking-wider shadow-2xs"
                                            >
                                                Mark Done ✓
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    if (nextJourneyStep.linkedTab) {
                                                        setActiveTab(nextJourneyStep.linkedTab);
                                                    }
                                                }}
                                                className="px-3 py-1 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 hover:bg-[#334486] text-white rounded-full text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer font-['Plus_Jakarta_Sans'] uppercase tracking-wider shadow-sm"
                                            >
                                                <span>Open ↗</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {nextActionsList.map((action, idx) => {
                                const isBlocked = !!action.blockedBy;
                                let priorityLabel = '';
                                let chipColors = '';
                                switch(action.priority) {
                                    case 'blocker': 
                                        priorityLabel = 'Immediate';
                                        chipColors = 'bg-rose-50 text-rose-700 border-rose-100'; 
                                        break;
                                    case 'due': 
                                        priorityLabel = 'Action Needed';
                                        chipColors = 'bg-[#faf6eb] text-[#9a7d44] border-[#ebdcb9]/40'; 
                                        break;
                                    case 'suggested': 
                                        priorityLabel = 'Suggested';
                                        chipColors = 'bg-slate-50 text-slate-600 border-slate-100'; 
                                        break;
                                    default: 
                                        priorityLabel = action.priority;
                                        chipColors = 'bg-slate-50 text-slate-500 border-slate-100';
                                }

                                return (
                                    <div key={`${action.id}-${idx}`} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2.5 last:pb-0 first:pt-2.5 ${isBlocked ? 'opacity-60' : ''}`}>
                                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                            <div className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border mt-0.5 shrink-0 ${chipColors} whitespace-nowrap`}>
                                                {priorityLabel}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-bold text-xs text-slate-800 font-['Plus_Jakarta_Sans'] leading-snug">{action.title}</h4>
                                                <p className="text-[11px] text-slate-500 mt-0.5 font-light leading-snug">{action.why}</p>
                                                {isBlocked && (
                                                    <p className="text-[9px] font-semibold text-slate-400 mt-0.5 flex items-center gap-1">
                                                        <Lock className="w-2.5 h-2.5 text-slate-300 shrink-0" /> Blocked: {action.blockedBy}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="shrink-0 flex items-center mt-1 sm:mt-0">
                                            <button
                                                disabled={isBlocked}
                                                onClick={() => {
                                                    if (action.route.includes('?focus=')) {
                                                        const [route, focus] = action.route.split('?focus=');
                                                        window.history.replaceState({}, '', `?focus=${focus}`);
                                                        setActiveTab(route);
                                                    } else {
                                                        window.history.replaceState({}, '', window.location.pathname);
                                                        setActiveTab(action.route);
                                                    }
                                                }}
                                                className={`whitespace-nowrap px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all font-['Plus_Jakarta_Sans'] cursor-pointer ${isBlocked ? 'bg-slate-50 text-slate-300 border border-slate-200/20 cursor-not-allowed' : 'border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm'}`}
                                            >
                                                {action.ctaLabel}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Success State when everything is done */}
                        {!nextJourneyStep && nextActionsList.length === 0 && (
                            <div className="py-1 flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs shrink-0">
                                    ✓
                                </div>
                                <div>
                                    <h3 className="font-bold text-xs text-slate-800 font-['Plus_Jakarta_Sans']">Task Docket Clear</h3>
                                    <p className="text-[11px] text-slate-500 font-light">All current milestones, blocking actions, and suggested tasks are complete.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
}


function CommunicationTrackerWidget({ projectId, studioId, onClick }: { projectId: string; studioId: string, onClick: () => void }) {
    const { mergedItems, healthScore, sentCount, pendingCount } = useCommunicationLog(projectId, studioId);
    
    const pendingItems = mergedItems.filter(i => i.template.isRequired && i.log.status === 'pending').slice(0, 2);

    return (
        <div onClick={onClick} className="col-span-1 bg-white rounded-[2.5rem] p-8 md:p-10 border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col cursor-pointer hover:shadow-lg transition-all min-h-[450px] h-full relative">
            <h2 className="text-2xl font-light tracking-tighter text-slate-900 mb-2">Comms Health</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Client Communication</p>
            
            <div className="flex items-center gap-6 mb-8">
                <div className={`text-6xl font-light tracking-tighter ${healthScore === 100 ? 'text-emerald-500' : healthScore > 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                    {healthScore}%
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-800">{sentCount} of {sentCount + pendingCount}</span>
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
                                <span className="text-sm font-semibold text-slate-800 line-clamp-1">{item.template.title}</span>
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
                <span className="text-sm font-semibold text-[#3D52A0] flex items-center gap-1 justify-end">View Tracker <ArrowRight className="w-4 h-4"/></span>
            </div>
        </div>
    );
}

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
    projectArchitecture?: 'legacy' | 'canonical';
    onUpgradeArchitecture?: () => void;
    onModifyBrief?: () => void;
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
  /*
    "Update client feed" is gone with the Daily Site Feed it opened. Logging a
    decision is the action that remains at this stage, so it takes the primary
    slot rather than leaving a highlighted gap.
  */
  'execution': [
    { label: 'Log a decision', icon: <CheckSquare className="w-5 h-5" />, route: 'record-decision', highlight: true }
  ],
  'build-scope': [
    { label: 'Edit scope', icon: <Edit className="w-5 h-5" />, route: 'boq-editor', highlight: true }
  ]
};

// --- Exciting Feature Components ---

const LiveMarquee = ({ items, onNavigate, dark }: { items: any[], onNavigate: (route: string) => void, dark?: boolean }) => {
    if (items.length === 0) {
        return (
            <div className="bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white py-3 px-4 rounded-2xl mb-8 flex items-center shadow-md shadow-sky-600/20">
                <div className="flex items-center gap-2 pr-4 border-r border-white/20 mr-4 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-sky-200">LIVE FEED</span>
                </div>
                <div className="text-xs text-sky-100 font-medium italic">
                    No activity yet for this project — activity will appear here as the project progresses
                </div>
            </div>
        );
    }

    return (
        <div className="overflow-hidden whitespace-nowrap bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white py-3 px-4 rounded-2xl mb-8 flex items-center shadow-md shadow-sky-600/20">
            <div className="flex items-center gap-2 pr-4 border-r border-white/20 mr-4 shrink-0 bg-[#3D52A0]/90 z-10">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-sky-200">LIVE FEED</span>
            </div>
            <motion.div 
                className="flex gap-12 text-xs font-medium tracking-wide will-change-transform"
                animate={{ x: [0, -1500] }}
                transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
                style={{ width: "max-content" }}
            >
                {items.map((item, idx) => (
                    <span key={`a-${idx}`} className="cursor-pointer hover:text-sky-200 transition-colors" onClick={() => onNavigate(item.route)}>
                        {item.emoji} {item.text}
                    </span>
                ))}
                {items.map((item, idx) => (
                    <span key={`b-${idx}`} className="cursor-pointer hover:text-sky-200 transition-colors" onClick={() => onNavigate(item.route)}>
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
                <span className="text-3xl font-light tracking-tighter text-slate-800">{progress}<span className="text-sm">%</span></span>
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
                <h2 className="text-2xl font-light tracking-tighter text-slate-900 mb-2">Mom Actions</h2>
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
                <span className="text-sm font-semibold text-[#3D52A0] flex items-center gap-1">Action Tracker <ArrowRight className="w-4 h-4"/></span>
            </div>
        </div>
    );
}

const Dashboard: React.FC<DashboardProps> = ({ activeTier, fullBoq, projectContext, setActiveTab, setProjectContext, activeProject, setActiveProject, tiers, bank, projectId, projectArchitecture, onUpgradeArchitecture, onModifyBrief }) => {
    const { orgData } = useOrg();
    const [selections, setSelections] = useState<any[]>([]);
    
    // Widget Configuration State
    const WIDGET_OPTIONS = [
        { id: 'weekly-pulse', label: 'Weekly Pulse Tracker' },
        { id: 'project-journey', label: 'Project Journey' },
        { id: 'quick-actions', label: 'Quick Actions' },
        { id: 'financials', label: 'Financials & Scope' },
        { id: 'project-pnl', label: 'Project P&L (margin)' },
        { id: 'ops-intelligence', label: 'Ops Intelligence' },
        { id: 'execution-bundles', label: 'Execution Workspace' },
        { id: 'site-activity', label: 'Site Activity' },
        { id: 'procurement-gate', label: 'Procurement & PO Gate' },
        { id: 'handover-readiness', label: 'Handover Checklist' },
        { id: 'comms-tracker', label: 'Comms Tracker' }
    ];
    
    const DEFAULT_WIDGETS = ['weekly-pulse', 'project-journey', 'quick-actions', 'project-pnl', 'ops-intelligence', 'execution-bundles', 'site-activity', 'procurement-gate', 'handover-readiness'];

    const [activeWidgets, setActiveWidgets] = useState<string[]>(() => {
        const saved = localStorage.getItem('ffds_dashboard_widgets');
        if (!saved) return DEFAULT_WIDGETS;
        let list: string[];
        try { list = JSON.parse(saved); } catch { return DEFAULT_WIDGETS; }
        /*
          Anyone who has used the dashboard before has a saved list, so a new
          widget added to the defaults would never reach them — it would ship
          to nobody but new installs. Introduce it once, and record that it was
          introduced, so a user who then removes it is not overruled next load.
        */
        if (!localStorage.getItem('ffds_widget_intro_pnl')) {
            localStorage.setItem('ffds_widget_intro_pnl', '1');
            if (!list.includes('project-pnl')) {
                const at = list.indexOf('quick-actions');
                if (at >= 0) list.splice(at + 1, 0, 'project-pnl');
                else list.push('project-pnl');
            }
        }
        return list;
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

    const advanceLifecycle = async (newStage: number) => {
        if (!projectId || !orgData?.id) return;
        try {
            const { advance } = await import('../services/lifecycleService');
            const updatedLifecycle = await advance(orgData.id, projectId, { type: 'ADVANCE', toStage: newStage });
            setProjectContext((prev: any) => ({
                ...prev,
                lifecycle: updatedLifecycle
            }));
        } catch (e) {
            console.error("Failed to advance lifecycle:", e);
        }
    };

    useEffect(() => {
        if (!activeProject?.id) return;
        const q = collection(db, 'projects', activeProject.id, 'selections');
        const unsub = onSnapshot(q, snap => {
            setSelections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => {
            // Unhandled here would fail the Firestore queue for the whole page.
            console.warn('Selections unavailable:', (err as any)?.code || err);
            setSelections([]);
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
    const { currentProjectValue, totalPaid, designPaid, executionPaid, totalInvoicedBaseAmt, pendingAmt } = calculateProjectFinancials(projectContext, activeTier);
    
    // Override local values
    const displayContractValueFinal = currentProjectValue || displayContractValue;
    const collectedAmt = totalPaid;
    const designCollectedAmt = designPaid;
    const executionCollectedAmt = executionPaid;
    const actualPercentDisplay = displayContractValueFinal > 0 ? Math.min(100, Math.round((collectedAmt / displayContractValueFinal) * 100)) : 0;
    const expectedPercent = Math.min(100, Math.max(0, health.expectedReceived));
    const cashFlowRisk = (expectedPercent > actualPercentDisplay) || health.pendingCount > 0;

    // Pre-execution Intelligence
    const pricedItems = (fullBoq || []).filter(item => item.rate > 0).length;
    const pricingConfidence = itemCount > 0 ? Math.round((pricedItems / itemCount) * 100) : 0;

    const feedItems = generateProjectFeed(projectContext, activeProject);
    const protocolItems = calculateActionProtocol(projectContext, activeProject, journey);
    const criticalCount = (protocolItems || []).filter(i => i.severity === 'critical').length;

    // Dynamically derive the "What to do today" actions using nextActionEngine
    const currentStageNum = (typeof projectContext.lifecycle?.stage === 'number') ? projectContext.lifecycle.stage : 1;
    const actualPhaseIdx = journey.activeSteps.length > 0 
        ? journey.activeSteps[0].phase 
        : (journey.overall.done === journey.overall.total ? PHASES.length - 1 : 0);
    const isMismatch = (currentStageNum - 1) !== actualPhaseIdx;
    
    const STAGE_DETAILS_FOR_SYNC = [
        { id: 1, name: "Initial Consultation" },
        { id: 2, name: "Scope & Strategy" },
        { id: 3, name: "Proposal & Revisions" },
        { id: 4, name: "Agreement & Design" },
        { id: 5, name: "Execution" },
        { id: 6, name: "Handover & Closeout" }
    ];
    const suggestedStageName = STAGE_DETAILS_FOR_SYNC[actualPhaseIdx]?.name || "Initial Consultation";

    const currentUserRole = orgData?.role || 'Admin';
    const nextActionsCtx = {
        project: projectContext,
        designPaymentStages: projectContext.paymentMilestones,
        designGate: projectContext.designGate,
        drawingTrackerSummary: null, // Can add if needed
        scopeAdditionsSummary: { pending: (projectContext.scopeAdditions || []).filter((s:any) => s.status === 'pending_approval' || s.status === 'pending').length },
        timeline: null
    };
    const nextActionsList = getNextActions(nextActionsCtx, currentUserRole || 'Admin');
    
    const finalTodayItems = nextActionsList.map(a => ({
        title: a.title,
        description: a.why,
        btnText: a.ctaLabel,
        route: a.route,
        badge: a.priority === 'blocker' ? 'High Priority' : 'Action Due',
        badgeColor: a.priority === 'blocker' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-sky-50 text-[#334486] border-sky-100'
    }));


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
            className="space-y-3 md:space-y-4 w-full bg-transparent min-h-screen pb-12"
            variants={containerVariants}
            initial="hidden"
            animate="show"
        >
            {projectArchitecture === 'legacy' && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center justify-between shadow-sm mt-2">
                    <div>
                        <h4 className="font-bold text-amber-900 text-sm">Legacy Project Architecture</h4>
                        <p className="text-xs text-amber-700 mt-1">This project is using the old data model. Upgrade to the new Canonical architecture for improved isolation and stability. This action cannot be undone.</p>
                    </div>
                    {onUpgradeArchitecture && (
                        <button 
                            onClick={onUpgradeArchitecture}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap ml-4"
                        >
                            Upgrade Now
                        </button>
                    )}
                </div>
            )}

            {/* LIVE MARQUEE AT TOP */}
            <div className="mt-2 relative overflow-hidden">
                <LiveMarquee items={feedItems} onNavigate={setActiveTab} dark={true} />
            </div>

            {/* PROJECT LIFECYCLE & CTA */}
            <div className="bg-white rounded-2xl md:rounded-[2rem] p-6 border border-slate-200/60 shadow-sm flex flex-col gap-6 mb-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900">
                            {projectContext.name || 'Untitled Project'}
                        </h1>
                        <p className="text-sm font-medium text-slate-500 mt-1">
                            Client: <span className="text-slate-800">{projectContext.clientName || 'Not Set'}</span> &nbsp;|&nbsp;
                            <span className="capitalize ml-1">{projectContext.status?.replace('_', ' ') || 'New Lead'}</span>
                        </p>
                    </div>
                    {/* PRIMARY CTA FOR CURRENT LIFECYCLE STAGE */}
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-start md:justify-end">
                        <button 
                            onClick={() => setIsWidgetModalOpen(true)}
                            className="px-3 py-2 border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 text-xs font-bold rounded-full shadow-sm transition-colors flex items-center gap-1.5"
                        >
                            <Settings2 className="w-3.5 h-3.5" /> Customize
                        </button>
                        {/* Opened the Daily Site Feed, which has been removed. */}
                        {(!projectContext.approvedTierId && !projectContext.lifecycle?.gates?.proposalAccepted?.done && currentStageNum < 3 && onModifyBrief) && (
                            <button 
                                onClick={onModifyBrief}
                                className="px-4 py-2 border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 text-xs font-bold rounded-full shadow-sm transition-colors flex items-center gap-1.5"
                                title="Re-run the setup wizard to modify initial project parameters"
                            >
                                <Settings2 className="w-3.5 h-3.5" /> Modify Project Brief
                            </button>
                        )}
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
                        {isMismatch ? (
                            <button
                                onClick={async () => {
                                    await advanceLifecycle(actualPhaseIdx + 1);
                                }}
                                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5 animate-pulse cursor-pointer"
                                title={`Realign database stage from ${STAGE_DETAILS_FOR_SYNC[currentStageNum - 1]?.name} to match Ops Matrix: ${suggestedStageName}`}
                            >
                                <Activity className="w-3.5 h-3.5" /> Realign Stage to {suggestedStageName}
                            </button>
                        ) : (
                            <>
                                {currentStageNum === 1 && (
                                    <button
                                        onClick={() => advanceLifecycle(2)}
                                        className="px-5 py-2.5 bg-[#3D52A0]/90 hover:bg-[#334486] text-white backdrop-blur-md border border-white/20 text-xs font-bold rounded-full shadow-md shadow-sky-600/20 transition-all flex items-center gap-1.5"
                                    >
                                        Start Scope & Strategy
                                    </button>
                                )}
                                {currentStageNum === 2 && (
                                    <button
                                        onClick={() => advanceLifecycle(3)}
                                        className="px-5 py-2.5 bg-[#3D52A0]/90 hover:bg-[#334486] text-white backdrop-blur-md border border-white/20 text-xs font-bold rounded-full shadow-md shadow-sky-600/20 transition-all flex items-center gap-1.5"
                                    >
                                        Approve Scope & Start Proposal
                                    </button>
                                )}
                                {currentStageNum === 3 && (
                                    <button
                                        onClick={() => advanceLifecycle(4)}
                                        className="px-5 py-2.5 bg-[#3D52A0]/90 hover:bg-[#334486] text-white backdrop-blur-md border border-white/20 text-xs font-bold rounded-full shadow-md shadow-sky-600/20 transition-all flex items-center gap-1.5"
                                    >
                                        Approve Proposal & Start Agreement
                                    </button>
                                )}
                                {currentStageNum === 4 && (
                                    <button
                                        onClick={() => advanceLifecycle(5)}
                                        className="px-5 py-2.5 bg-[#3D52A0]/90 hover:bg-[#334486] text-white backdrop-blur-md border border-white/20 text-xs font-bold rounded-full shadow-md shadow-sky-600/20 transition-all flex items-center gap-1.5"
                                    >
                                        Sign Contract & Mobilize Execution 🚀
                                    </button>
                                )}
                                {currentStageNum === 5 && (() => {
                                    const isDesignGateDone = !!(projectContext.lifecycle?.gates as any)?.designGateActive?.done;
                                    const execProgress = journey?.phaseProgress?.[4];
                                    const execDone = execProgress?.done || 0;

                                    if (!isDesignGateDone) {
                                        return (
                                            <button
                                                onClick={() => setActiveTab('design-gate')}
                                                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5 animate-pulse cursor-pointer"
                                            >
                                                Unlock Design Gate to Start Execution 🔒
                                            </button>
                                        );
                                    }

                                    if (execDone === 0) {
                                        return (
                                            <button
                                                onClick={() => setActiveTab('project-journey')}
                                                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-500 text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                                                title="Please complete execution steps in the Ops Matrix first"
                                            >
                                                Execution Underway (Ops Matrix 0%) 🚧
                                            </button>
                                        );
                                    }

                                    return (
                                        <button
                                            onClick={() => advanceLifecycle(6)}
                                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                                        >
                                            Initiate Project Handover 🔑
                                        </button>
                                    );
                                })()}
                                {currentStageNum >= 6 && (
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-full text-xs font-bold text-emerald-700">
                                            ✓ Handover / Completed
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* HIGHLY POLISHED DYNAMIC STAGE JOURNEY PROGRESS CARD */}
                {(() => {
                    const STAGE_DETAILS = [
                        { id: 1, name: "Initial Consultation", desc: "Capture client brief & site parameters", icon: (cls: string) => <Handshake className={cls} /> },
                        { id: 2, name: "Scope & Strategy", desc: "Define BOQ scope & tier pricing", icon: (cls: string) => <Paintbrush className={cls} /> },
                        { id: 3, name: "Proposal & Revisions", desc: "Generate proposals & track revisions", icon: (cls: string) => <Layers className={cls} /> },
                        { id: 4, name: "Agreement & Design", desc: "Execute contract & drawing trackers", icon: (cls: string) => <FileText className={cls} /> },
                        { id: 5, name: "Execution", desc: "On-site build underway", icon: (cls: string) => <Hammer className={cls} /> },
                        { id: 6, name: "Handover & Closeout", desc: "Pre-handover snag list & key possession", icon: (cls: string) => <Key className={cls} /> }
                    ];

                    const activeStageIndex = Math.max(1, Math.min(6, currentStageNum)) - 1;
                    const activeStage = STAGE_DETAILS[activeStageIndex] || STAGE_DETAILS[0];
                    const progressPercent = journey?.overall?.pct ?? Math.round((currentStageNum / 6) * 100);

                    return (
                        <div className="bg-slate-50/50 border border-slate-100/80 rounded-[24px] p-6 mt-2 w-full">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                                {/* Left Side: Current Stage Info */}
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-[#3D52A0]/90 text-white flex items-center justify-center shadow-lg shadow-sky-600/20 backdrop-blur-md border border-white/20 shrink-0">
                                        {activeStage.icon("w-6 h-6 stroke-[2]")}
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-[#3D52A0] leading-none">
                                            CURRENT STAGE &bull; {currentStageNum} of 6
                                        </div>
                                        <h3 className="text-xl font-extrabold text-slate-900 font-['Plus_Jakarta_Sans'] tracking-tight leading-none mt-1.5">
                                            {activeStage.name}
                                        </h3>
                                        <p className="text-xs text-slate-500 font-light mt-1.5">
                                            {activeStage.desc}
                                        </p>
                                    </div>
                                </div>

                                {/* Right Side: Overall Progress */}
                                <div className="flex flex-col items-start sm:items-end self-stretch sm:self-auto justify-between sm:justify-center border-t sm:border-t-0 border-slate-200/50 pt-3 sm:pt-0">
                                    <div className="text-3xl font-black text-slate-900 font-['Plus_Jakarta_Sans'] tracking-tight leading-none">
                                        {progressPercent}%
                                    </div>
                                    <button 
                                        onClick={() => setActiveTab('ops-matrix')}
                                        className="text-[9px] font-black text-[#3D52A0] hover:text-[#334486] uppercase tracking-widest flex items-center gap-0.5 mt-2 transition-colors cursor-pointer"
                                    >
                                        VIEW JOURNEY <ChevronRight className="w-3 h-3 stroke-[2.5]" />
                                    </button>
                                </div>
                            </div>

                            {/* 6-Segmented Progress Bar Track */}
                            <div className="flex gap-2 w-full my-6">
                                {STAGE_DETAILS.map((stageItem, idx) => {
                                    const isCompleted = journey?.phaseProgress?.[idx] 
                                        ? journey.phaseProgress[idx].pct === 100 
                                        : idx < activeStageIndex;
                                    const isActive = idx === activeStageIndex;

                                    return (
                                        <div 
                                            key={stageItem.id} 
                                            className={`h-2.5 rounded-full flex-1 transition-all duration-500 ${
                                                isCompleted 
                                                    ? 'bg-emerald-500' 
                                                    : isActive 
                                                        ? 'bg-[#3D52A0]' 
                                                        : 'bg-slate-200/70'
                                            }`}
                                        />
                                    );
                                })}
                            </div>

                            {/* 6 Stage Nodes / Labels Grid */}
                            <div className="grid grid-cols-6 w-full relative pt-1 gap-1">
                                {STAGE_DETAILS.map((stageItem, idx) => {
                                    const isCompleted = journey?.phaseProgress?.[idx] 
                                        ? journey.phaseProgress[idx].pct === 100 
                                        : idx < activeStageIndex;
                                    const isActive = idx === activeStageIndex;

                                    return (
                                        <div key={stageItem.id} className="flex flex-col items-center text-center">
                                            {/* Small circle/badge representing status */}
                                            <div className="h-6 flex items-center justify-center">
                                                {isCompleted ? (
                                                    <div className="w-5 h-5 rounded-full bg-emerald-100/80 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm">
                                                        <Check className="w-3 h-3 stroke-[3]" />
                                                    </div>
                                                ) : isActive ? (
                                                    <div className="w-6 h-6 rounded-full bg-[#3D52A0] text-white flex items-center justify-center shadow-md">
                                                        {stageItem.icon("w-3.5 h-3.5 stroke-[2.5]")}
                                                    </div>
                                                ) : (
                                                    <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-400">
                                                        <Lock className="w-2.5 h-2.5 stroke-[2.5]" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Label */}
                                            <span className={`text-[9px] md:text-[10px] font-extrabold tracking-tight mt-2 whitespace-normal break-words leading-tight text-center max-w-[85px] w-full ${
                                                isActive 
                                                    ? 'text-[#3D52A0]' 
                                                    : isCompleted 
                                                        ? 'text-slate-600' 
                                                        : 'text-slate-400'
                                            }`}>
                                                {stageItem.name}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}
            </div>

            <NextUpCard 
                journey={journey}
                nextActionsList={nextActionsList} 
                setActiveTab={setActiveTab} 
                stage={projectContext.lifecycle?.stage || 1} 
                subState={projectContext.lifecycle?.subState || 'pending'} 
                projectContext={projectContext}
                advanceLifecycle={advanceLifecycle}
            />

            {/* Main Masonry Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                
                {activeWidgets.includes('quick-actions') && (
                    <div className="h-full">
                        <motion.div variants={itemVariants} className="bg-white border border-slate-200/50 rounded-[24px] p-8 shadow-sm transition-all hover:shadow-md relative overflow-hidden flex flex-col h-full min-h-[360px]">
                            {/* Accent Line: single gold hairline */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-amber-500/30" />
                            
                            <div className="flex items-center gap-2.5 mb-6">
                                <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-amber-500">
                                    <Settings2 className="w-4 h-4" />
                                </div>
                                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest font-mono">Quick Actions</h3>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 flex-1">
                                {/* Opened the Daily Site Feed, which has been removed. */}
                                <button 
                                    onClick={() => setActiveTab('record-decision')}
                                    className="p-5 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-amber-500/20 hover:shadow-md/5 text-left group flex flex-col justify-between h-32 transition-all cursor-pointer"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all">
                                        <CheckSquare className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight">Log Decision</h4>
                                        <p className="text-[10px] text-slate-500 mt-1 font-medium leading-snug">Capture client choices</p>
                                    </div>
                                </button>
                                
                                <button 
                                    onClick={() => { setSiteVisitType('site_visit'); setSiteVisitModalOpen(true); }}
                                    className="p-5 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-amber-500/20 hover:shadow-md/5 text-left group flex flex-col justify-between h-32 transition-all cursor-pointer"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-all">
                                        <Hammer className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight">Log Site Visit</h4>
                                        <p className="text-[10px] text-slate-500 mt-1 font-medium leading-snug">Track on-site progress</p>
                                    </div>
                                </button>
                                
                                <button 
                                    onClick={() => { setSiteVisitType('client_meeting'); setSiteVisitModalOpen(true); }}
                                    className="p-5 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-amber-500/20 hover:shadow-md/5 text-left group flex flex-col justify-between h-32 transition-all cursor-pointer"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center group-hover:bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 group-hover:text-white transition-all">
                                        <FileText className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight">Log Meeting</h4>
                                        <p className="text-[10px] text-slate-500 mt-1 font-medium leading-snug">Save MoM checklist</p>
                                    </div>
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {activeWidgets.includes('financials') && (
                    <div className="h-full">
                        <motion.div variants={itemVariants} className="bg-white border border-slate-200/50 rounded-[24px] p-8 shadow-sm transition-all hover:shadow-md relative overflow-hidden flex flex-col h-full min-h-[360px]">
                            {/* Accent Line: subtle gold hairline */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#B5945B]/30" />
                            
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-900">
                                        <Layers className="w-4 h-4" />
                                    </div>
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest font-mono">Financial Ledger</h3>
                                </div>
                                <span className="text-[10px] font-semibold text-slate-400">Owner Access Only</span>
                            </div>
                            
                            {currentUserRole === 'Designer' ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-8 text-center bg-[#FAF9F6]/50 rounded-2xl border border-dashed border-[#B5945B]/25 p-6">
                                    <Lock className="w-7 h-7 text-[#B5945B] mb-2.5 stroke-[1.5]" />
                                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">Financial Visibility Restricted</h4>
                                    <p className="text-xs text-slate-500 max-w-[240px] mt-1.5 leading-normal font-light">
                                        Project value and collection figures are strictly hidden for Designer roles. Please contact the Studio Owner for accounts inquiries.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-6 flex-1 flex flex-col justify-between">
                                    <div className="bg-[#FAF9F5] border border-[#ebdcb9]/40 rounded-2xl p-4 flex justify-between items-center">
                                        <div>
                                            <p className="text-[10px] font-black text-[#9a7d44] uppercase tracking-widest">CONTRACT VALUE</p>
                                            <p className="text-xl font-extrabold tracking-tight text-slate-900 mt-1">{formatINR(displayContractValueFinal)}</p>
                                        </div>
                                        {isExecution && (
                                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100/50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Signed
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">COLLECTED</span>
                                            <span className="text-sm font-extrabold text-emerald-600 block mt-1">{formatINR(collectedAmt)}</span>
                                            <span className="text-[9px] text-slate-500 block mt-0.5 font-medium">Design & Exec</span>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">DUE NOW</span>
                                            <span className="text-sm font-extrabold text-amber-600 block mt-1">{formatINR(pendingAmt)}</span>
                                            <span className="text-[9px] text-slate-500 block mt-0.5 font-medium">Overdue milestones</span>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">UNBILLED</span>
                                            <span className="text-sm font-extrabold text-slate-900 block mt-1">
                                                {formatINR(Math.max(0, displayContractValueFinal - collectedAmt - totalInvoicedBaseAmt))}
                                            </span>
                                            <span className="text-[9px] text-slate-500 block mt-0.5 font-medium">Remaining steps</span>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${actualPercentDisplay}%` }} />
                                        </div>
                                        <div className="flex justify-between items-center mt-2.5">
                                            <span className="text-[10px] text-slate-500 font-medium">{actualPercentDisplay}% collected</span>
                                            <span className="text-[10px] text-slate-500 font-bold">
                                                Ledger Status: <span className={(health.healthStatus === "green" || health.healthStatus === "fully_paid" || health.healthStatus === "neutral" || health.healthStatus === "unconfigured") ? 'text-emerald-600' : 'text-amber-500'}>
                                                    {(health.healthStatus === "green" || health.healthStatus === "fully_paid" || health.healthStatus === "neutral" || health.healthStatus === "unconfigured") ? 'Healthy' : 'Needs Action'}
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}

                {activeWidgets.includes('project-pnl') && (
                    <ProjectPnlCard
                        projectContext={projectContext}
                        boq={fullBoq}
                        projectId={projectId}
                        activeTier={activeTier}
                        currentUserRole={currentUserRole}
                        variants={itemVariants}
                        onOpenProcurement={() => setActiveTab('materials')}
                    />
                )}

                {activeWidgets.includes('project-journey') && (
                    <div className="h-full">
                        <motion.div variants={itemVariants} className="bg-white border border-slate-200/50 rounded-[24px] p-8 shadow-sm transition-all hover:shadow-md relative overflow-hidden flex flex-col h-full min-h-[360px]">
                            {/* Accent Line: subtle gold hairline */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#B5945B]/30" />
                            
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-900">
                                        <Map className="w-4 h-4" />
                                    </div>
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest font-mono">Operations Map</h3>
                                </div>
                                <span className="text-[10px] font-semibold text-slate-400">Velocity Tracking</span>
                            </div>
                            
                            <div className="flex-1 flex flex-col justify-between">
                                <div className="flex items-center gap-6 py-2">
                                    <AnimatedRing progress={journey.overall.pct} colorClass="text-[#B5945B]" size={100} strokeWidth={6} />
                                    <div className="space-y-1">
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Milestones</h4>
                                        <p className="text-base font-extrabold text-slate-900 leading-tight">
                                            {journey.overall.done} of {journey.overall.total} steps completed
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            Current: <span className="font-semibold text-slate-900">{currentStageNum === 6 ? 'Handover' : `Phase ${activePhaseIndex + 1} — ${PHASES[activePhaseIndex]?.name || 'Consultation'}`}</span>
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs space-y-2">
                                    <div className="flex justify-between items-center text-slate-500 font-medium">
                                        <span>Current Stage Completion:</span>
                                        <span className="font-bold text-slate-900">{activePhase.progress.pct}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200/50 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-[#3D52A0] h-full rounded-full transition-all duration-500" style={{ width: `${activePhase.progress.pct}%` }} />
                                    </div>
                                </div>
                                
                                <button 
                                    onClick={() => setActiveTab('project-journey')}
                                    className="w-full mt-4 py-2.5 px-4 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 hover:bg-[#334486] text-white rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                                >
                                    <span>Open Operational Map</span>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {activeWidgets.includes('ops-intelligence') && isExecution && (
                    <div className="h-full">
                        <motion.div variants={itemVariants} className="bg-white border border-slate-200/50 rounded-[24px] p-8 shadow-sm transition-all hover:shadow-md relative overflow-hidden flex flex-col h-full min-h-[360px]">
                            {/* Accent Line */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/20" />
                            
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-900">
                                        <Activity className="w-4 h-4" />
                                    </div>
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest font-mono">Ops Diagnostics</h3>
                                </div>
                                <span className="text-[10px] font-semibold text-slate-400">Milestone Intelligence</span>
                            </div>

                            <div className="space-y-5 flex-1 flex flex-col justify-between">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Execution Velocity</h4>
                                        <div className="flex items-baseline gap-1.5 mt-1">
                                            <span className="text-2xl font-black text-[#3D52A0] tracking-tight">
                                                {isActuallyExecuting ? `${velocityPct}%` : 'N/A'}
                                            </span>
                                            {isActuallyExecuting && (
                                                <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-bold uppercase">
                                                    Active
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-1 font-medium leading-relaxed">
                                            {isActuallyExecuting ? (
                                                velocityDiff === 0 ? 'On exact schedule' : `${Math.abs(velocityDays)} days ${velocityDiff > 0 ? 'ahead of' : 'behind'} schedule`
                                            ) : (
                                                'Pending mobilization'
                                            )}
                                        </p>
                                    </div>

                                    <div>
                                        <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Target Handover</h4>
                                        <div className="flex items-baseline gap-1 mt-1">
                                            <span className="text-sm font-extrabold text-slate-800">
                                                {projectContext.targetHandoverDate ? new Date(projectContext.targetHandoverDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Not set'}
                                            </span>
                                        </div>
                                        {projectContext.handoverPrediction ? (
                                            <div className="mt-1.5 space-y-1">
                                                <div className="flex items-center gap-1">
                                                    <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded font-mono ${
                                                        projectContext.handoverPrediction.riskLevel === 'high' 
                                                            ? 'bg-red-50 text-red-700 border border-red-100' 
                                                            : projectContext.handoverPrediction.riskLevel === 'medium' 
                                                            ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                                    }`}>
                                                        {projectContext.handoverPrediction.riskLevel} risk
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-500 font-medium">
                                                    AI Est: {new Date(projectContext.handoverPrediction.predictedHandoverDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                    {projectContext.handoverPrediction.predictedDelayDays > 0 && (
                                                        <span className="text-red-600 ml-1 font-extrabold">({projectContext.handoverPrediction.predictedDelayDays}d delay)</span>
                                                    )}
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-slate-500 mt-1 font-medium">
                                                Est: {projectContext.handoverDate && projectContext.designApprovedAt 
                                                    ? `${Math.round((projectContext.handoverDate - projectContext.designApprovedAt) / (1000 * 60 * 60 * 24))} Days execution` 
                                                    : '45-60 days standard'}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* AI Risk Alerts Block inside Ops Diagnostics card */}
                                {projectContext.riskAlerts && projectContext.riskAlerts.length > 0 && (
                                    <div className="border-t border-slate-100 pt-4">
                                        <div className="flex justify-between items-center mb-2">
                                            <h4 className="text-[9px] font-bold text-red-900 uppercase tracking-wider flex items-center gap-1 font-mono">
                                                <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> AI Risk Alerts ({projectContext.riskAlerts.length})
                                            </h4>
                                            <button onClick={() => setActiveTab('timeline')} className="text-[9px] font-black text-[#3D52A0] uppercase tracking-wider hover:underline">Resolve →</button>
                                        </div>
                                        <div className="bg-[#FAF9F6] border border-red-100 rounded-xl p-3 max-h-[140px] overflow-y-auto space-y-2.5">
                                            {projectContext.riskAlerts.map((alert: any, idx: number) => (
                                                <div key={idx} className="text-[10px] pb-2 last:pb-0 border-b border-slate-100 last:border-none">
                                                    <div className="flex items-center justify-between font-bold text-slate-800">
                                                        <span>{alert.title}</span>
                                                        <span className={`text-[8px] uppercase px-1 rounded font-mono ${
                                                            alert.severity === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                                                        }`}>
                                                            {alert.severity}
                                                        </span>
                                                    </div>
                                                    <p className="text-slate-500 mt-0.5 leading-relaxed font-sans text-[9px]">{alert.description}</p>
                                                    <div className="mt-1 text-[9px] text-emerald-800 font-medium">
                                                        Mitigation: {alert.mitigation}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="border-t border-slate-100 pt-4 flex-1 flex flex-col justify-end">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Spec & Selection Funnel</h4>
                                        <button onClick={() => setActiveTab('materials')} className="text-[9px] font-black text-[#3D52A0] uppercase tracking-wider hover:underline">Manage →</button>
                                    </div>
                                    <div className="bg-[#FAF9F6] border border-slate-100 rounded-xl p-3 flex justify-between items-center">
                                        <div>
                                            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                {sofSummary.frozen} Specified
                                            </span>
                                            <span className="text-[10px] text-slate-500 block mt-0.5">Approved & procurement-ready</span>
                                        </div>
                                        <div className="flex gap-4 text-right text-[10px] font-bold text-slate-600">
                                            <div>
                                                <span className="text-slate-400 uppercase text-[8px] block tracking-wider">Pending</span>
                                                <span>{sofSummary.pending}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 uppercase text-[8px] block tracking-wider">Review</span>
                                                <span>{sofSummary.pendingSignoff}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Sub-Dashboard Widget: Weekly Pulse Tracker */}
                {activeWidgets.includes('weekly-pulse') && (
                    <div className="h-full">
                        <motion.div variants={itemVariants} className="bg-white border border-slate-200/50 rounded-[24px] p-8 shadow-sm transition-all hover:shadow-md relative overflow-hidden flex flex-col justify-between h-full min-h-[360px]">
                            {/* Accent Line: subtle gold hairline */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#B5945B]/30" />
                            
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-amber-500">
                                            <BookOpen className="w-4 h-4" />
                                        </div>
                                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest font-mono">Weekly Logs</h3>
                                    </div>
                                    <span className="text-[10px] font-bold text-[#B5945B] bg-[#FAF9F5] border border-[#ebdcb9]/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                        Client Experience
                                    </span>
                                </div>

                                {(() => {
                                    const publishedWeeklyReports = (projectContext?.weeklyReports || [])
                                        .filter((r: any) => r.publishedAt)
                                        .sort((a: any, b: any) => b.weekNumber - a.weekNumber);
                                    const latestReport = publishedWeeklyReports[0];

                                    if (!latestReport) {
                                        return (
                                            <div className="space-y-3 py-6 text-center flex flex-col items-center justify-center">
                                                <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mb-1">
                                                    <BookOpen className="w-5 h-5 stroke-[1.5]" />
                                                </div>
                                                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">No Weekly Logs Yet</p>
                                                <p className="text-[11px] text-slate-400 leading-relaxed max-w-[200px] mx-auto font-light">
                                                    Issue chronological progress logs with photos in the Site Control Room.
                                                </p>
                                                <button 
                                                    onClick={() => setActiveTab('site-ops')} 
                                                    className="px-4 py-1.5 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white hover:bg-[#334486] rounded-full text-[10px] font-extrabold uppercase tracking-widest transition-colors shadow-sm mt-2 cursor-pointer"
                                                >
                                                    Open Site Control
                                                </button>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="space-y-4 pt-2">
                                            <div className="space-y-1">
                                                <span className="text-xs font-bold text-slate-900 block">Week {latestReport.weekNumber} Status Report</span>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                                    Published on {new Date(latestReport.publishedAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                            </div>

                                            <div className="p-4 bg-[#FAF9F6] border-l-2 border-[#B5945B] rounded-r-xl">
                                                <p className="text-xs text-slate-600 italic line-clamp-3 leading-relaxed font-serif">
                                                    "{latestReport.thisWeek}"
                                                </p>
                                            </div>

                                            <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold pt-2 border-t border-dashed border-slate-100">
                                                <span className="flex items-center gap-1">📷 <strong className="text-slate-700">{latestReport.photos?.length || 0}</strong> progress photos</span>
                                                <span className="flex items-center gap-1">📋 <strong className="text-slate-700">{latestReport.asks?.length || 0}</strong> client decisions</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="pt-4 border-t border-slate-100 mt-6">
                                <button 
                                    onClick={() => setActiveTab('site-ops')}
                                    className="w-full text-center text-xs font-bold text-slate-900 hover:text-[#B5945B] transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <span>Open Site Control Room</span>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Sub-Dashboard Widget: Site Activity (Google Calendar synced) */}
                {activeWidgets.includes('site-activity') && (
                    <div className="h-full">
                        <motion.div variants={itemVariants} className="h-full min-h-[360px]">
                            <SiteActivityWidget 
                                projectId={projectId || ''} 
                                studioId={orgData?.tenantId || 'demo-tenant-01'} 
                                projectContextName={projectContext?.projectName || projectContext?.clientName || 'N/A'}
                                studioSettings={projectContext?.studioSettings || {}}
                                onOpenHistory={() => setShowSiteVisitHistory(true)}
                                onLogSiteVisit={() => { setSiteVisitType('site_visit'); setSiteVisitModalOpen(true); }}
                                onLogMeeting={() => { setSiteVisitType('client_meeting'); setSiteVisitModalOpen(true); }}
                            />
                        </motion.div>
                    </div>
                )}

                {/* Procurement PO Gate Widget */}
                {activeWidgets.includes('procurement-gate') && (
                    <div className="h-full">
                        <motion.div variants={itemVariants} className="h-full min-h-[360px]">
                            <ProcurementGateWidget 
                                paymentMilestones={projectContext.paymentMilestones || []}
                                sofItems={sofItems}
                                onOpenLedger={() => setActiveTab('financials')}
                            />
                        </motion.div>
                    </div>
                )}

                {/* Handover Checklist Widget */}
                {activeWidgets.includes('handover-readiness') && (
                    <div className="h-full">
                        <motion.div variants={itemVariants} className="h-full min-h-[360px]">
                            <HandoverReadinessWidget 
                                paymentMilestones={projectContext.paymentMilestones || []}
                                snagList={projectContext.snagList || []}
                                sofItems={sofItems}
                                selections={allSelections || []}
                                onOpenSiteOps={() => setActiveTab('site-ops')}
                                currentStage={currentStageNum}
                            />
                        </motion.div>
                    </div>
                )}

                {/* Sub-Dashboard Widget: Comms Tracker Widget */}
                {activeWidgets.includes('comms-tracker') && (
                    <div className="h-full">
                        <motion.div variants={itemVariants} className="bg-white border border-slate-200/50 rounded-[24px] p-8 shadow-sm transition-all hover:shadow-md relative overflow-hidden flex flex-col justify-between h-full min-h-[360px]">
                            {/* Accent Line */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#3D52A0]/90 backdrop-blur-md border border-white/20" />
                            
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-900">
                                            <Mail className="w-4 h-4" />
                                        </div>
                                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest font-mono">Communications</h3>
                                    </div>
                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                        Client Comms
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 py-1 text-center">
                                    <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl">
                                        <span className="text-lg font-extrabold text-slate-900 block">{commsSentCount || 0}</span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">Sent logs</span>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl">
                                        <span className="text-lg font-extrabold text-amber-600 block">{commsPendingCount || 0}</span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">Pending actions</span>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-1">
                                    <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                                        <span>Dispatch Progress</span>
                                        <span className="text-[#B5945B]">{commsHealthScore || 100}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                        <div 
                                            className="bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 h-full rounded-full transition-all duration-500" 
                                            style={{ width: `${commsHealthScore || 100}%` }} 
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100 mt-6">
                                <button 
                                    onClick={() => setActiveTab('comms-tracker')}
                                    className="w-full text-center text-xs font-bold text-slate-900 hover:text-[#334486] transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <span>Manage Client Comms</span>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </div>
            <AnimatePresence>
                {isWidgetModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                            onClick={() => setIsWidgetModalOpen(false)}
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-3xl shadow-xl w-full max-w-md relative z-10 overflow-hidden"
                        >
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                <h2 className="text-lg font-bold text-slate-800">Customize Dashboard</h2>
                                <button onClick={() => setIsWidgetModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>
                            
                            <div className="p-6">
                                <p className="text-xs text-slate-500 mb-6">Select the widgets you want to see on your project dashboard.</p>
                                <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                                    {WIDGET_OPTIONS.map(widget => (
                                        <div 
                                            key={widget.id}
                                            onClick={() => {
                                                if (activeWidgets.includes(widget.id)) {
                                                    setActiveWidgets(activeWidgets.filter(id => id !== widget.id));
                                                } else {
                                                    setActiveWidgets([...activeWidgets, widget.id]);
                                                }
                                            }}
                                            className={`p-4 rounded-xl border transition-colors cursor-pointer flex items-center gap-4 ${
                                                activeWidgets.includes(widget.id) ? 'border-[#B5945B] bg-[#FAF9F6]' : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                                                activeWidgets.includes(widget.id) ? 'bg-[#B5945B] text-white' : 'bg-slate-100 text-transparent'
                                            }`}>
                                                <CheckSquare className="w-4 h-4" />
                                            </div>
                                            <span className={`font-medium text-sm ${activeWidgets.includes(widget.id) ? 'text-slate-900 font-semibold' : 'text-slate-700'}`}>
                                                {widget.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                                <button 
                                    onClick={() => setActiveWidgets(['weekly-pulse', 'project-journey', 'quick-actions', 'ops-intelligence', 'execution-bundles', 'site-activity', 'procurement-gate', 'handover-readiness'])}
                                    className="px-4 py-2.5 rounded-xl font-bold text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex-1 transition-colors"
                                >
                                    Reset to Default
                                </button>
                                <button 
                                    onClick={() => setIsWidgetModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl font-bold text-xs bg-[#3D52A0] text-white hover:bg-[#334486] flex-1 transition-colors shadow-sm"
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
              currentPhaseStep={currentStageNum}
              currentPhaseTitle={STAGE_DETAILS_FOR_SYNC[currentStageNum - 1]?.name || "Agreement & Design"}
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
