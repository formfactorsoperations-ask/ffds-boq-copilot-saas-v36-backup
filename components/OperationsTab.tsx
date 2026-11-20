
import React, { useState } from 'react';
import { ProposalTier, Item, ProjectContext, FullProjectData } from '../types';
import TierManager from './TierManager';
import { TemplateData } from '../lib/standardPackages';
import ExcelImportModal from './ExcelImportModal';
import { addToBank } from '../lib/bankMatch';

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
    projects?: FullProjectData[];
    /** This project's id, so Pricing & Tiers does not benchmark it against itself. */
    projectId?: string;
    /** The studio's own typology templates, for regenerating the BOQ. */
    templates?: TemplateData;
    /** Opens an option's BOQ over Pricing & Tiers (App's slide-over). */
    onEditBoq?: (tierId: string, focusLineIds?: string[]) => void;
}

const OperationsTab: React.FC<OperationsTabProps> = (props) => {
    const { tiers, setTiers, activeTierId, setActiveTierId, projectContext, setProjectContext, bank, setBank, setActiveTab, projects, projectId, templates, onEditBoq } = props;
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    const handleImportComplete = (newTier: ProposalTier, newBankItems: Item[]) => {
        // 1. Update Bank if there are new items
        if (newBankItems.length > 0 && setBank) {
            // An item the bank already has by name and unit goes in as its copy, not as another item (lib/bankMatch.ts).
            setBank(prev => addToBank(prev, newBankItems, 'start'));

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
            

            <TierManager
                tiers={tiers}
                setTiers={setTiers}
                activeTierId={activeTierId}
                setActiveTierId={setActiveTierId}
                projectContext={projectContext}
                setProjectContext={setProjectContext}
                bank={bank}
                setActiveTab={setActiveTab}
                onImportClick={() => setIsImportModalOpen(true)}
                projects={projects}
                projectId={projectId}
                templates={templates}
                onEditBoq={onEditBoq}
            />

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
