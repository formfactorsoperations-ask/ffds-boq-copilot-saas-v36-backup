import React, { useState } from 'react';
import { ProjectContext } from '../types';
import { advance } from '../services/lifecycleService';
import { useOrg } from '../contexts/OrgContext';

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
  const { orgData } = useOrg();
  const [isSubstantiallyDone, setIsSubstantiallyDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retreatTarget, setRetreatTarget] = useState<number | null>(null);
  const [retreatReason, setRetreatReason] = useState('Scope revised by client request');
  
  // Derive canonical stage from lifecycle
  const currentStage = (typeof projectContext.lifecycle?.stage === 'number') 
    ? projectContext.lifecycle.stage 
    : 1;

  const isPreSales = currentStage === 1;
  const isDesign = currentStage === 2;
  const isContracting = currentStage === 3;
  const isPreExecution = currentStage === 4;
  const isExecution = currentStage === 5;
  const isHandover = currentStage >= 6;

  const phases = [
    { id: 1, label: 'CONSULTATION', desc: 'New Lead / Consultation', active: isPreSales, completed: currentStage > 1 },
    { id: 2, label: 'SCOPE & STRATEGY', desc: 'Drafting & Requirements', active: isDesign, completed: currentStage > 2 },
    { id: 3, label: 'PROPOSAL', desc: 'Proposal Sent & Revisions', active: isContracting, completed: currentStage > 3 },
    { id: 4, label: 'AGREEMENT', desc: 'Agreement & Signoff', active: isPreExecution, completed: currentStage > 4 },
    { id: 5, label: 'EXECUTION', desc: 'Site Execution & Procurement', active: isExecution, completed: currentStage > 5 },
    { id: 6, label: 'HANDOVER', desc: 'Handover & Signoff', active: isHandover, completed: false },
  ];

  const advanceLifecycle = async (newStage: number) => {
      if (!projectId || !orgData?.id) return;
      setError(null);
      
      try {
          const currentLifecycle = projectContext.lifecycle;
          if (currentLifecycle) {
              if (newStage >= 2 && !currentLifecycle.gates?.proposalAccepted?.done) {
                  await advance(orgData.id, projectId, { type: 'GATE_ACTIVATE', gate: 'proposalAccepted' });
              }
              if (newStage >= 4 && !currentLifecycle.gates?.contractSigned?.done) {
                  await advance(orgData.id, projectId, { type: 'GATE_ACTIVATE', gate: 'contractSigned' });
              }
              if (newStage >= 5 && !currentLifecycle.gates?.designGateActive?.done) {
                  await advance(orgData.id, projectId, { type: 'GATE_ACTIVATE', gate: 'designGateActive' });
              }
              if (newStage >= 6 && !currentLifecycle.gates?.handoverComplete?.done) {
                  await advance(orgData.id, projectId, { type: 'GATE_ACTIVATE', gate: 'handoverComplete' });
              }
          }

          const updatedLifecycle = await advance(orgData.id, projectId, { type: 'ADVANCE', toStage: newStage as any });
          setProjectContext((prev: any) => ({ 
              ...prev, 
              lifecycle: updatedLifecycle,
              currentStage: newStage,
              status: newStage === 1 ? 'lead' : newStage === 6 ? 'completed' : newStage === 5 ? 'execution' : newStage === 4 ? 'won' : newStage === 3 ? 'proposal_sent' : 'draft'
          }));
      } catch (err: any) {
          setError(err.message);
          console.error(err);
      }
  };

  const handleRetreat = async () => {
      if (!projectId || !orgData?.id || !retreatTarget) return;
      setError(null);
      try {
          const updatedLifecycle = await advance(orgData.id, projectId, {
              type: 'RETREAT',
              toStage: retreatTarget as any,
              reason: retreatReason.trim() || 'Manual stage rollback'
          });
          setProjectContext((prev: any) => ({
              ...prev,
              lifecycle: updatedLifecycle,
              currentStage: retreatTarget,
              status: retreatTarget === 1 ? 'lead' : retreatTarget === 6 ? 'completed' : retreatTarget === 5 ? 'execution' : retreatTarget === 4 ? 'won' : retreatTarget === 3 ? 'proposal_sent' : 'draft'
          }));
          setRetreatTarget(null);
      } catch (err: any) {
          setError(err.message);
          console.error(err);
      }
  };

  const handleStepClick = (targetStage: number) => {
      if (targetStage === currentStage) return;
      if (targetStage > currentStage) {
          advanceLifecycle(targetStage);
      } else {
          setRetreatTarget(targetStage);
      }
  };

  return (
    <div className="bg-slate-50/80 backdrop-blur-md rounded-[2.5rem] p-8 border border-slate-200/60 shadow-sm relative overflow-hidden group mb-12">
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-slate-100 to-transparent rounded-full blur-3xl opacity-50 pointer-events-none"></div>
      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">Project Phase Controller</h3>
            <p className="text-xs text-slate-500 mt-0.5">Click any stage node or use the selector to switch status</p>
          </div>

          {/* Quick Stage Dropdown Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status:</span>
            <select
              value={currentStage}
              onChange={(e) => handleStepClick(Number(e.target.value))}
              className="bg-white border border-slate-200 text-slate-900 font-bold text-xs rounded-xl px-3.5 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3D52A0] cursor-pointer"
            >
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  Stage {p.id}: {p.label} ({p.desc})
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-xs font-bold text-red-800 hover:underline">Dismiss</button>
            </div>
        )}

        {/* Retreat Reason Modal / Dialog Prompt */}
        {retreatTarget !== null && (
          <div className="mb-6 p-5 bg-amber-50/90 border border-amber-200 rounded-2xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-amber-900">
                Move Project back to Stage {retreatTarget} ({phases.find(p => p.id === retreatTarget)?.label})?
              </h4>
              <button 
                onClick={() => setRetreatTarget(null)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              Backward transitions log a reason in the project lifecycle audit trail.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={retreatReason}
                onChange={(e) => setRetreatReason(e.target.value)}
                placeholder="Reason for moving back (e.g., Client requested scope revision)"
                className="flex-grow px-3.5 py-2 text-xs bg-white border border-amber-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={handleRetreat}
                className="px-5 py-2 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-xl shadow-sm shrink-0 transition-all"
              >
                Confirm Move
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 relative">
          {/* Progress Line */}
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-1 bg-slate-200 -translate-y-1/2 z-0 rounded-full overflow-hidden">
             <div className="h-full bg-sky-900 transition-all duration-700 ease-in-out"
                   style={{ width: `${((currentStage - 1) / 5) * 100}%` }}></div>
          </div>
          {phases.map((phase) => (
            <button
              key={phase.id} 
              onClick={() => handleStepClick(phase.id)}
              title={`Switch to Stage ${phase.id}: ${phase.label}`}
              className="relative z-10 flex flex-col items-center gap-3 group focus:outline-none cursor-pointer"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-all duration-200 ${
                  phase.active ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/90 backdrop-blur-xl border border-sky-800/50 text-white shadow-2xl shadow-sky-600/30 scale-110 ring-4 ring-slate-100' : 
                  phase.completed ? 'bg-sky-900 text-white hover:scale-105' : 
                  'bg-white text-slate-400 border border-slate-200 hover:border-sky-300 hover:text-[#3D52A0]'
              }`}>
                {phase.completed ? '✓' : phase.id}
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${phase.active ? 'text-slate-900' : phase.completed ? 'text-slate-700' : 'text-slate-400 group-hover:text-[#3D52A0]'}`}>
                  {phase.label}
              </span>
            </button>
          ))}
        </div>

        {/* Dynamic Action Area */}
        <div className="mt-10 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 transition-all">
            {currentStage < 6 && (
                <>
                    <div>
                        <h4 className="text-lg font-bold text-slate-800 mb-1">Advance to Stage {currentStage + 1}?</h4>
                        <p className="text-sm text-slate-500 max-w-md leading-relaxed">Transition the project to the next lifecycle stage.</p>
                    </div>
                    {currentStage === 5 && !isSubstantiallyDone ? (
                        <div className="flex flex-col gap-2 items-end">
                            {(() => {
                                const execProgress = projectContext.journeySummary?.phaseProgress?.[4];
                                const execDone = execProgress?.done || 0;
                                if (execDone === 0) {
                                    return (
                                        <div className="text-xs font-semibold text-amber-600 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200/60 mb-2">
                                            ⚠️ Please complete execution steps in the Ops Matrix first (Execution progress is 0%).
                                        </div>
                                    );
                                }
                                return (
                                    <div className="flex items-center gap-2.5">
                                        <input 
                                            type="checkbox" 
                                            id="substantiallyDone" 
                                            checked={isSubstantiallyDone}
                                            onChange={(e) => setIsSubstantiallyDone(e.target.checked)}
                                            className="w-4 h-4 text-[#3D52A0] border-slate-300 rounded focus:ring-[#3D52A0]"
                                        />
                                        <label htmlFor="substantiallyDone" className="text-xs font-semibold text-slate-700 cursor-pointer select-none">
                                            Site work substantially complete
                                        </label>
                                    </div>
                                );
                            })()}
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest px-4 py-3 bg-slate-100 rounded-xl border border-slate-200 shrink-0 select-none">
                                Gate Locked
                            </div>
                        </div>
                    ) : (
                        <button 
                            onClick={() => advanceLifecycle(currentStage + 1)}
                            className="w-full md:w-auto px-8 py-3.5 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 hover:bg-[#334486] text-white font-bold rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                        >
                            Advance to Stage {currentStage + 1} →
                        </button>
                    )}
                </>
            )}
            {isHandover && (
                <div className="w-full flex items-center justify-center py-2">
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span> Project in Handover / Completed
                    </p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

