import React, { useState } from 'react';
import { ProjectContext, TermsDocket, TermsConfig } from '../../types';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import { FileText, Send, CheckCircle2, Download, AlertTriangle, Eye, Check } from 'lucide-react';
import { id as generateId } from '../../lib/utils';
import { useOrg } from '../../contexts/OrgContext';
import { StudioDocumentShell } from '../ops/documents/StudioDocumentShell';

interface TermsDocketPageProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    tenantId?: string;
}

export default function TermsDocketPage({ projectContext, setProjectContext, tenantId }: TermsDocketPageProps) {
    const { settings } = useStudioSettings(tenantId || '');
    const { orgData } = useOrg();
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewMode, setPreviewMode] = useState(true);

    const dockets = projectContext.termsDockets || [];
    const latestDocket = dockets[dockets.length - 1];

    const handleGenerate = () => {
        setIsGenerating(true);
        setTimeout(() => {
            const configInfo = settings?.termsConfig || {
                warrantyCivilMonths: 12,
                warrantyCarpentryMonths: 12,
                warrantyPaintingMonths: 6,
                warrantyElectricalMonths: 6,
                includedRevisionRounds: 2,
                pauseThresholdDays: 7,
                changeRequestResponseDays: 5,
                snagCategoryADays: 7,
                snagCategoryBDays: 21,
                jurisdiction: "Thane, Maharashtra",
                signatoryName: "Ar. Mayuri Kaulgud",
                signatoryTitle: "Principal Architect",
                customClauses: []
            };

            const year = new Date().getFullYear();
            const nnn = String(Math.floor(Math.random() * 900) + 100);
            const newDocket: TermsDocket = {
                id: generateId(),
                docketRef: `FFDS-TD-${year}-${nnn}`,
                status: 'draft',
                generatedAt: Date.now(),
                sentAt: null,
                sentBy: 'System',
                acknowledgedAt: null,
                snapshotTermsConfig: configInfo,
                snapshotClientData: {
                    clientName: projectContext.clientName || 'Valued Client',
                    projectName: projectContext.name,
                    date: new Date().toLocaleDateString('en-IN')
                }
            };
            
            setProjectContext(prev => {
                const existingDockets = prev.termsDockets || [];
                const filteredDockets = existingDockets.filter(d => d.status !== 'draft');
                return {
                    ...prev,
                    termsDockets: [...filteredDockets, newDocket]
                };
            });
            setIsGenerating(false);
        }, 600);
    };

    const handleSend = () => {
        if (!latestDocket) return;
        const updated = { ...latestDocket, status: 'sent' as const, sentAt: Date.now() };
        setProjectContext(prev => ({
            ...prev,
            termsDockets: prev.termsDockets?.map(d => d.id === latestDocket.id ? updated : d)
        }));
    };

    const handleAcknowledge = () => {
        if (!latestDocket) return;
        const updated = { ...latestDocket, status: 'acknowledged' as const, acknowledgedAt: Date.now() };
        setProjectContext(prev => ({
            ...prev,
            termsDockets: prev.termsDockets?.map(d => d.id === latestDocket.id ? updated : d)
        }));
    };

    const missingData = [];
    if (!orgData.orgName) missingData.push("Studio Name");
    if (!projectContext.clientName) missingData.push("Client Name");
    if (!projectContext.name) missingData.push("Project Name");
    
    const isValid = missingData.length === 0;

    const handleDownloadPdf = () => {
        if (!latestDocket || !isValid) return;
        const element = document.getElementById('terms-docket-pdf-render');
        if (element) {
            import('html2pdf.js').then((module) => {
                let html2pdfObj: any;
                const html2pdf = module as any;
                if (typeof html2pdf === 'function') {
                    html2pdfObj = html2pdf;
                } else if (html2pdf && typeof html2pdf.default === 'function') {
                    html2pdfObj = html2pdf.default;
                } else if (html2pdf.default && typeof html2pdf.default.default === 'function') {
                    html2pdfObj = html2pdf.default.default;
                }
                if (!html2pdfObj) {
                     alert("PDF tools not loading");
                     return;
                }                const opt = {
                    margin: 0,
                    filename: `FFDS-Terms-${latestDocket.docketRef}.pdf`,
                    image: { type: 'jpeg' as const, quality: 1 },
                    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
                };
                html2pdfObj().set(opt).from(element).save();
            }).catch(err => {
                console.error("Failed to load html2pdf", err);
            });
        }
    };

    if (!latestDocket) {
        return (
            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in">
                <div className="bg-white border text-center border-slate-200 p-16 rounded-3xl shadow-sm">
                    <FileText className="w-16 h-16 text-slate-300 mx-auto mb-6" />
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Terms of Engagement Docket</h2>
                    <p className="text-slate-500 mt-2 max-w-lg mx-auto">
                        Generate the foundational framework docket. This sets the rules of engagement (warranties, snags, revisions) before any work begins. It relies on the Advance Payment Schedule for specific amounts.
                    </p>
                    <button onClick={handleGenerate} disabled={isGenerating} className="mt-8 px-6 py-3 bg-[#2f4a2e] text-white font-bold rounded-xl shadow-sm hover:bg-[#1a2d19] transition flex items-center justify-center mx-auto gap-2">
                        {isGenerating ? 'Generating...' : 'Generate Docket'}
                    </button>
                </div>
            </div>
        );
    }

    const { snapshotTermsConfig, snapshotClientData } = latestDocket;

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in pb-20">
            {/* Header Actions */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200 no-print">
                <div className="flex items-center gap-4">
                    <div className="bg-[#f7f1e6] p-3 rounded-xl border border-[#d9d6cc]">
                        <FileText className="w-6 h-6 text-[#6f7f52]" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 leading-tight">Terms Docket <span className="font-mono text-slate-500 ml-2 text-sm">{latestDocket.docketRef}</span></h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${latestDocket.status === 'draft' ? 'bg-slate-100 text-slate-600' : latestDocket.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {latestDocket.status}
                            </span>
                            <span className="text-xs text-slate-500">
                                Generated {new Date(latestDocket.generatedAt).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => setPreviewMode(!previewMode)} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition flex items-center gap-2">
                        <Eye className="w-4 h-4" /> {previewMode ? 'Exit Preview' : 'Preview as PDF'}
                    </button>
                    <button onClick={handleDownloadPdf} disabled={!isValid} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <Download className="w-4 h-4" /> Download PDF
                    </button>
                    {latestDocket.status === 'draft' && (
                        <>
                            <button onClick={handleSend} className="px-4 py-2 bg-[#2f4a2e] border border-[#2f4a2e] text-white font-bold text-sm rounded-lg hover:bg-[#1a2d19] transition flex items-center gap-2 shadow-sm">
                                <Send className="w-4 h-4" /> Mark as Sent
                            </button>
                        </>
                    )}
                    {latestDocket.status === 'sent' && (
                        <button onClick={handleAcknowledge} className="px-4 py-2 bg-emerald-600 border border-emerald-600 text-white font-bold text-sm rounded-lg hover:bg-emerald-700 transition flex items-center gap-2 shadow-sm">
                            <Check className="w-4 h-4" /> Mark as Acknowledged
                        </button>
                    )}
                </div>
            </div>

            {!isValid && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-3 no-print">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <p className="text-sm text-red-800 font-medium">Cannot export PDF. Missing required data: {missingData.join(', ')}. Please update in settings or project details.</p>
                </div>
            )}

            {/* Document Render Container */}
            <div className={`transition-all duration-500 ${previewMode ? 'bg-[#e2e8f0] p-8 -mx-8 flex justify-center rounded-3xl overflow-x-auto shadow-inner' : ''}`}>
                <div id="terms-docket-pdf-render" className={previewMode ? 'print-only' : ''}>
                    <StudioDocumentShell 
                        orgData={orgData} 
                        docHeaderType="DOCUMENT 1 OF 2" 
                        docHeaderTitle="TERMS OF ENGAGEMENT\nGOVERNING DOCKET" 
                        pageCount={3}
                    >
                        <div className="space-y-8" style={{ fontSize: '11px', lineHeight: '1.6' }}>
                            <div className="text-center space-y-2 border-b border-[#d9d6cc] pb-8">
                                <h1 className="text-2xl font-bold uppercase tracking-widest text-[#2f4a2e] m-0">Terms of Engagement</h1>
                                <p className="text-[#666666] max-w-2xl mx-auto my-0">This document establishes the framework governing all projects undertaken by Form Factors Design Studio. It is to be read and acknowledged before any design work, proposal, or Discovery Workshop commences. Specific project scope and the advance payment schedule are covered in separate documents.</p>
                            </div>

                            <div className="metadata-grid bg-[#f7f1e6] p-5 rounded-md border border-[#d9d6cc] grid grid-cols-2 gap-4 text-[11px]" style={{ pageBreakInside: 'avoid' }}>
                                <div>
                                    <p className="font-bold text-[#6f7f52] uppercase tracking-wider text-[9px] mb-1 m-0">Client Name</p>
                                    <p className="font-semibold text-[#222222] m-0">{snapshotClientData.clientName}</p>
                                </div>
                                <div>
                                    <p className="font-bold text-[#6f7f52] uppercase tracking-wider text-[9px] mb-1 m-0">Date Issued</p>
                                    <p className="font-semibold text-[#222222] m-0">{snapshotClientData.date}</p>
                                </div>
                                <div>
                                    <p className="font-bold text-[#6f7f52] uppercase tracking-wider text-[9px] mb-1 m-0">Project Name</p>
                                    <p className="font-semibold text-[#222222] m-0">{snapshotClientData.projectName}</p>
                                </div>
                                <div>
                                    <p className="font-bold text-[#6f7f52] uppercase tracking-wider text-[9px] mb-1 m-0">Docket Reference</p>
                                    <p className="font-semibold text-[#222222] m-0">{latestDocket.docketRef}</p>
                                </div>
                            </div>

                            <div className="space-y-6 text-[#222222]">
                                <div className="section-block">
                                    <h3 className="font-bold text-[#2f4a2e] text-[13px] uppercase tracking-wide border-b border-[#d9d6cc] pb-1 mb-2">SECTION 1<br/>About Form Factors Design Studio</h3>
                                    <p className="mb-2"><strong>1.1</strong> Form Factors Design Studio ("FFDS" or "the Studio") is a design-led practice founded in 2018, providing end-to-end architectural design, interior design, and turnkey execution services. Every project is approached with clarity, care, and purposeful intent, from the first conversation to the final handover.</p>
                                    <p className="m-0"><strong>1.2</strong> The Studio acts as the client's single point of contact for the entire project duration, coordinating design development, contractor management, material procurement guidance, and site oversight. All project instructions, approvals, and communications must flow through the Studio.</p>
                                </div>

                                <div className="section-block">
                                    <h3 className="font-bold text-[#2f4a2e] text-[13px] uppercase tracking-wide border-b border-[#d9d6cc] pb-1 mb-2">SECTION 2<br/>The Design Process</h3>
                                    <p className="mb-2"><strong>2.1</strong> FFDS follows a structured process for every project. The specific phases applicable to a given project are defined in the Design Agreement. The standard phases are: Discovery Workshop → Space Planning → Concept Development & Visualisation → Working Drawings & BOQ → Execution → Handover. Not all phases apply to every project type.</p>
                                    <p className="mb-2"><strong>2.2</strong> The client agrees to provide timely feedback, approvals, and inputs at each stage. Project delays caused by late client feedback or approvals do not constitute delays attributable to the Studio and may impact the project timeline at no liability to FFDS.</p>
                                    <p className="mb-2"><strong>2.3</strong> Once the Design Brief is formally frozen at the conclusion of the Discovery phase, any changes to agreed scope, room requirements, or design direction must be submitted as a formal Change Request. The Studio will communicate cost and timeline impact within 5 working days of receiving a Change Request.</p>
                                    <p className="m-0"><strong>2.4</strong> The Design Agreement includes a defined number of design revision rounds within the Concept Development phase. This number is specified in the Design Agreement. Additional revision rounds beyond the included scope are charged at the rate stated in the Design Agreement.</p>
                                </div>

                                <div className="section-block" style={{ pageBreakInside: 'avoid' }}>
                                    <h3 className="font-bold text-[#2f4a2e] text-[13px] uppercase tracking-wide border-b border-[#d9d6cc] pb-1 mb-2">SECTION 3<br/>Advance Payment Framework</h3>
                                    <p className="mb-3"><strong>3.1</strong> All payments in FFDS projects are structured as advance payments. Each payment is made before the corresponding phase of work commences, not after. The specific advance schedule, amounts, and unlock conditions for each project are set out in the Payment Schedule document, which is issued alongside the Design Agreement.</p>
                                    
                                    <div className="highlight-box bg-[#f7f1e6] border border-[#6f7f52] p-4 rounded-md mb-3" style={{ pageBreakInside: 'avoid' }}>
                                        <h4 className="font-bold text-[#2f4a2e] text-[11px] tracking-wider uppercase m-0 mb-1">THE ADVANCE PAYMENT PRINCIPLE</h4>
                                        <p className="m-0 text-[#2f4a2e] font-semibold">No phase of work commences until the advance payment for that phase has been received and cleared. <span className="font-normal text-[#222222]">This applies to every milestone in the Payment Schedule, including design phases, execution phases, and the final handover. The Payment Schedule issued with the Design Agreement specifies exactly what each advance unlocks.</span></p>
                                    </div>
                                    
                                    <p className="mb-2"><strong>3.2</strong> The final advance in the Payment Schedule is tied to the formal project handover. It unlocks the Project Handover Dossier, all keys and access cards, and the Warranty Certificate. This advance is due upon completion of all installation and finishing work, irrespective of any snag items.</p>
                                    <p className="mb-2"><strong>3.3</strong> The Studio reserves the right to pause all site activity and design work if any advance payment remains unpaid more than {snapshotTermsConfig.pauseThresholdDays} days beyond its due date, without liability for any project delay arising thereof. Activity resumes within 2 working days of payment clearance.</p>
                                    <p className="mb-2"><strong>3.4</strong> All payments are to be made via NEFT / RTGS / UPI to the bank account specified on the invoice. Payment is considered received only upon clearance into the Studio's designated account. GST at 18% applies to all amounts unless otherwise specified in the Design Agreement.</p>
                                    <p className="m-0"><strong>3.5</strong> If the Payment Schedule is revised due to scope changes, the revised Payment Schedule supersedes the previous version for outstanding advances only. Advances already received are not affected by a Payment Schedule revision.</p>
                                </div>

                                <div className="page-break-before"></div>
                                <div className="h-4"></div>

                                <div className="section-block mt-4">
                                    <h3 className="font-bold text-[#2f4a2e] text-[13px] uppercase tracking-wide border-b border-[#d9d6cc] pb-1 mb-2">SECTION 4<br/>Execution & Site Protocol</h3>
                                    <p className="mb-2"><strong>4.1</strong> Unobstructed site access must be provided to the Studio's team and contractors during agreed execution hours. Delays caused by restricted site access are not attributable to the Studio.</p>
                                    <p className="mb-2"><strong>4.2</strong> All client site visits during the execution phase must be coordinated in advance with the Studio's site supervisor. Unannounced visits during active construction phases are strongly discouraged for safety reasons.</p>
                                    <p className="mb-2"><strong>4.3</strong> The client agrees not to issue instructions directly to contractors. All instructions regarding execution must flow through the Studio's project team. Verbal instructions given directly to contractors without the Studio's authorisation will not be treated as binding and may result in additional rectification costs.</p>
                                    <p className="m-0"><strong>4.4</strong> Materials or fittings procured independently by the client outside the Studio's guidance are not covered by the Studio's workmanship warranty. The Studio will endeavour to accommodate client-supplied materials but accepts no responsibility for their quality or compatibility with the design.</p>
                                </div>

                                <div className="section-block">
                                    <h3 className="font-bold text-[#2f4a2e] text-[13px] uppercase tracking-wide border-b border-[#d9d6cc] pb-1 mb-2">SECTION 5<br/>Change Requests & Scope Additions</h3>
                                    <p className="mb-2"><strong>5.1</strong> Any change to agreed scope, addition, deletion, or modification, requires a formal Change Request. The Studio will assess and communicate cost and timeline impact within 5 working days.</p>
                                    <p className="mb-2"><strong>5.2</strong> No Change Request will be executed until approved in writing by the client and the corresponding additional advance has been invoiced and received. WhatsApp or email confirmation constitutes valid written approval for Change Requests.</p>
                                    <p className="m-0"><strong>5.3</strong> Approved Change Requests that affect the project cost will result in a revised Payment Schedule being issued. The framework governing advance payments applies to the revised schedule without requiring a new Terms of Engagement acknowledgement.</p>
                                </div>

                                <div className="section-block">
                                    <h3 className="font-bold text-[#2f4a2e] text-[13px] uppercase tracking-wide border-b border-[#d9d6cc] pb-1 mb-2">SECTION 6<br/>Pre-Handover Inspection, Snag Policy & Final Advance</h3>
                                    <p className="mb-2"><strong>6.1</strong> Upon completion of all installation and finishing work, the Studio will conduct a formal Pre-Handover Walkthrough with the client. Observations will be documented in a Snag List.</p>
                                    <p className="mb-2"><strong>6.2</strong> A snag is a minor defect in workmanship or finish that does not impair the functional use of the space. A snag does not include design preferences differing from approved visuals, items outside agreed scope, normal material tolerances, or third-party product defects covered by manufacturer warranty.</p>
                                    <p className="mb-3"><strong>6.3</strong> Snag items are addressed within the warranty period. Category A snags are addressed within {snapshotTermsConfig.snagCategoryADays} working days. Category B snags are addressed within {snapshotTermsConfig.snagCategoryBDays} days. The Studio's commitment to resolving legitimate snag items exists independently of payment status.</p>
                                    
                                    <div className="highlight-box bg-white border-l-4 border-[#2f4a2e] py-3 pl-4 rounded-r-md my-4 shadow-sm" style={{ pageBreakInside: 'avoid' }}>
                                        <h3 className="font-bold text-[#2f4a2e] text-[11px] tracking-wider mb-2 m-0 uppercase">IMPORTANT: CLAUSE 6.4 — FINAL ADVANCE & HANDOVER</h3>
                                        <p className="mb-2 font-semibold">The final advance payment in the Payment Schedule is due upon completion of all installation and finishing work. This is the advance that releases the Project Handover Dossier, all keys and access cards, and the Warranty Certificate. This advance is not conditional upon the clearance of snag items.</p>
                                        <p className="m-0 text-[#444444]">Snag items are post-completion rectifications falling within warranty coverage. They do not constitute grounds to withhold the final advance. The Studio commits to addressing all legitimate snags documented in the Snag List. Withholding the final advance against pending snag items constitutes a breach of payment terms.</p>
                                    </div>
                                </div>

                                <div className="section-block">
                                    <h3 className="font-bold text-[#2f4a2e] text-[13px] uppercase tracking-wide border-b border-[#d9d6cc] pb-1 mb-2">SECTION 7<br/>Warranty</h3>
                                    <p className="mb-2"><strong>7.1</strong> FFDS provides workmanship warranty on completed execution work from the date of formal handover. Warranty periods by trade are specified in the Design Agreement and vary by project scope.</p>
                                    <p className="mb-2"><strong>7.2</strong> Standard warranty coverage: Civil work and carpentry, {snapshotTermsConfig.warrantyCivilMonths >= 12 ? (snapshotTermsConfig.warrantyCivilMonths/12) + " year" : snapshotTermsConfig.warrantyCivilMonths + " months"}. Painting and electrical, {snapshotTermsConfig.warrantyPaintingMonths} months. These periods may be adjusted in the Design Agreement for specific project types.</p>
                                    <p className="mb-2"><strong>7.3</strong> Warranty covers workmanship defects under normal usage. It excludes damage from misuse, negligence, post-handover modifications, building-level water ingress, or normal wear and tear. Warranty is valid only when all outstanding advances have been cleared in full.</p>
                                    <p className="m-0"><strong>7.4</strong> Warranty claims must be submitted in writing. Site assessment within 7 working days of a reported claim.</p>
                                </div>

                                <div className="section-block">
                                    <h3 className="font-bold text-[#2f4a2e] text-[13px] uppercase tracking-wide border-b border-[#d9d6cc] pb-1 mb-2">SECTION 8<br/>Intellectual Property</h3>
                                    <p className="m-0"><strong>8.1</strong> All design drawings, 3D visualisations, material specifications, and documentation created by FFDS remain the intellectual property of Form Factors Design Studio. Upon receipt of all due payments in full, the client receives a non-exclusive licence to use the design for the agreed project site only.</p>
                                </div>

                                <div className="section-block">
                                    <h3 className="font-bold text-[#2f4a2e] text-[13px] uppercase tracking-wide border-b border-[#d9d6cc] pb-1 mb-2">SECTION 9<br/>Communication Protocol</h3>
                                    <p className="mb-2"><strong>9.1</strong> All project approvals, scope sign-offs, Change Request authorisations, and formal decisions must be confirmed in writing via email or WhatsApp message to be valid. Verbal confirmations in person or over a call do not constitute authorisation and will not be treated as binding.</p>
                                    <p className="m-0"><strong>9.2</strong> The Studio maintains a record of all approvals, milestones, and communications. The client is encouraged to retain all project-related correspondence.</p>
                                </div>

                                <div className="section-block mb-8">
                                    <h3 className="font-bold text-[#2f4a2e] text-[13px] uppercase tracking-wide border-b border-[#d9d6cc] pb-1 mb-2">SECTION 10<br/>Dispute Resolution</h3>
                                    <p className="m-0"><strong>10.1</strong> Disputes are first to be resolved through good-faith mediation. If unresolved within 30 days, disputes are subject to the exclusive jurisdiction of the courts in {snapshotTermsConfig.jurisdiction}.</p>
                                </div>
                            </div>

                            <div className="signature-block mt-8 pt-8 border-t border-[#d9d6cc] grid grid-cols-2 gap-8" style={{ pageBreakInside: 'avoid' }}>
                                <div>
                                    <div className="h-12 mb-2"></div>
                                    <div className="w-48 border-t border-[#222222]"></div>
                                    <p className="mt-2 font-bold text-[12px] text-[#222222] m-0">Client Signature & Date</p>
                                    <p className="text-[10px] text-[#666666] m-0">{snapshotClientData.clientName}</p>
                                </div>
                                <div>
                                    <div className="h-12 mb-2"></div>
                                    <div className="w-48 border-t border-[#222222]"></div>
                                    <p className="mt-2 font-bold text-[12px] text-[#222222] m-0">For Form Factors Design Studio</p>
                                    <p className="text-[10px] text-[#666666] m-0">{snapshotTermsConfig.signatoryName}<br/>{snapshotTermsConfig.signatoryTitle}</p>
                                </div>
                            </div>
                        </div>
                    </StudioDocumentShell>
                </div>
            </div>
        </div>
    );
}
