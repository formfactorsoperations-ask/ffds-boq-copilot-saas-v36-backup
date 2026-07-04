
import React from 'react';
import { ProjectContext, FullBoqItem, ProposalTier, AiComparisonResult, TimelinePhase, ComparisonRow } from '../../types';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { useOrg } from '../../contexts/OrgContext';

interface TierWithCalculations extends ProposalTier {
    fullBoq: FullBoqItem[];
    executionTotal: number;
    groupedBoq: { [key: string]: FullBoqItem[] };
}

interface ClientExportViewProps {
    tiers: TierWithCalculations[];
    projectContext: ProjectContext;
    comparisonData: AiComparisonResult;
    timelinePhases: TimelinePhase[];
}

const Page: React.FC<{children: React.ReactNode, orgData: any}> = ({ children, orgData }) => (
    <div className="export-page">
        <div className="flex-grow">{children}</div>
        <footer className="export-footer">
            {orgData.orgName} | {orgData.contactEmail}
        </footer>
    </div>
);

const ClientExportView: React.FC<ClientExportViewProps> = ({ tiers, projectContext, comparisonData, timelinePhases }) => {
    const { orgData } = useOrg();
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

    return (
        <div className="print-only">
            {/* --- PAGE 1: COVER --- */}
            <Page orgData={orgData}>
                <div className="flex h-full">
                    <div className="w-1/2 flex flex-col justify-center items-start pr-8">
                        <h1 className="text-5xl font-extrabold uppercase" style={{letterSpacing: '0.1em', color: orgData.themeColor || '#000000'}}>Interior Proposal</h1>
                        <p className="text-2xl mt-4 text-gray-600">Thoughtfully curated for your {projectContext.config}.</p>
                    </div>
                    <div className="w-1/2 flex flex-col justify-center items-start pl-8 border-l-4 border-orange-400">
                        <div className="text-center mb-12">
                            <p className="text-xs uppercase tracking-[0.2em]">ARCHITECTS</p>
                            <h2 className="text-3xl font-bold tracking-widest my-1 border-y-2 border-indigo-950 py-2">{orgData?.orgName?.toUpperCase() || 'FORM FACTORS'}</h2>
                            <p className="text-sm uppercase tracking-widest">DESIGN STUDIO</p>
                            <p className="text-xs uppercase tracking-[0.2em]">INTERIOR DESIGNERS</p>
                        </div>
                        <div className="space-y-3 text-sm">
                            <p><strong>Project:</strong> {projectContext.config} – {projectContext.location}</p>
                            <p><strong>Client Name:</strong> {projectContext.clientName || projectContext.name}</p>
                            <p><strong>Project Location:</strong> {projectContext.location}</p>
                            <p><strong>Date:</strong> {today}</p>
                        </div>
                    </div>
                </div>
            </Page>

            {/* --- PAGE 2: INTRODUCTION & BUDGET OVERVIEW --- */}
            <Page orgData={orgData}>
                <h2 className="text-2xl font-bold mb-6">Dear {projectContext.clientName || projectContext.name},</h2>
                <p className="mb-4">Thank you for considering {orgData?.orgName || 'Form Factors Design Studio'} for your new {projectContext.config} home interiors at {projectContext.location}. We understand this space is a significant step for your family — designed for both functionality and comfort. Our approach focuses on creating timeless, clutter-free interiors that fit your daily lifestyle while staying aligned with your investment comfort.</p>
                <p className="mb-8">To make decision-making easier, we've curated three well-defined turnkey options that scale in features and finishes while maintaining design coherence.</p>
                
                <h3 className="text-xl font-bold mb-4">Project Scope Overview</h3>
                <ul className="list-disc list-inside mb-8 pl-4 text-gray-700">
                    <li>Complete Turnkey Interior Execution for {projectContext.config}</li>
                    <li>Modular Kitchen with civil and electrical works</li>
                    <li>Wardrobes, Beds, Study/Work Units</li>
                    <li>Living Room Furniture, TV Unit, Panelling</li>
                    <li>Painting and POP False Ceiling (as per option)</li>
                    <li>Electricals, Lighting & Final Site Finishing</li>
                    <li>Project Coordination and Supervision</li>
                </ul>

                <h3 className="text-xl font-bold mb-4">Budget Overview</h3>
                <table className="w-full itemized-table">
                    <thead>
                        <tr>
                            <th>Option</th>
                            <th>Highlights</th>
                            <th className="text-right">Total (Excl. GST)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tiers.map(tier => (
                            <tr key={tier.id}>
                                <td className="font-bold">{tier.name}</td>
                                <td>{/* AI could generate this */}</td>
                                <td className="text-right font-bold">{formatCurrency(tier.summary.totalSell)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Page>

            {/* --- PAGE 3 & 4: COMPARISON MATRICES --- */}
            <Page orgData={orgData}>
                <h2 className="text-2xl font-bold mb-6">Material & Scope Difference Overview</h2>
                <p className="mb-8">Each option represents not just added scope, but also upgrades in material quality, hardware performance, and overall finish durability.</p>
                <h3 className="text-xl font-bold mb-4">Material & Finish Difference Matrix</h3>
                <table className="w-full itemized-table text-xs">
                     <thead>
                        <tr>
                            <th className="w-1/4">Category</th>
                            {tiers.map((t, idx) => <th key={`${t.id}-${idx}`} className="text-center">{t.name}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {(comparisonData.materialMatrix || []).map((row: ComparisonRow, idx: number) => (
                            <tr key={idx}>
                                <td className="font-bold">{row.feature}</td>
                                {tiers.map((t, idx) => <td key={`${t.id}-${idx}`} className="text-center">{row[t.name] || '-'}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Page>
             <Page orgData={orgData}>
                 <h2 className="text-2xl font-bold mb-6">Visual Upgrade Summary</h2>
                <h3 className="text-xl font-bold mb-4">Detailed Option Comparison</h3>
                <table className="w-full itemized-table text-xs">
                     <thead>
                        <tr>
                            <th className="w-1/4">Item / Scope</th>
                            {tiers.map((t, idx) => <th key={`${t.id}-${idx}`} className="text-center">{t.name}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {(comparisonData.scopeMatrix || []).map((row: ComparisonRow, idx: number) => (
                            <tr key={idx}>
                                <td className="font-bold">{row.feature}</td>
                                {tiers.map((t, idx) => <td key={`${t.id}-${idx}`} className="text-center" dangerouslySetInnerHTML={{ __html: (row[t.name] || '❌ None').replace(/✔/g, '✓').replace(/❌/g, '✗') }}></td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
             </Page>

            {/* --- PAGES 5+: ITEMIZED ESTIMATES --- */}
            {tiers.map(tier => (
                 <Page key={tier.id} orgData={orgData} >
                    <h2 className="text-2xl font-bold mb-6 page-break-before">Room-wise Itemized Estimate</h2>
                    <h3 className="text-lg font-semibold mb-4 bg-gray-100 p-2 text-center">{tier.name}</h3>
                    <table className="w-full itemized-table">
                        <thead>
                            <tr>
                                <th>SR</th>
                                <th className="w-2/5">Item</th>
                                <th className="text-center">Unit</th>
                                <th className="text-center">Qty</th>
                                <th className="text-right">Client Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(tier.groupedBoq || {}).map(([roomName, items]) => (
                                <React.Fragment key={roomName}>
                                    <tr className="room-header">
                                        <td colSpan={5}>{roomName.toUpperCase()}</td>
                                    </tr>
                                    {(items as FullBoqItem[]).map((item, idx) => (
                                        <tr key={item.id}>
                                            <td>{idx + 1}</td>
                                            <td>{item.name}</td>
                                            <td className="text-center">{item.unit}</td>
                                            <td className="text-center">{item.qty.toFixed(2)}</td>
                                            <td className="text-right">{formatCurrency(calculateSellPrice(item.materials, item.labor, item.margin) * item.qty)}</td>
                                        </tr>
                                    ))}
                                    <tr className="total-row">
                                        <td colSpan={4} className="text-right">Room Total</td>
                                        <td className="text-right">{formatCurrency((items as FullBoqItem[]).reduce((sum, item) => sum + calculateSellPrice(item.materials, item.labor, item.margin) * item.qty, 0))}</td>
                                    </tr>
                                </React.Fragment>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="total-row text-lg bg-gray-200">
                                <td colSpan={4} className="text-right p-4">Total (Excl. GST)</td>
                                <td className="text-right p-4">{formatCurrency(tier.summary.totalSell)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </Page>
            ))}

            {/* --- TIMELINE & PAYMENTS PAGE --- */}
            <Page orgData={orgData}>
                <h2 className="text-2xl font-bold mb-6">Timeline & Milestones</h2>
                <p className="mb-8">We follow a structured and phased approach to ensure quality execution and minimal disruption. The proposed timeline below is indicative and may shift slightly depending on actual possession and final approvals.</p>
                <p className="mb-8"><strong>Estimated Duration:</strong> {(timelinePhases || []).reduce((sum, p) => sum + (p.durationDays || 0), 0)} Days Post Possession</p>
                <h3 className="text-xl font-bold mb-4">Payment Schedule</h3>
                <table className="w-full itemized-table">
                    <thead><tr><th>Stage</th><th>Milestone</th><th>%</th><th>Timeline</th></tr></thead>
                    <tbody>
                        <tr><td>Part 1</td><td>Discovery Phase (Retainer)</td><td>25%</td><td>Day 1 - Day 5</td></tr>
                        <tr><td>Part 2</td><td>Design Development</td><td>25%</td><td>Day 6 - Day 15</td></tr>
                        <tr><td>Part 3</td><td>3D & Estimation</td><td>25%</td><td>Day 16 - Day 30</td></tr>
                        <tr><td>Part 4</td><td>Site Coordination & Material Finalization</td><td>20%</td><td>Day 31 - Day 45</td></tr>
                        <tr><td>Part 5</td><td>Final Drawings & Handover</td><td>5%</td><td>Day 75 - Day 90</td></tr>
                    </tbody>
                </table>
            </Page>

            {/* --- DECISION LOCK PAGE (Print) --- */}
            {projectContext.proposalDecision && projectContext.proposalDecision.enabled && (
                <Page orgData={orgData}>
                    <h2 className="text-2xl font-bold mb-6">Engagement Confirmation</h2>
                    <p className="mb-8 text-gray-700">Please indicate your preferred way forward to allow us to align our design and execution resources accordingly.</p>
                    
                    <div className="space-y-6">
                        {projectContext.proposalDecision.options.map(opt => {
                            const isSelected = projectContext.proposalDecision?.selected === opt.id;
                            return (
                                <div key={opt.id} className={`border-2 p-6 rounded-xl ${isSelected ? 'border-indigo-950 bg-gray-50' : 'border-gray-200'}`}>
                                    <div className="flex items-start gap-4">
                                        <div className={`w-6 h-6 border-2 flex items-center justify-center font-bold text-sm ${isSelected ? 'border-indigo-950 bg-indigo-950 text-white' : 'border-gray-300'}`}>
                                            {isSelected ? '✓' : ''}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg">{opt.title}</h3>
                                            <p className="text-sm text-gray-600 mt-1">{opt.blurb}</p>
                                            {isSelected && (
                                                <div className="mt-4 text-xs font-bold uppercase tracking-wider text-gray-500">
                                                    Selected Option
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div className="mt-12 pt-8 border-t-2 border-indigo-950 flex justify-between items-end">
                        <div>
                            <p className="text-sm font-bold uppercase mb-8">Client Signature</p>
                            <div className="w-48 border-b border-indigo-950"></div>
                        </div>
                        <div>
                            <p className="text-sm font-bold uppercase mb-8">Date</p>
                            <div className="w-48 border-b border-indigo-950"></div>
                        </div>
                    </div>
                </Page>
            )}

        </div>
    );
};

export default ClientExportView;
