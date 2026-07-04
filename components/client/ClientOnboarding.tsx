import React, { useState, useEffect } from 'react';
import { ProjectContext, OnboardingData, OnboardingContent, ProposalTier } from '../../types';
import { PencilIcon, CheckIcon, UploadIcon, DeleteIcon } from '../Icons';
import { formatCurrency } from '../../lib/utils';
import { useOrg } from '../../contexts/OrgContext';
import { useStudioSettings } from '../../hooks/useStudioSettings';

const DEFAULT_ONBOARDING_DATA: OnboardingData = {
    accountName: "Design Studio",
    bankName: "Kotak Mahindra Bank",
    accountNumber: "1234 5678 9012",
    ifscCode: "KKBK0001234",
    amount: 4999,
    gstNote: "Inclusive of GST"
};

const DEFAULT_ONBOARDING_CONTENT: OnboardingContent = {
    welcomeTitle: "Welcome to The Studio",
    welcomeMessage: `We are thrilled to partner with you on this journey. At The Studio, our goal is to translate your vision into a beautifully crafted reality. This onboarding kit outlines our process, expectations, and the immediate next steps to ensure a seamless and successful collaboration.`,
    governanceTitle: "Governance & Communication",
    communicationTitle: "Communication Channels",
    communicationItems: [
        { label: "WhatsApp", text: "For daily updates, quick queries, and site photos.", color: "bg-green-500" },
        { label: "Email", text: "For formal approvals, financials, and phase sign-offs.", color: "bg-blue-500" }
    ],
    hoursTitle: "Operational Hours",
    hoursItems: [
        { label: "Design Team", value: "10:00 AM – 6:00 PM" },
        { label: "Site Execution", value: "9:00 AM – 6:00 PM" }
    ],
    timelineTitle: "First 10 Days Roadmap",
    timelineSteps: [
        { day: "Day 1", label: "Onboarding + Payment + Access", sub: "" },
        { day: "Day 3", label: "Site Survey", sub: "" },
        { day: "Day 7", label: "Design Workshop", sub: "" },
        { day: "Day 10", label: "Concept Review", sub: "" }
    ],
    checklistTitle: "Immediate Action Checklist",
    checklistItems: [
        "Stage 1 Payment (Project Initiation – Advance)",
        "Share KYC details for invoicing",
        "Provide site access / keys (if available)",
        "Initiate Society NOC process",
        "Confirm preferred communication email ID"
    ],
    bankingTitle: "Banking & Payment Details",
    bankingSubtitle: "Please share the payment confirmation screenshot/reference number via email or WhatsApp once completed.",
    paymentTermsTitle: "Payment Terms (Advance-Based System)",
    paymentTermsItems: [
        { percentage: "10%", title: "Stage 1", text: "Project Initiation" },
        { percentage: "40%", title: "Stage 2", text: "Design Freeze" },
        { percentage: "40%", title: "Stage 3", text: "Execution Mobilization" },
        { percentage: "10%", title: "Stage 4", text: "Handover" }
    ],
    howItWorksItems: [
        { letter: "A", title: "Design-Led Approach", text: "We are a design and project management studio, not a traditional contractor. Our primary focus is on delivering exceptional design and ensuring its precise execution." },
        { letter: "B", title: "BOQ is a Working Document", text: "The Bill of Quantities (BOQ) will evolve as the design develops. Final costs are only locked in once the design freeze is achieved." },
        { letter: "C", title: "Vendor Payments", text: "Some payments may go directly to specialized vendors. We assist in the complete coordination, quality check, and validation of these payments." },
        { letter: "D", title: "Decision-Driven Timeline", text: "Our timelines are heavily dependent on timely decisions. Delays in approvals will directly impact the overall project timeline." }
    ],
    clientExpectations: [
        "Multiple design iterations to perfect the vision",
        "Transparent BOQ revisions during design phase",
        "Complete vendor coordination & management",
        "Weekly progress updates via WhatsApp",
        "Formal approvals and documentation via email"
    ],
    ffdsExpectations: [
        "Timely approvals to maintain project momentum",
        "Strict adherence to the payment schedule",
        "Clear, consolidated communication of feedback",
        "Respect for the defined operational process and hours"
    ],
    footerTitle: "Minimal Design. Maximum Impact.",
    footerSubtitle: "Design Studio"
};

