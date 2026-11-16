import React, { useState } from 'react';
import { buildSignoffPatch } from '../../services/clientApprovalEngine';
import { ProjectContext, DigitalSignatureDocket } from '../../types';
import { Download, Printer, Clock, ListChecks, BookOpen, Link2 } from '@/lib/lucide-shim';
import { Panel, Button, Chip, Segmented, buttonClass } from '../ui/kit';
import { useOrg } from '../../contexts/OrgContext';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import { studioDisplayName } from '../../lib/studioName';
import { prepareClonedDocForPdf } from '../../lib/pdfUtils';
import DigitalSignatureDocketView from '../common/DigitalSignatureDocket';
import ManualAcceptanceOverrideModal from '../ops/ManualAcceptanceOverrideModal';
import { publicAppOrigin } from '../../lib/publicUrl';
import { engagementOf } from '../../lib/engagement';
import { handoverDisplayDate, drawingsIssuedOf } from '../../lib/handoverDocket';
import HandoverDocketSheet from '../documents/HandoverDocketSheet';

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

      The document itself is HandoverDocketSheet, the same component the client
      portal draws from the released snapshot, so the two copies cannot drift.
    */
    const designOnly = engagementOf(projectContext) === 'design_only';
    const docTitle = designOnly ? 'Design Closeout' : 'Handover Docket';
    const fileStem = designOnly ? 'Design_Closeout' : 'Handover_Docket';
    const drawingsIssued = drawingsIssuedOf(projectContext);
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
    /*
      The project's handover date, as the client's copy prints it. The page used
      to have a date picker of its own that was never saved, so a PDF downloaded
      here could carry a different date from the copy released to the client.
    */
    const displayDate = handoverDisplayDate(projectContext.handoverDate);

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
                    <span className="text-xs text-slate-500">
                        {designOnly ? 'Closeout date' : 'Handover date'} <b className="font-semibold text-slate-800">{displayDate}</b>
                    </span>
                    <Button size="sm" variant="quiet" icon={Printer} onClick={printDocket}>Print</Button>
                    <Button size="sm" icon={Download} onClick={downloadPdf}>Download PDF</Button>
                </div>
            </div>

            {!projectContext.handoverDate && (
                <p className="text-xs text-slate-500 no-print">Dated today until the handover is marked in Site Control Room or on the project card.</p>
            )}

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
                <HandoverDocketSheet
                    projectContext={projectContext}
                    studioName={studioName}
                    clientName={clientName}
                    projectName={projectName}
                    projectId={projectId}
                    displayDate={displayDate}
                    defaultWarrantyPeriod={defaultWarrantyPeriod}
                    org={{
                        orgLogo: orgData?.orgLogo,
                        contactEmail: orgData?.contactEmail,
                        contactPhone: orgData?.contactPhone,
                        officeAddress: orgData?.officeAddress
                    }}
                    designOnly={designOnly}
                    drawingsIssued={drawingsIssued}
                />
            </div>
            )}
        </div>
    );
}
