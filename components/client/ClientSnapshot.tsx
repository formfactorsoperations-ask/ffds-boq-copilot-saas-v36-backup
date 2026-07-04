
import React, { useMemo } from 'react';
import { TimelinePhase, ProposalContent, ProjectContext, PaymentMilestone } from '../../types';
import { formatCurrency, formatClientValue } from '../../lib/utils';
import ClientDiscountShowcase from './ClientDiscountShowcase';
import { CheckBadgeIcon, ShieldCheckIcon } from '../Icons';

import { ProposalLevel } from '../../types';

interface ClientSnapshotProps {
    level?: string;
    investmentMin: number;
    investmentMax: number;
    timelinePhases: TimelinePhase[];
    content?: ProposalContent['snapshot'];
    designFee?: number; // Optional design fee value
    executionTotal?: number; // Optional exact execution value
    projectContext?: ProjectContext; // Added to access financials
    settings?: any; // Dynamic studio settings
}

const ClientSnapshot: React.FC<ClientSnapshotProps> = ({ level, investmentMin, investmentMax, timelinePhases, content, designFee, executionTotal, projectContext, settings }) => {
    // Correct calculation: Max End Day across all phases
    const totalDaysMin = useMemo(() => {
        // Smart Default logic matching Contract View
        if (!timelinePhases || timelinePhases.length === 0) {
            const config = (projectContext?.config || '').toLowerCase();
            if (config.includes('1-bhk') || config.includes('studio')) return 45;
            if (config.includes('2-bhk')) return 60;
            if (config.includes('3-bhk')) return 75;
            if (config.includes('4-bhk') || config.includes('duplex')) return 90;
            if (config.includes('bath')) return 25;
            return 60;
        }
        return Math.max(...timelinePhases.map(p => (p.startDay || 0) + p.durationDays));
    }, [timelinePhases, projectContext]);
    
    // Max range is roughly +20% or +15 days
    const totalDaysMax = Math.ceil(totalDaysMin * 1.25);

    const data = content || (
        level === 'LEVEL_1_5' ? {
            title: "Interim Snapshot",
            subtitle: "This snapshot outlines the revised scope and investment required based on our recent discussions.",
            engagementModel: "Design-led Turnkey Execution"
        } : {
        title: "Project Snapshot",
        subtitle: "This snapshot helps you quickly decide if the direction and investment feel broadly aligned before going into details.",
        engagementModel: "Design-led Turnkey Execution"
    });

    const modelString = data.engagementModel || '';
    const isDesignOnly = modelString.includes('Design Consultancy');
    const isPMC = modelString.includes('PMC');
    
    // --- LEVEL 2: DETAILED TOTAL CALCULATION ---
    const showGrandTotal = designFee !== undefined && executionTotal !== undefined;
    
    // Discount Logic
    const financials = projectContext?.financials;
    const discounts = financials?.discounts || [];
    
    // 1. Base Totals
    const baseExecution = executionTotal || 0;
    const baseDesign = designFee || 0;
    const grossTotal = baseExecution + baseDesign;

    // 2. Calculate Exact Discount Amounts
    const executionSavings = discounts
        .filter(d => d.target === 'execution')
        .reduce((sum, d) => sum + (d.type === 'percentage' ? baseExecution * (d.value / 100) : d.value), 0);

    const designSavings = discounts
        .filter(d => d.target === 'design')
        .reduce((sum, d) => sum + (d.type === 'percentage' ? baseDesign * (d.value / 100) : d.value), 0);

    const totalSavings = executionSavings + designSavings;
    
    // 3. Net Taxable
    const taxableExecution = baseExecution - executionSavings;
    const taxableDesign = baseDesign - designSavings;
    const netTaxable = taxableExecution + taxableDesign;

    // 4. GST Logic
    const gstRate = projectContext?.gstRate || 18;
    const gstOnDesign = taxableDesign * (gstRate / 100);
    
    // Check if Execution GST is enabled in context (default true)
    // If FALSE, it means we are waiving it off.
    const isExecutionGstWaived = financials?.executionGstEnabled === false;
    
    // We calculate what the GST *would* be to show the waiver
    const potentialGstOnExecution = taxableExecution * (gstRate / 100);
    const chargedGstOnExecution = isExecutionGstWaived ? 0 : potentialGstOnExecution;

    // 5. Final Payable
    const finalPayable = netTaxable + gstOnDesign + chargedGstOnExecution;

    return (
        <section id="snapshot" className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Section 1</div>
                    <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-indigo-950">{data.title}</h2>
                    <p className="mt-2 text-slate-600 max-w-3xl whitespace-pre-line">
                        {data.subtitle}
                    </p>
                </div>
                <div className={`rounded-2xl border px-4 py-3 ${isDesignOnly ? 'bg-indigo-50 border-indigo-100 text-indigo-900' : isPMC ? 'bg-amber-50 border-amber-100 text-amber-900' : 'bg-[#F7F7F6] border-slate-200'}`}>
                    <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">Engagement model</div>
                    <div className="mt-1 font-extrabold">{data.engagementModel}</div>
                </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* LEFT CARD: FINANCIALS */}
                <div className="rounded-3xl bg-slate-50 border border-slate-200 p-1 flex flex-col justify-center overflow-hidden">
                    
                    {showGrandTotal ? (
                        /* NEW: Detailed Level 2 Commercial Breakdown - Ledger Style */
                        <div className="bg-white rounded-[20px] h-full flex flex-col">
                            <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
                                <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wide">Detailed Commercial Summary</h3>
                                <p className="text-xs text-slate-500 mt-1">Consolidated view of Execution + Professional Fees</p>
                            </div>
                            
                            <div className="p-6 space-y-3 flex-grow">
                                {/* A. Execution */}
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600 font-medium">1. Total Execution Cost (Excl. Loose Furniture)</span>
                                    <span className="font-bold font-mono text-slate-700">{formatCurrency(baseExecution)}</span>
                                </div>
                                {/* B. Design */}
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600 font-medium">2. Interior Design Fee</span>
                                    <span className="font-bold font-mono text-slate-700">{formatCurrency(baseDesign)}</span>
                                </div>

                                {/* C. Discounts */}
                                {discounts.map(d => (
                                    <div key={d.id} className="flex justify-between items-center text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                                        <span className="font-medium">Special Discount - {d.name}</span>
                                        <span className="font-mono font-bold">-{formatCurrency(d.type === 'percentage' ? (d.target === 'execution' ? baseExecution : baseDesign) * (d.value / 100) : d.value)}</span>
                                    </div>
                                ))}
                                
                                {/* Subtotal Line */}
                                <div className="border-t border-dashed border-slate-200 pt-2 flex justify-between items-center text-xs font-bold text-slate-500">
                                    <span className="uppercase">Net Taxable Value</span>
                                    <span className="font-mono">{formatCurrency(netTaxable)}</span>
                                </div>

                                {/* GST Design */}
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600 font-medium">3. GST on Design Fees ({gstRate}%)</span>
                                    <span className="font-mono text-slate-700">{formatCurrency(gstOnDesign)}</span>
                                </div>

                                {/* GST Execution (The Waiver Magic) */}
                                {isExecutionGstWaived ? (
                                    <>
                                        <div className="flex justify-between items-center text-sm opacity-50">
                                            <span className="text-slate-500 font-medium">4. GST on Execution ({gstRate}%)</span>
                                            <span className="font-mono text-slate-500">{formatCurrency(potentialGstOnExecution)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm bg-amber-50 px-2 py-1 rounded text-amber-800 border border-amber-100">
                                            <span className="font-bold flex items-center gap-1">
                                                <ShieldCheckIcon className="w-3 h-3" />
                                                GST Waiver (Alternate Payment Mode)
                                            </span>
                                            <span className="font-mono font-bold">-{formatCurrency(potentialGstOnExecution)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-600 font-medium">4. GST on Execution ({gstRate}%)</span>
                                        <span className="font-mono text-slate-700">{formatCurrency(chargedGstOnExecution)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Final Total Footer */}
                            <div className="bg-indigo-950 p-6 text-white flex justify-between items-end rounded-b-[20px]">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Project Cost</p>
                                    <p className="text-xs text-slate-500">Inclusive of Taxes & Fees</p>
                                </div>
                                <div className="text-3xl font-extrabold tracking-tight leading-none">
                                    {formatCurrency(finalPayable)}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* STANDARD LEVEL 1: ESTIMATED RANGES (Unchanged) */
                        <div className="p-6">
                            {isDesignOnly ? (
                                <>
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Estimated Execution Budget</div>
                                    <div className="mt-2 text-3xl font-extrabold text-indigo-950">{formatClientValue(investmentMin)} – {formatClientValue(investmentMax)}</div>
                                    <div className="mt-1 text-sm text-slate-500">Advisory Estimate • Construction Cost</div>
                                    <div className="mt-4 text-sm text-slate-700 bg-white p-3 rounded-xl border border-slate-200">
                                        <span className="font-bold">Note:</span> This is the estimated cost to execute the designs. It does not include professional fees (Design/PMC).
                                    </div>
                                </>
                            ) : isPMC ? (
                                <>
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Estimated PMC Fee</div>
                                    <div className="mt-2 text-3xl font-extrabold text-indigo-950">12% <span className="text-lg text-slate-500 font-medium">of Vendor Billing</span></div>
                                    <div className="mt-1 text-sm text-slate-500">Excl. GST • Billed monthly on progress</div>
                                    <div className="mt-4 text-sm text-slate-700 bg-white p-3 rounded-xl border border-slate-200">
                                        <span className="font-bold">Execution Budget:</span> {formatClientValue(investmentMin)} – {formatClientValue(investmentMax)} (Managed by us, paid by you).
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Overall project investment</div>
                                    <div className="mt-2 text-3xl font-extrabold text-indigo-950">{formatClientValue(investmentMin)} – {formatClientValue(investmentMax)}</div>
                                    <div className="mt-1 text-sm text-slate-500">Excl. GST • Excl. loose furniture + appliances</div>
                                    <div className="mt-4 text-sm text-slate-700">
                                        Final number depends on: scope lock, storage detailing, civil changes, and material/hardware selection.
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT CARD: TIMELINE & SCOPE */}
                <div className="flex flex-col gap-4">
                    {/* Timeline Info */}
                    <div className="rounded-3xl bg-white border border-slate-200 p-6 flex flex-col justify-between">
                        <div>
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Timeline (indicative)</div>
                            <div className="mt-2 text-2xl font-extrabold text-indigo-950">{totalDaysMin}–{totalDaysMax} days</div>
                            <div className="mt-1 text-sm text-slate-600">Post possession • subject to approvals and site realities</div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="rounded-2xl bg-[#F7F7F6] border border-slate-200 p-4">
                                <div className="font-extrabold text-indigo-950 text-xs uppercase tracking-wide mb-2">Included Scope</div>
                                <ul className="space-y-1.5 text-slate-600 list-disc list-inside text-xs font-medium pl-1">
                                    {(settings?.scopeInclusions?.included || []).length > 0 ? (
                                        settings.scopeInclusions.included.map((item: string, idx: number) => (
                                            <li key={idx}>{item}</li>
                                        ))
                                    ) : isDesignOnly ? (
                                        <>
                                            <li>Space Planning & Layouts</li>
                                            <li>3D Visuals (All Rooms)</li>
                                            <li>Detailed GFC Drawings</li>
                                            <li>Material Selection Visits</li>
                                        </>
                                    ) : (
                                        <>
                                            <li>Full Modular Carpentry</li>
                                            <li>On-site Civil & False Ceiling</li>
                                            <li>Electrical & Lighting Work</li>
                                            <li>Paint & Surface Finishes</li>
                                        </>
                                    )}
                                </ul>
                            </div>
                            <div className="rounded-2xl bg-[#F7F7F6] border border-slate-200 p-4">
                                <div className="font-extrabold text-indigo-950 text-xs uppercase tracking-wide mb-2">Standard Exclusions</div>
                                <ul className="space-y-1.5 text-slate-600 list-disc list-inside text-xs font-medium pl-1">
                                    {(settings?.scopeInclusions?.excluded || []).length > 0 ? (
                                        settings.scopeInclusions.excluded.map((item: string, idx: number) => (
                                            <li key={idx}>{item}</li>
                                        ))
                                    ) : isDesignOnly ? (
                                        <>
                                            <li>Contractor Selection</li>
                                            <li>Material Purchase</li>
                                            <li>Site Supervision</li>
                                            <li>Vendor Payments</li>
                                        </>
                                    ) : (
                                        <>
                                            <li>Loose Furniture (Sofas/Chairs)</li>
                                            <li>White Goods & Appliances</li>
                                            <li>Decor / Mattresses / Curtains</li>
                                            <li>Govt/Society Fees</li>
                                        </>
                                    )}
                                </ul>
                            </div>
                        </div>
                        {settings?.scopeInclusions?.disclaimer && (
                            <p className="mt-4 text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <span className="font-bold">Disclaimer:</span> {settings.scopeInclusions.disclaimer}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Discount Showcase Integration (Only if specific custom discounts exist, GST waiver is handled in ledger) */}
            {showGrandTotal && discounts.length > 0 && (
                <div className="mt-8">
                    <ClientDiscountShowcase 
                        discounts={discounts} 
                        executionTotal={baseExecution} 
                        designFee={baseDesign} 
                    />
                </div>
            )}

            <div className="mt-6 rounded-3xl border border-slate-200 bg-[#F7F7F6] p-5 md:p-6">
                <div className="flex items-start gap-3">
                    <div className="mt-1 w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-extrabold text-slate-700 shadow-sm">i</div>
                    <div>
                        <div className="font-extrabold text-indigo-950 text-sm">How to read this summary</div>
                        <div className="mt-1 text-xs text-slate-600 leading-relaxed">
                            {showGrandTotal 
                                ? "The Investment Ledger above consolidates all costs—Execution, Fees, and Taxes—into a single final figure. This allows you to sign the contract with complete clarity on the total outgoing."
                                : <><span className="font-bold">Snapshot + Options</span> tells you direction and investment range. <span className="font-bold">Room-wise</span> gives transparent bundles.</>
                            }
                        </div>
                    </div>
                </div>
            </div>

            {/* NEW: Execution Intelligence Layer (Impactful for Print) */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 break-inside-avoid">
                <div className="rounded-2xl border-2 border-indigo-950 p-5 bg-white">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Critical Milestone</div>
                    <div className="text-sm font-black text-indigo-950 uppercase">SOF Freeze</div>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                        Schedule of Finishes (SOF) must be locked by <span className="font-bold text-indigo-900">Day 15</span> to avoid procurement delays.
                    </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-5 bg-white">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Lead Time Alert</div>
                    <div className="text-sm font-black text-indigo-950 uppercase">Long-Lead Items</div>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                        Custom hardware and imported veneers require <span className="font-bold text-indigo-900">4-6 weeks</span> lead time from order date.
                    </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-5 bg-white">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ops Intelligence</div>
                    <div className="text-sm font-black text-indigo-950 uppercase">Decision Blockers</div>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                        Electrical point lock and Appliance selection are the primary blockers for modular production.
                    </p>
                </div>
            </div>
        </section>
    );
};

export default ClientSnapshot;
