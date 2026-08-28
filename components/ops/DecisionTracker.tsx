import { showSuccessWithNext } from '../SuccessWithNextToast';
import React, { useState, useRef, useEffect } from 'react';
import { ProjectContext } from '../../types';
import { 
    Camera, 
    Image as ImageIcon, 
    XCircle, 
    Plus, 
    Loader2, 
    Upload, 
    FileText, 
    ChevronDown, 
    ChevronUp, 
    Clock, 
    FileUp, 
    Download, 
    AlertCircle, 
    CheckCircle, 
    X, 
    Sparkles, 
    Share2, 
    Copy, 
    Check, 
    Calendar, 
    DollarSign, 
    ShieldCheck, 
    Info,
    TrendingUp,
    User,
    Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    saveDecision, 
    updateDecisionPhoto, 
    updateDecisionDrawing, 
    markDecisionNotified, 
    DecisionData, 
    recordManualSignoff, 
    deleteDecision, 
    updateDecisionText 
} from '../../services/decisionsService';
import { db } from '../../services/firebaseClient';
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { getStorage, ref, uploadString, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getApp } from 'firebase/app';
import { formatINR } from '../../lib/utils';

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
    const studioName = orgData?.orgName || 'Form Factors Design Studio';
    
    const [decisions, setDecisions] = useState<DecisionData[]>([]);
    
    // Form state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formActiveTab, setFormActiveTab] = useState<'ai' | 'manual'>('ai');
    
    // AI Form Input
    const [aiInputText, setAiInputText] = useState('');
    const [isAiParsing, setIsAiParsing] = useState(false);
    const [aiParseStep, setAiParseStep] = useState('');

    // Decision Fields
    const [title, setTitle] = useState('');
    const [decisionText, setDecisionText] = useState('');
    const [roomName, setRoomName] = useState('');
    const [category, setCategory] = useState<'Site Condition' | 'Client Request' | 'Design Upgrade' | 'Value Engineering'>('Site Condition');
    const [presentees, setPresentees] = useState('');
    const [boqImpact, setBoqImpact] = useState<'none' | 'rate_change' | 'new_item'>('none');
    const [impactCostValue, setImpactCostValue] = useState<number>(0);
    const [impactScheduleDays, setImpactScheduleDays] = useState<number>(0);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Active Rows and Modals
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
    const [shareModalDecision, setShareModalDecision] = useState<DecisionData | null>(null);
    const [copiedShareLink, setCopiedShareLink] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [activeLinkDecision, setActiveLinkDecision] = useState<string | null>(null);
    const [linkValue, setLinkValue] = useState<string>('');
    const [drawingFile, setDrawingFile] = useState<File | null>(null);

    // Edit states
    const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editText, setEditText] = useState('');
    const [editCost, setEditCost] = useState<number>(0);
    const [editSchedule, setEditSchedule] = useState<number>(0);
    
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
            showToast("Technical drawing attached successfully!", "success");
        } catch (error: any) {
            console.error("Error saving drawing link:", error);
            showToast("Failed to save drawing link: " + error.message, 'error');
        } finally {
            setIsActionLoading(null);
        }
    };

    const resetForm = () => {
        setTitle('');
        setDecisionText('');
        setRoomName('');
        setCategory('Site Condition');
        setPresentees('');
        setBoqImpact('none');
        setImpactCostValue(0);
        setImpactScheduleDays(0);
        setPhotoUrl(null);
        setAiInputText('');
        setIsFormOpen(false);
    };

    const handleAiAutofill = async () => {
        if (!aiInputText.trim()) return;
        setIsAiParsing(true);
        setAiParseStep('Gemini is analyzing raw conversation notes...');
        setFormError(null);

        try {
            const roomsList = projectContext.rooms?.map(r => r.name) || [];
            
            // Artificial steps for smooth visual feedback of smart capability
            setTimeout(() => setAiParseStep('Extracting decision details and room context...'), 800);
            setTimeout(() => setAiParseStep('Calculating estimated BOQ cost impacts...'), 1600);

            const res = await fetch('/api/parse-decision-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: aiInputText,
                    projectRooms: roomsList
                })
            });

            if (!res.ok) {
                throw new Error("Failed to process with Gemini AI");
            }

            const data = await res.json();
            if (data.success && data.decision) {
                const dec = data.decision;
                setTitle(dec.title || '');
                setDecisionText(dec.decisionText || '');
                setRoomName(dec.roomName || '');
                setCategory(dec.category || 'Site Condition');
                setPresentees(dec.presentees || '');
                setBoqImpact(dec.boqImpact || 'none');
                setImpactCostValue(dec.impactCostValue || 0);
                setImpactScheduleDays(dec.impactScheduleDays || 0);

                setFormActiveTab('manual');
                showToast("Magic Autofill successful! Please review and finalize the details.", "success");
            } else {
                showToast(data.error || "AI failed to extract structured fields. Please fill manually.", "error");
            }
        } catch (error: any) {
            console.error("AI Parse error:", error);
            showToast(error.message || "Failed to contact AI parser. Please try manual entry.", "error");
        } finally {
            setIsAiParsing(false);
            setAiParseStep('');
        }
    };

    const submitForm = async (notifyClient: boolean) => {
        if (!decisionText.trim() || !roomName || !category) return;
        setIsSubmitting(true);
        setFormError(null);

        try {
            const formData = {
                title: title.trim() || `${roomName} Decision`,
                decisionText: decisionText.trim(),
                roomName,
                category,
                presentees: presentees.trim(),
                boqImpact,
                impactCostValue: Number(impactCostValue) || 0,
                impactScheduleDays: Number(impactScheduleDays) || 0,
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
                    showToast("Decision saved, but client notification email failed: " + mailRes.error, "error");
                } else {
                    showSuccessWithNext('Decision logged & client notified.');
                }
            } else {
                showToast("Decision saved successfully as Draft.", "success");
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
                showSuccessWithNext('Client notified. Decision logged');
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
                showSuccessWithNext('Signoff request sent. Decision logged');
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
                showSuccessWithNext('Reminder sent. Decision logged');
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
            const pageWidth = 210;
            const marginX = 20;
            const contentWidth = 170; // 210 - 40
            
            // --- Elegant Brand Palette ---
            const ink = [31, 35, 40];       // #1f2328 - Primary Ink
            const inkSoft = [63, 70, 78];    // #3f464e - Secondary
            const muted = [114, 122, 130];   // #727a82 - Muted
            const gold = [176, 141, 87];    // #b08d57 - Gold
            const line = [230, 227, 220];   // #e6e3dc - Standard Line
            const lineSoft = [239, 236, 230]; // #efece6 - Soft Line
            const paper = [251, 250, 247];  // #fbfaf7 - Paper Background

            // Helper for setting colors & text
            const drawText = (
                text: string,
                x: number,
                y: number,
                size: number,
                color: number[],
                fontStyle: 'normal' | 'bold' | 'italic' = 'normal',
                align: 'left' | 'center' | 'right' = 'left'
            ) => {
                doc.setFont('helvetica', fontStyle);
                doc.setFontSize(size);
                doc.setTextColor(color[0], color[1], color[2]);
                doc.text(text || '', x, y, { align });
            };

            // 1. Header (Mast - Editorial Style matching TermsDocketPage / StudioDocumentShell)
            let y = 20;
            
            // Studio Brand Name
            drawText(studioName.toUpperCase(), marginX, y, 11, ink, 'bold');
            drawText('MINIMAL DESIGN. MAXIMUM IMPACT.', marginX, y + 4.5, 7, muted, 'normal');

            // Right-aligned Document Identifier
            drawText('DECISION LEDGER RECORD', pageWidth - marginX, y, 9.5, gold, 'bold', 'right');
            drawText(`REF: FFDS-DEC-${decision.id ? decision.id.substring(0, 8).toUpperCase() : 'NEW'}`, pageWidth - marginX, y + 4.5, 8, muted, 'normal', 'right');

            // Single Gold Hairline Accent
            doc.setFillColor(gold[0], gold[1], gold[2]);
            doc.rect(marginX, y + 10, contentWidth, 0.4, 'F');

            // 2. Document Title
            y = 42;
            drawText('ON-SITE DESIGN & EXECUTION DECISION', marginX, y, 14, ink, 'bold');
            drawText('This document certifies technical decisions, on-site revisions, and client authorizations.', marginX, y + 5, 8.5, inkSoft, 'normal');

            // 3. Metabar / Project Classification & Info Grid
            y = 56;
            // Draw metabar container with paper background and standard border
            doc.setFillColor(paper[0], paper[1], paper[2]);
            doc.setDrawColor(line[0], line[1], line[2]);
            doc.setLineWidth(0.3);
            doc.rect(marginX, y, contentWidth, 34, 'FD');

            // Internal Grid lines
            doc.setDrawColor(lineSoft[0], lineSoft[1], lineSoft[2]);
            doc.line(marginX, y + 11.5, marginX + contentWidth, y + 11.5);
            doc.line(marginX, y + 23, marginX + contentWidth, y + 23);
            doc.line(110, y, 110, y + 34);

            // Row 1
            drawText('PROJECT NAME', marginX + 4, y + 4.5, 7.5, muted, 'bold');
            drawText(decision.projectName || 'N/A', marginX + 4, y + 9, 8.5, ink, 'normal');

            drawText('CLIENT NAME', 114, y + 4.5, 7.5, muted, 'bold');
            drawText(decision.clientName || 'N/A', 114, y + 9, 8.5, ink, 'normal');

            // Row 2
            drawText('ROOM / AREA', marginX + 4, y + 16, 7.5, muted, 'bold');
            drawText(decision.roomName, marginX + 4, y + 20.5, 8.5, ink, 'normal');

            drawText('CLIENT EMAIL', 114, y + 16, 7.5, muted, 'bold');
            drawText(decision.clientEmail || 'N/A', 114, y + 20.5, 8.5, ink, 'normal');

            // Row 3
            drawText('CATEGORY', marginX + 4, y + 27.5, 7.5, muted, 'bold');
            drawText(decision.category, marginX + 4, y + 32, 8.5, ink, 'normal');

            drawText('PRESENTEES', 114, y + 27.5, 7.5, muted, 'bold');
            drawText(decision.presentees || 'N/A', 114, y + 32, 8.5, ink, 'normal');

            // 4. Financial & Schedule Impact Sections (Highlight & Principle styled)
            y = 98;
            drawText('FINANCIAL & SCHEDULE REVISIONS', marginX, y, 10, ink, 'bold');

            // Left Box: Cost Impact (Highlight Style: light gold background, gold left border)
            doc.setFillColor(253, 248, 239); // #fdf8ef
            doc.setDrawColor(236, 220, 192); // light gold border
            doc.rect(marginX, y + 4, 82, 18, 'FD');
            // Gold left border
            doc.setFillColor(gold[0], gold[1], gold[2]);
            doc.rect(marginX, y + 4, 1.5, 18, 'F');

            drawText('ESTIMATED COST IMPACT', marginX + 4.5, y + 9, 7.5, [138, 107, 52], 'bold');
            drawText(`${formatINR(decision.impactCostValue)} (${renderBoqImpactLabel(decision.boqImpact)})`, marginX + 4.5, y + 15, 10, ink, 'bold');

            // Right Box: Schedule Impact (Principle Style: soft grey background, slate left border)
            doc.setFillColor(244, 242, 236); // #f4f2ec
            doc.setDrawColor(230, 227, 220); // soft line border
            doc.rect(108, y + 4, 82, 18, 'FD');
            // Slate left border
            doc.setFillColor(ink[0], ink[1], ink[2]);
            doc.rect(108, y + 4, 1.5, 18, 'F');

            drawText('SCHEDULE TIMELINE IMPACT', 112.5, y + 9, 7.5, ink, 'bold');
            drawText(decision.impactScheduleDays ? `+ ${decision.impactScheduleDays} Work Days` : 'No Schedule Delay', 112.5, y + 15, 10, ink, 'bold');

            // 5. Main Decision text
            let yPos = 126;
            drawText('DECISION TEXT & AGREED CHANGE SCOPE', marginX, yPos, 10, ink, 'bold');
            yPos += 4;
            
            const splitDescription = doc.splitTextToSize(decision.decisionText, 164);
            const textHeight = splitDescription.length * 5.2;
            
            // Draw a subtle left bar with gold accent
            doc.setFillColor(gold[0], gold[1], gold[2]);
            doc.rect(marginX, yPos, 1.2, textHeight + 6, 'F');
            
            // Write text lines
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9.5);
            doc.setTextColor(inkSoft[0], inkSoft[1], inkSoft[2]);
            doc.text(splitDescription, marginX + 4.5, yPos + 5.5);
            
            yPos += textHeight + 20;

            // 6. Signature Sign-off and Digital Audit Block (No colored status pills, very sober print-first)
            if (decision.status === 'signed' && decision.signoff) {
                drawText('DIGITAL ACKNOWLEDGEMENT & COMPLIANCE PROOF', marginX, yPos, 10, ink, 'bold');
                
                // Outer box
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(line[0], line[1], line[2]);
                doc.rect(marginX, yPos + 4, contentWidth, 38, 'FD');
                
                // Green indicator bar
                doc.setFillColor(16, 124, 65);
                doc.rect(marginX, yPos + 4, 1.5, 38, 'F');
                
                // Details
                drawText('AUTHORIZED SIGNATORY DETAILS', marginX + 5, yPos + 10, 7.5, muted, 'bold');
                drawText(`Signed by: ${decision.signoff.clientNameEntered || decision.clientName}`, marginX + 5, yPos + 16, 8.5, ink, 'normal');
                drawText(`Email Verification: ${decision.signoff.clientEmail || decision.clientEmail || 'N/A'}`, marginX + 5, yPos + 21.5, 8, inkSoft, 'normal');
                
                drawText('DIGITAL VERIFICATION AUDIT', 114, yPos + 10, 7.5, muted, 'bold');
                drawText(`IP Address: ${decision.signoff.ipAddress || 'Internal'}`, 114, yPos + 16, 8.5, ink, 'normal');
                drawText(`Verified Date: ${formatDate(decision.signoff.respondedAt)}`, 114, yPos + 21.5, 8, inkSoft, 'normal');
                
                // Status label
                drawText('STATUS: DIGITALLY APPROVED & BINDING', marginX + 5, yPos + 32, 8.5, [16, 124, 65], 'bold');
                
            } else if (decision.status === 'disputed' && decision.signoff) {
                drawText('REVISION REQUESTED & REVIEW DETAILS', marginX, yPos, 10, ink, 'bold');
                
                // Outer box
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(242, 202, 202);
                doc.rect(marginX, yPos + 4, contentWidth, 38, 'FD');
                
                // Red indicator bar
                doc.setFillColor(185, 28, 28);
                doc.rect(marginX, yPos + 4, 1.5, 38, 'F');
                
                drawText('STATUS: REVISION SOUGHT / CLARIFICATION ACTIVE', marginX + 5, yPos + 10, 7.5, [185, 28, 28], 'bold');
                drawText(`Raised by: ${decision.signoff.clientNameEntered || decision.clientName}`, marginX + 5, yPos + 16, 8.5, ink, 'normal');
                drawText(`Date Raised: ${formatDate(decision.signoff.respondedAt)}`, 114, yPos + 16, 8.5, inkSoft, 'normal');
                
                const splitQuery = doc.splitTextToSize(`Concern: "${decision.signoff.queryText || 'No comment provided.'}"`, contentWidth - 10);
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(8.5);
                doc.setTextColor(inkSoft[0], inkSoft[1], inkSoft[2]);
                doc.text(splitQuery, marginX + 5, yPos + 23);
                
            } else {
                drawText('CLIENT SIGN-OFF SHEET (FORMAL EXECUTION AUTHORIZATION)', marginX, yPos, 10, ink, 'bold');
                
                // Outer box
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(line[0], line[1], line[2]);
                doc.rect(marginX, yPos + 4, contentWidth, 34, 'FD');
                
                // Gold indicator bar
                doc.setFillColor(gold[0], gold[1], gold[2]);
                doc.rect(marginX, yPos + 4, 1.5, 34, 'F');
                
                drawText('STATUS: PENDING CLIENT DIGITAL SIGNATURE', marginX + 5, yPos + 11, 8, gold, 'bold');
                drawText('This decision is registered in site progress records. A physical signature below serves as official backup consent.', marginX + 5, yPos + 16, 8, inkSoft, 'normal');
                
                // Double Signature lines
                const sigY = yPos + 28;
                doc.setDrawColor(ink[0], ink[1], ink[2]);
                doc.setLineWidth(0.3);
                doc.line(marginX + 5, sigY, marginX + 55, sigY);
                doc.line(pageWidth - marginX - 55, sigY, pageWidth - marginX - 5, sigY);
                
                drawText('Authorized Studio Architect', marginX + 5, sigY + 4, 8, ink, 'bold');
                drawText('Client Verification Signature', pageWidth - marginX - 5, sigY + 4, 8, ink, 'bold', 'right');
            }

            // 7. Footer
            doc.setDrawColor(lineSoft[0], lineSoft[1], lineSoft[2]);
            doc.setLineWidth(0.3);
            doc.line(marginX, 276, pageWidth - marginX, 276);

            drawText(`This record is generated securely via ${studioName}. Unauthorized reproduction is legally restricted.`, marginX, 282, 7.5, muted, 'italic');
            drawText('Page 1 of 1', pageWidth - marginX, 282, 7.5, muted, 'normal', 'right');

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
            showToast(`Manual signoff registered successfully!`, "success");
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
        setEditTitle(decision.title || '');
        setEditText(decision.decisionText);
        setEditCost(decision.impactCostValue || 0);
        setEditSchedule(decision.impactScheduleDays || 0);
        setActiveLinkDecision(null);
        setActiveManualSignoffDecision(null);
        setDeletingDecisionId(null);
    };

    const submitEdit = async (decisionId: string) => {
        setIsActionLoading(`edit-${decisionId}`);
        try {
            await updateDecisionText(
                projectId, 
                decisionId, 
                editText, 
                editTitle, 
                Number(editCost) || 0, 
                Number(editSchedule) || 0
            );
            setEditingDecisionId(null);
            showToast("Decision record modified successfully.", "success");
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
            showToast("Decision deleted successfully.", "success");
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

        if (decision.status === 'notified' && decision.emailStatus === 'Failed') {
            return { dot: 'bg-red-500', badge: 'Notification Failed', actionLabel: 'Retry Notification', action: () => handleNotifyClient((decision as any).id), type: 'notify' };
        }

        if (decision.status === 'drawing_sent' && decision.emailStatus === 'Failed') {
            return { dot: 'bg-red-500', badge: 'Signoff Email Failed', actionLabel: 'Retry Request', action: () => handleSendSignoff((decision as any).id), type: 'signoff' };
        }

        switch(decision.status) {
            case 'draft': return { dot: 'bg-slate-400', badge: 'Draft Saved', actionLabel: 'Notify client', action: () => handleNotifyClient((decision as any).id), type: 'notify' };
            case 'notified': return { dot: 'bg-amber-500', badge: 'Client notified', actionLabel: 'Attach Drawing', action: () => handleProvideDriveLink((decision as any).id), type: 'drawing' };
            case 'drawing_pending': return { dot: 'bg-amber-500', badge: 'Drawing Shared', actionLabel: 'Request signoff', action: () => handleSendSignoff((decision as any).id), type: 'signoff' };
            case 'drawing_sent': return { dot: 'bg-[#0066CC]', badge: 'Awaiting signoff', actionLabel: isDrawingSentMoreThan5Days ? 'Send reminder' : '', action: () => handleSendReminder((decision as any).id), type: 'remind' };
            case 'signed': return { dot: 'bg-emerald-500', badge: 'Signed ✓', actionLabel: '', action: null, type: 'none' };
            case 'disputed': return { dot: 'bg-red-500', badge: 'Query raised', actionLabel: 'Upload fix', action: () => handleProvideDriveLink((decision as any).id), type: 'drawing' };
            default: return { dot: 'bg-slate-400', badge: 'Saved ✓', actionLabel: '', action: null, type: 'none' };
        }
    };

    // Filter out optimistic writes until they are confirmed by the server
    const serverDecisions = decisions.filter(d => !((d as any).hasPendingWrites && !(d as any).createdAt));

    const totalCostProtection = serverDecisions
        .filter(d => d.status === 'signed')
        .reduce((sum, d) => sum + (d.impactCostValue || 0), 0);

    const activeExposure = serverDecisions
        .filter(d => ['notified', 'drawing_pending', 'drawing_sent', 'disputed'].includes(d.status))
        .reduce((sum, d) => sum + (d.impactCostValue || 0), 0);

    const stats = {
        total: serverDecisions.length,
        signed: serverDecisions.filter(d => d.status === 'signed').length,
        waiting: serverDecisions.filter(d => ['notified', 'drawing_pending', 'drawing_sent', 'disputed'].includes(d.status)).length,
        disputed: serverDecisions.filter(d => d.status === 'disputed').length,
    };

    const handleShareWhatsApp = (decision: DecisionData) => {
        setShareModalDecision(decision);
        setCopiedShareLink(false);
    };

    const getShareURL = (decision: DecisionData) => {
        return `${window.location.origin}/signoff/${decision.signoffToken}`;
    };

    const getShareMessageText = (decision: DecisionData) => {
        const clientName = decision.clientName || 'Client';
        const costStr = decision.impactCostValue ? formatINR(decision.impactCostValue) : 'No cost change';
        const link = getShareURL(decision);
        return `Hi ${clientName}, we have logged a design & execution decision regarding the *${decision.roomName}* on-site.\n\n*Decision Title:* ${decision.title || `${decision.roomName} Update`}\n*Cost Impact:* ${costStr}\n*Timeline Impact:* ${decision.impactScheduleDays ? `+${decision.impactScheduleDays} Days` : 'No Delay'}\n\nTo ensure complete alignment and keep execution on track, please review details and sign off here:\n👉 ${link}\n\nThank you!\n-${studioName}`;
    };

    const copyShareText = () => {
        if (!shareModalDecision) return;
        navigator.clipboard.writeText(getShareMessageText(shareModalDecision));
        setCopiedShareLink(true);
        showToast("WhatsApp Message and Link copied to clipboard!", "success");
        setTimeout(() => setCopiedShareLink(false), 2000);
    };

    return (
        <div className="w-full space-y-5">
            <AnimatePresence>
                {toast && (
                    <motion.div 
                        initial={{ opacity: 0, y: -50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        className={`fixed top-6 right-6 z-[100] px-5 py-4 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border text-sm flex items-start gap-3 max-w-sm ${
                            toast.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                    >
                        {toast.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600"/> : <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600"/>}
                        <div className="flex-1 font-medium">{toast.message}</div>
                        <button onClick={() => setToast(null)} className="shrink-0 p-1 hover:bg-slate-100 rounded-md -mr-2"><X className="w-4 h-4 text-slate-500"/></button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* HIGH-FIDELITY OVERVIEW METRICS - Milky White Theme */}
            <div className="bg-white/90 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-2xs border border-slate-200/80">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="bg-slate-50/70 border border-slate-200/60 p-3.5 rounded-xl">
                        <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">Approval Rate</span>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 bg-slate-200 h-2 rounded-full overflow-hidden">
                                <div 
                                    className="bg-[#0066CC] h-full rounded-full transition-all duration-500" 
                                    style={{ width: `${stats.total > 0 ? (stats.signed / stats.total) * 100 : 0}%` }}
                                />
                            </div>
                            <span className="text-sm font-bold text-slate-900 tabular-nums">{stats.total > 0 ? Math.round((stats.signed / stats.total) * 100) : 0}%</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium block mt-1">{stats.signed} of {stats.total} approved</span>
                    </div>

                    <div className="bg-slate-50/70 border border-slate-200/60 p-3.5 rounded-xl">
                        <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">Decisions Logged</span>
                        <span className="text-2xl font-bold font-mono text-slate-900 block mt-1 tabular-nums">{stats.total}</span>
                        <span className="text-[10px] text-slate-500 font-medium block mt-0.5">{stats.signed} signed · {stats.waiting} pending</span>
                    </div>

                    <div className="bg-slate-50/70 border border-slate-200/60 p-3.5 rounded-xl">
                        <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">Dispute / Query Rate</span>
                        <span className={`text-2xl font-bold font-mono block mt-1 tabular-nums ${stats.disputed > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{stats.disputed}</span>
                        <span className="text-[10px] text-slate-500 font-medium block mt-0.5">{stats.disputed > 0 ? 'Requires immediate action' : 'All queries resolved'}</span>
                    </div>

                    <div className="bg-slate-50/70 border border-slate-200/60 p-3.5 rounded-xl">
                        <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">Financial Risk Covered</span>
                        <span className="text-2xl font-bold font-mono text-emerald-700 block mt-1 tabular-nums">{formatINR(totalCostProtection)}</span>
                        <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">✓ Formally signed & approved</span>
                    </div>

                    <div className="bg-slate-50/70 border border-slate-200/60 p-3.5 rounded-xl">
                        <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">Current At-Risk Cost</span>
                        <span className="text-2xl font-bold font-mono text-amber-700 block mt-1 tabular-nums">{formatINR(activeExposure)}</span>
                        <span className="text-[10px] text-slate-500 font-medium block mt-0.5">Awaiting client signature</span>
                    </div>
                </div>
            </div>
            
            {/* Form Trigger / Header */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
                <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
                    <span className="p-1.5 bg-sky-50 text-[#0066CC] rounded-lg"><CheckCircle className="w-5 h-5"/></span>
                    Decision Ledger Entries
                </h3>
                <button
                    onClick={() => {
                        setIsFormOpen(!isFormOpen);
                        setFormActiveTab('ai');
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#0066CC] text-white rounded-lg font-bold text-sm hover:bg-[#0055B3] transition shadow-sm"
                >
                    {isFormOpen ? <XCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {isFormOpen ? 'Cancel Logging' : 'Log a Site Decision'}
                </button>
            </div>

            {/* Smart AI and Manual Form Container */}
            <AnimatePresence>
                {isFormOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, y: -10 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        className="bg-white rounded-2xl border border-sky-100 shadow-[0_4px_25px_rgba(0,0,0,0.06)] p-5 sm:p-6 space-y-6"
                    >
                        <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                            <div>
                                <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5">
                                    <Sparkles className="w-4.5 h-4.5 text-amber-500 fill-amber-500 animate-pulse" /> 
                                    New Site Decision Logger
                                </h4>
                                <p className="text-xs text-slate-500 mt-0.5">Record design revisions, material changes, and client requests on site.</p>
                            </div>
                            
                            {/* Tabs Switcher */}
                            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setFormActiveTab('ai')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition flex items-center gap-1 ${
                                        formActiveTab === 'ai' ? 'bg-[#0066CC] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Smart AI Draft
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormActiveTab('manual')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition flex items-center gap-1 ${
                                        formActiveTab === 'manual' ? 'bg-[#0066CC] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    <FileText className="w-3.5 h-3.5" />
                                    Manual Field Entry
                                </button>
                            </div>
                        </div>

                        {formActiveTab === 'ai' ? (
                            <div className="space-y-4">
                                <div className="bg-sky-50/50 border border-sky-100 p-4 rounded-xl space-y-2">
                                    <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                        <Info className="w-4 h-4 text-[#0066CC]"/> Magic AI Parsing Mode
                                    </h5>
                                    <p className="text-xs text-slate-900/80 leading-relaxed">
                                        Paste unstructured WhatsApp chats, site visit bullet points, or raw speech-to-text transcripts. Gemini AI will immediately extract the room context, rewrite the decision text into polished client-friendly terms, identify category reasons, and estimate BOQ cost impacts!
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-extrabold text-slate-700">Paste Conversation or Site visit notes:</label>
                                    <textarea
                                        rows={6}
                                        value={aiInputText}
                                        onChange={(e) => setAiInputText(e.target.value)}
                                        placeholder={`e.g.,\nLiving Room visit today. Client Amit agreed to move living room TV point 6 inches right to clear overlap with laminate wood panel. Amit approved Rs 4500 extra charge verbally. Mr. Kango and supervisor present.`}
                                        className="w-full border border-slate-200 rounded-xl p-3.5 text-sm focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] outline-none leading-relaxed"
                                    />
                                </div>
                                <div className="flex justify-between items-center pt-2">
                                    <div className="text-[11px] text-slate-400">
                                        *You can refine and edit fields after autofill completes
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAiAutofill}
                                        disabled={isAiParsing || !aiInputText.trim()}
                                        className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-[#0066CC] to-sky-800 text-white rounded-xl font-bold text-sm hover:from-[#0055B3] hover:to-sky-900 shadow-sm transition disabled:opacity-50"
                                    >
                                        {isAiParsing ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <span>{aiParseStep || 'Processing...'}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-4 h-4 fill-white animate-pulse" />
                                                <span>Magic Auto-Fill Fields ⚡️</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    {/* 1. Title */}
                                    <div>
                                        <label className="block text-sm font-extrabold text-slate-700 mb-1.5">Decision Title *</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-sm focus:border-[#0066CC] outline-none"
                                            placeholder="e.g. TV Unit Laminate Selection"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                        />
                                    </div>

                                    {/* 2. Room */}
                                    <div>
                                        <label className="block text-sm font-extrabold text-slate-700 mb-1.5">Room / Area *</label>
                                        <select
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-sm focus:border-[#0066CC] outline-none bg-white"
                                            value={roomName}
                                            onChange={(e) => setRoomName(e.target.value)}
                                        >
                                            <option value="">Select a room...</option>
                                            {projectContext.rooms?.map(r => (
                                                <option key={r.name} value={r.name}>{r.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* 3. Decision description */}
                                <div>
                                    <label className="block text-sm font-extrabold text-slate-700 mb-1.5">Decision & Scope Details *</label>
                                    <textarea
                                        className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] outline-none min-h-[70px]"
                                        rows={3}
                                        placeholder="What was decided? Be specific and technical — this text is rendered verbatim in the client contract & approval portal."
                                        value={decisionText}
                                        onChange={(e) => setDecisionText(e.target.value)}
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    {/* 4. Reason Category */}
                                    <div>
                                        <label className="block text-sm font-extrabold text-slate-700 mb-1.5">Reason Category *</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(['Site Condition', 'Client Request', 'Design Upgrade', 'Value Engineering'] as const).map(cat => (
                                                <button
                                                    type="button"
                                                    key={cat}
                                                    onClick={() => setCategory(cat)}
                                                    className={`px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold transition whitespace-nowrap text-center ${
                                                        category === cat 
                                                        ? 'bg-[#0066CC] text-white shadow-sm' 
                                                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 5. Presentees */}
                                    <div>
                                        <label className="block text-sm font-extrabold text-slate-700 mb-1.5">Who was present</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-sm focus:border-[#0066CC] outline-none"
                                            placeholder="e.g. Amit (Client) + Site Supervisor"
                                            value={presentees}
                                            onChange={(e) => setPresentees(e.target.value)}
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1">Shorthand log of attendees present on site.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                                    {/* 6. BOQ impact */}
                                    <div>
                                        <label className="block text-sm font-extrabold text-slate-700 mb-1.5">BOQ Cost Impact Category *</label>
                                        <div className="flex flex-col gap-2">
                                            {[
                                                { id: 'none', label: 'No cost change' },
                                                { id: 'rate_change', label: 'Rate modification' },
                                                { id: 'new_item', label: 'New item to add' }
                                            ].map(impact => (
                                                <button
                                                    type="button"
                                                    key={impact.id}
                                                    onClick={() => setBoqImpact(impact.id as any)}
                                                    className={`px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold border transition text-left ${
                                                        boqImpact === impact.id 
                                                        ? 'bg-sky-50 border-sky-200 text-[#0055B3]' 
                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    {impact.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 7. Impact Cost Value in INR */}
                                    <div>
                                        <label className="block text-sm font-extrabold text-slate-700 mb-1.5">Rupee Cost Addition (₹) *</label>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 min-h-[44px] text-sm focus:border-[#0066CC] outline-none font-bold"
                                                placeholder="e.g. 15000"
                                                value={impactCostValue || ''}
                                                onChange={(e) => setImpactCostValue(Number(e.target.value) || 0)}
                                            />
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1">Estimate total extra cost. Use 0 if no change.</p>
                                    </div>

                                    {/* 8. Impact Schedule Days */}
                                    <div>
                                        <label className="block text-sm font-extrabold text-slate-700 mb-1.5">Timeline Delay (Days)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-sm focus:border-[#0066CC] outline-none font-bold"
                                                placeholder="e.g. 5"
                                                value={impactScheduleDays || ''}
                                                onChange={(e) => setImpactScheduleDays(Number(e.target.value) || 0)}
                                            />
                                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Days</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1">Project delay impact. Enter 0 for none.</p>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-5 items-center justify-between pt-2">
                                    {/* Photo upload */}
                                    <div className="w-full sm:w-auto">
                                        <label className="block text-sm font-extrabold text-slate-700 mb-1.5">Upload Site Photo</label>
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
                                                <div className="absolute inset-0 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/60 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                                    <span className="text-white text-xs font-bold">Change</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <button 
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                className="flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-xl border border-dashed border-slate-300 hover:bg-slate-50 text-slate-500 font-medium transition"
                                            >
                                                <Camera className="w-5 h-5" />
                                                <span>Add Site Image</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex flex-col sm:flex-row gap-3 items-center w-full sm:w-auto justify-end">
                                        {formError && (
                                            <div className="text-red-600 text-xs font-bold mr-auto">
                                                {formError} 
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => submitForm(false)}
                                            disabled={!decisionText.trim() || !roomName || !category || isSubmitting}
                                            className="px-5 py-3 min-h-[44px] rounded-xl font-bold text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition w-full sm:w-auto text-center"
                                        >
                                            Save Draft only
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => submitForm(true)}
                                            disabled={!decisionText.trim() || !roomName || !category || isSubmitting}
                                            className="px-6 py-3 min-h-[44px] rounded-xl font-bold text-sm bg-[#0066CC] text-white hover:bg-[#0055B3] disabled:opacity-50 transition flex items-center justify-center gap-2 w-full sm:w-auto shadow-sm"
                                        >
                                            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                            Log & Notify Client
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Attention Notifications for disputed or pending issues */}
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
                            <h4 className={`text-xs font-bold flex items-center gap-2 uppercase tracking-wide ${isDisputed ? 'text-red-800' : 'text-amber-800'}`}>
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                Action Needed: {isDisputed ? 'Client Query Raised' : 'Drawing Signoff Latency'}
                            </h4>
                            <p className={`text-sm mt-1 font-semibold ${isDisputed ? 'text-red-700' : 'text-amber-700'}`}>
                                {isDisputed 
                                    ? `"${decision.title}" in ${decision.roomName} has query raised: "${decision.signoff?.queryText}"`
                                    : `Approval for "${decision.title}" in ${decision.roomName} is pending for ${daysPending} days. Send a WhatsApp reminder.`}
                            </p>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto justify-end">
                            <button 
                                onClick={() => setExpandedRow(id)}
                                className="px-3 py-1.5 text-xs font-bold bg-white border rounded-lg text-slate-700 border-slate-300 hover:bg-slate-50"
                            >
                                View Details
                            </button>
                            <button 
                                onClick={() => {
                                    if (isDisputed) {
                                        handleProvideDriveLink(id);
                                    } else {
                                        handleShareWhatsApp(decision);
                                    }
                                }}
                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap ${isDisputed ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
                            >
                                {isDisputed ? 'Upload drawing revision' : 'WhatsApp Client'}
                            </button>
                        </div>
                    </div>
                );
            })}

            {/* Decision Ledger List */}
            <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                        Historical Ledger entries ({serverDecisions.length})
                    </span>
                    <span className="text-xs text-slate-400 font-medium">Click row to inspect timeline and record signoff</span>
                </div>

                {serverDecisions.length === 0 ? (
                    <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm text-slate-400 font-medium">
                        No active site decisions recorded. Use the logger above to secure your first change.
                    </div>
                ) : (
                    serverDecisions.map(decision => {
                        const id = (decision as any).id;
                        const isExpanded = expandedRow === id;
                        const config = getStatusConfig(decision);
                        const costDisplay = decision.impactCostValue ? formatINR(decision.impactCostValue) : 'No cost change';

                        return (
                            <div 
                                key={id} 
                                className={`bg-white rounded-2xl border transition-all duration-200 shadow-sm overflow-hidden ${
                                    isExpanded ? 'border-slate-400 ring-1 ring-slate-400/10' : 'border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                {/* Compact Ledger Row */}
                                <div 
                                    className="p-4 flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer"
                                    onClick={() => setExpandedRow(isExpanded ? null : id)}
                                >
                                    <div className="flex-1 flex items-start gap-3">
                                        {/* Colored Status Dot */}
                                        <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${config.dot}`} />
                                        
                                        <div className="space-y-1 overflow-hidden">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-extrabold text-slate-900 truncate">
                                                    {decision.title || `${decision.roomName} Update`}
                                                </p>
                                                {decision.impactCostValue ? (
                                                    <span className="inline-flex items-center text-[10px] bg-amber-50 text-amber-700 font-black px-1.5 py-0.5 rounded border border-amber-200">
                                                        +{costDisplay}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                                                        No Cost Change
                                                    </span>
                                                )}
                                                {decision.impactScheduleDays ? (
                                                    <span className="inline-flex items-center text-[10px] bg-sky-50 text-[#0055B3] font-black px-1.5 py-0.5 rounded border border-sky-100">
                                                        +{decision.impactScheduleDays}d delay
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p className="text-xs text-slate-500 line-clamp-1">
                                                {decision.decisionText}
                                            </p>
                                            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                                                <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{decision.roomName}</span>
                                                <span>·</span>
                                                <span>{decision.category}</span>
                                                <span>·</span>
                                                <span>{formatDate(decision.createdAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Action Tags / CTA */}
                                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-6 sm:pl-0">
                                        <div className="flex flex-col items-start sm:items-end gap-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded ${
                                                    config.badge.includes('Failed') ? 'text-red-700 bg-red-50 border border-red-200 animate-pulse' : 'text-slate-600 bg-slate-100'
                                                }`} title={decision.emailError || undefined}>
                                                    {config.badge}
                                                </span>
                                                {decision.emailStatus === 'Sent' && (
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                                        Email Outbound
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            {config.actionLabel && (
                                                <button 
                                                    disabled={isActionLoading === `${config.type}-${id}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (config.action) config.action();
                                                    }}
                                                    className="px-2.5 py-1.5 min-h-[34px] bg-sky-50 text-[#0055B3] hover:bg-sky-100 rounded-lg text-xs font-extrabold transition flex items-center gap-1 whitespace-nowrap border border-sky-100 shadow-sm"
                                                >
                                                    {isActionLoading === `${config.type}-${id}` && <Loader2 className="w-3 h-3 animate-spin"/>}
                                                    {config.actionLabel}
                                                </button>
                                            )}
                                            
                                            {/* WhatsApp Quick share */}
                                            {decision.signoffToken && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleShareWhatsApp(decision);
                                                    }}
                                                    className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-slate-200 transition"
                                                    title="Share directly via WhatsApp"
                                                >
                                                    <Share2 className="w-4 h-4"/>
                                                </button>
                                            )}

                                            <div className="text-slate-400 hover:text-slate-600 transition p-1 rounded-md hover:bg-slate-50">
                                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Content Drawer */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="border-t border-slate-100 bg-slate-50/50 overflow-hidden"
                                        >
                                            <div className="p-4 sm:p-6 flex flex-col md:flex-row gap-6">
                                                {/* Left Details Block */}
                                                <div className="flex-1 space-y-6">
                                                    {editingDecisionId === id ? (
                                                        <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-slate-600">Edit Title</label>
                                                                <input
                                                                    type="text"
                                                                    value={editTitle}
                                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                                    className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-[#0066CC] font-bold"
                                                                />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-slate-600">Edit Description</label>
                                                                <textarea
                                                                    value={editText}
                                                                    onChange={(e) => setEditText(e.target.value)}
                                                                    className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-[#0066CC] min-h-[100px]"
                                                                />
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div className="space-y-1">
                                                                    <label className="text-xs font-bold text-slate-600">Edit Cost Addition (₹)</label>
                                                                    <input
                                                                        type="number"
                                                                        value={editCost}
                                                                        onChange={(e) => setEditCost(Number(e.target.value) || 0)}
                                                                        className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-[#0066CC] font-semibold"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <label className="text-xs font-bold text-slate-600">Edit Delay (Days)</label>
                                                                    <input
                                                                        type="number"
                                                                        value={editSchedule}
                                                                        onChange={(e) => setEditSchedule(Number(e.target.value) || 0)}
                                                                        className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-[#0066CC] font-semibold"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-2 pt-2">
                                                                <button
                                                                    onClick={() => submitEdit(id)}
                                                                    disabled={isActionLoading === `edit-${id}`}
                                                                    className="bg-[#0066CC] text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                                                                >
                                                                    {isActionLoading === `edit-${id}` && <Loader2 className="w-3 h-3 animate-spin"/>}
                                                                    Save Changes
                                                                </button>
                                                                <button
                                                                    onClick={() => setEditingDecisionId(null)}
                                                                    className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-4">
                                                            <div>
                                                                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Ledger Specification</span>
                                                                <p className="text-sm text-slate-900 font-bold mt-1">{decision.title || `${decision.roomName} Update`}</p>
                                                                <p className="text-sm text-slate-900/90 leading-relaxed whitespace-pre-wrap mt-1">
                                                                    {decision.decisionText}
                                                                </p>
                                                            </div>

                                                            {/* Horizontal Grid details */}
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-100/50 p-3 rounded-xl border border-slate-200 text-xs">
                                                                <div>
                                                                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Area Context</span>
                                                                    <span className="font-bold text-slate-700">{decision.roomName}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Category</span>
                                                                    <span className="font-bold text-slate-700">{decision.category}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Log Presentees</span>
                                                                    <span className="font-bold text-slate-700">{decision.presentees || '-'}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">BOQ Scope Impact</span>
                                                                    <span className={`${decision.boqImpact !== 'none' ? 'text-amber-700 font-black' : 'text-slate-700 font-bold'} `}>
                                                                        {renderBoqImpactLabel(decision.boqImpact)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* SOP COMPLIANT DIGITAL AUDIT TIMELINE */}
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
                                                                        <Mail className="w-3.5 h-3.5 text-[#0055B3]" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-bold text-slate-700">Client Notified via System Portal</p>
                                                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                                                            Dispatched on {formatDate(decision.notifiedAt)} · Status: <span className="font-bold text-[#0066CC]">{decision.emailStatus || 'Sent'}</span>
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

                                                    {activeLinkDecision === id && (
                                                        <div className="pt-2 w-full max-w-lg bg-white p-4 rounded-xl border border-slate-200 shadow-inner">
                                                            <label className="text-xs font-bold text-slate-700 mb-1.5 block">Attach Technical Revision / Drawing</label>
                                                            <div className="flex flex-col gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                                                <div>
                                                                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">1. Upload PDF / Blueprint Image</label>
                                                                    <input 
                                                                        type="file"
                                                                        accept="application/pdf,image/*"
                                                                        onChange={(e) => setDrawingFile(e.target.files?.[0] || null)}
                                                                        className="text-sm text-slate-600 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white file:border file:border-slate-200 file:text-slate-700 hover:file:bg-slate-100 w-full"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">2. Or paste Direct Cloud Drive Link (Drive/Dropbox)</label>
                                                                    <input 
                                                                        autoFocus
                                                                        type="text" 
                                                                        value={linkValue}
                                                                        onChange={(e) => setLinkValue(e.target.value)}
                                                                        placeholder="https://drive.google.com/..." 
                                                                        className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 focus:ring-1 focus:ring-[#0066CC] py-1.5"
                                                                    />
                                                                </div>
                                                                <div className="flex gap-2 pt-1 border-t border-slate-200 mt-1 pb-1">
                                                                    <button
                                                                        onClick={() => submitDriveLink(id)}
                                                                        disabled={isActionLoading === `drawing-${id}` || (!linkValue.trim() && !drawingFile)}
                                                                        className="bg-[#0066CC] text-white px-4 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center min-w-[120px]"
                                                                    >
                                                                        {isActionLoading === `drawing-${id}` ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Upload & Save'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setActiveLinkDecision(null); setDrawingFile(null); }}
                                                                        className="bg-white border border-slate-300 text-slate-700 px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {activeManualSignoffDecision?.id === id && (
                                                        <div className="pt-2 w-full max-w-md bg-white p-4 rounded-xl border border-slate-200">
                                                            <label className="text-xs font-bold text-slate-700 mb-1 block">Manual {activeManualSignoffDecision.type === 'approved' ? 'Approval Reference (e.g. Approved via WhatsApp chat)' : 'Query details'}</label>
                                                            <div className="flex gap-2">
                                                                <input 
                                                                    autoFocus
                                                                    type="text" 
                                                                    value={manualSignoffText}
                                                                    onChange={(e) => setManualSignoffText(e.target.value)}
                                                                    placeholder={activeManualSignoffDecision.type === 'approved' ? "e.g. Approved on WhatsApp on Oct 14" : "Describe client concern..."} 
                                                                    className="flex-1 bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 focus:ring-1 focus:ring-[#0066CC] py-1.5"
                                                                />
                                                                <button
                                                                    onClick={() => submitManualSignoff(id, activeManualSignoffDecision.type)}
                                                                    disabled={isActionLoading === `manual-${activeManualSignoffDecision.type}-${id}` || (activeManualSignoffDecision.type === 'queried' && !manualSignoffText.trim())}
                                                                    className="bg-[#0066CC] text-white px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                                                                >
                                                                    {isActionLoading === `manual-${activeManualSignoffDecision.type}-${id}` ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Save Signoff'}
                                                                </button>
                                                                <button
                                                                    onClick={() => setActiveManualSignoffDecision(null)}
                                                                    className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {deletingDecisionId === id && (
                                                        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
                                                            <span className="text-xs font-bold text-red-800">Are you sure you want to delete this decision ledger entry?</span>
                                                            <div className="flex gap-2">
                                                                <button onClick={() => executeDelete(id)} disabled={isActionLoading === `delete-${id}`} className="bg-red-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-sm">Yes, delete</button>
                                                                <button onClick={() => setDeletingDecisionId(null)} className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold">Cancel</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Drawer Interactive SOP Actions */}
                                                    <div className="pt-2 flex flex-wrap gap-2.5">
                                                        {['notified', 'drawing_pending', 'drawing_sent', 'disputed'].includes(decision.status) && (
                                                            <button 
                                                                onClick={() => handleProvideDriveLink(id)}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                                                            >
                                                                <FileUp className="w-3.5 h-3.5 text-slate-500"/> {decision.status === 'notified' ? 'Attach Revision Drawing' : 'Update Technical Drawing'}
                                                            </button>
                                                        )}
                                                        {['drawing_pending', 'drawing_sent'].includes(decision.status) && (
                                                            <>
                                                                <button 
                                                                    onClick={() => handleManualSignoff(id, 'approved')}
                                                                    disabled={isActionLoading === `manual-approved-${id}`}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-sm"
                                                                    title="Record manual client approval received verbally or via WhatsApp"
                                                                >
                                                                    {isActionLoading === `manual-approved-${id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Record Manual Approval'}
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleManualSignoff(id, 'queried')}
                                                                    disabled={isActionLoading === `manual-queried-${id}`}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-800 hover:bg-red-100 transition shadow-sm"
                                                                    title="Record manual query or client objection"
                                                                >
                                                                    {isActionLoading === `manual-queried-${id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Record Manual Query'}
                                                                </button>
                                                            </>
                                                        )}
                                                        
                                                        <button 
                                                            onClick={() => handleDownloadPDF(decision)}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                                                        >
                                                            <Download className="w-3.5 h-3.5 text-slate-500"/> Download Ledger PDF
                                                        </button>
                                                        
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

                                                {/* Right Media Assets Panel */}
                                                <div className="flex gap-3 sm:flex-col sm:w-48 shrink-0">
                                                    {decision.photoURL && (
                                                        <a href={decision.photoURL} target="_blank" rel="noreferrer" className="flex-1 sm:flex-none aspect-video sm:aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white block group relative shadow-sm">
                                                            <img src={decision.photoURL} alt="Site Visit Snapshot" className="w-full h-full object-cover transition duration-300 group-hover:scale-105" />
                                                            <div className="absolute inset-0 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                                                <span className="text-white text-[10px] font-black uppercase tracking-wider">Inspect Photo</span>
                                                            </div>
                                                        </a>
                                                    )}
                                                    {decision.drawingURL && (
                                                        <a href={decision.drawingURL} target="_blank" rel="noreferrer" className="flex-1 sm:flex-none aspect-video sm:aspect-square rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-[#0066CC] hover:border-sky-200 hover:bg-sky-50 transition p-3 text-center group relative shadow-sm">
                                                            <FileText className="w-8 h-8 text-[#0066CC]" />
                                                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">Technical Revision Blueprint</span>
                                                            <div className="absolute inset-0 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                                                <Download className="w-6 h-6 text-sky-400" />
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

            {/* QUICK WHATSAPP / CHAT SHARING MODAL */}
            <AnimatePresence>
                {shareModalDecision && (
                    <div className="fixed inset-0 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden"
                        >
                            <div className="bg-emerald-600 p-4 text-white flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <span className="p-1 bg-white/20 rounded-lg"><Share2 className="w-4 h-4 text-white"/></span>
                                    <h4 className="font-extrabold text-sm sm:text-base">WhatsApp Approval Dispatch</h4>
                                </div>
                                <button onClick={() => setShareModalDecision(null)} className="p-1 hover:bg-white/20 rounded-lg text-white">
                                    <X className="w-4.5 h-4.5"/>
                                </button>
                            </div>

                            <div className="p-5 space-y-4">
                                <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-xs text-emerald-800 leading-relaxed">
                                    Clients reply up to 8x faster on WhatsApp! Copy this highly professional pre-filled template containing a 1-click legal approval link.
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] uppercase font-bold text-slate-400">Pre-formatted Message Template</span>
                                        <button 
                                            onClick={copyShareText}
                                            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                                        >
                                            {copiedShareLink ? <Check className="w-3.5 h-3.5 text-emerald-600"/> : <Copy className="w-3.5 h-3.5"/>}
                                            {copiedShareLink ? 'Copied!' : 'Copy Template'}
                                        </button>
                                    </div>
                                    <div className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs font-medium text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto font-mono select-all">
                                        {getShareMessageText(shareModalDecision)}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Direct Client-Portal URL</span>
                                    <div className="flex gap-2">
                                        <input 
                                            readOnly
                                            type="text" 
                                            value={getShareURL(shareModalDecision)}
                                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono px-3 py-2 text-slate-600"
                                        />
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(getShareURL(shareModalDecision));
                                                showToast("Link copied to clipboard!", "success");
                                            }}
                                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-sm"
                                        >
                                            Copy Link
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2.5">
                                <button
                                    onClick={() => setShareModalDecision(null)}
                                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 shadow-sm"
                                >
                                    Close
                                </button>
                                <a
                                    href={`https://wa.me/${projectContext.clientPhone || ''}?text=${encodeURIComponent(getShareMessageText(shareModalDecision))}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => setShareModalDecision(null)}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-sm"
                                >
                                    Open Web WhatsApp
                                </a>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            
        </div>
    );
}
