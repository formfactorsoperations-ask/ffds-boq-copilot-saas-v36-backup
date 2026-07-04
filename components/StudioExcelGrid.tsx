
import React, { useState, useEffect } from 'react';
import { FullBoqItem, Room, BoqItem } from '../types';
import { calculateSellPrice, formatCurrency } from '../lib/utils';
import { DeleteIcon, LinkIcon, PlusIcon, ChevronDownIcon } from './Icons';
import { motion, AnimatePresence } from 'framer-motion';

interface StudioExcelGridProps {
    items: FullBoqItem[];
    rooms: Room[];
    onUpdate: (itemId: string, fieldOrUpdates: keyof BoqItem | Partial<BoqItem>, value?: any) => void;
    onBulkUpdate?: (updates: {itemId: string, updates: Partial<BoqItem>}[]) => void;
    onDelete: (itemId: string) => void;
    onViewInBank: (bankId: string) => void;
    onAddItem: (roomName: string) => void;
    isOwner?: boolean;
    boqFrozen?: boolean;
    highlightedItemIds?: string[];
    lensEnabled?: boolean;
    marginAnalytics?: any;
    searchQuery?: string;
}

const FastInput: React.FC<{
    value: string | number;
    onChange: (val: string | number) => void;
    type?: 'text' | 'number';
    className?: string;
    placeholder?: string;
}> = ({ value, onChange, type = 'text', className = "", placeholder }) => {
    return (
        <input 
            type={type}
            value={value !== undefined ? value : ''}
            onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
            placeholder={placeholder}
            className={`bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white outline-none transition-all w-full px-1 py-0.5 text-sm ${className}`}
        />
    );
};

const STATUS_OPTIONS = [
    { value: 'included_ffds_scope', label: 'Included' },
    { value: 'approved_variation', label: 'Approved Variation' },
    { value: 'as_actuals', label: 'As Actuals' },
    { value: 'provisional_sum', label: 'Provisional Sum' },
    { value: 'pending_finalisation', label: 'Pending Finalisation' },
    { value: 'client_procured', label: 'Client Procured' },
    { value: 'excluded', label: 'Excluded from FFDS Scope' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'deleted', label: 'Deleted' },
    { value: 'substituted', label: 'Substituted' },
];

