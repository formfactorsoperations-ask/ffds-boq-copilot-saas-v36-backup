import React, { useState } from 'react';
import { ProjectContext, PaymentSchedule, ProjectEngagement } from '../../types';
import { FileText, Send, Download, AlertTriangle, Eye, RefreshCw, PencilLine, Info } from '@/lib/lucide-shim';
import { formatCurrency, id as generateId } from '../../lib/utils';
import { resolveFinancials, billingSummary, billingBase } from '../../lib/paymentSchedule';
import { rebaseAdvances, taxableBases } from '../../lib/paymentScheduleRevision';
import { engagementOf, isFeeOnly } from '../../lib/engagement';
import { useOrg } from '../../contexts/OrgContext';
import { resolveDocumentState, getCurrentIssue } from '../../services/documentIssueEngine';
import ExecutionStamp from '../documents/ExecutionStamp';
import PaymentScheduleSheet from '../documents/PaymentScheduleSheet';
import { prepareClonedDocForPdf } from '../../lib/pdfUtils';
import {
    advancePaymentStatus,
    designInProgress,
    resolveProvisionalNote,
    heldScheduleVersion,
    nextScheduleVersion,
    DEFAULT_PROVISIONAL_NOTE
} from '../../lib/paymentScheduleStatus';

interface PaymentSchedulePageProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    activeTier?: any;
    /** Opens the Documents board, the one place a document is sent from. */
    onOpenDocuments?: () => void;
}