const EditableText: React.FC<{
    isEditing: boolean;
    value: string;
    onChange: (val: string) => void;
    className?: string;
    placeholder?: string;
    multiline?: boolean;
}> = ({ isEditing, value, onChange, className = "", placeholder, multiline = false }) => {
    if (isEditing) {
        if (multiline) {
            return (
                <textarea
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className={`w-full bg-blue-50/50 border border-blue-200 rounded p-2 focus:ring-2 focus:ring-blue-300 outline-none resize-none text-base font-normal ${className}`}
                    placeholder={placeholder}
                    rows={3}
                />
            )
        }
        return (
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                className={`w-full bg-blue-50/50 border-b-2 border-blue-300 focus:border-blue-500 outline-none px-1 rounded-t font-normal ${className}`}
                placeholder={placeholder}
            />
        );
    }
    return <span className={className}>{value}</span>;
};

const EditableList: React.FC<{
    isEditing: boolean;
    items: string[];
    onChange: (items: string[]) => void;
    itemClass?: string;
    icon?: React.ReactNode;
}> = ({ isEditing, items, onChange, itemClass = "", icon }) => {
    if (isEditing) {
        return (
            <div className="space-y-3">
                {items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center group">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold shrink-0">{idx + 1}</div>
                        <input
                            value={item}
                            onChange={(e) => {
                                const newItems = [...items];
                                newItems[idx] = e.target.value;
                                onChange(newItems);
                            }}
                            className="flex-grow p-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                        />
                        <button onClick={() => onChange(items.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500 p-1"><DeleteIcon className="w-4 h-4"/></button>
                    </div>
                ))}
                <button 
                    onClick={() => onChange([...items, "New Item"])}
                    className="text-xs text-blue-600 font-bold hover:text-blue-800 flex items-center gap-1 mt-2"
                >
                    + Add Item
                </button>
            </div>
        )
    }
    return (
        <ul className="space-y-4">
            {items.map((item, i) => (
                <li key={i} className={`flex items-start gap-3 ${itemClass}`}>
                    {icon ? icon : <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5"><CheckIcon className="w-3 h-3" /></div>}
                    <span className="text-sm font-medium text-slate-700 leading-snug">{item}</span>
                </li>
            ))}
        </ul>
    )
}

const ClientOnboarding: React.FC<{ projectContext: ProjectContext; setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>; activeTier?: ProposalTier }> = ({ projectContext, setProjectContext, activeTier }) => {
    const { orgData } = useOrg();
    const { settings } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const [isEditing, setIsEditing] = useState(false);
    
    useEffect(() => {
        if (!projectContext.onboardingData) {
            const orgBankOverrides = orgData?.bankDetails ? {
                accountName: orgData.bankDetails.accountName || DEFAULT_ONBOARDING_DATA.accountName,
                bankName: orgData.bankDetails.bankName || DEFAULT_ONBOARDING_DATA.bankName,
                accountNumber: orgData.bankDetails.accountNumber || DEFAULT_ONBOARDING_DATA.accountNumber,
                ifscCode: orgData.bankDetails.ifscCode || DEFAULT_ONBOARDING_DATA.ifscCode,
                qrCodeImage: orgData.bankDetails.qrCodeImage
            } : {};
            setProjectContext(prev => ({ ...prev, onboardingData: { ...DEFAULT_ONBOARDING_DATA, ...orgBankOverrides } }));
        }
        if (!projectContext.onboardingContent) {
            setProjectContext(prev => ({ ...prev, onboardingContent: DEFAULT_ONBOARDING_CONTENT }));
        }
    }, [projectContext.onboardingData, projectContext.onboardingContent, setProjectContext, orgData?.bankDetails]);

    const data = { ...DEFAULT_ONBOARDING_DATA, ...projectContext.onboardingData };
    const content = { 
        ...DEFAULT_ONBOARDING_CONTENT, 
        ...projectContext.onboardingContent,
        paymentTermsItems: projectContext.onboardingContent?.paymentTermsItems || DEFAULT_ONBOARDING_CONTENT.paymentTermsItems,
        howItWorksItems: projectContext.onboardingContent?.howItWorksItems || DEFAULT_ONBOARDING_CONTENT.howItWorksItems,
        clientExpectations: projectContext.onboardingContent?.clientExpectations || DEFAULT_ONBOARDING_CONTENT.clientExpectations,
        ffdsExpectations: projectContext.onboardingContent?.ffdsExpectations || DEFAULT_ONBOARDING_CONTENT.ffdsExpectations
    };

    const handleUpdateData = (field: keyof OnboardingData, value: string | number) => {
        setProjectContext(prev => ({
            ...prev,
            onboardingData: { ...prev.onboardingData || DEFAULT_ONBOARDING_DATA, [field]: value }
        }));
    };

    const handleUpdateContent = (field: keyof OnboardingContent, value: any) => {
        setProjectContext(prev => ({
            ...prev,
            onboardingContent: { ...prev.onboardingContent || DEFAULT_ONBOARDING_CONTENT, [field]: value }
        }));
    };

    const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => { handleUpdateData('qrCodeImage', reader.result as string); };
            reader.readAsDataURL(file);
        }
    };

    const updateTimelineStep = (idx: number, field: string, val: string) => {
        if (!content.timelineSteps) return;
        const newSteps = [...content.timelineSteps];
        if (newSteps[idx]) {
            newSteps[idx] = { ...newSteps[idx], [field]: val };
            handleUpdateContent('timelineSteps', newSteps);
        }
    }

    const updatePaymentTerm = (idx: number, field: string, val: string) => {
        if (!content.paymentTermsItems) return;
        const newItems = [...content.paymentTermsItems];
        if (newItems[idx]) {
            newItems[idx] = { ...newItems[idx], [field]: val };
            handleUpdateContent('paymentTermsItems', newItems);
        }
    }

    const updateHowItWorks = (idx: number, field: string, val: string) => {
        if (!content.howItWorksItems) return;
        const newItems = [...content.howItWorksItems];
        if (newItems[idx]) {
            newItems[idx] = { ...newItems[idx], [field]: val };
            handleUpdateContent('howItWorksItems', newItems);
        }
    }

    const updateCommItem = (idx: number, field: string, val: string) => {
        if (!content.communicationItems) return;
        const newItems = [...content.communicationItems];
        if (newItems[idx]) {
            newItems[idx] = { ...newItems[idx], [field]: val };
            handleUpdateContent('communicationItems', newItems);
        }
    }

    const updateHoursItem = (idx: number, field: string, val: string) => {
        if (!content.hoursItems) return;
        const newHours = [...content.hoursItems];
        if (newHours[idx]) {
            newHours[idx] = { ...newHours[idx], [field]: val };
            handleUpdateContent('hoursItems', newHours);
        }
    }

    // --- CALCULATIONS ENGINE ---
    const financials = projectContext.financials || {
        initiationFeePaid: 4999,
        billablePercent: 100,
        executionGstEnabled: true,
        projectedCashValue: 0,
        taxLimitYearly: 2000000,
        goodwillDiscount: 0,
        discounts: []
    };

    const gstRate = projectContext.gstRate || 18;
    const initiationFee = financials.initiationFeePaid;
    const billablePercent = financials.billablePercent;
    const executionGstEnabled = financials.executionGstEnabled;
    const discounts = financials.discounts || [];

    const originalExecutionTotal = activeTier?.summary.totalSell || 0;
    const originalDesignFee = activeTier?.summary.designFee || 0;

    const rawExecutionTotal = financials.approvedExecutionValue ?? originalExecutionTotal;
    const rawDesignFee = financials.approvedDesignValue ?? originalDesignFee;

    const calculateDiscountValue = (base: number, target: 'execution' | 'design') => {
        const targetDiscounts = discounts.filter(d => d.target === target);
        let totalDeduction = 0;
        targetDiscounts.forEach(d => {
            if (d.type === 'percentage') {
                totalDeduction += base * (d.value / 100);
            } else {
                totalDeduction += d.value;
            }
        });
        return totalDeduction;
    };

    const executionDiscountVal = calculateDiscountValue(rawExecutionTotal, 'execution');
    const designDiscountVal = calculateDiscountValue(rawDesignFee, 'design');

    const taxableExecution = Math.max(0, rawExecutionTotal - executionDiscountVal);
    const taxableDesign = Math.max(0, rawDesignFee - designDiscountVal);

    const executionBillable = taxableExecution * (billablePercent / 100);
    const executionCash = taxableExecution * ((100 - billablePercent) / 100);

    const gstOnExecution = executionGstEnabled ? (executionBillable * (gstRate / 100)) : 0;
    const gstOnDesign = taxableDesign * (gstRate / 100);
    const totalGST = gstOnExecution + gstOnDesign;

    const grossProjectValue = (taxableExecution + taxableDesign) + totalGST;
    const netReceivable = grossProjectValue - initiationFee;

    const milestones = projectContext.paymentMilestones || [];
    const executionMilestones = milestones.filter(m => m.type === 'execution');
    const designMilestones = milestones.filter(m => m.type === 'design');

    return (
        <div className="bg-gray-100 text-indigo-900 antialiased py-10 px-4 sm:px-6 lg:px-8 relative font-sans min-h-screen">
            {/* Edit Mode Toggle */}
            <div className="absolute top-2 right-4 md:right-8 no-print flex gap-2 z-50">
                <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm border ${isEditing ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                >
                    <PencilIcon className="w-3.5 h-3.5" /> {isEditing ? 'Done Editing' : 'Edit Document'}
                </button>
            </div>

            <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-2xl overflow-hidden print:shadow-none print:w-full print:max-w-none">
                
                {/* 1. HEADER SECTION */}
                <header className="bg-indigo-950 text-white p-10 md:p-14">
                    <div className="border-b border-slate-700 pb-8 mb-8">
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Project Initiation – Onboarding Kit</h1>
                        <p className="text-slate-400 text-lg">{settings?.companyName || orgData.orgName || 'The Studio'}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm md:text-base">
                        <div>
                            <p className="text-slate-400 mb-1">Client Name</p>
                            <p className="font-medium text-lg">{projectContext.clientName || 'Valued Client'}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Project Name</p>
                            <p className="font-medium text-lg">{projectContext.name}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Project Type</p>
                            <p className="font-medium text-lg">{projectContext.config}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Location</p>
                            <p className="font-medium text-lg">{projectContext.location}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Date</p>
                            <p className="font-medium text-lg">{today}</p>
                        </div>
                    </div>
                </header>

                <div className="p-10 md:p-14 space-y-16">

                    {/* 3. WELCOME NOTE */}
                    <section className="text-center max-w-3xl mx-auto">
                        {settings?.logoUrl ? (
                            <img src={settings.logoUrl} alt={settings?.companyName} className="h-16 mx-auto mb-6 object-contain" />
                        ) : (
                            <div className="h-16 w-16 mx-auto mb-6 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 font-bold text-2xl">
                                {(settings?.companyName || orgData.orgName || 'S').charAt(0)}
                            </div>
                        )}
                        <h2 className="text-2xl font-semibold mb-4 text-indigo-950">
                            <EditableText isEditing={isEditing} value={content.welcomeTitle} onChange={v => handleUpdateContent('welcomeTitle', v)} />
                        </h2>
                        <p className="text-slate-600 leading-relaxed text-lg">
                            <EditableText isEditing={isEditing} value={settings?.onboardingProcess?.welcomeMessage || "Welcome! We are excited to work with you."} onChange={v => handleUpdateContent('welcomeMessage', v)} multiline={true} />
                        </p>
                    </section>

                    {/* 2. DESIGN JOURNEY OVERVIEW */}
                    <section>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8 text-center">Design Journey Overview</h3>
                        <div className="flex flex-col md:flex-row justify-between items-center relative gap-4">
                            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 -z-10 transform -translate-y-1/2"></div>
                            
                            {(settings?.designProcess?.steps && settings.designProcess.steps.length > 0) ? (
                                settings.designProcess.steps.map((step: any, index: number) => (
                                    <div key={index} className="flex flex-col items-center flex-1 bg-white px-2">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold mb-3 ${index === 0 ? 'bg-indigo-950 text-white shadow-md' : 'bg-slate-200 text-slate-600'}`}>
                                            {step.stepNumber}
                                        </div>
                                        <p className="font-semibold text-sm text-center">{step.title}</p>
                                        {step.description && <p className="text-[10px] text-slate-500 text-center mt-1 max-w-[120px]">{step.description}</p>}
                                    </div>
                                ))
                            ) : (
                                <div className="w-full text-center p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500">
                                    Design journey steps not configured. Please build your process in Studio Settings.
                                </div>
                            )}
                        </div>
                    </section>

                    <hr className="border-slate-100" />

                    {/* 4. WHAT HAPPENS NEXT - ONBOARDING STEPS */}
                    <section>
                        <h3 className="text-xl font-bold text-indigo-950 mb-6">What Happens Next</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {(settings?.onboardingProcess?.steps && settings.onboardingProcess.steps.length > 0) ? (
                                settings.onboardingProcess.steps.map((step: any, idx: number) => (
                                    <div key={idx} className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex flex-col h-full relative">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="w-8 h-8 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                                                {step.stepNumber || idx + 1}
                                            </div>
                                            {step.ownerRole && (
                                                <span className={`px-2 py-1 text-[9px] uppercase tracking-wider font-bold rounded-md ${
                                                    step.ownerRole.toLowerCase() === 'client' 
                                                        ? 'bg-amber-100 text-amber-700' 
                                                        : 'bg-emerald-100 text-emerald-700'
                                                }`}>
                                                    {step.ownerRole === 'Client' ? 'Client' : 'Studio'} Action
                                                </span>
                                            )}
                                        </div>
                                        <h4 className="font-bold text-indigo-950 mb-2">{step.title}</h4>
                                        <div className="text-sm text-slate-600 leading-relaxed grow">
                                            {step.description}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-full flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm">
                                    <p className="mb-2">Next steps need to be configured for your studio.</p>
                                    <a href="/studio-settings" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors">
                                        Configure in Studio Settings
                                    </a>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* 5. GOVERNANCE & COMMUNICATION & 6. IMMEDIATE ACTION CHECKLIST */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 print-break-inside-avoid">
                        {/* 5. GOVERNANCE & COMMUNICATION */}
                        <section>
                            <h3 className="text-xl font-bold text-indigo-950 mb-6">
                                <EditableText isEditing={isEditing} value={content.governanceTitle} onChange={v => handleUpdateContent('governanceTitle', v)} />
                            </h3>
                            <div className="space-y-6">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
                                        <EditableText isEditing={isEditing} value={content.communicationTitle} onChange={v => handleUpdateContent('communicationTitle', v)} />
                                    </h4>
                                    <ul className="space-y-3">
                                        {settings?.clientPortalConfig?.supportContact && (
                                            <li className="flex items-start gap-3">
                                                <div className={`mt-0.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0 text-white`}>
                                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                                                </div>
                                                <div>
                                                    <p className="font-medium text-indigo-950 text-sm">WhatsApp</p>
                                                    <p className="text-xs text-slate-500">{settings.clientPortalConfig.supportContact}</p>
                                                </div>
                                            </li>
                                        )}
                                        {settings?.email && (
                                            <li className="flex items-start gap-3">
                                                <div className={`mt-0.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0 text-white`}>
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                                                </div>
                                                <div>
                                                    <p className="font-medium text-indigo-950 text-sm">Email</p>
                                                    <p className="text-xs text-slate-500">{settings.email}</p>
                                                </div>
                                            </li>
                                        )}
                                        {settings?.phone && (
                                            <li className="flex items-start gap-3">
                                                <div className={`mt-0.5 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center shrink-0 text-white`}>
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                                                </div>
                                                <div>
                                                    <p className="font-medium text-indigo-950 text-sm">Phone</p>
                                                    <p className="text-xs text-slate-500">{settings.phone}</p>
                                                </div>
                                            </li>
                                        )}
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
                                        <EditableText isEditing={isEditing} value={content.hoursTitle} onChange={v => handleUpdateContent('hoursTitle', v)} />
                                    </h4>
                                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 space-y-2">
                                        {(content.hoursItems || []).map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center">
                                                <span className="text-sm font-medium text-slate-700">
                                                    <EditableText isEditing={isEditing} value={item.label} onChange={v => updateHoursItem(idx, 'label', v)} />
                                                </span>
                                                <span className="text-sm text-slate-500">
                                                    <EditableText isEditing={isEditing} value={item.value} onChange={v => updateHoursItem(idx, 'value', v)} />
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 6. IMMEDIATE ACTION CHECKLIST */}
                        <section>
                            <h3 className="text-xl font-bold text-indigo-950 mb-6">Kickoff Checklist</h3>
                            <div className="bg-indigo-50/50 rounded-xl p-6 border border-indigo-100">
                                {(settings?.onboardingProcess?.kickoffChecklist && settings.onboardingProcess.kickoffChecklist.length > 0) ? (
                                    <ul className="space-y-4">
                                        {settings.onboardingProcess.kickoffChecklist.map((item: string, idx: number) => (
                                            <li key={idx} className="flex items-start gap-3">
                                                <div className="mt-1 w-4 h-4 rounded border border-indigo-300 bg-white shadow-sm shrink-0 flex items-center justify-center cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-300 focus-within:bg-indigo-50 focus-within:border-indigo-400">
                                                    <input type="checkbox" className="appearance-none w-full h-full cursor-pointer checked:bg-indigo-500 checked:border-transparent transition-colors" />
                                                </div>
                                                <span className="text-sm font-medium text-slate-700 leading-snug">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="flex flex-col items-center justify-center text-center text-slate-500 text-sm">
                                        <p className="mb-2">Checklist not configured.</p>
                                        <a href="/studio-settings" className="text-indigo-600 hover:text-indigo-700 font-medium">
                                            Setup in Studio Settings &rarr;
                                        </a>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>



                    {/* 8. PAYMENT TABLES & BOOKING BOQ */}
                    <section className="print-break-inside-avoid">
                        <div className="mb-6 flex items-center gap-2">
                            <span className="w-6 h-0.5 bg-indigo-950"></span>
                            <EditableText isEditing={isEditing} value={content.paymentTermsTitle || "Payment Schedule & Booking BOQ"} onChange={v => handleUpdateContent('paymentTermsTitle', v)} className="text-sm font-black text-indigo-950 uppercase tracking-wider" />
                        </div>
                        
                        <div className="bg-indigo-950 text-white rounded-xl p-6 mb-8 flex justify-between items-center shadow-lg print:border-2 print:border-indigo-950 print:text-indigo-950 print:bg-white">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 print:text-slate-500">Booking BOQ Value</p>
                                <p className="text-3xl font-black">{formatCurrency(grossProjectValue)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 print:text-slate-500">Net Receivable</p>
                                <p className="text-xl font-bold text-emerald-400 print:text-indigo-900">{formatCurrency(netReceivable)}</p>
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8 flex items-start gap-3">
                            <svg className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <div>
                                <p className="text-sm font-bold text-amber-800">Important Note</p>
                                <p className="text-sm text-amber-700 mt-1">All payments are advance payments. Work for any specific stage begins only after the respective payment is received. The BOQ may change during design development. Any adjustments or variations are reflected and balanced in subsequent payment stages.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            {/* Design Milestones */}
                            {designMilestones.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Design Phase Payments</h4>
                                    <div className="overflow-hidden rounded-lg border border-slate-200">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-3 font-bold">Stage</th>
                                                    <th className="px-4 py-3 text-center font-bold">%</th>
                                                    <th className="px-4 py-3 text-right font-bold">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {designMilestones.map((m, i) => {
                                                    const rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || taxableDesign) * (m.percentage / 100);
                                                    const rowGST = rowBaseOriginal * (gstRate / 100);
                                                    let rowInvoiceTotal = rowBaseOriginal + rowGST;
                                                    
                                                    let deductedInitiationFee = 0;
                                                    if (i === 0 && initiationFee > 0) {
                                                        deductedInitiationFee = Math.min(rowInvoiceTotal, initiationFee);
                                                        rowInvoiceTotal = Math.max(0, rowInvoiceTotal - initiationFee);
                                                    }

                                                    return (
                                                        <tr key={m.id} className="bg-white">
                                                            <td className="px-4 py-3">
                                                                <p className="font-bold text-indigo-900 text-xs">{m.name}</p>
                                                                <p className="text-[10px] text-slate-500">{m.description}</p>
                                                                {deductedInitiationFee > 0 && (
                                                                    <p className="text-[9px] text-amber-600 mt-1">(-{formatCurrency(deductedInitiationFee)} Initiation Fee)</p>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-center text-slate-500 font-medium text-xs">{m.percentage}%</td>
                                                            <td className="px-4 py-3 text-right font-black text-indigo-950">{formatCurrency(rowInvoiceTotal)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Execution Milestones */}
                            {executionMilestones.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Execution Phase Payments</h4>
                                    <div className="overflow-hidden rounded-lg border border-slate-200">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-3 font-bold">Stage</th>
                                                    <th className="px-4 py-3 text-center font-bold">%</th>
                                                    <th className="px-4 py-3 text-right font-bold">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {executionMilestones.map((m, i) => {
                                                    const rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || taxableExecution) * (m.percentage / 100);
                                                    const rowBillable = rowBaseOriginal * (billablePercent / 100);
                                                    const rowCash = rowBaseOriginal * ((100 - billablePercent) / 100);
                                                    const rowGST = executionGstEnabled ? (rowBillable * (gstRate / 100)) : 0;
                                                    const rowInvoiceTotal = rowBillable + rowGST + rowCash;
                                                    return (
                                                        <tr key={m.id} className="bg-white">
                                                            <td className="px-4 py-3">
                                                                <p className="font-bold text-indigo-900 text-xs">{m.name}</p>
                                                                <p className="text-[10px] text-slate-500">{m.description}</p>
                                                            </td>
                                                            <td className="px-4 py-3 text-center text-slate-500 font-medium text-xs">{m.percentage}%</td>
                                                            <td className="px-4 py-3 text-right font-black text-indigo-950">{formatCurrency(rowInvoiceTotal)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* 9. GST & PAYMENT STRUCTURE */}
                    <section className="print-break-inside-avoid">
                        <div className="bg-indigo-950 rounded-2xl p-8 md:p-10 text-white shadow-lg relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 transform translate-x-1/2 -translate-y-1/2"></div>
                            
                            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                                GST & Payment Structure
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></div>
                                        <p className="text-slate-300 text-sm leading-relaxed"><strong className="text-white">Payments to {orgData?.orgName || 'Studio'} current account attract 18% GST.</strong></p>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></div>
                                        <div className="text-slate-300 text-sm leading-relaxed">
                                            Some project components may be:
                                            <ul className="mt-2 space-y-1 pl-4 border-l-2 border-slate-700">
                                                <li>• Direct vendor payments</li>
                                                <li>• Non-GST transactions (where applicable)</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></div>
                                        <p className="text-slate-300 text-sm leading-relaxed">The exact structure is explained in detail during the BOQ finalization. Clients will always be informed before execution begins.</p>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></div>
                                        <div className="text-slate-300 text-sm leading-relaxed">
                                            {orgData?.orgName || 'Studio'} ensures complete clarity on:
                                            <ul className="mt-2 space-y-1 pl-4 border-l-2 border-slate-700">
                                                <li>• GST components</li>
                                                <li>• Direct payments</li>
                                                <li>• "As actuals" items</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 10 & 11. EXPECTATIONS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print-break-inside-avoid">
                        <section className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                            <h3 className="text-lg font-bold text-indigo-950 mb-6">Client Expectations from {orgData?.orgName || 'Studio'}</h3>
                            <EditableList 
                                isEditing={isEditing} 
                                items={content.clientExpectations || []} 
                                onChange={v => handleUpdateContent('clientExpectations', v)} 
                                icon={<svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>}
                            />
                        </section>

                        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-8 shadow-sm">
                            <h3 className="text-lg font-bold text-indigo-950 mb-6">{orgData?.orgName || 'Studio'} Expectations from Client</h3>
                            <EditableList 
                                isEditing={isEditing} 
                                items={content.ffdsExpectations || []} 
                                onChange={v => handleUpdateContent('ffdsExpectations', v)} 
                                icon={<svg className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
                            />
                        </section>
                    </div>

                    {/* 12. BANKING & PAYMENT DETAILS */}
                    <section className="print-break-inside-avoid">
                        <h3 className="text-xl font-bold text-indigo-950 mb-6">
                            <EditableText isEditing={isEditing} value={content.bankingTitle} onChange={v => handleUpdateContent('bankingTitle', v)} />
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            
                            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">A. Design Initiation Payment</h4>
                                    <p className="text-3xl font-black text-indigo-950 mb-2">
                                        {isEditing ? (
                                            <input type="number" value={data.amount} onChange={e => handleUpdateData('amount', parseInt(e.target.value))} className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-indigo-950 w-32" />
                                        ) : (
                                            formatCurrency(data.amount)
                                        )}
                                    </p>
                                    <p className="text-xs text-slate-500 mb-4">
                                        {isEditing ? (
                                            <input value={data.gstNote} onChange={e => handleUpdateData('gstNote', e.target.value)} className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-slate-600 w-full" />
                                        ) : (
                                            `(${data.gstNote})`
                                        )}
                                    </p>
                                    <p className="text-sm text-slate-700 font-medium">Purpose:</p>
                                    <p className="text-sm text-slate-600">Project onboarding & design slot blocking.</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">B. Stage Payments</h4>
                                    <div className="flex items-center justify-center h-20 bg-slate-50 rounded-lg border border-slate-100 mb-4">
                                        <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                    </div>
                                    <p className="text-sm text-slate-600 text-center">Billed as per milestone invoices generated during the project lifecycle.</p>
                                </div>
                            </div>

                            <div className="bg-indigo-950 text-white rounded-xl p-6 shadow-sm flex flex-col justify-center relative group/qr">
                                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-4">Bank Details</h4>
                                <div className="space-y-3 text-sm mb-6">
                                    <div>
                                        <p className="text-slate-400 text-xs">Account Name</p>
                                        {isEditing ? (
                                            <input value={data.accountName} onChange={e => handleUpdateData('accountName', e.target.value)} className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white w-full" />
                                        ) : (
                                            <p className="font-medium">{data.accountName}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-xs">Account Number</p>
                                        {isEditing ? (
                                            <input value={data.accountNumber} onChange={e => handleUpdateData('accountNumber', e.target.value)} className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white w-full" />
                                        ) : (
                                            <p className="font-medium tracking-wider">{data.accountNumber}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-xs">IFSC Code</p>
                                        {isEditing ? (
                                            <input value={data.ifscCode} onChange={e => handleUpdateData('ifscCode', e.target.value)} className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white w-full" />
                                        ) : (
                                            <p className="font-medium tracking-wider">{data.ifscCode}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-xs">Bank Name</p>
                                        {isEditing ? (
                                            <input value={data.bankName} onChange={e => handleUpdateData('bankName', e.target.value)} className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white w-full" />
                                        ) : (
                                            <p className="font-medium">{data.bankName}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="bg-white/10 rounded p-3 text-xs text-slate-300 border border-white/10">
                                    <EditableText isEditing={isEditing} value={content.bankingSubtitle} onChange={v => handleUpdateContent('bankingSubtitle', v)} multiline />
                                </div>
                            </div>

                        </div>
                    </section>

                </div>

                {/* 13. FOOTER */}
                <footer className="bg-indigo-950 text-slate-400 p-10 md:p-14 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-6">
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight mb-1">
                            {settings?.companyName || orgData.orgName || 'Studio Name'}
                        </h2>
                        <p className="text-sm text-indigo-400 font-medium">
                            {settings?.tagline || 'Minimal Design. Maximum Impact.'}
                        </p>
                    </div>
                    <div className="text-sm md:text-right">
                        <p className="text-slate-300 font-medium mb-1">{settings?.companyName || orgData.orgName || 'Studio Name'}</p>
                        <p className="text-slate-500">{settings?.address || orgData.officeAddress || 'Studio Address'}</p>
                        {(settings?.phone || orgData.contactPhone) && <p className="text-slate-500 mt-2">{settings?.phone || orgData.contactPhone}</p>}
                        {settings?.email && <p className="text-slate-500">{settings.email}</p>}
                    </div>
                </footer>

            </div>
        </div>
    );
};

export default ClientOnboarding;
