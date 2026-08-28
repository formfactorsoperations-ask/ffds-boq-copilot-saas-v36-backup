import React, { useState, useMemo } from 'react';
import { ProjectContext } from '../../types';
import { useOrg } from '../../contexts/OrgContext';
import { Download, Printer, ArrowLeft, ClipboardCheck, Check, Bolt } from 'lucide-react';
import { StudioDocumentShell } from '../ops/documents/StudioDocumentShell';
import { prepareClonedDocForPdf } from '../../lib/pdfUtils';

interface QualityChecklistReportPageProps {
    projectContext: ProjectContext;
    onBack?: () => void;
}

const STANDARD_CHECKS = [
    { id: 'paint', label: 'Final Paint Touch-ups (Skirting, Grooves & Cornice)', category: 'Finishes & Paint' },
    { id: 'hardware', label: 'Cabinet Shutters Aligned & Hardware Tightened', category: 'Woodwork & Hardware' },
    { id: 'clean', label: 'Deep Cleaning (Inside Cabinets, Drawers & Floors)', category: 'Cleaning & Handover' },
    { id: 'electrical', label: 'All Switchboards Clean, Straight & Plate Covers Snapped', category: 'Electrical & Fixtures' },
    { id: 'plumbing', label: 'Angle Cocks, Faucets & Drain Lines Leak-tested', category: 'Plumbing & Sanitary' },
    { id: 'debris', label: 'Site Debris Cleared & Surface Protection Removed', category: 'Cleaning & Handover' },
];

