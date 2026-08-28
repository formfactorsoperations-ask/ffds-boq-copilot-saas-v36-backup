import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrg } from '../../contexts/OrgContext';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import { 
    Plus, Trash2, CheckCircle2, MessageSquare, Save, Upload, 
    Sparkles, Building2, CreditCard, Scale, ShieldCheck, ChevronDown, 
    ChevronUp, Palette, Type, LayoutGrid, QrCode, History, Globe, 
    Calendar, Lock, FileText, Check, ExternalLink, RefreshCw, Layers
} from 'lucide-react';
import { renderPaymentReminderMessage } from '../../lib/whatsappUtils';
import { connectGoogleCalendar, isGoogleCalendarConnected } from '../../services/googleCalendarService';
import CommunicationTemplatesTab from '../ops/CommunicationTemplatesTab';
import TermsAndPaymentTab from './TermsAndPaymentTab';

interface StudioSettingsTabProps {
    initialTab?: string;
    onDownloadBackup?: () => void;
    onImportProject?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearProject?: () => void;
    confirmReset?: boolean;
}

// Global Personalization Helper
function applyPersonalizationSettings(font: string, theme: string, compact: boolean) {
    localStorage.setItem('ffds_global_font', font);
    localStorage.setItem('ffds_global_theme', theme);
    localStorage.setItem('ffds_compact_mode', compact ? 'true' : 'false');

    document.body.classList.remove('font-jakarta', 'font-[#0066CC]', 'theme-milky-white', 'theme-dark-blue', 'theme-light-blue', 'theme-light-orange', 'layout-compact');

    if (theme === 'dark-blue') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    if (compact) {
        document.body.classList.add('layout-compact');
    }

    window.dispatchEvent(new Event('ffds_personalization_change'));
}

