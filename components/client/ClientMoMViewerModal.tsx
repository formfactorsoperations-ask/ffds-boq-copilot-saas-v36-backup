import React, { useState, useRef } from 'react';
import { db } from '../../services/firebaseClient';
import { doc, updateDoc } from 'firebase/firestore';
import {
    X,
    CheckCircle,
    CheckCircle2,
    Calendar,
    Clock,
    User,
    Users,
    Download,
    FileText,
    ShieldCheck,
    AlertCircle,
    Building2,
    Check
} from 'lucide-react';
import { MOM } from '../../types';

interface ClientMoMViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    mom: any | null;
    studioName?: string;
    projectName?: string;
    clientName?: string;
    studioId?: string;
    projectId?: string;
    onAcknowledgeSuccess?: (updatedMom: any) => void;
}

export const ClientMoMViewerModal: React.FC<ClientMoMViewerModalProps> = ({
    isOpen,
    onClose,
    mom,
    studioName = 'Design Studio',
    projectName = 'Project Workspace',
    clientName = 'Client',
    studioId,
    projectId,
    onAcknowledgeSuccess
}) => {
    const [ackName, setAckName] = useState(clientName || '');
    const [acking, setAcking] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [localMom, setLocalMom] = useState<any | null>(null);
    const documentRef = useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        setLocalMom(mom);
        if (clientName) {
            setAckName(clientName);
        }
    }, [mom, clientName]);

    if (!isOpen || !localMom) return null;

    const currentMom = localMom;
    const isAcknowledged = currentMom.status === 'acknowledged' || !!currentMom.acknowledgedAt;

    // Normalizing attendees
    const rawAttendees = currentMom.attendees || [];
    const clientAttendees: string[] = [];
    const studioAttendees: string[] = [];
    const otherAttendees: string[] = [];

    rawAttendees.forEach((att: any) => {
        const name = typeof att === 'string' ? att : (att.name || att.email || 'Participant');
        const side = typeof att === 'object' ? att.side : 'unknown';
        const lowerName = name.toLowerCase();

        if (side === 'client' || (clientName && lowerName.includes(clientName.toLowerCase()))) {
            clientAttendees.push(name);
        } else if (side === 'ffds' || side === 'studio' || lowerName.includes('pm') || lowerName.includes('lead') || lowerName.includes('designer') || lowerName.includes('architect')) {
            studioAttendees.push(name);
        } else {
            // Default split if unspecified
            if (studioAttendees.length === 0 && clientAttendees.length > 0) {
                studioAttendees.push(name);
            } else {
                clientAttendees.push(name);
            }
        }
    });

    // Decisions
    const rawDecisions = currentMom.decisions || currentMom.momData?.decisions || [];
    const decisions = rawDecisions.map((d: any, idx: number) => {
        if (typeof d === 'string') return { id: `d-${idx}`, text: d };
        return { id: d.id || `d-${idx}`, text: d.text || d.decision || d.title || '' };
    }).filter((d: any) => d.text && d.text.trim().length > 0);

    // Action Items
    const rawActions = currentMom.actionItems || currentMom.momData?.actionItems || currentMom.momData?.actions || currentMom.momData?.blockers || [];
    const actionItems = rawActions.map((a: any, idx: number) => {
        if (typeof a === 'string') {
            return {
                id: `a-${idx}`,
                text: a,
                owner: 'Team',
                dueDate: null,
                flags: {}
            };
        }
        return {
            id: a.id || `a-${idx}`,
            text: a.text || a.task || a.action || a.title || a.description || 'Action item',
            owner: a.ownerName || a.owner || 'Project Lead',
            dueDate: a.dueDate || a.targetDate || null,
            status: a.status || 'open',
            flags: a.flags || {}
        };
    }).filter((a: any) => a.text && a.text.trim().length > 0);

    // Discussion Notes
    const rawNotes = currentMom.notes || currentMom.momData?.notes || [];
    const discussionNotes: string[] = [];
    if (Array.isArray(rawNotes)) {
        rawNotes.forEach((n: any) => {
            if (typeof n === 'string' && n.trim()) discussionNotes.push(n.trim());
            else if (n && n.text && n.text.trim()) discussionNotes.push(n.text.trim());
        });
    } else if (typeof rawNotes === 'string' && rawNotes.trim()) {
        discussionNotes.push(rawNotes.trim());
    }

    const meetingDate = currentMom.meetingDate || currentMom.date;
    const formattedDate = meetingDate ? new Date(meetingDate?.toDate ? meetingDate.toDate() : meetingDate).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }) : 'Scheduled Date';

    const momRef = currentMom.momRef || `MOM-${new Date(meetingDate || Date.now()).getFullYear()}-${String(currentMom.id || '01').slice(-3).toUpperCase()}`;

    const handleAcknowledge = async () => {
        if (!ackName.trim()) return;
        setAcking(true);
        try {
            const updates = {
                status: 'acknowledged',
                acknowledgedBy: ackName.trim(),
                acknowledgedAt: Date.now(),
                ackChannel: 'client_portal'
            };

            if (studioId && projectId && currentMom.id && db) {
                const momDocRef = doc(db, `organizations/${studioId}/projects/${projectId}/moms`, currentMom.id);
                await updateDoc(momDocRef, updates);
            }

            const updated = { ...currentMom, ...updates };
            setLocalMom(updated);
            if (onAcknowledgeSuccess) {
                onAcknowledgeSuccess(updated);
            }
        } catch (err) {
            console.error("Error acknowledging MoM:", err);
            // Fallback for local update
            const updated = {
                ...currentMom,
                status: 'acknowledged',
                acknowledgedBy: ackName.trim(),
                acknowledgedAt: Date.now()
            };
            setLocalMom(updated);
            if (onAcknowledgeSuccess) onAcknowledgeSuccess(updated);
        } finally {
            setAcking(false);
        }
    };

    const handleDownloadPdf = async () => {
        if (!documentRef.current) return;
        setDownloading(true);
        try {
            const html2pdfModule = await import('html2pdf.js');
            let html2pdfObj = (html2pdfModule as any).default || html2pdfModule;
            if (html2pdfObj && html2pdfObj.default) html2pdfObj = html2pdfObj.default;
            
            const opt = {
                margin: [10, 10, 10, 10],
                filename: `Minutes_of_Meeting_${momRef}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            await html2pdfObj().set(opt).from(documentRef.current).save();
        } catch (e) {
            console.error("Failed to generate PDF:", e);
            window.print();
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
            <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200/90 flex flex-col max-h-[92vh] overflow-hidden my-auto">
                
                {/* Modal Top Sticky Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-700 font-bold">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-extrabold text-slate-900 text-base">Minutes of Meeting</h3>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                                    {momRef}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium">
                                {studioName} • {projectName}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleDownloadPdf}
                            disabled={downloading}
                            className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                            <Download className="w-3.5 h-3.5 text-slate-500" />
                            {downloading ? 'Exporting...' : 'Download PDF'}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Printable / Viewable Document Area */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                    <div ref={documentRef} className="space-y-6 text-slate-900 bg-white">
                        
                        {/* Document Title & Meta Banner */}
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white shadow-xs space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                                <div>
                                    <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-300">Official Project Record</span>
                                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-0.5">
                                        {currentMom.meetingTitle || currentMom.title || 'Client Design & Execution Review'}
                                    </h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                                        isAcknowledged 
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40' 
                                            : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                                    }`}>
                                        {isAcknowledged ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                                        {isAcknowledged ? 'Acknowledged' : 'Formal Record'}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                                <div>
                                    <p className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Date</p>
                                    <p className="font-bold text-white mt-0.5">{formattedDate}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Reference</p>
                                    <p className="font-bold text-indigo-200 mt-0.5">{momRef}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Project</p>
                                    <p className="font-bold text-white mt-0.5 truncate">{projectName}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Recorded By</p>
                                    <p className="font-bold text-white mt-0.5 truncate">{currentMom.createdBy || currentMom.createdByName || studioName}</p>
                                </div>
                            </div>
                        </div>

                        {/* Attendees List */}
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-3">
                            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                                <Users className="w-4 h-4 text-indigo-600" />
                                Meeting Attendees
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                <div className="space-y-1.5">
                                    <p className="text-[11px] font-bold text-slate-700">Client Team:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {clientAttendees.length > 0 ? (
                                            clientAttendees.map((name, i) => (
                                                <span key={i} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 shadow-2xs">
                                                    {name}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-xs text-slate-500 italic">Client Representatives</span>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <p className="text-[11px] font-bold text-slate-700">Design & Execution Team:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {studioAttendees.length > 0 ? (
                                            studioAttendees.map((name, i) => (
                                                <span key={i} className="px-2.5 py-1 bg-indigo-50 border border-indigo-200/60 rounded-lg text-xs font-semibold text-indigo-900 shadow-2xs">
                                                    {name}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-xs text-slate-500 italic">Design Studio Leads</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Decisions Agreed & Confirmed */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                Confirmed Decisions & Specifications ({decisions.length})
                            </h4>
                            {decisions.length > 0 ? (
                                <div className="space-y-2">
                                    {decisions.map((dec: any, i: number) => (
                                        <div key={dec.id || i} className="p-3.5 bg-emerald-50/40 border border-emerald-200/70 rounded-xl flex items-start gap-3 shadow-2xs">
                                            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                                                ✓
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-xs font-semibold text-emerald-950 leading-relaxed">
                                                    {dec.text}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-500 italic">
                                    No direct decisions locked in this session. General progress review recorded.
                                </div>
                            )}
                        </div>

                        {/* Action Items & Next Steps */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                                Action Items & Next Steps ({actionItems.length})
                            </h4>
                            {actionItems.length > 0 ? (
                                <div className="border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
                                    <table className="w-full text-xs text-left border-collapse">
                                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider">
                                            <tr>
                                                <th className="p-3">Action Item</th>
                                                <th className="p-3 w-28">Responsible</th>
                                                <th className="p-3 w-28 text-right">Target Date</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {actionItems.map((act: any, i: number) => (
                                                <tr key={act.id || i} className="hover:bg-slate-50/60 transition-colors">
                                                    <td className="p-3">
                                                        <div className="font-semibold text-slate-800">{act.text}</div>
                                                        {act.flags?.cost && (
                                                            <span className="inline-block mt-1 px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px] font-bold">
                                                                Cost Impact Clarified
                                                            </span>
                                                        )}
                                                        {act.flags?.drawing && (
                                                            <span className="inline-block mt-1 ml-1 px-2 py-0.5 bg-sky-50 text-sky-800 border border-sky-200 rounded text-[10px] font-bold">
                                                                Drawing Revision
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md font-bold text-[10px] uppercase">
                                                            {act.owner}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right text-slate-500 font-medium">
                                                        {act.dueDate ? new Date(act.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'As Scheduled'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-500 italic">
                                    No pending action items assigned.
                                </div>
                            )}
                        </div>

                        {/* Discussion Highlights / Scope Notes */}
                        {discussionNotes.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                                    Discussion Summary & Notes
                                </h4>
                                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2">
                                    {discussionNotes.map((note, i) => (
                                        <p key={i} className="text-xs text-slate-700 leading-relaxed flex items-start gap-2">
                                            <span className="text-slate-400 font-bold">•</span>
                                            <span>{note}</span>
                                        </p>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Scope Summary Flag */}
                        {currentMom.scopeFlagSummary && (
                            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/80 flex items-start gap-3">
                                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-amber-950">Scope & Variation Note</p>
                                    <p className="text-xs text-amber-900/90 mt-0.5 leading-relaxed">{currentMom.scopeFlagSummary}</p>
                                </div>
                            </div>
                        )}

                        {/* Acknowledgment Stamp */}
                        {isAcknowledged && (
                            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-300/80 flex items-center justify-between gap-4 shadow-2xs">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h5 className="font-extrabold text-emerald-950 text-sm">Officially Acknowledged</h5>
                                        <p className="text-xs text-emerald-800 mt-0.5">
                                            Confirmed by <span className="font-bold">{currentMom.acknowledgedBy || clientName}</span> on{' '}
                                            {currentMom.acknowledgedAt ? new Date(currentMom.acknowledgedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Verified'}.
                                        </p>
                                    </div>
                                </div>
                                <span className="px-3 py-1 bg-emerald-200/80 text-emerald-900 text-[10px] font-black rounded-full uppercase tracking-wider">
                                    Locked Record
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Modal Footer / Client Sign-off Action */}
                <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
                    {!isAcknowledged ? (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
                            <div className="text-left">
                                <p className="text-xs font-bold text-slate-800">Confirm Minutes of Meeting</p>
                                <p className="text-[11px] text-slate-500">Record your formal sign-off for this discussion.</p>
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <input
                                    type="text"
                                    value={ackName}
                                    onChange={(e) => setAckName(e.target.value)}
                                    placeholder="Your Name / Signer"
                                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 w-full sm:w-48"
                                />
                                <button
                                    onClick={handleAcknowledge}
                                    disabled={acking || !ackName.trim()}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                                >
                                    <Check className="w-4 h-4" />
                                    {acking ? 'Signing...' : 'Acknowledge MoM'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between w-full">
                            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                                <CheckCircle className="w-4 h-4 text-emerald-600" />
                                Signed & stored in project document vault.
                            </span>
                            <button
                                onClick={onClose}
                                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
