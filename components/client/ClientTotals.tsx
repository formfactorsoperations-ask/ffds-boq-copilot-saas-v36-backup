
import React, { useState } from 'react';
import { PaymentMilestone, ProposalContent, ProjectContext } from '../../types';
import { CalendarIcon, PencilIcon, CheckIcon, ScissorsIcon, DeleteIcon, AlertIcon, PlusIcon } from '../Icons';
import { formatCurrency } from '../../lib/utils';
import { useOrg } from '../../contexts/OrgContext';
import { FFDS_PAYMENT_STRUCTURE_DEFAULTS } from '../../services/engagementService';
import { gstTermsOf, gstNoteFor, scheduleFor } from '../../lib/paymentSchedule';

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
    /** The option being proposed: its values are what the schedule splits (lib/paymentSchedule scheduleFor). */
    tierSummary?: { totalSell?: number; designFee?: number };
}

const ClientPayments: React.FC<ClientPaymentsProps> = ({ paymentMilestones, content, mode = 'standard', projectContext, onUpdateSchedule, financials, designTotal, executionTotal, settings, paymentStructure, tierSummary }) => {
    const { orgData, currentRole } = useOrg();
    const [viewMode, setViewMode] = useState<'project' | 'studio_defaults'>('project');
    const isOwner = currentRole === 'Super Admin' || currentRole === 'Admin';
    
    // Check GST Status
    // The GST note follows how Money bills (lib/paymentSchedule.ts): billable share and both switches.
    const gstNote = gstNoteFor(gstTermsOf(projectContext));

    const data = content || { title: "Payment Milestones", subtitle: "Payments are tied to clear progress." };
    
    /*
      One payment schedule (lib/paymentSchedule scheduleFor): Money's saved
      schedule for the project, else the studio's stages from Terms & Payment,
      else FFDS's — the same stages and amounts Money and the booklet show.
      This used to read the last issued Payment Schedule document, or an older
      settings list, so the proposal could show stages Money never billed.
    */
    const schedule = scheduleFor(projectContext, { tierSummary }, { paymentStructure });
    /* Level 2 states the amounts; Level 1 is range-based and states the shares. */
    const showAmounts = !!financials;
    const fmt = (n: number) => formatCurrency(Math.round(n));

    let designAdvances: any[] = [];
    let executionAdvances: any[] = [];
    let showingStudioDefaults = false;

    if (viewMode === 'studio_defaults') {
        const defaultsToUse = paymentStructure || FFDS_PAYMENT_STRUCTURE_DEFAULTS;
        showingStudioDefaults = true;
        designAdvances = defaultsToUse.designStages || [];
        executionAdvances = defaultsToUse.executionStages || [];
    } else {
        designAdvances = schedule.design.stages;
        executionAdvances = mode === 'design_only' ? [] : schedule.execution.stages;
    }

    const hasMilestones = designAdvances.length > 0 || executionAdvances.length > 0;

    return (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 relative group/container break-inside-avoid">
            
            {/* --- HEADER --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
                <div className="flex-grow">
                    <div className="flex items-center gap-3">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Commercial Terms</div>

                        {showingStudioDefaults && (
                            <span className="bg-sky-100 text-[#334486] text-[10px] px-2 py-0.5 rounded-full font-bold">
                                Preview
                            </span>
                        )}
                    </div>
                    <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{data.title}</h2>
                    <p className="mt-2 text-slate-600 max-w-2xl text-sm leading-relaxed whitespace-pre-line">
                        {data.subtitle}
                    </p>
                </div>

                {isOwner && (
                    <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                        <button
                            onClick={() => setViewMode('project')}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${viewMode === 'project' ? 'bg-white shadow-sm text-[#334486]' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Project Schedule
                        </button>
                        <button
                            onClick={() => setViewMode('studio_defaults')}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${viewMode === 'studio_defaults' ? 'bg-white shadow-sm text-[#334486]' : 'text-slate-500 hover:text-slate-700'}`}
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
                ) : (
                    <div className="space-y-8">
                        {designAdvances.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    A &middot; Design Phase <span className="bg-slate-100 text-[10px] px-2 py-0.5 rounded-full">% OF DESIGN FEE</span>
                                </h3>
                                <div className="space-y-3">
                                    {designAdvances.map((adv: any, idx: number) => (
                                        <div key={`d-${idx}`} className="flex flex-col sm:flex-row items-stretch sm:items-center p-4 border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow bg-white gap-4">
                                            <div className="bg-sky-50 border border-sky-100 text-[#334486] font-black text-xl rounded-xl w-16 flex justify-center items-center py-3 shrink-0">
                                                {adv.pct ?? adv.percentage}%
                                            </div>
                                            <div className="flex flex-col flex-1 pl-2">
                                                <h4 className="font-bold text-slate-900">{adv.code || adv.advanceCode} &middot; {adv.name || adv.label}</h4>
                                                <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 mt-1 text-sm">
                                                    <span className="font-semibold text-slate-700">Trigger:</span>
                                                    <span className="text-slate-600">{adv.dueCondition || adv.trigger}</span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">{adv.unlocks}</p>
                                            </div>
                                            {showAmounts && !showingStudioDefaults && typeof adv.amount === 'number' && (
                                                <div className="text-right shrink-0 pr-2">
                                                    <div className="font-bold text-slate-900 tabular-nums">{fmt(adv.amount)}</div>
                                                    <div className="text-[11px] text-slate-500 tabular-nums">{fmt(adv.base)} + GST</div>
                                                </div>
                                            )}
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
                                            <div className="bg-sky-50 border border-sky-100 text-[#334486] font-black text-xl rounded-xl w-16 flex justify-center items-center py-3 shrink-0">
                                                {adv.pct ?? adv.percentage}%
                                            </div>
                                            <div className="flex flex-col flex-1 pl-2">
                                                <h4 className="font-bold text-slate-900">{adv.code || adv.advanceCode} &middot; {adv.name || adv.label}</h4>
                                                <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 mt-1 text-sm">
                                                    <span className="font-semibold text-slate-700">Trigger:</span>
                                                    <span className="text-slate-600">{adv.dueCondition || adv.trigger}</span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">{adv.unlocks}</p>
                                            </div>
                                            {showAmounts && !showingStudioDefaults && typeof adv.amount === 'number' && (
                                                <div className="text-right shrink-0 pr-2">
                                                    <div className="font-bold text-slate-900 tabular-nums">{fmt(adv.amount)}</div>
                                                    <div className="text-[11px] text-slate-500 tabular-nums">{fmt(adv.base)} + GST</div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {showAmounts && !showingStudioDefaults && schedule.design.stages.length > 0 && (
                            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 p-4 rounded-2xl border border-[#3D52A0]/20 bg-[#3D52A0]/[0.05]">
                                <span className="text-sm text-slate-700">
                                    <span className="font-bold text-slate-900">To book:</span> {schedule.design.stages[0].code}, with GST
                                    {schedule.initiationFee > 0 ? `, less the ${fmt(schedule.initiationFee)} Project Initiation Fee already paid` : ''}
                                </span>
                                <span className="font-bold text-slate-900 tabular-nums">{fmt(schedule.booking)}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {settings?.paymentMilestones?.paymentNote && (
                <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 shadow-inner">
                    <span className="font-bold text-slate-800">Note: </span>
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
                        {mode === 'design_only' ? `GST @ ${gstTermsOf(projectContext).rate}% applicable on all invoices.` : gstNote}
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
                    <div className="text-xs font-bold text-slate-900">Authorized Signatory</div>
                </div>
                <div className="space-y-8">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Accepted & Approved By</div>
                    <div className="h-20 border-b border-slate-300 w-64"></div>
                    <div className="text-xs font-bold text-slate-900">Client Signature & Date</div>
                </div>
            </div>

        </section>
    );
};

export default ClientPayments;
