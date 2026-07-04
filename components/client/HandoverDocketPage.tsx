import React, { useState } from 'react';
import { ProjectContext } from '../../types';
import { Download, ShieldCheck } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import { StudioDocumentShell } from '../ops/documents/StudioDocumentShell';

interface HandoverDocketPageProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

export default function HandoverDocketPage({ projectContext }: HandoverDocketPageProps) {
    const { orgData } = useOrg();

    const studioName = orgData?.name || 'Form Factors Design Studio';
    const clientName = projectContext.clientName || 'Valued Client';
    const projectName = projectContext.name || 'Untitled Project';
    
    // Instead of letting the user change the handover date, we will just lock it to today for generation
    const displayDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    const handleDownloadPdf = () => {
        const el = document.getElementById('handover-docket-render');
        if (!el) return;

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
                margin: 0,
                filename: `Handover_Docket_${projectName.replace(/\s+/g, '_')}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            setTimeout(() => {
                html2pdfObj().set(opt).from(el).save();
            }, 300);
        });
    };

    // Construct rooms array 
    const completedRooms = projectContext.rooms?.map(room => ({
        name: room.name,
        scope: (room as any).scope?.join(', ') || 'Standard scope items'
    })) || [];

    const snags = projectContext.siteUpdates?.filter(u => (u.type as any) === 'snag') || [];
    
    const termsConfig = projectContext.engagement?.lockedSnapshot?.termsSettings || 
                        (projectContext.termsDockets && projectContext.termsDockets.length > 0 
                            ? projectContext.termsDockets[projectContext.termsDockets.length - 1].snapshotTermsConfig 
                            : null);

    const defaultWarrantyPeriod = termsConfig?.warrantyPeriods?.[0]?.months || 6;

    const totalSnags = snags.length;
    const closedSnags = snags.filter(s => (s as any).status === 'resolved' || (s as any).status === 'acknowledged').length;
    const isSnagClosed = totalSnags === 0 || totalSnags === closedSnags;

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            <div className="flex-none p-6 border-b border-slate-200 bg-white flex justify-between items-center z-10 sticky top-0 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <ShieldCheck className="w-6 h-6 text-emerald-600" />
                        Handover Docket &amp; Warranty
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Generate formal handover documentation and warranty certificate based on project progress.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleDownloadPdf}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded hover:bg-slate-700 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Download PDF
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center pb-24">
                <div id="handover-docket-render" className="w-full">
                    <StudioDocumentShell orgData={orgData} docHeaderType="Handover Docket" docHeaderTitle={projectName}>
                        <div className="space-y-8 text-sm text-[#0F172A]" style={{ fontFamily: 'var(--font-sans)' }}>
                            <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 border border-slate-200 rounded-lg">
                                <div>
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Client Name</div>
                                    <div className="font-semibold">{clientName}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Project</div>
                                    <div className="font-semibold">{projectName}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Handover Date</div>
                                    <div className="font-semibold">{displayDate}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Certificate No.</div>
                                    <div className="font-semibold font-mono text-emerald-700">FFDS-WC-{new Date().getFullYear()}-712</div>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">A. Handover Gate Verification</h4>
                                <table className="w-full text-left text-[11px] border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50">
                                            <th className="py-2 px-3">Condition</th>
                                            <th className="py-2 px-3 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3"><strong>Final Payment Cleared</strong> - 10% Completion &amp; Handover</td>
                                            <td className="py-2 px-3 text-right"><span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md font-bold">VERIFIED</span></td>
                                        </tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3"><strong>Snag List Closed</strong> - {closedSnags} of {totalSnags || '0'} items resolved</td>
                                            <td className="py-2 px-3 text-right">
                                                <span className={`px-2 py-1 ${isSnagClosed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} rounded-md font-bold`}>
                                                    {isSnagClosed ? 'VERIFIED' : 'PENDING'}
                                                </span>
                                            </td>
                                        </tr>
                                        <tr className="border-b border-slate-100">
                                            <td className="py-2 px-3"><strong>Scope Additions Settled</strong> - All extra works cleared</td>
                                            <td className="py-2 px-3 text-right"><span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md font-bold">VERIFIED</span></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div>
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">B. Room-Wise Scope Completion</h4>
                                <table className="w-full text-left text-[11px] border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50">
                                            <th className="py-2 px-3">Room</th>
                                            <th className="py-2 px-3">Completed Scope</th>
                                            <th className="py-2 px-3 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {completedRooms.length > 0 ? completedRooms.map((r, i) => (
                                            <tr key={i} className="border-b border-slate-100">
                                                <td className="py-2 px-3 font-semibold">{r.name}</td>
                                                <td className="py-2 px-3 text-slate-600">{r.scope}</td>
                                                <td className="py-2 px-3 text-right"><span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md font-bold">COMPLETE</span></td>
                                            </tr>
                                        )) : (
                                            <tr className="border-b border-slate-100">
                                                <td colSpan={3} className="py-4 text-center text-slate-500">No rooms mapped in scope.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div>
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">C. Warranty Certificate</h4>
                                <div className="p-6 border-2 border-[#C6A96C] rounded-lg relative overflow-hidden bg-[#faf8f5]">
                                    <div className="absolute -top-4 -right-4 w-24 h-24 bg-[#F3ECDD] rounded-full flex items-center justify-center border-4 border-white shadow-sm">
                                        <div className="text-center">
                                            <div className="text-[10px] font-bold text-[#8A6D2F] uppercase">Warranty</div>
                                            <div className="text-lg font-black text-[#1E3A8A] leading-tight">{defaultWarrantyPeriod} MO</div>
                                        </div>
                                    </div>
                                    <div className="mb-4">
                                        <div className="text-sm font-bold tracking-widest text-[#1E3A8A] uppercase">{studioName}</div>
                                        <div className="text-lg font-black text-slate-900 mt-1">WARRANTY CERTIFICATE</div>
                                    </div>
                                    <div className="text-[11px] text-slate-600 space-y-4 pr-16">
                                        <p>This certifies that the interior works executed at <strong>{projectName}</strong> for <strong>{clientName}</strong> are covered under the warranty schedule below.</p>
                                        
                                        <div>
                                            <strong className="block text-slate-900 mb-1">Coverage</strong>
                                            <p>Workmanship defects in executed carpentry, installation, finishing, and agreed trade works under normal usage for a period of {defaultWarrantyPeriod} months from Handover Date.</p>
                                        </div>
                                        
                                        <div>
                                            <strong className="block text-slate-900 mb-1">Exclusions</strong>
                                            <p>Misuse, negligence, overloading, impact damage, scratches, dents, stains, burns, chemical damage, water damage, pest/termite damage, unauthorised modifications, or third-party work.</p>
                                        </div>

                                        <div>
                                            <strong className="block text-slate-900 mb-1">Third-Party Products</strong>
                                            <p>Covered as per manufacturer warranty (lights, appliances, hardware, fittings, sanitaryware). Client-supplied items are not covered under {studioName} warranty.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-8">
                                <h4 className="font-bold border-b-2 border-slate-200 pb-2 mb-4 uppercase tracking-wide text-xs text-slate-500">D. Sign-off</h4>
                                <p className="text-[11px] text-slate-600 mb-8">We, the undersigned, confirm that the works described in this docket have been completed, inspected, and handed over in good condition. This sign-off activates the enclosed Warranty Certificate.</p>
                                
                                <div className="grid grid-cols-2 gap-12">
                                    <div>
                                        <div className="h-12 border-b border-slate-300"></div>
                                        <div className="mt-2 text-[11px] font-bold">Client: {clientName}</div>
                                        <div className="text-[10px] text-slate-500">Date &amp; Place</div>
                                    </div>
                                    <div>
                                        <div className="h-12 border-b border-slate-300"></div>
                                        <div className="mt-2 text-[11px] font-bold">For {studioName}</div>
                                        <div className="text-[10px] text-slate-500">Authorised Signatory</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </StudioDocumentShell>
                </div>
            </div>
        </div>
    );
}
