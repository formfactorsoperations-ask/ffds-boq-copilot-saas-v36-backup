import React, { useState } from 'react';
import { ProjectContext, PaymentSchedule, ProjectEngagement } from '../../types';
import { FileText, Send, Download, AlertTriangle, ArrowRight, History, Eye } from 'lucide-react';
import { formatCurrency, id as generateId } from '../../lib/utils';
import { useOrg } from '../../contexts/OrgContext';
import { StudioDocumentShell } from '../ops/documents/StudioDocumentShell';

interface PaymentSchedulePageProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    activeTier?: any;
}

export default function PaymentSchedulePage({ projectContext, setProjectContext, activeTier }: PaymentSchedulePageProps) {
    const { orgData, currentRole } = useOrg();
    const [previewMode, setPreviewMode] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
    
    const engagement = projectContext.engagement;
    const isLocked = engagement?.status === 'issued' || engagement?.status === 'acknowledged';
    const lockedSnapshot = engagement?.lockedSnapshot;

    const schedules = projectContext.paymentSchedules || [];
    // Sort history by version desc
    const sortedHistory = [...schedules].sort((a,b) => b.version - a.version);

    let latestSchedule = sortedHistory.find(s => selectedScheduleId ? s.id === selectedScheduleId : !s.supersededBy) || sortedHistory[0]; // Active version
    
    if (isLocked && lockedSnapshot?.paymentStructure && !selectedScheduleId) {
        const contractValue = (engagement.executionValue || 0) + (engagement.designFee || 0);
        
        const engagementSnapshot = {
            docketRef: null,
            termsVersion: null,
            paymentScheduleVersion: null,
            status: "draft" as const,
            issuedAt: null,
            acknowledgedAt: null,
            acknowledgedVia: null,
            lockedSnapshot: null,
            history: [],
            ...(engagement || {}),
            designFee: engagement?.designFee || projectContext.financials?.approvedDesignValue || activeTier?.summary?.designFee || 0,
            executionValue: engagement?.executionValue || projectContext.financials?.approvedExecutionValue || activeTier?.summary?.totalSell || 0
        } as ProjectEngagement;

        latestSchedule = {
            id: 'locked',
            version: engagement.paymentScheduleVersion || 1,
            versionLabel: `v${engagement.paymentScheduleVersion || 1}.0`,
            status: engagement.status,
            docketRef: engagement.docketRef || '____',
            issuedAt: engagement.issuedAt || Date.now(),
            issuedBy: 'System',
            contractValue,
            advances: lockedSnapshot.advances || latestSchedule?.advances || [],
            revisionNote: 'Locked Payment Schedule',
            supersededBy: null,
            snapshotPaymentStructure: lockedSnapshot.paymentStructure,
            snapshotEngagement: engagementSnapshot,
            snapshotTermsConfig: lockedSnapshot.termsSettings
        };
    }

    const handleSend = () => {
        if (!latestSchedule) return;
        const updated = { ...latestSchedule, status: 'sent' as const };
        setProjectContext(prev => ({
            ...prev,
            paymentSchedules: prev.paymentSchedules?.map(d => d.id === latestSchedule.id ? updated : d)
        }));
    };

    const handleRegenerate = async () => {
        setIsGenerating(true);
        try {
            const orgId = orgData?.tenantId || 'demo-tenant-01';
            const { getPaymentStructure, getTermsSettings } = await import('../../services/engagementService');
            
            const paymentStructure = await getPaymentStructure(orgId);
            const termsSettings = await getTermsSettings(orgId);
            
            if (!paymentStructure || !termsSettings) {
                alert("Settings not configured in Studio Settings.");
                setIsGenerating(false);
                return;
            }

            const engagement = projectContext.engagement;
            const originalNetDesign = engagement?.designFee || projectContext.financials?.approvedDesignValue || activeTier?.summary?.designFee || 0;
            const originalNetExecution = engagement?.executionValue || projectContext.financials?.approvedExecutionValue || activeTier?.summary?.totalSell || 0;
            const contractValue = originalNetExecution + originalNetDesign;

            const engagementSnapshot = {
                docketRef: null,
                termsVersion: null,
                paymentScheduleVersion: null,
                status: "draft" as const,
                issuedAt: null,
                acknowledgedAt: null,
                acknowledgedVia: null,
                lockedSnapshot: null,
                history: [],
                ...(engagement || {}),
                designFee: originalNetDesign,
                executionValue: originalNetExecution
            } as ProjectEngagement;

            let newAdvances = [];
            
            if (projectContext.paymentMilestones && projectContext.paymentMilestones.length > 0) {
                // Use custom milestones from Payment Calculator
                let dIndex = 0;
                let eIndex = 0;
                newAdvances = projectContext.paymentMilestones.map((m) => {
                    const originalBaseAmount = m.type === 'execution' ? originalNetExecution : originalNetDesign;
                    let amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (originalBaseAmount * (m.percentage / 100));
                    amount = Math.round(amount);
                    const advCode = m.type === 'design' ? `D${++dIndex}` : `E${++eIndex}`;
                    return {
                        advanceCode: m.description && m.description.match(/^[DEH][0-9]$/) ? m.description : advCode,
                        label: (m.name || '').replace(' (Gross)', ''),
                        phase: m.type as 'design' | 'execution' | 'handover',
                        percentage: m.percentage,
                        isFixedAmount: m.isFixedAmount,
                        fixedAmount: m.fixedAmount,
                        amount: amount,
                        dueCondition: m.trigger || (m.type === 'execution' ? 'Advance before ' + (m.name || '').replace(' (Gross)', '').toLowerCase() : 'On completion of ' + (m.name || '').replace(' (Gross)', '')),
                        unlocks: m.unlocks || '',
                        status: 'pending',
                        invoiceRef: null,
                        receivedAt: null,
                        isHandoverAdvance: m.isHandoverAdvance || false
                    };
                });
            } else {
                let i = 0;
                
                // Design Stages
                for (const m of paymentStructure.designStages) {
                    newAdvances.push({
                        advanceCode: m.code || `D${i+1}`,
                        label: m.name,
                        phase: 'design',
                        percentage: m.pct,
                        amount: Math.round((m.pct / 100) * originalNetDesign),
                        dueCondition: m.trigger,
                        unlocks: m.unlocks,
                        status: 'pending',
                        isHandoverAdvance: false,
                        invoiceRef: null,
                        receivedAt: null
                    });
                    i++;
                }
    
                // Execution Stages
                for (const m of paymentStructure.executionStages) {
                    newAdvances.push({
                        advanceCode: m.code || `E${i+1}`,
                        label: m.name,
                        phase: 'execution',
                        percentage: m.pct,
                        amount: Math.round((m.pct / 100) * originalNetExecution),
                        dueCondition: m.trigger,
                        unlocks: m.unlocks,
                        status: 'pending',
                        isHandoverAdvance: m.name.toLowerCase().includes('handover') || (m.trigger && m.trigger.toLowerCase().includes('handover')) || false,
                        invoiceRef: null,
                        receivedAt: null
                    });
                    i++;
                }
            }

            const termsDockets = projectContext.termsDockets || [];
            let latestDocket = null;
            if (termsDockets.length > 0) {
                latestDocket = termsDockets.reduce((prev, curr) => (prev.generatedAt > curr.generatedAt) ? prev : curr);
            }
            const fallbackDocketRef = latestDocket?.docketRef || '____';

            const nextVersion = (latestSchedule && latestSchedule.status !== 'draft') ? latestSchedule.version + 1 : (latestSchedule?.version || 1);

            const newSchedule: PaymentSchedule = {
                id: generateId(),
                version: nextVersion,
                versionLabel: `v${nextVersion}.0`,
                status: 'draft',
                docketRef: engagement?.docketRef || fallbackDocketRef,
                issuedAt: Date.now(),
                issuedBy: 'System',
                contractValue,
                advances: newAdvances as any,
                revisionNote: (latestSchedule && latestSchedule.status !== 'draft') ? 'Revised schedule' : (latestSchedule?.revisionNote || 'Initial Payment Schedule issued with Design Agreement'),
                supersededBy: null,
                snapshotPaymentStructure: paymentStructure,
                snapshotEngagement: engagementSnapshot,
                snapshotTermsConfig: termsSettings
            };

            setProjectContext(prev => {
                const existing = prev.paymentSchedules || [];
                const filtered = existing.filter(s => s.status !== 'draft');
                return {
                    ...prev,
                    paymentSchedules: [...filtered, newSchedule]
                };
            });
        } catch (err) {
            console.error(err);
            alert("Failed to generate schedule.");
        } finally {
            setIsGenerating(false);
        }
    };

    const missingData = [];
    if (!orgData.orgName) missingData.push("Studio Name");
    if (!projectContext.clientName) missingData.push("Client Name");
    if (!projectContext.name) missingData.push("Project Name");
    
    let isDocketRefMissing = false;
    if (latestSchedule) {
        const dockets = projectContext.termsDockets || [];
        let tempLatestDocket = null;
        if (dockets.length > 0) {
            tempLatestDocket = dockets.reduce((prev, curr) => (prev.generatedAt > curr.generatedAt) ? prev : curr);
        }
        const tempResolved = (latestSchedule?.docketRef && latestSchedule.docketRef !== '____') 
            ? latestSchedule.docketRef 
            : (projectContext.engagement?.docketRef || tempLatestDocket?.docketRef || '____');
        if (tempResolved === '____') {
            isDocketRefMissing = true;
        }
    }
    if (isDocketRefMissing) missingData.push("Governing Docket Ref");
    
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
                    margin: [15, 0, 15, 0],
                    filename: `${orgData.orgName?.replace(/\s+/g, '') || 'Studio'}-PaymentSchedule-${projectContext.name}-v${latestSchedule.version}.pdf`,
                    image: { type: 'jpeg' as const, quality: 1 },
                    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
                    pagebreak: { mode: ['css', 'legacy'], avoid: ['.sec-group', 'tr', '.highlight', '.sig', '.metabar', '.valuebar'] }
                };
                html2pdfObj().set(opt).from(element).toPdf().get('pdf').then((pdf: any) => {
                    const totalPages = pdf.internal.getNumberOfPages();
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    for (let i = 1; i <= totalPages; i++) {
                        pdf.setPage(i);
                        pdf.setFontSize(8);
                        pdf.setTextColor(150);
                        // Footer on all pages
                        pdf.text(`${orgData.orgName || 'Form Factors Design Studio'} • ${orgData.contactEmail || 'formfactors.operations@gmail.com'}`, 15, pageHeight - 8);
                        pdf.text(`Page ${i} of ${totalPages}`, pageWidth - 15, pageHeight - 8, { align: 'right' });
                        // Header on subsequent pages
                        if (i > 1) {
                            pdf.text(`Advance Payment Schedule • ${projectContext.name}`, 15, 10);
                            pdf.text(`${orgData.orgName || 'Form Factors Design Studio'}`, pageWidth - 15, 10, { align: 'right' });
                        }
                    }
                }).save();
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
                    <h2 className="text-2xl font-black text-indigo-900 tracking-tight">Advance Payment Schedule</h2>
                    <p className="text-slate-500 mt-2 max-w-lg mx-auto">
                        No payment schedule has been generated yet for this project.
                    </p>
                    <button onClick={handleRegenerate} disabled={isGenerating} className="mt-8 px-6 py-3 bg-[#2f4a2e] text-white font-bold rounded-xl shadow-sm hover:bg-[#1a2d19] transition flex items-center justify-center mx-auto gap-2">
                        {isGenerating ? 'Generating...' : 'Generate Schedule'}
                    </button>
                </div>
            </div>
        );
    }

    // Grouping logic for the PDF table
    const designAdvances = latestSchedule.advances.filter(a => a.phase === 'design');
    const executionAdvances = latestSchedule.advances.filter(a => a.phase === 'execution' && !a.isHandoverAdvance);
    const handoverAdvances = latestSchedule.advances.filter(a => a.phase === 'handover' || a.isHandoverAdvance);

    const isOwner = currentRole === 'Super Admin' || currentRole === 'Admin';
    const studioName = orgData.orgName || '[set in Studio Settings]';
    const signatoryName = orgData.signatoryName || latestSchedule.snapshotTermsConfig?.signatory?.name || (latestSchedule.snapshotTermsConfig as any)?.signatoryName || '[Principal Name]';
    const signatoryTitle = orgData.signatoryTitle || latestSchedule.snapshotTermsConfig?.signatory?.title || (latestSchedule.snapshotTermsConfig as any)?.signatoryTitle || '[Principal Title]';

    const baseDesignFee = latestSchedule.snapshotEngagement?.designFee || projectContext.financials?.approvedDesignValue || activeTier?.summary?.designFee || 0;
    const baseExecutionValue = latestSchedule.snapshotEngagement?.executionValue || projectContext.financials?.approvedExecutionValue || activeTier?.summary?.totalSell || 0;

    const termsDockets = projectContext.termsDockets || [];
    let latestDocket = null;
    if (termsDockets.length > 0) {
        latestDocket = termsDockets.reduce((prev, curr) => (prev.generatedAt > curr.generatedAt) ? prev : curr);
    }
    const resolvedDocketRef = (latestSchedule?.docketRef && latestSchedule.docketRef !== '____') 
        ? latestSchedule.docketRef 
        : (projectContext.engagement?.docketRef || latestDocket?.docketRef || '____');

    if (latestSchedule?.snapshotEngagement && latestSchedule?.snapshotPaymentStructure) {
        const { designFee, executionValue } = latestSchedule.snapshotEngagement;
        const struct = latestSchedule.snapshotPaymentStructure;
        for (const adv of latestSchedule.advances) {
            const base = adv.phase === 'design' ? baseDesignFee : baseExecutionValue;
            const expectedAmount = Math.round((adv.percentage / 100) * base);
            if (!adv.amount || adv.amount === 0) {
                adv.amount = expectedAmount;
            } else if (adv.amount !== expectedAmount) {
                console.warn(`Data Integrity Error: Advance amount for ${adv.label} (${adv.amount}) does not match computed value ${expectedAmount} (Base: ${base}, Pct: ${adv.percentage}%)`);
            }
            
            // Validate percentage against stored structure
            const stages = adv.phase === 'design' ? struct.designStages : struct.executionStages;
            const originalStage = stages?.find(s => s.code === adv.advanceCode || s.name === adv.label);
            if (originalStage && adv.percentage !== originalStage.pct) {
                console.warn(`Data Integrity Error: Advance percentage for ${adv.label} (${adv.percentage}%) does not match stored structure (${originalStage.pct}%)`);
            }
        }
    }

    const designPctTotal = designAdvances.reduce((sum, a) => sum + a.percentage, 0);
    const designAmountTotal = designAdvances.reduce((sum, a) => sum + (a.amount || 0), 0);
    const executionPctTotal = executionAdvances.reduce((sum, a) => sum + a.percentage, 0) + handoverAdvances.reduce((sum, a) => sum + a.percentage, 0);
    const executionAmountTotal = executionAdvances.reduce((sum, a) => sum + (a.amount || 0), 0) + handoverAdvances.reduce((sum, a) => sum + (a.amount || 0), 0);

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in pb-20 font-sans">
            
            {/* Header Actions */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200 no-print">
                <div className="flex items-center gap-4">
                    <div className="bg-[#f7f1e6] p-3 rounded-xl border border-[#d9d6cc]">
                        <FileText className="w-6 h-6 text-[#6f7f52]" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-indigo-900 leading-tight">Payment Schedule</h2>
                            {isOwner && sortedHistory.length > 1 ? (
                                <select 
                                    className="ml-2 font-mono text-sm bg-slate-50 border border-slate-200 rounded px-2 py-0.5 text-slate-700 outline-none focus:border-indigo-300"
                                    value={selectedScheduleId || ''}
                                    onChange={(e) => setSelectedScheduleId(e.target.value || null)}
                                >
                                    <option value="">Latest ({sortedHistory[0].versionLabel})</option>
                                    {sortedHistory.map(sh => (
                                        <option key={sh.id} value={sh.id}>
                                            {sh.versionLabel} {sh.status === 'draft' ? '(Draft)' : ''}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <span className="font-mono text-slate-500 ml-2 text-sm">{latestSchedule.versionLabel}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${latestSchedule.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {latestSchedule.status === 'draft' ? 'Draft Version' : 'Sent & Current'}
                            </span>
                            <span className="text-xs text-slate-500">
                                Governed by Docket: <strong className="text-slate-700 font-mono">{resolvedDocketRef === '____' ? '----' : resolvedDocketRef}</strong>
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
                            {!isLocked && (
                                <button onClick={handleRegenerate} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition flex items-center gap-2">
                                    Regenerate
                                </button>
                            )}
                            <button onClick={handleSend} className="px-4 py-2 bg-[#2f4a2e] border border-[#2f4a2e] text-white font-bold text-sm rounded-lg hover:bg-[#1a2d19] transition flex items-center gap-2 shadow-sm">
                                <Send className="w-4 h-4" /> Mark as Sent
                            </button>
                        </>
                    )}
                    {latestSchedule.status !== 'draft' && !isLocked && (
                        <button onClick={handleRegenerate} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition flex items-center gap-2">
                            Regenerate
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
                <div id="payment-schedule-pdf-render" className={`payment-schedule-template ${previewMode ? 'print-only' : ''}`}>
                    <style dangerouslySetInnerHTML={{__html: `
                        :root{
                            --ink:#1f2328; --ink-soft:#3f464e; --muted:#727a82;
                            --line:#e6e3dc; --line-soft:#efece6; --paper:#fbfaf7; --card:#ffffff;
                            --slate:#1f2328; --accent:#1e3a8a; --accent-soft:#eef2fb; --gold:#b08d57;
                        }
                        .payment-schedule-template {
                            background:var(--paper); color:var(--ink);
                            font-family:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
                            line-height:1.6; font-size:14px; -webkit-font-smoothing:antialiased;
                            width: 100%; max-width: 820px;
                        }
                        .payment-schedule-template * { box-sizing:border-box; }
                        .payment-schedule-template .sheet{max-width:820px; margin:0 auto; background:var(--card); padding:40px 52px 50px;}
                        .payment-schedule-template header.mast{border-bottom:2px solid var(--slate); padding-bottom:18px; display:flex; justify-content:space-between; align-items:flex-end;}
                        .payment-schedule-template .brand{font-size:14px; letter-spacing:.22em; text-transform:uppercase; font-weight:800;}
                        .payment-schedule-template .tagline{font-size:11px; color:var(--muted); letter-spacing:.05em; margin-top:3px;}
                        .payment-schedule-template .docnum{font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--gold); font-weight:700; text-align:right;}
                        .payment-schedule-template .title{margin:20px 0 4px; font-size:21px; font-weight:800; letter-spacing:-.01em;}
                        .payment-schedule-template .preamble{font-size:12.5px; color:var(--ink-soft); margin:0 0 14px;}
                        .payment-schedule-template .metabar{display:grid; grid-template-columns:1fr 1fr 1fr; border:1px solid var(--line); border-radius:10px; overflow:hidden; margin:18px 0 6px;}
                        .payment-schedule-template .metabar div{padding:10px 14px; border-bottom:1px solid var(--line-soft); border-right:1px solid var(--line-soft);}
                        .payment-schedule-template .metabar div:nth-child(3n){border-right:none;}
                        .payment-schedule-template .metabar div:nth-child(-n+3){background:#faf9f5;}
                        .payment-schedule-template .metabar .k{font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:700;}
                        .payment-schedule-template .metabar .v{font-weight:700; color:var(--ink); margin-top:2px; font-size:13px;}
                        .payment-schedule-template .valuebar{display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:14px 0 6px;}
                        .payment-schedule-template .vb{border:1px solid var(--line); border-radius:10px; padding:12px 16px; background:#fff;}
                        .payment-schedule-template .vb .k{font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:700;}
                        .payment-schedule-template .vb .v{font-weight:800; color:var(--slate); font-size:18px; margin-top:3px; font-variant-numeric:tabular-nums;}
                        .payment-schedule-template h2.sec{font-size:13px; letter-spacing:.1em; text-transform:uppercase; font-weight:800; color:var(--slate);
                            margin:24px 0 8px; padding-top:14px; border-top:1px solid var(--line); display:flex; align-items:center; gap:10px;}
                        .payment-schedule-template .pill{font-size:9.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; padding:2px 9px; border-radius:999px;}
                        .payment-schedule-template .pill.d{background:var(--accent-soft); color:var(--accent);} 
                        .payment-schedule-template .pill.e{background:#f3efe7; color:var(--gold);}
                        .payment-schedule-template table{width:100%; border-collapse:collapse; margin:4px 0; font-size:13px;}
                        .payment-schedule-template thead th{background:var(--slate); color:#fff; text-align:left; padding:7px 10px; font-size:10px; letter-spacing:.05em; text-transform:uppercase; font-weight:700;}
                        .payment-schedule-template thead th.r{text-align:right;}
                        .payment-schedule-template tbody td{padding:9px 10px; border-bottom:1px solid var(--line-soft); vertical-align:top; color:var(--ink-soft); font-size: 12.5px;}
                        .payment-schedule-template tbody td .nm{font-weight:700; color:var(--ink); display:block;}
                        .payment-schedule-template tbody td .sm{font-size:11.5px; color:var(--muted);}
                        .payment-schedule-template td.pct{text-align:right; font-weight:800; color:var(--slate); font-variant-numeric:tabular-nums; white-space:nowrap;}
                        .payment-schedule-template td.amt{text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; font-weight:600; color:var(--ink);}
                        .payment-schedule-template tfoot td{padding:8px 10px; font-weight:800; color:var(--slate); border-top:2px solid var(--slate); font-variant-numeric:tabular-nums; font-size: 13px;}
                        .payment-schedule-template tfoot td.r{text-align:right;}
                        .payment-schedule-template .highlight{background:#fdf8ef; border:1px solid #ecdcc0; border-left:3px solid var(--gold); border-radius:0 10px 10px 0; padding:12px 16px; margin:16px 0;}
                        .payment-schedule-template .highlight .lab{font-size:10px; letter-spacing:.12em; text-transform:uppercase; font-weight:800; color:#8a6b34; display:block; margin-bottom:5px;}
                        .payment-schedule-template .highlight p{margin:0; color:#5c4a2a; font-size:12.5px;}
                        .payment-schedule-template .note{font-size:11px; color:var(--muted); margin:8px 0 0; font-style:italic;}
                        .payment-schedule-template .sig{display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:32px;}
                        .payment-schedule-template .sig .line{border-top:1px solid var(--ink); padding-top:9px; margin-top:40px; font-size:12px; color:var(--muted);}
                        .payment-schedule-template .sig .line b{display:block; color:var(--ink); font-size:12.5px; margin-bottom:2px;}
                        .payment-schedule-template footer{margin-top:32px; padding-top:12px; border-top:1px solid var(--line); font-size:10.5px; color:var(--muted); text-align:center; letter-spacing:.04em;}
                        @media print{ 
                            .payment-schedule-template {background:#fff;} 
                            .payment-schedule-template .sheet{padding:0 8px;} 
                            .payment-schedule-template .sec-group { break-inside: avoid; page-break-inside: avoid; }
                            .payment-schedule-template h2.sec{break-after:avoid;}
                            .payment-schedule-template .highlight, .payment-schedule-template tr{break-inside:avoid; page-break-inside:avoid;} 
                            .payment-schedule-template footer { display: none; }
                        }
                        @media(max-width:600px){ 
                            .payment-schedule-template .sheet{padding:32px 22px 56px;} 
                            .payment-schedule-template .metabar{grid-template-columns:1fr;} 
                            .payment-schedule-template .metabar div{border-right:none;} 
                            .payment-schedule-template .valuebar, .payment-schedule-template .sig{grid-template-columns:1fr;} 
                        }
                    `}} />

                    <div className="sheet">
                        <header className="mast">
                            <div>
                                <div className="brand">{orgData.orgName || 'Form Factors Design Studio'}</div>
                                <div className="tagline">Minimal Design. Maximum Impact.</div>
                            </div>
                            <div className="docnum">Document 2 of 2<br/>Payment Schedule</div>
                        </header>

                        <h1 className="title">Advance Payment Schedule</h1>
                        <p className="preamble">Project-specific advance payment structure for this engagement. Governed by and to be read alongside the Terms of Engagement Governing Docket ({resolvedDocketRef === '____' ? '----' : resolvedDocketRef}). It may be revised by mutual agreement; revisions do not require re-acknowledgement of the Docket.</p>

                        <div className="metabar">
                            <div><div className="k">Version</div><div className="v">v{latestSchedule.version}.0</div></div>
                            <div><div className="k">Issued</div><div className="v">{new Date(latestSchedule.issuedAt).toLocaleDateString('en-IN')}</div></div>
                            <div><div className="k">Governs Docket</div><div className="v">{resolvedDocketRef === '____' ? '----' : resolvedDocketRef}</div></div>
                            <div><div className="k">Client</div><div className="v">{projectContext.clientName}</div></div>
                            <div><div className="k">Project</div><div className="v">{projectContext.name}</div></div>
                            <div><div className="k">GST</div><div className="v">18% extra</div></div>
                        </div>

                        <div className="valuebar">
                            <div className="vb"><div className="k">Design Fee (excl. GST)</div><div className="v">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${baseDesignFee.toLocaleString('en-IN')}` : '[HIDDEN]'}</div></div>
                            <div className="vb"><div className="k">Execution Value (excl. GST)</div><div className="v">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${baseExecutionValue.toLocaleString('en-IN')}` : '[HIDDEN]'}</div></div>
                        </div>

                        {designAdvances.length > 0 && (
                            <div className="sec-group">
                                <h2 className="sec">A &middot; Design Phase <span className="pill d">% OF DESIGN FEE</span></h2>
                                <table>
                                    <thead><tr><th>STAGE</th><th>PAID WHEN</th><th className="r">%</th><th className="r">AMOUNT (EXCL. GST)</th><th className="r">+18% GST</th><th className="r">TOTAL (INCL. GST)</th></tr></thead>
                                    <tbody>
                                        {designAdvances.map((adv, i) => (
                                            <tr key={`d-${i}`}>
                                                <td><span className="nm">{adv.advanceCode || `D${i+1}`} &middot; {adv.label}</span><span className="sm">{adv.unlocks || ''}</span></td>
                                                <td>{adv.dueCondition}</td>
                                                <td className="pct">{adv.percentage}%</td>
                                                <td className="amt">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${(adv.amount || 0).toLocaleString('en-IN')}` : '--'}</td>
                                                <td className="amt text-slate-500">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${Math.round((adv.amount || 0) * 0.18).toLocaleString('en-IN')}` : '--'}</td>
                                                <td className="amt font-bold">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${Math.round((adv.amount || 0) * 1.18).toLocaleString('en-IN')}` : '--'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot><tr><td colSpan={2}>Design Fee total</td><td className="r">{designPctTotal}%</td><td className="r">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${designAmountTotal.toLocaleString('en-IN')}` : '--'}</td><td className="r">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${Math.round(designAmountTotal * 0.18).toLocaleString('en-IN')}` : '--'}</td><td className="r">{!baseDesignFee ? '[set project values]' : isOwner ? `₹${Math.round(designAmountTotal * 1.18).toLocaleString('en-IN')}` : '--'}</td></tr></tfoot>
                                </table>
                            </div>
                        )}

                        {(executionAdvances.length > 0 || handoverAdvances.length > 0) && (
                            <div className="sec-group">
                                <h2 className="sec">B &middot; Execution Phase <span className="pill e">% OF EXECUTION VALUE</span></h2>
                                <table>
                                    <thead><tr><th>STAGE</th><th>PAID WHEN</th><th className="r">%</th><th className="r">AMOUNT (EXCL. GST)</th><th className="r">+18% GST</th><th className="r">TOTAL (INCL. GST)</th></tr></thead>
                                    <tbody>
                                        {executionAdvances.map((adv, i) => (
                                            <tr key={`e-${i}`}>
                                                <td><span className="nm">{adv.advanceCode || `E${i+1}`} &middot; {adv.label}</span><span className="sm">{adv.unlocks || ''}</span></td>
                                                <td>{adv.dueCondition}</td>
                                                <td className="pct">{adv.percentage}%</td>
                                                <td className="amt">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${(adv.amount || 0).toLocaleString('en-IN')}` : '--'}</td>
                                                <td className="amt text-slate-500">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${Math.round((adv.amount || 0) * 0.18).toLocaleString('en-IN')}` : '--'}</td>
                                                <td className="amt font-bold">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${Math.round((adv.amount || 0) * 1.18).toLocaleString('en-IN')}` : '--'}</td>
                                            </tr>
                                        ))}
                                        {handoverAdvances.map((adv, i) => (
                                            <tr key={`h-${i}`}>
                                                <td><span className="nm">{adv.advanceCode || 'H1'} &middot; {adv.label}</span><span className="sm">{adv.unlocks || ''}</span></td>
                                                <td>{adv.dueCondition}</td>
                                                <td className="pct">{adv.percentage}%</td>
                                                <td className="amt">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${(adv.amount || 0).toLocaleString('en-IN')}` : '--'}</td>
                                                <td className="amt text-slate-500">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${Math.round((adv.amount || 0) * 0.18).toLocaleString('en-IN')}` : '--'}</td>
                                                <td className="amt font-bold">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${Math.round((adv.amount || 0) * 1.18).toLocaleString('en-IN')}` : '--'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot><tr><td colSpan={2}>Execution total</td><td className="r">{executionPctTotal}%</td><td className="r">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${executionAmountTotal.toLocaleString('en-IN')}` : '--'}</td><td className="r">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${Math.round(executionAmountTotal * 0.18).toLocaleString('en-IN')}` : '--'}</td><td className="r">{!baseExecutionValue ? '[set project values]' : isOwner ? `₹${Math.round(executionAmountTotal * 1.18).toLocaleString('en-IN')}` : '--'}</td></tr></tfoot>
                                </table>
                                <p className="note">Percentages are fixed; amounts are calculated from the values above. Each payment is triggered by the completed milestone shown, not by a calendar date.</p>
                            </div>
                        )}

                        {handoverAdvances.length > 0 && (
                            <div className="highlight">
                                <span className="lab">Regarding the Completion &amp; Handover Advance</span>
                                <p>{latestSchedule.snapshotPaymentStructure?.handoverClause || "The Completion & Handover Advance unlocks the formal handover package — keys, dossier and warranty certificate. It is due upon completion of all installation and finishing work and is not conditional upon snag clearance. Snag items are addressed under warranty as per Clause 6.4 of the Terms of Engagement Governing Docket."}</p>
                            </div>
                        )}

                        <div className="sig">
                            <div><div className="line"><b>Client Signature &amp; Date</b>{projectContext.clientName}</div></div>
                            <div><div className="line"><b>For {studioName}</b>{signatoryName} &middot; {signatoryTitle}</div></div>
                        </div>

                        <footer>{orgData.orgName || 'Form Factors Design Studio'} &middot; Minimal Design. Maximum Impact. &middot; {orgData.officeAddress || '[studio address]'} &middot; {orgData.contactEmail || 'formfactors.operations@gmail.com'}</footer>
                    </div>
                </div>
            </div>
        </div>
    );
}
