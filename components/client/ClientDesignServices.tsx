
import React from 'react';
import { TimelinePhase } from '../../types';

interface ClientTimelineProps {
    timelinePhases: TimelinePhase[];
}

const ClientTimeline: React.FC<ClientTimelineProps> = ({ timelinePhases }) => {
    // If no phases, create a default
    const phases = timelinePhases.length > 0 ? timelinePhases : [
        { phaseName: 'Design & Planning', description: '10-15 days', startDay: 0, durationDays: 15 },
        { phaseName: 'Civil + Electrical', description: '30-40 days', startDay: 15, durationDays: 40 },
        { phaseName: 'Carpentry + Finishing', description: '30-35 days', startDay: 55, durationDays: 35 },
        { phaseName: 'Final Handover', description: '5-7 days', startDay: 90, durationDays: 7 },
    ];

    return (
        <section id="timeline" className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
            <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Section 4</div>
                <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">Indicative Timeline</h2>
                <p className="mt-2 text-slate-600 max-w-3xl">
                    Timeline can shift based on approvals, site conditions, and selection cycles. This keeps expectations realistic.
                </p>
            </div>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                {phases.map((phase, index) => (
                    <div key={index} className={`rounded-3xl border p-5 ${index === phases.length - 1 ? 'bg-slate-50 border-slate-200' : 'bg-[#F7F7F6] border-slate-200'}`}>
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Phase {index + 1}</div>
                        <div className="mt-2 font-extrabold text-lg text-slate-900">{phase.phaseName}</div>
                        <div className="mt-1 text-slate-600 text-sm">{phase.description}</div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default ClientTimeline;