export default function PaymentSchedulePage({ projectContext, setProjectContext, activeTier: optionTier, onOpenDocuments }: PaymentSchedulePageProps) {
    /*
      A fee-only project (design only) schedules the design fee and nothing
      else: no execution value, whatever an old BOQ left on the option, and no
      execution stages (lib/engagement.ts).
    */
    const feeOnly = isFeeOnly(engagementOf(projectContext));
    const activeTier = optionTier && feeOnly ? { ...optionTier, summary: billingSummary(projectContext, optionTier.summary) } : optionTier;
    /*
      GST per phase, from the project rather than from a literal.

      Every line and both totals below multiplied by 0.18, so this document
      charged tax on phases the studio has switched off -- all nine real
      projects here have execution GST disabled. `resolveFinancials` answers it
      once; a phase that is off reads 0 and its Total equals its Amount.
    */
    const psFin = resolveFinancials((projectContext as any)?.financials);
    const psRate = (projectContext as any)?.gstRate ?? 18;
    const designGstMul = (psFin.designGstEnabled !== false ? psRate : 0) / 100;
    const execGstMul = (psFin.executionGstEnabled !== false ? psRate : 0) / 100;

    const { orgData, currentRole } = useOrg();
    const [previewMode, setPreviewMode] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
    
    const engagement = projectContext.engagement;

    /*
      This page had its own idea of the document's state, and it was wrong.

      Three models describe one Payment Schedule: `paymentSchedules[]` (version
      + draft/sent), `engagement` (draft/issued/acknowledged) and
      `documents.issues` — the last being the one the client actually signs
      against and the one the Documents board reads. On a live project the
      first two said "draft" while the issue said "signed", so this page
      offered "Mark as Sent" for a schedule the client had already
      acknowledged.

      The issue wins wherever one exists. Projects with no issue yet fall back
      to the old fields, so nothing regresses for work in progress.
    */
    const canonicalState = resolveDocumentState(projectContext, 'payment_schedule');
    const canonicalIssue = getCurrentIssue(projectContext, 'payment_schedule');
    const hasIssue = !!canonicalIssue;
    const canonicalSent = hasIssue && canonicalState !== 'draft';
    const canonicalDone = hasIssue && (canonicalState === 'signed' || canonicalState === 'executed');

    const isLocked = canonicalSent
      || engagement?.status === 'issued' || engagement?.status === 'acknowledged';
    const lockedSnapshot = engagement?.lockedSnapshot;

    const schedules = projectContext.paymentSchedules || [];
    // Sort history by version desc
    const sortedHistory = [...schedules].sort((a,b) => b.version - a.version);

    /*
      Which version the client already holds.

      "Locked" used to switch every edit off, and it was true far too often:
      acknowledging the Terms of Engagement sets the engagement to
      'acknowledged', so from that moment the schedule could not be
      regenerated, revised or re-issued from anywhere. A lock protects what the
      client holds; it does not stop the studio drafting the next version.

      So the page now asks which version the client actually has (released from
      the Documents board, or locked into the engagement on the older flow),
      and treats only a draft numbered above it as open.
    */
    const issuedScheduleVersion = canonicalSent
        ? ((canonicalIssue as any)?.snapshot?.schedule?.version ?? canonicalIssue?.version ?? 0)
        : 0;
    const lockedHasSchedule = isLocked && !!(lockedSnapshot?.paymentStructure || lockedSnapshot?.advances);
    const heldVersion = heldScheduleVersion({
        scheduleVersion: issuedScheduleVersion,
        lockedVersion: lockedHasSchedule ? (engagement?.paymentScheduleVersion || 1) : 0
    });
    const openDraft = schedules.find(s => s.status === 'draft' && s.version > heldVersion) || null;

    let latestSchedule = selectedScheduleId
        ? (sortedHistory.find(s => s.id === selectedScheduleId) || sortedHistory[0])
        : (openDraft || sortedHistory.find(s => !s.supersededBy) || sortedHistory[0]); // Active version
    
    if (lockedHasSchedule && lockedSnapshot?.paymentStructure && !selectedScheduleId && !openDraft) {
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
            designFee: (activeTier?.summary?.designFee !== undefined && activeTier?.summary?.designFee > 0) ? activeTier.summary.designFee : (engagement?.designFee || projectContext.financials?.approvedDesignValue || 0),
            executionValue: feeOnly ? 0 : (activeTier?.summary?.totalSell !== undefined && activeTier?.summary?.totalSell > 0) ? activeTier.summary.totalSell : (engagement?.executionValue || projectContext.financials?.approvedExecutionValue || 0)
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

    /*
      Nothing on this page sends anything to the client.

      A schedule reaches the client only when it is released from the
      Documents board, which freezes a copy and stages it for the portal. The
      old "Mark as Sent" here changed a label and nothing else, so the page
      read "Sent" about a schedule the client had never been given. This page
      drafts; Documents sends.
    */

    /** Saves the note under the execution table on the open draft. */
    const setDraftNote = (note: string | null | undefined) => {
        if (!openDraft) return;
        setProjectContext(prev => ({
            ...prev,
            paymentSchedules: (prev.paymentSchedules || []).map(s => s.id === openDraft.id ? { ...s, provisionalNote: note } : s)
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
            /* Once a contract is in force the schedule bills the approved values (a revision applied
               moves them), not whichever option is selected; before that, the option, as Money does. */
            const billed = billingBase(projectContext, activeTier?.summary, resolveFinancials(projectContext.financials));
            const originalNetDesign = billed.design > 0
                ? billed.design
                : (engagement?.designFee || projectContext.financials?.approvedDesignValue || 0);
            const originalNetExecution = feeOnly ? 0 : billed.execution > 0
                ? billed.execution
                : (engagement?.executionValue || projectContext.financials?.approvedExecutionValue || 0);
            /* Every discount comes off before the stages are worked out, the revision's included (lib/revisionOffer). */
            const taxable = taxableBases(projectContext, originalNetExecution, originalNetDesign);
            const milestonesInUse = (projectContext.paymentMilestones || []).filter((m) => !(feeOnly && m.type === 'execution'));
            const contractValue = milestonesInUse.length
                ? taxable.taxableExecution + taxable.taxableDesign
                : originalNetExecution + originalNetDesign;

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
            
            if (milestonesInUse.length > 0) {
                /* The milestones from Money, by its own rules (lib/paymentScheduleRevision): a stage
                   invoiced or paid keeps the amount it was billed at and stays received, and the
                   stages to come share the rest after every discount. This used to price every
                   stage again on the full value, before discounts, and mark a paid D1 as pending. */
                newAdvances = rebaseAdvances(milestonesInUse, taxable).map((a: any, i: number) => {
                    const m = milestonesInUse[i];
                    return m ? { ...a, milestoneId: m.id, isHandoverAdvance: m.isHandoverAdvance || a.isHandoverAdvance } : a;
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
                for (const m of (feeOnly ? [] : paymentStructure.executionStages)) {
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

            /* Above whatever the client holds, so a revision never reuses the
               number of the version it replaces. */
            const nextVersion = nextScheduleVersion(schedules, heldVersion);
            const isRevision = heldVersion > 0;

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
                revisionNote: isRevision ? (openDraft?.revisionNote && openDraft.revisionNote !== 'Initial Payment Schedule issued with Design Agreement' ? openDraft.revisionNote : 'Revised schedule') : (openDraft?.revisionNote || latestSchedule?.revisionNote || 'Initial Payment Schedule issued with Design Agreement'),
                supersededBy: null,
                // The studio's own choice about the note survives a regenerate.
                ...(openDraft && openDraft.provisionalNote !== undefined ? { provisionalNote: openDraft.provisionalNote } : {}),
                snapshotPaymentStructure: paymentStructure,
                snapshotEngagement: engagementSnapshot,
                snapshotTermsConfig: termsSettings
            };

            setProjectContext(prev => {
                const existing = prev.paymentSchedules || [];
                /* Only the open draft is replaced. A draft the client already
                   holds (released from the Documents board without being
                   marked sent here) is kept, and recorded as sent. */
                const filtered = existing
                    .filter(s => !(s.status === 'draft' && s.version > heldVersion))
                    .map(s => s.status === 'draft' ? { ...s, status: 'sent' as const } : s);
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
                    html2canvas: { 
                        scale: 2, 
                        useCORS: true, 
                        letterRendering: true,
                        logging: false,
                        onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc)
                    },
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
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Advance Payment Schedule</h2>
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

    const isOwner = currentRole === 'Super Admin' || currentRole === 'Admin';

    const termsDockets = projectContext.termsDockets || [];
    let latestDocket = null;
    if (termsDockets.length > 0) {
        latestDocket = termsDockets.reduce((prev, curr) => (prev.generatedAt > curr.generatedAt) ? prev : curr);
    }
    const resolvedDocketRef = (latestSchedule?.docketRef && latestSchedule.docketRef !== '____') 
        ? latestSchedule.docketRef 
        : (projectContext.engagement?.docketRef || latestDocket?.docketRef || '____');

    /* The schedule on screen is an open draft only while it is numbered above
       what the client holds. */
    const isOpenDraft = !!openDraft && latestSchedule.id === openDraft.id;
    const hasExecution = !feeOnly && latestSchedule.advances.some(a => a.phase !== 'design');

    /* A draft shows the note it will go out with; a sent version shows only
       the note it actually went out with. */
    const shownSchedule: PaymentSchedule = {
        ...latestSchedule,
        provisionalNote: isOpenDraft
            ? resolveProvisionalNote(latestSchedule, projectContext)
            : (typeof latestSchedule.provisionalNote === 'string' ? latestSchedule.provisionalNote : null)
    };
    const draftNoteOn = isOpenDraft && !!shownSchedule.provisionalNote;
    const inDesign = designInProgress(projectContext);

    /* Staged: frozen for the client, waiting to be published from the portal. */
    const staged = !!canonicalIssue && (canonicalIssue as any).clientVisibility?.state === 'draft';
    const clientHasPortalCopy = hasIssue && !(canonicalIssue as any)?.legacyNeverReleased;

    const milestones = projectContext.paymentMilestones || [];
    const statusFor = (adv: any) => advancePaymentStatus(adv, milestones);

    const chip = isOpenDraft
        ? { cls: 'bg-amber-100 text-amber-700', label: heldVersion > 0 ? `Draft · client has v${heldVersion}` : 'Draft · not sent' }
        : staged ? { cls: 'bg-amber-100 text-amber-700', label: 'Staged · publish from Client Portal' }
        : canonicalDone ? { cls: 'bg-emerald-100 text-emerald-700', label: 'Acknowledged by client' }
        : canonicalState === 'queried' && hasIssue ? { cls: 'bg-amber-100 text-amber-700', label: 'Question open' }
        : canonicalSent ? { cls: 'bg-[#3D52A0]/10 text-[#3D52A0]', label: 'Sent to client' }
        /* Not released from Documents, so the client does not have it,
           whatever an older "Mark as Sent" recorded. */
        : { cls: 'bg-amber-100 text-amber-700', label: 'Not sent to client' };

    const secondaryBtn = 'px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
    const primaryBtn = 'px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] transition flex items-center gap-2 shadow-sm disabled:opacity-50';

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
                            <h2 className="text-lg font-bold text-slate-800 leading-tight">Payment Schedule</h2>
                            {isOwner && sortedHistory.length > 1 ? (
                                <select 
                                    className="ml-2 font-mono text-sm bg-slate-50 border border-slate-200 rounded px-2 py-0.5 text-slate-700 outline-none focus:border-sky-300"
                                    value={selectedScheduleId || ''}
                                    onChange={(e) => setSelectedScheduleId(e.target.value || null)}
                                >
                                    <option value="">Latest ({sortedHistory[0].versionLabel})</option>
                                    {sortedHistory.map(sh => (
                                        <option key={sh.id} value={sh.id}>
                                            {sh.versionLabel} {sh.status === 'draft' && sh.version > heldVersion ? '(Draft)' : ''}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <span className="font-mono text-slate-500 ml-2 text-sm">{latestSchedule.versionLabel}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${chip.cls}`}>
                                {chip.label}
                            </span>
                            <span className="text-xs text-slate-500">
                                Governed by Docket: <strong className="text-slate-700 font-mono">{resolvedDocketRef === '____' ? '----' : resolvedDocketRef}</strong>
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                    <button onClick={() => setPreviewMode(!previewMode)} className={secondaryBtn}>
                        <Eye className="w-4 h-4" /> {previewMode ? 'Exit Preview' : 'Preview as PDF'}
                    </button>
                    <button onClick={handleDownloadPdf} disabled={!isValid} className={secondaryBtn}>
                        <Download className="w-4 h-4" /> Download PDF
                    </button>
                    {isOpenDraft ? (
                        <>
                            <button onClick={handleRegenerate} disabled={isGenerating} className={secondaryBtn} title="Rebuild this draft from the current fees, BOQ and milestones">
                                <RefreshCw className="w-4 h-4" /> {isGenerating ? 'Regenerating…' : 'Regenerate'}
                            </button>
                            {onOpenDocuments && (
                                <button onClick={onOpenDocuments} className={primaryBtn} title="Documents is where a schedule is sent to the client">
                                    <Send className="w-4 h-4" /> Send from Documents
                                </button>
                            )}
                        </>
                    ) : !selectedScheduleId && (
                        <>
                            {!clientHasPortalCopy && onOpenDocuments && (
                                <button onClick={onOpenDocuments} className={secondaryBtn} title="Documents is where a schedule is sent to the client">
                                    <Send className="w-4 h-4" /> Send from Documents
                                </button>
                            )}
                            <button onClick={handleRegenerate} disabled={isGenerating} className={primaryBtn} title="Start a new version from the current fees, BOQ and milestones. The client keeps the version they have until you send this one from Documents.">
                                <PencilLine className="w-4 h-4" /> {isGenerating ? 'Preparing…' : `Revise as v${nextScheduleVersion(schedules, heldVersion)}.0`}
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

            {staged && !isOpenDraft && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-start gap-3 no-print hud-panel-in">
                    <div className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0">
                        <Info className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-slate-800">v{issuedScheduleVersion || latestSchedule.version} is frozen and waiting to be published</div>
                        <p className="text-xs text-slate-500 mt-0.5">{projectContext.clientName || 'The client'} keeps reading the version they have until you publish this one from Client Portal.</p>
                    </div>
                </div>
            )}

            {/* The note on execution amounts, while the draft is open. */}
            {isOpenDraft && hasExecution && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 no-print hud-panel-in">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0">
                                <Info className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="font-bold text-slate-800">Note on execution amounts</div>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {inDesign
                                        ? 'The design phase is in progress and the BOQ is not frozen, so the execution amounts may still change.'
                                        : 'The BOQ is frozen. Switch the note off unless the execution amounts may still change.'}
                                </p>
                            </div>
                        </div>
                        <div className="inline-flex p-1 rounded-xl bg-slate-100">
                            <button
                                onClick={() => setDraftNote(latestSchedule.provisionalNote && latestSchedule.provisionalNote.trim() ? latestSchedule.provisionalNote : DEFAULT_PROVISIONAL_NOTE)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${draftNoteOn ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                            >
                                Show on schedule
                            </button>
                            <button
                                onClick={() => setDraftNote(null)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${!draftNoteOn ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                            >
                                Hide
                            </button>
                        </div>
                    </div>
                    {draftNoteOn && (
                        <div className="mt-4">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Wording on the schedule</label>
                            <textarea
                                rows={3}
                                value={shownSchedule.provisionalNote || ''}
                                onChange={e => setDraftNote(e.target.value)}
                                onBlur={e => { if (!e.target.value.trim()) setDraftNote(null); }}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] resize-y"
                            />
                            {shownSchedule.provisionalNote !== DEFAULT_PROVISIONAL_NOTE && (
                                <button onClick={() => setDraftNote(DEFAULT_PROVISIONAL_NOTE)} className="mt-1.5 text-[11px] font-semibold text-[#3D52A0] hover:text-[#334486]">
                                    Use the standard wording
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Document Render Container */}
            <div className={`transition-all duration-500 ${previewMode ? 'bg-[#e2e8f0] p-8 -mx-8 flex justify-center rounded-3xl overflow-x-auto shadow-inner' : ''}`}>
                {/*
                    One renderer for the studio page and the client portal
                    (PaymentScheduleSheet), so a change to the document reaches
                    both. The Status column is the studio's live view from
                    Money; the client's frozen copy carries no status.
                */}
                <PaymentScheduleSheet
                    schedule={shownSchedule}
                    projectContext={projectContext}
                    org={{
                        orgName: orgData.orgName,
                        officeAddress: (orgData as any).officeAddress,
                        contactEmail: (orgData as any).contactEmail,
                        signatoryName: orgData.signatoryName || latestSchedule.snapshotTermsConfig?.signatory?.name || (latestSchedule.snapshotTermsConfig as any)?.signatoryName,
                        signatoryTitle: orgData.signatoryTitle || latestSchedule.snapshotTermsConfig?.signatory?.title || (latestSchedule.snapshotTermsConfig as any)?.signatoryTitle
                    }}
                    activeTier={activeTier}
                    showAmounts={isOwner}
                    previewMode={previewMode}
                    feeOnly={feeOnly}
                    statusFor={statusFor}
                    signature={
                        /*
                            Once the client has acted, the real record replaces the
                            blank rule. The printed placeholder said "Client
                            Signature & Date · ABC test client" whether or not
                            anyone had signed, which reads on the page exactly like
                            evidence and is not.
                        */
                        !isOpenDraft && (canonicalIssue?.clientSignature || canonicalIssue?.counterSignature)
                            ? <ExecutionStamp issue={canonicalIssue} mode="acknowledge" />
                            : undefined
                    }
                />
            </div>
        </div>
    );
}
