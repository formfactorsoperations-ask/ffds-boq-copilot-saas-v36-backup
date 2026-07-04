
import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import ClientPayments from './ClientTotals';
import { ProjectContext, FullBoqItem, ProposalTier, AiComparisonResult, MaterialSuggestion, TimelinePhase, PaymentMilestone, ProposalContent, DecisionBrainOutput, LeadProfile, ProposalLevel, ProposalType, ProjectTask } from '../../types';
import { formatClientValue, formatCurrency } from '../../lib/utils';
import { CloseIcon, ListIcon, PencilIcon, ChevronDownIcon, DashboardIcon, ClockIcon, CheckBadgeIcon } from '../Icons';
import { FFDSLogo } from '../FFDSLogo';
import ClientCover from './ClientIntroduction';
import ClientDesignProcess from './ClientDesignProcess';
import ClientDesignFees from './ClientDesignFees';
import ClientTimeline from './ClientTimeline';
import ClientDecisionLock from './ClientDecisionLock';
import ClientSnapshot from './ClientSnapshot';
import ClientOptions from './ClientOptions';
import ClientRoomwise from './ClientRoomwise';
import ClientMaterialSpecs from './ClientMaterialSpecs';
import ClientLevel3Contract from './ClientLevel3Contract';
import ClientMaterials from './ClientMaterials';
import { useOrg } from '../../contexts/OrgContext';
import { useStudioSettings } from '../../hooks/useStudioSettings';

interface ClientExportViewProps {
    tiers: ProposalTier[];
    projectContext: ProjectContext;
    comparisonData: AiComparisonResult;
    timelinePhases: TimelinePhase[];
    paymentMilestones: PaymentMilestone[];
    tasks: ProjectTask[];
    currentRevisionBoq: any[];
    decisionBrainOutput?: DecisionBrainOutput | null;
    level: ProposalLevel;
    materialSuggestions: MaterialSuggestion[];
    onEditSection?: (sectionId: string) => void;
    clientBudget?: number;
    onVisibilityChange?: (visibility: Record<string, boolean>) => void;
    onUpdatePaymentSchedule?: (milestones: PaymentMilestone[], config: { signupDate?: string, possessionDate?: string }) => void;
    setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

interface SectionVisibilityModalProps {
    isOpen: boolean;
    onClose: () => void;
    visibility: Record<string, boolean>;
    onChange: (visibility: Record<string, boolean>) => void;
}

const SectionVisibilityModal: React.FC<SectionVisibilityModalProps> = ({ isOpen, onClose, visibility, onChange }) => {
    if (!isOpen) return null;
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-indigo-950/60 backdrop-blur-md backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-indigo-900">Section Visibility</h3>
                    <button onClick={onClose}><CloseIcon className="w-5 h-5 text-slate-500" /></button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    {Object.keys(visibility || {}).map(key => (
                        <label key={key} className="flex items-center gap-3 py-2 cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded px-2">
                            <input 
                                type="checkbox" 
                                checked={visibility[key]} 
                                onChange={(e) => onChange({...visibility, [key]: e.target.checked})}
                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                            />
                            <span className="text-sm font-medium text-slate-700 capitalize">{key.replace(/_/g, ' ')}</span>
                        </label>
                    ))}
                </div>
            </div>
        </div>,
        document.body
    );
};

const SectionWrapper: React.FC<{ id: string; onEdit?: (id: string) => void; children: React.ReactNode; editButtonClass?: string }> = ({ id, onEdit, children, editButtonClass = "top-4 right-4" }) => (
    <div className="relative group/section">
        {onEdit && (
            <button 
                onClick={(e) => { e.stopPropagation(); onEdit(id); }}
                className={`absolute z-20 p-2 bg-white/90 backdrop-blur rounded-full text-slate-400 hover:text-indigo-600 hover:bg-white shadow-sm border border-slate-200 transition-all opacity-0 group-hover/section:opacity-100 print:hidden ${editButtonClass}`}
                title="Edit Section Text"
            >
                <PencilIcon className="w-3.5 h-3.5" />
            </button>
        )}
        {children}
    </div>
);