const StudioExcelGrid: React.FC<StudioExcelGridProps> = ({ items, rooms, onUpdate, onBulkUpdate, onDelete, onViewInBank, onAddItem, isOwner, boqFrozen, highlightedItemIds = [], lensEnabled, marginAnalytics, searchQuery }) => {
    const [coModal, setCoModal] = useState<{itemId: string, newStatus: string} | null>(null);
    const [bulkCoModal, setBulkCoModal] = useState<{itemIds: string[], newStatus: string} | null>(null);
    const [coRef, setCoRef] = useState("");
    const [coReason, setCoReason] = useState("");
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [undoStack, setUndoStack] = useState<{itemIds: string[], prevStates: Partial<BoqItem>[]}[]>([]);

    const [linkageModal, setLinkageModal] = useState<string | null>(null);
    const [statusModalId, setStatusModalId] = useState<string | null>(null);
    const [linkageType, setLinkageType] = useState<'drawing' | 'selection_sheet' | 'site_instruction' | 'change_order' | 'direct_execution'>('direct_execution');
    const [linkageRef, setLinkageRef] = useState("");
    const [linkageLabel, setLinkageLabel] = useState("");

    const openLinkageModal = (item: FullBoqItem) => {
        setLinkageModal(item.id);
        const current = item.linkage || { type: 'direct_execution', refId: '', label: '' };
        setLinkageType(current.type as any);
        setLinkageRef(current.refId || "");
        setLinkageLabel(current.label || "");
    };

    const saveLinkage = () => {
        if (!linkageModal) return;
        const updates: Partial<BoqItem> = {
            linkage: {
                type: linkageType,
                refId: linkageRef,
                label: linkageLabel
            }
        };
        onUpdate(linkageModal, updates);
        setLinkageModal(null);
    };

    const handleStatusSelect = (itemId: string, newStatus: string) => {
        const needsCo = boqFrozen || ['deleted', 'substituted', 'approved_variation'].includes(newStatus);
        
        if (needsCo) {
            setCoModal({ itemId, newStatus });
        } else {
            onUpdate(itemId, 'boqStatus', newStatus);
        }
    };

    const confirmStatusChange = () => {
        if (!coModal) return;
        if (!coRef.trim()) return alert('Change Order Reference is required.');
        if (!coReason.trim()) return alert('Reason is required.');
        
        const item = items.find(i => i.id === coModal.itemId);
        if (!item) return;

        const currentHistory = Array.isArray(item.statusHistory) ? item.statusHistory : [];
        const newHistoryEntry: any = {
            changedAt: new Date().toISOString(),
            from: item.boqStatus || 'included_ffds_scope',
            to: coModal.newStatus,
            changedBy: isOwner ? 'Owner' : 'Designer',
            changeOrderRef: coRef,
            reason: coReason
        };

        const updates: Partial<BoqItem> = {
            boqStatus: coModal.newStatus as any,
            statusHistory: [...currentHistory, newHistoryEntry]
        };

        onUpdate(coModal.itemId, updates);
        setCoModal(null);
        setCoRef("");
        setCoReason("");
    };

    const confirmBulkStatusChange = () => {
        if (!bulkCoModal || !onBulkUpdate) return;
        
        const needsCo = boqFrozen || ['deleted', 'substituted', 'approved_variation'].includes(bulkCoModal.newStatus);
        
        if (needsCo) {
            if (!coRef.trim()) return alert('Change Order Reference is required.');
            if (!coReason.trim()) return alert('Reason is required.');
        }

        const updates: {itemId: string, updates: Partial<BoqItem>}[] = [];
        const prevStates: Partial<BoqItem>[] = [];

        bulkCoModal.itemIds.forEach(id => {
            const item = items.find(i => i.id === id);
            if (!item) return;

            const currentHistory = Array.isArray(item.statusHistory) ? item.statusHistory : [];
            let newHistoryEntry: any = null;
            
            if (needsCo) {
                newHistoryEntry = {
                    changedAt: new Date().toISOString(),
                    from: item.boqStatus || 'included_ffds_scope',
                    to: bulkCoModal.newStatus,
                    changedBy: isOwner ? 'Owner' : 'Designer',
                    changeOrderRef: coRef,
                    reason: coReason
                };
            }

            prevStates.push({ boqStatus: item.boqStatus, statusHistory: item.statusHistory });
            
            updates.push({
                itemId: id,
                updates: {
                    boqStatus: bulkCoModal.newStatus as any,
                    ...(newHistoryEntry ? { statusHistory: [...currentHistory, newHistoryEntry] } : {})
                }
            });
        });

        setUndoStack(prev => [...prev, { itemIds: bulkCoModal.itemIds, prevStates }]);
        onBulkUpdate(updates);
        
        setBulkCoModal(null);
        setCoRef("");
        setCoReason("");
        setSelectedIds(new Set()); // Clear selection after successful bulk action
    };

    // Filter items based on search query
    const filteredItems = items.filter(item => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (item.name?.toLowerCase().includes(q)) || 
               (item.description?.toLowerCase().includes(q)) || 
               (item.cat?.toLowerCase().includes(q)) ||
               (item.roomId?.toLowerCase().includes(q));
    });

    // Group items by room
    const grouped: { [key: string]: FullBoqItem[] } = {};
    const unassigned: FullBoqItem[] = [];
    const validRoomNames = new Set(rooms.map(r => r.name));

    filteredItems.forEach(item => {
        const roomName = item.roomId;
        if (roomName && validRoomNames.has(roomName)) {
            if (!grouped[roomName]) grouped[roomName] = [];
            grouped[roomName].push(item);
        } else {
            unassigned.push(item);
        }
    });

    // Determine room order (based on project context order)
    const roomOrder = rooms.map(r => r.name);

    const handleUndo = () => {
        if (undoStack.length === 0 || !onBulkUpdate) return;
        const lastAction = undoStack[undoStack.length - 1];
        
        const updates = lastAction.itemIds.map((id, index) => ({
            itemId: id,
            updates: lastAction.prevStates[index]
        }));
        
        onBulkUpdate(updates);
        setUndoStack(prev => prev.slice(0, prev.length - 1));
    };

    useEffect(() => {
        const handleGridKeyDown = (e: KeyboardEvent) => {
            // Ignore if focus is in an input field and it's not our keyboard layer input
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
                return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.preventDefault();
                toggleSelectAll();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
            } else if (e.key === '?') {
                // Show shortcuts maybe
            }
        };
        window.addEventListener('keydown', handleGridKeyDown);
        return () => window.removeEventListener('keydown', handleGridKeyDown);
    }, [filteredItems, selectedIds, undoStack, onBulkUpdate]);

    const handleCalcChange = (item: FullBoqItem, field: 'l' | 'w' | 'm', val: number) => {
        const l = field === 'l' ? val : item.calcLength || 0;
        const w = field === 'w' ? val : item.calcWidth || 0;
        const m = field === 'm' ? val : item.calcMultiplier || 1;
        
        // Auto-calculate Qty if L & W are present (assuming Area calc)
        const newQty = parseFloat((l * w * m).toFixed(2));
        
        const updates: Partial<BoqItem> = {
            calcLength: l,
            calcWidth: w,
            calcMultiplier: m,
        };

        if (newQty > 0) {
            updates.qty = newQty;
        }

        onUpdate(item.id, updates);
    };
    
    const getStatusUI = (item: FullBoqItem) => {
        const status = item.boqStatus || 'included_ffds_scope';
        
        let colorClass = "";
        let displayLabel = "Included";
        
        switch (status) {
            case 'included_ffds_scope':
                colorClass = "bg-[#dcfce7] text-[#15803d]";
                displayLabel = "Included";
                break;
            case 'approved_variation':
                colorClass = "border border-[#15803d] text-[#15803d] bg-white";
                displayLabel = "Approved Variation";
                break;
            case 'as_actuals':
                colorClass = "bg-[#fef9c3] text-[#854d0e]";
                displayLabel = "As Actuals EST";
                break;
            case 'provisional_sum':
                colorClass = "bg-[#fef9c3] text-[#854d0e]";
                displayLabel = "Prov. Sum EST";
                break;
            case 'pending_finalisation':
                colorClass = "bg-[#fef9c3] text-[#854d0e]";
                displayLabel = "Pending Finalisation EST •";
                break;
            case 'client_procured':
                colorClass = "bg-[#f1f5f9] text-[#64748b]";
                displayLabel = "Client Procured";
                break;
            case 'excluded':
                colorClass = "bg-[#f1f5f9] text-[#64748b]";
                displayLabel = "Excluded (FFDS)";
                break;
            case 'on_hold':
                colorClass = "bg-[#f1f5f9] text-[#64748b]";
                displayLabel = "On Hold";
                break;
            case 'deleted':
                colorClass = "bg-rose-50 text-rose-700";
                displayLabel = "Deleted";
                break;
            case 'substituted':
                colorClass = "bg-rose-50 text-rose-700";
                displayLabel = "Substituted";
                break;
        }

        return (
            <div 
                className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold whitespace-nowrap cursor-pointer flex items-center justify-between transition-colors hover:shadow-sm ${colorClass}`} 
                title={boqFrozen ? "BOQ is frozen — changes require a Change Order" : "Click to change status"}
                onClick={() => setStatusModalId(item.id)}
            >
                <span>{displayLabel}</span>
                <ChevronDownIcon className="w-3 h-3 ml-1 opacity-50" />
            </div>
        );
    };

    const getLinkageUI = (item: FullBoqItem) => {
        const linkage = item.linkage;
        if (!linkage || linkage.type === 'direct_execution') {
            return (
                <div 
                    title="No formal link (direct execution)"
                    className="text-[10px] text-slate-400 border-b border-dashed border-slate-300 w-max cursor-help"
                >
                    Unlinked &mdash; Direct
                </div>
            );
        }
        
        return (
            <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-indigo-700 uppercase">{linkage.type.replace('_', ' ')}</span>
                <span className="text-[10px] text-slate-500">{linkage.label || linkage.refId}</span>
            </div>
        );
    };

    const toggleSelection = (itemId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredItems.map(i => i.id)));
        }
    };

    const renderRow = (item: FullBoqItem) => {
        const sellPrice = calculateSellPrice(item.materials, item.labor, item.margin);
        const total = sellPrice * item.qty;
        
        const isDeletedOrSub = item.boqStatus === 'deleted' || item.boqStatus === 'substituted';
        const opacityClass = isDeletedOrSub ? 'opacity-50' : '';
        const strikeClass = isDeletedOrSub ? 'line-through text-slate-400' : '';
        const isHighlighted = highlightedItemIds?.includes(item.id);
        const isSelected = selectedIds.has(item.id);
        
        let lensTint = '';
        let rowMargin = item.margin || 0;
        if (lensEnabled && isOwner && !isDeletedOrSub) {
             const mPct = rowMargin;
             if (mPct < 15) lensTint = 'bg-red-50 hover:bg-red-100 shadow-[inset_4px_0_0_#ef4444]';
             else if (mPct < 18) lensTint = 'bg-amber-50 hover:bg-amber-100 shadow-[inset_4px_0_0_#f59e0b]';
        }
        
        const highlightClass = isSelected ? 'bg-indigo-50/70 hover:bg-indigo-50 shadow-[inset_4px_0_0_#6366f1]' : isHighlighted ? 'bg-amber-100/50 hover:bg-amber-100/70 shadow-[inset_4px_0_0_#f59e0b]' : lensTint;

        return (
            <React.Fragment key={item.id}>
                <tr id={`item-${item.id}`} tabIndex={0} onClick={(e) => {
                    const tag = (e.target as HTMLElement).tagName;
                    if (tag === 'TD' || tag === 'TR' || tag === 'DIV') {
                        toggleSelection(item.id);
                    }
                }} onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        toggleSelection(item.id);
                    }
                }} className={`group border-b border-slate-100 last:border-0 transition-colors focus:bg-indigo-50/30 outline-none ${opacityClass} ${highlightClass || 'bg-white hover:bg-slate-50'}`}>
                    {/* Actions */}
                    <td className="p-2 w-10 text-center align-top pt-3 print:hidden">
                        <div className="flex flex-col items-center gap-2">
                            <input 
                                type="checkbox" 
                                checked={isSelected} 
                                onChange={(e) => toggleSelection(item.id)}
                                className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                            />
                            <button onClick={() => setExpandedRows(prev => ({...prev, [item.id]: !prev[item.id]}))} className="text-slate-400 hover:text-indigo-600 transition-colors">
                                <svg className={`w-3.5 h-3.5 transition-transform ${expandedRows[item.id] ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    </td>
                    
                    {/* Item Details */}
                    <td className="p-2 min-w-[200px] align-top">
                        <div className={`font-bold text-slate-700 text-sm whitespace-normal leading-tight mb-1 ${strikeClass}`}>{item.name}</div>
                        <div className="text-[10px] text-slate-400 whitespace-normal leading-relaxed">{item.specs}</div>
                    </td>
                    
                    {/* Status */}
                    <td className="p-2 w-[140px] text-xs align-top pt-3">
                        {getStatusUI(item)}
                        {item.boqStatus === 'substituted' && Array.isArray(item.statusHistory) && (
                            <div className="text-[9px] text-slate-400 mt-1">
                                &rarr; See successors
                            </div>
                        )}
                    </td>

                    {/* Drawing Ref/Linkage */}
                    <td className="p-2 w-[120px] text-xs align-top pt-3 hidden lg:table-cell cursor-pointer" onClick={() => openLinkageModal(item)}>
                        {getLinkageUI(item)}
                    </td>

                    {/* Dimensions (L x W x M) */}
                    <td className="p-2 w-[50px] align-top pt-3 hidden print:table-cell text-[10px] text-slate-500 text-center">
                        {(item.calcLength || 1) * (item.calcWidth || 1) * (item.calcMultiplier || 1) > 1 ? 
                        `${item.calcLength || 1} x ${item.calcWidth || 1} x ${item.calcMultiplier || 1}` : '-'}
                    </td>
                    <td className="p-2 w-[50px] align-top pt-2 print:hidden">
                        <FastInput 
                            type="number" 
                            value={item.calcLength || ''} 
                            onChange={(v) => handleCalcChange(item, 'l', Number(v))}
                            placeholder="L"
                            className="text-center font-medium text-slate-500 bg-slate-50/50 rounded focus:bg-white text-xs"
                        />
                    </td>
                    <td className="p-2 w-[50px] align-top pt-2 print:hidden">
                        <FastInput 
                            type="number" 
                            value={item.calcWidth || ''} 
                            onChange={(v) => handleCalcChange(item, 'w', Number(v))}
                            placeholder="W"
                            className="text-center font-medium text-slate-500 bg-slate-50/50 rounded focus:bg-white text-xs"
                        />
                    </td>
                    <td className="p-2 w-[50px] align-top pt-2 print:hidden">
                        <FastInput 
                            type="number" 
                            value={item.calcMultiplier || ''} 
                            onChange={(v) => handleCalcChange(item, 'm', Number(v))}
                            placeholder="M"
                            className="text-center font-medium text-slate-500 bg-slate-50/50 rounded focus:bg-white text-xs text-indigo-500"
                        />
                    </td>

                    {/* Qty & Unit */}
                    <td className="p-2 w-[90px] align-top pt-2">
                        <div className="flex items-center">
                            <FastInput 
                                type="number" 
                                value={item.qty} 
                                onChange={(v) => onUpdate(item.id, 'qty', v)} 
                                className="text-center font-bold text-indigo-900 bg-slate-100 rounded w-16"
                            />
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap ml-1">{item.unit}</span>
                        </div>
                    </td>

                    {/* Rate & Margin (Owner Only) */}
                    {isOwner ? (
                        <>
                            <td className="p-2 w-[80px] text-right align-top pt-2 hidden sm:table-cell">
                                <FastInput 
                                    type="number" 
                                    value={item.baseRate || item.materials} 
                                    onChange={(v) => onUpdate(item.id, 'baseRate', v)} 
                                    className="text-right font-medium text-slate-600"
                                />
                            </td>
                            <td className="p-2 w-[70px] text-right align-top pt-2 hidden sm:table-cell">
                                <div className="flex items-center justify-end gap-0.5">
                                    <FastInput 
                                        type="number" 
                                        value={item.margin} 
                                        onChange={(v) => onUpdate(item.id, 'marginOverride', v)} 
                                        className={`text-right font-bold ${item.margin < 15 ? 'text-red-500' : 'text-emerald-600'}`}
                                    />
                                    <span className="text-xs text-slate-400">%</span>
                                </div>
                            </td>
                            <td className="p-2 w-[100px] text-right font-mono text-xs text-slate-600 align-top pt-3 hidden sm:table-cell">
                                {formatCurrency(sellPrice)}
                            </td>
                        </>
                    ) : (
                        <td colSpan={3} className="p-2 text-center text-[10px] text-slate-300 italic hidden sm:table-cell align-middle">
                            Financials restricted
                        </td>
                    )}

                    {/* Total */}
                    <td className="p-2 w-[120px] text-right font-bold text-indigo-900 font-mono align-top pt-3">
                        <span className={strikeClass}>{formatCurrency(total)}</span>
                        {item.boqStatus === 'deleted' && <div className="text-[9px] text-rose-500 mt-1">₹0 Billed</div>}
                    </td>
                    
                    {/* Bank Link */}
                    <td className="p-2 w-10 text-center align-top pt-3 print:hidden">
                        <button onClick={() => onViewInBank(item.bankId)} className="text-indigo-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Edit Master in Bank">
                            <LinkIcon className="w-3.5 h-3.5" />
                        </button>
                    </td>
                </tr>
                {expandedRows[item.id] && (
                    <tr className="bg-slate-50/50">
                        <td colSpan={14} className="p-4 border-b border-slate-100">
                            <div className="pl-12 pr-4">
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Status History</h4>
                                {Array.isArray(item.statusHistory) && item.statusHistory.length > 0 ? (
                                    <ul className="space-y-2">
                                        {item.statusHistory.map((sh, idx) => (
                                            <li key={idx} className="text-xs text-slate-600 flex items-center gap-2">
                                                <span className="text-slate-400 w-[120px]">{new Date(sh.changedAt || (sh as any).date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short'})}</span>
                                                <span className="font-medium text-slate-500">{sh.from}</span>
                                                <span>&rarr;</span>
                                                <span className="font-bold text-slate-700">{sh.to}</span>
                                                <span className="text-slate-400">&middot;</span>
                                                <span>by {sh.changedBy || (sh as any).by}</span>
                                                {(sh.changeOrderRef || (sh as any).coRef) && (
                                                    <>
                                                        <span className="text-slate-400">&middot;</span>
                                                        <span className="font-mono bg-white border border-slate-200 px-1 py-0.5 rounded text-[10px]">{sh.changeOrderRef || (sh as any).coRef}</span>
                                                    </>
                                                )}
                                                {sh.reason && (
                                                    <>
                                                        <span className="text-slate-400">&middot;</span>
                                                        <span className="italic">{sh.reason}</span>
                                                    </>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="text-xs text-slate-400 italic">No history available for this item.</div>
                                )}
                            </div>
                        </td>
                    </tr>
                )}
            </React.Fragment>
        );
    };

    return (
        <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm bg-white pb-24 relative">
            {lensEnabled && isOwner && marginAnalytics && (
                <div className="sticky top-0 left-0 right-0 bg-indigo-950 text-slate-100 z-50 p-3 flex flex-wrap items-center justify-between shadow-md">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">◐</span>
                            <div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Blended Margin</div>
                                <div className={`text-lg font-bold font-mono ${marginAnalytics.blendedMarginPct < 15 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {marginAnalytics.blendedMarginPct?.toFixed(1) || 0}%
                                </div>
                            </div>
                        </div>
                        <div className="hidden sm:block">
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Estimate Risk</div>
                            <div className="text-sm font-bold font-mono text-amber-400">
                                {formatCurrency((marginAnalytics.estimateRisk?.asActualsValue || 0) + (marginAnalytics.estimateRisk?.provisionalValue || 0))}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Floor Violations</div>
                            <div className="text-sm font-bold">
                                {marginAnalytics.floorViolations?.length === 0 ? (
                                    <span className="text-emerald-400">0 Items</span>
                                ) : (
                                    <button className="text-red-400 underline decoration-red-400/30 hover:decoration-red-400">
                                        {marginAnalytics.floorViolations?.length} Items
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    {/* Sparkline minimal rendering */}
                    {marginAnalytics.versionTrend && marginAnalytics.versionTrend.length > 0 && (
                        <div className="hidden md:flex flex-col items-end group relative cursor-help">
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Erosion Trend</div>
                            <div className="flex items-end gap-[2px] h-6 bg-indigo-900 p-1 rounded">
                                {marginAnalytics.versionTrend.slice(-10).map((t: any, i: number) => {
                                    const h = Math.max(10, Math.min(100, (t.blendedMarginPct / 30) * 100)); // normalize relative to 30%
                                    const color = t.blendedMarginPct < 15 ? 'bg-red-500' : t.blendedMarginPct < 18 ? 'bg-amber-500' : 'bg-emerald-500';
                                    return <div key={i} className={`w-3 rounded-t-sm ${color}`} style={{ height: `${h}%` }}></div>
                                })}
                            </div>
                            <div className="absolute top-full right-0 mt-2 w-64 bg-indigo-900 text-slate-200 text-xs p-2 rounded shadow-xl hidden group-hover:block z-50">
                                {marginAnalytics.versionTrend.map((t: any) => (
                                    <div key={t.versionNumber} className="flex justify-between border-b border-slate-700 last:border-0 py-1">
                                        <span>v{t.versionNumber}</span>
                                        <span className="font-mono">{t.blendedMarginPct.toFixed(1)}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
            <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                        <th className="p-3 text-center w-10 print:hidden relative">
                             <input 
                                 type="checkbox" 
                                 checked={filteredItems.length > 0 && selectedIds.size === filteredItems.length}
                                 ref={input => { if (input) input.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredItems.length; }}
                                 onChange={toggleSelectAll}
                                 className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                             />
                        </th>
                        <th className="p-3">Item Description</th>
                        <th className="p-3 w-[140px]">Status</th>
                        <th className="p-3 w-[120px] hidden lg:table-cell">Drawing Ref</th>
                        
                        <th className="p-3 w-[50px] text-center text-indigo-400 hidden print:table-cell">Area</th>
                        <th className="p-3 w-[50px] text-center text-indigo-400 print:hidden">L</th>
                        <th className="p-3 w-[50px] text-center text-indigo-400 print:hidden">W</th>
                        <th className="p-3 w-[50px] text-center text-indigo-400 print:hidden">M</th>
                        
                        <th className="p-3 w-[90px] text-center">Qty</th>
                        
                        {isOwner ? (
                            <>
                                <th className="p-3 text-right w-[80px] hidden sm:table-cell">Base Rate</th>
                                <th className="p-3 text-right w-[70px] hidden sm:table-cell">Margin</th>
                                <th className="p-3 text-right w-[100px] hidden sm:table-cell">Rate</th>
                            </>
                        ) : (
                            <th colSpan={3} className="p-3 text-center text-slate-400 hidden sm:table-cell">Financials</th>
                        )}
                        <th className="p-3 text-right w-[120px]">Total</th>
                        <th className="p-3 w-10 print:hidden"></th>
                    </tr>
                </thead>
                <tbody className="bg-white">
                    {roomOrder.map(roomName => {
                        const roomItems = grouped[roomName] || [];
                        const roomTotal = roomItems.reduce((sum, i) => sum + (calculateSellPrice(i.materials, i.labor, i.margin) * i.qty), 0);

                        return (
                            <React.Fragment key={roomName}>
                                <tr className="bg-slate-100 border-y border-slate-200">
                                    <td colSpan={14} className="px-4 py-2">
                                        <div className="flex justify-between items-center pr-2">
                                            <span className="font-bold text-indigo-900 text-xs uppercase tracking-wide flex items-center gap-2">
                                                🏠 {roomName}
                                                <span className="bg-white px-2 py-0.5 rounded text-[9px] text-slate-400 border border-slate-200 font-medium">{roomItems.length} items</span>
                                                {lensEnabled && isOwner && marginAnalytics?.byRoom && (() => {
                                                    const rData = marginAnalytics.byRoom.find((r: any) => r.roomId === roomName);
                                                    if (!rData) return null;
                                                    return (
                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${rData.marginPct < 15 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                                                            {rData.marginPct.toFixed(1)}% M
                                                        </span>
                                                    );
                                                })()}
                                            </span>
                                            <div className="flex items-center gap-4">
                                                <button 
                                                    onClick={() => onAddItem(roomName)}
                                                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-white border border-indigo-100 px-3 py-1.5 rounded hover:bg-indigo-50 transition-colors shadow-sm whitespace-nowrap print:hidden"
                                                >
                                                    <PlusIcon className="w-3 h-3" /> Add Item
                                                </button>
                                                {isOwner && (
                                                    <span className="font-mono text-xs font-bold text-slate-600 whitespace-nowrap">
                                                        Room Total: {formatCurrency(roomTotal)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                {roomItems.length > 0 ? roomItems.map(renderRow) : (
                                    <tr>
                                        <td colSpan={14} className="p-4 text-center text-slate-400 text-xs italic border-b border-slate-100">
                                            No items in {roomName} yet.
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}

                    {unassigned.length > 0 && (
                        <>
                            <tr className="bg-slate-100 border-y border-slate-200">
                                <td colSpan={14} className="px-4 py-2">
                                    <div className="flex justify-between items-center pr-2">
                                        <span className="font-bold text-slate-600 text-xs uppercase tracking-wide">📦 Unassigned Items</span>
                                        <button 
                                            onClick={() => onAddItem("Unassigned")}
                                            className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-white border border-indigo-100 px-3 py-1.5 rounded hover:bg-indigo-50 transition-colors shadow-sm whitespace-nowrap print:hidden"
                                        >
                                            <PlusIcon className="w-3 h-3" /> Add Item
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            {unassigned.map(renderRow)}
                        </>
                    )}
                    
                    {items.length === 0 && (
                        <tr>
                            <td colSpan={14} className="p-12 text-center text-slate-400 italic">
                                No items in this BOQ yet. Click "+ Add Item" in any room header to start.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Selection Bulk Action Bar */}
            <AnimatePresence>
                {selectedIds.size > 0 && (
                    <motion.div 
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-indigo-950 border border-slate-700 shadow-2xl rounded-2xl p-2.5 flex items-center gap-4 z-50 text-slate-200 w-[95%] max-w-5xl"
                    >
                        <div className="flex-1 flex items-center gap-4 pl-2">
                             <div className="flex flex-col">
                                 <span className="font-bold text-white text-sm">
                                     {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
                                 </span>
                                 <span className="text-[10px] text-slate-400 font-mono">
                                     {formatCurrency(
                                         (Array.from(selectedIds) as string[]).reduce((sum: number, id: string) => {
                                             const it = items.find(i => i.id === id);
                                             if (!it) return sum;
                                             return sum + (calculateSellPrice(it.materials, it.labor, it.margin) * (it.qty || 0));
                                         }, 0) as number
                                     )}
                                 </span>
                             </div>
                             
                             <div className="h-6 w-px bg-slate-700 mx-2"></div>
                             
                             <div className="flex flex-wrap gap-2">
                                 <button onClick={() => setBulkCoModal({ itemIds: Array.from(selectedIds), newStatus: 'included_ffds_scope' })} className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-bold text-slate-300 transition-colors">Set Status</button>
                                 <button onClick={() => {/* TODO */}} className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-bold text-slate-300 transition-colors">Move Room</button>
                                 <button onClick={() => setLinkageModal('bulk')} className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-bold text-slate-300 transition-colors">Set Linkage</button>
                                 {isOwner && (
                                     <>
                                        <button onClick={() => {/* TODO */}} className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-bold text-slate-300 transition-colors">Adjust Margin</button>
                                        <button onClick={() => {/* TODO */}} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${boqFrozen ? 'bg-indigo-900 text-slate-500 cursor-not-allowed' : 'bg-indigo-900 text-slate-300 hover:bg-indigo-600 hover:text-white'}`} disabled={boqFrozen} title={boqFrozen ? "Blocked: BOQ is frozen" : ""}>Refresh Rates</button>
                                     </>
                                 )}
                             </div>
                        </div>
                        {undoStack.length > 0 && (
                            <button onClick={handleUndo} className="px-3 py-2 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors bg-amber-400/10 hover:bg-amber-400/20 rounded-xl mr-2 flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                Undo
                            </button>
                        )}
                        <button onClick={() => setSelectedIds(new Set())} className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors bg-indigo-900 hover:bg-indigo-800 rounded-xl">
                            Clear
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bulk Status / Change Order Requirement Modal */}
            <AnimatePresence>
                {bulkCoModal && (
                    <div className="fixed inset-0 bg-indigo-950/40 backdrop-blur-sm shadow-2xl flex items-center justify-center p-4 z-[100]">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-xl shadow-2xl w-full max-w-[400px] overflow-hidden"
                        >
                            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                <h3 className="font-bold text-indigo-900">Bulk Apply Status</h3>
                                <button onClick={() => setBulkCoModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-slate-600 mb-6 font-medium">
                                    Change status for {bulkCoModal.itemIds.length} selected items.
                                </p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Select Status</label>
                                        <select 
                                            value={bulkCoModal.newStatus}
                                            onChange={e => setBulkCoModal({...bulkCoModal, newStatus: e.target.value})}
                                            className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                                        >
                                            {STATUS_OPTIONS.filter(o => 
                                                isOwner || 
                                                ['included_ffds_scope', 'pending_finalisation', 'on_hold'].includes(o.value)
                                            ).map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {(boqFrozen || ['deleted', 'substituted', 'approved_variation'].includes(bulkCoModal.newStatus)) && (
                                        <>
                                            <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-xs text-rose-700 font-medium my-4">
                                                {boqFrozen ? "Wait, BOQ is frozen. A formal Change Order is required for any status modification." : "A formal Change Order is required for this status transition."}
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Change Order Ref</label>
                                                <FastInput value={coRef} onChange={v => setCoRef(String(v))} placeholder="e.g. CO-005" className="w-full border p-2 rounded-lg bg-slate-50" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Reason / Notes</label>
                                                <FastInput value={coReason} onChange={v => setCoReason(String(v))} placeholder="Why is this change happening?" className="w-full border p-2 rounded-lg bg-slate-50" />
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="mt-6 flex justify-end gap-3">
                                    <button onClick={() => setBulkCoModal(null)} className="px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-100 text-sm font-bold transition-colors">Cancel</button>
                                    <button onClick={confirmBulkStatusChange} className="px-4 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 text-sm font-bold transition-colors shadow-md">Apply Bulk Change</button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Change Order Requirement Modal (Single) */}
            <AnimatePresence>
                {coModal && (
                    <div className="fixed inset-0 bg-indigo-950/20 backdrop-blur-sm shadow-2xl flex items-center justify-center p-4 z-[100]">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-xl shadow-2xl w-full max-w-[400px] overflow-hidden"
                        >
                            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                <h3 className="font-bold text-indigo-900">Change Order Required</h3>
                                <button onClick={() => setCoModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-slate-600 mb-6 font-medium">
                                    {boqFrozen 
                                        ? "The BOQ is frozen. ALL status changes require a formal Change Order reference to ensure client signoffs are preserved." 
                                        : "This status change alters the financial baseline or scope commitments."}
                                </p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">CO Reference</label>
                                        <input 
                                            type="text" 
                                            value={coRef}
                                            onChange={e => setCoRef(e.target.value)}
                                            placeholder="e.g. CO-001"
                                            className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-slate-50 focus:bg-white focus:outline-indigo-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Reason / Note</label>
                                        <textarea 
                                            value={coReason}
                                            onChange={e => setCoReason(e.target.value)}
                                            placeholder="Client requested alternative finish..."
                                            className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-slate-50 focus:bg-white focus:outline-indigo-500 outline-none resize-none h-20"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                                <button onClick={() => setCoModal(null)} className="px-4 py-2 font-bold text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
                                <button onClick={confirmStatusChange} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded shadow text-sm">Record Status Change</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Linkage Picker Modal */}
            <AnimatePresence>
                {linkageModal && (
                    <div className="fixed inset-0 bg-indigo-950/20 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-xl shadow-2xl w-full max-w-[500px] overflow-hidden"
                        >
                            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                <h3 className="font-bold text-indigo-900">Edit Traceability Linkage</h3>
                                <button onClick={() => setLinkageModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                            </div>
                            
                            <div className="p-4 bg-slate-100 flex gap-2 border-b border-slate-200">
                                {['drawing', 'selection_sheet', 'change_order', 'direct_execution'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setLinkageType(type as any)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${linkageType === type ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-200'}`}
                                    >
                                        {type.replace('_', ' ').toUpperCase()}
                                    </button>
                                ))}
                            </div>
                            
                            <div className="p-6">
                                {linkageType === 'direct_execution' ? (
                                    <div className="text-sm text-slate-500 italic text-center py-4">
                                        No formal document lineage. Direct execution mode.
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Document Reference ID</label>
                                            <input 
                                                type="text" 
                                                value={linkageRef}
                                                onChange={e => setLinkageRef(e.target.value)}
                                                placeholder={linkageType === 'drawing' ? 'e.g. DWG-ELEC-04' : linkageType === 'change_order' ? 'e.g. CO-002' : 'e.g. SS-LIVING-01'}
                                                className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-slate-50 focus:bg-white focus:outline-indigo-500 outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Friendly Label / Description</label>
                                            <input 
                                                type="text" 
                                                value={linkageLabel}
                                                onChange={e => setLinkageLabel(e.target.value)}
                                                placeholder="e.g. Living Room Ceiling Plan"
                                                className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-slate-50 focus:bg-white focus:outline-indigo-500 outline-none"
                                            />
                                        </div>
                                        {linkageType === 'drawing' && (
                                            <div className="bg-indigo-50 border border-indigo-100 rounded p-3 text-xs text-indigo-700 mt-2">
                                                <strong>Tip:</strong> If the drawing is later revised, this linkage helps identify out-of-date items.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                                <button onClick={() => setLinkageModal(null)} className="px-4 py-2 font-bold text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
                                <button onClick={saveLinkage} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded shadow text-sm">Save Linkage</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Status Modal */}
            <AnimatePresence>
                {statusModalId && (
                    <div className="fixed inset-0 bg-indigo-950/20 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-xl shadow-2xl w-full max-w-[600px] max-h-[80vh] flex flex-col overflow-hidden border border-slate-200"
                        >
                            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center z-10">
                                <div>
                                    <h3 className="font-black text-indigo-900">Update Item Status</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Select a new status for this lineup item</p>
                                </div>
                                <button onClick={() => setStatusModalId(null)} className="p-2 bg-slate-200/50 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors font-bold text-lg leading-none">
                                    ✕
                                </button>
                            </div>
                            
                            <div className="p-6 overflow-y-auto bg-slate-50/50 flex-1">
                                <div className="grid grid-cols-2 gap-3">
                                    {STATUS_OPTIONS.filter(o => 
                                        isOwner || 
                                        ['included_ffds_scope', 'pending_finalisation', 'on_hold'].includes(o.value)
                                    ).map(opt => {
                                        let colorClass = "";
                                        let icon = null;
                                        switch (opt.value) {
                                            case 'included_ffds_scope':
                                                colorClass = "bg-emerald-50 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100/50 text-emerald-800";
                                                break;
                                            case 'approved_variation':
                                                colorClass = "bg-white border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50 text-emerald-700 shadow-sm";
                                                break;
                                            case 'as_actuals':
                                            case 'provisional_sum':
                                            case 'pending_finalisation':
                                                colorClass = "bg-amber-50 border-amber-200 hover:border-amber-400 hover:bg-amber-100/50 text-amber-800";
                                                break;
                                            case 'deleted':
                                            case 'substituted':
                                                colorClass = "bg-rose-50 border-rose-200 hover:border-rose-400 hover:bg-rose-100/50 text-rose-800";
                                                break;
                                            case 'excluded':
                                            case 'client_procured':
                                                colorClass = "bg-slate-100 border-slate-300 hover:border-slate-500 hover:bg-slate-200 text-slate-700";
                                                break;
                                            default:
                                                colorClass = "bg-slate-50 border-slate-200 hover:border-slate-400 hover:bg-slate-100/50 text-slate-700";
                                        }

                                        return (
                                            <button
                                                key={opt.value}
                                                onClick={() => {
                                                    handleStatusSelect(statusModalId, opt.value);
                                                    setStatusModalId(null);
                                                }}
                                                className={`text-left p-4 rounded-xl border-2 transition-all flex flex-col gap-1 group ${colorClass}`}
                                            >
                                                <span className="font-bold text-sm tracking-tight">{opt.label}</span>
                                                <span className="text-[10px] font-medium opacity-80 uppercase tracking-widest">{opt.value.replace(/_/g, ' ')}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StudioExcelGrid;

