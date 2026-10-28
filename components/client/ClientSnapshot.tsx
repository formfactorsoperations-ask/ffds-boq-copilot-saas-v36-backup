
import React, { useMemo } from 'react';
import { TimelinePhase, ProposalContent, ProjectContext, PaymentMilestone } from '../../types';
import { formatCurrency, formatClientValue } from '../../lib/utils';
import ClientDiscountShowcase from './ClientDiscountShowcase';
import { CheckBadgeIcon, ShieldCheckIcon } from '../Icons';
import { gstTermsOf, gstOn, executionGstLabel, type GstTerms } from '../../lib/paymentSchedule';

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
    /** The option the commercial summary is for, named on it so the figures are never read as everyone's. */
    option?: { label: string; name: string };
    /** Every option, compared line by line in the summary's own format (Level 1). */
    options?: { id: string; label: string; name: string; executionTotal: number; designFee: number }[];
    activeOptionId?: string;
}

type Discount = NonNullable<NonNullable<ProjectContext['financials']>['discounts']>[number];

/*
  The commercial ledger for one option: execution and design fee, less the
  studio's discounts, plus GST (or the execution GST waiver). The summary and
  the comparison table both read from here, so they can never disagree. GST is
  charged as Money bills it (lib/paymentSchedule.ts gstOn): on the billable
  share of execution, and only while each switch is on.
*/
export function ledgerFor(baseExecution: number, baseDesign: number, discounts: Discount[], terms: GstTerms) {
    const savingOf = (d: Discount) => d.type === 'percentage' ? (d.target === 'execution' ? baseExecution : baseDesign) * (d.value / 100) : d.value;
    const executionSavings = discounts.filter(d => d.target === 'execution').reduce((sum, d) => sum + savingOf(d), 0);
    const designSavings = discounts.filter(d => d.target === 'design').reduce((sum, d) => sum + savingOf(d), 0);
    const taxableExecution = baseExecution - executionSavings;
    const taxableDesign = baseDesign - designSavings;
    const netTaxable = taxableExecution + taxableDesign;
    const gst = gstOn(taxableExecution, taxableDesign, terms);
    const gstOnDesign = gst.design;
    const potentialGstOnExecution = gst.potentialExecution;
    const chargedGstOnExecution = gst.execution;
    return {
        baseExecution, baseDesign, savingOf, executionSavings, designSavings,
        netTaxable, gstOnDesign, potentialGstOnExecution, chargedGstOnExecution,
        finalPayable: netTaxable + gstOnDesign + chargedGstOnExecution,
    };
}

