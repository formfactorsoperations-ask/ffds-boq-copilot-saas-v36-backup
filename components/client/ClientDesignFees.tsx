
import React, { useState } from 'react';
import { ProposalContent, ProjectContext } from '../../types';
import { formatCurrency, formatClientValue } from '../../lib/utils';
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
    const initiationFee = projectContext?.financials?.initiationFeePaid || 4999;

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
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></span>
                                    <span className="leading-relaxed font-medium text-indigo-900">Policy: {settings.feeStructure.revisionPolicy}</span>
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

    // --- DESIGN ONLY + PMC CALCULATOR LOGIC ---
    // (Existing Design Only Logic Preserved)
    
    // Use content if available for title/subtitle to allow edits
    const data = {
        title: content?.title || "Professional Design Fee Structure",
        subtitle: content?.subtitle || "Our fee is calculated based on the carpet area and the complexity of the design mandate. This transparent model ensures you pay strictly for the value delivered."
    };

    // 1. Determine Constants & Defaults
    const area = projectContext.area || 0;
    const defaultBaseFee = 75000;
    
    // 2. Determine Default Multiplier Band
    let calculatedDefaultMultiplier = 40;
    let bandLabel = "Standard Band (<900 sqft)";
    let bandColor = "bg-blue-100 text-blue-700";

    if (area >= 901 && area <= 1200) {
        calculatedDefaultMultiplier = 50;
        bandLabel = "Mid Band (901-1200 sqft)";
        bandColor = "bg-indigo-100 text-indigo-700";
    } else if (area > 1200) {
        calculatedDefaultMultiplier = 60;
        bandLabel = "Large Format (>1200 sqft)";
        bandColor = "bg-purple-100 text-purple-700";
    } else if (area < 600) {
        calculatedDefaultMultiplier = 40;
        bandLabel = "Compact Studio (<600 sqft)";
        bandColor = "bg-slate-100 text-slate-600";
    }

    // 3. Check for Overrides or Use Defaults
    const baseFee = projectContext.designFeeConfig?.baseFee ?? defaultBaseFee;
    const multiplier = projectContext.designFeeConfig?.multiplier ?? calculatedDefaultMultiplier;
    
    // PMC Logic
    const includePmc = projectContext.designFeeConfig?.includePmc ?? false;
    const pmcRate = projectContext.designFeeConfig?.pmcRate ?? 30; // Default 30 as per prompt

    // 4. Calculate Final Fee
    const designTotal = baseFee + (area * multiplier);
    const pmcTotal = includePmc ? (area * pmcRate) : 0;
    const totalFee = designTotal + pmcTotal;

    // 5. Handlers
    const updateConfig = (field: 'baseFee' | 'multiplier' | 'pmcRate', value: number) => {
        if (!setProjectContext) return;
        setProjectContext(prev => ({
            ...prev,
            designFeeConfig: {
                ...prev.designFeeConfig,
                [field]: value
            }
        }));
    };

    const togglePmc = (val: boolean) => {
        if (!setProjectContext) return;
        setProjectContext(prev => ({
            ...prev,
            designFeeConfig: {
                ...prev.designFeeConfig,
                includePmc: val
            }
        }));
    }

    const updateArea = (val: number) => {
        if (!setProjectContext) return;
        setProjectContext(prev => ({ ...prev, area: val }));
    }

    return (
        <section id="fees" className="py-10">
            <div className="mb-8">
                <span className="inline-block px-3 py-1 bg-slate-900 text-white text-xs font-bold rounded-full mb-3">Thane/Mumbai Pricing</span>
                <h2 className="text-3xl font-extrabold text-slate-900 mb-2">{data.title}</h2>
                <p className="text-slate-600 max-w-3xl text-sm leading-relaxed">
                    {data.subtitle}
                </p>
            </div>

            <div className="bg-white border-2 border-slate-900 rounded-3xl overflow-hidden shadow-lg">
                <div className="grid grid-cols-1 md:grid-cols-12">
                    
                    {/* Left: Breakdown */}
                    <div className="md:col-span-7 p-8 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Fee Breakdown</h3>
                            {setProjectContext && (
                                <label className="flex items-center gap-2 cursor-pointer no-print">
                                    <div className="relative">
                                        <input type="checkbox" checked={includePmc} onChange={(e) => togglePmc(e.target.checked)} className="sr-only peer" />
                                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                    </div>
                                    <span className="text-xs font-bold text-slate-600 select-none">Include PMC</span>
                                </label>
                            )}
                        </div>
                        
                        <div className="space-y-6">
                            {/* Base */}
                            <div className="flex justify-between items-center group">
                                <div>
                                    <p className="text-sm font-semibold text-slate-700">Base Retainer Fee</p>
                                    <p className="text-xs text-slate-500">Core planning & concept development</p>
                                </div>
                                <div className="font-mono font-bold text-slate-900 text-lg group-hover:text-blue-600 transition-colors">
                                    {formatCurrency(baseFee)}
                                </div>
                            </div>

                            <div className="w-full h-px bg-slate-200"></div>

                            {/* Design Area */}
                            <div className="flex justify-between items-center group">
                                <div>
                                    <p className="text-sm font-semibold text-slate-700">Design Fee (Area Based)</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${bandColor}`}>{bandLabel}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono font-bold text-slate-900 text-lg group-hover:text-blue-600 transition-colors">
                                        {formatCurrency(area * multiplier)}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {area} sqft × ₹{multiplier}/sqft
                                    </p>
                                </div>
                            </div>

                            {/* PMC - Conditional */}
                            {includePmc && (
                                <>
                                    <div className="w-full h-px bg-slate-200"></div>
                                    <div className="flex justify-between items-center group bg-indigo-50/50 p-2 -mx-2 rounded-lg border border-indigo-100/50">
                                        <div>
                                            <p className="text-sm font-bold text-indigo-900">Project Management (PMC)</p>
                                            <p className="text-xs text-indigo-600/80">Site Supervision & Vendor Coordination</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono font-bold text-indigo-900 text-lg">
                                                {formatCurrency(pmcTotal)}
                                            </div>
                                            <p className="text-xs text-indigo-500 mt-0.5">
                                                {area} sqft × ₹{pmcRate}/sqft
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* PMC Details - Show if active */}
                        {includePmc && (
                            <div className="mt-6 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                                <h4 className="text-xs font-bold text-slate-800 uppercase mb-3">PMC Scope</h4>
                                <div className="grid grid-cols-2 gap-4 text-xs">
                                    <div>
                                        <p className="font-bold text-emerald-700 mb-1">Includes:</p>
                                        <ul className="space-y-1 text-slate-600 list-disc list-inside">
                                            <li>Scheduled site supervision</li>
                                            <li>Vendor coordination</li>
                                            <li>Quality checks</li>
                                            <li>Design intent enforcement</li>
                                        </ul>
                                    </div>
                                    <div>
                                        <p className="font-bold text-red-700 mb-1">Excludes:</p>
                                        <ul className="space-y-1 text-slate-600 list-disc list-inside">
                                            <li>Labour payroll management</li>
                                            <li>Direct material purchases</li>
                                            <li>Contractor liability</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Advanced Toggle */}
                        {setProjectContext && (
                            <div className="mt-8 no-print">
                                <button 
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider"
                                >
                                    {showAdvanced ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                    {showAdvanced ? 'Hide Configuration' : 'Advanced Configuration'}
                                </button>
                                
                                {showAdvanced && (
                                    <div className="mt-4 p-4 bg-white border border-slate-200 rounded-xl space-y-4 shadow-inner">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Chargeable Area (sqft)</label>
                                                <input 
                                                    type="number" 
                                                    value={area}
                                                    onChange={(e) => updateArea(parseInt(e.target.value) || 0)}
                                                    className="w-full p-2 border border-slate-300 rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Base Fee Override (₹)</label>
                                                <input 
                                                    type="number" 
                                                    value={baseFee}
                                                    onChange={(e) => updateConfig('baseFee', parseInt(e.target.value) || 0)}
                                                    className="w-full p-2 border border-slate-300 rounded text-sm"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Design Rate (₹/sqft)</label>
                                                <input 
                                                    type="number" 
                                                    value={multiplier}
                                                    onChange={(e) => updateConfig('multiplier', parseInt(e.target.value) || 0)}
                                                    className="w-full p-2 border border-slate-300 rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">PMC Rate (₹/sqft)</label>
                                                <input 
                                                    type="number" 
                                                    value={pmcRate}
                                                    onChange={(e) => updateConfig('pmcRate', parseInt(e.target.value) || 0)}
                                                    disabled={!includePmc}
                                                    className="w-full p-2 border border-slate-300 rounded text-sm disabled:opacity-50"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right: Total */}
                    <div className="md:col-span-5 bg-slate-900 p-8 flex flex-col justify-center items-center text-center text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                            <svg width="200" height="200" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/></svg>
                        </div>
                        
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Total Professional Fee</p>
                        <div className="text-4xl md:text-5xl font-black tracking-tight mb-2">
                            {formatCurrency(Math.round(totalFee)).replace('₹ ', '₹')}
                        </div>
                        <div className="inline-block px-3 py-1 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 uppercase tracking-wide border border-slate-700">
                            + GST Applicable (18%)
                        </div>
                        {includePmc && (
                            <div className="mt-4 text-xs font-medium text-emerald-400 bg-emerald-900/30 px-3 py-1 rounded-lg border border-emerald-800">
                                Includes Design + PMC
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ClientDesignFees;
