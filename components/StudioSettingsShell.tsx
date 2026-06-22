import React, { useMemo, useEffect } from 'react';
import StudioSettingsTab from './studio/StudioSettingsTab';
import TeamTab from './TeamTab';
import SubscriptionTab from './SubscriptionTab';
import StudioSetupWizard from './StudioSetupWizard';
import { useOrg } from '../contexts/OrgContext';

interface StudioSettingsShellProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    onDownloadBackup: () => void;
    onImportProject: (e: any) => void;
    onClearProject: () => void;
    confirmReset: boolean;
}

const StudioSettingsShell: React.FC<StudioSettingsShellProps> = ({
    activeTab,
    setActiveTab,
    onDownloadBackup,
    onImportProject,
    onClearProject,
    confirmReset
}) => {
    const { currentRole } = useOrg();

    const currentSubTab = ['setup-wizard', 'team', 'subscription', 'studio-settings'].includes(activeTab) 
        ? activeTab 
        : 'setup-wizard';

    const AVAILABLE_TABS = useMemo(() => {
        const tabs = [];
        
        if (['Admin', 'Super Admin'].includes(currentRole as string)) {
            tabs.push({ id: 'setup-wizard', label: 'Studio Profile' });
            tabs.push({ id: 'team', label: 'Team & Roles' });
            tabs.push({ id: 'subscription', label: 'Plan & Billing' });
        }
        
        if (['Admin', 'Ops Director', 'Super Admin'].includes(currentRole as string)) {
            tabs.push({ id: 'studio-settings', label: 'General' });
        }
        
        return tabs;
    }, [currentRole]);

    useEffect(() => {
        if (AVAILABLE_TABS.length > 0 && !AVAILABLE_TABS.find(t => t.id === currentSubTab)) {
            setActiveTab(AVAILABLE_TABS[0].id);
        }
    }, [currentSubTab, AVAILABLE_TABS, setActiveTab]);

    return (
        <div className="max-w-6xl mx-auto w-full">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-6">Settings</h1>
            <div className="mb-6 border-b border-slate-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {AVAILABLE_TABS.map((tab) => {
                        const isActive = currentSubTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                                    ${isActive
                                        ? 'border-indigo-600 text-indigo-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                    }
                                `}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            <div className="bg-transparent mt-4">
                {currentSubTab === 'setup-wizard' && (
                    <StudioSetupWizard onComplete={() => setActiveTab('projects')} />
                )}
                {currentSubTab === 'team' && (
                    <TeamTab />
                )}
                {currentSubTab === 'subscription' && (
                    <SubscriptionTab />
                )}
                {currentSubTab === 'studio-settings' && (
                    <StudioSettingsTab 
                        onDownloadBackup={onDownloadBackup}
                        onImportProject={onImportProject}
                        onClearProject={onClearProject}
                        confirmReset={confirmReset}
                    />
                )}
            </div>
        </div>
    );
};

export default StudioSettingsShell;
