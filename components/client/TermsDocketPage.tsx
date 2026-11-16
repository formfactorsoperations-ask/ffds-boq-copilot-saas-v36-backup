import React, { useState } from 'react';
import { getCurrentIssue } from '../../services/documentIssueEngine';
import ExecutionStamp from '../documents/ExecutionStamp';
import { buildSignoffPatch } from '../../services/clientApprovalEngine';
import { ProjectContext, TermsDocket, TermsSettings, DigitalSignatureDocket } from '../../types';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import { studioDisplayName } from '../../lib/studioName';
import { FileText, Send, CheckCircle2, Download, AlertTriangle, Eye, Check, Edit3, Plus, Trash2, Save, X, Columns, ShieldCheck } from '@/lib/lucide-shim';
import { id as generateId } from '../../lib/utils';
import { useOrg } from '../../contexts/OrgContext';
import { StudioDocumentShell } from '../ops/documents/StudioDocumentShell';
import { prepareClonedDocForPdf } from '../../lib/pdfUtils';
import DigitalSignatureDocketView from '../common/DigitalSignatureDocket';
import ManualAcceptanceOverrideModal from '../ops/ManualAcceptanceOverrideModal';
import { publicAppOrigin } from '../../lib/publicUrl';
import { resolveTokens } from '../documents/DocumentBlocks';
import { Button, Chip, Segmented, StateDot, IconChip, buttonClass } from '../ui/kit';
import { Clock, ListChecks, BookOpen, History, Link2 } from '@/lib/lucide-shim';

interface TermsDocketPageProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    tenantId?: string;
    projectId?: string;
}