const ScanFirstSection: React.FC<{ title: string; cue: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, cue, children, defaultOpen = false }) => (
    <details 
        open={defaultOpen} 
        className="group scan-first mb-4 print:mb-8 scroll-mt-24 break-inside-avoid"
    >
        <summary className="flex items-center justify-between p-2 cursor-pointer list-none outline-none select-none [&::-webkit-details-marker]:hidden mb-2 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-slate-600 group-open:bg-indigo-600 group-open:text-white transition-all shadow-sm border border-slate-200 group-open:border-indigo-600 shrink-0">
                    <ChevronDownIcon className="w-5 h-5 transition-transform duration-300 group-open:rotate-180" />
                </div>
                <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">{cue}</span>
                    <span className="text-lg md:text-xl font-bold text-slate-700 group-open:text-indigo-950 leading-none">{title}</span>
                </div>
            </div>
        </summary>
        <div className="animate-in slide-in-from-top-4 fade-in duration-300 pl-1 md:pl-0">
            {children}
        </div>
    </details>
);

const ClientExportView: React.FC<ClientExportViewProps> = (props) => {
    const { orgData } = useOrg();
    const { settings: fetchedSettings, loading: settingsLoading } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');
    const [paymentStructure, setPaymentStructure] = useState<any>(null);

    useEffect(() => {
        const loadPaymentStructure = async () => {
            const { getPaymentStructure } = await import('../../services/engagementService');
            try {
                const fetchedPaymentStructure = await getPaymentStructure(orgData?.tenantId || 'demo-tenant-01');
                setPaymentStructure(fetchedPaymentStructure);
            } catch (err) {
                console.error("Error loading payment structure", err);
            }
        };
        loadPaymentStructure();
    }, [orgData?.tenantId]);

    // Create a combined settings object matching the requested schema
    const settings = useMemo(() => ({
        companyName: orgData?.orgName || 'Your Studio Name',
        tagline: orgData?.tagline || fetchedSettings?.clientPortalConfig?.introMessage || 'Minimal Design. Maximum Impact.',
        logoUrl: orgData?.orgLogo || '',
        footerText: orgData?.footerText || `${orgData?.orgName || 'Your Studio Name'} · ${orgData?.tagline || fetchedSettings?.clientPortalConfig?.introMessage || 'Minimal Design. Maximum Impact.'}`,
        address: orgData?.officeAddress || 'Studio Office, City',
        email: orgData?.contactEmail || fetchedSettings?.clientPortalConfig?.supportContact || 'hello@studio.com',
        primaryColor: orgData?.themeColor || '#4f46e5',
        accentColor: orgData?.accentColor || orgData?.themeColor || '#4f46e5',
        ...fetchedSettings
    }), [orgData, fetchedSettings]);

    const { level, onEditSection, tiers = [], projectContext, timelinePhases = [], paymentMilestones = [], setProjectContext, clientBudget, onVisibilityChange, onUpdatePaymentSchedule } = props;
    const proposalType = (projectContext.proposalType || 'TURNKEY') as string;
    const [isSectionConfigOpen, setIsSectionConfigOpen] = useState(false);
    
    // Logic for min/max investment
    const investmentValues = tiers.map(t => t.summary?.totalRevenue || t.summary?.totalSell || 0);
    const investmentMin = Math.min(...investmentValues);
    const investmentMax = Math.max(...investmentValues);

    const content = projectContext.proposalContent || {};
    const visibleSections = content.visibleSections || {
        cover: true,
        snapshot: true,
        process: true,
        fees: true,
        options: true,
        timeline: true,
        payments: true,
        cta: true,
        l2_cover: true,
        l2_snapshot: true,
        l2_fees: true,
        l2_scope: true,
        l2_risk: true,
        l2_finishes: true,
        l2_timeline: true,
        footer: true
    };

    const isL2 = level === 'LEVEL_2';
    const isL3 = level === 'LEVEL_3'; 
    
    // For L2, we focus on the approved tier
    const approvedTier = tiers.find(t => t.id === projectContext.approvedTierId) || tiers[0];
    const [previewTierId, setPreviewTierId] = useState<string>(approvedTier?.id || '');

    // --- CALCULATE TOTALS FOR PAYMENTS COMPONENT ---
    // Extract Discounts & Taxes Logic (Same as Snapshot Ledger)
    const financials = projectContext?.financials;
    const discounts = financials?.discounts || [];
    const gstRate = projectContext?.gstRate || 18;
    const isExecutionGstWaived = financials?.executionGstEnabled === false;

    // Use approvedTier values for Level 2 (or active for L1)
    const activeTier = isL2 ? approvedTier : (tiers.find(t => t.id === previewTierId) || tiers[0]);
    const baseExecution = activeTier.summary.totalSell || 0;
    const baseDesign = activeTier.summary.designFee || 0;

    // Calc Discounts
    const executionSavings = discounts
        .filter(d => d.target === 'execution')
        .reduce((sum, d) => sum + (d.type === 'percentage' ? baseExecution * (d.value / 100) : d.value), 0);
    const designSavings = discounts
        .filter(d => d.target === 'design')
        .reduce((sum, d) => sum + (d.type === 'percentage' ? baseDesign * (d.value / 100) : d.value), 0);

    // Taxable
    const taxableExecution = Math.max(0, baseExecution - executionSavings);
    const taxableDesign = Math.max(0, baseDesign - designSavings);

    // GST
    const gstOnDesign = taxableDesign * (gstRate / 100);
    const chargedGstOnExecution = isExecutionGstWaived ? 0 : (taxableExecution * (gstRate / 100));

    // Final Totals to pass to Payment Component
    const finalDesignTotal = taxableDesign + gstOnDesign;
    const finalExecutionTotal = taxableExecution + chargedGstOnExecution;

    // Prepare Financial Breakdown Object for Payments Component
    const paymentsFinancials = {
        design: {
            taxable: taxableDesign,
            gst: gstOnDesign,
            total: finalDesignTotal
        },
        execution: {
            taxable: taxableExecution,
            gst: chargedGstOnExecution,
            total: finalExecutionTotal
        }
    };

    return (
        <div className="vnext-proposal-wrapper pb-10 md:pb-0 bg-white min-h-screen relative" style={{ '--color-primary': settings.primaryColor, '--color-accent': settings.accentColor } as React.CSSProperties}>
            {settingsLoading && (
                <div className="absolute inset-0 bg-white/80 z-[100] flex justify-center items-center backdrop-blur-sm">
                    <div className="flex flex-col items-center">
                        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
                        <p className="mt-4 text-slate-500 font-medium animate-pulse">Loading Studio Configuration...</p>
                    </div>
                </div>
            )}



            {/* L1: CONCEPT VIEW */}
            {!isL2 && !isL3 && (
                <>
                    {visibleSections.cover && (
                        <SectionWrapper id="cover" onEdit={onEditSection}>
                            <ClientCover 
                                projectContext={projectContext} 
                                investmentMin={investmentMin} 
                                investmentMax={investmentMax} 
                                level={level as any}
                                designFee={tiers[0]?.summary?.designFee}
                                executionTotal={tiers[0]?.summary?.totalSell}
                            />
                        </SectionWrapper>
                    )}

                    <div className="max-w-6xl mx-auto px-4 md:px-8 space-y-6 py-8">
                        
                        {visibleSections.snapshot && (
                            <ScanFirstSection title="Executive Summary" cue="At a Glance">
                                <SectionWrapper id="snapshot" onEdit={onEditSection}>
                                    <ClientSnapshot level={level as any} investmentMin={investmentMin} 
                                        investmentMax={investmentMax} 
                                        timelinePhases={timelinePhases}
                                        content={content.snapshot}
                                        designFee={tiers[0]?.summary?.designFee}
                                        executionTotal={tiers[0]?.summary?.totalSell}
                                    />
                                </SectionWrapper>
                            </ScanFirstSection>
                        )}

                        {visibleSections.process && (
                            <ScanFirstSection title="Methodology" cue="Process">
                                <SectionWrapper id="process" onEdit={onEditSection}>
                                    <ClientDesignProcess content={content.process} settings={settings} />
                                </SectionWrapper>
                            </ScanFirstSection>
                        )}

                        {visibleSections.fees && (
                            <ScanFirstSection title="Commercials" cue="Fees">
                                <SectionWrapper id="fees" onEdit={onEditSection}>
                                    <ClientDesignFees 
                                        content={content.fees} 
                                        projectContext={projectContext} 
                                        setProjectContext={setProjectContext}
                                        settings={settings}
                                    />
                                </SectionWrapper>
                            </ScanFirstSection>
                        )}

                        {visibleSections.options && (
                            <ScanFirstSection title="Strategic Options" cue="Scenarios">
                                <SectionWrapper id="options" onEdit={onEditSection}>
                                    <ClientOptions 
                                        tiers={tiers} 
                                        comparisonData={props.comparisonData} 
                                        content={content.options}
                                        activeTierId={previewTierId}
                                        onSelectTier={setPreviewTierId}
                                    />
                                </SectionWrapper>
                            </ScanFirstSection>
                        )}

                        {/* Roomwise Breakdown - Now wrapped in accordion */}
                        <ScanFirstSection title="Detailed Scope Breakdown" cue="Room-by-Room">
                            <div className="break-inside-avoid">
                                <ClientRoomwise tiers={tiers} mode="advisory" activeTierId={previewTierId} />
                            </div>
                        </ScanFirstSection>

                        {/* Specs Comparison - Now wrapped in accordion */}
                        <ScanFirstSection title="Technical Specifications" cue="Material Grades">
                            <div className="break-inside-avoid">
                                <ClientMaterialSpecs comparisonData={props.comparisonData} tiers={tiers} projectContext={projectContext} setProjectContext={setProjectContext} />
                            </div>
                        </ScanFirstSection>

                        {visibleSections.timeline && (
                            <ScanFirstSection title="Schedule" cue="Timeline">
                                <SectionWrapper id="timeline" onEdit={onEditSection}>
                                    <ClientTimeline timelinePhases={timelinePhases} content={content.timeline} />
                                </SectionWrapper>
                            </ScanFirstSection>
                        )}

                        {visibleSections.payments && (
                            <ScanFirstSection title="Payment Terms" cue="Milestones">
                                <SectionWrapper id="payments" onEdit={onEditSection}>
                                    <ClientPayments 
                                        paymentMilestones={paymentMilestones} 
                                        content={content.payments} 
                                        mode={proposalType === 'DESIGN_ONLY' ? 'design_only' : 'standard'}
                                        projectContext={projectContext}
                                        onUpdateSchedule={onUpdatePaymentSchedule}
                                        settings={settings}
                                        paymentStructure={paymentStructure}
                                        // Pass generic totals if needed for L1, but usually L1 is range-based
                                    />
                                </SectionWrapper>
                            </ScanFirstSection>
                        )}
                        
                        {visibleSections.cta && (
                            <ScanFirstSection title="Next Steps" cue="Action" defaultOpen={true}>
                                <SectionWrapper id="cta" onEdit={onEditSection}>
                                    <ClientDecisionLock level={level as any} decision={projectContext.proposalDecision} 
                                        projectName={projectContext.name}
                                    />
                                </SectionWrapper>
                            </ScanFirstSection>
                        )}
                    </div>
                </>
            )}

            {/* L2: PLANNING VIEW */}
            {isL2 && (
                <>
                    <SectionWrapper id="l2_cover" onEdit={onEditSection}>
                        <ClientCover 
                            projectContext={projectContext} 
                            investmentMin={approvedTier.summary.totalRevenue || approvedTier.summary.totalSell} 
                            investmentMax={approvedTier.summary.totalRevenue || approvedTier.summary.totalSell} 
                            level="LEVEL_2"
                            designFee={approvedTier.summary.designFee}
                            executionTotal={approvedTier.summary.totalSell}
                        />
                    </SectionWrapper>

                    <div className="max-w-6xl mx-auto px-4 md:px-8 space-y-6 py-8">
                        {/* L2 Snapshot */}
                        <ScanFirstSection title="Scope Lock" cue="Snapshot" defaultOpen={true}>
                            <SectionWrapper id="l2_snapshot" onEdit={onEditSection}>
                                <ClientSnapshot 
                                    investmentMin={approvedTier.summary.totalSell} 
                                    investmentMax={approvedTier.summary.totalSell} 
                                    timelinePhases={timelinePhases}
                                    content={content.l2_snapshot}
                                    designFee={approvedTier.summary.designFee}
                                    executionTotal={approvedTier.summary.totalSell}
                                    projectContext={projectContext} // Pass context for discounts
                                />
                            </SectionWrapper>
                        </ScanFirstSection>

                        {/* Detailed Roomwise - Standard Mode (Table) */}
                        <ScanFirstSection title="Detailed Scope" cue="Items">
                            <SectionWrapper id="l2_scope" onEdit={onEditSection}>
                                <ClientRoomwise 
                                    tiers={[approvedTier]} 
                                    mode="standard" 
                                    activeTierId={approvedTier.id} 
                                />
                            </SectionWrapper>
                        </ScanFirstSection>

                        {/* Single Tier Specs */}
                        <ScanFirstSection title="Technical Specifications" cue="Materials">
                            <ClientMaterialSpecs 
                                comparisonData={props.comparisonData} 
                                tiers={[approvedTier]} 
                                isLevel2={true}
                                projectContext={projectContext}
                                setProjectContext={setProjectContext}
                            />
                        </ScanFirstSection>

                        {/* L2 Fees / Commercials */}
                        <ScanFirstSection title="Commercial Terms" cue="Fees">
                            <SectionWrapper id="l2_fees" onEdit={onEditSection}>
                                <ClientDesignFees 
                                    content={content.l2_fees || content.fees} 
                                    projectContext={projectContext}
                                    setProjectContext={setProjectContext}
                                    fixedFee={approvedTier.summary.designFee} // PASS FIXED FEE HERE
                                    settings={settings}
                                />
                            </SectionWrapper>
                        </ScanFirstSection>

                        {visibleSections.payments && (
                            <ScanFirstSection title="Payment Terms" cue="Milestones">
                                <SectionWrapper id="payments" onEdit={onEditSection}>
                                    <ClientPayments 
                                        paymentMilestones={paymentMilestones} 
                                        content={content.payments} 
                                        mode={proposalType === 'DESIGN_ONLY' ? 'design_only' : 'standard'}
                                        projectContext={projectContext}
                                        onUpdateSchedule={onUpdatePaymentSchedule}
                                        // Pass detailed breakdown for L2
                                        financials={paymentsFinancials}
                                        settings={settings}
                                        paymentStructure={paymentStructure}
                                    />
                                </SectionWrapper>
                            </ScanFirstSection>
                        )}

                        <ScanFirstSection title="Readiness" cue="Risk">
                            <SectionWrapper id="l2_risk" onEdit={onEditSection}>
                                {/* L2 Risk Content or Footer Actions */}
                                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                                    <h3 className="font-bold text-indigo-900 mb-2">Execution Readiness</h3>
                                    <p className="text-sm text-slate-600">By approving this Level 2 document, you confirm the scope and specifications are final.</p>
                                </div>
                            </SectionWrapper>
                        </ScanFirstSection>
                    </div>
                </>
            )}

            {/* L3: CONTRACT VIEW */}
            {isL3 && (
                <div className="bg-slate-100 py-8">
                    <ClientLevel3Contract 
                        projectId={projectContext.id}
                        setProjectContext={props.setProjectContext}
                        tier={approvedTier} 
                        projectContext={projectContext} 
                        fullBoq={approvedTier?.fullBoq || []} 
                        timelinePhases={timelinePhases} 
                        paymentMilestones={paymentMilestones} 
                        settings={settings}
                    />
                </div>
            )}

            {/* Footer */}
            <div id="terms" className="page-break-before rounded-3xl border border-slate-200 bg-white p-8 md:p-12 print-only-block hidden print:block">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Annexure A</div>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-indigo-950 border-b-2 border-indigo-950 pb-4">Standard Terms & Conditions</h2>
                
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-12 text-xs text-slate-600 leading-relaxed">
                    <div className="space-y-6">
                        <div>
                            <h4 className="font-bold text-indigo-950 uppercase tracking-wide mb-2">1. Validity of Proposal</h4>
                            <p>This proposal is valid for {settings?.clientPortalConfig?.validityDays || 15} days from the date of issue. Prices are subject to change based on market fluctuations in raw material costs beyond this period.</p>
                        </div>
                        <div>
                            <h4 className="font-bold text-indigo-950 uppercase tracking-wide mb-2">2. Scope of Work</h4>
                            <p>The scope is limited to the items explicitly mentioned in the "Room-wise Breakdown". Any additional work requested during execution will be billed separately as "Extra Items" at prevailing rates.</p>
                        </div>
                        <div>
                            <h4 className="font-bold text-indigo-950 uppercase tracking-wide mb-2">3. Payment Terms</h4>
                            <p>Work will proceed only upon receipt of payments as per the agreed milestone schedule. Delays in payment may lead to site stoppage and revision of the handover date.</p>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <h4 className="font-bold text-indigo-950 uppercase tracking-wide mb-2">4. Design Approvals</h4>
                            <p>All designs, material selections, and drawings must be signed off by the client before production begins. Changes requested after sign-off may incur additional costs and time.</p>
                        </div>
                        <div>
                            <h4 className="font-bold text-indigo-950 uppercase tracking-wide mb-2">5. Site Access & Utilities</h4>
                            <p>The client must ensure continuous access to the site, along with provision for electricity and water required for execution. Any society/government permissions are the client's responsibility unless mentioned otherwise.</p>
                        </div>
                        <div>
                            <h4 className="font-bold text-indigo-950 uppercase tracking-wide mb-2">6. Warranty</h4>
                            <p>{orgData?.orgName || 'The Studio'} provides a 5-year limited warranty on modular carpentry and a 1-year service warranty on general contracting work. Manufacturer warranties apply for hardware and appliances.</p>
                        </div>
                    </div>
                </div>

                <div className="mt-12 p-6 bg-slate-50 rounded-2xl border border-slate-200 text-[10px] text-slate-500 italic">
                    Note: This document is a digital proposal generated by {settings.companyName}. Upon acceptance, a formal legal contract will be executed on stamp paper incorporating these terms.
                </div>
            </div>

            {/* Footer */}
            <div className="bg-indigo-950 text-slate-400 py-12 text-center print:hidden">
                <SectionWrapper id="footer" onEdit={onEditSection}>
                    <p className="font-bold text-white text-lg mb-2">{settings.companyName}</p>
                    <p className="text-sm">{settings.tagline}</p>
                    <p className="text-xs mt-4 opacity-60">{settings.footerText}</p>
                </SectionWrapper>
            </div>
            
            <SectionVisibilityModal isOpen={isSectionConfigOpen} onClose={() => setIsSectionConfigOpen(false)} visibility={visibleSections} onChange={onVisibilityChange || (() => {})} />
        </div>
    );
};

export default ClientExportView;