const ClientSnapshot: React.FC<ClientSnapshotProps> = ({ level, investmentMin, investmentMax, timelinePhases, content, designFee, executionTotal, projectContext, settings, option, options = [], activeOptionId }) => {
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

    const designDays = useMemo(() => {
        if (!timelinePhases || timelinePhases.length === 0) return 14;
        const designPhase = timelinePhases.find(p => p.phaseName === 'Design & Planning');
        return designPhase ? designPhase.durationDays : 14;
    }, [timelinePhases]);

    const executionDays = useMemo(() => {
        if (!timelinePhases || timelinePhases.length === 0) {
            const total = totalDaysMin;
            return total - 14 > 0 ? total - 14 : 45;
        }
        return timelinePhases
            .filter(p => p.phaseName !== 'Design & Planning')
            .reduce((sum, p) => sum + p.durationDays, 0);
    }, [timelinePhases, totalDaysMin]);

    const totalDays = useMemo(() => {
        if (!timelinePhases || timelinePhases.length === 0) return totalDaysMin;
        return timelinePhases.reduce((sum, p) => sum + p.durationDays, 0);
    }, [timelinePhases, totalDaysMin]);

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
    
    // GST as Money bills it: the rate, the billable share of execution and the two switches.
    const gstTerms = gstTermsOf(projectContext);
    const gstRate = gstTerms.rate;
    const ledger = ledgerFor(executionTotal || 0, designFee || 0, discounts, gstTerms);
    // No execution GST is charged at all (switched off, or billed entirely in cash): the waiver is shown.
    const isExecutionGstWaived = gstOn(1, 0, gstTerms).executionWaived;
    const execGstLabel = executionGstLabel(gstTerms);
    const { baseExecution, baseDesign, netTaxable, gstOnDesign, potentialGstOnExecution, chargedGstOnExecution, finalPayable } = ledger;

    // Every option in the same format, side by side (Level 1 with more than one option).
    const comparison = showGrandTotal && options.length > 1
        ? options.map(o => ({ ...o, ledger: ledgerFor(o.executionTotal, o.designFee, discounts, gstTerms) }))
        : [];

    return (
        <section id="snapshot" className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Section 1</div>
                    <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{data.title}</h2>
                    <p className="mt-2 text-slate-600 max-w-3xl whitespace-pre-line">
                        {data.subtitle}
                    </p>
                </div>
                <div className={`rounded-2xl border px-4 py-3 ${isDesignOnly ? 'bg-sky-50 border-sky-100 text-slate-800' : isPMC ? 'bg-amber-50 border-amber-100 text-amber-900' : 'bg-[#F7F7F6] border-slate-200'}`}>
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
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Commercial Summary</h3>
                                    {option && (
                                        <span className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#3D52A0]/10 text-[#3D52A0]">
                                            {option.label} · {option.name}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    {option
                                        ? <>Execution + professional fees for the <span className="font-bold text-slate-700">{option.name}</span> option.{comparison.length > 1 && ' Every option is compared below.'}</>
                                        : 'Consolidated view of Execution + Professional Fees'}
                                </p>
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
                                        <span className="font-mono font-bold">-{formatCurrency(ledger.savingOf(d))}</span>
                                    </div>
                                ))}
                                
                                {/* Subtotal Line */}
                                <div className="border-t border-dashed border-slate-200 pt-2 flex justify-between items-center text-xs font-bold text-slate-500">
                                    <span className="uppercase">Net Taxable Value</span>
                                    <span className="font-mono">{formatCurrency(netTaxable)}</span>
                                </div>

                                {/* GST Design */}
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600 font-medium">3. GST on Design Fees ({gstTerms.designGst ? `${gstRate}%` : 'not charged'})</span>
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
                                        <span className="text-slate-600 font-medium">4. {execGstLabel}</span>
                                        <span className="font-mono text-slate-700">{formatCurrency(chargedGstOnExecution)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Final Total Footer */}
                            <div className="bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 p-6 text-white flex justify-between items-end rounded-b-[20px]">
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
                                    <div className="mt-2 text-3xl font-extrabold text-slate-900">
                                        {investmentMin === investmentMax ? formatClientValue(investmentMin) : `${formatClientValue(investmentMin)} – ${formatClientValue(investmentMax)}`}
                                    </div>
                                    <div className="mt-1 text-sm text-slate-500">Advisory Estimate • Construction Cost</div>
                                    <div className="mt-4 text-sm text-slate-700 bg-white p-3 rounded-xl border border-slate-200">
                                        <span className="font-bold">Note:</span> This is the estimated cost to execute the designs. It does not include professional fees (Design/PMC).
                                    </div>
                                </>
                            ) : isPMC ? (
                                <>
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Estimated PMC Fee</div>
                                    <div className="mt-2 text-3xl font-extrabold text-slate-900">12% <span className="text-lg text-slate-500 font-medium">of Vendor Billing</span></div>
                                    <div className="mt-1 text-sm text-slate-500">Excl. GST • Billed monthly on progress</div>
                                    <div className="mt-4 text-sm text-slate-700 bg-white p-3 rounded-xl border border-slate-200">
                                        <span className="font-bold">Execution Budget:</span> {investmentMin === investmentMax ? formatClientValue(investmentMin) : `${formatClientValue(investmentMin)} – ${formatClientValue(investmentMax)}`} (Managed by us, paid by you).
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Overall project investment</div>
                                    <div className="mt-2 text-3xl font-extrabold text-slate-900">
                                        {investmentMin === investmentMax ? formatClientValue(investmentMin) : `${formatClientValue(investmentMin)} – ${formatClientValue(investmentMax)}`}
                                    </div>
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
                            <div className="mt-2 text-2xl font-extrabold text-slate-900">{totalDays} Days Total</div>
                            <div className="mt-1 text-xs font-semibold text-slate-600">
                                Design: {designDays} Days • Site Execution: {executionDays} Days
                            </div>
                            <div className="mt-1.5 text-[11px] text-slate-400 font-medium">
                                Subject to design freeze approvals and site realities
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="rounded-2xl bg-[#F7F7F6] border border-slate-200 p-4">
                                <div className="font-extrabold text-slate-900 text-xs uppercase tracking-wide mb-2">{comparison.length > 1 ? 'Included in every option' : 'Included Scope'}</div>
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
                                            <li>Modular/Custom Carpentry</li>
                                            <li>On-site Civil & False Ceiling</li>
                                            <li>Electrical & Lighting Work</li>
                                            <li>Paint & Surface Finishes</li>
                                        </>
                                    )}
                                </ul>
                            </div>
                            <div className="rounded-2xl bg-[#F7F7F6] border border-slate-200 p-4">
                                <div className="font-extrabold text-slate-900 text-xs uppercase tracking-wide mb-2">Standard Exclusions</div>
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

            {comparison.length > 1 && (
                <div className="mt-6 rounded-3xl border border-slate-200 bg-white overflow-hidden break-inside-avoid">
                    <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Commercial Summary · All Options</h3>
                        <p className="text-xs text-slate-500 mt-1">The same breakdown for each option, side by side.</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[40rem] text-sm">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="py-3 px-6 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Component</th>
                                    {comparison.map(o => (
                                        <th key={o.id} className={`py-3 px-4 text-right align-bottom ${o.id === activeOptionId ? 'bg-[#3D52A0]/10' : ''}`}>
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{o.label}</div>
                                            <div className="text-xs font-bold text-slate-800">{o.name}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-600">
                                {([
                                    ['1. Total Execution Cost (Excl. Loose Furniture)', (l: typeof ledger) => l.baseExecution],
                                    ['2. Interior Design Fee', (l: typeof ledger) => l.baseDesign],
                                    ...discounts.map(d => [`Special Discount - ${d.name}`, (l: typeof ledger) => -l.savingOf(d)] as const),
                                    ['Net Taxable Value', (l: typeof ledger) => l.netTaxable],
                                    [`3. GST on Design Fees (${gstTerms.designGst ? `${gstRate}%` : 'not charged'})`, (l: typeof ledger) => l.gstOnDesign],
                                    [isExecutionGstWaived ? `4. GST on Execution (${gstRate}%), waived` : `4. ${execGstLabel}`, (l: typeof ledger) => l.chargedGstOnExecution],
                                ] as const).map(([label, value]) => (
                                    <tr key={label}>
                                        <td className={`py-2.5 px-6 font-medium ${label === 'Net Taxable Value' ? 'text-xs font-bold uppercase text-slate-500' : ''}`}>{label}</td>
                                        {comparison.map(o => (
                                            <td key={o.id} className={`py-2.5 px-4 text-right font-mono whitespace-nowrap ${o.id === activeOptionId ? 'bg-[#3D52A0]/10' : ''} ${value(o.ledger) < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                                                {value(o.ledger) < 0 ? `-${formatCurrency(-value(o.ledger))}` : formatCurrency(value(o.ledger))}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-[#3D52A0] text-white">
                                    <td className="py-4 px-6">
                                        <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">Total Project Cost</div>
                                        <div className="text-xs opacity-70">Inclusive of Taxes & Fees</div>
                                    </td>
                                    {comparison.map(o => (
                                        <td key={o.id} className="py-4 px-4 text-right text-lg font-extrabold whitespace-nowrap tabular-nums">{formatCurrency(o.ledger.finalPayable)}</td>
                                    ))}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

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
                        <div className="font-extrabold text-slate-900 text-sm">How to read this summary</div>
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
                <div className="rounded-2xl border-2 border-[#334486] p-5 bg-white">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Critical Milestone</div>
                    <div className="text-sm font-black text-slate-900 uppercase">SOF Freeze</div>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                        Schedule of Finishes (SOF) must be locked by <span className="font-bold text-slate-800">Day 15</span> to avoid procurement delays.
                    </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-5 bg-white">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Lead Time Alert</div>
                    <div className="text-sm font-black text-slate-900 uppercase">Long-Lead Items</div>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                        Custom hardware and imported veneers require <span className="font-bold text-slate-800">4-6 weeks</span> lead time from order date.
                    </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-5 bg-white">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ops Intelligence</div>
                    <div className="text-sm font-black text-slate-900 uppercase">Decision Blockers</div>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                        Electrical point lock and Appliance selection are the primary blockers for modular production.
                    </p>
                </div>
            </div>
        </section>
    );
};

export default ClientSnapshot;
