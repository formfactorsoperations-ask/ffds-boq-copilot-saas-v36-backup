import React, { useMemo, useRef, useState } from 'react';
import { getCurrentIssue } from '../../services/documentIssueEngine';
import { agreementScope } from '../../services/documentReleaseEngine';
import ExecutionStamp from '../documents/ExecutionStamp';
import ExecutionAgreementSheet from '../documents/ExecutionAgreementSheet';
import { ProjectContext, DigitalSignatureDocket } from '../../types';
import { useOrg } from '../../contexts/OrgContext';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import { Download, Share2, Copy, ExternalLink, Tablet, KeyRound, Check, Pencil } from '@/lib/lucide-shim';
import { calculateSellPrice } from '../../lib/utils';
import { resolveAgreement, type AgreementOverrides } from '../../lib/executionAgreement';
import { ShieldCheckIcon } from '../Icons';
import { sendAgreementSignoffRequest } from '../../services/emailService';
import { db as dbService } from '../../services/dbService';
import { db as firestore } from '../../services/firebaseClient';
import { doc, updateDoc } from 'firebase/firestore';
import { usePageHeader } from '../../contexts/PageHeaderContext';
import { downloadSectionsAsPdf } from '../../lib/documentPdf';
import DigitalSignatureDocketView from '../common/DigitalSignatureDocket';
import DigitalSignaturePad from '../common/DigitalSignaturePad';
import ManualAcceptanceOverrideModal from '../ops/ManualAcceptanceOverrideModal';
import { publicAppOrigin } from '../../lib/publicUrl';

interface ExecutionAgreementPageProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    tenantId?: string;
    projectId?: string;
    activeTier?: any;
    fullBoq?: any[];
    /** The project's options and rate bank, so Annexure F is the approved scope priced as the client's copy prices it. */
    tiers?: any[];
    bank?: any[];
}

