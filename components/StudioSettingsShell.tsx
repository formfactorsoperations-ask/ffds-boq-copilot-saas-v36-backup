import React, { useMemo, useEffect } from 'react';
import StudioSettingsTab from './studio/StudioSettingsTab';
import StudioSetupWizard from './StudioSetupWizard';
import CommunicationTemplatesTab from './ops/CommunicationTemplatesTab';
import { useOrg } from '../contexts/OrgContext';
import { useStudioSettings } from '../hooks/useStudioSettings';

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
    const { currentRole, orgData } = useOrg();
    const tenantId = orgData.tenantId || 'demo-tenant-01';
    const { settings, updateSettings } = useStudioSettings(tenantId);

    const currentSubTab = ['setup-wizard', 'studio-settings', 'communication-templates', 'terms-and-payment'].includes(activeTab) 
        ? (activeTab === 'terms-and-payment' ? 'studio-settings' : activeTab)
        : 'setup-wizard';

    const AVAILABLE_TABS = useMemo(() => {
        const tabs = [];
        
        if (['Admin', 'Super Admin'].includes(currentRole as string)) {
            tabs.push({ id: 'setup-wizard', label: 'Studio Profile' });
        }
        
        if (['Admin', 'Ops Director', 'Super Admin'].includes(currentRole as string)) {
            tabs.push({ id: 'studio-settings', label: 'General Settings' });
            tabs.push({ id: 'communication-templates', label: 'Email & Communication Templates' });
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
                <nav className="-mb-px flex space-x-8 overflow-x-auto custom-scrollbar" aria-label="Tabs">
                    {AVAILABLE_TABS.map((tab) => {
                        const isActive = currentSubTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                                    ${isActive
                                        ? 'border-[#0066CC] text-[#0066CC]'
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
                {currentSubTab === 'studio-settings' && (
                    <StudioSettingsTab 
                        initialTab={activeTab === 'terms-and-payment' ? 'Defaults (Contracts & Payments)' : undefined}
                        onDownloadBackup={onDownloadBackup}
                        onImportProject={onImportProject}
                        onClearProject={onClearProject}
                        confirmReset={confirmReset}
                    />
                )}
                {currentSubTab === 'communication-templates' && (
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs">
                        <CommunicationTemplatesTab 
                            settings={settings} 
                            updateSettings={updateSettings} 
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudioSettingsShell;
