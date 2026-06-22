
import React from 'react';
import { ProposalTier, AiComparisonResult, ProposalContent } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { ArrowRightIcon } from '../Icons';

interface ClientOptionsProps {
    tiers: { id: string, name: string, executionTotal: number }[];
    comparisonData: AiComparisonResult;
    content?: ProposalContent['options'];
    activeTierId?: string;
    onSelectTier?: (id: string) => void;
}

const ClientOptions: React.FC<ClientOptionsProps> = ({ tiers, comparisonData, content, activeTierId, onSelectTier }) => {
    const recommendedTierName = "Comfort Upgrade"; // Hardcoded for now

    const data = content || {
        title: "Options Overview",
        subtitle: "Each option changes finish level, detailing, and civil scope. Core functionality remains intact."
    };

    const handleTierClick = (id: string) => {
        if (onSelectTier) onSelectTier(id);
    }

    const handleScrollToSpecs = (e: React.MouseEvent) => {
        e.preventDefault();
        const element = document.getElementById('material-specs');
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
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
                    const isActive = activeTierId === tier.id;
                    const tierDetails: { [key: string]: { desc: string, features: string[] } } = {
                        "Essential Elegance": { desc: "Functional, value-focused, minimal upgrades.", features: ["Standard electrical + finishes", "Limited ceiling scope", "Practical material grade"] },
                        "Comfort Upgrade": { desc: "Balanced comfort, refined look, controlled upgrades.", features: ["Enhanced lighting + storage", "Living area ceiling upgrades", "Mid-premium materials"] },
                        "Complete Harmony": { desc: "Fully coordinated designer finish across rooms.", features: ["Premium finishes + detailing", "Wider ceiling scope", "Premium hardware add-ons"] }
                    };
                    const details = tierDetails[tier.name] || { desc: '', features: [] };
                    
                    return (
                        <div 
                            key={tier.id} 
                            onClick={() => handleTierClick(tier.id)}
                            data-tier-id={tier.id}
                            data-recommended={isRecommended ? "true" : "false"}
                            className={`tier-option-card rounded-3xl p-6 flex flex-col cursor-pointer transition-all duration-300 relative
                                ${isActive 
                                    ? 'border-2 border-slate-800 bg-white shadow-lg scale-[1.02] z-10 ring-2 ring-slate-100' 
                                    : isRecommended 
                                        ? 'border-2 border-slate-200 bg-white shadow-sm hover:border-slate-400' 
                                        : 'border border-slate-200 bg-[#F7F7F6] hover:bg-white hover:shadow-sm'
                                }`
                            }
                        >
                            {/* Viewing Details Badge */}
                            <div className={`viewing-badge absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-md ${isActive ? '' : 'hidden'}`}>
                                Viewing Details
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{tier.name === "Essential Elegance" ? "Option A" : tier.name === "Comfort Upgrade" ? "Option B" : "Option C"}</div>
                                    <div className="mt-2 text-xl font-extrabold text-slate-900">{tier.name}</div>
                                </div>
                                {/* Recommended Badge - Hide if Active to avoid clutter/overlap with viewing badge if needed, but keeping logic distinct */}
                                <div className={`rec-badge px-3 py-1 rounded-full bg-slate-900 text-white text-[11px] font-extrabold ${isRecommended && !isActive ? '' : 'hidden'}`}>Recommended</div>
                            </div>
                            <p className="mt-2 text-sm text-slate-600">{details.desc}</p>
                            <div className={`mt-5 rounded-2xl p-4 transition-colors price-container ${isActive ? 'bg-slate-50 border border-slate-200' : 'bg-white border border-slate-200'}`}>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Indicative Budget</div>
                                <div className="mt-1 text-2xl font-extrabold text-slate-900">{formatCurrency(tier.executionTotal)}</div>
                            </div>
                            <ul className="mt-5 text-sm text-slate-700 space-y-2 list-disc list-inside pl-2 mb-4 flex-grow">
                                {details.features.map((f, i) => <li key={i}>{f}</li>)}
                            </ul>
                            
                            <div className={`cta-text mt-auto pt-4 border-t border-slate-100 text-center text-xs font-bold transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                {isActive ? 'Showing Room-wise Scope Below ↓' : 'Click to View Detailed Scope'}
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="mt-6 text-center">
                <button 
                    id="view-specs-trigger"
                    onClick={handleScrollToSpecs}
                    className="inline-flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-full cursor-pointer"
                >
                    <span>View detailed material specification comparison</span>
                    <ArrowRightIcon className="w-3 h-3" />
                </button>
            </div>
        </section>
    );
};

export default ClientOptions;
