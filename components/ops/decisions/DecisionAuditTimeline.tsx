import React from 'react';
import { ShieldCheck, Plus, FileText, Mail, Check, X, Clock } from 'lucide-react';
import type { DecisionData } from '../../../services/decisionsService';

/**
 * Everything that has happened to one decision, in order.
 *
 * Moved out of the Decisions screen unchanged. It reads only the record and a
 * date formatter, so it never belonged in a file that also owns the ledger,
 * the form and every modal.
 */
export default function DecisionAuditTimeline({
  decision,
  formatDate,
}: {
  decision: DecisionData;
  formatDate: (ts: any) => string;
}) {
  return (
<div className="bg-white p-4 rounded-xl border border-slate-200">
    <h6 className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 mb-3 flex items-center gap-1.5">
        <ShieldCheck className="w-4 h-4 text-emerald-600"/> Digital Audit Trail & Signoff Timeline
    </h6>
    <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
        {/* Event 1: Logged */}
        <div className="flex gap-3 text-xs items-start">
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border-2 border-white shadow-sm z-10">
                <Plus className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div>
                <p className="font-bold text-slate-700">Decision Logged on Site</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                    Logged by Designer on {formatDate(decision.createdAt)}
                    {decision.presentees && ` · Present: ${decision.presentees}`}
                </p>
            </div>
        </div>

        {/* Event 2: Drawing uploaded (conditional) */}
        {decision.drawingURL && (
            <div className="flex gap-3 text-xs items-start">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0 border-2 border-white shadow-sm z-10">
                    <FileText className="w-3.5 h-3.5 text-amber-700" />
                </div>
                <div>
                    <p className="font-bold text-slate-700">Technical Drawing Linked</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                        Drawing uploaded & composite signoff token initialized on {formatDate(decision.drawingUploadedAt || decision.createdAt)}
                    </p>
                </div>
            </div>
        )}

        {/* Event 3: Client Notification Outbound */}
        {decision.notifiedAt && (
            <div className="flex gap-3 text-xs items-start">
                <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center shrink-0 border-2 border-white shadow-sm z-10">
                    <Mail className="w-3.5 h-3.5 text-[#334486]" />
                </div>
                <div>
                    <p className="font-bold text-slate-700">Client Notified via System Portal</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                        Dispatched on {formatDate(decision.notifiedAt)} · Status: <span className="font-bold text-[#3D52A0]">{decision.emailStatus || 'Sent'}</span>
                    </p>
                </div>
            </div>
        )}

        {/* Event 4: Signoff Status */}
        {decision.status === 'signed' && decision.signoff ? (
            <div className="flex gap-3 text-xs items-start">
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 border-2 border-white shadow-sm z-10">
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-100 flex-1">
                    <p className="font-bold text-emerald-800">Formal Electronic Signoff Cleared</p>
                    <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                        Legally Signed by: {decision.signoff.clientNameEntered || decision.clientName}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1 font-mono">
                        Stamp: {formatDate(decision.signoff.respondedAt)} · IP: {decision.signoff.ipAddress || 'Verified'}
                    </p>
                </div>
            </div>
        ) : decision.status === 'disputed' && decision.signoff ? (
            <div className="flex gap-3 text-xs items-start">
                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0 border-2 border-white shadow-sm z-10">
                    <X className="w-3.5 h-3.5 text-red-700" />
                </div>
                <div className="bg-red-50 p-2.5 rounded-lg border border-red-100 flex-1">
                    <p className="font-bold text-red-800">Client Raised Query / Blocked change</p>
                    <p className="text-sm font-semibold text-red-700 mt-1 italic">
                        "{decision.signoff.queryText || 'Query raised without text comments.'}"
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                        Logged: {formatDate(decision.signoff.respondedAt)} · Action required: Upload revised drawings/cost.
                    </p>
                </div>
            </div>
        ) : decision.studioReply ? (
            /* An answered query. Without this the trail shows a question and
               then silence, as though nobody ever replied. */
            <div className="flex gap-3 text-xs items-start">
                <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center shrink-0 border-2 border-white shadow-sm z-10">
                    <Mail className="w-3.5 h-3.5 text-[#334486]" />
                </div>
                <div className="bg-sky-50 p-2.5 rounded-lg border border-sky-100 flex-1">
                    <p className="font-bold text-[#334486]">You answered the query</p>
                    <p className="text-sm font-medium text-slate-700 mt-1">{decision.studioReply}</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                        Sent back for sign-off on {formatDate(decision.studioRepliedAt)}
                    </p>
                </div>
            </div>
        ) : (
            <div className="flex gap-3 text-xs items-start">
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border-2 border-white shadow-sm z-10 animate-pulse">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div>
                    <p className="font-bold text-slate-500">Awaiting Client Approval</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                        Client signature pending. Use the share button above to send instant approval link via WhatsApp.
                    </p>
                </div>
            </div>
        )}
    </div>
</div>
  );
}