export default function StudioSettingsTab({
    initialTab,
    onDownloadBackup,
    onImportProject,
    onClearProject,
    confirmReset
}: StudioSettingsTabProps = {}) {
    const { orgData, updateOrgData, currentRole, currentUserAuth } = useOrg();
    
    // Authorization check
    const canEdit = currentRole === 'Admin' || currentRole === 'Ops Director' || currentRole === 'Super Admin';
    const isSuperAdmin = currentUserAuth?.email === 'formfactors.operations@gmail.com';
    const tenantId = orgData.tenantId || 'demo-tenant-01';

    const { settings, updateSettings, loading, error } = useStudioSettings(tenantId);

    // Accordion expand/collapse state: 'all' or specific section id
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        personalization: true,
        branding: false,
        financials: false,
        contracts: false,
        portal: false,
        admin: false
    });

    const toggleSection = (id: string) => {
        setOpenSections(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const expandAll = () => {
        setOpenSections({
            personalization: true,
            branding: true,
            financials: true,
            contracts: true,
            portal: true,
            admin: true
        });
    };

    const collapseAll = () => {
        setOpenSections({
            personalization: false,
            branding: false,
            financials: false,
            contracts: false,
            portal: false,
            admin: false
        });
    };

    const [previewMode, setPreviewMode] = useState('Cover');
    const [showPreviewMobile, setShowPreviewMobile] = useState(false);

    // Personalization Local State
    const [selectedFont, setSelectedFont] = useState(() => localStorage.getItem('ffds_global_font') || 'jakarta');
    const [selectedTheme, setSelectedTheme] = useState(() => localStorage.getItem('ffds_global_theme') || 'milky-white');
    const [isCompact, setIsCompact] = useState(() => localStorage.getItem('ffds_compact_mode') === 'true');

    // Branding Local State
    const [brandingData, setBrandingData] = useState({
        orgName: orgData.orgName || '',
        orgLogo: orgData.orgLogo || '',
        contactEmail: orgData.contactEmail || '',
        contactPhone: orgData.contactPhone || '',
        officeAddress: orgData.officeAddress || '',
        cityState: orgData.cityState || '',
        gstin: orgData.gstin || '',
        legalName: orgData.legalName || '',
        signatoryName: orgData.signatoryName || '',
        signatoryTitle: orgData.signatoryTitle || '',
        tagline: orgData.tagline || '',
        designFeePercentage: orgData.designFeePercentage || 10,
        defaultGstRate: orgData.defaultGstRate || 18,
        themeColor: orgData.themeColor || '#0066CC',
        procurementLeadTimeWeeks: orgData.procurementLeadTimeWeeks || 4,
        forceMajeureText: orgData.defaultContractWordings?.forceMajeureText || '',
        revisionsText: orgData.defaultContractWordings?.revisionsText || '',
        paymentTermsText: orgData.defaultContractWordings?.paymentTermsText || '',
        clientObsText: orgData.defaultContractWordings?.clientObsText || '',
    });

    // Bank Details Local State
    const [bankData, setBankData] = useState({
        accountName: orgData.bankDetails?.accountName || '',
        bankName: orgData.bankDetails?.bankName || '',
        accountNumber: orgData.bankDetails?.accountNumber || '',
        ifscCode: orgData.bankDetails?.ifscCode || '',
        upiId: orgData.bankDetails?.upiId || '',
        qrCodeImage: orgData.bankDetails?.qrCodeImage || '',
    });

    // Audit Log History State
    const [auditLogs, setAuditLogs] = useState([
        { id: '1', action: 'Studio Settings Initialization', user: currentUserAuth?.email || 'admin@ffds.in', timestamp: 'Just now', badge: 'System' },
        { id: '2', action: 'GSTIN & Legal Entity Profile Sync', user: 'formfactors.operations@gmail.com', timestamp: 'Today, 10:15 AM', badge: 'Verified' },
        { id: '3', action: 'App Personalization Preferences Applied', user: 'Design Director', timestamp: 'Yesterday', badge: 'Theme' }
    ]);

    const [isSaved, setIsSaved] = useState(false);

    const addAuditLog = (action: string) => {
        setAuditLogs(prev => [
            {
                id: Date.now().toString(),
                action,
                user: currentUserAuth?.email || 'Operations Manager',
                timestamp: 'Just now',
                badge: 'Updated'
            },
            ...prev
        ]);
    };

    const handleBrandingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target as any;
        setBrandingData(prev => ({
            ...prev,
            [name]: type === 'number' ? Number(value) : value
        }));
    };

    const handleBankChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setBankData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveBranding = () => {
        if (!canEdit) return;
        updateOrgData({
            ...brandingData,
            bankDetails: bankData,
            defaultContractWordings: {
                forceMajeureText: brandingData.forceMajeureText,
                revisionsText: brandingData.revisionsText,
                paymentTermsText: brandingData.paymentTermsText,
                clientObsText: brandingData.clientObsText,
            }
        });
        addAuditLog('Studio Profile & Legal Entity Updated');
        showSaved();
    };

    const handleSavePersonalization = () => {
        applyPersonalizationSettings(selectedFont, selectedTheme, isCompact);
        if (brandingData.themeColor !== orgData.themeColor) {
            updateOrgData({ themeColor: brandingData.themeColor });
        }
        addAuditLog(`App Personalization set to ${selectedFont} font / ${selectedTheme} theme`);
        showSaved();
    };

    const handleSaveBankDetails = () => {
        updateOrgData({ bankDetails: bankData, gstin: brandingData.gstin, defaultGstRate: brandingData.defaultGstRate });
        addAuditLog('Bank Accounts & Financial Compliance Updated');
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
        return <div className="p-8 text-slate-500 font-medium animate-pulse flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin"/> Loading Studio Settings...</div>;
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

    return (
        <div className="max-w-[1550px] mx-auto animate-fade-in pb-24 md:p-8">
            
            {/* Top Header & Operational Status Banner */}
            <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-xs mb-8">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2.5 mb-2">
                            <span className="px-3 py-1 bg-sky-50 text-[#0066CC] border border-sky-200 text-xs font-black uppercase tracking-widest rounded-full flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-[#0066CC]" /> Multi-Tenant Operations Hub
                            </span>
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-full flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Active Studio: {orgData.orgName || 'FFDS Studio'}
                            </span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Studio Settings & Workspace Configuration</h1>
                        <p className="text-sm text-slate-500 mt-1">
                            Customize visual themes, studio branding, fee tranches, bank payouts, client portal rules, and audit logs.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={expandAll}
                            className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all border border-slate-200/80"
                        >
                            Expand All
                        </button>
                        <button
                            onClick={collapseAll}
                            className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all border border-slate-200/80"
                        >
                            Collapse All
                        </button>
                        <button
                            onClick={() => setShowPreviewMobile(!showPreviewMobile)}
                            className="xl:hidden px-4 py-2 bg-[#0066CC] text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm"
                        >
                            <FileText className="w-4 h-4"/> {showPreviewMobile ? 'Hide Live Proposal' : 'Live Document Preview'}
                        </button>
                    </div>
                </div>
            </div>

            {/* MAIN TWO-COLUMN CONTAINER */}
            <div className="flex flex-col xl:flex-row gap-8">
                
                {/* LEFT COLUMN: ACCORDION SECTIONS */}
                <div className="flex-1 w-full xl:w-[60%] space-y-5">

                    {/* ACCORDION SECTION 1: 🎨 APP PERSONALIZATION */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden transition-all duration-200">
                        <button
                            onClick={() => toggleSection('personalization')}
                            className="w-full px-6 py-5 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white hover:bg-slate-100/60 transition-colors text-left"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-[#0066CC] shrink-0">
                                    <Palette className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-bold text-slate-900">App Personalization & Visual Look</h3>
                                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                                            Moved from Nav Menu
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">Global typography font, color theme, and compact layout density</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
                                    Font: {selectedFont} • Theme: {selectedTheme}
                                </span>
                                {openSections.personalization ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                            </div>
                        </button>

                        <AnimatePresence>
                            {openSections.personalization && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="border-t border-slate-100 p-6 md:p-8 space-y-6"
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Type className="w-3.5 h-3.5 text-[#0066CC]" /> App Typography Font
                                            </label>
                                            <select
                                                value={selectedFont}
                                                onChange={(e) => setSelectedFont(e.target.value)}
                                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none cursor-pointer"
                                            >
                                                <option value="jakarta">Plus Jakarta Sans (Modern Clean)</option>
                                                <option value="opensans">Open Sans (Readable Crisp)</option>
                                                <option value="playfair">Playfair Display (Serif Luxury)</option>
                                                <option value="system">System Default UI</option>
                                            </select>
                                            <p className="text-xs text-slate-400 mt-1.5">Applies globally across dashboards, tables, and project cards.</p>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Palette className="w-3.5 h-3.5 text-[#0066CC]" /> Studio Interface Palette
                                            </label>
                                            <select
                                                value={selectedTheme}
                                                onChange={(e) => setSelectedTheme(e.target.value)}
                                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none cursor-pointer"
                                            >
                                                <option value="milky-white">Milky White ✦ (Signature FFDS)</option>
                                                <option value="dark-blue">Luxury Dark Blue 🌌 (High Contrast)</option>
                                                <option value="light-blue">Clean Light Blue ❄️ (Corporate)</option>
                                                <option value="light-orange">Warm Light Orange 🌅 (Studio Accent)</option>
                                            </select>
                                            <p className="text-xs text-slate-400 mt-1.5">Switch canvas backgrounds and contrast levels across the app.</p>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex-1">
                                            <LayoutGrid className="w-5 h-5 text-slate-600 shrink-0" />
                                            <div>
                                                <span className="text-xs font-bold text-slate-800 uppercase block">Compact Table Density Mode</span>
                                                <span className="text-xs text-slate-500">Reduce cell padding for high-density BOQ & Schedule of Finishes view</span>
                                            </div>
                                            <button
                                                onClick={() => setIsCompact(!isCompact)}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ml-auto ${isCompact ? 'bg-[#0066CC]' : 'bg-slate-300'}`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isCompact ? 'translate-x-5' : 'translate-x-0'}`}
                                                />
                                            </button>
                                        </div>

                                        <button
                                            onClick={handleSavePersonalization}
                                            className="px-6 py-3 bg-[#0066CC] hover:bg-[#0055B3] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 shrink-0"
                                        >
                                            <Save className="w-4 h-4" /> Apply Personalization
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ACCORDION SECTION 2: 🏛️ STUDIO PROFILE & LEGAL ENTITY */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden transition-all duration-200">
                        <button
                            onClick={() => toggleSection('branding')}
                            className="w-full px-6 py-5 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white hover:bg-slate-100/60 transition-colors text-left"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0066CC] shrink-0">
                                    <Building2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Studio Profile, Branding & Signatory Authority</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Legal studio name, official logo, addresses, and authorized signoff principal</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                    <Check className="w-3 h-3 text-emerald-600" /> {brandingData.orgName || 'Configured'}
                                </span>
                                {openSections.branding ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                            </div>
                        </button>

                        <AnimatePresence>
                            {openSections.branding && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="border-t border-slate-100 p-6 md:p-8 space-y-6"
                                >
                                    {/* Identity */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Studio Operating Name</label>
                                            <input type="text" name="orgName" value={brandingData.orgName} onChange={handleBrandingChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none text-sm font-bold text-slate-800" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Legal Registered Entity Name</label>
                                            <input type="text" name="legalName" value={brandingData.legalName} onChange={handleBrandingChange} placeholder="e.g. Form Factors Design Studio Pvt Ltd" className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none text-sm text-slate-800" />
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Brand Accent Color</label>
                                            <div className="flex items-center gap-3">
                                                <input type="color" name="themeColor" value={brandingData.themeColor} onChange={handleBrandingChange} className="w-12 h-12 rounded-xl cursor-pointer border-2 border-slate-200 p-1" />
                                                <span className="text-slate-700 font-mono font-bold bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs">{brandingData.themeColor}</span>
                                                <div className="flex gap-2 ml-auto">
                                                    {['#0066CC', '#059669', '#7C3AED', '#D97706', '#111827'].map(c => (
                                                        <button key={c} type="button" onClick={() => setBrandingData(prev => ({ ...prev, themeColor: c }))} className="w-7 h-7 rounded-full border border-white shadow-sm transition-transform hover:scale-110" style={{ backgroundColor: c }} />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Logo Uploader */}
                                        <div className="md:col-span-2 pt-2">
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Official Studio Logo</label>
                                            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                                {brandingData.orgLogo ? (
                                                    <div className="relative w-36 h-20 border rounded-xl overflow-hidden bg-white p-2 shadow-2xs shrink-0 flex items-center justify-center">
                                                        <img src={brandingData.orgLogo} alt="Logo" className="max-w-full max-h-full object-contain" />
                                                        <button 
                                                            type="button"
                                                            onClick={() => setBrandingData(prev => ({ ...prev, orgLogo: '' }))} 
                                                            className="absolute top-1 right-1 bg-white/90 rounded-full p-1 shadow-xs hover:text-red-500 transition-colors"
                                                            title="Remove Logo"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="w-36 h-20 border border-dashed border-slate-300 rounded-xl bg-white flex flex-col items-center justify-center text-xs text-slate-400 shrink-0">
                                                        <Upload className="w-5 h-5 mb-1 text-slate-400" /> No Logo Set
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
                                                                    setBrandingData(prev => ({ ...prev, orgLogo: reader.result as string }));
                                                                };
                                                                reader.readAsDataURL(file);
                                                            }
                                                        }} 
                                                        className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-sky-50 file:text-[#0055B3] hover:file:bg-sky-100 transition-all cursor-pointer" 
                                                    />
                                                    <p className="text-[11px] text-slate-400 mt-2">Embedded on client onboarding dockets, proposals, invoices, and PDF reports.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Contact & Address */}
                                    <div className="pt-4 border-t border-slate-100">
                                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-4">Official Contact & Address</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Official Email</label><input type="email" name="contactEmail" value={brandingData.contactEmail} onChange={handleBrandingChange} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" /></div>
                                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contact Phone / WhatsApp</label><input type="text" name="contactPhone" value={brandingData.contactPhone} onChange={handleBrandingChange} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" /></div>
                                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">City & State</label><input type="text" name="cityState" value={brandingData.cityState} onChange={handleBrandingChange} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" /></div>
                                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">GSTIN Number</label><input type="text" name="gstin" value={brandingData.gstin} onChange={handleBrandingChange} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm font-mono focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" /></div>
                                            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Registered Office Address</label><textarea name="officeAddress" value={brandingData.officeAddress} onChange={handleBrandingChange} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none h-16 resize-none" /></div>
                                        </div>
                                    </div>

                                    {/* Signatory Authority */}
                                    <div className="pt-4 border-t border-slate-100">
                                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-4">Authorized Contract Signatory</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Principal Name</label><input type="text" name="signatoryName" value={brandingData.signatoryName} onChange={handleBrandingChange} placeholder="e.g. Rishabh Shetty" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm font-bold focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" /></div>
                                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Title / Designation</label><input type="text" name="signatoryTitle" value={brandingData.signatoryTitle} onChange={handleBrandingChange} placeholder="e.g. Principal Architect & Partner" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" /></div>
                                        </div>
                                    </div>

                                    <div className="pt-4 flex justify-end">
                                        <button onClick={handleSaveBranding} className="px-6 py-3 bg-[#0066CC] hover:bg-[#0055B3] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-2">
                                            <Save className="w-4 h-4" /> Save Profile Changes
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ACCORDION SECTION 3: 💳 FINANCIALS & MULTI-BANK ACCOUNTS */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden transition-all duration-200">
                        <button
                            onClick={() => toggleSection('financials')}
                            className="w-full px-6 py-5 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white hover:bg-slate-100/60 transition-colors text-left"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                                    <CreditCard className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-bold text-slate-900">Financials, Bank Accounts & Payment Instructions</h3>
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                                            GST & UPI Ready
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">Operating bank account details, UPI ID, default GST rate, and invoice payment footers</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                                    GST: {brandingData.defaultGstRate}% • Bank: {bankData.bankName || 'Set'}
                                </span>
                                {openSections.financials ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                            </div>
                        </button>

                        <AnimatePresence>
                            {openSections.financials && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="border-t border-slate-100 p-6 md:p-8 space-y-6"
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Default GST Tax Rate (%)</label>
                                            <input type="number" name="defaultGstRate" value={brandingData.defaultGstRate} onChange={handleBrandingChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Service SAC Code (Design)</label>
                                            <input type="text" readOnly value="998391 (Interior Design)" className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-100 text-sm text-slate-600 font-mono outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Service SAC Code (Execution)</label>
                                            <input type="text" readOnly value="995431 (Construction Work)" className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-100 text-sm text-slate-600 font-mono outline-none" />
                                        </div>
                                    </div>

                                    {/* Primary Bank Account */}
                                    <div className="pt-4 border-t border-slate-100">
                                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-4 flex items-center gap-2">
                                            <Building2 className="w-4 h-4 text-emerald-600" /> Primary Operating Bank Account Details
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Account Holder Name</label><input type="text" name="accountName" value={bankData.accountName} onChange={handleBankChange} placeholder="Form Factors Design Studio" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm font-bold focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" /></div>
                                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bank Name</label><input type="text" name="bankName" value={bankData.bankName} onChange={handleBankChange} placeholder="HDFC Bank / ICICI Bank" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm font-bold focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" /></div>
                                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Account Number</label><input type="text" name="accountNumber" value={bankData.accountNumber} onChange={handleBankChange} placeholder="50200012345678" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm font-mono focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" /></div>
                                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">IFSC Code</label><input type="text" name="ifscCode" value={bankData.ifscCode} onChange={handleBankChange} placeholder="HDFC0001234" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm font-mono focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" /></div>
                                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">UPI VPA Handle ID</label><input type="text" name="upiId" value={bankData.upiId} onChange={handleBankChange} placeholder="ffds@hdfcbank" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm font-mono focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" /></div>
                                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">UPI Payment QR Image URL</label><input type="text" name="qrCodeImage" value={bankData.qrCodeImage} onChange={handleBankChange} placeholder="https://..." className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none" /></div>
                                        </div>
                                    </div>

                                    {/* Bank Card Preview */}
                                    <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 space-y-3">
                                        <div className="flex justify-between items-center text-xs font-mono font-bold text-amber-400 uppercase tracking-widest">
                                            <span>Client Payment Instruction Card Preview</span>
                                            <span>Auto-Renders on Invoices</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium">
                                            <div>
                                                <span className="text-slate-400 block text-[10px] uppercase">Account Holder</span>
                                                <span className="font-bold text-sm">{bankData.accountName || 'Form Factors Design Studio'}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block text-[10px] uppercase">Bank & IFSC</span>
                                                <span className="font-bold text-sm">{bankData.bankName || 'Bank Name'} • {bankData.ifscCode || 'IFSC'}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block text-[10px] uppercase">Account Number</span>
                                                <span className="font-mono text-sm">{bankData.accountNumber || '•••• •••• ••••'}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block text-[10px] uppercase">UPI VPA</span>
                                                <span className="font-mono text-sm text-emerald-400">{bankData.upiId || 'studio@upi'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-2 flex justify-end">
                                        <button onClick={handleSaveBankDetails} className="px-6 py-3 bg-[#0066CC] hover:bg-[#0055B3] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-2">
                                            <Save className="w-4 h-4" /> Save Financial Details
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ACCORDION SECTION 4: ⚖️ FEE STRUCTURES & CONTRACT TERMS */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden transition-all duration-200">
                        <button
                            onClick={() => toggleSection('contracts')}
                            className="w-full px-6 py-5 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white hover:bg-slate-100/60 transition-colors text-left"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-700 shrink-0">
                                    <Scale className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Process, Fee Tranches & Contract Terms</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Design & execution milestone splits, hard gate rules, warranty, and contract clauses</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg">
                                    Design Splits: 25/40/35%
                                </span>
                                {openSections.contracts ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                            </div>
                        </button>

                        <AnimatePresence>
                            {openSections.contracts && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="border-t border-slate-100 p-6 md:p-8 space-y-8"
                                >
                                    {/* Embedded Sub-tabs Component */}
                                    <TermsAndPaymentTab settings={settings} updateSettings={updateSettings} onSaved={showSaved} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ACCORDION SECTION 5: 💬 CLIENT PORTAL & COMMUNICATION */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden transition-all duration-200">
                        <button
                            onClick={() => toggleSection('portal')}
                            className="w-full px-6 py-5 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white hover:bg-slate-100/60 transition-colors text-left"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                                    <MessageSquare className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Client Portal & WhatsApp Communication Hub</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Visibility toggles, auto-linked email scripts, and weekly report template</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                                    Portal Active
                                </span>
                                {openSections.portal ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                            </div>
                        </button>

                        <AnimatePresence>
                            {openSections.portal && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="border-t border-slate-100 p-6 md:p-8 space-y-6"
                                >
                                    <CommunicationTemplatesTab settings={settings} updateSettings={updateSettings} onSaved={showSaved} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ACCORDION SECTION 6: ⚡ ADMIN, BACKUP & AUDIT LOG */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden transition-all duration-200">
                        <button
                            onClick={() => toggleSection('admin')}
                            className="w-full px-6 py-5 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white hover:bg-slate-100/60 transition-colors text-left"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                                    <ShieldCheck className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Platform Integrations, Data Portability & Audit Log</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Google Workspace sync, JSON backups, tenant reset, and timeline audit trail</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                                    System OK
                                </span>
                                {openSections.admin ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                            </div>
                        </button>

                        <AnimatePresence>
                            {openSections.admin && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="border-t border-slate-100 p-6 md:p-8 space-y-8"
                                >
                                    {/* Google Calendar */}
                                    <div className="flex items-center justify-between p-5 bg-slate-50 border border-slate-200 rounded-2xl">
                                        <div className="flex items-center gap-3">
                                            <Calendar className="w-6 h-6 text-[#0066CC]" />
                                            <div>
                                                <h4 className="text-sm font-bold text-slate-800">Google Calendar Integration</h4>
                                                <p className="text-xs text-slate-500">Sync site visit schedules and client design presentation milestones</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                const res = await connectGoogleCalendar();
                                                if (res) addAuditLog('Google Calendar Connected');
                                            }}
                                            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-800 font-bold border border-slate-300 rounded-xl text-xs flex items-center gap-2"
                                        >
                                            <Globe className="w-3.5 h-3.5 text-[#0066CC]" />
                                            {isGoogleCalendarConnected() ? 'Connected ✓' : 'Connect Calendar'}
                                        </button>
                                    </div>

                                    {/* Data Portability */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-5 bg-sky-50/50 border border-sky-100 rounded-2xl space-y-2">
                                            <h4 className="text-xs font-black uppercase text-[#0055B3]">Backup Project Data</h4>
                                            <p className="text-xs text-slate-500">Download offline JSON backup file containing all BOQ line items and settings.</p>
                                            <button
                                                onClick={() => {
                                                    if (onDownloadBackup) onDownloadBackup();
                                                    addAuditLog('JSON Backup Downloaded');
                                                }}
                                                className="px-4 py-2 bg-[#0066CC] text-white font-bold text-xs rounded-xl hover:bg-[#0055B3] transition-all"
                                            >
                                                Save Offline JSON
                                            </button>
                                        </div>

                                        <div className="p-5 bg-amber-50/50 border border-amber-100 rounded-2xl space-y-2">
                                            <h4 className="text-xs font-black uppercase text-amber-800">Import / Restore Data</h4>
                                            <p className="text-xs text-slate-500">Restore project state from an existing JSON backup file.</p>
                                            <label className="inline-block px-4 py-2 bg-amber-600 text-white font-bold text-xs rounded-xl hover:bg-amber-700 transition-all cursor-pointer">
                                                Import JSON File
                                                <input type="file" accept=".json" onChange={onImportProject} className="hidden" />
                                            </label>
                                        </div>
                                    </div>

                                    {/* Studio Setting Audit Trail */}
                                    <div className="pt-4 border-t border-slate-100">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                                                <History className="w-4 h-4 text-[#0066CC]" /> Studio Settings Timeline & Audit Trail
                                            </h4>
                                            <span className="text-[10px] font-mono text-slate-400">Security Verified</span>
                                        </div>

                                        <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                                            {auditLogs.map(log => (
                                                <div key={log.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-2 h-2 rounded-full bg-[#0066CC]" />
                                                        <div>
                                                            <span className="font-bold text-slate-800 block">{log.action}</span>
                                                            <span className="text-[10px] text-slate-500">{log.user}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[10px] font-mono font-bold text-slate-400 block">{log.timestamp}</span>
                                                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-sky-100 text-[#0055B3] font-bold">
                                                            {log.badge}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Super Admin Tenant Switcher */}
                                    {isSuperAdmin && (
                                        <div className="pt-4 border-t border-slate-100">
                                            <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 space-y-3">
                                                <h4 className="text-xs font-bold uppercase tracking-widest text-sky-400">Super Admin Workspace Switcher</h4>
                                                <p className="text-xs text-slate-300">Switch workspace context to inspect or debug another partner studio tenant.</p>
                                                <div className="flex gap-2">
                                                    <input id="switchTenantInput2" type="text" placeholder="Enter Tenant ID (e.g. demo-tenant-01)" className="px-3 py-2 bg-slate-800 text-white border border-slate-700 rounded-xl text-xs flex-1 outline-none font-mono" />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const el = document.getElementById('switchTenantInput2') as HTMLInputElement;
                                                            if (el?.value?.trim()) {
                                                                updateOrgData({ tenantId: el.value.trim() });
                                                                window.location.reload();
                                                            }
                                                        }}
                                                        className="px-4 py-2 bg-[#0066CC] hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition-all"
                                                    >
                                                        Switch Tenant
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                </div>

                {/* RIGHT COLUMN: LIVE PROPOSAL & DOCUMENT PREVIEW PANEL */}
                <div className={`xl:w-[40%] xl:block ${showPreviewMobile ? 'block' : 'hidden'}`}>
                    <StudioPreviewPanel 
                        branding={{
                            ...brandingData,
                            orgLogo: brandingData.orgLogo || orgData.orgLogo
                        }}
                        process={settings?.designProcess}
                        fees={settings?.feeStructure}
                        payments={settings?.paymentMilestones}
                        emails={settings?.emailTemplates}
                        previewMode={previewMode}
                        setPreviewMode={setPreviewMode}
                    />
                </div>

            </div>

            {/* FLOATING TOAST NOTIFICATION ON SAVE */}
            {isSaved && (
                <div className="fixed bottom-8 right-8 bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-2.5 animate-bounce z-50 border border-slate-700">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Settings Successfully Saved & Applied
                </div>
            )}

        </div>
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
    
    const val = (v: any, placeholder: string) => {
        if (!v || (typeof v === 'string' && !v.trim())) {
            return <span className="text-amber-500 border border-amber-300 border-dashed rounded px-1.5 bg-amber-50 font-medium italic text-xs">{`[${placeholder}]`}</span>;
        }
        return v;
    };

    return (
        <div className="sticky top-8 flex flex-col xl:h-[calc(100vh-8rem)]">
            <div className="flex items-center gap-2 mb-4 bg-white p-2 rounded-2xl border border-slate-200 overflow-x-auto hide-scrollbar shrink-0 shadow-2xs">
                {modes.map(m => (
                    <button 
                        key={m}
                        onClick={() => setPreviewMode(m)}
                        className={`whitespace-nowrap px-4 py-2 text-xs font-bold rounded-xl transition-all ${previewMode === m ? 'bg-[#0066CC] text-white shadow-xs' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
                    >
                        {m}
                    </button>
                ))}
            </div>

            <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col relative h-[600px] xl:h-auto">
                <div className="bg-slate-100/80 h-9 border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
                    <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                    </div>
                    <div className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest">Client Proposal Live Rendering</div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50 relative">
                    {previewMode === 'Cover' && (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 min-h-[400px]">
                            <div className="w-36 h-36 bg-white rounded-3xl shadow-md border border-slate-200/80 flex items-center justify-center overflow-hidden p-4">
                                {branding?.orgLogo ? (
                                    <img src={branding.orgLogo} alt="Logo" className="max-w-full max-h-full object-contain" />
                                ) : (
                                    val('', 'Studio Logo')
                                )}
                            </div>
                            <div className="space-y-2 max-w-sm">
                                <h1 className="text-2xl font-black tracking-tight" style={{ color: branding?.themeColor || '#000' }}>
                                    {val(branding?.orgName, 'Studio Name')}
                                </h1>
                                <p className="text-slate-500 text-sm font-medium">
                                    Client Project Proposal & Turnkey Execution Estimate
                                </p>
                            </div>
                            <div className="pt-4 border-t border-slate-200 w-full max-w-xs text-center text-xs text-slate-400">
                                Authorized Signatory: <strong className="text-slate-700">{branding?.signatoryName || 'Principal Architect'}</strong>
                            </div>
                        </div>
                    )}
                    
                    {previewMode === 'How We Work' && (
                        <div className="space-y-6">
                            <h2 className="text-xl font-black text-slate-900 tracking-tight border-b border-slate-200 pb-3" style={{ color: branding?.themeColor || '#000' }}>Design Workflow</h2>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                {val(process?.processSummary, 'Standard 3-stage interior design process.')}
                            </p>
                            
                            <div className="space-y-3 mt-4">
                                {(!process?.steps || process.steps.length === 0) ? (
                                    <div className="p-4 border-2 border-dashed border-amber-300 rounded-xl bg-amber-50 text-amber-700 text-xs font-medium text-center">
                                        [No workflow steps configured]
                                    </div>
                                ) : (
                                    process.steps.map((st: any, i: number) => (
                                        <div key={i} className="flex gap-3 items-start bg-white p-3.5 rounded-2xl shadow-2xs border border-slate-200">
                                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: branding?.themeColor || '#0066CC' }}>
                                                {st.stepNumber || i + 1}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-xs">{val(st.title, 'Step Title')}</h4>
                                                <p className="text-[11px] text-slate-500 mt-0.5">{val(st.description, 'Step description')}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                    
                    {previewMode === 'Investment Overview' && (
                        <div className="space-y-6">
                            <h2 className="text-xl font-black text-slate-900 tracking-tight border-b border-slate-200 pb-3" style={{ color: branding?.themeColor || '#000' }}>Investment Tranches</h2>
                            
                            <div className="bg-white p-5 rounded-2xl shadow-2xs border border-slate-200">
                                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Design Fee Terms</h3>
                                <div className="text-2xl font-black text-slate-800">
                                    {(fees?.designFeeMin !== undefined || fees?.designFeeMax !== undefined) ? 
                                        `${fees?.designFeeMin ?? '?'}% - ${fees?.designFeeMax ?? '?'}%` : 
                                        val('', 'Fee range')}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    {val(fees?.feeNote, 'Milestone-triggered payment tranches.')}
                                </p>
                            </div>
                            
                            <div>
                                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Payment Milestones</h3>
                                {(!payments?.milestones || payments.milestones.length === 0) ? (
                                    <div className="p-4 border-2 border-dashed border-amber-300 rounded-xl bg-amber-50 text-amber-700 text-xs font-medium text-center">
                                        [No payment milestones configured]
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {payments.milestones.map((m: any, i: number) => (
                                            <div key={i} className="flex justify-between items-center bg-white p-3 rounded-xl shadow-2xs border border-slate-200">
                                                <div>
                                                    <div className="font-bold text-slate-800 text-xs">{val(m.label, 'Milestone')}</div>
                                                    <div className="text-[10px] text-slate-500">{val(m.trigger, 'Trigger')}</div>
                                                </div>
                                                <div className="text-base font-black text-[#0066CC]">
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
                        <div className="space-y-4">
                            <h2 className="text-sm font-bold text-slate-800">Client Nudge Copy</h2>
                            <div className="bg-white p-5 rounded-2xl shadow-2xs border border-slate-200 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-700">
                                {val(emails?.proposalIntro, 'Proposal intro email script...')}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
