import React from 'react';
import { PaymentMilestone } from '../types';
import { CheckIcon, DeleteIcon } from './Icons';
import { RotateCcw } from 'lucide-react';

interface MilestoneCardViewProps {
    items: PaymentMilestone[];
    milestones: PaymentMilestone[];
    baseAmount: number;
    originalBaseAmount: number;
    isExecution: boolean;
    billablePercent: number;
    executionGstEnabled: boolean;
    gstRate: number;
    initiationFee: number;
    unpaidItems: PaymentMilestone[];
    remainingBaseAmount: number;
    handleDeleteMilestone: (index: number) => void;
    handleUpdateMilestone: (index: number, updates: Partial<PaymentMilestone>) => void;
    handleInvoiceAction: (index: number, action: string, lockedTaxableBase?: number) => void;
    formatCurrency: (val: number) => string;
}

export const MilestoneCardView: React.FC<MilestoneCardViewProps> = ({
    items,
    milestones,
    baseAmount,
    originalBaseAmount,
    isExecution,
    billablePercent,
    executionGstEnabled,
    gstRate,
    initiationFee,
    unpaidItems,
    remainingBaseAmount,
    handleDeleteMilestone,
    handleUpdateMilestone,
    handleInvoiceAction,
    formatCurrency
}) => {
    return (
        <div className="p-6 space-y-4 bg-stone-50/20">
            {items.map((m, i) => {
                const isCleared = m.status === 'paid' || m.status === 'invoiced';
                let rowBaseOriginal = 0;
                let effectiveTaxableBaseForLocking = baseAmount;
                if (isCleared) {
                    rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : ((m.lockedTaxableBase || originalBaseAmount) * (m.percentage / 100));
                    effectiveTaxableBaseForLocking = m.lockedTaxableBase || originalBaseAmount;
                } else {
                    if (m.isFixedAmount && m.fixedAmount !== undefined) {
                        rowBaseOriginal = m.fixedAmount;
                    } else {
                        const fixedPendingTotal = unpaidItems.filter(x => x.isFixedAmount).reduce((sum, x) => sum + (x.fixedAmount || 0), 0);
                        const remainingBaseForPercentages = Math.max(0, remainingBaseAmount - fixedPendingTotal);
                        
                        const unpaidPctExcludingFixed = unpaidItems.filter(x => !x.isFixedAmount).reduce((sum, x) => sum + x.percentage, 0);
                        const relativePct = unpaidPctExcludingFixed > 0 ? (m.percentage / unpaidPctExcludingFixed) : 0;
                        rowBaseOriginal = remainingBaseForPercentages * relativePct;
                    }
                    effectiveTaxableBaseForLocking = m.percentage > 0 ? (rowBaseOriginal / (m.percentage / 100)) : baseAmount;
                }
                rowBaseOriginal = Math.round(rowBaseOriginal);
                
                let rowBillable = Math.round(isExecution ? rowBaseOriginal * (billablePercent / 100) : rowBaseOriginal);
                
                const applicableGstRate = isExecution ? (executionGstEnabled ? gstRate : 0) : gstRate;
                let rowGST = Math.round(rowBillable * (applicableGstRate / 100));
                
                let rowInvoiceTotal = Math.round(rowBillable + rowGST);
                
                let deductedInitiationFee = 0;
                if (!isExecution && i === 0 && initiationFee > 0) {
                    deductedInitiationFee = Math.min(rowInvoiceTotal, initiationFee);
                    rowInvoiceTotal = Math.max(0, rowInvoiceTotal - initiationFee);
                }
                
                const mainIndex = milestones.findIndex(x => x.id === m.id);

                return (
                    <div key={m.id} className="relative bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 hover:shadow-xs transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-4 font-['Plus_Jakarta_Sans']">
                        {/* Left Side: Indicator & Title/Desc */}
                        <div className="flex items-start gap-4 flex-1">
                            <div className={`w-1.5 h-10 mt-0.5 ${isExecution ? 'bg-[#D4AF37]' : 'bg-[#0066CC]'} rounded-full shrink-0`} />
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-stone-900 text-xs sm:text-sm">{m.name}</span>
                                    {(!m.status || m.status === 'pending') && (
                                        <button 
                                            onClick={() => handleDeleteMilestone(mainIndex)}
                                            className="text-stone-300 hover:text-red-500 transition-colors"
                                            title="Delete Milestone"
                                        >
                                            <DeleteIcon className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                <p className="text-[11px] text-stone-500 font-medium leading-relaxed max-w-xl">
                                    {m.trigger || m.description || (isExecution ? 'Procurement & site progress' : 'Design deliverables & approvals')}
                                </p>
                                {m.unlocks && (
                                    <div className="text-[10px] text-[#0055B3] bg-sky-50/50 border border-sky-100/30 px-2 py-0.5 rounded-md inline-block">
                                        <span className="font-extrabold">Unlocks:</span> {m.unlocks}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Side: Inputs, Calculations, Status, Action */}
                        <div className="flex flex-wrap items-center gap-4 sm:gap-6 justify-between md:justify-end shrink-0">
                            {/* Percentage Input */}
                            <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 px-2.5 py-1.5 rounded-xl">
                                <input 
                                    type="number" 
                                    value={m.percentage} 
                                    onChange={e => handleUpdateMilestone(mainIndex, { percentage: Number(e.target.value) })}
                                    className="w-10 text-center font-black text-stone-700 bg-transparent outline-none font-mono text-xs focus:ring-0 focus:border-0"
                                    disabled={m.status === 'paid' || m.status === 'invoiced'}
                                />
                                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">%</span>
                            </div>

                            {/* Calculations & Invoice Total */}
                            <div className="text-right min-w-[130px]">
                                {deductedInitiationFee > 0 ? (
                                    <div className="flex flex-col text-right font-['Plus_Jakarta_Sans']">
                                        <div className="text-stone-400 text-[10px] font-mono line-through">
                                            {formatCurrency(rowInvoiceTotal + deductedInitiationFee)}
                                        </div>
                                        <div className="text-xs font-black text-stone-900 font-mono">
                                            {formatCurrency(rowInvoiceTotal)}
                                        </div>
                                        <div className="text-[9px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded mt-0.5 inline-block self-end">
                                            Less Init. Fee: -{formatCurrency(deductedInitiationFee)}
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="text-xs font-black text-stone-900 font-mono">
                                            {formatCurrency(rowInvoiceTotal)}
                                        </div>
                                        <div className="text-[9px] text-stone-400 font-mono mt-0.5">
                                            (Base: {formatCurrency(rowBillable)} + {applicableGstRate}% GST)
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Status Pill */}
                            <div className={`px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider ${
                                m.status === 'paid' 
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                    : m.status === 'invoiced' 
                                        ? 'bg-sky-50 text-sky-800 border-sky-200' 
                                        : 'bg-stone-50 text-stone-500 border-stone-200'
                            }`}>
                                {m.status || 'Pending'}
                                {m.invoiceNumber && <div className="text-[8px] opacity-75 font-mono lowercase mt-0.5">{m.invoiceNumber}</div>}
                            </div>

                            {/* Action Button */}
                            <div className="w-[105px] text-right font-['Plus_Jakarta_Sans']">
                                {!m.status || m.status === 'pending' ? (
                                    <button 
                                        onClick={() => handleInvoiceAction(mainIndex, 'generate_invoice', effectiveTaxableBaseForLocking)}
                                        className={`px-3.5 py-2 ${isExecution ? 'bg-[#0066CC]/90 backdrop-blur-md border border-white/20 hover:bg-slate-900' : 'bg-[#0066CC] hover:bg-[#0055B3]'} text-white text-xs font-extrabold rounded-xl shadow-xs transition-colors`}
                                    >
                                        Raise
                                    </button>
                                ) : m.status === 'invoiced' ? (
                                    <div className="flex items-center justify-end gap-1.5">
                                        <button 
                                            onClick={() => handleInvoiceAction(mainIndex, 'revert_invoice')}
                                            className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                            title="Revert Invoice"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                            onClick={() => handleInvoiceAction(mainIndex, 'mark_paid')}
                                            className="px-2.5 py-1.5 bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-black rounded-lg shadow-xs hover:bg-emerald-200 transition-colors"
                                        >
                                            Mark Paid
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-emerald-600 text-xs font-extrabold flex items-center justify-end gap-1">
                                        <CheckIcon className="w-3.5 h-3.5 stroke-2" /> Paid
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
