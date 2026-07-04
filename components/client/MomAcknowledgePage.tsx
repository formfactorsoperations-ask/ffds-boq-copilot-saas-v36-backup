import React, { useEffect, useState, useRef } from 'react';
import { db } from '../../services/firebaseClient';
import { collectionGroup, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { MOM } from '../../types';
import { CheckCircle2, CheckCircle, Calendar, MessageCircle, AlertTriangle } from 'lucide-react';
import { StudioDocumentShell } from '../ops/documents/StudioDocumentShell';

export function MomAcknowledgePage({ token }: { token: string }) {
    const [mom, setMom] = useState<MOM | null>(null);
    const [loading, setLoading] = useState(true);
    const [ackName, setAckName] = useState('');
    const [acking, setAcking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [momPath, setMomPath] = useState<string>('');
    const [orgData, setOrgData] = useState<any>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchMom = async () => {
            try {
                const q = query(collectionGroup(db, 'moms'), where('shareToken', '==', token));
                const qs = await getDocs(q);
                if (!qs.empty) {
                    const docSnap = qs.docs[0];
                    const data = docSnap.data() as MOM;
                    setMom(data);
                    setMomPath(docSnap.ref.path);
                    
                    // Predict Ack name if client attendee exists
                    const clientAtt = data.attendees?.find(a => a.side === 'client');
                    if (clientAtt) setAckName(clientAtt.name);

                    // Fetch org data for PDF layout
                    const parts = docSnap.ref.path.split('/');
                    if (parts[0] === 'organizations') {
                        const orgId = parts[1];
                        const orgSnap = await getDoc(doc(db, 'organizations', orgId));
                        if (orgSnap.exists()) setOrgData(orgSnap.data());
                    }
                } else {
                    setError("MoM link is invalid or expired.");
                }
            } catch (err) {
                console.error(err);
                setError("Failed to load MoM.");
            } finally {
                setLoading(false);
            }
        };
        fetchMom();
    }, [token]);

    const handlePrintPdf = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        // Remove the 'print=true' check so the user can download explicitly by clicking on the button
        if (mom && orgData && contentRef.current) {
            try {
                const html2pdfModule = await import('html2pdf.js');
                let html2pdfObj = (html2pdfModule as any).default || html2pdfModule;
                if (html2pdfObj && html2pdfObj.default) html2pdfObj = html2pdfObj.default;
                
                if (typeof html2pdfObj !== 'function') throw new Error("html2pdf failed: could not resolve function");
                const opt = {
                    margin: 0,
                    filename: `MoM_${mom.momRef}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                html2pdfObj().set(opt).from(contentRef.current).save();
            } catch (e) {
                console.error(e);
            }
        }
    };

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('print') === 'true' && !loading && mom && orgData) {
            handlePrintPdf();
        }
    }, [loading, mom, orgData]);

    const handleAck = async () => {
        if (!ackName.trim() || !mom) return;
        setAcking(true);
        try {
            const updates = {
                status: 'acknowledged',
                acknowledgedBy: ackName,
                acknowledgedAt: Date.now(),
                ackChannel: 'link'
            };
            const momRef = doc(db, momPath);
            await updateDoc(momRef, updates);
            setMom(m => m ? { ...m, ...updates } : null);

        } catch (e) {
            console.error(e);
            alert("Failed to acknowledge. Please try again.");
        } finally {
            setAcking(false);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading Minutes...</div>;
    if (error || !mom) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-red-600 font-bold">{error || "MoM not found"}</div>;

    const urlParams = new URLSearchParams(window.location.search);
    const isPrintMode = urlParams.get('print') === 'true';

    // The actual printable content wrapped in StudioDocumentShell
    // Only visible in DOM, but visually standard
    const DocumentContent = () => (
        <div ref={contentRef} className="w-full">
            {orgData && (
                 <StudioDocumentShell orgData={orgData} docHeaderType="Minutes of Meeting" docHeaderTitle={mom.meetingTitle}>
                     <div className="space-y-6 text-sm text-indigo-900">
                         {/* Attendees */}
                         <div>
                             <h4 className="font-bold border-b border-slate-200 pb-1 mb-2 uppercase tracking-wide text-xs text-slate-500">Attendees</h4>
                             <ul className="list-disc pl-5">
                                 {mom.attendees?.map((a, i) => <li key={i}>{a.name} ({a.side})</li>)}
                             </ul>
                         </div>
                         {/* Decisions */}
                         {mom.decisions && mom.decisions.length > 0 && (
                             <div>
                                 <h4 className="font-bold border-b border-slate-200 pb-1 mb-2 uppercase tracking-wide text-xs text-slate-500">Decisions Recorded</h4>
                                 <ul className="space-y-2">
                                     {mom.decisions.map((d, i) => (
                                         <li key={i} className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" /> <span>{d.text}</span></li>
                                     ))}
                                 </ul>
                             </div>
                         )}
                         {/* Action Items */}
                         {mom.actionItems && mom.actionItems.length > 0 && (
                             <div>
                                 <h4 className="font-bold border-b border-slate-200 pb-1 mb-2 uppercase tracking-wide text-xs text-slate-500">Action Items</h4>
                                 <table className="w-full text-xs text-left border-collapse border border-slate-200">
                                     <thead className="bg-slate-50">
                                         <tr>
                                             <th className="border border-slate-200 p-2">Item</th>
                                             <th className="border border-slate-200 p-2">Owner</th>
                                             <th className="border border-slate-200 p-2">Due Date</th>
                                         </tr>
                                     </thead>
                                     <tbody>
                                         {mom.actionItems.map(a => (
                                             <tr key={a.id}>
                                                 <td className="border border-slate-200 p-2 font-medium">{a.text} {a.flags?.cost ? '(Cost Impact)' : ''}</td>
                                                 <td className="border border-slate-200 p-2 uppercase font-bold">{a.owner}</td>
                                                 <td className="border border-slate-200 p-2">{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '-'}</td>
                                             </tr>
                                         ))}
                                     </tbody>
                                 </table>
                             </div>
                         )}
                         {/* Notes */}
                         {mom.notes && mom.notes.length > 0 && (
                             <div>
                                 <h4 className="font-bold border-b border-slate-200 pb-1 mb-2 uppercase tracking-wide text-xs text-slate-500">Notes</h4>
                                 <ul className="list-disc pl-5">
                                     {mom.notes.map(n => <li key={n.id}>{n.text}</li>)}
                                 </ul>
                             </div>
                         )}
                         
                         {mom.status === 'acknowledged' && (
                             <div className="mt-8 pt-4 border-t-2 border-emerald-100 bg-emerald-50/50 p-4 rounded-lg flex items-start gap-3">
                                 <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" />
                                 <div>
                                     <p className="font-bold text-emerald-800 text-sm">Acknowledged by {mom.acknowledgedBy}</p>
                                     <p className="text-xs text-emerald-600 mt-0.5">Time: {new Date(mom.acknowledgedAt!).toLocaleString()} via {mom.ackChannel}</p>
                                 </div>
                             </div>
                         )}
                     </div>
                 </StudioDocumentShell>
            )}
        </div>
    );

    if (isPrintMode) {
        return (
            <div className="bg-slate-200 min-h-screen py-8 flex justify-center">
                <DocumentContent />
                <div className="fixed top-4 right-4 bg-white p-4 rounded-xl shadow-xl flex flex-col gap-2 no-print">
                   <p className="font-bold text-indigo-900">Generating PDF...</p>
                   <p className="text-xs text-slate-500">Please wait or click download manually.</p>
                   <button onClick={handlePrintPdf} className="bg-indigo-600 text-white rounded px-3 py-1.5 text-sm font-bold mt-2">Download Now</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-8 flex justify-center font-sans">
            <div className="w-full max-w-3xl flex flex-col gap-6">
                
                {mom.status !== 'acknowledged' ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
                        <div className="flex-1">
                            <h3 className="font-bold text-emerald-900 text-lg">Please confirm these minutes are accurate.</h3>
                            <p className="text-emerald-700 text-sm mt-1">If something's off, please reply on WhatsApp.</p>
                        </div>
                        <div className="flex flex-col gap-2 w-full sm:w-auto">
                            <input 
                                type="text" 
                                value={ackName}
                                onChange={e => setAckName(e.target.value)}
                                placeholder="Your Name"
                                className="px-3 py-2 border border-emerald-300 rounded-lg text-sm bg-white"
                            />
                            <button 
                                onClick={handleAck}
                                disabled={acking || !ackName.trim()}
                                className="bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-lg shadow disabled:opacity-50 hover:bg-emerald-700 transition flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 size={18} />
                                {acking ? 'Working...' : '✓ Acknowledge minutes'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white border-2 border-emerald-500 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center text-center">
                        <CheckCircle size={48} className="text-emerald-500 mb-3" />
                        <h3 className="font-bold text-emerald-900 text-xl">Minutes Acknowledged</h3>
                        <p className="text-emerald-700 text-sm mt-1">Confirmed by {mom.acknowledgedBy} at {new Date(mom.acknowledgedAt!).toLocaleString()}</p>
                    </div>
                )}

                {/* Provide a visual container for the user */}
                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                   <DocumentContent />
                </div>
            </div>
        </div>
    );
}
