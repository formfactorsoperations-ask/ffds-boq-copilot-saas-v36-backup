import React, { useState } from 'react';
import { buildSignoffPatch } from '../../services/clientApprovalEngine';
import { ProjectContext, DigitalSignatureDocket } from '../../types';
import { Download, Printer } from '@/lib/lucide-shim';
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

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Status Banner */}
            {signoffStatus === 'sent' && currentSignoff?.token && (
                <div className="bg-amber-50 border border-amber-200 p-6 no-print">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="flex-grow">
                            <h3 className="text-lg font-black text-amber-900 uppercase tracking-wider mb-2">Awaiting Client Sign-Off</h3>
                            <p className="text-sm text-amber-800">The {designOnly ? "design closeout" : "handover docket"} has been generated and is awaiting digital signature.</p>
                            
                            <div className="mt-4 p-4 bg-white rounded-xl border border-amber-200 shadow-xs">
                                <div className="flex items-center justify-between mb-2 pb-2 border-b border-amber-100">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Digital Sign-Off URL</span>
                                    <button 
                                        onClick={() => handleCopy(getSignoffUrl(currentSignoff.token!))}
                                        className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-bold rounded transition-all cursor-pointer"
                                    >
                                        {copied ? "Copied!" : "Copy Link"}
                                    </button>
                                </div>
                                <div className="text-[11px] font-mono break-all text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
                                    {getSignoffUrl(currentSignoff.token!)}
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <a href={getSignoffUrl(currentSignoff.token!)} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-[#3D52A0] hover:bg-[#334486] text-white rounded-lg text-[11px] font-bold tracking-tight inline-block cursor-pointer">
                                        Open Sign-Off Screen &rarr;
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="shrink-0 border-l border-amber-200 pl-6 space-y-2">
                            <button
                                onClick={() => setShowOverrideModal(true)}
                                className="px-4 py-2.5 bg-white border border-amber-300 text-amber-900 text-xs font-bold rounded-xl shadow-xs hover:bg-amber-100 transition uppercase tracking-wider cursor-pointer"
                            >
                                Ops Override: Record Acceptance
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {signoffStatus === 'signed' && (
                <div className="p-6 bg-slate-50 no-print">
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
            
            <div className="flex-none p-6 border-b border-slate-200 bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 z-10 sticky top-0 shadow-sm print:hidden">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 docket-font">
                        {designOnly ? 'Design Closeout' : 'Handover Docket & Warranty'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">{designOnly ? 'The client’s sign-off on the final drawing set, closing the design engagement.' : 'Formal completion certificate, warranty terms, and care guidelines.'}</p>
                    {!projectContext.handoverDate && <p className="text-xs text-slate-500 mt-1">Dated today until the handover is marked in Site Control Room or on the project card.</p>}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-50 transition-colors"
                    >
                        <Printer className="w-4 h-4" />
                        Print
                    </button>
                    <button
                        onClick={handleDownloadPdf}
                        className="flex items-center gap-2 px-4 py-2 bg-[#3D52A0] text-white text-sm font-medium rounded-lg hover:bg-[#334486] transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Download PDF
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center pb-24 print:p-0 print:pb-0 print:bg-white">
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
        </div>
    );
}
