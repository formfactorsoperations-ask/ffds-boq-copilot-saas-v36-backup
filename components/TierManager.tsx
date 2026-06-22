
import React, { useState } from 'react';
import { BoqItem, ProjectContext, ProposalTier } from '../types';
import { calculateSellPrice, formatCurrency, calculateGrossMargin, id } from '../lib/utils';
import Card from './shared/Card';
import { CompareIcon, DeleteIcon, PencilIcon, CheckBadgeIcon, SparklesIcon, SaveIcon, CheckIcon } from './Icons';

interface TierManagerProps {
    tiers: ProposalTier[];
    setTiers: React.Dispatch<React.SetStateAction<ProposalTier[]>>;
    activeTierId: string | null;
    setActiveTierId: (id: string | null) => void;
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    setActiveTab: (tab: string) => void;
}

const TierManager: React.FC<TierManagerProps> = ({ tiers, setTiers, activeTierId, setActiveTierId, projectContext, setProjectContext, setActiveTab }) => {
    const [editingTierId, setEditingTierId] = useState<string | null>(null);
    const [editingTierName, setEditingTierName] = useState('');

    const handleAddTier = () => {
        // Initial summary with zeros, will be recalculated by App effect
        const newTier: ProposalTier = {
            id: id(),
            name: `New Option ${tiers.length + 1}`,
            timestamp: Date.now(),
            boq: [],
            projectContext,
            summary: { totalSell: 0, totalCost: 0, totalGm: 0, itemCount: 0, totalRevenue: 0, designFee: 0, blendedGm: 0 },
        };
        setTiers(prev => [...prev, newTier]);
        setActiveTierId(newTier.id);
    };
    
    const handleDuplicateTier = (tierId: string) => {
        const tierToDuplicate = tiers.find(t => t.id === tierId);
        if (!tierToDuplicate) return;
        
        const newTier: ProposalTier = {
            ...JSON.parse(JSON.stringify(tierToDuplicate)), // Deep copy
            id: id(),
            name: `${tierToDuplicate.name} (Copy)`,
            timestamp: Date.now(),
        };
        setTiers(prev => [...prev, newTier]);
        setActiveTierId(newTier.id);
    };

    const handleCreateOptimizedVersion = (tierId: string) => {
        const tierToOptimize = tiers.find(t => t.id === tierId);
        if (!tierToOptimize) return;

        const newTier: ProposalTier = {
            ...JSON.parse(JSON.stringify(tierToOptimize)), // Deep copy
            id: id(),
            name: `[Optimized] ${tierToOptimize.name}`,
            timestamp: Date.now(),
        };
        setTiers(prev => [...prev, newTier]);
        setActiveTierId(newTier.id);
    };

    const handleDeleteTier = (tierId: string) => {
        // Removed window.confirm as it's blocked in sandboxed environments
        setTiers(prev => prev.filter(t => t.id !== tierId));
        
        // If the deleted tier was the approved one, clear approval
        if (projectContext.approvedTierId === tierId) {
            setProjectContext(prev => ({...prev, approvedTierId: undefined}));
        }

        // If the active tier was deleted, set a new active tier
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
        setActiveTierId(tierId);
        setActiveTab('boq-editor');
    };

    const handleApproveTier = (tierId: string) => {
        setProjectContext(prev => ({ ...prev, approvedTierId: tierId }));
    }

    const handleUnapproveTier = () => {
        setProjectContext(prev => ({ ...prev, approvedTierId: undefined }));
    }

    const handleQuickBackup = () => {
        const backupData = {
            projectContext,
            tiers,
            timestamp: new Date().toISOString(),
            version: '25.0',
            type: 'versions_backup'
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(projectContext.name || 'Project').replace(/\s+/g, '_')}_Versions.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <Card title="Proposal Tier Manager" titleIcon={<CompareIcon className="w-4 h-4" />}>
            <div className="absolute top-6 right-6">
                <button 
                    onClick={handleQuickBackup}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-sm"
                    title="Download Versions Backup"
                >
                    <SaveIcon className="w-3.5 h-3.5" />
                    Save
                </button>
            </div>

            <div className="space-y-4">
                <p className="text-sm text-slate-600">
                    Manage proposal options. Mark one as <strong>Approved</strong> to generate the "Level 2: Design Finalisation" document.
                </p>
                <div>
                    <h5 className="font-bold mb-2">Proposal Options:</h5>
                    {tiers.length === 0 ? (
                        <p className="text-sm text-slate-500">No tiers created yet. Add one to begin.</p>
                    ) : (
                        <div className="space-y-2">
                            {tiers.map(tier => {
                                const isApproved = projectContext.approvedTierId === tier.id;
                                const isActive = activeTierId === tier.id;
                                const displayValue = tier.summary.totalRevenue || tier.summary.totalSell; // Fallback for safety

                                return (
                                    <div key={tier.id} className={`p-3 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all border
                                        ${isActive 
                                            ? 'bg-indigo-50/50 border-indigo-300 ring-2 ring-indigo-200 backdrop-blur-sm' 
                                            : 'bg-white/40 border-white/50 hover:bg-white/60'
                                        }
                                        ${isApproved ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/30' : ''}
                                    `}>
                                        <div className="flex items-center gap-3 flex-grow" onClick={() => setActiveTierId(tier.id)}>
                                            {/* Status Icon */}
                                            <div className="shrink-0 cursor-pointer">
                                                {isApproved ? (
                                                    <div 
                                                        className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 hover:bg-red-100 hover:text-red-500 transition-colors" 
                                                        title="Approved! Click to Unapprove / Revert to Draft"
                                                        onClick={(e) => { e.stopPropagation(); handleUnapproveTier(); }}
                                                    >
                                                        <CheckBadgeIcon className="w-5 h-5" />
                                                    </div>
                                                ) : (
                                                    <div 
                                                        className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 hover:text-slate-400 hover:border-slate-300 transition-colors" 
                                                        onClick={(e) => { e.stopPropagation(); handleApproveTier(tier.id); }}
                                                        title="Click to Mark as Approved"
                                                    >
                                                        <CheckBadgeIcon className="w-5 h-5" />
                                                    </div>
                                                )}
                                            </div>

                                            {editingTierId === tier.id ? (
                                                <div className="flex items-center gap-2 w-full md:w-auto">
                                                    <input 
                                                        type="text"
                                                        value={editingTierName}
                                                        onChange={(e) => setEditingTierName(e.target.value)}
                                                        onBlur={handleSaveEdit}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                                                        autoFocus
                                                        className="font-bold p-1 px-2 border border-indigo-300 ring-2 ring-indigo-100 rounded bg-white text-slate-800 text-sm w-full outline-none"
                                                    />
                                                    <button 
                                                        onMouseDown={(e) => e.preventDefault()} // Prevent blur before click
                                                        onClick={handleSaveEdit}
                                                        className="p-1.5 bg-indigo-600 text-white rounded shadow-sm hover:bg-indigo-700 transition-colors"
                                                        title="Save Name"
                                                    >
                                                        <CheckIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="cursor-pointer">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-slate-800" onDoubleClick={() => handleStartEditing(tier)}>{tier.name}</p>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleStartEditing(tier); }}
                                                            className="text-slate-300 hover:text-indigo-500 opacity-0 group-hover:opacity-100"
                                                        >
                                                            <PencilIcon className="w-3 h-3" />
                                                        </button>
                                                        {isApproved && <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded">Approved</span>}
                                                    </div>
                                                    <p className="text-xs text-slate-500">
                                                        {tier.boq?.length || 0} items • {formatCurrency(displayValue)}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 pl-11 md:pl-0">
                                            {/* Optimize Button */}
                                            <button 
                                                onClick={() => handleCreateOptimizedVersion(tier.id)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 font-semibold rounded-md hover:bg-purple-200 border border-purple-200/50 transition-colors"
                                                title="Create Optimized Version for FFDS Internal"
                                            >
                                                <SparklesIcon className="w-3 h-3" />
                                                Optimize
                                            </button>

                                            <button 
                                                onClick={() => handleEditTier(tier.id)} 
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-100 text-indigo-700 font-semibold rounded-md hover:bg-indigo-200 border border-indigo-200/50 transition-colors"
                                            >
                                                <PencilIcon className="w-3 h-3" />
                                                Edit BOQ
                                            </button>
                                            
                                            <button onClick={() => handleDuplicateTier(tier.id)} className="px-3 py-1.5 text-sm bg-white/60 text-slate-700 font-semibold rounded-md hover:bg-white border border-white/80">
                                                Copy
                                            </button>
                                            <button onClick={() => handleDeleteTier(tier.id)} className="p-1.5 text-red-500 hover:bg-red-100/50 rounded-md">
                                                <DeleteIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
                 <div className="pt-4 border-t border-slate-900/5">
                    <button onClick={handleAddTier} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700">
                        Add New Tier
                    </button>
                </div>
            </div>
        </Card>
    );
};

export default TierManager;
