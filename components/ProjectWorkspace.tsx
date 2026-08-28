import React, { useState, useEffect } from 'react';
import { ProjectContextTier } from './ProjectContextTier';
import { ProjectContext, ProjectStatus, FullProjectData } from '../types';
import { STAGE_LABELS, PHASES } from '../constants/journeyConstants';
import { Lock, CheckCircle2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, X, Compass, Activity, Check, Info, Settings, Edit3, AlertTriangle, LayoutGrid, Handshake, Palette, Layers, FileText, Truck, Hammer, Key, Sparkles, SlidersHorizontal } from 'lucide-react';
import { NAV_CONFIG, ALWAYS_ON_BAND } from './navConfig';
import { useProjectJourney } from '../hooks/useProjectJourney';
import { useOrg } from '../contexts/OrgContext';
import { FFDSLogo } from './FFDSLogo';
import PageTitleBlock from './PageTitleBlock';
import { LogOut, Home, Building2, Users, BarChart3, Library, CreditCard } from 'lucide-react';
import ProjectStatusTransitionModal from './ProjectStatusTransitionModal';
import { FloatingDock, FloatingDockItem } from './ui/floating-dock';

const WORKSPACE_STATUS_MAP: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  lead: { label: "New Lead", color: "text-blue-700", bg: "bg-blue-50 hover:bg-blue-100", border: "border-blue-200" },
  draft: { label: "Drafting", color: "text-slate-700", bg: "bg-slate-100 hover:bg-slate-200", border: "border-slate-200" },
  proposal_sent: { label: "Proposal Sent", color: "text-[#0066CC]", bg: "bg-sky-50 hover:bg-sky-100", border: "border-sky-200" },
  negotiation: { label: "Negotiation", color: "text-amber-700", bg: "bg-amber-50 hover:bg-amber-100", border: "border-amber-200" },
  won: { label: "Won", color: "text-emerald-700", bg: "bg-emerald-50 hover:bg-emerald-100", border: "border-emerald-200" },
  execution: { label: "In Execution", color: "text-purple-700", bg: "bg-purple-50 hover:bg-purple-100", border: "border-purple-200" },
  work_paused: { label: "Work Paused", color: "text-rose-700", bg: "bg-rose-50 hover:bg-rose-100", border: "border-rose-200" },
  completed: { label: "Completed", color: "text-teal-700", bg: "bg-teal-50 hover:bg-teal-100", border: "border-teal-200" },
  lost: { label: "Lost", color: "text-slate-500", bg: "bg-slate-100 hover:bg-slate-200", border: "border-slate-200" },
};

