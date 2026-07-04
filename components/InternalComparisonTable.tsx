
import React, { useMemo, useState } from 'react';
import { ProposalTier, Item } from '../types';
import { formatCurrency, calculateSellPrice } from '../lib/utils';

interface InternalComparisonTableProps {
    tiers: ProposalTier[];
    bank: Item[];
}

const InternalComparisonTable: React.FC<InternalComparisonTableProps> = ({ tiers, bank }) => {
    const [showDiffOnly, setShowDiffOnly] = useState(false);

    // 1. Prepare Data Structure
    const comparisonData = useMemo(() => {
        const bankMap = new Map<string, Item>(bank.map(i => [i.id, i]));
        
        // Use a Set to track unique (Room + BankId) combinations across all tiers
        const allRowKeys = new Set<string>();
        
        // Helper to generate a unique key for the row: "RoomName:::BankID"
        const getRowKey = (roomId: string | undefined, bankId: string) => {
            const r = roomId || 'General';
            return `${r}:::${bankId}`;
        };

        // Collect all unique rows present in any tier
        tiers.forEach(tier => {
            tier.boq.forEach(boqItem => {
                allRowKeys.add(getRowKey(boqItem.roomId, boqItem.bankId));
            });
        });

        // Build Rows
        const rows: any[] = [];
        allRowKeys.forEach(key => {
            const [roomId, bankId] = key.split(':::');
            const bankItem = bankMap.get(bankId);
            if (!bankItem) return;

            const row: any = {
                id: key,
                name: bankItem.name,
                category: bankItem.cat,
                unit: bankItem.unit,
                roomId: roomId,
                hasDiff: false,
                tiers: {}
            };

            const quantities: number[] = [];

            tiers.forEach(tier => {
                // Find matching items in this tier for this specific room
                // FIXED: Normalize both sides to ensure 'General' matches 'General' or undefined
                const matchingItems = tier.boq.filter(b => {
                    const itemRoom = b.roomId || 'General';
                    return b.bankId === bankId && itemRoom === roomId;
                });
                
                if (matchingItems.length > 0) {
                    const totalQty = matchingItems.reduce((sum, i) => sum + i.qty, 0);
                    
                    // Use the first item's margin/price logic for display
                    const firstItem = matchingItems[0];
                    const margin = firstItem.marginOverride ?? bankItem.margin;
                    const sell = calculateSellPrice(bankItem.materials, bankItem.labor, margin);
                    
                    row.tiers[tier.id] = {
                        qty: totalQty,
                        margin: margin,
                        sell: sell,
                        exists: true
                    };
                    quantities.push(totalQty);
                } else {
                    row.tiers[tier.id] = { exists: false };
                    quantities.push(0); // Treat missing as 0 for diff checking
                }
            });

            // Check for quantity differences across tiers
            const firstQty = quantities[0];
            if (!quantities.every(q => q === firstQty)) {
                row.hasDiff = true;
            }

            rows.push(row);
        });

        // Group by Room Name
        const grouped: Record<string, any[]> = {};
        rows.forEach(row => {
            if (showDiffOnly && !row.hasDiff) return;
            
            const groupKey = row.roomId;
            if (!grouped[groupKey]) grouped[groupKey] = [];
            grouped[groupKey].push(row);
        });
        
        // Sort items within each room group: Category A-Z -> Name A-Z
        Object.keys(grouped || {}).forEach(key => {
            grouped[key].sort((a, b) => {
                if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '');
                return (a.name || '').localeCompare(b.name || '');
            });
        });

        return grouped;
    }, [tiers, bank, showDiffOnly]);

    // 2. Sort Rooms based on Project Context order
    const sortedRoomEntries = useMemo(() => {
        const roomOrder = tiers[0]?.projectContext?.rooms?.map(r => r.name) || [];
        
        return Object.entries(comparisonData || {}).sort(([roomA], [roomB]) => {
            const indexA = roomOrder.indexOf(roomA);
            const indexB = roomOrder.indexOf(roomB);

            // If both rooms are in the project context list, sort by their defined order
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            
            // If one is in the list, prioritize it
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;

            // Push 'General' or 'Unassigned' to the bottom
            const isGeneralA = roomA === 'General' || roomA === 'Unassigned';
            const isGeneralB = roomB === 'General' || roomB === 'Unassigned';
            if (isGeneralA && !isGeneralB) return 1;
            if (!isGeneralA && isGeneralB) return -1;

            // Fallback to alphabetical for anything else
            return roomA.localeCompare(roomB);
        });
    }, [comparisonData, tiers]);

    if (tiers.length === 0) return null;

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex justify-between items-center mb-4 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2">Scope Matrix (Room View)</div>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={showDiffOnly} 
                        onChange={e => setShowDiffOnly(e.target.checked)} 
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-bold text-slate-700">Show Differences Only</span>
                </label>
            </div>

            {/* Table Container */}
            <div className="overflow-x-auto border border-slate-300 rounded-lg shadow-sm">
                <table className="w-full text-xs border-collapse bg-white table-fixed min-w-[1000px]">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase">
                        <tr>
                            <th className="p-3 border-b border-r border-slate-300 w-[250px] text-left sticky left-0 bg-slate-100 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Item Description</th>
                            <th className="p-3 border-b border-r border-slate-300 w-[120px] text-left">Category</th>
                            <th className="p-3 border-b border-r border-slate-300 w-16 text-center">Unit</th>
                            {tiers.map(tier => (
                                <th key={tier.id} className="p-3 border-b border-r border-slate-300 text-center min-w-[140px]">
                                    <div className="text-indigo-900">{tier.name}</div>
                                    <div className="text-[9px] text-slate-500 font-normal mt-1">{tier.boq?.length || 0} items</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="text-slate-700">
                        {sortedRoomEntries.map(([roomName, items]) => (
                            <React.Fragment key={roomName}>
                                {/* Room Header Row */}
                                <tr className="bg-slate-200/60 font-bold text-indigo-900">
                                    <td colSpan={3 + tiers.length} className="p-2 pl-4 border-b border-slate-300 sticky left-0 bg-slate-200/60 z-10 uppercase tracking-wider text-[11px]">
                                        {roomName}
                                    </td>
                                </tr>
                                {/* Items Rows */}
                                {items.map((row: any) => (
                                    <tr key={row.id} className={`hover:bg-indigo-50/30 transition-colors ${row.hasDiff ? 'bg-amber-50/40' : ''}`}>
                                        <td className="p-2 pl-4 border-b border-r border-slate-200 font-medium truncate sticky left-0 bg-white group-hover:bg-indigo-50/30 z-10">
                                            {row.name}
                                            {row.hasDiff && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" title="Quantity varies across packages"></span>}
                                        </td>
                                        <td className="p-2 border-b border-r border-slate-200 text-slate-500 truncate">
                                            {row.category}
                                        </td>
                                        <td className="p-2 border-b border-r border-slate-200 text-center text-slate-500 font-mono">
                                            {row.unit}
                                        </td>
                                        {tiers.map(tier => {
                                            const data = row.tiers[tier.id];
                                            return (
                                                <td key={tier.id} className={`p-2 border-b border-r border-slate-200 text-center ${!data.exists ? 'bg-slate-50 text-slate-300' : ''}`}>
                                                    {data.exists ? (
                                                        <div className="flex flex-col items-center">
                                                            <span className="font-bold text-indigo-900">{data.qty.toFixed(1)}</span>
                                                            <div className="flex gap-1.5 mt-0.5 opacity-60">
                                                                <span className="text-[9px] font-mono text-slate-500">{formatCurrency(data.sell)}</span>
                                                                <span className={`text-[9px] font-bold ${data.margin < 15 ? 'text-red-500' : 'text-emerald-600'}`}>{data.margin}%</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xl font-light">-</span>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                        {Object.keys(comparisonData || {}).length === 0 && (
                            <tr>
                                <td colSpan={3 + tiers.length} className="p-8 text-center text-slate-400 italic">
                                    No items match the current filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default InternalComparisonTable;