export default function TermsDocketPage({ projectContext, setProjectContext, tenantId, projectId: propProjectId }: TermsDocketPageProps) {
    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const focus = params.get('focus');
        if (focus) {
            setTimeout(() => {
                const el = document.getElementById(focus);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('ring-2', 'ring-[#3D52A0]', 'ring-offset-2');
                    setTimeout(() => el.classList.remove('ring-2', 'ring-[#3D52A0]', 'ring-offset-2'), 3000);
                }
            }, 500);
        }
    }, []);

    const { settings } = useStudioSettings(tenantId || '');
    const { orgData } = useOrg();
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [showSendConfirm, setShowSendConfirm] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [showOverrideModal, setShowOverrideModal] = useState(false);
    
    const [selectedDocketId, setSelectedDocketId] = useState<string | null>(null);
    const [isAmending, setIsAmending] = useState(false);
    const [editedTermsConfig, setEditedTermsConfig] = useState<TermsSettings | null>(null);
    const [activeSectionIdx, setActiveSectionIdx] = useState<number | null>(null);
    const [editLayoutMode, setEditLayoutMode] = useState<'editor' | 'split' | 'preview'>('editor');
    const [activeSubTab, setActiveSubTab] = useState<'view' | 'edit'>('view');
    /* Summary first (owner, 16 Nov 2026); a link that names a part of the document opens the document. */
    const [viewMode, setViewMode] = useState<'summary' | 'doc'>(() => {
        try { return new URLSearchParams(window.location.search).get('focus') ? 'doc' : 'summary'; } catch { return 'summary'; }
    });

    const deepCopyTerms = (config: TermsSettings): TermsSettings => {
        return JSON.parse(JSON.stringify(config));
    };

    const startAmending = () => {
        if (!latestDocket?.snapshotTermsConfig) return;
        setEditedTermsConfig(deepCopyTerms(latestDocket.snapshotTermsConfig));
        setIsAmending(true);
        setActiveSectionIdx(0); // Open first section by default
        setActiveSubTab('edit');
    };

    const updateBlockText = (secIdx: number, blockIdx: number, newText: string) => {
        if (!editedTermsConfig) return;
        const copy = deepCopyTerms(editedTermsConfig);
        if (copy.sections[secIdx]?.blocks[blockIdx]) {
            copy.sections[secIdx].blocks[blockIdx].text = newText;
            setEditedTermsConfig(copy);
        }
    };

    const updateBlockLabel = (secIdx: number, blockIdx: number, newLabel: string) => {
        if (!editedTermsConfig) return;
        const copy = deepCopyTerms(editedTermsConfig);
        if (copy.sections[secIdx]?.blocks[blockIdx]) {
            copy.sections[secIdx].blocks[blockIdx].label = newLabel;
            setEditedTermsConfig(copy);
        }
    };

    const updateSectionTitle = (secIdx: number, newTitle: string) => {
        if (!editedTermsConfig) return;
        const copy = deepCopyTerms(editedTermsConfig);
        if (copy.sections[secIdx]) {
            copy.sections[secIdx].title = newTitle;
            setEditedTermsConfig(copy);
        }
    };

    const deleteBlock = (secIdx: number, blockIdx: number) => {
        if (!editedTermsConfig) return;
        const copy = deepCopyTerms(editedTermsConfig);
        if (copy.sections[secIdx]) {
            copy.sections[secIdx].blocks.splice(blockIdx, 1);
            setEditedTermsConfig(copy);
        }
    };

    const addBlock = (secIdx: number) => {
        if (!editedTermsConfig) return;
        const copy = deepCopyTerms(editedTermsConfig);
        if (copy.sections[secIdx]) {
            const nextNum = copy.sections[secIdx].blocks.length + 1;
            const ref = `${copy.sections[secIdx].n}.${nextNum}`;
            copy.sections[secIdx].blocks.push({
                type: 'clause',
                ref: ref,
                text: ''
            });
            setEditedTermsConfig(copy);
        }
    };

    const addCustomSection = () => {
        if (!editedTermsConfig) return;
        const copy = deepCopyTerms(editedTermsConfig);
        const nextN = (copy.sections?.length || 0) + 1;
        if (!copy.sections) copy.sections = [];
        copy.sections.push({
            n: nextN,
            title: nextN > 14 ? `Amendment Addendum ${nextN - 14}` : `Custom Section ${nextN}`,
            blocks: [
                {
                    type: 'clause',
                    ref: `${nextN}.1`,
                    text: ''
                }
            ]
        });
        setEditedTermsConfig(copy);
        setActiveSectionIdx(copy.sections.length - 1); // Expand the newly added section
    };

    const saveAmendments = () => {
        if (!editedTermsConfig || !latestDocket) return;
        
        const updatedDocket: TermsDocket = {
            ...latestDocket,
            snapshotTermsConfig: editedTermsConfig
        };
        
        setProjectContext(prev => ({
            ...prev,
            termsDockets: prev.termsDockets?.map(d => d.id === latestDocket.id ? updatedDocket : d)
        }));
        
        setIsAmending(false);
        setActiveSubTab('view');
    };

    const handleUpdateIssuedDate = (newDate: string) => {
        if (!latestDocket) return;
        const updatedDocket = {
            ...latestDocket,
            snapshotClientData: {
                ...latestDocket.snapshotClientData,
                date: newDate
            }
        };
        setProjectContext(prev => ({
            ...prev,
            termsDockets: prev.termsDockets?.map(d => d.id === latestDocket.id ? updatedDocket : d)
        }));
    };

    const currentSignoff = projectContext.designAgreementSignoff;
    const signoffStatus = currentSignoff?.status || 'pending';
    const getSignoffUrl = (token: string) => {
        let appDomain = publicAppOrigin();
        if (appDomain.includes('ais-dev-')) {
            appDomain = appDomain.replace('ais-dev-', 'ais-pre-');
        }
        return `${appDomain}/?agreementSignoff=${token}`;
    };
    const [previewMode, setPreviewMode] = useState(true);

    const engagement = projectContext.engagement;
    /* The signature lives on the issue, not on the engagement object. */
    const termsIssue = getCurrentIssue(projectContext, 'terms_docket');
    const isLocked = !!termsIssue?.clientSignature
      || engagement?.status === 'issued' || engagement?.status === 'acknowledged';
    const lockedSnapshot = engagement?.lockedSnapshot;

    // We still use dockets array for backward compatibility, but prefer locked snapshot if available
    const dockets = projectContext.termsDockets || [];
    let latestDocket = dockets.find(d => d.id === selectedDocketId) || dockets[dockets.length - 1];

    if (latestDocket && engagement) {
        latestDocket = { ...latestDocket, status: engagement.status };
    }

    if (!selectedDocketId && isLocked && lockedSnapshot?.termsSettings) {
        latestDocket = {
            id: 'locked',
            docketRef: engagement.docketRef || '____',
            status: engagement.status,
            generatedAt: engagement.issuedAt || Date.now(),
            sentAt: engagement.issuedAt || Date.now(),
            sentBy: 'System',
            acknowledgedAt: engagement.acknowledgedAt,
            snapshotTermsConfig: lockedSnapshot.termsSettings,
            snapshotClientData: {
                clientName: projectContext.clientName || 'Valued Client',
                projectName: projectContext.name,
                date: new Date(engagement.issuedAt || Date.now()).toLocaleDateString('en-IN')
            }
        };
    }

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const orgId = tenantId || orgData?.tenantId || 'demo-tenant-01';
            const { getTermsSettings, seedEngagementDefaults, FFDS_TERMS_DEFAULTS, GENERIC_TERMS_DEFAULTS } = await import('../../services/engagementService');
            let termsSettings = await getTermsSettings(orgId);
            
            if (!termsSettings) {
                try {
                    await seedEngagementDefaults(orgId);
                    termsSettings = await getTermsSettings(orgId);
                } catch (seedErr) {
                    console.error("Failed to seed default terms:", seedErr);
                }
            }
            
            if (!termsSettings) {
                termsSettings = orgId === 'demo-tenant-01' ? FFDS_TERMS_DEFAULTS : GENERIC_TERMS_DEFAULTS;
            }

            const year = new Date().getFullYear();
            const nnn = String(Math.floor(Math.random() * 900) + 100);
            
            let configToUse = { ...termsSettings };
            if (!configToUse.sections || configToUse.sections.length === 0) {
                const defaults = orgId === 'demo-tenant-01' ? FFDS_TERMS_DEFAULTS : GENERIC_TERMS_DEFAULTS;
                configToUse.sections = defaults.sections;
            }
            
            const newDocket: TermsDocket = {
                id: generateId(),
                docketRef: `${termsSettings.docketRefPrefix || 'DOC'}-TD-${year}-${nnn}`,
                status: 'draft',
                generatedAt: Date.now(),
                sentAt: null,
                sentBy: 'System',
                acknowledgedAt: null,
                snapshotTermsConfig: configToUse,
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
            
            setSelectedDocketId(newDocket.id!);
        } catch (err) {
            console.error(err);
            alert("Failed to generate docket.");
        } finally {
            setIsGenerating(false);
        }
    };

    React.useEffect(() => {
        const dockets = projectContext.termsDockets || [];
        if (dockets.length === 0 && !isGenerating) {
            handleGenerate();
        }
    }, [projectContext.termsDockets]);

    const handleGenerateAmendment = () => {
        setIsGenerating(true);
        try {
            const year = new Date().getFullYear();
            const nnn = String(Math.floor(Math.random() * 900) + 100);
            const prefix = latestDocket?.snapshotTermsConfig?.docketRefPrefix || "FFDS-TD";
            
            const baseTermsConfig = latestDocket 
                ? deepCopyTerms(latestDocket.snapshotTermsConfig)
                : null;
            
            if (!baseTermsConfig) {
                handleGenerate();
                return;
            }

            const newDocket: TermsDocket = {
                id: generateId(),
                docketRef: `${prefix}-AMD-${year}-${nnn}`,
                status: 'draft',
                generatedAt: Date.now(),
                sentAt: null,
                sentBy: 'System',
                acknowledgedAt: null,
                snapshotTermsConfig: baseTermsConfig,
                snapshotClientData: {
                    clientName: projectContext.clientName || 'Valued Client',
                    projectName: projectContext.name,
                    date: new Date().toLocaleDateString('en-IN')
                }
            };
            
            setProjectContext(prev => {
                const existingDockets = prev.termsDockets || [];
                return {
                    ...prev,
                    termsDockets: [...existingDockets, newDocket]
                };
            });
            
            setSelectedDocketId(newDocket.id!);
            setIsAmending(true); // Automatically enter amendment workspace
            setActiveSectionIdx(baseTermsConfig.sections?.length ? baseTermsConfig.sections.length - 1 : 0);
            setActiveSubTab('edit');
        } catch (err) {
            console.error(err);
            alert("Failed to generate amendment.");
        } finally {
            setIsGenerating(false);
        }
    };

    const resolvedProjectId = propProjectId || (projectContext as any).projectId || (projectContext as any).id || (projectContext.name ? projectContext.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Project');

    const handleSend = () => {
        if (!latestDocket) return;
        const updated = { ...latestDocket, status: 'sent' as const, sentAt: Date.now() };
        const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
        const token = `TERMS_AGREEMENT_${resolvedProjectId}_${randomPart}`;
        const signoffObj = {
            status: 'sent',
            token: token,
            sentAt: new Date().toISOString()
        };
        setProjectContext(prev => ({
            ...prev,
            termsDockets: prev.termsDockets?.map(d => d.id === latestDocket.id ? updated : d),
            termsSignoff: signoffObj,
            designAgreementSignoff: signoffObj
        }));
    };

    const handleAcknowledge = () => {
        if (!latestDocket) return;
        const now = Date.now();
        const updated = { ...latestDocket, status: 'acknowledged' as const, acknowledgedAt: now };
        // Keep the docket array, the engagement record and the lifecycle gate in
        // step. These are read by three different surfaces (client portal,
        // payment calculator, journey engine) and must never disagree.
        setProjectContext(prev => ({
            ...prev,
            termsDockets: prev.termsDockets?.map(d => d.id === latestDocket.id ? updated : d),
            engagement: prev.engagement
                ? { ...prev.engagement, status: 'acknowledged' as const, acknowledgedAt: now }
                : prev.engagement,
            lifecycle: {
                ...(prev.lifecycle || {} as any),
                gates: {
                    ...((prev.lifecycle?.gates || {}) as any),
                    proposalAccepted: { done: true, at: now, reference: latestDocket.docketRef || null }
                }
            } as any
        }));
    };

    const missingData = [];
    if (!orgData.orgName) missingData.push("Studio Name");
    if (!projectContext.clientName) missingData.push("Client Name");
    if (!projectContext.name) missingData.push("Project Name");
    
    const isValid = missingData.length === 0;

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    const sendEmailSignoff = async () => {
        setIsSending(true);
        try {
            handleSend();
            setShowSendConfirm(false);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSending(false);
        }
    };

    const handleDownloadPdf = () => {
        if (!latestDocket || !isValid) return;
        const element = document.getElementById('terms-docket-pdf-render');
        if (element) {
            element.classList.add('html2pdf-active');
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
                     element.classList.remove('html2pdf-active');
                     return;
                }
                const opt = {
                    margin: [15, 0, 15, 0],
                    filename: `${orgData.orgName || 'FFDS'}-Terms-${latestDocket.docketRef}.pdf`,
                    image: { type: 'jpeg' as const, quality: 1 },
                    html2canvas: { 
                        scale: 2, 
                        useCORS: true, 
                        letterRendering: true,
                        logging: false,
                        onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc)
                    },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
                    pagebreak: { mode: ['css', 'legacy'], avoid: ['.sec-group', '.cl', '.highlight', '.principle', '.sig', '.metabar', 'tr'] }
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
                            pdf.text(`Terms of Engagement • ${projectContext.name}`, 15, 10);
                            pdf.text(`${orgData.orgName || 'Form Factors Design Studio'}`, pageWidth - 15, 10, { align: 'right' });
                        }
                    }
                }).save().then(() => {
                    element.classList.remove('html2pdf-active');
                }).catch((err: any) => {
                    element.classList.remove('html2pdf-active');
                    console.error("PDF generation failed", err);
                });
            }).catch(err => {
                element.classList.remove('html2pdf-active');
                console.error("Failed to load html2pdf", err);
            });
        }
    };

    if (!latestDocket) {
        return (
            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in">
                <div id="terms-docket-root" className="glass-light border text-center border-slate-200 p-16 rounded-3xl shadow-sm">
                    <FileText className="w-16 h-16 text-slate-300 mx-auto mb-6" />
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Terms of Engagement Docket</h2>
                    <p className="text-slate-500 mt-2 max-w-lg mx-auto">
                        Generate the foundational framework docket. This sets the rules of engagement (warranties, snags, revisions) before any work begins. It relies on the Advance Payment Schedule for specific amounts.
                    </p>
                    <button onClick={handleGenerate} disabled={isGenerating} className="mt-8 px-6 py-3 bg-[#3D52A0] text-white font-bold rounded-xl shadow-sm hover:bg-[#334486] transition flex items-center justify-center mx-auto gap-2">
                        {isGenerating ? 'Generating...' : 'Generate Docket'}
                    </button>
                </div>
            </div>
        );
    }

    const { snapshotTermsConfig, snapshotClientData } = latestDocket;
    const activeTermsConfig = (isAmending && editedTermsConfig) ? editedTermsConfig : snapshotTermsConfig;

    const renderBlock = (block: any, idx: number) => {
        /* The same resolver as the client's copy (components/documents/DocumentBlocks), so
           the studio's view and its PDF can never read differently from the portal. */
        const processed = resolveTokens(block.text || '', activeTermsConfig, orgData.orgName || '');

        if (block.type === 'clause') {
            return (
                <div key={idx} className="cl">
                    {block.ref && <div className="num">{block.ref}</div>}
                    <div className="body">{processed}</div>
                </div>
            );
        }

        if (block.type === 'callout') {
            const isHighlight = block.style === 'highlight';
            return (
                <div key={idx} className={`${isHighlight ? 'highlight' : 'principle'} highlight-box ${isHighlight ? 'bg-amber-50 border-amber-500' : 'bg-slate-50 border-[#3D52A0]'} border-l-4 py-3 pl-4 rounded-r-md my-4 shadow-sm`} style={{ pageBreakInside: 'avoid' }}>
                    {block.label && <h3 className={`font-bold ${isHighlight ? 'text-amber-900' : 'text-slate-800'} text-[11px] tracking-wider mb-2 m-0 uppercase lab`}>{block.label}</h3>}
                    {processed.split('\n\n').map((p: string, pIdx: number) => (
                        <p key={pIdx} className={`m-0 ${pIdx === 0 && !isHighlight ? 'font-semibold text-slate-800' : 'text-slate-600 mt-2'}`}>{p}</p>
                    ))}
                </div>
            );
        }

        if (block.type === 'table') {
            let data: [string, string][] = [];
            let columns: string[] = [];
            if (block.source === 'snagCategories' && activeTermsConfig?.snagCategories) {
                columns = ['Category', 'Resolution Timeframe'];
                data = activeTermsConfig.snagCategories.map(c => ([`Category ${c.label}`, `${c.resolveDays} working days`]));
            } else if (block.source === 'warrantyPeriods' && activeTermsConfig?.warrantyPeriods) {
                columns = ['Trade / Component', 'Warranty Period'];
                data = activeTermsConfig.warrantyPeriods.map(w => {
                    const duration = w.months >= 12 && w.months % 12 === 0 ? `${w.months / 12} Year${w.months / 12 > 1 ? 's' : ''}` : `${w.months} Months`;
                    return [w.trade, duration];
                });
            }

            if (data.length === 0) return null;

            return (
                <div key={idx} className="my-4">
                    {block.intro && <p className="mb-2 font-semibold">{block.intro}</p>}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="mini w-full text-left border-collapse">
                            <thead className="bg-slate-50">
                                <tr>
                                    {columns.map((col, i) => (
                                        <th key={i} className="py-2 px-3 border-b border-slate-200 font-bold text-slate-700 text-[10px] uppercase">{col}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row, i) => (
                                    <tr key={i} className="border-b border-slate-100 last:border-b-0">
                                        <td className="py-2 px-3 text-slate-800 font-semibold text-[10px]">{row[0]}</td>
                                        <td className="py-2 px-3 text-slate-600 text-[10px]">{row[1]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {block.note && <p className="text-[10px] text-slate-500 italic mt-1">{block.note}</p>}
                </div>
            );
        }
        return null;
    };

    /* ── Summary-first layout (owner's mock-up, 16 Nov 2026) ─────────────────
       Everything below is how the screen is laid out. The docket's records, the
       sign-off, the PDF block and every handler above are unchanged, so what
       reaches the client's portal is exactly what it was. */
    const cfg = activeTermsConfig;
    const secWith = (pred: (b: any) => boolean) => cfg?.sections?.find((sec: any) => sec.blocks?.some(pred))?.n;
    const secWithToken = (token: string) => secWith((b: any) => String(b.text || '').includes(`{{${token}}}`));
    /* The section named for the topic wins over one that merely mentions its number. */
    const secTitled = (re: RegExp) => cfg?.sections?.find((sec: any) => re.test(sec.title || ''))?.n;
    const months = (m: number) => (m >= 12 && m % 12 === 0 ? `${m / 12} year${m / 12 > 1 ? 's' : ''}` : `${m} months`);
    const keyTerms = [
        cfg?.paymentOverdueGraceDays ? { topic: 'Late payment', ref: secTitled(/payment/i) ?? secWithToken('paymentOverdueGraceDays'),
            text: `Work may pause if an advance is unpaid ${cfg.paymentOverdueGraceDays} days after it falls due${cfg.resumeAfterPaymentDays ? `; it resumes within ${cfg.resumeAfterPaymentDays} working days of payment` : ''}.` } : null,
        cfg?.changeRequestResponseDays ? { topic: 'Changes', ref: secTitled(/change/i) ?? secWithToken('changeRequestResponseDays'),
            text: `A written change request; the studio states the cost and time within ${cfg.changeRequestResponseDays} working days.` } : null,
        cfg?.includedRevisionRounds ? { topic: 'Revisions', ref: secWithToken('includedRevisionRounds'),
            text: `${cfg.includedRevisionRounds} design revision rounds included.` } : null,
        cfg?.warrantyPeriods?.length ? { topic: 'Warranty', ref: secWith((b: any) => b.source === 'warrantyPeriods'),
            text: cfg.warrantyPeriods.map((w: any) => `${w.trade} ${months(w.months)}`).join(' · ') } : null,
        cfg?.snagCategories?.length ? { topic: 'Snags', ref: secWith((b: any) => b.source === 'snagCategories'),
            text: cfg.snagCategories.map((c: any) => `${c.label} within ${c.resolveDays} working days`).join(' · ') } : null,
        cfg?.disputeMediationDays ? { topic: 'Disputes', ref: secTitled(/dispute/i) ?? secWithToken('disputeMediationDays'),
            text: `Mediation for ${cfg.disputeMediationDays} days, then ${cfg.disputeJurisdiction ? `the courts in ${cfg.disputeJurisdiction}` : 'the courts'}.` } : null,
        cfg?.gstRate ? { topic: 'GST', ref: secWithToken('gstRate'), text: `${cfg.gstRate}% on every amount.` } : null,
        cfg?.paymentMethods?.length ? { topic: 'Payment', ref: secWithToken('paymentMethods'), text: cfg.paymentMethods.join(' / ') } : null,
    ].filter(Boolean) as Array<{ topic: string; ref?: number; text: string }>;

    const isSigned = signoffStatus === 'signed' || latestDocket.status === 'acknowledged' || latestDocket.status === 'issued';
    const statusChip = latestDocket.status === 'draft'
        ? <Chip tone="slate">Draft</Chip>
        : latestDocket.status === 'sent'
            ? <Chip tone="warn">Sent · awaiting signature</Chip>
            : <Chip tone="good">{latestDocket.docketRef?.includes('-AMD-') ? 'Executed amendment' : 'Active terms'}</Chip>;
    const when = (t?: number | null) => (t ? new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
    const steps = [
        { label: 'Generated', sub: when(latestDocket.generatedAt), done: true },
        { label: 'Sent to client', sub: latestDocket.sentAt ? when(latestDocket.sentAt) : 'Not yet', done: !!latestDocket.sentAt || latestDocket.status !== 'draft' },
        { label: 'Signed', sub: latestDocket.acknowledgedAt ? when(latestDocket.acknowledgedAt) : signoffStatus === 'signed' ? 'Signed in the portal' : 'Not yet', done: isSigned },
    ];

    const openSection = (n?: number) => {
        setActiveSubTab('view');
        setIsAmending(false);
        setViewMode('doc');
        if (n != null) window.setTimeout(() => document.getElementById(`terms-sec-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    };
    const pickView = (v: 'summary' | 'doc' | 'clauses') => {
        if (v === 'clauses') {
            if (latestDocket.status !== 'draft') {
                alert("This document has been sent/executed and cannot be edited. Please create an amendment/addendum.");
                return;
            }
            setActiveSubTab('edit');
            if (!isAmending) startAmending();
            return;
        }
        setActiveSubTab('view');
        setIsAmending(false);
        setViewMode(v);
    };
    /* The PDF is captured from the document on screen, so show it first when the summary is open. */
    const downloadPdf = () => {
        if (document.getElementById('terms-docket-pdf-render')) { handleDownloadPdf(); return; }
        setViewMode('doc');
        if (isAmending && editLayoutMode === 'editor') setEditLayoutMode('split');
        window.setTimeout(() => handleDownloadPdf(), 300);
    };
    const showDocument = activeSubTab === 'edit' || viewMode === 'doc';
    /* After saving clause changes, show the document so the change can be read in place. */
    const saveAndShow = () => { saveAmendments(); setViewMode('doc'); };

    return (
        <div className="w-full space-y-4 pb-20">
            {/* One row: the view, where the docket stands, and what can be done with it. */}
            <div className="flex flex-wrap items-center gap-2 no-print">
                <Segmented
                    label="Terms Docket view"
                    size="sm"
                    value={activeSubTab === 'edit' ? 'clauses' : viewMode}
                    options={[
                        { id: 'summary', label: 'Summary' },
                        { id: 'doc', label: 'Document' },
                        { id: 'clauses', label: 'Clauses & settings' },
                    ]}
                    onChange={pickView}
                />
                {statusChip}
                <span className="text-xs text-slate-500 tabular-nums">{latestDocket.docketRef}</span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {latestDocket.status === 'draft' && !isLocked && (
                        <Button variant="quiet" size="sm" icon={FileText} onClick={handleGenerate} disabled={isGenerating} title="Start this docket again from the studio's current terms">Regenerate</Button>
                    )}
                    <Button size="sm" icon={Download} onClick={downloadPdf} disabled={!isValid}>Download PDF</Button>
                    {latestDocket.status === 'draft' && (
                        isAmending
                            ? <Button size="sm" icon={Save} onClick={saveAndShow}>Save changes</Button>
                            : <Button size="sm" icon={Edit3} onClick={startAmending}>Amend terms</Button>
                    )}
                    {latestDocket.status === 'sent' && !isLocked && (
                        <Button size="sm" icon={Check} onClick={handleAcknowledge}>Mark as acknowledged</Button>
                    )}
                    {latestDocket.status !== 'draft' && (
                        <Button size="sm" icon={Plus} onClick={handleGenerateAmendment} disabled={isGenerating}>Create amendment</Button>
                    )}
                    {latestDocket.status === 'draft' && (
                        !showSendConfirm
                            ? <Button variant="primary" size="sm" icon={Send} onClick={() => setShowSendConfirm(true)} disabled={isSending}>{isSending ? 'Sending…' : 'Send to client'}</Button>
                            : <>
                                <Button variant="primary" size="sm" onClick={sendEmailSignoff}>Confirm send</Button>
                                <Button variant="quiet" size="sm" onClick={() => setShowSendConfirm(false)}>Cancel</Button>
                              </>
                    )}
                </div>
            </div>

            {/* Status Banner */}
            {signoffStatus === 'sent' && currentSignoff?.token && (
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hud-panel-in no-print">
                    <div className="flex flex-wrap items-start gap-3">
                        <IconChip icon={Link2} />
                        <div className="min-w-0 flex-1">
                            <h2 className="font-bold text-slate-800 flex flex-wrap items-center gap-2">Waiting for the client's sign-off <Chip tone="warn">Sent</Chip></h2>
                            <p className="text-xs text-slate-500 mt-0.5">The docket is with the client for their digital signature. Share this link if they ask for it.</p>
                            <p className="mt-3 text-xs text-slate-600 break-all bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{getSignoffUrl(currentSignoff.token!)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => handleCopy(getSignoffUrl(currentSignoff.token!))}>{copied ? 'Copied' : 'Copy link'}</Button>
                            <a href={getSignoffUrl(currentSignoff.token!)} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>Open sign-off screen</a>
                            <Button size="sm" onClick={() => setShowOverrideModal(true)} title="Record a signature given by WhatsApp, email or in person">Record acceptance</Button>
                        </div>
                    </div>
                </section>
            )}
            
            {signoffStatus === 'signed' && (
                <div className="mb-6 no-print">
                    <DigitalSignatureDocketView
                        docket={currentSignoff?.docket || {
                            signatoryName: currentSignoff?.clientName || projectContext.clientName || 'Client Signatory',
                            signatoryEmail: projectContext.clientEmail,
                            signedAt: currentSignoff?.signedAt || new Date().toISOString(),
                            signatureType: currentSignoff?.signatureType || 'draw',
                            signatureDataUrl: currentSignoff?.signatureDataUrl,
                            ipAddress: currentSignoff?.ipAddress || 'Client Portal Web',
                            docketHash: currentSignoff?.refId?.startsWith('SHA256') ? currentSignoff.refId : `SHA256:${currentSignoff?.refId || 'TERMS_SEALED'}`,
                            verified: true,
                            legalAffirmation: true,
                            manualOverride: currentSignoff?.manualOverride
                        }}
                        documentTitle="Terms & Conditions Governance Docket"
                        projectName={projectContext.name}
                        studioName={studioDisplayName(settings, orgData)}
                        canReset={true}
                        onReset={() => {
                            setProjectContext(prev => ({
                                ...prev,
                                designAgreementSignoff: { status: 'pending' }
                            }));
                        }}
                    />
                </div>
            )}

            {showOverrideModal && (
                <ManualAcceptanceOverrideModal
                    documentTitle="Terms & Conditions Governance Docket"
                    projectName={projectContext.name}
                    defaultClientName={projectContext.clientName}
                    defaultClientEmail={projectContext.clientEmail}
                    onConfirmOverride={(docket: DigitalSignatureDocket) => {
                        // Through the canonical writer, so the override reaches every
                        // field family, engagement.status and the client portal —
                        // writing designAgreementSignoff alone left the client's view
                        // and the payment calculator out of step.
                        setProjectContext(buildSignoffPatch('terms', docket, {
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
                <div className="p-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-sm">
                    {localError}
                </div>
            )}

            {activeSubTab === 'view' && viewMode === 'summary' && (
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)] gap-4 items-start no-print">
                    <div className="space-y-4 min-w-0">
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in">
                            <div className="flex items-start gap-3">
                                <IconChip icon={Clock} />
                                <div className="min-w-0">
                                    <h2 className="font-bold text-slate-800 flex flex-wrap items-center gap-2">Where it stands {statusChip}</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {latestDocket.status === 'draft'
                                            ? 'Not sent yet. The client signs this before any design work, proposal or Discovery Workshop starts.'
                                            : isSigned ? 'Signed: these are the terms the project runs on.' : 'With the client for their signature.'}
                                    </p>
                                </div>
                            </div>
                            <ol className="mt-5 grid grid-cols-3 gap-3">
                                {steps.map((st, i) => (
                                    <li key={st.label} className="hud-row-in min-w-0" style={{ animationDelay: `${i * 30}ms` }}>
                                        <span className={`block h-1 rounded-full ${st.done ? 'bg-[#3D52A0]' : 'bg-slate-200'}`} />
                                        <b className="block mt-2 text-sm font-semibold text-slate-800">{st.label}</b>
                                        <span className="block text-[11px] text-slate-500">{st.sub}</span>
                                    </li>
                                ))}
                            </ol>
                        </section>

                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in" style={{ animationDelay: '30ms' }}>
                            <div className="flex items-start gap-3">
                                <IconChip icon={ListChecks} />
                                <div className="min-w-0">
                                    <h2 className="font-bold text-slate-800">The terms clients ask about</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">From this docket's settings. Open one to read its section.</p>
                                </div>
                            </div>
                            {keyTerms.length === 0 ? (
                                <p className="mt-4 text-xs text-slate-500">This docket has no settings to summarise; read the document.</p>
                            ) : (
                                <div className="mt-4 divide-y divide-slate-100">
                                    {keyTerms.map((t) => (
                                        <button key={t.topic} type="button" onClick={() => openSection(t.ref)}
                                            className="w-full grid grid-cols-[120px_minmax(0,1fr)_auto] gap-3 items-baseline py-2.5 text-left hover:bg-slate-50 rounded-lg px-1">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t.topic}</span>
                                            <span className="text-sm text-slate-700">{t.text}</span>
                                            <span className="text-xs font-bold text-[#3D52A0]">{t.ref != null ? `§ ${t.ref}` : ''}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>

                    <div className="space-y-4 min-w-0">
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in" style={{ animationDelay: '60ms' }}>
                            <div className="flex items-start gap-3">
                                <IconChip icon={BookOpen} />
                                <div className="min-w-0">
                                    <h2 className="font-bold text-slate-800">The document</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {latestDocket.docketRef?.includes('-AMD-') ? 'Amendment to the terms of engagement' : 'Terms of engagement'} · {cfg?.sections?.length || 0} sections
                                    </p>
                                </div>
                            </div>
                            <ol className="mt-3">
                                {(cfg?.sections || []).map((sec: any) => (
                                    <li key={sec.n}>
                                        <button type="button" onClick={() => openSection(sec.n)} className="w-full flex gap-2 px-1 py-1.5 rounded-lg text-left text-sm text-slate-700 hover:bg-slate-50">
                                            <span className="w-6 shrink-0 text-slate-400 tabular-nums">{sec.n}</span>
                                            <span className="min-w-0">{resolveTokens(sec.title || '', cfg, orgData.orgName || '')}</span>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                            <Button size="sm" className="mt-3" icon={BookOpen} onClick={() => openSection()}>Read the document</Button>
                        </section>

                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in" style={{ animationDelay: '90ms' }}>
                            <div className="flex items-start gap-3">
                                <IconChip icon={History} />
                                <div className="min-w-0">
                                    <h2 className="font-bold text-slate-800">Versions</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">Every docket and amendment, oldest first.</p>
                                </div>
                            </div>
                            <div className="mt-4 space-y-2">
                                {dockets.map((doc, dIdx) => {
                                    const isSelected = doc.id === latestDocket?.id;
                                    const isAmendment = doc.docketRef?.includes('-AMD-');
                                    const tone = doc.status === 'sent' ? 'warn' : (doc.status === 'acknowledged' || doc.status === 'issued') ? 'good' : 'slate';
                                    const label = doc.status === 'sent' ? 'Sent' : (doc.status === 'acknowledged' || doc.status === 'issued') ? (isAmendment ? 'Executed' : 'Active') : 'Draft';
                                    return (
                                        <div key={doc.id || dIdx} className={`rounded-xl border px-3 py-2.5 flex items-start justify-between gap-3 ${isSelected ? 'border-[#3D52A0]/40 bg-[#3D52A0]/5' : 'border-slate-200'}`}>
                                            <div className="min-w-0">
                                                <b className="block text-sm font-semibold text-slate-800">{isAmendment ? 'Amendment' : 'Terms of engagement'}</b>
                                                <span className="block text-[11px] text-slate-500 tabular-nums">{doc.docketRef}</span>
                                                <span className="block text-[11px] text-slate-500">
                                                    Created {when(doc.generatedAt)}{doc.sentAt ? ` · sent ${when(doc.sentAt)}` : ''}{doc.acknowledgedAt ? ` · signed ${when(doc.acknowledgedAt)}` : ''}
                                                </span>
                                            </div>
                                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                <Chip tone={tone as any}>{label}</Chip>
                                                {isSelected
                                                    ? <span className="text-[11px] font-semibold text-[#3D52A0]">Showing</span>
                                                    : <Button variant="quiet" size="sm" onClick={() => { setSelectedDocketId(doc.id || null); setIsAmending(false); }}>Show</Button>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    </div>
                </div>
            )}

            {!isValid && (
                <div className="bg-white border border-slate-200 px-4 py-3 rounded-xl flex items-center gap-3 no-print">
                    <StateDot tone="bad" />
                    <p className="text-sm text-slate-700">Cannot export PDF. Missing required data: {missingData.join(', ')}. Please update in settings or project details.</p>
                </div>
            )}

            {/* Workspace Layout Sub-Tabs */}
            {isAmending && (
                <div className="flex flex-wrap items-center justify-between gap-3 no-print">
                    <span className="text-xs text-slate-500">Editing the clauses. Save changes to keep them.</span>
                    <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={() => setEditLayoutMode('editor')}
                            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                                editLayoutMode === 'editor'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Editor</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditLayoutMode('split')}
                            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                                editLayoutMode === 'split'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Columns className="w-3.5 h-3.5" />
                            <span>Side by side</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditLayoutMode('preview')}
                            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                                editLayoutMode === 'preview'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Preview</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Split Workspace and Document View: on Document, or while the clauses are being edited. */}
            {showDocument && (
            <div className={`grid grid-cols-1 ${isAmending && editLayoutMode === 'split' ? 'lg:grid-cols-12' : !isAmending ? 'lg:grid-cols-[220px_minmax(0,1fr)]' : ''} gap-6 items-start`}>
                {!isAmending && (
                    <nav aria-label="Sections" className="no-print hidden lg:block sticky top-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-3 max-h-[80vh] overflow-y-auto">
                        <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Sections</p>
                        {(activeTermsConfig?.sections || []).map((sec: any) => (
                            <button key={sec.n} type="button" onClick={() => openSection(sec.n)} className="w-full flex gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-slate-700 hover:bg-slate-50">
                                <span className="w-5 shrink-0 text-slate-400 tabular-nums">{sec.n}</span>
                                <span className="min-w-0">{resolveTokens(sec.title || '', activeTermsConfig, orgData.orgName || '')}</span>
                            </button>
                        ))}
                    </nav>
                )}
                
                {/* Left side: Amendment Workspace */}
                {isAmending && editedTermsConfig && editLayoutMode !== 'preview' && (
                    <div className={`${editLayoutMode === 'editor' ? 'w-full lg:col-span-12' : 'lg:col-span-5'} space-y-6 bg-slate-50 border border-slate-200 p-6 rounded-3xl no-print sticky top-6 max-h-[85vh] overflow-y-auto`}>
                        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-2">
                            <div>
                                <h3 className="font-bold text-slate-800">Clauses &amp; settings</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Change this docket's terms or add sections for this project.</p>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="primary" size="sm" icon={Save} onClick={saveAndShow}>Save</Button>
                                <Button size="sm" icon={X} onClick={() => setIsAmending(false)}>Close</Button>
                            </div>
                        </div>

                        {/* Global Settings */}
                        <div className="glass-light p-4 rounded-xl border border-slate-100 shadow-sm space-y-3">
                            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2 border-b border-slate-50 pb-1.5">Governing Variables</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Docket Prefix</label>
                                    <input
                                        type="text"
                                        value={editedTermsConfig.docketRefPrefix || ''}
                                        onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, docketRefPrefix: e.target.value })}
                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#3D52A0] font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">GST Rate (%)</label>
                                    <input
                                        type="number"
                                        value={editedTermsConfig.gstRate || 18}
                                        onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, gstRate: Number(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#3D52A0] font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Grace Days</label>
                                    <input
                                        type="number"
                                        value={editedTermsConfig.paymentOverdueGraceDays || 7}
                                        onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, paymentOverdueGraceDays: Number(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#3D52A0] font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Resume Days</label>
                                    <input
                                        type="number"
                                        value={editedTermsConfig.resumeAfterPaymentDays || 2}
                                        onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, resumeAfterPaymentDays: Number(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#3D52A0] font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">CR Response (Days)</label>
                                    <input
                                        type="number"
                                        value={editedTermsConfig.changeRequestResponseDays || 5}
                                        onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, changeRequestResponseDays: Number(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#3D52A0] font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Mediation Days</label>
                                    <input
                                        type="number"
                                        value={editedTermsConfig.disputeMediationDays || 30}
                                        onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, disputeMediationDays: Number(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#3D52A0] font-medium"
                                    />
                                </div>
                            </div>
                            <div className="pt-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Dispute Jurisdiction</label>
                                <input
                                    type="text"
                                    value={editedTermsConfig.disputeJurisdiction || ''}
                                    onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, disputeJurisdiction: e.target.value })}
                                    className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#3D52A0] font-medium"
                                />
                            </div>
                        </div>

                        {/* Preamble */}
                        <div className="glass-light p-4 rounded-xl border border-slate-100 shadow-sm space-y-2">
                            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-50 pb-1.5">Governing Preamble</h4>
                            <textarea
                                value={editedTermsConfig.preamble || ''}
                                onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, preamble: e.target.value })}
                                rows={3}
                                className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#3D52A0] font-medium"
                                placeholder="Governing preamble..."
                            />
                        </div>

                        {/* Sections and Clauses */}
                        <div className="space-y-3">
                            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-1 border-b border-slate-100 pb-1.5 mb-2">Sections & Clauses</h4>
                            {editedTermsConfig.sections?.map((sec, sIdx) => {
                                const isOpen = activeSectionIdx === sIdx;
                                return (
                                    <div key={sec.n || sIdx} className="glass-light rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => setActiveSectionIdx(isOpen ? null : sIdx)}
                                            className="w-full text-left p-3.5 flex items-center justify-between hover:bg-slate-50/50 transition-all cursor-pointer"
                                        >
                                            <span className="text-xs font-bold text-slate-800">
                                                Section {sec.n}: {sec.title}
                                            </span>
                                            <span className="text-xs text-slate-400 font-bold font-mono">
                                                {isOpen ? '−' : '+'}
                                            </span>
                                        </button>

                                        {isOpen && (
                                            <div className="p-4 border-t border-slate-50 bg-slate-50/20 space-y-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Section Title</label>
                                                    <input
                                                        type="text"
                                                        value={sec.title}
                                                        onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs bg-white/60 backdrop-blur-md focus:ring-1 focus:ring-[#3D52A0] font-semibold text-slate-900"
                                                    />
                                                </div>

                                                <div className="space-y-3 pt-2">
                                                    {sec.blocks?.map((block, bIdx) => (
                                                        <div key={bIdx} className="glass-light p-3 rounded-lg border border-slate-100 space-y-2 relative group shadow-sm">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[9px] font-extrabold text-slate-400 font-mono uppercase tracking-wide">
                                                                    Block {bIdx + 1} ({block.type})
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => deleteBlock(sIdx, bIdx)}
                                                                    className="text-red-500 hover:text-red-700 text-[10px] font-bold cursor-pointer transition flex items-center gap-0.5"
                                                                >
                                                                    <Trash2 className="w-3 h-3" /> Remove
                                                                </button>
                                                            </div>

                                                            {block.type === 'callout' && (
                                                                <div className="space-y-1.5">
                                                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Callout Header</label>
                                                                    <input
                                                                        type="text"
                                                                        value={block.label || ''}
                                                                        onChange={(e) => updateBlockLabel(sIdx, bIdx, e.target.value)}
                                                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#3D52A0]"
                                                                    />
                                                                </div>
                                                            )}

                                                            {block.type !== 'table' ? (
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        {block.ref !== undefined && (
                                                                            <input
                                                                                type="text"
                                                                                value={block.ref}
                                                                                onChange={(e) => {
                                                                                    const copy = deepCopyTerms(editedTermsConfig);
                                                                                    copy.sections[sIdx].blocks[bIdx].ref = e.target.value;
                                                                                    setEditedTermsConfig(copy);
                                                                                }}
                                                                                className="w-16 border border-slate-200 rounded p-1 text-[10px] font-bold font-mono text-center"
                                                                            />
                                                                        )}
                                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Clause Text</span>
                                                                    </div>
                                                                    <textarea
                                                                        value={block.text || ''}
                                                                        onChange={(e) => updateBlockText(sIdx, bIdx, e.target.value)}
                                                                        rows={4}
                                                                        className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#3D52A0] font-medium"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <p className="text-[10px] text-slate-500 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                                                    {block.source === 'warrantyPeriods' ? 'Warranty periods table' : 'Snag categories table'} (Dynamically loaded from organization parameters).
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => addBlock(sIdx)}
                                                    className="w-full py-2 bg-sky-50 hover:bg-sky-100 text-[#334486] font-bold rounded-lg text-xs transition border border-sky-100 cursor-pointer flex justify-center items-center gap-1.5"
                                                >
                                                    <Plus className="w-3.5 h-3.5" /> Add Clause / Block
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            type="button"
                            onClick={addCustomSection}
                            className="w-full py-3 bg-white/60 backdrop-blur-md hover:bg-slate-50 text-slate-700 font-extrabold rounded-xl text-xs transition border border-dashed border-slate-300 shadow-sm cursor-pointer flex justify-center items-center gap-2"
                        >
                            <Plus className="w-4 h-4 text-slate-400" /> Add Custom Section / Amendment Addendum
                        </button>
                    </div>
                )}

                {/* Right side: Live Document Preview */}
                {(!isAmending || editLayoutMode !== 'editor') && (
                    <div className={isAmending && editLayoutMode === 'split' ? "lg:col-span-7 flex justify-center w-full" : "w-full"}>
                        <div className={`w-full flex justify-center ${previewMode ? 'bg-slate-100 p-4 sm:p-6 rounded-2xl overflow-x-auto' : ''}`}>
                        <div id="terms-docket-pdf-render" className={`terms-docket-template ${previewMode ? 'print-only' : ''}`}>
                            <style dangerouslySetInnerHTML={{__html: `
                                :root{
                                    --ink:#1f2328; --ink-soft:#3f464e; --muted:#727a82;
                                    --line:#e6e3dc; --line-soft:#efece6; --paper:#fbfaf7; --card:#ffffff;
                                    --slate:#1f2328; --accent:#1e3a8a; --accent-soft:#eef2fb; --gold:#b08d57;
                                }
                                .terms-docket-template {
                                    background:var(--paper); color:var(--ink);
                                    font-family:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
                                    line-height:1.62; font-size:14px; -webkit-font-smoothing:antialiased;
                                    width: 100%; max-width: 820px;
                                }
                                .terms-docket-template * { box-sizing:border-box; }
                                .terms-docket-template .sheet{max-width:820px; margin:0 auto; background:var(--card); padding:40px 52px 50px;}
                                .terms-docket-template header.mast{border-bottom:2px solid var(--slate); padding-bottom:18px; display:flex; justify-content:space-between; align-items:flex-end;}
                                .terms-docket-template .brand{font-size:14px; letter-spacing:.22em; text-transform:uppercase; font-weight:800;}
                                .terms-docket-template .tagline{font-size:11px; color:var(--muted); letter-spacing:.05em; margin-top:3px;}
                                .terms-docket-template .docnum{font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--gold); font-weight:700; text-align:right;}
                                .terms-docket-template .title{margin:20px 0 4px; font-size:21px; font-weight:800; letter-spacing:-.01em;}
                                .terms-docket-template .preamble{font-size:12.5px; color:var(--ink-soft); margin:0 0 14px;}
                                .terms-docket-template .metabar{display:grid; grid-template-columns:1fr 1fr; border:1px solid var(--line); border-radius:10px; overflow:hidden; margin:18px 0 6px;}
                                .terms-docket-template .metabar div{padding:10px 14px; border-bottom:1px solid var(--line-soft);}
                                .terms-docket-template .metabar div:nth-child(odd){background:#faf9f5; border-right:1px solid var(--line-soft);}
                                .terms-docket-template .metabar .k{font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:700;}
                                .terms-docket-template .metabar .v{font-weight:700; color:var(--ink); margin-top:2px; font-size:13.5px;}
                                .terms-docket-template h2.sec{font-size:13px; letter-spacing:.12em; text-transform:uppercase; font-weight:800; color:var(--slate);
                                    margin:24px 0 4px; padding-top:14px; border-top:1px solid var(--line); display:flex; gap:10px; align-items:baseline;}
                                .terms-docket-template h2.sec .n{color:var(--accent); font-size:12px;}
                                .terms-docket-template .added{font-size:9.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--gold); border:1px solid var(--gold);
                                    border-radius:999px; padding:1px 7px; font-weight:700; margin-left:auto;}
                                .terms-docket-template.html2pdf-active .added { display: none !important; }
                                .terms-docket-template .cl{margin:6px 0; display:flex; gap:12px;}
                                .terms-docket-template .cl .num{flex:0 0 34px; font-weight:700; color:var(--accent); font-variant-numeric:tabular-nums; font-size:12.5px;}
                                .terms-docket-template .cl .body{color:var(--ink-soft); font-size:13px;}
                                .terms-docket-template .cl .body b{color:var(--ink);}
                                .terms-docket-template .principle{background:var(--accent-soft); border:1px solid #d6e0f5; border-left:3px solid var(--accent);
                                    border-radius:0 10px 10px 0; padding:12px 16px; margin:10px 0;}
                                .terms-docket-template .principle .lab{font-size:10px; letter-spacing:.12em; text-transform:uppercase; font-weight:800; color:var(--accent); display:block; margin-bottom:4px;}
                                .terms-docket-template .principle p{margin:0; color:#27324a; font-size:13px;}
                                .terms-docket-template .highlight{background:#fdf8ef; border:1px solid #ecdcc0; border-left:3px solid var(--gold); border-radius:0 10px 10px 0; padding:12px 16px; margin:10px 0;}
                                .terms-docket-template .highlight .lab{font-size:10px; letter-spacing:.12em; text-transform:uppercase; font-weight:800; color:#8a6b34; display:block; margin-bottom:4px;}
                                .terms-docket-template .highlight p{margin:0 0 8px; color:#5c4a2a; font-size:13px;} 
                                .terms-docket-template .highlight p:last-child{margin:0;}
                                .terms-docket-template table.mini{width:100%; border-collapse:collapse; margin:8px 0 4px; font-size:13px;}
                                .terms-docket-template table.mini th{text-align:left; background:#f4f2ec; padding:7px 11px; font-size:10px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); font-weight:700; border-bottom:1px solid var(--line);}
                                .terms-docket-template table.mini td{padding:7px 11px; border-bottom:1px solid var(--line-soft); color:var(--ink-soft);}
                                .terms-docket-template table.mini tr:last-child td{border-bottom:none;}
                                .terms-docket-template .print-only { display: none; }
                                .terms-docket-template.html2pdf-active .print-only { display: inline-block !important; }
                                .terms-docket-template.html2pdf-active .no-print { display: none !important; }
                                .terms-docket-template .sig{display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:32px;}
                                .terms-docket-template .sig .line{border-top:1px solid var(--ink); padding-top:9px; margin-top:40px; font-size:12px; color:var(--muted);}
                                .terms-docket-template .sig .line b{display:block; color:var(--ink); font-size:12.5px; margin-bottom:2px;}
                                .terms-docket-template footer{margin-top:32px; padding-top:12px; border-top:1px solid var(--line); font-size:10.5px; color:var(--muted); text-align:center; letter-spacing:.04em;}
                                @media print{ 
                                    .terms-docket-template {background:#fff;} 
                                    .terms-docket-template .sheet{padding:0 8px;} 
                                    .terms-docket-template .sec-group { break-inside: avoid; page-break-inside: avoid; }
                                    .terms-docket-template h2.sec{break-after:avoid;} 
                                    .terms-docket-template .cl, .terms-docket-template .principle, .terms-docket-template .highlight, .terms-docket-template table.mini, .terms-docket-template .sig{break-inside:avoid;} 
                                    .terms-docket-template footer { display: none; }
                                    .terms-docket-template .print-only { display: inline-block !important; }
                                    .terms-docket-template .no-print { display: none !important; }
                                    .terms-docket-template .added { display: none !important; }
                                }
                                @media(max-width:600px){ 
                                    .terms-docket-template .sheet{padding:32px 22px 56px;} 
                                    .terms-docket-template .metabar, .terms-docket-template .sig{grid-template-columns:1fr;} 
                                }
                            `}} />
                            <div className="sheet">
                                <header className="mast">
                                    <div>
                                        <div className="brand">{orgData.orgName || 'Form Factors Design Studio'}</div>
                                        <div className="tagline">Minimal Design. Maximum Impact.</div>
                                    </div>
                                    <div className="docnum">
                                        {latestDocket.docketRef?.includes('-AMD-') ? 'Document Addendum' : 'Document 1 of 2'}<br/>
                                        {latestDocket.docketRef?.includes('-AMD-') ? 'Contract Amendment' : 'Governing Docket'}
                                    </div>
                                </header>

                                <h1 className="title">
                                    {latestDocket.docketRef?.includes('-AMD-') 
                                        ? 'Amendment & Addendum to Terms of Engagement' 
                                        : 'Terms of Engagement — Governing Docket'}
                                </h1>
                                <p className="preamble">
                                    {activeTermsConfig?.preamble || "This document establishes the framework governing all projects undertaken by Form Factors Design Studio. It is to be read and acknowledged before any design work, proposal, or Discovery Workshop commences. Specific project scope and the advance payment schedule are covered in separate documents."}
                                </p>

                                <div className="metabar">
                                    <div><div className="k">Client Name</div><div className="v">{snapshotClientData?.clientName || 'Client Name'}</div></div>
                                    <div><div className="k">Project Name</div><div className="v">{snapshotClientData?.projectName || 'Project Name'}</div></div>
                                    <div>
                                        <div className="k">Date Issued</div>
                                        <div className="v">
                                            {latestDocket.status === 'draft' ? (
                                                <>
                                                    <input 
                                                        type="text"
                                                        value={snapshotClientData?.date || ''}
                                                        onChange={(e) => handleUpdateIssuedDate(e.target.value)}
                                                        className="bg-stone-50 border border-stone-200 rounded px-1.5 py-0.5 text-xs text-stone-850 font-bold outline-none focus:ring-1 focus:ring-[#3D52A0] w-full no-print"
                                                        placeholder="DD/MM/YYYY"
                                                    />
                                                    <span className="print-only">{snapshotClientData?.date || ''}</span>
                                                </>
                                            ) : (
                                                snapshotClientData?.date || 'Date Issued'
                                            )}
                                        </div>
                                    </div>
                                    <div><div className="k">Docket Reference</div><div className="v">{latestDocket.docketRef || 'Docket Reference'}</div></div>
                                </div>

                                {/* Dynamic Section Rendering */}
                                {activeTermsConfig?.sections && activeTermsConfig.sections.length > 0 ? (
                                    activeTermsConfig.sections.map((sec, sIdx) => (
                                        <div key={sec.n || sIdx} className="sec-group" id={`terms-sec-${sec.n}`}>
                                            <h2 className="sec">
                                                {/* Titles carry tokens too ("About {{studioName}}"); the PDF printed them raw. */}
                                                <span className="n">{sec.n}</span> {resolveTokens(sec.title || '', activeTermsConfig, orgData.orgName || '')}
                                                {sec.recommended && <span className="added">Recommended</span>}
                                            </h2>
                                            {sec.blocks?.map((block, bIdx) => renderBlock(block, bIdx))}
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-slate-400 italic">
                                        No terms clauses configured. Click "Amend Terms" to initialize or write custom sections.
                                    </div>
                                )}

                                {/* The real record where one exists; the blank
                                    rule only while the docket is unsigned. */}
                                {termsIssue?.clientSignature || termsIssue?.counterSignature ? (
                                    <ExecutionStamp issue={termsIssue} mode="signature" />
                                ) : (
                                    <div className="sig">
                                        <div><div className="line"><b>Client Signature &amp; Date</b>{snapshotClientData?.clientName || 'Client Name'}</div></div>
                                        <div><div className="line"><b>For {orgData.orgName || 'Form Factors Design Studio'}</b>{orgData.signatoryName || activeTermsConfig?.signatory?.name || (activeTermsConfig as any)?.signatoryName || '[Principal Name]'}</div></div>
                                    </div>
                                )}

                                <footer>{orgData.orgName || 'Form Factors Design Studio'} &middot; Minimal Design. Maximum Impact. &middot; {orgData.officeAddress || '[studio address]'} &middot; {orgData.contactEmail || 'formfactors.operations@gmail.com'}</footer>
                            </div>
                        </div>
                    </div>
                    </div>
                )}

            </div>
            )}
        </div>
    );
}
