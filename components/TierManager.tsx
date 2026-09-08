import React, { useState, useMemo } from 'react';
import { showSuccessWithNext } from './SuccessWithNextToast';
import { BoqItem, ProjectContext, ProposalTier, FullProjectData, Item } from '../types';
import { calculateSellPrice, formatCurrency, id } from '../lib/utils';
import { CompareIcon, DeleteIcon, PencilIcon, CheckBadgeIcon, SparklesIcon, SaveIcon, CheckIcon, FileSpreadsheetIcon, ArrowRightIcon } from './Icons';

interface TierManagerProps {
    tiers: ProposalTier[];
    setTiers: React.Dispatch<React.SetStateAction<ProposalTier[]>>;
    activeTierId: string | null;
    setActiveTierId: (id: string | null) => void;
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    bank?: Item[];
    setActiveTab: (tab: string) => void;
    onImportClick?: () => void;
    projects?: FullProjectData[];
}

const TierManager: React.FC<TierManagerProps> = ({ tiers, setTiers, activeTierId, setActiveTierId, projectContext, setProjectContext, bank, setActiveTab, onImportClick, projects }) => {
    const [editingTierId, setEditingTierId] = useState<string | null>(null);
    const [editingTierName, setEditingTierName] = useState('');
    const [discountHeadroom, setDiscountHeadroom] = useState<number>(0);
    const [marginShiftAmount, setMarginShiftAmount] = useState<number>(0);

    const activeTier = tiers.find(t => t.id === activeTierId) || tiers[0];
    const parentTier = activeTier?.parentTierId ? tiers.find(t => t.id === activeTier?.parentTierId) : null;

    const displayValue = activeTier ? (activeTier.summary.totalRevenue || activeTier.summary.totalSell) : 0;

    const bankMap = useMemo(() => {
        const map = new Map<string, Item>((bank || []).map(i => [i.id, i]));
        if (projectContext?.adHocItems) {
            projectContext.adHocItems.forEach(i => map.set(i.id, i));
        }
        return map;
    }, [bank, projectContext?.adHocItems]);

    const activeTierCost = useMemo(() => {
        if (!activeTier) return 0;
        return activeTier.summary.totalCost || (displayValue * 0.78);
    }, [activeTier, displayValue]);

    const simulatedSellValue = useMemo(() => {
        if (!activeTier) return 0;
        if (marginShiftAmount === 0) return activeTier.summary.totalSell;
        
        let simulatedSell = 0;
        (activeTier.boq || []).forEach(b => {
            const bankItem = bankMap.get(b.bankId);
            const currentMargin = b.marginOverride ?? bankItem?.margin ?? 20;
            const newMargin = Math.max(0, Math.min(80, currentMargin + marginShiftAmount));
            const effectiveMaterials = b.baseRate !== undefined ? b.baseRate : (bankItem?.materials || 0);
            const effectiveLabor = b.labor !== undefined ? b.labor : (bankItem?.labor || 0);
            const sell = calculateSellPrice(effectiveMaterials, effectiveLabor, newMargin) * b.qty;
            
            if (b.boqStatus !== 'deleted' && b.boqStatus !== 'substituted' && b.boqStatus !== 'excluded' && b.boqStatus !== 'client_procured') {
                simulatedSell += sell;
            }
        });
        return simulatedSell;
    }, [activeTier, marginShiftAmount, bankMap]);

    const simulatedDesignFee = useMemo(() => {
        if (projectContext.designFeeType === "fixed_lumpsum") {
            return projectContext.designFee || 0;
        } else if (projectContext.designFeeType === "fixed_sqft") {
            return (projectContext.designFee || 0) * (projectContext.area || 0);
        } else {
            // Percentage based on simulated sell
            return simulatedSellValue * ((projectContext.designFee || 10) / 100);
        }
    }, [projectContext, simulatedSellValue]);

    const simulatedTotalRevenue = simulatedSellValue + simulatedDesignFee;

    const simulatedBlendedGm = useMemo(() => {
        if (simulatedTotalRevenue === 0) return 0;
        const simulatedProfit = (simulatedSellValue - activeTierCost) + simulatedDesignFee;
        return (simulatedProfit / simulatedTotalRevenue) * 100;
    }, [simulatedTotalRevenue, simulatedSellValue, activeTierCost, simulatedDesignFee]);

    const handleApplyMarginShift = () => {
        if (!activeTier) return;
        
        let newTotalCost = 0;
        let newTotalSell = 0;
        let activeItemCount = 0;

        // Systematic shift updates the margin override of each item
        const updatedBoq = activeTier.boq.map(b => {
            const bankItem = bankMap.get(b.bankId);
            const currentMargin = b.marginOverride ?? bankItem?.margin ?? 20;
            const newMargin = Math.max(0, Math.min(80, currentMargin + marginShiftAmount));
            const effectiveMaterials = b.baseRate !== undefined ? b.baseRate : (bankItem?.materials || 0);
            const effectiveLabor = b.labor !== undefined ? b.labor : (bankItem?.labor || 0);
            const cost = (effectiveMaterials + effectiveLabor) * b.qty;
            const sell = calculateSellPrice(effectiveMaterials, effectiveLabor, newMargin) * b.qty;

            if (b.boqStatus !== 'deleted' && b.boqStatus !== 'substituted' && b.boqStatus !== 'excluded' && b.boqStatus !== 'client_procured') {
                newTotalCost += cost;
                newTotalSell += sell;
                activeItemCount++;
            }

            return {
                ...b,
                marginOverride: Number(newMargin.toFixed(2))
            };
        });

        // Design Fee Calc
        let newDesignFee = 0;
        if (projectContext.designFeeType === "fixed_lumpsum") {
            newDesignFee = projectContext.designFee || 0;
        } else if (projectContext.designFeeType === "fixed_sqft") {
            newDesignFee = (projectContext.designFee || 0) * (projectContext.area || 0);
        } else {
            newDesignFee = newTotalSell * ((projectContext.designFee || 10) / 100);
        }

        const newTotalRevenue = newTotalSell + newDesignFee;
        const newBlendedGm = newTotalRevenue > 0 ? (((newTotalSell - newTotalCost) + newDesignFee) / newTotalRevenue) * 100 : 0;
        const newTotalGm = newTotalSell > 0 ? ((newTotalSell - newTotalCost) / newTotalSell) * 100 : 0;

        // Update the tiers list
        setTiers(prev => prev.map(t => {
            if (t.id !== activeTier.id) return t;
            return {
                ...t,
                boq: updatedBoq,
                summary: {
                    ...t.summary,
                    totalSell: newTotalSell,
                    totalCost: newTotalCost,
                    totalGm: newTotalGm,
                    itemCount: activeItemCount,
                    totalRevenue: newTotalRevenue,
                    designFee: newDesignFee,
                    blendedGm: newBlendedGm
                }
            };
        }));

        // If this tier is the approved / active baseline tier or current contract, sync projectContext financials
        const isApproved = projectContext.approvedTierId === activeTier.id || activeTier.lifecycleTag === 'Current contract';
        setProjectContext(prev => {
            const prevFinancials = prev.financials || {
                initiationFeePaid: 0,
                billablePercent: 100,
                executionGstEnabled: true,
                projectedCashValue: 0,
                taxLimitYearly: 2000000,
                goodwillDiscount: 0,
                discounts: [],
                paymentRevisions: [],
            };
            
            const updatedFinancials = {
                ...prevFinancials,
                approvedExecutionValue: isApproved || !prevFinancials.approvedExecutionValue ? newTotalSell : prevFinancials.approvedExecutionValue,
                approvedDesignValue: isApproved || !prevFinancials.approvedDesignValue ? newDesignFee : prevFinancials.approvedDesignValue,
            };

            const updatedEngagement = prev.engagement ? {
                ...prev.engagement,
                executionValue: isApproved ? newTotalSell : prev.engagement.executionValue,
                designFee: isApproved ? newDesignFee : prev.engagement.designFee,
            } : prev.engagement;

            return {
                ...prev,
                financials: updatedFinancials,
                engagement: updatedEngagement
            };
        });

        setMarginShiftAmount(0); // Reset
        showSuccessWithNext(`Successfully applied systematic margin shift to all items in ${activeTier.name}. Updated Execution Sell: ${formatCurrency(newTotalSell)}.`);
    };

    const minAcceptableRevenue = useMemo(() => {
        return activeTierCost / 0.80; // 20% floor blended GM means Cost / 0.80
    }, [activeTierCost]);

    const headroomRupees = useMemo(() => {
        return Math.max(0, displayValue - minAcceptableRevenue);
    }, [displayValue, minAcceptableRevenue]);

    const maxDiscountPct = useMemo(() => {
        return displayValue > 0 ? (headroomRupees / displayValue) * 100 : 0;
    }, [displayValue, headroomRupees]);

    const clientPays = useMemo(() => {
        return displayValue * (1 - discountHeadroom / 100);
    }, [displayValue, discountHeadroom]);

    const giveUp = useMemo(() => {
        return displayValue * (discountHeadroom / 100);
    }, [displayValue, discountHeadroom]);

    const newBlendedGm = useMemo(() => {
        if (clientPays === 0) return 0;
        const newProfit = clientPays - activeTierCost;
        return (newProfit / clientPays) * 100;
    }, [clientPays, activeTierCost]);

    const comparableProjects = useMemo(() => {
        if (!projects || projects.length <= 1) {
            return [
                { name: "Majiwada 2-BHK", value: 985600, gm: 25.6, itemsCount: 20 },
                { name: "Hiranandani One", value: 1173843, gm: 24.2, itemsCount: 29 }
            ];
        }
        
        const currentProjectName = projectContext.name || '';
        const others = projects.filter(p => p.context?.name !== currentProjectName);
        
        if (others.length === 0) {
            return [
                { name: "Majiwada 2-BHK", value: 985600, gm: 25.6, itemsCount: 20 },
                { name: "Hiranandani One", value: 1173843, gm: 24.2, itemsCount: 29 }
            ];
        }

        const currentArea = projectContext.area || 1000;
        const mapped = others.map(p => {
            const pArea = p.context?.area || 1000;
            const distance = Math.abs(pArea - currentArea);
            
            let pValue = 0;
            let pGm = 22.1;
            let pItemsCount = 0;
            
            const activeTier = p.tiers?.find(t => t.id === p.activeTierId) || p.tiers?.[0];
            if (activeTier) {
                pValue = activeTier.summary?.totalRevenue || activeTier.summary?.totalSell || 0;
                pGm = activeTier.summary?.blendedGm || 22.1;
                pItemsCount = activeTier.boq?.length || 0;
            }

            return {
                name: p.context?.name || "Other Project",
                value: pValue,
                gm: pGm,
                itemsCount: pItemsCount,
                distance
            };
        });

        mapped.sort((a, b) => a.distance - b.distance);
        
        return mapped.slice(0, 2);
    }, [projects, projectContext]);

    const handleAddTier = () => {
        const newTier: ProposalTier = {
            id: id(),
            name: `New Option ${tiers.length + 1}`,
            timestamp: Date.now(),
            boq: [],
            projectContext,
            summary: { totalSell: 0, totalCost: 0, totalGm: 0, itemCount: 0, totalRevenue: 0, designFee: 0, blendedGm: 0 },
            lifecycleTag: 'Draft'
        };
        setTiers(prev => [...prev, newTier]);
        setActiveTierId(newTier.id);
    };
    
    const handleDuplicateTier = (tierId: string) => {
        const tierToDuplicate = tiers.find(t => t.id === tierId);
        if (!tierToDuplicate) return;
        
        // Deep copy items
        const newBoq = JSON.parse(JSON.stringify(tierToDuplicate.boq || []));
        
        const newTier: ProposalTier = {
            ...JSON.parse(JSON.stringify(tierToDuplicate)),
            id: id(),
            name: `${tierToDuplicate.name} (Copy)`,
            timestamp: Date.now(),
            boq: newBoq,
            parentTierId: tierId, // Explicitly linking lineage
            lifecycleTag: 'Draft'
        };
        setTiers(prev => [...prev, newTier]);
        setActiveTierId(newTier.id);
    };

    const handleDeleteTier = (tierId: string) => {
        setTiers(prev => prev.filter(t => t.id !== tierId));
        if (projectContext.approvedTierId === tierId) {
            setProjectContext(prev => ({...prev, approvedTierId: undefined}));
        }
        if (activeTierId === tierId) {
            const remainingTiers = tiers.filter(t => t.id !== tierId);
            setActiveTierId(remainingTiers.length > 0 ? remainingTiers[0].id : null);
        }
    };
    
    const handleStartEditing = (tier: ProposalTier) => {
        setEditingTierId(tier.id);
        setEditingTierName(tier.name);
    }
    
    const handleSaveEdit = () => {
        if (!editingTierId) return;
        setTiers(prev => prev.map(t => t.id === editingTierId ? {...t, name: editingTierName } : t));
        setEditingTierId(null);
    }

    const handleEditTier = (tierId: string) => {
        const tier = tiers.find(t => t.id === tierId);
        if (tier?.lifecycleTag === 'Current contract' || projectContext.approvedTierId === tierId) {
             // Future: Implement auto-fork logic here, for now let them through with a warning (or let them view)
             // Phase 1 just opens it
        }
        setActiveTierId(tierId);
        setActiveTab('boq-editor');
    };

    const handleSyncTier = () => {
        if (!activeTier) return;
        setProjectContext(prev => {
            const prevFinancials = prev.financials || {
                initiationFeePaid: 0,
                billablePercent: 100,
                executionGstEnabled: true,
                projectedCashValue: 0,
                taxLimitYearly: 2000000,
                goodwillDiscount: 0,
                discounts: [],
                paymentRevisions: [],
            };
            return {
                ...prev,
                approvedTierId: activeTier.id,
                financials: {
                    ...prevFinancials,
                    approvedExecutionValue: activeTier.summary.totalSell || 0,
                    approvedDesignValue: activeTier.summary.designFee || 0,
                },
                engagement: prev.engagement ? {
                    ...prev.engagement,
                    executionValue: activeTier.summary.totalSell || 0,
                    designFee: activeTier.summary.designFee || 0,
                } : prev.engagement
            };
        });
        if (setActiveTierId) {
            setActiveTierId(activeTier.id);
        }
        showSuccessWithNext(`Successfully synced ${activeTier.name} to Revision Studio and Payment Schedule as approved baseline.`);
    };

    const handleApproveTier = (tierId: string) => {
        const selectedTier = tiers.find(t => t.id === tierId);
        if (!selectedTier) return;

        setProjectContext(prev => {
            const prevFinancials = prev.financials || {
                initiationFeePaid: 0,
                billablePercent: 100,
                executionGstEnabled: true,
                projectedCashValue: 0,
                taxLimitYearly: 2000000,
                goodwillDiscount: 0,
                discounts: [],
                paymentRevisions: [],
            };

            // Capture snapshot of the previous version if one was approved
            const snapshots = prevFinancials.paymentSnapshots || [];
            const updatedSnapshots = [...snapshots];
            if (prev.approvedTierId) {
                const previousTier = tiers.find(t => t.id === prev.approvedTierId);
                const previousName = previousTier?.name || "Previous Version";
                if (!updatedSnapshots.some(s => s.tierId === prev.approvedTierId)) {
                    updatedSnapshots.push({
                        tierId: prev.approvedTierId,
                        tierName: previousName,
                        timestamp: Date.now(),
                        approvedExecutionValue: prevFinancials.approvedExecutionValue ?? 0,
                        approvedDesignValue: prevFinancials.approvedDesignValue ?? 0,
                        milestones: prev.paymentMilestones || [],
                        billablePercent: prevFinancials.billablePercent,
                        executionGstEnabled: prevFinancials.executionGstEnabled,
                    });
                }
            }

            const newExecutionValue = selectedTier.summary.totalSell || 0;
            const newDesignValue = selectedTier.summary.designFee || 0;

            return {
                ...prev,
                approvedTierId: tierId,
                financials: {
                    ...prevFinancials,
                    approvedExecutionValue: newExecutionValue,
                    approvedDesignValue: newDesignValue,
                    paymentSnapshots: updatedSnapshots,
                },
                engagement: prev.engagement ? {
                    ...prev.engagement,
                    executionValue: newExecutionValue,
                    designFee: newDesignValue,
                } : prev.engagement
            };
        });

        // Also tag it
        setTiers(prev => prev.map(t => t.id === tierId ? {...t, lifecycleTag: 'Current contract' } : (t.id === projectContext.approvedTierId ? {...t, lifecycleTag: 'Superseded'} : t)));
        showSuccessWithNext('Option set as current contract');
    }

    const handleUnapproveTier = () => {
        setProjectContext(prev => ({ ...prev, approvedTierId: undefined }));
    }

    // Lineage nesting logic for sidebar
    const renderTierTree = () => {
        // Find roots (no parent)
        const roots = tiers.filter(t => !t.parentTierId);
        
        const renderNode = (tier: ProposalTier, depth = 0) => {
            const children = tiers.filter(t => t.parentTierId === tier.id);
            const isApproved = projectContext.approvedTierId === tier.id;
            const isActive = activeTierId === tier.id;
            const displayValue = tier.summary.totalRevenue || tier.summary.totalSell;
            const formattedDate = new Date(tier.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            
            // Diff calculation for sidebar label
            let diffLabel = null;
            if (tier.parentTierId) {
                const parent = tiers.find(t => t.id === tier.parentTierId);
                if (parent) {
                    const diffValue = displayValue - (parent.summary.totalRevenue || parent.summary.totalSell);
                    const isPositive = diffValue > 0;
                    diffLabel = diffValue !== 0 ? `${isPositive ? '+' : '-'}${formatCurrency(Math.abs(diffValue))} vs ${parent.name}` : null;
                }
            }

            return (
                <div key={tier.id} className="flex flex-col gap-1 w-full">
                    <div 
                        onClick={() => setActiveTierId(tier.id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer relative
                            ${isActive 
                                ? 'bg-[#f0f4ff] border-indigo-600 shadow-sm ring-1 ring-indigo-200/50' 
                                : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs'
                            }
                        `}
                        style={{ marginLeft: `${depth * 20}px` }}
                    >
                        {/* Parent connection lines */}
                        {depth > 0 && (
                            <div className="absolute -left-5 top-6 w-5 h-px bg-slate-200" />
                        )}
                        {depth > 0 && (
                            <div className="absolute -left-5 -top-4 w-px h-10 bg-slate-200" />
                        )}

                        <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-col gap-1.5 w-full">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {editingTierId === tier.id ? (
                                        <div className="flex items-center gap-2 w-full">
                                            <input 
                                                type="text"
                                                value={editingTierName}
                                                onChange={(e) => setEditingTierName(e.target.value)}
                                                onBlur={handleSaveEdit}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                                                autoFocus
                                                className="font-medium p-1 px-2 border border-slate-300 rounded bg-white text-slate-900 text-sm w-full outline-none"
                                            />
                                        </div>
                                    ) : (
                                        <p className="font-semibold text-slate-900 text-sm leading-tight" onDoubleClick={() => handleStartEditing(tier)} title="Double-click to rename">
                                            {tier.name}
                                        </p>
                                    )}
                                    
                                    {/* Badges */}
                                    {isApproved && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white tracking-wide">Current</span>}
                                    {!isApproved && tier.lifecycleTag && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide ${
                                            tier.lifecycleTag === 'Approved while booking' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80' :
                                            tier.lifecycleTag === 'Revised after design' ? 'bg-blue-50 text-blue-800 border border-blue-200/80' :
                                            tier.lifecycleTag === 'Draft' ? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            {tier.lifecycleTag}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[12px] text-slate-500 font-medium leading-tight">
                                    {formatCurrency(displayValue)} • {(tier.summary.blendedGm || 22.1).toFixed(1)}% GM • {tier.boq?.length || 20} items • {formattedDate}
                                </p>
                                {diffLabel && (
                                    <p className={`text-[11px] font-semibold mt-0.5 ${diffValue > 0 ? 'text-amber-600' : diffValue < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {diffLabel}
                                    </p>
                                )}
                            </div>
                        </div>

                        {isActive && (
                            <div className="flex items-center gap-2 mt-3.5 pt-3 border-t border-indigo-100/80 flex-wrap">
                                <button onClick={(e) => { e.stopPropagation(); handleDuplicateTier(tier.id); }} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs">Duplicate</button>
                                <button onClick={(e) => { e.stopPropagation(); handleEditTier(tier.id); }} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs">Edit BOQ</button>
                                {onImportClick && <button onClick={(e) => { e.stopPropagation(); onImportClick(); }} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs">Import</button>}
                                <div className="flex-1" />
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteTier(tier.id); }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg" title="Delete Option"><DeleteIcon className="w-4 h-4" /></button>
                            </div>
                        )}
                    </div>

                    {/* Render children recursively */}
                    {children.length > 0 && (
                        <div className="flex flex-col gap-1 mt-1">
                            {children.map(c => renderNode(c, depth + 1))}
                        </div>
                    )}
                </div>
            )
        }

        return roots.map(root => renderNode(root, 0));
    }

    const contractTimeline = useMemo(() => {
        const points: {
            id: string;
            stage: string;
            amount: number;
            date: string;
            gm: number;
            delta?: number;
        }[] = [];

        const snapshots = projectContext.financials?.paymentSnapshots || [];
        if (snapshots.length > 0) {
            snapshots.forEach((snap, idx) => {
                const amount = (snap.approvedExecutionValue || 0) + (snap.approvedDesignValue || 0);
                const prevAmount = idx > 0 ? (snapshots[idx - 1].approvedExecutionValue || 0) + (snapshots[idx - 1].approvedDesignValue || 0) : null;
                const dateStr = snap.timestamp ? new Date(snap.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Initial';
                const isBooking = idx === 0 || snap.tierName.toLowerCase().includes('booking') || snap.tierName.toLowerCase().includes('contract');
                
                // Find matching tier for exact GM if possible
                const matchingTier = tiers.find(t => t.id === snap.tierId);
                const gm = matchingTier?.summary?.blendedGm || matchingTier?.summary?.totalGm || 21.8;

                points.push({
                    id: snap.tierId || `snap-${idx}`,
                    stage: isBooking ? 'Approved while booking' : (snap.tierName.toLowerCase().includes('annexure') || snap.tierName.toLowerCase().includes('revision') ? 'Revised after design' : snap.tierName),
                    amount: amount,
                    date: dateStr,
                    gm: gm,
                    delta: prevAmount !== null ? amount - prevAmount : undefined
                });
            });
        } else {
            // Derive from baseline/booking tier vs revised tier
            const bookingTier = tiers.find(t => t.lifecycleTag === 'Approved while booking' || t.lifecycleTag === 'Current contract') 
                || (activeTier?.parentTierId ? tiers.find(t => t.id === activeTier.parentTierId) : null) 
                || tiers[0];

            if (bookingTier) {
                const bookingAmount = bookingTier.summary.totalRevenue || bookingTier.summary.totalSell || 0;
                const bookingDate = bookingTier.timestamp ? new Date(bookingTier.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '12 Jun 2026';
                const bookingGm = bookingTier.summary.blendedGm || 21.8;

                points.push({
                    id: bookingTier.id,
                    stage: 'Approved while booking',
                    amount: bookingAmount,
                    date: bookingDate,
                    gm: bookingGm
                });

                // If activeTier is an annexure or revision or distinct child tier
                if (activeTier && activeTier.id !== bookingTier.id) {
                    const activeAmount = activeTier.summary.totalRevenue || activeTier.summary.totalSell || 0;
                    const activeDate = activeTier.timestamp ? new Date(activeTier.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '22 Jul 2026';
                    const activeGm = activeTier.summary.blendedGm || 22.1;
                    const delta = activeAmount - bookingAmount;

                    points.push({
                        id: activeTier.id,
                        stage: activeTier.lifecycleTag === 'Revised after design' ? 'Revised after design' : (activeTier.name.toLowerCase().includes('revision') || activeTier.name.toLowerCase().includes('annexure') ? 'Revised after design' : activeTier.name),
                        amount: activeAmount,
                        date: activeDate,
                        gm: activeGm,
                        delta: delta
                    });
                }
            }
        }

        return points;
    }, [projectContext.financials?.paymentSnapshots, tiers, activeTier]);

    const totalContractDelta = useMemo(() => {
        if (contractTimeline.length <= 1) return 0;
        return contractTimeline[contractTimeline.length - 1].amount - contractTimeline[0].amount;
    }, [contractTimeline]);

    if (!activeTier) return <div>Loading...</div>;

    const parentValue = parentTier ? (parentTier.summary.totalRevenue || parentTier.summary.totalSell) : 0;
    const diffValue = parentTier ? displayValue - parentValue : 0;
    const diffGm = parentTier ? (activeTier.summary.blendedGm || 22.1) - (parentTier.summary.blendedGm || 22.1) : 0;
    const diffItems = parentTier ? (activeTier.boq?.length || 0) - (parentTier.boq?.length || 0) : 0;
    const isApproved = projectContext.approvedTierId === activeTier.id;
    const isAnnexureOrRevision = activeTier.name.toLowerCase().includes('annexure') || 
        activeTier.name.toLowerCase().includes('revision') || 
        activeTier.lifecycleTag === 'Revised after design' || 
        activeTier.lifecycleTag === 'Current contract (revised)' || 
        activeTier.lifecycleTag?.toLowerCase().includes('revision') ||
        activeTier.lifecycleTag?.toLowerCase().includes('annexure');

    return (
        <div className="w-full flex flex-col md:flex-row gap-8 max-w-[1400px] mx-auto items-start font-sans pb-12">
            
            {/* LEFT SIDEBAR: Lineage Tree */}
            <div className="w-full md:w-[320px] shrink-0 flex flex-col gap-5">
                    <div className="flex items-center justify-between px-2 pb-1 border-b border-slate-200">
                        <h3 className="font-bold text-slate-400 text-xs tracking-widest uppercase">Options & Versions</h3>
                        <button onClick={handleAddTier} className="text-indigo-600 text-xs font-bold hover:text-indigo-700 transition-colors">+ Add</button>
                    </div>
                
                <div className="flex flex-col gap-1">
                    {tiers.length === 0 ? (
                        <div className="p-6 text-center border border-dashed border-slate-300 rounded-xl bg-white">
                            <p className="text-sm text-slate-500">No tiers created yet.</p>
                            <button onClick={handleAddTier} className="mt-3 px-4 py-1.5 bg-indigo-600 text-white font-medium rounded-lg text-sm hover:bg-indigo-700">Add Option</button>
                        </div>
                    ) : (
                        renderTierTree()
                    )}
                </div>

                {/* CONTRACT VALUE OVER TIME */}
                {contractTimeline.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 flex flex-col gap-4 shadow-xs">
                        <h4 className="text-[11px] font-bold tracking-widest uppercase text-slate-400">
                            Contract Value Over Time
                        </h4>
                        
                        <div className="relative flex flex-col gap-4 pl-1">
                            {/* Vertical connecting line */}
                            {contractTimeline.length > 1 && (
                                <div className="absolute left-[5px] top-2.5 bottom-3.5 w-0.5 bg-slate-200" />
                            )}

                            {contractTimeline.map((point, idx) => (
                                <div key={point.id || idx} className="relative flex items-start gap-3">
                                    {/* Status Dot */}
                                    <div className="mt-1 relative z-10 shrink-0">
                                        <div className={`w-2.5 h-2.5 rounded-full ${idx === 0 ? 'bg-emerald-500 ring-4 ring-emerald-50' : 'bg-blue-600 ring-4 ring-blue-50'}`} />
                                    </div>

                                    <div className="flex flex-col gap-0.5">
                                        <span className="font-semibold text-xs text-slate-900 leading-tight">
                                            {point.stage}
                                        </span>
                                        <span className="text-base font-semibold text-slate-900 tracking-tight">
                                            {formatCurrency(point.amount)}
                                        </span>
                                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium flex-wrap">
                                            <span>{point.date}</span>
                                            <span>•</span>
                                            <span>{point.gm.toFixed(1)}% GM</span>
                                            {point.delta !== undefined && point.delta !== 0 && (
                                                <>
                                                    <span>•</span>
                                                    <span className={`font-semibold ${point.delta > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                        {point.delta > 0 ? `+${formatCurrency(point.delta)}` : `-${formatCurrency(Math.abs(point.delta))}`}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Summary Footer */}
                        {contractTimeline.length > 1 && (
                            <div className="border-t border-slate-100 pt-3 text-xs text-slate-500 font-medium flex items-center justify-between">
                                <span>Booking → today:</span>
                                <span className={`font-semibold ${totalContractDelta > 0 ? 'text-amber-600' : totalContractDelta < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                    {totalContractDelta > 0 ? `+${formatCurrency(totalContractDelta)}` : totalContractDelta < 0 ? `-${formatCurrency(Math.abs(totalContractDelta))}` : '₹0'}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* RIGHT SIDE: Central Console */}
            <div className="flex-1 flex flex-col gap-8 w-full">
                
                {/* 1. Selected Tier Header */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                        <div className="flex flex-col gap-2">
                            <h4 className="text-xs font-bold tracking-widest uppercase text-slate-400">Selected</h4>
                            <div className="flex items-center gap-3">
                                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{activeTier.name}</h2>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {isApproved && (
                                    <span className="bg-emerald-50 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                        {activeTier.name.toLowerCase().includes('annexure') ? 'Approved Annexure' :
                                         activeTier.name.toLowerCase().includes('revision') ? 'Approved Revision' : 'Approved Contract'}
                                    </span>
                                )}
                                {activeTier.lifecycleTag === 'Superseded' && <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-bold">Superseded</span>}
                                <button 
                                    onClick={handleSyncTier} 
                                    className="ml-auto px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 border border-slate-200 shadow-sm"
                                    title="Push pricing & BOQ changes to Payment Schedule and Revision Studio"
                                >
                                    <span>Sync to Payments & Revisions</span>
                                    <ArrowRightIcon className="w-3 h-3" />
                                </button>
                            </div>
                            <p className="text-[13px] text-slate-500 mt-1">
                                {activeTier.boq?.length || 0} items • cost {formatCurrency(activeTier.summary.totalCost || (displayValue * 0.78))} • created {new Date(activeTier.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                        </div>
                        <div className="flex flex-col md:items-end text-left md:text-right">
                            <h1 className="text-[40px] font-bold text-indigo-600 tracking-tight leading-none">{formatCurrency(displayValue)}</h1>
                            <p className="text-sm text-slate-500 mt-2">
                                <span className="font-semibold text-amber-700">{(activeTier.summary.blendedGm || 22.1).toFixed(1)}% blended GM</span> <span className="text-slate-300 mx-1">·</span> median 22.75%
                            </p>
                        </div>
                    </div>

                    {/* Immutability / Status Banner */}
                    {isApproved ? (
                        <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-4 flex flex-col md:flex-row justify-between md:items-center gap-3 mt-2">
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2 text-emerald-800 text-sm font-bold">
                                    <CheckIcon className="w-4 h-4" /> {isAnnexureOrRevision ? 'Approved after revision' : 'Frozen at approval'}
                                </div>
                                <p className="text-emerald-700/80 text-[13px]">
                                    {formatCurrency(displayValue)} at {(activeTier.summary.blendedGm || 22.1).toFixed(1)}% by Anish on {new Date(activeTier.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}. {isAnnexureOrRevision ? 'BOQ updated after revision — editing opens a new version.' : 'BOQ locked — editing opens a new version.'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row justify-between md:items-center gap-3 mt-2">
                             <div className="text-slate-600 text-sm">This is a draft version. Approve it to freeze the scope and base value.</div>
                             <button onClick={() => handleApproveTier(activeTier.id)} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-indigo-700 transition-colors">Approve Option</button>
                        </div>
                    )}
                </div>

                {/* 2. What Changed From Previous Version */}
                <div className="flex flex-col gap-3 mt-2">
                    <h4 className="text-[11px] font-bold tracking-widest uppercase text-slate-400 pl-1">What Changed From The Previous Version</h4>
                    <div className="bg-white rounded-xl border border-slate-200 p-6">
                        {parentTier ? (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="flex flex-col gap-1 border-r border-slate-100 pr-6">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Value</span>
                                    <h3 className="text-2xl font-semibold tracking-tight text-slate-900">
                                        {diffValue > 0 ? '+' : ''}{formatCurrency(diffValue)}
                                    </h3>
                                    <span className="text-[11px] text-slate-500 font-medium">vs {parentTier.name}</span>
                                </div>
                                <div className="flex flex-col gap-1 border-r border-slate-100 pr-6">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Margin</span>
                                    <h3 className="text-2xl font-semibold tracking-tight text-slate-900">
                                        {diffGm > 0 ? '+' : ''}{diffGm.toFixed(1)} pts
                                    </h3>
                                    <span className="text-[11px] text-slate-500 font-medium">vs parent</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Items</span>
                                    <h3 className="text-2xl font-semibold tracking-tight text-slate-900">
                                        {diffItems > 0 ? '+' : ''}{diffItems}
                                    </h3>
                                    <span className="text-[11px] text-slate-500 font-medium">lines changed</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center py-2 text-slate-400 text-[13px]">
                                This is a root option — nothing to compare against.
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Margin & Benchmark */}
                <div className="flex flex-col gap-3 mt-2">
                    <div className="flex items-center gap-2 pl-1">
                        <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-400">1</div>
                        <h4 className="text-[11px] font-bold tracking-widest uppercase text-slate-400">Margin & Benchmark</h4>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="flex flex-col gap-1 pr-6 border-r border-slate-100">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Blended GM</span>
                                <h3 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">{(activeTier.summary.blendedGm || 22.1).toFixed(1)}%</h3>
                                <span className="text-[11px] font-medium text-slate-500 mt-1">
                                    {(activeTier.summary.blendedGm || 22.1) > 22.75 ? "▲" : "▼"} {Math.abs((activeTier.summary.blendedGm || 22.1) - 22.75).toFixed(1)} pts vs median
                                </span>
                            </div>
                            <div className="flex flex-col gap-1 pr-6 border-r border-slate-100">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Per Sq Ft</span>
                                <h3 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">{formatCurrency(displayValue / Math.max(1, projectContext.area || 1000))}</h3>
                                <span className="text-[11px] font-medium text-slate-500 mt-1">revenue basis</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Above Floor By</span>
                                <h3 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">{( (activeTier.summary.blendedGm || 22.1) - 20 ).toFixed(1)} pts</h3>
                                <span className="text-[11px] font-medium text-slate-500 mt-1">floor 20%</span>
                            </div>
                        </div>

                        {/* Interactive Margin Assumptions Simulator (Phase 3) */}
                        <div className="border-t border-slate-100 pt-5 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Systematic Margin Adjuster</span>
                                {marginShiftAmount !== 0 && (
                                    <button 
                                        onClick={() => setMarginShiftAmount(0)}
                                        className="text-xs text-indigo-600 font-bold hover:text-indigo-700 transition-all"
                                    >
                                        Reset Shift
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex items-center gap-4">
                                <input 
                                    type="range" 
                                    min="-10" max="10" step="0.5" 
                                    value={marginShiftAmount} 
                                    onChange={(e) => setMarginShiftAmount(parseFloat(e.target.value))}
                                    className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                                <span className={`text-base font-bold w-20 text-right ${marginShiftAmount > 0 ? 'text-indigo-600' : marginShiftAmount < 0 ? 'text-red-500' : 'text-slate-900'}`}>
                                    {marginShiftAmount > 0 ? `+${marginShiftAmount.toFixed(1)}` : marginShiftAmount.toFixed(1)}%
                                </span>
                            </div>

                            {marginShiftAmount !== 0 && (
                                <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-4 flex flex-col gap-3 animate-in fade-in duration-300">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Simulated Sell</span>
                                            <span className="text-sm font-semibold text-slate-900 mt-0.5">{formatCurrency(simulatedSellValue)}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Simulated Design Fee</span>
                                            <span className="text-sm font-semibold text-slate-900 mt-0.5">{formatCurrency(simulatedDesignFee)}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Simulated Total</span>
                                            <span className="text-sm font-semibold text-indigo-600 mt-0.5 font-bold">{formatCurrency(simulatedTotalRevenue)}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Simulated GM</span>
                                            <span className="text-sm font-semibold text-slate-900 mt-0.5 font-bold">{simulatedBlendedGm.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-end pt-1 border-t border-indigo-100/50">
                                        <button 
                                            onClick={handleApplyMarginShift}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                                        >
                                            <SaveIcon className="w-3.5 h-3.5" /> Apply systematically to all items
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Comparable Past Projects</span>
                            <div className="flex flex-col gap-0">
                                {comparableProjects.map((p, idx) => {
                                    const diffPct = (activeTier.summary.blendedGm || 22.1) - p.gm;
                                    return (
                                        <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-b-0">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                                                <span className="text-xs text-slate-400">{formatCurrency(p.value)} • {p.itemsCount} items</span>
                                            </div>
                                            <div className="flex flex-col items-end gap-0.5">
                                                <span className="text-sm font-bold text-slate-900">{p.gm.toFixed(1)}%</span>
                                                <span className={`text-xs font-medium ${diffPct > 0 ? 'text-indigo-600' : diffPct < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                                    {diffPct > 0 ? `+${diffPct.toFixed(1)}` : diffPct.toFixed(1)} pts vs this
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <span className="text-[11px] text-slate-400">Closest matches by size and item count.</span>
                        </div>
                    </div>
                </div>

                {/* 4. Discount Headroom Simulator */}
                <div className="flex flex-col gap-3 mt-2">
                    <div className="flex items-center gap-2 pl-1">
                        <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-400">2</div>
                        <h4 className="text-[11px] font-bold tracking-widest uppercase text-slate-400">Discount Headroom</h4>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-6">
                        
                        <div className="flex items-center gap-4">
                            <input 
                                type="range" 
                                min="0" max="10" step="0.1" 
                                value={discountHeadroom} 
                                onChange={(e) => setDiscountHeadroom(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <span className="text-xl font-bold text-slate-900 w-20 text-right">{discountHeadroom.toFixed(2)}%</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-2">
                            <div className="flex flex-col gap-1 border-r border-slate-100 pr-4">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Client Pays</span>
                                <h3 className="text-xl font-semibold text-slate-900 tracking-tight mt-1">{formatCurrency(clientPays)}</h3>
                                <span className="text-[11px] text-slate-500 font-medium">was {formatCurrency(displayValue)}</span>
                            </div>
                            <div className="flex flex-col gap-1 border-r border-slate-100 pr-4">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">You Give Up</span>
                                <h3 className="text-xl font-semibold text-slate-900 tracking-tight mt-1">{formatCurrency(giveUp)}</h3>
                                <span className="text-[11px] text-slate-500 font-medium">{formatCurrency(displayValue * 0.01)} per 1%</span>
                            </div>
                            <div className="flex flex-col gap-1 border-r border-slate-100 pr-4">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">New GM</span>
                                <h3 className="text-xl font-semibold text-slate-900 tracking-tight mt-1">
                                    {newBlendedGm.toFixed(1)}%
                                </h3>
                                <span className={`text-[11px] font-medium ${newBlendedGm >= 20 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {newBlendedGm >= 20 ? 'above floor' : 'below floor'}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1 pr-4">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Headroom</span>
                                <h3 className="text-xl font-semibold text-slate-900 tracking-tight mt-1">
                                    {maxDiscountPct.toFixed(2)}%
                                </h3>
                                <span className="text-[11px] text-slate-500 font-medium">{formatCurrency(headroomRupees)} total</span>
                            </div>
                        </div>

                        {/* Derived Client Negotiation Analysis Note */}
                        {(() => {
                            const isCustom = discountHeadroom > 0;
                            const askPct = isCustom ? discountHeadroom : 5;
                            const askRupees = displayValue * (askPct / 100);
                            const simulatedClientPays = displayValue - askRupees;
                            const simulatedGm = simulatedClientPays > 0 ? ((simulatedClientPays - activeTierCost) / simulatedClientPays) * 100 : 0;
                            const isBelowFloor = simulatedGm < 20;

                            return (
                                <div className={`rounded-lg p-3.5 text-[13px] border leading-relaxed ${
                                    isBelowFloor 
                                        ? 'bg-amber-50/70 border-amber-200 text-slate-800' 
                                        : 'bg-emerald-50/70 border-emerald-200 text-slate-800'
                                }`}>
                                    A client asking <strong className="font-bold text-slate-900">{askPct % 1 === 0 ? `${askPct}%` : `${askPct.toFixed(1)}%`}</strong> wants <strong className="font-bold text-slate-900">{formatCurrency(askRupees)}</strong> — against headroom of <strong className="font-bold text-slate-900">{formatCurrency(headroomRupees)}</strong>. That lands at <strong className="font-bold text-slate-900">{simulatedGm.toFixed(1)}%</strong>, {isBelowFloor ? 'below the 20% floor.' : 'above the 20% floor.'}
                                </div>
                            );
                        })()}
                    </div>
                </div>
                
                {/* 5. Health Check Placeholders */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                    <div className="flex flex-col gap-3">
                         <div className="flex items-center gap-2 pl-1">
                            <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-400">3</div>
                            <h4 className="text-[11px] font-bold tracking-widest uppercase text-slate-400">Scope Completeness</h4>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-5 h-full flex flex-col gap-4">
                            <div className="flex gap-3 items-start bg-amber-50/30 p-3 rounded-lg border border-amber-100">
                                <span className="text-amber-500 mt-0.5 text-xs">▲</span>
                                <div>
                                    <h5 className="font-bold text-sm text-slate-900">T.V. Unit (Drawer)</h5>
                                    <p className="text-[12px] text-slate-500 mt-0.5">missing · in 17 of 23 past projects</p>
                                </div>
                            </div>
                            <div className="flex gap-3 items-start bg-amber-50/30 p-3 rounded-lg border border-amber-100">
                                <span className="text-amber-500 mt-0.5 text-xs">▲</span>
                                <div>
                                    <h5 className="font-bold text-sm text-slate-900">Floor Protection</h5>
                                    <p className="text-[12px] text-slate-500 mt-0.5">missing · in 13 of 23 past projects</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                         <div className="flex items-center gap-2 pl-1">
                            <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-400">4</div>
                            <h4 className="text-[11px] font-bold tracking-widest uppercase text-slate-400">Rate Outliers</h4>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-5 h-full flex flex-col gap-4">
                             <div className="flex flex-col gap-1 p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                                <h5 className="font-bold text-sm text-slate-900">Wardrobe with Loft</h5>
                                <p className="text-[12px] text-slate-500">bank ₹1,240 · <span className="text-slate-400 font-medium">+60%</span></p>
                            </div>
                            <div className="flex flex-col gap-1 p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                                <h5 className="font-bold text-sm text-slate-900">Interior Painting</h5>
                                <p className="text-[12px] text-slate-500">history ₹41 · <span className="text-slate-400 font-medium">-32%</span></p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default TierManager;
