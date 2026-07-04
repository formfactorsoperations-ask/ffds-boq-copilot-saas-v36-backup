import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ProjectStatus, ProjectContext, ActiveProject, ProjectLifecycle } from '../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebaseClient';

interface PhaseTransitionWidgetProps {
  projectContext: ProjectContext;
  projectId?: string;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

export default function PhaseTransitionWidget({ 
    projectContext, 
    projectId, 
    setProjectContext 
}: PhaseTransitionWidgetProps) {
  const [isSubstantiallyDone, setIsSubstantiallyDone] = useState(false);
  
  // Derive canonical stage from lifecycle or fallback to mapping old status
  const currentStage = useMemo(() => {
     if (projectContext.lifecycle?.stage) return projectContext.lifecycle.stage;
     const st = projectContext.status || 'draft';
     if (['lead', 'draft', 'proposal_sent', 'negotiation'].includes(st)) return 'pre_sales';
     if (st === 'won') return 'design';
     if (['execution', 'work_paused'].includes(st)) return 'execution';
     if (st === 'completed') return 'completed';
     if (st === 'lost') return 'lost';
     return 'pre_sales';
  }, [projectContext.lifecycle?.stage, projectContext.status]);

  const isPreSales = currentStage === 'pre_sales';
  const isDesign = currentStage === 'design';
  const isExecution = currentStage === 'execution';
  const isHandover = currentStage === 'handover';
  const isCompleted = currentStage === 'completed';

  const phases = [
    { id: 'pre_sales', label: 'PRE-SALES', active: isPreSales, completed: ['design', 'execution', 'handover', 'completed'].includes(currentStage) },
    { id: 'design', label: 'DESIGN', active: isDesign, completed: ['execution', 'handover', 'completed'].includes(currentStage) },
    { id: 'execution', label: 'EXECUTION', active: isExecution, completed: ['handover', 'completed'].includes(currentStage) },
    { id: 'handover', label: 'HANDOVER', active: isHandover, completed: currentStage === 'completed' },
  ];

  const advanceLifecycle = async (newStage: ProjectLifecycle['stage'], legacyStatus: ProjectStatus) => {
      const now = new Date().toISOString();
      
      const updatedLifecycle: ProjectLifecycle = {
          ...projectContext.lifecycle,
          stage: newStage,
          updatedAt: now,
      };

      // Optimistic update
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

  return (
    <div className="bg-slate-50/80 backdrop-blur-md rounded-[2.5rem] p-8 border border-slate-200/60 shadow-sm relative overflow-hidden group mb-12">
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-slate-100 to-transparent rounded-full blur-3xl opacity-50 pointer-events-none"></div>

      <div className="relative z-10">
        <h3 className="text-sm font-bold text-indigo-900 tracking-tight mb-8">Project Phase Controller</h3>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 relative">
          
          {/* Progress Line */}
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-1 bg-slate-200 -translate-y-1/2 z-0 rounded-full overflow-hidden">
             <div className="h-full bg-indigo-900 transition-all duration-700 ease-in-out" 
                  style={{ width: isCompleted ? '100%' : isHandover ? '100%' : isExecution ? '66%' : isDesign ? '33%' : '0%' }}></div>
          </div>

          {phases.map((phase, i) => (
            <div key={phase.id} className="relative z-10 flex flex-col items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors ${
                  phase.active ? 'bg-indigo-950/90 backdrop-blur-xl border border-indigo-800/50 text-white shadow-2xl shadow-indigo-950/20 scale-110 ring-4 ring-slate-100' : 
                  phase.completed ? 'bg-indigo-900 text-white' : 
                  'bg-white text-slate-400 border border-slate-200'
              }`}>
                {phase.completed ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${phase.active ? 'text-indigo-950' : phase.completed ? 'text-slate-700' : 'text-slate-400'}`}>
                  {phase.label}
              </span>
            </div>
          ))}
        </div>

        {/* Dynamic Action Area */}
        <div className="mt-10 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 transition-all">
            {isPreSales && currentStage !== 'lost' && (
                <>
                    <div>
                        <h4 className="text-lg font-bold text-indigo-900 mb-1">Move to Design Phase?</h4>
                        <p className="text-sm text-slate-500 max-w-md leading-relaxed">Transition the project to Design when the client approves the initial proposal and pays the token/design fee. This marks the project as "Won".</p>
                    </div>
                    <button 
                        onClick={() => advanceLifecycle('design', 'won')}
                        className="w-full md:w-auto px-8 py-3.5 bg-indigo-950 hover:bg-indigo-900 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        Start Design Phase →
                    </button>
                </>
            )}

            {isDesign && (
                <>
                    <div>
                        <h4 className="text-lg font-bold text-indigo-900 mb-1">Move to Execution Phase?</h4>
                        <p className="text-sm text-slate-500 max-w-md leading-relaxed">Transition when the BOQ is finalized, contracts are signed, and execution advances are received. This activates the timeline and supply chain tools.</p>
                    </div>
                    <button 
                        onClick={() => advanceLifecycle('execution', 'execution')}
                        className="w-full md:w-auto px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        Start Execution Phase 🚀
                    </button>
                </>
            )}

            {isExecution && (
                <>
                    <div className="flex-1">
                        <h4 className="text-lg font-bold text-indigo-900 mb-1">Execution Status</h4>
                        <p className="text-sm text-slate-500 max-w-lg leading-relaxed">
                            {isSubstantiallyDone 
                                ? "Site execution is virtually complete. You may now transition the project to the Handover & Snag clearance stage."
                                : "Execution underway — schedule pre-handover walkthrough when site is substantially complete."}
                        </p>
                        <div className="mt-3 flex items-center gap-2.5">
                            <input 
                                type="checkbox" 
                                id="substantiallyDone" 
                                checked={isSubstantiallyDone}
                                onChange={(e) => setIsSubstantiallyDone(e.target.checked)}
                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                            />
                            <label htmlFor="substantiallyDone" className="text-xs font-semibold text-slate-700 cursor-pointer select-none">
                                Site work is substantially complete (Ready for pre-handover walkthrough)
                            </label>
                        </div>
                    </div>
                    {isSubstantiallyDone ? (
                        <button 
                            onClick={() => advanceLifecycle('handover', 'execution')}
                            className="w-full md:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 animate-in fade-in zoom-in-95 duration-150 shrink-0"
                        >
                            Begin Handover 🔑
                        </button>
                    ) : (
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest px-4 py-3 bg-slate-100 rounded-xl border border-slate-200 shrink-0 select-none">
                            Gate Locked
                        </div>
                    )}
                </>
            )}

            {isHandover && (
                <>
                    <div>
                        <h4 className="text-lg font-bold text-indigo-900 mb-1">Mark as Completed?</h4>
                        <p className="text-sm text-slate-500 max-w-md leading-relaxed">Transition when site handover is complete and final payments (retention aside) are cleared. Project moves to DLP/Warranty tracking.</p>
                    </div>
                    <button 
                        onClick={() => advanceLifecycle('completed', 'completed')}
                        className="w-full md:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        Complete Project 🔐
                    </button>
                </>
            )}

            {isCompleted && (
                <div className="w-full flex items-center justify-center py-2">
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span> Project Successfully Completed
                    </p>
                </div>
            )}

            {currentStage === 'lost' && (
                <div className="w-full flex items-center justify-center py-2">
                    <p className="text-rose-500 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rose-400"></span> Project Lost
                    </p>
                </div>
            )}
        </div>

      </div>
    </div>
  );
}
