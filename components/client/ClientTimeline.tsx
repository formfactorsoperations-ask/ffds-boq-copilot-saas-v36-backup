import React, { useMemo } from 'react';
import { TimelinePhase, ProposalContent } from '../../types';
import { Calendar } from 'lucide-react';

interface ClientTimelineProps {
    timelinePhases: TimelinePhase[];
    content?: ProposalContent['timeline'];
    mode?: 'standard' | 'design_weeks';
}

const ClientTimeline: React.FC<ClientTimelineProps> = ({ 
    timelinePhases, 
    content, 
    mode = 'standard'
}) => {
    // Default Day-Focused phases if none are saved
    const defaultPhases: TimelinePhase[] = [
        { phaseName: 'Design & Planning', description: 'Comprehensive 3D visualizations, material selection, layout signing, and Good-for-Construction (GFC) drawings creation.', startDay: 1, durationDays: 14 },
        { phaseName: 'Site Setup & Rough-ins', description: 'Site mobilization, surface protection laying, demolition/civil alterations, and plumbing/electrical cabling rough-ins.', startDay: 15, durationDays: 14 },
        { phaseName: 'Structure & Utilities', description: 'False ceiling framing, framing for partitions, plywood carcass assembly, and modular unit preparation.', startDay: 29, durationDays: 21 },
        { phaseName: 'Finishes & Surfaces', description: 'Laminate pressing, veneer/polish work, wall putty & priming, counter top stone installation, and first coat painting.', startDay: 50, durationDays: 25 },
        { phaseName: 'Final Handover', description: 'Modular shutter alignment, electrical fixture fits, final paint coat, deep cleaning, snag lists closure, and handover.', startDay: 75, durationDays: 14 },
    ];

    const phases = timelinePhases && timelinePhases.length > 0 ? timelinePhases : defaultPhases;

    const data = content || {
        title: mode === 'design_weeks' ? "Design Delivery Schedule" : "Indicative Timeline",
        subtitle: mode === 'design_weeks' 
            ? "A structured roadmap to take you from concept to execution-ready drawings." 
            : "Timeline can shift based on approvals, site conditions, and selection cycles. This keeps expectations realistic."
    };

    // Sum of execution days only (excluding Phase 1: Design & Planning)
    const executionTotalDays = useMemo(() => {
        return phases
            .filter(p => p.phaseName !== 'Design & Planning')
            .reduce((sum, p) => sum + p.durationDays, 0);
    }, [phases]);

    // Sum of all days
    const grandTotalDays = useMemo(() => {
        return phases.reduce((sum, p) => sum + p.durationDays, 0);
    }, [phases]);

    return (
        <section id="timeline" className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-slate-100 pb-6">
                <div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Section 4</div>
                    <h2 className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{data.title}</h2>
                    <p className="mt-1 text-slate-600 max-w-3xl whitespace-pre-line text-sm">
                        {data.subtitle}
                    </p>
                </div>

                {/* General Stats and totals */}
                <div className="bg-sky-50/50 border border-sky-100 px-4 py-2.5 rounded-2xl flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-2 text-slate-800 font-bold">
                        <Calendar className="w-4 h-4 text-amber-500" />
                        <span>Total Timeline: <strong className="font-mono text-sm font-black text-slate-900">{grandTotalDays} Days</strong></span>
                    </div>
                    <div className="h-4 w-px bg-sky-100"></div>
                    <div className="text-slate-500 font-semibold">
                        Design: <span className="font-mono text-slate-900 font-bold">{(phases.find(p => p.phaseName === 'Design & Planning')?.durationDays || 14)}d</span> | 
                        Execution: <span className="font-mono text-slate-900 font-bold">{executionTotalDays}d</span>
                    </div>
                </div>
            </div>

            {/* Standard Timeline Display */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {phases.map((phase, index) => {
                    const start = phase.startDay || 1;
                    const end = start + phase.durationDays - 1;
                    const isLast = index === phases.length - 1;
                    
                    const timeLabel = mode === 'design_weeks' && phase.displayTime 
                        ? phase.displayTime 
                        : `Day ${start}-${end}`;
                    
                    return (
                        <div 
                            key={index} 
                            className={`rounded-2xl border p-5 flex flex-col h-full transition-all hover:shadow-md relative group ${
                                isLast
                                    ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 border-[#334486] text-white' 
                                    : 'bg-white border-slate-200 text-slate-900'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                                    isLast 
                                        ? 'bg-sky-900 text-slate-300' 
                                        : 'bg-slate-100 text-slate-500'
                                }`}>
                                    Phase {index + 1}
                                </span>
                                <span className={`text-xs font-black font-mono tracking-tight ${
                                    isLast ? 'text-emerald-400' : 'text-slate-900'
                                }`}>
                                    {timeLabel}
                                </span>
                            </div>
                            
                            <div className={`mt-auto font-black text-base leading-tight mb-2 tracking-tight ${
                                isLast ? 'text-white' : 'text-slate-900'
                            }`}>
                                {phase.phaseName}
                            </div>
                            
                            <div className={`text-xs leading-relaxed ${
                                isLast ? 'text-slate-400' : 'text-slate-500'
                            }`}>
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