export default function QualityChecklistReportPage({ projectContext, onBack }: QualityChecklistReportPageProps) {
    const { orgData } = useOrg();
    const [isDownloading, setIsDownloading] = useState(false);

    const clientName = projectContext?.clientName || 'Valued Client';
    const projectName = projectContext?.name || 'Untitled Project';

    // Resolve persistent state values cleanly and defensively
    const checkedState = (projectContext?.qualityChecklist?.checkedState && typeof projectContext.qualityChecklist.checkedState === 'object')
        ? projectContext.qualityChecklist.checkedState
        : {};
    const elecVerified = (projectContext?.qualityChecklist?.elecVerified && typeof projectContext.qualityChecklist.elecVerified === 'object')
        ? projectContext.qualityChecklist.elecVerified
        : {};
    const customChecks = Array.isArray(projectContext?.qualityChecklist?.customChecks)
        ? projectContext.qualityChecklist.customChecks
        : [];
    const notesState = (projectContext?.qualityChecklist?.notesState && typeof projectContext.qualityChecklist.notesState === 'object')
        ? projectContext.qualityChecklist.notesState
        : {};
    const naState = (projectContext?.qualityChecklist?.naState && typeof projectContext.qualityChecklist.naState === 'object')
        ? projectContext.qualityChecklist.naState
        : {};
    const rooms = useMemo(() => {
        return (projectContext?.rooms || []).filter((r): r is NonNullable<typeof r> => r !== null && r !== undefined && typeof r === 'object');
    }, [projectContext?.rooms]);

    // Helper to calculate total electrical points per room from plan
    const roomElectricalCounts = useMemo(() => {
        const counts: Record<string, { total: number; items: { name: string; qty: number }[] }> = {};
        const plan = projectContext?.electricalPointsPlan || [];
        
        plan.forEach(ep => {
            if (!ep) return;
            const rId = ep.roomId || 'unassigned';
            if (!counts[rId]) {
                counts[rId] = { total: 0, items: [] };
            }
            const qty = typeof ep.qty === 'number' ? ep.qty : parseInt(ep.qty as any) || 0;
            counts[rId].total += (isNaN(qty) ? 0 : qty);
            
            const epItemName = ep.item || '';
            const existing = counts[rId].items.find(i => i.name === epItemName);
            if (existing) {
                existing.qty += (isNaN(qty) ? 0 : qty);
            } else {
                counts[rId].items.push({ name: epItemName, qty: (isNaN(qty) ? 0 : qty) });
            }
        });
        return counts;
    }, [projectContext?.electricalPointsPlan]);

    // Group checks by room for calculations
    const roomSummaries = useMemo(() => {
        return rooms.map(room => {
            const rId = room.id || room.name;
            const roomChecks = (checkedState[rId] && typeof checkedState[rId] === 'object') ? checkedState[rId] : {};
            const roomNAs = (naState[rId] && typeof naState[rId] === 'object') ? naState[rId] : {};
            
            const applicableStandardChecks = STANDARD_CHECKS.filter(c => !roomNAs[c.id]);
            const standardCheckedCount = applicableStandardChecks.filter(c => !!roomChecks[c.id]).length;
            
            const roomCustoms = customChecks.filter(c => c && c.roomId === rId);
            const customCheckedCount = roomCustoms.filter(c => c.checked).length;
            
            const totalChecksCount = applicableStandardChecks.length + roomCustoms.length;
            const checkedCount = standardCheckedCount + customCheckedCount;
            const pct = totalChecksCount > 0 ? Math.round((checkedCount / totalChecksCount) * 100) : 100;
            const isElecVerified = !!elecVerified[rId];

            return {
                id: rId,
                name: room.name,
                totalChecksCount,
                checkedCount,
                pct,
                isElecVerified,
                electricalCount: roomElectricalCounts[rId]?.total || 0,
                electricalBreakdown: roomElectricalCounts[rId]?.items || [],
                customs: roomCustoms,
                notes: notesState[rId] || ''
            };
        });
    }, [rooms, checkedState, customChecks, elecVerified, roomElectricalCounts, notesState, naState]);

    // Project Overall Stats
    const overallStats = useMemo(() => {
        let total = 0;
        let checked = 0;
        
        roomSummaries.forEach(s => {
            total += s.totalChecksCount;
            checked += s.checkedCount;
        });

        const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
        const totalElectricalPoints = (Object.values(roomElectricalCounts) as any[]).reduce((sum, current) => sum + (current.total || 0), 0);

        return {
            total,
            checked,
            pct,
            totalElectricalPoints
        };
    }, [roomSummaries, roomElectricalCounts]);

    const handleDownloadPdf = async () => {
        const el = document.getElementById('quality-checklist-document-render');
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
                filename: `Quality_Checklist_Report_${projectName.replace(/\s+/g, '_')}.pdf`,
                image: { type: 'jpeg', quality: 1 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc, 'quality-checklist-document-render')
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
                            className="p-2 hover:bg-slate-50 border border-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                            title="Back"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div>
                        <div className="flex items-center gap-2">
                            <ClipboardCheck className="w-4 h-4 text-slate-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">QUALITY ASSURANCE HUB</span>
                        </div>
                        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight font-['Plus_Jakarta_Sans'] leading-tight mt-1">
                            Quality & Handover Checklist
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                        onClick={() => window.print()}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-slate-200 cursor-pointer"
                    >
                        <Printer className="w-4 h-4" />
                        Print Report
                    </button>
                    <button
                        onClick={handleDownloadPdf}
                        disabled={isDownloading}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] disabled:bg-sky-400 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-md shadow-sky-600/15 cursor-pointer"
                    >
                        <Download className="w-4 h-4" />
                        {isDownloading ? 'Generating PDF...' : 'Download PDF'}
                    </button>
                </div>
            </div>

            {/* A4 Page View */}
            <div className="flex justify-center p-2 sm:p-4 bg-slate-50/60 rounded-[24px] border border-[#EBEAE5]">
                <div id="quality-checklist-document-render" className="w-full bg-white flex justify-center">
                    <StudioDocumentShell
                        orgData={orgData || { orgName: 'FORM FACTORS DESIGN STUDIO' } as any}
                        docHeaderType="Quality Assurance & Site Handover Docket"
                        docHeaderTitle={`Pre-Handover Site Inspection\nProject: ${projectName}`}
                    >
                        <div className="space-y-8 text-[#1E293B] font-['Plus_Jakarta_Sans'] text-sm">
                            
                            {/* Project Header Metadata (Sober Ink & Slate) */}
                            <div className="border-b border-[#D9D6CC] pb-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-xs">
                                    <div className="space-y-2">
                                        <div className="flex justify-between py-1 border-b border-slate-100">
                                            <span className="text-slate-400 uppercase font-bold tracking-wider text-[9px]">Client Name</span>
                                            <span className="font-semibold text-slate-900">{clientName}</span>
                                        </div>
                                        <div className="flex justify-between py-1 border-b border-slate-100">
                                            <span className="text-slate-400 uppercase font-bold tracking-wider text-[9px]">Project Name</span>
                                            <span className="font-semibold text-slate-900">{projectName}</span>
                                        </div>
                                        <div className="flex justify-between py-1 border-b border-slate-100">
                                            <span className="text-slate-400 uppercase font-bold tracking-wider text-[9px]">Inspection Date</span>
                                            <span className="font-semibold text-slate-900">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between py-1 border-b border-slate-100">
                                            <span className="text-slate-400 uppercase font-bold tracking-wider text-[9px]">Inspected Checkpoints</span>
                                            <span className="font-semibold text-slate-900">{overallStats.checked} / {overallStats.total} ({overallStats.pct}% Verified)</span>
                                        </div>
                                        <div className="flex justify-between py-1 border-b border-slate-100">
                                            <span className="text-slate-400 uppercase font-bold tracking-wider text-[9px]">Total Electrical Nodes</span>
                                            <span className="font-semibold text-slate-900">{overallStats.totalElectricalPoints} Nodes Planned</span>
                                        </div>
                                        <div className="flex justify-between py-1 border-b border-slate-100">
                                            <span className="text-slate-400 uppercase font-bold tracking-wider text-[9px]">Quality Standard</span>
                                            <span className="font-semibold text-emerald-700">FFDS Zero-Snag Target</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Checklist Audit Breakdown */}
                            <div className="space-y-8">
                                <h3 className="text-xs font-black uppercase tracking-widest text-[#6F7F52] border-b-2 border-[#D9D6CC] pb-2">
                                    Zone-by-Zone Quality Audits
                                </h3>

                                <div className="space-y-8">
                                    {roomSummaries.map((room) => {
                                        return (
                                            <div key={room.id} className="space-y-4 pb-6 border-b border-slate-100 last:border-b-0 last:pb-0 page-break-avoid" style={{ pageBreakInside: 'avoid' }}>
                                                {/* Room Header with clean thin gold line */}
                                                <div className="flex justify-between items-baseline border-b border-[#FAF9F6] pb-1">
                                                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                                        {room.name}
                                                    </h4>
                                                    <span className="text-[10px] font-bold text-slate-500">
                                                        {room.checkedCount} / {room.totalChecksCount} Cleared ({room.pct}%)
                                                    </span>
                                                </div>

                                                {/* Checklist Grid */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
                                                    {/* Standard Checks */}
                                                    {STANDARD_CHECKS.map((check) => {
                                                        const roomChecks = (checkedState[room.id] && typeof checkedState[room.id] === 'object') ? checkedState[room.id] : {};
                                                        const roomNAs = (naState[room.id] && typeof naState[room.id] === 'object') ? naState[room.id] : {};
                                                        const isChecked = !!roomChecks[check.id];
                                                        const isNA = !!roomNAs[check.id];
                                                        return (
                                                            <div key={check.id} className="flex items-start gap-2.5 text-xs">
                                                                <div className={`w-3.5 h-3.5 border rounded-sm shrink-0 mt-0.5 flex items-center justify-center ${
                                                                    isNA
                                                                        ? 'bg-slate-100 border-slate-300 text-slate-500 font-extrabold text-[7px]'
                                                                        : isChecked 
                                                                            ? 'bg-slate-900 border-slate-900 text-white' 
                                                                            : 'border-slate-300'
                                                                }`}>
                                                                    {isChecked && !isNA && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                                                    {isNA && 'N/A'}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <span className={`leading-snug ${
                                                                        isNA 
                                                                            ? 'text-slate-400 italic' 
                                                                            : isChecked 
                                                                                ? 'text-slate-500 font-medium' 
                                                                                : 'text-slate-700 font-medium'
                                                                    }`}>
                                                                        {check.label} {isNA && <span className="text-[9px] text-slate-400 font-normal italic">(Not Applicable)</span>}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Custom Checks */}
                                                    {Array.isArray(room.customs) && room.customs.filter(Boolean).map((custom) => (
                                                        <div key={custom.id} className="flex items-start gap-2.5 text-xs">
                                                            <div className={`w-3.5 h-3.5 border rounded-sm shrink-0 mt-0.5 flex items-center justify-center ${
                                                                custom.checked ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300'
                                                            }`}>
                                                                {custom.checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <span className={`leading-snug ${custom.checked ? 'text-slate-500 font-medium' : 'text-slate-700 font-medium'}`}>
                                                                    {custom.label} <span className="text-[9px] text-[#6F7F52] font-semibold italic">(Custom)</span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Electrical Points Verification */}
                                                {room.electricalCount > 0 && (
                                                    <div className="bg-[#FAF9F6] border border-slate-200/40 rounded-lg p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <Bolt className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                            <span className="font-semibold text-slate-800">Electrical nodes checklist: {room.electricalCount} points planned</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 font-bold">
                                                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Status:</span>
                                                            <span className={room.isElecVerified ? 'text-emerald-700' : 'text-amber-700'}>
                                                                {room.isElecVerified ? 'Count Verified ✓' : 'Awaiting Final Verification'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Supervisor Notes */}
                                                {room.notes && (
                                                    <div className="bg-[#FAF9F6] border-l-2 border-slate-400 px-3.5 py-2 text-xs">
                                                        <span className="font-black text-[9px] uppercase tracking-wider text-slate-400 block mb-1">Supervisor Remarks</span>
                                                        <p className="text-slate-600 leading-relaxed italic m-0">"{room.notes}"</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Annexure: Electrical Points Log */}
                            {overallStats.totalElectricalPoints > 0 && (
                                <div className="space-y-6 pt-8 border-t border-[#D9D6CC] page-break-before" style={{ pageBreakBefore: 'always' }}>
                                    <h3 className="text-xs font-black uppercase tracking-widest text-[#6F7F52] border-b-2 border-[#D9D6CC] pb-2">
                                        Annexure A: Detailed Electrical Points Plan
                                    </h3>
                                    
                                    <div className="space-y-6">
                                        {roomSummaries.filter(r => r.electricalCount > 0).map(room => (
                                            <div key={`elec-annex-${room.id}`} className="space-y-2" style={{ pageBreakInside: 'avoid' }}>
                                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                                                    <Bolt className="w-3.5 h-3.5 text-amber-500" />
                                                    <span>{room.name} — Electrical Inventory ({room.electricalCount} Points)</span>
                                                </h4>
                                                
                                                <div className="border border-slate-200/60 rounded-xl overflow-hidden bg-white">
                                                    <table className="w-full text-left border-collapse text-xs">
                                                        <thead>
                                                            <tr className="bg-[#FAF9F6] border-b border-slate-200/60 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                                                <th className="py-2 px-3.5 w-1/2">Point / Node Type</th>
                                                                <th className="py-2.5 px-3.5 text-center w-1/6">Qty</th>
                                                                <th className="py-2 px-3.5 w-1/3">Notes / Location Spec</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-150 text-slate-700">
                                                            {(projectContext?.electricalPointsPlan || [])
                                                                .filter(ep => ep.roomId === room.id)
                                                                .map((ep) => (
                                                                    <tr key={ep.id} className="hover:bg-slate-50/50 transition-colors">
                                                                        <td className="py-2 px-3.5 font-semibold text-slate-800">
                                                                            {ep.item || <span className="text-slate-400 italic">Unspecified point</span>}
                                                                        </td>
                                                                        <td className="py-2 px-3.5 text-center font-bold text-slate-900">{ep.qty}</td>
                                                                        <td className="py-2 px-3.5 text-slate-500 italic">
                                                                            {ep.notes ? `"${ep.notes}"` : <span className="text-slate-300">—</span>}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Print-Ready Signature Block */}
                            <div className="pt-12 mt-12 border-t border-[#D9D6CC] grid grid-cols-2 gap-12 page-break-avoid" style={{ pageBreakInside: 'avoid' }}>
                                <div className="space-y-8">
                                    <div className="h-10 border-b border-slate-350"></div>
                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Form Factors Site Supervisor</div>
                                </div>
                                <div className="space-y-8">
                                    <div className="h-10 border-b border-slate-350"></div>
                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Client Sign-off / Representative</div>
                                </div>
                            </div>

                        </div>
                    </StudioDocumentShell>
                </div>
            </div>
        </div>
    );
}
