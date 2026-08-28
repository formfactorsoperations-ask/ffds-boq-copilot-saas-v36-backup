import React, { useState } from 'react';
import { buildSignoffPatch } from '../../services/clientApprovalEngine';
import { ProjectContext, TermsDocket, TermsSettings, DigitalSignatureDocket } from '../../types';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import { FileText, Send, CheckCircle2, Download, AlertTriangle, Eye, Check, Edit3, Plus, Trash2, Save, X, Columns, ShieldCheck } from 'lucide-react';
import { id as generateId } from '../../lib/utils';
import { useOrg } from '../../contexts/OrgContext';
import { StudioDocumentShell } from '../ops/documents/StudioDocumentShell';
import { prepareClonedDocForPdf } from '../../lib/pdfUtils';
import DigitalSignatureDocketView from '../common/DigitalSignatureDocket';
import ManualAcceptanceOverrideModal from '../ops/ManualAcceptanceOverrideModal';

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
                    el.classList.add('ring-2', 'ring-[#0066CC]', 'ring-offset-2');
                    setTimeout(() => el.classList.remove('ring-2', 'ring-[#0066CC]', 'ring-offset-2'), 3000);
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
        let appDomain = import.meta.env.VITE_APP_DOMAIN || window.location.origin;
        if (appDomain.includes('ais-dev-')) {
            appDomain = appDomain.replace('ais-dev-', 'ais-pre-');
        }
        return `${appDomain}/?agreementSignoff=${token}`;
    };
    const [previewMode, setPreviewMode] = useState(true);

    const engagement = projectContext.engagement;
    const isLocked = engagement?.status === 'issued' || engagement?.status === 'acknowledged';
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
                    <button onClick={handleGenerate} disabled={isGenerating} className="mt-8 px-6 py-3 bg-[#0066CC] text-white font-bold rounded-xl shadow-sm hover:bg-[#0055B3] transition flex items-center justify-center mx-auto gap-2">
                        {isGenerating ? 'Generating...' : 'Generate Docket'}
                    </button>
                </div>
            </div>
        );
    }

    const { snapshotTermsConfig, snapshotClientData } = latestDocket;
    const activeTermsConfig = (isAmending && editedTermsConfig) ? editedTermsConfig : snapshotTermsConfig;

    const renderBlock = (block: any, idx: number) => {
        let processed = block.text || '';
        if (processed) {
            processed = processed.replace(/\{\{studioName\}\}/g, orgData.orgName || '[set in Studio Settings]');
            processed = processed.replace(/\{\{studioFoundedYear\}\}/g, activeTermsConfig?.studioFoundedYear?.toString() || '[set in Studio Settings]');
            processed = processed.replace(/\{\{changeRequestResponseDays\}\}/g, activeTermsConfig?.changeRequestResponseDays?.toString() || '[set in Studio Settings]');
            processed = processed.replace(/\{\{paymentOverdueGraceDays\}\}/g, activeTermsConfig?.paymentOverdueGraceDays?.toString() || '[set in Studio Settings]');
            processed = processed.replace(/\{\{resumeAfterPaymentDays\}\}/g, activeTermsConfig?.resumeAfterPaymentDays?.toString() || '[set in Studio Settings]');
            processed = processed.replace(/\{\{paymentMethods\}\}/g, activeTermsConfig?.paymentMethods?.join(' / ') || '[set in Studio Settings]');
            processed = processed.replace(/\{\{gstRate\}\}/g, activeTermsConfig?.gstRate?.toString() || '[set in Studio Settings]');
            processed = processed.replace(/\{\{disputeMediationDays\}\}/g, activeTermsConfig?.disputeMediationDays?.toString() || '[set in Studio Settings]');
            processed = processed.replace(/\{\{disputeJurisdiction\}\}/g, activeTermsConfig?.disputeJurisdiction || '[set in Studio Settings]');
        }

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
                <div key={idx} className={`${isHighlight ? 'highlight' : 'principle'} highlight-box ${isHighlight ? 'bg-amber-50 border-amber-500' : 'bg-slate-50 border-[#0066CC]'} border-l-4 py-3 pl-4 rounded-r-md my-4 shadow-sm`} style={{ pageBreakInside: 'avoid' }}>
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

    return (
        <div className="w-full space-y-6 animate-in fade-in pb-20">
            {/* Sub-tabs Navigation */}
            <div className="flex border-b border-slate-200 no-print mb-2 bg-stone-50/50 p-1.5 rounded-2xl border">
                <button
                    onClick={() => {
                        setActiveSubTab('view');
                        setIsAmending(false);
                    }}
                    className={`flex-1 sm:flex-initial px-6 py-2.5 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                        activeSubTab === 'view'
                            ? 'bg-[#0066CC] text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100/50'
                    }`}
                >
                    Document Viewer & Stream
                </button>
                <button
                    onClick={() => {
                        if (latestDocket.status !== 'draft') {
                            alert("This document has been sent/executed and cannot be edited. Please create an amendment/addendum.");
                            return;
                        }
                        setActiveSubTab('edit');
                        if (!isAmending) {
                            startAmending();
                        }
                    }}
                    disabled={latestDocket.status !== 'draft'}
                    className={`flex-1 sm:flex-initial px-6 py-2.5 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                        latestDocket.status !== 'draft'
                            ? 'opacity-40 cursor-not-allowed text-slate-400'
                            : activeSubTab === 'edit'
                            ? 'bg-[#0066CC] text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100/50'
                    }`}
                >
                    Clause & Settings Editor
                </button>
            </div>

            {/* Status Banner */}
            {signoffStatus === 'sent' && currentSignoff?.token && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 no-print">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="flex-grow">
                            <h3 className="text-lg font-black text-amber-900 uppercase tracking-wider mb-2">Awaiting Client Sign-Off</h3>
                            <p className="text-sm text-amber-800">The design agreement has been generated and is awaiting digital signature.</p>
                            
                            <div className="mt-4 p-4 glass-light rounded-lg border border-amber-200 shadow-sm">
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
                                    <a href={getSignoffUrl(currentSignoff.token!)} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-[#0066CC] hover:bg-[#0055B3] text-white rounded-lg text-[11px] font-bold tracking-tight inline-block cursor-pointer">
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
                        studioName={settings?.companyName || orgData?.name || 'The Studio'}
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
                <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm mb-4">
                    {localError}
                </div>
            )}

            {activeSubTab === 'view' && (
                <>
                    {/* Terms & Amendments Version Ledger */}
                    <div className="glass-light border border-slate-200/80 rounded-3xl p-6 shadow-sm no-print">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="bg-sky-50 p-2.5 rounded-xl border border-sky-100/50">
                                    <FileText className="w-5 h-5 text-[#0055B3]" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Document Stream & Version Ledger</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Track every change, revision, signed amendment, and digital sign-off record in one place.</p>
                                </div>
                            </div>
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                                {dockets.length} {dockets.length === 1 ? 'Document' : 'Documents'} in stream
                            </span>
                        </div>

                        {dockets.length === 0 ? (
                            <div className="text-center py-8">
                                <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-sm text-slate-400 italic">No document history found. Please generate a docket to establish governing terms.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[650px]">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50/50">
                                            <th className="py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Document Type & Reference</th>
                                            <th className="py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Status Badge</th>
                                            <th className="py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Activity & Timeline Log</th>
                                            <th className="py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Operator / Signatory</th>
                                            <th className="py-2.5 px-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dockets.map((doc, dIdx) => {
                                            const isSelected = doc.id === latestDocket?.id;
                                            const isAmendment = doc.docketRef?.includes('-AMD-');
                                            
                                            // Status styling
                                            let statusBg = 'bg-slate-50 text-slate-600 border-slate-200';
                                            let statusText = 'Draft';
                                            if (doc.status === 'sent') {
                                                statusBg = 'bg-amber-50 text-amber-800 border-amber-200';
                                                statusText = 'Sent - Awaiting Signature';
                                            } else if (doc.status === 'acknowledged' || doc.status === 'issued') {
                                                statusBg = 'bg-emerald-50 text-emerald-800 border-emerald-200/60';
                                                statusText = isAmendment ? 'Executed Amendment' : 'Active Governing Terms';
                                            }

                                            return (
                                                <tr key={doc.id || dIdx} className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50/30 transition-colors ${isSelected ? 'bg-sky-50/20' : ''}`}>
                                                    <td className="py-3.5 px-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg ${isAmendment ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-sky-50 text-[#0055B3] border border-sky-100'}`}>
                                                                <FileText className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-black text-slate-800 block leading-tight">
                                                                    {isAmendment ? 'Addendum / Amendment' : 'Governing Terms of Engagement'}
                                                                </span>
                                                                <span className="font-mono text-[10.5px] text-slate-500 mt-1 block tracking-wider font-semibold">
                                                                    {doc.docketRef}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider border ${statusBg}`}>
                                                            <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current"></span>
                                                            {statusText}
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 px-4 text-[11px] text-slate-600">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2 text-slate-500">
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase w-14">Created:</span>
                                                                <span className="font-semibold text-slate-700">{new Date(doc.generatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                                            </div>
                                                            {doc.sentAt && (
                                                                <div className="flex items-center gap-2 text-[#0066CC]">
                                                                    <span className="text-[10px] font-bold text-sky-400 uppercase w-14">Sent:</span>
                                                                    <span className="font-semibold">{new Date(doc.sentAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                                                </div>
                                                            )}
                                                            {doc.acknowledgedAt && (
                                                                <div className="flex items-center gap-2 text-emerald-600">
                                                                    <span className="text-[10px] font-bold text-emerald-400 uppercase w-14">Signed:</span>
                                                                    <span className="font-semibold">{new Date(doc.acknowledgedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        <div className="text-xs">
                                                            <span className="text-slate-800 font-bold block">{doc.sentBy || 'System Operator'}</span>
                                                            <span className="text-[10px] text-slate-400 font-medium">Digital Architect</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {isSelected ? (
                                                                <span className="px-3 py-1.5 bg-[#0066CC] text-white text-[10px] font-extrabold rounded-lg uppercase tracking-wider shadow-sm">
                                                                    Active Preview
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSelectedDocketId(doc.id || null);
                                                                        setIsAmending(false);
                                                                    }}
                                                                    className="px-3 py-1.5 bg-white/60 backdrop-blur-md border border-slate-200 hover:border-[#0066CC] hover:text-[#0066CC] hover:bg-sky-50/50 text-slate-700 text-[10px] font-extrabold rounded-lg transition-all cursor-pointer shadow-sm uppercase tracking-wider"
                                                                >
                                                                    Load View
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Header Actions */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 glass-light p-4 rounded-2xl shadow-sm border border-slate-200 no-print">
                        <div className="flex items-center gap-4">
                            <div className="bg-slate-100 p-3 rounded-xl border border-slate-200">
                                <FileText className="w-6 h-6 text-slate-500" />
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
                            <button onClick={() => setPreviewMode(!previewMode)} className="px-4 py-2 bg-white/60 backdrop-blur-md border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition flex items-center gap-2">
                                <Eye className="w-4 h-4" /> {previewMode ? 'Exit Preview' : 'Preview as PDF'}
                            </button>
                            <button onClick={handleDownloadPdf} disabled={!isValid} className="px-4 py-2 bg-white/60 backdrop-blur-md border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                <Download className="w-4 h-4" /> Download PDF
                            </button>
                            {latestDocket.status === 'draft' && (
                                <>
                                    {!isAmending ? (
                                        <button onClick={startAmending} className="px-4 py-2 bg-amber-500 border border-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-lg transition flex items-center gap-2 shadow-sm cursor-pointer">
                                            <Edit3 className="w-4 h-4" /> Amend Terms
                                        </button>
                                    ) : (
                                        <button onClick={saveAmendments} className="px-4 py-2 bg-emerald-600 border border-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-lg transition flex items-center gap-2 shadow-sm cursor-pointer">
                                            <Save className="w-4 h-4" /> Save Changes
                                        </button>
                                    )}

                                    {!isLocked && (
                                        <button onClick={handleGenerate} disabled={isGenerating} className="px-4 py-2 bg-white/60 backdrop-blur-md border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition flex items-center gap-2">
                                            <FileText className="w-4 h-4" /> Regenerate
                                        </button>
                                    )}
                                    
                                    {!showSendConfirm ? (
                                        <button onClick={() => setShowSendConfirm(true)} disabled={isSending} className="px-4 py-2 bg-[#0066CC] border border-[#0066CC] text-white font-bold text-sm rounded-lg hover:bg-[#0055B3] transition flex items-center gap-2 shadow-sm">
                                            <Send className="w-4 h-4" /> {isSending ? 'Sending...' : 'Send to Client'}
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <button onClick={sendEmailSignoff} className="px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white font-bold rounded text-sm transition shadow-sm">Confirm Send</button>
                                            <button onClick={() => setShowSendConfirm(false)} className="px-4 py-2 bg-white/60 backdrop-blur-md border border-slate-200 text-slate-700 font-bold rounded text-sm hover:bg-slate-50 transition">Cancel</button>
                                        </div>
                                    )}
                                </>
                            )}
                            {latestDocket.status === 'sent' && !isLocked && (
                                <button onClick={handleAcknowledge} className="px-4 py-2 bg-emerald-600 border border-emerald-600 text-white font-bold text-sm rounded-lg hover:bg-emerald-700 transition flex items-center gap-2 shadow-sm">
                                    <Check className="w-4 h-4" /> Mark as Acknowledged
                                </button>
                            )}
                            {latestDocket.status !== 'draft' && (
                                <button onClick={handleGenerateAmendment} disabled={isGenerating} className="px-4 py-2 bg-[#0066CC] border border-[#0066CC] text-white font-bold text-sm rounded-lg hover:bg-[#0055B3] transition flex items-center gap-2 shadow-sm cursor-pointer">
                                    <Plus className="w-4 h-4" /> Create Amendment / Addendum
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}

            {!isValid && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-3 no-print">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <p className="text-sm text-red-800 font-medium">Cannot export PDF. Missing required data: {missingData.join(', ')}. Please update in settings or project details.</p>
                </div>
            )}

            {/* Workspace Layout Sub-Tabs */}
            {isAmending && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between glass-light border border-slate-200/80 p-3 rounded-2xl shadow-sm no-print mb-6 gap-3">
                    <div className="flex items-center gap-2 pl-1">
                        <div className="bg-sky-50 p-1.5 rounded-lg border border-sky-100/50">
                            <Columns className="w-4 h-4 text-[#0055B3]" />
                        </div>
                        <div>
                            <span className="text-xs font-black text-slate-900 uppercase tracking-wider block">Workspace Layout</span>
                            <span className="text-[10px] text-slate-400 font-medium">Select view option for comfortable editing</span>
                        </div>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={() => setEditLayoutMode('editor')}
                            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                editLayoutMode === 'editor'
                                    ? 'bg-[#0066CC] text-white shadow-sm'
                                    : 'text-slate-600 hover:text-slate-800'
                            }`}
                        >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Spacious Editor</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditLayoutMode('split')}
                            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                editLayoutMode === 'split'
                                    ? 'bg-[#0066CC] text-white shadow-sm'
                                    : 'text-slate-600 hover:text-slate-800'
                            }`}
                        >
                            <Columns className="w-3.5 h-3.5" />
                            <span>Split View</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditLayoutMode('preview')}
                            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                editLayoutMode === 'preview'
                                    ? 'bg-[#0066CC] text-white shadow-sm'
                                    : 'text-slate-600 hover:text-slate-800'
                            }`}
                        >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Live Preview</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Split Workspace and Document View */}
            <div className={`grid grid-cols-1 ${isAmending && editLayoutMode === 'split' ? 'lg:grid-cols-12' : ''} gap-8 items-start`}>
                
                {/* Left side: Amendment Workspace */}
                {isAmending && editedTermsConfig && editLayoutMode !== 'preview' && (
                    <div className={`${editLayoutMode === 'editor' ? 'w-full lg:col-span-12' : 'lg:col-span-5'} space-y-6 bg-slate-50 border border-slate-200 p-6 rounded-3xl no-print sticky top-6 max-h-[85vh] overflow-y-auto`}>
                        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-2">
                            <div>
                                <h3 className="text-md font-bold text-slate-900 tracking-tight">Amendment Workspace</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Customize current terms or append project-specific addenda.</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={saveAmendments}
                                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition shadow-sm cursor-pointer flex items-center gap-1"
                                >
                                    <Save className="w-3.5 h-3.5" /> Save
                                </button>
                                <button
                                    onClick={() => setIsAmending(false)}
                                    className="px-3 py-1.5 bg-white/60 backdrop-blur-md border border-slate-200 text-slate-700 font-bold rounded-lg text-xs hover:bg-slate-50 transition cursor-pointer flex items-center gap-1"
                                >
                                    <X className="w-3.5 h-3.5" /> Close
                                </button>
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
                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#0066CC] font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">GST Rate (%)</label>
                                    <input
                                        type="number"
                                        value={editedTermsConfig.gstRate || 18}
                                        onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, gstRate: Number(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#0066CC] font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Grace Days</label>
                                    <input
                                        type="number"
                                        value={editedTermsConfig.paymentOverdueGraceDays || 7}
                                        onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, paymentOverdueGraceDays: Number(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#0066CC] font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Resume Days</label>
                                    <input
                                        type="number"
                                        value={editedTermsConfig.resumeAfterPaymentDays || 2}
                                        onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, resumeAfterPaymentDays: Number(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#0066CC] font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">CR Response (Days)</label>
                                    <input
                                        type="number"
                                        value={editedTermsConfig.changeRequestResponseDays || 5}
                                        onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, changeRequestResponseDays: Number(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#0066CC] font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Mediation Days</label>
                                    <input
                                        type="number"
                                        value={editedTermsConfig.disputeMediationDays || 30}
                                        onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, disputeMediationDays: Number(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#0066CC] font-medium"
                                    />
                                </div>
                            </div>
                            <div className="pt-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Dispute Jurisdiction</label>
                                <input
                                    type="text"
                                    value={editedTermsConfig.disputeJurisdiction || ''}
                                    onChange={(e) => setEditedTermsConfig({ ...editedTermsConfig, disputeJurisdiction: e.target.value })}
                                    className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#0066CC] font-medium"
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
                                className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#0066CC] font-medium"
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
                                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs bg-white/60 backdrop-blur-md focus:ring-1 focus:ring-[#0066CC] font-semibold text-slate-900"
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
                                                                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-[#0066CC]"
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
                                                                        className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-[#0066CC] font-medium"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <p className="text-[10.5px] text-slate-500 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                                                    {block.source === 'warrantyPeriods' ? 'Warranty periods table' : 'Snag categories table'} (Dynamically loaded from organization parameters).
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => addBlock(sIdx)}
                                                    className="w-full py-2 bg-sky-50 hover:bg-sky-100 text-[#0055B3] font-bold rounded-lg text-xs transition border border-sky-100 cursor-pointer flex justify-center items-center gap-1.5"
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
                        <div className={`transition-all duration-500 w-full flex justify-center ${previewMode ? 'glass-light p-8 -mx-8 rounded-3xl overflow-x-auto shadow-inner' : ''}`}>
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
                                                        className="bg-stone-50 border border-stone-200 rounded px-1.5 py-0.5 text-xs text-stone-850 font-bold outline-none focus:ring-1 focus:ring-[#0066CC] w-full no-print"
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
                                        <div key={sec.n || sIdx} className="sec-group">
                                            <h2 className="sec">
                                                <span className="n">{sec.n}</span> {sec.title}
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

                                <div className="sig">
                                    <div><div className="line"><b>Client Signature &amp; Date</b>{snapshotClientData?.clientName || 'Client Name'}</div></div>
                                    <div><div className="line"><b>For {orgData.orgName || 'Form Factors Design Studio'}</b>{orgData.signatoryName || activeTermsConfig?.signatory?.name || (activeTermsConfig as any)?.signatoryName || '[Principal Name]'}</div></div>
                                </div>

                                <footer>{orgData.orgName || 'Form Factors Design Studio'} &middot; Minimal Design. Maximum Impact. &middot; {orgData.officeAddress || '[studio address]'} &middot; {orgData.contactEmail || 'formfactors.operations@gmail.com'}</footer>
                            </div>
                        </div>
                    </div>
                    </div>
                )}

            </div>
        </div>
    );
}
