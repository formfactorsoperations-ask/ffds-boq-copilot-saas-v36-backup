const fs = require('fs');

const content = `import React, { useState } from 'react';
import { ProjectContext } from '../../types';
import { Download, Printer, CheckCircle2, Calendar } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import { useStudioSettings } from '../../hooks/useStudioSettings';

interface HandoverDocketPageProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

export default function HandoverDocketPage({ projectContext }: HandoverDocketPageProps) {
    const { orgData } = useOrg();
    const studioId = orgData?.tenantId || 'demo-tenant-01';
    const { settings } = useStudioSettings(studioId);
    
    const studioName = orgData?.name || 'Form Factors Design Studio';
    const clientName = projectContext.clientName || 'Valued Client';
    const projectName = projectContext?.name || 'Untitled Project';
    const projectId = (projectContext as any).id || 'PRJ-0000';
    
    const [handoverDate, setHandoverDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const displayDate = new Date(handoverDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    const handleDownloadPdf = () => {
        const el = document.getElementById('handover-docket-render');
        if (!el) return;

        // Add a temporary class to optimize for PDF generation
        el.classList.add('pdf-generating');
        
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
                margin: [15, 15, 15, 15],
                filename: \`Handover_Docket_\${projectName.replace(/\\s+/g, '_')}.pdf\`,
                image: { type: 'jpeg', quality: 1 },
                html2canvas: { scale: 2, useCORS: true, windowWidth: 1024 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            setTimeout(() => {
                html2pdfObj().set(opt).from(el).save().then(() => {
                    el.classList.remove('pdf-generating');
                });
            }, 300);
        });
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
        const match = settings.projectTerms.warrantyPeriod.match(/(\\d+)/);
        if (match) {
            defaultWarrantyPeriod = settings.projectTerms.warrantyPeriod.toLowerCase().includes('year') ? parseInt(match[1]) * 12 : parseInt(match[1]);
        }
    }

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            <style dangerouslySetInnerHTML={{__html: \`
                @media print {
                    @page { margin: 15mm; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
                .pdf-generating {
                    width: 210mm !important;
                    max-width: 210mm !important;
                    padding: 0 !important;
                }
                .docket-font {
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }
            \`}} />
            
            <div className="flex-none p-6 border-b border-slate-200 bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 z-10 sticky top-0 shadow-sm print:hidden">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 docket-font">
                        Handover Docket & Warranty
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Formal completion certificate, warranty terms, and care guidelines.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 mr-2 bg-slate-50 px-3 py-1.5 rounded border border-slate-200">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Date:</label>
                        <input 
                            type="date" 
                            value={handoverDate}
                            onChange={(e) => setHandoverDate(e.target.value)}
                            className="text-sm border-none bg-transparent focus:ring-0 p-0 text-slate-800 font-medium cursor-pointer"
                        />
                    </div>
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-50 transition-colors"
                    >
                        <Printer className="w-4 h-4" />
                        Print
                    </button>
                    <button
                        onClick={handleDownloadPdf}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded hover:bg-slate-800 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Download PDF
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center pb-24 print:p-0 print:pb-0 print:bg-white">
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
                                <p className="text-lg font-black text-slate-900 uppercase tracking-widest m-0">Handover Docket</p>
                            </div>
                        </div>

                        {/* Certificate Banner Layout */}
                        <div className="text-center py-6 mb-10">
                            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-[0.2em] text-slate-900 mb-4">Certificate of Completion</h1>
                            <div className="inline-flex items-center justify-center border border-slate-200 bg-slate-50 px-6 py-2">
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
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1.5">Date of Handover</div>
                                <div className="font-semibold text-slate-900 text-[13px]">{displayDate}</div>
                            </div>
                        </div>

                        {/* Practical Completion Statement */}
                        <div className="mb-10">
                            <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-[0.15em] mb-4 flex items-center gap-3">
                                <span className="w-6 h-[2px] bg-[#C6A96C]"></span>
                                1. Practical Completion
                            </h4>
                            <p className="text-[13px] leading-relaxed text-slate-700 pl-9">
                                This document serves as the formal handover and closure of the interior execution phase for the project referenced above. By signing this document, all parties acknowledge that the works have been executed as per the agreed design intent and scope, and the site is handed over in a satisfactory, ready-to-use condition.
                            </p>
                        </div>

                        {/* Closure Checklist */}
                        <div className="mb-12">
                            <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-[0.15em] mb-4 flex items-center gap-3">
                                <span className="w-6 h-[2px] bg-[#C6A96C]"></span>
                                2. Closure Checklist
                            </h4>
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
                        </div>

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
                            <p>{orgData?.contactEmail ? \`E: \${orgData.contactEmail}\` : ''} {orgData?.contactPhone ? \` | T: \${orgData.contactPhone}\` : ''}</p>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
`

fs.writeFileSync('/app/applet/components/client/HandoverDocketPage.tsx', content);
