
import React from 'react';
import { ProjectDiscount } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { SparklesIcon, ScissorsIcon, CheckBadgeIcon } from '../Icons';

interface ClientDiscountShowcaseProps {
    discounts: ProjectDiscount[];
    executionTotal: number;
    designFee: number;
}

const ClientDiscountShowcase: React.FC<ClientDiscountShowcaseProps> = ({ discounts, executionTotal, designFee }) => {
    if (!discounts || discounts.length === 0) return null;

    // Helper to calculate absolute value of a discount
    const getDiscountValue = (d: ProjectDiscount) => {
        const base = d.target === 'execution' ? executionTotal : designFee;
        if (d.type === 'percentage') {
            return base * (d.value / 100);
        }
        return d.value;
    };

    const totalSavings = discounts.reduce((sum, d) => sum + getDiscountValue(d), 0);

    return (
        <section className="mb-8 break-inside-avoid">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 to-teal-900 text-white shadow-xl p-6 md:p-8">
                
                {/* Decorative Background Elements */}
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <SparklesIcon className="w-40 h-40 text-emerald-400" />
                </div>
                <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl"></div>

                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-emerald-800/50 pb-6 mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="p-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg shadow-sm backdrop-blur-sm border border-emerald-500/30">
                                <SparklesIcon className="w-4 h-4" />
                            </span>
                            <span className="text-xs font-bold text-emerald-300 uppercase tracking-widest">Pricing Advantage</span>
                        </div>
                        <h3 className="text-2xl font-bold text-white">Value & Savings Unlocked</h3>
                        <p className="text-sm text-emerald-100/80 mt-1 max-w-lg">
                            The following preferential adjustments have been applied to your project baseline.
                        </p>
                    </div>

                    {/* Total Savings Badge */}
                    <div className="bg-white/10 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl text-center shadow-lg min-w-[160px]">
                        <p className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider mb-1">Total Savings</p>
                        <p className="text-3xl font-black text-white tracking-tight">
                            {formatCurrency(totalSavings)}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {discounts.map((discount, idx) => {
                        const amount = getDiscountValue(discount);
                        return (
                            <div key={discount.id} className="relative bg-white text-indigo-900 p-4 rounded-xl flex items-center justify-between shadow-sm group border-l-4 border-emerald-500">
                                {/* Ticket Perforation Visuals */}
                                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-teal-900 rounded-full"></div>

                                <div className="pl-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white ${discount.target === 'design' ? 'bg-blue-600' : 'bg-slate-600'}`}>
                                            {discount.target === 'design' ? 'Design Fee' : 'Execution'}
                                        </span>
                                        <h4 className="font-bold text-indigo-950 text-sm">{discount.name}</h4>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                        <CheckBadgeIcon className="w-3 h-3 text-emerald-600" />
                                        <span>Applied Successfully</span>
                                    </div>
                                </div>

                                <div className="text-right pr-6">
                                    <div className="text-lg font-black text-emerald-700">
                                        -{formatCurrency(amount)}
                                    </div>
                                    {discount.type === 'percentage' && (
                                        <p className="text-[10px] text-slate-400 font-medium">
                                            ({discount.value}% Waiver)
                                        </p>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </section>
    );
};

export default ClientDiscountShowcase;
