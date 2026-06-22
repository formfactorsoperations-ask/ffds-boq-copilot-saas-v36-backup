import React, { useState } from 'react';
import { ProjectContext, PaymentSchedule } from '../../types';
import { FileText, Send, Download, AlertTriangle, ArrowRight, History, Eye } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { useOrg } from '../../contexts/OrgContext';
import { StudioDocumentShell } from '../ops/documents/StudioDocumentShell';

interface PaymentSchedulePageProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

export default function PaymentSchedulePage({ projectContext, setProjectContext }: PaymentSchedulePageProps) {
    const { orgData } = useOrg();
    const [previewMode, setPreviewMode] = useState(true);
    const schedules = projectContext.paymentSchedules || [];
    const latestSchedule = schedules.find(s => !s.supersededBy) || schedules[0]; // Active version
    
    // Sort history by version desc
    const sortedHistory = [...schedules].sort((a,b) => b.version - a.version);

    const handleSend = () => {
        if (!latestSchedule) return;
        const updated = { ...latestSchedule, status: 'sent' as const };
        setProjectContext(prev => ({
            ...prev,
            paymentSchedules: prev.paymentSchedules?.map(d => d.id === latestSchedule.id ? updated : d)
        }));
    };

    const handleRegenerate = () => {
        if (!latestSchedule) return;
        const milestones = projectContext.paymentMilestones || [];
        const contractValue = latestSchedule.contractValue;
        
        const newAdvances = milestones.map((m, i) => ({
            advanceCode: (m.type === 'design' ? 'D' : 'E') + (i + 1),
            label: (m.name || '').replace(' (Gross)', ''),
            phase: m.type as 'design' | 'execution' | 'handover',
            percentage: m.percentage,
            amount: contractValue ? (contractValue * m.percentage) / 100 : 0,
            dueCondition: m.type === 'execution' ? 'Advance before ' + (m.name || '').replace(' (Gross)', '').toLowerCase() : 'On completion of ' + (m.name || '').replace(' (Gross)', ''),
            unlocks: m.unlocks || '',
            status: m.status === 'invoiced' ? 'advance_requested' : m.status === 'paid' ? 'received' : 'pending',
            invoiceRef: m.invoiceNumber || null,
            receivedAt: null,
            isHandoverAdvance: m.isHandoverAdvance || false
        }));

        const newSchedule = {
            ...latestSchedule,
            issuedAt: Date.now(),
            advances: newAdvances
        };

        setProjectContext(prev => {
            const existing = prev.paymentSchedules || [];
            const filtered = existing.filter(s => s.status !== 'draft');
            return {
                ...prev,
                paymentSchedules: [...filtered, newSchedule as any]
            };
        });
    };

    const missingData = [];
    if (!orgData.orgName) missingData.push("Studio Name");
    if (!projectContext.clientName) missingData.push("Client Name");
    if (!projectContext.name) missingData.push("Project Name");
    if (latestSchedule && !latestSchedule.docketRef) missingData.push("Governing Docket Ref");
    
    const isValid = missingData.length === 0;

    const handleDownloadPdf = () => {
        if (!latestSchedule || !isValid) return;
        const element = document.getElementById('payment-schedule-pdf-render');
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
                }
                const opt = {
                    margin: 0,
                    filename: `FFDS-PaymentSchedule-${projectContext.name}-v${latestSchedule.version}.pdf`,
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

    if (!latestSchedule) {
        return (
            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in">
                <div className="bg-white border text-center border-slate-200 p-16 rounded-3xl shadow-sm">
                    <FileText className="w-16 h-16 text-slate-300 mx-auto mb-6" />
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Advance Payment Schedule</h2>
                    <p className="text-slate-500 mt-2 max-w-lg mx-auto">
                        No payment schedule has been generated yet for this project. Head over to <strong>Payment Calc</strong> to set up your milestones and generate the Schedule document.
                    </p>
                </div>
            </div>
        );
    }

    // Grouping logic for the PDF table
    const designAdvances = latestSchedule.advances.filter(a => a.phase === 'design');
    const executionAdvances = latestSchedule.advances.filter(a => a.phase === 'execution');
    const handoverAdvances = latestSchedule.advances.filter(a => a.phase === 'handover' || a.isHandoverAdvance);

    const formatAdvanceRow = (adv: any, index: number, isHandoverBlock: boolean = false) => (
        <tr key={index} className={`advance-table-row border-b border-[#d9d6cc] ${isHandoverBlock || adv.isHandoverAdvance ? 'bg-[#f7f1e6] font-bold text-[#222222]' : 'text-[#444444]'}`} style={{ pageBreakInside: 'avoid' }}>
            <td className="py-3 px-2 text-center border-r border-[#d9d6cc] w-8">{adv.advanceCode || index + 1}</td>
            <td className="py-3 px-3">
                {adv.label}
                {isHandoverBlock || adv.isHandoverAdvance ? <div className="text-[9px] text-[#6f7f52] mt-0.5 uppercase tracking-wide">Final Advance</div> : null}
            </td>
            <td className="py-3 px-3 text-center">{adv.percentage}%</td>
            <td className="py-3 px-3 text-right">₹{adv.amount ? adv.amount.toLocaleString('en-IN') : '--'}</td>
            <td className="py-3 px-3 italic min-w-[120px]">{adv.dueCondition}</td>
            <td className="py-3 px-3 font-medium min-w-[140px] text-[#2f4a2e]">{adv.unlocks || 'Next Phase'}</td>
        </tr>
    );

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in pb-20 font-sans">
            
            {/* Header Actions */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200 no-print">
                <div className="flex items-center gap-4">
                    <div className="bg-[#f7f1e6] p-3 rounded-xl border border-[#d9d6cc]">
                        <FileText className="w-6 h-6 text-[#6f7f52]" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 leading-tight">Payment Schedule <span className="font-mono text-slate-500 ml-2 text-sm">{latestSchedule.versionLabel}</span></h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${latestSchedule.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {latestSchedule.status === 'draft' ? 'Draft Version' : 'Sent & Current'}
                            </span>
                            <span className="text-xs text-slate-500">
                                Governed by Docket: <strong className="text-slate-700 font-mono">{latestSchedule.docketRef || 'None'}</strong>
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
                    {latestSchedule.status === 'draft' && (
                        <>
                            <button onClick={handleRegenerate} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition flex items-center gap-2">
                                Regenerate
                            </button>
                            <button onClick={handleSend} className="px-4 py-2 bg-[#2f4a2e] border border-[#2f4a2e] text-white font-bold text-sm rounded-lg hover:bg-[#1a2d19] transition flex items-center gap-2 shadow-sm">
                                <Send className="w-4 h-4" /> Mark as Sent
                            </button>
                        </>
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
                <div id="payment-schedule-pdf-render" className={previewMode ? 'print-only' : ''}>
                    <StudioDocumentShell 
                        orgData={orgData} 
                        docHeaderType="DOCUMENT 2 OF 2" 
                        docHeaderTitle="ADVANCE PAYMENT SCHEDULE\nPROJECT-SPECIFIC" 
                        pageCount={2}
                    >
                        <div className="space-y-8" style={{ fontSize: '11px', lineHeight: '1.6' }}>
                            <div className="text-center space-y-2 border-b border-[#d9d6cc] pb-8">
                                <h1 className="text-2xl font-bold uppercase tracking-widest text-[#2f4a2e] m-0">Advance Payment Schedule</h1>
                                <p className="text-[#666666] max-w-2xl mx-auto my-0">Project-specific advance payment structure for the engagement. This document is governed by and to be read alongside the Terms of Engagement Docket ({latestSchedule.docketRef || '_____'}). It may be revised by mutual agreement. Revisions do not require re-acknowledgement of the Terms of Engagement Docket.</p>
                            </div>

                            <div className="metadata-grid bg-[#f7f1e6] p-5 rounded-md border border-[#d9d6cc] grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-2 text-[11px]" style={{ pageBreakInside: 'avoid' }}>
                                <div>
                                    <p className="font-bold text-[#6f7f52] uppercase tracking-wider text-[9px] mb-1 m-0">Version</p>
                                    <p className="font-semibold text-[#222222] m-0">v{latestSchedule.version}.0</p>
                                </div>
                                <div>
                                    <p className="font-bold text-[#6f7f52] uppercase tracking-wider text-[9px] mb-1 m-0">Issued Date</p>
                                    <p className="font-semibold text-[#222222] m-0">{new Date(latestSchedule.issuedAt).toLocaleDateString('en-IN')}</p>
                                </div>
                                <div>
                                    <p className="font-bold text-[#6f7f52] uppercase tracking-wider text-[9px] mb-1 m-0">Governs Terms Docket</p>
                                    <p className="font-semibold text-[#222222] m-0">{latestSchedule.docketRef || '_____'}</p>
                                </div>
                                <div>
                                    <p className="font-bold text-[#6f7f52] uppercase tracking-wider text-[9px] mb-1 m-0">Client Name</p>
                                    <p className="font-semibold text-[#222222] m-0">{projectContext.clientName}</p>
                                </div>
                                <div>
                                    <p className="font-bold text-[#6f7f52] uppercase tracking-wider text-[9px] mb-1 m-0">Project Name</p>
                                    <p className="font-semibold text-[#222222] m-0">{projectContext.name}</p>
                                </div>
                                <div>
                                    <p className="font-bold text-[#6f7f52] uppercase tracking-wider text-[9px] mb-1 m-0">Total Contract Value</p>
                                    {/* Defaulting to + GST. If inclusive requested in future, logic could flip based on settings */}
                                    <p className="font-bold text-[#2f4a2e] m-0">₹{(latestSchedule.contractValue || 0).toLocaleString('en-IN')} + GST</p>
                                </div>
                            </div>

                            <div className="mt-8">
                                <table className="w-full text-[10px] text-left border border-[#d9d6cc] bg-white">
                                    <thead>
                                        <tr className="bg-[#2f4a2e] text-white">
                                            <th className="py-2 px-2 w-8 border-r border-[#6f7f52]">#</th>
                                            <th className="py-2 px-3">Advance Name</th>
                                            <th className="py-2 px-3 text-center">%</th>
                                            <th className="py-2 px-3 text-right">Amount Excl. GST</th>
                                            <th className="py-2 px-3">Due</th>
                                            <th className="py-2 px-3">Unlocks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {designAdvances.length > 0 && (
                                            <>
                                                <tr>
                                                    <td colSpan={6} className="bg-[#f2f2f2] text-[#222222] font-bold text-[9px] uppercase tracking-widest py-1.5 px-3 border-b border-[#d9d6cc]">Design Phase</td>
                                                </tr>
                                                {designAdvances.map((adv, i) => formatAdvanceRow(adv, i))}
                                            </>
                                        )}
                                        {executionAdvances.length > 0 && (
                                            <>
                                                <tr>
                                                    <td colSpan={6} className="bg-[#f2f2f2] text-[#222222] font-bold text-[9px] uppercase tracking-widest py-1.5 px-3 border-y border-[#d9d6cc]">Execution Phase</td>
                                                </tr>
                                                {executionAdvances.map((adv, i) => formatAdvanceRow(adv, i + designAdvances.length))}
                                            </>
                                        )}
                                        {handoverAdvances.length > 0 && (
                                            <>
                                                <tr>
                                                    <td colSpan={6} className="bg-[#f2f2f2] text-[#2f4a2e] font-bold text-[9px] uppercase tracking-widest py-1.5 px-3 border-y border-[#d9d6cc]">Handover</td>
                                                </tr>
                                                {handoverAdvances.map((adv, i) => formatAdvanceRow(adv, i + designAdvances.length + executionAdvances.length, true))}
                                            </>
                                        )}
                                        {latestSchedule.advances.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="py-8 text-center text-slate-400 italic">No advances defined. Please update Payment Calc.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="highlight-box bg-white border border-[#2f4a2e] p-5 rounded-md my-6 page-break-inside-avoid">
                                <h3 className="font-bold text-[#2f4a2e] text-[11px] tracking-wider mb-2 m-0 uppercase">IMPORTANT: REGARDING THE HANDOVER ADVANCE</h3>
                                <p className="mb-0 text-[#222222] leading-relaxed">The Handover Advance unlocks the formal handover package, including keys, dossier, and warranty certificate. It is due upon completion of all installation and finishing work and is not conditional upon snag clearance. Snag items are addressed under warranty as per Clause 6.4 of the Terms of Engagement Docket {latestSchedule.docketRef || ''}.</p>
                            </div>

                            <div className="revision-history mt-8 page-break-inside-avoid">
                                <h3 className="font-bold text-[#2f4a2e] text-[12px] uppercase tracking-wide border-b border-[#d9d6cc] pb-1 mb-3">Revision History</h3>
                                <table className="w-full text-[10px] text-left border border-[#d9d6cc]">
                                    <thead>
                                        <tr className="bg-[#f7f1e6] text-[#2f4a2e]">
                                            <th className="py-2 px-3 border-b border-[#d9d6cc]">Version</th>
                                            <th className="py-2 px-3 border-b border-[#d9d6cc]">Date</th>
                                            <th className="py-2 px-3 border-b border-[#d9d6cc]">Changes</th>
                                            <th className="py-2 px-3 border-b border-[#d9d6cc]">Issued By</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedHistory.length > 0 ? sortedHistory.map((s) => (
                                            <tr key={s.id} className="border-b border-[#d9d6cc]">
                                                <td className="py-2 px-3 font-medium">v{s.version}.0</td>
                                                <td className="py-2 px-3">{new Date(s.issuedAt).toLocaleDateString('en-IN')}</td>
                                                <td className="py-2 px-3">{s.version === 1 ? 'Initial Payment Schedule issued with Design Agreement' : s.revisionNote || 'Schedule mutually revised'}</td>
                                                <td className="py-2 px-3">Form Factors Design Studio</td>
                                            </tr>
                                        )) : (
                                            <tr className="border-b border-[#d9d6cc]">
                                                <td className="py-2 px-3 font-medium">v1.0</td>
                                                <td className="py-2 px-3">{new Date().toLocaleDateString('en-IN')}</td>
                                                <td className="py-2 px-3">Initial Payment Schedule issued with Design Agreement</td>
                                                <td className="py-2 px-3">Form Factors Design Studio</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="signature-block mt-12 pt-8 border-t border-[#d9d6cc] grid grid-cols-2 gap-8 page-break-inside-avoid">
                                <div>
                                    <div className="h-12 mb-2"></div>
                                    <div className="w-48 border-t border-[#222222]"></div>
                                    <p className="mt-2 font-bold text-[12px] text-[#222222] m-0">Client Signature & Date</p>
                                    <p className="text-[10px] text-[#666666] m-0">{projectContext.clientName}</p>
                                </div>
                                <div>
                                    <div className="h-12 mb-2"></div>
                                    <div className="w-48 border-t border-[#222222]"></div>
                                    <p className="mt-2 font-bold text-[12px] text-[#222222] m-0">For Form Factors Design Studio</p>
                                    <p className="text-[10px] text-[#666666] m-0">Ar. Mayuri Kaulgud<br/>Principal Architect</p>
                                </div>
                            </div>

                        </div>
                    </StudioDocumentShell>
                </div>
            </div>
        </div>
    );
}
