import React from 'react';
import { useProjectJourney } from '../../../hooks/useProjectJourney';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { ProjectContext } from '../../../types';

interface ManualStepCompleterProps {
    projectId: string;
    projectContext: ProjectContext | null;
    activeTab: string;
}

export default function ManualStepCompleter({ projectId, projectContext, activeTab }: ManualStepCompleterProps) {
    const { activeSteps, markStepDone } = useProjectJourney(projectId, projectContext);

    if (!activeSteps || activeSteps.length === 0) return null;

    // Find the first active step that is manual and linked to the CURRENT tab
    const currentManualStep = activeSteps.find(s => s.statusSource === 'manual' && s.linkedTab === activeTab);

    if (!currentManualStep) return null;

    return (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-start justify-between shadow-sm">
            <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Required Action</p>
                    <h3 className="font-bold text-indigo-900 text-lg">{currentManualStep.title}</h3>
                    <p className="text-sm text-slate-600 mt-1 max-w-xl">{currentManualStep.description}</p>
                </div>
            </div>
            <button 
                onClick={() => markStepDone(currentManualStep.id)}
                className="shrink-0 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-bold transition-colors"
            >
                <CheckCircle className="w-5 h-5" />
                Complete Step
            </button>
        </div>
    );
}
