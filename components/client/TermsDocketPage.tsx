import React, { useState } from 'react';
import { ProjectContext, TermsDocket, TermsSettings } from '../../types';
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

    const engagement = projectContext.engagement;
    const isLocked = engagement?.status === 'issued' || engagement?.status === 'acknowledged';
    const lockedSnapshot = engagement?.lockedSnapshot;

    // We still use dockets array for backward compatibility, but prefer locked snapshot if available
    const dockets = projectContext.termsDockets || [];
    let latestDocket = dockets[dockets.length - 1];

    if (latestDocket && engagement) {
        latestDocket = { ...latestDocket, status: engagement.status };
    }

    if (isLocked && lockedSnapshot?.termsSettings) {
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
            const { getTermsSettings } = await import('../../services/engagementService');
            const termsSettings = await getTermsSettings(orgId);
            
            if (!termsSettings) {
                alert("Terms settings not configured in Studio Settings.");
                setIsGenerating(false);
                return;
            }

            const year = new Date().getFullYear();
            const nnn = String(Math.floor(Math.random() * 900) + 100);
            
            // Validate all clauses against tokens (sanity check)
            // But we actually validate on render. Here we just snapshot.
            
            const newDocket: TermsDocket = {
                id: generateId(),
                docketRef: `${termsSettings.docketRefPrefix}-TD-${year}-${nnn}`,
                status: 'draft',
                generatedAt: Date.now(),
                sentAt: null,
                sentBy: 'System',
                acknowledgedAt: null,
                snapshotTermsConfig: termsSettings,
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
        } catch (err) {
            console.error(err);
            alert("Failed to generate docket.");
        } finally {
            setIsGenerating(false);
        }
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
                    margin: [15, 0, 15, 0],
                    filename: `FFDS-Terms-${latestDocket.docketRef}.pdf`,
                    image: { type: 'jpeg' as const, quality: 1 },
                    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
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
                }).save();
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
                    <h2 className="text-2xl font-black text-indigo-900 tracking-tight">Terms of Engagement Docket</h2>
                    <p className="text-slate-500 mt-2 max-w-lg mx-auto">
                        Generate the foundational framework docket. This sets the rules of engagement (warranties, snags, revisions) before any work begins. It relies on the Advance Payment Schedule for specific amounts.
                    </p>
                    <button onClick={handleGenerate} disabled={isGenerating} className="mt-8 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-sm hover:bg-indigo-700 transition flex items-center justify-center mx-auto gap-2">
                        {isGenerating ? 'Generating...' : 'Generate Docket'}
                    </button>
                </div>
            </div>
        );
    }

    const { snapshotTermsConfig, snapshotClientData } = latestDocket;

    const renderBlock = (block: any, idx: number) => {
        let processed = block.text || '';
        if (processed) {
            processed = processed.replace(/\{\{studioName\}\}/g, orgData.orgName || '[set in Studio Settings]');
            processed = processed.replace(/\{\{studioFoundedYear\}\}/g, snapshotTermsConfig?.studioFoundedYear?.toString() || '[set in Studio Settings]');
            processed = processed.replace(/\{\{changeRequestResponseDays\}\}/g, snapshotTermsConfig?.changeRequestResponseDays?.toString() || '[set in Studio Settings]');
            processed = processed.replace(/\{\{paymentOverdueGraceDays\}\}/g, snapshotTermsConfig?.paymentOverdueGraceDays?.toString() || '[set in Studio Settings]');
            processed = processed.replace(/\{\{resumeAfterPaymentDays\}\}/g, snapshotTermsConfig?.resumeAfterPaymentDays?.toString() || '[set in Studio Settings]');
            processed = processed.replace(/\{\{paymentMethods\}\}/g, snapshotTermsConfig?.paymentMethods?.join(' / ') || '[set in Studio Settings]');
            processed = processed.replace(/\{\{gstRate\}\}/g, snapshotTermsConfig?.gstRate?.toString() || '[set in Studio Settings]');
            processed = processed.replace(/\{\{disputeMediationDays\}\}/g, snapshotTermsConfig?.disputeMediationDays?.toString() || '[set in Studio Settings]');
            processed = processed.replace(/\{\{disputeJurisdiction\}\}/g, snapshotTermsConfig?.disputeJurisdiction || '[set in Studio Settings]');
        }

        if (block.type === 'clause') {
            return (
                <p key={idx} className="mb-2">
                    {block.ref && <strong>{block.ref}</strong>} {processed}
                </p>
            );
        }

        if (block.type === 'callout') {
            return (
                <div key={idx} className={`highlight-box ${block.style === 'highlight' ? 'bg-amber-50 border-amber-500' : 'bg-slate-50 border-indigo-600'} border-l-4 py-3 pl-4 rounded-r-md my-4 shadow-sm`} style={{ pageBreakInside: 'avoid' }}>
                    {block.label && <h3 className={`font-bold ${block.style === 'highlight' ? 'text-amber-900' : 'text-indigo-900'} text-[11px] tracking-wider mb-2 m-0 uppercase`}>{block.label}</h3>}
                    {processed.split('\n\n').map((p: string, pIdx: number) => (
                        <p key={pIdx} className={`m-0 ${pIdx === 0 ? 'font-semibold text-slate-800' : 'text-slate-600 mt-2'}`}>{p}</p>
                    ))}
                </div>
            );
        }

        if (block.type === 'table') {
            let data: [string, string][] = [];
            let columns: string[] = [];
            if (block.source === 'snagCategories' && snapshotTermsConfig?.snagCategories) {
                columns = ['Category', 'Resolution Timeframe'];
                data = snapshotTermsConfig.snagCategories.map(c => ([`Category ${c.label}`, `${c.resolveDays} working days`]));
            } else if (block.source === 'warrantyPeriods' && snapshotTermsConfig?.warrantyPeriods) {
                columns = ['Trade / Component', 'Warranty Period'];
                data = snapshotTermsConfig.warrantyPeriods.map(w => {
                    const duration = w.months >= 12 && w.months % 12 === 0 ? `${w.months / 12} Year${w.months / 12 > 1 ? 's' : ''}` : `${w.months} Months`;
                    return [w.trade, duration];
                });
            }

            if (data.length === 0) return null;

            return (
                <div key={idx} className="my-4">
                    {block.intro && <p className="mb-2 font-semibold">{block.intro}</p>}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse">
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
        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in pb-20">
            {/* Header Actions */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200 no-print">
                <div className="flex items-center gap-4">
                    <div className="bg-slate-100 p-3 rounded-xl border border-slate-200">
                        <FileText className="w-6 h-6 text-slate-500" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-indigo-900 leading-tight">Terms Docket <span className="font-mono text-slate-500 ml-2 text-sm">{latestDocket.docketRef}</span></h2>
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
                            {!isLocked && (
                                <button onClick={handleGenerate} disabled={isGenerating} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition flex items-center gap-2">
                                    <FileText className="w-4 h-4" /> Regenerate
                                </button>
                            )}
                            <button onClick={handleSend} className="px-4 py-2 bg-indigo-600 border border-indigo-600 text-white font-bold text-sm rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 shadow-sm">
                                <Send className="w-4 h-4" /> Mark as Sent
                            </button>
                        </>
                    )}
                    {latestDocket.status === 'sent' && !isLocked && (
                        <button onClick={handleAcknowledge} className="px-4 py-2 bg-emerald-600 border border-emerald-600 text-white font-bold text-sm rounded-lg hover:bg-emerald-700 transition flex items-center gap-2 shadow-sm">
                            <Check className="w-4 h-4" /> Mark as Acknowledged
                        </button>
                    )}
                    {latestDocket.status !== 'draft' && !isLocked && (
                        <button onClick={handleGenerate} disabled={isGenerating} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition flex items-center gap-2 shadow-sm">
                            <FileText className="w-4 h-4" /> Regenerate
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
                            <div className="docnum">Document 1 of 2<br/>Governing Docket</div>
                        </header>

                        <h1 className="title">Terms of Engagement &mdash; Governing Docket</h1>
                        <p className="preamble">This document establishes the framework governing all projects undertaken by Form Factors Design Studio. It is to be read and acknowledged before any design work, proposal, or Discovery Workshop commences. Specific project scope and the advance payment schedule are covered in separate documents.</p>

                        <div className="metabar">
                            <div><div className="k">Client Name</div><div className="v">{snapshotClientData?.clientName || 'Client Name'}</div></div>
                            <div><div className="k">Project Name</div><div className="v">{snapshotClientData?.projectName || 'Project Name'}</div></div>
                            <div><div className="k">Date Issued</div><div className="v">{snapshotClientData?.date || 'Date Issued'}</div></div>
                            <div><div className="k">Docket Reference</div><div className="v">{latestDocket.docketRef || 'Docket Reference'}</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">1</span> About Form Factors Design Studio</h2>
                            <div className="cl"><div className="num">1.1</div><div className="body">Form Factors Design Studio ("FFDS" or "the Studio") is a design-led practice founded in 2018, providing end-to-end architectural design, interior design, and turnkey execution services. Every project is approached with clarity, care, and purposeful intent &mdash; from the first conversation to the final handover.</div></div>
                            <div className="cl"><div className="num">1.2</div><div className="body">The Studio acts as the client's single point of contact for the entire project duration, coordinating design development, contractor management, material procurement guidance, and site oversight. All project instructions, approvals, and communications must flow through the Studio.</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">2</span> The Design Process</h2>
                            <div className="cl"><div className="num">2.1</div><div className="body">FFDS follows a structured process for every project. The specific phases applicable to a given project are defined in the Design Agreement. The standard phases are: <b>Discovery Workshop &mdash; Space Planning &mdash; Concept Development &amp; Visualisation &mdash; Working Drawings &amp; BOQ &mdash; Execution &mdash; Handover.</b> Not all phases apply to every project type.</div></div>
                            <div className="cl"><div className="num">2.2</div><div className="body">The client agrees to provide timely feedback, approvals, and inputs at each stage. Project delays caused by late client feedback or approvals do not constitute delays attributable to the Studio and may impact the project timeline at no liability to FFDS.</div></div>
                            <div className="cl"><div className="num">2.3</div><div className="body">Once the Design Brief is formally frozen at the conclusion of the Discovery phase, any changes to agreed scope, room requirements, or design direction must be submitted as a formal Change Request. The Studio will communicate cost and timeline impact within <b>{snapshotTermsConfig?.changeRequestResponseDays || 5} working days</b> of receiving a Change Request.</div></div>
                            <div className="cl"><div className="num">2.4</div><div className="body">The Design Agreement includes a defined number of design revision rounds within the Concept Development phase. This number is specified in the Design Agreement. Additional revision rounds beyond the included scope are charged at the rate stated in the Design Agreement.</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">3</span> Advance Payment Framework</h2>
                            <div className="cl"><div className="num">3.1</div><div className="body">All payments in FFDS projects are structured as advance payments. Each payment is made before the corresponding phase of work commences, not after. The specific advance schedule, amounts, and unlock conditions for each project are set out in the Payment Schedule document, which is issued alongside the Design Agreement.</div></div>
                            <div className="principle">
                                <span className="lab">The Advance Payment Principle</span>
                                <p>No phase of work commences until the advance payment for that phase has been received and cleared. This applies to every milestone in the Payment Schedule &mdash; including design phases, execution phases, and the final handover. The Payment Schedule issued with the Design Agreement specifies exactly what each advance unlocks.</p>
                            </div>
                            <div className="cl"><div className="num">3.2</div><div className="body">The final advance in the Payment Schedule is tied to the formal project handover. It unlocks the Project Handover Dossier, all keys and access cards, and the Warranty Certificate. This advance is due upon completion of all installation and finishing work, irrespective of any snag items.</div></div>
                            <div className="cl"><div className="num">3.3</div><div className="body">The Studio reserves the right to pause all site activity and design work if any advance payment remains unpaid more than <b>{snapshotTermsConfig?.paymentOverdueGraceDays || 7} days</b> beyond its due date, without liability for any project delay arising thereof. Activity resumes within <b>{snapshotTermsConfig?.resumeAfterPaymentDays || 2} working days</b> of payment clearance.</div></div>
                            <div className="cl"><div className="num">3.4</div><div className="body">All payments are to be made via {snapshotTermsConfig?.paymentMethods?.join(' / ') || 'NEFT / RTGS / UPI'} to the bank account specified on the invoice. Payment is considered received only upon clearance into the Studio's designated account. GST at <b>{snapshotTermsConfig?.gstRate || 18}%</b> applies to all amounts unless otherwise specified in the Design Agreement.</div></div>
                            <div className="cl"><div className="num">3.5</div><div className="body">If the Payment Schedule is revised due to scope changes, the revised Payment Schedule supersedes the previous version for outstanding advances only. Advances already received are not affected by a Payment Schedule revision.</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">4</span> Execution &amp; Site Protocol</h2>
                            <div className="cl"><div className="num">4.1</div><div className="body">Unobstructed site access must be provided to the Studio's team and contractors during agreed execution hours. Delays caused by restricted site access are not attributable to the Studio.</div></div>
                            <div className="cl"><div className="num">4.2</div><div className="body">All client site visits during the execution phase must be coordinated in advance with the Studio's site supervisor. Unannounced visits during active construction phases are strongly discouraged for safety reasons.</div></div>
                            <div className="cl"><div className="num">4.3</div><div className="body">The client agrees not to issue instructions directly to contractors. All instructions regarding execution must flow through the Studio's project team. Verbal instructions given directly to contractors without the Studio's authorisation will not be treated as binding and may result in additional rectification costs.</div></div>
                            <div className="cl"><div className="num">4.4</div><div className="body">Materials or fittings procured independently by the client outside the Studio's guidance are not covered by the Studio's workmanship warranty. The Studio will endeavour to accommodate client-supplied materials but accepts no responsibility for their quality or compatibility with the design.</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">5</span> Change Requests &amp; Scope Additions</h2>
                            <div className="cl"><div className="num">5.1</div><div className="body">Any change to agreed scope &mdash; addition, deletion, or modification &mdash; requires a formal Change Request. The Studio will assess and communicate cost and timeline impact within {snapshotTermsConfig?.changeRequestResponseDays || 5} working days.</div></div>
                            <div className="cl"><div className="num">5.2</div><div className="body">No Change Request will be executed until approved in writing by the client and the corresponding additional advance has been invoiced and received. WhatsApp or email confirmation constitutes valid written approval for Change Requests.</div></div>
                            <div className="cl"><div className="num">5.3</div><div className="body">Approved Change Requests that affect the project cost will result in a revised Payment Schedule being issued. The framework governing advance payments applies to the revised schedule without requiring a new Terms of Engagement acknowledgement.</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">6</span> Pre-Handover Inspection, Snag Policy &amp; Final Advance</h2>
                            <div className="cl"><div className="num">6.1</div><div className="body">Upon completion of all installation and finishing work, the Studio will conduct a formal Pre-Handover Walkthrough with the client. Observations will be documented in a Snag List.</div></div>
                            <div className="cl"><div className="num">6.2</div><div className="body">A snag is a minor defect in workmanship or finish that does not impair the functional use of the space. A snag does not include design preferences differing from approved visuals, items outside agreed scope, normal material tolerances, or third-party product defects covered by manufacturer warranty.</div></div>
                            <div className="cl"><div className="num">6.3</div><div className="body">Snag items are addressed within the warranty period. {snapshotTermsConfig?.snagCategories?.map((c: any) => `Category ${c.label} snags are addressed within ${c.resolveDays} working days`).join('; ') || 'Category A snags are addressed within 7 working days; Category B snags within 21 days'}. The Studio's commitment to resolving legitimate snag items exists independently of payment status.</div></div>
                            <div className="highlight">
                                <span className="lab">Clause 6.4 &mdash; Final Advance &amp; Handover</span>
                                <p>The final advance payment in the Payment Schedule is due upon completion of all installation and finishing work. This is the advance that releases the Project Handover Dossier, all keys and access cards, and the Warranty Certificate. This advance is <b>not conditional upon the clearance of snag items.</b></p>
                                <p>Snag items are post-completion rectifications falling within warranty coverage. They do not constitute grounds to withhold the final advance. The Studio commits to addressing all legitimate snags documented in the Snag List. Withholding the final advance against pending snag items constitutes a breach of payment terms.</p>
                            </div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">7</span> Warranty</h2>
                            <div className="cl"><div className="num">7.1</div><div className="body">FFDS provides workmanship warranty on completed execution work from the date of formal handover. Warranty periods by trade are specified in the Design Agreement and vary by project scope.</div></div>
                            <div className="cl"><div className="num">7.2</div><div className="body">Standard warranty coverage:
                                <table className="mini"><thead><tr><th>Trade</th><th>Period</th></tr></thead>
                                <tbody>
                                    {snapshotTermsConfig?.warrantyPeriods?.map((w: any) => (
                                        <tr key={w.trade}><td>{w.trade}</td><td>{w.months >= 12 && w.months % 12 === 0 ? `${w.months / 12} Year${w.months / 12 > 1 ? 's' : ''}` : `${w.months} Months`}</td></tr>
                                    )) || (
                                        <><tr><td>Civil work &amp; carpentry</td><td>1 year</td></tr><tr><td>Painting &amp; electrical</td><td>6 months</td></tr></>
                                    )}
                                </tbody></table>
                                These periods may be adjusted in the Design Agreement for specific project types.</div></div>
                            <div className="cl"><div className="num">7.3</div><div className="body">Warranty covers workmanship defects under normal usage. It excludes damage from misuse, negligence, post-handover modifications, building-level water ingress, or normal wear and tear. Warranty is valid only when all outstanding advances have been cleared in full.</div></div>
                            <div className="cl"><div className="num">7.4</div><div className="body">Warranty claims must be submitted in writing. Site assessment within 7 working days of a reported claim.</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">8</span> Intellectual Property</h2>
                            <div className="cl"><div className="num">8.1</div><div className="body">All design drawings, 3D visualisations, material specifications, and documentation created by FFDS remain the intellectual property of Form Factors Design Studio. Upon receipt of all due payments in full, the client receives a non-exclusive licence to use the design for the agreed project site only.</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">9</span> Dispute Resolution &amp; Jurisdiction</h2>
                            <div className="cl"><div className="num">9.1</div><div className="body">In the event of any dispute arising out of these Terms or the project execution, both parties agree to attempt amicable resolution in good faith for a period of <b>{snapshotTermsConfig?.disputeMediationDays || 15} days</b> before pursuing formal action.</div></div>
                            <div className="cl"><div className="num">9.2</div><div className="body">These terms and all subsequent agreements shall be governed by the laws of India. Any legal proceedings shall be subject to the exclusive jurisdiction of the courts in <b>{snapshotTermsConfig?.disputeJurisdiction || 'Mumbai, Maharashtra'}</b>.</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">10</span> Communication Protocol</h2>
                            <div className="cl"><div className="num">10.1</div><div className="body">All project approvals, scope sign-offs, Change Request authorisations, and formal decisions must be confirmed in writing via email or WhatsApp message to be valid. Verbal confirmations in person or over a call do not constitute authorisation and will not be treated as binding.</div></div>
                            <div className="cl"><div className="num">10.2</div><div className="body">The Studio maintains a record of all approvals, milestones, and communications. The client is encouraged to retain all project-related correspondence.</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">11</span> Termination &amp; Refund</h2>
                            <div className="cl"><div className="num">11.1</div><div className="body">Either party may terminate the engagement by written notice. On termination, the Studio will hand over all deliverables completed up to and including the most recent fully paid phase.</div></div>
                            <div className="cl"><div className="num">11.2</div><div className="body">Because every payment is an advance against a phase about to commence, advances corresponding to a phase that has begun are non-refundable. Any advance received for a phase not yet commenced will be refunded after deduction of costs already committed by the Studio for that phase.</div></div>
                            <div className="cl"><div className="num">11.3</div><div className="body">The design licence under Section 8 passes to the client only upon clearance of all advances due for delivered work. Work product for unpaid or uncommenced phases is not released on termination.</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">12</span> Limitation of Liability</h2>
                            <div className="cl"><div className="num">12.1</div><div className="body">The Studio's aggregate liability arising out of or in connection with the engagement shall not exceed the total design fees paid to the Studio for the project.</div></div>
                            <div className="cl"><div className="num">12.2</div><div className="body">The Studio shall not be liable for indirect, incidental, or consequential losses, nor for defects in client-supplied materials or in third-party products covered by a manufacturer's warranty.</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">13</span> Force Majeure</h2>
                            <div className="cl"><div className="num">13.1</div><div className="body">Neither party shall be liable for any delay or failure to perform arising from events beyond its reasonable control, including natural events, government action, civil disruption, strikes, or material supply disruption. Affected timelines extend by the period of the event.</div></div>
                        </div>

                        <div className="sec-group">
                            <h2 className="sec"><span className="n">14</span> Confidentiality</h2>
                            <div className="cl"><div className="num">14.1</div><div className="body">Each party shall keep confidential the other's non-public information shared during the engagement and shall use it only for the purposes of the project.</div></div>
                        </div>

                        <div className="sig">
                            <div><div className="line"><b>Client Signature &amp; Date</b>{snapshotClientData?.clientName || 'Client Name'}</div></div>
                            <div><div className="line"><b>For {orgData.orgName || 'Form Factors Design Studio'}</b>{orgData.signatoryName || snapshotTermsConfig?.signatory?.name || (snapshotTermsConfig as any)?.signatoryName || '[Principal Name]'}</div></div>
                        </div>

                        <footer>{orgData.orgName || 'Form Factors Design Studio'} &middot; Minimal Design. Maximum Impact. &middot; {orgData.officeAddress || '[studio address]'} &middot; {orgData.contactEmail || 'formfactors.operations@gmail.com'}</footer>
                    </div>
                </div>
            </div>
        </div>
    );
}
