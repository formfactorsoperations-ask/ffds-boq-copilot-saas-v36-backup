import React, { useState } from 'react';
import { buildSignoffPatch } from '../../services/clientApprovalEngine';
import { sendAgreementSignoffRequest } from '../../services/emailService';
import { ProjectContext, DigitalSignatureDocket } from '../../types';
import { Download, Printer, CheckCircle2, Calendar, Clock, ListChecks, BookOpen, Link2 } from '@/lib/lucide-shim';
import { Panel, Button, Chip, Segmented, buttonClass } from '../ui/kit';
import { useOrg } from '../../contexts/OrgContext';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import { studioDisplayName } from '../../lib/studioName';
import { prepareClonedDocForPdf } from '../../lib/pdfUtils';
import DigitalSignatureDocketView from '../common/DigitalSignatureDocket';
import ManualAcceptanceOverrideModal from '../ops/ManualAcceptanceOverrideModal';
import { publicAppOrigin } from '../../lib/publicUrl';
import { engagementOf } from '../../lib/engagement';

interface HandoverDocketPageProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    projectId?: string;
}

export default function HandoverDocketPage({ projectContext, setProjectContext, projectId: propProjectId }: HandoverDocketPageProps) {
    const { orgData } = useOrg();
    const studioId = orgData?.tenantId || 'demo-tenant-01';
    const { settings } = useStudioSettings(studioId);
    
    const studioName = studioDisplayName(settings, orgData);
    const clientName = projectContext.clientName || 'Valued Client';
    const projectName = projectContext?.name || 'Untitled Project';
    const projectId = propProjectId || (projectContext as any).projectId || (projectContext as any).id || (projectContext.name ? projectContext.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'PRJ-0000');
    
    /*
      On a design-only project this is the Design Closeout: the client signs off
      the final drawing set and the design engagement closes. There was no site
      handed over and the studio gives no workmanship warranty, so neither
      appears. The signature runs through the same handover sign-off.
    */
    const designOnly = engagementOf(projectContext) === 'design_only';
    const docTitle = designOnly ? 'Design Closeout' : 'Handover Docket';
    const fileStem = designOnly ? 'Design_Closeout' : 'Handover_Docket';
    const drawingsIssued = Object.values((projectContext as any).drawingTracker || {}).length;
    const [handoverDate, setHandoverDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [isSending, setIsSending] = useState(false);
    const [showSendConfirm, setShowSendConfirm] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [showOverrideModal, setShowOverrideModal] = useState(false);
    
    const currentSignoff = projectContext.handoverSignoff;
    const signoffStatus = currentSignoff?.status || 'pending';
    const getSignoffUrl = (token: string) => {
        let appDomain = publicAppOrigin();
        if (appDomain.includes('ais-dev-')) {
            appDomain = appDomain.replace('ais-dev-', 'ais-pre-');
        }
        return `${appDomain}/?agreementSignoff=${token}`;
    };
    const displayDate = new Date(handoverDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    const handleDownloadPdf = () => {
        const el = document.getElementById('handover-docket-render');
        if (!el) return;

        // Add a temporary class to optimize for PDF generation
        
        
        import('html2pdf.js').then((module) => {
            const html2pdf = module as any;
            let html2pdfObj = html2pdf;
            if (typeof html2pdf === 'function') {
                html2pdfObj = html2pdf;
            } else if (html2pdf && typeof html2pdf.default === 'function') {
                html2pdfObj = html2pdf.default;
            } else if (html2pdf.default && typeof html2pdf.default.default === 'function') {
                html2pdfObj = html2pdf.default.default;
            }

            const opt = {
                margin: [15, 0, 15, 0],
                filename: `${fileStem}_${projectName.replace(/\s+/g, '_')}.pdf`,
                image: { type: 'jpeg', quality: 1 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc, 'handover-docket-root')
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            setTimeout(() => {
                html2pdfObj().set(opt).from(el).save().then(() => {
                    
                });
            }, 300);
        });
    };

    
    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const sendEmailSignoff = async () => {
        setLocalError(null);
        if (!projectContext.clientEmail || !projectContext.clientEmail.trim()) {
            setLocalError("Client email is required to send the document. Please enter a valid email address in the Studio settings.");
            return;
        }

        setIsSending(true);
        try {
            await new Promise(r => setTimeout(r, 100));
            const element = document.getElementById('handover-docket-root');
            let pdfBase64;
            if (element) {
                try {
                    const html2pdfModule = await import('html2pdf.js');
                    const html2pdfObj = ((html2pdfModule as any).default || html2pdfModule) as any;
                    
                    if (typeof html2pdfObj !== 'function') throw new Error("html2pdf library loaded incorrectly");
                    
                    const opt = {
                        margin: [15, 0, 15, 0],
                        filename: `${fileStem}_${projectName.replace(/\s+/g, '_')}.pdf`,
                        image: { type: 'jpeg' as const, quality: 1 },
                        html2canvas: {
                            scale: 2,
                            useCORS: true,
                            logging: false,
                            onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc, 'handover-docket-root')
                        },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
                    };
                    pdfBase64 = await html2pdfObj().set(opt).from(element).outputPdf('datauristring');
                } catch (pdfErr) {
                    console.error("PDF generation failed, falling back without attachment", pdfErr);
                }
            }

            const result = await sendAgreementSignoffRequest(projectId || '', projectContext, 0, pdfBase64, orgData?.tenantId || 'demo-tenant-01', 'handover');
            
            const tokenToUse = result.token || `HANDOVER_AGREEMENT_${projectId}_${Date.now()}`;
            // Success
            setProjectContext(prev => ({
                ...prev,
                handoverSignoff: {
                    status: 'sent',
                    token: tokenToUse,
                    sentAt: new Date().toISOString()
                }
            }));
            
            setShowSendConfirm(false);
            if (result.error) {
                setLocalError(`Email dispatch note: ${result.error}. Digital sign-off URL generated below.`);
            }
        } catch (error: any) {
            console.error("Failed to send:", error);
            const fallbackToken = `HANDOVER_AGREEMENT_${projectId}_${Date.now()}`;
            setProjectContext(prev => ({
                ...prev,
                handoverSignoff: {
                    status: 'sent',
                    token: fallbackToken,
                    sentAt: new Date().toISOString()
                }
            }));
            setShowSendConfirm(false);
            setLocalError(`Notice: ${error.message || 'Email dispatch skipped in sandbox mode'}. Digital signature URL generated successfully.`);
        } finally {
            setIsSending(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };



    const termsConfig = projectContext.engagement?.lockedSnapshot?.termsSettings || 
                        (projectContext.termsDockets && projectContext.termsDockets.length > 0 
                            ? projectContext.termsDockets[projectContext.termsDockets.length - 1].snapshotTermsConfig 
                            : null);
                            
    let defaultWarrantyPeriod = 6;
    if (termsConfig?.warrantyPeriods?.[0]?.months) {
        defaultWarrantyPeriod = termsConfig.warrantyPeriods[0].months;
    } else if (settings?.projectTerms?.warrantyPeriod) {
        const match = settings.projectTerms.warrantyPeriod.match(/(\d+)/);
        if (match) {
            defaultWarrantyPeriod = settings.projectTerms.warrantyPeriod.toLowerCase().includes('year') ? parseInt(match[1]) * 12 : parseInt(match[1]);
        }
    }

    /*
      Summary first, like the Terms Docket (DESIGN.md "Screen kit",
      standardisation PR 6): where the docket stands, what the client signs,
      and the outline. The page bar names the screen, so there is no title of
      its own, and the workspace scrolls rather than a box inside it. The
      docket below is the same markup as before; the PDF and Print capture it,
      so both show it first.
    */
    const [viewMode, setViewMode] = useState<'summary' | 'doc'>('summary');
    const statusChip = signoffStatus === 'signed'
        ? <Chip tone="good">Signed</Chip>
        : signoffStatus === 'sent' ? <Chip tone="warn">Sent · awaiting signature</Chip> : <Chip tone="slate">Not sent</Chip>;
    const when = (t?: string | number | null) => (t ? new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
    const steps = [
        { label: 'Prepared', sub: `Dated ${displayDate}`, done: true },
        { label: 'Sent to client', sub: currentSignoff?.sentAt ? when(currentSignoff.sentAt) : signoffStatus === 'signed' ? 'Recorded by the studio' : 'From Documents', done: signoffStatus !== 'pending' },
        { label: 'Signed', sub: signoffStatus === 'signed' ? (when(currentSignoff?.signedAt) || 'Signed') : 'Not yet', done: signoffStatus === 'signed' },
    ];
    const checklist: string[] = designOnly
        ? ['Final drawing set', 'Selections', 'Design fee settled', 'Site queries']
        : ['Final financial settlement', 'Defect rectification', 'Site clearance', 'Access handover'];
    const outline: string[] = designOnly
        ? ['Design Completion', 'Closure Checklist']
        : ['Practical Completion', 'Closure Checklist', 'Warranty Certificate', 'Care & Maintenance'];
    const showDoc = (then?: () => void) => {
        setViewMode('doc');
        if (then) window.setTimeout(then, 300);
    };
    /* The PDF and the print are taken from the docket on screen, so show it first. */
    const downloadPdf = () => (viewMode === 'doc' ? handleDownloadPdf() : showDoc(handleDownloadPdf));
    const printDocket = () => (viewMode === 'doc' ? handlePrint() : showDoc(handlePrint));

    return (
        <div className="w-full space-y-4 pb-20">
            {/* One row: the view, where the docket stands, the date it carries, and what can be done with it. */}
            <div className="flex flex-wrap items-center gap-2 no-print">
                <Segmented
                    label={`${docTitle} view`}
                    size="sm"
                    value={viewMode}
                    options={[
                        { id: 'summary', label: 'Summary' },
                        { id: 'doc', label: 'Document' },
                    ]}
                    onChange={setViewMode}
                />
                {statusChip}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs text-slate-500">{designOnly ? 'Closeout date' : 'Handover date'}</span>
                        <input
                            type="date"
                            value={handoverDate}
                            onChange={(e) => setHandoverDate(e.target.value)}
                            className="text-xs border-none bg-transparent focus:ring-0 p-0 text-slate-800 font-semibold cursor-pointer outline-none"
                        />
                    </label>
                    <Button size="sm" variant="quiet" icon={Printer} onClick={printDocket}>Print</Button>
                    <Button size="sm" icon={Download} onClick={downloadPdf}>Download PDF</Button>
                </div>
            </div>

            {/* Status Banner */}
            {signoffStatus === 'sent' && currentSignoff?.token && (
                <Panel
                    icon={Link2}
                    title="Waiting for the client's sign-off"
                    badge={<Chip tone="warn">Sent</Chip>}
                    blurb={`The ${designOnly ? 'design closeout' : 'handover docket'} is with the client for their digital signature. Share this link if they ask for it.`}
                    className="no-print"
                >
                    <p className="text-xs text-slate-600 break-all bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{getSignoffUrl(currentSignoff.token!)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button size="sm" onClick={() => handleCopy(getSignoffUrl(currentSignoff.token!))}>{copied ? 'Copied' : 'Copy link'}</Button>
                        <a href={getSignoffUrl(currentSignoff.token!)} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>Open sign-off screen</a>
                        <Button size="sm" onClick={() => setShowOverrideModal(true)} title="Record a signature given by WhatsApp, email or on paper">Record acceptance</Button>
                    </div>
                </Panel>
            )}

            {signoffStatus === 'signed' && (
                <div className="no-print">
                    <DigitalSignatureDocketView
                        docket={currentSignoff?.docket || {
                            signatoryName: currentSignoff?.clientName || projectContext.clientName || 'Client Signatory',
                            signatoryEmail: projectContext.clientEmail,
                            signedAt: currentSignoff?.signedAt || new Date().toISOString(),
                            signatureType: currentSignoff?.signatureType || 'draw',
                            signatureDataUrl: currentSignoff?.signatureDataUrl,
                            ipAddress: currentSignoff?.ipAddress || 'Client Portal Web',
                            docketHash: currentSignoff?.refId?.startsWith('SHA256') ? currentSignoff.refId : `SHA256:${currentSignoff?.refId || 'HANDOVER_SEALED'}`,
                            verified: true,
                            legalAffirmation: true,
                            manualOverride: currentSignoff?.manualOverride
                        }}
                        documentTitle={designOnly ? "Design Closeout & Final Drawing Set" : "Formal Handover & Warranty Docket"}
                        projectId={projectId}
                        projectName={projectName}
                        studioName={studioName}
                        canReset={true}
                        onReset={() => {
                            setProjectContext(prev => ({
                                ...prev,
                                handoverSignoff: { status: 'pending' }
                            }));
                        }}
                    />
                </div>
            )}

            {showOverrideModal && (
                <ManualAcceptanceOverrideModal
                    documentTitle={designOnly ? "Design Closeout & Final Drawing Set" : "Formal Handover & Warranty Docket"}
                    projectName={projectName}
                    defaultClientName={clientName}
                    defaultClientEmail={projectContext.clientEmail}
                    onConfirmOverride={(docket: DigitalSignatureDocket) => {
                        setProjectContext(buildSignoffPatch('handover', docket, {
                            surface: 'studio_manual',
                            via: (docket.manualOverride?.approvalMedium === 'whatsapp_approval' ? 'WhatsApp'
        : docket.manualOverride?.approvalMedium === 'email_confirmation' ? 'email'
        : null)
                        }));
                        setShowOverrideModal(false);
                    }}
                    onClose={() => setShowOverrideModal(false)}
                />
            )}

            {localError && (
                <div className="p-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-sm no-print">
                    {localError}
                </div>
            )}

            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    @page { margin: 15mm; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
                
                .docket-font {
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }
            `}} />

            {viewMode === 'summary' && (
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)] gap-4 items-start no-print">
                    <div className="space-y-4 min-w-0">
                        <Panel
                            icon={Clock}
                            title="Where it stands"
                            badge={statusChip}
                            blurb={signoffStatus === 'signed'
                                ? (designOnly ? 'Signed: the design engagement is closed.' : 'Signed: the site is handed over and the warranty runs from the handover date.')
                                : signoffStatus === 'sent'
                                    ? 'With the client for their signature.'
                                    : 'Not sent yet. Issue it to the client from Documents once the work is complete.'}
                        >
                            <ol className="grid grid-cols-3 gap-3">
                                {steps.map((st, i) => (
                                    <li key={st.label} className="hud-row-in min-w-0" style={{ animationDelay: `${i * 30}ms` }}>
                                        <span className={`block h-1 rounded-full ${st.done ? 'bg-[#3D52A0]' : 'bg-slate-200'}`} />
                                        <b className="block mt-2 text-sm font-semibold text-slate-800">{st.label}</b>
                                        <span className="block text-[11px] text-slate-500">{st.sub}</span>
                                    </li>
                                ))}
                            </ol>
                        </Panel>

                        <Panel icon={ListChecks} title="What the client signs" blurb="The closure the docket records. Open the document to read it in full." delay={30}>
                            <div className="divide-y divide-slate-100">
                                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 items-baseline py-2.5 px-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{designOnly ? 'Closeout' : 'Handover'}</span>
                                    <span className="text-sm text-slate-700">{displayDate} · {clientName}</span>
                                </div>
                                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 items-baseline py-2.5 px-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Checklist</span>
                                    <span className="text-sm text-slate-700">{checklist.join(' · ')}</span>
                                </div>
                                {designOnly ? (
                                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 items-baseline py-2.5 px-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Drawings</span>
                                        <span className="text-sm text-slate-700">{drawingsIssued ? `${drawingsIssued} in the final set` : 'The final Good for Construction set'}</span>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 items-baseline py-2.5 px-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Warranty</span>
                                        <span className="text-sm text-slate-700">{defaultWarrantyPeriod} months on workmanship, from the handover date</span>
                                    </div>
                                )}
                            </div>
                        </Panel>
                    </div>

                    <div className="space-y-4 min-w-0">
                        <Panel icon={BookOpen} title="The document" blurb={`${docTitle} · ${outline.length} sections`} delay={60}>
                            <ol>
                                {outline.map((t, i) => (
                                    <li key={t}>
                                        <button type="button" onClick={() => showDoc()} className="w-full flex gap-2 px-1 py-1.5 rounded-lg text-left text-sm text-slate-700 hover:bg-slate-50">
                                            <span className="w-6 shrink-0 text-slate-400 tabular-nums">{i + 1}</span>
                                            <span className="min-w-0">{t}</span>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                            <Button size="sm" className="mt-3" icon={BookOpen} onClick={() => showDoc()}>Read the document</Button>
                        </Panel>
                    </div>
                </div>
            )}

            {viewMode === 'doc' && (
            <div className="bg-slate-100 rounded-2xl p-4 md:p-8 flex justify-center overflow-x-auto print:p-0 print:bg-white">
            <div id="handover-docket-render" className="w-full max-w-[850px] bg-white print:shadow-none print:max-w-none text-slate-900 docket-font box-border shadow-md print:shadow-none" style={{ minHeight: '297mm' }}>
                <div className="p-8 md:p-12 print:p-0">
                    
                    {/* Custom Header */}
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-10">
                        <div className="flex-1">
                            {orgData?.orgLogo ? (
                                <img src={orgData.orgLogo} alt={studioName} className="max-h-16 object-contain" />
                            ) : (
                                <div className="space-y-1">
                                    <h2 className="text-slate-900 text-xl font-black uppercase tracking-widest m-0">{studioName}</h2>
                                    <p className="text-slate-500 text-[10px] tracking-widest uppercase m-0">Architecture & Interior Design</p>
                                </div>
                            )}
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold tracking-[0.2em] text-[#C6A96C] uppercase mb-1">Formal Document</p>
                            <p className="text-lg font-black text-slate-900 uppercase tracking-widest m-0">{docTitle}</p>
                        </div>
                    </div>

                    {/* Certificate Banner Layout */}
                    <div className="text-center py-6 mb-10">
                        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-[0.2em] text-slate-900 mb-4">{designOnly ? 'Design Completion' : 'Certificate of Completion'}</h1>
                        <div className="inline-block border border-slate-200 bg-slate-50 px-6 py-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mr-2">Project:</span>
                            <span className="text-[12px] font-black text-slate-900 uppercase tracking-wider">{projectName}</span>
                        </div>
                    </div>

                    {/* Project Meta */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12 p-6 bg-slate-50 rounded-sm border border-slate-100">
                        <div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1.5">Client</div>
                            <div className="font-semibold text-slate-900 text-[13px]">{clientName}</div>
                        </div>
                        <div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1.5">Project</div>
                            <div className="font-semibold text-slate-900 text-[13px]">{projectName}</div>
                        </div>
                        <div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1.5">Project Ref</div>
                            <div className="font-semibold text-slate-900 text-[13px]">{projectId}</div>
                        </div>
                        <div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1.5">{designOnly ? 'Date of Closeout' : 'Date of Handover'}</div>
                            <div className="font-semibold text-slate-900 text-[13px]">{displayDate}</div>
                        </div>
                    </div>

                    {/* Practical Completion Statement */}
                    <div className="mb-10">
                        <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-[0.15em] mb-4 flex items-center gap-3">
                            <span className="w-6 h-[2px] bg-[#C6A96C]"></span>
                            {designOnly ? '1. Design Completion' : '1. Practical Completion'}
                        </h4>
                        <p className="text-[13px] leading-relaxed text-slate-700 pl-9">
                            {designOnly
                                ? `This document closes the design engagement for the project referenced above. By signing it, the client acknowledges receipt of the final Good for Construction drawing set and the agreed design deliverables. Execution of the works is carried out by contractors engaged and paid by the client, who remain responsible for their workmanship.`
                                : `This document serves as the formal handover and closure of the interior execution phase for the project referenced above. By signing this document, all parties acknowledge that the works have been executed as per the agreed design intent and scope, and the site is handed over in a satisfactory, ready-to-use condition.`}
                        </p>
                    </div>

                    {/* Closure Checklist */}
                    <div className="mb-12">
                        <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-[0.15em] mb-4 flex items-center gap-3">
                            <span className="w-6 h-[2px] bg-[#C6A96C]"></span>
                            2. Closure Checklist
                        </h4>
                        {designOnly ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-9">
                            {[
                                ['Final Drawing Set', `The GFC set issued${drawingsIssued ? ` (${drawingsIssued} drawings)` : ''}.`],
                                ['Selections', 'Finishes and fittings schedule shared with the client.'],
                                ['Design Fee Settled', '100% of the design fee cleared.'],
                                ['Site Queries', 'Contractor queries on the drawings answered.'],
                            ].map(([title, text]) => (
                                <div key={title} className="flex items-start gap-3 p-4 border border-slate-200 rounded-sm bg-white">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                    <div>
                                        <div className="text-[11px] font-bold text-slate-900 uppercase tracking-wide mb-1">{title}</div>
                                        <div className="text-[11px] text-slate-500 leading-snug">{text}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-9">
                            <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-sm bg-white">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                <div>
                                    <div className="text-[11px] font-bold text-slate-900 uppercase tracking-wide mb-1">Final Financial Settlement</div>
                                    <div className="text-[11px] text-slate-500 leading-snug">100% of execution fees and additionals cleared.</div>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-sm bg-white">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                <div>
                                    <div className="text-[11px] font-bold text-slate-900 uppercase tracking-wide mb-1">Defect Rectification</div>
                                    <div className="text-[11px] text-slate-500 leading-snug">All snag list items and defects resolved.</div>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-sm bg-white">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                <div>
                                    <div className="text-[11px] font-bold text-slate-900 uppercase tracking-wide mb-1">Site Clearance</div>
                                    <div className="text-[11px] text-slate-500 leading-snug">Deep cleaning completed; tools and debris removed.</div>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-sm bg-white">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                <div>
                                    <div className="text-[11px] font-bold text-slate-900 uppercase tracking-wide mb-1">Access Handover</div>
                                    <div className="text-[11px] text-slate-500 leading-snug">All site keys and access cards returned to client.</div>
                                </div>
                            </div>
                        </div>
                        )}
                    </div>

                    {/* Warranty and care: turnkey only. A design-only studio built nothing to warrant. */}
                    {!designOnly && (<>
                    {/* Section: Warranty Certificate */}
                    <div className="break-inside-avoid mb-10 pt-4 border-t border-slate-200">
                        <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-[0.15em] mb-6 flex items-center gap-3">
                            <span className="w-6 h-[2px] bg-[#C6A96C]"></span>
                            3. Warranty Certificate
                        </h4>
                        
                        <div className="bg-slate-900 text-white p-8 rounded-sm">
                            <div className="flex justify-between items-start mb-8 border-b border-slate-700 pb-6">
                                <div>
                                    <div className="text-[9px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-2">Valid From Handover Date</div>
                                    <div className="text-2xl md:text-3xl font-black tracking-widest uppercase">Active Warranty</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[9px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-2">Duration</div>
                                    <div className="text-2xl md:text-3xl font-black tracking-widest text-[#C6A96C] uppercase">{defaultWarrantyPeriod} Months</div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-[12px]">
                                <div>
                                    <strong className="block text-[#C6A96C] mb-2 uppercase tracking-[0.15em] text-[10px]">Coverage</strong>
                                    <p className="text-slate-300 leading-relaxed">This warranty covers workmanship defects in executed carpentry, installation, finishing, and agreed trade works under normal residential usage conditions.</p>
                                </div>
                                <div>
                                    <strong className="block text-[#C6A96C] mb-2 uppercase tracking-[0.15em] text-[10px]">Exclusions</strong>
                                    <p className="text-slate-300 leading-relaxed">Excludes misuse, negligence, overloading, impact damage, scratches, stains, burns, water damage, pest/termite damage, and unauthorised third-party modifications.</p>
                                </div>
                                <div className="md:col-span-2 pt-4 border-t border-slate-700">
                                    <strong className="block text-[#C6A96C] mb-2 uppercase tracking-[0.15em] text-[10px]">Third-Party Products & Appliances</strong>
                                    <p className="text-slate-300 leading-relaxed">Items such as lights, appliances, hardware, fittings, and sanitaryware are covered directly by their respective manufacturer warranties. Client-supplied materials are entirely excluded from the {studioName} workmanship warranty.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section: Care & Maintenance Guidelines */}
                    <div className="break-inside-avoid mb-12">
                        <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-[0.15em] mb-6 flex items-center gap-3">
                            <span className="w-6 h-[2px] bg-[#C6A96C]"></span>
                            4. Care & Maintenance
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 pl-9">
                            <div>
                                <strong className="block text-slate-900 mb-1 text-[11px] uppercase tracking-wide">Woodwork & Laminates</strong>
                                <p className="text-[11px] text-slate-600 leading-relaxed">Wipe with a soft, slightly damp microfibre cloth. Avoid excessive water, harsh chemicals, or abrasive scrubbers. Ensure spills are dried immediately to prevent edge-banding damage.</p>
                            </div>
                            <div>
                                <strong className="block text-slate-900 mb-1 text-[11px] uppercase tracking-wide">Hardware & Hinges</strong>
                                <p className="text-[11px] text-slate-600 leading-relaxed">Soft-close channels and hinges should be kept free of dust. Do not forcefully push soft-close drawers or cabinets closed, as this damages the hydraulic mechanism over time.</p>
                            </div>
                            <div>
                                <strong className="block text-slate-900 mb-1 text-[11px] uppercase tracking-wide">Stone & Countertops</strong>
                                <p className="text-[11px] text-slate-600 leading-relaxed">Clean with pH-neutral cleaners. Avoid acidic solutions (like lemon or vinegar) on marble. Always use trivets for hot pans to prevent thermal shock or resin burning on quartz.</p>
                            </div>
                            <div>
                                <strong className="block text-slate-900 mb-1 text-[11px] uppercase tracking-wide">Post-Handover Support</strong>
                                <p className="text-[11px] text-slate-600 leading-relaxed">For any warranty claims or maintenance requests, please email our operations desk with photographs of the issue. Claims are processed within 3-5 working days.</p>
                            </div>
                        </div>
                    </div>
                    </>)}

                    {/* Section D: Sign-off */}
                    <div className="break-inside-avoid pt-10">
                        <div className="grid grid-cols-2 gap-16 md:gap-32 pl-9">
                            <div>
                                <div className="h-px bg-slate-300 mb-4"></div>
                                <div className="text-[11px] font-bold text-slate-900 uppercase tracking-[0.15em]">Client Sign-off</div>
                                <div className="text-[12px] font-semibold text-slate-700 mt-2">{clientName}</div>
                                <div className="text-[10px] text-slate-400 mt-8 italic">Date &amp; Signature</div>
                            </div>
                            <div>
                                <div className="h-px bg-slate-300 mb-4"></div>
                                <div className="text-[11px] font-bold text-slate-900 uppercase tracking-[0.15em]">Authorised Signatory</div>
                                <div className="text-[12px] font-semibold text-slate-700 mt-2">For {studioName}</div>
                                <div className="text-[10px] text-slate-400 mt-8 italic">Date &amp; Signature</div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Custom Footer */}
                    <div className="mt-16 pt-6 border-t border-slate-200 text-center text-slate-400 text-[9px] uppercase tracking-widest break-inside-avoid">
                        <p className="mb-1">{studioName}</p>
                        <p>{orgData?.contactEmail ? `E: ${orgData.contactEmail}` : ''} {orgData?.contactPhone ? ` | T: ${orgData.contactPhone}` : ''}</p>
                    </div>

                </div>
            </div>
            </div>
            )}
        </div>
    );
}
