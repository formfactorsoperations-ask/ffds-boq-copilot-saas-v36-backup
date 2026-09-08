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
    ChevronDown, 
    ChevronUp, 
    Clock, 
    FileText,
    FileUp, 
    Download, 
    AlertCircle, 
    CheckCircle, 
    X, 
    Share2, 
    Copy, 
    Check, 
    Calendar, 
    DollarSign, 
    ShieldCheck, 
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
    updateDecisionText,
    replyToDecisionQuery
} from '../../services/decisionsService';
import { getStorage, ref, uploadString, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getApp } from 'firebase/app';
import { formatINR } from '../../lib/utils';
// The portal decides design-vs-site with this exact function. Importing it
// rather than re-deriving keeps the studio from labelling a decision one way
// while the client is told the other.
import { decisionNature as resolveNature } from '../../services/clientPortalEngine';

import { downloadDecisionPdf } from './decisions/decisionPdf';
import DecisionKpiStrip from './decisions/DecisionKpiStrip';
import DecisionStatusRail from './decisions/DecisionStatusRail';
import DecisionShareModal from './decisions/DecisionShareModal';
import ConfirmDialog, { ConfirmRequest } from './decisions/ConfirmDialog';
import DecisionAuditTimeline from './decisions/DecisionAuditTimeline';
import DecisionAttentionPanel, { AttentionItem } from './decisions/DecisionAttentionPanel';
import { sendDecisionNotification, sendSignoffRequest } from '../../services/emailService';
import { useOrg } from '../../contexts/OrgContext';
import { issuePortalAccess } from '../../services/portalAccessService';

interface DecisionTrackerProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    projectId: string;
    /**
     * The decision ledger, subscribed to once in App. This screen used to open
     * its own onSnapshot on the same query, which meant the client portal's
     * copy of the decisions only refreshed while the screen was mounted.
     */
    decisionLedger: DecisionData[];
}

