import React from 'react';
import { ProposalTier, AiComparisonResult, ProposalContent } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { ArrowRightIcon } from '../Icons';

interface ClientOptionsProps {
    tiers: { name: string, executionTotal: number }[];
    comparisonData: AiComparisonResult;
    content?: ProposalContent['options'];
}

const ClientOptions: React.FC<ClientOptionsProps> = ({ tiers, comparisonData, content }) => {
    const recommendedTierName = "Comfort Upgrade"; // Hardcoded for now

    const data = content || {
        title: "Options Overview",
        subtitle: "Each option changes finish level, detailing, and civil scope. Core functionality remains intact."
    };

    return (
        <section id="options" className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
            <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Section 2</div>
                <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{data.title}</h2>
                <p className="mt-2 text-slate-600 max-w-3xl whitespace-pre-line">
                    {data.subtitle}
                </p>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
                {tiers.map(tier => {
                    const isRecommended = tier.name === recommendedTierName;
                    const tierDetails: { [key: string]: { desc: string, features: string[] } } = {
                        "Essential Elegance": { desc: "Functional, value-focused, minimal upgrades.", features: ["Standard electrical + finishes", "Limited ceiling scope", "Practical material grade"] },
                        "Comfort Upgrade": { desc: "Balanced comfort, refined look, controlled upgrades.", features: ["Enhanced lighting + storage", "Living area ceiling upgrades", "Mid-premium materials"] },
                        "Complete Harmony": { desc: "Fully coordinated designer finish across rooms.", features: ["Premium finishes + detailing", "Wider ceiling scope", "Premium hardware add-ons"] }
                    };
                    const details = tierDetails[tier.name] || { desc: '', features: [] };
                    
                    return (
                        <div key={tier.name} className={`rounded-3xl p-6 flex flex-col ${isRecommended ? 'border-2 border-slate-400 bg-white shadow-sm' : 'border border-slate-200 bg-[#F7F7F6]'}`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{tier.name === "Essential Elegance" ? "Option A" : tier.name === "Comfort Upgrade" ? "Option B" : "Option C"}</div>
                                    <div className="mt-2 text-xl font-extrabold text-slate-900">{tier.name}</div>
                                </div>
                                {isRecommended && <div className="px-3 py-1 rounded-full bg-slate-900 text-white text-[11px] font-extrabold">Recommended</div>}
                            </div>
                            <p className="mt-2 text-sm text-slate-600">{details.desc}</p>
                            <div className={`mt-5 rounded-2xl p-4 ${isRecommended ? 'bg-slate-50 border border-slate-200' : 'bg-white border border-slate-200'}`}>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Indicative Budget</div>
                                <div className="mt-1 text-2xl font-extrabold text-slate-900">{formatCurrency(tier.executionTotal)}</div>
                            </div>
                            <ul className="mt-5 text-sm text-slate-700 space-y-2 list-disc list-inside pl-2 mb-4 flex-grow">
                                {details.features.map((f, i) => <li key={i}>{f}</li>)}
                            </ul>
                        </div>
                    )
                })}
            </div>
        </section>
    );
};

export default ClientOptions;