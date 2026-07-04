
import React, { useState } from 'react';
import { PaymentMilestone, ProposalContent, ProjectContext } from '../../types';
import { CalendarIcon, PencilIcon, CheckIcon, ScissorsIcon, DeleteIcon, AlertIcon, PlusIcon } from '../Icons';
import { formatCurrency } from '../../lib/utils';
import { useOrg } from '../../contexts/OrgContext';
import { FFDS_PAYMENT_STRUCTURE_DEFAULTS } from '../../services/engagementService';

interface ClientPaymentsProps {
    paymentMilestones: PaymentMilestone[];
    content?: ProposalContent['payments'];
    mode?: 'standard' | 'design_only' | 'pmc';
    projectContext?: ProjectContext;
    onUpdateSchedule?: (milestones: PaymentMilestone[], config: { signupDate?: string, possessionDate?: string }) => void;
    financials?: {
        design: { taxable: number, gst: number, total: number },
        execution: { taxable: number, gst: number, total: number }
    };
    designTotal?: number;
    executionTotal?: number;
    settings?: any; // The combined settings object
    paymentStructure?: any;
}

const ClientPayments: React.FC<ClientPaymentsProps> = ({ paymentMilestones, content, mode = 'standard', projectContext, onUpdateSchedule, financials, designTotal, executionTotal, settings, paymentStructure }) => {
    const { orgData, currentRole } = useOrg();
    const [viewMode, setViewMode] = useState<'project' | 'studio_defaults'>('project');
    const isOwner = currentRole === 'Super Admin' || currentRole === 'Admin';
    
    // Check GST Status
    const isExecutionGstWaived = projectContext?.financials?.executionGstEnabled === false;

    const data = content || { title: "Payment Milestones", subtitle: "Payments are tied to clear progress." };
    
    // Determine the source of truth for payment schedule
    const savedSchedules = projectContext?.paymentSchedules || [];
    const latestSchedule = savedSchedules.length > 0 ? savedSchedules.reduce((latest, current) => {
        return current.version > latest.version ? current : latest;
    }, savedSchedules[0]) : null;

    let designAdvances: any[] = [];
    let executionAdvances: any[] = [];
    let isSplitStructure = false;
    let oldFormatMilestones: any[] = [];
    let showingStudioDefaults = false;

    if (viewMode === 'studio_defaults') {
        const defaultsToUse = paymentStructure || FFDS_PAYMENT_STRUCTURE_DEFAULTS;
        isSplitStructure = true;
        showingStudioDefaults = true;
        designAdvances = defaultsToUse.designStages || [];
        executionAdvances = defaultsToUse.executionStages || [];
    } else {
        if (latestSchedule?.advances) {
            isSplitStructure = true;
            designAdvances = latestSchedule.advances.filter(a => a.phase === 'design');
            executionAdvances = latestSchedule.advances.filter(a => a.phase === 'execution' || a.phase === 'handover' || a.isHandoverAdvance);
        } else {
            oldFormatMilestones = settings?.paymentMilestones?.milestones || [];
        }
    }

    const hasMilestones = isSplitStructure ? (designAdvances.length > 0 || executionAdvances.length > 0) : oldFormatMilestones.length > 0;

    return (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 relative group/container break-inside-avoid">
            
            {/* --- HEADER --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
                <div className="flex-grow">
                    <div className="flex items-center gap-3">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Commercial Terms</div>
                        {viewMode === 'project' && savedSchedules.length > 0 && latestSchedule && (
                            <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                Version {latestSchedule.version}
                            </span>
                        )}
                        {showingStudioDefaults && (
                            <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                Preview
                            </span>
                        )}
                    </div>
                    <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-indigo-950">{data.title}</h2>
                    <p className="mt-2 text-slate-600 max-w-2xl text-sm leading-relaxed whitespace-pre-line">
                        {data.subtitle}
                    </p>
                </div>

                {isOwner && (
                    <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                        <button
                            onClick={() => setViewMode('project')}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${viewMode === 'project' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Project Schedule
                        </button>
                        <button
                            onClick={() => setViewMode('studio_defaults')}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${viewMode === 'studio_defaults' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Preview New Defaults
                        </button>
                    </div>
                )}
            </div>

            {/* --- VISUAL MILESTONES MAP --- */}
            <div className="mt-6">
                {!hasMilestones ? (
                     <div className="p-8 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 text-center">
                         <p className="text-slate-500 font-bold mb-2">No payment milestones configured.</p>
                         <p className="text-sm text-slate-400">[Studio milestones not configured — go to Studio Settings to configure]</p>
                     </div>
                ) : isSplitStructure ? (
                    <div className="space-y-8">
                        {designAdvances.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    A &middot; Design Phase <span className="bg-slate-100 text-[10px] px-2 py-0.5 rounded-full">% OF DESIGN FEE</span>
                                </h3>
                                <div className="space-y-3">
                                    {designAdvances.map((adv: any, idx: number) => (
                                        <div key={`d-${idx}`} className="flex flex-col sm:flex-row items-stretch sm:items-center p-4 border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow bg-white gap-4">
                                            <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 font-black text-xl rounded-xl w-16 flex justify-center items-center py-3 shrink-0">
                                                {adv.percentage || adv.pct}%
                                            </div>
                                            <div className="flex flex-col flex-1 pl-2">
                                                <h4 className="font-bold text-indigo-950">{adv.advanceCode || adv.code} &middot; {adv.label || adv.name}</h4>
                                                <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 mt-1 text-sm">
                                                    <span className="font-semibold text-slate-700">Trigger:</span>
                                                    <span className="text-slate-600">{adv.dueCondition || adv.trigger}</span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">{adv.unlocks}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {executionAdvances.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    B &middot; Execution Phase <span className="bg-slate-100 text-[10px] px-2 py-0.5 rounded-full">% OF EXECUTION VALUE</span>
                                </h3>
                                <div className="space-y-3">
                                    {executionAdvances.map((adv: any, idx: number) => (
                                        <div key={`e-${idx}`} className="flex flex-col sm:flex-row items-stretch sm:items-center p-4 border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow bg-white gap-4">
                                            <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 font-black text-xl rounded-xl w-16 flex justify-center items-center py-3 shrink-0">
                                                {adv.percentage || adv.pct}%
                                            </div>
                                            <div className="flex flex-col flex-1 pl-2">
                                                <h4 className="font-bold text-indigo-950">{adv.advanceCode || adv.code} &middot; {adv.label || adv.name}</h4>
                                                <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 mt-1 text-sm">
                                                    <span className="font-semibold text-slate-700">Trigger:</span>
                                                    <span className="text-slate-600">{adv.dueCondition || adv.trigger}</span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">{adv.unlocks}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {oldFormatMilestones.map((milestone: any, idx: number) => (
                            <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center p-4 border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow bg-white gap-4">
                                <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 font-black text-xl md:text-2xl rounded-xl w-20 flex justify-center items-center py-4 shrink-0">
                                    {milestone.percent}%
                                </div>
                                <div className="flex flex-col flex-1 pl-2">
                                    <h3 className="font-bold text-indigo-950 text-lg">{milestone.label}</h3>
                                    <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 mt-1 text-sm">
                                        <span className="font-semibold text-slate-700">Trigger:</span>
                                        <span className="text-slate-600">{milestone.trigger || milestone.description}</span>
                                    </div>
                                    {milestone.trigger && milestone.description && milestone.description !== milestone.trigger && (
                                        <p className="text-xs text-slate-500 mt-2">{milestone.description}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {settings?.paymentMilestones?.paymentNote && (
                <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 shadow-inner">
                    <span className="font-bold text-indigo-900">Note: </span>
                    {settings.paymentMilestones.paymentNote}
                </div>
            )}

            {/* --- IMPORTANT NOTES & DISCLAIMERS --- */}
            <div className="mt-8 bg-amber-50 border-l-4 border-amber-400 p-5 rounded-r-xl">
                <h4 className="text-xs font-black text-amber-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <AlertIcon className="w-4 h-4"/> Important Notes:
                </h4>
                <ul className="list-disc list-inside text-xs text-slate-700 space-y-2 font-medium leading-relaxed">
                    <li>
                        {mode === 'design_only' || !isExecutionGstWaived 
                            ? "GST @ 18% applicable on all invoices." 
                            : "GST @ 18% applicable only on Professional/Design Fees. Execution billing is net of taxes (Vendor Direct / Cash)."
                        }
                    </li>
                    <li>
                        Due dates are indicative and subject to change based on site conditions and approvals.
                    </li>
                </ul>
            </div>

            {/* Signature Block for PDF Impact */}
            <div className="mt-12 pt-12 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-12 print-only-block hidden print:grid">
                <div className="space-y-8">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">For {settings?.companyName || orgData.orgName || 'Studio'}</div>
                    <div className="h-20 border-b border-slate-300 w-64"></div>
                    <div className="text-xs font-bold text-indigo-950">Authorized Signatory</div>
                </div>
                <div className="space-y-8">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Accepted & Approved By</div>
                    <div className="h-20 border-b border-slate-300 w-64"></div>
                    <div className="text-xs font-bold text-indigo-950">Client Signature & Date</div>
                </div>
            </div>

        </section>
    );
};

export default ClientPayments;
