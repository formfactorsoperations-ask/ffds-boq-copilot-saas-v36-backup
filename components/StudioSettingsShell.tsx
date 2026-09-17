import React, { useMemo, useEffect } from 'react';
import StudioSettingsConsole from './studio/StudioSettingsConsole';
import Tabs from './ui/Tabs';
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
        : 'studio-settings';

    /*
      The setup wizard is for a studio that has not been set up.

      It used to be the first tab and the default landing screen, so every visit
      to settings opened a four-step "Welcome! Let's brand your workspace" flow
      -- and it edited branding, bank details and the legal entity, which the
      settings screen edits too. Two editors for one record, and no way to reach
      a single field without walking the steps. It now appears only while
      `isSetupComplete` is false, which is what that flag was for.
    */
    const needsSetup = !orgData?.isSetupComplete;

    const AVAILABLE_TABS = useMemo(() => {
        const tabs = [];

        if (needsSetup && ['Admin', 'Super Admin'].includes(currentRole as string)) {
            tabs.push({ id: 'setup-wizard', label: 'First-time setup' });
        }

        if (['Admin', 'Ops Director', 'Super Admin'].includes(currentRole as string)) {
            tabs.push({ id: 'studio-settings', label: 'Studio Settings' });
            tabs.push({ id: 'communication-templates', label: 'Email & Communication Templates' });
        }

        return tabs;
    }, [currentRole, needsSetup]);

    useEffect(() => {
        if (AVAILABLE_TABS.length > 0 && !AVAILABLE_TABS.find(t => t.id === currentSubTab)) {
            setActiveTab(AVAILABLE_TABS[0].id);
        }
    }, [currentSubTab, AVAILABLE_TABS, setActiveTab]);

    /*
      Full width, like the platform console. Pinned to max-w-6xl this page left
      two empty columns on a wide screen while its own content -- a settings
      form beside a rail -- was the thing being squeezed.
    */
    const settingsTabs = (
        <Tabs
            ariaLabel="Settings sections"
            value={currentSubTab}
            onChange={setActiveTab}
            items={AVAILABLE_TABS.map(t => ({ id: t.id, label: t.label }))}
        />
    );

    return (
        <div className="w-full px-1 sm:px-2">
            

            <div className="bg-transparent mt-4">
                {currentSubTab === 'setup-wizard' && (
                    <StudioSetupWizard onComplete={() => setActiveTab('projects')} />
                )}
                {currentSubTab === 'studio-settings' && (
                    <StudioSettingsConsole
                        tabs={settingsTabs}
                        onDownloadBackup={onDownloadBackup}
                        onImportProject={onImportProject}
                        onClearProject={onClearProject}
                        confirmReset={confirmReset}
                    />
                )}
                {currentSubTab === 'communication-templates' && (
                    <CommunicationTemplatesTab
                        settings={settings}
                        updateSettings={updateSettings}
                        tabs={settingsTabs}
                    />
                )}
            </div>
        </div>
    );
};

export default StudioSettingsShell;
