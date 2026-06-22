
import React, { useState, useEffect, useMemo } from 'react';
import { ProposalTier, Item, ProjectContext, AiComparisonResult } from '../types';
import TierManager from './TierManager';
import ClientComparisonMatrix from './client/ClientComparisonMatrix';
import InternalComparisonTable from './InternalComparisonTable';
import Card from './shared/Card';
import { generateLocalComparison } from '../lib/comparison';
import { GridIcon, ListIcon, FileSpreadsheetIcon } from './Icons';
import ExcelImportModal from './ExcelImportModal';

interface OperationsTabProps {
    tiers: ProposalTier[];
    setTiers: React.Dispatch<React.SetStateAction<ProposalTier[]>>;
    activeTierId: string | null;
    setActiveTierId: (id: string | null) => void;
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    bank: Item[];
    setBank?: React.Dispatch<React.SetStateAction<Item[]>>; // Optional for this tab usually, but needed for import
    setActiveTab: (tab: string) => void;
}

const OperationsTab: React.FC<OperationsTabProps> = (props) => {
    const { tiers, setTiers, activeTierId, setActiveTierId, projectContext, setProjectContext, bank, setBank, setActiveTab } = props;
    const [comparisonData, setComparisonData] = useState<AiComparisonResult>({ materialMatrix: [], scopeMatrix: [], tierSummaries: [] });
    const [compareMode, setCompareMode] = useState<'client' | 'internal'>('internal');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    // Using full bank array to allow price calculations in the generator
    useEffect(() => {
        if (tiers.length > 0) {
            const data = generateLocalComparison(tiers, bank);
            setComparisonData(data);
        }
    }, [tiers, bank]);

    const handleImportComplete = (newTier: ProposalTier, newBankItems: Item[]) => {
        // 1. Update Bank if there are new items
        if (newBankItems.length > 0 && setBank) {
            // Check for dupes just in case (though modal handles it per session)
            setBank(prev => {
                const existingIds = new Set(prev.map(i => i.id));
                const uniqueNew = newBankItems.filter(i => !existingIds.has(i.id));
                return [...uniqueNew, ...prev];
            });

            // Save adHocItems to project context to persist custom items to the current project
            if (setProjectContext) {
                setProjectContext(prev => {
                    const currentAdHoc = prev.adHocItems || [];
                    const adHocIds = new Set(currentAdHoc.map(i => i.id));
                    const uniqueAdHocNew = newBankItems.filter(i => !adHocIds.has(i.id));
                    return {
                        ...prev,
                        adHocItems: [...currentAdHoc, ...uniqueAdHocNew]
                    };
                });
            }
        }

        // 2. Add new Tier
        // Ensure context is linked
        newTier.projectContext = projectContext; 
        setTiers(prev => [...prev, newTier]);
        setActiveTierId(newTier.id);
        setActiveTab('boq-editor'); // Jump to editor to review
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                 <button 
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-700 transition-all text-sm"
                >
                    <FileSpreadsheetIcon className="w-4 h-4" /> Import Excel Option
                </button>
            </div>

            <TierManager
                tiers={tiers}
                setTiers={setTiers}
                activeTierId={activeTierId}
                setActiveTierId={setActiveTierId}
                projectContext={projectContext}
                setProjectContext={setProjectContext}
                setActiveTab={setActiveTab}
            />
            {tiers.length > 1 && (
                <Card 
                    title={compareMode === 'internal' ? "Internal Scope Matrix (Excel View)" : "Client Comparison Matrix"} 
                    id="version-compare"
                    className="overflow-visible"
                >
                    <div className="flex justify-end mb-4 -mt-12">
                        <div className="bg-slate-100 p-1 rounded-lg flex border border-slate-200">
                            <button 
                                onClick={() => setCompareMode('internal')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${compareMode === 'internal' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <GridIcon className="w-3.5 h-3.5" /> Internal
                            </button>
                            <button 
                                onClick={() => setCompareMode('client')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${compareMode === 'client' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <ListIcon className="w-3.5 h-3.5" /> Client View
                            </button>
                        </div>
                    </div>

                    {compareMode === 'internal' ? (
                        <div className="animate-in fade-in duration-300">
                            <p className="text-sm text-slate-500 mb-4">
                                Use this view to audit scope differences between packages. Rows highlighted in <span className="bg-amber-100 px-1 rounded text-amber-700 font-bold">Orange</span> indicate quantity mismatches.
                            </p>
                            <InternalComparisonTable tiers={tiers} bank={bank} />
                        </div>
                    ) : (
                        <div className="animate-in fade-in duration-300">
                            <p className="text-sm text-slate-500 mb-4">
                                This matrix is auto-generated based on the items present in each tier. It highlights differences in Material Specs (e.g. BWP vs MR plywood) and Scope Coverage.
                            </p>
                            <ClientComparisonMatrix
                                data={comparisonData}
                                tierNames={tiers.map(t => t.name)}
                                isLoading={false}
                            />
                        </div>
                    )}
                </Card>
            )}

            <ExcelImportModal 
                isOpen={isImportModalOpen} 
                onClose={() => setIsImportModalOpen(false)}
                onImport={handleImportComplete}
                bank={bank}
                projectId={projectContext.name || 'Project'}
            />
        </div>
    );
};

export default OperationsTab;
