
import React from 'react';
import { FullBoqItem } from '../../types';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { ChevronDownIcon, CheckBadgeIcon } from '../Icons';

interface ClientRoomwiseProps {
    tiers: { id: string, name: string, groupedBoq: { [key: string]: FullBoqItem[] }, executionTotal: number }[];
    mode?: 'standard' | 'advisory';
    activeTierId?: string;
    id?: string;
    /** "Show Scope Pricing & Total": package value, room totals and item amounts in the summary view. */
    showPricing?: boolean;
}

/* The same scope item across options: one bank item, or one name when it has no bank entry. */
const itemKey = (item: FullBoqItem) => (item as any).bankId || item.name;

const ClientRoomwise: React.FC<ClientRoomwiseProps> = ({ tiers, mode = 'standard', activeTierId, id = "roomwise", showPricing = false }) => {
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

    /*
      What tells one option from another in the summary view.

      The options are mostly the same rooms and the same items, built to a
      different specification and priced accordingly, with a few items only the
      higher options include. Names and quantities alone look identical across
      options, so picking a different option seemed to change nothing. The
      summary now shows the option's specification, the items it adds, and —
      when the studio ticks "Show Scope Pricing & Total" — what it costs.
    */
    const itemsOf = (tier: ClientRoomwiseProps['tiers'][number]) => Object.values(tier.groupedBoq || {}).flat() as FullBoqItem[];
    const inEveryOption = React.useMemo(() => {
        if (tiers.length < 2) return null;
        const sets = tiers.map(t => new Set(itemsOf(t).map(itemKey)));
        return new Set([...sets[0]].filter(k => sets.every(set => set.has(k))));
    }, [tiers]);
    /** The specification line most of an option's items carry ("Mid spec: 1mm laminate, soft-close hardware"). */
    const specOf = (tier: ClientRoomwiseProps['tiers'][number]) => {
        const counts = new Map<string, number>();
        itemsOf(tier).forEach(item => {
            const spec = getRemark(item).split(' · ')[0].trim();
            if (spec) counts.set(spec, (counts.get(spec) || 0) + 1);
        });
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    };

    /*
      What Level 2 prints under an item: the specification someone wrote for it,
      and nothing in its place when nobody has.

      The grey line it used to print was the line's rationale — a note the app
      writes for itself ("Mid spec: 1mm laminate, soft-close hardware" from the
      option generator, "Added from Bundle: …", a takeoff derivation). On the
      planning document it read as a specification the client was agreeing to.
      Only a commercial basis that changes what is billed is still stated.
    */
    const getBillingNote = (item: FullBoqItem) => {
        if (item.name.toLowerCase().includes('actual')) return 'As Actuals';
        if (item.materials === 0 && item.labor > 0) return 'Labour Only';
        return '';
    };

    const getCleanSpecs = (specs: string) => {
        if (!specs) return '';
        // Filter out the default Excel import placeholder
        if (specs.toLowerCase().includes('imported via excel')) return '';
        // ...and the placeholder an item without a bank entry is given.
        if (specs.trim().toLowerCase() === 'scope details') return '';
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
                        className={`roomwise-content rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 break-inside-avoid transition-all duration-300 ${isActive ? 'block hud-swap' : 'hidden'}`}
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
                                <div className="mb-8 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white rounded-2xl p-6 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
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
                                                            const remark = getBillingNote(item);
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
                                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-sky-50 border border-sky-100 rounded-xl text-xs font-bold text-sky-800 self-start">
                                            <span className="w-2 h-2 rounded-full bg-[#3D52A0] animate-pulse"></span>
                                            Viewing: {tier.name}
                                        </div>
                                    </div>
                                    <p className="mt-2 text-slate-600 max-w-3xl text-sm leading-relaxed">
                                        To ensure transparency without overwhelming you with numbers, we have bundled the scope room-wise. This defines exactly what is included in the "{tier.name}" package.
                                    </p>
                                    {(() => {
                                        const spec = specOf(tier);
                                        if (!spec && !showPricing) return null;
                                        return (
                                            <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                                {spec && (
                                                    <div>
                                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Specification</div>
                                                        <div className="mt-0.5 text-sm font-bold text-slate-800">{spec}</div>
                                                    </div>
                                                )}
                                                {showPricing && (
                                                    <div className="md:text-right">
                                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Package value (excl. GST)</div>
                                                        <div className="mt-0.5 text-lg font-extrabold text-slate-900 tabular-nums">{formatCurrency(grandTotal)}</div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>

                                <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {Object.entries(tier.groupedBoq || {}).map(([roomName, rawItems]) => {
                                        const items = rawItems as FullBoqItem[];
                                        const tierSpec = specOf(tier);
                                        const added = inEveryOption ? items.filter(i => !inEveryOption.has(itemKey(i))).length : 0;
                                        
                                        return (
                                            <details 
                                                key={roomName} 
                                                className="group scan-first rounded-2xl border bg-[#F7F7F6] border-slate-200 open:bg-white open:border-slate-300 open:shadow-md transition-all duration-300 overflow-hidden"
                                            >
                                                <summary className="p-5 cursor-pointer flex justify-between items-center list-none [&::-webkit-details-marker]:hidden outline-none select-none">
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{roomName}</h3>
                                                            <span className="whitespace-nowrap text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-500 font-bold group-open:bg-slate-100">
                                                                {items.length} Items
                                                            </span>
                                                            {added > 0 && (
                                                                <span className="whitespace-nowrap text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                                                                    +{added} in this option
                                                                </span>
                                                            )}
                                                        </div>
                                                        
                                                        <p className="text-[11px] text-slate-500 mt-1 font-medium group-open:hidden">
                                                            Includes: {getCategories(items)}...
                                                        </p>
                                                    </div>

                                                    <div className="flex items-center gap-3 shrink-0">
                                                        {showPricing && (
                                                            <span className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(getRoomTotal(items))}</span>
                                                        )}
                                                        <div className="p-2 rounded-full bg-white text-slate-400 group-hover:text-slate-600 transition-all group-open:rotate-180 group-open:bg-sky-100 group-open:text-[#3D52A0]">
                                                            <ChevronDownIcon className="w-4 h-4" />
                                                        </div>
                                                    </div>
                                                </summary>
                                                
                                                <div className="border-t border-slate-100 bg-white p-2">
                                                    <div className="max-h-64 overflow-y-auto pr-1 custom-scrollbar p-2">
                                                        <ul className="space-y-3">
                                                            {items.map(item => {
                                                                const cleanSpecs = getCleanSpecs(item.specs);
                                                                // The option-wide spec is shown once above; only what differs is repeated here.
                                                                const remark = getRemark(item).replace(tierSpec, '').replace(/^\s*·\s*/, '').replace(/^included at this tier$/i, '').trim();
                                                                const onlyHere = !!inEveryOption && !inEveryOption.has(itemKey(item));
                                                                return (
                                                                    <li key={item.id} className="text-xs text-slate-700 leading-snug flex items-start gap-3 group/item">
                                                                        <CheckBadgeIcon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                                                        <div className="flex-grow">
                                                                            <div className="flex justify-between items-start">
                                                                                <div className="min-w-0">
                                                                                    <span className="font-bold text-slate-800">{item.name}</span>
                                                                                    {onlyHere && (
                                                                                        <span className="mt-1 block w-fit whitespace-nowrap text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">Added in this option</span>
                                                                                    )}
                                                                                </div>
                                                                                <span className="flex items-center gap-2 shrink-0">
                                                                                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                                                                                        {item.qty} {item.unit}
                                                                                    </span>
                                                                                    {showPricing && (
                                                                                        <span className="text-[11px] font-bold text-slate-700 tabular-nums">
                                                                                            {formatCurrency(calculateSellPrice(item.materials, item.labor, item.margin) * item.qty)}
                                                                                        </span>
                                                                                    )}
                                                                                </span>
                                                                            </div>
                                                                            {remark && (
                                                                                <p className="text-[10px] text-slate-500 mt-1 italic">{remark}</p>
                                                                            )}
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
