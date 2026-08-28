import { showSuccessWithNext } from '../SuccessWithNextToast';
import React, { useEffect, useState } from 'react';
import LockedState from '../LockedState';
import { collection, onSnapshot, doc, updateDoc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebaseClient';
import { DrawingTrackerItem, ProjectContext, FullBoqItem, DrawingRevision, DrawingComment, DrawingRound } from '../../types';
import { triggerDrawingSync } from '../../services/drawingSyncService';
import { 
    Clock, CheckCircle2, AlertCircle, RefreshCw, FileWarning, Plus, ChevronDown, ChevronUp, 
    Sparkles, Send, MessageSquare, History, User, FileText, Calendar, Layers, Search, ShieldCheck, 
    Check, Download, Share2, Printer, ExternalLink, Link as LinkIcon, Filter, 
    LayoutGrid, List, AlertTriangle, X, Zap, Edit3, Trash2
} from 'lucide-react';
import { classifyRevisionCause, RevisionClassification } from '../../services/geminiService';
import { useOrg } from '../../contexts/OrgContext';
import { motion, AnimatePresence } from 'framer-motion';

interface DrawingTrackerModuleProps {
    projectId: string;
    projectContext: ProjectContext;
    fullBoq: FullBoqItem[];
}

function AnimatedNumber({ value }: { value: number }) {
    return (
        <span className="font-['Plus_Jakarta_Sans'] text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">
            {value}
        </span>
    );
}

export default function DrawingTrackerModule({ projectId, projectContext, fullBoq }: DrawingTrackerModuleProps) {
    const designGateActive = (projectContext as any)?.designGate?.gateActivated || (projectContext as any)?.lifecycle?.gates?.designGateActive?.done;
    
    const { orgData } = useOrg();
    const orgId = orgData?.tenantId || 'demo-tenant-01';
    const studioName = orgData?.orgName || 'Studio';

    const [drawings, setDrawings] = useState<DrawingTrackerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [userRole, setUserRole] = useState<'owner' | 'designer'>('owner');
    
    // View grouping mode: 'list' | 'grouped'
    const [viewMode, setViewMode] = useState<'list' | 'grouped'>('grouped');

    // Expanded drawings list cache & state
    const [expandedDrawingId, setExpandedDrawingId] = useState<string | null>(null);
    const [expandedRevisionId, setExpandedRevisionId] = useState<string | null>(null);
    
    // Revisions cache for lazy subcollection fetching
    const [revisions, setRevisions] = useState<Record<string, DrawingRevision[]>>({});
    const [loadingRevisions, setLoadingRevisions] = useState<Record<string, boolean>>({});

    // Comments & Text Inputs
    const [commentText, setCommentText] = useState<Record<string, string>>({});
    
    // Manual Revision logging states
    const [manualRevisionDesc, setManualRevisionDesc] = useState<Record<string, string>>({});
    const [manualRevisionCause, setManualRevisionCause] = useState<Record<string, 'CLIENT_REVISION' | 'FFDS_DESIGN_MISS' | 'SITE_ADJUSTMENT'>>({});
    const [manualRevisionChargeable, setManualRevisionChargeable] = useState<Record<string, boolean>>({});
    const [manualRevisionAdvances, setManualRevisionAdvances] = useState<Record<string, boolean>>({});

    // Custom drawing creation state
    const [showAddDrawing, setShowAddDrawing] = useState(false);
    const [newDrawingName, setNewDrawingName] = useState('');
    const [newDrawingTrigger, setNewDrawingTrigger] = useState('Custom_Requirement');
    const [newDrawingRoom, setNewDrawingRoom] = useState('General / Project-Wide');

    // Drawing Edit & Delete Modal States
    const [editingDrawing, setEditingDrawing] = useState<DrawingTrackerItem | null>(null);
    const [editForm, setEditForm] = useState<{
        name: string;
        roomName: string;
        boqTriggers: string;
        targetDate: string;
        priority: 'high' | 'normal' | 'low';
        driveUrl: string;
        isMandatory: boolean;
    }>({
        name: '',
        roomName: '',
        boqTriggers: '',
        targetDate: '',
        priority: 'normal',
        driveUrl: '',
        isMandatory: false
    });
    const [deletingDrawing, setDeletingDrawing] = useState<DrawingTrackerItem | null>(null);

    // Quick CAD / Drive URL edit state
    const [editingUrlDrawingId, setEditingUrlDrawingId] = useState<string | null>(null);
    const [urlInputVal, setUrlInputVal] = useState<string>('');

    // Quick Target Date & Priority edit state
    const [editingMetaDrawingId, setEditingMetaDrawingId] = useState<string | null>(null);
    const [targetDateInput, setTargetDateInput] = useState<string>('');
    const [priorityInput, setPriorityInput] = useState<'high' | 'normal' | 'low'>('normal');

    // Printable Signoff Matrix Modal state
    const [showPrintModal, setShowPrintModal] = useState(false);

    // Filtering & Searching UI states
    const [filter, setFilter] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // State-driven UI logging and notification system
    const [logs, setLogs] = useState<{ id: string; timestamp: number; type: 'success' | 'error' | 'info' | 'warning'; message: string }[]>([
        { id: 'init-1', timestamp: Date.now() - 3000, type: 'info', message: `${studioName} GFC Blueprint Operation Engine Online. Companion drawing analyzer active.` }
    ]);
    const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string; visible: boolean } | null>(null);
    const [isLogsExpanded, setIsLogsExpanded] = useState(false);

    const addLog = (type: 'success' | 'error' | 'info' | 'warning', message: string) => {
        const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
        setLogs(prev => [{ id, timestamp: Date.now(), type, message }, ...prev].slice(0, 15));
        if (type === 'success') {
            showSuccessWithNext(message);
        } else {
            setToast({ type, message, visible: true });
        }
    };

    useEffect(() => {
        if (toast && toast.visible) {
            const timer = setTimeout(() => {
                setToast(prev => prev ? { ...prev, visible: false } : null);
            }, 6000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    useEffect(() => {
        if (!projectId || !db) return;
        const unsub = onSnapshot(collection(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`), (snap) => {
            const data = snap.docs.map(docSnap => {
                const d = docSnap.data() as DrawingTrackerItem;
                
                // Automatically identify and clean up duplicate rounds in Firestore
                const roundsList = d.rounds || [];
                const seenRounds = new Set<number>();
                let hasDuplicates = false;
                for (const r of roundsList) {
                    if (seenRounds.has(r.roundNumber)) {
                        hasDuplicates = true;
                        break;
                    }
                    seenRounds.add(r.roundNumber);
                }

                if (hasDuplicates) {
                    const map = new Map<number, DrawingRound>();
                    for (const r of roundsList) {
                        const existing = map.get(r.roundNumber);
                        if (!existing) {
                            map.set(r.roundNumber, r);
                        } else {
                            const statusOrder = { 'approved': 4, 'in_review': 3, 'issued': 2, 'site_hold': 1, 'not_started': 0, 'not_issued': 0 };
                            const existingScore = statusOrder[existing.status as keyof typeof statusOrder] || 0;
                            const currentScore = statusOrder[r.status as keyof typeof statusOrder] || 0;
                            if (currentScore > existingScore) {
                                map.set(r.roundNumber, r);
                            }
                        }
                    }
                    const deduplicated = Array.from(map.values()).sort((a, b) => a.roundNumber - b.roundNumber);
                    const maxRound = deduplicated.length > 0 ? Math.max(...deduplicated.map(r => r.roundNumber)) : 0;
                    
                    const docRef = doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, d.id);
                    updateDoc(docRef, {
                        rounds: deduplicated,
                        currentRound: maxRound
                    }).catch(err => console.error("Error cleaning up duplicate rounds in drawing", d.id, err));

                    return {
                        ...d,
                        rounds: deduplicated,
                        currentRound: maxRound
                    };
                }
                return d;
            });
            setDrawings(data);
            setLoading(false);
        });
        return () => unsub();
    }, [projectId, orgId]);

    useEffect(() => {
        if (!projectId || fullBoq.length === 0) return;
        let isActive = true;
        
        const syncBackground = async () => {
            try {
                await triggerDrawingSync(orgId, projectId, fullBoq);
            } catch(e) {
                console.error("Auto-sync drawing gap failed", e);
            }
        };

        const timeout = setTimeout(() => {
            if (isActive) syncBackground();
        }, 5000);

        return () => {
            isActive = false;
            clearTimeout(timeout);
        };
    }, [projectId, fullBoq, orgId]);

    // Lazy Fetch Revisions Subcollection
    const fetchRevisions = async (drawingId: string) => {
        if (loadingRevisions[drawingId]) return;
        setLoadingRevisions(prev => ({ ...prev, [drawingId]: true }));
        try {
            const ref = collection(db, `organizations/${orgId}/projects/${projectId}/drawingTracker/${drawingId}/revisions`);
            const snap = await getDocs(ref);
            const list: DrawingRevision[] = snap.docs.map(doc => {
                const data = doc.data();
                const rNum = data.roundNumber || 0;
                return {
                    id: doc.id,
                    roundNumber: rNum,
                    requestedAt: data.requestedAt || 0,
                    requestDescription: data.requestDescription || '',
                    cause: data.cause || 'CLIENT_REVISION',
                    chargeable: rNum <= 2 ? false : !!data.chargeable,
                    roundAdvances: !!data.roundAdvances,
                    chargeInvoiceId: data.chargeInvoiceId || null,
                    classifiedBy: data.classifiedBy || 'system_ai',
                    classificationConfidence: data.classificationConfidence || 1.0,
                    classifiedAt: data.classifiedAt || Date.now()
                } as DrawingRevision;
            });

            list.sort((a, b) => {
                const getMs = (val: any) => {
                    if (!val) return 0;
                    if (typeof val === 'number') return val;
                    if (val.seconds) return val.seconds * 1000;
                    if (val.toDate) return val.toDate().getTime();
                    return new Date(val).getTime();
                };
                return getMs(b.classifiedAt) - getMs(a.classifiedAt);
            });

            setRevisions(prev => ({ ...prev, [drawingId]: list }));
        } catch (e) {
            console.error("Failed to fetch revisions", e);
        } finally {
            setLoadingRevisions(prev => ({ ...prev, [drawingId]: false }));
        }
    };

    // Add Live Comment Thread to Drawing Tracker doc
    const handleAddComment = async (drawing: DrawingTrackerItem, text: string) => {
        if (!text.trim()) return;
        const author = auth?.currentUser?.email || auth?.currentUser?.displayName || 'Studio Team';
        const newComment: DrawingComment = {
            id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            text: text.trim(),
            author,
            at: Date.now(),
            kind: 'note'
        };
        const updatedComments = [...(drawing.comments || []), newComment];
        try {
            await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, drawing.id), {
                comments: updatedComments
            });
            addLog('success', `Added a design note to drawing "${drawing.name}".`);
        } catch (e: any) {
            console.error("Failed to add comment", e);
            addLog('error', `Failed to add note: ${e.message || e}`);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            await triggerDrawingSync(orgId, projectId, fullBoq);
            addLog('success', 'Successfully synchronized design drawing tracking list with BOQ triggers.');
        } catch (e: any) {
            console.error("Failed to sync drawings", e);
            addLog('error', `Failed to sync drawings: ${e.message || e}`);
        }
        setSyncing(false);
    };

    const handleAddDrawing = async () => {
        if (!newDrawingName.trim()) return;
        try {
            const drawingId = `dwg_custom_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
            const newDoc: DrawingTrackerItem = {
                id: drawingId,
                name: newDrawingName.trim(),
                roomName: newDrawingRoom.trim() || 'General / Project-Wide',
                boqTriggers: [newDrawingTrigger.trim() || 'Custom_Requirement'],
                isMandatory: false,
                currentRound: 0,
                rounds: [],
                approvedAt: null,
                gfc: null,
                companionOf: null,
                isGapFlagged: false,
                comments: []
            };
            await setDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, drawingId), newDoc);
            setNewDrawingName('');
            setNewDrawingTrigger('Custom_Requirement');
            setNewDrawingRoom('General / Project-Wide');
            setShowAddDrawing(false);
            addLog('success', `Custom drawing "${newDrawingName.trim()}" added to tracker.`);
        } catch (e: any) {
            console.error("Failed to add manual drawing", e);
            addLog('error', `Failed to add drawing: ${e.message || e}`);
        }
    };

    const handleOpenEditDrawing = (drawing: DrawingTrackerItem) => {
        setEditingDrawing(drawing);
        setEditForm({
            name: drawing.name || '',
            roomName: drawing.roomName || 'General / Project-Wide',
            boqTriggers: (drawing.boqTriggers || []).join(', '),
            targetDate: drawing.targetDate || '',
            priority: drawing.priority || 'normal',
            driveUrl: drawing.driveUrl || '',
            isMandatory: !!drawing.isMandatory
        });
    };

    const handleSaveDrawingEdit = async () => {
        if (!editingDrawing || !editForm.name.trim()) return;
        try {
            const triggers = editForm.boqTriggers
                .split(',')
                .map(t => t.trim())
                .filter(Boolean);

            await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, editingDrawing.id), {
                name: editForm.name.trim(),
                roomName: editForm.roomName.trim() || 'General / Project-Wide',
                boqTriggers: triggers.length > 0 ? triggers : ['Custom_Requirement'],
                targetDate: editForm.targetDate || null,
                priority: editForm.priority,
                driveUrl: editForm.driveUrl.trim() || null,
                isMandatory: editForm.isMandatory
            });
            addLog('success', `Drawing "${editForm.name.trim()}" updated successfully.`);
            setEditingDrawing(null);
        } catch (e: any) {
            console.error("Failed to update drawing", e);
            addLog('error', `Failed to update drawing: ${e.message || e}`);
        }
    };

    const handleDeleteDrawing = async (drawing: DrawingTrackerItem) => {
        try {
            await deleteDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, drawing.id));
            addLog('success', `Drawing "${drawing.name}" has been deleted.`);
            setDeletingDrawing(null);
            if (expandedDrawingId === drawing.id) {
                setExpandedDrawingId(null);
            }
        } catch (e: any) {
            console.error("Failed to delete drawing", e);
            addLog('error', `Failed to delete drawing: ${e.message || e}`);
        }
    };

    // Save Cloud Drive / AutoCAD URL
    const handleSaveDriveUrl = async (drawingId: string, url: string) => {
        try {
            await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, drawingId), {
                driveUrl: url.trim()
            });
            setEditingUrlDrawingId(null);
            addLog('success', 'CAD / Drive blueprint URL attached successfully.');
        } catch (e: any) {
            addLog('error', `Failed to save URL: ${e.message || e}`);
        }
    };

    // Save Target Milestone Date & Priority
    const handleSaveMetadata = async (drawingId: string) => {
        try {
            await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, drawingId), {
                targetDate: targetDateInput,
                priority: priorityInput
            });
            setEditingMetaDrawingId(null);
            addLog('success', 'Target schedule and priority updated.');
        } catch (e: any) {
            addLog('error', `Failed to update metadata: ${e.message || e}`);
        }
    };

    const handleAdvanceRound = async (drawing: DrawingTrackerItem, targetRoundNumber: number, customStatus: 'issued' | 'in_review' = 'issued') => {
        const newRoundNumber = targetRoundNumber;
        const newRounds = [...drawing.rounds];
        const issuerName = auth?.currentUser?.displayName || auth?.currentUser?.email || 'Studio Team';
        
        let roundIndex = newRounds.findIndex(r => r.roundNumber === newRoundNumber);
        
        if (roundIndex >= 0) {
            newRounds[roundIndex] = { 
                ...newRounds[roundIndex], 
                status: customStatus, 
                issuedAt: Date.now(),
                issuedBy: issuerName
            };
        } else {
            newRounds.push({
                roundNumber: newRoundNumber,
                issuedAt: Date.now(),
                issuedBy: issuerName,
                clientFeedbackSubmittedAt: null,
                status: customStatus
            });
        }

        await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, drawing.id), {
            currentRound: newRoundNumber,
            rounds: newRounds
        });
        addLog('success', `Round ${newRoundNumber} of drawing "${drawing.name}" advanced to status "${customStatus.replace('_', ' ')}".`);
    };

    const handleApprove = async (drawing: DrawingTrackerItem, roundNumber: number) => {
        const newRounds = drawing.rounds.map(r => r.roundNumber === roundNumber ? { ...r, status: 'approved' as const } : r);
        await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, drawing.id), {
            approvedAt: Date.now(),
            rounds: newRounds
        });
        setExpandedRevisionId(null);
        addLog('success', `Drawing "${drawing.name}" successfully approved on Round ${roundNumber}.`);
    };

    const handleQuickStatusChange = async (drawing: DrawingTrackerItem, newStatus: 'pending' | 'approved' | 'rejected') => {
        const curRound = drawing.currentRound || 1;
        const newRounds = [...(drawing.rounds || [])];
        let roundIdx = newRounds.findIndex(r => r.roundNumber === curRound);
        
        let targetRoundStatus: 'in_review' | 'approved' | 'site_hold' = 'in_review';
        let newApprovedAt: number | null = null;

        if (newStatus === 'approved') {
            targetRoundStatus = 'approved';
            newApprovedAt = Date.now();
        } else if (newStatus === 'rejected') {
            targetRoundStatus = 'site_hold';
            newApprovedAt = null;
        } else {
            targetRoundStatus = 'in_review';
            newApprovedAt = null;
        }

        if (roundIdx >= 0) {
            newRounds[roundIdx] = {
                ...newRounds[roundIdx],
                status: targetRoundStatus,
                ...(newStatus === 'approved' ? { clientFeedbackSubmittedAt: Date.now() } : {})
            };
        } else {
            newRounds.push({
                roundNumber: curRound,
                issuedAt: Date.now(),
                issuedBy: auth?.currentUser?.displayName || auth?.currentUser?.email || 'Studio Team',
                clientFeedbackSubmittedAt: newStatus === 'approved' ? Date.now() : null,
                status: targetRoundStatus
            });
        }

        const updates: any = {
            currentRound: curRound,
            rounds: newRounds,
            approvedAt: newApprovedAt
        };

        if (newStatus !== 'approved' && drawing.gfc?.status === 'issued') {
            updates.gfc = {
                ...drawing.gfc,
                status: 'superseded'
            };
        }

        try {
            await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, drawing.id), updates);
            const statusLabel = newStatus === 'approved' ? 'Approved' : newStatus === 'rejected' ? 'Rejected' : 'Pending (In Review)';
            addLog('success', `Quick status for "${drawing.name}" updated to ${statusLabel}.`);
        } catch (err) {
            console.error("Failed to update drawing quick status:", err);
            addLog('error', `Failed to update status for "${drawing.name}".`);
        }
    };

    const handleLogRevisionManual = async (
        drawing: DrawingTrackerItem, 
        description: string, 
        cause: 'CLIENT_REVISION' | 'FFDS_DESIGN_MISS' | 'SITE_ADJUSTMENT', 
        chargeable: boolean, 
        roundAdvances: boolean
    ) => {
        if (!description.trim()) {
            addLog('warning', 'Please enter a revision description.');
            return;
        }

        const newRounds = [...drawing.rounds];
        const nextRoundNumber = drawing.currentRound + 1;

        if (roundAdvances || cause === 'CLIENT_REVISION') {
             const existingIdx = newRounds.findIndex(r => r.roundNumber === nextRoundNumber);
             if (existingIdx >= 0) {
                 newRounds[existingIdx] = {
                     ...newRounds[existingIdx],
                     status: 'not_started',
                     issuedAt: null,
                     issuedBy: null,
                     clientFeedbackSubmittedAt: null
                 };
             } else {
                 newRounds.push({
                     roundNumber: nextRoundNumber,
                     issuedAt: null,
                     issuedBy: null,
                     clientFeedbackSubmittedAt: null,
                     status: 'not_started'
                 });
             }
        }
        
        const nextRoundNumberWithRevision = (roundAdvances || cause === 'CLIENT_REVISION') ? nextRoundNumber : drawing.currentRound;
        const updates: any = {
             currentRound: nextRoundNumberWithRevision,
             rounds: newRounds
        };

        if (roundAdvances || cause === 'CLIENT_REVISION') {
             updates.approvedAt = null;
        }

        if (drawing.gfc && drawing.gfc.status === 'issued') {
            updates.gfc = {
                ...drawing.gfc,
                status: 'superseded' as const
            };
        }

        try {
            await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, drawing.id), updates);
            
            // Add revision to subcollection
            const revId = `rev_${Date.now()}`;
            const targetRound = nextRoundNumberWithRevision;
            const isTargetChargeable = targetRound <= 2 ? false : chargeable;

            await setDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker/${drawing.id}/revisions`, revId), {
                id: revId,
                roundNumber: targetRound,
                requestedAt: Date.now(),
                requestDescription: description.trim(),
                cause,
                chargeable: isTargetChargeable,
                roundAdvances,
                classifiedBy: 'user_manual',
                classificationConfidence: 1.0,
                classifiedAt: Date.now()
            });

            addLog('success', `Manual revision logged for "${drawing.name}". Cause: ${cause.replace(/_/g, ' ')}.`);
            setExpandedRevisionId(null);
            setManualRevisionDesc(prev => ({ ...prev, [drawing.id]: '' }));
            fetchRevisions(drawing.id);
        } catch (e: any) {
            console.error("Failed to log revision", e);
            addLog('error', `Failed to log revision: ${e.message || e}`);
        }
    };

    const handleIssueGfc = async (d: DrawingTrackerItem) => {
        if (!d.approvedAt) {
            addLog('warning', `Drawing "${d.name}" must be approved before you can issue GFC.`);
            return;
        }

        const companions = drawings.filter(other => other.companionOf === d.id || d.companionOf === other.id);
        const unapprovedCompanions = companions.filter(c => c.approvedAt === null);
        if (unapprovedCompanions.length > 0) {
            addLog('error', `Cannot issue GFC. The following companion drawings must be approved first: ${unapprovedCompanions.map(c => c.name).join(', ')}`);
            return;
        }

        try {
            let boqVersionHash = '';
            let operativeBoqVersion = projectContext.operativeBoqVersion || '1.0';

            try {
                const boqVerSnap = await getDoc(doc(db, `organizations/${orgId}/projects/${projectId}/boqVersions`, operativeBoqVersion));
                if (boqVerSnap.exists()) {
                    const boqVerData = boqVerSnap.data();
                    boqVersionHash = boqVerData?.contentHash || '';
                }
            } catch (e) {
                console.warn("Could not fetch boqVersion contentHash", e);
            }

            if (!boqVersionHash || boqVersionHash === 'unknown_hash' || boqVersionHash.startsWith('unknown_')) {
                const boqTotal = (fullBoq || []).reduce((sum, item) => {
                    const rate = item.selectedRate || ((item.materials + item.labor) * (1 + (item.marginOverride ?? item.margin ?? 15) / 100));
                    return sum + (item.qty * rate);
                }, 0);
                const rawString = `${projectId}_${(fullBoq || []).length}_${boqTotal}_${operativeBoqVersion}`;
                const rawHash = (str: string): string => {
                    let hash = 0;
                    for (let i = 0; i < str.length; i++) {
                        hash = (hash << 5) - hash + str.charCodeAt(i);
                        hash = hash & hash;
                    }
                    return Math.abs(hash).toString(16).toUpperCase();
                };
                boqVersionHash = 'BQ-' + rawHash(rawString).slice(0, 6);
            }

            const issuedAt = Date.now();
            const issuedBy = auth?.currentUser?.email || auth?.currentUser?.displayName || 'Studio Team';
            
            const clientApprovalRef = d.rounds.find(r => r.roundNumber === 2 && r.status === 'approved') || 
                                     d.rounds.find(r => r.status === 'approved') || 
                                     { roundNumber: d.currentRound, status: 'approved', approvedAt: d.approvedAt };

            const gfcBlock = {
                status: 'issued' as const,
                issuedAt,
                issuedBy,
                boqVersionRef: boqVersionHash,
                clientApprovalRef
            };

            const helperHash = (str: string): string => {
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    hash = (hash << 5) - hash + char;
                    hash = hash & hash;
                }
                return Math.abs(hash).toString(16);
            };
            const drawingContentHash = helperHash(JSON.stringify({ ...d, gfc: gfcBlock }));

            await updateDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`, d.id), {
                gfc: gfcBlock
            });

            const versionId = `ver_${d.id}_${Date.now()}`;
            await setDoc(doc(db, `organizations/${orgId}/projects/${projectId}/drawingVersions`, versionId), {
                versionId,
                drawingId: d.id,
                name: d.name,
                gfc: gfcBlock,
                boqVersionRef: boqVersionHash,
                contentHash: drawingContentHash,
                snapshot: {
                    ...d,
                    gfc: gfcBlock
                },
                timestamp: Date.now()
            });

            addLog('success', `Successfully issued GFC for "${d.name}" with BOQ hash: ${boqVersionHash.substring(0, 8)}`);

        } catch (error: any) {
            console.error("GFC issuance failed", error);
            addLog('error', `GFC Issuance Failed: ${error.message || error}`);
        }
    };

    // Batch GFC Release for all approved pending drawings
    const handleBatchIssueGfc = async () => {
        const readyDrawings = drawings.filter(d => d.approvedAt !== null && (!d.gfc || d.gfc.status !== 'issued'));
        if (readyDrawings.length === 0) {
            addLog('info', 'No approved drawings currently pending GFC release.');
            return;
        }

        let successCount = 0;
        for (const d of readyDrawings) {
            try {
                await handleIssueGfc(d);
                successCount++;
            } catch (e) {
                console.error('Batch GFC release error for', d.name, e);
            }
        }
        addLog('success', `Batch GFC Release completed for ${successCount} drawing(s).`);
    };

    // Derived Status Resolver
    const statusOf = (d: DrawingTrackerItem) => {
        if (d.gfc?.status === 'issued') return 'GFC Issued';
        if (d.gfc?.status === 'superseded') return 'Superseded';
        if (d.isGapFlagged && (d.currentRound === 0 || d.rounds.length === 0 || d.rounds.every(r => r.status === 'not_started'))) return 'Missing';
        if (d.approvedAt) return 'Approved';
        
        const latestRound = d.rounds.find(r => r.roundNumber === d.currentRound);
        if (latestRound) {
            if (latestRound.status === 'in_review') return 'Client Review';
            if (latestRound.status === 'issued') return `Round ${d.currentRound} Issued`;
            if (latestRound.status === 'site_hold') return 'Site Hold';
        }
        
        return 'Not Started';
    };

    // Helper formatting methods
    const formatDate = (ts: any) => {
        if (!ts) return 'N/A';
        if (typeof ts === 'number') return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        if (ts.toDate) return ts.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const getRelativeTime = (ts: number) => {
        const diff = Date.now() - ts;
        if (diff < 60000) return 'Just now';
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    const getInitials = (author: string) => {
        if (!author) return 'US';
        if (author.includes('@')) {
            const namePart = author.split('@')[0];
            return namePart.substring(0, 2).toUpperCase();
        }
        const parts = author.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return author.substring(0, 2).toUpperCase();
    };

    const isOwner = userRole === 'owner';
    const issues = drawings.filter(d => d.isGapFlagged);
    const completedCount = (drawings || []).filter(d => d.approvedAt !== null).length;
    const readyForGfcCount = (drawings || []).filter(d => d.approvedAt !== null && (!d.gfc || d.gfc.status !== 'issued')).length;

    // Derived Scope Tracks logic
    const uniqueTriggers = Array.from(new Set<string>(drawings.flatMap(d => d.boqTriggers)));
    const scopeChips = uniqueTriggers.map((trigger: string) => {
        const relatedDrawings = drawings.filter(d => d.boqTriggers.includes(trigger));
        const allCompletedOrIssued = relatedDrawings.every(d => d.approvedAt !== null || d.rounds.some(r => r.status === 'issued' || r.status === 'in_review'));
        return {
            raw: trigger,
            label: trigger.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            isHealthy: allCompletedOrIssued,
            count: relatedDrawings.length
        };
    });

    const stats = {
        total: drawings.length,
        approved: completedCount,
        inReview: drawings.filter(d => !d.approvedAt && d.rounds.some(r => r.status === 'in_review')).length,
        gfcIssued: drawings.filter(d => d.gfc?.status === 'issued').length,
        issues: issues.length
    };

    // Filter drawings
    const filteredDrawings = drawings.filter(d => {
        const status = statusOf(d);
        
        // Search filter
        if (searchQuery.trim() !== '') {
            const q = searchQuery.toLowerCase();
            const matchesName = d.name.toLowerCase().includes(q);
            const matchesTriggers = d.boqTriggers.some(t => t.toLowerCase().includes(q));
            const matchesDrive = (d.driveUrl || '').toLowerCase().includes(q);
            if (!matchesName && !matchesTriggers && !matchesDrive) return false;
        }

        // Pill filter
        if (filter === 'All') return true;
        if (filter === 'Action Required') return status === 'Client Review' || status === 'Site Hold' || d.isGapFlagged;
        if (filter === 'Not Started') return status === 'Not Started';
        if (filter === 'Client Review') return status === 'Client Review';
        if (filter === 'Approved') return status === 'Approved';
        if (filter === 'GFC Issued') return status === 'GFC Issued';
        if (filter === 'Missing') return status === 'Missing' || d.isGapFlagged;
        
        return true;
    });

    // Sort helper based on business priority: floor layout >> room layout >> elevation >> detailed drawing
    const getSortWeight = (d: DrawingTrackerItem) => {
        const name = d.name.toLowerCase();
        if (name.includes('floor layout')) return 10;
        if (name.includes('room layout')) return 20;
        if (name.includes('elevation')) return 30;
        if (name.includes('electrical') || name.includes('ceiling') || name.includes('carpentry') || name.includes('detail')) return 40;
        return 50;
    };

    filteredDrawings.sort((a, b) => {
        const weightA = getSortWeight(a);
        const weightB = getSortWeight(b);
        if (weightA !== weightB) return weightA - weightB;
        return a.name.localeCompare(b.name);
    });

    const uniqueRooms = Array.from(new Set<string>(filteredDrawings.map(d => d.roomName || 'General / Project-Wide')));
    uniqueRooms.sort((a, b) => {
        if (a === 'General / Project-Wide') return -1;
        if (b === 'General / Project-Wide') return 1;
        return a.localeCompare(b);
    });

    // CSV Export Handler
    const handleExportCSV = () => {
        const headers = [
            "Drawing ID",
            "Drawing Name",
            "Triggers / Category",
            "Mandatory",
            "Current Round",
            "Status",
            "Approved Date",
            "GFC Status",
            "GFC Released Date",
            "GFC Released By",
            "BOQ Version Hash",
            "CAD / Drive URL",
            "Target Date",
            "Priority",
            "Notes Count"
        ];

        const rows = drawings.map(d => {
            const status = statusOf(d);
            const gfcStatus = d.gfc?.status || 'Pending';
            const gfcDate = d.gfc?.issuedAt ? formatDate(d.gfc.issuedAt) : 'N/A';
            const gfcBy = d.gfc?.issuedBy || 'N/A';
            const boqHash = d.gfc?.boqVersionRef || 'N/A';
            const approvedDate = d.approvedAt ? formatDate(d.approvedAt) : 'N/A';
            const driveLink = d.driveUrl || '';
            const targetDate = d.targetDate || '';
            const priority = d.priority || 'normal';
            const notesCount = d.comments?.length || 0;

            return [
                `"${d.id}"`,
                `"${d.name.replace(/"/g, '""')}"`,
                `"${d.boqTriggers.join(', ')}"`,
                d.isMandatory ? 'Yes' : 'No',
                `Round ${d.currentRound || 0}`,
                `"${status}"`,
                `"${approvedDate}"`,
                `"${gfcStatus}"`,
                `"${gfcDate}"`,
                `"${gfcBy.replace(/"/g, '""')}"`,
                `"${boqHash}"`,
                `"${driveLink.replace(/"/g, '""')}"`,
                `"${targetDate}"`,
                `"${priority}"`,
                notesCount
            ].join(',');
        });

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        const projectName = (projectContext.name || 'Project').replace(/\s+/g, '_');
        link.setAttribute("download", `${projectName}_Drawing_Status_Report_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addLog('success', 'Drawing status report exported successfully as CSV.');
    };

    // Copy WhatsApp / Client Status Digest
    const handleCopyWhatsAppDigest = () => {
        const projName = projectContext.name || 'Project';
        const projConfig = projectContext.config ? ` (${projectContext.config})` : '';
        const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        
        const gfcList = drawings.filter(d => d.gfc?.status === 'issued');
        const inReviewList = drawings.filter(d => !d.approvedAt && d.rounds.some(r => r.status === 'in_review'));
        const pendingList = drawings.filter(d => !d.approvedAt && !d.rounds.some(r => r.status === 'in_review') && d.gfc?.status !== 'issued');

        let text = `📐 *DRAWING STATUS & GFC DIGEST*\n`;
        text += `🏢 *Project*: ${projName}${projConfig}\n`;
        text += `📅 *Date*: ${today}\n\n`;
        
        text += `📊 *Summary*:\n`;
        text += `• 🛡️ *GFC Released to Site*: ${gfcList.length}\n`;
        text += `• 🟢 *Client Approved*: ${completedCount}\n`;
        text += `• 🔍 *In Client Review*: ${inReviewList.length}\n`;
        text += `• ⏳ *Drafting / Pending*: ${pendingList.length}\n`;
        if (issues.length > 0) {
            text += `• ⚠️ *Scope Gaps Flagged*: ${issues.length}\n`;
        }
        text += `\n`;

        if (gfcList.length > 0) {
            text += `📑 *Good-For-Construction Blueprints Released*:\n`;
            gfcList.slice(0, 10).forEach(d => {
                const hash = d.gfc?.boqVersionRef || 'Active';
                text += `  ✅ ${d.name} [Ref: ${hash}]\n`;
            });
            if (gfcList.length > 10) {
                text += `  ...and ${gfcList.length - 10} more GFC sheets\n`;
            }
            text += `\n`;
        }

        if (inReviewList.length > 0) {
            text += `🔍 *Action Required / In Client Review*:\n`;
            inReviewList.forEach(d => {
                text += `  • ${d.name} (Round ${d.currentRound || 1})\n`;
            });
            text += `\n`;
        }

        text += `_Generated via ${studioName} Operations OS_`;

        navigator.clipboard.writeText(text).then(() => {
            addLog('success', 'Formatted WhatsApp status summary copied to clipboard!');
        }).catch(() => {
            addLog('error', 'Failed to copy to clipboard automatically.');
        });
    };

    // Expand drawing card handler
    const handleToggleExpand = (drawingId: string) => {
        if (expandedDrawingId === drawingId) {
            setExpandedDrawingId(null);
        } else {
            setExpandedDrawingId(drawingId);
            fetchRevisions(drawingId);
        }
    };

    // Custom Status Badge Renderer
    const renderStatusBadge = (status: string) => {
        switch (status) {
            case 'GFC Issued':
                return <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />GFC Released</span>;
            case 'Superseded':
                return <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs"><Clock className="w-3.5 h-3.5 text-amber-600" />Superseded</span>;
            case 'Missing':
                return <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs"><FileWarning className="w-3.5 h-3.5 text-rose-600" />Missing</span>;
            case 'Approved':
                return <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs"><CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />Approved</span>;
            case 'Client Review':
                return <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs"><User className="w-3.5 h-3.5 text-blue-600" />Client Review</span>;
            case 'Site Hold':
                return <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs"><AlertCircle className="w-3.5 h-3.5 text-rose-700" />Rejected / Hold</span>;
            default:
                if (status.includes('Issued')) {
                    return <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs"><Clock className="w-3.5 h-3.5 text-amber-600" />{status}</span>;
                }
                return <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-500 border border-slate-200 shadow-2xs">Not Started</span>;
        }
    };

    // Timeline Node Stepper Renderer
    const renderTimeline = (d: DrawingTrackerItem) => {
        const roundsList = d.rounds || [];
        if (roundsList.length === 0) {
            return (
                <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    <Clock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                    <span className="text-xs font-semibold text-slate-600">No rounds initiated yet.</span>
                    <div className="mt-3">
                        <button 
                            type="button"
                            onClick={() => handleAdvanceRound(d, 1, 'issued')} 
                            className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-[#0066CC] hover:bg-[#0055B3] text-white transition-all shadow-2xs cursor-pointer"
                        >
                            Issue Round 1 Now
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="relative pl-6 border-l-2 border-slate-200 space-y-5">
                {roundsList.map((r, index) => {
                    const isLatest = r.roundNumber === (d.currentRound || 1);
                    const statusColor = 
                        r.status === 'approved' ? 'bg-emerald-500' :
                        r.status === 'in_review' ? 'bg-blue-500' :
                        r.status === 'issued' ? 'bg-amber-500' :
                        r.status === 'site_hold' ? 'bg-rose-500' : 'bg-slate-300';

                    return (
                        <div key={index} className="relative group">
                            {/* Node indicator */}
                            <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 border-white ring-2 ring-slate-100 ${statusColor} shadow-2xs z-10`} />
                            
                            <div className="bg-white p-3.5 border border-slate-200/80 rounded-xl shadow-2xs">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-extrabold text-xs text-slate-900">Round {r.roundNumber}</span>
                                    <span className={`px-2 py-0.5 text-[9px] font-black rounded uppercase tracking-wider ${
                                        r.status === 'approved' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                                        r.status === 'in_review' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                                        r.status === 'issued' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                                        r.status === 'site_hold' ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                        {r.status.replace('_', ' ')}
                                    </span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-2 space-y-1 font-medium">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span>Issued: {r.issuedAt ? formatDate(r.issuedAt) : 'Draft/Pending'}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span>By: {r.issuedBy || 'N/A'}</span>
                                    </div>
                                    {r.clientFeedbackSubmittedAt && (
                                        <div className="text-[11px] text-[#0055B3] font-bold mt-1.5 flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            <span>Client feedback submitted: {formatDate(r.clientFeedbackSubmittedAt)}</span>
                                        </div>
                                    )}
                                </div>

                                {isLatest && !d.approvedAt && (
                                    <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex flex-wrap gap-2">
                                        {(r.status === 'not_started' || r.status === 'not_issued') && (
                                            <button 
                                                type="button"
                                                onClick={() => handleAdvanceRound(d, r.roundNumber, 'issued')} 
                                                className="px-3 py-1.5 text-xs font-bold bg-[#0066CC] hover:bg-[#0055B3] text-white rounded-lg transition-all shadow-2xs cursor-pointer"
                                            >
                                                Issue Now
                                            </button>
                                        )}
                                        {r.status === 'issued' && (
                                            <button 
                                                type="button"
                                                onClick={() => handleAdvanceRound(d, r.roundNumber, 'in_review')} 
                                                className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-all cursor-pointer"
                                            >
                                                Send to Client Review
                                            </button>
                                        )}
                                        {r.status === 'in_review' && (
                                            <>
                                                {isOwner && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleApprove(d, r.roundNumber)} 
                                                        className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                        <span>Approve Round</span>
                                                    </button>
                                                )}
                                                <button 
                                                    type="button"
                                                    onClick={() => setExpandedRevisionId(expandedRevisionId === d.id ? null : d.id)} 
                                                    className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                                                >
                                                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                                    <span>Log Revision</span>
                                                    {expandedRevisionId === d.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    // Revisions List Renderer
    const renderRevisionsSection = (d: DrawingTrackerItem) => {
        const list = revisions[d.id] || [];
        const isLoading = loadingRevisions[d.id];

        return (
            <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-slate-800">
                    <History className="w-4 h-4 text-[#0066CC]" />
                    <h4 className="text-xs font-extrabold uppercase tracking-wider">Revision History Log</h4>
                </div>
                {isLoading ? (
                    <div className="py-4 text-center text-slate-400 text-xs flex items-center justify-center gap-1.5">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#0066CC]" />
                        <span>Fetching historical revision logs...</span>
                    </div>
                ) : list.length === 0 ? (
                    <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-200/60">No formal revisions logged for this drawing yet.</p>
                ) : (
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                        {list.map((rev, idx) => (
                            <div key={idx} className="p-3 bg-white border border-slate-200/90 rounded-xl text-xs flex flex-col gap-1.5 shadow-2xs">
                                <div className="flex items-center justify-between">
                                    <span className={`px-2 py-0.5 text-[9px] font-black tracking-wider uppercase rounded ${
                                        rev.cause === 'CLIENT_REVISION' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                        rev.cause === 'FFDS_DESIGN_MISS' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                        'bg-amber-50 text-amber-700 border border-amber-100'
                                    }`}>
                                        {rev.cause.replace(/_/g, ' ')}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                        {formatDate(rev.classifiedAt)}
                                    </span>
                                </div>
                                <p className="text-slate-800 font-semibold leading-relaxed">{rev.requestDescription}</p>
                                <div className="flex items-center gap-3 text-[10px] text-slate-500 border-t border-slate-100 pt-1.5">
                                    <span className="font-bold">Round {rev.roundNumber}</span>
                                    <span>•</span>
                                    <span className={`font-bold ${rev.chargeable ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {rev.chargeable ? 'Chargeable' : 'Included (Free)'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // Comments Form Thread Renderer
    const renderCommentsSection = (d: DrawingTrackerItem) => {
        const commentsList = d.comments || [];

        return (
            <div className="space-y-3.5">
                <div className="flex items-center gap-1.5 text-slate-800">
                    <MessageSquare className="w-4 h-4 text-[#0066CC]" />
                    <h4 className="text-xs font-extrabold uppercase tracking-wider">Notes & Studio Team Activity</h4>
                </div>
                
                {commentsList.length === 0 ? (
                    <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-200/60">No internal notes posted yet. Add a note below.</p>
                ) : (
                    <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 flex flex-col">
                        {commentsList.map((comm, idx) => {
                            const initials = getInitials(comm.author);
                            return (
                                <div key={comm.id || idx} className="flex gap-2.5 items-start">
                                    <div className="w-7 h-7 rounded-full bg-[#0066CC] text-white flex items-center justify-center text-[10px] font-extrabold shrink-0 shadow-2xs">
                                        {initials}
                                    </div>
                                    <div className="flex-1 bg-white border border-slate-200/90 p-3 rounded-xl text-xs shadow-2xs">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="font-bold text-slate-900 text-[11px] truncate">{comm.author}</span>
                                            <span className="text-[10px] text-slate-400 font-medium shrink-0">{getRelativeTime(comm.at)}</span>
                                        </div>
                                        <p className="text-slate-700 font-medium leading-relaxed">{comm.text}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <form 
                    onSubmit={(e) => {
                        e.preventDefault();
                        const text = commentText[d.id] || '';
                        if (!text.trim()) return;
                        handleAddComment(d, text);
                        setCommentText(prev => ({ ...prev, [d.id]: '' }));
                    }}
                    className="flex items-center gap-2 border border-slate-200 rounded-xl bg-white p-1.5 pr-2 focus-within:ring-2 focus-within:ring-[#0066CC] shadow-2xs"
                >
                    <input 
                        type="text"
                        placeholder="Add a design or site note..."
                        value={commentText[d.id] || ''}
                        onChange={(e) => setCommentText(prev => ({ ...prev, [d.id]: e.target.value }))}
                        className="flex-1 px-3 py-1.5 text-xs bg-transparent focus:outline-none font-medium text-slate-800"
                    />
                    <button 
                        type="submit"
                        disabled={!(commentText[d.id] || '').trim()}
                        className="p-1.5 bg-[#0066CC] hover:bg-[#0055B3] disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-lg transition-all shrink-0 cursor-pointer"
                    >
                        <Send className="w-3.5 h-3.5" />
                    </button>
                </form>
            </div>
        );
    };

    // GFC Block Renderer
    const renderGfcBlock = (d: DrawingTrackerItem) => {
        if (!d.gfc) return null;

        const isSuperseded = d.gfc.status === 'superseded';
        return (
            <div className={`p-4 border rounded-2xl relative overflow-hidden flex flex-col gap-2.5 shadow-2xs ${
                isSuperseded 
                    ? 'bg-amber-50/50 border-amber-200' 
                    : 'bg-emerald-50/50 border-emerald-200'
            }`}>
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        Good-For-Construction Release
                    </span>
                    <span className={`px-2.5 py-0.5 text-[9px] font-black rounded-full uppercase tracking-wider ${
                        isSuperseded ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                        {d.gfc.status}
                    </span>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-700 font-medium">
                    <div>
                        <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-tight">Released On</span>
                        <span className="text-slate-900 font-bold">{formatDate(d.gfc.issuedAt)}</span>
                    </div>
                    <div>
                        <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-tight">Released By</span>
                        <span className="text-slate-900 font-bold truncate block">{d.gfc.issuedBy}</span>
                    </div>
                    <div>
                        <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-tight">BOQ Hash Ref</span>
                        <span className="text-slate-900 select-all font-mono bg-white px-2 py-0.5 rounded border border-slate-200 inline-block text-[11px] font-bold">
                            {(() => {
                                const rawRef = d.gfc.boqVersionRef;
                                if (!rawRef || rawRef === 'unknown_hash' || rawRef.startsWith('unknown')) {
                                    let hash = 0;
                                    const seed = d.id + projectId;
                                    for (let i = 0; i < seed.length; i++) {
                                        hash = (hash << 5) - hash + seed.charCodeAt(i);
                                        hash |= 0;
                                    }
                                    return 'BQ-' + Math.abs(hash).toString(16).toUpperCase().slice(0, 6);
                                }
                                return rawRef.startsWith('BQ-') ? rawRef : rawRef.substring(0, 8).toUpperCase();
                            })()}
                        </span>
                    </div>
                    <div>
                        <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-tight">Approval Reference</span>
                        <span className="text-slate-800 truncate block italic">
                            {d.gfc.clientApprovalRef ? `Round ${d.gfc.clientApprovalRef.roundNumber || d.currentRound} Approved` : 'Formal Client Signoff'}
                        </span>
                    </div>
                </div>
            </div>
        );
    };

    // Single Drawing Card Item
    const renderDrawingCard = (d: DrawingTrackerItem) => {
        const isApproved = d.approvedAt !== null;
        const isIssue = d.isGapFlagged;
        const isExpanded = expandedDrawingId === d.id;
        const commentsCount = d.comments?.length || 0;
        const status = statusOf(d);

        // Check if drawing has target date and if it is overdue
        const isOverdue = d.targetDate && !isApproved && new Date(d.targetDate).getTime() < Date.now();

        return (
            <div 
                key={d.id} 
                className={`bg-white border rounded-2xl overflow-hidden transition-all duration-200 shadow-2xs ${
                    isExpanded ? 'ring-2 ring-[#0066CC]/20 border-[#0066CC]/40' : 'border-slate-200/90 hover:border-slate-300'
                } ${isIssue ? 'border-l-4 border-l-rose-500 bg-rose-50/10' : ''}`}
            >
                <div className="p-4 sm:p-5 flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div 
                            onClick={() => handleToggleExpand(d.id)}
                            className="flex-1 min-w-0 cursor-pointer select-none"
                        >
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-extrabold text-slate-900 text-base">{d.name}</span>
                                
                                {(() => {
                                    const rNum = d.currentRound || 1;
                                    const isStale = rNum > 2;
                                    return (
                                        <span 
                                            className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md border inline-flex items-center gap-1 ${
                                                isStale 
                                                    ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                            }`}
                                            title={`Current Iteration: Round ${rNum}${isStale ? ' (Multiple Revisions / Stale)' : ''}`}
                                        >
                                            R{rNum}
                                        </span>
                                    );
                                })()}
                                
                                {d.priority === 'high' && (
                                    <span className="px-2 py-0.5 text-[9px] font-extrabold rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                                        High Priority
                                    </span>
                                )}

                                {d.targetDate && (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                                        isOverdue ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                                    }`}>
                                        <Calendar className="w-3 h-3 text-slate-400" />
                                        <span>Target: {d.targetDate}</span>
                                        {isOverdue && <span className="text-rose-600 font-extrabold">Overdue</span>}
                                    </span>
                                )}
                            </div>

                            <div className="text-xs text-slate-500 font-medium mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                    Triggers: {d.boqTriggers.join(', ')}
                                </span>
                                {d.companionOf && (() => {
                                    const found = drawings.find(other => other.id === d.companionOf);
                                    const displayCompanionName = found ? found.name : d.companionOf.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                                    return (
                                        <span className="text-slate-600 font-bold flex items-center gap-1 bg-sky-50 text-[#0066CC] px-2 py-0.5 rounded-md border border-sky-100">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Companion: {displayCompanionName}
                                        </span>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Round Indicators (R1, R2) */}
                        <div className="flex items-center gap-1.5 shrink-0" onClick={() => handleToggleExpand(d.id)}>
                            {[1, 2].map(r => {
                                let state = 'future';
                                const rData = d.rounds.find(rd => rd.roundNumber === r);
                                if (rData && (rData.status === 'approved' || (d.currentRound > r && rData.status !== 'not_started'))) state = 'completed';
                                else if (d.currentRound === r && rData && rData.status !== 'not_started' && !isApproved) state = 'active';

                                return (
                                    <div 
                                        key={r} 
                                        className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-extrabold ${
                                            state === 'completed' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 
                                            state === 'active' ? 'bg-blue-50 border-blue-300 text-blue-800' : 
                                            'bg-slate-50 border-slate-200 text-slate-400'
                                        }`}
                                    >
                                        R{r}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Status & Quick Actions Bar */}
                        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                            {/* Cloud CAD / Drive Link */}
                            {d.driveUrl ? (
                                <a 
                                    href={d.driveUrl.startsWith('http') ? d.driveUrl : `https://${d.driveUrl}`} 
                                    target="_blank" 
                                    rel="noreferrer noopener"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[#0066CC] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors shadow-2xs"
                                    title="Open attached CAD/PDF Blueprint"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>CAD/PDF</span>
                                </a>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingUrlDrawingId(d.id);
                                        setUrlInputVal('');
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                                    title="Attach CAD / Google Drive / Figma Link"
                                >
                                    <LinkIcon className="w-3 h-3 text-slate-400" />
                                    <span>+ Link</span>
                                </button>
                            )}

                            {commentsCount > 0 && (
                                <div 
                                    onClick={() => handleToggleExpand(d.id)}
                                    className="flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-200/80 cursor-pointer"
                                >
                                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                                    <span>{commentsCount}</span>
                                </div>
                            )}

                            {/* Quick Status Toggle */}
                            {(() => {
                                const currentQuickStatus = (isApproved || status === 'Approved' || status === 'GFC Issued')
                                    ? 'approved'
                                    : status === 'Site Hold'
                                    ? 'rejected'
                                    : 'pending';

                                return (
                                    <div 
                                        className="flex items-center bg-slate-100/90 p-0.5 rounded-lg border border-slate-200/90 shadow-2xs"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <button
                                            type="button"
                                            title="Mark as Pending / Client Review"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleQuickStatusChange(d, 'pending');
                                            }}
                                            className={`px-2 py-1 text-[10px] font-extrabold rounded-md transition-all cursor-pointer ${
                                                currentQuickStatus === 'pending'
                                                    ? 'bg-[#0066CC] text-white shadow-2xs'
                                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
                                            }`}
                                        >
                                            Pending
                                        </button>
                                        <button
                                            type="button"
                                            title="Quick Approve Drawing"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleQuickStatusChange(d, 'approved');
                                            }}
                                            className={`px-2 py-1 text-[10px] font-extrabold rounded-md transition-all cursor-pointer ${
                                                currentQuickStatus === 'approved'
                                                    ? 'bg-teal-600 text-white shadow-2xs'
                                                    : 'text-slate-500 hover:text-teal-700 hover:bg-slate-200/60'
                                            }`}
                                        >
                                            Approve
                                        </button>
                                        <button
                                            type="button"
                                            title="Quick Reject / Site Hold"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleQuickStatusChange(d, 'rejected');
                                            }}
                                            className={`px-2 py-1 text-[10px] font-extrabold rounded-md transition-all cursor-pointer ${
                                                currentQuickStatus === 'rejected'
                                                    ? 'bg-rose-600 text-white shadow-2xs'
                                                    : 'text-slate-500 hover:text-rose-700 hover:bg-slate-200/60'
                                            }`}
                                        >
                                            Reject
                                        </button>
                                    </div>
                                );
                            })()}

                            <div onClick={() => handleToggleExpand(d.id)} className="cursor-pointer">
                                {renderStatusBadge(status)}
                            </div>

                            {/* Edit & Delete Action Buttons (Owner role) */}
                            {isOwner && (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <button 
                                        type="button"
                                        title="Edit Drawing Details"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenEditDrawing(d);
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-[#0066CC] hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button 
                                        type="button"
                                        title="Delete Drawing"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDeletingDrawing(d);
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            <button 
                                type="button"
                                onClick={() => handleToggleExpand(d.id)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
                            >
                                {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-700" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                            </button>
                        </div>
                    </div>

                    {/* Quick CAD / Drive URL input popover */}
                    {editingUrlDrawingId === d.id && (
                        <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl flex items-center gap-2">
                            <LinkIcon className="w-4 h-4 text-[#0066CC] shrink-0" />
                            <input 
                                type="text"
                                placeholder="Paste Google Drive, AutoCAD, Figma, or Dropbox URL..."
                                value={urlInputVal}
                                onChange={e => setUrlInputVal(e.target.value)}
                                className="flex-1 bg-white border border-sky-200 rounded-lg px-3 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => handleSaveDriveUrl(d.id, urlInputVal)}
                                className="px-3 py-1 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold rounded-lg cursor-pointer transition-all"
                            >
                                Save Link
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditingUrlDrawingId(null)}
                                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Quick Target Date & Priority Edit Popover */}
                    {editingMetaDrawingId === d.id && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <span>Target Date:</span>
                                <input 
                                    type="date"
                                    value={targetDateInput}
                                    onChange={e => setTargetDateInput(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                                />
                            </div>

                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                <span>Priority:</span>
                                <select
                                    value={priorityInput}
                                    onChange={e => setPriorityInput(e.target.value as any)}
                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
                                >
                                    <option value="normal">Normal</option>
                                    <option value="high">High Priority</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-1.5 ml-auto">
                                <button
                                    type="button"
                                    onClick={() => handleSaveMetadata(d.id)}
                                    className="px-3 py-1 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold rounded-lg cursor-pointer transition-all"
                                >
                                    Save
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditingMetaDrawingId(null)}
                                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Card Expansion Detail Panel with Framer Motion */}
                <AnimatePresence initial={false}>
                    {isExpanded && (
                        <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden border-t border-slate-200/80 bg-slate-50/50"
                        >
                            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                                
                                {/* Left Column: Timeline & GFC issuance */}
                                <div className="lg:col-span-5 space-y-5">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Round Progression Timeline</h4>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenEditDrawing(d)}
                                                className="text-[11px] font-bold text-[#0066CC] hover:underline flex items-center gap-1 cursor-pointer"
                                            >
                                                <Edit3 className="w-3 h-3" />
                                                <span>Edit Drawing</span>
                                            </button>
                                            <span className="text-slate-300">·</span>
                                            <button
                                                type="button"
                                                onClick={() => setDeletingDrawing(d)}
                                                className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                                <span>Delete</span>
                                            </button>
                                        </div>
                                    </div>

                                    {renderTimeline(d)}

                                    {/* Issue GFC block if approved */}
                                    {isApproved && !d.gfc && (
                                        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl flex flex-col gap-3 shadow-2xs">
                                            <div className="text-xs font-medium text-slate-600 leading-relaxed">
                                                All design feedback is incorporated and drawing is formally approved. Ready to release GFC.
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    if (!designGateActive) {
                                                        const proceed = confirm(
                                                            `The Design Complete Gate has not been activated yet (meaning the BOQ is not frozen).\n\n` +
                                                            `Would you like to issue the GFC drawing early anyway?`
                                                        );
                                                        if (!proceed) return;
                                                    }
                                                    handleIssueGfc(d);
                                                }} 
                                                className={`w-full py-2.5 text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer ${
                                                    designGateActive 
                                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                                                        : 'bg-amber-600 hover:bg-amber-700 text-white'
                                                }`}
                                            >
                                                {designGateActive ? "Issue GFC Release" : "Issue GFC Release Early"}
                                            </button>
                                        </div>
                                    )}

                                    {/* Trigger round 3+ revision once GFC is released */}
                                    {isApproved && d.gfc && (
                                        <div>
                                            <button 
                                                type="button"
                                                onClick={() => setExpandedRevisionId(expandedRevisionId === d.id ? null : d.id)} 
                                                className="w-full py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 text-xs font-bold rounded-xl shadow-2xs transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
                                            >
                                                <Sparkles className="w-4 h-4 text-amber-500" />
                                                <span>Log Round 3+ Client Revision</span>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Right Column: Revisions, GFC, Notes & Comments */}
                                <div className="lg:col-span-7 space-y-5">
                                    {/* GFC Block status */}
                                    {d.gfc && renderGfcBlock(d)}

                                    {/* Lazy revision subcollection display */}
                                    {renderRevisionsSection(d)}

                                    <div className="h-px bg-slate-200/80" />

                                    {/* Live Comments Thread */}
                                    {renderCommentsSection(d)}

                                    {/* Manual Revision Panel */}
                                    {expandedRevisionId === d.id && (() => {
                                        const defaultCause = manualRevisionCause[d.id] || 'CLIENT_REVISION';
                                        const defaultAdvances = manualRevisionAdvances[d.id] !== undefined ? manualRevisionAdvances[d.id] : true;
                                        const defaultChargeable = manualRevisionChargeable[d.id] !== undefined ? manualRevisionChargeable[d.id] : (d.currentRound >= 2);
                                        const desc = manualRevisionDesc[d.id] || '';

                                        return (
                                            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs space-y-4 text-left">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                                                        <Edit3 className="w-4 h-4 text-[#0066CC]" />
                                                        <span>Log Drawing Revision</span>
                                                    </h4>
                                                    <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${d.currentRound >= 2 ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>
                                                        Round {d.currentRound + 1} — {d.currentRound >= 2 ? 'Chargeable' : 'Included'}
                                                    </span>
                                                </div>

                                                <div className="space-y-4">
                                                    {/* Description */}
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                                                            Revision Request / Change Description
                                                        </label>
                                                        <textarea
                                                            className="w-full border border-slate-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-[#0066CC] focus:outline-none font-medium text-slate-800"
                                                            rows={3}
                                                            placeholder="Describe the revision request, specific changes requested by client, or required adjustments..."
                                                            value={desc}
                                                            onChange={e => setManualRevisionDesc(prev => ({...prev, [d.id]: e.target.value}))}
                                                        />
                                                    </div>

                                                    {/* Cause/Reason selection */}
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                                                            Cause / Classification of Revision
                                                        </label>
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                            {[
                                                                { id: 'CLIENT_REVISION', label: 'Client Revision', desc: 'Requested by client after layout discussion' },
                                                                { id: 'FFDS_DESIGN_MISS', label: 'Design Correction', desc: 'Drafting error, layout issue, or design correction' },
                                                                { id: 'SITE_ADJUSTMENT', label: 'Site Adjustment', desc: 'On-site constraints or masonry dimension matches' }
                                                            ].map(opt => (
                                                                <button
                                                                    key={opt.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setManualRevisionCause(prev => ({ ...prev, [d.id]: opt.id as any }));
                                                                        // Auto set advances and chargeable for Client Revision
                                                                        if (opt.id === 'CLIENT_REVISION') {
                                                                            setManualRevisionAdvances(prev => ({ ...prev, [d.id]: true }));
                                                                            setManualRevisionChargeable(prev => ({ ...prev, [d.id]: d.currentRound >= 2 }));
                                                                        } else {
                                                                            setManualRevisionAdvances(prev => ({ ...prev, [d.id]: false }));
                                                                            setManualRevisionChargeable(prev => ({ ...prev, [d.id]: false }));
                                                                        }
                                                                    }}
                                                                    className={`p-3 rounded-xl border text-left transition-all ${
                                                                        defaultCause === opt.id 
                                                                            ? 'border-[#0066CC] bg-sky-50/50 text-[#0066CC] ring-1 ring-[#0066CC]' 
                                                                            : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                                                                    }`}
                                                                >
                                                                    <div className="font-bold text-xs">{opt.label}</div>
                                                                    <div className={`text-[10px] mt-1 font-medium leading-tight ${defaultCause === opt.id ? 'text-sky-700' : 'text-slate-400'}`}>
                                                                        {opt.desc}
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Checkboxes / Toggles */}
                                                    <div className="flex flex-wrap gap-4 pt-1">
                                                        <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200/80 px-3 py-2 rounded-xl text-slate-700">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded text-[#0066CC] focus:ring-[#0066CC] w-4 h-4 cursor-pointer"
                                                                checked={defaultAdvances}
                                                                onChange={e => setManualRevisionAdvances(prev => ({ ...prev, [d.id]: e.target.checked }))}
                                                            />
                                                            <span className="text-xs font-bold">Increment Round Count (Create R{d.currentRound + 1})</span>
                                                        </label>

                                                        <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200/80 px-3 py-2 rounded-xl text-slate-700">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded text-[#0066CC] focus:ring-[#0066CC] w-4 h-4 cursor-pointer"
                                                                checked={defaultChargeable}
                                                                onChange={e => setManualRevisionChargeable(prev => ({ ...prev, [d.id]: e.target.checked }))}
                                                            />
                                                            <span className="text-xs font-bold">Mark as Chargeable Revision</span>
                                                        </label>
                                                    </div>

                                                    {/* Form Actions */}
                                                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                                        <button 
                                                            type="button"
                                                            onClick={() => setExpandedRevisionId(null)}
                                                            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleLogRevisionManual(
                                                                d,
                                                                desc,
                                                                defaultCause,
                                                                defaultChargeable,
                                                                defaultAdvances
                                                            )}
                                                            className="px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white font-bold text-xs rounded-xl transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
                                                        >
                                                            <Check className="w-3.5 h-3.5" />
                                                            <span>Log Revision</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                                </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    if (loading) return (
        <div className="p-12 text-center text-slate-500 font-medium flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#0066CC]" />
            <span>Loading Drawing Pipeline...</span>
        </div>
    );

    return (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 text-left">
            
            {/* Header Status & View Controls Combined Hero Banner */}
            <div className={`p-4 sm:p-5 rounded-2xl border shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                !designGateActive 
                    ? 'bg-amber-50/50 border-amber-200/80' 
                    : 'bg-white border-slate-200/90'
            }`}>
                {/* Left Side: Gate Status & Guidance Text */}
                <div className="flex items-start gap-3.5">
                    <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                        !designGateActive 
                            ? 'bg-amber-100/80 text-amber-700' 
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                    }`}>
                        {!designGateActive ? (
                            <Sparkles className="w-5 h-5" />
                        ) : (
                            <ShieldCheck className="w-5 h-5" />
                        )}
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-slate-900 text-sm">
                                {!designGateActive 
                                    ? "Design Phase Active — Prepare & Approve Drawings" 
                                    : "Design Complete Gate Locked — GFC Blueprint Registry"}
                            </h4>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                !designGateActive 
                                    ? 'bg-amber-100 text-amber-900 border-amber-300' 
                                    : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            }`}>
                                {!designGateActive ? "Stage 4 Active" : "GFC Locked"}
                            </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed font-medium max-w-2xl">
                            {!designGateActive 
                                ? "Use the Drawing Tracker to issue layouts and obtain client sign-offs. Once key drawings are approved, activate the Design Complete Gate to lock the BOQ and release GFC drawings."
                                : "All drawings are baseline locked. Revisions are versioned with change classification and client sign-off audit trail."}
                        </p>
                    </div>
                </div>

                {/* Right Side: Quick Export Controls & View Switcher */}
                <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-center shrink-0">
                    <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
                        <button
                            type="button"
                            onClick={handleExportCSV}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-all cursor-pointer"
                            title="Export drawing status report as CSV"
                        >
                            <Download className="w-3.5 h-3.5 text-[#0066CC]" />
                            <span>CSV</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleCopyWhatsAppDigest}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-all cursor-pointer"
                            title="Copy formatted WhatsApp status update to clipboard"
                        >
                            <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>WhatsApp</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowPrintModal(true)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-all cursor-pointer"
                            title="Print / PDF Blueprint Release Matrix with Sign-off"
                        >
                            <Printer className="w-3.5 h-3.5 text-slate-600" />
                            <span>Print Matrix</span>
                        </button>
                    </div>

                    {/* Owner / Designer Role Switcher */}
                    <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
                        <button 
                            onClick={() => setUserRole('owner')} 
                            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${userRole === 'owner' ? 'bg-[#0066CC] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Owner View
                        </button>
                        <button 
                            onClick={() => setUserRole('designer')} 
                            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${userRole === 'designer' ? 'bg-[#0066CC] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Designer View
                        </button>
                    </div>
                </div>
            </div>

            {/* Batch GFC Release Notification Banner if any drawings are ready */}
            {readyForGfcCount > 0 && isOwner && (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
                    <div className="flex items-start gap-3">
                        <Zap className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-extrabold text-emerald-950 text-sm">
                                {readyForGfcCount} Approved Drawing{readyForGfcCount > 1 ? 's' : ''} Ready for GFC Release
                            </h4>
                            <p className="text-xs text-emerald-800 font-semibold mt-0.5">
                                Client feedback has been approved. You can issue Good-For-Construction release tokens for site execution.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleBatchIssueGfc}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Issue All Approved GFCs</span>
                    </button>
                </div>
            )}

            {/* KPI Metrics Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
                {[
                    { label: "Total Drawings", val: stats.total, color: "text-slate-900", desc: "Sync triggers active", icon: Layers },
                    { label: "Approved", val: stats.approved, color: "text-emerald-700", desc: "Ready for GFC release", icon: CheckCircle2 },
                    { label: "In Client Review", val: stats.inReview, color: "text-blue-700", desc: "Awaiting approval", icon: Clock },
                    { label: "GFC Issued", val: stats.gfcIssued, color: "text-amber-700", desc: "Released to site", icon: ShieldCheck },
                    { label: "Flagged Issues", val: stats.issues, color: "text-rose-700", desc: "Gaps blocking gates", icon: FileWarning }
                ].map((kpi, idx) => (
                    <div key={idx} className="bg-white border border-slate-200/90 p-4 rounded-2xl shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{kpi.label}</span>
                            <kpi.icon className={`w-4 h-4 ${kpi.color} opacity-80`} />
                        </div>
                        <div className={`mt-2 ${kpi.color}`}>
                            <AnimatedNumber value={kpi.val} />
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 font-medium">{kpi.desc}</span>
                    </div>
                ))}
            </div>

            {/* Gap Warning Banner (Owner only) */}
            {isOwner && issues.length > 0 && (
                <div className="bg-rose-50/70 border border-rose-200/90 p-4 rounded-2xl shadow-2xs flex items-start gap-3.5">
                    <FileWarning className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-bold text-rose-950 text-sm mb-0.5">{issues[0].name} Not Issued — Blocks Design Gate</h4>
                        <p className="text-rose-800 text-xs font-semibold leading-relaxed">
                            BOQ contains <strong>{issues.map(i => i.boqTriggers.join(', ')).join(' | ')}</strong>. Please issue before this gate can be activated.
                        </p>
                    </div>
                </div>
            )}

            {/* Scope Tracker Badge Track */}
            <div className="flex flex-wrap items-center gap-2 p-2.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 shrink-0">
                    Active BOQ Scopes:
                </div>
                {scopeChips.map((chip, i) => (
                    <span key={i} className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-xl border ${
                        chip.isHealthy ? 'bg-emerald-50 text-emerald-800 border-emerald-200/60' : 'bg-rose-50 text-rose-800 border-rose-200/60'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${chip.isHealthy ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span>{chip.label}</span>
                        <span className="text-[10px] opacity-70">({chip.count})</span>
                    </span>
                ))}
            </div>

            {/* Filter and Actions Toolbar */}
            <div className="bg-white p-4 border border-slate-200/90 rounded-2xl shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Filter Pills */}
                <div className="flex flex-wrap gap-1.5">
                    {['All', 'Action Required', 'Not Started', 'Client Review', 'Approved', 'GFC Issued', 'Missing'].map((pill) => {
                        const isActive = filter === pill;
                        return (
                            <button
                                key={pill}
                                onClick={() => setFilter(pill)}
                                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                                    isActive 
                                        ? 'bg-[#0066CC] text-white border-[#0066CC] shadow-2xs' 
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                {pill}
                            </button>
                        );
                    })}
                </div>
                
                {/* View Mode Toggle, Search & Actions */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* View Mode Toggle: Flat List vs Grouped by Scope */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'list' ? 'bg-white text-[#0066CC] shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                            title="Flat List View"
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('grouped')}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'grouped' ? 'bg-white text-[#0066CC] shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                            title="Group by Scope / Trade"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="relative flex-1 sm:w-56">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input 
                            type="text"
                            placeholder="Search drawings..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0066CC] font-medium"
                        />
                    </div>

                    {isOwner && (
                        <div className="flex items-center gap-2 relative">
                            <button 
                                onClick={handleSync} 
                                disabled={syncing} 
                                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shrink-0"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> 
                                <span>Sync BOQ</span>
                            </button>
                            <button 
                                onClick={() => setShowAddDrawing(!showAddDrawing)}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#0066CC] hover:bg-[#0055B3] text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0"
                            >
                                <Plus className="w-3.5 h-3.5" /> 
                                <span>Add Drawing</span>
                            </button>
                            {showAddDrawing && (
                                <div className="absolute top-full right-0 mt-2 w-88 bg-white border border-slate-200 p-4 rounded-2xl shadow-xl z-50 text-left">
                                    <div className="flex items-center justify-between mb-2.5">
                                        <h4 className="text-xs font-bold text-slate-900">Add New Drawing</h4>
                                        <button onClick={() => setShowAddDrawing(false)} className="text-slate-400 hover:text-slate-600">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="space-y-2.5 mb-3">
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Drawing Name / Code</label>
                                            <input 
                                                type="text" 
                                                placeholder="e.g. Partition Layout - Living Room" 
                                                className="w-full text-xs border border-slate-200 rounded-xl p-2.5 focus:ring-2 focus:ring-[#0066CC] focus:outline-none font-medium text-slate-800"
                                                value={newDrawingName}
                                                onChange={e => setNewDrawingName(e.target.value)}
                                                autoFocus
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Room / Zone</label>
                                            <input 
                                                type="text" 
                                                placeholder="e.g. Living Room, Master Bedroom, Kitchen" 
                                                className="w-full text-xs border border-slate-200 rounded-xl p-2.5 focus:ring-2 focus:ring-[#0066CC] focus:outline-none font-medium text-slate-800"
                                                value={newDrawingRoom}
                                                onChange={e => setNewDrawingRoom(e.target.value)}
                                                list="existing-rooms-list"
                                            />
                                            <datalist id="existing-rooms-list">
                                                {uniqueRooms.map(r => (
                                                    <option key={r} value={r} />
                                                ))}
                                            </datalist>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Scope Category</label>
                                            <input 
                                                type="text" 
                                                placeholder="Category Tag (e.g. Carpentry, Electrical, Civil)" 
                                                className="w-full text-xs border border-slate-200 rounded-xl p-2.5 focus:ring-2 focus:ring-[#0066CC] focus:outline-none font-medium text-slate-800"
                                                value={newDrawingTrigger}
                                                onChange={e => setNewDrawingTrigger(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                        <button onClick={() => setShowAddDrawing(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer">Cancel</button>
                                        <button onClick={handleAddDrawing} className="px-4 py-1.5 text-xs font-bold text-white bg-[#0066CC] hover:bg-[#0055B3] rounded-lg cursor-pointer">Add Drawing</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* List of Drawings: Flat List View vs Grouped by Scope View */}
            {viewMode === 'list' ? (
                <div className="space-y-3.5">
                    {filteredDrawings.map(d => renderDrawingCard(d))}

                    {filteredDrawings.length === 0 && (
                        <LockedState
                            isEmptyState={true}
                            title="No Drawings Found"
                            why="No drawings matched your current search filters or BOQ triggers."
                            actionLabel={syncing ? "Syncing..." : "Sync with BOQ"}
                            onAction={handleSync}
                        />
                    )}
                </div>
            ) : (
                /* Grouped by Room View */
                <div className="space-y-6">
                    {uniqueRooms.map(roomKey => {
                        const roomDrawings = filteredDrawings.filter(d => (d.roomName || 'General / Project-Wide') === roomKey);
                        if (roomDrawings.length === 0) return null;

                        const triggerApprovedCount = roomDrawings.filter(d => d.approvedAt !== null).length;
                        const triggerGfcCount = roomDrawings.filter(d => d.gfc?.status === 'issued').length;
                        const progressPct = Math.round((triggerApprovedCount / roomDrawings.length) * 100);

                        return (
                            <div key={roomKey} className="space-y-3">
                                <div className="flex items-center justify-between bg-slate-100/80 p-3 px-4 rounded-xl border border-slate-200/80">
                                    <div className="flex items-center gap-2.5">
                                        <span className="font-extrabold text-sm text-slate-900">
                                            {roomKey}
                                        </span>
                                        <span className="bg-white border border-slate-200 text-slate-600 text-[11px] font-bold px-2 py-0.5 rounded-full shadow-2xs">
                                            {roomDrawings.length} drawing{roomDrawings.length > 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-3 text-xs font-semibold text-slate-600">
                                        <span className="text-emerald-700 font-bold">{triggerGfcCount} GFC Released</span>
                                        <div className="w-24 bg-slate-200 h-2 rounded-full overflow-hidden hidden sm:block">
                                            <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                                        </div>
                                        <span className="text-[11px] font-bold text-slate-500">{progressPct}%</span>
                                    </div>
                                </div>

                                <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-slate-200">
                                    {roomDrawings.map(d => renderDrawingCard(d))}
                                </div>
                            </div>
                        );
                    })}

                    {filteredDrawings.length === 0 && (
                        <LockedState
                            isEmptyState={true}
                            title="No Drawings Found"
                            why="No drawings matched your current search filters or BOQ triggers."
                            actionLabel={syncing ? "Syncing..." : "Sync with BOQ"}
                            onAction={handleSync}
                        />
                    )}
                </div>
            )}

            {/* Printable Blueprint Signoff Matrix Modal */}
            {showPrintModal && (
                <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
                    <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto text-left">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                            <div>
                                <h3 className="text-xl font-extrabold text-slate-900">{studioName} — Blueprint Status & Sign-off Matrix</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Formal GFC Blueprint Release & Client Handshake Register</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
                                >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>Print / Save PDF</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowPrintModal(false)}
                                    className="p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Document Meta Header */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                            <div>
                                <span className="text-slate-400 font-bold block uppercase text-[10px]">Project</span>
                                <span className="font-extrabold text-slate-900">{projectContext.name || 'Interior Design Project'}</span>
                            </div>
                            <div>
                                <span className="text-slate-400 font-bold block uppercase text-[10px]">Configuration & Area</span>
                                <span className="font-extrabold text-slate-900">{projectContext.config || 'N/A'} • {projectContext.area || 0} sq.ft</span>
                            </div>
                            <div>
                                <span className="text-slate-400 font-bold block uppercase text-[10px]">Client Name</span>
                                <span className="font-extrabold text-slate-900">{projectContext.clientName || 'Valued Client'}</span>
                            </div>
                            <div>
                                <span className="text-slate-400 font-bold block uppercase text-[10px]">Date Issued</span>
                                <span className="font-extrabold text-slate-900">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                            </div>
                        </div>

                        {/* Drawing Table */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                                        <th className="p-3">#</th>
                                        <th className="p-3">Drawing Name</th>
                                        <th className="p-3">Scope / Category</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3">Round</th>
                                        <th className="p-3">Approved On</th>
                                        <th className="p-3">GFC Hash Ref</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                                    {drawings.map((d, i) => (
                                        <tr key={d.id} className="hover:bg-slate-50/50">
                                            <td className="p-3 text-slate-400 font-bold">{i + 1}</td>
                                            <td className="p-3 font-bold text-slate-900">{d.name}</td>
                                            <td className="p-3 text-slate-600">{d.boqTriggers.join(', ')}</td>
                                            <td className="p-3">{renderStatusBadge(statusOf(d))}</td>
                                            <td className="p-3 font-bold">R{d.currentRound || 0}</td>
                                            <td className="p-3 text-slate-600">{formatDate(d.approvedAt)}</td>
                                            <td className="p-3 font-mono font-bold text-slate-900">{d.gfc?.boqVersionRef || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Signoff Signature Boxes */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-slate-200 text-xs">
                            <div className="space-y-8 border border-slate-200 p-4 rounded-xl">
                                <span className="font-extrabold text-slate-800 block text-xs">Lead Architect / Designer</span>
                                <div className="border-b border-dashed border-slate-300 pt-6" />
                                <div className="text-[10px] text-slate-400">Signature & Date</div>
                            </div>
                            <div className="space-y-8 border border-slate-200 p-4 rounded-xl">
                                <span className="font-extrabold text-slate-800 block text-xs">Client Representative</span>
                                <div className="border-b border-dashed border-slate-300 pt-6" />
                                <div className="text-[10px] text-slate-400">Signature & Date</div>
                            </div>
                            <div className="space-y-8 border border-slate-200 p-4 rounded-xl">
                                <span className="font-extrabold text-slate-800 block text-xs">Site Project Manager</span>
                                <div className="border-b border-dashed border-slate-300 pt-6" />
                                <div className="text-[10px] text-slate-400">Signature & Date</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Drawing Modal */}
            {editingDrawing && (
                <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
                    <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-left animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-sky-50 text-[#0066CC] rounded-xl">
                                    <Edit3 className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-slate-900">Edit Drawing Details</h3>
                                    <p className="text-xs text-slate-500 font-medium">Update title, room allocation, scope triggers, and CAD attachments</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingDrawing(null)}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs font-medium">
                            {/* Drawing Title */}
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                    Drawing Name / Code <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g. Master Bedroom Wardrobe Elevation"
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC] text-slate-900 font-bold"
                                />
                            </div>

                            {/* Room / Zone Selection */}
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                    Room / Location Zone
                                </label>
                                <input
                                    type="text"
                                    value={editForm.roomName}
                                    onChange={e => setEditForm(prev => ({ ...prev, roomName: e.target.value }))}
                                    placeholder="e.g. Master Bedroom, Living Room, Kitchen"
                                    list="edit-modal-rooms-list"
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC] text-slate-800"
                                />
                                <datalist id="edit-modal-rooms-list">
                                    {uniqueRooms.map(r => (
                                        <option key={r} value={r} />
                                    ))}
                                </datalist>
                                {uniqueRooms.length > 1 && (
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                        {uniqueRooms.slice(0, 5).map(r => (
                                            <button
                                                key={r}
                                                type="button"
                                                onClick={() => setEditForm(prev => ({ ...prev, roomName: r }))}
                                                className={`text-[10px] px-2 py-0.5 rounded-md font-semibold transition-all ${
                                                    editForm.roomName === r 
                                                        ? 'bg-[#0066CC] text-white' 
                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Scope Categories / BOQ Triggers */}
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                    Scope Categories / BOQ Triggers (comma-separated)
                                </label>
                                <input
                                    type="text"
                                    value={editForm.boqTriggers}
                                    onChange={e => setEditForm(prev => ({ ...prev, boqTriggers: e.target.value }))}
                                    placeholder="e.g. Carpentry, Electrical, False Ceiling"
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC] text-slate-800"
                                />
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {['Carpentry', 'Electrical', 'Plumbing', 'False Ceiling', 'Civil', 'HVAC', 'Finishes'].map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => {
                                                const current = editForm.boqTriggers.split(',').map(t => t.trim()).filter(Boolean);
                                                if (!current.includes(tag)) {
                                                    const updated = [...current, tag].join(', ');
                                                    setEditForm(prev => ({ ...prev, boqTriggers: updated }));
                                                }
                                            }}
                                            className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-semibold cursor-pointer"
                                        >
                                            + {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Priority & Target Date */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                        Priority
                                    </label>
                                    <select
                                        value={editForm.priority}
                                        onChange={e => setEditForm(prev => ({ ...prev, priority: e.target.value as any }))}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC] text-slate-800 font-semibold"
                                    >
                                        <option value="normal">Normal</option>
                                        <option value="high">High Priority</option>
                                        <option value="low">Low Priority</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                        Target Date
                                    </label>
                                    <input
                                        type="date"
                                        value={editForm.targetDate}
                                        onChange={e => setEditForm(prev => ({ ...prev, targetDate: e.target.value }))}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC] text-slate-800"
                                    />
                                </div>
                            </div>

                            {/* CAD / Cloud Drive Blueprint Link */}
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                    CAD / Google Drive / Cloud Blueprint Link
                                </label>
                                <div className="relative">
                                    <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="url"
                                        value={editForm.driveUrl}
                                        onChange={e => setEditForm(prev => ({ ...prev, driveUrl: e.target.value }))}
                                        placeholder="https://drive.google.com/..."
                                        className="w-full pl-8 pr-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC] text-slate-800"
                                    />
                                </div>
                            </div>

                            {/* Mandatory Gate Requirement */}
                            <label className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={editForm.isMandatory}
                                    onChange={e => setEditForm(prev => ({ ...prev, isMandatory: e.target.checked }))}
                                    className="w-4 h-4 text-[#0066CC] rounded focus:ring-[#0066CC] cursor-pointer"
                                />
                                <div>
                                    <div className="font-bold text-slate-900 text-xs">Mandatory Gate Item</div>
                                    <div className="text-[10px] text-slate-500 font-normal">Must be formally approved by client before activating Design Complete Gate</div>
                                </div>
                            </label>
                        </div>

                        {/* Modal Action Buttons */}
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => {
                                    const drawingToDelete = editingDrawing;
                                    setEditingDrawing(null);
                                    setDeletingDrawing(drawingToDelete);
                                }}
                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete Drawing</span>
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingDrawing(null)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveDrawingEdit}
                                    disabled={!editForm.name.trim()}
                                    className="px-5 py-2 text-xs font-bold text-white bg-[#0066CC] hover:bg-[#0055B3] rounded-xl transition-all shadow-2xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                                >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Save Changes</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletingDrawing && (
                <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
                    <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-left animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-start gap-3">
                            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                                <Trash2 className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-extrabold text-slate-900">Delete Drawing?</h3>
                                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                    Are you sure you want to delete <strong className="text-slate-900 font-bold">"{deletingDrawing.name}"</strong>?
                                </p>
                                <p className="text-[11px] text-rose-600 font-medium mt-1.5 bg-rose-50/70 p-2.5 rounded-lg border border-rose-100">
                                    This action will remove the drawing, its revision history, and associated comments from this project.
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setDeletingDrawing(null)}
                                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDeleteDrawing(deletingDrawing)}
                                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete Drawing</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Toast Alert Banner */}
            {toast && toast.visible && (
                <div 
                    id="toast-notification-banner"
                    className={`fixed top-5 right-5 z-[100] max-w-sm w-full p-4 rounded-2xl border shadow-xl flex items-start gap-3 ${
                        toast.type === 'success' ? 'bg-[#f0fdf4] border-[#bbf7d0] text-[#15803d]' :
                        toast.type === 'warning' ? 'bg-[#fffbeb] border-[#fde68a] text-[#b45309]' :
                        toast.type === 'error' ? 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]' :
                        'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                >
                    {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
                    {toast.type === 'warning' && <AlertCircle className="w-5 h-5 shrink-0" />}
                    {toast.type === 'error' && <FileWarning className="w-5 h-5 shrink-0" />}
                    {toast.type === 'info' && <AlertCircle className="w-5 h-5 shrink-0" />}
                    
                    <div className="flex-1">
                        <h4 className="font-extrabold text-[13px] uppercase tracking-wider mb-0.5">
                            {toast.type === 'success' ? 'Success Notification' :
                             toast.type === 'warning' ? 'Warning Alert' :
                             toast.type === 'error' ? 'Error Action Required' : 'Engine Message'}
                        </h4>
                        <p className="text-xs leading-relaxed font-bold opacity-90">{toast.message}</p>
                    </div>
                    
                    <button 
                        onClick={() => setToast(prev => prev ? { ...prev, visible: false } : null)}
                        className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 -mt-1 p-1 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Operational Event Hub */}
            <div className="mt-8">
                <button 
                    onClick={() => setIsLogsExpanded(!isLogsExpanded)}
                    className="w-full py-3 px-4 rounded-2xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 transition-all flex items-center justify-between text-xs font-bold shadow-2xs cursor-pointer"
                >
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="text-slate-800 font-extrabold tracking-tight">Operational Activity & Audit Feed</span>
                        <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full border border-slate-200 font-bold">
                            {logs.length} logs
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                        <span className="text-xs font-semibold">{isLogsExpanded ? "Hide Logs" : "Expand Logs"}</span>
                        {isLogsExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                    </div>
                </button>

                {isLogsExpanded && (
                    <div className="bg-slate-50 border border-slate-200/90 border-t-0 rounded-b-2xl p-5 shadow-inner -mt-2">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
                            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                                System Audit Trail (Current Project Execution Session)
                            </span>
                            <button 
                                onClick={() => setLogs([
                                    { id: 'clear-1', timestamp: Date.now(), type: 'info', message: 'Clear log action executed. Resetting log history stream.' }
                                ])}
                                className="text-[10px] bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-bold transition-all shadow-2xs cursor-pointer"
                            >
                                Clear Events
                            </button>
                        </div>
                        <div className="space-y-2 max-h-[160px] overflow-y-auto">
                            {logs.map((log) => (
                                <div key={log.id} className="flex gap-3 text-xs leading-relaxed items-start text-left">
                                    <span className="text-slate-400 font-semibold select-none font-mono text-[10px] pt-0.5">
                                        [{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
                                    </span>
                                    <span className={`font-black shrink-0 uppercase text-[9px] tracking-wider px-1.5 py-0.5 rounded border ${
                                        log.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                        log.type === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                        log.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                        'bg-blue-50 text-blue-700 border-blue-200'
                                    }`}>
                                        {log.type}
                                    </span>
                                    <span className="text-slate-700 font-medium flex-1">
                                        {log.message}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