/*
  The page renders the same ExecutionAgreementSheet the client's issued copy
  renders, from the same resolver (lib/executionAgreement). It used to carry
  its own copy of all eleven pages, with its own figures: the money it stated
  was whatever was typed into the agreement the first time, so Money's
  discounts and GST never reached it.
*/
export default function ExecutionAgreementPage({ projectContext, setProjectContext, tenantId, projectId: propProjectId, activeTier, fullBoq, tiers, bank }: ExecutionAgreementPageProps) {
    const { orgData } = useOrg();
    /* Signature evidence lives on the issue. */
    const execIssue = getCurrentIssue(projectContext, 'execution_agreement');
    const { settings } = useStudioSettings(tenantId || '');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    const studioName = settings?.companyName || orgData.orgName || 'Form Factors Design Studio';
    const studioAddress = orgData.officeAddress || '534, 5th Floor, Lodha Signet A, Kolshet Road, Thane West, Maharashtra 400607';
    const studioEmail = orgData.contactEmail || 'formfactors.operations@gmail.com';
    const repName = orgData.signatoryName || 'Principal Name';
    const projectId = propProjectId || (projectContext as any).projectId || (projectContext as any).id || (projectContext.name ? projectContext.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Project');

    /*
      Annexure F: the approved scope, priced and described as the client's
      copy will be (agreementScope). The raw option lines this used to list
      carried "Details missing from bank" for every line whose bank item had
      moved. The calculated option is the fallback when there are no stored
      options to read.
    */
    const scopeLines = useMemo(() => {
        const scope = agreementScope(projectContext, { tiers: tiers || [], bank: bank || [] } as any);
        if (scope.lines.length) return scope.lines;
        return (fullBoq || []).map((item: any, i: number) => {
            const rate = item.unitCost !== undefined ? item.unitCost : calculateSellPrice(item.materials, item.labor, item.margin);
            return {
                id: String(item.id || `line-${i}`),
                name: item.name || item.description || 'Item',
                room: item.roomId || 'General Scope',
                cat: item.cat || item.category || item.roomId || '',
                unit: item.unit,
                qty: Number(item.qty) || 0,
                unitCost: rate,
                finalCost: item.finalCost !== undefined ? item.finalCost : rate * (Number(item.qty) || 0),
                specs: item.internalSpecs || item.specs || item.commercialNote || '',
            };
        });
    }, [projectContext, tiers, bank, fullBoq]);

    const agreement = useMemo(() => resolveAgreement(projectContext, {
        tierSummary: activeTier?.summary,
        scopeLines,
        studioName,
        defaultDuration: settings?.procurementLeadTimeWeeks ? settings.procurementLeadTimeWeeks * 7 + 45 : 60,
    }), [projectContext, activeTier, scopeLines, studioName, settings?.procurementLeadTimeWeeks]);

    /* Edits are saved on the project as they are typed. A key set to undefined goes back to the live value. */
    const changeOverrides = (update: Partial<AgreementOverrides> | ((o: AgreementOverrides) => Partial<AgreementOverrides>)) => {
        setProjectContext((prev: any) => {
            const current: AgreementOverrides = prev.executionAgreementOverrides || {};
            const patch = typeof update === 'function' ? update(current) : update;
            const next: AgreementOverrides = { ...current, ...patch };
            Object.keys(next).forEach((k) => { if (next[k] === undefined) delete next[k]; });
            return { ...prev, executionAgreementOverrides: next };
        });
    };

    /*
      The agreement is laid out on screen as A4 "page cards" with grey gaps
      between them, and each card grows past A4 when its section is long. The
      old export (html2pdf) cut that whole strip at fixed A4 heights, so cuts
      fell mid-section: half-empty pages, grey bands, and the cards' own
      "Page 1" footers in the middle of a page.

      Now the sheets are laid out as print for the capture (no cards, no
      gaps), and each section goes through the shared document PDF builder on
      its own: every section starts a new page, a clause or table row is never
      cut in two, and the page header, footer and "Page x of y" are drawn on
      every page.
    */
    const handleDownloadPdf = () => {
        const wasEditing = isEditMode;
        if (wasEditing) {
            setIsEditMode(false);
        }
        setIsGenerating(true);

        setTimeout(async () => {
            const element = contentRef.current;
            try {
                if (!element) return;
                element.classList.add('ea-printing');
                // A timer, not animation frames: frames pause while the tab is in the background.
                await new Promise((r) => setTimeout(r, 120));
                const sections = Array.from(element.querySelectorAll('.ea-page')) as HTMLElement[];
                await downloadSectionsAsPdf(sections, {
                    filename: `FFDS-Execution-Agreement-${(projectContext as any).projectId || 'Draft'}.pdf`,
                    title: `Integrated Execution Agreement · ${(projectContext as any)?.name || ''}`.trim(),
                    studioName,
                    keepTogether: '.ea-clause,.ea-box,.ea-sig-grid,.ea-avoid-break,.ea-annex-title',
                    // A section starts on the same page when at least a third of it is left.
                    flowWhenRemaining: 0.33,
                });
            } catch (err) {
                console.error('Failed to generate the agreement PDF', err);
                alert('The PDF could not be made. Please try again.');
            } finally {
                element?.classList.remove('ea-printing');
                setIsGenerating(false);
                if (wasEditing) setIsEditMode(true);
            }
        }, 150);
    };

    usePageHeader({
        badge: isEditMode ? 'Editing' : undefined,
        actions: (
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setIsEditMode(!isEditMode)}
                    className={isEditMode
                        ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#3D52A0] text-white text-xs font-bold hover:bg-[#334486]'
                        : 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50'}
                >
                    <Pencil className="w-3.5 h-3.5" />
                    {isEditMode ? 'Done editing' : 'Edit agreement'}
                </button>
                <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isGenerating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#3D52A0] text-white text-xs font-bold hover:bg-[#334486] disabled:opacity-50"
                >
                    <Download className="w-3.5 h-3.5" />
                    {isGenerating ? 'Making the PDF…' : 'Download PDF'}
                </button>
            </div>
        )
    }, [isEditMode, isGenerating]);

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in pb-16">

            {isEditMode && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-start gap-3 hud-panel-in">
                    <div className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0">
                        <Pencil className="w-4 h-4" />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800">Editing this agreement</h4>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                            Client and project details, the representatives, the payment schedule wording, Annexures B and C and each BOQ line's description can be changed on the pages below. Use "Add clause" at the end of any article to add your own clauses and sub-clauses. Figures come from Money and the approved BOQ as they stand now. Everything is saved as you type and goes into the copy the client receives when you next issue it.
                        </p>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto p-4 sm:p-8 flex justify-center">
                <ExecutionAgreementSheet
                    agreement={agreement}
                    studioName={studioName}
                    studioAddress={studioAddress}
                    studioEmail={studioEmail}
                    repName={repName}
                    repTitle={orgData.signatoryTitle}
                    projectId={projectId}
                    contentRef={contentRef}
                    signature={execIssue?.clientSignature || execIssue?.counterSignature
                        ? <ExecutionStamp issue={execIssue} mode="signature" />
                        : undefined}
                    isEditMode={isEditMode}
                    onChange={changeOverrides}
                />
            </div>
            
            {/* Sign-off & Execution Protocol */}
            <div className="mt-8 pt-8 border-t-4 border-[#334486] break-inside-avoid">
                <h3 className="text-lg font-bold text-slate-900 uppercase tracking-wide mb-6 font-opensans">
                    Acceptance & Sign-off
                </h3>
                
                <ExecutionAgreementSignoffBlock 
                    clientName={agreement.parties.clientName || 'Client'} 
                    location={projectContext.location || 'Site'} 
                    projectId={projectId} 
                    setProjectContext={setProjectContext} 
                    projectContext={projectContext} 
                    grandTotal={agreement.money.grandTotal} 
                    tenantId={tenantId}
                />
            </div>
        </div>
    );
}

const ExecutionAgreementSignoffBlock: React.FC<{ clientName: string, location: string, projectId: string, setProjectContext: any, projectContext: ProjectContext, grandTotal: number, tenantId?: string }> = ({ clientName, location, projectId, setProjectContext, projectContext, grandTotal, tenantId }) => {
    const { orgData } = useOrg();
    const { settings } = useStudioSettings(tenantId || '');
    const studioName = settings?.companyName || orgData?.name || 'Form Factors Design Studio';
    const [isSending, setIsSending] = useState(false);
    const [showSendConfirm, setShowSendConfirm] = useState(false);
    const [showMarkManual, setShowMarkManual] = useState(false);
    const [showInPersonModal, setShowInPersonModal] = useState(false);
    const [manualRef, setManualRef] = useState("Digital Confirmation");
    const [localError, setLocalError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [pinCopied, setPinCopied] = useState(false);

    const currentSignoff = (projectContext as any).executionSignoff;
    const status = currentSignoff?.status || 'pending';

    const getSignoffUrl = (token: string) => {
        let appDomain = publicAppOrigin();
        if (appDomain.includes('ais-dev-')) {
            appDomain = appDomain.replace('ais-dev-', 'ais-pre-');
        }
        return `${appDomain}/?agreementSignoff=${token}`;
    };

    const sendEmailSignoff = async () => {
        setLocalError(null);
        if (!projectContext.clientEmail || !projectContext.clientEmail.trim()) {
            setLocalError("Client email is required to send the digital agreement. Please enter a valid email address in the input field below.");
            return;
        }

        setIsSending(true);
        try {
            const result = await sendAgreementSignoffRequest(
                projectId || '', 
                projectContext, 
                grandTotal, 
                undefined, 
                tenantId || orgData?.tenantId || 'demo-tenant-01', 
                'execution'
            );
            
            const tokenToUse = result.token || `EXEC_AGREEMENT_${projectId}_${Date.now()}`;
            const accessPinToUse = result.accessPin || `SEC-${Math.floor(1000 + Math.random() * 9000)}`;
            const newSignoff = {
                status: 'sent' as const,
                token: tokenToUse,
                accessPin: accessPinToUse,
                docketHash: result.docketHash,
                sentAt: new Date().toISOString()
            };

            const updatedContext = { ...projectContext, executionSignoff: newSignoff };
            setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: newSignoff }));
            setShowSendConfirm(false);

            // Immediate persistence to ensure client link works instantly without race conditions
            try {
                const allProjects = await dbService.getProjects();
                const currentProj = allProjects.find(p => p.id === projectId);
                if (currentProj) {
                    await dbService.saveProject({
                        ...currentProj,
                        context: updatedContext,
                        lastModified: Date.now()
                    });
                }
                if (firestore && projectId) {
                    await updateDoc(doc(firestore, 'projects', projectId), {
                        'context.executionSignoff': newSignoff,
                        lastModified: Date.now()
                    });
                }
            } catch (pErr) {
                console.warn("Immediate signoff sync note:", pErr);
            }

            if (result.error) {
                setLocalError(`Email dispatch status: ${result.error}. The digital sign-off link & access PIN are active below.`);
            }
        } catch (err: any) {
            console.error("Signoff send error:", err);
            const fallbackToken = `EXEC_AGREEMENT_${projectId}_${Date.now()}`;
            const fallbackPin = `SEC-${Math.floor(1000 + Math.random() * 9000)}`;
            const fallbackSignoff = {
                status: 'sent' as const,
                token: fallbackToken,
                accessPin: fallbackPin,
                sentAt: new Date().toISOString()
            };
            const updatedContext = { ...projectContext, executionSignoff: fallbackSignoff };
            setProjectContext?.((prev: any) => ({ 
                ...prev, 
                executionSignoff: fallbackSignoff 
            }));
            setShowSendConfirm(false);

            try {
                const allProjects = await dbService.getProjects();
                const currentProj = allProjects.find(p => p.id === projectId);
                if (currentProj) {
                    await dbService.saveProject({
                        ...currentProj,
                        context: updatedContext,
                        lastModified: Date.now()
                    });
                }
            } catch (pErr) {
                console.warn("Fallback signoff persistence note:", pErr);
            }

            setLocalError(`Notice: ${err.message || 'Email dispatch skipped in sandbox mode'}. Digital signature URL & PIN generated successfully below.`);
        } finally {
            setIsSending(false);
        }
    };

    const handleConfirmManualOverride = (docket: DigitalSignatureDocket) => {
        const newSignoff = {
            status: 'signed' as const,
            clientName: docket.signatoryName,
            clientEmail: docket.signatoryEmail,
            ipAddress: docket.ipAddress,
            refId: docket.docketHash,
            signedAt: docket.signedAt,
            signatureType: docket.signatureType,
            signatureDataUrl: docket.signatureDataUrl,
            docket: docket,
            manualOverride: docket.manualOverride
        };
        setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: newSignoff }));
        setShowMarkManual(false);
    };

    const handleInPersonSignSubmit = (docket: DigitalSignatureDocket) => {
        const newSignoff = {
            status: 'signed' as const,
            clientName: docket.signatoryName,
            clientEmail: docket.signatoryEmail,
            ipAddress: 'In-Person (Studio Device)',
            refId: docket.docketHash,
            signedAt: docket.signedAt,
            signatureType: docket.signatureType,
            signatureDataUrl: docket.signatureDataUrl,
            docket: {
                ...docket,
                ipAddress: 'In-Person (Studio Device)'
            }
        };
        setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: newSignoff }));
        setShowInPersonModal(false);
    };

    const handleReset = () => {
        setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: { status: 'pending' } }));
    };

    const handleCopy = (txt: string) => {
        navigator.clipboard.writeText(txt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyPin = (pin: string) => {
        navigator.clipboard.writeText(pin);
        setPinCopied(true);
        setTimeout(() => setPinCopied(false), 2000);
    };

    const shareViaWhatsApp = (link: string, pin: string) => {
        const text = encodeURIComponent(
            `Dear ${projectContext.clientName || 'Client'},\n\n` +
            `Your official Execution Agreement for *${projectContext.name || 'Interior Design Project'}* has been dispatched for authorization by ${studioName}.\n\n` +
            `🔒 *Document Access PIN:* ${pin}\n\n` +
            `Direct Review & Sign Link:\n${link}\n\n` +
            `You can also open our studio portal and verify via your Access PIN without clicking unknown links.`
        );
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    // View: EXECUTED (Stamped)
    if (status === 'signed') {
        const docketToRender: DigitalSignatureDocket = currentSignoff?.docket || {
            signatoryName: currentSignoff?.clientName || clientName || 'Client Signatory',
            signatoryEmail: currentSignoff?.clientEmail || projectContext.clientEmail,
            signedAt: currentSignoff?.signedAt || new Date().toISOString(),
            signatureType: currentSignoff?.signatureType || (currentSignoff?.ipAddress === 'Internal' ? 'manual_override' : 'draw'),
            signatureDataUrl: currentSignoff?.signatureDataUrl,
            ipAddress: currentSignoff?.ipAddress || 'Client Portal Web',
            docketHash: currentSignoff?.refId?.startsWith('SHA256') ? currentSignoff.refId : `SHA256:${currentSignoff?.refId || 'EXEC_SEALED'}`,
            verified: true,
            legalAffirmation: true,
            manualOverride: currentSignoff?.manualOverride || (currentSignoff?.ipAddress === 'Internal' ? {
                isOverride: true,
                recordedBy: 'Ops Director',
                recordedAt: currentSignoff?.signedAt || new Date().toISOString(),
                overrideReason: 'Manual Ops Acceptance',
                approvalMedium: 'paper_wet_ink'
            } : undefined)
        };

        return (
            <div className="mt-6 space-y-4 break-inside-avoid">
                <DigitalSignatureDocketView
                    docket={docketToRender}
                    documentTitle="Integrated Interior Execution Agreement"
                    projectId={projectId}
                    projectName={projectContext.name}
                    studioName={studioName}
                    canReset={true}
                    onReset={handleReset}
                />
            </div>
        );
    }

    // View: SENT
    if (status === 'sent') {
        const sentTimestamp = currentSignoff?.sentAt ? new Date(currentSignoff.sentAt).toLocaleString() : 'N/A';
        const link = currentSignoff?.token ? getSignoffUrl(currentSignoff.token) : '';
        const accessPin = currentSignoff?.accessPin || 'SEC-8492';

        return (
            <div className="mt-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-2xl p-6 relative break-inside-avoid shadow-xs">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex-grow w-full md:w-auto">
                         <div className="flex items-center gap-2 mb-1.5">
                             <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                             <h4 className="text-sm font-bold uppercase tracking-widest text-amber-900">
                                 Awaiting Client Signature
                             </h4>
                         </div>
                         <p className="text-xs text-amber-800 max-w-xl">
                             Digital agreement active at {sentTimestamp}. Dispatched to <strong>{projectContext.clientEmail || 'Client'}</strong>.
                         </p>

                         {/* Security PIN & Anti-Phishing Details */}
                         <div className="mt-4 p-4 bg-white rounded-xl border border-amber-200 shadow-xs space-y-3">
                             <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                                 <div className="flex items-center gap-2">
                                     <KeyRound className="w-4 h-4 text-[#3D52A0]" />
                                     <span className="text-xs font-bold text-slate-900">Document Access PIN:</span>
                                     <span className="font-mono text-sm font-extrabold text-[#3D52A0] bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                                         {accessPin}
                                     </span>
                                 </div>
                                 <button 
                                     onClick={() => handleCopyPin(accessPin)}
                                     className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded transition-all flex items-center gap-1 cursor-pointer"
                                 >
                                     {pinCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                     {pinCopied ? "PIN Copied!" : "Copy PIN"}
                                 </button>
                             </div>

                             <div>
                                 <div className="flex items-center justify-between mb-1.5">
                                     <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Secure Direct Link</span>
                                     <button 
                                         onClick={() => handleCopy(link)}
                                         className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-bold rounded transition-all flex items-center gap-1 cursor-pointer"
                                     >
                                         {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                         {copied ? "Link Copied!" : "Copy Link"}
                                     </button>
                                 </div>
                                 <div className="text-[11px] font-mono break-all text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-200">
                                     {link}
                                 </div>
                             </div>

                             <div className="pt-2 flex flex-wrap items-center gap-2">
                                 <a 
                                     href={link} 
                                     target="_blank" 
                                     rel="noopener noreferrer" 
                                     className="px-3.5 py-2 bg-[#3D52A0] hover:bg-[#334486] text-white rounded-lg text-xs font-bold tracking-tight inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                                 >
                                     <ExternalLink className="w-3.5 h-3.5" />
                                     Open Client Sign-Off Screen
                                 </a>
                                 <button 
                                     onClick={() => shareViaWhatsApp(link, accessPin)}
                                     className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                                 >
                                     <Share2 className="w-3.5 h-3.5" />
                                     Share on WhatsApp
                                 </button>
                             </div>
                         </div>

                         <div className="flex items-center gap-3 mt-4 text-xs font-bold">
                             <button onClick={() => setShowSendConfirm(true)} disabled={isSending} className="underline text-amber-700 hover:text-amber-900 cursor-pointer">
                                 {isSending ? 'Dispatching...' : 'Resend Email'}
                             </button>
                             <span className="text-amber-300">|</span>
                             <button onClick={handleReset} className="underline text-amber-700 hover:text-amber-900 cursor-pointer">
                                 Cancel Request
                             </button>
                         </div>
                         {showSendConfirm && (
                             <div className="mt-4 p-4 border border-amber-300 bg-amber-100 rounded-xl flex flex-col gap-2">
                                 <p className="text-xs font-bold">Confirm Resend Execution Agreement?</p>
                                 <div className="flex items-center gap-2">
                                     <button onClick={sendEmailSignoff} className="px-3 py-1 bg-amber-600 text-white rounded text-xs cursor-pointer">Yes, Resend</button>
                                     <button onClick={() => setShowSendConfirm(false)} className="px-3 py-1 bg-transparent border border-amber-600 text-amber-700 rounded text-xs cursor-pointer">Cancel</button>
                                 </div>
                             </div>
                         )}
                         {localError && <p className="text-red-600 text-xs mt-2">{localError}</p>}
                    </div>

                    <div className="no-print shrink-0 border-t md:border-t-0 md:border-l border-amber-200 pt-4 md:pt-0 md:pl-6 space-y-2.5 w-full md:w-auto">
                        <button 
                            onClick={() => setShowInPersonModal(true)}
                            className="w-full flex justify-center items-center gap-2 px-4 py-2.5 bg-[#3D52A0] text-white text-xs font-bold rounded-xl shadow-xs hover:bg-[#334486] transition-all cursor-pointer"
                        >
                            <Tablet className="w-4 h-4" />
                            Client In-Person Signing (Tablet)
                        </button>
                        <button 
                            onClick={() => setShowMarkManual(true)}
                            className="w-full flex justify-center items-center gap-2 px-4 py-2.5 bg-white border border-amber-300 text-amber-800 text-[10px] font-bold rounded-xl shadow-xs hover:bg-amber-100 transition-all uppercase tracking-widest cursor-pointer"
                        >
                            Ops Override: Record Acceptance
                        </button>
                    </div>
                </div>

                {showInPersonModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                        <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                <div className="flex items-center gap-2 text-slate-900 font-bold">
                                    <Tablet className="w-5 h-5 text-[#3D52A0]" />
                                    <span>In-Person Client Signing</span>
                                </div>
                                <button onClick={() => setShowInPersonModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer">&times;</button>
                            </div>
                            <p className="text-xs text-slate-600">
                                Hand your device or tablet to <strong>{projectContext.clientName || 'the client'}</strong> to affix their signature in person.
                            </p>
                            <DigitalSignaturePad
                                initialName={projectContext.clientName || ''}
                                initialEmail={projectContext.clientEmail || ''}
                                documentTitle="Integrated Interior Execution Agreement"
                                projectTitle={projectContext.name}
                                onSignComplete={handleInPersonSignSubmit}
                            />
                        </div>
                    </div>
                )}

                {showMarkManual && (
                    <ManualAcceptanceOverrideModal
                        documentTitle="Integrated Interior Execution Agreement"
                        projectName={projectContext.name}
                        defaultClientName={projectContext.clientName}
                        defaultClientEmail={projectContext.clientEmail}
                        onConfirmOverride={handleConfirmManualOverride}
                        onClose={() => setShowMarkManual(false)}
                    />
                )}
            </div>
        );
    }

    // View: PENDING (Instructions)
    return (
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-6 relative break-inside-avoid">
            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                <div className="flex-grow">
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                        Execution Protocol
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-xl mb-4">
                        <strong>No physical signature required.</strong> To execute this agreement, click "Send agreement" to securely email the digital sign-off link to the client.
                    </p>

                    <div className="mt-4 mb-5 p-4 border rounded-xl bg-sky-50/50 border-sky-200 max-w-xl">
                        <label className="block text-[11px] font-bold text-slate-900 uppercase tracking-wider mb-1.5">
                            Client Email Address Setup
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input 
                                type="email" 
                                value={projectContext.clientEmail || ''} 
                                onChange={e => {
                                    const emailVal = e.target.value;
                                    setProjectContext?.((prev: any) => ({ ...prev, clientEmail: emailVal }));
                                }} 
                                className="flex-grow text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#3D52A0] focus:ring-1 focus:ring-[#3D52A0] shadow-sm" 
                                placeholder="Enter client's email address (e.g. client@example.com)" 
                            />
                            {projectContext.clientEmail && projectContext.clientEmail.includes('@') ? (
                                <span className="bg-emerald-100 border border-emerald-200 text-emerald-800 text-[10px] font-bold tracking-tight rounded-md px-3 py-2 flex items-center justify-center gap-1">
                                    <svg className="w-3.5 h-3.5 text-emerald-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                    Configured
                                </span>
                            ) : (
                                <span className="bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold tracking-tight rounded-md px-3 py-2 flex items-center justify-center gap-1">
                                    &#9888; Email Missing
                                </span>
                            )}
                        </div>
                        {!projectContext.clientEmail && (
                            <p className="text-[10px] text-red-600 font-semibold mt-2">
                                * An email address is required to dispatch the execution link. Please enter it above.
                            </p>
                        )}
                    </div>
                    {localError && (
                        <div className="text-red-600 text-xs mb-4 p-3.5 bg-red-50 rounded-lg border border-red-200/60 leading-relaxed">
                            <div className="font-bold mb-1">Email Transfer Interrupted:</div>
                            <p className="text-slate-600 text-[11px] mb-2">
                                {localError}
                            </p>
                            <div className="pt-2.5 border-t border-red-200/50 flex flex-col sm:flex-row sm:items-center gap-2">
                                <span className="font-bold text-red-800 text-[10px] uppercase tracking-wider block">Sandbox Controls:</span>
                                <button 
                                    onClick={async () => {
                                        setLocalError(null);
                                        setIsSending(true);
                                        try {
                                            const randomPart = Math.random().toString(36).substring(2, 15);
                                            const token = `EXEC_AGREEMENT_${projectId}_${randomPart}`;
                                            const newSignoff = {
                                                status: 'sent',
                                                token: token,
                                                sentAt: new Date().toISOString()
                                            };
                                            setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: newSignoff }));
                                        } catch (e: any) {
                                            setLocalError(e.message);
                                        } finally {
                                            setIsSending(false);
                                        }
                                    }}
                                    className="px-3 py-1.5 bg-[#3D52A0] hover:bg-[#334486] text-white font-bold rounded-md text-[10px] shadow-sm uppercase tracking-wider cursor-pointer inline-block text-center"
                                >
                                    Force Generate Digital Sign-Off Link (Sandbox Bypass)
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Admin Control - Hidden in Print */}
                <div className="no-print shrink-0 flex flex-col gap-2 min-w-[200px]">
                    {!showSendConfirm ? (
                        <button 
                            onClick={() => setShowSendConfirm(true)}
                            disabled={isSending}
                            className="flex justify-center items-center gap-2 px-4 py-2.5 bg-[#3D52A0] text-white text-xs font-bold rounded-xl shadow-xs hover:bg-[#334486] transition-all w-full cursor-pointer disabled:opacity-50"
                        >
                            <ShieldCheckIcon className="w-4 h-4" /> {isSending ? 'Dispatching...' : 'Send to Client'}
                        </button>
                    ) : (
                        <div className="p-3.5 border border-sky-200 bg-sky-50 rounded-xl flex flex-col gap-2 shadow-xs">
                            <p className="text-xs font-bold text-slate-800">Send Agreement via Email?</p>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={sendEmailSignoff} 
                                    disabled={isSending} 
                                    className="px-3 py-1.5 bg-[#3D52A0] hover:bg-[#334486] disabled:opacity-60 text-white font-bold rounded-lg text-xs flex-1 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                                >
                                    {isSending ? (
                                        <>
                                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                            <span>Sending...</span>
                                        </>
                                    ) : (
                                        'Confirm'
                                    )}
                                </button>
                                <button 
                                    onClick={() => setShowSendConfirm(false)} 
                                    disabled={isSending} 
                                    className="px-3 py-1.5 bg-white border border-sky-200 text-[#334486] font-bold rounded-lg text-xs flex-1 hover:bg-sky-100 transition cursor-pointer disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                    
                    <button 
                        onClick={() => setShowMarkManual(true)}
                        className="flex justify-center items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-[10px] uppercase tracking-widest font-bold rounded-lg hover:bg-slate-50 transition-all w-full cursor-pointer"
                    >
                        Ops Override: Record Acceptance
                    </button>
                </div>
            </div>

            {showMarkManual && (
                <ManualAcceptanceOverrideModal
                    documentTitle="Integrated Interior Execution Agreement"
                    projectName={projectContext.name}
                    defaultClientName={projectContext.clientName}
                    defaultClientEmail={projectContext.clientEmail}
                    onConfirmOverride={handleConfirmManualOverride}
                    onClose={() => setShowMarkManual(false)}
                />
            )}
            
            {/* Print Fallback Visual Lines */}
            <div className="mt-8 pt-6 border-t border-slate-200/60 grid grid-cols-2 gap-12 opacity-40 grayscale print:opacity-60">
                <div>
                    <div className="h-8 border-b border-slate-300 mb-1"></div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">Client Authorization</p>
                </div>
                <div>
                    <div className="h-8 border-b border-slate-300 mb-1"></div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">Studio Representative</p>
                </div>
            </div>
        </div>
    );
}
