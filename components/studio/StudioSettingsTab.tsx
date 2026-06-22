import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrg } from '../../contexts/OrgContext';
import { BuildingOfficeIcon, CalculatorIcon, EnvelopeIcon } from '../Icons';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import { Plus, Trash2, CheckCircle2, MessageSquare, Save, Upload } from 'lucide-react';
import { renderPaymentReminderMessage } from '../../lib/whatsappUtils';
import { connectGoogleCalendar, isGoogleCalendarConnected } from '../../services/googleCalendarService';
import CommunicationTemplatesTab from '../ops/CommunicationTemplatesTab';
import TermsConfigTab from './TermsConfigTab';

interface StudioSettingsTabProps {
    onDownloadBackup?: () => void;
    onImportProject?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearProject?: () => void;
    confirmReset?: boolean;
}

export default function StudioSettingsTab({
    onDownloadBackup,
    onImportProject,
    onClearProject,
    confirmReset
}: StudioSettingsTabProps = {}) {
    const { orgData, updateOrgData, currentRole, currentUserAuth } = useOrg();
    
    // We only want Admin, Ops Director, or Super Admin to edit
    const canEdit = currentRole === 'Admin' || currentRole === 'Ops Director' || currentRole === 'Super Admin';
    const isSuperAdmin = currentUserAuth?.email === 'formfactors.operations@gmail.com';
    const tenantId = orgData.tenantId || 'demo-tenant-01';

    const { settings, updateSettings, loading, error } = useStudioSettings(tenantId);
    
    // Basic Tabs
    const TABS = [
        'Branding', 'Process', 'Fees', 'Payments', 'Terms', 'Terms Config', 'Onboarding', 'Communication Templates', 'Portal', 'SOF & Changes', 'Platform Admin'
    ];
    const [activeTab, setActiveTab] = useState(TABS[0]);
    const [previewMode, setPreviewMode] = useState('Cover');
    const [showPreviewMobile, setShowPreviewMobile] = useState(false);

    const [liveProcess, setLiveProcess] = useState<any>(null);
    const [liveFees, setLiveFees] = useState<any>(null);
    const [livePayments, setLivePayments] = useState<any>(null);
    const [liveEmails, setLiveEmails] = useState<any>(null);

    // Local form state for Branding (already in original code)
    const [brandingData, setBrandingData] = useState({
        orgName: orgData.orgName || '',
        orgLogo: orgData.orgLogo || '',
        contactEmail: orgData.contactEmail || '',
        contactPhone: orgData.contactPhone || '',
        officeAddress: orgData.officeAddress || '',
        cityState: orgData.cityState || '',
        gstin: orgData.gstin || '',
        designFeePercentage: orgData.designFeePercentage || 10,
        defaultGstRate: orgData.defaultGstRate || 18,
        themeColor: orgData.themeColor || '#4f46e5',
        procurementLeadTimeWeeks: orgData.procurementLeadTimeWeeks || 4,
        forceMajeureText: orgData.defaultContractWordings?.forceMajeureText || '',
        revisionsText: orgData.defaultContractWordings?.revisionsText || '',
        paymentTermsText: orgData.defaultContractWordings?.paymentTermsText || '',
        clientObsText: orgData.defaultContractWordings?.clientObsText || '',
    });

    const [isSaved, setIsSaved] = useState(false);

    const handleBrandingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target as any;
        setBrandingData(prev => ({
            ...prev,
            [name]: type === 'number' ? Number(value) : value
        }));
    };

    const handleSaveBranding = () => {
        if (!canEdit) return;
        updateOrgData({
            ...brandingData,
            defaultContractWordings: {
                forceMajeureText: brandingData.forceMajeureText,
                revisionsText: brandingData.revisionsText,
                paymentTermsText: brandingData.paymentTermsText,
                clientObsText: brandingData.clientObsText,
            }
        });
        showSaved();
    };

    const showSaved = () => {
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
    };

    if (!canEdit) {
        return (
            <div className="p-8">
                <div className="bg-red-50 text-red-600 p-4 rounded-xl font-medium border border-red-100 max-w-2xl mx-auto">
                    You do not have permission to view or edit Studio Settings.
                </div>
            </div>
        );
    }

    if (loading) {
        return <div className="p-8 text-slate-500">Loading settings...</div>;
    }
    
    if (error) {
        return (
            <div className="p-8">
                <div className="bg-rose-50 text-rose-700 p-4 rounded-xl border border-rose-200">
                    <h3 className="font-bold">Error Loading Settings</h3>
                    <p className="text-sm">{error.message}</p>
                </div>
            </div>
        );
    }
    
    if (!settings && activeTab !== 'Branding') {
        return <div className="p-8 text-rose-500">Failed to load settings. Please try refreshing.</div>;
    }

    return (
        <div className="max-w-[1500px] mx-auto animate-fade-in pb-24 md:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 px-4 md:px-0 mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Studio Settings</h1>
                    <p className="text-slate-500">Configure global parameters and workflows for your organization.</p>
                </div>
                {/* Mobile Preview Toggle */}
                <div className="xl:hidden">
                    <button 
                        onClick={() => setShowPreviewMobile(!showPreviewMobile)} 
                        className="px-4 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-lg"
                    >
                        {showPreviewMobile ? 'Hide Preview' : 'Show Live Preview'}
                    </button>
                </div>
            </div>

            <div className="flex flex-col xl:flex-row gap-8 px-4 md:px-0">
                {/* LEFT COLUMN: Settings Form */}
                <div className="flex-1 w-full xl:w-[60%] space-y-6">
                    {/* Horizontal Tabs List */}
                    <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-200 hide-scrollbar">
                        {TABS.map(tab => {
                            if (tab === 'Terms Config' && currentRole !== 'super_admin') return null;
                            return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 font-semibold text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                            >
                                {tab}
                            </button>
                        )})}
                    </div>

                    <div className="mt-6">
                        {activeTab === 'Branding' && (
                            <BrandingTab 
                                data={brandingData} 
                                onChange={handleBrandingChange} 
                                onSave={handleSaveBranding} 
                                isSaved={isSaved} 
                                isDirty={JSON.stringify(brandingData) !== JSON.stringify({
                                    orgName: orgData.orgName || '',
                                    orgLogo: orgData.orgLogo || '',
                                    contactEmail: orgData.contactEmail || '',
                                    contactPhone: orgData.contactPhone || '',
                                    officeAddress: orgData.officeAddress || '',
                                    cityState: orgData.cityState || '',
                                    gstin: orgData.gstin || '',
                                    designFeePercentage: orgData.designFeePercentage || 10,
                                    defaultGstRate: orgData.defaultGstRate || 18,
                                    themeColor: orgData.themeColor || '#4f46e5',
                                    procurementLeadTimeWeeks: orgData.procurementLeadTimeWeeks || 4,
                                    forceMajeureText: orgData.defaultContractWordings?.forceMajeureText || '',
                                    revisionsText: orgData.defaultContractWordings?.revisionsText || '',
                                    paymentTermsText: orgData.defaultContractWordings?.paymentTermsText || '',
                                    clientObsText: orgData.defaultContractWordings?.clientObsText || '',
                                })}
                            />
                        )}
                        {activeTab === 'Process' && settings && (
                            <DesignProcessTab settings={settings} updateSettings={updateSettings} onSaved={showSaved} isSaved={isSaved} onLiveChange={setLiveProcess} />
                        )}
                        {activeTab === 'Fees' && settings && (
                            <FeeStructureTab settings={settings} updateSettings={updateSettings} onSaved={showSaved} isSaved={isSaved} onLiveChange={setLiveFees} />
                        )}
                        {activeTab === 'Payments' && settings && (
                            <PaymentsTab settings={settings} updateSettings={updateSettings} onSaved={showSaved} isSaved={isSaved} onLiveChange={setLivePayments} />
                        )}
                        {activeTab === 'Terms' && settings && (
                            <ProjectTermsTab settings={settings} updateSettings={updateSettings} onSaved={showSaved} isSaved={isSaved} />
                        )}
                        {activeTab === 'Terms Config' && settings && (
                            <TermsConfigTab settings={settings} updateSettings={updateSettings} onSaved={showSaved} isSaved={isSaved} />
                        )}
                        {activeTab === 'Onboarding' && settings && (
                            <OnboardingTab settings={settings} updateSettings={updateSettings} onSaved={showSaved} isSaved={isSaved} />
                        )}
                        {activeTab === 'Communication Templates' && settings && (
                            <CommunicationTemplatesTab settings={settings} updateSettings={updateSettings} onSaved={showSaved} studioId={tenantId} />
                        )}
                        {activeTab === 'Portal' && settings && (
                            <PortalTab settings={settings} updateSettings={updateSettings} onSaved={showSaved} isSaved={isSaved} />
                        )}
                        {activeTab === 'SOF & Changes' && settings && (
                            <SOFAndChangesTab settings={settings} updateSettings={updateSettings} onSaved={showSaved} isSaved={isSaved} />
                        )}
                        {activeTab === 'Platform Admin' && (
                            <div className="bg-white rounded-3xl p-8 border border-slate-200">
                                <h3 className="text-xl font-bold text-slate-800 mb-2">Integrations</h3>
                                <p className="text-sm text-slate-500 mb-6">Authorize or direct external application services.</p>
                                
                                <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 flex items-center justify-between mb-8 gap-4">
                                    <div className="flex gap-4 items-center">
                                        <div className="text-3xl">🗓️</div>
                                       <div>
                                          <h4 className="font-bold text-slate-800 text-sm">
                                            Google Calendar Integration
                                            {isGoogleCalendarConnected() && <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Connected</span>}
                                          </h4>
                                          <p className="text-[11px] text-slate-500">Sync client meetings and logged site surveys automatically.</p>
                                       </div>
                                    </div>
                                    <button 
                                        onClick={async () => {
                                            const success = await connectGoogleCalendar();
                                            if (success) {
                                                // force re-render
                                                setLiveProcess({...liveProcess});
                                                alert("Google Calendar connected successfully!");
                                            } else {
                                                alert("Failed to connect Google Calendar or cancelled.");
                                            }
                                        }}
                                        className={`px-4 py-2 ${isGoogleCalendarConnected() ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-indigo-600 hover:bg-indigo-700 text-white'} rounded-lg font-bold text-xs shrink-0 transition-colors`}
                                    >
                                        {isGoogleCalendarConnected() ? 'Reconnect' : 'Connect Account'}
                                    </button>
                                </div>

                                <h3 className="text-xl font-bold text-slate-800 mb-2 pt-4 border-t border-slate-100">Project Operations</h3>
                                <p className="text-sm text-slate-500 mb-6 font-normal">Manage data portability and clear site session information.</p>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                     <button 
                                         onClick={onDownloadBackup} 
                                         className="p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all text-left flex items-center gap-3 group"
                                     >
                                         <div className="p-2 bg-emerald-50 rounded-lg group-hover:bg-emerald-100 transition-colors">
                                             <Save className="w-5 h-5 text-emerald-600" />
                                         </div>
                                         <div>
                                             <h3 className="font-bold text-slate-800 text-sm">Save Backup</h3>
                                             <p className="text-xs text-slate-500">Download JSON.</p>
                                         </div>
                                     </button>

                                     <label className="p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all text-left flex items-center gap-3 cursor-pointer group">
                                         <input type="file" accept=".json" onChange={onImportProject} className="hidden" />
                                         <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                                             <Upload className="w-5 h-5 text-blue-600" />
                                         </div>
                                         <div>
                                             <h3 className="font-bold text-slate-800 text-sm">Import Project</h3>
                                             <p className="text-xs text-slate-500">Restore from file.</p>
                                         </div>
                                     </label>

                                     <button 
                                         onClick={onClearProject} 
                                         className={`p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all text-left flex items-center gap-3 group ${confirmReset ? 'bg-rose-50 border-rose-200' : ''}`}
                                     >
                                         <div className={`p-2 rounded-lg transition-colors ${confirmReset ? 'bg-rose-100' : 'bg-slate-100'}`}>
                                             <Trash2 className={`w-5 h-5 ${confirmReset ? 'text-rose-600' : 'text-slate-500'}`} />
                                         </div>
                                         <div>
                                             <h3 className={`font-bold transition-colors text-sm ${confirmReset ? 'text-rose-800' : 'text-slate-800'}`}>{confirmReset ? 'Confirm Reset?' : 'Start New'}</h3>
                                             <p className="text-xs text-slate-500">Clear all data.</p>
                                         </div>
                                     </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {isSuperAdmin && activeTab === 'Branding' && (
                        <div className="mt-8">
                            <SuperAdminSwitcher orgData={orgData} updateOrgData={updateOrgData} />
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: Live Preview */}
                <div className={`w-full xl:w-[40%] xl:block ${showPreviewMobile ? 'block mt-8' : 'hidden'}`}>
                    <StudioPreviewPanel 
                        branding={brandingData} 
                        process={liveProcess || settings?.designProcess} 
                        fees={liveFees || settings?.feeStructure} 
                        payments={livePayments || settings?.paymentMilestones} 
                        emails={liveEmails || settings?.emailTemplates}
                        previewMode={previewMode}
                        setPreviewMode={setPreviewMode}
                    />
                </div>
            </div>
            
            <AnimatePresence>
                {isSaved && (
                    <motion.div 
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-8 right-8 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 z-50"
                    >
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <span className="font-bold">Settings Saved Successfully</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ---------------------------------------------------------------------------
// SUB-COMPONENTS FOR EACH TAB
// ---------------------------------------------------------------------------

function SaveButton({ onClick, isDirty }: { onClick: () => void, isDirty?: boolean }) {
    return (
        <div className="flex justify-end pt-6 border-t border-slate-100 items-center gap-4">
            {isDirty && (
                <div className="flex items-center gap-2 text-amber-600 text-sm font-semibold">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span> Unsaved changes
                </div>
            )}
            <button 
                onClick={onClick}
                className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
            >
                Save Section
            </button>
        </div>
    );
}

function SectionWrapper({ title, description, children, onSave, isDirty }: any) {
    return (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
                <p className="text-sm text-slate-500 mt-1">{description}</p>
            </div>
            <div className="p-8 space-y-6">
                {children}
                <SaveButton onClick={onSave} isDirty={isDirty} />
            </div>
        </div>
    );
}

function BrandingTab({ data, onChange, onSave, isSaved, isDirty }: any) {
    return (
        <div className="grid grid-cols-1 gap-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-8 space-y-8">
                    
                    {/* Organization Identity */}
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg mb-4">Organization Identity</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Studio Name</label>
                                <input type="text" name="orgName" value={data.orgName} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Brand Color</label>
                                <div className="flex items-center gap-3">
                                    <input type="color" name="themeColor" value={data.themeColor} onChange={onChange} className="w-12 h-12 rounded cursor-pointer border-0 p-0" />
                                    <span className="text-slate-600 font-mono bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">{data.themeColor}</span>
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Logo</label>
                                <div className="flex items-center gap-4">
                                    {data.orgLogo ? (
                                        <div className="relative w-32 h-16 border rounded-lg overflow-hidden bg-white">
                                            <img src={data.orgLogo} alt="Logo" className="w-full h-full object-contain" />
                                            <button 
                                                onClick={() => onChange({ target: { name: 'orgLogo', value: '', type: 'text' } } as any)} 
                                                className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow-sm hover:text-red-500"
                                                title="Remove Logo"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="w-32 h-16 border border-dashed rounded-lg bg-slate-50 flex items-center justify-center text-xs text-slate-400">
                                            No Logo
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        onChange({ target: { name: 'orgLogo', value: reader.result as string, type: 'text' } } as any);
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }} 
                                            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" 
                                        />
                                        <p className="text-xs text-slate-400 mt-2">Upload a PNG or JPG. Recommended max width 150px, height 60px. Will be embedded in generated documents.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact Information */}
                    <div className="pt-6 border-t border-slate-100">
                        <h3 className="font-bold text-slate-800 text-lg mb-4">Contact Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email</label><input type="email" name="contactEmail" value={data.contactEmail} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone</label><input type="text" name="contactPhone" value={data.contactPhone} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">City & State</label><input type="text" name="cityState" value={data.cityState} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">GSTIN</label><input type="text" name="gstin" value={data.gstin} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Office Address</label><textarea name="officeAddress" value={data.officeAddress} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none h-20" /></div>
                        </div>
                    </div>

                    {/* Financial Defaults */}
                    <div className="pt-6 border-t border-slate-100">
                        <h3 className="font-bold text-slate-800 text-lg mb-4">Legacy Financial & Procurement</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Default GST Rate (%)</label><input type="number" name="defaultGstRate" value={data.defaultGstRate} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Design Fee (%)</label><input type="number" name="designFeePercentage" value={data.designFeePercentage} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Lead Time (Weeks)</label><input type="number" name="procurementLeadTimeWeeks" value={data.procurementLeadTimeWeeks} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                        </div>
                    </div>

                    {/* Legacy Contract Wordings */}
                    <div className="pt-6 border-t border-slate-100">
                        <h3 className="font-bold text-slate-800 text-lg mb-4">Legacy Defaults</h3>
                        <p className="text-xs text-slate-400 mb-4">Please note that for new features you should use the Tabs configuring the new Project Terms.</p>
                        <div className="grid grid-cols-1 gap-5">
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Force Majeure Wordings</label><textarea name="forceMajeureText" value={data.forceMajeureText} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none h-20" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Revisions Wordings</label><textarea name="revisionsText" value={data.revisionsText} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none h-20" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Payment Terms</label><textarea name="paymentTermsText" value={data.paymentTermsText} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none h-20" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Client Obligations</label><textarea name="clientObsText" value={data.clientObsText} onChange={onChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none h-20" /></div>
                        </div>
                    </div>


                </div>
                <div className="px-8 pb-8 pt-4">
                    <SaveButton onClick={onSave} isDirty={isDirty} />
                </div>
            </div>
        </div>
    );
}

function DesignProcessTab({ settings, updateSettings, onSaved, isSaved, onLiveChange }: { settings: any, updateSettings: any, onSaved: any, isSaved?: boolean, onLiveChange?: any }) {
    const [data, setData] = useState(settings.designProcess || { steps: [] });
    const isDirty = JSON.stringify(data) !== JSON.stringify(settings.designProcess || {steps: []});
    
    React.useEffect(() => { if(onLiveChange) onLiveChange(data); }, [data, onLiveChange]);
    
    const availableMilestones = settings.paymentMilestones?.milestones || [];
    const usedMilestones = data.steps.map((st: any) => st.triggersMilestoneLabel).filter(Boolean);

    const addStep = () => {
        setData((prev: any) => ({
            ...prev,
            steps: [...prev.steps, { stepNumber: prev.steps.length + 1, title: '', description: '', deliverables: [], triggersMilestoneLabel: null }]
        }));
    };

    const updateStep = (index: number, field: string, value: any) => {
        const newSteps = [...data.steps];
        newSteps[index][field] = value;
        setData({ ...data, steps: newSteps });
    };

    const totalEstimatedDays = data.steps.reduce((acc: number, step: any) => acc + (step.defaultDuration || 0), 0);

    return (
        <SectionWrapper 
            title="Design Process" 
            description="Define the overarching steps in your studio's design workflow."
            onSave={() => { updateSettings('designProcess', { ...data, totalSteps: data.steps.length }); onSaved(); }}
            isDirty={isDirty}
        >
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Process Summary (For Proposals)</label>
                <textarea rows={3} value={data.processSummary} onChange={e => setData({...data, processSummary: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl resize-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            
            <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Process Steps</label>
                    {totalEstimatedDays > 0 && (
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                            Total estimated project duration: {totalEstimatedDays} days ({Math.round((totalEstimatedDays / 30) * 10) / 10} months)
                        </span>
                    )}
                </div>
                {data.steps.map((st: any, i: number) => (
                    <div key={i} className="flex gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <div className="flex-none font-bold text-slate-400 text-lg w-6 flex justify-center">{st.stepNumber}</div>
                        <div className="flex-1 space-y-3">
                            <input placeholder="Step Title" value={st.title} onChange={e => updateStep(i, 'title', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                            <input placeholder="Description" value={st.description} onChange={e => updateStep(i, 'description', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                            <input placeholder="Deliverables (comma separated)" value={(st.deliverables||[]).join(', ')} onChange={e => updateStep(i, 'deliverables', e.target.value.split(',').map((s:string)=>s.trim()))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                            
                            <div className="pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Default duration (days)</label>
                                    <p className="text-[10px] text-slate-400 mb-2">Used to auto-generate project timelines. Can be adjusted per project.</p>
                                    <input 
                                        type="number" 
                                        min="1" 
                                        max="365"
                                        placeholder="e.g. 14"
                                        value={st.defaultDuration || ''} 
                                        onChange={e => updateStep(i, 'defaultDuration', Number(e.target.value) || undefined)} 
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Triggers Payment Milestone</label>
                                    <p className="text-[10px] text-slate-400 mb-2">When this step is completed, the selected payment milestone will be raised.</p>
                                    <select 
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={st.triggersMilestoneLabel || ''}
                                        onChange={e => updateStep(i, 'triggersMilestoneLabel', e.target.value || null)}
                                    >
                                        <option value="">None — no payment triggered</option>
                                        {availableMilestones.map((m: any) => {
                                            const isUsed = usedMilestones.includes(m.label);
                                            const isCurrent = st.triggersMilestoneLabel === m.label;
                                            return (
                                                <option key={m.label} value={m.label} disabled={isUsed && !isCurrent}>
                                                    {m.label} {isUsed && !isCurrent ? `(already mapped)` : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => {
                            const newSteps = [...data.steps];
                            newSteps.splice(i, 1);
                            newSteps.forEach((s, idx) => s.stepNumber = idx + 1);
                            setData({...data, steps: newSteps});
                        }} className="text-red-400 hover:text-red-600"><Trash2 className="w-5 h-5"/></button>
                    </div>
                ))}
                <button onClick={addStep} className="flex items-center gap-2 text-sm text-indigo-600 font-bold bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100"><Plus className="w-4 h-4"/> Add Step</button>
            </div>
        </SectionWrapper>
    );
}

function FeeStructureTab({ settings, updateSettings, onSaved, isSaved, onLiveChange }: any) {
    const [data, setData] = useState(settings.feeStructure || {});
    const isDirty = JSON.stringify(data) !== JSON.stringify(settings.feeStructure || {});
    React.useEffect(() => { if(onLiveChange) onLiveChange(data); }, [data, onLiveChange]);

    return (
        <SectionWrapper title="Fee Structure" description="Configure minimum and maximum fee percentages for design." onSave={() => { updateSettings('feeStructure', data); onSaved(); }} isDirty={isDirty}>
            <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-xs font-bold text-slate-500 uppercase">Min Design Fee (%)</label><input type="number" value={data.designFeeMin} onChange={e=>setData({...data, designFeeMin: Number(e.target.value)})} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase">Max Design Fee (%)</label><input type="number" value={data.designFeeMax} onChange={e=>setData({...data, designFeeMax: Number(e.target.value)})} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
            </div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase">Fee Note</label><textarea value={data.feeNote} onChange={e=>setData({...data, feeNote: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl h-20 resize-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
            <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-xs font-bold text-slate-500 uppercase">Revision Policy</label><textarea value={data.revisionPolicy} onChange={e=>setData({...data, revisionPolicy: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl h-20 resize-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase">Site Visit Policy</label><textarea value={data.siteVisitPolicy} onChange={e=>setData({...data, siteVisitPolicy: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl h-20 resize-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
            </div>
        </SectionWrapper>
    );
}

function PaymentsTab({ settings, updateSettings, onSaved, isSaved, onLiveChange }: any) {
    const [data, setData] = useState(settings.paymentMilestones || { milestones: [] });
    const isDirty = JSON.stringify(data) !== JSON.stringify(settings.paymentMilestones || { milestones: [] });
    React.useEffect(() => { if(onLiveChange) onLiveChange(data); }, [data, onLiveChange]);
    
    const addMilestone = () => {
        setData((prev: any) => ({
            ...prev,
            milestones: [...prev.milestones, { label: '', percent: 0, trigger: '', description: '' }]
        }));
    };

    const total = (data.milestones || []).reduce((acc: number, m: any) => acc + (m.percent || 0), 0);
    const valid = total === 100;

    return (
        <SectionWrapper 
            title="Payment Milestones" 
            description="Define standard payment tranches."
            onSave={() => { 
                if(!valid) { alert('Milestone percentages must equal 100'); return; }
                const eSettings = data.escalation;
                if(eSettings) {
                    if (eSettings.reminderDays >= eSettings.warnDays || eSettings.warnDays >= eSettings.pauseDays) {
                        alert('Escalation days must be strictly increasing: Reminder < At Risk < Pause');
                        return;
                    }
                }
                updateSettings('paymentMilestones', {...data, totalMustEqual100: true}); 
                onSaved(); 
            }}
            isDirty={isDirty}
        >
            <div className="mb-4 flex items-center justify-between bg-slate-50 p-4 border border-slate-200 rounded-xl">
                <span className={`text-sm font-bold px-3 py-1 rounded-lg ${valid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    Total: {total}% {valid ? '(Valid)' : '(Must equal 100%)'}
                </span>
            </div>
            <div className="space-y-4">
                {data.milestones.map((m: any, i: number) => (
                    <div key={i} className="flex gap-4 items-center bg-slate-50 p-4 border border-slate-100 rounded-xl">
                        <div className="flex-1 space-y-2">
                             <div className="flex gap-4">
                                <input placeholder="Label (e.g. Booking)" value={m.label} onChange={e => { const nm = [...data.milestones]; nm[i].label = e.target.value; setData({...data, milestones: nm})}} className="w-1/3 px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                                <input type="number" placeholder="%" value={m.percent} onChange={e => { const nm = [...data.milestones]; nm[i].percent = Number(e.target.value); setData({...data, milestones: nm})}} className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                                <input placeholder="Trigger condition" value={m.trigger} onChange={e => { const nm = [...data.milestones]; nm[i].trigger = e.target.value; setData({...data, milestones: nm})}} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                             </div>
                             <input placeholder="Description" value={m.description} onChange={e => { const nm = [...data.milestones]; nm[i].description = e.target.value; setData({...data, milestones: nm})}} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                        <button onClick={() => { const nm = [...data.milestones]; nm.splice(i, 1); setData({...data, milestones: nm})}} className="text-red-400 hover:text-red-600"><Trash2 className="w-5 h-5"/></button>
                    </div>
                ))}
                <button onClick={addMilestone} className="flex items-center gap-2 text-sm text-indigo-600 font-bold bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100"><Plus className="w-4 h-4"/> Add Milestone</button>
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-100 space-y-6">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Legal Payment Note</label>
                    <textarea value={data.paymentNote || ''} onChange={e=>setData({...data, paymentNote: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl h-20 resize-none text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <h4 className="text-sm font-bold text-slate-800 mb-4">Payment Escalation Protocol</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div>
                            <label className="block text-xs font-bold text-amber-600 uppercase mb-2">Level 1: Reminder (Days)</label>
                            <input type="number" min="1" value={data.escalation?.reminderDays || 3} onChange={e=>setData({...data, escalation: { ...(data.escalation || {}), reminderDays: Number(e.target.value) }})} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                            <p className="text-[10px] text-slate-500 mt-1">Send first reminder after</p>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-orange-600 uppercase mb-2">Level 2: At Risk (Days)</label>
                            <input type="number" min="1" value={data.escalation?.warnDays || 7} onChange={e=>setData({...data, escalation: { ...(data.escalation || {}), warnDays: Number(e.target.value) }})} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                            <p className="text-[10px] text-slate-500 mt-1">Flag as 'At Risk'</p>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-red-600 uppercase mb-2">Level 3: Pause (Days)</label>
                            <input type="number" min="1" value={data.escalation?.pauseDays || 14} onChange={e=>setData({...data, escalation: { ...(data.escalation || {}), pauseDays: Number(e.target.value) }})} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                            <p className="text-[10px] text-slate-500 mt-1">Show 'Work Pause Advisory'</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-white p-4 border border-slate-200 rounded-xl">
                        <input 
                            type="checkbox" 
                            id="autoSendReminder" 
                            checked={data.escalation?.autoSendReminder || false} 
                            onChange={e=>setData({...data, escalation: { ...(data.escalation || {}), autoSendReminder: e.target.checked }})} 
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" 
                        />
                        <div className="flex flex-col">
                            <label htmlFor="autoSendReminder" className="text-sm font-bold text-slate-800">Automatically prepare WhatsApp reminder at Day {data.escalation?.reminderDays || 3}</label>
                            <p className="text-xs text-amber-600 mt-0.5">Only enable this if you have verified your client's WhatsApp number in all projects.</p>
                        </div>
                    </div>
                </div>
            </div>
        </SectionWrapper>
    );
}

function ProjectTermsTab({ settings, updateSettings, onSaved, isSaved }: any) {
    const [data, setData] = useState(settings.projectTerms || { standardInclusions: [], standardExclusions: [], contractClauses: [] });
    const isDirty = JSON.stringify(data) !== JSON.stringify(settings.projectTerms || { standardInclusions: [], standardExclusions: [], contractClauses: [] });
    
    return (
        <SectionWrapper title="Project Terms" description="Standard inclusions, exclusions, and warranty clauses." onSave={() => { updateSettings('projectTerms', data); onSaved(); }} isDirty={isDirty}>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Warranty Period</label>
                <input type="text" value={data.warrantyPeriod} onChange={e=>setData({...data, warrantyPeriod: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. 1 year from handover" />
            </div>
            <div className="grid grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Standard Inclusions (comma separated)</label>
                    <textarea value={data.standardInclusions?.join(', ') || ''} onChange={e=>setData({...data, standardInclusions: e.target.value.split(',').map((s:string)=>s.trim())})} className="w-full px-4 py-3 border border-slate-200 rounded-xl h-24 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Standard Exclusions (comma separated)</label>
                    <textarea value={data.standardExclusions?.join(', ') || ''} onChange={e=>setData({...data, standardExclusions: e.target.value.split(',').map((s:string)=>s.trim())})} className="w-full px-4 py-3 border border-slate-200 rounded-xl h-24 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
            </div>
            <div className="pt-6 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Contract Clauses</label>
                <div className="space-y-4">
                    {data.contractClauses?.map((c: any, o: number) => (
                        <div key={o} className="flex gap-4 p-4 border border-slate-200 rounded-xl bg-slate-50 items-start">
                            <div className="flex-1 space-y-2">
                                <input placeholder="Clause Title" value={c.clauseTitle} onChange={e => { const nc = [...data.contractClauses]; nc[o].clauseTitle = e.target.value; setData({...data, contractClauses: nc})}} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                                <textarea placeholder="Clause Text" value={c.clauseText} onChange={e => { const nc = [...data.contractClauses]; nc[o].clauseText = e.target.value; setData({...data, contractClauses: nc})}} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm h-16 focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                            <button onClick={() => { const nc = [...data.contractClauses]; nc.splice(o, 1); setData({...data, contractClauses: nc})}} className="text-red-400 mt-2 hover:text-red-600"><Trash2 className="w-5 h-5"/></button>
                        </div>
                    ))}
                    <button onClick={() => setData({...data, contractClauses: [...(data.contractClauses||[]), {clauseTitle: '', clauseText: ''}]})} className="flex items-center gap-2 text-sm text-indigo-600 font-bold bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100"><Plus className="w-4 h-4"/> Add Clause</button>
                </div>
            </div>
        </SectionWrapper>
    );
}

function CommunicationTemplateTab({ settings, updateSettings, onSaved, isSaved }: any) {
    const [data, setData] = useState(settings.communicationTemplate || []);
    const isDirty = JSON.stringify(data) !== JSON.stringify(settings.communicationTemplate || []);
    
    // Helper to group by phase for display
    const groups = data.reduce((acc: any, item: any, idx: number) => {
        if (!acc[item.phase]) acc[item.phase] = [];
        acc[item.phase].push({ ...item, originalIndex: idx });
        return acc;
    }, {});

    const handleUpdate = (originalIndex: number, field: string, value: any) => {
        const newData = [...data];
        newData[originalIndex] = { ...newData[originalIndex], [field]: value };
        setData(newData);
    };

    return (
        <SectionWrapper title="Communication Template" description="Configure standard client emails. Toggle required tracking, edit titles, and reorder." onSave={() => { updateSettings('communicationTemplate', data); onSaved(); }} isDirty={isDirty}>
            <div className="space-y-8 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {Object.entries(groups).map(([phase, items]: [string, any]) => (
                    <div key={phase} className="mb-6">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">{phase} Phase</h3>
                        <div className="space-y-3">
                            {items.map((item: any) => (
                                <div key={item.id} className="flex flex-col md:flex-row md:items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4 transition-all hover:bg-white hover:shadow-sm">
                                    <div className="flex-1 flex flex-col gap-2">
                                        <div className="flex gap-4">
                                            <div className="w-1/3">
                                                 <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Title</label>
                                                 <input value={item.title} onChange={e => handleUpdate(item.originalIndex, 'title', e.target.value)} className="w-full text-sm font-semibold bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-none" />
                                            </div>
                                            <div className="w-2/3">
                                                 <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description (Internal)</label>
                                                 <input value={item.description} onChange={e => handleUpdate(item.originalIndex, 'description', e.target.value)} className="w-full text-sm text-slate-600 bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-none" />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-wrap items-center gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-200">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={item.isRequired} 
                                                onChange={e => handleUpdate(item.originalIndex, 'isRequired', e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" 
                                            />
                                            <span className="text-xs font-bold text-slate-700">Required</span>
                                        </label>

                                        {item.linkedFeature && (
                                            <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border border-indigo-100">
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> Auto-link: {item.linkedFeature}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                
            </div>
            
            <div className="mt-6 flex flex-col md:flex-row justify-between items-center bg-blue-50/50 p-4 border border-blue-100 rounded-xl space-y-4 md:space-y-0">
                <p className="text-xs text-blue-800 font-medium max-w-2xl leading-relaxed">
                    <strong>Auto-linked items</strong> automatically check for triggers in the project (like payment markers or proposal status). Even if disabled/changed here, the system maps to the <code className="px-1 py-0.5 bg-blue-100 rounded text-blue-900 border border-blue-200">{`id`}</code> value.
                </p>
                {data.length === 0 && (
                     <div className="text-xs text-rose-500 font-bold bg-rose-50 p-2 rounded-lg border border-rose-200">
                         No templates loaded. Check database defaults.
                     </div>
                )}
            </div>
        </SectionWrapper>
    );
}

function OnboardingTab({ settings, updateSettings, onSaved, isSaved }: any) {
    const [data, setData] = useState(settings.onboardingProcess || { steps: [], kickoffChecklist: [] });
    const isDirty = JSON.stringify(data) !== JSON.stringify(settings.onboardingProcess || { steps: [], kickoffChecklist: [] });
    
    return (
        <SectionWrapper title="Onboarding Process" description="Manage welcome steps and kickoff checklist for new clients." onSave={() => { updateSettings('onboardingProcess', data); onSaved(); }} isDirty={isDirty}>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Welcome Message</label>
                <textarea value={data.welcomeMessage} onChange={e=>setData({...data, welcomeMessage: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl h-24 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Kickoff Checklist (comma separated)</label>
                <textarea value={(data.kickoffChecklist||[]).join(', ')} onChange={e=>setData({...data, kickoffChecklist: e.target.value.split(',').map((s:string)=>s.trim())})} className="w-full px-4 py-3 border border-slate-200 rounded-xl h-24 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
        </SectionWrapper>
    );
}

function EmailTemplatesTab({ settings, updateSettings, onSaved, isSaved, onLiveChange }: any) {
    const [data, setData] = useState(settings.emailTemplates || {});
    const [previewKey, setPreviewKey] = useState<string | null>(null);
    const isDirty = JSON.stringify(data) !== JSON.stringify(settings.emailTemplates || {});
    React.useEffect(() => { if(onLiveChange) onLiveChange(data); }, [data, onLiveChange]);

    const fields = [
        { key: 'proposalIntro', label: 'Proposal Intro' },
        { key: 'onboardingWelcome', label: 'Onboarding Welcome' },
        { key: 'paymentRequest', label: 'Payment Request/WhatsApp Nudge', hasPreview: true },
        { key: 'projectUpdate', label: 'Project Update' },
        { key: 'handoverNote', label: 'Handover Note' },
    ];
    
    return (
        <SectionWrapper title="Email & Message Templates" description="Standardize communication copy." onSave={() => { updateSettings('emailTemplates', data); onSaved(); }} isDirty={isDirty}>
            <p className="text-xs text-slate-400 mb-6 bg-slate-100 p-3 rounded-lg border border-slate-200">Available Variables: <code className="text-indigo-600 font-bold bg-white px-1 py-0.5 rounded">{"{clientName}"}</code>, <code className="text-indigo-600 font-bold bg-white px-1 py-0.5 rounded">{"{projectName}"}</code>, <code className="text-indigo-600 font-bold bg-white px-1 py-0.5 rounded">{"{studioName}"}</code>, <code className="text-indigo-600 font-bold bg-white px-1 py-0.5 rounded">{"{amount}"}</code>, <code className="text-indigo-600 font-bold bg-white px-1 py-0.5 rounded">{"{milestone}"}</code>, <code className="text-indigo-600 font-bold bg-white px-1 py-0.5 rounded">{"{daysPending}"}</code>, <code className="text-indigo-600 font-bold bg-white px-1 py-0.5 rounded">{"{supportContact}"}</code></p>
            <div className="grid grid-cols-1 gap-6">
                {fields.map(f => (
                    <div key={f.key}>
                        <div className="flex justify-between items-end mb-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase">{f.label}</label>
                            {f.hasPreview && (
                                <button 
                                    onClick={() => setPreviewKey(previewKey === f.key ? null : f.key)}
                                    className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded"
                                >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    {previewKey === f.key ? 'Hide Preview' : 'WhatsApp Preview'}
                                </button>
                            )}
                        </div>
                        
                        <div className="flex flex-col lg:flex-row gap-4">
                            <textarea 
                                value={data[f.key] || ''} 
                                onChange={e=>setData({...data, [f.key]: e.target.value})} 
                                className="w-full lg:flex-1 px-4 py-3 border border-slate-200 rounded-xl h-24 resize-none text-sm text-slate-700 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium" 
                            />
                            
                            {previewKey === f.key && (
                                <div className="w-full lg:w-72 bg-slate-100/50 rounded-xl border border-slate-200 p-4 shrink-0 flex flex-col">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Live Preview</p>
                                    <div className="bg-[#E7F6D5] p-3 rounded-2xl rounded-tr-none text-sm text-slate-800 shadow-sm border border-[#D1ECA6] whitespace-pre-wrap leading-snug self-end min-w-[80%] max-w-full">
                                        {renderPaymentReminderMessage(data[f.key] || "Hi {clientName}, this is a gentle reminder that payment for {milestone} (₹{amount}) is due for your {projectName} project. Please let us know once processed. Thank you! — {studioName}", {
                                            clientName: 'Rahul',
                                            projectName: 'Villa 44',
                                            studioName: 'FFDS',
                                            amount: '2,50,000',
                                            milestone: '50% Exec',
                                            daysPending: '3',
                                            supportContact: 'billing@ffds.in'
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </SectionWrapper>
    );
}

function PortalTab({ settings, updateSettings, onSaved, isSaved }: any) {
    const [data, setData] = useState(settings.clientPortalConfig || {});
    const isDirty = JSON.stringify(data) !== JSON.stringify(settings.clientPortalConfig || {});
    
    return (
        <SectionWrapper title="Client Portal Configuration" description="Client-facing presentation features." onSave={() => { updateSettings('clientPortalConfig', data); onSaved(); }} isDirty={isDirty}>
            <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Portal Title</label><input type="text" value={data.portalTitle} onChange={e=>setData({...data, portalTitle: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Support Contact</label><input type="text" value={data.supportContact} onChange={e=>setData({...data, supportContact: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Introductory Message</label>
                <textarea value={data.introMessage} onChange={e=>setData({...data, introMessage: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl h-24 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div className="flex flex-col md:flex-row gap-6 mt-4 p-4 border border-slate-200 rounded-xl bg-slate-50">
                <label className="flex items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={data.showTimeline} onChange={e=>setData({...data, showTimeline: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded" /> Show Timeline</label>
                <label className="flex items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={data.showPayments} onChange={e=>setData({...data, showPayments: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded" /> Show Payments</label>
                <label className="flex items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={data.showDocuments} onChange={e=>setData({...data, showDocuments: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded" /> Show Documents</label>
            </div>
        </SectionWrapper>
    );
}

function SuperAdminSwitcher({ orgData, updateOrgData }: any) {
    return (
        <div className="mt-12 bg-slate-50 rounded-2xl shadow-sm border border-slate-200 overflow-hidden max-w-2xl">
            <div className="p-6">
                <h2 className="font-bold text-slate-800">Switch Studio Workspace (Super Admin)</h2>
                <div className="flex gap-4 mb-4 mt-4">
                    <input
                        type="text"
                        placeholder="Enter Tenant ID (e.g., tenant_abc123)"
                        className="px-4 py-2.5 border border-slate-300 rounded-xl flex-1 text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                        id="switchTenantInput"
                    />
                    <button
                        onClick={() => {
                            const el = document.getElementById('switchTenantInput') as HTMLInputElement;
                            if (el?.value?.trim()) {
                                updateOrgData({ ...orgData, tenantId: el.value.trim(), orgName: 'Joined Studio' });
                                window.location.reload();
                            }
                        }}
                        className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 transition-colors text-white font-medium rounded-xl text-sm"
                    >
                        Switch Tenant
                    </button>
                </div>
            </div>
        </div>
    );
}

function SOFAndChangesTab({ settings, updateSettings, onSaved, isSaved }: any) {
    const defaultData = { changeRequestSignoffThreshold: 5000, allowZeroCostChanges: true, changeRequestNote: 'All change requests are subject to revised timeline and cost approval.' };
    const [data, setData] = useState(settings.sofSettings || defaultData);
    const isDirty = JSON.stringify(data) !== JSON.stringify(settings.sofSettings || defaultData);
    
    return (
        <SectionWrapper title="Change Request Configuration" description="Manage thresholds and rules for site change requests." onSave={() => { updateSettings('sofSettings', data); onSaved(); }} isDirty={isDirty}>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Auto-route for client sign-off when change exceeds ₹</label>
                <input type="number" min="0" value={data.changeRequestSignoffThreshold || 0} onChange={e=>setData({...data, changeRequestSignoffThreshold: Number(e.target.value)})} className="w-full max-w-[200px] px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            
            <div className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl bg-slate-50">
                <input type="checkbox" checked={data.allowZeroCostChanges !== false} onChange={e=>setData({...data, allowZeroCostChanges: e.target.checked})} className="w-5 h-5 accent-indigo-600 rounded" />
                <label className="text-sm font-bold text-slate-700">Allow change requests with ₹0 cost impact</label>
            </div>

            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Standard note included on all change request communications</label>
                <textarea value={data.changeRequestNote || ''} onChange={e=>setData({...data, changeRequestNote: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl h-24 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
            </div>
        </SectionWrapper>
    );
}

function StudioPreviewPanel({ 
    branding, 
    process, 
    fees, 
    payments, 
    emails, 
    previewMode, 
    setPreviewMode 
}: any) {
    const modes = ['Cover', 'How We Work', 'Investment Overview', 'Email Template'];
    
    // empty state helpers
    const val = (v: any, placeholder: string) => {
        if (!v || (typeof v === 'string' && !v.trim())) {
            return <span className="text-amber-500 border border-amber-300 border-dashed rounded px-1 bg-amber-50 font-medium italic">{`[${placeholder}]`}</span>;
        }
        return v;
    };

    return (
        <div className="sticky top-8 flex flex-col xl:h-[calc(100vh-8rem)]">
            <div className="flex items-center gap-2 mb-4 bg-white p-2 rounded-xl border border-slate-200 overflow-x-auto hide-scrollbar shrink-0 shadow-sm">
                {modes.map(m => (
                    <button 
                        key={m}
                        onClick={() => setPreviewMode(m)}
                        className={`whitespace-nowrap px-4 py-2 text-sm font-bold rounded-lg transition-colors ${previewMode === m ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
                    >
                        {m}
                    </button>
                ))}
            </div>

            <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col relative h-[600px] xl:h-auto">
                <div className="bg-slate-100 h-8 border-b border-slate-200 flex items-center px-4 shrink-0">
                    <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                    </div>
                    <div className="mx-auto text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Proposal Preview</div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 bg-slate-50 relative">
                    {previewMode === 'Cover' && (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-8 min-h-[400px]">
                            <div className="w-32 h-32 bg-white rounded-3xl shadow-md border border-slate-100 flex items-center justify-center overflow-hidden p-4">
                                {branding?.orgLogo ? (
                                    <img src={branding.orgLogo} alt="Logo" className="max-w-full max-h-full object-contain" />
                                ) : (
                                    val('', 'Logo not set')
                                )}
                            </div>
                            <div className="space-y-4 max-w-sm">
                                <h1 className="text-3xl font-black tracking-tight" style={{ color: branding?.themeColor || '#000' }}>
                                    {val(branding?.orgName, 'Company name not set')}
                                </h1>
                                <p className="text-slate-500 leading-relaxed font-medium">
                                    Project Proposal & Estimate
                                </p>
                            </div>
                            <div className="absolute bottom-8 text-xs font-medium text-slate-400 uppercase tracking-widest">
                                Powered by BOQ Copilot
                            </div>
                        </div>
                    )}
                    
                    {previewMode === 'How We Work' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight" style={{ color: branding?.themeColor || '#000' }}>How We Work</h2>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                {val(process?.processSummary, 'No process summary defined')}
                            </p>
                            
                            <div className="space-y-4 mt-6">
                                {(!process?.steps || process.steps.length === 0) ? (
                                    <div className="p-6 border-2 border-dashed border-amber-300 rounded-xl bg-amber-50 text-amber-700 text-sm font-medium text-center">
                                        [No process steps defined]
                                    </div>
                                ) : (
                                    process.steps.map((st: any, i: number) => (
                                        <div key={i} className="flex gap-4 items-start bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: branding?.themeColor || '#4f46e5' }}>
                                                {st.stepNumber || i + 1}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-sm">{val(st.title, 'Step title')}</h4>
                                                <p className="text-xs text-slate-500 mt-1">{val(st.description, 'Step description')}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                    
                    {previewMode === 'Investment Overview' && (
                        <div className="space-y-8">
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight border-b border-slate-200 pb-4" style={{ color: branding?.themeColor || '#000' }}>Investment Overview</h2>
                            
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Design Fees</h3>
                                <div className="text-3xl font-black text-slate-800">
                                    {(fees?.designFeeMin !== undefined || fees?.designFeeMax !== undefined) ? 
                                        `${fees?.designFeeMin ?? '?'}% - ${fees?.designFeeMax ?? '?'}%` : 
                                        val('', 'Fee range not set')}
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    {val(fees?.feeNote, 'No fee note defined')}
                                </p>
                            </div>
                            
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Payment Milestones</h3>
                                {(!payments?.milestones || payments.milestones.length === 0) ? (
                                    <div className="p-6 border-2 border-dashed border-amber-300 rounded-xl bg-amber-50 text-amber-700 text-sm font-medium text-center">
                                        [No payment milestones defined]
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {payments.milestones.map((m: any, i: number) => (
                                            <div key={i} className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                                <div>
                                                    <div className="font-bold text-slate-800 text-sm">{val(m.label, 'Milestone label')}</div>
                                                    <div className="text-xs text-slate-500 mt-0.5">{val(m.trigger, 'Trigger condition')}</div>
                                                </div>
                                                <div className="text-lg font-black" style={{ color: branding?.themeColor || '#4f46e5' }}>
                                                    {m.percent ?? 0}%
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {previewMode === 'Email Template' && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-bold text-slate-800">Proposal Intro Email</h2>
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 font-mono text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                                {val(emails?.proposalIntro, 'Proposal Intro Email Template empty')}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