export function ProjectWorkspace({
  projectId,
  projectContext,
  activeTab,
  setActiveTab,
  children,
  currentRole,
  setProjectContext,
  isWizard = false,
  onLeaveProject,
  onStatusChange,
}: {
  projectId: string;
  projectContext: ProjectContext;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
  currentRole: string;
  setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
  isWizard?: boolean;
  onLeaveProject?: (targetTab?: string) => void;
  onStatusChange?: (status: ProjectStatus, note?: string) => Promise<void> | void;
}) {
  const { orgData } = useOrg();
  const [isFloatingWidgetOpen, setIsFloatingWidgetOpen] = useState(false);
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(true);
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [isOpsBannerCollapsed, setIsOpsBannerCollapsed] = useState(true);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  useEffect(() => {
    setIsOpsBannerCollapsed(true);
  }, [activeTab]);

  const lifecycle = projectContext.lifecycle || { stage: 1, subState: 'pending', gates: {} };
  const currentStage = lifecycle.stage;

  const isStageLocked = (stageNum: number) => {
    // Stage 1 (Initial Consultation) is never locked
    if (stageNum === 1) return false;
    // Stages 2, 3, and 4 are unlocked once Stage 1 is complete (currentStage >= 2)
    if (stageNum === 2 || stageNum === 3 || stageNum === 4) {
      return currentStage < 2;
    }
    // Stage 5 and 6 require reaching their respective stages
    return currentStage < stageNum;
  };
  
  const journey = useProjectJourney(projectId, projectContext);
  const { steps = [], markStepDone, markStepPending } = journey;

  const activeTabStage = NAV_CONFIG.find(s => s.items.some(item => item.route === activeTab))?.stage || currentStage;
  const [selectedStage, setSelectedStage] = useState<number>(activeTabStage);

  useEffect(() => {
    const found = NAV_CONFIG.find(s => s.items.some(item => item.route === activeTab));
    if (found) {
      setSelectedStage(found.stage);
    }
  }, [activeTab]);

  const activeStageConfig = NAV_CONFIG.find(c => c.stage === selectedStage) || NAV_CONFIG.find(c => c.stage === currentStage);

  // Local state for expanded stage. By default, the currentStage is expanded.
  const [activeExpandedStage, setActiveExpandedStage] = useState<Record<string, number>>({});

  const getExpanded = (stage: number) => {
    const expanded = activeExpandedStage[projectId];
    if (expanded !== undefined) {
      return expanded === stage;
    }
    return stage === currentStage; // Default: only current stage expanded
  };

  const toggleExpanded = (stage: number) => {
    setActiveExpandedStage(prev => {
      const currentExpanded = prev[projectId] !== undefined ? prev[projectId] : currentStage;
      return {
        ...prev,
        [projectId]: currentExpanded === stage ? 0 : stage
      };
    });
  };

  // Active Phase and Stage Calculations for Floating Widget
  const activePhaseIndex = Math.max(0, Math.min(PHASES.length - 1, currentStage - 1));
  const activePhaseDef = PHASES[activePhaseIndex];
  const activePhaseProgress = journey.phaseProgress?.[activePhaseIndex] || { pct: 0, done: 0, total: 0 };
  const isPhaseComplete = activePhaseProgress.pct === 100;
  const phaseSteps = journey.stepsByPhase?.[activePhaseIndex] || [];

  // Custom messages based on active phase
  let transitionMessage = "Every step is signed off. You can now advance the project to the next lifecycle stage.";
  if (activePhaseIndex === 0) transitionMessage = "Acquisition complete. Ready to advance the project to Design.";
  else if (activePhaseIndex === 1) transitionMessage = "Every step is signed off. Move the project into Contracting.";
  else if (activePhaseIndex === 2) transitionMessage = "Contracting complete. Ready to start Pre-Execution setup.";
  else if (activePhaseIndex === 3) transitionMessage = "Pre-Execution setup complete. Ready to mobilize on-site execution.";
  else if (activePhaseIndex === 4) transitionMessage = "Execution complete. Ready to begin handover closeout.";

  // Function to handle advancing the lifecycle
  const handleAdvanceLifecycle = async (newStage: number) => {
    if (!projectId || !orgData?.id) return;
    try {
      const { advance } = await import('../services/lifecycleService');
      const currentLifecycle = projectContext.lifecycle;
      if (currentLifecycle) {
        if (newStage === 2 && !currentLifecycle.gates?.proposalAccepted?.done) {
          await advance(orgData.id, projectId, { type: 'GATE_ACTIVATE', gate: 'proposalAccepted' });
        }
        if (newStage === 4 && !currentLifecycle.gates?.contractSigned?.done) {
          await advance(orgData.id, projectId, { type: 'GATE_ACTIVATE', gate: 'contractSigned' });
        }
        if (newStage === 5 && !currentLifecycle.gates?.designGateActive?.done) {
          await advance(orgData.id, projectId, { type: 'GATE_ACTIVATE', gate: 'designGateActive' });
        }
        if (newStage === 6 && !currentLifecycle.gates?.handoverComplete?.done) {
          await advance(orgData.id, projectId, { type: 'GATE_ACTIVATE', gate: 'handoverComplete' });
        }
      }

      const updatedLifecycle = await advance(orgData.id, projectId, { type: 'ADVANCE', toStage: newStage as any });
      if (setProjectContext) {
        setProjectContext((prev: any) => ({
          ...prev,
          lifecycle: updatedLifecycle
        }));
      }
    } catch (err) {
      console.error("Failed to advance lifecycle:", err);
    }
  };

  // Helper to get lock text
  const getLockNote = (stage: number) => {
    if (stage === 6 && !(lifecycle.gates as any)?.designGateActive?.done) {
      return { text: "Unlocks when the Design Complete Gate is activated.", linkText: "Go to Design Gate →", linkRoute: "design-gate" };
    }
    // generic fallback for other stages if they somehow lock
    return { text: "Unlocks when prerequisite gates are met.", linkText: "Go to Overview →", linkRoute: "dashboard" };
  };

  const renderNavItem = (item: any, isLockedStage: boolean, isHub: boolean = false) => {
    if (currentRole === 'Designer' && item.money) return null;
    
    let badgeText = item.statusBadge ? item.statusBadge(projectContext) : null;
    let tone = item.badgeTone ? item.badgeTone(projectContext) : 'neutral';
    
    if (currentRole === 'Designer' && badgeText) {
      // Remove ₹ and % for designer just in case
      badgeText = badgeText.replace(/[₹%]/g, '');
    }

    const isActive = activeTab === item.route;

    // Check if there are journey steps associated with this route
    const associatedSteps = (steps || []).filter(s => s.linkedTab === item.route);
    const allDone = associatedSteps.length > 0 && associatedSteps.every(s => s.status === 'done');
    const hasActive = associatedSteps.some(s => s.status === 'active');

    // Tone styling for badge
    let badgeStyle = "bg-slate-50 text-slate-500 border border-slate-200/60";
    if (tone === 'ok') badgeStyle = "bg-emerald-50 text-emerald-700 border border-emerald-200/60";
    else if (tone === 'alert') badgeStyle = "bg-rose-50 text-rose-700 border border-rose-200/60";
    else if (tone === 'warn') badgeStyle = "bg-amber-50 text-amber-700 border border-amber-200/60";

    const IconComponent = item.icon;

    return (
      <div key={item.route} className="flex flex-col w-full">
        <button
          onClick={() => {
            // We route even if locked, per spec: "clicking one opens its module's LockedState"
            setActiveTab(item.route);
          }}
          className={`w-full text-left px-2.5 py-1 rounded-xl text-[13px] transition-all duration-200 flex items-center justify-between group outline-none ${
            isActive 
              ? 'bg-[#0066CC]/[0.06] text-slate-900 font-bold border border-[#0066CC]/15 shadow-sm' 
              : isLockedStage 
                ? 'text-slate-400 hover:bg-slate-50/50' 
                : 'text-slate-600 hover:bg-slate-50/40 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isHub && IconComponent ? (
              <IconComponent className={`w-3.5 h-3.5 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-[#0066CC]' : 'text-slate-400 group-hover:text-slate-600'}`} />
            ) : (
              associatedSteps.length > 0 && (
                allDone ? (
                  <span className="text-emerald-500 shrink-0 text-xs font-bold leading-none" title="Task Done">✓</span>
                ) : hasActive ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0066CC] shrink-0 animate-pulse" title="Pulsing Active" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" title="Idle" />
                )
              )
            )}
            <span className="truncate">{item.label}</span>
          </div>
          {badgeText && (
            <span className={`text-[9px] px-1 py-0.5 rounded-lg font-extrabold shrink-0 ${badgeStyle}`}>
              {badgeText}
            </span>
          )}
        </button>

        {/* 3px Progress Bar under Ops Matrix if in Hub */}
        {isHub && item.label === "Ops Matrix" && (projectContext?.journeySummary?.pct !== undefined || journey.overall.pct !== undefined) && (
          <div className="px-2.5 mt-0.5 mb-1">
            <div className="w-full bg-slate-100 h-[3px] rounded-full overflow-hidden border border-slate-200/10">
              <div 
                className={`h-full transition-all duration-500 ${(projectContext?.journeySummary?.pct ?? journey.overall.pct) === 100 ? 'bg-emerald-500' : 'bg-[#0066CC]'}`}
                style={{ width: `${projectContext?.journeySummary?.pct ?? journey.overall.pct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const getStageCounts = (stageConfig: typeof NAV_CONFIG[0]) => {
    // Filter out items hidden by role rules (Designer cannot see money: true)
    const visibleItems = stageConfig.items.filter(item => !(currentRole === 'Designer' && item.money));
    let doneCount = 0;
    let totalCount = 0;
    
    visibleItems.forEach(item => {
      const associatedSteps = (steps || []).filter(s => s.linkedTab === item.route);
      if (associatedSteps.length > 0) {
        totalCount++;
        const allDone = associatedSteps.every(s => s.status === 'done');
        if (allDone) {
          doneCount++;
        }
      }
    });
    
    return { done: doneCount, total: totalCount };
  };

  const renderOpsBanner = () => {
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Workspace Header .phead */}
      {/* Workspace Sub-Header: Tier 2 Project Bar */}
      <header className="bg-white border-b border-slate-200/80 shrink-0 shadow-2xs relative z-50">
        {/* Row 1: Project Metadata & Project Hub Dropdown */}
        <div className="flex items-center justify-between gap-3 px-4 lg:px-6 py-2.5 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <button 
              onClick={() => onLeaveProject?.()}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors mr-1 cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-[14px] font-bold">Back</span>
            </button>

            <div className="w-px h-5 bg-slate-200 shrink-0 hidden sm:block mx-1"></div>
            
            <button
              onClick={() => {
                setSelectedStage(0);
                setActiveTab('dashboard');
              }}
              className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-[13px] font-bold transition-all shrink-0 ${
                selectedStage === 0 || ALWAYS_ON_BAND.some(i => i.route === activeTab) || activeTab === 'dashboard'
                  ? 'bg-[#0066CC]/90 text-white shadow-md shadow-sky-600/20 backdrop-blur-md border border-white/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Hub
            </button>

            <div className="w-px h-5 bg-slate-200 shrink-0 hidden sm:block mx-1"></div>

            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate ml-1">
              {projectContext.name || 'Untitled Project'}
            </h1>

            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 font-normal ml-2 shrink-0">
              <span className="text-slate-200">|</span>
              <span className="truncate max-w-[140px]">Client: <strong className="text-slate-800 font-semibold">{projectContext.clientName || 'Not Set'}</strong></span>
              <span className="text-slate-200">|</span>
              {(() => {
                const rawStatus = projectContext.status;
                const statusKey = (rawStatus && WORKSPACE_STATUS_MAP[rawStatus]) ? rawStatus : 'draft';
                const statusStyle = WORKSPACE_STATUS_MAP[statusKey];
                return (
                  <button
                    type="button"
                    onClick={() => setIsStatusModalOpen(true)}
                    className={`group/statusBtn flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-2xs hover:scale-105 transition-all cursor-pointer ${statusStyle.bg} ${statusStyle.color} ${statusStyle.border}`}
                    title="Change project lifecycle status & review downstream impact"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
                    <span>{statusStyle.label}</span>
                    <ChevronDown className="w-2.5 h-2.5 opacity-60 group-hover/statusBtn:opacity-100 transition-opacity" />
                  </button>
                );
              })()}
              <span className="text-slate-200">|</span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-700 bg-slate-100/80 border border-slate-200/80 tabular-nums">
                {projectContext.area || 0} SQFT
              </span>
              <ProjectContextTier projectContext={projectContext} />
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5">
              <button onClick={() => { onLeaveProject?.('home'); }} className="group relative w-8 h-8 flex items-center justify-center rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors" aria-label="Home">
                <Home className="w-4 h-4" />
                <span className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 z-50 font-medium whitespace-nowrap shadow-lg">Home</span>
              </button>
              <button onClick={() => { onLeaveProject?.('projects'); }} className="group relative w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors" aria-label="Projects">
                <Building2 className="w-4 h-4" />
                <span className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 z-50 font-medium whitespace-nowrap shadow-lg">Projects</span>
              </button>
              <button onClick={() => { onLeaveProject?.('clients'); }} className="group relative w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors" aria-label="Clients">
                <Users className="w-4 h-4" />
                <span className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 z-50 font-medium whitespace-nowrap shadow-lg">Clients</span>
              </button>
              <button onClick={() => { onLeaveProject?.('reports'); }} className="group relative w-8 h-8 flex items-center justify-center rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors" aria-label="Reports">
                <BarChart3 className="w-4 h-4" />
                <span className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 z-50 font-medium whitespace-nowrap shadow-lg">Reports</span>
              </button>
             
            </div>

            <button 
              onClick={() => setIsFloatingWidgetOpen(!isFloatingWidgetOpen)}
              className="flex items-center gap-2 bg-[#0066CC]/90 hover:bg-[#0055B3] backdrop-blur-md border border-white/20 text-white pl-2 pr-3 py-1.5 rounded-lg transition-all cursor-pointer text-xs font-semibold shadow-md shadow-sky-600/20 overflow-hidden min-w-[200px]"
            >
              <div className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 text-white shadow-inner">
                {Math.round(projectContext.journeySummary?.pct ?? journey.overall.pct ?? 0)}%
              </div>
              <span className="truncate hidden sm:inline-block max-w-[280px]">
                {journey.nextStep?.title || 'Up Next'}
              </span>
              <ChevronRight className={`w-3 h-3 opacity-90 hidden sm:block shrink-0 transition-transform duration-200 ${isFloatingWidgetOpen ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </div>

        {/* Row 2: Stages Row */}
        <div className="bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center flex-wrap w-full z-40 relative">


          {/* Stages */}
          <div className="flex items-center flex-1 py-2 min-w-0 flex-nowrap">
            {[1, 2, 3, 4, 5, 6].map((stg) => {
              const isCompleted = stg < currentStage;
              const isActive = stg === currentStage;
              const isLocked = isStageLocked(stg);
              const stageConfig = NAV_CONFIG.find(c => c.stage === stg);
              const label = STAGE_LABELS[stg] || `Stage ${stg}`;
              const isSelectedStage = selectedStage === stg && !ALWAYS_ON_BAND.some(i => i.route === activeTab) && activeTab !== 'dashboard';
              
              const shortLabel = label.split(' ')[0];

              return (
                <div key={stg} className="flex items-center shrink-0">
                  <div className="relative group flex items-center">
                    <button
                      onClick={() => {
                        if (stageConfig && stageConfig.items.length > 0) {
                          setSelectedStage(stg);
                          setActiveTab(stageConfig.items[0].route);
                        }
                      }}
                      className={`relative flex items-center gap-1 sm:gap-1.5 transition-all duration-300 cursor-pointer shrink-0 py-1.5 px-3 rounded-lg z-0 ${
                        isSelectedStage
                          ? 'text-white font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 tracking-normal hover:tracking-[0.01em]'
                      }`}
                    >
                      {isSelectedStage && (
                          <div
                              className="absolute inset-0 bg-[#0066CC]/90 shadow-md shadow-sky-600/20 backdrop-blur-md border border-white/20 rounded-lg -z-10 transition-all duration-300"
                          />
                      )}
                      <span className={`relative w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors duration-300 ${
                        isSelectedStage ? 'bg-white/20 text-white shadow-sm border border-white/30' :
                        isCompleted ? 'bg-slate-100 text-slate-700' :
                        isActive ? 'bg-slate-200 text-[#0F172A] border border-slate-300' :
                        'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}>
                        {isActive && (
                          <span className="absolute inset-0 rounded-full ring-2 ring-slate-400 animate-ping opacity-75"></span>
                        )}
                        <span className="relative z-10">{stg}</span>
                      </span>
                      <span className="whitespace-nowrap text-[11px] xl:text-[13px] font-medium tracking-tight">
                        {label}
                      </span>
                      {isLocked && <Lock className="w-3 h-3 text-slate-300 ml-0.5" />}
                      <ChevronDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" />
                      
                      {isActive && (
                        <span className="text-[8px] text-[#C5A85C] font-black uppercase tracking-widest ml-0.5 mt-0.5">
                          NOW
                        </span>
                      )}
                    </button>

                    {/* Hover Dropdown */}
                    {stageConfig && stageConfig.items.length > 0 && (
                      <div className={`absolute top-full ${
  stg >= 5 ? 'right-0' : 'left-1/2 -translate-x-1/2'
} mt-0 pt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 z-[100] min-w-[220px] pointer-events-none group-hover:pointer-events-auto`}>
                        <div className="bg-white rounded-xl shadow-xl border border-slate-200/80 p-1.5 flex flex-col">
                          <div className="px-3 py-2 border-b border-slate-100 mb-1 flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                            <span className="text-[10px] font-medium text-slate-400">{stageConfig.items.length} screens</span>
                          </div>
                          {stageConfig.items.map(item => {
                            if (currentRole === 'Designer' && item.money) return null;
                            const isActiveItem = activeTab === item.route;
                            return (
                              <button
                                key={item.route}
                                onClick={() => {
                                  setSelectedStage(stg);
                                  setActiveTab(item.route);
                                }}
                                className={`text-left px-3 py-2 text-[13px] font-medium rounded-lg transition-colors flex justify-between items-center group/item ${
                                  isActiveItem
                                    ? 'bg-sky-50 text-[#0055B3]'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-[#0066CC]'
                                }`}
                              >
                                {item.label}
                                {isActiveItem && <div className="w-1.5 h-1.5 rounded-full bg-[#0066CC] shrink-0" />}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  {stg < 6 && <div className="w-2 sm:w-4 lg:w-8 h-px bg-slate-200 shrink-0 mx-1 sm:mx-2" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Row 3: Stage Sub-Menus (Screens in active/selected stage) */}
        {activeTab !== 'dashboard' && !ALWAYS_ON_BAND.some(i => i.route === activeTab) && selectedStage > 0 && activeStageConfig && activeStageConfig.items.length > 0 && (
          <div className="bg-slate-50/60 border-b border-slate-200 px-4 lg:px-6 py-2 flex items-center gap-2 shrink-0 flex-wrap">
            {activeStageConfig.items.map(item => {
              if (currentRole === 'Designer' && item.money) return null;
              const isActive = activeTab === item.route;
              let badgeText = item.statusBadge ? item.statusBadge(projectContext) : null;
              if (currentRole === 'Designer' && badgeText) {
                badgeText = badgeText.replace(/[₹%]/g, '');
              }
              return (
                <button
                  key={item.route}
                  onClick={() => setActiveTab(item.route)}
                  className={`relative px-3.5 py-1.5 rounded-full text-xs sm:text-[13px] font-semibold transition-all duration-200 flex items-center gap-1.5 cursor-pointer border ${
                    isActive
                      ? 'bg-sky-50 text-[#0066CC] border-sky-200/80 shadow-xs'
                      : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 border-slate-200'
                  }`}
                  title={item.label}
                >
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#0066CC] shrink-0" />}
                  <span className="tracking-tight">{item.label}</span>
                  {badgeText && (
                    <span className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded-full ${
                      isActive ? 'bg-[#0066CC] text-white' : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      {badgeText}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

      {/* Row 4: Project Hub (Always On) */}
        <div className="bg-slate-100/90 border-b border-slate-200 text-slate-600 px-4 lg:px-6 py-1.5 flex items-center justify-start gap-3 flex-wrap shadow-2xs min-h-[52px]">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs shrink-0 mr-1">
            <span className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">PROJECT HUB</span>
            <span className="text-[10px] text-slate-400 font-medium hidden lg:inline">· Always On</span>
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap">
            <FloatingDock
              tooltipPosition="bottom"
              alwaysShowLabels={true}
              items={ALWAYS_ON_BAND.filter((item) => !(currentRole === 'Designer' && item.money)).map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.route || (item.route === 'dashboard' && activeTab === 'dashboard');
                let badgeText = item.statusBadge ? item.statusBadge(projectContext) : null;
                if (currentRole === 'Designer' && badgeText) {
                  badgeText = badgeText.replace(/[₹%]/g, '');
                }
                const badgeTone = item.badgeTone ? item.badgeTone(projectContext) : null;
                return {
                  title: item.label,
                  icon: Icon ? <Icon className="w-full h-full" /> : null,
                  onClick: () => setActiveTab(item.route),
                  badge: badgeText,
                  badgeTone: badgeTone,
                  isActive,
                };
              })}
              desktopClassName="h-auto bg-slate-200/50 border border-slate-200/80 px-2 py-1 gap-1 rounded-xl shadow-2xs"
              mobileClassName=""
            />
          </div>
        </div>

        </header>

      {/* Workspace Body */}
      <div className="flex flex-1 overflow-hidden min-w-0">
        {/* Left Rail removed in favor of 2-tier top header bar */}
        <aside className="hidden">
          {isRailCollapsed ? (
            /* COLLAPSED PROJECT RAIL */
            <div className="flex flex-col h-full items-center py-4 flex-1 justify-between select-none">
              {/* Top fixed Dashboard Button */}
              <div className="flex flex-col items-center gap-4 w-full">
                <button
                  onClick={() => { setSelectedStage(0); setActiveTab('dashboard'); }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center relative transition-all duration-200 group outline-none ${
                    activeTab === 'dashboard' 
                      ? 'bg-[#0066CC]/[0.06] text-slate-900 border border-[#0066CC]/15 shadow-sm' 
                      : 'text-slate-500 hover:bg-slate-100/40 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className={`w-5 h-5 shrink-0 ${activeTab === 'dashboard' ? 'text-[#0066CC]' : 'text-slate-400'}`} />
                  
                  {/* Tooltip */}
                  <div className="absolute left-14 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded shadow-md z-50 whitespace-nowrap font-['Plus_Jakarta_Sans']">
                    Dashboard
                  </div>
                </button>
                
                <div className="w-8 border-b border-slate-200/40" />
                
                {/* Project Hub Center Icons */}
                <div className="flex flex-col items-center gap-2.5 w-full">
                  {ALWAYS_ON_BAND.map(item => {
                    if (currentRole === 'Designer' && item.money) return null;
                    const Icon = item.icon;
                    const isActive = activeTab === item.route;
                    let badgeText = item.statusBadge ? item.statusBadge(projectContext) : null;
                    if (currentRole === 'Designer' && badgeText) {
                      badgeText = badgeText.replace(/[₹%]/g, '');
                    }
                    
                    return (
                      <button
                        key={item.route}
                        onClick={() => setActiveTab(item.route)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center relative transition-all duration-200 group outline-none ${
                          isActive 
                            ? 'bg-[#0066CC]/[0.06] text-slate-900 border border-[#0066CC]/15 shadow-sm' 
                            : 'text-slate-500 hover:bg-slate-100/40 hover:text-slate-900'
                        }`}
                      >
                        {Icon && <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-[#0066CC]' : 'text-slate-400 group-hover:text-slate-600'}`} />}
                        {badgeText && (
                          <span className="absolute -top-1 -right-1 bg-[#0066CC] text-white text-[7.5px] font-extrabold px-1 py-0.5 rounded-full scale-90 leading-none shadow-sm border border-white">
                            {badgeText}
                          </span>
                        )}
                        
                        {/* Tooltip */}
                        <div className="absolute left-14 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded shadow-md z-50 whitespace-nowrap font-['Plus_Jakarta_Sans']">
                          {item.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Workflow Vertical stage stepper nodes */}
              <div className="flex flex-col items-center gap-3 w-full pb-4">
                <div className="w-8 border-t border-slate-200/40 my-1" />
                <div className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">
                  Stages
                </div>
                {[1, 2, 3, 4, 5, 6].map((stage) => {
                  const isCompleted = stage < currentStage;
                  const isActive = stage === currentStage;
                  const isLocked = isStageLocked(stage);
                  const stageConfig = NAV_CONFIG.find(c => c.stage === stage);
                  const label = stageConfig ? stageConfig.label : `Stage ${stage}`;

                  return (
                    <button
                      key={stage}
                      onClick={() => {
                        if (!isLocked && stageConfig && stageConfig.items.length > 0) {
                          setActiveTab(stageConfig.items[0].route);
                        }
                      }}
                      disabled={isLocked}
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all relative group ${
                        isCompleted 
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' 
                          : isActive 
                            ? 'border-[#0066CC] bg-white text-[#0066CC] shadow-sm' 
                            : isLocked
                              ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : stage}
                      
                      {/* Tooltip with list of sub-items inside */}
                      <div className="absolute left-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none bg-slate-900 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-lg z-50 flex flex-col gap-1.5 min-w-[160px] font-['Plus_Jakarta_Sans']">
                        <div className="font-bold border-b border-white/10 pb-1 text-sky-400 flex justify-between items-center gap-2">
                          <span>{label}</span>
                          <span className="text-[9px] text-white/50">{isLocked ? 'Locked' : isCompleted ? 'Completed' : 'Active'}</span>
                        </div>
                        {stageConfig && stageConfig.items.map(subItem => {
                          if (currentRole === 'Designer' && subItem.money) return null;
                          const isSubActive = activeTab === subItem.route;
                          return (
                            <div 
                              key={subItem.route} 
                              className={`text-[10px] pl-1 font-medium flex items-center gap-1.5 ${isSubActive ? 'text-sky-400 font-bold' : 'text-slate-300'}`}
                            >
                              <div className={`w-1 h-1 rounded-full ${isSubActive ? 'bg-[#0066CC]' : 'bg-slate-500'}`} />
                              <span>{subItem.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* FULL EXPANDED PROJECT RAIL */
            <>
              {/* Top fixed Dashboard Button & Project Hub (Permanently anchored & beautifully integrated) */}
              <div className="p-2.5 pb-2 shrink-0 border-b border-[#0066CC]/10 flex flex-col gap-2 bg-white/40">
                {/* Dashboard */}
                <button
                  onClick={() => { setSelectedStage(0); setActiveTab('dashboard'); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl text-[13px] font-semibold transition-colors flex items-center gap-2 ${
                    activeTab === 'dashboard' 
                      ? 'bg-[#0066CC]/[0.06] text-slate-900 font-bold border border-[#0066CC]/15 shadow-sm' 
                      : 'text-slate-700 hover:bg-slate-100/40 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'dashboard' ? 'text-[#0066CC]' : 'text-slate-400'}`} />
                  <span>Dashboard</span>
                </button>

                {/* PROJECT HUB - Always On Card */}
                <div className="bg-sky-50/20 border border-[#0066CC]/10 rounded-2xl p-2 shadow-sm relative overflow-hidden">
                  <div className="flex items-center justify-between mb-1.5 px-0.5">
                    <span className="text-[10px] font-extrabold text-slate-900/60 uppercase tracking-widest font-mono">Project Hub</span>
                    <span className="text-[8px] font-extrabold text-[#0066CC] uppercase tracking-widest font-mono">Always on</span>
                  </div>
                  <div className="space-y-0.5">
                    {ALWAYS_ON_BAND.map(item => renderNavItem(item, false, true))}
                  </div>
                </div>
              </div>

              {/* Scrollable Stage Accordion area */}
              <div className="flex-grow overflow-y-auto custom-scrollbar p-2.5 pt-1.5 space-y-3">
                {/* WORKFLOW Timeline */}
                <div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 px-0.5 font-mono">
                    Workflow
                  </div>
                  {/* Stage Accordion with Segmented Connected Timeline */}
                  <div className="relative space-y-1 pl-1.5">
                    {NAV_CONFIG.map((stageConfig) => {
                      const isCompleted = stageConfig.stage < currentStage;
                      const isActive = stageConfig.stage === currentStage;
                      const isLocked = isStageLocked(stageConfig.stage);
                      const expanded = getExpanded(stageConfig.stage);

                      const { done, total } = getStageCounts(stageConfig);
                      const isStageComplete = total > 0 && done === total;

                      return (
                        <div key={stageConfig.stage} className="relative flex flex-col pl-6 pb-1.5">
                          {/* Vertical Connecting Line segment tinted per state */}
                          {stageConfig.stage < 6 && (
                            <div className={`absolute left-[13px] top-[14px] bottom-[-16px] w-[2px] z-0 transition-colors duration-300 ${
                              isCompleted 
                                ? 'bg-emerald-500' 
                                : isActive 
                                  ? 'bg-[#0066CC]' 
                                  : 'bg-slate-200'
                            }`} />
                          )}

                          {/* Stage icon node position left-0 */}
                          <div className="absolute left-0 top-1 z-10">
                            {isCompleted ? (
                              <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                                <Check className="w-4 h-4 stroke-[3]" />
                              </div>
                            ) : isActive ? (
                              <div className="w-7 h-7 rounded-full border-2 border-[#0066CC] bg-white text-[#0066CC] font-bold text-xs flex items-center justify-center shadow-sm">
                                {stageConfig.stage}
                              </div>
                            ) : (
                              <div className="w-7 h-7 rounded-full border border-slate-200 bg-slate-50 text-slate-400 flex items-center justify-center text-xs font-bold">
                                {isLocked ? <Lock className="w-3 h-3" /> : stageConfig.stage}
                              </div>
                            )}
                          </div>

                          {/* Stage accordion header */}
                          <button 
                            onClick={() => toggleExpanded(stageConfig.stage)}
                            className="w-full flex items-center justify-between px-2 py-0.5 text-[13px] text-slate-800 hover:bg-slate-100/40 rounded-xl group transition-all"
                          >
                            <div className="flex items-center gap-1 min-w-0">
                              <span className={`font-semibold truncate text-left ${isActive ? 'text-slate-900 font-bold font-["Plus_Jakarta_Sans"]' : isLocked ? 'text-slate-400' : 'text-slate-700'}`}>
                                {stageConfig.label}
                              </span>
                              
                              {/* Live stage count badge turning emerald when complete */}
                              {total > 0 && (
                                <span className={`text-[9px] px-1 py-0.5 rounded-full font-extrabold shrink-0 ml-1 ${
                                  isStageComplete 
                                    ? 'bg-emerald-100 text-emerald-700' 
                                    : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {done}/{total}
                                </span>
                              )}
                            </div>
                            
                            <div className="text-slate-400 hover:text-slate-600">
                              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />}
                            </div>
                          </button>
                          
                          {/* Items block */}
                          {expanded && (
                            <div className="pl-2.5 border-l border-slate-200/40 mt-0.5 mb-1 space-y-0.5">
                              {isLocked && (
                                <div className="px-2 py-1 text-xs text-slate-500 bg-slate-50 border border-slate-200/50 rounded-xl mb-1 leading-relaxed font-['Plus_Jakarta_Sans']">
                                  {stageConfig.stage === 5 ? (
                                    <>
                                      Unlocks when the Design Complete Gate is activated →{" "}
                                      <button 
                                        onClick={() => setActiveTab("design-gate")}
                                        className="text-[#0066CC] font-bold hover:underline inline-block"
                                      >
                                        Go to Design Gate
                                      </button>
                                    </>
                                  ) : stageConfig.stage === 6 ? (
                                    <>
                                      Unlocks when execution and handover checklists are cleared.
                                    </>
                                  ) : (
                                    <>
                                      Unlocks when the Initial Consultation is complete.
                                    </>
                                  )}
                                </div>
                              )}
                              {stageConfig.items.map(item => renderNavItem(item, isLocked))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </aside>

      {/* Main Workspace Body — Expanded to 100% Horizontal Viewport Width! */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5 min-w-0 pb-20 w-full">
        {renderOpsBanner()}
        <PageTitleBlock route={activeTab} />
        {children}
      </div>
      </div>

      {/* FLOATING PROCESS WIDGET */}
      {!isWizard && activeTab !== 'project-journey' && journey && journey.overall && projectContext.area > 0 && (projectContext.rooms || []).length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
          {isFloatingWidgetOpen && (
            <div className="w-[380px] max-h-[90vh] bg-white rounded-[24px] shadow-2xl border border-slate-200/80 p-5 text-left flex flex-col pointer-events-auto relative animate-fade-in-up overflow-hidden">
              {/* Close button */}
              <button
                onClick={() => setIsFloatingWidgetOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer z-10"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Phase Eyebrow */}
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                Phase {activePhaseIndex + 1} • {activePhaseDef?.name.toUpperCase() || 'PRE-SALES'}
              </div>

              {/* Phase title & overall progress */}
              <h3 className="text-sm font-bold text-slate-900 font-['Plus_Jakarta_Sans'] mb-2 flex justify-between items-center pr-6">
                <span>{activePhaseProgress.done} of {activePhaseProgress.total} steps</span>
                <span className="text-[11px] bg-sky-50 text-[#0066CC] px-2.5 py-0.5 rounded-full font-bold">{journey.overall.pct}% overall</span>
              </h3>

              {/* Phase Progress Bar */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-4 border border-slate-200/20">
                <div
                  className="bg-[#0066CC] h-full transition-all duration-500 rounded-full"
                  style={{ width: `${activePhaseProgress.pct}%` }}
                ></div>
              </div>

              {/* Intuitive Override Help banner */}
              <div className="p-2.5 bg-amber-50/80 border border-amber-100 rounded-xl flex items-start gap-2 mb-3">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-800 leading-normal font-medium">
                  <strong>Pill Journey Engine:</strong> Click any task checkbox to manually sign off or undo. Manual check-offs act as high-priority overrides and bypass prerequisite locks.
                </p>
              </div>

              {/* Inner state box */}
              <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 flex items-start gap-3 mb-3">
                {isPhaseComplete ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 leading-snug mb-0.5">
                        {activePhaseDef?.name || 'Phase'} phase complete
                      </h4>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        {transitionMessage}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Compass className="w-5 h-5 text-[#0066CC] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 leading-snug mb-0.5">
                        Next: {journey.nextStep?.title || 'Complete steps'}
                      </h4>
                      <p className="text-[11px] text-slate-500 leading-normal line-clamp-2">
                        {journey.nextStep?.description || 'Work on the remaining steps to qualify for the next stage.'}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Compact Collapsible Steps Checklist */}
              {phaseSteps.length > 0 && (
                <div className="mb-4 border border-slate-200/60 rounded-xl overflow-hidden bg-slate-50/30 flex flex-col min-h-0">
                  <button
                    onClick={() => setIsChecklistExpanded(!isChecklistExpanded)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100/80 transition-colors border-b border-slate-200/50 cursor-pointer select-none"
                  >
                    <span className="flex items-center gap-1.5 font-['Plus_Jakarta_Sans'] text-slate-900 font-bold">
                      <Activity className="w-3.5 h-3.5 text-[#0066CC]" />
                      Operational Checklist
                    </span>
                    <span className="text-[10px] text-[#0066CC] bg-sky-50 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                      {activePhaseProgress.done}/{activePhaseProgress.total} 
                      {isChecklistExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </span>
                  </button>
                  {isChecklistExpanded && (
                    <div className="max-h-[220px] overflow-y-auto divide-y divide-slate-100 p-1 bg-white custom-scrollbar">
                      {phaseSteps.map((step) => {
                        const isStepDone = step.status === 'done';
                        const isStepActive = step.status === 'active';
                        const isStepLocked = step.status === 'locked';

                        // Check if it's manually done vs automatically done
                        const isManuallyOverridden = isStepDone && step.completedByName && step.completedByName !== 'System Auto-close' && step.isAutoDerived;

                        return (
                          <div
                            key={step.id}
                            className={`flex flex-col p-2.5 text-xs rounded-xl transition-all mb-1 last:mb-0 ${
                              isStepActive 
                                ? 'bg-sky-50/40 border border-sky-100/50 shadow-sm' 
                                : isStepDone 
                                ? 'bg-slate-50/20' 
                                : 'hover:bg-slate-50/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      if (isStepDone) {
                                        await markStepPending(step.id);
                                      } else {
                                        await markStepDone(step.id);
                                      }
                                    } catch (err) {
                                      console.error("Failed to toggle step completion:", err);
                                    }
                                  }}
                                  className={`mt-0.5 shrink-0 w-5 h-5 rounded-md flex items-center justify-center border transition-all cursor-pointer group/chk ${
                                    isStepDone
                                      ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-100'
                                      : isStepLocked
                                      ? 'border-slate-200 text-slate-400 bg-slate-50 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-600'
                                      : isStepActive
                                      ? 'border-[#0066CC] text-[#0066CC] bg-sky-50 hover:bg-sky-100 hover:border-[#0066CC]'
                                      : 'border-slate-300 hover:border-[#0066CC] hover:bg-slate-50'
                                  }`}
                                  title={
                                    isStepDone 
                                      ? 'Click to Undo Sign Off' 
                                      : isStepLocked 
                                      ? 'Locked by prerequisites. Click to override and force sign-off.' 
                                      : 'Click to Sign Off'
                                  }
                                >
                                  {isStepDone ? (
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  ) : isStepLocked ? (
                                    <Lock className="w-2.5 h-2.5 text-slate-400 group-hover/chk:text-amber-600" />
                                  ) : (
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#0066CC] group-hover/chk:scale-125 transition-transform" />
                                  )}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p
                                      className={`font-semibold leading-snug text-slate-900 ${
                                        isStepDone ? 'text-slate-400 line-through' : ''
                                      }`}
                                    >
                                      {step.title}
                                    </p>
                                    
                                    {/* Indicators/Badges */}
                                    {step.isAutoDerived ? (
                                      <span className="text-[8px] font-bold uppercase tracking-wider text-[#0066CC] bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100/50 inline-flex items-center gap-0.5">
                                        <Settings className="w-2 h-2" /> Auto
                                      </span>
                                    ) : (
                                      <span className="text-[8px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100/40 inline-flex items-center gap-0.5">
                                        <Edit3 className="w-2 h-2" /> Manual
                                      </span>
                                    )}

                                    {isManuallyOverridden && (
                                      <span className="text-[8px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 inline-flex items-center gap-0.5">
                                        Override ✓
                                      </span>
                                    )}
                                  </div>

                                  {/* Step Description or Hint */}
                                  {step.description && !isStepDone && (
                                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                                      {step.description}
                                    </p>
                                  )}

                                  {/* Logged Completion Sign-Off Info */}
                                  {isStepDone && (step.completedByName || step.completedAt) && (
                                    <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                                      ✓ Signed off {step.completedByName ? `by ${step.completedByName}` : ''} 
                                      {step.completedAt ? ` on ${new Date(step.completedAt).toLocaleDateString()}` : ''}
                                    </p>
                                  )}

                                  {/* Locked message / bypass hint */}
                                  {isStepLocked && (
                                    <div className="mt-1 text-[9px] text-amber-600 font-semibold bg-amber-50/40 p-1.5 rounded border border-amber-100/30 flex items-center gap-1">
                                      <Lock className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                      <span>Prerequisites locked. Click box to override and force complete.</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {step.linkedTab && !isStepLocked && (
                                <button
                                  onClick={() => {
                                    setActiveTab(step.linkedTab!);
                                    setIsFloatingWidgetOpen(false);
                                  }}
                                  className="text-[10px] font-bold text-[#0066CC] hover:text-[#0055B3] hover:bg-sky-50 px-1.5 py-1 rounded shrink-0 transition-colors"
                                  title={`Go to ${step.linkedFeature || 'Feature'}`}
                                >
                                  Go →
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2 shrink-0">
                {isPhaseComplete && currentStage < 7 ? (
                  <button
                    onClick={async () => {
                      await handleAdvanceLifecycle(currentStage + 1);
                    }}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 cursor-pointer text-center animate-pulse"
                  >
                    <span>Advance Project to Stage {currentStage + 1} →</span>
                  </button>
                ) : (
                  <>
                    {/* Direct Sign-Off Button for the nextStep */}
                    {journey.nextStep && (
                      <button
                        onClick={async () => {
                          try {
                            await markStepDone(journey.nextStep!.id);
                          } catch (err) {
                            console.error("Failed to sign off current step:", err);
                          }
                        }}
                        className="w-full py-2.5 px-4 bg-[#0066CC] hover:bg-[#0055B3] text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 cursor-pointer text-center"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Sign Off "{journey.nextStep.title}"</span>
                      </button>
                    )}

                    {/* Open Feature button if nextStep is linked */}
                    {journey.nextStep?.linkedTab && (
                      <button
                        onClick={() => {
                          setActiveTab(journey.nextStep!.linkedTab!);
                          setIsFloatingWidgetOpen(false);
                        }}
                        className="w-full py-2.5 px-4 bg-sky-50 hover:bg-sky-100 text-[#0055B3] border border-sky-100/60 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
                      >
                        <span>Open {journey.nextStep.linkedFeature || 'Feature'} →</span>
                      </button>
                    )}
                  </>
                )}

                <button
                  onClick={() => {
                    setActiveTab('project-journey');
                    setIsFloatingWidgetOpen(false);
                  }}
                  className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-slate-400" />
                  <span>View full journey map</span>
                </button>
              </div>
            </div>
          )}

          
        </div>
      )}

      {/* In-Workspace Status Transition Modal */}
      {isStatusModalOpen && (
        <ProjectStatusTransitionModal
          project={{
            id: projectId,
            lastModified: Date.now(),
            context: projectContext,
          }}
          isOpen={isStatusModalOpen}
          onClose={() => setIsStatusModalOpen(false)}
          onStatusChange={async (_projId, newStatus, note) => {
            if (onStatusChange) {
              await onStatusChange(newStatus, note);
            } else if (setProjectContext) {
              setProjectContext((prev) => ({ ...prev, status: newStatus }));
            }
            setIsStatusModalOpen(false);
          }}
        />
      )}

     
    
    </div>
  );
}
