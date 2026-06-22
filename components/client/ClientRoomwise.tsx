
import React from 'react';
import { FullBoqItem } from '../../types';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { ChevronDownIcon, CheckBadgeIcon } from '../Icons';

interface ClientRoomwiseProps {
    tiers: { id: string, name: string, groupedBoq: { [key: string]: FullBoqItem[] }, executionTotal: number }[];
    mode?: 'standard' | 'advisory';
    activeTierId?: string;
    id?: string;
}

const ClientRoomwise: React.FC<ClientRoomwiseProps> = ({ tiers, mode = 'standard', activeTierId, id = "roomwise" }) => {
    // Default active logic
    const defaultTierId = tiers.find(t => t.name === "Comfort Upgrade")?.id || tiers[0]?.id;
    const currentActiveId = activeTierId || defaultTierId;

    const getRoomTotal = (items: FullBoqItem[]) => 
        items.reduce((sum, item) => sum + calculateSellPrice(item.materials, item.labor, item.margin) * item.qty, 0);

    const getCategories = (items: FullBoqItem[]) => {
        const cats = new Set(items.map(i => i.cat));
        return Array.from(cats).slice(0, 3).join(' • ');
    };

    const getRemark = (item: FullBoqItem) => {
        if (item.name.toLowerCase().includes('actual')) return 'As Actuals';
        if (item.materials === 0 && item.labor > 0) return 'Labour Only';
        
        if (item.rationale) {
            // Clean "Imported" artifacts from Excel imports for the client view
            const clean = item.rationale
                .replace(/^Imported:?\s*/i, '') // Remove "Imported: " prefix
                .replace(/^Imported$/i, '')     // Remove exact "Imported"
                .trim();
            return clean;
        }
        return '';
    };

    const getCleanSpecs = (specs: string) => {
        if (!specs) return '';
        // Filter out the default Excel import placeholder
        if (specs.toLowerCase().includes('imported via excel')) return '';
        return specs;
    };

    return (
        <>
            {tiers.map(tier => {
                const isActive = tier.id === currentActiveId;
                const srNo = 1;
                const grandTotal = tier.executionTotal;

                return (
                    <section 
                        key={tier.id}
                        id={`roomwise-content-${tier.id}`}
                        className={`roomwise-content rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 break-inside-avoid transition-all duration-300 ${isActive ? 'block' : 'hidden'}`}
                        style={{ display: isActive ? 'block' : 'none' }}
                    >
                        {mode === 'standard' ? (
                            // --- LEVEL 2: DETAILED SPECIFICATION TABLE VIEW ---
                            <>
                                {/* Standardized Header Block */}
                                <div className="mb-8">
                                    <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                                        <div>
                                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Section 3: Execution Bundles</div>
                                            <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
                                                Detailed Specification & Estimate
                                            </h2>
                                            <p className="mt-2 text-slate-600 max-w-3xl text-sm leading-relaxed">
                                                A transparent, line-by-line breakdown of your investment for the <strong>{tier.name}</strong> package. This document acts as the financial baseline for the execution contract.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Grand Total Card */}
                                <div className="mb-8 bg-slate-900 text-white rounded-2xl p-6 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Project Value ({tier.name})</p>
                                        <h3 className="text-3xl font-extrabold tracking-tight">{formatCurrency(grandTotal)}</h3>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <p className="text-xs font-bold text-slate-300">Excluding GST</p>
                                            <p className="text-[10px] text-slate-500">Applicable @ 18%</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Detailed Table */}
                                <div className="overflow-hidden rounded-2xl border border-slate-200">
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-200">
                                                <th className="py-4 px-4 w-12 text-center">#</th>
                                                <th className="py-4 px-4">Item Description</th>
                                                <th className="py-4 px-4 w-24 text-center">Unit</th>
                                                <th className="py-4 px-4 w-24 text-center">Qty</th>
                                                <th className="py-4 px-4 w-32 text-right">Rate</th>
                                                <th className="py-4 px-6 w-36 text-right bg-slate-100/50">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-slate-700">
                                            {Object.entries(tier.groupedBoq || {}).map(([roomName, rawItems], rIdx) => {
                                                const items = rawItems as FullBoqItem[];
                                                const roomTotal = getRoomTotal(items);
                                                
                                                return (
                                                    <React.Fragment key={roomName}>
                                                        {/* Room Header Row */}
                                                        <tr className="bg-slate-100/80 border-y border-slate-200 break-inside-avoid">
                                                            <td colSpan={5} className="py-3 px-4">
                                                                <span className="font-bold text-slate-800 text-xs uppercase tracking-wide">{roomName}</span>
                                                            </td>
                                                            <td className="py-3 px-6 text-right bg-slate-200/50">
                                                                <span className="font-mono text-sm font-bold text-slate-900">{formatCurrency(roomTotal)}</span>
                                                            </td>
                                                        </tr>

                                                        {/* Items */}
                                                        {items.map((item, iIdx) => {
                                                            const sellRate = calculateSellPrice(item.materials, item.labor, item.margin);
                                                            const lineTotal = sellRate * item.qty;
                                                            const remark = getRemark(item);
                                                            const cleanSpecs = getCleanSpecs(item.specs);
                                                            
                                                            return (
                                                                <tr key={item.id} className="hover:bg-slate-50 transition-colors break-inside-avoid">
                                                                    <td className="py-4 px-4 text-center text-slate-400 text-xs font-mono">{rIdx * 100 + iIdx + 1}</td>
                                                                    <td className="py-4 px-4">
                                                                        <div className="font-medium text-slate-900 text-sm">{item.name}</div>
                                                                        {cleanSpecs && (
                                                                            <div className="text-xs text-slate-500 leading-relaxed mt-1 max-w-xl">{cleanSpecs}</div>
                                                                        )}
                                                                        {remark && (
                                                                            <div className="mt-1 text-[10px] text-slate-400 italic">
                                                                                {remark}
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-4 px-4 text-center text-xs text-slate-500 font-medium">{item.unit}</td>
                                                                    <td className="py-4 px-4 text-center font-bold text-slate-700">{item.qty}</td>
                                                                    <td className="py-4 px-4 text-right font-mono text-xs text-slate-600">
                                                                        {formatCurrency(sellRate)}
                                                                    </td>
                                                                    <td className="py-4 px-6 text-right font-bold text-slate-900 font-mono bg-slate-50">
                                                                        {formatCurrency(lineTotal)}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                
                                <div className="mt-6 flex items-center justify-between text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                    <p>Standard Estimation Format</p>
                                    <p>* Rates include material & installation</p>
                                </div>
                            </>
                        ) : (
                            // --- LEVEL 1: ADVISORY / SUMMARY VIEW ---
                            <>
                                <div>
                                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                                        <div>
                                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Scope Breakdown</div>
                                            <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
                                                Detailed Scope of Works
                                            </h2>
                                        </div>
                                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-800 self-start">
                                            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                                            Viewing: {tier.name}
                                        </div>
                                    </div>
                                    <p className="mt-2 text-slate-600 max-w-3xl text-sm leading-relaxed">
                                        To ensure transparency without overwhelming you with numbers, we have bundled the scope room-wise. This defines exactly what is included in the "{tier.name}" package.
                                    </p>
                                </div>

                                <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {Object.entries(tier.groupedBoq || {}).map(([roomName, rawItems]) => {
                                        const items = rawItems as FullBoqItem[];
                                        
                                        return (
                                            <details 
                                                key={roomName} 
                                                className="group scan-first rounded-2xl border bg-[#F7F7F6] border-slate-200 open:bg-white open:border-slate-300 open:shadow-md transition-all duration-300 overflow-hidden"
                                            >
                                                <summary className="p-5 cursor-pointer flex justify-between items-center list-none [&::-webkit-details-marker]:hidden outline-none select-none">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{roomName}</h3>
                                                            <span className="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-500 font-bold group-open:bg-slate-100">
                                                                {items.length} Items
                                                            </span>
                                                        </div>
                                                        
                                                        <p className="text-[11px] text-slate-500 mt-1 font-medium group-open:hidden">
                                                            Includes: {getCategories(items)}...
                                                        </p>
                                                    </div>

                                                    <div className="p-2 rounded-full bg-white text-slate-400 group-hover:text-slate-600 transition-all group-open:rotate-180 group-open:bg-indigo-100 group-open:text-indigo-600">
                                                        <ChevronDownIcon className="w-4 h-4" />
                                                    </div>
                                                </summary>
                                                
                                                <div className="border-t border-slate-100 bg-white p-2">
                                                    <div className="max-h-64 overflow-y-auto pr-1 custom-scrollbar p-2">
                                                        <ul className="space-y-3">
                                                            {items.map(item => {
                                                                const cleanSpecs = getCleanSpecs(item.specs);
                                                                return (
                                                                    <li key={item.id} className="text-xs text-slate-700 leading-snug flex items-start gap-3 group/item">
                                                                        <CheckBadgeIcon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                                                        <div className="flex-grow">
                                                                            <div className="flex justify-between items-start">
                                                                                <span className="font-bold text-slate-800">{item.name}</span>
                                                                                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                                                                                    {item.qty} {item.unit}
                                                                                </span>
                                                                            </div>
                                                                            {cleanSpecs && (
                                                                                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed border-l-2 border-slate-100 pl-2">
                                                                                    {cleanSpecs}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    </div>
                                                    <div className="lg:hidden pt-3 border-t border-slate-50 text-center">
                                                        <div 
                                                            className="inline-block text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer close-details-trigger" 
                                                            onClick={(e) => {
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
                            </>
                        )}
                    </section>
                );
            })}
        </>
    );
};

export default ClientRoomwise;
