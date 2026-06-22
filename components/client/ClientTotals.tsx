
import React, { useState } from 'react';
import { PaymentMilestone, ProposalContent, ProjectContext } from '../../types';
import { CalendarIcon, PencilIcon, CheckIcon, ScissorsIcon, DeleteIcon, AlertIcon, PlusIcon } from '../Icons';
import { formatCurrency } from '../../lib/utils';
import { useOrg } from '../../contexts/OrgContext';

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
}

const ClientPayments: React.FC<ClientPaymentsProps> = ({ paymentMilestones, content, mode = 'standard', projectContext, onUpdateSchedule, financials, designTotal, executionTotal, settings }) => {
    const { orgData } = useOrg();
    
    // Check GST Status
    const isExecutionGstWaived = projectContext?.financials?.executionGstEnabled === false;

    const data = content || { title: "Payment Milestones", subtitle: "Payments are tied to clear progress." };
    const configuredMilestones = settings?.paymentMilestones?.milestones || [];
    const hasConfiguredMilestones = configuredMilestones.length > 0;

    return (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 relative group/container break-inside-avoid">
            
            {/* --- HEADER --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
                <div className="flex-grow">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Commercial Terms</div>
                    <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{data.title}</h2>
                    <p className="mt-2 text-slate-600 max-w-2xl text-sm leading-relaxed whitespace-pre-line">
                        {data.subtitle}
                    </p>
                </div>
            </div>

            {/* --- VISUAL MILESTONES MAP --- */}
            <div className="mt-6">
                {!hasConfiguredMilestones ? (
                     <div className="p-8 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 text-center">
                         <p className="text-slate-500 font-bold mb-2">No payment milestones configured.</p>
                         <p className="text-sm text-slate-400">[Studio milestones not configured — go to Studio Settings to configure]</p>
                     </div>
                ) : (
                    <div className="space-y-4">
                        {configuredMilestones.map((milestone: any, idx: number) => (
                            <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center p-4 border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow bg-white gap-4">
                                <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 font-black text-xl md:text-2xl rounded-xl w-20 flex justify-center items-center py-4 shrink-0">
                                    {milestone.percent}%
                                </div>
                                <div className="flex flex-col flex-1 pl-2">
                                    <h3 className="font-bold text-slate-900 text-lg">{milestone.label}</h3>
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
