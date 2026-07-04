
import React from 'react';
import { TimelinePhase, ProposalContent } from '../../types';

interface ClientTimelineProps {
    timelinePhases: TimelinePhase[];
    content?: ProposalContent['timeline'];
    mode?: 'standard' | 'design_weeks';
}

const ClientTimeline: React.FC<ClientTimelineProps> = ({ timelinePhases, content, mode = 'standard' }) => {
    // Concise, Day-Focused Defaults for Standard Mode (~75 Days Total)
    const defaultPhases: TimelinePhase[] = [
        { phaseName: 'Site Setup & Rough-ins', description: 'Floor protection, civil changes, electrical chasing, and debris removal.', startDay: 1, durationDays: 14 },
        { phaseName: 'Structure & Utilities', description: 'Plywood framework assembly, POP false ceiling channeling, and utility routing.', startDay: 15, durationDays: 21 },
        { phaseName: 'Finishes & Surfaces', description: 'Laminate pressing, tiling work, base coat painting, and shutter installation.', startDay: 36, durationDays: 25 },
        { phaseName: 'Final Handover', description: 'Electrical fittings, deep cleaning, final paint coat, and key handover.', startDay: 61, durationDays: 14 },
    ];

    const phases = timelinePhases.length > 0 ? timelinePhases : defaultPhases;

    const data = content || {
        title: mode === 'design_weeks' ? "Design Delivery Schedule" : "Indicative Timeline",
        subtitle: mode === 'design_weeks' 
            ? "A structured roadmap to take you from concept to execution-ready drawings." 
            : "Timeline can shift based on approvals, site conditions, and selection cycles. This keeps expectations realistic."
    };

    return (
        <section id="timeline" className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
            <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Section 4</div>
                <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-indigo-950">{data.title}</h2>
                <p className="mt-2 text-slate-600 max-w-3xl whitespace-pre-line">
                    {data.subtitle}
                </p>
            </div>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {phases.map((phase, index) => {
                    const start = phase.startDay || 1;
                    const end = start + phase.durationDays;
                    
                    // Display Logic: Use custom displayTime if in weeks mode, otherwise calc days
                    const timeLabel = mode === 'design_weeks' && phase.displayTime 
                        ? phase.displayTime 
                        : `Day ${start}-${end}`;
                    
                    return (
                        <div key={index} className={`rounded-2xl border p-5 flex flex-col h-full transition-all hover:shadow-md ${index === phases.length - 1 ? 'bg-indigo-950 border-indigo-950 text-white' : 'bg-white border-slate-200'}`}>
                            <div className="flex justify-between items-start mb-4">
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${index === phases.length - 1 ? 'bg-indigo-900 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                                    Phase {index + 1}
                                </span>
                                <span className={`text-xs font-bold ${index === phases.length - 1 ? 'text-emerald-400' : 'text-indigo-950'}`}>
                                    {timeLabel}
                                </span>
                            </div>
                            
                            <div className={`mt-auto font-extrabold text-lg leading-tight mb-2 ${index === phases.length - 1 ? 'text-white' : 'text-indigo-950'}`}>
                                {phase.phaseName}
                            </div>
                            
                            <div className={`text-xs leading-relaxed line-clamp-3 ${index === phases.length - 1 ? 'text-slate-400' : 'text-slate-500'}`}>
                                {phase.description}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

export default ClientTimeline;
