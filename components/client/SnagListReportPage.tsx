import React, { useState } from 'react';
import { ProjectContext, SnagItem } from '../../types';
import { useOrg } from '../../contexts/OrgContext';
import { Download, Printer, ArrowLeft, ClipboardList, CheckCircle } from 'lucide-react';
import { StudioDocumentShell } from '../ops/documents/StudioDocumentShell';
import { prepareClonedDocForPdf } from '../../lib/pdfUtils';

interface SnagListReportPageProps {
    projectContext: ProjectContext;
    onBack?: () => void;
}

export default function SnagListReportPage({ projectContext, onBack }: SnagListReportPageProps) {
    const { orgData } = useOrg();
    const [isDownloading, setIsDownloading] = useState(false);

    const clientName = projectContext.clientName || 'Valued Client';
    const projectName = projectContext.name || 'Untitled Project';
    const snags = projectContext.snagList || [];

    // Group snags by room
    const snagsByRoom = React.useMemo(() => {
        const grouped: Record<string, SnagItem[]> = {};
        snags.forEach((snag) => {
            const roomName = snag.roomName || 'General / Area Unassigned';
            if (!grouped[roomName]) {
                grouped[roomName] = [];
            }
            grouped[roomName].push(snag);
        });
        return grouped;
    }, [snags]);

    const stats = React.useMemo(() => {
        const total = snags.length;
        const resolved = snags.filter(s => s.status === 'resolved' || s.status === 'verified').length;
        const open = total - resolved;
        const highSeverity = snags.filter(s => s.severity === 'high').length;
        return { total, resolved, open, highSeverity };
    }, [snags]);

    const handleDownloadPdf = async () => {
        const el = document.getElementById('snaglist-document-render');
        if (!el) return;

        setIsDownloading(true);
        try {
            const html2pdfModule = await import('html2pdf.js');
            let html2pdfObj = (html2pdfModule as any).default || html2pdfModule;
            if (html2pdfObj && html2pdfObj.default) {
                html2pdfObj = html2pdfObj.default;
            }

            if (typeof html2pdfObj !== 'function') {
                throw new Error("html2pdf library loaded incorrectly");
            }

            const opt = {
                margin: [15, 0, 15, 0],
                filename: `Defect_Snag_Report_${projectName.replace(/\s+/g, '_')}.pdf`,
                image: { type: 'jpeg', quality: 1 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc, 'snaglist-document-render')
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            await html2pdfObj().set(opt).from(el).save();
            setIsDownloading(false);
        } catch (err) {
            console.error('PDF generation failed', err);
            setIsDownloading(false);
        }
    };

    return (
        <div className="space-y-6 w-full px-4 sm:px-6 lg:px-8 pb-12 animate-in fade-in duration-300">
            {/* Header / Actions bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-[20px] border border-[#EBEAE5] shadow-sm no-print">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-slate-50 border border-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors"
                            title="Back"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div>
                        <div className="flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-slate-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">PROJECT REGISTRY</span>
                        </div>
                        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight font-['Plus_Jakarta_Sans'] leading-tight mt-1">
                            Snag List Document
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                        onClick={() => window.print()}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-slate-200"
                    >
                        <Printer className="w-4 h-4" />
                        Print Report
                    </button>
                    <button
                        onClick={handleDownloadPdf}
                        disabled={isDownloading}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] disabled:bg-sky-400 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-md shadow-sky-600/15"
                    >
                        <Download className="w-4 h-4" />
                        {isDownloading ? 'Generating PDF...' : 'Download PDF'}
                    </button>
                </div>
            </div>

            {/* A4 Page View */}
            <div className="flex justify-center p-2 sm:p-4 bg-slate-50/60 rounded-[24px] border border-[#EBEAE5]">
                <div id="snaglist-document-render" className="w-full bg-white flex justify-center">
                    <StudioDocumentShell
                        orgData={orgData || { orgName: 'FORM FACTORS DESIGN STUDIO' } as any}
                        docHeaderType="Defect & Snag Registry"
                        docHeaderTitle={`Snag List & Defect Report\nProject: ${projectName}`}
                    >
                        <div className="space-y-8 text-[#1E293B] font-['Plus_Jakarta_Sans'] text-sm">
                            
                            {/* Project Header Metadata (Sober Ink & Slate) */}
                            <div className="border-b border-[#D9D6CC] pb-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-xs">
                                    <div className="space-y-2">
                                        <div className="flex justify-between py-1 border-b border-slate-100">
                                            <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Client Name</span>
                                            <span className="font-semibold text-slate-900">{clientName}</span>
                                        </div>
                                        <div className="flex justify-between py-1 border-b border-slate-100">
                                            <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Project Name</span>
                                            <span className="font-semibold text-slate-900">{projectName}</span>
                                        </div>
                                        <div className="flex justify-between py-1 border-b border-slate-100">
                                            <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Date Generated</span>
                                            <span className="font-semibold text-slate-900">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between py-1 border-b border-slate-100">
                                            <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Total Snags Logged</span>
                                            <span className="font-semibold text-slate-900">{stats.total}</span>
                                        </div>
                                        <div className="flex justify-between py-1 border-b border-slate-100">
                                            <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Resolved / Closed</span>
                                            <span className="font-semibold text-slate-900">{stats.resolved}</span>
                                        </div>
                                        <div className="flex justify-between py-1 border-b border-slate-100">
                                            <span className="text-slate-400 uppercase font-bold tracking-wider text-[10px]">Pending Actions</span>
                                            <span className={`font-semibold ${stats.open > 0 ? 'text-slate-900' : 'text-slate-500'}`}>{stats.open}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SOBER BRAND ACCENT (Single Gold Hairline) */}
                            <div className="w-full h-[1px] bg-[#C1A875]" />

                            {/* Snag List Items Grouped by Room */}
                            <div className="space-y-8">
                                <div className="space-y-2">
                                    <h3 className="text-base font-extrabold text-slate-900 uppercase tracking-wide">Registry Details</h3>
                                    <p className="text-xs text-slate-500 leading-relaxed font-light">
                                        The following items represent finish-quality observations, snag issues, and punch list defects logged during site walk-throughs. Resolution must be verified and cleared prior to formal Handover Gate sign-off.
                                    </p>
                                </div>

                                {stats.total === 0 ? (
                                    <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                        <CheckCircle className="w-8 h-8 text-emerald-500/80 mx-auto mb-2" />
                                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">No Outstanding Defect Snags</p>
                                        <p className="text-[11px] text-slate-400 mt-1">This project holds a clean finish-quality registry.</p>
                                    </div>
                                ) : (
                                    (Object.entries(snagsByRoom) as [string, SnagItem[]][]).map(([roomName, roomSnags]) => (
                                        <div key={roomName} className="space-y-3">
                                            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                                                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{roomName}</h4>
                                                <span className="text-xs text-slate-500 font-medium">{roomSnags.length} Item(s)</span>
                                            </div>

                                            <table className="w-full border-collapse text-xs text-left">
                                                <thead>
                                                    <tr className="border-b border-slate-200 text-[#64748B] font-bold uppercase tracking-wider text-[9px] bg-slate-50/80">
                                                        <th className="py-2.5 px-2 w-16">Ref</th>
                                                        <th className="py-2.5 px-3">Observation & Location</th>
                                                        <th className="py-2.5 px-3 w-28">Trade / Cat</th>
                                                        <th className="py-2.5 px-3 w-20 text-center">Severity</th>
                                                        <th className="py-2.5 px-3 w-24 text-center">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {roomSnags.map((snag, idx) => {
                                                        const dateStr = snag.raisedAt ? new Date(snag.raisedAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' }) : '-';
                                                        return (
                                                            <React.Fragment key={snag.id}>
                                                                <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                                                    <td className="py-3 px-2 font-mono text-slate-500 text-[10px]">{`SN-${dateStr.replace('/', '')}-${String(idx + 1).padStart(2, '0')}`}</td>
                                                                    <td className="py-3 px-3">
                                                                        <div className="font-semibold text-slate-900 leading-snug">{snag.description}</div>
                                                                        {snag.notes && (
                                                                            <div className="text-[11px] text-slate-500 font-normal mt-1 leading-normal italic">
                                                                                Obs: {snag.notes}
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-3 px-3 text-slate-600 font-medium">
                                                                        {snag.assignedTo || 'Unassigned'}
                                                                    </td>
                                                                    <td className="py-3 px-3 text-center text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                                                                        {snag.severity}
                                                                    </td>
                                                                    <td className="py-3 px-3 text-center font-bold text-[10px] uppercase tracking-wider">
                                                                        {snag.status === 'resolved' || snag.status === 'verified' ? (
                                                                            <span className="text-slate-800">RESOLVED</span>
                                                                        ) : snag.status === 'in_progress' ? (
                                                                            <span className="text-slate-500 border border-slate-200 rounded px-1.5 py-0.5 font-normal">IN PROGRESS</span>
                                                                        ) : (
                                                                            <span className="text-slate-950 underline decoration-[#C1A875] decoration-2 underline-offset-2">OPEN</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* SIGNATURE SECTION (Sober print-first, avoiding colored highlights) */}
                            <div className="pt-16 mt-16 page-break-avoid">
                                <div className="grid grid-cols-2 gap-12 text-xs">
                                    <div className="space-y-12">
                                        <p className="text-slate-500 uppercase font-black tracking-widest text-[9px]">PREPARED BY (SITE OPERATIONS)</p>
                                        <div className="border-t border-slate-300 pt-2.5 max-w-[240px]">
                                            <p className="font-semibold text-slate-900">{orgData?.orgName || 'FORM FACTORS DESIGN STUDIO'}</p>
                                            <p className="text-slate-400 mt-0.5 text-[10px]">Site Operations & Quality Assurance</p>
                                        </div>
                                    </div>
                                    <div className="space-y-12">
                                        <p className="text-slate-500 uppercase font-black tracking-widest text-[9px]">ACKNOWLEDGED BY (CLIENT)</p>
                                        <div className="border-t border-slate-300 pt-2.5 max-w-[240px]">
                                            <p className="font-semibold text-slate-900">{clientName}</p>
                                            <p className="text-slate-400 mt-0.5 text-[10px]">Signee Client Acknowledgment</p>
                                        </div>
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
