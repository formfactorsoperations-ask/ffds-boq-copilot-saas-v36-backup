import React, { useState, useRef, useEffect } from 'react';
import { ProjectContext } from '../../types';
import { Camera, Image as ImageIcon, XCircle, Plus, Loader2, Upload, FileText, ChevronDown, ChevronUp, Clock, FileUp, Download, AlertCircle, CheckCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveDecision, updateDecisionPhoto, updateDecisionDrawing, markDecisionNotified, DecisionData, recordManualSignoff, deleteDecision, updateDecisionText } from '../../services/decisionsService';
import { db } from '../../services/firebaseClient';
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { getStorage, ref, uploadString, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getApp } from 'firebase/app';

import { jsPDF } from 'jspdf';
import { sendDecisionNotification, sendSignoffRequest } from '../../services/emailService';
import { useOrg } from '../../contexts/OrgContext';

interface DecisionTrackerProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    projectId: string;
}

export default function DecisionTracker({ projectContext, setProjectContext, projectId }: DecisionTrackerProps) {
    const { orgData } = useOrg();
    const studioId = orgData?.tenantId || 'demo-tenant-01';
    
    const [decisions, setDecisions] = useState<DecisionData[]>([]);
    
    // Form state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [decisionText, setDecisionText] = useState('');
    const [roomName, setRoomName] = useState('');
    const [category, setCategory] = useState<'Site Condition' | 'Client Request' | 'Design Upgrade' | 'Value Engineering'>('Site Condition');
    const [presentees, setPresentees] = useState('');
    const [boqImpact, setBoqImpact] = useState<'none' | 'rate_change' | 'new_item'>('none');
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [activeLinkDecision, setActiveLinkDecision] = useState<string | null>(null);
    const [linkValue, setLinkValue] = useState<string>('');
    const [drawingFile, setDrawingFile] = useState<File | null>(null);

    const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    
    const [deletingDecisionId, setDeletingDecisionId] = useState<string | null>(null);
    const [activeManualSignoffDecision, setActiveManualSignoffDecision] = useState<{id: string, type: 'approved'|'queried'} | null>(null);
    const [manualSignoffText, setManualSignoffText] = useState('');

    const [formError, setFormError] = useState<string | null>(null);
    const [toast, setToast] = useState<{message: string, type: 'error' | 'success'} | null>(null);

    const showToast = (message: string, type: 'error' | 'success' = 'error') => {
        setToast({message, type});
        setTimeout(() => setToast(null), 5000);
    };

    // Fetch decisions from Firestore
    useEffect(() => {
        if (!db || !projectId) return;

        const q = query(
            collection(db, 'projects', projectId, 'decisions'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                hasPendingWrites: doc.metadata.hasPendingWrites,
                ...doc.data()
            } as any));
            setDecisions(fetched);
        }, (err) => console.error("Error fetching decisions:", err));

        return () => unsubscribe();
    }, [projectId]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            setPhotoUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleProvideDriveLink = (decisionId: string) => {
        setExpandedRow(decisionId);
        setActiveLinkDecision(decisionId);
        setLinkValue('');
        setDrawingFile(null);
    };

    const submitDriveLink = async (decisionId: string) => {
        if (!linkValue.trim() && !drawingFile) return;
        
        setIsActionLoading("drawing-" + decisionId);
        try {
            let finalLink = linkValue.trim();
            if (drawingFile) {
                const storage = getStorage(getApp());
                const fileRef = ref(storage, `projects/${projectId}/decisions/${decisionId}/drawing_${Date.now()}_${drawingFile.name}`);
                await uploadBytes(fileRef, drawingFile);
                finalLink = await getDownloadURL(fileRef);
            }

            await updateDecisionDrawing(projectId, decisionId, finalLink);
            setActiveLinkDecision(null);
            setDrawingFile(null);
            setLinkValue('');
        } catch (error: any) {
            console.error("Error saving drawing link:", error);
            showToast("Failed to save drawing link: " + error.message, 'error');
        } finally {
            setIsActionLoading(null);
        }
    };

    const resetForm = () => {
        setDecisionText('');
        setRoomName('');
        setCategory('Site Condition');
        setPresentees('');
        setBoqImpact('none');
        setPhotoUrl(null);
        setIsFormOpen(false);
    };

    const submitForm = async (notifyClient: boolean) => {
        if (!decisionText.trim() || !roomName || !category) return;
        setIsSubmitting(true);
        setFormError(null);

        try {
            const formData = {
                decisionText: decisionText.trim(),
                roomName,
                category,
                presentees: presentees.trim(),
                boqImpact,
                clientName: projectContext.clientName || 'Client',
                clientEmail: projectContext.clientEmail || '',
                projectName: projectContext.name || 'Project'
            };

            const decisionId = await saveDecision(projectId, formData);

            if (photoUrl && photoUrl.startsWith('data:image')) {
                try {
                    const storage = getStorage(getApp());
                    storage.maxUploadRetryTime = 2000;
                    const storageRef = ref(storage, `decisions/${projectId}/${decisionId}/site-photo.jpg`);
                    await uploadString(storageRef, photoUrl, 'data_url');
                    const downloadURL = await getDownloadURL(storageRef);
                    await updateDecisionPhoto(projectId, decisionId, downloadURL);
                } catch (err) {
                    console.warn("Storage upload failed for site photo, falling back to mock URL");
                }
            }

            if (notifyClient) {
                const mailRes = await sendDecisionNotification(decisionId, projectId, studioId);
                if (!mailRes.success) {
                    // Email failed but save succeeded. Let UI list handle "Email Failed" status.
                    // We can still reset the form because the item is saved.
                }
            }
            
            resetForm();
        } catch (error: any) {
            console.error("Error logging decision:", error);
            setFormError(error.message || "Failed to log decision. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNotifyClient = async (decisionId: string) => {
        setIsActionLoading('notify-' + decisionId);
        try {
            const mailRes = await sendDecisionNotification(decisionId, projectId, studioId);
            if (!mailRes.success) {
                showToast("Decision was updated, but email could not be sent: " + mailRes.error, 'error');
            } else {
                showToast("Client notified.", 'success');
            }
        } catch(e: any) {
            console.error("Error notifying client", e);
            showToast("Failed: " + e.message, 'error');
        } finally {
            setIsActionLoading(null);
        }
    };

    const handleSendSignoff = async (decisionId: string) => {
        setIsActionLoading('signoff-' + decisionId);
        try {
            const mailRes = await sendSignoffRequest(decisionId, projectId, studioId);
            if (!mailRes.success) {
                showToast("Status updated, but email could not be sent: " + mailRes.error, 'error');
            } else {
                showToast("Signoff request sent.", 'success');
            }
        } catch(e: any) {
            console.error("Error sending signoff", e);
            showToast("Failed: " + e.message, 'error');
        } finally {
            setIsActionLoading(null);
        }
    };

    const handleSendReminder = async (decisionId: string) => {
        setIsActionLoading('remind-' + decisionId);
        try {
            const mailRes = await sendSignoffRequest(decisionId, projectId, studioId);
            if (!mailRes.success) {
                showToast("Email could not be sent: " + mailRes.error, 'error');
            } else {
                showToast("Reminder sent.", 'success');
            }
        } catch(e: any) {
            console.error("Error sending reminder", e);
            showToast("Failed: " + e.message, 'error');
        } finally {
            setIsActionLoading(null);
        }
    };

    const handleDownloadPDF = (decision: DecisionData) => {
        try {
            const doc = new jsPDF();
            
            // Studio Branding Header Banner
            doc.setFillColor(15, 23, 42); // Slate 900
            doc.rect(0, 0, 210, 30, 'F');
            
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(255, 255, 255);
            doc.text('FORM FACTORS DESIGN STUDIO', 15, 15);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184); // Slate 400
            doc.text('Execution Intelligence • Client Signoff Record', 15, 22);

            // Document Title & Meta
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.setTextColor(15, 23, 42); // Slate 900
            doc.text('Formal Signoff Record', 15, 45);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139); // Slate-500
            doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}`, 15, 52);
            doc.text(`Document ID: FFDS-SO-${decision.id ? decision.id.substring(0, 8).toUpperCase() : 'MANUAL'}`, 130, 52);
            
            doc.setDrawColor(226, 232, 240); // Slate-200
            doc.setLineWidth(0.5);
            doc.line(15, 58, 195, 58);

            // Left Column: Project Details
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42); // Slate-900
            doc.text('Project Details', 15, 68);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(71, 85, 105); // Slate-600
            doc.text(`Project Name:`, 15, 76);
            doc.setTextColor(15, 23, 42);
            doc.text(`${decision.projectName || 'N/A'}`, 45, 76);
            
            doc.setTextColor(71, 85, 105);
            doc.text(`Room/Area:`, 15, 82);
            doc.setTextColor(15, 23, 42);
            doc.text(`${decision.roomName}`, 45, 82);

            doc.setTextColor(71, 85, 105);
            doc.text(`Client Name:`, 15, 88);
            doc.setTextColor(15, 23, 42);
            doc.text(`${decision.clientName || 'N/A'}`, 45, 88);

            // Right Column: Decision Meta
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42);
            doc.text('Classification', 110, 68);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(71, 85, 105);
            doc.text(`Category:`, 110, 76);
            doc.setTextColor(15, 23, 42);
            doc.text(`${decision.category}`, 135, 76);
            
            doc.setTextColor(71, 85, 105);
            doc.text(`BOQ Impact:`, 110, 82);
            doc.setTextColor(15, 23, 42);
            doc.text(`${renderBoqImpactLabel(decision.boqImpact)}`, 135, 82);
            
            doc.setDrawColor(226, 232, 240);
            doc.line(15, 96, 195, 96);

            // Main Decision Content
            let yPos = 106;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42);
            doc.text('Decision Context & Approval Scope', 15, yPos);
            yPos += 8;
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            const splitDescription = doc.splitTextToSize(decision.decisionText, 180);
            
            // Add a light background for the description text box
            doc.setFillColor(248, 250, 252); // slate-50
            doc.setDrawColor(203, 213, 225); // slate-300
            const textHeight = splitDescription.length * 5;
            doc.rect(15, yPos, 180, textHeight + 10, 'FD'); // Fill and stroke
            
            doc.text(splitDescription, 20, yPos + 7);
            yPos += textHeight + 20;

            // Authentication & Signoff Block
            if (decision.status === 'signed' && decision.signoff) {
                // Draw a badge/box for authentication
                doc.setFillColor(240, 253, 244); // green-50
                doc.setDrawColor(134, 239, 172); // green-300
                doc.rect(15, yPos, 180, 50, 'FD');
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
                doc.setTextColor(22, 101, 52); // green-800
                doc.text('ELECTRONIC SIGNOFF AUTHENTICATION', 20, yPos + 10);
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                
                let authY = yPos + 18;
                doc.setTextColor(71, 85, 105);
                doc.text('Status:', 20, authY);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(21, 128, 61); // green-700
                doc.text('APPROVED (Legally Binding)', 50, authY);
                
                authY += 6;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(71, 85, 105);
                doc.text('Signee Profile:', 20, authY);
                doc.setTextColor(15, 23, 42);
                doc.text(`${decision.signoff.clientNameEntered || decision.clientName || 'Manual Ops Entry'}`, 50, authY);
                
                authY += 6;
                doc.setTextColor(71, 85, 105);
                doc.text('Email (Proof):', 20, authY);
                doc.setTextColor(15, 23, 42);
                doc.text(`${decision.signoff.clientEmail || decision.clientEmail || 'N/A'}`, 50, authY);

                authY += 6;
                doc.setTextColor(71, 85, 105);
                doc.text('Timestamp:', 20, authY);
                doc.setTextColor(15, 23, 42);
                doc.text(`${formatDate(decision.signoff.respondedAt)}`, 50, authY);
                
                if (decision.signoff.ipAddress) {
                    authY += 6;
                    doc.setTextColor(71, 85, 105);
                    doc.text('Network IP:', 20, authY);
                    doc.setFont('courier', 'normal');
                    doc.setFontSize(9);
                    doc.setTextColor(15, 23, 42);
                    doc.text(`${decision.signoff.ipAddress}`, 50, authY);
                }
            }

            // Footer
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184); // Slate-400
            doc.text('Generated via Form Factors Design Studio Ops Platform. This document is a protected electronic record.', 15, 285);

            doc.save(`Signoff_${decision.roomName.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
        } catch (error) {
            console.error("Error generating PDF", error);
            showToast("Failed to generate PDF. Check console for details.", 'error');
        }
    };

    const handleManualSignoff = (decisionId: string, type: 'approved' | 'queried') => {
        setExpandedRow(decisionId);
        setActiveManualSignoffDecision({ id: decisionId, type });
        setManualSignoffText('');
    };
    
    const submitManualSignoff = async (decisionId: string, type: 'approved' | 'queried') => {
        setIsActionLoading(`manual-${type}-${decisionId}`);
        try {
            await recordManualSignoff(projectId, decisionId, type, manualSignoffText.trim());
            setActiveManualSignoffDecision(null);
        } catch (e: any) {
            console.error('Manual signoff failed', e);
            showToast('Failed to record manual signoff: ' + e.message, 'error');
        } finally {
            setIsActionLoading(null);
        }
    };

    const startEditing = (decision: DecisionData) => {
        setExpandedRow(decision.id || null);
        setEditingDecisionId(decision.id || null);
        setEditText(decision.decisionText);
        setActiveLinkDecision(null);
        setActiveManualSignoffDecision(null);
        setDeletingDecisionId(null);
    };

    const submitEdit = async (decisionId: string) => {
        setIsActionLoading(`edit-${decisionId}`);
        try {
            await updateDecisionText(projectId, decisionId, editText);
            setEditingDecisionId(null);
        } catch (e: any) {
            showToast('Failed to edit: ' + e.message, 'error');
        } finally {
            setIsActionLoading(null);
        }
    };

    const confirmDelete = (decisionId: string) => {
        setExpandedRow(decisionId);
        setDeletingDecisionId(decisionId);
        setActiveLinkDecision(null);
        setEditingDecisionId(null);
        setActiveManualSignoffDecision(null);
    };

    const executeDelete = async (decisionId: string) => {
        setIsActionLoading(`delete-${decisionId}`);
        try {
            await deleteDecision(projectId, decisionId);
            setDeletingDecisionId(null);
        } catch (e: any) {
            showToast('Failed to delete: ' + e.message, 'error');
        } finally {
            setIsActionLoading(null);
        }
    };

    const renderBoqImpactLabel = (impact: string) => {
        if (impact === 'none') return 'No cost change';
        if (impact === 'rate_change') return 'Rate changed';
        if (impact === 'new_item') return 'New item added';
        return impact;
    };

    const formatDate = (ts: any) => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
    };

    const getStatusConfig = (decision: DecisionData) => {
        const isDrawingSentMoreThan5Days = decision.signoffRequestSentAt ? 
            (Date.now() - (decision.signoffRequestSentAt as any).toDate().getTime() > 5 * 24 * 60 * 60 * 1000) : false;

        // If email failed for initial notification:
        if (decision.status === 'notified' && decision.emailStatus === 'Failed') {
            return { dot: 'bg-red-500', badge: 'Notification Failed', actionLabel: 'Retry Notification', action: () => handleNotifyClient((decision as any).id), type: 'notify' };
        }

        // If email failed for signoff request:
        if (decision.status === 'drawing_sent' && decision.emailStatus === 'Failed') {
            return { dot: 'bg-red-500', badge: 'Signoff Email Failed', actionLabel: 'Retry Request', action: () => handleSendSignoff((decision as any).id), type: 'signoff' };
        }

        switch(decision.status) {
            case 'draft': return { dot: 'bg-slate-400', badge: 'Saved ✓', actionLabel: 'Notify client', action: () => handleNotifyClient((decision as any).id), type: 'notify' };
            case 'notified': return { dot: 'bg-amber-400', badge: 'Client notified', actionLabel: 'Attach Drawing', action: () => handleProvideDriveLink((decision as any).id), type: 'drawing' };
            case 'drawing_pending': return { dot: 'bg-amber-400', badge: 'Drawing Shared', actionLabel: 'Request signoff', action: () => handleSendSignoff((decision as any).id), type: 'signoff' };
            case 'drawing_sent': return { dot: 'bg-blue-500', badge: 'Awaiting signoff', actionLabel: isDrawingSentMoreThan5Days ? 'Send reminder' : '', action: () => handleSendReminder((decision as any).id), type: 'remind' };
            case 'signed': return { dot: 'bg-emerald-500', badge: 'Signed ✓', actionLabel: '', action: null, type: 'none' };
            case 'disputed': return { dot: 'bg-red-500', badge: 'Query raised', actionLabel: 'Upload fix', action: () => handleProvideDriveLink((decision as any).id), type: 'drawing' };
            default: return { dot: 'bg-slate-400', badge: 'Saved ✓', actionLabel: '', action: null, type: 'none' };
        }
    };

    // Filter out optimistic writes until they are confirmed by the server
    const serverDecisions = decisions.filter(d => !((d as any).hasPendingWrites && !(d as any).createdAt));

    const stats = {
        total: serverDecisions.length,
        signed: (serverDecisions || []).filter(d => d.status === 'signed').length,
        waiting: (serverDecisions || []).filter(d => ['notified', 'drawing_pending', 'drawing_sent', 'disputed'].includes(d.status)).length
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <AnimatePresence>
                {toast && (
                    <motion.div 
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        className={`fixed bottom-6 right-6 z-50 px-5 py-4 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border text-sm flex items-start gap-3 max-w-sm ${
                            toast.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                    >
                        {toast.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600"/> : <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600"/>}
                        <div className="flex-1 font-medium">{toast.message}</div>
                        <button onClick={() => setToast(null)} className="shrink-0 p-1 hover:bg-black/5 rounded-md -mr-2"><X className="w-4 h-4"/></button>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {/* Form Trigger Button */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><Camera className="w-5 h-5"/></span>
                    Site Decisions
                </h3>
                <button
                    onClick={() => setIsFormOpen(!isFormOpen)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition"
                >
                    {isFormOpen ? <XCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {isFormOpen ? 'Cancel' : 'Log a site decision'}
                </button>
            </div>

            {/* Inline Expanding Form */}
            <AnimatePresence>
                {isFormOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, y: -10 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        className="bg-white rounded-2xl border border-indigo-100 shadow-md p-5 sm:p-6"
                    >
                        <h4 className="font-bold text-slate-800 mb-4 text-lg">Log new decision</h4>
                        
                        <div className="space-y-5">
                            {/* 1. Decision description */}
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5">Decision description *</label>
                                <textarea
                                    className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none min-h-[44px]"
                                    rows={3}
                                    placeholder="What was decided on site? Be specific — this will be shared with the client."
                                    value={decisionText}
                                    onChange={(e) => setDecisionText(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                {/* 2. Room */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Room *</label>
                                    <select
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-sm focus:border-indigo-500 outline-none bg-white"
                                        value={roomName}
                                        onChange={(e) => setRoomName(e.target.value)}
                                    >
                                        <option value="">Select a room...</option>
                                        {projectContext.rooms?.map(r => (
                                            <option key={r.name} value={r.name}>{r.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* 4. Who was present */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Who was present</label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-sm focus:border-indigo-500 outline-none"
                                        placeholder="e.g. Mr. Kango + site supervisor"
                                        value={presentees}
                                        onChange={(e) => setPresentees(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* 3. Reason category */}
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5">Reason category *</label>
                                <div className="flex flex-wrap gap-2">
                                    {(['Site Condition', 'Client Request', 'Design Upgrade', 'Value Engineering'] as const).map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => setCategory(cat)}
                                            className={`px-4 py-2 min-h-[44px] rounded-lg text-sm font-bold transition flex-1 sm:flex-none whitespace-nowrap ${
                                                category === cat 
                                                ? 'bg-indigo-600 text-white shadow-sm' 
                                                : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                                            }`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-5">
                                {/* 5. BOQ impact */}
                                <div className="flex-1">
                                    <label className="block text-sm font-bold text-slate-700 mb-1.5">BOQ impact *</label>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { id: 'none', label: 'No cost change' },
                                            { id: 'rate_change', label: 'Rate will change' },
                                            { id: 'new_item', label: 'New item to add' }
                                        ].map(impact => (
                                            <button
                                                key={impact.id}
                                                onClick={() => setBoqImpact(impact.id as any)}
                                                className={`px-4 py-2 min-h-[44px] rounded-full text-sm font-bold border transition ${
                                                    boqImpact === impact.id 
                                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                }`}
                                            >
                                                {impact.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 6. Site photo */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Site photo</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleImageUpload}
                                    />
                                    {photoUrl ? (
                                        <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-slate-200 group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                            <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                                <span className="text-white text-xs font-bold">Change</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-xl border border-dashed border-slate-300 hover:bg-slate-50 text-slate-500 font-medium transition"
                                        >
                                            <Camera className="w-5 h-5" />
                                            <span>Add Photo</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Submit Buttons */}
                            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-3 items-center">
                                {formError && (
                                    <div className="text-red-600 text-xs font-bold mr-auto">
                                        {formError} 
                                    </div>
                                )}
                                <button
                                    onClick={() => submitForm(false)}
                                    disabled={!decisionText.trim() || !roomName || !category || isSubmitting}
                                    className="px-5 py-3 min-h-[44px] rounded-xl font-bold text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition w-full sm:w-auto text-center"
                                >
                                    Save only
                                </button>
                                <button
                                    onClick={() => submitForm(true)}
                                    disabled={!decisionText.trim() || !roomName || !category || isSubmitting}
                                    className="px-6 py-3 min-h-[44px] rounded-xl font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2 w-full sm:w-auto"
                                >
                                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Save & notify client
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Form Toggle Region ends here */}

            {/* Summary Line */}
            <div className="text-sm font-bold text-slate-500 px-1">
                {stats.total} decisions logged · {stats.signed} signed · {stats.waiting} awaiting signoff
            </div>

            {/* Attention Cards */}
            {serverDecisions.map(decision => {
                const id = (decision as any).id;
                const isDisputed = decision.status === 'disputed';
                const isLateDrawing = decision.status === 'drawing_sent' && decision.signoffRequestSentAt && (Date.now() - (decision.signoffRequestSentAt as any).toDate().getTime() > 5 * 24 * 60 * 60 * 1000);
                
                if (!isDisputed && !isLateDrawing) return null;

                const daysPending = isLateDrawing ? Math.floor((Date.now() - (decision.signoffRequestSentAt as any).toDate().getTime()) / (1000 * 60 * 60 * 24)) : 0;
                const clientName = decision.clientName || 'Client';

                return (
                    <div key={`attention-${id}`} className={`p-4 rounded-xl shadow-sm border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${isDisputed ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div>
                            <h4 className={`text-sm font-bold flex items-center gap-2 ${isDisputed ? 'text-red-800' : 'text-amber-800'}`}>
                                <AlertCircle className="w-4 h-4" />
                                Action Required
                            </h4>
                            <p className={`text-sm mt-1 font-medium ${isDisputed ? 'text-red-700' : 'text-amber-700'}`}>
                                {isDisputed 
                                    ? `${clientName} raised a query on ${decision.roomName} change.`
                                    : `Drawing approval pending for ${daysPending} days — consider sending a reminder.`}
                            </p>
                        </div>
                        <button 
                            onClick={() => {
                                if (isDisputed) {
                                    setExpandedRow(id);
                                } else {
                                    handleSendReminder(id);
                                }
                            }}
                            className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap ${isDisputed ? 'bg-white text-red-600 border border-red-200 hover:bg-red-50' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
                        >
                            {isDisputed ? 'View query' : 'Send reminder'}
                        </button>
                    </div>
                );
            })}

            {/* Decision List */}
            <div className="space-y-4">
                {serverDecisions.length === 0 ? (
                    <div className="p-8 text-center bg-white rounded-2xl border border-slate-100 shadow-sm text-slate-400">
                        No decisions logged yet.
                    </div>
                ) : (
                    serverDecisions.map(decision => {
                        const id = (decision as any).id;
                        const isExpanded = expandedRow === id;
                        const config = getStatusConfig(decision);

                        return (
                            <div key={id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-slate-300">
                                {/* Compact Row */}
                                <div 
                                    className="p-4 flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer"
                                    onClick={() => setExpandedRow(isExpanded ? null : id)}
                                >
                                    <div className="flex-1 flex items-start gap-3">
                                        <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${config.dot}`} />
                                        <div className="space-y-1 overflow-hidden">
                                            <p className="text-sm font-bold text-slate-800 truncate">
                                                {decision.decisionText.length > 60 ? decision.decisionText.substring(0, 60) + '...' : decision.decisionText}
                                            </p>
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                                <span>{decision.roomName}</span>
                                                <span>·</span>
                                                <span>{decision.category}</span>
                                                <span>·</span>
                                                <span>{formatDate(decision.createdAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-5 sm:pl-0">
                                        <div className="flex flex-col items-start sm:items-end gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${config.badge.includes('Failed') ? 'text-red-700 bg-red-50 border border-red-200' : 'text-slate-600 bg-slate-100'}`} title={decision.emailError || undefined}>
                                                    {config.badge}
                                                </span>
                                                {decision.emailStatus === 'Sent' && (
                                                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                                                        Email Sent
                                                    </span>
                                                )}
                                            </div>
                                            {decision.status === 'signed' && decision.signoff?.respondedAt && (
                                                <span className="text-[10px] text-slate-400 font-medium">
                                                    {formatDate(decision.signoff.respondedAt)}
                                                </span>
                                            )}
                                        </div>
                                        
                                        {config.actionLabel && (
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    disabled={isActionLoading === `${config.type}-${id}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (config.action) config.action();
                                                    }}
                                                    className="px-3 py-1.5 min-h-[36px] bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap"
                                                >
                                                    {isActionLoading === `${config.type}-${id}` && <Loader2 className="w-3 h-3 animate-spin"/>}
                                                    {config.actionLabel}
                                                </button>
                                            </div>
                                        )}
                                        <button className="text-slate-400 hover:text-slate-600 transition p-1 rounded-md hover:bg-slate-50">
                                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Content */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="border-t border-slate-100 bg-slate-50 overflow-hidden"
                                        >
                                            <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-6">
                                                <div className="flex-1 space-y-4">
                                                    <div>
                                                        <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Full Description</h5>
                                                        {editingDecisionId === id ? (
                                                            <div className="space-y-2 mt-2">
                                                                <textarea
                                                                    autoFocus
                                                                    value={editText}
                                                                    onChange={(e) => setEditText(e.target.value)}
                                                                    className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 min-h-[100px]"
                                                                />
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => submitEdit(id)}
                                                                        disabled={isActionLoading === `edit-${id}`}
                                                                        className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-50"
                                                                    >
                                                                        {isActionLoading === `edit-${id}` ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Save'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setEditingDecisionId(null)}
                                                                        className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-bold"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm text-slate-800 leading-relaxed max-w-2xl whitespace-pre-wrap">
                                                                {decision.decisionText}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                        <div>
                                                            <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Room</span>
                                                            <span className="font-semibold text-slate-700">{decision.roomName}</span>
                                                        </div>
                                                        <div>
                                                            <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Category</span>
                                                            <span className="font-semibold text-slate-700">{decision.category}</span>
                                                        </div>
                                                        <div>
                                                            <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Presentees</span>
                                                            <span className="font-semibold text-slate-700">{decision.presentees || '-'}</span>
                                                        </div>
                                                        <div>
                                                            <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">BOQ Impact</span>
                                                            <span className={`${decision.boqImpact !== 'none' ? 'text-amber-600 font-bold' : 'text-slate-700 font-semibold'} `}>
                                                                {renderBoqImpactLabel(decision.boqImpact)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {decision.status === 'signed' && decision.signoff && decision.signoff.type === 'approved' && (
                                                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                                            <p className="text-xs font-bold text-emerald-800">
                                                                Approved by {decision.signoff.clientNameEntered || decision.clientName} on {formatDate(decision.signoff.respondedAt)}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {decision.status === 'disputed' && decision.signoff && decision.signoff.type === 'queried' && (
                                                        <div className="p-3 bg-red-50 border border-red-100 rounded-xl space-y-1">
                                                            <p className="text-xs font-bold text-red-800">Query raised by client:</p>
                                                            <p className="text-sm font-medium text-red-700 whitespace-pre-wrap">"{decision.signoff.queryText}"</p>
                                                        </div>
                                                    )}

                                                    {activeLinkDecision === id && (
                                                        <div className="pt-2 w-full max-w-lg">
                                                            <label className="text-xs font-bold text-slate-700 mb-1 block">Attach Final Drawing</label>
                                                            <div className="flex flex-col gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                                                <div>
                                                                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">1. Upload PDF or Image (Optional)</label>
                                                                    <input 
                                                                        type="file"
                                                                        accept="application/pdf,image/*"
                                                                        onChange={(e) => setDrawingFile(e.target.files?.[0] || null)}
                                                                        className="text-sm text-slate-600 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white file:border file:border-slate-200 file:text-slate-700 hover:file:bg-slate-100 w-full"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">2. Or paste Drive Link</label>
                                                                    <input 
                                                                        autoFocus
                                                                        type="text" 
                                                                        value={linkValue}
                                                                        onChange={(e) => setLinkValue(e.target.value)}
                                                                        placeholder="https://drive.google.com/..." 
                                                                        className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 focus:ring-1 focus:ring-indigo-500 py-1.5"
                                                                    />
                                                                </div>
                                                                <div className="flex gap-2 pt-1 border-t border-slate-200 mt-1 pb-1">
                                                                    <button
                                                                        onClick={() => submitDriveLink(id)}
                                                                        disabled={isActionLoading === `drawing-${id}` || (!linkValue.trim() && !drawingFile)}
                                                                        className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold disabled:opacity-50 flex items-center justify-center min-w-[120px]"
                                                                    >
                                                                        {isActionLoading === `drawing-${id}` ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Upload & Save'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setActiveLinkDecision(null); setDrawingFile(null); }}
                                                                        className="bg-white border border-slate-300 text-slate-700 px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {activeManualSignoffDecision?.id === id && (
                                                        <div className="pt-2 w-full max-w-md">
                                                            <label className="text-xs font-bold text-slate-700 mb-1 block">Manual {activeManualSignoffDecision.type === 'approved' ? 'Approval Note (Optional)' : 'Query Details'}</label>
                                                            <div className="flex gap-2">
                                                                <input 
                                                                    autoFocus
                                                                    type="text" 
                                                                    value={manualSignoffText}
                                                                    onChange={(e) => setManualSignoffText(e.target.value)}
                                                                    placeholder={activeManualSignoffDecision.type === 'approved' ? "e.g. Approved via WhatsApp" : "Feedback provided..."} 
                                                                    className="flex-1 bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 focus:ring-1 focus:ring-indigo-500 py-1.5"
                                                                />
                                                                <button
                                                                    onClick={() => submitManualSignoff(id, activeManualSignoffDecision.type)}
                                                                    disabled={isActionLoading === `manual-${activeManualSignoffDecision.type}-${id}` || (activeManualSignoffDecision.type === 'queried' && !manualSignoffText.trim())}
                                                                    className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-50"
                                                                >
                                                                    {isActionLoading === `manual-${activeManualSignoffDecision.type}-${id}` ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Save'}
                                                                </button>
                                                                <button
                                                                    onClick={() => setActiveManualSignoffDecision(null)}
                                                                    className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-bold"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {deletingDecisionId === id && (
                                                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
                                                            <span className="text-sm font-medium text-red-800">Are you sure you want to delete this decision?</span>
                                                            <div className="flex gap-2">
                                                                <button onClick={() => executeDelete(id)} disabled={isActionLoading === `delete-${id}`} className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">Yes, delete</button>
                                                                <button onClick={() => setDeletingDecisionId(null)} className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-bold">Cancel</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Inline Actions inside expanded row */}
                                                    <div className="pt-2 flex flex-wrap gap-3">
                                                        {['notified', 'drawing_pending', 'drawing_sent', 'disputed'].includes(decision.status) && (
                                                            <button 
                                                                onClick={() => handleProvideDriveLink(id)}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                                                            >
                                                                <FileUp className="w-3.5 h-3.5"/> {decision.status === 'notified' ? 'Provide Drive Link' : 'Update Drive Link'}
                                                            </button>
                                                        )}
                                                        {['drawing_pending', 'drawing_sent'].includes(decision.status) && (
                                                            <>
                                                                <button 
                                                                    onClick={() => handleManualSignoff(id, 'approved')}
                                                                    disabled={isActionLoading === `manual-approved-${id}`}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition"
                                                                    title="If client approved via email/chat"
                                                                >
                                                                    {isActionLoading === `manual-approved-${id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Record manual Approval'}
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleManualSignoff(id, 'queried')}
                                                                    disabled={isActionLoading === `manual-queried-${id}`}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-700 hover:bg-red-100 transition"
                                                                    title="If client raised query via email/chat"
                                                                >
                                                                    {isActionLoading === `manual-queried-${id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Record manual Query'}
                                                                </button>
                                                            </>
                                                        )}
                                                        {decision.status === 'drawing_sent' && (Date.now() - (decision.signoffRequestSentAt as any)?.toDate().getTime() > 5 * 24 * 60 * 60 * 1000) && (
                                                            <button 
                                                                onClick={() => handleSendReminder(id)}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                                                            >
                                                                <Clock className="w-3.5 h-3.5"/> Send reminder
                                                            </button>
                                                        )}
                                                        {decision.status === 'signed' && (
                                                            <button 
                                                                onClick={() => handleDownloadPDF(decision)}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                                                            >
                                                                <Download className="w-3.5 h-3.5"/> Download signoff record
                                                            </button>
                                                        )}
                                                        
                                                        {['draft', 'notified'].includes(decision.status) && (
                                                            <>
                                                                <div className="w-[1px] h-6 bg-slate-200 self-center mx-1"></div>
                                                                <button 
                                                                    onClick={() => startEditing(decision)}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-bold transition"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button 
                                                                    onClick={() => confirmDelete(id)}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-red-500 hover:text-red-700 text-xs font-bold transition"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex gap-3 sm:flex-col sm:w-48 shrink-0">
                                                    {decision.photoURL && (
                                                        <a href={decision.photoURL} target="_blank" rel="noreferrer" className="flex-1 sm:flex-none aspect-video sm:aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white block group relative">
                                                            <img src={decision.photoURL} alt="Site" className="w-full h-full object-cover transition duration-300 group-hover:scale-105" />
                                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                                                <span className="text-white text-[10px] font-bold uppercase tracking-wider">View Full</span>
                                                            </div>
                                                        </a>
                                                    )}
                                                    {decision.drawingURL && (
                                                        <a href={decision.drawingURL} target="_blank" rel="noreferrer" className="flex-1 sm:flex-none aspect-video sm:aspect-square rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition p-2 text-center group relative">
                                                            <FileText className="w-6 h-6" />
                                                            <span className="text-[10px] font-bold uppercase tracking-wider">Drawing</span>
                                                            <div className="absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                                                <Download className="w-5 h-5 text-indigo-600" />
                                                            </div>
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })
                )}
            </div>
            
        </div>
    );
}
