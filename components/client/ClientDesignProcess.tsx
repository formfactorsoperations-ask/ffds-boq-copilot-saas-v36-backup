
import React from 'react';
import { ProposalContent } from '../../types';
import { StudioSettings } from '../../hooks/useStudioSettings';

interface ClientDesignProcessProps {
    content?: ProposalContent['process'];
    settings?: any; // The combined settings object
}

const ClientDesignProcess: React.FC<ClientDesignProcessProps> = ({ content, settings }) => {
    // Determine the steps to show, prioritize settings.designProcess, fallback to content
    const processSteps = settings?.designProcess?.steps || [];
    const hasConfiguredSteps = processSteps.length > 0;
    
    // Default fallback structural strings
    const title = content?.title || "How we take you from ideas to a locked plan (before execution)";
    const subtitle = settings?.designProcess?.processSummary || content?.subtitle || "Our structured approach to guarantee budget safety and design clarity.";

    return (
        <section id="process" className="py-10">
            <div className="mb-8">
                <span className="inline-block px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full mb-3">Design Process</span>
                <h2 className="text-3xl font-extrabold text-slate-900 mb-2 whitespace-pre-line">{title}</h2>
                <p className="text-slate-500 max-w-3xl text-sm leading-relaxed">
                    {subtitle}
                </p>
            </div>

            {!hasConfiguredSteps ? (
                <div className="p-8 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 text-center">
                    <p className="text-slate-500 font-bold mb-2">No design process steps configured.</p>
                    <p className="text-sm text-slate-400">[Studio process steps not configured — go to Studio Settings to configure]</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {processSteps.map((step: any, index: number) => (
                        <div key={index} className="border border-slate-200 rounded-3xl p-6 bg-white shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center font-black text-sm shrink-0">
                                    {step.stepNumber || index + 1}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-slate-900">{step.title}</h3>
                                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                                        {step.description}
                                    </p>
                                </div>
                            </div>
                            {step.deliverables && step.deliverables.length > 0 && (
                                <div className="flex flex-wrap gap-2 ml-12">
                                    {step.deliverables.map((deliverable: string, i: number) => (
                                        <span key={i} className="px-3 py-1 bg-slate-50 text-slate-600 text-xs font-bold rounded-md">{deliverable}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

export default ClientDesignProcess;
