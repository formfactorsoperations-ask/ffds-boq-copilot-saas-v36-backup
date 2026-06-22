
import React from 'react';
import { FullBoqItem } from '../../types';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { ChevronDownIcon, CheckBadgeIcon } from '../Icons';

interface ClientRoomwiseProps {
    tiers: { id: string, name: string, groupedBoq: { [key: string]: FullBoqItem[] }, executionTotal: number }[];
    mode?: 'standard' | 'advisory';
    activeTierId?: string;
    id?: string; // New prop for custom section ID
}

const ClientRoomwise: React.FC<ClientRoomwiseProps> = ({ tiers, mode = 'standard', activeTierId, id = "roomwise" }) => {
    // If activeTierId provided, use it. Otherwise default to "Comfort" or first.
    const defaultTier = tiers.find(t => t.name === "Comfort Upgrade") || tiers[0];
    const activeTier = tiers.find(t => t.id === activeTierId) || defaultTier;
    
    const getRoomTotal = (items: FullBoqItem[]) => 
        items.reduce((sum, item) => sum + calculateSellPrice(item.materials, item.labor, item.margin) * item.qty, 0);

    // Helper to get unique categories for the summary view
    const getCategories = (items: FullBoqItem[]) => {
        const cats = new Set(items.map(i => i.cat));
        return Array.from(cats).slice(0, 3).join(' • ');
    };

    if (!activeTier) return null;

    return (
        <section id={id} className="rounded-3xl border border-slate-200 bg-white shadow-sm p-5 md:p-8 transition-all duration-300">
            <div>
                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                    <div>
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{mode === 'advisory' ? 'Scope Breakdown' : 'Section 3'}</div>
                        <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
                            {mode === 'advisory' ? "Detailed Scope of Works" : "Room-wise Estimates"}
                        </h2>
                    </div>
                    {mode === 'advisory' && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-800 self-start">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                            Viewing: {activeTier.name}
                        </div>
                    )}
                </div>
                <p className="mt-2 text-slate-600 max-w-3xl text-sm leading-relaxed">
                    {mode === 'advisory' 
                        ? `To ensure transparency without overwhelming you with numbers, we have bundled the scope room-wise. This defines exactly what is included in the "${activeTier.name}" package.`
                        : `The values below are outcome bundles based on the "${activeTier.name}" specification.`
                    }
                </p>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Object.entries(activeTier.groupedBoq || {}).map(([roomName, rawItems]) => {
                    const items = rawItems as FullBoqItem[];
                    
                    return (
                        <details 
                            key={roomName} 
                            className="group scan-first rounded-2xl border bg-[#F7F7F6] border-slate-200 open:bg-white open:border-slate-300 open:shadow-md transition-all duration-300 overflow-hidden"
                        >
                            {/* Header / Summary Card */}
                            <summary className="p-5 cursor-pointer flex justify-between items-center list-none [&::-webkit-details-marker]:hidden outline-none select-none">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{roomName}</h3>
                                        <span className="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-500 font-bold group-open:bg-slate-100">
                                            {items.length} Items
                                        </span>
                                    </div>
                                    
                                    {/* Hide summary text when expanded to reduce clutter */}
                                    <p className="text-[11px] text-slate-500 mt-1 font-medium group-open:hidden">
                                        Includes: {getCategories(items)}...
                                    </p>

                                    {mode !== 'advisory' && (
                                        <div className="mt-1 text-lg font-black text-slate-900">
                                            {formatCurrency(getRoomTotal(items))}
                                        </div>
                                    )}
                                </div>

                                <div className="p-2 rounded-full bg-white text-slate-400 group-hover:text-slate-600 transition-all group-open:rotate-180 group-open:bg-indigo-100 group-open:text-indigo-600">
                                    <ChevronDownIcon className="w-4 h-4" />
                                </div>
                            </summary>
                            
                            {/* Expandable Content */}
                            <div className="border-t border-slate-100 bg-white p-2">
                                <div className="max-h-64 overflow-y-auto pr-1 custom-scrollbar p-2">
                                    <ul className="space-y-3">
                                        {items.map(item => (
                                            <li key={item.id} className="text-xs text-slate-700 leading-snug flex items-start gap-3 group/item">
                                                <CheckBadgeIcon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                                <div className="flex-grow">
                                                    <div className="flex justify-between items-start">
                                                        <span className="font-bold text-slate-800">{item.name}</span>
                                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                                                            {item.qty} {item.unit}
                                                        </span>
                                                    </div>
                                                    {item.specs && mode === 'advisory' && (
                                                        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed border-l-2 border-slate-100 pl-2">
                                                            {item.specs}
                                                        </p>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                {/* Mobile-only CTA at bottom of expanded card */}
                                <div className="lg:hidden pt-3 border-t border-slate-50 text-center">
                                    <div 
                                        className="inline-block text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer close-details-trigger" 
                                        onClick={(e) => {
                                            // Close the details element manually in React view
                                            e.currentTarget.closest('details')?.removeAttribute('open');
                                        }}
                                    >
                                        Close Details
                                    </div>
                                </div>
                            </div>
                        </details>
                    );
                })}
            </div>
        </section>
    );
};

export default ClientRoomwise;