export default function DecisionTracker({ projectContext, setProjectContext, projectId, decisionLedger }: DecisionTrackerProps) {
    const { orgData } = useOrg();
    const studioId = orgData?.tenantId || 'demo-tenant-01';
    const studioName = orgData?.orgName || 'Form Factors Design Studio';
    
    const decisions = decisionLedger;
    
    // Form state
    const [isFormOpen, setIsFormOpen] = useState(false);
    
    // AI Form Input

    // Decision Fields
    const [title, setTitle] = useState('');
    const [decisionText, setDecisionText] = useState('');
    const [roomName, setRoomName] = useState('');
    const [category, setCategory] = useState<'Site Condition' | 'Client Request' | 'Design Upgrade' | 'Value Engineering'>('Site Condition');

    /**
     * Design decision or site decision.
     *
     * Everything logged before execution is a design decision — nothing can be
     * held up on a site that has not been handed over. This defaults from the
     * project's stage rather than always assuming site, and stays switchable
     * because the studio sometimes logs a site constraint during design.
     */
    const isExecutionStage = (projectContext?.currentStage ?? 0) >= 5;
    const [decisionNature, setDecisionNature] = useState<'design' | 'site'>(
        isExecutionStage ? 'site' : 'design'
    );
    const [presentees, setPresentees] = useState('');
    const [boqImpact, setBoqImpact] = useState<'none' | 'rate_change' | 'new_item'>('none');
    const [impactCostValue, setImpactCostValue] = useState<number>(0);
    const [impactScheduleDays, setImpactScheduleDays] = useState<number>(0);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Active Rows and Modals
    const [pendingShareId, setPendingShareId] = useState<string | null>(null);
    const [replyingDecisionId, setReplyingDecisionId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [natureFilter, setNatureFilter] = useState<'all' | 'design' | 'site'>('all');
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
    /*
      The ledger subscription and the projection onto
      projectContext.projectDecisions both live in App now, so the portal stays
      current whether or not this screen is open. Two onSnapshot listeners on
      this same query put the Firestore SDK into an inconsistent target state
      ("INTERNAL ASSERTION FAILED (ID: b815)"), so this screen must not open
      one of its own -- it reads the array App passes down.
    */

    /*
      The share sheet needs the decision's signoff token, which is generated
      inside saveDecision and only reaches this screen on the next ledger
      snapshot. So the publish records an intent, and this opens the sheet once
      the record actually arrives.
    */
    useEffect(() => {
        if (!pendingShareId) return;
        const fresh = decisions.find(
            (d: any) => d.id === pendingShareId && d.signoffToken
        );
        if (fresh) {
            setShareModalDecision(fresh);
            setCopiedShareLink(false);
            setPendingShareId(null);
        }
    }, [pendingShareId, decisions]);

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
        setDecisionNature(isExecutionStage ? 'site' : 'design');
        setPresentees('');
        setBoqImpact('none');
        setImpactCostValue(0);
        setImpactScheduleDays(0);
        setPhotoUrl(null);
        setIsFormOpen(false);
    };


    const submitForm = async (notifyClient: boolean) => {
        if (!decisionText.trim() || !roomName || !category) return;

        /*
          Publishing is the irreversible half: it leaves draft, appears in the
          client's portal and fires a notification. One click did all of that
          with no way back, on a form that is easy to submit before it is
          finished. Naming the client makes the consequence concrete.
        */
        if (notifyClient) {
            const who = projectContext.clientName || 'the client';
            setConfirmRequest({
                title: `Publish this to ${who}?`,
                body: 'They will see it in their portal and be asked to approve it. Drafts stay private until you publish.',
                confirmLabel: 'Publish',
                cancelLabel: 'Not yet',
                onConfirm: () => { void publishDecision(true); },
            });
            return;
        }

        void publishDecision(false);
    };

    /** The write itself, once the studio has said yes. */
    const publishDecision = async (notifyClient: boolean) => {
        setIsSubmitting(true);
        setFormError(null);

        try {
            const formData = {
                title: title.trim() || `${roomName} Decision`,
                decisionText: decisionText.trim(),
                roomName,
                category,
                decisionNature,
                presentees: presentees.trim(),
                boqImpact,
                impactCostValue: Number(impactCostValue) || 0,
                impactScheduleDays: Number(impactScheduleDays) || 0,
                clientName: projectContext.clientName || 'Client',
                clientEmail: projectContext.clientEmail || '',
                projectName: projectContext.name || 'Project',
                studioId
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
                /*
                  Publishing and emailing are two different things and they fail
                  independently. `sendDecisionNotification` moves the decision out
                  of draft -- which is what puts it in the client portal -- and
                  then tries to email. A failed email was being reported as though
                  the whole action had failed, so nobody could tell whether the
                  client could see the decision. They can; they just were not
                  told about it.
                */
                const mailRes = await sendDecisionNotification(decisionId, projectId, studioId);
                showToast(
                    mailRes.success
                        ? 'Published to the client portal and emailed.'
                        : `Published to the client portal. Email not sent — ${mailRes.error || 'unknown reason'}.`,
                    'success'
                );
                // Either way the client still has to be nudged, and WhatsApp is
                // the channel that needs no API key and actually gets read.
                setPendingShareId(decisionId);
            } else {
                showToast("Saved as a draft. The client cannot see it yet.", "success");
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
                showToast(
                    `Published to the client portal. Email not sent — ${mailRes.error || 'unknown reason'}. Share the link on WhatsApp instead.`,
                    'success'
                );
            } else {
                showSuccessWithNext('Published to the client portal and emailed.');
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
                showToast(
                    `Sign-off is open in the client portal. Email not sent — ${mailRes.error || 'unknown reason'}. Share the link on WhatsApp instead.`,
                    'success'
                );
            } else {
                showSuccessWithNext('Sign-off requested in the portal and emailed.');
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
                showToast(
                    `Reminder not sent — ${mailRes.error || 'unknown reason'}. Nothing has reached the client; use WhatsApp.`,
                    'error'
                );
            } else {
                showSuccessWithNext('Reminder emailed.');
            }
        } catch(e: any) {
            console.error("Error sending reminder", e);
            showToast("Failed: " + e.message, 'error');
        } finally {
            setIsActionLoading(null);
        }
    };

    // The certificate itself lives in decisions/decisionPdf.ts.
    const handleDownloadPDF = (decision: DecisionData) => {
        downloadDecisionPdf(decision, studioName, (msg) => showToast(msg, 'error'));
    };

    const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

    /** True while a mousedown that began on the backdrop is still in flight. */
    const backdropPressRef = useRef(false);

    /** Anything typed into the logging form. */
    const formHasContent = () =>
        Boolean(
            decisionText.trim() ||
            title.trim() ||
            roomName ||
            presentees.trim() ||
            photoUrl ||
            impactCostValue ||
            impactScheduleDays
        );

    /*
      Losing a half-written decision to a stray click is worse than one extra
      confirm. Only asks when there is something to lose.
    */
    const closeFormSafely = () => {
        if (!formHasContent()) {
            resetForm();
            return;
        }
        setConfirmRequest({
            title: 'Discard this decision?',
            body: 'What you have typed will be lost. Nothing has been saved yet.',
            confirmLabel: 'Discard',
            cancelLabel: 'Keep editing',
            tone: 'danger',
            onConfirm: resetForm,
        });
    };

    const startReply = (decisionId: string) => {
        setExpandedRow(decisionId);
        setReplyingDecisionId(decisionId);
        setReplyText('');
        setActiveLinkDecision(null);
        setEditingDecisionId(null);
        setDeletingDecisionId(null);
    };

    /*
      Answer the client's question and hand the decision back to them.
      Uploading a revised drawing stays available beside this, but it is no
      longer the only way out of a query -- most questions want a sentence.
    */
    const submitReply = async (decisionId: string) => {
        if (!replyText.trim()) return;
        setIsActionLoading(`reply-${decisionId}`);
        try {
            await replyToDecisionQuery(projectId, decisionId, replyText.trim());
            setReplyingDecisionId(null);
            setReplyText('');
            showToast('Answer sent. The decision is back with the client.', 'success');
        } catch (e: any) {
            showToast('Could not send the answer: ' + e.message, 'error');
        } finally {
            setIsActionLoading(null);
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
            case 'disputed': return { dot: 'bg-red-500', badge: 'Query raised', actionLabel: 'Answer the query', action: () => startReply((decision as any).id), type: 'reply' };
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

    const stageNumber = projectContext?.currentStage ?? 0;
    const natureOf = (d: DecisionData) => resolveNature(d as any, stageNumber);

    const natureCounts = {
        all: serverDecisions.length,
        design: serverDecisions.filter(d => natureOf(d) === 'design').length,
        site: serverDecisions.filter(d => natureOf(d) === 'site').length,
    };

    const visibleDecisions = natureFilter === 'all'
        ? serverDecisions
        : serverDecisions.filter(d => natureOf(d) === natureFilter);

    /*
      Everything stuck on somebody, worst first.
      `drawing_sent` inside the reminder window is deliberately absent: the ball
      is with the client and there is nothing for the studio to do yet.
    */
    const DAY = 24 * 60 * 60 * 1000;
    const attentionItems: AttentionItem[] = serverDecisions.flatMap((decision): AttentionItem[] => {
        const id = (decision as any).id;
        const where = decision.roomName ? ` in ${decision.roomName}` : '';
        const name = `"${decision.title || decision.roomName || 'This decision'}"`;
        const view = () => setExpandedRow(id);

        if (decision.status === 'disputed') {
            return [{
                id, tone: 'blocked' as const,
                label: 'Query raised',
                detail: `${name}${where} — ${decision.signoff?.queryText || 'the client raised a query without leaving a note.'}`,
                actionLabel: 'Answer it',
                onAction: () => startReply(id),
                onView: view,
            }];
        }

        if (decision.status === 'notified') {
            return [{
                id, tone: 'todo' as const,
                label: 'Drawing needed',
                detail: `${name}${where} — the client has been told, but there is no drawing to approve yet.`,
                actionLabel: 'Attach drawing',
                onAction: () => handleProvideDriveLink(id),
                onView: view,
            }];
        }

        if (decision.status === 'drawing_pending') {
            return [{
                id, tone: 'todo' as const,
                label: 'Not sent',
                detail: `${name}${where} — the drawing is attached but sign-off has never been requested.`,
                actionLabel: 'Request sign-off',
                onAction: () => handleSendSignoff(id),
                onView: view,
            }];
        }

        const sentAt = (decision.signoffRequestSentAt as any)?.toDate?.();
        if (decision.status === 'drawing_sent' && sentAt && Date.now() - sentAt.getTime() > 5 * DAY) {
            const days = Math.floor((Date.now() - sentAt.getTime()) / DAY);
            return [{
                id, tone: 'waiting' as const,
                label: `Quiet ${days} days`,
                detail: `${name}${where} — sent for sign-off ${days} days ago with no answer.`,
                actionLabel: 'Chase on WhatsApp',
                onAction: () => handleShareWhatsApp(decision),
                onView: view,
            }];
        }

        return [];
    }).sort((a, b) => {
        const rank = { blocked: 0, waiting: 1, todo: 2 };
        return rank[a.tone] - rank[b.tone];
    });

    const stats = {
        total: serverDecisions.length,
        signed: serverDecisions.filter(d => d.status === 'signed').length,
        waiting: serverDecisions.filter(d => ['notified', 'drawing_pending', 'drawing_sent', 'disputed'].includes(d.status)).length,
        disputed: serverDecisions.filter(d => d.status === 'disputed').length,
    };

    /** A live portal token for this project, minting one if there is none. */
    const ensurePortalToken = (): string | null => {
        const access = (projectContext as any)?.portalAccess as
            | { token: string; expiresAt?: string }
            | undefined;
        const live =
            access?.token &&
            (!access.expiresAt || new Date(access.expiresAt).getTime() > Date.now());
        if (live) return access!.token;

        if (!projectId) return null;
        const fresh = issuePortalAccess(projectId, projectContext.clientEmail);
        setProjectContext((prev) => ({ ...(prev as any), portalAccess: fresh }));
        return fresh.token;
    };

    const handleShareWhatsApp = (decision: DecisionData) => {
        // Minting is a write, so it happens on the click, not in render.
        ensurePortalToken();
        setShareModalDecision(decision);
        setCopiedShareLink(false);
    };

    const getShareURL = (decision: DecisionData) => {
        /*
          VITE_APP_DOMAIN first, exactly as emailService and the contract pages
          already do it. This one place used window.location.origin alone, which
          on a studio machine is http://localhost:3000 -- so every link copied
          into WhatsApp pointed at the client's own computer, where nothing is
          running. The page was never broken; the address was.
        */
        const appDomain = import.meta.env.VITE_APP_DOMAIN || window.location.origin;
        /*
          The standalone sign-off page is gone; decisions are approved in the
          portal, so the portal is what gets shared.
        */
        const access = (projectContext as any)?.portalAccess as { token?: string } | undefined;
        return access?.token ? `${appDomain}/?portal=${access.token}` : appDomain;
    };

    const getShareMessageText = (decision: DecisionData) => {
        const clientName = decision.clientName || 'Client';
        const costStr = decision.impactCostValue ? formatINR(decision.impactCostValue) : 'No cost change';
        const link = getShareURL(decision);
        // Points at the portal now, so the wording asks them to review there.
        return `Hi ${clientName}, we have logged a decision on *${decision.roomName}*.\n\n*${decision.title || `${decision.roomName} Update`}*\n*Cost:* ${costStr}\n*Timeline:* ${decision.impactScheduleDays ? `+${decision.impactScheduleDays} days` : 'No delay'}\n\nPlease review it in your project portal and approve, or tell us if you have a question:\n👉 ${link}\n\nThank you!\n-${studioName}`;
    };

    /**
     * Copy, and say honestly whether it worked.
     *
     * The clipboard API is missing in an insecure context and rejects when the
     * page is not focused, so this has to cope with both. The text is selectable
     * in the sheet either way -- what must not happen is a silent no-op that
     * looks like a success.
     */
    const copyToClipboard = async (text: string, label: string) => {
        try {
            if (!navigator.clipboard) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(text);
            showToast(`${label} copied.`, 'success');
            return true;
        } catch {
            showToast(`Could not copy the ${label.toLowerCase()} — select it and copy manually.`, 'error');
            return false;
        }
    };

    const copyShareText = () => {
        if (!shareModalDecision) return;
        setCopiedShareLink(true);
        setTimeout(() => setCopiedShareLink(false), 2000);
        void copyToClipboard(getShareMessageText(shareModalDecision), 'Message');
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

            <DecisionKpiStrip
                stats={stats}
                covered={totalCostProtection}
                atRisk={activeExposure}
            />

            {/* Form Trigger / Header */}
            <div className="flex flex-wrap gap-3 justify-between items-center bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/70">
                <div className="flex items-center gap-3">
                    <span className="p-2 bg-sky-50 text-[#0066CC] rounded-xl border border-sky-100"><CheckCircle className="w-5 h-5"/></span>
                    <div>
                        <h3 className="font-extrabold text-slate-900 leading-tight">Decision Ledger</h3>
                        <p className="text-[11.5px] text-slate-400 font-medium mt-0.5">
                            Every change, what it cost, and who agreed to it
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#0066CC] text-white rounded-xl font-bold text-sm hover:bg-[#0055B3] transition"
                >
                    <Plus className="w-4 h-4" />
                    Log a Decision
                </button>
            </div>

            {/* The logging form, as a modal. */}
            <AnimatePresence>
                {isFormOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-[140] bg-slate-900/45 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
                        onMouseDown={(e: React.MouseEvent) => {
                            backdropPressRef.current = e.target === e.currentTarget;
                        }}
                        onClick={(e: React.MouseEvent) => {
                            if (e.target !== e.currentTarget || !backdropPressRef.current) return;
                            backdropPressRef.current = false;
                            closeFormSafely();
                        }}
                    >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 10 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        className="bg-white rounded-3xl border border-slate-200/70 shadow-2xl w-full max-w-3xl my-auto p-5 sm:p-6 space-y-6 max-h-[92vh] overflow-y-auto"
                    >
                        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 sticky -top-5 sm:-top-6 bg-white pt-1 z-10">
                            <div>
                                <h4 className="font-extrabold text-slate-900 text-base">Log a decision</h4>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Three things: what was decided, where it applies, and what it changes.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeFormSafely}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition shrink-0"
                                aria-label="Close"
                            >
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        {/* 1 — What was decided.
                            The client reads this text verbatim, so it is the field that
                            deserves the room, and it leads rather than sitting fourth
                            behind a title and a dropdown. */}
                        <section className="space-y-3">
                            <div className="flex items-baseline gap-2">
                                <span className="text-[11px] font-black text-slate-300 tabular-nums">01</span>
                                <h5 className="text-sm font-extrabold text-slate-800">What was decided</h5>
                            </div>

                            <textarea
                                className="w-full border border-slate-200 rounded-2xl p-3.5 text-sm focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] outline-none min-h-[110px] leading-relaxed"
                                placeholder="Move the living room TV point 6 inches right so it clears the laminate panel."
                                value={decisionText}
                                onChange={(e) => setDecisionText(e.target.value)}
                            />
                            <p className="text-[11px] text-slate-400 -mt-1">
                                Written the way the client will read it — this text is shown to them verbatim.
                            </p>

                            <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                        Short name <span className="font-medium text-slate-400">— optional</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-sm focus:border-[#0066CC] outline-none"
                                        placeholder={roomName ? roomName + " decision" : "e.g. TV unit laminate"}
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                        Photo <span className="font-medium text-slate-400">— optional</span>
                                    </label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleImageUpload}
                                    />
                                    {photoUrl ? (
                                        <div
                                            className="relative w-[44px] h-[44px] rounded-xl overflow-hidden border border-slate-200 group cursor-pointer"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <img src={photoUrl} alt="Attached" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                                <span className="text-white text-[10px] font-bold">Change</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl border border-dashed border-slate-300 hover:bg-slate-50 text-slate-500 text-sm font-medium transition"
                                        >
                                            <Camera className="w-4 h-4" />
                                            Add
                                        </button>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* 2 — Where it applies, and why it came up. */}
                        <section className="space-y-3">
                            <div className="flex items-baseline gap-2">
                                <span className="text-[11px] font-black text-slate-300 tabular-nums">02</span>
                                <h5 className="text-sm font-extrabold text-slate-800">Where and why</h5>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Room or area</label>
                                    <select
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-sm focus:border-[#0066CC] outline-none bg-white"
                                        value={roomName}
                                        onChange={(e) => setRoomName(e.target.value)}
                                    >
                                        <option value="">Choose a room…</option>
                                        {projectContext.rooms?.map(r => (
                                            <option key={r.name} value={r.name}>{r.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">This holds up</label>
                                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1 w-full">
                                        {([
                                            { id: 'design' as const, label: 'Drawings' },
                                            { id: 'site' as const,   label: 'Site work' },
                                        ]).map(opt => (
                                            <button
                                                type="button"
                                                key={opt.id}
                                                onClick={() => setDecisionNature(opt.id)}
                                                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition ${
                                                    decisionNature === opt.id
                                                        ? 'bg-white text-[#0055B3] shadow-sm border border-sky-200'
                                                        : 'text-slate-500 hover:text-slate-800'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    {!isExecutionStage && decisionNature === 'site' && (
                                        <p className="text-[11px] text-amber-700 font-semibold mt-1.5">
                                            This project has not reached execution — the client will be told site work is held.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5">Why it came up</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {(['Site Condition', 'Client Request', 'Design Upgrade', 'Value Engineering'] as const).map(cat => (
                                        <button
                                            type="button"
                                            key={cat}
                                            onClick={() => setCategory(cat)}
                                            className={`px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold border transition ${
                                                category === cat
                                                    ? 'bg-sky-50 border-sky-200 text-[#0055B3]'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                    Who was there <span className="font-medium text-slate-400">— optional</span>
                                </label>
                                <input
                                    type="text"
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-sm focus:border-[#0066CC] outline-none"
                                    placeholder="Amit (client), site supervisor"
                                    value={presentees}
                                    onChange={(e) => setPresentees(e.target.value)}
                                />
                            </div>
                        </section>

                        {/* 3 — Consequences.
                            Most decisions move nothing, so "nothing" is the default and the
                            rupee field stays out of the way until the answer changes. Asking
                            for a number on every log is how you get a ledger full of zeroes. */}
                        <section className="space-y-3">
                            <div className="flex items-baseline gap-2">
                                <span className="text-[11px] font-black text-slate-300 tabular-nums">03</span>
                                <h5 className="text-sm font-extrabold text-slate-800">What it changes</h5>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {[
                                    { id: 'none', label: 'Nothing — no cost change' },
                                    { id: 'rate_change', label: 'A rate changes' },
                                    { id: 'new_item', label: 'A new item is added' }
                                ].map(impact => (
                                    <button
                                        type="button"
                                        key={impact.id}
                                        onClick={() => {
                                            setBoqImpact(impact.id as any);
                                            if (impact.id === 'none') setImpactCostValue(0);
                                        }}
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

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <AnimatePresence initial={false}>
                                    {boqImpact !== 'none' && (
                                        <motion.div
                                            key="cost"
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                        >
                                            <label className="block text-xs font-bold text-slate-500 mb-1.5">How much more</label>
                                            <div className="relative">
                                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 min-h-[44px] text-sm focus:border-[#0066CC] outline-none font-bold"
                                                    placeholder="15000"
                                                    value={impactCostValue || ''}
                                                    onChange={(e) => setImpactCostValue(Number(e.target.value) || 0)}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">
                                        Days of delay <span className="font-medium text-slate-400">— if any</span>
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-sm focus:border-[#0066CC] outline-none font-bold"
                                        placeholder="0"
                                        value={impactScheduleDays || ''}
                                        onChange={(e) => setImpactScheduleDays(Number(e.target.value) || 0)}
                                    />
                                </div>
                            </div>
                        </section>

                        <div className="flex flex-col sm:flex-row gap-3 items-center justify-end pt-4 border-t border-slate-100">
                            {formError && (
                                <div className="text-red-600 text-xs font-bold mr-auto">{formError}</div>
                            )}
                            {!formError && (!decisionText.trim() || !roomName) && (
                                <p className="text-[11px] text-slate-400 mr-auto">
                                    {!decisionText.trim() ? 'Say what was decided' : 'Choose a room'} to save this.
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={() => submitForm(false)}
                                disabled={!decisionText.trim() || !roomName || !category || isSubmitting}
                                className="px-5 py-3 min-h-[44px] rounded-xl font-bold text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition w-full sm:w-auto"
                            >
                                Save as draft
                            </button>
                            <button
                                type="button"
                                onClick={() => submitForm(true)}
                                disabled={!decisionText.trim() || !roomName || !category || isSubmitting}
                                className="px-6 py-3 min-h-[44px] rounded-xl font-bold text-sm bg-[#0066CC] text-white hover:bg-[#0055B3] disabled:opacity-50 transition flex items-center justify-center gap-2 w-full sm:w-auto"
                            >
                                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                Publish and share
                            </button>
                        </div>
                    </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <DecisionAttentionPanel items={attentionItems} />

            {/* Decision Ledger List */}
            <div className="space-y-3.5">
                <div className="flex flex-wrap justify-between items-center gap-3 px-1">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                        Historical Ledger entries ({visibleDecisions.length}
                        {natureFilter !== 'all' && ` of ${serverDecisions.length}`})
                    </span>

                    {/* Design and site decisions hold different things up, and the
                        studio usually wants one or the other. Counts sit on the
                        control so an empty lane is obvious before it is opened. */}
                    <div className="flex items-center gap-3">
                        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
                            {([
                                { id: 'all' as const,    label: 'All' },
                                { id: 'design' as const, label: 'Design' },
                                { id: 'site' as const,   label: 'Site' },
                            ]).map(opt => (
                                <button
                                    type="button"
                                    key={opt.id}
                                    onClick={() => setNatureFilter(opt.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                        natureFilter === opt.id
                                            ? 'bg-white text-[#0055B3] shadow-sm border border-sky-200'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    {opt.label}
                                    <span className="ml-1.5 text-[10px] font-black text-slate-400 tabular-nums">
                                        {natureCounts[opt.id]}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <span className="hidden lg:inline text-xs text-slate-400 font-medium">Click row to inspect timeline and record signoff</span>
                    </div>
                </div>

                {visibleDecisions.length === 0 ? (
                    <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm text-slate-400 font-medium">
                        {serverDecisions.length === 0
                            ? 'No decisions recorded yet. Use the logger above to secure your first change.'
                            : `No ${natureFilter} decisions on this project yet.`}
                    </div>
                ) : (
                    visibleDecisions.map((decision, rowIndex) => {
                        const id = (decision as any).id;
                        const isExpanded = expandedRow === id;
                        const config = getStatusConfig(decision);
                        const costDisplay = decision.impactCostValue ? formatINR(decision.impactCostValue) : 'No cost change';

                        return (
                            <motion.div
                                key={id}
                                /* Rows arrive in the order they are read. The step is small
                                   and capped: past the first handful a stagger stops being
                                   sequence and starts being waiting. */
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                    duration: 0.3,
                                    ease: [0.22, 1, 0.36, 1],
                                    delay: Math.min(rowIndex, 6) * 0.03,
                                }}
                                whileHover={isExpanded ? undefined : { y: -2 }}
                                className={`bg-white rounded-2xl border overflow-hidden transition-[border-color,box-shadow] duration-200 ${
                                    isExpanded
                                        ? 'border-[#0066CC]/40 ring-1 ring-[#0066CC]/10 shadow-md'
                                        : 'border-slate-200/90 shadow-2xs hover:border-slate-300 hover:shadow-md'
                                }`}
                            >
                                {/* Compact Ledger Row */}
                                <div 
                                    className="p-4 flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer"
                                    onClick={() => setExpandedRow(isExpanded ? null : id)}
                                >
                                    <div className="flex-1 flex items-start gap-3">
                                        {/* The lifecycle, not just a colour. Compact here so the
                                            row stays scannable; the labelled version sits under it. */}
                                        <div className="mt-1.5 shrink-0 hidden sm:block md:hidden">
                                            <DecisionStatusRail status={decision.status} compact />
                                        </div>
                                        <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 sm:hidden ${config.dot}`} />
                                        
                                        <div className="space-y-1 overflow-hidden">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-extrabold text-slate-900 truncate">
                                                    {decision.title || `${decision.roomName} Update`}
                                                </p>
                                                {/* What this decision holds up. Drawings and site work
                                                    are different consequences and the client is told
                                                    which, so the studio should see it here too. */}
                                                {natureOf(decision) === 'design' ? (
                                                    <span className="inline-flex items-center text-[10px] bg-violet-50 text-violet-700 font-black px-1.5 py-0.5 rounded border border-violet-200">
                                                        Design
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center text-[10px] bg-teal-50 text-teal-700 font-black px-1.5 py-0.5 rounded border border-teal-200">
                                                        Site
                                                    </span>
                                                )}
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
                                            <div className="hidden md:block pt-1">
                                                <DecisionStatusRail status={decision.status} />
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
                                                    className={`rounded-lg border transition font-bold flex items-center gap-1.5 ${
                                                        ['notified', 'drawing_pending', 'drawing_sent', 'disputed'].includes(decision.status)
                                                            ? 'px-3 py-1.5 text-xs text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                                                            : 'p-1.5 text-emerald-600 border-slate-200 hover:text-emerald-700 hover:bg-emerald-50'
                                                    }`}
                                                    title="Send this on WhatsApp"
                                                >
                                                    <Share2 className="w-4 h-4 shrink-0"/>
                                                    {['notified', 'drawing_pending', 'drawing_sent', 'disputed'].includes(decision.status) && 'WhatsApp'}
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
                                            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
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

                                                    <DecisionAuditTimeline decision={decision} formatDate={formatDate} />

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

                                                    <AnimatePresence>
                                                        {replyingDecisionId === id && (
                                                            <motion.div
                                                                key="reply"
                                                                initial={{ opacity: 0, y: -4 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                exit={{ opacity: 0, y: -4 }}
                                                                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                                                className="w-full max-w-xl bg-white p-4 rounded-2xl border border-slate-200 space-y-2.5"
                                                            >
                                                                {(() => {
                                                                    const thread = (decision as any).discussion?.length
                                                                        ? (decision as any).discussion
                                                                        : decision.signoff?.queryText
                                                                            ? [{ from: 'client', text: decision.signoff.queryText }]
                                                                            : [];
                                                                    if (!thread.length) return null;
                                                                    return (
                                                                        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                                                                            {thread.map((m: any, i: number) => (
                                                                                <div key={i} className={`px-3 py-2 ${m.from === 'studio' ? 'bg-sky-50/60' : 'bg-rose-50'}`}>
                                                                                    <p className={`text-[10px] uppercase font-black tracking-wider ${m.from === 'studio' ? 'text-[#0055B3]' : 'text-rose-700'}`}>
                                                                                        {m.from === 'studio' ? 'You answered' : 'They asked'}
                                                                                    </p>
                                                                                    <p className={`text-xs font-medium mt-0.5 ${m.from === 'studio' ? 'text-slate-700' : 'text-rose-900 italic'}`}>
                                                                                        {m.from === 'client' ? `"${m.text}"` : m.text}
                                                                                    </p>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    );
                                                                })()}
                                                                <label className="text-xs font-bold text-slate-700 block">Your answer</label>
                                                                <textarea
                                                                    autoFocus
                                                                    rows={3}
                                                                    value={replyText}
                                                                    onChange={(e) => setReplyText(e.target.value)}
                                                                    placeholder="Answer the question. Attach a revised drawing only if the drawing itself has to change."
                                                                    className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-xl px-3 py-2 focus:ring-1 focus:ring-[#0066CC] outline-none"
                                                                />
                                                                <div className="flex flex-wrap gap-2 items-center">
                                                                    <button
                                                                        onClick={() => submitReply(id)}
                                                                        disabled={isActionLoading === `reply-${id}` || !replyText.trim()}
                                                                        className="bg-[#0066CC] text-white px-4 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center min-w-[130px]"
                                                                    >
                                                                        {isActionLoading === `reply-${id}`
                                                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                                                            : 'Send and re-request'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setReplyingDecisionId(null); handleProvideDriveLink(id); }}
                                                                        className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold"
                                                                    >
                                                                        Attach a revised drawing instead
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setReplyingDecisionId(null)}
                                                                        className="text-slate-500 hover:text-slate-800 px-2 py-1.5 text-xs font-bold"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>

                                                    <AnimatePresence>
                                                    {activeManualSignoffDecision?.id === id && (
                                                        <motion.div
                                                            key="manual-signoff"
                                                            initial={{ opacity: 0, y: -4 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -4 }}
                                                            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                                            className="pt-2 w-full max-w-md bg-white p-4 rounded-2xl border border-slate-200"
                                                        >
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
                                                        </motion.div>
                                                    )}
                                                    </AnimatePresence>

                                                    <AnimatePresence>
                                                        {deletingDecisionId === id && (
                                                            <motion.div
                                                                key="confirm-delete"
                                                                initial={{ opacity: 0, y: -4 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                exit={{ opacity: 0, y: -4 }}
                                                                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                                                className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex flex-wrap gap-3 items-center justify-between"
                                                            >
                                                                <span className="text-xs font-bold text-red-800">Delete this entry? The client's record of it goes too.</span>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => executeDelete(id)}
                                                                        disabled={isActionLoading === `delete-${id}`}
                                                                        className="bg-red-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold disabled:opacity-60 flex items-center justify-center min-w-[86px]"
                                                                    >
                                                                        {isActionLoading === `delete-${id}`
                                                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                            : 'Yes, delete'}
                                                                    </button>
                                                                    <button onClick={() => setDeletingDecisionId(null)} className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold">Cancel</button>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                    
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
                            </motion.div>
                        );
                    })
                )}
            </div>

            <AnimatePresence>
                {confirmRequest && (
                    <ConfirmDialog
                        request={confirmRequest}
                        onCancel={() => setConfirmRequest(null)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {shareModalDecision && (
                    <DecisionShareModal
                        roomName={shareModalDecision.roomName}
                        messageText={getShareMessageText(shareModalDecision)}
                        copied={copiedShareLink}
                        clientPhone={projectContext.clientPhone}
                        onCopyText={copyShareText}
                        onClose={() => setShareModalDecision(null)}
                    />
                )}
            </AnimatePresence>
            
        </div>
    );
}
