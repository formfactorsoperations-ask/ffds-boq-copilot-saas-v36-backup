
import React, { useState } from 'react';
import { ProposalContent, ProjectContext } from '../../types';
import { formatCurrency, formatClientValue } from '../../lib/utils';
import { designFeeFor } from '../../lib/boqPricing';
import { gstTermsOf } from '../../lib/paymentSchedule';
import { ChevronDownIcon, ChevronUpIcon } from '../Icons';

interface ClientDesignFeesProps {
    content?: ProposalContent['fees'];
    projectContext?: ProjectContext;
    setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
    fixedFee?: number; // New prop for Level 2 exact value
    settings?: any; // The combined settings object
}

const ClientDesignFees: React.FC<ClientDesignFeesProps> = ({ content, projectContext, setProjectContext, fixedFee, settings }) => {
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Get Initiation Fee from context or default
    // `??`, not `||` -- a retainer of zero is a real answer, not a missing one.
    const initiationFee = projectContext?.financials?.initiationFeePaid ?? 0;

    // --- TURNKEY / PMC FALLBACK ---
    // If not Design Only (or if context missing), render standard card
    if (!projectContext || projectContext.proposalType !== 'DESIGN_ONLY') {
        
        let feeValueDisplay = "8-10% of final execution value";
        
        // Use settings.feeStructure dynamically
        if (settings?.feeStructure) {
            const { designFeeMin, designFeeMax } = settings.feeStructure;
            if (designFeeMin === designFeeMax) {
                feeValueDisplay = `${designFeeMin}% of final execution value`;
            } else {
                feeValueDisplay = `${designFeeMin}-${designFeeMax}% of final execution value`;
            }
        }
        
        let feeDescDisplay = settings?.feeStructure?.feeNote || "Depends on project scope and complexity. Covers the complete design + coordination lifecycle.";

        // Level 2 Logic (Fixed Fee Provided)
        if (fixedFee) {
            const isPercentage = projectContext.designFeeType === 'percentage';
            const feePercent = projectContext.designFee || settings?.feeStructure?.designFeeMin || 10;

            if (isPercentage) {
                feeValueDisplay = `${feePercent}% of Execution Value`;
                feeDescDisplay = `Calculated Amount: ${formatCurrency(fixedFee)}. This fee is linked to the final approved scope value.`;
            } else {
                // Fixed Lumpsum or Sqft
                feeValueDisplay = formatCurrency(fixedFee);
                feeDescDisplay = "Fixed professional fee linked to the approved scope.";
            }
        }

        const defaults = {
            title: fixedFee ? "Professional Design Fee" : "How Design & Execution Fees Work",
            subtitle: "Design is not treated as an add-on. It is the framework that controls scope, cost overruns, and execution quality.",
            card1: {
                label: "DESIGN FEE",
                value: feeValueDisplay,
                desc: feeDescDisplay
            },
            card2: {
                label: "WHAT IT COVERS",
                items: [
                    "Space planning, layouts, and design direction",
                    "3D visualization and technical drawings",
                    "Material and finish selection guidance",
                    "Vendor coordination and site involvement"
                ]
            },
            practicalView: `Practical view: Most clients recover the design fee many times over by avoiding rework and material wastage. The Project Initiation Fee (${formatCurrency(initiationFee)}) you have paid is fully adjustable against this final amount.`
        };

        // Deep merge to ensure all properties exist even if content is partial
        const data = {
            ...defaults,
            ...content,
            card1: { ...defaults.card1, ...(content?.card1 || {}) },
            card2: { ...defaults.card2, ...(content?.card2 || {}) },
        };

        // Override value if fixedFee is provided (Level 2 priority logic overrides content prop if needed)
        // We re-apply the logic here to ensure dynamic updates (like percentage change) reflect immediately
        if (fixedFee) {
             const isPercentage = projectContext.designFeeType === 'percentage';
             const feePercent = projectContext.designFee || settings?.feeStructure?.designFeeMin || 10;
             if (isPercentage) {
                data.card1.value = `${feePercent}% of Execution Value`;
                data.card1.desc = `Calculated Amount: ${formatCurrency(fixedFee)}. This fee is linked to the final approved scope.`;
             } else {
                data.card1.value = formatCurrency(fixedFee);
                data.card1.desc = "Fixed professional fee linked to the approved scope.";
             }
        }

        return (
            <section id="fees" className="py-10">
                <div className="mb-8">
                    <h2 className="text-3xl font-extrabold text-slate-900 mb-2">{data.title}</h2>
                    <p className="text-slate-600 max-w-3xl text-sm leading-relaxed">
                        {data.subtitle}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Design Fee Card */}
                    <div className="border border-slate-200 rounded-3xl p-8 bg-white shadow-sm flex flex-col justify-center">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">{data.card1.label}</p>
                        <h3 className="text-3xl font-black text-slate-900 mb-3 leading-tight tracking-tight">{data.card1.value}</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            {data.card1.desc}
                        </p>
                        {settings?.feeStructure?.feeNote && !fixedFee && (
                             <p className="text-xs text-slate-500 mt-4 pt-4 border-t border-slate-100">
                                 {settings.feeStructure.feeNote}
                             </p>
                        )}
                    </div>

                    {/* Coverage Card */}
                    <div className="border border-slate-200 rounded-3xl p-8 bg-white shadow-sm">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4">{data.card2.label}</p>
                        <ul className="space-y-3">
                            {(data.card2.items || []).map((item, idx) => (
                                <li key={idx} className="flex items-start gap-3 text-sm text-slate-700">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>
                                    <span className="leading-relaxed">{item}</span>
                                </li>
                            ))}
                            {settings?.feeStructure?.revisionPolicy && (
                                <li className="flex items-start gap-3 text-sm text-slate-700 pt-2 mt-2 border-t border-slate-100">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0"></span>
                                    <span className="leading-relaxed font-medium text-slate-800">Policy: {settings.feeStructure.revisionPolicy}</span>
                                </li>
                            )}
                        </ul>
                    </div>
                </div>

                {/* Practical View Box */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm text-slate-700 leading-relaxed">
                    <span className="font-bold text-slate-900">Note: </span>
                    {data.practicalView ? data.practicalView.replace('Practical view:', '') : ''} 
                </div>
            </section>
        );
    }

    // --- DESIGN ONLY ---
    /*
      One fee, the one Money bills.

      This used to be its own calculator: a ₹75,000 base retainer plus the area
      at a rate picked by size band, with a PMC switch, saved to fields nothing
      else read. Money billed Project setup's fee engine instead, so the client
      could be shown one figure and invoiced another. The fee here is now the
      fee engine's (lib/boqPricing designFeeFor), and editing it here edits
      that.
    */
    const data = {
        title: content?.title || "Professional Design Fee",
        subtitle: content?.subtitle || "Our fee covers the design mandate: layouts, 3D views, the Good for Construction drawing set and selections. Your contractors are engaged and paid by you directly."
    };

    const area = projectContext.area || 0;
    const feeType = projectContext.designFeeType === 'fixed_lumpsum' ? 'fixed_lumpsum' : 'fixed_sqft';
    const rate = projectContext.designFee || 0;
    const totalFee = designFeeFor({ ...projectContext, designFeeType: feeType }, 0, 0);
    const gstRate = gstTermsOf(projectContext).rate;
    const designGst = gstTermsOf(projectContext).designGst;
    const deliverables = (content?.card2?.items && content.card2.items.length)
        ? content.card2.items
        : [
            "Layouts and space planning",
            "3D visualisation of every room",
            "Good for Construction drawings (joinery, electrical, civil, ceiling)",
            "Finishes and fittings selection",
        ];

    const setFee = (patch: Partial<ProjectContext>) => {
        if (!setProjectContext) return;
        setProjectContext(prev => ({ ...prev, ...patch }));
    };

    return (
        <section id="fees" className="py-10">
            <div className="mb-8">
                <h2 className="text-3xl font-extrabold text-slate-900 mb-2">{data.title}</h2>
                <p className="text-slate-600 max-w-3xl text-sm leading-relaxed">
                    {data.subtitle}
                </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-12">
                    {/* Left: how the fee is reached, and what it covers */}
                    <div className="md:col-span-7 p-8 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50">
                        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-6">Fee Breakdown</h3>
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-sm font-semibold text-slate-700">Design fee</p>
                                <p className="text-xs text-slate-500">
                                    {feeType === 'fixed_sqft' ? `${area} sq ft × ₹${rate.toLocaleString('en-IN')} per sq ft` : 'Fixed professional fee'}
                                </p>
                            </div>
                            <div className="font-mono font-bold text-slate-900 text-lg tabular-nums">{formatCurrency(totalFee)}</div>
                        </div>

                        <div className="w-full h-px bg-slate-200 my-6"></div>

                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">{content?.card2?.label || 'What it covers'}</p>
                        <ul className="space-y-2">
                            {deliverables.map((item, idx) => (
                                <li key={idx} className="flex items-start gap-3 text-sm text-slate-700">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>
                                    <span className="leading-relaxed">{item}</span>
                                </li>
                            ))}
                        </ul>

                        {/* The same fee engine as Project setup; studio side only. */}
                        {setProjectContext && (
                            <div className="mt-8 no-print">
                                <button
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider"
                                >
                                    {showAdvanced ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                    {showAdvanced ? 'Hide fee settings' : 'Change the fee'}
                                </button>
                                {showAdvanced && (
                                    <div className="mt-4 p-4 bg-white border border-slate-200 rounded-xl space-y-4">
                                        <div className="inline-flex p-1 rounded-xl bg-slate-100">
                                            {([['fixed_sqft', '₹ per sq ft'], ['fixed_lumpsum', 'Fixed sum']] as const).map(([id, label]) => (
                                                <button key={id} type="button" onClick={() => setFee({ designFeeType: id })}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${feeType === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            {feeType === 'fixed_sqft' && (
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Chargeable area (sq ft)</label>
                                                    <input type="number" value={area}
                                                        onChange={(e) => setFee({ area: parseInt(e.target.value) || 0 })}
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]" />
                                                </div>
                                            )}
                                            <div>
                                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                                    {feeType === 'fixed_sqft' ? 'Rate (₹ per sq ft)' : 'Fee (₹)'}
                                                </label>
                                                <input type="number" value={rate}
                                                    onChange={(e) => setFee({ designFee: parseFloat(e.target.value) || 0 })}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]" />
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-slate-500">This is the fee Money bills; it is the same setting as Project setup.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right: Total */}
                    <div className="md:col-span-5 bg-slate-900 border border-slate-800 p-8 flex flex-col justify-center items-center text-center text-white relative overflow-hidden">
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Total Professional Fee</p>
                        <div className="text-4xl md:text-5xl font-black tracking-tight mb-2 tabular-nums">
                            {formatCurrency(Math.round(totalFee)).replace('₹ ', '₹')}
                        </div>
                        <div className="inline-block px-3 py-1 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 uppercase tracking-widest border border-slate-700">
                            {designGst ? `+ GST applicable (${gstRate}%)` : 'No GST on this fee'}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ClientDesignFees;
